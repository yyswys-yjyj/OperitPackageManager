/**
 * 解析器：把一个裸名解析成「归档内目标」。
 *
 * 规则（BUILTINS.json.packing.rules）：
 *   - Node 内建 -> <node.operit 安装目录>/dist/<subpath>.js
 *   - npm 包 -> 该包入口（main / exports 在**打包期**解析，运行期无此能力）
 *   - lodash / uuid / axios 保持原样（operit 自带）
 *   - 契约里 status=planned/unsupported 的内建 -> 抛错（构建失败）
 *
 * 输出的是「相对消费方项目根」的归档内路径，如
 *   node_modules/@serveryyswys/node.operit/dist/fs.js
 *   node_modules/ms/index.js
 */

import {
    NodeOperitContract,
    getBuiltin,
    normalizeBuiltinName,
    subpathToInstallRelPath,
    isImplemented
} from './contract';
import { normalizePath, dirname } from './rewriter';
import { readTextSafeAsync } from '../core/nodesafe';

export interface ResolvedBare {
    /** 解析出的归档内路径（相对项目根，不带前导 /） */
    archivePath: string;
    kind: 'builtin' | 'npm' | 'whitelist';
    /** 原始裸名 */
    name: string;
}

export class ResolveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResolveError';
    }
}

export const WHITELIST = ['lodash', 'uuid', 'axios'];

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

async function exists(p: string): Promise<boolean> {
    try {
        const e = await Tools.Files.exists(p);
        return !!(e && e.exists);
    } catch (err) {
        return false;
    }
}

async function readJson(projectDir: string, relPath: string): Promise<any | null> {
    try {
        const text = await readTextSafeAsync(join(projectDir, relPath));
        if (text === null) return null;
        return JSON.parse(text);
    } catch (err) {
        return null;
    }
}

/**
 * 解析 npm 包（或包内子路径）的入口文件（打包期）。对齐 Node 的 CommonJS 解析：
 *   - 'pkg'           -> 包入口（exports['.'] -> exports 字符串 -> main -> index.js）
 *   - 'pkg/sub/path'  -> 先看 exports['./sub/path']（含通配 *），否则直接找文件
 *   - '@scope/pkg/x'  -> 同上，包名是前两段
 * 返回相对项目根的归档内路径；找不到返回 null。
 *
 * 若传 roots（多查找根），则依次在每个 root 的 node_modules 下找；
 * 命中哪个 root，返回的 archivePath 仍是统一的 'node_modules/<name>/...'。
 */
export async function resolveNpmEntry(
    projectDir: string,
    name: string,
    roots?: string[]
): Promise<string | null> {
    // 拆包名与子路径：@scope/pkg[/sub] 或 pkg[/sub]
    const parsed = splitPackageSpecifier(name);
    if (!parsed) return null;
    const { pkgName, subpath } = parsed;
    const searchRoots = (roots && roots.length) ? roots : [projectDir];
    for (const root of searchRoots) {
        const hit = await resolveNpmEntryInRoot(root, pkgName, subpath);
        if (!hit) continue;
        // 命中 root 可能是嵌套目录（如 node_modules/_nest1_lib）；
        // 此时返回的路径是「相对该 root」的，需补回它相对项目根的偏移，
        // 保证归档路径始终是「从项目根算起」的完整层级：
        //   node_modules/_nest1_lib/node_modules/_nest1_dep/index.js
        const off = relOffset(projectDir, root);
        return off ? normalizePath(join(off, hit)) : hit;
    }
    return null;
}
/** root 相对 base 的偏移（归档路径片段）；base 本身返回空串 */
function relOffset(base: string, root: string): string {
    const b = normalizePath(base);
    const r = normalizePath(root);
    if (r === b) return '';
    if (r.indexOf(b + '/') === 0) return r.slice(b.length + 1);
    return ''; // 不在 base 之下（如全局影子目录）→ 不补偏移
}
/**
 * 拆 CommonJS 包名与子路径：
 *   'pkg'              -> { pkgName: 'pkg', subpath: '' }
 *   'pkg/a/b.js'       -> { pkgName: 'pkg', subpath: 'a/b.js' }
 *   '@s/pkg'           -> { pkgName: '@s/pkg', subpath: '' }
 *   '@s/pkg/a'         -> { pkgName: '@s/pkg', subpath: 'a' }
 * 非法（空、@ 但段不足）返回 null。
 */
function splitPackageSpecifier(name: string): { pkgName: string; subpath: string } | null {
    const n = normalizePath(String(name || '').trim());
    if (!n) return null;
    const segs = n.split('/');
    if (segs[0].startsWith('@')) {
        if (segs.length < 2 || !segs[0] || !segs[1]) return null;
        return { pkgName: segs[0] + '/' + segs[1], subpath: segs.slice(2).join('/') };
    }
    if (!segs[0]) return null;
    return { pkgName: segs[0], subpath: segs.slice(1).join('/') };
}
/**
 * 在单个 root 的 node_modules 下解析 npm 包入口（或包内子路径）。
 */
async function resolveNpmEntryInRoot(
    projectDir: string,
    pkgName: string,
    subpath?: string
): Promise<string | null> {
    // scoped 包名 @scope/name 的结构与普通包一致，路径即 pkgName
    const pkgRoot = normalizePath(join('node_modules', pkgName));
    const pkgJsonRel = join(pkgRoot, 'package.json');
    const pkgJson = await readJson(projectDir, pkgJsonRel);
    const pkgRootAbs = join(projectDir, pkgRoot);
    const tryFile = async (rel: string): Promise<string | null> => {
        const p = normalizePath(rel);
        // 已带扩展名：只试原样（避免目录误命中，先试 .js 变体）
        if (/\.[a-z0-9]+$/i.test(p)) {
            if (await exists(join(pkgRootAbs, p))) return join(pkgRoot, p);
            return null;
        }
        // 无扩展名：按 .js / /index.js / 原样 顺序
        if (await exists(join(pkgRootAbs, p + '.js'))) return join(pkgRoot, p + '.js');
        if (await exists(join(pkgRootAbs, p + '/index.js'))) return join(pkgRoot, p + '/index.js');
        if (await exists(join(pkgRootAbs, p))) return join(pkgRoot, p);
        return null;
    };
    // ---- 子路径：优先 exports['./<sub>'] 映射，再直接当文件找 ----
    if (subpath) {
        if (pkgJson && pkgJson.exports) {
            const mapped = mapExportsSubpath(pkgJson.exports, './' + subpath);
            if (mapped) {
                const f = await tryFile(mapped);
                if (f) return f;
            }
        }
        const direct = await tryFile(subpath);
        if (direct) return direct;
        return null;
    }
    // ---- 包根：exports['.'] -> exports 字符串 -> main -> index.js ----
    if (pkgJson) {
        const ex = pkgJson.exports;
        if (ex) {
            let dot: any = null;
            if (typeof ex === 'string') dot = ex;
            else if (typeof ex === 'object') {
                dot = ex['.'] !== undefined ? ex['.'] : ex['./'];
            }
            const resolvedDot = resolveCondition(dot);
            if (typeof resolvedDot === 'string') {
                const f = await tryFile(resolvedDot);
                if (f) return f;
            }
        }
        if (typeof pkgJson.main === 'string' && pkgJson.main) {
            const f = await tryFile(pkgJson.main);
            if (f) return f;
        }
    }
    // 兜底：index.js
    const idx = await tryFile('index.js');
    if (idx) return idx;
    return null;
}
/** 从 exports 里解析条件导出对象，按 require / node / default / import 优先 */
function resolveCondition(dot: any): any {
    if (dot && typeof dot === 'object' && !Array.isArray(dot)) {
        return dot.require !== undefined ? dot.require
            : dot.node !== undefined ? dot.node
            : dot['default'] !== undefined ? dot['default']
            : dot.import;
    }
    return dot;
}
/**
 * 把 exports 字段里 key='./sub' 的映射解析成目标相对路径。
 * 支持：精确键、通配键 './sub/*'、以及 exports 为字符串/条件对象/嵌套数组。
 * 返回文件相对路径（string）或 null。
 */
function mapExportsSubpath(exportsField: any, subKey: string): string | null {
    if (exportsField === null || typeof exportsField !== 'object' || Array.isArray(exportsField)) {
        return null;
    }
    // 精确匹配
    if (Object.prototype.hasOwnProperty.call(exportsField, subKey)) {
        const v = resolveCondition(exportsField[subKey]);
        if (typeof v === 'string') return v;
        if (Array.isArray(v)) {
            for (const item of v) {
                const c = resolveCondition(item);
                if (typeof c === 'string') return c;
            }
        }
    }
    // 通配匹配：key 含 '*'
    for (const key of Object.keys(exportsField)) {
        const star = key.indexOf('*');
        if (star < 0) continue;
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (subKey.length < prefix.length || subKey.indexOf(prefix) !== 0) continue;
        if (!subKey.endsWith(suffix)) continue;
        const wildcard = subKey.slice(prefix.length, subKey.length - suffix.length);
        const v = resolveCondition(exportsField[key]);
        const tpl = typeof v === 'string' ? v : (Array.isArray(v) ? v.map(resolveCondition).find((x) => typeof x === 'string') : null);
        if (typeof tpl === 'string') {
            return tpl.split('*').join(wildcard);
        }
    }
    return null;
}

/**
 * 主解析入口：裸名 -> 归档内目标。
 * - 白名单 -> { kind: 'whitelist' }（request 保持原样）
 * - 内建 -> node.operit 子路径（planned/unsupported 抛 ResolveError）
 * - npm 包 -> 入口
 * - 解析不出 -> 抛 ResolveError
 */
export async function resolveBareName(
    projectDir: string,
    contract: NodeOperitContract,
    name: string,
    roots?: string[]
): Promise<ResolvedBare> {
    const raw = String(name || '').trim();
    if (!raw) throw new ResolveError('空裸名');

    const isNodePrefix = raw.startsWith('node:');
    const base = normalizeBuiltinName(raw);

    // 白名单（lodash/uuid/axios，含 node: 形式也认）
    if (WHITELIST.indexOf(base) >= 0) {
        return { archivePath: '', kind: 'whitelist', name: raw };
    }

    // Node 内建
    const entry = getBuiltin(contract, raw);
    if (entry) {
        if (entry.status === 'planned' || entry.status === 'unsupported') {
            throw new ResolveError(
                '裸名 "' + base + '" 在 node.operit 契约里为 ' + entry.status +
                '，构建必须失败。' + (entry.note ? '\n  note: ' + entry.note : '')
            );
        }
        const archivePath = normalizePath(subpathToInstallRelPath(contract, entry.subpath));
        return { archivePath: archivePath, kind: 'builtin', name: raw };
    }

    // 带 node: 前缀但不是已知内建 -> 报错（避免静默）
    if (isNodePrefix) {
        throw new ResolveError('未知的 node: 内建 "' + raw + '"');
    }

    // npm 包
    const npmEntry = await resolveNpmEntry(projectDir, raw, roots);
    if (npmEntry) {
        return { archivePath: npmEntry, kind: 'npm', name: raw };
    }

    throw new ResolveError(
        '无法解析裸名 "' + raw + '"：既不是 node.operit 内建，也不在 node_modules 中'
    );
}

/** 从归档内路径推子路径（与 dirname 共用 normalizePath 语义） */
export function archiveDirOf(archivePath: string): string {
    return dirname(archivePath);
}