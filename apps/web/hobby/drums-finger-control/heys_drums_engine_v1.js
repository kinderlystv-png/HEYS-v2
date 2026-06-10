// heys_drums_engine_v1.js — session, persistence orchestration, and metronome engine.
;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const DFC = (Hobby._drumsInternal = Hobby._drumsInternal || {});

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const {
    MODULE_ID,
    TAP_TEST_SECONDS,
    SAFETY_REST_DAYS,
    SUBDIVISIONS,
    clampNumber,
    safeDateKey,
    localDateKey,
    expandSession,
    getSession,
    getSubdivisionConfig,
    isDrumsTraining,
    scanLogs,
    readDay,
    writeDay,
    readActiveSession,
    clearActiveSession,
  } = DFC;

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

  function makeFallbackNotationPattern(block) {
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    return Array.from({ length: notesPerBar }, function (_, index) {
      return { sticking: index % 2 === 0 ? 'R' : 'L', accent: index === 0, rest: false };
    });
  }

  function expandBlockPattern(block) {
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    const source = Array.isArray(block?.notationPattern) && block.notationPattern.length ? block.notationPattern : makeFallbackNotationPattern(block);
    return source.map(function (event, index) {
      const kind = getMetronomeNoteKind(block, index);
      const sticking = event?.sticking === 'L' ? 'L' : event?.sticking === 'R' ? 'R' : null;
      return {
        slot: index,
        noteInBar: index % notesPerBar,
        barIndex: Math.floor(index / notesPerBar),
        sticking,
        accent: !!event?.accent || kind === 'bar' || kind === 'accent',
        rest: !!event?.rest,
        kind,
      };
    });
  }

  function getPlaybackPosition(block, noteIndex) {
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    const index = Math.max(0, Math.floor(Number(noteIndex) || 0));
    const cycle = expandBlockPattern(block);
    const cycleNote = cycle[index % Math.max(1, cycle.length)] || cycle[0] || {};
    const kind = getMetronomeNoteKind(block, index);
    return {
      barIndex: Math.floor(index / notesPerBar),
      noteInBar: index % notesPerBar,
      cycleIndex: index % Math.max(1, cycle.length),
      slot: cycleNote.slot || 0,
      sticking: cycleNote.sticking || null,
      accent: !!cycleNote.accent || kind === 'bar' || kind === 'accent',
      rest: !!cycleNote.rest,
      kind,
    };
  }

  function getNotationBlockBpm(block, result) {
    return clampNumber(result?.bpm, 30, 260, block?.bpm || 80);
  }

  function getEstimatedBlockBars(block, result) {
    const bpm = getNotationBlockBpm(block, result);
    const targetSec = Math.max(0, Number(block?.targetSec) || 0);
    if (!targetSec) return 2;
    return Math.max(2, Math.ceil(targetSec / Math.max(0.1, (60 / bpm) * 4)));
  }

  function getNotationRampMarker(block, result, startNoteIndex) {
    const ramp = block && block.ramp;
    if (!ramp || !result?.rampEnabled) return '';
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    const startBar = Math.floor(Math.max(0, Number(startNoteIndex) || 0) / notesPerBar);
    const everyBars = clampNumber(ramp.everyBars, 1, 64, 8);
    if (startBar <= 0 || startBar % everyBars !== 0) return '';
    if (startBar <= (Number(result.rampBars) || 0)) return '';
    const bpm = getNotationBlockBpm(block, result);
    const nextBpm = Math.min(clampNumber(ramp.maxBpm, 30, 260, 180), bpm + clampNumber(ramp.stepBpm, 1, 12, 2));
    return nextBpm > bpm ? nextBpm + ' BPM' : '';
  }

  function buildNotationNotes(block, startNoteIndex, count, section, options) {
    const notes = [];
    const safeStart = Math.max(0, Math.floor(Number(startNoteIndex) || 0));
    const total = Math.max(0, Math.floor(Number(count) || 0));
    const marker = options?.rampMarker || '';
    for (let i = 0; i < total; i++) {
      const absoluteIndex = safeStart + i;
      const pos = getPlaybackPosition(block, absoluteIndex);
      notes.push({
        ...pos,
        blockId: block?.id || '',
        blockLabel: block?.label || '',
        absoluteIndex,
        section,
        isBarStart: pos.noteInBar === 0,
        bpmMarker: i === 0 ? marker : '',
      });
    }
    return notes;
  }

  function getNotationWindow(sessionInput, blockIndex, noteIndex, options) {
    const session =
      typeof sessionInput === 'string'
        ? expandSession(sessionInput)
        : sessionInput?.blockItems
          ? sessionInput
          : expandSession(sessionInput?.id || 'balanced_25');
    const blocks = Array.isArray(session.blockItems) ? session.blockItems : [];
    const safeBlockIndex = Math.max(0, Math.min(blocks.length - 1, clampNumber(blockIndex, 0, blocks.length - 1, 0)));
    const block = blocks[safeBlockIndex] || blocks[0] || {};
    const result = options?.result || (Array.isArray(options?.results) ? options.results[safeBlockIndex] : null);
    const subdivision = getSubdivisionConfig(block);
    const notesPerBar = Math.max(1, subdivision.notesPerBeat * 4);
    const windowNotes = notesPerBar * 2;
    const safeNoteIndex = Math.max(0, Math.floor(Number(noteIndex) || 0));
    const activeStart = Math.floor(safeNoteIndex / windowNotes) * windowNotes;
    const totalNotes = getEstimatedBlockBars(block, result) * notesPerBar;
    const previewStart = activeStart + windowNotes;
    const nextBlock = blocks[safeBlockIndex + 1] || null;
    const previewIsNextBlock = !!nextBlock && previewStart >= totalNotes;
    const previewBlock = previewIsNextBlock ? nextBlock : block;
    const previewResult = previewIsNextBlock && Array.isArray(options?.results) ? options.results[safeBlockIndex + 1] : result;
    const previewNoteStart = previewIsNextBlock ? 0 : previewStart;
    const previewMarker = previewIsNextBlock ? '' : getNotationRampMarker(block, result, previewStart);
    return {
      active: buildNotationNotes(block, activeStart, windowNotes, 'active', { rampMarker: getNotationRampMarker(block, result, activeStart) }),
      preview: buildNotationNotes(previewBlock, previewNoteStart, windowNotes, 'preview', { rampMarker: previewMarker }),
      activeStart,
      previewStart: previewNoteStart,
      activeBlockId: block.id || '',
      previewBlockId: previewBlock?.id || '',
      previewBlockLabel: previewBlock?.label || '',
      previewIsNextBlock,
      activeWindowIndex: Math.floor(activeStart / windowNotes),
      notesPerBar,
      windowNotes,
      currentNoteIndex: safeNoteIndex,
      currentBpm: getNotationBlockBpm(block, result),
      previewBpm: getNotationBlockBpm(previewBlock, previewResult),
    };
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

  function clampVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function scheduleTick(ctx, startTime, kind, volume) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = Math.max(ctx.currentTime, Number(startTime) || ctx.currentTime);
      const strong = kind === 'bar' || kind === true;
      const level = clampVolume(volume);
      const peak = Math.max(0.0001, (strong ? 0.18 : kind === 'sub' ? 0.07 : 0.11) * level);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(kind === 'sub' ? 660 : strong ? 1320 : 880, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === 'sub' ? 0.04 : 0.055));
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.07);
    } catch (_) {
      /* noop */
    }
  }

  function playTick(kind, volume) {
    try {
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) return;
      const ctx = playTick._ctx || (playTick._ctx = new Ctx());
      if (ctx.state === 'suspended') ctx.resume();
      scheduleTick(ctx, ctx.currentTime, kind === true ? 'bar' : kind || 'beat', volume);
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

  Object.assign(DFC, {
    normalizeSessionMetrics,
    getBlockAttemptFromLog,
    getProgressionBpm,
    makeInitialBlockResult,
    deriveMetricsFromResults,
    getTapBpm,
    applyTapCountToMetrics,
    makeInitialTapTest,
    applyPainSafetyGate,
    makeSessionStateFromLog,
    makeSessionState,
    copySessionProgressToSession,
    getMetronomeIntervalSec,
    getMetronomeNoteKind,
    expandBlockPattern,
    getPlaybackPosition,
    getNotationWindow,
    resyncMetronomeCursor,
    getRampStep,
    applyRampStep,
    rollbackRamp,
    calculateStreak,
    summarizeProgress,
    buildHobbyLog,
    saveSessionToTraining,
    buildInitialAppState,
    scheduleTick,
    playTick,
    getMetronomeContext,
  });
})(typeof window !== 'undefined' ? window : globalThis);
