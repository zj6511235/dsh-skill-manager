#!/usr/bin/env node
/**
 * UI smoke test (developer tool, not part of `npm test`).
 *
 * Loads the committed `client.js` as a classic script, gets the registered
 * Settings component, and server-renders it with the React copy from the
 * local DSH profile. Catches a crash on the first render that the slot test
 * cannot see. Set DSH_REACT_DIR to the folder holding react/react-dom.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const candidates = [
  process.env.DSH_REACT_DIR,
  join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'desktop', 'node_modules'),
  join(process.env.USERPROFILE ?? '', '.dsh', 'profiles', 'web', 'node_modules'),
].filter(value => typeof value === 'string' && value.length > 0)

const reactDir = candidates.find(dir => existsSync(join(dir, 'react', 'package.json')))
if (reactDir === undefined) {
  console.log('SKIP: react not found; set DSH_REACT_DIR')
  process.exit(0)
}

const require = createRequire(join(reactDir, 'noop.cjs'))
const React = require('react')
const ReactDOMServer = require('react-dom/server')

const loads = []
const sandbox = {
  console,
  fetch: async () => ({ ok: true, json: async () => ({}) }),
  __ModuleLoader__: { load: options => loads.push(options) },
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(join(root, 'client.js'), 'utf8'), sandbox)

if (loads.length !== 1) throw new Error(`expected one client load, got ${String(loads.length)}`)
const module = loads[0].factory(name => (name === 'react' ? React : {}))
const slots = []
module.apply({
  slots: {
    inject(_slot, fn) { fn() },
    register(options, component) { slots.push({ options, component }) },
  },
  locale: { getSnapshot: () => ({ id: 'zh-CN' }) },
})
if (slots.length !== 1) throw new Error('settings.section was not registered')
const Page = slots[0].component
const html = ReactDOMServer.renderToString(React.createElement(Page))
for (const expected of ['技能商店', '安装新技能', '已安装', 'SkillHub']) {
  if (!html.includes(expected)) throw new Error(`rendered page is missing: ${expected}`)
}
console.log(`UI smoke OK (${String(html.length)} chars)`)
