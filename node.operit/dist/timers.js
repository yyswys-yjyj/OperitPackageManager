'use strict';
/**
 * timers 模块。
 *
 * 宿主（Operit）提供 setTimeout / clearTimeout / setInterval / clearInterval 全局，
 * 所以这几个直接就是全局函数本身（Node 的 timers.setTimeout === 全局 setTimeout 也是这样）。
 *
 * setImmediate / clearImmediate 宿主没有，这里落在 setTimeout(…, 0) 上。
 * 与 Node 的差别：Node 的 setImmediate 在 check 阶段、先于定时器；这里两者同一个队列，
 * 因此 setImmediate(fn) 与 setTimeout(fn, 0) 是同一件事。已在 BUILTINS.json 写明。
 */
const timersPromises = require("./timers/promises");
const promisifyCustom = Symbol.for('nodejs.util.promisify.custom');
function setImmediate(handler, ...args) {
    return setTimeout(handler, 0, ...args);
}
function clearImmediate(handle) {
    clearTimeout(handle);
}
// promisify(setTimeout) 是很常见的写法，靠的就是 setTimeout 上的这个符号。
// 宿主已经有就不动它（Node 上它是只读 getter，赋值会直接抛），没有才补上。
if (Object.getOwnPropertyDescriptor(setTimeout, promisifyCustom) === undefined) {
    Object.defineProperty(setTimeout, promisifyCustom, {
        value: function (delayMs, value, options) {
            return timersPromises.setTimeout(delayMs, value, options);
        },
        writable: true,
        enumerable: false,
        configurable: true
    });
}
const api = {
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    setImmediate: setImmediate,
    clearImmediate: clearImmediate,
    promises: timersPromises
};
module.exports = api;
