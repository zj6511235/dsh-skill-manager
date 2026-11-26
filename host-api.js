import { catalogConnectors, catalogView, buildConnectorSpec, connectorCredentialRefs, credentialRefFor, credentialRefsIn, findConnector, validateFieldValues } from './lib/catalog.js';
import { errorMessage, isSkillManagerError } from './lib/errors.js';
import { maskSummary } from './lib/mcp-scan.js';
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
    const refs = entry.mcpRefs ?? [];
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
        kind: entry.skills.length === 0 && entry.mcpServers.length + refs.length > 0 ? 'mcp' : 'skill',
        skills: entry.skills.map(skill => ({ name: skill.name, description: skill.description })),
        // A connector description is safe to show: env and header values are
        // replaced before they reach the browser.
        mcpServers: entry.mcpServers.map(server => ({
            name: server.name,
            transport: server.transport,
            summary: maskSummary(server),
            envKeys: server.transport === 'streamable-http' ? Object.keys(server.headers ?? {}) : Object.keys(server.env ?? {}),
        })),
        mcpRefs: refs.map(ref => ({
            name: ref.name,
            agent: ref.agent,
            agentLabel: ref.agentLabel,
            file: ref.file,
            ...(ref.scope === undefined ? {} : { scope: ref.scope }),
        })),
        dependencies: entry.dependencies,
        provenance: entry.provenance,
    };
}
function resultView(result) {
    return { entry: entryView(result.entry), warnings: result.warnings, logPath: result.logPath };
}
/** Which marketplace connector (if any) produced this entry. */
function connectorIdOf(entry) {
    for (const server of entry.mcpServers) {
        if (server.catalogId !== undefined)
            return server.catalogId;
    }
    const value = entry.source.value;
    return value.startsWith('catalog:') ? value.slice('catalog:'.length) : undefined;
}
/** Every credential reference an entry depends on. */
function entryCredentialRefs(entry) {
    const refs = new Set();
    for (const server of entry.mcpServers) {
        const texts = [server.url ?? '', ...(server.args ?? []), ...Object.values(server.env ?? {}), ...Object.values(server.headers ?? {})];
        for (const text of texts)
            for (const ref of credentialRefsIn(text))
                refs.add(ref);
    }
    return [...refs];
}
/** Build the route handler; the Host entry owns trust and route registration. */
export function createApi(deps) {
    const { store, registry, version } = deps;
    const credentialsOf = () => {
        try {
            return deps.credentials?.();
        }
        catch {
            return undefined;
        }
    };
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
                        mcp: summary.mcp,
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
                // A marketplace connector owns its credentials: removing it removes
                // them too, so a token never outlives the server it was entered for.
                const owned = connectorIdOf(entry);
                if (owned !== undefined) {
                    const credentials = credentialsOf();
                    if (credentials !== undefined) {
                        for (const ref of entryCredentialRefs(entry)) {
                            try {
                                await credentials.unset(ref);
                            }
                            catch {
                                /* a credential store failure must not block the removal */
                            }
                        }
                    }
                }
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
            // ------------------------------------------------------------- MCP --
            if (route === '/mcp') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const report = store.scanMcpReport();
                sendJson(res, 200, {
                    ok: true,
                    entries: store.mcpEntries().map(entryView),
                    servers: registry.mcpRows(),
                    candidates: report.candidates,
                    platforms: report.platforms,
                    capabilities: registry.capabilities(),
                    warnings: registry.warnings,
                });
                return;
            }
            if (route === '/mcp/add') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                let input = stringField(body, 'json', MAX_BODY_BYTES);
                if (input.length === 0) {
                    const server = body.server;
                    if (typeof server === 'object' && server !== null && !Array.isArray(server)) {
                        const record = server;
                        const name = typeof record.name === 'string' && record.name.length > 0 ? record.name : 'server';
                        input = JSON.stringify({ mcpServers: { [name]: record } });
                    }
                }
                if (input.length === 0) {
                    return sendJson(res, 400, { error: '缺少 json 或 server 字段', code: 'invalid-source' });
                }
                const batch = await store.installMcp(input, {
                    enable: body.enable !== false,
                    force: boolField(body, 'force'),
                });
                await registry.refreshNow();
                sendJson(res, 200, {
                    ok: true,
                    entries: batch.entries.map(resultView),
                    warnings: batch.warnings,
                    ...(batch.entries[0] === undefined ? {} : resultView(batch.entries[0])),
                });
                return;
            }
            if (route === '/mcp/link') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                // The browser may only name candidates the Host itself discovered, so a
                // request cannot aim the reader at an arbitrary file.
                const keys = Array.isArray(body.keys)
                    ? body.keys.filter((item) => typeof item === 'string').slice(0, 500)
                    : [];
                if (keys.length === 0)
                    return sendJson(res, 400, { error: '缺少 keys', code: 'invalid-source' });
                const report = store.scanMcpReport();
                const wanted = new Set(keys);
                const refs = [];
                const unknown = [];
                const byKey = new Map(report.candidates.map(candidate => [candidate.key, candidate]));
                for (const candidate of report.candidates) {
                    if (!wanted.has(candidate.key) || candidate.invalid === true)
                        continue;
                    refs.push({
                        name: candidate.name,
                        file: candidate.file,
                        agent: candidate.agent,
                        agentLabel: candidate.agentLabel,
                        ...(candidate.scope === undefined ? {} : { scope: candidate.scope }),
                    });
                }
                for (const key of keys) {
                    const candidate = byKey.get(key);
                    if (candidate === undefined)
                        unknown.push(`跳过（未找到匹配的配置项）：${key}`);
                    else if (candidate.invalid === true)
                        unknown.push(`跳过（${candidate.invalidReason ?? '配置无效'}）：${candidate.name}`);
                }
                if (refs.length === 0) {
                    return sendJson(res, 400, { error: '这些 MCP 已不在本机配置中，请重新扫描', code: 'not-found' });
                }
                const batch = await store.linkMcpRefs(refs, {
                    enable: body.enable !== false,
                    force: boolField(body, 'force'),
                });
                await registry.refreshNow();
                sendJson(res, 200, {
                    ok: true,
                    entries: batch.entries.map(resultView),
                    warnings: [...batch.warnings, ...unknown],
                    ...(batch.entries[0] === undefined ? {} : resultView(batch.entries[0])),
                });
                return;
            }
            if (route === '/mcp/probe') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const id = stringField(body, 'id', MAX_ID_LENGTH);
                const server = stringField(body, 'server', 200);
                if (id.length === 0 || server.length === 0)
                    return sendJson(res, 400, { error: '缺少 id 或 server', code: 'invalid-source' });
                const result = await registry.probe(id, server);
                sendJson(res, 200, { ok: result.ok, ...(result.result === undefined ? {} : { result: result.result }), ...(result.error === undefined ? {} : { error: result.error }) });
                return;
            }
            // ------------------------------------------------- 连接器市场 --
            if (route === '/catalog') {
                if (method !== 'GET')
                    return methodNotAllowed(res, 'GET');
                const credentials = credentialsOf();
                const installed = new Map();
                for (const entry of store.mcpEntries()) {
                    const catalogId = connectorIdOf(entry);
                    if (catalogId !== undefined)
                        installed.set(catalogId, entry);
                }
                const entries = [];
                for (const connector of catalogConnectors()) {
                    const refs = connectorCredentialRefs(connector);
                    let ready = refs.length === 0;
                    if (!ready && credentials?.describe !== undefined) {
                        const states = await Promise.all(refs.map(async (ref) => {
                            try {
                                return await credentials.describe(ref);
                            }
                            catch {
                                return { configured: false };
                            }
                        }));
                        ready = states.every(state => state.configured === true);
                    }
                    const entry = installed.get(connector.id);
                    entries.push(catalogView(connector, entry === undefined ? undefined : { entryId: entry.id, enabled: entry.enabled }, ready));
                }
                sendJson(res, 200, {
                    ok: true,
                    entries,
                    credentials: credentials !== undefined,
                    capabilities: registry.capabilities(),
                });
                return;
            }
            if (route === '/catalog/install') {
                if (method !== 'POST')
                    return methodNotAllowed(res, 'POST');
                const body = await readJsonBody(req);
                if (body === null)
                    return sendJson(res, 400, { error: '请求体必须是 JSON 对象', code: 'invalid-source' });
                const connector = findConnector(stringField(body, 'id', MAX_ID_LENGTH));
                if (connector === undefined)
                    return sendJson(res, 404, { error: '未知的连接器', code: 'not-found' });
                const raw = body.values;
                const values = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {};
                const checked = validateFieldValues(connector, values);
                if (checked.problem !== undefined)
                    return sendJson(res, 400, { error: checked.problem, code: 'invalid-source' });
                if (checked.missing.length > 0) {
                    return sendJson(res, 400, {
                        error: `还需要填写：${checked.missing.map(field => field.label).join('、')}`,
                        code: 'invalid-source',
                        missing: checked.missing.map(field => field.key),
                    });
                }
                const credentials = credentialsOf();
                const refs = connectorCredentialRefs(connector);
                const provided = new Set(Object.keys(checked.clean));
                if (refs.length > 0 && provided.size > 0 && credentials === undefined) {
                    return sendJson(res, 409, {
                        error: '当前 profile 没有可用的凭据服务，密钥无法安全保存。请在 DSH 设置里配置凭据，或改用「粘贴配置」自行填写 URL/令牌。',
                        code: 'no-credentials',
                    });
                }
                if (credentials !== undefined) {
                    for (const field of connector.fields) {
                        const value = checked.clean[field.key];
                        if (value === undefined)
                            continue;
                        await credentials.set(credentialRefFor(connector.id, field.key), value);
                    }
                }
                const batch = await store.addMcpServers([buildConnectorSpec(connector, provided)], { enable: body.enable !== false }, { origin: '连接器市场', description: connector.description });
                await registry.refreshNow();
                sendJson(res, 200, {
                    ok: true,
                    entries: batch.entries.map(resultView),
                    warnings: batch.warnings,
                    ...(batch.entries[0] === undefined ? {} : resultView(batch.entries[0])),
                });
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
