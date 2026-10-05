/**
 * 安装执行器：把解析结果落地到 node_modules + package-lock.json。
 */

import {
    downloadTarball, verifyTarball, extractTarball, placePackage, ensureDirs, getTmpDir, shellQuote
} from './fetch.js';
import {
    join, nodeModulesDir, readLockfile, writeLockfile, emptyLockfile,
    readPackageJson, Lockfile, LockPackage
} from './locker.js';
import { ResolvedNode, ResolveResult } from './resolver.js';

export interface InstallReport {
    installed: Array<{ name: string; version: string }>;
    skipped: Array<{ name: string; version: string; reason: string }>;
    warnings: string[];
}

/** 包名 -> node_modules 内的目录名（scoped 保留结构 @scope/pkg） */
export function moduleDirName(name: string): string {
    return name;
}

/** 单个包安装：下载 + 校验 + 解包 + 铺目录 */
export async function installOne(
    node: ResolvedNode,
    projectDir: string,
    onProgress?: (msg: string) => void
): Promise<{ ok: boolean; reason?: string }> {
    const nm = nodeModulesDir(projectDir);
    const target = join(nm, node.name);

    const dist = node.versionInfo.dist || ({} as any);
    const tarballUrl = dist.tarball;
    if (!tarballUrl) return { ok: false, reason: '缺少 tarball 地址' };

    if (onProgress) onProgress('下载 ' + node.name + '@' + node.version);
    let tgz: string;
    try {
        tgz = await downloadTarball(tarballUrl, node.name, node.version);
    } catch (e) {
        return { ok: false, reason: '下载失败: ' + String(e) };
    }

    // 校验
    const v = await verifyTarball(tgz, dist.integrity, dist.shasum);
    if (!v.ok) {
        return { ok: false, reason: '校验失败: ' + (v.reason || '') };
    }

    // 解包到临时目录
    await ensureDirs();
    const tmp = join(getTmpDir(), node.name.replace(/[\/\\@]/g, '_') + '-' + node.version);
    // 清理旧临时目录
    try { await Tools.Files.deleteFile(tmp, true); } catch (e) { /* ignore */ }
    if (onProgress) onProgress('解包 ' + node.name + '@' + node.version);
    const ex = await extractTarball(tgz, tmp);
    if (!ex.ok) {
        return { ok: false, reason: '解包失败: ' + (ex.reason || '') };
    }

    // 铺到 node_modules/<name>/
    try {
        await placePackage(tmp, target);
    } catch (e) {
        return { ok: false, reason: '落盘失败: ' + String(e) };
    }

    // 清理临时
    try { await Tools.Files.deleteFile(tmp, true); } catch (e) { /* ignore */ }

    return { ok: true };
}

/** 执行完整安装计划 */
export async function installResolved(
    projectDir: string,
    resolved: ResolveResult,
    onProgress?: (msg: string) => void
): Promise<InstallReport> {
    const report: InstallReport = { installed: [], skipped: [], warnings: resolved.warnings.slice() };
    await ensureDirs();
    await Tools.Files.mkdir(nodeModulesDir(projectDir), true);

    const names = Object.keys(resolved.nodes);
    for (const name of names) {
        const node = resolved.nodes[name];
        const r = await installOne(node, projectDir, onProgress);
        if (r.ok) {
            report.installed.push({ name: node.name, version: node.version });
        } else {
            report.skipped.push({ name: node.name, version: node.version, reason: r.reason || '未知' });
        }
    }
    return report;
}

/**
 * 根据安装结果写出 package-lock.json。
 * 增量合并：保留已有 lock 条目，用新解析结果覆盖/新增，避免全量重建丢包。
 */
export async function writeLockFromResolved(
    projectDir: string,
    resolved: ResolveResult,
    report?: InstallReport
): Promise<Lockfile> {
    const pj = await readPackageJson(projectDir);
    const old = await readLockfile(projectDir);
    const lock = old
        ? Object.assign(emptyLockfile(pj && pj.name, pj && pj.version), old)
        : emptyLockfile(pj && pj.name, pj && pj.version);
    if (!lock.packages) lock.packages = {};
    // 元信息随 package.json 走
    lock.name = (pj && pj.name) || lock.name;
    lock.version = (pj && pj.version) || lock.version;

    for (const name of Object.keys(resolved.nodes)) {
        const node = resolved.nodes[name];
        const dist = node.versionInfo.dist || ({} as any);
        const relPath = 'node_modules/' + name;
        let integrity = dist.integrity;
        if (!integrity && old && old.packages && old.packages[relPath] && old.packages[relPath].integrity) {
            integrity = old.packages[relPath].integrity;
        }
        lock.packages[relPath] = {
            version: node.version,
            resolved: dist.tarball || '',
            integrity: integrity,
            dependencies: Object.keys(node.deps).length ? node.deps : undefined
        };
    }
    await writeLockfile(projectDir, lock);
    return lock;
}

/** 从现有 lockfile 重建 node_modules（离线复装） */
export async function installFromLock(projectDir: string, onProgress?: (msg: string) => void): Promise<InstallReport> {
    const lock = await readLockfile(projectDir);
    const report: InstallReport = { installed: [], skipped: [], warnings: [] };
    if (!lock) {
        report.warnings.push('没有 package-lock.json');
        return report;
    }
    await ensureDirs();
    await Tools.Files.mkdir(nodeModulesDir(projectDir), true);

    for (const relPath of Object.keys(lock.packages)) {
        const p = lock.packages[relPath];
        const name = relPath.replace(/^node_modules\//, '');
        const dirName = name;
        if (onProgress) onProgress('安装 ' + name + '@' + p.version);
        try {
            const tgz = await downloadTarball(p.resolved, name, p.version);
            const v = await verifyTarball(tgz, p.integrity, undefined);
            const tmp = join(getTmpDir(), name.replace(/[\/\\@]/g, '_') + '-' + p.version);
            try { await Tools.Files.deleteFile(tmp, true); } catch (e) { /* ignore */ }
            const ex = await extractTarball(tgz, tmp);
            if (!ex.ok) throw new Error(ex.reason);
            await placePackage(tmp, join(nodeModulesDir(projectDir), dirName));
            try { await Tools.Files.deleteFile(tmp, true); } catch (e) { /* ignore */ }
            report.installed.push({ name: name, version: p.version });
        } catch (e) {
            report.skipped.push({ name: name, version: p.version, reason: String(e) });
        }
    }
    return report;
}