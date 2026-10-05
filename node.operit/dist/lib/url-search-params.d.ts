import type { IteratorLike } from './url-types';
export declare function hexByte(value: number): string;
/** application/x-www-form-urlencoded 序列化：空格变 +，其余按 UTF-8 百分号编码。 */
export declare function formSerialize(value: string): string;
/** 表单反序列化：+ 变空格，再按 UTF-8 百分号解码。 */
export declare function formParse(value: string): string;
type PairList = Array<[string, string]>;
export declare class URLSearchParams {
    list: PairList;
    constructor(init?: unknown);
    get size(): number;
    append(name: unknown, value: unknown): void;
    delete(name: unknown, value?: unknown): void;
    get(name: unknown, value?: unknown): string | null;
    getAll(name: unknown): string[];
    has(name: unknown, value?: unknown): boolean;
    set(name: unknown, value: unknown): void;
    sort(): void;
    forEach(callback: (value: string, name: string, params: URLSearchParams) => void, thisArg?: unknown): void;
    entries(): IteratorLike<[string, string]>;
    keys(): IteratorLike<string>;
    values(): IteratorLike<string>;
    [Symbol.iterator](): IteratorLike<[string, string]>;
    toString(): string;
}
export {};
