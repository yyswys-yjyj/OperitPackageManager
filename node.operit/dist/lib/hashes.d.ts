/**
 * 纯 JS 的哈希原语（md5 / sha1 / sha224 / sha256 / sha384 / sha512）。
 *
 * 为什么自己实现而不是借运行时：
 *   Operit 注入的全局 CryptoJS 只是个 4KB 的 shim，只有 MD5(string) 和 AES.decrypt；
 *   NativeInterface.crypto 也只认 md5 与 aes/decrypt。都不足以支撑 crypto 模块。
 *
 * 实现取舍：
 *   32 位算法（md5/sha1/sha256）用标准 32 位算术；
 *   sha384/sha512 用 BigInt 写 64 位轮 —— 代码短、不易错，代价是大输入的吞吐。
 *   正确性由 test/crypto.test.js 与 Node 的 crypto 全量对拍保证。
 */
export interface HashSpec {
    readonly name: string;
    readonly blockSize: number;
    readonly digestLength: number;
    compute(bytes: Uint8Array): Uint8Array;
}
export declare const HASHES: Readonly<Record<string, HashSpec>>;
/** 把 Node 的算法别名（大小写、连字符、sha-256 之类）归一到注册表的键。 */
export declare function resolveAlgorithm(name: string): HashSpec;
export declare function hashNames(): string[];
/** HMAC（RFC 2104）。 */
export declare function hmac(spec: HashSpec, key: Uint8Array, message: Uint8Array): Uint8Array;
/** PBKDF2（RFC 2898），基于 HMAC。 */
export declare function pbkdf2(spec: HashSpec, password: Uint8Array, salt: Uint8Array, iterations: number, keyLength: number): Uint8Array;
export declare function toHex(bytes: Uint8Array): string;
