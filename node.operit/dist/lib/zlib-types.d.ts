/**
 * zlib 的公开类型。
 *
 * 独立成文件的原因与 path-types 相同：zlib.ts 用 `export =` 导出模块本体，
 * 无法再导出类型，而 index.ts 聚合时需要这些名字是"可命名"的。
 */
export interface DeflateOptions {
    /** 0 = 不压缩（stored）；1..9 越大越慢，未实现动态 Huffman，压缩率低于 zlib。 */
    level?: number;
    /** 仅用于与 Node 的签名兼容；本实现总是按 32K 窗口处理。 */
    windowBits?: number;
}
