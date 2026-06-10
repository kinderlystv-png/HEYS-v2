// heys_drums_finger_trainer_v1.js — lightweight hobby trainer for drum pad finger control.
// Public API:
//   HEYS.Hobby.DrumsFingerControl.openFullscreen({ dateKey, trainingIndex, mode })
//   HEYS.Hobby.DrumsFingerControl.close()
//   HEYS.Hobby.DrumsFingerControl.renderPreviewPill({ training, dateKey, trainingIndex })

;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const React = global.React;
  const ReactDOM = global.ReactDOM;

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

  function lsGet(key, fallback) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') return HEYS.utils.lsGet(key, fallback);
      const raw = global.localStorage && global.localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function lsSet(key, value) {
    try {
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(key, value);
        return;
      }
      global.localStorage && global.localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* noop */
    }
  }

  function lsRemove(key) {
    try {
      global.localStorage && global.localStorage.removeItem(key);
    } catch (_) {
      /* noop */
    }
  }

  function getCurrentClientId() {
    try {
      return HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
    } catch (_) {
      return '';
    }
  }

  function getDayKeys(dateKey) {
    const cid = getCurrentClientId();
    return {
      scoped: cid ? 'heys_' + cid + '_dayv2_' + dateKey : '',
      base: 'heys_dayv2_' + dateKey,
    };
  }

  function getActiveSessionKeys() {
    const cid = getCurrentClientId();
    return {
      scoped: cid ? 'heys_' + cid + '_drums_finger_active_session' : '',
      base: ACTIVE_SESSION_KEY,
    };
  }

  function getReadableDayInfo(key) {
    const currentClientId = getCurrentClientId();
    const scopedMatch = String(key || '').match(DAY_SCOPED_RE);
    if (scopedMatch) {
      if (!currentClientId || scopedMatch[1].toLowerCase() !== String(currentClientId).toLowerCase()) return null;
      return { dateKey: scopedMatch[2], scoped: true };
    }
    const baseMatch = String(key || '').match(DAY_BASE_RE);
    if (baseMatch) {
      if (currentClientId) return null;
      return { dateKey: baseMatch[1], scoped: false };
    }
    return null;
  }

  function readDay(dateKey) {
    const keys = getDayKeys(dateKey);
    if (keys.scoped) {
      const scoped = lsGet(keys.scoped, null);
      if (scoped && scoped.date === dateKey) return { day: scoped, key: keys.scoped };
      return { day: { date: dateKey, meals: [], trainings: [] }, key: keys.scoped };
    }
    const base = lsGet(keys.base, null);
    if (base && base.date === dateKey) return { day: base, key: keys.base };
    return { day: { date: dateKey, meals: [], trainings: [] }, key: keys.scoped || keys.base };
  }

  function writeDay(dateKey, day) {
    const keys = getDayKeys(dateKey);
    const targetKey = keys.scoped || keys.base;
    lsSet(targetKey, day);
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

  function normalizeSessionMetrics(metrics) {
    const src = metrics || {};
    return {
      cleanBpmSingles16: clampNumber(src.cleanBpmSingles16, 0, 320, 0),
      cleanBpmDoubles16: clampNumber(src.cleanBpmDoubles16, 0, 320, 0),
      oneHandFingerTapBpmRight: clampNumber(src.oneHandFingerTapBpmRight, 0, 320, 0),
      oneHandFingerTapBpmLeft: clampNumber(src.oneHandFingerTapBpmLeft, 0, 320, 0),
      tensionScore: clampNumber(src.tensionScore, 1, 10, 3),
      forearmPumpScore: clampNumber(src.forearmPumpScore, 1, 10, 3),
      soundEvenness: clampNumber(src.soundEvenness, 1, 5, 4),
    };
  }

  function getBlockAttemptFromLog(row, blockId) {
    const blocks = Array.isArray(row?.log?.blockResults) ? row.log.blockResults : [];
    const result = blocks.find((item) => item && item.blockId === blockId && item.done);
    if (!result) return null;
    return {
      clean: !!result.clean,
      bpm: clampNumber(result.bpm, 0, 320, 0),
      completedAt: Number(row?.log?.completedAt) || 0,
    };
  }

  function getProgressionBpm(block, logs) {
    const baseBpm = clampNumber(block?.bpm, 30, 260, 80);
    const rows = Array.isArray(logs) ? logs : [];
    const attempts = rows
      .map((row) => getBlockAttemptFromLog(row, block?.id))
      .filter((attempt) => attempt && attempt.bpm > 0)
      .sort((a, b) => b.completedAt - a.completedAt);
    const lastClean = attempts.find((attempt) => attempt.clean);
    const metricFallback =
      block?.metric && !lastClean
        ? rows.find((row) => clampNumber(row?.log?.metrics?.[block.metric], 0, 320, 0) > 0)?.log?.metrics?.[block.metric]
        : 0;
    const cleanBpm = lastClean ? lastClean.bpm : clampNumber(metricFallback, 0, 320, 0);
    if (!cleanBpm) return baseBpm;
    const hasCleanStreak = attempts.length >= 2 && attempts[0].clean && attempts[1].clean;
    const step = hasCleanStreak ? clampNumber(block?.ramp?.stepBpm, 1, 12, 2) : 0;
    const maxBpm = clampNumber(block?.ramp?.maxBpm, 30, 260, 260);
    return Math.min(maxBpm, cleanBpm + step);
  }

  function makeInitialBlockResult(block, logs) {
    const bpm = getProgressionBpm(block, logs);
    return {
      blockId: block.id,
      bpm,
      clean: false,
      done: false,
      tension: 3,
      sound: 4,
      note: '',
      rampEnabled: !!block.ramp,
      rampStartBpm: bpm,
      rampLastBpm: 0,
      rampBars: 0,
    };
  }

  function deriveMetricsFromResults(sessionId, results, metrics) {
    const next = normalizeSessionMetrics(metrics);
    const expanded = expandSession(sessionId);
    const blockById = new Map(expanded.blockItems.map((block) => [block.id, block]));
    (Array.isArray(results) ? results : []).forEach((result) => {
      const block = blockById.get(result?.blockId);
      if (!block?.metric || !result?.done || !result.clean) return;
      const bpm = clampNumber(result.bpm, 0, 320, 0);
      if (!bpm) return;
      next[block.metric] = Math.max(clampNumber(next[block.metric], 0, 320, 0), bpm);
    });
    return next;
  }

  function getTapBpm(taps, durationSec) {
    const sec = clampNumber(durationSec, 1, 120, TAP_TEST_SECONDS);
    return clampNumber(Math.round((Math.max(0, Number(taps) || 0) * 60) / sec), 0, 320, 0);
  }

  function applyTapCountToMetrics(metrics, hand, taps, durationSec) {
    const field = hand === 'left' ? 'oneHandFingerTapBpmLeft' : 'oneHandFingerTapBpmRight';
    return {
      ...normalizeSessionMetrics(metrics),
      [field]: getTapBpm(taps, durationSec),
    };
  }

  function makeInitialTapTest(tapTest) {
    return {
      hand: tapTest?.hand === 'left' ? 'left' : 'right',
      running: !!tapTest?.running,
      remainingSec: clampNumber(tapTest?.remainingSec, 0, TAP_TEST_SECONDS, TAP_TEST_SECONDS),
      tapsRight: clampNumber(tapTest?.tapsRight, 0, 999, 0),
      tapsLeft: clampNumber(tapTest?.tapsLeft, 0, 999, 0),
    };
  }

  function applyPainSafetyGate(state) {
    const metrics = normalizeSessionMetrics(state?.metrics);
    return {
      ...(state || {}),
      pain: true,
      safetyStop: true,
      safetyStopAt: Date.now(),
      running: false,
      countInSec: 0,
      metrics: {
        ...metrics,
        tensionScore: Math.max(metrics.tensionScore, 7),
        forearmPumpScore: Math.max(metrics.forearmPumpScore, 5),
      },
      tapTest: state?.tapTest ? { ...makeInitialTapTest(state.tapTest), running: false } : makeInitialTapTest(),
    };
  }

  function makeSessionStateFromLog(training, opts) {
    const log = training && training.hobbyLog;
    if (!log || !isDrumsTraining(training)) return null;
    const expanded = expandSession(log.sessionId || 'balanced_25');
    const byBlockId = new Map((Array.isArray(log.blockResults) ? log.blockResults : []).map((result) => [result.blockId, result]));
    const results = expanded.blockItems.map((block) => {
      const saved = byBlockId.get(block.id);
      return saved
        ? {
            blockId: block.id,
            bpm: clampNumber(saved.bpm, 0, 320, block.bpm || 80),
            clean: !!saved.clean,
            done: !!saved.done,
            tension: clampNumber(saved.tension, 1, 10, 3),
            sound: clampNumber(saved.sound, 1, 5, 4),
            note: saved.note || '',
            rampEnabled: saved.rampEnabled != null ? !!saved.rampEnabled : !!block.ramp,
            rampStartBpm: clampNumber(saved.rampStartBpm, 0, 320, block.bpm || 80),
            rampLastBpm: clampNumber(saved.rampLastBpm, 0, 320, 0),
            rampBars: clampNumber(saved.rampBars, 0, 999, 0),
          }
        : makeInitialBlockResult(block);
    });
    const firstOpenIndex = results.findIndex((result) => !result.done);
    const activeIndex = firstOpenIndex >= 0 ? firstOpenIndex : 0;
    const metrics = normalizeSessionMetrics(log.metrics);
    return {
      version: 1,
      moduleId: MODULE_ID,
      dateKey: safeDateKey(opts?.dateKey),
      trainingIndex: Number.isFinite(+opts?.trainingIndex) ? +opts.trainingIndex : 0,
      sessionId: expanded.id,
      startedAt: Number(log.startedAt) || Date.now(),
      activeIndex,
      remainingSec: expanded.blockItems[activeIndex]?.targetSec || 60,
      running: false,
      results,
      countInSec: 0,
      metrics,
      tapTest: makeInitialTapTest(),
      pain: !!log.pain,
      safetyStop: !!log.safetyStop,
      safetyStopAt: Number(log.safetyStopAt) || 0,
      note: log.note || '',
    };
  }

  function makeSessionState(sessionId, opts) {
    const expanded = expandSession(sessionId);
    const logs = Array.isArray(opts?.logs) ? opts.logs : scanLogs();
    return {
      version: 1,
      moduleId: MODULE_ID,
      dateKey: safeDateKey(opts?.dateKey),
      trainingIndex: Number.isFinite(+opts?.trainingIndex) ? +opts.trainingIndex : 0,
      sessionId: expanded.id,
      startedAt: Date.now(),
      activeIndex: 0,
      remainingSec: expanded.blockItems[0]?.targetSec || 60,
      running: false,
      results: expanded.blockItems.map((block) => makeInitialBlockResult(block, logs)),
      countInSec: 0,
      metrics: normalizeSessionMetrics(),
      tapTest: makeInitialTapTest(),
      pain: false,
      safetyStop: false,
      safetyStopAt: 0,
      note: '',
    };
  }

  function copySessionProgressToSession(currentState, sessionId) {
    const prev = currentState || {};
    const expanded = expandSession(sessionId);
    const prevResults = Array.isArray(prev.results) ? prev.results : [];
    return {
      ...prev,
      sessionId: expanded.id,
      activeIndex: 0,
      remainingSec: expanded.blockItems[0]?.targetSec || 60,
      running: false,
      countInSec: 0,
      results: expanded.blockItems.map((block) => {
        const current = prevResults.find((result) => result && result.blockId === block.id);
        return current ? { ...makeInitialBlockResult(block), ...current } : makeInitialBlockResult(block);
      }),
    };
  }

  function readActiveSession() {
    const keys = getActiveSessionKeys();
    const snapshot = lsGet(keys.scoped || keys.base, null);
    if (!snapshot || snapshot.moduleId !== MODULE_ID) return null;
    return snapshot;
  }

  function getSubdivisionConfig(block) {
    return SUBDIVISIONS[block?.subdivision] || SUBDIVISIONS.quarters;
  }

  function getMetronomeIntervalSec(block, bpm, noteIndex) {
    const safeBpm = clampNumber(bpm, 30, 260, block?.bpm || 80);
    const subdivision = getSubdivisionConfig(block);
    const burst = block && block.burst;
    let multiplier = 1;
    if (burst) {
      const cycle = Math.max(1, clampNumber(burst.fastNotes, 1, 64, 8) + clampNumber(burst.slowNotes, 1, 64, 8));
      const pos = noteIndex % cycle;
      if (pos < burst.fastNotes) multiplier = Math.max(1, Number(burst.fastMultiplier) || 2);
    }
    return 60 / safeBpm / Math.max(1, subdivision.notesPerBeat) / multiplier;
  }

  function getMetronomeNoteKind(block, noteIndex) {
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    if (noteIndex % notesPerBar === 0) return 'bar';
    if (block?.accentEvery && noteIndex % block.accentEvery === 0) return 'accent';
    if (noteIndex % subdivision.notesPerBeat === 0) return 'beat';
    return 'sub';
  }

  function resyncMetronomeCursor(cursor, currentTime) {
    if (!cursor || !Number.isFinite(Number(currentTime))) return cursor;
    if (Number(cursor.nextNoteTime) < Number(currentTime) - 0.2) {
      cursor.nextNoteTime = Number(currentTime) + 0.02;
    }
    return cursor;
  }

  function getRampStep(block, result, elapsedSec) {
    const ramp = block && block.ramp;
    if (!ramp || !result?.rampEnabled) return null;
    const bpm = clampNumber(result.bpm, 30, 260, block.bpm || 80);
    const subdivision = getSubdivisionConfig(block);
    const barSec = (60 / bpm) * 4;
    const completedBars = Math.floor(Math.max(0, Number(elapsedSec) || 0) / Math.max(0.1, barSec));
    const everyBars = clampNumber(ramp.everyBars, 1, 64, 8);
    if (completedBars <= 0 || completedBars % everyBars !== 0) return null;
    if (completedBars <= (Number(result.rampBars) || 0)) return null;
    const nextBpm = Math.min(clampNumber(ramp.maxBpm, 30, 260, 180), bpm + clampNumber(ramp.stepBpm, 1, 12, 2));
    if (nextBpm <= bpm) return { bars: completedBars, bpm };
    return {
      bars: completedBars,
      bpm: nextBpm,
      label: '+' + clampNumber(ramp.stepBpm, 1, 12, 2) + ' BPM / ' + everyBars + ' тактов',
      subdivision: subdivision.label,
    };
  }

  function applyRampStep(result, step) {
    if (!step) return result;
    return {
      ...result,
      rampLastBpm: clampNumber(result.bpm, 30, 260, 0),
      rampBars: step.bars,
      bpm: step.bpm,
    };
  }

  function rollbackRamp(result) {
    const last = clampNumber(result?.rampLastBpm, 0, 320, 0);
    if (!last) return result;
    return {
      ...result,
      bpm: last,
      clean: false,
      rampLastBpm: 0,
      rampEnabled: false,
    };
  }

  function writeActiveSession(state) {
    const keys = getActiveSessionKeys();
    const targetKey = keys.scoped || keys.base;
    if (!state || state.completedAt) {
      lsRemove(targetKey);
      if (keys.scoped) lsRemove(keys.base);
      return;
    }
    lsSet(targetKey, {
      ...state,
      savedAt: Date.now(),
      running: false,
      countInSec: 0,
      tapTest: state.tapTest ? { ...makeInitialTapTest(state.tapTest), running: false } : undefined,
    });
    if (keys.scoped) lsRemove(keys.base);
  }

  function clearActiveSession() {
    const keys = getActiveSessionKeys();
    lsRemove(keys.scoped || keys.base);
    if (keys.scoped) lsRemove(keys.base);
  }

  function scanLogs(limitDays) {
    const out = [];
    const max = Number.isFinite(+limitDays) ? +limitDays : 180;
    try {
      const ls = global.localStorage;
      if (!ls) return out;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        const dayInfo = getReadableDayInfo(key);
        if (!dayInfo) continue;
        const day = lsGet(key, null);
        if (!day || !Array.isArray(day.trainings)) continue;
        const dateKey = day.date || dayInfo.dateKey;
        day.trainings.forEach((training, trainingIndex) => {
          if (!isDrumsTraining(training)) return;
          const log = training.hobbyLog || {};
          if (!log.completedAt) return;
          out.push({ dateKey, trainingIndex, training, log });
        });
      }
    } catch (_) {
      return out;
    }
    out.sort((a, b) => (b.log.completedAt || 0) - (a.log.completedAt || 0));
    return out.slice(0, max);
  }

  function calculateStreak(dateSet, todayDate) {
    const dates = dateSet instanceof Set ? dateSet : new Set(dateSet || []);
    let streak = 0;
    const cur = todayDate && typeof todayDate.getFullYear === 'function' ? new Date(todayDate.getTime()) : new Date();
    for (let i = 0; i < 60; i++) {
      const key = localDateKey(cur);
      if (!dates.has(key)) {
        if (i === 0) {
          cur.setDate(cur.getDate() - 1);
          continue;
        }
        break;
      }
      streak += 1;
      cur.setDate(cur.getDate() - 1);
    }
    return streak;
  }

  function summarizeProgress(logs) {
    const rows = Array.isArray(logs) ? logs : scanLogs();
    const stats = {
      totalSessions: rows.length,
      totalMinutes: 0,
      bestSingles: 0,
      bestDoubles: 0,
      avgTension: 0,
      cleanBlocks: 0,
      totalBlocks: 0,
      streak: 0,
      lastSessionId: '',
      nextSuggestion: 'balanced_25',
      recent: rows.slice(0, 5),
    };

    const dates = new Set();
    let tensionSum = 0;
    let tensionCount = 0;
    rows.forEach((row) => {
      const log = row.log || {};
      const metrics = log.metrics || {};
      stats.totalMinutes += Number(log.totalDurationMinutes) || 0;
      stats.bestSingles = Math.max(stats.bestSingles, Number(metrics.cleanBpmSingles16) || 0);
      stats.bestDoubles = Math.max(stats.bestDoubles, Number(metrics.cleanBpmDoubles16) || 0);
      if (Number.isFinite(+metrics.tensionScore)) {
        tensionSum += +metrics.tensionScore;
        tensionCount += 1;
      }
      const blocks = Array.isArray(log.blockResults) ? log.blockResults : [];
      stats.totalBlocks += blocks.length;
      stats.cleanBlocks += blocks.filter((b) => b && b.clean).length;
      if (row.dateKey) dates.add(row.dateKey);
    });
    stats.avgTension = tensionCount ? Math.round((tensionSum / tensionCount) * 10) / 10 : 0;
    stats.cleanRate = stats.totalBlocks ? Math.round((stats.cleanBlocks / stats.totalBlocks) * 100) : 0;
    stats.lastSessionId = rows[0]?.log?.sessionId || '';
    stats.weeklySessionCounts = {};

    stats.streak = calculateStreak(dates);

    const recentTensionHigh = rows.slice(0, 2).some((row) => Number(row.log?.metrics?.tensionScore) >= 7);
    const recentPainStop = rows.slice(0, 3).some((row) => !!row.log?.pain || !!row.log?.safetyStop);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    const weekStartKey = localDateKey(weekStart);
    rows.forEach((row) => {
      const sessionId = row.log?.sessionId;
      if (!sessionId || !row.dateKey || row.dateKey < weekStartKey) return;
      stats.weeklySessionCounts[sessionId] = (stats.weeklySessionCounts[sessionId] || 0) + 1;
    });
    const recentSpeedCount = stats.weeklySessionCounts.speed_breakthrough_30 || 0;
    if (recentPainStop || recentTensionHigh) stats.nextSuggestion = 'low_tension_rebuild_23';
    else if (recentSpeedCount >= 2) stats.nextSuggestion = 'balanced_25';
    else if (stats.totalSessions >= 3 && stats.avgTension <= 5) stats.nextSuggestion = 'speed_breakthrough_30';
    else stats.nextSuggestion = 'balanced_25';
    return stats;
  }

  function buildHobbyLog(state) {
    const session = getSession(state.sessionId);
    const completedBlocks = state.results.filter((result) => result.done).length;
    const metrics = deriveMetricsFromResults(state.sessionId, state.results, state.metrics);
    return {
      version: 1,
      moduleId: MODULE_ID,
      sessionId: session.id,
      sessionLabel: session.label,
      totalDurationMinutes: session.minutes,
      completedBlocks,
      totalBlocks: state.results.length,
      completedAt: Date.now(),
      startedAt: state.startedAt,
      metrics,
      pain: !!state.pain,
      safetyStop: !!state.safetyStop || !!state.pain,
      safetyStopAt: Number(state.safetyStopAt) || 0,
      safetyRestDays: state.pain || state.safetyStop ? SAFETY_REST_DAYS : 0,
      note: state.note || '',
      blockResults: state.results.map((result) => ({
        blockId: result.blockId,
        bpm: clampNumber(result.bpm, 0, 320, 0),
        clean: !!result.clean,
        done: !!result.done,
        tension: clampNumber(result.tension, 1, 10, 3),
        sound: clampNumber(result.sound, 1, 5, 4),
        note: result.note || '',
        rampEnabled: !!result.rampEnabled,
        rampStartBpm: clampNumber(result.rampStartBpm, 0, 320, 0),
        rampLastBpm: clampNumber(result.rampLastBpm, 0, 320, 0),
        rampBars: clampNumber(result.rampBars, 0, 999, 0),
      })),
    };
  }

  function saveSessionToTraining(state) {
    const dateKey = safeDateKey(state.dateKey);
    const trainingIndex = Math.max(0, clampNumber(state.trainingIndex, 0, 20, 0));
    const log = buildHobbyLog(state);
    const read = readDay(dateKey);
    const day = { ...(read.day || { date: dateKey }) };
    const trainings = Array.isArray(day.trainings) ? day.trainings.slice() : [];
    while (trainings.length <= trainingIndex) trainings.push({ z: [0, 0, 0, 0] });
    const prev = trainings[trainingIndex] || {};
    const z = Array.isArray(prev.z) ? prev.z.slice() : [0, 0, 0, 0];
    if (!z.some((m) => Number(m) > 0)) z[0] = log.totalDurationMinutes || 1;

    const now = new Date();
    const fallbackTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    trainings[trainingIndex] = {
      ...prev,
      type: 'hobby',
      hobbySubtype: MODULE_ID,
      activityLabel: prev.activityLabel || 'Барабанный пад',
      time: prev.time || fallbackTime,
      z,
      mood: prev.mood || 8,
      wellbeing:
        prev.wellbeing ||
        clampNumber(10 - Math.max(log.metrics.tensionScore, log.metrics.forearmPumpScore) + 2, 1, 10, 7),
      stress: prev.stress || Math.max(1, log.metrics.tensionScore),
      comment: prev.comment || '',
      hobbyLog: log,
    };
    day.date = dateKey;
    day.trainings = trainings;
    day.updatedAt = Date.now();

    try {
      HEYS.Day?.setLastLoadedUpdatedAt?.(day.updatedAt);
      HEYS.Day?.setBlockCloudUpdates?.(day.updatedAt + 3000);
      HEYS.Day?.markPendingMutation?.(dateKey);
    } catch (_) {
      /* noop */
    }

    writeDay(dateKey, day);
    clearActiveSession();
    try {
      global.dispatchEvent(
        new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'trainings', source: 'drums-finger-trainer', forceReload: true },
        })
      );
      global.dispatchEvent(
        new CustomEvent('heysTrainingAdded', {
          detail: { minutes: log.totalDurationMinutes, date: dateKey, trainingIndex },
        })
      );
    } catch (_) {
      /* noop */
    }
    try {
      global.setTimeout(function () {
        HEYS.Day?.requestFlush?.({ force: true });
      }, 16);
    } catch (_) {
      /* noop */
    }
    return log;
  }

  function buildInitialAppState(props) {
    const resume = readActiveSession();
    if (resume) return { state: resume, resume };
    const dateKey = safeDateKey(props?.dateKey);
    const training = readDay(dateKey).day?.trainings?.[props?.trainingIndex] || {};
    const editState = props?.mode === 'edit' ? makeSessionStateFromLog(training, props) : null;
    return { state: editState || makeSessionState(training.hobbyLog?.sessionId || 'balanced_25', props), resume: null };
  }

  function scheduleTick(ctx, startTime, kind) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = Math.max(ctx.currentTime, Number(startTime) || ctx.currentTime);
      const strong = kind === 'bar' || kind === true;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'sub' ? 660 : strong ? 1320 : 880, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(strong ? 0.18 : kind === 'sub' ? 0.07 : 0.11, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'sub' ? 0.04 : 0.055));
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.07);
    } catch (_) {
      /* noop */
    }
  }

  function playTick(kind) {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playTick._ctx || (playTick._ctx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      scheduleTick(ctx, ctx.currentTime, kind === true ? 'bar' : kind || 'beat');
    } catch (_) {
      /* noop */
    }
  }

  function getMetronomeContext() {
    const Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = playTick._ctx || (playTick._ctx = new Ctx());
    try {
      if (ctx.state === 'suspended') ctx.resume();
    } catch (_) {
      /* noop */
    }
    return ctx;
  }

  let activeRoot = null;
  let savedScrollY = 0;

  function lockBodyScroll() {
    savedScrollY = global.scrollY || global.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = '-' + savedScrollY + 'px';
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }

  function unlockBodyScroll() {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    global.scrollTo(0, savedScrollY || 0);
  }

  function getOrCreateHost() {
    let host = document.getElementById(ROOT_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = ROOT_ID;
      document.body.appendChild(host);
    }
    return host;
  }

  function DrumsTrainerApp(props) {
    const h = React.createElement;
    const { useEffect, useMemo, useRef, useState } = React;
    const initial = useMemo(function () {
      return buildInitialAppState(props);
    }, []);

    const initialState = initial.state;
    const [screen, setScreen] = useState(initialState.startedAt && initialState.results?.some((r) => r.done) ? 'run' : 'home');
    const [sessionState, setSessionState] = useState(initialState);
    const [resumeSnapshot, setResumeSnapshot] = useState(initial.resume);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [savedLog, setSavedLog] = useState(null);
    const [progressSeed, setProgressSeed] = useState(0);
    const metronomeRef = useRef({ nextNoteTime: 0, noteIndex: 0 });

    const session = expandSession(sessionState.sessionId);
    const activeBlock = session.blockItems[sessionState.activeIndex] || session.blockItems[0];
    const activeResult = sessionState.results[sessionState.activeIndex] || makeInitialBlockResult(activeBlock);
    const completedCount = sessionState.results.filter((result) => result.done).length;
    const progress = Math.round((completedCount / Math.max(1, sessionState.results.length)) * 100);
    const historyStats = useMemo(function () {
      progressSeed;
      return summarizeProgress();
    }, [progressSeed]);

    useEffect(
      function () {
        if (screen === 'run') {
          writeActiveSession(sessionState);
          setResumeSnapshot({ ...sessionState, running: false, savedAt: Date.now() });
        }
      },
      [screen, sessionState]
    );

    useEffect(
      function () {
        if (screen !== 'run' || (!sessionState.running && !sessionState.countInSec) || !activeBlock) return undefined;
        if (!soundEnabled) return undefined;
        const ctx = getMetronomeContext();
        if (!ctx) return undefined;
        metronomeRef.current = { nextNoteTime: ctx.currentTime + 0.02, noteIndex: 0 };
        const id = global.setInterval(function () {
          const cursor = metronomeRef.current;
          resyncMetronomeCursor(cursor, ctx.currentTime);
          while (cursor.nextNoteTime < ctx.currentTime + METRONOME_SCHEDULE_AHEAD_SEC) {
            const kind = sessionState.countInSec ? 'bar' : getMetronomeNoteKind(activeBlock, cursor.noteIndex);
            scheduleTick(ctx, cursor.nextNoteTime, kind);
            cursor.nextNoteTime += sessionState.countInSec
              ? 1
              : getMetronomeIntervalSec(activeBlock, activeResult.bpm, cursor.noteIndex);
            cursor.noteIndex += 1;
          }
        }, METRONOME_LOOKAHEAD_MS);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, soundEnabled, sessionState.running, sessionState.countInSec, activeResult.bpm, activeBlock?.id]
    );

    useEffect(
      function () {
        if (screen !== 'run' || !sessionState.countInSec) return undefined;
        const id = global.setInterval(function () {
          setSessionState(function (prev) {
            const nextCount = Math.max(0, (Number(prev.countInSec) || 0) - 1);
            return { ...prev, countInSec: nextCount, running: nextCount === 0 && prev.remainingSec > 0 };
          });
        }, 1000);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, sessionState.countInSec]
    );

    useEffect(
      function () {
        if (screen !== 'run' || !sessionState.running || !activeBlock) return undefined;
        const id = global.setInterval(function () {
          setSessionState(function (prev) {
            const nextSec = Math.max(0, (Number(prev.remainingSec) || 0) - 1);
            const currentBlock = session.blockItems[prev.activeIndex] || activeBlock;
            const elapsedSec = Math.max(0, (currentBlock.targetSec || 0) - nextSec);
            const results = prev.results.slice();
            const currentResult = results[prev.activeIndex] || makeInitialBlockResult(currentBlock);
            const rampStep = getRampStep(currentBlock, currentResult, elapsedSec);
            if (rampStep) results[prev.activeIndex] = applyRampStep(currentResult, rampStep);
            if (nextSec === 0 && prev.remainingSec > 0) {
              try {
                HEYS.__playRestDoneBeep?.();
              } catch (_) {
                playTick(true);
              }
            }
            return { ...prev, results, remainingSec: nextSec, running: nextSec > 0 ? prev.running : false };
          });
        }, 1000);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, sessionState.running, sessionState.activeIndex, sessionState.sessionId, activeBlock?.id]
    );

    useEffect(
      function () {
        if (screen !== 'finish' || !sessionState.tapTest?.running) return undefined;
        const id = global.setInterval(function () {
          setSessionState(function (prev) {
            const tapTest = makeInitialTapTest(prev.tapTest);
            if (!tapTest.running) return prev;
            const remainingSec = Math.max(0, tapTest.remainingSec - 1);
            return { ...prev, tapTest: { ...tapTest, remainingSec, running: remainingSec > 0 } };
          });
        }, 1000);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, sessionState.tapTest?.running]
    );

    useEffect(
      function () {
        if (typeof navigator === 'undefined' || !navigator.wakeLock || !navigator.wakeLock.request) return undefined;
        if (screen !== 'run' || (!sessionState.running && !sessionState.countInSec)) return undefined;
        let sentinel = null;
        let cancelled = false;
        function acquire() {
          navigator.wakeLock
            .request('screen')
            .then(function (s) {
              if (cancelled) {
                try {
                  s.release();
                } catch (_) {
                  /* noop */
                }
                return;
              }
              sentinel = s;
              try {
                sentinel.addEventListener('release', function () {
                  if (!cancelled) sentinel = null;
                });
              } catch (_) {
                /* noop */
              }
            })
            .catch(function () {
              /* noop */
            });
        }
        function onVisibility() {
          if (document.visibilityState === 'visible' && !sentinel && !cancelled) acquire();
        }
        acquire();
        document.addEventListener('visibilitychange', onVisibility);
        return function () {
          cancelled = true;
          document.removeEventListener('visibilitychange', onVisibility);
          if (sentinel) {
            try {
              sentinel.release();
            } catch (_) {
              /* noop */
            }
            sentinel = null;
          }
        };
      },
      [screen, sessionState.running, sessionState.countInSec]
    );

    useEffect(function () {
      const onKey = function (event) {
        if (event.key === 'Escape') api.close();
      };
      document.addEventListener('keydown', onKey);
      return function () {
        document.removeEventListener('keydown', onKey);
      };
    }, []);

    function isSessionLocked(sessionId) {
      const candidate = getSession(sessionId);
      if (!candidate.weeklyLimit) return false;
      return (historyStats.weeklySessionCounts?.[candidate.id] || 0) >= candidate.weeklyLimit;
    }

    function setSession(sessionId) {
      if (isSessionLocked(sessionId)) return;
      setSessionState(makeSessionState(sessionId, props));
      setResumeSnapshot(null);
      setScreen('run');
    }

    function patchActiveResult(patch) {
      setSessionState(function (prev) {
        const results = prev.results.slice();
        results[prev.activeIndex] = { ...(results[prev.activeIndex] || {}), ...patch };
        return { ...prev, results };
      });
    }

    function markCurrentDone() {
      setSessionState(function (prev) {
        const results = prev.results.slice();
        results[prev.activeIndex] = { ...(results[prev.activeIndex] || {}), done: true };
        const nextIndex = Math.min(prev.activeIndex + 1, results.length - 1);
        const nextBlock = session.blockItems[nextIndex] || activeBlock;
        return {
          ...prev,
          results,
          activeIndex: nextIndex,
          remainingSec: nextIndex === prev.activeIndex ? 0 : nextBlock.targetSec,
          running: false,
          countInSec: 0,
        };
      });
      try {
        navigator.vibrate?.(12);
      } catch (_) {
        /* noop */
      }
    }

    function goToBlock(index) {
      const next = Math.max(0, Math.min(session.blockItems.length - 1, index));
      setSessionState(function (prev) {
        return {
          ...prev,
          activeIndex: next,
          remainingSec: session.blockItems[next]?.targetSec || 60,
          running: false,
          countInSec: 0,
        };
      });
    }

    function updateMetric(field, value) {
      setSessionState(function (prev) {
        return { ...prev, metrics: { ...prev.metrics, [field]: value } };
      });
    }

    function prepareFinishState(state) {
      return {
        ...state,
        running: false,
        countInSec: 0,
        metrics: deriveMetricsFromResults(state.sessionId, state.results, state.metrics),
        tapTest: state.tapTest ? { ...makeInitialTapTest(state.tapTest), running: false } : makeInitialTapTest(),
      };
    }

    function openFinish() {
      setSessionState((prev) => prepareFinishState(prev));
      setScreen('finish');
    }

    function triggerPainSafetyGate() {
      clearActiveSession();
      setResumeSnapshot(null);
      setSessionState((prev) => prepareFinishState(applyPainSafetyGate(prev)));
      setScreen('finish');
      try {
        navigator.vibrate?.([30, 40, 30]);
      } catch (_) {
        /* noop */
      }
    }

    function finishAndSave() {
      const readyState = prepareFinishState(sessionState);
      const log = saveSessionToTraining(readyState);
      setSavedLog(log);
      setSessionState({ ...readyState, hobbyLog: log });
      setResumeSnapshot(null);
      setProgressSeed((n) => n + 1);
      setScreen('saved');
      try {
        HEYS.Toast?.success?.('Тренировка сохранена');
      } catch (_) {
        /* noop */
      }
    }

    function resetActive() {
      clearActiveSession();
      setSessionState(makeSessionState('balanced_25', props));
      setResumeSnapshot(null);
      setScreen('home');
    }

    function formatClock(sec) {
      const s = Math.max(0, Math.round(Number(sec) || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    }

    function toggleRun() {
      setSessionState(function (prev) {
        if (prev.running || prev.countInSec) return { ...prev, running: false, countInSec: 0 };
        return { ...prev, running: false, countInSec: COUNT_IN_SEC };
      });
    }

    function rollbackActiveRamp() {
      setSessionState(function (prev) {
        const results = prev.results.slice();
        results[prev.activeIndex] = rollbackRamp(results[prev.activeIndex] || activeResult);
        return { ...prev, results };
      });
    }

    function setRampEnabled(enabled) {
      patchActiveResult({
        rampEnabled: !!enabled,
        rampStartBpm: activeResult.rampStartBpm || activeResult.bpm,
        rampLastBpm: enabled ? activeResult.rampLastBpm : 0,
      });
    }

    function setTapHand(hand) {
      setSessionState(function (prev) {
        const tapTest = makeInitialTapTest(prev.tapTest);
        return { ...prev, tapTest: { ...tapTest, hand: hand === 'left' ? 'left' : 'right', running: false, remainingSec: TAP_TEST_SECONDS } };
      });
    }

    function toggleTapTest() {
      setSessionState(function (prev) {
        const tapTest = makeInitialTapTest(prev.tapTest);
        if (tapTest.running) return { ...prev, tapTest: { ...tapTest, running: false } };
        const countField = tapTest.hand === 'left' ? 'tapsLeft' : 'tapsRight';
        const resetForNewRun = tapTest.remainingSec <= 0;
        return {
          ...prev,
          tapTest: {
            ...tapTest,
            [countField]: resetForNewRun ? 0 : tapTest[countField],
            remainingSec: resetForNewRun ? TAP_TEST_SECONDS : tapTest.remainingSec,
            running: true,
          },
        };
      });
    }

    function resetTapTest() {
      setSessionState(function (prev) {
        const tapTest = makeInitialTapTest(prev.tapTest);
        const countField = tapTest.hand === 'left' ? 'tapsLeft' : 'tapsRight';
        const metricField = tapTest.hand === 'left' ? 'oneHandFingerTapBpmLeft' : 'oneHandFingerTapBpmRight';
        return {
          ...prev,
          metrics: { ...prev.metrics, [metricField]: 0 },
          tapTest: { ...tapTest, [countField]: 0, running: false, remainingSec: TAP_TEST_SECONDS },
        };
      });
    }

    function recordTapTestHit() {
      setSessionState(function (prev) {
        const tapTest = makeInitialTapTest(prev.tapTest);
        if (!tapTest.running || tapTest.remainingSec <= 0) return prev;
        const countField = tapTest.hand === 'left' ? 'tapsLeft' : 'tapsRight';
        const taps = tapTest[countField] + 1;
        return {
          ...prev,
          metrics: applyTapCountToMetrics(prev.metrics, tapTest.hand, taps, TAP_TEST_SECONDS),
          tapTest: { ...tapTest, [countField]: taps },
        };
      });
    }

    function HomeScreen() {
      const rec = getSession(historyStats.nextSuggestion);
      const recLocked = isSessionLocked(rec.id);
      return h(
        'div',
        { className: 'drums-ft__body' },
        resumeSnapshot
          ? h(
              'button',
              { type: 'button', className: 'drums-ft-resume', onClick: () => setScreen('run') },
              h('span', null, 'Продолжить прерванную сессию'),
              h('strong', null, getSession(resumeSnapshot.sessionId).label + ' · ' + resumeSnapshot.dateKey)
            )
          : null,
        h(
          'section',
          { className: 'drums-ft-progress' },
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.totalSessions), h('span', null, 'сессий')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, formatMinutes(historyStats.totalMinutes)), h('span', null, 'всего')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.bestSingles || '—'), h('span', null, 'singles BPM')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.cleanRate + '%'), h('span', null, 'чистых блоков'))
        ),
        h(
          'section',
          { className: 'drums-ft-recommend' },
          h('div', null, h('span', null, 'Сегодня лучше'), h('strong', null, rec.shortLabel)),
          h('button', { type: 'button', onClick: () => setSession(rec.id), disabled: recLocked }, recLocked ? 'Лимит' : 'Старт')
        ),
        h(
          'div',
          { className: 'drums-ft-session-grid' },
          SESSIONS.map((item) =>
            {
              const locked = isSessionLocked(item.id);
              return h(
                'button',
                {
                  type: 'button',
                  key: item.id,
                  className: 'drums-ft-session-card' + (locked ? ' is-disabled' : ''),
                  onClick: () => setSession(item.id),
                  disabled: locked,
                  title: locked ? 'Недельный лимит для speed-сессий уже достигнут' : item.label,
                },
                h('span', { className: 'drums-ft-session-card__icon' }, item.icon),
                h('strong', null, item.label),
                h('span', null, locked ? 'недельный лимит выполнен' : item.intent),
                h('em', null, item.weeklyLimit ? (historyStats.weeklySessionCounts?.[item.id] || 0) + '/' + item.weeklyLimit + ' в неделю' : formatMinutes(item.minutes))
              );
            }
          )
        ),
        h(
          'section',
          { className: 'drums-ft-method' },
          h('strong', null, 'Методика проверена'),
          h(
            'p',
            null,
            'Основа: free stroke, rebound/fulcrum, finger control, doubles, Moeller accents и короткие bursts. Рост BPM разрешён только после чистого звука и низкого зажима.'
          )
        )
      );
    }

    function switchToLowTensionMode() {
      setSessionState((prev) => copySessionProgressToSession(prev, 'low_tension_rebuild_23'));
    }

    function RunScreen() {
      const tensionAlert = activeResult.tension >= 7 || sessionState.metrics.tensionScore >= 7 || sessionState.pain;
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-run' },
        h(
          'div',
          { className: 'drums-ft-run-head' },
          h('div', null, h('span', null, session.label), h('strong', null, activeBlock.label)),
          h('div', { className: 'drums-ft-progress-ring', style: { '--drums-ft-progress': progress + '%' } }, progress + '%')
        ),
        h(
          'div',
          { className: 'drums-ft-block-tabs' },
          session.blockItems.map((block, index) =>
            h(
              'button',
              {
                type: 'button',
                key: block.id + index,
                className:
                  'drums-ft-block-tab' +
                  (index === sessionState.activeIndex ? ' is-active' : '') +
                  (sessionState.results[index]?.done ? ' is-done' : ''),
                onClick: () => goToBlock(index),
                title: block.label,
              },
              index + 1
            )
          )
        ),
        tensionAlert
          ? h(
              'div',
              { className: 'drums-ft-alert' },
              h('strong', null, sessionState.pain ? 'Стоп-сигнал' : 'Зажим высокий'),
              h('span', null, sessionState.pain ? 'Заверши сессию и не добивай руку.' : 'Перейди в мягкий режим или снизь BPM на 10.'),
              h('button', { type: 'button', onClick: switchToLowTensionMode }, 'Мягкий режим')
            )
          : null,
        h('div', { className: 'drums-ft-timer' }, h('span', null, formatClock(sessionState.remainingSec))),
        sessionState.countInSec
          ? h('div', { className: 'drums-ft-count-in' }, h('strong', null, sessionState.countInSec), h('span', null, 'отсчёт'))
          : null,
        h(
          'div',
          { className: 'drums-ft-controls' },
          h(
            'button',
            {
              type: 'button',
              className: 'drums-ft-main-btn',
              onClick: toggleRun,
              disabled: sessionState.remainingSec <= 0,
            },
            sessionState.running || sessionState.countInSec ? 'Пауза' : 'Старт'
          ),
          h('button', { type: 'button', onClick: markCurrentDone }, activeResult.done ? 'Готово' : 'Блок выполнен'),
          h(
            'button',
            { type: 'button', className: soundEnabled ? 'is-active' : '', onClick: () => setSoundEnabled((v) => !v) },
            soundEnabled ? 'Клик' : 'Без клика'
          )
        ),
        h(
          'section',
          { className: 'drums-ft-current' },
          h('p', null, activeBlock.goal),
          h('div', { className: 'drums-ft-pattern' }, activeBlock.pattern),
          h(
            'ul',
            null,
            activeBlock.cues.map((cue) => h('li', { key: cue }, cue))
          )
        ),
        h(
          'div',
          { className: 'drums-ft-input-grid' },
          h(
            'label',
            null,
            h('span', null, 'BPM'),
            h('input', {
              type: 'number',
              min: 30,
              max: 260,
              value: activeResult.bpm,
              onChange: (event) => patchActiveResult({ bpm: clampNumber(event.target.value, 30, 260, activeBlock.bpm) }),
            })
          ),
          h(
            'label',
            null,
            h('span', null, 'Зажим'),
            h('input', {
              type: 'range',
              min: 1,
              max: 10,
              value: activeResult.tension,
              onChange: (event) => patchActiveResult({ tension: clampNumber(event.target.value, 1, 10, 3) }),
            })
          ),
          h(
            'label',
            null,
            h('span', null, 'Звук'),
            h('input', {
              type: 'range',
              min: 1,
              max: 5,
              value: activeResult.sound,
              onChange: (event) => patchActiveResult({ sound: clampNumber(event.target.value, 1, 5, 4) }),
            })
          ),
          h(
            'label',
            { className: 'drums-ft-check' },
            h('input', {
              type: 'checkbox',
              checked: !!activeResult.clean,
              onChange: (event) => patchActiveResult({ clean: event.target.checked }),
            }),
            h('span', null, 'чисто')
          )
        ),
        activeBlock.ramp
          ? h(
              'section',
              { className: 'drums-ft-ramp' },
              h(
                'div',
                null,
                h('strong', null, activeResult.rampEnabled ? 'Разгон темпа включён' : 'Разгон темпа выключен'),
                h(
                  'span',
                  null,
                  activeResult.rampEnabled
                    ? '+' + activeBlock.ramp.stepBpm + ' BPM каждые ' + activeBlock.ramp.everyBars + ' тактов'
                    : 'темп меняется только вручную'
                )
              ),
              h('button', { type: 'button', onClick: () => setRampEnabled(!activeResult.rampEnabled) }, activeResult.rampEnabled ? 'Выкл.' : 'Вкл.'),
              h('button', { type: 'button', onClick: rollbackActiveRamp, disabled: !activeResult.rampLastBpm }, 'Грязно')
            )
          : null,
        h(
          'label',
          { className: 'drums-ft-pain' },
          h('input', {
            type: 'checkbox',
            checked: !!sessionState.pain,
            onChange: (event) => {
              if (event.target.checked) triggerPainSafetyGate();
              else setSessionState((prev) => ({ ...prev, pain: false, safetyStop: false, running: false, countInSec: 0 }));
            },
          }),
          h('span', null, 'есть боль, онемение или палка теряет контроль')
        ),
        h(
          'div',
          { className: 'drums-ft-bottom-actions' },
          h('button', { type: 'button', onClick: () => goToBlock(sessionState.activeIndex - 1), disabled: sessionState.activeIndex === 0 }, 'Назад'),
          h(
            'button',
            { type: 'button', onClick: () => goToBlock(sessionState.activeIndex + 1), disabled: sessionState.activeIndex >= session.blockItems.length - 1 },
            'Дальше'
          ),
          h('button', { type: 'button', className: 'drums-ft-save-btn', onClick: openFinish }, 'Финиш')
        )
      );
    }

    function FinishScreen() {
      const tapTest = makeInitialTapTest(sessionState.tapTest);
      const tapCount = tapTest.hand === 'left' ? tapTest.tapsLeft : tapTest.tapsRight;
      const tapMetric = tapTest.hand === 'left' ? sessionState.metrics.oneHandFingerTapBpmLeft : sessionState.metrics.oneHandFingerTapBpmRight;
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-finish' },
        h('section', { className: 'drums-ft-finish-hero' }, h('strong', null, progress + '%'), h('span', null, 'пройдено')),
        sessionState.pain || sessionState.safetyStop
          ? h(
              'section',
              { className: 'drums-ft-safety-stop' },
              h('strong', null, 'Сессия остановлена'),
              h('span', null, 'Сегодня не продолжай нагрузку. Следующая тренировка — мягкая, после 1–2 дней паузы.')
            )
          : null,
        h(
          'section',
          { className: 'drums-ft-tap-test' },
          h(
            'div',
            { className: 'drums-ft-tap-test__head' },
            h('strong', null, '20-сек тест одной руки'),
            h('span', null, formatClock(tapTest.remainingSec))
          ),
          h(
            'div',
            { className: 'drums-ft-tap-test__hands' },
            h('button', { type: 'button', className: tapTest.hand === 'right' ? 'is-active' : '', onClick: () => setTapHand('right') }, 'Правая'),
            h('button', { type: 'button', className: tapTest.hand === 'left' ? 'is-active' : '', onClick: () => setTapHand('left') }, 'Левая')
          ),
          h(
            'div',
            { className: 'drums-ft-tap-test__body' },
            h('button', { type: 'button', onClick: toggleTapTest }, tapTest.running ? 'Пауза' : 'Старт'),
            h('button', { type: 'button', className: 'drums-ft-tap-test__tap', onClick: recordTapTestHit, disabled: !tapTest.running }, 'Тап'),
            h('button', { type: 'button', onClick: resetTapTest }, 'Сброс')
          ),
          h('div', { className: 'drums-ft-tap-test__meta' }, h('span', null, tapCount + ' ударов'), h('strong', null, tapMetric + ' BPM'))
        ),
        h(
          'div',
          { className: 'drums-ft-input-grid drums-ft-input-grid--metrics' },
          [
            ['cleanBpmSingles16', 'Singles BPM'],
            ['cleanBpmDoubles16', 'Doubles BPM'],
            ['oneHandFingerTapBpmRight', 'Правая рука'],
            ['oneHandFingerTapBpmLeft', 'Левая рука'],
          ].map(([field, label]) =>
            h(
              'label',
              { key: field },
              h('span', null, label),
              h('input', {
                type: 'number',
                min: 0,
                max: 320,
                value: sessionState.metrics[field],
                onChange: (event) => updateMetric(field, clampNumber(event.target.value, 0, 320, 0)),
              })
            )
          ),
          h(
            'label',
            null,
            h('span', null, 'Общий зажим'),
            h('input', {
              type: 'range',
              min: 1,
              max: 10,
              value: sessionState.metrics.tensionScore,
              onChange: (event) => updateMetric('tensionScore', clampNumber(event.target.value, 1, 10, 3)),
            })
          ),
          h(
            'label',
            null,
            h('span', null, 'Памп предплечий'),
            h('input', {
              type: 'range',
              min: 1,
              max: 10,
              value: sessionState.metrics.forearmPumpScore,
              onChange: (event) => updateMetric('forearmPumpScore', clampNumber(event.target.value, 1, 10, 3)),
            })
          ),
          h(
            'label',
            null,
            h('span', null, 'Ровность звука'),
            h('input', {
              type: 'range',
              min: 1,
              max: 5,
              value: sessionState.metrics.soundEvenness,
              onChange: (event) => updateMetric('soundEvenness', clampNumber(event.target.value, 1, 5, 4)),
            })
          )
        ),
        h('textarea', {
          className: 'drums-ft-note',
          placeholder: 'Что получилось, где зажим, какой BPM был чистым',
          value: sessionState.note || '',
          onChange: (event) => setSessionState((prev) => ({ ...prev, note: event.target.value })),
        }),
        h(
          'div',
          { className: 'drums-ft-bottom-actions' },
          h('button', { type: 'button', onClick: () => setScreen('run'), disabled: !!sessionState.pain || !!sessionState.safetyStop }, 'Вернуться'),
          h('button', { type: 'button', className: 'drums-ft-save-btn', onClick: finishAndSave }, 'Сохранить в день')
        )
      );
    }

    function SavedScreen() {
      const log = savedLog || sessionState.hobbyLog || {};
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-saved' },
        h('section', { className: 'drums-ft-saved-card' }, h('strong', null, 'Сохранено'), h('span', null, log.sessionLabel || session.label)),
        h(
          'section',
          { className: 'drums-ft-progress' },
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.totalSessions), h('span', null, 'сессий')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.bestSingles || '—'), h('span', null, 'singles BPM')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.bestDoubles || '—'), h('span', null, 'doubles BPM')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, historyStats.avgTension || '—'), h('span', null, 'средний зажим'))
        ),
        h(
          'div',
          { className: 'drums-ft-bottom-actions' },
          h('button', { type: 'button', onClick: resetActive }, 'Новая сессия'),
          h('button', { type: 'button', className: 'drums-ft-save-btn', onClick: api.close }, 'Закрыть')
        )
      );
    }

    return h(
      'div',
      { className: 'drums-ft', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Тренажёр барабанных пальцев' },
      h(
        'div',
        { className: 'drums-ft__shell' },
        h(
          'header',
          { className: 'drums-ft__header' },
          h('div', null, h('span', null, 'Барабанный пад'), h('strong', null, 'Finger Control')),
          h(
            'button',
            { type: 'button', className: 'drums-ft__close', onClick: api.close, 'aria-label': 'Закрыть' },
            '×'
          )
        ),
        screen === 'home' ? h(HomeScreen) : screen === 'run' ? h(RunScreen) : screen === 'finish' ? h(FinishScreen) : h(SavedScreen)
      )
    );
  }

  function mount(opts) {
    if (!React || !ReactDOM || !global.document?.body) return;
    if (activeRoot) return;
    const host = getOrCreateHost();
    lockBodyScroll();
    document.documentElement.setAttribute('data-drums-finger-trainer', 'true');
    const props = {
      dateKey: safeDateKey(opts?.dateKey),
      trainingIndex: Number.isFinite(+opts?.trainingIndex) ? +opts.trainingIndex : 0,
      mode: opts?.mode || 'new',
    };
    const element = React.createElement(DrumsTrainerApp, props);
    if (ReactDOM.createRoot) {
      const root = ReactDOM.createRoot(host);
      root.render(element);
      activeRoot = { host, root };
    } else {
      ReactDOM.render(element, host);
      activeRoot = { host, legacy: true };
    }
  }

  function unmount() {
    if (!activeRoot) return;
    try {
      if (activeRoot.root) activeRoot.root.unmount();
      else if (activeRoot.legacy) ReactDOM.unmountComponentAtNode(activeRoot.host);
    } catch (_) {
      /* noop */
    }
    try {
      activeRoot.host.remove();
    } catch (_) {
      /* noop */
    }
    activeRoot = null;
    document.documentElement.removeAttribute('data-drums-finger-trainer');
    unlockBodyScroll();
  }

  function renderPreviewPill(props) {
    if (!React) return null;
    const h = React.createElement;
    const training = props?.training || {};
    const log = training.hobbyLog || {};
    const session = getSession(log.sessionId || 'balanced_25');
    const metrics = log.metrics || {};
    const cleanRate =
      log.totalBlocks > 0 ? Math.round(((Number(log.completedBlocks) || 0) / log.totalBlocks) * 100) : 0;
    const title = training.activityLabel || 'Барабанный пад';
    const subtitle = log.completedAt
      ? session.shortLabel + ' · ' + (metrics.cleanBpmSingles16 ? metrics.cleanBpmSingles16 + ' BPM' : cleanRate + '%')
      : 'Открыть тренажёр';
    const onClick =
      props?.onClick ||
      function () {
        api.openFullscreen({
          dateKey: props?.dateKey,
          trainingIndex: props?.trainingIndex,
          mode: log.completedAt ? 'edit' : 'new',
        });
      };
    return h(
      'div',
      {
        className: 'drums-ft-pill compact-card',
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: function (event) {
          if (event.key === 'Enter' || event.key === ' ') onClick();
        },
        'aria-label': 'Барабанный тренажёр: ' + title,
      },
      h('span', { className: 'drums-ft-pill__icon', 'aria-hidden': 'true' }, '🥁'),
      h('div', { className: 'drums-ft-pill__body' }, h('strong', null, title), h('span', null, subtitle)),
      training.time ? h('span', { className: 'drums-ft-pill__time' }, training.time) : null,
      h('span', { className: 'drums-ft-pill__chev', 'aria-hidden': 'true' }, '›')
    );
  }

  const api = {
    __registered: true,
    MODULE_ID,
    BLOCKS: BLOCKS.slice(),
    SESSIONS: SESSIONS.slice(),
    isDrumsTraining,
    getSession,
    expandSession,
    summarizeProgress,
    scanLogs,
    openFullscreen: mount,
    close: unmount,
    renderPreviewPill,
    _test: {
      makeSessionState,
      makeSessionStateFromLog,
      makeInitialBlockResult,
      normalizeSessionMetrics,
      getProgressionBpm,
      deriveMetricsFromResults,
      getTapBpm,
      applyTapCountToMetrics,
      makeInitialTapTest,
      applyPainSafetyGate,
      buildInitialAppState,
      copySessionProgressToSession,
      calculateStreak,
      getSubdivisionConfig,
      getMetronomeIntervalSec,
      getMetronomeNoteKind,
      resyncMetronomeCursor,
      getRampStep,
      applyRampStep,
      rollbackRamp,
      buildHobbyLog,
      saveSessionToTraining,
      readDay,
      writeDay,
      readActiveSession,
      writeActiveSession,
      clearActiveSession,
      getActiveSessionKeys,
      localDateKey,
    },
  };

  Hobby.DrumsFingerControl = api;
})(typeof window !== 'undefined' ? window : globalThis);
