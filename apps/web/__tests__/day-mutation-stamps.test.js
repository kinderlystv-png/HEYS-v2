// day-mutation-stamps.test.js — метки доменов правки переживают ensureDay.
//
// На них держится пофайловое разрешение конфликтов между устройствами:
// DAY_USER_MUTATION_GROUPS решает спор по метке домена, а не по корневому
// updatedAt, который двигают и фоновые записи. ensureDay собирает день
// перечислением полей и до 2026-08-31 стирал все двенадцать меток и четыре поля
// групп — метка жила только между правкой и следующей загрузкой дня
// (разбор «Актив», docs/implementation/ACTIVITY_TAB_AS_IS.md §15.3).
//
// Тест держит два инварианта: списки не расходятся, и ensureDay ничего из них
// не теряет. Первый важнее — именно расхождение списков и было причиной.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

function loadModels() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(WEB_DIR, 'heys_models_v1.js'), 'utf8'));
  return globalThis.HEYS.models;
}

/** Группы слияния — источник правды; читаем из самого файла, а не дублируем. */
function readMutationGroups() {
  const src = fs.readFileSync(path.join(WEB_DIR, 'heys_sync_merge_v1.js'), 'utf8');
  const start = src.indexOf('const DAY_USER_MUTATION_GROUPS');
  const end = src.indexOf('];', start);
  expect(start).toBeGreaterThan(-1);
  const block = src.slice(start, end);
  const groups = [];
  const re = /timestamp:\s*'([^']+)',\s*fields:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const fields = m[2]
      .split(',')
      .map((f) => f.trim().replace(/^'|'$/g, ''))
      .filter(Boolean);
    groups.push({ timestamp: m[1], fields });
  }
  return groups;
}

describe('метки доменов правки', () => {
  let M;
  let groups;

  beforeEach(() => {
    M = loadModels();
    groups = readMutationGroups();
  });

  it('групп слияния двенадцать — список не усох незаметно', () => {
    expect(groups.length).toBe(12);
    expect(groups.map((g) => g.timestamp)).toContain('stepsUpdatedAt');
  });

  it('ensureDay проносит каждую метку и каждое поле её группы', () => {
    const probe = { date: '2026-08-31', meals: [], trainings: [] };
    const expected = {};
    let stamp = 1730000000000;
    for (const g of groups) {
      probe[g.timestamp] = stamp;
      expected[g.timestamp] = stamp;
      stamp += 1;
    }
    // Поля групп задаём осмысленными значениями: пустые ensureDay вправе убрать.
    Object.assign(probe, {
      steps: 5000,
      waterMl: 750,
      lastWaterTime: '12:30',
      waterEntries: [{ id: 'w1', ml: 250 }],
      weightMorning: 72.4,
      householdActivities: [{ minutes: 30 }],
      householdMin: 30,
      householdTime: '10:00',
      cycleDay: 3,
      cycleStatus: 'active',
      cycleAnsweredAt: 1730000009999,
      sleepNote: 'спал плохо',
      dayComment: 'комментарий',
      dayScore: 7,
      dayScoreManual: true,
      supplementsPlanned: ['d3'],
      supplementsTaken: ['d3'],
      supplementsTakenAt: '09:00',
      supplementsTakenMeta: { d3: { dose: '2000' } },
      deficitPct: -15,
      isFastingDay: true,
      isIncomplete: true,
    });

    const out = M.ensureDay(probe, {});

    const lost = [];
    for (const g of groups) {
      if (out[g.timestamp] !== expected[g.timestamp]) lost.push(g.timestamp);
      for (const f of g.fields) {
        if (out[f] === undefined) lost.push(f);
      }
    }
    expect(lost).toEqual([]);
  });

  it('метки не выдумываются там, где их не было', () => {
    const out = M.ensureDay({ date: '2026-08-31', meals: [], trainings: [] }, {});
    for (const g of groups) {
      expect(out[g.timestamp]).toBeUndefined();
    }
  });

  it('значение метки не приводится к числу — merge сравнивает как есть', () => {
    const out = M.ensureDay(
      { date: '2026-08-31', steps: 0, stepsUpdatedAt: 1730000000123, meals: [], trainings: [] },
      {},
    );
    expect(out.stepsUpdatedAt).toBe(1730000000123);
  });
});
