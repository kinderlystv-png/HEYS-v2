/**
 * Журнал воды (waterEntries) — смоук-симуляция.
 *
 * Проверяется то, что руками собрать нельзя: два устройства, старый день без
 * журнала, убавление, месячная статистика объёмов и недельный кеш.
 *
 * Модуль слияния грузится .cjs-копией (apps/web — "type":"module"), той же,
 * что исполняет cloud function: один и тот же код на клиенте и на сервере.
 */
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const {
  mergeDayData,
  appendWaterEntry,
  mergeWaterJournal,
  normalizeWaterEntries,
  resolveWaterMl,
  sumWaterEntries,
  WATER_SEED_ID,
} = require(path.resolve(__dirname, '../../../yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.cjs'));

const DATE = '2026-08-20';

function day(extra) {
  return { date: DATE, meals: [], updatedAt: 1000, ...extra };
}

describe('журнал воды — форма и совместимость', () => {
  it('старый день одним числом продолжает показывать своё число', () => {
    const legacy = day({ waterMl: 500 });
    expect(resolveWaterMl(legacy)).toBe(500);
    expect(legacy.waterEntries).toBeUndefined();
  });

  it('старый день переносится в журнал одной записью kind:legacy, а не выдуманными глотками', () => {
    const entries = normalizeWaterEntries(day({ waterMl: 500, lastWaterTime: 777 }));
    expect(entries).toEqual([{ id: WATER_SEED_ID, ml: 500, ts: 777, kind: 'legacy' }]);
    expect(sumWaterEntries(entries)).toBe(500);
  });

  it('пустой день не получает выдуманного журнала', () => {
    expect(normalizeWaterEntries(day({ waterMl: 0 }))).toEqual([]);
    expect(resolveWaterMl(day({}))).toBe(0);
  });

  it('глоток на старом дне сохраняет прежнее число и добавляется поверх', () => {
    const next = appendWaterEntry(day({ waterMl: 500, lastWaterTime: 777 }), 200, { ts: 2000 });
    expect(next.waterMl).toBe(700);
    expect(sumWaterEntries(next.waterEntries)).toBe(700);
    expect(next.waterEntries.map((e) => e.ml)).toEqual([500, 200]);
    expect(next.waterEntries[1]).toMatchObject({ ml: 200, ts: 2000 });
    expect(typeof next.waterEntries[1].id).toBe('string');
  });

  it('сумма журнала совпадает с waterMl после каждой записи', () => {
    let current = day({ waterMl: 0 });
    [200, 500, 330, -200, 100].forEach((ml, index) => {
      const next = appendWaterEntry(current, ml, { ts: 3000 + index });
      expect(sumWaterEntries(next.waterEntries)).toBe(next.waterMl);
      current = { ...current, waterMl: next.waterMl, waterEntries: next.waterEntries };
    });
    expect(current.waterMl).toBe(930);
  });

  it('убавление — отрицательная запись, а не переписанная сумма', () => {
    const withSip = appendWaterEntry(day({ waterMl: 0 }), 500, { ts: 4000 });
    const afterRemove = appendWaterEntry(
      day({ waterMl: withSip.waterMl, waterEntries: withSip.waterEntries }),
      -200,
      { ts: 4100 }
    );
    expect(afterRemove.waterMl).toBe(300);
    expect(afterRemove.waterEntries).toHaveLength(2);
    expect(afterRemove.waterEntries[1].ml).toBe(-200);
  });

  it('убавление на старом дне без журнала работает и не уходит в минус', () => {
    const afterRemove = appendWaterEntry(day({ waterMl: 100 }), -200, { ts: 4200 });
    expect(afterRemove.waterMl).toBe(0);
    expect(afterRemove.appliedMl).toBe(-100);
    expect(sumWaterEntries(afterRemove.waterEntries)).toBe(0);
  });

  it('убавление на пустом дне не пишет мусорную запись', () => {
    const afterRemove = appendWaterEntry(day({ waterMl: 0 }), -200, { ts: 4300 });
    expect(afterRemove.waterEntries).toEqual([]);
    expect(afterRemove.entryId).toBeNull();
  });

  it('запись мимо журнала (плитка Главной пишет waterMl напрямую) не теряется', () => {
    const journalDay = day({ waterMl: 200, waterEntries: [{ id: 'w-1', ml: 200, ts: 5000 }] });
    const afterTile = { ...journalDay, waterMl: 400 };
    const next = appendWaterEntry(afterTile, 100, { ts: 5100 });
    expect(next.waterMl).toBe(500);
    expect(sumWaterEntries(next.waterEntries)).toBe(500);
  });
});

describe('журнал воды — два устройства', () => {
  it('по глотку с каждого устройства — оба на месте, а не максимум', () => {
    const local = day({
      waterMl: 200,
      waterUpdatedAt: 9000,
      waterEntries: [{ id: 'w-a', ml: 200, ts: 9000 }],
    });
    const remote = day({
      waterMl: 200,
      waterUpdatedAt: 9100,
      waterEntries: [{ id: 'w-b', ml: 200, ts: 9100 }],
    });
    const merged = mergeDayData(local, remote, {});
    expect(merged.waterMl).toBe(400);
    expect(merged.waterEntries.map((e) => e.id)).toEqual(['w-a', 'w-b']);
  });

  it('глотки поверх общего старого дня не задваивают старое число', () => {
    const base = { waterMl: 500, lastWaterTime: 100 };
    const local = day({
      ...base,
      waterMl: 700,
      waterUpdatedAt: 9000,
      waterEntries: [
        { id: WATER_SEED_ID, ml: 500, ts: 100, kind: 'legacy' },
        { id: 'w-a', ml: 200, ts: 9000 },
      ],
    });
    const remote = day({
      ...base,
      waterMl: 800,
      waterUpdatedAt: 9100,
      waterEntries: [
        { id: WATER_SEED_ID, ml: 500, ts: 100, kind: 'legacy' },
        { id: 'w-b', ml: 300, ts: 9100 },
      ],
    });
    const merged = mergeDayData(local, remote, {});
    expect(merged.waterMl).toBe(1000);
  });

  it('убавление на одном устройстве не воскресает от второго', () => {
    const local = day({
      waterMl: 300,
      waterUpdatedAt: 9200,
      waterEntries: [
        { id: 'w-a', ml: 500, ts: 9000 },
        { id: 'w-minus', ml: -200, ts: 9200 },
      ],
    });
    const remote = day({
      waterMl: 500,
      waterUpdatedAt: 9000,
      waterEntries: [{ id: 'w-a', ml: 500, ts: 9000 }],
    });
    expect(mergeDayData(local, remote, {}).waterMl).toBe(300);
    expect(mergeDayData(remote, local, {}).waterMl).toBe(300);
  });

  it('отсутствие записи на второй стороне не считается удалением', () => {
    const local = day({ waterMl: 200, waterEntries: [{ id: 'w-a', ml: 200, ts: 9000 }] });
    const remote = day({ waterMl: 0, waterEntries: [] });
    expect(mergeDayData(local, remote, {}).waterMl).toBe(200);
    expect(mergeDayData(remote, local, {}).waterMl).toBe(200);
  });

  it('слияние не зависит от порядка сторон и повторного прогона', () => {
    const local = day({ waterMl: 200, waterEntries: [{ id: 'w-a', ml: 200, ts: 9000 }] });
    const remote = day({ waterMl: 300, waterEntries: [{ id: 'w-b', ml: 300, ts: 9100 }] });
    const once = mergeDayData(local, remote, {});
    const flipped = mergeDayData(remote, local, {});
    expect(once.waterMl).toBe(500);
    expect(flipped.waterMl).toBe(500);
    expect(mergeWaterJournal(once, once).waterMl).toBe(500);
    // Повторный прогон уже слитого дня против исходной стороны ничего не двигает.
    expect(mergeDayData(once, local, {}).waterMl).toBe(500);
    expect(mergeDayData(local, once, {}).waterMl).toBe(500);
  });

  it('устройство со старым днём без журнала не затирает журнал второго', () => {
    const local = day({
      waterMl: 700,
      waterUpdatedAt: 9000,
      waterEntries: [
        { id: WATER_SEED_ID, ml: 500, ts: 100, kind: 'legacy' },
        { id: 'w-a', ml: 200, ts: 9000 },
      ],
    });
    const legacyRemote = day({ waterMl: 500, lastWaterTime: 100, waterUpdatedAt: 8000 });
    expect(mergeDayData(local, legacyRemote, {}).waterMl).toBe(700);
  });

  it('день без журнала с обеих сторон идёт прежней дорогой', () => {
    const local = day({ waterMl: 250, waterUpdatedAt: 2100, lastWaterTime: 2100 });
    const remote = day({ waterMl: 1500, waterUpdatedAt: 1500, lastWaterTime: 1500 });
    const merged = mergeDayData(local, remote, {});
    // Группа waterUpdatedAt: свежая сторона побеждает, журнал не вмешивается.
    expect(merged.waterMl).toBe(250);
    expect(merged.waterEntries).toBeUndefined();
  });
});

describe('два самых частых объёма за две недели', () => {
  const originalHEYS = global.HEYS;
  let storage;

  function loadWaterModule() {
    global.HEYS.WaterCustomVolume = { useLongPress350: () => ({}), open: vi.fn() };
    const srcPath = path.resolve(__dirname, '../heys_day_water_v1.js');
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(srcPath, 'utf8'));
    return global.HEYS.dayWater._test;
  }

  function seedDay(clientId, iso, volumes) {
    let waterMl = 0;
    const waterEntries = volumes.map((ml, index) => {
      waterMl += ml;
      return { id: iso + '-' + index, ml, ts: index };
    });
    storage.set('heys_' + clientId + '_dayv2_' + iso, { date: iso, waterMl, waterEntries });
  }

  beforeEach(() => {
    storage = new Map();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    global.HEYS = {
      currentClientId: 'client-a',
      utils: {
        lsGet: (key, fallback) => {
          const scoped = 'heys_' + global.HEYS.currentClientId + '_' + String(key).replace(/^heys_/, '');
          return storage.has(scoped) ? storage.get(scoped) : fallback;
        },
        lsSet: (key, value) => {
          const scoped = 'heys_' + global.HEYS.currentClientId + '_' + String(key).replace(/^heys_/, '');
          storage.set(scoped, value);
        },
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
    global.HEYS = originalHEYS;
  });

  it('без своих объёмов возвращает значения по умолчанию из контракта', () => {
    const api = loadWaterModule();
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([200, 500]);
  });

  it('считает два самых частых объёма по журналу за две недели', () => {
    seedDay('client-a', '2026-08-19', [330, 330, 750]);
    seedDay('client-a', '2026-08-18', [330, 750, 200]);
    seedDay('client-a', '2026-08-17', [750]);
    const api = loadWaterModule();
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([330, 750]);
  });

  // Граница окна — ровно две недели (строка контракта «какие объёмы идут в
  // карточку»). День на пятнадцатые сутки назад уже не в счёт, поэтому свои
  // объёмы не набираются и остаются умолчания.
  it('старше двух недель в счёт не идёт', () => {
    seedDay('client-a', '2026-08-05', [330, 330, 330, 750, 750]);
    const api = loadWaterModule();
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([200, 500]);
  });

  it('убавление и перенесённое старое число объёмом не считаются', () => {
    storage.set('heys_client-a_dayv2_2026-08-19', {
      date: '2026-08-19',
      waterMl: 900,
      waterEntries: [
        { id: 's', ml: 1000, ts: 0, kind: 'legacy' },
        { id: 'a', ml: 330, ts: 1 },
        { id: 'b', ml: 330, ts: 2 },
        { id: 'c', ml: -100, ts: 3 },
        { id: 'd', ml: -100, ts: 4 },
        { id: 'e', ml: -100, ts: 5 },
        { id: 'f', ml: 750, ts: 6 },
      ],
    });
    const api = loadWaterModule();
    expect(api.getFrequentVolumes('2026-08-19')).toEqual([330, 750]);
  });

  it('пересчёт не чаще раза в неделю', () => {
    seedDay('client-a', '2026-08-19', [330, 330, 750, 750]);
    const api = loadWaterModule();
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([330, 750]);

    // Новые глотки внутри той же недели ответ не меняют — берётся кеш.
    seedDay('client-a', '2026-08-20', [100, 100, 100, 100, 100, 100]);
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([330, 750]);

    // Следующая неделя — пересчёт.
    expect(api.getFrequentVolumes('2026-08-25')).toEqual([100, 330]);
  });

  it('кеш одного клиента не виден другому', () => {
    seedDay('client-a', '2026-08-19', [330, 330, 750, 750]);
    seedDay('client-b', '2026-08-19', [100, 100, 250, 250]);
    const api = loadWaterModule();

    expect(api.getFrequentVolumes('2026-08-20')).toEqual([330, 750]);
    expect(storage.has('heys_client-a_water_freq_volumes')).toBe(true);
    expect(storage.has('heys_client-b_water_freq_volumes')).toBe(false);

    global.HEYS.currentClientId = 'client-b';
    expect(api.getFrequentVolumes('2026-08-20')).toEqual([100, 250]);
    expect(storage.get('heys_client-a_water_freq_volumes').volumes).toEqual([330, 750]);
  });
});
