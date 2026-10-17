/**
 * 编译器：调 tsc 把项目的 TS 源码编译成 JS。
 *
 * 真机验证：
 *   - 沙盒 Tools.System.terminal.hiddenExec 能调 /usr/bin/tsc (v6.0.3)
 *   - tsc 报 TS5112（"CWD 有 tsconfig 又想单文件编译"）时需 -p 显式指定
 *
 * 编译产物放到一个临时输出目录，供后续可达性分析读取。
 */
import { readTextSafeAsync } from '../core/nodesafe';

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
    /** 兜底输出目录（相对项目根，默认 .opm_build）——仅当 tsconfig 未声明 outDir 时使用 */
    outDirRel?: string;
    /** 超时 */
    timeoutMs?: number;
}

/**
 * 宽松解析 tsconfig：手工剥掉块注释/行注释与尾逗号（不用正则，避开转义陷阱）。
 * 解析失败抛异常。
 */
function parseTsconfigLoose(raw: string): any {
    let out = '';
    const n = raw.length;
    let i = 0;
    let inStr = false;
    let strQ = '';
    while (i < n) {
        const c = raw[i];
        const c2 = raw[i + 1];
        if (inStr) {
            out += c;
            if (c === '\\') { out += (c2 || ''); i += 2; continue; }
            if (c === strQ) inStr = false;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'") { inStr = true; strQ = c; out += c; i += 1; continue; }
        // 块注释
        if (c === '/' && c2 === '*') {
            i += 2;
            while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }
        // 行注释
        if (c === '/' && c2 === '/') {
            i += 2;
            while (i < n && raw[i] !== '\n') i += 1;
            continue;
        }
        out += c;
        i += 1;
    }
    // 去尾逗号
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(out);
}

/** 读取并解析 tsconfig.json 的 compilerOptions.outDir / rootDir（相对项目根）；无则 null */
async function readTsconfigOutDir(projectDir: string): Promise<{ outDir: string | null; rootDir: string | null }> {
    try {
        const r = await readTextSafeAsync(projectDir + '/tsconfig.json');
        if (typeof r !== 'string') return { outDir: null, rootDir: null };
        const j = parseTsconfigLoose(r);
        const co = (j && j.compilerOptions) || {};
        const norm = (v: any) => {
            if (typeof v !== 'string' || !v.trim()) return null;
            let t = v.trim();
            if (t.indexOf('./') === 0) t = t.slice(2);
            return t;
        };
        return { outDir: norm(co.outDir), rootDir: norm(co.rootDir) };
    } catch (e) {
        return { outDir: null, rootDir: null };
    }
}

/** 清理旧构建中间产物（不碰 tsconfig outDir 里的实际产物） */
async function cleanStaleBuildArtifacts(projectDir: string): Promise<void> {
    const targets = [
        projectDir + '/.opm_build',
        projectDir + '/.opm_stage',
        projectDir + '/.opm_verify'
    ];
    for (const t of targets) {
        await hidden('rm -rf ' + shq(t), 20000);
    }
    await hidden('find ' + shq(projectDir) + ' -maxdepth 3 -name ' + shq('*.tsbuildinfo') + ' -not -path "*/node_modules/*" -delete 2>/dev/null', 20000);
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

    const tsconfigPath = projectDir + '/tsconfig.json';
    const hasTsconfig = await exists(tsconfigPath);

    // 构建前清理旧构建中间产物（防止旧引用被打进包）
    await cleanStaleBuildArtifacts(projectDir);

    // 产物目录：有 tsconfig 且声明 outDir -> 用它；否则兜底 outDirRel
    let effectiveOutDirRel = outDirRel;
    let tcOutDir: string | null = null;
    if (hasTsconfig) {
        const tc = await readTsconfigOutDir(projectDir);
        tcOutDir = tc.outDir;
        if (tc.outDir) effectiveOutDirRel = tc.outDir;
    }
    const absOut = projectDir + '/' + effectiveOutDirRel;

    // 清空产物目录（tsc 的输出目标，属构建中间态）
    await hidden('rm -rf ' + shq(absOut) + ' && mkdir -p ' + shq(absOut), 20000);

    let cmd: string;
    if (hasTsconfig) {
        if (tcOutDir) {
            // tsconfig 已声明 outDir：原样用 -p，不覆盖
            cmd = 'cd ' + shq(projectDir) + ' && tsc -p tsconfig.json 2>&1';
        } else {
            // tsconfig 无 outDir：覆盖到兜底目录，避免污染源码目录
            cmd = 'cd ' + shq(projectDir) + ' && tsc -p tsconfig.json --outDir ' + shq(absOut) + ' 2>&1';
        }
    } else {
        // 无 tsconfig：全量编译 src 下所有 ts
        cmd = 'cd ' + shq(projectDir) + ' && tsc --outDir ' + shq(absOut) +
              ' --module commonjs --target es2020 --esModuleInterop --skipLibCheck' +
              ' $(find ' + shq(projectDir + '/src') + ' -name "*.ts" 2>/dev/null) 2>&1';
    }

    const res = await hidden(cmd, timeoutMs);
    const combined = res.output || '';
    const exitCode = typeof res.exitCode === 'number' ? res.exitCode : (res.timedOut ? 124 : 0);

    // tsc 即便有类型错误（如 UI 上下文缺 ctx/Tools 声明这类非致命错误）也常会产出 JS。
    // 因此判据 = 「输出目录里确实生成了 .js 产物」为主，exitCode 为辅。
    const produced = await countJsFiles(absOut);

    return {
        ok: produced > 0,
        outDir: effectiveOutDirRel,
        outputSummary: produced + ' js file(s)',
        stdout: combined,
        stderr: '',
        exitCode: exitCode
    };
}

/** 递归统计目录下 .js 文件数 */
async function countJsFiles(dir: string): Promise<number> {
    let n = 0;
    let listing: any;
    try {
        listing = await Tools.Files.list(dir);
    } catch (e) {
        return 0;
    }
    const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
    for (const it of entries) {
        const name = it.name || it.fileName || '';
        if (!name) continue;
        const isDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
        if (isDir) {
            n += await countJsFiles(dir.replace(/\/+$/, '') + '/' + name);
        } else if (/\.(js|mjs|cjs)$/i.test(name)) {
            n += 1;
        }
    }
    return n;
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