# OPM — Operit Package Manager

在 Operit 上还原 npm 生态的包管理器（纯 JS 沙盒实现，ToolPkg 形态）。

## 定位

**opm 是给 node 项目用的 npm 客户端**，不是 Operit 沙盒包安装器。它操作目标项目的
`node_modules` / `package.json` / `package-lock.json`，与宿主 Operit 的包系统无关。

- 默认源：`https://www.serveryyswys.top/download/source/npm/`（辰锤私有 npm registry，标准 npm 协议）
- 投稿/管理：辰锤资源中心 `resource_center` API（需 token）

## 工具

| 工具 | 作用 |
|------|------|
| `init` | 在项目根目录生成 `package.json` + `.npmrc`（指向私有源），并自动安装 `node.operit` |
| `search` | 在 registry 中按关键词搜索包 |
| `install` | 安装包 / 按 `package.json` 解依赖 / 更新；写 `node_modules` 与 `package-lock.json` |
| `remove` | 卸载包；清理 `node_modules`、`package.json`、lockfile |
| `manager` | 管理自有包（list / info / publish / create-npm），走辰锤 API |

## 界面

ToolPkg 工具箱内提供「OPM 设置」界面，可配置 registry 源、辰锤 API token、init 行为开关。

## 技术要点（已在真机验证）

- 二进制读写：`Tools.Files.readBinary` / `writeBinary`
- base64 解码：`Java.type('android.util.Base64')`
- SHA-1 / SHA-512 校验：`Java.type('java.security.MessageDigest')`
- **tgz 解包**：`Tools.System.terminal.hiddenExec('tar -xzf ...')`（沙盒内纯 JS 逐字节解包会超时）
- JSON HTTP：`Tools.Net.http`

## 与 npm 的差异（一期）

- 扁平安装（hoist 到顶层 `node_modules`），不做嵌套 `node_modules`
- 不做 peerDependencies 校验
- 依赖解析不做版本冲突求解，同一包只装一个版本
- 不做 lifecycle scripts（preinstall/postinstall 等）

## 开发

```bash
cd /sdcard/Download/Operit/dev_package/com.operit.opm
# 需将 types 放到兄弟目录 ../types
npx tsc -p tsconfig.json
```

编译产物在 `build/`，再复制到包结构对应位置（`main.js` / `packages/opm.js` / `ui/...`）后打包为 `.toolpkg`。
