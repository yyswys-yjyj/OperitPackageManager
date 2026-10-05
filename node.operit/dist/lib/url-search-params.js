'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.URLSearchParams = void 0;
exports.hexByte = hexByte;
exports.formSerialize = formSerialize;
exports.formParse = formParse;
/**
 * URLSearchParams（application/x-www-form-urlencoded 的 WHATWG 实现）。
 *
 * 从 url.ts 抽出来单独成文件，是为了让 lib/url-whatwg.ts 也能用它而不产生循环依赖：
 *   url.ts          -> lib/url-search-params.ts, lib/url-whatwg.ts
 *   lib/url-whatwg.ts -> lib/url-search-params.ts
 *
 * 额外提供一个内部钩子：URL 的 searchParams 是"活视图"，
 * 参数一变 href / search 就得跟着变，所以这里允许注册一个变更回调。
 * 这个回调不是标准 API，只是本库内部用。
 */
const bytes_1 = require("./bytes");
const FORM_SAFE = new Set();
(function initFormSafe() {
    for (let code = 0x41; code <= 0x5a; code += 1) {
        FORM_SAFE.add(code);
    }
    for (let code = 0x61; code <= 0x7a; code += 1) {
        FORM_SAFE.add(code);
    }
    for (let code = 0x30; code <= 0x39; code += 1) {
        FORM_SAFE.add(code);
    }
    FORM_SAFE.add(0x2a); // *
    FORM_SAFE.add(0x2d); // -
    FORM_SAFE.add(0x2e); // .
    FORM_SAFE.add(0x5f); // _
})();
function hexByte(value) {
    return '%' + (value < 16 ? '0' : '') + value.toString(16).toUpperCase();
}
/** application/x-www-form-urlencoded 序列化：空格变 +，其余按 UTF-8 百分号编码。 */
function formSerialize(value) {
    const bytes = (0, bytes_1.utf8Encode)(value);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        if (FORM_SAFE.has(byte)) {
            out += String.fromCharCode(byte);
        }
        else if (byte === 0x20) {
            out += '+';
        }
        else {
            out += hexByte(byte);
        }
    }
    return out;
}
/** 表单反序列化：+ 变空格，再按 UTF-8 百分号解码。 */
function formParse(value) {
    const bytes = [];
    for (let i = 0; i < value.length; i += 1) {
        const character = value.charAt(i);
        if (character === '+') {
            bytes.push(0x20);
            continue;
        }
        if (character === '%' && i + 2 < value.length) {
            const hex = value.slice(i + 1, i + 3);
            if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
                bytes.push(parseInt(hex, 16));
                i += 2;
                continue;
            }
        }
        const encoded = (0, bytes_1.utf8Encode)(character);
        for (let j = 0; j < encoded.length; j += 1) {
            bytes.push(encoded[j]);
        }
    }
    return (0, bytes_1.utf8Decode)(Uint8Array.from(bytes));
}
/** 参数一变就通知持有者（URL 的 searchParams 是活视图，靠这个同步）。 */
function fireChange(params) {
    const hook = params.__onjOnChange;
    if (typeof hook === 'function') {
        hook();
    }
}
class URLSearchParams {
    constructor(init) {
        // 公开而非 private：`export =` 的模块里，导出类带 private 成员会触发 TS4094
        this.list = [];
        if (init === undefined || init === null) {
            return;
        }
        if (typeof init === 'string') {
            this.list = parseFormPairs(init);
            return;
        }
        const iterable = init;
        if (typeof iterable[Symbol.iterator] === 'function') {
            for (const entry of init) {
                const pair = entry;
                if (pair === null || typeof pair !== 'object' || pair.length !== 2) {
                    throw new TypeError('Each query pair must be an iterable [name, value] tuple');
                }
                this.list.push([String(pair[0]), String(pair[1])]);
            }
            return;
        }
        const record = init;
        const keys = Object.keys(record);
        for (let i = 0; i < keys.length; i += 1) {
            this.list.push([keys[i], String(record[keys[i]])]);
        }
    }
    get size() {
        return this.list.length;
    }
    append(name, value) {
        this.list.push([String(name), String(value)]);
        fireChange(this);
    }
    delete(name, value) {
        const target = String(name);
        const hasValue = value !== undefined;
        const wanted = hasValue ? String(value) : '';
        this.list = this.list.filter(function (pair) {
            if (pair[0] !== target) {
                return true;
            }
            return hasValue && pair[1] !== wanted;
        });
        fireChange(this);
    }
    get(name, value) {
        const target = String(name);
        const hasValue = value !== undefined;
        const wanted = hasValue ? String(value) : '';
        for (let i = 0; i < this.list.length; i += 1) {
            if (this.list[i][0] === target && (!hasValue || this.list[i][1] === wanted)) {
                return this.list[i][1];
            }
        }
        return null;
    }
    getAll(name) {
        const target = String(name);
        const out = [];
        for (let i = 0; i < this.list.length; i += 1) {
            if (this.list[i][0] === target) {
                out.push(this.list[i][1]);
            }
        }
        return out;
    }
    has(name, value) {
        return this.get(name, value) !== null;
    }
    set(name, value) {
        const target = String(name);
        const next = String(value);
        let replaced = false;
        const out = [];
        for (let i = 0; i < this.list.length; i += 1) {
            if (this.list[i][0] !== target) {
                out.push(this.list[i]);
                continue;
            }
            if (!replaced) {
                out.push([target, next]);
                replaced = true;
            }
        }
        if (!replaced) {
            out.push([target, next]);
        }
        this.list = out;
        fireChange(this);
    }
    sort() {
        // 按解码后的名字做稳定排序（比较 UTF-16 码元）
        const indexed = this.list.map(function (pair, index) {
            return { pair: pair, index: index };
        });
        indexed.sort(function (left, right) {
            if (left.pair[0] < right.pair[0]) {
                return -1;
            }
            if (left.pair[0] > right.pair[0]) {
                return 1;
            }
            return left.index - right.index;
        });
        this.list = indexed.map(function (entry) { return entry.pair; });
        fireChange(this);
    }
    forEach(callback, thisArg) {
        const snapshot = this.list.slice();
        for (let i = 0; i < snapshot.length; i += 1) {
            callback.call(thisArg, snapshot[i][1], snapshot[i][0], this);
        }
    }
    entries() {
        let index = 0;
        const list = this.list;
        return asIterable({
            next: function () {
                if (index >= list.length) {
                    return { value: [undefined, undefined], done: true };
                }
                const value = list[index];
                index += 1;
                return { value: [value[0], value[1]], done: false };
            }
        });
    }
    keys() {
        let index = 0;
        const list = this.list;
        return asIterable({
            next: function () {
                if (index >= list.length) {
                    return { value: undefined, done: true };
                }
                return { value: list[index++][0], done: false };
            }
        });
    }
    values() {
        let index = 0;
        const list = this.list;
        return asIterable({
            next: function () {
                if (index >= list.length) {
                    return { value: undefined, done: true };
                }
                return { value: list[index++][1], done: false };
            }
        });
    }
    [Symbol.iterator]() {
        return this.entries();
    }
    toString() {
        const parts = [];
        for (let i = 0; i < this.list.length; i += 1) {
            parts.push(formSerialize(this.list[i][0]) + '=' + formSerialize(this.list[i][1]));
        }
        return parts.join('&');
    }
}
exports.URLSearchParams = URLSearchParams;
/** 把裸迭代器补成可迭代对象 —— Node 的 entries/keys/values 都是可迭代的。 */
function asIterable(iterator) {
    const wrapper = iterator;
    wrapper[Symbol.iterator] = function () {
        return wrapper;
    };
    return wrapper;
}
function parseFormPairs(input) {
    const out = [];
    const source = input.charAt(0) === '?' ? input.slice(1) : input;
    if (source === '') {
        return out;
    }
    const segments = source.split('&');
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === '') {
            continue;
        }
        const equals = segment.indexOf('=');
        if (equals < 0) {
            out.push([formParse(segment), '']);
        }
        else {
            out.push([formParse(segment.slice(0, equals)), formParse(segment.slice(equals + 1))]);
        }
    }
    return out;
}
