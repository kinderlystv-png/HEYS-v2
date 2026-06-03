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
});
