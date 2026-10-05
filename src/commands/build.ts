/**
 * build 命令：编译 TS -> 可达性重写 -> 注入全局 -> 打成 .toolpkg。
 *
 * 完整流程：
 *   1. 读 manifest.json（校验 main 字段；宽松模式可自动生成最小 manifest）
 *   2. 调 tsc 编译 src -> 临时目录
 *   3. 从 manifest.main 出发做可达性分析 + 裸名重写（resolver + rewriter）
 *   4. 注入 process/Buffer 全局 prelude 到入口
 *   5. 契约拦截（planned/unsupported）——有违规则拒绝出包
 *   6. 打包成 <项目根名>.toolpkg
 */

import { loadContract, NodeOperitContract } from '../build/contract';
import { compileProject } from '../build/compiler';
import { collectReachable, ArchiveFile } from '../build/reachability';
import { buildGlobalsPrelude, GLOBAL_SHIMS } from '../build/globals';
import { packToolpkg } from '../build/packer';
import { normalizePath } from '../build/rewriter';

export interface BuildOptions {
    /** 项目根目录（Android 侧绝对路径） */
    projectDir: string;
    /** 跳过编译（直接用已有的 dist 目录） */
    skipCompile?: boolean;
    /** 编译输出目录（相对项目根，默认 .opm_build） */
    outDirRel?: string;
    /** 直接打包的源码目录（skipCompile=true 时用；相对项目根），默认等于 outDirRel */
    srcDirRel?: string;
    /** 组装临时目录（绝对路径），默认 <projectDir>/.opm_stage */
    stageDir?: string;
    /** 产物文件名（不含 .toolpkg），默认取项目根目录名 */
    outName?: string;
}

export interface BuildReport {
    ok: boolean;
    /** 阶段标记，便于定位失败点 */
    stage: string;
    message: string;
    toolpkgPath?: string;
    fileCount?: number;
    bareNames?: string[];
    violations?: Array<{ from: string; name: string; reason: string }>;
    missing?: Array<{ from: string; name: string; reason: string }>;
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

/** 递归收集编译输出目录下所有 .js / .json 的相对路径 */
async function listOutputFiles(
    rootDir: string,
    rel: string,
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
            await listOutputFiles(rootDir, childRel, out);
        } else {
            if (/\.(js|json|mjs|cjs)$/i.test(name)) out.push(normalizePath(childRel));
        }
    }
}

export async function runBuild(opts: BuildOptions): Promise<BuildReport> {
    const projectDir = opts.projectDir.replace(/\/+$/, '');
    const outDirRel = opts.outDirRel || '.opm_build';
    const stageDir = opts.stageDir || join(projectDir, '.opm_stage');

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
    const entryRel = normalizePath(String(mainField));

    // ---------- 2. contract ----------
    let contract: NodeOperitContract;
    try {
        contract = await loadContract(projectDir);
    } catch (e) {
        return { ok: false, stage: 'contract', message: String(e) };
    }

    // ---------- 3. compile ----------
    let compileStdout = '';
    if (!opts.skipCompile) {
        const c = await compileProject({ projectDir: projectDir, outDirRel: outDirRel });
        compileStdout = c.stdout;
        if (!c.ok) {
            return {
                ok: false,
                stage: 'compile',
                message: 'tsc 编译失败（exit=' + c.exitCode + '）',
                compileStdout: compileStdout
            };
        }
    }

    // ---------- 4. 收集编译产物，构造可达性根 ----------
    // 编译产物在 <projectDir>/<outDirRel>；归档内路径与 outDirRel 对齐
    const srcRootRel = opts.srcDirRel || outDirRel;
    const compiledFiles: string[] = [];
    await listOutputFiles(join(projectDir, srcRootRel), '', compiledFiles);

    // build 阶段入口在归档内的路径：outDir 内容会直接成为归档根吗？
    // 设计：归档内布局 = 编译产物平铺到归档根（如 dist/index.js -> index.js）
    // 但更稳妥：保留编译产物的相对结构，entryRel 相对 srcRootRel
    // 这里采用「编译产物平铺到归档根」的约定：archivePath = 相对 srcRootRel 的路径
    // entryRel 在 manifest 里，通常形如 main.js（相对编译产物根）
    const entryArchive = normalizePath(entryRel);

    // 预读所有编译产物，建立「归档相对路径 -> 磁盘绝对路径」映射
    const diskToArchive = new Map<string, string>();
    const archiveText = new Map<string, string>();
    for (const rel of compiledFiles) {
        const text = await readText(join(projectDir, srcRootRel, rel));
        if (text === null) continue;
        archiveText.set(normalizePath(rel), text);
        diskToArchive.set(normalizePath(rel), join(projectDir, srcRootRel, rel));
    }

    // 先算 prelude 的注入路径（process / buffer），作为额外可达根传进去
    const nodeOperitDistArchive = normalizePath(
        contract.installDir + '/' + contract.distDir
    );
    const globalsPreview = buildGlobalsPrelude({
        nodeOperitDistArchive: nodeOperitDistArchive,
        entryArchivePath: entryArchive
    });

    // reachability 双根模型：
    //   localRoot = 编译产物根（本包内文件）
    //   depsRoot  = 项目根（node_modules / node.operit）
    const compileRoot = join(projectDir, srcRootRel);

    let reached;
    try {
        reached = await collectReachable({
            localRoot: compileRoot,
            depsRoot: projectDir,
            contract: contract,
            entryRel: entryArchive,
            extraEntries: globalsPreview.injectedPaths
        });
    } catch (e) {
        return { ok: false, stage: 'reachability', message: String(e), compileStdout: compileStdout };
    }

    // ---------- 5. 契约拦截 ----------
    const violations = reached.violations.slice();
    if (violations.length > 0) {
        return {
            ok: false,
            stage: 'contract-check',
            message: '存在契约不允许的裸名（planned/unsupported），拒绝出包',
            violations: violations,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }
    if (reached.missing.length > 0) {
        return {
            ok: false,
            stage: 'reachability',
            message: '存在无法解析的 require',
            missing: reached.missing,
            bareNames: reached.bareNames,
            compileStdout: compileStdout
        };
    }

    // ---------- 6. 注入全局 prelude 到入口 ----------
    const files = reached.files;
    const entryFile = files.get(entryArchive);
    if (!entryFile) {
        return {
            ok: false,
            stage: 'entry',
            message: '入口 ' + entryArchive + ' 不在可达集合里',
            compileStdout: compileStdout
        };
    }
    // 复用前面已算好的 prelude
    const globals = globalsPreview;
    // 把 prelude 拼到入口最前
    files.set(entryArchive, {
        text: globals.prelude + entryFile.text,
        kind: entryFile.kind
    });

    // 确保 process / buffer 在归档里（prelude 会 require 它们）——已由可达性覆盖（若被引用）
    // 若未被引用，prelude 的 require 会失败，但那两个 try/catch 兜住了，不致命。

    // ---------- 7. 打包 ----------
    const pack = await packToolpkg({
        projectDir: projectDir,
        files: files,
        manifestText: manifestText,
        stageDir: stageDir,
        outName: opts.outName
    });

    if (!pack.ok) {
        return {
            ok: false,
            stage: 'pack',
            message: pack.message,
            compileStdout: compileStdout
        };
    }

    return {
        ok: true,
        stage: 'done',
        message: '构建成功：' + pack.message,
        toolpkgPath: pack.toolpkgPath,
        fileCount: pack.fileCount,
        bareNames: reached.bareNames,
        compileStdout: compileStdout
    };
}