'use strict';
/**
 * `path/win32` 子路径入口（Node 亦提供 `require('path/win32')`）。
 *
 * 注意：BUILTINS.json 把本模块标为 partial —— 冒号歧义与 UNC 根这两类边缘
 * 与 Node 存在已知偏差，详见 README「已知偏差」。Operit 平台是 android/linux，
 * 该模块主要服务于解析 Windows 路径的三方库（如打包/归档类）。
 */
const pathModule = require("../path");
module.exports = pathModule.win32;
