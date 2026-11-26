import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import vm from 'node:vm'
import { SkillStore } from '../lib/store.js'
import { RegistrationController, mcpServerName } from '../lib/registry.js'
import { createApi } from '../host-api.js'
import { apply } from '../index.js'
import { writeSkillDir, fakeResponse, parseBody } from './helpers.mjs'

function temp(prefix) {
  return mkdtempSync(join(tmpdir(), prefix))
}

async function makeStore(root) {
  const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
  const source = join(root, 'mcp-pack')
  writeSkillDir(source, {
    name: 'mcp-pack',
    skillName: 'pdf-helper',
    manifest: {
      name: 'mcp-pack',
      version: '1.0.0',
      skills: [{ path: 'SKILL.md', description: 'PDF helper' }],
      mcpServers: {
        pdf: { command: 'node', args: ['server.js'], env: { TOKEN: '${credential:PDF_TOKEN}' } },
        web: { transport: 'streamable-http', url: 'https://example.com/mcp' },
        py: { command: 'python', args: ['server.py'] },
      },
    },
  })
  writeFileSync(join(source, 'server.js'), 'console.log("server")')
  await store.install(source, { skipDependencies: true })
  return { store, source }
}

test('registry: registers skills and MCP servers, and disposes all of them', async () => {
  const root = temp('skm-reg-')
  try {
    const { store } = await makeStore(root)
    const external = writeSkillDir(join(root, '.claude', 'skills', 'linked-skill'), {
      name: 'linked-skill',
      description: 'Used in place',
    })
    const linked = await store.linkExternal(external)
    assert.equal(linked.entry.origin, 'external')
    const registeredSkills = []
    const registeredMcp = []
    const disposed = []
    const skills = {
      register(definition) {
        registeredSkills.push(definition)
        return () => disposed.push(`skill:${definition.name}`)
      },
    }
    const mcp = {
      register(name, entry) {
        registeredMcp.push({ name, entry })
        return () => disposed.push(`mcp:${name}`)
      },
    }
    const controller = new RegistrationController({}, store)
    controller.attachSkills(skills)
    controller.attachMcp(mcp)
    mkdirSync(join(store.dir, 'skills', 'mcp-pack', '.python-libs'), { recursive: true })
    await controller.refreshNow()
    assert.equal(registeredSkills.length, 2)
    const linkedDefinition = registeredSkills.find(definition => definition.name === 'linked-skill')
    assert.ok(linkedDefinition !== undefined)
    assert.equal(linkedDefinition.path, join(external, 'SKILL.md'))
    assert.equal(linkedDefinition.resourceBase.path, external)
    assert.equal(registeredMcp.length, 3)
    const pdf = registeredMcp.find(row => row.name.startsWith('skm_mcp-pack_pdf'))
    assert.equal(pdf.entry.transport, 'stdio')
    assert.equal(pdf.entry.command, 'node')
    assert.deepEqual(pdf.entry.args, ['server.js'])
    assert.equal(pdf.entry.cwd, join(store.dir, 'skills', 'mcp-pack'))
    assert.equal(pdf.entry.env.TOKEN, '${credential:PDF_TOKEN}')
    const py = registeredMcp.find(row => row.name.startsWith('skm_mcp-pack_py'))
    assert.match(py.entry.env.PYTHONPATH, /\.python-libs$/)
    controller.dispose()
    assert.equal(disposed.length, 5)
    assert.ok(existsSync(join(external, 'SKILL.md')))
    assert.equal(mcpServerName('very-long-id-that-keeps-going-and-going', 'very-long-server-name'), mcpServerName('very-long-id-that-keeps-going-and-going', 'very-long-server-name'))
    assert.ok(mcpServerName('very-long-id-that-keeps-going-and-going', 'very-long-server-name').length <= 32)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('host api: status, install, disable, remove and error mapping', async () => {
  const root = temp('skm-api-')
  try {
    const store = new SkillStore({ dir: join(root, 'store'), home: root, cwd: root })
    const refreshes = []
    const registry = {
      capabilities: () => ({ skills: true, mcp: false }),
      warnings: [],
      refreshNow: async () => { refreshes.push(1) },
    }
    const handler = createApi({ store, registry, version: '0.0.0-test' })

    const call = async (method, path, body) => {
      const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))])
      req.method = method
      const res = fakeResponse()
      await handler(req, res, new URL(`http://localhost${path}`))
      return { status: res.statusCode, body: parseBody(res) }
    }

    const status = await call('GET', '/status')
    assert.equal(status.status, 200)
    assert.equal(status.body.ok, true)
    assert.equal(status.body.capabilities.skills, true)

    writeSkillDir(join(root, '.claude', 'skills', 'scan-skill'), { name: 'scan-skill' })
    const scan = await call('GET', '/scan')
    assert.equal(scan.status, 200)
    assert.ok(scan.body.candidates.some(candidate => candidate.name === 'scan-skill'))
    assert.ok(scan.body.platforms.some(platform => platform.agent === 'claude-code' && platform.count === 1))

    const source = await makeStoreForApi(root)
    const installed = await call('POST', '/install', { source })
    assert.equal(installed.status, 200)
    assert.equal(installed.body.entry.id, 'api-skill')
    assert.equal(refreshes.length, 1)

    const list = await call('GET', '/skills')
    assert.equal(list.body.entries.length, 1)

    const disabled = await call('POST', '/enable', { id: 'api-skill', enabled: false })
    assert.equal(disabled.body.entry.enabled, false)

    const removed = await call('POST', '/remove', { id: 'api-skill' })
    assert.equal(removed.status, 200)

    const external = writeSkillDir(join(root, 'external-link'), { name: 'external-skill', description: 'Linked' })
    const linked = await call('POST', '/link', { path: external })
    assert.equal(linked.status, 200)
    assert.equal(linked.body.entry.origin, 'external')
    const externalList = await call('GET', '/skills')
    assert.ok(externalList.body.entries.some(entry => entry.id === 'external-skill' && entry.origin === 'external'))
    const unlinked = await call('POST', '/remove', { id: 'external-skill' })
    assert.equal(unlinked.status, 200)
    assert.ok(existsSync(join(external, 'SKILL.md')), 'unlink must keep the original')

    const externalA = writeSkillDir(join(root, 'batch-a'), { name: 'batch-a' })
    const externalB = writeSkillDir(join(root, 'batch-b'), { name: 'batch-b' })
    const batch = await call('POST', '/link', { paths: [externalA, externalB] })
    assert.equal(batch.status, 200)
    assert.equal(batch.body.entries.length, 2)
    const batchList = await call('GET', '/skills')
    assert.ok(batchList.body.entries.some(entry => entry.id === 'batch-a'))
    assert.ok(batchList.body.entries.some(entry => entry.id === 'batch-b'))
    await call('POST', '/remove', { id: 'batch-a' })
    await call('POST', '/remove', { id: 'batch-b' })
    assert.ok(existsSync(join(externalA, 'SKILL.md')))
    assert.ok(existsSync(join(externalB, 'SKILL.md')))

    const bad = await call('POST', '/install', { source: 'not a source!!' })
    assert.equal(bad.status, 400)
    assert.equal(bad.body.code, 'invalid-source')

    const missing = await call('GET', '/nope')
    assert.equal(missing.status, 404)

    const wrongMethod = await call('GET', '/install')
    assert.equal(wrongMethod.status, 405)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

async function makeStoreForApi(root) {
  const dir = join(root, 'api-src')
  writeSkillDir(dir, { name: 'api-skill', description: 'API test skill' })
  return dir
}

test('host apply: registers one route behind requestRejection and degrades cleanly', async () => {
  const root = temp('skm-apply-')
  try {
    const storeDir = join(root, 'store')
    const routes = []
    const disposers = []
    const ctx = {
      effect(fn) { disposers.push(fn()) },
      webServer: {
        register(route) {
          routes.push(route)
          return () => { routes.length = 0 }
        },
      },
      connection: { requestRejection: () => undefined },
      get() { return undefined },
      inject(_deps, callback) { callback({ skills: undefined, mcpManager: undefined }); return () => {} },
    }
    apply(ctx, { storeDir, autoRepair: false })
    assert.equal(routes.length, 1)
    assert.equal(routes[0].path, '/dsh-skill-manager/v1')
    assert.equal(routes[0].kind, 'prefix')

    const res = fakeResponse()
    routes[0].handler({ url: '/dsh-skill-manager/v1/status', method: 'GET', headers: {} }, res)
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(res.statusCode, 200)
    assert.equal(JSON.parse(res.body).store.dir, storeDir)

    for (const dispose of disposers.reverse()) {
      if (typeof dispose === 'function') dispose()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('host apply: fails closed when requestRejection refuses', async () => {
  const root = temp('skm-apply-fence-')
  try {
    const routes = []
    const disposers = []
    const ctx = {
      effect(fn) { disposers.push(fn()) },
      webServer: { register(route) { routes.push(route); return () => {} } },
      connection: { requestRejection: () => 403 },
      get() { return undefined },
      inject() { return () => {} },
    }
    apply(ctx, { storeDir: join(root, 'store'), autoRepair: false })
    const res = fakeResponse()
    routes[0].handler({ url: '/dsh-skill-manager/v1/status', method: 'GET', headers: {} }, res)
    assert.equal(res.statusCode, 403)
    for (const dispose of disposers.reverse()) {
      if (typeof dispose === 'function') dispose()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('client: loads once and registers the settings.section slot', () => {
  const code = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
  const loads = []
  const sandbox = {
    console,
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    __ModuleLoader__: { load: options => loads.push(options) },
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(code, sandbox)
  assert.equal(loads.length, 1)
  assert.equal(loads[0].id, 'dsh-skill-manager')

  // A tiny hook-capable renderer: initial state only, enough to prove the
  // first render does not throw and produces the page's visible copy.
  let hooks = []
  let hookIndex = 0
  const React = {
    createElement(type, props, ...children) {
      return { type, props: { ...(props ?? {}), children } }
    },
    useState(initial) {
      const index = hookIndex++
      if (hooks[index] === undefined) hooks[index] = initial
      return [hooks[index], () => {}]
    },
    useEffect() {},
    useCallback(fn) { return fn },
    useRef(initial) { return { current: initial } },
  }
  function render(node) {
    if (node === null || node === undefined || typeof node === 'boolean') return ''
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(render).join('')
    if (typeof node.type === 'function') return render(node.type(node.props))
    return render(node.props?.children)
  }

  const module = loads[0].factory(name => (name === 'react' ? React : {}))
  const slots = []
  const ctx = {
    slots: {
      inject(slot, fn) { assert.equal(slot, 'settings.section'); fn() },
      register(options, component) { slots.push({ options, component }) },
    },
    locale: { getSnapshot: () => ({ id: 'zh-CN' }) },
  }
  module.apply(ctx)
  assert.equal(slots.length, 1)
  assert.equal(slots[0].options.id, 'skill-manager')
  assert.equal(slots[0].options.name, 'settings.section')
  assert.equal(slots[0].options.label(), '技能商店')

  hookIndex = 0
  hooks = []
  const html = render(React.createElement(slots[0].component, {}))
  for (const expected of ['对话安装技能', '你好', 'PPT 制作']) {
    assert.ok(html.includes(expected), `initial render is missing ${expected}`)
  }
})
