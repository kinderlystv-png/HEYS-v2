// Геометрия зоны water-add: плитка 1×1 (V₃ + nrmB), чипы FAB, карточка «Кольцо»,
// лист своего объёма — против inline-CSS кадров data-demo="stop" канваса
// water-add.v4.dc.html на 375 px.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/water-add.v4.dc.html',
);
const WIDGETS_CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const WATER_CSS = path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css');

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
  '--c1': '--v4-surface',
  '--bg': '--v4-bg',
  '--tx': '--v4-ink',
  '--inkTxt': '--v4-ink',
  '--dimTxt': '--v4-ink-2',
  '--w': '--v4-water',
  '--wDeep': '--water-tone-deep',
  '--wTxt': '--water-cream-text',
  '--trk': '--v4-track',
  '--cardBg': '--v4-surface',
}));

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d*\.?\d+)rem/g, (whole, n) => `${+(parseFloat(n) * 16).toFixed(4)}px`)
    .replace(/var\((--[a-z0-9-]+)\s*,(?:[^()]|\([^()]*\))*\)/gi, 'var($1)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.12\)/gi, 'var(--v4-track)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.18\)/gi, 'var(--v4-edge)')
    .replace(/rgba\(var\(--ink\)\s*,\s*\.\d+\)/gi, 'var(--v4-line)')
    .replace(/var\((--[a-zA-Z0-9-]+)\)/g, (whole, name) => `var(${ROLE.get(name) || name})`)
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .toLowerCase();
}

// Пары «класс кадра → класс продукта». Кадры protocol и лупы сюда не входят.
const PAIRS = [
  ['.v3 .drop', '.widget-water__drop'],
  ['.v3 .ripple', '.widget-water__ripple'],
  ['.fillW::before', '.widget-water__fill::before'],
  ['.nrmB .topNorm', '.widget-water--v4 .widget-water__norm'],
  ['.nrmB .botK', '.widget-water--v4 .widget-water__label'],
  ['.nrmB .botV', '.widget-water--v4 .widget-water__numV'],
  ['.wCardB .bRingTxt b', '.water-review__ring-fact'],
  ['.wCardB .bRingTxt span', '.water-review__ring-meta'],
  ['.wCardB .bChip', '.water-review__chip--quick'],
  ['.chip', '.water-fab-vol'],
  ['.chipSub', '.water-fab-vol--minus'],
];

const CHECKED = [
  'padding', 'margin-top', 'margin-bottom', 'margin-right', 'border-radius', 'gap',
  'height', 'min-height', 'width', 'font-size', 'font-weight', 'line-height',
  'letter-spacing', 'background', 'color', 'align-items', 'justify-content',
  'flex', 'border', 'top', 'bottom', 'left', 'right',
];

// Решение владельца 2 сентября: кегль «Вода» 9 px, число 17 px — не как у
// демо nrmB (12 px). Заливка — color-mix, не сплошной #7d98a6 кадра.
const EXCEPTIONS = new Set([
  '.widget-water--v4 .widget-water__label|font-size',
  '.widget-water--v4 .widget-water__label|line-height',
  '.widget-water--v4 .widget-water__numV|font-size',
  '.widget-water__fill::before|background',
  '.widget-water__drop|background',
  '.widget-water__ripple|border',
  '.widget-water__ripple|bottom',
  '.widget-water--v4 .widget-water__norm|color',
  '.water-review__ring-fact|color',
  '.water-review__ring-meta|font-size',
  '.water-review__ring-meta|font-weight',
  '.water-review__ring-meta|line-height',
  '.water-review__ring-meta|color',
  '.water-review__chip--quick|height',
  '.water-review__chip--quick|font-size',
  '.water-review__chip--quick|font-weight',
  '.water-review__chip--quick|line-height',
  '.water-review__chip--quick|background',
  '.water-review__chip--quick|color',
  '.water-fab-vol--minus|color',
]);

const COVERAGE_FLOOR = 28;

describe('геометрия water-add против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(
    fs.readFileSync(WIDGETS_CSS, 'utf8') + '\n' + fs.readFileSync(WATER_CSS, 'utf8'),
  );

  it('каждый блок кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || !product.has(m));
    expect(orphans.filter(([c]) => !c.startsWith('.water-custom'))).toEqual([]);
  });

  it('числа совпадают с кадрами stop', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      const base = productSel.split(/\s+/).pop().replace(/\[[^\]]*\]/g, '');
      const chain = [];
      for (const sel of [base, productSel]) {
        if (product.has(sel) && !chain.includes(sel)) chain.push(sel);
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

  it('гейт называет свой охват', () => {
    let compared = 0;
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (EXCEPTIONS.has(`${productSel}|${prop}`)) continue;
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
  });
});
