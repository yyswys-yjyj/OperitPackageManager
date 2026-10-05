/**
 * 唯一接触 Operit Java bridge 的地方。
 *
 * 运行时契约（types/core.d.ts）：
 *   javaCallStatic(className, methodName, argsJson) -> "{\"success\":bool,\"data\":any,\"error\":string}"
 *   javaNewInstance / javaCallInstance / javaGet|SetStatic|InstanceField 同形状
 *   javaGetApplicationContext / javaGetCurrentActivity
 *
 * 返回值经 toJsonCompatibleValue 转换：基本类型直通，数组 / Map / Iterable 递归展开，
 * 其余对象变成 { __javaHandle, __javaClass } 句柄。参数方向只接受 JSON 值。
 *
 * 本模块只做三件事：调用、解包、把 Java 异常翻成带 code 的中间态错误。
 * 它不知道 fs，也不知道路径语义 —— 那些属于上层。
 */
import { type NodeStyleError } from './errors';
/** Java 侧对象在 JS 侧的表现形式。 */
export interface JavaHandle {
    __javaHandle: string;
    __javaClass: string;
}
/** 宿主后端接口：Operit 上的实现走 NativeInterface，桌面测试注入 mock。 */
export interface JavaBridgeBackend {
    classExists(className: string): boolean;
    callStatic(className: string, methodName: string, args: readonly unknown[]): unknown;
    callInstance(instance: unknown, methodName: string, args: readonly unknown[]): unknown;
    newInstance(className: string, args: readonly unknown[]): unknown;
    getStaticField(className: string, fieldName: string): unknown;
    setStaticField(className: string, fieldName: string, value: unknown): unknown;
    getInstanceField(instance: unknown, fieldName: string): unknown;
    setInstanceField(instance: unknown, fieldName: string, value: unknown): unknown;
    getApplicationContext(): unknown;
    getCurrentActivity(): unknown;
    setEnv(key: string, value: string | null): void;
}
/** 宿主注入点：桌面测试与 mock 使用。传 null 恢复为自动解析 Operit 宿主。 */
export declare function setBackend(next: JavaBridgeBackend | null): void;
/** 把 { __javaHandle, __javaClass } 或裸 handle 字符串统一成 handle 字符串。 */
export declare function handleOf(instance: unknown): string;
export declare function normalizeBoolean(value: unknown): boolean;
/**
 * 解包 bridge 返回值。约定形状 `{ success, data?, error?, message? }`；
 * success 为 false 时抛中间态 Java 错误（带 code，但还没有 syscall / path）。
 */
export declare function unwrap(raw: unknown, context: string): unknown;
export declare function classExists(className: string): boolean;
export declare function callStatic(className: string, methodName: string, args?: readonly unknown[]): unknown;
export declare function callInstance(instance: unknown, methodName: string, args?: readonly unknown[]): unknown;
export declare function newInstance(className: string, args?: readonly unknown[]): unknown;
export declare function getStaticField(className: string, fieldName: string): unknown;
export declare function setStaticField(className: string, fieldName: string, value: unknown): unknown;
export declare function getInstanceField(instance: unknown, fieldName: string): unknown;
export declare function setInstanceField(instance: unknown, fieldName: string, value: unknown): unknown;
export declare function getApplicationContext(): unknown;
export declare function getCurrentActivity(): unknown;
/** 写环境变量。setEnv 是 P2 能力：不存在时抛 ONJ_MISSING_HOST，不静默丢弃。 */
export declare function setEnv(key: string, value: string | null): void;
/** 便于上层判断某个值是不是 Java 句柄。 */
export declare function isJavaHandle(value: unknown): value is JavaHandle;
/** 类型收窄辅助：把 unknown 断言成带 code 的错误对象。 */
export declare function asNodeError(value: unknown): NodeStyleError | null;
