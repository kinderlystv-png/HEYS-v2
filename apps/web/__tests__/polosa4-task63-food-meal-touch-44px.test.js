/**
 * Полоса 4 · задача 63 · food-meal · видимые тач-цели 44px.
 * Контракт пакета 36: без невидимых hit-area expanders; образец — nutrition-v4-chip::after none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB_DIR, '..', '..');

const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/food-meal.v4.dc.html',
);
const CSS_610 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/610-aps-meal-flow.css'), 'utf8');
const CSS_600 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/600-steps-and-aps.css'), 'utf8');
const CSS_COMPONENTS = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

/** Строки контракта, закрытые правкой тач-целей (без --rehash). */
export const TOUCH_CONTRACT_LINES = Object.freeze([
  'тач-цели',
  'Добавление · время и тип · 16',
  'Добавление · время и тип · 22',
  'Добавление · самочувствие · 20',
  'Добавление · самочувствие · 21',
  'Добавление · самочувствие · 23',
  'Добавление · как добавлять · 15',
  'Добавление · выбор способа · 06',
  'Добавление · выбор способа · 15',
  'Добавление · поиск · 10',
  'Поиск · только свои · 10',
  'Добавление · порция · 17',
  'Добавление · порция · 18',
  'Порция · ввод в калориях · 16',
  'Порция · ввод в калориях · 17',
  'Порция · продукт уже в приёме · 17',
  'Порция · продукт уже в приёме · 18',
  'Порция · перебор нормы · 17',
  'Порция · перебор нормы · 18',
  'Действие · копировать · чего не знаем · 25',
  'Добавление · наборы · 11',
  'Добавление · наборы · 12',
  'Добавление · наборы · 18',
  'Добавление · правка набора · 08',
  'Наборы · 12',
  'Наборы · 13',
  'Наборы · вкладка поиска · 12',
  'Наборы · вкладка поиска · 13',
  'Наборы · вкладка поиска · 19',
  'Набор · сборка · 05',
  'Набор · сборка · 20',
  'Набор · сборка пустая · 05',
  'Набор · сборка пустая · 11',
  'Набор · сохранение · 08',
  'Набор · удаление · 09',
  'Приём · время и тип · 16',
  'Приём · время и тип · 17',
]);

const CSS_TOUCH_RULES = Object.freeze([
  { file: '610', selector: '.meal-time-shift', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-v4-shared-filter', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-v4-search-tab', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-v4-grams-chip', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-v4-grams-unit', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-v4-grams-hero__step', prop: 'height', minPx: 44 },
  { file: '610', selector: '.meal-mood-chip', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.meal-time-wait', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.meal-type-chip', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.flow-selection-btn__barcode-tap', prop: 'height', minPx: 44 },
  { file: '610', selector: '.aps-v4-browse-action', prop: 'min-height', minPx: 44 },
  { file: '610', selector: '.aps-search-clear', prop: 'height', minPx: 44 },
  { file: '610', selector: '.aps-search-barcode-btn', prop: 'height', minPx: 44 },
  { file: '610', selector: '.aps-grams-hero-btn', prop: 'height', minPx: 44 },
  { file: '610', selector: '.mpr-back-btn', prop: 'height', minPx: 44 },
  { file: '610', selector: '.mpr-grams-btn', prop: 'height', minPx: 44 },
  { file: '610', selector: '.mpr-preview-item-toggle', prop: 'height', minPx: 44 },
  { file: '610', selector: '.mpr-search-clear', prop: 'height', minPx: 44 },
  { file: '610', selector: '.mpr-btn', prop: 'height', minPx: 44 },
  { file: '610', selector: '.meal-transfer-v4__gram-step', prop: 'height', minPx: 44 },
  { file: '610', selector: '.meal-transfer-v4__product-fix', prop: 'min-height', minPx: 44 },
  { file: '600', selector: '.aps-category-chip', prop: 'min-height', minPx: 44 },
  { file: '600', selector: '.aps-v4-product-row__fav', prop: 'height', minPx: 44 },
  { file: '600', selector: '.aps-v4-flow .aps-search-barcode-btn', prop: 'height', minPx: 44 },
  { file: 'components', selector: '.mc-modal--meal-create .mc-header-btn--back', prop: 'height', minPx: 44 },
  { file: 'components', selector: '.mc-modal--meal-create .mc-header-btn--close', prop: 'height', minPx: 44 },
]);

const COMPUTED_PROBES = Object.freeze([
  { label: 'meal-time-shift', className: 'meal-time-shift', metric: 'minHeight' },
  { label: 'shared-filter', className: 'aps-v4-shared-filter', metric: 'minHeight' },
  { label: 'search-tab', className: 'aps-v4-search-tab', metric: 'minHeight' },
  { label: 'grams-chip', className: 'aps-v4-grams-chip', metric: 'minHeight' },
  { label: 'grams-unit', className: 'aps-v4-grams-unit', metric: 'minHeight' },
  { label: 'grams-step', className: 'aps-v4-grams-hero__step', metric: 'height' },
  { label: 'mood-chip', className: 'meal-mood-chip', metric: 'minHeight' },
  { label: 'time-wait', className: 'meal-time-wait', metric: 'minHeight' },
  { label: 'type-chip', className: 'meal-type-chip', metric: 'minHeight' },
  { label: 'barcode-tap', className: 'flow-selection-btn__barcode-tap', metric: 'height' },
  { label: 'browse-action', className: 'aps-v4-browse-action', metric: 'minHeight' },
  { label: 'search-clear', className: 'aps-search-clear', metric: 'height' },
  { label: 'search-barcode', className: 'aps-search-barcode-btn', metric: 'height' },
  { label: 'grams-hero-btn', className: 'aps-grams-hero-btn', metric: 'height' },
  { label: 'mpr-back', className: 'mpr-back-btn', metric: 'height' },
  { label: 'mpr-grams-btn', className: 'mpr-grams-btn', metric: 'height' },
  { label: 'preview-toggle', className: 'mpr-preview-item-toggle', metric: 'height' },
  { label: 'mpr-search-clear', className: 'mpr-search-clear', metric: 'height' },
  { label: 'mpr-btn', className: 'mpr-btn', metric: 'height' },
  { label: 'transfer-gram-step', className: 'meal-transfer-v4__gram-step', metric: 'height' },
  { label: 'transfer-fix', className: 'meal-transfer-v4__product-fix', metric: 'minHeight' },
  { label: 'category-chip', className: 'aps-category-chip', metric: 'minHeight' },
  { label: 'row-fav', className: 'aps-v4-product-row__fav', metric: 'height' },
  {
    label: 'v4-barcode',
    wrap: 'aps-v4-flow',
    childClass: 'aps-search-barcode-btn',
    metric: 'height',
  },
  {
    label: 'header-back',
    wrap: 'mc-modal mc-modal--meal-create',
    childClass: 'mc-header-btn mc-header-btn--back',
    metric: 'height',
  },
  {
    label: 'header-close',
    wrap: 'mc-modal mc-modal--meal-create',
    childClass: 'mc-header-btn mc-header-btn--close',
    metric: 'height',
  },
]);

const REMOVED_EXPANDERS = Object.freeze([
  { selector: '.aps-v4-grams-chip', property: 'margin' },
  { selector: '.mpr-grams-btn', property: 'margin' },
  { selector: '.mpr-preview-item-toggle', property: 'margin' },
]);

function contractRows() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  return new Map(
    [...html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)].map(
      (match) => [match[1], match[2]],
    ),
  );
}

function ruleBlock(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}(?=\\s|\\{)`));
  expect(match?.index, `selector ${selector}`).toBeGreaterThanOrEqual(0);
  const start = source.indexOf('{', match.index);
  const end = source.indexOf('}', start);
  return source.slice(start + 1, end);
}

function parsePx(value) {
  const n = Number.parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function cssSource(file) {
  if (file === '610') return CSS_610;
  if (file === '600') return CSS_600;
  return CSS_COMPONENTS;
}

function mountPalette(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function probeComputed(probe) {
  let host;
  if (probe.wrap) {
    host = document.createElement('div');
    host.className = probe.wrap;
    const child = document.createElement('button');
    child.className = probe.childClass;
    host.appendChild(child);
    document.body.appendChild(host);
    const computed = getComputedStyle(child);
    const value = parsePx(computed[probe.metric]);
    host.remove();
    return value;
  }

  host = document.createElement('button');
  if (probe.className) host.className = probe.className;
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const value = parsePx(computed[probe.metric]);
  host.remove();
  return value;
}

describe('polosa4 task63 · food-meal touch 44px visible', () => {
  let styles = [];

  afterEach(() => {
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('контракт · строка тач-цели требует видимые 44 px', () => {
    const rows = contractRows();
    const touch = rows.get('тач-цели') || '';
    expect(touch).toMatch(/44\s*px.*ВИДИМЫЙ/i);
    expect(touch).toMatch(/СНЯТ\s+расширитель\s+::after/i);
    expect(TOUCH_CONTRACT_LINES).toHaveLength(37);
  });

  it('CSS source · правила ≥44 px и без margin-расширителей на чипах/степперах', () => {
    for (const row of CSS_TOUCH_RULES) {
      const block = ruleBlock(cssSource(row.file), row.selector);
      expect(block, row.selector).toMatch(new RegExp(`${row.prop}:\\s*${row.minPx}px`));
    }
    for (const row of REMOVED_EXPANDERS) {
      const block = ruleBlock(CSS_610, row.selector);
      expect(block, row.selector).not.toMatch(/margin:\s*-/);
    }
    expect(ruleBlock(CSS_610, '.aps-v4-grams-hero__step')).toContain('font-size: 16px');
    expect(ruleBlock(CSS_610, '.aps-grams-hero-btn')).toContain('font-size: 16px');
    expect(ruleBlock(CSS_610, '.mpr-grams-btn')).toContain('font-size: 16px');
  });

  it('computed sand + blue · видимый габарит ≥44 px (каскад)', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${CSS_600}\n${CSS_610}\n${CSS_COMPONENTS}`));

    const table = { sand: {}, blue: {} };
    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      for (const probe of COMPUTED_PROBES) {
        const px = probeComputed(probe);
        table[id][probe.label] = px;
        expect(px, `${id} · ${probe.label}`).toBeGreaterThanOrEqual(44);
      }
    }

    for (const label of Object.keys(table.sand)) {
      expect(table.blue[label], label).toBe(table.sand[label]);
    }

    // eslint-disable-next-line no-console -- handoff evidence
    console.info('[polosa4-task63-food-meal computed]', JSON.stringify(table));
  }, 60_000);
});
