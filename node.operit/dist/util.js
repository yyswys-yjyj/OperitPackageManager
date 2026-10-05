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
 * Node util 模块的移植。
 *
 * 重点在两处：
 *   - format()：%s/%d/%i/%f/%j/%o/%O/%c 与"多余参数按 inspect 追加"的规则照搬
 *   - TextEncoder / TextDecoder：QuickJS 不保证提供，这里用 lib/bytes 自实现
 *
 * inspect 只对齐常用形态（原始值、扁平对象/数组、Map/Set/Date/RegExp/Error/Buffer、循环引用），
 * Node 那套 compact / breakLength 折行算法没有照搬，见 BUILTINS.json 的 partial 说明。
 */
const bytesCodec = __importStar(require("./lib/bytes"));
const errors_1 = require("./lib/errors");
const deep_equal_1 = require("./lib/deep-equal");
const inspectCustom = Symbol.for('nodejs.util.inspect.custom');
const promisifyCustom = Symbol.for('nodejs.util.promisify.custom');
const DEFAULT_DEPTH = 2;
function quoteString(value, maxLength) {
    let text = value;
    const truncated = maxLength !== undefined && maxLength !== null && text.length > maxLength;
    if (truncated && maxLength !== undefined && maxLength !== null) {
        text = text.slice(0, maxLength);
    }
    let out = "'";
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        if (code === 39) {
            out += "\\'";
        }
        else if (code === 92) {
            out += '\\\\';
        }
        else if (code === 10) {
            out += '\\n';
        }
        else if (code === 13) {
            out += '\\r';
        }
        else if (code === 9) {
            out += '\\t';
        }
        else if (code < 32) {
            out += '\\x' + pad2(code.toString(16));
        }
        else {
            out += text.charAt(i);
        }
    }
    out += "'";
    if (truncated && maxLength !== undefined && maxLength !== null) {
        out = out.slice(0, out.length - 1) + "... " + (value.length - maxLength) + ' more characters' + "'";
    }
    return out;
}
function pad2(value) {
    return value.length >= 2 ? value : '0' + value;
}
function functionLabel(value) {
    const name = typeof value.name === 'string' && value.name.length > 0 ? value.name : '';
    const kind = /^class[\s{]/.test(Function.prototype.toString.call(value)) ? 'class' : 'Function';
    return name.length > 0 ? '[Function: ' + name + ']' : '[Function (anonymous)]';
}
function inspectValue(value, options, depth, seen) {
    const maxDepth = options.depth === null || options.depth === undefined ? DEFAULT_DEPTH : options.depth;
    if (value === null) {
        return 'null';
    }
    switch (typeof value) {
        case 'undefined':
            return 'undefined';
        case 'boolean':
            return value ? 'true' : 'false';
        case 'number':
            if (Number.isNaN(value)) {
                return 'NaN';
            }
            if (value === Infinity) {
                return 'Infinity';
            }
            if (value === -Infinity) {
                return '-Infinity';
            }
            return Object.is(value, -0) ? '-0' : String(value);
        case 'bigint':
            return String(value) + 'n';
        case 'symbol':
            return value.toString();
        case 'string':
            return quoteString(value, options.maxStringLength);
        case 'function':
            return functionLabel(value);
        default:
            break;
    }
    const object = value;
    const custom = object[inspectCustom];
    if (typeof custom === 'function') {
        return String(custom.call(object));
    }
    if (seen.indexOf(object) >= 0) {
        return '[Circular]';
    }
    if (maxDepth >= 0 && depth > maxDepth) {
        return Array.isArray(object) ? '[Array]' : '[Object]';
    }
    seen.push(object);
    try {
        if (object instanceof Date) {
            return Number.isNaN(object.getTime()) ? 'Invalid Date' : object.toISOString();
        }
        if (object instanceof RegExp) {
            return object.toString();
        }
        if (object instanceof Error) {
            return object.stack !== undefined && typeof object.stack === 'string'
                ? object.stack
                : object.name + ': ' + object.message;
        }
        if (object instanceof Uint8Array) {
            const limit = Math.min(object.length, 50);
            let out = '<Buffer';
            for (let i = 0; i < limit; i += 1) {
                out += ' ' + pad2(object[i].toString(16));
            }
            if (object.length > limit) {
                out += ' ... ' + (object.length - limit) + ' more bytes';
            }
            return out + '>';
        }
        if (object instanceof Map) {
            const parts = [];
            object.forEach(function (entryValue, entryKey) {
                parts.push(inspectValue(entryKey, options, depth + 1, seen) + ' => ' + inspectValue(entryValue, options, depth + 1, seen));
            });
            return formatCollection('Map(' + object.size + ') ', parts, options, depth, '{}');
        }
        if (object instanceof Set) {
            const parts = [];
            object.forEach(function (entryValue) {
                parts.push(inspectValue(entryValue, options, depth + 1, seen));
            });
            return formatCollection('Set(' + object.size + ') ', parts, options, depth, '{}');
        }
        if (Array.isArray(object)) {
            const limit = options.maxArrayLength === undefined ? object.length : Math.min(object.length, options.maxArrayLength);
            const parts = [];
            for (let i = 0; i < limit; i += 1) {
                parts.push(inspectValue(object[i], options, depth + 1, seen));
            }
            if (limit < object.length) {
                parts.push('... ' + (object.length - limit) + ' more items');
            }
            return formatCollection('', parts, options, depth, '[]');
        }
        const keys = Object.keys(object);
        if (options.sorted === true) {
            keys.sort();
        }
        const parts = [];
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            parts.push(formatKey(key) + ': ' + inspectValue(object[key], options, depth + 1, seen));
        }
        return formatCollection('', parts, options, depth, '{}');
    }
    finally {
        seen.pop();
    }
}
/**
 * 集合的统一排版。
 * compact === false 时强制多行（Node 的 inspect 也是这个开关），
 * 缩进按递归深度算，所以嵌套时每层多缩进两格。
 */
function formatCollection(head, parts, options, depth, brackets) {
    const open = brackets.charAt(0);
    const close = brackets.charAt(1);
    if (parts.length === 0) {
        return head + open + close;
    }
    if (options.compact === false) {
        const inner = '  '.repeat(depth + 1);
        const outer = '  '.repeat(depth);
        return head + open + '\n' + inner + parts.join(',\n' + inner) + '\n' + outer + close;
    }
    return head + open + ' ' + parts.join(', ') + ' ' + close;
}
function formatKey(key) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quoteString(key);
}
function inspect(value, options) {
    let normalized = {};
    if (typeof options === 'boolean') {
        normalized = { colors: options };
    }
    else if (typeof options === 'number') {
        normalized = { depth: options };
    }
    else if (options !== null && typeof options === 'object') {
        normalized = options;
    }
    return inspectValue(value, normalized, 0, []);
}
inspect.custom = inspectCustom;
function jsonOf(value) {
    try {
        const encoded = JSON.stringify(value);
        return encoded === undefined ? 'undefined' : encoded;
    }
    catch (failure) {
        return '[Circular]';
    }
}
function formatWithOptions(options, template, ...rest) {
    const args = [template].concat(rest);
    const first = args[0];
    const inspectOptions = options === undefined || options === null ? {} : options;
    if (typeof first !== 'string') {
        return args.map(function (value) {
            return typeof value === 'string' ? value : inspectValue(value, inspectOptions, 0, []);
        }).join(' ');
    }
    if (args.length === 1) {
        return first;
    }
    let out = '';
    let lastPosition = 0;
    let consumed = 0;
    for (let i = 0; i < first.length; i += 1) {
        if (first.charCodeAt(i) !== 37) {
            continue;
        }
        let replacement = null;
        const specifier = first.charCodeAt(i + 1);
        if (specifier === 37) {
            // %%
            replacement = '%';
        }
        else if (consumed + 1 >= args.length) {
            // 参数不足时占位符原样保留（Node: format('%s %s', 'a') === 'a %s'）
            continue;
        }
        else {
            switch (specifier) {
                case 115:
                    replacement = String(args[++consumed]);
                    break;
                case 100:
                    replacement = String(Number(args[++consumed]));
                    break;
                case 105:
                    replacement = String(parseInt(String(args[++consumed]), 10));
                    break;
                case 102:
                    replacement = String(parseFloat(String(args[++consumed])));
                    break;
                case 106:
                    replacement = jsonOf(args[++consumed]);
                    break;
                case 111:
                    replacement = inspectValue(args[++consumed], { showHidden: true, showProxy: true, depth: 4, colors: inspectOptions.colors }, 0, []);
                    break;
                case 79:
                    replacement = inspectValue(args[++consumed], inspectOptions, 0, []);
                    break;
                case 99:
                    // %c 是 CSS 占位符：消费参数但输出空串
                    consumed += 1;
                    replacement = '';
                    break;
                default:
                    continue;
            }
        }
        if (i > lastPosition) {
            out += first.slice(lastPosition, i);
        }
        out += replacement;
        i += 1;
        lastPosition = i + 1;
    }
    if (lastPosition < first.length) {
        out += first.slice(lastPosition);
    }
    for (let index = consumed + 1; index < args.length; index += 1) {
        const extra = args[index];
        // 多余参数：字符串按原样追加，其余走 inspect
        out += ' ' + (typeof extra === 'string' ? extra : inspectValue(extra, inspectOptions, 0, []));
    }
    return out;
}
function format(template, ...rest) {
    return formatWithOptions({}, template, ...rest);
}
function inherits(constructor, superConstructor) {
    if (constructor === undefined || constructor === null) {
        throw new TypeError('The "constructor" argument must be a function.');
    }
    if (superConstructor === undefined || superConstructor === null) {
        throw new TypeError('The "superConstructor" argument must be a function.');
    }
    Object.setPrototypeOf(constructor.prototype, superConstructor.prototype);
    Object.setPrototypeOf(constructor, superConstructor);
    constructor.super_ = superConstructor;
}
function promisify(original) {
    if (typeof original !== 'function') {
        throw new TypeError('The "original" argument must be of type function.');
    }
    const custom = original[promisifyCustom];
    if (custom !== undefined) {
        return custom;
    }
    function fn(...args) {
        const self = this;
        return new Promise(function (resolve, reject) {
            args.push(function (error, value) {
                if (error !== null && error !== undefined) {
                    reject(error);
                }
                else {
                    resolve(value);
                }
            });
            original.apply(self, args);
        });
    }
    Object.setPrototypeOf(fn, Object.getPrototypeOf(original));
    Object.defineProperty(fn, promisifyCustom, { value: custom, configurable: true });
    return fn;
}
promisify.custom = promisifyCustom;
function callbackify(original) {
    if (typeof original !== 'function') {
        throw new TypeError('The "original" argument must be of type function.');
    }
    return function (...args) {
        const callback = args.pop();
        if (typeof callback !== 'function') {
            throw new TypeError('The last argument must be of type function.');
        }
        const runner = callback;
        original.apply(this, args).then(function (value) {
            queueMicrotask(function () {
                runner(null, value);
            });
        }, function (error) {
            queueMicrotask(function () {
                runner(error);
            });
        });
    };
}
function deprecate(fn, message) {
    let warned = false;
    return function (...args) {
        if (!warned) {
            warned = true;
            const target = fn.name;
            console.warn('DeprecationWarning: ' + message + (target !== undefined ? ' [' + target + ']' : ''));
        }
        return fn.apply(this, args);
    };
}
function debuglog(section) {
    void section;
    const logger = function () {
        // Node 只在 NODE_DEBUG 命中时输出；这里没有环境变量通道，默认静默。
    };
    logger.enabled = false;
    return logger;
}
function getSystemErrorName(errno) {
    const names = Object.keys(errors_1.ERRNO);
    for (let i = 0; i < names.length; i += 1) {
        if (errors_1.ERRNO[names[i]] === errno) {
            return names[i];
        }
    }
    return 'Unknown system error ' + errno;
}
function stripVTControlCharacters(value) {
    return String(value).replace(/\u001b\[[0-9;]*m/g, '');
}
const types = {
    isDate: function (value) {
        return value instanceof Date;
    },
    isRegExp: function (value) {
        return value instanceof RegExp;
    },
    isArray: function (value) {
        return Array.isArray(value);
    },
    isTypedArray: function (value) {
        return value instanceof Uint8Array || value instanceof Int8Array ||
            value instanceof Uint16Array || value instanceof Int16Array ||
            value instanceof Uint32Array || value instanceof Int32Array ||
            value instanceof Float32Array || value instanceof Float64Array;
    },
    isUint8Array: function (value) {
        return value instanceof Uint8Array;
    },
    isArrayBuffer: function (value) {
        return value instanceof ArrayBuffer;
    },
    isPromise: function (value) {
        return value !== null && typeof value === 'object' &&
            typeof value.then === 'function';
    },
    isNativeError: function (value) {
        return value instanceof Error;
    },
    isMap: function (value) {
        return value instanceof Map;
    },
    isSet: function (value) {
        return value instanceof Set;
    },
    isBigInt64Array: function (value) {
        return typeof BigInt64Array !== 'undefined' && value instanceof BigInt64Array;
    },
    isAsyncFunction: function (value) {
        return typeof value === 'function' && value.constructor !== undefined &&
            value.constructor.name === 'AsyncFunction';
    },
    isGeneratorFunction: function (value) {
        return typeof value === 'function' && value.constructor !== undefined &&
            value.constructor.name === 'GeneratorFunction';
    }
};
function isDeepStrictEqual(left, right) {
    return (0, deep_equal_1.isDeepStrictEqual)(left, right);
}
class TextEncoder {
    constructor() {
        this.encoding = 'utf-8';
    }
    encode(input) {
        return bytesCodec.utf8Encode(input === undefined ? '' : String(input));
    }
    encodeInto(source, destination) {
        const encoded = bytesCodec.utf8Encode(String(source));
        const writable = Math.min(encoded.length, destination.length);
        destination.set(encoded.subarray(0, writable));
        return { read: writable === encoded.length ? source.length : source.length, written: writable };
    }
}
class TextDecoder {
    constructor(label, options) {
        const normalized = (label === undefined ? 'utf-8' : String(label)).toLowerCase();
        if (normalized !== 'utf-8' && normalized !== 'utf8') {
            throw new RangeError('node.operit 的 TextDecoder 只支持 utf-8，收到 ' + normalized);
        }
        this.encoding = 'utf-8';
        this.fatal = options !== undefined && options.fatal === true;
        this.ignoreBOM = options !== undefined && options.ignoreBOM === true;
    }
    decode(input) {
        if (input === undefined) {
            return '';
        }
        return bytesCodec.utf8Decode(input);
    }
}
const util = {
    format: format,
    formatWithOptions: formatWithOptions,
    inspect: inspect,
    inherits: inherits,
    promisify: promisify,
    callbackify: callbackify,
    deprecate: deprecate,
    debuglog: debuglog,
    getSystemErrorName: getSystemErrorName,
    stripVTControlCharacters: stripVTControlCharacters,
    isDeepStrictEqual: isDeepStrictEqual,
    types: types,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder
};
module.exports = util;
