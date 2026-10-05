'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = get;
exports.set = set;
/**
 * 当前工作目录的唯一持有者。
 *
 * path.resolve 需要 cwd，而 cwd 的语义由 fs 的环境状态机决定（环境 = 根 + cwd + 能力）。
 * 独立成模块是为了打破 path 与 fs 之间的循环依赖：path 只读，fs / process 只写。
 */
let current = '/';
function get() {
    return current;
}
function set(next) {
    if (typeof next !== 'string' || next.length === 0) {
        throw new TypeError('cwd 必须是非空字符串，收到 ' + describe(next));
    }
    current = next;
}
function describe(value) {
    if (typeof value === 'string') {
        return "'" + value + "'";
    }
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    return String(value);
}
