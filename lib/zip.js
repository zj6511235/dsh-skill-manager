/**
 * Dependency-free ZIP reader.
 *
 * A skill archive is untrusted input, so extraction is bounded and refuses
 * the whole archive when it sees an encrypted entry, Zip64, a symbolic link,
 * an absolute path, a `..` escape or a size beyond the limits. Supporting a
 * subset is deliberate: a refusal names the reason instead of silently
 * unpacking something unexpected.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_NAME_BYTES = 1024;
export class ZipError extends Error {
}
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1)
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        table[index] = value >>> 0;
    }
    return table;
})();
function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer)
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}
/** Normalize an archive member name and refuse escapes. */
export function normalizeArchivePath(raw) {
    const path = raw.replace(/\\/g, '/');
    if (path.length === 0)
        throw new ZipError('empty archive member name');
    if (path.includes('\0'))
        throw new ZipError('archive member name contains NUL');
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path))
        throw new ZipError(`absolute archive path: ${path}`);
    const parts = [];
    for (const part of path.split('/')) {
        if (part === '' || part === '.')
            continue;
        if (part === '..')
            throw new ZipError(`archive path escapes the target: ${path}`);
        parts.push(part);
    }
    if (parts.length === 0)
        throw new ZipError('empty archive member name');
    return parts.join('/');
}
function readUInt32(buffer, offset) {
    return buffer.readUInt32LE(offset);
}
function findEndOfCentralDirectory(buffer) {
    const start = Math.max(0, buffer.length - 0xffff - 22);
    for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
        if (readUInt32(buffer, offset) === EOCD_SIGNATURE)
            return offset;
    }
    throw new ZipError('not a ZIP archive: end of central directory not found');
}
/** Extract a ZIP archive into `destination`; returns the written entries. */
export function extractZip(buffer, destination) {
    if (buffer.length > MAX_ARCHIVE_BYTES)
        throw new ZipError('ZIP archive is larger than the 256 MiB limit');
    const eocd = findEndOfCentralDirectory(buffer);
    const entriesTotal = buffer.readUInt16LE(eocd + 10);
    const centralSize = readUInt32(buffer, eocd + 12);
    const centralOffset = readUInt32(buffer, eocd + 16);
    if (entriesTotal === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
        throw new ZipError('Zip64 archives are not supported');
    }
    if (entriesTotal > MAX_ENTRIES)
        throw new ZipError(`ZIP has more than ${String(MAX_ENTRIES)} entries`);
    if (centralOffset + centralSize > buffer.length)
        throw new ZipError('corrupt ZIP central directory');
    let pointer = centralOffset;
    let totalBytes = 0;
    const written = [];
    for (let index = 0; index < entriesTotal; index += 1) {
        if (readUInt32(buffer, pointer) !== CENTRAL_SIGNATURE)
            throw new ZipError('corrupt ZIP central header');
        const flags = buffer.readUInt16LE(pointer + 8);
        const method = buffer.readUInt16LE(pointer + 10);
        const expectedCrc = readUInt32(buffer, pointer + 16);
        const compressedSize = readUInt32(buffer, pointer + 20);
        const uncompressedSize = readUInt32(buffer, pointer + 24);
        const nameLength = buffer.readUInt16LE(pointer + 28);
        const extraLength = buffer.readUInt16LE(pointer + 30);
        const commentLength = buffer.readUInt16LE(pointer + 32);
        const externalAttributes = readUInt32(buffer, pointer + 38);
        const localOffset = readUInt32(buffer, pointer + 42);
        if (nameLength > MAX_NAME_BYTES)
            throw new ZipError('ZIP member name is too long');
        const rawName = buffer.subarray(pointer + 46, pointer + 46 + nameLength).toString('utf8');
        const next = pointer + 46 + nameLength + extraLength + commentLength;
        if (next > buffer.length)
            throw new ZipError('corrupt ZIP central header');
        pointer = next;
        if ((flags & 0x0001) !== 0)
            throw new ZipError(`encrypted ZIP entry is not supported: ${rawName}`);
        if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff)
            throw new ZipError('Zip64 entry is not supported');
        if (uncompressedSize > MAX_FILE_BYTES)
            throw new ZipError(`ZIP entry is larger than 64 MiB: ${rawName}`);
        const mode = (externalAttributes >>> 16) & 0xf000;
        if (mode === 0xa000)
            throw new ZipError(`symbolic links are not allowed in skill archives: ${rawName}`);
        const rawPath = rawName;
        let path;
        try {
            path = normalizeArchivePath(rawPath);
        }
        catch (error) {
            throw new ZipError(error instanceof Error ? error.message : String(error));
        }
        if (path.startsWith('__MACOSX/') || path === '.DS_Store' || path.endsWith('/.DS_Store'))
            continue;
        const directory = rawName.endsWith('/') || rawName.endsWith('\\');
        if (directory) {
            mkdirSync(join(destination, path), { recursive: true });
            continue;
        }
        totalBytes += uncompressedSize;
        if (totalBytes > MAX_TOTAL_BYTES)
            throw new ZipError('ZIP expands beyond the 256 MiB limit');
        if (readUInt32(buffer, localOffset) !== LOCAL_SIGNATURE)
            throw new ZipError(`corrupt ZIP local header: ${path}`);
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > buffer.length)
            throw new ZipError(`truncated ZIP entry: ${path}`);
        const compressed = buffer.subarray(dataStart, dataEnd);
        let data;
        if (method === 0)
            data = Buffer.from(compressed);
        else if (method === 8) {
            try {
                data = inflateRawSync(compressed);
            }
            catch {
                throw new ZipError(`cannot inflate ZIP entry: ${path}`);
            }
        }
        else
            throw new ZipError(`unsupported ZIP compression method ${String(method)}: ${path}`);
        if (data.length !== uncompressedSize)
            throw new ZipError(`ZIP entry size mismatch: ${path}`);
        if (crc32(data) !== expectedCrc)
            throw new ZipError(`ZIP entry checksum mismatch: ${path}`);
        const target = join(destination, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, data, { mode: 0o644 });
        written.push({ path, directory: false, bytes: data.length });
    }
    return written;
}
