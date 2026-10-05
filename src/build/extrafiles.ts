/**
 */

declare const Tools: any;

export function normalizePath(p: string): string {
    if (!p) return '';
    let s = String(p).replace(/\\/g, '/');
    const out: string[] = [];
    for (const seg of s.split('/')) {
        if (!seg || seg === '.') continue;
        if (seg === '..') { out.pop(); continue; }
        out.push(seg);
    }
    return out.join('/');
}

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

/** 判断归档内路径是否命中排除前缀 */
export function isExcluded(archivePath: string, excludePrefixes: string[]): boolean {
    const p = normalizePath(archivePath);
    for (const pre of excludePrefixes) {
        const norm = normalizePath(pre);
        if (!norm) continue;
        const withSlash = norm.endsWith('/') ? norm : norm + '/';
        if (p === norm || p.indexOf(withSlash) === 0) return true;
    }
    return false;
}

/**
 * 展开 extra_files 单个条目：
 *   - 若是目录 -> 递归收集其下全部文件（相对 projectDir 的路径）
 *   - 否则 -> 原样返回 [rel]（由调用方再判存在性）
 */
export async function expandExtraEntry(
    projectDir: string,
    rel: string,
    excludePrefixes: string[]
): Promise<string[]> {
    const abs = join(projectDir, rel);
    let isDir = false;
    try {
        const listing = await Tools.Files.list(abs);
        const entries = listing && (listing.files || listing.entries || listing.children);
        if (Array.isArray(entries)) isDir = true;
    } catch (e) { isDir = false; }
    if (!isDir) return [rel];

    const out: string[] = [];
    const walk = async (dirRel: string, depth: number): Promise<void> => {
        if (depth <= 0) return;
        let listing: any;
        try { listing = await Tools.Files.list(join(projectDir, dirRel)); } catch (e) { return; }
        const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
        for (const it of entries) {
            const name = it.name || it.fileName || '';
            if (!name) continue;
            const childRel = normalizePath(dirRel ? dirRel + '/' + name : name);
            const isChildDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
            if (isChildDir) {
                if (name === 'node_modules' || name.startsWith('.')) continue;
                if (isExcluded(childRel, excludePrefixes)) continue;
                await walk(childRel, depth - 1);
            } else {
                if (isExcluded(childRel, excludePrefixes)) continue;
                out.push(childRel);
            }
        }
    };
    await walk(rel, 10);
    return out;
}
