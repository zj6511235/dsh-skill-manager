import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseFrontmatter, pickString } from '../lib/frontmatter.js'
import { parsePackage, unwrapSingleRoot } from '../lib/manifest.js'
import { classifySource } from '../lib/source.js'
import { extractZip, ZipError } from '../lib/zip.js'
import { extractTar, TarError } from '../lib/tar.js'
import { redactSecrets } from '../lib/process.js'
import { SkillStore } from '../lib/store.js'
import { toStoreId } from '../lib/safe-path.js'
import { makeZip, makeTarGz, writeSkillDir } from './helpers.mjs'

function temp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

test('frontmatter: scalars, lists and block text', () => {
  const parsed = parseFrontmatter(`---
name: pdf-tools
description: "Work with PDFs safely"
whenToUse: when the user mentions PDF
tags: [pdf, docs]
---
Body line
`)
  assert.equal(parsed.data.name, 'pdf-tools')
  assert.equal(parsed.data.description, 'Work with PDFs safely')
  assert.deepEqual(parsed.data.tags, ['pdf', 'docs'])
  assert.equal(parsed.body.trim(), 'Body line')
  assert.equal(pickString(parsed.data, ['missing', 'name']), 'pdf-tools')
  assert.equal(parseFrontmatter('no frontmatter'), undefined)
})

test('zip: extracts files and normalizes paths', () => {
  const dir = temp('skm-zip-')
  try {
    const zip = makeZip([
      { name: 'SKILL.md', data: '# hi' },
      { name: 'scripts/run.py', data: 'print(1)' },
    ])
    const entries = extractZip(zip, dir)
    assert.equal(entries.length, 2)
    assert.equal(readFileSync(join(dir, 'scripts/run.py'), 'utf8'), 'print(1)')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('zip: refuses traversal and absolute paths', () => {
  for (const name of ['../evil.txt', '/abs.txt', 'a/../../b.txt']) {
    const dir = temp('skm-zip-bad-')
    try {
      assert.throws(() => extractZip(makeZip([{ name, data: 'x' }]), dir), ZipError)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

test('tar: extracts npm-style tar.gz', () => {
  const dir = temp('skm-tar-')
  try {
    const tar = makeTarGz([
      { name: 'package/SKILL.md', data: '# tar skill' },
      { name: 'package/lib/helper.js', data: 'export const x = 1' },
    ])
    extractTar(tar, dir)
    const root = unwrapSingleRoot(dir)
    assert.equal(readFileSync(join(root, 'SKILL.md'), 'utf8'), '# tar skill')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('tar: refuses traversal and links', () => {
  const dir = temp('skm-tar-bad-')
  try {
    assert.throws(() => extractTar(makeTarGz([{ name: '../evil', data: 'x' }]), dir), TarError)
    assert.throws(() => extractTar(makeTarGz([{ name: 'link', data: '', type: '2' }]), dir), TarError)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('manifest: SKILL.md and manifest.json (with MCP) normalize', () => {
  const dir = temp('skm-manifest-')
  try {
    writeSkillDir(join(dir, 'package'), {
      name: 'pdf-pack',
      skillName: 'pdf-tools',
      description: 'PDF helpers',
      manifest: {
        name: 'pdf-pack',
        version: '1.2.3',
        description: 'PDF helpers package',
        skills: [{ path: 'SKILL.md', description: 'PDF helpers' }],
        mcpServers: {
          pdf: { transport: 'stdio', command: 'npx', args: ['-y', 'pdf-mcp'], env: { TOKEN: '${credential:PDF_TOKEN}' } },
        },
      },
    })
    const parsed = parsePackage(join(dir, 'package'))
    assert.equal(parsed.id, 'pdf-pack')
    assert.equal(parsed.version, '1.2.3')
    assert.equal(parsed.skills[0].name, 'pdf-tools')
    assert.equal(parsed.mcpServers[0].name, 'pdf')
    assert.equal(parsed.mcpServers[0].transport, 'stdio')
    assert.deepEqual(parsed.mcpServers[0].args, ['-y', 'pdf-mcp'])
    assert.equal(parsed.mcpServers[0].env.TOKEN, '${credential:PDF_TOKEN}')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('manifest: rejects an invalid MCP server name', () => {
  const dir = temp('skm-manifest-bad-')
  try {
    writeSkillDir(dir, {
      manifest: { name: 'bad-mcp', mcpServers: { 'bad name!': { command: 'node' } } },
    })
    assert.throws(() => parsePackage(dir), error => {
      assert.equal(error.code, 'invalid-manifest')
      assert.match(error.message, /bad name!/)
      return true
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('source: classifies npm, GitHub, SkillHub, archives and local folders', () => {
  const cwd = temp('skm-source-')
  try {
    assert.equal(classifySource('@scope/pkg@1.2.3', cwd).kind, 'npm')
    assert.equal(classifySource('npm:is-number', cwd).kind, 'npm')
    assert.equal(classifySource('https://github.com/owner/repo', cwd).kind, 'git')
    assert.equal(classifySource('github:owner/repo#dev', cwd).ref, 'dev')
    assert.equal(classifySource('https://github.com/owner/repo/tree/main/skills/pdf', cwd).subdir, 'skills/pdf')
    assert.equal(classifySource('skillhub:find-skill-skillhub', cwd).kind, 'skillhub')
    assert.equal(classifySource('https://skillhub.cn/skills/find-skill-skillhub', cwd).value, 'find-skill-skillhub')
    assert.equal(classifySource('https://example.com/download?id=1', cwd).kind, 'archive')
    const dir = join(cwd, 'local-skill')
    mkdirSync(dir)
    assert.equal(classifySource(dir, cwd).kind, 'local')
    assert.throws(() => classifySource('not a source!!', cwd), error => error.code === 'invalid-source')
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
})

test('store: install from ZIP, disable and remove', async () => {
  const root = temp('skm-store-')
  const source = temp('skm-src-')
  try {
    writeSkillDir(source, { name: 'demo-skill', description: 'Demo' })
    const zip = makeZip([
      { name: 'package/SKILL.md', data: readFileSync(join(source, 'SKILL.md')) },
    ])
    const zipPath = join(root, 'demo.zip')
    writeFileSync(zipPath, zip)
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const result = await store.install(zipPath)
    assert.equal(result.entry.id, 'demo-skill')
    assert.equal(result.entry.enabled, true)
    assert.equal(store.list().length, 1)
    assert.ok(existsSync(join(store.dir, 'skills', 'demo-skill', 'SKILL.md')))
    assert.ok(existsSync(join(store.dir, 'skills', 'demo-skill', 'skill.json')))

    const disabled = await store.setEnabled('demo-skill', false)
    assert.equal(disabled.enabled, false)
    assert.equal(store.status().enabled, 0)

    const removed = await store.remove('demo-skill')
    assert.equal(removed.id, 'demo-skill')
    assert.equal(store.list().length, 0)
    assert.ok(!existsSync(join(store.dir, 'skills', 'demo-skill')))
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(source, { recursive: true, force: true })
  }
})

test('store: import from another agent and scan marks it installed', async () => {
  const root = temp('skm-import-')
  try {
    const external = join(root, '.claude', 'skills', 'writer')
    writeSkillDir(external, { name: 'writer', description: 'Write things' })
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const imported = await store.importFrom(external)
    assert.equal(imported.entry.id, 'writer')
    assert.equal(imported.entry.provenance.origin, external)
    const found = store.scanExternal().find(item => item.name === 'writer')
    assert.ok(found !== undefined)
    assert.equal(found.installed, true)
    const report = store.scanReport()
    const claude = report.platforms.find(platform => platform.agent === 'claude-code')
    assert.ok(claude !== undefined)
    assert.equal(claude.count, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: direct-use link keeps the original and unlink leaves it alone', async () => {
  const root = temp('skm-link-')
  try {
    const external = join(root, '.claude', 'skills', 'linked-writer')
    writeSkillDir(external, { name: 'linked-writer', description: 'Used in place' })
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const result = await store.linkExternal(external)
    assert.equal(result.entry.id, 'linked-writer')
    assert.equal(result.entry.origin, 'external')
    assert.equal(result.entry.externalPath, external)
    assert.ok(existsSync(join(external, 'SKILL.md')))
    assert.ok(!existsSync(join(store.dir, 'skills', 'linked-writer')))
    const candidate = store.scanExternal().find(item => item.name === 'linked-writer')
    assert.equal(candidate.linked, true)
    assert.equal(candidate.linkedId, 'linked-writer')

    const removed = await store.remove('linked-writer')
    assert.equal(removed.origin, 'external')
    assert.equal(store.list().length, 0)
    assert.ok(existsSync(join(external, 'SKILL.md')), 'unlink must not delete the original')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: batch direct-use links several agents in one transaction', async () => {
  const root = temp('skm-link-many-')
  try {
    const first = writeSkillDir(join(root, '.claude', 'skills', 'alpha'), { name: 'alpha' })
    const second = writeSkillDir(join(root, '.codex', 'skills', 'beta'), { name: 'beta' })
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const batch = await store.linkMany([first, second])
    assert.equal(batch.entries.length, 2)
    assert.deepEqual(store.list().map(entry => entry.id).sort(), ['alpha', 'beta'])
    assert.ok(store.list().every(entry => entry.origin === 'external'))
    await store.remove('alpha')
    await store.remove('beta')
    assert.ok(existsSync(join(first, 'SKILL.md')))
    assert.ok(existsSync(join(second, 'SKILL.md')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: linkMany has no 100-skill cap (select-all registers every skill)', async () => {
  const root = temp('skm-link-all-')
  try {
    const paths = []
    const total = 120
    for (let index = 0; index < total; index += 1) {
      paths.push(writeSkillDir(join(root, 'agents', `agent-${index}`, 'skills', `skill-${index}`), {
        name: `skill-${index}`,
        description: `bulk skill ${index}`,
      }))
    }
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const batch = await store.linkMany(paths)
    assert.equal(batch.entries.length, total)
    assert.equal(store.list().length, total)
    assert.ok(store.list().every(entry => entry.origin === 'external'))
    // References are a standby queue, not installs: the overview must report
    // them under `external`, never under copied `count`/`enabled`.
    const summary = store.status()
    assert.equal(summary.count, 0)
    assert.equal(summary.enabled, total)
    assert.equal(summary.external, total)
    assert.equal(summary.skills, total)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: linkMany skips a broken folder and still links the rest', async () => {
  const root = temp('skm-link-skip-')
  try {
    const good = writeSkillDir(join(root, 'good'), { name: 'good-skill' })
    const broken = join(root, 'broken')
    mkdirSync(broken, { recursive: true })
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const batch = await store.linkMany([good, broken])
    assert.equal(batch.entries.length, 1)
    assert.equal(batch.entries[0].entry.id, 'good-skill')
    assert.ok(batch.warnings.some(message => message.includes('缺少 SKILL.md')))
    assert.deepEqual(store.list().map(entry => entry.id), ['good-skill'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: a failing dependency install restores the previous version', async () => {
  const root = temp('skm-fail-')
  process.env.npm_config_cache = join(root, '.npm-cache')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const first = join(root, 'first')
    writeSkillDir(first, {
      name: 'broken',
      manifest: { name: 'broken', version: '1.0.0', dependencies: { node: [] } },
    })
    writeFileSync(join(first, 'package.json'), JSON.stringify({ name: 'broken', version: '1.0.0' }))
    const installed = await store.install(first, { skipDependencies: true })
    assert.equal(installed.entry.version, '1.0.0')

    const second = join(root, 'second')
    writeSkillDir(second, { name: 'broken', manifest: { name: 'broken', version: '2.0.0' } })
    // Invalid JSON makes npm fail immediately, without a network call.
    writeFileSync(join(second, 'package.json'), '{ not json')
    await assert.rejects(() => store.install(second, { force: true }))
    const after = store.get('broken')
    assert.equal(after.version, '1.0.0')
    assert.ok(existsSync(join(store.dir, 'skills', 'broken', 'SKILL.md')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('redact: strips tokens and private keys', () => {
  const skillhubToken = ['skh', 'a'.repeat(24)].join('_')
  const githubToken = ['ghp', 'b'.repeat(36)].join('_')
  const bearer = 'c'.repeat(24)
  const text = `token=${skillhubToken} ${githubToken} Bearer ${bearer}`
  const redacted = redactSecrets(text)
  assert.ok(!redacted.includes(skillhubToken))
  assert.ok(!redacted.includes(githubToken))
  assert.ok(!redacted.includes(bearer))
})

test('ids: store id normalization refuses path separators', () => {
  assert.equal(toStoreId('@scope/My Skill'), 'scope-my-skill')
  assert.equal(toStoreId('../../etc'), 'etc')
  assert.ok(!toStoreId('../../etc').includes('..'))
})
