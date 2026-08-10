import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;

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
    return state;
}

function loadModules() {
    const themePath = path.resolve(__dirname, '../heys_theme_v1.js');
    eval(fs.readFileSync(themePath, 'utf8'));
    const pickerPath = path.resolve(__dirname, '../heys_login_theme_picker_v1.js');
    eval(fs.readFileSync(pickerPath, 'utf8'));
}

describe('heys_login_theme_picker_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-theme-id');
        document.documentElement.removeAttribute('data-palette');
        window.localStorage.clear();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        window.localStorage.clear();
        delete window.matchMedia;
        document.body.innerHTML = '';
        window.HEYS = originalHEYS;
    });

    it('maps palette ids to picker families', () => {
        loadModules();
        const picker = window.HEYS.LoginThemePicker;
        expect(picker.familyFromPalette('classic')).toBe('canonical');
        expect(picker.familyFromPalette('sand')).toBe('soft');
        expect(picker.softVariantFromPalette('blue')).toBe('blue');
    });

    it('applies palette and mode immediately through HEYS.Theme', () => {
        mockSystemMode('light');
        loadModules();
        const mount = document.createElement('div');
        const keypad = document.createElement('div');
        keypad.className = 'heys-auth-keypad';
        document.body.appendChild(keypad);

        const picker = window.HEYS.LoginThemePicker.mountDom({
            keypadEl: keypad,
        });
        mount.appendChild(picker.root);
        document.body.appendChild(mount);

        picker.root.querySelector('[data-family="soft"]').click();
        picker.root.querySelector('[data-soft="blue"]').click();
        picker.root.querySelector('[data-mode="auto"]').click();

        expect(window.localStorage.getItem('heys_theme_id')).toBe('blue');
        expect(window.localStorage.getItem('heys_theme_mode_pref')).toBe('auto');
        expect(document.documentElement.getAttribute('data-palette')).toBe('blue');
    });

    it('replaces keypad with expanded panel and restores on collapse', () => {
        loadModules();
        const keypad = document.createElement('div');
        keypad.className = 'heys-auth-keypad';
        document.body.appendChild(keypad);

        const picker = window.HEYS.LoginThemePicker.mountDom({ keypadEl: keypad });
        document.body.appendChild(picker.root);

        expect(keypad.classList.contains('is-hidden')).toBe(false);
        picker.setExpanded(true);
        expect(keypad.classList.contains('is-hidden')).toBe(true);
        expect(picker.root.classList.contains('is-expanded')).toBe(true);
        picker.collapse();
        expect(keypad.classList.contains('is-hidden')).toBe(false);
    });

    it('uses ink-2 ring for active classic dot', () => {
        loadModules();
        window.HEYS.Theme.setPalette('classic');
        const style = window.HEYS.LoginThemePicker.dotStyle('classic', 'classic', 'classic');
        expect(style.background).toContain('--v4-bg');
        expect(style.border).toContain('--v4-ink-2');
    });
});
