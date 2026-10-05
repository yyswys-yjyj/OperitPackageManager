/**
 * 辰锤资源中心（resource_center）API 客户端 —— manager 工具使用。
 *
 * 基址：https://open.serveryyswys.top/api?name=resource_center
 * 鉴权：token（API Key，必须勾选 resource_center 作用域；未勾选 → 403）
 * 请求方式：读操作 GET，写操作 POST + application/json，上传用 multipart/form-data。
 *
 * 限流（按账号计，4 个集合桶，滑动窗口 60s）：
 *   image_dl=1/60s（action=image）、file_dl=3/60s（action=download）、
 *   get=30/60s（11 个读）、post=20/60s（19 个写）。
 *   超限返回 429 + retry_after。
 *
 * 全部 32 个 action：
 *   读(11):  packages package | subpacks subpack files | docs doc images | npm npm_files | review
 *   下载(2): download image
 *   写(19):  package_create package_update package_delete | subpack_create subpack_delete subpack_iterate
 *            | file_upload file_delete | archive review_step
 *            | doc_save asset_upload asset_delete | npm_declare npm_create npm_update npm_delete
 *            | publish unpublish
 */

import { loadConfig } from './config.js';

export interface ChenchuiResult {
    success: boolean;
    action?: string;
    data?: any;
    error?: string;
    code?: number;
    bucket?: string;
    limit?: number;
    window?: number;
    retry_after?: number;
    [k: string]: any;
}

/** 软件包定位参数（id 优先于 package_id） */
export interface PkgLocator {
    id?: number;
    package_id?: string;
}

function withLocator(base: Record<string, any>, locator?: PkgLocator): Record<string, any> {
    if (locator) {
        if (locator.id !== undefined && locator.id !== null) base.id = locator.id;
        if (locator.package_id) base.package_id = locator.package_id;
    }
    return base;
}

// ============================================================================
// 底层请求
// ============================================================================

/** 读操作（GET，参数放 query） */
export async function apiGet(action: string, params: Record<string, any>, tokenOverride?: string): Promise<ChenchuiResult> {
    const cfg = await loadConfig();
    const token = tokenOverride || cfg.token;
    if (!token) throw new Error('缺少辰锤 API token。诊断：cfg.token 长度=' + (cfg ? String(cfg.token || '').length : 'cfg=null') + '，tokenOverride=' + (tokenOverride === undefined ? 'undefined' : String(tokenOverride).length));
    const url = buildUrl(cfg.apiBase, Object.assign({ action: action, token: token }, params || {}));
    const res = await Tools.Net.http({
        url: url,
        method: 'GET',
        headers: { 'Accept': 'application/json', 'User-Agent': 'opm/0.1.0 (Operit)' },
        follow_redirects: true,
        connect_timeout: 20000,
        read_timeout: 60000
    });
    return parseResult(res);
}

/** 写操作（POST + JSON） */
export async function apiPost(action: string, params: Record<string, any>, tokenOverride?: string): Promise<ChenchuiResult> {
    const cfg = await loadConfig();
    const token = tokenOverride || cfg.token;
    if (!token) throw new Error('缺少辰锤 API token，请先在 opm 设置里填写');
    const body = Object.assign({ action: action, token: token }, params || {});
    const res = await Tools.Net.http({
        url: cfg.apiBase,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'opm/0.1.0 (Operit)'
        },
        body: JSON.stringify(body),
        follow_redirects: true,
        connect_timeout: 20000,
        read_timeout: 120000
    });
    return parseResult(res);
}

/** 上传文件（multipart/form-data） */
export async function apiUploadFile(
    filePath: string,
    action: string,
    params: Record<string, any>,
    fieldName?: string,
    tokenOverride?: string
): Promise<ChenchuiResult> {
    const cfg = await loadConfig();
    const token = tokenOverride || cfg.token;
    if (!token) throw new Error('缺少辰锤 API token，请先在 opm 设置里填写');
    const res = await Tools.Net.uploadFile({
        url: cfg.apiBase,
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'opm/0.1.0 (Operit)'
        },
        form_data: stringifyParams(Object.assign({ action: action, token: token }, params || {})),
        files: [
            {
                field_name: fieldName || 'file',
                file_path: filePath
            }
        ]
    });
    return parseResult(res);
}

/** 下载二进制产物（归档 zip/tgz、图片），保存到本地 */
export async function apiDownloadBinary(
    action: string,
    params: Record<string, any>,
    savePath: string,
    tokenOverride?: string
): Promise<ChenchuiResult> {
    const cfg = await loadConfig();
    const token = tokenOverride || cfg.token;
    if (!token) throw new Error('缺少辰锤 API token，请先在 opm 设置里填写');
    const url = buildUrl(cfg.apiBase, Object.assign({ action: action, token: token }, params || {}));
    try {
        const r = await Tools.Files.download(url, savePath);
        return { success: true, action: action, data: { path: savePath, result: r } };
    } catch (e) {
        return { success: false, action: action, error: String(e) };
    }
}

function parseResult(res: any): ChenchuiResult {
    if (!res) return { success: false, error: '无响应' };
    const text = res.content || '';
    let json: any;
    try {
        json = JSON.parse(text);
    } catch (e) {
        // 不加工：原样返回 HTTP 状态码 + 原始响应体（截断保护）
        return {
            success: false,
            error: '非 JSON 响应（HTTP ' + res.statusCode + '）',
            code: res.statusCode,
            raw_status: res.statusCode,
            raw_body: String(text).slice(0, 2000)
        };
    }
    if (typeof json.success === 'undefined') {
        json.success = res.statusCode >= 200 && res.statusCode < 300;
    }
    // 附上原始状态码，便于排查
    if (json.raw_status === undefined) json.raw_status = res.statusCode;
    return json as ChenchuiResult;
}

function buildUrl(base: string, params: Record<string, any>): string {
    const qs = Object.keys(params)
        .filter(k => params[k] !== undefined && params[k] !== null)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k])))
        .join('&');
    const sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + qs;
}

function stringifyParams(params: Record<string, any>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of Object.keys(params)) {
        const v = params[k];
        if (v === undefined || v === null) continue;
        out[k] = typeof v === 'string' ? v : JSON.stringify(v);
    }
    return out;
}

// ============================================================================
// 读：软件包
// ============================================================================

/** 列出我的软件包。status 可多值逗号分隔：draft/reviewing/pending/approved/rejected */
export async function listPackages(opts?: { status?: string; limit?: number; offset?: number }): Promise<ChenchuiResult> {
    const p: Record<string, any> = {};
    if (opts && opts.status) p.status = opts.status;
    if (opts && opts.limit !== undefined) p.limit = opts.limit;
    if (opts && opts.offset !== undefined) p.offset = opts.offset;
    return apiGet('packages', p);
}

/** 单个软件包详情（含 subpacks / npm / docs / images / limits） */
export async function getPackage(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiGet('package', withLocator({}, locator));
}

// ============================================================================
// 读：普通包与文件
// ============================================================================

/** 普通包列表 */
export async function listSubpacks(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiGet('subpacks', withLocator({}, locator));
}

/** 单个普通包（含文件） */
export async function getSubpack(id: number): Promise<ChenchuiResult> {
    return apiGet('subpack', { id: id });
}

/** 包内文件列表。kind: subpack / npm */
export async function listFiles(kind: string, id: number): Promise<ChenchuiResult> {
    return apiGet('files', { kind: kind || 'subpack', id: id });
}

// ============================================================================
// 读：文档与缩略图
// ============================================================================

/** 文档列表（不含正文） */
export async function listDocs(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiGet('docs', withLocator({}, locator));
}

/** 取回文档正文。用 asset_id，或 package_id + doc_name */
export async function getDoc(loc: { asset_id?: number } & PkgLocator & { doc_name?: string }): Promise<ChenchuiResult> {
    const p: Record<string, any> = {};
    if (loc.asset_id !== undefined) p.asset_id = loc.asset_id;
    else withLocator(p, loc);
    if (loc.doc_name) p.doc_name = loc.doc_name;
    return apiGet('doc', p);
}

/** 缩略图列表（走 get 桶） */
export async function listImages(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiGet('images', withLocator({}, locator));
}

// ============================================================================
// 读：npm 与审查
// ============================================================================

/** npm 包详情（无 npm 包时 npm 为 null） */
export async function getNpm(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiGet('npm', withLocator({}, locator));
}

/** npm 包内文件清单（已按入口优先级排序） */
export async function getNpmFiles(id: number): Promise<ChenchuiResult> {
    return apiGet('npm_files', { kind: 'npm', id: id });
}

/** 审查/审核状态（含 package_ready 发布条件检查） */
export async function getReview(kind: string, id: number): Promise<ChenchuiResult> {
    return apiGet('review', { kind: kind || 'subpack', id: id });
}

// ============================================================================
// 写：软件包
// ============================================================================

/** 新建软件包。package_id 仅 [A-Za-z0-9._-]、≥2 字符、创建后不可改 */
export async function createPackage(opts: {
    package_id: string;
    package_name?: string;
    desc?: string;
    tag?: string;
    enable?: boolean;
}): Promise<ChenchuiResult> {
    const p: Record<string, any> = { package_id: opts.package_id };
    if (opts.package_name) p.package_name = opts.package_name;
    if (opts.desc) p.desc = opts.desc;
    if (opts.tag) p.tag = opts.tag;
    if (opts.enable !== undefined) p.enable = opts.enable;
    return apiPost('package_create', p);
}

/** 改软件包信息。package_name/desc/tag/enable 至少给一个 */
export async function updatePackage(locator: PkgLocator, patch: {
    package_name?: string;
    desc?: string;
    tag?: string;
    enable?: boolean;
}): Promise<ChenchuiResult> {
    const p = withLocator({}, locator);
    if (patch.package_name !== undefined) p.package_name = patch.package_name;
    if (patch.desc !== undefined) p.desc = patch.desc;
    if (patch.tag !== undefined) p.tag = patch.tag;
    if (patch.enable !== undefined) p.enable = patch.enable;
    return apiPost('package_update', p);
}

/** 删除软件包（不可恢复，含全部子内容；已上架会先下架） */
export async function deletePackage(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiPost('package_delete', withLocator({}, locator));
}

// ============================================================================
// 写：普通包
// ============================================================================

/** 新建普通包。key 包内唯一（main/windows/... 或自定义），file_name 扩展名由服务端补 .zip */
export async function createSubpack(locator: PkgLocator, key: string, fileName?: string): Promise<ChenchuiResult> {
    const p = withLocator({}, locator);
    p.key = key;
    if (fileName) p.file_name = fileName;
    return apiPost('subpack_create', p);
}

/** 删除普通包（不可恢复） */
export async function deleteSubpack(id: number): Promise<ChenchuiResult> {
    return apiPost('subpack_delete', { kind: 'subpack', id: id });
}

/** 迭代：把已归档/已过审的普通包退回可编辑（保留 key 与 file_name） */
export async function iterateSubpack(id: number): Promise<ChenchuiResult> {
    return apiPost('subpack_iterate', { kind: 'subpack', id: id });
}

// ============================================================================
// 写：包内文件
// ============================================================================

/** 上传包内文件（kind: subpack / npm；entry 决定包内相对路径；同名覆盖） */
export async function uploadFile(kind: string, id: number, filePath: string, entry?: string): Promise<ChenchuiResult> {
    const p: Record<string, any> = { kind: kind || 'subpack', id: id };
    if (entry) p.entry = entry;
    return apiUploadFile(filePath, 'file_upload', p, 'file');
}

/** 删除包内文件（需包为 draft/rejected） */
export async function deleteFile(kind: string, id: number, fileId: number): Promise<ChenchuiResult> {
    return apiPost('file_delete', { kind: kind || 'subpack', id: id, file_id: fileId });
}

// ============================================================================
// 写：归档审查
// ============================================================================

/** 归档并触发审查（kind: subpack / npm） */
export async function archive(kind: string, id: number): Promise<ChenchuiResult> {
    return apiPost('archive', { kind: kind || 'subpack', id: id });
}

/** 前台推进审查（兜底，正常不用；不要当轮询用） */
export async function reviewStep(kind: string, id: number): Promise<ChenchuiResult> {
    return apiPost('review_step', { kind: kind || 'subpack', id: id });
}

// ============================================================================
// 写：文档与缩略图
// ============================================================================

/** 保存文档（在线编辑）。doc_name 扩展名固定 .md；每包最多 1 份 */
export async function saveDoc(locator: PkgLocator, docName: string, content: string, assetId?: number): Promise<ChenchuiResult> {
    const p = withLocator({}, locator);
    p.doc_name = docName;
    p.content = content;
    if (assetId !== undefined) p.asset_id = assetId;
    return apiPost('doc_save', p);
}

/** 上传资产（assetKind: image 缩略图 / doc 文档） */
export async function uploadAsset(assetKind: string, packageId: string, filePath: string): Promise<ChenchuiResult> {
    const p: Record<string, any> = { asset_kind: assetKind || 'image', package_id: packageId };
    return apiUploadFile(filePath, 'asset_upload', p, 'file');
}

/** 删除资产（assetKind: image / doc） */
export async function deleteAsset(assetKind: string, loc: {
    asset_id?: number;
} & PkgLocator & { doc_name?: string; image_name?: string }): Promise<ChenchuiResult> {
    const p: Record<string, any> = { asset_kind: assetKind || 'image' };
    if (loc.asset_id !== undefined) p.asset_id = loc.asset_id;
    else withLocator(p, loc);
    if (loc.doc_name) p.doc_name = loc.doc_name;
    if (loc.image_name) p.image_name = loc.image_name;
    return apiPost('asset_delete', p);
}

// ============================================================================
// 写：npm
// ============================================================================

/** npm 元数据字段（与网页表单一一对应，统一 npm_ 前缀） */
export interface NpmMeta {
    npm_name?: string;
    npm_scope?: string;
    npm_version?: string;
    npm_main?: string;
    npm_bin?: string;
    npm_types?: string;
    npm_type?: string;         // module | commonjs
    npm_license?: string;
    npm_desc?: string;
    npm_keywords?: string;
    npm_deps?: string;
    npm_peer_deps?: string;
    npm_engines?: string;
    npm_files?: string;
    npm_component?: string;
}

/** 建归档式 npm 包（先建包→传文件→npm_update→archive） */
export async function createNpm(locator: PkgLocator, meta: NpmMeta): Promise<ChenchuiResult> {
    return apiPost('npm_create', Object.assign(withLocator({}, locator), cleanUndef(meta)));
}

/** 建声明式 npm 包（指向一个已归档的普通包，不重新打包） */
export async function declareNpm(locator: PkgLocator, srcSubpack: number, meta: NpmMeta): Promise<ChenchuiResult> {
    const p = Object.assign(withLocator({}, locator), cleanUndef(meta));
    p.src_subpack = srcSubpack;
    return apiPost('npm_declare', p);
}

/** 改 npm 元数据（仅 draft/rejected 可改） */
export async function updateNpm(id: number, meta: NpmMeta): Promise<ChenchuiResult> {
    const p: Record<string, any> = { kind: 'npm', id: id };
    return apiPost('npm_update', Object.assign(p, cleanUndef(meta)));
}

/** 删除 npm 包（不可恢复） */
export async function deleteNpm(id: number): Promise<ChenchuiResult> {
    return apiPost('npm_delete', { kind: 'npm', id: id });
}

// ============================================================================
// 写：同步
// ============================================================================

/** 同步到市场（需全部过审，否则 400 + ready.reasons） */
export async function publish(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiPost('publish', withLocator({}, locator));
}

/** 从市场下架（只撤市场那份，投稿中心源码保留） */
export async function unpublish(locator: PkgLocator): Promise<ChenchuiResult> {
    return apiPost('unpublish', withLocator({}, locator));
}

// ============================================================================
// 下载
// ============================================================================

/** 下载归档产物到本地。kind: subpack / npm */
export async function downloadArtifact(kind: string, id: number, savePath: string): Promise<ChenchuiResult> {
    return apiDownloadBinary('download', { kind: kind || 'subpack', id: id }, savePath);
}

/** 下载缩略图本体到本地（走 image_dl 桶，1 次/分钟） */
export async function downloadImage(loc: {
    asset_id?: number;
} & PkgLocator & { image_name?: string }, savePath: string): Promise<ChenchuiResult> {
    const p: Record<string, any> = {};
    if (loc.asset_id !== undefined) p.asset_id = loc.asset_id;
    else withLocator(p, loc);
    if (loc.image_name) p.image_name = loc.image_name;
    return apiDownloadBinary('image', p, savePath);
}

// ============================================================================
// 辅助
// ============================================================================

function cleanUndef(o: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const k of Object.keys(o || {})) {
        if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k];
    }
    return out;
}