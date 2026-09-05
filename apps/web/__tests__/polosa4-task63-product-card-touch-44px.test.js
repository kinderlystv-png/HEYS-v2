/**
 * Полоса 4 · задача 63 · product-card · видимые тач-цели 44px.
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
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/product-card.v4.dc.html',
);
const CSS_611 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/611-aps-product-card.css'), 'utf8');
const CSS_600 = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/600-steps-and-aps.css'), 'utf8');
const CSS_COMPONENTS = fs.readFileSync(path.join(WEB_DIR, 'styles/heys-components.css'), 'utf8');
const PALETTE_CSS = fs.readFileSync(
  path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

/** Строки контракта, закрытые правкой тач-целей (без --rehash). */
export const TOUCH_CONTRACT_LINES = Object.freeze([
  'тач-цели',
  'Продукт · вставка строки · 08',
  'Продукт · вставка строки · 15',
  'Продукт · вставка строки · 22',
  'Продукт · дополнительно · 11',
  'Продукт · дополнительно · 14',
  'Продукт · дополнительно · 16',
  'Продукт · дополнительно · 17',
  'Продукт · порции · рекомендованные чипы',
  'Продукт · порции · Использовать шаблон',
  'Правка продукта · основные · Шаблон',
  'Правка продукта · основные · поля порции',
  'Правка продукта · основные · NOVA',
  'Штрихкод · наведение · крест',
  'Штрихкод · ручной ввод · поле',
  'Штрихкод · ручной ввод · OK',
  'Создание · промпт и буфер',
  'Создание · поле бренда',
]);

const CSS_TOUCH_RULES = Object.freeze([
  { file: '611', selector: '.aps-create-prompt-btn', prop: 'min-height', minPx: 44 },
  { file: '611', selector: '.aps-create-example-btn', prop: 'min-height', minPx: 44 },
  { file: '611', selector: '.aps-create-publish', prop: 'min-height', minPx: 44 },
  { file: '611', selector: '.aps-create-brand-input', prop: 'min-height', minPx: 44 },
  { file: '611', selector: '.aps-barcode-input', prop: 'min-height', minPx: 44 },
  { file: '611', selector: '.aps-barcode-submit', prop: 'min-height', minPx: 44 },
  {
    file: '611',
    selector: '.aps-barcode-overlay--v4-fullscreen .aps-barcode-close',
    prop: 'height',
    minPx: 44,
  },
  {
    file: '611',
    selector: '.aps-v4-portions-suggest .aps-v4-btn-ghost',
    prop: 'min-height',
    minPx: 44,
  },
  {
    file: '611',
    selector: '.aps-v4-portions-suggest .aps-v4-portions-row--readonly',
    prop: 'min-height',
    minPx: 44,
  },
  { file: 'components', selector: '.pe-segment-btn', prop: 'min-height', minPx: 44 },
  { file: 'components', selector: '.pe-portions-template-btn', prop: 'min-height', minPx: 44 },
  { file: 'components', selector: '.pe-portions-name', prop: 'min-height', minPx: 44 },
  { file: 'components', selector: '.pe-input', prop: 'min-height', minPx: 44 },
  {
    file: 'components',
    selector: '.pe-step:has(.pe-toggles) .pe-input',
    prop: 'min-height',
    minPx: 44,
  },
]);

const COMPUTED_PROBES = Object.freeze([
  { label: 'prompt-btn', className: 'aps-create-prompt-btn', metric: 'minHeight' },
  { label: 'example-btn', className: 'aps-create-example-btn', metric: 'minHeight' },
  { label: 'publish-row', className: 'aps-create-publish', metric: 'minHeight' },
  { label: 'brand-input', className: 'aps-create-brand-input', metric: 'minHeight' },
  { label: 'barcode-input', className: 'aps-barcode-input', metric: 'minHeight' },
  { label: 'barcode-submit', className: 'aps-barcode-submit', metric: 'minHeight' },
  {
    label: 'fullscreen-close',
    wrap: 'aps-barcode-overlay--v4-fullscreen',
    childClass: 'aps-barcode-close',
    metric: 'height',
  },
  {
    label: 'suggest-chip',
    className: 'aps-v4-portions-suggest aps-v4-portions-row--readonly',
    metric: 'minHeight',
    wrap: 'aps-v4-portions-suggest',
    childClass: 'aps-v4-portions-row--readonly',
  },
  {
    label: 'use-template',
    className: 'aps-v4-portions-suggest aps-v4-btn-ghost',
    metric: 'minHeight',
    wrap: 'aps-v4-portions-suggest',
    childClass: 'aps-v4-btn-ghost',
  },
  { label: 'pe-segment', className: 'pe-segment-btn', metric: 'minHeight' },
  { label: 'pe-template', className: 'pe-portions-template-btn', metric: 'minHeight' },
  { label: 'pe-input-main', className: 'pe-input', metric: 'minHeight' },
  {
    label: 'pe-input-extra',
    className: 'pe-step pe-input',
    metric: 'minHeight',
    wrap: 'pe-step',
    childClass: 'pe-input',
    extraChild: { className: 'pe-toggles', tag: 'div' },
  },
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
  const idx = source.indexOf(selector);
  expect(idx, `selector ${selector}`).toBeGreaterThanOrEqual(0);
  const start = source.indexOf('{', idx);
  const end = source.indexOf('}', start);
  return source.slice(start + 1, end);
}

function parsePx(value) {
  const n = Number.parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function cssSource(file) {
  if (file === '611') return CSS_611;
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
    if (probe.extraChild) {
      host.appendChild(document.createElement(probe.extraChild.tag || 'div'));
      host.lastChild.className = probe.extraChild.className;
    }
    const child = document.createElement(probe.childClass.includes('input') ? 'input' : 'button');
    child.className = probe.childClass;
    host.appendChild(child);
    document.body.appendChild(host);
    const computed = getComputedStyle(child);
    const value = parsePx(computed[probe.metric]);
    host.remove();
    return value;
  }

  const parts = probe.className?.split(/\s+/) || [];
  host = document.createElement(
    parts.some((c) => c.includes('input')) || probe.childClass?.includes('input') ? 'input' : 'button',
  );
  if (probe.className) host.className = probe.className;
  document.body.appendChild(host);
  const computed = getComputedStyle(host);
  const value = parsePx(computed[probe.metric]);
  host.remove();
  return value;
}

describe('polosa4 task63 · product-card touch 44px visible', () => {
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
    expect(touch).toMatch(/44\s*px\s+видимым/i);
    expect(touch).toMatch(/СНЯТ\s+расширитель\s+::after/i);
    expect(TOUCH_CONTRACT_LINES).toHaveLength(18);
  });

  it('CSS source · правила ≥44 px и без fullscreen-close ::after expander', () => {
    for (const row of CSS_TOUCH_RULES) {
      const block = ruleBlock(cssSource(row.file), row.selector);
      expect(block, row.selector).toMatch(new RegExp(`${row.prop}:\\s*${row.minPx}px`));
    }
    expect(CSS_611).not.toMatch(
      /\.aps-barcode-overlay--v4-fullscreen\s+\.aps-barcode-close::after\s*\{/,
    );
    expect(ruleBlock(CSS_COMPONENTS, '.pe-portions-remove-btn')).toContain('height: 40px');
    expect(ruleBlock(CSS_COMPONENTS, '.pe-field--inline')).toContain('min-height: 31px');
  });

  it('computed sand + blue · видимый габарит ≥44 px (каскад)', { timeout: 30000 }, () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${CSS_600}\n${CSS_611}\n${CSS_COMPONENTS}`));

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
    console.info('[polosa4-task63 computed]', JSON.stringify(table));
  });
});
