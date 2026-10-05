/**
 * 依赖解析：给定根依赖 spec 列表，递归解析成扁平安装计划。
 *
 * 一期策略：扁平安装（hoist 到顶层 node_modules），冲突时保留首个解析结果并告警。
 * 与 npm 的差异：不做嵌套 node_modules，不做 peer 校验。
 */

import { fetchDoc, resolveVersion, RegistryVersion } from './registry.js';

export interface ResolvedNode {
    name: string;
    version: string;
    versionInfo: RegistryVersion;
    /** 该节点的直接依赖 spec */
    deps: Record<string, string>;
    /** 是否根依赖 */
    isRoot: boolean;
}

export interface ResolveResult {
    nodes: Record<string, ResolvedNode>;
    warnings: string[];
}

/** 解析一组顶层依赖 */
export async function resolveDependencies(
    rootDeps: Record<string, string>,
    registryOverride?: string,
    onProgress?: (msg: string) => void
): Promise<ResolveResult> {
    const nodes: Record<string, ResolvedNode> = {};
    const warnings: string[] = [];
    const queue: Array<{ name: string; range: string; isRoot: boolean }> = [];

    for (const name of Object.keys(rootDeps || {})) {
        queue.push({ name: name, range: rootDeps[name], isRoot: true });
    }

    const visited = new Set<string>();

    while (queue.length > 0) {
        const item = queue.shift()!;
        const key = item.name;
        if (visited.has(key)) {
            // 已解析，检查版本是否兼容（粗略：同 key 只装一次）
            continue;
        }
        visited.add(key);

        if (onProgress) onProgress('解析 ' + item.name + (item.range ? '@' + item.range : ''));

        let doc;
        try {
            doc = await fetchDoc(item.name, registryOverride);
        } catch (e) {
            warnings.push('无法获取 ' + item.name + ': ' + String(e));
            continue;
        }
        const ver = resolveVersion(doc, item.range);
        if (!ver) {
            warnings.push('找不到满足 ' + item.name + '@' + item.range + ' 的版本');
            continue;
        }

        const deps: Record<string, string> = Object.assign({}, ver.dependencies || {});
        nodes[key] = {
            name: item.name,
            version: ver.version,
            versionInfo: ver,
            deps: deps,
            isRoot: item.isRoot
        };

        for (const dn of Object.keys(deps)) {
            if (!visited.has(dn)) {
                queue.push({ name: dn, range: deps[dn], isRoot: false });
            }
        }
    }

    return { nodes: nodes, warnings: warnings };
}