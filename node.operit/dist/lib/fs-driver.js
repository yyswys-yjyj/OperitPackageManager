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
exports.setDriver = setDriver;
exports.getDriver = getDriver;
exports.createJavaDriver = createJavaDriver;
/**
 * fs 的宿主驱动层：把"文件系统原语"与"Node 语义"分开。
 *
 * fs.ts 只做 Node 语义（选项解析、错误码、返回值形状），所有真正的 I/O 都走本接口。
 * 这样：
 *   - 桌面测试可以注入一个基于 Node fs 的驱动，从而**把 fs.ts 的语义与 Node 对拍**；
 *   - Java 相关的假设全部收敛在 createJavaDriver() 里，真机验证只需针对这一处。
 *
 * 驱动抛出的错误是 bridge 的中间态 Java 错误（带 code），由 fs.ts 补 syscall / path。
 */
const bridge = __importStar(require("./bridge"));
const errors_1 = require("./errors");
const bytesCodec = __importStar(require("./bytes"));
let driver = null;
/** 宿主注入点：桌面测试用，传 null 恢复为 Operit Java 驱动。 */
function setDriver(next) {
    driver = next;
}
function getDriver() {
    if (driver === null) {
        driver = createJavaDriver();
    }
    return driver;
}
// ------------------------------------------------------------------ Java 实现
const DEFAULT_MODE_FILE = 0o666;
const DEFAULT_MODE_DIR = 0o777;
/**
 * 基于 java.io.File / java.nio.file.Files / java.io.RandomAccessFile 的驱动。
 *
 * 通道选择（对应 DESIGN.md §6.3）：
 *   - 读：Files.readAllBytes(Path) 返回 byte[]，bridge 会展开成 JSON 数字数组，直接用
 *   - 写：RandomAccessFile.writeBytes(String) 写每个字符的低 8 位 —— 正好是 latin1 通道，
 *         避免了"把 JS 数组当 byte[] 参数传进去"这类未验证行为
 *
 * 已知近似（真机验证时要确认）：
 *   - atime / ctime / birthtime 都取 lastModified
 *   - mode 按类型给默认值，不反映真实权限位
 *   - readdir 不区分符号链接
 */
function createJavaDriver() {
    function fileOf(target) {
        return bridge.newInstance('java.io.File', [target]);
    }
    function pathOf(target) {
        return bridge.callInstance(fileOf(target), 'toPath', []);
    }
    function callFile(target, method, args = []) {
        return bridge.callInstance(fileOf(target), method, args);
    }
    function readAllBytes(target) {
        const raw = bridge.callStatic('java.nio.file.Files', 'readAllBytes', [pathOf(target)]);
        if (!Array.isArray(raw)) {
            throw (0, errors_1.createError)('EIO', 'read');
        }
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i += 1) {
            out[i] = raw[i] & 255;
        }
        return out;
    }
    function writeAllBytes(target, data, append, exclusive) {
        if (exclusive && callFile(target, 'exists')) {
            throw (0, errors_1.javaError)('java.nio.file.FileAlreadyExistsException: ' + target);
        }
        const handle = bridge.newInstance('java.io.RandomAccessFile', [target, 'rw']);
        try {
            if (append) {
                bridge.callInstance(handle, 'seek', [bridge.callInstance(handle, 'length', [])]);
            }
            else {
                bridge.callInstance(handle, 'setLength', [0]);
            }
            bridge.callInstance(handle, 'writeBytes', [bytesCodec.bytesToLatin1(data)]);
        }
        finally {
            bridge.callInstance(handle, 'close', []);
        }
    }
    function describe(target, followLinks) {
        if (!callFile(target, 'exists')) {
            throw (0, errors_1.javaError)('java.io.FileNotFoundException: ' + target);
        }
        const isLink = followLinks ? false : bridge.normalizeBoolean(bridge.callStatic('java.nio.file.Files', 'isSymbolicLink', [pathOf(target)]));
        const isDirectory = bridge.normalizeBoolean(callFile(target, 'isDirectory'));
        const isFile = bridge.normalizeBoolean(callFile(target, 'isFile'));
        const size = Number(callFile(target, 'length')) || 0;
        const modified = Number(callFile(target, 'lastModified')) || 0;
        return {
            isFile: isFile,
            isDirectory: isDirectory,
            isSymbolicLink: isLink,
            size: isFile ? size : 0,
            mode: isDirectory ? DEFAULT_MODE_DIR : DEFAULT_MODE_FILE,
            atimeMs: modified,
            mtimeMs: modified,
            ctimeMs: modified,
            birthtimeMs: modified
        };
    }
    function removeRecursive(target) {
        const handle = fileOf(target);
        if (!bridge.normalizeBoolean(bridge.callInstance(handle, 'exists', []))) {
            return;
        }
        if (bridge.normalizeBoolean(bridge.callInstance(handle, 'isDirectory', []))) {
            const children = bridge.callInstance(handle, 'listFiles', []);
            if (Array.isArray(children)) {
                for (let i = 0; i < children.length; i += 1) {
                    removeRecursive(String(bridge.callInstance(children[i], 'getAbsolutePath', [])));
                }
            }
        }
        bridge.callInstance(handle, 'delete', []);
    }
    /**
     * fd 句柄基于 java.io.RandomAccessFile：
     *   - 读：FileChannel.read(ByteBuffer, position) —— ByteBuffer.array() 能把数据**返回**出来，
     *     避免"把 byte[] 当参数传进去、靠 Java 原地修改"这种在 bridge 上不可见的行为；
     *   - 写：seek + writeBytes(String)，写每个字符的低 8 位，正好是 latin1 通道。
     */
    function openHandle(target, options) {
        if (options.exclusive && bridge.normalizeBoolean(callFile(target, 'exists'))) {
            throw (0, errors_1.javaError)('java.nio.file.FileAlreadyExistsException: ' + target);
        }
        const handle = bridge.newInstance('java.io.RandomAccessFile', [target, options.writable ? 'rw' : 'r']);
        const channel = bridge.callInstance(handle, 'getChannel', []);
        if (options.truncate) {
            bridge.callInstance(handle, 'setLength', [0]);
        }
        if (options.append) {
            bridge.callInstance(handle, 'seek', [bridge.callInstance(handle, 'length', [])]);
        }
        return {
            read(position, length) {
                if (length <= 0) {
                    return new Uint8Array(0);
                }
                const buffer = bridge.callStatic('java.nio.ByteBuffer', 'allocate', [length]);
                const start = position === null
                    ? Number(bridge.callInstance(handle, 'getFilePointer', []))
                    : position;
                const count = Number(bridge.callInstance(channel, 'read', [buffer, start]));
                if (position === null) {
                    bridge.callInstance(handle, 'seek', [start + (isFinite(count) ? count : 0)]);
                }
                if (!isFinite(count) || count <= 0) {
                    return new Uint8Array(0);
                }
                const raw = bridge.callInstance(buffer, 'array', []);
                if (!Array.isArray(raw)) {
                    return new Uint8Array(0);
                }
                const usable = Math.min(count, raw.length);
                const out = new Uint8Array(usable);
                for (let i = 0; i < usable; i += 1) {
                    out[i] = raw[i] & 255;
                }
                return out;
            },
            write(position, data) {
                const pointer = Number(bridge.callInstance(handle, 'getFilePointer', []));
                const start = position === null ? pointer : position;
                bridge.callInstance(handle, 'seek', [start]);
                bridge.callInstance(handle, 'writeBytes', [bytesCodec.bytesToLatin1(data)]);
                const advanced = Number(bridge.callInstance(handle, 'getFilePointer', []));
                if (position !== null) {
                    // Node 语义：带 position 的写不改变文件位置
                    bridge.callInstance(handle, 'seek', [pointer]);
                }
                return advanced - start;
            },
            size() {
                return Number(bridge.callInstance(handle, 'length', [])) || 0;
            },
            truncate(length) {
                bridge.callInstance(handle, 'setLength', [length]);
            },
            sync() {
                bridge.callInstance(bridge.callInstance(handle, 'getFD', []), 'sync', []);
            },
            close() {
                bridge.callInstance(handle, 'close', []);
            }
        };
    }
    return {
        openHandle: openHandle,
        stat(target, followLinks) {
            return describe(target, followLinks);
        },
        exists(target) {
            return bridge.normalizeBoolean(callFile(target, 'exists'));
        },
        readdir(target) {
            if (!bridge.normalizeBoolean(callFile(target, 'isDirectory'))) {
                if (callFile(target, 'exists')) {
                    throw (0, errors_1.javaError)('java.nio.file.NotDirectoryException: ' + target);
                }
                throw (0, errors_1.javaError)('java.io.FileNotFoundException: ' + target);
            }
            const children = callFile(target, 'listFiles');
            if (!Array.isArray(children)) {
                return [];
            }
            const out = [];
            for (let i = 0; i < children.length; i += 1) {
                const child = children[i];
                out.push({
                    name: String(bridge.callInstance(child, 'getName', [])),
                    isFile: bridge.normalizeBoolean(bridge.callInstance(child, 'isFile', [])),
                    isDirectory: bridge.normalizeBoolean(bridge.callInstance(child, 'isDirectory', [])),
                    isSymbolicLink: false
                });
            }
            return out;
        },
        readFileBytes(target) {
            return readAllBytes(target);
        },
        writeFileBytes(target, data, append, exclusive) {
            writeAllBytes(target, data, append, exclusive);
        },
        mkdir(target, recursive) {
            if (recursive) {
                const parent = bridge.callInstance(fileOf(target), 'getParent', []);
                const created = bridge.normalizeBoolean(callFile(target, 'mkdirs'));
                if (!created && !callFile(target, 'isDirectory')) {
                    throw (0, errors_1.javaError)('java.io.IOException: Cannot create directory ' + target);
                }
                return created ? (typeof parent === 'string' ? target : target) : undefined;
            }
            const ok = bridge.normalizeBoolean(callFile(target, 'mkdir'));
            if (!ok) {
                if (callFile(target, 'exists')) {
                    throw (0, errors_1.javaError)('java.nio.file.FileAlreadyExistsException: ' + target);
                }
                throw (0, errors_1.javaError)('java.io.IOException: Cannot create directory ' + target);
            }
            return undefined;
        },
        remove(target, recursive, force) {
            const handle = fileOf(target);
            if (!bridge.normalizeBoolean(bridge.callInstance(handle, 'exists', []))) {
                if (force) {
                    return;
                }
                throw (0, errors_1.javaError)('java.io.FileNotFoundException: ' + target);
            }
            const isDirectory = bridge.normalizeBoolean(bridge.callInstance(handle, 'isDirectory', []));
            if (isDirectory && !recursive) {
                const children = bridge.callInstance(handle, 'listFiles', []);
                if (Array.isArray(children) && children.length > 0) {
                    throw (0, errors_1.javaError)('java.nio.file.DirectoryNotEmptyException: ' + target);
                }
            }
            if (isDirectory && recursive) {
                removeRecursive(target);
                return;
            }
            bridge.callInstance(handle, 'delete', []);
        },
        rename(from, to) {
            const moved = bridge.normalizeBoolean(bridge.callInstance(fileOf(from), 'renameTo', [fileOf(to)]));
            if (!moved) {
                throw (0, errors_1.javaError)('java.io.IOException: Cannot rename ' + from + ' to ' + to);
            }
        },
        copyFile(from, to) {
            writeAllBytes(to, readAllBytes(from), false, false);
        },
        realpath(target) {
            const resolved = callFile(target, 'getCanonicalPath');
            if (typeof resolved !== 'string' || resolved.length === 0) {
                throw (0, errors_1.javaError)('java.io.FileNotFoundException: ' + target);
            }
            return resolved;
        },
        readlink(target) {
            const resolved = bridge.callStatic('java.nio.file.Files', 'readSymbolicLink', [pathOf(target)]);
            return String(bridge.callInstance(resolved, 'toString', []));
        },
        symlink(target, linkPath) {
            bridge.callStatic('java.nio.file.Files', 'createSymbolicLink', [pathOf(linkPath), pathOf(target)]);
        },
        chmod(target, mode) {
            callFile(target, 'setReadable', [(mode & 0o444) !== 0, false]);
            callFile(target, 'setWritable', [(mode & 0o222) !== 0, false]);
            callFile(target, 'setExecutable', [(mode & 0o111) !== 0, false]);
        },
        truncate(target, length) {
            const handle = bridge.newInstance('java.io.RandomAccessFile', [target, 'rw']);
            try {
                bridge.callInstance(handle, 'setLength', [length]);
            }
            finally {
                bridge.callInstance(handle, 'close', []);
            }
        },
        utimes(target, atimeMs, mtimeMs) {
            const ok = bridge.normalizeBoolean(callFile(target, 'setLastModified', [mtimeMs]));
            if (!ok) {
                throw (0, errors_1.javaError)('java.io.IOException: Cannot set times on ' + target);
            }
        },
        mkdtemp(prefix) {
            for (let attempt = 0; attempt < 64; attempt += 1) {
                const candidate = prefix + randomSuffix();
                if (!bridge.normalizeBoolean(callFile(candidate, 'exists'))) {
                    if (bridge.normalizeBoolean(callFile(candidate, 'mkdir'))) {
                        return candidate;
                    }
                }
            }
            throw (0, errors_1.javaError)('java.io.IOException: Cannot create temp directory under ' + prefix);
        }
    };
}
const SUFFIX_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
function randomSuffix() {
    let out = '';
    for (let i = 0; i < 6; i += 1) {
        out += SUFFIX_ALPHABET.charAt(Math.floor(Math.random() * SUFFIX_ALPHABET.length));
    }
    return out;
}
