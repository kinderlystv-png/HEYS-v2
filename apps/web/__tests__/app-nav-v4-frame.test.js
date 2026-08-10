// app-nav-v4-frame.test.js — UI v4 Prompt 3: пять вкладок внизу, задачи/доска/советы в меню ⚙️
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const swipeSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_swipe_nav_v1.js'), 'utf8');
const bundleCfg = fs.readFileSync(
    path.resolve(WEB_DIR, '../../scripts/legacy-bundle-config.mjs'),
    'utf8',
);

function primaryTabKeys() {
    const start = shellSrc.indexOf('const primaryTabs = React.useMemo(() => ([');
    const chunk = shellSrc.slice(start, start + 900);
    return [...chunk.matchAll(/key: '([a-z]+)'/g)].map((m) => m[1]);
}

describe('UI v4 — нижняя навигация', () => {
    it('primaryTabs — ровно пять вкладок в порядке макета', () => {
        expect(primaryTabKeys()).toEqual(['widgets', 'diary', 'activity', 'stats', 'insights']);
    });

    it('Главная подписана «Главная», не «Виджеты»', () => {
        const start = shellSrc.indexOf('const primaryTabs = React.useMemo(() => ([');
        const chunk = shellSrc.slice(start, start + 400);
        expect(chunk).toContain("label: 'Главная'");
        expect(chunk).not.toContain("label: 'Виджеты'");
    });

    it('разметка v4 primary nav без iOS switch', () => {
        expect(shellSrc).toContain('tabs--v4-primary');
        expect(shellSrc).toContain('tab-primary-nav-row');
        expect(shellSrc).not.toMatch(/primaryTabsVariant/);
    });

    it('Задачи и Доска в меню ⚙️ с прежними условиями', () => {
        expect(shellSrc).toContain('canUseTasksAsHome && React.createElement');
        expect(shellSrc).toContain('canUseBoardAsHome && React.createElement');
        expect(shellSrc).toContain("switchTabWithUndoCommit('tasks'");
        expect(shellSrc).toContain("switchTabWithUndoCommit('board'");
        expect(shellSrc).toContain('tab-settings-item--advice');
    });

    it('счётчик советов сохраняет id nav-advice-badge', () => {
        expect(shellSrc).toContain("id: 'nav-advice-badge'");
    });

    it('adviceTabRef убран', () => {
        expect(shellSrc).not.toContain('adviceTabRef');
    });

    it('capture listener для советов смотрит на пункт меню', () => {
        expect(shellSrc).toContain(".closest('.tab-settings-item--advice')");
        expect(shellSrc).not.toContain(".closest('.tab.tab-advice')");
    });
});

describe('UI v4 — свайп между вкладками', () => {
    it('SWIPEABLE_TABS совпадает с пятью primary tabs', () => {
        const m = /const SWIPEABLE_TABS = \[([^\]]+)\]/.exec(swipeSrc);
        expect(m, 'SWIPEABLE_TABS не найден').toBeTruthy();
        const swipeKeys = m[1]
            .split(',')
            .map((s) => s.trim().replace(/^'|'$/g, ''))
            .filter(Boolean);
        expect(swipeKeys).toEqual(['widgets', 'diary', 'activity', 'stats', 'insights']);
        expect(swipeKeys).not.toContain('tasks');
    });
});

describe('UI v4 — иконки', () => {
    it('nav icons подключены в legacy bundle до shell', () => {
        const iconsIdx = bundleCfg.indexOf("'heys_app_nav_icons_v1.js'");
        const shellIdx = bundleCfg.indexOf("'heys_app_shell_v1.js'");
        expect(iconsIdx).toBeGreaterThan(-1);
        expect(shellIdx).toBeGreaterThan(iconsIdx);
    });
});
