// Геометрия зоны «Поправка на факт» против классов кадра канваса
// norm-correction.v4.dc.html на 375 px.
//
// Канвас держит общие классы .grp / .cd / .row в своём <style>; продукт
// переводит их на weekly-wrap-correction__* (клиент) и cur-sheet__* (куратор).
// Разбор кадров с инлайном — в norm-correction-canvas-razbor.test.js.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/norm-correction.v4.dc.html',
);
const CSS_CLIENT = path.resolve(__dirname, '../styles/heys-components.css');
const CSS_CURATOR = path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css');

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map();
  for (const match of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = match[2].trim();
    for (const selector of match[1].split(',')) {
      const key = selector.trim();
      if (!rules.has(key)) rules.set(key, []);
      rules.get(key).push(body);
    }
  }
  return rules;
}

function declarations(bodies) {
  const out = {};
  for (const body of bodies || []) {
    for (const decl of body.split(';')) {
      const at = decl.indexOf(':');
      if (at < 0) continue;
      const prop = decl.slice(0, at).trim();
      const value = decl.slice(at + 1).trim();
      if (prop === 'font') {
        const font = /^(\d+)\s+([\d.]+)px\/([\d.]+)/.exec(value);
        if (font) {
          out['font-weight'] = font[1];
          out['font-size'] = `${font[2]}px`;
          out['line-height'] = font[3];
          continue;
        }
      }
      out[prop] = value;
    }
  }
  return out;
}

const ROLE = new Map(Object.entries({
  '--c1': '--v4-c1',
  '--c2': '--v4-hero',
  '--bg': '--v4-bg',
  '--tx': '--v4-ink',
  '--ac': '--v4-act-text',
  '--acs': '--v4-act',
  '--on-acs': '--v4-btn-on-act',
  '--gr': '--v4-ok-text',
  '--gr-bg': '--v4-ok-bg',
  '--val-bad': '--v4-bad-text',
}));

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.\d+\)/gi, 'var(--v4-line)')
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .toLowerCase();
}

const CHECKED = [
  'padding', 'margin-top', 'border-radius', 'gap', 'min-height',
  'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'background', 'color', 'align-items', 'justify-content',
  'flex-direction', 'display',
];

const PAIRS_CLIENT = [
  ['.grp', '.weekly-wrap-correction'],
  ['.h1', '.weekly-wrap-correction__title'],
  ['.big', '.weekly-wrap-correction__hero-value'],
  ['.badge', '.weekly-wrap-correction__evidence'],
  ['.btn2c', '.weekly-wrap-correction__btn'],
];

const PAIRS_CURATOR = [
  ['.grp', '.cur-sheet__rec'],
  ['.big', '.cur-sheet__rec-value'],
  ['.btn2c', '.cur-sheet__btn'],
];

const EXCEPTIONS = new Set([
  '.weekly-wrap-correction__title|line-height',
  '.weekly-wrap-correction__hero-value|letter-spacing',
  '.weekly-wrap-correction__hero-value|line-height',
  '.weekly-wrap-correction__btn|line-height',
  '.weekly-wrap-correction__btn|color',
  '.weekly-wrap-correction__btn|align-items',
  '.weekly-wrap-correction__btn|justify-content',
  '.weekly-wrap-correction__btn|display',
  '.cur-sheet__btn|line-height',
  '.cur-sheet__btn|color',
  '.cur-sheet__btn|align-items',
  '.cur-sheet__btn|justify-content',
  '.cur-sheet__btn|display',
  // Лист: подложка набора называется --v4-surface, кадр — --c1; значения
  // совпадают в песочном наборе, роли разведены в палитре.
  '.cur-sheet__rec|background',
]);

function comparePairs({ canvas, product, pairs }) {
  const drift = [];
  for (const [canvasSel, productSel] of pairs) {
    const want = declarations(canvas.get(canvasSel));
    const got = declarations(product.get(productSel) || []);
    for (const prop of CHECKED) {
      if (!(prop in want)) continue;
      if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
      const expected = normalize(want[prop]);
      const actual = prop in got ? normalize(got[prop]) : '— нет —';
      if (expected !== actual) {
        drift.push(`${productSel} { ${prop} } — кадр: ${expected}, код: ${actual}`);
      }
    }
  }
  return drift;
}

// Сколько клеток «пара × свойство» гейт реально сверяет.
const COVERAGE_FLOOR_CLIENT = 22;
const COVERAGE_FLOOR_CURATOR = 12;

describe('геометрия карточки сверки против классов канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS_CLIENT, 'utf8'));

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS_CLIENT.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа клиентской карточки совпадают с кадром', () => {
    expect(comparePairs({ canvas, product, pairs: PAIRS_CLIENT })).toEqual([]);
  });

  it('гейт называет охват клиентской карточки', () => {
    let compared = 0;
    for (const [canvasSel, productSel] of PAIRS_CLIENT) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        if (prop in want) compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR_CLIENT);
    if (compared > COVERAGE_FLOOR_CLIENT) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR_CLIENT}. `
        + 'Поднимите COVERAGE_FLOOR_CLIENT.',
      );
    }
  });
});

describe('геометрия листа куратора против классов канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS_CURATOR, 'utf8'));

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS_CURATOR.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа листа куратора совпадают с кадром', () => {
    expect(comparePairs({ canvas, product, pairs: PAIRS_CURATOR })).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(14);
  });

  it('гейт называет охват листа куратора', () => {
    let compared = 0;
    for (const [canvasSel, productSel] of PAIRS_CURATOR) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        if (prop in want) compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR_CURATOR);
    if (compared > COVERAGE_FLOOR_CURATOR) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR_CURATOR}. `
        + 'Поднимите COVERAGE_FLOOR_CURATOR.',
      );
    }
  });
});
