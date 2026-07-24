import fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalHEYS = global.HEYS;
const originalWindowHEYS = window.HEYS;
const originalReact = global.React;
const originalWindowReact = window.React;

function loadAddProductStep() {
  const srcPath = path.resolve(__dirname, '../heys_add_product_step_v1.js');
  eval(fs.readFileSync(srcPath, 'utf8'));
}

function installReactStub() {
  const stub = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    memo: (component) => component,
    useCallback: (fn) => fn,
    useContext: () => null,
    useDeferredValue: (value) => value,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [typeof value === 'function' ? value() : value, () => {}],
  };
  global.React = stub;
  window.React = stub;
}

function installHeysStub() {
  const heys = {
    StepModal: {},
    models: {
      normalizeProductName: (name) => String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/ё/g, 'е'),
    },
    store: {
      get: vi.fn((_, fallback) => fallback),
      set: vi.fn(),
    },
    utils: {},
  };
  global.HEYS = heys;
  window.HEYS = heys;
}

describe('AddProductStep smart products', () => {
  const now = new Date(2026, 6, 5, 12).getTime();

  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    installReactStub();
    installHeysStub();
    loadAddProductStep();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.HEYS = originalHEYS;
    window.HEYS = originalWindowHEYS;
    global.React = originalReact;
    window.React = originalWindowReact;
  });

  it('keeps one card for duplicate shared products with different local ids', () => {
    const products = [
      { id: 'local-milk-a', shared_origin_id: 'shared-milk', name: 'Молоко 2,5', updatedAt: now },
      { id: 'local-milk-b', shared_origin_id: 'shared-milk', name: 'Молоко 2,5', updatedAt: now - 1000 },
      { id: 'bread', name: 'Хлеб тостовый', updatedAt: now },
    ];

    const result = window.HEYS.AddProductStep.computeSmartProducts(products, '2026-07-05', {
      usageStats: new Map(),
      daysWindow: 21,
    });

    expect(result.map((product) => product.id)).toEqual(['local-milk-a', 'bread']);
  });

  it('keeps one card for custom products with the same normalized display name', () => {
    const products = [
      { id: 'bread-a', name: 'Хлеб тостовый «Премиум суперсемечковый»', updatedAt: now },
      { id: 'bread-b', name: 'Хлеб тостовый Премиум суперсемечковый', updatedAt: now - 1000 },
      { id: 'milk', name: 'Молоко 2,5', updatedAt: now },
    ];

    const result = window.HEYS.AddProductStep.computeSmartProducts(products, '2026-07-05', {
      usageStats: new Map(),
      daysWindow: 21,
    });

    expect(result.map((product) => product.id)).toEqual(['milk', 'bread-a']);
  });

  it('uses indexed usage-stat lookups instead of scanning the full map per product', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../heys_add_product_step_v1.js'), 'utf8');
    const smartProductsSource = source.slice(
      source.indexOf('function computeSmartProducts'),
      source.indexOf('// === Категории для фильтрации')
    );

    expect(smartProductsSource).not.toContain('usageStats.forEach');
    expect(source).toContain('ensureUsageStatsFresh({');
    expect(source).toContain('getSharedBarcodeNameIndex(cached).get(name)');
    expect(source).toContain('[context?.products, pendingDeletedProductIds, productsVersion]');
    expect(source).toContain('if (productsWatchSignatureRef.current === nextSignature) return;');
    expect(source).toContain('if (!isOverlayProductsEnabledForAddStep() && HEYS.products?.watch)');
    expect(source).toContain('invalidateSharedBarcodeNameIndex();');
  });

  it('shows products used during the last three calendar days, newest first', () => {
    const products = [
      { id: 'today', name: 'Сегодня' },
      { id: 'yesterday', name: 'Вчера' },
      { id: 'two-days-ago', name: 'Позавчера' },
      { id: 'too-old', name: 'Слишком давно' },
      { id: 'hidden', name: 'Скрытый' },
    ];
    const usageStats = new Map([
      ['today', { count: 1, lastUsed: new Date(2026, 6, 5, 10).getTime() }],
      ['yesterday', { count: 1, lastUsed: new Date(2026, 6, 4, 8).getTime() }],
      ['two-days-ago', { count: 1, lastUsed: new Date(2026, 6, 3, 0).getTime() }],
      ['too-old', { count: 1, lastUsed: new Date(2026, 6, 2, 23, 59, 59).getTime() }],
      ['hidden', { count: 1, lastUsed: new Date(2026, 6, 5, 11).getTime() }],
    ]);

    const result = window.HEYS.AddProductStep.computeRecentProducts(products, {
      usageStats,
      hidden: new Set(['hidden']),
      now,
    });

    expect(result.map((product) => product.id)).toEqual([
      'today',
      'yesterday',
      'two-days-ago',
    ]);
  });

  it('resolves recent usage by normalized product name', () => {
    const products = [{ id: 'milk', name: '  Молоко Ёлки  ' }];
    const usageStats = new Map([
      ['молоко елки', { count: 1, lastUsed: new Date(2026, 6, 4, 0).getTime() }],
    ]);

    const result = window.HEYS.AddProductStep.computeRecentProducts(products, {
      usageStats,
      now,
    });

    expect(result.map((product) => product.id)).toEqual(['milk']);
  });
});
