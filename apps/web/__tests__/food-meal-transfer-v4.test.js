import fs from 'node:fs';
import path from 'node:path';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const COPY_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_day_copy_meal_modal_v1.js'), 'utf8');
const MOVE_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_move_modal_v1.js'), 'utf8');
const DAY_MEALS_SOURCE = fs.readFileSync(path.join(WEB_DIR, 'day/_meals.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/610-aps-meal-flow.css'), 'utf8');

function loadScript(relativePath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relativePath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(window, document);
}

function readFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`Function ${name} not found`);
  // eslint-disable-next-line no-new-func
  return new Function(`${source.slice(start, end)}; return ${name};`)();
}

function readFunctionWithDependencies(source, name, nextName, dependencies) {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start);
  if (start < 0 || end < 0) throw new Error(`Function ${name} not found`);
  const names = Object.keys(dependencies);
  // eslint-disable-next-line no-new-func
  const factory = new Function(...names, `${source.slice(start, end)}; return ${name};`);
  return factory(...names.map(key => dependencies[key]));
}

const buildMealMoveDestination = readFunction(
  DAY_MEALS_SOURCE,
  'buildMealMoveDestination',
  'rollbackMealMoveDestination',
);
const rollbackMealMoveDestination = readFunction(
  DAY_MEALS_SOURCE,
  'rollbackMealMoveDestination',
  'cloneItemsFromMeal',
);
const executeMealMoveTransaction = readFunctionWithDependencies(
  DAY_MEALS_SOURCE,
  'executeMealMoveTransaction',
  'cloneItemsFromMeal',
  { buildMealMoveDestination, rollbackMealMoveDestination },
);

const copyOptions = (overrides = {}) => ({
  sourceMeal: {
    id: 'source',
    name: 'Ужин',
    items: [
      { id: 'coffee', name: 'Домашний кофе', grams: 100, kcal100: 17 },
      { id: 'cheese', name: 'Творог', grams: 137, kcal100: 115 },
    ],
  },
  sourceMealIndex: 1,
  sourceDate: '2026-09-01',
  targetDate: '2026-09-01',
  targetMeals: [
    { id: 'breakfast', name: 'Завтрак', time: '09:00', items: [] },
    { id: 'source', name: 'Ужин', time: '19:00', items: [] },
  ],
  onCopyToExisting: vi.fn(),
  onCopyToNew: vi.fn(),
  ...overrides,
});

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.ReactDOM = { createRoot };
  window.HEYS = {
    models: {
      normalizeItemGrams: (grams, fallback) => Number(grams) || fallback,
    },
  };
  await act(async () => {
    loadScript('heys_day_copy_meal_modal_v1.js');
    loadScript('heys_move_modal_v1.js');
    await new Promise(resolve => setTimeout(resolve, 0));
  });
});

afterAll(async () => {
  await act(async () => {
    window.HEYS.CopyMealModal.hide();
    window.HEYS.MoveModal.hide();
  });
  document.getElementById('copy-meal-modal-root')?.remove();
  document.getElementById('copy-meal-modal-anim')?.remove();
  document.getElementById('move-modal-root')?.remove();
  document.getElementById('move-modal-anim')?.remove();
  document.documentElement.removeAttribute('data-theme-id');
});

describe('food-meal · копирование и перенос v4', () => {
  it.each(['sand', 'sand-dark', 'blue', 'blue-dark'])(
    'держит один классовый контракт без inline-палитры в теме %s',
    async (themeId) => {
      document.documentElement.dataset.themeId = themeId;
      await act(async () => {
        window.HEYS.CopyMealModal.show(copyOptions());
      });

      const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
      expect(sheet).not.toBeNull();
      expect(sheet?.hasAttribute('style')).toBe(false);
      expect(sheet?.querySelector('.meal-transfer-v4__top')?.hasAttribute('style')).toBe(false);
      expect(sheet?.querySelector('.meal-transfer-v4__target')?.hasAttribute('style')).toBe(false);
      expect(sheet?.querySelector('.meal-transfer-v4__button--primary')?.hasAttribute('style')).toBe(false);
    },
  );

  it('рендерит геометрию, точный copy и живой итог выбранной цели', async () => {
    await act(async () => {
      window.HEYS.CopyMealModal.show(copyOptions());
    });

    const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
    expect(sheet?.classList.contains('meal-transfer-v4__sheet--empty-targets')).toBe(false);
    expect(sheet?.querySelector('.meal-transfer-v4__title')?.textContent).toBe('копировать');
    expect(sheet?.querySelector('.meal-transfer-v4__tier-row')?.textContent).toContain('Продукты 2/2');
    expect(sheet?.querySelector('.meal-transfer-v4__product-meta')?.textContent).toBe('100 г · 17 ккал');
    expect(sheet?.querySelectorAll('.meal-transfer-v4__gram-step')).toHaveLength(4);
    expect(sheet?.querySelectorAll('.meal-transfer-v4__range')).toHaveLength(2);
    expect(sheet?.querySelector('.meal-transfer-v4__tier')?.textContent).toBe('Куда копировать · сегодня');
    expect(sheet?.querySelector('.meal-transfer-v4__summary')?.textContent).toBe('Завтрак: 0 → 175 ккал (+175)');
    expect(sheet?.querySelector('.meal-transfer-v4__button--primary')?.textContent).toBe('Копировать (2)');
  });

  it('копирует выбранный состав в явно выбранную new-цель', async () => {
    const onCopyToExisting = vi.fn();
    const onCopyToNew = vi.fn();
    await act(async () => {
      window.HEYS.CopyMealModal.show(copyOptions({ onCopyToExisting, onCopyToNew }));
    });

    const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
    const newTarget = sheet?.querySelector('[data-copy-meal-target="new-meal"] input');
    await act(async () => {
      newTarget?.click();
    });
    expect(sheet?.querySelector('.meal-transfer-v4__summary')).toBeNull();

    await act(async () => {
      sheet?.querySelector('.meal-transfer-v4__button--primary')?.click();
    });
    expect(onCopyToExisting).not.toHaveBeenCalled();
    expect(onCopyToNew).toHaveBeenCalledWith(
      ['coffee', 'cheese'],
      { coffee: 100, cheese: 137 },
    );
  });

  it('выбирает существующий приём по id и отдаёт явную семантику merge', async () => {
    const onPick = vi.fn();
    await act(async () => {
      window.HEYS.MoveModal.show({
        mode: 'meal-move',
        sourceDate: '2026-09-01',
        daysWithMeals: [
          { dateStr: '2026-09-01', dateLabel: 'Сегодня', meals: [{ id: 'src', name: 'Ужин' }] },
          {
            dateStr: '2026-08-31',
            dateLabel: 'Вчера',
            meals: [
              { id: 'breakfast', name: 'Завтрак', time: '09:00' },
              { id: 'lunch', name: 'Обед', time: '14:00' },
            ],
          },
        ],
        onPick,
      });
    });

    const sheet = document.querySelector('.move-modal.meal-transfer-v4__sheet--move');
    expect(sheet?.querySelector('.meal-transfer-v4__title')?.textContent).toBe('перенести');
    expect(sheet?.querySelector('.meal-transfer-v4__date-label')?.textContent).toBe('Вчера, 31 августа');
    const targets = [...sheet.querySelectorAll('input[name="move-meal-target"]')];
    expect(targets).toHaveLength(3);
    expect(targets[0].checked).toBe(true);
    expect(targets[0].closest('label')?.textContent).toBe('Завтрак · 09:00');
    expect(targets[0].closest('label')?.dataset.moveMealTarget).toBe('breakfast');
    expect(sheet?.querySelector('.meal-transfer-v4__warning')?.textContent).toBe(
      'Приём уйдёт из сегодняшнего дня целиком — итоги обоих дней пересчитаются.',
    );

    await act(async () => {
      targets[1].click();
    });
    expect(targets[1].checked).toBe(true);
    expect(targets[1].closest('label')?.classList.contains('is-selected')).toBe(true);

    await act(async () => {
      sheet?.querySelector('.meal-transfer-v4__button--primary')?.click();
    });
    expect(onPick).toHaveBeenCalledWith({
      dstDate: '2026-08-31',
      targetMode: 'existing',
      dstMealId: 'lunch',
    });
  });

  it('держит move-actions сразу после предупреждения, как в Canvas', () => {
    expect(CSS).toMatch(/\.meal-transfer-v4__move-content\s*\{[^}]*flex:\s*0 1 auto;/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__move-content\s*\{[^}]*padding:\s*6px 18px 0;/s);
    expect(CSS).toMatch(
      /\.meal-transfer-v4__sheet--move \.meal-transfer-v4__move-content > \.meal-transfer-v4__tier:first-child\s*\{[^}]*margin-top:\s*14px;/s,
    );
    expect(CSS).toMatch(
      /\.meal-transfer-v4__sheet--move \.meal-transfer-v4__date\s*\{[^}]*min-height:\s*0;/s,
    );
    expect(CSS).toMatch(/\.meal-transfer-v4__date-label\s*\{[^}]*line-height:\s*1;/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__calendar\s*\{[^}]*line-height:\s*0;/s);
  });

  it('в пустом дне выбирает create-new и не выдумывает dstMealId', async () => {
    const onPick = vi.fn();
    await act(async () => {
      window.HEYS.MoveModal.show({
        mode: 'meal-move',
        sourceDate: '2026-09-01',
        daysWithMeals: [
          { dateStr: '2026-09-01', dateLabel: 'Сегодня', meals: [{ id: 'src', name: 'Ужин' }] },
          { dateStr: '2026-08-31', dateLabel: 'Вчера', meals: [] },
        ],
        onPick,
      });
    });

    const sheet = document.querySelector('.move-modal.meal-transfer-v4__sheet--move');
    const targets = [...sheet.querySelectorAll('input[name="move-meal-target"]')];
    expect(targets).toHaveLength(1);
    expect(targets[0].checked).toBe(true);
    expect(targets[0].closest('label')?.textContent).toBe('+ Создать новый приём');

    await act(async () => {
      sheet?.querySelector('.meal-transfer-v4__button--primary')?.click();
    });
    expect(onPick).toHaveBeenCalledWith({ dstDate: '2026-08-31', targetMode: 'new' });
  });

  it('честно merge-ит весь состав, сохраняет фото и контекст цели', () => {
    const target = {
      id: 'lunch', name: 'Обед', time: '14:00', stress: 2,
      items: [{ id: 'salad' }], photos: [{ id: 'target-photo' }],
    };
    const source = {
      id: 'dinner', name: 'Ужин', time: '19:00', mood: 7, stress: 8,
      items: [{ id: 'old-coffee' }], photos: [{ id: 'source-photo' }],
    };
    const existingDay = { date: '2026-08-31', meals: [target] };
    const plan = buildMealMoveDestination(existingDay, {
      targetMode: 'existing',
      dstMealId: 'lunch',
      sourceMeal: source,
      preparedItems: [{ id: 'moved-coffee' }],
      updatedAt: 100,
    });

    expect(plan.destinationMealId).toBe('lunch');
    expect(plan.day.meals).toHaveLength(1);
    expect(plan.day.meals[0]).toMatchObject({
      id: 'lunch', name: 'Обед', time: '14:00', mood: 7, stress: 2,
    });
    expect(plan.day.meals[0].items.map(item => item.id)).toEqual(['salad', 'moved-coffee']);
    expect(plan.day.meals[0].photos.map(photo => photo.id)).toEqual(['target-photo', 'source-photo']);
    expect(existingDay.meals[0].items.map(item => item.id)).toEqual(['salad']);
    expect(rollbackMealMoveDestination(plan.day, plan, 200).meals[0]).toBe(target);
  });

  it('блокирует устаревшую existing-цель и создаёт отдельный приём только в режиме new', () => {
    const day = { date: '2026-08-31', meals: [] };
    const source = { id: 'src', name: 'Ужин', items: [{ id: 'old' }] };
    expect(buildMealMoveDestination(day, {
      targetMode: 'existing', dstMealId: 'gone', sourceMeal: source, preparedItems: [{ id: 'new' }],
    })).toBeNull();

    const plan = buildMealMoveDestination(day, {
      targetMode: 'new', sourceMeal: source, preparedItems: [{ id: 'new' }], newMealId: 'moved', updatedAt: 100,
    });
    expect(plan.day.meals[0]).toMatchObject({ id: 'moved', name: 'Ужин', items: [{ id: 'new' }] });
    expect(rollbackMealMoveDestination(plan.day, plan, 200).meals).toEqual([]);
  });

  it('existing merge сначала пишет target, затем удаляет source и меняет итоги обоих дней', async () => {
    const days = {
      '2026-09-01': {
        date: '2026-09-01',
        meals: [{ id: 'src', name: 'Ужин', items: [{ id: 'old', grams: 100 }], photos: [{ id: 'photo' }] }],
      },
      '2026-08-31': {
        date: '2026-08-31',
        meals: [{ id: 'lunch', name: 'Обед', items: [{ id: 'salad', grams: 50 }] }],
      },
    };
    const actions = [];
    const result = await executeMealMoveTransaction({
      srcDate: '2026-09-01',
      dstDate: '2026-08-31',
      srcMealId: 'src',
      targetMode: 'existing',
      dstMealId: 'lunch',
      readSourceDay: () => days['2026-09-01'],
      prepareItems: async items => items,
      createItemId: () => 'moved-item',
      createMealId: () => 'unused',
      writeDay: (date, mutator, action) => {
        actions.push(action);
        const next = mutator(days[date]);
        if (!next) return false;
        days[date] = next;
        return true;
      },
      now: () => 100,
    });

    expect(result.ok).toBe(true);
    expect(actions).toEqual(['move_meal_to_target', 'move_meal_from_source']);
    expect(days['2026-09-01'].meals).toEqual([]);
    expect(days['2026-08-31'].meals).toHaveLength(1);
    expect(days['2026-08-31'].meals[0].items.map(item => item.id)).toEqual(['salad', 'moved-item']);
    expect(days['2026-08-31'].meals[0].items.reduce((sum, item) => sum + item.grams, 0)).toBe(150);
    expect(days['2026-08-31'].meals[0].photos.map(photo => photo.id)).toEqual(['photo']);
  });

  it('new создаёт отдельный meal и только после этого удаляет source', async () => {
    const days = {
      src: { date: 'src', meals: [{ id: 'source', name: 'Перекус', items: [{ id: 'old' }] }] },
      dst: { date: 'dst', meals: [{ id: 'lunch', name: 'Обед', items: [] }] },
    };
    const actions = [];
    const result = await executeMealMoveTransaction({
      srcDate: 'src', dstDate: 'dst', srcMealId: 'source', targetMode: 'new',
      readSourceDay: () => days.src,
      prepareItems: async items => items,
      createItemId: () => 'new-item',
      createMealId: () => 'new-meal',
      writeDay: (date, mutator, action) => {
        actions.push(action);
        const next = mutator(days[date]);
        if (!next) return false;
        days[date] = next;
        return true;
      },
      now: () => 100,
    });

    expect(result.ok).toBe(true);
    expect(actions).toEqual(['move_meal_to_target', 'move_meal_from_source']);
    expect(days.src.meals).toEqual([]);
    expect(days.dst.meals.map(meal => meal.id)).toEqual(['lunch', 'new-meal']);
    expect(days.dst.meals[1]).toMatchObject({ name: 'Перекус', items: [{ id: 'new-item' }] });
  });

  it('исчезнувшая target fail-closed: source не трогается', async () => {
    const days = {
      src: { date: 'src', meals: [{ id: 'source', items: [{ id: 'old' }] }] },
      dst: { date: 'dst', meals: [] },
    };
    const actions = [];
    const result = await executeMealMoveTransaction({
      srcDate: 'src', dstDate: 'dst', srcMealId: 'source', targetMode: 'existing', dstMealId: 'gone',
      readSourceDay: () => days.src,
      prepareItems: async items => items,
      createItemId: () => 'new-item', createMealId: () => 'unused',
      writeDay: (date, mutator, action) => {
        actions.push(action);
        const next = mutator(days[date]);
        if (!next) return false;
        days[date] = next;
        return true;
      },
    });

    expect(result).toMatchObject({ ok: false, reason: 'target_missing' });
    expect(actions).toEqual(['move_meal_to_target']);
    expect(days.src.meals).toHaveLength(1);
    expect(days.dst.meals).toEqual([]);
  });

  it('изменившийся source блокирует удаление и компенсирует уже записанную target', async () => {
    const days = {
      src: { date: 'src', meals: [{ id: 'source', items: [{ id: 'old', grams: 100 }] }] },
      dst: { date: 'dst', meals: [{ id: 'lunch', items: [{ id: 'salad' }] }] },
    };
    const actions = [];
    const result = await executeMealMoveTransaction({
      srcDate: 'src', dstDate: 'dst', srcMealId: 'source', targetMode: 'existing', dstMealId: 'lunch',
      readSourceDay: () => days.src,
      prepareItems: async items => items,
      createItemId: () => 'new-item', createMealId: () => 'unused',
      writeDay: (date, mutator, action) => {
        actions.push(action);
        if (action === 'move_meal_from_source') days.src.meals[0].items[0].grams = 120;
        const next = mutator(days[date]);
        if (!next) return false;
        days[date] = next;
        return true;
      },
      now: () => 100,
    });

    expect(result).toMatchObject({ ok: false, reason: 'source_changed', rollbackOk: true });
    expect(actions).toEqual(['move_meal_to_target', 'move_meal_from_source', 'rollback_move_meal_target']);
    expect(days.src.meals[0].items[0].grams).toBe(120);
    expect(days.dst.meals[0].items.map(item => item.id)).toEqual(['salad']);
  });

  it('same-day и source=target отклоняются до любой записи', async () => {
    const writeDay = vi.fn();
    const shared = {
      srcMealId: 'same',
      readSourceDay: () => ({ meals: [{ id: 'same', items: [] }] }),
      prepareItems: async items => items,
      createItemId: () => 'item', createMealId: () => 'meal', writeDay,
    };
    await expect(executeMealMoveTransaction({
      ...shared, srcDate: '2026-09-01', dstDate: '2026-09-01', targetMode: 'new',
    })).resolves.toMatchObject({ ok: false, reason: 'same_day' });
    await expect(executeMealMoveTransaction({
      ...shared, srcDate: 'src', dstDate: 'dst', targetMode: 'existing', dstMealId: 'same',
    })).resolves.toMatchObject({ ok: false, reason: 'same_meal' });
    expect(writeDay).not.toHaveBeenCalled();
  });

  // 03.09: проверка переписана. Прежде она сторожила старый каркас листа
  // продукта — «оболочка не meal-transfer-v4__sheet, в тексте есть вопрос
  // „Куда скопировать продукт?"». Строка контракта nutrition-tab «копирование
  // продукта» свела лист с тем же видом, что у переноса приёма, а вопрос увела
  // из заголовка в ярус, и в прежнем виде проверка запрещала бы сведение.
  //
  // Замысел, ради которого она стояла, остаётся и проверяется по механике:
  // режимы продукта не должны стать MealMoveView — там выбирают ещё и режим
  // цели, поэтому там радио и подтверждение. У листа продукта выбор один и тап
  // выполняет операцию сразу.
  it.each([
    ['product-copy', 'скопировать', 'Куда скопировать'],
    ['product-move', 'переместить', 'Куда переместить'],
  ])('%s: вид листа переноса, механика прежняя — тап без подтверждения', async (mode, title, tier) => {
    const onPick = vi.fn();
    await act(async () => {
      window.HEYS.MoveModal.show({
        mode,
        sourceDate: '2026-09-01',
        sourceMealIndex: 0,
        sourceLabel: 'Копируем: кофе',
        todayDateStr: '2026-09-01',
        daysWithMeals: [{
          dateStr: '2026-09-01',
          dateLabel: 'Сегодня',
          meals: [
            { id: 'src', name: 'Завтрак', time: '08:30', items: [{ grams: 100, kcal100: 250 }] },
            { id: 'dst', name: 'Обед', time: '13:00', items: [] },
          ],
        }],
        onPick,
      });
    });

    const sheet = document.querySelector('#move-modal-root .move-modal');
    expect(sheet).toBeTruthy();
    // Вид — общий лист переноса.
    expect(sheet.classList.contains('meal-transfer-v4__sheet')).toBe(true);
    expect(sheet.classList.contains('meal-transfer-v4__sheet--move')).toBe(true);
    // Заголовок называет операцию, вопрос ушёл в ярус.
    expect(sheet.querySelector('.meal-transfer-v4__title')?.textContent).toBe(title);
    expect(sheet.textContent).toContain(tier);
    expect(sheet.textContent).not.toContain(tier + ' продукт?');
    // Эмодзи приёмов и аккордеон по дням сняты.
    expect(/\p{Extended_Pictographic}/u.test(sheet.textContent)).toBe(false);
    expect(sheet.textContent).not.toContain('▾');
    expect(sheet.textContent).not.toContain('▸');
    // Дата — одной строкой, как в переносе.
    expect(sheet.querySelector('.meal-transfer-v4__date-select')).toBeTruthy();

    // Механика прежняя: ни радио, ни подтверждающей кнопки.
    expect(sheet.querySelector('input[type="radio"]')).toBeNull();
    expect(sheet.querySelector('.meal-transfer-v4__button--primary')).toBeNull();

    // Источник приглушён и выбрать его нельзя.
    const rows = [...sheet.querySelectorAll('.meal-transfer-v4__target--pick')];
    expect(rows.length).toBe(3); // два приёма дня + «Создать новый приём»
    const source = rows.find(row => row.classList.contains('is-source'));
    expect(source?.disabled).toBe(true);
    expect(source?.textContent).toContain('(откуда)');
    expect(source?.textContent).toContain('1 продукт');

    // Тап по цели выполняет операцию сразу, без второго шага.
    const target = rows.find(row => row.textContent.includes('Обед'));
    await act(async () => { target.click(); });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ dstDate: '2026-09-01', dstMealId: 'dst' });
  });

  it('фиксирует роли без литеральной палитры в обеих v4-ветках', () => {
    const copyView = COPY_SOURCE.slice(COPY_SOURCE.indexOf('function CopyMealView'), COPY_SOURCE.indexOf('// === DOM root'));
    // 03.09: у heys_move_modal_v1.js обе ветки теперь v4 — и MealMoveView, и
    // ProductMoveView, — поэтому сверяется весь модуль, а не один срез.
    const moveView = MOVE_SOURCE.slice(MOVE_SOURCE.indexOf('function ProductMoveView'), MOVE_SOURCE.indexOf('function ensureRoot'));
    const scopedCss = CSS.slice(CSS.indexOf('/* === Food meal v4'), CSS.indexOf('/* === /Food meal v4'));

    expect(copyView).not.toMatch(/(?:background|color):\s*['"]/);
    expect(moveView).not.toMatch(/(?:background|color):\s*['"]/);
    expect(moveView).toContain('function MealMoveView'); // срез накрыл обе ветки
    expect(COPY_SOURCE).toContain('.copy-meal-modal:not(.meal-transfer-v4__sheet)');
    // Заплатки тёмной темы у листа продукта больше нет и быть не должно: она
    // висела на `.move-modal:not(.meal-transfer-v4__sheet)`, а такого элемента
    // после сведения не остаётся — селектор не совпал бы ни с чем.
    expect(MOVE_SOURCE).not.toContain('.move-modal:not(.meal-transfer-v4__sheet)');
    expect(MOVE_SOURCE).not.toContain('getMealEmoji');
    expect(scopedCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(scopedCss).toContain('background: var(--v4-card)');
    expect(scopedCss).toContain('background: var(--v4-act)');
  });

  it('фиксирует точную геометрию общего листа из food-meal canvas', () => {
    expect(CSS).toMatch(/\.meal-transfer-v4__sheet\s*{[^}]*width:\s*min\(100%, 375px\)[^}]*height:\s*min\(706px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__sheet\s*{[^}]*font-family:\s*Figtree, sans-serif[^}]*-webkit-font-smoothing:\s*antialiased/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__tier-row\s*{[^}]*align-items:\s*baseline[^}]*gap:\s*10px[^}]*min-height:\s*11px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__product-main\s*{[^}]*gap:\s*10px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__product-meta\s*{[^}]*font-size:\s*10\.5px[^}]*line-height:\s*1/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__grams\s*{[^}]*gap:\s*10px[^}]*margin-top:\s*10px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__range::-webkit-slider-runnable-track\s*{[^}]*rgba\(var\(--v4-ink-rgb\), 0\.1\)/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__target\s*{[^}]*gap:\s*11px[^}]*padding:\s*14px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__target-label\s*{[^}]*font-size:\s*12\.5px[^}]*line-height:\s*1/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__date-label\s*{[^}]*font-size:\s*12\.5px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__warning\s*{[^}]*padding:\s*13px 14px[^}]*font-size:\s*11\.5px[^}]*line-height:\s*1\.45/s);
  });
});
