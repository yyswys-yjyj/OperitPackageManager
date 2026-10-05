# node.operit 设计文档

> 本文是设计依据，不是使用说明。使用说明见 [README.md](README.md)；
> 机器可读的契约见 [BUILTINS.json](BUILTINS.json)。

## 1. 定位

两个东西，职责严格分开：

| | **OperitPackageManager**（OPM，自建 npm） | **node.operit** |
|---|---|---|
| 形态 | 本身是一个 toolpkg，纯 JS，跑在 Operit 的 QuickJS 里 | 自建源上的一个普通包，CommonJS 可加载 |
| 定位 | **解析 / 分发层**，给 AI 提供工具 | **能力层** |
| 职责 | 下载、算真实入口、重写裸名、生成清单、打成 toolpkg | 补齐 Node 核心能力与语义 |
| 依赖方向 | 用运行时的原始 API 干活，**不依赖** node.operit | 只依赖宿主 Java bridge + 内建 `lodash/uuid/axios` |

`opm init` 时自动把 node.operit 下载到 `<项目>/node_modules/@serveryyswys/node.operit/`，
版本按项目锁定。node.operit 是**被生产出来的项目的运行期依赖**，不是 OperitPackageManager 的运行期依赖。

## 2. 运行时的硬事实

以下全部来自 Operit 源码核对，是整套设计的依据。

### 2.1 模块系统

- **`require` 只有一处实现**：[JsExecutionScriptBuilder.kt:1262](../Operit-src/app/src/main/java/com/ai/assistance/operit/core/tools/javascript/JsExecutionScriptBuilder.kt:1262) 的 `requireInternal`
- **唯一执行入口**：`__operitExecuteScriptFunction`（`TOOLPKG_EXECUTION_ENTRY_FUNCTION`），普通包与 toolpkg 共用
- **裸名处理**：

| 请求 | 行为 |
|---|---|
| `require('lodash')` | → `root._`，运行时的**迷你 lodash**，只有 8 个方法 |
| `require('uuid')` | → 手写的 `v4()` |
| `require('axios')` | → `get`/`post` 包到 `toolCall('http_request')` |
| **其他裸名** | → **静默 `return {}`**，不报错 |

- **解析规则**（`resolveModulePath` / `buildCandidatePaths`）：
  - 只有相对路径与绝对路径会走解析；**没有 `node_modules` 上溯**
  - **没有 `package.json` 的 `main` / `exports` 解析**
  - 候选只有 5 个：`x`、`x.js`、`x.json`、`x/index.js`、`x/index.json`
- **模块源码来自 toolpkg 归档**：`NativeInterface.readToolPkgTextResource(packageTarget, path)`
- **toolpkg 会被解压到磁盘**：`<app filesDir>/toolpkg_cache/<packageName>/`；`extractZipEntriesFromExternal` 是**无过滤的全量 unzip**（[ToolPkgParser.kt:1669](../Operit-src/app/src/main/java/com/ai/assistance/operit/core/tools/packTool/ToolPkgParser.kt:1669)）
- **`new Function` 与 `eval` 可用**：Operit 自己的模块工厂就是在用（[:297](../Operit-src/app/src/main/java/com/ai/assistance/operit/core/tools/javascript/JsExecutionScriptBuilder.kt:297)）
- **模块实例缓存**是运行时全局的 `root.__operitModuleInstanceCache`，key 里含 `packageTarget` 与源码 hash
  → **同一包的模块实例会跨 call 复用**，模块级状态会跨工具调用保留

### 2.1.1 运行时注入的全局（重要）

`JsLibraries.kt` 会把下面这些挂到全局：`_`、`dataUtils`、`Icons`、`Tools`、`Java`、`Kotlin`、
`CryptoJS`、`pako`、`Jimp`、`UINode`、`Android`、`OkHttp3` 等。

**但 `CryptoJS` 与 `pako` 都不是真库，而是极薄的"原生桥" shim：**

| 全局 | 真实能力 |
|---|---|
| `CryptoJS` | 仅 `MD5(string)` 与 `AES.decrypt`；没有 SHA 系列、HMAC、PBKDF2 |
| `pako` | 仅 `inflate(base64String, { to: 'string' })`；没有 deflate/gzip、不接受字节 |

对应的原生入口 `NativeInterface.crypto(algorithm, operation, args)` 也只认 `md5` 与 `aes/decrypt`。

**结论：不能用它们实现 `crypto` / `zlib`。** 两者都改成了纯 JS 实现
（`lib/hashes.ts`、`lib/inflate.ts`、`lib/deflate.ts`），这样反而能跟 Node 全量对拍 ——
`zlib` 是**双向**验证：Node 压的我们解、我们压的 Node 解。

### 2.2 由事实直接推出的三条结论

1. **裸名检索 `node_modules` 是效果，不是运行时能力**。它只能由 OperitPackageManager 在打包期重写出来。
2. **`node_modules` 必须打进 toolpkg**。sdcard 上的文件永远 `require` 不到。
3. **漏重写的裸名是静默 `{}`，漏打包的路径是显式抛错**。两者失败模式不同，构建期要分别校验。

### 2.3 Java bridge 的能力边界

返回值经 `JsJavaBridgeDelegates.toJsonCompatibleValue` 转换：

| 返回值 | 转成 |
|---|---|
| 基本类型 / `Char` / `Enum` / `Class` | 直通（`Float`→`Double`，`Char`→`String`） |
| `Map` / `Iterable` / **数组（含 `byte[]`）** | 递归展开成 JSON |
| 其他对象 | **`{ __javaHandle, __javaClass }` 句柄** |

- **`byte[]` 会被逐元素展开成 JSON 数字数组** —— 1MB 文件会膨胀成 MB 级文本。
  所以 `Buffer` 与 `fs` 的二进制**不走 `byte[]`**，走字符串通道（见 §6.3）。
- 参数方向只接受 JSON 值，基础类型外一律强转。
- 长生命周期 Java 对象可以用句柄持有，因此 `stream` 这类是可行的。

## 3. 契约

### 3.1 一个内置名 = 一个子路径

`BUILTINS.json` 是唯一真源，OperitPackageManager 读它生成重写规则：

```json
{
  "distDir": "dist",
  "subpathTemplate": "<distDir>/<subpath>.js",
  "builtins": {
    "path":     { "subpath": "path",         "status": "ready" },
    "fs/promises": { "subpath": "fs/promises", "status": "planned" },
    "vm":       { "status": "unsupported", "reason": "..." }
  }
}
```

| status | 重写器应当 |
|---|---|
| `ready` | 映射到 `<distDir>/<subpath>.js` |
| `partial` | 可以映射，但要读 `note` 评估；偏差范围由测试守 |
| `planned` | **报构建错误**，不得静默映射 |
| `unsupported` | **报构建错误**（或按 `unsupportedEntry` 的调用形式输出） |

子路径保持 Node 的目录结构，不压平：`fs/promises` → `dist/fs/promises.js`。
这样 `node.operit/<内置名>` 与 Node 的内置名一一对应，映射规则可以机械化生成。

### 3.2 点号包名规则（必须记住）

`buildCandidatePaths` 第一句：

```js
if (/\.[a-z0-9]+$/i.test(normalized)) return [normalized];
```

包名里的 `.operit` 正好命中这个正则，于是：

- ❌ `require('.../node_modules/@serveryyswys/node.operit')` → 只试这一个候选 → 解析失败，**不会回落到 index.js**
- ✅ `require('.../node_modules/@serveryyswys/node.operit/dist/index.js')`
- ✅ `require('.../node_modules/@serveryyswys/node.operit/dist/path')` → 结尾不是 `.ext`，候选里有 `path.js`

**结论：重写输出一律显式带 `.js`，永不产出"目录名等价于入口"的形式。**

### 3.3 加载链路

```
opm init <project>
  ├─ 生成项目骨架
  └─ 下载 node.operit → <project>/node_modules/@serveryyswys/node.operit/
opm install <dep>
  ├─ 下载 dep → <project>/node_modules/
  ├─ 重写：裸名 → <rel>/node_modules/@serveryyswys/node.operit/dist/<subpath>.js
  │         解 main/exports、补扩展名、node_modules 上溯
  └─ 打成 .toolpkg（java.util.zip 或 Tools.Files.zip）
运行时
  └─ 解压到 toolpkg_cache/<包名>/ → 原生相对 require 按路径直接读
```

## 4. 开发者规范

> **"把裸名重写成相对路径" 和 "把 `node_modules` 打进 toolpkg" 是同一件事的两半，缺一半就是废包。**

1. `node_modules` 放**项目顶层**，不放 `dist/` 里（运行时不做任何上溯）
2. 进 toolpkg 的必须是**运行期可达闭包**：`dependencies` 全量 + 嵌套 `node_modules`；
   `devDependencies` / `src/` / `tsconfig.json` / 测试一律不进
   —— 因为解包是无过滤全量 unzip，**打进去多少字节，每台设备就落多少字节**
3. `package.json` / `package-lock.json` 一并打包（保留 npm 语义与私有源配置）
4. **node.operit 不可被裁剪**
5. 只要依赖碰到 Node 核心模块，就必须引入 node.operit

**建议 OperitPackageManager 做的**：重写时记下每个生成路径，打包前逐条验证在归档中存在，缺一条 fail build；
并产出 `pack-manifest` 让体积成本可见。

## 5. 项目布局

```
<项目>/
  manifest.json       Operit 清单
  dist/               Operit 规范的发行目录
  src/                开发目录
  package.json
  package-lock.json
  tsconfig.json
  node_modules/       ← 必须在顶层
    node.operit/
    <deps>/
```

## 6. host 层

### 6.1 `lib/bridge.ts` —— 唯一接触 Java bridge 的地方

- 后端接口 `JavaBridgeBackend`，Operit 上的实现走 `NativeInterface.java*`，桌面测试注入 mock
- `unwrap()` 解 `{ success, data?, error?, message? }`；`success === false` 抛**中间态** Java 错误
  （带 `code` 但还没有 `syscall` / `path`）
- `handleOf()` 把 `{ __javaHandle }` 或裸 handle 统一成字符串
- **它不知道 fs，也不知道路径语义** —— 那些属于上层

### 6.2 `lib/errors.ts` —— 错误码的唯一翻译层

每个错误对象必须带 `code`：三方库普遍靠 `code` 分支（`existsSync`、`mkdirp`、`tar`），
没有 `code` 的实现等于跑不通。

Java 异常 → Node 错误码（**消息特征优先于类名精确表**，因为 `java.io.IOException` 是通用类）：

| 线索 | code |
|---|---|
| 消息含 "No space left on device" | `ENOSPC` |
| 消息含 "Read-only file system" | `EROFS` |
| 消息含 "Too many open files" | `EMFILE` |
| 消息含 "Is a directory" / "Not a directory" | `EISDIR` / `ENOTDIR` |
| `FileNotFoundException` / `NoSuchFileException` | `ENOENT` |
| `AccessDeniedException` / `SecurityException` | `EACCES` |
| `FileAlreadyExistsException` | `EEXIST` |
| `NotDirectoryException` | `ENOTDIR` |
| `DirectoryNotEmptyException` | `ENOTEMPTY` |
| `FileSystemLoopException` | `ELOOP` |
| 其余 | `EIO` |

库自身的状态用 `ONJ_*` 命名空间，不污染 POSIX 码空间。

### 6.3 `lib/bytes.ts` —— 二进制通道的唯一开关

因为 `byte[]` 会被展开成数字数组，二进制走字符串通道：

| 通道 | 体积 | 说明 |
|---|---|---|
| `base64` | 1.33x | 纯 ASCII，任何传输都安全 —— **默认** |
| `latin1` | 1.00x | 依赖 JSON 字符串保持码点不变 |

`encode()` / `decode()` 是唯一切口，`fs` 与 `Buffer` 只调它们。
QuickJS 不保证有 `TextEncoder` / `TextDecoder`，UTF-8 自行实现，非法序列按 U+FFFD 处理。

### 6.4 `lib/paths.ts` 与 `lib/cwd.ts`

`paths` 集中了所有"路径根从哪来"的知识，**分成公开面与内部面**：

- 公开面（Operit 的 `types/index.d.ts` 已声明）：`getPluginConfigDir`、`OPERIT_DOWNLOAD_DIR`、`OPERIT_CLEAN_ON_EXIT_DIR`
- 内部面（源码里真实存在、d.ts 未声明）：`getPluginConfigDir('')` 会回落到当前 call 的包名 —— `packageName()` 依赖它

`cwd` 独立成模块，是为了打破 `path` ↔ `fs` 的循环依赖：`path` 只读，`fs` / `process` 只写。

## 7. `fs` 环境状态机（设计）

### 7.1 模型

**环境 = 物理根 + cwd + 可用能力**。`process.cwd()` 跟着环境走，相对路径的解析基准也就跟着走 ——
状态机不是给 `fs` 打的补丁，而是路径语义的唯一来源。

### 7.2 状态与事件

```
UNBOUND ──首次使用──▶ BOUND(sdcard)          # 默认
BOUND(A) ──use(B)──▶ BOUND(B)
BOUND(A) ──with(B, fn)──▶ BOUND(B) ──fn 同步返回──▶ BOUND(A)
BOUND(*) ──reset()──▶ UNBOUND
```

| 事件 | 守卫 | 失败码 |
|---|---|---|
| `use(name)` | 未注册 → 拒绝 | `ONJ_UNKNOWN_ENV` |
| `use(name)` | 根不存在 / 无权限 / 能力探测失败 → 拒绝 | `ONJ_ENV_UNAVAILABLE` |
| `with(name, fn)` | `fn` 返回 thenable → **拒绝** | `ONJ_ENV_ASYNC_SCOPE` |
| `define(name, spec)` | 不许覆盖内置环境名 | `ONJ_UNKNOWN_ENV` |
| `reset()` | 无 | |

`with()` 的同步约束是最重要的一条红线：否则 `await` 期间环境会被别的代码看到。

### 7.3 环境清单（初版）

| 名 | 根 | 来源 |
|---|---|---|
| `sdcard` | `/sdcard` | 默认 |
| `config` | `getPluginConfigDir()` | 公开全局 |
| `app` | `getFilesDir()` | bridge + `javaGetApplicationContext` |

### 7.4 跨调用持久化（必须写进文档）

模块实例缓存按 `packageTarget` 复用（§2.1），所以 **`fs` 的环境状态会跨工具调用保留**。
这不是 bug，但会让"上一次调用把环境设成 linux、这一次忘了设"变成静默的行为漂移。
对策：`reset()` 可用；文档明确要求长生命周期代码用 `with()` 而不是 `use()`。

### 7.5 形态取舍

- `fs` 的 Node 方法签名保持原样，环境作为**独立的 `fs.env` 命名空间** —— 读 `fs` 的代码不会看到多余参数
- 另给 `createFs(env)` 工厂作为逃生口，应付同时操作两个环境的场景
- 默认实例仍是全局单例，因为三方库只会调全局 `fs`
- `..` 逃逸出根目录默认禁止，可逐环境放开

## 8. 模块清单与后端

| 档 | 内容 | 后端 |
|---|---|---|
| **纯 JS** | `path`、`querystring`、`string_decoder`、`events`、`assert`、`util`、`url`、`timers`、`perf_hooks`、`process`（骨架） | 无宿主依赖，本地可测 |
| **Java bridge** | `fs`、`os`、`crypto`、`zlib`、`child_process`、`dns`、`net`、`http` | `java.io/nio/security/util.zip/net`、`android.os.Build` |
| **可复用内建** | `zlib` ← pako、`crypto` 部分 ← CryptoJS、`http` ← axios | 内建裸模块 |
| **不作** | `vm`、`worker_threads`、`cluster`、`async_hooks`、`inspector`、`repl` | 见 `unsupported.js` |

`Buffer` 是隐性阻塞项：它决定 `string_decoder` / `stream` / `fs` / `crypto` 能不能做对，
而它完全取决于 §6.3 的通道选择。

## 9. 测试策略

### 一条反直觉的发现：深比较比的是 constructor

`Object.getPrototypeOf` 看起来才该是深比较的依据，但实测 Node 不是这么做的：

| 比较 | 结果 |
| --- | --- |
| `Object.create({i:1})` + own 与 `{}` | **相等**（原型不同，constructor 都是 Object） |
| `Object.create(null)` 与 `{}` | 不等（前者没有 constructor） |
| `new A()` 与 `new B()` | 不等 |
| `{__proto__: Array.prototype}` 与 `[]` | 不等（constructor 相同，但有数组类型闸） |

所以规则是「**沿原型链取 constructor 比较**」外加「数组与非数组永不相等」，
再单独补一条数组长度检查（`[]` 与 `new Array(2)` 的自有键都是空的，但不等）。

这个点如果按直觉写，会在 `Object.create` 与无原型对象上静默给出相反答案 ——
所以 `lib/deep-equal.ts` 用 4225 对语料（含循环引用、Map/Set、TypedArray、符号键、±0、NaN、
稀疏数组、无原型对象）与 `util.isDeepStrictEqual` 逐对比对。

### 另一条反直觉的发现：旧版 url.parse 按「协议是否 slashed」分派

`url.parse` 是手写状态机，规则不统一，实测出来的几条：

| 输入 | 结果 |
| --- | --- |
| `http:example.com` | **不当主机**（http 是 slashed 协议，缺 `//` 就不认），pathname = `example.com` |
| `a:b` | **当主机**（a 不是 slashed 协议），host = `b` |
| `mailto:someone@example.com` | 当主机，auth = `someone`，host = `example.com` |
| `foo://bar` | 有 `//` 就当主机，但 pathname 不补 `/`（foo 不是 slashed 协议） |
| `file:host` | href = `file://host` —— `file:` **无条件**带 `//`，其它 slashed 协议要有主机才带 |
| `parse('http://x', true).query` | 没有查询串时是**空对象**（无原型），不是 `null` |

这些如果按"直觉上更合理"的方式写，会在 `a:b`、`file:host` 这类输入上静默给出不同结果。
`src/url.ts` 里每条都标了出处，测试用 40 条语料与 Node 逐字段对拍（parse 字段、query 对象、
slashesDenoteHost、format、format(parse(x)) 往返、resolve）。

### OperitPackageManager 打包期要做什么（实测得出）

这一节是从"真装一个 npm 包跑通"的过程里逼出来的，是交给 OperitPackageManager 的施工图。

**根本前提**：Operit 的 `require` **没有 node_modules 查找**。
`resolveModulePath` 对不以 `.` 或 `/` 开头的请求原样返回，
`requireInternal` 对 `lodash`/`uuid`/`axios` 之外的一律 `return {}` —— **静默**。
所以打包期必须把所有裸名都变成相对路径，**不只是 Node 内建**：

| 情况 | 处理 |
| --- | --- |
| Node 内建名 | → `node_modules/@serveryyswys/node.operit/dist/<subpath>.js` |
| npm 包名 | → 该包入口文件（`main`/`exports` 必须在打包期解析） |
| `lodash` / `uuid` / `axios` | 保持原样（Operit 自带） |
| 相对路径的 `.json` | 换成包装模块 `module.exports = <json>` |
| 契约表里 planned / unsupported | **构建失败**，不能留到运行期变 `{}` |

另外三条同样是踩出来的：

- **扫描 require 要跳过注释与字符串**。用正则扫会把 node.operit 自己文档注释里的
  `require('<项目>/node_modules/@serveryyswys/node.operit/index.js')` 当成真依赖。
- **只处理从入口可达的文件**。npm 包里常有 `tests/` 引用没装的 devDependency
  （`safer-buffer/tests.js` 就 require `tape`），不可达的文件不该让构建失败。
- **始终写显式 `.js`**。`buildCandidatePaths` 用 `/\.[a-z0-9]+$/i` 判断有无扩展名，
  而 `node.operit` 这个名字自带一个点。

这些规则连同验证方式都写进了 `BUILTINS.json` 的 `packing` 段。

### 一条设计判断：http 为什么建在工具之上

实现 `http` 有两条路：直接用 Java 的 socket / `HttpURLConnection`，或者走宿主的
`toolCall('http_request')`。

选了后者。理由不是技术难度，而是**权限模型**：`http_request` 是 Operit 注册的工具
（`ToolRegistration.kt:1967`），走用户的工具审批流程。用裸 socket 另起一套，
插件就能绕过用户"是否允许联网"的决定 —— 那是库作者不该替用户做的选择。

于是 `http.get` / `http.request` 保持 Node 的 API 形状，底下发的是同一个工具调用。
代价写在契约表里：请求体只能是文本、`abort()` 取消不掉已经在宿主侧跑的请求、
没有连接池与 HTTP/2。服务端（`createServer`）则直接显式抛 `ONJ_UNSUPPORTED`。

### 一次自我印证的错误（JSON）

我在文档里写过"`.json` 的 require 会被静默吃掉，因为 Operit 把文本直接交给 `new Function`"。
**这是错的**，而错的方式值得记下来：

1. 读 `JsExecutionScriptBuilder.kt` 时**漏看**了 `executeModule` 里的 `.json` 分支；
2. 据此写运行时模拟器 —— 让 JSON 走 `new Function`，导出自然是 `{}`；
3. 模拟器"复现"了我以为的现象，于是我把结论写进 README 和 BUILTINS；
4. 此后每一轮集成验证都"印证"它，因为验证跑的就是那个模拟器。

**测试无法证伪一个与它同源的错误假设。** 整条链条里没有一个独立信源。

后来是用户在真机报告里把这条**当成"来自 README"引用**，我才回去逐行核对源码，
发现 :1231 明明有 `JSON.parse`。修正后直接验证：`require('./data.json')` 得到 `[1,2,3]`。

教训：引用源码行号时必须贴出那几行，而不是凭印象写结论；
凡是"运行时会怎样"的断言，都要有一个**不依赖我自己实现**的核对动作。

### 运行时的模块解析语义（真机核实）

真机报告（单文件 `.js` 沙盒包探针）确认了几条此前只从源码推断的事实，
其中两条改变了打包建议的表述：

- **`require` 只读 toolpkg 归档**（`readToolPkgTextResource(toolPkgId, path)`，:675），
  **完全不碰文件系统**。所以把 `node_modules` 铺在 `/sdcard` 上，
  运行期永远 require 不到 —— 这与"有没有重写裸名"是两件不相干的事。
  是"没进归档"先失败，不是"没重写"先失败。
- **单文件 `.js` 沙盒包不是合法宿主**：`screenPath` 为空、又没有归档资源，
  连包自己旁边的 `./x.js` 都解析不到（真机实测全部 `Cannot resolve … from "<root>"`）。

完整的语义表（含源码行号）在 README 的「运行时的模块解析语义」一节，
机器可读版本在 `BUILTINS.json` 的 `runtimeResolution`。

### 一条实测出来的契约要求：process / Buffer 要注入成全局

第一版 README 写的是"OperitPackageManager 在入口文件注入 `var process = require(...)`"。扩展集成测试
（加了 `debug` / `supports-color` 之后）证明这不够：

```
无 process 全局: supports-color require 时抛 "process is not defined"
注入 process 全局: supportsColorKeys=["stderr","stdout","supportsColor"], stdout=false  ← 与 Node 完全一致
```

真实包探测的是**全局**（`const {env} = process`、`typeof process === 'undefined'`），
而不是某个模块作用域里的变量。所以契约改成：把 `process`（与 `Buffer`）挂到全局上。

这一条是"只对拍 API"永远发现不了的：API 层面 `require('process')` 完全正确，
问题出在别人怎么用它。

### 一条刻意的取舍：net 不做

`net` 需要裸 TCP/UDP socket。技术上用 `java.net.Socket` 能实现，但**没有做**。

理由与 http 那条一致：网络访问在 Operit 里是**工具能力**（走用户审批），
用裸 socket 另起一套等于绕过审批模型。`http`/`https` 已经建在 `toolCall('http_request')`
之上，是"既能用 Node API、又不改变权限语义"的做法；`net` 没有对应的工具可挂，
所以宁可明确标为不支持。

因此 `BUILTINS.json` 的 `unsupported` 语义被明确成两类原因：平台不成立，与刻意不做。

### 一条平台判断：dns 只做 lookup

`dns.resolveMx` / `resolveTxt` 这些要做 DNS **记录级**查询。Java 侧对应的能力是 JNDI 的
DNS provider（`com.sun.jndi.dns`），而它不是 Android 平台的一部分。

所以 `dns` 只实现 `lookup` 一族（getaddrinfo，也就是绝大多数代码真正用的那部分），
`resolve*` 与 `reverse` **显式抛 `ONJ_UNSUPPORTED`** 并说明原因。
这与 `net` / `http.createServer` 的处理一致：平台不成立的能力给明确拒绝，
不给一个"能调用但结果不对"的空壳。

### 一条踩过的坑：假绿

测试入口是 async 的，如果某个场景的 Promise 永不 resolve，事件循环会变空，
**Node 会静默退 0**，看起来像"全部通过"。这个坑真实发生过一次
（`Transform` 漏调 `_final`，导致 `end` 永不触发）。

现在有两道防线：

1. **看门狗**：单模块超过 30s 未完成即置失败码；
2. **汇总落盘**：`test/last-run.txt` 记录最终计数与失败详情，
   因为长输出在管道里可能被截断，stdout 不一定能看到结论。

除此之外，每个模块完成后会打印自己的断言条数 —— 数量异常下降本身就是信号。

### 开发机的沙箱限制

本机（DSH 沙箱）**禁止带管道 stdio 起子进程**，Node 的 `spawnSync`/`exec` 会直接 `EPERM`。
因此 `child_process` 的测试不能用"真跑命令"的驱动，改成**契约测试**：

- mock 驱动记录收到的 argv，断言**交给宿主的是不是 shell + 单参数**（这正是与 Java bridge 的契约）；
- Node 语义层（退出码、错误码、maxBuffer、回调参数、事件与流）用固定返回值断言。

换句话说：能验证的是"我们交给宿主什么"和"我们怎么解释结果"，
**真正起进程这一步只能在真机上验证**。

- **本地 Node 对拍**：纯逻辑模块直接与 Node 自身实现比对。
  `path` 的 posix 部分是**全量对拍、一字不差**；win32 是真实场景硬断言 + 全量分歧普查（防扩大）
- **bridge mock**：`bridge.setBackend()` 注入桌面实现，使 `fs` 这类宿主模块也能本地测
- **真机验证**：Java bridge 的实际返回形状、`getPluginConfigDir('')` 的回落行为、
  `new Function` / `eval` 的可用性、二进制通道的实测开销 —— 这些必须在 Operit 上跑一次

## 10. 进度

已完成并通过本机对拍：

- [x] `path` / `path/posix`（posix 与 Node 全量对拍一字不差）
- [x] `path/win32`（partial，分歧率 1.45%，见 README）
- [x] `Buffer`（含 Node 的 base64 容错规则、ascii 编解码不对称行为）
- [x] `fs` 环境状态机 + 同步面 + `fs/promises`
      （Node 语义层与本机 Node 的 `fs` 逐项对拍通过；Java 驱动待真机验证）
- [x] `events` / `querystring` / `string_decoder`（与 Node 对拍通过）
- [x] `util`（partial：`inspect` 的折行算法未照搬）

- [x] `os` / `process`（partial：取值来自 Android，用 mock backend 钉死 Java 侧契约）
- [x] `crypto`（partial：6 个哈希算法 + HMAC + PBKDF2 与 Node 全量对拍；分组密码/签名未实现）
- [x] `zlib`（partial：完整 DEFLATE 解压 + 定长 Huffman 压缩，与 Node 双向对拍）
- [x] `stream` / `stream/promises`（partial：9 个场景与 Node 对拍一致，并解锁了 zlib 的流式接口）
- [x] `fs.createReadStream` / `fs.createWriteStream`（与 Node 对拍；读流无 fd，因此也不是真流式内存）
- [x] `child_process`（partial：exec/execFile/spawn 及其同步版、错误形态与事件已实现；
      同步宿主决定了它没有真并发）
- [x] fd 系列 + 回调形式 + `fs/promises.FileHandle`（与 Node 对拍）
- [x] `assert` / `assert/strict`（+ 共享的 `lib/deep-equal.ts`，语料零分歧）
- [x] `url`：WHATWG `URL`（含 setter 与 searchParams 活视图）+ `URLSearchParams` +
     旧版 `parse`/`format`/`resolve` + file URL + punycode
- [x] `timers` / `timers/promises` / `perf_hooks` / `constants` / `module` / `tty`
- [x] 端到端集成验证（真实 npm 包 + 忠实复刻的运行时模拟器 + 与 Node 差分比对）
- [x] `os` / `process` / `util` / `events` / `querystring` / `string_decoder` / `crypto` /
      `zlib` / `stream` / `buffer` / `path`

### 契约里仍未实现的条目

`BUILTINS.json` 中标为 planned 的还有这些，按建议顺序：

1. **需要宿主**：`net` / `http` / `https` / `dns`（可基于 Java Socket / HttpURLConnection）
2. **明确不支持**：`vm` / `worker_threads` / `cluster` / `async_hooks` / `inspector` / `repl`
3. **意义有限**：`readline`（沙箱没有真实 stdin）

### 只剩真机验证

模块面已经铺满契约中"可实现"的部分。剩下的收尾是 §9 第三条那份清单：
bridge 的实际返回形状、`getPluginConfigDir('')` 的回落行为、`new Function` / `eval` 的可用性、
二进制通道（base64 vs latin1）的实测开销、`ProcessBuilder` 与 `RandomAccessFile` 的可用性。

这些都必须跑在 Operit 上，桌面测不了。
- [ ] `crypto` / `zlib` / `stream` / `child_process`
- [ ] fd 系列（`open`/`read`/`write`/`close`）与流式 API
- [ ] 真机验证清单（§9 第三条）：bridge 返回形状、`getPluginConfigDir('')` 回落、`new Function` 可用性、二进制通道实测开销
- [ ] 二进制通道实测后定稿（`base64` vs `latin1`）
