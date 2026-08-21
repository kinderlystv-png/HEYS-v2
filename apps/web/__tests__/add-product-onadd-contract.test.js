// Стык между листом добавления продукта и дневником.
//
// Лист (`heys_add_product_step_v1.js`) отдаёт наружу ОДИН объект:
//   context.onAdd({ product, grams, mealIndex, mealId, _traceId, _origin })
// А приёмник в дневнике — `addProductToMeal(mi, p, options)` — принимает
// позиционные аргументы.
//
// Прод, 21.08.2026: в двух местах `onAdd` был подставлен напрямую
// (`onAdd: addProductToMeal`). Весь объект попадал в слот номера приёма,
// продукт оказывался undefined, и добавление падало на «Продукт не сохранён в
// базу. Запись в дневник не добавлена» — при живом и совершенно целом продукте.
// В консоли это выглядело обманчиво: `productId: null, productName: null`, хотя
// сам продукт лежал рядом, внутри поля `mealIndex`.
//
// Живьём стык не ловится ничем, кроме попытки добавить продукт: обе стороны по
// отдельности исправны, ломается только их соединение.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const read = (relative) => fs.readFileSync(path.resolve(__dirname, relative), 'utf8');

const mealsSource = read('../day/_meals.js');
const stepSource = read('../heys_add_product_step_v1.js');

describe('стык «лист добавления → дневник»', () => {
  it('лист по-прежнему отдаёт один объект, а не позиционные аргументы', () => {
    // Если это перестанет быть правдой, переходники ниже надо пересматривать.
    expect(stepSource).toMatch(/const payload = \{[\s\S]{0,200}product: productForSubmit/);
    expect(stepSource).toContain('context.onAdd(payload);');
  });

  it('приёмник в дневнике принимает позиционные аргументы', () => {
    expect(mealsSource).toMatch(/const addProductToMeal = React\.useCallback\(async \(mi, p, options/);
  });

  it('ни один onAdd не подставлен напрямую — иначе объект уедет в слот номера приёма', () => {
    const direct = mealsSource.match(/onAdd:\s*addProductToMeal\s*[,)]/g) || [];
    expect(
      direct,
      'onAdd подставлен напрямую: лист отдаёт объект, а функция ждёт (mi, p)',
    ).toEqual([]);
  });

  it('каждый onAdd разбирает объект и достаёт из него product', () => {
    // Ищем все значения onAdd: и требуем, чтобы в списке параметров был product.
    const handlers = [...mealsSource.matchAll(/onAdd:\s*(async\s*)?\(([^)]*)\)/g)];
    expect(handlers.length, 'onAdd в дневнике не найден вовсе').toBeGreaterThan(0);
    for (const [, , params] of handlers) {
      expect(
        params,
        'onAdd принимает «' + params.trim() + '» — продукт из объекта не достаётся',
      ).toContain('product');
    }
  });

  it('переходники доносят граммы: их читает buildAddProductItem с самого продукта', () => {
    // grams приходят отдельным полем объекта, а ниже по течению берутся из
    // finalProduct.grams — значит их обязаны слить в продукт.
    expect(mealsSource).toContain('grams: finalProduct.grams || 100');
    const adapters = mealsSource.match(/\{ \.\.\.product, grams \}/g) || [];
    expect(adapters.length, 'граммы теряются по дороге').toBeGreaterThanOrEqual(2);
  });

  it('переходники резолвят приём по mealId, а не доверяют голому индексу', () => {
    // Между открытием листа и нажатием «Добавить» состав дня мог измениться,
    // поэтому индекс пересчитывается от актуального дня.
    const resolves = mealsSource.match(/addMealIndex \?\? (resolvedIndex|mealIndex)/g) || [];
    expect(resolves.length).toBeGreaterThanOrEqual(2);
  });
});
