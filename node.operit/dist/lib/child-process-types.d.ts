/**
 * child_process 的公开类型。
 *
 * 与其他 types 文件同样的原因：child_process.ts 用 `export =` 导出模块本体，
 * 无法再导出类型。
 */
import type { NodeStyleError } from './errors';
import type { Buffer } from '../buffer';
/** 驱动层一次执行的完整结果（含启动失败）。 */
export interface RunOutcome {
    pid: number;
    status: number | null;
    signal: string | null;
    stdout: Buffer;
    stderr: Buffer;
    error?: NodeStyleError;
}
export interface ExecOptions {
    cwd?: string;
    env?: Record<string, string>;
    encoding?: string;
    timeout?: number;
    maxBuffer?: number;
    shell?: string | boolean;
    windowsHide?: boolean;
}
export interface SpawnSyncResult {
    pid: number;
    output: Array<unknown>;
    stdout: unknown;
    stderr: unknown;
    status: number | null;
    signal: string | null;
    error?: Error;
}
export interface ExecException extends Error {
    code?: string;
    status?: number | null;
    signal?: string | null;
    stdout?: unknown;
    stderr?: unknown;
    pid?: number;
    killed?: boolean;
}
export type ExecCallback = (error: ExecException | null, stdout?: unknown, stderr?: unknown) => void;
