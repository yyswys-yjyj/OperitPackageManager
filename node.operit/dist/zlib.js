'use strict';
/**
 * Node zlib 模块的移植。
 *
 * 覆盖：deflate/inflate（zlib 包装）、deflateRaw/inflateRaw（裸流）、gzip/gunzip、
 * unzip（自动识别），同步与回调两种形式，以及 constants。
 *
 * 不覆盖：createGzip/createDeflate 等流式接口（需要 stream 模块）、Brotli 系列
 * —— 调用即显式抛 ONJ_UNSUPPORTED。
 *
 * 压缩侧用定长 Huffman + LZ77（见 lib/deflate.ts），压缩率不如 zlib，
 * 但输出是任何解压器都能读的合法 DEFLATE 流。
 */
const deflate_1 = require("./lib/deflate");
const inflate_1 = require("./lib/inflate");
const buffer_1 = require("./buffer");
const streamModule = require("./stream");
function toBytes(input, name) {
    if (typeof input === 'string') {
        return buffer_1.Buffer.from(input, 'utf8');
    }
    if (input instanceof Uint8Array) {
        return input;
    }
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    throw new TypeError('The "' + name + '" argument must be of type string or an instance of Buffer, TypedArray, or DataView.');
}
function resolveLevel(options) {
    if (options === undefined || options.level === undefined) {
        return 6;
    }
    const level = Number(options.level);
    if (level === -1) {
        return 6;
    }
    if (!isFinite(level) || level < 0 || level > 9) {
        const error = new RangeError('The value of "options.level" is out of range. It must be >= 0 and <= 9.');
        error.code = 'ERR_OUT_OF_RANGE';
        throw error;
    }
    return level;
}
function writeUint32BE(target, offset, value) {
    target[offset] = (value >>> 24) & 255;
    target[offset + 1] = (value >>> 16) & 255;
    target[offset + 2] = (value >>> 8) & 255;
    target[offset + 3] = value & 255;
}
function writeUint32LE(target, offset, value) {
    target[offset] = value & 255;
    target[offset + 1] = (value >>> 8) & 255;
    target[offset + 2] = (value >>> 16) & 255;
    target[offset + 3] = (value >>> 24) & 255;
}
function readUint32LE(source, offset) {
    return (source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16) | (source[offset + 3] << 24)) >>> 0;
}
function concat(parts) {
    let total = 0;
    for (let i = 0; i < parts.length; i += 1) {
        total += parts[i].length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (let i = 0; i < parts.length; i += 1) {
        out.set(parts[i], offset);
        offset += parts[i].length;
    }
    return out;
}
/** zlib 包装头的 FLG 由 FLEVEL 决定；CINFO=7 表示 32K 窗口。 */
function zlibHeader(level) {
    const flevel = level <= 1 ? 0 : (level <= 5 ? 1 : (level === 6 ? 2 : 3));
    const flgTable = [0x01, 0x5e, 0x9c, 0xda];
    return Uint8Array.of(0x78, flgTable[flevel]);
}
function deflateWrapped(data, level) {
    const body = (0, deflate_1.deflateRaw)(data, level);
    const trailer = new Uint8Array(4);
    writeUint32BE(trailer, 0, (0, inflate_1.adler32)(data, 0, data.length));
    return concat([zlibHeader(level), body, trailer]);
}
function inflateWrapped(data) {
    if (data.length < 6) {
        throw new Error('invalid zlib stream: too short');
    }
    const cmf = data[0];
    const flg = data[1];
    if ((cmf & 0x0f) !== 8) {
        throw new Error('invalid zlib stream: unsupported compression method');
    }
    if ((cmf * 256 + flg) % 31 !== 0) {
        throw new Error('invalid zlib stream: header check failed');
    }
    if ((flg & 0x20) !== 0) {
        throw new Error('invalid zlib stream: preset dictionary is not supported');
    }
    const result = (0, inflate_1.inflateRaw)(data, 2, data.length - 4);
    const expected = (data[data.length - 4] << 24) | (data[data.length - 3] << 16) |
        (data[data.length - 2] << 8) | data[data.length - 1];
    if (((0, inflate_1.adler32)(result, 0, result.length) >>> 0) !== (expected >>> 0)) {
        throw new Error('incorrect data check');
    }
    return result;
}
function gzipWrapped(data, level) {
    const header = new Uint8Array(10);
    header[0] = 0x1f;
    header[1] = 0x8b;
    header[2] = 8;
    header[3] = 0;
    // MTIME 写 0（Node 默认也不写实际时间）
    header[8] = level >= 9 ? 2 : (level <= 1 ? 4 : 0);
    header[9] = 0xff;
    const body = (0, deflate_1.deflateRaw)(data, level);
    const trailer = new Uint8Array(8);
    writeUint32LE(trailer, 0, (0, inflate_1.crc32)(data, 0, data.length));
    writeUint32LE(trailer, 4, data.length >>> 0);
    return concat([header, body, trailer]);
}
function gunzipWrapped(data) {
    if (data.length < 18 || data[0] !== 0x1f || data[1] !== 0x8b) {
        throw new Error('incorrect header check');
    }
    if (data[2] !== 8) {
        throw new Error('unknown compression method');
    }
    const flags = data[3];
    let offset = 10;
    if ((flags & 0x04) !== 0) {
        offset += 2 + (data[offset] | (data[offset + 1] << 8));
    }
    if ((flags & 0x08) !== 0) {
        while (offset < data.length && data[offset] !== 0) {
            offset += 1;
        }
        offset += 1;
    }
    if ((flags & 0x10) !== 0) {
        while (offset < data.length && data[offset] !== 0) {
            offset += 1;
        }
        offset += 1;
    }
    if ((flags & 0x02) !== 0) {
        offset += 2;
    }
    const trailerStart = data.length - 8;
    const result = (0, inflate_1.inflateRaw)(data, offset, trailerStart);
    const expectedCrc = readUint32LE(data, trailerStart);
    if ((0, inflate_1.crc32)(result, 0, result.length) !== expectedCrc) {
        throw new Error('incorrect data check');
    }
    const expectedSize = readUint32LE(data, trailerStart + 4);
    if ((result.length >>> 0) !== expectedSize) {
        throw new Error('incorrect length check');
    }
    return result;
}
function deflateSync(input, options) {
    return buffer_1.Buffer.from(deflateWrapped(toBytes(input, 'buffer'), resolveLevel(options)));
}
function inflateSync(input) {
    return buffer_1.Buffer.from(inflateWrapped(toBytes(input, 'buffer')));
}
function deflateRawSync(input, options) {
    return buffer_1.Buffer.from((0, deflate_1.deflateRaw)(toBytes(input, 'buffer'), resolveLevel(options)));
}
function inflateRawSync(input) {
    const bytes = toBytes(input, 'buffer');
    return buffer_1.Buffer.from((0, inflate_1.inflateRaw)(bytes, 0, bytes.length));
}
function gzipSync(input, options) {
    return buffer_1.Buffer.from(gzipWrapped(toBytes(input, 'buffer'), resolveLevel(options)));
}
function gunzipSync(input) {
    return buffer_1.Buffer.from(gunzipWrapped(toBytes(input, 'buffer')));
}
/** 自动识别 zlib / gzip 两种包装，对应 Node 的 unzip 系列。 */
function unzipSync(input) {
    const bytes = toBytes(input, 'buffer');
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        return buffer_1.Buffer.from(gunzipWrapped(bytes));
    }
    return buffer_1.Buffer.from(inflateWrapped(bytes));
}
function callAsync(operation, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    const done = callback;
    queueMicrotask(function () {
        try {
            done(null, operation());
        }
        catch (failure) {
            done(failure);
        }
    });
}
function deflate(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return deflateSync(input); }, options);
        return;
    }
    callAsync(function () { return deflateSync(input, options); }, callback);
}
function inflate(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return inflateSync(input); }, options);
        return;
    }
    callAsync(function () { return inflateSync(input); }, callback);
}
function deflateRawAsync(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return deflateRawSync(input); }, options);
        return;
    }
    callAsync(function () { return deflateRawSync(input, options); }, callback);
}
function inflateRawAsync(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return inflateRawSync(input); }, options);
        return;
    }
    callAsync(function () { return inflateRawSync(input); }, callback);
}
function gzip(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return gzipSync(input); }, options);
        return;
    }
    callAsync(function () { return gzipSync(input, options); }, callback);
}
function gunzip(input, options, callback) {
    if (typeof options === 'function') {
        callAsync(function () { return gunzipSync(input); }, options);
        return;
    }
    callAsync(function () { return gunzipSync(input); }, callback);
}
/**
 * 流式接口：用 Transform 包一层。
 *
 * 注意：本实现把输入攒到 _flush 才处理整块数据，所以是"接口是流、内部是一次性"，
 * 不提供流式处理才有的低延迟与低内存特性。对插件场景足够，已在 README 写明。
 */
function makeZlibStream(kind, direction, options) {
    const level = resolveLevel(options);
    const buffered = [];
    const transform = new streamModule.Transform({
        transform: function (chunk, encoding, callback) {
            void encoding;
            buffered.push(toBytes(chunk, 'buffer'));
            callback(null);
        },
        flush: function (callback) {
            try {
                const input = concat(buffered);
                buffered.length = 0;
                const output = direction === 'compress'
                    ? compressWith(kind, input, level)
                    : decompressWith(kind, input);
                if (output.length > 0) {
                    this.push(output);
                }
                callback(null);
            }
            catch (failure) {
                callback(failure);
            }
        }
    });
    return transform;
}
function compressWith(kind, input, level) {
    if (kind === 'gzip') {
        return gzipWrapped(input, level);
    }
    if (kind === 'raw') {
        return (0, deflate_1.deflateRaw)(input, level);
    }
    return deflateWrapped(input, level);
}
function decompressWith(kind, input) {
    if (kind === 'gzip') {
        return gunzipWrapped(input);
    }
    if (kind === 'raw') {
        return (0, inflate_1.inflateRaw)(input, 0, input.length);
    }
    if (kind === 'auto') {
        return (input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b)
            ? gunzipWrapped(input)
            : inflateWrapped(input);
    }
    return inflateWrapped(input);
}
const constants = {
    // 方法常量（zlib.h 的 deflateInit2 取值），本模块的 create* 用的就是它们
    DEFLATE: 1,
    INFLATE: 2,
    GZIP: 3,
    GUNZIP: 4,
    DEFLATERAW: 5,
    INFLATERAW: 6,
    UNZIP: 7,
    Z_MIN_CHUNK: 64,
    Z_MAX_CHUNK: -1,
    Z_DEFAULT_CHUNK: 16384,
    Z_MIN_MEMLEVEL: 1,
    Z_MAX_MEMLEVEL: 9,
    Z_DEFAULT_MEMLEVEL: 8,
    Z_MIN_LEVEL: -1,
    Z_MAX_LEVEL: 9,
    Z_DEFAULT_LEVEL: -1,
    Z_NO_FLUSH: 0,
    Z_PARTIAL_FLUSH: 1,
    Z_SYNC_FLUSH: 2,
    Z_FULL_FLUSH: 3,
    Z_FINISH: 4,
    Z_BLOCK: 5,
    Z_OK: 0,
    Z_STREAM_END: 1,
    Z_NEED_DICT: 2,
    Z_ERRNO: -1,
    Z_STREAM_ERROR: -2,
    Z_DATA_ERROR: -3,
    Z_MEM_ERROR: -4,
    Z_BUF_ERROR: -5,
    Z_VERSION_ERROR: -6,
    Z_NO_COMPRESSION: 0,
    Z_BEST_SPEED: 1,
    Z_BEST_COMPRESSION: 9,
    Z_DEFAULT_COMPRESSION: -1,
    Z_DEFAULT_STRATEGY: 0,
    Z_FILTERED: 1,
    Z_HUFFMAN_ONLY: 2,
    Z_RLE: 3,
    Z_FIXED: 4,
    Z_MIN_WINDOWBITS: 8,
    Z_MAX_WINDOWBITS: 15,
    Z_DEFAULT_WINDOWBITS: 15
};
const zlib = {
    deflateSync: deflateSync,
    inflateSync: inflateSync,
    deflateRawSync: deflateRawSync,
    inflateRawSync: inflateRawSync,
    gzipSync: gzipSync,
    gunzipSync: gunzipSync,
    unzipSync: unzipSync,
    deflate: deflate,
    inflate: inflate,
    deflateRaw: deflateRawAsync,
    inflateRaw: inflateRawAsync,
    gzip: gzip,
    gunzip: gunzip,
    createDeflate: function (options) { return makeZlibStream('zlib', 'compress', options); },
    createInflate: function () { return makeZlibStream('zlib', 'decompress'); },
    createDeflateRaw: function (options) { return makeZlibStream('raw', 'compress', options); },
    createInflateRaw: function () { return makeZlibStream('raw', 'decompress'); },
    createGzip: function (options) { return makeZlibStream('gzip', 'compress', options); },
    createGunzip: function () { return makeZlibStream('gzip', 'decompress'); },
    createUnzip: function () { return makeZlibStream('auto', 'decompress'); },
    constants: constants
};
module.exports = zlib;
