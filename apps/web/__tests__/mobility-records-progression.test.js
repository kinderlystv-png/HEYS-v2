// mobility-records-progression.test.js — records store + progression.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_records_v1.js'), 'utf8'));
  /* eslint-disable-next-line no-eval */
  eval(fs.readFileSync(path.join(KERNEL_DIR, 'heys_kernel_progression_v1.js'), 'utf8'));
  const ev = (f) => { /* eslint-disable-next-line no-eval */ eval(fs.readFileSync(path.join(MOB_DIR, f), 'utf8')); };
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_records_store_v1.js');
  ev('heys_mobility_progression_v1.js');
};

const M = () => globalThis.HEYS.Mobility;

describe('mobility records store', () => {
  beforeAll(setupOnce);

  it('сохраняет session client-scoped', () => {
    const storage = M().recordsStore.createMemoryStorage();
    expect(globalThis.HEYS.TrainingKernel.records).toBeTruthy();
    M().recordsStore.addSession('c1', { ok: true, session: { mode: 'evening_relax', blocks: [] } }, storage);
    expect(M().recordsStore.listSessions('c1', storage).length).toBe(1);
    expect(M().recordsStore.listSessions('c2', storage).length).toBe(0);
  });

  it('latestAssessment возвращает последний аудит', () => {
    const storage = M().recordsStore.createMemoryStorage();
    M().recordsStore.addAssessment('c1', { leadingLimiter: { jointRegion: 'ankle' } }, storage);
    M().recordsStore.addAssessment('c1', { leadingLimiter: { jointRegion: 'hip' } }, storage);
    expect(M().recordsStore.latestAssessment('c1', storage).audit.leadingLimiter.jointRegion).toBe('hip');
  });
});

describe('mobility progression', () => {
  beforeAll(setupOnce);

  it('pain ведёт к regress', () => {
    const atom = M().atomCatalog.getAtom('flex_static_hamstring');
    const r = M().progression.suggest(atom, { painFlags: [{ level: 'pain' }] }, { band: 'green' });
    expect(r.action).toBe('regress');
  });

  it('plateau переключает ось прогрессии', () => {
    expect(globalThis.HEYS.TrainingKernel.progression).toBeTruthy();
    const atom = M().atomCatalog.getAtom('flex_static_hamstring');
    const r = M().progression.suggest(atom, { romValues: [70, 71, 70.5], progressionAxis: 'amplitude' }, { band: 'green' });
    expect(r.action).toBe('switch_axis');
    expect(r.axis).toBe('tempo');
  });

  it('weeklyHoldVolumeSec считает hold объём', () => {
    const atom = M().atomCatalog.getAtom('flex_static_hamstring');
    const records = { sessions: [{ session: { blocks: [{ atoms: [atom] }] } }] };
    expect(M().progression.weeklyHoldVolumeSec(records, atom.id)).toBe(60);
  });

  it('weeklyHoldVolumeSec считает диапазон reps через точную цель', () => {
    const atom = { id: 'hold_range', doseShape: 'hold', dose: { holdSec: 15, reps: [2, 4], sets: 2 } };
    const records = { sessions: [{ session: { blocks: [{ atoms: [atom] }] } }] };
    expect(M().progression.weeklyHoldVolumeSec(records, atom.id)).toBe(90);
  });

  it('romTrend считает динамику ROM из assessment history', () => {
    const records = {
      assessments: [
        {
          savedAt: '2026-01-01T00:00:00.000Z',
          audit: { rows: [{ ok: true, testId: 'ankle_dorsiflexion', jointRegion: 'ankle', measure: 12, norm: 20, unit: 'deg', deficit: 0.4 }] }
        },
        {
          savedAt: '2026-02-01T00:00:00.000Z',
          audit: { rows: [{ ok: true, testId: 'ankle_dorsiflexion', jointRegion: 'ankle', measure: 16, norm: 20, unit: 'deg', deficit: 0.2 }] }
        }
      ]
    };
    const trend = M().progression.romTrend(records, 'ankle_dorsiflexion');
    expect(trend.ok).toBe(true);
    expect(trend.delta).toBe(4);
    expect(trend.direction).toBe('improving');
    expect(trend.series.map((x) => x.measure)).toEqual([12, 16]);
  });
});
