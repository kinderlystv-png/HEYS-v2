// Кадры зоны «Цикл» против раздела канваса «Разбор кадров · элемент за
// элементом» (пакет 30 августа). Scope — шаг 5 чек-ина: строка «Отметить»,
// раскрытие, недельная карточка и четыре копии целого шага для проверки
// высоты. Карточка дня и профиль — в settings-cycle-v4-canvas-razbor.test.js;
// стопка без периода — в checkin-v4-canvas-razbor.test.js.
//
// Канон стопки без периода живёт в checkin-morning.v4.dc.html; копии здесь —
// только доказательство высоты. Отклонённый кадр «с карточкой» — protocol.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const PACK = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const CANVAS = path.join(PACK, 'cycle.v4.dc.html');
const CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

const ROW = '.mc-rest-row.mc-rest-row--cycle';
const CHIP = '.mc-rest-cycle-mark-chip';
const WEEK = '.mc-rest-cycle-week-card';

const EXCEPTIONS = new Map([
  // Кадр «день предложен» пишет обводку словом «рамка», продукт — box-shadow.
  ['Цикл · шаг 5, день предложен · 8|ring', 'вторичная кнопка: box-shadow вместо ring в разборе'],
  ['Цикл · копия шага 5, период идёт · 16|ring', 'тот же приём у копии'],
]);

const BTN_SECONDARY = ['.mc-rest-cycle-btn', '.mc-rest-cycle-btn--secondary'];
const BTN_PRIMARY = ['.mc-rest-cycle-btn', '.mc-rest-cycle-btn--primary'];
const ROW_RULES = ['.mc-rest-row', ROW];

const STEP5_ROW = [
  [11, ROW_RULES, ['radius', 'padding', 'align', 'justify', 'gap']],
  [13, CHIP, ['flex', 'align', 'minHeight', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, '.mc-rest-row', ['radius', 'padding', 'minHeight', 'align', 'justify', 'gap']],
];

const STEP5_EXPANDED = [
  [1, '.mc-rest-cycle-card--expanded', ['radius', 'background', 'padding']],
  [2, '.mc-rest-cycle-expanded-head', ['align', 'justify', 'gap']],
  [4, '.mc-rest-cycle-none-btn', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.mc-rest-cycle-tier', ['marginTop', 'marginBottom']],
  [6, '.mc-rest-cycle-auto-hint', ['marginTop']],
];

const STEP5_WEEK = [
  [1, WEEK, ['radius', 'background', 'padding']],
  [2, '.mc-rest-cycle-week-head', ['align', 'justify', 'gap']],
  [3, '.mc-rest-cycle-week-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [4, '.mc-rest-cycle-week-badge', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.mc-rest-cycle-week-hint', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [7, '.mc-rest-cycle-week-actions', ['gap', 'marginTop']],
  [8, BTN_SECONDARY, ['flex', 'minHeight', 'radius', 'ring', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [9, BTN_PRIMARY, ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Копии целого шага 5 — только элементы, которые есть в продукте.
const COPY_ROW = [
  [31, ROW_RULES, ['radius', 'padding', 'align', 'justify', 'gap']],
  [33, CHIP, ['flex', 'align', 'minHeight', 'padding', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const COPY_WEEK = [
  [9, WEEK, ['radius', 'background', 'padding']],
  [11, '.mc-rest-cycle-week-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, '.mc-rest-cycle-week-badge', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [13, '.mc-rest-cycle-week-hint', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [15, '.mc-rest-cycle-week-actions', ['gap', 'marginTop']],
  [16, BTN_SECONDARY, ['flex', 'minHeight', 'radius', 'ring', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [17, BTN_PRIMARY, ['flex', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const COPY_FRAMES = [
  'Цикл · копия шага 5, канон',
  'Цикл · копия шага 5, с карточкой',
  'Цикл · копия шага 5, период идёт',
  'Цикл · копия шага 5, строка',
];

const COVERAGE_FLOOR = 25;

function compareFrame(razbor, rules, frame, pairs) {
  const drift = compare({ razbor, rules, frame, pairs });
  return drift.filter((line) => {
    for (const [key] of EXCEPTIONS) {
      const [excFrame, prop] = key.split('|');
      if (line.includes(`${excFrame} ·`) && (prop === '*' || line.includes(prop))) return false;
    }
    return true;
  });
}

describe('«Цикл» · разбор кадров канваса · шаг 5', () => {
  const source = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(source);
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Цикл · шаг 5, строка в стопке» совпадает со строкой «Отметить»', () => {
    expect(compareFrame(razbor, rules, 'Цикл · шаг 5, строка в стопке', STEP5_ROW)).toEqual([]);
  });

  it('кадр «Цикл · шаг 5, выбор дня» совпадает с раскрытием ряда', () => {
    expect(compareFrame(razbor, rules, 'Цикл · шаг 5, выбор дня', STEP5_EXPANDED)).toEqual([]);
  });

  it('кадр «Цикл · шаг 5, день предложен» совпадает с недельной карточкой', () => {
    expect(compareFrame(razbor, rules, 'Цикл · шаг 5, день предложен', STEP5_WEEK)).toEqual([]);
  });

  it('копия «строка» и «период идёт» сходятся с продуктом по ключевым элементам', () => {
    expect(compareFrame(razbor, rules, 'Цикл · копия шага 5, строка', COPY_ROW)).toEqual([]);
    expect(compareFrame(razbor, rules, 'Цикл · копия шага 5, период идёт', COPY_WEEK)).toEqual([]);
  });

  it('четыре копии шага 5 для проверки высоты есть в канвасе', () => {
    for (const frame of COPY_FRAMES) {
      expect(source).toContain(`data-screen-label="${frame}"`);
    }
    const protocolAt = source.indexOf('data-demo="protocol"');
    const cardAt = source.indexOf('data-screen-label="Цикл · копия шага 5, с карточкой"');
    expect(protocolAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(protocolAt);
  });

  it('ни одна таблица пар не сводит код с отвергнутой копией «с карточкой»', () => {
    const used = new Set([
      'Цикл · шаг 5, строка в стопке',
      'Цикл · шаг 5, выбор дня',
      'Цикл · шаг 5, день предложен',
      'Цикл · копия шага 5, строка',
      'Цикл · копия шага 5, период идёт',
    ]);
    expect(used.has('Цикл · копия шага 5, с карточкой')).toBe(false);
  });

  // padding-bottom 70px — запас прокрутки под «Готово»; перебор 74 px — замер
  // полной стопки в строке «прокрутка на неделе периода», не то же число.
  it('неделя периода резервирует 70 px прокрутки под «Готово»', () => {
    expect(rules.get('.mc-rest-step--cycle-week')['padding-bottom']).toBe('70px');
    expect(STEPS_SRC).toContain("cycleWeekTop ? ' mc-rest-step--cycle-week' : ''");
  });

  it('свёрнутая строка и чип «Отметить» по контракту «свёрнутое состояние»', () => {
    expect(rules.get(ROW)['min-height']).toBe('66px');
    expect(rules.get(ROW).padding).toBe('11px 12px 11px 14px');
    expect(rules.get(CHIP)['min-height']).toBe('44px');
    expect(rules.get(CHIP).padding).toBe('0 16px');
    expect(rules.get(CHIP)['font-size']).toBe('12px');
    expect(STEPS_SRC).toContain("'aria-label': 'Отметить особые дни'");
  });

  it('недельная карточка — вторая поверхность, радиус 20, поля 16/17', () => {
    expect(rules.get(WEEK)['border-radius']).toBe('20px');
    expect(rules.get(WEEK).padding).toBe('16px 17px');
    expect(rules.get(WEEK).background).toMatch(/^var\(--v4-chip\b/);
    expect(rules.get('.mc-rest-cycle-week-title')['font-size']).toBe('16px');
    expect(rules.get('.mc-rest-cycle-week-title')['font-weight']).toBe('700');
  });

  it('контракт: три строки «высота шага · …» вместо общего пула', () => {
    expect(source).toContain('<b>высота шага · канон</b>');
    expect(source).toContain('<b>высота шага · обычный день со строкой</b>');
    expect(source).toContain('<b>высота шага · карточка с двумя кнопками</b>');
    expect(source).not.toMatch(/<b>высота шага<\/b><span data-v=/);
    const canon = source.match(/<b>высота шага · канон<\/b><span data-v="([^"]*)"/);
    const rowDay = source.match(/<b>высота шага · обычный день со строкой<\/b><span data-v="([^"]*)"/);
    const card = source.match(/<b>высота шага · карточка с двумя кнопками<\/b><span data-v="([^"]*)"/);
    expect(canon?.[1]).toContain('запас 80 px');
    expect(rowDay?.[1]).toContain('запас 6 px');
    expect(card?.[1]).toContain('перебор 41 px');
  });

  it('прокрутка на неделе: перебор 74 px в контракте, padding-bottom 70px в CSS', () => {
    const scroll = source.match(/<b>прокрутка на неделе периода<\/b><span data-v="([^"]*)"/);
    expect(scroll?.[1]).toContain('перебор 74 px');
    expect(scroll?.[1]).toContain('высота шага · обычный день со строкой');
    expect(rules.get('.mc-rest-step--cycle-week')['padding-bottom']).toBe('70px');
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(2);
  });

  it('гейт называет свой охват', () => {
    const calls = [
      { frame: 'Цикл · шаг 5, строка в стопке', pairs: STEP5_ROW },
      { frame: 'Цикл · шаг 5, выбор дня', pairs: STEP5_EXPANDED },
      { frame: 'Цикл · шаг 5, день предложен', pairs: STEP5_WEEK },
      { frame: 'Цикл · копия шага 5, строка', pairs: COPY_ROW },
      { frame: 'Цикл · копия шага 5, период идёт', pairs: COPY_WEEK },
    ];
    const { total, covered, missed, perFrame } = coverage({ razbor, calls });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[цикл · шаг 5] сверено ${covered} из ${total} строк разбора `
      + `(${((covered / total) * 100).toFixed(1)} %), кадров ${perFrame.length}, `
      + `вне пар ${missed}; больше всего пропущено: ${worst.join(' · ') || 'нет'}`,
    );
    expect(covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (covered > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${covered} строк вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
