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
    /** 产物落盘目录（绝对路径），默认为项目根的上一级目录 */
    outDir?: string;
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
        // 二进制资源（base64）走 writeBinary，其余走文本 write
        if (file.binary !== undefined) {
            await writeBinaryFile(abs, file.binary);
        } else {
            await writeFile(abs, file.text);
        }
        count += 1;
    }

    // 4. 压成 .toolpkg（zip，不含顶层目录）
    const name = opts.outName || baseName(opts.projectDir);
    const parentOfProject = opts.projectDir.replace(/\/+$/, '').replace(/\/[^/]+$/, '');
    const destDir = (opts.outDir && opts.outDir.trim())
        ? opts.outDir.replace(/\/+$/, '')
        : parentOfProject;
    // 确保落盘目录存在
    await hidden('mkdir -p ' + shq(destDir), 15000);
    const toolpkgPath = join(destDir, name + '.toolpkg');

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
        if (r && ((r as any).success === false)) {
            return { ok: false, message: JSON.stringify(r) };
        }
        return { ok: true, message: 'ok' };
    } catch (e) {
        return { ok: false, message: String(e) };
    }
}

async function writeBinaryFile(path: string, base64: string): Promise<void> {
    try {
        await Tools.Files.writeBinary(path, base64);
    } catch (e) {
        const Base64 = Java.type('android.util.Base64');
        const bytes = Base64.decode(base64, 0);
        const FileOutputStream = Java.type('java.io.FileOutputStream');
        const fos = new FileOutputStream(path);
        fos.write(bytes);
        fos.close();
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