/**
 * 轻量 semver 实现：比较、范围判断、解析。
 * 支持 ^ ~ >= <= > < = 精确 * 以及 || 组合与简单的空格范围。
 */

export interface ParsedVersion {
    major: number;
    minor: number;
    patch: number;
    prerelease: string;
    raw: string;
}

export function parseVersion(v: string): ParsedVersion | null {
    if (!v) return null;
    const m = String(v).trim().replace(/^[v=]+/, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
    if (!m) return null;
    return {
        major: parseInt(m[1], 10),
        minor: parseInt(m[2], 10),
        patch: parseInt(m[3], 10),
        prerelease: m[4] || '',
        raw: v
    };
}

function cmpPre(a: string, b: string): number {
    if (a === b) return 0;
    if (!a && b) return 1;   // 无 prerelease 更高
    if (a && !b) return -1;
    const as = a.split('.'), bs = b.split('.');
    const len = Math.max(as.length, bs.length);
    for (let i = 0; i < len; i++) {
        const x = as[i], y = bs[i];
        if (x === undefined) return -1;
        if (y === undefined) return 1;
        const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y);
        if (xn && yn) {
            const d = parseInt(x, 10) - parseInt(y, 10);
            if (d !== 0) return d < 0 ? -1 : 1;
        } else if (xn && !yn) {
            return -1;
        } else if (!xn && yn) {
            return 1;
        } else if (x !== y) {
            return x < y ? -1 : 1;
        }
    }
    return 0;
}

/** 比较两个版本：a>b 返回 1，a<b 返回 -1，相等 0 */
export function compare(a: string, b: string): number {
    const pa = parseVersion(a), pb = parseVersion(b);
    if (!pa || !pb) return 0;
    if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
    if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
    if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;
    return cmpPre(pa.prerelease, pb.prerelease);
}

/** 单个比较器是否满足 */
function satisfiesOne(version: string, range: string): boolean {
    range = range.trim();
    if (!range || range === '*' || range === 'x' || range === 'latest') return true;

    // ^1.2.3
    let m = range.match(/^\^(.+)$/);
    if (m) {
        const base = parseVersion(m[1]);
        const v = parseVersion(version);
        if (!base || !v) return false;
        if (compare(version, m[1]) < 0) return false;
        // 下一个不兼容版本
        let upper: string;
        if (base.major > 0) upper = (base.major + 1) + '.0.0';
        else if (base.minor > 0) upper = '0.' + (base.minor + 1) + '.0';
        else upper = '0.0.' + (base.patch + 1);
        return compare(version, upper) < 0;
    }
    // ~1.2.3
    m = range.match(/^~(.+)$/);
    if (m) {
        const base = parseVersion(m[1]);
        if (!base) return false;
        if (compare(version, m[1]) < 0) return false;
        const upper = base.major + '.' + (base.minor + 1) + '.0';
        return compare(version, upper) < 0;
    }
    // >=, <=, >, <, =
    m = range.match(/^(>=|<=|>|<|=)?\s*(.+)$/);
    if (m) {
        const op = m[1] || '=';
        const target = m[2].trim();
        // 支持 1.2 / 1 / 1.2.x
        const tp = normalizeLoose(target);
        if (tp === null) return true;
        switch (op) {
            case '>=': return compare(version, tp) >= 0;
            case '<=': return compare(version, tp) <= 0;
            case '>': return compare(version, tp) > 0;
            case '<': return compare(version, tp) < 0;
            default: return compare(version, tp) === 0;
        }
    }
    return false;
}

/** 宽松版本（1 / 1.2 / 1.2.x）补全为 0 */
function normalizeLoose(v: string): string | null {
    v = v.trim();
    const m = v.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!m) return null;
    const a = m[1] || '0', b = m[2] || '0', c = m[3] || '0';
    return a + '.' + b + '.' + c;
}

/** version 是否满足 range（支持 || 与空格 AND） */
export function satisfies(version: string, range: string): boolean {
    if (!range) return true;
    const orParts = String(range).split('||');
    for (const orPart of orParts) {
        const andParts = orPart.trim().split(/\s+/).filter(Boolean);
        if (andParts.length === 0) return true;
        let ok = true;
        for (const r of andParts) {
            if (!satisfiesOne(version, r)) { ok = false; break; }
        }
        if (ok) return true;
    }
    return false;
}

/** 从版本列表中选出满足 range 的最高版本 */
export function maxSatisfying(versions: string[], range: string): string | null {
    let best: string | null = null;
    for (const v of versions) {
        if (!parseVersion(v)) continue;
        if (!satisfies(v, range)) continue;
        if (!best || compare(v, best) > 0) best = v;
    }
    return best;
}