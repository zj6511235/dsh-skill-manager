/**
 * Bridge between the store and DSH's runtime services.
 *
 * Skills are registered with `ctx.skills.register()` and MCP servers with
 * `ctx.mcpManager.register()`, both for this plugin's lifetime only. Nothing
 * is written into `~/.dsh/skills` or the profile's config tree, so disabling
 * the plugin removes every contributed capability cleanly.
 */
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { join } from 'node:path'
import { parseFrontmatter } from './frontmatter.js'
import { resolveMcpRef } from './mcp-scan.js'
import { isValidServerName } from './safe-path.js'
import type { SkillStore } from './store.js'
import type { InstalledSkill, McpServerStatus, McpSpec } from './types.js'

interface SkillService {
  register: (skill: Record<string, unknown>) => () => void
}

interface McpManagerService {
  register: (name: string, entry: Record<string, unknown>) => () => void
  list?: () => Array<Record<string, unknown>>
  probe?: (name: string, options?: Record<string, unknown>) => unknown
}

interface HostContext {
  logger?: {
    info?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    debug?: (...args: unknown[]) => void
  }
}

const MAX_SKILL_BYTES = 1024 * 1024

/** Stable, collision-resistant MCP namespace for one store entry. */
export function mcpServerName(id: string, server: string): string {
  const base = `skm_${id}_${server}`.replace(/[^A-Za-z0-9_-]/g, '_')
  if (base.length <= 32) return base
  let hash = 0
  for (let index = 0; index < base.length; index += 1) hash = (hash * 31 + base.charCodeAt(index)) >>> 0
  return `${base.slice(0, 24)}_${hash.toString(36).slice(0, 7)}`
}

/** A spec whose command or cwd is package-relative needs the entry folder. */
function hasRelativePaths(spec: McpSpec): boolean {
  if (spec.transport !== 'stdio') return false
  if (/^\.\.?[\\/]/.test(spec.command ?? '')) return true
  const cwd = spec.cwd ?? ''
  return cwd.length > 0 && !cwd.startsWith('/') && !/^[A-Za-z]:/.test(cwd)
}

/** Render an unknown MCP status value as one short label for the panel. */
function statusLabel(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    for (const key of ['state', 'kind', 'status', 'phase']) {
      if (typeof record[key] === 'string') return record[key]
    }
  }
  return 'unknown'
}

export class RegistrationController {
  private readonly ctx: HostContext
  private readonly store: SkillStore
  private skills: SkillService | undefined
  private mcp: McpManagerService | undefined
  private disposers: Array<() => void> = []
  private watcher: FSWatcher | undefined
  private timer: NodeJS.Timeout | undefined
  private disposed = false
  private refreshing = false
  private pending = false
  /** Non-fatal registration problems, shown by the status route. */
  readonly warnings: string[] = []

  constructor(ctx: HostContext, store: SkillStore) {
    this.ctx = ctx
    this.store = store
  }

  attachSkills(service: SkillService | undefined): void {
    if (service === undefined || this.disposed) return
    this.skills = service
    this.ctx.logger?.info?.('dsh-skill-manager: skills service attached')
    this.requestRefresh()
  }

  attachMcp(service: McpManagerService | undefined): void {
    if (service === undefined || this.disposed) return
    this.mcp = service
    this.ctx.logger?.info?.('dsh-skill-manager: mcpManager service attached')
    this.requestRefresh()
  }

  capabilities(): { skills: boolean; mcp: boolean; probe: boolean } {
    return { skills: this.skills !== undefined, mcp: this.mcp !== undefined, probe: typeof this.mcp?.probe === 'function' }
  }

  /** Watch the index so CLI/API changes become live without a restart. */
  startWatching(): void {
    if (this.disposed) return
    try {
      this.store.ensureLayout()
      this.watcher = watch(this.store.dir, { persistent: false }, (_event, filename) => {
        if (filename === null || filename === 'index.json') this.requestRefresh()
      })
      this.watcher.on('error', (error) => {
        this.ctx.logger?.warn?.(`dsh-skill-manager: store watcher stopped: ${String(error)}`)
      })
      // A watcher must never be the reason the Host process stays alive.
      this.watcher.unref?.()
    } catch (error) {
      this.ctx.logger?.warn?.(`dsh-skill-manager: cannot watch the store: ${String(error)}`)
    }
    this.requestRefresh()
  }

  private requestRefresh(): void {
    if (this.disposed) return
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.refreshNow()
    }, 250)
  }

  /** Rebuild every registration from the current index. */
  async refreshNow(): Promise<void> {
    if (this.disposed) return
    if (this.refreshing) {
      this.pending = true
      return
    }
    this.refreshing = true
    try {
      this.disposeRegistrations()
      this.warnings.length = 0
      const index = this.store.readIndex()
      const entries = Object.values(index.skills).filter(entry => entry.enabled)
      for (const entry of entries) {
        try {
          this.registerEntry(entry)
        } catch (error) {
          this.warnings.push(`技能 ${entry.id} 注册失败：${(error as Error).message}`)
        }
      }
    } catch (error) {
      this.warnings.push(`读取技能库失败：${(error as Error).message}`)
      this.ctx.logger?.warn?.(`dsh-skill-manager: refresh failed: ${(error as Error).message}`)
    } finally {
      this.refreshing = false
      if (this.pending) {
        this.pending = false
        this.requestRefresh()
      }
    }
  }

  private registerEntry(entry: InstalledSkill): void {
    // A package entry needs its copied folder; an MCP connector may not have
    // one at all (it is a config snippet or a reference to another agent).
    const dir = entry.origin === 'external' && entry.externalPath !== undefined
      ? entry.externalPath
      : join(this.store.skillsDir, entry.id)
    const needsDir = entry.skills.length > 0 || entry.mcpServers.some(server => hasRelativePaths(server))
    if (needsDir && !existsSync(dir)) {
      this.warnings.push(`技能 ${entry.id} 的目录丢失，已跳过`)
      return
    }
    if (this.skills !== undefined) {
      for (const skill of entry.skills) {
        try {
          const file = join(dir, skill.path)
          if (!existsSync(file)) {
            this.warnings.push(`技能 ${entry.id}: 找不到 ${skill.path}`)
            continue
          }
          const raw = readFileSync(file, 'utf8')
          if (raw.length > MAX_SKILL_BYTES) {
            this.warnings.push(`技能 ${skill.name} 超过 1 MiB，已跳过`)
            continue
          }
          const parsed = parseFrontmatter(raw)
          const body = parsed?.body ?? raw
          const dispose = this.skills.register({
            name: skill.name,
            description: skill.description,
            ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
            source: 'custom',
            provider: 'skill-manager',
            path: file,
            content: body,
            resourceBase: { kind: 'directory', path: dir },
            ...(skill.invocation === undefined ? {} : { invocation: skill.invocation }),
          })
          this.disposers.push(dispose)
          this.ctx.logger?.debug?.(`dsh-skill-manager: registered skill ${skill.name}`)
        } catch (error) {
          this.warnings.push(`技能 ${skill.name} 注册失败：${(error as Error).message}`)
        }
      }
    }
    if (this.mcp !== undefined) {
      for (const item of this.collectServers(entry)) {
        const name = mcpServerName(entry.id, item.spec.name)
        if (!isValidServerName(name)) {
          this.warnings.push(`MCP 名不合法：${name}`)
          continue
        }
        try {
          const spec = this.buildMcpEntry(entry.skills.length > 0 ? dir : undefined, item.spec)
          const dispose = this.mcp.register(name, spec)
          this.disposers.push(dispose)
          this.ctx.logger?.debug?.(`dsh-skill-manager: registered MCP ${name}`)
        } catch (error) {
          this.warnings.push(`MCP ${item.spec.name} 注册失败：${(error as Error).message}`)
        }
      }
    }
  }

  /**
   * The servers one entry contributes: inline specs plus every reference,
   * resolved fresh from the other agent's config file. Re-reading here is what
   * keeps secrets out of this store and makes an upstream edit take effect.
   */
  private collectServers(entry: InstalledSkill): Array<{ spec: McpSpec; referenced: boolean }> {
    const rows: Array<{ spec: McpSpec; referenced: boolean }> = entry.mcpServers.map(spec => ({ spec, referenced: false }))
    for (const ref of entry.mcpRefs ?? []) {
      const spec = resolveMcpRef(ref)
      if (spec === undefined) {
        this.warnings.push(`MCP ${ref.name} 的原配置已变化或不可读：${ref.file}`)
        continue
      }
      rows.push({ spec, referenced: true })
    }
    return rows
  }

  /** Live status of every MCP connector this store registered. */
  mcpRows(): McpServerStatus[] {
    const live = new Map<string, Record<string, unknown>>()
    if (typeof this.mcp?.list === 'function') {
      try {
        for (const row of this.mcp.list()) {
          if (typeof row.name === 'string') live.set(row.name, row)
        }
      } catch {
        /* a manager that cannot list must not break the panel */
      }
    }
    const rows: McpServerStatus[] = []
    for (const entry of this.store.list()) {
      for (const item of [...entry.mcpServers.map(spec => ({ name: spec.name })), ...(entry.mcpRefs ?? []).map(ref => ({ name: ref.name }))]) {
        const registeredAs = mcpServerName(entry.id, item.name)
        const row = live.get(registeredAs)
        rows.push({
          registeredAs,
          entryId: entry.id,
          entryName: entry.name,
          server: item.name,
          status: this.mcp === undefined
            ? 'unavailable'
            : (entry.enabled ? statusLabel(row?.status) : 'disabled'),
          configured: row?.configured === true,
        })
      }
    }
    return rows
  }

  /** Probe one connector without touching the live instance. */
  async probe(entryId: string, server: string): Promise<{ ok: boolean; result?: unknown; error?: string }> {
    if (typeof this.mcp?.probe !== 'function') return { ok: false, error: '当前 profile 没有可用的 MCP 管理器（无法测试连接）' }
    const name = mcpServerName(entryId, server)
    try {
      const result = await Promise.resolve(this.mcp.probe(name))
      return { ok: true, result }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
  }

  private buildMcpEntry(dir: string | undefined, server: McpSpec): Record<string, unknown> {
    if (server.transport === 'streamable-http') {
      return {
        transport: 'streamable-http',
        url: server.url,
        headers: server.headers ?? {},
        ...(server.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: server.startupTimeoutMs }),
        ...(server.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: server.toolCallTimeoutMs }),
      }
    }
    let command = server.command ?? ''
    if (dir !== undefined && (command.startsWith('./') || command.startsWith('.\\'))) command = join(dir, command.slice(2))
    if (/^(python|python3|python\.exe)$/i.test(command) && dir !== undefined) {
      const venv = process.platform === 'win32'
        ? join(dir, '.venv', 'Scripts', 'python.exe')
        : join(dir, '.venv', 'bin', 'python3')
      if (existsSync(venv)) command = venv
    }
    const env: Record<string, string> = { ...(server.env ?? {}) }
    // `pip --target` fallback: make the private package directory importable
    // for Python-based MCP servers.
    if (dir !== undefined) {
      const libs = join(dir, '.python-libs')
      if (existsSync(libs) && (/python/i.test(command) || (server.args ?? []).some(arg => /\.py$/i.test(arg)))) {
        const separator = process.platform === 'win32' ? ';' : ':'
        env.PYTHONPATH = env.PYTHONPATH === undefined ? libs : `${libs}${separator}${env.PYTHONPATH}`
      }
    }
    const args = (server.args ?? []).map((arg) => {
      if (dir === undefined) return arg
      if (arg.startsWith('${') || arg.startsWith('-')) return arg
      if (/^[./]/.test(arg) && existsSync(join(dir, arg))) return join(dir, arg)
      return arg
    })
    const cwd = server.cwd === undefined || server.cwd.length === 0
      ? dir
      : (server.cwd.startsWith('/') || /^[A-Za-z]:/.test(server.cwd) ? server.cwd : dir === undefined ? server.cwd : join(dir, server.cwd))
    const launch = { command, args }
    return {
      transport: 'stdio',
      command: launch.command,
      args: launch.args,
      env,
      ...(cwd === undefined ? {} : { cwd }),
      ...(server.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: server.startupTimeoutMs }),
      ...(server.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: server.toolCallTimeoutMs }),
    }
  }

  private disposeRegistrations(): void {
    const list = this.disposers
    this.disposers = []
    for (const dispose of list.reverse()) {
      try {
        dispose()
      } catch {
        /* a failed unregister must not block the rest */
      }
    }
  }

  dispose(): void {
    this.disposed = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.watcher?.close()
    this.watcher = undefined
    this.disposeRegistrations()
  }
}
