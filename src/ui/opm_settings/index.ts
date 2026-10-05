/**
 * OPM 设置界面（Compose DSL）
 * 参考 subagent / questionnaire 的 UI 规范：主题色 + 卡片分区 + 图标标题 + 状态提示。
 */

declare const Tools: any;

const CONFIG_DIR = '/sdcard/Download/Operit/plugins/com.operit.serveryyswys.opm';
const CONFIG_PATH = CONFIG_DIR + '/opm.config.json';
const DEFAULT_REGISTRY = 'https://www.serveryyswys.top/download/source/npm/';
const DEFAULT_API_BASE = 'https://open.serveryyswys.top/api?name=resource_center';
const DEFAULT_RUNTIME = '@serveryyswys/node.operit';

function defaultCfg() {
    return {
        registry: DEFAULT_REGISTRY,
        token: '',
        apiBase: DEFAULT_API_BASE,
        lockfile: true,
        autoInstallRuntime: true,
        runtimePackage: DEFAULT_RUNTIME,
        concurrency: 1
    };
}

async function readCfg() {
    const base = defaultCfg();
    try {
        const ex = await Tools.Files.exists(CONFIG_PATH);
        if (ex && ex.exists) {
            const r = await Tools.Files.read(CONFIG_PATH);
            return Object.assign(base, JSON.parse(r.content));
        }
    } catch (e) { /* ignore */ }
    return base;
}

async function saveCfg(patch) {
    const cur = await readCfg();
    const next = Object.assign({}, cur, patch);
    await Tools.Files.mkdir(CONFIG_DIR, true);
    await Tools.Files.write(CONFIG_PATH, JSON.stringify(next, null, 2));
}

/** 调包内工具，兼容 ctx.callTool / ctx.toolCall（保留备用） */
async function callOpmTool(toolName, params) {
    const full = 'opm:' + toolName;
    if (typeof ctx.callTool === 'function') return await ctx.callTool(full, params);
    if (typeof ctx.toolCall === 'function') return await ctx.toolCall(full, params);
    throw new Error('无可用的工具调用入口（callTool / toolCall 均不存在）');
}

/**
 * 用 Java bridge 直连 registry 做探源，完全不依赖工具返回值格式。
 * GET {registry}?format=json，返回 {ok, count} 或 {ok:false, error}。
 */
function probeRegistry(registryUrl) {
    try {
        let base = String(registryUrl || '').trim();
        if (!base) return { ok: false, error: '源地址为空' };
        if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
        if (!base.endsWith('/')) base += '/';
        const url = base + '?format=json';

        const URL = Java.type('java.net.URL');
        const BufferedReader = Java.type('java.io.BufferedReader');
        const InputStreamReader = Java.type('java.io.InputStreamReader');
        const StandardCharsets = Java.type('java.nio.charset.StandardCharsets');

        const conn = new URL(url).openConnection();
        conn.setRequestMethod('GET');
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(30000);
        conn.setRequestProperty('Accept', 'application/json');
        conn.setRequestProperty('User-Agent', 'opm/0.1.0 (Operit)');
        conn.setInstanceFollowRedirects(true);

        const code = conn.getResponseCode();
        if (code < 200 || code >= 300) {
            return { ok: false, error: 'HTTP ' + code };
        }
        const reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
        let line;
        let body = '';
        while ((line = reader.readLine()) != null) body += line;
        reader.close();

        let json = null;
        try { json = JSON.parse(body); } catch (e) { /* ignore */ }
        if (!json) return { ok: false, error: '响应不是合法 JSON' };

        const count = (json && typeof json.count === 'number')
            ? json.count
            : (json && json.packages && json.packages.length) || 0;
        return { ok: true, count: count };
    } catch (e) {
        return { ok: false, error: String((e && e.message) ? e.message : e) };
    }
}

function Screen(ctx) {
    const cs = ctx.MaterialTheme.colorScheme;

    const [loaded, setLoaded] = ctx.useState('opm_loaded', false);
    const [registry, setRegistry] = ctx.useState('opm_registry', DEFAULT_REGISTRY);
    const [apiBase, setApiBase] = ctx.useState('opm_apiBase', DEFAULT_API_BASE);
    const [token, setToken] = ctx.useState('opm_token', '');
    const [runtimePkg, setRuntimePkg] = ctx.useState('opm_runtimePkg', DEFAULT_RUNTIME);
    const [autoRuntime, setAutoRuntime] = ctx.useState('opm_autoRuntime', true);
    const [lockfile, setLockfile] = ctx.useState('opm_lockfile', true);
    const [status, setStatus] = ctx.useState('opm_status', '');
    const [statusOk, setStatusOk] = ctx.useState('opm_statusOk', true);
    const [busy, setBusy] = ctx.useState('opm_busy', false);

    async function loadAll() {
        const c = await readCfg();
        setRegistry(c.registry || DEFAULT_REGISTRY);
        setApiBase(c.apiBase || DEFAULT_API_BASE);
        setToken(c.token || '');
        setRuntimePkg(c.runtimePackage || DEFAULT_RUNTIME);
        setAutoRuntime(c.autoInstallRuntime !== false);
        setLockfile(c.lockfile !== false);
        setLoaded(true);
    }

    async function handleSave() {
        setBusy(true);
        try {
            await saveCfg({
                registry: registry,
                apiBase: apiBase,
                token: token,
                runtimePackage: runtimePkg,
                autoInstallRuntime: autoRuntime,
                lockfile: lockfile
            });
            setStatus('配置已保存');
            setStatusOk(true);
            if (ctx.showToast) await ctx.showToast('OPM 配置已保存');
        } catch (e) {
            setStatus('保存失败：' + String(e));
            setStatusOk(false);
        }
        setBusy(false);
    }

    async function handleTest() {
        setBusy(true);
        setStatus('正在测试源…');
        setStatusOk(true);
        // 让出主线程先渲染「正在测试…」，再 await 阻塞的 bridge 请求，
        // 保证本次 async 事件处理真正等到结果才 resolve，后续重绘才生效。
        await new Promise((resolve) => setTimeout(resolve, 50));
        try {
            const result = probeRegistry(registry);
            if (result.ok) {
                setStatus('源可用，目录共 ' + result.count + ' 个包');
                setStatusOk(true);
            } else {
                setStatus('测试失败：' + result.error);
                setStatusOk(false);
            }
        } catch (e) {
            setStatus('测试异常：' + String((e && e.stack) ? e.stack : e));
            setStatusOk(false);
        }
        setBusy(false);
    }

    async function handleReset() {
        setRegistry(DEFAULT_REGISTRY);
        setApiBase(DEFAULT_API_BASE);
        setRuntimePkg(DEFAULT_RUNTIME);
        setAutoRuntime(true);
        setLockfile(true);
        setStatus('已重置为默认值（未保存）');
        setStatusOk(true);
    }

    const items = [];

    // ---- 顶部标题 ----
    items.push(ctx.UI.Row({ verticalAlignment: 'center', fillMaxWidth: true }, [
        ctx.UI.Icon({ name: 'inventory_2', size: 26, tint: cs.primary }),
        ctx.UI.Spacer({ width: 10 }),
        ctx.UI.Column({ modifier: ctx.Modifier.weight(1) }, [
            ctx.UI.Text({ text: 'OPM 包管理器', fontSize: 20, fontWeight: 'bold', color: cs.primary }),
            ctx.UI.Text({ text: '在 Operit 上还原 npm 生态', fontSize: 12, color: cs.onSurfaceVariant })
        ]),
        ctx.UI.IconButton({
            icon: 'refresh',
            onClick: async () => { await loadAll(); },
            enabled: !busy,
            modifier: ctx.Modifier.width(40).height(40)
        })
    ]));
    items.push(ctx.UI.Spacer({ height: 14 }));

    // ---- 源配置卡片 ----
    const srcKids = [];
    srcKids.push(ctx.UI.Row({ verticalAlignment: 'center' }, [
        ctx.UI.Icon({ name: 'cloud', size: 18, tint: cs.primary }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: '软件源', fontSize: 16, fontWeight: 'bold' })
    ]));
    srcKids.push(ctx.UI.Spacer({ height: 4 }));
    srcKids.push(ctx.UI.Text({ text: 'search / install / init 使用的 npm registry 地址', fontSize: 11, color: cs.onSurfaceVariant }));
    srcKids.push(ctx.UI.Spacer({ height: 10 }));
    srcKids.push(ctx.UI.Text({ text: 'Registry URL', fontSize: 12, color: cs.onSurfaceVariant }));
    srcKids.push(ctx.UI.TextField({
        value: registry,
        onValueChange: setRegistry,
        placeholder: DEFAULT_REGISTRY,
        singleLine: true,
        modifier: ctx.Modifier.fillMaxWidth()
    }));
    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 16 }, srcKids)
    ]));
    items.push(ctx.UI.Spacer({ height: 12 }));

    // ---- 辰锤 API 卡片 ----
    const apiKids = [];
    apiKids.push(ctx.UI.Row({ verticalAlignment: 'center' }, [
        ctx.UI.Icon({ name: 'key', size: 18, tint: cs.primary }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: '辰锤 API', fontSize: 16, fontWeight: 'bold' }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: '（manager 工具用）', fontSize: 11, color: cs.onSurfaceVariant })
    ]));
    apiKids.push(ctx.UI.Spacer({ height: 4 }));
    apiKids.push(ctx.UI.Text({ text: '投稿 / 管理自有 npm 包所需的开放平台凭据', fontSize: 11, color: cs.onSurfaceVariant }));
    apiKids.push(ctx.UI.Spacer({ height: 10 }));
    apiKids.push(ctx.UI.Text({ text: 'API 基础地址', fontSize: 12, color: cs.onSurfaceVariant }));
    apiKids.push(ctx.UI.TextField({
        value: apiBase,
        onValueChange: setApiBase,
        placeholder: DEFAULT_API_BASE,
        singleLine: true,
        modifier: ctx.Modifier.fillMaxWidth()
    }));
    apiKids.push(ctx.UI.Spacer({ height: 10 }));
    apiKids.push(ctx.UI.Text({ text: 'API Key（token）', fontSize: 12, color: cs.onSurfaceVariant }));
    apiKids.push(ctx.UI.TextField({
        value: token,
        onValueChange: setToken,
        placeholder: '开放平台生成，需勾选 resource_center 作用域',
        singleLine: true,
        modifier: ctx.Modifier.fillMaxWidth()
    }));
    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 16 }, apiKids)
    ]));
    items.push(ctx.UI.Spacer({ height: 12 }));

    // ---- init 行为卡片 ----
    const initKids = [];
    initKids.push(ctx.UI.Row({ verticalAlignment: 'center' }, [
        ctx.UI.Icon({ name: 'rocket_launch', size: 18, tint: cs.primary }),
        ctx.UI.Spacer({ width: 6 }),
        ctx.UI.Text({ text: 'init 行为', fontSize: 16, fontWeight: 'bold' })
    ]));
    initKids.push(ctx.UI.Spacer({ height: 10 }));
    initKids.push(ctx.UI.Text({ text: '运行时补丁包名', fontSize: 12, color: cs.onSurfaceVariant }));
    initKids.push(ctx.UI.TextField({
        value: runtimePkg,
        onValueChange: setRuntimePkg,
        placeholder: DEFAULT_RUNTIME,
        singleLine: true,
        modifier: ctx.Modifier.fillMaxWidth()
    }));
    initKids.push(ctx.UI.Spacer({ height: 12 }));
    initKids.push(ctx.UI.Row({ verticalAlignment: 'center', fillMaxWidth: true }, [
        ctx.UI.Column({ modifier: ctx.Modifier.weight(1) }, [
            ctx.UI.Text({ text: '自动安装运行时包', fontSize: 13 }),
            ctx.UI.Text({ text: 'init 时自动拉取 ' + runtimePkg, fontSize: 10, color: cs.onSurfaceVariant, maxLines: 1 })
        ]),
        ctx.UI.Switch({ checked: autoRuntime, onCheckedChange: setAutoRuntime })
    ]));
    initKids.push(ctx.UI.Spacer({ height: 8 }));
    initKids.push(ctx.UI.Row({ verticalAlignment: 'center', fillMaxWidth: true }, [
        ctx.UI.Column({ modifier: ctx.Modifier.weight(1) }, [
            ctx.UI.Text({ text: '写入 package-lock.json', fontSize: 13 }),
            ctx.UI.Text({ text: 'install 时生成锁定文件', fontSize: 10, color: cs.onSurfaceVariant, maxLines: 1 })
        ]),
        ctx.UI.Switch({ checked: lockfile, onCheckedChange: setLockfile })
    ]));
    items.push(ctx.UI.Card({ elevation: 2, modifier: ctx.Modifier.fillMaxWidth() }, [
        ctx.UI.Column({ padding: 16 }, initKids)
    ]));
    items.push(ctx.UI.Spacer({ height: 16 }));

    // ---- 状态提示 ----
    if (status) {
        items.push(ctx.UI.Row({ verticalAlignment: 'center' }, [
            ctx.UI.Icon({ name: statusOk ? 'check_circle' : 'error', size: 16, tint: statusOk ? cs.primary : cs.error }),
            ctx.UI.Spacer({ width: 6 }),
            ctx.UI.Text({ text: status, fontSize: 13, color: statusOk ? cs.primary : cs.error })
        ]));
        items.push(ctx.UI.Spacer({ height: 12 }));
    }

    // ---- 操作按钮 ----
    items.push(ctx.UI.Row({ fillMaxWidth: true }, [
        ctx.UI.Button({
            onClick: handleSave,
            enabled: !busy,
            containerColor: cs.primary,
            contentColor: cs.onPrimary,
            modifier: ctx.Modifier.weight(1),
            content: ctx.UI.Text({ text: '保存', color: cs.onPrimary, fontWeight: 'bold' })
        }),
        ctx.UI.Spacer({ width: 8 }),
        ctx.UI.Button({
            onClick: handleTest,
            enabled: !busy,
            containerColor: cs.secondaryContainer,
            contentColor: cs.onSecondaryContainer,
            modifier: ctx.Modifier.weight(1),
            content: ctx.UI.Text({ text: '测试源', color: cs.onSecondaryContainer })
        }),
        ctx.UI.Spacer({ width: 8 }),
        ctx.UI.Button({
            onClick: handleReset,
            enabled: !busy,
            containerColor: cs.errorContainer,
            contentColor: cs.onErrorContainer,
            modifier: ctx.Modifier.weight(1),
            content: ctx.UI.Text({ text: '重置', color: cs.onErrorContainer })
        })
    ]));
    items.push(ctx.UI.Spacer({ height: 28 }));

    return ctx.UI.LazyColumn({
        fillMaxSize: true,
        padding: 16,
        onLoad: async () => {
            if (!loaded) await loadAll();
        }
    }, items);
}

exports.default = Screen;
