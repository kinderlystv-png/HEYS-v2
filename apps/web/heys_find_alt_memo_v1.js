// heys_find_alt_memo_v1.js — memoization for HEYS.prodRec.findAlternative
//
// Boot-perf optimization (plan gleaming-pondering-dewdrop.md, Phase 1.3).
//
// findAlternative is called inline inside .map() callbacks at 4 sites
// (heys_day_meals_bundle_v1.js:4049, heys_day_bundle_v1.js:7112,
//  heys_day_meal_card.js:827, day/_meals.js:1246). React hooks can't be
// used in loops, so we cache results in a module-level LRU keyed by
// product id + kcal + products.length + HEYS.products.contentVersion.
//
// Cache invalidation:
//   - HEYS.products.contentVersion is bumped by applyForegroundHotSyncValue
//     and the overlay BroadcastChannel listener (S4 in plan). Any product
//     mutation that affects scoring ends up bumping this counter.
//   - Cap of 500 entries with FIFO eviction prevents unbounded growth.
//
// Gated behind boot_optimized_v1; fallback returns the raw function call
// so flag toggle reverts behavior cleanly.

(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const _cache = new Map();
  const MAX_ENTRIES = 500;

  HEYS.__memoFindAlt = function (product, products, fn) {
    if (!product || typeof fn !== 'function') return undefined;
    const flagOn = HEYS.flags && HEYS.flags.isEnabled && HEYS.flags.isEnabled('boot_optimized_v1');
    if (!flagOn) return fn(product, products);

    const ver = (HEYS.products && HEYS.products.contentVersion) || 0;
    const len = Array.isArray(products) ? products.length : 0;
    const key = String(product.id) + '|' + Math.round(product.kcal || 0) + '|' + len + '|' + ver;

    if (_cache.has(key)) return _cache.get(key);

    const result = fn(product, products);
    _cache.set(key, result);
    if (_cache.size > MAX_ENTRIES) {
      const firstKey = _cache.keys().next().value;
      _cache.delete(firstKey);
    }
    return result;
  };

  HEYS.__memoFindAltClear = function () { _cache.clear(); };
})(typeof window !== 'undefined' ? window : globalThis);
