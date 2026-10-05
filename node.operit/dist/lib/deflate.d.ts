/** 压缩为 raw DEFLATE 流。level <= 0 时退化为 stored 块。 */
export declare function deflateRaw(data: Uint8Array, level: number): Uint8Array;
