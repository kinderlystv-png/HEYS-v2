import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const mealsSource = fs.readFileSync(
  path.resolve(__dirname, '../day/_meals.js'),
  'utf8',
);
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

describe('meal add flow v4 structure', () => {
  it('shows fork modal after meal create with repeat-recent and one/multi options', () => {
    expect(mealsSource).toContain("className: 'flow-add-products'");
    expect(mealsSource).toContain('flow-selection-btn--repeat-recent');
    expect(mealsSource).toContain('handleFlowRepeatRecent');
    expect(mealsSource).toContain('Повторить из недавних');
    expect(mealsSource).toContain('Один продукт');
    expect(mealsSource).toContain('Несколько продуктов');
    expect(mealsSource).not.toContain('openAddProductModal(mealIndex, true, newDayData, 0');
  });

  it('keeps barcode entry on the search step', () => {
    expect(addProductSource).toContain('aps-search-barcode-btn');
    expect(addProductSource).toContain('BarcodeScanIcon');
    expect(mealsSource).toContain('startWithBarcodeScanner: options.startWithBarcodeScanner === true');
    expect(mealsSource).toContain('barcodeCameraStart: options.barcodeCameraStart || null');
  });

  it('keeps v4 fork styles wired for post-meal flow', () => {
    expect(cssSource).toContain('.flow-selection-btn--repeat-recent');
    expect(cssSource).toContain('var(--v4-sand-hero, #efe3cf)');
    expect(mealsSource).toContain('heys-stepmodal-closed');
  });
});
