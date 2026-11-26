/**
 * Discover what a downloaded package actually contains.
 *
 * Two manifest styles are accepted:
 * - `SKILL.md` documents (Claude/Codex/DSH style) at the package root or under
 *   `skills/<name>/`, with YAML frontmatter for name and description.
 * - `manifest.json` with an optional `skills[]` list and `mcpServers` map.
 *
 * The output is normalized into store types; nothing here writes files.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import { parseFrontmatter, pickString } from './frontmatter.js';
import { SkillManagerError } from './errors.js';
import { isValidServerName, isValidSkillName, safeJoin, toStoreId } from './safe-path.js';
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '__MACOSX', '.venv', 'venv', 'dist', 'build', '.cache']);
function readText(file) {
    return readFileSync(file, 'utf8');
}
/** Generate a valid kebab-case skill name, or undefined when impossible. */
export function normalizeSkillName(value) {
    const trimmed = String(value).trim();
    if (isValidSkillName(trimmed))
        return trimmed;
    const slug = trimmed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
        .slice(0, 64)
        .replace(/-+$/, '');
    return isValidSkillName(slug) ? slug : undefined;
}
function relativePosix(root, file) {
    return relative(root, file).split(sep).join('/');
}
/** Parse one SKILL.md into its routing metadata and body. */
export function readSkillDocument(file, fallbackName) {
    const markdown = readText(file);
    const parsed = parseFrontmatter(markdown);
    const data = parsed?.data ?? {};
    const declared = pickString(data, ['name', 'slug', 'id']);
    const name = normalizeSkillName(declared ?? fallbackName);
    if (name === undefined) {
        throw new SkillManagerError('invalid-manifest', `SKILL.md 中的技能名不是合法的 kebab-case：${file}`);
    }
    const description = pickString(data, ['description', 'summary', 'desc']);
    const whenToUse = pickString(data, ['whenToUse', 'when_to_use', 'when-to-use']);
    const version = pickString(data, ['version']);
    const invocation = parseInvocation(data);
    return {
        file,
        body: parsed?.body ?? markdown,
        name,
        description: description ?? `Installed skill ${name}`,
        ...(whenToUse === undefined ? {} : { whenToUse }),
        ...(version === undefined ? {} : { version }),
        ...(invocation === undefined ? {} : { invocation }),
    };
}
function parseInvocation(data) {
    const model = pickString(data, ['modelInvocable', 'model-invocable']);
    const user = pickString(data, ['userInvocable', 'user-invocable']);
    if (model === undefined && user === undefined)
        return undefined;
    return {
        modelInvocable: model === undefined ? true : model !== 'false',
        userInvocable: user === undefined ? true : user !== 'false',
    };
}
/** List SKILL.md documents under a package root, bounded by depth and count. */
export function findSkillDocuments(root) {
    const found = [];
    const walk = (dir, depth) => {
        if (found.length >= 100 || depth > 3)
            return;
        const skillFile = join(dir, 'SKILL.md');
        if (existsSync(skillFile))
            found.push(skillFile);
        if (depth === 3)
            return;
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (SKIP_DIRECTORIES.has(entry))
                continue;
            const path = join(dir, entry);
            try {
                if (!statSync(path).isDirectory())
                    continue;
            }
            catch {
                continue;
            }
            walk(path, depth + 1);
        }
    };
    walk(root, 0);
    return found;
}
/**
 * If a download wraps the package in a single top-level directory (`package/`
 * for npm tarballs, `repo-main/` for GitHub zips), return that directory.
 */
export function unwrapSingleRoot(root) {
    if (existsSync(join(root, 'manifest.json')) || existsSync(join(root, 'SKILL.md')))
        return root;
    let entries;
    try {
        entries = readdirSync(root).filter(entry => !entry.startsWith('.') && entry !== '__MACOSX');
    }
    catch {
        return root;
    }
    if (entries.length !== 1)
        return root;
    const candidate = join(root, entries[0]);
    try {
        if (!statSync(candidate).isDirectory())
            return root;
    }
    catch {
        return root;
    }
    if (existsSync(join(candidate, 'manifest.json')) || existsSync(join(candidate, 'SKILL.md')))
        return candidate;
    // A repository may keep its skill under `skills/`; descend only when that is
    // the sole child and it holds skill content.
    if (findSkillDocuments(candidate).length > 0)
        return candidate;
    return root;
}
function parseStringArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}
function parseMcpSpec(name, raw, root) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
        return undefined;
    const record = raw;
    if (record.disabled === true || record.enabled === false)
        return undefined;
    const serverName = typeof record.name === 'string' && record.name.length > 0 ? record.name : name;
    if (!isValidServerName(serverName)) {
        throw new SkillManagerError('invalid-manifest', `MCP 服务名不合法（仅允许字母、数字、_、-，最长 32）：${serverName}`);
    }
    const transportRaw = typeof record.transport === 'string'
        ? record.transport
        : (typeof record.type === 'string' ? record.type : 'stdio');
    const transport = transportRaw === 'http' || transportRaw === 'streamable-http' || transportRaw === 'sse'
        ? 'streamable-http'
        : 'stdio';
    if (transport === 'stdio') {
        const command = typeof record.command === 'string' ? record.command.trim() : '';
        if (command.length === 0)
            throw new SkillManagerError('invalid-manifest', `MCP 服务 ${serverName} 缺少 command`);
        const args = parseStringArray(record.args);
        const envRaw = typeof record.env === 'object' && record.env !== null && !Array.isArray(record.env)
            ? record.env
            : {};
        const env = {};
        for (const [key, value] of Object.entries(envRaw)) {
            if (typeof value === 'string')
                env[key] = value;
            else if (typeof value === 'number' || typeof value === 'boolean')
                env[key] = String(value);
        }
        const cwd = typeof record.cwd === 'string' && record.cwd.length > 0 ? record.cwd : '';
        return {
            name: serverName,
            transport,
            command,
            args,
            env,
            ...(cwd.length === 0 ? {} : { cwd }),
            ...(typeof record.startupTimeoutMs === 'number' ? { startupTimeoutMs: record.startupTimeoutMs } : {}),
            ...(typeof record.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: record.toolCallTimeoutMs } : {}),
        };
    }
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    if (url.length === 0)
        throw new SkillManagerError('invalid-manifest', `MCP 服务 ${serverName} 缺少 url`);
    const headersRaw = typeof record.headers === 'object' && record.headers !== null && !Array.isArray(record.headers)
        ? record.headers
        : {};
    const headers = {};
    for (const [key, value] of Object.entries(headersRaw)) {
        if (typeof value === 'string')
            headers[key] = value;
    }
    return {
        name: serverName,
        transport,
        url,
        headers,
        ...(typeof record.startupTimeoutMs === 'number' ? { startupTimeoutMs: record.startupTimeoutMs } : {}),
        ...(typeof record.toolCallTimeoutMs === 'number' ? { toolCallTimeoutMs: record.toolCallTimeoutMs } : {}),
    };
}
function parseMcpMap(value, root) {
    let map = value;
    if (typeof map === 'object' && map !== null && !Array.isArray(map) && 'servers' in map) {
        map = map.servers;
    }
    if (typeof map !== 'object' || map === null || Array.isArray(map))
        return [];
    const specs = [];
    for (const [name, raw] of Object.entries(map)) {
        const spec = parseMcpSpec(name, raw, root);
        if (spec !== undefined)
            specs.push(spec);
    }
    return specs;
}
function skillsFromManifest(list, root, fallbackDescription) {
    if (!Array.isArray(list))
        return [];
    const result = [];
    for (const item of list) {
        if (typeof item === 'string') {
            const file = resolveSkillFile(root, item);
            const doc = readSkillDocument(file, basename(join(file, '..')));
            result.push({
                name: doc.name,
                description: doc.description,
                ...(doc.whenToUse === undefined ? {} : { whenToUse: doc.whenToUse }),
                path: relativePosix(root, file),
                ...(doc.invocation === undefined ? {} : { invocation: doc.invocation }),
            });
            continue;
        }
        if (typeof item !== 'object' || item === null)
            continue;
        const record = item;
        const path = typeof record.path === 'string' ? record.path : 'SKILL.md';
        const file = resolveSkillFile(root, path);
        const doc = readSkillDocument(file, typeof record.name === 'string' ? record.name : basename(join(file, '..')));
        const name = typeof record.name === 'string' ? normalizeSkillName(record.name) ?? doc.name : doc.name;
        const description = typeof record.description === 'string' && record.description.length > 0
            ? record.description
            : (doc.description || fallbackDescription);
        result.push({
            name,
            description,
            ...(typeof record.whenToUse === 'string' ? { whenToUse: record.whenToUse } : doc.whenToUse === undefined ? {} : { whenToUse: doc.whenToUse }),
            path: relativePosix(root, file),
            ...(doc.invocation === undefined ? {} : { invocation: doc.invocation }),
        });
    }
    return result;
}
function resolveSkillFile(root, path) {
    let file;
    try {
        file = safeJoin(root, path);
    }
    catch {
        throw new SkillManagerError('invalid-manifest', `清单里的技能路径越界：${path}`);
    }
    try {
        if (statSync(file).isDirectory())
            file = join(file, 'SKILL.md');
    }
    catch {
        throw new SkillManagerError('invalid-manifest', `清单里的技能文件不存在：${path}`);
    }
    if (!existsSync(file))
        throw new SkillManagerError('invalid-manifest', `清单里的技能文件不存在：${path}`);
    return file;
}
/** Read a package (manifest.json + SKILL.md documents) into normalized specs. */
export function parsePackage(root) {
    const manifestFile = join(root, 'manifest.json');
    let manifest = {};
    if (existsSync(manifestFile)) {
        let text;
        try {
            text = readText(manifestFile);
        }
        catch (error) {
            throw new SkillManagerError('invalid-manifest', `无法读取 manifest.json：${error.message}`);
        }
        try {
            const parsed = JSON.parse(text);
            if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
                throw new Error('manifest.json 必须是对象');
            manifest = parsed;
        }
        catch (error) {
            throw new SkillManagerError('invalid-manifest', `manifest.json 解析失败：${error.message}`);
        }
    }
    const manifestName = typeof manifest.name === 'string'
        ? manifest.name
        : (typeof manifest.slug === 'string' ? manifest.slug : '');
    const description = typeof manifest.description === 'string'
        ? manifest.description
        : (typeof manifest.summary === 'string' ? manifest.summary : '');
    let version = typeof manifest.version === 'string' ? manifest.version : '';
    // A plain npm package usually carries its version in package.json; use it
    // when the skill manifest does not name one. This is metadata only.
    const packageFile = join(root, 'package.json');
    if (existsSync(packageFile) && version.length === 0) {
        try {
            const pkg = JSON.parse(readText(packageFile));
            if (typeof pkg === 'object' && pkg !== null && typeof pkg.version === 'string') {
                version = pkg.version;
            }
        }
        catch {
            /* an invalid package.json is reported later by npm, not here */
        }
    }
    if (version.length === 0)
        version = '0.1.0';
    let skills = skillsFromManifest(manifest.skills, root, description);
    if (skills.length === 0) {
        const docs = findSkillDocuments(root);
        if (docs.length === 0) {
            throw new SkillManagerError('invalid-manifest', '没有找到 SKILL.md 或 manifest.json 中的 skills 列表');
        }
        skills = docs.map((file) => {
            const parent = file.endsWith(`${sep}SKILL.md`) ? basename(join(file, '..')) : basename(root);
            const doc = readSkillDocument(file, parent);
            return {
                name: doc.name,
                description: doc.description,
                ...(doc.whenToUse === undefined ? {} : { whenToUse: doc.whenToUse }),
                path: relativePosix(root, file),
                ...(doc.invocation === undefined ? {} : { invocation: doc.invocation }),
            };
        });
    }
    if (skills.length === 0)
        throw new SkillManagerError('invalid-manifest', '技能清单为空');
    const seen = new Set();
    for (const skill of skills) {
        if (!isValidSkillName(skill.name)) {
            throw new SkillManagerError('invalid-manifest', `技能名不合法：${skill.name}`);
        }
        if (seen.has(skill.name))
            throw new SkillManagerError('invalid-manifest', `技能名重复：${skill.name}`);
        seen.add(skill.name);
    }
    const preferred = manifestName.length > 0 ? manifestName : skills[0].name;
    const id = toStoreId(preferred);
    if (id.length === 0)
        throw new SkillManagerError('invalid-manifest', `无法从名称生成存储 id：${preferred}`);
    const mcpValue = manifest.mcpServers !== undefined ? manifest.mcpServers : manifest.mcp;
    const mcpServers = parseMcpMap(mcpValue, root);
    const dependencies = {
        node: existsSync(join(root, 'package.json')),
        python: existsSync(join(root, 'requirements.txt')),
        pythonPackages: parseStringArray(manifest.pythonDependencies).concat(typeof manifest.dependencies === 'object' && manifest.dependencies !== null && !Array.isArray(manifest.dependencies)
            ? parseStringArray(manifest.dependencies.python)
            : []),
    };
    if (dependencies.pythonPackages.length > 0)
        dependencies.python = true;
    if (existsSync(join(root, 'pyproject.toml')))
        dependencies.python = true;
    return {
        id,
        name: manifestName.length > 0 ? manifestName : skills[0].name,
        version,
        description: description.length > 0 ? description : skills[0].description,
        skills,
        mcpServers,
        dependencies,
        root,
    };
}
/** Cheap scan used by the import panel: every immediate child holding SKILL.md. */
export function listLocalSkills(root) {
    const rows = [];
    const add = (dir) => {
        const file = join(dir, 'SKILL.md');
        if (!existsSync(file))
            return;
        try {
            const doc = readSkillDocument(file, basename(dir));
            rows.push({ dir, name: doc.name, description: doc.description });
        }
        catch {
            /* an unreadable skill is simply not offered */
        }
    };
    add(root);
    let entries = [];
    try {
        entries = readdirSync(root);
    }
    catch {
        return rows;
    }
    for (const entry of entries) {
        if (SKIP_DIRECTORIES.has(entry) || entry.startsWith('.'))
            continue;
        const dir = join(root, entry);
        try {
            if (statSync(dir).isDirectory())
                add(dir);
        }
        catch {
            /* ignore */
        }
    }
    return rows;
}
