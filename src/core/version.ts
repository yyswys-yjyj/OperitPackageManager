/**
 * version 命令：列出指定项目目录下的全部库版本。
 *
 * 覆盖三层：
 *   1. 项目自身（package.json 的 name/version）
 *   2. node_modules 下的全部已装包（含 scoped）
 *   3. opm 自身（宿主包的版本，从 manifest 读）
 *
 * 可选带全局已装包（fromGlobal）。
 */

import { readPackageJson } from './locker';
import { listGlobalPackages } from './globalnpm';

export interface LibVersion {
    name: string;
    version: string;
    /** 来源：self / dep / global */
    source: string;
    /** 可选，所在目录 */
    dir?: string;
}

export interface VersionReport {
    ok: boolean;
    projectDir: string;
    /** 项目自身 */
    self: { name: string; version: string } | null;
    /** node_modules 里的依赖 */
    deps: LibVersion[];
    /** 全局已装包（opt-in） */
    globals?: LibVersion[];
    /** 宿主 opm 自身版本 */
    opm: { name: string; version: string } | null;
    message: string;
}

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

function baseName(p: string): string {
    const n = String(p).replace(/\/+$/, '');
    const i = n.lastIndexOf('/');
    return i < 0 ? n : n.slice(i + 1);
}

async function readJson(path: string): Promise<any | null> {
    try {
        const ex = await Tools.Files.exists(path);
        if (!ex || !ex.exists) return null;
        const r = await Tools.Files.read(path);
        return JSON.parse(r.content);
    } catch (e) {
        return null;
    }
}

/**
 * 列出某目录下 node_modules 的全部包版本。
 * 递归一层 scoped（@scope/pkg），不深挖嵌套 node_modules（顶层依赖为准）。
 */
async function listNodeModules(nmDir: string): Promise<LibVersion[]> {
    const out: LibVersion[] = [];
    let listing: any;
    try {
        listing = await Tools.Files.list(nmDir);
    } catch (e) {
        return out;
    }
    const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
    for (const it of entries) {
        const name = it.name || it.fileName || '';
        if (!name || name.startsWith('.')) continue;
        const isDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
        if (!isDir) continue;
        const abs = join(nmDir, name);
        if (name.startsWith('@')) {
            // scope：再列一层
            let sub: any;
            try {
                sub = await Tools.Files.list(abs);
            } catch (e) { continue; }
            const subEntries = (sub && (sub.files || sub.entries || sub.children)) || [];
            for (const se of subEntries) {
                const sname = se.name || se.fileName || '';
                if (!sname) continue;
                const sIsDir = se.isDirectory === true || se.type === 'directory' || se.directory === true;
                if (!sIsDir) continue;
                const full = name + '/' + sname;
                const sAbs = join(abs, sname);
                const pj = await readJson(join(sAbs, 'package.json'));
                out.push({
                    name: full,
                    version: (pj && pj.version) || '?',
                    source: 'dep',
                    dir: sAbs
                });
            }
        } else {
            const pj = await readJson(join(abs, 'package.json'));
            out.push({
                name: name,
                version: (pj && pj.version) || '?',
                source: 'dep',
                dir: abs
            });
        }
    }
    // 按名排序
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
}

/** 读宿主 opm 自身版本（从已装包 manifest 或项目 manifest.json） */
export async function readOpmSelfVersion(projectDir?: string): Promise<{ name: string; version: string } | null> {
    // 1) 若给了项目目录，优先读项目内 manifest.json（opm 自身开发目录）
    if (projectDir) {
        const m = await readJson(join(projectDir, 'manifest.json'));
        if (m && m.toolpkg && m.toolpkg.name) {
            return { name: m.toolpkg.name, version: m.toolpkg.version || '?' };
        }
        if (m && m.name) {
            return { name: m.name, version: m.version || '?' };
        }
    }
    // 2) 已装包目录的 manifest
    const installed = '/sdcard/Android/data/com.ai.assistance.operit/files/packages/com.operit.serveryyswys.opm';
    const m2 = await readJson(join(installed, 'manifest.json'));
    if (m2 && m2.toolpkg) {
        return { name: m2.toolpkg.name, version: m2.toolpkg.version || '?' };
    }
    return null;
}

/**
 * 主入口：收集指定项目下的全部库版本。
 */
export async function collectVersions(
    projectDir: string,
    includeGlobal: boolean
): Promise<VersionReport> {
    const report: VersionReport = {
        ok: true,
        projectDir: projectDir,
        self: null,
        deps: [],
        opm: null,
        message: ''
    };

    // 1. 项目自身
    const pj = await readPackageJson(projectDir);
    if (pj) {
        report.self = {
            name: pj.name || baseName(projectDir),
            version: pj.version || '?'
        };
    }

    // 2. node_modules
    const nm = join(projectDir, 'node_modules');
    const nmEx = await Tools.Files.exists(nm);
    if (nmEx && nmEx.exists) {
        report.deps = await listNodeModules(nm);
    }

    // 3. opm 自身
    report.opm = await readOpmSelfVersion(projectDir);

    // 4. 全局（可选）
    if (includeGlobal) {
        try {
            const g = await listGlobalPackages();
            report.globals = g.map((x) => ({ name: x.name, version: x.version, source: 'global', dir: x.dir }));
        } catch (e) {
            report.globals = [];
        }
    }

    const parts: string[] = [];
    if (report.self) parts.push('self=' + report.self.name + '@' + report.self.version);
    parts.push('deps=' + report.deps.length);
    if (report.globals) parts.push('global=' + report.globals.length);
    if (report.opm) parts.push('opm=' + report.opm.version);
    report.message = parts.join(' ');
    return report;
}