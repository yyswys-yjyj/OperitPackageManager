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
 * Node process 模块的移植。
 *
 * 这是 `require('process')` 返回的对象。注意 Operit 运行时**没有** `process` 全局，
 * 所以直接引用裸 `process` 的代码需要由 OperitPackageManager 在重写时注入（见 README）。
 *
 * 已知差异：
 *   - process.env 是 Proxy，读走 Operit 的 getEnv；getEnv 对不存在的变量返回空串，
 *     因此空串与未设置都表现为 undefined；且无法枚举（Object.keys(env) 恒为 []）
 *   - process.exit() 会终止整个 Operit 运行时，这里显式抛错而不是静默继续
 *   - versions.node 是"声明的兼容目标"，不是真实运行时版本
 */
const EventEmitter = require("./events");
const fsModule = require("./fs");
const pathModule = require("./path");
const os = __importStar(require("./os"));
const cwd = __importStar(require("./lib/cwd"));
const bridge = __importStar(require("./lib/bridge"));
const bytesCodec = __importStar(require("./lib/bytes"));
const errors_1 = require("./lib/errors");
const pending = [];
let drainScheduled = false;
function drainQueue() {
    drainScheduled = false;
    const batch = pending.splice(0, pending.length);
    for (let i = 0; i < batch.length; i += 1) {
        batch[i].fn.apply(null, batch[i].args);
    }
}
function nextTick(fn, ...args) {
    if (typeof fn !== 'function') {
        throw new TypeError('The "callback" argument must be of type function.');
    }
    pending.push({ fn: fn, args: args });
    if (!drainScheduled) {
        drainScheduled = true;
        queueMicrotask(drainQueue);
    }
}
function hrtime(previous) {
    const nowMs = performance.now();
    let seconds = Math.floor(nowMs / 1000);
    let nanoseconds = Math.floor((nowMs % 1000) * 1e6);
    if (previous !== undefined) {
        seconds -= previous[0];
        nanoseconds -= previous[1];
        if (nanoseconds < 0) {
            seconds -= 1;
            nanoseconds += 1e9;
        }
    }
    return [seconds, nanoseconds];
}
const hrtimeFunction = hrtime;
hrtimeFunction.bigint = function () {
    return BigInt(Math.floor(performance.now() * 1e6));
};
function readEnvVariable(key) {
    if (typeof getEnv !== 'function') {
        return undefined;
    }
    const value = getEnv(key);
    // Operit 的 getEnv 对不存在的变量返回空串，无法与"设为空串"区分
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}
const env = new Proxy({}, {
    get: function (_target, key) {
        return typeof key === 'string' ? readEnvVariable(key) : undefined;
    },
    set: function (_target, key, value) {
        bridge.setEnv(String(key), value === undefined || value === null ? null : String(value));
        return true;
    },
    has: function (_target, key) {
        return typeof key === 'string' && readEnvVariable(key) !== undefined;
    },
    deleteProperty: function (_target, key) {
        bridge.setEnv(String(key), null);
        return true;
    },
    ownKeys: function () {
        // Operit 没有枚举环境变量的接口，因此这里只能为空
        return [];
    }
});
function createWritable(level) {
    return {
        isTTY: false,
        columns: 0,
        rows: 0,
        write: function (chunk) {
            const text = typeof chunk === 'string' ? chunk : bytesCodec.utf8Decode(chunk);
            const line = text.charAt(text.length - 1) === '\n' ? text.slice(0, text.length - 1) : text;
            if (level === 'log') {
                console.log(line);
            }
            else {
                console.warn(line);
            }
            return true;
        }
    };
}
class Process extends EventEmitter {
    constructor() {
        // 注意：Process 只以实例形式导出（export =），所以所有成员必须是 public，
        // 否则 declaration 生成会报 TS4094。
        super(...arguments);
        this.exitCode = undefined;
        this.title = 'operit';
        this.versions = {
            // 声明的兼容目标，不是真实运行时版本；见 README「已知偏差」
            node: '18.0.0',
            operit: 'node.operit/0.1.0',
            quickjs: 'unknown'
        };
        this.argv = ['operit'];
        this.execArgv = [];
        this.execPath = 'operit';
        this.env = env;
        this.stdout = createWritable('log');
        this.stderr = createWritable('warn');
        this.stdin = {
            isTTY: false,
            read: function () {
                return null;
            },
            on: function () {
                return this;
            },
            resume: function () {
                // 沙箱里没有真实 stdin
            }
        };
        this.nextTick = nextTick;
        this.hrtime = hrtimeFunction;
    }
    // 这三个改成 getter：读的时候才碰宿主，模块加载本身不调用 bridge
    get platform() {
        return os.platform();
    }
    get arch() {
        return os.arch();
    }
    get version() {
        return os.version();
    }
    get pid() {
        return Number(bridge.callStatic('android.os.Process', 'myPid', [])) || 0;
    }
    cwd() {
        return cwd.get();
    }
    chdir(directory) {
        if (typeof directory !== 'string') {
            throw new TypeError('The "directory" argument must be of type string.');
        }
        const stats = fsModule.statSync(directory);
        if (stats === undefined || !stats.isDirectory()) {
            throw (0, errors_1.createError)('ENOTDIR', 'chdir', directory);
        }
        // Node 把 cwd 存成解析后的绝对路径，不是原始参数
        cwd.set(pathModule.resolve(directory));
    }
    uptime() {
        return os.uptime();
    }
    memoryUsage() {
        const heapTotal = os.totalmem();
        const free = os.freemem();
        return {
            rss: heapTotal,
            heapTotal: heapTotal,
            heapUsed: heapTotal - free,
            external: 0,
            arrayBuffers: 0
        };
    }
    emitWarning(warning) {
        const value = warning instanceof Error ? warning : new Error(String(warning));
        this.emit('warning', value);
        console.warn('Warning: ' + value.message);
    }
    exit(code) {
        void code;
        throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'process.exit() 会终止整个 Operit 运行时，node.operit 不提供。');
    }
    abort() {
        throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'process.abort() 会终止整个 Operit 运行时，node.operit 不提供。');
    }
    umask() {
        return 0o022;
    }
}
const processObject = new Process();
module.exports = processObject;
