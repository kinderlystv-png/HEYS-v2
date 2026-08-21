// «Частые продукты» пересчитываются, когда история приехала на устройство.
//
// Прод, 21.08.2026. Облачная загрузка обрывалась, дни на устройство не доезжали,
// и статистика частых собиралась по пустому — одна запись вместо месяцев.
// Дальше она считалась «свежей» (не пустая, собрана только что) и не
// пересобиралась ещё шесть часов — уже после того, как история приехала.
// Человек видел в «Частых» один продукт, добавленный час назад, при месяцах
// истории на сервере.
//
// Живьём не собрать: нужно попасть в окно между «статистика собрана по
// пустому» и «дни доехали», да ещё внутри шестичасового кэша.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_smart_search_v2.js'), 'utf8');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';

/** Кладёт в хранилище день с приёмом из одного продукта. */
function putDay(dateKey, productName, productId) {
  const day = {
    date: dateKey,
    meals: [{ id: 'm1', time: '12:00', items: [{ product_id: productId, name: productName, grams: 100 }] }],
  };
  localStorage.setItem(`heys_${CLIENT}_dayv2_${dateKey}`, JSON.stringify(day));
}

function daysBack(n) {
  const d = new Date('2026-08-21T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function loadSearch() {
  window.HEYS = window.HEYS || {};
  window.HEYS.currentClientId = CLIENT;
  eval(SRC);
  return window.HEYS.SmartSearchWithTypos;
}

describe('частые продукты · пересборка после прихода истории', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('история доехала после сборки — статистика пересобирается, не дожидаясь таймера', () => {
    // 1. Устройство почти пустое: один сегодняшний день.
    putDay(daysBack(0), 'Молоко ультрапастеризованное 3.5', 'p_milk');
    const search = loadSearch();
    search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });

    const afterEmpty = search.getUsageStats();
    expect(afterEmpty.size, 'статистика не собралась даже по одному дню').toBeGreaterThan(0);

    // 2. Приехала история — ещё десять дней с другими продуктами.
    for (let i = 1; i <= 10; i++) putDay(daysBack(i), 'Гречка варёная ' + i, 'p_buck_' + i);

    // 3. Таймер ещё не истёк: по старому правилу пересборки бы не случилось.
    search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });

    const after = search.getUsageStats();
    expect(
      after.size,
      `после прихода истории в статистике ${after.size} записей — пересборка не сработала`,
    ).toBeGreaterThan(afterEmpty.size);
  });

  it('когда история не менялась, лишней пересборки нет', () => {
    for (let i = 0; i <= 5; i++) putDay(daysBack(i), 'Гречка варёная', 'p_buck');
    const search = loadSearch();
    search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });
    const first = search.getUsageStats().size;

    // Второй вызов подряд: дней столько же, таймер не истёк — работать нечему.
    const changed = search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });

    expect(changed, 'пересборка запустилась без причины').toBe(false);
    expect(search.getUsageStats().size).toBe(first);
  });

  it('дни чужих клиентов в счёт не идут', () => {
    // Инвариант проекта: поиск по localStorage обязан фильтровать чужой scope —
    // в сессии куратора там лежат дни нескольких человек.
    putDay(daysBack(0), 'Молоко', 'p_milk');
    const search = loadSearch();
    search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });
    const before = search.getUsageStats().size;

    localStorage.setItem('heys_11111111-2222-3333-4444-555555555555_dayv2_2026-08-20', JSON.stringify({
      date: '2026-08-20',
      meals: [{ id: 'x', time: '10:00', items: [{ product_id: 'foreign', name: 'Чужой продукт', grams: 100 }] }],
    }));

    const changed = search.ensureUsageStatsFresh({ maxHours: 6, daysWindow: 21, dateKey: daysBack(0) });

    expect(changed, 'чужой день заставил пересобрать статистику').toBe(false);
    expect(search.getUsageStats().size).toBe(before);
  });
});
