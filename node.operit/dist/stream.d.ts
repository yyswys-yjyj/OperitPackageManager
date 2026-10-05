/**
 * Node stream 模块的移植：Readable / Writable / Duplex / Transform / PassThrough，
 * 以及 pipeline / finished（回调与 Promise 两种）。
 *
 * 实现取舍：
 *   - 调度用 queueMicrotask（QuickJS 不一定有 process.nextTick），语义上贴近 Node 的 nextTick；
 *     因此事件时序与 Node 是"同类但不必逐拍相同"，测试验证的是**语义**（数据、顺序、事件、
 *     背压返回值、错误传播），不是逐拍时序。
 *   - 不实现 objectMode 的完整语义差异（只影响 highWaterMark 的计数单位），
 *     也不实现 cork 的深度合并优化。
 *   - 未实现：stream.Duplex 的 allowHalfOpen 完整语义、compose、addAbortSignal。
 */
import EventEmitter = require('./events');
import type { StreamOptions, WritableLike } from './lib/stream-types';
declare class Readable extends EventEmitter {
    readable: boolean;
    constructor(options?: StreamOptions);
    _read(size: number): void;
    _destroy(error: Error | null, callback: (error?: Error | null) => void): void;
    push(chunk: unknown, encoding?: string): boolean;
    unshift(chunk: unknown): void;
    read(size?: number): unknown;
    setEncoding(encoding: string): this;
    pause(): this;
    resume(): this;
    isPaused(): boolean;
    pipe<T extends WritableLike>(destination: T, options?: {
        end?: boolean;
    }): T;
    unpipe(destination?: WritableLike): this;
    destroy(error?: Error | null): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
    [Symbol.asyncIterator](): {
        next(): Promise<{
            value: unknown;
            done: boolean;
        }>;
    };
    static from(iterable: unknown): Readable;
}
declare class Writable extends EventEmitter {
    writable: boolean;
    constructor(options?: StreamOptions);
}
declare class Duplex extends Readable {
    writable: boolean;
    constructor(options?: StreamOptions);
}
declare class Transform extends Duplex {
    constructor(options?: StreamOptions);
    _transform(chunk: unknown, encoding: string, callback: (error?: Error | null, data?: unknown) => void): void;
    /** Transform 的可读侧由 _write 推入，不去主动拉数据，因此这里是空的。 */
    _read(size: number): void;
    _flush(callback: (error?: Error | null) => void): void;
    _write(chunk: unknown, encoding: string, callback: (error?: Error | null) => void): void;
    _final(callback: (error?: Error | null) => void): void;
}
declare class PassThrough extends Transform {
    _transform(chunk: unknown, encoding: string, callback: (error?: Error | null, data?: unknown) => void): void;
}
declare function finished(stream: WritableLike | Readable, callback: (error?: Error | null) => void): () => void;
declare function isReadableStream(value: unknown): boolean;
declare function isWritableStream(value: unknown): boolean;
declare function pipeline(...args: unknown[]): unknown;
/** stream/promises 用的 Promise 版：不走 pipeline 的回调校验。 */
declare function pipelinePromise(...streams: unknown[]): Promise<void>;
declare function finishedPromise(stream: unknown): Promise<void>;
declare class Stream extends EventEmitter {
    static Readable: typeof Readable;
    static Writable: typeof Writable;
    static Duplex: typeof Duplex;
    static Transform: typeof Transform;
    static PassThrough: typeof PassThrough;
    static Stream: typeof Stream;
    static pipeline: typeof pipeline;
    static finished: typeof finished;
    static promises: {
        pipeline: typeof pipelinePromise;
        finished: typeof finishedPromise;
    };
    static isReadable: typeof isReadableStream;
    static isWritable: typeof isWritableStream;
}
export = Stream;
