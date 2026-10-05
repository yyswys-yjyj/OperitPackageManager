/**
 * http / https 的公开类型。
 *
 * 独立成文件的原因与其他 types 文件相同：http.ts 用 `export =` 导出模块本体，
 * 无法再导出类型，而 https.ts 与 index.ts 都需要能命名它。
 */
export interface RequestOptions {
    protocol?: string;
    host?: string;
    hostname?: string;
    port?: string | number;
    path?: string;
    method?: string;
    headers?: Record<string, string>;
    auth?: string;
    href?: string;
    timeout?: number;
}
