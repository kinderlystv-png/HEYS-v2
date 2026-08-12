/**
 * prompt-internal-account: optional health features gated by profile.internalAccount.
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
  test('CYCLE_TRACKING_IN_RELEASE is false and features unavailable by default', () => {
    const hf = loadHealthFeatures();
    expect(hf.CYCLE_TRACKING_IN_RELEASE).toBe(false);
    expect(hf.isCycleFeatureAvailable()).toBe(false);
    expect(hf.isMeasurementsTrackingEnabled({ measurementsTrackingEnabled: true })).toBe(false);
    expect(hf.isSupplementsTrackingEnabled({ supplementsTrackingEnabled: true })).toBe(false);
  });

  test('isCycleTrackingEnabled ignores profile flag while out of release', () => {
    const hf = loadHealthFeatures();
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(false);
  });

  test('optional feature toggles are not visible by default', () => {
    const hf = loadHealthFeatures();
    expect(hf.FEATURE_TOGGLES.cycleTrackingEnabled.visible({ gender: 'Женский' })).toBe(false);
    expect(hf.FEATURE_TOGGLES.measurementsTrackingEnabled.visible({})).toBe(false);
    expect(hf.FEATURE_TOGGLES.supplementsTrackingEnabled.visible({})).toBe(false);
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

  test('profile without internalAccount stays gated even with tracking flags on', () => {
    const hf = loadHealthFeatures({
      profile: {
        gender: 'Женский',
        cycleTrackingEnabled: true,
        measurementsTrackingEnabled: true,
        supplementsTrackingEnabled: true,
      },
    });
    expect(hf.isCycleFeatureAvailable()).toBe(false);
    expect(hf.isCycleTrackingEnabled({
      gender: 'Женский',
      cycleTrackingEnabled: true,
    })).toBe(false);
    expect(hf.isMeasurementsTrackingEnabled({ measurementsTrackingEnabled: true })).toBe(false);
    expect(hf.isSupplementsTrackingEnabled({ supplementsTrackingEnabled: true })).toBe(false);
  });
});
