export interface FileStat {
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
    size: number;
    mode: number;
    atimeMs: number;
    mtimeMs: number;
    ctimeMs: number;
    birthtimeMs: number;
}
export interface DirectoryEntry {
    name: string;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
}
/** fd 语义下的打开选项，由 fs.ts 从 flag 解析后传入。 */
export interface OpenHandleOptions {
    readable: boolean;
    writable: boolean;
    append: boolean;
    exclusive: boolean;
    truncate: boolean;
}
/** 一个打开的句柄。position 为 null 表示"用当前位置并推进"，与 Node 的 fd 语义一致。 */
export interface FileHandle {
    read(position: number | null, length: number): Uint8Array;
    write(position: number | null, data: Uint8Array): number;
    size(): number;
    truncate(length: number): void;
    sync(): void;
    close(): void;
}
export interface FsDriver {
    openHandle(target: string, options: OpenHandleOptions): FileHandle;
    stat(target: string, followLinks: boolean): FileStat;
    exists(target: string): boolean;
    readdir(target: string): DirectoryEntry[];
    readFileBytes(target: string): Uint8Array;
    writeFileBytes(target: string, data: Uint8Array, append: boolean, exclusive: boolean): void;
    mkdir(target: string, recursive: boolean): string | undefined;
    remove(target: string, recursive: boolean, force: boolean): void;
    rename(from: string, to: string): void;
    copyFile(from: string, to: string): void;
    realpath(target: string): string;
    readlink(target: string): string;
    symlink(target: string, linkPath: string): void;
    chmod(target: string, mode: number): void;
    truncate(target: string, length: number): void;
    utimes(target: string, atimeMs: number, mtimeMs: number): void;
    mkdtemp(prefix: string): string;
}
/** 宿主注入点：桌面测试用，传 null 恢复为 Operit Java 驱动。 */
export declare function setDriver(next: FsDriver | null): void;
export declare function getDriver(): FsDriver;
/**
 * 基于 java.io.File / java.nio.file.Files / java.io.RandomAccessFile 的驱动。
 *
 * 通道选择（对应 DESIGN.md §6.3）：
 *   - 读：Files.readAllBytes(Path) 返回 byte[]，bridge 会展开成 JSON 数字数组，直接用
 *   - 写：RandomAccessFile.writeBytes(String) 写每个字符的低 8 位 —— 正好是 latin1 通道，
 *         避免了"把 JS 数组当 byte[] 参数传进去"这类未验证行为
 *
 * 已知近似（真机验证时要确认）：
 *   - atime / ctime / birthtime 都取 lastModified
 *   - mode 按类型给默认值，不反映真实权限位
 *   - readdir 不区分符号链接
 */
export declare function createJavaDriver(): FsDriver;
