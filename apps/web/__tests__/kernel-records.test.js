// kernel-records.test.js — общий storage-слой records: ключи, JSON, memory, cap.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_records_v1.js'), 'utf8'));
};

const R = () => globalThis.HEYS.TrainingKernel.records;

describe('kernel records', () => {
  beforeAll(setupOnce);

  it('clientKey поддерживает colon и heys-client-prefix стили', () => {
    expect(R().clientKey('heys_mobility_records_v1', 'c1')).toBe('heys_mobility_records_v1:c1');
    expect(R().clientKey('heys_mobility_records_v1', '')).toBe('heys_mobility_records_v1:default');
    expect(R().clientKey('fingers_records_v1', 'c1', { style: 'heys-client-prefix' })).toBe('heys_c1_fingers_records_v1');
    expect(R().clientKey('fingers_records_v1', '', { style: 'heys-client-prefix' })).toBe('heys_fingers_records_v1');
  });

  it('readJson/writeJson safe-merge empty shape', () => {
    const storage = R().createMemoryStorage();
    const empty = () => ({ sessions: [], assessments: [] });
    expect(R().readJson(storage, 'k', empty)).toEqual({ sessions: [], assessments: [] });
    expect(R().writeJson(storage, 'k', { sessions: [{ id: 's1' }] }, empty)).toBe(true);
    expect(R().readJson(storage, 'k', empty)).toEqual({ sessions: [{ id: 's1' }], assessments: [] });
  });

  it('appendCapped и capList режут старые элементы', () => {
    const arr = [1, 2];
    R().appendCapped(arr, 3, 2);
    expect(arr).toEqual([2, 3]);
    arr.unshift(1);
    R().capList(arr, 2);
    expect(arr).toEqual([2, 3]);
  });

  it('appendWindowed режет старые записи и применяет cap', () => {
    const now = 10 * 24 * 3600 * 1000;
    const out = R().appendWindowed(
      [{ ts: now - 30 * 864e5, id: 'old' }, { ts: now - 2 * 864e5, id: 'a' }],
      [{ ts: now - 1 * 864e5, id: 'b' }, { ts: now, id: 'c' }],
      { timestampKey: 'ts', nowMs: now, windowDays: 21, cap: 2 }
    );
    expect(out.map((x) => x.id)).toEqual(['b', 'c']);
  });

  it('recentWindow фильтрует окно, future-bound и сортирует по времени', () => {
    const now = 10000;
    const out = R().recentWindow([
      { timestamp: 9500, id: 'b' },
      { timestamp: 12000, id: 'future' },
      { timestamp: 8000, id: 'old' },
      { timestamp: 9000, id: 'a' }
    ], { nowMs: now, windowMs: 1200, upperBoundNow: true, limit: 2 });
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('timestampFrom/sortByTimestamp понимают number и ISO-date поля', () => {
    expect(R().timestampFrom({ savedAt: '2026-06-01T10:00:00Z' }, 'savedAt')).toBe(Date.parse('2026-06-01T10:00:00Z'));
    expect(R().timestampFrom({ ts: 42 }, ['savedAt', 'ts'])).toBe(42);
    const sorted = R().sortByTimestamp([
      { id: 'b', savedAt: '2026-06-02T00:00:00Z' },
      { id: 'a', savedAt: '2026-06-01T00:00:00Z' }
    ], { timestampKey: 'savedAt' });
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('mapTimeSeries фильтрует невалидные точки и сортирует по ts', () => {
    const out = R().mapTimeSeries([
      { testedAt: '2026-06-03T00:00:00Z', value: 3 },
      { testedAt: 'bad', value: 2 },
      { testedAt: '2026-06-01T00:00:00Z', value: 1 },
      { testedAt: '2026-06-02T00:00:00Z', value: 0 }
    ], (p) => ({
      ts: Date.parse(p.testedAt),
      value: p.value
    }), { valueKey: 'value' });
    expect(out).toEqual([
      { ts: Date.parse('2026-06-01T00:00:00Z'), value: 1 },
      { ts: Date.parse('2026-06-03T00:00:00Z'), value: 3 }
    ]);
  });

  it('selectSeries выбирает canonical, иначе самую длинную с fresh tiebreak', () => {
    const canonical = [{ ts: 1 }];
    expect(R().selectSeries({ a: [{ ts: 1 }, { ts: 2 }], half: canonical }, { canonicalKey: 'half' }))
      .toEqual({ key: 'half', series: canonical });
    expect(R().selectSeries({
      a: [{ ts: 1 }, { ts: 2 }],
      b: [{ ts: 1 }, { ts: 3 }],
      c: [{ ts: 4 }]
    })).toEqual({ key: 'b', series: [{ ts: 1 }, { ts: 3 }] });
  });

  it('appendField/latestInField добавляют запись в named history без мутации исходника', () => {
    const data = { sessions: [{ id: 's1' }] };
    const next = R().appendField(data, 'sessions', { id: 's2' });
    expect(data.sessions.map((x) => x.id)).toEqual(['s1']);
    expect(next.sessions.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(R().latestInField(next, 'sessions')).toEqual({ id: 's2' });
  });

  it('makeId builds stable underscore ids', () => {
    expect(R().makeId(['halfcrimp', '20mm'])).toBe('halfcrimp_20mm');
    expect(R().makeId(['mob_sess', 123, 0])).toBe('mob_sess_123_0');
  });

  it('positionId builds abstract lift/position ids from sport axes', () => {
    expect(R().positionId(
      { gripId: 'halfcrimp', edgeMm: 20 },
      [{ id: 'gripId' }, { id: 'edgeMm' }],
      { suffixes: { edgeMm: 'mm' } }
    )).toBe('halfcrimp_20mm');
    expect(R().positionId(
      { jointRegion: 'hip', timeOfDay: 'morning' },
      [{ id: 'jointRegion' }, { id: 'timeOfDay' }]
    )).toBe('hip_morning');
  });

  it('maxWins compares by metric and testedAt tiebreak', () => {
    const oldRec = { type: 'weight', mvcKg: 80, testedAt: '2026-06-01T10:00:00Z' };
    const opts = { metricsByType: { weight: 'mvcKg', time: 'holdTime' } };
    expect(R().maxWins(oldRec, { type: 'weight', mvcKg: 79, testedAt: '2026-06-02T10:00:00Z' }, opts)).toBe(false);
    expect(R().maxWins(oldRec, { type: 'weight', mvcKg: 80, testedAt: '2026-06-03T10:00:00Z' }, opts)).toBe(true);
    expect(R().maxWins(oldRec, { type: 'time', holdTime: 7, testedAt: '2026-06-01T10:00:00Z' }, opts)).toBe(true);
  });

  it('createStoreAdapter resolves client key, storage DI and append/latest helpers', () => {
    const storage = R().createMemoryStorage();
    let cid = 'client-a';
    const store = R().createStoreAdapter({
      prefix: 'training_records_v1',
      empty: () => ({ sessions: [] }),
      storage,
      getClientId: () => cid,
    });

    expect(store.key()).toBe('heys_client-a_training_records_v1');
    store.append(null, 'sessions', { id: 's1', savedAt: '2026-06-01T00:00:00Z' });
    expect(store.latest(null, 'sessions')).toEqual({ id: 's1', savedAt: '2026-06-01T00:00:00Z' });
    cid = 'client-b';
    expect(store.load().sessions).toEqual([]);
    expect(Object.keys(storage._data)).toEqual(['heys_client-a_training_records_v1']);
  });

  it('mergeRecords applies PR max-wins and append history dedupe policies', () => {
    const merged = R().mergeRecords(
      {
        maxHangs: { half_20mm: { type: 'weight', mvcKg: 80, testedAt: '2026-06-01T00:00:00Z' } },
        history: [{ id: 'h1', testedAt: '2026-06-01T00:00:00Z' }],
        updatedAt: 1
      },
      {
        maxHangs: { half_20mm: { type: 'weight', mvcKg: 79, testedAt: '2026-06-02T00:00:00Z' } },
        history: [
          { id: 'h1', testedAt: '2026-06-01T00:00:00Z' },
          { id: 'h2', testedAt: '2026-06-02T00:00:00Z' }
        ],
        updatedAt: 2
      },
      {
        maxHangs: { type: 'max-wins-map', metricsByType: { weight: 'mvcKg', time: 'holdTime' } },
        history: { type: 'append-dedupe', timestampKey: 'testedAt' }
      }
    );

    expect(merged.maxHangs.half_20mm.mvcKg).toBe(80);
    expect(merged.history.map((x) => x.id)).toEqual(['h1', 'h2']);
  });

  it('mergeRecords supports latest-by-testId assessment policy', () => {
    const merged = R().mergeRecords(
      { assessmentBattery: { maxHang: { score: 50, testedAt: '2026-06-01T00:00:00Z' } } },
      { assessmentBattery: { maxHang: { score: 55, testedAt: '2026-06-03T00:00:00Z' } } },
      { assessmentBattery: { type: 'latest-by-key', keyField: 'testId', timestampKey: 'testedAt' } }
    );

    expect(merged.assessmentBattery.maxHang.score).toBe(55);
    expect(merged.assessmentBattery.maxHang.testId).toBe('maxHang');
  });
});
