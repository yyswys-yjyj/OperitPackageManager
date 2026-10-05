/**
 * 本地 tgz 安装：把 .tgz 装进项目 node_modules 或 npm 全局目录。
 *
 * 流程：
 *   1. 从头读 tgz 里的 package/package.json，得到包名与版本
 *   2. 解包到临时目录（tar -xzf）
 *   3. 目标：
 *        - 项目安装：<project>/node_modules/<name>/
 *        - 全局安装：/usr/lib/node_modules/<name>/（走 globalnpm 的 cp 原语）
 *   4. 项目安装时顺带更新 package.json 依赖（可选）与 package-lock.json
 *
 * 说明：本地 tgz 是「已打包物」，不做依赖解析（等同于 npm install <tgz> 在
 *       --no-save 之外只装该包本身；其依赖需另行安装）。
 */

import { extractTarball, getTmpDir, ensureDirs, shellQuote } from './fetch';
import { readPackageJson, writePackageJson, join } from './locker';
import { installDirToGlobal } from './globalnpm';

export interface LocalInstallOptions {
    /** tgz 文件绝对路径（Android 侧） */
    tgzPath: string;
    /** 项目根（非全局安装时必填） */
    projectDir?: string;
    /** 是否全局安装 */
    global?: boolean;
    /** 是否写入 package.json dependencies（项目安装时，默认 false） */
    save?: boolean;
}

export interface LocalInstallReport {
    ok: boolean;
    name: string;
    version: string;
    /** 安装到哪里 */
    target: string;
    /** 项目安装 or 全局安装 */
    mode: 'project' | 'global';
    message: string;
}

/** 从已解包目录读 package.json（内容直接在 dir 下） */
async function readJsonAt(dir: string): Promise<any | null> {
    try {
        const p = join(dir, 'package.json');
        const ex = await Tools.Files.exists(p);
        if (!ex || !ex.exists) return null;
        const r = await Tools.Files.read(p);
        return JSON.parse(r.content);
    } catch (e) {
        return null;
    }
}

/**
 * 主入口：安装本地 tgz。
 */
export async function installLocalTgz(opts: LocalInstallOptions): Promise<LocalInstallReport> {
    const mode: 'project' | 'global' = opts.global ? 'global' : 'project';
    await ensureDirs();

    // 1. 检查 tgz 存在
    const ex = await Tools.Files.exists(opts.tgzPath);
    if (!ex || !ex.exists) {
        return {
            ok: false, name: '', version: '', target: '', mode: mode,
            message: 'tgz 文件不存在：' + opts.tgzPath
        };
    }

    // 2. 解包到 tmp
    const tmpBase = join(getTmpDir(), 'localinstall-' + Date.now());
    try { await Tools.Files.deleteFile(tmpBase, true); } catch (e) { /* ignore */ }
    const exres = await extractTarball(opts.tgzPath, tmpBase);
    if (!exres.ok) {
        return {
            ok: false, name: '', version: '', target: '', mode: mode,
            message: '解包失败：' + (exres.reason || '')
        };
    }

    // 3. 定位 package/ 内容
    const pkgDir = join(tmpBase, 'package');
    const pkgExists = await Tools.Files.exists(pkgDir);
    const contentDir = (pkgExists && pkgExists.exists) ? pkgDir : tmpBase;

    // 4. 读 package.json
    const pj = await readJsonAt(contentDir);
    if (!pj || !pj.name) {
        try { await Tools.Files.deleteFile(tmpBase, true); } catch (e) { /* ignore */ }
        return {
            ok: false, name: '', version: '', target: '', mode: mode,
            message: 'tgz 内缺少有效的 package.json（name 字段）'
        };
    }
    const name = String(pj.name);
    const version = String(pj.version || '0.0.0');

    let target = '';
    if (mode === 'global') {
        // 5a. 全局：cp 到 /usr/lib/node_modules/<name>
        const r = await installDirToGlobal(contentDir, name);
        if (!r.ok) {
            try { await Tools.Files.deleteFile(tmpBase, true); } catch (e) { /* ignore */ }
            return {
                ok: false, name: name, version: version, target: r.target, mode: mode,
                message: '写入全局目录失败：' + r.message
            };
        }
        target = r.target;
    } else {
        // 5b. 项目：铺到 <project>/node_modules/<name>
        if (!opts.projectDir) {
            try { await Tools.Files.deleteFile(tmpBase, true); } catch (e) { /* ignore */ }
            return {
                ok: false, name: name, version: version, target: '', mode: mode,
                message: '项目安装需提供 project_dir'
            };
        }
        const nm = join(opts.projectDir, 'node_modules');
        await Tools.Files.mkdir(nm, true);
        target = join(nm, name);
        const tgtEx = await Tools.Files.exists(target);
        if (tgtEx && tgtEx.exists) {
            await Tools.Files.deleteFile(target, true);
        }
        // scoped 包确保父目录
        const parent = target.slice(0, target.lastIndexOf('/'));
        await Tools.Files.mkdir(parent, true);
        await Tools.Files.copy(contentDir, target, true);

        // 5c. save：写 package.json dependencies
        if (opts.save) {
            const projPj = await readPackageJson(opts.projectDir);
            if (projPj) {
                if (!projPj.dependencies) projPj.dependencies = {};
                projPj.dependencies[name] = version;
                await writePackageJson(opts.projectDir, projPj);
            }
        }
    }

    // 6. 清 tmp
    try { await Tools.Files.deleteFile(tmpBase, true); } catch (e) { /* ignore */ }

    return {
        ok: true,
        name: name,
        version: version,
        target: target,
        mode: mode,
        message: '已' + (mode === 'global' ? '全局' : '') + '安装 ' + name + '@' + version + ' -> ' + target
    };
}

/** helper：判断某路径是否像 tgz（.tgz/.tar.gz） */
export function isTgzPath(p: string): boolean {
    const s = String(p).toLowerCase();
    return s.endsWith('.tgz') || s.endsWith('.tar.gz');
}