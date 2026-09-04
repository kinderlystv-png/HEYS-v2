// Геометрия листа геймификации против кадров data-demo="stop" канваса
// gamification.v4.dc.html на 375 px.
//
// Канвас держит общие классы списков в <style> (.k, .tier, .cd, .row), продукт —
// в 000-base-and-gamification.css. Сверяем пары «класс кадра → класс продукта»
// числами; отступления называем поимённо.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/gamification.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css');
const G = '.game-v4-sheet__';

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
  '--c1': '--v4-sand-surface',
  '--c2': '--v4-sand-hero',
  '--bg': '--v4-bg',
  '--tx': '--v4-sand-ink',
  '--ac': '--v4-sand-act-text',
  '--gr': '--v4-sand-ok-text',
  '--gr-bg': '--v4-ok-bg',
}));

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.12\)/gi, 'var(--v4-track)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.18\)/gi, 'var(--v4-edge)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.\d+\)/gi, 'var(--v4-line)')
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

const CHECKED = [
  'display', 'flex-direction', 'align-items', 'justify-content', 'gap',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin', 'margin-top', 'margin-bottom',
  'min-height', 'width', 'height',
  'border-radius', 'border-bottom', 'background', 'background-color',
  'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform',
  'color', 'font-variant-numeric',
];

const PAIRS = [
  ['.k', `${G}eyebrow`],
  ['.tier', `${G}tier`],
  ['.cd', `${G}list-card`],
  ['.row', `${G}ladder-row`],
  ['.grp', `${G}mult-card`],
  ['.row > :last-child', `${G}ladder-xp`],
];

const EXCEPTIONS = new Set([
  // Строка «вид карточки-героя»: надзаголовок 55 %, кадр .k даёт 56 %.
  `${G}eyebrow|color`,
  `${G}eyebrow|line-height`,
  // Строка «вид заголовка группы»: поля 18/10, кадр .tier — 20/10; цвет ролью.
  `${G}tier|margin`,
  `${G}tier|margin-top`,
  `${G}tier|margin-bottom`,
  `${G}tier|line-height`,
  `${G}tier|color`,
  // Кадр .row — space-between и зазор 12; строка лестницы — center и 13.
  `${G}ladder-row|justify-content`,
  `${G}ladder-row|gap`,
  `${G}ladder-row|border-bottom`,
  `${G}ladder-row|font-size`,
  `${G}ladder-row|font-weight`,
  `${G}ladder-row|line-height`,
  // .grp — общая карточка; множитель наследует фон от mult-card, геометрию — от card.
  `${G}mult-card|padding`,
  `${G}mult-card|border-radius`,
  `${G}mult-card|background`,
  `${G}mult-card|background-color`,
  `${G}ladder-xp|flex`,
]);

const COVERAGE_FLOOR = 13;

describe('геометрия листа геймификации против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      const base = productSel.split(/\s+/).pop().replace(/\[[^\]]*\]/g, '');
      const parent = base.replace(/(__[a-z-]+|\.is-[a-z-]+|--[a-z-]+)$/, '');
      const chain = [];
      for (const sel of [parent, base, productSel]) {
        if (sel && product.has(sel) && !chain.includes(sel)) chain.push(sel);
      }
      const got = declarations(chain.flatMap((sel) => product.get(sel) || []));

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
    expect(drift).toEqual([]);
  });

  it('строка лестницы следует контракту, а не старому квадрату', () => {
    expect(product.get(`${G}ladder-mark`)).toBeTruthy();
    expect(product.get(`${G}ladder-title`)).toBeTruthy();
    expect(declarations(product.get(`${G}ladder-mark`)).width).toBe('12px');
    expect(declarations(product.get(`${G}ladder-row.is-current ${G}ladder-title`))['font-weight']).toBe('700');
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(18);
  });

  it('гейт называет свой охват', () => {
    let compared = 0;
    let skipped = 0;
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        if (prop in want) compared += 1;
        else skipped += 1;
      }
    }
    console.info(
      `[геймификация-геометрия] сверено ${compared} из ${compared + skipped} клеток `
      + `(${((compared / (compared + skipped)) * 100).toFixed(1)} %), пар ${PAIRS.length}`,
    );
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (compared > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${compared} клеток вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
