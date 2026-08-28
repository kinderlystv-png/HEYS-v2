// Геометрия виджетов Главной против кадров data-demo="stop" канваса
// home-widgets.v4.dc.html на 375 px.
//
// Тот же приём, что у вкладки «Питание»: канвас держит геометрию в классах
// своего <style>, поэтому сверяем пары «класс кадра → класс продукта» числами,
// а не глазами. Тест читает сам канвас, поэтому расхождение всплывает при
// правке любой из сторон.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');

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

// Канвас пишет шрифт шорткатом `font: 600 9px/1.1 Figtree`, продуктовый CSS —
// раскладкой. Приводим обе формы к одному виду.
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

function normalize(value) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    // Кадр использует имена ролей канваса, а продукт — свои --v4-* роли с
    // песочным fallback. Для геометрического теста сравниваем вычисленный
    // песочный цвет; наличие продуктовой роли отдельно охраняет ui:v4:check.
    .replace(/var\(--c1\)/g, '#f7efe2')
    .replace(/var\(--bg\)/g, '#fffaf1')
    .replace(/var\(--tx\)/g, '#201e1d')
    .replace(/rgba\(var\(--ink\),\s*\.45\)/g, 'rgba(0,0,0,.45)')
    .replace(/rgba\(var\(--ink\),\s*\.35\)/g, 'rgba(0,0,0,.35)')
    .replace(/rgba\(var\(--ink\),\s*\.04\)/g, 'rgba(0,0,0,.04)')
    .replace(/rgba\(var\(--shadow\),\s*\.22\)/g, 'rgba(80,50,20,.22)')
    // Продукт пишет кегль rem для системного масштаба — сверяем с px канваса.
    .replace(/([\d.]+)rem/g, (_, n) => `${parseFloat(n) * 16}px`)
    // Канвас пишет цвет хексом, продукт — ролью с запасным значением.
    // Сверяем по запасному: за самими ролями следит ui:v4:check.
    .replace(/var\(--[a-z0-9-]+\s*,\s*([^)]+)\)/gi, '$1')
    .replace(/(^|[\s(,])\.(\d)/g, '$10.$2')
    .replace(/(^|[\s(,])-\.(\d)/g, '$1-0.$2')
    .replace(/,\s*/g, ',')
    .toLowerCase();
}

// Пара может собирать несколько продуктовых правил: часть свойств плитки живёт
// в базовом `.widget`, часть — в v4-слое Главной. Браузер видит их вместе.
const PAIRS = [
  // Плитка и её типографика
  ['.w', ['.widget', 'body:has(.widgets-tab) .widget']],
  ['.k', '.widget-v4-kicker'],
  ['.v', '.widget-v4-mini__value'],
  ['.u', '.widget-v4-unit'],
  // Вход в расстановку кадром не сводится: дизайнер подтвердил, что строка
  // «Изменить экран» была ошибкой контракта, вход — кнопка настройки экрана.
  // Пара ['.editRow > span', '.widgets-tab__edit-btn'] снята вместе с мёртвым
  // продуктовым CSS этой строки.
  // Лист смены вида
  ['.sheet', '.widget-wd-sheet'],
  ['.sh1', '.widget-wd-sheet__title'],
  ['.sh2', '.widget-wd-sheet__subtitle'],
  ['.opt', '.widget-wd-sheet__opt'],
  ['.scrim', '.widget-wd-sheet__scrim'],
];

const CHECKED = [
  'padding', 'border-radius', 'gap', 'height', 'min-height',
  'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'background', 'color', 'align-items', 'justify-content', 'flex-direction',
  'box-shadow', 'backdrop-filter',
];

// Осознанные отступления: у каждого — строка контракта или инвариант продукта,
// который старше кадра.
const EXCEPTIONS = new Set([
  // Строка контракта 8: «паддинг сетки 16 px, от ширины не зависит». Кадр
  // рисует экран с 14 px сверху — это паддинг всего экрана, а не сетки.
  'body:has(.widgets-tab) .widgets-grid|padding',
  // Инвариант product-модалок (CLAUDE.md): блюр подложки — 2.5 px из токена
  // --v4-modal-backdrop-blur. Канвас рисует 2 px.
  '.widget-wd-sheet__scrim|backdrop-filter',
  // Тот же инвариант: dim берётся из --v4-modal-backdrop-dim (0.45), канвас
  // рисует 0.42.
  '.widget-wd-sheet__scrim|background',
]);

describe('геометрия виджетов Главной против кадров канваса', () => {
  const canvasSource = fs.readFileSync(CANVAS, 'utf8');
  const helmet = canvasSource.slice(
    canvasSource.indexOf('<style>') + '<style>'.length,
    canvasSource.indexOf('</style>'),
  );
  const canvas = parseRules(helmet);
  const product = parseRules(fs.readFileSync(CSS, 'utf8'));

  const chainOf = (productSel) => (Array.isArray(productSel) ? productSel : [productSel]);
  const nameOf = (productSel) => chainOf(productSel)[chainOf(productSel).length - 1];

  it('каждый класс кадра имеет пару в продуктовом CSS', () => {
    const orphans = PAIRS.filter(([c, m]) => !canvas.has(c) || chainOf(m).some((sel) => !product.has(sel)));
    expect(orphans).toEqual([]);
  });

  it('числа совпадают с кадрами', () => {
    const drift = [];
    for (const [canvasSel, productSel] of PAIRS) {
      const want = declarations(canvas.get(canvasSel));
      const got = declarations(chainOf(productSel).flatMap((sel) => product.get(sel) || []));
      const label = nameOf(productSel);
      for (const prop of CHECKED) {
        if (!(prop in want)) continue;
        if (EXCEPTIONS.has(`${label}|${prop}`)) continue;
        const expected = normalize(want[prop]);
        const actual = prop in got ? normalize(got[prop]) : '— нет —';
        if (expected !== actual) {
          drift.push(`${label} { ${prop} } — кадр: ${expected}, код: ${actual}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it('сетка держит формулу контракта: 4 колонки, ряд 64, зазор 8', () => {
    // Канвас задаёт это числами в `.g`, продукт — переменными набора, поэтому
    // сравниваем значения переменных, а не текст правила.
    const grid = declarations(canvas.get('.g'));
    expect(grid['grid-auto-rows']).toBe('64px');
    expect(grid.gap).toBe('8px');
    expect(grid['grid-template-columns']).toBe('repeat(4,1fr)');

    const root = declarations(product.get(':root'));
    expect(root['--widget-row-height']).toBe('64px');
    expect(root['--widget-grid-gap']).toBe('8px');
    expect(root['--widget-grid-columns']).toBe('4');
  });

  it('паддинг сетки — 16 px по контракту, второго значения нет', () => {
    const gridRule = declarations(product.get('body:has(.widgets-tab) .widgets-grid'));
    expect(gridRule.padding).toBe('16px');
    expect(gridRule['max-width']).toBe('480px');

    // Ни одна медиа-ширина не переопределяет зазор и высоту ряда:
    // одно значение на все экраны (строка контракта 11).
    const css = fs.readFileSync(CSS, 'utf8');
    const overrides = [...css.matchAll(/--widget-grid-gap:\s*([^;]+);/g)].map((m) => m[1].trim());
    expect(new Set(overrides)).toEqual(new Set(['8px']));
  });

  it('однозначные мини-графики совпадают с новой строкой вида', () => {
    const css = fs.readFileSync(CSS, 'utf8');

    expect(css).toMatch(/\.widget-v4-stepbars \{[\s\S]*?height:\s*30px/);
    expect(css).toMatch(/\.widget-v4-stepbars--month \{[\s\S]*?height:\s*30px/);
    expect(css).toMatch(/\.widget-v4-stepbars__bar \{[\s\S]*?background:\s*#b7c29b/);
    expect(css).toMatch(/\.widget-v4-stepbars__bar\.is-goal \{[\s\S]*?background:\s*var\(--v4-ok-fill, #7a8a5e\)/);

    expect(css).toMatch(/\.widget-v4-heat__bar--d1 \{[\s\S]*?background:\s*var\(--v4-line/);
    expect(css).toMatch(/\.widget-v4-heat__bar--d2 \{[\s\S]*?background:\s*var\(--v4-wave-overlap/);
    expect(css).toMatch(/\.widget-v4-heat__bar--d3 \{[\s\S]*?background:\s*var\(--v4-ok-fill/);
    expect(css).not.toContain('[data-theme$="dark"] .widget-v4-heat__bar--d1');

    expect(css).toMatch(/\.widget-v4-mini\.widget-v4-fiber \.widget-v4-goal-value,[\s\S]*?\.widget-v4-mini\.widget-v4-protein \.widget-v4-goal-value \{[\s\S]*?font-size:\s*21px/);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(3);
  });
});
