/**
 * path 模块的公开类型。
 *
 * 独立成文件的原因：path.ts 用 `export =` 导出模块本体，无法再导出类型；
 * 类型放在这里既能让 index.ts 聚合时"能命名"，也能让消费者引用。
 */
export interface FormatInputPathObject {
    root?: string;
    dir?: string;
    base?: string;
    ext?: string;
    name?: string;
}
export interface ParsedPath {
    root: string;
    dir: string;
    base: string;
    ext: string;
    name: string;
}
export interface PathModule {
    resolve(...paths: string[]): string;
    normalize(path: string): string;
    isAbsolute(path: string): boolean;
    join(...paths: string[]): string;
    relative(from: string, to: string): string;
    toNamespacedPath(path: string): string;
    dirname(path: string): string;
    basename(path: string, ext?: string): string;
    extname(path: string): string;
    format(pathObject: FormatInputPathObject): string;
    parse(path: string): ParsedPath;
    sep: string;
    delimiter: string;
    win32: PathModule;
    posix: PathModule;
}
