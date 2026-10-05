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
Object.defineProperty(exports, "__esModule", { value: true });
exports.constants = exports.devNull = exports.EOL = void 0;
exports.platform = platform;
exports.arch = arch;
exports.machine = machine;
exports.type = type;
exports.release = release;
exports.version = version;
exports.endianness = endianness;
exports.hostname = hostname;
exports.tmpdir = tmpdir;
exports.homedir = homedir;
exports.availableParallelism = availableParallelism;
exports.cpus = cpus;
exports.totalmem = totalmem;
exports.freemem = freemem;
exports.loadavg = loadavg;
exports.uptime = uptime;
exports.userInfo = userInfo;
exports.networkInterfaces = networkInterfaces;
exports.getPriority = getPriority;
exports.setPriority = setPriority;
/**
 * Node os 模块的移植。
 *
 * 取值全部来自 Android / Java 侧，因此与桌面 Node 的数值必然不同；
 * 这里保证的是**形状与语义**（类型、单位、字段名）与 Node 一致，
 * 以及每个近似值都在 README / BUILTINS.json 里写清楚。
 *
 * 已知近似：
 *   - totalmem / freemem 取的是 JVM 堆上限与空闲量，不是物理内存
 *   - cpus() 的 model 是 os.arch，speed 为 0，times 全 0
 *   - homedir() 返回 /sdcard（Android 没有用户 home 概念）
 *   - loadavg() 恒为 [0,0,0]
 */
const bridge = __importStar(require("./lib/bridge"));
const paths = __importStar(require("./lib/paths"));
const errors_1 = require("./lib/errors");
function runtime() {
    return bridge.callStatic('java.lang.Runtime', 'getRuntime', []);
}
function readProperty(name) {
    const value = bridge.callStatic('java.lang.System', 'getProperty', [name]);
    return typeof value === 'string' ? value : '';
}
/** Node 的 arch 命名与 Java 的 os.arch 不同，这里显式映射。 */
function mapArch(javaArch) {
    switch (javaArch) {
        case 'aarch64':
        case 'arm64':
            return 'arm64';
        case 'x86_64':
        case 'amd64':
            return 'x64';
        case 'i386':
        case 'i686':
        case 'x86':
            return 'ia32';
        case 'arm':
            return 'arm';
        default:
            return javaArch;
    }
}
exports.EOL = '\n';
function platform() {
    return 'android';
}
function arch() {
    return mapArch(readProperty('os.arch'));
}
function machine() {
    return arch();
}
function type() {
    return 'Linux';
}
function release() {
    const value = bridge.getStaticField('android.os.Build$VERSION', 'RELEASE');
    return typeof value === 'string' ? value : '';
}
function version() {
    return readProperty('os.version');
}
function endianness() {
    return 'LE';
}
function hostname() {
    const local = bridge.callStatic('java.net.InetAddress', 'getLocalHost', []);
    const name = bridge.callInstance(local, 'getHostName', []);
    return typeof name === 'string' ? name : '';
}
function tmpdir() {
    return paths.cacheDir();
}
/** Android 没有用户 home；按已安装包都可见的公共目录取 /sdcard。 */
function homedir() {
    return '/sdcard';
}
function availableParallelism() {
    const value = bridge.callInstance(runtime(), 'availableProcessors', []);
    const count = Number(value);
    return isFinite(count) && count > 0 ? count : 1;
}
function cpus() {
    const count = availableParallelism();
    const model = readProperty('os.arch');
    const out = [];
    for (let i = 0; i < count; i += 1) {
        out.push({
            model: model,
            speed: 0,
            times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
        });
    }
    return out;
}
/** JVM 堆上限，不是物理内存总量。 */
function totalmem() {
    return Number(bridge.callInstance(runtime(), 'maxMemory', [])) || 0;
}
/** JVM 堆空闲量，不是系统可用内存。 */
function freemem() {
    return Number(bridge.callInstance(runtime(), 'freeMemory', [])) || 0;
}
function loadavg() {
    return [0, 0, 0];
}
function uptime() {
    const elapsed = Number(bridge.callStatic('android.os.SystemClock', 'elapsedRealtime', [])) || 0;
    return Math.floor(elapsed / 1000);
}
function userInfo() {
    return {
        uid: -1,
        gid: -1,
        username: readProperty('user.name'),
        homedir: homedir(),
        shell: '/system/sh'
    };
}
/** 通过 NetworkInterface 的 Enumeration 逐个展开；Java 侧没有直接可用的集合视图。 */
function networkInterfaces() {
    const out = {};
    const interfaces = bridge.callStatic('java.net.NetworkInterface', 'getNetworkInterfaces', []);
    if (interfaces === null || typeof interfaces !== 'object') {
        return out;
    }
    while (bridge.normalizeBoolean(bridge.callInstance(interfaces, 'hasMoreElements', []))) {
        const current = bridge.callInstance(interfaces, 'nextElement', []);
        const name = String(bridge.callInstance(current, 'getName', []));
        const addresses = [];
        const enumeration = bridge.callInstance(current, 'getInetAddresses', []);
        while (bridge.normalizeBoolean(bridge.callInstance(enumeration, 'hasMoreElements', []))) {
            const address = bridge.callInstance(enumeration, 'nextElement', []);
            const text = String(bridge.callInstance(address, 'getHostAddress', []));
            addresses.push({
                address: text,
                family: text.indexOf(':') >= 0 ? 'IPv6' : 'IPv4',
                internal: bridge.normalizeBoolean(bridge.callInstance(address, 'isLoopbackAddress', []))
            });
        }
        out[name] = addresses;
    }
    return out;
}
/** Node 的 os.devNull 是字符串属性，不是函数。 */
exports.devNull = '/dev/null';
/** 进程优先级在 Android 上由调度器策略决定，Node 的 niceness 语义不成立。 */
function getPriority() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'os.getPriority() 依赖 POSIX niceness，Android 上不成立。');
}
function setPriority() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'os.setPriority() 依赖 POSIX niceness，Android 上不成立。');
}
function buildPositiveErrno() {
    const out = {};
    const names = Object.keys(errors_1.ERRNO);
    for (let i = 0; i < names.length; i += 1) {
        out[names[i]] = Math.abs(errors_1.ERRNO[names[i]]);
    }
    return out;
}
exports.constants = {
    signals: {
        SIGHUP: 1,
        SIGINT: 2,
        SIGQUIT: 3,
        SIGILL: 4,
        SIGTRAP: 5,
        SIGABRT: 6,
        SIGBUS: 7,
        SIGFPE: 8,
        SIGKILL: 9,
        SIGUSR1: 10,
        SIGSEGV: 11,
        SIGUSR2: 12,
        SIGPIPE: 13,
        SIGALRM: 14,
        SIGTERM: 15,
        SIGWINCH: 28
    },
    // Node 的 os.constants.errno 是正的，而 lib/errors 的 ERRNO 取负（对应 error.errno）
    errno: buildPositiveErrno(),
    priority: {
        PRIORITY_LOW: 19,
        PRIORITY_BELOW_NORMAL: 10,
        PRIORITY_NORMAL: 0,
        PRIORITY_ABOVE_NORMAL: -7,
        PRIORITY_HIGH: -14,
        PRIORITY_HIGHEST: -20
    }
};
