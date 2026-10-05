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
 * http 模块（**只有客户端**）。
 *
 * 建在宿主的 `toolCall('http_request')` 之上，而不是裸 socket ——
 * 理由见 lib/http-driver.ts：那是一个走用户审批的工具，另起一套会绕过权限模型。
 *
 * 覆盖：request / get、ClientRequest（Writable，可 setHeader 后 end）、
 * IncomingMessage（Readable，带 statusCode / headers / rawHeaders）、
 * STATUS_CODES、METHODS、Agent（无连接池）。
 *
 * 不覆盖：
 *   - createServer / Server —— 沙箱里没有可监听的 socket，构造时显式抛 ONJ_UNSUPPORTED；
 *   - 请求体只能给文本（宿主工具的参数是字符串），二进制上行不做；
 *   - abort() 只发出 'abort' 事件，无法真正取消已经在宿主里跑着的请求（工具调用没有取消通道）；
 *   - 没有连接池 / keep-alive / HTTP/2。
 */
const streamModule = require("./stream");
const buffer_1 = require("./buffer");
const errors_1 = require("./lib/errors");
const httpDriver = __importStar(require("./lib/http-driver"));
function toAbsoluteUrl(input, fallbackProtocol) {
    if (typeof input === 'string') {
        return input;
    }
    if (typeof input.href === 'string' && input.href.length > 0) {
        return input.href;
    }
    const protocol = typeof input.protocol === 'string' && input.protocol.length > 0
        ? input.protocol
        : fallbackProtocol;
    const withColon = protocol.charAt(protocol.length - 1) === ':' ? protocol : protocol + ':';
    let host = '';
    if (typeof input.host === 'string' && input.host.length > 0) {
        host = input.host;
    }
    else {
        host = typeof input.hostname === 'string' ? input.hostname : '';
        if (input.port !== undefined && input.port !== null && String(input.port) !== '') {
            host += ':' + String(input.port);
        }
    }
    const auth = typeof input.auth === 'string' && input.auth.length > 0 ? input.auth + '@' : '';
    const path = typeof input.path === 'string' && input.path.length > 0 ? input.path : '/';
    return withColon + '//' + auth + host + path;
}
class IncomingMessage extends streamModule.Readable {
    constructor(response) {
        super();
        this.httpVersion = '1.1';
        this.httpVersionMajor = 1;
        this.httpVersionMinor = 1;
        this.complete = true;
        this.method = null;
        this.aborted = false;
        this.statusCode = response.statusCode;
        this.statusMessage = response.statusMessage;
        this.url = response.url;
        // Node 的 headers 用全小写键名
        const normalized = {};
        const raw = [];
        const names = Object.keys(response.headers);
        for (let i = 0; i < names.length; i += 1) {
            const name = names[i];
            normalized[name.toLowerCase()] = response.headers[name];
            raw.push(name, response.headers[name]);
        }
        this.headers = normalized;
        this.rawHeaders = raw;
        const body = response.contentBase64 !== null && response.contentBase64 !== ''
            ? buffer_1.Buffer.from(response.contentBase64, 'base64')
            : buffer_1.Buffer.from(response.content, 'utf8');
        if (body.length > 0) {
            this.push(body);
        }
        this.push(null);
    }
    // 数据在构造时就推完了，不需要主动拉
    _read(size) {
        void size;
    }
}
class ClientRequest extends streamModule.Writable {
    constructor(input, options, callback) {
        super();
        this.maxHeadersCount = null;
        this.reusedSocket = false;
        this.aborted = false;
        this.finished = false;
        this.headerMap = {};
        this.bodyChunks = [];
        this.timer = null;
        let opts = {};
        let done = callback;
        if (typeof options === 'function') {
            done = options;
        }
        else if (options !== undefined && options !== null) {
            opts = options;
        }
        const source = typeof input === 'string' ? { href: input } : input;
        this.targetUrl = toAbsoluteUrl(input, 'http:');
        this.method = (opts.method !== undefined ? opts.method : (source.method !== undefined ? source.method : 'GET')).toUpperCase();
        const path = typeof source.path === 'string' && source.path.length > 0 ? source.path : '/';
        this.path = path;
        const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/.exec(this.targetUrl);
        this.protocol = schemeMatch === null ? 'http:' : schemeMatch[1] + ':';
        this.host = typeof source.hostname === 'string' ? source.hostname : '';
        const headers = opts.headers !== undefined ? opts.headers : source.headers;
        if (headers !== undefined && headers !== null) {
            const names = Object.keys(headers);
            for (let i = 0; i < names.length; i += 1) {
                this.setHeader(names[i], headers[names[i]]);
            }
        }
        if (typeof done === 'function') {
            this.once('response', done);
        }
    }
    setHeader(name, value) {
        this.headerMap[String(name).toLowerCase()] = String(value);
        return this;
    }
    getHeader(name) {
        return this.headerMap[String(name).toLowerCase()];
    }
    getHeaders() {
        return Object.assign({}, this.headerMap);
    }
    getHeaderNames() {
        return Object.keys(this.headerMap);
    }
    hasHeader(name) {
        return Object.prototype.hasOwnProperty.call(this.headerMap, String(name).toLowerCase());
    }
    removeHeader(name) {
        delete this.headerMap[String(name).toLowerCase()];
    }
    _write(chunk, encoding, callback) {
        void encoding;
        this.bodyChunks.push(chunk);
        callback(null);
    }
    _final(callback) {
        this.send();
        callback(null);
    }
    send() {
        const self = this;
        if (this.aborted) {
            return;
        }
        let body;
        if (this.bodyChunks.length > 0) {
            body = buffer_1.Buffer.concat(this.bodyChunks).toString('utf8');
        }
        const spec = {
            url: this.targetUrl,
            method: this.method,
            headers: this.getHeaders()
        };
        if (body !== undefined) {
            spec.body = body;
        }
        this.finished = true;
        let pending;
        try {
            pending = httpDriver.getDriver().request(spec);
        }
        catch (failure) {
            // 驱动同步抛（例如宿主没有 toolCall）也要走 'error' 事件，不能漏出去
            this.emit('error', failure);
            return;
        }
        pending.then(httpDriver.normalizeResponse).then(function (response) {
            self.clearTimer();
            self.emit('response', new IncomingMessage(response));
            self.emit('close');
        }, function (failure) {
            self.clearTimer();
            self.emit('error', failure);
        });
    }
    clearTimer() {
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
    setTimeout(milliseconds, callback) {
        this.clearTimer();
        const self = this;
        this.timer = setTimeout(function () {
            self.emit('timeout');
            if (typeof callback === 'function') {
                callback();
            }
        }, milliseconds);
        return this;
    }
    /** 只能发出 'abort'：宿主的工具调用没有取消通道，已在跑的请求停不下来。 */
    abort() {
        if (this.aborted) {
            return;
        }
        this.aborted = true;
        this.clearTimer();
        this.emit('abort');
    }
    destroy(error) {
        this.abort();
        if (error !== undefined) {
            this.emit('error', error);
        }
        return this;
    }
}
class Agent {
    constructor() {
        this.maxSockets = Infinity;
        this.maxFreeSockets = 256;
        this.sockets = {};
        this.freeSockets = {};
        this.requests = {};
        this.options = {};
        this.maxTotalSockets = Infinity;
        this.totalSocketCount = 0;
    }
    /** 没有真实连接可销毁 —— 请求由宿主工具代发。 */
    destroy() {
        return;
    }
}
function request(input, options, callback) {
    return new ClientRequest(input, options, callback);
}
function get(input, options, callback) {
    const clientRequest = request(input, options, callback);
    // end() 是 applyWritable 挂到 Writable.prototype 上的，类型里没有，得转一下
    clientRequest.end();
    return clientRequest;
}
function createServer() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'http.createServer() 需要监听 socket，Operit 的沙箱脚本没有这个能力；' +
        '网络访问请用工具调用（toolCall("http_request") 或内建的 axios）。');
}
const METHODS = [
    'ACL', 'BIND', 'CHECKOUT', 'CONNECT', 'COPY', 'DELETE', 'GET', 'HEAD', 'LINK', 'LOCK',
    'M-SEARCH', 'MERGE', 'MKACTIVITY', 'MKCALENDAR', 'MKCOL', 'MOVE', 'NOTIFY', 'OPTIONS',
    'PATCH', 'POST', 'PROPFIND', 'PROPPATCH', 'PURGE', 'PUT', 'REBIND', 'REPORT', 'SEARCH',
    'SOURCE', 'SUBSCRIBE', 'TRACE', 'UNBIND', 'UNLINK', 'UNLOCK', 'UNSUBSCRIBE'
];
const STATUS_CODES = {
    100: 'Continue', 101: 'Switching Protocols', 102: 'Processing', 103: 'Early Hints',
    200: 'OK', 201: 'Created', 202: 'Accepted', 203: 'Non-Authoritative Information',
    204: 'No Content', 205: 'Reset Content', 206: 'Partial Content', 207: 'Multi-Status',
    208: 'Already Reported', 226: 'IM Used',
    300: 'Multiple Choices', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other',
    304: 'Not Modified', 305: 'Use Proxy', 307: 'Temporary Redirect', 308: 'Permanent Redirect',
    400: 'Bad Request', 401: 'Unauthorized', 402: 'Payment Required', 403: 'Forbidden',
    404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable',
    407: 'Proxy Authentication Required', 408: 'Request Timeout', 409: 'Conflict',
    410: 'Gone', 411: 'Length Required', 412: 'Precondition Failed', 413: 'Payload Too Large',
    414: 'URI Too Long', 415: 'Unsupported Media Type', 416: 'Range Not Satisfiable',
    417: 'Expectation Failed', 418: "I'm a Teapot", 421: 'Misdirected Request',
    422: 'Unprocessable Entity', 423: 'Locked', 424: 'Failed Dependency', 425: 'Too Early',
    426: 'Upgrade Required', 428: 'Precondition Required', 429: 'Too Many Requests',
    431: 'Request Header Fields Too Large', 451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway',
    503: 'Service Unavailable', 504: 'Gateway Timeout', 505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates', 507: 'Insufficient Storage', 508: 'Loop Detected',
    509: 'Bandwidth Limit Exceeded', 510: 'Not Extended', 511: 'Network Authentication Required'
};
const api = {
    request: request,
    get: get,
    createServer: createServer,
    ClientRequest: ClientRequest,
    IncomingMessage: IncomingMessage,
    Agent: Agent,
    globalAgent: new Agent(),
    METHODS: METHODS,
    STATUS_CODES: STATUS_CODES,
    maxHeaderSize: 16384
};
module.exports = api;
