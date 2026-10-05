'use strict';
/**
 * `path/posix` 子路径入口（Node 亦提供 `require('path/posix')`）。
 * 这里只是把 path.ts 里的 posix 那一份单独暴露出来。
 */
const pathModule = require("../path");
module.exports = pathModule.posix;
