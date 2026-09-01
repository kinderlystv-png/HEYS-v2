import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const pickerSource = fs.readFileSync(path.resolve(__dirname, '../heys_login_theme_picker_v1.js'), 'utf8');
const pickerCss = fs.readFileSync(path.resolve(__dirname, '../styles/modules/733-ui-v4-login-theme.css'), 'utf8');

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

    it('offers sand and blue palette variants', () => {
        loadModules();
        const picker = window.HEYS.LoginThemePicker;
        expect(picker.PALETTE_VARIANTS.map((v) => v.id)).toEqual(['sand', 'blue']);
    });

    it('keeps the full device/system hint and canvas label typography', () => {
        expect(pickerSource).toContain('«Как в системе» следит за настройкой телефона, пока вы не выберете режим руками.');
        expect(pickerCss).toMatch(/\.heys-login-theme__soft-label\s*\{[^}]*margin-top:\s*10px;[^}]*font-size:\s*11px;[^}]*font-weight:\s*700;[^}]*line-height:\s*1\.3;/);
        expect(pickerCss).toMatch(/\.heys-login-theme__hint\s*\{[^}]*margin-top:\s*16px;[^}]*font-size:\s*11px;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.5;/);
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

        picker.root.querySelector('[data-palette="blue"]').click();
        picker.root.querySelector('[data-mode="auto"]').click();

        expect(window.localStorage.getItem('heys_theme_id')).toBe('blue');
        expect(window.localStorage.getItem('heys_theme_mode_pref')).toBe('auto');
        expect(document.documentElement.getAttribute('data-palette')).toBe('blue');
    });

    it('moves expanded panel into card slot when dockLayout is enabled', () => {
        loadModules();
        const keypad = document.createElement('div');
        keypad.className = 'heys-auth-keypad';
        document.body.appendChild(keypad);
        const panelSlot = document.createElement('div');
        panelSlot.className = 'heys-auth-theme-panel-slot';
        document.body.appendChild(panelSlot);
        const mount = document.createElement('div');
        document.body.appendChild(mount);

        const picker = window.HEYS.LoginThemePicker.mountDom({
            keypadEl: keypad,
            scope: 'login',
            dockLayout: true,
            panelSlotEl: panelSlot,
        });
        mount.appendChild(picker.root);

        picker.setExpanded(true);
        expect(panelSlot.querySelector('.heys-login-theme.is-expanded .heys-login-theme__panel')).toBeTruthy();
        expect(picker.root.classList.contains('is-expanded')).toBe(false);
        picker.collapse();
        expect(panelSlot.textContent).toBe('');
        expect(keypad.classList.contains('is-hidden')).toBe(false);
    });

    it('replaces keypad with expanded panel and restores on collapse', () => {
        loadModules();
        const keypad = document.createElement('div');
        keypad.className = 'heys-auth-keypad';
        document.body.appendChild(keypad);

        const picker = window.HEYS.LoginThemePicker.mountDom({ keypadEl: keypad, scope: 'login' });
        document.body.appendChild(picker.root);

        expect(keypad.classList.contains('is-hidden')).toBe(false);
        picker.setExpanded(true);
        expect(keypad.classList.contains('is-hidden')).toBe(true);
        expect(picker.root.classList.contains('is-expanded')).toBe(true);
        expect(picker.root.classList.contains('heys-login-theme--login-only')).toBe(true);
        expect(picker.root.querySelector('.heys-login-theme__done')?.textContent).toBe('Готово');
        expect(picker.root.querySelector('.heys-login-theme__section-label')?.textContent).toBe('Палитра');
        expect(picker.root.querySelector('[data-mode="dark"]')).toBeNull();
        picker.collapse();
        expect(keypad.classList.contains('is-hidden')).toBe(false);
    });

    it('keeps keypad visible when picker is dimmed for PIN error', () => {
        loadModules();
        const keypad = document.createElement('div');
        keypad.className = 'heys-auth-keypad';
        document.body.appendChild(keypad);

        const picker = window.HEYS.LoginThemePicker.mountDom({ keypadEl: keypad, scope: 'login' });
        document.body.appendChild(picker.root);

        picker.setDimmed(true);
        expect(picker.root.classList.contains('is-dimmed')).toBe(true);
        expect(keypad.classList.contains('is-hidden')).toBe(false);
        picker.setDimmed(false);
        expect(keypad.classList.contains('is-hidden')).toBe(false);
    });

    it('paints current palette as three-dot swatch', () => {
        loadModules();
        window.HEYS.Theme.setPalette('sand');
        const style = window.HEYS.LoginThemePicker.dotStyle('sand', 'sand', 'act');
        expect(style.background).toContain('#c67139');
        const ring = window.HEYS.LoginThemePicker.dotStyle('sand', 'sand', 'ring');
        expect(ring.background).toBe('transparent');
    });
});
