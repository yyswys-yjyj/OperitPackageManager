/**
 * Node process 模块的移植。
 *
 * 这是 `require('process')` 返回的对象。注意 Operit 运行时**没有** `process` 全局，
 * 所以直接引用裸 `process` 的代码需要由 OperitPackageManager 在重写时注入（见 README）。
 *
 * 已知差异：
 *   - process.env 是 Proxy，读走 Operit 的 getEnv；getEnv 对不存在的变量返回空串，
 *     因此空串与未设置都表现为 undefined；且无法枚举（Object.keys(env) 恒为 []）
 *   - process.exit() 会终止整个 Operit 运行时，这里显式抛错而不是静默继续
 *   - versions.node 是"声明的兼容目标"，不是真实运行时版本
 */
import EventEmitter = require('./events');
declare function nextTick(fn: (...args: unknown[]) => void, ...args: unknown[]): void;
declare class Process extends EventEmitter {
    exitCode: number | undefined;
    title: string;
    get platform(): string;
    get arch(): string;
    get version(): string;
    readonly versions: {
        node: string;
        operit: string;
        quickjs: string;
    };
    readonly argv: string[];
    readonly execArgv: string[];
    readonly execPath = "operit";
    readonly env: Record<string, string | undefined>;
    readonly stdout: {
        isTTY: boolean;
        columns: number;
        rows: number;
        write(chunk: string | Uint8Array): boolean;
    };
    readonly stderr: {
        isTTY: boolean;
        columns: number;
        rows: number;
        write(chunk: string | Uint8Array): boolean;
    };
    readonly stdin: {
        isTTY: boolean;
        read: () => null;
        on: () => unknown;
        resume: () => void;
    };
    readonly nextTick: typeof nextTick;
    readonly hrtime: ((previous?: number[]) => number[]) & {
        bigint(): bigint;
    };
    get pid(): number;
    cwd(): string;
    chdir(directory: string): void;
    uptime(): number;
    memoryUsage(): {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
    };
    emitWarning(warning: unknown): void;
    exit(code?: number): never;
    abort(): never;
    umask(): number;
}
declare const processObject: Process;
export = processObject;
