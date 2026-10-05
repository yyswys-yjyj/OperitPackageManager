/**
 * verify 命令：只校验不打包。
 * 做两件事：
 *   1. 契约拦截（planned/unsupported 裸名）
 *   2. 可达性 + 重写是否能全部解析（missing）
 *
 * 输入项目根目录（需已编译，或先编译）。
 */

import { loadContract, NodeOperitContract } from '../build/contract';
import { compileProject } from '../build/compiler';
import { collectReachable } from '../build/reachability';
import { normalizePath } from '../build/rewriter';

export interface VerifyOptions {
    projectDir: string;
    skipCompile?: boolean;
    outDirRel?: string;
    srcDirRel?: string;
}

export interface VerifyReport {
    ok: boolean;
    stage: string;
    message: string;
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

async function listOutputFiles(rootDir: string, rel: string, out: string[]): Promise<void> {
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
        if (isDir) await listOutputFiles(rootDir, childRel, out);
        else if (/\.(js|json|mjs|cjs)$/i.test(name)) out.push(normalizePath(childRel));
    }
}

export async function runVerify(opts: VerifyOptions): Promise<VerifyReport> {
    const projectDir = opts.projectDir.replace(/\/+$/, '');
    const outDirRel = opts.outDirRel || '.opm_build';
    const srcRootRel = opts.srcDirRel || outDirRel;

    const manifestText = await readText(join(projectDir, 'manifest.json'));
    if (manifestText === null) {
        return { ok: false, stage: 'manifest', message: '未找到 manifest.json' };
    }
    let manifest: any;
    try { manifest = JSON.parse(manifestText); }
    catch (e) { return { ok: false, stage: 'manifest', message: 'manifest.json 解析失败：' + String(e) }; }
    const entryArchive = normalizePath(String(manifest.main || manifest.entry || 'main.js'));

    let contract: NodeOperitContract;
    try { contract = await loadContract(projectDir); }
    catch (e) { return { ok: false, stage: 'contract', message: String(e) }; }

    let compileStdout = '';
    if (!opts.skipCompile) {
        const c = await compileProject({ projectDir: projectDir, outDirRel: outDirRel });
        compileStdout = c.stdout;
        if (!c.ok) {
            return { ok: false, stage: 'compile', message: 'tsc 编译失败', compileStdout: compileStdout };
        }
    }

    const compileRoot = join(projectDir, srcRootRel);
    let reached;
    try {
        reached = await collectReachable({
            localRoot: compileRoot,
            depsRoot: projectDir,
            contract: contract,
            entryRel: entryArchive
        });
    } catch (e) {
        return { ok: false, stage: 'reachability', message: String(e), compileStdout: compileStdout };
    }

    if (reached.violations.length > 0) {
        return {
            ok: false,
            stage: 'contract-check',
            message: '存在契约不允许的裸名（planned/unsupported）',
            violations: reached.violations,
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

    return {
        ok: true,
        stage: 'done',
        message: '校验通过：' + reached.files.size + ' 个文件可达，' +
                 reached.bareNames.length + ' 个裸名全部可解析。',
        bareNames: reached.bareNames,
        compileStdout: compileStdout
    };
}