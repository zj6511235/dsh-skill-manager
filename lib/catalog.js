/**
 * The connector marketplace.
 *
 * A curated, offline catalog of MCP connectors that can be installed in one
 * click. Everything that identifies a server (transport, command, URL) is
 * declared here; everything secret is a placeholder. Installation turns each
 * `{{field}}` into a `${credential:REF}` template and stores the value in the
 * DSH credentials provider, so the store index never holds a token.
 */
import { isValidServerName } from './safe-path.js';
/** Prefix of every credential this plugin owns. */
export const CREDENTIAL_PREFIX = 'SKM';
/** Stable credential reference for one field of one catalog connector. */
export function credentialRefFor(connectorId, field) {
    const base = `${CREDENTIAL_PREFIX}_${connectorId}_${field}`
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, '_')
        .slice(0, 120);
    // The grammar is a POSIX shell identifier: it must not start with a digit.
    return /^[A-Z_]/.test(base) ? base : `X_${base}`;
}
/** Every `${credential:REF}` template in a string. */
export function credentialRefsIn(text) {
    return [...text.matchAll(/\$\{credential:([^}]+)\}/g)].map(match => match[1]);
}
/** Replace `{{field}}` with the credential template for that field. */
function templatize(connectorId, text) {
    return text.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (_all, field) => `\${credential:${credentialRefFor(connectorId, field)}}`);
}
const CATALOG = [
    {
        id: 'notion',
        name: 'Notion',
        vendor: 'Notion',
        category: 'efficiency',
        description: '搜索页面、读取内容、新建或更新 Notion 页面与数据库。',
        icon: '📓',
        docs: 'https://github.com/makenotion/notion-mcp-server',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@notionhq/notion-mcp-server'],
        env: { NOTION_TOKEN: '{{token}}' },
        fields: [{
                key: 'token',
                label: '集成令牌',
                placeholder: 'ntn_…',
                secret: true,
                required: true,
                hint: '在 Notion「设置 → 连接 → 开发集成」创建内部集成，并把页面共享给该集成。',
            }],
    },
    {
        id: 'lark',
        name: '飞书 / Lark',
        vendor: '飞书',
        category: 'efficiency',
        description: '读写飞书云文档、多维表格、消息与日历（官方 lark-mcp）。',
        icon: '🐦',
        docs: 'https://github.com/larksuite/lark-openapi-mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@larksuiteoapi/lark-mcp', 'mcp', '-a', '{{app_id}}', '-s', '{{app_secret}}'],
        fields: [
            { key: 'app_id', label: 'App ID', placeholder: 'cli_…', required: true, hint: '飞书开放平台自建应用的 App ID。' },
            { key: 'app_secret', label: 'App Secret', secret: true, required: true },
        ],
    },
    {
        id: 'slack',
        name: 'Slack',
        vendor: 'Slack',
        category: 'efficiency',
        description: '读取频道历史、发送消息、管理 Slack 频道与成员。',
        icon: '💬',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '{{bot_token}}', SLACK_TEAM_ID: '{{team_id}}' },
        fields: [
            { key: 'bot_token', label: 'Bot Token', placeholder: 'xoxb-…', secret: true, required: true },
            { key: 'team_id', label: 'Team ID', placeholder: 'T01234567', required: true },
        ],
    },
    {
        id: 'github',
        name: 'GitHub',
        vendor: 'GitHub',
        category: 'developer',
        description: '检索仓库、读取代码、管理 Issue 与 Pull Request（官方远程 MCP）。',
        icon: '🐙',
        docs: 'https://github.com/github/github-mcp-server',
        transport: 'streamable-http',
        url: 'https://api.githubcopilot.com/mcp/',
        headers: { Authorization: 'Bearer {{token}}' },
        fields: [{
                key: 'token',
                label: 'Personal Access Token',
                placeholder: 'ghp_… / github_pat_…',
                secret: true,
                required: true,
                hint: '在 GitHub「Settings → Developer settings → Personal access tokens」创建，按需勾选 repo 权限。',
            }],
    },
    {
        id: 'context7',
        name: 'Context7',
        vendor: 'Upstash',
        category: 'developer',
        description: '按库名检索最新版本文档与代码示例，避免写出过时 API。',
        icon: '📚',
        docs: 'https://github.com/upstash/context7',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp', '--api-key', '{{key}}'],
        fields: [{
                key: 'key',
                label: 'API Key（可选）',
                placeholder: '留空则使用公开配额',
                secret: true,
                required: false,
            }],
    },
    {
        id: 'deepwiki',
        name: 'DeepWiki',
        vendor: 'Devin',
        category: 'developer',
        description: '为任意公开 GitHub 仓库生成结构化解读，查架构与实现细节（免密钥）。',
        icon: '🧠',
        docs: 'https://docs.devin.ai/work-with-devin/deepwiki-mcp',
        transport: 'streamable-http',
        url: 'https://mcp.deepwiki.com/mcp',
        fields: [],
    },
    {
        id: 'microsoft-learn',
        name: 'Microsoft Learn',
        vendor: 'Microsoft',
        category: 'developer',
        description: '检索微软官方文档与代码示例，回答 Azure / .NET / M365 问题时更准确（免密钥）。',
        icon: '🎓',
        docs: 'https://learn.microsoft.com/en-us/training/support/mcp',
        transport: 'streamable-http',
        url: 'https://learn.microsoft.com/api/mcp',
        fields: [],
    },
    {
        id: 'playwright',
        name: 'Playwright 浏览器',
        vendor: 'Microsoft',
        category: 'developer',
        description: '真实浏览器自动化：打开页面、点击、截图、抓取动态内容。',
        icon: '🎭',
        docs: 'https://github.com/microsoft/playwright-mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
        fields: [],
    },
    {
        id: 'filesystem',
        name: '本地文件',
        vendor: 'MCP 官方',
        category: 'data',
        description: '让 Agent 读写指定目录下的文件（默认只给你填的这一个目录）。',
        icon: '🗂️',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '{{dir}}'],
        fields: [{
                key: 'dir',
                label: '允许访问的目录',
                placeholder: 'C:\\Users\\me\\Documents\\notes',
                required: true,
                hint: '填绝对路径；只填一个目录就只开放这一个目录。',
            }],
    },
    {
        id: 'memory',
        name: '长期记忆',
        vendor: 'MCP 官方',
        category: 'data',
        description: '基于知识图谱的持久记忆：保存实体与关系，跨会话记住项目上下文。',
        icon: '🧩',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        fields: [],
    },
    {
        id: 'sequential-thinking',
        name: '结构化思考',
        vendor: 'MCP 官方',
        category: 'demo',
        description: '把复杂问题拆成可回溯的思考步骤，适合规划与多步推理。',
        icon: '🪜',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
        fields: [],
    },
    {
        id: 'everything',
        name: '官方示例服务器',
        vendor: 'MCP 官方',
        category: 'demo',
        description: '包含提示、资源、工具与采样的完整示例，用来验证连接是否正常。',
        icon: '🧪',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/everything',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
        fields: [],
    },
    {
        id: 'puppeteer',
        name: 'Puppeteer',
        vendor: 'MCP 官方',
        category: 'developer',
        description: '无头浏览器：截图、执行页面脚本、抓取渲染后的内容。',
        icon: '🕸️',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-puppeteer'],
        fields: [],
    },
    {
        id: 'brave-search',
        name: 'Brave 搜索',
        vendor: 'Brave',
        category: 'search',
        description: '网页与新闻检索 API，给 Agent 一个不依赖模型记忆的搜索源。',
        icon: '🔎',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '{{key}}' },
        fields: [{
                key: 'key',
                label: 'Brave API Key',
                placeholder: 'BSA…',
                secret: true,
                required: true,
                hint: '在 https://api.search.brave.com 订阅免费的 Data for AI 套餐后获取。',
            }],
    },
    {
        id: 'postgres',
        name: 'PostgreSQL',
        vendor: 'MCP 官方',
        category: 'data',
        description: '以只读方式查询 PostgreSQL：看表结构、跑 SELECT、做数据分析。',
        icon: '🐘',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres', '{{dsn}}'],
        fields: [{
                key: 'dsn',
                label: '连接串',
                placeholder: 'postgresql://user:pass@localhost:5432/db',
                secret: true,
                required: true,
                hint: '包含密码，会作为凭据保存；建议使用只读账号。',
            }],
    },
    {
        id: 'google-maps',
        name: 'Google 地图',
        vendor: 'Google',
        category: 'search',
        description: '地点搜索、地址解析、路线与距离计算。',
        icon: '🗺️',
        docs: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-google-maps'],
        env: { GOOGLE_MAPS_API_KEY: '{{key}}' },
        fields: [{ key: 'key', label: 'Google Maps API Key', secret: true, required: true }],
    },
    {
        id: 'amap',
        name: '高德地图',
        vendor: '高德',
        category: 'china',
        description: '地点检索、周边搜索、路径规划、天气与地理编码（官方远程 MCP）。',
        icon: '🧭',
        docs: 'https://lbs.amap.com/api/mcp-server/summary',
        transport: 'streamable-http',
        url: 'https://mcp.amap.com/mcp?key={{key}}',
        fields: [{
                key: 'key',
                label: '高德 Web 服务 Key',
                placeholder: '32 位字符',
                secret: true,
                required: true,
                hint: '在高德开放平台创建「Web 服务」类型应用后获取 Key。',
            }],
    },
    {
        id: 'baidu-map',
        name: '百度地图',
        vendor: '百度',
        category: 'china',
        description: '地理编码、地点检索、路线规划与天气查询。',
        icon: '📍',
        docs: 'https://github.com/baidu-maps/mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@baidumap/mcp-server-baidu-map'],
        env: { BAIDU_MAPS_API_KEY: '{{ak}}' },
        fields: [{
                key: 'ak',
                label: '百度地图 AK',
                secret: true,
                required: true,
                hint: '在百度地图开放平台创建「服务端」应用后获取 AK（浏览器端 AK 不可用）。',
            }],
    },
];
const BY_ID = new Map(CATALOG.map(connector => [connector.id, connector]));
export function catalogConnectors() {
    return CATALOG;
}
export function findConnector(id) {
    return BY_ID.get(id);
}
/** The credential references one connector needs (names only). */
export function connectorCredentialRefs(connector) {
    const refs = new Set();
    const absorb = (text) => {
        if (text === undefined)
            return;
        for (const ref of credentialRefsIn(templatize(connector.id, text)))
            refs.add(ref);
    };
    absorb(connector.url);
    if (connector.env !== undefined)
        for (const value of Object.values(connector.env))
            absorb(value);
    if (connector.headers !== undefined)
        for (const value of Object.values(connector.headers))
            absorb(value);
    if (connector.args !== undefined)
        for (const value of connector.args)
            absorb(value);
    return [...refs];
}
/** The connector as the panel sees it: templates resolved, values absent. */
export function catalogView(connector, installed, credentialReady) {
    const fields = connector.fields.map(field => ({
        key: field.key,
        label: field.label,
        ...(field.hint === undefined ? {} : { hint: field.hint }),
        ...(field.placeholder === undefined ? {} : { placeholder: field.placeholder }),
        ...(field.secret === true ? { secret: true } : {}),
        ...(field.required === true ? { required: true } : {}),
    }));
    return {
        id: connector.id,
        name: connector.name,
        vendor: connector.vendor,
        category: connector.category,
        description: connector.description,
        icon: connector.icon,
        docs: connector.docs,
        transport: connector.transport,
        ...(connector.command === undefined ? {} : { command: connector.command }),
        ...(connector.args === undefined ? {} : { args: connector.args.map(arg => templatize(connector.id, arg).replace(/\$\{credential:[^}]+\}/g, '…')) }),
        ...(connector.url === undefined ? {} : { url: connector.url.replace(/\{\{[a-zA-Z0-9_-]+\}\}/g, '…') }),
        fields,
        credentialRefs: connectorCredentialRefs(connector),
        installed: installed !== undefined,
        ...(installed === undefined ? {} : { entryId: installed.entryId, enabled: installed.enabled }),
        credentialReady,
    };
}
/** Build the store spec for one connector (references only, never values). */
export function buildConnectorSpec(connector, filled) {
    if (!isValidServerName(connector.id))
        throw new Error(`连接器 id 不合法：${connector.id}`);
    // A template whose field the user left blank is dropped instead of left
    // unresolved, so an optional key really is optional.
    const usable = (text) => {
        if (filled === undefined)
            return true;
        return [...text.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)].every(match => filled.has(match[1]));
    };
    const spec = {
        name: connector.id,
        transport: connector.transport,
        // First launch of an npx connector downloads the package; give it room.
        startupTimeoutMs: 120_000,
        catalogId: connector.id,
    };
    if (connector.transport === 'streamable-http') {
        spec.url = templatize(connector.id, connector.url ?? '');
        spec.headers = Object.fromEntries(Object.entries(connector.headers ?? {})
            .filter(([, value]) => usable(value))
            .map(([key, value]) => [key, templatize(connector.id, value)]));
        return spec;
    }
    spec.command = connector.command;
    const args = [];
    for (const arg of connector.args ?? []) {
        if (!usable(arg)) {
            // `--api-key {{key}}` with a blank key drops the flag together with the
            // value; a lone flag would make the server refuse to start.
            const previous = args[args.length - 1];
            if (previous !== undefined && previous.startsWith('-') && !previous.includes('${'))
                args.pop();
            continue;
        }
        args.push(templatize(connector.id, arg));
    }
    spec.args = args;
    if (connector.env !== undefined) {
        spec.env = Object.fromEntries(Object.entries(connector.env)
            .filter(([, value]) => usable(value))
            .map(([key, value]) => [key, templatize(connector.id, value)]));
    }
    return spec;
}
/**
 * Check what the user typed.
 *
 * Values reach a command line or an HTTP header, so quotes and control
 * characters are refused instead of escaped: a connector that cannot express
 * the value safely must fail visibly.
 */
export function validateFieldValues(connector, values) {
    const clean = {};
    const missing = [];
    for (const field of connector.fields) {
        const raw = values[field.key];
        const value = typeof raw === 'string' ? raw.trim() : '';
        if (value.length === 0) {
            if (field.required === true)
                missing.push(field);
            continue;
        }
        if (/["\r\n\t]/.test(value)) {
            return { clean, missing, problem: `${field.label} 不能包含引号、换行或制表符` };
        }
        if (value.length > 4096) {
            return { clean, missing, problem: `${field.label} 过长` };
        }
        clean[field.key] = value;
    }
    return { clean, missing };
}
