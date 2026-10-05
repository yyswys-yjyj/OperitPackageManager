/**
 * 可达性分析 + 重写：从入口出发，顺着 require 链走，
 * 只收集「被引用到的」文件（本包内文件 + 内建 + npm 包入口）。
 *
 * 契约依据（BUILTINS.json.packing）：
 *   - 只处理从入口可达的文件（跳过 tests/ 等未被引用的）
 *   - 所有裸名都要重写；npm 包入口在打包期解析
 *   - lodash/uuid/axios 保持原样
 *   - 重写始终带显式 .js
 *
 * 双根模型（关键）：
 *   - localRoot：编译产物根（本包内文件从这里读）
 *   - depsRoot ：项目根（node_modules / node.operit 从这里读）
 *   归档内路径统一：'node_modules/...' 前缀的从 depsRoot 读，其余从 localRoot 读。
 *
 * 产出：
 *   files: Map<archivePath, { text, kind }>   —— 所有要打进归档的文件（text 已是重写后的）
 *   missing: 解析失败的裸名记录
 *   violations: 契约拦截（planned/unsupported）
 */

import { NodeOperitContract } from './contract';
import {
    rewriteSource,
    scanRequires,
    normalizePath,
    dirname
} from './rewriter';
import {
    resolveBareName,
    ResolveError,
    WHITELIST
} from './resolver';

export interface ArchiveFile {
    /** 重写后的文本内容 */
    text: string;
    kind: 'entry' | 'local' | 'builtin' | 'npm';
}

export interface ReachabilityResult {
    /** 归档内路径 -> 文件内容 */
    files: Map<string, ArchiveFile>;
    /** 出现的所有裸名（去重，供 verify 报告） */
    bareNames: string[];
    /** 无法解析的 require */
    missing: Array<{ from: string; name: string; reason: string }>;
    /** 契约拦截（planned/unsupported） */
    violations: Array<{ from: string; name: string; reason: string }>;
}

export interface ReachabilityOptions {
    /** 编译产物根目录（本包内文件从这里读） */
    localRoot: string;
    /** 项目根目录（node_modules 从这里读）；不传则等于 localRoot */
    depsRoot?: string;
    contract: NodeOperitContract;
    /** 入口文件相对 localRoot 的路径，如 main.js */
    entryRel: string;
    /** 额外根（归档内路径），会被读取+重写+递归；用于注入 prelude 的 require 目标 */
    extraEntries?: string[];
}

const DEPS_PREFIX = 'node_modules/';

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

/** 归档路径 -> 真实磁盘路径（按前缀路由到 localRoot / depsRoot） */
function diskPathOf(archivePath: string, localRoot: string, depsRoot: string): string {
    const p = normalizePath(archivePath);
    if (p.indexOf(DEPS_PREFIX) === 0) return join(depsRoot, p);
    return join(localRoot, p);
}

async function readText(absPath: string): Promise<string | null> {
    try {
        const r = await Tools.Files.read(absPath);
        return r && typeof r.content === 'string' ? r.content : null;
    } catch (err) {
        return null;
    }
}

async function fileExists(absPath: string): Promise<boolean> {
    try {
        const e = await Tools.Files.exists(absPath);
        return !!(e && e.exists);
    } catch (err) {
        return false;
    }
}

/**
 * 解析一个「相对/绝对路径」require（本包内文件）到归档内路径。
 * 相对基准 = 当前文件所在目录。返回 null 表示解析不到。
 */
async function resolveLocalRequest(
    localRoot: string,
    depsRoot: string,
    fromArchivePath: string,
    request: string
): Promise<string | null> {
    const baseDir = dirname(fromArchivePath);
    const target = normalizePath(join(baseDir, request));

    // 候选顺序：显式扩展名优先，再补 .js / /index.js / .json
    const candidates: string[] = [];
    if (/\.[a-z0-9]+$/i.test(target)) {
        // 已带扩展名：只试原样（但可能被当目录，故 .js 显式命中时优先）
        candidates.push(target);
    } else {
        candidates.push(target + '.js');
        candidates.push(target + '/index.js');
        candidates.push(target + '.json');
        candidates.push(target); // 兜底：无扩展名的真实文件
    }
    for (const c of candidates) {
        const c2 = normalizePath(c);
        if (await fileExists(diskPathOf(c2, localRoot, depsRoot))) return c2;
    }
    return null;
}

/**
 * 从入口出发做可达性遍历，产出所有需要归档的文件（已重写）。
 */
export async function collectReachable(opts: ReachabilityOptions): Promise<ReachabilityResult> {
    const localRoot = opts.localRoot;
    const depsRoot = opts.depsRoot || opts.localRoot;
    const contract = opts.contract;
    const entry = normalizePath(opts.entryRel);

    const files = new Map<string, ArchiveFile>();
    const bareSet = new Set<string>();
    const missing: Array<{ from: string; name: string; reason: string }> = [];
    const violations: Array<{ from: string; name: string; reason: string }> = [];

    const queue: string[] = [entry];
    const enqueued = new Set<string>([entry]);
    // 额外根（prelude 注入的依赖）：也要读取、重写、递归
    for (const extra of (opts.extraEntries || [])) {
        const e = normalizePath(extra);
        if (e && !enqueued.has(e)) {
            enqueued.add(e);
            queue.push(e);
        }
    }
    // 裸名解析缓存
    const bareCache = new Map<string, { archivePath: string; kind: 'builtin' | 'npm' | 'whitelist' } | null>();

    while (queue.length > 0) {
        const cur = queue.shift() as string;

        const src = await readText(diskPathOf(cur, localRoot, depsRoot));
        if (src === null) {
            missing.push({ from: '', name: cur, reason: '文件不存在或读取失败' });
            continue;
        }

        const occ = scanRequires(src);
        const localMap: Record<string, string> = {}; // bareName -> archivePath (''=whitelist)
        const needFollow: string[] = [];

        for (const o of occ) {
            const req = o.value.trim();
            if (!req) continue;

            // 相对/绝对路径：本包内文件
            if (req.startsWith('.') || req.startsWith('/')) {
                const localTarget = await resolveLocalRequest(localRoot, depsRoot, cur, req);
                if (localTarget) {
                    if (!enqueued.has(localTarget)) {
                        enqueued.add(localTarget);
                        needFollow.push(localTarget);
                    }
                } else {
                    missing.push({ from: cur, name: req, reason: '相对路径解析失败' });
                }
                continue;
            }

            // 白名单
            const wk = req.startsWith('node:') ? req.slice(5) : req;
            if (WHITELIST.indexOf(wk) >= 0) {
                localMap[req] = '';
                bareSet.add(req);
                continue;
            }

            bareSet.add(req);
            // 解析裸名（从 depsRoot 读 node_modules / node.operit）
            let resolved = bareCache.get(req);
            if (resolved === undefined) {
                try {
                    const r = await resolveBareName(depsRoot, contract, req);
                    resolved = { archivePath: r.archivePath, kind: r.kind };
                } catch (e) {
                    const reason = e instanceof ResolveError ? e.message : String(e);
                    violations.push({ from: cur, name: req, reason: reason });
                    resolved = null;
                }
                bareCache.set(req, resolved);
            }
            if (resolved && resolved.kind !== 'whitelist') {
                localMap[req] = resolved.archivePath;
                if (resolved.archivePath && !enqueued.has(resolved.archivePath)) {
                    enqueued.add(resolved.archivePath);
                    needFollow.push(resolved.archivePath);
                }
            }
        }

        // 用映射重写当前文件
        const resolveBare = (bareName: string) => {
            const t = localMap[bareName];
            if (t === undefined) return null;
            if (t === '') {
                return { request: bareName, archivePath: '', kind: 'whitelist' as const };
            }
            return { request: '', archivePath: t, kind: 'local' as const };
        };

        const rewritten = rewriteSource(src, {
            filePath: cur,
            archivePath: cur,
            resolveBare: resolveBare
        });

        files.set(cur, { text: rewritten.code, kind: kindOf(cur, entry) });

        for (const f of needFollow) queue.push(f);
    }

    return {
        files,
        bareNames: Array.from(bareSet),
        missing,
        violations
    };
}

function kindOf(path: string, entry: string): ArchiveFile['kind'] {
    if (path === entry) return 'entry';
    if (path.indexOf(DEPS_PREFIX + '@serveryyswys/node.operit/') === 0) return 'builtin';
    if (path.indexOf(DEPS_PREFIX) === 0) return 'npm';
    return 'local';
}