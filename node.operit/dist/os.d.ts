export interface CpuInfo {
    model: string;
    speed: number;
    times: {
        user: number;
        nice: number;
        sys: number;
        idle: number;
        irq: number;
    };
}
export interface NetworkInterfaceInfo {
    address: string;
    family: string;
    internal: boolean;
}
export declare const EOL = "\n";
export declare function platform(): string;
export declare function arch(): string;
export declare function machine(): string;
export declare function type(): string;
export declare function release(): string;
export declare function version(): string;
export declare function endianness(): string;
export declare function hostname(): string;
export declare function tmpdir(): string;
/** Android 没有用户 home；按已安装包都可见的公共目录取 /sdcard。 */
export declare function homedir(): string;
export declare function availableParallelism(): number;
export declare function cpus(): CpuInfo[];
/** JVM 堆上限，不是物理内存总量。 */
export declare function totalmem(): number;
/** JVM 堆空闲量，不是系统可用内存。 */
export declare function freemem(): number;
export declare function loadavg(): number[];
export declare function uptime(): number;
export interface UserInfo {
    uid: number;
    gid: number;
    username: string;
    homedir: string;
    shell: string;
}
export declare function userInfo(): UserInfo;
/** 通过 NetworkInterface 的 Enumeration 逐个展开；Java 侧没有直接可用的集合视图。 */
export declare function networkInterfaces(): Record<string, NetworkInterfaceInfo[]>;
/** Node 的 os.devNull 是字符串属性，不是函数。 */
export declare const devNull = "/dev/null";
/** 进程优先级在 Android 上由调度器策略决定，Node 的 niceness 语义不成立。 */
export declare function getPriority(): number;
export declare function setPriority(): void;
export declare const constants: {
    signals: {
        SIGHUP: number;
        SIGINT: number;
        SIGQUIT: number;
        SIGILL: number;
        SIGTRAP: number;
        SIGABRT: number;
        SIGBUS: number;
        SIGFPE: number;
        SIGKILL: number;
        SIGUSR1: number;
        SIGSEGV: number;
        SIGUSR2: number;
        SIGPIPE: number;
        SIGALRM: number;
        SIGTERM: number;
        SIGWINCH: number;
    };
    errno: Record<string, number>;
    priority: {
        PRIORITY_LOW: number;
        PRIORITY_BELOW_NORMAL: number;
        PRIORITY_NORMAL: number;
        PRIORITY_ABOVE_NORMAL: number;
        PRIORITY_HIGH: number;
        PRIORITY_HIGHEST: number;
    };
};
