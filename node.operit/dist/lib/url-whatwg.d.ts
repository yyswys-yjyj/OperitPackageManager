/**
 * WHATWG URL（RFC 3986 + URL 标准的解析与序列化）。
 *
 * 覆盖：特殊协议（http/https/ws/wss/ftp/file）与自定义协议、authority（userinfo / host / port）、
 * IPv4 / IPv6 / 域名的 punycode、按组件的百分号编码、点段规范化、相对引用解析、
 * 全部 getter 与 setter、url.searchParams 的活视图、URL.canParse / URL.parse。
 *
 * 与 Node 的已知差异见 BUILTINS.json 的 url 条目：IPv4 的十六进制/八进制写法、
 * 非 ASCII 域名的 UTS-46 映射（只做 punycode，不做映射与归一化）、blob: 的 origin。
 */
import { URLSearchParams } from './url-search-params';
/** fragment 组：C0 组 + 空格 " < > ` */
export declare function fragmentEncodeSet(code: number): boolean;
/** query 组：C0 组 + 空格 " # < > */
export declare function queryEncodeSet(code: number): boolean;
/** special-query 组：query 组 + ' */
export declare function specialQueryEncodeSet(code: number): boolean;
/** path 组：query 组 + ? ` { } */
export declare function pathEncodeSet(code: number): boolean;
/** userinfo 组：path 组 + / : ; = @ [ \ ] ^ | */
export declare function userinfoEncodeSet(code: number): boolean;
interface UrlRecord {
    scheme: string;
    username: string;
    password: string;
    /** null 表示没有 authority（不透明路径） */
    host: string | null;
    port: number | null;
    /** 有 authority 时是段数组；没有时是不透明路径字符串 */
    path: string[] | string;
    query: string | null;
    fragment: string | null;
}
export declare function parseUrlRecord(input: string, base?: UrlRecord | null): UrlRecord | null;
export declare class URL {
    private record;
    searchParams: URLSearchParams;
    constructor(input: unknown, base?: unknown);
    private buildSearchParams;
    /**
     * 把 searchParams 写回 query。只在参数**真的被改动**时调用。
     *
     * 两处不能想当然：
     *   - 不能用 URLSearchParams.toString()：那是表单序列化（空格 -> +），
     *     而 URL 的 query 用 URL 的 query 编码集（空格 -> %20）；
     *   - 没被改动过时必须保持 query 原样，否则 new URL('http://x/?b').search
     *     会从 '?b' 变成 '?b='。
     */
    private applyParams;
    /** 不透明路径（没有 authority）时用字符串路径。 */
    private isOpaque;
    get href(): string;
    set href(value: unknown);
    get origin(): string;
    get protocol(): string;
    set protocol(value: unknown);
    get username(): string;
    set username(value: unknown);
    get password(): string;
    set password(value: unknown);
    get host(): string;
    set host(value: unknown);
    get hostname(): string;
    set hostname(value: unknown);
    get port(): string;
    set port(value: unknown);
    get pathname(): string;
    set pathname(value: unknown);
    get search(): string;
    set search(value: unknown);
    get hash(): string;
    set hash(value: unknown);
    toString(): string;
    toJSON(): string;
    static canParse(input: unknown, base?: unknown): boolean;
    static parse(input: unknown, base?: unknown): URL | null;
}
export {};
