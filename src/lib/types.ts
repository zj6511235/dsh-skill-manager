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
  mcpServers: McpSpec[]
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
