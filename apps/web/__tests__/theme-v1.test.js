import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;

// jsdom не реализует matchMedia — без подмены модуль темы считает систему
// светлой и «Как в системе» проверить нечем.
function mockSystemMode(initial) {
    const state = { dark: initial === 'dark', handlers: [] };
    window.matchMedia = () => ({
        get matches() { return state.dark; },
        addEventListener: (_type, handler) => state.handlers.push(handler),
        removeEventListener: (_type, handler) => {
            const i = state.handlers.indexOf(handler);
            if (i >= 0) state.handlers.splice(i, 1);
        },
    });
    return {
        switchTo(mode) {
            state.dark = mode === 'dark';
            state.handlers.forEach((h) => h({ matches: state.dark }));
        },
    };
}

function loadThemeModule() {
    const filePath = path.resolve(__dirname, '../heys_theme_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
    return window.HEYS.Theme;
}

describe('heys_theme_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-id');
        document.documentElement.removeAttribute('data-palette');
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-id');
        document.documentElement.removeAttribute('data-palette');
        window.HEYS = originalHEYS;
    });

    it('normalizes unknown theme ids to classic', () => {
        const Theme = loadThemeModule();
        expect(Theme.parseThemeId('nope')).toBe('classic');
        expect(Theme.parseThemeId('light')).toBe('classic');
        expect(Theme.parseThemeId('dark')).toBe('classic-dark');
    });

    it('maps classic palette to legacy dom values', () => {
        const Theme = loadThemeModule();
        expect(Theme.resolveDomTheme('classic')).toBe('light');
        expect(Theme.resolveDomTheme('classic-dark')).toBe('dark');
        expect(Theme.resolveDomTheme('sand')).toBe('sand');
        expect(Theme.resolveDomTheme('sand-dark')).toBe('sand-dark');
    });

    it('toggles mode within the same palette', () => {
        const Theme = loadThemeModule();
        expect(Theme.toggleMode('sand')).toBe('sand-dark');
        expect(Theme.toggleMode('sand-dark')).toBe('sand');
        expect(Theme.toggleMode('classic')).toBe('classic-dark');
        expect(Theme.toggleMode('blue-dark')).toBe('blue');
    });

    it('persists canonical theme id and legacy keys', () => {
        const Theme = loadThemeModule();
        Theme.writeStoredThemeId('sand-dark');

        expect(window.localStorage.getItem('heys_theme_id')).toBe('sand-dark');
        expect(window.localStorage.getItem('heys_theme_pref')).toBe('dark');
        expect(window.localStorage.getItem('heys_theme_explicit')).toBe('1');
        expect(window.localStorage.getItem('heys_theme')).toBe('sand-dark');
    });

    it('migrates legacy dark preference to classic-dark', () => {
        window.localStorage.setItem('heys_theme_explicit', '1');
        window.localStorage.setItem('heys_theme_pref', 'dark');

        const Theme = loadThemeModule();
        expect(Theme.readStoredThemeId()).toBe('classic-dark');
    });

    it('notifies subscribers when setThemeId is called', () => {
        const Theme = loadThemeModule();
        const seen = [];
        const unsubscribe = Theme.subscribeThemeChange((detail) => {
            seen.push(detail.themeId);
        });

        Theme.setThemeId('sand-dark');

        expect(seen).toEqual(['sand-dark']);
        expect(Theme.readStoredThemeId()).toBe('sand-dark');
        unsubscribe();
    });

    it('applies dom theme, palette attrs and theme-color meta', () => {
        const Theme = loadThemeModule();
        let meta = document.querySelector('meta[name="theme-color"]');
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'theme-color');
            document.head.appendChild(meta);
        }

        Theme.applyThemeToDocument('blue-dark');

        expect(document.documentElement.getAttribute('data-theme')).toBe('blue-dark');
        expect(document.documentElement.getAttribute('data-theme-id')).toBe('blue-dark');
        expect(document.documentElement.getAttribute('data-palette')).toBe('blue');
        expect(meta.getAttribute('content')).toBe('#0d1a26');
    });
});

// «Как в системе» — третий вариант предпочтения, а не третий режим: в
// data-атрибут всегда попадает вычисленный light или dark. Механика слежения
// существовала в heys_day_runtime_ui_state_v1.js, но с глобальной темой связана
// не была, и значение 'auto' схлопывалось в классику.
describe('heys_theme_v1 — «Как в системе»', () => {
    beforeEach(() => {
        window.HEYS = {};
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
        delete window.matchMedia;
        window.HEYS = originalHEYS;
    });

    it('follows the system mode while keeping the chosen palette', () => {
        mockSystemMode('dark');
        const Theme = loadThemeModule();

        Theme.setModePreference('auto');
        expect(Theme.readStoredThemeId()).toBe('classic-dark');

        Theme.setPalette('sand');
        expect(Theme.readStoredThemeId()).toBe('sand-dark');
        expect(Theme.getModePreference()).toBe('auto');
    });

    it('repaints when the system mode changes and notifies subscribers', () => {
        const system = mockSystemMode('dark');
        const Theme = loadThemeModule();
        Theme.setModePreference('auto');
        Theme.setPalette('blue');

        const seen = [];
        const unsubscribe = Theme.subscribeThemeChange((detail) => seen.push(detail.themeId));
        Theme.startSystemModeWatch();
        system.switchTo('light');

        expect(seen).toEqual(['blue']);
        expect(document.documentElement.getAttribute('data-theme-id')).toBe('blue');
        expect(Theme.getModePreference()).toBe('auto');
        unsubscribe();
    });

    it('ignores system changes once the mode is chosen by hand', () => {
        const system = mockSystemMode('dark');
        const Theme = loadThemeModule();
        Theme.setModePreference('auto');
        Theme.startSystemModeWatch();

        // Тумблер в шапке — это выбор руками, слежение снимается.
        Theme.toggleModePreference();
        expect(Theme.getModePreference()).toBe('light');
        expect(Theme.readStoredThemeId()).toBe('classic');

        system.switchTo('dark');
        expect(Theme.readStoredThemeId()).toBe('classic');
    });

    it('keeps the auto preference when the effective id is persisted', () => {
        mockSystemMode('dark');
        const Theme = loadThemeModule();
        Theme.setModePreference('auto');

        // Хук темы переписывает id на каждый рендер — это не должно
        // выглядеть как ручной выбор режима.
        Theme.writeStoredThemeId('sand-dark');
        expect(Theme.getModePreference()).toBe('auto');
    });

    it('migrates the legacy auto preference to the system mode, not to classic', () => {
        mockSystemMode('dark');
        window.localStorage.setItem('heys_theme_pref', 'auto');

        const Theme = loadThemeModule();
        expect(Theme.getModePreference()).toBe('auto');
        expect(Theme.readStoredThemeId()).toBe('classic-dark');
    });
});
