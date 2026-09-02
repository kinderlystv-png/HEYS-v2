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

  it('states speak the canvas copy and say the offline part once', () => {
    // Кадры дают каждому состоянию свой заголовок. Раньше три из четырёх были
    // написаны своими словами, а офлайн говорил «Общая база недоступна» и в
    // теле, и в списке галочек — то самое «прочитает про офлайн дважды»,
    // от которого предостерегает кадр.
    expect(addProductSource).toContain("'Нет сети'");
    expect(addProductSource).toContain(
      "'Личные продукты и наборы доступны, приём сохранится и уйдёт в облако, когда сеть вернётся.'");
    expect(addProductSource).toContain("'Общая база недоступна'");
    expect(addProductSource).toContain("'По этому запросу ничего нет'");
    expect(addProductSource).toContain(
      "'Здесь появятся продукты, которые вы едите чаще всего'");
    expect(addProductSource).toContain("'Доступно офлайн'");
    expect(addProductSource).toContain("'Доступно сейчас'");
    expect(addProductSource).toContain("'Или сразу'");
    expect(addProductSource).not.toContain("'✗ Поиск по общей базе'");
    expect(addProductSource).not.toContain("'✓ Личные продукты из кэша'");
    // Под ярусом стоят реальные доступные продукты, а не список галочек.
    expect(addProductSource).toContain('tierRows');
  });

  it('keeps search state cards on the sand paper of the screen', () => {
    // Карточка офлайна стояла на зелёной бумаге чужого набора.
    expect(cssSource).not.toMatch(/\.aps-v4-search-offline-card[^}]*v4-sage-/s);
    expect(cssSource).toMatch(
      /\.aps-v4-search-offline-card \{[^}]*background: var\(--v4-hero/s);
    expect(cssSource).toMatch(
      /\.aps-v4-search-state--warn \.aps-v4-search-state__title \{[^}]*v4-act-text/s);
  });

  it('просмотр фото собран по кадру, а не эмодзи-кнопками', () => {
    const gallery = fs.readFileSync(path.resolve(__dirname, '../heys_day_gallery.js'), 'utf8');
    // Кадр «Фото · просмотр»: слева кружок возврата 30 px, рядом имя приёма со
    // временем; действия внизу — «Ещё снимок» на остаток ряда и «Удалить»
    // тоном внимания. Стояли эмодзи «🗑» и «✕» в шапке и счётчик «1 / 3».
    expect(gallery).not.toContain("'🗑'");
    expect(gallery).not.toContain("closeBtn.innerHTML = '✕'");
    expect(gallery).toContain('photo-viewer-back');
    expect(gallery).toContain("addBtn.textContent = 'Ещё снимок'");
    expect(gallery).toContain("deleteBtn.textContent = 'Удалить'");
    // Тона здесь свои и названы строкой «цвета не из палитры»: системный слой
    // галереи поверх любой темы, он не следует набору намеренно.
    expect(cssSource).toMatch(/\.photo-viewer-action \{[^}]*rgba\(242, 237, 230, 0\.12\)/s);
    expect(cssSource).toMatch(/\.photo-viewer-action--delete \{[^}]*#e2a468/s);
    expect(cssSource).toMatch(/\.photo-viewer-back \{[^}]*width: 30px;/s);
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
    // Вкладка питания открывает лист своим путём — там итог получает фото от
    // общего обработчика приёма, а не от потока нового приёма.
    expect(dayMealsSource).toContain('onPhoto: (payload) => addMealPhoto');
  });

  it('paints edge and summary shells in APS css', () => {
    expect(cssSource).toContain('.aps-v4-search-state__similar');
    expect(cssSource).toContain('.aps-v4-meal-summary__photo-grid');
    expect(cssSource).toContain('.aps-v4-create-form');
    expect(cssSource).toContain('.aps-v4-btn-paper');
  });
});
