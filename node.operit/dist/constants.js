'use strict';
/**
 * constants 模块（Node 的遗留模块）。
 *
 * Node 把它做成 fs / crypto / os / zlib 四处常量的合并，并且把 os.constants 的
 * signals / errno / priority 摊平到顶层（所以 require('constants').EACCES 是 13）。
 * 这里照做。
 *
 * 注意平台：给出的是 **Linux/Android** 的数值，与 Node 在 Windows 上给的那一套
 * （WSA* 等）不同。本库面向前者。
 */
const fsModule = require("./fs");
const osModule = require("./os");
const zlibModule = require("./zlib");
const cryptoModule = require("./crypto");
const osConstants = osModule.constants;
// 类型写成 Record<string, number>：直接导出合并结果会让 .d.ts 引用各处不可命名的推断类型
const constants = Object.assign({}, fsModule.constants, cryptoModule.constants, zlibModule.constants, osConstants.signals, osConstants.errno, osConstants.priority, osConstants.dlopen, { UV_UDP_REUSEADDR: osConstants.UV_UDP_REUSEADDR });
module.exports = constants;
