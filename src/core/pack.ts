/**
 * pack 命令：把项目目录打成一个 npm 兼容的 .tgz（npm pack 布局）。
 *
 * npm pack 约定：
 *   - 归档文件名：<name>-<version>.tgz（name 去 scope 前缀，@ 转 -）
 *   - 归档内所有内容位于 package/ 前缀之下
 *   - 内容 = 项目目录（排除 node_modules / .opm_build / .opm_stage / .git 等）
 *
 * 实现：
 *   1. 清出一个临时 stage 目录
 *   2. 把项目文件（过滤后）复制到 stage/package/
 *   3. tar -czf 产出 .tgz
 */

export interface PackOptions {
    /** 项目根目录（Android 侧绝对路径） */
    projectDir: string;
    /** 产物输出目录（Android 侧绝对路径），默认项目根 */
    outDir?: string;
    /** 产物文件名（不含 .tgz），默认按 <name>-<version> 生成 */
    outName?: string;
    /** 额外排除的前缀（相对项目根） */
    exclude?: string[];
}

export interface PackReport {
    ok: boolean;
    /** 产物绝对路径 */
    tgzPath: string;
    /** 打进归档的文件数 */
    fileCount: number;
    /** 包名 */
    name: string;
    /** 包版本 */
    version: string;
    message: string;
}

function shq(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
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

async function exec(command: string, timeoutMs: number): Promise<{ output: string; exitCode: number }> {
    try {
        const r = await Tools.System.terminal.hiddenExec(command, {
            executorKey: 'opm_pack',
            timeoutMs: timeoutMs
        });
        const output = (r && (r.output || (r as any).stdout)) || '';
        const exitCode = r && typeof r.exitCode === 'number' ? r.exitCode : (r && r.timedOut ? 124 : 0);
        return { output: String(output), exitCode };
    } catch (e) {
        return { output: String(e), exitCode: 1 };
    }
}

async function readPackageJson(projectDir: string): Promise<any | null> {
    try {
        const p = join(projectDir, 'package.json');
        const ex = await Tools.Files.exists(p);
        if (!ex || !ex.exists) return null;
        const r = await Tools.Files.read(p);
        return JSON.parse(r.content);
    } catch (e) {
        return null;
    }
}

/** 默认排除的前缀（相对项目根） */
const DEFAULT_EXCLUDES = [
    'node_modules',
    '.opm_build',
    '.opm_stage',
    '.opm_verify',
    '.git',
    '.opm_cache'
];

/** 由包名与版本推导 npm pack 产物名 */
export function npmPackFileName(name: string, version: string): string {
    const base = String(name || 'package').replace(/^@/, '').replace(/\//g, '-');
    return base + '-' + version + '.tgz';
}

/**
 * 主入口：打包项目为 .tgz。
 */
export async function packProject(opts: PackOptions): Promise<PackReport> {
    const projectDir = opts.projectDir.replace(/\/+$/, '');
    const pj = await readPackageJson(projectDir);
    if (!pj) {
        return {
            ok: false, tgzPath: '', fileCount: 0,
            name: '', version: '',
            message: '项目根缺少 package.json：' + join(projectDir, 'package.json')
        };
    }
    const name = pj.name || baseName(projectDir);
    const version = pj.version || '0.0.0';

    const outDir = opts.outDir ? opts.outDir.replace(/\/+$/, '') : projectDir;
    const fileName = opts.outName ? opts.outName.replace(/\.tgz$/i, '') + '.tgz'
                                  : npmPackFileName(name, version);
    const tgzPath = join(outDir, fileName);

    const stage = join(projectDir, '.opm_stage');
    const stagePkg = join(stage, 'package');

    // 1. 清 stage
    await exec('rm -rf ' + shq(stage) + ' && mkdir -p ' + shq(stagePkg), 30000);

    // 2. 复制项目文件到 stage/package（rsync 风格排除）
    const excl = DEFAULT_EXCLUDES.concat(opts.exclude || []);
    const exclArgs = excl.map((e) => '--exclude=' + shq(e)).join(' ');
    // 用 tar 管道复制：cd projectDir && tar 排除后 -> stage/package
    const copyCmd =
        'cd ' + shq(projectDir) + ' && ' +
        'tar ' + exclArgs + ' -cf - . | (cd ' + shq(stagePkg) + ' && tar -xf -) && echo __OPM_OK__';
    const cp = await exec(copyCmd, 120000);
    if (cp.output.indexOf('__OPM_OK__') < 0) {
        return {
            ok: false, tgzPath: tgzPath, fileCount: 0, name: name, version: version,
            message: '复制项目文件失败：' + cp.output.slice(0, 300)
        };
    }

    // 3. 统计文件数
    const cnt = await exec('find ' + shq(stagePkg) + ' -type f | wc -l', 30000);
    const fileCount = parseInt(String(cnt.output).trim(), 10) || 0;

    // 4. 打成 tgz（在 stage 目录里打，保证顶层是 package/）
    await exec('rm -f ' + shq(tgzPath), 15000);
    const tgzCmd =
        'cd ' + shq(stage) + ' && tar -czf ' + shq(tgzPath) + ' package && echo __OPM_OK__';
    const tg = await exec(tgzCmd, 120000);
    if (tg.output.indexOf('__OPM_OK__') < 0) {
        return {
            ok: false, tgzPath: tgzPath, fileCount: fileCount, name: name, version: version,
            message: '压缩失败：' + tg.output.slice(0, 300)
        };
    }

    // 5. 清 stage
    await exec('rm -rf ' + shq(stage), 30000);

    return {
        ok: true,
        tgzPath: tgzPath,
        fileCount: fileCount,
        name: name,
        version: version,
        message: '已打包 ' + fileCount + ' 个文件 -> ' + tgzPath
    };
}