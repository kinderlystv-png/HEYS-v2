import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
const dayMealsSource = fs.readFileSync(
  path.resolve(__dirname, '../day/_meals.js'),
  'utf8',
);
const dayAddSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_add_product.js'),
  'utf8',
);
const stepModalSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_step_modal_v1.js'),
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

describe('add product search edge v4 canvas structure', () => {
  it('renders four search edge states with canvas copy and actions', () => {
    expect(addProductSource).toContain("function renderApsSearchEmptyState(state, handlers = {})");
    expect(addProductSource).toContain("state === 'empty_base'");
    expect(addProductSource).toContain("state === 'load_failed'");
    expect(addProductSource).toContain("state === 'no_results'");
    expect(addProductSource).toContain("state === 'offline'");
    expect(addProductSource).toContain("'Искать в общей базе'");
    expect(addProductSource).toContain("'Близкое по названию'");
    expect(addProductSource).toContain('aps-v4-search-offline-card');
    expect(addProductSource).toContain('findSimilarPersonalProducts');
    expect(addProductSource).toContain("className: 'aps-search-field' + (searchFieldFocused ? ' is-focused' : '')");
  });

  it('uses fullscreen barcode layer and dedicated not-found screen', () => {
    expect(addProductSource).toContain('aps-barcode-overlay--v4-fullscreen');
    expect(addProductSource).toContain('aps-barcode-not-found-screen');
    expect(addProductSource).toContain('barcodeNotFoundCode');
    expect(addProductSource).toContain('fullscreen: barcodeModal.mode !== \'product\'');
  });

  it('wires APS exit guard through StepModal close channels', () => {
    expect(addProductSource).toContain('function useApsCloseGuard(ref, requestCloseModal)');
    expect(addProductSource).toContain('onRequestClose: (proceed) =>');
    expect(addProductSource).toContain('apsCloseGuardRef');
    expect(stepModalSource).toContain('onRequestClose(forceClose)');
  });

  it('uses v4 create form step 1 and preset confirm modals', () => {
    expect(addProductSource).toContain('aps-v4-create-dots');
    expect(addProductSource).toContain('handleFormContinue');
    expect(addProductSource).toContain('aps-v4-preset-confirm');
    expect(addProductSource).toContain('deleteConfirmPreset');
    expect(addProductSource).toContain('saveConfirmOpen');
    expect(addProductSource).toContain('Замечено в истории');
  });
});

describe('meal summary wiring v4', () => {
  it('passes photo and preset handlers from day meals into summary', () => {
    expect(dayMealsSource).toContain('onPhoto: (payload) => handleAddPhoto');
    expect(dayMealsSource).toContain('onSavePreset: () =>');
    expect(dayAddSource).toContain('aps-v4-meal-summary__photo-grid');
    expect(dayAddSource).toContain('Итого за приём');
    expect(dayAddSource).toContain('aps-v4-btn-paper');
  });

  it('paints edge and summary shells in APS css', () => {
    expect(cssSource).toContain('.aps-v4-search-state__similar');
    expect(cssSource).toContain('.aps-v4-meal-summary__photo-grid');
    expect(cssSource).toContain('.aps-v4-create-form');
    expect(cssSource).toContain('.aps-v4-btn-paper');
  });
});
