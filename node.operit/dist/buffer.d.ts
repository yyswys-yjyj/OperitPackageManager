export type BufferEncoding = 'utf8' | 'utf-8' | 'hex' | 'base64' | 'latin1' | 'binary' | 'ascii' | 'ucs2' | 'ucs-2' | 'utf16le' | 'utf-16le';
interface BufferJSON {
    type: 'Buffer';
    data: number[];
}
export declare class Buffer extends Uint8Array {
    static from(value: string, encoding?: BufferEncoding): Buffer;
    static from(value: ArrayLike<number> | Iterable<number>): Buffer;
    static from(value: ArrayBuffer, byteOffset?: number, length?: number): Buffer;
    static alloc(size: number, fill?: number | string | Uint8Array, encoding?: BufferEncoding): Buffer;
    static allocUnsafe(size: number): Buffer;
    static allocUnsafeSlow(size: number): Buffer;
    static isBuffer(value: unknown): value is Buffer;
    static isEncoding(encoding: string): boolean;
    static byteLength(value: string | Uint8Array | ArrayBuffer, encoding?: BufferEncoding): number;
    static concat(list: readonly Uint8Array[], totalLength?: number): Buffer;
    static compare(a: Uint8Array, b: Uint8Array): number;
    toString(encoding?: BufferEncoding, start?: number, end?: number): string;
    toJSON(): BufferJSON;
    equals(other: Uint8Array): boolean;
    compare(other: Uint8Array, targetStart?: number, targetEnd?: number, sourceStart?: number, sourceEnd?: number): number;
    copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
    fill(value: number | string | Uint8Array, offset?: number, end?: number, encoding?: BufferEncoding): this;
    indexOf(value: number | string | Uint8Array, byteOffset?: number, encoding?: BufferEncoding): number;
    lastIndexOf(value: number | string | Uint8Array, byteOffset?: number, encoding?: BufferEncoding): number;
    includes(value: number | string | Uint8Array, byteOffset?: number, encoding?: BufferEncoding): boolean;
    slice(start?: number, end?: number): Buffer;
    subarray(start?: number, end?: number): Buffer;
    write(value: string, offset?: number, length?: number, encoding?: BufferEncoding): number;
    writeUInt8(value: number, offset?: number): number;
    writeInt8(value: number, offset?: number): number;
    writeUInt16LE(value: number, offset?: number): number;
    writeUInt16BE(value: number, offset?: number): number;
    writeUInt32LE(value: number, offset?: number): number;
    writeUInt32BE(value: number, offset?: number): number;
    writeInt16LE(value: number, offset?: number): number;
    writeInt16BE(value: number, offset?: number): number;
    writeInt32LE(value: number, offset?: number): number;
    writeInt32BE(value: number, offset?: number): number;
    readUInt8(offset?: number): number;
    readInt8(offset?: number): number;
    readUInt16LE(offset?: number): number;
    readUInt16BE(offset?: number): number;
    readUInt32LE(offset?: number): number;
    readUInt32BE(offset?: number): number;
    readInt16LE(offset?: number): number;
    readInt16BE(offset?: number): number;
    readInt32LE(offset?: number): number;
    readInt32BE(offset?: number): number;
}
/** Node `buffer.constants` 的形状；MAX_STRING_LENGTH 与 V8 上限一致。 */
export declare const constants: {
    MAX_LENGTH: number;
    MAX_STRING_LENGTH: number;
};
export declare const kMaxLength: number;
export declare const INSPECT_MAX_BYTES = 50;
/** 把普通 Uint8Array 变成 Buffer 实例（不改内容、不拷贝）。 */
export declare function wrap(source: Uint8Array): Buffer;
export default Buffer;
