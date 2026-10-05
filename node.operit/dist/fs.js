'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
/**
 * Node fs 模块的移植（同步面）。
 *
 * 分层：本文件只做 Node 语义 —— 选项解析、flag 语义、错误码与返回值形状；
 * 所有 I/O 走 lib/fs-driver，宿主假设收敛在那里。
 *
 * 环境状态机（lib/fs-env）在这里接入：环境决定 cwd，
 * 于是相对路径的解析基准随环境改变，这就是"设置作用环境"的全部含义。
 *
 * 尚未实现：fd 系列（open/read/write/close）与流式 API，见 BUILTINS.json 的说明。
 */
const pathModule = require("./path");
const env = __importStar(require("./lib/fs-env"));
const cwd = __importStar(require("./lib/cwd"));
const drivers = __importStar(require("./lib/fs-driver"));
const errors_1 = require("./lib/errors");
const buffer_1 = require("./buffer");
const streamModule = require("./stream");
// ------------------------------------------------------------------ 环境接入
env.setHooks({
    setCwd: function (value) {
        cwd.set(value);
    },
    getCwd: function () {
        return cwd.get();
    },
    probe: function (root) {
        const current = drivers.getDriver();
        if (!current.exists(root)) {
            throw (0, errors_1.createError)('ENOENT', 'stat', root);
        }
    }
});
function ready() {
    env.ensureBound();
    return drivers.getDriver();
}
function wrapCall(syscall, target, body, dest) {
    try {
        return body();
    }
    catch (failure) {
        throw (0, errors_1.withContext)(failure, syscall, target, dest);
    }
}
function toAbsolute(value, argumentName) {
    if (typeof value !== 'string') {
        throw new TypeError('The "' + argumentName + '" argument must be of type string. Received type ' + typeof value);
    }
    return pathModule.resolve(value);
}
// ------------------------------------------------------------------ 类型
const FILE_TYPE = 1;
const DIRECTORY_TYPE = 2;
const SYMLINK_TYPE = 3;
class Stats {
    constructor(raw) {
        this.sizeValue = raw.size;
        this.modeValue = raw.mode;
        this.atimeMsValue = raw.atimeMs;
        this.mtimeMsValue = raw.mtimeMs;
        this.ctimeMsValue = raw.ctimeMs;
        this.birthtimeMsValue = raw.birthtimeMs;
        this.fileLike = raw.isFile;
        this.directoryLike = raw.isDirectory;
        this.linkLike = raw.isSymbolicLink;
    }
    get size() {
        return this.sizeValue;
    }
    get mode() {
        return this.modeValue;
    }
    get atimeMs() {
        return this.atimeMsValue;
    }
    get mtimeMs() {
        return this.mtimeMsValue;
    }
    get ctimeMs() {
        return this.ctimeMsValue;
    }
    get birthtimeMs() {
        return this.birthtimeMsValue;
    }
    get atime() {
        return new Date(this.atimeMsValue);
    }
    get mtime() {
        return new Date(this.mtimeMsValue);
    }
    get ctime() {
        return new Date(this.ctimeMsValue);
    }
    get birthtime() {
        return new Date(this.birthtimeMsValue);
    }
    isFile() {
        return this.fileLike;
    }
    isDirectory() {
        return this.directoryLike;
    }
    isSymbolicLink() {
        return this.linkLike;
    }
    isBlockDevice() {
        return false;
    }
    isCharacterDevice() {
        return false;
    }
    isFIFO() {
        return false;
    }
    isSocket() {
        return false;
    }
}
class Dirent {
    constructor(entry) {
        this.name = entry.name;
        this.kind = entry.isDirectory ? DIRECTORY_TYPE : (entry.isSymbolicLink ? SYMLINK_TYPE : FILE_TYPE);
    }
    isFile() {
        return this.kind === FILE_TYPE;
    }
    isDirectory() {
        return this.kind === DIRECTORY_TYPE;
    }
    isSymbolicLink() {
        return this.kind === SYMLINK_TYPE;
    }
    isBlockDevice() {
        return false;
    }
    isCharacterDevice() {
        return false;
    }
    isFIFO() {
        return false;
    }
    isSocket() {
        return false;
    }
}
const FLAGS = {
    'r': { readable: true, writable: false, append: false, exclusive: false, truncate: false, mustExist: true },
    'r+': { readable: true, writable: true, append: false, exclusive: false, truncate: false, mustExist: true },
    'w': { readable: false, writable: true, append: false, exclusive: false, truncate: true, mustExist: false },
    'w+': { readable: true, writable: true, append: false, exclusive: false, truncate: true, mustExist: false },
    'a': { readable: false, writable: true, append: true, exclusive: false, truncate: false, mustExist: false },
    'a+': { readable: true, writable: true, append: true, exclusive: false, truncate: false, mustExist: false },
    'wx': { readable: false, writable: true, append: false, exclusive: true, truncate: true, mustExist: false },
    'wx+': { readable: true, writable: true, append: false, exclusive: true, truncate: true, mustExist: false },
    'ax': { readable: false, writable: true, append: true, exclusive: true, truncate: false, mustExist: false },
    'ax+': { readable: true, writable: true, append: true, exclusive: true, truncate: false, mustExist: false }
};
function parseFlag(value) {
    const text = value === undefined || value === null ? 'r' : String(value);
    const spec = FLAGS[text];
    if (spec === undefined) {
        throw new TypeError('Unknown file open flag: ' + text);
    }
    return spec;
}
function normalizeEncoding(value) {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'string') {
        return value;
    }
    if (typeof value === 'object' && typeof value.encoding === 'string') {
        return value.encoding;
    }
    return null;
}
// ------------------------------------------------------------------ 同步 API
/** readFileSync / writeFileSync 也接受 fd（Node 支持），这里转成对应句柄。 */
function entryForDescriptor(descriptor, syscall) {
    return resolveEntry(descriptor, syscall);
}
function readFileSync(target, options) {
    if (typeof target === 'number') {
        const entry = entryForDescriptor(target, 'read');
        const size = entry.handle.size();
        const data = entry.handle.read(0, size);
        const buffer = buffer_1.Buffer.from(data);
        const encoding = normalizeEncoding(options);
        return encoding === null ? buffer : buffer.toString(encoding);
    }
    const file = toAbsolute(target, 'path');
    const encoding = normalizeEncoding(options);
    const flag = options !== null && typeof options === 'object'
        ? options.flag
        : undefined;
    const spec = parseFlag(flag);
    if (!spec.readable) {
        throw (0, errors_1.createError)('EBADF', 'read', file);
    }
    const current = ready();
    const data = wrapCall('open', file, function () {
        return current.readFileBytes(file);
    });
    const buffer = buffer_1.Buffer.from(data);
    return encoding === null ? buffer : buffer.toString(encoding);
}
function writeFileSync(target, data, options) {
    if (typeof target === 'number') {
        const entry = entryForDescriptor(target, 'write');
        const encoding = normalizeEncoding(options);
        const payload = toBytes(data, encoding === null ? 'utf8' : encoding);
        entry.handle.truncate(0);
        entry.handle.write(0, payload);
        return;
    }
    const file = toAbsolute(target, 'path');
    // writeFileSync 的默认 flag 是 'w'（readFileSync 才是 'r'）
    const declaredFlag = options !== null && typeof options === 'object'
        ? options.flag
        : undefined;
    const spec = parseFlag(declaredFlag === undefined ? 'w' : declaredFlag);
    if (!spec.writable) {
        throw (0, errors_1.createError)('EBADF', 'write', file);
    }
    const encoding = normalizeEncoding(options);
    const payload = toBytes(data, encoding === null ? 'utf8' : encoding);
    const current = ready();
    wrapCall('open', file, function () {
        if (spec.mustExist && !current.exists(file)) {
            throw (0, errors_1.createError)('ENOENT', 'open', file);
        }
        if (spec.truncate || spec.append) {
            current.writeFileBytes(file, payload, spec.append, spec.exclusive);
            return;
        }
        // r+ ：从 0 覆盖，保留尾部
        const existing = current.exists(file) ? current.readFileBytes(file) : new Uint8Array(0);
        const merged = new Uint8Array(Math.max(existing.length, payload.length));
        merged.set(existing);
        merged.set(payload, 0);
        current.writeFileBytes(file, merged, false, false);
    });
}
function appendFileSync(target, data, options) {
    const encoding = normalizeEncoding(options);
    const payload = toBytes(data, encoding === null ? 'utf8' : encoding);
    const file = toAbsolute(target, 'path');
    const current = ready();
    wrapCall('open', file, function () {
        current.writeFileBytes(file, payload, true, false);
    });
}
function toBytes(data, encoding) {
    if (typeof data === 'string') {
        return buffer_1.Buffer.from(data, encoding);
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
    }
    throw new TypeError('The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView.');
}
function existsSync(target) {
    if (typeof target !== 'string') {
        return false;
    }
    try {
        env.ensureBound();
        return drivers.getDriver().exists(pathModule.resolve(target));
    }
    catch (failure) {
        return false;
    }
}
function statSync(target, options) {
    const file = toAbsolute(target, 'path');
    const throwIfNoEntry = options !== null && typeof options === 'object' &&
        options.throwIfNoEntry === false
        ? false
        : true;
    const bigint = options !== null && typeof options === 'object' &&
        options.bigint === true;
    if (bigint) {
        throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'bigint 形式的 Stats 尚未实现。');
    }
    const current = ready();
    try {
        return new Stats(current.stat(file, true));
    }
    catch (failure) {
        if (!throwIfNoEntry && isMissing(failure)) {
            return undefined;
        }
        throw (0, errors_1.withContext)(failure, 'stat', file);
    }
}
function lstatSync(target, options) {
    const file = toAbsolute(target, 'path');
    const throwIfNoEntry = options !== null && typeof options === 'object' &&
        options.throwIfNoEntry === false
        ? false
        : true;
    const current = ready();
    try {
        return new Stats(current.stat(file, false));
    }
    catch (failure) {
        if (!throwIfNoEntry && isMissing(failure)) {
            return undefined;
        }
        throw (0, errors_1.withContext)(failure, 'lstat', file);
    }
}
function isMissing(failure) {
    return failure?.code === 'ENOENT';
}
function readdirSync(target, options) {
    const dir = toAbsolute(target, 'path');
    const withFileTypes = options !== null && typeof options === 'object' &&
        options.withFileTypes === true;
    const current = ready();
    const entries = wrapCall('scandir', dir, function () {
        return current.readdir(dir);
    });
    if (withFileTypes) {
        return entries.map(function (entry) {
            return new Dirent(entry);
        });
    }
    return entries.map(function (entry) {
        return entry.name;
    });
}
function mkdirSync(target, options) {
    const dir = toAbsolute(target, 'path');
    const recursive = options !== null && typeof options === 'object' &&
        options.recursive === true;
    const current = ready();
    return wrapCall('mkdir', dir, function () {
        return current.mkdir(dir, recursive);
    });
}
function rmSync(target, options) {
    const file = toAbsolute(target, 'path');
    const recursive = options !== null && typeof options === 'object' &&
        options.recursive === true;
    const force = options !== null && typeof options === 'object' &&
        options.force === true;
    const current = ready();
    wrapCall('rm', file, function () {
        current.remove(file, recursive, force);
    });
}
function unlinkSync(target) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    wrapCall('unlink', file, function () {
        current.remove(file, false, false);
    });
}
function rmdirSync(target, options) {
    const dir = toAbsolute(target, 'path');
    const recursive = options !== null && typeof options === 'object' &&
        options.recursive === true;
    const current = ready();
    wrapCall('rmdir', dir, function () {
        current.remove(dir, recursive, false);
    });
}
function renameSync(from, to) {
    const source = toAbsolute(from, 'oldPath');
    const destination = toAbsolute(to, 'newPath');
    const current = ready();
    wrapCall('rename', source, function () {
        current.rename(source, destination);
    }, destination);
}
function copyFileSync(from, to) {
    const source = toAbsolute(from, 'src');
    const destination = toAbsolute(to, 'dest');
    const current = ready();
    wrapCall('copyfile', source, function () {
        current.copyFile(source, destination);
    }, destination);
}
function realpathSync(target) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    return wrapCall('realpath', file, function () {
        return current.realpath(file);
    });
}
function readlinkSync(target) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    return wrapCall('readlink', file, function () {
        return current.readlink(file);
    });
}
function symlinkSync(target, linkPath) {
    const linkTarget = String(target);
    const file = toAbsolute(linkPath, 'path');
    const current = ready();
    wrapCall('symlink', file, function () {
        current.symlink(linkTarget, file);
    });
}
function chmodSync(target, mode) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    wrapCall('chmod', file, function () {
        current.chmod(file, Number(mode) || 0);
    });
}
function truncateSync(target, length) {
    const file = toAbsolute(target, 'path');
    const size = length === undefined ? 0 : Number(length);
    const current = ready();
    wrapCall('truncate', file, function () {
        current.truncate(file, size);
    });
}
function utimesSync(target, atime, mtime) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    wrapCall('utime', file, function () {
        current.utimes(file, toMillis(atime), toMillis(mtime));
    });
}
function toMillis(value) {
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === 'number') {
        return value * 1000;
    }
    return Number(value) * 1000;
}
function accessSync(target) {
    const file = toAbsolute(target, 'path');
    const current = ready();
    wrapCall('access', file, function () {
        if (!current.exists(file)) {
            throw (0, errors_1.createError)('ENOENT', 'access', file);
        }
    });
}
function mkdtempSync(prefix) {
    const base = toAbsolute(prefix, 'prefix');
    const current = ready();
    return wrapCall('mkdtemp', base, function () {
        return current.mkdtemp(base);
    });
}
/** Node 的 fd 是小整数；0/1/2 留给 stdio，所以从 3 开始发。 */
const openEntries = new Map();
let nextDescriptor = 3;
function resolveEntry(descriptor, syscall) {
    const value = Number(descriptor);
    const entry = openEntries.get(value);
    if (entry === undefined) {
        throw (0, errors_1.createError)('EBADF', syscall, String(descriptor));
    }
    return entry;
}
function openSync(target, flags, mode) {
    void mode;
    const file = toAbsolute(target, 'path');
    const spec = parseFlag(flags);
    const current = ready();
    const options = {
        readable: spec.readable,
        writable: spec.writable,
        append: spec.append,
        exclusive: spec.exclusive,
        truncate: spec.truncate
    };
    const handle = wrapCall('open', file, function () {
        return current.openHandle(file, options);
    });
    const descriptor = nextDescriptor;
    nextDescriptor += 1;
    openEntries.set(descriptor, { handle: handle, path: file, readable: spec.readable, writable: spec.writable });
    return descriptor;
}
function closeSync(descriptor) {
    const entry = resolveEntry(descriptor, 'close');
    openEntries.delete(Number(descriptor));
    wrapCall('close', entry.path, function () {
        entry.handle.close();
    });
}
function readSync(descriptor, buffer, offset, length, position) {
    const entry = resolveEntry(descriptor, 'read');
    if (!(buffer instanceof Uint8Array)) {
        throw new TypeError('The "buffer" argument must be an instance of Buffer, TypedArray, or DataView.');
    }
    const start = offset === undefined || offset === null ? 0 : Number(offset);
    const count = length === undefined || length === null ? buffer.length - start : Number(length);
    const data = wrapCall('read', entry.path, function () {
        return entry.handle.read(position === undefined || position === null ? null : Number(position), count);
    });
    buffer.set(data, start);
    return data.length;
}
function writeSync(descriptor, data, a, b, c) {
    const entry = resolveEntry(descriptor, 'write');
    if (typeof data === 'string') {
        // Node 的字符串形式：writeSync(fd, string, position?, encoding?)
        const position = a === undefined || a === null ? null : Number(a);
        const encoding = b === undefined ? 'utf8' : String(b);
        const bytes = buffer_1.Buffer.from(data, encoding);
        return wrapCall('write', entry.path, function () {
            return entry.handle.write(position, bytes);
        });
    }
    if (!(data instanceof Uint8Array)) {
        throw new TypeError('The "buffer" argument must be an instance of Buffer, TypedArray, or DataView.');
    }
    const offset = a === undefined || a === null ? 0 : Number(a);
    const length = b === undefined || b === null ? data.length - offset : Number(b);
    const position = c === undefined || c === null ? null : Number(c);
    const slice = data.subarray(offset, offset + length);
    return wrapCall('write', entry.path, function () {
        return entry.handle.write(position, slice);
    });
}
function fstatSync(descriptor, options) {
    const entry = resolveEntry(descriptor, 'fstat');
    const throwIfNoEntry = options !== null && typeof options === 'object' &&
        options.throwIfNoEntry === false
        ? false
        : true;
    const current = ready();
    try {
        return new Stats(current.stat(entry.path, true));
    }
    catch (failure) {
        if (!throwIfNoEntry && isMissing(failure)) {
            return new Stats({
                isFile: true,
                isDirectory: false,
                isSymbolicLink: false,
                size: entry.handle.size(),
                mode: 0o666,
                atimeMs: 0,
                mtimeMs: 0,
                ctimeMs: 0,
                birthtimeMs: 0
            });
        }
        throw (0, errors_1.withContext)(failure, 'fstat', entry.path);
    }
}
function ftruncateSync(descriptor, length) {
    const entry = resolveEntry(descriptor, 'ftruncate');
    const size = length === undefined ? 0 : Number(length);
    wrapCall('ftruncate', entry.path, function () {
        entry.handle.truncate(size);
    });
}
function fsyncSync(descriptor) {
    const entry = resolveEntry(descriptor, 'fsync');
    wrapCall('fsync', entry.path, function () {
        entry.handle.sync();
    });
}
/**
 * 把同步面包装成 Node 的回调形式（最后一个参数是回调）。
 * 与 fs/promises 同样的取舍：宿主只有同步通道，所以是"接口异步、执行同步"。
 */
function withCallback(syncFunction, args) {
    const done = args[args.length - 1];
    if (typeof done !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    const forward = args.slice(0, args.length - 1);
    queueMicrotask(function () {
        try {
            done(null, syncFunction.apply(null, forward));
        }
        catch (failure) {
            done(failure);
        }
    });
}
function readFile(...args) {
    withCallback(readFileSync, args);
}
function writeFile(...args) {
    withCallback(writeFileSync, args);
}
function appendFile(...args) {
    withCallback(appendFileSync, args);
}
function stat(...args) {
    withCallback(statSync, args);
}
function lstat(...args) {
    withCallback(lstatSync, args);
}
function readdir(...args) {
    withCallback(readdirSync, args);
}
function mkdir(...args) {
    withCallback(mkdirSync, args);
}
function rm(...args) {
    withCallback(rmSync, args);
}
function unlink(...args) {
    withCallback(unlinkSync, args);
}
function rmdir(...args) {
    withCallback(rmdirSync, args);
}
function rename(...args) {
    withCallback(renameSync, args);
}
function copyFile(...args) {
    withCallback(copyFileSync, args);
}
function realpath(...args) {
    withCallback(realpathSync, args);
}
function access(...args) {
    withCallback(accessSync, args);
}
function mkdtemp(...args) {
    withCallback(mkdtempSync, args);
}
function open(...args) {
    withCallback(openSync, args);
}
function close(...args) {
    withCallback(closeSync, args);
}
function read(...args) {
    withCallback(readSync, args);
}
function write(...args) {
    withCallback(writeSync, args);
}
function fstat(...args) {
    withCallback(fstatSync, args);
}
function ftruncate(...args) {
    withCallback(ftruncateSync, args);
}
function fsync(...args) {
    withCallback(fsyncSync, args);
}
/** Node 的 fs.exists 回调只收一个布尔值，是唯一不带 error 的形态。 */
function exists(target, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    const done = callback;
    queueMicrotask(function () {
        done(existsSync(target));
    });
}
// ------------------------------------------------------------------ 流式接口
/**
 * fs.createReadStream。
 *
 * 与 Node 的差异（本库的驱动层没有 fd 概念，因此是"按需整块读 + 切片下发"）：
 *   - 首次 _read 时把整个文件读进内存，之后按 highWaterMark 切片，
 *     所以内存占用不是流式的；
 *   - 'open' 事件仍会发，但参数是 null（没有真实 fd）。
 */
function createReadStream(target, options) {
    const file = toAbsolute(target, 'path');
    const spec = parseFlag(options === undefined ? undefined : options.flags);
    if (!spec.readable) {
        throw (0, errors_1.createError)('EBADF', 'open', file);
    }
    const highWaterMark = options !== undefined && typeof options.highWaterMark === 'number'
        ? options.highWaterMark
        : 65536;
    const startAt = options !== undefined && typeof options.start === 'number' ? options.start : 0;
    const endAt = options !== undefined && typeof options.end === 'number' ? options.end : Infinity;
    let opened = false;
    let failed = false;
    let position = startAt;
    let payload = null;
    let readable = null;
    const open = function () {
        const self = readable;
        if (opened || failed) {
            return;
        }
        try {
            const current = ready();
            payload = wrapCall('open', file, function () {
                return current.readFileBytes(file);
            });
            opened = true;
            // 没有真实 fd，'open' 的参数如实给 null
            self.emit('open', null);
        }
        catch (failure) {
            failed = true;
            self.destroy(failure);
        }
    };
    readable = new streamModule.Readable({
        highWaterMark: highWaterMark,
        encoding: options === undefined ? undefined : options.encoding,
        read: function () {
            const self = readable;
            if (!opened) {
                open();
                if (!opened) {
                    return;
                }
            }
            const bytes = payload;
            if (position >= bytes.length || position > endAt) {
                self.push(null);
                return;
            }
            const upper = Math.min(bytes.length, endAt === Infinity ? bytes.length : endAt + 1, position + highWaterMark);
            self.push(bytes.subarray(position, upper));
            position = upper;
        },
        destroy: function (error, callback) {
            callback(error);
        }
    });
    // 与 Node 一致：构造后就打开文件并发 'open'，因此只监听 'open' 的代码不会挂住
    schedule(function () {
        open();
    });
    return readable;
}
function schedule(task) {
    queueMicrotask(task);
}
/**
 * fs.createWriteStream。
 *
 * 驱动层没有 fd，但写入语义可以保持流式：首次写按 flag 决定是否截断，
 * 之后逐块追加，内存占用与流式一致。
 */
function createWriteStream(target, options) {
    const file = toAbsolute(target, 'path');
    // 写流的默认 flag 是 'w'（读流才是 'r'）—— 与 writeFileSync 同类，踩过一次
    const spec = parseFlag(options === undefined || options.flags === undefined ? 'w' : options.flags);
    if (!spec.writable) {
        throw (0, errors_1.createError)('EBADF', 'write', file);
    }
    const highWaterMark = options !== undefined && typeof options.highWaterMark === 'number'
        ? options.highWaterMark
        : 16384;
    let wroteAny = false;
    let writable = null;
    writable = new streamModule.Writable({
        highWaterMark: highWaterMark,
        write: function (chunk, encoding, callback) {
            try {
                const current = ready();
                const bytes = chunk instanceof Uint8Array
                    ? chunk
                    : buffer_1.Buffer.from(String(chunk), (encoding === 'buffer' ? 'utf8' : encoding));
                const append = wroteAny || spec.append;
                const exclusive = !wroteAny && spec.exclusive;
                wrapCall('write', file, function () {
                    current.writeFileBytes(file, bytes, append, exclusive);
                });
                wroteAny = true;
                callback(null);
            }
            catch (failure) {
                callback(failure);
            }
        },
        final: function (callback) {
            // Node 的 'w' 即使一个字节都没写也会建出空文件
            if (!wroteAny && spec.truncate) {
                try {
                    const current = ready();
                    wrapCall('open', file, function () {
                        current.writeFileBytes(file, new Uint8Array(0), false, spec.exclusive);
                    });
                }
                catch (failure) {
                    callback(failure);
                    return;
                }
            }
            callback(null);
        }
    });
    void writable;
    return writable;
}
// ------------------------------------------------------------------ 常量
const constants = {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
    COPYFILE_EXCL: 1,
    COPYFILE_FICLONE: 2,
    COPYFILE_FICLONE_FORCE: 4,
    // libuv 自己的那套镜像常量，Node 也导出
    UV_FS_COPYFILE_EXCL: 1,
    UV_FS_COPYFILE_FICLONE: 2,
    UV_FS_COPYFILE_FICLONE_FORCE: 4,
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_TRUNC: 512,
    O_APPEND: 1024,
    UV_FS_O_FILEMAP: 0,
    UV_FS_SYMLINK_DIR: 1,
    UV_FS_SYMLINK_JUNCTION: 2,
    UV_DIRENT_UNKNOWN: 0,
    UV_DIRENT_FILE: 1,
    UV_DIRENT_DIR: 2,
    UV_DIRENT_LINK: 3,
    UV_DIRENT_FIFO: 4,
    UV_DIRENT_SOCKET: 5,
    UV_DIRENT_CHAR: 6,
    UV_DIRENT_BLOCK: 7,
    // POSIX 文件类型与权限位（Linux/Android 的值）
    S_IFMT: 61440,
    S_IFREG: 32768,
    S_IFDIR: 16384,
    S_IFCHR: 8192,
    S_IFIFO: 4096,
    S_IFLNK: 40960,
    S_IRUSR: 256,
    S_IWUSR: 128,
    S_IXUSR: 64,
    S_IRGRP: 32,
    S_IWGRP: 16,
    S_IXGRP: 8,
    S_IROTH: 4,
    S_IWOTH: 2,
    S_IXOTH: 1
};
const fs = {
    readFileSync: readFileSync,
    writeFileSync: writeFileSync,
    appendFileSync: appendFileSync,
    existsSync: existsSync,
    statSync: statSync,
    lstatSync: lstatSync,
    readdirSync: readdirSync,
    mkdirSync: mkdirSync,
    rmSync: rmSync,
    unlinkSync: unlinkSync,
    rmdirSync: rmdirSync,
    renameSync: renameSync,
    copyFileSync: copyFileSync,
    realpathSync: realpathSync,
    readlinkSync: readlinkSync,
    symlinkSync: symlinkSync,
    chmodSync: chmodSync,
    truncateSync: truncateSync,
    utimesSync: utimesSync,
    accessSync: accessSync,
    mkdtempSync: mkdtempSync,
    openSync: openSync,
    closeSync: closeSync,
    readSync: readSync,
    writeSync: writeSync,
    fstatSync: fstatSync,
    ftruncateSync: ftruncateSync,
    fsyncSync: fsyncSync,
    fdatasyncSync: fsyncSync,
    readFile: readFile,
    writeFile: writeFile,
    appendFile: appendFile,
    stat: stat,
    lstat: lstat,
    readdir: readdir,
    mkdir: mkdir,
    rm: rm,
    unlink: unlink,
    rmdir: rmdir,
    rename: rename,
    copyFile: copyFile,
    realpath: realpath,
    access: access,
    mkdtemp: mkdtemp,
    exists: exists,
    open: open,
    close: close,
    read: read,
    write: write,
    fstat: fstat,
    ftruncate: ftruncate,
    fsync: fsync,
    createReadStream: createReadStream,
    createWriteStream: createWriteStream,
    Stats: Stats,
    Dirent: Dirent,
    constants: constants,
    env: env
};
module.exports = fs;
