function unquote(raw) {
    const value = raw.trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        try {
            return JSON.parse(value.replace(/\n/g, '\\n'));
        }
        catch {
            return value.slice(1, -1);
        }
    }
    if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1).replace(/''/g, "'");
    }
    return value;
}
export function parseFrontmatter(markdown) {
    const text = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    if (!text.startsWith('---'))
        return undefined;
    const end = text.indexOf('\n---', 3);
    if (end === -1)
        return undefined;
    const header = text.slice(3, end).replace(/^\n/, '');
    const after = text.indexOf('\n', end + 4);
    const body = after === -1 ? '' : text.slice(after + 1);
    const data = {};
    const lines = header.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.trim().length === 0 || line.trimStart().startsWith('#'))
            continue;
        if (/^\s/.test(line))
            continue;
        const match = /^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/.exec(line);
        if (match === null)
            continue;
        const key = match[1];
        const raw = match[2].trim();
        if (raw === '|' || raw === '>') {
            const parts = [];
            while (index + 1 < lines.length && (/^\s{2,}/.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
                index += 1;
                parts.push(lines[index].replace(/^\s{2,}/, ''));
            }
            data[key] = parts.join(raw === '>' ? ' ' : '\n').trim();
            continue;
        }
        if (raw.startsWith('[') && raw.endsWith(']')) {
            data[key] = raw
                .slice(1, -1)
                .split(',')
                .map(item => unquote(item))
                .filter(item => item.length > 0);
            continue;
        }
        if (raw.length === 0)
            continue;
        data[key] = unquote(raw);
    }
    return { data, body };
}
/** Read the first string value among several accepted spellings. */
export function pickString(data, keys) {
    for (const key of keys) {
        const value = data[key];
        if (typeof value === 'string' && value.trim().length > 0)
            return value.trim();
        if (Array.isArray(value) && value.length > 0)
            return value.join(', ');
    }
    return undefined;
}
