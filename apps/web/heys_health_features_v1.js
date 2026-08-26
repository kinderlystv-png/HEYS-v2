// heys_health_features_v1.js — optional health features (cycle, measurements, supplements)
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  // Release gate (prompt-cycle-removal, 2026-08): cycle tracking is out of release.
  // Keep module/code; close all enable/write paths until device-only return.
  const CYCLE_TRACKING_IN_RELEASE = true;
  const MEASUREMENTS_TRACKING_IN_RELEASE = true;
  // Supplements: отдельное согласие 1.0, не спецкатегория — в релизе после 1.11.
  const SUPPLEMENTS_TRACKING_IN_RELEASE = true;

  // Legacy alias: true only when every optional feature is in release.
  const OPTIONAL_HEALTH_FEATURES_IN_RELEASE = (
    CYCLE_TRACKING_IN_RELEASE
    && MEASUREMENTS_TRACKING_IN_RELEASE
    && SUPPLEMENTS_TRACKING_IN_RELEASE
  );

  const DEFAULT_PROFILE_FLAGS = Object.freeze({
    internalAccount: false,
    cycleTrackingEnabled: false,
    measurementsTrackingEnabled: false,
    supplementsTrackingEnabled: false,
  });

  const CONSENT_TYPES = Object.freeze({
    cycle_tracking: 'pending-owner-text',
    body_measurements: '1.0',
    supplements_tracking: '1.0',
  });
  const CONSENT_PROMPTS = Object.freeze({
    body_measurements:
      'Замеры тела. Обрабатываются обхваты и даты. Видят вы и куратор. Пока функция включена; выключение удаляет замеры. Документ: /docs/v1.0/body-measurements-consent.md',
    supplements_tracking:
      'Отметки о добавках из справочника сервиса и даты. Лекарства вносить нельзя. Видят вы и куратор. Пока функция включена; выключение удаляет отметки. Документ: /docs/v1.0/supplements-consent.md',
  });

  const KNOWN_SUPPLEMENT_IDS = new Set([
    'vitD', 'vitC', 'zinc', 'selenium', 'omega3', 'magnesium', 'b12', 'b6', 'lecithin',
    'calcium', 'k2', 'collagen', 'glucosamine', 'creatine', 'bcaa', 'protein', 'biotin',
    'vitE', 'hyaluronic', 'iron', 'folic', 'melatonin', 'glycine', 'ltheanine', 'coq10',
    'berberine', 'cinnamon', 'chromium', 'vinegar', 'flaxOil', 'oliveOil', 'fishOil',
  ]);

  const CYCLE_DAY_FIELDS = ['cycleDay', 'cycleStatus', 'cycleAnsweredAt', 'cycleUpdatedAt'];
  const MEASUREMENT_FIELDS = ['measurements'];
  const SUPPLEMENT_DAY_FIELDS = [
    'supplementsPlanned', 'supplementsPlannedUpdatedAt',
    'supplementsTaken', 'supplementsTakenAt', 'supplementsTakenMeta', 'supplementsTakenUpdatedAt',
  ];

  function resolveClientId(clientId) {
    if (clientId != null && String(clientId).trim()) {
      return String(clientId).trim().toLowerCase();
    }
    try {
      return String(
        HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '',
      ).trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function resolveProfile(profile) {
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) return profile;
    try {
      if (HEYS.store && typeof HEYS.store.get === 'function') {
        const fromStore = HEYS.store.get('heys_profile', null);
        if (fromStore && typeof fromStore === 'object') return fromStore;
      }
    } catch (_) { /* noop */ }
    return null;
  }

  function isInternalAccount(profile) {
    const resolved = resolveProfile(profile);
    return !!(resolved && resolved.internalAccount === true);
  }

  function isOptionalHealthFeatureAvailable(profile) {
    if (OPTIONAL_HEALTH_FEATURES_IN_RELEASE === true) return true;
    return isInternalAccount(profile);
  }

  function isFeatureInRelease(inReleaseFlag, profile) {
    if (inReleaseFlag === true) return true;
    return isInternalAccount(profile);
  }

  function isCycleFeatureAvailable(profile) {
    return isFeatureInRelease(CYCLE_TRACKING_IN_RELEASE, profile);
  }

  function isMeasurementsFeatureAvailable(profile) {
    return isFeatureInRelease(MEASUREMENTS_TRACKING_IN_RELEASE, profile);
  }

  function isSupplementsFeatureAvailable(profile) {
    return isFeatureInRelease(SUPPLEMENTS_TRACKING_IN_RELEASE, profile);
  }

  function isCycleTrackingEnabled(profile, clientId) {
    void clientId;
    if (!isCycleFeatureAvailable(profile)) return false;
    const resolved = resolveProfile(profile);
    return !!(resolved && resolved.gender === 'Женский' && resolved.cycleTrackingEnabled === true);
  }

  function isMeasurementsTrackingEnabled(profile) {
    if (!isMeasurementsFeatureAvailable(profile)) return false;
    const resolved = resolveProfile(profile);
    return !!(resolved && resolved.measurementsTrackingEnabled === true);
  }

  function isSupplementsTrackingEnabled(profile) {
    if (!isSupplementsFeatureAvailable(profile)) return false;
    const resolved = resolveProfile(profile);
    return !!(resolved && resolved.supplementsTrackingEnabled === true);
  }

  function isKnownSupplementId(id) {
    if (!id) return false;
    const value = String(id);
    if (value.startsWith('custom_')) return false;
    return KNOWN_SUPPLEMENT_IDS.has(value);
  }

  function hasOwnData(value) {
    if (value == null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value).length > 0;
    return true;
  }

  function nullOutFields(target, fields) {
    let changed = false;
    const next = { ...target };
    for (const field of fields) {
      if (!Object.prototype.hasOwnProperty.call(next, field) && next[field] == null) continue;
      if (next[field] == null) continue;
      next[field] = null;
      changed = true;
    }
    return changed ? next : target;
  }

  function purgeCycleDataFromDay(day) {
    if (!day || typeof day !== 'object') return day;
    return nullOutFields(day, CYCLE_DAY_FIELDS);
  }

  function purgeMeasurementsFromDay(day) {
    if (!day || typeof day !== 'object') return day;
    return nullOutFields(day, MEASUREMENT_FIELDS);
  }

  function purgeSupplementsFromDay(day) {
    if (!day || typeof day !== 'object') return day;
    return nullOutFields(day, SUPPLEMENT_DAY_FIELDS);
  }

  function purgeCycleDataFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    return { ...profile, cycleTrackingEnabled: false };
  }

  function purgeMeasurementsFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    return { ...profile, measurementsTrackingEnabled: false };
  }

  function purgeSupplementsFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return profile;
    const next = {
      ...profile,
      supplementsTrackingEnabled: false,
      showDiarySupplementsPanel: false,
      plannedSupplements: [],
      customSupplements: [],
      supplementSettings: {},
      supplementHistory: {},
    };
    return next;
  }

  /**
   * Strip health fields when respective tracking flag is explicitly disabled.
   * Unknown profile (null/undefined) → leave day untouched (boot-race safe).
   */
  function stripDisabledHealthFields(day, profile) {
    if (!day || typeof day !== 'object') return day;
    if (!profile || typeof profile !== 'object') return day;

    let next = day;
    if (!isCycleTrackingEnabled(profile)) {
      const purged = purgeCycleDataFromDay(next);
      if (purged !== next) next = purged;
    }
    if (!isMeasurementsTrackingEnabled(profile)) {
      const purged = purgeMeasurementsFromDay(next);
      if (purged !== next) next = purged;
    }
    if (!isSupplementsTrackingEnabled(profile)) {
      const purged = purgeSupplementsFromDay(next);
      if (purged !== next) next = purged;
    }
    return next;
  }

  function gateHealthFieldsForOwner(day, profile) {
    return stripDisabledHealthFields(day, profile);
  }

  const FEATURE_TOGGLES = Object.freeze({
    cycleTrackingEnabled: {
      consentType: 'cycle_tracking',
      label: 'Трекинг цикла',
      purgeDay: purgeCycleDataFromDay,
      purgeProfile: purgeCycleDataFromProfile,
      visible: (profile) => isOptionalHealthFeatureAvailable(profile),
    },
    measurementsTrackingEnabled: {
      consentType: 'body_measurements',
      label: 'Замеры тела',
      purgeDay: purgeMeasurementsFromDay,
      purgeProfile: purgeMeasurementsFromProfile,
      visible: (profile) => isMeasurementsFeatureAvailable(profile),
    },
    supplementsTrackingEnabled: {
      consentType: 'supplements_tracking',
      label: 'Добавки',
      purgeDay: purgeSupplementsFromDay,
      purgeProfile: purgeSupplementsFromProfile,
      visible: (profile) => isSupplementsFeatureAvailable(profile),
    },
  });

  function scopedDayKeys() {
    const keys = [];
    try {
      const cid = (HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '').toLowerCase();
      const prefix = cid ? `heys_${cid}_dayv2_` : 'heys_dayv2_';
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) keys.push(key);
      }
    } catch (_) { /* noop */ }
    return keys;
  }

  function purgeLocalDays(purgeDayFn) {
    // Purge must go through OverlayStore so the interceptor/cloud sync sees the
    // write. A silent localStorage fallback would delete locally and resurrect
    // on next sync — worse than failing for consent-withdrawal.
    if (!HEYS.store || typeof HEYS.store.get !== 'function' || typeof HEYS.store.set !== 'function') {
      throw new Error(
        'HEYS.store unavailable: cannot purge health-feature day data without OverlayStore',
      );
    }
    const toBase = (key) => key.replace(/^heys_[0-9a-f-]{36}_/, '').replace(/^heys_/, '');
    for (const key of scopedDayKeys()) {
      let day;
      try {
        day = HEYS.store.get(toBase(key), null);
      } catch (_) {
        day = null;
      }
      if (!day || typeof day !== 'object') continue;
      const purged = purgeDayFn(day);
      if (purged !== day) HEYS.store.set(toBase(key), purged);
    }
  }

  const OPTIONAL_FEATURE_FLAG_KEYS = Object.freeze([
    'cycleTrackingEnabled',
    'measurementsTrackingEnabled',
    'supplementsTrackingEnabled',
  ]);

  async function ensureOptionalFeatureConsentApi(timeoutMs = 8000) {
    if (HEYS.Consents?.api?.requestOptionalFeatureConsent) return HEYS.Consents.api;
    if (typeof HEYS.__loadPostboot1Game === 'function') {
      try {
        await HEYS.__loadPostboot1Game();
      } catch (_) { /* noop */ }
    }
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (HEYS.Consents?.api?.requestOptionalFeatureConsent) return HEYS.Consents.api;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return HEYS.Consents?.api || null;
  }

  /**
   * Enable/disable optional health feature with consent gate and local purge on disable.
   * Returns true when toggle should be applied to profile.
   */
  async function requestHealthFeatureToggle(flagKey, nextEnabled) {
    const cfg = FEATURE_TOGGLES[flagKey];
    if (!cfg) return false;
    const isReadonlyHost = !!(global.__HEYS_READONLY_MODE__ && global.__HEYS_READONLY_MODE__.enabled);
    if (flagKey === 'measurementsTrackingEnabled' && nextEnabled && !isMeasurementsFeatureAvailable()) {
      return false;
    }
    if (flagKey === 'supplementsTrackingEnabled' && nextEnabled && !isSupplementsFeatureAvailable()) {
      return false;
    }
    if (flagKey === 'cycleTrackingEnabled' && !isCycleFeatureAvailable()) {
      if (nextEnabled) return false;
      // Allow explicit disable/purge path while feature is out of release.
    }
    if (nextEnabled) {
      const consentType = cfg.consentType;
      if (consentType && consentType !== 'pending-owner-text' && consentType !== 'cycle_tracking') {
        const consentsApi = await ensureOptionalFeatureConsentApi();
        if (consentsApi?.requestOptionalFeatureConsent) {
          const result = await consentsApi.requestOptionalFeatureConsent(consentType);
          if (!result?.granted) return false;
          if (isReadonlyHost || result.readonly) {
            console.info('[healthFeatures] READONLY_MODE — optional feature consent preview only');
          }
          return true;
        }
      }
      const ok = global.confirm(
        `${CONSENT_PROMPTS[cfg.consentType] || `Согласие на «${cfg.label}».`}\n\nВключить функцию?`
      );
      if (!ok) return false;
      if (isReadonlyHost) {
        console.info('[healthFeatures] READONLY_MODE — skip logConsentsBySession, allow local preview toggle');
        return true;
      }
      const version = CONSENT_TYPES[cfg.consentType] || 'pending-owner-text';
      if (HEYS.YandexAPI && typeof HEYS.YandexAPI.logConsentsBySession === 'function') {
        const result = await HEYS.YandexAPI.logConsentsBySession([{
          type: cfg.consentType,
          version,
          granted: true,
        }]);
        if (result && result.error) return false;
      }
      return true;
    }
    const ok = global.confirm(
      `Выключение «${cfg.label}» удалит все сохранённые данные этой функции. Продолжить?`
    );
    if (!ok) return false;
    purgeLocalDays(cfg.purgeDay);
    if (!isReadonlyHost && HEYS.YandexAPI && typeof HEYS.YandexAPI.revokeConsentBySession === 'function') {
      await HEYS.YandexAPI.revokeConsentBySession(cfg.consentType);
    }
    return true;
  }

  HEYS.healthFeatures = {
    DEFAULT_PROFILE_FLAGS,
    CONSENT_TYPES,
    KNOWN_SUPPLEMENT_IDS,
    CYCLE_TRACKING_IN_RELEASE,
    MEASUREMENTS_TRACKING_IN_RELEASE,
    SUPPLEMENTS_TRACKING_IN_RELEASE,
    OPTIONAL_HEALTH_FEATURES_IN_RELEASE,
    isInternalAccount,
    isOptionalHealthFeatureAvailable,
    isFeatureInRelease,
    isCycleFeatureAvailable,
    isMeasurementsFeatureAvailable,
    isSupplementsFeatureAvailable,
    isCycleTrackingEnabled,
    isMeasurementsTrackingEnabled,
    isSupplementsTrackingEnabled,
    isKnownSupplementId,
    stripDisabledHealthFields,
    gateHealthFieldsForOwner,
    purgeCycleDataFromDay,
    purgeMeasurementsFromDay,
    purgeSupplementsFromDay,
    purgeCycleDataFromProfile,
    purgeMeasurementsFromProfile,
    purgeSupplementsFromProfile,
    hasOwnData,
    FEATURE_TOGGLES,
    requestHealthFeatureToggle,
    purgeLocalDays,
  };
})(typeof window !== 'undefined' ? window : globalThis);
