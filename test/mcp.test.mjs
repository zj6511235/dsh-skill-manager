/**
 * MCP reference feature: scanning other agents' configs, adding a connector by
 * pasting a config, referencing one in place, and registering it with DSH.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { SkillStore } from '../lib/store.js'
import { RegistrationController } from '../lib/registry.js'
import { createApi } from '../host-api.js'
import {
  isKnownMcpFile,
  knownMcpConfigs,
  maskSummary,
  normalizeServerSpec,
  parseToml,
  readServerFromConfig,
  resolveMcpRef,
  scanExternalMcp,
} from '../lib/mcp-scan.js'
import { fakeResponse, parseBody } from './helpers.mjs'

function temp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

const SECRET = 'sk-super-secret-value'

function writeClaudeCodeConfig(home) {
  writeFileSync(join(home, '.claude.json'), JSON.stringify({
    mcpServers: {
      fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], env: { TOKEN: SECRET } },
    },
    projects: {
      'C:\\work\\demo': {
        mcpServers: {
          'project-db': { command: 'node', args: ['db.js'], env: { DB_PASSWORD: SECRET } },
        },
      },
    },
  }, null, 2), 'utf8')
}

function writeCursorConfig(home) {
  mkdirSync(join(home, '.cursor'), { recursive: true })
  writeFileSync(join(home, '.cursor', 'mcp.json'), JSON.stringify({
    mcpServers: {
      github: { command: 'npx', args: ['-y', 'github-mcp'], env: { GITHUB_TOKEN: SECRET } },
      remote: { url: 'https://mcp.example.com/mcp', headers: { Authorization: `Bearer ${SECRET}` } },
    },
  }, null, 2), 'utf8')
}

function writeCodexConfig(home) {
  mkdirSync(join(home, '.codex'), { recursive: true })
  writeFileSync(join(home, '.codex', 'config.toml'), [
    '# Codex MCP servers',
    '[mcp_servers.docs]',
    'command = "npx"',
    'args = ["-y", "docs-mcp"]',
    'startup_timeout_sec = 20',
    '',
    '[mcp_servers.docs.env]',
    'DOCS_TOKEN = "plain-secret"',
    '',
    '[mcp_servers.search]',
    'url = "https://search.example.com/mcp"',
    'http_headers = { Authorization = "Bearer abc" }',
    '',
  ].join('\n'), 'utf8')
}

test('mcp scan: reads Claude Code, Cursor and Codex configs without leaking values', () => {
  const home = temp('skm-mcpscan-')
  try {
    writeClaudeCodeConfig(home)
    writeCursorConfig(home)
    writeCodexConfig(home)
    const report = scanExternalMcp({ home, cwd: home, env: { APPDATA: join(home, 'AppData', 'Roaming') }, platformName: 'win32' })
    const names = report.candidates.map(candidate => candidate.name).sort()
    assert.deepEqual(names, ['docs', 'fs', 'github', 'project-db', 'remote', 'search'])
    // A candidate may describe a credential field but never its value.
    const serialized = JSON.stringify(report)
    assert.equal(serialized.includes(SECRET), false)
    assert.equal(serialized.includes('plain-secret'), false)
    const github = report.candidates.find(candidate => candidate.name === 'github')
    assert.equal(github.transport, 'stdio')
    assert.deepEqual(github.envKeys, ['GITHUB_TOKEN'])
    assert.equal(github.linked, false)
    const projectDb = report.candidates.find(candidate => candidate.name === 'project-db')
    assert.equal(projectDb.scope, 'C:\\work\\demo')
    const remote = report.candidates.find(candidate => candidate.name === 'remote')
    assert.equal(remote.transport, 'streamable-http')
    assert.deepEqual(remote.envKeys, ['Authorization'])
    assert.ok(report.platforms.some(platform => platform.agent === 'claude-code' && platform.count === 2))
    assert.ok(report.platforms.some(platform => platform.agent === 'codex' && platform.count === 2))

    // Registration re-reads the real values from the source file.
    const fsSpec = resolveMcpRef({ name: 'fs', file: join(home, '.claude.json'), agent: 'claude-code', agentLabel: 'Claude Code' })
    assert.equal(fsSpec.env.TOKEN, SECRET)
    const codex = readServerFromConfig(join(home, '.codex', 'config.toml'), 'toml', 'docs')
    assert.equal(codex.env.DOCS_TOKEN, 'plain-secret')
    assert.equal(codex.startupTimeoutMs, 20_000)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('mcp scan: toml subset, normalization and masked summaries', () => {  const parsed = parseToml([
    '[mcp_servers.a]',
    'command = "npx"',
    'args = ["-y", "pkg", "sub"]',
    'env = { TOKEN = "x", FLAG = "true" }',
    'enabled = false',
    '',
    '[[weird]]',
    'ignored = 1',
  ].join('\n'))
  assert.equal(parsed.mcp_servers.a.command, 'npx')
  assert.deepEqual(parsed.mcp_servers.a.args, ['-y', 'pkg', 'sub'])
  assert.deepEqual(parsed.mcp_servers.a.env, { TOKEN: 'x', FLAG: 'true' })

  const vscode = normalizeServerSpec('web', { type: 'http', url: 'https://example.com/mcp', headers: { A: 'b' } })
  assert.equal(vscode.spec.transport, 'streamable-http')
  assert.equal(normalizeServerSpec('bad', { args: [] }).skip, 'invalid')
  assert.equal(normalizeServerSpec('off', { command: 'x', enabled: false }).skip, 'disabled')
  assert.equal(normalizeServerSpec('bad name!', { command: 'x' }).skip, 'invalid')

  const masked = maskSummary({ name: 'fs', transport: 'stdio', command: 'npx', args: ['-y', 'pkg', '${credential:TOKEN}'] })
  assert.equal(masked, 'npx -y pkg •••')
  assert.equal(maskSummary({ name: 'r', transport: 'streamable-http', url: 'https://mcp.example.com/v1?key=abc' }), 'https://mcp.example.com/v1')
  assert.equal(maskSummary({ name: 'p', transport: 'stdio', command: 'cmd', args: ['/c', 'node.exe', 'C:\\work\\server.js'] }), 'cmd /c node.exe server.js')
})

test('mcp scan: lists an unusable server as invalid and omits a disabled one', () => {
  const home = temp('skm-mcpinvalid-')
  try {
    mkdirSync(join(home, '.cursor'), { recursive: true })
    writeFileSync(join(home, '.cursor', 'mcp.json'), JSON.stringify({
      mcpServers: {
        'this-server-name-is-much-too-long-for-dsh': { command: 'npx' },
        off: { command: 'x', disabled: true },
        good: { command: 'node', args: ['a.js'] },
      },
    }), 'utf8')
    const report = scanExternalMcp({ home, cwd: home, env: { APPDATA: join(home, 'AppData', 'Roaming') }, platformName: 'win32' })
    assert.deepEqual(report.candidates.map(candidate => candidate.name).sort(), ['good', 'this-server-name-is-much-too-long-for-dsh'])
    const invalid = report.candidates.find(candidate => candidate.invalid === true)
    assert.match(invalid.invalidReason, /不合法/)
    assert.equal(invalid.linked, false)
    assert.equal(report.platforms.find(platform => platform.agent === 'cursor').count, 2)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('store: install a pasted MCP config as its own entry', async () => {
  const root = temp('skm-mcpadd-')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const batch = await store.installMcp(JSON.stringify({
      mcpServers: {
        github: { command: 'npx', args: ['-y', 'github-mcp'], env: { GITHUB_TOKEN: '${credential:GITHUB_TOKEN}' } },
        web: { type: 'http', url: 'https://example.com/mcp' },
        off: { command: 'x', disabled: true },
      },
    }))
    assert.equal(batch.entries.length, 2)
    assert.ok(batch.warnings.some(warning => warning.includes('off')))
    const list = store.list()
    assert.equal(list.length, 2)
    assert.ok(list.every(entry => entry.skills.length === 0 && entry.mcpServers.length === 1))
    assert.equal(store.status().mcp, 2)
    assert.equal(store.status().mcpServers, 2)
    assert.equal(store.mcpEntries().length, 2)

    // Adding the same server again updates in place instead of duplicating.
    const again = await store.installMcp(JSON.stringify({ mcpServers: { github: { command: 'npx', args: ['-y', 'github-mcp@2'] } } }))
    assert.equal(again.entries.length, 1)
    assert.equal(store.list().length, 2)
    assert.deepEqual(store.get('mcp-github').mcpServers[0].args, ['-y', 'github-mcp@2'])

    // VS Code shape and a bare single server object are accepted too.
    const vscode = await store.installMcp(JSON.stringify({ servers: { local: { type: 'stdio', command: 'node', args: ['x.js'] } } }))
    assert.equal(vscode.entries[0].entry.name, 'local')
    const single = await store.installMcp(JSON.stringify({ name: 'solo', command: 'node', args: ['solo.js'] }))
    assert.equal(single.entries[0].entry.mcpServers[0].name, 'solo')

    await store.setEnabled('mcp-github', false)
    assert.equal(store.status().mcpServers, 3)
    const removed = await store.remove('mcp-solo')
    assert.equal(removed.id, 'mcp-solo')
    assert.throws(() => store.parseMcpInput('not json'), /不是合法 JSON/)
    assert.throws(() => store.parseMcpInput('{"nope":1}'), /无法识别/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('store: reference an MCP server in place, keeping its secret out of the store', async () => {
  const root = temp('skm-mcplink-')
  try {
    writeCursorConfig(root)
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const ref = {
      name: 'github',
      file: join(root, '.cursor', 'mcp.json'),
      agent: 'cursor',
      agentLabel: 'Cursor',
    }
    const batch = await store.linkMcpRefs([ref])
    const entry = batch.entries[0].entry
    assert.equal(entry.origin, 'external')
    assert.equal(entry.mcpRefs.length, 1)
    assert.equal(entry.skills.length, 0)

    // The store on disk records the location only.
    const indexText = readFileSync(join(root, 'store', 'index.json'), 'utf8')
    assert.equal(indexText.includes(SECRET), false)
    const stored = JSON.parse(indexText).skills[entry.id]
    assert.equal(stored.mcpRefs[0].file, join(root, '.cursor', 'mcp.json'))

    const report = store.scanMcpReport()
    const github = report.candidates.find(candidate => candidate.name === 'github')
    assert.equal(github.linked, true)
    assert.equal(github.linkedId, entry.id)

    // Idempotent second reference.
    const again = await store.linkMcpRefs([ref])
    assert.equal(again.entries.length, 1)
    assert.equal(store.list().length, 1)

    // An unknown file is refused, so the route cannot read arbitrary paths.
    const outside = join(root, 'elsewhere.json')
    writeFileSync(outside, JSON.stringify({ mcpServers: { evil: { command: 'x' } } }), 'utf8')
    await assert.rejects(
      () => store.linkMcpRefs([{ ...ref, name: 'evil', file: outside }]),
      /不是已知的 MCP 配置文件/,
    )

    const allowed = knownMcpConfigs(root, root, { APPDATA: join(root, 'AppData', 'Roaming') }, 'win32')
    assert.equal(isKnownMcpFile(join(root, '.cursor', 'mcp.json'), allowed), true)
    assert.equal(isKnownMcpFile(outside, allowed), false)

    await store.remove(entry.id)
    assert.equal(existsSync(join(root, '.cursor', 'mcp.json')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('registry: registers an MCP-only entry, resolves references live and probes', async () => {
  const root = temp('skm-mcpreg-')
  try {
    writeCursorConfig(root)
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const linked = await store.linkMcpRefs([{
      name: 'github',
      file: join(root, '.cursor', 'mcp.json'),
      agent: 'cursor',
      agentLabel: 'Cursor',
    }])
    await store.installMcp(JSON.stringify({
      mcpServers: { inline: { command: 'npx', args: ['-y', 'inline-mcp'], env: { TOKEN: 'plain' } } },
    }))

    const registered = []
    const probed = []
    const disposed = []
    const mcp = {
      register(name, entry) {
        registered.push({ name, entry })
        return () => disposed.push(`mcp:${name}`)
      },
      list() {
        return registered.map(row => ({ name: row.name, configured: false, status: 'connected' }))
      },
      probe(name) {
        probed.push(name)
        return { tools: ['ping'] }
      },
    }
    const controller = new RegistrationController({}, store)
    controller.attachMcp(mcp)
    await controller.refreshNow()
    assert.equal(registered.length, 2)
    const refRow = registered.find(row => row.name.includes('cursor'))
    assert.equal(refRow.entry.transport, 'stdio')
    assert.equal(refRow.entry.env.GITHUB_TOKEN, SECRET)
    // A referenced server has no package folder: no cwd is invented for it.
    assert.equal('cwd' in refRow.entry, false)
    const inline = registered.find(row => row.name.includes('inline'))
    assert.equal(inline.entry.env.TOKEN, 'plain')

    const rows = controller.mcpRows()
    assert.equal(rows.length, 2)
    assert.ok(rows.every(row => row.status === 'connected'))

    const probe = await controller.probe(linked.entries[0].entry.id, 'github')
    assert.equal(probe.ok, true)
    assert.deepEqual(probe.result, { tools: ['ping'] })
    assert.equal(probed.length, 1)

    // Disabling removes the registration and reports the state.
    await store.setEnabled(linked.entries[0].entry.id, false)
    await controller.refreshNow()
    assert.ok(controller.mcpRows().some(row => row.status === 'disabled'))
    assert.equal(registered.length, 3)
    controller.dispose()
    assert.ok(disposed.length >= 3)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('host api: /mcp lists, adds, links by key and probes', async () => {
  const root = temp('skm-mcpapi-')
  try {
    writeCursorConfig(root)
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const probed = []
    const registry = {
      capabilities: () => ({ skills: true, mcp: true, probe: true }),
      warnings: [],
      mcpRows: () => [],
      refreshNow: async () => {},
      probe: async (id, server) => {
        probed.push(`${id}/${server}`)
        return { ok: true, result: { tools: [] } }
      },
    }
    const handler = createApi({ store, registry, version: '0.0.0-test' })
    const call = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
      req.method = method
      const res = fakeResponse()
      await handler(req, res, new URL(`http://localhost${path}`))
      return { status: res.statusCode, body: parseBody(res) }
    }

    const listed = await call('GET', '/mcp')
    assert.equal(listed.status, 200)
    assert.ok(listed.body.candidates.some(candidate => candidate.name === 'github'))
    assert.ok(listed.body.platforms.length > 0)
    assert.equal(listed.body.capabilities.probe, true)
    assert.equal(JSON.stringify(listed.body).includes(SECRET), false)

    const added = await call('POST', '/mcp/add', {
      json: JSON.stringify({ mcpServers: { web: { type: 'http', url: 'https://example.com/mcp' } } }),
    })
    assert.equal(added.status, 200)
    assert.equal(added.body.entry.id, 'mcp-web')
    assert.equal(added.body.entry.kind, 'mcp')
    assert.equal(added.body.entry.mcpServers[0].transport, 'streamable-http')

    const badAdd = await call('POST', '/mcp/add', { json: '{oops' })
    assert.equal(badAdd.status, 400)
    assert.equal(badAdd.body.code, 'invalid-source')

    const noKeys = await call('POST', '/mcp/link', {})
    assert.equal(noKeys.status, 400)

    const keys = listed.body.candidates
      .filter(candidate => candidate.name === 'github')
      .map(candidate => candidate.key)
    const linked = await call('POST', '/mcp/link', { keys })
    assert.equal(linked.status, 200)
    assert.equal(linked.body.entries.length, 1)
    assert.equal(linked.body.entries[0].entry.origin, 'external')
    assert.equal(linked.body.entries[0].entry.mcpRefs[0].agent, 'cursor')

    const unknown = await call('POST', '/mcp/link', { keys: ['nope|nope|nope|nope'] })
    assert.equal(unknown.status, 400)
    assert.equal(unknown.body.code, 'not-found')

    const probe = await call('POST', '/mcp/probe', { id: 'mcp-web', server: 'web' })
    assert.equal(probe.status, 200)
    assert.equal(probe.body.ok, true)
    assert.deepEqual(probed, ['mcp-web/web'])

    const missing = await call('POST', '/mcp/probe', { id: 'mcp-web' })
    assert.equal(missing.status, 400)

    const after = await call('GET', '/mcp')
    assert.equal(after.body.entries.length, 2)
    assert.ok(after.body.candidates.some(candidate => candidate.name === 'github' && candidate.linked === true))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
