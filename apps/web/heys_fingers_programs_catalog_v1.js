// heys_fingers_programs_catalog_v1.js — Каталог 6 пресетных программ (Phase 1).
// Wave 2-A: статичные конфиги + хелпер buildLogFromProgram() для конструктора.
//
// Public API:
//   HEYS.Fingers.PROGRAMS                          — массив программ
//   HEYS.Fingers.getProgramById(id)                — lookup
//   HEYS.Fingers.buildLogFromProgram(id, board)    — расширяет в exercises для конструктора
//
// Формат программы:
//   { id, name, description, level, durationMin, exercises: [{...}],
//     sourceIds: [], advisoryBadge: null|string, noEquipment: false, minAge: 16 }
//
// exercises[i]:
//   { gripId, edgeSizeMm, addedWeightKg, hangSec, restSec,
//     repsPerSet, setsCount, restBetweenSetsSec }
//
// Phase 2 добавит ещё 4 программы — функция _PHASE_KEY используется loader chain'ом
// для постепенного раскрытия (sequence #4 в bundle loader).

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.__programsCatalogRegistered) return; // idempotent
  Fingers.__programsCatalogRegistered = true;

  /** @type {Array} */
  const PROGRAMS = [
    {
      id: 'beastmaker_1000_beginner',
      name: 'Beastmaker 1000 — Beginner Loop',
      description: 'Стартовая программа: repeaters 7/3 × 6 на разных хватах. Подходит для V1-V4 и для возврата после паузы.',
      level: 'beginner',
      durationMin: 25,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 150 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 150 }
      ],
      sourceIds: ['beastmaker_1000', 'horst_753'],
      advisoryBadge: null,
      noEquipment: false,
      minAge: 14
    },
    {
      id: 'horst_max_hangs',
      name: 'Eric Hörst — Max Hangs 10s × 5',
      description: 'Максимальная сила: 10 секунд виса с добавочным весом до failure ~12 сек, отдых 3 минуты, 4-5 подходов на хват.',
      level: 'intermediate',
      durationMin: 40,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 15,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 12,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 4, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['horst_podcast10'],
      advisoryBadge: 'Не для новичков — нужна база ≥1 года лазания',
      noEquipment: false,
      minAge: 18
    },
    {
      id: 'lopez_mr',
      name: 'Eva López — Maximum Recruitment (MR)',
      description: '5-12 секунд виса с весом, отдых 3-5 минут, 4-6 подходов. Margin не более 3 секунд от failure.',
      level: 'advanced',
      durationMin: 45,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 15, addedWeightKg: 20,
          hangSec: 8, restSec: 240, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 240 },
        { gripId: 'openhand4', edgeSizeMm: 15, addedWeightKg: 18,
          hangSec: 8, restSec: 240, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 240 }
      ],
      sourceIds: ['lopez2019'],
      advisoryBadge: 'Только V5+ с минимум 2 годами опыта',
      noEquipment: false,
      minAge: 18
    },
    {
      id: 'repeaters_7_3',
      name: 'Repeaters 7:3 классические',
      description: '7 секунд виса / 3 секунды отдыха × 6 = один подход. Отдых 3 минуты, всего 6 подходов. Лучший конструктор силовой выносливости.',
      level: 'intermediate',
      durationMin: 35,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['horst_753'],
      advisoryBadge: null,
      noEquipment: false,
      minAge: 16
    },
    {
      id: 'nelson_no_hangs',
      name: 'Tyler Nelson — No-Hangs',
      description: 'Без оборудования: изометрия пальцев сидя с грузом 30-50% RPE. 30 секунд × 3-5 повторов, отдых 1-2 минуты. Безопасно для дней с низкой готовностью.',
      level: 'beginner',
      durationMin: 20,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 30, restSec: 90, repsPerSet: 4, setsCount: 1, restBetweenSetsSec: 0 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 30, restSec: 90, repsPerSet: 4, setsCount: 1, restBetweenSetsSec: 0 }
      ],
      sourceIds: ['nelson_camp4'],
      advisoryBadge: null,
      noEquipment: true,
      minAge: 12
    },
    {
      id: 'min_edge_progression',
      name: 'Min Edge Progression (López MED)',
      description: 'Без веса: 10 секунд × 4-6 подходов. Edge уменьшается на 1-2 мм если margin > 3 сек от failure. Безопаснее MR по сухожилиям.',
      level: 'advanced',
      durationMin: 40,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 12, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 14, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['lopez2019'],
      advisoryBadge: 'Только V7+',
      noEquipment: false,
      minAge: 18
    }
  ];

  const PROGRAMS_BY_ID = Object.create(null);
  PROGRAMS.forEach(function (p) { PROGRAMS_BY_ID[p.id] = p; });

  function getProgramById(id) {
    return PROGRAMS_BY_ID[id] || null;
  }

  /**
   * Расширяет program в плоский log упражнений с подстановкой edge под user.board.
   * Если у пользователя есть конкретная board — пытается найти ближайший edge по размеру.
   * @param {string} programId
   * @param {object} userBoard — { id, edges: [...] } или null
   * @returns {Array|null}
   */
  function buildLogFromProgram(programId, userBoard) {
    const program = getProgramById(programId);
    if (!program) {
      console.warn('[Fingers.buildLogFromProgram] unknown programId:', programId);
      return null;
    }
    return program.exercises.map(function (ex) {
      const out = {
        gripId: ex.gripId,
        edgeSizeMm: ex.edgeSizeMm,
        addedWeightKg: ex.addedWeightKg || 0,
        hangSec: ex.hangSec,
        restSec: ex.restSec,
        repsPerSet: ex.repsPerSet || 1,
        setsCount: ex.setsCount || 1,
        restBetweenSetsSec: ex.restBetweenSetsSec || 0
      };
      // Если board задана — ищем edge с минимальной разницей в мм среди compatible.
      if (userBoard && Array.isArray(userBoard.edges)) {
        const compat = userBoard.edges.filter(function (e) {
          return Array.isArray(e.gripCompat) && e.gripCompat.indexOf(ex.gripId) >= 0;
        });
        if (compat.length) {
          let best = compat[0];
          let bestDiff = Math.abs(best.sizeMm - ex.edgeSizeMm);
          for (let i = 1; i < compat.length; i++) {
            const d = Math.abs(compat[i].sizeMm - ex.edgeSizeMm);
            if (d < bestDiff) { best = compat[i]; bestDiff = d; }
          }
          out.edgeId = best.id;
          out.edgeSizeMm = best.sizeMm;
        }
      }
      return out;
    });
  }

  // === Экспорт ===
  Fingers.PROGRAMS = PROGRAMS;
  Fingers.PROGRAMS_BY_ID = PROGRAMS_BY_ID;
  Fingers.getProgramById = getProgramById;
  Fingers.buildLogFromProgram = buildLogFromProgram;
})(typeof window !== 'undefined' ? window : globalThis);
