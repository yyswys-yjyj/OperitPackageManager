/**
 * 入口路径归一化：manifest.main / subpackages[].entry / ui 模块是「相对项目根」的路径，
 * 但归档内路径是「相对编译产物根」（TS 模式 = outDir，如 .opm_build/）。
 * build / verify 共用本模块。
 */

declare const Tools: any;

function normalizePath(p: string): string {
    if (!p) return '';
    const out: string[] = [];
    for (const seg of String(p).replace(/\\/g, '/').split('/')) {
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

async function readText(path: string): Promise<string | null> {
    try {
        const r = await Tools.Files.read(path);
        return r && typeof r.content === 'string' ? r.content : null;
    } catch (e) {
        return null;
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        const e = await Tools.Files.exists(path);
        return !!(e && e.exists);
    } catch (err) {
        return false;
    }
}

/** 读项目 tsconfig.json 的 outDir（相对于项目根），读不到返回 null */
export async function readTsconfigOutDir(projectDir: string): Promise<string | null> {
    const t = await readText(join(projectDir, 'tsconfig.json'));
    if (!t) return null;
    try {
        // 去掉 JSON 里的注释（tsconfig 允许 // 与 /* */）
        const cleaned = t
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
        const cfg = JSON.parse(cleaned);
        const od = cfg && cfg.compilerOptions && cfg.compilerOptions.outDir;
        if (typeof od === 'string' && od) {
            return normalizePath(od).replace(/^\.\//, '').replace(/\/+$/, '');
        }
    } catch (e) { /* ignore */ }
    return null;
}

/**
 * 把 manifest 里的路径（相对项目根）归一化成「相对编译产物根」。
 *   1. 原样命中 → 用；2. 优先按 tsconfig.outDir 剥前缀；3. 逐级剥前导目录段；4. 回退原值。
 */
export async function normalizeEntryRel(
    rel: string,
    localRootDisk: string,
    tsOutDir: string | null
): Promise<string> {
    const norm = normalizePath(rel).replace(/^\.\//, '');
    if (!norm) return norm;

    // 1. 原样命中
    if (await exists(join(localRootDisk, norm))) return norm;

    // 2. 优先按 tsconfig.outDir 剥离
    if (tsOutDir) {
        const pre = tsOutDir.endsWith('/') ? tsOutDir : tsOutDir + '/';
        if (norm.indexOf(pre) === 0) {
            const stripped = normalizePath(norm.slice(pre.length));
            if (stripped && await exists(join(localRootDisk, stripped))) return stripped;
        }
    }

    // 3. 逐级剥掉前导目录段
    let parts = norm.split('/');
    while (parts.length > 1) {
        parts = parts.slice(1);
        const cand = parts.join('/');
        if (await exists(join(localRootDisk, cand))) return cand;
    }

    return norm; // 回退
}