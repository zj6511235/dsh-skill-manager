#!/usr/bin/env node
/**
 * dsh-skill — command line for the local skill store.
 *
 * The CLI shares the Host's install engine (`lib/store.js`) instead of going
 * through HTTP, so it works while DSH is stopped. A running Host notices the
 * index change through its watcher and re-registers skills/MCP servers live.
 *
 * Usage:
 *   dsh-skill add <source> [--no-enable] [--force] [--allow-scripts]
 *   dsh-skill list [--json]
 *   dsh-skill remove <id> --yes
 *   dsh-skill enable|disable <id>
 *   dsh-skill repair <id>
 *   dsh-skill search <keyword>
 *   dsh-skill scan [--json]
 *   dsh-skill import <path>
 *   dsh-skill status
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SkillStore } from '../lib/store.js'
import { SkillManagerError, isSkillManagerError } from '../lib/errors.js'
import { searchSkillhub } from '../lib/skillhub.js'

const root = fileURLToPath(new URL('..', import.meta.url))

function usage() {
  console.log(`dsh-skill — local skill & MCP store

Usage:
  dsh-skill add <source> [--no-enable] [--force] [--allow-scripts] [--skip-deps]
  dsh-skill list [--json]
  dsh-skill remove <id> --yes
  dsh-skill enable <id>
  dsh-skill disable <id>
  dsh-skill repair <id>
  dsh-skill search <keyword>
  dsh-skill scan [--json]
  dsh-skill link <path...> [--no-enable] [--force]
  dsh-skill import <path> [--force]
  dsh-skill status

Sources:
  npm package         is-number | @scope/pkg@1.2.3 | npm:pkg
  GitHub / git        https://github.com/owner/repo[#ref] | github:owner/repo
  SkillHub            skillhub:<slug> | https://skillhub.cn/skills/<slug>
  archive             local .zip/.tar.gz or https URL
  local folder        C:\\path\\to\\skill

Options:
  --store <dir>       store root (default: $DSH_SKILL_STORE or ~/.dsh/skills_store)
  --json              machine-readable output
  --yes               confirm removal
  --no-enable         install but keep disabled
  --force             overwrite an installed skill
  --allow-scripts     let npm run dependency install scripts (default off)
  --skip-deps         skip npm/pip dependency installation
  --ref <ref>         git branch/tag
`)
}

function parseArgs(argv) {
  const flags = {}
  const positionals = []
  const valueFlags = new Set(['--store', '--ref'])
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token.startsWith('--')) {
      const [name, inline] = token.split('=')
      if (valueFlags.has(name)) {
        const value = inline ?? argv[index + 1]
        if (value === undefined || value.startsWith('--')) throw new Error(`${name} 需要一个值`)
        flags[name.slice(2)] = value
        if (inline === undefined) index += 1
      } else {
        flags[name.slice(2)] = true
      }
    } else {
      positionals.push(token)
    }
  }
  return { flags, positionals }
}

function storeFrom(flags) {
  const store = new SkillStore({ dir: flags.store, cwd: process.cwd() })
  store.ensureLayout()
  return store
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv.slice(2))
  const command = positionals[0]
  const arg = positionals[1]
  const json = flags.json === true
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    usage()
    return
  }
  if (!existsSync(join(root, 'lib', 'store.js'))) {
    console.error('未找到编译产物 lib/。请在插件目录运行：npm install && npm run build')
    process.exit(1)
  }

  // Search is a pure SkillHub query: it must work even when the store folder
  // is not writable yet (for example before the first install).
  if (command === 'search') {
    if (arg === undefined) throw new SkillManagerError('invalid-source', '用法：dsh-skill search <keyword>')
    const result = await searchSkillhub(positionals.slice(1).join(' '), 1, 10)
    if (json) console.log(JSON.stringify(result, null, 2))
    else {
      if (result.items.length === 0) console.log('没有找到匹配的技能。')
      for (const item of result.items) {
        console.log(`${item.name}  (v${item.version}, ↓${item.downloads.toLocaleString()})`)
        console.log(`  skillhub:${item.slug}`)
        console.log(`  ${item.description.replace(/\s+/g, ' ').slice(0, 140)}`)
      }
    }
    return
  }

  const store = storeFrom(flags)

  switch (command) {
    case 'status': {
      const status = store.status()
      if (json) console.log(JSON.stringify(status, null, 2))
      else {
        console.log(`存储目录: ${status.dir}`)
        console.log(`已安装: ${status.count}  已启用: ${status.enabled}  技能: ${status.skills}  MCP: ${status.mcpServers}`)
      }
      return
    }
    case 'list': {
      const entries = store.list()
      if (json) console.log(JSON.stringify(entries, null, 2))
      else if (entries.length === 0) console.log('(空)')
      else for (const entry of entries) {
        console.log(`${entry.enabled ? '●' : '○'} ${entry.id}  v${entry.version}  [${entry.origin === 'external' ? 'external' : entry.source.kind}]  skills=${entry.skills.length} mcp=${entry.mcpServers.length}`)
        console.log(`   ${entry.description || entry.name}`)
        console.log(`   ${entry.origin === 'external' ? entry.externalPath : join(store.dir, entry.dir)}`)
      }
      return
    }
    case 'add': {
      if (arg === undefined) throw new SkillManagerError('invalid-source', '用法：dsh-skill add <source>')
      console.log(`安装中：${arg}`)
      const result = await store.install(arg, {
        enable: flags['no-enable'] !== true,
        force: flags.force === true,
        allowScripts: flags['allow-scripts'] === true,
        skipDependencies: flags['skip-deps'] === true,
        ref: typeof flags.ref === 'string' ? flags.ref : undefined,
      })
      if (json) console.log(JSON.stringify(result, null, 2))
      else {
        console.log(`✔ 已安装 ${result.entry.id} v${result.entry.version}`)
        console.log(`  目录: ${join(store.dir, result.entry.dir)}`)
        if (result.entry.skills.length > 0) console.log(`  技能: ${result.entry.skills.map(skill => skill.name).join(', ')}`)
        if (result.entry.mcpServers.length > 0) console.log(`  MCP : ${result.entry.mcpServers.map(server => server.name).join(', ')}`)
        if (result.logPath) console.log(`  日志: ${result.logPath}`)
        for (const warning of result.warnings) console.log(`  ! ${warning}`)
        console.log('运行的 DSH 会自动发现本次变更；未运行时下次启动生效。')
      }
      return
    }
    case 'remove': {
      if (arg === undefined) throw new SkillManagerError('invalid-source', '用法：dsh-skill remove <id> --yes')
      if (flags.yes !== true) throw new SkillManagerError('invalid-source', '移除需要 --yes 确认')
      const entry = await store.remove(arg)
      if (json) console.log(JSON.stringify(entry, null, 2))
      else console.log(`✔ 已移除 ${entry.id}`)
      return
    }
    case 'enable':
    case 'disable': {
      if (arg === undefined) throw new SkillManagerError('invalid-source', `用法：dsh-skill ${command} <id>`)
      const entry = await store.setEnabled(arg, command === 'enable')
      if (json) console.log(JSON.stringify(entry, null, 2))
      else console.log(`✔ ${entry.id} 已${command === 'enable' ? '启用' : '停用'}`)
      return
    }
    case 'repair': {
      if (arg === undefined) throw new SkillManagerError('invalid-source', '用法：dsh-skill repair <id>')
      const result = await store.repair(arg)
      if (json) console.log(JSON.stringify(result, null, 2))
      else console.log(`✔ 依赖已修复：${result.entry.id}（日志 ${result.logPath}）`)
      return
    }
    case 'search':
      throw new SkillManagerError('internal', 'search 在技能库初始化前处理，不应到达这里')
    case 'scan': {
      const report = store.scanReport()
      if (json) console.log(JSON.stringify(report, null, 2))
      else {
        console.log(`已识别平台：${report.platforms.length}`)
        for (const platform of report.platforms) {
          console.log(`  ${platform.label}: ${platform.count} 个技能  ${platform.path}`)
        }
        if (report.candidates.length === 0) console.log('没有发现其他 Agent 已安装的技能。')
        for (const candidate of report.candidates) {
          console.log(`[${candidate.agentLabel}] ${candidate.name}${candidate.linked ? ' (直接使用中)' : candidate.installed ? ' (已复制)' : ''}`)
          console.log(`  ${candidate.path}`)
        }
      }
      return
    }
    case 'link': {
      const paths = positionals.slice(1)
      if (paths.length === 0) throw new SkillManagerError('invalid-source', '用法：dsh-skill link <path...>')
      const batch = await store.linkMany(paths, { enable: flags['no-enable'] !== true, force: flags.force === true })
      if (json) console.log(JSON.stringify(batch, null, 2))
      else {
        for (const result of batch.entries) {
          console.log(`✔ 已直接使用 ${result.entry.id}（不复制文件）`)
          console.log(`  原目录: ${result.entry.externalPath}`)
          for (const warning of result.warnings) console.log(`  ! ${warning}`)
        }
        for (const warning of batch.warnings) console.log(`  ! ${warning}`)
      }
      return
    }
    case 'import': {
      if (arg === undefined) throw new SkillManagerError('invalid-source', '用法：dsh-skill import <path>')
      const result = await store.importFrom(arg, { enable: flags['no-enable'] !== true, force: flags.force === true })
      if (json) console.log(JSON.stringify(result, null, 2))
      else console.log(`✔ 已导入 ${result.entry.id}（${result.entry.skills.map(skill => skill.name).join(', ')}）`)
      return
    }
    default:
      throw new SkillManagerError('invalid-source', `未知命令：${command}（运行 dsh-skill help）`)
  }
}

main().catch((error) => {
  if (isSkillManagerError(error)) {
    console.error(`错误 [${error.code}]：${error.message}`)
  } else {
    console.error(`错误：${error instanceof Error ? error.message : String(error)}`)
  }
  process.exit(1)
})
