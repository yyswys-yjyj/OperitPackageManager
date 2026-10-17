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
import { scanRequiresAst } from './astscan';
import { expandExtraEntry } from './extrafiles';
import { readTextSafeAsync } from '../core/nodesafe';
import {
    resolveBareName,
    ResolveError,
    WHITELIST
} from './resolver';

export interface ArchiveFile {
    /** 重写后的文本内容（二进制资源时为空串） */
    text: string;
    /** 二进制内容（base64，仅 kind='extra' 的资源文件用；有值时 text 忽略） */
    binary?: string;
    kind: 'entry' | 'local' | 'builtin' | 'npm' | 'extra';
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
    /** 动态 require 记录：from=文件, prefix=可定前缀(空=完全动态), line=行号 */
    dynamicRequires: Array<{ from: string; prefix: string; line: number }>;
}

export interface ReachabilityOptions {
    /** 编译产物根目录（本包内文件从这里读） */
    localRoot: string;
    /** 项目根目录（node_modules 从这里读）；不传则等于 localRoot */
    depsRoot?: string;
    contract: NodeOperitContract;
    artifactDirRel?: string | null;
    /** 入口文件相对 localRoot 的路径，如 main.js */
    entryRel: string;
    /** 额外根（归档内路径），会被读取+重写+递归；用于注入 prelude 的 require 目标、
     *  以及 manifest 声明的子包入口 / UI 模块等非 require 链文件 */
    extraEntries?: string[];
    /** 排除前缀：归档内路径以此开头的一律不进包（如 node_modules/、.opm_build/、.opm_stage/） */
    excludePrefixes?: string[];
    depsRoots?: string[];
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

/** 本包内文件：归档路径 -> 磁盘文件（原样 -> 产物目录 -> 逐级剥前导段） */
async function resolveLocalDisk(
    archivePath: string,
    localRoot: string,
    artifactDirRel?: string | null
): Promise<string> {
    const p = normalizePath(archivePath);
    // ① 原样
    if (await fileExists(join(localRoot, p))) return join(localRoot, p);
    if (artifactDirRel) {
        const ad = join(localRoot, normalizePath(artifactDirRel));
        // ② 完整路径丢进产物目录
        if (await fileExists(join(ad, p))) return join(ad, p);
        // ③ 逐级剥前导段，再丢进产物目录
        let parts = p.split('/');
        while (parts.length > 1) {
            parts = parts.slice(1);
            const cand = join(ad, parts.join('/'));
            if (await fileExists(cand)) return cand;
        }
        // ④ 反向剥：若归档路径以 artifactDirRel 开头（如 dist/libs/en.js），
        //    其物理实体可能是源码目录下的裸文件（src/libs/en.js）——tsc 不搬运非 .ts
        const adN = normalizePath(artifactDirRel);
        let rev = p;
        if (rev === adN) rev = '';
        else if (rev.indexOf(adN + '/') === 0) rev = rev.slice(adN.length + 1);
        if (rev) {
            // ④a 直接相对 localRoot
            if (await fileExists(join(localRoot, rev))) return join(localRoot, rev);
            // ④b 常见 TS 源码根 src/
            if (await fileExists(join(localRoot, 'src/' + rev))) return join(localRoot, 'src/' + rev);
        }
    }
    return join(localRoot, p); // 回退
}

/**
 * 多 root 版：node_modules/ 前缀依次在 depsRoots 里找存在的那份；
 * 都不存在则回退到第一个（让后续报缺失）。
 */
async function diskPathOfMulti(
    archivePath: string,
    localRoot: string,
    depsRoots: string[],
    artifactDirRel?: string | null
): Promise<string> {
    const p = normalizePath(archivePath);
    if (p.indexOf(DEPS_PREFIX) !== 0) {
        return resolveLocalDisk(p, localRoot, artifactDirRel);
    }
    const roots = (depsRoots && depsRoots.length) ? depsRoots : [localRoot];
    for (const r of roots) {
        const cand = join(r, p);
        if (await fileExists(cand)) return cand;
    }
    return join(roots[0], p);
}

/**
 * 为当前文件生成 node_modules 查找根列表（模拟 Node 逐级上溯）。
 * 从当前文件所在目录开始，逐级向上到项目根，每一层的 node_modules 都是一个查找根。
 * 这样能命中嵌套依赖 node_modules/<pkg>/node_modules/<dep>。
 * 结果按 disk 绝对路径给，且去重、保持「越近越优先」。
 */
function nodeModuleLookupRoots(
    fileArchivePath: string,
    localRoot: string,
    depsRoots: string[]
): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (v: string) => { if (v && !seen.has(v)) { seen.add(v); out.push(v); } };

    const roots = (depsRoots && depsRoots.length) ? depsRoots : [localRoot];
    // 归档路径中每层目录对应的磁盘目录：从 fileDir 逐级上溯到空
    const dir = dirname(normalizePath(fileArchivePath));
    const segs = dir ? dir.split('/') : [];
    const chain: string[] = [];
    for (let k = segs.length; k >= 0; k -= 1) {
        chain.push(segs.slice(0, k).join('/'));
    }
    // 对每个基础根，按目录链生成 <root>/<subdir> 作为候选查找根
    for (const base of roots) {
        for (const sub of chain) {
            push(sub ? join(base, sub) : base);
        }
    }
    return out;
}

/** 判断某 node_modules/<name> 归档路径在某 root 下是否存在 */
async function npmExistsInRoot(root: string, archivePath: string): Promise<boolean> {
    return fileExists(join(root, normalizePath(archivePath)));
}

async function readText(absPath: string): Promise<string | null> {
    // 走 node.operit 的 fs（javabridge，原始内容，不带行号）；fs 不可用时内部回退 Tools.Files.read 并剥行号
    return readTextSafeAsync(absPath);
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
    request: string,
    excludePrefixes: string[],
    depsRoots?: string[],
    artifactDirRel?: string | null
): Promise<string | null> {
    const baseDir = dirname(fromArchivePath);
    const target = normalizePath(join(baseDir, request));
    const roots = (depsRoots && depsRoots.length) ? depsRoots : [depsRoot];
    const lookupRoots = nodeModuleLookupRoots(fromArchivePath, localRoot, depsRoots || [depsRoot]);

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
        if (isExcluded(c2, excludePrefixes)) continue;
        // 本包内文件走 localRoot；node_modules 前缀走多 root 阶梯
        if (c2.indexOf(DEPS_PREFIX) === 0) {
            for (const r of roots) {
                if (await fileExists(join(r, c2))) return c2;
            }
            // 嵌套依赖上溯：node_modules/<pkg>/... 的父层 node_modules 也纳入
            for (const r of lookupRoots) {
                if (await fileExists(join(r, c2))) return c2;
            }
        } else {
            if (await fileExists(await resolveLocalDisk(c2, localRoot, artifactDirRel))) return c2;
        }
    }
    return null;
}

/** 归档内路径是否命中排除前缀 */
function isExcluded(archivePath: string, excludePrefixes: string[]): boolean {
    if (!excludePrefixes || excludePrefixes.length === 0) return false;
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
 * 从入口出发做可达性遍历，产出所有需要归档的文件（已重写）。
 */
export async function collectReachable(opts: ReachabilityOptions): Promise<ReachabilityResult> {
    const localRoot = opts.localRoot;
    const depsRoot = opts.depsRoot || opts.localRoot;
    // 多查找根：显式 depsRoots 优先，否则单档 [depsRoot]
    const depsRoots: string[] = (opts.depsRoots && opts.depsRoots.length)
        ? opts.depsRoots.slice()
        : [depsRoot];
    // 确保 depsRoot 本身也在阶梯里（放在首位去重）
    if (depsRoots.indexOf(depsRoot) < 0) depsRoots.unshift(depsRoot);
    const contract = opts.contract;
    const entry = normalizePath(opts.entryRel);
    const excludePrefixes = opts.excludePrefixes || [];

    const files = new Map<string, ArchiveFile>();
    const bareSet = new Set<string>();
    const missing: Array<{ from: string; name: string; reason: string }> = [];
    const violations: Array<{ from: string; name: string; reason: string }> = [];
    const dynamicRequires: Array<{ from: string; prefix: string; line: number }> = [];

    const queue: string[] = [entry];
    const enqueued = new Set<string>([entry]);
    // 额外根（prelude 依赖 / manifest 子包入口 / UI 模块）：也要读取、重写、递归
    for (const extra of (opts.extraEntries || [])) {
        const e = normalizePath(extra);
        if (e && !enqueued.has(e) && !isExcluded(e, excludePrefixes)) {
            enqueued.add(e);
            queue.push(e);
        }
    }
    // 裸名解析缓存
    const bareCache = new Map<string, { archivePath: string; kind: 'builtin' | 'npm' | 'whitelist' } | null>();

    while (queue.length > 0) {
        const cur = queue.shift() as string;

        const src = await readText(await diskPathOfMulti(cur, localRoot, depsRoots, opts.artifactDirRel));
        if (src === null) {
            missing.push({ from: '', name: cur, reason: '文件不存在或读取失败' });
            continue;
        }

        const occ = scanRequires(src);
        const localMap: Record<string, string> = {}; // bareName -> archivePath (''=whitelist)
        const needFollow: string[] = [];

        // AST 扫描：检出动态 require（词法版无法识别），把前缀目录整目录收进归档
        const astRes = scanRequiresAst(src);
        if (astRes.ok) {
            for (const call of astRes.calls) {
                if (call.kind !== 'dynamic') continue;
                dynamicRequires.push({ from: cur, prefix: call.prefix || '', line: call.line });
                if (!call.prefix) continue; // 完全动态：只记录，由上层决定处置
                const baseDir = dirname(cur);
                const dirRel = normalizePath(baseDir ? (baseDir + '/' + call.prefix) : call.prefix);
                if (!dirRel || isExcluded(dirRel, excludePrefixes)) continue;
                // 候选目录：① 归档内路径（如 dist/libs）；
                //           ② 剥离产物目录前缀后的路径（如 libs）；
                //           ③ ②再加 src/（TS 源码目录常见布局，如 src/libs）
                const cands: string[] = [dirRel];
                if (opts.artifactDirRel) {
                    const ad = normalizePath(opts.artifactDirRel);
                    let stripped = dirRel;
                    if (stripped === ad) stripped = '';
                    else if (stripped.indexOf(ad + '/') === 0) stripped = stripped.slice(ad.length + 1);
                    const st = normalizePath(stripped);
                    if (st && cands.indexOf(st) < 0) cands.push(st);
                    if (st && cands.indexOf('src/' + st) < 0) cands.push('src/' + st);
                    if (cands.indexOf('src') < 0) cands.push('src');
                }
                // 找到真实命中的候选目录，并把命中的文件「重映射」回原始 dirRel：
                //   hitCd='src/libs', f='src/libs/en.js', dirRel='dist/libs'
                //   => archive='dist/libs/en.js'（运行时代码就是按 dirRel 拼路径的）
                let hitCd = '';
                let hitDisk = '';
                let collected: string[] = []; // 归档内相对路径（已按 dirRel 重映射前，用 cd 前缀）
                for (const cd of cands) {
                    if (!cd || isExcluded(cd, excludePrefixes)) continue;
                    // 候选目录必须是「磁盘上真实存在的目录」：
                    //   注意用 resolveLocalDisk 才能命中 src/libs 这类反向剥的实体，
                    //   直接 join(localRoot, cd) 会找不到（tsc 不搬运裸 .js）。
                    const cdDisk = await resolveLocalDisk(cd, localRoot, opts.artifactDirRel);
                    let isDir = false;
                    try {
                        const lst: any = await Tools.Files.list(cdDisk);
                        const ents = lst && (lst.files || lst.entries || lst.children);
                        if (Array.isArray(ents)) isDir = true;
                    } catch (e) { isDir = false; }
                    if (!isDir) continue;
                    // 在真实磁盘目录上递归收集文件（相对 cd 的路径），不用 expandExtraEntry，
                    // 因为后者按 join(localRoot, cd) 走，命中不了反向剥的实体。
                    const rels: string[] = [];
                    const walk = async (diskRel: string, relPath: string, depth: number): Promise<void> => {
                        if (depth <= 0) return;
                        let listing: any;
                        try { listing = await Tools.Files.list(join(cdDisk, diskRel)); } catch (e) { return; }
                        const ents = (listing && (listing.files || listing.entries || listing.children)) || [];
                        for (const it of ents) {
                            const name = it.name || it.fileName || '';
                            if (!name) continue;
                            const childDiskRel = normalizePath(diskRel ? diskRel + '/' + name : name);
                            const childRel = normalizePath(relPath ? relPath + '/' + name : name);
                            const isChildDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
                            if (isChildDir) {
                                if (name === 'node_modules' || name.startsWith('.')) continue;
                                const cdChild = normalizePath(cd + '/' + childRel);
                                if (isExcluded(cdChild, excludePrefixes)) continue;
                                await walk(childDiskRel, childRel, depth - 1);
                            } else {
                                const cdChild = normalizePath(cd + '/' + childRel);
                                if (isExcluded(cdChild, excludePrefixes)) continue;
                                rels.push(childRel);
                            }
                        }
                    };
                    await walk('', '', 10);
                    if (rels.length > 0) { hitCd = cd; hitDisk = cdDisk; collected = rels; break; }
                }
                for (const f of collected) {
                    // f 是相对 cd 的路径；归档路径 = dirRel + 该相对路径
                    const arch = normalizePath(dirRel + '/' + f);
                    if (!arch || isExcluded(arch, excludePrefixes)) continue;
                    if (!enqueued.has(arch)) {
                        enqueued.add(arch);
                        needFollow.push(arch);
                    }
                }
            }
        }

        for (const o of occ) {
            const req = o.value.trim();
            if (!req) continue;

            // 相对/绝对路径：本包内文件
            if (req.startsWith('.') || req.startsWith('/')) {
                const localTarget = await resolveLocalRequest(localRoot, depsRoot, cur, req, excludePrefixes, depsRoots, opts.artifactDirRel);
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
            const bareRoots: string[] = (opts.depsRoots && opts.depsRoots.length)
                ? opts.depsRoots.slice()
                : [depsRoot];
            for (const lr of nodeModuleLookupRoots(cur, localRoot, bareRoots)) {
                if (bareRoots.indexOf(lr) < 0) bareRoots.push(lr);
            }
            const ck = dirname(cur) + '|' + req;
            let resolved = bareCache.get(ck);
            if (resolved === undefined) {
                try {
                    const r = await resolveBareName(depsRoot, contract, req, bareRoots);
                    resolved = { archivePath: r.archivePath, kind: r.kind };
                } catch (e) {
                    const reason = e instanceof ResolveError ? e.message : String(e);
                    violations.push({ from: cur, name: req, reason: reason });
                    resolved = null;
                }
                bareCache.set(ck, resolved);
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
        violations,
        dynamicRequires
    };
}

function kindOf(path: string, entry: string): ArchiveFile['kind'] {
    if (path === entry) return 'entry';
    if (path.indexOf(DEPS_PREFIX + '@serveryyswys/node.operit/') === 0) return 'builtin';
    if (path.indexOf(DEPS_PREFIX) === 0) return 'npm';
    return 'local';
}