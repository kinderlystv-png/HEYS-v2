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
      description: 'Силовой протокол с добавочным весом по методике Эвы Лопес (исследования 2012 и 2016). 10 секунд виса с весом, который удержал бы не больше 13 секунд — оставляешь 3 секунды запаса до отказа (margin RM-3). Отдых 4 минуты между подходами, 5 подходов на каждый хват. Программа из 3 хватов: полузамок, открытый 4-палец, передние 3 пальца. Edge 18 мм. Только для V5+ с минимум 2 годами опыта.',
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
      sourceIds: ['lopez2012'],
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
      sourceIds: ['horst_753', 'beastmaker_1000', 'lopez2019'],
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
      sourceIds: ['lopez2012'],
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
      sourceIds: ['lattice_critical_force', 'lopez2012'],
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
      sourceIds: ['lopez2012', 'lattice_critical_force'],
      advisoryBadge: 'V5+',
      noEquipment: false,
      equipmentReq: 'block',
      minAge: 18
    },
    // ─── Hybrid mixed-equipment program (демонстрирует multi-tier модель) ───
    {
      id: 'horst_mixed_day',
      intensity: 'moderate',
      name: 'Eric Hörst — Mixed Day',
      description: 'Сбалансированная сессия из трёх блоков на разном оборудовании. 1) Max Hangs 7s на блоке (полузамок, добавочный вес ~50% от твоего max) — 4 подхода по 1 повтору, отдых 3 минуты. 2) Towel pulls на дверном косяке (открытый 4-палец, изометрия 6 секунд × 5) — нагрузка пальцев без виса, восстанавливает связки между max-подходами. 3) Антагонист-резинка на разгибатели (20 повторений × 3) — закрывает сессию профилактикой травм. По методу Hörst-style mixed training: сочетание силового стимула + recovery в одной сессии повышает adaptation efficiency.',
      level: 'intermediate',
      durationMin: 45,
      // Каждое упражнение явно помечено своим tier — это делает программу
      // мульти-tier (block + door + none), показывается в любом сочетании этих табов.
      exercises: [
        { equipmentTier: 'block', gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 180, repsPerSet: 1, setsCount: 4, restBetweenSetsSec: 180 },
        { equipmentTier: 'door',  gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 6, restSec: 90, repsPerSet: 1, setsCount: 5, restBetweenSetsSec: 120 },
        { equipmentTier: 'none',  gripId: 'openhand4', edgeSizeMm: 25, addedWeightKg: 0,
          hangSec: 1, restSec: 1, repsPerSet: 20, setsCount: 3, restBetweenSetsSec: 60 }
      ],
      sourceIds: ['horst_753', 'horst_podcast10', 'schoffl2021'],
      advisoryBadge: null,
      // Explicit equipmentTypes — overrides exercise-derived, для canonical UI ordering.
      equipmentTypes: ['block', 'door', 'none'],
      minAge: 16
    },
    // ─── Critical Force / capacity / connective-tissue protocols ────────────
    // Засеяны для mixEngine: заполняют роли test / capacity / connective,
    // которых не было в исходных 14 протоколах. Поле role — слот-мэппинг для
    // движка (старые протоколы движок мэппит по intensity).
    {
      id: 'cf_test',
      intensity: 'max',
      role: 'test',
      excludeFromMix: true, // диагностика, не тренировочный блок для микса
      name: 'Critical Force — тест 4 мин (диагностика)',
      description: 'Диагностический тест аэробно-анаэробной границы пальцев (Critical Force). На полузамке 20 мм без добавочного веса: цикл 7 секунд максимальной тяги / 3 секунды отдыха, без пауз, 24 повтора подряд = ровно 4 минуты. Нужен силовой датчик (Tindeq Progressor / Lattice) — CF считается как средняя сила последних повторов, по ней потом прописывается нагрузка на выносливость. Это не тренировка, а замер: делай на свежих пальцах, повторяй раз в 4-6 недель и смотри ТРЕНД, а не разовое абсолютное число.',
      level: 'intermediate',
      durationMin: 12,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 24, setsCount: 1, restBetweenSetsSec: 0 }
      ],
      sourceIds: ['giles2019', 'balas2024_cf', 'kellawan2014', 'lattice_critical_force'],
      advisoryBadge: 'Нужен силовой датчик (Tindeq/Lattice) · 18+',
      noEquipment: false,
      equipmentReq: 'fingerboard',
      // 18+: all-out тест = max-интенсивность, а ageGate (16-17 = no-max) всё
      // равно скрыл бы его при minAge 16 — ставим явный честный порог.
      minAge: 18
    },
    {
      id: 'sub_cf_capacity',
      intensity: 'moderate',
      role: 'capacity',
      name: 'Sub-CF Capacity — аэробная ёмкость (ниже Critical Force)',
      description: 'Объёмная выносливость в устойчивой зоне ниже Critical Force — поднимает «потолок» долгой работы пальцев на длинных трассах. Длинные repeaters 7 секунд виса / 3 секунды отдыха × 10 повторов = подход ~2 минуты, 4 подхода на хват, отдых 3 минуты. Без добавочного веса, нагрузка лёгкая-умеренная (если тяжело — ассистируй ногами): цель — закончить все подходы без отказа, а не дойти до предела. Программа из 2 хватов: открытый 4-палец и полузамок, edge 20 мм. Прогрессия: добавляй повторы, потом сокращай отдых — НЕ добавляй вес. 2 раза в неделю.',
      level: 'intermediate',
      durationMin: 40,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 10, setsCount: 4, restBetweenSetsSec: 180 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 7, restSec: 3, repsPerSet: 10, setsCount: 4, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['giles2019', 'balas2024_cf', 'devise2022', 'lattice_critical_force'],
      advisoryBadge: null,
      noEquipment: false,
      equipmentReq: 'fingerboard',
      minAge: 16
    },
    {
      id: 'abrahangs_daily',
      intensity: 'recovery',
      role: 'connective',
      name: 'Abrahangs — ежедневные низконагрузочные висы',
      description: 'Низкоинтенсивная высокочастотная нагрузка для соединительной ткани и силы пальцев по методу Эмиля Абрахамссона. Длинные холды на edge 18-22 мм с усилием всего ~40% от максимума (ноги на полу, разгружаешь вис до лёгкого) — 10 секунд виса / 20 секунд отдыха × 6 повторов на хват, всего ~10 минут. Программа из 2 хватов: открытый 4-палец и полузамок. Главное — частота: 3-7 раз в неделю, можно ежедневно (нагрузка щадит сухожилия). Прирост силы хвата сопоставим с Max Hangs, а в комбинации с ними — аддитивный. Прогрессируй временем холда, не весом.',
      level: 'beginner',
      durationMin: 10,
      exercises: [
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 10, restSec: 20, repsPerSet: 6, setsCount: 1, restBetweenSetsSec: 0 },
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 10, restSec: 20, repsPerSet: 6, setsCount: 1, restBetweenSetsSec: 0 }
      ],
      sourceIds: ['abrahangs2024', 'physivantage_collagen', 'magnusson2010'],
      advisoryBadge: null,
      noEquipment: false,
      equipmentTypes: ['full', 'door'],
      minAge: 14
    },
    {
      id: 'recruitment_pulls',
      intensity: 'max',
      role: 'power', // взрывное намерение — слот power перед max-силой
      name: 'Recruitment Pulls — взрывные изометрические тяги (RFD)',
      description: 'Развитие скорости усилия (RFD) и нейро-рекрутмента через ВЗРЫВНОЕ намерение. На блоке/датчике тянешь с пола максимально резко — разгон к пику как можно быстрее, ~90%+ усилия, короткий импульс 4 секунды × 5 повторов в подходе, отдых между повторами короткий (как восстановление нерва), 3 подхода на хват: полузамок и открытый 4-палец, edge 20 мм. Отдых между подходами 3 минуты. Только на свежих пальцах (высокая готовность) и в начале сессии. Дополняет, а не заменяет медленные max-hangs: даёт более крутой RFD-стимул и жёсткость сухожилий. Для V5+ с базой ≥2 лет.',
      level: 'advanced',
      durationMin: 30,
      exercises: [
        { gripId: 'halfcrimp', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 4, restSec: 60, repsPerSet: 5, setsCount: 3, restBetweenSetsSec: 180 },
        { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
          hangSec: 4, restSec: 60, repsPerSet: 5, setsCount: 3, restBetweenSetsSec: 180 }
      ],
      sourceIds: ['stien2021', 'oranchuk2019', 'nelson_camp4', 'lattice_critical_force'],
      advisoryBadge: 'Взрывное намерение · V5+ / 18+ · только на свежих пальцах',
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
   * Возвращает массив equipment tier'ов которые программа использует во всех
   * своих упражнениях. Источники tier'а в порядке приоритета:
   *   1. exercise.equipmentTier (явное per-exercise указание, для hybrid протоколов)
   *   2. program.equipmentTypes (явное per-program указание)
   *   3. derive из program.noEquipment / equipmentReq / edge size
   *
   * Возможные tier'ы: 'full' (полный fingerboard), 'block' (hang block),
   * 'door' (door frame, edge ≥ 25мм), 'none' (без снаряжения).
   */
  function getProgramEquipmentTypes(p) {
    if (!p) return [];
    // 1. Если у программы явно указан equipmentTypes — используем его (даже если
    //    у exercises есть свои tier'ы — program-level это canonical set).
    if (Array.isArray(p.equipmentTypes) && p.equipmentTypes.length > 0) {
      return p.equipmentTypes.slice();
    }
    // 2. Собираем уникальные tier'ы из exercises (если у каждого есть свой).
    if (Array.isArray(p.exercises) && p.exercises.length > 0) {
      const exerciseTiers = new Set();
      let anyExplicit = false;
      p.exercises.forEach(function (ex) {
        if (ex && typeof ex.equipmentTier === 'string') {
          exerciseTiers.add(ex.equipmentTier);
          anyExplicit = true;
        }
      });
      if (anyExplicit) return Array.from(exerciseTiers);
    }
    // 3. Backwards-compat: derive из legacy полей.
    if (p.noEquipment) return ['none'];
    if (p.equipmentReq === 'block') return ['block'];
    if (p.equipmentReq === 'fingerboard') return ['full'];
    // Без equipmentReq → программа generic (вписывается в full + block).
    // Если min edge ≥ 25мм — door тоже подходит.
    const minEdge = Array.isArray(p.exercises)
      ? p.exercises.reduce(function (m, ex) {
          const v = Number(ex.edgeSizeMm) || Infinity;
          return Math.min(m, v);
        }, Infinity)
      : Infinity;
    return minEdge >= 25 ? ['full', 'block', 'door'] : ['full', 'block'];
  }

  /**
   * Фильтр программ по выбранному оборудованию (intersection model).
   * @param {Array} programs — список (обычно после ageGate.filterPrograms)
   * @param {object} eq — equipmentTypes: ['full','block','door','none'][]
   *                      Legacy form (noEquipment/blockMode/edgeLimit) ещё
   *                      поддерживается через автоматическую конверсию.
   * @returns {Array}
   *
   * Программа показывается если её equipmentTypes пересекается хотя бы одним
   * элементом с user-выбранными tier'ами (intersection ≥ 1).
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

  function filterProgramsByEquipment(programs, eq) {
    if (!Array.isArray(programs)) return [];
    const types = _legacyToTypes(eq || {});
    const typeSet = Object.create(null);
    types.forEach(function (t) { typeSet[t] = true; });
    return programs.filter(function (p) {
      if (!p) return false;
      const progTypes = getProgramEquipmentTypes(p);
      // Intersection ≥ 1 → программа подходит.
      for (let i = 0; i < progTypes.length; i++) {
        if (typeSet[progTypes[i]]) return true;
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
  Fingers.getProgramEquipmentTypes = getProgramEquipmentTypes;

  /**
   * Умный генератор «случайной» тренировки — берёт по одному упражнению
   * из программ под каждый выбранный пользователем equipment tier, миксует
   * в одну сессию. Не «чисто random»: respect intensity filter, age gate,
   * baseline correctness (никаких mono/fullcrimp <18, никаких добавочных
   * весов на recovery).
   *
   * @param {object} opts
   *   - equipmentTypes: string[] — какие tier'ы включать ('full'|'block'|'door'|'none')
   *   - intensity: 'all'|'recovery'|'moderate'|'max' — желаемая интенсивность
   *   - age: number — возраст (для age-gate exercises)
   *   - readiness: string — 'rest'|'recovery'|'moderate'|'max' (опционально, ceiling)
   * @returns {object|null} ad-hoc program object или null если генерация невозможна
   */
  function generateMixedWorkout(opts) {
    const o = opts || {};
    const types = Array.isArray(o.equipmentTypes) && o.equipmentTypes.length
      ? o.equipmentTypes : ['full'];
    const desiredIntensity = o.intensity || 'all';
    const ageNum = Number(o.age);
    const READINESS_CEILING = { rest: 'recovery', recovery: 'recovery', moderate: 'moderate', max: 'max' };
    const INTENSITY_RANK = { recovery: 0, moderate: 1, max: 2 };
    const ceiling = (o.readiness && READINESS_CEILING[o.readiness]) || 'max';

    // Готовим pool кандидатов — все программы из каталога, фильтр по
    // age + intensity-ceiling.
    let candidates = PROGRAMS.slice();
    if (Number.isFinite(ageNum) && Fingers.ageGate && Fingers.ageGate.filterPrograms) {
      candidates = Fingers.ageGate.filterPrograms(candidates, ageNum);
    }
    candidates = candidates.filter(function (p) {
      if (p.excludeFromMix) return false; // диагностика (cf_test) — не в микс
      const intensity = p.intensity || 'moderate';
      if (INTENSITY_RANK[intensity] > INTENSITY_RANK[ceiling]) return false;
      if (desiredIntensity !== 'all' && intensity !== desiredIntensity) return false;
      return true;
    });

    if (!candidates.length) return null;

    // Для каждого выбранного tier'а ищем exercise. Source приоритет:
    //   1. Hybrid программа с exercise.equipmentTier === tier
    //   2. Программа у которой program-tiers включает tier — берём первое exercise
    // Сколько упражнений берём с каждого tier'а — зависит от mix intensity:
    //   recovery: 1 (минимально, бережно)
    //   moderate: 1 (стандарт)
    //   max:      2 если есть из чего выбрать (больше объёма)
    const perTier = desiredIntensity === 'max' ? 2 : 1;
    const pickedExercises = [];
    const includedTiers = [];
    for (let i = 0; i < types.length; i++) {
      const tier = types[i];
      const tierCands = candidates.filter(function (p) {
        const progTiers = getProgramEquipmentTypes(p);
        return progTiers.indexOf(tier) >= 0;
      });
      if (!tierCands.length) continue;

      // Собираем pool всех exercises, подходящих под tier, по всем кандидатам.
      const pool = [];
      tierCands.forEach(function (pickProg) {
        if (!Array.isArray(pickProg.exercises)) return;
        const tierExercises = pickProg.exercises.filter(function (ex) {
          return ex && ex.equipmentTier === tier;
        });
        const list = tierExercises.length ? tierExercises : pickProg.exercises;
        list.forEach(function (ex) { pool.push(ex); });
      });
      if (!pool.length) continue;

      // Берём перемешанные top-N уникальных exercises (по gripId+edge).
      const shuffled = pool.slice();
      for (let j = shuffled.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        const t = shuffled[j]; shuffled[j] = shuffled[k]; shuffled[k] = t;
      }
      const seen = Object.create(null);
      let taken = 0;
      for (let j = 0; j < shuffled.length && taken < perTier; j++) {
        const ex = shuffled[j];
        const key = ex.gripId + '_' + ex.edgeSizeMm;
        if (seen[key]) continue;
        seen[key] = true;
        pickedExercises.push(Object.assign({}, ex, { equipmentTier: tier }));
        taken++;
      }
      if (taken > 0) includedTiers.push(tier);
    }

    if (!pickedExercises.length) return null;

    // Сортируем: max → moderate → recovery. Внутри tier'а — без перестановок.
    // (intensity берётся из исходной программы; используем грубую эвристику
    // по addedWeightKg — > 0 = max, иначе moderate; recovery — если nature
    // явно low (hangSec <= 7 без веса).)
    pickedExercises.sort(function (a, b) {
      const aIntensity = a.addedWeightKg > 0 ? 'max'
        : (a.repsPerSet >= 6 ? 'moderate' : 'recovery');
      const bIntensity = b.addedWeightKg > 0 ? 'max'
        : (b.repsPerSet >= 6 ? 'moderate' : 'recovery');
      return INTENSITY_RANK[bIntensity] - INTENSITY_RANK[aIntensity];
    });

    // Считаем общую длительность.
    const totalSec = pickedExercises.reduce(function (s, ex) {
      const setSec = (Number(ex.hangSec) + Number(ex.restSec)) * Number(ex.repsPerSet)
        + Number(ex.restBetweenSetsSec);
      return s + setSec * Number(ex.setsCount);
    }, 0);
    const totalMin = Math.max(10, Math.round(totalSec / 60));

    // Tier-friendly название.
    const TIER_LABEL = { full: 'доска', block: 'блок', door: 'дверь', none: 'No-Hangs' };
    const tierNames = includedTiers.map(function (t) { return TIER_LABEL[t] || t; }).join(' + ');

    return {
      id: 'generated_mix_' + Date.now(),
      __generated: true,
      name: 'Микс-тренировка',
      description: 'Случайный микс упражнений на ' + tierNames
        + '. По одному упражнению на каждый выбранный снаряд, в порядке убывания интенсивности. '
        + 'Сгенерировано автоматически — обнови ниже чтобы получить другой набор.',
      level: 'mixed',
      durationMin: totalMin,
      intensity: desiredIntensity === 'all' ? 'moderate' : desiredIntensity,
      exercises: pickedExercises,
      equipmentTypes: includedTiers,
      sourceIds: [],
      advisoryBadge: null,
      noEquipment: false,
      minAge: 14
    };
  }

  Fingers.generateMixedWorkout = generateMixedWorkout;
})(typeof window !== 'undefined' ? window : globalThis);
