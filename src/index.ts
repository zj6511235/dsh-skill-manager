/**
 * dsh-skill-manager — Host half.
 *
 * Owns the local store (`~/.dsh/skills_store`), the REST routes behind the
 * connection trust fence, the skill/MCP registrations, and the file watcher
 * that makes CLI changes live without a page reload.
 */
import { readFileSync } from 'node:fs'
import { createApi, type ApiHandler, type CredentialService } from './host-api.js'
import { RegistrationController } from './lib/registry.js'
import { SkillStore } from './lib/store.js'

export const name = 'dsh-skill-manager'
/** Only the route carrier and the browser trust fence are required. `skills`
 * and `mcpManager` are attached lazily so missing services degrade instead of
 * preventing the plugin from mounting. */
export const inject = ['webServer', 'connection']

/** Every route this plugin owns. */
export const ROUTE_PREFIX = '/dsh-skill-manager/v1'

export interface Config {
  /** Override the store root; defaults to `$DSH_HOME/skills_store`. */
  storeDir?: string
  /** Re-run missing dependency installs in the background at startup. */
  autoRepair?: boolean
}

function readVersion(): string {
  try {
    const parsed: unknown = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { version?: unknown }).version === 'string') {
      return (parsed as { version: string }).version
    }
  } catch {
    /* a missing package.json must not stop the plugin */
  }
  return '0.1.0'
}

/** Fail closed when the trust fence is unavailable. */
function makeRejection(ctx: Record<string, unknown>): (req: unknown) => number | undefined {
  return (req) => {
    try {
      const fromGet = typeof ctx.get === 'function'
        ? (ctx.get as (this: unknown, name: string) => Record<string, unknown> | undefined).call(ctx, 'connection')
        : undefined
      const connection = fromGet ?? (ctx.connection as Record<string, unknown> | undefined)
      const reject = connection?.['requestRejection']
      if (typeof reject !== 'function') {
        console.warn('[dsh-skill-manager] connection.requestRejection is unavailable; failing closed (403)')
        return 403
      }
      const result = (reject as (request: unknown) => unknown).call(connection, req)
      return typeof result === 'number' ? result : undefined
    } catch {
      return 403
    }
  }
}

export function apply(ctx: Record<string, unknown>, config: Config = {}): void {
  const store = new SkillStore({ dir: config.storeDir, cwd: process.cwd() })
  const registry = new RegistrationController(ctx, store)
  const version = readVersion()
  // Attached lazily: a profile without a credentials provider can still show
  // the marketplace, it just cannot store a connector token.
  let credentials: CredentialService | undefined = undefined
  const api: ApiHandler = createApi({ store, registry, version, credentials: () => credentials })
  const rejected = makeRejection(ctx)
  const effect = ctx.effect as (this: unknown, fn: () => () => void) => void

  // The route handler is registered through ctx.effect so unloading the
  // plugin removes the prefix route as well as every registration below.
  effect.call(ctx, () => {
    const fromGet = typeof ctx.get === 'function'
      ? (ctx.get as (this: unknown, n: string) => unknown).call(ctx, 'webServer')
      : undefined
    const server = (ctx.webServer ?? fromGet) as
      | { register: (route: { kind: 'prefix'; path: string; handler: (req: unknown, res: unknown) => void }) => () => void }
      | undefined
    if (server === undefined || typeof server.register !== 'function') {
      console.warn('[dsh-skill-manager] webServer is unavailable; the panel and REST API stay off')
      return () => {}
    }
    return server.register({
      kind: 'prefix',
      path: ROUTE_PREFIX,
      handler: (req, res) => {
        const rejection = rejected(req)
        if (rejection !== undefined) {
          const response = res as { statusCode: number; end: () => void }
          response.statusCode = rejection
          response.end()
          return
        }
        const request = req as { url?: string; method?: string }
        let url: URL
        try {
          url = new URL(String(request.url ?? '/'), 'http://localhost')
        } catch {
          url = new URL('/', 'http://localhost')
        }
        if (!url.pathname.startsWith(ROUTE_PREFIX)) {
          const response = res as { statusCode: number; end: () => void }
          response.statusCode = 404
          response.end()
          return
        }
        url.pathname = url.pathname.slice(ROUTE_PREFIX.length) || '/'
        void api(req as never, res as never, url)
      },
    })
  })

  // The watcher and every skill/MCP registration are owned by one effect.
  effect.call(ctx, () => {
    registry.startWatching()
    return () => registry.dispose()
  })

  // Optional services attach when (and if) they become available.
  try {
    const injectService = ctx.inject as ((deps: string[], fn: (c: Record<string, unknown>) => void) => () => void) | undefined
    if (typeof injectService === 'function') {
      injectService.call(ctx, ['skills'], (c) => registry.attachSkills(c.skills as never))
      injectService.call(ctx, ['mcpManager'], (c) => registry.attachMcp(c.mcpManager as never))
      injectService.call(ctx, ['credentials'], (c) => {
        credentials = c.credentials as CredentialService | undefined
      })
    } else {
      const skills = typeof ctx.get === 'function'
        ? (ctx.get as (this: unknown, n: string) => unknown).call(ctx, 'skills')
        : ctx.skills
      const mcp = typeof ctx.get === 'function'
        ? (ctx.get as (this: unknown, n: string) => unknown).call(ctx, 'mcpManager')
        : ctx.mcpManager
      const creds = typeof ctx.get === 'function'
        ? (ctx.get as (this: unknown, n: string) => unknown).call(ctx, 'credentials')
        : ctx.credentials
      if (skills !== undefined) registry.attachSkills(skills as never)
      if (mcp !== undefined) registry.attachMcp(mcp as never)
      if (creds !== undefined) credentials = creds as CredentialService
    }
  } catch (error) {
    console.warn('[dsh-skill-manager] optional services unavailable:', (error as Error).message)
  }

  if (config.autoRepair !== false) {
    let timer: NodeJS.Timeout | undefined = setTimeout(() => {
      timer = undefined
      void store.repairAll()
        .then((rows) => {
          for (const row of rows) {
            if (!row.ok) console.warn(`[dsh-skill-manager] dependency repair failed for ${row.id}: ${row.error ?? 'unknown'}`)
          }
        })
        .catch((error: unknown) => {
          console.warn('[dsh-skill-manager] dependency repair pass failed:', (error as Error).message)
        })
    }, 3000)
    effect.call(ctx, () => () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
    })
  }
}
