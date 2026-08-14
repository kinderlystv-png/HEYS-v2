// Регресс: успех сохранения приёма/продукта не должен утверждаться, если
// localStorage-запись провалилась. lsSet возвращает строгий boolean
// (heys_core_v12.js:216) и никогда не бросает — поэтому единственный способ
// узнать о провале это прочитать возвращаемое значение, а не try/catch.
const fs = require('fs');
const path = require('path');

function readDayMealsSource() {
  return fs.readFileSync(path.resolve(__dirname, '../day/_meals.js'), 'utf8');
}

describe('day/_meals.js — честность после записи в localStorage', () => {
  it('persistDayData возвращает результат lsSet, а не игнорирует его', () => {
    const source = readDayMealsSource();
    expect(source).toContain('return lsSet(key, safeDayData);');
  });

  it('не показывает ложный успех при провале записи приёма (fork-модалка вместо toast)', () => {
    const source = readDayMealsSource();
    const anchor = "const mealPersisted = persistDayData(newDayData, 'create_meal_mobile_flow');";
    const mealCreateBlock = source.slice(source.indexOf(anchor), source.indexOf(anchor) + 700);
    expect(mealCreateBlock).toContain('const mealPersisted = persistDayData(');
    expect(mealCreateBlock).toContain('if (mealPersisted) {');
    expect(mealCreateBlock).not.toContain("HEYS.Toast?.success('Приём создан');");
    expect(mealCreateBlock).toContain('toast не нужен');
    expect(mealCreateBlock).toContain("HEYS.Toast?.error('Не удалось сохранить приём. Попробуйте ещё раз.');");
  });

  it('одиночное добавление продукта (inline-флоу) прерывается при провале записи', () => {
    const source = readDayMealsSource();
    const idx = source.indexOf('inlineProductPersisted = lsSet(key, newDayData);');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 1800);
    expect(block).toContain('if (!inlineProductPersisted) {');
    expect(block).toContain("HEYS.Toast?.error?.('Не удалось сохранить продукт. Попробуйте ещё раз.');");
    expect(block).toContain('return false;');
  });

  it('addProductToMeal прерывается при провале записи, не показывая успех', () => {
    const source = readDayMealsSource();
    const idx = source.indexOf('productPersisted = lsSet(key, newDayData);');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 400);
    expect(block).toContain('if (!productPersisted) {');
    expect(block).toContain('return false;');
  });

  it('addProductsToMeal (батч) прерывается при провале записи', () => {
    const source = readDayMealsSource();
    const idx = source.indexOf('productsPersisted = lsSet(key, newDayData);');
    expect(idx).toBeGreaterThan(-1);
    const block = source.slice(idx, idx + 400);
    expect(block).toContain('if (!productsPersisted) {');
    expect(block).toContain('return false;');
  });
});
