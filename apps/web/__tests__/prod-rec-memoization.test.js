/**
 * Tests for heys_find_alt_memo_v1.js — HEYS.__memoFindAlt memoization.
 *
 * Verifies that findAlternative is NOT recomputed when the product id,
 * kcal, products.length, and products.contentVersion are unchanged;
 * and IS recomputed when any of those change.
 *
 * This is the S4 safety mechanism for Phase 1.3 (plan gleaming-pondering-dewdrop.md).
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_find_alt_memo_v1.js'),
    'utf8'
);

// ─── Setup ────────────────────────────────────────────────────────────────────

function makeHEYS(flagOn = true) {
    return {
        flags: { isEnabled: (f) => f === 'boot_optimized_v1' ? flagOn : false },
        products: { contentVersion: 0 },
    };
}

function loadModule() {
    eval(SRC);
}

describe('HEYS.__memoFindAlt', () => {
    const savedHEYS = window.HEYS;

    beforeEach(() => {
        window.HEYS = makeHEYS(true);
        loadModule(); // fresh _cache per eval (new Map() inside IIFE)
    });

    afterEach(() => {
        window.HEYS.__memoFindAltClear?.();
        window.HEYS = savedHEYS;
    });

    it('is registered on HEYS after module load', () => {
        expect(typeof window.HEYS.__memoFindAlt).toBe('function');
        expect(typeof window.HEYS.__memoFindAltClear).toBe('function');
    });

    it('calls fn on first invocation', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt_1' });
        const product = { id: 'p1', kcal: 100 };
        const products = [{ id: 'p2', kcal: 200 }];

        window.HEYS.__memoFindAlt(product, products, fn);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('returns cached result on identical call (no recompute)', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt_1' });
        const product = { id: 'p1', kcal: 100 };
        const products = [{ id: 'p2', kcal: 200 }];

        const r1 = window.HEYS.__memoFindAlt(product, products, fn);
        const r2 = window.HEYS.__memoFindAlt(product, products, fn);

        expect(fn).toHaveBeenCalledOnce(); // NOT called a second time
        expect(r1).toBe(r2);
    });

    it('recomputes when product.id changes', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const products = [{ id: 'p2', kcal: 200 }];

        window.HEYS.__memoFindAlt({ id: 'p1', kcal: 100 }, products, fn);
        window.HEYS.__memoFindAlt({ id: 'p99', kcal: 100 }, products, fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('recomputes when product.kcal changes', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const products = [{ id: 'p2', kcal: 200 }];

        window.HEYS.__memoFindAlt({ id: 'p1', kcal: 100 }, products, fn);
        window.HEYS.__memoFindAlt({ id: 'p1', kcal: 150 }, products, fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('recomputes when products.length changes', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const product = { id: 'p1', kcal: 100 };

        window.HEYS.__memoFindAlt(product, [{ id: 'p2' }], fn);
        window.HEYS.__memoFindAlt(product, [{ id: 'p2' }, { id: 'p3' }], fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('recomputes when products.contentVersion bumps (S4)', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const product = { id: 'p1', kcal: 100 };
        const products = [{ id: 'p2' }];

        window.HEYS.products.contentVersion = 0;
        window.HEYS.__memoFindAlt(product, products, fn);

        window.HEYS.products.contentVersion = 1; // simulate heys:products-updated bump
        window.HEYS.__memoFindAlt(product, products, fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does NOT recompute when products array reference changes but content is same', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const product = { id: 'p1', kcal: 100 };

        window.HEYS.products.contentVersion = 0;
        // Same length and same version — different reference is intentional (memoKey uses length, not ref)
        window.HEYS.__memoFindAlt(product, [{ id: 'p2' }], fn);
        window.HEYS.__memoFindAlt(product, [{ id: 'p2' }], fn); // same length, same version

        expect(fn).toHaveBeenCalledOnce();
    });

    it('__memoFindAltClear empties the cache — forces recompute', () => {
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const product = { id: 'p1', kcal: 100 };
        const products = [{ id: 'p2' }];

        window.HEYS.__memoFindAlt(product, products, fn);
        window.HEYS.__memoFindAltClear();
        window.HEYS.__memoFindAlt(product, products, fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('returns undefined for null product without calling fn', () => {
        const fn = vi.fn();
        const result = window.HEYS.__memoFindAlt(null, [], fn);
        expect(result).toBeUndefined();
        expect(fn).not.toHaveBeenCalled();
    });

    it('bypasses cache and calls fn directly when flag is off', () => {
        window.HEYS.flags = { isEnabled: () => false }; // boot_optimized_v1 off
        const fn = vi.fn().mockReturnValue({ id: 'alt' });
        const product = { id: 'p1', kcal: 100 };
        const products = [{ id: 'p2' }];

        window.HEYS.__memoFindAlt(product, products, fn);
        window.HEYS.__memoFindAlt(product, products, fn); // same call — should NOT be cached

        expect(fn).toHaveBeenCalledTimes(2);
    });
});

describe('heys_find_alt_memo_v1.js — static source checks', () => {
    it('cache key includes id, kcal, length, contentVersion', () => {
        expect(SRC).toContain('product.id');
        expect(SRC).toContain('product.kcal');
        expect(SRC).toContain('products.length');
        expect(SRC).toContain('contentVersion');
    });

    it('FIFO eviction cap is defined', () => {
        expect(SRC).toContain('MAX_ENTRIES');
    });

    it('flag guard is present', () => {
        expect(SRC).toContain("isEnabled('boot_optimized_v1')");
    });
});
