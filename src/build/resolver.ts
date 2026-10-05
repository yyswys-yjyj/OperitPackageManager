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
        const r = await Tools.Files.read(join(projectDir, relPath));
        return JSON.parse(r.content);
    } catch (err) {
        return null;
    }
}

/**
 * 解析 npm 包的入口文件（打包期）。
 * 顺序：exports['.'] / exports['./'] -> exports 字符串 -> main -> index.js
 * 返回相对项目根的归档内路径；找不到返回 null。
 */
export async function resolveNpmEntry(
    projectDir: string,
    pkgName: string
): Promise<string | null> {
    // scoped 包名 @scope/name 的结构与普通包一致，路径即 pkgName
    const pkgRoot = normalizePath(join('node_modules', pkgName));
    const pkgJsonRel = join(pkgRoot, 'package.json');
    const pkgJson = await readJson(projectDir, pkgJsonRel);

    const tryFile = async (rel: string): Promise<string | null> => {
        const p = normalizePath(rel);
        // 已带扩展名：只试原样（避免目录误命中，先试 .js 变体）
        if (/\.[a-z0-9]+$/i.test(p)) {
            if (await exists(join(projectDir, p))) return p;
            return null;
        }
        // 无扩展名：按 .js / /index.js / 原样 顺序
        if (await exists(join(projectDir, p + '.js'))) return p + '.js';
        if (await exists(join(projectDir, p + '/index.js'))) return p + '/index.js';
        if (await exists(join(projectDir, p))) return p;
        return null;
    };

    if (pkgJson) {
        // exports 字段
        const ex = pkgJson.exports;
        if (ex) {
            let dot: any = null;
            if (typeof ex === 'string') dot = ex;
            else if (typeof ex === 'object') {
                dot = ex['.'] !== undefined ? ex['.'] : ex['./'];
            }
            if (typeof dot === 'string') {
                const f = await tryFile(join(pkgRoot, dot));
                if (f) return f;
            } else if (dot && typeof dot === 'object') {
                // 条件导出：优先 require / default / node
                const cond = dot.require || dot.node || dot['default'] || dot.import;
                if (typeof cond === 'string') {
                    const f = await tryFile(join(pkgRoot, cond));
                    if (f) return f;
                }
            }
        }
        // main 字段
        if (typeof pkgJson.main === 'string' && pkgJson.main) {
            const f = await tryFile(join(pkgRoot, pkgJson.main));
            if (f) return f;
        }
    }
    // 兜底：index.js
    const idx = await tryFile(join(pkgRoot, 'index.js'));
    if (idx) return idx;
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
    name: string
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
    const npmEntry = await resolveNpmEntry(projectDir, raw);
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