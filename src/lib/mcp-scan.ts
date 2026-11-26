/**
 * MCP reference surface: find MCP servers that other agents already configured.
 *
 * The scan is read-only and explicitly bounded to well-known config files.
 * Two consequences matter for security:
 * - only a config file that appears in `knownMcpConfigs()` may be read, so a
 *   request cannot turn the Host into an arbitrary file reader;
 * - env and header *values* never leave this module. Candidates expose key
 *   names and a masked target only. A referenced server is re-read from its
 *   file at registration time, so secrets stay in the other agent's config.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { isValidServerName, toStoreId } from './safe-path.js'
import type {
  ExternalMcpCandidate,
  McpConfigSource,
  McpPlatformScan,
  McpRef,
  McpSpec,
} from './types.js'

/** A config file is only ever read up to this size (Claude Code keeps history there). */
const MAX_CONFIG_BYTES = 4 * 1024 * 1024

/** Placeholder used instead of an env/header value. */
export const MASKED = '•••'

export function appDataRoot(home = homedir(), env: NodeJS.ProcessEnv = process.env, platformName: NodeJS.Platform = process.platform): string {
  if (platformName === 'win32') return env.APPDATA ?? join(home, 'AppData', 'Roaming')
  if (platformName === 'darwin') return join(home, 'Library', 'Application Support')
  return env.XDG_CONFIG_HOME ?? join(home, '.config')
}

/**
 * Every config file this plugin is willing to read.
 *
 * The list covers the agents whose MCP config format is public and stable:
 * Claude Desktop / Claude Code (including project scope), Cursor, Windsurf,
 * Gemini CLI, Codex, Cline, VS Code, and the tool folders the skill scanner
 * already knows (QoderWork, WorkBuddy, CodeBuddy, Hermes, shared `.agents`).
 */
export function knownMcpConfigs(
  home = homedir(),
  cwd = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  platformName: NodeJS.Platform = process.platform,
): McpConfigSource[] {
  const appData = appDataRoot(home, env, platformName)
  return [
    { path: join(appData, 'Claude', 'claude_desktop_config.json'), agent: 'claude-desktop', label: 'Claude Desktop', format: 'json' },
    { path: join(home, '.claude.json'), agent: 'claude-code', label: 'Claude Code', format: 'json' },
    { path: join(cwd, '.mcp.json'), agent: 'project-claude', label: '当前项目 · Claude', format: 'json' },
    { path: join(home, '.cursor', 'mcp.json'), agent: 'cursor', label: 'Cursor', format: 'json' },
    { path: join(cwd, '.cursor', 'mcp.json'), agent: 'project-cursor', label: '当前项目 · Cursor', format: 'json' },
    { path: join(home, '.codeium', 'windsurf', 'mcp_config.json'), agent: 'windsurf', label: 'Windsurf', format: 'json' },
    { path: join(home, '.gemini', 'settings.json'), agent: 'gemini-cli', label: 'Gemini CLI', format: 'json' },
    { path: join(home, '.codex', 'config.toml'), agent: 'codex', label: 'Codex', format: 'toml' },
    {
      path: join(appData, 'Code', 'User', 'globalStorage', 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json'),
      agent: 'cline',
      label: 'Cline',
      format: 'json',
    },
    { path: join(cwd, '.vscode', 'mcp.json'), agent: 'vscode-project', label: '当前项目 · VS Code', format: 'json' },
    { path: join(home, '.qoderwork', 'mcp.json'), agent: 'qoderwork', label: 'QoderWork', format: 'json' },
    { path: join(home, '.workbuddy', 'mcp.json'), agent: 'workbuddy', label: 'WorkBuddy', format: 'json' },
    { path: join(home, '.codebuddy', 'mcp.json'), agent: 'codebuddy', label: 'CodeBuddy', format: 'json' },
    { path: join(home, '.hermes', 'mcp.json'), agent: 'hermes', label: 'Hermes', format: 'json' },
    { path: join(home, '.agents', 'mcp.json'), agent: 'agents', label: 'Shared .agents', format: 'json' },
    { path: join(cwd, '.agents', 'mcp.json'), agent: 'project-agents', label: '当前项目 · .agents', format: 'json' },
    { path: join(home, '.dsh', 'mcp.json'), agent: 'dsh', label: 'DSH', format: 'json' },
    { path: join(cwd, '.dsh', 'mcp.json'), agent: 'project-dsh', label: '当前项目 · DSH', format: 'json' },
  ]
}

/** Absolute, case-insensitive set membership guard for `/mcp/link`. */
export function isKnownMcpFile(file: string, sources: readonly McpConfigSource[]): boolean {
  const target = file.toLowerCase()
  return sources.some(source => source.path.toLowerCase() === target)
}

function readText(file: string): string | undefined {
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return undefined
    if (statSync(file).size > MAX_CONFIG_BYTES) return undefined
    const raw = readFileSync(file, 'utf8')
    // Claude Code writes a leading BOM on some Windows installs.
    return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
  } catch {
    return undefined
  }
}

interface RawServer {
  name: string
  scope?: string
  raw: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collect every server map a JSON config may use, tolerating extra shapes. */
export function collectJsonServers(parsed: unknown): RawServer[] {
  const rows: RawServer[] = []
  if (!isRecord(parsed)) return rows
  const pushMap = (map: unknown, scope?: string): void => {
    if (!isRecord(map)) return
    for (const [name, raw] of Object.entries(map)) rows.push({ name, raw, ...(scope === undefined ? {} : { scope }) })
  }
  pushMap(parsed.mcpServers)
  pushMap(parsed.mcp_servers)
  pushMap(parsed.mcp)
  pushMap(parsed.servers)
  if (isRecord(parsed.projects)) {
    for (const [projectPath, value] of Object.entries(parsed.projects)) {
      if (!isRecord(value)) continue
      pushMap(value.mcpServers, projectPath)
    }
  }
  return rows
}

/** Split a TOML line at a `#` that is outside a quoted string. */
function stripTomlComment(line: string): string {
  let quote: string | undefined
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!
    if (quote === undefined) {
      if (char === '"' || char === "'") quote = char
      else if (char === '#') return line.slice(0, index)
    } else if (char === '\\' && quote === '"') {
      index += 1
    } else if (char === quote) {
      quote = undefined
    }
  }
  return line
}

function parseTomlString(text: string): { value: string; rest: string } | undefined {
  const quote = text[0]
  if (quote !== '"' && quote !== "'") return undefined
  let value = ''
  let index = 1
  while (index < text.length) {
    const char = text[index]!
    if (char === '\\' && quote === '"') {
      const next = text[index + 1]
      if (next === 'n') value += '\n'
      else if (next === 't') value += '\t'
      else if (next === 'r') value += '\r'
      else value += next ?? ''
      index += 2
      continue
    }
    if (char === quote) return { value, rest: text.slice(index + 1).trim() }
    value += char
    index += 1
  }
  return undefined
}

/** A deliberately small TOML value parser: strings, arrays, inline tables, scalars. */
export function parseTomlValue(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const parsed = parseTomlString(trimmed)
    return parsed === undefined ? trimmed : parsed.value
  }
  if (trimmed.startsWith('[')) {
    const inner = trimmed.replace(/^\[/, '').replace(/\]$/, '')
    const rows: unknown[] = []
    let rest = inner.trim()
    while (rest.length > 0) {
      const parsed = parseTomlItem(rest)
      if (parsed === undefined) break
      rows.push(parsed.value)
      rest = parsed.rest.trim().replace(/^,/, '').trim()
    }
    return rows
  }
  if (trimmed.startsWith('{')) {
    const table: Record<string, unknown> = {}
    let rest = trimmed.replace(/^\{/, '').replace(/\}$/, '').trim()
    while (rest.length > 0) {
      const separator = rest.indexOf('=')
      if (separator === -1) break
      const key = rest.slice(0, separator).trim().replace(/^["']|["']$/g, '')
      const afterKey = rest.slice(separator + 1).trim()
      const parsed = parseTomlItem(afterKey)
      if (parsed === undefined) break
      table[key] = parsed.value
      rest = parsed.rest.trim().replace(/^,/, '').trim()
    }
    return table
  }
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const number = Number(trimmed)
  if (trimmed.length > 0 && Number.isFinite(number)) return number
  return trimmed
}

function parseTomlItem(text: string): { value: unknown; rest: string } | undefined {
  const trimmed = text.trim()
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const parsed = parseTomlString(trimmed)
    if (parsed === undefined) return undefined
    return { value: parsed.value, rest: parsed.rest }
  }
  if (trimmed.startsWith('[')) {
    let depth = 0
    let quote: string | undefined
    for (let index = 0; index < trimmed.length; index += 1) {
      const char = trimmed[index]!
      if (quote === undefined) {
        if (char === '"' || char === "'") quote = char
        else if (char === '[') depth += 1
        else if (char === ']') {
          depth -= 1
          if (depth === 0) {
            const inner = trimmed.slice(1, index)
            const parsed = parseTomlValue(`[${inner}]`)
            return { value: parsed, rest: trimmed.slice(index + 1) }
          }
        }
      } else if (char === '\\' && quote === '"') {
        index += 1
      } else if (char === quote) {
        quote = undefined
      }
    }
    return undefined
  }
  // Bare scalar: up to the next comma.
  const comma = trimmed.indexOf(',')
  const head = comma === -1 ? trimmed : trimmed.slice(0, comma)
  return { value: parseTomlValue(head.trim()), rest: comma === -1 ? '' : trimmed.slice(comma) }
}

/** Parse a TOML subset into nested plain objects (sections and key/value lines). */
export function parseToml(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  let current: Record<string, unknown> = root
  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim()
    if (line.length === 0) continue
    if (line.startsWith('[[')) continue
    if (line.startsWith('[')) {
      const path = line.slice(1, -1).split('.').map(part => part.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
      let node = root
      for (const key of path) {
        if (!isRecord(node[key])) node[key] = {}
        node = node[key] as Record<string, unknown>
      }
      current = node
      continue
    }
    const separator = line.indexOf('=')
    if (separator === -1) continue
    const key = line.slice(0, separator).trim().replace(/^["']|["']$/g, '')
    if (key.length === 0) continue
    current[key] = parseTomlValue(line.slice(separator + 1))
  }
  return root
}

/** Read every MCP server from one known config file. */
export function readServersFromFile(file: string, format: 'json' | 'toml'): RawServer[] {
  const text = readText(file)
  if (text === undefined) return []
  if (format === 'toml') {
    const parsed = parseToml(text)
    return collectJsonServers({ mcpServers: parsed.mcp_servers ?? parsed.mcpServers })
  }
  try {
    return collectJsonServers(JSON.parse(text) as unknown)
  } catch {
    return []
  }
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value.trim().length > 0) return [value]
  return []
}

function stringMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  if (!isRecord(value)) return result
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item
    else if (typeof item === 'number' || typeof item === 'boolean') result[key] = String(item)
  }
  return result
}

export interface NormalizedServer {
  spec?: McpSpec
  /** Why the entry was skipped, for the panel's notice. */
  skip?: 'disabled' | 'invalid'
  reason?: string
}

/**
 * Normalize one provider-shaped entry into a store McpSpec.
 *
 * Accepted shapes: Claude (`command`/`args`/`env`), VS Code (`type: stdio|http`,
 * `url`), Gemini (`httpUrl`), Codex (`http_headers`). Disabled entries are
 * reported rather than silently dropped.
 */
export function normalizeServerSpec(name: string, raw: unknown): NormalizedServer {
  if (!isRecord(raw)) return { skip: 'invalid', reason: '配置不是对象' }
  if (raw.disabled === true || raw.enabled === false) return { skip: 'disabled' }
  if (!isValidServerName(name)) {
    return { skip: 'invalid', reason: `服务名不合法（仅允许字母、数字、_、-，最长 32）：${name}` }
  }
  const transportRaw = typeof raw.transport === 'string'
    ? raw.transport
    : typeof raw.type === 'string'
      ? raw.type
      : (typeof raw.httpUrl === 'string' || typeof raw.url === 'string' ? 'streamable-http' : 'stdio')
  const http = /^(http|streamable-http|http-sse|sse)$/i.test(transportRaw)
  if (http) {
    const url = typeof raw.url === 'string'
      ? raw.url
      : (typeof raw.httpUrl === 'string' ? raw.httpUrl : (typeof raw.serverUrl === 'string' ? raw.serverUrl : ''))
    if (url.trim().length === 0) return { skip: 'invalid', reason: `MCP 服务 ${name} 缺少 url` }
    const headers = { ...stringMap(raw.headers), ...stringMap(raw.http_headers) }
    return {
      spec: {
        name,
        transport: 'streamable-http',
        url: url.trim(),
        headers,
        ...timeouts(raw),
      },
    }
  }
  const command = typeof raw.command === 'string' ? raw.command.trim() : ''
  if (command.length === 0) return { skip: 'invalid', reason: `MCP 服务 ${name} 缺少 command` }
  const cwd = typeof raw.cwd === 'string' && raw.cwd.length > 0 ? raw.cwd : ''
  return {
    spec: {
      name,
      transport: 'stdio',
      command,
      args: stringArray(raw.args),
      env: stringMap(raw.env),
      ...(cwd.length === 0 ? {} : { cwd }),
      ...timeouts(raw),
    },
  }
}

function timeouts(raw: Record<string, unknown>): { startupTimeoutMs?: number; toolCallTimeoutMs?: number } {
  const result: { startupTimeoutMs?: number; toolCallTimeoutMs?: number } = {}
  if (typeof raw.startupTimeoutMs === 'number') result.startupTimeoutMs = raw.startupTimeoutMs
  if (typeof raw.toolCallTimeoutMs === 'number') result.toolCallTimeoutMs = raw.toolCallTimeoutMs
  // Codex spells both in seconds.
  if (result.startupTimeoutMs === undefined && typeof raw.startup_timeout_sec === 'number') {
    result.startupTimeoutMs = Math.round(raw.startup_timeout_sec * 1000)
  }
  if (result.toolCallTimeoutMs === undefined && typeof raw.tool_timeout_sec === 'number') {
    result.toolCallTimeoutMs = Math.round(raw.tool_timeout_sec * 1000)
  }
  return result
}

/** Mask a target so the panel can describe it without exposing a secret. */
export function maskSummary(spec: McpSpec): string {
  if (spec.transport === 'streamable-http') {
    let host = spec.url ?? ''
    try {
      const url = new URL(host)
      host = `${url.protocol}//${url.host}${url.pathname}`
    } catch {
      /* keep the raw URL when it does not parse */
    }
    return host
  }
  const args = (spec.args ?? []).map((arg) => {
    if (arg.startsWith('${')) return MASKED
    // Short flags such as `-y` or `/c` are meaningful verbatim.
    if (/^[-/]/.test(arg) && arg.length <= 3) return arg
    if (!/[\\/]/.test(arg)) return arg
    return arg.split(/[\\/]/).filter(Boolean).pop() ?? arg
  })
  const line = [spec.command ?? '', ...args].join(' ').trim()
  return line.length > 120 ? `${line.slice(0, 117)}…` : line
}

function secretKeys(spec: McpSpec): string[] {
  if (spec.transport === 'streamable-http') return Object.keys(spec.headers ?? {})
  return Object.keys(spec.env ?? {})
}

/** Look one referenced server up again, for registration. */
export function readServerFromConfig(file: string, format: 'json' | 'toml', name: string, scope?: string): McpSpec | undefined {
  for (const row of readServersFromFile(file, format)) {
    if (row.name !== name) continue
    if (scope !== undefined && row.scope !== scope) continue
    if (scope === undefined && row.scope !== undefined) continue
    const normalized = normalizeServerSpec(row.name, row.raw)
    if (normalized.spec !== undefined) return normalized.spec
  }
  return undefined
}

function formatOf(file: string): 'json' | 'toml' {
  return file.toLowerCase().endsWith('.toml') ? 'toml' : 'json'
}

/** Resolve a stored reference to its live server spec. */
export function resolveMcpRef(ref: McpRef): McpSpec | undefined {
  return readServerFromConfig(ref.file, formatOf(ref.file), ref.name, ref.scope)
}

export interface McpScanResult {
  candidates: ExternalMcpCandidate[]
  platforms: McpPlatformScan[]
}

/**
 * Scan the known config files for MCP servers.
 *
 * `linkedByRef` maps `agent|file|scope|name` to the store entry id that already
 * references it, so the panel can show a server as linked instead of offering
 * a duplicate reference.
 */
export function scanExternalMcp(options: {
  home?: string
  cwd?: string
  env?: NodeJS.ProcessEnv
  platformName?: NodeJS.Platform
  /** Store-managed ids; used to mark a same-named local entry. */
  localNames?: ReadonlySet<string>
  linkedByRef?: ReadonlyMap<string, string>
} = {}): McpScanResult {
  const home = options.home ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const sources = knownMcpConfigs(home, cwd, options.env ?? process.env, options.platformName ?? process.platform)
  const candidates: ExternalMcpCandidate[] = []
  const seen = new Set<string>()
  const seenFiles = new Set<string>()
  const platforms: McpPlatformScan[] = []
  for (const source of sources) {
    if (!existsSync(source.path)) continue
    // `cwd` and the home directory are often the same (a project opened at
    // home); the same file must not be offered twice under two labels.
    const fileKey = source.path.toLowerCase()
    if (seenFiles.has(fileKey)) continue
    seenFiles.add(fileKey)
    const rows = readServersFromFile(source.path, source.format)
    let count = 0
    for (const row of rows) {
      const normalized = normalizeServerSpec(row.name, row.raw)
      if (normalized.skip === 'disabled') continue
      const key = `${source.agent}|${source.path}|${row.scope ?? ''}|${row.name}`
      if (seen.has(key)) continue
      seen.add(key)
      if (normalized.spec === undefined) {
        // Listed rather than hidden: the user should see that this agent has a
        // server this plugin cannot reference, and why.
        count += 1
        candidates.push({
          key,
          name: row.name,
          agent: source.agent,
          agentLabel: source.label,
          file: source.path,
          ...(row.scope === undefined ? {} : { scope: row.scope }),
          transport: 'stdio',
          summary: normalized.reason ?? '配置无效',
          envKeys: [],
          linked: false,
          invalid: true,
          invalidReason: normalized.reason ?? '配置无效',
        })
        continue
      }
      count += 1
      const linkedId = options.linkedByRef?.get(key)
      candidates.push({
        key,
        name: row.name,
        agent: source.agent,
        agentLabel: source.label,
        file: source.path,
        ...(row.scope === undefined ? {} : { scope: row.scope }),
        transport: normalized.spec.transport,
        summary: maskSummary(normalized.spec),
        envKeys: secretKeys(normalized.spec),
        linked: linkedId !== undefined,
        ...(linkedId === undefined ? {} : { linkedId }),
      })
    }
    if (count > 0) platforms.push({ agent: source.agent, label: source.label, path: source.path, count })
  }
  const order = new Map(platforms.map((platform, index) => [platform.agent, index]))
  candidates.sort((left, right) => (order.get(left.agent) ?? 99) - (order.get(right.agent) ?? 99) || left.name.localeCompare(right.name))
  return { candidates, platforms }
}

/** The selection key for one candidate, so the panel and Host agree. */
export function mcpRefKey(agent: string, file: string, scope: string | undefined, name: string): string {
  return `${agent}|${file}|${scope ?? ''}|${name}`
}

/**
 * Stable store id for a referenced server.
 *
 * Two agents may both call a server `wordpress`, and one Claude Code file may
 * hold a `wordpress` at root scope and another inside a project. The project
 * folder name keeps those ids apart instead of collapsing them into one entry.
 */
export function mcpRefStoreId(agent: string, name: string, scope?: string): string {
  const scopeTag = scope === undefined ? '' : basename(scope)
  const id = toStoreId(`mcp-${agent}-${name}${scopeTag.length > 0 ? `-${scopeTag}` : ''}`)
  return id || `mcp-${Date.now().toString(36)}`
}
