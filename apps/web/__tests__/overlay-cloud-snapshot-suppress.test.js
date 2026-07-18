// @vitest-environment node

import fs from 'fs';
import path from 'path';
import vm from 'vm';

import { describe, expect, it, vi } from 'vitest';

const overlaySource = fs.readFileSync(
  path.resolve(__dirname, '..', 'heys_products_overlay_v1.js'),
  'utf8'
);

function createOverlayHarness() {
  const saveClientKey = vi.fn();
  const storeSet = vi.fn((key, value) => {
    if (!context.HEYS._suppressStoreCloudSync) {
      saveClientKey('client-1', key, value);
    }
    storeData.set(key, value);
  });
  const storeData = new Map();
  const context = {
    console,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    HEYS: {
      currentClientId: 'client-1',
      store: {
        get: vi.fn((key, fallback) => storeData.get(key) ?? fallback),
        set: storeSet,
      },
      cloud: {
        getCurrentClientId: vi.fn(() => 'client-1'),
        getSharedIndex: vi.fn(() => new Map()),
        saveClientKey,
      },
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(overlaySource, context);
  return { context, saveClientKey, storeSet, storeData };
}

describe('OverlayStore cloud snapshot sync suppression', () => {
  it('does not mirror applyCloudSnapshot back to cloud through Store.set', () => {
    const { context, saveClientKey, storeSet } = createOverlayHarness();

    const result = context.HEYS.OverlayStore.applyCloudSnapshot(
      [{ id: 'p1', shared_origin_id: 's1', in_my_list: true }],
      { source: 'test-cloud' }
    );

    expect(result.applied).toBe(true);
    expect(storeSet).toHaveBeenCalledWith(
      'heys_products_overlay_v2',
      expect.arrayContaining([expect.objectContaining({ id: 'p1' })])
    );
    expect(saveClientKey).not.toHaveBeenCalled();
    expect(context.HEYS._suppressStoreCloudSync).toBe(false);
  });

  it('still mirrors regular local writeRaw mutations to cloud', () => {
    const { context, saveClientKey } = createOverlayHarness();

    const ok = context.HEYS.OverlayStore.writeRaw([
      { id: 'p2', shared_origin_id: 's2', in_my_list: true },
    ]);

    expect(ok).toBe(true);
    expect(saveClientKey).toHaveBeenCalledWith(
      'client-1',
      'heys_products_overlay_v2',
      expect.arrayContaining([expect.objectContaining({ id: 'p2' })])
    );
  });

  it('normalizes legacy barcode override into barcodes in merged view', () => {
    const { context } = createOverlayHarness();
    const sharedById = new Map([
      ['shared-1', { id: 'shared-1', name: 'Ассорти Bombbar протеиновые снеки' }],
    ]);

    context.HEYS.OverlayStore.writeRaw([
      {
        id: 'local-1',
        shared_origin_id: 'shared-1',
        overrides: { barcode: '4660298503056' },
        in_my_list: true,
      },
    ]);

    const merged = context.HEYS.OverlayStore.toMergedView(sharedById);
    expect(merged[0]).toMatchObject({
      id: 'local-1',
      barcode: '4660298503056',
      barcodes: ['4660298503056'],
    });
  });

  it('merges brand from shared row and respects brand override', () => {
    const { context } = createOverlayHarness();
    const sharedById = new Map([
      ['shared-brand', { id: 'shared-brand', name: 'Йогурт греческий', brand: 'Простоквашино' }],
    ]);

    context.HEYS.OverlayStore.writeRaw([
      {
        id: 'local-brand',
        shared_origin_id: 'shared-brand',
        in_my_list: true,
      },
      {
        id: 'local-brand-override',
        shared_origin_id: 'shared-brand',
        overrides: { brand: 'Локальный бренд' },
        in_my_list: true,
      },
    ]);

    const merged = context.HEYS.OverlayStore.toMergedView(sharedById);
    expect(merged).toEqual([
      expect.objectContaining({ id: 'local-brand', brand: 'Простоквашино' }),
      expect.objectContaining({ id: 'local-brand-override', brand: 'Локальный бренд' }),
    ]);
  });

  it('keeps a missing Type A base visible but blocks meal use until nutrients resolve', () => {
    const { context } = createOverlayHarness();
    const partialShared = new Map([
      ['shared-ready', {
        id: 'shared-ready',
        name: 'Готовый продукт',
        kcal100: 120,
        protein100: 10,
      }],
    ]);
    context.HEYS.OverlayStore.writeRaw([
      { id: 'local-ready', shared_origin_id: 'shared-ready', in_my_list: true },
      {
        id: 'local-pending',
        shared_origin_id: 'shared-pending',
        overrides: { name: 'Ожидающий продукт' },
        in_my_list: true,
      },
    ]);

    const partialView = context.HEYS.OverlayStore.toMergedView(partialShared);
    const pending = partialView.find((product) => product.id === 'local-pending');
    expect(partialView).toHaveLength(2);
    expect(pending).toMatchObject({
      name: 'Ожидающий продукт',
      _nutrientsPending: true,
      _selectionDisabled: true,
    });
    expect(context.HEYS.OverlayStore.resolveMealProduct(pending, partialShared)).toMatchObject({
      ok: false,
      reason: 'shared_nutrients_pending',
    });

    const refreshedShared = new Map(partialShared);
    refreshedShared.set('shared-pending', {
      id: 'shared-pending',
      name: 'Ожидающий продукт',
      kcal100: 80,
      protein100: 4,
    });
    const refreshedView = context.HEYS.OverlayStore.toMergedView(refreshedShared);
    const resolved = refreshedView.filter((product) => product.id === 'local-pending');

    expect(refreshedView).toHaveLength(2);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ kcal100: 80, protein100: 4 });
    expect(resolved[0]._nutrientsPending).toBeUndefined();
    expect(context.HEYS.OverlayStore.resolveMealProduct(resolved[0], refreshedShared)).toMatchObject({
      ok: true,
      reason: 'shared_nutrients_ready',
      product: expect.objectContaining({ id: 'local-pending', kcal100: 80 }),
    });
  });

  it('links legacy products to shared rows by any shared barcode alias', () => {
    const { context } = createOverlayHarness();
    const sharedById = new Map([
      ['shared-2', {
        id: 'shared-2',
        name: 'Alias product',
        barcode: '111111',
        barcodes: ['111111', '222222'],
      }],
    ]);

    const result = context.HEYS.OverlayStore.migrate([
      { id: 'local-2', name: 'Alias product local', barcode: '222222' },
    ], sharedById);

    expect(result.ok).toBe(true);
    expect(result.rows[0]).toMatchObject({
      id: 'local-2',
      shared_origin_id: 'shared-2',
    });
    context.HEYS.OverlayStore.writeRaw(result.rows);
    expect(context.HEYS.OverlayStore.toMergedView(sharedById)[0]).toMatchObject({
      barcode: '111111',
      barcodes: ['111111', '222222'],
    });
  });

  it('drops TypeB cloud clones when a matching shared TypeA row exists', () => {
    const { context, storeData } = createOverlayHarness();
    const sharedById = new Map([
      ['shared-coffee', { id: 'shared-coffee', name: 'Кофе растворимый с молоком 2,5' }],
    ]);
    context.HEYS.cloud.getSharedIndex = vi.fn(() => sharedById);

    const result = context.HEYS.OverlayStore.applyCloudSnapshot([
      { id: 'local-shared', shared_origin_id: 'shared-coffee', in_my_list: true },
      { id: 'old-custom', _custom: true, name: 'Кофе растворимый с молоком 2,5', in_my_list: true },
    ], { source: 'test-dirty-cloud' });

    expect(result.applied).toBe(true);
    expect(storeData.get('heys_products_overlay_v2')).toEqual([
      expect.objectContaining({ id: 'local-shared', shared_origin_id: 'shared-coffee' }),
    ]);
  });

  it('keeps synthetic estimated quickfill rows out of overlay storage', () => {
    const { context, storeData } = createOverlayHarness();
    const synthetic = {
      id: 'estimated_quickfill_2026-07-02_0',
      _custom: true,
      virtualProduct: true,
      skipProductRestore: true,
      name: 'Завтрак · оценочно 155%',
    };

    expect(context.HEYS.OverlayStore.upsertRow(synthetic)).toBe(false);
    expect(context.HEYS.OverlayStore.writeRaw([
      synthetic,
      { id: 'real-product', _custom: true, name: 'Реальный продукт', in_my_list: true },
    ])).toBe(true);

    expect(storeData.get('heys_products_overlay_v2')).toEqual([
      expect.objectContaining({ id: 'real-product' }),
    ]);

    const migrated = context.HEYS.OverlayStore.migrate([
      synthetic,
      { id: 'legacy-real', name: 'Legacy real' },
    ], new Map([['shared-real', { id: 'shared-real', name: 'Legacy real' }]]));

    expect(migrated.ok).toBe(true);
    expect(migrated.rows).toEqual([
      expect.objectContaining({ id: 'legacy-real', shared_origin_id: 'shared-real' }),
    ]);
  });
});
