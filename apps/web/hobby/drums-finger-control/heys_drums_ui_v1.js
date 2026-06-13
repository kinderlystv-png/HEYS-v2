// heys_drums_ui_v1.js — React UI and public API for drum pad finger control.
;(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const Hobby = (HEYS.Hobby = HEYS.Hobby || {});
  const DFC = (Hobby._drumsInternal = Hobby._drumsInternal || {});
  const React = global.React;
  const ReactDOM = global.ReactDOM;

  if (Hobby.DrumsFingerControl && Hobby.DrumsFingerControl.__registered) return;

  const {
    MODULE_ID,
    ROOT_ID,
    COUNT_IN_SEC,
    TAP_TEST_SECONDS,
    METRONOME_LOOKAHEAD_MS,
    METRONOME_SCHEDULE_AHEAD_SEC,
    BLOCKS,
    SESSIONS,
    clampNumber,
    safeDateKey,
    localDateKey,
    getSession,
    expandSession,
    isDrumsTraining,
    formatMinutes,
    getSubdivisionConfig,
    normalizeSessionMetrics,
    getProgressionBpm,
    getInitialRemainingSec,
    getEffectiveBpm,
    finishWarmup,
    disableWarmupForReplay,
    deriveMetricsFromResults,
    getTapBpm,
    applyTapCountToMetrics,
    makeInitialTapTest,
    applyPainSafetyGate,
    makeSessionStateFromLog,
    makeSessionState,
    makeInitialBlockResult,
    copySessionProgressToSession,
    calculateStreak,
    getMetronomeIntervalSec,
    getMetronomeNoteKind,
    expandBlockPattern,
    getPlaybackPosition,
    getNotationWindow,
    resyncMetronomeCursor,
    getRampStep,
    applyRampStep,
    rollbackRamp,
    summarizeProgress,
    getBlockHistory,
    summarizeBlockProgress,
    buildHobbyLog,
    saveSessionToTraining,
    buildInitialAppState,
    scheduleTick,
    playTick,
    getMetronomeContext,
    scanLogs,
    readDay,
    writeDay,
    readActiveSession,
    writeActiveSession,
    clearActiveSession,
    getActiveSessionKeys,
    readBlockPRLog,
    appendBlockPR,
    NotationPanel,
  } = DFC;

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
    const [soundVolume, setSoundVolume] = useState(100);
    const [savedLog, setSavedLog] = useState(null);
    const [progressSeed, setProgressSeed] = useState(0);
    const [pendingConfirm, setPendingConfirm] = useState({ open: false, bpm: 0 });
    const [progressBlockId, setProgressBlockId] = useState(null);
    const [schematicVariant, setSchematicVariantState] = useState(function () {
      try {
        const stored = HEYS?.utils?.lsGet?.('heys_drums_schematic_variant', 'animated');
        if (stored === 'storyboard' || stored === 'video' || stored === 'animated') return stored;
      } catch (_) {
        /* noop */
      }
      return 'animated';
    });
    function setSchematicVariant(value) {
      const safe = value === 'storyboard' || value === 'video' ? value : 'animated';
      setSchematicVariantState(safe);
      try {
        HEYS?.utils?.lsSet?.('heys_drums_schematic_variant', safe);
      } catch (_) {
        /* noop */
      }
    }
    const metronomeRef = useRef({ nextNoteTime: 0, noteIndex: 0, scheduledNotes: [], ctx: null });
    const effectiveBpmRef = useRef(0);

    const session = expandSession(sessionState.sessionId);
    const activeBlock = session.blockItems[sessionState.activeIndex] || session.blockItems[0];
    const activeResult = sessionState.results[sessionState.activeIndex] || makeInitialBlockResult(activeBlock);
    const completedCount = sessionState.results.filter((result) => result.done).length;
    const progress = Math.round((completedCount / Math.max(1, sessionState.results.length)) * 100);
    const isWarmup = activeResult.phase === 'warmup' && Number(activeResult.warmupTotalSec) > 0;
    const effectiveBpm = getEffectiveBpm(activeResult, sessionState.remainingSec);
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
        metronomeRef.current = {
          nextNoteTime: ctx.currentTime + 0.02,
          noteIndex: 0,
          scheduledNotes: [],
          ctx,
        };
        const id = global.setInterval(function () {
          const cursor = metronomeRef.current;
          const beforeResync = cursor.nextNoteTime;
          resyncMetronomeCursor(cursor, ctx.currentTime);
          if (cursor.nextNoteTime !== beforeResync) cursor.scheduledNotes = [];
          while (cursor.nextNoteTime < ctx.currentTime + METRONOME_SCHEDULE_AHEAD_SEC) {
            const scheduledTime = cursor.nextNoteTime;
            const scheduledIndex = cursor.noteIndex;
            const kind = sessionState.countInSec ? 'bar' : getMetronomeNoteKind(activeBlock, cursor.noteIndex);
            scheduleTick(ctx, scheduledTime, kind, soundVolume / 100);
            cursor.scheduledNotes = (cursor.scheduledNotes || []).concat({ index: scheduledIndex, time: scheduledTime }).slice(-96);
            cursor.nextNoteTime += sessionState.countInSec ? 1 : getMetronomeIntervalSec(activeBlock, effectiveBpmRef.current || activeBlock?.bpm || 80, scheduledIndex);
            cursor.noteIndex += 1;
          }
        }, METRONOME_LOOKAHEAD_MS);
        return function () {
          global.clearInterval(id);
          metronomeRef.current.ctx = null;
        };
      },
      [screen, soundEnabled, soundVolume, sessionState.running, sessionState.countInSec, activeBlock?.id]
    );

    useEffect(function () {
      effectiveBpmRef.current = effectiveBpm;
    }, [effectiveBpm]);

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
            const results = prev.results.slice();
            const currentResult = results[prev.activeIndex] || makeInitialBlockResult(currentBlock);
            if (currentResult.phase === 'warmup' && Number(currentResult.warmupTotalSec) > 0) {
              if (nextSec === 0 && prev.remainingSec > 0) {
                results[prev.activeIndex] = finishWarmup(currentResult);
                try {
                  HEYS.__playRestDoneBeep?.();
                } catch (_) {
                  playTick(true, soundVolume / 100);
                }
                return {
                  ...prev,
                  results,
                  remainingSec: Math.max(1, Number(currentBlock?.targetSec) || 60),
                  running: true,
                };
              }
              return { ...prev, remainingSec: nextSec, running: nextSec > 0 ? prev.running : false };
            }
            const elapsedSec = Math.max(0, (currentBlock.targetSec || 0) - nextSec);
            const rampStep = getRampStep(currentBlock, currentResult, elapsedSec);
            if (rampStep) results[prev.activeIndex] = applyRampStep(currentResult, rampStep);
            if (nextSec === 0 && prev.remainingSec > 0) {
              try {
                HEYS.__playRestDoneBeep?.();
              } catch (_) {
                playTick(true, soundVolume / 100);
              }
            }
            return { ...prev, results, remainingSec: nextSec, running: nextSec > 0 ? prev.running : false };
          });
        }, 1000);
        return function () {
          global.clearInterval(id);
        };
      },
      [screen, soundVolume, sessionState.running, sessionState.activeIndex, sessionState.sessionId, activeBlock?.id]
    );

    useEffect(
      function () {
        if (screen !== 'run' || pendingConfirm.open) return undefined;
        if (sessionState.running || sessionState.countInSec) return undefined;
        if (Number(sessionState.remainingSec) !== 0) return undefined;
        const result = sessionState.results[sessionState.activeIndex];
        if (!result || result.phase !== 'work' || result.done) return undefined;
        setPendingConfirm({ open: true, bpm: clampNumber(result.bpm, 30, 260, activeBlock?.bpm || 80) });
        return undefined;
      },
      [
        screen,
        pendingConfirm.open,
        sessionState.running,
        sessionState.countInSec,
        sessionState.remainingSec,
        sessionState.activeIndex,
        sessionState.results,
        activeBlock?.bpm,
      ]
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

    function fixBlockAndAdvance(confirmedBpm) {
      const safeBpm = clampNumber(confirmedBpm, 30, 260, activeBlock?.bpm || 80);
      const fixedBlockId = activeBlock?.id;
      setSessionState(function (prev) {
        const results = prev.results.slice();
        const current = results[prev.activeIndex] || makeInitialBlockResult(activeBlock);
        results[prev.activeIndex] = { ...current, bpm: safeBpm, clean: true, done: true, phase: 'work' };
        const nextIndex = Math.min(prev.activeIndex + 1, results.length - 1);
        const nextBlock = session.blockItems[nextIndex] || activeBlock;
        const nextResult = results[nextIndex] || makeInitialBlockResult(nextBlock);
        return {
          ...prev,
          results,
          activeIndex: nextIndex,
          remainingSec: nextIndex === prev.activeIndex ? 0 : getInitialRemainingSec(nextBlock, nextResult),
          running: false,
          countInSec: 0,
        };
      });
      setPendingConfirm({ open: false, bpm: 0 });
      try {
        if (typeof appendBlockPR === 'function' && fixedBlockId) {
          appendBlockPR({
            blockId: fixedBlockId,
            bpm: safeBpm,
            clean: true,
            completedAt: Date.now(),
            dateKey: sessionState.dateKey || safeDateKey(),
            sessionId: session.id,
            sessionLabel: session.label,
          });
          setProgressSeed((n) => n + 1);
        }
      } catch (_) {
        /* noop */
      }
      try {
        navigator.vibrate?.(12);
      } catch (_) {
        /* noop */
      }
    }

    function replayCurrentAt(bpm) {
      setSessionState(function (prev) {
        const results = prev.results.slice();
        const current = results[prev.activeIndex] || makeInitialBlockResult(activeBlock);
        results[prev.activeIndex] = disableWarmupForReplay(current, bpm);
        return {
          ...prev,
          results,
          remainingSec: Math.max(1, Number(activeBlock?.targetSec) || 60),
          running: false,
          countInSec: 0,
        };
      });
      setPendingConfirm({ open: false, bpm: 0 });
    }

    function requestEarlyFinish() {
      if (pendingConfirm.open) return;
      const result = sessionState.results[sessionState.activeIndex];
      if (!result) return;
      setSessionState((prev) => ({ ...prev, running: false, countInSec: 0 }));
      const target = clampNumber(result.bpm, 30, 260, activeBlock?.bpm || 80);
      setPendingConfirm({ open: true, bpm: target });
    }

    function goToBlock(index) {
      const next = Math.max(0, Math.min(session.blockItems.length - 1, index));
      setSessionState(function (prev) {
        const nextResult = prev.results[next] || makeInitialBlockResult(session.blockItems[next]);
        return {
          ...prev,
          activeIndex: next,
          remainingSec: getInitialRemainingSec(session.blockItems[next], nextResult),
          running: false,
          countInSec: 0,
        };
      });
      setPendingConfirm({ open: false, bpm: 0 });
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
          'button',
          {
            type: 'button',
            className: 'drums-ft-progress-cta',
            onClick: () => {
              setProgressBlockId(null);
              setScreen('progress');
            },
          },
          h('span', { className: 'drums-ft-progress-cta__icon', 'aria-hidden': 'true' }, '📈'),
          h(
            'span',
            { className: 'drums-ft-progress-cta__body' },
            h('strong', null, 'Прогресс упражнений'),
            h('span', null, 'История BPM и рекорды по каждому блоку')
          ),
          h('span', { className: 'drums-ft-progress-cta__chev', 'aria-hidden': 'true' }, '›')
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

    function formatDateKey(dateKey) {
      if (!dateKey || typeof dateKey !== 'string') return '—';
      const parts = dateKey.split('-');
      if (parts.length !== 3) return dateKey;
      const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (Number.isNaN(m) || Number.isNaN(d)) return dateKey;
      return d + ' ' + (months[m - 1] || parts[1]);
    }

    function formatRelativeDate(ts) {
      if (!ts) return '—';
      const diffMs = Date.now() - Number(ts);
      if (diffMs < 0) return 'только что';
      const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
      if (days <= 0) return 'сегодня';
      if (days === 1) return 'вчера';
      if (days < 7) return days + ' дн назад';
      if (days < 30) return Math.floor(days / 7) + ' нед назад';
      if (days < 365) return Math.floor(days / 30) + ' мес назад';
      return Math.floor(days / 365) + ' г назад';
    }

    function Sparkline(props) {
      const data = Array.isArray(props.data) ? props.data : [];
      const width = props.width || 96;
      const height = props.height || 28;
      if (data.length < 2) {
        return h('span', { className: 'drums-ft-sparkline drums-ft-sparkline--empty' }, '—');
      }
      const values = data.map((point) => Number(point.bpm) || 0);
      const max = Math.max.apply(null, values);
      const min = Math.min.apply(null, values);
      const range = Math.max(1, max - min);
      const stepX = data.length === 1 ? 0 : width / (data.length - 1);
      const points = data
        .map((point, idx) => {
          const x = Math.round(idx * stepX);
          const y = Math.round(height - ((Number(point.bpm) || 0) - min) / range * (height - 4) - 2);
          return x + ',' + y;
        })
        .join(' ');
      const lastClean = data[data.length - 1]?.clean;
      return h(
        'svg',
        {
          className: 'drums-ft-sparkline' + (lastClean ? ' is-clean' : ''),
          width,
          height,
          viewBox: '0 0 ' + width + ' ' + height,
          'aria-hidden': 'true',
        },
        h('polyline', { points, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' })
      );
    }

    function BlockProgressCard(props) {
      const block = props.block;
      const summary = props.summary;
      const delta = summary.deltaMonth || 0;
      const deltaLabel = delta > 0 ? '+' + delta + ' BPM за 30 дней' : delta < 0 ? delta + ' BPM за 30 дней' : 'нет рекорда за 30 дней';
      return h(
        'button',
        {
          type: 'button',
          className: 'drums-ft-progress-card',
          onClick: props.onOpen,
        },
        h(
          'div',
          { className: 'drums-ft-progress-card__head' },
          h('strong', null, block.label),
          h('span', null, block.pattern || '')
        ),
        h(
          'div',
          { className: 'drums-ft-progress-card__body' },
          h(
            'div',
            { className: 'drums-ft-progress-card__metric' },
            h('strong', null, summary.bestClean || '—'),
            h('span', null, 'лучший чистый BPM')
          ),
          h(Sparkline, { data: summary.recent || [] })
        ),
        h(
          'div',
          { className: 'drums-ft-progress-card__foot' },
          h('span', null, deltaLabel),
          h('span', null, summary.lastAttempt ? 'попытка ' + formatRelativeDate(summary.lastAttempt.completedAt) : 'нет данных')
        )
      );
    }

    function ProgressScreen() {
      const logs = useMemo(function () {
        progressSeed;
        return scanLogs();
      }, [progressSeed]);
      const summaries = useMemo(function () {
        return BLOCKS.map((block) => ({ block, summary: summarizeBlockProgress(block.id, logs) }));
      }, [logs]);
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-progress-screen' },
        h(
          'header',
          { className: 'drums-ft-progress-screen__head' },
          h('button', { type: 'button', className: 'drums-ft-back-btn', onClick: () => setScreen('home') }, '‹ Назад'),
          h('strong', null, 'Прогресс упражнений'),
          h('span', null, 'Рекорды и тренд по каждому блоку')
        ),
        h(
          'div',
          { className: 'drums-ft-progress-grid' },
          summaries.map(({ block, summary }) =>
            h(BlockProgressCard, {
              key: block.id,
              block,
              summary,
              onOpen: () => {
                setProgressBlockId(block.id);
                setScreen('detail');
              },
            })
          )
        )
      );
    }

    function LineChart(props) {
      const data = Array.isArray(props.data) ? props.data.slice() : [];
      if (data.length < 1) {
        return h('div', { className: 'drums-ft-chart drums-ft-chart--empty' }, 'Нет данных');
      }
      const padX = 28;
      const padY = 18;
      const width = props.width || 320;
      const height = props.height || 160;
      const innerW = width - padX * 2;
      const innerH = height - padY * 2;
      const values = data.map((p) => Number(p.bpm) || 0);
      const max = Math.max.apply(null, values);
      const min = Math.min.apply(null, values);
      const range = Math.max(1, max - min);
      const stepX = data.length === 1 ? 0 : innerW / (data.length - 1);
      const yFor = (bpm) => padY + innerH - ((Number(bpm) || 0) - min) / range * innerH;
      const xFor = (i) => padX + i * stepX;
      const points = data.map((p, i) => xFor(i) + ',' + yFor(p.bpm)).join(' ');
      return h(
        'svg',
        {
          className: 'drums-ft-chart',
          width,
          height,
          viewBox: '0 0 ' + width + ' ' + height,
          role: 'img',
          'aria-label': 'BPM history line chart',
        },
        h('line', { x1: padX, x2: padX + innerW, y1: padY + innerH, y2: padY + innerH, className: 'drums-ft-chart__axis' }),
        h('line', { x1: padX, x2: padX, y1: padY, y2: padY + innerH, className: 'drums-ft-chart__axis' }),
        h('text', { x: 4, y: padY + 4, className: 'drums-ft-chart__label' }, max),
        h('text', { x: 4, y: padY + innerH, className: 'drums-ft-chart__label' }, min),
        h('polyline', { className: 'drums-ft-chart__line', points, fill: 'none', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round' }),
        data.map((p, i) =>
          h('circle', {
            key: i,
            className: 'drums-ft-chart__dot' + (p.clean ? ' is-clean' : ' is-dirty'),
            cx: xFor(i),
            cy: yFor(p.bpm),
            r: 3.5,
          })
        )
      );
    }

    function BlockDetailScreen() {
      const blockId = progressBlockId;
      const block = BLOCKS.find((b) => b.id === blockId) || BLOCKS[0];
      const logs = useMemo(function () {
        progressSeed;
        return scanLogs();
      }, [progressSeed]);
      const summary = useMemo(function () {
        return summarizeBlockProgress(block.id, logs);
      }, [block.id, logs]);
      const history = useMemo(function () {
        return getBlockHistory(block.id, logs);
      }, [block.id, logs]);
      const chartSeries = (summary.recent || []).map((p) => ({ bpm: p.bpm, clean: p.clean, completedAt: p.completedAt, dateKey: p.dateKey }));
      const target = summary.bestClean ? summary.bestClean + 2 : block.bpm || 80;
      return h(
        'div',
        { className: 'drums-ft__body drums-ft-progress-detail' },
        h(
          'header',
          { className: 'drums-ft-progress-screen__head' },
          h('button', { type: 'button', className: 'drums-ft-back-btn', onClick: () => setScreen('progress') }, '‹ Назад'),
          h('strong', null, block.label),
          h('span', null, block.goal || '')
        ),
        h(
          'section',
          { className: 'drums-ft-progress-summary' },
          h('div', { className: 'drums-ft-stat drums-ft-stat--accent' }, h('strong', null, summary.bestClean || '—'), h('span', null, 'лучший чистый BPM')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, summary.cleanAttempts), h('span', null, 'чистых попыток')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, summary.totalAttempts), h('span', null, 'всего попыток')),
          h('div', { className: 'drums-ft-stat' }, h('strong', null, summary.deltaMonth >= 0 ? '+' + summary.deltaMonth : summary.deltaMonth), h('span', null, 'BPM за 30 дней'))
        ),
        h(
          'section',
          { className: 'drums-ft-progress-target' },
          h('strong', null, 'Цель: превзойти ' + target + ' BPM'),
          h('span', null, summary.bestCleanDateKey ? 'Рекорд установлен ' + formatDateKey(summary.bestCleanDateKey) : 'Запиши первую чистую попытку чтобы увидеть рекорд')
        ),
        h(
          'section',
          { className: 'drums-ft-chart-wrap' },
          h(LineChart, { data: chartSeries, width: 320, height: 160 })
        ),
        h(
          'section',
          { className: 'drums-ft-history' },
          h('strong', null, 'История попыток'),
          history.length === 0
            ? h('span', { className: 'drums-ft-history__empty' }, 'Нет попыток. Запусти сессию, чтобы начать копить рекорды.')
            : h(
                'ul',
                null,
                history.slice(0, 25).map((attempt, idx) =>
                  h(
                    'li',
                    { key: idx, className: 'drums-ft-history__row' + (attempt.clean ? ' is-clean' : ' is-dirty') },
                    h('span', { className: 'drums-ft-history__date' }, formatDateKey(attempt.dateKey)),
                    h('strong', { className: 'drums-ft-history__bpm' }, attempt.bpm + ' BPM'),
                    h('span', { className: 'drums-ft-history__tag' }, attempt.clean ? 'чисто' : 'грязно'),
                    h('span', { className: 'drums-ft-history__session' }, attempt.sessionLabel || attempt.sessionId || '')
                  )
                )
              )
        )
      );
    }

    function renderTechniqueGuide(block) {
      const guide = block?.technique || {};
      const motion = Array.isArray(guide.motion) ? guide.motion : [];
      const checkpoints = Array.isArray(guide.checkpoints) ? guide.checkpoints : [];
      if (!guide.summary && !motion.length && !checkpoints.length) return null;

      const PAD_LINE = h('line', { className: 'drums-ft-technique__pad', x1: 8, x2: 56, y1: 58, y2: 58 });
      const PATH_BY_STROKE = {
        down: 'M26 12 C34 24 34 40 26 54',
        up: 'M26 54 C18 40 18 24 26 12',
        tap: 'M26 31 C31 39 31 48 26 54',
        full: 'M20 13 C35 25 35 43 20 54 M32 54 C17 43 17 25 32 13',
        buzz: 'M12 52 C16 45 20 59 24 52 S32 45 36 52 S44 59 48 52',
        rest: 'M17 26 L17 48 M35 26 L35 48',
      };

      function renderAnimatedSvg(item) {
        const stroke = item?.stroke || 'tap';
        return h(
          'svg',
          {
            className: 'drums-ft-technique__svg drums-ft-technique__svg--anim drums-ft-technique__svg--anim-' + stroke,
            viewBox: '0 0 64 72',
            role: 'img',
            'aria-label': item?.text || item?.label || stroke,
          },
          PAD_LINE,
          stroke === 'rest'
            ? h('g', { className: 'drums-ft-technique__pause' }, h('path', { d: PATH_BY_STROKE.rest }))
            : h(
                'g',
                null,
                h('path', { className: 'drums-ft-technique__path', d: PATH_BY_STROKE[stroke] || PATH_BY_STROKE.tap }),
                stroke === 'buzz'
                  ? h('circle', { className: 'drums-ft-technique__tip drums-ft-technique__tip--buzz', cx: 26, cy: 54, r: 3.5 })
                  : h('circle', { className: 'drums-ft-technique__tip drums-ft-technique__tip--anim drums-ft-technique__tip--anim-' + stroke, cx: 26, cy: 31, r: 3.5 })
              ),
          item?.accent ? h('text', { className: 'drums-ft-technique__accent', x: 49, y: 17 }, '>') : null
        );
      }

      function renderStoryboardFrames(item) {
        const stroke = item?.stroke || 'tap';
        const framesByStroke = {
          down: [
            { cy: 13, label: 'старт' },
            { cy: 30, label: 'падение' },
            { cy: 54, label: 'удар' },
            { cy: 28, label: 'отскок' },
          ],
          up: [
            { cy: 54, label: 'старт' },
            { cy: 38, label: 'подъём' },
            { cy: 22, label: 'верх' },
            { cy: 13, label: 'готов' },
          ],
          tap: [
            { cy: 24, label: 'старт' },
            { cy: 50, label: 'тап' },
            { cy: 34, label: 'отскок' },
            { cy: 24, label: 'готов' },
          ],
          full: [
            { cy: 13, label: 'старт' },
            { cy: 54, label: 'удар' },
            { cy: 30, label: 'отскок' },
            { cy: 13, label: 'готов' },
          ],
          buzz: [
            { cy: 50, label: 'контакт' },
            { cy: 52, label: 'дрожь' },
            { cy: 50, label: 'дрожь' },
            { cy: 52, label: 'дрожь' },
          ],
          rest: [
            { cy: 0, label: 'пауза' },
            { cy: 0, label: 'пауза' },
            { cy: 0, label: 'пауза' },
            { cy: 0, label: 'пауза' },
          ],
        };
        const frames = framesByStroke[stroke] || framesByStroke.tap;
        return h(
          'div',
          { className: 'drums-ft-technique__story' },
          frames.map((frame, idx) =>
            h(
              'div',
              { key: idx, className: 'drums-ft-technique__story-frame' },
              h(
                'svg',
                {
                  className: 'drums-ft-technique__svg drums-ft-technique__svg--story',
                  viewBox: '0 0 64 72',
                  'aria-hidden': 'true',
                },
                PAD_LINE,
                stroke === 'rest'
                  ? h('g', { className: 'drums-ft-technique__pause' }, h('path', { d: PATH_BY_STROKE.rest }))
                  : h(
                      'g',
                      null,
                      h('path', {
                        className: 'drums-ft-technique__path drums-ft-technique__path--ghost',
                        d: PATH_BY_STROKE[stroke] || PATH_BY_STROKE.tap,
                      }),
                      h('circle', { className: 'drums-ft-technique__tip', cx: 26, cy: frame.cy, r: 3.5 })
                    ),
                idx === 0 && item?.accent
                  ? h('text', { className: 'drums-ft-technique__accent', x: 49, y: 17 }, '>')
                  : null
              ),
              h('span', null, frame.label)
            )
          )
        );
      }

      function renderVideoVariant(item) {
        const stroke = item?.stroke || 'tap';
        const src = '/exercises/drums/motion/' + stroke + '.webm';
        const poster = '/exercises/drums/motion/' + stroke + '.jpg';
        return h(
          'div',
          { className: 'drums-ft-technique__video-wrap' },
          h(
            'video',
            {
              className: 'drums-ft-technique__video',
              src,
              poster,
              autoPlay: true,
              loop: true,
              muted: true,
              playsInline: true,
              'aria-label': item?.text || item?.label || stroke,
              onError: (event) => {
                try {
                  event.currentTarget.classList.add('is-missing');
                } catch (_) {
                  /* noop */
                }
              },
            }
          ),
          h('span', { className: 'drums-ft-technique__video-fallback' }, 'Видео-ассет не загружен')
        );
      }

      function renderMotionForVariant(item) {
        if (schematicVariant === 'storyboard') return renderStoryboardFrames(item);
        if (schematicVariant === 'video') return renderVideoVariant(item);
        return renderAnimatedSvg(item);
      }

      const variants = [
        { key: 'animated', label: 'Анимация' },
        { key: 'storyboard', label: 'Раскадровка' },
        { key: 'video', label: 'Видео' },
      ];

      return h(
        'div',
        { className: 'drums-ft-technique drums-ft-technique--variant-' + schematicVariant },
        h('div', { className: 'drums-ft-technique__summary' }, guide.summary),
        motion.length
          ? h(
              'div',
              { className: 'drums-ft-technique__variant-switch', role: 'group', 'aria-label': 'Стиль схемы движения' },
              variants.map((variant) =>
                h(
                  'button',
                  {
                    type: 'button',
                    key: variant.key,
                    className:
                      'drums-ft-technique__variant-btn' + (schematicVariant === variant.key ? ' is-active' : ''),
                    onClick: () => setSchematicVariant(variant.key),
                  },
                  variant.label
                )
              )
            )
          : null,
        motion.length
          ? h(
              'div',
              { className: 'drums-ft-technique__motion', 'aria-label': 'Схема движения палки' },
              motion.map((item, index) =>
                h(
                  'div',
                  {
                    key: (item?.label || item?.stroke || 'step') + '-' + index,
                    className: 'drums-ft-technique__step drums-ft-technique__step--' + (item?.stroke || 'tap'),
                  },
                  h('strong', null, item?.label || index + 1),
                  renderMotionForVariant(item),
                  h('span', null, item?.text || '')
                )
              )
            )
          : null,
        checkpoints.length
          ? h(
              'div',
              { className: 'drums-ft-technique__checks' },
              checkpoints.map((item) => h('span', { key: item }, item))
            )
          : null
      );
    }

    function adjustPendingBpm(delta) {
      setPendingConfirm((prev) => ({
        ...prev,
        bpm: clampNumber((Number(prev.bpm) || 0) + delta, 30, 260, prev.bpm || 80),
      }));
    }

    function ConfirmModal() {
      if (!pendingConfirm.open) return null;
      const safeBpm = clampNumber(pendingConfirm.bpm, 30, 260, activeBlock?.bpm || 80);
      return h(
        'div',
        { className: 'drums-ft-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Зафиксировать блок' },
        h(
          'div',
          { className: 'drums-ft-modal__card' },
          h('strong', { className: 'drums-ft-modal__title' }, 'Зафиксировать блок?'),
          h('span', { className: 'drums-ft-modal__hint' }, activeBlock?.label || 'Блок'),
          h(
            'div',
            { className: 'drums-ft-modal__bpm' },
            h('strong', null, safeBpm),
            h('span', null, 'BPM')
          ),
          h(
            'div',
            { className: 'drums-ft-modal__steps' },
            h('button', { type: 'button', onClick: () => adjustPendingBpm(-5) }, '−5'),
            h('button', { type: 'button', onClick: () => adjustPendingBpm(-1) }, '−1'),
            h('button', { type: 'button', onClick: () => adjustPendingBpm(1) }, '+1'),
            h('button', { type: 'button', onClick: () => adjustPendingBpm(5) }, '+5')
          ),
          h(
            'div',
            { className: 'drums-ft-modal__actions' },
            h(
              'button',
              { type: 'button', className: 'drums-ft-modal__primary', onClick: () => fixBlockAndAdvance(safeBpm) },
              'Зафиксировать на ' + safeBpm + ' BPM'
            ),
            h(
              'button',
              { type: 'button', className: 'drums-ft-modal__secondary', onClick: () => replayCurrentAt(safeBpm) },
              'Играть ещё'
            )
          )
        )
      );
    }

    function RunScreen() {
      const remainingTotalSec = Math.max(0, Number(sessionState.remainingSec) || 0);
      const targetBpm = clampNumber(activeResult.bpm, 30, 260, activeBlock?.bpm || 80);
      const baselineBpm = clampNumber(activeBlock?.bpm, 30, 260, 80);
      const recordHint = isWarmup
        ? 'Разминка → ' + targetBpm + ' BPM'
        : targetBpm > baselineBpm
          ? 'Цель: ' + targetBpm + ' BPM'
          : 'Базовый темп ' + baselineBpm + ' BPM';
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
        h(
          'div',
          { className: 'drums-ft-phase-banner' + (isWarmup ? ' is-warmup' : '') },
          h('span', null, isWarmup ? 'Разминка' : 'Рабочий блок'),
          h('strong', null, recordHint)
        ),
        h('div', { className: 'drums-ft-timer' }, h('span', null, formatClock(remainingTotalSec))),
        sessionState.countInSec
          ? h('div', { className: 'drums-ft-count-in' }, h('strong', null, sessionState.countInSec), h('span', null, 'отсчёт'))
          : null,
        NotationPanel
          ? h(NotationPanel, {
              session,
              blockIndex: sessionState.activeIndex,
              metronomeRef,
              running: sessionState.running,
              countInSec: sessionState.countInSec,
              results: sessionState.results,
              bpm: effectiveBpm,
              onBpmChange: (bpm) => patchActiveResult({ bpm: clampNumber(bpm, 30, 260, activeBlock.bpm) }),
            })
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
          h(
            'button',
            { type: 'button', onClick: requestEarlyFinish, disabled: activeResult.done || pendingConfirm.open },
            activeResult.done ? 'Готово' : 'Завершить блок'
          ),
          h(
            'button',
            { type: 'button', className: soundEnabled ? 'is-active' : '', onClick: () => setSoundEnabled((v) => !v) },
            soundEnabled ? 'Клик' : 'Без клика'
          ),
          h(
            'button',
            { type: 'button', className: 'drums-ft-pain-btn', onClick: triggerPainSafetyGate, title: 'Стоп: боль или онемение' },
            'Боль / онемение'
          ),
          h(
            'label',
            { className: 'drums-ft-volume-control' },
            h('span', null, 'Громкость'),
            h('strong', null, soundVolume + '%'),
            h('input', {
              type: 'range',
              min: 0,
              max: 100,
              step: 5,
              value: soundVolume,
              disabled: !soundEnabled,
              onChange: (event) => setSoundVolume(clampNumber(event.target.value, 0, 100, 100)),
            })
          )
        ),
        h(
          'section',
          { className: 'drums-ft-current' },
          h('p', null, activeBlock.goal),
          h('div', { className: 'drums-ft-pattern' }, activeBlock.pattern),
          renderTechniqueGuide(activeBlock),
          h(
            'ul',
            null,
            activeBlock.cues.map((cue) => h('li', { key: cue }, cue))
          )
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
        ),
        ConfirmModal()
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
        screen === 'home'
          ? h(HomeScreen)
          : screen === 'run'
            ? h(RunScreen)
            : screen === 'finish'
              ? h(FinishScreen)
              : screen === 'progress'
                ? h(ProgressScreen)
                : screen === 'detail'
                  ? h(BlockDetailScreen)
                  : h(SavedScreen)
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
      getInitialRemainingSec,
      getEffectiveBpm,
      finishWarmup,
      disableWarmupForReplay,
      getBlockHistory,
      summarizeBlockProgress,
      readBlockPRLog,
      appendBlockPR,
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
      expandBlockPattern,
      getPlaybackPosition,
      getNotationWindow,
      resyncMetronomeCursor,
      scheduleTick,
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
