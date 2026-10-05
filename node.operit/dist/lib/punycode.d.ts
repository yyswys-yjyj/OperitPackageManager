/** 把一段 Unicode 字符串编成 punycode（不含 xn-- 前缀）。 */
export declare function encode(input: string): string;
/** 把 punycode（不含 xn-- 前缀）解回 Unicode 字符串。非法输入抛错。 */
export declare function decode(input: string): string;
/** 域名 -> ASCII（xn--）。纯 ASCII 输入原样返回（已小写化由调用方负责）。 */
export declare function toASCII(domain: string): string;
/** 域名 -> Unicode。xn-- 标签解回 Unicode，其余原样。 */
export declare function toUnicode(domain: string): string;
