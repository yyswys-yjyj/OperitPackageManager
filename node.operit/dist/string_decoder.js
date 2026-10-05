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
exports.StringDecoder = void 0;
/**
 * Node string_decoder 模块的移植。
 *
 * 三种编码的缓冲语义（照 Node 实测行为）：
 *   utf8     末尾不完整的字符缓起来；end() 只吐**一个** U+FFFD，不按字节数吐
 *   utf16le  末尾悬空的单字节缓起来；end() 直接丢弃（不吐替换字符）
 *   base64   缓冲的是**输入字节**：每 3 字节输出 4 个 base64 字符，end() 用带 padding 的形式收尾
 *   hex/ascii/latin1  无缓冲
 */
const bytesCodec = __importStar(require("./lib/bytes"));
function normalizeEncoding(encoding) {
    const value = typeof encoding === 'string' ? encoding.toLowerCase() : 'utf8';
    if (value === 'utf-8') {
        return 'utf8';
    }
    if (value === 'binary') {
        return 'latin1';
    }
    if (value === 'ucs2' || value === 'ucs-2' || value === 'utf-16le') {
        return 'utf16le';
    }
    if (value === 'utf8' || value === 'utf16le' || value === 'latin1' || value === 'ascii' || value === 'base64' || value === 'hex') {
        return value;
    }
    throw new TypeError('Unknown encoding: ' + String(encoding));
}
/** UTF-8 序列首字节应有的总长度；非法首字节按 1 处理（交给解码器吐替换字符）。 */
function utf8SequenceLength(byte) {
    if (byte < 0x80) {
        return 1;
    }
    if (byte >= 0xc2 && byte <= 0xdf) {
        return 2;
    }
    if (byte >= 0xe0 && byte <= 0xef) {
        return 3;
    }
    if (byte >= 0xf0 && byte <= 0xf4) {
        return 4;
    }
    return 1;
}
/** 返回 bytes 中最长的、以完整字符结尾的前缀长度。 */
function completePrefixLength(bytes) {
    let index = bytes.length;
    let lookback = 0;
    while (index > 0 && lookback < 4) {
        index -= 1;
        lookback += 1;
        const byte = bytes[index];
        if (byte < 0x80) {
            return bytes.length;
        }
        if (byte >= 0xc0) {
            return index + utf8SequenceLength(byte) > bytes.length ? index : bytes.length;
        }
    }
    return bytes.length;
}
class StringDecoder {
    constructor(encoding) {
        this.encoding = normalizeEncoding(encoding);
        this.pending = new Uint8Array(0);
    }
    get lastNeed() {
        if (this.pending.length === 0) {
            return 0;
        }
        if (this.encoding === 'utf8') {
            return utf8SequenceLength(this.pending[0]) - this.pending.length;
        }
        if (this.encoding === 'utf16le') {
            return 1;
        }
        if (this.encoding === 'base64') {
            return 3 - this.pending.length;
        }
        return 0;
    }
    get lastTotal() {
        if (this.pending.length === 0) {
            return 0;
        }
        if (this.encoding === 'utf8') {
            return utf8SequenceLength(this.pending[0]);
        }
        if (this.encoding === 'utf16le') {
            return 2;
        }
        if (this.encoding === 'base64') {
            return 3;
        }
        return 0;
    }
    get lastChar() {
        return this.pending;
    }
    write(buffer) {
        if (!(buffer instanceof Uint8Array)) {
            throw new TypeError('The "buf" argument must be an instance of Buffer or Uint8Array.');
        }
        if (this.encoding === 'utf8') {
            return this.writeUtf8(buffer);
        }
        if (this.encoding === 'utf16le') {
            return this.writeUtf16(buffer);
        }
        if (this.encoding === 'base64') {
            return this.writeBase64(buffer);
        }
        if (this.encoding === 'hex') {
            return hexOf(buffer);
        }
        if (this.encoding === 'ascii') {
            return asciiOf(buffer);
        }
        return bytesCodec.bytesToLatin1(buffer);
    }
    end(buffer) {
        let text = '';
        if (buffer !== undefined && buffer.length > 0) {
            text = this.write(buffer);
        }
        if (this.pending.length === 0) {
            return text;
        }
        const pending = this.pending;
        this.pending = new Uint8Array(0);
        if (this.encoding === 'utf8') {
            return text + '�';
        }
        if (this.encoding === 'base64') {
            return text + bytesCodec.encodeBase64(pending);
        }
        // utf16le 的悬空半字符与 hex/ascii/latin1 一样没有残留，直接结束
        return text;
    }
    combine(buffer) {
        if (this.pending.length === 0) {
            return buffer;
        }
        const merged = new Uint8Array(this.pending.length + buffer.length);
        merged.set(this.pending);
        merged.set(buffer, this.pending.length);
        this.pending = new Uint8Array(0);
        return merged;
    }
    writeUtf8(buffer) {
        const merged = this.combine(buffer);
        const complete = completePrefixLength(merged);
        if (complete < merged.length) {
            const rest = merged.subarray(complete);
            this.pending = new Uint8Array(rest.length);
            this.pending.set(rest);
        }
        return bytesCodec.utf8Decode(merged.subarray(0, complete));
    }
    writeUtf16(buffer) {
        const merged = this.combine(buffer);
        let usable = merged.length;
        if (usable % 2 === 1) {
            usable -= 1;
            this.pending = new Uint8Array([merged[merged.length - 1]]);
        }
        return decodeUtf16Pairs(merged.subarray(0, usable));
    }
    writeBase64(buffer) {
        const merged = this.combine(buffer);
        const usable = merged.length - (merged.length % 3);
        if (usable < merged.length) {
            const rest = merged.subarray(usable);
            this.pending = new Uint8Array(rest.length);
            this.pending.set(rest);
        }
        return bytesCodec.encodeBase64(merged.subarray(0, usable));
    }
}
exports.StringDecoder = StringDecoder;
StringDecoder.StringDecoder = StringDecoder;
function hexOf(buffer) {
    const digits = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < buffer.length; i += 1) {
        out += digits.charAt(buffer[i] >> 4) + digits.charAt(buffer[i] & 15);
    }
    return out;
}
function decodeUtf16Pairs(buffer) {
    let out = '';
    for (let i = 0; i + 1 < buffer.length; i += 2) {
        out += String.fromCharCode(buffer[i] | (buffer[i + 1] << 8));
    }
    return out;
}
function asciiOf(buffer) {
    let out = '';
    for (let i = 0; i < buffer.length; i += 1) {
        out += String.fromCharCode(buffer[i] & 0x7f);
    }
    return out;
}
