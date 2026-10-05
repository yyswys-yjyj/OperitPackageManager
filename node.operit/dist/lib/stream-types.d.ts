/**
 * stream 的公开类型。
 *
 * 独立成文件的原因与 path-types / zlib-types 相同：stream.ts 用 `export =` 导出模块本体，
 * 无法再导出类型，而 index.ts 聚合时要求这些名字是"可命名"的。
 */
/** 只有可写侧被用到的结构类型：pipe 的终点不需要是完整的 Writable。 */
export interface WritableLike {
    write(chunk: unknown, encoding?: unknown, callback?: unknown): boolean;
    end(chunk?: unknown, encoding?: unknown, callback?: unknown): void;
    on(event: string, listener: (...args: unknown[]) => void): unknown;
    once(event: string, listener: (...args: unknown[]) => void): unknown;
    removeListener(event: string, listener: (...args: unknown[]) => void): unknown;
    emit(event: string, ...args: unknown[]): boolean;
    readonly writable?: boolean;
}
export interface StreamOptions {
    highWaterMark?: number;
    objectMode?: boolean;
    encoding?: string;
    read?: (this: unknown, size: number) => void;
    write?: (chunk: unknown, encoding: string, callback: (error?: Error | null) => void) => void;
    transform?: (chunk: unknown, encoding: string, callback: (error?: Error | null, data?: unknown) => void) => void;
    flush?: (callback: (error?: Error | null) => void) => void;
    final?: (callback: (error?: Error | null) => void) => void;
    destroy?: (error: Error | null, callback: (error?: Error | null) => void) => void;
    writableObjectMode?: boolean;
    readableObjectMode?: boolean;
}
