export interface AddressRecord {
    address: string;
    family: number;
}
export interface DnsDriver {
    /** 对应 getaddrinfo：可能返回多条（IPv4 与 IPv6 都在）。失败时抛 Java 侧映射过的错误。 */
    lookup(hostname: string): AddressRecord[];
    /** 反向查询：地址 -> 规范主机名。 */
    canonicalNameOf(address: string): string;
}
/** 宿主注入点：桌面测试用，传 null 恢复为 Operit Java 驱动。 */
export declare function setDriver(next: DnsDriver | null): void;
export declare function createJavaDriver(): DnsDriver;
export declare function getDriver(): DnsDriver;
