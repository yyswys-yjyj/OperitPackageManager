export interface ProcessRunOptions {
    cwd?: string;
    env?: Record<string, string>;
}
export interface ProcessRunResult {
    pid: number;
    status: number | null;
    stdout: string;
    stderr: string;
}
export interface ProcessDriver {
    /** 按 argv 起进程并等待结束；输出按 UTF-8 解码成文本。 */
    run(argv: readonly string[], options: ProcessRunOptions): ProcessRunResult;
}
/** 宿主注入点：桌面测试用，传 null 恢复为 Operit Java 驱动。 */
export declare function setDriver(next: ProcessDriver | null): void;
export declare function getDriver(): ProcessDriver;
/**
 * 基于 java.lang.ProcessBuilder 的驱动。
 *
 * 两处刻意的选择：
 *   - argv 用 JS 数组直接传：bridge 的 convertArg 对 `wrapper.isArray` 与 Collection 目标
 *     都能把 JS 数组转成 Java 数组 / List，因此不需要手工拼命令行字符串；
 *   - 输出用 java.util.Scanner 读成 String：InputStream.readAllBytes() 是 Java 9，
 *     在 Android 8~12 上不可用；Scanner 在所有 API 级别都在。
 *     代价是输出按 UTF-8 解码，二进制输出会有损（已在 README 写明）。
 *
 * 已知限制：先读 stdout 再读 stderr，若子进程往 stderr 写超过管道缓冲（约 64KB）
 * 会与我们的读取形成死锁。Node 用事件循环规避这一点，同步实现做不到。
 */
export declare function createJavaDriver(): ProcessDriver;
