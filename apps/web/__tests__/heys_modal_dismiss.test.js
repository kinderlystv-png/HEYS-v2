import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = window.HEYS;

function loadModalDismissModule() {
    const filePath = path.resolve(__dirname, '../heys_modal_dismiss_v1.js');
    const source = fs.readFileSync(filePath, 'utf8');
    delete window.__heysModalDismissGuardInstalled;
    eval(source);
    return window.HEYS.ModalDismiss;
}

describe('heys_modal_dismiss_v1', () => {
    beforeEach(() => {
        window.HEYS = {};
        document.body.innerHTML = '';
        delete window.__heysModalDismissGuardInstalled;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        window.HEYS = originalHEYS;
        delete window.__heysModalDismissGuardInstalled;
    });

    it('exports dismiss helpers on HEYS.ModalDismiss', () => {
        const MD = loadModalDismissModule();
        expect(MD).toBeTruthy();
        expect(typeof MD.dismissFromBackdrop).toBe('function');
        expect(typeof MD.installGhostClickSwallow).toBe('function');
        expect(typeof MD.reactBackdropDismiss).toBe('function');
        expect(MD.GHOST_MS).toBe(500);
    });

    it('recognizes backdrop-like elements', () => {
        const MD = loadModalDismissModule();
        const el = document.createElement('div');
        el.className = 'ca-modal-backdrop ca-modal-backdrop--visible';
        expect(MD.isBackdropLike(el)).toBe(true);
        expect(MD.isBackdropLike(document.createElement('span'))).toBe(false);
    });

    it('swallows the next click after dismissFromBackdrop', () => {
        const MD = loadModalDismissModule();
        const underneath = document.createElement('button');
        underneath.type = 'button';
        underneath.textContent = 'under';
        document.body.appendChild(underneath);

        const clickSpy = vi.fn();
        underneath.addEventListener('click', clickSpy);

        const event = new Event('pointerdown', { bubbles: true, cancelable: true });
        MD.dismissFromBackdrop(event, () => {});

        underneath.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        expect(clickSpy).not.toHaveBeenCalled();
    });

    it('installs global guard once', () => {
        loadModalDismissModule();
        expect(window.__heysModalDismissGuardInstalled).toBe(true);
        loadModalDismissModule();
        expect(window.__heysModalDismissGuardInstalled).toBe(true);
    });
});
