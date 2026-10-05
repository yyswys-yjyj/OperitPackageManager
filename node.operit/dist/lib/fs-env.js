'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.setHooks = setHooks;
exports.define = define;
exports.names = names;
exports.current = current;
exports.root = root;
exports.writable = writable;
exports.use = use;
exports.withEnvironment = withEnvironment;
exports.reset = reset;
exports.strict = strict;
exports.isStrict = isStrict;
exports.ensureBound = ensureBound;
/**
 * fs 的环境状态机。
 *
 * 模型：环境 = 根 + 能力。切环境就是切 cwd —— 相对路径与 path.resolve 的基准随之改变，
 * 所以状态机不是给 fs 打的补丁，而是路径语义的唯一来源。
 *
 *     UNBOUND ──首次使用──▶ BOUND(sdcard)
 *     BOUND(A) ──use(B)──▶ BOUND(B)
 *     BOUND(A) ──with(B, fn)──▶ BOUND(B) ──fn 同步返回──▶ BOUND(A)
 *     BOUND(*) ──reset()──▶ UNBOUND
 *
 * 为什么 with() 强制同步：模块实例会跨工具调用复用（见 DESIGN.md §7.4），
 * 一旦回调是异步的，await 期间别的代码就会看到被改掉的环境。
 */
const errors_1 = require("./errors");
const paths_1 = require("./paths");
const BUILTIN_ENVS = [
    { name: 'sdcard', root: '/sdcard', writable: true },
    { name: 'config', root: () => (0, paths_1.pluginConfigDir)(), writable: true },
    { name: 'app', root: () => (0, paths_1.filesDir)(), writable: true }
];
const BUILTIN_NAMES = BUILTIN_ENVS.map((item) => item.name);
const specs = new Map();
BUILTIN_ENVS.forEach((item) => specs.set(item.name, item));
let hooks = null;
let currentName = null;
let strictMode = false;
const stack = [];
function setHooks(next) {
    hooks = next;
}
function requireHooks() {
    if (hooks === null) {
        throw (0, errors_1.onjError)('ONJ_MISSING_HOST', 'fs 环境状态机尚未接入宿主。');
    }
    return hooks;
}
function resolveRoot(spec) {
    const value = typeof spec.root === 'function' ? spec.root() : spec.root;
    if (typeof value !== 'string' || value.length === 0) {
        throw (0, errors_1.onjError)('ONJ_ENV_UNAVAILABLE', '环境 ' + spec.name + ' 的根解析为空。');
    }
    return value;
}
/** 注册自定义环境。内置环境名不可覆盖。 */
function define(name, spec) {
    if (typeof name !== 'string' || name.trim().length === 0) {
        throw new TypeError('fs.env.define 的名称必须是非空字符串。');
    }
    if (BUILTIN_NAMES.indexOf(name) >= 0) {
        throw (0, errors_1.onjError)('ONJ_UNKNOWN_ENV', '内置环境 ' + name + ' 不可覆盖。');
    }
    if (spec === null || typeof spec !== 'object') {
        throw new TypeError('fs.env.define 的 spec 必须是对象。');
    }
    specs.set(name, { name: name, root: spec.root, writable: spec.writable !== false });
}
function names() {
    return Array.from(specs.keys());
}
function current() {
    return currentName;
}
function root() {
    const spec = requireCurrent();
    return resolveRoot(spec);
}
function writable() {
    return requireCurrent().writable;
}
function requireCurrent() {
    if (currentName === null) {
        throw (0, errors_1.onjError)('ONJ_ENV_NOT_SET');
    }
    const spec = specs.get(currentName);
    if (spec === undefined) {
        throw (0, errors_1.onjError)('ONJ_UNKNOWN_ENV', currentName);
    }
    return spec;
}
/** 显式切换环境。根不可用即拒绝，不做任何降级。 */
function use(name) {
    const spec = specs.get(name);
    if (spec === undefined) {
        throw (0, errors_1.onjError)('ONJ_UNKNOWN_ENV', name);
    }
    const target = resolveRoot(spec);
    const host = requireHooks();
    try {
        host.probe(target);
    }
    catch (failure) {
        throw (0, errors_1.onjError)('ONJ_ENV_UNAVAILABLE', '环境 ' + name + ' 的根 ' + target + ' 不可用。');
    }
    host.setCwd(target);
    currentName = name;
}
/** 作用域内切换，回调必须同步返回。 */
function withEnvironment(name, callback) {
    const host = requireHooks();
    const previousName = currentName;
    const previousCwd = host.getCwd();
    use(name);
    try {
        const result = callback();
        if (isThenable(result)) {
            throw (0, errors_1.onjError)('ONJ_ENV_ASYNC_SCOPE');
        }
        return result;
    }
    finally {
        host.setCwd(previousCwd);
        currentName = previousName;
    }
}
/** 回到 UNBOUND。cwd 不动 —— 调用方要回默认值请再 use('sdcard')。 */
function reset() {
    currentName = null;
    stack.length = 0;
}
/** strict 模式下，未显式 use() 就使用 fs 会直接报错。 */
function strict(flag) {
    strictMode = flag === true;
}
function isStrict() {
    return strictMode;
}
/** fs 每次操作前调用：非 strict 时按默认环境惰性绑定。 */
function ensureBound() {
    if (currentName !== null) {
        return;
    }
    if (strictMode) {
        throw (0, errors_1.onjError)('ONJ_ENV_NOT_SET');
    }
    use(BUILTIN_NAMES[0]);
}
function isThenable(value) {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    return typeof value.then === 'function';
}
