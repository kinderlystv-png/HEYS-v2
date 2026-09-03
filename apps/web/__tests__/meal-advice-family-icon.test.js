/**
 * @fileoverview Значок совета приёма · строка контракта
 * `nutrition-tab.v4.dc.html` «советы приёма · что править в коде»: иконка 15×15
 * обводкой 2,75 по семейству правила (синергия · баланс · время) тоном --ac, у
 * предупреждения --ac2. Эмодзи в наборе не используются.
 *
 * Почему смоук, а не сверка исходника: семейство считается из триггера правила,
 * и человек такой стык руками не соберёт — нужно подобрать состав приёма,
 * который поднимет правило нужного семейства, и посмотреть, что нарисовалось.
 * Раскладка всех 64 правил — docs/ui/designer-answers/mapping-советы-приёма.md.
 */

import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';

const read = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

let MO;
let Section;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', read('heys_meal_optimizer_v1.js'))(
    window, document, window.navigator,
  );
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', read('heys_day_meal_optimizer_section.js'))(
    window, document, window.navigator,
  );
  MO = window.HEYS.MealOptimizer;
  Section = window.HEYS.dayMealOptimizerSection?.MealOptimizerSection;
});

const ALL_RULES = () => [...MO.SYNERGY_RULES, ...MO.BALANCE_RULES, ...MO.TIMING_RULES];

describe('семейство правила считается из триггера', () => {
  it('модули подняты, правила на месте', () => {
    // Гейт обязан отличать «сошлось» от «не смотрели»: пустой набор правил
    // сделал бы все проверки ниже вакуумными.
    expect(MO, 'MealOptimizer не поднялся').toBeTruthy();
    expect(Section, 'секция советов не поднялась').toBeTruthy();
    expect(ALL_RULES().length).toBe(64);
  });

  it('каждое правило получает ровно одно из трёх семейств', () => {
    const seen = new Set(ALL_RULES().map((rule) => MO.getRuleFamily(rule)));
    expect([...seen].sort()).toEqual(['balance', 'synergy', 'timing']);
  });

  it('временнóе окно старше признака пары', () => {
    const timed = ALL_RULES().filter((rule) => rule.trigger && rule.trigger.time);
    expect(timed.length).toBeGreaterThan(0);
    for (const rule of timed) {
      expect(MO.getRuleFamily(rule), `правило ${rule.id}`).toBe('timing');
    }
  });

  it('привязка к тренировке — «время», но слабее названного партнёра', () => {
    // Решение дизайнера 03.09 (вечер): «часы суток — не определение семейства,
    // а один из его источников», поэтому «потому что тренировка была или будет»
    // — тоже «время». Партнёр при этом старше: omega3_recovery отвечает
    // «потому что омега-3 нет», тренировка там лишь повод.
    const byId = new Map(ALL_RULES().map((rule) => [rule.id, rule]));
    expect(MO.getRuleFamily(byId.get('preworkout_carbs'))).toBe('timing');
    expect(MO.getRuleFamily(byId.get('postworkout_protein'))).toBe('timing');
    expect(MO.getRuleFamily(byId.get('protein_creatine_timing'))).toBe('timing');
    expect(MO.getRuleFamily(byId.get('omega3_recovery'))).toBe('synergy');
  });

  it('раскладка заморожена числом — новое правило не сдвинет картину молча', () => {
    // 37 · 12 · 15 на 03.09, вечер. Правило добавили — цифра изменится, и это
    // повод перечитать docs/ui/designer-answers/mapping-советы-приёма.md, а не
    // подогнать число.
    const count = { synergy: 0, balance: 0, timing: 0 };
    for (const rule of ALL_RULES()) count[MO.getRuleFamily(rule)] += 1;
    expect(count).toEqual({ synergy: 37, balance: 12, timing: 15 });
  });

  it('живой приём отдаёт советы с проставленным семейством', () => {
    const recs = MO.getMealOptimization({
      meal: { id: 'm1', time: '08:30', items: [
        { name: 'Говядина отварная', grams: 150 },
        { name: 'Гречка', grams: 100 },
      ] },
      mealTotals: { prot: 35, fat: 12, carb: 60, kcal: 520, gi: 50 },
      dayData: {}, profile: {}, products: [], pIndex: {}, avgGI: 50,
    });
    expect(recs.length).toBeGreaterThan(0);
    for (const rec of recs) {
      expect(['synergy', 'balance', 'timing'], `совет ${rec.id}`).toContain(rec.family);
    }
    // Приём с железом без витамина C — знакомая пара, семейство «синергия».
    const iron = recs.find((rec) => rec.id === 'iron_vitc');
    expect(iron?.family).toBe('synergy');
  });
});

function renderSection(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(Section, props));
  });
  return host;
}

describe('значок совета в разметке', () => {
  const baseProps = () => ({
    meal: { id: 'm1', time: '08:30', items: [
      { name: 'Говядина отварная', grams: 150 },
      { name: 'Кофе', grams: 200 },
    ] },
    totals: { prot: 35, fat: 12, carb: 20, kcal: 400, gi: 30 },
    dayData: {},
    profile: {},
    products: [],
    pIndex: {},
    mealIndex: 0,
    addProductToMeal: () => true,
  });

  it('рисует svg-иконку, а не эмодзи', () => {
    const host = renderSection(baseProps());
    const icon = host.querySelector('.meal-optimizer__header-icon');
    expect(icon, 'значок главного совета не найден').toBeTruthy();
    expect(icon.querySelector('svg')).toBeTruthy();
    expect(icon.querySelector('svg').getAttribute('width')).toBe('15');
    expect(icon.querySelector('svg').getAttribute('stroke-width')).toBe('2.75');
    // Эмодзи правила в разметку не попадают ни одним символом вне ASCII-пути.
    expect(/\p{Extended_Pictographic}/u.test(host.textContent)).toBe(false);
  });

  it('предупреждение перебивает семейство и метится классом', () => {
    // Кофе с железом — правило coffee_iron, isWarning: true.
    const warning = MO.SYNERGY_RULES.find((rule) => rule.id === 'coffee_iron');
    expect(warning?.isWarning).toBe(true);

    const host = renderSection(baseProps());
    const warned = host.querySelectorAll('.meal-optimizer__header-icon.is-warning, .meal-optimizer__item-icon.is-warning');
    expect(warned.length).toBeGreaterThan(0);
  });

  it('выход из совета один — крест, и он остаётся кнопкой', () => {
    // Строка контракта: «Понятно» снято, остаётся крест в цели 44.
    const host = renderSection(baseProps());
    const dismiss = host.querySelector('.meal-optimizer__dismiss');
    expect(dismiss).toBeTruthy();
    expect(dismiss.textContent).toBe('×');
    expect(host.textContent).not.toContain('Понятно');
  });
});

describe('фон по роли не замирает на прежнем наборе', () => {
  // Замер 03.09 на живом дереве: у плашки и строк стоял `transition:
  // background`, и после смены набора браузер оставлял прежний цвет — песочный
  // #efe3cf держался на синем наборе даже через 1,2 с, а с `transition: none`
  // тот же элемент сразу давал верный #e2ecf6. Пока фон был литеральным
  // градиентом, ловушка не проявлялась: менять было нечего.
  //
  // Проверка ищет не «нет перехода вообще», а именно пару «фон из роли + переход
  // фона» — переход у цвета текста или у трансформации ничему не мешает.
  it('ни одно правило файла не сочетает фон из роли с переходом фона', () => {
    const css = read('styles/modules/800-meal-optimizer.css').replace(/\r\n/g, '\n');
    const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector]) => !selector.trim().startsWith('@'));
    expect(blocks.length, 'правила файла не разобрались').toBeGreaterThan(20);

    const trapped = blocks
      .filter(([, , body]) => /background(?:-color)?:\s*var\(--v4-/.test(body)
        && /transition:[^;]*\b(?:all|background)\b/.test(body))
      .map(([, selector]) => selector.trim().split('\n').pop().trim());
    expect(trapped).toEqual([]);
  });
});

describe('цель нажатия креста — 44', () => {
  it('правило продукта задаёт 44 × 44 обоим крестам', () => {
    const css = read('styles/modules/800-meal-optimizer.css').replace(/\r\n/g, '\n');
    const idx = css.indexOf('.meal-optimizer__dismiss,\n.meal-optimizer__item-dismiss {');
    expect(idx, 'общее правило крестов не найдено').toBeGreaterThan(-1);
    const block = css.slice(idx, css.indexOf('}', idx));
    expect(block).toMatch(/width:\s*44px/);
    expect(block).toMatch(/height:\s*44px/);
  });
});
