'use strict';
/**
 * fs/promises 子路径入口。
 *
 * 实现方式：把同步面逐个包进 Promise。
 * 原因很直接 —— 宿主只有 Java bridge 这一条同步通道（DESIGN.md §6.3），
 * 没有真异步可用；所以这里给的是"接口是异步、执行是同步"。
 * 调用方若在 UI 线程上使用，需要自己评估阻塞成本。
 *
 * `open()` 按 Node 语义返回 **FileHandle**（不是裸 fd）。
 * Node 的 fs.promises 并没有 fd 形式的 read/write/close/fstat/ftruncate/fsync，
 * 所以这里也不提供 —— 那些能力在 FileHandle 上。
 */
const fs = require("../fs");
const buffer_1 = require("../buffer");
function promisify(fn) {
    return function (...args) {
        try {
            return Promise.resolve(fn.apply(null, args));
        }
        catch (failure) {
            return Promise.reject(failure);
        }
    };
}
function toBytes(data, encoding) {
    if (typeof data === 'string') {
        const resolved = typeof encoding === 'string'
            ? encoding
            : (encoding !== undefined && encoding !== null && typeof encoding.encoding === 'string' ? encoding.encoding : 'utf8');
        return buffer_1.Buffer.from(data, resolved);
    }
    if (data instanceof Uint8Array) {
        return data;
    }
    throw new TypeError('The "data" argument must be of type string or an instance of Buffer, TypedArray, or DataView.');
}
class FileHandle {
    constructor(fd) {
        this.closed = false;
        this.fd = fd;
    }
    ensureOpen() {
        if (this.closed) {
            const error = new Error('file descriptor was closed');
            error.code = 'EBADF';
            throw error;
        }
    }
    /** Node 的 FileHandle.read 返回 { bytesRead, buffer }，不是裸数字。 */
    async read(buffer, offset, length, position) {
        this.ensureOpen();
        const bytesRead = fs.readSync(this.fd, buffer, offset, length, position);
        return { bytesRead: bytesRead, buffer: buffer };
    }
    /** 同理，write 返回 { bytesWritten, buffer }，buffer 是调用方传入的原始数据。 */
    async write(data, ...rest) {
        this.ensureOpen();
        const bytesWritten = fs.writeSync(this.fd, data, rest[0], rest[1], rest[2]);
        return { bytesWritten: bytesWritten, buffer: data };
    }
    async readFile(options) {
        this.ensureOpen();
        return fs.readFileSync(this.fd, options);
    }
    async writeFile(data, options) {
        this.ensureOpen();
        fs.writeFileSync(this.fd, data, options);
    }
    async appendFile(data, options) {
        this.ensureOpen();
        const bytes = toBytes(data, options);
        const size = fs.fstatSync(this.fd).size;
        fs.writeSync(this.fd, bytes, 0, bytes.length, size);
    }
    async stat() {
        this.ensureOpen();
        return fs.fstatSync(this.fd);
    }
    async truncate(length) {
        this.ensureOpen();
        fs.ftruncateSync(this.fd, length);
    }
    async sync() {
        this.ensureOpen();
        fs.fsyncSync(this.fd);
    }
    async datasync() {
        this.ensureOpen();
        fs.fdatasyncSync(this.fd);
    }
    async close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        fs.closeSync(this.fd);
    }
}
function open(path, flags, mode) {
    return Promise.resolve().then(function () {
        return new FileHandle(fs.openSync(path, flags, mode));
    });
}
const api = {
    open: open,
    readFile: promisify(fs.readFileSync),
    writeFile: promisify(fs.writeFileSync),
    appendFile: promisify(fs.appendFileSync),
    stat: promisify(fs.statSync),
    lstat: promisify(fs.lstatSync),
    readdir: promisify(fs.readdirSync),
    mkdir: promisify(fs.mkdirSync),
    rm: promisify(fs.rmSync),
    unlink: promisify(fs.unlinkSync),
    rmdir: promisify(fs.rmdirSync),
    rename: promisify(fs.renameSync),
    copyFile: promisify(fs.copyFileSync),
    realpath: promisify(fs.realpathSync),
    readlink: promisify(fs.readlinkSync),
    symlink: promisify(fs.symlinkSync),
    chmod: promisify(fs.chmodSync),
    truncate: promisify(fs.truncateSync),
    utimes: promisify(fs.utimesSync),
    access: promisify(fs.accessSync),
    mkdtemp: promisify(fs.mkdtempSync),
    constants: fs.constants
};
module.exports = api;
