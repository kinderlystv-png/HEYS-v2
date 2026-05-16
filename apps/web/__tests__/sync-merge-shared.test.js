/**
 * Tests for heys_sync_merge_v1.js — shared merge module used by:
 *  - Browser (legacy bundle: window.HEYS.sync.*)
 *  - Cloud Function heys-api-rpc (Node: require('./lib/heys_sync_merge_v1.cjs'))
 *
 * Validates:
 *  - mergeDayData on real concurrent-edit scenarios (different meals, same meal)
 *  - mergeScalarKv for heys_norms / heys_profile shape
 *  - meal.updatedAt granularity (Phase 2)
 *  - forceKeepAll mode used by server-side merge (preserves both sides when client may be stale)
 */
import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web is "type":"module", so .js can't be CommonJS-required.
// We load the .cjs copy that Cloud Function uses — guarantees same code path.
const require = createRequire(import.meta.url);
const mergeModulePath = path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
const { mergeDayData, mergeItemsById, mergeScalarKv } = require(mergeModulePath);

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
const makeMeal = (id, items = [], extra = {}) => ({ id, name: id, items, ...extra });
const makeItem = (id, grams = 100) => ({ id, grams, productId: 'p_' + id });
const makeDay = (updatedAt, meals = [], extra = {}) => ({
  date: '2026-05-17',
  updatedAt,
  meals,
  trainings: [],
  ...extra,
});

// ───────────────────────────────────────────────────────────────────────────
// mergeDayData — core concurrent-edit scenarios
// ───────────────────────────────────────────────────────────────────────────
describe('mergeDayData — lost-update prevention', () => {
  test('null inputs return null', () => {
    expect(mergeDayData(null, null)).toBe(null);
    expect(mergeDayData(null, makeDay(1000))).toBe(null);
    expect(mergeDayData(makeDay(1000), null)).toBe(null);
  });

  test('identical content returns null (no-op merge)', () => {
    const a = makeDay(1000, [makeMeal('breakfast', [makeItem('i1')])]);
    const b = makeDay(2000, [makeMeal('breakfast', [makeItem('i1')])]); // diff updatedAt, same content
    expect(mergeDayData(a, b)).toBe(null);
  });

  test('concurrent edit of DIFFERENT meals — both survive (the original Александра bug)', () => {
    // Client added meal "lunch" with item locally
    const local = makeDay(2000, [
      makeMeal('breakfast'),
      makeMeal('lunch', [makeItem('i_lunch1')]),
    ]);
    // Curator added meal "dinner" with item in cloud (last seen at updatedAt=1500)
    const remote = makeDay(1500, [
      makeMeal('breakfast'),
      makeMeal('dinner', [makeItem('i_dinner1')]),
    ]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged).not.toBe(null);
    const ids = merged.meals.map(m => m.id).sort();
    expect(ids).toEqual(['breakfast', 'dinner', 'lunch']);
    // Item counts preserved
    expect(merged.meals.find(m => m.id === 'lunch').items).toHaveLength(1);
    expect(merged.meals.find(m => m.id === 'dinner').items).toHaveLength(1);
  });

  test('concurrent edit of SAME meal — items merged by id', () => {
    // Both sides edited "lunch" — local added itemA, remote added itemB
    const local = makeDay(2000, [
      makeMeal('lunch', [makeItem('shared1'), makeItem('localOnly')]),
    ]);
    const remote = makeDay(1500, [
      makeMeal('lunch', [makeItem('shared1'), makeItem('remoteOnly')]),
    ]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged.meals).toHaveLength(1);
    const lunch = merged.meals[0];
    const itemIds = lunch.items.map(i => i.id).sort();
    expect(itemIds).toEqual(['localOnly', 'remoteOnly', 'shared1']);
  });

  test('meal.updatedAt granularity — fresher meal-level edit wins on conflicting same-meal field', () => {
    // Both edited meal "lunch" but at different times
    const local = makeDay(2000, [
      { id: 'lunch', name: 'Lunch (renamed by client)', updatedAt: 1800, items: [makeItem('shared')] },
    ]);
    const remote = makeDay(1500, [
      { id: 'lunch', name: 'Lunch (renamed by curator later)', updatedAt: 1900, items: [makeItem('shared')] },
    ]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    const lunch = merged.meals[0];
    // Remote meal.updatedAt (1900) > local meal.updatedAt (1800) → remote name wins
    expect(lunch.name).toBe('Lunch (renamed by curator later)');
  });

  test('missing meal.updatedAt — falls back to day.updatedAt', () => {
    // Legacy data: meals without updatedAt field
    const local = makeDay(2000, [
      { id: 'lunch', name: 'Local lunch', items: [makeItem('shared')] }, // no updatedAt
    ]);
    const remote = makeDay(1500, [
      { id: 'lunch', name: 'Remote lunch', items: [makeItem('shared')] }, // no updatedAt
    ]);

    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    const lunch = merged.meals[0];
    // local.day.updatedAt (2000) > remote.day.updatedAt (1500) → local name wins
    expect(lunch.name).toBe('Local lunch');
  });

  test('scalar fields — steps takes max', () => {
    const local = makeDay(2000, [], { steps: 5000 });
    const remote = makeDay(1500, [], { steps: 8000 }); // older but higher count
    const merged = mergeDayData(local, remote);
    expect(merged.steps).toBe(8000);
  });

  test('scalar fields — waterMl takes max', () => {
    const local = makeDay(2000, [], { waterMl: 500 });
    const remote = makeDay(1500, [], { waterMl: 1200 });
    const merged = mergeDayData(local, remote);
    expect(merged.waterMl).toBe(1200);
  });

  test('deletion detection — local newer & meal absent → treated as deleted (default mode)', () => {
    const local = makeDay(2000, []); // no meals, fresher
    const remote = makeDay(1500, [makeMeal('breakfast')]);
    const merged = mergeDayData(local, remote);
    // Default mode (no forceKeepAll): breakfast is treated as deleted
    expect(merged.meals).toHaveLength(0);
  });

  test('forceKeepAll mode — server-side merge keeps both sides (conservative)', () => {
    // Server-side: client may not have seen latest cloud meals. Don't treat absence as delete.
    const local = makeDay(2000, []); // empty meals, fresher
    const remote = makeDay(1500, [makeMeal('breakfast')]); // has meal
    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged.meals).toHaveLength(1);
    expect(merged.meals[0].id).toBe('breakfast');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// mergeItemsById — item-level merge inside meal
// ───────────────────────────────────────────────────────────────────────────
describe('mergeItemsById', () => {
  test('preferLocal=true merges both sides, local overwrites remote', () => {
    const remote = [{ id: 'a', grams: 100 }, { id: 'b', grams: 200 }];
    const local = [{ id: 'b', grams: 250 }, { id: 'c', grams: 300 }];
    const merged = mergeItemsById(remote, local, true);
    const byId = Object.fromEntries(merged.map(i => [i.id, i.grams]));
    expect(byId).toEqual({ a: 100, b: 250, c: 300 });
  });

  test('preferLocal=false returns only remote items (pull-refresh mode)', () => {
    const remote = [{ id: 'a' }, { id: 'b' }];
    const local = [{ id: 'b' }, { id: 'c' }];
    const merged = mergeItemsById(remote, local, false);
    expect(merged.map(i => i.id).sort()).toEqual(['a', 'b']);
  });

  test('drops items without id', () => {
    const remote = [{ id: 'a' }, { /* no id */ grams: 100 }];
    const local = [{ id: 'b' }];
    const merged = mergeItemsById(remote, local, true);
    expect(merged.map(i => i.id).sort()).toEqual(['a', 'b']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// mergeScalarKv — heys_norms / heys_profile merge
// ───────────────────────────────────────────────────────────────────────────
describe('mergeScalarKv', () => {
  test('null current → return incoming', () => {
    const incoming = { kcal: 2000, updatedAt: 1000 };
    expect(mergeScalarKv(incoming, null)).toBe(incoming);
  });

  test('null incoming → return current', () => {
    const current = { kcal: 2000, updatedAt: 1000 };
    expect(mergeScalarKv(null, current)).toBe(current);
  });

  test('newer incoming fields overlay older current', () => {
    const incoming = { kcal: 2500, prot: 120, updatedAt: 2000 };
    const current = { kcal: 2000, prot: 100, fat: 80, updatedAt: 1000 };
    const merged = mergeScalarKv(incoming, current);
    expect(merged.kcal).toBe(2500);
    expect(merged.prot).toBe(120);
    expect(merged.fat).toBe(80); // preserved from current (older side)
  });

  test('older incoming overlayed by newer current', () => {
    const incoming = { kcal: 2000, updatedAt: 500 };
    const current = { kcal: 2500, prot: 120, updatedAt: 2000 };
    const merged = mergeScalarKv(incoming, current);
    expect(merged.kcal).toBe(2500);
    expect(merged.prot).toBe(120);
  });

  test('nested objects shallow-merged', () => {
    const incoming = { settings: { dark: true, lang: 'ru' }, updatedAt: 2000 };
    const current = { settings: { dark: false, soundEnabled: true }, updatedAt: 1000 };
    const merged = mergeScalarKv(incoming, current);
    expect(merged.settings.dark).toBe(true); // from incoming (newer)
    expect(merged.settings.lang).toBe('ru'); // from incoming
    expect(merged.settings.soundEnabled).toBe(true); // from current
  });

  test('arrays atomically replaced by fresher side', () => {
    const incoming = { tags: ['a', 'b'], updatedAt: 2000 };
    const current = { tags: ['x', 'y', 'z'], updatedAt: 1000 };
    const merged = mergeScalarKv(incoming, current);
    expect(merged.tags).toEqual(['a', 'b']);
  });

  test('updatedAt becomes max + bumped to now', () => {
    const incoming = { kcal: 2000, updatedAt: 1000 };
    const current = { kcal: 2500, updatedAt: 2000 };
    const merged = mergeScalarKv(incoming, current);
    // Either the max of both, or higher (Date.now())
    expect(merged.updatedAt).toBeGreaterThanOrEqual(2000);
  });

  test('missing updatedAt treated as 0 (other side wins)', () => {
    const incoming = { kcal: 2500 }; // no updatedAt
    const current = { kcal: 2000, updatedAt: 1000 };
    const merged = mergeScalarKv(incoming, current);
    // current.updatedAt (1000) > 0, so current is the fresher side for scalar selection
    expect(merged.kcal).toBe(2000);
  });
});
