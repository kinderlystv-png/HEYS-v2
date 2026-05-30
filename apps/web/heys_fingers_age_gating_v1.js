// heys_fingers_age_gating_v1.js — Возрастные ограничения (UIAA 2018 / BMC 2019).
// Wave 2-A: фильтры программ/хватов + warn level + RU объяснение.
//
// Public API:
//   HEYS.Fingers.ageGate.filterPrograms(programs, age)
//   HEYS.Fingers.ageGate.filterGrips(grips, age)
//   HEYS.Fingers.ageGate.warnLevel(age) → 'block-all'|'no-max-hangs'|'no-full-crimp'|'no-max'|'ok'
//   HEYS.Fingers.ageGate.getRestrictionMessage(age) → RU строка с UIAA/BMC цитатой
//
// Логика по возрасту:
//   < 8       → block-all (UIAA — fingerboard вообще запрещён)
//   8 - 13    → no-max-hangs (только Nelson + repeaters без веса)
//   14 - 15   → no-full-crimp (open/half без веса, нет full crimp/campus)
//   16 - 17   → no-max (любые хваты, но без max-protocols)
//   18+       → ok (полный доступ)

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__ageGateRegistered) return; // idempotent
  Fingers.__ageGateRegistered = true;

  const SOURCE_IDS = ['uiaa_medcom', 'bmc_u18'];

  /**
   * @param {number} age
   * @returns {'block-all'|'no-max-hangs'|'no-full-crimp'|'no-max'|'ok'}
   */
  function warnLevel(age) {
    const a = Number(age);
    if (!Number.isFinite(a) || a < 8) return 'block-all';
    if (a < 14) return 'no-max-hangs';
    if (a < 16) return 'no-full-crimp';
    if (a < 18) return 'no-max';
    return 'ok';
  }

  /**
   * Фильтрует программы по minAge. Также убирает max-протоколы для подростков 16-17.
   * @param {Array} programs
   * @param {number} age
   * @returns {Array}
   */
  function filterPrograms(programs, age) {
    if (!Array.isArray(programs)) return [];
    const a = Number(age);
    const level = warnLevel(a);
    if (level === 'block-all') return [];
    return programs.filter(function (p) {
      if (!p) return false;
      if (Number.isFinite(p.minAge) && a < p.minAge) return false;
      // Подросткам 16-17 — без max-протоколов (id содержит max или level === 'advanced' MR/MED).
      if (level === 'no-max') {
        if (/max|mr|med/i.test(p.id || '')) return false;
        if (p.level === 'advanced') return false;
      }
      // 14-15 — только beginner/repeaters BW без веса.
      if (level === 'no-full-crimp') {
        if (p.level !== 'beginner') return false;
        // Дополнительно: программы с addedWeightKg > 0 — убрать.
        const hasWeight = Array.isArray(p.exercises) && p.exercises.some(function (e) {
          return (e.addedWeightKg || 0) > 0;
        });
        if (hasWeight) return false;
      }
      // 8-13 — только noEquipment или repeaters без веса.
      if (level === 'no-max-hangs') {
        if (!p.noEquipment) return false;
      }
      return true;
    });
  }

  /**
   * Фильтрует хваты по minAge.
   * @param {Array} grips
   * @param {number} age
   * @returns {Array}
   */
  function filterGrips(grips, age) {
    if (!Array.isArray(grips)) return [];
    const a = Number(age);
    if (warnLevel(a) === 'block-all') return [];
    return grips.filter(function (g) {
      if (!g) return false;
      if (Number.isFinite(g.minAge) && a < g.minAge) return false;
      return true;
    });
  }

  /**
   * RU объяснение почему есть restriction + цитата UIAA/BMC.
   * @param {number} age
   * @returns {{title:string,message:string,sourceIds:string[]}|null}
   */
  function getRestrictionMessage(age) {
    const level = warnLevel(age);
    switch (level) {
      case 'block-all':
        return {
          title: 'До 8 лет fingerboard не рекомендуется',
          message: 'Пальцевые блоки и зоны роста ещё формируются. UIAA Medical Commission и BMC рекомендуют только лазание по большим зацепкам без целевых висов.',
          sourceIds: SOURCE_IDS
        };
      case 'no-max-hangs':
        return {
          title: '8-13 лет: только без веса и без виса',
          message: 'Доступны только программы без оборудования (No-Hangs) или repeaters BW на больших краях. Никаких max-hangs, дополнительного веса и краев < 20 мм. UIAA 2018: эпифизарные зоны открыты — риск стресс-переломов.',
          sourceIds: SOURCE_IDS
        };
      case 'no-full-crimp':
        return {
          title: '14-15 лет: открытый/полузамок без веса',
          message: 'Полный замок (full crimp), mono и campus board запрещены. Допускается open hand и half crimp на краях ≥ 15 мм без дополнительного веса. BMC: эпифизарные пластины ещё хрупкие.',
          sourceIds: SOURCE_IDS
        };
      case 'no-max':
        return {
          title: '16-17 лет: без максимальных протоколов',
          message: 'Все хваты доступны, но Max Hangs и MR/MED закрыты до 18 лет. Тренируйся repeaters и Base Fitness — это даст лучший long-term прогресс с минимальным риском.',
          sourceIds: SOURCE_IDS
        };
      default:
        return null;
    }
  }

  Fingers.ageGate = {
    warnLevel: warnLevel,
    filterPrograms: filterPrograms,
    filterGrips: filterGrips,
    getRestrictionMessage: getRestrictionMessage,
    sourceIds: SOURCE_IDS
  };
})(typeof window !== 'undefined' ? window : globalThis);
