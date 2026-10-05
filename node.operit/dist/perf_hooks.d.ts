/**
 * perf_hooks 模块（部分）。
 *
 * 宿主提供 `performance.now()`，但只有这一个方法；mark / measure / getEntries 这些
 * 由本模块自己维护一张表实现，与 Node 的语义对齐（含 measure 的两种调用形式）。
 *
 * 未实现：PerformanceObserver、PerformanceEntry 等类、monitorEventLoopDelay、
 * createHistogram。这些要么依赖 V8/Node 的观测能力，要么在沙箱里没有意义；
 * 保持 undefined 而不是给空壳。
 */
import type { MeasureOptions, PerformanceEntryLike } from './lib/perf-hooks-types';
declare function now(): number;
declare function mark(name: unknown, options?: {
    detail?: unknown;
}): PerformanceEntryLike;
declare function measure(name: unknown, startOrOptions?: string | number | MeasureOptions, endMark?: string | number): PerformanceEntryLike;
declare function getEntries(): PerformanceEntryLike[];
declare function getEntriesByName(name: unknown, type?: unknown): PerformanceEntryLike[];
declare function getEntriesByType(type: unknown): PerformanceEntryLike[];
declare function clearMarks(name?: unknown): void;
declare function clearMeasures(name?: unknown): void;
declare const api: {
    performance: {
        now: typeof now;
        timeOrigin: number;
        mark: typeof mark;
        measure: typeof measure;
        getEntries: typeof getEntries;
        getEntriesByName: typeof getEntriesByName;
        getEntriesByType: typeof getEntriesByType;
        clearMarks: typeof clearMarks;
        clearMeasures: typeof clearMeasures;
    };
    constants: Record<string, number>;
};
export = api;
