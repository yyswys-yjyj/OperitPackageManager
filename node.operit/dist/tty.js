'use strict';
/**
 * tty 模块。
 *
 * Operit 沙箱里没有终端，所以：
 *   - isatty() 一律 false（这正是 supports-color / debug 这类包需要知道的答案）；
 *   - ReadStream / WriteStream 需要真实终端，构造时显式抛 ONJ_UNSUPPORTED，
 *     不放一个"能 new 但不能用"的空壳。
 */
const errors_1 = require("./lib/errors");
function isatty() {
    return false;
}
function ReadStream() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'tty.ReadStream 需要真实终端，Operit 沙箱里没有终端。');
}
function WriteStream() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'tty.WriteStream 需要真实终端，Operit 沙箱里没有终端。');
}
const api = {
    isatty: isatty,
    ReadStream: ReadStream,
    WriteStream: WriteStream
};
module.exports = api;
