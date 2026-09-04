import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
const dayAddSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_add_product.js'),
  'utf8',
);
const gallerySource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_gallery.js'),
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

describe('add product create/harm/portions v4 canvas structure', () => {
  it('uses v4 portions shell with dots and row list', () => {
    expect(addProductSource).toContain('aps-v4-portions-step');
    expect(addProductSource).toContain('renderApsCreateDots(1)');
    expect(addProductSource).toContain('aps-v4-portions-list');
    expect(addProductSource).toContain('aps-v4-footer--split');
    expect(addProductSource).not.toContain('aps-portions-icon');
  });

  it('uses v4 harm shell with compare cards, breakdown and save CTA', () => {
    expect(addProductSource).toContain('aps-v4-harm-step');
    expect(addProductSource).toContain('aps-v4-harm-compare');
    expect(addProductSource).toContain('aps-v4-harm-breakdown');
    expect(addProductSource).toContain('Сохранить продукт');
    expect(addProductSource).toContain('Куда попадёт продукт');
    expect(addProductSource).toContain('renderApsCreateDots(2)');
  });

  it('uses create variant A with auto macros and advanced detail', () => {
    expect(addProductSource).toContain('Название и состав');
    expect(addProductSource).toContain('aps-v4-create-auto-field');
    expect(addProductSource).toContain('Состав подробнее');
    expect(addProductSource).toContain('autoMacros');
  });

  it('uses v4 photo polish and barcode edge copy', () => {
    expect(dayAddSource).toContain('aps-v4-meal-summary__photo-delete');
    expect(dayAddSource).toContain('aps-v4-meal-summary__photo-note');
    expect(gallerySource).toContain('photo-viewer-overlay--v4');
    expect(addProductSource).toContain('aps-v4-barcode-multi');
    expect(addProductSource).toContain('Сканировать ещё');
    expect(addProductSource).toContain('aps-v4-btn-attention');
  });

  it('paints new v4 classes', () => {
    expect(cssSource).toContain('.aps-v4-harm-compare');
    expect(cssSource).toContain('.aps-v4-portions-list');
    expect(cssSource).toContain('.aps-v4-create-auto-field');
    expect(cssSource).toContain('.photo-viewer-overlay--v4');
    expect(cssSource).toContain('.aps-v4-btn-attention');
  });
});
