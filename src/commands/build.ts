/**
 * build 命令：把工程打成可直接烧录的 .toolpkg。
 *
 * 两种模式（自动识别）：
 *   ── TS 模式：项目里有 tsconfig.json（或 src 下存在 .ts）
 *      1. 调 tsc 编译到 .opm_build/
 *      2. 从入口出发做可达性分析 + 裸名重写
 *      3. 注入 process/Buffer 全局
 *      4. 契约拦截
 *      5. 打包成 <项目根名>.toolpkg
 *
 *   ── JS 模式：纯 JS 工程（无 tsconfig / 无 .ts）
 *      跳过编译，产物根 = 项目根（排除 node_modules、.opm_build、.opm_stage），
 *      其余流程与 TS 模式一致。
 *
 * 可达性种子（两种模式通用）：
 *   manifest.main
 *   + manifest.subpackages[].entry（子包入口，非 require 链但必须进包）
 *   + manifest 里声明的 ui 模块（若有）
 *   + 由上面这些入口顺着 require 链递归到的所有文件
 *   + node.operit 的 process/buffer（prelude 注入目标）
 */

import { loadContract, NodeOperitContract } from '../build/contract';
import { compileProject } from '../build/compiler';
import { collectReachable, ArchiveFile } from '../build/reachability';
import { buildGlobalsPrelude } from '../build/globals';
import { packToolpkg } from '../build/packer';
import { normalizePath, scanGlobalRefs } from '../build/rewriter';
import { prepareGlobalShadow, cleanupGlobalShadow } from '../build/globalshadow';
import { isExcluded as isExcludedShared, expandExtraEntry } from '../build/extrafiles';
import { renderPackInfo, PackInfoOptions } from '../build/packinfo';
import { readTextSafeAsync } from '../core/nodesafe';

export interface BuildOptions {
    /** 项目根目录（Android 侧绝对路径） */
    projectDir: string;
    /** 跳过编译（TS 模式才有效） */
    skipCompile?: boolean;
    /** 编译输出兜底目录（相对项目根，默认 .opm_build）——仅当 tsconfig 未声明 outDir 时用 */
    outDirRel?: string;
    /** 组装临时目录（绝对路径），默认放在项目外系统临时区，构建后删除 */
    stageDir?: string;
    /** 产物文件名（不含 .toolpkg），默认取项目根目录名 */
    outName?: string;
    /** 产物落盘目录（绝对路径），默认为项目根的上一级目录 */
    outDir?: string;
    /**
     * 额外强制打包的文件（相对项目根的路径，如 LICENSE、README.md）。
     * 这些文件不在 require 链上，会被原样复制进归档（不做重写）。
     */
    extraFiles?: string[];
    /**
     * PACKINFO：打包信息核对（写进归档根的 `PACKINFO`，YAML，供市场审核）。
     * 仅当 `enable === true` 时生成；否则不写该文件。
     * license / author / name / description 用于补 manifest 缺失的字段。
     */
    packinfo?: PackInfoOptions;
}

export interface BuildReport {
    ok: boolean;
    /** 阶段标记，便于定位失败点 */
    stage: string;
    message: string;
    /** 识别出的模式：ts / js */
    mode?: 'ts' | 'js';
    toolpkgPath?: string;
    fileCount?: number;
    bareNames?: string[];
    violations?: Array<{ from: string; name: string; reason: string }>;
    missing?: Array<{ from: string; name: string; reason: string }>;
    /** 额外文件注入结果（找到几个 / 缺失几个） */
    extraFiles?: { added: string[]; missing: string[] };
    /** 动态 require 记录（prefix 空=完全动态，会导致构建失败） */
    dynamicRequires?: Array<{ from: string; prefix: string; line: number }>;
    compileStdout?: string;
}

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

async function readText(path: string): Promise<string | null> {
    return readTextSafeAsync(path);
}
async function readBinaryBase64(path: string): Promise<string | null> {
    try {
        const bin = await Tools.Files.readBinary(path);
        if (bin && typeof bin.contentBase64 === 'string') return bin.contentBase64;
        return null;
    } catch (e) {
        return null;
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        const e = await Tools.Files.exists(path);
        return !!(e && e.exists);
    } catch (err) {
        return false;
    }
}



/** 递归探测目录下是否存在指定扩展名的文件 */
async function hasFileWithExt(dir: string, exts: string[], depth: number): Promise<boolean> {
    if (depth <= 0) return false;
    let listing: any;
    try {
        listing = await Tools.Files.list(dir);
    } catch (e) {
        return false;
    }
    const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
    for (const it of entries) {
        const name = it.name || it.fileName || '';
        if (!name) continue;
        const isDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
        if (isDir) {
            if (name === 'node_modules' || name.startsWith('.')) continue;
            if (await hasFileWithExt(join(dir, name), exts, depth - 1)) return true;
        } else {
            const lower = name.toLowerCase();
            for (const ext of exts) {
                if (lower.endsWith(ext)) return true;
            }
        }
    }
    return false;
}

/** 递归收集指定目录下所有匹配扩展名的文件（相对 rootDir 的归档内路径） */
async function listByExt(
    rootDir: string,
    rel: string,
    exts: string[],
    excludePrefixes: string[],
    out: string[]
): Promise<void> {
    const abs = rel ? join(rootDir, rel) : rootDir;
    let listing: any;
    try {
        listing = await Tools.Files.list(abs);
    } catch (e) {
        return;
    }
    const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
    for (const it of entries) {
        const name = it.name || it.fileName || '';
        if (!name) continue;
        const childRel = rel ? join(rel, name) : name;
        const isDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
        if (isDir) {
            await listByExt(rootDir, childRel, exts, excludePrefixes, out);
        } else {
            const lower = name.toLowerCase();
            for (const ext of exts) {
                if (lower.endsWith(ext)) { out.push(normalizePath(childRel)); break; }
            }
        }
    }
}


/**
 */
function detectNeededGlobals(files: Map<string, ArchiveFile>): string[] {
    const hit = new Set<string>();
    for (const [archivePath, f] of files) {
        if (hit.has('process') && hit.has('Buffer')) break;
        if (archivePath.indexOf('node_modules/') === 0) continue;
        const t = f.text || '';
        if (!t) continue;
        for (const name of scanGlobalRefs(t, ['process', 'Buffer'])) hit.add(name);
    }
    // 保持稳定顺序
    const needed: string[] = [];
    if (hit.has('process')) needed.push('process');
    if (hit.has('Buffer')) needed.push('Buffer');
    return needed;
}

/** 从 manifest 提取所有「可达种子」：main + 子包 entry + ui 模块 */
function collectManifestSeeds(manifest: any, mainArchive: string): string[] {
    const seeds: string[] = [mainArchive];
    const subs = manifest.subpackages || manifest.sub_packages || [];
    if (Array.isArray(subs)) {
        for (const s of subs) {
            if (s && typeof s.entry === 'string' && s.entry) {
                seeds.push(normalizePath(s.entry));
            }
        }
    }
    // manifest 里可能的 ui 模块声明
    const uiList = manifest.ui_modules || manifest.uiModules || manifest.screens;
    if (Array.isArray(uiList)) {
        for (const u of uiList) {
            if (typeof u === 'string' && u) seeds.push(normalizePath(u));
        }
    }
    return Array.from(new Set(seeds));
}

export async function runBuild(opts: BuildOptions): Promise<BuildReport> {
    const projectDir = opts.projectDir.replace(/\/+$/, '');
    const projectName = projectDir.slice(projectDir.lastIndexOf('/') + 1);
    const projectParent = projectDir.replace(/\/[^/]+$/, '');
    // 临时组装目录放在项目外（项目父目录下以点开头），构建后删除；项目内不留痕
    const stageDir = opts.stageDir || join(projectParent, '.opm_stage_' + projectName);

    // ---------- 1. manifest ----------
    const manifestPath = join(projectDir, 'manifest.json');
    const manifestText = await readText(manifestPath);
    if (manifestText === null) {
        return { ok: false, stage: 'manifest', message: '未找到 ' + manifestPath };
    }
    let manifest: any;
    try {
        manifest = JSON.parse(manifestText);
    } catch (e) {
        return { ok: false, stage: 'manifest', message: 'manifest.json 解析失败：' + String(e) };
    }
    const mainField = manifest.main || manifest.entry || 'main.js';
    const entryArchive = normalizePath(String(mainField));

    // ---------- 2. contract ----------
    // 先准备全局影子（node.operit 可能只在全局目录里）
    let shadowRoot: string | null = null;
    let shadowMsg = '';
    try {
        const shadow = await prepareGlobalShadow(projectDir);
        shadowRoot = shadow.shadowRoot;
        shadowMsg = shadow.message;
    } catch (e) {
        shadowMsg = '影子准备失败：' + String(e);
    }
    const depsRoots: string[] = [projectDir];
    if (shadowRoot) depsRoots.push(shadowRoot);

    let contract: NodeOperitContract;
    try {
        contract = await loadContract(projectDir, shadowRoot ? [shadowRoot] : undefined);
    } catch (e) {
        await cleanupGlobalShadow(projectDir);
        return { ok: false, stage: 'contract', message: String(e) };
    }

    // ---------- 3. 识别模式 ----------
    const hasTsconfig = await exists(join(projectDir, 'tsconfig.json'));
    const hasTsSrc = await hasFileWithExt(join(projectDir, 'src'), ['.ts', '.tsx'], 6);
    const mode: 'ts' | 'js' = (hasTsconfig || hasTsSrc) ? 'ts' : 'js';

    // ---------- 4. 编译（仅 TS 模式）----------
    const outDirRel = opts.outDirRel || '.opm_build';
    // 实际产物目录（compileProject 会优先采用 tsconfig 声明的 outDir）
    let effectiveOutDirRel = outDirRel;
    let compileStdout = '';
    if (mode === 'ts' && !opts.skipCompile) {
        const c = await compileProject({ projectDir: projectDir, outDirRel: outDirRel });
        effectiveOutDirRel = c.outDir || outDirRel;
        compileStdout = c.stdout;
        if (!c.ok) {
            return {
                ok: false, mode: mode, stage: 'compile',
                message: 'tsc 编译失败（exit=' + c.exitCode + '）',
                compileStdout: compileStdout
            };
        }
    } else if (mode === 'ts' && opts.skipCompile) {
        // 跳过编译时，仍尝试读 tsconfig 的 outDir 作为产物目录
        const tc = await readTsconfigOutDirSafe(projectDir);
        if (tc) effectiveOutDirRel = tc;
    }

    // 归档排除前缀：依赖目录 + 构建/暂存目录 + 全局影子目录
    const excludePrefixes = ['.opm_build', '.opm_stage', '.git', '.opm_verify', '.opm_global_modules'];

    // JS 模式：项目根下除 node_modules 外的所有 .js/.mjs/.cjs 都作为可达种子
    // （子包入口、UI 等可能不在 main 的 require 链上，必须主动收）
    let jsSeeds: string[] = [];
    if (mode === 'js') {
        await listByExt(projectDir, '', ['.js', '.mjs', '.cjs'], excludePrefixes.concat(['node_modules']), jsSeeds);
        jsSeeds = jsSeeds.filter(f => !f.startsWith('node_modules/') && !isExcludedShared(f, excludePrefixes));
    }

    // ---------- 5. 计算可达种子 ----------
    const artifactDirRel: string | null = (mode === 'ts') ? effectiveOutDirRel : null;

    const nodeOperitDistArchive = normalizePath(contract.installDir + '/' + contract.distDir);
    const globalsOpts = {
        nodeOperitDistArchive: nodeOperitDistArchive,
        entryArchivePath: entryArchive
    };

    const manifestSeeds = collectManifestSeeds(manifest, entryArchive);
    const baseSeeds: string[] = [];

    if (mode === 'js') {
        // JS 模式：全部工程 js 都当种子
        for (const s of jsSeeds) baseSeeds.push(s);
    } else {
        // TS 模式：子包入口 / ui 等 manifest 声明的种子
        for (const s of manifestSeeds) {
            if (s !== entryArchive) baseSeeds.push(s);
        }
    }

    // ---------- 6. 可达性（先跑一轮，不含 prelude） ----------
    let reachOpts: any = {
        localRoot: projectDir,
        artifactDirRel: artifactDirRel,
        depsRoot: projectDir,
        depsRoots: depsRoots,
        contract: contract,
        entryRel: entryArchive,
        extraEntries: baseSeeds,
        excludePrefixes: excludePrefixes
    };
    let reached;
    try {
        reached = await collectReachable(reachOpts);
    } catch (e) {
        await cleanupGlobalShadow(projectDir);
        return { ok: false, mode: mode, stage: 'reachability', message: String(e), compileStdout: compileStdout };
    }

    // ---------- 6.5 按需注入 process / Buffer ----------
    const neededGlobals = detectNeededGlobals(reached.files);
    let globalsPreview = { prelude: '', injectedPaths: [] as string[] };
    if (neededGlobals.length > 0) {
        globalsPreview = buildGlobalsPrelude(globalsOpts, neededGlobals);
        if (globalsPreview.injectedPaths.length > 0) {
            reachOpts = Object.assign({}, reachOpts, {
                extraEntries: baseSeeds.concat(globalsPreview.injectedPaths)
            });
            try {
                reached = await collectReachable(reachOpts);
            } catch (e) {
                await cleanupGlobalShadow(projectDir);
                return { ok: false, mode: mode, stage: 'reachability', message: String(e), compileStdout: compileStdout };
            }
        }
    }

    // ---------- 6.8 动态 require 拦截：完全动态（无静态前缀）无法确定收哪些文件 ----------
    const unresolvedDynamic = (reached.dynamicRequires || []).filter(d => !d.prefix);
    if (unresolvedDynamic.length > 0) {
        return {
            ok: false, mode: mode, stage: 'dynamic-require',
            message: '存在无法确定前缀的动态 require（无法定位目标目录），请改为显式路径：' +
                unresolvedDynamic.map(d => d.from + ':' + d.line).join(', '),
            dynamicRequires: reached.dynamicRequires,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }

    // ---------- 7. 契约拦截 ----------
    if (reached.violations.length > 0) {
        return {
            ok: false, mode: mode, stage: 'contract-check',
            message: '存在契约不允许的裸名（planned/unsupported），拒绝出包',
            violations: reached.violations,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }
    // JS 模式容忍少量「解析不到」的文件（工程里可能有非运行期文件）；
    // TS 模式仍严格（编译产物应完整）。
    if (reached.missing.length > 0 && mode === 'ts') {
        return {
            ok: false, mode: mode, stage: 'reachability',
            message: '存在无法解析的 require',
            missing: reached.missing,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }

    // ---------- 7.5 注入额外强制文件（LICENSE / README 等）----------
    const files = reached.files;
    const extraAdded: string[] = [];
    const extraMissing: string[] = [];
    const extraList = opts.extraFiles || [];
    for (const rawRel of extraList) {
        const rel = normalizePath(String(rawRel || '').replace(/^\.\//, '').replace(/\/+$/, ''));
        if (!rel) continue;
        if (isExcludedShared(rel, excludePrefixes)) {
            extraMissing.push(rel + '（命中排除前缀）');
            continue;
        }
        const expanded = await expandExtraEntry(projectDir, rel, excludePrefixes);
        if (expanded.length === 0) {
            extraMissing.push(rel + '（空目录）');
            continue;
        }
        for (const rel2 of expanded) {
            if (files.has(rel2)) { extraAdded.push(rel2); continue; }
            // 定位磁盘实体：项目根 -> 产物目录（ts 模式资源可能被 tsc 拷过去）
            let disk = join(projectDir, rel2);
            let exists0 = await exists(disk);
            if (!exists0 && artifactDirRel) {
                const alt = join(join(projectDir, artifactDirRel), rel2);
                if (await exists(alt)) { disk = alt; exists0 = true; }
            }
            if (!exists0) {
                extraMissing.push(rel2 + '（文件不存在）');
                continue;
            }
            // 按扩展名分流：文本白名单走 read，其余（图片/字体/wasm/二进制）走 readBinary。
            // 注意：Tools.Files.read 对二进制不抛异常，而是返回 "Failed to decode image file."
            // 之类的错误串——故不能只靠读失败判断，必须按扩展名 + 内容兜底双保险。
            const isTextExt = /\.(js|mjs|cjs|ts|tsx|jsx|json|json5|txt|md|markdown|html|htm|css|scss|less|xml|svg|yaml|yml|toml|ini|cfg|conf|csv|tsv|map|sh|bat|ps1|py|java|kt|c|h|cpp|hpp|go|rs|rb|php|sql|graphql|vue|svelte|env|gitignore|npmrc|editorconfig|license|readme)$/i.test(rel2);
            let content: string | null = null;
            if (isTextExt) content = await readText(disk);
            // 兜底：命中 read 的二进制错误串 -> 视为二进制
            if (content === 'Failed to decode image file.') content = null;
            if (content !== null) {
                files.set(rel2, { text: content, kind: 'extra' });
            } else {
                const b64 = await readBinaryBase64(disk);
                if (b64 === null) {
                    extraMissing.push(rel2 + '（读取失败）');
                    continue;
                }
                files.set(rel2, { text: '', binary: b64, kind: 'extra' });
            }
            extraAdded.push(rel2);
        }
    }

    // ---------- 7.6 PACKINFO（可选：市场审核信息核对）----------
    // 仅当 opts.packinfo.enable === true 时生成，写进归档根的 `PACKINFO`（YAML，无扩展名）。
    // 不列举 extra_files；dependencies 由归档里实际收进的 node_modules 包自动推导。
    let packinfoAdded = false;
    if (opts.packinfo && opts.packinfo.enable === true) {
        const packinfoText = renderPackInfo(
            manifest as Record<string, unknown>,
            opts.packinfo,
            files.keys()
        );
        if (packinfoText !== null) {
            files.set('PACKINFO', { text: packinfoText, kind: 'extra' });
            packinfoAdded = true;
        }
    }

    // ---------- 8. 注入全局 prelude 到入口（按需；无需要则不注入任何东西）----------
    const entryFile = files.get(entryArchive);
    if (!entryFile) {
        return {
            ok: false, mode: mode, stage: 'entry',
            message: '入口 ' + entryArchive + ' 不在可达集合里',
            compileStdout: compileStdout
        };
    }
    if (globalsPreview.prelude) {
        files.set(entryArchive, {
            text: globalsPreview.prelude + entryFile.text,
            kind: entryFile.kind
        });
    }

    // ---------- 9. 打包 ----------
    await cleanupGlobalShadow(projectDir);

    const pack = await packToolpkg({
        projectDir: projectDir,
        files: files,
        manifestText: manifestText,
        stageDir: stageDir,
        outName: opts.outName,
        outDir: opts.outDir
    });

    if (!pack.ok) {
        return {
            ok: false, mode: mode, stage: 'pack',
            message: pack.message,
            compileStdout: compileStdout
        };
    }

    return {
        ok: true,
        mode: mode,
        stage: 'done',
        message: '构建成功（' + mode + ' 模式）：' + pack.message + (shadowMsg ? '｜' + shadowMsg : '') +
                 (extraAdded.length ? '｜额外文件 +' + extraAdded.length : '') +
                 (extraMissing.length ? '｜额外文件缺失 ' + extraMissing.length : '') +
                 (packinfoAdded ? '｜PACKINFO' : ''),
        toolpkgPath: pack.toolpkgPath,
        fileCount: pack.fileCount,
        bareNames: reached.bareNames,
        extraFiles: { added: extraAdded, missing: extraMissing },
        dynamicRequires: reached.dynamicRequires,
        compileStdout: compileStdout
    };
}


/** 读 tsconfig 的 outDir（用于 skipCompile 时定位产物目录）；无则 null */
async function readTsconfigOutDirSafe(projectDir: string): Promise<string | null> {
    try {
        const r = await readTextSafeAsync(projectDir + '/tsconfig.json');
        if (typeof r !== 'string') return null;
        const j = parseTsconfigLoose(r);
        const co = (j && j.compilerOptions) || {};
        const od = co.outDir;
        if (typeof od !== 'string' || !od.trim()) return null;
        let t = od.trim();
        if (t.indexOf('./') === 0) t = t.slice(2);
        return t;
    } catch (e) {
        return null;
    }
}

/** 宽松解析 tsconfig：手工剥注释与尾逗号（不用正则，避开转义陷阱）。 */
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
            if (c === String.fromCharCode(92)) { out += (c2 || ''); i += 2; continue; }
            if (c === strQ) inStr = false;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'") { inStr = true; strQ = c; out += c; i += 1; continue; }
        if (c === '/' && c2 === '*') {
            i += 2;
            while (i < n && !(raw[i] === '*' && raw[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }
        if (c === '/' && c2 === '/') {
            i += 2;
            while (i < n && raw[i] !== String.fromCharCode(10)) i += 1;
            continue;
        }
        out += c;
        i += 1;
    }
    out = out.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(out);
}
