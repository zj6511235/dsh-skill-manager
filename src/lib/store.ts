/**
 * The on-disk skill store and the install engine.
 *
 * Layout (all under `~/.dsh/skills_store` by default):
 *   index.json            installed entries and their enable state
 *   skills/<id>/          extracted skill package
 *   logs/<id>.log         dependency-install output (redacted)
 *   cache/                downloaded archives
 *   trash/                replaced/removed packages awaiting deletion
 *   .tmp/                 staging for one install
 *
 * Every mutation takes a lock file; the index is replaced atomically. A
 * failure leaves the previous installed version untouched.
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  closeSync,
  writeSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { SkillManagerError, errorMessage } from './errors.js'
import { isInside, toStoreId } from './safe-path.js'
import { classifySource } from './source.js'
import { downloadSkillhub } from './skillhub.js'
import { extractTar } from './tar.js'
import { extractZip } from './zip.js'
import { parsePackage, unwrapSingleRoot } from './manifest.js'
import { runProcess, redactSecrets } from './process.js'
import { scanExternalSkills, knownSkillRoots } from './external.js'
import {
  isKnownMcpFile,
  knownMcpConfigs,
  mcpRefKey,
  mcpRefStoreId,
  normalizeServerSpec,
  resolveMcpRef,
  scanExternalMcp,
} from './mcp-scan.js'
import type {
  ExternalMcpCandidate,
  ExternalSkillCandidate,
  InstallOptions,
  InstallResult,
  InstalledSkill,
  LinkBatchResult,
  McpPlatformScan,
  McpRef,
  McpSpec,
  PlatformScan,
  SourceSpec,
  StoreIndex,
} from './types.js'

export const INDEX_VERSION = 1
const LOCK_STALE_MS = 15 * 60 * 1000
const LOCK_WAIT_MS = 30_000
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
const COPY_SKIP = new Set(['node_modules', '.git', '.venv', 'venv', '__pycache__', '.cache', 'dist', 'build'])

export interface StoreOptions {
  /** Override the store root (tests, or a second isolated store). */
  dir?: string
  home?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
}

function nowIso(): string {
  return new Date().toISOString()
}

function defaultStoreDir(home: string, env: NodeJS.ProcessEnv): string {
  const override = env.DSH_SKILL_STORE
  if (typeof override === 'string' && override.trim().length > 0) return resolve(override.trim())
  return join(home, '.dsh', 'skills_store')
}

function emptyIndex(): StoreIndex {
  return { version: INDEX_VERSION, revision: 0, skills: {} }
}

function readMagic(file: string): Buffer {
  try {
    return readFileSync(file).subarray(0, 4)
  } catch {
    return Buffer.alloc(0)
  }
}

/** Windows often holds a just-written pip/npm file for a moment; retry briefly. */
function rmDir(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch {
    /* a leftover temp directory must not fail the install */
  }
}

export class SkillStore {
  readonly dir: string
  readonly skillsDir: string
  readonly logsDir: string
  readonly cacheDir: string
  readonly trashDir: string
  readonly tmpDir: string
  readonly indexPath: string
  readonly home: string
  readonly cwd: string
  private readonly env: NodeJS.ProcessEnv

  constructor(options: StoreOptions = {}) {
    this.home = options.home ?? homedir()
    this.cwd = options.cwd ?? process.cwd()
    this.env = options.env ?? process.env
    this.dir = resolve(options.dir ?? defaultStoreDir(this.home, this.env))
    this.skillsDir = join(this.dir, 'skills')
    this.logsDir = join(this.dir, 'logs')
    this.cacheDir = join(this.dir, 'cache')
    this.trashDir = join(this.dir, 'trash')
    this.tmpDir = join(this.dir, '.tmp')
    this.indexPath = join(this.dir, 'index.json')
  }

  /** Create the layout once; safe to call from every operation. */
  ensureLayout(): void {
    for (const dir of [this.dir, this.skillsDir, this.logsDir, this.cacheDir, this.trashDir, this.tmpDir]) {
      mkdirSync(dir, { recursive: true })
    }
  }

  logPath(id: string): string {
    return join(this.logsDir, `${id}.log`)
  }

  /** Read the index, creating an empty one when the store is new. */
  readIndex(): StoreIndex {
    this.ensureLayout()
    if (!existsSync(this.indexPath)) return emptyIndex()
    let text: string
    try {
      text = readFileSync(this.indexPath, 'utf8')
    } catch (error) {
      throw new SkillManagerError('permission', `无法读取存储索引：${errorMessage(error)}`)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new SkillManagerError('invalid-manifest', `存储索引 index.json 已损坏，未做任何改动。路径：${this.indexPath}`)
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new SkillManagerError('invalid-manifest', '存储索引格式不正确')
    }
    const record = parsed as Partial<StoreIndex>
    if (record.version !== INDEX_VERSION || typeof record.skills !== 'object' || record.skills === null) {
      throw new SkillManagerError('invalid-manifest', '存储索引版本不受支持')
    }
    return {
      version: INDEX_VERSION,
      revision: typeof record.revision === 'number' ? record.revision : 0,
      skills: record.skills,
    }
  }

  /** Atomically replace the index. */
  writeIndex(index: StoreIndex): void {
    this.ensureLayout()
    index.revision += 1
    const text = `${JSON.stringify(index, null, 2)}\n`
    const tmp = `${this.indexPath}.${String(process.pid)}.tmp`
    writeFileSync(tmp, text, 'utf8')
    try {
      renameSync(tmp, this.indexPath)
    } catch {
      // Windows occasionally refuses to replace an open file; retry after a
      // short removal. The index is small and re-read under the lock.
      try {
        rmSync(this.indexPath, { force: true })
        renameSync(tmp, this.indexPath)
      } catch (error) {
        rmSync(tmp, { force: true })
        throw new SkillManagerError('permission', `无法写入存储索引：${errorMessage(error)}`)
      }
    }
  }

  list(): InstalledSkill[] {
    const index = this.readIndex()
    return Object.values(index.skills).sort((left, right) => left.id.localeCompare(right.id))
  }

  get(id: string): InstalledSkill | undefined {
    return this.readIndex().skills[toStoreId(id)]
  }

  /** Public log tail for the panel; output is already redacted on write. */
  readLog(id: string, maxBytes = 64 * 1024): string {
    const path = this.logPath(toStoreId(id))
    if (!existsSync(path)) return ''
    try {
      const text = readFileSync(path, 'utf8')
      return text.length > maxBytes ? text.slice(text.length - maxBytes) : text
    } catch {
      return ''
    }
  }

  private async acquireLock(): Promise<() => void> {
    this.ensureLayout()
    const lockPath = join(this.dir, '.lock')
    const deadline = Date.now() + LOCK_WAIT_MS
    for (;;) {
      try {
        const fd = openSync(lockPath, 'wx')
        writeSync(fd, JSON.stringify({ pid: process.pid, at: nowIso() }))
        closeSync(fd)
        return () => {
          try {
            unlinkSync(lockPath)
          } catch {
            /* already released */
          }
        }
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code !== 'EEXIST') {
          throw new SkillManagerError('permission', `无法创建存储锁：${errorMessage(error)}`)
        }
        try {
          if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) {
            unlinkSync(lockPath)
            continue
          }
        } catch {
          continue
        }
        if (Date.now() > deadline) {
          throw new SkillManagerError('busy', '另一个安装/卸载操作正在进行，请稍后再试')
        }
        // Yield to the event loop: a Host install must not freeze the UI.
        await new Promise<void>((resolve) => setTimeout(resolve, 200))
      }
    }
  }

  /** Install from any supported source string. */
  async install(source: string, options: InstallOptions = {}): Promise<InstallResult> {
    this.ensureLayout()
    const spec = classifySource(source, this.cwd)
    if (options.ref !== undefined && options.ref.length > 0) spec.ref = options.ref
    const release = await this.acquireLock()
    const stage = mkdtempSync(join(this.tmpDir, 'install-'))
    try {
      const fetched = await this.fetch(spec, stage)
      const packageRoot = unwrapSingleRoot(fetched)
      if (!isInside(stage, packageRoot)) throw new SkillManagerError('invalid-manifest', '安装包路径越界')
      return await this.commit(packageRoot, spec, options)
    } finally {
      release()
      rmDir(stage)
    }
  }

  /** Use one skill where another agent already installed it, without copying. */
  async linkExternal(path: string, options: InstallOptions = {}): Promise<InstallResult> {
    const batch = await this.linkMany([path], options)
    return batch.entries[0]!
  }

  /**
   * Use several external skill directories in one transaction. All paths are
   * validated before the index changes, so a batch either links completely or
   * leaves the store untouched. Duplicate skill names are skipped with a
   * warning (the same skill often exists in several agents).
   */
  async linkMany(paths: readonly string[], options: InstallOptions = {}): Promise<LinkBatchResult> {
    this.ensureLayout()
    if (paths.length === 0) throw new SkillManagerError('invalid-source', '没有选择任何技能')
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const entries: InstallResult[] = []
      const warnings: string[] = []
      const planned: Array<{ id: string; entry: InstalledSkill }> = []
      const seen = new Set<string>()
      for (const raw of paths) {
        const source = resolve(raw)
        let isDirectory = false
        try {
          isDirectory = existsSync(source) && statSync(source).isDirectory()
        } catch {
          isDirectory = false
        }
        // One broken folder must never abort a select-all batch: skip it and
        // record why, so every valid sibling still gets referenced.
        if (!isDirectory) {
          warnings.push(`跳过（目录不存在）：${raw}`)
          continue
        }
        if (!existsSync(join(source, 'SKILL.md')) && !existsSync(join(source, 'manifest.json'))) {
          warnings.push(`跳过（缺少 SKILL.md）：${raw}`)
          continue
        }
        if (isInside(this.dir, source)) {
          warnings.push(`跳过（已在技能库中）：${raw}`)
          continue
        }
        let parsed: ReturnType<typeof parsePackage>
        try {
          parsed = parsePackage(source)
        } catch (error) {
          warnings.push(`跳过（解析失败：${errorMessage(error)}）：${raw}`)
          continue
        }
        if (seen.has(parsed.id)) {
          warnings.push(`同名技能重复，已跳过：${parsed.id}`)
          continue
        }
        seen.add(parsed.id)
        const existing = index.skills[parsed.id]
        if (existing !== undefined) {
          const same = existing.origin === 'external'
            && existing.externalPath !== undefined
            && resolve(existing.externalPath) === source
          if (same) {
            entries.push({ entry: existing, warnings: [] })
            continue
          }
          if (existing.origin !== 'external') {
            warnings.push(`跳过（已复制安装同名技能 ${parsed.id}）：${raw}`)
            continue
          }
          if (options.force !== true) {
            warnings.push(`跳过（技能 ${parsed.id} 已引用另一个目录；使用 --force 可替换）：${raw}`)
            continue
          }
        }
        const entryWarnings: string[] = []
        if (parsed.dependencies.node || parsed.dependencies.python) {
          entryWarnings.push('直接使用模式不会改动原目录，也不会自动安装依赖；请在原 Agent 中确认依赖可用。')
        }
        const entry: InstalledSkill = {
          id: parsed.id,
          name: parsed.name,
          version: parsed.version,
          description: parsed.description,
          source: { kind: 'external', value: source },
          dir: `external:${source}`,
          origin: 'external',
          externalPath: source,
          enabled: options.enable !== false,
          installedAt: existing?.installedAt ?? nowIso(),
          updatedAt: nowIso(),
          skills: parsed.skills,
          mcpServers: parsed.mcpServers,
          dependencies: parsed.dependencies,
          log: `logs/${parsed.id}.log`,
        }
        planned.push({ id: parsed.id, entry })
        entries.push({ entry, warnings: entryWarnings })
      }
      if (planned.length === 0 && entries.length === 0) {
        throw new SkillManagerError(
          'invalid-source',
          warnings.length > 0 ? `没有可引用的技能：${warnings.join('；')}` : '没有可引用的技能',
        )
      }
      for (const item of planned) index.skills[item.id] = item.entry
      if (planned.length > 0) this.writeIndex(index)
      return { entries, warnings }
    } finally {
      release()
    }
  }

  /** Copy a skill directory that another agent installed. */
  async importFrom(path: string, options: InstallOptions = {}): Promise<InstallResult> {
    this.ensureLayout()
    const source = resolve(path)
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new SkillManagerError('invalid-source', `导入目录不存在：${path}`)
    }
    if (!existsSync(join(source, 'SKILL.md')) && !existsSync(join(source, 'manifest.json'))) {
      throw new SkillManagerError('invalid-source', '导入目录里没有 SKILL.md 或 manifest.json')
    }
    if (isInside(this.dir, source)) throw new SkillManagerError('conflict', '该目录已经在当前技能库中')
    const release = await this.acquireLock()
    const stage = mkdtempSync(join(this.tmpDir, 'import-'))
    try {
      const target = join(stage, 'package')
      cpSync(source, target, {
        recursive: true,
        filter: (from) => !COPY_SKIP.has(basename(from)),
      })
      const spec: SourceSpec = { kind: 'local', value: source, label: source }
      return await this.commit(unwrapSingleRoot(target), spec, options, { origin: source, agent: undefined })
    } finally {
      release()
      rmDir(stage)
    }
  }

  /** Fetch a source into `stage` and return the extraction root. */
  private async fetch(spec: SourceSpec, stage: string): Promise<string> {
    switch (spec.kind) {
      case 'npm':
        return await this.fetchNpm(spec, stage)
      case 'git':
        return await this.fetchGit(spec, stage)
      case 'skillhub':
        return await this.fetchSkillhub(spec, stage)
      case 'archive':
        return await this.fetchArchive(spec, stage)
      case 'local':
        return await this.fetchLocal(spec, stage)
      case 'external':
        throw new SkillManagerError('invalid-source', '外部引用的技能不需要下载')
    }
  }

  private npmCli(): string[] {
    const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    if (existsSync(cli)) return [process.execPath, cli]
    return [process.platform === 'win32' ? 'npm.cmd' : 'npm']
  }

  private async fetchNpm(spec: SourceSpec, stage: string): Promise<string> {
    const [exe, ...prefix] = this.npmCli()
    const packDir = join(stage, 'pack')
    mkdirSync(packDir, { recursive: true })
    const result = await runProcess(exe!, [...prefix, 'pack', spec.value, '--pack-destination', packDir, '--json', '--ignore-scripts'], {
      timeoutMs: 180_000,
      maxBytes: 2 * 1024 * 1024,
      env: {
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_cache: join(this.cacheDir, 'npm'),
      },
    })
    if (result.code !== 0) {
      const detail = redactSecrets((result.stderr || result.stdout).split('\n').slice(-8).join('\n'))
      throw new SkillManagerError(
        result.timedOut ? 'timeout' : 'fetch-failed',
        result.timedOut ? 'npm 下载超时（180 秒）' : `npm 下载失败：${detail || '未知错误'}`,
      )
    }
    let filename: string | undefined
    try {
      const start = result.stdout.indexOf('[')
      const parsed: unknown = JSON.parse(start === -1 ? result.stdout : result.stdout.slice(start))
      if (Array.isArray(parsed) && parsed.length > 0) {
        const first = parsed[0] as Record<string, unknown>
        if (typeof first.filename === 'string') filename = first.filename
      }
    } catch {
      /* fall back to scanning the pack directory */
    }
    let file: string | undefined
    if (filename !== undefined) {
      file = join(packDir, filename)
    } else {
      const found = readdirSync(packDir).find(name => name.endsWith('.tgz'))
      file = found === undefined ? undefined : join(packDir, found)
    }
    if (file === undefined || !existsSync(file)) throw new SkillManagerError('fetch-failed', 'npm 没有生成 tarball')
    const target = join(stage, 'pkg')
    mkdirSync(target, { recursive: true })
    extractTar(readFileSync(file), target)
    return target
  }

  private async fetchGit(spec: SourceSpec, stage: string): Promise<string> {
    const repoDir = join(stage, 'repo')
    const args = ['clone', '--depth', '1', '--no-tags']
    if (spec.ref !== undefined && spec.ref.length > 0) args.push('--branch', spec.ref)
    args.push(spec.value, repoDir)
    const result = await runProcess('git', args, { timeoutMs: 240_000, maxBytes: 2 * 1024 * 1024 })
    if (result.code !== 0) {
      const detail = redactSecrets((result.stderr || result.stdout).split('\n').slice(-8).join('\n'))
      throw new SkillManagerError(
        result.timedOut ? 'timeout' : 'fetch-failed',
        result.timedOut ? 'git clone 超时（240 秒）' : `git clone 失败：${detail || '未知错误'}`,
      )
    }
    rmDir(join(repoDir, '.git'))
    if (spec.subdir !== undefined && spec.subdir.length > 0) {
      const sub = join(repoDir, spec.subdir)
      if (!isInside(repoDir, sub) || !existsSync(sub)) {
        throw new SkillManagerError('fetch-failed', `仓库中不存在子目录：${spec.subdir}`)
      }
      return sub
    }
    return repoDir
  }

  private async fetchSkillhub(spec: SourceSpec, stage: string): Promise<string> {
    const archive = join(stage, 'skillhub.zip')
    await downloadSkillhub(spec.value, archive)
    const target = join(stage, 'pkg')
    mkdirSync(target, { recursive: true })
    extractZip(readFileSync(archive), target)
    return target
  }

  private async fetchArchive(spec: SourceSpec, stage: string): Promise<string> {
    let file: string
    if (/^https?:\/\//i.test(spec.value)) {
      const response = await fetch(spec.value, {
        redirect: 'follow',
        headers: { accept: 'application/zip, application/gzip, application/octet-stream', 'user-agent': 'dsh-skill-manager' },
        signal: AbortSignal.timeout(120_000),
      }).catch((error: unknown) => {
        throw new SkillManagerError('fetch-failed', `下载技能包失败：${errorMessage(error)}`)
      })
      if (!response.ok) throw new SkillManagerError('fetch-failed', `下载技能包返回 HTTP ${String(response.status)}`)
      const length = Number(response.headers.get('content-length') ?? '0')
      if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES) {
        throw new SkillManagerError('fetch-failed', '技能包超过 128 MiB 上限')
      }
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > MAX_DOWNLOAD_BYTES) throw new SkillManagerError('fetch-failed', '技能包超过 128 MiB 上限')
      file = join(stage, 'archive.bin')
      writeFileSync(file, buffer)
    } else {
      file = spec.value
      if (!existsSync(file)) throw new SkillManagerError('not-found', `压缩包不存在：${spec.value}`)
    }
    const magic = readMagic(file)
    const target = join(stage, 'pkg')
    mkdirSync(target, { recursive: true })
    if (magic[0] === 0x50 && magic[1] === 0x4b) extractZip(readFileSync(file), target)
    else if (magic[0] === 0x1f && magic[1] === 0x8b) extractTar(readFileSync(file), target)
    else throw new SkillManagerError('unsupported-archive', '不是可识别的 ZIP 或 tar.gz 压缩包')
    return target
  }

  private async fetchLocal(spec: SourceSpec, stage: string): Promise<string> {
    if (!existsSync(spec.value) || !statSync(spec.value).isDirectory()) {
      throw new SkillManagerError('not-found', `本地目录不存在：${spec.value}`)
    }
    const target = join(stage, 'pkg')
    cpSync(spec.value, target, { recursive: true, filter: from => !COPY_SKIP.has(basename(from)) })
    return target
  }

  /** Move one parsed package into the store, install dependencies and index it. */
  private async commit(
    root: string,
    spec: SourceSpec,
    options: InstallOptions,
    provenance?: { origin: string; agent?: string },
  ): Promise<InstallResult> {
    const warnings: string[] = []
    const parsed = parsePackage(root)
    const index = this.readIndex()
    const existing = index.skills[parsed.id]
    if (existing !== undefined && options.force !== true) {
      throw new SkillManagerError(
        'conflict',
        `技能 ${parsed.id} 已安装（版本 ${existing.version}）。使用 --force 覆盖，或先卸载。`,
      )
    }

    const id = parsed.id
    const target = join(this.skillsDir, id)
    const logPath = this.logPath(id)
    mkdirSync(dirname(logPath), { recursive: true })
    writeFileSync(logPath, '', 'utf8')

    const previous = existing
    let backup: string | undefined
    if (existing !== undefined) {
      backup = join(this.trashDir, `${id}-${String(Date.now())}`)
      rmDir(backup)
      try {
        renameSync(target, backup)
      } catch {
        backup = undefined
        rmDir(target)
      }
    }
    rmDir(target)
    cpSync(root, target, { recursive: true, filter: from => !COPY_SKIP.has(basename(from)) })

    const entry: InstalledSkill = {
      id,
      name: parsed.name,
      version: parsed.version,
      description: parsed.description,
      source: { kind: spec.kind, value: spec.value, ...(spec.ref === undefined ? {} : { ref: spec.ref }) },
      dir: `skills/${id}`,
      origin: 'store',
      enabled: options.enable !== false,
      installedAt: existing?.installedAt ?? nowIso(),
      updatedAt: nowIso(),
      skills: parsed.skills,
      mcpServers: parsed.mcpServers,
      dependencies: parsed.dependencies,
      log: `logs/${id}.log`,
      ...(provenance === undefined ? {} : { provenance }),
    }

    try {
      if (options.skipDependencies !== true) {
        await this.installDependencies(entry, target, options, logPath)
      }
      writeFileSync(join(target, 'skill.json'), `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
      index.skills[id] = entry
      this.writeIndex(index)
      if (backup !== undefined) rmDir(backup)
    } catch (error) {
      rmDir(target)
      if (previous !== undefined) index.skills[id] = previous
      else delete index.skills[id]
      if (backup !== undefined && existsSync(backup)) {
        try {
          renameSync(backup, target)
        } catch {
          console.warn(`[dsh-skill-manager] could not restore the previous version from ${backup}`)
        }
      }
      this.writeIndex(index)
      throw error
    }
    return { entry, warnings, logPath }
  }

  /** Run the dependency installers a package declares, with hard timeouts. */
  private async installDependencies(entry: InstalledSkill, dir: string, options: InstallOptions, logPath: string): Promise<void> {
    const log = (line: string): void => {
      try {
        writeFileSync(logPath, `${redactSecrets(line)}\n`, { flag: 'a' })
      } catch {
        /* logging is best effort */
      }
    }
    const state: Record<string, unknown> = { at: nowIso(), node: 'skipped', python: 'skipped' }
    if (entry.dependencies.node) {
      const [exe, ...prefix] = this.npmCli()
      log(`$ npm install (node dependencies)`)
      const args = [...prefix, 'install', '--omit=dev', '--no-audit', '--no-fund']
      if (options.allowScripts !== true) args.push('--ignore-scripts')
      const result = await runProcess(exe!, args, {
        cwd: dir,
        timeoutMs: 600_000,
        maxBytes: 4 * 1024 * 1024,
        logPath,
        env: {
          npm_config_audit: 'false',
          npm_config_fund: 'false',
          npm_config_cache: join(this.cacheDir, 'npm'),
        },
      })
      if (result.code !== 0) {
        throw new SkillManagerError(
          result.timedOut ? 'timeout' : 'dependency-failed',
          result.timedOut ? 'npm install 超时（600 秒）' : 'npm install 失败，详见安装日志',
        )
      }
      state.node = 'ok'
    }
    if (entry.dependencies.python) {
      const python = await this.resolvePython()
      const venv = join(dir, '.venv')
      // Keep pip's temporary and cache directories inside the store: this is
      // required on locked-down Windows hosts that deny writes to the user's
      // temp/cache folders, and it keeps the global environment untouched.
      const pipTmp = join(dir, '.pip-tmp')
      mkdirSync(pipTmp, { recursive: true })
      const pipEnv = {
        TMP: pipTmp,
        TEMP: pipTmp,
        TMPDIR: pipTmp,
        PIP_CACHE_DIR: join(this.cacheDir, 'pip'),
        PIP_DISABLE_PIP_VERSION_CHECK: '1',
        PIP_NO_INPUT: '1',
      }
      log(`$ ${python} -m venv .venv`)
      const created = await runProcess(python, ['-m', 'venv', venv], {
        timeoutMs: 180_000,
        maxBytes: 2 * 1024 * 1024,
        logPath,
        env: pipEnv,
      })
      const venvPython = process.platform === 'win32'
        ? join(venv, 'Scripts', 'python.exe')
        : join(venv, 'bin', 'python3')
      const pipBase = ['-m', 'pip', 'install', '--disable-pip-version-check']
      if (existsSync(join(dir, 'requirements.txt'))) pipBase.push('-r', 'requirements.txt')
      if (entry.dependencies.pythonPackages.length > 0) pipBase.push(...entry.dependencies.pythonPackages)

      if (created.code === 0 && existsSync(venvPython)) {
        log('$ .venv/bin/python -m pip install …')
        const installed = await runProcess(venvPython, pipBase, {
          cwd: dir,
          timeoutMs: 600_000,
          maxBytes: 4 * 1024 * 1024,
          logPath,
          env: pipEnv,
        })
        rmDir(pipTmp)
        if (installed.code !== 0) {
          throw new SkillManagerError(
            installed.timedOut ? 'timeout' : 'dependency-failed',
            installed.timedOut ? 'pip install 超时（600 秒）' : 'pip install 失败，详见安装日志',
          )
        }
        state.python = 'venv'
      } else {
        // Some Windows Python installs cannot run `ensurepip` inside a venv.
        // Fall back to an isolated `--target` directory; the registration adds
        // it to PYTHONPATH so a Python-based MCP server still imports it.
        log('venv unavailable; falling back to pip --target .python-libs')
        rmDir(venv)
        const libs = join(dir, '.python-libs')
        mkdirSync(libs, { recursive: true })
        const installed = await runProcess(python, [...pipBase, '--target', libs], {
          cwd: dir,
          timeoutMs: 600_000,
          maxBytes: 4 * 1024 * 1024,
          logPath,
          env: pipEnv,
        })
        rmDir(pipTmp)
        if (installed.code !== 0) {
          throw new SkillManagerError(
            installed.timedOut ? 'timeout' : 'dependency-failed',
            installed.timedOut ? 'pip install 超时（600 秒）' : 'pip install 失败，且本机无法创建 venv，详见安装日志',
          )
        }
        state.python = 'target'
      }
    }
    writeFileSync(join(dir, '.deps.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  }

  private async resolvePython(): Promise<string> {
    for (const candidate of process.platform === 'win32' ? ['python.exe', 'python', 'py'] : ['python3', 'python']) {
      const probe = await runProcess(candidate, ['--version'], { timeoutMs: 10_000, maxBytes: 16 * 1024 })
      if (probe.code === 0) return candidate
    }
    throw new SkillManagerError('dependency-failed', '没有找到 Python（python3 / python / py）')
  }

  /** Remove one installed skill and its directory. */
  async remove(id: string): Promise<InstalledSkill> {
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const key = toStoreId(id)
      const entry = index.skills[key]
      if (entry === undefined) throw new SkillManagerError('not-found', `没有安装技能：${id}`)
      // A directly-used skill belongs to another agent: unlinking removes only
      // our index entry, never the original files.
      if (entry.origin !== 'external') {
        const dir = join(this.skillsDir, key)
        if (existsSync(dir)) {
          const trash = join(this.trashDir, `${key}-${String(Date.now())}`)
          try {
            renameSync(dir, trash)
          } catch {
            rmDir(dir)
          }
        }
      }
      delete index.skills[key]
      this.writeIndex(index)
      return entry
    } finally {
      release()
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledSkill> {
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const key = toStoreId(id)
      const entry = index.skills[key]
      if (entry === undefined) throw new SkillManagerError('not-found', `没有安装技能：${id}`)
      entry.enabled = enabled
      entry.updatedAt = nowIso()
      this.writeIndex(index)
      return entry
    } finally {
      release()
    }
  }

  /** Re-run dependency installation for one entry (the "self-heal" action). */
  async repair(id: string): Promise<{ entry: InstalledSkill; logPath: string }> {
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const key = toStoreId(id)
      const entry = index.skills[key]
      if (entry === undefined) throw new SkillManagerError('not-found', `没有安装技能：${id}`)
      if (entry.origin === 'external') {
        throw new SkillManagerError('invalid-source', '直接使用的技能不会改动原目录；请回到原 Agent 修复依赖')
      }
      if (entry.skills.length === 0) {
        throw new SkillManagerError('invalid-source', 'MCP 连接器没有需要修复的依赖')
      }
      const dir = join(this.skillsDir, key)
      if (!existsSync(dir)) throw new SkillManagerError('not-found', '技能目录丢失，请重新安装')
      const logPath = this.logPath(key)
      writeFileSync(logPath, '', 'utf8')
      await this.installDependencies(entry, dir, {}, logPath)
      entry.updatedAt = nowIso()
      this.writeIndex(index)
      return { entry, logPath }
    } finally {
      release()
    }
  }

  /** Repair every enabled entry that declares dependencies but has no success marker. */
  async repairAll(): Promise<Array<{ id: string; ok: boolean; error?: string }>> {
    const rows: Array<{ id: string; ok: boolean; error?: string }> = []
    for (const entry of this.list()) {
      if (!entry.enabled) continue
      if (entry.origin === 'external') continue
      if (!entry.dependencies.node && !entry.dependencies.python) continue
      const dir = join(this.skillsDir, entry.id)
      if (!existsSync(dir) || existsSync(join(dir, '.deps.json'))) continue
      try {
        await this.repair(entry.id)
        rows.push({ id: entry.id, ok: true })
      } catch (error) {
        rows.push({ id: entry.id, ok: false, error: errorMessage(error) })
      }
    }
    return rows
  }

  scanExternal(): ExternalSkillCandidate[] {
    return this.scanReport().candidates
  }

  /** Candidates plus the platforms actually present on this computer. */
  scanReport(): { candidates: ExternalSkillCandidate[]; platforms: PlatformScan[] } {
    const index = this.readIndex()
    const entries = Object.values(index.skills)
    const linkedByPath = new Map<string, string>()
    for (const entry of entries) {
      if (entry.origin === 'external' && entry.externalPath !== undefined) {
        linkedByPath.set(resolve(entry.externalPath), entry.id)
      }
    }
    const candidates = scanExternalSkills({
      storeDir: this.dir,
      home: this.home,
      cwd: this.cwd,
      installedIds: new Set(entries.map(entry => entry.id)),
      linkedByPath,
    })
    const counts = new Map<string, number>()
    for (const candidate of candidates) counts.set(candidate.agent, (counts.get(candidate.agent) ?? 0) + 1)
    const platforms = knownSkillRoots(this.home, this.cwd)
      .filter(root => existsSync(root.path))
      .map(root => ({
        agent: root.agent,
        label: root.label,
        path: root.path,
        count: counts.get(root.agent) ?? 0,
      }))
    return { candidates, platforms }
  }

  /** Store summary for the status route. */
  status(): {
    dir: string
    count: number
    enabled: number
    external: number
    skills: number
    mcpServers: number
    mcp: number
    revision: number
    entries: InstalledSkill[]
  } {
    const index = this.readIndex()
    const entries = Object.values(index.skills)
    // Copies and references are reported separately: a referenced skill is not
    // "installed" — it waits in the standby queue and is called on demand.
    const copies = entries.filter(entry => entry.origin !== 'external')
    const references = entries.filter(entry => entry.origin === 'external')
    return {
      dir: this.dir,
      count: copies.length,
      enabled: entries.filter(entry => entry.enabled).length,
      external: references.length,
      skills: entries.reduce((sum, entry) => sum + (entry.enabled ? entry.skills.length : 0), 0),
      mcpServers: entries.reduce(
        (sum, entry) => sum + (entry.enabled ? entry.mcpServers.length + (entry.mcpRefs ?? []).length : 0),
        0,
      ),
      // MCP connectors are counted on their own so the panel can show them even
      // when they are referenced rather than copied.
      mcp: entries.filter(entry => entry.mcpServers.length > 0 || (entry.mcpRefs ?? []).length > 0).length,
      revision: index.revision,
      entries,
    }
  }

  /** Copy an archive into the cache (kept for CLI diagnostics; not required). */
  cacheArchive(file: string, name: string): string {
    this.ensureLayout()
    const target = join(this.cacheDir, `${toStoreId(name)}-${randomBytes(4).toString('hex')}${file.endsWith('.zip') ? '.zip' : '.tgz'}`)
    copyFileSync(file, target)
    return target
  }

  // ------------------------------------------------------------------- MCP --

  /**
   * Parse what a user pasted in the panel: a full config (`mcpServers` or
   * `servers` map), one server object with a `name`, or a bare `{name, ...}`
   * entry. Returns the normalized specs and the skipped entries.
   */
  parseMcpInput(input: string): { specs: McpSpec[]; warnings: string[] } {
    const text = input.trim()
    if (text.length === 0) throw new SkillManagerError('invalid-source', '没有可解析的 MCP 配置')
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (error) {
      throw new SkillManagerError('invalid-source', `MCP 配置不是合法 JSON：${errorMessage(error)}`)
    }
    const specs: McpSpec[] = []
    const warnings: string[] = []
    const add = (name: string, raw: unknown): void => {
      const normalized = normalizeServerSpec(name, raw)
      if (normalized.spec === undefined) {
        if (normalized.skip === 'disabled') warnings.push(`跳过（已停用）：${name}`)
        else warnings.push(`跳过（${normalized.reason ?? '配置无效'}）：${name}`)
        return
      }
      specs.push(normalized.spec)
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>
      const map = record.mcpServers ?? record.servers ?? record.mcp_servers ?? record.mcp
      if (typeof map === 'object' && map !== null && !Array.isArray(map)) {
        for (const [name, raw] of Object.entries(map as Record<string, unknown>)) add(name, raw)
      } else if (typeof record.name === 'string' && record.name.length > 0) {
        add(record.name, record)
      } else {
        throw new SkillManagerError(
          'invalid-source',
          '无法识别这份配置：请粘贴 {"mcpServers": {...}}、{"servers": {...}} 或带 name 的单个服务对象',
        )
      }
    } else {
      throw new SkillManagerError('invalid-source', 'MCP 配置必须是 JSON 对象')
    }
    if (specs.length === 0) {
      throw new SkillManagerError('invalid-source', warnings.length > 0 ? `没有可添加的 MCP：${warnings.join('；')}` : '没有可添加的 MCP')
    }
    return { specs, warnings }
  }

  /** Add MCP connectors that the user supplied directly (no package copy). */
  async installMcp(input: string, options: InstallOptions = {}): Promise<LinkBatchResult> {
    const parsed = this.parseMcpInput(input)
    const batch = await this.addMcpServers(parsed.specs, options, {
      origin: options.ref ?? '手动添加',
      agent: undefined,
    })
    return { entries: batch.entries, warnings: [...parsed.warnings, ...batch.warnings] }
  }

  /**
   * Insert inline MCP servers as their own store entries. Each connector is one
   * entry so it can be enabled, disabled and removed on its own — exactly like
   * a skill, which is what the panel offers.
   */
  async addMcpServers(
    specs: readonly McpSpec[],
    options: InstallOptions = {},
    provenance: { origin: string; agent?: string; description?: string } = { origin: '手动添加' },
  ): Promise<LinkBatchResult> {
    this.ensureLayout()
    if (specs.length === 0) throw new SkillManagerError('invalid-source', '没有选择任何 MCP 连接器')
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const entries: InstallResult[] = []
      const warnings: string[] = []
      const planned: Array<{ id: string; entry: InstalledSkill }> = []
      const seen = new Set<string>()
      for (const spec of specs) {
        const id = toStoreId(`mcp-${spec.name}`)
        if (id.length === 0) {
          warnings.push(`跳过（无法生成 id）：${spec.name}`)
          continue
        }
        if (seen.has(id)) {
          warnings.push(`同名 MCP 重复，已跳过：${spec.name}`)
          continue
        }
        seen.add(id)
        const existing = index.skills[id]
        if (existing !== undefined) {
          const same = existing.origin === 'store' && existing.mcpServers.some(server => server.name === spec.name)
          if (same) {
            planned.push({ id, entry: { ...existing, mcpServers: [spec], updatedAt: nowIso() } })
            continue
          }
          if (existing.origin === 'external') {
            warnings.push(`跳过（${id} 是已引用的外部 MCP，先取消引用）：${spec.name}`)
            continue
          }
          if (options.force !== true) {
            warnings.push(`跳过（已存在同名条目 ${id}；使用覆盖可替换）：${spec.name}`)
            continue
          }
        }
        planned.push({
          id,
          entry: {
            id,
            name: spec.name,
            version: '1.0.0',
            description: provenance.description
              ?? (spec.transport === 'streamable-http'
                ? `MCP 连接器（HTTP）· ${spec.url ?? ''}`
                : `MCP 连接器（stdio）· ${spec.command ?? ''}`),
            source: spec.catalogId === undefined
              ? { kind: 'local', value: `mcp:${spec.name}` }
              : { kind: 'local', value: `catalog:${spec.catalogId}` },
            dir: `mcp/${id}`,
            origin: 'store',
            enabled: options.enable !== false,
            installedAt: existing?.installedAt ?? nowIso(),
            updatedAt: nowIso(),
            skills: [],
            mcpServers: [spec],
            dependencies: { node: false, python: false, pythonPackages: [] },
            ...(provenance.agent === undefined ? {} : { provenance: { origin: provenance.origin, agent: provenance.agent } }),
          },
        })
      }
      if (planned.length === 0 && entries.length === 0) {
        throw new SkillManagerError(
          'invalid-source',
          warnings.length > 0 ? `没有可添加的 MCP：${warnings.join('；')}` : '没有可添加的 MCP',
        )
      }
      for (const item of planned) {
        index.skills[item.id] = item.entry
        entries.push({ entry: item.entry, warnings: [] })
      }
      if (planned.length > 0) this.writeIndex(index)
      return { entries, warnings }
    } finally {
      release()
    }
  }

  /**
   * Reference MCP servers that live in another agent's config file.
   *
   * Only the location is stored. The command, URL, env and headers are re-read
   * from that file on every registration, so editing the other agent's config
   * takes effect here too and no secret is copied into this store.
   */
  async linkMcpRefs(refs: readonly McpRef[], options: InstallOptions = {}): Promise<LinkBatchResult> {
    this.ensureLayout()
    if (refs.length === 0) throw new SkillManagerError('invalid-source', '没有选择任何 MCP 连接器')
    const allowed = knownMcpConfigs(this.home, this.cwd, this.env)
    const release = await this.acquireLock()
    try {
      const index = this.readIndex()
      const entries: InstallResult[] = []
      const warnings: string[] = []
      const planned: Array<{ id: string; entry: InstalledSkill }> = []
      const seen = new Set<string>()
      for (const ref of refs) {
        // A reference may only point at a config file this plugin knows about:
        // the route must never become a way to read an arbitrary path.
        if (!isKnownMcpFile(ref.file, allowed)) {
          warnings.push(`跳过（不是已知的 MCP 配置文件）：${ref.file}`)
          continue
        }
        const spec = resolveMcpRef(ref)
        if (spec === undefined) {
          warnings.push(`跳过（配置里已找不到 ${ref.name}）：${ref.file}`)
          continue
        }
        const id = mcpRefStoreId(ref.agent, ref.name, ref.scope)
        if (seen.has(id)) {
          warnings.push(`同名 MCP 重复，已跳过：${ref.name}`)
          continue
        }
        seen.add(id)
        const existing = index.skills[id]
        const same = existing !== undefined
          && existing.origin === 'external'
          && (existing.mcpRefs ?? []).some(item => mcpRefKey(item.agent, item.file, item.scope, item.name) === mcpRefKey(ref.agent, ref.file, ref.scope, ref.name))
        if (same) {
          entries.push({ entry: existing, warnings: [] })
          continue
        }
        if (existing !== undefined && options.force !== true) {
          warnings.push(`跳过（${id} 已被占用；使用覆盖可替换）：${ref.name}`)
          continue
        }
        planned.push({
          id,
          entry: {
            id,
            name: ref.name,
            version: '1.0.0',
            description: `MCP 连接器 · 引用 ${ref.agentLabel}`,
            source: { kind: 'external', value: ref.file },
            dir: `external:${ref.file}`,
            origin: 'external',
            externalPath: ref.file,
            enabled: options.enable !== false,
            installedAt: existing?.installedAt ?? nowIso(),
            updatedAt: nowIso(),
            skills: [],
            mcpServers: [],
            mcpRefs: [ref],
            dependencies: { node: false, python: false, pythonPackages: [] },
            provenance: { origin: ref.file, agent: ref.agent },
          },
        })
      }
      if (planned.length === 0 && entries.length === 0) {
        throw new SkillManagerError(
          'invalid-source',
          warnings.length > 0 ? `没有可引用的 MCP：${warnings.join('；')}` : '没有可引用的 MCP',
        )
      }
      for (const item of planned) {
        index.skills[item.id] = item.entry
        entries.push({ entry: item.entry, warnings: [] })
      }
      if (planned.length > 0) this.writeIndex(index)
      return { entries, warnings }
    } finally {
      release()
    }
  }

  /** Every entry that contributes at least one MCP connector. */
  mcpEntries(): InstalledSkill[] {
    return this.list().filter(entry => entry.mcpServers.length > 0 || (entry.mcpRefs ?? []).length > 0)
  }

  /** MCP reference candidates found in other agents' config files. */
  scanMcpReport(): { candidates: ExternalMcpCandidate[]; platforms: McpPlatformScan[] } {
    const entries = this.list()
    const linkedByRef = new Map<string, string>()
    for (const entry of entries) {
      for (const ref of entry.mcpRefs ?? []) linkedByRef.set(mcpRefKey(ref.agent, ref.file, ref.scope, ref.name), entry.id)
    }
    return scanExternalMcp({
      home: this.home,
      cwd: this.cwd,
      env: this.env,
      localNames: new Set(entries.map(entry => entry.name)),
      linkedByRef,
    })
  }
}
