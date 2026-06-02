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
  // Сканирует историю fingers-сессий за lookbackDays и считает session-level
  // achievements для текущей завершённой сессии. Возвращает {
  //   isFirstEver, isFirstOfProgram, isVolumePR, prevBestHangSec, comebackDays
  // }. Используется в session summary для achievement chips.
  function _computeSessionAchievements(currentLog, dateKey, lookbackDays) {
    const lookback = Math.max(30, Math.min(365, lookbackDays || 365));
    const u = HEYS.utils;
    if (!u || !u.lsGet || !currentLog) {
      return { isFirstEver: true, isFirstOfProgram: true, isVolumePR: false, prevBestHangSec: 0, comebackDays: 0 };
    }
    const todayKey = dateKey || new Date().toISOString().slice(0, 10);
    let prevSessions = 0;
    let prevOfProgram = 0;
    let prevBestHangSec = 0;
    let lastSessionKey = null;
    const today = new Date();
    for (let i = 0; i < lookback; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const key = y + '-' + m + '-' + dd;
      const day = u.lsGet('heys_dayv2_' + key, null);
      if (!day || !Array.isArray(day.trainings)) continue;
      for (let k = 0; k < day.trainings.length; k++) {
        const tr = day.trainings[k];
        if (!tr || tr.type !== 'fingers') continue;
        // Сегодняшнюю текущую сессию мы пропускаем (она уже сохранена сверху)
        if (key === todayKey && tr.fingersLog && currentLog.completedAt
          && tr.fingersLog.completedAt === currentLog.completedAt) continue;
        prevSessions++;
        if (!lastSessionKey) lastSessionKey = key;
        const log = tr.fingersLog || {};
        if (log.programId === currentLog.programId) prevOfProgram++;
        // Volume PR: общее время виса предыдущих сессий
        let hangSec = 0;
        if (Array.isArray(log.exercises)) {
          for (let e = 0; e < log.exercises.length; e++) {
            const ex = log.exercises[e];
            hangSec += (Number(ex.hangSec) || 0)
              * (Number(ex.repsPerSet) || 0)
              * (Number(ex.setsCount) || 0);
          }
        }
        if (hangSec > prevBestHangSec) prevBestHangSec = hangSec;
      }
    }
    // Compute current session totalHangSec
    let curHangSec = 0;
    if (Array.isArray(currentLog.exercises)) {
      for (let e = 0; e < currentLog.exercises.length; e++) {
        const ex = currentLog.exercises[e];
        curHangSec += (Number(ex.hangSec) || 0)
          * (Number(ex.repsPerSet) || 0)
          * (Number(ex.setsCount) || 0);
      }
    }
    let comebackDays = 0;
    if (lastSessionKey) {
      const lp = lastSessionKey.split('-');
      const lastDate = new Date(Number(lp[0]), Number(lp[1]) - 1, Number(lp[2]));
      const tp = todayKey.split('-');
      const curDate = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]));
      comebackDays = Math.round((curDate - lastDate) / 86400000);
    }
    return {
      isFirstEver: prevSessions === 0,
      isFirstOfProgram: prevOfProgram === 0,
      isVolumePR: curHangSec > prevBestHangSec && prevBestHangSec > 0,
      prevBestHangSec: prevBestHangSec,
      curHangSec: curHangSec,
      comebackDays: comebackDays
    };
  }

  // Сканирует последние lookbackDays дней heys_dayv2_<date> и собирает
  // Map<programId, dateKey> последней сессии для каждого протокола. Используется
  // в ProgramsTab для chip «Сделал N дней назад». Возвращает {} если utils нет.
  function _scanLastDoneByProgram(lookbackDays) {
    const lookback = Math.max(7, Math.min(365, lookbackDays || 90));
    const u = HEYS.utils;
    if (!u || !u.lsGet) return {};
    const result = Object.create(null);
    const today = new Date();
    for (let i = 0; i < lookback; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const dateKey = y + '-' + m + '-' + dd;
      const day = u.lsGet('heys_dayv2_' + dateKey, null);
      if (!day || !Array.isArray(day.trainings)) continue;
      for (let k = 0; k < day.trainings.length; k++) {
        const tr = day.trainings[k];
        if (!tr || tr.type !== 'fingers') continue;
        const pid = tr.fingersLog && tr.fingersLog.programId;
        if (!pid) continue;
        if (!result[pid]) result[pid] = dateKey; // самый свежий — мы идём от сегодня
      }
    }
    return result;
  }

  // Human-friendly расстояние от dateKey до сегодня. «Сегодня / вчера / N дней
  // назад / N недель назад / N месяцев назад». Используется только для отображения.
  function _humanizeDaysAgo(dateKey) {
    if (!dateKey || typeof dateKey !== 'string') return '';
    const m = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    const target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - target) / 86400000);
    if (diffDays <= 0) return 'сегодня';
    if (diffDays === 1) return 'вчера';
    if (diffDays < 7) return diffDays + ' дн. назад';
    if (diffDays < 30) {
      const w = Math.round(diffDays / 7);
      return w + (w === 1 ? ' нед. назад' : ' нед. назад');
    }
    const months = Math.round(diffDays / 30);
    if (months < 12) return months + ' мес. назад';
    return 'давно';
  }

  // Разбивает описание на первое предложение + остаток для accordion-разворота.
  // Первое предложение — до первого `.`, `!`, `?` + пробел. Если описание
  // короткое или граница не найдена — `rest` пустой и accordion не показывается.
  function _splitDescription(text) {
    if (typeof text !== 'string') return { first: '', rest: '' };
    const trimmed = text.trim();
    if (trimmed.length <= 140) return { first: trimmed, rest: '' };
    const m = trimmed.match(/^([^.!?]+[.!?])\s+(.+)$/s);
    if (!m) return { first: trimmed, rest: '' };
    return { first: m[1], rest: m[2] };
  }

  // Сворачиваемое описание: первое предложение всегда видно, остаток —
  // под «Подробнее». State локальный per-card.
  function ProgramDesc({ text }) {
    const [expanded, setExpanded] = useState(false);
    const { first, rest } = _splitDescription(text || '');
    if (!rest) {
      return h('p', { className: 'fingers-fs-program-card__desc' }, first);
    }
    return h('div', { className: 'fingers-fs-program-card__desc-wrap' },
      h('p', { className: 'fingers-fs-program-card__desc' },
        first,
        ' ',
        !expanded && h('button', {
          type: 'button',
          className: 'fingers-fs-program-card__desc-toggle',
          onClick: function () { setExpanded(true); },
          'aria-expanded': false
        }, 'Подробнее')
      ),
      expanded && h('div', { className: 'fingers-fs-program-card__desc-rest' },
        h('p', { className: 'fingers-fs-program-card__desc' }, rest),
        h('button', {
          type: 'button',
          className: 'fingers-fs-program-card__desc-toggle',
          onClick: function () { setExpanded(false); },
          'aria-expanded': true
        }, 'Свернуть')
      )
    );
  }

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

  // Возвращает приоритет-список program ID по grade — рекомендатор пройдётся
  // по нему и выберет первый который проходит equipment + age фильтр.
  function _gradePreferenceList(grade) {
    if (grade === 'V0-V2' || grade === 'V3-V4') {
      return ['beastmaker_1000_beginner', 'repeaters_7_3', 'block_hangs_horst',
        'nelson_density_hangs', 'horst_towel_pulls', 'nelson_no_hangs'];
    }
    if (grade === 'V5-V6') {
      return ['repeaters_7_3', 'block_min_edge', 'block_hangs_horst',
        'horst_max_hangs', 'nelson_density_hangs', 'horst_towel_pulls', 'nelson_no_hangs'];
    }
    if (grade === 'V7-V8' || grade === 'V9+') {
      return ['horst_max_hangs', 'block_hangs_horst', 'min_edge_progression',
        'block_min_edge', 'repeaters_7_3', 'nelson_density_hangs', 'horst_towel_pulls', 'nelson_no_hangs'];
    }
    return ['beastmaker_1000_beginner', 'nelson_density_hangs', 'nelson_no_hangs'];
  }

  function getRecommendedProgramId() {
    const fp = getProfile();
    if (fp.recommendedProgramId) return fp.recommendedProgramId;
    // Возраст не указан → не рекомендуем ничего (UI покажет prompt "укажи возраст").
    // Дефолт 18 раньше → подростки без профиля автоматом получали adult-программы.
    const ageNum = Number(fp.age);
    if (!Number.isFinite(ageNum)) return null;
    // Sub-14 → жёстко no-hangs независимо от снаряжения (UIAA/BMC: до 14 fingerboard запрещён).
    if (ageNum < 14) return 'nelson_no_hangs';

    // Сужаем PROGRAMS по age + equipment, потом берём первый из grade-prefs
    // который выжил. Это гарантирует что рекомендация всегда совпадает с тем
    // что юзер реально видит в списке (block user → block protocol; door user
    // → door-compatible; none user → noEquipment).
    const programs = Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : [];
    const ageFiltered = (Fingers.ageGate && Fingers.ageGate.filterPrograms)
      ? Fingers.ageGate.filterPrograms(programs, ageNum) : programs;
    const eqOpts = {
      equipmentTypes: Array.isArray(fp.equipmentTypes) ? fp.equipmentTypes : null,
      noEquipment: !!fp.noEquipment,
      blockMode: !!fp.blockMode,
      edgeLimit: fp.edgeLimit
    };
    const eligible = Fingers.filterProgramsByEquipment
      ? Fingers.filterProgramsByEquipment(ageFiltered, eqOpts) : ageFiltered;
    if (!eligible.length) return null;
    const eligibleIds = new Set(eligible.map(function (p) { return p.id; }));

    const g = fp.maxVGrade || 'V3-V4';
    const prefs = _gradePreferenceList(g);
    for (let i = 0; i < prefs.length; i++) {
      if (eligibleIds.has(prefs[i])) return prefs[i];
    }
    // Если grade-prefs не пересеклись с eligible — fallback на первый eligible
    // (любой видимый протокол лучше чем «нет рекомендации»).
    return eligible[0].id;
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

  // Pre-flight checklist — Wave 6 polish: пункты загораются зелёным
  // поочерёдно с задержкой ~700ms, заставляя юзера прочитать вместо
  // прокликивания. Кнопка «Всё ОК» приглушена ~2.4s через CSS-animated
  // arm (см. .fingers-fs-preflight-go в стилях).
  function PreflightChecklist(props) {
    const extraNotes = (props && props.extraNotes) || [];
    const items = [
      { id: 'warmup', text: 'Разогрев 15-20 мин (RAMP: Raise/Activate/Mobilize/Potentiate)' },
      { id: 'pain',   text: 'Нет острой боли в пальцах и PIP суставах' },
      { id: 'temp',   text: 'Не на холодные руки' }
    ];
    const STEP_MS = 700;
    const [doneCount, setDoneCount] = useState(0);
    useEffect(function () {
      if (doneCount >= items.length) return undefined;
      const t = setTimeout(function () {
        setDoneCount(function (n) { return Math.min(items.length, n + 1); });
      }, STEP_MS);
      return function () { clearTimeout(t); };
    }, [doneCount]);

    return h('div', { className: 'fingers-fs-preflight' },
      h('ul', { className: 'fingers-fs-preflight-list', role: 'list' },
        items.map(function (item, i) {
          const done = i < doneCount;
          return h('li', {
            key: item.id,
            className: 'fingers-fs-preflight-item' + (done ? ' is-done' : ''),
            'aria-checked': done ? 'true' : 'false',
            role: 'checkbox'
          },
            h('span', { className: 'fingers-fs-preflight-check', 'aria-hidden': 'true' },
              done ? h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
                h('path', { d: 'M3 7.5l2.5 2.5L11 4.5',
                  stroke: 'currentColor', strokeWidth: 2,
                  strokeLinecap: 'round', strokeLinejoin: 'round' })
              ) : null
            ),
            h('span', { className: 'fingers-fs-preflight-text' }, item.text)
          );
        })
      ),
      extraNotes.length > 0 ? h('div', { className: 'fingers-fs-preflight-notes' },
        extraNotes.map(function (n, i) {
          return h('div', { key: 'n' + i, className: 'fingers-fs-preflight-note' },
            h('span', { 'aria-hidden': 'true' }, n.icon || 'ℹ'),
            h('span', null, n.text)
          );
        })
      ) : null
    );
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
    const ageFilteredAll = Fingers.ageGate && Fingers.ageGate.filterPrograms
      ? Fingers.ageGate.filterPrograms(programs, ageRaw)
      : programs;
    // Equipment-фильтр: показываем только релевантные для выбранного оборудования.
    // Multi-select: equipmentTypes — массив активных, union программ.
    // Legacy single-state поля поддерживаются через _legacyToTypes (catalog).
    const eqOpts = {
      equipmentTypes: Array.isArray(profile.equipmentTypes) ? profile.equipmentTypes : null,
      noEquipment: !!profile.noEquipment,
      blockMode: !!profile.blockMode,
      edgeLimit: profile.edgeLimit
    };
    const filtered = (Fingers.filterProgramsByEquipment)
      ? Fingers.filterProgramsByEquipment(ageFilteredAll, eqOpts)
      : ageFilteredAll;
    // Map<programId, dateKey> последней сессии — для chip «Сделал N дней назад».
    // Скан 90 дней (~3 мес), useMemo чтоб не перерасчитывать на каждый render.
    const lastDoneByProgram = useMemo(function () {
      return _scanLastDoneByProgram(90);
    }, []);

    // Intensity filter: 'all' | 'recovery' | 'moderate' | 'max'.
    // Localstorage-persisted чтобы фильтр не сбрасывался при перезагрузке.
    const [intensityFilter, setIntensityFilter] = useState(function () {
      const u = HEYS.utils;
      const v = u && u.lsGet ? u.lsGet('fingers_intensity_filter', 'all') : 'all';
      return ['all', 'recovery', 'moderate', 'max'].indexOf(v) >= 0 ? v : 'all';
    });
    const onPickFilter = useCallback(function (val) {
      setIntensityFilter(val);
      if (HEYS.utils && HEYS.utils.lsSet) HEYS.utils.lsSet('fingers_intensity_filter', val);
    }, []);
    // Применяем intensity-фильтр поверх age+equipment.
    const visibleFiltered = intensityFilter === 'all'
      ? filtered
      : filtered.filter(function (p) { return (p.intensity || 'moderate') === intensityFilter; });
    // Подсчёт штук на каждый filter — показываем в чипе «Все (12)», «Восстановление (3)»
    const counts = { all: filtered.length, recovery: 0, moderate: 0, max: 0 };
    filtered.forEach(function (p) {
      const i = p.intensity || 'moderate';
      if (counts[i] != null) counts[i]++;
    });

    if (!ageKnown) {
      // CTA: заполнить возраст через re-onboarding.
      return h('div', { className: 'fingers-fs-empty', style: { padding: 24, textAlign: 'center' } },
        h('div', { style: { fontSize: 32, marginBottom: 12 } }, '🎂'),
        h('h3', { style: { margin: '0 0 8px', fontSize: 17 } }, 'Укажи возраст для рекомендаций'),
        h('p', { style: { margin: '0 0 16px', fontSize: 14, opacity: 0.75, lineHeight: 1.45 } },
          'Без возраста мы не показываем протоколы — это safety-настройка ' +
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
          'Протоколы недоступны для возраста ' + ageRaw),
        restr ? h('p', { style: { fontSize: 13, opacity: 0.75, lineHeight: 1.4 } }, restr.message) : null
      );
    }

    const filterChips = [
      { id: 'all',      label: 'Все',           emoji: null },
      { id: 'recovery', label: 'Восстановление', emoji: '🌿' },
      { id: 'moderate', label: 'Умеренно',      emoji: '⚡' },
      { id: 'max',      label: 'Максимум',      emoji: '🔥' }
    ];

    // Readiness banner — широкая карточка наверху, читает cooldownCheck.
    // Намеренно отличается от pill-фильтра ниже: горизонтальный layout с
    // крупной иконкой и подзаголовком — пользователь видит «что советует
    // организм», а ниже сам выбирает чем фильтровать.
    const cool = (Fingers.cooldownCheck && typeof Fingers.cooldownCheck === 'function')
      ? (function () { try { return Fingers.cooldownCheck(); } catch (_) { return null; } })()
      : null;

    // Readiness-aware launch guard. Сравниваем intensity протокола с тем,
    // что разрешает cooldown (rest/recovery → не выше recovery; moderate →
    // не выше moderate). Если выше — перехватываем onPickProgram и просим
    // подтверждение.
    const INTENSITY_RANK = { recovery: 0, moderate: 1, max: 2 };
    const READINESS_CEILING = { rest: 0, recovery: 0, moderate: 1, max: 2 };
    const [pendingRisky, setPendingRisky] = useState(null);
    const safeLaunch = useCallback(function (program) {
      const r = cool && cool.recommendation;
      const ceiling = (r && READINESS_CEILING[r] != null) ? READINESS_CEILING[r] : 2;
      const need = INTENSITY_RANK[program.intensity || 'moderate'];
      if (need > ceiling) {
        setPendingRisky({ program: program, readiness: r, hours: cool && cool.hoursSinceLast });
        return;
      }
      onPickProgram(program);
    }, [cool, onPickProgram]);

    // Микс-генератор — собирает ad-hoc программу по выбранным tier'ам.
    // Генерится автоматически при изменении userTypes/intensityFilter, юзер
    // может перегенерировать через reroll.
    const userTypes = Array.isArray(profile.equipmentTypes) && profile.equipmentTypes.length
      ? profile.equipmentTypes
      : (profile.noEquipment ? ['none']
        : profile.blockMode ? ['block']
        : profile.edgeLimit === 25 ? ['door']
        : ['full']);
    const [mixedWorkout, setMixedWorkout] = useState(null);
    const [mixSeed, setMixSeed] = useState(0);
    // Локальная intensity микса — отдельный toggle внутри карточки.
    // Default = moderate, persisted в LS чтоб не сбрасывалась.
    const [mixIntensity, setMixIntensity] = useState(function () {
      const u = HEYS.utils;
      const v = u && u.lsGet ? u.lsGet('fingers_mix_intensity', 'moderate') : 'moderate';
      return ['recovery', 'moderate', 'max'].indexOf(v) >= 0 ? v : 'moderate';
    });
    const onPickMixIntensity = useCallback(function (v) {
      setMixIntensity(v);
      if (HEYS.utils && HEYS.utils.lsSet) HEYS.utils.lsSet('fingers_mix_intensity', v);
    }, []);
    useEffect(function () {
      if (!Fingers.generateMixedWorkout) return;
      const w = Fingers.generateMixedWorkout({
        equipmentTypes: userTypes,
        intensity: mixIntensity,
        age: ageRaw,
        readiness: cool && cool.recommendation
      });
      setMixedWorkout(w);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userTypes.join(','), mixIntensity, ageRaw, cool && cool.recommendation, mixSeed]);
    const onGenerateMix = useCallback(function () { setMixSeed(function (n) { return n + 1; }); }, []);
    let readinessBanner = null;
    if (cool) {
      const READINESS_MAP = {
        max:      { icon: '🔥', title: 'Готов к максимуму',         sub: 'После прошлой сессии прошло достаточно времени — можно жёстко.' },
        moderate: { icon: '⚡', title: 'Готов к умеренной нагрузке', sub: 'Сегодня — repeaters или density, но без max-hangs.' },
        recovery: { icon: '🌿', title: 'Только восстановление',     sub: 'Связки ещё восстанавливаются — лёгкие no-hangs или антагонисты.' },
        rest:     { icon: '💤', title: 'Сегодня — день отдыха',      sub: 'Меньше 24ч после max — любая нагрузка повышает риск травмы пальцев.' }
      };
      const conf = Object.assign({}, READINESS_MAP[cool.recommendation] || READINESS_MAP.max);
      if (cool.hoursSinceLast == null) {
        conf.sub = 'История пуста — стартуй с того, что под рукой.';
      } else {
        const h_ago = Math.max(0, cool.hoursSinceLast);
        const human = h_ago < 24 ? Math.round(h_ago) + 'ч назад'
          : Math.round(h_ago / 24) + ' дн. назад';
        conf.sub += ' Последняя сессия: ' + human + '.';
      }
      readinessBanner = h('div', {
        className: 'fingers-fs-readiness-banner',
        'data-readiness': cool.recommendation,
        role: 'status',
        'aria-live': 'polite'
      },
        h('div', { className: 'fingers-fs-readiness-banner__icon', 'aria-hidden': 'true' }, conf.icon),
        h('div', { className: 'fingers-fs-readiness-banner__body' },
          h('div', { className: 'fingers-fs-readiness-banner__title' }, conf.title),
          h('div', { className: 'fingers-fs-readiness-banner__sub' }, conf.sub)
        )
      );
    }

    return h('div', { className: 'fingers-fs-programs-wrap' },
      readinessBanner,
      h('div', { className: 'fingers-fs-intensity-filter', role: 'tablist', 'aria-label': 'Фильтр по интенсивности' },
        filterChips.map(function (fc) {
          const active = intensityFilter === fc.id;
          const count = counts[fc.id];
          const disabled = count === 0 && fc.id !== 'all';
          return h('button', {
            key: fc.id,
            type: 'button',
            className: 'fingers-fs-intensity-filter__chip'
              + (active ? ' is-active' : '')
              + (disabled ? ' is-disabled' : ''),
            'data-intensity': fc.id,
            'aria-pressed': active,
            disabled: disabled,
            onClick: function () { if (!disabled) onPickFilter(fc.id); }
          },
            fc.emoji ? h('span', { 'aria-hidden': 'true' }, fc.emoji + ' ') : null,
            fc.label,
            h('span', { className: 'fingers-fs-intensity-filter__count' }, ' ' + count)
          );
        })
      ),
      // Генерированная микс-карточка — оранжевая, отличается от обычных
      // протоколов. Подсказка «не нашли подходящего — попробуй случайный».
      mixedWorkout ? h('div', { className: 'fingers-fs-mixcard' },
        h('div', { className: 'fingers-fs-mixcard__hint' },
          h('span', { 'aria-hidden': 'true' }, '✨ '),
          'Не нашёл подходящий протокол? Попробуй случайную сборку по умному алгоритму:'
        ),
        h('div', { className: 'fingers-fs-mixcard__inner' },
          h('div', { className: 'fingers-fs-mixcard__head-row' },
            h('div', { className: 'fingers-fs-mixcard__badge' },
              h('span', { 'aria-hidden': 'true' }, '🎲'),
              ' Микс'
            ),
            h('div', { className: 'fingers-fs-mixcard__intensity-toggle', role: 'tablist', 'aria-label': 'Мощность тренировки' },
              [
                { id: 'recovery', label: 'лёгкая',   emoji: '🌿' },
                { id: 'moderate', label: 'умеренная', emoji: '⚡' },
                { id: 'max',      label: 'жёсткая',  emoji: '🔥' }
              ].map(function (opt) {
                const active = mixIntensity === opt.id;
                return h('button', {
                  key: opt.id,
                  type: 'button',
                  role: 'tab',
                  'aria-selected': active,
                  className: 'fingers-fs-mixcard__int-btn'
                    + (active ? ' is-active' : ''),
                  'data-intensity': opt.id,
                  onClick: function () { onPickMixIntensity(opt.id); }
                },
                  h('span', { 'aria-hidden': 'true' }, opt.emoji + ' '),
                  opt.label
                );
              })
            )
          ),
          h('h3', { className: 'fingers-fs-mixcard__title' }, mixedWorkout.name),
          h('p', { className: 'fingers-fs-mixcard__desc' }, mixedWorkout.description),
          h('div', { className: 'fingers-fs-mixcard__chips' },
            h('span', { className: 'fingers-fs-chip fingers-fs-chip--intensity',
              'data-fingers-intensity': mixedWorkout.intensity || 'moderate'
            }, intensityLabel(mixedWorkout.intensity)),
            h('span', { className: 'fingers-fs-chip' },
              h('span', { 'aria-hidden': 'true' }, '⏱ '),
              mixedWorkout.durationMin + ' мин'),
            h('span', { className: 'fingers-fs-chip' },
              mixedWorkout.exercises.length + ' упр')
          ),
          h('div', { className: 'fingers-fs-mixcard__equipment' },
            (mixedWorkout.equipmentTypes || []).map(function (t) {
              const meta = ({
                full: { icon: '🪜', label: 'Board' },
                block: { icon: '💪', label: 'Block' },
                door: { icon: '🚪', label: 'Door' },
                none: { icon: '🤚', label: 'No-Hangs' }
              })[t] || { icon: '·', label: t };
              return h('span', {
                key: t,
                className: 'fingers-fs-equipment-chip is-available',
                'data-equipment': t
              },
                h('span', { 'aria-hidden': 'true' }, meta.icon), ' ', meta.label
              );
            })
          ),
          h('div', { className: 'fingers-fs-mixcard__actions' },
            h('button', {
              type: 'button',
              className: 'fingers-fs-mixcard__btn fingers-fs-mixcard__btn--reroll',
              onClick: onGenerateMix,
              title: 'Другой набор упражнений'
            },
              h('span', { 'aria-hidden': 'true' }, '🔄')
            ),
            h('button', {
              type: 'button',
              className: 'fingers-fs-mixcard__btn fingers-fs-mixcard__btn--launch',
              onClick: function () { safeLaunch(mixedWorkout); }
            }, 'Запустить микс')
          )
        )
      ) : null,

      visibleFiltered.length === 0
        ? h('div', { className: 'fingers-fs-empty', style: { padding: '24px 16px', textAlign: 'center' } },
            h('p', { style: { margin: 0, fontSize: 14, opacity: 0.7 } },
              'Нет протоколов с интенсивностью «' + (filterChips.find(function (c) { return c.id === intensityFilter; }) || {}).label + '» под текущее оборудование.')
          )
        : h('div', { className: 'fingers-fs-program-grid' },
      visibleFiltered.map(function (p) {
        const isRec = p.id === recommendedId;
        return h('div', {
          key: p.id,
          className: 'fingers-fs-program-card' + (isRec ? ' fingers-fs-program-card--recommended' : '')
        },
          isRec && h('div', {
            className: 'fingers-fs-program-card__rec-badge',
            'aria-label': 'Рекомендовано для тебя'
          },
            h('span', { className: 'fingers-fs-program-card__rec-star', 'aria-hidden': 'true' }, '★'),
            h('span', null, 'для тебя')
          ),
          h('h3', { className: 'fingers-fs-program-card__title' }, p.name),
          h(ProgramDesc, { text: p.description }),
          h('div', { className: 'fingers-fs-program-card__chips' },
            h('span', {
              className: 'fingers-fs-chip fingers-fs-chip--intensity',
              'data-fingers-intensity': p.intensity || 'moderate'
            }, intensityLabel(p.intensity)),
            h('span', { className: 'fingers-fs-chip' },
              h('span', { 'aria-hidden': 'true' }, '⏱ '),
              (p.durationMin || '—') + ' мин'),
            h('span', { className: 'fingers-fs-chip fingers-fs-chip--level' }, p.level),
            // Last-done chip: показывает «✓ Сделал N дней назад» если протокол
            // был выполнен в последние 90 дней. Иначе — нейтральное «ещё не пробовал».
            (function () {
              const lastKey = lastDoneByProgram[p.id];
              if (lastKey) {
                return h('span', {
                  className: 'fingers-fs-chip fingers-fs-chip--lastdone',
                  title: 'Последняя сессия: ' + lastKey
                },
                  h('span', { 'aria-hidden': 'true' }, '✓ '),
                  'Сделал ' + _humanizeDaysAgo(lastKey)
                );
              }
              return h('span', {
                className: 'fingers-fs-chip fingers-fs-chip--lastdone fingers-fs-chip--lastdone-new'
              }, 'ещё не пробовал');
            })()
          ),
          // Equipment-чипы — какое оборудование подходит для протокола.
          // Активные (из EquipmentBar юзера) — ярко, неактивные — приглушённо.
          // Это даёт сразу понять «работает на X, но у тебя X нет — выбери в табах»
          // или «работает на Y и у тебя Y активен — отлично».
          (function () {
            // Multi-tier модель: тащим список equipmentTypes из catalog helper.
            // Для hybrid протоколов это будет ['block','door','none'] — все
            // tier'ы упражнений. Для simple — один tier.
            const tiers = Fingers.getProgramEquipmentTypes
              ? Fingers.getProgramEquipmentTypes(p)
              : [];
            const TIER_META = {
              none:  { icon: '🤚', label: 'No-Hangs' },
              block: { icon: '💪', label: 'Block' },
              door:  { icon: '🚪', label: 'Door' },
              full:  { icon: '🪜', label: 'Board' }
            };
            // Фильтруем chips по тому, что у юзера в табах активно — иначе
            // юзер видит chip Door хотя Door таб не выбран, и думает «у меня
            // же не выбрана дверь, откуда».
            const userTypes = Array.isArray(profile.equipmentTypes) && profile.equipmentTypes.length
              ? profile.equipmentTypes
              : (profile.noEquipment ? ['none']
                : profile.blockMode ? ['block']
                : profile.edgeLimit === 25 ? ['door']
                : ['full']);
            const userSet = Object.create(null);
            userTypes.forEach(function (t) { userSet[t] = true; });
            const visibleTiers = tiers.filter(function (t) { return userSet[t]; });
            // Если по какой-то причине пересечения нет (защита от баг'а
            // фильтра) — показываем все program-tier'ы как было.
            const finalTiers = visibleTiers.length > 0 ? visibleTiers : tiers;
            const eqChips = finalTiers.map(function (t) {
              const m = TIER_META[t] || { icon: '·', label: t };
              return { id: t, icon: m.icon, label: m.label };
            });
            return h('div', { className: 'fingers-fs-program-card__equipment' },
              eqChips.map(function (c) {
                return h('span', {
                  key: c.id,
                  className: 'fingers-fs-equipment-chip is-available',
                  'data-equipment': c.id,
                  title: c.label
                },
                  h('span', { 'aria-hidden': 'true' }, c.icon),
                  ' ',
                  c.label
                );
              })
            );
          })(),
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
            onClick: function () { safeLaunch(p); },
            style: { width: '100%' }
          }, 'Запустить протокол')
        );
      })
        ),
      pendingRisky && (function () {
        const r = pendingRisky.readiness;
        const restMode = r === 'rest';
        const title = restMode ? 'Сегодня — день отдыха' : 'Связки ещё восстанавливаются';
        const reason = restMode
          ? 'С прошлой максимальной сессии прошло меньше 24 часов. Сухожилия пальцев восстанавливаются медленнее мышц — нагрузка сейчас сильно повышает риск разрыва кольцевидного блока (A2/A4).'
          : 'Прошло меньше 48 часов после максимальной сессии. Сегодня лучше no-hangs или антагонисты — мышцы готовы, а связки нет.';
        const hoursTxt = pendingRisky.hours != null
          ? (pendingRisky.hours < 24 ? Math.round(pendingRisky.hours) + 'ч' : Math.round(pendingRisky.hours / 24) + ' дн.')
          : '—';
        return h('div', {
          className: 'fingers-fs-risk-overlay',
          onClick: function (e) { if (e.target === e.currentTarget) setPendingRisky(null); }
        },
          h('div', { className: 'fingers-fs-risk-modal', role: 'dialog', 'aria-modal': 'true' },
            h('div', { className: 'fingers-fs-risk-modal__icon', 'aria-hidden': 'true' }, '⚠'),
            h('h3', { className: 'fingers-fs-risk-modal__title' }, title),
            h('p', { className: 'fingers-fs-risk-modal__reason' }, reason),
            h('div', { className: 'fingers-fs-risk-modal__meta' },
              h('span', null, 'Прошло с прошлой сессии: '),
              h('strong', null, hoursTxt)
            ),
            h('div', { className: 'fingers-fs-risk-modal__actions' },
              h('button', {
                className: 'fingers-fs-risk-modal__btn fingers-fs-risk-modal__btn--secondary',
                onClick: function () { setPendingRisky(null); }
              }, 'Отмена'),
              h('button', {
                className: 'fingers-fs-risk-modal__btn fingers-fs-risk-modal__btn--danger',
                onClick: function () {
                  const prog = pendingRisky.program;
                  setPendingRisky(null);
                  onPickProgram(prog);
                }
              }, 'Всё равно начать')
            ),
            h('p', { className: 'fingers-fs-risk-modal__source' },
              'Schöffl et al. (2021): A2 — самый травмируемый блок (~70% всех pulley injuries).'
            )
          )
        );
      })()
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

  // --- Grip Picker Sheet ─────────────────────────────────────────────────
  // Bottom-sheet модалка выбора хвата для нового упражнения. Filter chips
  // по типу нагрузки + grid 8 хватов с safety-меткой (a2-ratio). Возрастной
  // age-gate автоматически прячет full crimp/mono подросткам.

  const GRIP_CATEGORIES = [
    { id: 'all',     label: 'Все',       match: function () { return true; } },
    { id: 'open',    label: 'Открытые',  match: function (g) {
      return ['openhand4', 'sloper', 'pinch'].indexOf(g.id) >= 0;
    } },
    { id: 'crimps',  label: 'Замки',     match: function (g) {
      return ['halfcrimp', 'fullcrimp'].indexOf(g.id) >= 0;
    } },
    { id: 'narrow',  label: 'N-палец',   match: function (g) {
      return ['front3', 'back3', 'mono'].indexOf(g.id) >= 0;
    } }
  ];

  function _dangerLabel(d) {
    return d === 'low' ? 'низкий риск'
      : d === 'moderate' ? 'средний риск'
      : d === 'high' ? 'высокий риск'
      : d === 'very-high' ? 'максимум' : '';
  }

  function GripPickerSheet(props) {
    const onPick = (props && props.onPick) || function () {};
    const onClose = (props && props.onClose) || function () {};
    const userAge = props && props.userAge;
    const [filter, setFilter] = useState('all');

    // Age-gate: даже если grip есть в каталоге, для возраста он может быть
    // запрещён (full crimp/mono до 18, back-3 до 16 и т.п.). Используем
    // существующий ageGate.filterGrips — fail-closed.
    const allGrips = Array.isArray(Fingers.GRIPS) ? Fingers.GRIPS : [];
    const ageFiltered = (Fingers.ageGate && Fingers.ageGate.filterGrips)
      ? Fingers.ageGate.filterGrips(allGrips, userAge)
      : allGrips;
    const category = GRIP_CATEGORIES.find(function (c) { return c.id === filter; }) || GRIP_CATEGORIES[0];
    const visible = ageFiltered.filter(category.match);

    // Escape для закрытия
    useEffect(function () {
      const onKey = function (e) { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    return h('div', {
      className: 'fingers-grip-picker__backdrop',
      onClick: onClose,
      role: 'presentation'
    },
      h('div', {
        className: 'fingers-grip-picker',
        role: 'dialog',
        'aria-label': 'Выбор хвата',
        onClick: function (e) { e.stopPropagation(); }
      },
        h('div', { className: 'fingers-grip-picker__handle', 'aria-hidden': 'true' }),
        h('div', { className: 'fingers-grip-picker__header' },
          h('h2', { className: 'fingers-grip-picker__title' }, 'Выбери хват'),
          h('button', {
            type: 'button',
            className: 'fingers-grip-picker__close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          },
            h('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.6 },
              h('path', { d: 'M5 5l10 10M15 5L5 15', strokeLinecap: 'round' })
            )
          )
        ),

        // Filter chips
        h('div', { className: 'fingers-grip-picker__filters', role: 'tablist' },
          GRIP_CATEGORIES.map(function (c) {
            const active = filter === c.id;
            const count = ageFiltered.filter(c.match).length;
            return h('button', {
              key: c.id,
              type: 'button',
              role: 'tab',
              'aria-selected': active,
              className: 'fingers-grip-picker__chip' + (active ? ' is-active' : ''),
              onClick: function () { setFilter(c.id); }
            }, c.label, count > 0 ? h('span', { className: 'fingers-grip-picker__chip-count' }, count) : null);
          })
        ),

        // Grid of grips
        visible.length === 0
          ? h('div', { className: 'fingers-grip-picker__empty' },
              h('p', null, 'Для твоего возраста в этой категории хваты недоступны.'))
          : h('div', { className: 'fingers-grip-picker__grid' },
              visible.map(function (g) {
                return h('button', {
                  key: g.id,
                  type: 'button',
                  className: 'fingers-grip-tile',
                  'data-fingers-danger': g.dangerLevel,
                  onClick: function () { onPick(g); }
                },
                  h('div', { className: 'fingers-grip-tile__icon', 'aria-hidden': 'true' },
                    h('img', {
                      src: '/exercises/' + g.id + '.webp',
                      alt: '',
                      loading: 'eager',
                      decoding: 'async',
                      onError: function (e) {
                        // Fallback на emoji-иконку если SVG-арт нет
                        try {
                          const span = document.createElement('span');
                          span.style.fontSize = '32px';
                          span.textContent = g.icon || '🖐';
                          e.target.replaceWith(span);
                        } catch (_) {}
                      }
                    })
                  ),
                  h('div', { className: 'fingers-grip-tile__name' }, g.label),
                  h('div', { className: 'fingers-grip-tile__meta' },
                    h('span', { className: 'fingers-grip-tile__a2' },
                      'A2 ×' + (g.a2ForceRatio || 1).toFixed(1)),
                    h('span', { className: 'fingers-grip-tile__danger' }, _dangerLabel(g.dangerLevel))
                  )
                );
              })
            )
      )
    );
  }

  // --- Constructor tab ---
  function ConstructorTab({ exercises, setExercises, userBoard, userAge, programName, onUnbindProgram }) {
    const [pickerOpen, setPickerOpen] = useState(false);

    const addExerciseForGrip = function (grip) {
      const opts = { boardId: userBoard, gripId: grip && grip.id ? grip.id : 'openhand4' };
      const blank = Fingers.createBlankExercise
        ? Fingers.createBlankExercise(opts)
        : { gripId: opts.gripId, edgeSizeMm: 20, addedWeightKg: 0,
            hangSec: 7, restSec: 3, repsPerSet: 6, setsCount: 3, restBetweenSetsSec: 180 };
      setExercises(exercises.concat([blank]));
      setPickerOpen(false);
    };

    const add = function () { setPickerOpen(true); };

    const updateAt = function (i, updated) {
      const next = exercises.slice();
      next[i] = updated;
      setExercises(next);
    };

    const removeAt = function (i) {
      setExercises(exercises.filter(function (_, idx) { return idx !== i; }));
    };

    const protocolLocked = !!programName;

    // Баннер «программа активна» — показывается над карточками когда выбрана
    // программа. Объясняет почему поля времени залочены + даёт unbind.
    const programBanner = protocolLocked ? h('div', {
      className: 'fingers-fs-program-banner',
      style: {
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.22)',
        borderRadius: 12, padding: '12px 14px',
        marginBottom: 12,
        display: 'flex', flexDirection: 'column', gap: 8
      }
    },
      h('div', { style: { fontSize: 13, lineHeight: 1.4, color: '#1f2937' } },
        h('span', { style: { fontWeight: 600 } }, '🔒 Протокол: ', programName), '. ',
        'Время виса, отдых и повторы зафиксированы — меняй грань и доп. вес.'
      ),
      h('button', {
        type: 'button',
        onClick: function () { if (typeof onUnbindProgram === 'function') onUnbindProgram(); },
        style: {
          alignSelf: 'flex-start',
          background: 'transparent', border: 'none',
          padding: '4px 0', cursor: 'pointer',
          color: '#4f46e5', fontSize: 12, fontWeight: 600
        }
      }, 'Отвязаться от протокола')
    ) : null;

    return h('div', { className: 'fingers-fs-constructor' },
      programBanner,
      exercises.length === 0
        ? h('div', { className: 'fingers-fs-empty', style: { padding: 32, textAlign: 'center' } },
            h('p', null, 'Пусто. Добавь упражнение или примени протокол из вкладки Протоколы.'),
            h('button', { className: 'fingers-fs-cta', onClick: add, style: { marginTop: 16 } },
              '+ Добавить упражнение'))
        : h(React.Fragment, null,
            h(ExerciseStickyBar, { count: exercises.length }),
            exercises.map(function (ex, i) {
              // Центральный разделитель «УПРАЖНЕНИЕ N ИЗ M» — отделяет карточки
              // визуально, заодно говорит юзеру где он в стеке. Линии слева/справа
              // (через flex: 1 hr) создают эффект «главы» в книге.
              const separator = h('div', {
                key: 'sep-' + i,
                className: 'fingers-fs-exercise-separator',
                style: {
                  display: 'flex', alignItems: 'center', gap: 12,
                  marginTop: i === 0 ? 0 : 28, marginBottom: 12,
                  color: '#9ca3af', fontSize: 11, fontWeight: 600,
                  letterSpacing: '0.08em', textTransform: 'uppercase'
                }
              },
                h('span', { style: { flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' } }),
                h('span', null,
                  'Упражнение ' + (i + 1) + (exercises.length > 1 ? ' из ' + exercises.length : '')),
                h('span', { style: { flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' } })
              );
              if (Fingers.ExerciseConstructor) {
                return h(React.Fragment, { key: i },
                  separator,
                  h(Fingers.ExerciseConstructor, {
                    exIdx: i,
                    exTotal: exercises.length,
                    exercise: ex,
                    userBoard: userBoard,
                    userAge: userAge,
                    protocolLocked: protocolLocked,
                    onChange: function (u) { updateAt(i, u); },
                    onRemove: function () { removeAt(i); }
                  })
                );
              }
              return h(React.Fragment, { key: i },
                separator,
                h('div', { className: 'fingers-fs-program-card' },
                  h('p', null, 'Constructor module not loaded yet.'),
                  h('pre', { style: { fontSize: 11 } }, JSON.stringify(ex, null, 2))));
            }),
            h('button', {
              className: 'fingers-fs-ghost',
              onClick: add,
              style: { width: '100%', marginTop: 16 }
            }, '+ Добавить ещё упражнение')
          ),
      // Grip picker bottom-sheet (рендерится поверх контента)
      pickerOpen ? h(GripPickerSheet, {
        userAge: userAge,
        onPick: addExerciseForGrip,
        onClose: function () { setPickerOpen(false); }
      }) : null
    );
  }

  // --- Progress tab ---
  // Утилиты Progress-таба ─────────────────────────────────────────────────
  // Все читают heys_dayv2_<dateKey> через HEYS.utils.lsGet — тот же путь,
  // что используют YearHeatmap и cooldownCheck. Один проход 365 дней даёт
  // streak + totals + recent — экономим IO.

  function _formatDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  function _readDayDiary(dateKey) {
    try {
      const u = HEYS.utils;
      if (u && typeof u.lsGet === 'function') return u.lsGet('heys_dayv2_' + dateKey, null);
    } catch (_) {}
    return null;
  }

  /**
   * Один проход по последним 365 дням → streak, totals, последние 5 сессий.
   * @returns {{streak:number, totalSessions:number, totalHolds:number, totalMinutes:number, lastSessions:Array}}
   */
  function computeProgressStats() {
    const today = new Date();
    let streak = 0;
    let totalSessions = 0;
    let totalHolds = 0;
    let totalMinutes = 0;
    const lastSessions = [];
    let streakBroken = false;
    // Weekly volume: 12 недель, считаем минуты на каждую (индекс 0 = текущая,
    // 11 = 11 недель назад). Для bar-chart на UI.
    const weeklyVolume = new Array(12).fill(0);
    // Grip usage: считаем сколько раз каждый gripId встречался в exercises.
    const gripUsage = Object.create(null);
    // Recent PRs: PR с testedAt в последние 30 дней — отдельная highlight-секция.
    // (PR-список читается напрямую из Fingers.records.get() в ProgressTab.)

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = _formatDateKey(d);
      const day = _readDayDiary(key);
      const fingersTrainings = (day && Array.isArray(day.trainings))
        ? day.trainings.filter(function (t) { return t && t.type === 'fingers'; })
        : [];
      const hasSession = fingersTrainings.length > 0;

      // Streak: считаем подряд от сегодня. Если сегодня нет — допускаем без
      // штрафа (юзер ещё не тренировался), но если на день назад тоже нет —
      // streak обрывается.
      if (!streakBroken) {
        if (hasSession) streak += 1;
        else if (i > 0) streakBroken = true; // первый день без сессии после today — обрыв
      }

      if (hasSession) {
        totalSessions += fingersTrainings.length;
        fingersTrainings.forEach(function (t) {
          const log = t.fingersLog || {};
          totalHolds += Array.isArray(log.holds) ? log.holds.length : 0;
          const dur = Number(log.totalDurationMinutes) || 0;
          totalMinutes += dur;
          // Weekly volume — кладём в bucket по неделям (i / 7).
          const weekIdx = Math.floor(i / 7);
          if (weekIdx < 12) weeklyVolume[weekIdx] += dur;
          // Grip usage — считаем уникальные хваты по exercises (без повторных
          // подсчётов одного gripId в одной сессии).
          const usedInSession = Object.create(null);
          if (Array.isArray(log.exercises)) {
            log.exercises.forEach(function (ex) {
              if (ex && ex.gripId && !usedInSession[ex.gripId]) {
                usedInSession[ex.gripId] = true;
                gripUsage[ex.gripId] = (gripUsage[ex.gripId] || 0) + 1;
              }
            });
          }
          if (lastSessions.length < 5) {
            const intensity = typeof Fingers.getProgramIntensity === 'function'
              ? Fingers.getProgramIntensity(log.programId)
              : 'moderate';
            const program = log.programId && typeof Fingers.getProgramById === 'function'
              ? Fingers.getProgramById(log.programId) : null;
            lastSessions.push({
              dateKey: key,
              programName: (program && program.name) || (log.programId === 'custom' ? 'Свой конструктор' : log.programId) || 'Тренировка',
              intensity: intensity,
              durationMin: dur || null,
              daysAgo: i
            });
          }
        });
      }
    }

    return {
      streak: streak,
      totalSessions: totalSessions,
      totalHolds: totalHolds,
      totalMinutes: totalMinutes,
      lastSessions: lastSessions,
      weeklyVolume: weeklyVolume,
      gripUsage: gripUsage
    };
  }

  function _relativeDay(daysAgo) {
    if (daysAgo === 0) return 'сегодня';
    if (daysAgo === 1) return 'вчера';
    if (daysAgo < 7) return daysAgo + ' дн назад';
    if (daysAgo < 30) return Math.floor(daysAgo / 7) + ' нед назад';
    return Math.floor(daysAgo / 30) + ' мес назад';
  }

  function _intensityRu(intensity) {
    return intensity === 'max' ? 'максимум'
      : intensity === 'recovery' ? 'восстановление'
      : 'умеренно';
  }

  function ProgressTab({ recommendedProgramId, onPickProgram }) {
    const records = (Fingers.records && Fingers.records.get) ? Fingers.records.get() : { maxHangs: {} };
    const allHangs = records.maxHangs || {};
    const slugs = Object.keys(allHangs);
    const cooldown = Fingers.cooldownCheck ? Fingers.cooldownCheck() : null;
    const mvcDue = Fingers.calibration && Fingers.calibration.isDue
      ? Fingers.calibration.isDue('maxHang', 'openhand4_20mm')
      : false;
    // Memo чтобы 365-day scan не пересчитывался на каждый render таба.
    const stats = React.useMemo(computeProgressStats, []);
    const currentYear = new Date().getFullYear();

    const isEmpty = slugs.length === 0 && stats.totalSessions === 0;

    if (isEmpty) {
      return h('div', { className: 'fingers-fs-progress' },
        h('div', { className: 'fingers-fs-progress-empty' },
          h('div', { className: 'fingers-fs-progress-empty__icon', 'aria-hidden': 'true' }, '📊'),
          h('h3', { className: 'fingers-fs-progress-empty__title' }, 'Прогресса пока нет'),
          h('p', { className: 'fingers-fs-progress-empty__hint' },
            'После первой тренировки здесь появятся серия, рекорды по хватам и календарь.'),
          recommendedProgramId && Fingers.getProgramById && h('button', {
            className: 'fingers-fs-cta',
            style: { marginTop: 18 },
            onClick: function () {
              const p = Fingers.getProgramById(recommendedProgramId);
              if (p && onPickProgram) onPickProgram(p);
            }
          }, '▶ Запустить первую тренировку')
        )
      );
    }

    return h('div', { className: 'fingers-fs-progress' },

      // ─── Hero stats: streak / сессии / время ────────────────────────────
      h('div', { className: 'fingers-fs-progress-hero' },
        h('div', { className: 'fingers-fs-progress-stat fingers-fs-progress-stat--streak' },
          h('div', { className: 'fingers-fs-progress-stat__icon', 'aria-hidden': 'true' }, '🔥'),
          h('div', { className: 'fingers-fs-progress-stat__value' }, String(stats.streak)),
          h('div', { className: 'fingers-fs-progress-stat__label' },
            stats.streak === 1 ? 'день серии' : 'дней серии')
        ),
        h('div', { className: 'fingers-fs-progress-stat' },
          h('div', { className: 'fingers-fs-progress-stat__icon', 'aria-hidden': 'true' }, '💪'),
          h('div', { className: 'fingers-fs-progress-stat__value' }, String(stats.totalSessions)),
          h('div', { className: 'fingers-fs-progress-stat__label' },
            stats.totalSessions === 1 ? 'тренировка' : 'тренировок')
        ),
        h('div', { className: 'fingers-fs-progress-stat' },
          h('div', { className: 'fingers-fs-progress-stat__icon', 'aria-hidden': 'true' }, '⏱'),
          h('div', { className: 'fingers-fs-progress-stat__value' },
            stats.totalMinutes >= 60
              ? Math.round(stats.totalMinutes / 60) + ' ч'
              : Math.round(stats.totalMinutes) + ' м'),
          h('div', { className: 'fingers-fs-progress-stat__label' }, 'всего')
        )
      ),

      // ─── Weekly volume chart (12 недель) ────────────────────────────────
      (function () {
        const wv = stats.weeklyVolume || [];
        const maxV = Math.max.apply(null, wv);
        if (maxV <= 0) return null; // нет данных
        // Реверс — слева 11 недель назад, справа сегодняшняя.
        const bars = wv.slice().reverse();
        return h('section', { className: 'fingers-fs-progress-section' },
          h('div', { className: 'fingers-fs-progress-section__header' },
            h('h3', { className: 'fingers-fs-progress-section__title' }, 'Недельный объём'),
            h('span', { className: 'fingers-fs-progress-section__hint' }, '12 недель · минут')
          ),
          h('div', { className: 'fingers-fs-volume-chart' },
            bars.map(function (val, idx) {
              const heightPct = Math.max(2, Math.round((val / maxV) * 100));
              const isCurrent = idx === bars.length - 1;
              const weeksAgo = bars.length - 1 - idx;
              const label = weeksAgo === 0 ? 'эта неделя' : weeksAgo + ' нед назад';
              return h('div', {
                key: idx,
                className: 'fingers-fs-volume-chart__bar-wrap',
                title: label + ': ' + Math.round(val) + ' мин'
              },
                h('div', {
                  className: 'fingers-fs-volume-chart__bar' + (isCurrent ? ' is-current' : ''),
                  style: { height: heightPct + '%' }
                },
                  val > 0 ? h('span', { className: 'fingers-fs-volume-chart__bar-value' }, Math.round(val)) : null
                )
              );
            })
          )
        );
      })(),

      // ─── Cooldown card (если recovery) ────────────────────────────────
      cooldown && !cooldown.allowedNow && h('div', { className: 'fingers-fs-progress-cooldown' },
        h('div', { className: 'fingers-fs-progress-cooldown__icon', 'aria-hidden': 'true' }, '🛡'),
        h('div', { className: 'fingers-fs-progress-cooldown__body' },
          h('div', { className: 'fingers-fs-progress-cooldown__title' },
            'Восстановление — ' + cooldown.recommendation),
          h('div', { className: 'fingers-fs-progress-cooldown__text' },
            'Прошло ' + Math.round(cooldown.hoursSinceLast) +
            'ч с последней сессии. Синтез коллагена в сухожилиях ещё идёт (Magnusson 2010).')
        )
      ),

      // ─── Year heatmap ──────────────────────────────────────────────────
      Fingers.YearHeatmap && h('section', { className: 'fingers-fs-progress-section' },
        h('div', { className: 'fingers-fs-progress-section__header' },
          h('h3', { className: 'fingers-fs-progress-section__title' }, 'Год тренировок'),
          h('span', { className: 'fingers-fs-progress-section__hint' }, String(currentYear))
        ),
        h(Fingers.YearHeatmap, { year: currentYear })
      ),

      // ─── Personal records ──────────────────────────────────────────────
      slugs.length > 0 && h('section', { className: 'fingers-fs-progress-section' },
        h('div', { className: 'fingers-fs-progress-section__header' },
          h('h3', { className: 'fingers-fs-progress-section__title' }, 'Личные рекорды'),
          h('span', { className: 'fingers-fs-progress-section__hint' },
            slugs.length + (slugs.length === 1 ? ' хват' : slugs.length < 5 ? ' хвата' : ' хватов'))
        ),
        h('div', { className: 'fingers-fs-progress-records' },
          slugs.map(function (slug) {
            const r = allHangs[slug];
            const main = r.type === 'weight'
              ? (r.mvcKg ? r.mvcKg.toFixed(1) + ' кг' : '—')
              : (r.holdTime ? r.holdTime.toFixed(1) + ' с' : '—');
            const m = /^(.+?)_(\d+)mm$/.exec(slug);
            const grip = m && Fingers.getGripById ? Fingers.getGripById(m[1]) : null;
            const label = m
              ? ((grip && grip.label) || m[1])
              : slug;
            const edge = m ? m[2] + ' мм' : '';
            const testedAt = r.testedAt ? new Date(r.testedAt) : null;
            const daysSince = testedAt
              ? Math.max(0, Math.floor((Date.now() - testedAt.getTime()) / (1000 * 60 * 60 * 24)))
              : null;
            return h('div', { key: slug, className: 'fingers-fs-progress-record' },
              h('div', { className: 'fingers-fs-progress-record__head' },
                h('span', { className: 'fingers-fs-progress-record__grip' }, label),
                edge && h('span', { className: 'fingers-fs-progress-record__edge' }, edge)
              ),
              h('div', { className: 'fingers-fs-progress-record__value' }, main),
              daysSince != null && h('div', { className: 'fingers-fs-progress-record__when' },
                daysSince === 0 ? 'установлен сегодня' :
                daysSince === 1 ? 'установлен вчера' :
                daysSince < 30 ? 'установлен ' + daysSince + ' дн назад' :
                'установлен ' + Math.floor(daysSince / 30) + ' мес назад')
            );
          })
        ),
        mvcDue && h('div', { className: 'fingers-fs-progress-callout' },
          h('span', { 'aria-hidden': 'true' }, '📅'),
          ' Пора re-test (прошло больше 8 недель с последнего MVC теста).')
      ),

      // ─── Recent PRs (последние 30 дней) ──────────────────────────────
      (function () {
        const allRecords = (Fingers.records && Fingers.records.get) ? Fingers.records.get() : null;
        if (!allRecords || !allRecords.maxHangs) return null;
        const cutoff = Date.now() - 30 * 86400000;
        const recent = [];
        Object.keys(allRecords.maxHangs).forEach(function (slug) {
          const r = allRecords.maxHangs[slug];
          if (!r || !r.testedAt) return;
          const t = Date.parse(r.testedAt);
          if (!isFinite(t) || t < cutoff) return;
          const m = /^(.+?)_(\d+)mm$/.exec(slug);
          const grip = m && Fingers.getGripById ? Fingers.getGripById(m[1]) : null;
          recent.push({
            slug: slug,
            label: (grip && grip.label) || (m ? m[1] : slug),
            edge: m ? m[2] : '—',
            value: r.type === 'weight'
              ? (r.mvcKg ? r.mvcKg.toFixed(1) + ' кг' : '—')
              : (r.holdTime ? r.holdTime.toFixed(1) + ' с' : '—'),
            daysAgo: Math.max(0, Math.floor((Date.now() - t) / 86400000)),
            ts: t
          });
        });
        if (recent.length === 0) return null;
        recent.sort(function (a, b) { return b.ts - a.ts; });
        return h('section', { className: 'fingers-fs-progress-section' },
          h('div', { className: 'fingers-fs-progress-section__header' },
            h('h3', { className: 'fingers-fs-progress-section__title' }, 'Свежие PR'),
            h('span', { className: 'fingers-fs-progress-section__hint' }, 'за 30 дней')
          ),
          h('div', { className: 'fingers-fs-recent-prs' },
            recent.slice(0, 5).map(function (r) {
              return h('div', { key: r.slug, className: 'fingers-fs-recent-pr' },
                h('span', { className: 'fingers-fs-recent-pr__icon', 'aria-hidden': 'true' }, '🏆'),
                h('div', { className: 'fingers-fs-recent-pr__body' },
                  h('div', { className: 'fingers-fs-recent-pr__main' },
                    h('span', { className: 'fingers-fs-recent-pr__grip' }, r.label),
                    h('span', { className: 'fingers-fs-recent-pr__edge' }, r.edge + ' мм')
                  ),
                  h('div', { className: 'fingers-fs-recent-pr__meta' },
                    r.daysAgo === 0 ? 'сегодня'
                      : r.daysAgo === 1 ? 'вчера'
                      : r.daysAgo + ' дн. назад')
                ),
                h('div', { className: 'fingers-fs-recent-pr__value' }, r.value)
              );
            })
          )
        );
      })(),

      // ─── Grip distribution: какие хваты юзер тренирует чаще ─────────
      (function () {
        const usage = stats.gripUsage || {};
        const entries = Object.keys(usage).map(function (g) { return [g, usage[g]]; });
        if (entries.length === 0) return null;
        entries.sort(function (a, b) { return b[1] - a[1]; });
        const total = entries.reduce(function (s, e) { return s + e[1]; }, 0);
        const maxV = entries[0][1];
        return h('section', { className: 'fingers-fs-progress-section' },
          h('div', { className: 'fingers-fs-progress-section__header' },
            h('h3', { className: 'fingers-fs-progress-section__title' }, 'Хваты в работе'),
            h('span', { className: 'fingers-fs-progress-section__hint' },
              entries.length + (entries.length === 1 ? ' хват' : entries.length < 5 ? ' хвата' : ' хватов'))
          ),
          h('div', { className: 'fingers-fs-grip-dist' },
            entries.map(function (e) {
              const gid = e[0];
              const cnt = e[1];
              const pct = Math.round((cnt / total) * 100);
              const widthPct = Math.max(4, Math.round((cnt / maxV) * 100));
              const grip = Fingers.getGripById ? Fingers.getGripById(gid) : null;
              const label = (grip && grip.label) || gid;
              const icon = (grip && grip.icon) || '';
              return h('div', { key: gid, className: 'fingers-fs-grip-dist__row' },
                h('div', { className: 'fingers-fs-grip-dist__label' },
                  icon ? h('span', { 'aria-hidden': 'true' }, icon + ' ') : null,
                  label
                ),
                h('div', { className: 'fingers-fs-grip-dist__bar-track' },
                  h('div', {
                    className: 'fingers-fs-grip-dist__bar-fill',
                    style: { width: widthPct + '%' }
                  })
                ),
                h('div', { className: 'fingers-fs-grip-dist__count' }, cnt + ' · ' + pct + '%')
              );
            })
          )
        );
      })(),

      // ─── Last sessions ─────────────────────────────────────────────────
      stats.lastSessions.length > 0 && h('section', { className: 'fingers-fs-progress-section' },
        h('div', { className: 'fingers-fs-progress-section__header' },
          h('h3', { className: 'fingers-fs-progress-section__title' }, 'Последние тренировки')
        ),
        h('div', { className: 'fingers-fs-progress-sessions' },
          stats.lastSessions.map(function (s) {
            return h('div', { key: s.dateKey + '_' + s.programName, className: 'fingers-fs-progress-session' },
              h('div', { className: 'fingers-fs-progress-session__main' },
                h('div', { className: 'fingers-fs-progress-session__title' }, s.programName),
                h('div', { className: 'fingers-fs-progress-session__meta' },
                  h('span', null, _relativeDay(s.daysAgo)),
                  s.durationMin ? h('span', null, '· ' + Math.round(s.durationMin) + ' мин') : null
                )
              ),
              h('span', {
                className: 'fingers-fs-progress-session__intensity',
                'data-fingers-intensity': s.intensity
              }, _intensityRu(s.intensity))
            );
          })
        )
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
    // onDayClick намеренно НЕ передаём пока bottom-sheet с деталями дня не сделан —
    // YearHeatmap читает `hasSession && onDayClick` чтобы поставить cursor:pointer.
    // Раньше передавали пустую функцию → курсор-указатель обманывал юзера, клик
    // ничего не делал (audit-finding 2026-06-01).
    return h('div', null,
      h('h3', { style: { margin: '0 0 16px' } }, '📅 Год тренировок'),
      h(Fingers.YearHeatmap, { year: currentYear })
    );
  }

  // --- Live session — ведомое выполнение упражнения с countdown timer ---
  // Каждое exercise = собственный cycle (key={exIdx} → re-mount hook'a).
  function ExerciseRunner({ exercise, exIdx, totalExercises, dateKey, trainingIndex, exercises, programId, initialSnapshot, onDone, onAbort }) {
    // keepSnapshotOnAbortRef — флаг для «Прервать → Не записывать» сценария.
    // Когда true: при переходе в ABORTED НЕ очищаем persistence, чтобы остался
    // snapshot и в SessionUI появился resume-баннер. При DONE/EXPIRED очищаем
    // всегда (нет смысла хранить завершённое).
    const keepSnapshotOnAbortRef = React.useRef(false);

    // onStateChange wired to persistence.save: snapshot пишется на переходе фазы
    // (fireStateChange зовётся только на transition, не на tick). Live remaining
    // секунд реконструируется на load() как durationSec - (now - phaseStartedAt).
    const handleStateChange = useCallback(function (nextState, meta) {
      const STATES = Fingers.STATES || {};
      if (!Fingers.persistence) return;
      if (nextState === STATES.DONE || nextState === STATES.IDLE || nextState === STATES.EXPIRED) {
        try { Fingers.persistence.clear(); } catch (_) {}
        return;
      }
      if (nextState === STATES.ABORTED) {
        if (!keepSnapshotOnAbortRef.current) {
          try { Fingers.persistence.clear(); } catch (_) {}
        }
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
        // По умолчанию snapshot переживает abort — юзер сам решает «продолжить»
        // или «удалить» через resume-banner после возврата. Очистка происходит
        // только в одном явном случае: «Записать как частично» (см. ниже).
        keepSnapshotOnAbortRef.current = true;
        if (!HEYS.ConfirmModal?.show) { finalize(); return; }
        // Snap progress в момент клика (closure ловит свежие значения).
        const doneExercises = exIdx;
        const doneSets = cycle.setIdx || 0;
        const doneReps = cycle.repIdx || 0;
        const hasProgress = doneExercises > 0 || doneSets > 0 || doneReps > 0;

        HEYS.ConfirmModal.show({
          icon: '⚠',
          title: 'Прервать тренировку?',
          text: 'Сессия останется как «незавершённая» — сможешь продолжить позже.',
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
                // «Не записывать» = юзер захочет вернуться → оставляем snapshot
                // нетронутым, флаг блокирует clear в handleStateChange(ABORTED).
                // После finalize → onAbort → liveActive=false → useEffect
                // подхватит snapshot и покажет банер «Незавершённая тренировка».
                keepSnapshotOnAbortRef.current = true;
                if (HEYS.Toast?.info) HEYS.Toast.info('Сессия прервана — можно продолжить позже');
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
        gripId: exercise.gripId,
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
  // EquipmentBar — tab-strip над шапкой fingers для смены оборудования
  // между сессиями. 3 варианта: 🪜 полный board / 🚪 door frame / 🤚 No-Hangs.
  // При full — рядом chip с моделью доски (опционально, клик → выбор из BOARDS).
  // Persist в heys_profile.fingerboardProfile, перерендер по тику.
  function FingersEquipmentBar(props) {
    const onChange = (props && props.onChange) || function () {};
    const profile = getProfile();

    // Multi-select: тренировка может комбинировать оборудование (warmup на door,
    // max-hangs на block, repeaters на board). equipmentTypes — массив активных
    // ['full','block','door','none']. Legacy single-state поля (noEquipment,
    // blockMode, edgeLimit) синхронизируются derived'ом для обратной совместимости.
    function deriveTypesFromLegacy(p) {
      // Если в профиле уже есть массив — используем его.
      if (Array.isArray(p.equipmentTypes) && p.equipmentTypes.length > 0) {
        return p.equipmentTypes.slice();
      }
      // Иначе reconstruct из legacy single-state.
      if (p.noEquipment) return ['none'];
      if (p.blockMode) return ['block'];
      if (p.edgeLimit === 25) return ['door'];
      return ['full'];
    }
    const activeTypes = deriveTypesFromLegacy(profile);
    const allBoards = Array.isArray(Fingers.BOARDS) ? Fingers.BOARDS : [];
    // Board picker отображается если активен full или block. Список зависит от
    // того что активно: если оба — показываем оба kind'а в одном списке.
    const wantFull  = activeTypes.indexOf('full') >= 0;
    const wantBlock = activeTypes.indexOf('block') >= 0;
    const boards = (wantFull || wantBlock)
      ? allBoards.filter(function (b) {
          const k = b.kind || 'fingerboard';
          return (wantFull && k === 'fingerboard') || (wantBlock && k === 'block');
        })
      : [];
    const currentBoard = profile.fingerboardId && Fingers.getBoardById
      ? Fingers.getBoardById(profile.fingerboardId)
      : null;
    const [boardPickerOpen, setBoardPickerOpen] = useState(false);

    function syncLegacyFromTypes(types) {
      // Derive legacy single-state поля из массива. Преимущество для совместимости:
      // если в массиве 'block' — blockMode=true (даже если есть и full). Это
      // позволяет recommendations подсветить block-протоколы.
      // hasFingerboard: true если что-то кроме 'none' (даже door считается).
      return {
        equipmentTypes: types,
        noEquipment: types.length === 1 && types[0] === 'none',
        blockMode: types.indexOf('block') >= 0 && types.length === 1,
        // edgeLimit актуален когда door — единственный реальный equip-тип
        edgeLimit: (types.indexOf('door') >= 0 && !wantFull && !wantBlock) ? 25 : null,
        hasFingerboard: types.some(function (t) { return t !== 'none'; })
      };
    }

    function writeProfile(patch) {
      try {
        const u = HEYS.utils;
        if (!u || !u.lsGet || !u.lsSet) return;
        const p = u.lsGet('heys_profile', {}) || {};
        const fp = Object.assign({}, p.fingerboardProfile || {}, patch);
        u.lsSet('heys_profile', Object.assign({}, p, { fingerboardProfile: fp }));
        onChange();
      } catch (e) {
        console.warn('[FingersEquipmentBar] writeProfile failed:', e);
      }
    }

    function toggleType(type) {
      const has = activeTypes.indexOf(type) >= 0;
      let next;
      if (has) {
        // Enforce: минимум 1 активный тип.
        if (activeTypes.length === 1) return;
        next = activeTypes.filter(function (t) { return t !== type; });
      } else {
        // Multi-tier: все табы независимы, 'none' добавляется в общий набор
        // (раньше был эксклюзивен — теперь модель «фильтры по интересам»).
        next = activeTypes.concat([type]);
      }
      const patch = syncLegacyFromTypes(next);
      // Если включили block и пока нет block-доски выбранной — назначить default
      if (type === 'block' && !has) {
        if (!currentBoard || currentBoard.kind !== 'block') {
          patch.fingerboardId = 'xclimb_terminator';
        }
      }
      // Если выключили block и текущая доска — block, переключить на fingerboard default
      if (type === 'block' && has && currentBoard && currentBoard.kind === 'block') {
        patch.fingerboardId = next.indexOf('full') >= 0 ? 'beastmaker_1000' : null;
      }
      writeProfile(patch);
    }
    function pickBoard(id) {
      writeProfile({ fingerboardId: id });
      setBoardPickerOpen(false);
    }

    const tabs = [
      { id: 'full',  icon: '🪜', label: 'Полный board' },
      { id: 'block', icon: '💪', label: 'Hang block' },
      { id: 'door',  icon: '🚪', label: 'Door frame' },
      { id: 'none',  icon: '🤚', label: 'No-Hangs' }
    ];

    return h('div', { className: 'fingers-fs-equipment-bar' },
      h('div', { className: 'fingers-fs-equipment-bar__tabs',
        role: 'group',
        'aria-label': 'Оборудование (можно выбрать несколько)' },
        tabs.map(function (t) {
          const active = activeTypes.indexOf(t.id) >= 0;
          const isOnlyActive = active && activeTypes.length === 1;
          return h('button', {
            key: t.id,
            type: 'button',
            role: 'checkbox',
            'aria-checked': active,
            'aria-disabled': isOnlyActive,
            title: isOnlyActive ? 'Минимум один тип должен быть активен' : null,
            className: 'fingers-fs-equipment-tab' + (active ? ' is-active' : ''),
            onClick: function () { toggleType(t.id); }
          },
            // Чекбокс-индикатор в углу для multi-select clarity
            h('span', {
              className: 'fingers-fs-equipment-tab__check' + (active ? ' is-checked' : ''),
              'aria-hidden': 'true'
            }, active ? '✓' : null),
            h('span', { className: 'fingers-fs-equipment-tab__icon', 'aria-hidden': 'true' }, t.icon),
            h('span', { className: 'fingers-fs-equipment-tab__label' }, t.label)
          );
        })
      ),
      // Board picker (для full и/или block — список объединённый по активным kind'ам)
      (wantFull || wantBlock) && boards.length > 0 ? h('div', { className: 'fingers-fs-equipment-board' },
        h('button', {
          type: 'button',
          className: 'fingers-fs-equipment-board__btn',
          onClick: function () { setBoardPickerOpen(!boardPickerOpen); },
          'aria-expanded': boardPickerOpen ? 'true' : 'false'
        },
          h('span', { className: 'fingers-fs-equipment-board__label' },
            (currentBoard && currentBoard.label) || 'Выбрать модель'),
          h('span', { className: 'fingers-fs-equipment-board__chevron', 'aria-hidden': 'true' },
            boardPickerOpen ? '▲' : '▼')
        ),
        boardPickerOpen ? h('div', { className: 'fingers-fs-equipment-board__menu' },
          boards.map(function (b) {
            const active = (currentBoard && currentBoard.id === b.id);
            return h('button', {
              key: b.id,
              type: 'button',
              className: 'fingers-fs-equipment-board__option' + (active ? ' is-active' : ''),
              onClick: function () { pickBoard(b.id); }
            },
              h('span', { className: 'fingers-fs-equipment-board__option-label' }, b.label),
              b.manufacturer ? h('span', { className: 'fingers-fs-equipment-board__option-sub' },
                b.manufacturer) : null,
              active ? h('span', { className: 'fingers-fs-equipment-board__option-check' }, '✓') : null
            );
          })
        ) : null
      ) : null
    );
  }
  Fingers.EquipmentBar = FingersEquipmentBar;

  // Settings popover — единое место для voice/тема/профиль/reset.
  // Открывается из ⚙ кнопки в шапке fingers.
  function FingersSettingsSheet(props) {
    const onClose = (props && props.onClose) || function () {};
    const onRequestReset = props && props.onRequestReset;
    const profile = getProfile();
    const HEYS_utils = HEYS.utils || {};

    // Voice settings — берём актуальные через voice.getSettings()
    const voiceInitial = (Fingers.voice && Fingers.voice.getSettings)
      ? Fingers.voice.getSettings()
      : { enabled: true, volume: 0.8 };
    const [voiceEnabled, setVoiceEnabled] = useState(voiceInitial.enabled !== false);
    const [voiceVol, setVoiceVol] = useState(
      typeof voiceInitial.volume === 'number' ? voiceInitial.volume : 0.8);

    // Theme: A — HEYS native, C — Climbing (по умолчанию). Тема B удалена,
    // legacy value мигрируется в C при чтении.
    const initialTheme = (function () {
      try {
        const fp = profile || {};
        const raw = fp.themeId || (typeof document !== 'undefined'
          ? document.documentElement.getAttribute('data-fingers-theme')
          : 'C');
        return (raw === 'A' || raw === 'C') ? raw : 'C';
      } catch (_) { return 'C'; }
    })();
    const [theme, setTheme] = useState(initialTheme);

    function applyVoiceEnabled(b) {
      setVoiceEnabled(b);
      try { Fingers.voice && Fingers.voice.setEnabled && Fingers.voice.setEnabled(b); } catch (_) {}
    }
    function applyVoiceVolume(v) {
      const clamped = Math.max(0, Math.min(1, Number(v) || 0));
      setVoiceVol(clamped);
      try { Fingers.voice && Fingers.voice.setVolume && Fingers.voice.setVolume(clamped); } catch (_) {}
    }

    function applyTheme(id) {
      if (['A', 'C'].indexOf(id) < 0) return;
      setTheme(id);
      try {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-fingers-theme', id);
        }
      } catch (_) {}
      // Persist в heys_profile.fingerboardProfile.themeId
      try {
        if (HEYS_utils.lsGet && HEYS_utils.lsSet) {
          const p = HEYS_utils.lsGet('heys_profile', {}) || {};
          const fp = Object.assign({}, p.fingerboardProfile || {}, { themeId: id });
          HEYS_utils.lsSet('heys_profile', Object.assign({}, p, { fingerboardProfile: fp }));
        }
      } catch (_) {}
    }

    function handleResetOnboarding() {
      if (HEYS.ConfirmModal?.show) {
        HEYS.ConfirmModal.show({
          icon: '↻',
          title: 'Перепройти онбординг',
          text: 'Сбросить ответы и пройти заново? Это пересчитает рекомендованный ' +
            'протокол. Существующие записи в дневнике сохранятся.',
          confirmText: 'Перепройти',
          cancelText: 'Отмена',
          onConfirm: function () {
            onClose();
            if (typeof onRequestReset === 'function') onRequestReset();
          }
        });
      } else if (typeof onRequestReset === 'function') {
        onClose();
        onRequestReset();
      }
    }

    // Escape close
    useEffect(function () {
      function onKey(e) { if (e.key === 'Escape') onClose(); }
      document.addEventListener('keydown', onKey);
      return function () { document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    const ageStr = Number.isFinite(Number(profile.age)) ? String(profile.age) + ' лет' : 'не указан';
    const bm = (Fingers.getBodyWeight && Fingers.getBodyWeight()) || { kg: null, source: 'fallback' };
    const weightStr = bm.source !== 'fallback'
      ? bm.kg.toFixed(1) + ' кг'
      : 'не указан';

    const themeMeta = {
      C: { label: 'Climbing',     color: 'linear-gradient(135deg, #c2410c, #7c2d12)' },
      A: { label: 'HEYS native',  color: 'linear-gradient(135deg, #2563eb, #1d4ed8)' }
    };

    return h('div', {
      className: 'fingers-settings__backdrop',
      onClick: onClose,
      role: 'presentation'
    },
      h('div', {
        className: 'fingers-settings',
        role: 'dialog',
        'aria-label': 'Настройки тренировки',
        onClick: function (e) { e.stopPropagation(); }
      },
        // Header
        h('div', { className: 'fingers-settings__header' },
          h('div', { className: 'fingers-settings__header-text' },
            h('h2', { className: 'fingers-settings__title' },
              h('span', { 'aria-hidden': 'true' }, '⚙'), ' Настройки тренировки'),
            h('p', { className: 'fingers-settings__sub' },
              'Голос, тема, профиль')
          ),
          h('button', {
            type: 'button',
            className: 'fingers-settings__close',
            'aria-label': 'Закрыть',
            onClick: onClose
          },
            h('svg', { width: 20, height: 20, viewBox: '0 0 20 20', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.6 },
              h('path', { d: 'M5 5l10 10M15 5L5 15', strokeLinecap: 'round' })
            )
          )
        ),

        // Body
        h('div', { className: 'fingers-settings__body' },

          // ─── Voice section ───
          h('section', { className: 'fingers-settings__section' },
            h('div', { className: 'fingers-settings__section-title' }, 'Голос'),
            h('div', { className: 'fingers-settings__row' },
              h('div', { className: 'fingers-settings__row-text' },
                h('div', { className: 'fingers-settings__row-label' }, 'Голосовое сопровождение'),
                h('div', { className: 'fingers-settings__row-hint' },
                  voiceEnabled ? 'Цитирует фазы виса/отдыха и подсказки' : 'Отключено — silent mode')
              ),
              h('label', { className: 'fingers-settings__toggle' },
                h('input', {
                  type: 'checkbox',
                  checked: voiceEnabled,
                  onChange: function (e) { applyVoiceEnabled(!!e.target.checked); }
                }),
                h('span', { className: 'fingers-settings__toggle-slider', 'aria-hidden': 'true' })
              )
            ),
            h('div', { className: 'fingers-settings__row fingers-settings__row--volume' },
              h('div', { className: 'fingers-settings__row-text' },
                h('div', { className: 'fingers-settings__row-label' },
                  'Громкость',
                  h('span', { className: 'fingers-settings__volume-value' },
                    Math.round(voiceVol * 100) + '%')
                )
              ),
              h('input', {
                type: 'range',
                className: 'fingers-settings__slider',
                min: 0, max: 1, step: 0.05,
                value: voiceVol,
                disabled: !voiceEnabled,
                onChange: function (e) { applyVoiceVolume(e.target.value); },
                'aria-label': 'Громкость голоса'
              })
            )
          ),

          // ─── Theme section ───
          h('section', { className: 'fingers-settings__section' },
            h('div', { className: 'fingers-settings__section-title' }, 'Тема оформления'),
            h('div', { className: 'fingers-settings__theme-grid' },
              ['C', 'A'].map(function (id) {
                const meta = themeMeta[id];
                const active = theme === id;
                return h('button', {
                  key: id,
                  type: 'button',
                  className: 'fingers-settings__theme' + (active ? ' is-active' : ''),
                  onClick: function () { applyTheme(id); },
                  'aria-pressed': active
                },
                  h('span', {
                    className: 'fingers-settings__theme-swatch',
                    style: { background: meta.color }
                  }),
                  h('span', { className: 'fingers-settings__theme-id' }, id),
                  h('span', { className: 'fingers-settings__theme-label' }, meta.label),
                  active ? h('span', { className: 'fingers-settings__theme-check', 'aria-hidden': 'true' }, '✓') : null
                );
              })
            )
          ),

          // ─── Profile section ───
          h('section', { className: 'fingers-settings__section' },
            h('div', { className: 'fingers-settings__section-title' }, 'Профиль'),
            h('div', { className: 'fingers-settings__profile-grid' },
              h('div', { className: 'fingers-settings__profile-tile' },
                h('div', { className: 'fingers-settings__profile-label' }, 'Возраст'),
                h('div', {
                  className: 'fingers-settings__profile-value' +
                    (profile.age == null ? ' is-missing' : '')
                }, ageStr)
              ),
              h('div', { className: 'fingers-settings__profile-tile' },
                h('div', { className: 'fingers-settings__profile-label' }, 'Вес тела'),
                h('div', {
                  className: 'fingers-settings__profile-value' +
                    (bm.source === 'fallback' ? ' is-missing' : '')
                }, weightStr)
              )
            ),
            h('p', { className: 'fingers-settings__profile-hint' },
              'Возраст определяет какие хваты безопасны (UIAA/BMC), вес — точный % MVC. ',
              'Изменить можно в общем Профиле HEYS.')
          ),

          // ─── Re-onboarding link ───
          onRequestReset
            ? h('button', {
                type: 'button',
                className: 'fingers-settings__reset-btn',
                onClick: handleResetOnboarding
              },
                h('span', { 'aria-hidden': 'true' }, '↻'),
                ' Перепройти онбординг'
              )
            : null
        )
      )
    );
  }
  Fingers.SettingsSheet = FingersSettingsSheet;

  function SessionUI({ dateKey, trainingIndex, mode, onClose, onRequestOnboarding }) {
    const [tab, setTab] = useState('programs');
    const [exercises, setExercises] = useState([]);
    // showBib: false | true | {focusSourceId: string} — last form открывает
    // модалку с автоскроллом и expanded card конкретного источника.
    const [showBib, setShowBib] = useState(false);
    // Settings popover — единая точка для voice/тема/профиль/reset.
    const [showSettings, setShowSettings] = useState(false);
    // EquipmentBar bumps this on change → SessionUI re-renders, getProfile()
    // перечитывается → userBoard / noEquipment подхватываются по всему дереву.
    const [equipmentTick, setEquipmentTick] = useState(0);
    // Глобальный listener: любой SourceBadge-click шлёт событие, открываем
    // bibliography с focus на этом source id.
    useEffect(function () {
      const handler = function (e) {
        const sid = e && e.detail && e.detail.sourceId;
        setShowBib(sid ? { focusSourceId: sid } : true);
      };
      window.addEventListener('fingers-open-bibliography', handler);
      return function () { window.removeEventListener('fingers-open-bibliography', handler); };
    }, []);
    // Boot theme apply + legacy migration: тема 'B' (Custom blue) удалена,
    // нормализуем в 'C' (Climbing) если в profile старое значение. Default = C.
    useEffect(function () {
      try {
        const u = HEYS.utils;
        const raw = u && u.lsGet ? u.lsGet('heys_profile', {}) : {};
        const fp = (raw && raw.fingerboardProfile) || {};
        const cur = (fp.themeId === 'A' || fp.themeId === 'C') ? fp.themeId : 'C';
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-fingers-theme', cur);
        }
        // Persist обратно если был legacy 'B' или undefined
        if (cur !== fp.themeId && u && u.lsSet) {
          const next = Object.assign({}, fp, { themeId: cur });
          u.lsSet('heys_profile', Object.assign({}, raw, { fingerboardProfile: next }));
        }
      } catch (_) {}
    }, []);
    const [pendingProgram, setPendingProgram] = useState(null);
    const [liveActive, setLiveActive] = useState(false);
    const [warmupActive, setWarmupActive] = useState(false);
    // 'ramp' (полная 15-20 мин до max) | 'quick' (5-8 мин targeted на пальцы/кисть)
    const [warmupProtocol, setWarmupProtocol] = useState('ramp');
    // pendingResume — снапшот незавершённой сессии для постоянного баннера наверху.
    // Заполняется при монтировании если persistence.load() вернул свежий snapshot.
    // null → нет прерванной сессии, баннер не рисуется.
    const [pendingResume, setPendingResume] = useState(null);
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

    // Persistent banner: при открытии режима 'new' / 'edit' / 'view' проверяем
    // snapshot и если он есть — рисуем баннер «есть незавершённая сессия».
    // В 'continue'-режиме snapshot уже подхвачен эффектом выше → баннер не нужен.
    //
    // ВАЖНО: snapshot может прилететь из облака с задержкой (cloud sync). Если
    // читать LS сразу при mount — там может быть пусто, а потом sync дольёт.
    // Поэтому проверяем 1) сразу, 2) ещё раз после heysSyncCompleted.
    useEffect(function () {
      if (mode === 'continue') return;
      if (liveActive) return;
      const checkSnapshot = function () {
        try {
          const loaded = Fingers.persistence && Fingers.persistence.load && Fingers.persistence.load();
          if (loaded && loaded.snapshot && !loaded.stale
              && Array.isArray(loaded.snapshot.exercises) && loaded.snapshot.exercises.length) {
            setPendingResume(loaded.snapshot);
          } else {
            setPendingResume(null);
          }
        } catch (e) {
          console.warn('[Fingers.SessionUI] resume check failed:', e);
        }
      };
      checkSnapshot();
      if (typeof window === 'undefined') return undefined;
      if (window.__heysSyncCompletedFired) return undefined;
      const onSync = function () { checkSnapshot(); };
      window.addEventListener('heysSyncCompleted', onSync, { once: true });
      return function () { window.removeEventListener('heysSyncCompleted', onSync); };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, liveActive]);

    const handleResumeContinue = useCallback(function () {
      if (!pendingResume) return;
      try {
        const snap = pendingResume;
        setExercises(snap.exercises);
        if (snap.programId && typeof Fingers.getProgramById === 'function') {
          const prog = Fingers.getProgramById(snap.programId);
          if (prog) setPendingProgram(prog);
        }
        setInitialSnapshot(snap);
        setPendingResume(null);
        setLiveActive(true);
      } catch (e) {
        console.warn('[Fingers.SessionUI] resume failed:', e);
      }
    }, [pendingResume]);

    const handleResumeDiscard = useCallback(function () {
      const confirmDiscard = function () {
        try { Fingers.persistence && Fingers.persistence.clear && Fingers.persistence.clear(); } catch (_) {}
        setPendingResume(null);
      };
      if (HEYS.ConfirmModal?.show) {
        HEYS.ConfirmModal.show({
          icon: '🗑',
          title: 'Удалить прерванную сессию?',
          text: 'Прогресс не сохранится — отменить нельзя.',
          confirmText: 'Удалить',
          cancelText: 'Назад',
          confirmStyle: 'danger',
          onConfirm: confirmDiscard
        });
      } else {
        confirmDiscard();
      }
    }, []);

    const profile = getProfile();
    const userBoard = profile.fingerboardId || null;
    // Age fail-closed: null если не указан в профиле — конструктор покажет
    // guard вместо опасных хватов (ранее дефолтилось 18 → fail-open).
    const userAge = Number.isFinite(Number(profile.age)) ? Number(profile.age) : null;
    const recommendedId = getRecommendedProgramId();

    // Pick program → load exercises into constructor → switch to constructor tab
    const handlePickProgram = useCallback(function (program) {
      // Generated mix не в catalog — buildLogFromProgram не найдёт его id.
      // Используем exercises напрямую без mapping'а по board edges.
      let built;
      if (program && program.__generated) {
        built = Array.isArray(program.exercises) ? program.exercises.slice() : [];
      } else {
        built = Fingers.buildLogFromProgram
          ? Fingers.buildLogFromProgram(program.id, userBoard ? Fingers.getBoardById?.(userBoard) : null)
          : (program.exercises || []);
        if (!Array.isArray(built) || built.length === 0) {
          // Fallback: если buildLogFromProgram вернула null (unknown id) —
          // берём program.exercises как есть.
          built = Array.isArray(program.exercises) ? program.exercises.slice() : [];
        }
      }
      setExercises(built);
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
        // Считаем общее время удержания (висы только, без отдыха) — premium-метрика.
        const totalHangSec = exercises.reduce(function (s, e) {
          return s + (Number(e.hangSec) || 0)
            * (Number(e.repsPerSet) || 0)
            * (Number(e.setsCount) || 0);
        }, 0);
        // Intensity протокола для phase-цвета и next-step рекомендации.
        const programIntensity = (pendingProgram?.id && typeof Fingers.getProgramIntensity === 'function')
          ? Fingers.getProgramIntensity(pendingProgram.id)
          : 'moderate';
        // Stats для achievements — переиспользуем уже определённую функцию.
        let stats = null;
        try { stats = computeProgressStats(); } catch (_) { stats = null; }
        // Session-level achievements: volume PR, first-of-program, comeback.
        // Сканируем 365 дней — этого хватит чтобы отличить «первый раз» от
        // «возвращение после паузы».
        let achievements = null;
        try {
          achievements = _computeSessionAchievements(fingersLog, dateKey, 365);
        } catch (e) {
          console.warn('[SessionUI] achievements compute failed:', e);
        }
        setSessionSummary({
          programName: pendingProgram?.name || 'Свой конструктор',
          totalMin: Math.round(totalMin),
          totalHangSec: Math.round(totalHangSec),
          totalReps: totalReps,
          exercisesCount: exercises.length,
          dateKey: dateKey || (new Date().toISOString().slice(0, 10)),
          intensity: programIntensity,
          streak: stats ? stats.streak : 0,
          totalSessions: stats ? stats.totalSessions : 1,
          achievements: achievements
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
      const extraNotes = [];
      if (cooldownInfo.hoursSinceLast != null && cooldownInfo.hoursSinceLast < 48
          && cooldownInfo.lastWasMax && programIntensity === 'max') {
        extraNotes.push({
          icon: '⚠',
          text: 'Прошло только ' + Math.round(cooldownInfo.hoursSinceLast) +
                'ч с прошлой max-сессии (рекомендуется ≥48ч).'
        });
      }
      if (readinessBucket === 'recovery-only') {
        extraNotes.push({
          icon: 'ℹ',
          text: 'Готовность невысокая — лучше No-Hangs или recovery-протокол.'
        });
      }

      // Если WarmupRunner недоступен — деградируем до 2-кнопочного варианта.
      const canShowWarmup = !!(Fingers.WarmupRunner);

      const preflightOpts = {
        icon: '🤲',
        title: 'Готов начинать?',
        // text может быть React-элементом — ConfirmModal:210 рендерит его как child.
        text: h(PreflightChecklist, { extraNotes: extraNotes }),
        confirmStyle: programIntensity === 'max' ? 'warning' : 'primary',
      };

      if (canShowWarmup) {
        // 4-кнопочный вариант: Отмена / Быстрая разминка / Полная разминка / Всё ОК.
        // Быстрая доступна для всех протоколов — юзер сам решает (для max
        // методически рекомендуется RAMP, но не блокируем выбор).
        // На «go» вешаем className 'fingers-fs-preflight-go' — CSS-анимация
        // приглушает кнопку первые 2.4с пока галочки заполняются.
        preflightOpts.actions = [
          { key: 'cancel', label: 'Отмена', style: 'neutral', variant: 'text',
            isCancel: true, row: 0 },
          { key: 'warmup_quick', label: '⚡ Быстрая разминка (5-8 мин)',
            style: 'primary', variant: 'text', value: 'quick', row: 1,
            onClick: function () {
              setWarmupProtocol('quick');
              setWarmupActive(true);
            } },
          { key: 'warmup_full', label: '🔥 Полная разминка (15-20 мин)',
            style: 'primary', variant: 'text', value: 'full', row: 2,
            onClick: function () {
              setWarmupProtocol('ramp');
              setWarmupActive(true);
            } },
          { key: 'go', label: 'Всё ОК, начинаем',
            style: programIntensity === 'max' ? 'warning' : 'primary',
            variant: 'fill', isDefault: true, value: 'go', row: 3,
            className: 'fingers-fs-preflight-go',
            onClick: function () {
              try { Fingers.voice?.say?.('cue.start_session'); } catch (_) {}
              setLiveActive(true);
            } },
        ];
      } else {
        preflightOpts.confirmText = 'Всё ОК, начинаем';
        preflightOpts.cancelText = 'Отмена';
        preflightOpts.onConfirm = function () {
          try { Fingers.voice?.say?.('cue.start_session'); } catch (_) {}
          setLiveActive(true);
        };
      }

      HEYS.ConfirmModal.show(preflightOpts);
    }, [exercises, pendingProgram, dateKey]);

    // После завершения/прерывания разминки — снова открыть pre-flight.
    // Юзер дотыкает оставшиеся чек-пункты (нет боли, не на холодные руки) и стартует.
    const handleWarmupDone = useCallback(function () {
      setWarmupActive(false);
      // Defer re-open чтобы предыдущий ConfirmModal успел размонтироваться.
      setTimeout(function () { handleStartLive(); }, 50);
    }, [handleStartLive]);

    const handleWarmupCancel = useCallback(function () {
      setWarmupActive(false);
    }, []);

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

    // Custom SF-style monoline SVG icons — единый визуальный язык вместо смешанных emoji.
    // Все 22×22 viewBox, stroke=1.6, lineCap=round.
    const svgIcon = function (d) {
      return h('svg', {
        className: 'fingers-fs-tab__svg',
        width: 22, height: 22, viewBox: '0 0 22 22',
        fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true'
      }, typeof d === 'string'
        ? h('path', { d: d })
        : d.map(function (item, i) { return h(item.tag, Object.assign({ key: i }, item.attrs)); })
      );
    };
    const ICONS = {
      programs: svgIcon([
        { tag: 'path', attrs: { d: 'M4 4.5h10a2.5 2.5 0 0 1 2.5 2.5v11' } },
        { tag: 'path', attrs: { d: 'M4 4.5v13a2 2 0 0 0 2 2h10.5' } },
        { tag: 'path', attrs: { d: 'M7.5 8.5h6M7.5 11.5h5' } }
      ]),
      constructor: svgIcon([
        { tag: 'circle', attrs: { cx: 11, cy: 11, r: 2.5 } },
        { tag: 'path', attrs: { d: 'M11 3v2.5M11 16.5V19M3 11h2.5M16.5 11H19M5.3 5.3l1.8 1.8M14.9 14.9l1.8 1.8M16.7 5.3l-1.8 1.8M7.1 14.9l-1.8 1.8' } }
      ]),
      progress: svgIcon([
        { tag: 'path', attrs: { d: 'M3.5 17.5V12M8.5 17.5V8.5M13.5 17.5v-4M18.5 17.5V5' } },
        { tag: 'path', attrs: { d: 'M3 19.5h16' } }
      ]),
      calendar: svgIcon([
        { tag: 'rect', attrs: { x: 3.5, y: 5, width: 15, height: 13.5, rx: 2 } },
        { tag: 'path', attrs: { d: 'M3.5 9h15M7.5 3v3.5M14.5 3v3.5' } },
        { tag: 'circle', attrs: { cx: 11, cy: 13, r: 1.2, fill: 'currentColor', stroke: 'none' } }
      ])
    };
    const tabs = [
      { id: 'programs',    label: 'Протоколы',   icon: ICONS.programs },
      { id: 'constructor', label: 'Конструктор', icon: ICONS.constructor },
      { id: 'progress',    label: 'Прогресс',    icon: ICONS.progress },
      { id: 'calendar',    label: 'Календарь',   icon: ICONS.calendar }
    ];

    return h('div', { className: 'fingers-fs-session' },
      // Warmup runner overlay (floats над всем когда warmupActive=true).
      // Steps подаём в зависимости от выбранного протокола: 'quick' — targeted
      // 5-8 мин на пальцы/кисть/предплечья (Hörst+Schöffl+Hsu), 'ramp' (default) —
      // полный 15-20 мин RAMP. WarmupRunner если не передать steps берёт ramp.
      warmupActive && Fingers.WarmupRunner ? h(Fingers.WarmupRunner, {
        key: 'warmup-' + warmupProtocol,
        steps: warmupProtocol === 'quick'
          ? (Fingers.SafetyGate?.quickFingerWarmupSteps)
          : undefined,
        onDone: handleWarmupDone,
        onCancel: handleWarmupCancel
      }) : null,
      // Equipment bar — над шапкой, всегда видим для смены оборудования
      // (тренировка может проходить в разных местах, набор меняется каждый раз).
      Fingers.EquipmentBar ? h(Fingers.EquipmentBar, {
        key: 'eqbar-' + equipmentTick,
        onChange: function () { setEquipmentTick(function (n) { return n + 1; }); }
      }) : null,
      // Header
      h('div', { className: 'fingers-fs__header fingers-fs__header--premium' },
        h('h1', { className: 'fingers-fs__title' },
          h('span', { className: 'fingers-fs__title-icon', 'aria-hidden': 'true' }, '🤚'),
          h('span', { className: 'fingers-fs__title-text' }, 'Тренировка')
        ),
        h('div', { className: 'fingers-fs__header-actions' },
          h('button', {
            type: 'button',
            className: 'fingers-fs__icon-btn',
            onClick: function () { setShowSettings(true); },
            'aria-label': 'Настройки тренировки',
            title: 'Настройки'
          }, h('span', { 'aria-hidden': 'true' }, '⚙')),
          h('button', {
            type: 'button',
            className: 'fingers-fs__icon-btn',
            onClick: function () { setShowBib(true); },
            'aria-label': 'Источники и методология',
            title: 'Источники'
          }, h('span', { 'aria-hidden': 'true' }, '📚'))
        )
      ),

      // Resume banner — постоянный, над табами, пока есть snapshot.
      pendingResume ? (function () {
        const lastTick = Number(pendingResume.lastTickAt) || 0;
        const ageMs = lastTick ? (Date.now() - lastTick) : 0;
        const aging = ageMs > 60 * 60 * 1000; // >1h — "давно открыта"
        const ageText = lastTick ? (function () {
          const mins = Math.max(1, Math.round(ageMs / 60000));
          if (mins < 60) return mins + ' мин назад';
          const hrs = Math.floor(mins / 60);
          if (hrs < 24) {
            const rem = mins % 60;
            return hrs + 'ч ' + rem + 'мин назад';
          }
          return Math.floor(hrs / 24) + ' дн. назад';
        })() : '';
        const progText = (function () {
          const exDone = Number(pendingResume.exIdx) || 0;
          const exTotal = Array.isArray(pendingResume.exercises) ? pendingResume.exercises.length : 0;
          const setIdx = Number(pendingResume.setIdx) || 0;
          const repIdx = Number(pendingResume.repIdx) || 0;
          return 'упр ' + (exDone + 1) + '/' + exTotal
            + ' · подход ' + (setIdx + 1)
            + ' · повтор ' + (repIdx + 1);
        })();
        return h('div', {
          key: 'resume-banner',
          className: 'fingers-fs-resume-banner' + (aging ? ' is-aging' : ''),
          role: 'status',
          'aria-live': 'polite'
        },
          h('div', { className: 'fingers-fs-resume-banner__icon', 'aria-hidden': 'true' },
            aging ? '⏰' : '⏸'),
          h('div', { className: 'fingers-fs-resume-banner__body' },
            h('div', { className: 'fingers-fs-resume-banner__title' },
              aging ? 'Незавершённая сессия' : 'Тренировка на паузе'),
            h('div', { className: 'fingers-fs-resume-banner__sub' },
              ageText ? progText + ' · ' + ageText : progText)
          ),
          h('div', { className: 'fingers-fs-resume-banner__actions' },
            h('button', {
              type: 'button',
              className: 'fingers-fs-resume-banner__btn fingers-fs-resume-banner__btn--primary',
              onClick: handleResumeContinue
            }, 'Продолжить'),
            h('button', {
              type: 'button',
              className: 'fingers-fs-resume-banner__btn fingers-fs-resume-banner__btn--secondary',
              onClick: handleResumeDiscard
            }, 'Удалить')
          )
        );
      })() : null,

      // Tabs
      h('div', { className: 'fingers-fs-tabs', role: 'tablist' },
        tabs.map(function (t, idx) {
          const active = tab === t.id;
          return h('button', {
            key: t.id,
            role: 'tab',
            'aria-selected': active,
            className: 'fingers-fs-tab' + (active ? ' fingers-fs-tab--active' : ''),
            style: { animationDelay: (idx * 40) + 'ms' },
            onClick: function () { setTab(t.id); }
          },
            h('span', { key: 'i', className: 'fingers-fs-tab__icon' }, t.icon),
            h('span', { key: 'l', className: 'fingers-fs-tab__label' }, t.label)
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
            userAge: userAge,
            programName: pendingProgram?.name,
            onUnbindProgram: function () { setPendingProgram(null); }
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
        onClose: function () { setShowBib(false); },
        focusSourceId: (showBib && typeof showBib === 'object') ? showBib.focusSourceId : undefined
      }),

      // Settings sheet (⚙) — voice/theme/profile/reset
      showSettings && Fingers.SettingsSheet && h(Fingers.SettingsSheet, {
        onClose: function () { setShowSettings(false); },
        onRequestReset: onRequestOnboarding || undefined
      }),

      // Summary screen — премиум-итог после автозавершения live-таймера.
      // Backdrop + glass-card с hero, метриками, achievements, next-step.
      sessionSummary && (function () {
        const ss = sessionSummary;
        // Compute achievement-карточки: streak milestone / total milestone / intensity badge
        const milestones = [];
        if (ss.streak >= 3) {
          milestones.push({
            id: 'streak',
            icon: '🔥',
            label: ss.streak + (ss.streak === 1 ? ' день' : ss.streak < 5 ? ' дня' : ' дней') + ' подряд',
            kind: 'streak'
          });
        }
        if ([10, 25, 50, 100, 200, 500].indexOf(ss.totalSessions) >= 0) {
          milestones.push({
            id: 'total',
            icon: '🏆',
            label: ss.totalSessions + '-я тренировка',
            kind: 'milestone'
          });
        } else if (ss.totalSessions === 1) {
          milestones.push({
            id: 'first',
            icon: '🎉',
            label: 'Первая тренировка!',
            kind: 'first'
          });
        }
        if (ss.intensity === 'max') {
          milestones.push({
            id: 'intensity',
            icon: '⚡',
            label: 'Max-сессия',
            kind: 'intensity-max'
          });
        }
        // Session-level achievements (Volume PR / Comeback / First-of-program)
        const ach = ss.achievements;
        if (ach) {
          if (ach.isVolumePR) {
            const delta = ach.curHangSec - ach.prevBestHangSec;
            const fmt = function (s) { return s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : s + ' с'; };
            milestones.unshift({
              id: 'pr',
              icon: '🏆',
              label: 'Volume PR: ' + fmt(ach.curHangSec) + ' (+' + delta + ' с)',
              kind: 'pr'
            });
          }
          if (ach.comebackDays >= 14 && !ach.isFirstEver) {
            milestones.push({
              id: 'comeback',
              icon: '👋',
              label: 'Возвращение после ' + ach.comebackDays + ' дн.',
              kind: 'comeback'
            });
          }
          if (ach.isFirstOfProgram && !ach.isFirstEver) {
            milestones.push({
              id: 'first-prog',
              icon: '🆕',
              label: 'Первый раз этот протокол',
              kind: 'first-prog'
            });
          }
        }
        // Next-step рекомендация по intensity
        const nextStepText = ss.intensity === 'max'
          ? 'Следующая max-сессия — через 48ч. Сухожилия синтезируют коллаген до 72ч (Magnusson 2010).'
          : ss.intensity === 'recovery'
            ? 'Recovery — можно тренировать на следующий день. Базовая активация без стресса для шкивов.'
            : 'Через 24–48ч можно повторить или сделать max-сессию если готовность позволит.';
        const totalHangMin = Math.floor((ss.totalHangSec || 0) / 60);
        const totalHangSec = (ss.totalHangSec || 0) % 60;
        const totalHangLabel = totalHangMin > 0
          ? totalHangMin + ':' + String(totalHangSec).padStart(2, '0')
          : (ss.totalHangSec || 0) + ' с';

        return h('div', {
          className: 'fingers-fs-summary__backdrop',
          onClick: function (e) { if (e.target === e.currentTarget) handleDismissSummary(); },
          role: 'presentation'
        },
          h('div', {
            className: 'fingers-fs-summary',
            'data-intensity': ss.intensity,
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': 'Сессия завершена',
            onClick: function (e) { e.stopPropagation(); }
          },
            // Hero — большая иконка + заголовок + название программы + intensity-бейдж
            h('div', { className: 'fingers-fs-summary__hero' },
              h('div', { className: 'fingers-fs-summary__hero-icon', 'aria-hidden': 'true' },
                ss.intensity === 'max' ? '🔥'
                  : ss.intensity === 'recovery' ? '🌿' : '💪'),
              h('h2', { className: 'fingers-fs-summary__title' }, 'Сессия завершена'),
              h('div', { className: 'fingers-fs-summary__program' }, ss.programName),
              h('span', {
                className: 'fingers-fs-summary__intensity',
                'data-intensity': ss.intensity
              }, ss.intensity === 'max' ? 'максимум'
                : ss.intensity === 'recovery' ? 'восстановление'
                : 'умеренно')
            ),

            // Hero metric — суммарное время удержания, крупно gradient
            h('div', { className: 'fingers-fs-summary__hero-metric' },
              h('div', { className: 'fingers-fs-summary__hero-metric-label' }, 'Время в висе'),
              h('div', { className: 'fingers-fs-summary__hero-metric-value' }, totalHangLabel)
            ),

            // Secondary metrics row — 3 tiles
            h('div', { className: 'fingers-fs-summary__metrics' },
              h('div', { className: 'fingers-fs-summary__metric' },
                h('div', { className: 'fingers-fs-summary__metric-value' }, String(ss.totalMin)),
                h('div', { className: 'fingers-fs-summary__metric-label' }, 'минут всего')
              ),
              h('div', { className: 'fingers-fs-summary__metric' },
                h('div', { className: 'fingers-fs-summary__metric-value' }, String(ss.exercisesCount)),
                h('div', { className: 'fingers-fs-summary__metric-label' },
                  ss.exercisesCount === 1 ? 'упражнение' : ss.exercisesCount < 5 ? 'упражнения' : 'упражнений')
              ),
              h('div', { className: 'fingers-fs-summary__metric' },
                h('div', { className: 'fingers-fs-summary__metric-value' }, String(ss.totalReps)),
                h('div', { className: 'fingers-fs-summary__metric-label' },
                  ss.totalReps === 1 ? 'вис' : ss.totalReps < 5 ? 'виса' : 'висов')
              )
            ),

            // Achievements row (если есть)
            milestones.length > 0 ? h('div', { className: 'fingers-fs-summary__achievements' },
              milestones.map(function (m) {
                return h('div', {
                  key: m.id,
                  className: 'fingers-fs-summary__achievement',
                  'data-kind': m.kind
                },
                  h('span', { className: 'fingers-fs-summary__achievement-icon', 'aria-hidden': 'true' }, m.icon),
                  h('span', { className: 'fingers-fs-summary__achievement-label' }, m.label)
                );
              })
            ) : null,

            // Save confirmation + next-step
            h('div', { className: 'fingers-fs-summary__saved' },
              h('span', { className: 'fingers-fs-summary__saved-check', 'aria-hidden': 'true' }, '✓'),
              h('span', null, 'Сохранено в дневник на ' + ss.dateKey)
            ),

            h('div', { className: 'fingers-fs-summary__next-step' },
              h('div', { className: 'fingers-fs-summary__next-step-label' }, 'Что дальше'),
              h('p', { className: 'fingers-fs-summary__next-step-text' }, nextStepText)
            ),

            h('button', {
              type: 'button',
              className: 'fingers-fs-summary__cta',
              onClick: handleDismissSummary
            }, 'Готово')
          )
        );
      })()
    );
  }

  // --- Exports ---
  Fingers.SessionUI = SessionUI;
  Fingers.getRecommendedProgramId = getRecommendedProgramId;

  Fingers.startSession = function startSession(opts) {
    // Stub for future direct session launch from outside fullscreen.
    // For now SessionUI mounted inside fullscreen handles everything.
    console.info('[Fingers.startSession]', opts);
  };
})(typeof window !== 'undefined' ? window : globalThis);
