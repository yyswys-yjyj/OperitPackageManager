'use strict';
/**
 * Node assert 模块的移植（含 assert/strict）。
 *
 * 消息格式按 Node 实测对齐；差异输出用的是"公共前后缀 diff"，
 * 对"只有个别属性不同"这种最常见的情形与 Node 逐字一致；
 * 多段落交错差异时 Node 用的是 Myers diff，我们的对齐方式可能不同。
 *
 * 已知差异（写在 BUILTINS.json 里）：
 *   assert.ok / assert(value) 失败时 Node 会把调用处的源码表达式附在消息里
 *   （"The expression evaluated to a falsy value:\n\n  assert.ok(false)"）。
 *   取源码需要读栈里指向的文件并解析那一行，QuickJS 上不可靠，
 *   所以这里只给出 "The expression evaluated to a falsy value"，不带源码行。
 */
const deep_equal_1 = require("./lib/deep-equal");
const utilModule = require("./util");
function inspect(value) {
    // Node 生成断言消息时用的是多行排版（compact: false），
    // 只有多行才能和它的差异块逐字对齐。
    return utilModule.inspect(value, { depth: 4, compact: false });
}
function isObjectLike(value) {
    return value !== null && (typeof value === 'object' || typeof value === 'function');
}
/** 公共前后缀 diff：与 Node 在"单点差异"下的输出一致。 */
function diffBlock(actual, expected) {
    const left = actual.split('\n');
    const right = expected.split('\n');
    let prefix = 0;
    while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) {
        prefix += 1;
    }
    let suffix = 0;
    while (suffix < left.length - prefix &&
        suffix < right.length - prefix &&
        left[left.length - 1 - suffix] === right[right.length - 1 - suffix]) {
        suffix += 1;
    }
    const lines = [];
    for (let i = 0; i < prefix; i += 1) {
        lines.push('  ' + left[i]);
    }
    for (let i = prefix; i < left.length - suffix; i += 1) {
        lines.push('+ ' + left[i]);
    }
    for (let i = prefix; i < right.length - suffix; i += 1) {
        lines.push('- ' + right[i]);
    }
    for (let i = left.length - suffix; i < left.length; i += 1) {
        lines.push('  ' + left[i]);
    }
    return lines.join('\n') + '\n';
}
class AssertionError extends Error {
    constructor(options) {
        super(options.message === undefined ? '' : String(options.message));
        this.code = 'ERR_ASSERTION';
        this.name = 'AssertionError';
        this.actual = options.actual;
        this.expected = options.expected;
        this.operator = options.operator === undefined ? '' : options.operator;
        this.generatedMessage = options.generatedMessage === true;
        const capture = Error.captureStackTrace;
        if (typeof capture === 'function') {
            capture(this, options.stackStartFn === undefined ? AssertionError : options.stackStartFn);
        }
    }
}
function generatedMessage(operator, actual, expected) {
    switch (operator) {
        case 'strictEqual':
            if (isObjectLike(actual) || isObjectLike(expected)) {
                return 'Expected "actual" to be reference-equal to "expected":\n+ actual - expected\n\n' +
                    diffBlock(inspect(actual), inspect(expected));
            }
            return 'Expected values to be strictly equal:\n\n' + inspect(actual) + ' !== ' + inspect(expected) + '\n';
        case 'notStrictEqual':
            return 'Expected "actual" to be strictly unequal to: ' + inspect(expected);
        case '==':
            return inspect(actual) + ' == ' + inspect(expected);
        case '!=':
            return inspect(actual) + ' != ' + inspect(expected);
        case 'deepStrictEqual':
            return 'Expected values to be strictly deep-equal:\n+ actual - expected\n\n' +
                diffBlock(inspect(actual), inspect(expected));
        case 'notDeepStrictEqual':
            return 'Expected "actual" not to be strictly deep-equal to:\n\n' + inspect(expected) + '\n';
        case 'deepEqual':
            return 'Expected values to be loosely deep-equal:\n\n' + inspect(actual) +
                '\n\nshould loosely deep-equal\n\n' + inspect(expected);
        case 'notDeepEqual':
            // 注意：这一条 Node 末尾没有换行，与 notDeepStrictEqual 不一致
            return 'Expected "actual" not to be loosely deep-equal to:\n\n' + inspect(expected);
        case 'fail':
            return 'Failed';
        case 'match':
            return 'The input did not match the regular expression ' + inspect(expected) +
                '. Input:\n\n' + inspect(actual) + '\n';
        case 'doesNotMatch':
            return 'The input was expected to not match the regular expression ' + inspect(expected) +
                '. Input:\n\n' + inspect(actual) + '\n';
        default:
            return inspect(actual) + ' ' + operator + ' ' + inspect(expected);
    }
}
function createAssertionError(options) {
    const hasCustomMessage = options.message !== undefined && options.message !== null;
    if (!hasCustomMessage) {
        options.message = generatedMessage(options.operator === undefined ? '' : options.operator, options.actual, options.expected);
        options.generatedMessage = true;
    }
    return new AssertionError(options);
}
/**
 * fail 的参数语义按 Node 的"看参数个数"规则：
 *   fail(message)                     —— 单参时第一个参数是消息
 *   fail(actual, expected, message, operator, stackStartFn)
 */
function fail(...args) {
    if (args.length <= 1) {
        const only = args[0];
        if (only instanceof Error) {
            // Node 遇到 Error 会把原错误直接抛出去，不包成 AssertionError
            throw only;
        }
        if (only === undefined) {
            throw new AssertionError({
                message: 'Failed',
                operator: 'fail',
                generatedMessage: true,
                stackStartFn: fail
            });
        }
        throw new AssertionError({
            message: String(only),
            operator: 'fail',
            generatedMessage: false,
            stackStartFn: fail
        });
    }
    const actual = args[0];
    const expected = args[1];
    const message = args[2];
    const operator = args[3] === undefined ? 'fail' : String(args[3]);
    if (message instanceof Error) {
        throw message;
    }
    throw createAssertionError({
        message: message,
        actual: actual,
        expected: expected,
        operator: operator,
        stackStartFn: args[4] === undefined ? fail : args[4]
    });
}
function assert(value, message) {
    if (value) {
        return;
    }
    if (message !== undefined && message !== null) {
        throw new AssertionError({
            message: String(message),
            actual: value,
            expected: true,
            operator: '==',
            generatedMessage: false,
            stackStartFn: assert
        });
    }
    // 缺了 Node 会附上的调用处源码行（见文件头说明）
    throw new AssertionError({
        message: 'The expression evaluated to a falsy value\n',
        actual: value,
        expected: true,
        operator: '==',
        generatedMessage: true,
        stackStartFn: assert
    });
}
function ok(value, message) {
    assert(value, message);
}
function equal(actual, expected, message) {
    // eslint-disable-next-line eqeqeq
    if (!(actual == expected)) {
        fail(actual, expected, message, '==', equal);
    }
}
function notEqual(actual, expected, message) {
    // 相等才失败 —— 这里曾经把条件写反过
    // eslint-disable-next-line eqeqeq
    if (actual == expected) {
        fail(actual, expected, message, '!=', notEqual);
    }
}
function strictEqual(actual, expected, message) {
    if (!Object.is(actual, expected)) {
        fail(actual, expected, message, 'strictEqual', strictEqual);
    }
}
function notStrictEqual(actual, expected, message) {
    if (Object.is(actual, expected)) {
        fail(actual, expected, message, 'notStrictEqual', notStrictEqual);
    }
}
function deepStrictEqual(actual, expected, message) {
    if (!(0, deep_equal_1.isDeepStrictEqual)(actual, expected)) {
        fail(actual, expected, message, 'deepStrictEqual', deepStrictEqual);
    }
}
function notDeepStrictEqual(actual, expected, message) {
    if ((0, deep_equal_1.isDeepStrictEqual)(actual, expected)) {
        fail(actual, expected, message, 'notDeepStrictEqual', notDeepStrictEqual);
    }
}
function deepEqual(actual, expected, message) {
    if (!(0, deep_equal_1.isDeepEqual)(actual, expected)) {
        fail(actual, expected, message, 'deepEqual', deepEqual);
    }
}
function notDeepEqual(actual, expected, message) {
    if ((0, deep_equal_1.isDeepEqual)(actual, expected)) {
        fail(actual, expected, message, 'notDeepEqual', notDeepEqual);
    }
}
function isConstructorLike(value) {
    if (typeof value !== 'function') {
        return false;
    }
    const text = Function.prototype.toString.call(value);
    return /^class\s/.test(text) || /^function\s+[A-Z]/.test(text) || value.prototype !== undefined;
}
function matchesExpectation(error, expected) {
    if (expected === undefined || expected === null) {
        return { ok: true };
    }
    if (expected instanceof RegExp) {
        const whole = String(error);
        if (!expected.test(whole)) {
            return {
                ok: false,
                message: 'The input did not match the regular expression ' + String(expected) +
                    '. Input:\n\n' + inspect(whole) + '\n'
            };
        }
        return { ok: true };
    }
    if (typeof expected === 'function') {
        if (isConstructorLike(expected)) {
            if (!(error instanceof expected)) {
                const actualName = error instanceof Error ? error.name : typeof error;
                const expectedName = expected.name;
                const detail = error instanceof Error ? '\n\nError message:\n\n' + error.message : '';
                return {
                    ok: false,
                    message: 'The error is expected to be an instance of "' + String(expectedName) +
                        '". Received "' + String(actualName) + '"' + detail
                };
            }
            return { ok: true };
        }
        const verdict = expected(error);
        if (!verdict) {
            return { ok: false, message: 'The error failed the validation function' };
        }
        return { ok: true };
    }
    if (isObjectLike(expected)) {
        if (expected instanceof Error) {
            if (!(0, deep_equal_1.isDeepStrictEqual)(error, expected)) {
                return { ok: false, message: 'The error mismatched the expected error' };
            }
            return { ok: true };
        }
        const wanted = expected;
        const keys = Object.keys(wanted);
        for (let i = 0; i < keys.length; i += 1) {
            const key = keys[i];
            const actualValue = error[key];
            if (wanted[key] instanceof RegExp) {
                if (!wanted[key].test(String(actualValue))) {
                    return { ok: false, message: 'The "' + key + '" property does not match the expected pattern' };
                }
            }
            else if (!(0, deep_equal_1.isDeepStrictEqual)(actualValue, wanted[key])) {
                return { ok: false, message: 'The "' + key + '" property does not match the expected value' };
            }
        }
        return { ok: true };
    }
    return { ok: true };
}
function throws(fn, expected, message) {
    if (typeof fn !== 'function') {
        throw new TypeError('The "fn" argument must be of type function.');
    }
    let caught = undefined;
    let threw = false;
    try {
        fn();
    }
    catch (failure) {
        caught = failure;
        threw = true;
    }
    if (!threw) {
        throw new AssertionError({
            actual: undefined,
            expected: undefined,
            operator: 'throws',
            message: message === undefined ? 'Missing expected exception.' : String(message),
            generatedMessage: message === undefined ? false : false,
            stackStartFn: throws
        });
    }
    const verdict = matchesExpectation(caught, expected);
    if (!verdict.ok) {
        // 用匹配失败时算出的具体原因；消息是我们生成的，所以 generatedMessage 为 true
        throw new AssertionError({
            message: message === undefined ? verdict.message : String(message),
            actual: caught,
            expected: expected,
            operator: 'throws',
            generatedMessage: message === undefined,
            stackStartFn: throws
        });
    }
}
function doesNotThrow(fn, expected, message) {
    if (typeof fn !== 'function') {
        throw new TypeError('The "fn" argument must be of type function.');
    }
    try {
        fn();
    }
    catch (failure) {
        const verdict = matchesExpectation(failure, expected);
        if (verdict.ok) {
            const detail = failure instanceof Error ? failure.message : inspect(failure);
            throw new AssertionError({
                actual: failure,
                expected: expected,
                operator: 'doesNotThrow',
                message: message === undefined
                    ? 'Got unwanted exception.\nActual message: "' + detail + '"'
                    : String(message),
                generatedMessage: false,
                stackStartFn: doesNotThrow
            });
        }
    }
}
async function rejects(fn, expected, message) {
    let caught = undefined;
    let threw = false;
    try {
        await (typeof fn === 'function' ? fn() : fn);
    }
    catch (failure) {
        caught = failure;
        threw = true;
    }
    if (!threw) {
        throw new AssertionError({
            actual: undefined,
            expected: undefined,
            operator: 'rejects',
            message: message === undefined ? 'Missing expected rejection.' : String(message),
            generatedMessage: false,
            stackStartFn: rejects
        });
    }
    const verdict = matchesExpectation(caught, expected);
    if (!verdict.ok) {
        throw new AssertionError({
            message: message === undefined ? verdict.message : String(message),
            actual: caught,
            expected: expected,
            operator: 'rejects',
            generatedMessage: message === undefined,
            stackStartFn: rejects
        });
    }
}
async function doesNotReject(fn, expected, message) {
    try {
        await (typeof fn === 'function' ? fn() : fn);
    }
    catch (failure) {
        const verdict = matchesExpectation(failure, expected);
        if (verdict.ok) {
            const detail = failure instanceof Error ? failure.message : inspect(failure);
            throw new AssertionError({
                actual: failure,
                expected: expected,
                operator: 'doesNotReject',
                message: message === undefined
                    ? 'Got unwanted rejection.\nActual message: "' + detail + '"'
                    : String(message),
                generatedMessage: false,
                stackStartFn: doesNotReject
            });
        }
    }
}
function ifError(value) {
    if (value !== null && value !== undefined) {
        const detail = value instanceof Error
            ? value.message
            : inspect(value);
        throw new AssertionError({
            actual: value,
            expected: null,
            operator: 'ifError',
            message: 'ifError got unwanted exception: ' + detail,
            generatedMessage: false,
            stackStartFn: ifError
        });
    }
}
function match(value, regExp, message) {
    if (!(regExp instanceof RegExp)) {
        throw new TypeError('The "regExp" argument must be a regular expression.');
    }
    regExp.lastIndex = 0;
    if (!regExp.test(String(value))) {
        fail(value, regExp, message, 'match', match);
    }
}
function doesNotMatch(value, regExp, message) {
    if (!(regExp instanceof RegExp)) {
        throw new TypeError('The "regExp" argument must be a regular expression.');
    }
    regExp.lastIndex = 0;
    if (regExp.test(String(value))) {
        fail(value, regExp, message, 'doesNotMatch', doesNotMatch);
    }
}
const exported = assert;
exported.ok = ok;
exported.equal = equal;
exported.notEqual = notEqual;
exported.strictEqual = strictEqual;
exported.notStrictEqual = notStrictEqual;
exported.deepEqual = deepEqual;
exported.notDeepEqual = notDeepEqual;
exported.deepStrictEqual = deepStrictEqual;
exported.notDeepStrictEqual = notDeepStrictEqual;
exported.throws = throws;
exported.doesNotThrow = doesNotThrow;
exported.rejects = rejects;
exported.doesNotReject = doesNotReject;
exported.ifError = ifError;
exported.match = match;
exported.doesNotMatch = doesNotMatch;
exported.fail = fail;
exported.AssertionError = AssertionError;
/** assert/strict：equal 等同 strictEqual，deepEqual 等同 deepStrictEqual。 */
function strictAssert(value, message) {
    assert(value, message);
}
const strict = strictAssert;
strict.ok = ok;
strict.equal = strictEqual;
strict.notEqual = notStrictEqual;
strict.strictEqual = strictEqual;
strict.notStrictEqual = notStrictEqual;
strict.deepEqual = deepStrictEqual;
strict.notDeepEqual = notDeepStrictEqual;
strict.deepStrictEqual = deepStrictEqual;
strict.notDeepStrictEqual = notDeepStrictEqual;
strict.throws = throws;
strict.doesNotThrow = doesNotThrow;
strict.rejects = rejects;
strict.doesNotReject = doesNotReject;
strict.ifError = ifError;
strict.match = match;
strict.doesNotMatch = doesNotMatch;
strict.fail = fail;
strict.AssertionError = AssertionError;
strict.strict = strict;
exported.strict = strict;
module.exports = exported;
