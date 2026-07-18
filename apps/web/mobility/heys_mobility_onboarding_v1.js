// heys_mobility_onboarding_v1.js — профиль входа режима мобильности.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Mobility = HEYS.Mobility = HEYS.Mobility || {};

  if (Mobility.__onboardingRegistered) return;
  Mobility.__onboardingRegistered = true;

  const LEVELS = ['beginner', 'intermediate', 'advanced'];
  const POPULATIONS = ['hypermobile', 'pregnancy', 'adolescent', 'older', 'desk'];
  const EQUIPMENT = ['foam_roll', 'band', 'strap', 'ball', 'percussion', 'bolster'];
  const GOALS = ['morning', 'pre_workout', 'recover', 'develop', 'posture', 'relax', 'rehab', 'desk'];
  const GOAL_TO_MODE = {
    morning: 'morning_tonify',
    pre_workout: 'pre_workout_ramp',
    recover: 'post_workout',
    develop: 'develop_mobility',
    relax: 'evening_relax',
    rehab: 'rehab',
    desk: 'anti_sedentary',
    posture: 'posture'
  };

  function onboardingKernel() {
    return HEYS.TrainingKernel && HEYS.TrainingKernel.onboarding;
  }

  function pickKnown(arr, allowed) {
    const ko = onboardingKernel();
    if (ko && ko.uniqueKnown) return ko.uniqueKnown(arr, allowed);
    const input = Array.isArray(arr) ? arr : [];
    return input.filter(function (x, idx) { return allowed.indexOf(x) >= 0 && input.indexOf(x) === idx; });
  }
  function normalizeProfile(input) {
    const src = input || {};
    const ko = onboardingKernel();
    if (ko && ko.normalizeProfile) {
      const normalized = ko.normalizeProfile(src, {
        fields: {
          age: { type: 'number', default: null },
          level: { type: 'enum', allowed: LEVELS, default: 'beginner' },
          populations: { type: 'list', allowed: POPULATIONS },
          equipment: { type: 'list', allowed: EQUIPMENT },
          goal: { type: 'enum', allowed: GOALS, default: 'morning' },
          loadLevel: { type: 'number', default: 3, min: 1, max: 5, integer: true },
          acceptedDisclaimer: { type: 'boolean', default: false }
        }
      });
      // Number(null) === 0, поэтому сохраняем отсутствие возраста явно.
      if (src.age === null || src.age === undefined || src.age === '') normalized.age = null;
      return normalized;
    }
    const age = src.age === null || src.age === undefined || src.age === '' ? null : Number(src.age);
    const level = LEVELS.indexOf(src.level) >= 0 ? src.level : 'beginner';
    return {
      age: age !== null && Number.isFinite(age) ? age : null,
      level: level,
      populations: pickKnown(src.populations, POPULATIONS),
      equipment: pickKnown(src.equipment, EQUIPMENT),
      goal: GOALS.indexOf(src.goal) >= 0 ? src.goal : 'morning',
      loadLevel: Mobility.loadScale ? Mobility.loadScale.normalize(src.loadLevel) : Math.min(5, Math.max(1, Math.round(Number(src.loadLevel) || 3))),
      acceptedDisclaimer: src.acceptedDisclaimer === true
    };
  }
  function validateProfile(profile) {
    const p = normalizeProfile(profile);
    const issues = [];
    if (p.age === null) issues.push({ level: 'error', code: 'onboarding.age_missing', msg: 'возраст нужен для fail-closed safety' });
    if (p.acceptedDisclaimer !== true) issues.push({ level: 'error', code: 'onboarding.disclaimer', msg: 'подтвердите, что режим не заменяет медицинскую рекомендацию' });
    if (p.populations.indexOf('pregnancy') >= 0) issues.push({ level: 'warn', code: 'onboarding.pregnancy_medical', msg: 'беременность: медицинский контекст вне алгоритма' });
    if (p.populations.indexOf('hypermobile') >= 0) issues.push({ level: 'warn', code: 'onboarding.hypermobile_stability', msg: 'гипермобильность: приоритет укреплению и стабильности' });
    return { profile: p, issues: issues, ok: !issues.some(function (i) { return i.level === 'error'; }) };
  }
  function recommendMode(profile, opts) {
    const src = profile || {};
    const p = normalizeProfile(profile);
    const timeOfDay = opts && opts.timeOfDay;
    if (src.goal && GOAL_TO_MODE[p.goal]) return GOAL_TO_MODE[p.goal];
    if (p.populations.indexOf('desk') >= 0) return 'anti_sedentary';
    if (p.populations.indexOf('older') >= 0 && timeOfDay === 'evening') return 'evening_relax';
    if (timeOfDay === 'evening') return 'evening_relax';
    if (timeOfDay === 'morning') return 'morning_tonify';
    return 'anti_sedentary';
  }

  Mobility.onboarding = {
    __registered: true,
    LEVELS: LEVELS,
    POPULATIONS: POPULATIONS,
    EQUIPMENT: EQUIPMENT,
    GOALS: GOALS,
    GOAL_TO_MODE: GOAL_TO_MODE,
    normalizeProfile: normalizeProfile,
    validateProfile: validateProfile,
    recommendMode: recommendMode
  };
})(typeof window !== 'undefined' ? window : globalThis);
