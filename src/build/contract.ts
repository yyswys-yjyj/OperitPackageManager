/**
 * 契约层：读取 node.operit 的 BUILTINS.json，作为构建期的唯一事实来源。
 *
 * 职责：
 *   1. 定位已安装的 node.operit（node_modules/@serveryyswys/node.operit）
 *   2. 解析 BUILTINS.json：builtins 表 + packing 规则 + 安装目录
 *   3. 按 statusSemantics 拦截 planned / unsupported 的裸名（构建必须失败）
 *
 * 依据：node.operit/BUILTINS.json（schema 1）与
 *       Operit 源码 JsExecutionScriptBuilder.kt 的 require 语义。
 */

const NODE_OPERIT_PKG = '@serveryyswys/node.operit';
const NODE_OPERIT_DIR = 'node_modules/@serveryyswys/node.operit';

/** 单个 builtin 条目 */
export interface BuiltinEntry {
    subpath: string;
    status: 'ready' | 'partial' | 'planned' | 'unsupported';
    note?: string;
}

/** packing 段 */
export interface PackingRules {
    summary: string;
    rules: string[];
    verifiedBy?: string;
    processGlobalEvidence?: Record<string, string>;
}

export interface NodeOperitContract {
    schema: number;
    package: string;
    entry: string;              // dist/index.js
    unsupportedEntry: string;   // dist/unsupported.js
    distDir: string;            // dist
    subpathTemplate: string;    // <distDir>/<subpath>.js
    subpathStrategy: string;    // direct
    requireExplicitExtension: boolean;
    installDir: string;         // node_modules/@serveryyswys/node.operit
    builtins: Record<string, BuiltinEntry>;
    packing: PackingRules;
    /** 原始 JSON，保留未识别字段 */
    raw: any;
}

const CONTRACT_CACHE: Record<string, NodeOperitContract> = {};

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

/**
 * 定位项目里已安装的 node.operit 目录。
 * 优先 <projectDir>/node_modules/@serveryyswys/node.operit；
 * 若项目内没有，则依次在 extraRoots 的 node_modules 下找（用于全局影子目录回退）。
 * 返回真实磁盘目录（项目内或影子内）。
 */
export async function locateNodeOperit(projectDir: string, extraRoots?: string[]): Promise<string | null> {
    const roots: string[] = [projectDir];
    if (extraRoots && extraRoots.length) {
        for (const r of extraRoots) if (r && roots.indexOf(r) < 0) roots.push(r);
    }
    for (const root of roots) {
        const c = join(root, NODE_OPERIT_DIR);
        try {
            const ex = await Tools.Files.exists(join(c, 'BUILTINS.json'));
            if (ex && ex.exists) return c;
        } catch (e) { /* ignore */ }
    }
    return null;
}

/**
 * 读取并解析契约。projectDir 未安装 node.operit 时抛错。
 * extraRoots：额外的查找根（全局影子目录），项目内找不到时回退用。
 * 结果按安装目录缓存。
 */
export async function loadContract(projectDir: string, extraRoots?: string[]): Promise<NodeOperitContract> {
    const dir = await locateNodeOperit(projectDir, extraRoots);
    if (!dir) {
        throw new Error(
            '未找到 node.operit。请先在项目里执行 init / install，' +
            '或运行 opm install ' + NODE_OPERIT_PKG
        );
    }
    if (CONTRACT_CACHE[dir]) return CONTRACT_CACHE[dir];

    const p = join(dir, 'BUILTINS.json');
    let raw: any;
    try {
        const r = await Tools.Files.read(p);
        raw = JSON.parse(r.content);
    } catch (e) {
        throw new Error('读取 BUILTINS.json 失败：' + String(e));
    }
    if (!raw || typeof raw !== 'object' || !raw.builtins) {
        throw new Error('BUILTINS.json 格式异常：缺少 builtins');
    }

    const contract: NodeOperitContract = {
        schema: raw.schema || 1,
        package: raw.package || NODE_OPERIT_PKG,
        entry: raw.entry || 'dist/index.js',
        unsupportedEntry: raw.unsupportedEntry || 'dist/unsupported.js',
        distDir: raw.distDir || 'dist',
        subpathTemplate: raw.subpathTemplate || '<distDir>/<subpath>.js',
        subpathStrategy: raw.subpathStrategy || 'direct',
        requireExplicitExtension: raw.requireExplicitExtension !== false,
        installDir: raw.installDir || NODE_OPERIT_DIR,
        builtins: raw.builtins,
        packing: raw.packing || { summary: '', rules: [] },
        raw: raw
    };
    CONTRACT_CACHE[dir] = contract;
    return contract;
}

/** 该裸名是否是本契约认得的 Node 内建（含 node: 前缀） */
export function isBuiltinName(contract: NodeOperitContract, name: string): boolean {
    const n = normalizeBuiltinName(name);
    return !!contract.builtins[n];
}

/** 去掉 node: 前缀 */
export function normalizeBuiltinName(name: string): string {
    const s = String(name || '').trim();
    return s.startsWith('node:') ? s.slice(5) : s;
}

/** 取某内建的条目；不存在返回 null */
export function getBuiltin(contract: NodeOperitContract, name: string): BuiltinEntry | null {
    return contract.builtins[normalizeBuiltinName(name)] || null;
}

/** 把 subpath 展开成安装目录下的相对路径（相对消费方项目根） */
export function subpathToInstallRelPath(contract: NodeOperitContract, subpath: string): string {
    // 让 dist/<subpath>.js 保持一致：<distDir>/<subpath>.js
    const rel = contract.subpathTemplate
        .replace('<distDir>', contract.distDir)
        .replace('<subpath>', subpath);
    return join(contract.installDir, rel);
}

export interface ContractViolation {
    name: string;
    status: 'planned' | 'unsupported';
    note?: string;
}

/**
 * 构建期硬拦截：给定一批裸名，返回其中 status 为 planned/unsupported 的。
 * 调用方应让构建失败。
 */
export function findBlockingBareNames(
    contract: NodeOperitContract,
    names: string[]
): ContractViolation[] {
    const out: ContractViolation[] = [];
    for (const n of names) {
        const e = getBuiltin(contract, n);
        if (!e) continue; // 非契约表里的名字（npm 包等），由重写器另行处理
        if (e.status === 'planned' || e.status === 'unsupported') {
            out.push({ name: normalizeBuiltinName(n), status: e.status, note: e.note });
        }
    }
    return out;
}

/** 该内建是否已实现（ready 或 partial） */
export function isImplemented(contract: NodeOperitContract, name: string): boolean {
    const e = getBuiltin(contract, name);
    if (!e) return false;
    return e.status === 'ready' || e.status === 'partial';
}

/** 清缓存（换项目时用） */
export function clearContractCache(): void {
    for (const k of Object.keys(CONTRACT_CACHE)) delete CONTRACT_CACHE[k];
}