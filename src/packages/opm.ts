/*
METADATA
{
    "name": "opm",
    "description": {
        "zh": "【开发工具】适用于 Operit 开发工程的类 npm 包管理工具，提供 init / search / install / remove / manager 五个工具",
        "en": "[Development Tools] A npm-like package management tool for Operit development projects, offering five commands: init, search, install, remove, and manager"
    },
    "enabledByDefault": true,
    "env": [],
    "tools": [
        {
            "name": "init",
            "description": {
                "zh": "在目标项目根目录初始化 npm 工程：生成 package.json、.npmrc（指向私有源），并自动安装 node.operit 运行时补丁包。",
                "en": "Initialize an npm project in the target directory: create package.json, .npmrc (pointing at the private registry), and auto-install the node.operit runtime shim."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径，例如 /sdcard/Download/myproj", "en": "Absolute path of the project root" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "name",
                    "description": { "zh": "package.json 里的包名（可选）", "en": "Package name for package.json (optional)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "version",
                    "description": { "zh": "初始版本号，默认 1.0.0", "en": "Initial version, default 1.0.0" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "registry",
                    "description": { "zh": "自定义 registry 源（可选，默认辰锤私有源）", "en": "Custom registry URL (optional)" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "search",
            "description": {
                "zh": "在 registry 中搜索包。可按关键词过滤，返回包名/版本/描述。",
                "en": "Search packages in the registry by keyword."
            },
            "parameters": [
                {
                    "name": "keyword",
                    "description": { "zh": "搜索关键词（可选，留空返回全部）", "en": "Search keyword (optional)" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "install",
            "description": {
                "zh": "安装包并处理依赖。可传包名列表（如 lodash 或 @scope/pkg@^1.0.0）；不传参数则按项目 package.json 安装全部依赖。会写入 node_modules 与 package-lock.json。",
                "en": "Install packages and resolve dependencies. Pass package specs, or omit to install everything from package.json. Writes node_modules and package-lock.json."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径", "en": "Absolute project root path" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "packages",
                    "description": { "zh": "要安装的包规格，多个用空格或逗号分隔（可选）", "en": "Package specs, space/comma separated (optional)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "save",
                    "description": { "zh": "是否写入 package.json 的 dependencies，默认 true", "en": "Write to package.json dependencies, default true" },
                    "type": "boolean",
                    "required": false
                }
            ]
        },
        {
            "name": "remove",
            "description": {
                "zh": "卸载包：从 node_modules 删除目录，并从 package.json 依赖与 package-lock.json 中清理。",
                "en": "Remove packages: delete from node_modules and clean up package.json / package-lock.json."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径", "en": "Absolute project root path" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "packages",
                    "description": { "zh": "要卸载的包名，多个用空格或逗号分隔", "en": "Package names, space/comma separated" },
                    "type": "string",
                    "required": true
                }
            ]
        },
        {
            "name": "manager",
            "description": {
                "zh": "管理你自己发布的包（需配置辰锤 API token）。action 支持：list（列出我的软件包）、info（查看包详情/npm 信息）、publish（同步到市场）、create-npm（新建 npm 包）。",
                "en": "Manage your own published packages (requires Chenchui API token). Actions: list, info, publish, create-npm."
            },
            "parameters": [
                {
                    "name": "action",
                    "description": { "zh": "操作：list / info / publish / create-npm", "en": "Action: list / info / publish / create-npm" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "package_id",
                    "description": { "zh": "软件包 PackageID（info/publish/create-npm 用）", "en": "Software package PackageID" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "id",
                    "description": { "zh": "软件包数字 ID（可选，优先于 package_id）", "en": "Numeric package id (optional)" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "npm_name",
                    "description": { "zh": "npm 包名（create-npm 用），可含 @scope", "en": "npm package name (create-npm)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_version",
                    "description": { "zh": "npm 版本（create-npm 用）", "en": "npm version (create-npm)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "status",
                    "description": { "zh": "list 的状态过滤：draft/reviewing/pending/approved/unsupported/rejected", "en": "Status filter for list" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "build",
            "description": {
                "zh": "【何时用】当你要把「一个用 TypeScript 写的 Operit 工程」变成一个「可以直接烧录/分发的 .toolpkg」时用。典型场景：用户说『把这个项目打包』『编译出包』『build 一下』，或你在写完一个 toolpkg 工程源码后要产出发布物。\n\n【前提条件（缺一不可，否则报错并停在对应阶段）】\n1) 项目根目录下必须有 manifest.json（含 main 字段，如 \"main\":\"main.js\"）；\n2) 项目里必须已安装 @serveryyswys/node.operit（即存在 node_modules/@serveryyswys/node.operit/BUILTINS.json）——这是构建期唯一事实来源，没有它会直接失败并提示先执行 init / install；\n3) 若 tsconfig.json 存在则用它编译（输出目录被强制覆盖为 .opm_build）；若没有 tsconfig.json，则自动以 src 目录下所有 .ts 全量编译。\n\n【它做了什么（全自动，无需手动 tsc/改路径）】\n1. 调 tsc 把 TS 编译成 JS（输出到 .opm_build/）；\n2. 从 manifest.main 出发做「可达性分析」：只顺着 require 链收集真正被引用到的文件，未被引用的源码不会进包；\n3. 把所有「裸名 require」重写为归档内显式 .js 相对路径——node 内建（如 node:fs）映射到 node.operit 的子文件，npm 包（如 lodash 的第三方包）映射到它在 node_modules 里的入口；唯独 lodash/uuid/axios 三个被 operit 内置、保持原样；\n4. 若契约里某个被引用的内建是 planned/unsupported，构建失败（防止打出跑不起来的包）；\n5. 在入口注入 process/Buffer 全局（因为 operit 运行时不提供这两个全局）；\n6. 只打包「被引用到的」node_modules，压成 <项目根目录名>.toolpkg（放在项目根的上一级目录）。\n\n【产物】toolpkg_path 给出 .toolpkg 绝对路径；data 里还返回 file_count / bare_names / violations / missing，便于核对。\n\n【失败时怎么看】message 会拼上失败阶段（stage）与原因：\n- stage=manifest：没找到/解析不了 manifest.json；\n- stage=contract：没装 node.operit；\n- stage=compile：tsc 编译报错，看 data.compile_stdout；\n- stage=contract-check：有 planned/unsupported 内建，看 data.violations；\n- stage=reachability：有 require 解析不出来，看 data.missing；\n- stage=pack：压缩失败。\n排查完可用 verify 先干跑一遍，不产包。\n\n【与 verify 的分工】build = verify 的全部校验 + 编译 + 打包；只想检查合法性、不想产出文件时用 verify。",
                "en": "WHEN TO USE: when you need to turn a TypeScript-based Operit project into a flashable/distributable .toolpkg. Typical: user says 'pack this project' / 'build it', or you just finished writing toolpkg source and need a release artifact.\n\nPREREQUISITES (all required; otherwise it errors and stops at the matching stage):\n1) manifest.json in the project root with a 'main' field (e.g. \"main\":\"main.js\");\n2) @serveryyswys/node.operit installed in the project (node_modules/@serveryyswys/node.operit/BUILTINS.json) — this is the single source of truth for the build; missing it fails immediately with a hint to run init/install first;\n3) if tsconfig.json exists it is used (outDir overridden to .opm_build); if not, all .ts under src/ is compiled wholesale.\n\nWHAT IT DOES (fully automatic; no manual tsc or path editing):\n1. compiles TS to JS via tsc into .opm_build/;\n2. reachability analysis from manifest.main: only files actually required are collected; unreferenced sources are excluded;\n3. rewrites every BARE require into an explicit archive-relative .js path — node builtins (e.g. node:fs) map into node.operit subfiles, third-party npm packages map to their node_modules entry; only lodash/uuid/axios are kept as-is (operit provides them);\n4. if any referenced builtin is planned/unsupported per the contract, the build FAILS (prevents shipping a broken package);\n5. injects process/Buffer globals at the entry (operit runtime lacks them);\n6. packs ONLY referenced node_modules and zips into <projectRootFolder>.toolpkg (written to the parent of the project root).\n\nOUTPUT: toolpkg_path gives the absolute .toolpkg path; data also returns file_count / bare_names / violations / missing.\n\nON FAILURE: message includes the failing stage: manifest | contract | compile (see data.compile_stdout) | contract-check (see data.violations) | reachability (see data.missing) | pack. Use verify to dry-run without producing a package.\n\nVS verify: build = all of verify's checks + compile + pack; use verify when you only want to validate without producing files."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录的绝对路径。必须含 manifest.json（带 main 字段），且已安装 node.operit（node_modules/@serveryyswys/node.operit）。例：/sdcard/Download/myproj", "en": "Absolute path of the project root. Must contain manifest.json (with main) and have node.operit installed. e.g. /sdcard/Download/myproj" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "skip_compile",
                    "description": { "zh": "可选，默认 false。传 true 跳过 tsc，直接用已有的 .opm_build/ 编译产物（用于调试或源码已手动编好时）。注意：此时需确保 .opm_build/ 内容是最新的。", "en": "Optional, default false. If true, skip tsc and reuse the existing .opm_build/ output (for debugging or when sources were compiled manually). Ensure .opm_build/ is up to date." },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "out_name",
                    "description": { "zh": "可选。产物文件名（不含 .toolpkg 后缀），默认取项目根目录名。例：传 \"myproj\" 得到 myproj.toolpkg。", "en": "Optional. Output file name without the .toolpkg suffix; defaults to the project root folder name." },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "verify",
            "description": {
                "zh": "【何时用】出包前的「干跑校验」：想确认一个工程能否被打包、有没有解析不出来的依赖，但不想真的产出文件时用它。也用于 build 失败后的定位（它只跑校验阶段，报告更清晰）。典型场景：用户说『检查一下能不能打包』『为什么打包失败』，或你在 build 之前先自查。\n\n【前提条件】与 build 相同：需要 manifest.json（含 main）+ 已安装 node.operit。\n\n【它做了什么】编译（可选，同 build）+ 可达性分析 + 裸名重写解析 + 契约拦截，但**不压缩、不产出 .toolpkg**。与 build 共用全部前置校验逻辑，因此「verify 通过」基本等价于「build 只差最后打包那一步」。\n\n【返回】data 里给出 bare_names（扫到的所有裸名）、violations（planned/unsupported 违规）、missing（解析不出的 require）；成功时 message 报告可达文件数与裸名数。\n\n【失败时怎么看】stage 含义同 build：manifest / contract / compile / contract-check（看 violations）/ reachability（看 missing）。\n\n【与 build 的分工】只想校验不产包 → verify；要产出 .toolpkg → build。",
                "en": "WHEN TO USE: a dry-run validation before packaging — to confirm a project can be built and that no dependency fails to resolve, WITHOUT producing files. Also use it to diagnose a failed build (it runs only the check stages and reports more cleanly). Typical: user asks 'can this be packed?' / 'why did the build fail?', or you self-check before build.\n\nPREREQUISITES: same as build — manifest.json (with main) + node.operit installed.\n\nWHAT IT DOES: compile (optional, same as build) + reachability + bare-name resolution + contract checks, but does NOT zip and does NOT produce a .toolpkg. It shares all of build's validation logic, so a passing verify is essentially a build that only lacks the final pack step.\n\nOUTPUT: data gives bare_names, violations (planned/unsupported), missing (unresolvable requires); on success message reports reachable file count and bare-name count.\n\nON FAILURE: same stage meanings as build: manifest | contract | compile | contract-check (see violations) | reachability (see missing).\n\nVS build: validate only -> verify; produce a .toolpkg -> build."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录的绝对路径（需含 manifest.json，且已安装 node.operit）。", "en": "Absolute path of the project root (needs manifest.json and node.operit installed)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "skip_compile",
                    "description": { "zh": "可选，默认 false。传 true 跳过 tsc，直接用已有的 .opm_build/ 编译产物。", "en": "Optional, default false. If true, skip tsc and reuse the existing .opm_build/ output." },
                    "type": "boolean",
                    "required": false
                }
            ]
        }
    ]
}
*/

import * as path from '../core/locker.js';
import { saveConfig, loadConfig, DEFAULT_REGISTRY } from '../core/config.js';
import { fetchCatalog, fetchDoc, parseSpec, resolveVersion, registryBase } from '../core/registry.js';
import { resolveDependencies } from '../core/resolver.js';
import { installResolved, installFromLock, writeLockFromResolved } from '../core/installer.js';
import {
    readPackageJson, writePackageJson, readLockfile, writeLockfile, emptyLockfile,
    nodeModulesDir, join
} from '../core/locker.js';
import * as chen from '../core/chenchui.js';
import { runBuild } from '../commands/build.js';
import { runVerify } from '../commands/verify.js';

declare const Tools: any;
declare const Java: any;
declare function complete(v: any): void;

function ok(data: any, message?: string): any {
    return { success: true, message: message || 'ok', data: data };
}
function fail(message: string, data?: any): any {
    return { success: false, message: message, data: data };
}

function splitList(s: string): string[] {
    if (!s) return [];
    return String(s).split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
}

// =============== init ===============

async function doInit(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');

    const cfg = await loadConfig();
    const registry = params.registry || cfg.registry || DEFAULT_REGISTRY;

    // 1) 确保目录存在
    await Tools.Files.mkdir(projectDir, true);

    // 2) 写 .npmrc
    const npmrc = 'registry=' + registry + '\n';
    await Tools.Files.write(join(projectDir, '.npmrc'), npmrc);

    // 3) 写 package.json（已存在则保留）
    let pj = await readPackageJson(projectDir);
    let created = false;
    if (!pj) {
        pj = {
            name: params.name || basename(projectDir) || 'opm-project',
            version: params.version || '1.0.0',
            description: '',
            main: 'index.js',
            scripts: {},
            dependencies: {}
        };
        await writePackageJson(projectDir, pj);
        created = true;
    }

    // 4) 自动安装 node.operit 运行时补丁
    let runtimeResult: any = null;
    if (cfg.autoInstallRuntime !== false && cfg.runtimePackage) {
        try {
            const spec = cfg.runtimePackage;
            const { name, range } = parseSpec(spec);
            const doc = await fetchDoc(name, registry);
            const ver = resolveVersion(doc, range);
            if (ver) {
                const resolved = {
                    nodes: {
                        [name]: { name: name, version: ver.version, versionInfo: ver, deps: ver.dependencies || {}, isRoot: true }
                    },
                    warnings: []
                };
                const report = await installResolved(projectDir, resolved as any);
                // 写入依赖
                if (!pj.dependencies) pj.dependencies = {};
                pj.dependencies[name] = '^' + ver.version;
                await writePackageJson(projectDir, pj);
                await writeLockFromResolved(projectDir, resolved as any);
                runtimeResult = { name: name, version: ver.version, installed: report.installed.length > 0, report: report };
            } else {
                runtimeResult = { error: '找不到 ' + spec };
            }
        } catch (e) {
            runtimeResult = { error: String(e) };
        }
    }

    return ok({
        project_dir: projectDir,
        created_package_json: created,
        npmrc: npmrc.trim(),
        registry: registry,
        runtime: runtimeResult
    }, 'init 完成');
}

function basename(p: string): string {
    const parts = String(p).replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || '';
}

// =============== search ===============

async function doSearch(params: any): Promise<any> {
    const keyword = (params.keyword || '').trim().toLowerCase();
    let catalog: any[];
    try {
        catalog = await fetchCatalog();
    } catch (e) {
        return fail('搜索失败：' + String(e));
    }
    let results = catalog;
    if (keyword) {
        results = catalog.filter(p =>
            p.name.toLowerCase().indexOf(keyword) >= 0 ||
            (p.description || '').toLowerCase().indexOf(keyword) >= 0
        );
    }
    return ok({ count: results.length, results: results }, '找到 ' + results.length + ' 个包');
}

// =============== install ===============

async function doInstall(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');
    const save = params.save !== false;

    const specs: string[] = splitList(params.packages || '');
    let pj = await readPackageJson(projectDir);

    // 无参数：按 package.json 安装（含 lock 复装）
    const rootDeps: Record<string, string> = {};

    if (specs.length === 0) {
        if (!pj) return fail('项目没有 package.json，且未指定要安装的包');
        const deps = pj.dependencies || {};
        const devDeps = pj.devDependencies || {};
        Object.assign(rootDeps, devDeps, deps);
        if (Object.keys(rootDeps).length === 0) {
            return ok({ installed: [], message: '没有依赖需要安装' }, '无依赖');
        }
    } else {
        // 解析每个 spec 的 range（暂不预先拉 doc，交给 resolver）
        for (const s of specs) {
            const { name, range } = parseSpec(s);
            rootDeps[name] = range || 'latest';
        }
    }

    // 解析
    let resolved;
    try {
        resolved = await resolveDependencies(rootDeps, undefined, (m) => { /* progress */ });
    } catch (e) {
        return fail('依赖解析失败：' + String(e));
    }

    // 安装
    const report = await installResolved(projectDir, resolved);
    // 写 lock
    await writeLockFromResolved(projectDir, resolved);

    // 更新 package.json
    if (save && specs.length > 0) {
        if (!pj) {
            pj = { name: basename(projectDir) || 'opm-project', version: '1.0.0', dependencies: {} };
        }
        if (!pj.dependencies) pj.dependencies = {};
        for (const name of Object.keys(resolved.nodes)) {
            const node = resolved.nodes[name];
            if (node.isRoot) {
                pj.dependencies[name] = '^' + node.version;
            }
        }
        await writePackageJson(projectDir, pj);
    }

    return ok({
        installed: report.installed,
        skipped: report.skipped,
        warnings: report.warnings,
        total: report.installed.length
    }, '安装完成：成功 ' + report.installed.length + '，失败 ' + report.skipped.length);
}

// =============== remove ===============

async function doRemove(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');
    const names = splitList(params.packages || '');
    if (names.length === 0) return fail('缺少 packages');

    const removed: string[] = [];
    const notFound: string[] = [];

    for (const name of names) {
        const dir = join(nodeModulesDir(projectDir), name);
        try {
            const ex = await Tools.Files.exists(dir);
            if (ex && ex.exists) {
                await Tools.Files.deleteFile(dir, true);
                removed.push(name);
            } else {
                notFound.push(name);
            }
        } catch (e) {
            notFound.push(name);
        }
    }

    // 清理 package.json
    const pj = await readPackageJson(projectDir);
    if (pj) {
        for (const name of names) {
            if (pj.dependencies) delete pj.dependencies[name];
            if (pj.devDependencies) delete pj.devDependencies[name];
        }
        await writePackageJson(projectDir, pj);
    }

    // 清理 lockfile
    const lock = await readLockfile(projectDir);
    if (lock && lock.packages) {
        for (const name of names) {
            delete lock.packages['node_modules/' + name];
        }
        await writeLockfile(projectDir, lock);
    }

    return ok({ removed: removed, not_found: notFound }, '卸载完成：移除 ' + removed.length + ' 个');
}

// =============== manager ===============

async function doManager(params: any): Promise<any> {
    const action = (params.action || '').trim();
    if (!action) return fail('缺少 action');
    const locator: any = {};
    if (params.id !== undefined && params.id !== null) locator.id = params.id;
    if (params.package_id) locator.package_id = params.package_id;

    try {
        if (action === 'list') {
            const r = await chen.listPackages(params.status);
            return wrapChen(r);
        }
        if (action === 'info') {
            if (Object.keys(locator).length === 0) return fail('info 需要 package_id 或 id');
            const pkg = await chen.getPackage(locator);
            const npm = await chen.getNpm(locator);
            return ok({ package: pkg.data, npm: npm.data }, '查询完成');
        }
        if (action === 'publish') {
            if (Object.keys(locator).length === 0) return fail('publish 需要 package_id 或 id');
            const r = await chen.publish(locator);
            return wrapChen(r);
        }
        if (action === 'create-npm') {
            if (Object.keys(locator).length === 0) return fail('create-npm 需要 package_id 或 id');
            if (!params.npm_name) return fail('create-npm 需要 npm_name');
            const meta: any = { npm_name: params.npm_name };
            if (params.npm_version) meta.npm_version = params.npm_version;
            const r = await chen.createNpmPackage(locator, meta);
            return wrapChen(r);
        }
        return fail('未知 action: ' + action);
    } catch (e) {
        return fail('manager 执行失败：' + String(e));
    }
}

function wrapChen(r: chen.ChenchuiResult): any {
    if (r.success) {
        return ok(r.data !== undefined ? r.data : r, 'ok');
    }
    let msg = r.error || '请求失败';
    if (r.code === 429 && r.retry_after) {
        msg += '（限流，请 ' + r.retry_after + ' 秒后重试）';
    }
    return fail(msg, r);
}

// =============== 导出 ===============
// 注意：ToolPkg 子包工具必须导出 async 函数本体，并在函数内部直接 complete()。
// 不要用 wrap(...).then(complete) 隔一层，宿主取结果时机可能早于异步回调。

const exportsAny: any = exports;

async function toolInit(params: any): Promise<void> {
    let r: any;
    try { r = await doInit(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolSearch(params: any): Promise<void> {
    let r: any;
    try { r = await doSearch(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolInstall(params: any): Promise<void> {
    let r: any;
    try { r = await doInstall(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolRemove(params: any): Promise<void> {
    let r: any;
    try { r = await doRemove(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolManager(params: any): Promise<void> {
    let r: any;
    try { r = await doManager(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

exportsAny.init = toolInit;
exportsAny.search = toolSearch;
exportsAny.install = toolInstall;
exportsAny.remove = toolRemove;
exportsAny.manager = toolManager;

async function toolBuild(params: any): Promise<void> {
    let r: any;
    try {
        const p = params || {};
        if (!p.project_dir) {
            r = fail('缺少必填参数 project_dir');
        } else {
            const rep = await runBuild({
                projectDir: String(p.project_dir),
                skipCompile: p.skip_compile === true || p.skip_compile === 'true',
                outName: p.out_name ? String(p.out_name) : undefined
            } as any);
            // 拼装可读诊断
            let msg = rep.message;
            if (!rep.ok) {
                if (rep.violations && rep.violations.length) {
                    msg += ' | 违规：' + rep.violations.map((v: any) => v.name + '(' + (v.reason || '').slice(0, 80) + ')').join('; ');
                }
                if (rep.missing && rep.missing.length) {
                    msg += ' | 缺失：' + rep.missing.map((v: any) => v.name + ' <- ' + v.from).join('; ');
                }
                if (rep.compileStdout) {
                    msg += ' | tsc: ' + String(rep.compileStdout).slice(0, 400);
                }
            }
            r = {
                success: rep.ok,
                message: msg + (rep.stage && rep.stage !== 'done' ? '（阶段：' + rep.stage + '）' : ''),
                data: {
                    stage: rep.stage,
                    toolpkg_path: rep.toolpkgPath || null,
                    file_count: rep.fileCount || 0,
                    bare_names: rep.bareNames || [],
                    violations: rep.violations || [],
                    missing: rep.missing || [],
                    compile_stdout: rep.compileStdout || ''
                }
            };
        }
    } catch (e) {
        r = fail('构建失败：' + String((e as any) && (e as any).message ? (e as any).message : e));
    }
    complete(r);
}

async function toolVerify(params: any): Promise<void> {
    let r: any;
    try {
        const p = params || {};
        if (!p.project_dir) {
            r = fail('缺少必填参数 project_dir');
        } else {
            const rep = await runVerify({
                projectDir: String(p.project_dir),
                skipCompile: p.skip_compile === true || p.skip_compile === 'true'
            } as any);
            let msg = rep.message;
            if (!rep.ok) {
                if (rep.violations && rep.violations.length) {
                    msg += ' | 违规：' + rep.violations.map((v: any) => v.name + '(' + (v.reason || '').slice(0, 80) + ')').join('; ');
                }
                if (rep.missing && rep.missing.length) {
                    msg += ' | 缺失：' + rep.missing.map((v: any) => v.name + ' <- ' + v.from).join('; ');
                }
                if (rep.compileStdout) {
                    msg += ' | tsc: ' + String(rep.compileStdout).slice(0, 400);
                }
            }
            r = {
                success: rep.ok,
                message: msg + (rep.stage && rep.stage !== 'done' ? '（阶段：' + rep.stage + '）' : ''),
                data: {
                    stage: rep.stage,
                    bare_names: rep.bareNames || [],
                    violations: rep.violations || [],
                    missing: rep.missing || [],
                    compile_stdout: rep.compileStdout || ''
                }
            };
        }
    } catch (e) {
        r = fail('校验失败：' + String((e as any) && (e as any).message ? (e as any).message : e));
    }
    complete(r);
}

exportsAny.build = toolBuild;
exportsAny.verify = toolVerify;