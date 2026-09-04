// Геометрия food-meal против кадров data-demo="stop" / разбора канваса
// food-meal.v4.dc.html на 375 px.
//
// Канвас пишет числа инлайном в разделе «Разбор кадров», поэтому сверка идёт
// через razbor-пары «метка кадра · NN → класс продукта» — тот же приём, что
// food-meal-day-list-canvas-geometry.test.js.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/food-meal.v4.dc.html',
);
const CSS = [
  path.resolve(__dirname, '../styles/modules/610-aps-meal-flow.css'),
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
].map((file) => fs.readFileSync(file, 'utf8')).join('\n');

const TIME_STEP = 'Добавление · время и тип';
const TIME_EDIT = 'Приём · время и тип';
const HOW_ADD = 'Добавление · как добавлять';
const SETS = 'Добавление · наборы';

describe('food-meal · геометрия кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(CSS);

  it('колесо шага времени совпадает с кадром', () => {
    const drift = compare({
      razbor,
      rules,
      frame: TIME_STEP,
      pairs: [
        [9, '.meal-time-hero .mc-wheel-value--prev',
          ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
        [10, '.meal-time-hero .mc-wheel-value--current',
          ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
        [11, '.meal-time-hero .mc-time-sep',
          ['fontWeight', 'fontSize', 'lineHeight', 'color']],
        [12, '.meal-time-hero .mc-wheel-value--next',
          ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
        [13, '.meal-time-hero .mc-wheel-value--current',
          ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
        [14, '.meal-time-hero__now',
          ['minHeight', 'padding', 'radius', 'background', 'ring', 'fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color']],
      ],
    });
    expect(drift).toEqual([]);
  });

  it('«Отмена» модалки «Как добавлять» совпадает с кадром', () => {
    const drift = compare({
      razbor,
      rules,
      frame: HOW_ADD,
      pairs: [
        [15, '.confirm-modal:has(.flow-add-products) .confirm-modal-btn.cancel',
          ['minHeight', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
      ],
    });
    expect(drift).toEqual([]);
  });

  it('пилюля «Добавить» в строке набора совпадает с кадром', () => {
    const drift = compare({
      razbor,
      rules,
      frame: SETS,
      pairs: [
        [18, '.mpr-btn--add-row',
          ['padding', 'minHeight', 'radius', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
      ],
    });
    expect(drift).toEqual([]);
  });

  it('колесо листа правки времени — рядовое 24/12/20', () => {
    const drift = compare({
      razbor,
      rules,
      frame: TIME_EDIT,
      pairs: [
        [11, '.meal-time-step--sheet .mc-wheel-value--current',
          ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
        [13, '.meal-time-step--sheet .mc-wheel-value--next',
          ['fontWeight', 'fontSize', 'lineHeight', 'color']],
        [12, '.meal-time-step--sheet .meal-time-hero .mc-time-sep',
          ['fontWeight', 'fontSize', 'lineHeight', 'color']],
      ],
    });
    expect(drift).toEqual([]);
  });

  it('гейт называет охват разбора', () => {
    const cov = coverage({ razbor });
    console.info(`[food-meal geometry] сверено ${cov.covered} из ${cov.total} строк разбора`);
    expect(cov.covered).toBeGreaterThanOrEqual(11);
  });
});
