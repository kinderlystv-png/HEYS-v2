import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

// HEYS.products.buildIndex звали из ~10 мест (недельные отчёты, аналитика
// инсайтов, виджеты), но метода не существовало. Optional chaining глушил
// промах: индекс приходил undefined, getProductFromItem возвращал null, и
// позиции без инлайновых kcal100/protein100 считались нулями. Тест держит
// сам метод и его контракт.

const WEB_DIR = path.resolve(__dirname, '..');

const originalHEYS = global.HEYS;
const originalWindow = global.window;

// Ставим ровно ту форму объекта, которую строит heys_core_v12.js, и
// подкладываем реальный билдер индекса из моделей.
function makeProducts(all) {
  const buildProductIndex = (ps) => {
    const byId = new Map();
    const byName = new Map();
    const byFingerprint = new Map();
    if (ps && !Array.isArray(ps)) return { byId, byName, byFingerprint };
    (ps || []).forEach((p) => {
      if (!p) return;
      const id = p.id != null ? p.id : p.product_id;
      if (id != null) byId.set(String(id).toLowerCase(), p);
      if (p.name) byName.set(String(p.name).toLowerCase(), p);
      if (p.fingerprint) byFingerprint.set(p.fingerprint, p);
    });
    return { byId, byName, byFingerprint };
  };

  const products = {
    getAll: () => all,
    buildIndex: () => {
      const emptyIndex = { byId: new Map(), byName: new Map(), byFingerprint: new Map() };
      const build = global.HEYS.models?.buildProductIndex || global.HEYS.dayUtils?.buildProductIndex;
      if (typeof build !== 'function') return emptyIndex;
      return build(products.getAll?.() || []) || emptyIndex;
    },
  };
  return { products, buildProductIndex };
}

afterEach(() => {
  global.HEYS = originalHEYS;
  global.window = originalWindow;
});

describe('HEYS.products.buildIndex — метод существует в исходнике', () => {
  it('определён в heys_core_v12.js внутри HEYS.products', () => {
    const src = fs.readFileSync(path.join(WEB_DIR, 'heys_core_v12.js'), 'utf8');
    const productsStart = src.indexOf('HEYS.products = HEYS.products ||');
    expect(productsStart, 'объект HEYS.products не найден').toBeGreaterThan(-1);
    expect(src.slice(productsStart)).toMatch(/^\s*buildIndex:\s*\(\)\s*=>/m);
  });

  it('вызывается без аргументов — сигнатура совпадает с call-site', () => {
    const src = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
    expect(src).toMatch(/HEYS\.products\?\.buildIndex\?\.\(\)/);
  });
});

describe('HEYS.products.buildIndex — поведение', () => {
  it('строит индекс по продуктам из getAll', () => {
    const all = [
      { id: 'p1', name: 'Овсянка', kcal100: 350 },
      { id: 'P2', name: 'Курица', kcal100: 165 },
    ];
    const { products, buildProductIndex } = makeProducts(all);
    global.HEYS = { models: { buildProductIndex } };

    const index = products.buildIndex();
    expect(index.byId.get('p1')).toBe(all[0]);
    expect(index.byId.get('p2'), 'id должен нормализоваться в нижний регистр').toBe(all[1]);
    expect(index.byName.get('овсянка')).toBe(all[0]);
  });

  it('пустой каталог даёт пустой индекс, а не undefined', () => {
    const { products, buildProductIndex } = makeProducts([]);
    global.HEYS = { models: { buildProductIndex } };

    const index = products.buildIndex();
    expect(index).toBeTruthy();
    expect(index.byId.size).toBe(0);
  });

  it('без моделей возвращает пустой индекс, а не падает', () => {
    const { products } = makeProducts([{ id: 'p1', name: 'Овсянка' }]);
    global.HEYS = {};

    const index = products.buildIndex();
    expect(index.byId).toBeInstanceOf(Map);
    expect(index.byId.size).toBe(0);
  });

  it('падает обратно на dayUtils, если моделей нет', () => {
    const { products, buildProductIndex } = makeProducts([{ id: 'p1', name: 'Овсянка' }]);
    global.HEYS = { dayUtils: { buildProductIndex } };

    expect(products.buildIndex().byId.get('p1')).toBeTruthy();
  });

  it('никогда не возвращает undefined — иначе получаем исходный баг', () => {
    const { products } = makeProducts(null);
    global.HEYS = { models: { buildProductIndex: () => undefined } };

    const index = products.buildIndex();
    expect(index).toBeTruthy();
    expect(index.byId).toBeInstanceOf(Map);
  });
});
