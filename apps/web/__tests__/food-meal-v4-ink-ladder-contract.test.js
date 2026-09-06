import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRules } from './canvas-razbor-helpers.js';

function usesInk2(color) {
  return Boolean(color) && color.includes('--v4-ink-2');
}

const MEAL_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/610-aps-meal-flow.css'),
  'utf8',
);
const STEPS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8',
);
const NUTRITION_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/732-ui-v4-nutrition.css'),
  'utf8',
);
const APS_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);

const MEAL_SELECTORS = [
  '.flow-selection-btn__sub',
  '.flow-selection-btn__hint',
  '.meal-mood-prefill',
  '.meal-mood-scale__ends',
  '.mpr-btn--hide-suggested',
  '.mpr-my-set-row__meta',
  '.mpr-footnote',
  '.mpr-preview-set-tools__hint',
  '.mpr-preview-item-kcal',
  '.mpr-preview-total__label',
  '.mpr-create-item-kcal',
  '.aps-v4-shared-filter',
  '.aps-v4-search-lead',
  '.aps-v4-grams-converted-note',
  '.aps-v4-grams-last',
  '.aps-v4-grams-impact__macros',
  '.aps-v4-grams-impact__foot',
  '.aps-v4-meal-summary__hero-foot',
  '.aps-v4-search-state__off-state',
  '.aps-v4-meal-summary__photo-note',
  '.meal-type-section--sheet .meal-type-hint',
  '.aps-v4-preset-confirm__grams',
];

const NUTRITION_DATA_SELECTORS = [
  '.nutrition-v4-window__label',
  '.nutrition-v4-meal-row__items',
  '.nutrition-v4-meal-row--empty .nutrition-v4-meal-row__num',
];

describe('food-meal · лестница чернил для мелких данных', () => {
  it('активные подписи флоу используют семантический уровень данных 56 %', () => {
    expect(MEAL_SELECTORS.length).toBeGreaterThan(0);
    const rules = readRules(MEAL_CSS);
    const drift = MEAL_SELECTORS.flatMap((selector) => {
      const color = rules.get(selector)?.color;
      return usesInk2(color) ? [] : [`${selector}: ${color || 'нет color'}`];
    });
    expect(drift).toEqual([]);
  });

  it('примечание создания набора наследует тот же уровень от mpr-footnote', () => {
    expect(APS_SOURCE).toContain("className: 'mpr-footnote mpr-create-footnote'");
    const footnoteColor = readRules(MEAL_CSS).get('.mpr-footnote')?.color;
    expect(footnoteColor, '.mpr-footnote').toBeTruthy();
    expect(footnoteColor).toContain('--v4-ink-2');
  });

  it('строка продукта и данные списка приёмов используют уровень данных 56 %', () => {
    expect(NUTRITION_DATA_SELECTORS.length).toBeGreaterThan(0);
    const steps = readRules(STEPS_CSS);
    const nutrition = readRules(NUTRITION_CSS);
    const productMeta = steps.get('.aps-v4-product-row__meta')?.color;
    expect(productMeta, '.aps-v4-product-row__meta').toBeTruthy();
    expect(productMeta).toContain('--v4-ink-data');
    for (const selector of NUTRITION_DATA_SELECTORS) {
      const color = nutrition.get(selector)?.color;
      expect(color, selector).toBeTruthy();
      expect(color, selector).toContain('--v4-ink-data');
    }
  });
});
