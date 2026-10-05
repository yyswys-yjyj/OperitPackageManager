/**
 * 裸名重写器：把源码里的 require('xxx') 改成 operit 归档能解析的显式相对路径。
 *
 * 依据（Operit 源码 JsExecutionScriptBuilder.kt）：
 *   - 裸名（非 . 或 / 开头）→ 除 lodash/uuid/axios 外静默返回 {}（:1288）
 *   - 白名单：lodash→root._、uuid→v4 桩、axios→http_request 桩（:1264-1287）
 *   - 命中 /\.[a-z0-9]+$/i 只试单一候选，不补 .js（:232）→ 重写必须显式带 .js
 *   - 入口 require 基准 = dirname(screenPath)；嵌套基准 = 自身路径（:1319 / :1242）
 *
 * 本模块只做「文本 → 文本」，不碰文件系统；解析目标由调用方传入 resolver 回调。
 */

export interface RewriteTarget {
    /** 重写后的请求串（相对本文件的路径，如 './node_modules/@serveryyswys/node.operit/dist/fs.js'） */
    request: string;
    /** 目标在「归档内」的绝对逻辑路径（不带前导 /），用于可达性分析 */
    archivePath: string;
    kind: 'builtin' | 'npm' | 'local' | 'whitelist';
}

/** 调用方提供的解析器：把一个裸名解析成重写目标；无法解析返回 null */
export type BareNameResolver = (bareName: string) => RewriteTarget | null;

export interface RewriteOptions {
    /** 文件名（用于报错），非归档内的路径，仅标识 */
    filePath: string;
    /** 该文件在归档内的路径（不带前导 /），用于算相对路径 */
    archivePath: string;
    /** 解析裸名 */
    resolveBare: BareNameResolver;
    /** 是否对 .json require 生成包装模块（默认 false，因为当前源码支持 .json 直读） */
    wrapJson?: boolean;
}

export interface RewriteResult {
    code: string;
    /** 本次重写涉及的所有变更 */
    changes: Array<{ from: string; to: string; kind: string }>;
}

const WHITELIST = ['lodash', 'uuid', 'axios'];

// ============================================================================
// 精简 JS 词法扫描：找到所有 require(...) 的字符串参数位置
// 规则：跳过 // 行注释、/* */ 块注释、' " ` 三种字符串（含转义、模板串嵌套 ${}）
// ============================================================================

interface RequireOccurrence {
    /** 参数字符串在源码中的起止（不含引号内的引号本身） */
    argStart: number;
    argEnd: number;
    /** 参数字符串值 */
    value: string;
    /** 引号字符 */
    quote: string;
}

/**
 * 扫描源码里所有形如 require('xxx') / require("xxx") 的调用，
 * 跳过注释与所有字符串字面量内容（避免误报）。
 */
export function scanRequires(code: string): RequireOccurrence[] {
    const out: RequireOccurrence[] = [];
    const n = code.length;
    let i = 0;

    while (i < n) {
        const c = code[i];

        // 行注释
        if (c === '/' && code[i + 1] === '/') {
            i += 2;
            while (i < n && code[i] !== '\n') i += 1;
            continue;
        }
        // 块注释
        if (c === '/' && code[i + 1] === '*') {
            i += 2;
            while (i < n && !(code[i] === '*' && code[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }
        // 字符串
        if (c === '"' || c === '\'' || c === '`') {
            i = skipString(code, i, c);
            continue;
        }
        // 标识符 require
        if (isIdentStart(c)) {
            const start = i;
            while (i < n && isIdentPart(code[i])) i += 1;
            const word = code.slice(start, i);
            if (word === 'require') {
                // 允许空白后跟 (
                let j = i;
                while (j < n && /\s/.test(code[j])) j += 1;
                if (code[j] === '(') {
                    j += 1;
                    while (j < n && /\s/.test(code[j])) j += 1;
                    const q = code[j];
                    if (q === '"' || q === '\'' || q === '`') {
                        const literalStart = j;
                        const end = skipString(code, literalStart, q);
                        const raw = code.slice(literalStart, end); // 含引号
                        const value = unescapeLiteral(raw, q);
                        out.push({
                            argStart: literalStart,
                            argEnd: end,
                            value: value,
                            quote: q
                        });
                        i = end;
                        continue;
                    }
                }
            }
            continue;
        }
        i += 1;
    }
    return out;
}

function isIdentStart(c: string): boolean {
    return /[A-Za-z_$]/.test(c);
}
function isIdentPart(c: string): boolean {
    return /[A-Za-z0-9_$]/.test(c);
}

/** 从 start（引号处）跳到字符串结束后的位置；返回结束索引（不含闭引号）的下一位置 */
function skipString(code: string, start: number, quote: string): number {
    const n = code.length;
    let i = start + 1;
    while (i < n) {
        const c = code[i];
        if (c === '\\') { i += 2; continue; }
        if (c === quote) return i + 1;
        // 模板串里的 ${...} 不细究，整体当字符串直到匹配的闭引号
        i += 1;
    }
    return n;
}

/** 去掉引号并还原常见转义（只处理 require 参数会遇到的） */
function unescapeLiteral(raw: string, quote: string): string {
    let s = raw;
    if (s.length >= 2 && s[0] === quote && s[s.length - 1] === quote) {
        s = s.slice(1, -1);
    }
    return s
        .replace(/\\\\/g, '\\')
        .replace(/\\'/g, '\'')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
}

/** 把字符串值按原引号风格重新转义 */
function escapeLiteral(value: string, quote: string): string {
    let s = value
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    if (quote === '\'') s = s.replace(/'/g, '\\\'');
    else if (quote === '"') s = s.replace(/"/g, '\\"');
    return s;
}

// ============================================================================
// 路径工具（与 operit normalizePath 对齐：\→/，丢空段与 .，.. 弹栈）
// ============================================================================

export function normalizePath(p: string): string {
    const parts = String(p).replace(/\\/g, '/').split('/');
    const stack: string[] = [];
    for (const part of parts) {
        if (!part || part === '.') continue;
        if (part === '..') {
            if (stack.length > 0) stack.pop();
            continue;
        }
        stack.push(part);
    }
    return stack.join('/');
}

export function dirname(p: string): string {
    const norm = normalizePath(p);
    const idx = norm.lastIndexOf('/');
    return idx < 0 ? '' : norm.slice(0, idx);
}

/** 从 fromFile 到 toPath 的相对请求串（始终带 ./ 或 ../ 前缀 + 显式扩展） */
export function relativeRequest(fromFileArchivePath: string, toArchivePath: string): string {
    const fromDir = dirname(fromFileArchivePath);
    const fromParts = fromDir ? fromDir.split('/') : [];
    const toParts = normalizePath(toArchivePath).split('/');

    let common = 0;
    while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
        common += 1;
    }
    const up = fromParts.length - common;
    const down = toParts.slice(common);
    const segs: string[] = [];
    for (let k = 0; k < up; k += 1) segs.push('..');
    for (const d of down) segs.push(d);
    let rel = segs.join('/');
    if (!rel.startsWith('.')) rel = './' + rel;
    return rel;
}

// ============================================================================
// 主重写流程
// ============================================================================

/** 把裸名（含 node: 前缀）统一成白名单判断用的键 */
function whitelistKey(name: string): string {
    const s = String(name || '').trim();
    return s.startsWith('node:') ? s.slice(5) : s;
}

/**
 * 重写一个文件的源码。
 * 只改 require('裸名')；相对/绝对路径请求原样保留（它们本就该由 operit 解析）。
 */
export function rewriteSource(code: string, opts: RewriteOptions): RewriteResult {
    const occ = scanRequires(code);
    const changes: Array<{ from: string; to: string; kind: string }> = [];

    // 从后往前替换，避免位移
    let result = code;
    for (let k = occ.length - 1; k >= 0; k -= 1) {
        const o = occ[k];
        const req = o.value.trim();
        if (!req) continue;

        // 相对 / 绝对路径：不动
        if (req.startsWith('.') || req.startsWith('/')) continue;

        // 白名单：不动
        const wk = whitelistKey(req);
        if (WHITELIST.indexOf(wk) >= 0) {
            changes.push({ from: req, to: req, kind: 'whitelist' });
            continue;
        }

        // 解析裸名
        const target = opts.resolveBare(req);
        if (!target) {
            // 解析不出：保持原样，由上层（verify）拦
            changes.push({ from: req, to: req, kind: 'unresolved' });
            continue;
        }

        // 白名单类（resolver 也可能直接把它们判为 whitelist）
        if (target.kind === 'whitelist') {
            changes.push({ from: req, to: req, kind: 'whitelist' });
            continue;
        }

        // 计算相对当前文件的请求串
        let newReq: string;
        if (target.request && (target.request.startsWith('.') || target.request.startsWith('/'))) {
            newReq = target.request; // 解析器已给出最终请求串
        } else {
            newReq = relativeRequest(opts.archivePath, target.archivePath);
        }
        // 强制显式扩展（除 .json 且开启包装时另说）
        if (!/\.[a-z0-9]+$/i.test(newReq)) {
            newReq += '.js';
        }

        const literal = o.quote + escapeLiteral(newReq, o.quote) + o.quote;
        result = result.slice(0, o.argStart) + literal + result.slice(o.argEnd);
        changes.push({ from: req, to: newReq, kind: target.kind });
    }

    return { code: result, changes: changes };
}

export { WHITELIST };