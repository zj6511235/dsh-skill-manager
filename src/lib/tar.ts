/**
 * Dependency-free gzip/tar reader for npm tarballs and `.tar.gz` skill packs.
 * The same trust rules as the ZIP reader apply: bounded sizes, no symlinks,
 * no absolute paths and no `..` escape.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { normalizeArchivePath } from './zip.js'

const BLOCK = 512
const MAX_TOTAL_BYTES = 256 * 1024 * 1024
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_ENTRIES = 5000

export class TarError extends Error {}

export interface TarEntry {
  path: string
  directory: boolean
  bytes: number
}

function readString(buffer: Buffer, start: number, length: number): string {
  const slice = buffer.subarray(start, start + length)
  const zero = slice.indexOf(0)
  return slice.subarray(0, zero === -1 ? slice.length : zero).toString('utf8')
}

function readOctal(buffer: Buffer, start: number, length: number): number {
  const text = readString(buffer, start, length).trim()
  if (text.length === 0) return 0
  const value = Number.parseInt(text, 8)
  return Number.isFinite(value) ? value : 0
}

function parsePax(body: Buffer): Record<string, string> {
  const fields: Record<string, string> = {}
  let offset = 0
  while (offset < body.length) {
    const space = body.indexOf(0x20, offset)
    if (space === -1) break
    const length = Number.parseInt(body.subarray(offset, space).toString('ascii'), 10)
    if (!Number.isFinite(length) || length <= 0 || offset + length > body.length) break
    const record = body.subarray(space + 1, offset + length - 1).toString('utf8')
    const equals = record.indexOf('=')
    if (equals > 0) fields[record.slice(0, equals)] = record.slice(equals + 1)
    offset += length
  }
  return fields
}

/** Extract a (possibly gzipped) tar archive into `destination`. */
export function extractTar(buffer: Buffer, destination: string): TarEntry[] {
  let data = buffer
  if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
    try {
      data = gunzipSync(buffer, { maxOutputLength: MAX_TOTAL_BYTES })
    } catch {
      throw new TarError('cannot gunzip the tar archive (corrupt or larger than 256 MiB)')
    }
  }
  let offset = 0
  let totalBytes = 0
  let entries = 0
  let longName: string | undefined
  let pax: Record<string, string> = {}
  const written: TarEntry[] = []

  while (offset + BLOCK <= data.length) {
    const header = data.subarray(offset, offset + BLOCK)
    if (header.every(byte => byte === 0)) break
    const size = readOctal(header, 124, 12)
    const type = String.fromCharCode(header[156] ?? 0)
    const prefix = readString(header, 345, 155)
    let name = readString(header, 0, 100)
    const dataStart = offset + BLOCK
    const dataEnd = dataStart + size
    if (dataEnd > data.length) throw new TarError(`truncated tar entry: ${name}`)
    const body = data.subarray(dataStart, dataEnd)
    const next = dataStart + Math.ceil(size / BLOCK) * BLOCK

    if (type === 'x') {
      pax = parsePax(body)
      offset = next
      continue
    }
    if (type === 'g') {
      offset = next
      continue
    }
    if (type === 'L') {
      longName = readString(body, 0, body.length)
      offset = next
      continue
    }
    if (type === 'K') {
      offset = next
      continue
    }
    if (pax.path !== undefined) name = pax.path
    if (longName !== undefined) name = longName
    const paxSize = pax.size === undefined ? undefined : Number.parseInt(pax.size, 10)
    longName = undefined
    pax = {}
    if (type === '1' || type === '2') throw new TarError(`links are not allowed in skill archives: ${name}`)
    if (type !== '0' && type !== '\0' && type !== '5') {
      offset = next
      continue
    }
    if (name.length === 0) {
      offset = next
      continue
    }
    if (prefix.length > 0 && !name.startsWith('/')) name = `${prefix}/${name}`
    entries += 1
    if (entries > MAX_ENTRIES) throw new TarError(`tar has more than ${String(MAX_ENTRIES)} entries`)
    let path: string
    try {
      path = normalizeArchivePath(name)
    } catch (error) {
      throw new TarError(error instanceof Error ? error.message : String(error))
    }
    if (path.startsWith('__MACOSX/') || path === '.DS_Store' || path.endsWith('/.DS_Store')) {
      offset = next
      continue
    }
    if (type === '5') {
      mkdirSync(join(destination, path), { recursive: true })
      offset = next
      continue
    }
    const bytes = paxSize !== undefined && Number.isFinite(paxSize) ? paxSize : size
    if (bytes > body.length) throw new TarError(`tar entry is shorter than its pax size: ${path}`)
    if (bytes > MAX_FILE_BYTES) throw new TarError(`tar entry is larger than 64 MiB: ${path}`)
    totalBytes += bytes
    if (totalBytes > MAX_TOTAL_BYTES) throw new TarError('tar expands beyond the 256 MiB limit')
    const target = join(destination, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, body.subarray(0, Math.min(body.length, bytes)), { mode: 0o644 })
    written.push({ path, directory: false, bytes })
    offset = next
  }
  return written
}
