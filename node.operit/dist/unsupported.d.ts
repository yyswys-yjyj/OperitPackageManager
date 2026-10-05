/**
 * node.operit 对"在 Operit 运行时不成立的 Node 内置模块"的统一表达。
 *
 * 首选策略是构建期拒绝：OperitPackageManager 读到 BUILTINS.json 中 status 为 unsupported 的条目时，
 * 应当直接报构建错误，不要把问题带到运行时。
 *
 * 若选择在运行时表达，重写器应产出调用形式：
 *     require('<rel>/node_modules/@serveryyswys/node.operit/unsupported.js')('vm')
 * 这样错误信息里能带上原始模块名。直接 require 本模块只会得到下面的通用错误。
 */
declare function unsupportedNodeBuiltin(name?: string): never;
export = unsupportedNodeBuiltin;
