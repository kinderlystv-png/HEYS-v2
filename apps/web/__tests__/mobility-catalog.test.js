// mobility-catalog.test.js — каталог атомов + axis_catalog: целостность данных.
// Источник схемы: CONSTRUCTOR_SPEC §1.2/§1.3, METHODOLOGY ч.2/ч.4.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
};

const AC = () => globalThis.HEYS.Mobility.axisCatalog;
const CAT = () => globalThis.HEYS.Mobility.atomCatalog;

describe('axis_catalog', () => {
  beforeAll(setupOnce);
  it('9 осей', () => { expect(AC().AXIS_IDS.length).toBe(9); });
  it('парные оси заданы', () => { expect(AC().PAIRED.length).toBe(2); });
  it('inEnum работает', () => {
    expect(AC().inEnum('hold', 'doseShape')).toBe(true);
    expect(AC().inEnum('nope', 'doseShape')).toBe(false);
  });
});

describe('atom_catalog — целостность', () => {
  beforeAll(setupOnce);

  it('validateAll без ошибок', () => {
    const r = CAT().validateAll();
    expect(r.errors).toEqual([]);
  });

  it('все 10 блоков A–J представлены', () => {
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].forEach((b) => {
      expect(CAT().byBlock(b).length).toBeGreaterThan(0);
    });
  });

  it('нет дубликатов id', () => {
    const ids = CAT().ATOMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('develop-статика гейтит гипермобильность (S4-данные)', () => {
    const a = CAT().getAtom('flex_static_hamstring');
    expect(a).toBeTruthy();
    expect(a.gates.populationGate).toContain('hypermobile');
  });

  it('эксцентрика НЕ гейтит гипермобильность (укреплять, не растягивать)', () => {
    const a = CAT().getAtom('loadmob_nordic_eccentric');
    expect(a.gates.populationGate).not.toContain('hypermobile');
  });

  it('МФР-атомы несут equipment + contraind', () => {
    const a = CAT().getAtom('smr_foamroll_quad');
    expect(a.gates.equipment).toContain('foam_roll');
    expect(a.gates.contraind).toContain('acute_injury');
  });

  it('дыхательный релакс — автономный вектор relax', () => {
    const a = CAT().getAtom('breath_cyclic_sigh');
    expect(a.autonomic).toBe('relax');
    expect(a.purpose).toBe('regulate');
  });

  it('каждый атом несёт doseConfidence и sourceIds', () => {
    CAT().ATOMS.forEach((a) => {
      expect(['A', 'B', 'C']).toContain(a.doseConfidence);
      expect(Array.isArray(a.sourceIds)).toBe(true);
    });
  });

  it('каждый атом несёт пользовательский контент карточки', () => {
    CAT().ATOMS.forEach((a) => {
      expect(typeof a.title).toBe('string');
      expect(a.title.length).toBeGreaterThan(3);
      expect(typeof a.instruction).toBe('string');
      expect(a.instruction.length).toBeGreaterThan(20);
      expect(Array.isArray(a.cues)).toBe(true);
      expect(a.cues.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('validateAtom ловит нарушение схемы дозы по doseShape', () => {
    const bad = Object.assign({}, CAT().getAtom('flex_static_hamstring'), { dose: { intensity: 'develop' } }); // нет holdSec
    const errs = CAT().validateAtom(bad);
    expect(errs.some((e) => /holdSec/.test(e))).toBe(true);
  });

  it('validateAtom: pnf без relaxSec → ошибка', () => {
    const bad = Object.assign({}, CAT().getAtom('flex_pnf_hamstring_hr'), { dose: { contractSec: 5, holdSec: 20 } });
    const errs = CAT().validateAtom(bad);
    expect(errs.some((e) => /relaxSec/.test(e))).toBe(true);
  });

  it('validateAtom ловит отсутствие instruction content', () => {
    const bad = Object.assign({}, CAT().getAtom('wu_pulse_raise'), { instruction: '' });
    const errs = CAT().validateAtom(bad);
    expect(errs.some((e) => /instruction/.test(e))).toBe(true);
  });
});
