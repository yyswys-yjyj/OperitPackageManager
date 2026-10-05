/** 解压 raw DEFLATE 数据。 */
export declare function inflateRaw(data: Uint8Array, start: number, end: number): Uint8Array;
/** gzip 的 CRC-32（IEEE 802.3）。 */
export declare function crc32(data: Uint8Array, start: number, end: number): number;
/** zlib 的 Adler-32。 */
export declare function adler32(data: Uint8Array, start: number, end: number): number;
