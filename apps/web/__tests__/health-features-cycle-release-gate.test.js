/**
 * prompt-cycle-removal: cycle tracking must stay unavailable in this release.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadHealthFeatures() {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../heys_health_features_v1.js'),
    'utf8',
  );
  const sandbox = { console, window: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.HEYS.healthFeatures;
}

describe('cycle release gate', () => {
  test('CYCLE_TRACKING_IN_RELEASE is false and feature unavailable', () => {
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

  test('cycle toggle is not visible', () => {
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
});
