/*
 * SPDX-FileCopyrightText: 2026 Serveryyswys
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * OPM ToolPkg 主入口：注册设置界面。
 * 注意：
 *   1) ToolPkg 对 *.ui.js 的 require 返回 screen 函数本体（不是 {default} 包装）。
 *   2) registerToolboxUiModule 会自动注册 route toolpkg:<id>:ui:<moduleId>，
 *      不要再手动 registerUiRoute 同名 id，否则 Duplicate route id。
 */

declare const ToolPkg: any;
declare const require: any;

let uiDebug = '';

function loadScreen(): any {
    try {
        const mod = require('./ui/opm_settings/index.ui.js');
        let screen = null;
        if (typeof mod === 'function') screen = mod;
        else if (mod && typeof mod.default === 'function') screen = mod.default;
        else if (mod && typeof mod.Screen === 'function') screen = mod.Screen;
        uiDebug = 'typeof=' + (typeof mod) + ' resolved=' + (typeof screen);
        return screen;
    } catch (e) {
        uiDebug = 'THROW: ' + String((e && e.stack) ? e.stack : e);
        return null;
    }
}

function registerToolPkg(): boolean {
    const screen = loadScreen();
    try {
        if (typeof console !== 'undefined' && console.error) {
            console.error('[opm] registerToolPkg uiDebug=' + uiDebug);
        }
    } catch (e) {}
    if (!screen) return false;

    // 工具箱 UI 模块（内部自动注册 route: toolpkg:com.operit.serveryyswys.opm:ui:opm_settings）
    ToolPkg.registerToolboxUiModule({
        id: 'opm_settings',
        runtime: 'compose_dsl',
        screen: screen,
        params: {},
        title: { zh: 'OPM包管理器设置', en: 'OPM Settings' }
    });

    // 工具箱导航入口
    ToolPkg.registerNavigationEntry({
        id: 'opm_settings_nav',
        route: 'toolpkg:com.operit.serveryyswys.opm:ui:opm_settings',
        surface: 'toolbox',
        title: { zh: 'OPM包管理器设置', en: 'OPM Settings' },
        icon: 'inventory_2',
        order: 50
    });

    return true;
}

exports.registerToolPkg = registerToolPkg;
