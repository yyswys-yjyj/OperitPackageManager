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
 *
 * 目录判定用 node.operit 的 fs.statSync（javabridge -> java.io.File），
 * 明确给出 isFile / isDirectory，不必靠 list 返回结构去猜。
 * 注意：opm 打包时会把这个 `require('fs')` 重写成 node.operit 的 fs.js。
 */
export async function expandExtraEntry(
    projectDir: string,
    rel: string,
    excludePrefixes: string[]
): Promise<string[]> {
    const abs = join(projectDir, rel);

    const kind = probeKind(abs);
    if (kind === 'file') return [rel];
    if (kind === 'none') return [rel];  // 不存在：原样交回，由调用方报「文件不存在」

    // kind === 'dir'：递归收集
    const out: string[] = [];
    const walk = async (dirRel: string, depth: number): Promise<void> => {
        if (depth <= 0) return;
        let items: any[] = [];
        try {
            const ls: any = await Tools.Files.list(join(projectDir, dirRel));
            const arr = ls && (ls.files || ls.entries || ls.children);
            if (Array.isArray(arr)) items = arr;
        } catch (_e) { return; }
        for (const it of items) {
            const name = it.name || it.fileName || '';
            if (!name) continue;
            const childRel = normalizePath(dirRel ? dirRel + '/' + name : name);
            if (isExcluded(childRel, excludePrefixes)) continue;
            const flag = it.isDirectory === true || it.type === 'directory' || it.directory === true;
            const childAbs = join(projectDir, childRel);
            const childKind = flag ? 'dir' : probeKind(childAbs);
            if (childKind === 'dir') {
                if (name === 'node_modules' || name.startsWith('.')) continue;
                await walk(childRel, depth - 1);
            } else if (childKind === 'file') {
                out.push(childRel);
            }
        }
    };
    await walk(rel, 10);

    // 空目录：返回空，由调用方报「空目录」
    return out;
}

/** 用 fs.statSync 判断路径类型：'file' / 'dir' / 'none' / 'unknown'。 */
function probeKind(abs: string): 'file' | 'dir' | 'none' | 'unknown' {
    try {
        const fsMod: any = require('fs');
        if (fsMod && typeof fsMod.statSync === 'function') {
            const st = fsMod.statSync(abs);
            if (st) {
                if (typeof st.isDirectory === 'function' && st.isDirectory()) return 'dir';
                if (typeof st.isFile === 'function' && st.isFile()) return 'file';
            }
        }
    } catch (_e) {
        // statSync 在路径不存在时通常抛 ENOENT；也可能整个 fs 不可用
    }
    // fs 拿不到结论：再用 exists 兜一下，实在不行按「未知」处理（调用方走单文件路径）
    try {
        const fsMod2: any = require('fs');
        if (fsMod2 && typeof fsMod2.existsSync === 'function' && fsMod2.existsSync(abs)) {
            return 'unknown';
        }
    } catch (_e2) { /* ignore */ }
    return 'none';
}
