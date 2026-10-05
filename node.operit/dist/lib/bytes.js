'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeBase64 = encodeBase64;
exports.decodeBase64 = decodeBase64;
exports.bytesToLatin1 = bytesToLatin1;
exports.latin1ToBytes = latin1ToBytes;
exports.utf8Encode = utf8Encode;
exports.utf8Decode = utf8Decode;
exports.getChannel = getChannel;
exports.setChannel = setChannel;
exports.encode = encode;
exports.decode = decode;
/**
 * 二进制通道的唯一开关，以及 UTF-8 编解码。
 *
 * 背景：Java bridge 的返回值经 toJsonCompatibleValue 转换，byte[] 会被逐元素展开成
 * JSON 数字数组（1MB 文件膨胀到 MB 级文本），因此二进制不走 byte[]，改用字符串通道：
 *
 *   base64  1.33x 体积，纯 ASCII，任何传输都安全 —— 默认
 *   latin1  1.00x 体积，依赖 JSON 字符串保持码点不变
 *
 * 换通道只改这里；fs 与 Buffer 都只调 encode() / decode()。
 * QuickJS 不保证有 TextEncoder / TextDecoder，因此 UTF-8 自行实现，非法序列按 U+FFFD 处理。
 */
const errors_1 = require("./errors");
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (function buildLookup() {
    const table = new Int16Array(128);
    for (let i = 0; i < table.length; i += 1) {
        table[i] = -1;
    }
    for (let j = 0; j < ALPHABET.length; j += 1) {
        table[ALPHABET.charCodeAt(j)] = j;
    }
    return table;
})();
const REPLACEMENT_CODE_POINT = 0xfffd;
const CHAR_EQUALS = 61;
function encodeBase64(bytes) {
    let out = '';
    const len = bytes.length;
    let i = 0;
    for (; i + 2 < len; i += 3) {
        const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
        out += ALPHABET[(triple >> 18) & 63] +
            ALPHABET[(triple >> 12) & 63] +
            ALPHABET[(triple >> 6) & 63] +
            ALPHABET[triple & 63];
    }
    const rest = len - i;
    if (rest === 1) {
        const single = bytes[i] << 16;
        out += ALPHABET[(single >> 18) & 63] + ALPHABET[(single >> 12) & 63] + '==';
    }
    else if (rest === 2) {
        const pair = (bytes[i] << 16) | (bytes[i + 1] << 8);
        out += ALPHABET[(pair >> 18) & 63] +
            ALPHABET[(pair >> 12) & 63] +
            ALPHABET[(pair >> 6) & 63] + '=';
    }
    return out;
}
/**
 * 按 Node 的容错规则解码 base64：
 *   - 字母表以外的 ASCII 字符（空白、'!' 等）跳过
 *   - 遇到 '=' 或任何码点 > 0x7f 的字符立即停止
 * 于是 'aGVsbG8=' 与 'aGVs bG8=!' 同结果，而 'a=b' 与 '🚀 emoji' 都是空。
 * 对规范 base64 输入（本库自己的编码器产物）结果与严格解码完全一致。
 */
function decodeBase64(text) {
    const source = String(text);
    let count = 0;
    for (let i = 0; i < source.length; i += 1) {
        const code = source.charCodeAt(i);
        if (code === CHAR_EQUALS || code > 0x7f) {
            break;
        }
        if (LOOKUP[code] >= 0) {
            count += 1;
        }
    }
    const remainder = count & 3;
    let outLength = (count >> 2) * 3;
    if (remainder === 2) {
        outLength += 1;
    }
    else if (remainder === 3) {
        outLength += 2;
    }
    const out = new Uint8Array(outLength);
    let accumulator = 0;
    let inWindow = 0;
    let produced = 0;
    let o = 0;
    for (let i = 0; i < source.length && produced < count; i += 1) {
        const code = source.charCodeAt(i);
        if (code === CHAR_EQUALS || code > 0x7f) {
            break;
        }
        const value = LOOKUP[code];
        if (value < 0) {
            continue;
        }
        accumulator = (accumulator << 6) | value;
        inWindow += 1;
        produced += 1;
        if (inWindow === 4) {
            out[o] = (accumulator >> 16) & 255;
            out[o + 1] = (accumulator >> 8) & 255;
            out[o + 2] = accumulator & 255;
            o += 3;
            accumulator = 0;
            inWindow = 0;
        }
    }
    if (inWindow === 2) {
        out[o] = (accumulator >> 4) & 255;
    }
    else if (inWindow === 3) {
        out[o] = (accumulator >> 10) & 255;
        out[o + 1] = (accumulator >> 2) & 255;
    }
    return out;
}
function bytesToLatin1(bytes) {
    const parts = [];
    const CHUNK = 4096;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, bytes.length);
        const chunk = new Array(end - i);
        for (let j = i; j < end; j += 1) {
            chunk[j - i] = bytes[j];
        }
        parts.push(String.fromCharCode.apply(null, chunk));
    }
    return parts.join('');
}
function latin1ToBytes(text) {
    const source = String(text);
    const out = new Uint8Array(source.length);
    for (let i = 0; i < source.length; i += 1) {
        out[i] = source.charCodeAt(i) & 255;
    }
    return out;
}
function utf8Encode(text) {
    const source = String(text);
    const out = [];
    for (let i = 0; i < source.length; i += 1) {
        const code = source.charCodeAt(i);
        if (code < 0x80) {
            out.push(code);
        }
        else if (code < 0x800) {
            out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
        }
        else if (code >= 0xd800 && code <= 0xdbff) {
            const low = i + 1 < source.length ? source.charCodeAt(i + 1) : 0;
            if (low >= 0xdc00 && low <= 0xdfff) {
                i += 1;
                const codePoint = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                out.push(0xf0 | (codePoint >> 18), 0x80 | ((codePoint >> 12) & 63), 0x80 | ((codePoint >> 6) & 63), 0x80 | (codePoint & 63));
            }
            else {
                out.push(0xef, 0xbf, 0xbd);
            }
        }
        else if (code >= 0xdc00 && code <= 0xdfff) {
            out.push(0xef, 0xbf, 0xbd);
        }
        else {
            out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
        }
    }
    return new Uint8Array(out);
}
function utf8Decode(bytes) {
    let out = '';
    let i = 0;
    const len = bytes.length;
    while (i < len) {
        const b0 = bytes[i];
        if (b0 < 0x80) {
            out += String.fromCharCode(b0);
            i += 1;
            continue;
        }
        if (b0 >= 0xc2 && b0 <= 0xdf && i + 1 < len && (bytes[i + 1] & 0xc0) === 0x80) {
            out += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[i + 1] & 63));
            i += 2;
            continue;
        }
        if (b0 >= 0xe0 && b0 <= 0xef && i + 2 < len &&
            (bytes[i + 1] & 0xc0) === 0x80 && (bytes[i + 2] & 0xc0) === 0x80) {
            const cp3 = ((b0 & 0x0f) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
            if (cp3 >= 0x800 && !(cp3 >= 0xd800 && cp3 <= 0xdfff)) {
                out += String.fromCharCode(cp3);
                i += 3;
                continue;
            }
        }
        if (b0 >= 0xf0 && b0 <= 0xf4 && i + 3 < len &&
            (bytes[i + 1] & 0xc0) === 0x80 &&
            (bytes[i + 2] & 0xc0) === 0x80 &&
            (bytes[i + 3] & 0xc0) === 0x80) {
            const cp4 = ((b0 & 0x07) << 18) |
                ((bytes[i + 1] & 63) << 12) |
                ((bytes[i + 2] & 63) << 6) |
                (bytes[i + 3] & 63);
            if (cp4 >= 0x10000 && cp4 <= 0x10ffff) {
                const offset = cp4 - 0x10000;
                out += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
                i += 4;
                continue;
            }
        }
        out += String.fromCharCode(REPLACEMENT_CODE_POINT);
        i += 1;
    }
    return out;
}
let channel = 'base64';
function getChannel() {
    return channel;
}
function setChannel(name) {
    if (name !== 'base64' && name !== 'latin1') {
        throw (0, errors_1.onjError)('ONJ_BRIDGE_PROTOCOL', '未知的二进制通道: ' + String(name));
    }
    channel = name;
}
/** 按当前通道把字节编码成可穿过 bridge 的字符串。 */
function encode(bytes) {
    return channel === 'base64' ? encodeBase64(bytes) : bytesToLatin1(bytes);
}
/** 按当前通道把 bridge 返回的字符串还原成字节。 */
function decode(text) {
    return channel === 'base64' ? decodeBase64(text) : latin1ToBytes(text);
}
