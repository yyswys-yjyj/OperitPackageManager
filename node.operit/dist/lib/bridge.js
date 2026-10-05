'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.setBackend = setBackend;
exports.handleOf = handleOf;
exports.normalizeBoolean = normalizeBoolean;
exports.unwrap = unwrap;
exports.classExists = classExists;
exports.callStatic = callStatic;
exports.callInstance = callInstance;
exports.newInstance = newInstance;
exports.getStaticField = getStaticField;
exports.setStaticField = setStaticField;
exports.getInstanceField = getInstanceField;
exports.setInstanceField = setInstanceField;
exports.getApplicationContext = getApplicationContext;
exports.getCurrentActivity = getCurrentActivity;
exports.setEnv = setEnv;
exports.isJavaHandle = isJavaHandle;
exports.asNodeError = asNodeError;
/**
 * 唯一接触 Operit Java bridge 的地方。
 *
 * 运行时契约（types/core.d.ts）：
 *   javaCallStatic(className, methodName, argsJson) -> "{\"success\":bool,\"data\":any,\"error\":string}"
 *   javaNewInstance / javaCallInstance / javaGet|SetStatic|InstanceField 同形状
 *   javaGetApplicationContext / javaGetCurrentActivity
 *
 * 返回值经 toJsonCompatibleValue 转换：基本类型直通，数组 / Map / Iterable 递归展开，
 * 其余对象变成 { __javaHandle, __javaClass } 句柄。参数方向只接受 JSON 值。
 *
 * 本模块只做三件事：调用、解包、把 Java 异常翻成带 code 的中间态错误。
 * 它不知道 fs，也不知道路径语义 —— 那些属于上层。
 */
const errors_1 = require("./errors");
let backend = null;
/** 宿主注入点：桌面测试与 mock 使用。传 null 恢复为自动解析 Operit 宿主。 */
function setBackend(next) {
    backend = next === undefined ? null : next;
}
function getBackend() {
    if (backend === null) {
        backend = createOperitBackend();
    }
    return backend;
}
function createOperitBackend() {
    const detected = NativeInterface;
    if (detected === undefined) {
        throw (0, errors_1.onjError)('ONJ_MISSING_HOST');
    }
    const native = detected;
    function callNative(method, args) {
        const fn = native[method];
        if (typeof fn !== 'function') {
            throw (0, errors_1.onjError)('ONJ_MISSING_HOST', 'NativeInterface.' + String(method) + ' 不可用。');
        }
        const invoke = fn;
        return invoke.apply(native, args);
    }
    return {
        classExists(className) {
            return normalizeBoolean(callNative('javaClassExists', [String(className)]));
        },
        callStatic(className, methodName, args) {
            return unwrap(callNative('javaCallStatic', [String(className), String(methodName), JSON.stringify(args)]), 'javaCallStatic ' + className + '#' + methodName);
        },
        callInstance(instance, methodName, args) {
            return unwrap(callNative('javaCallInstance', [handleOf(instance), String(methodName), JSON.stringify(args)]), 'javaCallInstance ' + methodName);
        },
        newInstance(className, args) {
            return unwrap(callNative('javaNewInstance', [String(className), JSON.stringify(args)]), 'javaNewInstance ' + className);
        },
        getStaticField(className, fieldName) {
            return unwrap(callNative('javaGetStaticField', [String(className), String(fieldName)]), 'javaGetStaticField ' + className + '#' + fieldName);
        },
        setStaticField(className, fieldName, value) {
            return unwrap(callNative('javaSetStaticField', [String(className), String(fieldName), JSON.stringify(value)]), 'javaSetStaticField ' + className + '#' + fieldName);
        },
        getInstanceField(instance, fieldName) {
            return unwrap(callNative('javaGetInstanceField', [handleOf(instance), String(fieldName)]), 'javaGetInstanceField ' + fieldName);
        },
        setInstanceField(instance, fieldName, value) {
            return unwrap(callNative('javaSetInstanceField', [handleOf(instance), String(fieldName), JSON.stringify(value)]), 'javaSetInstanceField ' + fieldName);
        },
        getApplicationContext() {
            return unwrap(callNative('javaGetApplicationContext', []), 'javaGetApplicationContext');
        },
        getCurrentActivity() {
            return unwrap(callNative('javaGetCurrentActivity', []), 'javaGetCurrentActivity');
        },
        setEnv(key, value) {
            // setEnv 属于 P2（源码里真实存在，官方 d.ts 未声明），因此显式检查可用性
            if (typeof native.setEnv !== 'function') {
                throw (0, errors_1.onjError)('ONJ_MISSING_HOST', 'NativeInterface.setEnv 不可用，无法写环境变量。');
            }
            native.setEnv(String(key), value);
        }
    };
}
/** 把 { __javaHandle, __javaClass } 或裸 handle 字符串统一成 handle 字符串。 */
function handleOf(instance) {
    if (typeof instance === 'string' && instance.length > 0) {
        return instance;
    }
    if (instance !== null && typeof instance === 'object') {
        const candidate = instance.__javaHandle;
        if (typeof candidate === 'string' && candidate.length > 0) {
            return candidate;
        }
    }
    throw (0, errors_1.createError)('EINVAL', 'bridge.handleOf');
}
function normalizeBoolean(value) {
    if (value === true || value === false) {
        return value;
    }
    if (typeof value === 'string') {
        return value.trim().toLowerCase() === 'true';
    }
    if (typeof value === 'number') {
        return value !== 0;
    }
    if (value === null || value === undefined) {
        return false;
    }
    return Boolean(value);
}
/**
 * 解包 bridge 返回值。约定形状 `{ success, data?, error?, message? }`；
 * success 为 false 时抛中间态 Java 错误（带 code，但还没有 syscall / path）。
 */
function unwrap(raw, context) {
    if (typeof raw !== 'string') {
        return raw;
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (parseFailure) {
        throw (0, errors_1.onjError)('ONJ_BRIDGE_PROTOCOL', context + ' 的返回不是 JSON。');
    }
    if (parsed === null || typeof parsed !== 'object') {
        return parsed;
    }
    const envelope = parsed;
    if (envelope.success === false) {
        const detail = typeof envelope.error === 'string' && envelope.error.length > 0
            ? envelope.error
            : (typeof envelope.message === 'string' && envelope.message.length > 0 ? envelope.message : context);
        throw (0, errors_1.javaError)(detail);
    }
    if (Object.prototype.hasOwnProperty.call(envelope, 'data')) {
        return envelope.data;
    }
    return envelope;
}
function classExists(className) {
    return getBackend().classExists(className);
}
function callStatic(className, methodName, args = []) {
    return getBackend().callStatic(className, methodName, args);
}
function callInstance(instance, methodName, args = []) {
    return getBackend().callInstance(instance, methodName, args);
}
function newInstance(className, args = []) {
    return getBackend().newInstance(className, args);
}
function getStaticField(className, fieldName) {
    return getBackend().getStaticField(className, fieldName);
}
function setStaticField(className, fieldName, value) {
    return getBackend().setStaticField(className, fieldName, value);
}
function getInstanceField(instance, fieldName) {
    return getBackend().getInstanceField(instance, fieldName);
}
function setInstanceField(instance, fieldName, value) {
    return getBackend().setInstanceField(instance, fieldName, value);
}
function getApplicationContext() {
    return getBackend().getApplicationContext();
}
function getCurrentActivity() {
    return getBackend().getCurrentActivity();
}
/** 写环境变量。setEnv 是 P2 能力：不存在时抛 ONJ_MISSING_HOST，不静默丢弃。 */
function setEnv(key, value) {
    getBackend().setEnv(key, value);
}
/** 便于上层判断某个值是不是 Java 句柄。 */
function isJavaHandle(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    return typeof value.__javaHandle === 'string';
}
/** 类型收窄辅助：把 unknown 断言成带 code 的错误对象。 */
function asNodeError(value) {
    if (value instanceof Error) {
        return value;
    }
    return null;
}
