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

  // Программа block-типа (нужен блок, не доска)? Используется для выбора модели:
  // block-протоколы берут blockBoardId, остальные — fingerboardId.
  function _isBlockProgram(program) {
    if (!program) return false;
    const types = (Fingers.getProgramEquipmentTypes && Fingers.getProgramEquipmentTypes(program)) || [];
    return types.indexOf('block') >= 0 && types.indexOf('full') < 0 && types.indexOf('door') < 0;
  }
  // Резолвит board-объект под конкретную программу: блок для block-протоколов,
  // доску — для остальных. null если соответствующая модель не выбрана.
  function _resolveBoardForProgram(program) {
    const fp = getProfile();
    const id = _isBlockProgram(program) ? (fp.blockBoardId || null) : (fp.fingerboardId || null);
    return (id && Fingers.getBoardById) ? Fingers.getBoardById(id) : null;
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

    // B16: цель перебивает grade-prefs для non-strength целей, если
    // целевая программа eligible. 'strength'/undefined → grade-логика ниже.
    const goalForced = fp.goal === 'recovery' ? 'nelson_no_hangs'
      : (fp.goal === 'endurance' || fp.goal === 'maintenance') ? 'repeaters_7_3'
      : null;
    if (goalForced && eligibleIds.has(goalForced)) return goalForced;

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

  // --- Today tab (B0): proactive home screen ---
  // Собирает readiness.assess + cooldownCheck + getRecommendedProgramId
  // в один view с одной кнопкой Start. Заменяет дефолт open-Programs.
  function _buildTodayData(todayKey) {
    const data = {
      bucket: 'max',        // final (min из readiness + cooldown)
      readinessBucket: null, // raw из assess
      score: null,
      reasons: [],
      cooldown: null,
      recommendedProgram: null,
      profileIncomplete: false,
    };
    const profile = getProfile();
    const ageNum = Number(profile.age);
    if (!Number.isFinite(ageNum)) {
      data.profileIncomplete = true;
      data.bucket = 'unknown';
      return data;
    }
    try {
      const rIn = _buildReadinessInputs(todayKey);
      const r = Fingers.readiness && Fingers.readiness.assess
        ? Fingers.readiness.assess(rIn.today, rIn.history)
        : null;
      if (r) {
        data.readinessBucket = r.bucket;
        data.score = r.score;
        if (Array.isArray(r.reasons)) data.reasons = r.reasons.slice();
      }
    } catch (e) { console.warn('[Today] readiness assess failed:', e); }
    try {
      data.cooldown = (Fingers.cooldownCheck && Fingers.cooldownCheck()) || null;
    } catch (e) { console.warn('[Today] cooldownCheck failed:', e); }
    // Final bucket — пересечение: берём минимум (более осторожный).
    const readinessRank = { 'rest-day': 0, 'recovery-only': 1, 'moderate-only': 2, 'max-protocol-ok': 3 };
    const cooldownRank = { rest: 0, recovery: 1, moderate: 2, max: 3 };
    const rRank = data.readinessBucket != null ? readinessRank[data.readinessBucket] : 3;
    const cRank = data.cooldown ? cooldownRank[data.cooldown.recommendation] : 3;
    let finalRank = Math.min(rRank, cRank);
    // B7: фаза мезоцикла дополнительно клампит интенсивность дня — цикл «ведёт»
    // (deload-неделя → recovery даже при отличной готовности). Аддитивно: нет
    // активного цикла → meso=null → без изменений.
    const meso = _mesoCurrent(null, todayKey);
    if (meso) {
      data.mesocycle = meso;
      const ceilRank = cooldownRank[meso.ceiling] != null ? cooldownRank[meso.ceiling] : 3;
      finalRank = Math.min(finalRank, ceilRank);
    }
    data.bucket = ['rest', 'recovery', 'moderate', 'max'][finalRank];
    // Recommended program — клампим к потолку бакета (safety). См.
    // _recommendForBucket: getRecommendedProgramId() слепа к интенсивности и
    // в recovery/moderate-день вернула бы max-протокол, противоречащий бейджу.
    try {
      data.recommendedProgram = _recommendForBucket(data.bucket);
    } catch (e) { console.warn('[Today] recommend failed:', e); }
    return data;
  }

  // ─── B7: мезоцикл ───────────────────────────────────────────────────────
  // 4-нед блок: накопление → (интенсификация) → делоад → re-test. cycleState
  // { startedAt:'YYYY-MM-DD', weeks } в fingerboardProfile. Нет цикла → фича
  // выключена (Today не меняется). Phase клампит интенсивность дня в _buildTodayData.
  const _MESO_DEFAULT_WEEKS = 4;
  function _mesoPhaseForWeek(weekIdx, weeksTotal) {
    const w = Number(weekIdx);
    const total = Number(weeksTotal) || _MESO_DEFAULT_WEEKS;
    if (!Number.isFinite(w) || w < 0) return 'accumulation';
    if (w >= total) return 'retest';            // цикл завершён — пора пере-тест + новый блок
    if (w === total - 1) return 'deload';       // последняя неделя — разгрузка
    if (w === total - 2) return 'intensification';
    return 'accumulation';
  }
  function _mesoIntensityCeiling(phase) {
    return phase === 'deload' ? 'recovery'
      : phase === 'accumulation' ? 'moderate'
      : 'max'; // intensification / retest
  }
  function _mesoLabel(phase) {
    return phase === 'accumulation' ? 'накопление'
      : phase === 'intensification' ? 'интенсификация'
      : phase === 'deload' ? 'разгрузка'
      : phase === 'retest' ? 'пере-тест' : phase;
  }
  function _getCycleState() {
    const fp = getProfile();
    const cs = fp && fp.mesocycle;
    if (!cs || !cs.startedAt) return null;
    return { startedAt: cs.startedAt, weeks: Number(cs.weeks) || _MESO_DEFAULT_WEEKS };
  }
  function _mesoCurrent(cycleState, todayKey) {
    const cs = cycleState || _getCycleState();
    if (!cs || !cs.startedAt) return null;
    const start = new Date(cs.startedAt + 'T00:00:00');
    const today = new Date((todayKey || _formatDateKey(new Date())) + 'T00:00:00');
    if (isNaN(start.getTime()) || isNaN(today.getTime())) return null;
    const days = Math.floor((today.getTime() - start.getTime()) / 86400000);
    if (days < 0) return null;
    const weekIdx = Math.floor(days / 7);
    const weeks = cs.weeks;
    const phase = _mesoPhaseForWeek(weekIdx, weeks);
    return {
      weekIdx: weekIdx,
      week: Math.min(weekIdx + 1, weeks),
      weeksTotal: weeks,
      phase: phase,
      label: _mesoLabel(phase),
      ceiling: _mesoIntensityCeiling(phase),
      complete: weekIdx >= weeks,
    };
  }
  function _startMesocycle(weeks) {
    const u = HEYS.utils;
    if (!u || !u.lsGet || !u.lsSet) return false;
    const raw = u.lsGet('heys_profile', {}) || {};
    const fp = Object.assign({}, raw.fingerboardProfile || {}, {
      mesocycle: { startedAt: _formatDateKey(new Date()), weeks: Number(weeks) || _MESO_DEFAULT_WEEKS }
    });
    u.lsSet('heys_profile', Object.assign({}, raw, { fingerboardProfile: fp }));
    return true;
  }
  Fingers.mesocycle = {
    phaseForWeek: _mesoPhaseForWeek,
    intensityCeiling: _mesoIntensityCeiling,
    label: _mesoLabel,
    current: _mesoCurrent,
    start: _startMesocycle,
  };

  // ─── Прозрачная диагностика расчётов (copy-to-clipboard) ──────────────────
  // Собирает читаемый текст: входы readiness + score/bucket/reasons, cooldown,
  // пересечение бакета, рекомендацию (+логику), мезоцикл, асимметрию. Чтобы
  // юзер видел КАК система пришла к рекомендации и индексу готовности.
  function _buildFingersDiagnostic(todayKey) {
    const L = [];
    const P = function (s) { L.push(s == null ? '' : String(s)); };
    const key = todayKey || _formatDateKey(new Date());
    const profile = getProfile();
    P('=== FINGERS · ДИАГНОСТИКА РАСЧЁТОВ ===');
    P('Дата: ' + key);
    P('Профиль: возраст=' + (profile.age != null ? profile.age : '—')
      + ', grade=' + (profile.maxVGrade || '—')
      + ', цель=' + (profile.goal || 'strength (дефолт)')
      + ', оборудование=' + (Array.isArray(profile.equipmentTypes) ? profile.equipmentTypes.join(',') : '—'));
    P('');

    // 1) Готовность
    try {
      const rIn = _buildReadinessInputs(key);
      const t = rIn.today || {};
      const hist = rIn.history || [];
      const validHist = hist.filter(function (d) {
        return d && Number.isFinite(Number(d.moodMorning)) && Number.isFinite(Number(d.wellbeingMorning));
      });
      P('— 1. ГОТОВНОСТЬ (readiness.assess) —');
      P('Входы (сегодня): настроение=' + (t.moodMorning != null ? t.moodMorning : '—')
        + ', самочувствие=' + (t.wellbeingMorning != null ? t.wellbeingMorning : '—')
        + ', стресс=' + (t.stressMorning != null ? t.stressMorning : '—')
        + ', сон=' + (t.sleepStart || '?') + '→' + (t.sleepEnd || '?'));
      P('История: ' + validHist.length + '/14 валидных дней (база для Z-score; <4 → упрощённые пороги)');
      if (t.fingers) {
        P('Последняя сессия: интенсивность=' + (t.fingers.lastIntensity || '?')
          + ', ' + Math.round((Date.now() - (Number(t.fingers.lastSessionAt) || Date.now())) / 3600e3) + 'ч назад');
      }
      // Сравнение входов с личной нормой (медиана) — объясняет вклад каждого
      // фактора, даже если он не перешагнул порог «причины».
      const _med = function (arr) {
        const v = arr.filter(function (x) { return Number.isFinite(Number(x)); }).map(Number).sort(function (a, b) { return a - b; });
        if (!v.length) return null;
        const m = Math.floor(v.length / 2);
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
      };
      const _cmp = function (label, today, base, goodHigh) {
        if (today == null || base == null) return '  ' + label + ': ' + (today != null ? today : '—') + ' (нет нормы)';
        const d = Number(today) - Number(base);
        const dir = Math.abs(d) <= 0.5 ? '≈ норма'
          : (d > 0 ? (goodHigh ? '↑ выше нормы (плюс к score)' : '↑ выше нормы (минус к score)')
                   : (goodHigh ? '↓ ниже нормы (минус к score)' : '↓ ниже нормы (плюс к score)'));
        return '  ' + label + ': ' + today + ' vs норма ' + base + ' → ' + dir;
      };
      P('Сравнение с личной нормой (медиана истории):');
      P(_cmp('настроение', t.moodMorning, _med(validHist.map(function (d) { return d.moodMorning; })), true));
      P(_cmp('самочувствие', t.wellbeingMorning, _med(validHist.map(function (d) { return d.wellbeingMorning; })), true));
      P(_cmp('стресс', t.stressMorning, _med(validHist.map(function (d) { return d.stressMorning; })), false));
      const r = (Fingers.readiness && Fingers.readiness.assess) ? Fingers.readiness.assess(t, hist) : null;
      if (r) {
        P('ИТОГ: score=' + r.score + '/100 → bucket=' + r.bucket);
        if (r.reasons && r.reasons.length) {
          P('Сработавшие пороги (крупные отклонения):');
          r.reasons.forEach(function (x) { P('  • ' + x); });
        } else {
          P('Крупных порогов не сработало — score сложился из мелких Z-дельт (см. сравнение выше).');
        }
      }
      P('Формула: 50 + Z(настроение)·10 + Z(самочувствие)·12.5 + Z(стресс,инверт)·7.5 (×shrink по объёму истории)');
      P('         − штраф за сон (<5ч:−25, <6ч:−10) − штраф за вчерашнюю нагрузку (max:−30/мод:−15/восст:−5)');
      P('         − штраф за пропуск разминки (−10). Hard-override: травма / вчера max <48ч → rest-day.');
    } catch (e) { P('readiness: ошибка ' + (e && e.message)); }
    P('');

    // 2) Cooldown
    try {
      const cd = Fingers.cooldownCheck && Fingers.cooldownCheck();
      if (cd) {
        P('— 2. COOLDOWN (восстановление связок) —');
        P('  ' + (cd.hoursSinceLast != null ? cd.hoursSinceLast + 'ч с последней сессии' : 'нет сессий')
          + (cd.lastWasMax ? ' (была max)' : '') + ' → ' + cd.recommendation
          + (cd.allowedNow === false ? ' [soft-block]' : ''));
        P('  пороги после max: <24ч=rest, 24–48=recovery, 48–72=moderate, ≥72=max');
      }
    } catch (_) {}
    P('');

    // 3) Бакет дня + рекомендация + мезоцикл
    try {
      const data = _buildTodayData(key);
      P('— 3. БАКЕТ ДНЯ (минимум из всех ограничителей) —');
      P('  readiness=' + (data.readinessBucket || '—')
        + ' ∩ cooldown=' + (data.cooldown ? data.cooldown.recommendation : '—')
        + (data.mesocycle ? ' ∩ мезоцикл=' + data.mesocycle.ceiling + ' (фаза ' + data.mesocycle.label + ')' : '')
        + ' → ИТОГ=' + data.bucket);
      P('');
      P('— 4. РЕКОМЕНДАЦИЯ —');
      if (data.recommendedProgram) {
        P('  ' + data.recommendedProgram.id + ' · интенсивность=' + (data.recommendedProgram.intensity || '?'));
        P('  логика: getRecommendedProgramId (age+equipment+grade+goal) → кламп к потолку бакета');
        P('          (_recommendForBucket): если штатная рекомендация выше дневного потолка — понижаем.');
      } else {
        P('  нет (день отдыха или нет программ под состояние/оборудование)');
      }
      if (data.mesocycle) {
        P('');
        P('— 5. МЕЗОЦИКЛ —');
        P('  неделя ' + data.mesocycle.week + '/' + data.mesocycle.weeksTotal
          + ' · фаза=' + data.mesocycle.label + ' · потолок=' + data.mesocycle.ceiling
          + (data.mesocycle.complete ? ' · ЦИКЛ ЗАВЕРШЁН' : ''));
      }
    } catch (e) { P('today: ошибка ' + (e && e.message)); }

    // 6) Асимметрия (если есть записи)
    try {
      const asym = (Fingers.records && Fingers.records.asymmetries) ? Fingers.records.asymmetries() : [];
      if (asym && asym.length) {
        P('');
        P('— 6. БАЛАНС/АСИММЕТРИЯ —');
        asym.forEach(function (f) {
          P('  • ' + f.kind + (f.ratio ? ' ×' + f.ratio : '')
            + (f.weakerSide ? ' (слабее ' + (f.weakerSide === 'left' ? 'левая' : 'правая') + ')' : ''));
        });
      }
    } catch (_) {}

    P('');
    P('=== конец диагностики ===');
    return L.join('\n');
  }
  Fingers.buildDiagnostic = _buildFingersDiagnostic;

  // Рекомендует программу, интенсивность которой не выше дневного safety-потолка
  // (data.bucket из readiness ∩ cooldown). Сначала пытается оставить штатную
  // рекомендацию getRecommendedProgramId(), если она в пределах потолка; иначе
  // понижает до самой тяжёлой допустимой среди age+equipment-eligible. rest/
  // unknown → null (Start всё равно скрыт через allowStart=false).
  function _recommendForBucket(bucket) {
    const ceil = ({ recovery: 1, moderate: 2, max: 3 })[bucket] || 0;
    if (!ceil) return null;
    const iRank = function (p) {
      return ({ recovery: 1, moderate: 2, max: 3 })[(p && p.intensity) || 'moderate'] || 2;
    };
    const programs = Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : [];
    const fp = getProfile();
    // 1) Штатная рекомендация — оставляем, если в пределах потолка.
    try {
      const recId = getRecommendedProgramId();
      const prog = recId ? programs.find(function (p) { return p.id === recId; }) : null;
      if (prog && iRank(prog) <= ceil) return prog;
    } catch (_) {}
    // 2) Иначе — самая тяжёлая допустимая среди age+equipment-eligible
    //    (те же гейты, что в getRecommendedProgramId / ProgramsTab).
    const ageNum = Number(fp.age);
    const ageFiltered = (Fingers.ageGate && Fingers.ageGate.filterPrograms)
      ? Fingers.ageGate.filterPrograms(programs, ageNum) : programs;
    const eqOpts = {
      equipmentTypes: Array.isArray(fp.equipmentTypes) ? fp.equipmentTypes : null,
      noEquipment: !!fp.noEquipment,
      blockMode: !!fp.blockMode,
      edgeLimit: fp.edgeLimit
    };
    const eligible = (Fingers.filterProgramsByEquipment
      ? Fingers.filterProgramsByEquipment(ageFiltered, eqOpts) : ageFiltered)
      .filter(function (p) { return iRank(p) <= ceil; });
    if (!eligible.length) return null;
    eligible.sort(function (a, b) { return iRank(b) - iRank(a); });
    return eligible[0];
  }

  // B1: мержит per-set feedback (RPE/боль) в КОПИЮ exercises для fingersLog.
  // feedbackByExIdx: { [exIdx]: [{ rpe:'easy'|'ok'|'hard'|null, pain:bool }, ...] }.
  // Additive-инвариант: пусто/нет → возвращаем исходный массив без изменений
  // (старый контракт fingersLog байт-в-байт). Не мутирует вход.
  function _mergeSetFeedback(exercises, feedbackByExIdx) {
    if (!Array.isArray(exercises)) return exercises;
    if (!feedbackByExIdx || typeof feedbackByExIdx !== 'object') return exercises;
    let touched = false;
    const out = exercises.map(function (ex, i) {
      const fb = feedbackByExIdx[i];
      if (!Array.isArray(fb) || !fb.length) return ex;
      const setFeedback = [];
      for (let s = 0; s < fb.length; s++) {
        const f = fb[s];
        if (!f) continue;
        setFeedback[s] = { rpe: f.rpe || null, pain: !!f.pain };
      }
      if (!setFeedback.length) return ex;
      touched = true;
      return Object.assign({}, ex, { setFeedback: setFeedback });
    });
    return touched ? out : exercises;
  }

  // B1/B19: чистая сборка контракта fingersLog («finish → дневник»). Вынесена
  // из handleComplete ради unit-тестов happy-path. opts:
  //   { programId, feedback, viaTimer, nowIso? }.
  // hadPain ставится только при наличии боли в каком-либо сете. Additive:
  // без feedback exercises остаётся прежним (см. _mergeSetFeedback).
  function _buildFingersLog(exercises, opts) {
    const o = opts || {};
    const list = Array.isArray(exercises) ? exercises : [];
    const totalMin = list.reduce(function (s, e) {
      const oneSet = (e.hangSec + e.restSec) * e.repsPerSet + e.restBetweenSetsSec;
      return s + (oneSet * e.setsCount) / 60;
    }, 0);
    const loggedExercises = _mergeSetFeedback(list, o.feedback);
    const hadPain = loggedExercises.some(function (e) {
      return Array.isArray(e.setFeedback) && e.setFeedback.some(function (f) { return f && f.pain; });
    });
    const fingersLog = {
      version: 1,
      programId: o.programId || 'custom',
      totalDurationMinutes: Math.round(totalMin),
      exercises: loggedExercises,
      completedAt: o.nowIso || new Date().toISOString(),
      viaTimer: !!o.viaTimer
    };
    if (hadPain) fingersLog.hadPain = true;
    return fingersLog;
  }

  function _bucketMeta(bucket) {
    // Returns { emoji, title, color, allowStart }
    if (bucket === 'unknown') return { emoji: '🎂', title: 'Сегодня — заполни возраст', color: '#6b7280', allowStart: false };
    if (bucket === 'rest')     return { emoji: '🛌', title: 'Сегодня — отдых', color: '#6b7280', allowStart: false };
    if (bucket === 'recovery') return { emoji: '🟢', title: 'Сегодня — восстановление', color: '#10b981', allowStart: true };
    if (bucket === 'moderate') return { emoji: '🟡', title: 'Сегодня — умеренная', color: '#f59e0b', allowStart: true };
    if (bucket === 'max')      return { emoji: '🔴', title: 'Сегодня — максимум', color: '#dc2626', allowStart: true };
    return { emoji: '❓', title: 'Сегодня', color: '#6b7280', allowStart: false };
  }

  function _formatHoursAgo(hours) {
    if (hours == null) return null;
    if (hours < 1) return 'меньше часа назад';
    if (hours < 24) return Math.round(hours) + ' ч назад';
    const days = Math.round(hours / 24);
    return days === 1 ? 'вчера' : days + ' дн. назад';
  }

  // ─── Mix trace modal ───────────────────────────────────────────────────────
  // Показывает все принципы и расчёты, по которым был собран микс.
  // Открывается по 🧮 в MixCard.
  function MixTraceModal({ trace, workout, onClose }) {
    useEffect(function () {
      const onKey = function (e) { if (e.key === 'Escape') onClose && onClose(); };
      window.addEventListener('keydown', onKey);
      return function () { window.removeEventListener('keydown', onKey); };
    }, [onClose]);

    const GOAL_LABELS = { strength: 'Сила', endurance: 'Выносливость', recovery: 'Восстановление', maintenance: 'Поддержка' };
    const READINESS_LABELS = { max: 'Готов к максимуму', moderate: 'Умеренная нагрузка', recovery: 'Только восстановление', rest: 'День отдыха' };
    const ROLE_LABELS = {
      'power': 'взрывная сила (RFD)',
      'max-strength': 'макс. сила',
      'strength-endurance': 'силовая выносливость',
      'capacity': 'аэробная ёмкость',
      'antagonist': 'антагонист'
    };
    const BUCKET_LABELS = { max: 'максимум', moderate: 'умеренный', recovery: 'восстановление' };

    const section = function (title, children) {
      return h('section', { className: 'fingers-fs-trace__section' },
        h('h3', { className: 'fingers-fs-trace__h3' }, title),
        children
      );
    };
    const kv = function (label, value) {
      return h('div', { className: 'fingers-fs-trace__kv' },
        h('span', { className: 'fingers-fs-trace__k' }, label),
        h('span', { className: 'fingers-fs-trace__v' }, value)
      );
    };

    // ── 1. Входные данные
    const inSec = section('1. Входные данные',
      h('div', null,
        kv('Цель тренировки', GOAL_LABELS[trace.inputs.goal] || trace.inputs.goal || '—'),
        kv('Готовность (cooldown)', READINESS_LABELS[trace.inputs.readiness] || trace.inputs.readiness || '—'),
        kv('Возраст', String(trace.inputs.age)),
        kv('Оборудование', trace.inputs.equipmentTypes.join(', ')),
        trace.inputs.intensityOverride ? kv('Legacy intensity-override', trace.inputs.intensityOverride) : null,
        kv('Есть боль в пальцах?', trace.safety.hasPain ? '⚠ да — потолок снижен до moderate' : 'нет'),
        kv('Доступных хватов (после age+pain)', String(trace.safety.allowedGripCount))
      )
    );

    // ── 2. Решение
    const r = trace.resolution;
    const downgradeNote = r.downgraded
      ? 'Цель естественно требует «' + (BUCKET_LABELS[r.goalNatural] || r.goalNatural) + '», но bucket = «'
        + (BUCKET_LABELS[r.bucket] || r.bucket) + '» — цель снижена ради восстановления связок.'
      : 'Цель совпала с потолком готовности или ниже него — без понижения.';
    const resSec = section('2. Резолюция: ceiling → bucket → шаблон слотов',
      h('div', null,
        kv('Начальный ceiling (по cooldown)', BUCKET_LABELS[r.initialCeiling] || r.initialCeiling),
        r.initialCeiling !== r.finalCeiling
          ? kv('Финальный ceiling (после pain-cap)', BUCKET_LABELS[r.finalCeiling] || r.finalCeiling) : null,
        kv('Bucket (рабочий потолок)', BUCKET_LABELS[r.bucket] || r.bucket),
        kv('Источник шаблона', r.slotsSource === 'goal' ? 'GOAL_TEMPLATES[' + trace.inputs.goal + '] обрезан bucket\'ом'
          : r.slotsSource === 'legacy-intensity' ? 'legacy: intensity-override (' + trace.inputs.intensityOverride + ')'
          : 'SLOT_TEMPLATES[' + r.bucket + ']'),
        kv('Шаблон слотов', r.slotsTemplate.join(' → ')),
        kv('Понижена ли цель готовностью?', downgradeNote),
        kv('Кандидатных программ (после age+pain+intensity≤ceiling)', String(r.candidatePoolSize))
      )
    );

    // ── 3. Заполнение слотов
    const slotsSec = section('3. Заполнение слотов',
      h('div', null,
        trace.slots.map(function (s, i) {
          const head = h('div', { className: 'fingers-fs-trace__slot-head' },
            h('span', { className: 'fingers-fs-trace__slot-idx' }, '#' + (i + 1)),
            h('span', { className: 'fingers-fs-trace__slot-role' }, s.role + ' · ' + s.roleLabel),
            h('span', { className: 'fingers-fs-trace__slot-pool' }, 'пул: ' + s.poolSize)
          );
          if (s.skipped) {
            return h('div', { key: i, className: 'fingers-fs-trace__slot fingers-fs-trace__slot--skipped' },
              head,
              h('div', { className: 'fingers-fs-trace__slot-skip' }, '⊘ слот пропущен: ' + s.skipped)
            );
          }
          const c = s.chosen;
          return h('div', { key: i, className: 'fingers-fs-trace__slot' },
            head,
            h('div', { className: 'fingers-fs-trace__slot-chosen' },
              h('strong', null, c.programName || c.programId), ' — ',
              c.gripId + ' @ ' + c.edgeMm + ' мм · ' + c.tier
            ),
            h('div', { className: 'fingers-fs-trace__slot-params' },
              c.hangSec + 'с виса / ' + c.restSec + 'с отдыха × ' + c.repsPerSet
                + ' повт × ' + c.setsCount + ' сетов, пауза ' + c.restBetweenSetsSec + 'с · каталог: '
                + (c.catalogAddedKg || 0) + ' кг'
            ),
            h('div', { className: 'fingers-fs-trace__slot-danger' },
              'danger A2: +' + c.dangerCost.toFixed(2) + ' → итого ' + c.dangerSpentTotal.toFixed(2)
                + ' / бюджет ' + trace.constants.DANGER_BUDGET[r.bucket]
            ),
            s.candidates && s.candidates.length > 1 ? h('details', { className: 'fingers-fs-trace__details' },
              h('summary', null, 'Все кандидаты (' + s.candidates.length + ')'),
              s.candidates.map(function (ct, j) {
                return h('div', { key: j, className: ct.chosen ? 'fingers-fs-trace__cand fingers-fs-trace__cand--chosen' : 'fingers-fs-trace__cand' },
                  h('span', null, '[' + ct.pass + '] ' + ct.programId + ' · ' + ct.gripId + '@' + ct.edgeMm),
                  ' — ',
                  h('span', null, ct.chosen ? ('✓ ' + ct.reason) : ('⊘ ' + ct.skip))
                );
              })
            ) : null
          );
        })
      )
    );

    // ── 4. Дозировка веса (MVC)
    const dosingItems = trace.dosing.filter(function (d) { return d.role === 'max-strength'; });
    const dosingSec = dosingItems.length ? section('4. Дозировка веса (Phase 2a · MVC × bucket%)',
      h('div', null,
        h('p', { className: 'fingers-fs-trace__hint' },
          'Цель ' + trace.constants.MVC_TARGET_PCT[r.bucket] + '% MVC, потолок '
            + trace.constants.MVC_CEILING_PCT + '% (выше — риск pulley-травмы). '
            + 'Снижается при отсутствии калибровки или возрастных ограничениях.'),
        dosingItems.map(function (d, i) {
          if (d.ageClamp) {
            return h('div', { key: i, className: 'fingers-fs-trace__dose' },
              h('strong', null, d.gripId + ' @ ' + d.edgeMm), ' — ',
              h('span', null, '⚠ age-clamp (' + d.ageClamp + ') · доп.вес обнулён')
            );
          }
          if (d.needsMvc) {
            return h('div', { key: i, className: 'fingers-fs-trace__dose' },
              h('strong', null, d.gripId + ' @ ' + d.edgeMm), ' — ',
              h('span', null, '🎯 MVC не откалиброван — оставлен каталожный вес'
                + (d.mvcDue ? ' (калибровка просрочена)' : ''))
            );
          }
          if (!d.formula) {
            return h('div', { key: i, className: 'fingers-fs-trace__dose' },
              h('strong', null, d.gripId + ' @ ' + d.edgeMm), ' — ',
              h('span', null, d.note || 'каталожный вес')
            );
          }
          return h('div', { key: i, className: 'fingers-fs-trace__dose' },
            h('strong', null, d.gripId + ' @ ' + d.edgeMm), ' — ',
            h('span', null, d.formula),
            h('div', { className: 'fingers-fs-trace__dose-sub' },
              'MVC ' + d.mvcKg + ' кг · BW ' + d.bodyWeightKg + ' кг · target '
                + d.targetPct + '% · max разрешено ' + d.maxAddedAllowed + ' кг · в каталоге было '
                + d.addedKgCatalog + ' кг → стало ' + d.addedKgFinal + ' кг')
          );
        })
      )
    ) : null;

    // ── 5. Объём (recovery-trim / MAV-cap)
    const volSec = section('5. Объём — recovery-trim × ' + trace.constants.RECOVERY_TRIM + ' + MAV-кап ' + trace.constants.MAV_SETS_PER_GRIP + ' сетов/хват',
      h('div', null,
        trace.volume.map(function (v, i) {
          return h('div', { key: i, className: 'fingers-fs-trace__vol' },
            h('strong', null, v.gripId + ' @ ' + v.edgeMm + ' (' + v.role + ')'),
            ' — ' + v.origSets + ' → ' + v.finalSets + ' сетов',
            h('div', { className: 'fingers-fs-trace__vol-sub' }, v.reason)
          );
        })
      )
    );

    // ── 6. Разминка
    const wuSec = section('6. Разминка',
      h('div', null,
        kv('Тип', trace.warmup.type === 'ramp' ? 'полный RAMP (15-20 мин)' : 'короткая targeted (5-8 мин)'),
        kv('Обоснование', trace.warmup.reason)
      )
    );

    // ── 7. Итог
    const outSec = section('7. Итог сессии',
      h('div', null,
        kv('Длительность', trace.outputs.durationMin + ' мин'),
        kv('Финальная интенсивность (по выбранным ролям)', trace.outputs.intensity),
        kv('Tiers оборудования', trace.outputs.tierList.join(', ') || '—'),
        kv('Источников цитирования', String(trace.outputs.sourceIds.length)),
        kv('Антагонист в сессии?', trace.outputs.hasAntagonist ? '✓ есть' : '⚠ нет — UI подскажет добавить резинку')
      )
    );

    return h('div', {
      className: 'fingers-fs-trace__backdrop',
      onClick: function (e) { if (e.target === e.currentTarget) onClose && onClose(); },
      role: 'presentation'
    },
      h('div', {
        className: 'fingers-fs-trace__modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Логика микс-сборки'
      },
        h('div', { className: 'fingers-fs-trace__topbar' },
          h('h2', { className: 'fingers-fs-trace__h2' }, '🧮 Логика микс-сборки'),
          h('button', {
            type: 'button',
            className: 'fingers-fs-trace__close',
            onClick: onClose,
            'aria-label': 'Закрыть'
          }, '×')
        ),
        h('div', { className: 'fingers-fs-trace__body' },
          inSec, resSec, slotsSec, dosingSec, volSec, wuSec, outSec
        )
      )
    );
  }

  // ─── Mix card ──────────────────────────────────────────────────────────────
  // Генерируемая «случайная сборка» — отдельный компонент, который раньше жил
  // только в Протоколах. Перенесён в Today (рядом с рекомендованным официальным
  // протоколом), чтобы Протоколы остались чистым каталогом, а Today давал две
  // альтернативы на сегодня: курированный протокол vs goal-driven mix.
  function MixCard({ onPick }) {
    const profile = getProfile();
    const ageRaw = Number(profile.age);
    const userTypes = Array.isArray(profile.equipmentTypes) && profile.equipmentTypes.length
      ? profile.equipmentTypes
      : (profile.noEquipment ? ['none']
        : profile.blockMode ? ['block']
        : profile.edgeLimit === 25 ? ['door']
        : ['full']);
    const cool = (Fingers.cooldownCheck && typeof Fingers.cooldownCheck === 'function')
      ? (function () { try { return Fingers.cooldownCheck(); } catch (_) { return null; } })()
      : null;
    const GOAL_TO_INTENSITY_MIX = { strength: 'max', endurance: 'moderate', recovery: 'recovery', maintenance: 'moderate' };
    const GOAL_LABELS_MIX = { strength: 'Сила', endurance: 'Выносливость', recovery: 'Восстановление', maintenance: 'Поддержка' };
    const mixGoal = profile.goal || 'strength';
    const mixGoalLabel = GOAL_LABELS_MIX[mixGoal] || mixGoal;
    const [mixedWorkout, setMixedWorkout] = useState(null);
    const [mixSeed, setMixSeed] = useState(0);
    useEffect(function () {
      if (!Fingers.mixEngine && !Fingers.generateMixedWorkout) return;
      const mixOpts = {
        equipmentTypes: userTypes,
        goal: mixGoal,
        intensity: GOAL_TO_INTENSITY_MIX[mixGoal] || 'moderate',
        age: ageRaw,
        readiness: cool && cool.recommendation
      };
      let w = (Fingers.mixEngine && Fingers.mixEngine.recommendDay)
        ? Fingers.mixEngine.recommendDay(mixOpts)
        : null;
      if (!w && Fingers.generateMixedWorkout) w = Fingers.generateMixedWorkout(mixOpts);
      setMixedWorkout(w);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userTypes.join(','), mixGoal, ageRaw, cool && cool.recommendation, mixSeed]);
    const onGenerateMix = useCallback(function () { setMixSeed(function (n) { return n + 1; }); }, []);
    const [traceOpen, setTraceOpen] = useState(false);
    if (!mixedWorkout) return null;
    return h(React.Fragment, null,
      traceOpen && mixedWorkout.__trace ? h(MixTraceModal, {
        trace: mixedWorkout.__trace,
        workout: mixedWorkout,
        onClose: function () { setTraceOpen(false); }
      }) : null,
      h('div', { className: 'fingers-fs-mixcard' },
      h('div', { className: 'fingers-fs-mixcard__hint' },
        h('span', { 'aria-hidden': 'true' }, '🎲 '),
        'Случайная сборка под цель и готовность — альтернатива официальному протоколу.'
      ),
      h('div', { className: 'fingers-fs-mixcard__inner' },
        h('div', { className: 'fingers-fs-mixcard__head-row' },
          h('div', { className: 'fingers-fs-mixcard__badge' },
            h('span', { 'aria-hidden': 'true' }, '🎲'),
            ' Микс'
          ),
          h('div', { className: 'fingers-fs-mixcard__goalhint' },
            'под цель «' + mixGoalLabel + '»')
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
          mixedWorkout.__trace ? h('button', {
            type: 'button',
            className: 'fingers-fs-mixcard__btn fingers-fs-mixcard__btn--trace',
            onClick: function () { setTraceOpen(true); },
            title: 'Показать как собран микс (все принципы и расчёты)'
          },
            h('span', { 'aria-hidden': 'true' }, '🧮')
          ) : null,
          h('button', {
            type: 'button',
            className: 'fingers-fs-mixcard__btn fingers-fs-mixcard__btn--launch',
            onClick: function () { if (typeof onPick === 'function') onPick(mixedWorkout); }
          }, 'Запустить микс')
        )
      )
    ));
  }

  function TodayTab({ onPickProgram, onSwitchToPrograms, onSwitchToConstructor, onRequestOnboarding }) {
    const todayKey = useMemo(function () {
      const d = new Date();
      return _formatDateKey(d);
    }, []);
    // Re-compute on mount + при возвращении на таб; не пересчитываем на каждый
    // render. Cooldown/readiness меняются медленно — раз в открытие достаточно.
    const data = useMemo(function () { return _buildTodayData(todayKey); }, [todayKey]);
    const meta = _bucketMeta(data.bucket);

    // Profile incomplete — CTA на onboarding, никаких рекомендаций.
    if (data.profileIncomplete) {
      return h('div', { className: 'fingers-fs-empty', style: { padding: 24, textAlign: 'center' } },
        h('div', { style: { fontSize: 40, marginBottom: 12 } }, meta.emoji),
        h('h3', { style: { margin: '0 0 8px', fontSize: 17 } }, meta.title),
        h('p', { style: { fontSize: 14, opacity: 0.75, marginBottom: 16 } },
          'Без возраста не можем подобрать безопасные программы'),
        h('button', {
          type: 'button',
          className: 'fingers-fs-btn fingers-fs-btn--primary',
          onClick: onRequestOnboarding
        }, 'Заполнить профиль')
      );
    }

    const cdHint = data.cooldown && data.cooldown.hoursSinceLast != null
      ? _formatHoursAgo(data.cooldown.hoursSinceLast) +
        (data.cooldown.lastWasMax ? ' — была max-нагрузка' : '')
      : 'Первая тренировка';

    // Build reasons-list: top-3 из readiness + cooldown hint отдельной строкой.
    const reasonItems = (data.reasons || []).slice(0, 3);

    return h('div', { className: 'fingers-fs-today', style: { padding: '6px 0 12px' } },
      // ─── Hero: readiness-гадж (число в цветном кольце) + статус + причины ───
      // Title уже несёт текстовый бакет ("Сегодня — восстановление"); отдельный
      // premium-бейдж убран как избыточный — score-кольцо + meta.title + reasons
      // уже покрывают readiness-сигнал.
      h('div', {
        className: 'fingers-fs-today__hero',
        style: {
          padding: '18px 18px 16px', borderRadius: 16, marginBottom: 16,
          background: 'linear-gradient(135deg, ' + meta.color + '1f 0%, ' + meta.color + '08 100%)',
          border: '1px solid ' + meta.color + '33'
        }
      },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 14 } },
          data.score != null
            ? h('div', {
                style: {
                  flex: '0 0 auto', width: 60, height: 60, borderRadius: '50%',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  background: meta.color + '1f', border: '2.5px solid ' + meta.color, color: meta.color
                }
              },
                h('span', { style: { fontSize: 19, fontWeight: 800, lineHeight: 1 } }, data.score),
                h('span', { style: { fontSize: 10, opacity: 0.7, marginTop: 1, fontWeight: 600 } }, '/ 100')
              )
            : h('span', { style: { flex: '0 0 auto', fontSize: 36 }, 'aria-hidden': 'true' }, meta.emoji),
          h('div', { style: { minWidth: 0 } },
            h('h2', { style: { margin: 0, fontSize: 19, fontWeight: 700, color: meta.color, lineHeight: 1.2 } }, meta.title),
            h('div', { style: { fontSize: 13, opacity: 0.7, marginTop: 3 } }, cdHint),
            data.mesocycle
              ? h('div', {
                  style: { display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6,
                    padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    background: meta.color + '1a', color: meta.color }
                }, data.mesocycle.complete
                    ? '🔄 Цикл завершён — пора пере-тест'
                    : '🗓 Цикл: нед. ' + data.mesocycle.week + '/' + data.mesocycle.weeksTotal + ' · ' + data.mesocycle.label)
              : null
          )
        ),
        reasonItems.length
          ? h('div', {
              style: { marginTop: 14, paddingTop: 12, borderTop: '1px solid ' + meta.color + '22',
                display: 'flex', flexDirection: 'column', gap: 6 }
            },
              reasonItems.map(function (r, i) {
                return h('div', { key: i, style: { fontSize: 13, opacity: 0.85, display: 'flex', gap: 8 } },
                  h('span', { style: { color: meta.color, flex: '0 0 auto', fontWeight: 700 } }, '•'),
                  h('span', null, r));
              })
            )
          : null
      ),

      // ─── Mix — goal-driven случайная сборка, перед официальной рекомендацией.
      // Юзер видит две альтернативы на сегодня: микс или курированный протокол.
      meta.allowStart ? h(MixCard, { onPick: onPickProgram }) : null,

      // ─── Рекомендация — той же полированной program-card, что в Протоколах ───
      data.recommendedProgram && meta.allowStart
        ? (function () {
            const p = data.recommendedProgram;
            return h('div', {
              className: 'fingers-fs-program-card fingers-fs-program-card--recommended',
              style: { marginBottom: 14 }
            },
              h('div', { className: 'fingers-fs-program-card__rec-badge', 'aria-label': 'Рекомендовано на сегодня' },
                h('span', { className: 'fingers-fs-program-card__rec-star', 'aria-hidden': 'true' }, '★'),
                h('span', null, 'на сегодня')
              ),
              h('h3', { className: 'fingers-fs-program-card__title' }, p.name || p.id),
              p.description ? h(ProgramDesc, { text: p.description }) : null,
              h('div', { className: 'fingers-fs-program-card__chips' },
                h('span', {
                  className: 'fingers-fs-chip fingers-fs-chip--intensity',
                  'data-fingers-intensity': p.intensity || 'moderate'
                }, intensityLabel(p.intensity)),
                p.durationMin
                  ? h('span', { className: 'fingers-fs-chip' }, h('span', { 'aria-hidden': 'true' }, '⏱ '), p.durationMin + ' мин')
                  : null,
                p.level ? h('span', { className: 'fingers-fs-chip fingers-fs-chip--level' }, p.level) : null
              ),
              h('button', {
                type: 'button',
                className: 'fingers-fs-cta',
                style: { width: '100%' },
                onClick: function () { onPickProgram && onPickProgram(p); }
              }, 'Начать тренировку →')
            );
          })()
        : null,

      // ─── Rest-day / нет программ — callout ───
      !meta.allowStart && !data.profileIncomplete
        ? h('div', {
            className: 'fingers-fs-progress-callout',
            style: { display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }
          },
            h('span', { style: { fontSize: 22, flex: '0 0 auto' }, 'aria-hidden': 'true' }, meta.emoji),
            h('span', { style: { fontSize: 14, lineHeight: 1.45 } },
              data.bucket === 'rest'
                ? 'Сегодня лучше отдохнуть — связки восстанавливаются медленнее мышц. Прогресс не делается через переутомление.'
                : 'Подходящих протоколов под текущее состояние нет — загляни в каталог или собери свою сессию.')
          )
        : null
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

    // Бинарный фильтр «Под цель / Все». Под цель: оставляем только протоколы
    // с intensity, соответствующей маппингу profile.goal → intensity (см.
    // GOAL_TO_INTENSITY ниже). Дефолт — true, т.е. пользователь сразу видит
    // релевантный список; toggle переключает в «Все» для просмотра каталога.
    const _GOAL_TO_INTENSITY_LOCAL = { strength: 'max', endurance: 'moderate', recovery: 'recovery', maintenance: 'moderate' };
    const _currentGoal = (getProfile().goal) || 'strength';
    const _goalIntensity = _GOAL_TO_INTENSITY_LOCAL[_currentGoal] || 'moderate';
    const [onlyForGoal, setOnlyForGoal] = useState(function () {
      const u = HEYS.utils;
      const v = u && u.lsGet ? u.lsGet('fingers_only_for_goal', '1') : '1';
      return v !== '0';
    });
    const onToggleOnlyForGoal = useCallback(function (next) {
      setOnlyForGoal(next);
      if (HEYS.utils && HEYS.utils.lsSet) HEYS.utils.lsSet('fingers_only_for_goal', next ? '1' : '0');
    }, []);
    const visibleFiltered = onlyForGoal
      ? filtered.filter(function (p) { return (p.intensity || 'moderate') === _goalIntensity; })
      : filtered;
    const goalMatchCount = filtered.filter(function (p) { return (p.intensity || 'moderate') === _goalIntensity; }).length;

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

    // Cooldown — нужен для readiness-aware launch guard (safeLaunch) и для
    // подсветки mix-карты под бакет дня.
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

    return h('div', { className: 'fingers-fs-programs-wrap' },

      // Мини-переключатель «Под цель / Все» — сидит над сеткой протоколов.
      // Заменяет 4-чиповый intensity-фильтр, не путая с goal-селектором сверху.
      filtered.length > 0 ? h('div', {
        className: 'fingers-fs-scope-toggle',
        role: 'tablist',
        'aria-label': 'Какие протоколы показывать'
      },
        h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': onlyForGoal,
          className: 'fingers-fs-scope-toggle__btn' + (onlyForGoal ? ' is-active' : ''),
          onClick: function () { onToggleOnlyForGoal(true); }
        }, 'Под цель ', h('span', { className: 'fingers-fs-scope-toggle__count' }, goalMatchCount)),
        h('button', {
          type: 'button',
          role: 'tab',
          'aria-selected': !onlyForGoal,
          className: 'fingers-fs-scope-toggle__btn' + (!onlyForGoal ? ' is-active' : ''),
          onClick: function () { onToggleOnlyForGoal(false); }
        }, 'Все ', h('span', { className: 'fingers-fs-scope-toggle__count' }, filtered.length))
      ) : null,

      visibleFiltered.length === 0
        ? h('div', { className: 'fingers-fs-empty', style: { padding: '24px 16px', textAlign: 'center' } },
            h('p', { style: { margin: 0, fontSize: 14, opacity: 0.7 } },
              onlyForGoal
                ? 'Под текущую цель протоколов нет. Переключи на «Все» или поменяй цель.'
                : 'Нет протоколов под текущее оборудование. Включи другой тип в баре сверху.')
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
  function ConstructorTab({ exercises, setExercises, userBoard, userAge, programName, programIntensity, onUnbindProgram }) {
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
                    programIntensity: programIntensity,
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
   * Собирает входы для Fingers.readiness.assess(today, history) из реальных
   * dayv2-записей. morning-поля (moodMorning/wellbeingMorning/stressMorning/
   * sleepStart/sleepEnd) лежат на верхнем уровне dayv2 — assess читает их as-is.
   *
   * История — 14 ПРЕДЫДУЩИХ дней (i=1..14), сегодня НЕ включаем: assess
   * исключает today из baseline по ссылке (d !== safeToday), а мы отдаём клон,
   * так что включение today сюда испортило бы baseline. Прошлые дни и так не
   * несут .fingers.lastIntensity (это синтетическое поле), поэтому yesterday-FB
   * берём из cooldownCheck() — единственного источника часов-с-последней-сессии.
   */
  function _buildReadinessInputs(todayKey) {
    const today = Object.assign({}, _readDayDiary(todayKey) || { date: todayKey });
    const history = [];
    const base = new Date(todayKey + 'T00:00:00');
    for (let i = 1; i <= 14; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const day = _readDayDiary(_formatDateKey(d));
      if (day) history.push(day);
    }
    try {
      const cool = (Fingers.cooldownCheck && Fingers.cooldownCheck()) || null;
      if (cool && cool.hoursSinceLast != null) {
        // lastIntensity: точно знаем только lastWasMax; для не-max ставим
        // 'moderate' — assess использует intensity==='max' лишь для hard-пути,
        // так что этого достаточно и не врёт на критичной ветке.
        today.fingers = {
          lastSessionAt: Date.now() - cool.hoursSinceLast * 3600e3,
          lastIntensity: cool.lastWasMax ? 'max' : 'moderate',
        };
      }
    } catch (_) {}
    // B9: недавний пропуск разогрева → флаг для readiness-штрафа.
    if (_warmupSkippedRecently()) {
      today.fingers = Object.assign({}, today.fingers, { warmupSkippedRecently: true });
    }
    return { today: today, history: history };
  }

  // B9: персист/чтение отметки «пропустил разогрев». Scoped по клиенту
  // (паттерн heys_<cid>_fingers_*). Влияет на readiness следующей сессии в
  // пределах 48ч (штраф в readiness.assess).
  function _warmupSkipKey() {
    const cid = (HEYS && HEYS.currentClientId) ? HEYS.currentClientId : '';
    return cid ? ('heys_' + cid + '_fingers_warmup_skip_v1') : 'heys_fingers_warmup_skip_v1';
  }
  function _recordWarmupSkip() {
    try { if (HEYS.utils && HEYS.utils.lsSet) HEYS.utils.lsSet(_warmupSkipKey(), Date.now()); } catch (_) { /* noop */ }
  }
  function _warmupSkippedRecently() {
    try {
      const u = HEYS.utils;
      const at = u && u.lsGet ? Number(u.lsGet(_warmupSkipKey(), 0)) : 0;
      return at > 0 && (Date.now() - at) < 48 * 3600e3;
    } catch (_) { return false; }
  }

  // B6: reader недавней finger-боли (dayv2 за lookbackDays). Reuse приватных
  // _readDayDiary/_formatDateKey; pure-детект — Fingers.painGate.dayHasFingerPain.
  // Возвращает { hasPain, daysAgo? } для grip-gating в конструкторе.
  function _recentFingerPain(lookbackDays) {
    const n = Math.max(1, Math.min(30, lookbackDays || 7));
    const pg = Fingers.painGate;
    if (!pg || typeof pg.dayHasFingerPain !== 'function') return { hasPain: false };
    const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const day = _readDayDiary(_formatDateKey(d));
      if (day && pg.dayHasFingerPain(day)) return { hasPain: true, daysAgo: i };
    }
    return { hasPain: false };
  }
  Fingers.recentFingerPain = _recentFingerPain;

  // B4: RPE последней сессии для конкретного хвата (для авто-прогрессии).
  // Идёт от сегодня назад, берёт первую finger-сессию с этим gripId и
  // setFeedback. Возвращает { rpe:[...], daysAgo }.
  function _lastGripFeedback(gripId, lookbackDays) {
    const n = Math.max(1, Math.min(60, lookbackDays || 30));
    const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const day = _readDayDiary(_formatDateKey(d));
      if (!day || !Array.isArray(day.trainings)) continue;
      for (let t = day.trainings.length - 1; t >= 0; t--) {
        const tr = day.trainings[t];
        if (!tr || tr.type !== 'fingers' || !tr.fingersLog || !Array.isArray(tr.fingersLog.exercises)) continue;
        const ex = tr.fingersLog.exercises.find(function (e) {
          return e && e.gripId === gripId && Array.isArray(e.setFeedback);
        });
        if (ex) {
          const rpe = ex.setFeedback.map(function (f) { return f && f.rpe; }).filter(Boolean);
          if (rpe.length) return { rpe: rpe, daysAgo: i };
        }
      }
    }
    return { rpe: [], daysAgo: null };
  }
  Fingers.lastGripFeedback = _lastGripFeedback;

  // B18: извлекает детали дня (для модалки по клику в календаре) из dayv2-объекта.
  // Pure. Возвращает { sessions:[{ programId, durationMinutes, hadPain, notes,
  // exercises:[{ gripId, edgeSizeMm, addedWeightKg, setsCount, rpe:[...], pain }] }] }.
  function _buildDayDetail(day) {
    const out = { sessions: [] };
    if (!day || !Array.isArray(day.trainings)) return out;
    day.trainings.forEach(function (tr, idx) {
      if (!tr || tr.type !== 'fingers' || !tr.fingersLog) return;
      const log = tr.fingersLog;
      const exercises = (Array.isArray(log.exercises) ? log.exercises : []).map(function (ex) {
        const fb = Array.isArray(ex.setFeedback) ? ex.setFeedback : [];
        return {
          gripId: ex.gripId || null,
          edgeSizeMm: ex.edgeSizeMm != null ? ex.edgeSizeMm : null,
          addedWeightKg: Number(ex.addedWeightKg) || 0,
          setsCount: Number(ex.setsCount) || 0,
          rpe: fb.map(function (f) { return f && f.rpe; }).filter(Boolean),
          pain: fb.some(function (f) { return f && f.pain; }),
        };
      });
      out.sessions.push({
        trainingIndex: idx,
        programId: log.programId || 'custom',
        durationMinutes: Number(log.totalDurationMinutes) || 0,
        hadPain: !!log.hadPain || exercises.some(function (e) { return e.pain; }),
        notes: tr.notes || '',
        exercises: exercises,
      });
    });
    return out;
  }
  Fingers._buildDayDetail = _buildDayDetail;

  // B12: экспорт тренировочных данных пальцев. Pure CSV-сериализация — одна
  // строка на упражнение сессии (date/program/intensity/grip/edge/weight/sets/
  // rpe/pain). RFC4180-эскейпинг полей с запятой/кавычкой/переводом строки.
  function buildFingersCsv(rows) {
    const cols = ['date', 'program', 'intensity', 'durationMin', 'grip', 'edgeMm', 'addedKg', 'sets', 'rpe', 'pain'];
    const esc = function (v) {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [cols.join(',')];
    (Array.isArray(rows) ? rows : []).forEach(function (r) {
      lines.push([
        r.date, r.program, r.intensity, r.durationMin, r.grip, r.edgeMm, r.addedKg,
        r.sets, (Array.isArray(r.rpe) ? r.rpe.join(' ') : (r.rpe || '')), r.pain ? 'yes' : ''
      ].map(esc).join(','));
    });
    return lines.join('\n');
  }
  Fingers.buildFingersCsv = buildFingersCsv;

  // B12 reader: собирает плоские строки экспорта из dayv2 за lookbackDays
  // (reuse _buildDayDetail). Newest-first по скану.
  function _collectFingersExportRows(lookbackDays) {
    const n = Math.max(1, Math.min(730, lookbackDays || 365));
    const rows = [];
    const today = new Date();
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = _formatDateKey(d);
      const detail = _buildDayDetail(_readDayDiary(key));
      detail.sessions.forEach(function (s) {
        const intensity = (Fingers.getProgramIntensity && Fingers.getProgramIntensity(s.programId)) || '';
        s.exercises.forEach(function (ex) {
          rows.push({
            date: key, program: s.programId, intensity: intensity,
            durationMin: s.durationMinutes, grip: ex.gripId, edgeMm: ex.edgeSizeMm,
            addedKg: ex.addedWeightKg, sets: ex.setsCount, rpe: ex.rpe, pain: ex.pain,
          });
        });
      });
    }
    return rows;
  }
  Fingers._collectFingersExportRows = _collectFingersExportRows;

  // B12: триггер скачивания CSV (browser-only). Собирает строки + Blob + anchor.
  function exportFingersCsv() {
    try {
      const rows = _collectFingersExportRows(365);
      const csv = buildFingersCsv(rows);
      if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fingers-export.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(url); } catch (_) {} }, 1000);
      return true;
    } catch (e) {
      console.warn('[Fingers] exportFingersCsv failed:', e);
      return false;
    }
  }
  Fingers.exportFingersCsv = exportFingersCsv;

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
    // Strength trend: per-grip максимум планируемого addedWeightKg по неделям
    // (gripId → Array(12), индекс 0 = текущая неделя). Это РАБОЧИЙ вес из плана
    // сессии, не измеренный MVC — честный лейбл «Рабочий вес» на UI.
    const strengthByGrip = Object.create(null);
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
              if (!ex || !ex.gripId) return;
              if (!usedInSession[ex.gripId]) {
                usedInSession[ex.gripId] = true;
                gripUsage[ex.gripId] = (gripUsage[ex.gripId] || 0) + 1;
              }
              // Strength trend — max рабочего веса этого хвата в этой неделе.
              const w = Number(ex.addedWeightKg) || 0;
              if (w > 0 && weekIdx < 12) {
                const arr = strengthByGrip[ex.gripId]
                  || (strengthByGrip[ex.gripId] = new Array(12).fill(0));
                if (w > arr[weekIdx]) arr[weekIdx] = w;
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
      gripUsage: gripUsage,
      strengthByGrip: strengthByGrip
    };
  }

  // B11: цель недельного объёма (closing-the-loop). Цель = среднее по предыдущим
  // неделям с данными (индексы 1..4, weeklyVolume[0]=текущая) — «держи свой
  // недавний объём». Pure. Возвращает { thisWeek, target, pct } минут;
  // target=null если нет истории (рано ставить план).
  function _weeklyVolumeTarget(weeklyVolume) {
    const wv = Array.isArray(weeklyVolume) ? weeklyVolume : [];
    const thisWeek = Math.round(Number(wv[0]) || 0);
    const prior = [];
    for (let i = 1; i <= 4; i++) {
      const v = Number(wv[i]) || 0;
      if (v > 0) prior.push(v);
    }
    if (!prior.length) return { thisWeek: thisWeek, target: null, pct: null };
    const target = Math.round(prior.reduce(function (s, v) { return s + v; }, 0) / prior.length);
    const pct = target > 0 ? Math.round(100 * thisWeek / target) : null;
    return { thisWeek: thisWeek, target: target, pct: pct };
  }
  Fingers._weeklyVolumeTarget = _weeklyVolumeTarget;

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
          // B11: цель недели = среднее по прошлым неделям + progress-bar.
          (function () {
            const tgt = _weeklyVolumeTarget(wv);
            if (tgt.target == null) return null;
            const pct = Math.max(0, Math.min(100, tgt.pct || 0));
            const reached = (tgt.pct || 0) >= 100;
            return h('div', { className: 'fingers-fs-volume-target', style: { marginBottom: 12 } },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 } },
                h('span', { style: { opacity: 0.8 } }, 'Эта неделя: ' + tgt.thisWeek + ' / ~' + tgt.target + ' мин'),
                h('span', { style: { fontWeight: 600, color: reached ? '#10b981' : '#f59e0b' } },
                  (tgt.pct != null ? tgt.pct + '%' : ''))
              ),
              h('div', { style: { height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' } },
                h('div', { style: { height: '100%', width: pct + '%', borderRadius: 4,
                  background: reached ? '#10b981' : '#f59e0b', transition: 'width .3s' } }))
            );
          })(),
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

      // ─── Strength trend: рабочий вес по неделям, per grip ───────────────
      // ВАЖНО: это планируемый addedWeightKg из сессий, НЕ измеренный MVC.
      // Кривая нагрузки, а не теста силы — лейбл «Рабочий вес» честно отражает.
      (function () {
        const sbg = stats.strengthByGrip || {};
        const gripIds = Object.keys(sbg).filter(function (g) {
          return sbg[g].filter(function (v) { return v > 0; }).length >= 2;
        });
        if (gripIds.length === 0) return null;
        gripIds.sort(function (a, b) {
          return sbg[b].filter(Boolean).length - sbg[a].filter(Boolean).length;
        });
        return h('section', { className: 'fingers-fs-progress-section' },
          h('div', { className: 'fingers-fs-progress-section__header' },
            h('h3', { className: 'fingers-fs-progress-section__title' }, 'Рабочий вес'),
            h('span', { className: 'fingers-fs-progress-section__hint' }, '12 недель · кг')
          ),
          h('div', { className: 'fingers-fs-strength-note' },
            'Планируемый доп. вес в сессиях (не результат теста MVC).'),
          gripIds.map(function (gid) {
            const series = sbg[gid];
            const maxV = Math.max.apply(null, series);
            const grip = Fingers.getGripById ? Fingers.getGripById(gid) : null;
            const label = (grip && grip.label) || gid;
            const bars = series.slice().reverse();
            return h('div', { key: gid, className: 'fingers-fs-strength-grip' },
              h('div', { className: 'fingers-fs-strength-grip__label' }, label),
              h('div', { className: 'fingers-fs-volume-chart' },
                bars.map(function (val, idx) {
                  const heightPct = val > 0 ? Math.max(6, Math.round((val / maxV) * 100)) : 2;
                  const isCurrent = idx === bars.length - 1;
                  const weeksAgo = bars.length - 1 - idx;
                  const wkLabel = weeksAgo === 0 ? 'эта неделя' : weeksAgo + ' нед назад';
                  return h('div', {
                    key: idx,
                    className: 'fingers-fs-volume-chart__bar-wrap',
                    title: wkLabel + ': ' + val + ' кг'
                  },
                    h('div', {
                      className: 'fingers-fs-volume-chart__bar' + (isCurrent ? ' is-current' : ''),
                      style: { height: heightPct + '%' }
                    },
                      val > 0 ? h('span', { className: 'fingers-fs-volume-chart__bar-value' }, val) : null
                    )
                  );
                })
              )
            );
          })
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

      // ─── Асимметрии: open-vs-crimp + L/R (если есть данные _L/_R) ─────
      (function () {
        if (!Fingers.records || typeof Fingers.records.asymmetries !== 'function') return null;
        let flags = [];
        try { flags = Fingers.records.asymmetries() || []; } catch (_) { flags = []; }
        if (!flags.length) return null;
        return h('section', { className: 'fingers-fs-progress-section' },
          h('div', { className: 'fingers-fs-progress-section__header' },
            h('h3', { className: 'fingers-fs-progress-section__title' }, 'Баланс силы'),
            h('span', { className: 'fingers-fs-progress-section__hint' },
              flags.length + (flags.length === 1 ? ' сигнал' : flags.length < 5 ? ' сигнала' : ' сигналов'))
          ),
          h('div', { className: 'fingers-fs-asym-list' },
            flags.map(function (f, i) {
              const warn = f.flag === 'warning';
              return h('div', {
                key: (f.kind || 'a') + '_' + i,
                className: 'fingers-fs-asym' + (warn ? ' is-warning' : ''),
              },
                h('span', { className: 'fingers-fs-asym__icon', 'aria-hidden': 'true' }, warn ? '⚠' : 'ℹ'),
                h('div', { className: 'fingers-fs-asym__body' },
                  h('div', { className: 'fingers-fs-asym__hint' }, f.hint || ''),
                  (f.ratio || f.edgeMm) && h('div', { className: 'fingers-fs-asym__meta' },
                    (f.ratio ? '×' + f.ratio + ' разница' : '')
                    + (f.ratio && f.edgeMm ? ' · ' : '')
                    + (f.edgeMm ? f.edgeMm + ' мм' : '')),
                  // B5: конкретный bias-совет (какая рука + 2:1) для lr_asymmetry.
                  (function () {
                    const adv = (Fingers.records && Fingers.records.asymmetryAdvice)
                      ? Fingers.records.asymmetryAdvice(f) : null;
                    return adv ? h('div', {
                      className: 'fingers-fs-asym__advice',
                      style: { marginTop: 6, fontSize: 13, lineHeight: 1.4, color: '#fbbf24' }
                    }, '→ ' + adv.text) : null;
                  })()
                )
              );
            })
          )
        );
      })(),

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
    // B18: клик по дню → модалка с деталями (упражнения, хваты, RPE, боль, заметка).
    const [detailKey, setDetailKey] = useState(null);
    if (!Fingers.YearHeatmap) {
      return h('div', { className: 'fingers-fs-empty' },
        h('p', null, 'Календарь недоступен (module not loaded).'));
    }
    const currentYear = new Date().getFullYear();
    const detail = detailKey ? _buildDayDetail(_readDayDiary(detailKey)) : null;
    const rpeEmoji = { easy: '😎', ok: '😐', hard: '🥵' };
    return h('div', null,
      h('h3', { style: { margin: '0 0 16px' } }, '📅 Год тренировок'),
      h(Fingers.YearHeatmap, { year: currentYear, onDayClick: function (dateKey) { setDetailKey(dateKey); } }),
      // B18: bottom-sheet деталей дня.
      detailKey && detail ? h('div', {
        className: 'fingers-fs-day-detail-overlay',
        style: { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'center', background: 'rgba(0,0,0,0.5)' },
        onClick: function () { setDetailKey(null); }
      },
        h('div', {
          style: { width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto',
            background: 'var(--fingers-fs-card-bg, #1b1b1f)', borderRadius: '16px 16px 0 0',
            padding: 20, border: '1px solid rgba(255,255,255,0.12)' },
          onClick: function (e) { e.stopPropagation(); }
        },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 } },
            h('h3', { style: { margin: 0, fontSize: 17 } }, detailKey),
            h('button', { type: 'button', className: 'fingers-fs-ghost', onClick: function () { setDetailKey(null); } }, '✕')
          ),
          detail.sessions.length === 0
            ? h('p', { style: { opacity: 0.7 } }, 'Нет тренировок пальцев в этот день.')
            : detail.sessions.map(function (s, si) {
                return h('div', { key: si, style: { marginBottom: 16 } },
                  h('div', { style: { fontWeight: 600, marginBottom: 6 } },
                    (s.programId || 'custom') + ' · '
                    + intensityLabel((Fingers.getProgramIntensity && Fingers.getProgramIntensity(s.programId)) || 'moderate')
                    + ' · ' + s.durationMinutes + ' мин' + (s.hadPain ? ' · 🩹 боль' : '')),
                  s.notes ? h('div', { style: { fontSize: 13, opacity: 0.75, marginBottom: 6 } }, '«' + s.notes + '»') : null,
                  h('div', null, s.exercises.map(function (ex, ei) {
                    const grip = Fingers.GRIPS_BY_ID && Fingers.GRIPS_BY_ID[ex.gripId];
                    const gl = grip ? grip.label : (ex.gripId || '—');
                    const rpeStr = ex.rpe.map(function (r) { return rpeEmoji[r] || r; }).join(' ');
                    return h('div', { key: ei, style: { fontSize: 13, padding: '4px 0', borderTop: ei ? '1px solid rgba(255,255,255,0.06)' : 'none' } },
                      gl + ' · ' + (ex.edgeSizeMm != null ? ex.edgeSizeMm + 'мм' : '—')
                      + (ex.addedWeightKg ? ' · +' + ex.addedWeightKg + 'кг' : '')
                      + ' · ' + ex.setsCount + ' подх.'
                      + (rpeStr ? ' · ' + rpeStr : '')
                      + (ex.pain ? ' · 🩹' : ''));
                  }))
                );
              })
        )
      ) : null
    );
  }

  // --- Live session — ведомое выполнение упражнения с countdown timer ---
  // Каждое exercise = собственный cycle (key={exIdx} → re-mount hook'a).
  // ─── useExerciseShell (Step 4 / ревью #9 архитектура) ────────────────────────
  // Общий каркас для HangRunner и RepsRunner: RPE/pain-захват (S8),
  // persistence-snapshot, snapshot-resume, abort confirm-flow, pause/resume.
  // ВСЯ safety-логика (onSetFeedback wiring, final RPE → onDone, pain-чекбокс)
  // живёт здесь — один источник истины, без дубля между runner'ами.
  //
  // Dependency loop chicken-and-egg: shell нужен cycle для abort/start/pause,
  // cycle нужен shell-callbacks для onComplete/onStateChange. Решение —
  // `cycleRef` ref-late-binding: shell хранит ref, runner кладёт cycle в ref
  // после своего хук-вызова. Все эффекты/коллбэки шелла бьют через ref на
  // момент исполнения (после render), не на момент создания.
  function useExerciseShell({
    exercise, exIdx, totalExercises, dateKey, trainingIndex, exercises, programId,
    initialSnapshot, onDone, onAbort, onSetFeedback,
    cycleRef
  }) {
    const keepSnapshotOnAbortRef = React.useRef(false);
    const [rpePrompt, setRpePrompt] = useState(null);
    const [rpePain, setRpePain] = useState(false);

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

    // B1: обёртка onStateChange — на входе в BIG_REST показываем RPE-промпт за
    // только что завершённый сет (meta.setIdx); на старте нового сета (HANG/
    // SET_PREP) авто-дисмиссим незакрытый non-final промпт (= skip). Без
    // onSetFeedback фича выключена (поведение прежнее). persistence не трогаем.
    const handleStateChangeRpe = useCallback(function (nextState, meta) {
      handleStateChange(nextState, meta);
      if (!onSetFeedback) return;
      const STATES = Fingers.STATES || {};
      if (nextState === STATES.BIG_REST) {
        const sIdx = meta && meta.setIdx != null ? meta.setIdx : 0;
        setRpePrompt({ setIdx: sIdx, isFinal: false });
      } else if (nextState === STATES.HANG || nextState === STATES.SET_PREP || nextState === STATES.REPS_INPUT) {
        // REPS_INPUT добавлен (Step 4): для reps-cycle активная фаза = REPS_INPUT,
        // не HANG. Тот же auto-dismiss non-final prompt при заходе в активную фазу.
        setRpePrompt(function (p) { return (p && !p.isFinal) ? null : p; });
      }
    }, [handleStateChange, onSetFeedback]);

    // B1: на DONE (последний сет) — вместо немедленного onDone показываем
    // финальный промпт; onDone вызывается из submit/skip. Без onSetFeedback —
    // прежнее поведение (сразу onDone).
    const handleCycleComplete = useCallback(function () {
      if (!onSetFeedback) { if (onDone) onDone(); return; }
      const lastSet = Math.max(0, (Number(exercise.setsCount) || 1) - 1);
      setRpePrompt({ setIdx: lastSet, isFinal: true });
    }, [onSetFeedback, onDone, exercise.setsCount]);

    // B1: submit/skip RPE-промпта. submit пишет feedback наверх (recordSetFeedback);
    // на финальном сете оба пути завершают упражнение через onDone.
    const submitRpe = useCallback(function (rpe, pain) {
      setRpePrompt(function (p) {
        if (p && onSetFeedback) {
          try { onSetFeedback(exIdx, p.setIdx, { rpe: rpe, pain: !!pain }); } catch (_) {}
        }
        if (p && p.isFinal && onDone) onDone();
        return null;
      });
      setRpePain(false);
    }, [exIdx, onSetFeedback, onDone]);
    const skipRpe = useCallback(function () {
      setRpePrompt(function (p) {
        if (p && p.isFinal && onDone) onDone();
        return null;
      });
      setRpePain(false);
    }, [onDone]);

    // Auto-start session на mount через cycleRef (late-binding cycle).
    useEffect(function () {
      let cancelled = false;
      const waitPromise = (HEYS.Fingers?.voice?.waitForQueue)
        ? HEYS.Fingers.voice.waitForQueue()
        : Promise.resolve();
      const launch = function () {
        try {
          const cycle = cycleRef && cycleRef.current;
          if (!cycle) return;
          const useResume = initialSnapshot
            && initialSnapshot.exIdx === exIdx
            && typeof cycle.startFromSnapshot === 'function';
          if (useResume) cycle.startFromSnapshot(initialSnapshot);
          else if (typeof cycle.start === 'function') cycle.start();
        } catch (e) {
          console.warn('[Fingers.useExerciseShell] start failed:', e);
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

    // B1: RPE/боль оверлей. Рендерится поверх любой ветки (CountdownDisplay или
    // fallback), чтобы финальный сет (isFinal) гарантированно мог завершить
    // сессию через submit/skip. Non-final — поверх отдыха, не блокирует таймер.
    const rpeOverlay = rpePrompt ? (function () {
      const setNo = (Number(rpePrompt.setIdx) || 0) + 1;
      const title = rpePrompt.isFinal
        ? 'Последний подход — как прошёл?'
        : ('Подход ' + setNo + ' — как прошёл?');
      const btn = function (key, label, rpeVal) {
        return h('button', {
          key: key,
          type: 'button',
          className: 'fingers-fs-btn',
          style: { flex: 1, fontSize: 15, padding: '12px 8px' },
          onClick: function () { submitRpe(rpeVal, rpePain); }
        }, label);
      };
      return h('div', {
        className: 'fingers-fs-rpe-overlay',
        style: {
          position: 'fixed', inset: 0, zIndex: 40,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', padding: 20
        }
      },
        h('div', {
          style: {
            width: '100%', maxWidth: 360, borderRadius: 16, padding: 20,
            background: 'var(--fingers-fs-card-bg, #1b1b1f)',
            border: '1px solid rgba(255,255,255,0.12)'
          }
        },
          h('h3', { style: { margin: '0 0 14px', fontSize: 17, textAlign: 'center' } }, title),
          h('div', { style: { display: 'flex', gap: 8, marginBottom: 14 } },
            btn('easy', '😎 Легко', 'easy'),
            btn('ok', '😐 Норм', 'ok'),
            btn('hard', '🥵 Тяжело', 'hard')
          ),
          h('label', {
            style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, opacity: 0.85, cursor: 'pointer', marginBottom: 14 }
          },
            h('input', {
              type: 'checkbox',
              checked: rpePain,
              onChange: function (e) { setRpePain(!!e.target.checked); }
            }),
            'Была боль в пальцах / суставах'
          ),
          h('button', {
            type: 'button',
            className: 'fingers-fs-ghost',
            style: { width: '100%', fontSize: 13, opacity: 0.7 },
            onClick: skipRpe
          }, 'Пропустить')
        )
      );
    })() : null;

    // Smart pause/resume через cycleRef.
    const togglePauseResume = useCallback(function () {
      const cycle = cycleRef && cycleRef.current;
      if (!cycle) return;
      try {
        if (cycle.state === (Fingers.STATES && Fingers.STATES.PAUSED)) {
          cycle.resume && cycle.resume();
        } else {
          cycle.pause && cycle.pause();
        }
      } catch (e) { console.warn('[Fingers.useExerciseShell] pause/resume failed:', e); }
    }, [cycleRef]);

    // 2-step abort flow: "Прервать?" → "Записать частично?".
    const requestAbort = useCallback(function () {
      const cycle = cycleRef && cycleRef.current;
      const finalize = function () {
        try { if (cycle) cycle.abort(); } catch (_) {}
        if (onAbort) onAbort();
      };
      keepSnapshotOnAbortRef.current = true;
      if (!HEYS.ConfirmModal?.show) { finalize(); return; }
      const doneExercises = exIdx;
      const doneSets = (cycle && cycle.setIdx) || 0;
      const doneReps = (cycle && cycle.repIdx) || 0;
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
                console.warn('[Fingers.useExerciseShell] partial save failed:', e);
              }
              try { Fingers.persistence?.clear?.(); } catch (_) {}
              finalize();
            },
            onCancel: function () {
              keepSnapshotOnAbortRef.current = true;
              if (HEYS.Toast?.info) HEYS.Toast.info('Сессия прервана — можно продолжить позже');
              finalize();
            }
          });
        }
      });
    }, [cycleRef, exIdx, onAbort, dateKey, trainingIndex, programId, exercises]);

    return {
      handleCycleComplete,
      handleStateChangeRpe,
      togglePauseResume,
      requestAbort,
      rpeOverlay
    };
  }

  // ─── HangRunner (Step 4) — hang-cycle runner на shared shell ─────────────────
  function HangRunner(props) {
    const { exercise, exIdx, totalExercises, onAbort } = props;
    const cycleRef = React.useRef(null);
    const shell = useExerciseShell(Object.assign({}, props, { cycleRef: cycleRef }));

    const cycle = Fingers.useCountdownCycle({
      hangSec: Number(exercise.hangSec) || 7,
      restSec: Number(exercise.restSec) || 3,
      repsPerSet: Number(exercise.repsPerSet) || 6,
      setsCount: Number(exercise.setsCount) || 3,
      restBetweenSetsSec: Number(exercise.restBetweenSetsSec) || 180,
      onComplete: shell.handleCycleComplete,
      onStateChange: shell.handleStateChangeRpe
    });
    cycleRef.current = cycle;

    const grip = Fingers.GRIPS_BY_ID && Fingers.GRIPS_BY_ID[exercise.gripId];
    const gripLabel = grip ? grip.label : exercise.gripId;
    const edgeLabel = exercise.edgeSizeMm ? exercise.edgeSizeMm + 'мм' : '—';
    const addedWeight = Number(exercise.addedWeightKg) || 0;

    if (Fingers.CountdownDisplay) {
      return h(React.Fragment, null,
        h(Fingers.CountdownDisplay, {
          state: cycle.state,
          secondsLeft: cycle.secondsLeft,
          setIdx: cycle.setIdx,
          totalSets: Number(exercise.setsCount) || 3,
          repIdx: cycle.repIdx,
          totalReps: Number(exercise.repsPerSet) || 6,
          gripLabel: gripLabel,
          gripId: exercise.gripId,
          equipmentTier: exercise.equipmentTier,
          edgeLabel: edgeLabel,
          addedWeightKg: addedWeight,
          exerciseProgress: 'Упр ' + (exIdx + 1) + '/' + totalExercises,
          onPause: shell.togglePauseResume,
          onResume: cycle.resume,
          onAbort: shell.requestAbort,
          onSkip: cycle.skipPhase
        }),
        shell.rpeOverlay
      );
    }

    return h(React.Fragment, null,
      h('div', { style: { padding: 32, textAlign: 'center' } },
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
      ),
      shell.rpeOverlay
    );
  }

  // ─── RepsRunner (Step 4) — reps-cycle runner на ТОМ ЖЕ shared shell ──────────
  // Reps НАСЛЕДУЕТ S8 (onSetFeedback/pain через shell.handleStateChangeRpe и
  // shell.handleCycleComplete) — это и есть весь смысл общего каркаса.
  function RepsRunner(props) {
    const { exercise, exIdx, totalExercises, onAbort } = props;
    const cycleRef = React.useRef(null);
    const shell = useExerciseShell(Object.assign({}, props, { cycleRef: cycleRef }));

    const cycle = Fingers.useRepsCycle({
      setsCount: Number(exercise.setsCount) || 3,
      restBetweenSetsSec: Number(exercise.restBetweenSetsSec) || 60,
      onComplete: shell.handleCycleComplete,
      onStateChange: shell.handleStateChangeRpe
    });
    cycleRef.current = cycle;

    const grip = Fingers.GRIPS_BY_ID && Fingers.GRIPS_BY_ID[exercise.gripId];
    const gripLabel = grip ? grip.label : exercise.gripId;
    const edgeLabel = exercise.edgeSizeMm ? exercise.edgeSizeMm + 'мм' : null;
    const addedWeight = Number(exercise.addedWeightKg) || 0;
    // reps target из dose (block_catalog v2) или legacy repsPerSet.
    const reps = (exercise.dose && exercise.dose.reps !== undefined)
      ? exercise.dose.reps
      : (exercise.repsPerSet || null);

    if (Fingers.RepsCounterDisplay) {
      return h(React.Fragment, null,
        h(Fingers.RepsCounterDisplay, {
          state: cycle.state,
          secondsLeft: cycle.secondsLeft,
          setIdx: cycle.setIdx,
          totalSets: Number(exercise.setsCount) || 3,
          reps: reps,
          addedWeightKg: addedWeight ? addedWeight : undefined,
          gripLabel: gripLabel,
          gripId: exercise.gripId,
          equipmentTier: exercise.equipmentTier,
          edgeLabel: edgeLabel,
          exerciseProgress: 'Упр ' + (exIdx + 1) + '/' + totalExercises,
          onSetDone: cycle.completeSet,
          onPause: shell.togglePauseResume,
          onResume: cycle.resume,
          onAbort: shell.requestAbort,
          onSkip: cycle.skipPhase
        }),
        shell.rpeOverlay
      );
    }

    return h(React.Fragment, null,
      h('div', { style: { padding: 32, textAlign: 'center' } },
        h('div', { style: { fontSize: 18, marginBottom: 16 } }, gripLabel || 'Reps exercise'),
        h('div', { style: { fontSize: 14, opacity: 0.6, marginBottom: 24 } },
          'Сет ' + (cycle.setIdx + 1) + '/' + (exercise.setsCount || 3)),
        h('button', {
          className: 'fingers-fs-btn',
          onClick: cycle.completeSet
        }, '✓ Подход выполнен')
      ),
      shell.rpeOverlay
    );
  }

  // ─── ExerciseRunner (Step 4 dispatcher) ──────────────────────────────────────
  // Рендерит HangRunner или RepsRunner по exercise.doseShape. ОБА runner'а
  // безусловно вызывают свой хук (Rules of Hooks: hook count ≠ зависит от
  // condition в SAME component; здесь component'ы РАЗНЫЕ). Только ОДИН runner
  // монтируется → activeTimerLock/wakeLock не конфликтуют.
  // Default (без doseShape, legacy mixEngine output) → HangRunner = поведение
  // бит-в-бит как до Step 4.
  function ExerciseRunner(props) {
    const isReps = props && props.exercise && props.exercise.doseShape === 'reps';
    return isReps
      ? h(RepsRunner, props)
      : h(HangRunner, props);
  }

  function LiveSession({ exercises, dateKey, trainingIndex, programId, initialSnapshot, onAllDone, onAbort, onSetFeedback }) {
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
      onAbort: onAbort,
      onSetFeedback: onSetFeedback
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
    const wantFull  = activeTypes.indexOf('full') >= 0;
    const wantBlock = activeTypes.indexOf('block') >= 0;
    // Отдельные модели на тип: fingerboardId — доска (kind=fingerboard),
    // blockBoardId — блок (kind=block). Раньше один fingerboardId перетирал оба.
    const fullBoards  = allBoards.filter(function (b) { return (b.kind || 'fingerboard') === 'fingerboard'; });
    const blockBoards = allBoards.filter(function (b) { return b.kind === 'block'; });
    const _getB = function (id) { return id && Fingers.getBoardById ? Fingers.getBoardById(id) : null; };
    const currentFullBoard  = _getB(profile.fingerboardId);
    const currentBlockBoard = _getB(profile.blockBoardId);
    // openPicker: null | 'full' | 'block' — какой дропдаун раскрыт (взаимоисключающе).
    const [openPicker, setOpenPicker] = useState(null);

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
      // Дефолтная модель при первом включении типа (если ещё не выбрана) —
      // независимо для доски и блока, без перетирания друг друга.
      if (type === 'block' && !has && !profile.blockBoardId) patch.blockBoardId = 'xclimb_terminator';
      if (type === 'full' && !has && !profile.fingerboardId) patch.fingerboardId = 'beastmaker_1000';
      writeProfile(patch);
    }
    function pickBoard(id, field) {
      const p = {};
      p[field || 'fingerboardId'] = id;
      writeProfile(p);
      setOpenPicker(null);
    }

    const tabs = [
      { id: 'full',  icon: '🪜', label: 'Полный board' },
      { id: 'block', icon: '💪', label: 'Hang block' },
      { id: 'door',  icon: '🚪', label: 'Door frame' },
      { id: 'none',  icon: '🤚', label: 'No-Hangs' }
    ];

    // Пикер модели для одного типа оборудования. field — куда писать
    // (fingerboardId | blockBoardId). pickerKey — для взаимоисключающего раскрытия.
    const mkPicker = function (field, list, current, pickerKey, placeholder) {
      const isOpen = openPicker === pickerKey;
      return h('div', { className: 'fingers-fs-equipment-board', style: { flex: '1 1 0', minWidth: 0 } },
        h('button', {
          type: 'button',
          className: 'fingers-fs-equipment-board__btn',
          onClick: function () { setOpenPicker(isOpen ? null : pickerKey); },
          'aria-expanded': isOpen ? 'true' : 'false'
        },
          h('span', { className: 'fingers-fs-equipment-board__label' }, (current && current.label) || placeholder),
          h('span', { className: 'fingers-fs-equipment-board__chevron', 'aria-hidden': 'true' }, isOpen ? '▲' : '▼')
        ),
        isOpen ? h('div', { className: 'fingers-fs-equipment-board__menu' },
          list.map(function (b) {
            const active = current && current.id === b.id;
            return h('button', {
              key: b.id,
              type: 'button',
              className: 'fingers-fs-equipment-board__option' + (active ? ' is-active' : ''),
              onClick: function () { pickBoard(b.id, field); }
            },
              h('span', { className: 'fingers-fs-equipment-board__option-label' }, b.label),
              b.manufacturer ? h('span', { className: 'fingers-fs-equipment-board__option-sub' }, b.manufacturer) : null,
              active ? h('span', { className: 'fingers-fs-equipment-board__option-check' }, '✓') : null
            );
          })
        ) : null
      );
    };

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
      // Пикеры модели — на каждый активный тип (доска | блок) в строку, без
      // перекрытия. Если выбраны оба — два пикера рядом, каждый со своим выбором.
      (wantFull || wantBlock) ? h('div', {
        className: 'fingers-fs-equipment-boards-row',
        style: { display: 'flex', gap: 8, alignItems: 'flex-start' }
      },
        (wantFull && fullBoards.length)
          ? mkPicker('fingerboardId', fullBoards, currentFullBoard, 'full', 'Выбрать доску') : null,
        (wantBlock && blockBoards.length)
          ? mkPicker('blockBoardId', blockBoards, currentBlockBoard, 'block', 'Выбрать блок') : null
      ) : null
    );
  }
  Fingers.EquipmentBar = FingersEquipmentBar;

  // Единая ЦЕЛЬ тренировок — отдельный компонент, чтобы можно было разместить её
  // ниже табов (а оборудование — между табами и целью). Пишется в profile.goal,
  // рулит и рекомендованным протоколом, и микс-сборкой.
  function FingersGoalSelector(props) {
    const onChange = (props && props.onChange) || function () {};
    const profile = getProfile();
    const GOAL_LIST = (Fingers.mixEngine && Array.isArray(Fingers.mixEngine.GOALS) && Fingers.mixEngine.GOALS.length)
      ? Fingers.mixEngine.GOALS
      : [{ id: 'strength', label: 'Сила' }, { id: 'endurance', label: 'Выносливость' },
         { id: 'recovery', label: 'Восстановление' }, { id: 'maintenance', label: 'Поддержка' }];
    const GOAL_EMOJI = { strength: '🔥', endurance: '🔁', recovery: '🌿', maintenance: '🧱' };
    const GOAL_TO_INTENSITY_GS = { strength: 'max', endurance: 'moderate', recovery: 'recovery', maintenance: 'moderate' };
    const currentGoal = profile.goal || 'strength';

    // Считаем сколько программ подойдёт под каждую цель — с теми же фильтрами,
    // что ProgramsTab («Под цель»): age + текущее оборудование, потом intensity.
    // Это даёт честный preview перед сменой цели — пользователь видит «Сила 2,
    // Восстановление 4» ещё до клика.
    const goalCounts = (function () {
      const counts = { strength: 0, endurance: 0, recovery: 0, maintenance: 0 };
      try {
        const programs = Array.isArray(Fingers.PROGRAMS) ? Fingers.PROGRAMS : [];
        const ageNum = Number(profile.age);
        const ageFiltered = (Fingers.ageGate && Fingers.ageGate.filterPrograms)
          ? Fingers.ageGate.filterPrograms(programs, ageNum)
          : programs;
        const userTiers = Array.isArray(profile.equipmentTypes) && profile.equipmentTypes.length
          ? profile.equipmentTypes
          : (profile.noEquipment ? ['none']
            : profile.blockMode ? ['block']
            : profile.edgeLimit === 25 ? ['door']
            : ['full']);
        const eqFiltered = Fingers.filterProgramsByEquipment
          ? Fingers.filterProgramsByEquipment(ageFiltered, { equipmentTypes: userTiers })
          : ageFiltered;
        eqFiltered.forEach(function (p) {
          const pi = (p && p.intensity) || 'moderate';
          GOAL_LIST.forEach(function (g) {
            if ((GOAL_TO_INTENSITY_GS[g.id] || 'moderate') === pi) counts[g.id] = (counts[g.id] || 0) + 1;
          });
        });
      } catch (_) { /* tolerant */ }
      return counts;
    })();

    function writeGoal(goalId) {
      try {
        const u = HEYS.utils;
        if (!u || !u.lsGet || !u.lsSet) return;
        const p = u.lsGet('heys_profile', {}) || {};
        const fp = Object.assign({}, p.fingerboardProfile || {}, { goal: goalId });
        u.lsSet('heys_profile', Object.assign({}, p, { fingerboardProfile: fp }));
        onChange();
      } catch (e) {
        console.warn('[FingersGoalSelector] write failed:', e);
      }
    }
    return h('div', { className: 'fingers-fs-goalsel' },
      h('div', { className: 'fingers-fs-goalsel__label' }, 'Цель тренировки'),
      h('div', { className: 'fingers-fs-goalsel__grid', role: 'tablist', 'aria-label': 'Цель тренировки' },
        GOAL_LIST.map(function (g) {
          const active = currentGoal === g.id;
          const cnt = goalCounts[g.id] || 0;
          return h('button', {
            key: g.id,
            type: 'button',
            role: 'tab',
            'aria-selected': active,
            className: 'fingers-fs-goalsel__btn' + (active ? ' is-active' : '') + (cnt === 0 ? ' is-empty' : ''),
            'data-goal': g.id,
            title: cnt + ' протоколов под текущее оборудование и возраст',
            onClick: function () { if (currentGoal !== g.id) writeGoal(g.id); }
          },
            h('span', { className: 'fingers-fs-goalsel__emoji', 'aria-hidden': 'true' }, GOAL_EMOJI[g.id] || '🎯'),
            h('span', { className: 'fingers-fs-goalsel__text' }, g.label),
            h('span', { className: 'fingers-fs-goalsel__count', 'aria-label': cnt + ' протоколов' }, cnt)
          );
        })
      )
    );
  }
  Fingers.GoalSelector = FingersGoalSelector;

  // Компактный readiness-бейдж — однострочный вариант баннера готовности.
  // Используется в шапке Fingers под целью тренировки, чтобы юзер видел статус
  // готовности независимо от выбранной вкладки.
  function FingersReadinessChip() {
    const cool = (Fingers.cooldownCheck && typeof Fingers.cooldownCheck === 'function')
      ? (function () { try { return Fingers.cooldownCheck(); } catch (_) { return null; } })()
      : null;
    if (!cool) return null;
    const READINESS_MAP = {
      max:      { icon: '🔥', title: 'Готов к максимуму' },
      moderate: { icon: '⚡', title: 'Умеренная нагрузка' },
      recovery: { icon: '🌿', title: 'Только восстановление' },
      rest:     { icon: '💤', title: 'День отдыха' }
    };
    const conf = READINESS_MAP[cool.recommendation] || READINESS_MAP.max;
    let sub;
    if (cool.hoursSinceLast == null) {
      sub = 'История пуста';
    } else {
      const h_ago = Math.max(0, cool.hoursSinceLast);
      sub = h_ago < 24 ? Math.round(h_ago) + 'ч назад'
        : Math.round(h_ago / 24) + ' дн. назад';
    }
    return h('div', {
      className: 'fingers-fs-readiness-banner fingers-fs-readiness-banner--compact',
      'data-readiness': cool.recommendation,
      role: 'status',
      'aria-live': 'polite'
    },
      h('span', { className: 'fingers-fs-readiness-banner__icon', 'aria-hidden': 'true' }, conf.icon),
      h('span', { className: 'fingers-fs-readiness-banner__title' }, conf.title),
      h('span', { className: 'fingers-fs-readiness-banner__sub' }, sub)
    );
  }
  Fingers.ReadinessChip = FingersReadinessChip;

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

          // ─── Training cycle (B7) ───
          h('section', { className: 'fingers-settings__section' },
            h('div', { className: 'fingers-settings__section-title' }, 'Тренировочный цикл'),
            (function () {
              const cur = Fingers.mesocycle && Fingers.mesocycle.current
                ? Fingers.mesocycle.current(null, null) : null;
              return h('p', { className: 'fingers-settings__profile-hint', style: { marginTop: 0 } },
                cur
                  ? (cur.complete
                      ? 'Цикл завершён — пора пере-тест MVC и начать новый блок.'
                      : 'Идёт неделя ' + cur.week + '/' + cur.weeksTotal + ' · ' + cur.label
                        + '. Фаза подстраивает рекомендуемую интенсивность в «Сегодня».')
                  : '4-нед блок: накопление → интенсификация → разгрузка → пере-тест. '
                    + 'Фаза автоматически клампит интенсивность дня.');
            })(),
            h('button', {
              type: 'button',
              className: 'fingers-settings__reset-btn',
              onClick: function () {
                if (Fingers.mesocycle && Fingers.mesocycle.start && Fingers.mesocycle.start(4)) {
                  if (HEYS.Toast && HEYS.Toast.success) HEYS.Toast.success('Новый 4-недельный цикл начат');
                  if (typeof onClose === 'function') onClose();
                }
              }
            },
              h('span', { 'aria-hidden': 'true' }, '🔄'),
              ' Начать новый цикл (4 нед)'
            )
          ),

          // ─── Data export (B12) ───
          h('section', { className: 'fingers-settings__section' },
            h('div', { className: 'fingers-settings__section-title' }, 'Данные'),
            h('button', {
              type: 'button',
              className: 'fingers-settings__reset-btn',
              onClick: function () {
                const ok = Fingers.exportFingersCsv && Fingers.exportFingersCsv();
                if (HEYS.Toast) {
                  if (ok && HEYS.Toast.success) HEYS.Toast.success('Экспорт CSV скачан');
                  else if (!ok && HEYS.Toast.info) HEYS.Toast.info('Нет данных для экспорта');
                }
              }
            },
              h('span', { 'aria-hidden': 'true' }, '⬇'),
              ' Экспорт тренировок (CSV)'
            ),
            h('p', { className: 'fingers-settings__profile-hint' },
              'Скачать историю за год: дата, программа, хват, зацеп, вес, подходы, RPE, боль. '
              + 'Для своей аналитики в Google Sheets / Excel.')
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
    const [tab, setTab] = useState('today');
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
    // B9: разминка пройдена в этом открытии сессии? Старт по «Всё ОК» без неё →
    // _recordWarmupSkip (штраф readiness в следующий раз).
    const warmedUpRef = React.useRef(false);
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
    // userBoard для конструктора — модель под текущую загруженную программу:
    // block-протокол → blockBoardId, иначе fingerboardId (грани берутся из неё).
    const userBoard = _isBlockProgram(pendingProgram)
      ? (profile.blockBoardId || null)
      : (profile.fingerboardId || null);
    // Age fail-closed: null если не указан в профиле — конструктор покажет
    // guard вместо опасных хватов (ранее дефолтилось 18 → fail-open).
    const userAge = Number.isFinite(Number(profile.age)) ? Number(profile.age) : null;
    const recommendedId = getRecommendedProgramId();

    // Pick program → load exercises into constructor → switch to constructor tab
    const handlePickProgram = useCallback(function (program) {
      // Generated mix не в catalog — buildLogFromProgram не найдёт его id.
      // Используем exercises напрямую без mapping'а по board edges.
      let built;
      // Активные tier'ы пользователя — для резолва equipmentTier на упражнениях
      // (нужно для tier-aware фото в CountdownDisplay/GripIcon: на блоке —
      // фото с блоком, на двери — с дверью).
      const profile = getProfile();
      const userTiersForExpand = Array.isArray(profile.equipmentTypes) && profile.equipmentTypes.length
        ? profile.equipmentTypes
        : (profile.noEquipment ? ['none']
          : profile.blockMode ? ['block']
          : profile.edgeLimit === 25 ? ['door']
          : ['full']);
      if (program && program.__generated) {
        built = Array.isArray(program.exercises) ? program.exercises.slice() : [];
      } else {
        built = Fingers.buildLogFromProgram
          ? Fingers.buildLogFromProgram(program.id, _resolveBoardForProgram(program), userTiersForExpand)
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
      // B1/B19: сборка контракта вынесена в чистый _buildFingersLog (unit-tested).
      // Additive — без o.feedback exercises остаётся прежним.
      const fingersLog = _buildFingersLog(exercises, {
        programId: programId,
        feedback: o.feedback,
        viaTimer: o.viaTimer
      });
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
        const todayKey = (typeof dateKey === 'string' ? dateKey : new Date().toISOString().slice(0, 10));
        if (Fingers.readiness && typeof Fingers.readiness.assess === 'function') {
          const rIn = _buildReadinessInputs(todayKey);
          const r = Fingers.readiness.assess(rIn.today, rIn.history);
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
      // recovery-only нота — но не дублируем cooldown: если он уже предупредил
      // про «вчера max <48ч», readiness-штраф за ту же причину молчит.
      const cooldownAlreadyWarns = cooldownInfo.lastWasMax
        && cooldownInfo.hoursSinceLast != null && cooldownInfo.hoursSinceLast < 48;
      if (readinessBucket === 'recovery-only' && !cooldownAlreadyWarns) {
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
              if (!warmedUpRef.current) _recordWarmupSkip(); // B9
              setLiveActive(true);
            } },
        ];
      } else {
        preflightOpts.confirmText = 'Всё ОК, начинаем';
        preflightOpts.cancelText = 'Отмена';
        preflightOpts.onConfirm = function () {
          try { Fingers.voice?.say?.('cue.start_session'); } catch (_) {}
          if (!warmedUpRef.current) _recordWarmupSkip(); // B9
          setLiveActive(true);
        };
      }

      HEYS.ConfirmModal.show(preflightOpts);
    }, [exercises, pendingProgram, dateKey]);

    // После завершения/прерывания разминки — снова открыть pre-flight.
    // Юзер дотыкает оставшиеся чек-пункты (нет боли, не на холодные руки) и стартует.
    const handleWarmupDone = useCallback(function () {
      setWarmupActive(false);
      warmedUpRef.current = true; // B9: разминка пройдена → старт не штрафуется.
      // Defer re-open чтобы предыдущий ConfirmModal успел размонтироваться.
      setTimeout(function () { handleStartLive(); }, 50);
    }, [handleStartLive]);

    const handleWarmupCancel = useCallback(function () {
      setWarmupActive(false);
    }, []);

    // B1: накопитель per-set feedback за live-сессию. { [exIdx]: [{rpe,pain}] }.
    // ExerciseRunner шлёт сюда через onSetFeedback; handleLiveAllDone отдаёт в
    // handleComplete и сбрасывает. Ref (не state) — записи во время сессии не
    // должны триггерить ререндер живого таймера.
    const liveFeedbackRef = React.useRef({});
    const recordSetFeedback = useCallback(function (exIdx, setIdx, fb) {
      if (exIdx == null || setIdx == null) return;
      const arr = liveFeedbackRef.current[exIdx] || [];
      arr[setIdx] = { rpe: (fb && fb.rpe) || null, pain: !!(fb && fb.pain) };
      liveFeedbackRef.current[exIdx] = arr;
    }, []);

    const handleLiveAllDone = useCallback(function () {
      setLiveActive(false);
      setInitialSnapshot(null);
      try { Fingers.voice?.say?.('cue.session_done'); } catch (_) {}
      const feedback = liveFeedbackRef.current;
      liveFeedbackRef.current = {};
      handleComplete({ viaTimer: true, feedback: feedback });
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
          onAbort: handleLiveAbort,
          onSetFeedback: recordSetFeedback
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
      today: svgIcon([
        { tag: 'path', attrs: { d: 'M3.5 10.5L11 4l7.5 6.5' } },
        { tag: 'path', attrs: { d: 'M5.5 9.5v8.5h11V9.5' } },
        { tag: 'path', attrs: { d: 'M9 18.5v-4h4v4' } }
      ]),
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
      { id: 'today',       label: 'Сегодня',     icon: ICONS.today },
      { id: 'programs',    label: 'Протоколы',   icon: ICONS.programs },
      { id: 'constructor', label: 'Своя',        icon: ICONS.constructor },
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
      // Header
      h('div', { className: 'fingers-fs__header fingers-fs__header--premium' },
        h('h1', { className: 'fingers-fs__title' },
          h('span', { className: 'fingers-fs__title-text' }, 'Сила хвата')
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
          }, h('span', { 'aria-hidden': 'true' }, '📚')),
          // Прозрачность: копирует диагностику всех расчётов (готовность,
          // рекомендация, бакет, мезоцикл) в буфер обмена.
          h('button', {
            type: 'button',
            className: 'fingers-fs__icon-btn',
            onClick: function () {
              try {
                const txt = _buildFingersDiagnostic();
                const done = function () {
                  if (HEYS.Toast && HEYS.Toast.success) HEYS.Toast.success('Диагностика расчётов скопирована');
                };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(txt).then(done).catch(function () {
                    console.log('[Fingers diagnostic]\n' + txt);
                    if (HEYS.Toast && HEYS.Toast.info) HEYS.Toast.info('Скопировано в консоль (clipboard недоступен)');
                  });
                } else {
                  console.log('[Fingers diagnostic]\n' + txt);
                  if (HEYS.Toast && HEYS.Toast.info) HEYS.Toast.info('Выведено в консоль (clipboard недоступен)');
                }
              } catch (e) { console.warn('[Fingers] diagnostic copy failed:', e); }
            },
            'aria-label': 'Скопировать диагностику расчётов',
            title: 'Диагностика расчётов'
          }, h('span', { 'aria-hidden': 'true' }, '🧮')),
          // Розовый × — выход из Fingers (закрыть fullscreen-режим).
          // В одну строку с остальными иконками шапки.
          onClose ? h('button', {
            type: 'button',
            className: 'fingers-fs__icon-btn fingers-fs__icon-btn--close',
            onClick: function () { try { onClose(); } catch (_) {} },
            'aria-label': 'Закрыть режим тренировки',
            title: 'Закрыть'
          },
            h('svg', { width: 18, height: 18, viewBox: '0 0 20 20', fill: 'none',
              stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', 'aria-hidden': 'true' },
              h('path', { d: 'M5 5l10 10M15 5L5 15' })
            )
          ) : null
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

      // Equipment bar — под табами, всегда видим для смены оборудования.
      Fingers.EquipmentBar ? h(Fingers.EquipmentBar, {
        key: 'eqbar-' + equipmentTick,
        onChange: function () { setEquipmentTick(function (n) { return n + 1; }); }
      }) : null,

      // Goal selector — общий контекст тренировки, не привязан к конкретной вкладке.
      // Готовность встроена премиально в Today-карточку, поэтому здесь только цель.
      Fingers.GoalSelector ? h(Fingers.GoalSelector, {
        key: 'goalsel-' + equipmentTick,
        onChange: function () { setEquipmentTick(function (n) { return n + 1; }); }
      }) : null,

      // Tab content
      h('div', { className: 'fingers-fs-tab-content' },
        tab === 'today' && h(TodayTab, {
          onPickProgram: handlePickProgram,
          onSwitchToPrograms: function () { setTab('programs'); },
          onSwitchToConstructor: function () { setTab('constructor'); },
          onRequestOnboarding: onRequestOnboarding
        }),
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
            programIntensity: pendingProgram?.intensity,
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
  // Exposed for tests (B0 Today Coach): safety-clamp рекомендации к бакету.
  Fingers._recommendForBucket = _recommendForBucket;
  Fingers._buildTodayData = _buildTodayData;
  // Exposed for tests (B1): additive merge per-set feedback в fingersLog.
  Fingers._mergeSetFeedback = _mergeSetFeedback;
  // Exposed for tests (B19): чистая сборка контракта fingersLog.
  Fingers._buildFingersLog = _buildFingersLog;
  // Exposed for tests (Step 4 prep / ревью #9 ExerciseRunner-characterization):
  // pin RPE/onSetFeedback/snapshot/abort до того, как Step 4 добавит doseShape branch.
  Fingers._ExerciseRunner = ExerciseRunner;

  Fingers.startSession = function startSession(opts) {
    // Stub for future direct session launch from outside fullscreen.
    // For now SessionUI mounted inside fullscreen handles everything.
    console.info('[Fingers.startSession]', opts);
  };
})(typeof window !== 'undefined' ? window : globalThis);
