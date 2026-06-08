// fingers-block-catalog.test.js — Phase 1 / step 3: каталог 36 атомов × 9 блоков.
// Источник истины: PROTOCOL_POOL.md; контракт: CONSTRUCTOR_SPEC §1.2.
// Off-live-path: данные + sanity API; mix_engine их не читает.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8')); };
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_quality_catalog_v1.js');
  ev('heys_fingers_block_catalog_v1.js');
};

const BC = () => globalThis.HEYS.Fingers.blockCatalog;
const QC = () => globalThis.HEYS.Fingers.qualityCatalog;

describe('block_catalog: структура и состав (PROTOCOL_POOL.md ↔ block-A..I)', () => {
  beforeAll(setupOnce);

  it('9 блоков A..I с правильным quality (METHODOLOGY ч.2 + IMPLEMENTATION_MAP)', () => {
    const ids = BC().BLOCKS.map((b) => b.id);
    expect(ids).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    const map = Object.fromEntries(BC().BLOCKS.map((b) => [b.id, b.quality]));
    expect(map).toEqual({
      A: 'finger_strength',     B: 'max_strength',  C: 'power',
      D: 'anaerobic_capacity',  E: 'aerobic_base',  F: 'technique',
      G: 'antagonist',          H: 'mobility',      I: 'mental'
    });
  });

  it('36 атомов всего, распределение по блокам совпадает с пулом (6/4/5/5/4/4/3/2/3)', () => {
    expect(BC().ATOMS.length).toBe(36);
    const counts = Object.fromEntries(
      BC().BLOCKS.map((b) => [b.id, BC().atomsByBlock(b.id).length])
    );
    expect(counts).toEqual({ A: 6, B: 4, C: 5, D: 5, E: 4, F: 4, G: 3, H: 2, I: 3 });
  });

  it('атомы каждого блока имеют quality, совпадающий с quality блока', () => {
    BC().BLOCKS.forEach((b) => {
      BC().atomsByBlock(b.id).forEach((a) => {
        expect(a.quality, `${a.id} (${b.id})`).toBe(b.quality);
      });
    });
  });

  it('атомы single-effort silnich блоков (A/B/C) — energySystem=phosphagen', () => {
    ['A', 'B', 'C'].forEach((bId) => {
      BC().atomsByBlock(bId).forEach((a) => {
        expect(a.energySystem, a.id).toBe('phosphagen');
      });
    });
  });

  it('блок D (anaerobic_capacity) — glycolytic; E (aerobic_base) — aerobic', () => {
    BC().atomsByBlock('D').forEach((a) => expect(a.energySystem).toBe('glycolytic'));
    BC().atomsByBlock('E').forEach((a) => expect(a.energySystem).toBe('aerobic'));
  });

  it('блоки F/G/H/I (навык/антагонист/мобильность/ментал) — energySystem=null', () => {
    ['F', 'G', 'H', 'I'].forEach((bId) => {
      BC().atomsByBlock(bId).forEach((a) => {
        expect(a.energySystem, a.id).toBeNull();
      });
    });
  });
});

describe('block_catalog: validate() — enum sanity + fail-closed', () => {
  beforeAll(setupOnce);

  it('validate() возвращает 0 errors на свежем каталоге', () => {
    const v = BC().validate();
    if (v.errors.length) console.log('ERRORS:', v.errors);
    expect(v.errors).toEqual([]);
  });

  it('нит ревью: validate().errors массив именно пуст (CI guard, не truthy-check)', () => {
    const v = BC().validate();
    expect(Array.isArray(v.errors)).toBe(true);
    expect(v.errors.length).toBe(0);
    expect(Array.isArray(v.warnings)).toBe(true);
  });

  it('никакой атом не имеет gates.minAge=null (§1.2 fail-closed)', () => {
    BC().ATOMS.forEach((a) => {
      expect(a.gates.minAge, a.id).not.toBeNull();
      expect(typeof a.gates.minAge, a.id).toBe('number');
    });
  });

  it('каждый атом имеет непустой sourceIds (провенанс обязателен)', () => {
    BC().ATOMS.forEach((a) => {
      expect(Array.isArray(a.sourceIds), a.id).toBe(true);
      expect(a.sourceIds.length, a.id).toBeGreaterThan(0);
    });
  });

  it('каждый атом имеет doseConfidence ∈ {A,B,C}', () => {
    BC().ATOMS.forEach((a) => {
      expect(['A', 'B', 'C'], a.id).toContain(a.doseConfidence);
    });
  });

  it('density-hang и repeater triggers override warnings (заметка целостности §3.1)', () => {
    const v = BC().validate();
    const warned = new Set(v.warnings.map((w) => w.split(':')[0]));
    expect(warned.has('fs_density_hang')).toBe(true); // workSec=30 derive→glycolytic, explicit phosphagen
    expect(warned.has('fs_repeater_73')).toBe(false); // workSec=7 derive→phosphagen, explicit phosphagen → совпадает, без warn
  });
});

describe('block_catalog: API — getAtom/getBlock/atomsBy*', () => {
  beforeAll(setupOnce);

  it('getAtom возвращает атом по id; null для несуществующего', () => {
    expect(BC().getAtom('fs_maxhang_20mm_half').gripId).toBe('halfcrimp');
    expect(BC().getAtom('not_real')).toBeNull();
  });

  it('getBlock возвращает блок по id; null для несуществующего', () => {
    expect(BC().getBlock('A').quality).toBe('finger_strength');
    expect(BC().getBlock('Z')).toBeNull();
  });

  it('atomsByQuality(power) — 5 атомов блока C', () => {
    expect(BC().atomsByQuality('power').length).toBe(5);
    BC().atomsByQuality('power').forEach((a) => expect(a.blockId).toBe('C'));
  });

  it('BLOCKS[i].atomIds совпадает с atomsByBlock(id).map(a=>a.id)', () => {
    BC().BLOCKS.forEach((b) => {
      const fromIndex = BC().atomsByBlock(b.id).map((a) => a.id);
      expect(b.atomIds).toEqual(fromIndex);
    });
  });
});

describe('block_catalog ↔ quality_catalog: интеграция', () => {
  beforeAll(setupOnce);

  it('quality каждого атома ∈ qualityCatalog.QUALITIES', () => {
    const Q = QC().QUALITIES;
    BC().ATOMS.forEach((a) => {
      expect(Q, a.id).toContain(a.quality);
    });
  });

  it('deriveEnergySystem совпадает с указанным energySystem для single-effort max-hangs (фундаментальный sanity)', () => {
    // max-hangs workSec=10, repsPerSet=1 → phosphagen
    const a = BC().getAtom('fs_maxhang_20mm_half');
    expect(QC().deriveEnergySystem(a.dose.workSec)).toBe(a.energySystem);
  });

  it('aerobic_base атомы — derive по workSec ≥ 1800 даёт aerobic (continuous-shape)', () => {
    const arc = BC().getAtom('aer_arc'); // workSec 1800
    const mil = BC().getAtom('aer_mileage'); // workSec 2700
    expect(QC().deriveEnergySystem(arc.dose.workSec)).toBe('aerobic');
    expect(QC().deriveEnergySystem(mil.dose.workSec)).toBe('aerobic');
  });
});
