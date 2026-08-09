import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Эквивалентность важнее покрытия: модуль heys_scales_v1.js собирает шкалы,
// которые раньше были литералами в четырёх файлах. Ниже — точные копии
// прежних реализаций; тест доказывает, что цвет не поехал ни на одном
// значении диапазона. Если шкалу меняют осознанно, эталон правится тем же
// коммитом.

const SCALES_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_scales_v1.js'), 'utf8');

const originalHEYS = global.HEYS;
const originalWindow = global.window;

function loadScales(heysSeed = {}) {
  global.window = global;
  global.HEYS = { ...heysSeed };
  // eslint-disable-next-line no-new-func
  new Function(SCALES_SRC)();
  return global.HEYS.scales;
}

afterEach(() => {
  global.HEYS = originalHEYS;
  global.window = originalWindow;
});

// ─── Эталоны: код «как было» ─────────────────────────────────────────────

// heys_day_steps_ui.js:60
function legacyStepsProgress(pct) {
  if (pct < 30) {
    const t = pct / 30;
    const r = Math.round(239 - t * (239 - 234));
    const g = Math.round(68 + t * (179 - 68));
    const b = Math.round(68 - t * (68 - 8));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const t = (pct - 30) / 70;
  const r = Math.round(234 - t * (234 - 34));
  const g = Math.round(179 + t * (197 - 179));
  const b = Math.round(8 + t * (94 - 8));
  return `rgb(${r}, ${g}, ${b})`;
}

// heys_widgets_ui_v1.js:3218
function legacyStepsWidget(pct) {
  if (pct >= 100) return '#22c55e';
  if (pct >= 70) return '#3b82f6';
  if (pct >= 40) return '#eab308';
  return '#ef4444';
}

// heys_steps_v1.js:1962
function legacyStepsGoal(stepsGoal) {
  return stepsGoal < 7000 ? '#eab308' : stepsGoal >= 10000 ? '#22c55e' : '#3b82f6';
}

// heys_steps_v1.js:2111
function legacyDeficit(val) {
  if (val < -10) return { color: '#ef4444', label: 'Агрессивный дефицит', emoji: '🔥🔥' };
  if (val < 0) return { color: '#f97316', label: 'Умеренный дефицит', emoji: '🔥' };
  if (val === 0) return { color: '#22c55e', label: 'Поддержание веса', emoji: '⚖️' };
  if (val <= 10) return { color: '#3b82f6', label: 'Умеренный профицит', emoji: '💪' };
  return { color: '#3b82f6', label: 'Агрессивный набор', emoji: '💪💪' };
}

// heys_steps_v1.js:3375
function legacyWellbeing(v) {
  if (v <= 3) return '#ef4444';
  if (v <= 5) return '#3b82f6';
  if (v <= 7) return '#22c55e';
  return '#10b981';
}

// heys_steps_v1.js:3383
function legacyStress(v) {
  if (v <= 3) return '#10b981';
  if (v <= 5) return '#3b82f6';
  if (v <= 7) return '#eab308';
  return '#ef4444';
}

// ─── Тесты ───────────────────────────────────────────────────────────────

describe('heys_scales_v1 — эквивалентность прежним реализациям', () => {
  let scales;

  beforeEach(() => {
    scales = loadScales();
  });

  it('прогресс шагов совпадает на всём диапазоне 0..100', () => {
    for (let pct = 0; pct <= 100; pct += 1) {
      expect(scales.stepsProgress(pct).color).toBe(legacyStepsProgress(pct));
    }
  });

  it('прогресс шагов совпадает на дробных значениях', () => {
    for (const pct of [0.5, 12.3, 29.9, 30.1, 66.6, 99.9]) {
      expect(scales.stepsProgress(pct).color).toBe(legacyStepsProgress(pct));
    }
  });

  it('шаги в виджете совпадают на границах порогов', () => {
    for (const pct of [0, 39, 40, 69, 70, 99, 100, 150]) {
      expect(scales.stepsWidget(pct).color).toBe(legacyStepsWidget(pct));
    }
  });

  it('цель шагов совпадает на границах порогов', () => {
    for (const goal of [3000, 6999, 7000, 9999, 10000, 30000]) {
      expect(scales.stepsGoal(goal).color).toBe(legacyStepsGoal(goal));
    }
  });

  it('дефицит совпадает по цвету, подписи и эмодзи на всём колесе -20..+20', () => {
    for (let v = -20; v <= 20; v += 1) {
      const actual = scales.deficit(v);
      const expected = legacyDeficit(v);
      expect(actual.color).toBe(expected.color);
      expect(actual.label).toBe(expected.label);
      expect(actual.emoji).toBe(expected.emoji);
    }
  });

  it('самочувствие и стресс совпадают на всей шкале 0..10', () => {
    for (let v = 0; v <= 10; v += 1) {
      expect(scales.wellbeing(v).color).toBe(legacyWellbeing(v));
      expect(scales.stress(v).color).toBe(legacyStress(v));
    }
  });
});

describe('heys_scales_v1 — семантические ступени', () => {
  it('каждая шкала возвращает ступень из общего словаря', () => {
    const scales = loadScales();
    const known = Object.values(scales.STEPS);
    const probes = [
      ['steps_progress', 55],
      ['steps_widget', 55],
      ['steps_goal', 8000],
      ['deficit', -5],
      ['wellbeing', 6],
      ['stress', 6],
    ];
    for (const [id, value] of probes) {
      expect(known).toContain(scales.resolve(id, value).step);
    }
  });

  it('перевыполненные шаги и отличное самочувствие дают верхнюю ступень', () => {
    const scales = loadScales();
    expect(scales.stepsProgress(120).step).toBe(scales.STEPS.GOOD_STRONG);
    expect(scales.wellbeing(9).step).toBe(scales.STEPS.GOOD_STRONG);
    expect(scales.stress(1).step).toBe(scales.STEPS.GOOD_STRONG);
  });
});

describe('heys_scales_v1 — шкала калорий делегирует в ratioZones', () => {
  it('без ratioZones возвращает null, а не выдуманный цвет', () => {
    const scales = loadScales();
    expect(scales.ratio(0.95)).toBeNull();
  });

  it('берёт цвет и зону из настроек пользователя, не из своей копии', () => {
    const scales = loadScales({
      ratioZones: {
        getZone: () => ({ id: 'perfect', color: '#123456', textColor: '#fff' }),
      },
    });
    const result = scales.ratio(1.0);
    expect(result.color).toBe('#123456');
    expect(result.zone).toBe('perfect');
    expect(result.step).toBe(scales.STEPS.GOOD_STRONG);
  });
});

describe('heys_scales_v1 — устойчивость к мусору', () => {
  it('нечисловое значение не роняет шкалу', () => {
    const scales = loadScales();
    expect(scales.stepsProgress(undefined).color).toBe(legacyStepsProgress(0));
    expect(scales.wellbeing(null).color).toBe(legacyWellbeing(0));
    expect(scales.deficit('нет').color).toBe(legacyDeficit(0).color);
  });

  it('неизвестная шкала возвращает null', () => {
    const scales = loadScales();
    expect(scales.resolve('нет такой', 1)).toBeNull();
    expect(scales.color('нет такой', 1)).toBeNull();
  });
});

// Ступени — контракт для темы «Мягкий»: цвет там берётся из ступени, а не из
// литерала. Ошибка в разметке глазами не видна (сейчас ступень нигде не
// показывается), но в новой теме сольёт разные состояния в один тон.
describe('heys_scales_v1 — монотонность ступеней', () => {
  const RANK = {
    WARN_STRONG: 0,
    WARN_SOFT: 1,
    NEUTRAL: 2,
    GOOD_SOFT: 3,
    GOOD_STRONG: 4,
  };

  const rank = (scales, step) => {
    const name = Object.keys(scales.STEPS).find((k) => scales.STEPS[k] === step);
    return RANK[name];
  };

  it('чем выше цель по шагам, тем выше ступень', () => {
    const scales = loadScales();
    const ranks = [5000, 8000, 12000].map((v) => rank(scales, scales.stepsGoal(v).step));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(3);
  });

  it('чем выше процент шагов, тем выше ступень', () => {
    const scales = loadScales();
    for (const fn of ['stepsProgress', 'stepsWidget']) {
      const ranks = [10, 50, 80, 110].map((v) => rank(scales, scales[fn](v).step));
      expect(ranks, fn).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it('чем лучше самочувствие, тем выше ступень; со стрессом наоборот', () => {
    const scales = loadScales();
    const wb = [2, 4, 6, 9].map((v) => rank(scales, scales.wellbeing(v).step));
    expect(wb).toEqual([...wb].sort((a, b) => a - b));
    const st = [2, 4, 6, 9].map((v) => rank(scales, scales.stress(v).step));
    expect(st).toEqual([...st].sort((a, b) => b - a));
  });

  it('отклонение от плана в обе стороны ухудшает ступень симметрично', () => {
    const scales = loadScales();
    expect(rank(scales, scales.deficit(0).step)).toBe(RANK.NEUTRAL);
    expect(rank(scales, scales.deficit(-5).step)).toBe(rank(scales, scales.deficit(5).step));
    expect(rank(scales, scales.deficit(-20).step)).toBe(rank(scales, scales.deficit(20).step));
    expect(rank(scales, scales.deficit(-20).step)).toBeLessThan(rank(scales, scales.deficit(-5).step));
  });
});
