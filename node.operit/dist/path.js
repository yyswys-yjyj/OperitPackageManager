'use strict';
/**
 * Node path 模块的移植，posix 与 win32 两套都在。
 *
 * 与 Node 的差异（有意为之，只此一处）：
 *   默认导出的是 posix 版，因为 Operit 的平台是 android / linux；
 *   Node 的默认导出按宿主平台选择，这里没有可选择的余地。
 *   path.posix / path.win32 的行为与 Node 一致，并由 test/path.test.js 对拍。
 *
 * win32 的 resolve 在 Node 里会查询 "=<盘符>" 形式的环境变量取盘符级 cwd，
 * QuickJS 没有 process.env，这里统一退回 lib/cwd 提供的 cwd。
 */
const cwd_1 = require("./lib/cwd");
const CHAR_UPPERCASE_A = 65;
const CHAR_UPPERCASE_Z = 90;
const CHAR_LOWERCASE_A = 97;
const CHAR_LOWERCASE_Z = 122;
const CHAR_DOT = 46;
const CHAR_FORWARD_SLASH = 47;
const CHAR_BACKWARD_SLASH = 92;
const CHAR_COLON = 58;
function describeValue(value) {
    if (typeof value === 'string') {
        return "'" + value + "'";
    }
    if (value === null) {
        return 'null';
    }
    if (value === undefined) {
        return 'undefined';
    }
    if (typeof value === 'object') {
        return '{}';
    }
    return String(value);
}
function assertPath(value) {
    if (typeof value !== 'string') {
        throw new TypeError('Path must be a string. Received ' + describeValue(value));
    }
}
function isPosixSeparator(code) {
    return code === CHAR_FORWARD_SLASH;
}
function isWindowsSeparator(code) {
    return code === CHAR_FORWARD_SLASH || code === CHAR_BACKWARD_SLASH;
}
function isWindowsDeviceRoot(code) {
    return (code >= CHAR_UPPERCASE_A && code <= CHAR_UPPERCASE_Z) ||
        (code >= CHAR_LOWERCASE_A && code <= CHAR_LOWERCASE_Z);
}
/** Node normalizeString 的移植；separator 与 isSeparator 决定平台。 */
function normalizeString(path, allowAboveRoot, separator, isSeparator) {
    let res = '';
    let lastSegmentLength = 0;
    let lastSlash = -1;
    let dots = 0;
    let code = 0;
    for (let i = 0; i <= path.length; i += 1) {
        if (i < path.length) {
            code = path.charCodeAt(i);
        }
        else if (isSeparator(code)) {
            break;
        }
        else {
            code = CHAR_FORWARD_SLASH;
        }
        if (isSeparator(code)) {
            if (lastSlash === i - 1 || dots === 1) {
                // 连续分隔符或单个点，跳过
            }
            else if (dots === 2) {
                if (res.length < 2 ||
                    lastSegmentLength !== 2 ||
                    res.charCodeAt(res.length - 1) !== CHAR_DOT ||
                    res.charCodeAt(res.length - 2) !== CHAR_DOT) {
                    if (res.length > 2) {
                        const lastSlashIndex = res.lastIndexOf(separator);
                        if (lastSlashIndex === -1) {
                            res = '';
                            lastSegmentLength = 0;
                        }
                        else {
                            res = res.slice(0, lastSlashIndex);
                            lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
                        }
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                    else if (res.length !== 0) {
                        res = '';
                        lastSegmentLength = 0;
                        lastSlash = i;
                        dots = 0;
                        continue;
                    }
                }
                if (allowAboveRoot) {
                    res += res.length > 0 ? separator + '..' : '..';
                    lastSegmentLength = 2;
                }
            }
            else {
                if (res.length > 0) {
                    res += separator + path.slice(lastSlash + 1, i);
                }
                else {
                    res = path.slice(lastSlash + 1, i);
                }
                lastSegmentLength = i - lastSlash - 1;
            }
            lastSlash = i;
            dots = 0;
        }
        else if (code === CHAR_DOT && dots !== -1) {
            dots += 1;
        }
        else {
            dots = -1;
        }
    }
    return res;
}
// ---------------------------------------------------------------- posix
function posixNormalize(path) {
    assertPath(path);
    if (path.length === 0) {
        return '.';
    }
    const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    const trailingSeparator = path.charCodeAt(path.length - 1) === CHAR_FORWARD_SLASH;
    let normalized = normalizeString(path, !isAbsolute, '/', isPosixSeparator);
    if (normalized.length === 0) {
        if (isAbsolute) {
            return '/';
        }
        return trailingSeparator ? './' : '.';
    }
    if (trailingSeparator) {
        normalized += '/';
    }
    return isAbsolute ? '/' + normalized : normalized;
}
function posixIsAbsolute(path) {
    assertPath(path);
    return path.length > 0 && path.charCodeAt(0) === CHAR_FORWARD_SLASH;
}
function posixJoin(...paths) {
    if (paths.length === 0) {
        return '.';
    }
    let joined;
    for (let i = 0; i < paths.length; i += 1) {
        const arg = paths[i];
        assertPath(arg);
        if (arg.length > 0) {
            joined = joined === undefined ? arg : joined + '/' + arg;
        }
    }
    if (joined === undefined) {
        return '.';
    }
    return posixNormalize(joined);
}
function posixResolve(...paths) {
    let resolvedPath = '';
    let resolvedAbsolute = false;
    for (let i = paths.length - 1; i >= -1 && !resolvedAbsolute; i -= 1) {
        const path = i >= 0 ? paths[i] : (0, cwd_1.get)();
        assertPath(path);
        if (path.length === 0) {
            continue;
        }
        resolvedPath = path + '/' + resolvedPath;
        resolvedAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    }
    resolvedPath = normalizeString(resolvedPath, !resolvedAbsolute, '/', isPosixSeparator);
    if (resolvedAbsolute) {
        return resolvedPath.length > 0 ? '/' + resolvedPath : '/';
    }
    return resolvedPath.length > 0 ? resolvedPath : '.';
}
function posixRelative(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) {
        return '';
    }
    const fromOrig = posixResolve(from);
    const toOrig = posixResolve(to);
    if (fromOrig === toOrig) {
        return '';
    }
    const fromResolved = fromOrig;
    const toResolved = toOrig;
    let fromStart = 1;
    for (; fromStart < fromResolved.length; fromStart += 1) {
        if (fromResolved.charCodeAt(fromStart) !== CHAR_FORWARD_SLASH) {
            break;
        }
    }
    const fromEnd = fromResolved.length;
    const fromLen = fromEnd - fromStart;
    let toStart = 1;
    for (; toStart < toResolved.length; toStart += 1) {
        if (toResolved.charCodeAt(toStart) !== CHAR_FORWARD_SLASH) {
            break;
        }
    }
    const toEnd = toResolved.length;
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i <= length; i += 1) {
        if (i === length) {
            if (toLen > length) {
                if (toResolved.charCodeAt(toStart + i) === CHAR_FORWARD_SLASH) {
                    return toResolved.slice(toStart + i + 1);
                }
                if (i === 0) {
                    return toResolved.slice(toStart + i);
                }
            }
            else if (fromLen > length) {
                if (fromResolved.charCodeAt(fromStart + i) === CHAR_FORWARD_SLASH) {
                    lastCommonSep = i;
                }
                else if (i === 0) {
                    lastCommonSep = 0;
                }
            }
            break;
        }
        const fromCode = fromResolved.charCodeAt(fromStart + i);
        const toCode = toResolved.charCodeAt(toStart + i);
        if (fromCode !== toCode) {
            break;
        }
        else if (fromCode === CHAR_FORWARD_SLASH) {
            lastCommonSep = i;
        }
    }
    let out = '';
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; i += 1) {
        if (i === fromEnd || fromResolved.charCodeAt(i) === CHAR_FORWARD_SLASH) {
            out += out.length === 0 ? '..' : '/..';
        }
    }
    return out + toResolved.slice(toStart + lastCommonSep);
}
function posixDirname(path) {
    assertPath(path);
    if (path.length === 0) {
        return '.';
    }
    const hasRoot = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    let end = -1;
    let matchedSlash = true;
    for (let i = path.length - 1; i >= 1; i -= 1) {
        if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        }
        else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        return hasRoot ? '/' : '.';
    }
    if (hasRoot && end === 1) {
        return '//';
    }
    return path.slice(0, end);
}
function posixBasename(path, ext) {
    if (ext !== undefined && typeof ext !== 'string') {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) {
            return '';
        }
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for (i = path.length - 1; i >= 0; i -= 1) {
            const code = path.charCodeAt(i);
            if (code === CHAR_FORWARD_SLASH) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            }
            else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        extIdx -= 1;
                        if (extIdx === -1) {
                            end = i;
                        }
                    }
                    else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) {
            end = firstNonSlashEnd;
        }
        else if (end === -1) {
            end = path.length;
        }
        return path.slice(start, end);
    }
    for (i = path.length - 1; i >= 0; i -= 1) {
        if (path.charCodeAt(i) === CHAR_FORWARD_SLASH) {
            if (!matchedSlash) {
                start = i + 1;
                break;
            }
        }
        else if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
    }
    if (end === -1) {
        return '';
    }
    return path.slice(start, end);
}
function posixExtname(path) {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; i -= 1) {
        const code = path.charCodeAt(i);
        if (code === CHAR_FORWARD_SLASH) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === CHAR_DOT) {
            if (startDot === -1) {
                startDot = i;
            }
            else if (preDotState !== 1) {
                preDotState = 1;
            }
        }
        else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 ||
        end === -1 ||
        preDotState === 0 ||
        (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) {
        return '';
    }
    return path.slice(startDot, end);
}
function posixFormat(pathObject) {
    if (pathObject === null || typeof pathObject !== 'object') {
        throw new TypeError('The "pathObject" argument must be of type object. Received type ' + typeof pathObject);
    }
    const dir = pathObject.dir ?? pathObject.root;
    const base = pathObject.base ?? (pathObject.name ?? '') + (pathObject.ext ?? '');
    if (dir === undefined || dir.length === 0) {
        return base;
    }
    if (dir === pathObject.root) {
        return dir + base;
    }
    return dir + '/' + base;
}
function posixParse(path) {
    assertPath(path);
    const ret = { root: '', dir: '', base: '', ext: '', name: '' };
    if (path.length === 0) {
        return ret;
    }
    const isAbsolute = path.charCodeAt(0) === CHAR_FORWARD_SLASH;
    const start = isAbsolute ? 1 : 0;
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    if (isAbsolute) {
        ret.root = '/';
    }
    for (; i >= start; i -= 1) {
        const code = path.charCodeAt(i);
        if (code === CHAR_FORWARD_SLASH) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === CHAR_DOT) {
            if (startDot === -1) {
                startDot = i;
            }
            else if (preDotState !== 1) {
                preDotState = 1;
            }
        }
        else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (end !== -1) {
        const sliceStart = startPart === 0 && isAbsolute ? 1 : startPart;
        if (startDot === -1 ||
            preDotState === 0 ||
            (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) {
            ret.base = path.slice(sliceStart, end);
            ret.name = ret.base;
        }
        else {
            ret.name = path.slice(sliceStart, startDot);
            ret.base = path.slice(sliceStart, end);
            ret.ext = path.slice(startDot, end);
        }
    }
    if (startPart > 0) {
        ret.dir = path.slice(0, startPart - 1);
    }
    else if (isAbsolute) {
        ret.dir = '/';
    }
    return ret;
}
function posixToNamespacedPath(path) {
    return path;
}
// ---------------------------------------------------------------- win32
function win32Normalize(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) {
        return '.';
    }
    if (len === 1) {
        return isWindowsSeparator(path.charCodeAt(0)) ? '\\' : path;
    }
    let rootEnd = 0;
    let device;
    let isAbsolute = false;
    const code = path.charCodeAt(0);
    if (isWindowsSeparator(code)) {
        isAbsolute = true;
        if (isWindowsSeparator(path.charCodeAt(1))) {
            let j = 2;
            let last = j;
            while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                j += 1;
            }
            if (j < len && j !== last) {
                const firstPart = path.slice(last, j);
                last = j;
                while (j < len && isWindowsSeparator(path.charCodeAt(j))) {
                    j += 1;
                }
                if (j < len && j !== last) {
                    last = j;
                    while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                        j += 1;
                    }
                    if (j === len) {
                        device = '\\\\' + firstPart + '\\' + path.slice(last);
                        rootEnd = j;
                    }
                    else if (j !== last) {
                        device = '\\\\' + firstPart + '\\' + path.slice(last, j);
                        rootEnd = j;
                    }
                }
            }
        }
        else {
            rootEnd = 1;
        }
    }
    else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2 && isWindowsSeparator(path.charCodeAt(2))) {
            isAbsolute = true;
            rootEnd = 3;
        }
    }
    let tail;
    if (rootEnd < len) {
        tail = normalizeString(path.slice(rootEnd), !isAbsolute, '\\', isWindowsSeparator);
    }
    else {
        tail = '';
    }
    if (tail.length === 0 && !isAbsolute) {
        tail = '.';
    }
    if (tail.length > 0 && isWindowsSeparator(path.charCodeAt(len - 1))) {
        tail += '\\';
    }
    if (device === undefined) {
        if (isAbsolute) {
            return '\\' + tail;
        }
        // Windows 会把"以冒号结尾"或"冒号后紧跟分隔符"的相对路径当成盘符相对路径，
        // 这里补 .\ 前缀消除歧义。1:2 这类不含歧义的相对路径不补。
        return hasAmbiguousDriveColon(tail) ? '.\\' + tail : tail;
    }
    if (isAbsolute) {
        // \\.\ 是设备命名空间，空尾时补分隔符会改变语义，保持原样。
        if (tail.length === 0 && isDeviceNamespace(device)) {
            return device;
        }
        return device + '\\' + tail;
    }
    return device + tail;
}
/** 判断归一化后的相对路径里有没有会被误读成盘符的冒号。 */
function hasAmbiguousDriveColon(value) {
    for (let i = 0; i < value.length; i += 1) {
        if (value.charCodeAt(i) !== CHAR_COLON) {
            continue;
        }
        if (i === value.length - 1) {
            return true;
        }
        const next = value.charCodeAt(i + 1);
        if (next === CHAR_FORWARD_SLASH || next === CHAR_BACKWARD_SLASH) {
            return true;
        }
    }
    return false;
}
/** 判断是否为 \\.\ 开头的设备命名空间路径。 */
function isDeviceNamespace(value) {
    return value.length >= 4 &&
        value.charCodeAt(0) === CHAR_BACKWARD_SLASH &&
        value.charCodeAt(1) === CHAR_BACKWARD_SLASH &&
        value.charCodeAt(2) === CHAR_DOT &&
        value.charCodeAt(3) === CHAR_BACKWARD_SLASH;
}
function win32IsAbsolute(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) {
        return false;
    }
    const code = path.charCodeAt(0);
    if (isWindowsSeparator(code)) {
        return true;
    }
    return isWindowsDeviceRoot(code) && len > 2 &&
        path.charCodeAt(1) === CHAR_COLON &&
        isWindowsSeparator(path.charCodeAt(2));
}
function win32Join(...paths) {
    if (paths.length === 0) {
        return '.';
    }
    let joined;
    let firstPart = '';
    for (let i = 0; i < paths.length; i += 1) {
        const arg = paths[i];
        assertPath(arg);
        if (arg.length > 0) {
            if (joined === undefined) {
                joined = firstPart = arg;
            }
            else {
                joined += '\\' + arg;
            }
        }
    }
    if (joined === undefined) {
        return '.';
    }
    let needsReplace = true;
    let slashCount = 0;
    if (isWindowsDeviceRoot(firstPart.charCodeAt(0)) && firstPart.charCodeAt(1) === CHAR_COLON) {
        if (isWindowsSeparator(firstPart.charCodeAt(2))) {
            slashCount += 1;
            if (isWindowsSeparator(firstPart.charCodeAt(3))) {
                slashCount += 1;
            }
        }
    }
    else if (isWindowsSeparator(firstPart.charCodeAt(0))) {
        slashCount += 1;
    }
    if (slashCount >= 2 || firstPart.slice(0, 2) === '\\\\') {
        needsReplace = false;
    }
    if (needsReplace) {
        while (slashCount < joined.length && isWindowsSeparator(joined.charCodeAt(slashCount))) {
            slashCount += 1;
        }
        if (slashCount >= 2) {
            joined = '\\' + joined.slice(slashCount);
        }
    }
    return win32Normalize(joined);
}
/**
 * 根相对路径（形如 \\server\\share）本身不带盘符，Windows 语义是继承当前盘符。
 * Node 取 process.cwd() 的盘符，QuickJS 没有 process.env，同样取 cwd。
 * 无盘符可用时返回空串，由调用方退回纯根相对形式。
 */
function win32InheritDrive() {
    const cwd = (0, cwd_1.get)();
    if (cwd.length >= 2 && cwd.charCodeAt(1) === CHAR_COLON) {
        return cwd.slice(0, 2);
    }
    return '';
}
function win32Resolve(...paths) {
    let resolvedDevice = '';
    let resolvedTail = '';
    let resolvedAbsolute = false;
    for (let i = paths.length - 1; i >= -1 && !resolvedAbsolute; i -= 1) {
        const path = i >= 0 ? paths[i] : (0, cwd_1.get)();
        assertPath(path);
        if (path.length === 0) {
            continue;
        }
        const len = path.length;
        let rootEnd = 0;
        let device;
        const code = path.charCodeAt(0);
        if (len > 1) {
            if (isWindowsSeparator(code)) {
                rootEnd = 1;
                if (isWindowsSeparator(path.charCodeAt(1))) {
                    let j = 2;
                    let last = j;
                    while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                        j += 1;
                    }
                    if (j < len && j !== last) {
                        const firstPart = path.slice(last, j);
                        last = j;
                        while (j < len && isWindowsSeparator(path.charCodeAt(j))) {
                            j += 1;
                        }
                        if (j < len && j !== last) {
                            last = j;
                            while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                                j += 1;
                            }
                            if (j === len) {
                                device = '\\\\' + firstPart + '\\' + path.slice(last);
                                rootEnd = j;
                            }
                            else if (j !== last) {
                                device = '\\\\' + firstPart + '\\' + path.slice(last, j);
                                rootEnd = j;
                            }
                        }
                    }
                }
            }
            else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
                device = path.slice(0, 2);
                rootEnd = 2;
                if (len > 2 && isWindowsSeparator(path.charCodeAt(2))) {
                    rootEnd = 3;
                }
            }
        }
        else if (isWindowsSeparator(code)) {
            rootEnd = 1;
        }
        if (device !== undefined && device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = path.slice(rootEnd) + '\\' + resolvedTail;
            resolvedAbsolute = rootEnd > 0;
        }
    }
    resolvedTail = normalizeString(resolvedTail, !resolvedAbsolute, '\\', isWindowsSeparator);
    if (resolvedAbsolute) {
        if (resolvedDevice.length > 0) {
            return resolvedDevice + '\\' + resolvedTail;
        }
        const inheritedDrive = win32InheritDrive();
        if (inheritedDrive.length > 0) {
            return inheritedDrive + '\\' + resolvedTail;
        }
        return '\\' + resolvedTail;
    }
    if (resolvedDevice.length > 0) {
        return resolvedDevice + (resolvedTail.length > 0 ? '\\' + resolvedTail : '\\');
    }
    return resolvedTail.length > 0 ? resolvedTail : '.';
}
function win32Relative(from, to) {
    assertPath(from);
    assertPath(to);
    if (from === to) {
        return '';
    }
    const fromOrig = win32Resolve(from);
    const toOrig = win32Resolve(to);
    if (fromOrig === toOrig) {
        return '';
    }
    const fromLower = fromOrig.toLowerCase();
    const toLower = toOrig.toLowerCase();
    if (fromLower === toLower) {
        return '';
    }
    let fromStart = 0;
    for (; fromStart < fromLower.length; fromStart += 1) {
        if (fromLower.charCodeAt(fromStart) !== CHAR_BACKWARD_SLASH) {
            break;
        }
    }
    const fromEnd = fromLower.length;
    const fromLen = fromEnd - fromStart;
    let toStart = 0;
    for (; toStart < toLower.length; toStart += 1) {
        if (toLower.charCodeAt(toStart) !== CHAR_BACKWARD_SLASH) {
            break;
        }
    }
    const toEnd = toLower.length;
    const toLen = toEnd - toStart;
    const length = fromLen < toLen ? fromLen : toLen;
    let lastCommonSep = -1;
    let i = 0;
    for (; i <= length; i += 1) {
        if (i === length) {
            if (toLen > length) {
                if (toLower.charCodeAt(toStart + i) === CHAR_BACKWARD_SLASH) {
                    return toOrig.slice(toStart + i + 1);
                }
                if (i === 2) {
                    return toOrig.slice(toStart + i);
                }
            }
            else if (fromLen > length) {
                if (fromLower.charCodeAt(fromStart + i) === CHAR_BACKWARD_SLASH) {
                    lastCommonSep = i;
                }
                else if (i === 2) {
                    lastCommonSep = 3;
                }
            }
            break;
        }
        const fromCode = fromLower.charCodeAt(fromStart + i);
        const toCode = toLower.charCodeAt(toStart + i);
        if (fromCode !== toCode) {
            break;
        }
        else if (fromCode === CHAR_BACKWARD_SLASH) {
            lastCommonSep = i;
        }
    }
    if (lastCommonSep === -1) {
        lastCommonSep = 0;
    }
    let out = '';
    for (i = fromStart + lastCommonSep + 1; i <= fromEnd; i += 1) {
        if (i === fromEnd || fromLower.charCodeAt(i) === CHAR_BACKWARD_SLASH) {
            out += out.length === 0 ? '..' : '\\..';
        }
    }
    toStart += lastCommonSep;
    if (out.length > 0) {
        return out + toOrig.slice(toStart, toEnd);
    }
    if (toStart === 2) {
        return toOrig.slice(2);
    }
    return toOrig.slice(toStart, toEnd);
}
function win32Dirname(path) {
    assertPath(path);
    const len = path.length;
    if (len === 0) {
        return '.';
    }
    let rootEnd = -1;
    let end = -1;
    let matchedSlash = true;
    let offset = 0;
    const code = path.charCodeAt(0);
    if (len > 1) {
        if (isWindowsSeparator(code)) {
            rootEnd = offset = 1;
            if (isWindowsSeparator(path.charCodeAt(1))) {
                let j = 2;
                let last = j;
                while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                    j += 1;
                }
                if (j < len && j !== last) {
                    last = j;
                    while (j < len && isWindowsSeparator(path.charCodeAt(j))) {
                        j += 1;
                    }
                    if (j < len && j !== last) {
                        last = j;
                        while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                            j += 1;
                        }
                        if (j === len || j !== last) {
                            rootEnd = j;
                        }
                    }
                }
            }
        }
        else if (isWindowsDeviceRoot(code) && path.charCodeAt(1) === CHAR_COLON) {
            rootEnd = 2;
            offset = 2;
            if (len > 2 && isWindowsSeparator(path.charCodeAt(2))) {
                if (len === 3) {
                    return path;
                }
                rootEnd = 3;
                offset = 3;
            }
        }
    }
    else if (isWindowsSeparator(code)) {
        rootEnd = offset = 1;
    }
    for (let i = len - 1; i >= offset; i -= 1) {
        if (isWindowsSeparator(path.charCodeAt(i))) {
            if (!matchedSlash) {
                end = i;
                break;
            }
        }
        else {
            matchedSlash = false;
        }
    }
    if (end === -1) {
        return rootEnd === -1 ? '.' : path.slice(0, rootEnd);
    }
    if (rootEnd === -1) {
        return path.slice(0, end);
    }
    if (end === rootEnd && rootEnd >= 1 && isWindowsSeparator(path.charCodeAt(rootEnd - 1))) {
        if (rootEnd === 1) {
            return '\\';
        }
        return path.slice(0, rootEnd);
    }
    return path.slice(0, end);
}
/** win32 路径的根长度：0 表示无根（相对路径）。 */
function win32RootEnd(path) {
    const len = path.length;
    if (len === 0) {
        return 0;
    }
    const first = path.charCodeAt(0);
    if (isWindowsSeparator(first)) {
        if (len > 1 && isWindowsSeparator(path.charCodeAt(1))) {
            let j = 2;
            let last = j;
            while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                j += 1;
            }
            if (j < len && j !== last) {
                last = j;
                while (j < len && isWindowsSeparator(path.charCodeAt(j))) {
                    j += 1;
                }
                if (j < len && j !== last) {
                    last = j;
                    while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                        j += 1;
                    }
                    return j;
                }
            }
            return 0;
        }
        return 1;
    }
    if (isWindowsDeviceRoot(first) && len > 1 && path.charCodeAt(1) === CHAR_COLON) {
        if (len > 2 && isWindowsSeparator(path.charCodeAt(2))) {
            return 3;
        }
        return 2;
    }
    return 0;
}
function win32Basename(path, ext) {
    if (ext !== undefined && typeof ext !== 'string') {
        throw new TypeError('"ext" argument must be a string');
    }
    assertPath(path);
    // 根本身没有 basename（Node: basename('C:') === ''）
    const rootEnd = win32RootEnd(path);
    let start = 0;
    let end = -1;
    let matchedSlash = true;
    let i;
    if (ext !== undefined && ext.length > 0 && ext.length <= path.length) {
        if (ext.length === path.length && ext === path) {
            return '';
        }
        let extIdx = ext.length - 1;
        let firstNonSlashEnd = -1;
        for (i = path.length - 1; i >= 0; i -= 1) {
            const code = path.charCodeAt(i);
            if (isWindowsSeparator(code)) {
                if (!matchedSlash) {
                    start = i + 1;
                    break;
                }
            }
            else {
                if (firstNonSlashEnd === -1) {
                    matchedSlash = false;
                    firstNonSlashEnd = i + 1;
                }
                if (extIdx >= 0) {
                    if (code === ext.charCodeAt(extIdx)) {
                        extIdx -= 1;
                        if (extIdx === -1) {
                            end = i;
                        }
                    }
                    else {
                        extIdx = -1;
                        end = firstNonSlashEnd;
                    }
                }
            }
        }
        if (start === end) {
            end = firstNonSlashEnd;
        }
        else if (end === -1) {
            end = path.length;
        }
        return path.slice(start < rootEnd ? rootEnd : start, end);
    }
    for (i = path.length - 1; i >= 0; i -= 1) {
        if (isWindowsSeparator(path.charCodeAt(i))) {
            if (!matchedSlash) {
                start = i + 1;
                break;
            }
        }
        else if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
    }
    if (end === -1) {
        return '';
    }
    return path.slice(start < rootEnd ? rootEnd : start, end);
}
function win32Extname(path) {
    assertPath(path);
    let startDot = -1;
    let startPart = 0;
    let end = -1;
    let matchedSlash = true;
    let preDotState = 0;
    for (let i = path.length - 1; i >= 0; i -= 1) {
        const code = path.charCodeAt(i);
        if (isWindowsSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === CHAR_DOT) {
            if (startDot === -1) {
                startDot = i;
            }
            else if (preDotState !== 1) {
                preDotState = 1;
            }
        }
        else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (startDot === -1 ||
        end === -1 ||
        preDotState === 0 ||
        (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) {
        return '';
    }
    return path.slice(startDot, end);
}
function win32Format(pathObject) {
    if (pathObject === null || typeof pathObject !== 'object') {
        throw new TypeError('The "pathObject" argument must be of type object. Received type ' + typeof pathObject);
    }
    const dir = pathObject.dir ?? pathObject.root;
    const base = pathObject.base ?? (pathObject.name ?? '') + (pathObject.ext ?? '');
    if (dir === undefined || dir.length === 0) {
        return base;
    }
    if (dir === pathObject.root) {
        return dir + base;
    }
    return dir + '\\' + base;
}
function win32Parse(path) {
    assertPath(path);
    const ret = { root: '', dir: '', base: '', ext: '', name: '' };
    if (path.length === 0) {
        return ret;
    }
    const len = path.length;
    let rootEnd = 0;
    const firstCode = path.charCodeAt(0);
    let isAbsolute = false;
    if (len === 1) {
        if (isWindowsSeparator(firstCode)) {
            ret.root = ret.dir = path;
            return ret;
        }
        ret.base = ret.name = path;
        return ret;
    }
    if (isWindowsSeparator(firstCode)) {
        isAbsolute = true;
        if (isWindowsSeparator(path.charCodeAt(1))) {
            let j = 2;
            let last = j;
            while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                j += 1;
            }
            if (j < len && j !== last) {
                last = j;
                while (j < len && isWindowsSeparator(path.charCodeAt(j))) {
                    j += 1;
                }
                if (j < len && j !== last) {
                    last = j;
                    while (j < len && !isWindowsSeparator(path.charCodeAt(j))) {
                        j += 1;
                    }
                    if (j === len || j !== last) {
                        rootEnd = j;
                    }
                }
            }
        }
        else {
            rootEnd = 1;
        }
    }
    else if (isWindowsDeviceRoot(firstCode) && len > 1 && path.charCodeAt(1) === CHAR_COLON) {
        rootEnd = 2;
        if (len > 2 && isWindowsSeparator(path.charCodeAt(2))) {
            isAbsolute = true;
            rootEnd = 3;
        }
    }
    if (rootEnd > 0) {
        ret.root = path.slice(0, rootEnd);
    }
    let startDot = -1;
    let startPart = rootEnd;
    let end = -1;
    let matchedSlash = true;
    let i = path.length - 1;
    let preDotState = 0;
    for (; i >= rootEnd; i -= 1) {
        const code = path.charCodeAt(i);
        if (isWindowsSeparator(code)) {
            if (!matchedSlash) {
                startPart = i + 1;
                break;
            }
            continue;
        }
        if (end === -1) {
            matchedSlash = false;
            end = i + 1;
        }
        if (code === CHAR_DOT) {
            if (startDot === -1) {
                startDot = i;
            }
            else if (preDotState !== 1) {
                preDotState = 1;
            }
        }
        else if (startDot !== -1) {
            preDotState = -1;
        }
    }
    if (end !== -1) {
        const sliceStart = startPart === 0 && isAbsolute ? 1 : startPart;
        if (startDot === -1 ||
            preDotState === 0 ||
            (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)) {
            ret.base = ret.name = path.slice(sliceStart, end);
        }
        else {
            ret.name = path.slice(sliceStart, startDot);
            ret.base = path.slice(sliceStart, end);
            ret.ext = path.slice(startDot, end);
        }
    }
    if (startPart > 0 && startPart !== rootEnd) {
        ret.dir = path.slice(0, startPart - 1);
    }
    else if (rootEnd > 0) {
        ret.dir = ret.root;
    }
    return ret;
}
function win32ToNamespacedPath(path) {
    if (typeof path !== 'string' || path.length === 0) {
        return path;
    }
    const resolvedPath = win32Resolve(path);
    if (resolvedPath.length >= 2) {
        if (resolvedPath.charCodeAt(0) === CHAR_BACKWARD_SLASH) {
            if (resolvedPath.charCodeAt(1) === CHAR_BACKWARD_SLASH) {
                const code = resolvedPath.charCodeAt(2);
                if (code !== 63 && code !== 46) {
                    return '\\\\?\\UNC\\' + resolvedPath.slice(2);
                }
            }
        }
        else if (isWindowsDeviceRoot(resolvedPath.charCodeAt(0)) &&
            resolvedPath.charCodeAt(1) === CHAR_COLON &&
            resolvedPath.charCodeAt(2) === CHAR_BACKWARD_SLASH) {
            return '\\\\?\\' + resolvedPath;
        }
    }
    return resolvedPath;
}
const posix = {
    resolve: posixResolve,
    normalize: posixNormalize,
    isAbsolute: posixIsAbsolute,
    join: posixJoin,
    relative: posixRelative,
    toNamespacedPath: posixToNamespacedPath,
    dirname: posixDirname,
    basename: posixBasename,
    extname: posixExtname,
    format: posixFormat,
    parse: posixParse,
    sep: '/',
    delimiter: ':',
    win32: undefined,
    posix: undefined
};
const win32 = {
    resolve: win32Resolve,
    normalize: win32Normalize,
    isAbsolute: win32IsAbsolute,
    join: win32Join,
    relative: win32Relative,
    toNamespacedPath: win32ToNamespacedPath,
    dirname: win32Dirname,
    basename: win32Basename,
    extname: win32Extname,
    format: win32Format,
    parse: win32Parse,
    sep: '\\',
    delimiter: ';',
    win32: undefined,
    posix: undefined
};
posix.win32 = win32;
posix.posix = posix;
win32.win32 = win32;
win32.posix = posix;
module.exports = posix;
