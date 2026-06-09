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
  const ROOT_ID = 'drums-finger-trainer-root';

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const BLOCKS = [
    {
      id: 'free_stroke',
      label: 'Free Stroke',
      goal: 'Свободный rebound и ровный открытый звук.',
      minutes: 3,
      bpm: 70,
      pattern: 'восьмые',
      cues: ['кисть мягкая', 'палка сама возвращается', 'не сжимай хват'],
    },
    {
      id: 'finger_rebound',
      label: 'Finger Rebound',
      goal: 'Пальцы ловят и направляют отскок.',
      minutes: 5,
      bpm: 70,
      pattern: 'одной рукой, затем RLRL',
      cues: ['маленькая амплитуда', 'тихое предплечье', 'мягкий fulcrum'],
    },
    {
      id: 'singles',
      label: 'Singles RLRL',
      goal: 'Ровные одиночки без ускорения и зажима.',
      minutes: 5,
      bpm: 90,
      pattern: 'RLRL',
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
      cues: ['акцент без силы', 'три тихих ноты после', 'волна, не удар предплечьем'],
    },
    {
      id: 'burst_8_8',
      label: 'Burst 8 / 8',
      goal: 'Короткая скорость без потери контроля.',
      minutes: 8,
      bpm: 110,
      pattern: '8 быстро / 8 медленно',
      cues: ['быстро, но чисто', 'медленные 8 — полный сброс', 'не гони максимум'],
    },
    {
      id: 'buzz_roll',
      label: 'Buzz Roll',
      goal: 'Чувство контакта и расслабленный rebound.',
      minutes: 5,
      bpm: 60,
      pattern: 'легкий buzz',
      cues: ['минимальное давление', 'ровная текстура', 'мягкая кисть'],
    },
    {
      id: 'improv_pad',
      label: 'Pad Flow',
      goal: 'Перенос техники в музыкальное движение.',
      minutes: 5,
      bpm: 80,
      pattern: 'singles, doubles, accents, rests',
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

  function clampNumber(value, min, max, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function safeDateKey(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date().toISOString().slice(0, 10);
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

  function readDay(dateKey) {
    const keys = getDayKeys(dateKey);
    if (keys.scoped) {
      const scoped = lsGet(keys.scoped, null);
      if (scoped && scoped.date === dateKey) return { day: scoped, key: keys.scoped };
    }
    const base = lsGet(keys.base, null);
    if (base && base.date === dateKey) return { day: base, key: keys.base };
    return { day: { date: dateKey, meals: [], trainings: [] }, key: keys.scoped || keys.base };
  }

  function writeDay(dateKey, day) {
    const keys = getDayKeys(dateKey);
    const targetKey = keys.scoped || keys.base;
    lsSet(targetKey, day);
    if (!keys.scoped) return;
    const base = lsGet(keys.base, null);
    if (!base || base.date === dateKey) lsSet(keys.base, day);
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

  function makeInitialBlockResult(block) {
    return {
      blockId: block.id,
      bpm: block.bpm || 80,
      clean: false,
      done: false,
      tension: 3,
      sound: 4,
      note: '',
    };
  }

  function makeSessionState(sessionId, opts) {
    const expanded = expandSession(sessionId);
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
      results: expanded.blockItems.map(makeInitialBlockResult),
      metrics: {
        cleanBpmSingles16: 0,
        cleanBpmDoubles16: 0,
        oneHandFingerTapBpmRight: 0,
        oneHandFingerTapBpmLeft: 0,
        tensionScore: 3,
        forearmPumpScore: 3,
        soundEvenness: 4,
      },
      pain: false,
      note: '',
    };
  }

  function readActiveSession() {
    const snapshot = lsGet(ACTIVE_SESSION_KEY, null);
    if (!snapshot || snapshot.moduleId !== MODULE_ID) return null;
    return snapshot;
  }

  function writeActiveSession(state) {
    if (!state || state.completedAt) {
      lsRemove(ACTIVE_SESSION_KEY);
      return;
    }
    lsSet(ACTIVE_SESSION_KEY, { ...state, savedAt: Date.now(), running: false });
  }

  function clearActiveSession() {
    lsRemove(ACTIVE_SESSION_KEY);
  }

  function scanLogs(limitDays) {
    const out = [];
    const max = Number.isFinite(+limitDays) ? +limitDays : 180;
    try {
      const ls = global.localStorage;
      if (!ls) return out;
      for (let i = 0; i < ls.length; i++) {
        const key = ls.key(i);
        if (!key || key.indexOf('dayv2_') < 0) continue;
        const day = lsGet(key, null);
        if (!day || !Array.isArray(day.trainings)) continue;
        const dateKey = day.date || String(key).slice(-10);
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

    let cur = new Date();
    for (let i = 0; i < 60; i++) {
      const key = cur.toISOString().slice(0, 10);
      if (!dates.has(key)) {
        if (i === 0) {
          cur.setDate(cur.getDate() - 1);
          continue;
        }
        break;
      }
      stats.streak += 1;
      cur.setDate(cur.getDate() - 1);
    }

    const recentTensionHigh = rows.slice(0, 2).some((row) => Number(row.log?.metrics?.tensionScore) >= 7);
    const recentSpeedCount = rows
      .slice(0, 7)
      .filter((row) => row.log?.sessionId === 'speed_breakthrough_30').length;
    if (recentTensionHigh) stats.nextSuggestion = 'low_tension_rebuild_23';
    else if (recentSpeedCount >= 2) stats.nextSuggestion = 'balanced_25';
    else if (stats.totalSessions >= 3 && stats.avgTension <= 5) stats.nextSuggestion = 'speed_breakthrough_30';
    else stats.nextSuggestion = 'balanced_25';
    return stats;
  }

  function buildHobbyLog(state) {
    const session = getSession(state.sessionId);
    const completedBlocks = state.results.filter((result) => result.done).length;
    const metrics = {
      cleanBpmSingles16: clampNumber(state.metrics.cleanBpmSingles16, 0, 320, 0),
      cleanBpmDoubles16: clampNumber(state.metrics.cleanBpmDoubles16, 0, 320, 0),
      oneHandFingerTapBpmRight: clampNumber(state.metrics.oneHandFingerTapBpmRight, 0, 320, 0),
      oneHandFingerTapBpmLeft: clampNumber(state.metrics.oneHandFingerTapBpmLeft, 0, 320, 0),
      tensionScore: clampNumber(state.metrics.tensionScore, 1, 10, 3),
      forearmPumpScore: clampNumber(state.metrics.forearmPumpScore, 1, 10, 3),
      soundEvenness: clampNumber(state.metrics.soundEvenness, 1, 5, 4),
    };
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
      note: state.note || '',
      blockResults: state.results.map((result) => ({
        blockId: result.blockId,
        bpm: clampNumber(result.bpm, 0, 320, 0),
        clean: !!result.clean,
        done: !!result.done,
        tension: clampNumber(result.tension, 1, 10, 3),
        sound: clampNumber(result.sound, 1, 5, 4),
        note: result.note || '',
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

  function playTick(strong) {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playTick._ctx || (playTick._ctx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(strong ? 1320 : 880, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(strong ? 0.18 : 0.11, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.07);
    } catch (_) {
      /* noop */
    }
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
    const { useEffect, useMemo, useState } = React;
    const initialState = useMemo(function () {
      const resume = readActiveSession();
      if (resume && resume.dateKey === safeDateKey(props.dateKey)) return resume;
      const training = readDay(safeDateKey(props.dateKey)).day?.trainings?.[props.trainingIndex] || {};
      return makeSessionState(training.hobbyLog?.sessionId || 'balanced_25', props);
    }, []);

    const [screen, setScreen] = useState(initialState.startedAt && initialState.results?.some((r) => r.done) ? 'run' : 'home');
    const [sessionState, setSessionState] = useState(initialState);
    const [metronome, setMetronome] = useState(false);
    const [savedLog, setSavedLog] = useState(null);
    const [progressSeed, setProgressSeed] = useState(0);

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
        if (screen === 'run') writeActiveSession(sessionState);
      },
      [screen, sessionState]
    );

    useEffect(
      function () {
        if (screen !== 'run' || !sessionState.running || !activeBlock) return undefined;
        const id = global.setInterval(function () {
          setSessionState(function (prev) {
            const nextSec = Math.max(0, (Number(prev.remainingSec) || 0) - 1);
            if (nextSec === 0 && prev.remainingSec > 0) {
              try {
                HEYS.__playRestDoneBeep?.();
              } catch (_) {
                playTick(true);
              }
            }
            return { ...prev, remainingSec: nextSec, running: nextSec > 0 ? prev.running : false };
          });
        }, 1000);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, sessionState.running, sessionState.activeIndex, activeBlock?.id]
    );

    useEffect(
      function () {
        if (!metronome || screen !== 'run') return undefined;
        const bpm = clampNumber(activeResult.bpm, 30, 260, activeBlock?.bpm || 80);
        let beat = 0;
        playTick(true);
        const id = global.setInterval(function () {
          beat += 1;
          playTick(beat % 4 === 0);
        }, Math.max(120, Math.round(60000 / bpm)));
        return function () {
          global.clearInterval(id);
        };
      },
      [metronome, screen, activeResult.bpm, activeBlock?.id]
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

    function setSession(sessionId) {
      setSessionState(makeSessionState(sessionId, props));
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
        };
      });
    }

    function updateMetric(field, value) {
      setSessionState(function (prev) {
        return { ...prev, metrics: { ...prev.metrics, [field]: value } };
      });
    }

    function finishAndSave() {
      const log = saveSessionToTraining(sessionState);
      setSavedLog(log);
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
      setScreen('home');
    }

    function formatClock(sec) {
      const s = Math.max(0, Math.round(Number(sec) || 0));
      const m = Math.floor(s / 60);
      const r = s % 60;
      return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    }

    function HomeScreen() {
      const rec = getSession(historyStats.nextSuggestion);
      return h(
        'div',
        { className: 'drums-ft__body' },
        readActiveSession()
          ? h(
              'button',
              { type: 'button', className: 'drums-ft-resume', onClick: () => setScreen('run') },
              h('span', null, 'Продолжить прерванную сессию'),
              h('strong', null, getSession(readActiveSession().sessionId).label)
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
          h('button', { type: 'button', onClick: () => setSession(rec.id) }, 'Старт')
        ),
        h(
          'div',
          { className: 'drums-ft-session-grid' },
          SESSIONS.map((item) =>
            h(
              'button',
              {
                type: 'button',
                key: item.id,
                className: 'drums-ft-session-card',
                onClick: () => setSession(item.id),
              },
              h('span', { className: 'drums-ft-session-card__icon' }, item.icon),
              h('strong', null, item.label),
              h('span', null, item.intent),
              h('em', null, formatMinutes(item.minutes))
            )
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
              h('button', { type: 'button', onClick: () => setSession('low_tension_rebuild_23') }, 'Мягкий режим')
            )
          : null,
        h('div', { className: 'drums-ft-timer' }, h('span', null, formatClock(sessionState.remainingSec))),
        h(
          'div',
          { className: 'drums-ft-controls' },
          h(
            'button',
            {
              type: 'button',
              className: 'drums-ft-main-btn',
              onClick: () => setSessionState((prev) => ({ ...prev, running: !prev.running })),
              disabled: sessionState.remainingSec <= 0,
            },
            sessionState.running ? 'Пауза' : 'Старт'
          ),
          h('button', { type: 'button', onClick: markCurrentDone }, activeResult.done ? 'Готово' : 'Блок выполнен'),
          h(
            'button',
            { type: 'button', className: metronome ? 'is-active' : '', onClick: () => setMetronome((v) => !v) },
            'Метроном'
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
        h(
          'label',
          { className: 'drums-ft-pain' },
          h('input', {
            type: 'checkbox',
            checked: !!sessionState.pain,
            onChange: (event) => setSessionState((prev) => ({ ...prev, pain: event.target.checked, running: false })),
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
          h('button', { type: 'button', className: 'drums-ft-save-btn', onClick: () => setScreen('finish') }, 'Финиш')
        )
      );
    }

    function FinishScreen() {
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-finish' },
        h('section', { className: 'drums-ft-finish-hero' }, h('strong', null, progress + '%'), h('span', null, 'пройдено')),
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
          h('button', { type: 'button', onClick: () => setScreen('run') }, 'Вернуться'),
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
      buildHobbyLog,
      saveSessionToTraining,
      readDay,
      writeDay,
    },
  };

  Hobby.DrumsFingerControl = api;
})(typeof window !== 'undefined' ? window : globalThis);
