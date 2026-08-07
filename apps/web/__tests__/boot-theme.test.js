import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalBootTheme = window.__HEYS_BOOT_THEME__;
const BOARD_CLIENT_ID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

function loadBootThemeModule() {
    const filePath = path.resolve(__dirname, '../heys_boot_theme_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    eval(source);
    return window.HEYS.BootTheme;
}

describe('boot theme pre-paint detection', () => {
    beforeEach(() => {
        window.HEYS = {};
        window.__HEYS_BOOT_THEME__ = undefined;
        window.__HEYS_DEMO_MODE__ = { enabled: false };
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('board-dark-nav');
        document.body.classList.remove('board-dark-nav');
        window.localStorage.clear();
        window.history.replaceState({}, '', '/');
    });

    afterEach(() => {
        window.localStorage.clear();
        window.history.replaceState({}, '', '/');
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.classList.remove('board-dark-nav');
        document.body.classList.remove('board-dark-nav');
        window.HEYS = originalHEYS;
        window.__HEYS_BOOT_THEME__ = originalBootTheme;
    });

    it('applies dark global theme from explicit local preference', () => {
        window.localStorage.setItem('heys_theme_explicit', '1');
        window.localStorage.setItem('heys_theme_pref', 'dark');

        const bootTheme = loadBootThemeModule();

        expect(bootTheme.readGlobalTheme()).toBe('dark');
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(window.__HEYS_BOOT_THEME__).toMatchObject({ globalTheme: 'dark', boardDarkNav: false });
    });

    it('keeps light skeleton when global theme is light on non-board tab', () => {
        window.localStorage.setItem('heys_client_current', JSON.stringify('client-1'));
        window.localStorage.setItem('heys_profile', JSON.stringify({ defaultTab: 'diary' }));

        loadBootThemeModule();

        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(document.body.classList.contains('board-dark-nav')).toBe(false);
    });

    it('enables board-dark-nav for board client on ?tab=board with default dark board theme', () => {
        window.localStorage.setItem('heys_client_current', JSON.stringify(BOARD_CLIENT_ID));
        window.localStorage.setItem('heys_profile', JSON.stringify({ defaultTab: 'diary' }));
        window.history.replaceState({}, '', '/?tab=board');

        loadBootThemeModule();

        expect(window.__HEYS_BOOT_THEME__).toMatchObject({
            bootTab: 'board',
            boardTheme: 'dark',
            boardTabActive: true,
            boardDarkNav: true,
        });
        expect(document.documentElement.classList.contains('board-dark-nav')).toBe(true);
        expect(document.body.classList.contains('board-dark-nav')).toBe(true);
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    });

    it('respects saved light board theme on board home tab', () => {
        window.localStorage.setItem('heys_client_current', JSON.stringify(BOARD_CLIENT_ID));
        window.localStorage.setItem('heys_profile', JSON.stringify({ defaultTab: 'board' }));
        window.localStorage.setItem('heys_board_theme_v1', 'light');

        loadBootThemeModule();

        expect(window.__HEYS_BOOT_THEME__).toMatchObject({
            bootTab: 'board',
            boardTheme: 'light',
            boardDarkNav: false,
        });
        expect(document.body.classList.contains('board-dark-nav')).toBe(false);
    });
});
