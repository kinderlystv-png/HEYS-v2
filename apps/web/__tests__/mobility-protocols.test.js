// mobility-protocols.test.js — product-facing ready-to-run protocol catalog.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOB_DIR = path.resolve(__dirname, '..', 'mobility');
const KERNEL_DIR = path.resolve(__dirname, '..', '_kernel');

function ev(file, dir = MOB_DIR) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(dir, file), 'utf8'));
}

function setupFull() {
  globalThis.window = globalThis;
  globalThis.HEYS = globalThis.window.HEYS = {};
  ev('heys_kernel_runner_v1.js', KERNEL_DIR);
  ev('heys_mobility_axis_catalog_v1.js');
  ev('heys_mobility_load_v1.js');
  ev('heys_mobility_validators_v1.js');
  ev('heys_mobility_atom_catalog_v1.js');
  ev('heys_mobility_mode_engine_v1.js');
  ev('heys_mobility_protocols_catalog_v1.js');
  ev('heys_mobility_routine_builder_v1.js');
  ev('heys_mobility_breath_runner_v1.js');
  ev('heys_mobility_routine_runner_v1.js');
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
    expect(catalog.defaultForMode('posture').id).toBe('posture_reset_no_equipment_8');
    expect(catalog.recommend({ goal: 'develop' }, {}).id).toBe('develop_posterior_chain_18');
    expect(catalog.recommend({ goal: 'posture', equipment: [] }, {}).id).toBe('posture_reset_no_equipment_8');
    expect(catalog.recommend({ populations: ['desk'] }, {}).id).toBe('desk_reset_4');
    expect(catalog.recommend({}, { keyLoadWithinHours: null }).id).toBe('morning_reset_6');
    expect(catalog.recommend({}, { keyLoadWithinHours: 24 }).id).toBe('peak_maintenance_6');
    expect(catalog.buildOptions('desk_reset_4')).toMatchObject({
      protocolId: 'desk_reset_4',
      preferredAtomIds: expect.arrayContaining(['recov_movement_snack', 'mob_dynamic_thoracic_openbook'])
    });
  });

  it('рекомендует полноценный posture-протокол под каждый выбранный инвентарь', () => {
    const catalog = globalThis.HEYS.Mobility.protocolCatalog;
    expect(catalog.recommend({ goal: 'posture', equipment: ['band'] }, {}).id).toBe('posture_band_scapular_12');
    expect(catalog.recommend({ goal: 'posture', equipment: ['foam_roll'] }, {}).id).toBe('posture_foamroll_thoracic_10');
    expect(catalog.recommend({ goal: 'posture', equipment: ['ball'] }, {}).id).toBe('posture_ball_pec_release_10');
    expect(catalog.recommend({ goal: 'posture', equipment: ['strap'] }, {}).id).toBe('posture_strap_shoulder_10');
    expect(catalog.recommend({ goal: 'posture', equipment: ['percussion'] }, {}).id).toBe('posture_percussion_upper_back_8');
    expect(catalog.recommend({ goal: 'posture', equipment: ['bolster'] }, {}).id).toBe('posture_supported_evening_10');
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

  it('posture-протоколы собираются через safety builder в реальные сессии', () => {
    const M = globalThis.HEYS.Mobility;
    [
      ['posture_reset_no_equipment_8', []],
      ['posture_band_scapular_12', ['band']],
      ['posture_foamroll_thoracic_10', ['foam_roll']],
      ['posture_ball_pec_release_10', ['ball']],
      ['posture_strap_shoulder_10', ['strap']],
      ['posture_percussion_upper_back_8', ['percussion']],
      ['posture_supported_evening_10', ['bolster']]
    ].forEach(([protocolId, equipment]) => {
      const protocol = M.protocolCatalog.getProtocol(protocolId);
      const built = M.routineBuilder.buildSession(
        protocol.modeId,
        Object.assign({}, profile, { equipment }),
        M.protocolCatalog.buildOptions(protocol)
      );
      const atomIds = built.session.blocks.flatMap((b) => b.atoms.map((a) => a.id));
      expect(built.ok, protocolId).toBe(true);
      expect(built.session.mode, protocolId).toBe('posture');
      expect(atomIds, protocolId).toEqual(expect.arrayContaining([
        protocol.preferredAtomIds[0],
        'act_deep_neck_flexor_nod'
      ]));
      expect(built.issues.filter((i) => i.level === 'error'), protocolId).toHaveLength(0);
    });
  });

  it('заявленные минуты протоколов совпадают с фактическим runner-планом', () => {
    const M = globalThis.HEYS.Mobility;
    M.protocolCatalog.listProtocols({}).forEach((protocol) => {
      const built = M.routineBuilder.buildSession(
        protocol.modeId,
        profile,
        M.protocolCatalog.buildOptions(protocol)
      );
      const plan = M.routineRunner.buildRunPlan(built.session);
      const actualMin = Math.round(plan.estimatedDurationSec / 60);
      expect(actualMin, protocol.id).toBeGreaterThanOrEqual(protocol.durationMin[0]);
      expect(actualMin, protocol.id).toBeLessThanOrEqual(protocol.durationMin[1]);
    });
  });
});
