'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDeepStrictEqual = isDeepStrictEqual;
exports.isDeepEqual = isDeepEqual;
/**
 * 深比较，供 util.isDeepStrictEqual 与 assert.deepStrictEqual 共用。
 *
 * 目标是复刻 Node 的 `isDeepStrictEqual` 语义，几个容易漏的点：
 *   - `+0` 与 `-0` 不相等（要 Object.is，不能只靠 ===）；
 *   - `NaN` 相等；
 *   - 比的是 constructor（沿原型链取）而不是原型对象本身：
 *     `Object.create({i:1})` 与 `{}` 同类，`Object.create(null)` 与 `{}` 不同类；
 *     数组与非数组永不相等（另有长度检查，所以 `[]` 与 `new Array(2)` 不等）；
 *   - 循环引用要能终止（用 a->b 的 memo 对）；
 *   - Map / Set 按"存在一个深比较相等的对应项"判断，且 Map 的键也参与深比较；
 *   - 普通对象比较的是"自有可枚举字符串键 + 自有可枚举符号键"，
 *     所以稀疏数组与补了 undefined 的数组不相等；
 *   - Error 额外比较 name 与 message（它们是非枚举自有属性，Object.keys 看不到）。
 */
function tagOf(value) {
    return Object.prototype.toString.call(value);
}
function isTypedArrayView(value) {
    return ArrayBuffer.isView(value) && !(value instanceof DataView);
}
function bytesOf(view) {
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}
function sameBytes(left, right) {
    if (left.byteLength !== right.byteLength) {
        return false;
    }
    const a = bytesOf(left);
    const b = bytesOf(right);
    for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
function ownEnumerableKeys(value, loose) {
    const keys = Object.keys(value);
    if (loose) {
        // 旧版宽松深比较只看字符串键，不看符号键
        return keys;
    }
    const symbols = Object.getOwnPropertySymbols(value);
    for (let i = 0; i < symbols.length; i += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, symbols[i]);
        if (descriptor !== undefined && descriptor.enumerable === true) {
            keys.push(symbols[i]);
        }
    }
    return keys;
}
function readKey(value, key) {
    return value[key];
}
function isDeepStrictEqual(left, right, loose) {
    return inner(left, right, new Map(), loose === true);
}
function inner(left, right, seen, loose) {
    if (left === right) {
        // 宽松模式不区分 +0 / -0；严格模式要区分
        return loose || left !== 0 || Object.is(left, right);
    }
    // 注意：函数不算"对象"—— Node 用的是 typeof x === 'object'，
    // 所以两个不同的函数即使都没有自有键也不相等。
    const leftIsObject = typeof left === 'object' && left !== null;
    const rightIsObject = typeof right === 'object' && right !== null;
    if (!leftIsObject || !rightIsObject) {
        if (typeof left === 'number' && typeof right === 'number' && left !== left && right !== right) {
            return true;
        }
        const leftNil = left === null || left === undefined;
        const rightNil = right === null || right === undefined;
        if (leftNil || rightNil) {
            return loose && leftNil && rightNil;
        }
        const leftPrimitive = typeof left !== 'object' && typeof left !== 'function';
        const rightPrimitive = typeof right !== 'object' && typeof right !== 'function';
        if (loose && leftPrimitive && rightPrimitive) {
            // 只有两侧都是原始值才用 ==：对 Object.create(null) 这类对象做 == 会抛
            // "Cannot convert object to primitive value"。
            // eslint-disable-next-line eqeqeq
            return left == right;
        }
        return false;
    }
    // Node 比的是 constructor（沿原型链取），不是原型对象本身：
    // 所以 Object.create({i:1}) 与 {} 视为同类，而 Object.create(null) 不是。
    if (!loose) {
        const leftConstructor = left.constructor;
        const rightConstructor = right.constructor;
        if (leftConstructor !== rightConstructor) {
            return false;
        }
    }
    // 数组与非数组是两类，即使 constructor 相同也不比
    if (Array.isArray(left) !== Array.isArray(right)) {
        return false;
    }
    const previous = seen.get(left);
    if (previous !== undefined) {
        return previous === right;
    }
    seen.set(left, right);
    const leftTag = tagOf(left);
    if (leftTag !== tagOf(right)) {
        return false;
    }
    switch (leftTag) {
        case '[object Date]':
            return left.getTime() === right.getTime();
        case '[object RegExp]':
            return left.source === right.source &&
                left.flags === right.flags;
        case '[object Number]':
        case '[object String]':
        case '[object Boolean]':
        case '[object Symbol]':
        case '[object BigInt]':
            return left.valueOf() === right.valueOf();
        case '[object ArrayBuffer]':
        case '[object SharedArrayBuffer]':
            return sameBytes(new Uint8Array(left), new Uint8Array(right));
        default:
            break;
    }
    if (isTypedArrayView(left) && isTypedArrayView(right)) {
        return sameBytes(left, right);
    }
    if (left instanceof DataView && right instanceof DataView) {
        return sameBytes(left, right);
    }
    if (left instanceof Map && right instanceof Map) {
        if (left.size !== right.size) {
            return false;
        }
        const candidates = Array.from(right.entries());
        const used = new Set();
        for (const entry of left.entries()) {
            let matched = false;
            for (let i = 0; i < candidates.length; i += 1) {
                if (used.has(i)) {
                    continue;
                }
                if (inner(entry[0], candidates[i][0], seen, loose)) {
                    if (!inner(entry[1], candidates[i][1], seen, loose)) {
                        return false;
                    }
                    used.add(i);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                return false;
            }
        }
        return true;
    }
    if (left instanceof Set && right instanceof Set) {
        if (left.size !== right.size) {
            return false;
        }
        const candidates = Array.from(right.values());
        const used = new Set();
        for (const value of left.values()) {
            let matched = false;
            for (let i = 0; i < candidates.length; i += 1) {
                if (used.has(i)) {
                    continue;
                }
                if (inner(value, candidates[i], seen, loose)) {
                    used.add(i);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                return false;
            }
        }
        return true;
    }
    if (left instanceof Error && right instanceof Error) {
        if (left.name !== right.name || left.message !== right.message) {
            return false;
        }
    }
    // 数组还要比长度：[] 与 new Array(2) 的自有键都是空的，但 Node 认为不等
    if (Array.isArray(left) && Array.isArray(right) && left.length !== right.length) {
        return false;
    }
    const leftKeys = ownEnumerableKeys(left, loose);
    const rightKeys = ownEnumerableKeys(right, loose);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (let i = 0; i < leftKeys.length; i += 1) {
        const key = leftKeys[i];
        let found = false;
        for (let j = 0; j < rightKeys.length; j += 1) {
            if (rightKeys[j] === key) {
                found = true;
                break;
            }
        }
        if (!found) {
            return false;
        }
        if (!inner(readKey(left, key), readKey(right, key), seen, loose)) {
            return false;
        }
    }
    return true;
}
/** Node 的旧版宽松深比较（assert.deepEqual），叶子用 == 且不检查原型。 */
function isDeepEqual(left, right) {
    return isDeepStrictEqual(left, right, true);
}
