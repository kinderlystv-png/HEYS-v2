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
  // Возраст клиента считается из birthDate (приоритет) или поля `age`
  // на верхнем уровне профиля. Помещаем результат в fingerboardProfile.age
  // на лету, если в subprofile он не задан — чтобы все safety-проверки
  // (filterPrograms, filterGrips) автоматически работали с глобальным
  // возрастом клиента.
  function _ageFromGlobalProfile(p) {
    const bd = p && p.birthDate;
    if (bd) {
      const birth = new Date(bd);
      if (!isNaN(birth.getTime())) {
        const t = new Date();
        let a = t.getFullYear() - birth.getFullYear();
        const m = t.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && t.getDate() < birth.getDate())) a--;
        return Math.max(0, a);
      }
    }
    const ageRaw = p && Number(p.age);
    return Number.isFinite(ageRaw) ? ageRaw : null;
  }

  function getProfile() {
    const u = HEYS.utils;
    if (!u || !u.lsGet) return {};
    const p = u.lsGet('heys_profile', {}) || {};
    const fp = Object.assign({}, p.fingerboardProfile || {});
    // Источник истины — глобальный профиль клиента (заполняется при
    // регистрации, поля birthDate / age). fingerboardProfile.age — это
    // legacy-поле из Fingers Onboarding wizard; глобальный возраст всегда
    // его перекрывает. Если глобального нет — оставляем fp.age как есть.
    const globalAge = _ageFromGlobalProfile(p);
    if (globalAge != null) fp.age = globalAge;
    return fp;
  }

  function getRecommendedProgramId() {
    const fp = getProfile();
    if (fp.recommendedProgramId) return fp.recommendedProgramId;
    if (fp.noEquipment) return 'nelson_no_hangs';
    // Возраст не указан → не рекомендуем ничего (UI покажет prompt "укажи возраст").
    // Дефолт 18 раньше → подростки без профиля автоматом получали adult-программы.
    const ageNum = Number(fp.age);
    if (!Number.isFinite(ageNum)) return null;
    if (ageNum < 14) return 'nelson_no_hangs';
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
  function ProgramsTab({ onPickProgram, recommendedId, onRequestOnboarding }) {
    const programs = Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : [];
    const profile = getProfile();
    // Fail-closed: возраст не указан → age=NaN → ageGate.filterPrograms вернёт [].
    // Это правильное поведение: подростку без профиля не должен открыться
    // full crimp / mono / Max Hangs.
    const ageRaw = Number(profile.age);
    const ageKnown = Number.isFinite(ageRaw);
    const filtered = Fingers.ageGate && Fingers.ageGate.filterPrograms
      ? Fingers.ageGate.filterPrograms(programs, ageRaw)
      : programs;

    if (!ageKnown) {
      // CTA: заполнить возраст через re-onboarding.
      return h('div', { className: 'fingers-fs-empty', style: { padding: 24, textAlign: 'center' } },
        h('div', { style: { fontSize: 32, marginBottom: 12 } }, '🎂'),
        h('h3', { style: { margin: '0 0 8px', fontSize: 17 } }, 'Укажи возраст для рекомендаций'),
        h('p', { style: { margin: '0 0 16px', fontSize: 14, opacity: 0.75, lineHeight: 1.45 } },
          'Без возраста мы не показываем программы — это safety-настройка ' +
          '(полный замок и mono нельзя до 16-18 лет, UIAA/BMC).'),
        onRequestOnboarding
          ? h('button', {
              className: 'fingers-fs-cta',
              onClick: onRequestOnboarding,
              style: { padding: '10px 20px' }
            }, 'Заполнить профиль')
          : null
      );
    }

    if (!filtered.length) {
      const restr = Fingers.ageGate && Fingers.ageGate.getRestrictionMessage
        ? Fingers.ageGate.getRestrictionMessage(ageRaw) : null;
      return h('div', { className: 'fingers-fs-empty', style: { padding: 24 } },
        h('h3', { style: { margin: '0 0 8px', fontSize: 16 } },
          'Программы недоступны для возраста ' + ageRaw),
        restr ? h('p', { style: { fontSize: 13, opacity: 0.75, lineHeight: 1.4 } }, restr.message) : null
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

  // --- Exercise sticky bar (паттерн как MealStickyBar в дневнике) ---
  // Fixed-bar поверх списка карточек. Scroll listener считает какая карточка
  // (.fingers-fs-constructor-card[data-exercise-index]) пересекает y=130.
  // Показывает «Упр. N из M · Хват». Тап на бар скроллит к началу карточки.
  const EXERCISE_STICKY_LINE = 130;
  function ExerciseStickyBar({ count }) {
    const [currentIdx, setCurrentIdx] = useState(null);
    const [currentGrip, setCurrentGrip] = useState('');
    const rafRef = React.useRef(null);

    useEffect(function () {
      if (!count || count < 2) return undefined; // одного упражнения — бар не нужен

      const update = function () {
        rafRef.current = null;
        const cards = document.querySelectorAll('.fingers-fs-constructor-card[data-exercise-index]');
        let active = null;
        let activeGrip = '';
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const rect = card.getBoundingClientRect();
          if (rect.top <= EXERCISE_STICKY_LINE && rect.bottom > EXERCISE_STICKY_LINE) {
            active = parseInt(card.dataset.exerciseIndex, 10);
            activeGrip = card.dataset.exerciseGrip || '';
          }
        }
        setCurrentIdx(function (p) { return p === active ? p : active; });
        setCurrentGrip(function (p) { return p === activeGrip ? p : activeGrip; });
      };

      const onScroll = function () {
        if (rafRef.current != null) return;
        rafRef.current = requestAnimationFrame(update);
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      // Также слушаем scroll на ближайшем scrollable parent — fullscreen overlay
      // может скроллиться сам, не window.
      const overlay = document.querySelector('.fingers-fs__container, .fingers-fs');
      if (overlay) overlay.addEventListener('scroll', onScroll, { passive: true });
      update();

      return function () {
        window.removeEventListener('scroll', onScroll);
        if (overlay) overlay.removeEventListener('scroll', onScroll);
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      };
    }, [count]);

    if (!count || count < 2) return null;
    const visible = currentIdx != null;

    const onClick = function () {
      if (currentIdx == null) return;
      const card = document.querySelector(
        '.fingers-fs-constructor-card[data-exercise-index="' + currentIdx + '"]');
      if (!card) return;
      const top = card.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: Math.max(0, top - EXERCISE_STICKY_LINE + 8), behavior: 'smooth' });
    };

    return h('div', {
      onClick: visible ? onClick : undefined,
      role: visible ? 'button' : 'presentation',
      'aria-hidden': !visible,
      'aria-label': visible ? 'К началу: упражнение ' + (currentIdx + 1) : undefined,
      style: {
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        margin: '0 -4px 8px',
        borderRadius: 10,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'saturate(180%) blur(10px)',
        WebkitBackdropFilter: 'saturate(180%) blur(10px)',
        border: '0.5px solid rgba(0, 0, 0, 0.08)',
        boxShadow: visible ? '0 4px 14px rgba(0,0,0,0.05)' : 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.18s ease',
        cursor: visible ? 'pointer' : 'default',
        fontSize: 13,
      },
    },
      h('span', {
        style: { fontSize: 11, fontWeight: 600, color: '#6b7280',
          letterSpacing: '0.04em', textTransform: 'uppercase', flexShrink: 0 }
      }, 'Упр. ' + (visible ? (currentIdx + 1) : '—') + ' из ' + count),
      h('span', {
        style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', fontWeight: 600, color: '#1f2937' }
      }, currentGrip)
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
            h(ExerciseStickyBar, { count: exercises.length }),
            exercises.map(function (ex, i) {
              if (Fingers.ExerciseConstructor) {
                return h(Fingers.ExerciseConstructor, {
                  key: i,
                  exIdx: i,
                  exTotal: exercises.length,
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
                // Slug формат: '{gripId}_{edgeMm}mm' (см. records_store._slug).
                // Транслируем в человеческое: 'Открытый 4-палец · 20 мм'.
                const m = /^(.+?)_(\d+)mm$/.exec(slug);
                const grip = m && Fingers.getGripById ? Fingers.getGripById(m[1]) : null;
                const label = m
                  ? ((grip && grip.label) || m[1]) + ' · ' + m[2] + ' мм'
                  : slug;
                return h('div', { key: slug, className: 'fingers-fs-record-row',
                  style: { display: 'flex', justifyContent: 'space-between', padding: '12px 16px',
                    borderBottom: '1px solid var(--fingers-card-border)', gap: 12, alignItems: 'center' } },
                  h('span', { style: { fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' } }, label),
                  h('strong', { style: { flexShrink: 0 } }, main)
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
  function ExerciseRunner({ exercise, exIdx, totalExercises, dateKey, trainingIndex, exercises, programId, initialSnapshot, onDone, onAbort }) {
    // onStateChange wired to persistence.save: snapshot пишется на переходе фазы
    // (fireStateChange зовётся только на transition, не на tick). Live remaining
    // секунд реконструируется на load() как durationSec - (now - phaseStartedAt).
    // DONE/ABORTED → clear (нет смысла хранить).
    const handleStateChange = useCallback(function (nextState, meta) {
      const STATES = Fingers.STATES || {};
      if (!Fingers.persistence) return;
      if (nextState === STATES.DONE || nextState === STATES.ABORTED || nextState === STATES.IDLE || nextState === STATES.EXPIRED) {
        try { Fingers.persistence.clear(); } catch (_) {}
        return;
      }
      const now = Date.now();
      const snapshot = {
        dateKey: dateKey,
        trainingIndex: trainingIndex,
        exIdx: exIdx,
        exercises: exercises,
        programId: programId,
        state: nextState,
        setIdx: meta && meta.setIdx != null ? meta.setIdx : 0,
        repIdx: meta && meta.repIdx != null ? meta.repIdx : 0,
        durationSec: meta && meta.durationSec != null ? meta.durationSec : 0,
        phaseStartedAt: now,
        stateEnteredAt: now
      };
      // PAUSED — meta.secondsLeft = сколько осталось до pause; кладём как
      // pausedAtRemainingSec, на resume используем при реконструкции.
      if (nextState === STATES.PAUSED && meta && meta.secondsLeft != null) {
        snapshot.pausedAtRemainingSec = meta.secondsLeft;
        snapshot.resumeTo = meta.resumeTo;
      }
      try { Fingers.persistence.save(snapshot); } catch (e) {
        console.warn('[Fingers.ExerciseRunner] persistence.save failed:', e);
      }
    }, [dateKey, trainingIndex, exIdx, exercises, programId]);

    const cycle = Fingers.useCountdownCycle({
      hangSec: Number(exercise.hangSec) || 7,
      restSec: Number(exercise.restSec) || 3,
      repsPerSet: Number(exercise.repsPerSet) || 6,
      setsCount: Number(exercise.setsCount) || 3,
      restBetweenSetsSec: Number(exercise.restBetweenSetsSec) || 180,
      onComplete: onDone,
      onStateChange: handleStateChange
    });

    // Auto-start session на mount. НЕ блокируем повторный запуск ref'ом —
    // React Strict Mode mount-unmount-remount убивает setInterval из cleanup
    // первого mount; на втором mount нужно перезапустить start, чтобы setInterval
    // ожил снова. start() сам идемпотентен: переустанавливает phaseStartedAtRef
    // и setState(SET_PREP) → новый setInterval.
    useEffect(function () {
      let cancelled = false;
      // Ждём voice queue (если играется pre-flight cue.start_session «Начнём
      // тренировку. Проверь разогрев.»), чтобы countdown 5→0 начался ПОСЛЕ
      // фразы, а не параллельно. Без этого user слышит «Готовься. Пять.»
      // когда display уже на 3 — voice/render desync.
      const waitPromise = (HEYS.Fingers?.voice?.waitForQueue)
        ? HEYS.Fingers.voice.waitForQueue()
        : Promise.resolve();
      // Resume from snapshot if it matches this exercise; иначе обычный start.
      const useResume = initialSnapshot
        && initialSnapshot.exIdx === exIdx
        && typeof cycle.startFromSnapshot === 'function';
      const launch = function () {
        try {
          if (useResume) {
            cycle.startFromSnapshot(initialSnapshot);
          } else if (typeof cycle.start === 'function') {
            cycle.start();
          }
        } catch (e) {
          console.warn('[Fingers.ExerciseRunner] start failed:', e);
        }
      };
      waitPromise.then(function () {
        if (cancelled) return;
        launch();
      }).catch(function () {
        if (!cancelled) launch();
      });
      return function () { cancelled = true; };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const grip = Fingers.GRIPS_BY_ID && Fingers.GRIPS_BY_ID[exercise.gripId];
    const gripLabel = grip ? grip.label : exercise.gripId;
    const edgeLabel = exercise.edgeSizeMm ? exercise.edgeSizeMm + 'мм' : '—';
    const addedWeight = Number(exercise.addedWeightKg) || 0;

    if (Fingers.CountdownDisplay) {
      // Smart pause/resume: CountdownDisplay читает только onPause prop;
      // если state===PAUSED — вызываем resume, иначе pause.
      const togglePauseResume = function () {
        try {
          if (cycle.state === (Fingers.STATES && Fingers.STATES.PAUSED)) {
            cycle.resume && cycle.resume();
          } else {
            cycle.pause && cycle.pause();
          }
        } catch (e) { console.warn('[Fingers.ExerciseRunner] pause/resume failed:', e); }
      };

      // 2-step abort flow: "Прервать?" → "Записать частично?".
      // Fallback (нет ConfirmModal) — старое поведение (немедленный abort).
      const requestAbort = function () {
        const finalize = function () {
          try { cycle.abort(); } catch (_) {}
          if (onAbort) onAbort();
        };
        if (!HEYS.ConfirmModal?.show) { finalize(); return; }
        // Snap progress в момент клика (closure ловит свежие значения).
        const doneExercises = exIdx;
        const doneSets = cycle.setIdx || 0;
        const doneReps = cycle.repIdx || 0;
        const hasProgress = doneExercises > 0 || doneSets > 0 || doneReps > 0;

        HEYS.ConfirmModal.show({
          icon: '⚠',
          title: 'Прервать тренировку?',
          text: 'Текущая фаза не будет засчитана.',
          confirmText: 'Прервать',
          cancelText: 'Продолжить',
          confirmStyle: 'warning',
          onConfirm: function () {
            if (!hasProgress) { finalize(); return; }
            HEYS.ConfirmModal.show({
              icon: '💾',
              title: 'Записать прогресс?',
              text: 'Выполнено: ' + doneExercises + ' упр., '
                    + doneSets + ' подходов, ' + doneReps + ' повторов в текущем подходе.',
              confirmText: 'Записать как частично',
              cancelText: 'Не записывать',
              onConfirm: function () {
                try {
                  const totalMin = Array.isArray(exercises)
                    ? exercises.reduce(function (s, e) {
                        const oneSet = (Number(e.hangSec) + Number(e.restSec)) * Number(e.repsPerSet) + Number(e.restBetweenSetsSec);
                        return s + (oneSet * Number(e.setsCount)) / 60;
                      }, 0)
                    : 0;
                  const partialLog = {
                    version: 2,
                    programId: programId,
                    totalDurationMinutes: Math.round(totalMin),
                    exercises: exercises,
                    completedAt: new Date().toISOString(),
                    viaTimer: true,
                    partial: true,
                    partialProgress: {
                      completedExercises: doneExercises,
                      currentExerciseCompletedSets: doneSets,
                      currentExerciseCompletedRepsInCurrentSet: doneReps
                    }
                  };
                  HEYS.TrainingStep?.saveFingers?.(
                    { dateKey: dateKey, trainingIndex: trainingIndex },
                    partialLog,
                    { activityLabel: (programId && programId !== 'custom' ? programId : 'Свой конструктор') + ' (частично)' }
                  );
                  if (HEYS.Toast?.success) {
                    HEYS.Toast.success('Записано: ' + doneExercises + ' упр., ' + doneSets + ' подходов');
                  }
                } catch (e) {
                  console.warn('[Fingers.ExerciseRunner] partial save failed:', e);
                }
                try { Fingers.persistence?.clear?.(); } catch (_) {}
                finalize();
              },
              onCancel: function () {
                try { Fingers.persistence?.clear?.(); } catch (_) {}
                if (HEYS.Toast?.info) HEYS.Toast.info('Сессия прервана');
                finalize();
              }
            });
          }
        });
      };

      return h(Fingers.CountdownDisplay, {
        state: cycle.state,
        secondsLeft: cycle.secondsLeft,
        setIdx: cycle.setIdx,
        totalSets: Number(exercise.setsCount) || 3,
        repIdx: cycle.repIdx,
        totalReps: Number(exercise.repsPerSet) || 6,
        // Только название хвата — edge/вес передаются отдельными prop'ами
        // чтобы CountdownDisplay сам форматировал без дубликатов.
        gripLabel: gripLabel,
        edgeLabel: edgeLabel,
        addedWeightKg: addedWeight,
        exerciseProgress: 'Упр ' + (exIdx + 1) + '/' + totalExercises,
        onPause: togglePauseResume,
        onResume: cycle.resume,
        onAbort: requestAbort,
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

  function LiveSession({ exercises, dateKey, trainingIndex, programId, initialSnapshot, onAllDone, onAbort }) {
    // Start at snapshot.exIdx if resuming; иначе с первого упражнения.
    const startIdx = (initialSnapshot && Number.isInteger(initialSnapshot.exIdx))
      ? Math.min(Math.max(0, initialSnapshot.exIdx), Math.max(0, (exercises?.length || 1) - 1))
      : 0;
    const [exIdx, setExIdx] = useState(startIdx);
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
      dateKey: dateKey,
      trainingIndex: trainingIndex,
      exercises: exercises,
      programId: programId,
      initialSnapshot: initialSnapshot,
      onDone: handleExerciseDone,
      onAbort: onAbort
    });
  }

  // --- Main SessionUI ---
  function SessionUI({ dateKey, trainingIndex, mode, onClose, onRequestOnboarding }) {
    const [tab, setTab] = useState('programs');
    const [exercises, setExercises] = useState([]);
    const [showBib, setShowBib] = useState(false);
    const [pendingProgram, setPendingProgram] = useState(null);
    const [liveActive, setLiveActive] = useState(false);
    // initialSnapshot — заполняется при mode='continue', пробрасывается в
    // LiveSession → ExerciseRunner → cycle.startFromSnapshot. После resume
    // обнуляется чтобы повторные переключения упражнений не пытались
    // снова восстановиться из старого snapshot.
    const [initialSnapshot, setInitialSnapshot] = useState(null);
    // Summary screen после завершения live-сессии. null → не показан,
    // объект → показываем оверлей с метриками сессии перед close().
    const [sessionSummary, setSessionSummary] = useState(null);

    // Resume on continue mode: load snapshot, restore exercises + program, прыгнуть в live.
    useEffect(function () {
      if (mode !== 'continue') return;
      try {
        const loaded = Fingers.persistence && Fingers.persistence.load && Fingers.persistence.load();
        if (!loaded || !loaded.snapshot) return;
        const snap = loaded.snapshot;
        if (!Array.isArray(snap.exercises) || !snap.exercises.length) return;
        setExercises(snap.exercises);
        if (snap.programId && typeof Fingers.getProgramById === 'function') {
          const prog = Fingers.getProgramById(snap.programId);
          if (prog) setPendingProgram(prog);
        }
        setInitialSnapshot(snap);
        setLiveActive(true);
      } catch (e) {
        console.warn('[Fingers.SessionUI] resume from snapshot failed:', e);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const profile = getProfile();
    const userBoard = profile.fingerboardId || null;
    // Age fail-closed: null если не указан в профиле — конструктор покажет
    // guard вместо опасных хватов (ранее дефолтилось 18 → fail-open).
    const userAge = Number.isFinite(Number(profile.age)) ? Number(profile.age) : null;
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
      let saveOk = true;
      try {
        HEYS.TrainingStep?.saveFingers?.(
          { dateKey, trainingIndex },
          fingersLog,
          { activityLabel: pendingProgram?.name || 'Свой конструктор' }
        );
        // Toast только для manual-save (план). При завершении через таймер
        // показываем summary-карточку (см. ниже) — она сама подтверждает save.
        if (!o.viaTimer && HEYS.Toast?.success) {
          HEYS.Toast.success('План тренировки сохранён');
        }
      } catch (e) {
        saveOk = false;
        console.warn('[SessionUI] saveFingers failed:', e);
        if (HEYS.Toast?.warn) HEYS.Toast.warn('Не удалось сохранить — попробуй ещё раз');
      }
      // Live-сессия (через таймер) → показываем summary-карточку перед close,
      // чтобы юзер видел результат и понял что данные сохранены.
      // Manual-save (с конструктора) → сразу close, summary не нужен.
      if (o.viaTimer && saveOk) {
        const totalReps = exercises.reduce(function (s, e) {
          return s + (Number(e.repsPerSet) || 0) * (Number(e.setsCount) || 0);
        }, 0);
        setSessionSummary({
          programName: pendingProgram?.name || 'Свой конструктор',
          totalMin: Math.round(totalMin),
          totalReps: totalReps,
          exercisesCount: exercises.length,
          dateKey: dateKey || (new Date().toISOString().slice(0, 10)),
        });
        // Persistence уже очищается в LiveSession.onComplete → можно close
        // только по явному дисмиссу из summary.
        return;
      }
      if (onClose) onClose();
    }, [exercises, pendingProgram, dateKey, trainingIndex, onClose]);

    const handleDismissSummary = useCallback(function () {
      setSessionSummary(null);
      if (onClose) onClose();
    }, [onClose]);

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
          // voice.say теперь serial queue (heys_fingers_voice_v1.js) — фраза
          // «Начинаем тренировку. Проверь разогрев.» сыграется первой,
          // потом timer добавит «Готовься. Пять.» в очередь, не накладывая.
          try { Fingers.voice?.say?.('cue.start_session'); } catch (_) {}
          setLiveActive(true);
        }
      });
    }, [exercises, pendingProgram, dateKey]);

    const handleLiveAllDone = useCallback(function () {
      setLiveActive(false);
      setInitialSnapshot(null);
      try { Fingers.voice?.say?.('cue.session_done'); } catch (_) {}
      handleComplete({ viaTimer: true });
    }, [handleComplete]);

    const handleLiveAbort = useCallback(function () {
      // Toast/save flow handled inside ExerciseRunner.requestAbort (2-step modal).
      // Здесь только воспроизводим audio cue и закрываем live overlay.
      setLiveActive(false);
      setInitialSnapshot(null);
      try { Fingers.voice?.say?.('cue.session_aborted'); } catch (_) {}
    }, []);

    // Live session берёт весь экран — табы и header скрыты
    if (liveActive) {
      return h('div', { className: 'fingers-fs-live' },
        h(LiveSession, {
          exercises: exercises,
          dateKey: dateKey,
          trainingIndex: trainingIndex,
          programId: pendingProgram?.id || 'custom',
          initialSnapshot: initialSnapshot,
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
          padding: '12px 0 24px', gap: 8 } },
        h('h1', { style: { margin: 0, fontSize: 22, minWidth: 0, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '🤚 Тренировка'),
        h('div', { style: { display: 'flex', gap: 6, flexShrink: 0 } },
          onRequestOnboarding ? h('button', {
            className: 'fingers-fs-ghost',
            onClick: function () {
              if (HEYS.ConfirmModal?.show) {
                HEYS.ConfirmModal.show({
                  icon: '⚙',
                  title: 'Перенастроить',
                  text: 'Сбросить ответы онбординга и перепройти заново? ' +
                    'Это пересчитает рекомендованную программу. Существующие записи в дневнике сохранятся.',
                  confirmText: 'Перепройти',
                  cancelText: 'Отмена',
                  onConfirm: function () { onRequestOnboarding(); }
                });
              } else {
                onRequestOnboarding();
              }
            },
            style: { padding: '8px 10px', fontSize: 13 },
            'aria-label': 'Перенастроить профиль (перепройти онбординг)',
            title: 'Перенастроить'
          }, '⚙') : null,
          h('button', {
            className: 'fingers-fs-ghost',
            onClick: function () { setShowBib(true); },
            style: { padding: '8px 12px', fontSize: 13 },
            'aria-label': 'Источники и методология'
          }, '📚')
        )
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
            onClick: function () { setTab(t.id); }
            // styles в CSS (.fingers-fs-tab) — иконка/текст как flex column,
            // умещаются без обрезания на 390px
          },
            h('span', { key: 'i' }, t.icon),
            h('span', { key: 'l' }, t.label)
          );
        })
      ),

      // Tab content
      h('div', { className: 'fingers-fs-tab-content' },
        tab === 'programs' && h(ProgramsTab, {
          onPickProgram: handlePickProgram,
          onRequestOnboarding: onRequestOnboarding,
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
      }),

      // Summary screen — показывается после автозавершения через таймер.
      // Backdrop + центральная карточка с метриками + CTA «Закрыть».
      sessionSummary && h('div', {
        className: 'fingers-fs-summary-backdrop',
        onClick: function (e) { if (e.target === e.currentTarget) handleDismissSummary(); },
        style: {
          position: 'fixed', inset: 0, zIndex: 2200,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 16,
        }
      },
        h('div', {
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': 'Сессия завершена',
          style: {
            background: 'var(--fingers-bg, #fff)', borderRadius: 16,
            width: '100%', maxWidth: 440,
            padding: '28px 24px 20px',
            display: 'flex', flexDirection: 'column', gap: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          }
        },
          h('div', { style: { fontSize: 44, lineHeight: 1, textAlign: 'center' } }, '🎉'),
          h('h2', {
            style: { margin: 0, fontSize: 22, fontWeight: 700, textAlign: 'center',
              color: 'var(--fingers-text, #1a1a1f)' }
          }, 'Сессия завершена'),
          h('div', { style: { fontSize: 14, opacity: 0.7, textAlign: 'center', marginTop: -8 } },
            sessionSummary.programName),
          h('div', {
            style: { display: 'flex', gap: 12, marginTop: 4 }
          },
            h('div', {
              style: { flex: 1, padding: '14px 10px', borderRadius: 10,
                background: 'rgba(120,120,128,0.08)', textAlign: 'center' }
            },
              h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--fingers-accent, #0066ff)' } },
                sessionSummary.totalMin),
              h('div', { style: { fontSize: 11, opacity: 0.65, marginTop: 2 } }, 'минут')
            ),
            h('div', {
              style: { flex: 1, padding: '14px 10px', borderRadius: 10,
                background: 'rgba(120,120,128,0.08)', textAlign: 'center' }
            },
              h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--fingers-accent, #0066ff)' } },
                sessionSummary.exercisesCount),
              h('div', { style: { fontSize: 11, opacity: 0.65, marginTop: 2 } }, 'упражнений')
            ),
            h('div', {
              style: { flex: 1, padding: '14px 10px', borderRadius: 10,
                background: 'rgba(120,120,128,0.08)', textAlign: 'center' }
            },
              h('div', { style: { fontSize: 24, fontWeight: 700, color: 'var(--fingers-accent, #0066ff)' } },
                sessionSummary.totalReps),
              h('div', { style: { fontSize: 11, opacity: 0.65, marginTop: 2 } }, 'висов')
            )
          ),
          h('div', {
            style: {
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(22, 163, 74, 0.10)',
              color: '#15803d', fontSize: 13, lineHeight: 1.4,
              display: 'flex', gap: 8, alignItems: 'center',
            }
          },
            h('span', null, '✓'),
            h('span', null, 'Сохранено в дневник на ' + sessionSummary.dateKey)
          ),
          h('button', {
            className: 'fingers-fs-cta',
            onClick: handleDismissSummary,
            style: { width: '100%', padding: '12px 20px', fontSize: 15, marginTop: 4 }
          }, 'Закрыть')
        )
      )
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
