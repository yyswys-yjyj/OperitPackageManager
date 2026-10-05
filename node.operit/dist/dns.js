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
 * dns 模块。
 *
 * 实现的是 **lookup 一族**（getaddrinfo），也就是 99% 的代码真正用到的那部分：
 *   lookup / lookupService / promises.lookup / promises.lookupService /
 *   getServers / setServers / getDefaultResultOrder / setDefaultResultOrder / 常量。
 *
 * **resolve 一族（resolveMx / resolveTxt / resolve4 …）与 reverse 显式抛 ONJ_UNSUPPORTED**：
 * 它们要做 DNS 记录级查询，需要 JNDI 的 DNS provider，而 com.sun.jndi.dns 不在 Android 里。
 * 这不是"还没做"，是平台不成立 —— 所以给明确拒绝，不给半个实现。
 *
 * 与 Node 的差异（都在 BUILTINS.json 里）：
 *   - 调用的**接口**是异步的（走 queueMicrotask），但底层 getaddrinfo 是同步的；
 *   - getServers() 返回空数组：Android 的 DNS 由 netd 按网络管理，JVM 侧读不到；
 *   - setServers() 抛 ONJ_UNSUPPORTED：无法重配 JVM 的解析器；
 *   - hints 选项接受但不生效（Java 的 getAllByName 没有对应开关）；
 *   - lookupService 的 service 用内置的常见端口表，未命中时给端口号字符串。
 */
const errors_1 = require("./lib/errors");
const dnsDriver = __importStar(require("./lib/dns-driver"));
const dnsPromises = require("./dns/promises");
/** getaddrinfo 的错误码数值，与 libuv 对齐（Node 用同一套）。 */
const GETADDRINFO_ERRNO = {
    ENOTFOUND: -3008,
    EAI_AGAIN: -3001,
    EAI_FAIL: -3003,
    EAI_NODATA: -3006,
    EAI_NONAME: -3007,
    ENODATA: -3006
};
/** 常见端口 -> 服务名。Node 的 lookupService 走 getnameinfo，这里用表代替。 */
const SERVICE_NAMES = {
    20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain',
    80: 'http', 110: 'pop3', 143: 'imap', 443: 'https', 465: 'smtps', 587: 'submission',
    993: 'imaps', 995: 'pop3s', 3306: 'mysql', 5432: 'postgresql', 6379: 'redis',
    8080: 'http-alt', 8443: 'https-alt'
};
let resultOrder = 'verbatim';
function dnsFailure(code, hostname) {
    const error = new Error('getaddrinfo ' + code + ' ' + hostname);
    error.code = code;
    error.errno = GETADDRINFO_ERRNO[code] === undefined ? -3008 : GETADDRINFO_ERRNO[code];
    error.syscall = 'getaddrinfo';
    error.hostname = hostname;
    return error;
}
function codeForFailure(failure) {
    const mapped = failure;
    if (mapped.code === 'ENOTFOUND' || mapped.code === 'EAI_AGAIN') {
        return mapped.code;
    }
    const message = mapped.message === undefined ? '' : mapped.message;
    if (/temporary failure in name resolution|unable to resolve host/i.test(message)) {
        return 'EAI_AGAIN';
    }
    return 'ENOTFOUND';
}
function serviceNameOf(port) {
    const known = SERVICE_NAMES[port];
    return known === undefined ? String(port) : known;
}
function normalizeOptions(options) {
    let family = 0;
    let all = false;
    let verbatim = resultOrder === 'verbatim';
    if (typeof options === 'number') {
        family = options;
    }
    else if (options !== undefined && options !== null) {
        if (typeof options.family === 'number') {
            family = options.family;
        }
        all = options.all === true;
        if (typeof options.verbatim === 'boolean') {
            verbatim = options.verbatim;
        }
    }
    return { family: family, all: all, verbatim: verbatim };
}
function lookup(hostname, options, callback) {
    let opts = options;
    let done = callback;
    if (typeof options === 'function') {
        done = options;
        opts = undefined;
    }
    if (typeof done !== 'function') {
        throw new TypeError('The "callback" argument must be of type function');
    }
    const host = String(hostname);
    const settings = normalizeOptions(opts);
    queueMicrotask(function () {
        let records;
        try {
            records = dnsDriver.getDriver().lookup(host);
        }
        catch (failure) {
            done(dnsFailure(codeForFailure(failure), host));
            return;
        }
        let filtered = records;
        if (settings.family === 4 || settings.family === 6) {
            filtered = records.filter(function (record) { return record.family === settings.family; });
        }
        if (!settings.verbatim) {
            filtered = filtered.slice().sort(function (left, right) { return left.family - right.family; });
        }
        if (filtered.length === 0) {
            done(dnsFailure('ENOTFOUND', host));
            return;
        }
        if (settings.all) {
            done(null, filtered);
            return;
        }
        done(null, filtered[0].address, filtered[0].family);
    });
}
function lookupService(address, port, callback) {
    if (typeof callback !== 'function') {
        throw new TypeError('The "callback" argument must be of type function');
    }
    const target = String(address);
    const numericPort = Number(port);
    queueMicrotask(function () {
        let hostname;
        try {
            hostname = dnsDriver.getDriver().canonicalNameOf(target);
        }
        catch (failure) {
            callback(dnsFailure(codeForFailure(failure), target));
            return;
        }
        callback(null, hostname, serviceNameOf(numericPort));
    });
}
/** Node 在 Android 这样的平台上读不到解析器配置，这里如实返回空数组。 */
function getServers() {
    return [];
}
function setServers() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'dns.setServers() 无法实现：JVM 的解析器配置改不了（Android 由 netd 按网络管理）。');
}
function getDefaultResultOrder() {
    return resultOrder;
}
function setDefaultResultOrder(order) {
    const value = String(order);
    if (value !== 'verbatim' && value !== 'ipv4first' && value !== 'ipv6first') {
        throw new TypeError('Invalid result order: ' + value);
    }
    resultOrder = value;
}
function unsupportedResolve(name) {
    return function () {
        throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'dns.' + name + '() 需要 DNS 记录级查询，而这要 JNDI 的 DNS provider —— ' +
            'com.sun.jndi.dns 不在 Android 里，所以这个能力在本平台不成立。' +
            '需要解析主机名请用 dns.lookup()（getaddrinfo）。');
    };
}
function Resolver() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'dns.Resolver 需要可配置的 DNS 记录级查询，Android 上不成立（同 dns.resolve*）。');
}
/**
 * getaddrinfo 的 hints 与错误码字符串。
 *
 * hints 的数值取 Node 自己的（ADDRCONFIG 1024 / V4MAPPED 2048 / ALL 256），
 * 不是 libuv 的原始值 —— Node 在 lib/dns.js 里重映射过，对齐它才有意义。
 * Java 的 getAllByName 没有对应开关，所以这几个只作为取值存在，传了不生效。
 */
const constants = {
    ADDRCONFIG: 1024,
    V4MAPPED: 2048,
    ALL: 256,
    NODATA: 'ENODATA',
    FORMERR: 'EFORMERR',
    SERVFAIL: 'ESERVFAIL',
    NOTFOUND: 'ENOTFOUND',
    NOTIMP: 'ENOTIMP',
    REFUSED: 'EREFUSED',
    BADQUERY: 'EBADQUERY',
    BADNAME: 'EBADNAME',
    BADFAMILY: 'EBADFAMILY',
    BADRESP: 'EBADRESP',
    CONNREFUSED: 'ECONNREFUSED',
    TIMEOUT: 'ETIMEOUT',
    EOF: 'EOF',
    FILE: 'EFILE',
    NOMEM: 'ENOMEM',
    DESTRUCTION: 'EDESTRUCTION',
    BADSTR: 'EBADSTR',
    BADFLAGS: 'EBADFLAGS',
    NONAME: 'ENONAME',
    BADHINTS: 'EBADHINTS',
    NOTINITIALIZED: 'ENOTINITIALIZED',
    LOADIPHLPAPI: 'ELOADIPHLPAPI',
    ADDRGETNETWORKPARAMS: 'EADDRGETNETWORKPARAMS',
    CANCELLED: 'ECANCELLED'
};
const api = Object.assign({
    lookup: lookup,
    lookupService: lookupService,
    resolve: unsupportedResolve('resolve'),
    resolve4: unsupportedResolve('resolve4'),
    resolve6: unsupportedResolve('resolve6'),
    resolveAny: unsupportedResolve('resolveAny'),
    resolveCaa: unsupportedResolve('resolveCaa'),
    resolveCname: unsupportedResolve('resolveCname'),
    resolveMx: unsupportedResolve('resolveMx'),
    resolveNaptr: unsupportedResolve('resolveNaptr'),
    resolveNs: unsupportedResolve('resolveNs'),
    resolvePtr: unsupportedResolve('resolvePtr'),
    resolveSoa: unsupportedResolve('resolveSoa'),
    resolveSrv: unsupportedResolve('resolveSrv'),
    resolveTlsa: unsupportedResolve('resolveTlsa'),
    resolveTxt: unsupportedResolve('resolveTxt'),
    reverse: unsupportedResolve('reverse'),
    getServers: getServers,
    setServers: setServers,
    getDefaultResultOrder: getDefaultResultOrder,
    setDefaultResultOrder: setDefaultResultOrder,
    Resolver: Resolver,
    promises: dnsPromises
}, constants);
module.exports = api;
