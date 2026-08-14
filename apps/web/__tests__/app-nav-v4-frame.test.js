// app-nav-v4-frame.test.js — UI v4 Prompt 3/3b: рама, шапка, нижняя навигация
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const gamificationSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_gamification_bar_v1.js'), 'utf8');
const messengerCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/1000-messenger.css'),
    'utf8',
);
const baseCss = fs.readFileSync(
    path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'),
    'utf8',
);
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

    it('Задачи и Доска в меню «Ещё» с прежними условиями', () => {
        expect(shellSrc).toContain('canUseTasksAsHome && React.createElement');
        expect(shellSrc).toContain('canUseBoardAsHome && React.createElement');
        expect(shellSrc).toContain("switchTabWithUndoCommit('tasks'");
        expect(shellSrc).toContain("switchTabWithUndoCommit('board'");
    });

    it('советы и настройки убраны из меню «Ещё»', () => {
        expect(shellSrc).not.toContain('tab-settings-item--advice');
        expect(shellSrc).not.toMatch(/tab-settings-menu[\s\S]{0,1200}renderNavIcon\('settings'\)/);
    });

    it('глобальный messenger FAB для вкладок без fab-group', () => {
        expect(shellSrc).toContain('fab-group--messenger-only');
        expect(shellSrc).toContain('global-messenger-fab');
    });

    it('adviceTabRef убран', () => {
        expect(shellSrc).not.toContain('adviceTabRef');
    });

    it('capture listener для советов смотрит на кнопку в шапке', () => {
        expect(shellSrc).toContain(".closest('.hdr-header-icon-btn--advice')");
        expect(shellSrc).not.toContain(".closest('.tab-settings-item--advice')");
        expect(shellSrc).not.toContain(".closest('.tab.tab-advice')");
    });
});

describe('UI v4 Prompt 3b — шапка', () => {
    it('советы и настройки в gamification bar, не мессенджер', () => {
        expect(gamificationSrc).toContain('hdr-header-icon-btn--advice');
        expect(gamificationSrc).toContain('hdr-header-icon-btn--settings');
        expect(gamificationSrc).toContain("name: 'sliders'");
        expect(gamificationSrc).not.toContain('hdr-header-icon-btn--messenger');
    });

    it('счётчик советов в шапке с id nav-advice-badge', () => {
        expect(gamificationSrc).toContain("id: 'nav-advice-badge'");
        expect(gamificationSrc).toContain('hdr-header-icon-btn--advice');
        expect(gamificationSrc).toContain('hdr-advice-badge');
    });

    it('кнопки шапки — 44px touch box', () => {
        const btnRule = baseCss.match(/\.hdr-header-icon-btn \{[^}]+\}/)?.[0] || '';
        expect(btnRule).toMatch(/width:\s*44px/);
        expect(btnRule).toMatch(/height:\s*44px/);
        expect(btnRule).toMatch(/min-width:\s*44px/);
        expect(baseCss).toMatch(/\.hdr-header-actions[\s\S]*?gap:\s*8px/);
    });

    it('кнопка настроек в шапке тоглит меню «Ещё», не setTab user', () => {
        expect(gamificationSrc).toContain('__heysToggleTabSettingsHandler');
        expect(gamificationSrc).not.toMatch(/hdr-header-icon-btn--settings[\s\S]{0,320}setTab\('user'\)/);
        expect(shellSrc).toContain('__heysToggleTabSettingsHandler');
        expect(shellSrc).toContain("target.closest('.hdr-header-icon-btn--settings')");
    });

    it('standalone messenger FAB скрывается при tab fab-group', () => {
        expect(messengerCss).toMatch(
            /body:has\(\.fab-group:not\(\.fab-group--messenger-only\) \.message-fab\) \.fab-group--messenger-only/,
        );
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

    it('FAB water/meal используют NavIcon вместо emoji', () => {
        const dayShell = fs.readFileSync(path.join(WEB_DIR, 'heys_day_page_shell.js'), 'utf8');
        const iconsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_nav_icons_v1.js'), 'utf8');
        expect(iconsSrc).toContain("water:");
        expect(iconsSrc).toContain("meal:");
        expect(dayShell).toContain("renderFabNavIcon('water'");
        expect(dayShell).toContain("renderFabNavIcon('meal'");
        expect(dayShell).not.toMatch(/className: 'water-fab'[\s\S]{0,80}'🥛'/);
    });
});

describe('UI v4 chrome paint — рама', () => {
    it('hdr-bottom без legacy синей рамки #4285f4', () => {
        const rules = [...baseCss.matchAll(/\.hdr-bottom\s*\{[^}]+\}/g)].map((m) => m[0]);
        const painted = rules.find((rule) => rule.includes('background: transparent')) || '';
        expect(painted).not.toContain('#4285f4');
        expect(painted).toMatch(/border:\s*none/);
    });

    it('активная вкладка nav на sand-роли, не голый литерал', () => {
        const lightRule = baseCss.match(
            /(?<!dark"\] )\n\.tabs--v4-primary \.tab\.tab-primary-nav\.active \{[^}]+\}/,
        )?.[0] || '';
        // Светлая: sand-роль (решение 2026-08-12). Тёмная: --v4-act-text как в g1d.
        expect(lightRule).toMatch(/var\(--v4-sand-act(?:-text|-deep)?/);
        expect(lightRule).not.toMatch(/color:\s*#8a4a20\s*;/);
        // Тёмная sand-nav: литералы после classic-drift fix (#e2a468 / #2f2820).
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*#e2a468[\s\S]*?background:\s*#2f2820/,
        );
    });

    it('mobile shell: bottom nav viewport full-bleed, wrap без боковых inset', () => {
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.wrap[\s\S]*?padding-inline:\s*0 !important/);
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.tabs[\s\S]*?max-width:\s*100vw !important/);
        expect(shellSrc).toContain('portalAppShellChrome');
        expect(shellSrc).toContain('ReactDOM.createPortal');
        expect(shellSrc).toMatch(/shouldRenderContent && !hideContent/);
    });

    it('primary tabs — пять равных колонок, без legacy cap 48px', () => {
        expect(baseCss).toMatch(/\.tab:not\(\.tab-primary-nav\)[\s\S]*?max-width:\s*48px/);
        expect(baseCss).toMatch(/\.tabs--v4-primary \.tab\.tab-primary-nav[\s\S]*?flex:\s*1 1 0/);
        expect(baseCss).toMatch(/@media \(max-width: 768px\)[\s\S]*?\.tabs--v4-primary \.tab-settings-wrap > \.tab[\s\S]*?display:\s*none !important/);
    });

    it('шапка расстановки — Отмена откатывает, Готово сохраняет', () => {
        expect(shellSrc).toContain('handleWidgetsEditCancel');
        expect(shellSrc).toContain("exitEditMode({ revert: true })");
        expect(shellSrc).toContain('handleWidgetsEditDone');
        expect(shellSrc).toContain("hdr-widgets-edit-title");
    });

    it('v4 nav chrome — отступы и фон как в макете', () => {
        const shellRules = [...baseCss.matchAll(/\.tabs\.tabs--v4-primary \{[^}]+\}/g)].map((m) => m[0]);
        const shellRule = shellRules.find((rule) => rule.includes('padding:')) || '';
        expect(shellRule).toMatch(/padding:\s*4px 16px calc\(16px \+ env\(safe-area-inset-bottom/);
        expect(shellRule).toMatch(/background:\s*var\(--v4-bg/);
        expect(shellRule).toMatch(/border-top:\s*none/);
        expect(baseCss).toMatch(
            /\.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*var\(--v4-sand-act-text[\s\S]*?background:\s*var\(--v4-hero/,
        );
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs\.tabs--v4-primary \{[\s\S]*?background:\s*#141210/,
        );
        expect(baseCss).toMatch(
            /\[data-theme\$="dark"\] \.tabs--v4-primary \.tab\.tab-primary-nav\.active \{\s*color:\s*#e2a468[\s\S]*?background:\s*#2f2820/,
        );
        const start = baseCss.indexOf('.tab-primary-nav-row');
        expect(start).toBeGreaterThan(-1);
        expect(baseCss.slice(start, start + 800)).toMatch(/padding:\s*8px 10px/);
        expect(baseCss).toMatch(/\.tabs--v4-primary \.crs-bar-container[\s\S]*?display:\s*none/);
        expect(baseCss).toMatch(/body:has\(\[data-heys-visible-frame="consent"\]\) \.tabs/);
    });
});
