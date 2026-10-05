'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.encode = encode;
exports.decode = decode;
exports.toASCII = toASCII;
exports.toUnicode = toUnicode;
/**
 * RFC 3492（Punycode）编解码。
 *
 * url.parse 会把非 ASCII 主机名转成 xn-- 形式（Node 用 domainToASCII），
 * 所以这里是 url 模块的前置件。
 *
 * 范围说明：只做 punycode 本体，不做 UTS-46 / IDNA2008 的那套映射
 * （大小写折叠、NFKC 归一化、禁用字符检查）。对常见域名足够；
 * `faß.de` 这类需要 UTS-46 特殊处理的域名结果可能与 Node 不同，见 BUILTINS.json。
 */
const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
function adapt(delta, numPoints, firstTime) {
    let value = firstTime ? Math.floor(delta / DAMP) : delta >> 1;
    value += Math.floor(value / numPoints);
    let k = 0;
    while (value > ((BASE - TMIN) * TMAX) >> 1) {
        value = Math.floor(value / (BASE - TMIN));
        k += BASE;
    }
    return k + Math.floor(((BASE - TMIN + 1) * value) / (value + SKEW));
}
function encodeDigit(value) {
    // 0-25 -> a-z, 26-35 -> 0-9
    return value < 26 ? String.fromCharCode(97 + value) : String.fromCharCode(22 + value);
}
function decodeDigit(code) {
    if (code >= 48 && code <= 57) {
        return code - 22;
    }
    if (code >= 65 && code <= 90) {
        return code - 65;
    }
    if (code >= 97 && code <= 122) {
        return code - 97;
    }
    return BASE;
}
/** 把一段 Unicode 字符串编成 punycode（不含 xn-- 前缀）。 */
function encode(input) {
    const codePoints = [];
    for (const character of input) {
        codePoints.push(character.codePointAt(0));
    }
    const output = [];
    let n = INITIAL_N;
    let delta = 0;
    let bias = INITIAL_BIAS;
    for (let i = 0; i < codePoints.length; i += 1) {
        if (codePoints[i] < 0x80) {
            output.push(String.fromCharCode(codePoints[i]));
        }
    }
    const basicLength = output.length;
    let handled = basicLength;
    if (basicLength > 0) {
        output.push('-');
    }
    while (handled < codePoints.length) {
        let next = Number.MAX_SAFE_INTEGER;
        for (let i = 0; i < codePoints.length; i += 1) {
            if (codePoints[i] >= n && codePoints[i] < next) {
                next = codePoints[i];
            }
        }
        delta += (next - n) * (handled + 1);
        n = next;
        for (let i = 0; i < codePoints.length; i += 1) {
            if (codePoints[i] < n) {
                delta += 1;
            }
            if (codePoints[i] === n) {
                let q = delta;
                for (let k = BASE;; k += BASE) {
                    const threshold = k <= bias ? TMIN : (k >= bias + TMAX ? TMAX : k - bias);
                    if (q < threshold) {
                        break;
                    }
                    output.push(encodeDigit(threshold + ((q - threshold) % (BASE - threshold))));
                    q = Math.floor((q - threshold) / (BASE - threshold));
                }
                output.push(encodeDigit(q));
                bias = adapt(delta, handled + 1, handled === basicLength);
                delta = 0;
                handled += 1;
            }
        }
        delta += 1;
        n += 1;
    }
    return output.join('');
}
/** 把 punycode（不含 xn-- 前缀）解回 Unicode 字符串。非法输入抛错。 */
function decode(input) {
    const output = [];
    let n = INITIAL_N;
    let index = 0;
    let bias = INITIAL_BIAS;
    let basic = input.lastIndexOf('-');
    if (basic < 0) {
        basic = 0;
    }
    for (let i = 0; i < basic; i += 1) {
        if (input.charCodeAt(i) >= 0x80) {
            throw new Error('Invalid input: non-basic code point in the basic segment');
        }
        output.push(input.charCodeAt(i));
    }
    let cursor = basic > 0 ? basic + 1 : 0;
    while (cursor < input.length) {
        const oldIndex = index;
        let weight = 1;
        for (let k = BASE;; k += BASE) {
            if (cursor >= input.length) {
                throw new Error('Invalid input: truncated punycode');
            }
            const digit = decodeDigit(input.charCodeAt(cursor));
            cursor += 1;
            if (digit >= BASE) {
                throw new Error('Invalid input: bad digit');
            }
            index += digit * weight;
            const threshold = k <= bias ? TMIN : (k >= bias + TMAX ? TMAX : k - bias);
            if (digit < threshold) {
                break;
            }
            weight *= BASE - threshold;
        }
        const length = output.length + 1;
        bias = adapt(index - oldIndex, length, oldIndex === 0);
        n += Math.floor(index / length);
        index %= length;
        output.splice(index, 0, n);
        index += 1;
    }
    let out = '';
    for (let i = 0; i < output.length; i += 1) {
        out += String.fromCodePoint(output[i]);
    }
    return out;
}
/** 域名 -> ASCII（xn--）。纯 ASCII 输入原样返回（已小写化由调用方负责）。 */
function toASCII(domain) {
    return domain.split('.').map(function (label) {
        let ascii = true;
        for (let i = 0; i < label.length; i += 1) {
            if (label.charCodeAt(i) >= 0x80) {
                ascii = false;
                break;
            }
        }
        return ascii ? label : 'xn--' + encode(label.toLowerCase());
    }).join('.');
}
/** 域名 -> Unicode。xn-- 标签解回 Unicode，其余原样。 */
function toUnicode(domain) {
    return domain.split('.').map(function (label) {
        if (label.length > 4 && label.slice(0, 4).toLowerCase() === 'xn--') {
            try {
                return decode(label.slice(4));
            }
            catch (failure) {
                return label;
            }
        }
        return label;
    }).join('.');
}
