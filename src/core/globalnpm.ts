/**
 * npm 全局安装目录打通层。
 *
 * 关键事实（真机核实）：
 *   - Linux(proot/Ubuntu) 侧 npm 全局根 = /usr/lib/node_modules
 *   - npm 前缀 = /usr，可执行 bin 落 /usr/bin
 *   - 沙盒进程是 root，/usr/lib/node_modules 可写
 *   - 该路径属于 Linux 文件系统，Tools.Files.* 只能碰 Android 侧（/sdcard/...），
 *     所以对它的所有读写都必须走 Tools.System.terminal.hiddenExec 的 shell 命令。
 *
 * 本模块把「全局目录」抽象成几个 shell 原语：
 *   globalRoot()          返回全局 node_modules 路径
 *   globalBinDir()        返回全局 bin 目录
 *   globalPkgDir(name)    某个包在全局目录里的落点
 *   existsGlobal(name)    全局是否已装某包
 *   readGlobalPkgJson(name)  读全局包 package.json
 *   listGlobalPackages()  列出全局已装包（顶层，不含 scope 内部展开前的层级）
 *   installDirToGlobal(srcAndroidDir, name)  把 Android 侧目录抄进全局
 *   execIn Linux 执行（只用于本模块）
 */

/** 全局 node_modules 根（Linux 路径）。可用环境变量 OPM_GLOBAL_ROOT 覆盖，便于测试。 */
export function globalRoot(): string {
    // 允许被 config 覆盖；默认走 npm 前缀推导
    try {
        const v = (globalThis as any).__OPM_GLOBAL_ROOT__;
        if (typeof v === 'string' && v) return v;
    } catch (e) { /* ignore */ }
    return '/usr/lib/node_modules';
}

/** 全局 bin 目录 */
export function globalBinDir(): string {
    return '/usr/bin';
}

/** 某个包名在全局目录里的落点。scoped 包保留 @scope/pkg 结构。 */
export function globalPkgDir(name: string): string {
    return join(globalRoot(), name);
}

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

/** shell 单引号安全包裹 */
export function shq(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** 在 Linux 里执行命令（本模块专用；其余模块请复用各自的 hidden 封装） */
export async function exec(command: string, timeoutMs: number): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
    try {
        const r = await Tools.System.terminal.hiddenExec(command, {
            executorKey: 'opm_global',
            timeoutMs: timeoutMs
        });
        const output = (r && (r.output || (r as any).stdout)) || '';
        const exitCode = r && typeof r.exitCode === 'number' ? r.exitCode : (r && r.timedOut ? 124 : 0);
        return { output: String(output), exitCode, timedOut: !!(r && r.timedOut) };
    } catch (e) {
        return { output: String(e), exitCode: 1, timedOut: false };
    }
}

/** 判断全局是否已装某包（存在 package.json 即视为已装） */
export async function existsGlobal(name: string): Promise<boolean> {
    const p = join(globalPkgDir(name), 'package.json');
    const r = await exec('test -f ' + shq(p) + ' && echo __YES__ || echo __NO__', 15000);
    return r.output.indexOf('__YES__') >= 0;
}

/** 读全局包的 package.json（原文），读不到返回 null */
export async function readGlobalPkgJsonText(name: string): Promise<string | null> {
    const p = join(globalPkgDir(name), 'package.json');
    const r = await exec('cat ' + shq(p) + ' 2>/dev/null', 15000);
    if (!r.output || r.output.indexOf('No such file') >= 0) return null;
    return r.output;
}

/** 读全局包 package.json 并解析；失败返回 null */
export async function readGlobalPkgJson(name: string): Promise<any | null> {
    const t = await readGlobalPkgJsonText(name);
    if (!t) return null;
    try {
        return JSON.parse(t);
    } catch (e) {
        return null;
    }
}

/**
 * 列出全局已装包。
 * 规则：globalRoot 下每个含 package.json 的子目录 = 一个包；
 *     以 @ 开头的目录是 scope，其下再列一层。
 * 返回 [{ name, version, dir }]，name 对 scoped 包是 @scope/pkg。
 */
export async function listGlobalPackages(): Promise<Array<{ name: string; version: string; dir: string }>> {
    const root = globalRoot();
    // 用 find 把顶层与 scoped 两层都列出来：找所有 '*/package.json' 与 '*/*/package.json'
    const cmd =
        'cd ' + shq(root) + ' 2>/dev/null || exit 0; ' +
        'for d in */; do ' +
        '  d="${d%/}"; ' +
        '  if [ -f "$d/package.json" ]; then echo "T|$d"; fi; ' +
        '  if [ "${d#@}" != "$d" ] && [ -d "$d" ]; then ' +
        '    for s in "$d"/*/; do s="${s%/}"; [ -f "$s/package.json" ] && echo "S|$s"; done; ' +
        '  fi; ' +
        'done';
    const r = await exec(cmd, 30000);
    const out: Array<{ name: string; version: string; dir: string }> = [];
    const lines = r.output.split('\n');
    for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        const i = t.indexOf('|');
        if (i < 0) continue;
        const kind = t.slice(0, i);
        const rel = t.slice(i + 1);
        if (kind !== 'T' && kind !== 'S') continue;
        const dir = join(root, rel);
        const pj = await readGlobalPkgJson(rel);
        out.push({
            name: rel,
            version: (pj && pj.version) || '?',
            dir: dir
        });
    }
    // 去重（同名以先出现为准）
    const seen: Record<string, boolean> = {};
    const uniq: Array<{ name: string; version: string; dir: string }> = [];
    for (const it of out) {
        if (seen[it.name]) continue;
        seen[it.name] = true;
        uniq.push(it);
    }
    return uniq;
}

/**
 * 把 Android 侧的一个目录（已解包的包内容，其内直接是 package.json 等）抄进全局目录。
 * 返回 { ok, target, message }。
 *
 * 实现：Linux 侧能看到 /sdcard（已挂载），直接用 cp -r。
 */
export async function installDirToGlobal(
    srcAndroidDir: string,
    name: string
): Promise<{ ok: boolean; target: string; message: string }> {
    const target = globalPkgDir(name);
    const parent = target.slice(0, target.lastIndexOf('/'));
    const cmd =
        'mkdir -p ' + shq(parent) + ' && ' +
        'rm -rf ' + shq(target) + ' && ' +
        'cp -r ' + shq(srcAndroidDir) + ' ' + shq(target) + ' && echo __OPM_OK__';
    const r = await exec(cmd, 120000);
    if (r.output.indexOf('__OPM_OK__') < 0) {
        return { ok: false, target: target, message: r.output.slice(0, 300) };
    }
    return { ok: true, target: target, message: 'ok' };
}

/** 删除全局已装包目录 */
export async function removeGlobalPackage(name: string): Promise<{ ok: boolean; message: string }> {
    const target = globalPkgDir(name);
    const r = await exec('rm -rf ' + shq(target) + ' && echo __OPM_OK__', 30000);
    if (r.output.indexOf('__OPM_OK__') < 0) {
        return { ok: false, message: r.output.slice(0, 300) };
    }
    return { ok: true, message: 'ok' };
}
