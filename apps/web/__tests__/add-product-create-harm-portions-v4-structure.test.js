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
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8',
);

describe('add product create/harm/portions v4 canvas structure', () => {
  it('uses v4 portions shell with dots and row list', () => {
    expect(addProductSource).toContain('aps-v4-portions-step');
    expect(addProductSource).toContain('renderApsCreateDots(1)');
    expect(addProductSource).toContain('aps-v4-portions-list');
    expect(addProductSource).toContain('aps-v4-footer--split');
    expect(addProductSource).not.toContain('aps-portions-icon');
  });

  it('uses v4 harm shell with calc card, radios and save CTA', () => {
    expect(addProductSource).toContain('aps-v4-harm-step');
    expect(addProductSource).toContain('aps-v4-harm-calc-card');
    expect(addProductSource).toContain('aps-v4-harm-radio');
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
    expect(cssSource).toContain('.aps-v4-harm-calc-card');
    expect(cssSource).toContain('.aps-v4-portions-list');
    expect(cssSource).toContain('.aps-v4-create-auto-field');
    expect(cssSource).toContain('.photo-viewer-overlay--v4');
    expect(cssSource).toContain('.aps-v4-btn-attention');
  });
});
