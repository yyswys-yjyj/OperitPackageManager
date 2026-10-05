/**
 * OPM 全局配置：源地址、token、镜像开关等。
 * 存储位置：/sdcard/Download/Operit/plugins/com.operit.serveryyswys.opm/opm.config.json
 */

export interface OpmConfig {
    /** npm registry 源，默认辰锤私有源 */
    registry: string;
    /** 辰锤投稿 API token（manager 用） */
    token: string;
    /** 辰锤投稿 API 基础地址 */
    apiBase: string;
    /** 安装时是否一并写入 package-lock.json */
    lockfile: boolean;
    /** 是否在 init 时自动安装 node.operit */
    autoInstallRuntime: boolean;
    /** node.operit 的包名 */
    runtimePackage: string;
    /** 下载并发数（一期串行，预留） */
    concurrency: number;
}

export const DEFAULT_REGISTRY = 'https://www.serveryyswys.top/download/source/npm/';
export const DEFAULT_API_BASE = 'https://open.serveryyswys.top/api?name=resource_center';
export const DEFAULT_RUNTIME_PACKAGE = '@serveryyswys/node.operit';

const CONFIG_DIR = '/sdcard/Download/Operit/plugins/com.operit.serveryyswys.opm';
const CONFIG_PATH = CONFIG_DIR + '/opm.config.json';

export function defaultConfig(): OpmConfig {
    return {
        registry: DEFAULT_REGISTRY,
        token: '',
        apiBase: DEFAULT_API_BASE,
        lockfile: true,
        autoInstallRuntime: true,
        runtimePackage: DEFAULT_RUNTIME_PACKAGE,
        concurrency: 1
    };
}

/**
 * 读取配置；不存在则返回默认值（不落盘）。
 *
 * 注意：这里**不缓存**。ToolPkg 模块在宿主进程内只加载一次，
 * 若用模块级缓存，用户"先调用后配 token"会导致缓存固化为空 token，
 * 之后所有调用都读不到 token。配置文件很小，每次读文件即可。
 */
export async function loadConfig(_force?: boolean): Promise<OpmConfig> {
    const base = defaultConfig();
    try {
        const exists = await Tools.Files.exists(CONFIG_PATH);
        if (exists && exists.exists) {
            const r = await Tools.Files.read(CONFIG_PATH);
            const parsed = JSON.parse(r.content);
            return Object.assign(base, parsed);
        }
    } catch (e) {
        // 配置损坏时回退默认
    }
    return base;
}

/** 写入配置（合并） */
export async function saveConfig(patch: Partial<OpmConfig>): Promise<OpmConfig> {
    const cur = await loadConfig(true);
    const next = Object.assign({}, cur, patch);
    await Tools.Files.mkdir(CONFIG_DIR, true);
    await Tools.Files.write(CONFIG_PATH, JSON.stringify(next, null, 2));
    return next;
}

export function getConfigPath(): string {
    return CONFIG_PATH;
}

export function getConfigDir(): string {
    return CONFIG_DIR;
}