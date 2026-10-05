import type { TimerOptions } from './lib/timers-types';
declare function setImmediate(handler: (...args: unknown[]) => void, ...args: unknown[]): unknown;
declare function clearImmediate(handle: unknown): void;
declare const api: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
    setImmediate: typeof setImmediate;
    clearImmediate: typeof clearImmediate;
    promises: {
        setTimeout: (delayMs?: number, value?: unknown, options?: TimerOptions) => Promise<unknown>;
        setImmediate: (value?: unknown, options?: TimerOptions) => Promise<unknown>;
        setInterval: (delayMs: number, value?: unknown, options?: TimerOptions) => AsyncGenerator<unknown>;
        scheduler: {
            wait: (delayMs?: number, options?: TimerOptions) => Promise<void>;
            yield: () => Promise<void>;
        };
    };
};
export = api;
