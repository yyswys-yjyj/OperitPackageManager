/**
 */

import { globalRoot } from '../core/globalnpm';
import { getTmpDir } from '../core/fetch';

export interface ShadowResult {
    /** 影子 depsRoot（传给 depsRoots），无包时返回 null */
    shadowRoot: string | null;
    /** 镜像进来的包数量 */
    count: number;
    /** 影子目录绝对路径（用于事后清理） */
    dir: string;
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

async function exec(command: string, timeoutMs: number): Promise<{ output: string; exitCode: number }> {
    try {
        const r = await Tools.System.terminal.hiddenExec(command, {
            executorKey: 'opm_shadow',
            timeoutMs: timeoutMs
        });
        const output = (r && (r.output || (r as any).stdout)) || '';
        const exitCode = r && typeof r.exitCode === 'number' ? r.exitCode : (r && r.timedOut ? 124 : 0);
        return { output: String(output), exitCode };
    } catch (e) {
        return { output: String(e), exitCode: 1 };
    }
}

/**
 * 影子目录（放在 tmp 下，不污染项目目录）。
 * 名字带上项目 basename，避免并发/多项目互相踩。
 */
export function shadowDirOf(projectDir: string): string {
    const base = String(projectDir).replace(/\/+$/, '').replace(/^.*\//, '') || 'proj';
    return join(getTmpDir(), 'global-shadow-' + base);
}

/**
 */
export async function prepareGlobalShadow(projectDir: string): Promise<ShadowResult> {
    const shadow = shadowDirOf(projectDir);
    const shadowNm = join(shadow, 'node_modules');
    const groot = globalRoot();

    // 0. 本地已有 node.operit -> 无需全局回退，直接跳过镜像
    const localBuiltins = join(projectDir, 'node_modules/@serveryyswys/node.operit/BUILTINS.json');
    let hasLocal = false;
    try {
        const e = await Tools.Files.exists(localBuiltins);
        hasLocal = !!(e && e.exists);
    } catch (err) { hasLocal = false; }
    if (hasLocal) {
        await exec('rm -rf ' + shq(shadow), 15000);
        return { shadowRoot: null, count: 0, dir: shadow, message: '本地已装 node.operit，跳过全局镜像' };
    }

    // 1. 清旧影子 + 建新
    await exec('rm -rf ' + shq(shadow) + ' && mkdir -p ' + shq(shadowNm), 30000);

    // 2. 探测全局目录是否存在且有内容
    const probe = await exec(
        'if [ -d ' + shq(groot) + ' ]; then ls -1 ' + shq(groot) + ' 2>/dev/null | wc -l; else echo 0; fi',
        20000
    );
    const n = parseInt(String(probe.output).trim(), 10) || 0;
    if (n <= 0) {
        // 全局为空：清掉空影子，返回 null
        await exec('rm -rf ' + shq(shadow), 15000);
        return { shadowRoot: null, count: 0, dir: shadow, message: '全局目录为空，跳过影子' };
    }

    // 3. 用 tar 管道复制（cp 不支持 --exclude），排除体积巨大的 meta 包。
    //    注意：某些包内含符号链接/二进制（如 tsx 的 esbuild），tar 会报 warning 并返回非零；
    //    故用 `;` 让 __OPM_OK__ 无条件输出，再以「node.operit/包是否真的落地」为准判定。
    const EXCLUDE = ['npm', 'pnpm', 'corepack', 'yarn'];
    let exclArgs = '';
    for (const e of EXCLUDE) exclArgs += ' --exclude=' + shq(e);
    const cmd =
        'cd ' + shq(groot) + ' && (tar' + exclArgs + ' -cf - . | (cd ' + shq(shadowNm) + ' && tar -xf -)) ; echo __OPM_OK__';
    const cp = await exec(cmd, 180000);
    // 只要目录里确实有内容即视为成功（tar 可能因软链返回非零，但文件已落地）
    const nonEmpty = await exec('test -n "$(ls -A ' + shq(shadowNm) + ' 2>/dev/null)" && echo YES || echo NO', 15000);
    if (nonEmpty.output.indexOf('YES') < 0) {
        return { shadowRoot: null, count: 0, dir: shadow, message: '镜像全局失败：' + cp.output.slice(0, 300) };
    }

    // 4. 统计镜像进来的包数（顶层 + scoped 两层）
    const cnt = await exec(
        'cd ' + shq(shadowNm) + ' && ' +
        'c=0; for d in */; do d="${d%/}"; ' +
        'if [ -f "$d/package.json" ]; then c=$((c+1)); fi; ' +
        'if [ "${d#@}" != "$d" ] && [ -d "$d" ]; then for s in "$d"/*/; do s="${s%/}"; [ -f "$s/package.json" ] && c=$((c+1)); done; fi; ' +
        'done; echo $c',
        30000
    );
    const count = parseInt(String(cnt.output).trim(), 10) || 0;

    return {
        shadowRoot: shadow,
        count: count,
        dir: shadow,
        message: '已镜像 ' + count + ' 个全局包 -> ' + shadow
    };
}

/** 清理影子目录 */
export async function cleanupGlobalShadow(projectDir: string): Promise<void> {
    const shadow = shadowDirOf(projectDir);
    await exec('rm -rf ' + shq(shadow), 30000);
}