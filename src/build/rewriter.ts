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

import * as acorn from 'acorn';

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
    /** require('x') 还是 require.resolve('x') */
    kind: 'require' | 'resolve';
}

/**
 * 用 acorn AST 精确扫描 require('x') / require.resolve('x')。
 * 只收「参数是字符串字面量」的调用（静态形态）；动态参数交给 astscan 的前缀收集，这里跳过。
 * 相比词法版：不会误抓注释/正则/字符串里的 `require` 字样。
 * 解析失败返回 null，由调用方回退词法扫描。
 */
export function scanRequiresViaAst(code: string): RequireOccurrence[] | null {
    let ast: any;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true } as any);
    } catch (_e) {
        try {
            ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true } as any);
        } catch (_e2) {
            return null;
        }
    }
    const out: RequireOccurrence[] = [];
    const seen = new Set<number>();
    const visit = (node: any): void => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
            const callee = node.callee;
            let kind: 'require' | 'resolve' | null = null;
            if (callee && callee.type === 'Identifier' && callee.name === 'require') {
                kind = 'require';
            } else if (
                callee && callee.type === 'MemberExpression' && !callee.computed &&
                callee.object && callee.object.type === 'Identifier' && callee.object.name === 'require' &&
                callee.property && callee.property.type === 'Identifier' && callee.property.name === 'resolve'
            ) {
                kind = 'resolve';
            }
            if (kind !== null) {
                const arg = node.arguments && node.arguments[0];
                if (arg && arg.type === 'Literal' && typeof arg.value === 'string' && !seen.has(arg.start)) {
                    seen.add(arg.start);
                    const q = code[arg.start];
                    const isQuote = (q === '"' || q === '\'' || q === '`');
                    // 与词法版保持一致：argStart/argEnd 覆盖「含引号」的整段，替换时连引号一起换掉
                    out.push({
                        argStart: arg.start,
                        argEnd: arg.end,
                        value: arg.value,
                        quote: isQuote ? q : '"',
                        kind: kind
                    });
                }
            }
        }
        for (const key of Object.keys(node)) {
            if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;
            const v = node[key];
            if (Array.isArray(v)) {
                for (const c of v) if (c && typeof c.type === 'string') visit(c);
            } else if (v && typeof v.type === 'string') {
                visit(v);
            }
        }
    };
    visit(ast);
    return out;
}

/**
 * 扫描源码里的 require(...) / require.resolve(...) 调用（带精确参数位置）。
 * 首选 AST（精确、不会误抓注释/正则/字符串）；解析失败时回退词法扫描。
 */
export function scanRequires(code: string): RequireOccurrence[] {
    const viaAst = scanRequiresViaAst(code);
    if (viaAst !== null) return viaAst;
    return scanRequiresLexical(code);
}

/**
 * 词法扫描（回退用）：扫描 require('xxx') / require.resolve('xxx') 的字符串参数位置。
 * 注意：本实现不处理正则字面量，极端情况下可能误抓；正常路径由 AST 版兜底。
 */
function scanRequiresLexical(code: string): RequireOccurrence[] {
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
                // 允许空白后跟 ( 或 .resolve(
                let j = i;
                while (j < n && /\s/.test(code[j])) j += 1;
                // 识别 require.resolve(...)
                if (code[j] === '.') {
                    const dot = j;
                    let m = j + 1;
                    while (m < n && isIdentPart(code[m])) m += 1;
                    const member = code.slice(dot + 1, m);
                    if (member !== 'resolve') {
                        continue;
                    }
                    let k2 = m;
                    while (k2 < n && /\s/.test(code[k2])) k2 += 1;
                    if (code[k2] !== '(') {
                        continue;
                    }
                    k2 += 1;
                    while (k2 < n && /\s/.test(code[k2])) k2 += 1;
                    const q2 = code[k2];
                    if (q2 === '"' || q2 === '\'' || q2 === '`') {
                        const literalStart2 = k2;
                        const end2 = skipString(code, literalStart2, q2);
                        let kk = end2;
                        while (kk < n && /\s/.test(code[kk])) kk += 1;
                        const isConcat2 = (kk < n && code[kk] === '+');
                        const tplDynamic2 = (q2 === '`' && raw_has_interp(code.slice(literalStart2, end2)));
                        if (!isConcat2 && !tplDynamic2) {
                            const raw2 = code.slice(literalStart2, end2);
                            const value2 = unescapeLiteral(raw2, q2);
                            out.push({
                                argStart: literalStart2,
                                argEnd: end2,
                                value: value2,
                                quote: q2,
                                kind: 'resolve'
                            });
                        }
                        i = end2;
                        continue;
                    }
                    continue;
                }
                if (code[j] === '(') {
                    j += 1;
                    while (j < n && /\s/.test(code[j])) j += 1;
                    const q = code[j];
                    if (q === '"' || q === '\'' || q === '`') {
                        const literalStart = j;
                        const end = skipString(code, literalStart, q);
                        // 动态检测：字符串字面量之后若是 '+' 拼接（或模板串内含 ${}），
                        // 说明是表达式的一部分，不算静态 require，交给 AST 扫描处理。
                        let k = end;
                        while (k < n && /\s/.test(code[k])) k += 1;
                        const isConcat = (k < n && code[k] === '+');
                        const tplDynamic = (q === '`' && raw_has_interp(code.slice(literalStart, end)));
                        if (!isConcat && !tplDynamic) {
                            const raw = code.slice(literalStart, end); // 含引号
                            const value = unescapeLiteral(raw, q);
                            out.push({
                                argStart: literalStart,
                                argEnd: end,
                                value: value,
                                quote: q,
                                kind: 'require'
                            });
                        }
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

/** 模板串字面量文本里是否含 ${} 插值 */
function raw_has_interp(raw: string): boolean {
    return raw.indexOf('${') >= 0;
}

function isIdentStart(c: string): boolean {
    return /[A-Za-z_$]/.test(c);
}
function isIdentPart(c: string): boolean {
    return /[A-Za-z0-9_$]/.test(c);
}

/**
 * 扫描源码中**裸引用**给定标识符的位置（跳过注释与字符串）。
 * 用于判定是否需要注入 process / Buffer 全局（避免被注释/文档字符串误触）。
 *
 * 「裸引用」判定：
 *   - 标识符位于注释/字符串之外（词法扫描保证）
 *   - 其前一非空白字符不是 `.`（排除 `foo.process` 属性访问）
 *   - 其后一非空白字符不是 `:`（粗略排除对象键 `{ process: ... }`）
 * 返回命中的标识符名集合（去重）。
 */
export function scanGlobalRefs(code: string, names: string[]): string[] {
    const want = new Set(names);
    const hit = new Set<string>();
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
        // 标识符
        if (isIdentStart(c)) {
            const start = i;
            while (i < n && isIdentPart(code[i])) i += 1;
            const word = code.slice(start, i);
            if (want.has(word)) {
                // 前一非空白字符
                let p = start - 1;
                while (p >= 0 && /\s/.test(code[p])) p -= 1;
                const prevIsDot = (p >= 0 && code[p] === '.');
                // 后一非空白字符
                let q = i;
                while (q < n && /\s/.test(code[q])) q += 1;
                const nextIsColon = (q < n && code[q] === ':');
                if (!prevIsDot && !nextIsColon) hit.add(word);
            }
            continue;
        }
        i += 1;
    }
    return Array.from(hit);
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
        if (o.kind === 'resolve') {
            // require.resolve('pkg') -> '<相对路径>'
            // 运行时没有 require.resolve（operit 的 require 是纯函数），
            // 且没有真实绝对路径概念，因此替换成「可被 require 的归档内相对路径」字面量。
            const span = findResolveSpan(result, o);
            if (span) {
                result = result.slice(0, span.start) + literal + result.slice(span.end);
            } else {
                // 兜底：至少把参数字符串换掉
                result = result.slice(0, o.argStart) + literal + result.slice(o.argEnd);
            }
            changes.push({ from: req, to: newReq, kind: 'resolve' });
            continue;
        }
        result = result.slice(0, o.argStart) + literal + result.slice(o.argEnd);
        changes.push({ from: req, to: newReq, kind: target.kind });
    }

    return { code: result, changes: changes };
}
/**
 * 找 `require.resolve('...')` 的完整跨度：从 `require` 的 r 到闭合 `)`。
 * 从 occurrence 的 argStart 往前扫到最近的 `require.resolve(`，往后扫到匹配的 `)`。
 * 找不到返回 null（调用方退回只替换参数字符串）。
 */
function findResolveSpan(code: string, o: RequireOccurrence): { start: number; end: number } | null {
    // 往前找 require.resolve( 的起点
    const head = code.slice(0, o.argStart);
    // 用 'req' + 'uire' 拼接，避免本函数自身被词法扫描器误判为一次 require 调用
    const kw = 'req' + 'uire';
    const idx = head.lastIndexOf(kw);
    if (idx < 0) return null;
    // 校验 idx..argStart 之间形如 require.resolve(
    const between = code.slice(idx, o.argStart);
    const re = new RegExp('^' + kw + '\\s*\\.\\s*resolve\\s*\\(\\s*$');
    if (!re.test(between)) return null;
    // 往后找闭合 )
    let k = o.argEnd;
    const n = code.length;
    while (k < n && /\s/.test(code[k])) k += 1;
    if (code[k] !== ')') return null;
    return { start: idx, end: k + 1 };
}

export { WHITELIST };