import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BACK_PATH = path.resolve(__dirname, '../heys_app_hardware_back_v1.js');

function loadBackNav() {
    eval(fs.readFileSync(BACK_PATH, 'utf8'));
    return window.HEYS.AppBackNav;
}

describe('heys_app_hardware_back_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        loadBackNav();
        window.HEYS.AppBackNav._resetForTests();
        document.body.innerHTML = '';
    });

    afterEach(() => {
        delete window.HEYS;
        document.body.innerHTML = '';
    });

    it('records primary tab visits in a stack', () => {
        const nav = window.HEYS.AppBackNav;
        nav.recordVisit('widgets', 'diary');
        nav.recordVisit('diary', 'activity');
        expect(nav.popVisit('activity')).toBe('diary');
        expect(nav.popVisit('diary')).toBe('widgets');
    });

    it('does not push duplicate primary tab on revisit', () => {
        const nav = window.HEYS.AppBackNav;
        nav.recordVisit('widgets', 'diary');
        nav.recordVisit('diary', 'diary');
        expect(nav.popVisit('diary')).toBe('widgets');
    });

    it('install wires setTab on popstate when no layer is open', async () => {
        const nav = window.HEYS.AppBackNav;
        let tab = 'activity';
        const setTab = vi.fn((next) => { tab = next; });
        nav.install({ getTab: () => tab, setTab });
        nav.recordVisit('widgets', 'diary');
        nav.recordVisit('diary', 'activity');

        Object.defineProperty(window.history, 'state', {
            value: {},
            configurable: true,
        });
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(setTab).toHaveBeenCalledWith('diary');
    });

    it('popstate on trap after layer close does not change tab', async () => {
        const nav = window.HEYS.AppBackNav;
        let tab = 'diary';
        const setTab = vi.fn((next) => { tab = next; });
        nav.install({ getTab: () => tab, setTab });
        nav.recordVisit('widgets', 'diary');

        Object.defineProperty(window.history, 'state', {
            value: { heysAppNav: true },
            configurable: true,
        });
        window.dispatchEvent(new PopStateEvent('popstate', { state: { heysAppNav: true } }));
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(setTab).not.toHaveBeenCalled();
    });

    it('from non-home tab with empty stack falls back to widgets', async () => {
        const nav = window.HEYS.AppBackNav;
        let tab = 'stats';
        const setTab = vi.fn((next) => { tab = next; });
        nav.install({ getTab: () => tab, setTab });

        Object.defineProperty(window.history, 'state', {
            value: {},
            configurable: true,
        });
        window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        await new Promise((resolve) => setTimeout(resolve, 10));

        expect(setTab).toHaveBeenCalledWith('widgets');
    });
});
