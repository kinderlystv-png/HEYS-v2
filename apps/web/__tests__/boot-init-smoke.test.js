/**
 * Boot-init smoke test.
 *
 * Catches regressions where a legacy module's IIFE throws at load time
 * (before any user interaction), leaving downstream HEYS namespaces
 * uninitialised. Two such bugs landed in 2026-05-20…21:
 *
 *   1. heys_legal_versions_v1.js — `HEYS.LegalVersions = Object.freeze({...})`
 *      followed by `HEYS.LegalVersions.required = [...]` → "Cannot add
 *      property required, object is not extensible" in strict mode →
 *      boot-core aborts before storage_supabase registers `cloud.signIn`
 *      → curator login showed "Облачный модуль не загружен".
 *
 *   2. heys_consents_v1.js — `HEYS.Consents.ConsentOutdatedBanner = X`
 *      executed above the `HEYS.Consents = Object.assign(...)` block →
 *      "TypeError: undefined is not an object" on every fresh load →
 *      Recovery UI for all clients.
 *
 * Both were synchronous IIFE failures that would have been caught by this
 * test in <300ms. The pattern: read each critical source file, eval it
 * with a fresh `window.HEYS = {}`, assert it does not throw and that the
 * documented exports are present.
 *
 * Add a new entry to MODULES below whenever you ship a new boot-time
 * module — paying the 30-second cost once protects every future load.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const SRC_DIR = path.resolve(__dirname, '..');

/**
 * Each entry describes one boot-time module:
 *   file         — relative path from apps/web
 *   needsReact   — true if the IIFE destructures `React.useX` at top-level
 *                  (we provide a stub so destructuring does not throw)
 *   check        — assertions on `window.HEYS` after eval succeeds
 *
 * The eval itself doubles as "does this throw?" — if the module crashes,
 * Vitest reports the failure with the original stack.
 */
const MODULES = [
    {
        file: 'heys_legal_versions_v1.js',
        check: (HEYS) => {
            expect(HEYS.LegalVersions, 'LegalVersions namespace').toBeDefined();
            // Regression guard for 2026-05-20 double-freeze: if `.required` was
            // never written (because the assignment to a frozen object threw),
            // the IIFE crashed and these would be undefined.
            expect(HEYS.LegalVersions.required, 'LegalVersions.required').toBeInstanceOf(Array);
            expect(HEYS.LegalVersions.required.length).toBeGreaterThan(0);
            expect(HEYS.LegalVersions.labels, 'LegalVersions.labels').toBeTypeOf('object');
            expect(HEYS.LegalVersions.user_agreement, 'LegalVersions.user_agreement').toBeTypeOf('string');
        },
    },
    {
        file: 'heys_consents_v1.js',
        needsReact: true,
        check: (HEYS) => {
            expect(HEYS.Consents, 'Consents namespace').toBeDefined();
            // Regression guard for 2026-05-21 init-order bug: these four
            // were assigned before `HEYS.Consents` was created, throwing a
            // TypeError that aborted the IIFE.
            expect(HEYS.Consents.ConsentOutdatedBanner, 'Consents.ConsentOutdatedBanner').toBeTypeOf('function');
            expect(HEYS.Consents.AgeGateModal, 'Consents.AgeGateModal').toBeTypeOf('function');
            expect(HEYS.Consents.ReConsentScreen, 'Consents.ReConsentScreen').toBeTypeOf('function');
            expect(HEYS.Consents.getCurrentLegalVersions, 'Consents.getCurrentLegalVersions').toBeTypeOf('function');
            // Surface API contract — without `api` the entire compliance flow
            // is dead, but `HEYS.Consents` itself could still look present.
            expect(HEYS.Consents.api, 'Consents.api').toBeTypeOf('object');
        },
    },
];

// Minimal React stub: covers the `const { useState, useEffect, ... } = React`
// destructuring that several legacy modules do at IIFE top-level. We do not
// render anything, so the stub bodies stay no-op.
function installReactStub() {
    const stub = {
        createElement: () => null,
        useState: () => [undefined, () => {}],
        useEffect: () => {},
        useCallback: (fn) => fn,
        useRef: (v) => ({ current: v }),
        useMemo: (fn) => fn(),
        Fragment: 'react.fragment',
    };
    window.React = stub;
    global.React = stub;
}

function clearReactStub() {
    delete window.React;
    delete global.React;
}

describe('boot-init smoke (IIFE must not throw, exports must exist)', () => {
    const savedHEYS = window.HEYS;

    beforeEach(() => {
        window.HEYS = {};
        global.HEYS = window.HEYS;
    });

    afterEach(() => {
        window.HEYS = savedHEYS;
        delete global.HEYS;
        clearReactStub();
    });

    for (const mod of MODULES) {
        it(`loads ${mod.file}`, () => {
            if (mod.needsReact) installReactStub();
            const src = fs.readFileSync(path.join(SRC_DIR, mod.file), 'utf8');
            // The eval is the actual regression catcher. If the IIFE throws —
            // boot-core would have aborted in production, leaving downstream
            // namespaces unregistered. Vitest surfaces the underlying error
            // with full stack via the assertion below.
            expect(() => {
                // eslint-disable-next-line no-eval
                (0, eval)(src);
            }, `${mod.file} IIFE must not throw at load time`).not.toThrow();
            mod.check(window.HEYS);
        });
    }
});
