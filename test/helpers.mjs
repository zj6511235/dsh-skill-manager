import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync, deflateRawSync } from 'node:zlib'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[index] = value >>> 0
  }
  return table
})()

export function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** Minimal ZIP writer (deflate) for fixtures. */
export function makeZip(entries) {
  const locals = []
  const central = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.data)
    const compressed = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(8, 10)
    header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(compressed.length, 20)
    header.writeUInt32LE(data.length, 24)
    header.writeUInt16LE(name.length, 28)
    header.writeUInt32LE(offset, 42)
    central.push(header, name)
    offset += local.length + name.length + compressed.length
  }
  const centralBuffer = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralBuffer.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, centralBuffer, eocd])
}

function tarHeader(name, size, type = '0') {
  const header = Buffer.alloc(512)
  header.write(name, 0, 100, 'utf8')
  header.write('0000644\0', 100, 8, 'ascii')
  header.write('0000000\0', 108, 8, 'ascii')
  header.write('0000000\0', 116, 8, 'ascii')
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii')
  header.write('00000000000\0', 136, 12, 'ascii')
  header.write('        ', 148, 8, 'ascii')
  header.write(type, 156, 1, 'ascii')
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  let checksum = 0
  for (const byte of header) checksum += byte
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
  return header
}

/** Minimal tar.gz writer for fixtures. */
export function makeTarGz(entries) {
  const parts = []
  for (const entry of entries) {
    const data = Buffer.from(entry.data)
    parts.push(tarHeader(entry.name, data.length, entry.type ?? '0'), data)
    const padding = (512 - (data.length % 512)) % 512
    if (padding > 0) parts.push(Buffer.alloc(padding))
  }
  parts.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(parts))
}

export function writeSkillDir(root, options = {}) {
  const name = options.name ?? 'demo-skill'
  mkdirSync(root, { recursive: true })
  const frontmatter = [
    '---',
    `name: ${options.skillName ?? name}`,
    `description: ${options.description ?? 'A demo skill.'}`,
    ...(options.whenToUse === undefined ? [] : [`whenToUse: ${options.whenToUse}`]),
    '---',
    '',
    `# ${name}`,
    '',
    'Follow these steps.',
    '',
  ].join('\n')
  writeFileSync(join(root, 'SKILL.md'), frontmatter, 'utf8')
  if (options.manifest !== undefined) {
    writeFileSync(join(root, 'manifest.json'), `${JSON.stringify(options.manifest, null, 2)}\n`, 'utf8')
  }
  return root
}

export function fakeResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writableEnded: false,
    setHeader(key, value) { this.headers[key] = value },
    end(chunk) {
      this.body = chunk === undefined ? '' : String(chunk)
      this.writableEnded = true
    },
  }
}

export function parseBody(response) {
  return response.body.length === 0 ? undefined : JSON.parse(response.body)
}
