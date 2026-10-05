export interface FsEnvironmentSpec {
    readonly name: string;
    /** 物理根。用函数是为了让 config / app 这类根惰性解析（需要 bridge）。 */
    readonly root: string | (() => string);
    readonly writable: boolean;
}
export interface FsEnvHooks {
    setCwd(path: string): void;
    getCwd(): string;
    /** 探测根是否可用；抛错即视为不可用。 */
    probe(root: string): void;
}
export declare function setHooks(next: FsEnvHooks): void;
/** 注册自定义环境。内置环境名不可覆盖。 */
export declare function define(name: string, spec: Omit<FsEnvironmentSpec, 'name'>): void;
export declare function names(): string[];
export declare function current(): string | null;
export declare function root(): string;
export declare function writable(): boolean;
/** 显式切换环境。根不可用即拒绝，不做任何降级。 */
export declare function use(name: string): void;
/** 作用域内切换，回调必须同步返回。 */
export declare function withEnvironment<T>(name: string, callback: () => T): T;
/** 回到 UNBOUND。cwd 不动 —— 调用方要回默认值请再 use('sdcard')。 */
export declare function reset(): void;
/** strict 模式下，未显式 use() 就使用 fs 会直接报错。 */
export declare function strict(flag: boolean): void;
export declare function isStrict(): boolean;
/** fs 每次操作前调用：非 strict 时按默认环境惰性绑定。 */
export declare function ensureBound(): void;
