// mobility-bibliography.test.js — sourceIds + honest effect map.

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
  ev('heys_mobility_bibliography_v1.js');
};

const M = () => globalThis.HEYS.Mobility;

describe('mobility bibliography', () => {
  beforeAll(setupOnce);

  it('все sourceIds атомов резолвятся', () => {
    const missing = [];
    M().atomCatalog.ATOMS.forEach((a) => {
      missing.push(...M().bibliography.missingSources(a.sourceIds).map((id) => `${a.id}:${id}`));
    });
    expect(missing).toEqual([]);
  });

  it('effect map фиксирует честные no/limited/caution области', () => {
    expect(M().bibliography.getEffect('posture').verdict).toBe('no_effect');
    expect(M().bibliography.getEffect('hypertrophy').verdict).toBe('no_practical_effect');
    expect(M().bibliography.getEffect('acute_strength').verdict).toBe('caution');
  });

  it('resolveSources возвращает силу источника', () => {
    const src = M().bibliography.resolveSources(['behm2016'])[0];
    expect(src.strength).toBe('A');
  });
});
