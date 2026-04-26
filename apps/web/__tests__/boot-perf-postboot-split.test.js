/**
 * Tests for the 3 postboot eager-stub façades (Phase 2 bundle split).
 *
 * Verifies per-façade contract:
 *  - exposes HEYS.__loadPostbootN after eval
 *  - fetches /lazy-manifest.json on first call
 *  - coalesces concurrent calls (single fetch)
 *  - dispatches heys:postboot-lazy-ready on success
 *  - dispatches heys:lazy-chunk-failed + resets promise on script error
 *  - dispatches heys:lazy-chunk-failed when API assertion fails after chunk load
 *  - resets _lazyPromise after failure so next call retries
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SRC = {
    game:    fs.readFileSync(path.resolve(__dirname, '../heys_game_facade_v1.js'),       'utf8'),
    insights: fs.readFileSync(path.resolve(__dirname, '../insights/pi_facade.js'),       'utf8'),
    ui:       fs.readFileSync(path.resolve(__dirname, '../heys_postboot3_facade_v1.js'), 'utf8'),
};

const MANIFEST = {
    'postboot-1-game-lazy':     { file: 'postboot-1-game-lazy.bundle.test000000aa.js'     },
    'postboot-2-insights-lazy': { file: 'postboot-2-insights-lazy.bundle.test000000bb.js' },
    'postboot-3-ui-lazy':       { file: 'postboot-3-ui-lazy.bundle.test000000cc.js'       },
};

// ─── Shared test harness ──────────────────────────────────────────────────────

function createHarness() {
    const scriptElements = [];
    const events         = [];

    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
        if (tag !== 'script') return origCreate(tag);
        const el = { src: '', onload: null, onerror: null };
        scriptElements.push(el);
        return el;
    });
    vi.spyOn(document.head, 'appendChild').mockReturnValue(undefined);
    vi.spyOn(window, 'dispatchEvent').mockImplementation((e) => { events.push(e); });

    window.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MANIFEST),
    });

    return {
        scriptElements,
        events,
        lastScript() { return scriptElements[scriptElements.length - 1]; },
        eventsOfType(type) { return events.filter(e => e.type === type); },
    };
}

// Flush 3 microtask ticks to drain: fetch → json → manifest .then → script injected
async function flushFetch() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

// ─── game facade ─────────────────────────────────────────────────────────────

describe('postboot-1-game façade (heys_game_facade_v1.js)', () => {
    let h;
    const savedHEYS = window.HEYS;
    const savedRIC  = window.requestIdleCallback;

    beforeEach(() => {
        window.HEYS = {};
        window.requestIdleCallback = vi.fn();
        h = createHarness();
        eval(SRC.game);
    });

    afterEach(() => {
        window.HEYS = savedHEYS;
        window.requestIdleCallback = savedRIC;
        vi.restoreAllMocks();
    });

    it('exposes HEYS.__loadPostboot1Game', () => {
        expect(typeof window.HEYS.__loadPostboot1Game).toBe('function');
    });

    it('does NOT set HEYS.game placeholder (keeps if-guard falsy)', () => {
        expect(window.HEYS.game).toBeUndefined();
    });

    it('uses requestIdleCallback on load', () => {
        expect(window.requestIdleCallback).toHaveBeenCalledOnce();
    });

    it('fetches /lazy-manifest.json and injects script on trigger', async () => {
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();

        expect(window.fetch).toHaveBeenCalledWith('/lazy-manifest.json');
        const script = h.lastScript();
        expect(script).toBeDefined();
        expect(script.src).toContain('postboot-1-game-lazy');

        window.HEYS.game = { addXP: vi.fn() };
        script.onload();
        await p;
    });

    it('coalesces concurrent calls — manifest fetched only once', async () => {
        window.HEYS.game = { addXP: vi.fn() };
        const p1 = window.HEYS.__loadPostboot1Game();
        const p2 = window.HEYS.__loadPostboot1Game();
        expect(p1).toBe(p2);

        await flushFetch();
        h.lastScript().onload();
        await Promise.all([p1, p2]);

        expect(window.fetch).toHaveBeenCalledOnce();
    });

    it('dispatches heys:postboot-lazy-ready on success', async () => {
        window.HEYS.game = { addXP: vi.fn() };
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        h.lastScript().onload();
        await p;

        const ready = h.eventsOfType('heys:postboot-lazy-ready');
        expect(ready).toHaveLength(1);
        expect(ready[0].detail.bundle).toBe('postboot-1-game');
    });

    it('dispatches heys:lazy-chunk-failed on script onerror', async () => {
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        h.lastScript().onerror();
        await p; // catch swallows rejection → resolves undefined

        const failed = h.eventsOfType('heys:lazy-chunk-failed');
        expect(failed).toHaveLength(1);
        expect(failed[0].detail.bundle).toBe('postboot-1-game');
    });

    it('resets _lazyPromise after failure so retry is possible', async () => {
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        h.lastScript().onerror();
        await p;

        window.fetch.mockClear();
        window.HEYS.__loadPostboot1Game();
        await Promise.resolve();
        expect(window.fetch).toHaveBeenCalledOnce();
    });

    it('dispatches heys:lazy-chunk-failed when HEYS.game not registered after load', async () => {
        // chunk loads but doesn't register HEYS.game
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        h.lastScript().onload();
        await p;

        const failed = h.eventsOfType('heys:lazy-chunk-failed');
        expect(failed).toHaveLength(1);
    });
});

// ─── insights facade ──────────────────────────────────────────────────────────

describe('postboot-2-insights façade (insights/pi_facade.js)', () => {
    let h;
    const savedHEYS = window.HEYS;
    const savedRIC  = window.requestIdleCallback;

    beforeEach(() => {
        window.HEYS = {};
        window.requestIdleCallback = vi.fn();
        h = createHarness();
        eval(SRC.insights);
    });

    afterEach(() => {
        window.HEYS = savedHEYS;
        window.requestIdleCallback = savedRIC;
        vi.restoreAllMocks();
    });

    it('exposes HEYS.__loadPostboot2Insights', () => {
        expect(typeof window.HEYS.__loadPostboot2Insights).toBe('function');
    });

    it('pre-registers HEYS.InsightsPI placeholder object', () => {
        expect(window.HEYS.InsightsPI).toBeDefined();
        expect(typeof window.HEYS.InsightsPI).toBe('object');
    });

    it('fetches manifest and injects correct script', async () => {
        const p = window.HEYS.__loadPostboot2Insights();
        await flushFetch();

        const script = h.lastScript();
        expect(script.src).toContain('postboot-2-insights-lazy');

        window.HEYS.InsightsPI = { earlyWarning: { detect: vi.fn() } };
        script.onload();
        await p;
    });

    it('coalesces concurrent calls', async () => {
        window.HEYS.InsightsPI = { earlyWarning: { detect: vi.fn() } };
        const p1 = window.HEYS.__loadPostboot2Insights();
        const p2 = window.HEYS.__loadPostboot2Insights();
        expect(p1).toBe(p2);

        await flushFetch();
        h.lastScript().onload();
        await Promise.all([p1, p2]);
        expect(window.fetch).toHaveBeenCalledOnce();
    });

    it('dispatches heys:postboot-lazy-ready on success', async () => {
        window.HEYS.InsightsPI = { earlyWarning: { detect: vi.fn() } };
        const p = window.HEYS.__loadPostboot2Insights();
        await flushFetch();
        h.lastScript().onload();
        await p;

        const ready = h.eventsOfType('heys:postboot-lazy-ready');
        expect(ready).toHaveLength(1);
        expect(ready[0].detail.bundle).toBe('postboot-2-insights');
    });

    it('dispatches heys:lazy-chunk-failed when earlyWarning not registered', async () => {
        const p = window.HEYS.__loadPostboot2Insights();
        await flushFetch();
        h.lastScript().onload(); // chunk loaded but earlyWarning missing
        await p;

        const failed = h.eventsOfType('heys:lazy-chunk-failed');
        expect(failed).toHaveLength(1);
    });

    it('dispatches heys:lazy-chunk-failed and resets on onerror', async () => {
        const p = window.HEYS.__loadPostboot2Insights();
        await flushFetch();
        h.lastScript().onerror();
        await p;

        expect(h.eventsOfType('heys:lazy-chunk-failed')).toHaveLength(1);
        window.fetch.mockClear();
        window.HEYS.__loadPostboot2Insights();
        await Promise.resolve();
        expect(window.fetch).toHaveBeenCalledOnce();
    });
});

// ─── postboot-3-ui facade ─────────────────────────────────────────────────────

describe('postboot-3-ui façade (heys_postboot3_facade_v1.js)', () => {
    let h;
    const savedHEYS = window.HEYS;
    const savedRIC  = window.requestIdleCallback;

    beforeEach(() => {
        window.HEYS = {};
        window.requestIdleCallback = vi.fn();
        h = createHarness();
        eval(SRC.ui);
    });

    afterEach(() => {
        window.HEYS = savedHEYS;
        window.requestIdleCallback = savedRIC;
        vi.restoreAllMocks();
    });

    it('exposes HEYS.__loadPostboot3Ui', () => {
        expect(typeof window.HEYS.__loadPostboot3Ui).toBe('function');
    });

    it('fetches manifest and injects postboot-3-ui-lazy script', async () => {
        const p = window.HEYS.__loadPostboot3Ui();
        await flushFetch();

        const script = h.lastScript();
        expect(script.src).toContain('postboot-3-ui-lazy');

        window.HEYS.PredictiveInsights = {};
        script.onload();
        await p;
    });

    it('coalesces concurrent calls', async () => {
        window.HEYS.PredictiveInsights = {};
        const p1 = window.HEYS.__loadPostboot3Ui();
        const p2 = window.HEYS.__loadPostboot3Ui();
        expect(p1).toBe(p2);

        await flushFetch();
        h.lastScript().onload();
        await Promise.all([p1, p2]);
        expect(window.fetch).toHaveBeenCalledOnce();
    });

    it('dispatches heys:postboot-lazy-ready on success', async () => {
        window.HEYS.PredictiveInsights = {};
        const p = window.HEYS.__loadPostboot3Ui();
        await flushFetch();
        h.lastScript().onload();
        await p;

        const ready = h.eventsOfType('heys:postboot-lazy-ready');
        expect(ready).toHaveLength(1);
        expect(ready[0].detail.bundle).toBe('postboot-3-ui');
    });

    it('dispatches heys:lazy-chunk-failed when PredictiveInsights not registered', async () => {
        const p = window.HEYS.__loadPostboot3Ui();
        await flushFetch();
        h.lastScript().onload();
        await p;

        expect(h.eventsOfType('heys:lazy-chunk-failed')).toHaveLength(1);
    });

    it('resets _lazyPromise and allows retry after failure', async () => {
        const p = window.HEYS.__loadPostboot3Ui();
        await flushFetch();
        h.lastScript().onerror();
        await p;

        window.fetch.mockClear();
        window.HEYS.__loadPostboot3Ui();
        await Promise.resolve();
        expect(window.fetch).toHaveBeenCalledOnce();
    });
});

// ─── lazy-manifest URL injection (cross-deploy safety S1) ────────────────────

describe('S1 — manifest-driven URL injection', () => {
    const savedHEYS = window.HEYS;
    const savedRIC  = window.requestIdleCallback;
    let h;

    beforeEach(() => {
        window.HEYS = {};
        window.requestIdleCallback = vi.fn();
        h = createHarness();
        eval(SRC.game);
    });

    afterEach(() => {
        window.HEYS = savedHEYS;
        window.requestIdleCallback = savedRIC;
        vi.restoreAllMocks();
    });

    it('uses file from lazy-manifest.json, not a hardcoded URL', async () => {
        const customManifest = {
            'postboot-1-game-lazy': { file: 'postboot-1-game-lazy.bundle.deadbeef0001.js' },
        };
        window.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve(customManifest),
        });

        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();

        expect(h.lastScript().src).toBe('/postboot-1-game-lazy.bundle.deadbeef0001.js');

        window.HEYS.game = { addXP: vi.fn() };
        h.lastScript().onload();
        await p;
    });

    it('dispatches heys:lazy-chunk-failed when manifest fetch fails (ok=false)', async () => {
        window.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 });
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        await p;

        expect(h.eventsOfType('heys:lazy-chunk-failed')).toHaveLength(1);
    });

    it('dispatches heys:lazy-chunk-failed when bundle key missing from manifest', async () => {
        window.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({}), // empty manifest
        });
        const p = window.HEYS.__loadPostboot1Game();
        await flushFetch();
        await p;

        expect(h.eventsOfType('heys:lazy-chunk-failed')).toHaveLength(1);
    });
});
