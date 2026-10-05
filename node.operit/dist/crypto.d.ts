import { Buffer } from './buffer';
import type { HashSpec } from './lib/hashes';
declare class Hash {
    readonly spec: HashSpec;
    chunks: Uint8Array[];
    total: number;
    finalized: boolean;
    constructor(algorithm: string);
    update(data: unknown, inputEncoding?: string): this;
    digest(encoding?: string): string | Buffer;
    copy(): Hash;
}
declare class Hmac {
    readonly spec: HashSpec;
    readonly key: Uint8Array;
    chunks: Uint8Array[];
    total: number;
    finalized: boolean;
    constructor(algorithm: string, key: unknown, keyEncoding?: string);
    update(data: unknown, inputEncoding?: string): this;
    digest(encoding?: string): string | Buffer;
}
declare function createHash(algorithm: string, options?: {
    outputLength?: number;
}): Hash;
declare function createHmac(algorithm: string, key: unknown, options?: {
    encoding?: string;
}): Hmac;
declare function randomBytes(size: number, callback?: (error: Error | null, buffer: Buffer) => void): Buffer | void;
declare function randomFillSync(buffer: Uint8Array): Uint8Array;
declare function randomUUID(): string;
declare function randomInt(min: number, max?: number | ((error: Error | null, value: number) => void), callback?: (error: Error | null, value: number) => void): number | void;
declare function timingSafeEqual(left: unknown, right: unknown): boolean;
declare function pbkdf2Sync(password: unknown, salt: unknown, iterations: number, keylen: number, digest: string): Buffer;
declare function pbkdf2(password: unknown, salt: unknown, iterations: number, keylen: number, digest: string, callback: (error: Error | null, derivedKey: Buffer) => void): void;
declare function getHashes(): string[];
declare function getCiphers(): string[];
declare function createCipheriv(): never;
declare function createDecipheriv(): never;
declare function createSign(): never;
declare function createVerify(): never;
declare function generateKeyPairSync(): never;
declare function createDiffieHellman(): never;
declare const crypto: {
    createHash: typeof createHash;
    createHmac: typeof createHmac;
    randomBytes: typeof randomBytes;
    randomFillSync: typeof randomFillSync;
    randomUUID: typeof randomUUID;
    randomInt: typeof randomInt;
    timingSafeEqual: typeof timingSafeEqual;
    pbkdf2Sync: typeof pbkdf2Sync;
    pbkdf2: typeof pbkdf2;
    getHashes: typeof getHashes;
    getCiphers: typeof getCiphers;
    createCipheriv: typeof createCipheriv;
    createDecipheriv: typeof createDecipheriv;
    createSign: typeof createSign;
    createVerify: typeof createVerify;
    generateKeyPairSync: typeof generateKeyPairSync;
    createDiffieHellman: typeof createDiffieHellman;
    constants: {
        RSA_PKCS1_PADDING: number;
        RSA_NO_PADDING: number;
        RSA_PKCS1_OAEP_PADDING: number;
        RSA_X931_PADDING: number;
        RSA_PKCS1_PSS_PADDING: number;
        SSL_OP_ALL: number;
        SSL_OP_NO_SSLv2: number;
        SSL_OP_NO_SSLv3: number;
        SSL_OP_NO_TLSv1: number;
    };
    Hash: typeof Hash;
    Hmac: typeof Hmac;
};
export = crypto;
