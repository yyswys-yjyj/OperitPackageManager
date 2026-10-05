import { URLSearchParams as SearchParams } from './lib/url-search-params';
import { URL as WhatwgUrl } from './lib/url-whatwg';
import type { ParsedUrl } from './lib/url-types';
declare function parseUrl(input: string, parseQueryString?: boolean, slashesDenoteHost?: boolean): ParsedUrl;
declare function formatUrl(source?: unknown): string;
declare function resolveUrl(from: unknown, to: unknown): string;
declare function pathToFileURL(filepath: unknown): WhatwgUrl;
/**
 * 把 URL 实例转成 http.request 的选项对象。
 * 语义照 Node：IPv6 主机去掉方括号、path 是 pathname + search、auth 从 username/password 还原。
 */
declare function urlToHttpOptions(url: unknown): Record<string, unknown>;
declare function fileURLToPath(path: unknown): string;
declare function domainToASCII(domain: unknown): string;
declare function domainToUnicode(domain: unknown): string;
declare const urlModule: {
    URLSearchParams: typeof SearchParams;
    parse: typeof parseUrl;
    format: typeof formatUrl;
    resolve: typeof resolveUrl;
    pathToFileURL: typeof pathToFileURL;
    fileURLToPath: typeof fileURLToPath;
    domainToASCII: typeof domainToASCII;
    domainToUnicode: typeof domainToUnicode;
    URL: typeof WhatwgUrl;
    urlToHttpOptions: typeof urlToHttpOptions;
};
export = urlModule;
