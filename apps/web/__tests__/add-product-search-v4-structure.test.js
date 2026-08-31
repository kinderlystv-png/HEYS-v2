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
  it('строка списка даёт звезду избранного, а не мёртвый плюс', () => {
    // Кадр «Добавление · выбор способа»: справа в строке звезда — залитая
    // тоном --acs, пустая чернилами 28 %. Раньше здесь стоял плюс с
    // `pointer-events: none`, а единственная живая звезда лежала в
    // `renderProductCard` — функции, которую в v4 никто не вызывает.
    expect(addProductSource).toContain('aps-v4-product-row__fav');
    expect(addProductSource).toContain('toggleFavorite(e, pid)');
    expect(addProductSource).not.toContain('aps-v4-product-row__add');
    expect(cssSource).toMatch(/\.aps-v4-product-row__fav \{[^}]*width: 44px;[^}]*height: 44px;/s);
    expect(cssSource).toMatch(/\.aps-v4-product-row__fav\.is-active \{[^}]*var\(--v4-act,/s);
    // Кнопка в кнопку не вкладывается: строка стала контейнером.
    expect(addProductSource).toContain('aps-v4-product-row__pick');
  });

  it('«Общие» — фильтр выдачи, а не четвёртая вкладка', () => {
    // Строка «вид · чип «Общие»»: «не вкладка и не элемент строки поиска, а
    // фильтр выдачи: стоит справа в строке над списком, которая эту выдачу и
    // описывает». Оба кадра списка рисуют три вкладки.
    expect(addProductSource).toContain('aps-v4-shared-filter');
    expect(addProductSource).toContain('sharedFilterOn');
    expect(addProductSource).not.toContain("handleBrowseTab('shared')");
    expect(addProductSource).not.toContain("quickList === 'shared'");
    // Выключен — строк общей базы в выдаче нет и «Найдено» считает остаток.
    expect(addProductSource).toContain('const visibleResults');
    expect(addProductSource).toContain('`Найдено ${visibleResults.length}`');
    // Включён — заливка --c2 тоном --ac; выключен — обводка 1,5 px.
    expect(cssSource).toMatch(/\.aps-v4-shared-filter \{[^}]*inset 0 0 0 1\.5px/s);
    expect(cssSource).toMatch(/\.aps-v4-shared-filter\.is-on \{[^}]*var\(--v4-hero/s);
    // Цель — его собственные 70 × 26.
    expect(cssSource).toMatch(/\.aps-v4-shared-filter \{[^}]*min-width: 70px;[^}]*min-height: 26px;/s);
  });

  it('общий продукт помечен в строке метаданных, а не частотой', () => {
    // Строка «продукт из общей базы»: «вместо частоты идёт «общая база» тоном
    // --wat со значком глобуса 11 px того же тона».
    expect(addProductSource).toContain('aps-v4-product-row__shared');
    expect(addProductSource).toContain('meta.isShared');
    expect(cssSource).toMatch(/\.aps-v4-product-row__shared \{[^}]*var\(--v4-water/s);
  });

  it('над вкладками стоит вход в создание продукта', () => {
    // Строка «вид · две кнопки над вкладками». Вторую кнопку («Фото») ставить
    // нельзя: строка «единственный вход» того же контракта запрещает второй
    // вход для снимка. Спор записан в UI_V4_FINDINGS.md.
    expect(addProductSource).toContain('aps-v4-browse-actions');
    expect(addProductSource).toContain("            'Новый продукт')");
    expect(cssSource).toMatch(/\.aps-v4-browse-action \{[^}]*min-height: 44px;/s);
  });

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
