/**
 * verify 命令：只校验不打包。
 *
 * 与 build 共用同一套「模式识别 + 可达种子」逻辑：
 *   ── TS 模式：编译（可选）+ 可达性 + 契约拦截
 *   ── JS 模式：跳过编译，产物根=项目根，全部工程 js 作为种子
 * 只是不压缩、不产出 .toolpkg。
 */

import { loadContract, NodeOperitContract } from '../build/contract';
import { compileProject } from '../build/compiler';
import { collectReachable } from '../build/reachability';
import { normalizePath } from '../build/rewriter';
import { prepareGlobalShadow, cleanupGlobalShadow } from '../build/globalshadow';
import { isExcluded as isExcludedShared, expandExtraEntry } from '../build/extrafiles';
import { readTsconfigOutDir, normalizeEntryRel } from '../build/entrypath';

export interface VerifyOptions {
    projectDir: string;
    skipCompile?: boolean;
    outDirRel?: string;
    /** 额外强制打包的文件（相对项目根路径），用于校验它们是否存在 */
    extraFiles?: string[];
}

export interface VerifyReport {
    ok: boolean;
    stage: string;
    message: string;
    mode?: 'ts' | 'js';
    bareNames?: string[];
    violations?: Array<{ from: string; name: string; reason: string }>;
    missing?: Array<{ from: string; name: string; reason: string }>;
    extraFiles?: { added: string[]; missing: string[] };
    compileStdout?: string;
}

function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return a.endsWith('/') ? a + b : a + '/' + b;
}

async function readText(path: string): Promise<string | null> {
    try {
        const r = await Tools.Files.read(path);
        return r && typeof r.content === 'string' ? r.content : null;
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

async function hasFileWithExt(dir: string, exts: string[], depth: number): Promise<boolean> {
    if (depth <= 0) return false;
    let listing: any;
    try { listing = await Tools.Files.list(dir); } catch (e) { return false; }
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
            for (const ext of exts) if (lower.endsWith(ext)) return true;
        }
    }
    return false;
}

async function listByExt(rootDir: string, rel: string, exts: string[], out: string[]): Promise<void> {
    const abs = rel ? join(rootDir, rel) : rootDir;
    let listing: any;
    try { listing = await Tools.Files.list(abs); } catch (e) { return; }
    const entries = (listing && (listing.files || listing.entries || listing.children)) || [];
    for (const it of entries) {
        const name = it.name || it.fileName || '';
        if (!name) continue;
        const childRel = rel ? join(rel, name) : name;
        const isDir = it.isDirectory === true || it.type === 'directory' || it.directory === true;
        if (isDir) {
            // 跳过依赖与隐藏/构建目录
            if (name === 'node_modules' || name.startsWith('.')) continue;
            await listByExt(rootDir, childRel, exts, out);
        } else {
            const lower = name.toLowerCase();
            for (const ext of exts) {
                if (lower.endsWith(ext)) { out.push(normalizePath(childRel)); break; }
            }
        }
    }
}


/** 从 manifest 提取可达种子：main + 子包 entry + ui 模块声明 */
function collectManifestSeeds(manifest: any, mainArchive: string): string[] {
    const seeds: string[] = [mainArchive];
    const subs = manifest.subpackages || manifest.sub_packages || [];
    if (Array.isArray(subs)) {
        for (const s of subs) {
            if (s && typeof s.entry === 'string' && s.entry) seeds.push(normalizePath(s.entry));
        }
    }
    const uiList = manifest.ui_modules || manifest.uiModules || manifest.screens;
    if (Array.isArray(uiList)) {
        for (const u of uiList) if (typeof u === 'string' && u) seeds.push(normalizePath(u));
    }
    return Array.from(new Set(seeds));
}

export async function runVerify(opts: VerifyOptions): Promise<VerifyReport> {
    const projectDir = opts.projectDir.replace(/\/+$/, '');
    const outDirRel = opts.outDirRel || '.opm_build';

    const manifestText = await readText(join(projectDir, 'manifest.json'));
    if (manifestText === null) {
        return { ok: false, stage: 'manifest', message: '未找到 manifest.json' };
    }
    let manifest: any;
    try { manifest = JSON.parse(manifestText); }
    catch (e) { return { ok: false, stage: 'manifest', message: 'manifest.json 解析失败：' + String(e) }; }
    const entryRaw = normalizePath(String(manifest.main || manifest.entry || 'main.js'));
    let entryArchive = entryRaw;

    // 影子全局目录：node.operit / 依赖可能只在 npm 全局目录里（放 tmp，不污染项目）
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
    try { contract = await loadContract(projectDir, shadowRoot ? [shadowRoot] : undefined); }
    catch (e) { await cleanupGlobalShadow(projectDir); return { ok: false, stage: 'contract', message: String(e) }; }

    // ---- 模式识别 ----
    const hasTsconfig = await exists(join(projectDir, 'tsconfig.json'));
    const hasTsSrc = await hasFileWithExt(join(projectDir, 'src'), ['.ts', '.tsx'], 6);
    const mode: 'ts' | 'js' = (hasTsconfig || hasTsSrc) ? 'ts' : 'js';

    // ---- 编译（仅 TS） ----
    let compileStdout = '';
    if (mode === 'ts' && !opts.skipCompile) {
        const c = await compileProject({ projectDir: projectDir, outDirRel: outDirRel });
        compileStdout = c.stdout;
        if (!c.ok) {
            return { ok: false, mode: mode, stage: 'compile', message: 'tsc 编译失败', compileStdout: compileStdout };
        }
    }

    const excludePrefixes = ['.opm_build', '.opm_stage', '.git', '.opm_verify'];
    const compileRoot = mode === 'ts' ? join(projectDir, outDirRel) : projectDir;

    // 入口路径归一化：manifest 里是「相对项目根」，归档里要的是「相对产物根」
    const tsOutDir = mode === 'ts' ? await readTsconfigOutDir(projectDir) : null;
    if (mode === 'ts') {
        entryArchive = await normalizeEntryRel(entryRaw, compileRoot, tsOutDir);
    }

    // ---- 种子 ----
    const extraSeeds: string[] = [];
    if (mode === 'js') {
        const jsSeeds: string[] = [];
        await listByExt(projectDir, '', ['.js', '.mjs', '.cjs'], jsSeeds);
        for (const s of jsSeeds) {
            if (!isExcludedShared(s, excludePrefixes) && !s.startsWith('node_modules/')) extraSeeds.push(s);
        }
    } else {
        for (const s of collectManifestSeeds(manifest, entryArchive)) {
            const rs = (s === entryArchive) ? s : await normalizeEntryRel(s, compileRoot, tsOutDir);
            if (rs !== entryArchive) extraSeeds.push(rs);
        }
    }

    let reached;
    try {
        reached = await collectReachable({
            localRoot: compileRoot,
            depsRoot: projectDir,
            depsRoots: depsRoots,
            contract: contract,
            entryRel: entryArchive,
            extraEntries: extraSeeds,
            excludePrefixes: excludePrefixes
        });
    } catch (e) {
        await cleanupGlobalShadow(projectDir);
        return { ok: false, mode: mode, stage: 'reachability', message: String(e), compileStdout: compileStdout };
    }
    await cleanupGlobalShadow(projectDir);

    if (reached.violations.length > 0) {
        return {
            ok: false, mode: mode, stage: 'contract-check',
            message: '存在契约不允许的裸名（planned/unsupported）',
            violations: reached.violations,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }
    // TS 严格；JS 容忍非运行期文件
    if (reached.missing.length > 0 && mode === 'ts') {
        return {
            ok: false, mode: mode, stage: 'reachability',
            message: '存在无法解析的 require',
            missing: reached.missing,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }

    // 额外文件校验（存在性 + 是否被排除）
    const extraAdded: string[] = [];
    const extraMissing: string[] = [];
    for (const rawRel of (opts.extraFiles || [])) {
        const rel = normalizePath(String(rawRel || '').replace(/^\.\//, '').replace(/\/+$/, ''));
        if (!rel) continue;
        if (isExcludedShared(rel, excludePrefixes)) { extraMissing.push(rel + '（命中排除前缀）'); continue; }
        // 目录 -> 递归展开；文件 -> 原样
        const expanded = await expandExtraEntry(projectDir, rel, excludePrefixes);
        if (expanded.length === 0) { extraMissing.push(rel + '（空目录）'); continue; }
        for (const rel2 of expanded) {
            if (reached.files.has(rel2)) { extraAdded.push(rel2); continue; }
            let okExist = false;
            try {
                const e1 = await Tools.Files.exists(join(compileRoot, rel2));
                const e2 = await Tools.Files.exists(join(projectDir, rel2));
                okExist = !!(e1 && e1.exists) || !!(e2 && e2.exists);
            } catch (e) { okExist = false; }
            if (okExist) extraAdded.push(rel2); else extraMissing.push(rel2 + '（文件不存在）');
        }
    }

    return {
        ok: true,
        mode: mode,
        stage: 'done',
        message: '校验通过（' + mode + ' 模式）：' + reached.files.size + ' 个文件可达，' +
                 reached.bareNames.length + ' 个裸名全部可解析。' +
                 (extraAdded.length ? '｜额外文件 ' + extraAdded.length + ' 个可用' : '') +
                 (extraMissing.length ? '｜额外文件缺失 ' + extraMissing.length : ''),
        bareNames: reached.bareNames,
        extraFiles: { added: extraAdded, missing: extraMissing },
        compileStdout: compileStdout
    };
}