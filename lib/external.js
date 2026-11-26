/**
 * Import surface: find skills that other agents already installed.
 *
 * The list is deliberately read-only and shallow: one directory level under
 * each well-known root, stopping at the first SKILL.md. Nothing outside these
 * roots is scanned, and no file is modified until the user picks an entry.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { readSkillDocument } from './manifest.js';
import { isInside } from './safe-path.js';
/** Roots used by the agents SkillHub itself documents, plus DSH and shared agents. */
export function knownSkillRoots(home = homedir(), cwd = process.cwd()) {
    const rows = [
        { path: join(home, '.dsh', 'skills'), agent: 'dsh', label: 'DSH' },
        { path: join(home, '.claude', 'skills'), agent: 'claude-code', label: 'Claude Code' },
        { path: join(home, '.codex', 'skills'), agent: 'codex', label: 'Codex' },
        { path: join(home, '.cursor', 'skills'), agent: 'cursor', label: 'Cursor' },
        { path: join(home, '.codeium', 'windsurf', 'skills'), agent: 'windsurf', label: 'Windsurf' },
        { path: join(home, '.gemini', 'skills'), agent: 'gemini-cli', label: 'Gemini CLI' },
        { path: join(home, '.gemini', 'antigravity', 'skills'), agent: 'antigravity', label: 'Google Antigravity' },
        { path: join(home, '.qoderwork', 'skills'), agent: 'qoderwork', label: 'QoderWork' },
        { path: join(home, '.workbuddy', 'skills'), agent: 'workbuddy', label: 'WorkBuddy' },
        { path: join(home, '.codebuddy', 'skills'), agent: 'codebuddy', label: 'CodeBuddy' },
        { path: join(home, '.hermes', 'skills'), agent: 'hermes', label: 'Hermes' },
        { path: join(home, '.agents', 'skills'), agent: 'agents', label: 'Shared .agents' },
        { path: join(home, '.skillhub', 'skills'), agent: 'skillhub', label: 'SkillHub CLI' },
        { path: join(cwd, '.dsh', 'skills'), agent: 'project-dsh', label: '当前项目 · DSH' },
        { path: join(cwd, '.agents', 'skills'), agent: 'project-agents', label: '当前项目 · .agents' },
        { path: join(cwd, '.claude', 'skills'), agent: 'project-claude', label: '当前项目 · Claude' },
    ];
    return rows;
}
function listUnderRoot(root) {
    const rows = [];
    if (!existsSync(root.path))
        return rows;
    try {
        if (statSync(root.path).isFile())
            return rows;
    }
    catch {
        return rows;
    }
    if (existsSync(join(root.path, 'SKILL.md')))
        rows.push({ dir: root.path, agent: root.agent, label: root.label });
    let entries;
    try {
        entries = readdirSync(root.path);
    }
    catch {
        return rows;
    }
    for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'node_modules')
            continue;
        const dir = join(root.path, entry);
        try {
            if (statSync(dir).isDirectory() && existsSync(join(dir, 'SKILL.md'))) {
                rows.push({ dir, agent: root.agent, label: root.label });
            }
        }
        catch {
            /* unreadable entry: skip */
        }
    }
    return rows;
}
/** List installed skills from other agents; `storeDir` entries are excluded. */
export function scanExternalSkills(options) {
    const home = options.home ?? homedir();
    const cwd = options.cwd ?? process.cwd();
    const seenDirs = new Set();
    const seenNames = new Set();
    const rows = [];
    for (const root of knownSkillRoots(home, cwd)) {
        if (isInside(options.storeDir, root.path))
            continue;
        for (const found of listUnderRoot(root)) {
            const key = resolve(found.dir);
            if (seenDirs.has(key) || isInside(options.storeDir, key))
                continue;
            seenDirs.add(key);
            let name = basename(found.dir);
            let description = '';
            try {
                const doc = readSkillDocument(join(found.dir, 'SKILL.md'), basename(found.dir));
                name = doc.name;
                description = doc.description;
            }
            catch {
                /* keep folder name; still offer the import */
            }
            if (seenNames.has(name))
                continue;
            seenNames.add(name);
            const linkedId = options.linkedByPath?.get(key);
            rows.push({
                path: key,
                folder: basename(found.dir),
                name,
                description,
                agent: found.agent,
                agentLabel: found.label,
                installed: options.installedIds?.has(name) ?? false,
                linked: linkedId !== undefined,
                ...(linkedId === undefined ? {} : { linkedId }),
            });
        }
    }
    return rows.sort((left, right) => left.agentLabel.localeCompare(right.agentLabel) || left.name.localeCompare(right.name));
}
