/**
 * Optional health features: per-feature release gates (cycle off, supplements on).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INTERNAL_PROFILE = Object.freeze({
  internalAccount: true,
  gender: 'Женский',
  cycleTrackingEnabled: true,
  measurementsTrackingEnabled: true,
  supplementsTrackingEnabled: true,
});

function loadHealthFeatures({ profile } = {}) {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../heys_health_features_v1.js'),
    'utf8',
  );
  const sandbox = {
    console,
    window: {},
    HEYS: {
      store: profile
        ? { get: (key) => (key === 'heys_profile' ? profile : null) }
        : undefined,
    },
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.HEYS.healthFeatures;
}

describe('optional health features release gate', () => {
  test('cycle is in release; supplements and measurements are in release', () => {
    const hf = loadHealthFeatures();
    expect(hf.CYCLE_TRACKING_IN_RELEASE).toBe(true);
    expect(hf.SUPPLEMENTS_TRACKING_IN_RELEASE).toBe(true);
    expect(hf.MEASUREMENTS_TRACKING_IN_RELEASE).toBe(true);
    expect(hf.isCycleFeatureAvailable()).toBe(true);
    expect(hf.isSupplementsFeatureAvailable()).toBe(true);
    expect(hf.isMeasurementsFeatureAvailable()).toBe(true);
  });

  test('regular profile can enable cycle, supplements and measurements', () => {
    const hf = loadHealthFeatures();
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(true);
    expect(hf.isMeasurementsTrackingEnabled({ measurementsTrackingEnabled: true })).toBe(true);
    expect(hf.isSupplementsTrackingEnabled({ supplementsTrackingEnabled: true })).toBe(true);
  });

  test('optional feature toggles visibility matches per-feature gates', () => {
    const hf = loadHealthFeatures();
    expect(hf.FEATURE_TOGGLES.cycleTrackingEnabled.visible({ gender: 'Женский' })).toBe(true);
    expect(hf.FEATURE_TOGGLES.measurementsTrackingEnabled.visible({})).toBe(true);
    expect(hf.FEATURE_TOGGLES.supplementsTrackingEnabled.visible({})).toBe(true);
  });

  test('stripDisabledHealthFields keeps cycle fields when release gate on and tracking enabled', () => {
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
    expect(next.cycleDay).toBe(3);
    expect(next.cycleStatus).toBe('none');
    expect(next.waterMl).toBe(500);
  });

  test('stripDisabledHealthFields nulls cycle when tracking disabled', () => {
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
      cycleTrackingEnabled: false,
    });
    expect(next.cycleDay).toBeNull();
    expect(next.cycleStatus).toBeNull();
    expect(next.waterMl).toBe(500);
  });

  test('supplements day fields survive when tracking enabled on regular profile', () => {
    const hf = loadHealthFeatures();
    const day = {
      supplementsPlanned: ['vitD'],
      supplementsTaken: [],
    };
    const next = hf.stripDisabledHealthFields(day, {
      supplementsTrackingEnabled: true,
    });
    expect(next.supplementsPlanned).toEqual(['vitD']);
  });

  test('enable path uses optional feature consent popup API', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../heys_health_features_v1.js'),
      'utf8',
    );
    expect(source).toContain('ensureOptionalFeatureConsentApi');
    expect(source).toContain('requestOptionalFeatureConsent');
  });

  test('internalAccount profile keeps all optional health features available', () => {
    const hf = loadHealthFeatures({ profile: INTERNAL_PROFILE });
    expect(hf.isInternalAccount(INTERNAL_PROFILE)).toBe(true);
    expect(hf.isCycleFeatureAvailable()).toBe(true);
    expect(hf.isCycleTrackingEnabled(INTERNAL_PROFILE)).toBe(true);
    expect(hf.isMeasurementsTrackingEnabled(INTERNAL_PROFILE)).toBe(true);
    expect(hf.isSupplementsTrackingEnabled(INTERNAL_PROFILE)).toBe(true);
    expect(hf.FEATURE_TOGGLES.cycleTrackingEnabled.visible(INTERNAL_PROFILE)).toBe(true);
    expect(hf.FEATURE_TOGGLES.measurementsTrackingEnabled.visible(INTERNAL_PROFILE)).toBe(true);
    expect(hf.FEATURE_TOGGLES.supplementsTrackingEnabled.visible(INTERNAL_PROFILE)).toBe(true);
  });
});
