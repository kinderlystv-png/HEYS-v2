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
});
