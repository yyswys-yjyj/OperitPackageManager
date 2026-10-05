/**
 * dns 的公开类型。
 *
 * 独立成文件的原因与其他 types 文件相同：dns.ts 用 `export =` 导出模块本体，
 * 而 dns/promises.ts 与它共用同一份 lookup 选项类型 —— 两处各写一份会互相泄漏无法命名。
 */
export interface LookupOptions {
    family?: number;
    hints?: number;
    all?: boolean;
    verbatim?: boolean;
}
export interface AddressRecord {
    address: string;
    family: number;
}
export interface DnsError extends Error {
    code: string;
    errno: number;
    syscall: string;
    hostname: string;
}
