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
const { mergeDayData, mergeChronoTombstones, mergeItemsById, mergeScalarKv } = require(mergeModulePath);

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

  test('training.updatedAt granularity — fresher training wins even when day timestamp is older', () => {
    const local = makeDay(3000, [], {
      trainings: [{ z: [0, 10, 0, 0], activityLabel: 'old day edit', updatedAt: 2500 }],
    });
    const remote = makeDay(2000, [], {
      trainings: [{ z: [0, 30, 0, 0], activityLabel: 'fresh training edit', updatedAt: 3500 }],
    });
    const merged = mergeDayData(local, remote, { forceKeepAll: true });
    expect(merged.trainings[0].activityLabel).toBe('fresh training edit');
    expect(merged.trainings[0].updatedAt).toBe(3500);
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

  test('same item uses item.updatedAt so stale grams do not overwrite fresh grams', () => {
    const remote = [{ id: 'coffee', grams: 300, updatedAt: 3000 }];
    const local = [{ id: 'coffee', grams: 50, updatedAt: 1000 }];
    const merged = mergeItemsById(remote, local, true);
    expect(merged).toEqual([{ id: 'coffee', grams: 300, updatedAt: 3000 }]);
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

// ───────────────────────────────────────────────────────────────────────────
// Cross-client merge guard (Strategy B, 2026-06-01 incident)
// Pop'овский профиль получал Алексин cycleDay/MA через mergeDayData, потому что
// remote приходил от чужого клиента. Guard блокирует merge если _writerCid
// у local и remote различаются.
// ───────────────────────────────────────────────────────────────────────────
describe('mergeDayData — cross-client guard (_writerCid)', () => {
  const CID_POP = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
  const CID_AL = '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';

  test('mismatched _writerCid → returns local untouched (rejects remote)', () => {
    const local = {
      date: '2026-05-31',
      updatedAt: 1000,
      _writerCid: CID_POP,
      weightMorning: 93.6,
      meals: [],
    };
    const remote = {
      date: '2026-05-31',
      updatedAt: 2000,
      _writerCid: CID_AL,
      weightMorning: 51.3,
      cycleDay: 3,
      meals: [makeMeal('al_breakfast', [makeItem('it1')])],
    };
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    expect(merged.weightMorning).toBe(93.6); // Pop's weight preserved
    expect(merged.cycleDay).toBeUndefined(); // Al's cycleDay rejected
    expect(merged.meals).toEqual([]); // Al's meals rejected
    expect(merged._writerCid).toBe(CID_POP);
  });

  test('matching _writerCid → normal merge proceeds', () => {
    const local = {
      date: '2026-05-31',
      updatedAt: 1000,
      _writerCid: CID_POP,
      meals: [makeMeal('breakfast', [makeItem('i1')])],
    };
    const remote = {
      date: '2026-05-31',
      updatedAt: 2000,
      _writerCid: CID_POP,
      meals: [makeMeal('breakfast', [makeItem('i1')]), makeMeal('lunch', [makeItem('i2')])],
    };
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    expect(merged.meals.length).toBe(2); // merged
  });

  test('no _writerCid on either side → backward-compat, normal merge', () => {
    const local = makeDay(1000, [makeMeal('breakfast')]);
    const remote = makeDay(2000, [makeMeal('breakfast'), makeMeal('lunch')]);
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    expect(merged.meals.length).toBe(2);
  });

  test('only one side has _writerCid → backward-compat, normal merge', () => {
    const local = { ...makeDay(1000, [makeMeal('breakfast')]), _writerCid: CID_POP };
    const remote = makeDay(2000, [makeMeal('breakfast'), makeMeal('lunch')]); // legacy row, no tag
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    expect(merged.meals.length).toBe(2);
  });
});

describe('mergeChronoTombstones', () => {
  test('unions independent deletes and keeps the freshest duplicate', () => {
    const merged = mergeChronoTombstones(
      [
        { type: 'activity', id: 'a1', deletedAt: 1000, source: 'phone' },
        { type: 'entry', id: 'e1', deletedAt: 1200 },
      ],
      [
        { type: 'activity', id: 'a1', deletedAt: 900, source: 'curator-old' },
        { type: 'activity', id: 'a2', deletedAt: 1100, source: 'curator' },
      ],
    );

    expect(merged).toEqual([
      expect.objectContaining({ type: 'entry', id: 'e1', deletedAt: 1200 }),
      expect.objectContaining({ type: 'activity', id: 'a2', deletedAt: 1100 }),
      expect.objectContaining({ type: 'activity', id: 'a1', deletedAt: 1000, source: 'phone' }),
    ]);
  });
});
