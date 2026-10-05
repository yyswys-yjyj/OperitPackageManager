/**
 * timers/promises 子路径入口。
 *
 * 与 Node 的差异（都写进了 BUILTINS.json）：
 *   - setInterval 用「每次 await 一个 setTimeout」实现，而不是原生 interval，
 *     所以延迟会随迭代次数累积漂移；好处是取消语义直白、与 Node 的可迭代行为一致。
 *   - signal 只按结构检查（aborted / addEventListener），因为没有 AbortController。
 */
import type { TimerOptions } from '../lib/timers-types';
declare const api: {
    setTimeout: (delayMs?: number, value?: unknown, options?: TimerOptions) => Promise<unknown>;
    setImmediate: (value?: unknown, options?: TimerOptions) => Promise<unknown>;
    setInterval: (delayMs: number, value?: unknown, options?: TimerOptions) => AsyncGenerator<unknown>;
    scheduler: {
        wait: (delayMs?: number, options?: TimerOptions) => Promise<void>;
        yield: () => Promise<void>;
    };
};
export = api;
