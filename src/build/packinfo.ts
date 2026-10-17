'use strict';

/**
 * PACKINFO 生成器：把打包信息核对写进 toolpkg 根目录的 `PACKINFO` 文件（无扩展名，YAML），
 * 供 Operit 市场对包做审核核对。
 *
 * 触发：仅当 build 的 PACKINFO 参数里 `enable === true` 时生成；否则不写该文件
 * （PACKINFO 是可选字段）。
 *
 * 字段顺序（固定）：
 *   name -> description -> id -> version -> author -> license -> dependencies
 * 每个字段「有才写，缺则跳过」：参数值优先于 manifest 值；两者都没有就不写这一行。
 * id / version 恒有（manifest 是 build 的前提，必有 toolpkg_id / version）。
 *
 * dependencies：可达性分析收集到的裸名，过滤掉白名单（lodash/uuid/axios）与
 * node.operit 内建后，按「作用域/包名」粒度去重（不具体到模块路径）。
 *
 * 不写 extra_files。
 */

/** 白名单（运行时自带，不算依赖）。 */

export interface PackInfoOptions {
    /** 开关：仅 true 时生成 PACKINFO。 */
    enable?: unknown;
    /** 许可证（SPDX 标识，如 MIT / Apache-2.0）。manifest 没有时由此补。 */
    license?: unknown;
    /** 作者（manifest 的 author 数组缺失时由此补；字符串）。 */
    author?: unknown;
    /** 包名（manifest 的 display_name 缺失时由此补）。 */
    name?: unknown;
    /** 描述（manifest 的 description 缺失时由此补）。 */
    description?: unknown;
    /** 版本（manifest 的 version 缺失时由此补；一般不需要）。 */
    version?: unknown;
}

/** 取 JSON 字段的本地化文本：优先 .zh，其次 .en，其次任意字符串。 */
function localized(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (typeof obj.zh === 'string' && obj.zh) return obj.zh;
        if (typeof obj.en === 'string' && obj.en) return obj.en;
        for (const key of Object.keys(obj)) {
            if (typeof obj[key] === 'string' && obj[key]) return obj[key] as string;
        }
    }
    return '';
}

/** 从裸名取出「作用域/包名」粒度：@scope/pkg/sub/x.js -> @scope/pkg，pkg/sub/x -> pkg。 */
export function packageNameOf(bareName: string): string {
    const n = String(bareName || '').trim();
    if (!n) return '';
    const segs = n.split('/');
    if (segs[0].startsWith('@')) {
        return segs.length >= 2 ? segs[0] + '/' + segs[1] : segs[0];
    }
    return segs[0];
}

/**
 * 从「归档内路径集合」推导依赖包名列表（用了啥写啥）。
 *
 * 依据实际收进归档的文件：凡是位于 `node_modules/<pkg>/...` 的，<pkg> 就是一条真实依赖
 * （含 scope 形式 @scope/pkg）。这天然覆盖：
 *   - 直接 require 的 npm 包（acorn / hjson）；
 *   - 因内建重写而带进来的运行时（如 node.operit 的 fs/os）——它们同样是依赖。
 * 不列具体模块路径，只到包名/作用域；去重、保持首次出现顺序。
 */
export function collectDependenciesFromArchive(archivePaths: Iterable<string>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const prefix = 'node_modules/';
    for (const raw of archivePaths) {
        const p = String(raw || '').replace(/\\/g, '/');
        if (p.indexOf(prefix) !== 0) continue;
        const rest = p.slice(prefix.length);
        const segs = rest.split('/');
        let pkg = '';
        if (segs[0].startsWith('@')) {
            if (segs.length < 2 || !segs[1]) continue;
            pkg = segs[0] + '/' + segs[1];
        } else {
            if (!segs[0]) continue;
            pkg = segs[0];
        }
        // 嵌套 node_modules（node_modules/a/node_modules/b）也算 b 的依赖
        if (seen.has(pkg)) continue;
        seen.add(pkg);
        out.push(pkg);
    }
    return out;
}

/** YAML 标量引号处理：仅当含特殊字符时用双引号包裹。 */
function yamlScalar(value: string): string {
    const s = String(value);
    // 含 : / # / 首尾空格 / 引号 / 换行 等特殊字符则加引号
    if (/^[\s]|[\s]$/.test(s) || /[:#"'\[\]{}&*!|>%@`,]/.test(s) || /\n/.test(s)) {
        return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
    }
    return s;
}

/**
 * 生成 PACKINFO 文本（YAML）。
 * 返回 null 表示不生成（enable 非 true，或没有任何可写字段）。
 */
export function renderPackInfo(
    manifest: Record<string, unknown>,
    opts: PackInfoOptions,
    archivePaths: Iterable<string>
): string | null {
    if (opts === undefined || opts === null) return null;
    if (opts.enable !== true) return null;

    const lines: string[] = [];

    // name：参数 > manifest.display_name > manifest.displayName
    const name = String(opts.name || '') || localized(manifest.display_name) || localized(manifest.displayName);
    if (name) lines.push('name: ' + yamlScalar(name));

    // description：参数 > manifest.description
    const description = String(opts.description || '') || localized(manifest.description);
    if (description) lines.push('description: ' + yamlScalar(description));

    // id：manifest.toolpkg_id（恒有）
    const id = String(manifest.toolpkg_id || manifest.id || '');
    if (id) lines.push('id: ' + yamlScalar(id));

    // version：参数 > manifest.version
    const version = String(opts.version || '') || String(manifest.version || '');
    if (version) lines.push('version: ' + yamlScalar(version));

    // author：参数 > manifest.author（数组或字符串）
    let author = String(opts.author || '');
    if (!author) {
        const rawAuthor = manifest.author;
        if (Array.isArray(rawAuthor)) {
            author = rawAuthor.map((x) => String(x)).filter(Boolean).join(', ');
        } else if (typeof rawAuthor === 'string') {
            author = rawAuthor;
        }
    }
    if (author) lines.push('author: ' + yamlScalar(author));

    // license：参数 > manifest.license
    const license = String(opts.license || '') || String(manifest.license || '');
    if (license) lines.push('license: ' + yamlScalar(license));

    // dependencies：自动
    const deps = collectDependenciesFromArchive(archivePaths);
    if (deps.length > 0) {
        lines.push('dependencies:');
        for (const dep of deps) {
            lines.push('  - ' + yamlScalar(dep));
        }
    }

    if (lines.length === 0) return null;
    return lines.join('\n') + '\n';
}