// heys_fingers_programs_catalog_v1.js — Каталог 7 пресетных программ (Phase 1).
// Wave 2-A: статичные конфиги + хелпер buildLogFromProgram() для конструктора.
// 2026-05-31 redesign: уникальные методически-корректные наборы хватов по первоисточникам
// (Beastmaker 1000, Hörst Max Hangs, López MaxHangs MAW, Hörst 7:3 Repeaters,
// Nelson No-Hangs, Nelson Density Hangs, López MED). См. /tmp/fingers-catalog-redesign.md — Facts Table.
// nelson_no_hangs — единственная истинно noEquipment программа, используется
// рекомендателем как fallback для (а) пользователей без доски, (б) <14 лет.
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
      intensity: 'moderate',
      name: 'Beastmaker 1000 — Beginner Loop',
      description: 'Базовая программа от Beastmaker для V1–V4 или возврата после паузы. Три упражнения на разных хватах: 4-палец открытый на ребре 20 мм, 3-палец открытый на кармане, 4-палец на покатости. Каждое — 7 секунд виса / 3 секунды отдыха × 6 повторов (это один подход), 3 подхода с паузой 3 минуты. Без добавочного веса. Лучше всего как стартовая база силы пальцев.',
      level: 'beginner',
      durationMin: 30,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'sloper', edgeSizeMm: 35, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['beastmaker_1000', 'horst_753'],
      advisoryBadge: null,
      noEquipment: false,
      equipmentReq: 'fingerboard', // нужен sloper 35мм + pocket 20мм + edge 20мм
      minAge: 14
    },
    {
      id: 'horst_max_hangs',
      intensity: 'max',
      name: 'Eric Hörst — Max Hangs 10s × 5',
      description: 'Максимальная сила пальцев: 10 секунд виса с добавочным весом, который удержишь не больше 13 секунд (запас 3 секунды до отказа). Отдых 3 минуты, 5 подходов на каждый хват. Программа из 4 хватов: полузамок, открытый 4-палец, передние 3 пальца, зажим. Edge 20 мм для широких хватов, 25 мм для зажима. Не для новичков — нужна база минимум 1 год регулярных тренировок.',
      level: 'intermediate',
      durationMin: 50,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 15,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 12,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 20, addedWeightKg: 10,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 4, restBetweenSetsSec: 180 },
        { gripId: 'pinch', edgeSizeMm: 25, addedWeightKg: 8,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 4, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['horst_podcast10', 'physivantage_collagen'],
      advisoryBadge: 'Не для новичков — нужна база ≥1 года лазания',
      noEquipment: false,
      minAge: 18
    },
    {
      id: 'lopez_mr',
      intensity: 'max',
      name: 'Eva López — MaxHangs MAW (Maximum Added Weight)',
      description: 'Силовой протокол с добавочным весом по методике Эвы Лопес (исследование 2014, статья 2019). 10 секунд виса с весом, который удержал бы не больше 13 секунд — оставляешь 3 секунды запаса до отказа (margin RM-3). Отдых 4 минуты между подходами, 5 подходов на каждый хват. Программа из 3 хватов: полузамок, открытый 4-палец, передние 3 пальца. Edge 18 мм. Только для V5+ с минимум 2 годами опыта.',
      level: 'advanced',
      durationMin: 55,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 18, addedWeightKg: 20,
          hangSec: 10, restSec: 240, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 240 },
        { gripId: 'openhand4', edgeSizeMm: 18, addedWeightKg: 18,
          hangSec: 10, restSec: 240, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 240 },
        { gripId: 'front3', edgeSizeMm: 18, addedWeightKg: 15,
          hangSec: 10, restSec: 240, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 240 }
      ],
      sourceIds: ['lopez2019'],
      advisoryBadge: 'Только V5+ с минимум 2 годами опыта',
      noEquipment: false,
      minAge: 18
    },
    {
      id: 'repeaters_7_3',
      intensity: 'moderate',
      name: 'Repeaters 7:3 классические',
      description: 'Силовая выносливость: 7 секунд виса / 3 секунды отдыха × 6 повторов = один подход. Отдых 3 минуты между подходами, 3 подхода на каждый хват. Программа из 4 хватов: открытый 4-палец, полузамок, передние 3 пальца, покатость. Edge 20 мм для пальцевых хватов, 35 мм для покатости. Без добавочного веса — это база, не максимум. Главный конструктор «выкатывающейся» силы пальцев для длинных трасс.',
      level: 'intermediate',
      durationMin: 40,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'sloper', edgeSizeMm: 35, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['horst_753', 'beastmaker_1000'],
      advisoryBadge: null,
      noEquipment: false,
      equipmentReq: 'fingerboard', // 4 хвата включая sloper — нужен полный board
      minAge: 16
    },
    {
      id: 'nelson_no_hangs',
      intensity: 'recovery',
      name: 'Tyler Nelson — No-Hangs (без доски)',
      description: 'Изометрическая нагрузка пальцев без виса и без доски — по методике Тайлера Нельсона. Берёшься за прочный край на уровне бедра (дверной косяк, край стола, нижняя полка) и тянешь вверх 7 секунд с усилием 30-50% от максимума. Отдых 30 секунд, 6 повторов в подходе, 3 подхода на каждый хват. Программа из 3 хватов: открытый 4-палец, полузамок, передние 3 пальца. Подходит когда нет доски, для дней с низкой готовностью, для восстановления после травмы и для подростков 12-14 лет, которым ещё нельзя на доску.',
      level: 'beginner',
      durationMin: 20,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 7, restSec: 30, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 120 },
        { gripId: 'halfcrimp', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 7, restSec: 30, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 120 },
        { gripId: 'front3', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 7, restSec: 30, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 120 }
      ],
      sourceIds: ['nelson_camp4'],
      advisoryBadge: null,
      noEquipment: true,
      minAge: 12
    },
    {
      id: 'horst_towel_pulls',
      intensity: 'moderate',
      name: 'Eric Hörst — Towel Isometric Pulls',
      description: 'Изометрические тяги через полотенце — рабочий способ нагрузить пальцы в поездке или дома без доски. Перебрасываешь плотное полотенце через закрытую дверь сверху (зажимаешь полотенце дверью) или через прочную перекладину/штангу. Берёшь оба конца на уровне груди, тянешь вниз-к-себе 6 секунд с усилием ~70-80% от максимума. Отдых 90 секунд, 5 подходов на каждом из 3 хватов. Нагрузка регулируется углом и силой тяги — учишься чувствовать «70%» без приборов. Хват меняешь захватом полотенца разной толщины (свёрнутое плотно = тонкий edge, разложенное = широкий). Подходит когда нет доски, в командировке, на даче.',
      level: 'beginner',
      durationMin: 25,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 6, restSec: 90, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 6, restSec: 90, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 },
        { gripId: 'front3', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 6, restSec: 90, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 }
      ],
      sourceIds: ['horst_753', 'horst_podcast10'],
      advisoryBadge: null,
      noEquipment: true,
      minAge: 14
    },
    {
      id: 'pinch_books',
      intensity: 'moderate',
      name: 'Pinch on Books — щипок без снаряда',
      description: 'Щипковый зажим стопки книг разной толщины — единственный способ прокачать pinch grip без специального снаряда. Берёшь толстую книгу в твёрдой обложке (или связанную доску), зажимаешь между большим пальцем и четырьмя пальцами на боковых гранях, поднимаешь на уровень пояса и держишь 10 секунд. Делаешь 5 подходов на каждой из 3 толщин: тонкая (~20-25 мм — словарь карманного формата), средняя (~35-40 мм — стандартный роман), толстая (~50+ мм — энциклопедия или 2-3 связанных книги). Между подходами отдых 2 минуты. Прогрессия — увеличивай вес книги или сужай толщину при той же длительности. Pinch — слабое звено у большинства лазунов; этот хват редко нагружается на обычной доске.',
      level: 'beginner',
      durationMin: 25,
      exercises: [
        { gripId: 'pinch', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 10, restSec: 120, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 },
        { gripId: 'pinch', edgeSizeMm: 35, addedWeightKg: 0,
          hangSec: 10, restSec: 120, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 },
        { gripId: 'pinch', edgeSizeMm: 50, addedWeightKg: 0,
          hangSec: 10, restSec: 120, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 }
      ],
      sourceIds: ['horst_753'],
      advisoryBadge: null,
      noEquipment: true,
      minAge: 14
    },
    {
      id: 'antagonist_bands',
      intensity: 'recovery',
      name: 'Schöffl — Antagonist Band Extensions',
      description: 'Профилактика травм по Schöffl: разгибатели пальцев почти не работают при лазании, что создаёт мышечный дисбаланс и предрасполагает к тендинопатиям и pulley-травмам. Надеваешь резинку (обычная канцелярская или специальная для пальцев) на все пять пальцев у основания ногтей и медленно раскрываешь кисть до полного разгибания, удерживаешь 1 секунду, медленно возвращаешь. 20 повторений × 3 подхода на каждую руку, отдых между подходами 60 секунд. Делай 2-3 раза в неделю как recovery-блок или после тренировки на пальцы. Через 3-4 недели бери резинку плотнее. Особенно важно для тех кто уже ловил «щёлкнувший» палец — снижает риск рецидива A2/A4.',
      level: 'beginner',
      durationMin: 10,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 1, restSec: 1, repsPerSet: 20, setsCount: 3, restBetweenSetsSec: 60 }
      ],
      sourceIds: ['schoffl2021'],
      advisoryBadge: null,
      noEquipment: true,
      minAge: 12
    },
    {
      id: 'nelson_density_hangs',
      intensity: 'recovery',
      name: 'Tyler Nelson — Density Hangs (низкая нагрузка на доске)',
      description: 'Объёмный протокол на доске: длинные висы под нагрузкой ~55-75% от максимума. 25 секунд виса / 12 секунд отдыха (2:1) × 2 повтора = один подход, 5 подходов на хват, отдых между подходами 3 минуты. Без добавочного веса — но висы длинные, общий объём нагрузки большой. Программа из 3 хватов: открытый 4-палец, полузамок, передние 3 пальца. Edge 25 мм. Хороша как объёмная база перед переходом на Max Hangs и как «лёгкий» день между максимальными тренировками.',
      level: 'beginner',
      durationMin: 35,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 25, restSec: 12, repsPerSet: 2, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'halfcrimp', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 25, restSec: 12, repsPerSet: 2, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 25, restSec: 12, repsPerSet: 2, setsCount: 5, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['nelson_camp4'],
      advisoryBadge: null,
      noEquipment: false,
      minAge: 14
    },
    {
      id: 'min_edge_progression',
      intensity: 'max',
      name: 'Eva López — Min Edge Depth (MED)',
      description: 'Максимальная сила без добавочного веса по методике Эвы Лопес. 10 секунд виса на минимальном ребре, на котором удержался бы не больше 13 секунд (margin 3 секунды). Отдых 3 минуты, 5 подходов на хват. Программа из 3 хватов: открытый 4-палец на 12 мм, полузамок на 10 мм, передние 3 пальца на 12 мм. Если запас > 5 секунд — уменьши ребро на 1-2 мм; если близко к отказу — увеличь. Безопаснее MaxHangs MAW по сухожилиям, но не для новичков — нужен V7+.',
      level: 'advanced',
      durationMin: 45,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 12, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'halfcrimp', edgeSizeMm: 10, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 12, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['lopez2019'],
      advisoryBadge: 'Только V7+',
      noEquipment: false,
      minAge: 18
    },
    // ─── Hang Block specific protocols ──────────────────────────────────────
    // equipmentReq: 'block' → ProgramsTab показывает только когда у юзера
    // выбран Hang Block (xclimb Terminator / Tension Block / Lattice Block).
    // Block-протоколы — это max-hangs/lifts с привязанным грузом снизу через
    // карабин (или эксцентрический подъём гантели/гири).
    {
      id: 'block_hangs_horst',
      intensity: 'max',
      name: 'Block Max Hangs 10s × 5',
      description: 'Hörst Max Hangs адаптация под hang block. 10 секунд виса на 20 мм edge с грузом подвешенным снизу через карабин (или подъёмом гири/гантели с пола). Запас 3 секунды до отказа — если держишь 13 с, вес правильный. Отдых 3 минуты, 5 подходов на каждый из 3 хватов: полузамок, открытый 4-палец, передние 3 пальца. Edge 20 мм. Нужна база ≥1 год лазания.',
      level: 'intermediate',
      durationMin: 35,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 15,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 12,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'front3', edgeSizeMm: 20, addedWeightKg: 10,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 4, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['horst_podcast10', 'physivantage_collagen'],
      advisoryBadge: 'Нужна база ≥1 года лазания',
      noEquipment: false,
      equipmentReq: 'block',
      minAge: 18
    },
    {
      id: 'block_lifts_5x5',
      intensity: 'max',
      name: 'Block Lifts 5×5',
      description: 'Block Lifts — концентрический подъём груза с пола, держа hang block на 20 мм edge. 5 повторений по 5 секунд удержания в верхней точке (концентрика + изометрика). Отдых 3 минуты, 5 подходов на 2 хвата: полузамок и открытый 4-палец. Безопаснее обычных max-hangs по сухожилиям (нет рывковой нагрузки в начале виса), отлично подходит для возврата после паузы или травмы.',
      level: 'intermediate',
      durationMin: 40,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 20,
          hangSec: 5, restSec: 10, repsPerSet: 5, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 18,
          hangSec: 5, restSec: 10, repsPerSet: 5, setsCount: 5, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['lattice_critical_force', 'lopez2019'],
      advisoryBadge: null,
      noEquipment: false,
      equipmentReq: 'block',
      minAge: 16
    },
    {
      id: 'block_min_edge',
      intensity: 'max',
      name: 'Block Min Edge — без веса',
      description: 'Минимальная грань без добавочного веса на hang block. Заменяет MED Эвы Лопес когда нет fingerboard\'а. 10 секунд виса на самой тонкой грани блока, на которой держишь 13 секунд (margin 3с). Отдых 3 минуты, 5 подходов на хват. Программа из 2 хватов: открытый 4-палец и полузамок. Подходит для V5+, безопаснее по сухожилиям чем block lifts с большим весом.',
      level: 'advanced',
      durationMin: 35,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 15, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 },
        { gripId: 'halfcrimp', edgeSizeMm: 10, addedWeightKg: 0,
          hangSec: 10, restSec: 180, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['lopez2019', 'lattice_critical_force'],
      advisoryBadge: 'V5+',
      noEquipment: false,
      equipmentReq: 'block',
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

  // Convenient intensity lookup — used by ageGate.filterPrograms,
  // calendar._classifyProgramId, readiness hard overrides.
  function getIntensity(programId) {
    const p = PROGRAMS_BY_ID[programId];
    return (p && p.intensity) || 'moderate';
  }

  /**
   * Фильтр программ по доступному оборудованию (multi-select).
   * @param {Array} programs — список (обычно после ageGate.filterPrograms)
   * @param {object} eq — equipmentTypes: ['full','block','door','none'][]
   *                      Legacy form (noEquipment/blockMode/edgeLimit) ещё
   *                      поддерживается через автоматическую конверсию.
   * @returns {Array}
   *
   * Программа включается если её equipmentReq совместим хотя бы с одним из
   * активных типов:
   *   'full'  → equipmentReq ∈ ['fingerboard', undefined]
   *   'block' → equipmentReq ∈ ['block', undefined]
   *   'door'  → equipmentReq === undefined, И min edge ≥ 25мм
   *   'none'  → noEquipment === true
   */
  function _legacyToTypes(opts) {
    if (Array.isArray(opts.equipmentTypes) && opts.equipmentTypes.length > 0) {
      return opts.equipmentTypes;
    }
    if (opts.noEquipment) return ['none'];
    if (opts.blockMode) return ['block'];
    if (opts.edgeLimit === 25) return ['door'];
    return ['full'];
  }

  function _programMatchesType(p, type) {
    if (type === 'none') return p.noEquipment === true;
    // noEquipment программы — отдельная категория, не подмножество door/block/full.
    // Показывать их только когда у юзера активен таб 'none'.
    if (p.noEquipment) return false;
    if (type === 'block') {
      return p.equipmentReq === 'block' || !p.equipmentReq;
    }
    if (type === 'door') {
      if (p.equipmentReq === 'block' || p.equipmentReq === 'fingerboard') return false;
      const minEdge = Array.isArray(p.exercises)
        ? p.exercises.reduce(function (m, ex) {
            const v = Number(ex.edgeSizeMm) || Infinity;
            return Math.min(m, v);
          }, Infinity)
        : Infinity;
      return minEdge >= 25;
    }
    if (type === 'full') {
      // Полный fingerboard: всё кроме block-only
      return p.equipmentReq !== 'block';
    }
    return false;
  }

  function filterProgramsByEquipment(programs, eq) {
    if (!Array.isArray(programs)) return [];
    const types = _legacyToTypes(eq || {});
    return programs.filter(function (p) {
      if (!p) return false;
      // Программа подходит если совместима хотя бы с одним активным типом.
      for (let i = 0; i < types.length; i++) {
        if (_programMatchesType(p, types[i])) return true;
      }
      return false;
    });
  }

  // === Экспорт ===
  Fingers.PROGRAMS = PROGRAMS;
  Fingers.PROGRAMS_BY_ID = PROGRAMS_BY_ID;
  Fingers.getProgramById = getProgramById;
  Fingers.getProgramIntensity = getIntensity;
  Fingers.buildLogFromProgram = buildLogFromProgram;
  Fingers.filterProgramsByEquipment = filterProgramsByEquipment;
})(typeof window !== 'undefined' ? window : globalThis);
