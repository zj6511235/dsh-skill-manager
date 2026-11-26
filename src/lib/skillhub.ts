/**
 * SkillHub (skillhub.cn) public Open API client.
 *
 * Only public, unauthenticated endpoints are used: search, detail and the
 * per-slug ZIP download. Calls are bounded in time and bytes; a SkillHub
 * outage degrades to an empty search result rather than breaking the panel.
 */
import { writeFileSync } from 'node:fs'
import { SkillManagerError } from './errors.js'
import type { SkillHubSearchItem } from './types.js'

export const SKILLHUB_API = 'https://api.skillhub.cn'
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024
const SEARCH_TTL_MS = 60_000

interface SearchCacheEntry {
  at: number
  items: SkillHubSearchItem[]
  total: number
}

const searchCache = new Map<string, SearchCacheEntry>()

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function normalizeItem(raw: unknown): SkillHubSearchItem | undefined {
  const record = asRecord(raw)
  if (record === undefined) return undefined
  const slug = str(record.slug)
  if (slug.length === 0) return undefined
  const publisher = asRecord(record.publisher)
  const labels = asRecord(record.labels)
  const namespace = asRecord(record.namespace)
  const description = str(record.description_zh) || str(record.description) || str(record.summary) || ''
  return {
    slug,
    name: str(record.name) || str(record.displayName) || slug,
    description,
    version: str(record.version) || str(record.latestVersion),
    downloads: num(record.downloads),
    stars: num(record.stars),
    publisher: publisher === undefined ? str(record.ownerName) : str(publisher.name),
    verified: publisher !== undefined && publisher.verified === true,
    requiresApiKey: labels !== undefined && String(labels.requires_api_key) === 'true',
    category: str(record.category) || str(namespace?.handle),
    ...(typeof record.iconUrl === 'string' && record.iconUrl.startsWith('https://') ? { iconUrl: record.iconUrl } : {}),
  }
}

/** Search public SkillHub skills. Returns an empty page on timeout or malformed data. */
export async function searchSkillhub(query: string, page = 1, pageSize = 12): Promise<{ items: SkillHubSearchItem[]; total: number }> {
  const keyword = query.trim().slice(0, 120)
  const key = `${keyword}|${String(page)}|${String(pageSize)}`
  const cached = searchCache.get(key)
  if (cached !== undefined && Date.now() - cached.at < SEARCH_TTL_MS) return { items: cached.items, total: cached.total }
  const url = new URL(`${SKILLHUB_API}/api/skills`)
  if (keyword.length > 0) url.searchParams.set('keyword', keyword)
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageNum', String(page))
  url.searchParams.set('pageSize', String(pageSize))
  url.searchParams.set('sortBy', keyword.length > 0 ? 'score' : 'downloads')
  url.searchParams.set('order', 'desc')
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-skill-manager' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new SkillManagerError('fetch-failed', `连接 SkillHub 失败：${(error as Error).message}`)
  }
  if (!response.ok) throw new SkillManagerError('fetch-failed', `SkillHub 返回 HTTP ${String(response.status)}`)
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new SkillManagerError('fetch-failed', 'SkillHub 返回的不是 JSON')
  }
  const root = asRecord(payload)
  const data = root === undefined ? undefined : asRecord(root.data)
  const list = data === undefined ? undefined : data.skills
  if (!Array.isArray(list)) throw new SkillManagerError('fetch-failed', 'SkillHub 搜索响应缺少 skills 列表')
  const items = list.map(normalizeItem).filter((item): item is SkillHubSearchItem => item !== undefined)
  const total = data !== undefined && typeof data.total === 'number' ? data.total : items.length
  searchCache.set(key, { at: Date.now(), items, total })
  return { items, total }
}

/** Fetch one skill's public detail (used to show a version/author before install). */
export async function getSkillhubDetail(slug: string): Promise<SkillHubSearchItem> {
  let response: Response
  try {
    response = await fetch(`${SKILLHUB_API}/api/v1/skills/${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json', 'user-agent': 'dsh-skill-manager' },
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    throw new SkillManagerError('fetch-failed', `连接 SkillHub 失败：${(error as Error).message}`)
  }
  if (response.status === 404) throw new SkillManagerError('not-found', `SkillHub 上找不到技能：${slug}`)
  if (!response.ok) throw new SkillManagerError('fetch-failed', `SkillHub 返回 HTTP ${String(response.status)}`)
  const payload: unknown = await response.json().catch(() => undefined)
  const root = asRecord(payload)
  const skill = root === undefined ? undefined : asRecord(root.skill)
  const item = normalizeItem(skill)
  if (item === undefined) throw new SkillManagerError('fetch-failed', 'SkillHub 详情响应格式异常')
  return item
}

/** Download a SkillHub skill ZIP to `destination`; verifies the ZIP signature. */
export async function downloadSkillhub(slug: string, destination: string): Promise<{ bytes: number }> {
  const url = `${SKILLHUB_API}/api/v1/download?slug=${encodeURIComponent(slug)}`
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/zip, application/octet-stream', 'user-agent': 'dsh-skill-manager' },
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    throw new SkillManagerError('fetch-failed', `下载 SkillHub 技能失败：${(error as Error).message}`)
  }
  if (response.status === 404) throw new SkillManagerError('not-found', `SkillHub 上找不到技能：${slug}`)
  if (!response.ok) throw new SkillManagerError('fetch-failed', `SkillHub 下载返回 HTTP ${String(response.status)}`)
  const length = Number(response.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_DOWNLOAD_BYTES) {
    throw new SkillManagerError('fetch-failed', '技能包超过 128 MiB 上限')
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw new SkillManagerError('fetch-failed', `读取 SkillHub 响应失败：${(error as Error).message}`)
  }
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new SkillManagerError('fetch-failed', '技能包超过 128 MiB 上限')
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new SkillManagerError('unsupported-archive', 'SkillHub 返回的不是 ZIP 技能包')
  }
  writeFileSync(destination, buffer)
  return { bytes: buffer.length }
}
