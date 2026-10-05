/**
 * fs 的公开类型。
 *
 * 独立成文件的原因与 path-types / zlib-types / stream-types 相同：
 * fs.ts 用 `export =` 导出模块本体，无法再导出类型，而 index.ts 聚合时
 * 要求这些名字是"可命名"的。
 */
export interface ReadStreamOptions {
    flags?: string;
    encoding?: string;
    start?: number;
    end?: number;
    highWaterMark?: number;
}
export interface WriteStreamOptions {
    flags?: string;
    encoding?: string;
    highWaterMark?: number;
}
