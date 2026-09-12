/**
 * Норма воды не должна зависеть от того, каким путём экран прочитал профиль.
 *
 * В хранилище лежит сырой профиль: пол там только в `gender` («Мужской» /
 * «Женский»), а `age` — снимок на момент заполнения, который никто не
 * обновляет. Поля `sex` в хранилище нет вообще: его заводит нормализатор
 * HEYS.utils.getProfile(), он же пересчитывает возраст из даты рождения.
 *
 * Вкладка «Питание» читает профиль через нормализатор, плитка Главной и
 * геймификация — напрямую из хранилища. Пока расчёт нормы смотрел только на
 * `sex` и `age`, сырой профиль молча давал мужской коэффициент 30 вместо 28 и
 * устаревший возраст: на двух экранах одного человека норма расходилась —
 * у женщины 62 лет 2,0 л на Главной против 1,6 л в «Питании».
 */

import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');

const originalHEYS = global.HEYS;
const originalWindow = global.window;

/** Возраст из даты рождения — тем же способом, что HEYS.TDEE.ageFromProfile. */
function ageFromProfile(p) {
  const birthDate = (p && p.birthDate) || '';
  if (birthDate) {
    const birth = new Date(birthDate);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const monthDiff = now.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age -= 1;
      if (age >= 0 && age < 150) return age;
    }
  }
  return +(p && p.age) || 30;
}

function loadWaterState(heysSeed = {}) {
  global.window = global;
  global.HEYS = { TDEE: { ageFromProfile }, ...heysSeed };
  // eslint-disable-next-line no-new-func
  new Function(read('heys_day_water_state.js'))();
  return global.HEYS.dayWaterState;
}

/**
 * Настоящий нормализатор профиля из heys_day_utils.js — тот самый слой, через
 * который «Питание» видит `sex` и свежий возраст. Берём его, а не свою копию:
 * иначе тест сверял бы фикстуру с фикстурой.
 */
function loadProfileNormalizer(storedProfile) {
  global.window = global;
  global.HEYS = {
    TDEE: { ageFromProfile },
    currentClientId: '11111111-1111-4111-8111-111111111111',
    store: { get: (key, def) => (key === 'heys_profile' ? storedProfile : def) },
    utils: { lsGet: (key, def) => (key === 'heys_profile' ? storedProfile : def) },
  };
  // eslint-disable-next-line no-new-func
  new Function(read('heys_day_utils.js'))();
  return global.HEYS.dayUtils.getProfile();
}

// Профиль ровно в том виде, в каком его пишет редактор: `gender` по-русски,
// `age` протухший, `sex` отсутствует.
const STORED_WOMAN_62 = {
  weight: 65, height: 160, gender: 'Женский', birthDate: '1964-01-01', age: 30, sleepHours: 8,
};
const STORED_MAN_42 = {
  weight: 74, height: 178, gender: 'Мужской', birthDate: '1984-03-10', age: 30, sleepHours: 8,
};

const QUIET_DAY = { date: '2026-09-12', waterMl: 0, steps: 0, trainings: [] };

afterEach(() => {
  global.HEYS = originalHEYS;
  global.window = originalWindow;
});

describe('норма воды — сырой профиль и нормализованный сходятся', () => {
  for (const [label, stored] of Object.entries({
    'женщина 62 лет': STORED_WOMAN_62,
    'мужчина 42 лет': STORED_MAN_42,
  })) {
    it(`${label}: Главная и «Питание» показывают одно число`, () => {
      const normalized = loadProfileNormalizer(stored);
      const water = loadWaterState();

      const glavnaya = water.computeWaterGoal({ day: QUIET_DAY, profile: stored });
      const pitanie = water.computeWaterGoal({ day: QUIET_DAY, profile: normalized });

      expect(glavnaya).toBe(pitanie);
    });
  }

  it('пол берётся из «Женский», а не только из sex: коэффициент 28', () => {
    const water = loadWaterState();
    const stored = water.computeWaterGoalBreakdown({ day: QUIET_DAY, profile: STORED_WOMAN_62 });
    expect(stored.coef).toBe(28);
  });

  it('мужской профиль и профиль без пола остаются на 30', () => {
    const water = loadWaterState();
    expect(water.computeWaterGoalBreakdown({ day: QUIET_DAY, profile: STORED_MAN_42 }).coef).toBe(30);
    expect(water.computeWaterGoalBreakdown({ day: QUIET_DAY, profile: { weight: 80 } }).coef).toBe(30);
  });

  it('возраст считается от даты рождения, а не от протухшего поля age', () => {
    const water = loadWaterState();
    // В профиле age: 30 (не даёт скидки), дата рождения — 62 года (−10 %).
    const breakdown = water.computeWaterGoalBreakdown({ day: QUIET_DAY, profile: STORED_WOMAN_62 });
    expect(breakdown.ageFactor).toBe(0.9);
    expect(breakdown.ageNote).toBe('−10% (60+)');
  });

  it('без даты рождения возраст берётся из age — прежнее поведение цело', () => {
    const water = loadWaterState();
    const breakdown = water.computeWaterGoalBreakdown({
      day: QUIET_DAY,
      profile: { weight: 80, age: 45 },
    });
    expect(breakdown.ageFactor).toBe(0.95);
  });

  it('пересчёт нормы следит за gender и birthDate, а не только за sex/age', () => {
    // Ключ useMemo в useWaterState: у сырого профиля пол и возраст лежат только
    // в этих двух полях, и без них плитка показывала бы норму от старых данных.
    const src = read('heys_day_water_state.js');
    const memoKey = src.slice(src.indexOf('const waterGoalBreakdown'), src.indexOf('const waterGoal ='));
    expect(memoKey).toContain('safeProf.gender');
    expect(memoKey).toContain('safeProf.birthDate');
  });
});

describe('геймификация — норма воды из профиля, а не 2000 для всех', () => {
  it('getWaterGoalForDay не разбирает JSON поверх готового объекта', () => {
    // readStoredValue отдаёт уже разобранный объект. JSON.parse поверх объекта
    // приводил его к «[object Object]» и всегда бросал: исключение уносило
    // управление в catch, мимо и единого расчёта, и запасного «вес × 30», —
    // миссия дня и достижение «water_master» сверялись с 2000 мл у каждого.
    const src = read('heys_gamification_v1.js');
    const start = src.indexOf('function getWaterGoalForDay()');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('}', src.indexOf('return 2000')));
    expect(body).not.toMatch(/JSON\.parse\s*\(\s*profile/);
    expect(body).toContain("readStoredValue('heys_profile'");
  });

  it('норма для миссии зависит от профиля: женщина 62 — не 2000', () => {
    const water = loadWaterState();
    const goal = water.computeWaterGoal({ day: QUIET_DAY, profile: STORED_WOMAN_62 });
    expect(goal).toBeLessThan(2000);
    expect(goal).toBeGreaterThanOrEqual(1500);
  });
});
