/**
 * ensureMealProductReady: overlay_present возвращает переданный объект;
 * visible_product_present — строку из каталога.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERLAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_products_overlay_v1.js'), 'utf8');
const CORE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_core_v12.js'), 'utf8');

const CLIENT = 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a';
const STORE_KEY = 'heys_products_overlay_v2';

function overlayRow(id, name) {
  return {
    id,
    name,
    kcal100: 200,
    protein100: 10,
    fat100: 5,
    carbs100: 20,
    _custom: true,
    in_my_list: true,
  };
}

function bootProducts(overlayRows) {
  localStorage.clear();
  const memory = new Map();
  if (overlayRows) memory.set(STORE_KEY, overlayRows);

  window.React = {
    createElement: () => null,
    Fragment: Symbol('Fragment'),
    useState: (init) => [init, () => {}],
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useRef: (v) => ({ current: v }),
  };

  const catalogProduct = {
    id: 'p_cat',
    name: 'Из каталога',
    kcal100: 111,
    protein100: 1,
    fat100: 1,
    carbs100: 1,
  };

  window.HEYS = {
    currentClientId: CLIENT,
    cloud: { getCurrentClientId: () => CLIENT },
    store: {
      get: (k, d) => (memory.has(k) ? memory.get(k) : d),
      set: (k, v) => { memory.set(k, v); },
    },
    models: {
      buildProductIndex: (ps) => {
        const byId = new Map();
        (ps || []).forEach((p) => {
          if (p?.id != null) byId.set(String(p.id).toLowerCase(), p);
        });
        return { byId, byName: new Map(), byFingerprint: new Map() };
      },
      normalizeHarm: () => 0,
    },
    flags: { isEnabled: (name) => name === 'overlay_products_v2' },
    debug: {},
  };

  eval(OVERLAY_SRC);
  eval(CORE_SRC);

  const products = window.HEYS.products;
  products.getById = vi.fn((id) => (String(id) === 'p_cat' ? catalogProduct : null));
  products.getAll = vi.fn(() => [catalogProduct]);
  products.ensurePersonalProductCommitted = vi.fn(async (p) => ({
    ok: true,
    product: p,
    reason: 'cloud_ack',
  }));

  return { products, catalogProduct };
}

describe('ensureMealProductReady · reason contract', () => {
  beforeEach(() => {
    delete window.HEYS;
    delete window.React;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete window.HEYS;
    delete window.React;
  });

  it('overlay_present возвращает переданный preview-объект, не строку overlay', async () => {
    const { products } = bootProducts([overlayRow('p1', 'В overlay')]);
    const preview = {
      id: 'p1',
      name: 'Preview снимок',
      kcal100: 50,
      protein100: 1,
      fat100: 1,
      carbs100: 1,
    };

    const result = await products.ensureMealProductReady(preview);

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('overlay_present');
    expect(result.product).toBe(preview);
    expect(result.product.name).toBe('Preview снимок');
    expect(products.ensurePersonalProductCommitted).not.toHaveBeenCalled();
  });

  it('visible_product_present возвращает объект из каталога, если строки в overlay нет', async () => {
    const { products, catalogProduct } = bootProducts([]);
    const preview = {
      id: 'p_cat',
      name: 'Preview без overlay row',
      kcal100: 50,
      protein100: 1,
      fat100: 1,
      carbs100: 1,
    };

    const result = await products.ensureMealProductReady(preview, { requireCommit: true });

    expect(result.ok).toBe(true);
    expect(result.reason).toBe('visible_product_present');
    expect(result.product).toBe(catalogProduct);
    expect(products.ensurePersonalProductCommitted).not.toHaveBeenCalled();
  });
});
