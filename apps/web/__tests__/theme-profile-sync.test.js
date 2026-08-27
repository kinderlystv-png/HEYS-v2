import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SYNC_PATH = path.resolve(__dirname, '../heys_theme_profile_sync_v1.js');
const THEME_PATH = path.resolve(__dirname, '../heys_theme_v1.js');

function loadTheme() {
    eval(fs.readFileSync(THEME_PATH, 'utf8'));
    return window.HEYS.Theme;
}

function loadSync() {
    eval(fs.readFileSync(SYNC_PATH, 'utf8'));
    return window.HEYS.ThemeProfileSync;
}

describe('heys_theme_profile_sync_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        window.localStorage.clear();
        window.HEYS.utils = {
            lsGet: (key, fallback) => {
                const raw = window.localStorage.getItem(key);
                if (raw == null) return fallback;
                try { return JSON.parse(raw); } catch (_) { return fallback; }
            },
            lsSet: (key, value) => {
                window.localStorage.setItem(key, JSON.stringify(value));
            },
        };
        loadTheme();
        loadSync();
        window.HEYS.ThemeProfileSync.ensureInstalled();
    });

    afterEach(() => {
        window.localStorage.clear();
        delete window.HEYS;
    });

    it('writes palette and mode preference to profile on theme change', () => {
        const Theme = window.HEYS.Theme;
        Theme.setPalette('blue');
        Theme.setModePreference('dark');

        const profile = window.HEYS.utils.lsGet('heys_profile', {});
        expect(profile.themePalette).toBe('blue');
        expect(profile.themeModePref).toBe('dark');
    });

    it('applies theme from profile on profile-updated', () => {
        window.HEYS.utils.lsSet('heys_profile', {
            themePalette: 'blue',
            themeModePref: 'light',
        });
        window.dispatchEvent(new CustomEvent('heys:profile-updated', {
            detail: { fields: ['themePalette', 'themeModePref'], source: 'cloud' },
        }));

        const Theme = window.HEYS.Theme;
        expect(Theme.getPalette(Theme.readStoredThemeId())).toBe('blue');
        expect(Theme.getModePreference()).toBe('light');
    });

    it('migrates local theme into profile when profile has no theme fields', () => {
        const Theme = window.HEYS.Theme;
        Theme.setPalette('sand');
        Theme.setModePreference('auto');
        window.localStorage.removeItem('heys_profile');
        window.HEYS.ThemeProfileSync.syncThemeToProfile();

        const profile = window.HEYS.utils.lsGet('heys_profile', {});
        expect(profile.themePalette).toBe('sand');
        expect(profile.themeModePref).toBe('auto');
    });
});
