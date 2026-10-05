'use strict';
/**
 * `assert/strict` 子路径入口：与 `require('assert').strict` 是同一个对象。
 * 它的 equal 等同 strictEqual，deepEqual 等同 deepStrictEqual。
 */
const assertModule = require("../assert");
module.exports = assertModule.strict;
