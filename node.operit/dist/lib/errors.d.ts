/**
 * Node 错误码与 Java 异常之间的唯一翻译层。
 *
 * 设计约束：
 * - 每个错误对象都必须带 code。三方库普遍靠 code 分支（fs.existsSync、mkdirp、tar 等），
 *   没有 code 的实现等于跑不通。
 * - Java 侧异常类名来自 bridge 的错误文本前缀，形如 "java.io.FileNotFoundException: /x"。
 * - 未归类的 Java 异常一律映射为 EIO，并把原始类名与消息写进 message —— 这是明确定义的行为，
 *   Node 自己的 fs 在无法归类的系统错误上也报 EIO。
 */
/** 与 Linux errno 对齐，供依赖 errno 数值的三方库使用。 */
export declare const ERRNO: Readonly<Record<string, number>>;
export interface NodeStyleError extends Error {
    code: string;
    errno?: number;
    syscall?: string;
    path?: string;
    dest?: string;
    cause?: unknown;
    javaClass?: string;
    javaMessage?: string;
    isJavaError?: boolean;
}
export interface ParsedJavaError {
    className: string;
    message: string;
}
/** 构造一个 Node 形状的错误。syscall / path / dest 与 Node 自身的字段语义一致。 */
export declare function createError(code: string, syscall: string, targetPath?: string, destPath?: string): NodeStyleError;
/** node.operit 内部状态错误。 */
export declare function onjError(code: string, detail?: string): NodeStyleError;
/**
 * 从 Java bridge 的错误文本里剥离异常类名。
 * 形如 "java.io.FileNotFoundException: /sdcard/x" 或 "java.lang.SecurityException"。
 */
export declare function parseJavaError(text: string): ParsedJavaError;
/**
 * Java 异常类名 → Node 错误码。
 * 先查精确表，再按消息特征识别少数几种，仍未命中则 EIO。
 */
export declare function codeForJavaException(className: string, javaMessage: string): string;
/** 由 Java 错误文本构造中间态错误，保留原始类名与消息。 */
export declare function javaError(text: string): NodeStyleError;
/**
 * 给中间态错误补上 syscall / path，产出语义完整的 Node 错误。
 * 非 Java 错误原样返回。
 */
export declare function withContext(err: unknown, syscall: string, targetPath?: string, destPath?: string): unknown;
