// fingers-records-di.test.js — records storage DI: без жёсткой зависимости от HEYS.currentClientId.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');

const ev = (dir, f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, dir, f), 'utf8'));
};

function boot() {
  delete globalThis.HEYS;
  delete globalThis.window;
  delete globalThis.localStorage;
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {};
  ev('_kernel', 'heys_kernel_records_v1.js');
  ev('fingers', 'heys_fingers_records_store_v1.js');
  return {
    F: globalThis.HEYS.Fingers,
    storage: globalThis.HEYS.TrainingKernel.records.createMemoryStorage()
  };
}

describe('Fingers.records DI', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  it('uses injected storage and client resolver without HEYS.currentClientId', () => {
    const { F, storage } = boot();
    let cid = 'client-a';
    F.records.configure({ storage, getClientId: () => cid });

    expect(F.records.__getKey()).toBe('heys_client-a_fingers_records_v1');
    expect(F.records.updateIfPR('halfcrimp', 20, {
      type: 'weight',
      mvcKg: 70,
      bw: 70,
      testedAt: '2026-06-01T10:00:00Z'
    })).toBe(true);
    expect(F.records.getMvcHistory('halfcrimp', 20)).toHaveLength(1);

    cid = 'client-b';
    expect(F.records.__getKey()).toBe('heys_client-b_fingers_records_v1');
    expect(F.records.getMvcHistory('halfcrimp', 20)).toHaveLength(0);
    expect(Object.keys(storage._data)).toEqual(['heys_client-a_fingers_records_v1']);
  });

  it('can clear injected dependencies and fall back to HEYS.currentClientId', () => {
    const { F, storage } = boot();
    F.records.configure({ storage, getClientId: () => 'injected' });
    F.records.configure({ storage: null, getClientId: null });
    globalThis.HEYS.currentClientId = 'legacy';

    expect(F.records.__getKey()).toBe('heys_legacy_fingers_records_v1');
  });
});
