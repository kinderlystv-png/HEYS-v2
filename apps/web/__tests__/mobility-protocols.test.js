// mobility-protocols.test.js — product-facing ready-to-run protocol catalog.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');

function ev(file) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(MOB_DIR, file), 'utf8'));
}

function setupFull() {
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {};
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_protocols_catalog_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  return globalThis.HEYS.Mobility;
}

const profile = {
  age: 30,
  level: 'intermediate',
  populations: [],
  equipment: ['band', 'strap', 'foam_roll', 'ball', 'percussion', 'bolster'],
  acceptedDisclaimer: true
};

describe('Mobility protocol catalog', () => {
  beforeEach(setupFull);

  it('экспортирует готовые протоколы как верхний продуктовый слой', () => {
    const catalog = globalThis.HEYS.Mobility.protocolCatalog;
    expect(catalog.__registered).toBe(true);
    expect(catalog.listProtocols({}).length).toBeGreaterThanOrEqual(10);
    expect(catalog.getProtocol('evening_downshift_8')).toMatchObject({
      id: 'evening_downshift_8',
      modeId: 'evening_relax'
    });
  });

  it('даёт default/recommend/buildOptions для UI и builder', () => {
    const catalog = globalThis.HEYS.Mobility.protocolCatalog;
    expect(catalog.defaultForMode('anti_sedentary').id).toBe('desk_reset_4');
    expect(catalog.recommend({ goal: 'develop' }, {}).id).toBe('develop_posterior_chain_18');
    expect(catalog.recommend({ populations: ['desk'] }, {}).id).toBe('desk_reset_4');
    expect(catalog.buildOptions('desk_reset_4')).toMatchObject({
      protocolId: 'desk_reset_4',
      preferredAtomIds: expect.arrayContaining(['recov_movement_snack', 'mob_dynamic_thoracic_openbook'])
    });
  });

  it('протокол влияет на подбор атомов, но проходит через safety builder', () => {
    const M = globalThis.HEYS.Mobility;
    const protocol = M.protocolCatalog.getProtocol('desk_reset_4');
    const built = M.routineBuilder.buildSession(protocol.modeId, profile, M.protocolCatalog.buildOptions(protocol));
    const atomIds = built.session.blocks.flatMap((b) => b.atoms.map((a) => a.id));
    expect(built.ok).toBe(true);
    expect(atomIds).toContain('recov_movement_snack');
    expect(atomIds).toContain('mob_dynamic_thoracic_openbook');
    expect(built.issues.filter((i) => i.level === 'error')).toHaveLength(0);
  });
});
