import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const mealsSource = fs.readFileSync(
  path.resolve(__dirname, '../day/_meals.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8',
);

describe('meal add-products fork v4 structure', () => {
  it('keeps the three-path fork and canvas copy', () => {
    expect(mealsSource).toContain('flow-add-products');
    expect(mealsSource).toContain('flow-selection-btn--repeat-recent');
    expect(mealsSource).toContain('Повторить из недавних');
    expect(mealsSource).toContain('Один продукт');
    expect(mealsSource).toContain('Выбрать и сразу закрыть');
    expect(mealsSource).toContain('Несколько продуктов');
    expect(mealsSource).toContain('Остаться в добавлении');
    expect(mealsSource).toContain('из приёма за последние 2 дня');
    expect(mealsSource).toContain('handleFlowRepeatRecent');
    expect(mealsSource).toContain('onClick: () => openFlowAddProduct(multiProductMode, 0, false)');
    expect(mealsSource).not.toContain('Быстро добавить 1 продукт');
    expect(mealsSource).not.toContain('Формировать приём пошагово');
    expect(mealsSource).not.toContain('`Еще ${n}`');
    expect(mealsSource).not.toContain('Ещё 2');
  });

  it('paints hero and quiet rows with v4 roles, scanner as a square', () => {
    expect(cssSource).toContain('.flow-selection-btn--repeat-recent');
    expect(cssSource).toContain('var(--v4-sand-hero, #efe3cf)');
    expect(cssSource).toContain('.flow-selection-row');
    expect(cssSource).toContain('var(--v4-sand-surface, #f7efe2)');
    expect(cssSource).toMatch(/\.flow-selection-btn__barcode-tap \{[\s\S]*?width:\s*36px/);
    expect(cssSource).toMatch(/\.flow-selection-btn__barcode-tap \{[\s\S]*?height:\s*36px/);
    expect(cssSource).toContain('.confirm-modal:has(.flow-add-products)');
  });
});
