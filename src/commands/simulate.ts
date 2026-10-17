/**
 * 模拟加载：在不出包的前提下，复刻 operit 的加载期行为做静态检查。
 *
 * 依据来源（operit 源码）：
 *   - ToolPkgMainRegistrationScriptParser.kt：加载 = 执行 main 脚本找 registerToolPkg 函数
 *   - PackageManager.kt:
 *       extractMetadataFromJs: 正则 /\*\s*METADATA\s*([\s\S]*?)\*\/ 抽注释
 *       parseJsPackage: 用 hjson 解析（JsonValue.readHjson）
 *       validateToolFunctionExists: tool 名须在 js 里有对应函数（5 种模式）
 *
 * 本模块只做「静态分析」，不落盘、不执行脚本。
 */

import { scanRequiresAst } from '../build/astscan';

declare const require: any;

/** 子包 metadata 里的单个 tool（宽松结构，只校验关键字段） */
export interface MetaToolIssue {
    tool: string;
    reason: string;
}

export interface SubpackageMetaResult {
    entry: string;
    /** 是否找到 METADATA 块 */
    hasMeta: boolean;
    /** metadata 文本是否被 hjson 成功解析 */
    parsed: boolean;
    name?: string;
    toolCount?: number;
    /** 工具名清单 */
    tools?: string[];
    issues: MetaToolIssue[];
}

export interface RegistrationResult {
    /** main.js 是否定义了 registerToolPkg */
    hasRegisterFn: boolean;
    /** main.js 里调用的注册类 API（ToolPkg.xxx） */
    registrationApis: string[];
    /** 静态分析里的告警（如找不到 registerToolPkg 导出） */
    issues: string[];
}

export interface SimulateResult {
    ok: boolean;
    registration: RegistrationResult;
    subpackages: SubpackageMetaResult[];
    message: string;
}

/** hjson 的 require（运行时由可达性把 node_modules/hjson 收进归档） */
function hjsonParse(text: string): any {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const H = require('hjson');
    return H.parse(text);
}

/** 从 JS 文本里抽取 METADATA 注释（复刻 PackageManager.extractMetadataFromJs 的正则） */
export function extractMetadataFromJs(jsContent: string): string {
    const m = /\*\s*METADATA\s*([\s\S]*?)\*\//.exec(jsContent || '');
    return m ? m[1].trim() : '';
}

/**
 * 模拟 main 脚本的注册期（静态）：找 registerToolPkg 定义 + 收集 ToolPkg.* 注册调用。
 */
export function simulateRegistration(mainText: string): RegistrationResult {
    const res: RegistrationResult = { hasRegisterFn: false, registrationApis: [], issues: [] };
    const astRes = scanRequiresAst(mainText || '');
    // scanRequiresAst 只给 require；这里用 acorn 重新遍历，拿函数定义 + 成员调用
    let ast: any = null;
    try {
        const acorn = require('acorn');
        try {
            ast = acorn.parse(mainText, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
        } catch (e) {
            ast = acorn.parse(mainText, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true });
        }
    } catch (e) {
        res.issues.push('main 脚本无法用 acorn 解析：' + String(e));
        void astRes;
        return res;
    }
    const apis = new Set<string>();
    const walk = (n: any) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        // exports.registerToolPkg = ...
        if (n.type === 'AssignmentExpression' && n.left && n.left.type === 'MemberExpression') {
            const o = n.left.object, p = n.left.property;
            if (o && o.name === 'exports' && p && p.name === 'registerToolPkg') res.hasRegisterFn = true;
        }
        // function registerToolPkg(){}
        if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'registerToolPkg') res.hasRegisterFn = true;
        // var/let/const registerToolPkg = ...
        if (n.type === 'VariableDeclarator' && n.id && n.id.name === 'registerToolPkg') res.hasRegisterFn = true;
        // ToolPkg.xxx(...) 调用
        if (n.type === 'CallExpression' && n.callee && n.callee.type === 'MemberExpression') {
            const o = n.callee.object, p = n.callee.property;
            if (o && o.name === 'ToolPkg' && p && p.name) apis.add(p.name);
        }
        for (const k in n) if (k !== 'type') walk(n[k]);
    };
    walk(ast);
    res.registrationApis = Array.from(apis);
    if (!res.hasRegisterFn) res.issues.push('main 脚本未导出/定义 registerToolPkg');
    return res;
}

/** 模拟子包 metadata 解析（静态）：抽 METADATA 注释 + hjson 解析 + 校验 */
export function simulateSubpackageMeta(entryRel: string, entryText: string): SubpackageMetaResult {
    const out: SubpackageMetaResult = {
        entry: entryRel,
        hasMeta: false,
        parsed: false,
        issues: []
    };
    const metaText = extractMetadataFromJs(entryText);
    if (!metaText) {
        out.issues.push({ tool: '-', reason: '缺少 METADATA 注释块' });
        return out;
    }
    out.hasMeta = true;
    // 复刻 operit：hjson 解析（无引号键 / 尾逗号 / 注释都能吃）
    let meta: any = null;
    try {
        meta = hjsonParse(metaText);
    } catch (e) {
        out.issues.push({ tool: '-', reason: 'METADATA 解析失败：' + String(e) });
        return out;
    }
    out.parsed = true;
    if (!meta || typeof meta !== 'object') {
        out.issues.push({ tool: '-', reason: 'METADATA 不是对象' });
        return out;
    }
    if (typeof meta.name !== 'string' || !meta.name.trim()) {
        out.issues.push({ tool: '-', reason: '缺少 name 字段' });
    } else {
        out.name = meta.name;
    }
    const tools = meta.tools;
    if (!Array.isArray(tools)) {
        out.issues.push({ tool: '-', reason: '缺少 tools 数组' });
        return out;
    }
    out.toolCount = tools.length;
    out.tools = [];
    for (const t of tools) {
        if (!t || typeof t !== 'object') { out.issues.push({ tool: '?', reason: 'tool 不是对象' }); continue; }
        const tn = typeof t.name === 'string' ? t.name : '';
        if (!tn) { out.issues.push({ tool: '?', reason: 'tool 缺少 name' }); continue; }
        out.tools.push(tn);
        if (!t.description) out.issues.push({ tool: tn, reason: '缺少 description' });
        if (t.parameters !== undefined && !Array.isArray(t.parameters)) {
            out.issues.push({ tool: tn, reason: 'parameters 不是数组' });
        }
    }
    return out;
}
