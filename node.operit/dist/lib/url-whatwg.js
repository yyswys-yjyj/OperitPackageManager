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
exports.URL = void 0;
exports.fragmentEncodeSet = fragmentEncodeSet;
exports.queryEncodeSet = queryEncodeSet;
exports.specialQueryEncodeSet = specialQueryEncodeSet;
exports.pathEncodeSet = pathEncodeSet;
exports.userinfoEncodeSet = userinfoEncodeSet;
exports.parseUrlRecord = parseUrlRecord;
/**
 * WHATWG URL（RFC 3986 + URL 标准的解析与序列化）。
 *
 * 覆盖：特殊协议（http/https/ws/wss/ftp/file）与自定义协议、authority（userinfo / host / port）、
 * IPv4 / IPv6 / 域名的 punycode、按组件的百分号编码、点段规范化、相对引用解析、
 * 全部 getter 与 setter、url.searchParams 的活视图、URL.canParse / URL.parse。
 *
 * 与 Node 的已知差异见 BUILTINS.json 的 url 条目：IPv4 的十六进制/八进制写法、
 * 非 ASCII 域名的 UTS-46 映射（只做 punycode，不做映射与归一化）、blob: 的 origin。
 */
const url_search_params_1 = require("./url-search-params");
const punycode = __importStar(require("./punycode"));
const bytes_1 = require("./bytes");
// ------------------------------------------------------------------ 编码集
function isC0Control(code) {
    return code <= 0x1f || code > 0x7e;
}
/** fragment 组：C0 组 + 空格 " < > ` */
function fragmentEncodeSet(code) {
    return isC0Control(code) || code === 0x20 || code === 0x22 || code === 0x3c || code === 0x3e || code === 0x60;
}
/** query 组：C0 组 + 空格 " # < > */
function queryEncodeSet(code) {
    return isC0Control(code) || code === 0x20 || code === 0x22 || code === 0x23 || code === 0x3c || code === 0x3e;
}
/** special-query 组：query 组 + ' */
function specialQueryEncodeSet(code) {
    return queryEncodeSet(code) || code === 0x27;
}
/** path 组：query 组 + ? ` { } */
function pathEncodeSet(code) {
    return queryEncodeSet(code) || code === 0x3f || code === 0x60 || code === 0x7b || code === 0x7d;
}
/** userinfo 组：path 组 + / : ; = @ [ \ ] ^ | */
function userinfoEncodeSet(code) {
    return pathEncodeSet(code) || code === 0x2f || code === 0x3a || code === 0x3b || code === 0x3d ||
        code === 0x40 || (code >= 0x5b && code <= 0x5e) || code === 0x7c;
}
const HEX = '0123456789ABCDEF';
function hex2(value) {
    return '%' + HEX.charAt((value >> 4) & 15) + HEX.charAt(value & 15);
}
function pctEncode(input, inSet) {
    const bytes = (0, bytes_1.utf8Encode)(input);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        out += inSet(byte) ? hex2(byte) : String.fromCharCode(byte);
    }
    return out;
}
// ------------------------------------------------------------------ 特殊协议
const SPECIAL_PORTS = {
    ftp: 21,
    file: -1,
    http: 80,
    https: 443,
    ws: 80,
    wss: 443
};
function isSpecialScheme(scheme) {
    return Object.prototype.hasOwnProperty.call(SPECIAL_PORTS, scheme);
}
function defaultPortOf(scheme) {
    const value = SPECIAL_PORTS[scheme];
    return value === undefined ? -1 : value;
}
function emptyRecord() {
    return {
        scheme: '',
        username: '',
        password: '',
        host: null,
        port: null,
        path: [],
        query: null,
        fragment: null
    };
}
function pathSerializerOf(record, excludeFragment) {
    let out = record.scheme + ':';
    if (record.host !== null) {
        out += '//';
        if (record.username !== '' || record.password !== '') {
            out += record.username;
            if (record.password !== '') {
                out += ':' + record.password;
            }
            out += '@';
        }
        out += record.host;
        if (record.port !== null) {
            out += ':' + record.port;
        }
    }
    if (typeof record.path === 'string') {
        out += record.path;
    }
    else {
        for (let i = 0; i < record.path.length; i += 1) {
            out += '/' + record.path[i];
        }
    }
    if (record.query !== null) {
        out += '?' + record.query;
    }
    if (!excludeFragment && record.fragment !== null) {
        out += '#' + record.fragment;
    }
    return out;
}
function serializeRecord(record) {
    return pathSerializerOf(record, false);
}
function authorityOf(record) {
    if (record.host === null) {
        return '';
    }
    let out = '';
    if (record.username !== '' || record.password !== '') {
        out += record.username;
        if (record.password !== '') {
            out += ':' + record.password;
        }
        out += '@';
    }
    out += record.host;
    if (record.port !== null) {
        out += ':' + record.port;
    }
    return out;
}
function pathTextOf(record) {
    if (typeof record.path === 'string') {
        return record.path;
    }
    let out = '';
    for (let i = 0; i < record.path.length; i += 1) {
        out += '/' + record.path[i];
    }
    return out;
}
// ------------------------------------------------------------------ 主机解析
/** 把一段 ':' 分隔的组转成数字；最后一段允许是 IPv4 写法（占两组）。 */
function convertGroups(list, allowIPv4, out) {
    for (let i = 0; i < list.length; i += 1) {
        const piece = list[i];
        if (piece === '') {
            return false;
        }
        if (piece.indexOf('.') >= 0) {
            if (!allowIPv4 || i !== list.length - 1) {
                return false;
            }
            const ipv4 = parseIPv4(piece);
            if (ipv4 === null) {
                return false;
            }
            const parts = ipv4.split('.');
            out.push(Number(parts[0]) * 256 + Number(parts[1]));
            out.push(Number(parts[2]) * 256 + Number(parts[3]));
            continue;
        }
        if (!/^[0-9A-Fa-f]{1,4}$/.test(piece)) {
            return false;
        }
        out.push(parseInt(piece, 16));
    }
    return true;
}
/** 解析 IPv6，返回规范化的 8 组（不含方括号）。中间的 :: 按最长零串压缩。 */
function parseIPv6(input) {
    const first = input.indexOf('::');
    if (first >= 0 && input.indexOf('::', first + 1) >= 0) {
        return null;
    }
    const headText = first >= 0 ? input.slice(0, first) : input;
    const tailText = first >= 0 ? input.slice(first + 2) : '';
    const head = [];
    const tail = [];
    if (headText !== '') {
        if (!convertGroups(headText.split(':'), first < 0, head)) {
            return null;
        }
    }
    if (tailText !== '') {
        if (!convertGroups(tailText.split(':'), true, tail)) {
            return null;
        }
    }
    let address;
    if (first >= 0) {
        const zeros = 8 - head.length - tail.length;
        if (zeros < 1) {
            return null;
        }
        address = head.concat(new Array(zeros).fill(0), tail);
    }
    else {
        if (head.length !== 8) {
            return null;
        }
        address = head;
    }
    // 序列化：找最长的零串压缩
    let bestStart = -1;
    let bestLength = 0;
    let runStart = -1;
    for (let i = 0; i <= 8; i += 1) {
        if (i < 8 && address[i] === 0) {
            if (runStart < 0) {
                runStart = i;
            }
        }
        else if (runStart >= 0) {
            const length = i - runStart;
            if (length > bestLength) {
                bestLength = length;
                bestStart = runStart;
            }
            runStart = -1;
        }
    }
    const compress = bestLength > 1 ? bestStart : -1;
    let output = '';
    let ignoring = false;
    for (let i = 0; i < 8; i += 1) {
        if (ignoring && address[i] === 0) {
            continue;
        }
        if (i === compress) {
            output += i === 0 ? '::' : ':';
            ignoring = true;
            continue;
        }
        ignoring = false;
        output += address[i].toString(16);
        if (i !== 7) {
            output += ':';
        }
    }
    return output;
}
function parseIPv4Number(input) {
    if (input === '') {
        return null;
    }
    let radix = 10;
    if (input.length >= 2 && (input.charAt(0) === '0' && (input.charAt(1) === 'x' || input.charAt(1) === 'X'))) {
        radix = 16;
        input = input.slice(2);
    }
    else if (input.length >= 2 && input.charAt(0) === '0') {
        radix = 8;
        input = input.slice(1);
    }
    if (input === '') {
        return 0;
    }
    const pattern = radix === 16 ? /^[0-9A-Fa-f]+$/ : (radix === 8 ? /^[0-7]+$/ : /^[0-9]+$/);
    if (!pattern.test(input)) {
        return null;
    }
    return parseInt(input, radix);
}
function parseIPv4(input) {
    const parts = input.split('.');
    if (parts.length > 1 && parts[parts.length - 1] === '') {
        parts.pop();
    }
    if (parts.length > 4) {
        return null;
    }
    const numbers = [];
    for (let i = 0; i < parts.length; i += 1) {
        const value = parseIPv4Number(parts[i]);
        if (value === null) {
            return null;
        }
        numbers.push(value);
    }
    for (let i = 0; i < numbers.length - 1; i += 1) {
        if (numbers[i] > 255) {
            return null;
        }
    }
    if (numbers[numbers.length - 1] >= Math.pow(256, 5 - numbers.length)) {
        return null;
    }
    let ipv4 = numbers.pop();
    for (let i = 0; i < numbers.length; i += 1) {
        ipv4 += numbers[i] * Math.pow(256, 3 - i);
    }
    const result = [];
    for (let i = 0; i < 4; i += 1) {
        result.unshift(ipv4 % 256);
        ipv4 = Math.floor(ipv4 / 256);
    }
    return result.join('.');
}
/** endsInANumber 规则：主机以数字结尾时要按 IPv4 解析。 */
function endsInANumber(domain) {
    const parts = domain.split('.');
    if (parts[parts.length - 1] === '') {
        return false;
    }
    const last = parts[parts.length - 1];
    if (/^[0-9]+$/.test(last)) {
        return true;
    }
    return parseIPv4Number(last) !== null;
}
function parseHost(input, special) {
    if (input.charAt(0) === '[') {
        if (input.charAt(input.length - 1) !== ']') {
            return null;
        }
        const inner = parseIPv6(input.slice(1, input.length - 1));
        return inner === null ? null : '[' + inner + ']';
    }
    if (!special) {
        // 不透明主机：只做 C0 组编码
        return pctEncode(input, isC0Control);
    }
    let domain = input;
    try {
        domain = decodeURIComponent(domain);
    }
    catch (failure) {
        return null;
    }
    if (domain === '') {
        return null;
    }
    // 结尾的点保留（Node 也保留：http://example.com./ 的 host 就是 example.com.）
    domain = domain.toLowerCase();
    if (endsInANumber(domain)) {
        const ipv4 = parseIPv4(domain);
        return ipv4 === null ? null : ipv4;
    }
    return punycode.toASCII(domain);
}
// ------------------------------------------------------------------ 解析
function stripControls(input) {
    let start = 0;
    let end = input.length;
    while (start < end && input.charCodeAt(start) <= 0x20) {
        start += 1;
    }
    while (end > start && input.charCodeAt(end - 1) <= 0x20) {
        end -= 1;
    }
    return input.slice(start, end).replace(/[\t\n\r]/g, '');
}
function parsePort(input, scheme) {
    if (input === null || input === '') {
        return null;
    }
    if (!/^[0-9]+$/.test(input)) {
        return undefined;
    }
    const value = parseInt(input, 10);
    if (value > 65535) {
        return undefined;
    }
    return value === defaultPortOf(scheme) ? null : value;
}
/** 把路径段序列按点段规则规范化。 */
function normalizePathSegments(segments, keepEmpty) {
    const out = [];
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === '.' || (segment === '%2e' || segment === '%2E')) {
            if (i === segments.length - 1) {
                out.push('');
            }
            continue;
        }
        if (segment === '..' || segment === '.%2e' || segment === '%2e.' || segment === '%2e%2e') {
            if (out.length > 0) {
                out.pop();
            }
            if (i === segments.length - 1) {
                out.push('');
            }
            continue;
        }
        out.push(segment);
    }
    if (keepEmpty && out.length === 0) {
        out.push('');
    }
    return out;
}
function parseAbsolute(input, schemeHint) {
    const record = emptyRecord();
    let rest = input;
    let scheme = schemeHint;
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+\-.]*):/.exec(rest);
    if (schemeMatch !== null) {
        scheme = schemeMatch[1].toLowerCase();
        rest = rest.slice(schemeMatch[0].length);
    }
    if (scheme === null) {
        return null;
    }
    record.scheme = scheme;
    const special = isSpecialScheme(scheme);
    // authority
    let hasAuthority = false;
    if (special && scheme === 'file') {
        // file: 只有前两个斜杠是 authority 标记；再多斜杠表示空主机、路径从这里开始
        hasAuthority = true;
        if (rest.slice(0, 2) === '//') {
            rest = rest.slice(2);
        }
    }
    else if (special) {
        // 其它特殊协议：冒号后可以有任意多个 / 或反斜杠，全部跳过，
        // 所以 http:///path 的主机是 path（与 Node 一致）
        hasAuthority = true;
        let cut = 0;
        while (cut < rest.length && (rest.charAt(cut) === '/' || rest.charAt(cut) === '\\')) {
            cut += 1;
        }
        rest = rest.slice(cut);
    }
    else if (rest.slice(0, 2) === '//') {
        rest = rest.slice(2);
        hasAuthority = true;
    }
    if (hasAuthority) {
        // authority 到第一个 / ? # 为止（特殊协议里 \ 也当分隔符）
        let end = rest.length;
        for (let i = 0; i < rest.length; i += 1) {
            const ch = rest.charAt(i);
            if (ch === '/' || ch === '?' || ch === '#' || (special && ch === '\\')) {
                end = i;
                break;
            }
        }
        let authority = rest.slice(0, end);
        rest = rest.slice(end);
        if (special) {
            authority = authority.replace(/\\/g, '/');
            // 特殊协议里 authority 不应再有斜杠
            const slash = authority.indexOf('/');
            if (slash >= 0) {
                rest = authority.slice(slash) + rest;
                authority = authority.slice(0, slash);
            }
        }
        const at = authority.lastIndexOf('@');
        if (at >= 0) {
            let userinfo = authority.slice(0, at);
            authority = authority.slice(at + 1);
            const colon = userinfo.indexOf(':');
            if (colon >= 0) {
                record.username = pctEncode(userinfo.slice(0, colon), userinfoEncodeSet);
                record.password = pctEncode(userinfo.slice(colon + 1), userinfoEncodeSet);
            }
            else {
                record.username = pctEncode(userinfo, userinfoEncodeSet);
            }
        }
        let portText = null;
        if (authority.charAt(0) === '[') {
            const close = authority.indexOf(']');
            if (close < 0) {
                return null;
            }
            if (authority.charAt(close + 1) === ':') {
                portText = authority.slice(close + 2);
            }
            authority = authority.slice(0, close + 1);
        }
        else {
            const colon = authority.lastIndexOf(':');
            if (colon >= 0) {
                portText = authority.slice(colon + 1);
                authority = authority.slice(0, colon);
            }
        }
        // file:///path 的主机是空串（合法），file://localhost/ 也归一成空主机；
        // 其它特殊协议不允许空主机
        let host;
        if (scheme === 'file' && (authority === '' || authority.toLowerCase() === 'localhost')) {
            host = '';
        }
        else {
            host = parseHost(authority, special);
        }
        if (host === null) {
            return null;
        }
        record.host = host;
        const port = parsePort(portText, scheme);
        if (port === undefined) {
            return null;
        }
        record.port = port;
        if (scheme === 'file' && (record.username !== '' || record.password !== '' || record.port !== null)) {
            return null;
        }
    }
    // fragment
    const hashAt = rest.indexOf('#');
    if (hashAt >= 0) {
        record.fragment = pctEncode(rest.slice(hashAt + 1), fragmentEncodeSet);
        rest = rest.slice(0, hashAt);
    }
    // query
    const queryAt = rest.indexOf('?');
    if (queryAt >= 0) {
        const raw = rest.slice(queryAt + 1);
        record.query = pctEncode(raw, special ? specialQueryEncodeSet : queryEncodeSet);
        rest = rest.slice(0, queryAt);
    }
    if (!hasAuthority) {
        // 不透明路径
        record.path = pctEncode(rest, isC0Control);
        return record;
    }
    const segments = [];
    const pieces = rest.split('/');
    for (let i = 1; i < pieces.length; i += 1) {
        segments.push(pctEncode(pieces[i], pathEncodeSet));
    }
    if (segments.length === 0) {
        segments.push('');
    }
    record.path = normalizePathSegments(segments, true);
    return record;
}
/** 把相对引用先拼成绝对串，再走绝对解析（与规范的 state 展开等价，只是写法更直白）。 */
function resolveRelative(input, base) {
    if (typeof base.path === 'string') {
        return null;
    }
    const authority = base.host === null ? null : '//' + authorityOf(base);
    if (authority === null) {
        return null;
    }
    const basePath = pathTextOf(base);
    if (input.slice(0, 2) === '//') {
        return base.scheme + ':' + input;
    }
    if (input.charAt(0) === '/') {
        return base.scheme + ':' + authority + input;
    }
    if (input.charAt(0) === '?') {
        return base.scheme + ':' + authority + basePath + input;
    }
    if (input.charAt(0) === '#') {
        return serializeRecord(base) + input;
    }
    if (input === '') {
        return base.scheme + ':' + authority + basePath + (base.query === null ? '' : '?' + base.query);
    }
    const cut = basePath.lastIndexOf('/');
    const merged = (cut < 0 ? '' : basePath.slice(0, cut + 1)) + input;
    return base.scheme + ':' + authority + merged;
}
function parseUrlRecord(input, base) {
    const trimmed = stripControls(input);
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed);
    if (hasScheme || base === undefined || base === null) {
        return parseAbsolute(trimmed, null);
    }
    const absolute = resolveRelative(trimmed, base);
    if (absolute === null) {
        return null;
    }
    return parseAbsolute(absolute, null);
}
// ------------------------------------------------------------------ URL 类
function isInvalid(record) {
    return record === null;
}
class URL {
    constructor(input, base) {
        const text = String(input);
        let baseRecord = null;
        if (base !== undefined && base !== null) {
            const baseText = base instanceof URL ? base.href : String(base);
            baseRecord = parseAbsolute(stripControls(baseText), null);
            if (isInvalid(baseRecord)) {
                throw new TypeError('Invalid base URL');
            }
        }
        const record = parseUrlRecord(text, baseRecord);
        if (record === null) {
            throw new TypeError('Invalid URL: ' + text);
        }
        this.record = record;
        this.searchParams = this.buildSearchParams();
    }
    buildSearchParams() {
        const self = this;
        const params = new url_search_params_1.URLSearchParams(this.record.query === null ? '' : this.record.query);
        Object.defineProperty(params, '__onjOnChange', {
            value: function () {
                self.applyParams();
            },
            writable: true,
            enumerable: false
        });
        return params;
    }
    /**
     * 把 searchParams 写回 query。只在参数**真的被改动**时调用。
     *
     * 两处不能想当然：
     *   - 不能用 URLSearchParams.toString()：那是表单序列化（空格 -> +），
     *     而 URL 的 query 用 URL 的 query 编码集（空格 -> %20）；
     *   - 没被改动过时必须保持 query 原样，否则 new URL('http://x/?b').search
     *     会从 '?b' 变成 '?b='。
     */
    applyParams() {
        const list = this.searchParams.list;
        if (list.length === 0) {
            this.record.query = null;
            return;
        }
        const set = isSpecialScheme(this.record.scheme) ? specialQueryEncodeSet : queryEncodeSet;
        const parts = [];
        for (let i = 0; i < list.length; i += 1) {
            parts.push(pctEncode(list[i][0], set) + '=' + pctEncode(list[i][1], set));
        }
        this.record.query = parts.join('&');
    }
    /** 不透明路径（没有 authority）时用字符串路径。 */
    isOpaque() {
        return typeof this.record.path === 'string';
    }
    get href() {
        return serializeRecord(this.record);
    }
    set href(value) {
        const record = parseAbsolute(stripControls(String(value)), null);
        if (record === null) {
            throw new TypeError('Invalid URL: ' + String(value));
        }
        this.record = record;
        this.searchParams = this.buildSearchParams();
    }
    get origin() {
        const scheme = this.record.scheme;
        if (scheme === 'ftp' || scheme === 'http' || scheme === 'https' || scheme === 'ws' || scheme === 'wss') {
            let out = scheme + '://' + (this.record.host === null ? '' : this.record.host);
            if (this.record.port !== null) {
                out += ':' + this.record.port;
            }
            return out;
        }
        return 'null';
    }
    get protocol() {
        return this.record.scheme + ':';
    }
    set protocol(value) {
        const match = /^([a-zA-Z][a-zA-Z0-9+\-.]*):?$/.exec(String(value));
        if (match === null) {
            return;
        }
        const next = match[1].toLowerCase();
        if (isSpecialScheme(next) !== isSpecialScheme(this.record.scheme)) {
            return;
        }
        if (this.record.port !== null && this.record.port === defaultPortOf(next)) {
            this.record.port = null;
        }
        this.record.scheme = next;
    }
    get username() {
        return this.record.username;
    }
    set username(value) {
        if (this.isOpaque() || this.record.host === null) {
            return;
        }
        this.record.username = pctEncode(String(value), userinfoEncodeSet);
    }
    get password() {
        return this.record.password;
    }
    set password(value) {
        if (this.isOpaque() || this.record.host === null) {
            return;
        }
        this.record.password = pctEncode(String(value), userinfoEncodeSet);
    }
    get host() {
        if (this.record.host === null) {
            return '';
        }
        return this.record.port === null ? this.record.host : this.record.host + ':' + this.record.port;
    }
    set host(value) {
        if (this.isOpaque()) {
            return;
        }
        const text = stripControls(String(value));
        const record = parseAbsolute('http://' + text + '/', null);
        if (record === null || record.host === null) {
            return;
        }
        this.record.host = record.host;
        this.record.port = record.port;
    }
    get hostname() {
        return this.record.host === null ? '' : this.record.host;
    }
    set hostname(value) {
        if (this.isOpaque()) {
            return;
        }
        const text = stripControls(String(value));
        const record = parseAbsolute('http://' + text + '/', null);
        if (record === null || record.host === null) {
            return;
        }
        this.record.host = record.host;
    }
    get port() {
        return this.record.port === null ? '' : String(this.record.port);
    }
    set port(value) {
        if (this.isOpaque()) {
            return;
        }
        const text = stripControls(String(value));
        if (text === '') {
            this.record.port = null;
            return;
        }
        const port = parsePort(text, this.record.scheme);
        if (port === undefined) {
            return;
        }
        this.record.port = port;
    }
    get pathname() {
        return pathTextOf(this.record);
    }
    set pathname(value) {
        if (this.isOpaque()) {
            return;
        }
        const text = stripControls(String(value));
        const pieces = text.split('/');
        const start = pieces.length > 0 && pieces[0] === '' ? 1 : 0;
        const segments = [];
        for (let i = start; i < pieces.length; i += 1) {
            segments.push(pctEncode(pieces[i], pathEncodeSet));
        }
        if (segments.length === 0) {
            segments.push('');
        }
        this.record.path = normalizePathSegments(segments, true);
    }
    get search() {
        // 注意：query 为 '' 时（"有 ? 但后面什么都没有"）search 是 ''，
        // 但 href 里仍保留那个 '?' —— 这两者不一致是 Node 的实际行为。
        return this.record.query === null || this.record.query === '' ? '' : '?' + this.record.query;
    }
    set search(value) {
        const text = stripControls(String(value));
        if (text === '' || text === '?') {
            this.record.query = null;
            this.searchParams = this.buildSearchParams();
            return;
        }
        const trimmed = text.charAt(0) === '?' ? text.slice(1) : text;
        const special = isSpecialScheme(this.record.scheme);
        this.record.query = pctEncode(trimmed, special ? specialQueryEncodeSet : queryEncodeSet);
        this.searchParams = this.buildSearchParams();
    }
    get hash() {
        return this.record.fragment === null || this.record.fragment === '' ? '' : '#' + this.record.fragment;
    }
    set hash(value) {
        const text = stripControls(String(value));
        if (text === '' || text === '#') {
            this.record.fragment = null;
            return;
        }
        const trimmed = text.charAt(0) === '#' ? text.slice(1) : text;
        this.record.fragment = pctEncode(trimmed, fragmentEncodeSet);
    }
    toString() {
        return this.href;
    }
    toJSON() {
        return this.href;
    }
    static canParse(input, base) {
        try {
            const url = base === undefined || base === null ? new URL(input) : new URL(input, base);
            return url.href.length > 0;
        }
        catch (failure) {
            return false;
        }
    }
    static parse(input, base) {
        try {
            return base === undefined || base === null ? new URL(input) : new URL(input, base);
        }
        catch (failure) {
            return null;
        }
    }
}
exports.URL = URL;
