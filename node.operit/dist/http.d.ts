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
import streamModule = require('./stream');
import * as httpDriver from './lib/http-driver';
import type { RequestOptions } from './lib/http-types';
declare class IncomingMessage extends streamModule.Readable {
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    rawHeaders: string[];
    httpVersion: string;
    httpVersionMajor: number;
    httpVersionMinor: number;
    complete: boolean;
    url: string;
    method: string | null;
    aborted: boolean;
    constructor(response: httpDriver.HttpHostResponse);
    _read(size: number): void;
}
type ResponseCallback = (response: IncomingMessage) => void;
declare class ClientRequest extends streamModule.Writable {
    method: string;
    path: string;
    protocol: string;
    host: string;
    readonly maxHeadersCount: number | null;
    readonly reusedSocket = false;
    aborted: boolean;
    finished: boolean;
    readonly targetUrl: string;
    readonly headerMap: Record<string, string>;
    bodyChunks: Uint8Array[];
    timer: unknown;
    constructor(input: string | RequestOptions, options?: RequestOptions | ResponseCallback, callback?: ResponseCallback);
    setHeader(name: unknown, value: unknown): this;
    getHeader(name: unknown): string | undefined;
    getHeaders(): Record<string, string>;
    getHeaderNames(): string[];
    hasHeader(name: unknown): boolean;
    removeHeader(name: unknown): void;
    _write(chunk: unknown, encoding: string, callback: (error?: Error | null) => void): void;
    _final(callback: (error?: Error | null) => void): void;
    send(): void;
    clearTimer(): void;
    setTimeout(milliseconds: number, callback?: () => void): this;
    /** 只能发出 'abort'：宿主的工具调用没有取消通道，已在跑的请求停不下来。 */
    abort(): void;
    destroy(error?: Error): this;
}
declare class Agent {
    maxSockets: number;
    maxFreeSockets: number;
    readonly sockets: Record<string, unknown[]>;
    readonly freeSockets: Record<string, unknown[]>;
    readonly requests: Record<string, unknown[]>;
    readonly options: Record<string, unknown>;
    readonly maxTotalSockets: number;
    totalSocketCount: number;
    /** 没有真实连接可销毁 —— 请求由宿主工具代发。 */
    destroy(): void;
}
declare function request(input: string | RequestOptions, options?: RequestOptions | ResponseCallback, callback?: ResponseCallback): ClientRequest;
declare function get(input: string | RequestOptions, options?: RequestOptions | ResponseCallback, callback?: ResponseCallback): ClientRequest;
declare function createServer(): never;
declare const api: {
    request: typeof request;
    get: typeof get;
    createServer: typeof createServer;
    ClientRequest: typeof ClientRequest;
    IncomingMessage: typeof IncomingMessage;
    Agent: typeof Agent;
    globalAgent: Agent;
    METHODS: string[];
    STATUS_CODES: Record<number, string>;
    maxHeaderSize: number;
};
export = api;
