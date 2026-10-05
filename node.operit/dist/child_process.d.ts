/**
 * Node child_process 模块的移植。
 *
 * 覆盖：exec / execSync / execFile / execFileSync / spawn / spawnSync，
 * ChildProcess 的 spawn/exit/close/error 事件与 stdout/stderr/stdin、pid、exitCode、kill。
 * 不覆盖：fork（需要 Node 运行时本身）。
 *
 * 时序上的重要差异：宿主只有 Java bridge 这一条同步通道，
 * 所以 spawn 是「先同步跑完、再异步发事件」—— 接口是异步的，执行是同步的，
 * 拿不到真正的并发与背压。需要真并发请用终端工具（Tools 层）。
 *
 * 输出按 UTF-8 解码（驱动层的选择，见 lib/process-driver.ts），二进制输出会有损。
 */
import EventEmitter = require('./events');
import streamModule = require('./stream');
import { Buffer } from './buffer';
import { type NodeStyleError } from './lib/errors';
import type { ExecOptions, RunOutcome, SpawnSyncResult } from './lib/child-process-types';
type ReadStreamLike = InstanceType<typeof streamModule.Readable>;
type WriteStreamLike = InstanceType<typeof streamModule.Writable>;
declare function execSync(command: unknown, options?: ExecOptions): string | Buffer;
declare function execFileSync(file: unknown, args?: unknown, options?: ExecOptions): string | Buffer;
declare function spawnSync(command: unknown, args?: unknown, options?: unknown): SpawnSyncResult;
declare class ChildProcess extends EventEmitter {
    pid: number;
    exitCode: number | null;
    signalCode: string | null;
    killed: boolean;
    readonly spawnfile: string;
    readonly spawnargs: string[];
    readonly stdout: ReadStreamLike;
    readonly stderr: ReadStreamLike;
    readonly stdin: WriteStreamLike;
    /** 启动失败时保留的错误；exec/execFile 的回调要优先报它。 */
    readonly spawnError?: NodeStyleError;
    constructor(argv: readonly string[], outcome: RunOutcome);
    /** 进程在本实现里已经跑完了，所以 kill 总是返回 false。 */
    kill(): boolean;
    ref(): this;
    unref(): this;
}
declare function exec(command: unknown, options?: unknown, callback?: unknown): ChildProcess;
declare function execFile(file: unknown, args?: unknown, options?: unknown, callback?: unknown): ChildProcess;
declare function spawn(command: unknown, args?: unknown, options?: unknown): ChildProcess;
declare function fork(): never;
declare const childProcess: {
    exec: typeof exec;
    execSync: typeof execSync;
    execFile: typeof execFile;
    execFileSync: typeof execFileSync;
    spawn: typeof spawn;
    spawnSync: typeof spawnSync;
    fork: typeof fork;
    ChildProcess: typeof ChildProcess;
};
export = childProcess;
