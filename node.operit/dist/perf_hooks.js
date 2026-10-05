'use strict';
const entries = [];
const markTimes = new Map();
const timeOrigin = Date.now() - performance.now();
function now() {
    return performance.now();
}
function makeEntry(name, entryType, startTime, duration, detail) {
    const entry = {
        name: name,
        entryType: entryType,
        startTime: startTime,
        duration: duration
    };
    if (detail !== undefined) {
        entry.detail = detail;
    }
    return entry;
}
/** options 形式：start/end 既可以是 mark 名字，也可以是时间戳。 */
function resolveOptionTime(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    if (typeof value === 'number') {
        return value;
    }
    const marked = markTimes.get(value);
    return marked === undefined ? fallback : marked;
}
/**
 * 位置参数形式：startMark / endMark **只当 mark 名字**，不认数字。
 * 这是实测 Node 的行为 —— measure('x', 10, 30) 在 Node 里是"找名叫 10 和 30 的 mark"，
 * 找不到就是 start=0、end=now()，而不是把 10/30 当时间戳。
 */
function resolveMarkName(value, fallback) {
    if (value === undefined) {
        return fallback;
    }
    const marked = markTimes.get(String(value));
    return marked === undefined ? fallback : marked;
}
function mark(name, options) {
    const label = String(name);
    const startTime = now();
    markTimes.set(label, startTime);
    const entry = makeEntry(label, 'mark', startTime, 0, options === undefined ? undefined : options.detail);
    entries.push(entry);
    return entry;
}
function measure(name, startOrOptions, endMark) {
    const label = String(name);
    let start = 0;
    let end = now();
    let detail;
    if (startOrOptions !== undefined && typeof startOrOptions === 'object') {
        start = resolveOptionTime(startOrOptions.start, 0);
        end = resolveOptionTime(startOrOptions.end, now());
        detail = startOrOptions.detail;
    }
    else {
        start = resolveMarkName(startOrOptions, 0);
        end = resolveMarkName(endMark, now());
    }
    const entry = makeEntry(label, 'measure', start, end - start, detail);
    entries.push(entry);
    return entry;
}
function getEntries() {
    return entries.slice();
}
function getEntriesByName(name, type) {
    const label = String(name);
    return entries.filter(function (entry) {
        if (entry.name !== label) {
            return false;
        }
        return type === undefined || entry.entryType === String(type);
    });
}
function getEntriesByType(type) {
    const wanted = String(type);
    return entries.filter(function (entry) {
        return entry.entryType === wanted;
    });
}
function clearMarks(name) {
    const label = name === undefined ? undefined : String(name);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType !== 'mark') {
            continue;
        }
        if (label === undefined || entries[i].name === label) {
            entries.splice(i, 1);
        }
    }
    if (label === undefined) {
        markTimes.clear();
    }
    else {
        markTimes.delete(label);
    }
}
function clearMeasures(name) {
    const label = name === undefined ? undefined : String(name);
    for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType !== 'measure') {
            continue;
        }
        if (label === undefined || entries[i].name === label) {
            entries.splice(i, 1);
        }
    }
}
const performanceApi = {
    now: now,
    timeOrigin: timeOrigin,
    mark: mark,
    measure: measure,
    getEntries: getEntries,
    getEntriesByName: getEntriesByName,
    getEntriesByType: getEntriesByType,
    clearMarks: clearMarks,
    clearMeasures: clearMeasures
};
/** 与 Node 的 perf_hooks.constants 一致。 */
const constants = {
    NODE_PERFORMANCE_GC_MAJOR: 4,
    NODE_PERFORMANCE_GC_MINOR: 1,
    NODE_PERFORMANCE_GC_INCREMENTAL: 8,
    NODE_PERFORMANCE_GC_WEAKCB: 16,
    NODE_PERFORMANCE_GC_FLAGS_NO: 0,
    NODE_PERFORMANCE_GC_FLAGS_CONSTRUCT_RETAINED: 2,
    NODE_PERFORMANCE_GC_FLAGS_FORCED: 4,
    NODE_PERFORMANCE_GC_FLAGS_SYNCHRONOUS_PHANTOM_PROCESSING: 8,
    NODE_PERFORMANCE_GC_FLAGS_ALL_AVAILABLE_GARBAGE: 16,
    NODE_PERFORMANCE_GC_FLAGS_ALL_EXTERNAL_MEMORY: 32,
    NODE_PERFORMANCE_GC_FLAGS_SCHEDULE_IDLE: 64
};
const api = {
    performance: performanceApi,
    constants: constants
};
module.exports = api;
