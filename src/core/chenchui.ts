/**
 * 辰锤资源中心（resource_center）API 客户端 —— manager 工具使用。
 *
 * 基址：https://open.serveryyswys.top/api?name=resource_center
 * 鉴权：token（API Key，需勾选 resource_center 作用域）
 * 读操作 GET/Query，写操作 POST + application/json，上传文件用 multipart/form-data。
 *
 * 限流桶：get 30/60s、post 20/60s、file_dl 3/60s、image_dl 1/60s。
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

/** 读操作（GET，参数放 query） */
export async function apiGet(action: string, params: Record<string, any>, tokenOverride?: string): Promise<ChenchuiResult> {
    const cfg = await loadConfig();
    const token = tokenOverride || cfg.token;
    if (!token) throw new Error('缺少辰锤 API token，请先在设置中配置');
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
    if (!token) throw new Error('缺少辰锤 API token，请先在设置中配置');
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
    if (!token) throw new Error('缺少辰锤 API token，请先在设置中配置');
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

function parseResult(res: any): ChenchuiResult {
    if (!res) return { success: false, error: '无响应' };
    const text = res.content || '';
    let json: any;
    try {
        json = JSON.parse(text);
    } catch (e) {
        return { success: false, error: 'HTTP ' + res.statusCode + ' 非 JSON 响应', code: res.statusCode };
    }
    if (typeof json.success === 'undefined') {
        json.success = res.statusCode >= 200 && res.statusCode < 300;
    }
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

// ---- 常用 action 封装 ----

/** 列出我的软件包 */
export async function listPackages(status?: string): Promise<ChenchuiResult> {
    return apiGet('packages', status ? { status: status } : {});
}

/** 单个软件包详情 */
export async function getPackage(locator: { id?: number; package_id?: string }): Promise<ChenchuiResult> {
    return apiGet('package', locator);
}

/** npm 包详情 */
export async function getNpm(locator: { id?: number; package_id?: string }): Promise<ChenchuiResult> {
    return apiGet('npm', locator);
}

/** npm 包内文件清单 */
export async function getNpmFiles(id: number): Promise<ChenchuiResult> {
    return apiGet('npm_files', { kind: 'npm', id: id });
}

/** 新建软件包 */
export async function createPackage(packageId: string, packageName?: string, desc?: string, tag?: string): Promise<ChenchuiResult> {
    const p: Record<string, any> = { package_id: packageId };
    if (packageName) p.package_name = packageName;
    if (desc) p.desc = desc;
    if (tag) p.tag = tag;
    return apiPost('package_create', p);
}

/** 建归档式 npm 包 */
export async function createNpmPackage(locator: { id?: number; package_id?: string }, npmMeta: Record<string, any>): Promise<ChenchuiResult> {
    return apiPost('npm_create', Object.assign({}, locator, npmMeta));
}

/** 上传包内文件（kind=npm） */
export async function uploadNpmFile(npmId: number, filePath: string, entry: string): Promise<ChenchuiResult> {
    return apiUploadFile(filePath, 'file_upload', { kind: 'npm', id: npmId, entry: entry }, 'file');
}

/** 归档 npm 包 */
export async function archiveNpm(npmId: number): Promise<ChenchuiResult> {
    return apiPost('archive', { kind: 'npm', id: npmId });
}

/** 同步到市场 */
export async function publish(locator: { id?: number; package_id?: string }): Promise<ChenchuiResult> {
    return apiPost('publish', locator);
}

/** 下载归档产物 */
export async function downloadArtifact(kind: string, id: number): Promise<ChenchuiResult> {
    return apiGet('download', { kind: kind, id: id });
}