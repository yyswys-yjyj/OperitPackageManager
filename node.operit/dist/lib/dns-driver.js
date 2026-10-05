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
exports.setDriver = setDriver;
exports.createJavaDriver = createJavaDriver;
exports.getDriver = getDriver;
/**
 * dns 的宿主驱动层：把"怎么把主机名解析成地址"收敛在一处，便于测试注入。
 *
 * 基于 java.net.InetAddress（即 getaddrinfo），这也是 dns.lookup 在 Node 里的实现路径。
 * **记录级查询（resolveMx / resolveTxt 等）在 Android 上不成立**：
 * 那需要 JNDI 的 DNS provider，而 com.sun.jndi.dns 不在 Android 里，
 * 所以 dns.ts 对它们显式抛 ONJ_UNSUPPORTED，不做半个实现。
 */
const bridge = __importStar(require("./bridge"));
const errors_1 = require("./errors");
let driver = null;
/** 宿主注入点：桌面测试用，传 null 恢复为 Operit Java 驱动。 */
function setDriver(next) {
    driver = next;
}
/** Java 可能给链路本地地址带上作用域（fe80::1%wlan0），Node 不给，这里去掉。 */
function stripScope(address) {
    const percent = address.indexOf('%');
    return percent < 0 ? address : address.slice(0, percent);
}
function createJavaDriver() {
    return {
        lookup(hostname) {
            const list = bridge.callStatic('java.net.InetAddress', 'getAllByName', [hostname]);
            if (!Array.isArray(list)) {
                throw (0, errors_1.createError)('EIO', 'getaddrinfo', hostname);
            }
            const out = [];
            for (let i = 0; i < list.length; i += 1) {
                const raw = String(bridge.callInstance(list[i], 'getHostAddress', []));
                const address = stripScope(raw);
                out.push({ address: address, family: address.indexOf(':') >= 0 ? 6 : 4 });
            }
            return out;
        },
        canonicalNameOf(address) {
            const handle = bridge.callStatic('java.net.InetAddress', 'getByName', [address]);
            return String(bridge.callInstance(handle, 'getCanonicalHostName', []));
        }
    };
}
function getDriver() {
    if (driver === null) {
        driver = createJavaDriver();
    }
    return driver;
}
