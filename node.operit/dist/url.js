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
 * Node url 模块的移植。
 *
 * 本轮覆盖：
 *   - URLSearchParams（完整）
 *   - 旧版 parse / format / resolve
 *   - pathToFileURL / fileURLToPath
 *   - domainToASCII / domainToUnicode
 *
 * **未覆盖：WHATWG 的 URL 类与 urlToHttpOptions**（见 BUILTINS.json 的说明）。
 * 那是一个完整的 RFC 3986 状态机，单独一轮做；在它到位之前，
 * 需要 `new URL(...)` 的代码应当直接用旧版 parse 或自行拼接。
 *
 * 旧版 parse 有几条反直觉的规则，都是实测 Node 得出来的，实现里都注明了：
 *   - 按「协议是不是 slashed 协议」分派：http:example.com 不当主机，a:b 当主机；
 *   - file: 输出 href 时无条件带 '//'（file:host -> file://host），其它 slashed 协议要有主机才带；
 *   - parse(..., true) 在没有查询串时给的是空对象（无原型），不是 null。
 *
 * 平台：本库面向 Android，pathToFileURL / fileURLToPath 实现的是 **POSIX** 规则
 * （与 Node 在 Linux 上的行为一致）。Node 在 Windows 上会给出 C:\ 风格的结果，
 * 那是平台差异，不是分歧。
 */
const punycode = __importStar(require("./lib/punycode"));
const url_search_params_1 = require("./lib/url-search-params");
const url_whatwg_1 = require("./lib/url-whatwg");
const bytes_1 = require("./lib/bytes");
// ------------------------------------------------------------------ 旧版 parse
/** Node 的 autoEscape：把不在保留集里的字符按 UTF-8 百分号编码。 */
const URL_SAFE = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/?#[\]%]$/;
/**
 * Node 旧版解析按"协议是不是 slashed 协议"分派：
 *   - slashed 协议（http/https/...）后面没有 // 就**不当主机**（http:example.com 的 pathname 是 example.com）；
 *   - 其它协议（a:b、mailto:...）后面整段当主机解析。
 * 补 '/' 的默认 pathname 也只对 slashed 协议生效。
 */
function isSlashedProtocol(protocol) {
    if (protocol === null) {
        return false;
    }
    const bare = protocol.charAt(protocol.length - 1) === ':'
        ? protocol.slice(0, protocol.length - 1)
        : protocol;
    return SLASHED_PROTOCOLS.has(bare);
}
function autoEscape(value) {
    let out = '';
    for (let i = 0; i < value.length; i += 1) {
        const character = value.charAt(i);
        if (URL_SAFE.test(character)) {
            out += character;
        }
        else {
            const bytes = (0, bytes_1.utf8Encode)(character);
            for (let j = 0; j < bytes.length; j += 1) {
                out += (0, url_search_params_1.hexByte)(bytes[j]);
            }
        }
    }
    return out;
}
function splitHostPort(hostPart) {
    if (hostPart.charAt(0) === '[') {
        const close = hostPart.indexOf(']');
        if (close >= 0) {
            const inside = hostPart.slice(1, close);
            const after = hostPart.slice(close + 1);
            if (after.charAt(0) === ':') {
                const port = after.slice(1);
                return { hostname: inside, port: port === '' ? null : port, isIPv6: true };
            }
            return { hostname: inside, port: null, isIPv6: true };
        }
    }
    const colon = hostPart.lastIndexOf(':');
    if (colon < 0) {
        return { hostname: hostPart, port: null, isIPv6: false };
    }
    const port = hostPart.slice(colon + 1);
    // 空端口（http://host:/x）要丢掉，与 Node 一致
    return { hostname: hostPart.slice(0, colon), port: port === '' ? null : port, isIPv6: false };
}
function parseUrl(input, parseQueryString, slashesDenoteHost) {
    const result = {
        protocol: null,
        slashes: null,
        auth: null,
        host: null,
        port: null,
        hostname: null,
        hash: null,
        search: null,
        query: null,
        pathname: null,
        path: null,
        href: ''
    };
    const slashesHost = slashesDenoteHost === true;
    let rest = input;
    const protocolMatch = /^([a-z0-9.+-]+:)/i.exec(rest);
    if (protocolMatch !== null) {
        result.protocol = protocolMatch[1].toLowerCase();
        rest = rest.slice(protocolMatch[1].length);
    }
    let hasHost = false;
    if (rest.slice(0, 2) === '//' && (result.protocol !== null || slashesHost)) {
        result.slashes = true;
        rest = rest.slice(2);
        hasHost = true;
    }
    else if (result.protocol !== null && !isSlashedProtocol(result.protocol)) {
        // 非 slashed 协议即使没有 // 也按主机解析：a:b 的 host 是 'b'，
        // mailto:someone@example.com 的 host 是 'example.com'（auth 是 someone）
        hasHost = true;
    }
    if (hasHost) {
        let end = rest.length;
        for (let i = 0; i < rest.length; i += 1) {
            const character = rest.charAt(i);
            if (character === '/' || character === '?' || character === '#') {
                end = i;
                break;
            }
        }
        let hostPart = rest.slice(0, end);
        rest = rest.slice(end);
        const at = hostPart.lastIndexOf('@');
        if (at >= 0) {
            result.auth = safeDecode(hostPart.slice(0, at));
            hostPart = hostPart.slice(at + 1);
        }
        hostPart = hostPart.toLowerCase();
        const split = splitHostPort(hostPart);
        const asciiHostname = split.hostname === '' ? '' : punycode.toASCII(split.hostname);
        result.hostname = asciiHostname;
        result.port = split.port;
        // host 是「主机 + 非空端口」；IPv6 要带回方括号
        const display = split.isIPv6 ? '[' + asciiHostname + ']' : asciiHostname;
        result.host = split.port === null ? display : display + ':' + split.port;
    }
    // 拆 hash
    const hashAt = rest.indexOf('#');
    if (hashAt >= 0) {
        // hash 也要转义（Node 会用 autoEscape 处理片段）
        result.hash = '#' + autoEscape(rest.slice(hashAt + 1));
        rest = rest.slice(0, hashAt);
    }
    // 拆 search
    const searchAt = rest.indexOf('?');
    if (searchAt >= 0) {
        result.search = '?' + autoEscape(rest.slice(searchAt + 1));
        rest = rest.slice(0, searchAt);
    }
    if (rest !== '') {
        result.pathname = autoEscape(rest);
    }
    else if (hasHost && result.host !== '' && isSlashedProtocol(result.protocol)) {
        // 补 '/' 需要：主机非空、且协议是 slashed 协议。
        // 所以 http:// 的 pathname 是 null，foo://bar 的也是 null。
        result.pathname = '/';
    }
    result.path = result.pathname === null && result.search === null
        ? null
        : (result.pathname === null ? '' : result.pathname) + (result.search === null ? '' : result.search);
    if (parseQueryString === true) {
        // 即使没有查询串，Node 也会给一个空的（无原型）对象，而不是 null
        result.query = buildQueryObject(result.search === null ? '' : result.search.slice(1));
    }
    else {
        result.query = result.search === null ? null : result.search.slice(1);
    }
    result.href = buildHref(result);
    return result;
}
function safeDecode(value) {
    try {
        return decodeURIComponent(value);
    }
    catch (failure) {
        return value;
    }
}
function buildQueryObject(search) {
    const object = Object.create(null);
    const params = new url_search_params_1.URLSearchParams(search);
    for (const pair of params.entries()) {
        const existing = object[pair[0]];
        if (existing === undefined) {
            object[pair[0]] = pair[1];
        }
        else if (Array.isArray(existing)) {
            existing.push(pair[1]);
        }
        else {
            object[pair[0]] = [existing, pair[1]];
        }
    }
    return object;
}
/**
 * 是否输出 '//'。实测 Node 的规则：
 *   - slashes 为真 -> 输出；
 *   - file: 协议**无条件**输出（url.format({protocol:'file:',pathname:'host'}) 得到 file://host）；
 *   - 其它 slashed 协议要有主机才输出（http:example.com 不带 //，http://h 带）；
 *   - 没有协议时不输出（{hostname:'h',pathname:'/p'} 得到 h/p）。
 */
function shouldUseSlashes(protocol, slashes, hasHost) {
    if (slashes === true) {
        return true;
    }
    if (protocol === null || protocol === '') {
        return false;
    }
    const bare = protocol.charAt(protocol.length - 1) === ':'
        ? protocol.slice(0, protocol.length - 1)
        : protocol;
    if (bare === 'file') {
        return true;
    }
    return SLASHED_PROTOCOLS.has(bare) && hasHost;
}
function buildHref(parsed) {
    let out = parsed.protocol === null ? '' : parsed.protocol;
    if (shouldUseSlashes(parsed.protocol, parsed.slashes, parsed.host !== null && parsed.host !== '')) {
        out += '//';
    }
    if (parsed.auth !== null && parsed.auth !== '') {
        out += parsed.auth + '@';
    }
    if (parsed.host !== null) {
        out += parsed.host;
    }
    if (parsed.path !== null) {
        out += parsed.path;
    }
    if (parsed.hash !== null) {
        out += parsed.hash;
    }
    return out;
}
// ------------------------------------------------------------------ format / resolve
const SLASHED_PROTOCOLS = new Set(['http', 'https', 'ftp', 'gopher', 'file', 'ws', 'wss']);
function stringifyQuery(query) {
    const parts = [];
    const keys = Object.keys(query);
    for (let i = 0; i < keys.length; i += 1) {
        const value = query[keys[i]];
        if (Array.isArray(value)) {
            for (let j = 0; j < value.length; j += 1) {
                parts.push((0, url_search_params_1.formSerialize)(keys[i]) + '=' + (0, url_search_params_1.formSerialize)(String(value[j])));
            }
        }
        else {
            parts.push((0, url_search_params_1.formSerialize)(keys[i]) + '=' + (0, url_search_params_1.formSerialize)(String(value)));
        }
    }
    return parts.join('&');
}
function formatUrl(source) {
    const object = (source === undefined || source === null ? {} : source);
    let auth = object.auth === undefined || object.auth === null ? '' : String(object.auth);
    if (auth !== '') {
        // Node：auth 里的 ':' 保留，其余按组件编码
        auth = autoEscape(auth).replace(/%3A/gi, ':') + '@';
    }
    let protocol = object.protocol === undefined || object.protocol === null ? '' : String(object.protocol);
    const pathname = object.pathname === undefined || object.pathname === null ? '' : String(object.pathname);
    let hash = object.hash === undefined || object.hash === null ? '' : String(object.hash);
    let host = false;
    if (object.host !== undefined && object.host !== null && String(object.host) !== '') {
        host = auth + String(object.host);
    }
    else if (object.hostname !== undefined && object.hostname !== null && String(object.hostname) !== '') {
        const hostname = String(object.hostname);
        const bracketed = hostname.indexOf(':') >= 0 && hostname.charAt(0) !== '[' ? '[' + hostname + ']' : hostname;
        host = auth + bracketed;
        if (object.port !== undefined && object.port !== null && String(object.port) !== '') {
            host += ':' + String(object.port);
        }
    }
    let search = object.search === undefined || object.search === null ? '' : String(object.search);
    if (search === '' && object.query !== null && object.query !== undefined && typeof object.query === 'object') {
        const serialized = stringifyQuery(object.query);
        search = serialized === '' ? '' : '?' + serialized;
    }
    if (protocol !== '' && protocol.charAt(protocol.length - 1) !== ':') {
        protocol += ':';
    }
    const bare = protocol.slice(0, protocol.length - 1);
    let outHost = host === false ? '' : host;
    if (shouldUseSlashes(bare === '' ? null : bare, object.slashes === true ? true : null, host !== false)) {
        outHost = '//' + outHost;
    }
    if (hash !== '' && hash.charAt(0) !== '#') {
        hash = '#' + hash;
    }
    if (search !== '' && search.charAt(0) !== '?') {
        search = '?' + search;
    }
    return protocol + outHost + pathname + search + hash;
}
/** 旧版解析出来的 path 段（用于 resolve 的路径合并）。 */
function resolvePath(fromPathname, toPathname) {
    if (toPathname === '') {
        return fromPathname;
    }
    if (toPathname.charAt(0) === '/') {
        return toPathname;
    }
    const base = fromPathname.slice(0, fromPathname.lastIndexOf('/') + 1);
    const joined = base + toPathname;
    const segments = joined.split('/');
    const out = [];
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === '.') {
            continue;
        }
        if (segment === '..') {
            if (out.length > 1) {
                out.pop();
            }
            continue;
        }
        out.push(segment);
    }
    return out.join('/');
}
function resolveUrl(from, to) {
    const toText = String(to);
    // '//host/path' 是协议相对引用：要按主机解析，再继承 base 的协议
    const target = parseUrl(toText, false, toText.slice(0, 2) === '//');
    const base = parseUrl(String(from));
    if (target.protocol !== null || target.host !== null) {
        const replacement = {
            protocol: target.protocol === null ? base.protocol : target.protocol,
            slashes: target.slashes,
            auth: target.auth,
            host: target.host,
            port: target.port,
            hostname: target.hostname,
            hash: target.hash,
            search: target.search,
            query: target.query,
            pathname: target.pathname,
            path: null,
            href: ''
        };
        if (replacement.pathname === null && replacement.host !== null && replacement.host !== '') {
            replacement.pathname = '/';
        }
        replacement.path = (replacement.pathname === null ? '' : replacement.pathname) +
            (replacement.search === null ? '' : replacement.search);
        replacement.href = buildHref(replacement);
        return replacement.href;
    }
    const merged = {
        protocol: base.protocol,
        slashes: base.slashes,
        auth: base.auth,
        host: base.host,
        port: base.port,
        hostname: base.hostname,
        hash: target.hash,
        search: target.search,
        query: target.query,
        pathname: target.pathname,
        path: null,
        href: ''
    };
    if (merged.pathname === null) {
        merged.pathname = base.pathname;
        if (merged.search === null) {
            merged.search = base.search;
            merged.query = base.query;
        }
    }
    else {
        merged.pathname = resolvePath(base.pathname === null ? '' : base.pathname, merged.pathname);
    }
    merged.path = (merged.pathname === null ? '' : merged.pathname) + (merged.search === null ? '' : merged.search);
    if (merged.path === '' && merged.host !== null) {
        merged.path = '/';
    }
    merged.href = buildHref(merged);
    return merged.href;
}
// ------------------------------------------------------------------ file URL
function pathToFileURL(filepath) {
    const target = String(filepath);
    const absolute = target.charAt(0) === '/';
    const normalized = absolute ? target : '/' + target;
    const encoded = normalized.split('/').map(function (segment) {
        return encodeURIComponent(segment).replace(/%2F/gi, '/');
    }).join('/');
    return new url_whatwg_1.URL('file://' + encoded);
}
/**
 * 把 URL 实例转成 http.request 的选项对象。
 * 语义照 Node：IPv6 主机去掉方括号、path 是 pathname + search、auth 从 username/password 还原。
 */
function urlToHttpOptions(url) {
    const instance = url;
    const username = instance.username;
    const password = instance.password;
    const hostname = instance.hostname;
    const pathname = instance.pathname;
    const options = {
        protocol: instance.protocol,
        hostname: hostname.charAt(0) === '[' ? hostname.slice(1, hostname.length - 1) : hostname,
        hash: instance.hash,
        search: instance.search,
        pathname: pathname,
        path: pathname + instance.search,
        href: instance.href,
        port: instance.port === '' ? undefined : Number(instance.port),
        // 注意：Node 的 urlToHttpOptions **不包含** host 字段（虽然它内部有 url.host 可用）
        auth: username !== '' || password !== '' ? decodeURIComponent(username) + ':' + decodeURIComponent(password) : undefined
    };
    return options;
}
function fileURLToPath(path) {
    const source = typeof path === 'string' ? path : String(path.href);
    const withoutScheme = source.slice('file://'.length);
    const slash = withoutScheme.indexOf('/');
    const host = slash < 0 ? withoutScheme : withoutScheme.slice(0, slash);
    if (host !== '' && host !== 'localhost') {
        throw new Error('File URL host must be "localhost" or empty on the current platform');
    }
    const pathPart = slash < 0 ? '' : withoutScheme.slice(slash);
    return decodeURIComponent(pathPart);
}
// ------------------------------------------------------------------ 域名转换
function domainToASCII(domain) {
    return punycode.toASCII(String(domain).toLowerCase());
}
function domainToUnicode(domain) {
    return punycode.toUnicode(String(domain));
}
// ------------------------------------------------------------------ 导出
const urlModule = {
    URLSearchParams: url_search_params_1.URLSearchParams,
    parse: parseUrl,
    format: formatUrl,
    resolve: resolveUrl,
    pathToFileURL: pathToFileURL,
    fileURLToPath: fileURLToPath,
    domainToASCII: domainToASCII,
    domainToUnicode: domainToUnicode,
    URL: url_whatwg_1.URL,
    urlToHttpOptions: urlToHttpOptions
};
module.exports = urlModule;
