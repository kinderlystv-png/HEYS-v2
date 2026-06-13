import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeEach, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MODULE_PATHS = [
  'heys_drums_catalog_v1.js',
  'heys_drums_persistence_v1.js',
  'heys_drums_engine_v1.js',
  'heys_drums_notation_v1.js',
  'heys_drums_ui_v1.js',
].map((fileName) =>
  path.resolve(
    __dirname,
    '..',
    'hobby',
    'drums-finger-control',
    fileName,
  ),
);

function setupModule({ clientId = '' } = {}) {
  const store = new Map();
  globalThis.window = globalThis;
  globalThis.HEYS = {
    currentClientId: clientId,
    utils: {
      getCurrentClientId() {
        return globalThis.HEYS.currentClientId || '';
      },
      lsGet(key, fallback) {
        return store.has(key) ? JSON.parse(store.get(key)) : fallback;
      },
      lsSet(key, value) {
        store.set(key, JSON.stringify(value));
      },
    },
  };
  globalThis.localStorage = {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] || null;
    },
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };
  globalThis.dispatchEvent = () => true;

  MODULE_PATHS.forEach((modulePath) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(modulePath, 'utf8'));
  });
  return { api: globalThis.HEYS.Hobby.DrumsFingerControl, store };
}

describe('drums finger trainer', () => {
  beforeEach(() => {
    delete globalThis.HEYS;
    delete globalThis.window;
    delete globalThis.localStorage;
  });

  it('registers lightweight hobby API and four method sessions', () => {
    const { api } = setupModule();
    expect(api.MODULE_ID).toBe('drums_finger_control');
    expect(api.SESSIONS.map((s) => s.id)).toEqual([
      'balanced_25',
      'speed_breakthrough_30',
      'low_tension_rebuild_23',
      'micro_15',
    ]);
    expect(api.expandSession('balanced_25').blockItems.map((b) => b.id)).toContain(
      'finger_rebound',
    );
  });

  it('builds a completed hobbyLog with clean BPM metrics', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', {
      dateKey: '2026-06-09',
      trainingIndex: 0,
    });
    state.results[0].done = true;
    state.results[0].clean = true;
    state.results[0].bpm = 80;
    state.metrics.cleanBpmSingles16 = 112;
    state.metrics.cleanBpmDoubles16 = 94;

    const log = api._test.buildHobbyLog(state);
    expect(log.moduleId).toBe('drums_finger_control');
    expect(log.sessionId).toBe('balanced_25');
    expect(log.metrics.cleanBpmSingles16).toBe(112);
    expect(log.completedBlocks).toBe(1);
  });

  it('starts metric blocks from recent clean history and adds a small streak step', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const logs = [
      {
        log: {
          completedAt: 3000,
          blockResults: [{ blockId: 'singles', bpm: 120, done: true, clean: true }],
          metrics: { cleanBpmSingles16: 120 },
        },
      },
      {
        log: {
          completedAt: 2000,
          blockResults: [{ blockId: 'singles', bpm: 118, done: true, clean: true }],
          metrics: { cleanBpmSingles16: 118 },
        },
      },
    ];

    expect(api._test.getProgressionBpm(singles, logs)).toBe(122);

    const state = api._test.makeSessionState('balanced_25', {
      dateKey: '2026-06-09',
      logs,
    });
    expect(state.results.find((result) => result.blockId === 'singles').bpm).toBe(122);
  });

  it('does not add a progression step after a dirty recent attempt', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const logs = [
      { log: { completedAt: 3000, blockResults: [{ blockId: 'singles', bpm: 124, done: true, clean: false }] } },
      { log: { completedAt: 2000, blockResults: [{ blockId: 'singles', bpm: 118, done: true, clean: true }] } },
      { log: { completedAt: 1000, blockResults: [{ blockId: 'singles', bpm: 116, done: true, clean: true }] } },
    ];

    expect(api._test.getProgressionBpm(singles, logs)).toBe(118);
  });

  it('derives clean BPM metrics from completed metric blocks', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('speed_breakthrough_30', {
      dateKey: '2026-06-09',
      logs: [],
    });
    const singles = state.results.find((result) => result.blockId === 'singles');
    singles.done = true;
    singles.clean = true;
    singles.bpm = 126;
    const doubles = state.results.find((result) => result.blockId === 'doubles');
    doubles.done = true;
    doubles.clean = true;
    doubles.bpm = 102;
    state.metrics.cleanBpmSingles16 = 120;
    state.metrics.cleanBpmDoubles16 = 0;

    const metrics = api._test.deriveMetricsFromResults(state.sessionId, state.results, state.metrics);
    expect(metrics.cleanBpmSingles16).toBe(126);
    expect(metrics.cleanBpmDoubles16).toBe(102);

    const log = api._test.buildHobbyLog(state);
    expect(log.metrics.cleanBpmSingles16).toBe(126);
    expect(log.metrics.cleanBpmDoubles16).toBe(102);
  });

  it('converts a 20-second one-hand tap test into BPM metrics', () => {
    const { api } = setupModule();

    expect(api._test.getTapBpm(40, 20)).toBe(120);
    expect(api._test.applyTapCountToMetrics({}, 'right', 37, 20).oneHandFingerTapBpmRight).toBe(111);
    expect(api._test.applyTapCountToMetrics({}, 'left', 35, 20).oneHandFingerTapBpmLeft).toBe(105);
  });

  it('saves session into hobby training without changing it to strength/fingers', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('micro_15', {
      dateKey: '2026-06-09',
      trainingIndex: 1,
    });
    state.metrics.tensionScore = 4;
    api._test.saveSessionToTraining(state);

    const saved = api._test.readDay('2026-06-09').day.trainings[1];
    expect(saved.type).toBe('hobby');
    expect(saved.hobbySubtype).toBe('drums_finger_control');
    expect(saved.hobbyLog.sessionId).toBe('micro_15');
    expect(saved.z[0]).toBe(15);
  });

  it('writes scoped day only when a current client is selected', () => {
    const cid = '12345678-aaaa-bbbb-cccc-1234567890ab';
    const { api, store } = setupModule({ clientId: cid });
    api._test.writeDay('2026-06-09', { date: '2026-06-09', trainings: [] });

    expect(store.has(`heys_${cid}_dayv2_2026-06-09`)).toBe(true);
    expect(store.has('heys_dayv2_2026-06-09')).toBe(false);
  });

  it('does not read unscoped base day while a current client is selected', () => {
    const cid = '12345678-aaaa-bbbb-cccc-1234567890ab';
    const { api, store } = setupModule({ clientId: cid });
    store.set(
      'heys_dayv2_2026-06-09',
      JSON.stringify({ date: '2026-06-09', trainings: [{ hobbySubtype: 'drums_finger_control' }] }),
    );

    const read = api._test.readDay('2026-06-09');
    expect(read.key).toBe(`heys_${cid}_dayv2_2026-06-09`);
    expect(read.day.trainings).toEqual([]);
  });

  it('scanLogs ignores other clients and unscoped days in scoped context', () => {
    const cid = '12345678-aaaa-bbbb-cccc-1234567890ab';
    const otherCid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const { api, store } = setupModule({ clientId: cid });
    const makeDay = (sessionId, bpm) => ({
      date: '2026-06-09',
      trainings: [
        {
          type: 'hobby',
          hobbySubtype: 'drums_finger_control',
          hobbyLog: {
            moduleId: 'drums_finger_control',
            sessionId,
            completedAt: bpm,
            totalDurationMinutes: 25,
            metrics: { cleanBpmSingles16: bpm },
            blockResults: [],
          },
        },
      ],
    });

    store.set(`heys_${cid}_dayv2_2026-06-09`, JSON.stringify(makeDay('balanced_25', 120)));
    store.set(`heys_${otherCid}_dayv2_2026-06-09`, JSON.stringify(makeDay('speed_breakthrough_30', 140)));
    store.set('heys_dayv2_2026-06-09', JSON.stringify(makeDay('micro_15', 160)));

    const logs = api.scanLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].log.sessionId).toBe('balanced_25');
    expect(api.summarizeProgress(logs).bestSingles).toBe(120);
  });

  it('scopes active session recovery by current client', () => {
    const cid = '12345678-aaaa-bbbb-cccc-1234567890ab';
    const otherCid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const { api, store } = setupModule({ clientId: cid });
    store.set(
      'heys_drums_finger_active_session',
      JSON.stringify({ moduleId: 'drums_finger_control', sessionId: 'micro_15' }),
    );
    store.set(
      `heys_${otherCid}_drums_finger_active_session`,
      JSON.stringify({ moduleId: 'drums_finger_control', sessionId: 'speed_breakthrough_30' }),
    );

    expect(api._test.readActiveSession()).toBeNull();

    api._test.writeActiveSession(api._test.makeSessionState('balanced_25', { dateKey: '2026-06-09' }));
    expect(store.has(`heys_${cid}_drums_finger_active_session`)).toBe(true);
    expect(store.has('heys_drums_finger_active_session')).toBe(false);
    expect(api._test.readActiveSession().sessionId).toBe('balanced_25');
  });

  it('stores interrupted active session as paused without count-in', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', { dateKey: '2026-06-09' });
    state.running = true;
    state.countInSec = 3;

    api._test.writeActiveSession(state);

    const saved = api._test.readActiveSession();
    expect(saved.running).toBe(false);
    expect(saved.countInSec).toBe(0);
  });

  it('uses active session date when resume does not match opened date', () => {
    const { api } = setupModule();
    const active = api._test.makeSessionState('micro_15', {
      dateKey: '2026-06-08',
      trainingIndex: 3,
    });
    api._test.writeActiveSession(active);

    const initial = api._test.buildInitialAppState({
      dateKey: '2026-06-09',
      trainingIndex: 0,
      mode: 'new',
    });

    expect(initial.resume.dateKey).toBe('2026-06-08');
    expect(initial.state.dateKey).toBe('2026-06-08');
    expect(initial.state.trainingIndex).toBe(3);
    expect(initial.state.sessionId).toBe('micro_15');
  });

  it('restores edit state from a completed hobbyLog', () => {
    const { api } = setupModule();
    const training = {
      hobbySubtype: 'drums_finger_control',
      hobbyLog: {
        moduleId: 'drums_finger_control',
        sessionId: 'micro_15',
        startedAt: 1000,
        pain: true,
        note: 'left hand felt stiff',
        metrics: { cleanBpmSingles16: 118, tensionScore: 6, forearmPumpScore: 5, soundEvenness: 3 },
        blockResults: [
          { blockId: 'singles', bpm: 118, clean: true, done: true, tension: 4, sound: 4, note: 'ok' },
        ],
      },
    };

    const state = api._test.makeSessionStateFromLog(training, {
      dateKey: '2026-06-09',
      trainingIndex: 2,
    });

    expect(state.sessionId).toBe('micro_15');
    expect(state.trainingIndex).toBe(2);
    expect(state.metrics.cleanBpmSingles16).toBe(118);
    expect(state.results.find((result) => result.blockId === 'singles').done).toBe(true);
    expect(state.pain).toBe(true);
    expect(state.note).toBe('left hand felt stiff');
  });

  it('summarizes progress and downshifts recommendation after high tension', () => {
    const { api } = setupModule();
    const logs = [
      {
        dateKey: '2026-06-09',
        log: {
          sessionId: 'speed_breakthrough_30',
          totalDurationMinutes: 30,
          completedAt: Date.now(),
          metrics: { cleanBpmSingles16: 120, cleanBpmDoubles16: 90, tensionScore: 8 },
          blockResults: [{ clean: true }, { clean: false }],
        },
      },
    ];

    const stats = api.summarizeProgress(logs);
    expect(stats.totalSessions).toBe(1);
    expect(stats.bestSingles).toBe(120);
    expect(stats.cleanRate).toBe(50);
    expect(stats.nextSuggestion).toBe('low_tension_rebuild_23');
  });

  it('downshifts recommendation after a pain safety stop', () => {
    const { api } = setupModule();
    const logs = [
      {
        dateKey: '2026-06-10',
        log: {
          sessionId: 'balanced_25',
          totalDurationMinutes: 25,
          completedAt: 3000,
          pain: true,
          safetyStop: true,
          metrics: { tensionScore: 4, cleanBpmSingles16: 130 },
          blockResults: [{ clean: true }],
        },
      },
      {
        dateKey: '2026-06-09',
        log: {
          sessionId: 'balanced_25',
          totalDurationMinutes: 25,
          completedAt: 2000,
          metrics: { tensionScore: 4, cleanBpmSingles16: 128 },
          blockResults: [{ clean: true }],
        },
      },
      {
        dateKey: '2026-06-08',
        log: {
          sessionId: 'balanced_25',
          totalDurationMinutes: 25,
          completedAt: 1000,
          metrics: { tensionScore: 4, cleanBpmSingles16: 126 },
          blockResults: [{ clean: true }],
        },
      },
    ];

    expect(api.summarizeProgress(logs).nextSuggestion).toBe('low_tension_rebuild_23');
  });

  it('applies pain safety gate before finish and persists safety fields', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('speed_breakthrough_30', {
      dateKey: '2026-06-09',
      logs: [],
    });
    state.running = true;
    state.countInSec = 2;
    state.metrics.tensionScore = 3;
    state.metrics.forearmPumpScore = 2;

    const safe = api._test.applyPainSafetyGate(state);
    expect(safe.pain).toBe(true);
    expect(safe.safetyStop).toBe(true);
    expect(safe.running).toBe(false);
    expect(safe.countInSec).toBe(0);
    expect(safe.metrics.tensionScore).toBe(7);
    expect(safe.metrics.forearmPumpScore).toBe(5);

    const log = api._test.buildHobbyLog(safe);
    expect(log.pain).toBe(true);
    expect(log.safetyStop).toBe(true);
    expect(log.safetyRestDays).toBe(2);
  });

  it('can clear resumable active session when pain safety gate fires', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', {
      dateKey: '2026-06-09',
      logs: [],
    });
    api._test.writeActiveSession(state);
    expect(api._test.readActiveSession().sessionId).toBe('balanced_25');

    const safe = api._test.applyPainSafetyGate(state);
    api._test.clearActiveSession();

    expect(safe.safetyStop).toBe(true);
    expect(api._test.readActiveSession()).toBeNull();
  });

  it('calculates streak with local dates and today grace day', () => {
    const { api } = setupModule();
    const todayLateLocal = new Date(2026, 5, 10, 23, 30, 0);

    expect(api._test.calculateStreak(new Set(['2026-06-10', '2026-06-09']), todayLateLocal)).toBe(2);
    expect(api._test.calculateStreak(new Set(['2026-06-09']), todayLateLocal)).toBe(1);
    expect(api._test.calculateStreak(new Set(['2026-06-08']), todayLateLocal)).toBe(0);
  });

  it('keeps existing block progress when switching into low tension session', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('speed_breakthrough_30', {
      dateKey: '2026-06-09',
    });
    const singles = state.results.find((result) => result.blockId === 'singles');
    singles.done = true;
    singles.clean = true;
    singles.bpm = 126;
    const doubles = state.results.find((result) => result.blockId === 'doubles');
    doubles.done = true;
    doubles.clean = true;
    doubles.bpm = 104;
    const burst = state.results.find((result) => result.blockId === 'burst_8_8');
    burst.done = true;
    burst.bpm = 140;
    state.activeIndex = 4;
    state.running = true;

    const next = api._test.copySessionProgressToSession(state, 'low_tension_rebuild_23');

    expect(next.sessionId).toBe('low_tension_rebuild_23');
    expect(next.running).toBe(false);
    expect(next.activeIndex).toBe(0);
    expect(next.results.find((result) => result.blockId === 'singles')).toBeUndefined();
    const kept = next.results.find((result) => result.blockId === 'doubles');
    expect(kept.done).toBe(true);
    expect(kept.clean).toBe(true);
    expect(kept.bpm).toBe(104);
    expect(next.results.find((result) => result.blockId === 'burst_8_8')).toBeUndefined();
  });

  it('counts speed sessions against the weekly limit', () => {
    const { api } = setupModule();
    const today = api._test.localDateKey(new Date());
    const logs = [1, 2].map((n) => ({
      dateKey: today,
      log: {
        sessionId: 'speed_breakthrough_30',
        totalDurationMinutes: 30,
        completedAt: n,
        metrics: { tensionScore: 4 },
        blockResults: [],
      },
    }));

    const stats = api.summarizeProgress(logs);
    expect(stats.weeklySessionCounts.speed_breakthrough_30).toBe(2);
    expect(stats.nextSuggestion).toBe('balanced_25');
  });

  it('builds subdivision-aware metronome intervals', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const freeStroke = api.BLOCKS.find((block) => block.id === 'free_stroke');

    expect(api._test.getMetronomeIntervalSec(singles, 120, 0)).toBeCloseTo(0.125, 5);
    expect(api._test.getMetronomeIntervalSec(freeStroke, 120, 0)).toBeCloseTo(0.25, 5);
  });

  it('alternates fast and slow burst intervals', () => {
    const { api } = setupModule();
    const burst = api.BLOCKS.find((block) => block.id === 'burst_8_8');

    expect(api._test.getMetronomeIntervalSec(burst, 120, 0)).toBeCloseTo(0.0625, 5);
    expect(api._test.getMetronomeIntervalSec(burst, 120, 7)).toBeCloseTo(0.0625, 5);
    expect(api._test.getMetronomeIntervalSec(burst, 120, 8)).toBeCloseTo(0.125, 5);
  });

  it('marks bar, beat, accent, and subdivision notes', () => {
    const { api } = setupModule();
    const moeller = api.BLOCKS.find((block) => block.id === 'moeller_fingers');
    const singles = api.BLOCKS.find((block) => block.id === 'singles');

    expect(api._test.getMetronomeNoteKind(moeller, 0)).toBe('bar');
    expect(api._test.getMetronomeNoteKind(moeller, 4)).toBe('accent');
    expect(api._test.getMetronomeNoteKind(singles, 4)).toBe('beat');
    expect(api._test.getMetronomeNoteKind(singles, 1)).toBe('sub');
  });

  it('expands one-line notation patterns for all drum blocks', () => {
    const { api } = setupModule();
    const expected = {
      free_stroke: { length: 8, first: 'R', second: 'L', rests: 0 },
      finger_rebound: { length: 8, first: 'R', second: 'R', rests: 0 },
      singles: { length: 16, first: 'R', second: 'L', rests: 0 },
      doubles: { length: 16, first: 'R', second: 'R', rests: 0 },
      moeller_fingers: { length: 16, first: 'R', second: 'L', rests: 0 },
      burst_8_8: { length: 16, first: 'R', second: 'L', rests: 8 },
      buzz_roll: { length: 4, first: 'R', second: 'L', rests: 0 },
      improv_pad: { length: 8, first: 'R', second: 'L', rests: 2 },
    };

    api.BLOCKS.forEach((block) => {
      const pattern = api._test.expandBlockPattern(block);
      expect(pattern).toHaveLength(expected[block.id].length);
      expect(pattern[0].sticking).toBe(expected[block.id].first);
      expect(pattern[1].sticking).toBe(expected[block.id].second);
      expect(pattern.filter((note) => note.rest)).toHaveLength(expected[block.id].rests);
    });
  });

  it('keeps technique annotations with motion drawings for every drum block', () => {
    const { api } = setupModule();

    api.BLOCKS.forEach((block) => {
      expect(block.technique?.summary).toEqual(expect.any(String));
      expect(block.technique.summary.length).toBeGreaterThan(12);
      expect(block.technique?.motion?.length).toBeGreaterThan(0);
      expect(block.technique?.checkpoints?.length).toBeGreaterThan(0);
      block.technique.motion.forEach((step) => {
        expect(['down', 'up', 'tap', 'full', 'buzz', 'rest']).toContain(step.stroke);
        expect(step.label).toEqual(expect.any(String));
        expect(step.text).toEqual(expect.any(String));
      });
    });

    const doubles = api.BLOCKS.find((block) => block.id === 'doubles');
    expect(doubles.technique.motion.map((step) => step.stroke)).toEqual([
      'down',
      'up',
      'down',
      'up',
    ]);

    const moeller = api.BLOCKS.find((block) => block.id === 'moeller_fingers');
    expect(moeller.technique.motion.map((step) => step.stroke)).toEqual([
      'down',
      'tap',
      'tap',
      'up',
    ]);
  });

  it('keeps notation accents aligned with metronome accent kinds', () => {
    const { api } = setupModule();

    api.BLOCKS.forEach((block) => {
      api._test.expandBlockPattern(block).forEach((note, index) => {
        const kind = api._test.getMetronomeNoteKind(block, index);
        expect(note.accent).toBe(kind === 'bar' || kind === 'accent');
      });
    });
  });

  it('maps metronome noteIndex to notation playback position', () => {
    const { api } = setupModule();
    const moeller = api.BLOCKS.find((block) => block.id === 'moeller_fingers');
    const burst = api.BLOCKS.find((block) => block.id === 'burst_8_8');

    expect(api._test.getPlaybackPosition(moeller, 4)).toMatchObject({
      barIndex: 0,
      noteInBar: 4,
      sticking: 'R',
      accent: true,
      kind: 'accent',
    });
    expect(api._test.getPlaybackPosition(moeller, 16)).toMatchObject({
      barIndex: 1,
      noteInBar: 0,
      sticking: 'R',
      accent: true,
      kind: 'bar',
    });
    expect(api._test.getPlaybackPosition(burst, 8)).toMatchObject({
      noteInBar: 8,
      sticking: null,
      rest: true,
    });
  });

  it('builds rolling two-bar notation windows and previews the next block at boundaries', () => {
    const { api } = setupModule();
    const session = api.expandSession('micro_15');
    session.blockItems[0].targetSec = 8;
    const state = api._test.makeSessionState('micro_15', { logs: [] });
    state.results[0].bpm = 120;

    const first = api._test.getNotationWindow(session, 0, 0, { results: state.results });
    expect(first.active).toHaveLength(16);
    expect(first.preview).toHaveLength(16);
    expect(first.activeStart).toBe(0);
    expect(first.previewIsNextBlock).toBe(false);

    const boundary = api._test.getNotationWindow(session, 0, 16, { results: state.results });
    expect(boundary.activeStart).toBe(16);
    expect(boundary.active[0].absoluteIndex).toBe(16);
    expect(boundary.previewIsNextBlock).toBe(true);
    expect(boundary.preview[0].blockId).toBe('singles');
    expect(boundary.preview[0].absoluteIndex).toBe(0);
  });

  it('marks upcoming ramp BPM in notation preview windows', () => {
    const { api } = setupModule();
    const session = api.expandSession('balanced_25');
    const singlesIndex = session.blockItems.findIndex((block) => block.id === 'singles');
    const state = api._test.makeSessionState('balanced_25', { logs: [] });
    const result = state.results[singlesIndex];
    result.bpm = 120;
    result.rampEnabled = true;

    const window = api._test.getNotationWindow(session, singlesIndex, 96, { results: state.results });
    expect(window.preview[0].bpmMarker).toBe('122 BPM');
  });

  it('drops stale metronome notes after background throttling', () => {
    const { api } = setupModule();
    const cursor = { nextNoteTime: 10, noteIndex: 32 };

    api._test.resyncMetronomeCursor(cursor, 10.15);
    expect(cursor.nextNoteTime).toBe(10);

    api._test.resyncMetronomeCursor(cursor, 10.25);
    expect(cursor.nextNoteTime).toBeCloseTo(10.27, 5);
    expect(cursor.noteIndex).toBe(32);
  });

  it('scales metronome tick gain by volume and defaults to max volume', () => {
    const { api } = setupModule();
    const peaks = [];
    const makeCtx = () => ({
      currentTime: 1,
      destination: {},
      createOscillator() {
        return {
          type: '',
          frequency: { setValueAtTime() {} },
          connect(gain) {
            return gain;
          },
          start() {},
          stop() {},
        };
      },
      createGain() {
        return {
          gain: {
            setValueAtTime() {},
            exponentialRampToValueAtTime(value) {
              peaks.push(value);
            },
          },
          connect(destination) {
            return destination;
          },
        };
      },
    });

    api._test.scheduleTick(makeCtx(), 1, 'bar');
    api._test.scheduleTick(makeCtx(), 1, 'bar', 0.5);
    api._test.scheduleTick(makeCtx(), 1, 'sub', 0);

    expect(peaks[0]).toBeCloseTo(0.18, 5);
    expect(peaks[2]).toBeCloseTo(0.09, 5);
    expect(peaks[4]).toBeCloseTo(0.0001, 5);
  });

  it('applies and rolls back tempo ramp steps', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const result = api._test.makeInitialBlockResult(singles);
    result.bpm = 120;
    result.rampEnabled = true;
    const eightBarsAt120 = 16;

    const step = api._test.getRampStep(singles, result, eightBarsAt120);
    expect(step.bpm).toBe(122);
    expect(step.bars).toBe(8);

    const applied = api._test.applyRampStep(result, step);
    expect(applied.bpm).toBe(122);
    expect(applied.rampLastBpm).toBe(120);
    expect(applied.rampBars).toBe(8);

    const rolledBack = api._test.rollbackRamp(applied);
    expect(rolledBack.bpm).toBe(120);
    expect(rolledBack.clean).toBe(false);
    expect(rolledBack.rampEnabled).toBe(false);
  });

  it('arms warmup phase when a clean record exists for the block', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const logs = [
      {
        log: {
          completedAt: 3000,
          blockResults: [{ blockId: 'singles', bpm: 120, done: true, clean: true }],
          metrics: { cleanBpmSingles16: 120 },
        },
      },
      {
        log: {
          completedAt: 2000,
          blockResults: [{ blockId: 'singles', bpm: 118, done: true, clean: true }],
          metrics: { cleanBpmSingles16: 118 },
        },
      },
    ];

    const state = api._test.makeSessionState('balanced_25', { logs });
    const singlesResult = state.results.find((result) => result.blockId === 'singles');
    expect(singlesResult.bpm).toBe(122);
    expect(singlesResult.phase).toBe('warmup');
    expect(singlesResult.warmupTotalSec).toBeGreaterThan(0);
    expect(singlesResult.warmupStartBpm).toBe(Math.max(singles.bpm, 122 - 20));
  });

  it('skips warmup when there is no clean record (first attempt)', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', { logs: [] });
    const freeStroke = state.results.find((result) => result.blockId === 'free_stroke');
    expect(freeStroke.phase).toBe('work');
    expect(freeStroke.warmupTotalSec).toBe(0);
  });

  it('interpolates effective BPM linearly across warmup countdown', () => {
    const { api } = setupModule();
    const result = {
      bpm: 122,
      phase: 'warmup',
      warmupTotalSec: 90,
      warmupStartBpm: 102,
    };
    expect(api._test.getEffectiveBpm(result, 90)).toBe(102);
    expect(api._test.getEffectiveBpm(result, 45)).toBe(112);
    expect(api._test.getEffectiveBpm(result, 0)).toBe(122);
    expect(api._test.getEffectiveBpm({ ...result, phase: 'work' }, 45)).toBe(122);
  });

  it('finishWarmup transitions phase to work without touching BPM target', () => {
    const { api } = setupModule();
    const result = { bpm: 122, phase: 'warmup', warmupTotalSec: 90, warmupStartBpm: 102 };
    const next = api._test.finishWarmup(result);
    expect(next.phase).toBe('work');
    expect(next.bpm).toBe(122);
    expect(next.warmupTotalSec).toBe(90);
  });

  it('disableWarmupForReplay clears warmup and resets done/clean for restart', () => {
    const { api } = setupModule();
    const result = { bpm: 122, phase: 'warmup', warmupTotalSec: 90, warmupStartBpm: 102, done: true, clean: true };
    const replay = api._test.disableWarmupForReplay(result, 119);
    expect(replay.phase).toBe('work');
    expect(replay.warmupTotalSec).toBe(0);
    expect(replay.bpm).toBe(119);
    expect(replay.done).toBe(false);
    expect(replay.clean).toBe(false);
  });

  it('initial remaining sec uses warmup duration for armed blocks', () => {
    const { api } = setupModule();
    const singles = api.BLOCKS.find((block) => block.id === 'singles');
    const armed = { bpm: 122, phase: 'warmup', warmupTotalSec: 90, warmupStartBpm: 102 };
    expect(api._test.getInitialRemainingSec({ targetSec: 300 }, armed)).toBe(90);
    expect(api._test.getInitialRemainingSec({ targetSec: 300 }, { ...armed, phase: 'work' })).toBe(300);
    expect(api._test.getInitialRemainingSec(singles, { phase: 'work' })).toBe(Math.max(1, singles.targetSec || 60));
  });

  it('summarizes per-block progress: best clean, attempts, recent trend', () => {
    const { api } = setupModule();
    const logs = [
      {
        dateKey: '2026-06-13',
        log: {
          completedAt: 5000,
          sessionId: 'balanced_25',
          sessionLabel: 'Balanced 25',
          blockResults: [
            { blockId: 'singles', bpm: 126, done: true, clean: true },
            { blockId: 'doubles', bpm: 108, done: true, clean: true },
          ],
        },
      },
      {
        dateKey: '2026-06-10',
        log: {
          completedAt: 4000,
          sessionId: 'balanced_25',
          sessionLabel: 'Balanced 25',
          blockResults: [
            { blockId: 'singles', bpm: 124, done: true, clean: true },
            { blockId: 'singles', bpm: 130, done: true, clean: false },
          ],
        },
      },
      {
        dateKey: '2026-06-05',
        log: {
          completedAt: 3000,
          sessionId: 'speed_breakthrough_30',
          sessionLabel: 'Speed 30',
          blockResults: [{ blockId: 'singles', bpm: 120, done: true, clean: true }],
        },
      },
    ];

    const singles = api._test.summarizeBlockProgress('singles', logs);
    expect(singles.bestClean).toBe(126);
    expect(singles.cleanAttempts).toBe(3);
    expect(singles.totalAttempts).toBe(4);
    expect(singles.lastAttempt.bpm).toBe(126);
    expect(singles.recent.length).toBeGreaterThan(0);
    expect(singles.recent[singles.recent.length - 1].bpm).toBe(126);
    expect(singles.bestCleanDateKey).toBe('2026-06-13');

    const empty = api._test.summarizeBlockProgress('finger_rebound', logs);
    expect(empty.bestClean).toBe(0);
    expect(empty.totalAttempts).toBe(0);
  });

  it('appendBlockPR persists per-block PRs to LS even without finishing the session', () => {
    const { api, store } = setupModule();
    api._test.appendBlockPR({
      blockId: 'singles',
      bpm: 105,
      clean: true,
      completedAt: 1717000000000,
      dateKey: '2026-06-13',
      sessionId: 'balanced_25',
      sessionLabel: 'Balanced 25',
    });
    const written = JSON.parse(store.get('heys_drums_block_prs_v1') || '[]');
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ blockId: 'singles', bpm: 105, clean: true });

    const summary = api._test.summarizeBlockProgress('singles', []);
    expect(summary.bestClean).toBe(105);
    expect(summary.totalAttempts).toBe(1);
    expect(summary.cleanAttempts).toBe(1);
  });

  it('merges block PR log with day logs without double-counting same attempt', () => {
    const { api } = setupModule();
    const completedAt = 1717100000000;
    api._test.appendBlockPR({
      blockId: 'doubles',
      bpm: 95,
      clean: true,
      completedAt,
      dateKey: '2026-06-13',
      sessionId: 'balanced_25',
    });
    const logs = [
      {
        dateKey: '2026-06-13',
        log: {
          completedAt,
          blockResults: [{ blockId: 'doubles', bpm: 95, done: true, clean: true }],
        },
      },
    ];
    const history = api._test.getBlockHistory('doubles', logs);
    expect(history).toHaveLength(1);
    expect(history[0].bpm).toBe(95);
  });

  it('block PR log only counts most recent record per fix (capped at 500)', () => {
    const { api, store } = setupModule();
    for (let i = 0; i < 510; i += 1) {
      api._test.appendBlockPR({
        blockId: 'singles',
        bpm: 80 + (i % 30),
        clean: true,
        completedAt: 1717200000000 + i,
        dateKey: '2026-06-13',
      });
    }
    const written = JSON.parse(store.get('heys_drums_block_prs_v1') || '[]');
    expect(written).toHaveLength(500);
  });

  it('getBlockHistory returns attempts sorted from newest to oldest', () => {
    const { api } = setupModule();
    const logs = [
      {
        dateKey: '2026-06-01',
        log: {
          completedAt: 1000,
          blockResults: [{ blockId: 'doubles', bpm: 100, done: true, clean: true }],
        },
      },
      {
        dateKey: '2026-06-08',
        log: {
          completedAt: 5000,
          blockResults: [{ blockId: 'doubles', bpm: 110, done: true, clean: false }],
        },
      },
      {
        dateKey: '2026-06-05',
        log: {
          completedAt: 3000,
          blockResults: [{ blockId: 'doubles', bpm: 104, done: true, clean: true }],
        },
      },
    ];

    const history = api._test.getBlockHistory('doubles', logs);
    expect(history.map((row) => row.bpm)).toEqual([110, 104, 100]);
    expect(history.map((row) => row.clean)).toEqual([false, true, true]);
  });

  it('persists warmup phase fields in hobbyLog blockResults', () => {
    const { api } = setupModule();
    const state = api._test.makeSessionState('balanced_25', {
      dateKey: '2026-06-13',
      logs: [
        {
          log: {
            completedAt: 3000,
            blockResults: [{ blockId: 'singles', bpm: 120, done: true, clean: true }],
          },
        },
        {
          log: {
            completedAt: 2000,
            blockResults: [{ blockId: 'singles', bpm: 118, done: true, clean: true }],
          },
        },
      ],
    });
    const singlesIndex = state.results.findIndex((r) => r.blockId === 'singles');
    state.results[singlesIndex].done = true;
    state.results[singlesIndex].clean = true;

    const log = api._test.buildHobbyLog(state);
    const persisted = log.blockResults.find((r) => r.blockId === 'singles');
    expect(persisted.phase).toBe('warmup');
    expect(persisted.warmupTotalSec).toBeGreaterThan(0);
    expect(persisted.warmupStartBpm).toBeGreaterThan(0);
    expect(persisted.bpm).toBe(122);
  });
});
