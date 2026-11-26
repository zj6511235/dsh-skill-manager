#!/usr/bin/env node
/**
 * Build: TypeScript sources in `src/` become the runtime files DSH loads.
 *
 * `index.js` and `lib/**` are ESM modules; `client.js` is a classic combo
 * script (it has no imports) so it is copied verbatim from the compiler
 * output. The repo commits these outputs so a cloned plugin runs without a
 * toolchain.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '..')
const dist = join(root, 'dist')
rmSync(dist, { recursive: true, force: true })

const tsc = spawnSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit',
})
if (tsc.status !== 0) {
  console.error('tsc failed')
  process.exit(tsc.status ?? 1)
}

const copy = (from, to) => {
  if (!existsSync(from)) return
  mkdirSync(join(to, '..'), { recursive: true })
  cpSync(from, to, { recursive: true })
}

copy(join(dist, 'index.js'), join(root, 'index.js'))
copy(join(dist, 'client.js'), join(root, 'client.js'))
copy(join(dist, 'host-api.js'), join(root, 'host-api.js'))
rmSync(join(root, 'lib'), { recursive: true, force: true })
copy(join(dist, 'lib'), join(root, 'lib'))

// TypeScript marks a script as a module with a trailing `export {};` when it
// sees no imports. DSH concatenates this file as a classic script, so strip it.
const clientPath = join(root, 'client.js')
const client = readFileSync(clientPath, 'utf8').replace(/^export \{\};\s*$/m, '')
writeFileSync(clientPath, client, 'utf8')
if (/^\s*(?:import|export)(?:\s+[\w*'"]|\s*\{|\s*\()/m.test(client)) {
  console.error('client.js must not contain top-level import/export (it is a classic script)')
  process.exit(1)
}
const forbidden = client.match(/__ModuleLoader__/g)
if (forbidden === null || forbidden.length !== 1) {
  console.error('client.js must call window.__ModuleLoader__.load exactly once')
  process.exit(1)
}

rmSync(dist, { recursive: true, force: true })
console.log('built index.js, client.js and lib/')
