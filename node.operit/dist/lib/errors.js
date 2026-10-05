'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.ERRNO = void 0;
exports.createError = createError;
exports.onjError = onjError;
exports.parseJavaError = parseJavaError;
exports.codeForJavaException = codeForJavaException;
exports.javaError = javaError;
exports.withContext = withContext;
/**
 * Node 错误码与 Java 异常之间的唯一翻译层。
 *
 * 设计约束：
 * - 每个错误对象都必须带 code。三方库普遍靠 code 分支（fs.existsSync、mkdirp、tar 等），
 *   没有 code 的实现等于跑不通。
 * - Java 侧异常类名来自 bridge 的错误文本前缀，形如 "java.io.FileNotFoundException: /x"。
 * - 未归类的 Java 异常一律映射为 EIO，并把原始类名与消息写进 message —— 这是明确定义的行为，
 *   Node 自己的 fs 在无法归类的系统错误上也报 EIO。
 */
/** 与 Linux errno 对齐，供依赖 errno 数值的三方库使用。 */
exports.ERRNO = {
    EPERM: -1,
    ENOENT: -2,
    ESRCH: -3,
    EINTR: -4,
    EIO: -5,
    ENXIO: -6,
    E2BIG: -7,
    ENOEXEC: -8,
    EBADF: -9,
    ECHILD: -10,
    EAGAIN: -11,
    EWOULDBLOCK: -11,
    ENOMEM: -12,
    EACCES: -13,
    EFAULT: -14,
    ENOTBLK: -15,
    EBUSY: -16,
    EEXIST: -17,
    EXDEV: -18,
    ENODEV: -19,
    ENOTDIR: -20,
    EISDIR: -21,
    EINVAL: -22,
    ENFILE: -23,
    EMFILE: -24,
    ENOTTY: -25,
    ETXTBSY: -26,
    EFBIG: -27,
    ENOSPC: -28,
    ESPIPE: -29,
    EROFS: -30,
    EMLINK: -31,
    EPIPE: -32,
    EDOM: -33,
    ERANGE: -34,
    EDEADLK: -35,
    EDEADLOCK: -35,
    ENAMETOOLONG: -36,
    ENOLCK: -37,
    ENOSYS: -38,
    ENOTEMPTY: -39,
    ELOOP: -40,
    ENOMSG: -42,
    EIDRM: -43,
    ECHRNG: -44,
    EL2NSYNC: -45,
    EL3HLT: -46,
    EL3RST: -47,
    ELNRNG: -48,
    EUNATCH: -49,
    ENOCSI: -50,
    EL2HLT: -51,
    EBADE: -52,
    EBADR: -53,
    EXFULL: -54,
    ENOANO: -55,
    EBADRQC: -56,
    EBADSLT: -57,
    EBFONT: -59,
    ENOSTR: -60,
    ENODATA: -61,
    ETIME: -62,
    ENOSR: -63,
    ENONET: -64,
    ENOPKG: -65,
    EREMOTE: -66,
    ENOLINK: -67,
    EADV: -68,
    ESRMNT: -69,
    ECOMM: -70,
    EPROTO: -71,
    EMULTIHOP: -72,
    EDOTDOT: -73,
    EBADMSG: -74,
    EOVERFLOW: -75,
    ENOTUNIQ: -76,
    EBADFD: -77,
    EREMCHG: -78,
    ELIBACC: -79,
    ELIBBAD: -80,
    ELIBSCN: -81,
    ELIBMAX: -82,
    ELIBEXEC: -83,
    EILSEQ: -84,
    ERESTART: -85,
    ESTRPIPE: -86,
    EUSERS: -87,
    ENOTSOCK: -88,
    EDESTADDRREQ: -89,
    EMSGSIZE: -90,
    EPROTOTYPE: -91,
    ENOPROTOOPT: -92,
    EPROTONOSUPPORT: -93,
    ESOCKTNOSUPPORT: -94,
    EOPNOTSUPP: -95,
    ENOTSUP: -95,
    EPFNOSUPPORT: -96,
    EAFNOSUPPORT: -97,
    EADDRINUSE: -98,
    EADDRNOTAVAIL: -99,
    ENETDOWN: -100,
    ENETUNREACH: -101,
    ENETRESET: -102,
    ECONNABORTED: -103,
    ECONNRESET: -104,
    ENOBUFS: -105,
    EISCONN: -106,
    ENOTCONN: -107,
    ESHUTDOWN: -108,
    ETOOMANYREFS: -109,
    ETIMEDOUT: -110,
    ECONNREFUSED: -111,
    EHOSTDOWN: -112,
    EHOSTUNREACH: -113,
    EALREADY: -114,
    EINPROGRESS: -115,
    ESTALE: -116,
    EUCLEAN: -117,
    ENOTNAM: -118,
    ENAVAIL: -119,
    EISNAM: -120,
    EREMOTEIO: -121,
    EDQUOT: -122,
    ENOMEDIUM: -123,
    EMEDIUMTYPE: -124,
    ECANCELED: -125,
    ENOKEY: -126,
    EKEYEXPIRED: -127,
    EKEYREVOKED: -128,
    EKEYREJECTED: -129,
    EOWNERDEAD: -130,
    ENOTRECOVERABLE: -131,
    ERFKILL: -132,
    EHWPOISON: -133
};
const MESSAGES = {
    EPERM: 'operation not permitted',
    ENOENT: 'no such file or directory',
    ESRCH: 'no such process',
    EINTR: 'interrupted system call',
    EIO: 'input/output error',
    ENXIO: 'no such device or address',
    E2BIG: 'argument list too long',
    ENOEXEC: 'exec format error',
    EBADF: 'bad file descriptor',
    ECHILD: 'no child processes',
    EAGAIN: 'resource temporarily unavailable',
    EWOULDBLOCK: 'resource temporarily unavailable',
    ENOMEM: 'cannot allocate memory',
    EACCES: 'permission denied',
    EFAULT: 'bad address',
    ENOTBLK: 'block device required',
    EBUSY: 'device or resource busy',
    EEXIST: 'file already exists',
    EXDEV: 'invalid cross-device link',
    ENODEV: 'no such device',
    ENOTDIR: 'not a directory',
    EISDIR: 'is a directory',
    EINVAL: 'invalid argument',
    ENFILE: 'too many open files in system',
    EMFILE: 'too many open files',
    ENOTTY: 'inappropriate ioctl for device',
    ETXTBSY: 'text file busy',
    EFBIG: 'file too large',
    ENOSPC: 'no space left on device',
    ESPIPE: 'illegal seek',
    EROFS: 'read-only file system',
    EMLINK: 'too many links',
    EPIPE: 'broken pipe',
    EDOM: 'numerical argument out of domain',
    ERANGE: 'numerical result out of range',
    EDEADLK: 'resource deadlock avoided',
    EDEADLOCK: 'resource deadlock avoided',
    ENAMETOOLONG: 'file name too long',
    ENOLCK: 'no locks available',
    ENOSYS: 'function not implemented',
    ENOTEMPTY: 'directory not empty',
    ELOOP: 'too many levels of symbolic links',
    ENOMSG: 'no message of desired type',
    EIDRM: 'identifier removed',
    ECHRNG: 'channel number out of range',
    EL2NSYNC: 'level 2 not synchronized',
    EL3HLT: 'level 3 halted',
    EL3RST: 'level 3 reset',
    ELNRNG: 'link number out of range',
    EUNATCH: 'protocol driver not attached',
    ENOCSI: 'no CSI structure available',
    EL2HLT: 'level 2 halted',
    EBADE: 'invalid exchange',
    EBADR: 'invalid request descriptor',
    EXFULL: 'exchange full',
    ENOANO: 'no anode',
    EBADRQC: 'invalid request code',
    EBADSLT: 'invalid slot',
    EBFONT: 'bad font file format',
    ENOSTR: 'device not a stream',
    ENODATA: 'no data available',
    ETIME: 'timer expired',
    ENOSR: 'out of streams resources',
    ENONET: 'machine is not on the network',
    ENOPKG: 'package not installed',
    EREMOTE: 'object is remote',
    ENOLINK: 'link has been severed',
    EADV: 'advertise error',
    ESRMNT: 'srmount error',
    ECOMM: 'communication error on send',
    EPROTO: 'protocol error',
    EMULTIHOP: 'multihop attempted',
    EDOTDOT: 'RFS specific error',
    EBADMSG: 'bad message',
    EOVERFLOW: 'value too large for defined data type',
    ENOTUNIQ: 'name not unique on network',
    EBADFD: 'file descriptor in bad state',
    EREMCHG: 'remote address changed',
    ELIBACC: 'can not access a needed shared library',
    ELIBBAD: 'accessing a corrupted shared library',
    ELIBSCN: '.lib section in a.out corrupted',
    ELIBMAX: 'attempting to link in too many shared libraries',
    ELIBEXEC: 'cannot exec a shared library directly',
    EILSEQ: 'invalid or incomplete multibyte or wide character',
    ERESTART: 'interrupted system call should be restarted',
    ESTRPIPE: 'streams pipe error',
    EUSERS: 'too many users',
    ENOTSOCK: 'socket operation on non-socket',
    EDESTADDRREQ: 'destination address required',
    EMSGSIZE: 'message too long',
    EPROTOTYPE: 'protocol wrong type for socket',
    ENOPROTOOPT: 'protocol not available',
    EPROTONOSUPPORT: 'protocol not supported',
    ESOCKTNOSUPPORT: 'socket type not supported',
    EOPNOTSUPP: 'operation not supported',
    ENOTSUP: 'operation not supported',
    EPFNOSUPPORT: 'protocol family not supported',
    EAFNOSUPPORT: 'address family not supported by protocol',
    EADDRINUSE: 'address already in use',
    EADDRNOTAVAIL: 'cannot assign requested address',
    ENETDOWN: 'network is down',
    ENETUNREACH: 'network is unreachable',
    ENETRESET: 'network dropped connection on reset',
    ECONNABORTED: 'software caused connection abort',
    ECONNRESET: 'connection reset by peer',
    ENOBUFS: 'no buffer space available',
    EISCONN: 'transport endpoint is already connected',
    ENOTCONN: 'transport endpoint is not connected',
    ESHUTDOWN: 'cannot send after transport endpoint shutdown',
    ETOOMANYREFS: 'too many references: cannot splice',
    ETIMEDOUT: 'connection timed out',
    ECONNREFUSED: 'connection refused',
    EHOSTDOWN: 'host is down',
    EHOSTUNREACH: 'no route to host',
    EALREADY: 'operation already in progress',
    EINPROGRESS: 'operation now in progress',
    ESTALE: 'stale file handle',
    EUCLEAN: 'structure needs cleaning',
    ENOTNAM: 'not a XENIX named type file',
    ENAVAIL: 'no XENIX semaphores available',
    EISNAM: 'is a named type file',
    EREMOTEIO: 'remote I/O error',
    EDQUOT: 'disk quota exceeded',
    ENOMEDIUM: 'no medium found',
    EMEDIUMTYPE: 'wrong medium type',
    ECANCELED: 'operation canceled',
    ENOKEY: 'required key not available',
    EKEYEXPIRED: 'key has expired',
    EKEYREVOKED: 'key has been revoked',
    EKEYREJECTED: 'key was rejected by service',
    EOWNERDEAD: 'owner died',
    ENOTRECOVERABLE: 'state not recoverable',
    ERFKILL: 'operation not possible due to RF-kill',
    EHWPOISON: 'memory page has hardware error'
};
/** node.operit 自有错误码：只描述库内部状态，不占用 POSIX 命名空间。 */
const ONJ_MESSAGE = {
    ONJ_MISSING_HOST: 'node.operit 需要在 Operit 运行时中执行（NativeInterface 不可用）。',
    ONJ_BRIDGE_PROTOCOL: 'Java bridge 返回了不符合约定的内容。',
    ONJ_UNKNOWN_ENV: 'fs 环境未注册。',
    ONJ_ENV_UNAVAILABLE: 'fs 环境的根不可用。',
    ONJ_ENV_ASYNC_SCOPE: 'fs.env.with() 的回调必须是同步的。',
    ONJ_ENV_NOT_SET: 'fs 环境未显式设置，而当前处于 strict 模式。',
    ONJ_UNSUPPORTED: '该能力在 Operit 的 QuickJS 运行时不成立。'
};
/** Java 异常类名 → Node 错误码的精确表。 */
const JAVA_CODE = {
    'java.io.FileNotFoundException': 'ENOENT',
    'java.nio.file.NoSuchFileException': 'ENOENT',
    'java.io.FileSystemException': 'EIO',
    'java.nio.file.FileSystemException': 'EIO',
    'java.nio.file.FileSystemLoopException': 'ELOOP',
    'java.nio.file.AccessDeniedException': 'EACCES',
    'java.lang.SecurityException': 'EACCES',
    'java.nio.file.FileAlreadyExistsException': 'EEXIST',
    'java.nio.file.NotDirectoryException': 'ENOTDIR',
    'java.nio.file.DirectoryNotEmptyException': 'ENOTEMPTY',
    'java.nio.file.NotLinkException': 'EINVAL',
    'java.io.EOFException': 'EIO',
    'java.io.IOException': 'EIO',
    'java.io.UnsupportedEncodingException': 'EINVAL',
    'java.lang.IllegalArgumentException': 'EINVAL',
    'java.lang.IllegalStateException': 'EINVAL',
    'java.lang.NullPointerException': 'EINVAL'
};
/** 构造一个 Node 形状的错误。syscall / path / dest 与 Node 自身的字段语义一致。 */
function createError(code, syscall, targetPath, destPath) {
    const base = MESSAGES[code] ?? 'unknown error';
    let message = code + ': ' + base + ', ' + syscall;
    if (targetPath !== undefined && targetPath !== null) {
        message += " '" + targetPath + "'";
    }
    if (destPath !== undefined && destPath !== null) {
        message += " -> '" + destPath + "'";
    }
    const err = new Error(message);
    err.code = code;
    err.errno = Object.prototype.hasOwnProperty.call(exports.ERRNO, code) ? exports.ERRNO[code] : -1;
    err.syscall = syscall;
    if (targetPath !== undefined && targetPath !== null) {
        err.path = targetPath;
    }
    if (destPath !== undefined && destPath !== null) {
        err.dest = destPath;
    }
    return err;
}
/** node.operit 内部状态错误。 */
function onjError(code, detail) {
    const base = ONJ_MESSAGE[code] ?? code;
    const message = detail !== undefined && detail.length > 0 ? base + ' ' + detail : base;
    const err = new Error('[' + code + '] ' + message);
    err.code = code;
    return err;
}
/**
 * 从 Java bridge 的错误文本里剥离异常类名。
 * 形如 "java.io.FileNotFoundException: /sdcard/x" 或 "java.lang.SecurityException"。
 */
function parseJavaError(text) {
    const source = typeof text === 'string' ? text : String(text);
    const match = /^([A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*):?\s*([\s\S]*)$/.exec(source);
    if (match === null) {
        return { className: 'java.lang.Throwable', message: source };
    }
    return {
        className: match[1],
        message: match[2].length > 0 ? match[2] : source
    };
}
/**
 * Java 异常类名 → Node 错误码。
 * 先查精确表，再按消息特征识别少数几种，仍未命中则 EIO。
 */
function codeForJavaException(className, javaMessage) {
    // 消息特征优先：java.io.IOException 是通用类，精确表只能给出 EIO，
    // 而 "No space left on device" 这类消息能给出更准确的码。
    if (/No space left on device/i.test(javaMessage)) {
        return 'ENOSPC';
    }
    if (/Read-only file system/i.test(javaMessage)) {
        return 'EROFS';
    }
    if (/Too many open files/i.test(javaMessage)) {
        return 'EMFILE';
    }
    // ProcessBuilder.start() 找不到可执行文件时是 IOException + 这段消息
    if (/No such file or directory/i.test(javaMessage)) {
        return 'ENOENT';
    }
    if (/Is a directory/i.test(javaMessage)) {
        return 'EISDIR';
    }
    if (/Not a directory/i.test(javaMessage)) {
        return 'ENOTDIR';
    }
    const exact = JAVA_CODE[className];
    if (exact !== undefined) {
        return exact;
    }
    return 'EIO';
}
/** 由 Java 错误文本构造中间态错误，保留原始类名与消息。 */
function javaError(text) {
    const parsed = parseJavaError(text);
    const err = new Error(parsed.className + ': ' + parsed.message);
    err.code = codeForJavaException(parsed.className, parsed.message);
    err.javaClass = parsed.className;
    err.javaMessage = parsed.message;
    err.isJavaError = true;
    return err;
}
/**
 * 给中间态错误补上 syscall / path，产出语义完整的 Node 错误。
 * 非 Java 错误原样返回。
 */
function withContext(err, syscall, targetPath, destPath) {
    const candidate = err;
    if (candidate === null || candidate === undefined || candidate.isJavaError !== true) {
        return err;
    }
    const out = createError(candidate.code, syscall, targetPath, destPath);
    out.cause = candidate;
    out.javaClass = candidate.javaClass;
    out.javaMessage = candidate.javaMessage;
    return out;
}
