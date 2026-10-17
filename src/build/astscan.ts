/**
 * AST 扫描：用 acorn 解析源码，找出所有 require(...) 调用。
 *
 * 与词法版 scanRequires 的关系：
 *   - 静态 require（参数字符串字面量）两者一致；
 *   - 动态 require（参数是表达式/模板串插值）只有 AST 版能识别，
 *     并能抽出「静态前缀」，用于把前缀目录整目录收进归档。
 *
 * 解析失败（语法错误等）不抛，返回 ok=false 由调用方回退词法扫描。
 */

import * as acorn from 'acorn';

export interface RequireCall {
    /** 'static'：字符串字面量；'dynamic'：表达式/插值模板串 */
    kind: 'static' | 'dynamic';
    /** static 才有：字符串值 */
    value?: string;
    /** dynamic 才有：可确定的静态前缀（如 './libs/' / 'pkg/locales/'）；空串表示完全动态 */
    prefix?: string;
    /** 源码位置（行号，1 起） */
    line: number;
}

export interface AstScanResult {
    ok: boolean;
    /** 解析失败时的原因 */
    error?: string;
    calls: RequireCall[];
}

/** 从 AST 表达式里抽「静态前缀」：从左侧起连续的字符串片段，拼到第一个动态点为止 */
function extractStaticPrefix(node: any): string {
    if (!node) return '';

    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }

    if (node.type === 'BinaryExpression' && node.operator === '+') {
        const l = extractStaticPrefix(node.left);
        // 左侧若整体是纯静态字符串，才能继续吃右侧；否则前缀到左侧为止
        if (isStaticLiteral(node.left)) {
            return l + extractStaticPrefix(node.right);
        }
        return l;
    }

    if (node.type === 'TemplateLiteral') {
        // quasis[i] 在 expressions[i] 之前；遇到 ${} 就停
        const q = node.quasis && node.quasis[0];
        return (q && q.value && typeof q.value.cooked === 'string') ? q.value.cooked : '';
    }

    return '';
}

/** 该节点是否「纯静态字符串」（不含任何动态部分） */
function isStaticLiteral(node: any): boolean {
    if (!node) return false;
    if (node.type === 'Literal') return typeof node.value === 'string';
    if (node.type === 'TemplateLiteral') {
        return !node.expressions || node.expressions.length === 0;
    }
    return false;
}

/** 把前缀截到最后一个 '/'（含）；无 '/' 返回空串（说明是「裸包名 + 动态」） */
function trimToLastSlash(prefix: string): string {
    const i = prefix.lastIndexOf('/');
    return i < 0 ? '' : prefix.slice(0, i + 1);
}

/** 递归遍历 AST，收集所有 require(...) 调用 */
function walk(node: any, out: RequireCall[]): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'CallExpression') {
        const callee = node.callee;
        let isRequire = false;
        if (callee && callee.type === 'Identifier' && callee.name === 'require') {
            isRequire = true;
        } else if (
            callee &&
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object &&
            callee.object.type === 'Identifier' &&
            callee.object.name === 'require' &&
            callee.property &&
            callee.property.type === 'Identifier' &&
            callee.property.name === 'resolve'
        ) {
            // require.resolve(...)
            isRequire = true;
        }
        if (isRequire) {
            const arg = node.arguments && node.arguments[0];
            const line = (node.loc && node.loc.start && node.loc.start.line) || 0;
            if (arg) {
                if (arg.type === 'Literal' && typeof arg.value === 'string') {
                    out.push({ kind: 'static', value: arg.value, line: line });
                } else {
                    const rawPrefix = extractStaticPrefix(arg);
                    // 若参数左右拼接但左侧不是纯字符串，rawPrefix 可能为空
                    out.push({ kind: 'dynamic', prefix: trimToLastSlash(rawPrefix), line: line });
                }
            }
        }
    }

    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        const v = (node as any)[key];
        if (Array.isArray(v)) {
            for (const c of v) if (c && typeof c.type === 'string') walk(c, out);
        } else if (v && typeof v.type === 'string') {
            walk(v, out);
        }
    }
}

/**
 * 解析源码并扫出所有 require 调用。
 * ecmaVersion 用 latest，脚本/模块两种都试。
 */
export function scanRequiresAst(code: string): AstScanResult {
    let ast: any = null;
    let err = '';
    for (const st of ['script', 'module'] as const) {
        try {
            ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: st, allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true });
            err = '';
            break;
        } catch (e) {
            err = String((e && (e as any).message) ? (e as any).message : e);
        }
    }
    if (!ast) return { ok: false, error: err, calls: [] };

    const out: RequireCall[] = [];
    walk(ast, out);
    return { ok: true, calls: out };
}