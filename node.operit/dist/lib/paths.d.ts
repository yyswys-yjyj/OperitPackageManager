export declare function pluginConfigDir(packageId?: string): string;
/** 当前包名：由 getPluginConfigDir('') 的返回路径反推。 */
export declare function packageName(): string;
export declare function downloadDir(): string;
export declare function cleanOnExitDir(): string;
export declare function appContext(): unknown;
export declare function filesDir(): string;
export declare function cacheDir(): string;
