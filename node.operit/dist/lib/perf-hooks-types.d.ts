/**
 * perf_hooks 的公开类型。
 *
 * 独立成文件的原因与其他 types 文件相同：perf_hooks.ts 用 `export =` 导出模块本体，
 * 无法再导出类型，而 index.ts 聚合时要求这些名字是"可命名"的。
 */
export interface PerformanceEntryLike {
    name: string;
    entryType: string;
    startTime: number;
    duration: number;
    detail?: unknown;
}
export interface MeasureOptions {
    start?: string | number;
    end?: string | number;
    detail?: unknown;
}
