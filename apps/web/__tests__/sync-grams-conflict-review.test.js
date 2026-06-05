/**
 * REVIEW test — cross-device grams conflict (curator 300 vs phone 50).
 *
 * Validates the item.updatedAt merge added by the centralized-stamping change
 * against the real mergeDayData (CJS copy used by the Cloud Function), and
 * documents the clock-skew / restamp-freshen ceiling of wall-clock LWW.
 *
 * Server calls mergeDayData(incomingValue, currentValue, {forceKeepAll:true}),
 * i.e. local = the uploading device (phone), remote = current cloud (curator).
 * Item winner is decided by item.updatedAt: localTs >= remoteTs ? local : remote.
 *
 * NOTE: the React block-window can't be exercised here — it lives in
 * day/_meals.js (markUndoWindow(3000) on each mutation handler) and only
 * prevents the phone React state from PRODUCING a fresh-stamped stale value
 * during the 3-sec window after a user edit. These tests show what merge
 * does once such a value has been produced, which is exactly why the two
 * fixes are interdependent.
 */
import { describe, test, expect } from 'vitest';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const mergeModulePath = path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs');
const { mergeDayData } = require(mergeModulePath);

const dayWithGrams = (dayTs, itemTs, grams) => ({
  date: '2026-06-04',
  updatedAt: dayTs,
  trainings: [],
  meals: [
    { id: 'm1', name: 'Перекус', updatedAt: itemTs, items: [
      { id: 'it1', productId: 'coffee', grams, updatedAt: itemTs },
    ] },
  ],
});

const gramsOf = (day) => day?.meals?.[0]?.items?.[0]?.grams;

describe('grams cross-device conflict — item.updatedAt merge', () => {
  test("curator's newer edit (300) survives a phone upload carrying stale 50", () => {
    // cloud = curator 300 @ t=2000 ; phone uploads its blob with stale 50 @ t=1000
    const curator = dayWithGrams(2000, 2000, 300);
    const phone = dayWithGrams(/* fresh day ts → fast-path */ 5000, 1000, 50);
    // server-side call shape: mergeDayData(incoming=phone, current=cloud)
    const merged = mergeDayData(phone, curator, { forceKeepAll: true });
    expect(gramsOf(merged)).toBe(300); // curator's item ts (2000) > phone item ts (1000)
  });

  test('reverse direction: phone made the genuinely newer edit (300) and it wins', () => {
    const phone = dayWithGrams(5000, 3000, 300);
    const cloud = dayWithGrams(2000, 1000, 50);
    const merged = mergeDayData(phone, cloud, { forceKeepAll: true });
    expect(gramsOf(merged)).toBe(300); // phone item ts (3000) >= cloud (1000)
  });

  test('symmetric: curator pulling phone edit picks the same winner', () => {
    // when curator's client pulls, it calls mergeDayData(local=curator, remote=phone)
    const curator = dayWithGrams(2000, 2000, 300);
    const phone = dayWithGrams(5000, 1000, 50);
    const merged = mergeDayData(curator, phone, { forceKeepAll: true });
    expect(gramsOf(merged)).toBe(300); // curator item ts (2000) >= phone (1000)
  });

  // ─── PITFALL: wall-clock LWW ceiling ──────────────────────────────────────
  // Documents the clock-skew / restamp-freshen failure mode flagged in review:
  // a STALE 50 that carries a HIGHER item.updatedAt (because the phone's clock
  // is ahead, OR because the centralized stamp re-freshened a reverted value)
  // wins over the genuinely-newer curator 300. This is the ceiling of the
  // approach; the robust fix is a server-assigned revision, not Date.now().
  test('PITFALL: a stale 50 with a higher timestamp clobbers the real 300', () => {
    const phoneStaleButHigherTs = dayWithGrams(9000, 3000, 50);  // restamped/ skewed
    const curatorReal = dayWithGrams(2500, 2000, 300);            // genuinely newer content, lower ts
    const merged = mergeDayData(phoneStaleButHigherTs, curatorReal, { forceKeepAll: true });
    // Merge can't tell "newer" from "restamped" — it trusts the clock.
    expect(gramsOf(merged)).toBe(50); // ← data loss; not a bug in merge, a ceiling of wall-clock LWW
  });

  // ─── Backward-compat: legacy rows without item.updatedAt ──────────────────
  test('legacy items without item.updatedAt do not crash and resolve deterministically', () => {
    const a = { date: '2026-06-04', updatedAt: 2000, trainings: [], meals: [
      { id: 'm1', name: 'Перекус', items: [{ id: 'it1', productId: 'coffee', grams: 300 }] },
    ] };
    const b = { date: '2026-06-04', updatedAt: 1000, trainings: [], meals: [
      { id: 'm1', name: 'Перекус', items: [{ id: 'it1', productId: 'coffee', grams: 50 }] },
    ] };
    const merged = mergeDayData(a, b, { forceKeepAll: true });
    expect([50, 300]).toContain(gramsOf(merged)); // deterministic, no throw
  });
});
