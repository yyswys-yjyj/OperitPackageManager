/**
 * Node events 模块的移植（EventEmitter）。
 *
 * 与 Node 的差异（有意为之）：
 *   - 本实现是 ES class，不能用 `EventEmitter.call(this)` 这种函数式继承；
 *     现代代码一律走 `class X extends EventEmitter`，不受影响。
 *   - `captureRejections` 与 `events.on()`（异步迭代器）未实现。
 */
type EventListener = (...args: unknown[]) => void;
type EventName = string | symbol;
declare class EventEmitter {
    static defaultMaxListeners: number;
    static errorMonitor: symbol;
    static EventEmitter: typeof EventEmitter;
    static listenerCount(emitter: EventEmitter, name: EventName): number;
    static getEventListeners(emitter: EventEmitter, name: EventName): EventListener[];
    static once(emitter: EventEmitter, name: EventName): Promise<unknown[]>;
    static on(emitter: EventEmitter, name: EventName): void;
    constructor();
    get maxListeners(): number;
    set maxListeners(value: number);
    setMaxListeners(count: number): this;
    getMaxListeners(): number;
    on(name: EventName, listener: EventListener): this;
    addListener(name: EventName, listener: EventListener): this;
    prependListener(name: EventName, listener: EventListener): this;
    once(name: EventName, listener: EventListener): this;
    prependOnceListener(name: EventName, listener: EventListener): this;
    /** 内部注册入口。Node 的 EventEmitter 没有它，但 Process 只以实例导出，成员必须是 public。 */
    addEntry(name: EventName, listener: EventListener, once: boolean, prepend?: boolean): this;
    emit(name: EventName, ...args: unknown[]): boolean;
    removeListener(name: EventName, listener: EventListener): this;
    off(name: EventName, listener: EventListener): this;
    removeAllListeners(name?: EventName): this;
    listeners(name: EventName): EventListener[];
    rawListeners(name: EventName): EventListener[];
    listenerCount(name: EventName): number;
    eventNames(): EventName[];
}
export = EventEmitter;
