/**
 * package-lock.json 读写（npm lockfileVersion 3 简化结构）。
 */

export interface LockPackage {
    version: string;
    resolved: string;
    integrity?: string;
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
}

export interface Lockfile {
    name: string;
    version: string;
    lockfileVersion: number;
    requires: boolean;
    packages: Record<string, LockPackage>;
}

export function lockPath(projectDir: string): string {
    return join(projectDir, 'package-lock.json');
}

export function pkgJsonPath(projectDir: string): string {
    return join(projectDir, 'package.json');
}

export function nodeModulesDir(projectDir: string): string {
    return join(projectDir, 'node_modules');
}

/** 简单路径拼接 */
export function join(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    if (a.endsWith('/')) return a + b;
    return a + '/' + b;
}

/** 读取 package.json，不存在返回 null */
export async function readPackageJson(projectDir: string): Promise<any | null> {
    try {
        const p = pkgJsonPath(projectDir);
        const ex = await Tools.Files.exists(p);
        if (!ex || !ex.exists) return null;
        const r = await Tools.Files.read(p);
        return JSON.parse(r.content);
    } catch (e) {
        return null;
    }
}

/** 写入 package.json */
export async function writePackageJson(projectDir: string, obj: any): Promise<void> {
    await Tools.Files.write(pkgJsonPath(projectDir), JSON.stringify(obj, null, 2) + '\n');
}

/** 读取 lockfile，不存在返回空结构 */
export async function readLockfile(projectDir: string): Promise<Lockfile | null> {
    try {
        const p = lockPath(projectDir);
        const ex = await Tools.Files.exists(p);
        if (!ex || !ex.exists) return null;
        const r = await Tools.Files.read(p);
        return JSON.parse(r.content) as Lockfile;
    } catch (e) {
        return null;
    }
}

/** 写入 lockfile */
export async function writeLockfile(projectDir: string, lock: Lockfile): Promise<void> {
    await Tools.Files.write(lockPath(projectDir), JSON.stringify(lock, null, 2) + '\n');
}

/** 空 lockfile */
export function emptyLockfile(name: string, version: string): Lockfile {
    return {
        name: name || 'opm-project',
        version: version || '1.0.0',
        lockfileVersion: 3,
        requires: true,
        packages: {}
    };
}