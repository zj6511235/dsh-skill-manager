/**
 * Bridge between the store and DSH's runtime services.
 *
 * Skills are registered with `ctx.skills.register()` and MCP servers with
 * `ctx.mcpManager.register()`, both for this plugin's lifetime only. Nothing
 * is written into `~/.dsh/skills` or the profile's config tree, so disabling
 * the plugin removes every contributed capability cleanly.
 */
import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { parseFrontmatter } from './frontmatter.js';
import { isValidServerName } from './safe-path.js';
const MAX_SKILL_BYTES = 1024 * 1024;
/** Stable, collision-resistant MCP namespace for one store entry. */
export function mcpServerName(id, server) {
    const base = `skm_${id}_${server}`.replace(/[^A-Za-z0-9_-]/g, '_');
    if (base.length <= 32)
        return base;
    let hash = 0;
    for (let index = 0; index < base.length; index += 1)
        hash = (hash * 31 + base.charCodeAt(index)) >>> 0;
    return `${base.slice(0, 24)}_${hash.toString(36).slice(0, 7)}`;
}
export class RegistrationController {
    ctx;
    store;
    skills;
    mcp;
    disposers = [];
    watcher;
    timer;
    disposed = false;
    refreshing = false;
    pending = false;
    /** Non-fatal registration problems, shown by the status route. */
    warnings = [];
    constructor(ctx, store) {
        this.ctx = ctx;
        this.store = store;
    }
    attachSkills(service) {
        if (service === undefined || this.disposed)
            return;
        this.skills = service;
        this.ctx.logger?.info?.('dsh-skill-manager: skills service attached');
        this.requestRefresh();
    }
    attachMcp(service) {
        if (service === undefined || this.disposed)
            return;
        this.mcp = service;
        this.ctx.logger?.info?.('dsh-skill-manager: mcpManager service attached');
        this.requestRefresh();
    }
    capabilities() {
        return { skills: this.skills !== undefined, mcp: this.mcp !== undefined };
    }
    /** Watch the index so CLI/API changes become live without a restart. */
    startWatching() {
        if (this.disposed)
            return;
        try {
            this.store.ensureLayout();
            this.watcher = watch(this.store.dir, { persistent: false }, (_event, filename) => {
                if (filename === null || filename === 'index.json')
                    this.requestRefresh();
            });
            this.watcher.on('error', (error) => {
                this.ctx.logger?.warn?.(`dsh-skill-manager: store watcher stopped: ${String(error)}`);
            });
            // A watcher must never be the reason the Host process stays alive.
            this.watcher.unref?.();
        }
        catch (error) {
            this.ctx.logger?.warn?.(`dsh-skill-manager: cannot watch the store: ${String(error)}`);
        }
        this.requestRefresh();
    }
    requestRefresh() {
        if (this.disposed)
            return;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.timer = undefined;
            void this.refreshNow();
        }, 250);
    }
    /** Rebuild every registration from the current index. */
    async refreshNow() {
        if (this.disposed)
            return;
        if (this.refreshing) {
            this.pending = true;
            return;
        }
        this.refreshing = true;
        try {
            this.disposeRegistrations();
            this.warnings.length = 0;
            const index = this.store.readIndex();
            const entries = Object.values(index.skills).filter(entry => entry.enabled);
            for (const entry of entries) {
                try {
                    this.registerEntry(entry);
                }
                catch (error) {
                    this.warnings.push(`技能 ${entry.id} 注册失败：${error.message}`);
                }
            }
        }
        catch (error) {
            this.warnings.push(`读取技能库失败：${error.message}`);
            this.ctx.logger?.warn?.(`dsh-skill-manager: refresh failed: ${error.message}`);
        }
        finally {
            this.refreshing = false;
            if (this.pending) {
                this.pending = false;
                this.requestRefresh();
            }
        }
    }
    registerEntry(entry) {
        const dir = entry.origin === 'external' && entry.externalPath !== undefined
            ? entry.externalPath
            : join(this.store.skillsDir, entry.id);
        if (!existsSync(dir)) {
            this.warnings.push(`技能 ${entry.id} 的目录丢失，已跳过`);
            return;
        }
        if (this.skills !== undefined) {
            for (const skill of entry.skills) {
                try {
                    const file = join(dir, skill.path);
                    if (!existsSync(file)) {
                        this.warnings.push(`技能 ${entry.id}: 找不到 ${skill.path}`);
                        continue;
                    }
                    const raw = readFileSync(file, 'utf8');
                    if (raw.length > MAX_SKILL_BYTES) {
                        this.warnings.push(`技能 ${skill.name} 超过 1 MiB，已跳过`);
                        continue;
                    }
                    const parsed = parseFrontmatter(raw);
                    const body = parsed?.body ?? raw;
                    const dispose = this.skills.register({
                        name: skill.name,
                        description: skill.description,
                        ...(skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse }),
                        source: 'custom',
                        provider: 'skill-manager',
                        path: file,
                        content: body,
                        resourceBase: { kind: 'directory', path: dir },
                        ...(skill.invocation === undefined ? {} : { invocation: skill.invocation }),
                    });
                    this.disposers.push(dispose);
                    this.ctx.logger?.debug?.(`dsh-skill-manager: registered skill ${skill.name}`);
                }
                catch (error) {
                    this.warnings.push(`技能 ${skill.name} 注册失败：${error.message}`);
                }
            }
        }
        if (this.mcp !== undefined) {
            for (const server of entry.mcpServers) {
                const name = mcpServerName(entry.id, server.name);
                if (!isValidServerName(name)) {
                    this.warnings.push(`MCP 名不合法：${name}`);
                    continue;
                }
                try {
                    const spec = this.buildMcpEntry(entry, dir, server);
                    const dispose = this.mcp.register(name, spec);
                    this.disposers.push(dispose);
                    this.ctx.logger?.debug?.(`dsh-skill-manager: registered MCP ${name}`);
                }
                catch (error) {
                    this.warnings.push(`MCP ${server.name} 注册失败：${error.message}`);
                }
            }
        }
    }
    buildMcpEntry(entry, dir, server) {
        if (server.transport === 'streamable-http') {
            return {
                transport: 'streamable-http',
                url: server.url,
                headers: server.headers ?? {},
                ...(server.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: server.startupTimeoutMs }),
                ...(server.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: server.toolCallTimeoutMs }),
            };
        }
        let command = server.command ?? '';
        if (command.startsWith('./') || command.startsWith('.\\'))
            command = join(dir, command.slice(2));
        if (/^(python|python3|python\.exe)$/i.test(command)) {
            const venv = process.platform === 'win32'
                ? join(dir, '.venv', 'Scripts', 'python.exe')
                : join(dir, '.venv', 'bin', 'python3');
            if (existsSync(venv))
                command = venv;
        }
        const env = { ...(server.env ?? {}) };
        // `pip --target` fallback: make the private package directory importable
        // for Python-based MCP servers.
        const libs = join(dir, '.python-libs');
        if (existsSync(libs) && (/python/i.test(command) || (server.args ?? []).some(arg => /\.py$/i.test(arg)))) {
            const separator = process.platform === 'win32' ? ';' : ':';
            env.PYTHONPATH = env.PYTHONPATH === undefined ? libs : `${libs}${separator}${env.PYTHONPATH}`;
        }
        const args = (server.args ?? []).map((arg) => {
            if (arg.startsWith('${') || arg.startsWith('-'))
                return arg;
            if (/^[./]/.test(arg) && existsSync(join(dir, arg)))
                return join(dir, arg);
            return arg;
        });
        const cwd = server.cwd === undefined || server.cwd.length === 0
            ? dir
            : (server.cwd.startsWith('/') || /^[A-Za-z]:/.test(server.cwd) ? server.cwd : join(dir, server.cwd));
        return {
            transport: 'stdio',
            command,
            args,
            env,
            cwd,
            ...(server.startupTimeoutMs === undefined ? {} : { startupTimeoutMs: server.startupTimeoutMs }),
            ...(server.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: server.toolCallTimeoutMs }),
        };
    }
    disposeRegistrations() {
        const list = this.disposers;
        this.disposers = [];
        for (const dispose of list.reverse()) {
            try {
                dispose();
            }
            catch {
                /* a failed unregister must not block the rest */
            }
        }
    }
    dispose() {
        this.disposed = true;
        if (this.timer !== undefined)
            clearTimeout(this.timer);
        this.timer = undefined;
        this.watcher?.close();
        this.watcher = undefined;
        this.disposeRegistrations();
    }
}
