// ndte-client-public-api.test.js — NDTE на клиенте считается, и считается по
// настройкам клиента.
//
// Две сцепленные дыры, найденные аудитом 2026-08-09
// (docs/implementation/CURATOR_TRAINING_PROGRAM_PROTOCOL_2026-08-09.md,
// «Найдено попутно: NDTE на клиенте мёртв»; todo.md, «Мастер тренировки:
// потеря данных и слепой расчёт»):
//
//  1. `heys_tdee_v1.js` ищет `HEYS.InsulinWave.calculateNDTE` и
//     `.getPreviousDayTrainings` в публичном неймспейсе, а constants вешал их
//     только в `__internals`. Условие молча ложно → `ndteBoost` на клиенте
//     всегда 0, при том что сервер те же функции зовёт через
//     `webMirror.insulinWaveInternals()` и надбавку считает. Норма в приложении
//     и норма у куратора расходились после каждого тренировочного дня.
//  2. Копия `calculateTrainingKcal` внутри constants читала зоны через
//     свободный `lsGet`, которого в области видимости файла нет: MET навсегда
//     оставались код-фолбэком [2.5,6,8,10] против дефолта приложения [2,3,5,8]
//     (`heys_user_v12.js:538-541`) — завышение расхода почти вдвое.
//
// Правки нераздельны: без второй первая просто включила бы NDTE на завышенных
// калориях.

import fs from 'fs';
import path from 'path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

const read = (name) => fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8');
/* eslint-disable no-eval */
const load = (name) => { eval(read(name)); };
/* eslint-enable no-eval */

// Порядок как в scripts/legacy-bundle-config.mjs и в зеркале коннектора:
// shim заводит `__internals`, constants вешает туда NDTE, utils дополняет.
const IW_ORDER = ['heys_iw_shim.js', 'heys_iw_constants.js', 'heys_iw_utils.js'];

// Зоны по умолчанию из настроек приложения (heys_user_v12.js:538-541).
const CLIENT_ZONES = [
  { name: 'Бытовая', hrFrom: 85, hrTo: 99, MET: 2 },
  { name: 'Умеренная', hrFrom: 100, hrTo: 119, MET: 3 },
  { name: 'Аэробная', hrFrom: 120, hrTo: 139, MET: 5 },
  { name: 'Анаэробная', hrFrom: 140, hrTo: 181, MET: 8 },
];

const PROFILE = { weight: 70, height: 175, gender: 'Мужской', age: 36 };
// Силовая из конструктора кладёт все минуты во вторую зону:
// heys_training_step_v1.js:423 → `zoneMinutes: [0, m, 0, 0]`.
const strength = (min) => ({ type: 'strength', time: '10:00', z: [0, min, 0, 0] });

const originalWindow = globalThis.window;
const originalHEYS = globalThis.HEYS;

let IW;
let IWI;
let TDEE;
let storedZones = CLIENT_ZONES;

beforeAll(() => {
  globalThis.window = globalThis;
  globalThis.HEYS = {
    utils: {
      lsGet: (key, def) => (key === 'heys_hr_zones' ? storedZones : def),
      lsSet: () => undefined,
    },
  };
  for (const file of IW_ORDER) load(file);
  load('heys_tdee_v1.js');
  IW = globalThis.HEYS.InsulinWave;
  IWI = IW.__internals;
  TDEE = globalThis.HEYS.TDEE;
});

afterEach(() => {
  storedZones = CLIENT_ZONES;
});

afterAll(() => {
  globalThis.window = originalWindow;
  globalThis.HEYS = originalHEYS;
});

describe('constants публикует NDTE наружу, а не только в __internals', () => {
  it('обе функции доступны в публичном неймспейсе', () => {
    expect(typeof IW.calculateNDTE).toBe('function');
    expect(typeof IW.calculateNDTEDayAverage).toBe('function');
    expect(typeof IW.getPreviousDayTrainings).toBe('function');
  });

  it('это те же ссылки, что в __internals — не вторая копия формулы', () => {
    // Сервер берёт функции через `__internals`
    // (web-mirror/index.js → insulinWaveInternals), клиент — публично. Разойдись
    // они экземплярами, расхождение формул поймать было бы нечем.
    expect(IW.calculateNDTE).toBe(IWI.calculateNDTE);
    expect(IW.calculateNDTEDayAverage).toBe(IWI.calculateNDTEDayAverage);
    expect(IW.getPreviousDayTrainings).toBe(IWI.getPreviousDayTrainings);
  });

  it('__internals продолжает отдавать их серверу', () => {
    expect(typeof IWI.calculateNDTE).toBe('function');
    expect(typeof IWI.calculateNDTEDayAverage).toBe('function');
    expect(typeof IWI.getPreviousDayTrainings).toBe('function');
    expect(typeof IWI.utils.calculateTrainingKcal).toBe('function');
  });
});

describe('calculateTrainingKcal в constants читает зоны клиента', () => {
  // 70 кг, минута во второй зоне = MET × 3.5 × 70 / 200 = MET × 1.225 ккал.
  it('MET берутся из heys_hr_zones, а не из код-фолбэка', () => {
    // 60 мин × 3 MET × 1.225 = 220.5 → 221. На фолбэке [2.5,6,8,10] было бы 441.
    expect(IWI.utils.calculateTrainingKcal(strength(60), 70)).toBe(221);
  });

  it('без сохранённых зон честно падает на код-фолбэк', () => {
    storedZones = null;
    expect(IWI.utils.calculateTrainingKcal(strength(60), 70)).toBe(441);
  });

  it('неполный набор зон — тоже фолбэк, а не половина настроек', () => {
    storedZones = CLIENT_ZONES.slice(0, 3);
    expect(IWI.utils.calculateTrainingKcal(strength(60), 70)).toBe(441);
  });

  it('совпадает с публичным близнецом из heys_iw_utils', () => {
    // Две копии одной формулы; расхождение между ними и было дефектом.
    expect(IWI.utils.calculateTrainingKcal(strength(60), 70))
      .toBe(IW.utils.calculateTrainingKcal(strength(60), 70));
    storedZones = null;
    expect(IWI.utils.calculateTrainingKcal(strength(60), 70))
      .toBe(IW.utils.calculateTrainingKcal(strength(60), 70));
  });
});

describe('порог NDTE 300 ккал на реальных зонах клиента', () => {
  // Осознанное последствие правки: объём вчерашней тренировки перестал
  // завышаться вдвое, поэтому граница порога уехала с 41 минуты силовой на 82.
  // Внешний гейт `>= 200` в heys_tdee_v1.js:246 мёртв — внутренний строже.
  const boostOf = (min) => IWI.calculateNDTE({
    trainingKcal: IWI.utils.calculateTrainingKcal(strength(min), 70),
    hoursSince: 10,
    bmi: 22,
    trainingType: 'strength',
    trainingsCount: 1,
  });

  it('41 минута силовой порог больше не проходит', () => {
    expect(IWI.utils.calculateTrainingKcal(strength(41), 70)).toBe(151);
    expect(boostOf(41).active).toBe(false);
    expect(boostOf(41).tdeeBoost).toBe(0);
  });

  it('81 минута — всё ещё ниже порога, 82 — уже выше', () => {
    expect(IWI.utils.calculateTrainingKcal(strength(81), 70)).toBe(298);
    expect(boostOf(81).active).toBe(false);
    expect(IWI.utils.calculateTrainingKcal(strength(82), 70)).toBe(301);
    expect(boostOf(82).active).toBe(true);
    expect(boostOf(82).tdeeBoost).toBeGreaterThan(0);
  });

  it('на код-фолбэке порог проходился уже с 41 минуты — так было до правки', () => {
    // Страховка от «починили в другую сторону»: числа завышенной ветки
    // зафиксированы, чтобы возврат к ней был виден.
    storedZones = null;
    expect(IWI.utils.calculateTrainingKcal(strength(40), 70)).toBe(294);
    expect(boostOf(40).active).toBe(false);
    expect(IWI.utils.calculateTrainingKcal(strength(41), 70)).toBe(301);
    expect(boostOf(41).active).toBe(true);
  });
});

describe('HEYS.TDEE.calculate доходит до NDTE через публичный неймспейс', () => {
  const YESTERDAY = '2026-08-08';
  const TODAY = '2026-08-09';
  // Вчера — силовая, которая проходит порог и на зонах клиента (120 мин = 441).
  const prevDay = { trainings: [strength(120)] };
  const lsGet = (key, def) => {
    if (key === 'heys_hr_zones') return storedZones || def;
    if (key === `heys_dayv2_${YESTERDAY}`) return prevDay;
    return def === undefined ? null : def;
  };

  it('надбавка за вчерашнюю тренировку больше не ноль', () => {
    const result = TDEE.calculate({ date: TODAY, trainings: [] }, PROFILE, { lsGet });
    expect(result.ndteBoost).toBeGreaterThan(0);
    expect(result.ndteData.active).toBe(true);
    // Надбавка входит в базу, от которой считается норма.
    expect(result.baseExpenditure).toBe(result.bmr + result.actTotal + result.ndteBoost);
  });

  it('includeNDTE: false по-прежнему гасит путь — им пользуется сервер', () => {
    const off = TDEE.calculate({ date: TODAY, trainings: [] }, PROFILE, { lsGet, includeNDTE: false });
    expect(off.ndteBoost).toBe(0);
  });

  it('день без вчерашней тренировки надбавки не получает', () => {
    const empty = TDEE.calculate({ date: TODAY, trainings: [] }, PROFILE, {
      lsGet: (key, def) => (key === 'heys_hr_zones' ? CLIENT_ZONES : (def === undefined ? null : def)),
    });
    expect(empty.ndteBoost).toBe(0);
  });

  it('клиент считает надбавку средним буста за HEYS-день, как сервер', () => {
    const client = TDEE.calculate({ date: TODAY, trainings: [] }, PROFILE, { lsGet });
    const prev = IWI.getPreviousDayTrainings(TODAY, lsGet);

    const heightM = PROFILE.height / 100;
    const ndte = IWI.calculateNDTEDayAverage({
      trainingKcal: prev.totalKcal,
      bmi: Math.round(PROFILE.weight / (heightM * heightM) * 10) / 10,
      trainingType: prev.dominantType || 'cardio',
      trainingsCount: prev.trainings.length,
      dayDate: TODAY,
      prevDate: prev.prevDate,
      trainingTime: prev.anchorTime,
    });
    const serverBoost = Math.round(client.bmr * ndte.tdeeBoost);

    expect(prev.totalKcal).toBeGreaterThanOrEqual(300);
    expect(client.ndteBoost).toBe(serverBoost);
  });
});

describe('мгновенный calculateNDTE для волны не усредняет и держит окно 48ч', () => {
  it('на 48 часах буст уже ноль, на 10 — нет', () => {
    const live = IWI.calculateNDTE({
      trainingKcal: 500,
      hoursSince: 10,
      bmi: 22,
      trainingType: 'cardio',
      trainingsCount: 1,
    });
    const expired = IWI.calculateNDTE({
      trainingKcal: 500,
      hoursSince: 48,
      bmi: 22,
      trainingType: 'cardio',
      trainingsCount: 1,
    });
    expect(live.active).toBe(true);
    expect(live.tdeeBoost).toBeGreaterThan(0);
    expect(expired.active).toBe(false);
    expect(expired.tdeeBoost).toBe(0);
  });
});
