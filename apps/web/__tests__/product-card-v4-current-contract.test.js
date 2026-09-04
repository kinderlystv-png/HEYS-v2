import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/product-card.v4.dc.html',
);
const PRODUCT = fs.readFileSync(path.join(ROOT, 'apps/web/heys_add_product_step_v1.js'), 'utf8');
const CSS_611 = fs.readFileSync(path.join(ROOT, 'apps/web/styles/modules/611-aps-product-card.css'), 'utf8');
const CSS_600 = fs.readFileSync(path.join(ROOT, 'apps/web/styles/modules/600-steps-and-aps.css'), 'utf8');
const COMPONENTS = fs.readFileSync(path.join(ROOT, 'apps/web/styles/heys-components.css'), 'utf8');
const DATA_COLOR = 'var(--v4-ink-data, rgba(0, 0, 0, 0.56))';

function contractRows() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  return new Map(
    [...html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)]
      .map((match) => [match[1], match[2]]),
  );
}

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}(?=\\s|\\{)`));
  const start = match?.index ?? -1;
  expect(start, `CSS selector ${selector}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf('}', start);
  expect(end, `closing brace for ${selector}`).toBeGreaterThan(start);
  return source.slice(start, end + 1);
}

const REVIEWED_DATA_ROWS = [
  'Продукт · вставка строки · 04',
  'Продукт · вставка строки · 12',
  'Продукт · вставка строки · 13',
  'Продукт · вставка строки · 19',
  'Продукт · вставка строки · 25',
  'Продукт · дополнительно · 04',
  'Продукт · дополнительно · 10',
  'Продукт · дополнительно · 20',
  'Продукт · дополнительно · 23',
  'Продукт · порции · 10',
  'Продукт · вредность и модерация · 04',
  'Продукт · вредность и модерация · 18',
  'Продукт · вредность и модерация · 19',
  'Продукт · вредность и модерация · 24',
  'Правка продукта · основные · 04',
  'Правка продукта · основные · 07',
  'Правка продукта · основные · 10',
  'Правка продукта · основные · 19',
  'Правка продукта · основные · 20',
  'Правка продукта · основные · 25',
  'Правка продукта · основные · 28',
  'Правка продукта · порции · 04',
  'Правка продукта · порции · 10',
  'Правка продукта · порции · 13',
  'Правка продукта · порции · 17',
  'Продукт · исходы заявки · 12',
  'Штрихкод · наведение · 19',
];

describe('product-card current v4 contract', () => {
  it('keeps the 27 reviewed product data rows on the current 56% floor', () => {
    const rows = contractRows();
    expect(REVIEWED_DATA_ROWS).toHaveLength(27);
    for (const key of REVIEWED_DATA_ROWS) {
      expect(rows.has(key), key).toBe(true);
      expect(rows.get(key), key).toContain('.56)');
    }
  });

  it('maps the reviewed light and dark product selectors to the semantic data role', () => {
    const productSelectors = [
      '.aps-v4-header-count',
      '.aps-v4-harm-breakdown__formula',
      '.aps-v4-harm-breakdown__version',
      '.aps-v4-harm-breakdown__nova',
      '.aps-create-publish__where',
      '.aps-create-format',
      '.aps-create-barcode-note,',
      "[data-theme$='dark'] .aps-create-barcode-note,",
      "[data-theme$='dark'] .aps-create-format",
      '.aps-v4-outcome__warn-body',
      '.aps-v4-portions-row__grams-wrap .aps-v4-portions-row__grams',
      '.aps-v4-portions-suggest__title',
      '.aps-v4-portions-suggest .aps-v4-btn-ghost',
    ];
    for (const selector of productSelectors) {
      expect(rule(CSS_611, selector), selector).toContain(`color: ${DATA_COLOR}`);
    }

    expect(rule(CSS_600, '.aps-preview-macros')).toContain(`color: ${DATA_COLOR}`);
    expect(rule(CSS_600, '.mc-modal:has(.pe-step .pe-portions-block) .mc-header-hint'))
      .toContain(`color: ${DATA_COLOR}`);

    const editorSelectors = [
      '.pe-label',
      '.pe-field--inline .pe-label',
      '.pe-field--inline .pe-input',
      '.pe-portions-block .pe-section-title',
      '.pe-portions-subtitle',
      '.pe-portions-grams-unit',
      '.pe-toggle',
      '.pe-preview',
      '[data-theme$="dark"] .pe-portions-block .pe-section-title',
      '[data-theme$="dark"] .pe-preview',
      '[data-theme$="dark"] .pe-field--inline .pe-input',
    ];
    for (const selector of editorSelectors) {
      expect(rule(COMPONENTS, selector), selector).toContain(`color: ${DATA_COLOR}`);
    }

    expect(rule(CSS_611, '.aps-barcode-overlay--v4-fullscreen .aps-barcode-finder-hint'))
      .toContain('color: rgba(242, 237, 230, 0.56)');
  });

  it('names formula and imported values by neutral source, not guessed author', () => {
    expect(PRODUCT).toContain("'расчёт по формуле'");
    expect(PRODUCT).toContain("'из описания'");
    expect(PRODUCT).toContain("'Указать своё значение'");
    expect(PRODUCT).toContain("harmSourceMode === 'system'");
    expect(PRODUCT).toContain("harmSourceMode === 'own'");
    expect(PRODUCT).toContain('aps-v4-harm-compare');
    expect(PRODUCT).not.toContain("'Расчёт системы'");
    expect(PRODUCT).not.toContain("'Оставить расчёт системы'");
    expect(PRODUCT).not.toContain("'Поставить свою оценку'");
  });

  it('maps portions and NOVA segment geometry to reviewed contract rows', () => {
    expect(rule(CSS_611, '.aps-v4-portions-row')).toContain('grid-template-columns: minmax(0, 1fr) 78px 44px');
    expect(rule(CSS_611, '.aps-v4-portions-row__remove')).toContain('width: 44px');
    expect(rule(CSS_611, '.aps-v4-portions-add')).toContain('margin-top: 8px');
    expect(rule(COMPONENTS, '.pe-segment-btn')).toContain('min-height: 40px');
    expect(rule(COMPONENTS, '.pe-segment-btn')).toContain('var(--v4-ink-data');
    expect(rule(CSS_611, '.aps-v4-harm-compare__card--own .aps-v4-harm-compare__label')).toContain('font-size: 10px');
  });

  it('does not turn graphical and interaction opacity into text data color', () => {
    expect(rule(CSS_611, '.aps-barcode-finder-bars')).toContain('opacity: 0.5');
    expect(rule(CSS_611, '.aps-product-card:active')).toContain('opacity: 0.7');
    expect(rule(CSS_611, '.aps-create-btn:disabled')).toContain('opacity: 0.6');
  });
});
