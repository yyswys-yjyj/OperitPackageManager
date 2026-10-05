'use strict';
/**
 * Node stream 模块的移植：Readable / Writable / Duplex / Transform / PassThrough，
 * 以及 pipeline / finished（回调与 Promise 两种）。
 *
 * 实现取舍：
 *   - 调度用 queueMicrotask（QuickJS 不一定有 process.nextTick），语义上贴近 Node 的 nextTick；
 *     因此事件时序与 Node 是"同类但不必逐拍相同"，测试验证的是**语义**（数据、顺序、事件、
 *     背压返回值、错误传播），不是逐拍时序。
 *   - 不实现 objectMode 的完整语义差异（只影响 highWaterMark 的计数单位），
 *     也不实现 cork 的深度合并优化。
 *   - 未实现：stream.Duplex 的 allowHalfOpen 完整语义、compose、addAbortSignal。
 */
const EventEmitter = require("./events");
const buffer_1 = require("./buffer");
function schedule(fn) {
    queueMicrotask(fn);
}
function isThenable(value) {
    return value !== null && typeof value === 'object' && typeof value.then === 'function';
}
const readableStates = new WeakMap();
const writableStates = new WeakMap();
function readableStateOf(stream, options, highWaterMark) {
    let state = readableStates.get(stream);
    if (state === undefined) {
        state = {
            chunks: [],
            length: 0,
            flowing: null,
            ended: false,
            endEmitted: false,
            reading: false,
            destroyed: false,
            objectMode: options !== undefined && options.objectMode === true,
            highWaterMark: options !== undefined && typeof options.highWaterMark === 'number' ? options.highWaterMark : 16384,
            encoding: options !== undefined && typeof options.encoding === 'string' ? options.encoding : null,
            pipes: [],
            scheduled: false
        };
        void highWaterMark;
        readableStates.set(stream, state);
    }
    return state;
}
function writableStateOf(stream, options) {
    let state = writableStates.get(stream);
    if (state === undefined) {
        state = {
            queue: [],
            length: 0,
            writing: false,
            corked: 0,
            ending: false,
            finished: false,
            destroyed: false,
            objectMode: options !== undefined && (options.objectMode === true || options.writableObjectMode === true),
            highWaterMark: options !== undefined && typeof options.highWaterMark === 'number' ? options.highWaterMark : 16384,
            needDrain: false,
            finalizing: false
        };
        writableStates.set(stream, state);
    }
    return state;
}
function toChunk(chunk, encoding, objectMode) {
    if (objectMode) {
        return chunk;
    }
    if (typeof chunk === 'string') {
        return buffer_1.Buffer.from(chunk, (encoding === null ? 'utf8' : encoding));
    }
    if (chunk instanceof Uint8Array) {
        return chunk;
    }
    if (chunk instanceof ArrayBuffer) {
        return new Uint8Array(chunk);
    }
    throw new TypeError('The "chunk" argument must be of type string or an instance of Buffer or Uint8Array.');
}
function decodeChunk(chunk, encoding) {
    return encoding === null ? '' : buffer_1.Buffer.from(chunk).toString(encoding);
}
// ------------------------------------------------------------------ Readable
class Readable extends EventEmitter {
    constructor(options) {
        super();
        this.readable = true;
        readableStateOf(this, options);
        if (options !== undefined) {
            if (typeof options.read === 'function') {
                this._read = options.read;
            }
            if (typeof options.destroy === 'function') {
                this._destroy = options.destroy;
            }
        }
    }
    // 子类覆写
    _read(size) {
        void size;
        const state = readableStateOf(this);
        if (!state.ended) {
            const error = new Error('The _read() method is not implemented');
            error.code = 'ERR_METHOD_NOT_IMPLEMENTED';
            this.destroy(error);
        }
    }
    _destroy(error, callback) {
        callback(error);
    }
    push(chunk, encoding) {
        const state = readableStateOf(this);
        if (state.destroyed) {
            return false;
        }
        if (chunk === null) {
            state.ended = true;
            scheduleReadable(this);
            return false;
        }
        const value = toChunk(chunk, encoding === undefined ? state.encoding : encoding, state.objectMode);
        state.chunks.push(value);
        state.length += value.length;
        if (state.flowing === true) {
            scheduleReadable(this);
        }
        else {
            this.emit('readable');
        }
        return state.length < state.highWaterMark;
    }
    unshift(chunk) {
        const state = readableStateOf(this);
        const value = toChunk(chunk, state.encoding, state.objectMode);
        state.chunks.unshift(value);
        state.length += value.length;
    }
    read(size) {
        const state = readableStateOf(this);
        if (state.chunks.length === 0) {
            if (state.ended) {
                return null;
            }
            if (!state.reading) {
                state.reading = true;
                try {
                    this._read(state.highWaterMark);
                }
                finally {
                    state.reading = false;
                }
            }
            if (state.chunks.length === 0) {
                return null;
            }
        }
        const wanted = size === undefined || size === null || size <= 0 ? state.length : size;
        if (state.objectMode) {
            const first = state.chunks.shift();
            state.length -= first.length;
            return first;
        }
        if (wanted >= state.length) {
            const all = state.chunks.length === 1 ? state.chunks[0] : concat(state.chunks, state.length);
            state.chunks = [];
            state.length = 0;
            return all;
        }
        // 只取前 wanted 个字节
        const out = new Uint8Array(wanted);
        let filled = 0;
        while (filled < wanted && state.chunks.length > 0) {
            const head = state.chunks[0];
            const take = Math.min(head.length, wanted - filled);
            out.set(head.subarray(0, take), filled);
            filled += take;
            if (take === head.length) {
                state.chunks.shift();
            }
            else {
                state.chunks[0] = head.subarray(take);
            }
        }
        state.length -= filled;
        return out;
    }
    setEncoding(encoding) {
        const state = readableStateOf(this);
        state.encoding = encoding;
        return this;
    }
    pause() {
        const state = readableStateOf(this);
        state.flowing = false;
        this.emit('pause');
        return this;
    }
    resume() {
        const state = readableStateOf(this);
        state.flowing = true;
        this.emit('resume');
        scheduleReadable(this);
        return this;
    }
    isPaused() {
        return readableStateOf(this).flowing === false;
    }
    pipe(destination, options) {
        const state = readableStateOf(this);
        const shouldEnd = options === undefined || options.end !== false;
        state.pipes.push(destination);
        const onData = (chunk) => {
            if (destination.write(chunk) === false) {
                this.pause();
            }
        };
        const onDrain = () => {
            if (state.flowing === false) {
                this.resume();
            }
        };
        const onEnd = () => {
            destination.removeListener('drain', onDrain);
            if (shouldEnd) {
                destination.end();
            }
        };
        const onError = (error) => {
            destination.emit('error', error);
        };
        this.on('data', onData);
        destination.on('drain', onDrain);
        this.once('end', onEnd);
        this.once('error', onError);
        this.resume();
        return destination;
    }
    unpipe(destination) {
        const state = readableStateOf(this);
        state.pipes = destination === undefined
            ? []
            : state.pipes.filter(function (item) { return item !== destination; });
        return this;
    }
    destroy(error) {
        const state = readableStateOf(this);
        if (state.destroyed) {
            return this;
        }
        state.destroyed = true;
        this._destroy(error === undefined ? null : error, (finalError) => {
            if (finalError !== undefined && finalError !== null) {
                this.emit('error', finalError);
            }
            this.emit('close');
        });
        return this;
    }
    on(event, listener) {
        super.on(event, listener);
        if (event === 'data') {
            this.resume();
        }
        return this;
    }
    [Symbol.asyncIterator]() {
        const stream = this;
        const queue = [];
        let done = false;
        let failure = null;
        let waiting = null;
        const flush = () => {
            if (waiting === null) {
                return;
            }
            const resolve = waiting;
            if (queue.length > 0) {
                waiting = null;
                resolve({ value: queue.shift(), done: false });
                return;
            }
            if (failure !== null) {
                waiting = null;
                const error = failure;
                failure = null;
                resolve(Promise.reject(error));
                return;
            }
            if (done) {
                waiting = null;
                resolve({ value: undefined, done: true });
            }
        };
        stream.on('data', function (chunk) {
            queue.push(chunk);
            flush();
        });
        stream.on('end', function () {
            done = true;
            flush();
        });
        stream.on('error', function (error) {
            failure = error;
            flush();
        });
        return {
            next() {
                if (queue.length > 0) {
                    return Promise.resolve({ value: queue.shift(), done: false });
                }
                if (failure !== null) {
                    const error = failure;
                    failure = null;
                    return Promise.reject(error);
                }
                if (done) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                return new Promise(function (resolve) {
                    waiting = resolve;
                });
            }
        };
    }
    static from(iterable) {
        const source = iterable;
        const isAsync = typeof source[Symbol.asyncIterator] === 'function';
        const iterator = isAsync
            ? source[Symbol.asyncIterator].call(source)
            : source[Symbol.iterator].call(source);
        let busy = false;
        const stream = new Readable({
            objectMode: true,
            read: function () {
                if (busy) {
                    return;
                }
                busy = true;
                const step = () => {
                    const result = isAsync
                        ? iterator.next()
                        : iterator.next();
                    if (isThenable(result)) {
                        result.then(function (resolved) {
                            busy = false;
                            if (resolved.done === true) {
                                stream.push(null);
                            }
                            else {
                                stream.push(resolved.value);
                            }
                        }, function (error) {
                            busy = false;
                            stream.destroy(error);
                        });
                        return;
                    }
                    const value = result;
                    busy = false;
                    if (value.done === true) {
                        stream.push(null);
                    }
                    else {
                        stream.push(value.value);
                    }
                };
                step();
            }
        });
        return stream;
    }
}
function concat(chunks, total) {
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < chunks.length; i += 1) {
        out.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return out;
}
/** 把缓冲里的数据按需推给 'data' 监听器，并在结束时补一次 'end'。 */
function scheduleReadable(stream) {
    const state = readableStateOf(stream);
    if (state.scheduled || state.destroyed) {
        return;
    }
    state.scheduled = true;
    schedule(function () {
        state.scheduled = false;
        flow(stream);
    });
}
function takeBufferedChunk(state) {
    if (state.chunks.length === 0) {
        return undefined;
    }
    const chunk = state.chunks.shift();
    if (chunk === undefined) {
        return undefined;
    }
    state.length -= typeof chunk.length === 'number' ? chunk.length : 1;
    return chunk;
}
function flow(stream) {
    const state = readableStateOf(stream);
    if (state.destroyed) {
        return;
    }
    while (state.flowing === true && state.chunks.length > 0) {
        // 一次只发一块：Node 是每个 push() 对应一次 'data'，不是把缓冲拼起来发
        const chunk = takeBufferedChunk(state);
        if (chunk === undefined) {
            break;
        }
        if (state.encoding !== null && !state.objectMode) {
            stream.emit('data', decodeChunk(chunk, state.encoding));
        }
        else {
            stream.emit('data', chunk);
        }
    }
    if (state.chunks.length === 0 && !state.ended && state.flowing === true) {
        if (!state.reading) {
            state.reading = true;
            try {
                stream._read(state.highWaterMark);
            }
            finally {
                state.reading = false;
            }
        }
        if (state.chunks.length > 0) {
            scheduleReadable(stream);
            return;
        }
    }
    if (state.ended && state.chunks.length === 0 && !state.endEmitted) {
        if (state.flowing !== false) {
            state.endEmitted = true;
            stream.emit('end');
        }
    }
}
// ------------------------------------------------------------------ Writable
const writableMethods = {
    write(chunk, encoding, callback) {
        const stream = this;
        const state = writableStateOf(stream);
        let chunkEncoding = state.objectMode ? null : 'utf8';
        let done = function () { };
        if (typeof encoding === 'function') {
            done = encoding;
        }
        else {
            if (typeof encoding === 'string') {
                chunkEncoding = encoding;
            }
            if (typeof callback === 'function') {
                done = callback;
            }
        }
        if (state.destroyed) {
            const error = new Error('Cannot call write after a stream was destroyed');
            error.code = 'ERR_STREAM_DESTROYED';
            schedule(function () { done(error); });
            return false;
        }
        const bytes = toChunk(chunk, chunkEncoding, state.objectMode);
        state.queue.push({ chunk: bytes, callback: done });
        state.length += bytes.length;
        processWritableQueue(stream);
        const canContinue = state.length < state.highWaterMark;
        state.needDrain = !canContinue;
        return canContinue;
    },
    end(chunk, encoding, callback) {
        const stream = this;
        const state = writableStateOf(stream);
        let done;
        if (typeof chunk === 'function') {
            done = chunk;
        }
        else if (typeof encoding === 'function') {
            done = encoding;
        }
        else if (typeof callback === 'function') {
            done = callback;
        }
        if (typeof chunk !== 'function' && chunk !== undefined && chunk !== null) {
            this.write(chunk, encoding);
        }
        state.ending = true;
        if (done !== undefined) {
            stream.once('finish', done);
        }
        processWritableQueue(stream);
        return this;
    },
    cork() {
        const state = writableStateOf(this);
        state.corked += 1;
    },
    uncork() {
        const state = writableStateOf(this);
        if (state.corked > 0) {
            state.corked -= 1;
        }
        processWritableQueue(this);
    },
    setDefaultEncoding(encoding) {
        void encoding;
        return this;
    },
    destroy(error) {
        const state = writableStateOf(this);
        const stream = this;
        if (state.destroyed) {
            return this;
        }
        state.destroyed = true;
        const target = this;
        const finish = (finalError) => {
            if (finalError !== undefined && finalError !== null) {
                stream.emit('error', finalError);
            }
            stream.emit('close');
        };
        if (typeof target._destroy === 'function') {
            target._destroy(error === undefined ? null : error, finish);
        }
        else {
            finish(error === undefined ? null : error);
        }
        return this;
    }
};
/**
 * 队列排空后结束可写侧：先跑 _final（Transform 就是靠它在 _flush 后 push(null)），
 * 再发 'finish'。漏掉 _final 会让 Transform 的可读侧永远不结束 —— 这个坑踩过。
 */
function finalizeWritable(stream) {
    const state = writableStateOf(stream);
    const target = stream;
    const emitFinish = function (error) {
        state.finalizing = false;
        if (error !== undefined && error !== null) {
            stream.emit('error', error);
            return;
        }
        state.finished = true;
        stream.emit('finish');
    };
    if (typeof target._final !== 'function') {
        state.finalizing = true;
        emitFinish(null);
        return;
    }
    state.finalizing = true;
    target._final(emitFinish);
}
function processWritableQueue(stream) {
    const state = writableStateOf(stream);
    if (state.writing || state.corked > 0) {
        return;
    }
    const next = state.queue.shift();
    if (next === undefined) {
        if (state.ending && !state.finished && !state.finalizing) {
            finalizeWritable(stream);
        }
        return;
    }
    state.writing = true;
    // 在途的这一块也要计入 length —— Node 的 write() 返回值与 drain 时机都依赖这点
    const target = stream;
    const afterWrite = function (error) {
        state.writing = false;
        state.length -= next.chunk.length;
        if (error !== undefined && error !== null) {
            stream.emit('error', error);
            return;
        }
        next.callback(null);
        if (state.needDrain && state.length < state.highWaterMark) {
            state.needDrain = false;
            stream.emit('drain');
        }
        processWritableQueue(stream);
    };
    if (typeof target._write !== 'function') {
        const error = new Error('The _write() method is not implemented');
        error.code = 'ERR_METHOD_NOT_IMPLEMENTED';
        stream.emit('error', error);
        return;
    }
    target._write(next.chunk, 'buffer', afterWrite);
}
class Writable extends EventEmitter {
    constructor(options) {
        super();
        this.writable = true;
        writableStateOf(this, options);
        if (options !== undefined) {
            if (typeof options.write === 'function') {
                this._write = options.write;
            }
            if (typeof options.final === 'function') {
                this._final = options.final;
            }
            if (typeof options.destroy === 'function') {
                this._destroy = options.destroy;
            }
        }
    }
}
function applyWritable(target) {
    const source = writableMethods;
    Object.keys(source).forEach(function (key) {
        target[key] = source[key];
    });
}
applyWritable(Writable.prototype);
// ------------------------------------------------------------------ Duplex
class Duplex extends Readable {
    constructor(options) {
        super(options);
        this.writable = true;
        writableStateOf(this, options);
        if (options !== undefined) {
            if (typeof options.write === 'function') {
                this._write = options.write;
            }
            if (typeof options.final === 'function') {
                this._final = options.final;
            }
        }
    }
}
applyWritable(Duplex.prototype);
// ------------------------------------------------------------------ Transform
class Transform extends Duplex {
    constructor(options) {
        super(options);
        if (options !== undefined) {
            if (typeof options.transform === 'function') {
                this._transform = options.transform;
            }
            if (typeof options.flush === 'function') {
                this._flush = options.flush;
            }
        }
    }
    _transform(chunk, encoding, callback) {
        void chunk;
        void encoding;
        const error = new Error('The _transform() method is not implemented');
        error.code = 'ERR_METHOD_NOT_IMPLEMENTED';
        callback(error);
    }
    /** Transform 的可读侧由 _write 推入，不去主动拉数据，因此这里是空的。 */
    _read(size) {
        void size;
    }
    _flush(callback) {
        callback();
    }
    _write(chunk, encoding, callback) {
        const self = this;
        self._transform(chunk, encoding, function (error, data) {
            if (error !== undefined && error !== null) {
                callback(error);
                return;
            }
            if (data !== undefined && data !== null) {
                self.push(data);
            }
            callback(null);
        });
    }
    _final(callback) {
        const self = this;
        self._flush(function (error) {
            if (error !== undefined && error !== null) {
                callback(error);
                return;
            }
            self.push(null);
            callback(null);
        });
    }
}
// ------------------------------------------------------------------ PassThrough
class PassThrough extends Transform {
    _transform(chunk, encoding, callback) {
        void encoding;
        callback(null, chunk);
    }
}
// ------------------------------------------------------------------ pipeline / finished
function finished(stream, callback) {
    const target = stream;
    let done = false;
    const onError = (error) => {
        if (done) {
            return;
        }
        done = true;
        cleanup();
        callback(error);
    };
    const onEnd = () => {
        if (done) {
            return;
        }
        done = true;
        cleanup();
        callback(null);
    };
    const cleanup = () => {
        target.removeListener('error', onError);
        target.removeListener('end', onEnd);
        target.removeListener('finish', onEnd);
        target.removeListener('close', onEnd);
    };
    target.on('error', onError);
    target.once('end', onEnd);
    target.once('finish', onEnd);
    target.once('close', onEnd);
    return cleanup;
}
function isReadableStream(value) {
    return value !== null && typeof value === 'object' && typeof value.on === 'function' &&
        typeof value.read === 'function';
}
function isWritableStream(value) {
    return value !== null && typeof value === 'object' && typeof value.write === 'function' &&
        typeof value.end === 'function';
}
function pipeline(...args) {
    const callback = args.length > 0 && typeof args[args.length - 1] === 'function'
        ? args.pop()
        : undefined;
    if (callback === undefined) {
        // 与 Node 一致：stream.pipeline 必须给回调，Promise 形式走 stream/promises
        const error = new TypeError('The "streams[stream.length - 1]" property must be of type function.');
        error.code = 'ERR_INVALID_ARG_TYPE';
        throw error;
    }
    const streams = args;
    const transforms = streams.filter(function (item) {
        return typeof item !== 'function';
    });
    if (transforms.length === 0) {
        if (callback !== undefined) {
            schedule(function () { callback(null); });
            return undefined;
        }
        return Promise.resolve();
    }
    const last = transforms[transforms.length - 1];
    const failures = [];
    const promise = new Promise(function (resolve, reject) {
        let settled = false;
        const fail = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            const value = error;
            if (callback !== undefined) {
                callback(value);
                resolve();
            }
            else {
                reject(value);
            }
        };
        if (callback !== undefined) {
            finished(last, function (error) {
                if (error !== undefined && error !== null) {
                    fail(error);
                    return;
                }
                if (settled) {
                    return;
                }
                settled = true;
                callback(null);
                resolve();
            });
        }
        else {
            finished(last, function (error) {
                if (error !== undefined && error !== null) {
                    fail(error);
                    return;
                }
                if (!settled) {
                    settled = true;
                    resolve();
                }
            });
        }
        for (let i = 0; i < transforms.length; i += 1) {
            const current = transforms[i];
            current.on('error', fail);
            if (i + 1 < transforms.length) {
                transforms[i].pipe(transforms[i + 1]);
            }
        }
        void failures;
    });
    promise.catch(function (error) { callback(error); });
    return last;
}
/** stream/promises 用的 Promise 版：不走 pipeline 的回调校验。 */
function pipelinePromise(...streams) {
    const list = streams;
    return new Promise(function (resolve, reject) {
        if (list.length === 0) {
            resolve();
            return;
        }
        let settled = false;
        // 参数收成 unknown：既能喂给 finished，也能直接当 EventEmitter 的错误监听器
        const settle = function (error) {
            if (settled) {
                return;
            }
            settled = true;
            if (error !== undefined && error !== null) {
                reject(error);
            }
            else {
                resolve();
            }
        };
        finished(list[list.length - 1], settle);
        for (let i = 0; i < list.length; i += 1) {
            list[i].on('error', settle);
            if (i + 1 < list.length) {
                list[i].pipe(list[i + 1]);
            }
        }
    });
}
function finishedPromise(stream) {
    return new Promise(function (resolve, reject) {
        finished(stream, function (error) {
            if (error !== undefined && error !== null) {
                reject(error);
            }
            else {
                resolve();
            }
        });
    });
}
// ------------------------------------------------------------------ 导出
class Stream extends EventEmitter {
}
Stream.Readable = Readable;
Stream.Writable = Writable;
Stream.Duplex = Duplex;
Stream.Transform = Transform;
Stream.PassThrough = PassThrough;
Stream.Stream = Stream;
Stream.pipeline = pipeline;
Stream.finished = finished;
Stream.promises = { pipeline: pipelinePromise, finished: finishedPromise };
Stream.isReadable = isReadableStream;
Stream.isWritable = isWritableStream;
module.exports = Stream;
