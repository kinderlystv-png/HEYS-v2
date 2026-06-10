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
    const [savedLog, setSavedLog] = useState(null);
    const [progressSeed, setProgressSeed] = useState(0);
    const metronomeRef = useRef({ nextNoteTime: 0, noteIndex: 0, scheduledNotes: [], ctx: null });

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
            scheduleTick(ctx, scheduledTime, kind);
            cursor.scheduledNotes = (cursor.scheduledNotes || []).concat({ index: scheduledIndex, time: scheduledTime }).slice(-96);
            cursor.nextNoteTime += sessionState.countInSec ? 1 : getMetronomeIntervalSec(activeBlock, activeResult.bpm, scheduledIndex);
            cursor.noteIndex += 1;
          }
        }, METRONOME_LOOKAHEAD_MS);
        return function () {
          global.clearInterval(id);
          metronomeRef.current.ctx = null;
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
        NotationPanel
          ? h(NotationPanel, {
              session,
              blockIndex: sessionState.activeIndex,
              metronomeRef,
              running: sessionState.running,
              countInSec: sessionState.countInSec,
              results: sessionState.results,
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
      expandBlockPattern,
      getPlaybackPosition,
      getNotationWindow,
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
