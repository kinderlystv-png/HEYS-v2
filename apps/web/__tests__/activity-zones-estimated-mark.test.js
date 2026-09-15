/**
 * Пометка подставленного распределения по зонам.
 *
 * Строка контракта «минуты по зонам — как показаны» (tab-activity.v4): «в ряду
 * зон стоит подпись „зоны оценены по типу тренировки“ — та же пометка и по тому
 * же правилу, что у оценённых шагов. Названные человеком зоны подписи не
 * получают».
 *
 * Отличить подставленное от названного по самим числам нельзя, поэтому пометка
 * ставится в момент подстановки. Старые записи, где зоны подставили до этой
 * правки, пометки не получат: додумывать за них — врать, а показать «оценка»
 * там, где её мог задать человек, хуже, чем не показать.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const CALC_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_calculations.js'), 'utf8');
const TRAININGS_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_trainings_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

function loadCalculations() {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  eval(CALC_SRC);
  return window.HEYS.dayCalculations;
}

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = CSS.match(new RegExp(`^[ \\t]*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`нет правила «${selector}»`);
  return match[1];
}

afterEach(() => {
  delete window.HEYS;
});

describe('пометка оценённых зон', () => {
  it('подставленное распределение помечается в момент подстановки', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBe(true);
    expect(training.z).toEqual([0, 36, 24, 0]);
  });

  it('названные человеком зоны пометки не получают', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        z: [0, 20, 40, 0],
        workoutLog: { totalDurationMinutes: 60, exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBeUndefined();
  });

  it('зоны из журнала конструктора — тоже названные, а не оценка', () => {
    const { normalizeTrainings } = loadCalculations();
    const [training] = normalizeTrainings([
      {
        type: 'strength',
        strengthEntryMode: 'workout_builder',
        workoutLog: { totalDurationMinutes: 60, zoneMinutes: [0, 25, 35, 0], exercises: [] },
      },
    ]);
    expect(training.zonesEstimated).toBeUndefined();
    expect(training.z).toEqual([0, 25, 35, 0]);
  });

  it('подпись стоит в ряду зон и только при пометке', () => {
    expect(TRAININGS_SRC).toContain('T.zonesEstimated && React.createElement');
    expect(TRAININGS_SRC).toContain('зоны оценены по типу тренировки');
  });

  it('кегль и тон подписи — как в контракте', () => {
    const body = rule('.compact-train-zones-estimated');
    expect(body).toMatch(/font:\s*500 10\.5px\/1\.4/);
    // Правка дизайнера 15 сентября по замеру: подпись стоит отдельной строкой
    // под списком, соседа по строке у неё нет, и ink-3 даёт 3,28 при пороге 4,5.
    expect(body).toContain('var(--v4-ink-2');
    expect(body).not.toContain('var(--v4-ink-3');
  });

  it('подпись стоит под списком своей строкой', () => {
    expect(rule('.compact-train-zones-estimated')).toMatch(/padding:\s*8px 0 2px/);
  });

  it('ряд зон живёт внутри раскрытой карточки тренировки', () => {
    // Не отдельной карточкой на «Активе»: минуты по зонам — свойство одной
    // тренировки, а не дня, и при двух тренировках отдельная карточка
    // потребовала бы либо сложить зоны в сумму, либо показать два ряда без имён.
    expect(TRAININGS_SRC).toContain("className: 'compact-train-zones'");
    expect(TRAININGS_SRC).toContain('foldedContentEl');
  });

  it('зоны 1 в ряду нет, а зоны 2–4 названы словами контракта', () => {
    // Разминочный пульс в зонах продукта не учитывается — счёт начинается со
    // второй, тем же правилом, по которому подстановка делит минуты 60/40.
    expect(TRAININGS_SRC).toContain('const ZONE_ROW_INDEXES = [1, 2, 3]');
    expect(TRAININGS_SRC).toContain("'Зона 2 · лёгкая'");
    expect(TRAININGS_SRC).toContain("'Зона 3 · средняя'");
    expect(TRAININGS_SRC).toContain("'Зона 4 · тяжёлая'");
    expect(TRAININGS_SRC).not.toContain("'Зона 1");
  });

  it('пустая зона в ряд не попадает — как в обоих кадрах', () => {
    // Кадр «оценены по типу» показывает две строки из трёх, «названы человеком»
    // — три: строка есть там, где есть минуты.
    expect(TRAININGS_SRC).toContain('ZONE_ROW_INDEXES.filter((zi) => +T.z[zi] > 0)');
  });

  it('нажимаемая строка держит 44 видимой высотой', () => {
    // Тап по строке открывает разбор ккал этой зоны — он жил на пилюлях, и без
    // ряда ему негде быть. Кадр даёт строке около 38; 44 добираются видимой
    // высотой, а не прозрачным припуском: в этой зоне припусков нет ни у одной
    // цели. Отступление названо здесь и в CSS.
    const body = rule('.compact-train-zones__row');
    expect(body).toMatch(/min-height:\s*44px/);
    expect(body).toMatch(/padding:\s*13px 0/);
    expect(CSS).not.toContain('.compact-train-zones__row::after');
  });

  it('имя зоны и минуты — кегль и тон контракта', () => {
    expect(rule('.compact-train-zones__name')).toMatch(/font:\s*500 12px\/1/);
    expect(rule('.compact-train-zones__name')).toContain('var(--v4-ink-2');
    expect(rule('.compact-train-zones__value')).toMatch(/font:\s*600 12\.5px\/1/);
    expect(rule('.compact-train-zones__value')).toContain('var(--v4-ink');
    expect(rule('.compact-train-zones__value')).toContain('tabular-nums');
  });
});
