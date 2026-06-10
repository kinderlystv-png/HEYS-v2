// heys_fingers_onboarding_v1.js — Wizard первого входа в модуль Fingers.
// Wave 3: первичная настройка профиля + safety acknowledgement + recommendation.
//
// Public API:
//   HEYS.Fingers.Onboarding({ onComplete, onSkip })   — React component (FC)
//   HEYS.Fingers.isOnboarded()                         — boolean (completed?)
//   HEYS.Fingers.resetOnboarding()                     — стереть state (для re-onboarding)
//   HEYS.Fingers.getOnboardingState()                  — текущий LS-снапшот
//
// Storage (per-client via cidPrefix):
//   key:  `heys_${cid}_finger_onboarding` (или `heys_finger_onboarding` если cid пуст)
//   shape: { step, completed, path, themeId, profile, recommendedProgramId, pushOptIn }
//
// Flow (6 экранов):
//   0. Welcome + theme + path picker (quick | full)
//   1. Profile (age, climbingYears, maxVGrade)        [full only]
//   2. Age warning                                    [full only, если age<18]
//   3. Safety disclaimer                              [full only]
//   4. Equipment (board + scale)                      [full only]
//   5. Recommendation + notifications + done
//
// Reuse-зависимости (defensive — каждая под `if (...)`):
//   HEYS.Fingers.PROGRAMS, ageGate, BOARDS, SourceBadge
//   HEYS.utils.lsGet/lsSet, HEYS.currentClientId
//   HEYS.push?.subscribe(), HEYS.Toast?.success?.()

;(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const Fingers = HEYS.Fingers = HEYS.Fingers || {};

  if (Fingers.Onboarding__registered) return; // idempotent
  Fingers.Onboarding__registered = true;

  const React = global.React;
  const h = React && React.createElement;

  // ─── Storage helpers ─────────────────────────────────────────────────

  function _getKey() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? `heys_${cid}_finger_onboarding` : 'heys_finger_onboarding';
  }

  // Prefill из глобального профиля HEYS (birthDate → age, ранее введённый
  // fingerboardProfile если onboarding запускается повторно).
  function _calcAgeFromBirthDate(birthDate) {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    return age > 0 && age < 120 ? age : null;
  }

  function _readGlobalProfile() {
    try {
      const get = HEYS.utils && HEYS.utils.lsGet;
      if (typeof get === 'function') return get('heys_profile', {}) || {};
      const raw = localStorage.getItem('heys_profile');
      return raw ? JSON.parse(raw) : {};
    } catch (_) {
      return {};
    }
  }

  function _defaultState() {
    const globalProfile = _readGlobalProfile();
    const fp = (globalProfile && globalProfile.fingerboardProfile) || {};
    const ageFromBirth = _calcAgeFromBirthDate(globalProfile.birthDate);
    const ageFromProfile = Number(globalProfile.age) > 0 ? Number(globalProfile.age) : null;
    return {
      step: 0,
      completed: false,
      path: null,
      themeId: _normalizeTheme(fp.themeId),
      profile: {
        age: ageFromBirth || ageFromProfile || null,
        climbingYears: Number(fp.climbingYears) || 0,
        maxVGrade: fp.maxVGrade || null,
        level: fp.level || null,
        completedPrerequisites: Array.isArray(fp.completedPrerequisites) ? fp.completedPrerequisites : [],
        // B16: цель тренировки. null → трактуется как 'strength' (старое
        // grade-поведение), чтобы апгрейд не менял рекомендации существующим.
        goal: fp.goal || null,
        hasFingerboard: fp.hasFingerboard !== false,
        hasScale: !!fp.hasScale,
        fingerboardId: fp.fingerboardId || 'beastmaker_1000',
        needsMaxHangTest: false
      },
      recommendedProgramId: null,
      pushOptIn: false
    };
  }

  function _readState() {
    try {
      const key = _getKey();
      let state = null;
      if (HEYS.utils && typeof HEYS.utils.lsGet === 'function') {
        state = HEYS.utils.lsGet(key, null);
      } else {
        const raw = localStorage.getItem(key);
        state = raw ? JSON.parse(raw) : null;
      }
      if (!state) return _defaultState();
      // Re-prefill из глобального профиля для полей, которые могут быть
      // пустыми в saved state (user закрыл wizard на Profile step без ввода).
      // Не перезаписываем непустые значения — user мог ввести и сохранить.
      const globalProfile = _readGlobalProfile();
      state.profile = state.profile || {};
      if (state.profile.age == null) {
        const ageFromBirth = _calcAgeFromBirthDate(globalProfile.birthDate);
        const ageFromProfile = Number(globalProfile.age) > 0 ? Number(globalProfile.age) : null;
        const prefilled = ageFromBirth || ageFromProfile;
        if (prefilled) state.profile.age = prefilled;
      }
      return state;
    } catch (e) {
      console.warn('[Fingers.Onboarding] read failed:', e);
      return _defaultState();
    }
  }

  function _writeState(state) {
    try {
      const key = _getKey();
      if (HEYS.utils && typeof HEYS.utils.lsSet === 'function') {
        HEYS.utils.lsSet(key, state);
      } else {
        localStorage.setItem(key, JSON.stringify(state));
      }
      // При завершении onboarding — синхронизировать fingerboardProfile в
      // глобальный профиль HEYS чтобы при reset/re-onboarding значения
      // подгружались, а другие модули (constructor, etc.) могли их читать.
      if (state && state.completed) _syncToGlobalProfile(state);
      return true;
    } catch (e) {
      console.warn('[Fingers.Onboarding] write failed:', e);
      return false;
    }
  }

  function _syncToGlobalProfile(state) {
    try {
      const get = HEYS.utils && HEYS.utils.lsGet;
      const set = HEYS.utils && HEYS.utils.lsSet;
      if (typeof get !== 'function' || typeof set !== 'function') return;
      const global = get('heys_profile', {}) || {};
      global.fingerboardProfile = Object.assign({}, global.fingerboardProfile || {}, {
        themeId: state.themeId,
        climbingYears: state.profile?.climbingYears,
        maxVGrade: state.profile?.maxVGrade,
        level: state.profile?.level,
        completedPrerequisites: Array.isArray(state.profile?.completedPrerequisites)
          ? state.profile.completedPrerequisites : [],
        goal: state.profile?.goal,
        hasFingerboard: state.profile?.hasFingerboard,
        hasScale: state.profile?.hasScale,
        fingerboardId: state.profile?.fingerboardId,
        onboardingPath: state.path,
        recommendedProgramId: state.recommendedProgramId,
        completedAt: Date.now()
      });
      set('heys_profile', global);
    } catch (e) {
      console.warn('[Fingers.Onboarding] global profile sync failed:', e);
    }
  }

  // Темы: оставлены 2 — 'A' (HEYS native) и 'C' (Climbing, default).
  // Тема 'B' (Custom blue) удалена; legacy profile со старым value мигрируется в 'C'.
  function _normalizeTheme(themeId) {
    return (themeId === 'A' || themeId === 'C') ? themeId : 'C';
  }

  function _applyTheme(themeId) {
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        document.documentElement.setAttribute('data-fingers-theme', _normalizeTheme(themeId));
      }
    } catch (_) { /* swallow */ }
  }

  // ─── Public non-React API ────────────────────────────────────────────

  Fingers.isOnboarded = function isOnboarded() {
    const s = _readState();
    return !!(s && s.completed);
  };

  Fingers.resetOnboarding = function resetOnboarding() {
    try {
      _writeState(_defaultState());
      _applyTheme('C');
      return true;
    } catch (e) {
      console.warn('[Fingers.Onboarding] reset failed:', e);
      return false;
    }
  };

  Fingers.getOnboardingState = function getOnboardingState() {
    return _readState();
  };

  // ─── Recommendation logic ────────────────────────────────────────────

  function _computeRecommendedProgramId(profile) {
    if (!profile) return 'beastmaker_1000_beginner';
    if (profile.noEquipment || profile.hasFingerboard === false) return 'nelson_no_hangs';
    const age = Number(profile.age);
    if (Number.isFinite(age) && age < 14) return 'nelson_no_hangs';
    // B16: цель перебивает grade-логику для non-strength целей.
    if (profile.goal === 'recovery') return 'nelson_no_hangs';
    if (profile.goal === 'endurance' || profile.goal === 'maintenance') return 'repeaters_7_3';
    const g = profile.maxVGrade;
    if (g === 'V0-V2' || g === 'V3-V4' || g === 'none') return 'beastmaker_1000_beginner';
    if (g === 'V5-V6') return 'repeaters_7_3';
    if (g === 'V7-V8' || g === 'V9+') return 'horst_max_hangs';
    return 'beastmaker_1000_beginner';
  }

  // ─── Reusable UI atoms ───────────────────────────────────────────────

  // Стили онбординга — см. apps/web/styles/modules/fingers.css (fingers-ob-*).
  // Здесь объект STYLES удалён в премиум-редизайне.

  function _renderSourceBadge(sourceId) {
    if (Fingers.SourceBadge && h) {
      return h(Fingers.SourceBadge, { key: sourceId, sourceId: sourceId });
    }
    return null;
  }

  function _renderDots(currentStep, totalSteps) {
    const dots = [];
    for (let i = 0; i < totalSteps; i++) {
      dots.push(h('span', { key: i, className: 'fingers-ob-dot' + (i === currentStep ? ' is-active' : '') }));
    }
    return h('div', { className: 'fingers-ob-dots' }, dots);
  }

  // ─── Screen renderers ────────────────────────────────────────────────

  // Screen 0: Welcome + theme + path
  function _renderWelcome(state, setState, onComplete) {
    const VALUES = [
      { icon: '📚', text: 'Программы из науки' },
      { icon: '🎙', text: 'Голосовой коуч на русском' },
      { icon: '🛡', text: 'Recovery-aware' }
    ];
    const THEMES = [
      { id: 'C', label: 'Climbing' },
      { id: 'A', label: 'HEYS native' }
    ];

    function chooseTheme(themeId) {
      _applyTheme(themeId);
      const next = Object.assign({}, state, { themeId: themeId });
      _writeState(next);
      setState(next);
    }

    function chooseQuick() {
      const profile = Object.assign({}, state.profile, {
        age: 18, maxVGrade: 'V3-V4', hasFingerboard: true, hasScale: false
      });
      const recId = _computeRecommendedProgramId(profile);
      const next = Object.assign({}, state, {
        path: 'quick',
        profile: profile,
        recommendedProgramId: recId,
        completed: true,
        step: 5
      });
      _writeState(next);
      setState(next);
      try { if (HEYS.Toast && typeof HEYS.Toast.success === 'function') HEYS.Toast.success('Готово!'); } catch (_) {}
      if (typeof onComplete === 'function') onComplete(next);
    }

    function chooseFull() {
      const next = Object.assign({}, state, { path: 'full', step: 1 });
      _writeState(next);
      setState(next);
    }

    return h('div', { className: 'fingers-ob-welcome' },
      h('div', { className: 'fingers-ob-hero', 'aria-hidden': 'true' },
        h('div', { className: 'fingers-ob-hero__title' },
          h('h1', { className: 'fingers-ob-hero__h1' }, 'Тренировка пальцев'),
          h('p', { className: 'fingers-ob-hero__sub' }, 'Серьёзный подход к силе хвата')
        )
      ),
      h('div', { className: 'fingers-ob-values' },
        VALUES.map((v, i) => h('div', { key: i },
          h('span', { 'aria-hidden': 'true' }, v.icon),
          h('span', null, v.text)
        ))
      ),
      h('div', { className: 'fingers-ob-theme-block' },
        h('div', { className: 'fingers-ob-label' }, 'Тема'),
        h('div', { className: 'fingers-ob-theme-row' },
          THEMES.map((t) => h('button', {
            key: t.id,
            type: 'button',
            onClick: () => chooseTheme(t.id),
            className: 'fingers-ob-chip fingers-ob-chip--theme' + (state.themeId === t.id ? ' is-active' : '')
          }, t.label))
        )
      ),
      h('div', { className: 'fingers-ob-welcome__actions' },
        h('button', { type: 'button', onClick: chooseQuick, className: 'fingers-ob-btn fingers-ob-btn--primary' }, 'Начать быстро'),
        h('button', { type: 'button', onClick: chooseFull, className: 'fingers-ob-btn fingers-ob-btn--secondary' }, 'Полный setup')
      )
    );
  }

  // Screen 1: Profile (full path)
  function _renderProfile(state, setState) {
    const GRADES = ['V0-V2', 'V3-V4', 'V5-V6', 'V7-V8', 'V9+', 'none'];
    const GRADE_LABELS = { 'V0-V2': 'V0-V2', 'V3-V4': 'V3-V4', 'V5-V6': 'V5-V6', 'V7-V8': 'V7-V8', 'V9+': 'V9+', 'none': 'Не лажу' };
    const LEVELS = ['beginner', 'intermediate', 'advanced', 'elite'];
    const LEVEL_LABELS = {
      beginner: 'Новичок',
      intermediate: 'Средний',
      advanced: 'Продвинутый',
      elite: 'Элитный'
    };
    const LEVEL_HINTS = {
      beginner: 'Первые месяцы работы на пальцы: только базовые и щадящие протоколы.',
      intermediate: 'Есть регулярная база лазания и пальцы спокойно переносят умеренные висы.',
      advanced: '2+ года регулярной нагрузки на пальцы без травм связок; могут открываться малые ребра.',
      elite: 'Долгая история целевой подготовки пальцев без травм; высокий объём и интенсивность уже привычны.'
    };
    // B16: цель тренировки. Влияет на рекомендацию программы.
    const GOALS = ['strength', 'endurance', 'recovery', 'maintenance'];
    const GOAL_LABELS = { strength: '💪 Сила', endurance: '🔄 Выносливость', recovery: '🌿 Восстановление', maintenance: '⚖️ Поддержка' };

    function updateProfile(patch) {
      const profile = Object.assign({}, state.profile, patch);
      const next = Object.assign({}, state, { profile: profile });
      _writeState(next);
      setState(next);
    }

    function chooseLevel(level) {
      const apply = function () { updateProfile({ level: level }); };
      if (level !== 'advanced' && level !== 'elite') {
        apply();
        return;
      }
      const text = (LEVEL_LABELS[level] || level) + ' уровень означает не грейд лазания, а стаж адаптации пальцев: регулярная нагрузка на пальцы, спокойная переносимость висов и отсутствие травм связок. Этот выбор может открыть протоколы с малым ребром и высокой нагрузкой.';
      if (HEYS.ConfirmModal && HEYS.ConfirmModal.show) {
        HEYS.ConfirmModal.show({
          icon: '!',
          title: 'Подтвердить уровень',
          text: text,
          confirmText: 'Подтвердить',
          cancelText: 'Отмена',
          onConfirm: apply
        });
      } else if (typeof window === 'undefined' || window.confirm(text)) {
        apply();
      }
    }

    // Late-binding prefill: глобальный profile может подгружаться из cloud
    // асинхронно (heys_profile через HEYS.store). Если state.profile.age
    // пустой на момент render — вычисляем prefilled значение прямо здесь
    // (без useEffect — нарушение Rules of Hooks в condionally-вызываемой
    // функции renderer). При user-edit или Next — persisted в state.
    const displayedAge = state.profile.age != null
      ? state.profile.age
      : (function () {
          const gp = _readGlobalProfile();
          return _calcAgeFromBirthDate(gp.birthDate)
            || (Number(gp.age) > 0 ? Number(gp.age) : '');
        })();

    function next() {
      // На «Далее» — persistим displayedAge в state если user не вводил вручную.
      const persistedAge = state.profile.age != null
        ? state.profile.age
        : (displayedAge === '' ? null : Number(displayedAge));
      const age = Number(persistedAge);
      const needsWarn = Number.isFinite(age) && age < 18;
      const ns = Object.assign({}, state, {
        step: needsWarn ? 2 : 3,
        profile: Object.assign({}, state.profile, { age: persistedAge })
      });
      _writeState(ns);
      setState(ns);
    }

    const ageNum = Number(displayedAge);
    const canNext = Number.isFinite(ageNum) && ageNum >= 8 && ageNum <= 99;

    return h('div', { className: 'fingers-ob-step' },
      h('div', { className: 'fingers-ob-step__header' },
        h('h2', { className: 'fingers-ob-h2' }, 'Профиль'),
        h('p', { className: 'fingers-ob-sub' }, 'Несколько коротких вопросов для подбора программы.')
      ),
      h('div', { className: 'fingers-ob-stepcard' },
        h('div', { className: 'fingers-ob-row2' },
          h('div', null,
            h('label', { className: 'fingers-ob-label', htmlFor: 'fingers-ob-age' }, 'Возраст *'),
            h('input', {
              id: 'fingers-ob-age',
              type: 'number',
              min: 8, max: 99,
              value: displayedAge === '' ? '' : displayedAge,
              onChange: (e) => updateProfile({ age: e.target.value === '' ? null : Number(e.target.value) }),
              className: 'fingers-ob-input'
            })
          ),
          h('div', null,
            h('label', { className: 'fingers-ob-label', htmlFor: 'fingers-ob-years' }, 'Стаж, лет'),
            h('input', {
              id: 'fingers-ob-years',
              type: 'number',
              min: 0, max: 50,
              value: state.profile.climbingYears || 0,
              onChange: (e) => updateProfile({ climbingYears: Math.max(0, Math.min(50, Number(e.target.value) || 0)) }),
              className: 'fingers-ob-input'
            })
          )
        ),
        h('div', null,
          h('div', { className: 'fingers-ob-label' }, 'Максимальная сложность боулдеринга'),
          h('div', { className: 'fingers-ob-chip-row' },
            GRADES.map((g) => h('button', {
              key: g,
              type: 'button',
              onClick: () => updateProfile({ maxVGrade: g }),
              className: 'fingers-ob-chip' + (state.profile.maxVGrade === g ? ' is-active' : '')
            }, GRADE_LABELS[g]))
          )
        ),
        h('div', null,
          h('div', { className: 'fingers-ob-label' }, 'Уровень fingerboard-тренировок'),
          h('div', { className: 'fingers-ob-chip-row' },
            LEVELS.map((level) => h('button', {
              key: level,
              type: 'button',
              onClick: () => chooseLevel(level),
              className: 'fingers-ob-chip' + (state.profile.level === level ? ' is-active' : '')
            }, LEVEL_LABELS[level]))
          ),
          h('p', { className: 'fingers-ob-note' },
            LEVEL_HINTS[state.profile.level] || 'Уровень здесь — это опыт нагрузки на пальцы, а не максимальный грейд.')
        ),
        h('div', null,
          h('div', { className: 'fingers-ob-label' }, 'Цель тренировок'),
          h('div', { className: 'fingers-ob-chip-row' },
            GOALS.map((gl) => h('button', {
              key: gl,
              type: 'button',
              onClick: () => updateProfile({ goal: gl }),
              className: 'fingers-ob-chip' + (state.profile.goal === gl ? ' is-active' : '')
            }, GOAL_LABELS[gl]))
          )
        )
      ),
      h('button', {
        type: 'button',
        onClick: next,
        disabled: !canNext,
        className: 'fingers-ob-btn fingers-ob-btn--primary' + (!canNext ? ' is-disabled' : '')
      }, 'Далее')
    );
  }

  // Screen 2: Age warning
  // React FC — hooks разрешены т.к. component всегда mounts/unmounts целиком
  // (vs функция-renderer которая вызывается conditionally — нарушение Rules of Hooks).
  function AgeWarningStep(props) {
    const state = props.state;
    const setState = props.setState;
    const age = Number(state.profile.age);
    const ageGate = Fingers.ageGate;
    const restriction = (ageGate && typeof ageGate.getRestrictionMessage === 'function')
      ? ageGate.getRestrictionMessage(age)
      : null;

    const [acknowledged, setAck] = React.useState(false);

    function next() {
      // Для < 14 → restrict access (только nelson_no_hangs); completed:true сразу
      if (age < 14) {
        const profile = Object.assign({}, state.profile, { hasFingerboard: false, noEquipment: true });
        const recId = 'nelson_no_hangs';
        const ns = Object.assign({}, state, {
          profile: profile,
          recommendedProgramId: recId,
          completed: true,
          step: 5
        });
        _writeState(ns);
        setState(ns);
      } else {
        // 14-17: дальше на safety
        const ns = Object.assign({}, state, { step: 3 });
        _writeState(ns);
        setState(ns);
      }
    }

    if (!restriction) {
      // age >= 18 — skip
      const ns = Object.assign({}, state, { step: 3 });
      _writeState(ns);
      setState(ns);
      return null;
    }

    const title = restriction.title || 'Возрастные ограничения';
    const message = restriction.message || '';
    const sourceIds = restriction.sourceIds || [];

    return h('div', { className: 'fingers-ob-step' },
      h('div', { className: 'fingers-ob-step__header' },
        h('h2', { className: 'fingers-ob-h2' }, 'Возрастные ограничения')
      ),
      h('div', { className: 'fingers-ob-warn' },
        h('div', { style: { fontWeight: 600, marginBottom: 6 } }, title),
        h('div', null, message),
        h('div', { className: 'fingers-ob-badges' }, sourceIds.map(_renderSourceBadge))
      ),
      age < 14
        ? h('button', { type: 'button', onClick: next, className: 'fingers-ob-btn fingers-ob-btn--primary' }, 'Я понял, ограничения применены')
        : h('div', null,
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', fontSize: 14 } },
              h('input', {
                type: 'checkbox',
                checked: acknowledged,
                onChange: (e) => setAck(!!e.target.checked),
                style: { width: 18, height: 18 }
              }),
              h('span', null, 'Понимаю ограничения')
            ),
            h('button', {
              type: 'button',
              onClick: next,
              disabled: !acknowledged,
              className: 'fingers-ob-btn fingers-ob-btn--primary' + (!acknowledged ? ' is-disabled' : '')
            }, 'Далее')
          )
    );
  }

  // Screen 3: Safety
  function _renderSafety(state, setState) {
    function next() {
      // Раньше шёл на step 4 (Equipment); теперь сразу на Done.
      // Equipment выбирается tab-bar'ом над шапкой fingers.
      // Дефолт hasFingerboard=true гарантирован в _readState (line 84).
      const ns = Object.assign({}, state, { step: 5 });
      _writeState(ns);
      setState(ns);
    }

    const RULES = [
      '1. Разогрев 15-20 мин — обязателен (RAMP).',
      '2. Не тренируйся через боль в пальцах.',
      '3. ≥48ч между max-сессиями.'
    ];

    return h('div', { className: 'fingers-ob-step' },
      h('div', { className: 'fingers-ob-step__header' },
        h('h2', { className: 'fingers-ob-h2' }, 'Безопасность'),
        h('p', { className: 'fingers-ob-sub' }, 'Три правила, которые сохранят твои пальцы.')
      ),
      h('div', { className: 'fingers-ob-stepcard' },
        RULES.map((r, i) => h('div', { key: i, className: 'fingers-ob-rule' }, r)),
        h('div', { className: 'fingers-ob-badges' },
          _renderSourceBadge('uiaa_medcom'),
          _renderSourceBadge('schoffl2021'),
          _renderSourceBadge('physivantage_collagen')
        )
      ),
      h('button', { type: 'button', onClick: next, className: 'fingers-ob-btn fingers-ob-btn--primary' }, 'Прочитал и принимаю')
    );
  }

  // Screen 4: Equipment
  function _renderEquipment(state, setState) {
    const BOARDS = (Fingers && Array.isArray(Fingers.BOARDS)) ? Fingers.BOARDS : [];

    function pickEquipment(type) {
      let patch = {};
      if (type === 'full') {
        patch = { hasFingerboard: true, noEquipment: false, edgeLimit: null };
      } else if (type === 'door') {
        patch = { hasFingerboard: true, noEquipment: false, edgeLimit: 25 };
      } else if (type === 'none') {
        patch = { hasFingerboard: false, noEquipment: true, edgeLimit: null, hasScale: false };
      }
      const profile = Object.assign({}, state.profile, patch);
      const next = Object.assign({}, state, { profile: profile });
      _writeState(next);
      setState(next);
    }

    function toggleScale(v) {
      const profile = Object.assign({}, state.profile, { hasScale: !!v });
      const ns = Object.assign({}, state, { profile: profile });
      _writeState(ns);
      setState(ns);
    }

    function pickBoard(id) {
      const profile = Object.assign({}, state.profile, { fingerboardId: id });
      const ns = Object.assign({}, state, { profile: profile });
      _writeState(ns);
      setState(ns);
    }

    function next() {
      // Если path=full и hasScale=true и есть fingerboard — пометить needsMaxHangTest
      const profile = state.profile || {};
      const needs = !!(profile.hasScale && profile.hasFingerboard);
      const newProfile = Object.assign({}, profile, { needsMaxHangTest: needs });
      const ns = Object.assign({}, state, { profile: newProfile, step: 5 });
      _writeState(ns);
      setState(ns);
    }

    const p = state.profile || {};
    const eqType = p.noEquipment ? 'none' : (p.edgeLimit === 25 ? 'door' : 'full');

    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
      h('h2', { className: 'fingers-ob-h2' }, 'Оборудование'),
      h('p', { className: 'fingers-ob-sub' }, 'Что у тебя есть?'),
      h('div', null,
        h('div', {
          onClick: () => pickEquipment('full'),
          className: 'fingers-ob-radio' + (eqType === 'full' ? ' is-active' : '')
        },
          h('span', { style: { fontSize: 22 } }, '🪜'),
          h('span', null, 'Полный fingerboard')
        ),
        h('div', {
          onClick: () => pickEquipment('door'),
          className: 'fingers-ob-radio' + (eqType === 'door' ? ' is-active' : '')
        },
          h('span', { style: { fontSize: 22 } }, '🚪'),
          h('span', null, 'Door frame / portable')
        ),
        h('div', {
          onClick: () => pickEquipment('none'),
          className: 'fingers-ob-radio' + (eqType === 'none' ? ' is-active' : '')
        },
          h('span', { style: { fontSize: 22 } }, '🤚'),
          h('span', null, 'Нет оборудования — буду делать No-Hangs')
        )
      ),
      (eqType === 'full' || eqType === 'door') ? h('div', null,
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', fontSize: 14 } },
          h('input', {
            type: 'checkbox',
            checked: !!p.hasScale,
            onChange: (e) => toggleScale(e.target.checked),
            style: { width: 18, height: 18 }
          }),
          h('span', null, 'Есть кухонные весы для измерения хвата')
        )
      ) : null,
      (eqType === 'full' && BOARDS.length) ? h('div', null,
        h('label', { className: 'fingers-ob-label', htmlFor: 'fingers-ob-board' }, 'Модель доски'),
        h('select', {
          id: 'fingers-ob-board',
          value: p.fingerboardId || 'beastmaker_1000',
          onChange: (e) => pickBoard(e.target.value),
          className: 'fingers-ob-input'
        }, BOARDS.map((b) => h('option', { key: b.id, value: b.id }, b.label || b.id)))
      ) : null,
      h('button', { type: 'button', onClick: next, className: 'fingers-ob-btn fingers-ob-btn--primary' }, 'Далее')
    );
  }

  // Screen 5: Recommendation + notifications + done
  // React FC — hooks разрешены (component mounts/unmounts целиком).
  function DoneStep(props) {
    const state = props.state;
    const setState = props.setState;
    const onComplete = props.onComplete;
    const [pushOn, setPushOn] = React.useState(state.pushOptIn !== false);
    const [busy, setBusy] = React.useState(false);

    const recId = state.recommendedProgramId || _computeRecommendedProgramId(state.profile);
    const PROGRAMS = (Fingers && Array.isArray(Fingers.PROGRAMS)) ? Fingers.PROGRAMS : [];
    let program = null;
    for (let i = 0; i < PROGRAMS.length; i++) {
      if (PROGRAMS[i] && PROGRAMS[i].id === recId) { program = PROGRAMS[i]; break; }
    }

    async function finish() {
      if (busy) return;
      setBusy(true);
      let pushSucceeded = false;
      if (pushOn && HEYS && HEYS.push && typeof HEYS.push.subscribe === 'function') {
        try {
          const r = await HEYS.push.subscribe();
          pushSucceeded = !!(r && (r.ok || r.subscribed || r === true));
        } catch (e) {
          console.warn('[Fingers.Onboarding] push subscribe failed:', e);
        }
      }
      const ns = Object.assign({}, state, {
        recommendedProgramId: recId,
        pushOptIn: !!pushOn && pushSucceeded,
        completed: true,
        step: 5
      });
      _writeState(ns);
      setState(ns);
      try { if (HEYS.Toast && typeof HEYS.Toast.success === 'function') HEYS.Toast.success('Готово!'); } catch (_) {}
      setBusy(false);
      if (typeof onComplete === 'function') onComplete(ns);
    }

    const cardChildren = program ? [
      h('div', { key: 'h', style: { fontSize: 12, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 } }, 'Рекомендуем'),
      h('div', { key: 'n', style: { fontSize: 18, fontWeight: 600, marginBottom: 4 } }, program.name || program.id),
      program.description ? h('div', { key: 'd', style: { fontSize: 14, color: 'var(--text-muted, #64748b)', lineHeight: 1.5, marginBottom: 8 } }, program.description) : null,
      h('div', { key: 'm', style: { fontSize: 13, color: 'var(--text-muted, #64748b)', marginBottom: 8 } },
        'Уровень: ', String(program.level || '—'),
        ' · Длительность: ', String(program.durationMin || '—'), ' мин'
      ),
      h('div', { key: 's', className: 'fingers-ob-badges' },
        (program.sourceIds || []).slice(0, 2).map(_renderSourceBadge)
      )
    ] : [
      h('div', { key: 'm', className: 'fingers-ob-sub' }, 'Программа подобрана.')
    ];

    const needsMaxHangNote = state.profile && state.profile.needsMaxHangTest;

    return h('div', { className: 'fingers-ob-step' },
      h('div', { className: 'fingers-ob-step__header' },
        h('h2', { className: 'fingers-ob-h2' }, 'Почти готово')
      ),
      h('div', { className: 'fingers-ob-card' }, cardChildren),
      needsMaxHangNote ? h('div', { style: { fontSize: 13, color: 'var(--text-muted, #64748b)', padding: '4px 4px 0' } },
        '💡 Не забудь сделать Max Hang Test в Прогресс табе.'
      ) : null,
      h('div', { className: 'fingers-ob-card' },
        h('label', { style: { display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: pushOn,
            onChange: (e) => setPushOn(!!e.target.checked),
            style: { width: 18, height: 18 }
          }),
          h('span', null, 'Напоминать через 48ч когда пальцы восстановились')
        )
      ),
      h('button', {
        type: 'button',
        onClick: finish,
        disabled: busy,
        className: 'fingers-ob-btn fingers-ob-btn--primary' + (busy ? ' is-busy' : '')
      }, busy ? 'Сохраняю…' : 'Готово, открыть программы')
    );
  }

  // ─── Main component ──────────────────────────────────────────────────

  function Onboarding(props) {
    if (!React || !h) {
      console.warn('[Fingers.Onboarding] React not available');
      return null;
    }
    const onComplete = props && props.onComplete;
    const onSkip = props && props.onSkip;

    const [state, setState] = React.useState(_readState);

    // Apply theme on mount
    React.useEffect(() => { _applyTheme(state.themeId); }, []);

    // Auto-redirect away from age warning if age >= 18 (Screen 2 case)
    React.useEffect(() => {
      if (state.step === 2) {
        const age = Number(state.profile && state.profile.age);
        if (Number.isFinite(age) && age >= 18) {
          const ns = Object.assign({}, state, { step: 3 });
          _writeState(ns);
          setState(ns);
        }
      }
    }, [state.step]);

    // Если completed — ничего не рендерим (caller сам решит mount/unmount).
    if (state.completed && state.step >= 5) {
      return null;
    }

    function goBack() {
      // Возврат: 1→0, 2→1, 3→ (age<18 ? 2 : 1), 4→3, 5→4
      let prev = state.step - 1;
      if (state.step === 3) {
        const age = Number(state.profile && state.profile.age);
        prev = (Number.isFinite(age) && age < 18) ? 2 : 1;
      }
      if (prev < 0) prev = 0;
      const ns = Object.assign({}, state, { step: prev });
      _writeState(ns);
      setState(ns);
    }

    let screen = null;
    let showBack = false;
    // 5 step'ов после удаления Equipment-шага (его место — tab-bar над шапкой
    // fingers, чтобы можно было менять оборудование между сессиями).
    let showDots = state.path === 'full';
    let totalSteps = 5;

    if (state.step === 0) {
      screen = _renderWelcome(state, setState, onComplete);
    } else if (state.step === 1) {
      screen = _renderProfile(state, setState);
      showBack = true;
    } else if (state.step === 2) {
      // FC (а не renderer-функция) — hooks внутри AgeWarningStep корректны.
      screen = h(AgeWarningStep, { state: state, setState: setState });
      showBack = true;
    } else if (state.step === 3) {
      screen = _renderSafety(state, setState);
      showBack = true;
    } else if (state.step === 4 || state.step === 5) {
      // Step 4 (Equipment) удалён — но старые LS-снапшоты могут иметь step=4.
      // Перенаправляем в Done. Step=5 рендерит Done нативно.
      screen = h(DoneStep, { state: state, setState: setState, onComplete: onComplete });
      showBack = state.path === 'full';
    }

    const children = [];
    if (showBack) {
      children.push(h('button', {
        key: 'back',
        type: 'button',
        onClick: goBack,
        className: 'fingers-ob-back',
        'aria-label': 'Назад'
      }, '← Назад'));
    }
    if (showDots) {
      children.push(h('div', { key: 'dots', style: { marginTop: showBack ? 36 : 0 } },
        _renderDots(state.step, totalSteps)
      ));
    }
    children.push(h('div', { key: 'screen' }, screen));

    // Skip-link на welcome (если caller передал onSkip)
    if (state.step === 0 && typeof onSkip === 'function') {
      children.push(h('div', { key: 'skip', style: { textAlign: 'center', marginTop: 4 } },
        h('button', { type: 'button', onClick: onSkip, className: 'fingers-ob-btn-ghost' }, 'Пропустить')
      ));
    }

    return h('div', {
      className: 'fingers-fs-onboarding fingers-ob-root'
    }, children);
  }

  Fingers.Onboarding = Onboarding;
})(typeof window !== 'undefined' ? window : globalThis);
