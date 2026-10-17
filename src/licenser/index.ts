'use strict';

import { LICENSE_TEXTS } from './texts.js';
import { readTextSafe } from '../core/nodesafe.js';

declare const Tools: any;

// ============================================================================
// 许可证元数据
// ============================================================================

/** 每份许可证的填充规则与附加产物策略。 */
interface LicenseSpec {
    /** SPDX 标识符（写入 package.json / PACKINFO） */
    spdx: string;
    /** 许可证全名（用于 NOTICE / 提示） */
    title: string;
    /**
     * 正文填充方式：
     *  - 'mit'    ：替换 `Copyright (c) <year> <copyright holders>`
     *  - 'bsd'    ：替换开头 `Copyright (c) <year> <owner>`
     *  - 'isc'    ：替换开头 `Copyright <year> <owner>`
     *  - 'apache' ：替换附录 boilerplate 中的 `Copyright [yyyy] [name of copyright owner]`
     *  - 'gnu'    ：替换文末「How to Apply These Terms」附录里的
     *               `Copyright (C) <year>  <name of author>` 与 `<program>  Copyright (C) <year>  <name of author>`
     *  - 'none'   ：正文不含版权占位符（MPL/Unlicense），不替换
     */
    fill: 'mit' | 'bsd' | 'isc' | 'apache' | 'gnu' | 'none';
    /** 是否需要生成 NOTICE 文件（目前仅 Apache-2.0 的条款要求） */
    needsNotice: boolean;
    /** 源码版权头的 SPDX 行（Licensed under ...） */
    header: string;
    /** 别名：其它常见写法 -> 规范 SPDX */
    aliases?: string[];
}

const SPECS: Record<string, LicenseSpec> = {
    'MIT': {
        spdx: 'MIT',
        title: 'MIT License',
        fill: 'mit',
        needsNotice: false,
        header: 'MIT License',
        aliases: ['mit', 'MIT License', 'Expat'],
    },
    'Apache-2.0': {
        spdx: 'Apache-2.0',
        title: 'Apache License 2.0',
        fill: 'apache',
        needsNotice: true,
        header: 'Apache License, Version 2.0',
        aliases: ['apache', 'apache2', 'Apache', 'Apache 2.0', 'Apache License 2.0', 'apache-2'],
    },
    'GPL-3.0-only': {
        spdx: 'GPL-3.0-only',
        title: 'GNU General Public License v3.0 only',
        fill: 'gnu',
        needsNotice: false,
        header: 'GPL-3.0-only',
        aliases: ['gpl3', 'GPL-3.0', 'GPLv3', 'gpl-3.0', 'GPL-3.0-only'],
    },
    'GPL-3.0-or-later': {
        spdx: 'GPL-3.0-or-later',
        title: 'GNU General Public License v3.0 or later',
        fill: 'gnu',
        needsNotice: false,
        header: 'GPL-3.0-or-later',
        aliases: ['GPL-3.0+', 'gpl3+', 'GPLv3+', 'gpl-3.0-or-later'],
    },
    'AGPL-3.0-only': {
        spdx: 'AGPL-3.0-only',
        title: 'GNU Affero General Public License v3.0 only',
        fill: 'gnu',
        needsNotice: false,
        header: 'AGPL-3.0-only',
        aliases: ['agpl3', 'AGPL-3.0', 'AGPLv3'],
    },
    'AGPL-3.0-or-later': {
        spdx: 'AGPL-3.0-or-later',
        title: 'GNU Affero General Public License v3.0 or later',
        fill: 'gnu',
        needsNotice: false,
        header: 'AGPL-3.0-or-later',
        aliases: ['AGPL-3.0+', 'agpl3+'],
    },
    'LGPL-3.0-only': {
        spdx: 'LGPL-3.0-only',
        title: 'GNU Lesser General Public License v3.0 only',
        fill: 'gnu',
        needsNotice: false,
        header: 'LGPL-3.0-only',
        aliases: ['lgpl3', 'LGPL-3.0', 'LGPLv3'],
    },
    'LGPL-3.0-or-later': {
        spdx: 'LGPL-3.0-or-later',
        title: 'GNU Lesser General Public License v3.0 or later',
        fill: 'gnu',
        needsNotice: false,
        header: 'LGPL-3.0-or-later',
        aliases: ['LGPL-3.0+', 'lgpl3+'],
    },
    'BSD-3-Clause': {
        spdx: 'BSD-3-Clause',
        title: 'BSD 3-Clause "New" or "Revised" License',
        fill: 'bsd',
        needsNotice: false,
        header: 'BSD-3-Clause',
        aliases: ['bsd3', 'BSD', 'BSD-3', 'bsd-3-clause'],
    },
    'BSD-2-Clause': {
        spdx: 'BSD-2-Clause',
        title: 'BSD 2-Clause "Simplified" License',
        fill: 'bsd',
        needsNotice: false,
        header: 'BSD-2-Clause',
        aliases: ['bsd2', 'BSD-2', 'FreeBSD', 'bsd-2-clause'],
    },
    'ISC': {
        spdx: 'ISC',
        title: 'ISC License',
        fill: 'isc',
        needsNotice: false,
        header: 'ISC License',
        aliases: ['isc'],
    },
    'MPL-2.0': {
        spdx: 'MPL-2.0',
        title: 'Mozilla Public License 2.0',
        fill: 'none',
        needsNotice: false,
        header: 'MPL-2.0',
        aliases: ['mpl2', 'MPL-2.0', 'mpl-2.0', 'MPL'],
    },
    'Unlicense': {
        spdx: 'Unlicense',
        title: 'The Unlicense',
        fill: 'none',
        needsNotice: false,
        header: 'Unlicense',
        aliases: ['unlicense', 'public domain'],
    },
    'custom': {
        spdx: 'custom',
        title: 'Custom License',
        fill: 'none',
        needsNotice: false,
        header: 'Custom License',
        aliases: ['Custom', 'Custom License', '自定义'],
    },
};

/** 自定义许可证写入 package.json 的标准写法（npm 约定：见 LICENSE 文件）。 */
export const CUSTOM_LICENSE_SPDX_FIELD = 'SEE LICENSE IN LICENSE';

/** 别名索引（小写比对）。 */
const ALIAS_INDEX: Record<string, string> = {};
for (const key of Object.keys(SPECS)) {
    ALIAS_INDEX[key.toLowerCase()] = key;
    const al = SPECS[key].aliases || [];
    for (const a of al) ALIAS_INDEX[String(a).toLowerCase()] = key;
}

/** 全部支持的 SPDX 标识符（供工具描述与报错提示）。 */
export const SUPPORTED_LICENSES = Object.keys(SPECS);

/**
 * 归一化用户传入的 type：接受 SPDX 标识符与常见别名，返回规范 SPDX。
 * 无法识别返回 null。
 */
export function normalizeLicenseType(raw: string): string | null {
    const s = String(raw || '').trim();
    if (!s) return null;
    const hit = ALIAS_INDEX[s.toLowerCase()];
    return hit || null;
}

// ============================================================================
// 正文填充
// ============================================================================

/** 规整年份：接受 2026 / 2024-2026 / 2024–2026（全角破折号）。 */
export function normalizeYearRange(raw: any): string {
    if (raw === undefined || raw === null || raw === '') {
        return String(new Date().getFullYear());
    }
    const s = String(raw).trim().replace(/[–—~～]/g, '-').replace(/\s+/g, '');
    // 只保留数字与连字符
    const cleaned = s.replace(/[^0-9-]/g, '');
    if (!cleaned) return String(new Date().getFullYear());
    return cleaned;
}

/** 规整作者名：去首尾空白；空则报错由上层处理。 */
function normalizeAuthor(raw: any): string {
    return String(raw === undefined || raw === null ? '' : raw).trim();
}

/**
 * 按 fill 规则把 year / author 填进许可证原文。
 * 只替换该许可证确实存在的占位符，其余原样保留。
 */
function fillLicenseText(spdx: string, text: string, year: string, author: string): string {
    const spec = SPECS[spdx];
    if (!spec) return text;
    const holder = author + (year ? '' : '');
    if (spec.fill === 'mit') {
        // MIT: Copyright (c) <year> <copyright holders>
        return text.replace(
            /Copyright \(c\) <year> <copyright holders>/,
            'Copyright (c) ' + [year, holder].filter(Boolean).join(' ')
        );
    }
    if (spec.fill === 'bsd') {
        // BSD: Copyright (c) <year> <owner>.
        return text.replace(
            /Copyright \(c\) <year> <owner>/,
            'Copyright (c) ' + [year, holder].filter(Boolean).join(' ')
        );
    }
    if (spec.fill === 'isc') {
        // ISC: Copyright <year> <owner>
        return text.replace(
            /Copyright <year> <owner>/,
            'Copyright ' + [year, holder].filter(Boolean).join(' ')
        );
    }
    if (spec.fill === 'apache') {
        // Apache: 附录 boilerplate 的 Copyright [yyyy] [name of copyright owner]
        return text.replace(
            /Copyright \[yyyy\] \[name of copyright owner\]/,
            'Copyright ' + [year, holder].filter(Boolean).join(' ')
        );
    }
    if (spec.fill === 'gnu') {
        // GPL / AGPL / LGPL: 文末「How to Apply These Terms」附录的示例模板
        //   `    Copyright (C) <year>  <name of author>`
        //   `    <program>  Copyright (C) <year>  <name of author>`
        // 官方就是要求使用者把这两处换成自己的信息。
        // 注意：原文是两个空格分隔（`<year>  <name>`），替换时保持同样风格。
        const info = 'Copyright (C) ' + [year, holder].filter(Boolean).join('  ');
        return text
            .replace(/Copyright \(C\) <year>\s+<name of author>/g, info);
    }
    // 'none'：MPL / Unlicense 正文不含版权占位符
    return text;
}

/**
 * 生成 NOTICE 内容。目前只有 Apache-2.0 需要。
 */
function buildNotice(spdx: string, year: string, author: string, projectName: string): string | null {
    const spec = SPECS[spdx];
    if (!spec || !spec.needsNotice) return null;
    const lines: string[] = [];
    lines.push(projectName || 'This product');
    lines.push('Copyright ' + [year, author].filter(Boolean).join(' '));
    lines.push('');
    lines.push('This product includes software developed as part of the above project.');
    lines.push('');
    lines.push('Licensed under the ' + spec.title + '.');
    return lines.join('\n') + '\n';
}

// ============================================================================
// 源码版权头
// ============================================================================

/**
 * 生成版权头注释（块注释形式，TypeScript/JavaScript 通用）。
 *
 * 对 GPL 系（-or-later）保留「or any later version」的经典声明措辞；
 * 对 -only 则明确写「version 3 of the License」。
 */
function buildHeaderComment(spdx: string, year: string, author: string): string {
    const spec = SPECS[spdx];
    const name = spec ? spec.title : spdx;
    const lines: string[] = [];
    lines.push('/*');
    lines.push(' * SPDX-FileCopyrightText: ' + [year, author].filter(Boolean).join(' '));
    lines.push(' * SPDX-License-Identifier: ' + spdx);
    lines.push(' *');
    if (spdx === 'MIT') {
        lines.push(' * ' + name);
        lines.push(' *');
        lines.push(' * Permission is hereby granted, free of charge, to any person obtaining a copy');
        lines.push(' * of this software and associated documentation files (the "Software"), to deal');
        lines.push(' * in the Software without restriction, subject to the conditions of the MIT License.');
        lines.push(' * See the LICENSE file for the full text.');
    } else if (spdx === 'Apache-2.0') {
        lines.push(' * Licensed under the Apache License, Version 2.0 (the "License");');
        lines.push(' * you may not use this file except in compliance with the License.');
        lines.push(' * You may obtain a copy of the License at');
        lines.push(' *');
        lines.push(' *     http://www.apache.org/licenses/LICENSE-2.0');
        lines.push(' *');
        lines.push(' * Unless required by applicable law or agreed to in writing, software');
        lines.push(' * distributed under the License is distributed on an "AS IS" BASIS,');
        lines.push(' * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.');
        lines.push(' * See the License for the specific language governing permissions and');
        lines.push(' * limitations under the License.');
    } else if (spdx.indexOf('GPL-3.0') === 0) {
        lines.push(' * This program is free software: you can redistribute it and/or modify');
        lines.push(' * it under the terms of the GNU General Public License as published by');
        lines.push(' * the Free Software Foundation, ' +
            (spdx === 'GPL-3.0-or-later'
                ? 'either version 3 of the License, or'
                : 'version 3 of the License,'));
        if (spdx === 'GPL-3.0-or-later') {
            lines.push(' * (at your option) any later version.');
        }
        lines.push(' *');
        lines.push(' * This program is distributed in the hope that it will be useful,');
        lines.push(' * but WITHOUT ANY WARRANTY; without even the implied warranty of');
        lines.push(' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the');
        lines.push(' * GNU General Public License for more details.');
        lines.push(' *');
        lines.push(' * You should have received a copy of the GNU General Public License');
        lines.push(' * along with this program. If not, see <http://www.gnu.org/licenses/>.');
    } else if (spdx.indexOf('AGPL-3.0') === 0) {
        lines.push(' * This program is free software: you can redistribute it and/or modify');
        lines.push(' * it under the terms of the GNU Affero General Public License as published by');
        lines.push(' * the Free Software Foundation, ' +
            (spdx === 'AGPL-3.0-or-later'
                ? 'either version 3 of the License, or'
                : 'version 3 of the License,'));
        if (spdx === 'AGPL-3.0-or-later') {
            lines.push(' * (at your option) any later version.');
        }
        lines.push(' *');
        lines.push(' * This program is distributed in the hope that it will be useful,');
        lines.push(' * but WITHOUT ANY WARRANTY; without even the implied warranty of');
        lines.push(' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the');
        lines.push(' * GNU Affero General Public License for more details.');
        lines.push(' *');
        lines.push(' * You should have received a copy of the GNU Affero General Public License');
        lines.push(' * along with this program. If not, see <http://www.gnu.org/licenses/>.');
    } else if (spdx.indexOf('LGPL-3.0') === 0) {
        lines.push(' * This library is free software: you can redistribute it and/or modify');
        lines.push(' * it under the terms of the GNU Lesser General Public License as published by');
        lines.push(' * the Free Software Foundation, ' +
            (spdx === 'LGPL-3.0-or-later'
                ? 'either version 3 of the License, or'
                : 'version 3 of the License,'));
        if (spdx === 'LGPL-3.0-or-later') {
            lines.push(' * (at your option) any later version.');
        }
        lines.push(' *');
        lines.push(' * This library is distributed in the hope that it will be useful,');
        lines.push(' * but WITHOUT ANY WARRANTY; without even the implied warranty of');
        lines.push(' * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the');
        lines.push(' * GNU Lesser General Public License for more details.');
        lines.push(' *');
        lines.push(' * You should have received a copy of the GNU Lesser General Public License');
        lines.push(' * along with this library. If not, see <http://www.gnu.org/licenses/>.');
    } else if (spdx === 'MPL-2.0') {
        lines.push(' * This Source Code Form is subject to the terms of the Mozilla Public');
        lines.push(' * License, v. 2.0. If a copy of the MPL was not distributed with this');
        lines.push(' * file, You can obtain one at https://mozilla.org/MPL/2.0/.');
    } else if (spdx === 'Unlicense') {
        lines.push(' * This is free and unencumbered software released into the public domain.');
        lines.push(' * See the LICENSE file for the full text.');
    } else if (spdx === 'BSD-3-Clause' || spdx === 'BSD-2-Clause') {
        lines.push(' * ' + name);
        lines.push(' *');
        lines.push(' * Redistribution and use in source and binary forms, with or without');
        lines.push(' * modification, are permitted provided that the conditions of the');
        lines.push(' * ' + spdx + ' license are met. See the LICENSE file for the full text.');
    } else if (spdx === 'ISC') {
        lines.push(' * ' + name);
        lines.push(' *');
        lines.push(' * Permission to use, copy, modify, and/or distribute this software for any');
        lines.push(' * purpose with or without fee is hereby granted, provided that the above');
        lines.push(' * copyright notice and this permission notice appear in all copies.');
    } else if (spdx === 'custom') {
        lines.push(' * ' + name);
        lines.push(' *');
        lines.push(' * See the LICENSE file for the full text.');
    } else {
        lines.push(' * ' + name + ' — see the LICENSE file for the full text.');
    }
    lines.push(' */');
    return lines.join('\n');
}

/** 判断一段文本是否已经带了可见的许可证头（避免重复插入）。 */
function hasLicenseHeader(text: string): boolean {
    const head = text.slice(0, 2000);
    return /SPDX-License-Identifier\s*:/i.test(head);
}

/**
 * 从已有版权头里抠出「原作者 + 原年份」。
 * 期望格式：`* SPDX-FileCopyrightText: 2026 Serveryyswys`
 * 抠不出来返回 null。
 */
function parseExistingCopyright(src: string): { year: string; author: string } | null {
    const head = src.slice(0, 2000);
    const m = /SPDX-FileCopyrightText\s*:\s*(.*)/i.exec(head);
    if (!m) return null;
    const line = m[1].trim();
    if (!line) return null;
    // 拆成「年份段 + 作者段」：年份段形如 2026 或 2024-2026
    const ym = /^(\d{4}(?:\s*-\s*\d{4})?)\s+(.*)$/.exec(line);
    if (ym) return { year: ym[1].replace(/\s+/g, ''), author: ym[2].trim() };
    // 只有作者（没有年份）
    return { year: '', author: line };
}

/**
 * 把版权头插到源码最前面（幂等）。
 * 若已有版权头：替换整段，但**保留原头部的作者与年份**——
 * 除非调用方显式传了 author / yearrange，否则不覆盖人已写好的署名。
 */
function applyHeader(src: string, header: string, keepExisting: boolean): string {
    let next = header;
    if (keepExisting) {
        const old = parseExistingCopyright(src);
        if (old) {
            // 用原文里的署名/年份重建头部（replace 第一处 SPDX-FileCopyrightText 行）
            const want = [old.year, old.author].filter(Boolean).join(' ');
            if (want) {
                next = next.replace(/SPDX-FileCopyrightText\s*:.*/, 'SPDX-FileCopyrightText: ' + want);
            }
        }
    }
    if (hasLicenseHeader(src)) {
        // 已有块注释头：找到第一个 `*/`，整段换掉
        const close = src.indexOf('*/');
        if (close >= 0) {
            const rest = src.slice(close + 2).replace(/^\s*\n/, '');
            return next + '\n' + rest;
        }
    }
    return next + '\n' + src.replace(/^\s*\n+/, '');
}

// ============================================================================
// 入口文件推导
// ============================================================================

/**
 * manifest.main 指向编译产物（如 main.js），源码在 src/ 下（如 src/main.ts）。
 * 这里按优先级找一个「应该被打上版权头」的源文件：
 *   1. src/<main 去扩展名>.ts
 *   2. src/<main 去扩展名>.js
 *   3. <main 同名>.ts
 *   4. <main> 本身（若已是源文件）
 * 都找不到返回 null。
 */
function resolveEntrySource(projectDir: string, mainRel: string): string | null {
    const clean = String(mainRel || '').replace(/^[./\\]+/, '');
    if (!clean) return null;
    const noExt = clean.replace(/\.(js|mjs|cjs)$/i, '');
    const candidates = [
        'src/' + noExt + '.ts',
        'src/' + noExt + '.js',
        noExt + '.ts',
        clean,
    ];
    for (const c of candidates) {
        const full = joinPath(projectDir, c);
        const txt = readTextSafe(full);
        if (txt !== null) return full;
    }
    return null;
}

function joinPath(a: string, b: string): string {
    if (!a) return b;
    if (!b) return a;
    return String(a).replace(/[\/\\]+$/, '') + '/' + String(b).replace(/^[\/\\]+/, '');
}

// ============================================================================
// 主流程
// ============================================================================

export interface LicenseOptions {
    /** 项目根目录（绝对路径） */
    projectDir: string;
    /** 许可证类型（SPDX 或别名） */
    type: string;
    /** 版权人（可空 -> 取 manifest.author[0]） */
    author?: string;
    /** 年份或年份区间（可空 -> 当前年） */
    yearrange?: any;
    /** 是否写入 package.json 的 license 字段（默认 true） */
    updatePackageJson?: boolean;
    /** 是否给入口文件加版权头（默认 true） */
    addHeader?: boolean;
    /**
     * 已有 LICENSE 时是否覆盖（默认 false）。
     * 为 false 时不写 LICENSE，仅把冲突信息放进 warnings，其余产物照常生成。
     */
    overwrite?: boolean;
    /**
     * type 为 'custom' 时的许可证正文（原样写入 LICENSE，不做任何占位符替换）。
     * 非 custom 时忽略。
     */
    customContent?: string;
}

export interface LicenseResult {
    /** 规范 SPDX 标识符 */
    spdx: string;
    /** 实际使用的年份 */
    year: string;
    /** 实际使用的版权人 */
    author: string;
    /** 写入的文件（绝对路径） */
    written: string[];
    /** 加头部的文件（绝对路径） */
    headered: string[];
    /** package.json 是否被更新 */
    packageJsonUpdated: boolean;
    /** 已有 LICENSE 时是否被跳过（未覆盖） */
    licenseSkipped: boolean;
    /** 警告信息 */
    warnings: string[];
}

/**
 * 生成 LICENSE / NOTICE，并给入口源文件加版权头，同时更新 package.json。
 */
export async function generateLicense(opts: LicenseOptions): Promise<LicenseResult> {
    const warnings: string[] = [];
    const projectDir = String(opts.projectDir || '').replace(/[\/\\]+$/, '');
    if (!projectDir) throw new Error('缺少 projectDir');

    const spdx = normalizeLicenseType(opts.type);
    if (!spdx) {
        throw new Error(
            '不支持的许可证类型：' + String(opts.type) +
            '。可选值：' + SUPPORTED_LICENSES.join(' / ')
        );
    }

    // ---- manifest / package.json ----
    const manifestPath = joinPath(projectDir, 'manifest.json');
    const manifestText = readTextSafe(manifestPath);
    let manifest: any = null;
    if (manifestText !== null) {
        try {
            manifest = JSON.parse(manifestText);
        } catch (_e) {
            warnings.push('manifest.json 解析失败，将忽略其中的 author 信息');
        }
    } else {
        warnings.push('未找到 manifest.json（toolpkg 项目通常应有）');
    }

    const pkgPath = joinPath(projectDir, 'package.json');
    const pkgText = readTextSafe(pkgPath);
    let pkg: any = null;
    if (pkgText !== null) {
        try {
            pkg = JSON.parse(pkgText);
        } catch (_e) {
            warnings.push('package.json 解析失败，将跳过 license 字段写入');
        }
    }

    // ---- author ----
    let author = normalizeAuthor(opts.author);
    if (!author) {
        const ma = manifest && manifest.author;
        if (Array.isArray(ma) && ma.length) author = String(ma[0]).trim();
        else if (typeof ma === 'string' && ma.trim()) author = ma.trim();
    }
    if (!author && pkg) {
        const pa = pkg.author;
        if (typeof pa === 'string' && pa.trim()) {
            // 形如 "Name <mail> (url)" 时取 Name
            author = pa.replace(/<[^>]*>/g, '').replace(/\([^)]*\)/g, '').trim();
        } else if (pa && typeof pa === 'object' && pa.name) {
            author = String(pa.name).trim();
        }
    }
    if (!author) {
        warnings.push('未提供 author，且 manifest/package.json 中也没有，LICENSE 里版权人将为空');
    }

    const year = normalizeYearRange(opts.yearrange);

    // ---- 项目名（NOTICE 用）----
    let projectName = '';
    if (manifest) {
        const dn = manifest.display_name;
        if (dn && typeof dn === 'object') projectName = String(dn.zh || dn.en || '');
        else if (typeof dn === 'string') projectName = dn;
        if (!projectName && manifest.toolpkg_id) projectName = String(manifest.toolpkg_id);
    }
    if (!projectName && pkg && pkg.name) projectName = String(pkg.name);

    // ---- LICENSE 正文 ----
    const isCustom = spdx === 'custom';
    let licenseBody: string;
    if (isCustom) {
        const raw = String(opts.customContent === undefined || opts.customContent === null ? '' : opts.customContent);
        if (!raw.trim()) {
            throw new Error('type=custom 时必须提供 custom_content（自定义许可证正文）');
        }
        // 自定义许可证原样使用，不做任何占位符替换
        licenseBody = raw;
    } else {
        const rawText = LICENSE_TEXTS[spdx];
        if (!rawText) {
            throw new Error('内部错误：缺少 ' + spdx + ' 的许可证原文');
        }
        licenseBody = fillLicenseText(spdx, rawText, year, author);
    }
    const licensePath = joinPath(projectDir, 'LICENSE');

    let licenseSkipped = false;
    const exists = readTextSafe(licensePath) !== null;
    if (exists && opts.overwrite !== true) {
        // 已存在 LICENSE：默认不覆盖，只提示
        licenseSkipped = true;
        warnings.push('LICENSE 已存在，未覆盖。如需替换请显式传 overwrite: true');
    } else {
        if (exists) warnings.push('LICENSE 已存在，按 overwrite 要求覆盖');
        await writeText(licensePath, licenseBody);
    }

    const written: string[] = licenseSkipped ? [] : [licensePath];

    // ---- NOTICE（仅 Apache-2.0）----
    const notice = buildNotice(spdx, year, author, projectName);
    if (notice !== null) {
        const noticePath = joinPath(projectDir, 'NOTICE');
        await writeText(noticePath, notice);
        written.push(noticePath);
    }

    // ---- 入口文件版权头 ----
    const headered: string[] = [];
    const wantHeader = opts.addHeader !== false;
    if (wantHeader) {
        const mainRel = (manifest && manifest.main) ? String(manifest.main) : (pkg && pkg.main ? String(pkg.main) : 'main.js');
        const entry = resolveEntrySource(projectDir, mainRel);
        if (!entry) {
            warnings.push('未能定位入口源文件（manifest.main=' + mainRel + '），已跳过版权头写入');
        } else {
            const src = readTextSafe(entry);
            if (src === null) {
                warnings.push('入口源文件不可读：' + entry);
            } else {
                const header = buildHeaderComment(spdx, year, author);
                // 未显式传 author / yearrange 时，保留源码里已有的署名与年份
                const keepExisting = !opts.author && (opts.yearrange === undefined || opts.yearrange === null || opts.yearrange === '');
                const next = applyHeader(src, header, keepExisting);
                if (next !== src) {
                    await writeText(entry, next);
                    headered.push(entry);
                }
            }
        }
    }

    // ---- package.json license 字段 ----
    let packageJsonUpdated = false;
    if (pkg && opts.updatePackageJson !== false) {
        // custom 没有 SPDX 标识符，按 npm 约定写 "SEE LICENSE IN LICENSE"
        const fieldValue = isCustom ? CUSTOM_LICENSE_SPDX_FIELD : spdx;
        if (pkg.license !== fieldValue) {
            pkg.license = fieldValue;
            await writeText(pkgPath, stringifyJsonPreserve(pkg) + '\n');
            packageJsonUpdated = true;
        }
    } else if (!pkg) {
        warnings.push('未找到可解析的 package.json，已跳过 license 字段写入');
    }

    return {
        spdx,
        year,
        author,
        written,
        headered,
        packageJsonUpdated,
        licenseSkipped,
        warnings,
    };
}

/** 写文本文件（走 Tools.Files.write，operit 的可靠写通道）。 */
async function writeText(path: string, content: string): Promise<void> {
    await Tools.Files.write(path, content, false, 'android');
}

/**
 * 序列化 JSON，保持 2 空格缩进与原字段顺序。
 *
 * 不重排字段：`license` 已有则原地更新（顺序不变），
 * 没有则追加到末尾。JS 对象保留插入顺序，所以 parse -> 改 -> stringify 天然保序。
 */
function stringifyJsonPreserve(obj: any): string {
    return JSON.stringify(obj, null, 2);
}
