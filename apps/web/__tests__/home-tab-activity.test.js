// home-tab-activity.test.js — «Актив» как домашняя вкладка.
//
// Пикер в настройках предлагает шесть вкладок, включая «Актив», но список
// разрешённых домашних вкладок в heys_app_tab_state_v1.js его не содержал:
// выбор сохранялся в профиль и молча откатывался на «Питание» при следующем
// открытии. Тест держит оба списка согласованными.

import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const tabStateSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_tab_state_v1.js'), 'utf8');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');

function baseHomeTabs() {
    const m = /const BASE_HOME_TABS = \[([^\]]+)\]/.exec(tabStateSrc);
    if (!m) throw new Error('BASE_HOME_TABS не найден');
    return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

/** Ключи из HOME_TAB_OPTIONS — то, что человек реально видит в настройках. */
function pickerKeys() {
    const start = shellSrc.indexOf('const HOME_TAB_OPTIONS');
    const chunk = shellSrc.slice(start, start + 1200);
    return [...chunk.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
}

describe('домашняя вкладка', () => {
    it('«Актив» разрешён как домашняя вкладка', () => {
        expect(baseHomeTabs()).toContain('activity');
    });

    it('tasks и board добавляются только post-release labs клиенту', () => {
        expect(baseHomeTabs()).not.toContain('tasks');
        expect(baseHomeTabs()).not.toContain('board');
        expect(tabStateSrc).toContain('isPostReleaseLabsClient');
        expect(tabStateSrc).toContain("tabs.push('tasks')");
        expect(tabStateSrc).toContain("tabs.push('board')");
    });

    it('каждая вкладка из пикера настроек действительно применима', () => {
        // Пикер не должен предлагать то, что resolveHomeTab потом откатит.
        // 'board' и 'tasks' добавляются условно, по правам клиента.
        const conditional = ['board', 'tasks'];
        const allowed = baseHomeTabs();
        const missing = pickerKeys().filter((k) => !conditional.includes(k) && !allowed.includes(k));
        expect(missing).toEqual([]);
    });

    it('при смене вкладки монтирует свежую scroll-surface с начала', () => {
        expect(shellSrc).toContain('tab-active-viewport');
        expect(shellSrc).toMatch(/key: 'tab-view-' \+ String\(tab/);
        expect(tabStateSrc).not.toContain('resetAppScrollTop');
        const baseCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
        expect(baseCss).toContain('.wrap:not(.wrap--no-header) > .tab-content-swipeable > .tab-active-viewport');
        expect(baseCss).toMatch(/\.wrap:not\(\.wrap--no-header\) > \.tab-content-swipeable[\s\S]*min-height: 0/);
    });
});
