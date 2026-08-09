import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

// Два контрола дневника выглядели рабочими, но молча не срабатывали:
// кнопка «Заполнить» искала несуществующий aria-label, а removePhoto не
// доезжал до карточки приёма. Оба провала были невидимыми — их скрывали
// querySelector, вернувший null, и optional chaining. Тест держит связку.

const WEB_DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');

describe('кнопка «Заполнить» в баннере пустых приёмов', () => {
  const diarySrc = read('heys_day_diary_section.js');
  const addProductSrc = read('heys_day_add_product.js');

  it('кнопка добавления продукта несёт стабильный data-атрибут', () => {
    expect(addProductSrc).toMatch(/'data-add-product':/);
  });

  it('одиночное добавление помечено как single — именно его жмёт баннер', () => {
    expect(addProductSrc).toMatch(/autoRepeatCount > 0 \? 'repeat' : \(multiProductMode \? 'multi' : 'single'\)/);
    expect(diarySrc).toContain("button[data-add-product=\"single\"]");
  });

  it('поиск кнопки не привязан к локализованной подписи', () => {
    const lookupLines = diarySrc
      .split('\n')
      .filter((line) => line.includes('querySelector'))
      .filter((line) => line.includes('aria-label'));
    expect(lookupLines, 'поиск по aria-label вернулся').toEqual([]);
  });

  it('есть запасной селектор на случай, если одиночной кнопки нет', () => {
    expect(diarySrc).toContain("button[data-add-product]");
  });
});

describe('удаление фото приёма', () => {
  const mealsSrc = read('day/_meals.js');

  it('removePhoto передан в вызов renderMealsList', () => {
    const callStart = mealsSrc.indexOf('HEYS.dayMealsList?.renderMealsList?.({');
    expect(callStart, 'вызов renderMealsList не найден').toBeGreaterThan(-1);
    const callEnd = mealsSrc.indexOf('}) || [];', callStart);
    expect(callEnd).toBeGreaterThan(callStart);
    const callArgs = mealsSrc.slice(callStart, callEnd);
    expect(callArgs).toMatch(/(^|\s)removePhoto,/m);
  });

  it('цепочка от хука до карточки не разорвана', () => {
    // Определение → возврат из хука → приём в renderMealsList → передача в MealCard.
    expect(mealsSrc).toMatch(/const removePhoto = React\.useCallback/);
    const mealCardCall = mealsSrc.indexOf('removePhoto?.(');
    expect(mealCardCall, 'MealCard больше не зовёт removePhoto').toBeGreaterThan(-1);
  });
});
