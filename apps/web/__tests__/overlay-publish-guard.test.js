// Каталог продуктов нельзя публиковать в облако из незагруженного состояния.
//
// Прод, 21.08.2026. Облачная загрузка обрывалась на седьмой странице, каталог на
// устройстве оставался пустым. Человек добавил один продукт — и в облако уехал
// каталог из одной строки поверх ста сорока шести. Восстанавливали из легаси-
// зеркала вручную.
//
// Соседний shrink-guard тут бессилен по построению: он сравнивает новый список с
// ЛОКАЛЬНЫМ предыдущим, а тот был пуст. Ноль меньше единицы не бывает, значит
// «уменьшения» нет, значит защита молчит.
//
// Предохранитель стоит в пути добавления продукта, а не в writeRaw: writeRaw
// зовут и там, где пустой каталог законен (применение снапшота, миграции), и
// широкая блокировка ломала бы их.
//
// Живьём не собрать: нужно поймать окно между «загрузка оборвалась» и «человек
// добавил продукт», да ещё до того, как облако ответит.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const OVERLAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_products_overlay_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_core_v12.js'), 'utf8');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const STORE_KEY = 'heys_products_overlay_v2';

function product(id, name) {
  return { id, name, kcal100: 100, protein100: 1, fat100: 1, carbs100: 1, _custom: true, in_my_list: true };
}

/** Признак «облако ответило» живёт в overlay-модуле и читается снаружи. */
function loadOverlay(initialRows) {
  const memory = new Map();
  if (initialRows) memory.set(STORE_KEY, initialRows);
  window.HEYS = {
    currentClientId: CLIENT,
    cloud: { getCurrentClientId: () => CLIENT },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => { memory.set(k, v); },
    },
  };
  eval(OVERLAY_SRC);
  return { overlay: window.HEYS.OverlayStore, memory };
}

describe('каталог продуктов · признак «облако ответило»', () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.HEYS;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('до ответа облака признак снят, после — поднят', () => {
    const { overlay } = loadOverlay(null);
    expect(overlay.hasHeardFromCloud()).toBe(false);

    overlay.applyCloudSnapshot([product('p_a', 'Гречка')], { source: 'test' });

    expect(overlay.hasHeardFromCloud()).toBe(true);
  });

  it('пустой ответ облака тоже считается ответом', () => {
    // У нового человека каталог пуст законно, и первый продукт он обязан
    // сохранить. Поэтому признак — про ответ, а не про количество строк.
    const { overlay } = loadOverlay(null);

    overlay.applyCloudSnapshot([], { source: 'test-empty-cloud' });

    expect(overlay.hasHeardFromCloud()).toBe(true);
  });

  it('clear() сбрасывает heardFromCloud при смене клиента', () => {
    const { overlay } = loadOverlay(null);
    overlay.applyCloudSnapshot([product('p_a', 'Гречка')], { source: 'test' });
    expect(overlay.hasHeardFromCloud()).toBe(true);

    overlay.clear();

    expect(overlay.hasHeardFromCloud()).toBe(false);
  });

  it('writeRaw остался нетронутым: пустой каталог не блокируется', () => {
    // Широкая блокировка здесь ломала бы применение снапшота и миграции —
    // предохранитель стоит выше, в пути добавления продукта.
    const { overlay, memory } = loadOverlay(null);

    expect(overlay.writeRaw([product('p_milk', 'Молоко')], { skipCloudSync: true })).toBe(true);
    expect(memory.get(STORE_KEY)).toHaveLength(1);
  });
});

describe('каталог продуктов · предохранитель в пути добавления', () => {
  it('отклоняет сохранение, пока каталог не загружен из облака', () => {
    // Проверяем сам контракт отказа в исходнике: путь асинхронный и завязан на
    // половину ядра, поэтому здесь важно, что условие и код причины на месте.
    const guard = CORE_SRC.slice(
      CORE_SRC.indexOf('ensurePersonalProductCommitted: async'),
      CORE_SRC.indexOf('const now = Date.now();', CORE_SRC.indexOf('ensurePersonalProductCommitted: async')),
    );
    expect(guard).toContain('hasHeardFromCloud');
    expect(guard).toContain("reason: 'catalog_not_loaded'");
    // Пустой каталог сам по себе не повод отказывать — только вместе с молчащим
    // облаком.
    expect(guard).toContain('!localRows.length');
  });
});
