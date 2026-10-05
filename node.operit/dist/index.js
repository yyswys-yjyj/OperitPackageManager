'use strict';
/**
 * 聚合入口（糖）。
 *
 * 正式契约是"一个 Node 内置名 = 一个子路径"，见 BUILTINS.json；
 * 本文件只把已实现的模块聚合成一个对象，方便手写代码时少写几行 require。
 *
 * 用法：
 *     const onj = require('<项目>/node_modules/@serveryyswys/node.operit/index.js');
 *     onj.path.join('a', 'b');
 *
 * 注意：stream 不在聚合里，因为它以类形式 `export =` 导出（`require('.../stream')` 返回
 * Stream 类本身），无法在 .d.ts 里被"命名"，加进来会让本文件的声明生成失败。
 * 需要它请直接引子路径。
 */
const pathModule = require("./path");
const fsModule = require("./fs");
const bufferModule = require("./buffer");
const osModule = require("./os");
const processModule = require("./process");
const cryptoModule = require("./crypto");
const zlibModule = require("./zlib");
const childProcessModule = require("./child_process");
const urlModule = require("./url");
const timersModule = require("./timers");
const timersPromisesModule = require("./timers/promises");
const perfHooksModule = require("./perf_hooks");
const constantsModule = require("./constants");
const moduleModule = require("./module");
const ttyModule = require("./tty");
const httpModule = require("./http");
const httpsModule = require("./https");
const dnsModule = require("./dns");
const dnsPromisesModule = require("./dns/promises");
const api = {
    version: '0.1.0',
    path: pathModule,
    fs: fsModule,
    buffer: bufferModule,
    os: osModule,
    process: processModule,
    crypto: cryptoModule,
    zlib: zlibModule,
    child_process: childProcessModule,
    url: urlModule,
    timers: timersModule,
    'timers/promises': timersPromisesModule,
    perf_hooks: perfHooksModule,
    constants: constantsModule,
    module: moduleModule,
    tty: ttyModule,
    http: httpModule,
    https: httpsModule,
    dns: dnsModule,
    'dns/promises': dnsPromisesModule
};
module.exports = api;
