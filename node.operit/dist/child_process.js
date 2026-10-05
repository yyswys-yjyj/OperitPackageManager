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
 * Node child_process 模块的移植。
 *
 * 覆盖：exec / execSync / execFile / execFileSync / spawn / spawnSync，
 * ChildProcess 的 spawn/exit/close/error 事件与 stdout/stderr/stdin、pid、exitCode、kill。
 * 不覆盖：fork（需要 Node 运行时本身）。
 *
 * 时序上的重要差异：宿主只有 Java bridge 这一条同步通道，
 * 所以 spawn 是「先同步跑完、再异步发事件」—— 接口是异步的，执行是同步的，
 * 拿不到真正的并发与背压。需要真并发请用终端工具（Tools 层）。
 *
 * 输出按 UTF-8 解码（驱动层的选择，见 lib/process-driver.ts），二进制输出会有损。
 */
const EventEmitter = require("./events");
const streamModule = require("./stream");
const buffer_1 = require("./buffer");
const driverModule = __importStar(require("./lib/process-driver"));
const errors_1 = require("./lib/errors");
/** Operit 上的 shell；exec 与 shell:true 都走它。 */
const SHELL = '/system/bin/sh';
const DEFAULT_MAX_BUFFER = 1024 * 1024;
function schedule(task) {
    queueMicrotask(task);
}
function run(argv, options) {
    let raw;
    try {
        raw = driverModule.getDriver().run(argv, {
            cwd: options.cwd,
            env: options.env
        });
    }
    catch (failure) {
        const mapped = failure;
        const spawnError = (0, errors_1.createError)(mapped.code === undefined ? 'EIO' : mapped.code, 'spawn', argv[0]);
        spawnError.message = mapped.message === undefined ? spawnError.message : mapped.message;
        spawnError.errno = mapped.errno === undefined ? -1 : mapped.errno;
        return {
            pid: 0,
            status: null,
            signal: null,
            stdout: buffer_1.Buffer.alloc(0),
            stderr: buffer_1.Buffer.alloc(0),
            error: spawnError
        };
    }
    return {
        pid: raw.pid,
        status: raw.status,
        signal: null,
        stdout: buffer_1.Buffer.from(raw.stdout, 'utf8'),
        stderr: buffer_1.Buffer.from(raw.stderr, 'utf8')
    };
}
function asText(buffer, encoding) {
    if (encoding === undefined || encoding === 'buffer') {
        return buffer;
    }
    return buffer.toString(encoding);
}
function maxBufferFailure(outcome) {
    const error = new Error('stdout maxBuffer length exceeded');
    error.code = 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
    error.status = outcome.status;
    error.signal = outcome.signal;
    error.stdout = outcome.stdout;
    error.stderr = outcome.stderr;
    return error;
}
function commandFailed(command, outcome, cwd) {
    const prefix = cwd === undefined ? '' : cwd + '\n';
    const error = new Error(prefix + 'Command failed: ' + command + '\n' + outcome.stderr.toString('utf8'));
    error.status = outcome.status;
    error.signal = outcome.signal;
    error.stdout = outcome.stdout;
    error.stderr = outcome.stderr;
    error.pid = outcome.pid;
    return error;
}
function exceedsMaxBuffer(outcome, options) {
    const limit = options.maxBuffer === undefined ? DEFAULT_MAX_BUFFER : options.maxBuffer;
    return outcome.stdout.length > limit || outcome.stderr.length > limit;
}
/** 同步执行并返回 stdout；失败按 Node 语义抛异常。 */
function runSync(command, argv, options) {
    const outcome = run(argv, options);
    if (outcome.error !== undefined) {
        throw outcome.error;
    }
    if (exceedsMaxBuffer(outcome, options)) {
        throw maxBufferFailure(outcome);
    }
    if (outcome.status !== 0) {
        throw commandFailed(command, outcome, options.cwd);
    }
    return asText(outcome.stdout, options.encoding);
}
function shellArgv(command) {
    return [SHELL, '-c', command];
}
function execSync(command, options) {
    const text = String(command);
    return runSync(text, shellArgv(text), options === undefined ? {} : options);
}
function execFileSync(file, args, options) {
    let list = [];
    let opts = options;
    if (Array.isArray(args)) {
        list = args.map(function (item) { return String(item); });
    }
    else if (args !== undefined && args !== null) {
        opts = args;
    }
    const target = String(file);
    return runSync(target, [target].concat(list), opts === undefined ? {} : opts);
}
function spawnSync(command, args, options) {
    let list = [];
    let opts = {};
    if (Array.isArray(args)) {
        list = args.map(function (item) { return String(item); });
        if (options !== undefined && options !== null) {
            opts = options;
        }
    }
    else if (args !== undefined && args !== null) {
        opts = args;
    }
    const useShell = opts.shell !== undefined && opts.shell !== false;
    const target = String(command);
    const argv = useShell
        ? shellArgv([target].concat(list).join(' '))
        : [target].concat(list);
    const outcome = run(argv, opts);
    const stdout = asText(outcome.stdout, opts.encoding);
    const stderr = asText(outcome.stderr, opts.encoding);
    const result = {
        pid: outcome.pid,
        output: [null, stdout, stderr],
        stdout: stdout,
        stderr: stderr,
        status: outcome.status,
        signal: outcome.signal
    };
    if (outcome.error !== undefined) {
        result.error = outcome.error;
    }
    return result;
}
function readStreamOf(buffer) {
    const pending = buffer.length > 0 ? [buffer] : [];
    return new streamModule.Readable({
        read: function () {
            const self = this;
            if (pending.length > 0) {
                self.push(pending.shift());
                return;
            }
            self.push(null);
        }
    });
}
function sinkStream() {
    return new streamModule.Writable({
        write: function (chunk, encoding, callback) {
            void chunk;
            void encoding;
            callback(null);
        }
    });
}
class ChildProcess extends EventEmitter {
    constructor(argv, outcome) {
        super();
        this.killed = false;
        if (outcome.error !== undefined) {
            this.spawnError = outcome.error;
        }
        this.spawnfile = argv[0];
        this.spawnargs = argv.slice();
        this.pid = outcome.pid;
        this.exitCode = outcome.status;
        this.signalCode = outcome.signal;
        this.stdout = readStreamOf(outcome.stdout);
        this.stderr = readStreamOf(outcome.stderr);
        this.stdin = sinkStream();
        schedule(() => {
            if (outcome.error !== undefined) {
                this.emit('error', outcome.error);
                this.emit('close', null, null);
                return;
            }
            this.emit('spawn');
            this.emit('exit', outcome.status, outcome.signal);
            this.emit('close', outcome.status, outcome.signal);
        });
    }
    /** 进程在本实现里已经跑完了，所以 kill 总是返回 false。 */
    kill() {
        return false;
    }
    ref() {
        return this;
    }
    unref() {
        return this;
    }
}
function spawnOf(argv, opts) {
    return new ChildProcess(argv, run(argv, opts));
}
function exec(command, options, callback) {
    let opts = {};
    let done = callback;
    if (typeof options === 'function') {
        done = options;
    }
    else if (options !== undefined && options !== null) {
        opts = options;
    }
    if (typeof done !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    const text = String(command);
    const child = spawnOf(shellArgv(text), opts);
    // 与 spawn 的事件时序一致：同步跑完，异步回调
    schedule(function () {
        collect(text, child, opts, done);
    });
    return child;
}
/**
 * 从已经跑完的 child 上取回输出并按 Node 语义决定是否报错。
 * 本实现是同步执行完再发事件，所以这里直接读 exitCode 与 spawnError 即可。
 */
function collect(command, child, opts, callback) {
    const stdout = readBuffered(child.stdout);
    const stderr = readBuffered(child.stderr);
    if (child.spawnError !== undefined) {
        callback(child.spawnError, asText(stdout, opts.encoding), asText(stderr, opts.encoding));
        return;
    }
    const limit = opts.maxBuffer === undefined ? DEFAULT_MAX_BUFFER : opts.maxBuffer;
    if (stdout.length > limit || stderr.length > limit) {
        callback(maxBufferFailure({
            pid: child.pid,
            status: child.exitCode,
            signal: child.signalCode,
            stdout: stdout,
            stderr: stderr
        }), asText(stdout, opts.encoding), asText(stderr, opts.encoding));
        return;
    }
    if (child.exitCode !== 0) {
        callback(commandFailed(command, {
            pid: child.pid,
            status: child.exitCode,
            signal: child.signalCode,
            stdout: stdout,
            stderr: stderr
        }, opts.cwd), asText(stdout, opts.encoding), asText(stderr, opts.encoding));
        return;
    }
    callback(null, asText(stdout, opts.encoding), asText(stderr, opts.encoding));
}
/** Readable 已经把整块数据 push 进去了，这里同步取回。 */
function readBuffered(stream) {
    const target = stream;
    const value = target.read();
    if (value === null || value === undefined) {
        return buffer_1.Buffer.alloc(0);
    }
    return buffer_1.Buffer.from(value);
}
function execFile(file, args, options, callback) {
    let list = [];
    let opts = {};
    let done = callback;
    if (Array.isArray(args)) {
        list = args.map(function (item) { return String(item); });
        if (typeof options === 'function') {
            done = options;
        }
        else if (options !== undefined && options !== null) {
            opts = options;
        }
    }
    else if (typeof args === 'function') {
        done = args;
    }
    else if (args !== undefined && args !== null) {
        opts = args;
        if (typeof options === 'function') {
            done = options;
        }
    }
    if (typeof done !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    const target = String(file);
    const child = spawnOf([target].concat(list), opts);
    schedule(function () {
        collect(target, child, opts, done);
    });
    return child;
}
function spawn(command, args, options) {
    let list = [];
    let opts = {};
    if (Array.isArray(args)) {
        list = args.map(function (item) { return String(item); });
        if (options !== undefined && options !== null) {
            opts = options;
        }
    }
    else if (args !== undefined && args !== null) {
        opts = args;
    }
    const target = String(command);
    const useShell = opts.shell !== undefined && opts.shell !== false;
    const argv = useShell ? shellArgv([target].concat(list).join(' ')) : [target].concat(list);
    return spawnOf(argv, opts);
}
function fork() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'child_process.fork() 需要 Node 运行时本身，node.operit 不提供。');
}
const childProcess = {
    exec: exec,
    execSync: execSync,
    execFile: execFile,
    execFileSync: execFileSync,
    spawn: spawn,
    spawnSync: spawnSync,
    fork: fork,
    ChildProcess: ChildProcess
};
module.exports = childProcess;
