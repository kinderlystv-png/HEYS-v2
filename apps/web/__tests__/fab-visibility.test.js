import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;

function loadFabVisibilityModule() {
    const filePath = path.resolve(__dirname, '../heys_fab_visibility_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
    return window.HEYS.FabVisibility;
}

describe('heys_fab_visibility_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
        window.HEYS = originalHEYS;
    });

    it('defaults optional FAB keys to visible', () => {
        const FabVisibility = loadFabVisibilityModule();
        expect(FabVisibility.read()).toEqual({
            water: true,
            hunger: true,
            message: true,
            activity: true,
            meal: true,
        });
    });

    it('persists hidden FAB keys in localStorage', () => {
        const FabVisibility = loadFabVisibilityModule();
        FabVisibility.setVisible('water', false);
        FabVisibility.setVisible('activity', false);
        expect(FabVisibility.read()).toEqual({
            water: false,
            hunger: true,
            message: true,
            activity: false,
            meal: true,
        });
    });

    it('keeps draft separate from committed visibility until commit', () => {
        const FabVisibility = loadFabVisibilityModule();
        FabVisibility.beginSettingsEdit();
        FabVisibility.setDraftVisible('hunger', false);
        expect(FabVisibility.read().hunger).toBe(true);
        expect(FabVisibility.readSettingsDraft().hunger).toBe(false);
        FabVisibility.commitSettingsEdit();
        expect(FabVisibility.read().hunger).toBe(false);
    });

    it('commits with animated flag only when draft changed', () => {
        const FabVisibility = loadFabVisibilityModule();
        let payload = null;
        const handler = (event) => { payload = event.detail; };
        window.addEventListener('heys:fab-visibility-changed', handler);

        FabVisibility.beginSettingsEdit();
        FabVisibility.commitSettingsEdit();
        expect(payload).toBeNull();

        FabVisibility.beginSettingsEdit();
        FabVisibility.toggleDraftVisible('message');
        FabVisibility.commitSettingsEdit();
        window.removeEventListener('heys:fab-visibility-changed', handler);
        expect(payload?.animated).toBe(true);
        expect(payload?.visibility?.message).toBe(false);
    });

    // Строка контракта «что чипуется»: порядок чипов совпадает с порядком в
    // карточке быстрых действий снизу вверх. Прежний порядок в тесте был
    // зафиксирован до того, как карточка стала строиться из этих же ключей,
    // и не совпадал ни с чем. Пятый чип назван «Еда», как строка карточки.
    it('uses canvas labels and card order for chips', () => {
        const FabVisibility = loadFabVisibilityModule();
        expect(FabVisibility.OPTIONS.map((item) => item.label)).toEqual([
            'Вода',
            'Еда',
            'Голод и энергия',
            'Активность',
            'Мессенджер',
        ]);
    });
});

describe('settings sheet FAB chips markup', () => {
    it('renders FAB block inside appearance panel', () => {
        const shellPath = path.resolve(__dirname, '../heys_app_shell_v1.js');
        const shellSrc = fs.readFileSync(shellPath, 'utf8');
        expect(shellSrc).toContain("sheetExtra === 'theme'");
        expect(shellSrc).toContain('hdr-settings-sheet__fab-card');
        // Контракт settings-system, строка «где живёт раздел»: ярус называется
        // «Быстрые действия»; «Плавающие кнопки» — прежнее имя, и оно в тексте
        // не должно остаться, иначе настройка и карточка на Главной снова
        // разъедутся по названиям.
        expect(shellSrc).toContain('Быстрые действия');
        expect(shellSrc).not.toContain('Плавающие кнопки');
        expect(shellSrc).toContain('Кнопки перестроятся, когда закроете настройки');
        expect(shellSrc).not.toContain("sheetExtra === 'fabs'");
    });

    it('QuickActionsFabGroup toggles meal slot like other FABs', () => {
        const dayShellPath = path.resolve(__dirname, '../heys_day_page_shell.js');
        const dayShellSrc = fs.readFileSync(dayShellPath, 'utf8');
        expect(dayShellSrc).not.toContain("key === 'meal' ? true");
        expect(dayShellSrc).toContain('fabVisibility[key] !== false');
        expect(dayShellSrc).toContain('activity-fab');
        expect(dayShellSrc).toContain("fab-slot--' + key");
    });

    it('defers FAB visibility update until layout-animate paints', () => {
        const dayShellPath = path.resolve(__dirname, '../heys_day_page_shell.js');
        const dayShellSrc = fs.readFileSync(dayShellPath, 'utf8');
        expect(dayShellSrc).toContain('fab-group--layout-animate animate-always');
        expect(dayShellSrc).toContain('requestAnimationFrame(() => {');
        expect(dayShellSrc).not.toMatch(/setFabVisibility\(visibility\);\s*if \(event\?\.detail\?\.animated\)/);
    });
});
