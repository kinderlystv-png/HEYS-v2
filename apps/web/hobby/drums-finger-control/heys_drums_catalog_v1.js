// heys_drums_catalog_v1.js — catalog and shared constants for drum pad finger control.
;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const DFC = (Hobby._drumsInternal = Hobby._drumsInternal || {});

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const MODULE_ID = 'drums_finger_control';
  const ACTIVE_SESSION_KEY = 'heys_drums_finger_active_session';
  const DAY_SCOPED_RE = /^heys_([0-9a-f-]{36})_dayv2_(\d{4}-\d{2}-\d{2})$/i;
  const DAY_BASE_RE = /^heys_dayv2_(\d{4}-\d{2}-\d{2})$/;
  const ROOT_ID = 'drums-finger-trainer-root';
  const COUNT_IN_SEC = 4;
  const TAP_TEST_SECONDS = 20;
  const SAFETY_REST_DAYS = 2;
  const METRONOME_LOOKAHEAD_MS = 25;
  const METRONOME_SCHEDULE_AHEAD_SEC = 0.12;
  const SUBDIVISIONS = {
    quarters: { notesPerBeat: 1, label: 'четверти' },
    eighths: { notesPerBeat: 2, label: 'восьмые' },
    sixteenths: { notesPerBeat: 4, label: '16-е' },
    triplets: { notesPerBeat: 3, label: 'триоли' },
  };

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const BLOCKS = [
    {
      id: 'free_stroke',
      label: 'Free Stroke',
      goal: 'Свободный rebound и ровный открытый звук.',
      minutes: 3,
      bpm: 70,
      pattern: 'восьмые',
      subdivision: 'eighths',
      cues: ['кисть мягкая', 'палка сама возвращается', 'не сжимай хват'],
    },
    {
      id: 'finger_rebound',
      label: 'Finger Rebound',
      goal: 'Пальцы ловят и направляют отскок.',
      minutes: 5,
      bpm: 70,
      pattern: 'одной рукой, затем RLRL',
      subdivision: 'eighths',
      cues: ['маленькая амплитуда', 'тихое предплечье', 'мягкий fulcrum'],
    },
    {
      id: 'singles',
      label: 'Singles RLRL',
      goal: 'Ровные одиночки без ускорения и зажима.',
      minutes: 5,
      bpm: 90,
      pattern: 'RLRL',
      subdivision: 'sixteenths',
      ramp: { everyBars: 8, stepBpm: 2, maxBpm: 180 },
      metric: 'cleanBpmSingles16',
      cues: ['одинаковый звук', 'плечи не поднимаются', 'BPM растёт только чисто'],
    },
    {
      id: 'doubles',
      label: 'Doubles RRLL',
      goal: 'Второй удар такой же осознанный, как первый.',
      minutes: 5,
      bpm: 80,
      pattern: 'RRLL',
      subdivision: 'sixteenths',
      ramp: { everyBars: 8, stepBpm: 2, maxBpm: 160 },
      metric: 'cleanBpmDoubles16',
      cues: ['второй удар слышен', 'не дави палку в пад', 'руки звучат одинаково'],
    },
    {
      id: 'moeller_fingers',
      label: 'Moeller + Fingers',
      goal: 'Акцент импульсом, мелкие ноты пальцами.',
      minutes: 5,
      bpm: 75,
      pattern: 'акцент каждая 4-я',
      subdivision: 'sixteenths',
      accentEvery: 4,
      cues: ['акцент без силы', 'три тихих ноты после', 'волна, не удар предплечьем'],
    },
    {
      id: 'burst_8_8',
      label: 'Burst 8 / 8',
      goal: 'Короткая скорость без потери контроля.',
      minutes: 8,
      bpm: 110,
      pattern: '8 быстро / 8 медленно',
      subdivision: 'sixteenths',
      burst: { fastNotes: 8, slowNotes: 8, fastMultiplier: 2 },
      ramp: { everyBars: 4, stepBpm: 4, maxBpm: 190 },
      cues: ['быстро, но чисто', 'медленные 8 — полный сброс', 'не гони максимум'],
    },
    {
      id: 'buzz_roll',
      label: 'Buzz Roll',
      goal: 'Чувство контакта и расслабленный rebound.',
      minutes: 5,
      bpm: 60,
      pattern: 'легкий buzz',
      subdivision: 'quarters',
      cues: ['минимальное давление', 'ровная текстура', 'мягкая кисть'],
    },
    {
      id: 'improv_pad',
      label: 'Pad Flow',
      goal: 'Перенос техники в музыкальное движение.',
      minutes: 5,
      bpm: 80,
      pattern: 'singles, doubles, accents, rests',
      subdivision: 'eighths',
      cues: ['оставляй паузы', 'играй только расслабленно', 'звук важнее плотности'],
    },
  ];

  const SESSIONS = [
    {
      id: 'balanced_25',
      label: 'Balanced 25',
      shortLabel: 'Баланс',
      icon: '🥁',
      minutes: 25,
      intent: 'универсальный рост техники',
      blocks: [
        ['free_stroke', 3],
        ['finger_rebound', 5],
        ['singles', 5],
        ['doubles', 5],
        ['moeller_fingers', 5],
        ['buzz_roll', 2],
      ],
    },
    {
      id: 'speed_breakthrough_30',
      label: 'Speed 30',
      shortLabel: 'Скорость',
      icon: '⚡',
      minutes: 30,
      intent: 'короткие bursts без зажима',
      weeklyLimit: 2,
      blocks: [
        ['free_stroke', 3],
        ['finger_rebound', 4],
        ['singles', 8],
        ['doubles', 5],
        ['burst_8_8', 8],
        ['buzz_roll', 2],
      ],
    },
    {
      id: 'low_tension_rebuild_23',
      label: 'Low Tension 23',
      shortLabel: 'Мягко',
      icon: '🫳',
      minutes: 23,
      intent: 'пересобрать rebound, если забиваются предплечья',
      blocks: [
        ['free_stroke', 3],
        ['finger_rebound', 5],
        ['buzz_roll', 5],
        ['doubles', 5],
        ['improv_pad', 5],
      ],
    },
    {
      id: 'micro_15',
      label: 'Micro 15',
      shortLabel: '15 мин',
      icon: '⏱',
      minutes: 15,
      intent: 'минимальная ежедневная доза',
      blocks: [
        ['finger_rebound', 3],
        ['singles', 4],
        ['doubles', 4],
        ['burst_8_8', 4],
      ],
    },
  ];

  const BLOCK_BY_ID = Object.fromEntries(BLOCKS.map((block) => [block.id, block]));
  const SESSION_BY_ID = Object.fromEntries(SESSIONS.map((session) => [session.id, session]));

  function localDateKey(date) {
    const d = date && typeof date.getFullYear === 'function' ? date : new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function safeDateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return localDateKey();
  }

  function isDrumsTraining(training) {
    if (!training || typeof training !== 'object') return false;
    if (training.hobbySubtype === MODULE_ID) return true;
    return training.hobbyLog && training.hobbyLog.moduleId === MODULE_ID;
  }

  function getSession(sessionId) {
    return SESSION_BY_ID[sessionId] || SESSION_BY_ID.balanced_25;
  }

  function expandSession(sessionId) {
    const session = getSession(sessionId);
    return {
      ...session,
      blockItems: session.blocks.map(([blockId, minutes]) => ({
        ...BLOCK_BY_ID[blockId],
        minutes,
        targetSec: Math.max(15, minutes * 60),
      })),
    };
  }

  function getSessionFromTraining(training) {
    const log = training && training.hobbyLog;
    return getSession(log?.sessionId || 'balanced_25');
  }

  function formatMinutes(minutes) {
    const n = clampNumber(minutes, 0, 999, 0);
    return n + ' мин';
  }

  function getSubdivisionConfig(block) {
    return SUBDIVISIONS[block?.subdivision] || SUBDIVISIONS.quarters;
  }

  Object.assign(DFC, {
    MODULE_ID,
    ACTIVE_SESSION_KEY,
    DAY_SCOPED_RE,
    DAY_BASE_RE,
    ROOT_ID,
    COUNT_IN_SEC,
    TAP_TEST_SECONDS,
    SAFETY_REST_DAYS,
    METRONOME_LOOKAHEAD_MS,
    METRONOME_SCHEDULE_AHEAD_SEC,
    SUBDIVISIONS,
    BLOCKS,
    SESSIONS,
    BLOCK_BY_ID,
    SESSION_BY_ID,
    localDateKey,
    clampNumber,
    safeDateKey,
    isDrumsTraining,
    getSession,
    expandSession,
    getSessionFromTraining,
    formatMinutes,
    getSubdivisionConfig,
  });
})(typeof window !== 'undefined' ? window : globalThis);
