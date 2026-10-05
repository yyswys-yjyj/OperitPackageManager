/** 与 Node 一致：querystring.escape 就是 encodeURIComponent（不额外转义 ! ' ( ) *）。 */
export declare function escape(value: unknown): string;
export declare function unescape(value: unknown): string;
interface StringifyOptions {
    encodeURIComponent?: (value: string) => string;
}
export declare function stringify(value: unknown, separator?: string, equals?: string, options?: StringifyOptions): string;
interface ParseOptions {
    maxKeys?: number;
    decodeURIComponent?: (value: string) => string;
}
export declare function parse(text: unknown, separator?: string, equals?: string, options?: ParseOptions): Record<string, string | string[]>;
export declare const encode: typeof stringify;
export declare const decode: typeof parse;
export {};
