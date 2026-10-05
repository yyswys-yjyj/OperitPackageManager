/**
 * 打包器：把「归档文件集合」写进一个临时目录，再压成 .toolpkg。
 *
 * ToolPkg 归档 = zip，内部布局：
 *   manifest.json
 *   main.js
 *   ui/xxx/index.ui.js
 *   core/*.js
 *   packages/*.js
 *   node_modules/<被引用的包>/*.js
 *
 * 产物文件名：<项目根目录名>.toolpkg（放在项目根的同级目录）
 */

import { ArchiveFile } from './reachability';

export interface PackOptions {
    /** 项目根目录（Android 侧绝对路径） */
    projectDir: string;
    /** 归档内路径 -> 文件内容 */
    files: Map<string, ArchiveFile>;
    /** manifest.json 的文本内容（由 build 命令生成/校验） */
    manifestText: string;
    /** 产物文件名（不含 .toolpkg），默认取项目根目录名 */
    outName?: string;
    /** 临时组装目录（绝对路径） */
    stageDir: string;
}

export interface PackResult {
    ok: boolean;
    /** 产物绝对路径 */
    toolpkgPath: string;
    /** 打进归档的文件数 */
    fileCount: number;
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

/**
 * 组装 + 打包。
 */
export async function packToolpkg(opts: PackOptions): Promise<PackResult> {
    const stage = opts.stageDir;

    // 1. 清空并重建 stage 目录
    await hidden('rm -rf ' + shq(stage) + ' && mkdir -p ' + shq(stage), 30000);

    // 2. 写 manifest.json
    await writeFile(join(stage, 'manifest.json'), opts.manifestText);

    // 3. 写全部归档文件
    let count = 0;
    for (const [relPath, file] of opts.files) {
        const abs = join(stage, relPath);
        const parent = abs.slice(0, abs.lastIndexOf('/'));
        await hidden('mkdir -p ' + shq(parent), 15000);
        await writeFile(abs, file.text);
        count += 1;
    }

    // 4. 压成 .toolpkg（zip，不含顶层目录）
    const name = opts.outName || baseName(opts.projectDir);
    const parentOfProject = opts.projectDir.replace(/\/+$/, '').replace(/\/[^/]+$/, '');
    const toolpkgPath = join(parentOfProject, name + '.toolpkg');

    const zipRes = await zipDir(stage, toolpkgPath);
    if (!zipRes.ok) {
        return {
            ok: false,
            toolpkgPath: toolpkgPath,
            fileCount: count,
            message: '压缩失败：' + zipRes.message
        };
    }
    // 清理组装临时目录（否则项目内残留 .opm_stage）
    await hidden('rm -rf ' + shq(stage), 30000);

    return {
        ok: true,
        toolpkgPath: toolpkgPath,
        fileCount: count,
        message: '已打包 ' + count + ' 个文件 -> ' + toolpkgPath
    };
}

async function zipDir(srcDir: string, destZip: string): Promise<{ ok: boolean; message: string }> {
    try {
        // include_root_directory=false：归档里直接是 manifest.json 等，不含 srcDir 这一层
        const r = await Tools.Files.zip(srcDir, destZip, 'android', false);
        if (r && (r.success === false)) {
            return { ok: false, message: JSON.stringify(r) };
        }
        return { ok: true, message: 'ok' };
    } catch (e) {
        return { ok: false, message: String(e) };
    }
}

async function writeFile(path: string, content: string): Promise<void> {
    try {
        await Tools.Files.write(path, content, false, 'android');
    } catch (e) {
        // 忽略单文件失败，外层会核对
    }
}

async function hidden(command: string, timeoutMs: number): Promise<any> {
    try {
        return await Tools.System.terminal.hiddenExec(command, {
            executorKey: 'opm_build',
            timeoutMs: timeoutMs
        });
    } catch (e) {
        return { output: String(e), exitCode: 1, timedOut: false };
    }
}

function shq(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}