/**
 * Connector marketplace: catalog integrity, credential templating, the
 * one-click install route and the Windows launcher wrapper.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { SkillStore } from '../lib/store.js'
import { RegistrationController } from '../lib/registry.js'
import { createApi } from '../host-api.js'
import {
  buildConnectorSpec,
  catalogConnectors,
  catalogView,
  connectorCredentialRefs,
  credentialRefFor,
  validateFieldValues,
} from '../lib/catalog.js'
import { fakeResponse, parseBody } from './helpers.mjs'

function temp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

const SECRET = 'ntn-marketplace-secret'

function fakeCredentials() {
  const values = new Map()
  return {
    values,
    async set(ref, value) { values.set(ref, value) },
    async unset(ref) { values.delete(ref) },
    async describe(ref) { return { configured: values.has(ref) } },
  }
}

test('catalog: every connector is a valid, secret-free entry', () => {
  const seen = new Set()
  for (const connector of catalogConnectors()) {
    assert.match(connector.id, /^[A-Za-z0-9_-]{1,32}$/, connector.id)
    assert.equal(seen.has(connector.id), false, `duplicate id ${connector.id}`)
    seen.add(connector.id)
    assert.ok(connector.name.length > 0)
    assert.ok(connector.description.length > 0)
    assert.match(connector.docs, /^https:\/\//)
    assert.ok(connector.icon.length > 0)
    if (connector.transport === 'stdio') assert.ok((connector.command ?? '').length > 0, connector.id)
    else assert.match(connector.url ?? '', /^https:\/\//, connector.id)

    const refs = connectorCredentialRefs(connector)
    for (const ref of refs) {
      // Credential references are POSIX identifiers, never values.
      assert.match(ref, /^[A-Z_][A-Z0-9_]*$/, ref)
    }
    // Every placeholder names a declared field, and a required field names a ref.
    const declared = new Set(connector.fields.map(field => field.key))
    const spec = buildConnectorSpec(connector)
    const text = JSON.stringify(spec)
    assert.equal(text.includes('{{'), false, connector.id)
    for (const match of text.matchAll(/\$\{credential:([^}]+)\}/g)) {
      assert.ok([...declared].some(field => match[1] === credentialRefFor(connector.id, field)), `${connector.id}: ${match[1]}`)
    }
    for (const field of connector.fields) {
      if (field.required !== true) continue
      assert.ok(refs.includes(credentialRefFor(connector.id, field.key)), `${connector.id}/${field.key}`)
    }
    // The panel never receives an env or header value: only the shape.
    const view = catalogView(connector, undefined, refs.length === 0)
    const serialized = JSON.stringify(view)
    assert.equal(serialized.includes('{{'), false)
    assert.equal(view.installed, false)
  }
  assert.ok(catalogConnectors().length >= 10)
})

test('catalog: an optional blank field is dropped instead of left unresolved', () => {
  const context7 = catalogConnectors().find(connector => connector.id === 'context7')
  assert.ok(context7)
  const withKey = buildConnectorSpec(context7, new Set(['key']))
  assert.deepEqual(withKey.args, ['-y', '@upstash/context7-mcp', '--api-key', '${credential:SKM_CONTEXT7_KEY}'])
  // The flag goes with the value: a dangling `--api-key` would break startup.
  const withoutKey = buildConnectorSpec(context7, new Set())
  assert.deepEqual(withoutKey.args, ['-y', '@upstash/context7-mcp'])
})

test('catalog: field values are validated before they reach a command line', () => {
  const filesystem = catalogConnectors().find(connector => connector.id === 'filesystem')
  assert.ok(filesystem)
  const missing = validateFieldValues(filesystem, {})
  assert.deepEqual(missing.missing.map(field => field.key), ['dir'])
  const quoted = validateFieldValues(filesystem, { dir: 'C:\\a"b' })
  assert.match(quoted.problem ?? '', /引号/)
  const ok = validateFieldValues(filesystem, { dir: '  C:\\notes  ' })
  assert.deepEqual(ok.clean, { dir: 'C:\\notes' })
})

test('host api: /catalog installs with credentials, lists state and cleans up', async () => {
  const root = temp('skm-catalog-')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const registry = {
      capabilities: () => ({ skills: true, mcp: true, probe: true }),
      warnings: [],
      mcpRows: () => [],
      refreshNow: async () => {},
      probe: async () => ({ ok: true }),
    }
    const credentials = fakeCredentials()
    const handler = createApi({ store, registry, version: '0.0.0-test', credentials: () => credentials })
    const call = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
      req.method = method
      const res = fakeResponse()
      await handler(req, res, new URL(`http://localhost${path}`))
      return { status: res.statusCode, body: parseBody(res) }
    }

    const listed = await call('GET', '/catalog')
    assert.equal(listed.status, 200)
    assert.equal(listed.body.credentials, true)
    const notion = listed.body.entries.find(entry => entry.id === 'notion')
    assert.equal(notion.installed, false)
    assert.equal(notion.credentialReady, false)
    assert.deepEqual(notion.credentialRefs, ['SKM_NOTION_TOKEN'])
    assert.equal(JSON.stringify(listed.body).includes('{{'), false)

    const missing = await call('POST', '/catalog/install', { id: 'notion', values: {} })
    assert.equal(missing.status, 400)
    assert.deepEqual(missing.body.missing, ['token'])

    const unknown = await call('POST', '/catalog/install', { id: 'nope' })
    assert.equal(unknown.status, 404)

    const installed = await call('POST', '/catalog/install', { id: 'notion', values: { token: SECRET } })
    assert.equal(installed.status, 200)
    assert.equal(installed.body.entry.id, 'mcp-notion')
    assert.equal(installed.body.entry.source.value, 'catalog:notion')
    assert.equal(credentials.values.get('SKM_NOTION_TOKEN'), SECRET)

    // The store index holds a reference, never the token.
    const index = readFileSync(join(root, 'store', 'index.json'), 'utf8')
    assert.equal(index.includes(SECRET), false)
    assert.equal(index.includes('${credential:SKM_NOTION_TOKEN}'), true)

    const after = await call('GET', '/catalog')
    const notionAfter = after.body.entries.find(entry => entry.id === 'notion')
    assert.equal(notionAfter.installed, true)
    assert.equal(notionAfter.credentialReady, true)

    const removed = await call('POST', '/remove', { id: 'mcp-notion' })
    assert.equal(removed.status, 200)
    assert.equal(credentials.values.has('SKM_NOTION_TOKEN'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('host api: /catalog refuses a key when no credentials provider exists', async () => {
  const root = temp('skm-catalog-nocred-')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const handler = createApi({
      store,
      registry: {
        capabilities: () => ({ skills: true, mcp: false, probe: false }),
        warnings: [],
        mcpRows: () => [],
        refreshNow: async () => {},
        probe: async () => ({ ok: false }),
      },
      version: '0.0.0-test',
    })
    const call = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
      req.method = method
      const res = fakeResponse()
      await handler(req, res, new URL(`http://localhost${path}`))
      return { status: res.statusCode, body: parseBody(res) }
    }
    const listed = await call('GET', '/catalog')
    assert.equal(listed.body.credentials, false)
    const refused = await call('POST', '/catalog/install', { id: 'notion', values: { token: SECRET } })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'no-credentials')
    // A connector without credentials still installs.
    const free = await call('POST', '/catalog/install', { id: 'deepwiki' })
    assert.equal(free.status, 200)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('registry: a catalog entry registers its command, references and startup budget', async () => {
  const root = temp('skm-catalog-win-')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const connector = catalogConnectors().find(item => item.id === 'filesystem')
    assert.ok(connector)
    await store.addMcpServers([buildConnectorSpec(connector, new Set(['dir']))], {}, { origin: 'test' })

    const registered = []
    const controller = new RegistrationController({}, store)
    controller.attachMcp({
      register: (name, entry) => {
        registered.push({ name, entry })
        return () => {}
      },
      list: () => [],
    })
    await controller.refreshNow()
    controller.dispose()

    assert.equal(registered.length, 1)
    const entry = registered[0].entry
    // `npx` stays as-is: the MCP SDK spawns through cross-spawn, which resolves
    // the Windows `.cmd` shim itself.
    assert.equal(entry.command, 'npx')
    assert.deepEqual(entry.args, ['-y', '@modelcontextprotocol/server-filesystem', '${credential:SKM_FILESYSTEM_DIR}'])
    assert.equal(entry.startupTimeoutMs, 120000)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
