// activity-zero-and-calendar-grid.test.js — три мелких долга сведения «Актива».
//
// Каждый по отдельности выглядит косметикой, но все три меняют то, как экран
// читается:
//
//   • ноль шагов стоял обычным тоном — число выглядело значащим, хотя за ним
//     ничего нет (кадр «новый человек» приглушает всю запись до 38 %);
//   • сетка календаря шла в две строки по 14 дней, и неделя не читалась вовсе
//     (кадр даёт 7 колонок, то есть вертикаль = недели);
//   • подпись пункта в листе действия была на полкегля легче кадра.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');

const CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/731-ui-v4-activity.css'), 'utf8',
);
const ACTIVITY_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_day_activity_v1.js'), 'utf8');

function rule(selector) {
  const at = CSS.indexOf(selector + ' {');
  expect(at, selector).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

/** Позиция правила в файле — при равной специфичности выигрывает последнее. */
function at(selector) {
  const i = CSS.indexOf(selector + ' {');
  expect(i, selector).toBeGreaterThan(-1);
  return i;
}

describe('Ноль шагов приглушён целиком', () => {
  it('число берёт свой тон, когда факта нет и оценки тоже', () => {
    expect(ACTIVITY_SRC).toContain("activity-v4-steps__value--zero");
    expect(ACTIVITY_SRC).toContain("!stepsEstimated && !(Number(stepsValue) > 0)");
  });

  it('оценка нулём не считается — у неё свой тон', () => {
    // Подставленная медиана — настоящее число, просто не факт: 55 %, не 38 %.
    expect(rule('.activity-v4-steps__value--zero')).toContain('var(--v4-ink-4');
    expect(rule('.activity-v4-steps__value--estimated')).toContain('var(--v4-ink-2');
  });

  it('калории при нуле приглушены вместе с числом', () => {
    expect(ACTIVITY_SRC).toContain('activity-v4-steps__kcal--zero');
    expect(rule('.activity-v4-steps__kcal--zero')).toContain('var(--v4-ink-4');
  });

  it('модификатор стоит после базового правила, иначе он проигрывает', () => {
    // Специфичность равная — решает порядок; на живом экране это уже стоило
    // одного прогона.
    expect(at('.activity-v4-steps__kcal--zero')).toBeGreaterThan(at('.activity-v4-steps__kcal'));
  });
});

describe('Календарь зарядки читается неделями', () => {
  const grid = () => rule('.activity-v4 .ma-habit-cal--activity-v4 .ma-habit-cal-grid--dot');

  it('семь колонок, а не четырнадцать', () => {
    expect(grid()).toContain('repeat(7, minmax(0, 1fr))');
    expect(grid()).not.toContain('repeat(14');
  });

  it('зазор и размер точки — числа кадра', () => {
    expect(grid()).toContain('gap: 9px');
    const cell = rule('.activity-v4 .ma-habit-cal--activity-v4 .ma-habit-cal-grid--dot .ma-habit-cal-cell');
    expect(cell).toContain('width: 9px');
    expect(cell).toContain('height: 9px');
  });

  it('точка не растягивается на колонку, а стоит по центру', () => {
    expect(grid()).toContain('justify-items: center');
    const cell = rule('.activity-v4 .ma-habit-cal--activity-v4 .ma-habit-cal-grid--dot .ma-habit-cal-cell');
    expect(cell).not.toContain('aspect-ratio');
  });
});

describe('Подпись пункта листа действия', () => {
  it('вес и интерлиньяж — числа кадра', () => {
    expect(rule('.activity-v4-sheet__sub')).toContain('font: 600 11px/1 Figtree');
  });
});
