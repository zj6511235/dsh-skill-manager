/** Data shapes exchanged by the store, the Host routes and the CLI. */

export type SourceKind = 'npm' | 'git' | 'skillhub' | 'archive' | 'local' | 'external'

/** How the entry is mounted: copied into the store, or used where it already lives. */
export type EntryOrigin = 'store' | 'external'

export interface SourceSpec {
  kind: SourceKind
  /** Canonical value: npm spec, git URL (+ ref), SkillHub slug, archive URL/path. */
  value: string
  /** Git branch/tag or SkillHub version, when the caller supplied one. */
  ref?: string
  /** Human label used by the panel and the index. */
  label: string
  /** Optional subdirectory inside a git repository. */
  subdir?: string
}

export interface SkillInvocation {
  modelInvocable: boolean
  userInvocable: boolean
}

export interface SkillEntrySpec {
  /** Kebab-case public skill name. */
  name: string
  description: string
  whenToUse?: string
  /** SKILL.md path relative to the installed package root. */
  path: string
  invocation?: SkillInvocation
}

export interface McpSpec {
  /** Server key; namespaced by the manager before registration. */
  name: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  startupTimeoutMs?: number
  toolCallTimeoutMs?: number
  /** Set on catalog installs: which marketplace connector produced this entry. */
  catalogId?: string
}

/** One input the marketplace asks for before a connector can be connected. */
export interface ConnectorField {
  /** Placeholder name used inside the connector template, e.g. `token`. */
  key: string
  label: string
  hint?: string
  placeholder?: string
  /** The value is stored as a DSH credential, never in the store index. */
  secret?: boolean
  required?: boolean
}

export type ConnectorCategory = 'efficiency' | 'developer' | 'search' | 'data' | 'china' | 'demo'

/**
 * A connector the marketplace can install in one click.
 *
 * Values never live here: `env`, `headers`, `url` and `args` carry
 * `{{field}}` placeholders that become `${credential:REF}` templates, so the
 * index only ever holds a reference.
 */
export interface CatalogConnector {
  /** Stable id, also the MCP server name. */
  id: string
  name: string
  vendor: string
  category: ConnectorCategory
  description: string
  /** Single emoji shown on the card. */
  icon: string
  docs: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  fields: ConnectorField[]
}

/** Catalog entry plus what this store already knows about it. */
export interface CatalogConnectorView extends Omit<CatalogConnector, 'env' | 'headers'> {
  /** Credential reference names the connector will use (never their values). */
  credentialRefs: string[]
  installed: boolean
  entryId?: string
  enabled?: boolean
  /** Every required credential reference is present in the credentials store. */
  credentialReady: boolean
}

export interface DependencySpec {
  /** Node package manager marker: true when the package has a package.json. */
  node: boolean
  /** Python marker: true when requirements.txt or explicit Python packages exist. */
  python: boolean
  /** Explicit Python packages from the manifest. */
  pythonPackages: string[]
}

export interface Provenance {
  /** Where the bytes came from (kept free of credentials). */
  origin: string
  /** External agent root for imported skills, e.g. "claude-code". */
  agent?: string
}

/**
 * One MCP server used where another agent already configured it.
 *
 * Only the location is stored — never an env value or header — so a secret in
 * another agent's config never enters this store. The live entry is re-read
 * from `file` at registration time.
 */
export interface McpRef {
  /** Server key as written in the source config. */
  name: string
  /** Absolute path of the source config file. */
  file: string
  /** Stable platform key, e.g. claude-code. */
  agent: string
  /** Human label of that platform. */
  agentLabel: string
  /** Sub-scope inside one file (a Claude Code project path, for example). */
  scope?: string
}

/** A discovered MCP server in another agent's config, shown in the panel. */
export interface ExternalMcpCandidate {
  /** Stable key for selection: `agent|file|scope|name`. */
  key: string
  name: string
  agent: string
  agentLabel: string
  file: string
  scope?: string
  transport: 'stdio' | 'streamable-http'
  /** Display-only target: command line or URL. Never contains a secret. */
  summary: string
  /** Names of env/header keys (values are never read out). */
  envKeys: string[]
  /** True for a server this store already references. */
  linked: boolean
  linkedId?: string
  /** Set when the entry exists but cannot be referenced as-is. */
  invalid?: boolean
  invalidReason?: string
}

/** One config file that may hold MCP servers. */
export interface McpConfigSource {
  path: string
  agent: string
  label: string
  format: 'json' | 'toml'
}

/** A platform (agent) holding at least one MCP config file on this computer. */
export interface McpPlatformScan {
  agent: string
  label: string
  path: string
  count: number
}

/** Live connection state reported by DSH's MCP manager for one server. */
export interface McpServerStatus {
  registeredAs: string
  entryId: string
  entryName: string
  server: string
  /** e.g. connected | connecting | failed | waiting-credentials. */
  status: string
  configured: boolean
}

export interface InstalledSkill {
  /** Store id: lowercase kebab/dot segment, unique inside the store. */
  id: string
  /** Display name (manifest or frontmatter). */
  name: string
  version: string
  description: string
  source: { kind: SourceKind; value: string; ref?: string }
  /** Install directory relative to the store root (store-managed entries). */
  dir: string
  /** `store` for copied packages, `external` for a skill used in place. */
  origin: EntryOrigin
  /** Absolute directory of an external skill; absent for store-managed entries. */
  externalPath?: string
  enabled: boolean
  installedAt: string
  updatedAt: string
  skills: SkillEntrySpec[]
  /** Inline MCP servers stored in this index (never a config reference). */
  mcpServers: McpSpec[]
  /** MCP servers used where another agent configured them. */
  mcpRefs?: McpRef[]
  dependencies: DependencySpec
  /** Relative log path when a dependency install wrote one. */
  log?: string
  provenance?: Provenance
}

export interface StoreIndex {
  version: 1
  /** Monotonic stamp; written on every change so the Host watcher can debounce. */
  revision: number
  skills: Record<string, InstalledSkill>
}

export interface InstallOptions {
  enable?: boolean
  force?: boolean
  allowScripts?: boolean
  ref?: string
  skipDependencies?: boolean
}

export interface InstallResult {
  entry: InstalledSkill
  warnings: string[]
  logPath?: string
}

export interface LinkBatchResult {
  entries: InstallResult[]
  warnings: string[]
}

export interface PlatformScan {
  /** Stable platform key, e.g. claude-code. */
  agent: string
  /** Human label, e.g. Claude Code. */
  label: string
  /** Absolute root that was found on this computer. */
  path: string
  /** Number of skills discovered under that root. */
  count: number
}

export interface ExternalSkillCandidate {
  /** Absolute path of the skill directory. */
  path: string
  /** Directory name (not necessarily a valid DSH skill name). */
  folder: string
  name: string
  description: string
  agent: string
  agentLabel: string
  /** True when an identical name is already in this store. */
  installed: boolean
  /** True when this exact directory is already linked for direct use. */
  linked: boolean
  /** Store entry id of the link, when linked. */
  linkedId?: string
}

export interface SkillHubSearchItem {
  slug: string
  name: string
  description: string
  version: string
  downloads: number
  stars: number
  publisher: string
  verified: boolean
  requiresApiKey: boolean
  category: string
  iconUrl?: string
}
