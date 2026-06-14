// fingers-tissue-history.test.js — S2 tissue freshness live-history store.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB = path.resolve(__dirname, '..');
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

function boot(clientId = 'client-a') {
  const store = {};
  const localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    keys: () => Object.keys(store)
  };
  globalThis.window = globalThis;
  globalThis.localStorage = localStorage;
  globalThis.HEYS = globalThis.window.HEYS = {
    currentClientId: clientId,
    utils: {
      lsGet: (k, d) => { const raw = localStorage.getItem(k); return raw ? JSON.parse(raw) : d; },
      lsSet: (k, v) => { localStorage.setItem(k, JSON.stringify(v)); return true; }
    }
  };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(WEB, '_kernel', 'heys_kernel_records_v1.js'), 'utf8'));
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_grips_catalog_v1.js');
  ev('heys_fingers_block_catalog_v1.js');
  ev('heys_fingers_tissue_history_v1.js');
  const F = globalThis.HEYS.Fingers;
  return { store, TH: F.tissueHistory };
}

describe('tissueHistory: S2 live-history store', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('recordSession extracts only high/max tissue loads in S2 format', () => {
    const { TH } = boot();
    const now = Date.parse('2026-06-12T10:00:00Z');
    TH.recordSession({ exercises: [
      { atomId: 'fs_maxhang_20mm_half' },
      { atomId: 'fs_repeater_73' },
      { atomId: 'mob_wrist_extensors' }
    ] }, now);

    const recent = TH.recent({ nowMs: now + 1000 });
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({
      timestamp: now,
      atomId: 'fs_maxhang_20mm_half',
      tissueLoad: 'high',
      gripId: 'halfcrimp',
      gripGroup: 'crimp'
    });
  });

  it('client-scoped LS key', () => {
    const { TH, store } = boot('client-a');
    TH.record([{ atomId: 'x', tissueLoad: 'high', gripId: 'halfcrimp' }], 1000);
    expect(Object.keys(store)).toContain('heys_client-a_fingers_tissue_history_v1');
  });

  it('recent prunes entries outside the S2 window', () => {
    const { TH } = boot();
    const now = 10 * 24 * 3600 * 1000;
    TH.record([{ atomId: 'old', tissueLoad: 'high', gripId: 'halfcrimp' }], now - 120 * 3600 * 1000);
    TH.record([{ atomId: 'fresh', tissueLoad: 'high', gripId: 'halfcrimp' }], now - 12 * 3600 * 1000);
    expect(TH.recent({ nowMs: now }).map((e) => e.atomId)).toEqual(['fresh']);
  });
});
