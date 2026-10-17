'use strict';

/**
 * 文本读取的安全封装：走 node.operit 的 `fs`（javabridge，读原始内容，不带行号）。
 *
 * 为什么不用 Tools.Files.read：
 *   Operit 的 `read` 系工具返回不稳定，可能给文本带上 `N|` 行号前缀，
 *   直接 JSON.parse 会炸。node.operit 的 fs 走 java.nio.file.Files.readAllBytes，
 *   拿的是原始字节，天然干净。
 *
 * 兼容策略：
 *   - 运行时优先用 require('fs')（opm 打包时会被重写成 node.operit 的 fs）。
 *   - 万一 fs 不可用，回退 Tools.Files.read，并对结果剥行号（保证 JSON 可解析）。
 *   - 出口再统一剥一次行号（幂等）：即便某条通道带了 `N|` 前缀也不影响解析。
 */

declare const Tools: any;

interface HostFs {
    readFileSync(path: string, encoding?: string): string;
    existsSync?(path: string): boolean;
}

let cachedFs: HostFs | null | undefined;

function hostFs(): HostFs | null {
    if (cachedFs !== undefined) return cachedFs;
    try {
        // eslint 的 no-undef 在这里不用管：opm 构建时会重写 'fs' -> node.operit 的 fs
        const fsMod = require('fs') as HostFs;
        cachedFs = fsMod && typeof fsMod.readFileSync === 'function' ? fsMod : null;
    } catch (_e) {
        cachedFs = null;
    }
    return cachedFs;
}

/**
 * 剥掉 read 工具可能附带的行号前缀（形如 `   12| 内容` 或 `12|内容`）。
 * 幂等：没有前缀时原样返回。
 * 只有当「每一行都以 `数字|` 开头」时才认定是行号格式，避免误伤正常文本。
 */
export function stripLineNumbers(text: string): string {
    if (!text) return text;
    const lines = text.split('\n');
    let numbered = 0;
    let checked = 0;
    for (const line of lines) {
        if (!line) continue;
        if (checked >= 5) break;
        checked += 1;
        if (/^\s*\d+\|/.test(line)) numbered += 1;
    }
    // 至少前几行都像行号，才整体剥离
    if (checked === 0 || numbered < checked) return text;
    return lines
        .map((line) => {
            const m = /^\s*\d+\|(.*)$/.exec(line);
            return m ? m[1] : line;
        })
        .join('\n');
}

/**
 * 读文本文件（node fs 优先）。不存在或失败返回 null。
 */
export function readTextSafe(path: string): string | null {
    const fs = hostFs();
    if (fs) {
        try {
            const text = String(fs.readFileSync(path, 'utf8'));
            return stripLineNumbers(text);
        } catch (_e) {
            // 落到回退分支
        }
    }
    // 回退：Tools.Files.read（可能带行号，剥掉）
    try {
        const r = Tools.Files.read(path);
        if (r && typeof r.then === 'function') {
            // 异步形态：由 readTextSafeAsync 处理；同步路径下不作等待
            return null;
        }
        const content = r && (r.content !== undefined ? r.content : r.data);
        return content === undefined || content === null ? null : stripLineNumbers(String(content));
    } catch (_e) {
        return null;
    }
}

/**
 * 异步读文本（Tools.Files.read 是 Promise 时用）。
 */
export async function readTextSafeAsync(path: string): Promise<string | null> {
    const fs = hostFs();
    if (fs) {
        try {
            return stripLineNumbers(String(fs.readFileSync(path, 'utf8')));
        } catch (_e) {
            /* 落回退 */
        }
    }
    try {
        const r = await Tools.Files.read(path);
        const content = r && (r.content !== undefined ? r.content : r.data);
        return content === undefined || content === null ? null : stripLineNumbers(String(content));
    } catch (_e) {
        return null;
    }
}
