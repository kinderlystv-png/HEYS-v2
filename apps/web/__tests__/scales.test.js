import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Шкалы: ступени и role-токены, не legacy-hex. Янтарные тоны — --v4-warn-soft /
// --v4-warn-1 (см. heys_scales_v1.js). Исключение: декор ранга «Эксперт» —
// #eab308 намеренно вне оценочной оси STEPS.

const SCALES_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_scales_v1.js'), 'utf8');

const V4_WARN_SOFT = 'var(--v4-warn-soft, #c9922e)';
const V4_WARN_1 = 'var(--v4-warn-1, #d99a63)';
const v4MixRole = (role, pct) => `color-mix(in srgb, ${role} ${pct}%, transparent)`;

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

// heys_widgets_ui_v1.js:3218 — нейтральная ступень на v4-warn-soft
function expectedStepsWidget(pct) {
  if (pct >= 100) return '#22c55e';
  if (pct >= 70) return '#3b82f6';
  if (pct >= 40) return V4_WARN_SOFT;
  return '#ef4444';
}

// heys_steps_v1.js:1962
function expectedStepsGoal(stepsGoal) {
  return stepsGoal < 7000 ? V4_WARN_SOFT : stepsGoal >= 10000 ? '#22c55e' : '#3b82f6';
}

// heys_steps_v1.js:2111 — умеренный дефицит на v4-warn-1
function expectedDeficit(val) {
  if (val < -10) return { color: '#ef4444', label: 'Агрессивный дефицит', emoji: '🔥🔥' };
  if (val < 0) return { color: V4_WARN_1, label: 'Умеренный дефицит', emoji: '🔥' };
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

// heys_steps_v1.js:3383 — средний стресс на v4-warn-soft
function expectedStress(v) {
  if (v <= 3) return '#10b981';
  if (v <= 5) return '#3b82f6';
  if (v <= 7) return V4_WARN_SOFT;
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
      expect(scales.stepsWidget(pct).color).toBe(expectedStepsWidget(pct));
    }
  });

  it('цель шагов совпадает на границах порогов', () => {
    for (const goal of [3000, 6999, 7000, 9999, 10000, 30000]) {
      expect(scales.stepsGoal(goal).color).toBe(expectedStepsGoal(goal));
    }
  });

  it('дефицит совпадает по цвету, подписи и эмодзи на всём колесе -20..+20', () => {
    for (let v = -20; v <= 20; v += 1) {
      const actual = scales.deficit(v);
      const expected = expectedDeficit(v);
      expect(actual.color).toBe(expected.color);
      expect(actual.label).toBe(expected.label);
      expect(actual.emoji).toBe(expected.emoji);
    }
  });

  it('самочувствие и стресс совпадают на всей шкале 0..10', () => {
    for (let v = 0; v <= 10; v += 1) {
      expect(scales.wellbeing(v).color).toBe(legacyWellbeing(v));
      expect(scales.stress(v).color).toBe(expectedStress(v));
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
    expect(scales.deficit('нет').color).toBe(expectedDeficit(0).color);
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

describe('heys_scales_v1 — этап 3: новые шкалы и colorForStep', () => {
  function expectedTrainingRating(v) {
    if (v <= 3) return '#ef4444';
    if (v <= 5) return V4_WARN_SOFT;
    if (v <= 7) return '#84cc16';
    return '#10b981';
  }

  function expectedHealthScore(s) {
    if (s >= 85) return '#10b981';
    if (s >= 70) return '#22c55e';
    if (s >= 50) return V4_WARN_SOFT;
    if (s >= 30) return V4_WARN_1;
    return '#ef4444';
  }

  it('trainingRating и healthScore сохраняют role-токены и ступени', () => {
    const scales = loadScales();
    for (let v = 0; v <= 10; v += 1) {
      expect(scales.trainingRating(v).color).toBe(v <= 0 ? '#9ca3af' : expectedTrainingRating(v));
      expect(scales.trainingRating(v).step).toBeTruthy();
    }
    for (const s of [0, 29, 30, 49, 50, 69, 70, 84, 85, 100]) {
      expect(scales.healthScore(s).color).toBe(expectedHealthScore(s));
    }
  });

  it('harm возвращает ступень, ранг геймификации — нет', () => {
    const scales = loadScales();
    const harm = scales.harm(6.5);
    expect(harm.id).toBe('harmful');
    expect(harm.step).toBe(scales.STEPS.WARN_STRONG);
    // Ранги — декоративная палитра: жёлтый Эксперт идёт после зелёного
    // Практика. Втиснутые сюда ступени были немонотонны и в теме «Мягкий»
    // покрасили бы Эксперта предупреждением.
    const level = scales.gamificationLevel(12);
    expect(level.title).toBe('Практик');
    expect(level.tone).toBe('rank');
    expect(level.step).toBeUndefined();
    const expert = scales.gamificationLevel(15);
    expect(expert.title).toBe('Эксперт');
    expect(expert.color).toBe('#eab308');
  });

  it('сон без цели не выдаёт зелёный', () => {
    const scales = loadScales();
    // Отличие от классики намеренное: прежний код при target = 0 давал
    // `hours >= target` → зелёный на нулевых данных.
    expect(scales.sleepHours(0, 0).color).toBe('#6b7280');
    expect(scales.sleepHours(8, 8).color).toBe('#22c55e');
  });

  it('macro* шкалы используют v4-warn-1 для янтарной ветки', () => {
    const scales = loadScales();
    expect(scales.macroProtein(50, 100, false).color).toBe('#ef4444');
    expect(scales.macroProtein(85, 100, false).color).toBe(V4_WARN_1);
    expect(scales.macroProtein(100, 100, false).color).toBe('#22c55e');
    expect(scales.macroFat(40, 100).color).toBe('#ef4444');
    expect(scales.macroCarbs(20, 100, true).color).toBe(V4_WARN_1);
  });

  it('macroWidgetValueTone и riskRadarScore используют role-токены', () => {
    const scales = loadScales();
    expect(scales.macroWidgetValueTone(0, 'protein').color).toBe('#ef4444');
    expect(scales.macroWidgetValueTone(50, 'protein').color).toBe('#ef4444');
    expect(scales.macroWidgetValueTone(75, 'protein').color).toBe(V4_WARN_1);
    expect(scales.macroWidgetValueTone(95, 'protein').color).toBe('#16a34a');
    expect(scales.macroWidgetValueTone(80, 'fat').color).toBe('#16a34a');
    expect(scales.macroWidgetValueTone(60, 'carbs').color).toBe(V4_WARN_1);
    expect(scales.macroWidgetValueTone(130, 'carbs').color).toBe('#ef4444');
    expect(scales.riskRadarScore(10).color).toBe('#10b981');
    expect(scales.riskRadarScore(25).color).toBe(V4_WARN_SOFT);
    expect(scales.riskRadarScore(50).color).toBe(V4_WARN_1);
    expect(scales.riskRadarScore(80).color).toBe('#ef4444');
  });

  it('MACRO_GRADIENT_STOPS fat использует color-mix на v4-warn-1', () => {
    const scales = loadScales();
    expect(scales.MACRO_GRADIENT_STOPS.fat[0]).toBe(v4MixRole(V4_WARN_1, 40));
    expect(scales.MACRO_GRADIENT_STOPS.fat[1]).toBe(V4_WARN_1);
  });
});

// Ступени должны читаться одинаково во всех оценочных шкалах: одинаково плохое
// значение обязано давать одинаковый тон, иначе тема «Мягкий» покрасит
// «оценка тренировки 2/10» мягче, чем «качество сна 2/10». Литеральный список
// цветов такую рассинхронизацию не ловит — до этой проверки красный означал
// WARN_SOFT в семи шкалах и WARN_STRONG в четырёх.
describe('heys_scales_v1 — согласованность ступеней между шкалами', () => {
  const RANK = {
    'warn-strong': 0,
    'warn-soft': 1,
    neutral: 2,
    'good-soft': 3,
    'good-strong': 4,
  };

  // from > 0 там, где нижняя ветка означает «нет данных», а не худшую оценку.
  const GRADED = [
    { name: 'stepsWidget', from: 0, to: 150, step: 1, up: true },
    { name: 'wellbeing', from: 0, to: 10, step: 0.5, up: true },
    { name: 'stress', from: 0, to: 10, step: 0.5, up: false },
    { name: 'trainingRating', from: 0.5, to: 10, step: 0.5, up: true },
    { name: 'moodRating', from: 0, to: 10, step: 0.5, up: true },
    { name: 'stressRating', from: 0, to: 10, step: 0.5, up: false },
    // Две верхних краски сна (отлично 8–9 и идеально 10) делят good-strong.
    // Слияние безобидно: обе означают «хорошо», решения пользователя не меняют.
    { name: 'sleepQuality', from: 0.5, to: 10, step: 0.5, up: true, colorsExceedSteps: true },
    { name: 'dayScore10', from: 0.5, to: 10, step: 0.5, up: true },
    { name: 'healthScore', from: 0, to: 100, step: 1, up: true },
    { name: 'waterProgress', from: 0, to: 130, step: 1, up: true },
    { name: 'riskRadarScore', from: 0, to: 100, step: 1, up: false },
    // Вредный, очень вредный и супервредный делят warn-strong намеренно: цвет
    // не различает семь состояний, поэтому три градации живут глубиной внутри
    // одной роли, а точные названия — в подписи (решение владельца 2026-08-10).
    { name: 'harm', from: 0, to: 10, step: 0.1, up: false, colorsExceedSteps: true },
  ];

  function runOf(scales, spec, field) {
    const out = [];
    for (let v = spec.from; v <= spec.to + 1e-9; v += spec.step) {
      const value = scales[spec.name](Number(v.toFixed(3)))[field];
      if (out[out.length - 1] !== value) out.push(value);
    }
    return out;
  }

  const stepRun = (scales, spec) => runOf(scales, spec, 'step');

  it('ступень меняется монотонно', () => {
    const scales = loadScales();
    for (const spec of GRADED) {
      const ranks = stepRun(scales, spec).map((s) => RANK[s]);
      const sorted = [...ranks].sort((a, b) => (spec.up ? a - b : b - a));
      expect(ranks, `${spec.name}: ступени не по порядку`).toEqual(sorted);
    }
  });

  it('каждая краска шкалы получает свою ступень', () => {
    const scales = loadScales();
    for (const spec of GRADED) {
      if (spec.colorsExceedSteps) continue;
      const colors = runOf(scales, spec, 'color');
      const steps = stepRun(scales, spec);
      expect(
        steps.length,
        `${spec.name}: ${colors.length} красок на ${steps.length} ступеней — в теме «Мягкий» соседние состояния сольются`,
      ).toBe(colors.length);
    }
  });

  it('край шкалы — всегда крайняя ступень, а не промежуточная', () => {
    const scales = loadScales();
    for (const spec of GRADED) {
      const run = stepRun(scales, spec);
      const worst = spec.up ? run[0] : run[run.length - 1];
      const best = spec.up ? run[run.length - 1] : run[0];
      expect(worst, `${spec.name}: худшее значение`).toBe('warn-strong');
      expect(best, `${spec.name}: лучшее значение`).toBe('good-strong');
    }
  });
});

// Глубина внутри роли «внимание». Проверять надо по светлоте, а не по имени
// ступени: три градации одного оттенка расходятся незаметно — ошибка вида
// «жёлтый Эксперт после зелёного Практика» здесь не бросается в глаза, потому
// что все три краски и так похожи.
describe('heys_scales_v1 — три градации внимания', () => {
  const PALETTE_CSS = fs.readFileSync(
    path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
    'utf8',
  );

  function readWarnDepths(themeId) {
    const block = PALETTE_CSS.slice(PALETTE_CSS.indexOf(`[data-theme-id="${themeId}"]`));
    const body = block.slice(0, block.indexOf('}'));
    return [1, 2, 3].map((i) => {
      const m = body.match(new RegExp(`--v4-warn-${i}:\\s*(#[0-9a-f]{6})`, 'i'));
      if (!m) throw new Error(`${themeId}: нет --v4-warn-${i}`);
      return m[1].toLowerCase();
    });
  }

  // Воспринимаемая яркость (WCAG relative luminance). HSL-lightness тут врёт:
  // янтарный с L 56% воспринимается светлее розового с L 65%.
  function luminance(hex) {
    const ch = (i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  }

  function hue(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const d = mx - Math.min(r, g, b);
    if (!d) return 0;
    let h;
    if (mx === r) h = 60 * (((g - b) / d) % 6);
    else if (mx === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  }

  // Наборов четыре, а не шесть: каноничная палитра и её тёмная убраны из
  // 002-ui-v4-palette-roles.css 2026-08-24 (канон живёт только на зеркале
  // stable.heyslab.ru, а миграция в heys_theme_v1.js переписывает сохранённое
  // `classic` на `sand` при каждой загрузке). Правило прежнее — оно просто
  // перестало иметь предмет в двух снятых наборах.
  const THEMES = ['sand', 'sand-dark', 'blue', 'blue-dark'];

  it('шкала вреда даёт три градации подряд и только внутри warn-strong', () => {
    const scales = loadScales();
    expect(scales.harm(6.5).depth).toBe(scales.DEPTH.SOFT);
    expect(scales.harm(8.0).depth).toBe(scales.DEPTH.MID);
    expect(scales.harm(9.5).depth).toBe(scales.DEPTH.DEEP);
    for (const v of [0.5, 2, 3.5, 5]) {
      expect(scales.harm(v).step).not.toBe(scales.STEPS.WARN_STRONG);
      expect(scales.harm(v).depth, `вред ${v}: глубина вне warn-strong`).toBeUndefined();
    }
  });

  it('глубина растёт вместе с вредностью, без провалов', () => {
    const scales = loadScales();
    const run = [];
    for (let v = 5.6; v <= 10; v += 0.1) {
      const d = scales.harm(Number(v.toFixed(2))).depth;
      if (run[run.length - 1] !== d) run.push(d);
    }
    expect(run).toEqual([1, 2, 3]);
  });

  it('классический цвет градации совпадает с веткой шкалы', () => {
    const scales = loadScales();
    for (const [value, depth] of [[6.5, 1], [8.0, 2], [9.5, 3]]) {
      expect(scales.colorForStep(scales.STEPS.WARN_STRONG, depth)).toBe(scales.harm(value).color);
    }
    // Без глубины — прежнее поведение, ступень остаётся одноцветной.
    expect(scales.colorForStep(scales.STEPS.WARN_STRONG)).toBe('#dc2626');
  });

  it('в каждой палитре градации темнеют по светлоте, а не по номеру', () => {
    for (const theme of THEMES) {
      const lums = readWarnDepths(theme).map(luminance);
      expect(lums, `${theme}: градации не темнеют`).toEqual([...lums].sort((a, b) => b - a));
      expect(
        lums[0] - lums[2],
        `${theme}: между сдержанной и плотной нет заметной разницы`,
      ).toBeGreaterThan(0.05);
    }
  });

  it('градации держат один оттенок', () => {
    // Разрыв оттенка превращает градации в разные сигналы: янтарная первая
    // ступень синей палитры читалась не как слабый вред, а как другое
    // предупреждение — тем более что янтарный там занят мягким вниманием.
    for (const theme of THEMES) {
      const hues = readWarnDepths(theme).map(hue).map((h) => (h > 180 ? h - 360 : h));
      const spread = Math.max(...hues) - Math.min(...hues);
      expect(spread, `${theme}: оттенок скачет на ${spread.toFixed(0)}°`).toBeLessThanOrEqual(15);
    }
  });
});

// Правило тёмной стороны (решение владельца 2026-08-10). На светлом «сильнее»
// значит темнее: ступень уходит от фона, контраст растёт. На тёмном затемнение,
// наоборот, приближает к фону, и ступень читается не сильнее, а глуше — поэтому
// усиление несёт насыщенность, а контраст к фону при этом падает. Так во всех
// трёх тёмных палитрах одинаково; проверка нужна, чтобы однажды кто-нибудь не
// «починил» одну из них по светлому принципу и не выбил её из ряда.
describe('heys_scales_v1 — градации внимания против фона палитры', () => {
  const PALETTE_CSS = fs.readFileSync(
    path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
    'utf8',
  );

  function role(themeId, name) {
    const block = PALETTE_CSS.slice(PALETTE_CSS.indexOf(`[data-theme-id="${themeId}"]`));
    const body = block.slice(0, block.indexOf('}'));
    const m = body.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
    if (!m) throw new Error(`${themeId}: нет --${name}`);
    return m[1].toLowerCase();
  }

  function luminance(hex) {
    const ch = (i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch(1) + 0.7152 * ch(3) + 0.0722 * ch(5);
  }

  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Каноничная пара снята вместе с палитрой (2026-08-24, см. выше): проверяются
  // те же два правила, но по четырём оставшимся наборам.
  const LIGHT = ['sand', 'blue'];
  const DARK = ['sand-dark', 'blue-dark'];
  const THEME_ALL = [...LIGHT, ...DARK];

  const contrasts = (theme) => {
    const bg = role(theme, 'v4-bg');
    return [1, 2, 3].map((i) => contrast(role(theme, `v4-warn-${i}`), bg));
  };

  it('на светлом усиление уводит от фона — контраст растёт', () => {
    for (const theme of LIGHT) {
      const cs = contrasts(theme);
      expect(cs, `${theme}: контраст не растёт`).toEqual([...cs].sort((a, b) => a - b));
    }
  });

  it('на тёмном усиление несёт насыщенность — контраст падает', () => {
    for (const theme of DARK) {
      const cs = contrasts(theme);
      expect(cs, `${theme}: контраст не падает — палитра починена по светлому принципу`).toEqual(
        [...cs].sort((a, b) => b - a),
      );
    }
  });

  it('плотная ступень не проваливается ниже границы читаемости', () => {
    // Порог 3.35 поставлен по каноничной тёмной (3.38): владелец принял эту
    // величину как допустимую для кружка (2026-08-10). Каноничная пара снята
    // 2026-08-24, и нижняя точка живых наборов теперь выше — синяя тёмная,
    // 3.46. Порог оставлен прежним намеренно: он держит принятую владельцем
    // границу читаемости, а не текущий минимум, и опускать его ниже 3.35
    // по-прежнему должно быть осознанным решением.
    for (const theme of THEME_ALL) {
      const deep = contrasts(theme)[2];
      expect(deep, `${theme}: плотная градация неразличима на фоне`).toBeGreaterThan(3.35);
    }
  });
});
