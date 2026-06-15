// heys_kernel_sports_v1.js — ОБЩЕЕ ЯДРО: SPORT_CONFIG registry.
//
// Runtime-контракт для тренировочных доменов: каждый режим регистрирует свой
// SPORT_CONFIG (оси, модальности, tissue-risk, recovery windows и т.д.), а общие
// движки читают данные по sportId вместо хардкода доменных литералов.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.sports && TK.sports.__registered) return;

  const REGISTRY = Object.create(null);

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function validate(config) {
    const cfg = config && typeof config === 'object' ? config : null;
    const issues = [];
    if (!cfg) {
      issues.push({ level: 'error', code: 'SPORT_CONFIG.invalid', field: 'config' });
      return issues;
    }
    if (!cfg.sportId || typeof cfg.sportId !== 'string') {
      issues.push({ level: 'error', code: 'SPORT_CONFIG.sportId_missing', field: 'sportId' });
    }
    ['qualityAxes', 'modalities', 'positionAxes'].forEach(function (field) {
      if (!Array.isArray(cfg[field]) || cfg[field].length === 0) {
        issues.push({ level: 'error', code: 'SPORT_CONFIG.' + field + '_missing', field: field });
      }
    });
    if (!cfg.tissueRiskModel || typeof cfg.tissueRiskModel !== 'object') {
      issues.push({ level: 'warn', code: 'SPORT_CONFIG.tissueRiskModel_missing', field: 'tissueRiskModel' });
    }
    if (!cfg.recoveryWindows || typeof cfg.recoveryWindows !== 'object') {
      issues.push({ level: 'warn', code: 'SPORT_CONFIG.recoveryWindows_missing', field: 'recoveryWindows' });
    }
    return issues;
  }

  function normalize(config) {
    const cfg = Object.assign({}, config || {});
    cfg.qualityAxes = cloneArray(cfg.qualityAxes);
    cfg.modalities = cloneArray(cfg.modalities);
    cfg.positionAxes = cloneArray(cfg.positionAxes);
    cfg.painLocations = cloneArray(cfg.painLocations);
    cfg.modes = cloneArray(cfg.modes);
    cfg.registeredAt = cfg.registeredAt || new Date().toISOString();
    return Object.freeze(cfg);
  }

  function register(config) {
    const issues = validate(config);
    const hasError = issues.some(function (i) { return i.level === 'error'; });
    if (hasError) return { ok: false, config: null, issues: issues };
    const cfg = normalize(config);
    REGISTRY[cfg.sportId] = cfg;
    return { ok: true, config: cfg, issues: issues };
  }

  function get(sportId) {
    return REGISTRY[String(sportId || '')] || null;
  }

  function list() {
    return Object.keys(REGISTRY).sort().map(function (id) { return REGISTRY[id]; });
  }

  TK.sports = {
    __registered: true,
    validate: validate,
    register: register,
    get: get,
    list: list,
    _registry: REGISTRY
  };
})(typeof window !== 'undefined' ? window : globalThis);
