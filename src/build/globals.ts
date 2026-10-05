/**
 * 全局注入：operit 运行时不提供 Node 的 process / Buffer 全局，
 * 而大量 npm 包会在顶层直接用（如 support-color 里 `const {env}=process`）。
 *
 * 契约依据（BUILTINS.json.packing rule 9）：
 *   "把 process 与 Buffer 注入为全局（不能只入口 require）"
 *
 * 做法：生成一段 prelude 代码，拼到「入口脚本」最前面，
 * 从 node.operit 里 require process / buffer 并挂到 globalThis。
 */

export interface GlobalsOptions {
    /** node.operit 的 dist 目录在归档内的路径，如 node_modules/@serveryyswys/node.operit/dist */
    nodeOperitDistArchive: string;
    /** 入口文件在归档内的路径，用于算相对路径 */
    entryArchivePath: string;
}

/** 判断一个子路径是否存在于 node.operit 的 dist 里（由调用方预判，这里只做拼装） */
export interface GlobalShim {
    /** 全局变量名 */
    name: string;
    /** node.operit 内的子路径（不含 dist 前缀） */
    subpath: string;
}

/** 需要注入的全局变量清单（按 BUILTINS.json，process / buffer 是 ready 内建） */
export const GLOBAL_SHIMS: GlobalShim[] = [
    { name: 'process', subpath: 'process' },
    { name: 'Buffer', subpath: 'buffer' }
];

/**
 * 生成 prelude 代码片段。
 * 生成的代码用「相对入口」的 require 路径，并要求这些模块被可达性收集。
 * 返回 { prelude, injectedPaths } —— injectedPaths 是需要在归档里存在的路径（供调用方入队收集）。
 */
export function buildGlobalsPrelude(opts: GlobalsOptions): {
    prelude: string;
    injectedPaths: string[];
} {
    const injectedPaths: string[] = [];
    const lines: string[] = [];

    lines.push('/* ==== OPM 全局注入（process / Buffer）==== */');
    lines.push('(function () {');
    lines.push('  var __g = (typeof globalThis !== "undefined") ? globalThis');
    lines.push('        : (typeof global !== "undefined") ? global');
    lines.push('        : this;');

    for (const shim of GLOBAL_SHIMS) {
        const target = opts.nodeOperitDistArchive + '/' + shim.subpath + '.js';
        injectedPaths.push(target);
        // 相对入口的 require 串
        const rel = relativeFrom(opts.entryArchivePath, target);
        // process 是模块对象；buffer 模块导出 { Buffer, ... }，需要取 .Buffer
        if (shim.name === 'Buffer') {
            lines.push('  try {');
            lines.push('    var __bufMod = require("' + rel + '");');
            lines.push('    __g.Buffer = __bufMod && (__bufMod.Buffer || __bufMod) || __g.Buffer;');
            lines.push('  } catch (e) {}');
        } else {
            lines.push('  try {');
            lines.push('    var __p = require("' + rel + '");');
            lines.push('    __g.process = __p;');
            // 补几个常用兜底，防止模块本体不全
            lines.push('    if (__g.process && !__g.process.env) __g.process.env = {};');
            lines.push('    if (__g.process && typeof __g.process.cwd !== "function") __g.process.cwd = function () { return "/"; };');
            lines.push('    if (__g.process && typeof __g.process.nextTick !== "function") __g.process.nextTick = function (fn) { Promise.resolve().then(fn); };');
            lines.push('  } catch (e) {}');
        }
    }

    lines.push('})();');

    return { prelude: lines.join('\n') + '\n', injectedPaths };
}

/** 从 fromFile 到 toPath 的相对请求串（本地实现，避免循环依赖 rewriter） */
function relativeFrom(fromFileArchivePath: string, toArchivePath: string): string {
    const fromDir = dirOf(fromFileArchivePath);
    const fromParts = fromDir ? fromDir.split('/') : [];
    const toParts = normPath(toArchivePath).split('/');
    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
        common += 1;
    }
    const segs: string[] = [];
    for (let k = 0; k < fromParts.length - common; k += 1) segs.push('..');
    for (const d of toParts.slice(common)) segs.push(d);
    let rel = segs.join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

function normPath(p: string): string {
    const parts = String(p).replace(/\\/g, '/').split('/');
    const stack: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') { if (stack.length > 0) stack.pop(); continue; }
        stack.push(part);
    }
    return stack.join('/');
}

function dirOf(p: string): string {
    const n = normPath(p);
    const i = n.lastIndexOf('/');
    return i < 0 ? '' : n.slice(0, i);
}
