/*
METADATA
{
    "name": "opm",
    "description": {
        "zh": "Toolpkg 构建工具：把 TypeScript/JavaScript 工程一条龙编译、校验、打包成 Operit 可用的 .toolpkg。Toolpkg 项目依赖包管理器，从 npm 源或其他源安装依赖以降低开发难度。",
        "en": "Toolpkg build toolchain: compile, validate and pack a TypeScript/JavaScript project into an Operit .toolpkg end to end. The Toolpkg project uses a dependency manager to install dependencies from npm or other sources, making development easier."
    },
    "enabledByDefault": true,
    "env": [],
    "tools": [
        {
            "name": "init",
            "description": {
                "zh": "初始化 npm 工程：生成 package.json、.npmrc，并安装 @serveryyswys/node.operit。\n\n参数：\n- project_dir：项目根目录（必填）。\n- name：package.json 的包名。\n- version：初始版本号，默认 1.0.0。\n- source：normal（默认）/ cch / npm。\n- registry：自定义 registry URL，优先于 source。\n\nsource 对应的 .npmrc：\n- normal（默认）：registry=https://registry.npmjs.org/，@serveryyswys:registry=<辰锤源>（双源）\n- cch：registry=<辰锤源>\n- npm：registry=https://registry.npmjs.org/\n\n传 registry 时 .npmrc 只写 registry=<传入值>。\n\n安装 @serveryyswys/node.operit 按其 scope 对应源（normal → 辰锤源）。",
                "en": "Initialize an npm project: create package.json, .npmrc, and install @serveryyswys/node.operit.\n\nParameters:\n- project_dir: project root (required).\n- name: package name for package.json.\n- version: initial version, default 1.0.0.\n- source: normal (default) / cch / npm.\n- registry: custom registry URL, takes precedence over source.\n\n.npmrc per source:\n- normal (default): registry=https://registry.npmjs.org/, @serveryyswys:registry=<Chenchui registry> (dual)\n- cch: registry=<Chenchui registry>\n- npm: registry=https://registry.npmjs.org/\n\nWith registry passed, .npmrc only contains registry=<value>.\n\nInstalling @serveryyswys/node.operit uses the registry matching its scope (normal -> Chenchui)."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径，例如 /sdcard/Download/myproj", "en": "Absolute path of the project root" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "name",
                    "description": { "zh": "package.json 里的包名（可选）", "en": "Package name for package.json (optional)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "version",
                    "description": { "zh": "初始版本号，默认 1.0.0", "en": "Initial version, default 1.0.0" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "source",
                    "description": { "zh": "源选择：normal（默认，双源）/ cch / npm", "en": "Registry source: normal (default, dual) / cch / npm" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "registry",
                    "description": { "zh": "自定义 registry URL（可选，优先于 source）", "en": "Custom registry URL (optional, takes precedence over source)" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "search",
            "description": {
                "zh": "在 registry 中搜索包。可按关键词过滤，返回包名/版本/描述。",
                "en": "Search packages in the registry by keyword."
            },
            "parameters": [
                {
                    "name": "keyword",
                    "description": { "zh": "搜索关键词（可选，留空返回全部）", "en": "Search keyword (optional)" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "install",
            "description": {
                "zh": "安装包。三种用法：① 传 packages 包名列表，从 registry 解析并装进项目 node_modules（写 package-lock.json）；② 不传 packages，按项目 package.json 安装全部依赖；③ 传 tgz_path 安装本地 .tgz（npm pack 产物），配合 global=true 装到 npm 全局目录（/usr/lib/node_modules）。本地 tgz 安装不做依赖解析，只装该包本身。\n\n源由项目 .npmrc 决定：@scope:registry 匹配的包走该源，其余走 registry。",
                "en": "Install packages. Three usages: (1) pass packages specs to resolve from registry into node_modules (writes lockfile); (2) omit packages to install everything from package.json; (3) pass tgz_path to install a local .tgz (npm pack output), with global=true installing into the npm global dir (/usr/lib/node_modules). Local tgz install does not resolve dependencies.\n\nRegistry comes from the project .npmrc: packages matching @scope:registry use that registry, others use registry."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径。装本地 tgz 到全局时可不传。", "en": "Absolute project root. Optional when installing a local tgz globally." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "packages",
                    "description": { "zh": "要安装的包规格，多个用空格或逗号分隔（可选）。与 tgz_path 二选一。", "en": "Package specs, space/comma separated (optional). Mutually exclusive with tgz_path." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "tgz_path",
                    "description": { "zh": "本地 .tgz 文件绝对路径（可选）。传了就装本地包，忽略 packages。", "en": "Absolute path to a local .tgz (optional). If given, installs the local package and ignores packages." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "global",
                    "description": { "zh": "是否全局安装，默认 false。true 时装到 npm 全局目录（Linux 侧 /usr/lib/node_modules），仅对 tgz_path 生效。", "en": "Install globally, default false. When true installs into the npm global dir (Linux /usr/lib/node_modules); only applies to tgz_path." },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "save",
                    "description": { "zh": "是否写入 package.json 的 dependencies，默认 true（仅 registry 安装与项目内 tgz 安装）。", "en": "Write to package.json dependencies, default true (registry install and in-project tgz install only)." },
                    "type": "boolean",
                    "required": false
                }
            ]
        },
        {
            "name": "remove",
            "description": {
                "zh": "卸载包。两种用法：① 普通模式（传 project_dir）：从项目 node_modules 删目录，并清理 package.json 依赖与 package-lock.json；② 全局模式（传 global=true）：从 npm 全局安装目录（/usr/lib/node_modules）删除包，无需 project_dir。",
                "en": "Remove packages. Two usages: (1) project mode (pass project_dir): delete from the project node_modules and clean up package.json / package-lock.json; (2) global mode (pass global=true): delete from the npm global dir (/usr/lib/node_modules), no project_dir needed."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径。全局卸载时可不传。", "en": "Absolute project root. Optional when removing globally." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "packages",
                    "description": { "zh": "要卸载的包名，多个用空格或逗号分隔", "en": "Package names, space/comma separated" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "global",
                    "description": { "zh": "可选，默认 false。传 true 时从 npm 全局目录（/usr/lib/node_modules）卸载。", "en": "Optional, default false. If true, removes from the npm global dir (/usr/lib/node_modules)." },
                    "type": "boolean",
                    "required": false
                }
            ]
        },
        {
            "name": "manager",
            "description": {
                "zh": "辰锤资源中心（resource_center）投稿客户端：管理你账号下已发布的软件包——查询、建包、传代码文件、归档审查、写文档/缩略图、建 npm 包、同步到市场。\n\n前置：需先在 opm 设置界面填入『辰锤 API token』。该 API Key 必须在开放平台勾选 resource_center 作用域，否则所有调用返回 403『Permission denied for this API』。\n\n定位：软件包（package，用 package_id/id 定位）→ 内含 普通包（subpack）或 npm 包（npm）→ 包内含文件。\n\n多版本节点：一个软件包 = 一个项目簇，簇下挂若干**版本节点**，每个节点有自己独立的一套普通包 / npm 包 / 文档 / 缩略图，互不干扰。定位参数可加 node(节点数字 ID，优先级最高) 或 version(版本号，如 1.0.1 / v2 / latest)。\n  - 都不给 = 该软件包的最新节点（老调用不变）。latest = 还没起版本号的游离初版。\n  - package_create 带 @版本号（缀在 package_id/id 后，如 package_id=demo@2.0.0）= 给已有软件包**新增一个版本节点**（不带 = 新建整个软件包）。新增节点时 package_name/desc/tag/enable 不生效（簇级字段，只在建簇时写）。\n  - package_delete 带 @版本号 = 只删那一个节点（至少留一个）；返回 scope：version=只删节点，package=删掉整个软件包。\n  - publish 带 @版本号 = 同步后把**最新版本指针**指到它（同步本身仍是整簇重建）。\n  - ⚠ package_update 与 unpublish 作用于**整个软件包**，**不允许**带 @版本号（带了直接 400）。\n  - 限制：每个**版本节点**最多 1 个 npm 包、最多 1 份文档、最多 12 张缩略图。\n\naction 对照表（32 个）：\n· 读/查询（GET 桶 30 次/分）\n  - packages：列出我的软件包。可选 status(逗号分隔 draft/reviewing/pending/approved/rejected)、limit(≤200)、offset。\n  - package：单个软件包全貌（含 subpacks/npm/docs/images/limits）。← 别名 info 会额外带 npm 概览\n  - subpacks：某软件包下的普通包列表\n  - subpack：单个普通包（含文件），需 id\n  - files：包内文件列表，需 kind(subpack/npm) + id\n  - docs：文档列表 / doc：取回文档正文（用 asset_id，或 package_id+doc_name）\n  - images：缩略图列表（走 get 桶）\n  - npm：npm 包详情（无则 data.npm 为 null）/ npm_files：npm 包内文件清单（按入口优先级排序），需 id\n  - review：审查/审核状态，含 package_ready（发布条件检查），需 kind + id\n· 写（POST 桶 20 次/分）\n  - package_create：新建软件包，需 package_id（仅字母数字与 . _ -，≥2 字符，创建后不可改）+ 可选 package_name(≤80)/desc(≤300)/tag(≤60)/enable。**给已有软件包加版本**：package_id 缀 @版本号（如 demo@2.0.0），返回 created=false 表示只加了节点\n  - package_update：改名/描述/标签/启用，需 package_id 或 id + 至少一个新值（作用于整个软件包，**不能带版本**）\n  - package_delete：删除软件包及其全部内容（不可恢复，已上架会先下架）。**带 @版本号 = 只删该版本节点**（至少留一个），返回 scope 告知实际动作\n  - subpack_create：新建普通包，需 key（包内唯一，如 main）+ 可选 file_name（服务端补 .zip）→ 拿返回 id\n  - subpack_delete / subpack_iterate：删 / 退回归档状态以便改文件（保留 key 与归档名），需 id\n  - file_upload：上传包内文件，需 kind + id + file_path（本地路径）+ 可选 entry（包内相对路径，同名覆盖）。限制：单文件默认 2MB、单包默认 50 个、仅代码/文本、entry 不许 .. 与绝对路径\n  - file_delete：删包内文件，需 kind + id + file_id（需包为 draft/rejected）\n  - archive：归档并触发审查，需 kind + id\n  - review_step：前台推进审查（兜底，正常不用；勿当轮询）\n  - doc_save：在线保存文档，需 package_id 或 id + doc_name(扩展名 .md) + content(≤512KB)\n  - asset_upload：上传缩略图/文档，需 asset_kind(image/doc) + package_id + file_path（image 限 5MB、png/jpg/jpeg/gif/webp/avif；doc 限 2MB、md/markdown/txt）\n  - asset_delete：删资产，需 asset_kind + asset_id 或 package_id+doc_name/image_name\n  - npm_create：建归档式 npm 包，需 package_id 或 id + npm_name（可含 @scope）+ 可选 npm_version/npm_main/npm_bin/npm_type(module|commonjs)/npm_license/npm_desc/npm_keywords/npm_deps/npm_peer_deps/npm_engines/npm_files/npm_types/npm_scope/npm_component。⚠ 不填 npm_bin 时 npx 跑不起来；每个版本节点最多 1 个 npm 包\n  - npm_declare：建声明式 npm 包（指向已归档的普通包，不重打包），需 package_id 或 id + src_subpack(已归档普通包 ID) + npm_name 等\n  - npm_update：改 npm 元数据，需 id + 任意 npm_* 字段 / npm_delete：删 npm 包，需 id\n  - publish：同步到市场，需 package_id 或 id（必须全部过审，否则报差哪些）。**带 @版本号 = 把最新版本指针指到它** / unpublish：从市场下架（作用于整个软件包，不能带版本）\n· 下载\n  - download：下载归档产物（subpack→.zip / npm→.tgz），需 kind + id + save_path（本地保存路径）。限 file_dl 桶 3 次/分\n  - image：下载缩略图本体，需 asset_id 或 package_id+image_name + save_path。限 image_dl 桶 1 次/分\n\n典型链路：首次投稿：package_create → subpack_create(拿 id) → file_upload 逐个传 → archive → review 轮询直到 approved → doc_save/asset_upload 补文档缩略图 → publish。\n 更新包体：subpack_iterate → file_upload → archive → review → publish。\n 发 npm 包：package_create → npm_create(拿 id) → file_upload(kind=npm) → npm_update 补 npm_main → archive → review → publish。\n 发布新版本：package_create(package_id=demo@2.0.0) → 在 node=<新节点> 上重复 subpack_create/file_upload/archive → publish(package_id=demo@2.0.0)。\n\n状态机：draft 编辑中（可改文件）→ reviewing 归档中(AI 审查) → pending 待审核 / approved 已通过（可 publish）/ rejected 已驳回（看 package.admin_reply，改完重归档）。注意：『软件包整体』也是一个发布条件。\n\n错误码：401 缺/错 token；403 未勾作用域或操作他人资源；404 定位参数没给全/包不存在/还没归档就下载；429 触发限流，按 retry_after 秒退避（读 30/分、写 20/分、下载 3/分、图 1/分）；400 业务失败（如『该包已归档』需先 subpack_iterate）。",
                "en": "Chenchui resource-center (resource_center) submission client — manage packages under your account: query, create packages, upload code files, archive/review, save docs/thumbnails, create npm packages, publish to market.\n\nPrerequisite: fill in the Chenchui API token in opm settings. The API Key must have the resource_center scope enabled, otherwise every call returns 403 'Permission denied for this API'.\n\nLocating: software package (locate by package_id/id) -> contains subpack(s) or npm package -> contains files.\n\nVersion nodes: a package = one project cluster; the cluster holds several version nodes; each node has its own isolated set of subpacks / npm package / docs / thumbnails. Add node (numeric node id, highest priority) or version (e.g. 1.0.1 / v2 / latest) to target a node.\n  - Neither given = the package latest node (old calls unchanged). latest = the unversioned initial node.\n  - package_create with @version suffix (e.g. package_id=demo@2.0.0) = add a new version node to an existing package (without suffix = create the whole package). When adding a node, package_name/desc/tag/enable are ignored (cluster-level fields, only written on cluster creation).\n  - package_delete with @version = delete that single node (must keep at least one); returns scope: version=node only, package=whole package.\n  - publish with @version = point the latest-version pointer at it (the sync itself still rebuilds the whole cluster).\n  - WARNING: package_update and unpublish act on the WHOLE package and do NOT accept a version suffix (400 if given).\n  - Limits apply per version node: at most 1 npm package, 1 doc, 12 thumbnails.\n\nAction reference (32):\n· Read (GET bucket, 30/min)\n  packages (list mine; optional status/limit/offset), package (full detail; alias info adds npm overview), subpacks, subpack (needs id), files (needs kind+id), docs, doc (asset_id or package_id+doc_name), images, npm (data.npm null if none), npm_files (needs id), review (has package_ready; needs kind+id)\n· Write (POST bucket, 20/min)\n  package_create (needs package_id: [A-Za-z0-9._-], >=2 chars, immutable; optional package_name<=80/desc<=300/tag<=60/enable; add @version suffix to add a version node, returns created=false), package_update (package_id|id + at least one new value; whole package, no version), package_delete (irreversible; @version = delete only that node, returns scope), subpack_create (needs key; optional file_name; returns id), subpack_delete, subpack_iterate (reopen for edits, keeps key & file name), file_upload (kind+id+file_path, optional entry; limits: 2MB/file, 50 files, code/text only, no .. or abs paths), file_delete (kind+id+file_id; only draft/rejected), archive (kind+id), review_step (fallback, not a poll), doc_save (package_id|id + doc_name(.md) + content<=512KB), asset_upload (asset_kind image|doc + package_id + file_path; image<=5MB png/jpg/jpeg/gif/webp/avif, doc<=2MB md/markdown/txt), asset_delete (asset_kind + asset_id or package_id+doc_name/image_name), npm_create (package_id|id + npm_name(+optional npm_version/npm_main/npm_bin/npm_type/npm_license/npm_desc/npm_keywords/npm_deps/npm_peer_deps/npm_engines/npm_files/npm_types/npm_scope/npm_component); WARNING: without npm_bin, npx won't work; at most 1 npm package per version node), npm_declare (package_id|id + src_subpack(archived subpack id) + npm_name...), npm_update (id + any npm_* field), npm_delete (id), publish (package_id|id; requires all approved; @version = set latest pointer), unpublish (whole package, no version)\n· Download\n  download (kind+id+save_path; subpack->.zip, npm->.tgz; file_dl 3/min), image (asset_id or package_id+image_name + save_path; image_dl 1/min)\n\nTypical flows: first submission = package_create -> subpack_create -> file_upload -> archive -> poll review until approved -> doc_save/asset_upload -> publish. Update package = subpack_iterate -> file_upload -> archive -> review -> publish. Publish npm = package_create -> npm_create -> file_upload(kind=npm) -> npm_update(npm_main) -> archive -> review -> publish. New version = package_create(package_id=demo@2.0.0) -> repeat content ops on node=<new node> -> publish(package_id=demo@2.0.0). publish.\n\nState machine: draft (editable) -> reviewing (AI review) -> pending / approved (can publish) / rejected (check package.admin_reply, re-archive after fixing). Note: the software package itself is also a publish condition.\n\nError codes: 401 missing/invalid token; 403 missing scope or not your resource; 404 incomplete locator / not found / not archived yet; 429 rate limited, back off retry_after seconds (read 30/min, write 20/min, download 3/min, image 1/min); 400 business failure (e.g. 'package already archived' -> call subpack_iterate first)."
            },
            "parameters": [
                {
                    "name": "action",
                    "description": { "zh": "操作名（见工具描述 action 对照表）。读：packages/package/subpacks/subpack/files/docs/doc/images/npm/npm_files/review；写：package_create/package_update/package_delete/subpack_create/subpack_delete/subpack_iterate/file_upload/file_delete/archive/review_step/doc_save/asset_upload/asset_delete/npm_create/npm_declare/npm_update/npm_delete/publish/unpublish；下载：download/image。另支持语义别名 list(≈packages)/info(≈package+npm)。", "en": "Action name (see description). Aliases: list (~packages), info (~package+npm)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "package_id",
                    "description": { "zh": "软件包 PackageID（定位用；与 id 二选一，id 优先）", "en": "Software package PackageID (locator; id takes priority)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "id",
                    "description": { "zh": "包/软件包的数字 ID（软件包定位时优先于 package_id；subpack/files/npm/archive/download 等则直接指向包 ID）", "en": "Numeric id of package/subpackage" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "kind",
                    "description": { "zh": "包类型：subpack（普通包，默认）/ npm。files/file_upload/file_delete/archive/review/download 用", "en": "Package kind: subpack (default) / npm" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "node",
                    "description": { "zh": "版本节点数字 ID（可选）。限定操作到某个版本节点，优先级最高。与 version 二选一。", "en": "Version node numeric ID (optional). Highest priority; alternative to version." },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "version",
                    "description": { "zh": "版本号（可选）。按版本号定位版本节点，如 1.0.1、v2、latest。与 node 二选一。", "en": "Version string (optional), e.g. 1.0.1 / v2 / latest. Alternative to node." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "status",
                    "description": { "zh": "packages 的状态过滤，多值逗号分隔：draft/reviewing/pending/approved/rejected", "en": "Status filter for packages (comma-separated)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "limit",
                    "description": { "zh": "packages 分页条数（默认 50，上限 200）", "en": "Page size for packages (default 50, max 200)" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "offset",
                    "description": { "zh": "packages 分页偏移（默认 0）", "en": "Offset for packages (default 0)" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "package_name",
                    "description": { "zh": "软件包显示名（package_create/package_update 用，≤80 字符）", "en": "Package display name (<=80 chars)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "desc",
                    "description": { "zh": "软件包描述（package_create/package_update 用，≤300 字符）", "en": "Package description (<=300 chars)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "tag",
                    "description": { "zh": "软件包标签（package_create/package_update 用，≤60 字符）", "en": "Package tag (<=60 chars)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "enable",
                    "description": { "zh": "是否启用（package_create/package_update 用）", "en": "Enable flag" },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "key",
                    "description": { "zh": "普通包组件键（subpack_create 必填，包内唯一，如 main）", "en": "Subpack component key (unique, e.g. main)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "file_name",
                    "description": { "zh": "普通包归档名主体（subpack_create 用，扩展名服务端补 .zip）", "en": "Subpack archive base name" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "file_path",
                    "description": { "zh": "要上传的本地文件绝对路径（file_upload/asset_upload 用）", "en": "Local absolute file path to upload" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "entry",
                    "description": { "zh": "包内相对路径（file_upload 用，如 src/util.js；同名覆盖；不许 .. 或绝对路径）", "en": "In-package relative path (file_upload)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "file_id",
                    "description": { "zh": "包内文件 ID（file_delete 用，取自 files 返回的 items[].id）", "en": "File id (file_delete)" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "doc_name",
                    "description": { "zh": "文档发布名（doc_save/doc/asset_delete 用，扩展名固定 .md）", "en": "Doc publish name (.md)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "content",
                    "description": { "zh": "文档正文（doc_save 用，UTF-8，≤512KB）", "en": "Doc content (<=512KB)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "asset_kind",
                    "description": { "zh": "资产类型：image（缩略图，默认）/ doc（文档）。asset_upload/asset_delete 用", "en": "Asset kind: image (default) / doc" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "asset_id",
                    "description": { "zh": "资产 ID（doc/image/asset_delete/doc_save 改写时用；给了它就不用给软件包定位）", "en": "Asset id" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "image_name",
                    "description": { "zh": "缩略图发布名（image/asset_delete 用，如 logo.png）", "en": "Image publish name" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "src_subpack",
                    "description": { "zh": "源普通包 ID（npm_declare 用，必须已归档）", "en": "Source subpack id (npm_declare, must be archived)" },
                    "type": "number",
                    "required": false
                },
                {
                    "name": "save_path",
                    "description": { "zh": "下载保存到的本地绝对路径（download/image 用）", "en": "Local absolute save path (download/image)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_name",
                    "description": { "zh": "npm 包名（npm_create/npm_declare 必填，可含 @scope/pkg，作用域会自动拆出）", "en": "npm package name (can include @scope)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_version",
                    "description": { "zh": "npm 版本（默认 1.0.0）", "en": "npm version (default 1.0.0)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_main",
                    "description": { "zh": "npm 入口文件（包内相对路径）", "en": "npm main entry (relative path)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_bin",
                    "description": { "zh": "npm 可执行入口（不填它 npx 跑不起来）", "en": "npm bin (needed for npx)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_type",
                    "description": { "zh": "npm 模块类型：module（import）/ commonjs（require）", "en": "npm module type: module / commonjs" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_license",
                    "description": { "zh": "npm 许可证 SPDX 标识（如 MIT；专有写 UNLICENSED）", "en": "npm SPDX license (e.g. MIT; UNLICENSED)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_desc",
                    "description": { "zh": "npm 描述", "en": "npm description" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_keywords",
                    "description": { "zh": "npm 关键词（逗号/空格分隔，或 JSON 数组串）", "en": "npm keywords" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_deps",
                    "description": { "zh": "npm 依赖（JSON 对象串或 包名@版本 分隔串）", "en": "npm dependencies" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_peer_deps",
                    "description": { "zh": "npm peer 依赖（格式同 npm_deps）", "en": "npm peerDependencies" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_engines",
                    "description": { "zh": "npm 运行环境（如 node@>=18）", "en": "npm engines" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_files",
                    "description": { "zh": "npm 发布白名单（如 dist, index.js）", "en": "npm files whitelist" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_types",
                    "description": { "zh": "npm 的 .d.ts 声明位置", "en": "npm types (.d.ts) path" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_scope",
                    "description": { "zh": "npm 作用域名（不带 @；通常从 npm_name 自动拆出）", "en": "npm scope (without @)" },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "npm_component",
                    "description": { "zh": "npm 关联的组件键", "en": "npm associated component key" },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "build",
            "description": {
                "zh": "把 Operit 工程打成可直接烧录/分发的 .toolpkg。流程：编译（仅 TS）→ 处理包 → 打包。无需另用终端手动 tsc / 压缩。\n\n模式（自动识别）：\n- TS：有 tsconfig.json 或 src 下有 .ts → 先编译（tsconfig 的 outDir，未声明用 .opm_build/）。\n- JS：其余 → 不编译，项目下所有 .js/.mjs/.cjs 进包。\n\n要求：\n- 项目根有 manifest.json（含 main）。\n- 已装 @serveryyswys/node.operit（项目内或 /usr/lib/node_modules）。\n\n处理包阶段的行为保证：\n- 收集 manifest.main + subpackages[].entry + 声明的 ui 模块，及其 require 链上的文件。\n- 裸名 require 重写为归档内显式 .js 相对路径（node 内建 → node.operit 子文件；npm 包 → node_modules 入口；lodash/uuid/axios 保持原样）。\n- 契约中 status 为 planned / unsupported 的内建使用 → 失败。\n- 入口注入 process / Buffer。\n\n参数：\n- project_dir：项目根目录（必填）。\n- skip_compile：默认 false；true 跳过编译。\n- out_name：产物名（不含 .toolpkg），默认项目根目录名。\n- out_dir：产物目录，默认项目根上一级。\n- extra_files：额外打包路径数组（相对项目根），条目可为文件或目录（目录递归收集）。\n\n返回：data.toolpkg_path（产物绝对路径）；data.file_count / bare_names / violations / missing。\n\n失败时 data.stage 取值与对应排查字段：\n- manifest：manifest.json 缺失或解析失败\n- contract：未装 node.operit\n- compile：tsc 报错（data.compile_stdout）\n- contract-check：使用了 planned/unsupported 内建（data.violations）\n- reachability：require 解析不出（data.missing）\n- dynamic-require：动态 require 无法确定前缀\n- pack：压缩失败\n\n仅校验不产文件用 verify。",
                "en": "Pack an Operit project into a flashable/distributable .toolpkg. Flow: compile (TS only) -> process packages -> pack. No need to run tsc / zip manually via terminal.\n\nMode (auto-detected):\n- TS: tsconfig.json present or .ts under src/ -> compiles first (tsconfig outDir; .opm_build/ if undeclared).\n- JS: otherwise -> no compile; all .js/.mjs/.cjs under the project are included.\n\nRequirements:\n- manifest.json in the project root (with main).\n- @serveryyswys/node.operit installed (in-project or /usr/lib/node_modules).\n\nPackage-processing guarantees:\n- Collects manifest.main + subpackages[].entry + declared ui modules, and files on their require chains.\n- Rewrites bare requires into explicit archive-relative .js paths (node builtins -> node.operit subfiles; npm packages -> node_modules entry; lodash/uuid/axios kept as-is).\n- Using a builtin whose contract status is planned/unsupported -> fails.\n- Injects process / Buffer at the entry.\n\nParameters:\n- project_dir: project root (required).\n- skip_compile: default false; true skips compilation.\n- out_name: artifact name without .toolpkg; defaults to the project folder name.\n- out_dir: output dir; defaults to the project root's parent.\n- extra_files: extra paths (relative to project root); entries may be files or directories (directories collected recursively).\n\nReturns: data.toolpkg_path (absolute path); data.file_count / bare_names / violations / missing.\n\nOn failure, data.stage and its field:\n- manifest: manifest.json missing or unparsable\n- contract: node.operit not installed\n- compile: tsc error (data.compile_stdout)\n- contract-check: planned/unsupported builtin used (data.violations)\n- reachability: unresolvable require (data.missing)\n- dynamic-require: dynamic require with no determinable prefix\n- pack: zip failed\n\nUse verify to validate without producing files."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录的绝对路径。必须含 manifest.json（带 main 字段），且已安装 node.operit（node_modules/@serveryyswys/node.operit）。例：/sdcard/Download/myproj", "en": "Absolute path of the project root. Must contain manifest.json (with main) and have node.operit installed. e.g. /sdcard/Download/myproj" },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "skip_compile",
                    "description": { "zh": "可选，默认 false。传 true 跳过 tsc，直接用已有的 .opm_build/ 编译产物（用于调试或源码已手动编好时）。注意：此时需确保 .opm_build/ 内容是最新的。", "en": "Optional, default false. If true, skip tsc and reuse the existing .opm_build/ output (for debugging or when sources were compiled manually). Ensure .opm_build/ is up to date." },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "out_name",
                    "description": { "zh": "可选。产物文件名（不含 .toolpkg 后缀），默认取项目根目录名。例：传 \"myproj\" 得到 myproj.toolpkg。", "en": "Optional. Output file name without the .toolpkg suffix; defaults to the project root folder name." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "out_dir",
                    "description": { "zh": "可选。产物落盘目录（绝对路径），默认写到项目根的上一级目录。例：传 \"/sdcard/Download/dist\" 则 .toolpkg 落到该目录。", "en": "Optional. Absolute directory to place the .toolpkg; defaults to the parent of the project root." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "extra_files",
                    "description": { "zh": "可选。要额外强制打包的路径数组（相对项目根，如 [\"LICENSE\", \"assets\"]）。条目可以是文件或目录：文件原样复制；目录会递归收集其下全部文件（保持目录结构）。这些都不在 require 链上，原样复制进归档（不做重写）。适合把 LICENSE / README / 资源目录等带进发行包。", "en": "Optional. Array of extra paths (relative to project root, e.g. [\"LICENSE\",\"assets\"]). Entries may be files or directories; directories are recursively collected (structure preserved). All copied verbatim (no rewrite)." },
                    "type": "array",
                    "required": false
                },
                {
                    "name": "PACKINFO",
                    "description": { "zh": "可选。生成市场审核用的打包信息核对文件 PACKINFO（无扩展名，YAML，写在归档根）。仅当该对象里 enable=true 时生成；不填 / enable 非 true 则不生成（PACKINFO 是可选字段）。\n\n⚠️ license 关键：发布前必须先问用户『这个包是否需要开源』。\n- 需要开源 → 必须写许可证，并根据用户使用的语言与之沟通、征求意见后选定一个合适的开源许可证（如 MIT / Apache-2.0 / GPL-3.0）。切勿在用户未确认的情况下擅自贴 MIT 之类的许可证。\n- 不开源 → 不写 license 字段（该行自然省略）。\n\nevidence：字段取『参数 > manifest』，都没有就省略该行：\n- license：许可证 SPDX 标识（如上，manifest 无 license 时由此补）\n- author：作者（manifest 的 author 缺失时由此补）\n- name / description / version：包名 / 描述 / 版本（manifest 缺失时由此补）\n- enable：true 才生成\n\ndependencies 自动生成（可达性分析收集的依赖，按作用域/包名去重），无需手填；不列举 extra_files。\n\n例：{\"enable\":true,\"license\":\"MIT\"} 或 {\"enable\":true,\"license\":\"Apache-2.0\",\"author\":\"xxx\"}", "en": "Optional. Emits a market-review PACKINFO file (no extension, YAML, at archive root). Generated ONLY when the object's enable=true; omitted if not provided or enable is not true (PACKINFO is optional).\n\n⚠️ license is key: before publishing you MUST ask the user whether the package should be open source.\n- Open source -> a license is required; discuss with the user in their language and pick a suitable OSS license (e.g. MIT / Apache-2.0 / GPL-3.0) with their consent. Never slap on MIT etc. without the user's confirmation.\n- Not open source -> omit the license field (the line is simply skipped).\n\nFields take 'param > manifest'; each is skipped if absent in both:\n- license: SPDX identifier (fills manifest's missing license)\n- author / name / description / version: fill manifest's missing fields\n- enable: true to generate\n\ndependencies is generated automatically (deps collected by reachability, deduped by scope/package name); no manual input. extra_files are NOT listed.\n\nExample: {\"enable\":true,\"license\":\"MIT\"} or {\"enable\":true,\"license\":\"Apache-2.0\",\"author\":\"xxx\"}", "en_note": "" },
                    "type": "object",
                    "required": false
                }
            ]
        },
        {
            "name": "verify",
            "description": {
                        "zh": "校验工程，不产出文件。流程：编译（仅 TS）→ 处理包 → 模拟加载。\n\n参数：\n- project_dir：项目根目录（必填，含 manifest.json）。\n- skip_compile：默认 false；true 跳过编译。\n- extra_files：额外路径数组，同 build。\n\n模拟加载：\n- 注册期：检查 main 脚本的 registerToolPkg 定义，列出其调用的 ToolPkg.registerXxx。\n- 子包 metadata：对每个 subpackages[].entry 抽取 METADATA 注释块，用 hjson 解析，校验 name / tools 及每个 tool 的 name / description / parameters。\n\n失败时 data.stage 取值：manifest / contract / compile / contract-check / reachability / simulate。\n\n产出 .toolpkg 用 build。",
                        "en": "Validate a project without producing files. Flow: compile (TS only) -> process packages -> simulated load.\n\nParameters:\n- project_dir: project root (required, with manifest.json).\n- skip_compile: default false; true skips compilation.\n- extra_files: extra paths, same as build.\n\nSimulated load:\n- Registration: checks the main script's registerToolPkg definition and lists the ToolPkg.registerXxx it calls.\n- Subpackage metadata: for each subpackages[].entry, extracts the METADATA comment block, parses it with hjson, and validates name / the tools array and each tool's name / description / parameters.\n\nOn failure, data.stage: manifest / contract / compile / contract-check / reachability / simulate.\n\nUse build to produce a .toolpkg."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录的绝对路径（需含 manifest.json，且已安装 node.operit）。", "en": "Absolute path of the project root (needs manifest.json and node.operit installed)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "skip_compile",
                    "description": { "zh": "可选，默认 false。传 true 跳过 tsc，直接用已有的 .opm_build/ 编译产物。", "en": "Optional, default false. If true, skip tsc and reuse the existing .opm_build/ output." },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "extra_files",
                    "description": { "zh": "可选。与 build 的 extra_files 对应（同样支持文件或目录），用于校验这些额外路径是否存在且未被排除。", "en": "Optional. Same as build extra_files; validates the extra files exist and are not excluded." },
                    "type": "array",
                    "required": false
                }
            ]
        },
        {
            "name": "pack",
            "description": {
                "zh": "把项目目录打成 npm 兼容的 .tgz（等价 npm pack）。按当前目录状态打包，不编译。\n\n参数：\n- project_dir：项目根目录（必填，含 package.json）。\n- out_dir：产物目录，默认项目根。\n- out_name：产物名（不含 .tgz），默认 <name>-<version>。\n\n打包范围：项目文件排除 node_modules / .opm_build / .opm_stage / .git，以 package/ 为顶层前缀。\n\n返回：data.tgz_path（产物绝对路径）/ file_count / name / version。\n\n出 .toolpkg 用 build。",
                "en": "Pack a project directory into an npm-compatible .tgz (equivalent to npm pack). Packs the current directory state; does not compile.\n\nParameters:\n- project_dir: project root (required, with package.json).\n- out_dir: output dir; defaults to the project root.\n- out_name: artifact name without .tgz; defaults to <name>-<version>.\n\nScope: project files excluding node_modules / .opm_build / .opm_stage / .git, with package/ as the top-level prefix.\n\nReturns: data.tgz_path (absolute path) / file_count / name / version.\n\nUse build for .toolpkg."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径（需含 package.json）。", "en": "Absolute project root (must contain package.json)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "out_dir",
                    "description": { "zh": "可选。产物输出目录绝对路径，默认项目根。", "en": "Optional. Absolute output dir for the .tgz; defaults to the project root." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "out_name",
                    "description": { "zh": "可选。产物文件名（不含 .tgz），默认 <name>-<version>。", "en": "Optional. Output file name without .tgz; defaults to <name>-<version>." },
                    "type": "string",
                    "required": false
                }
            ]
        },
        {
            "name": "version",
            "description": {
                "zh": "列出已装包与版本。\n\n参数：\n- project_dir：项目根目录。不传则列 /usr/lib/node_modules。\n- include_global：默认 false；true 时在项目视图里一并列出全局包。\n\n传 project_dir 时列出：项目自身 / 项目 node_modules 全部已装包 / opm 自身版本。\n\n返回：data.mode（project / global）、data.self、data.deps、data.globals、data.opm；global 模式另带 data.global_root。",
                "en": "List installed packages and versions.\n\nParameters:\n- project_dir: project root. If omitted, lists /usr/lib/node_modules.\n- include_global: default false; if true, also lists global packages alongside the project view.\n\nWith project_dir: lists the project itself / all packages in the project's node_modules / opm's own version.\n\nReturns: data.mode (project / global), data.self, data.deps, data.globals, data.opm; global mode also returns data.global_root."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径（可选）。不传则直接列 npm 全局安装目录（/usr/lib/node_modules）。", "en": "Absolute project root (optional). If omitted, lists the npm global dir (/usr/lib/node_modules) directly." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "include_global",
                    "description": { "zh": "可选，默认 false。传 true 时在项目视图里一并列出全局已装包。", "en": "Optional, default false. If true, also lists global packages alongside the project view." },
                    "type": "boolean",
                    "required": false
                }
            ]
        },
        {
            "name": "license",
            "description": {
                "zh": "为项目生成许可证文件，并把版权声明写进入口源码。\n\n产物（项目根目录）：\n- LICENSE：所选许可证全文（原文取自权威来源，逐字节一致）。\n- NOTICE：仅 Apache-2.0 生成（其条款要求随分发附带归属声明）；其余许可证不生成。\n\n副作用：\n- 给 manifest.main 指向的入口**源文件**（如 main.ts）插入 SPDX 版权头注释；已有头部会被保留原作者（除非显式传 author/yearrange）。\n- 把规范 SPDX 标识符写入 package.json 的 license 字段（遵循 SPDX）。\n\n关于 GPL 系：GPL-3.0-only 与 GPL-3.0-or-later 的**许可证正文完全相同**（AGPL / LGPL 同理），区别只在 SPDX 标识符与源码版权头里「or any later version」那句。正文文末「How to Apply These Terms」附录中的示例版权行会被填成你的信息。LGPL-3.0 的 LICENSE 由 GPL-3.0 全文 + LGPL 附加条款拼接而成。\n\n参数：\n- project_dir：项目根目录（必填）。\n- type：许可证类型（必填）。支持 SPDX 标识符：MIT / Apache-2.0 / GPL-3.0-only / GPL-3.0-or-later / AGPL-3.0-only / AGPL-3.0-or-later / LGPL-3.0-only / LGPL-3.0-or-later / BSD-3-Clause / BSD-2-Clause / ISC / MPL-2.0 / Unlicense，也接受常见别名（mit / apache / gpl3 / GPL-3.0+ / bsd3 等）。传 custom 表示自定义许可证（此时必须给 custom_content）。\n- author：版权人。原样落笔，大小写不做改动。不传则依次取 manifest.author[0] / package.json.author。\n- yearrange：年份或区间，如 2026 或 2024-2026。不传则用当前年份。\n- overwrite：默认 false。项目根已有 LICENSE 时默认不覆盖，只在 warnings 里提示；传 true 才替换。\n- custom_content：type=custom 时的许可证正文，原样写入 LICENSE，不做占位符替换。此时 package.json 的 license 字段写为 'SEE LICENSE IN LICENSE'（npm 对自定义许可证的约定）。\n\n返回：data.spdx / year / author / written / headered / package_json_updated / license_skipped / warnings。",
                "en": "Generate a license file for the project and stamp the copyright notice into the entry source.\n\nOutputs (project root):\n- LICENSE: full text of the chosen license (verbatim from authoritative sources, byte-identical).\n- NOTICE: generated only for Apache-2.0 (its terms require shipping attribution notices); other licenses get none.\n\nSide effects:\n- Inserts an SPDX copyright header into the entry **source** file that manifest.main resolves to (e.g. main.ts); an existing header keeps its original copyright holder unless author/yearrange is explicitly passed.\n- Writes the canonical SPDX identifier into package.json's license field.\n\nAbout the GPL family: GPL-3.0-only and GPL-3.0-or-later share the **exact same license body** (same for AGPL / LGPL); they differ only in the SPDX identifier and in the 'or any later version' sentence of the source header. The example copyright lines inside the trailing 'How to Apply These Terms' appendix are filled with your information. LGPL-3.0's LICENSE is the full GPL-3.0 text followed by the LGPL additional permissions.\n\nParameters:\n- project_dir: project root (required).\n- type: license type (required). Accepts SPDX ids: MIT / Apache-2.0 / GPL-3.0-only / GPL-3.0-or-later / AGPL-3.0-only / AGPL-3.0-or-later / LGPL-3.0-only / LGPL-3.0-or-later / BSD-3-Clause / BSD-2-Clause / ISC / MPL-2.0 / Unlicense, plus common aliases (mit / apache / gpl3 / GPL-3.0+ / bsd3 ...). Pass 'custom' for a custom license (then custom_content is required).\n- author: copyright holder, written verbatim (case preserved). Falls back to manifest.author[0], then package.json.author.\n- yearrange: year or range, e.g. 2026 or 2024-2026. Defaults to the current year.\n- overwrite: default false. An existing LICENSE is left untouched (reported in warnings); pass true to replace it.\n- custom_content: the license text used when type=custom, written verbatim into LICENSE with no placeholder substitution. package.json's license field then becomes 'SEE LICENSE IN LICENSE' (the npm convention for custom licenses).\n\nReturns: data.spdx / year / author / written / headered / package_json_updated / license_skipped / warnings."
            },
            "parameters": [
                {
                    "name": "project_dir",
                    "description": { "zh": "项目根目录绝对路径（需含 manifest.json 或 package.json）。", "en": "Absolute project root (must contain manifest.json or package.json)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "type",
                    "description": { "zh": "许可证类型。SPDX 标识符或常见别名：MIT / Apache-2.0 / GPL-3.0-only / GPL-3.0-or-later / AGPL-3.0-* / LGPL-3.0-* / BSD-3-Clause / BSD-2-Clause / ISC / MPL-2.0 / Unlicense；别名 mit / apache / gpl3 / GPL-3.0+ / bsd3 / MPL 等亦可。", "en": "License type: SPDX id or common alias (MIT / Apache-2.0 / GPL-3.0-only / GPL-3.0-or-later / AGPL-3.0-* / LGPL-3.0-* / BSD-3-Clause / BSD-2-Clause / ISC / MPL-2.0 / Unlicense; aliases like mit / apache / gpl3 / GPL-3.0+ / bsd3 / MPL also work)." },
                    "type": "string",
                    "required": true
                },
                {
                    "name": "author",
                    "description": { "zh": "可选。版权人。不传则取 manifest.author[0]，再退到 package.json.author。", "en": "Optional. Copyright holder. Falls back to manifest.author[0], then package.json.author." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "yearrange",
                    "description": { "zh": "可选。年份或区间，如 2026 / 2024-2026。不传则用当前年份。", "en": "Optional. Year or range, e.g. 2026 / 2024-2026. Defaults to the current year." },
                    "type": "string",
                    "required": false
                },
                {
                    "name": "overwrite",
                    "description": { "zh": "可选，默认 false。项目根已有 LICENSE 时默认不覆盖，只在返回的 warnings 里提示；传 true 才替换。", "en": "Optional, default false. If LICENSE already exists it is left untouched and a warning is returned; pass true to replace it." },
                    "type": "boolean",
                    "required": false
                },
                {
                    "name": "custom_content",
                    "description": { "zh": "可选。type=custom 时必填：自定义许可证正文。会原样写入 LICENSE（不做任何占位符替换）。非 custom 时忽略。此时 package.json 的 license 字段按 npm 约定写为 'SEE LICENSE IN LICENSE'。", "en": "Optional. Required when type=custom: the custom license text. Written verbatim into LICENSE (no placeholder substitution). Ignored otherwise. In this case package.json's license field becomes 'SEE LICENSE IN LICENSE' per npm convention." },
                    "type": "string",
                    "required": false
                }
            ]
        }
    ]
}
*/

import * as path from '../core/locker.js';
import { saveConfig, loadConfig, DEFAULT_REGISTRY } from '../core/config.js';
import { fetchCatalog, fetchDoc, parseSpec, resolveVersion, registryBase, readNpmrc, pickRegistry } from '../core/registry.js';
import { resolveDependencies } from '../core/resolver.js';
import { installResolved, installFromLock, writeLockFromResolved } from '../core/installer.js';
import {
    readPackageJson, writePackageJson, readLockfile, writeLockfile, emptyLockfile,
    nodeModulesDir, join
} from '../core/locker.js';
import * as chen from '../core/chenchui.js';
import { runBuild } from '../commands/build.js';
import { runVerify } from '../commands/verify.js';
import { installLocalTgz } from '../core/localinstall.js';
import { packProject } from '../core/pack.js';
import { collectVersions, readOpmSelfVersion } from '../core/version.js';
import { generateLicense } from '../licenser/index.js';
import { listGlobalPackages, globalRoot, removeGlobalPackage } from '../core/globalnpm.js';

declare const Tools: any;
declare const Java: any;
declare function complete(v: any): void;

function ok(data: any, message?: string): any {
    return { success: true, message: message || 'ok', data: data };
}
function fail(message: string, data?: any): any {
    return { success: false, message: message, data: data };
}

function splitList(s: string): string[] {
    if (!s) return [];
    return String(s).split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
}

/** 把参数规范成字符串数组（支持真数组 / JSON 字符串数组 / 逗号分隔串） */
function normStrArray(v: any): string[] {
    if (v === undefined || v === null) return [];
    if (Array.isArray(v)) return v.map((x: any) => String(x)).filter((x: string) => !!x.trim());
    const s = String(v).trim();
    if (!s) return [];
    if (s.startsWith('[')) {
        try {
            const arr = JSON.parse(s);
            if (Array.isArray(arr)) return arr.map((x: any) => String(x)).filter((x: string) => !!x.trim());
} catch (e) { /* fallthrough */ }
    }
    return splitList(s);
}
/**
 * 归一化 PACKINFO 参数（build 用）：
 *   - 传 object -> 直接用（enable 可为 bool 或 'true' 字符串）
 *   - 传 JSON 字符串 -> 解析成 object
 *   - 其它 / 空 -> undefined（不生成 PACKINFO）
 */
function normPackInfo(v: any): any {
    if (v === undefined || v === null) return undefined;
    if (typeof v === 'object' && !Array.isArray(v)) {
        const obj = Object.assign({}, v);
        if (typeof obj.enable === 'string') obj.enable = obj.enable.trim().toLowerCase() === 'true';
        return obj;
    }
    if (Array.isArray(v)) {
        // 空数组 = 不生成
        if (v.length === 0) return undefined;
        // 非空数组无意义，忽略
        return undefined;
    }
    const s = String(v).trim();
    if (!s) return undefined;
    if (s.startsWith('{')) {
        try {
            const parsed = JSON.parse(s);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                if (typeof parsed.enable === 'string') parsed.enable = parsed.enable.trim().toLowerCase() === 'true';
                return parsed;
            }
        } catch (e) { /* fallthrough */ }
    }
    return undefined;
}

// =============== init ===============

async function doInit(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');

    const cfg = await loadConfig();
    const cchRegistry = cfg.registry || DEFAULT_REGISTRY;
    const npmRegistry = 'https://registry.npmjs.org/';
    // 源选择：normal（默认，双源：官方主源 + @serveryyswys 走辰锤）/ cch（仅辰锤）/ npm（仅官方）
    // 显式传 registry 时优先于 source（自由 URL 覆盖）
    let source = String(params.source || '').trim().toLowerCase();
    if (source !== 'normal' && source !== 'cch' && source !== 'npm') source = '';
    let registry = npmRegistry;
    let npmrc = '';
    if (params.registry) {
        registry = String(params.registry);
        npmrc = 'registry=' + registry + '\n';
        source = source || 'custom';
    } else if (source === 'cch') {
        registry = cchRegistry;
        npmrc = 'registry=' + cchRegistry + '\n';
    } else if (source === 'npm') {
        registry = npmRegistry;
        npmrc = 'registry=' + npmRegistry + '\n';
    } else {
        // normal（默认）：双源
        source = 'normal';
        registry = npmRegistry;
        npmrc = 'registry=' + npmRegistry + '\n'
              + '@serveryyswys:registry=' + cchRegistry + '\n';
    }
    // 装 @serveryyswys/* 的源：normal 下走辰锤，否则跟主源
    const scopeRegistry = (source === 'normal' && !params.registry) ? cchRegistry : registry;

    // 1) 确保目录存在
    await Tools.Files.mkdir(projectDir, true);

    // 2) 写 .npmrc
    await Tools.Files.write(join(projectDir, '.npmrc'), npmrc);

    // 3) 写 package.json（已存在则保留）
    let pj = await readPackageJson(projectDir);
    let created = false;
    if (!pj) {
        pj = {
            name: params.name || basename(projectDir) || 'opm-project',
            version: params.version || '1.0.0',
            description: '',
            main: 'index.js',
            scripts: {},
            dependencies: {}
        };
        await writePackageJson(projectDir, pj);
        created = true;
    }

    // 4) 自动安装 node.operit 运行时补丁（@serveryyswys/* 走 scopeRegistry）
    let runtimeResult: any = null;
    if (cfg.autoInstallRuntime !== false && cfg.runtimePackage) {
        try {
            const spec = cfg.runtimePackage;
            const { name, range } = parseSpec(spec);
            const doc = await fetchDoc(name, scopeRegistry);
            const ver = resolveVersion(doc, range);
            if (ver) {
                const resolved = {
                    nodes: {
                        [name]: { name: name, version: ver.version, versionInfo: ver, deps: ver.dependencies || {}, isRoot: true }
                    },
                    warnings: []
                };
                const report = await installResolved(projectDir, resolved as any);
                // 写入依赖
                if (!pj.dependencies) pj.dependencies = {};
                pj.dependencies[name] = '^' + ver.version;
                await writePackageJson(projectDir, pj);
                await writeLockFromResolved(projectDir, resolved as any);
                runtimeResult = { name: name, version: ver.version, installed: report.installed.length > 0, report: report };
            } else {
                runtimeResult = { error: '找不到 ' + spec };
            }
        } catch (e) {
            runtimeResult = { error: String(e) };
        }
    }

    return ok({
        project_dir: projectDir,
        created_package_json: created,
        source: source,
        npmrc: npmrc.trim(),
        registry: registry,
        runtime: runtimeResult
    }, 'init 完成');
}

function basename(p: string): string {
    const parts = String(p).replace(/\/+$/, '').split('/');
    return parts[parts.length - 1] || '';
}

// =============== search ===============

async function doSearch(params: any): Promise<any> {
    const keyword = (params.keyword || '').trim().toLowerCase();
    let catalog: any[];
    try {
        catalog = await fetchCatalog();
    } catch (e) {
        return fail('搜索失败：' + String(e));
    }
    let results = catalog;
    if (keyword) {
        results = catalog.filter(p =>
            p.name.toLowerCase().indexOf(keyword) >= 0 ||
            (p.description || '').toLowerCase().indexOf(keyword) >= 0
        );
    }
    return ok({ count: results.length, results: results }, '找到 ' + results.length + ' 个包');
}

// =============== install ===============

async function doInstall(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    const save = params.save !== false;

    // 分支 A：安装本地 tgz
    const tgzPath: string = params.tgz_path;
    if (tgzPath) {
        const isGlobal = params.global === true;
        if (!isGlobal && !projectDir) return fail('项目安装需提供 project_dir（或传 global=true 装到全局）');
        try {
            const rep = await installLocalTgz({
                tgzPath: tgzPath,
                projectDir: projectDir,
                global: isGlobal,
                save: save && !isGlobal
            });
            if (!rep.ok) return fail(rep.message, rep);
            return ok(rep, rep.message);
        } catch (e) {
            return fail(String(e));
        }
    }

    // 分支 B：registry 安装
    if (!projectDir) return fail('缺少 project_dir');
    const specs: string[] = splitList(params.packages || '');
    let pj = await readPackageJson(projectDir);

    // 无参数：按 package.json 安装（含 lock 复装）
    const rootDeps: Record<string, string> = {};

    if (specs.length === 0) {
        if (!pj) return fail('项目没有 package.json，且未指定要安装的包');
        const deps = pj.dependencies || {};
        const devDeps = pj.devDependencies || {};
        Object.assign(rootDeps, devDeps, deps);
        if (Object.keys(rootDeps).length === 0) {
            return ok({ installed: [], message: '没有依赖需要安装' }, '无依赖');
        }
    } else {
        // 解析每个 spec 的 range（暂不预先拉 doc，交给 resolver）
        for (const s of specs) {
            const { name, range } = parseSpec(s);
            rootDeps[name] = range || 'latest';
        }
    }

    // 源策略：优先读项目 .npmrc（registry + @scope:registry），按包名分流
    const npmrc = await readNpmrc(projectDir);
    const cfg = await loadConfig();
    const mainRegistry = npmrc.registry || cfg.registry || DEFAULT_REGISTRY;
    const registryResolver = (name: string): string => {
        const picked = pickRegistry({ registry: mainRegistry, scopes: npmrc.scopes }, name);
        return picked || mainRegistry;
    };

    // 解析
    let resolved;
    try {
        resolved = await resolveDependencies(rootDeps, registryResolver, (m) => { /* progress */ });
    } catch (e) {
        return fail('依赖解析失败：' + String(e));
    }

    // 安装
    const report = await installResolved(projectDir, resolved);
    // 写 lock
    await writeLockFromResolved(projectDir, resolved);

    // 更新 package.json
    if (save && specs.length > 0) {
        if (!pj) {
            pj = { name: basename(projectDir) || 'opm-project', version: '1.0.0', dependencies: {} };
        }
        if (!pj.dependencies) pj.dependencies = {};
        for (const name of Object.keys(resolved.nodes)) {
            const node = resolved.nodes[name];
            if (node.isRoot) {
                pj.dependencies[name] = '^' + node.version;
            }
        }
        await writePackageJson(projectDir, pj);
    }

    return ok({
        installed: report.installed,
        skipped: report.skipped,
        warnings: report.warnings,
        total: report.installed.length
    }, '安装完成：成功 ' + report.installed.length + '，失败 ' + report.skipped.length);
}

// =============== remove ===============

async function doRemove(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    const names = splitList(params.packages || '');
    if (names.length === 0) return fail('缺少 packages');

    // 全局卸载模式
    if (params.global === true) {
        const removedG: string[] = [];
        const notFoundG: string[] = [];
        for (const name of names) {
            try {
                const r = await removeGlobalPackage(name);
                if (r.ok) removedG.push(name); else notFoundG.push(name);
            } catch (e) { notFoundG.push(name); }
        }
        return ok({ removed: removedG, not_found: notFoundG, mode: 'global' },
            '全局卸载完成：移除 ' + removedG.length + ' 个（' + globalRoot() + '）');
    }

    if (!projectDir) return fail('缺少 project_dir（或传 global=true 卸载全局包）');

    const removed: string[] = [];
    const notFound: string[] = [];

    for (const name of names) {
        const dir = join(nodeModulesDir(projectDir), name);
        try {
            const ex = await Tools.Files.exists(dir);
            if (ex && ex.exists) {
                await Tools.Files.deleteFile(dir, true);
                removed.push(name);
            } else {
                notFound.push(name);
            }
        } catch (e) {
            notFound.push(name);
        }
    }

    // 清理 package.json
    const pj = await readPackageJson(projectDir);
    if (pj) {
        for (const name of names) {
            if (pj.dependencies) delete pj.dependencies[name];
            if (pj.devDependencies) delete pj.devDependencies[name];
        }
        await writePackageJson(projectDir, pj);
    }

    // 清理 lockfile
    const lock = await readLockfile(projectDir);
    if (lock && lock.packages) {
        for (const name of names) {
            delete lock.packages['node_modules/' + name];
        }
        await writeLockfile(projectDir, lock);
    }

    return ok({ removed: removed, not_found: notFound }, '卸载完成：移除 ' + removed.length + ' 个');
}

// =============== pack ===============

async function doPack(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');
    try {
        const rep = await packProject({
            projectDir: projectDir,
            outDir: params.out_dir,
            outName: params.out_name
        });
        if (!rep.ok) return fail(rep.message, rep);
        return ok({ tgz_path: rep.tgzPath, file_count: rep.fileCount, name: rep.name, version: rep.version }, rep.message);
    } catch (e) {
        return fail(String(e));
    }
}

// =============== version ===============

async function doVersion(params: any): Promise<any> {
    // 不传 project_dir：默认列 npm 全局安装目录
    const projectDir: string = params.project_dir;
    const includeGlobal = params.include_global === true;
    try {
        if (!projectDir) {
            // 纯全局模式：直接列全局已装包 + opm 自身
            const g = await listGlobalPackages();
            const globals = g.map((x) => ({ name: x.name, version: x.version, source: 'global', dir: x.dir }));
            const opm = await readOpmSelfVersion();
            return ok({
                self: null,
                deps: [],
                globals: globals,
                opm: opm,
                mode: 'global',
                global_root: globalRoot()
            }, '全局安装目录（' + globalRoot() + '）：' + globals.length + ' 个包' + (opm ? '，opm=' + opm.version : ''));
        }
        const rep = await collectVersions(projectDir, includeGlobal);
        return ok({
            self: rep.self,
            deps: rep.deps,
            globals: rep.globals,
            opm: rep.opm,
            project_dir: rep.projectDir,
            mode: 'project'
        }, rep.message);
    } catch (e) {
        return fail(String(e));
    }
}

// =============== license ===============

async function doLicense(params: any): Promise<any> {
    const projectDir: string = params.project_dir;
    if (!projectDir) return fail('缺少 project_dir');
    if (!params.type) return fail('缺少 type（许可证类型，如 MIT / Apache-2.0 / GPL-3.0-or-later）');
    try {
        const rep = await generateLicense({
            projectDir: String(projectDir).replace(/[\/\\]+$/, ''),
            type: String(params.type),
            author: params.author !== undefined && params.author !== null ? String(params.author) : undefined,
            yearrange: params.yearrange,
            overwrite: params.overwrite === true,
            customContent: params.custom_content !== undefined && params.custom_content !== null
                ? String(params.custom_content) : undefined
        });
        const parts: string[] = [];
        parts.push(rep.spdx + ' · ' + rep.year + (rep.author ? ' ' + rep.author : ''));
        if (rep.licenseSkipped) parts.push('LICENSE 已存在（未覆盖）');
        else parts.push('写入 ' + rep.written.length + ' 个文件');
        if (rep.headered.length) parts.push('加头 ' + rep.headered.length + ' 个');
        if (rep.packageJsonUpdated) parts.push('package.json 已更新');
        const msg = parts.join(' · ') + (rep.warnings.length ? '｜注意：' + rep.warnings.join('；') : '');
        return ok({
            spdx: rep.spdx,
            year: rep.year,
            author: rep.author,
            written: rep.written,
            headered: rep.headered,
            package_json_updated: rep.packageJsonUpdated,
            license_skipped: rep.licenseSkipped,
            warnings: rep.warnings
        }, msg);
    } catch (e) {
        return fail(String((e as any) && (e as any).message ? (e as any).message : e));
    }
}

// =============== manager ===============

/**
 * manager：辰锤资源中心（resource_center）投稿客户端。
 * action 直接沿用辰锤原生 action 名（见 METADATA 对照表），另保留 list/info 语义别名。
 */
async function doManager(params: any): Promise<any> {
    const action = (params.action || '').trim();
    if (!action) return fail('缺少 action');

    // 通用定位参数（node / version 限定版本节点）
    const locator: any = {};
    if (params.id !== undefined && params.id !== null) locator.id = Number(params.id);
    if (params.package_id) locator.package_id = String(params.package_id);
    if (params.node !== undefined && params.node !== null && params.node !== '') locator.node = Number(params.node);
    if (params.version) locator.version = String(params.version);

    const kind = params.kind ? String(params.kind) : 'subpack';
    const pkgId: string | undefined = params.package_id ? String(params.package_id) : undefined;

    const hasLoc = () => Object.keys(locator).length > 0;
    const needPkg = (name: string) => {
        if (!hasLoc()) throw new Error(name + ' 需要 package_id 或 id');
    };
    const needId = (name: string) => {
        if (params.id === undefined || params.id === null) throw new Error(name + ' 需要 id');
    };

    try {
        // ---------- 读：软件包 ----------
        if (action === 'list' || action === 'packages') {
            return wrapChen(await chen.listPackages({
                status: params.status ? String(params.status) : undefined,
                limit: params.limit !== undefined ? Number(params.limit) : undefined,
                offset: params.offset !== undefined ? Number(params.offset) : undefined
            }));
        }
        if (action === 'info' || action === 'package') {
            needPkg('package');
            const pkg = await chen.getPackage(locator);
            // info 语义别名：顺带带上 npm 概览
            if (action === 'info') {
                const npm = await chen.getNpm(locator);
                return ok({ package: pkg.data, npm: npm.data }, '查询完成');
            }
            return wrapChen(pkg);
        }

        // ---------- 读：普通包与文件 ----------
        if (action === 'subpacks') { needPkg('subpacks'); return wrapChen(await chen.listSubpacks(locator)); }
        if (action === 'subpack') { needId('subpack'); return wrapChen(await chen.getSubpack(Number(params.id))); }
        if (action === 'files') { needId('files'); return wrapChen(await chen.listFiles(kind, Number(params.id))); }

        // ---------- 读：文档与缩略图 ----------
        if (action === 'docs') { needPkg('docs'); return wrapChen(await chen.listDocs(locator)); }
        if (action === 'doc') {
            return wrapChen(await chen.getDoc({
                asset_id: params.asset_id !== undefined ? Number(params.asset_id) : undefined,
                id: locator.id, package_id: locator.package_id,
                doc_name: params.doc_name ? String(params.doc_name) : undefined
            }));
        }
        if (action === 'images') { needPkg('images'); return wrapChen(await chen.listImages(locator)); }

        // ---------- 读：npm 与审查 ----------
        if (action === 'npm') { needPkg('npm'); return wrapChen(await chen.getNpm(locator)); }
        if (action === 'npm_files') { needId('npm_files'); return wrapChen(await chen.getNpmFiles(Number(params.id))); }
        if (action === 'review') { needId('review'); return wrapChen(await chen.getReview(kind, Number(params.id))); }

        // ---------- 写：软件包 ----------
        if (action === 'package_create') {
            if (!params.package_id) return fail('package_create 需要 package_id');
            return wrapChen(await chen.createPackage({
                package_id: String(params.package_id),
                package_name: params.package_name ? String(params.package_name) : undefined,
                desc: params.desc ? String(params.desc) : undefined,
                tag: params.tag ? String(params.tag) : undefined,
                enable: params.enable !== undefined ? !!params.enable : undefined
            }));
        }
        if (action === 'package_update') {
            needPkg('package_update');
            return wrapChen(await chen.updatePackage(locator, {
                package_name: params.package_name !== undefined ? String(params.package_name) : undefined,
                desc: params.desc !== undefined ? String(params.desc) : undefined,
                tag: params.tag !== undefined ? String(params.tag) : undefined,
                enable: params.enable !== undefined ? !!params.enable : undefined
            }));
        }
        if (action === 'package_delete') { needPkg('package_delete'); return wrapChen(await chen.deletePackage(locator)); }

        // ---------- 写：普通包 ----------
        if (action === 'subpack_create') {
            needPkg('subpack_create');
            if (!params.key) return fail('subpack_create 需要 key');
            return wrapChen(await chen.createSubpack(locator, String(params.key), params.file_name ? String(params.file_name) : undefined));
        }
        if (action === 'subpack_delete') { needId('subpack_delete'); return wrapChen(await chen.deleteSubpack(Number(params.id))); }
        if (action === 'subpack_iterate') { needId('subpack_iterate'); return wrapChen(await chen.iterateSubpack(Number(params.id))); }

        // ---------- 写：包内文件 ----------
        if (action === 'file_upload') {
            needId('file_upload');
            if (!params.file_path) return fail('file_upload 需要 file_path（本地文件路径）');
            return wrapChen(await chen.uploadFile(kind, Number(params.id), String(params.file_path), params.entry ? String(params.entry) : undefined));
        }
        if (action === 'file_delete') {
            needId('file_delete');
            if (params.file_id === undefined) return fail('file_delete 需要 file_id');
            return wrapChen(await chen.deleteFile(kind, Number(params.id), Number(params.file_id)));
        }

        // ---------- 写：归档审查 ----------
        if (action === 'archive') { needId('archive'); return wrapChen(await chen.archive(kind, Number(params.id))); }
        if (action === 'review_step') { needId('review_step'); return wrapChen(await chen.reviewStep(kind, Number(params.id))); }

        // ---------- 写：文档与缩略图 ----------
        if (action === 'doc_save') {
            needPkg('doc_save');
            if (!params.doc_name) return fail('doc_save 需要 doc_name');
            if (params.content === undefined) return fail('doc_save 需要 content');
            return wrapChen(await chen.saveDoc(locator, String(params.doc_name), String(params.content),
                params.asset_id !== undefined ? Number(params.asset_id) : undefined));
        }
        if (action === 'asset_upload') {
            if (!pkgId) return fail('asset_upload 需要 package_id');
            if (!params.file_path) return fail('asset_upload 需要 file_path（本地文件路径）');
            return wrapChen(await chen.uploadAsset(
                params.asset_kind ? String(params.asset_kind) : 'image', pkgId, String(params.file_path)));
        }
        if (action === 'asset_delete') {
            return wrapChen(await chen.deleteAsset(
                params.asset_kind ? String(params.asset_kind) : 'image', {
                asset_id: params.asset_id !== undefined ? Number(params.asset_id) : undefined,
                id: locator.id, package_id: locator.package_id,
                doc_name: params.doc_name ? String(params.doc_name) : undefined,
                image_name: params.image_name ? String(params.image_name) : undefined
            }));
        }

        // ---------- 写：npm ----------
        if (action === 'npm_create') {
            needPkg('npm_create');
            if (!params.npm_name) return fail('npm_create 需要 npm_name');
            return wrapChen(await chen.createNpm(locator, npmMetaFrom(params)));
        }
        if (action === 'npm_declare') {
            needPkg('npm_declare');
            if (params.src_subpack === undefined) return fail('npm_declare 需要 src_subpack（已归档普通包 ID）');
            if (!params.npm_name) return fail('npm_declare 需要 npm_name');
            return wrapChen(await chen.declareNpm(locator, Number(params.src_subpack), npmMetaFrom(params)));
        }
        if (action === 'npm_update') {
            needId('npm_update');
            return wrapChen(await chen.updateNpm(Number(params.id), npmMetaFrom(params)));
        }
        if (action === 'npm_delete') { needId('npm_delete'); return wrapChen(await chen.deleteNpm(Number(params.id))); }

        // ---------- 写：同步 ----------
        if (action === 'publish') { needPkg('publish'); return wrapChen(await chen.publish(locator)); }
        if (action === 'unpublish') { needPkg('unpublish'); return wrapChen(await chen.unpublish(locator)); }

        // ---------- 下载 ----------
        if (action === 'download') {
            needId('download');
            if (!params.save_path) return fail('download 需要 save_path（本地保存路径）');
            return wrapChen(await chen.downloadArtifact(kind, Number(params.id), String(params.save_path)));
        }
        if (action === 'image') {
            if (!params.save_path) return fail('image 需要 save_path（本地保存路径）');
            return wrapChen(await chen.downloadImage({
                asset_id: params.asset_id !== undefined ? Number(params.asset_id) : undefined,
                id: locator.id, package_id: locator.package_id,
                image_name: params.image_name ? String(params.image_name) : undefined
            }, String(params.save_path)));
        }

        return fail('未知 action: ' + action + '（可用值见工具描述里的 action 对照表）');
    } catch (e) {
        // 不翻译、不加工：原样透出错误信息 + 原始错误对象
        const err: any = e || {};
        const raw = (err && err.message) ? err.message : String(err);
        return fail(raw, {
            error_name: err && err.name,
            error_message: err && err.message,
            stack: err && err.stack ? String(err.stack).slice(0, 800) : undefined
        });
    }
}

/** 从 params 抽取 npm_ 开头的元数据字段 */
function npmMetaFrom(params: any): chen.NpmMeta {
    const keys = ['npm_name', 'npm_scope', 'npm_version', 'npm_main', 'npm_bin', 'npm_types',
        'npm_type', 'npm_license', 'npm_desc', 'npm_keywords', 'npm_deps', 'npm_peer_deps',
        'npm_engines', 'npm_files', 'npm_component'];
    const meta: any = {};
    for (const k of keys) {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') meta[k] = String(params[k]);
    }
    return meta;
}

/**
 * 辰锤响应 → 统一返回。不做翻译、不做加工：
 * 成功时把 data 原样返回；失败时把原始 error + 完整原始响应体透出。
 */
function wrapChen(r: chen.ChenchuiResult): any {
    if (r.success) {
        return ok(r.data !== undefined ? r.data : r, 'ok');
    }
    // 原始 error 优先，没有就把整个响应当 message
    const rawMsg = r.error !== undefined ? String(r.error) : JSON.stringify(r);
    // data 里塞完整原始响应，方便排查
    return fail(rawMsg, r);
}

// =============== 导出 ===============
// 注意：ToolPkg 子包工具必须导出 async 函数本体，并在函数内部直接 complete()。
// 不要用 wrap(...).then(complete) 隔一层，宿主取结果时机可能早于异步回调。

const exportsAny: any = exports;

async function toolInit(params: any): Promise<void> {
    let r: any;
    try { r = await doInit(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolSearch(params: any): Promise<void> {
    let r: any;
    try { r = await doSearch(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolInstall(params: any): Promise<void> {
    let r: any;
    try { r = await doInstall(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolRemove(params: any): Promise<void> {
    let r: any;
    try { r = await doRemove(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolManager(params: any): Promise<void> {
    let r: any;
    try { r = await doManager(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

exportsAny.init = toolInit;
exportsAny.search = toolSearch;
exportsAny.install = toolInstall;
exportsAny.remove = toolRemove;
exportsAny.manager = toolManager;

async function toolBuild(params: any): Promise<void> {
    let r: any;
    try {
        const p = params || {};
        if (!p.project_dir) {
            r = fail('缺少必填参数 project_dir');
        } else {
            const rep = await runBuild({
                projectDir: String(p.project_dir),
                skipCompile: p.skip_compile === true || p.skip_compile === 'true',
                outName: p.out_name ? String(p.out_name) : undefined,
                outDir: p.out_dir ? String(p.out_dir) : undefined,
                extraFiles: normStrArray(p.extra_files),
                packinfo: normPackInfo(p.PACKINFO)
            } as any);
            // 拼装可读诊断
            let msg = rep.message;
            if (!rep.ok) {
                if (rep.violations && rep.violations.length) {
                    msg += ' | 违规：' + rep.violations.map((v: any) => v.name + '(' + (v.reason || '').slice(0, 80) + ')').join('; ');
                }
                if (rep.missing && rep.missing.length) {
                    msg += ' | 缺失：' + rep.missing.map((v: any) => v.name + ' <- ' + v.from).join('; ');
                }
                if (rep.compileStdout) {
                    msg += ' | tsc: ' + String(rep.compileStdout).slice(0, 400);
                }
            }
            r = {
                success: rep.ok,
                message: msg + (rep.stage && rep.stage !== 'done' ? '（阶段：' + rep.stage + '）' : ''),
                data: {
                    stage: rep.stage,
                    toolpkg_path: rep.toolpkgPath || null,
                    file_count: rep.fileCount || 0,
                    bare_names: rep.bareNames || [],
                    violations: rep.violations || [],
                    missing: rep.missing || [],
                    extra_files: rep.extraFiles || { added: [], missing: [] },
                    compile_stdout: rep.compileStdout || ''
                }
            };
        }
    } catch (e) {
        r = fail('构建失败：' + String((e as any) && (e as any).message ? (e as any).message : e));
    }
    complete(r);
}

async function toolVerify(params: any): Promise<void> {
    let r: any;
    try {
        const p = params || {};
        if (!p.project_dir) {
            r = fail('缺少必填参数 project_dir');
        } else {
            const rep = await runVerify({
                projectDir: String(p.project_dir),
                skipCompile: p.skip_compile === true || p.skip_compile === 'true',
                extraFiles: normStrArray(p.extra_files)
            } as any);
            let msg = rep.message;
            if (!rep.ok) {
                if (rep.violations && rep.violations.length) {
                    msg += ' | 违规：' + rep.violations.map((v: any) => v.name + '(' + (v.reason || '').slice(0, 80) + ')').join('; ');
                }
                if (rep.missing && rep.missing.length) {
                    msg += ' | 缺失：' + rep.missing.map((v: any) => v.name + ' <- ' + v.from).join('; ');
                }
                if (rep.compileStdout) {
                    msg += ' | tsc: ' + String(rep.compileStdout).slice(0, 400);
                }
            }
            r = {
                success: rep.ok,
                message: msg + (rep.stage && rep.stage !== 'done' ? '（阶段：' + rep.stage + '）' : ''),
                data: {
                    stage: rep.stage,
                    bare_names: rep.bareNames || [],
                    violations: rep.violations || [],
                    missing: rep.missing || [],
                    compile_stdout: rep.compileStdout || ''
                }
            };
        }
    } catch (e) {
        r = fail('校验失败：' + String((e as any) && (e as any).message ? (e as any).message : e));
    }
    complete(r);
}

async function toolPack(params: any): Promise<void> {
    let r: any;
    try { r = await doPack(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

async function toolVersion(params: any): Promise<void> {
    let r: any;
    try { r = await doVersion(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}
async function toolLicense(params: any): Promise<void> {
    let r: any;
    try { r = await doLicense(params || {}); } catch (e) { r = fail('执行失败：' + String((e as any) && (e as any).message ? (e as any).message : e)); }
    complete(r);
}

exportsAny.build = toolBuild;
exportsAny.verify = toolVerify;
exportsAny.pack = toolPack;
exportsAny.version = toolVersion;
exportsAny.license = toolLicense;