/**
 * 下载与校验：tarball 下载 + sha1/sha512 校验 + gzip+tar 解包。
 *
 * 关键技术决定（已在真机验证）：
 *   - 二进制读：Tools.Files.readBinary -> contentBase64
 *   - base64 解码：Java.type('android.util.Base64').decode
 *   - gzip+tar 解包：Tools.System.terminal.hiddenExec('tar -xzf ...')
 *     （沙盒内手工逐字节解包会超时，故走系统 tar）
 */

const CACHE_DIR = '/sdcard/Download/Operit/plugins/com.operit.serveryyswys.opm/cache';
const TMP_DIR = '/sdcard/Download/Operit/plugins/com.operit.serveryyswys.opm/tmp';

export function getCacheDir(): string { return CACHE_DIR; }
export function getTmpDir(): string { return TMP_DIR; }

/** 确保基础目录存在 */
export async function ensureDirs(): Promise<void> {
    await Tools.Files.mkdir(CACHE_DIR, true);
    await Tools.Files.mkdir(TMP_DIR, true);
}

/** 由包名与版本生成安全的缓存文件名 */
export function cacheFileName(name: string, version: string): string {
    const safe = name.replace(/^@/, '').replace(/[\/\\]/g, '__');
    return safe + '-' + version + '.tgz';
}

/** 下载 tarball 到缓存目录，返回本地路径 */
export async function downloadTarball(tarballUrl: string, name: string, version: string): Promise<string> {
    await ensureDirs();
    const dest = CACHE_DIR + '/' + cacheFileName(name, version);
    const exist = await Tools.Files.exists(dest);
    if (exist && exist.exists && (exist.size || 0) > 0) {
        return dest;
    }
    const op = await Tools.Files.download(tarballUrl, dest, 'android', {
        'User-Agent': 'opm/0.1.0 (Operit)'
    });
    if (!op || op.successful === false) {
        throw new Error('下载失败: ' + tarballUrl);
    }
    const check = await Tools.Files.exists(dest);
    if (!check || !check.exists) {
        throw new Error('下载后文件不存在: ' + dest);
    }
    return dest;
}

/** 把 base64 文本转成 Java byte[] */
function toBytes(b64: string): any {
    const Base64 = Java.type('android.util.Base64');
    return Base64.decode(b64, 0);
}

function hexDigest(alg: string, b64: string): string {
    const MessageDigest = Java.type('java.security.MessageDigest');
    const md = MessageDigest.getInstance(alg);
    md.update(toBytes(b64));
    const digest = md.digest();
    let out = '';
    for (let i = 0; i < digest.length; i++) {
        const b = digest[i] & 0xff;
        out += (b < 16 ? '0' : '') + b.toString(16);
    }
    return out;
}

function base64Digest(alg: string, b64: string): string {
    const MessageDigest = Java.type('java.security.MessageDigest');
    const Base64 = Java.type('android.util.Base64');
    const md = MessageDigest.getInstance(alg);
    md.update(toBytes(b64));
    const digest = md.digest();
    return String(Base64.encodeToString(digest, 2)); // NO_WRAP = 2
}

export function sha1OfBase64(b64: string): string {
    return hexDigest('SHA-1', b64);
}

export function sha512OfBase64(b64: string): string {
    return base64Digest('SHA-512', b64);
}

/** 计算文件的 sha1（hex），用于校验 npm dist.shasum */
export async function sha1OfFile(path: string): Promise<string> {
    const bin = await Tools.Files.readBinary(path);
    return sha1OfBase64(bin.contentBase64);
}

/** 计算文件的 sha512（base64），用于校验 npm dist.integrity */
export async function sha512OfFile(path: string): Promise<string> {
    const bin = await Tools.Files.readBinary(path);
    return sha512OfBase64(bin.contentBase64);
}

/** 校验 tarball：优先 integrity(sha512)，回退 shasum(sha1) */
export async function verifyTarball(path: string, integrity?: string, shasum?: string): Promise<{ ok: boolean; reason?: string }> {
    try {
        if (integrity && integrity.indexOf('sha512-') === 0) {
            const expect = integrity.slice('sha512-'.length);
            const got = await sha512OfFile(path);
            return got === expect ? { ok: true } : { ok: false, reason: 'sha512 不匹配' };
        }
        if (shasum) {
            const got = await sha1OfFile(path);
            return got.toLowerCase() === String(shasum).toLowerCase() ? { ok: true } : { ok: false, reason: 'sha1 不匹配' };
        }
        return { ok: true, reason: '无校验摘要，跳过' };
    } catch (e) {
        return { ok: false, reason: '校验异常: ' + String(e) };
    }
}

/**
 * 解包 tgz 到目标目录（走系统 tar，已验证 /usr/bin/tar 可用）。
 */
export async function extractTarball(tgzPath: string, destDir: string): Promise<{ ok: boolean; reason?: string; entries?: number }> {
    await Tools.Files.mkdir(destDir, true);
    const cmd = "tar -xzf " + shellQuote(tgzPath) + " -C " + shellQuote(destDir) + " && echo __OPM_OK__";
    const r = await Tools.System.terminal.hiddenExec(cmd, { timeoutMs: 120000 });
    const out = (r && (r.output || (r as any).stdout)) || '';
    if (String(out).indexOf('__OPM_OK__') < 0) {
        return { ok: false, reason: 'tar 解包失败: ' + String(out).slice(0, 200) };
    }
    try {
        const listing = await Tools.Files.list(destDir + '/package');
        return { ok: true, entries: (listing && listing.entries ? listing.entries.length : 0) };
    } catch (e) {
        return { ok: true };
    }
}

/** shell 单引号安全包裹 */
export function shellQuote(s: string): string {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}

/** 把解出的 package/ 内容铺到最终 node_modules/<name>/ 目录 */
export async function placePackage(extractDir: string, targetDir: string): Promise<void> {
    const src = extractDir + '/package';
    const exists = await Tools.Files.exists(src);
    if (!exists || !exists.exists) {
        throw new Error('解包目录缺少 package/ : ' + src);
    }
    const tgt = await Tools.Files.exists(targetDir);
    if (tgt && tgt.exists) {
        await Tools.Files.deleteFile(targetDir, true);
    }
    await Tools.Files.mkdir(targetDir, true);
    await Tools.Files.copy(src, targetDir, true);
}