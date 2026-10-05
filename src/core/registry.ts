/**
 * Registry 客户端：对接标准 npm registry 协议 + 辰锤目录扩展。
 *
 * 端点：
 *   GET {registry}/            ?format=json  -> 包目录 {packages:[{name,version,description}]}
 *   GET {registry}/{name}/     ?format=json  -> 标准 registry doc
 *   GET {registry}/{name}/-/{tarball}        -> tgz 本体
 */

import { loadConfig } from './config.js';
import { maxSatisfying, parseVersion } from './semver.js';

export interface CatalogEntry {
    name: string;
    version: string;
    description: string;
}

export interface RegistryVersion {
    name: string;
    version: string;
    description?: string;
    main?: string;
    types?: string;
    bin?: any;
    license?: string;
    keywords?: string[];
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    engines?: Record<string, string>;
    dist: {
        tarball: string;
        shasum?: string;
        integrity?: string;
        fileCount?: number;
        unpackedSize?: number;
    };
}

export interface RegistryDoc {
    _id: string;
    name: string;
    description?: string;
    'dist-tags'?: Record<string, string>;
    versions: Record<string, RegistryVersion>;
    time?: Record<string, string>;
    maintainers?: Array<{ name: string; email?: string }>;
}

/** 规范化 registry 基址：保证以 / 结尾 */
function normalizeBase(registry: string): string {
    let b = registry.trim();
    if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
    if (!b.endsWith('/')) b += '/';
    return b;
}

/** 拼目录 URL */
function catalogUrl(base: string): string {
    return base + '?format=json';
}

/** 拼包元数据 URL（scoped 名保留 @ 与 /） */
function docUrl(base: string, name: string): string {
    return base + encodeURI(name) + '/?format=json';
}

/** 统一的 JSON GET，带 UA 与错误处理 */
async function httpJson(url: string): Promise<any> {
    const res = await Tools.Net.http({
        url: url,
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'opm/0.1.0 (Operit)'
        },
        follow_redirects: true,
        connect_timeout: 20000,
        read_timeout: 60000
    });
    if (!res || res.statusCode < 200 || res.statusCode >= 300) {
        throw new Error('HTTP ' + (res ? res.statusCode : '?') + ' for ' + url);
    }
    const text = res.content || '';
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error('响应不是合法 JSON: ' + url);
    }
}

/** 拉取目录列表 */
export async function fetchCatalog(registryOverride?: string): Promise<CatalogEntry[]> {
    const cfg = await loadConfig();
    const base = normalizeBase(registryOverride || cfg.registry);
    const data = await httpJson(catalogUrl(base));
    const arr: any[] = Array.isArray(data) ? data : (data && data.packages) || [];
    return arr.map((p: any) => ({
        name: String(p.name || ''),
        version: String(p.version || ''),
        description: String(p.description || '')
    })).filter((p: CatalogEntry) => !!p.name);
}

/** 拉取单个包完整元数据文档 */
export async function fetchDoc(name: string, registryOverride?: string): Promise<RegistryDoc> {
    const cfg = await loadConfig();
    const base = normalizeBase(registryOverride || cfg.registry);
    const data = await httpJson(docUrl(base, name));
    if (!data || !data.versions) {
        throw new Error('包不存在或元数据缺失: ' + name);
    }
    return data as RegistryDoc;
}

/** 解析要安装的具体版本：spec 形如 name / name@1.2.3 / name@^1.0.0 / name@latest */
export function parseSpec(spec: string): { name: string; range: string } {
    let name = spec, range = '';
    if (spec.startsWith('@')) {
        const at = spec.indexOf('@', 1);
        if (at > 0) {
            name = spec.slice(0, at);
            range = spec.slice(at + 1);
        }
    } else {
        const at = spec.indexOf('@');
        if (at > 0) {
            name = spec.slice(0, at);
            range = spec.slice(at + 1);
        }
    }
    return { name: name.trim(), range: range.trim() };
}

/** 从 doc 里挑出匹配 range 的版本对象 */
export function resolveVersion(doc: RegistryDoc, range: string): RegistryVersion | null {
    const versions = Object.keys(doc.versions || {});
    if (versions.length === 0) return null;
    if (!range || range === 'latest') {
        const latest = doc['dist-tags'] && doc['dist-tags'].latest;
        if (latest && doc.versions[latest]) return doc.versions[latest];
        const best = maxSatisfying(versions, '*');
        return best ? doc.versions[best] : null;
    }
    if (parseVersion(range) && doc.versions[range]) return doc.versions[range];
    const best = maxSatisfying(versions, range);
    return best ? doc.versions[best] : null;
}

/** registry 基址（供 tarball 相对路径补全） */
export async function registryBase(registryOverride?: string): Promise<string> {
    const cfg = await loadConfig();
    return normalizeBase(registryOverride || cfg.registry);
}

export { normalizeBase };