/**
 * dsh-skill-manager — Host half.
 *
 * Owns the local store (`~/.dsh/skills_store`), the REST routes behind the
 * connection trust fence, the skill/MCP registrations, and the file watcher
 * that makes CLI changes live without a page reload.
 */
import { readFileSync } from 'node:fs';
import { createApi } from './host-api.js';
import { RegistrationController } from './lib/registry.js';
import { SkillStore } from './lib/store.js';
export const name = 'dsh-skill-manager';
/** Only the route carrier and the browser trust fence are required. `skills`
 * and `mcpManager` are attached lazily so missing services degrade instead of
 * preventing the plugin from mounting. */
export const inject = ['webServer', 'connection'];
/** Every route this plugin owns. */
export const ROUTE_PREFIX = '/dsh-skill-manager/v1';
function readVersion() {
    try {
        const parsed = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
        if (typeof parsed === 'object' && parsed !== null && typeof parsed.version === 'string') {
            return parsed.version;
        }
    }
    catch {
        /* a missing package.json must not stop the plugin */
    }
    return '0.1.0';
}
/** Fail closed when the trust fence is unavailable. */
function makeRejection(ctx) {
    return (req) => {
        try {
            const fromGet = typeof ctx.get === 'function'
                ? ctx.get.call(ctx, 'connection')
                : undefined;
            const connection = fromGet ?? ctx.connection;
            const reject = connection?.['requestRejection'];
            if (typeof reject !== 'function') {
                console.warn('[dsh-skill-manager] connection.requestRejection is unavailable; failing closed (403)');
                return 403;
            }
            const result = reject.call(connection, req);
            return typeof result === 'number' ? result : undefined;
        }
        catch {
            return 403;
        }
    };
}
export function apply(ctx, config = {}) {
    const store = new SkillStore({ dir: config.storeDir, cwd: process.cwd() });
    const registry = new RegistrationController(ctx, store);
    const version = readVersion();
    // Attached lazily: a profile without a credentials provider can still show
    // the marketplace, it just cannot store a connector token.
    let credentials = undefined;
    const api = createApi({ store, registry, version, credentials: () => credentials });
    const rejected = makeRejection(ctx);
    const effect = ctx.effect;
    // The route handler is registered through ctx.effect so unloading the
    // plugin removes the prefix route as well as every registration below.
    effect.call(ctx, () => {
        const fromGet = typeof ctx.get === 'function'
            ? ctx.get.call(ctx, 'webServer')
            : undefined;
        const server = (ctx.webServer ?? fromGet);
        if (server === undefined || typeof server.register !== 'function') {
            console.warn('[dsh-skill-manager] webServer is unavailable; the panel and REST API stay off');
            return () => { };
        }
        return server.register({
            kind: 'prefix',
            path: ROUTE_PREFIX,
            handler: (req, res) => {
                const rejection = rejected(req);
                if (rejection !== undefined) {
                    const response = res;
                    response.statusCode = rejection;
                    response.end();
                    return;
                }
                const request = req;
                let url;
                try {
                    url = new URL(String(request.url ?? '/'), 'http://localhost');
                }
                catch {
                    url = new URL('/', 'http://localhost');
                }
                if (!url.pathname.startsWith(ROUTE_PREFIX)) {
                    const response = res;
                    response.statusCode = 404;
                    response.end();
                    return;
                }
                url.pathname = url.pathname.slice(ROUTE_PREFIX.length) || '/';
                void api(req, res, url);
            },
        });
    });
    // The watcher and every skill/MCP registration are owned by one effect.
    effect.call(ctx, () => {
        registry.startWatching();
        return () => registry.dispose();
    });
    // Optional services attach when (and if) they become available.
    try {
        const injectService = ctx.inject;
        if (typeof injectService === 'function') {
            injectService.call(ctx, ['skills'], (c) => registry.attachSkills(c.skills));
            injectService.call(ctx, ['mcpManager'], (c) => registry.attachMcp(c.mcpManager));
            injectService.call(ctx, ['credentials'], (c) => {
                credentials = c.credentials;
            });
        }
        else {
            const skills = typeof ctx.get === 'function'
                ? ctx.get.call(ctx, 'skills')
                : ctx.skills;
            const mcp = typeof ctx.get === 'function'
                ? ctx.get.call(ctx, 'mcpManager')
                : ctx.mcpManager;
            const creds = typeof ctx.get === 'function'
                ? ctx.get.call(ctx, 'credentials')
                : ctx.credentials;
            if (skills !== undefined)
                registry.attachSkills(skills);
            if (mcp !== undefined)
                registry.attachMcp(mcp);
            if (creds !== undefined)
                credentials = creds;
        }
    }
    catch (error) {
        console.warn('[dsh-skill-manager] optional services unavailable:', error.message);
    }
    if (config.autoRepair !== false) {
        let timer = setTimeout(() => {
            timer = undefined;
            void store.repairAll()
                .then((rows) => {
                for (const row of rows) {
                    if (!row.ok)
                        console.warn(`[dsh-skill-manager] dependency repair failed for ${row.id}: ${row.error ?? 'unknown'}`);
                }
            })
                .catch((error) => {
                console.warn('[dsh-skill-manager] dependency repair pass failed:', error.message);
            });
        }, 3000);
        effect.call(ctx, () => () => {
            if (timer !== undefined)
                clearTimeout(timer);
            timer = undefined;
        });
    }
}
