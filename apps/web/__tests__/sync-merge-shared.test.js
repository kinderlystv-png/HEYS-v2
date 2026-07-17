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
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web is "type":"module", so .js can't be CommonJS-required.
// We load the .cjs copy that Cloud Function uses — guarantees same code path.
const require = createRequire(import.meta.url);
const mergeModulePath = path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
const {
  mergeDayData,
  hasSubjectiveFieldDrop,
  mergeChronoTombstones,
  mergeItemsById,
  mergeScalarKv,
  mergeMorningCheckinProgress,
  hasMorningCheckinProgressConflict,
  stampDayv2ChangedEntities,
  resolveDayMutationTs,
  ownerClientIdFromDayKey,
  gateCycleDayForOwner,
} = require(mergeModulePath);

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

  test('server-side subjective guard detects stale day losing check-in fields', () => {
    const incoming = makeDay(3000, [makeMeal('snack', [makeItem('coffee')])]);
    const current = makeDay(2000, [], {
      sleepHours: 8.2,
      moodMorning: 7,
      wellbeingMorning: 8,
      stressMorning: 3,
      morningActivation: { status: 'done', decidedAt: 2000 },
    });

    expect(hasSubjectiveFieldDrop(incoming, current)).toBe(true);
    expect(hasSubjectiveFieldDrop({ ...incoming, moodMorning: 7 }, current)).toBe(true);
    expect(hasSubjectiveFieldDrop({
      ...incoming,
      sleepHours: 8.2,
      moodMorning: 7,
      wellbeingMorning: 8,
      stressMorning: 3,
      morningActivation: current.morningActivation,
    }, current)).toBe(false);
  });

  test('server-side merge fills missing check-in fields from current cloud day', () => {
    const incoming = makeDay(3000, [makeMeal('snack', [makeItem('coffee')])]);
    const current = makeDay(2000, [makeMeal('breakfast', [makeItem('eggs')])], {
      sleepStart: '01:00',
      sleepEnd: '09:10',
      sleepHours: 8.2,
      sleepQuality: 7,
      moodMorning: 7,
      wellbeingMorning: 8,
      stressMorning: 3,
      morningActivation: { status: 'done', decidedAt: 2000, intensity: 5 },
    });

    const merged = mergeDayData(incoming, current, { forceKeepAll: true });

    expect(merged.sleepHours).toBe(8.2);
    expect(merged.moodMorning).toBe(7);
    expect(merged.wellbeingMorning).toBe(8);
    expect(merged.stressMorning).toBe(3);
    expect(merged.morningActivation).toEqual(current.morningActivation);
    expect(merged.meals.map((m) => m.id).sort()).toEqual(['breakfast', 'snack']);
  });

  test('morningActivation terminal merge uses later decidedAt when both sides are terminal', () => {
    const incoming = makeDay(4000, [], {
      morningActivation: { status: 'done', decidedAt: 2000, intensity: 3 },
    });
    const current = makeDay(3000, [], {
      morningActivation: { status: 'done', decidedAt: 3500, intensity: 5 },
    });

    const merged = mergeDayData(incoming, current, { forceKeepAll: true });

    expect(merged.morningActivation).toEqual(current.morningActivation);
  });
});

describe('heys-api-rpc batch dayv2 guard contract', () => {
  test('batch paths merge existing dayv2 rows before plain SQL upsert', () => {
    const rpcSource = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'),
      'utf8',
    );

    expect(rpcSource).toContain('function mergeBatchDayv2ExistingRows(items, currentByKey)');
    expect(rpcSource).toContain('const dayv2Merged = mergeBatchDayv2ExistingRows(params.p_items, prevMap);');
    expect(rpcSource).toContain('[batch_upsert_client_kv_by_session] dayv2_guard_merged:');
    expect(rpcSource).toContain('[batch_upsert_client_kv_by_curator] dayv2_guard_merged:');
    expect(rpcSource).toContain('const merged = mergeDayData(it.v, currentValue, { forceKeepAll: true });');
    expect(rpcSource).not.toContain('if (!hasSubjectiveFieldDrop(it.v, currentValue)) continue;');
    expect(rpcSource).toContain("const hasDayv2BatchKey = keysList.some((key) => /^heys_(?:[0-9a-f-]{36}_)?dayv2_\\d{4}-\\d{2}-\\d{2}$/i.test(key));");
    expect(rpcSource).toContain("'SELECT k, v, updated_at FROM client_kv_store WHERE client_id = $1::uuid AND k = ANY($2::text[])' + ((hasDayv2BatchKey || hasCriticalBatchKey) ? ' FOR UPDATE' : '')");
    expect(rpcSource).toMatch(/mergeBatchDayv2ExistingRows\([\s\S]*?\)\s*;\s+if \(dayv2Merged > 0\)[\s\S]*?SELECT \* FROM batch_upsert_client_kv_by_curator/);
  });

  test('single session dayv2 upsert is merged before generic SQL dispatch', () => {
    const rpcSource = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'),
      'utf8',
    );

    expect(rpcSource).toContain('[upsert_client_kv_by_session] dayv2_guard_merged:');
    expect(rpcSource).toContain('direct upsert_client_kv_by_session(dayv2) bypasses');
    expect(rpcSource).toContain('params.p_value = merged;');
    expect(rpcSource).toContain("console.warn('[upsert_client_kv_by_session] dayv2_guard_merged:', params.p_key);");
    expect(rpcSource).toMatch(/const prevMap = await prefetchGuardedCurrentValues\([\s\S]*?hasDayv2BatchKey \|\| hasCriticalBatchKey[\s\S]*?\);/);
    expect(rpcSource).toContain("await client.query('COMMIT');");
    expect(rpcSource.indexOf('direct upsert_client_kv_by_session(dayv2) bypasses')).toBeLessThan(
      rpcSource.indexOf('const TYPE_HINTS'),
    );
  });

  test('REST client_kv_store dayv2 writes merge existing cloud row before safe upsert', () => {
    const restSource = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rest/index.js'),
      'utf8',
    );

    expect(restSource).toContain("const { mergeDayData } = require('./lib/heys_sync_merge_v1.cjs');");
    expect(restSource).toContain("[REST POST client_kv_store] dayv2_guard_merged:");
    expect(restSource).toContain('SELECT v FROM client_kv_store WHERE client_id = $1::uuid AND k = $2::text FOR UPDATE');
    expect(restSource).toContain('const merged = mergeDayData(row.v, currentValue, { forceKeepAll: true });');
    expect(restSource).toContain("blockedItems.push({ k: row.k, reason: 'dayv2_merge_failed' });");
    expect(restSource.indexOf('[REST POST client_kv_store] dayv2_guard_merged:')).toBeLessThan(
      restSource.indexOf('SELECT safe_upsert_client_kv'),
    );
  });

  test('RPC routes morning check-in progress through step-level merge before generic LWW', () => {
    const rpcSource = fs.readFileSync(
      path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/index.js'),
      'utf8',
    );

    expect(rpcSource).toContain('MORNING_CHECKIN_PROGRESS_KEY_RE.test(k)');
    expect(rpcSource).toContain('hasMorningCheckinProgressConflict(incomingValue, currentValue)');
    expect(rpcSource).toContain('mergeMorningCheckinProgress(incomingValue, currentValue)');
    expect(rpcSource).toContain("'morning_checkin_progress_conflict_merged'");
    expect(rpcSource).not.toContain("|| mergeOutcome === 'morning_checkin_progress_merged'");
    expect(rpcSource.indexOf('MORNING_CHECKIN_PROGRESS_KEY_RE.test(k)')).toBeLessThan(
      rpcSource.indexOf("} else if (noConflict) {"),
    );
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
// mergeDayData — stale-remote must NOT drop a freshly-added local item.
// Regression for incident 2026-06-06: a stale day re-save (one of ~22 dayv2
// re-saves/30s) carried a NEWER meal/day updatedAt but FEWER items. The old
// code inferred deletion from the newer-remote timestamp and silently dropped
// the user's just-added item (lost-add). Deletion must come from an explicit
// tombstone, never from absence.
// ───────────────────────────────────────────────────────────────────────────
describe('mergeDayData — stale-remote does not drop freshly-added local item (incident 2026-06-06)', () => {
  // Local: user just added 'syrup' → 3 items, older day ts.
  const dayWithSyrup = () => makeDay(208361, [
    makeMeal('snack', [
      { id: 'milk', grams: 185, updatedAt: 208000 },
      { id: 'coffee', grams: 100, updatedAt: 208100 },
      { id: 'syrup', grams: 20, updatedAt: 208361 }, // just added, local-only
    ], { updatedAt: 208361 }),
  ]);
  // Remote: stale snapshot of the SAME meal — 'syrup' missing, but re-stamped fresher.
  const staleNoSyrup = (extra) => makeDay(223971, [
    makeMeal('snack', [
      { id: 'milk', grams: 185, updatedAt: 208000 },
      { id: 'coffee', grams: 100, updatedAt: 208100 },
    ], { updatedAt: 223971 }),
  ], extra);

  test('background merge: local-only item survives a newer-ts stale remote meal', () => {
    const merged = mergeDayData(dayWithSyrup(), staleNoSyrup());
    expect(merged).not.toBe(null);
    const snack = merged.meals.find((m) => m.id === 'snack');
    expect(snack.items.map((i) => i.id).sort()).toEqual(['coffee', 'milk', 'syrup']);
  });

  test('server upload merge (forceKeepAll) also keeps the local-only item', () => {
    const merged = mergeDayData(dayWithSyrup(), staleNoSyrup(), { forceKeepAll: true });
    const snack = merged.meals.find((m) => m.id === 'snack');
    expect(snack.items.map((i) => i.id).sort()).toEqual(['coffee', 'milk', 'syrup']);
  });

  test('explicit pull-to-refresh (preferRemote) still honors remote membership', () => {
    const merged = mergeDayData(dayWithSyrup(), staleNoSyrup(), { preferRemote: true });
    const snack = merged.meals.find((m) => m.id === 'snack');
    expect(snack.items.map((i) => i.id).sort()).toEqual(['coffee', 'milk']);
  });

  test('union does NOT resurrect a tombstoned deletion (deletion via tombstone still wins)', () => {
    // 'syrup' deleted on the other device WITH a tombstone fresher than the local edit.
    const merged = mergeDayData(dayWithSyrup(), staleNoSyrup({ deletedItemIds: { syrup: 224000 } }));
    const snack = merged.meals.find((m) => m.id === 'snack');
    expect(snack.items.map((i) => i.id).sort()).toEqual(['coffee', 'milk']);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// mergeMorningCheckinProgress — cross-surface step-level merge
// ───────────────────────────────────────────────────────────────────────────
describe('mergeMorningCheckinProgress', () => {
  test('preserves independent progress from two shells and keeps the cloud flowId', () => {
    const current = {
      version: 1,
      clientId: 'client-1',
      dateKey: '2026-07-17',
      flowId: 'cloud-flow',
      plannedStepIds: ['weight', 'sleepTime'],
      steps: {
        weight: { status: 'synced', updatedAt: 3000 },
        sleepTime: { status: 'planned', updatedAt: 1000 },
      },
      updatedAt: 3000,
    };
    const incoming = {
      version: 1,
      clientId: 'client-1',
      dateKey: '2026-07-17',
      flowId: 'second-shell-flow',
      plannedStepIds: ['weight', 'sleepTime', 'supplements'],
      steps: {
        weight: { status: 'planned', updatedAt: 1000 },
        sleepTime: { status: 'saved_local', updatedAt: 4000 },
        supplements: { status: 'skipped', updatedAt: 4100 },
      },
      updatedAt: 4100,
    };

    const merged = mergeMorningCheckinProgress(incoming, current, { now: 5000 });

    expect(merged.flowId).toBe('cloud-flow');
    expect(merged.plannedStepIds).toEqual(['weight', 'sleepTime', 'supplements']);
    expect(merged.steps.weight.status).toBe('synced');
    expect(merged.steps.sleepTime.status).toBe('saved_local');
    expect(merged.steps.supplements.status).toBe('skipped');
    expect(merged.updatedAt).toBe(5000);
  });

  test('allows an explicit newer replan to replace an older terminal row', () => {
    const current = {
      flowId: 'flow-1',
      plannedStepIds: ['yesterdayVerify'],
      steps: { yesterdayVerify: { status: 'synced', attempt: 1, syncedAt: 3000, updatedAt: 3000 } },
      updatedAt: 3000,
    };
    const incoming = {
      flowId: 'flow-2',
      plannedStepIds: ['yesterdayVerify'],
      steps: { yesterdayVerify: { status: 'planned', attempt: 2, replannedAt: 4000, updatedAt: 4000, savedAt: null, syncedAt: null } },
      updatedAt: 4000,
    };

    const merged = mergeMorningCheckinProgress(incoming, current, { now: 5000 });
    expect(merged.steps.yesterdayVerify.status).toBe('planned');
    expect(merged.steps.yesterdayVerify.syncedAt).toBeNull();
  });

  test('does not let a future-skewed stale planned row downgrade a terminal status', () => {
    const current = {
      flowId: 'flow-1',
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'synced', attempt: 1, syncedAt: 3000, updatedAt: 3000 } },
      updatedAt: 3000,
    };
    const incoming = {
      flowId: 'flow-2',
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'planned', attempt: 1, updatedAt: 9999999999999 } },
      updatedAt: 9999999999999,
    };

    const merged = mergeMorningCheckinProgress(incoming, current, { now: 5000 });

    expect(merged.steps.weight.status).toBe('synced');
    expect(merged.steps.weight.attempt).toBe(1);
  });

  test('does not let a future-skewed saved_local row downgrade synced in the same attempt', () => {
    const current = {
      flowId: 'flow-1',
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'synced', attempt: 1, syncedAt: 3000, updatedAt: 3000 } },
      updatedAt: 3000,
    };
    const incoming = {
      flowId: 'flow-1',
      plannedStepIds: ['weight'],
      steps: { weight: { status: 'saved_local', attempt: 1, savedAt: 9999999999999, updatedAt: 9999999999999 } },
      updatedAt: 9999999999999,
    };

    const merged = mergeMorningCheckinProgress(incoming, current, { now: 5000 });

    expect(merged.steps.weight.status).toBe('synced');
    expect(merged.steps.weight.syncedAt).toBe(3000);
    expect(hasMorningCheckinProgressConflict(incoming, current)).toBe(true);
  });

  test('treats ordinary forward progress as non-conflicting for audit', () => {
    const current = {
      flowId: 'flow-1',
      plannedStepIds: ['weight', 'sleepTime'],
      steps: {
        weight: { status: 'synced', attempt: 1, updatedAt: 3000 },
        sleepTime: { status: 'planned', attempt: 1, updatedAt: 3000 },
      },
    };
    const incoming = {
      flowId: 'flow-1',
      plannedStepIds: ['weight', 'sleepTime'],
      steps: {
        weight: { status: 'synced', attempt: 1, updatedAt: 3000 },
        sleepTime: { status: 'saved_local', attempt: 1, savedAt: 4000, updatedAt: 4000 },
      },
    };

    expect(hasMorningCheckinProgressConflict(incoming, current)).toBe(false);
  });

  test('detects a cloud-only completed step as a real cross-shell conflict', () => {
    const current = {
      flowId: 'flow-1',
      plannedStepIds: ['weight', 'sleepTime'],
      steps: {
        weight: { status: 'synced', attempt: 1, updatedAt: 4000 },
        sleepTime: { status: 'planned', attempt: 1, updatedAt: 1000 },
      },
    };
    const incoming = {
      flowId: 'flow-1',
      plannedStepIds: ['weight', 'sleepTime'],
      steps: {
        weight: { status: 'planned', attempt: 1, updatedAt: 1000 },
        sleepTime: { status: 'saved_local', attempt: 1, updatedAt: 5000 },
      },
    };

    expect(hasMorningCheckinProgressConflict(incoming, current)).toBe(true);
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

// ───────────────────────────────────────────────────────────────────────────
// stampDayv2ChangedEntities — pure stamping layer (A2)
// ───────────────────────────────────────────────────────────────────────────
describe('stampDayv2ChangedEntities', () => {
  const dayWithItem = (dayTs, mealTs, itemTs, grams, extras = {}) => ({
    date: '2026-06-04',
    updatedAt: dayTs,
    trainings: [],
    meals: [
      { id: 'm1', name: 'Перекус', updatedAt: mealTs, items: [
        { id: 'it1', productId: 'coffee', grams, updatedAt: itemTs },
      ] },
    ],
    ...extras,
  });

  test('cloud-apply no-op: same prev/next preserves all timestamps', () => {
    const prev = dayWithItem(3000, 2500, 2500, 300);
    const next = dayWithItem(3000, 2500, 2500, 300);
    const result = stampDayv2ChangedEntities(prev, next);
    expect(result.updatedAt).toBe(3000);
    expect(result.meals[0].updatedAt).toBe(2500);
    expect(result.meals[0].items[0].updatedAt).toBe(2500);
    expect(result.meals[0].items[0].grams).toBe(300);
  });

  test('HMR-case: prev=null, next without updatedAt → returns payload untouched', () => {
    const next = { date: '2026-06-04', trainings: [], meals: [] };
    const result = stampDayv2ChangedEntities(null, next);
    // Stamper refuses to mutate when caller did not supply day.updatedAt.
    // HMR-guard at saveClientKey срежет upload; interceptor-path запишет в LS
    // только то, что прислал caller.
    expect(result).toBe(next);
    expect(result.updatedAt).toBeUndefined();
  });

  test('idempotency: stamp(stamp(x)) === stamp(x)', () => {
    const prev = dayWithItem(2000, 2000, 2000, 50);
    const next = dayWithItem(3000, 0, 0, 300);
    const once = stampDayv2ChangedEntities(prev, next);
    const twice = stampDayv2ChangedEntities(prev, once);
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  test('suspect write: prev=5000, next=0, content changed → stamper returns nextDay untouched', () => {
    // Caller must always supply day.updatedAt for legitimate mutations. When it's
    // missing, stamper does NOT auto-inject anything (no prev+1, no Date.now()) —
    // because the interceptor path (which stamps directly) is BEFORE the HMR-guard
    // in saveClientKey. Auto-inject там бы выпустил HMR/bad-state write в LS + upload.
    // The untouched nextDay then falls through HMR-guard on the cloud path → blocked.
    const prev = dayWithItem(5000, 5000, 5000, 50);
    const next = dayWithItem(0, 0, 0, 300);
    const result = stampDayv2ChangedEntities(prev, next);
    expect(result).toBe(next); // same reference — no modification
    expect(result.updatedAt).toBe(0);
  });

  test('item-promotion: stale incoming (1000) vs cloud (3000) → itemTs preserved as 1000 locally; server backstop wins', () => {
    const prev = dayWithItem(3000, 3000, 3000, 300);
    const next = dayWithItem(1000, 1000, 1000, 50);
    const result = stampDayv2ChangedEntities(prev, next);
    // mutationTs = next.updatedAt = 1000 (not Date.now())
    // prev item ts = 3000, mutationTs (1000) < prevItemTs (3000) → falls back to incoming.item.updatedAt = 1000
    expect(result.meals[0].items[0].updatedAt).toBe(1000);
    // Server-side hasNewerCurrentItemEdit will then force merge based on item.updatedAt
  });

  test('top-level only change: same meals, but waterMl bumped → only day stamped, items untouched', () => {
    const prev = { ...dayWithItem(2000, 2000, 2000, 100), waterMl: 1000 };
    const next = { ...dayWithItem(3000, 2000, 2000, 100), waterMl: 1500 };
    const result = stampDayv2ChangedEntities(prev, next);
    expect(result.updatedAt).toBe(3000);
    expect(result.meals[0].items[0].updatedAt).toBe(2000);
    expect(result.waterMl).toBe(1500);
  });

  test('resolveDayMutationTs: nextTs=0, prevTs=0 → returns 0 (HMR-safe)', () => {
    expect(resolveDayMutationTs({}, {})).toBe(0);
    expect(resolveDayMutationTs(null, null)).toBe(0);
  });

  test('resolveDayMutationTs: nextTs=0, prevTs=5000 → returns 0 (suspect, no auto-stamp)', () => {
    // Stricter than initial A1 plan: never auto-inject TS when caller did not supply one.
    // Even prev+1 is unsafe because interceptor stamps BEFORE HMR-guard in saveClientKey.
    expect(resolveDayMutationTs({ updatedAt: 0 }, { updatedAt: 5000 })).toBe(0);
  });

  test('resolveDayMutationTs: nextTs=3000, prevTs=5000 → returns 3000 (caller authoritative)', () => {
    expect(resolveDayMutationTs({ updatedAt: 3000 }, { updatedAt: 5000 })).toBe(3000);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// deletedItemIds — item-deletion sync (B2)
// ───────────────────────────────────────────────────────────────────────────
describe('item-deletion sync via deletedItemIds', () => {
  const dayItems = (dayTs, items, extras = {}) => ({
    date: '2026-06-04',
    updatedAt: dayTs,
    trainings: [],
    meals: [{ id: 'm1', name: 'Перекус', updatedAt: dayTs, items }],
    ...extras,
  });

  describe('mergeDayData with deletedItemIds', () => {
    test('local deleted A, remote has stale A → A removed', () => {
      const local = dayItems(3000, [], { deletedItemIds: { A: 2000 } });
      const remote = dayItems(2500, [{ id: 'A', grams: 100, updatedAt: 1500 }]);
      const merged = mergeDayData(local, remote, { forceKeepAll: true });
      const ids = (merged.meals[0]?.items || []).map((it) => it.id);
      expect(ids).not.toContain('A');
      expect(merged.deletedItemIds).toEqual({ A: 2000 });
    });

    test('local edit fresher than remote tombstone → item resurrected', () => {
      const local = dayItems(3000, [{ id: 'A', grams: 200, updatedAt: 2500 }]);
      const remote = dayItems(2000, [], { deletedItemIds: { A: 2000 } });
      const merged = mergeDayData(local, remote, { forceKeepAll: true });
      const a = merged.meals[0].items.find((it) => it.id === 'A');
      expect(a).toBeTruthy();
      expect(a.grams).toBe(200);
    });

    test('both sides have tombstones for A → merged keeps max ts', () => {
      const local = dayItems(2000, [], { deletedItemIds: { A: 1000 } });
      const remote = dayItems(2000, [], { deletedItemIds: { A: 2000 } });
      const merged = mergeDayData(local, remote, { forceKeepAll: true });
      expect(merged.deletedItemIds.A).toBe(2000);
    });

    test('local added B, remote deleted A → B kept, A removed', () => {
      const local = dayItems(3000, [{ id: 'B', grams: 50, updatedAt: 3000 }]);
      const remote = dayItems(2500, [{ id: 'A', grams: 100, updatedAt: 1500 }], { deletedItemIds: { A: 2000 } });
      const merged = mergeDayData(local, remote, { forceKeepAll: true });
      const ids = (merged.meals[0]?.items || []).map((it) => it.id);
      expect(ids).toContain('B');
      expect(ids).not.toContain('A');
    });

    test('subjective guard merge still applies item tombstones', () => {
      const incoming = dayItems(3000, [], {
        deletedItemIds: { A: 2500 },
      });
      const current = dayItems(2000, [{ id: 'A', grams: 100, updatedAt: 1500 }], {
        sleepStart: '01:00',
        sleepEnd: '09:10',
        sleepHours: 8.2,
        moodMorning: 7,
      });

      expect(hasSubjectiveFieldDrop(incoming, current)).toBe(true);

      const merged = mergeDayData(incoming, current, { forceKeepAll: true });
      const ids = (merged.meals[0]?.items || []).map((it) => it.id);
      expect(ids).not.toContain('A');
      expect(merged.deletedItemIds).toEqual({ A: 2500 });
      expect(merged.sleepHours).toBe(8.2);
      expect(merged.moodMorning).toBe(7);
    });
  });

  describe('stampDayv2ChangedEntities — no auto-emit (explicit-delete only)', () => {
    test('sync-writeback: prev=[A,B], next=[B] (merge dropped A) → NO phantom tombstone', () => {
      // The stamper also runs on sync-writeback writes (pollOnce / live-refresh /
      // merge result via patched setItem). A merge that legitimately drops an item
      // must NOT become a permanent deletion. Regression guard for the phantom
      // tombstone incident 2026-06-05 (it_pnqmnh "Молоко" tombstoned by pollOnce).
      const prev = {
        date: '2026-06-04',
        updatedAt: 2000,
        trainings: [],
        meals: [{ id: 'm1', name: 'Перекус', updatedAt: 2000, items: [
          { id: 'A', grams: 100, updatedAt: 2000 },
          { id: 'B', grams: 50, updatedAt: 2000 },
        ] }],
      };
      const next = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', name: 'Перекус', updatedAt: 3000, items: [
          { id: 'B', grams: 50, updatedAt: 2000 },
        ] }],
      };
      const result = stampDayv2ChangedEntities(prev, next);
      expect(result.deletedItemIds).toBeUndefined(); // A dropped by merge, NOT tombstoned
      expect(result.meals[0].items.map((it) => it.id)).toEqual(['B']);
    });

    test('explicit delete: caller put deletedItemIds on next → passed through', () => {
      // The removeItem handler sets day.deletedItemIds explicitly. The stamper
      // must preserve it (this is a deliberate user delete, not an inference).
      const prev = {
        date: '2026-06-04', updatedAt: 2000, trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'A', grams: 100, updatedAt: 2000 }, { id: 'B', grams: 50, updatedAt: 2000 }] }],
      };
      const next = {
        date: '2026-06-04', updatedAt: 3000, trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'B', grams: 50, updatedAt: 2000 }] }],
        deletedItemIds: { A: 3000 }, // explicit, set by removeItem handler
      };
      const result = stampDayv2ChangedEntities(prev, next);
      expect(result.deletedItemIds).toEqual({ A: 3000 });
    });

    test('pollOnce end-to-end: merge drops a local-only item, stamper does NOT tombstone it', () => {
      // local LS has Молоко (local-only, older); cloud has only Кофе+Сироп (fresher).
      const localLS = {
        date: '2026-06-05', updatedAt: 2000, trainings: [],
        meals: [{ id: 'm1', updatedAt: 2000, items: [
          { id: 'kofe', grams: 100, updatedAt: 2000 },
          { id: 'moloko', grams: 100, updatedAt: 1000 },
        ] }],
      };
      const cloud = {
        date: '2026-06-05', updatedAt: 3000, trainings: [],
        meals: [{ id: 'm1', updatedAt: 3000, items: [
          { id: 'kofe', grams: 77, updatedAt: 3000 },
          { id: 'sirop', grams: 100, updatedAt: 3000 },
        ] }],
      };
      // pollOnce: merge then write the merged blob through the stamper.
      const merged = mergeDayData(localLS, cloud, { forceKeepAll: false, preferRemote: true });
      const stamped = stampDayv2ChangedEntities(localLS, merged);
      // No phantom tombstone, regardless of whether the merge kept or dropped Молоко.
      expect(stamped.deletedItemIds).toBeUndefined();
    });

    test('idempotency: prev already has deletedItemIds[A], next without A → not duplicated', () => {
      const prev = {
        date: '2026-06-04',
        updatedAt: 4000,
        trainings: [],
        meals: [{ id: 'm1', items: [] }],
        deletedItemIds: { A: 3500 },
      };
      const next = {
        date: '2026-06-04',
        updatedAt: 4000,
        trainings: [],
        meals: [{ id: 'm1', items: [] }],
        deletedItemIds: { A: 3500 },
      };
      const result = stampDayv2ChangedEntities(prev, next);
      expect(result.deletedItemIds.A).toBe(3500);
    });

    test('prev=null, next without items → does NOT emit tombstones (new day)', () => {
      const next = { date: '2026-06-04', updatedAt: 3000, trainings: [], meals: [] };
      const result = stampDayv2ChangedEntities(null, next);
      expect(result.deletedItemIds).toBeUndefined();
    });

    test('HMR-safe: prev with A, next without A and no updatedAt → no tombstone, payload untouched', () => {
      // Interceptor path stamps BEFORE saveClientKey HMR-guard. If we'd auto-emit
      // a tombstone here, the LS would record a phantom deletion even though the
      // upload itself gets blocked. Stricter behavior: refuse to mutate when caller
      // omitted day.updatedAt — leave it to the cloud-side guard to block save.
      const prev = {
        date: '2026-06-04',
        updatedAt: 2000,
        trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'A', grams: 100, updatedAt: 2000 }] }],
      };
      const next = {
        date: '2026-06-04',
        // no updatedAt — HMR signature / bad-state writer
        trainings: [],
        meals: [{ id: 'm1', items: [] }],
      };
      const result = stampDayv2ChangedEntities(prev, next);
      expect(result).toBe(next); // returned as-is (no mutation)
      expect(result.deletedItemIds).toBeUndefined();
    });

    test('hot-sync-overwrote-prev: prev=[B], next React=[A,B] → A treated as add, no phantom delete', () => {
      // Scenario: hot-sync apply (via safeSetItem, bypasses interceptor) just
      // overwrote LS with cloud value that lost A. React state still had [A,B].
      // React autosave then writes [A,B] through patched setItem → interceptor →
      // stamper. The stamper sees prev (after hot-sync) = [B], next (React state)
      // = [A,B]. Without the stamper diff-direction guard, A's reappearance could
      // be mis-classified. Stamper logic: scan prev → next, emit tombstone only
      // for items in prev that disappeared in next. A in next but not in prev →
      // it's an ADD, not a delete. Critical that this stays an ADD even when prev
      // ALREADY has an unrelated tombstone — to confirm the scan is prev→next,
      // not next→prev.
      const prev = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'B', grams: 50, updatedAt: 3000 }] }],
        deletedItemIds: { C: 2500 }, // unrelated prior tombstone
      };
      const next = {
        date: '2026-06-04',
        updatedAt: 4000,
        trainings: [],
        meals: [{ id: 'm1', items: [
          { id: 'A', grams: 100, updatedAt: 4000 },
          { id: 'B', grams: 50, updatedAt: 3000 },
        ] }],
      };
      const result = stampDayv2ChangedEntities(prev, next);
      // A added back, no phantom delete for A
      const ids = result.meals[0].items.map((it) => it.id);
      expect(ids).toEqual(expect.arrayContaining(['A', 'B']));
      // Prior tombstone for C is preserved (carried forward from prev), but no
      // tombstone for A. This is the load-bearing assertion: scan direction is
      // prev→next, not next→prev.
      expect(result.deletedItemIds).toEqual({ C: 2500 });
    });

    test('hot-sync-overwrote-prev: re-resurrection via mergeItemsById — tombstoned A not resurrected if item.updatedAt <= tombstoneTs', () => {
      // Companion test: even if some upstream race were to put A back into next,
      // the cross-side merge (mergeItemsById) must respect tombstones with
      // higher TS than the item edit.
      const remote = [{ id: 'A', grams: 100, updatedAt: 2000 }];
      const local = [{ id: 'A', grams: 100, updatedAt: 2000 }];
      const merged = mergeItemsById(remote, local, true, { A: 2500 });
      expect(merged).toEqual([]);
    });

    test('phantom resurrection guard: prev has deletedItemIds[A]=3000, next writes stale A back with fresh day.updatedAt=4000 → stamper preserves stale item.updatedAt', () => {
      // P1 from third audit (2026-06-04): hot-sync brought tombstone {A: 3000},
      // but stale React state writes [A(old ts 2000), B] back through
      // patched setItem. Without the tombstone-aware promotion guard, stamper
      // would promote A.updatedAt to mutationTs=4000 → mergeItemsById would see
      // item ts (4000) > tombstoneTs (3000) → resurrect deleted product.
      const prev = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'B', grams: 50, updatedAt: 3000 }], updatedAt: 3000 }],
        deletedItemIds: { A: 3000 },
      };
      const next = {
        date: '2026-06-04',
        updatedAt: 4000,
        trainings: [],
        meals: [{ id: 'm1', items: [
          { id: 'A', grams: 100, updatedAt: 2000 }, // stale stamp from before tombstone
          { id: 'B', grams: 50, updatedAt: 3000 },
        ], updatedAt: 4000 }],
      };
      const stamped = stampDayv2ChangedEntities(prev, next);
      const aAfterStamp = stamped.meals[0].items.find((it) => it.id === 'A');
      // Critical: A.updatedAt MUST stay at 2000, not jump to 4000
      expect(aAfterStamp.updatedAt).toBe(2000);
      expect(stamped.deletedItemIds).toEqual({ A: 3000 }); // tombstone preserved

      // End-to-end: merge filter then drops A
      const cloud = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', items: [{ id: 'B', grams: 50, updatedAt: 3000 }], updatedAt: 3000 }],
        deletedItemIds: { A: 3000 },
      };
      const merged = mergeDayData(stamped, cloud, { forceKeepAll: true });
      const aAfterMerge = merged.meals[0].items.find((it) => it.id === 'A');
      expect(aAfterMerge).toBeUndefined();
      expect(merged.deletedItemIds).toEqual({ A: 3000 });
    });

    test('legitimate re-add: caller explicitly sets item.updatedAt > tombstoneTs → resurrection allowed', () => {
      // Если юзер реально хочет добавить тот же продукт обратно, handler
      // выставит item.updatedAt = Date.now() > tombstoneTs. Stamper preserves
      // incoming stamp, mergeItemsById пропускает item (ts > tombstone).
      const prev = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', items: [], updatedAt: 3000 }],
        deletedItemIds: { A: 3000 },
      };
      const next = {
        date: '2026-06-04',
        updatedAt: 5000,
        trainings: [],
        meals: [{ id: 'm1', items: [
          { id: 'A', grams: 100, updatedAt: 5000 }, // explicit fresh stamp from handler
        ], updatedAt: 5000 }],
      };
      const stamped = stampDayv2ChangedEntities(prev, next);
      const a = stamped.meals[0].items.find((it) => it.id === 'A');
      expect(a.updatedAt).toBe(5000); // preserved as-is (already > tombstone)
      const cloud = {
        date: '2026-06-04',
        updatedAt: 3000,
        trainings: [],
        meals: [{ id: 'm1', items: [], updatedAt: 3000 }],
        deletedItemIds: { A: 3000 },
      };
      const merged = mergeDayData(stamped, cloud, { forceKeepAll: true });
      expect(merged.meals[0].items.find((it) => it.id === 'A')).toBeTruthy();
    });
  });

  describe('mergeItemsById with deletedItemIdsMap', () => {
    test('item filtered when tombstone newer than item.updatedAt', () => {
      const remote = [{ id: 'X', grams: 100, updatedAt: 1500 }];
      const local = [{ id: 'X', grams: 100, updatedAt: 1500 }];
      const merged = mergeItemsById(remote, local, true, { X: 2000 });
      expect(merged.length).toBe(0);
    });

    test('item resurrected when item.updatedAt newer than tombstone', () => {
      const remote = [{ id: 'X', grams: 100, updatedAt: 2500 }];
      const local = [{ id: 'X', grams: 100, updatedAt: 2500 }];
      const merged = mergeItemsById(remote, local, true, { X: 2000 });
      expect(merged.length).toBe(1);
      expect(merged[0].id).toBe('X');
    });

    test('no tombstone map → original behavior', () => {
      const remote = [{ id: 'X', grams: 100, updatedAt: 1500 }];
      const local = [];
      const merged = mergeItemsById(remote, local, true);
      expect(merged.length).toBe(1);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Clock-skew reconcile — curator↔PIN incident 2026-06-05
// Local (React) day.updatedAt ran AHEAD of the remote (LS/cloud) edit, but the
// remote carries a strictly newer PER-ITEM edit. The day-effects handler now
// reconciles via mergeDayData instead of keeping the stale-but-higher-ts local
// (hasNewerRemoteItem gate). Locks the merge behavior the fix relies on: newer
// item.updatedAt wins regardless of day-level updatedAt direction.
// ───────────────────────────────────────────────────────────────────────────
describe('mergeDayData — clock-skew per-item rescue', () => {
  test('remote item with newer item.updatedAt wins even when local day.updatedAt is higher', () => {
    const local = makeDay(916285, [
      makeMeal('breakfast', [
        { id: 'it_syrup', grams: 111, productId: 'p_syrup', updatedAt: 205124 },
        { id: 'it_milk', grams: 333, productId: 'p_milk', updatedAt: 880000 },
      ]),
    ]);
    const remote = makeDay(890093, [
      makeMeal('breakfast', [
        { id: 'it_syrup', grams: 777, productId: 'p_syrup', updatedAt: 889889 },
        { id: 'it_milk', grams: 333, productId: 'p_milk', updatedAt: 880000 },
      ]),
    ]);
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    const syrup = merged.meals[0].items.find((i) => i.id === 'it_syrup');
    expect(syrup.grams).toBe(777); // newer item edit wins despite local day being "newer"
    expect(syrup.updatedAt).toBe(889889); // winner item ts preserved, not inflated
    expect(merged.updatedAt).toBeGreaterThanOrEqual(916285); // local-newer day stamp not rolled back
  });

  test('local item edit still wins when it is the newer per-item edit', () => {
    const local = makeDay(916285, [
      makeMeal('breakfast', [{ id: 'it_syrup', grams: 222, productId: 'p_syrup', updatedAt: 900000 }]),
    ]);
    const remote = makeDay(890093, [
      makeMeal('breakfast', [{ id: 'it_syrup', grams: 777, productId: 'p_syrup', updatedAt: 800000 }]),
    ]);
    const merged = mergeDayData(local, remote);
    expect(merged).not.toBe(null);
    const syrup = merged.meals[0].items.find((i) => i.id === 'it_syrup');
    expect(syrup.grams).toBe(222); // local per-item edit is newer → preserved
  });
});

// ───────────────────────────────────────────────────────────────────────────
// cycleDay feature-gate (incident 2026-06-05 #3 — cross-gender pollution)
// ───────────────────────────────────────────────────────────────────────────
describe('cycleDay feature-gate helpers', () => {
  describe('ownerClientIdFromDayKey', () => {
    test('scoped day key → owner clientId', () => {
      expect(ownerClientIdFromDayKey('heys_ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a_dayv2_2026-06-04'))
        .toBe('ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a');
    });
    test('unscoped legacy day key → null', () => {
      expect(ownerClientIdFromDayKey('heys_dayv2_2026-06-04')).toBe(null);
    });
    test('non-day / garbage key → null', () => {
      expect(ownerClientIdFromDayKey('heys_profile')).toBe(null);
      expect(ownerClientIdFromDayKey(null)).toBe(null);
      expect(ownerClientIdFromDayKey(undefined)).toBe(null);
    });
  });

  describe('gateCycleDayForOwner', () => {
    test('tracking OFF (false) → cycleDay nulled, other fields intact', () => {
      const day = { date: '2026-06-04', cycleDay: 7, weightMorning: 91.5, meals: [{ id: 'm1' }] };
      const gated = gateCycleDayForOwner(day, false);
      expect(gated.cycleDay).toBe(null);
      expect(gated.weightMorning).toBe(91.5);
      expect(gated.meals).toEqual([{ id: 'm1' }]);
      expect(gated).not.toBe(day); // новый объект, оригинал нетронут
      expect(day.cycleDay).toBe(7);
    });
    test('tracking ON (true) → cycleDay preserved, same ref', () => {
      const day = { date: '2026-06-04', cycleDay: 7 };
      const gated = gateCycleDayForOwner(day, true);
      expect(gated.cycleDay).toBe(7);
      expect(gated).toBe(day);
    });
    test('tracking UNKNOWN (null/undefined) → cycleDay preserved (boot-race safety)', () => {
      const day = { date: '2026-06-04', cycleDay: 7 };
      expect(gateCycleDayForOwner(day, null).cycleDay).toBe(7);
      expect(gateCycleDayForOwner(day, undefined).cycleDay).toBe(7);
    });
    test('no cycleDay → untouched same ref even when tracking off', () => {
      const day = { date: '2026-06-04', meals: [] };
      expect(gateCycleDayForOwner(day, false)).toBe(day);
    });
    test('cycleDay already null → untouched same ref', () => {
      const day = { date: '2026-06-04', cycleDay: null };
      expect(gateCycleDayForOwner(day, false)).toBe(day);
    });
    test('non-object input → returned as-is', () => {
      expect(gateCycleDayForOwner(null, false)).toBe(null);
      expect(gateCycleDayForOwner(undefined, false)).toBe(undefined);
    });
  });
});
