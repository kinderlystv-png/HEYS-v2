// fingers-edge-history.test.js — кросс-сессионная FDP/FDS ротация (§1.3 / §3.3).

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
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_quality_catalog_v1.js');
  ev('heys_fingers_block_catalog_v1.js');
  ev('heys_fingers_validators_v1.js');
  ev('heys_fingers_progression_v1.js');
  ev('heys_fingers_edge_history_v1.js');
  ev('heys_fingers_session_builder_v1.js');
  const F = globalThis.HEYS.Fingers;
  return { store, EH: F.edgeHistory, SB: F.sessionBuilder, BC: F.blockCatalog };
}

const PROFILE = { age: 25, level: 'intermediate', completedPrerequisites: ['warmup_done', 'base_>=1y', 'base_>=2y', 'strength_base'] };
const pickFS = (SB) => SB._pickAtomForSlot('strength-endurance', { profile: PROFILE, focusQuality: 'finger_strength', equipmentTypes: ['full'] });

describe('edgeHistory: FDP/FDS lean-классификатор', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('lean из grips_catalog primaryMuscles (crimp→FDP, open→FDS)', () => {
    const { EH } = boot();
    expect(EH.leanOfGrip('halfcrimp')).toBe('FDP');
    expect(EH.leanOfGrip('fullcrimp')).toBe('FDP');
    expect(EH.leanOfGrip('openhand4')).toBe('FDS');
    expect(EH.leanOfGrip('nope')).toBeNull();
  });
});

describe('edgeHistory: запись и агрегация', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('recordSession извлекает хват-висы и считает lean', () => {
    const { EH } = boot();
    EH.recordSession({ exercises: [
      { gripId: 'halfcrimp', edgeSizeMm: 20 },
      { gripId: 'halfcrimp', edgeSizeMm: 8 },
      { gripId: 'openhand4', edgeSizeMm: 20 },
      { atomId: 'no-grip' }
    ] });
    expect(EH.leanUsage()).toEqual({ FDP: 2, FDS: 1 });
    expect(EH.underusedLean()).toBe('FDS');
  });

  it('пустая история → underusedLean null', () => {
    const { EH } = boot();
    EH.clear();
    expect(EH.underusedLean()).toBeNull();
  });

  it('client-scoped LS-ключ (инвариант #9)', () => {
    const { EH, store } = boot('client-a');
    EH.record([{ gripId: 'halfcrimp', edgeMm: 20, lean: 'FDP' }]);
    expect(Object.keys(store)).toContain('heys_client-a_fingers_edge_history_v1');
  });

  it('записи старше окна (>21д) выпадают из usage', () => {
    const { EH } = boot();
    EH.record([{ gripId: 'halfcrimp', edgeMm: 20, lean: 'FDP' }], Date.now() - 30 * 864e5);
    expect(EH.leanUsage().FDP).toBe(0);
  });
});

describe('sessionBuilder §1.3: FDP/FDS ротация в подборе', () => {
  beforeEach(() => { delete globalThis.HEYS; delete globalThis.localStorage; });

  it('пустая история → дефолтный catalog-порядок (FDP-half первым)', () => {
    const { SB, EH } = boot();
    EH.clear();
    const a = pickFS(SB);
    expect(a).toBeTruthy();
    expect(a.id).toBe('fs_maxhang_20mm_half');
    expect(EH.leanOfGrip(a.gripId)).toBe('FDP');
  });

  it('FDP-перегруз → пик клонит к FDS-хвату (open)', () => {
    const { SB, EH } = boot();
    EH.clear();
    for (let i = 0; i < 4; i++) EH.record([{ gripId: 'halfcrimp', edgeMm: 20, lean: 'FDP' }]);
    expect(EH.leanOfGrip(pickFS(SB).gripId)).toBe('FDS');
  });

  it('FDS-перегруз → пик клонит к FDP-хвату (crimp)', () => {
    const { SB, EH } = boot();
    EH.clear();
    for (let i = 0; i < 4; i++) EH.record([{ gripId: 'openhand4', edgeMm: 20, lean: 'FDS' }]);
    expect(EH.leanOfGrip(pickFS(SB).gripId)).toBe('FDP');
  });

  it('reorder не мутирует общий catalog-массив', () => {
    const { SB, EH, BC } = boot();
    EH.clear();
    for (let i = 0; i < 4; i++) EH.record([{ gripId: 'halfcrimp', edgeMm: 20, lean: 'FDP' }]);
    const before = BC.atomsByQuality('finger_strength').map((a) => a.id).join(',');
    pickFS(SB);
    expect(BC.atomsByQuality('finger_strength').map((a) => a.id).join(',')).toBe(before);
  });
});
