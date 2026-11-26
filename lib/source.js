/**
 * Turn a user-supplied installation source into one canonical kind.
 *
 * Supported today:
 * - npm package spec (`@scope/name@1.2.3`, `npm:pkg`)
 * - GitHub / any git URL (`https://github.com/o/r`, `git@…`, `github:o/r`)
 * - SkillHub slug or page (`skillhub:find-skill`, `https://skillhub.cn/skills/<slug>`)
 * - `.zip` / `.tar.gz` URL or local path
 * - an existing local directory
 */
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { SkillManagerError } from './errors.js';
const NPM_SPEC = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:@[A-Za-z0-9^~<>=*+|.\-\s]+)?$/i;
const SKILLHUB_SLUG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
function archiveKind(path) {
    return /\.(zip|tar\.gz|tgz)$/i.test(path.split(/[?#]/)[0] ?? path);
}
function skillhubSlugFromUrl(url) {
    const host = url.hostname.toLowerCase();
    if (host === 'api.skillhub.cn') {
        const slug = url.searchParams.get('slug');
        if (slug !== null && SKILLHUB_SLUG.test(slug))
            return slug;
        const match = /^\/api\/v1\/skills\/([^/]+)\/?$/.exec(url.pathname);
        if (match !== null && SKILLHUB_SLUG.test(match[1]))
            return match[1];
        return undefined;
    }
    if (host === 'skillhub.cn' || host === 'www.skillhub.cn') {
        const match = /^\/skills\/([^/]+)\/?$/.exec(url.pathname);
        if (match !== null && SKILLHUB_SLUG.test(match[1]))
            return match[1];
    }
    return undefined;
}
function githubSpec(url) {
    if (url.hostname.toLowerCase() !== 'github.com' && url.hostname.toLowerCase() !== 'www.github.com')
        return undefined;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2)
        return undefined;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, '');
    if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo))
        return undefined;
    let ref;
    let subdir;
    if (parts[2] === 'tree' && parts.length >= 4) {
        ref = parts[3];
        subdir = parts.slice(4).join('/') || undefined;
    }
    if (parts[2] === 'blob')
        return undefined;
    return {
        kind: 'git',
        value: `https://github.com/${owner}/${repo}.git`,
        ...(ref === undefined ? {} : { ref }),
        ...(subdir === undefined ? {} : { subdir }),
        label: `${owner}/${repo}${ref === undefined ? '' : `#${ref}`}${subdir === undefined ? '' : `/${subdir}`}`,
    };
}
/** Classify one source string. Throws `invalid-source` when nothing matches. */
export function classifySource(input, cwd = process.cwd()) {
    const raw = String(input ?? '').trim();
    if (raw.length === 0)
        throw new SkillManagerError('invalid-source', '安装源不能为空');
    if (raw.length > 2048)
        throw new SkillManagerError('invalid-source', '安装源过长');
    if (raw.toLowerCase().startsWith('skillhub:')) {
        const slug = raw.slice('skillhub:'.length).trim();
        if (!SKILLHUB_SLUG.test(slug))
            throw new SkillManagerError('invalid-source', `SkillHub slug 不合法：${slug}`);
        return { kind: 'skillhub', value: slug, label: `SkillHub · ${slug}` };
    }
    if (raw.toLowerCase().startsWith('github:')) {
        const rest = raw.slice('github:'.length).trim();
        const [repoPart, ref] = rest.split('#');
        const segments = repoPart.split('/').filter(Boolean);
        if (segments.length < 2)
            throw new SkillManagerError('invalid-source', `GitHub 源应形如 github:owner/repo：${raw}`);
        const owner = segments[0];
        const repo = segments[1].replace(/\.git$/, '');
        return {
            kind: 'git',
            value: `https://github.com/${owner}/${repo}.git`,
            ...(ref === undefined || ref.length === 0 ? {} : { ref }),
            ...(segments.length > 2 ? { subdir: segments.slice(2).join('/') } : {}),
            label: `${owner}/${repo}${ref === undefined || ref.length === 0 ? '' : `#${ref}`}`,
        };
    }
    if (raw.toLowerCase().startsWith('npm:')) {
        const spec = raw.slice('npm:'.length).trim();
        if (!NPM_SPEC.test(spec))
            throw new SkillManagerError('invalid-source', `npm 包名不合法：${spec}`);
        return { kind: 'npm', value: spec, label: `npm · ${spec}` };
    }
    if (/^https?:\/\//i.test(raw)) {
        let url;
        try {
            url = new URL(raw);
        }
        catch {
            throw new SkillManagerError('invalid-source', `无法解析 URL：${raw}`);
        }
        const slug = skillhubSlugFromUrl(url);
        if (slug !== undefined)
            return { kind: 'skillhub', value: slug, label: `SkillHub · ${slug}` };
        const github = githubSpec(url);
        if (github !== undefined)
            return github;
        if (url.hostname.toLowerCase() === 'codeload.github.com' || archiveKind(url.pathname)) {
            return { kind: 'archive', value: url.toString(), label: url.toString() };
        }
        // Any other HTTPS URL is downloaded and sniffed: many skill sites serve a
        // ZIP from a clean route without a `.zip` suffix.
        return { kind: 'archive', value: url.toString(), label: url.toString() };
    }
    if (/^git@[^:]+:.+/.test(raw) || /^git\+https?:\/\//i.test(raw)) {
        return { kind: 'git', value: raw.replace(/^git\+/, ''), label: raw };
    }
    if (isAbsolute(raw) || raw.startsWith('.') || /^[A-Za-z]:[\\/]/.test(raw)) {
        const path = resolve(cwd, raw);
        if (!existsSync(path))
            throw new SkillManagerError('invalid-source', `本地路径不存在：${raw}`);
        const info = statSync(path);
        if (info.isDirectory())
            return { kind: 'local', value: path, label: path };
        if (info.isFile() && archiveKind(path))
            return { kind: 'archive', value: path, label: path };
        throw new SkillManagerError('invalid-source', '本地源必须是目录或 .zip/.tar.gz 文件');
    }
    if (archiveKind(raw) && existsSync(resolve(cwd, raw))) {
        const path = resolve(cwd, raw);
        return { kind: 'archive', value: path, label: path };
    }
    // `owner/repo` shorthand for GitHub.
    if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:#.*)?$/.test(raw)) {
        const [repoPart, ref] = raw.split('#');
        const [owner, repo] = repoPart.split('/');
        return {
            kind: 'git',
            value: `https://github.com/${owner}/${repo.replace(/\.git$/, '')}.git`,
            ...(ref === undefined || ref.length === 0 ? {} : { ref }),
            label: `${owner}/${repo}`,
        };
    }
    if (NPM_SPEC.test(raw))
        return { kind: 'npm', value: raw, label: `npm · ${raw}` };
    throw new SkillManagerError('invalid-source', '无法识别的安装源。可用：npm 包名、GitHub 地址、SkillHub slug（skillhub:<slug>）、.zip 文件或本地目录。');
}
