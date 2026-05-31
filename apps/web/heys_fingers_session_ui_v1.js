// heys_fingers_session_ui_v1.js — Главный UI fullscreen overlay для fingers модуля.
// Wave 3 step 3a. 4 таба: Программы / Конструктор / Прогресс / Календарь.
// Header — close ✕ + кнопка «📚 Методология» (открывает BibliographyModal).
//
// Зависимости (defensive — все через optional chaining):
//   HEYS.Fingers.PROGRAMS, getProgramById, getProgramIntensity, buildLogFromProgram
//   HEYS.Fingers.ExerciseConstructor, createBlankExercise
//   HEYS.Fingers.records.{get, getMVC, byGrade, GRADE_TABLE}
//   HEYS.Fingers.YearHeatmap, cooldownCheck
//   HEYS.Fingers.BibliographyModal, SourceBadge
//   HEYS.Fingers.calibration.{maxHang, isDue, lastTestDate}
//   HEYS.Fingers.SafetyGate, ageGate
//   HEYS.Fingers.readiness.assess
//   HEYS.Fingers.voice
//   HEYS.TrainingStep.saveFingers (Wave 1)
//   HEYS.utils.lsGet/lsSet, HEYS.currentClientId
//
// Public API:
//   HEYS.Fingers.SessionUI({ dateKey, trainingIndex, onClose })
//   HEYS.Fingers.startSession({ programId, exercises, dateKey, trainingIndex, onComplete })

;(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};
  if (Fingers.SessionUI__registered) return;
  Fingers.SessionUI__registered = true;

  const React = global.React;
  if (!React) {
    console.warn('[Fingers.SessionUI] React not loaded');
    return;
  }
  const h = React.createElement;
  const { useState, useMemo, useEffect, useCallback } = React;

  // --- helpers ---
  function getProfile() {
    const u = HEYS.utils;
    if (!u || !u.lsGet) return {};
    const p = u.lsGet('heys_profile', {}) || {};
    return p.fingerboardProfile || {};
  }

  function getRecommendedProgramId() {
    const fp = getProfile();
    if (fp.recommendedProgramId) return fp.recommendedProgramId;
    if (fp.noEquipment) return 'nelson_no_hangs';
    if ((fp.age || 18) < 14) return 'nelson_no_hangs';
    const g = fp.maxVGrade || 'V3-V4';
    if (g === 'V0-V2' || g === 'V3-V4') return 'beastmaker_1000_beginner';
    if (g === 'V5-V6') return 'repeaters_7_3';
    if (g === 'V7-V8' || g === 'V9+') return 'horst_max_hangs';
    return 'beastmaker_1000_beginner';
  }

  function intensityLabel(intensity) {
    return intensity === 'max' ? 'максимум'
      : intensity === 'moderate' ? 'умеренно'
      : intensity === 'recovery' ? 'восстановление' : '';
  }

  function intensityColor(intensity) {
    return intensity === 'max' ? '#dc2626'
      : intensity === 'moderate' ? '#f59e0b'
      : intensity === 'recovery' ? '#10b981' : '#6b7280';
  }

  // --- Programs tab ---
  function ProgramsTab({ onPickProgram, recommendedId }) {
    const programs = Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : [];
    const profile = getProfile();
    const age = Number(profile.age) || 18;
    const filtered = Fingers.ageGate && Fingers.ageGate.filterPrograms
      ? Fingers.ageGate.filterPrograms(programs, age)
      : programs;

    if (!filtered.length) {
      return h('div', { className: 'fingers-fs-empty' },
        'Программы недоступны для возраста ' + age + '. ',
        Fingers.ageGate && h('p', null, Fingers.ageGate.getRestrictionMessage(age))
      );
    }

    return h('div', { className: 'fingers-fs-program-grid' },
      filtered.map(function (p) {
        const isRec = p.id === recommendedId;
        return h('div', {
          key: p.id,
          className: 'fingers-fs-program-card' + (isRec ? ' fingers-fs-program-card--recommended' : ''),
          style: { position: 'relative' }
        },
          isRec && h('div', {
            style: {
              position: 'absolute', top: 12, right: 12,
              padding: '2px 8px', borderRadius: 999,
              fontSize: 11, fontWeight: 600,
              background: 'var(--fingers-accent)', color: '#fff'
            }
          }, '★ для тебя'),
          h('h3', { style: { margin: '0 0 8px', fontSize: 18 } }, p.name),
          h('p', { style: { margin: '0 0 12px', fontSize: 14, opacity: 0.75 } }, p.description),
          h('div', {
            style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }
          },
            h('span', {
              style: {
                padding: '2px 8px', borderRadius: 4,
                background: intensityColor(p.intensity) + '22',
                color: intensityColor(p.intensity)
              }
            }, intensityLabel(p.intensity)),
            h('span', {
              style: {
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(0,0,0,0.06)'
              }
            }, '⏱ ' + (p.durationMin || '—') + ' мин'),
            h('span', {
              style: {
                padding: '2px 8px', borderRadius: 4,
                background: 'rgba(0,0,0,0.06)'
              }
            }, p.level)
          ),
          p.advisoryBadge && h('div', {
            style: {
              padding: '8px 12px', marginBottom: 12,
              borderRadius: 8, fontSize: 13,
              background: '#fef3c7', color: '#92400e',
              border: '1px solid #fde68a'
            }
          }, '⚠ ' + p.advisoryBadge),
          h('div', {
            style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }
          },
            Array.isArray(p.sourceIds) && p.sourceIds.slice(0, 3).map(function (sid) {
              return Fingers.SourceBadge
                ? h(Fingers.SourceBadge, { key: sid, sourceId: sid })
                : null;
            })
          ),
          h('button', {
            className: 'fingers-fs-cta',
            onClick: function () { onPickProgram(p); },
            style: { width: '100%' }
          }, 'Запустить программу')
        );
      })
    );
  }

  // --- Constructor tab ---
  function ConstructorTab({ exercises, setExercises, userBoard, userAge }) {
    const add = function () {
      const blank = Fingers.createBlankExercise
        ? Fingers.createBlankExercise({ boardId: userBoard })
        : { gripId: 'openhand4', edgeSizeMm: 20, addedWeightKg: 0,
            hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 };
      setExercises(exercises.concat([blank]));
    };

    const updateAt = function (i, updated) {
      const next = exercises.slice();
      next[i] = updated;
      setExercises(next);
    };

    const removeAt = function (i) {
      setExercises(exercises.filter(function (_, idx) { return idx !== i; }));
    };

    return h('div', { className: 'fingers-fs-constructor' },
      exercises.length === 0
        ? h('div', { className: 'fingers-fs-empty', style: { padding: 32, textAlign: 'center' } },
            h('p', null, 'Пусто. Добавь упражнение или примени программу из вкладки Программы.'),
            h('button', { className: 'fingers-fs-cta', onClick: add, style: { marginTop: 16 } },
              '+ Добавить упражнение'))
        : h(React.Fragment, null,
            exercises.map(function (ex, i) {
              if (Fingers.ExerciseConstructor) {
                return h(Fingers.ExerciseConstructor, {
                  key: i,
                  exercise: ex,
                  userBoard: userBoard,
                  userAge: userAge,
                  onChange: function (u) { updateAt(i, u); },
                  onRemove: function () { removeAt(i); }
                });
              }
              return h('div', { key: i, className: 'fingers-fs-program-card' },
                h('p', null, 'Constructor module not loaded yet.'),
                h('pre', { style: { fontSize: 11 } }, JSON.stringify(ex, null, 2)));
            }),
            h('button', {
              className: 'fingers-fs-ghost',
              onClick: add,
              style: { width: '100%', marginTop: 16 }
            }, '+ Добавить ещё упражнение')
          )
    );
  }

  // --- Progress tab ---
  function ProgressTab({ recommendedProgramId, onPickProgram }) {
    const records = (Fingers.records && Fingers.records.get) ? Fingers.records.get() : { maxHangs: {} };
    const allHangs = records.maxHangs || {};
    const slugs = Object.keys(allHangs);
    const cooldown = Fingers.cooldownCheck ? Fingers.cooldownCheck() : null;
    const profile = getProfile();
    const mvcDue = Fingers.calibration && Fingers.calibration.isDue
      ? Fingers.calibration.isDue('maxHang', 'openhand4_20mm')
      : false;

    return h('div', { className: 'fingers-fs-progress' },
      // Cooldown card
      cooldown && !cooldown.allowedNow && h('div', {
        style: {
          padding: 16, marginBottom: 16, borderRadius: 12,
          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b'
        }
      },
        h('strong', null, '🛡 Recovery: ' + cooldown.recommendation),
        h('p', { style: { margin: '4px 0 0', fontSize: 14 } },
          'Прошло ' + Math.round(cooldown.hoursSinceLast) + 'ч с последней сессии. Tendon collagen synthesis не завершён (Magnusson 2010).')
      ),

      slugs.length === 0
        ? h('div', { className: 'fingers-fs-empty' },
            h('h3', null, '📊 Прогресс'),
            h('p', null, 'Тренировок ещё нет. После первой здесь появятся твои рекорды по 8 хватам.'),
            recommendedProgramId && Fingers.getProgramById && h('div', { style: { marginTop: 24 } },
              h('p', { style: { fontSize: 13, opacity: 0.7 } }, 'Рекомендованная стартовая программа:'),
              h('button', {
                className: 'fingers-fs-cta',
                onClick: function () {
                  const p = Fingers.getProgramById(recommendedProgramId);
                  if (p && onPickProgram) onPickProgram(p);
                },
                style: { marginTop: 8 }
              }, '▶ Запустить первую тренировку')
            )
          )
        : h('div', null,
            h('h3', { style: { margin: '0 0 12px' } }, 'Личные рекорды'),
            h('div', { className: 'fingers-fs-records' },
              slugs.map(function (slug) {
                const r = allHangs[slug];
                const main = r.type === 'weight'
                  ? (r.mvcKg ? r.mvcKg.toFixed(1) + ' кг' : '—')
                  : (r.holdTime ? r.holdTime.toFixed(1) + ' с' : '—');
                return h('div', { key: slug, className: 'fingers-fs-record-row',
                  style: { display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
                    borderBottom: '1px solid var(--fingers-card-border)' } },
                  h('span', { style: { fontFamily: 'monospace', fontSize: 13 } }, slug),
                  h('strong', null, main)
                );
              })
            ),
            mvcDue && h('div', {
              style: {
                marginTop: 16, padding: 12, borderRadius: 8,
                background: '#fffbeb', border: '1px solid #fde68a', fontSize: 13
              }
            }, '📅 Пора re-test (>8 недель с последнего MVC теста)')
          )
    );
  }

  // --- Calendar tab ---
  function CalendarTab() {
    if (!Fingers.YearHeatmap) {
      return h('div', { className: 'fingers-fs-empty' },
        h('p', null, 'Календарь недоступен (module not loaded).'));
    }
    const currentYear = new Date().getFullYear();
    return h('div', null,
      h('h3', { style: { margin: '0 0 16px' } }, '📅 Год тренировок'),
      h(Fingers.YearHeatmap, {
        year: currentYear,
        onDayClick: function (date) { /* TODO: bottom-sheet с деталями дня */ }
      })
    );
  }

  // --- Live session — ведомое выполнение упражнения с countdown timer ---
  // Каждое exercise = собственный cycle (key={exIdx} → re-mount hook'a).
  function ExerciseRunner({ exercise, exIdx, totalExercises, onDone, onAbort }) {
    const cycle = Fingers.useCountdownCycle({
      hangSec: Number(exercise.hangSec) || 7,
      restSec: Number(exercise.restSec) || 3,
      repsPerSet: Number(exercise.repsPerSet) || 6,
      setsCount: Number(exercise.setsCount) || 3,
      restBetweenSetsSec: Number(exercise.restBetweenSetsSec) || 180,
      onComplete: onDone
    });

    // Auto-start session на mount
    useEffect(function () {
      if (cycle && typeof cycle.start === 'function') {
        // Defer на следующий tick чтобы wake lock и audio context успели init
        const t = setTimeout(function () { try { cycle.start(); } catch (_) {} }, 100);
        return function () { clearTimeout(t); };
      }
    }, []);

    const grip = Fingers.GRIPS_BY_ID && Fingers.GRIPS_BY_ID[exercise.gripId];
    const gripLabel = grip ? grip.label : exercise.gripId;
    const edgeLabel = exercise.edgeSizeMm ? exercise.edgeSizeMm + 'мм' : '—';
    const addedWeight = Number(exercise.addedWeightKg) || 0;

    if (Fingers.CountdownDisplay) {
      return h(Fingers.CountdownDisplay, {
        state: cycle.state,
        secondsLeft: cycle.secondsLeft,
        setIdx: cycle.setIdx,
        totalSets: Number(exercise.setsCount) || 3,
        repIdx: cycle.repIdx,
        totalReps: Number(exercise.repsPerSet) || 6,
        gripLabel: gripLabel + ' · ' + edgeLabel + (addedWeight ? ' · ' + (addedWeight > 0 ? '+' : '') + addedWeight + 'кг' : ''),
        edgeLabel: edgeLabel,
        addedWeightKg: addedWeight,
        exerciseProgress: 'Упр ' + (exIdx + 1) + '/' + totalExercises,
        onPause: cycle.pause,
        onResume: cycle.resume,
        onAbort: function () { try { cycle.abort(); } catch (_) {} if (onAbort) onAbort(); },
        onSkip: cycle.skipPhase
      });
    }

    // Fallback если CountdownDisplay не загружен
    return h('div', { style: { padding: 32, textAlign: 'center' } },
      h('div', { style: { fontSize: 18, marginBottom: 16 } }, gripLabel),
      h('div', { style: { fontSize: 96, fontWeight: 300, fontFamily: 'mono' } },
        cycle.secondsLeft + 'с'),
      h('div', { style: { fontSize: 14, opacity: 0.6, marginBottom: 24 } },
        'Состояние: ' + cycle.state + ' · Сет ' + (cycle.setIdx + 1) + '/' + exercise.setsCount),
      h('button', {
        className: 'fingers-fs-ghost',
        onClick: function () { try { cycle.abort(); } catch (_) {} if (onAbort) onAbort(); },
        style: { marginTop: 16 }
      }, '✕ Прервать')
    );
  }

  function LiveSession({ exercises, onAllDone, onAbort }) {
    const [exIdx, setExIdx] = useState(0);
    const handleExerciseDone = useCallback(function () {
      if (exIdx + 1 < exercises.length) {
        setExIdx(exIdx + 1);
      } else if (onAllDone) {
        onAllDone();
      }
    }, [exIdx, exercises.length, onAllDone]);

    if (!exercises || !exercises.length) {
      return h('div', { style: { padding: 32, textAlign: 'center' } },
        'Нет упражнений для запуска.'
      );
    }

    const current = exercises[exIdx];
    return h(ExerciseRunner, {
      key: exIdx, // forces re-mount of useCountdownCycle hook on exercise switch
      exercise: current,
      exIdx: exIdx,
      totalExercises: exercises.length,
      onDone: handleExerciseDone,
      onAbort: onAbort
    });
  }

  // --- Main SessionUI ---
  function SessionUI({ dateKey, trainingIndex, onClose }) {
    const [tab, setTab] = useState('programs');
    const [exercises, setExercises] = useState([]);
    const [showBib, setShowBib] = useState(false);
    const [pendingProgram, setPendingProgram] = useState(null);
    const [liveActive, setLiveActive] = useState(false);

    const profile = getProfile();
    const userBoard = profile.fingerboardId || null;
    const userAge = Number(profile.age) || 18;
    const recommendedId = getRecommendedProgramId();

    // Pick program → load exercises into constructor → switch to constructor tab
    const handlePickProgram = useCallback(function (program) {
      const built = Fingers.buildLogFromProgram
        ? Fingers.buildLogFromProgram(program.id, userBoard ? Fingers.getBoardById?.(userBoard) : null)
        : (program.exercises || []);
      setExercises(built || []);
      setPendingProgram(program);
      setTab('constructor');
      // Voice cue
      try { Fingers.voice?.say?.('cue.next_set'); } catch (_) { /* noop */ }
    }, [userBoard]);

    // Save current session as training (called on «Завершить тренировку» или auto on LiveSession DONE)
    const handleComplete = useCallback(function (opts) {
      const o = opts || {};
      if (!exercises.length) return;
      const programId = pendingProgram?.id || 'custom';
      const totalMin = exercises.reduce(function (s, e) {
        const oneSet = (e.hangSec + e.restSec) * e.repsPerSet + e.restBetweenSetsSec;
        return s + (oneSet * e.setsCount) / 60;
      }, 0);
      const fingersLog = {
        version: 1,
        programId: programId,
        totalDurationMinutes: Math.round(totalMin),
        exercises: exercises,
        completedAt: new Date().toISOString(),
        viaTimer: !!o.viaTimer // true если завершено через ведомый таймер
      };
      try {
        HEYS.TrainingStep?.saveFingers?.(
          { dateKey, trainingIndex },
          fingersLog,
          { activityLabel: pendingProgram?.name || 'Свой конструктор' }
        );
        if (HEYS.Toast?.success) HEYS.Toast.success(o.viaTimer ? 'Сессия завершена и сохранена' : 'План тренировки сохранён');
      } catch (e) {
        console.warn('[SessionUI] saveFingers failed:', e);
      }
      if (onClose) onClose();
    }, [exercises, pendingProgram, dateKey, trainingIndex, onClose]);

    // G1+G2+G5+G6: Start live timer session (с readiness + safety pre-flight)
    const handleStartLive = useCallback(function () {
      if (!exercises.length) return;

      // G5: Readiness gate — читаем readiness из morning checkin
      let readinessBucket = 'moderate-only';
      let readinessReasons = [];
      try {
        const today = (typeof dateKey === 'string' ? dateKey : new Date().toISOString().slice(0, 10));
        if (Fingers.readiness && typeof Fingers.readiness.assess === 'function') {
          const r = Fingers.readiness.assess({ dateKey: today });
          if (r && r.bucket) {
            readinessBucket = r.bucket;
            readinessReasons = Array.isArray(r.reasons) ? r.reasons : [];
          }
        }
      } catch (e) {
        console.warn('[SessionUI] readiness.assess failed:', e);
      }

      const programIntensity = pendingProgram?.intensity
        || (Fingers.getProgramIntensity && Fingers.getProgramIntensity(pendingProgram?.id))
        || 'moderate';

      // Rest-day hard block только для max-protocol
      if (readinessBucket === 'rest-day' && programIntensity === 'max') {
        if (HEYS.ConfirmModal?.show) {
          HEYS.ConfirmModal.show({
            icon: '🛑',
            title: 'Сегодня тело устало',
            text: 'Готовность низкая (' + (readinessReasons[0] || 'низкие mood/sleep/wellbeing за последние дни') + '). Max-protocol запрещён. Попробуй No-Hangs (active recovery).',
            confirmText: 'Понял',
            cancelText: null
          });
        }
        return;
      }

      // G2: Safety pre-flight — RAMP warmup checklist через ConfirmModal
      if (!HEYS.ConfirmModal?.show) {
        // Fallback: если ConfirmModal недоступен — сразу старт
        setLiveActive(true);
        return;
      }

      const cooldownInfo = (Fingers.cooldownCheck && Fingers.cooldownCheck()) || {};
      const cooldownWarn = (cooldownInfo.hoursSinceLast != null && cooldownInfo.hoursSinceLast < 48 && cooldownInfo.lastWasMax && programIntensity === 'max')
        ? '\n⚠ Прошло только ' + Math.round(cooldownInfo.hoursSinceLast) + 'ч с прошлой max-сессии (рекомендуется ≥48ч).'
        : '';

      const readinessNote = readinessBucket === 'recovery-only'
        ? '\nℹ Готовность невысокая — лучше No-Hangs или recovery-протокол.'
        : '';

      HEYS.ConfirmModal.show({
        icon: '🤲',
        title: 'Pre-flight check',
        text: 'Перед стартом подтверди:\n\n' +
              '✓ Разогрев 15-20 мин (RAMP: Raise/Activate/Mobilize/Potentiate)\n' +
              '✓ Нет острой боли в пальцах и PIP суставах\n' +
              '✓ Не на холодные руки' +
              cooldownWarn + readinessNote,
        confirmText: 'Всё ОК, начинаем',
        cancelText: 'Отмена',
        confirmStyle: programIntensity === 'max' ? 'warning' : 'primary',
        onConfirm: function () {
          // G6: voice cue session start
          try { Fingers.voice?.say?.('cue.start_session'); } catch (_) {}
          setLiveActive(true);
        }
      });
    }, [exercises, pendingProgram, dateKey]);

    const handleLiveAllDone = useCallback(function () {
      setLiveActive(false);
      try { Fingers.voice?.say?.('cue.session_done'); } catch (_) {}
      handleComplete({ viaTimer: true });
    }, [handleComplete]);

    const handleLiveAbort = useCallback(function () {
      setLiveActive(false);
      try { Fingers.voice?.say?.('cue.session_aborted'); } catch (_) {}
      if (HEYS.Toast?.info) HEYS.Toast.info('Сессия прервана — план сохранён');
    }, []);

    // Live session берёт весь экран — табы и header скрыты
    if (liveActive) {
      return h('div', { className: 'fingers-fs-live' },
        h(LiveSession, {
          exercises: exercises,
          onAllDone: handleLiveAllDone,
          onAbort: handleLiveAbort
        })
      );
    }

    const tabs = [
      { id: 'programs', label: 'Программы', icon: '📚' },
      { id: 'constructor', label: 'Конструктор', icon: '⚙' },
      { id: 'progress', label: 'Прогресс', icon: '📊' },
      { id: 'calendar', label: 'Календарь', icon: '📅' }
    ];

    return h('div', { className: 'fingers-fs-session' },
      // Header
      h('div', { className: 'fingers-fs__header',
        style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 0 24px', gap: 12 } },
        h('h1', { style: { margin: 0, fontSize: 24 } }, '🤚 Тренировка пальцев'),
        h('button', {
          className: 'fingers-fs-ghost',
          onClick: function () { setShowBib(true); },
          style: { padding: '8px 14px', fontSize: 13 },
          'aria-label': 'Источники и методология'
        }, '📚 Методология')
      ),

      // Tabs
      h('div', { className: 'fingers-fs-tabs', role: 'tablist',
        style: { display: 'flex', gap: 4, marginBottom: 24,
          padding: 4, borderRadius: 12, background: 'rgba(0,0,0,0.04)' } },
        tabs.map(function (t) {
          const active = tab === t.id;
          return h('button', {
            key: t.id,
            role: 'tab',
            'aria-selected': active,
            className: 'fingers-fs-tab' + (active ? ' fingers-fs-tab--active' : ''),
            onClick: function () { setTab(t.id); },
            style: {
              flex: 1, padding: '10px 8px', borderRadius: 8,
              border: 'none', cursor: 'pointer',
              background: active ? 'var(--fingers-bg)' : 'transparent',
              color: active ? 'var(--fingers-text)' : 'inherit',
              fontWeight: active ? 600 : 400,
              fontSize: 14
            }
          }, t.icon + ' ' + t.label);
        })
      ),

      // Tab content
      h('div', { className: 'fingers-fs-tab-content' },
        tab === 'programs' && h(ProgramsTab, {
          onPickProgram: handlePickProgram,
          recommendedId: recommendedId
        }),
        tab === 'constructor' && h(React.Fragment, null,
          h(ConstructorTab, {
            exercises: exercises,
            setExercises: setExercises,
            userBoard: userBoard,
            userAge: userAge
          }),
          exercises.length > 0 && h('div', {
            style: { marginTop: 24, padding: 16, borderRadius: 12,
              background: 'rgba(0,0,0,0.03)',
              display: 'flex', flexDirection: 'column', gap: 12 }
          },
            // Primary CTA — ведомая сессия с countdown timer + voice
            h('button', {
              className: 'fingers-fs-cta',
              onClick: handleStartLive,
              style: { width: '100%', fontSize: 16, padding: '14px 20px' }
            }, '▶ Запустить ведомую сессию'),
            // Secondary — просто сохранить план без timer (для тех кто тренируется по своему ритму)
            h('button', {
              className: 'fingers-fs-ghost',
              onClick: function () { handleComplete({ viaTimer: false }); },
              style: { width: '100%', fontSize: 13 }
            }, 'Сохранить план без таймера')
          )
        ),
        tab === 'progress' && h(ProgressTab, {
          recommendedProgramId: recommendedId,
          onPickProgram: handlePickProgram
        }),
        tab === 'calendar' && h(CalendarTab)
      ),

      // Bibliography modal
      showBib && Fingers.BibliographyModal && h(Fingers.BibliographyModal, {
        onClose: function () { setShowBib(false); }
      })
    );
  }

  // --- Exports ---
  Fingers.SessionUI = SessionUI;

  Fingers.startSession = function startSession(opts) {
    // Stub for future direct session launch from outside fullscreen.
    // For now SessionUI mounted inside fullscreen handles everything.
    console.info('[Fingers.startSession]', opts);
  };
})(typeof window !== 'undefined' ? window : globalThis);
