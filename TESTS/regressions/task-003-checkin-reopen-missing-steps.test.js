/**
 * Regression test для TASK-003 follow-up.
 *
 * Bug/UX: после прохождения утреннего чек-ина в сессии ставится per-client/per-day
 * флаг `sessionStorage[heys_morning_checkin_<cid>_<date>]='true'`, который в
 * shouldShowMorningCheckin делал безусловный `return false`. Если данные чек-ина
 * потом пропадали/не докачивались из облака (сон/самочувствие = прочерки), модалка
 * больше не появлялась — флаг маскировал отсутствие данных.
 *
 * Fix:
 *  - coreCheckinDataMissing(mergedDay) — есть ли пропуски core-полей (вес/сон/
 *    качество/настроение). Session-флаг подавляет повтор ТОЛЬКО когда данные на месте.
 *  - getCheckinSteps(..., { requiredOnly: true }) — при переоткрытии для
 *    восстановления показываем только недостающие обязательные шаги, без
 *    опционального хвоста (cold/supplements/routine) и без регистрации.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CID = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const TODAY = '2026-06-10';

let kv; // backing store для HEYS.utils.lsGet

const evalScript = (relativePath) => {
  const filePath = path.resolve(__dirname, relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  // eslint-disable-next-line no-eval
  eval(source);
};

beforeEach(() => {
  if (!globalThis.window) globalThis.window = globalThis;
  window.dispatchEvent = vi.fn();
  window.addEventListener = vi.fn();
  kv = {};
  window.HEYS = {
    currentClientId: CID,
    utils: {
      getCurrentClientId: () => CID,
      lsGet: (k, d) => (Object.prototype.hasOwnProperty.call(kv, k) ? kv[k] : d),
      lsSet: (k, v) => { kv[k] = v; },
    },
    dayUtils: { todayISO: () => TODAY },
    // Профиль заполнен → регистрационные шаги не добавляются
    ProfileSteps: { isProfileIncomplete: () => false },
  };
  evalScript('../../apps/web/heys_morning_checkin_v1.js');
});

const setDay = (day) => { kv[`heys_${CID}_dayv2_${TODAY}`] = { date: TODAY, ...day }; };

describe('TASK-003 follow-up: переоткрытие чек-ина по недостающим шагам', () => {
  it('coreCheckinDataMissing: true при пропуске сна/настроения, false когда всё на месте', () => {
    const missing = window.HEYS.MorningCheckinUtils.coreCheckinDataMissing;
    expect(missing({ weightMorning: 90.9 })).toBe(true); // нет сна/качества/настроения
    expect(missing({
      weightMorning: 90.9, sleepStart: '23:00', sleepEnd: '07:00',
      sleepQuality: 7, moodMorning: 6
    })).toBe(false);
    expect(missing({})).toBe(true);
  });

  it('requiredOnly → только недостающие обязательные шаги, без опционального хвоста', () => {
    setDay({ weightMorning: 90.9 }); // вес есть, сон/настроение нет
    const profile = { stepsGoal: 6000 }; // цель шагов есть → не pending

    const steps = window.HEYS.MorningCheckinUtils.getCheckinSteps(profile, {
      filterCompleted: true,
      requiredOnly: true,
    });

    expect(steps).toEqual(['sleepTime', 'sleepQuality', 'morning_mood']);
    // никакого опционального хвоста / финального шага
    expect(steps).not.toContain('cold_exposure');
    expect(steps).not.toContain('supplements');
    expect(steps).not.toContain('morningRoutine');
    expect(steps).not.toContain('weight'); // уже заполнен
  });

  it('пустые дефолты дня не считаются пройденными шагами сна/настроения', () => {
    setDay({
      weightMorning: 90.9,
      sleepStart: '',
      sleepEnd: '',
      sleepQuality: '',
      moodMorning: 0,
      wellbeingMorning: 0,
      stressMorning: 0,
    });
    const profile = { stepsGoal: 6000 };

    const missing = window.HEYS.MorningCheckinUtils.coreCheckinDataMissing;
    const steps = window.HEYS.MorningCheckinUtils.getCheckinSteps(profile, {
      filterCompleted: true,
      requiredOnly: true,
    });

    expect(missing(kv[`heys_${CID}_dayv2_${TODAY}`])).toBe(true);
    expect(steps).toEqual(['sleepTime', 'sleepQuality', 'morning_mood']);
  });

  it('обычный режим (без requiredOnly) сохраняет опциональный хвост', () => {
    setDay({ weightMorning: 90.9 });
    const profile = { stepsGoal: 6000 };

    const steps = window.HEYS.MorningCheckinUtils.getCheckinSteps(profile, {
      filterCompleted: true,
    });

    expect(steps).toEqual(expect.arrayContaining(['sleepTime', 'sleepQuality', 'morning_mood']));
    // хвост на месте
    expect(steps).toEqual(expect.arrayContaining(['cold_exposure', 'supplements', 'morningRoutine']));
    expect(steps).not.toContain('weight'); // заполнен → отфильтрован
  });

  it('requiredOnly включает stepsGoal, если цель шагов не задана', () => {
    setDay({
      weightMorning: 90.9, sleepStart: '23:00', sleepEnd: '07:00',
      sleepQuality: 7, moodMorning: 6
    });
    const profile = {}; // stepsGoal не задан

    const steps = window.HEYS.MorningCheckinUtils.getCheckinSteps(profile, {
      filterCompleted: true,
      requiredOnly: true,
    });

    expect(steps).toEqual(['stepsGoal']);
  });
});
