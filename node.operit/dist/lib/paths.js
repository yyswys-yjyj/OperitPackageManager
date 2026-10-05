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
exports.pluginConfigDir = pluginConfigDir;
exports.packageName = packageName;
exports.downloadDir = downloadDir;
exports.cleanOnExitDir = cleanOnExitDir;
exports.appContext = appContext;
exports.filesDir = filesDir;
exports.cacheDir = cacheDir;
/**
 * 运行时路径根的来源。只使用 Operit 已经声明的全局与本库的 bridge 层。
 *
 * 公开面（Operit 的 types/index.d.ts 已声明）：
 *   getPluginConfigDir(id) -> /sdcard/Download/Operit/plugins/<id>
 *   OPERIT_DOWNLOAD_DIR / OPERIT_CLEAN_ON_EXIT_DIR
 * 内部面（源码里真实存在、d.ts 未声明）：
 *   getPluginConfigDir('') 会回落到当前 call 的包名 —— packageName() 依赖这一行为。
 *   该依赖集中在本模块，若将来失效只需改这一处。
 */
const pathModule = require("../path");
const bridge = __importStar(require("./bridge"));
const errors_1 = require("./errors");
function resolvePluginConfigDir(packageId) {
    if (typeof getPluginConfigDir !== 'function') {
        throw (0, errors_1.onjError)('ONJ_MISSING_HOST', '全局 getPluginConfigDir 不可用。');
    }
    const dir = getPluginConfigDir(packageId);
    if (typeof dir !== 'string' || dir.length === 0) {
        throw (0, errors_1.onjError)('ONJ_MISSING_HOST', 'getPluginConfigDir(' + (packageId.length > 0 ? packageId : '<当前包>') + ') 返回空。');
    }
    return dir;
}
function pluginConfigDir(packageId) {
    return resolvePluginConfigDir(packageId === undefined ? '' : String(packageId));
}
let cachedPackageName = null;
/** 当前包名：由 getPluginConfigDir('') 的返回路径反推。 */
function packageName() {
    if (cachedPackageName === null) {
        cachedPackageName = pathModule.basename(pluginConfigDir());
    }
    return cachedPackageName;
}
function downloadDir() {
    if (typeof OPERIT_DOWNLOAD_DIR === 'string' && OPERIT_DOWNLOAD_DIR.length > 0) {
        return OPERIT_DOWNLOAD_DIR;
    }
    throw (0, errors_1.onjError)('ONJ_MISSING_HOST', '全局 OPERIT_DOWNLOAD_DIR 不可用。');
}
function cleanOnExitDir() {
    if (typeof OPERIT_CLEAN_ON_EXIT_DIR === 'string' && OPERIT_CLEAN_ON_EXIT_DIR.length > 0) {
        return OPERIT_CLEAN_ON_EXIT_DIR;
    }
    throw (0, errors_1.onjError)('ONJ_MISSING_HOST', '全局 OPERIT_CLEAN_ON_EXIT_DIR 不可用。');
}
function appContext() {
    return bridge.getApplicationContext();
}
function contextDir(methodName) {
    const context = bridge.getApplicationContext();
    const dir = bridge.callInstance(context, methodName, []);
    const absolute = bridge.callInstance(dir, 'getAbsolutePath', []);
    if (typeof absolute !== 'string' || absolute.length === 0) {
        throw (0, errors_1.onjError)('ONJ_BRIDGE_PROTOCOL', 'Context.' + methodName + '() 未返回可用路径。');
    }
    return absolute;
}
function filesDir() {
    return contextDir('getFilesDir');
}
function cacheDir() {
    return contextDir('getCacheDir');
}
