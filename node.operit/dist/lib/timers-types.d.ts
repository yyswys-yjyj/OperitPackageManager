/**
 * timers 的公开类型。
 *
 * 独立成文件的原因与其他 types 文件相同：timers.ts / timers/promises.ts 用 `export =`
 * 导出模块本体，无法再导出类型，而 index.ts 聚合时要求这些名字是"可命名"的。
 *
 * signal 用的是结构类型而不是 AbortSignal：QuickJS 不保证提供 AbortController，
 * 而打包后的代码可能传入 Node/浏览器那边的实现，只要形状对就行。
 */
export interface AbortSignalLike {
    aborted?: boolean;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
}
export interface TimerOptions {
    signal?: AbortSignalLike;
    ref?: boolean;
}
