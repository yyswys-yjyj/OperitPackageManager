# node.operit

为 **Operit 的 CommonJS 运行时**补齐 Node 核心能力。

## 为什么需要它

Operit 的沙箱脚本跑在 QuickJS 上，内建了 CommonJS，但：

- **裸模块只有三个**：`require('lodash')` → 运行时的迷你 `_`，`require('uuid')` → 手写 v4，`require('axios')` → `http_request` 的薄封装
- **其余裸模块静默返回 `{}`**，不报错
- **`require` 只读 toolpkg 归档内的资源**，且只按发起模块的目录解析相对路径
- **没有 `node_modules` 上溯，没有 `package.json` 的 `main` / `exports` 解析**

node.operit 补的是"运行时故意没有实现"的那部分：真实的 `fs`、`path`、`os`……而"把裸名解析成路径"由 **OperitPackageManager（OPM，自建 npm）在打包期重写**完成。

## 谁负责什么

| | OperitPackageManager（构建期） | node.operit（运行期） |
|---|---|---|
| 裸名 → 路径 | ✅ 读 `BUILTINS.json` 生成重写规则 | 只提供被映射到的实现 |
| `main` / `exports`、扩展名、`node_modules` 上溯 | ✅ | ❌ |
| Node 语义（错误码、Buffer、fs 行为） | ❌ | ✅ |

## 开发者规范（硬约束）

运行时读模块只走 toolpkg 归档，所以：

> **"把裸名重写成相对路径" 和 "把 `node_modules` 打进 toolpkg" 是同一件事的两半，缺一半就是废包。**

1. `node_modules` 放**项目顶层**，不要放进 `dist/`
2. 进 toolpkg 的必须是**运行期可达闭包**：`dependencies` 全量 + 嵌套 `node_modules`；`devDependencies` / `src/` / `tsconfig.json` / 测试一律不进
3. `package.json` 与 `package-lock.json` 一并打包
4. **node.operit 不可被裁剪**
5. 重写输出路径**一律显式带 `.js`**（见下）
6. 只要依赖碰到 Node 核心模块，就必须引入 node.operit

两种失败模式完全不同，构建期要分别校验：

| 漏了什么 | 表现 |
|---|---|
| 裸名漏重写 | **静默返回 `{}`**，在别处炸 |
| 路径漏打包 | **显式抛** `Cannot resolve module "..." from "..."` |

## 为什么重写必须带显式扩展名

Operit 的 `buildCandidatePaths` 第一句是 `if (/\.[a-z0-9]+$/i.test(normalized)) return [normalized];`。
包名里的 `.operit` 正好命中这个正则，因此：

- ❌ `require('.../node_modules/@serveryyswys/node.operit')` → 只试这一个候选，解析失败
- ✅ `require('.../node_modules/@serveryyswys/node.operit/dist/index.js')`
- ✅ `require('.../node_modules/@serveryyswys/node.operit/dist/path.js')`

## 契约

完整映射表见 [`BUILTINS.json`](BUILTINS.json)。重写目标由 `distDir` + `subpath` 组成，与 Node 内置名一一对应：

| Node 内置 | 重写目标 |
|---|---|
| `require('path')` | `<rel>/node_modules/@serveryyswys/node.operit/dist/path.js` |
| `require('path/posix')` | `<rel>/node_modules/@serveryyswys/node.operit/dist/path/posix.js` |
| `require('fs/promises')` | `<rel>/node_modules/@serveryyswys/node.operit/dist/fs/promises.js` |

`status` 的含义：`ready` 可映射；`partial` 可映射但需读 `note`；`planned` 与 `unsupported` **必须由重写器报构建错误**，不得静默映射。

## 目录

```
node.operit/
  src/                     TypeScript 源码
    index.ts               聚合入口（糖）
    path.ts                path 本体
    path/posix.ts          path/posix 子路径入口
    path/win32.ts          path/win32 子路径入口
    buffer.ts              Buffer
    fs.ts                  fs 同步面（Node 语义）
    fs/promises.ts         fs/promises 子路径入口
    events.ts              EventEmitter
    querystring.ts         querystring
    string_decoder.ts      StringDecoder
    util.ts                util（format / inspect / promisify / TextEncoder 等）
    os.ts                  os
    process.ts             process（require('process') 返回的进程对象）
    crypto.ts              crypto（哈希/HMAC/PBKDF2/随机数）
    zlib.ts                zlib（deflate/inflate/gzip/gunzip + 流式接口）
    stream.ts              stream（Readable/Writable/Duplex/Transform/PassThrough + pipeline/finished）
    stream/promises.ts     stream/promises 子路径入口
    child_process.ts       exec / execFile / spawn（同步宿主）
    url.ts                 url（WHATWG URL + URLSearchParams + 旧版 parse/format/resolve）
    timers.ts              timers（含 setImmediate、promisify(setTimeout)）
    timers/promises.ts     timers/promises
    perf_hooks.ts          perf_hooks（performance + constants）
    constants.ts           constants（fs/os/zlib/crypto 常量合并）
    module.ts              module（builtinModules / isBuiltin）
    tty.ts                 tty（isatty 恒 false）
    http.ts                http（仅客户端，建在 toolCall('http_request') 之上）
    https.ts               https（同 http，缺省协议为 https:）
    dns.ts                 dns（lookup 一族；resolve 一族显式拒绝）
    dns/promises.ts        dns/promises 子路径入口
    assert.ts              assert（含 AssertionError）
    assert/strict.ts       assert/strict 子路径入口
    unsupported.ts         运行时显式拒绝
    lib/
      bridge.ts            唯一接触 Java bridge 的地方
      errors.ts            Node 错误码 + Java 异常映射
      bytes.ts             二进制通道的唯一开关 + UTF-8 编解码
      paths.ts             运行时路径根
      cwd.ts               cwd 持有者（打破 path/fs 循环）
      fs-env.ts            fs 环境状态机
      fs-driver.ts         文件系统原语 + Java 驱动
      hashes.ts            md5/sha1/sha256/sha512 + HMAC + PBKDF2（纯 JS）
      inflate.ts           DEFLATE 解压 + CRC-32 / Adler-32（纯 JS）
      deflate.ts           DEFLATE 压缩：定长 Huffman + LZ77（纯 JS）
      stream-types.ts      stream 的公开类型
      zlib-types.ts        zlib 的公开类型
      fs-types.ts          fs 流式接口的公开类型
      deep-equal.ts        深比较（util.isDeepStrictEqual 与 assert 共用）
      punycode.ts          RFC 3492（url 的域名转换）
      url-types.ts         url 的公开类型
      url-search-params.ts URLSearchParams（url 与 url-whatwg 共用）
      url-whatwg.ts        WHATWG URL（RFC 3986 状态机）
      timers-types.ts      timers 的公开类型
      perf-hooks-types.ts  perf_hooks 的公开类型
      http-driver.ts       http 的宿主驱动（toolCall('http_request')）
      http-types.ts        http 的公开类型
      dns-driver.ts        dns 的宿主驱动（InetAddress / getaddrinfo）
      dns-types.ts         dns 的公开类型
      process-driver.ts    child_process 的宿主驱动（ProcessBuilder）
      child-process-types.ts  child_process 的公开类型
      path-types.ts        path 的公开类型
      host.d.ts            Operit 全局面声明
  dist/                    tsc 产物（发布内容，git 忽略）
  BUILTINS.json            契约表：重写器读这个
  test/                    本地对拍（不进包）
  tsconfig.json
```

## 构建与测试

```bash
npm run build      # tsc -p tsconfig.json -> dist/
npm test           # node test/run-tests.js（先自行 build）
```

`path` 的 posix 部分与 Node 的 `path.posix` **全量对拍、一字不差**；win32 部分做真实场景硬断言 + 全量分歧普查。

## 关于 `process` / `Buffer` 全局（**实测出来的契约要求**）

Operit 的运行时**没有** `process`，也没有 `Buffer`。node.operit 提供的是
`require('process')` / `require('buffer')`。

**只在入口文件里 `var process = ...` 一次是不够的** —— 必须把它挂成**全局**：

```js
globalThis.process = require('<rel>/node_modules/@serveryyswys/node.operit/dist/process.js');
globalThis.Buffer  = require('<rel>/node_modules/@serveryyswys/node.operit/dist/buffer.js').Buffer;
```

原因是真实包会做**特性探测**，而探测的是全局：

- `supports-color` 顶层就是 `const {env} = process`，没有全局时 **require 阶段直接抛**
  `process is not defined`（`debug` / `chalk` 都依赖它）；
- `debug` 用 `typeof process === 'undefined'` 在 browser / node 两套实现间切换，
  没有全局就会走 browser 分支（用 localStorage 而不是环境变量）。

这是端到端验证撞出来的，并且做了**对照实验**（`integration/tools/run.js` 的"对照实验"一节：
同一份打包产物，开 / 关 `injectProcess` 各跑一遍）：

| | 不注入 | 注入 | Node |
| --- | --- | --- | --- |
| `supports-color` | require 即抛 | `["stderr","stdout","supportsColor"]`、`stdout=false` | 同左 ✓ |
| `debug` | 走 browser 分支 | 走 node 分支 | node 分支 |

这条已经作为契约规则写进 `BUILTINS.json` 的 `packing` 段。

## 端到端验证（真实 npm 包）

`npm run test:integration` —— 见 [integration/](integration/)。这一步回答的是
"真装一个 npm 包，按契约打包后能不能跑"，而不只是"API 对不对拍"。

它做四件事：

1. `npm install` 真实包（`ms`、`iconv-lite`、`safer-buffer`、`semver`、`marked`、`diff`、`dayjs`、`debug`、`supports-color`）；
2. 按 `BUILTINS.json` 的 `packing` 规则做裸名重写（Node 内建 → `node.operit` 子路径，
   npm 包 → 包入口，`.json` → 包装模块）；
3. 用**忠实复刻** `JsExecutionScriptBuilder.kt` 的运行时模拟器加载
   （没有 node_modules 查找、未知裸名静默返回 `{}`、加载期没有 `process`/`Buffer` 全局）；
4. 同一份产物再用 Node 原生加载器跑一遍，**纯函数型包的 29 个结果字段必须逐字段一致**
   （`ms` / `iconv-lite` / `semver` / `marked` / `diff` / `dayjs`）；
5. 会做 `typeof process` 特性探测的包（`debug` / `supports-color`）单独一组，
   只报不判 —— 它们在两边的代码路径本来就不同，而那正是上面那条契约要求的由来。

第 4 步是关键：它把"模拟器里能跑"和"代码本身是对的"分开，否则一个坏掉的模拟器也能"跑通"。

### 这一步抓到的真实缺陷

- **`Buffer` 的静态成员必须是可枚举的**。Node 的 `Buffer.from` 等是赋值出来的、可枚举；
  而 `class` 的 `static` 方法不可枚举。`safer-buffer`（iconv-lite 的依赖）正是用
  `for (key in Buffer)` 做能力探测 —— 不可枚举时它复制出空对象，`Buffer.concat` 随即消失。
  **纯 API 对拍看不出这个差异**，只有跑真实包才暴露。
> **更正**：本文档早先写着"`.json` 的 require 会被静默吃掉"。**那是错的** ——
> 它来自一次读漏：我把运行时模拟器写成了"JSON 当 JS 执行"，于是导出恒为空对象，
> 再据此写进文档，形成自我印证。当前 `Operit-src` 的 `executeModule`（`JsExecutionScriptBuilder.kt:1231`）
> 有显式的 `.json` 分支，走 `JSON.parse`。模拟器已按此修正，并有直接验证：
> `require('./data.json')` 得到 `[1,2,3]`、嵌套对象取值也正确。
>
> 重写器**仍然可选地**生成 `.json` 包装模块，只为兼容早于该分支的 Operit 构建；
> 在当前源码上它不是必需的。`integration` 默认开着，这样产物与构建版本无关。

## 运行时的模块解析语义（据源码 + 真机实测）

这一节是给**打包方（OperitPackageManager / OPM）**看的。搞错任何一条，产物就会"装好了但 require 不到"。

| 事实 | 依据 |
| --- | --- |
| `require` **只从 toolpkg 归档里读模块**：`NativeInterface.readToolPkgTextResource(toolPkgId, path)`，**完全不碰文件系统** | `readToolPkgModule` :675 |
| 所以把 `node_modules` 铺在 `/sdcard` 上，运行期**永远 require 不到** —— 这与"有没有重写裸名"是两件事 | 同上；真机实测复现 |
| **必须是正规 toolpkg**（有 `toolPkgId`、入口已注册为 screen）。**单文件 `.js` 沙盒包不行**：`screenPath` 为空、也没有归档资源 → 所有路径型 require 全部失败 | `screenPath` :663；真机实测 |
| 裸名（不以 `./` 或 `/` 开头）→ 除 `lodash`/`uuid`/`axios` 外**静默返回 `{}`**，不抛错 | :1288 |
| 路径型请求解析不到 → 抛 `Cannot resolve module "x" from "<root>"` | :1301 |
| **入口脚本**的相对 require 以 `dirname(screenPath)` 为基准（`screenPath` = `moduleSpec.screen` = 入口脚本路径） | :1316 / :663 |
| **嵌套模块**的相对 require 以**自身路径**为基准 —— 标准 CommonJS | :1242 |
| `normalizePath` 丢掉开头的 `/`，且**越界的 `..` 直接丢弃**（逃不出根） | :209 |
| 名字命中 `/\.[a-z0-9]+$/i` 就**只有一个候选**，不补 `.js` —— 所以重写目标必须显式带扩展名 | :254 |
| `.json` 走 `JSON.parse`（当前源码） | :1231 |

**结论**：重写的目标路径要**相对入口脚本所在目录**（对嵌套模块则是相对自身，两者在正常的
"入口在包根"布局下一致），并且 `node_modules` 必须**进归档**，不能只铺在外部存储上。

## 真机自检

`tools/device-check.js` 是一个**在 Operit 里跑的**自检脚本（不是桌面工具）。
库里所有 Java 侧的行为在桌面上都无法验证，只能靠推断；这个脚本把"未验证"变成
"跑一次就知道"：它逐项探测每一条宿主假设（bridge 信封形状、数组转换、
`File`/`RandomAccessFile`/`Files` 的语义、`ProcessBuilder`、`UUID`、
`InetAddress`、`toolCall('http_request')` 的返回形状、各个全局函数……），
再跑一遍 node.operit 自身的端到端冒烟，最后打印 PASS/FAIL 报告。

用法：在 Operit 里执行该脚本；若库不在默认位置，先设
`globalThis.ONJ_LIB_PATH = '<相对路径>/node_modules/@serveryyswys/node.operit/index.js'`。

`tools/device-check-dryrun.js` 是它的桌面试跑（用桩 NativeInterface 驱动），
只验证**脚本本身**能跑完、能出报告 —— Java 行为仍然只能靠真机。

### 一个实测出来的使用注意

`fs.env.use('config')` 要求**根已存在**；而插件的配置目录（`getPluginConfigDir('')`）
不一定被 Operit 预先创建过。所以插件里应当先确认/创建该目录，再切到 `config` 环境 ——
`tools/device-check.js` 里就是这么做的，可以直接照抄。

## 已知偏差

`path/win32` 被标为 **partial**。在 4000 条随机路径 + 固定语料的对拍中，与 Node `path.win32` 的总体分歧率约 **1.5%**，集中在两类边缘：

1. 归一化含**歧义冒号**的相对路径（如 `'9:'`）：Node 会补 `.` 前缀，本实现部分场景未补
2. **UNC 根**的 `dirname` / `parse` 边界

日常 Windows 路径形态（盘符、反斜杠、UNC、`..`、扩展名）经对拍一致。Operit 平台是 android/linux，该模块主要服务于解析 Windows 路径的三方库。

## 状态

- `path`、`path/posix`：**ready**，posix 与 Node 全量对拍、一字不差
- `buffer`：**ready**，与 Node 的 Buffer 逐项对拍通过
- `events` / `querystring` / `string_decoder`：**ready**，行为序列与 Node 对拍一致
- `util`：**partial** —— `format` / `promisify` / `inherits` / `types` / `isDeepStrictEqual` /
  `TextEncoder` / `TextDecoder` 已对拍；`inspect` 只对齐常用形态（Node 的 compact/breakLength 折行未照搬）
- `os` / `process`：**partial**，形状与语义对齐 Node，取值来自 Android；近似点见 `BUILTINS.json`
- `crypto`：**partial** —— 哈希/HMAC/PBKDF2/随机数与 Node 全量对拍通过；分组密码、签名、密钥对未实现（调用即抛 `ONJ_UNSUPPORTED`）
- `zlib`：**partial** —— 与 Node **双向**对拍通过（Node 压的我们解、我们压的 Node 解）；
  压缩侧只有定长 Huffman，压缩率低于 zlib；流式接口基于 `stream.Transform` 但内部仍一次性处理；Brotli 未实现
- `stream` / `stream/promises`：**partial** —— 9 个场景与 Node 对拍一致；
  事件时序用 `queueMicrotask` 调度（同类但非逐拍相同）；`objectMode` 的完整语义差异、
  `cork` 合并优化、`compose` 未实现。
  注意 `stream.pipeline` 不给回调会按 Node 语义抛错，Promise 形式用 `stream/promises`
- `dns`：**partial** —— `lookup` 一族可用（基于 `java.net.InetAddress`）；
  **`resolve*` 与 `reverse` 显式抛 `ONJ_UNSUPPORTED`** —— 记录级查询要 JNDI 的 DNS provider，
  而 `com.sun.jndi.dns` 不在 Android 里，这是平台不成立不是尚未实现
- `http` / `https`：**partial** —— **只有客户端**，建在宿主的 `toolCall('http_request')` 之上
  （不直接用 Java socket：那是走用户审批的工具，另起一套会绕过权限模型）；
  `createServer` 构造时显式抛 `ONJ_UNSUPPORTED`；请求体只支持文本；`abort()` 无法真正取消已发出的请求
- `timers` / `timers/promises` / `perf_hooks` / `constants` / `module` / `tty`：**partial** ——
  已对拍；`setImmediate` 落在 `setTimeout(…,0)` 上（同队列，Node 里它在 check 阶段）；
  `tty.isatty()` 恒 `false`；`module.createRequire` 显式拒绝；`constants` 给的是 **Linux/Android** 数值
- `url`：**partial** —— `URLSearchParams`、**WHATWG `URL`**、旧版 `parse`/`format`/`resolve`、
  `pathToFileURL`/`fileURLToPath`（**POSIX 规则**）、`urlToHttpOptions`、
  `domainToASCII`/`domainToUnicode` 均已对拍（53 条绝对 URL + 12 条相对引用 + 9 个 setter，零分歧）；
  已知差异：`blob:` 的 `origin` 为 `'null'`、域名不做 UTS-46 映射
- `assert` / `assert/strict`：**partial** —— 错误字段与 Node 逐项一致；
  差异块用「公共前后缀 diff」，对单点差异与 Node 逐字一致；
  唯一消息差异是 `assert.ok` 失败时 Node 附的调用处源码表达式（取不到）
- `child_process`：**partial** —— `exec`/`execSync`/`execFile`/`execFileSync`/`spawn`/`spawnSync` 与
  Node 的错误形态一致；但宿主是同步 bridge，**`spawn` 先跑完再发事件**（无真并发、长驻进程会阻塞），
  输出按 UTF-8 解码（二进制有损），`fork` 未实现
- `path/win32`：**partial**，见「已知偏差」
- `fs`、`fs/promises`：**partial**
  - Node 语义层（选项解析、flag、错误码、返回值形状）已与本机 Node 的 `fs` 逐项对拍通过
  - fd 系列（`openSync`/`readSync`/`writeSync`/`closeSync`/`fstatSync`/`ftruncateSync`/`fsyncSync`）、
    回调形式、`fs/promises.open` 返回的 `FileHandle` 均已与 Node 对拍通过
  - `createReadStream` / `createWriteStream` 已与 Node 对拍通过；
    读流是"按需整块读 + 按 `highWaterMark` 切片"（**没有流式的内存特性**），`'open'` 事件参数为 `null`（无真实 fd）
  - **Java 驱动尚未在真机验证**；已知近似：`atime`/`ctime`/`birthtime` 取 `mtime`、
    `mode` 为按类型的默认值、`readdir` 不区分符号链接、fd 系列（`open`/`read`/`write`/`close`）未实现
- 其余见 `BUILTINS.json`
