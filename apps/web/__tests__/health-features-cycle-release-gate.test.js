/**
 * prompt-cycle-removal: cycle tracking must stay unavailable in this release,
 * except owner allowlist (spouse client_id).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WIFE_ID = '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc';

function loadHealthFeatures(currentClientId) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../heys_health_features_v1.js'),
    'utf8',
  );
  const sandbox = {
    console,
    window: {},
    HEYS: currentClientId ? { currentClientId } : {},
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.HEYS.healthFeatures;
}

describe('cycle release gate', () => {
  test('CYCLE_TRACKING_IN_RELEASE is false and feature unavailable by default', () => {
    const hf = loadHealthFeatures();
    expect(hf.CYCLE_TRACKING_IN_RELEASE).toBe(false);
    expect(hf.isCycleFeatureAvailable()).toBe(false);
  });

  test('isCycleTrackingEnabled ignores profile flag while out of release', () => {
    const hf = loadHealthFeatures();
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(false);
  });

  test('cycle toggle is not visible by default', () => {
    const hf = loadHealthFeatures();
    const cfg = hf.FEATURE_TOGGLES.cycleTrackingEnabled;
    expect(cfg.visible({ gender: 'Женский' })).toBe(false);
  });

  test('stripDisabledHealthFields nulls cycle fields even when flag was true', () => {
    const hf = loadHealthFeatures();
    const day = {
      cycleDay: 3,
      cycleStatus: 'none',
      cycleAnsweredAt: 1,
      cycleUpdatedAt: 2,
      waterMl: 500,
    };
    const next = hf.stripDisabledHealthFields(day, {
      gender: 'Женский',
      cycleTrackingEnabled: true,
    });
    expect(next.cycleDay).toBeNull();
    expect(next.cycleStatus).toBeNull();
    expect(next.waterMl).toBe(500);
  });

  test('allowlisted spouse client keeps cycle feature available', () => {
    const hf = loadHealthFeatures(WIFE_ID);
    expect(hf.isCycleFeatureAvailable()).toBe(true);
    expect(hf.isCycleFeatureAvailable(WIFE_ID)).toBe(true);
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(true);
    expect(hf.FEATURE_TOGGLES.cycleTrackingEnabled.visible()).toBe(true);
  });

  test('non-allowlisted client stays gated', () => {
    const hf = loadHealthFeatures('ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a');
    expect(hf.isCycleFeatureAvailable()).toBe(false);
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(false);
  });
});
