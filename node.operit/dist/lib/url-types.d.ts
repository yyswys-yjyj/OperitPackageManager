/**
 * url 的公开类型。
 *
 * 独立成文件的原因与 path-types / zlib-types / stream-types / fs-types /
 * child-process-types 相同：url.ts 用 `export =` 导出模块本体，无法再导出类型，
 * 而 index.ts 聚合时要求这些名字是"可命名"的。
 */
/** 可迭代的迭代器（Node 的 entries/keys/values 都是可迭代的）。 */
export interface IteratorLike<T> {
    next(): {
        value: T;
        done: boolean;
    };
    [Symbol.iterator](): IteratorLike<T>;
}
export interface ParsedUrl {
    protocol: string | null;
    slashes: boolean | null;
    auth: string | null;
    host: string | null;
    port: string | null;
    hostname: string | null;
    hash: string | null;
    search: string | null;
    query: unknown;
    pathname: string | null;
    path: string | null;
    href: string;
}
export interface URLObjectLike {
    href: string;
    origin: string;
    protocol: string;
    username: string;
    password: string;
    host: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
    toString(): string;
    toJSON(): string;
}
