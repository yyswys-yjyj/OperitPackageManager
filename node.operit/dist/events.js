'use strict';
const registry = new WeakMap();
/** Node 用它旁听 error 事件而不消费它。 */
const errorMonitor = Symbol.for('nodejs.errorMonitor');
function stateOf(emitter) {
    let current = registry.get(emitter);
    if (current === undefined) {
        current = { events: new Map(), maxListeners: 0 };
        registry.set(emitter, current);
    }
    return current;
}
function listenersOf(emitter, name, create) {
    const state = stateOf(emitter);
    let list = state.events.get(name);
    if (list === undefined && create) {
        list = [];
        state.events.set(name, list);
    }
    return list;
}
function unwrap(entry) {
    const fn = entry.fn;
    return entry.once && typeof fn.listener === 'function' ? fn.listener : entry.fn;
}
function indexFromEnd(list, fn) {
    for (let i = list.length - 1; i >= 0; i -= 1) {
        if (unwrap(list[i]) === fn || list[i].fn === fn) {
            return i;
        }
    }
    return -1;
}
class EventEmitter {
    static listenerCount(emitter, name) {
        return emitter.listenerCount(name);
    }
    static getEventListeners(emitter, name) {
        return emitter.listeners(name);
    }
    static once(emitter, name) {
        return new Promise(function (resolve, reject) {
            function onEvent(...args) {
                emitter.removeListener(name, onError);
                resolve(args);
            }
            function onError(error) {
                emitter.removeListener(name, onEvent);
                reject(error);
            }
            emitter.once(name, onEvent);
            if (name !== 'error') {
                emitter.once('error', onError);
            }
        });
    }
    static on(emitter, name) {
        void emitter;
        void name;
        throw new Error('node.operit 尚未实现 events.on()（异步迭代器）。');
    }
    constructor() {
        stateOf(this);
    }
    get maxListeners() {
        const current = stateOf(this).maxListeners;
        return current === 0 ? EventEmitter.defaultMaxListeners : current;
    }
    set maxListeners(value) {
        this.setMaxListeners(value);
    }
    setMaxListeners(count) {
        const normalized = Number(count);
        if (normalized < 0 || !isFinite(normalized)) {
            throw new RangeError('The value of "n" is out of range. It must be a non-negative number.');
        }
        stateOf(this).maxListeners = Math.floor(normalized);
        return this;
    }
    getMaxListeners() {
        return this.maxListeners;
    }
    on(name, listener) {
        return this.addEntry(name, listener, false);
    }
    addListener(name, listener) {
        return this.addEntry(name, listener, false);
    }
    prependListener(name, listener) {
        return this.addEntry(name, listener, false, true);
    }
    once(name, listener) {
        return this.addEntry(name, listener, true);
    }
    prependOnceListener(name, listener) {
        return this.addEntry(name, listener, true, true);
    }
    /** 内部注册入口。Node 的 EventEmitter 没有它，但 Process 只以实例导出，成员必须是 public。 */
    addEntry(name, listener, once, prepend = false) {
        if (typeof listener !== 'function') {
            throw new TypeError('The "listener" argument must be of type function.');
        }
        const list = listenersOf(this, name, true);
        if (list === undefined) {
            return this;
        }
        const emitter = this;
        let stored;
        if (once) {
            // once 的包装器自己摘除自己（与 Node 一致：emit 不做预先移除），
            // 并在 .listener 上保留原函数，供 listeners() / rawListeners() 区分。
            const wrapped = function (...args) {
                removeEntry(emitter, name, wrapped);
                listener.apply(emitter, args);
            };
            wrapped.listener = listener;
            stored = { fn: wrapped, once: true };
        }
        else {
            stored = { fn: listener, once: false };
        }
        if (prepend) {
            list.unshift(stored);
        }
        else {
            list.push(stored);
        }
        return this;
    }
    emit(name, ...args) {
        const list = listenersOf(this, name, false);
        const monitor = name === 'error' ? listenersOf(this, errorMonitor, false) : undefined;
        if ((list === undefined || list.length === 0) && (monitor === undefined || monitor.length === 0)) {
            if (name === 'error') {
                const first = args[0];
                if (first instanceof Error) {
                    throw first;
                }
                const error = new Error('Unhandled error.' + (first === undefined ? '' : ' (' + String(first) + ')'));
                error.context = first;
                throw error;
            }
            return false;
        }
        if (monitor !== undefined) {
            for (let i = 0; i < monitor.length; i += 1) {
                monitor[i].fn.apply(this, args);
            }
        }
        if (list === undefined || list.length === 0) {
            return false;
        }
        const snapshot = list.slice();
        for (let i = 0; i < snapshot.length; i += 1) {
            const entry = snapshot[i];
            if (entry.once && indexOfEntry(list, entry.fn) < 0) {
                continue;
            }
            entry.fn.apply(this, args);
        }
        return true;
    }
    removeListener(name, listener) {
        return this.off(name, listener);
    }
    off(name, listener) {
        const list = listenersOf(this, name, false);
        if (list === undefined) {
            return this;
        }
        const index = indexFromEnd(list, listener);
        if (index >= 0) {
            list.splice(index, 1);
            if (list.length === 0) {
                stateOf(this).events.delete(name);
            }
        }
        return this;
    }
    removeAllListeners(name) {
        const state = stateOf(this);
        if (name === undefined) {
            state.events.clear();
            return this;
        }
        state.events.delete(name);
        return this;
    }
    listeners(name) {
        const list = listenersOf(this, name, false);
        if (list === undefined) {
            return [];
        }
        return list.map(unwrap);
    }
    rawListeners(name) {
        const list = listenersOf(this, name, false);
        if (list === undefined) {
            return [];
        }
        return list.map(function (entry) {
            return entry.fn;
        });
    }
    listenerCount(name) {
        const list = listenersOf(this, name, false);
        return list === undefined ? 0 : list.length;
    }
    eventNames() {
        return Array.from(stateOf(this).events.keys());
    }
}
EventEmitter.defaultMaxListeners = 10;
EventEmitter.errorMonitor = errorMonitor;
EventEmitter.EventEmitter = EventEmitter;
function indexOfEntry(list, fn) {
    for (let i = 0; i < list.length; i += 1) {
        if (list[i].fn === fn) {
            return i;
        }
    }
    return -1;
}
function removeEntry(emitter, name, fn) {
    const list = listenersOf(emitter, name, false);
    if (list === undefined) {
        return;
    }
    const index = indexOfEntry(list, fn);
    if (index >= 0) {
        list.splice(index, 1);
        if (list.length === 0) {
            stateOf(emitter).events.delete(name);
        }
    }
}
module.exports = EventEmitter;
