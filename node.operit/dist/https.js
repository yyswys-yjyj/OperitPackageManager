'use strict';
/**
 * https 模块。
 *
 * 与 http 是同一套实现：TLS 由宿主那一侧处理（工具走 OkHttp），
 * 沙箱里既没有 socket 也没有证书链可管。这里只把缺省协议改成 https:。
 */
const httpModule = require("./http");
const errors_1 = require("./lib/errors");
/**
 * 只给"options 形式且没写明协议"的输入补上 https:。
 *
 * 字符串输入必须原样返回 —— 早先这里返回了 {} 把 URL 丢掉了，
 * 结果 https.get('https://x/') 变成了 http:///。
 */
function withHttpsDefault(input) {
    if (typeof input === 'string') {
        return input;
    }
    if (typeof input.href === 'string' && input.href.length > 0) {
        return input;
    }
    if (typeof input.protocol === 'string' && input.protocol.length > 0) {
        return input;
    }
    return Object.assign({ protocol: 'https:' }, input);
}
function request(input, options, callback) {
    return httpModule.request(withHttpsDefault(input), options, callback);
}
function get(input, options, callback) {
    return httpModule.get(withHttpsDefault(input), options, callback);
}
function createServer() {
    throw (0, errors_1.onjError)('ONJ_UNSUPPORTED', 'https.createServer() 需要监听 socket，Operit 的沙箱脚本没有这个能力；' +
        '网络访问请用工具调用（toolCall("http_request") 或内建的 axios）。');
}
const api = {
    request: request,
    get: get,
    createServer: createServer,
    Agent: httpModule.Agent,
    globalAgent: httpModule.globalAgent,
    METHODS: httpModule.METHODS,
    STATUS_CODES: httpModule.STATUS_CODES,
    ClientRequest: httpModule.ClientRequest,
    IncomingMessage: httpModule.IncomingMessage,
    maxHeaderSize: httpModule.maxHeaderSize
};
module.exports = api;
