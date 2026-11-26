import { isAbsolute, normalize, relative, resolve, sep } from 'node:path'

/** Whether `candidate` is `root` itself or a descendant of it. */
export function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/**
 * Join a package-relative path under `root`, refusing absolute paths, `..`
 * escapes and NUL bytes. Archive extractors and manifest readers share this
 * one guard so a hostile zip cannot write outside the staging directory.
 */
export function safeJoin(root: string, path: string): string {
  if (typeof path !== 'string' || path.length === 0) throw new Error('empty path')
  if (path.includes('\0')) throw new Error('path contains NUL')
  const normalized = normalize(path).replace(/\\/g, '/')
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) throw new Error('absolute path')
  if (normalized === '..' || normalized.startsWith('../')) throw new Error('path escapes the package root')
  const joined = resolve(root, normalized)
  if (!isInside(root, joined)) throw new Error('path escapes the package root')
  return joined
}

/** Validate a store id / package slug. */
export function isValidStoreId(value: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value) && !value.includes('..')
}

/** Validate a public DSH skill name (kebab-case). */
export function isValidSkillName(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 64
}

/** Validate an MCP server key accepted by dsh-mcp-client. */
export function isValidServerName(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(value)
}

/** Lowercase a free-form name into a store id; returns '' when nothing usable remains. */
export function toStoreId(value: string): string {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 64)
    .replace(/[-._]+$/, '')
}
