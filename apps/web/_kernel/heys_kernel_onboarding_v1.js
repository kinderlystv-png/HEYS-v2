// heys_kernel_onboarding_v1.js — ОБЩЕЕ ЯДРО: profile/onboarding primitives.
//
// Ядро не знает доменные поля. Домен передаёт schema: number/enum/list/boolean/
// passthrough. Это убирает копии "почистить enum/list/age" без переноса UI.

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const TK = HEYS.TrainingKernel = HEYS.TrainingKernel || {};
  if (TK.onboarding && TK.onboarding.__registered) return;

  function uniqueKnown(values, allowed) {
    const input = Array.isArray(values) ? values : [];
    const allow = Array.isArray(allowed) ? allowed : [];
    const out = [];
    input.forEach(function (value) {
      if (allow.indexOf(value) < 0 || out.indexOf(value) >= 0) return;
      out.push(value);
    });
    return out;
  }

  function enumValue(value, allowed, fallback) {
    const allow = Array.isArray(allowed) ? allowed : [];
    return allow.indexOf(value) >= 0 ? value : fallback;
  }

  function numberValue(value, opts) {
    const o = opts || {};
    const n = Number(value);
    if (!isFinite(n)) return Object.prototype.hasOwnProperty.call(o, 'fallback') ? o.fallback : null;
    let out = n;
    if (typeof o.min === 'number') out = Math.max(o.min, out);
    if (typeof o.max === 'number') out = Math.min(o.max, out);
    return o.integer === true ? Math.round(out) : out;
  }

  function booleanValue(value, fallback) {
    if (value === true || value === false) return value;
    return !!fallback;
  }

  function ageFromBirthDate(birthDate, opts) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const now = opts && opts.now ? new Date(opts.now) : new Date();
    if (isNaN(now.getTime())) return null;
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age > 0 && age < 120 ? age : null;
  }

  function normalizeProfile(input, schema) {
    const src = input || {};
    const spec = schema && schema.fields ? schema.fields : {};
    const out = {};
    Object.keys(spec).forEach(function (key) {
      const field = spec[key] || {};
      const fallback = Object.prototype.hasOwnProperty.call(field, 'default') ? field.default : null;
      const value = src[key];
      if (field.type === 'number') {
        out[key] = numberValue(value, {
          fallback: fallback,
          min: field.min,
          max: field.max,
          integer: field.integer
        });
      } else if (field.type === 'enum') {
        out[key] = enumValue(value, field.allowed, fallback);
      } else if (field.type === 'list') {
        out[key] = uniqueKnown(value, field.allowed);
      } else if (field.type === 'boolean') {
        out[key] = booleanValue(value, fallback);
      } else if (field.type === 'passthrough') {
        out[key] = value == null ? fallback : value;
      }
    });
    return out;
  }

  TK.onboarding = {
    __registered: true,
    uniqueKnown: uniqueKnown,
    enumValue: enumValue,
    numberValue: numberValue,
    booleanValue: booleanValue,
    ageFromBirthDate: ageFromBirthDate,
    normalizeProfile: normalizeProfile
  };
})(typeof window !== 'undefined' ? window : globalThis);
