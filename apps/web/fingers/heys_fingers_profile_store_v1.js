// heys_fingers_profile_store_v1.js — shared Fingers profile resolver.
//
// Public API:
//   HEYS.Fingers.getProfile()              → normalized fingerboard profile
//   HEYS.Fingers.saveProfilePatch(patch)   → merge patch into heys_profile.fingerboardProfile
//   HEYS.Fingers.profileStore              → { get, savePatch, normalizeLevel, LEVELS }
//
// Contract:
// - The persisted source stays the existing HEYS profile path:
//   heys_profile.fingerboardProfile. In production this path is already scoped
//   by HEYS storage/sync, so this module must not invent LS scans or side keys.
// - Global profile fields (birthDate/age/weight/baseWeight) override old
//   Fingers-local fallbacks when present.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__profileStoreRegistered) return;
  Fingers.__profileStoreRegistered = true;

  const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'];
  const READINESS = ['max', 'moderate', 'recovery', 'rest'];
  const SKIN_STATUS = ['ok', 'normal', 'dry', 'tender', 'sore', 'split', 'flapper'];

  function _readGlobalProfile() {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsGet === 'function') return u.lsGet('heys_profile', {}) || {};
    } catch (_) { /* noop */ }
    return {};
  }

  function _writeGlobalProfile(next) {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsSet === 'function') {
        u.lsSet('heys_profile', next || {});
        return true;
      }
    } catch (_) { /* noop */ }
    return false;
  }

  function _ageFromGlobalProfile(p) {
    const bd = p && p.birthDate;
    if (bd) {
      const birth = new Date(bd);
      if (!isNaN(birth.getTime())) {
        const t = new Date();
        let a = t.getFullYear() - birth.getFullYear();
        const m = t.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < birth.getDate())) a--;
        return a > 0 && a < 120 ? a : null;
      }
    }
    const ageRaw = p && Number(p.age);
    return Number.isFinite(ageRaw) && ageRaw > 0 ? ageRaw : null;
  }

  function normalizeLevel(level) {
    return LEVELS.indexOf(level) >= 0 ? level : null;
  }

  function normalizeReadiness(value) {
    return READINESS.indexOf(value) >= 0 ? value : null;
  }

  function normalizeSkinStatus(value) {
    return SKIN_STATUS.indexOf(value) >= 0 ? value : null;
  }

  function _normalizePrerequisites(value) {
    if (!Array.isArray(value)) return [];
    const out = [];
    const seen = Object.create(null);
    for (const item of value) {
      const id = String(item || '').trim();
      if (!id || seen[id]) continue;
      seen[id] = true;
      out.push(id);
    }
    return out;
  }

  function getProfile() {
    const globalProfile = _readGlobalProfile();
    const fp = Object.assign({}, globalProfile.fingerboardProfile || {});

    const globalAge = _ageFromGlobalProfile(globalProfile);
    if (globalAge != null) fp.age = globalAge;

    const w = Number(globalProfile.weight);
    const bw = Number(globalProfile.baseWeight);
    if (Number.isFinite(w) && w > 0) fp.bodyWeightKg = w;
    else if (Number.isFinite(bw) && bw > 0) fp.bodyWeightKg = bw;

    fp.level = normalizeLevel(fp.level);
    fp.readinessOverride = normalizeReadiness(fp.readinessOverride);
    fp.skinStatus = normalizeSkinStatus(fp.skinStatus);
    fp.completedPrerequisites = _normalizePrerequisites(fp.completedPrerequisites);
    return fp;
  }

  function saveProfilePatch(patch) {
    if (!patch || typeof patch !== 'object') return false;
    const globalProfile = _readGlobalProfile();
    const nextFp = Object.assign({}, globalProfile.fingerboardProfile || {}, patch);

    if ('level' in patch) nextFp.level = normalizeLevel(patch.level);
    if ('readinessOverride' in patch) nextFp.readinessOverride = normalizeReadiness(patch.readinessOverride);
    if ('skinStatus' in patch) nextFp.skinStatus = normalizeSkinStatus(patch.skinStatus);
    if ('completedPrerequisites' in patch) {
      nextFp.completedPrerequisites = _normalizePrerequisites(patch.completedPrerequisites);
    }

    return _writeGlobalProfile(Object.assign({}, globalProfile, { fingerboardProfile: nextFp }));
  }

  Fingers.getProfile = getProfile;
  Fingers.saveProfilePatch = saveProfilePatch;
  Fingers.profileStore = {
    get: getProfile,
    savePatch: saveProfilePatch,
    normalizeLevel: normalizeLevel,
    normalizeReadiness: normalizeReadiness,
    normalizeSkinStatus: normalizeSkinStatus,
    LEVELS: LEVELS.slice()
  };
})(typeof window !== 'undefined' ? window : globalThis);
