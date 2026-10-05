# OPM — Operit Package Manager

在 Operit 上还原 npm 生态：**装包、出包、投稿**，三合一。
纯 JS 沙盒实现（ToolPkg 形态），9 个工具。

## 定位

**给 node 项目用的 npm 客户端 + Operit 构建工具链 + 辰锤投稿客户端**。
操作目标项目的 `node_modules` / `package.json` / `package-lock.json`，与 Operit 沙盒包系统无关。

- 默认源：`https://www.serveryyswys.top/download/source/npm/`（辰锤私有 npm registry，标准协议）
- 投稿：辰锤资源中心 `resource_center` API（需 token）

## 工具

| 工具 | 作用 |
|------|------|
| `init` | 生成 `package.json` + `.npmrc`（指向私有源），自动装 `node.operit` |
| `search` | 在 registry 中按关键词搜索 |
| `install` | 装包 / 按 `package.json` 解依赖；也可装本地 `.tgz`，`global=true` 时装到 npm 全局目录 |
| `remove` | 卸载包，清理 `node_modules` / `package.json` / lockfile；`global=true` 时从 npm 全局目录卸载 |
| `manager` | 辰锤投稿客户端：覆盖 resource_center **全部 32 个 action**（查/建/传/审/发/删） |
| `build` | 把工程打成 `.toolpkg`（**TS 与纯 JS 工程都支持**） |
| `verify` | 出包前干跑校验（不产包） |
| `pack` | 把工程打成 npm 兼容的 `.tgz`（等价 `npm pack`） |
| `version` | 列出库版本：传 `project_dir` 看项目（自身/依赖/opm）；**不传则默认列 npm 全局目录** |

## 全局安装（与 npm 打通）

`install` 支持 `tgz_path` + `global=true`，把本地 `.tgz` 装进 **npm 全局目录**（Linux 侧 `/usr/lib/node_modules`）：

- 装的包与 `npm i -g` 同址，`node` 可直接 require
- `build` / `verify` 在项目 `node_modules` 找不到模块时，会**回退到 npm 全局目录**查找（自动镜像到临时影子目录再分析）
- `version` 不传 `project_dir` 直接列全局；`include_global=true` 则在项目视图里一并列出全局

## build / verify：两种模式

**自动识别**，无需手动指定：

- **TS 模式**：项目有 `tsconfig.json`（或 `src/` 下有 `.ts`）→ 先调 tsc 编译，再以编译产物为根打包
- **JS 模式**：纯 JS 工程 → 跳过编译，以项目根为根打包；项目下所有 `.js`/`.mjs`/`.cjs`（排除 `node_modules`）都会进包

**共同做的事**：

1. 计算可达种子：`manifest.main` + `manifest.subpackages[].entry` + 声明的 ui 模块
2. 顺 require 链递归收集被引用文件（可达性裁剪）
3. 裸名 require 重写为归档内显式 `.js` 相对路径（node 内建 → node.operit 子文件；npm 包 → node_modules 入口；lodash/uuid/axios 保持原样）
4. 契约拦截（planned/unsupported 内建 → 构建失败）
5. 入口注入 process/Buffer 全局
6. 只打包被引用到的 node_modules，压成 `<项目根名>.toolpkg`（放项目根上一级）

### 归档结构


`manifest.main` / `subpackages[].entry` / ui 模块是**相对项目根**的路径（如 `dist/main.js`），
归档结构**完全照 manifest 里写的路径来**，一个字符不改。TS 编译产物落在 `outDir`（如 `.opm_build/`），
读取时按「原样 → 产物目录 → 逐级剥前导段」查找磁盘文件，归档内路径始终是 manifest 视角。
因此项目结构可以「千姿百态」，manifest 里写 `dist/main.js` 还是 `main.js` 都能对上。

### 工程约定

- TS 工程里 UI 文件命名为 `xxx.ui.ts`（编译产出 `xxx.ui.js`，与 `main.ts` 的 require 对上）
- `build` 需要项目已安装 `@serveryyswys/node.operit`（项目内或 npm 全局目录均可）
- **TS 工程在 build 前必须先删除旧的编译产物目录与构建缓存目录**（如 `.opm_build/`、`dist/`、
  以及 `*.tsbuildinfo` 等），否则已编译的陈旧 `.js` 可能被一并打进包。可放在每次构建的第一步：

```bash
rm -rf .opm_build dist *.tsbuildinfo
```
- **`extra_files`**：`build`/`verify` 可传相对路径数组。条目可以是**文件**或**目录**：
  文件原样复制；目录会**递归收集**其下全部文件（保持目录结构，跳过 node_modules / 隐藏目录）。
  如 `["LICENSE", "assets"]`（assets 整目录打进包）。

## 界面

ToolPkg 工具箱内提供「OPM 设置」界面：配置 registry / token、测试源连通性、init 行为开关、一键跳转资源中心。

## 技术要点（真机验证）

- 二进制读写：`Tools.Files.readBinary` / `writeBinary`
- base64 解码：`Java.type('android.util.Base64')`
- SHA-1 / SHA-512：`Java.type('java.security.MessageDigest')`
- **tgz 解包**：`Tools.System.terminal.hiddenExec('tar -xzf ...')`（沙盒内纯 JS 逐字节解包会超时）
- **跳浏览器**：`Tools.System.intent({ action: 'android.intent.action.VIEW', uri, type: 'activity' })`
- 构建契约：从项目内已装的 `node_modules/@serveryyswys/node.operit/BUILTINS.json` 读
- **npm 全局目录**：`/usr/lib/node_modules`（Linux 侧），只能经 `Tools.System.terminal.hiddenExec` 的 shell 读写，`Tools.Files` 够不着
- 全局回退：`cp` 不支持 `--exclude`，镜像全局用 **tar 管道**；tar 遇软链/二进制会返回非零，判成功以「目录非空」为准
- 配置**不缓存**：ToolPkg 模块宿主内只加载一次，用模块级缓存会导致「先调用后配 token」读不到

## 与 npm 的差异

- 扁平安装（hoist 到顶层 `node_modules`），不做嵌套
- 不做 `peerDependencies` 校验
- 依赖解析不做版本冲突求解，同一包只装一个版本
- 不做 lifecycle scripts（preinstall / postinstall 等）

## 开发

```bash
cd /sdcard/Download/Operit/dev_package/com.operit.serveryyswys.opm
tsc -p tsconfig.json                 # 需 ../types 存在
# 组装：dist/ -> pkgbuild/（ui 产物 index.ui.js 保持不变）
# 打包：cd pkgbuild && zip -r ../com.operit.serveryyswys.opm.toolpkg .
```

版本：0.2.0
