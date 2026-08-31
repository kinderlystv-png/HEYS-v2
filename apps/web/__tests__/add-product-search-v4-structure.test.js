import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
// Файл разрезан по зонам 31 августа: оболочка осталась в 600, экраны уехали
// в 610–613. Тест смотрит на поток добавления целиком, поэтому читает всю
// группу — иначе он проверял бы половину правил и молчал о второй.
const cssSource = [
  '600-steps-and-aps.css',
  '610-aps-meal-flow.css',
  '611-aps-product-card.css',
  '612-training-step.css',
  '613-cycle-ui.css',
]
  .map((file) => fs.readFileSync(path.resolve(__dirname, '../styles/modules/' + file), 'utf8'))
  .join('\n');

describe('add product search v4 canvas structure', () => {
  it('uses v4 tabs and rows instead of legacy quick filters', () => {
    expect(addProductSource).toContain("useState('frequent')");
    expect(addProductSource).toContain('aps-v4-search-tabs');
    expect(addProductSource).toContain('aps-v4-product-row');
    expect(addProductSource).toContain('renderV4ProductRow');
    expect(addProductSource).toContain("placeholder: 'Поиск продукта'");
    expect(addProductSource).toContain('searchStepTitle');
    expect(addProductSource).toContain('Замечено в истории');
    expect(addProductSource).not.toContain("useState('smart')");
    expect(addProductSource).not.toContain('aps-quick-filter');
    expect(addProductSource).not.toContain('showSharedProducts');
  });

  it('paints search shell with v4 sand roles', () => {
    expect(cssSource).toContain('.aps-v4-search-tabs');
    expect(cssSource).toContain('.aps-v4-browse-list');
    expect(cssSource).toContain('background: var(--v4-sand-surface, #f7efe2)');
    expect(cssSource).toContain("viewBox='0 0 24 24'");
    expect(cssSource).toContain('.mc-modal:has(.aps-v4-flow)');
    expect(cssSource).toContain('.aps-v4-search-footnote');
  });

  it('shows recipe composition on v4 product rows', () => {
    expect(addProductSource).toContain('formatRecipeSummary');
    expect(addProductSource).toContain('Состав рецепта');
    expect(addProductSource).toContain('Исправить записи в дневнике');
    expect(cssSource).toContain('.aps-product-recipe');
  });
});
