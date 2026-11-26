import { errorMessage, isSkillManagerError } from './lib/errors.js';
import { redactSecrets } from './lib/process.js';
import { getSkillhubDetail, searchSkillhub } from './lib/skillhub.js';
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_LENGTH = 2048;
const MAX_ID_LENGTH = 100;
function sendJson(res, status, payload) {
    if (res.writableEnded)
        return;
    res.statusCode = status;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.end(JSON.stringify(payload));
}
function methodNotAllowed(res, allow) {
    res.statusCode = 405;
    res.setHeader('allow', allow);
    res.end();
}
async function readJsonBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += buffer.byteLength;
        if (size > MAX_BODY_BYTES) {
            req.resume();
            return null;
        }
        chunks.push(buffer);
    }
    try {
        const parsed = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : null;
    }
    catch {
        return null;
    }
}
function stringField(body, key, max = MAX_SOURCE_LENGTH) {
    const value = body[key];
    if (typeof value !== 'string')
        return '';
    return value.trim().slice(0, max);
}
function boolField(body, key) {
    return body[key] === true;
}
function entryView(entry) {
    return {
        id: entry.id,
        name: entry.name,
        version: entry.version,
        description: entry.description,
        enabled: entry.enabled,
        installedAt: entry.installedAt,
        updatedAt: entry.updatedAt,
        source: entry.source,
        origin: entry.origin ?? 'store',
        externalPath: entry.externalPath,
        skills: entry.skills.map(skill => ({ name: skill.name, description: skill.description })),
        mcpServers: entry.mcpServers.map(server => ({ name: server.name, transport: server.transport })),
        dependencies: entry.dependencies,
        provenance: entry.provenance,
    };
}
function resultView(result) {
    return { entry: entryView(result.entry), warnings: result.warnings, logPath: result.logPath };
}
/** Build the route handler; the Host entry owns trust and route registration. */
export function createApi(deps) {
    const { store, registry, version } = deps;
    return async (req, res, url) => {
        const route = url.pathname;
        const method = req.method ?? 'GET';
        try {
            if (route === '/status') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const summary = store.status();
                sendJson(res, 200, {
                    ok: true,
                    version,
                    store: {
                        dir: summary.dir,
                        count: summary.count,
                        enabled: summary.enabled,
                        external: summary.external,
                        skills: summary.skills,
                        mcpServers: summary.mcpServers,
                        revision: summary.revision,
                    },
                    capabilities: registry.capabilities(),
                    warnings: registry.warnings,
                });
                return;
            }
            if (route === '/skills') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const entries = store.list().map(entryView);
                sendJson(res, 200, { ok: true, entries });
                return;
            }
            if (route === '/install') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象，且不超过 4 MiB', code: 'invalid-source' });
                const source = stringField(body, 'source');
                if (source.length === 0)
                    return sendJson(res, 400, { error: '缺少 source', code: 'invalid-source' });
                const result = await store.install(source, {
                    enable: body.enable !== false,
                    force: boolField(body, 'force'),
                    allowScripts: boolField(body, 'allowScripts'),
                    ref: stringField(body, 'ref', 200) || undefined,
                    skipDependencies: boolField(body, 'skipDependencies'),
                });
                await registry.refreshNow();
                sendJson(res, 200, { ok: true, ...resultView(result) });
                return;
            }
            if (route === '/remove') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const id = stringField(body, 'id', MAX_ID_LENGTH);
                if (id.length === 0)
                    return sendJson(res, 400, { error: '缺少 id', code: 'invalid-source' });
                const entry = await store.remove(id);
                await registry.refreshNow();
                sendJson(res, 200, { ok: true, removed: entryView(entry) });
                return;
            }
            if (route === '/enable') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const id = stringField(body, 'id', MAX_ID_LENGTH);
                if (id.length === 0)
                    return sendJson(res, 400, { error: '缺少 id', code: 'invalid-source' });
                const entry = await store.setEnabled(id, body.enabled !== false);
                await registry.refreshNow();
                sendJson(res, 200, { ok: true, entry: entryView(entry) });
                return;
            }
            if (route === '/repair') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const id = stringField(body, 'id', MAX_ID_LENGTH);
                if (id.length === 0)
                    return sendJson(res, 400, { error: '缺少 id', code: 'invalid-source' });
                const result = await store.repair(id);
                sendJson(res, 200, { ok: true, entry: entryView(result.entry), logPath: result.logPath });
                return;
            }
            if (route === '/refresh') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                await registry.refreshNow();
                sendJson(res, 200, { ok: true, warnings: registry.warnings });
                return;
            }
            if (route === '/log') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const id = (url.searchParams.get('id') ?? '').trim().slice(0, MAX_ID_LENGTH);
                if (id.length === 0)
                    return sendJson(res, 400, { error: '缺少 id', code: 'invalid-source' });
                sendJson(res, 200, { ok: true, log: store.readLog(id) });
                return;
            }
            if (route === '/scan') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const report = store.scanReport();
                sendJson(res, 200, { ok: true, candidates: report.candidates, platforms: report.platforms });
                return;
            }
            if (route === '/link') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const single = stringField(body, 'path', 2048);
                const many = Array.isArray(body.paths)
                    ? body.paths.filter((item) => typeof item === 'string' && item.trim().length > 0).map(item => item.trim().slice(0, 2048))
                    : [];
                const paths = many.length > 0 ? many : (single.length > 0 ? [single] : []);
                if (paths.length === 0)
                    return sendJson(res, 400, { error: '缺少 path 或 paths', code: 'invalid-source' });
                const batch = await store.linkMany(paths, {
                    enable: body.enable !== false,
                    force: boolField(body, 'force'),
                });
                await registry.refreshNow();
                const results = batch.entries;
                const warnings = [...batch.warnings, ...results.flatMap(result => result.warnings)];
                sendJson(res, 200, {
                    ok: true,
                    entries: results.map(resultView),
                    warnings,
                    ...(results[0] === undefined ? {} : resultView(results[0])),
                });
                return;
            }
            if (route === '/import') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const path = stringField(body, 'path', 2048);
                if (path.length === 0)
                    return sendJson(res, 400, { error: '缺少 path', code: 'invalid-source' });
                const result = await store.importFrom(path, {
                    enable: body.enable !== false,
                    force: boolField(body, 'force'),
                    skipDependencies: boolField(body, 'skipDependencies'),
                });
                await registry.refreshNow();
                sendJson(res, 200, { ok: true, ...resultView(result) });
                return;
            }
            if (route === '/search') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const query = (url.searchParams.get('q') ?? '').slice(0, 120);
                const pageRaw = Number.parseInt(url.searchParams.get('page') ?? '1', 10);
                const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 100) : 1;
                try {
                    const result = await searchSkillhub(query, page, 12);
                    sendJson(res, 200, { ok: true, ...result });
                }
                catch (error) {
                    sendJson(res, 200, { ok: false, error: errorMessage(error), items: [], total: 0 });
                }
                return;
            }
            if (route === '/skillhub') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const slug = (url.searchParams.get('slug') ?? '').trim().slice(0, 128);
                if (slug.length === 0)
                    return sendJson(res, 400, { error: '缺少 slug', code: 'invalid-source' });
                const item = await getSkillhubDetail(slug);
                sendJson(res, 200, { ok: true, item });
                return;
            }
            sendJson(res, 404, { error: '未知接口', code: 'not-found' });
        }
        catch (error) {
            if (isSkillManagerError(error)) {
                sendJson(res, error.status, { error: error.message, code: error.code, detail: error.detail });
                return;
            }
            // Never echo an arbitrary exception: it can contain filesystem paths or
            // child-process environment values. The Host log keeps a redacted line.
            try {
                console.error('[dsh-skill-manager] route failed:', redactSecrets(errorMessage(error)).slice(0, 500));
            }
            catch {
                /* ignore */
            }
            sendJson(res, 500, {
                error: '技能库内部错误',
                code: 'internal',
                detail: error instanceof Error ? redactSecrets(error.message).slice(0, 200) : undefined,
            });
        }
    };
}
