/**
 * 编译器：调 tsc 把项目的 TS 源码编译成 JS。
 *
 * 真机验证：
 *   - 沙盒 Tools.System.terminal.hiddenExec 能调 /usr/bin/tsc (v6.0.3)
 *   - tsc 报 TS5112（"CWD 有 tsconfig 又想单文件编译"）时需 -p 显式指定
 *
 * 编译产物放到一个临时输出目录，供后续可达性分析读取。
 */

export interface CompileResult {
    ok: boolean;
    outDir: string;
    /** 编译输出的相对项目根路径（若成功） */
    outputSummary: string;
    stdout: string;
    stderr: string;
    /** tsc 退出码 */
    exitCode: number;
}

export interface CompileOptions {
    /** 项目根目录（Android 侧绝对路径） */
    projectDir: string;
    /** 输出目录（相对项目根，默认 .opm_build） */
    outDirRel?: string;
    /** 超时 */
    timeoutMs?: number;
}

function shq(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/**
 * 运行 tsc。
 * 用法：优先用项目自带的 tsconfig.json；若无，则以「src 目录全量 + 指定 outDir」编译。
 */
export async function compileProject(opts: CompileOptions): Promise<CompileResult> {
    const projectDir = opts.projectDir;
    const outDirRel = opts.outDirRel || '.opm_build';
    const timeoutMs = opts.timeoutMs || 180000;

    const absOut = projectDir + '/' + outDirRel;
    const tsconfigPath = projectDir + '/tsconfig.json';

    const hasTsconfig = await exists(tsconfigPath);

    // 清空输出目录
    await hidden('rm -rf ' + shq(absOut) + ' && mkdir -p ' + shq(absOut), 20000);

    let cmd: string;
    if (hasTsconfig) {
        // 用项目 tsconfig 但覆盖 outDir
        cmd = 'cd ' + shq(projectDir) + ' && tsc -p tsconfig.json --outDir ' + shq(absOut) + ' 2>&1';
    } else {
        // 无 tsconfig：全量编译 src 下所有 ts
        cmd = 'cd ' + shq(projectDir) + ' && tsc --outDir ' + shq(absOut) +
              ' --module commonjs --target es2020 --esModuleInterop --skipLibCheck' +
              ' $(find ' + shq(projectDir + '/src') + ' -name "*.ts" 2>/dev/null) 2>&1';
    }

    const res = await hidden(cmd, timeoutMs);
    const combined = res.output || '';
    // tsc 把错误写到 stdout（用 2>&1 合并了）；用退出码判断成败
    const exitCode = typeof res.exitCode === 'number' ? res.exitCode : (res.timedOut ? 124 : 0);

    return {
        ok: exitCode === 0,
        outDir: outDirRel,
        outputSummary: '',
        stdout: combined,
        stderr: '',
        exitCode: exitCode
    };
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

async function exists(p: string): Promise<boolean> {
    try {
        const e = await Tools.Files.exists(p);
        return !!(e && e.exists);
    } catch (err) {
        return false;
    }
}