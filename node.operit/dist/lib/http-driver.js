'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.setDriver = setDriver;
exports.normalizeResponse = normalizeResponse;
exports.getDriver = getDriver;
let driver = null;
/** 宿主注入点：桌面测试用，传 null 恢复为走 toolCall 的默认实现。 */
function setDriver(next) {
    driver = next;
}
function hostToolCall() {
    const global = globalThis;
    if (typeof global.toolCall !== 'function') {
        throw new Error('node.operit: 宿主没有提供 toolCall，http 请求无法发出。');
    }
    return global.toolCall;
}
/**
 * 把宿主返回的对象校验成 HttpHostResponse；形状不对就明确报错，不做静默兜底。
 *
 * 这一步必须对**所有**驱动都跑（包括测试注入的），所以由 http.ts 在 send() 里调用，
 * 而不是只放在默认驱动里 —— 否则注入的驱动会绕开校验。
 */
function normalizeResponse(raw) {
    if (raw === null || typeof raw !== 'object') {
        throw new Error('node.operit: http_request 的返回值不是对象，无法解释为 HTTP 响应。');
    }
    const value = raw;
    if (typeof value.statusCode !== 'number') {
        throw new Error('node.operit: http_request 的返回值缺少 statusCode 字段。');
    }
    const headers = {};
    if (value.headers !== null && typeof value.headers === 'object') {
        const source = value.headers;
        for (const key of Object.keys(source)) {
            headers[key] = String(source[key]);
        }
    }
    return {
        url: typeof value.url === 'string' ? value.url : '',
        statusCode: value.statusCode,
        statusMessage: typeof value.statusMessage === 'string' ? value.statusMessage : '',
        headers: headers,
        contentType: typeof value.contentType === 'string' ? value.contentType : '',
        content: typeof value.content === 'string' ? value.content : '',
        contentBase64: typeof value.contentBase64 === 'string' ? value.contentBase64 : null,
        size: typeof value.size === 'number' ? value.size : 0
    };
}
function createHostDriver() {
    return {
        request(spec) {
            const params = {
                url: spec.url,
                method: spec.method
            };
            if (Object.keys(spec.headers).length > 0) {
                params.headers = JSON.stringify(spec.headers);
            }
            if (spec.body !== undefined) {
                params.body = spec.body;
            }
            return hostToolCall()('http_request', params);
        }
    };
}
function getDriver() {
    if (driver === null) {
        driver = createHostDriver();
    }
    return driver;
}
