// heys_hunger_energy_status_ui_v1.js - Hunger & Energy Status FAB modal.
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  const h = React && React.createElement;
  const STORAGE_KEY = 'heys_hunger_energy_status_events_v1';
  const AUTO_OPEN_PROFILE_FIELD = 'hungerEnergyStatusAutoOpen';
  const EVENT_SCHEMA_VERSION = 1;
  const MAX_EVENTS = 120;
  const TREND_WINDOW_MIN = 360;
  const HUNGER_TIMELINE_DAY_START_HOUR = 6;
  const DEFAULT_DRAFT = { hungerLevel: 5, hungerVisual: 5, hungerTrend: 'unknown' };

  let modalRoot = null;
  let modalRootInstance = null;
  let setModalState = null;
  let modalCleanup = null;
  let autoOpenTimer = null;
  let modalOpenSeq = 0;
  const autoOpenShownClients = new Set();

  const STATUS_COPY = {
    fed: 'Еда ещё обрабатывается',
    postMealDecline: 'Переход между приёмами',
    stableBetweenMeals: 'Стабильный промежуток',
    deficitPressure: 'Еда сейчас может быть полезнее ожидания',
    recoveryNeed: 'Восстановлению полезна еда',
    nutritionFloorRisk: 'Питания слишком мало для задержки',
    reboundRisk: 'Риск отката/срыва выше',
    medicalCaution: 'Нужна осторожная food-first логика'
  };

  const ACTION_COPY = {
    observe: 'Понаблюдать и вернуться к сигналу позже',
    hydratePause: 'Выпить воды или несладкого чая и перепроверить',
    coffeePause: 'Кофе допустим как короткая пауза, если он привычный',
    delayWithCheck: 'Сделать короткую паузу с перепроверкой',
    planNextMeal: 'Запланировать ближайший спокойный приём пищи',
    riskBrakeMeal: 'Съесть небольшой белково-клетчаточный якорь',
    eatSnack: 'Съесть контролируемый перекус',
    eatMeal: 'Съесть нормальный приём пищи',
    proteinFiberFirst: 'Начать с белка и клетчатки',
    doNotDelay: 'Не откладывать еду сейчас',
    fastCarbSafety: 'Быстрые углеводы и перепроверка'
  };

  const HUNGER_STATUS_COPY = {
    1: 'не голоден',
    2: 'почти сыт',
    3: 'лёгкий голод',
    4: 'умеренный голод',
    5: 'заметный голод',
    6: 'явный голод',
    7: 'сильный голод',
    8: 'очень голоден',
    9: 'крайне голоден',
    10: 'невыносимо голоден'
  };

  const DRIVER_COPY = {
    safety_symptoms: 'телесные safety-сигналы',
    glucose_context: 'глюкозный/медицинский контекст',
    medical_boundary: 'медицинская граница',
    loss_of_control_risk: 'риск потери контроля',
    low_energy_availability: 'риск низкой доступности энергии',
    recovery_need: 'нужда восстановления',
    hunger_rising: 'сигнал усилился',
    hunger_stable_or_falling: 'голод стабилен или снижается',
    low_control: 'контроль выбора низкий',
    moderate_control: 'контроль выбора средний',
    strong_craving: 'сильная тяга',
    high_stress: 'стресс высокий',
    mood_pressure: 'настроение проседает',
    poor_sleep: 'сон слабый',
    very_poor_sleep: 'сон очень слабый',
    long_gap: 'долгий промежуток без еды',
    no_intake_today: 'сегодня еда не найдена',
    skipped_meal: 'приём пищи был пропущен',
    known_rebound_pattern: 'похожий паттерн уже повторялся',
    failed_delay_history: 'паузы уже срывались',
    repeated_checkpoints: 'повторная перепроверка',
    recovery_or_protein_debt: 'восстановление или белок в долге',
    recent_meal_or_satiety_lag: 'еда была недавно',
    good_control_stable_focus: 'контроль и фокус стабильны',
    recent_balanced_meal: 'сбалансированная еда была недавно',
    planned_meal_soon: 'приём пищи скоро',
    rebound_risk: 'контекст похож на откат',
    high_risk_budget: 'риск ожидания высокий',
    medium_risk_budget: 'риск ожидания средний',
    stop_risk_budget: 'риск требует остановки задержки',
    hunger_medium_floor: 'голод заметный',
    hunger_high_floor: 'голод высокий',
    high_hunger_recent_meal_floor: 'голод высокий, но еда была недавно',
    fed_or_recent_meal: 'еда ещё может давать насыщение',
    deficit_pressure: 'дефицит давит сильнее',
    protein_debt: 'белка может не хватать',
    very_low_intake_day: 'сегодня еды очень мало',
    stress_or_mood_pressure: 'стресс или настроение давят',
    high_risk_time_pattern: 'это время часто рискованное'
  };

  const DEBUG_FACTOR_COPY = {
    hungerLevel: 'уровень голода',
    hungerRising: 'голод растёт',
    longGap: 'долгий промежуток без еды',
    noIntakeToday: 'сегодня еда не найдена',
    deficitPressure: 'дефицит/длинный промежуток'
  };

  const DELAY_ACTIONS = ['observe', 'hydratePause', 'coffeePause', 'delayWithCheck', 'planNextMeal'];
  const FOOD_ACTIONS = ['riskBrakeMeal', 'eatSnack', 'eatMeal', 'proteinFiberFirst', 'doNotDelay'];
  const BAD_OUTCOMES = ['hunger_grew', 'lost_control', 'lostControl', 'overeating', 'not_enough'];
  const GOOD_WAIT_OUTCOMES = ['hunger_passed'];
  const GOOD_FOOD_OUTCOMES = ['ate_calmly', 'hunger_lower'];

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (_) { return String(Date.now()); }
  }

  function todayKey() {
    return nowIso().slice(0, 10);
  }

  function addDays(dateStr, days) {
    const d = new Date(String(dateStr || todayKey()) + 'T12:00:00');
    if (!Number.isFinite(d.getTime())) return todayKey();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function readEvents() {
    const U = HEYS.utils || {};
    try {
      const rows = U.lsGet ? U.lsGet(STORAGE_KEY, []) : JSON.parse(global.localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch (_) {
      return [];
    }
  }

  function currentClientId() {
    return HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId || '';
  }

  function readProfile() {
    const U = HEYS.utils || {};
    try {
      return (U.lsGet && U.lsGet('heys_profile', {})) || {};
    } catch (_) {
      return {};
    }
  }

  function readAutoOpenEnabled() {
    const value = readProfile()[AUTO_OPEN_PROFILE_FIELD];
    return value === true || value === 'true' || value === '1' || value === 1;
  }

  function writeAutoOpenEnabled(enabled) {
    const U = HEYS.utils || {};
    const next = !!enabled;
    const profile = readProfile();
    const updatedProfile = {
      ...profile,
      [AUTO_OPEN_PROFILE_FIELD]: next
    };
    try {
      if (U.lsSet) U.lsSet('heys_profile', updatedProfile);
      try {
        global.dispatchEvent(new CustomEvent('heys:profile-updated', {
          detail: {
            field: AUTO_OPEN_PROFILE_FIELD,
            fields: [AUTO_OPEN_PROFILE_FIELD],
            source: 'hunger-energy-status-modal'
          }
        }));
      } catch (_) {}
    } catch (_) {}
    return next;
  }

  function hasAppShellMounted() {
    try {
      return !!global.document?.querySelector?.('.tabs, .tab-switch, .fab-group, [aria-label="Открыть оценку голода"]');
    } catch (_) {
      return false;
    }
  }

  function hasActiveMorningCheckin() {
    try {
      const status = HEYS.MorningCheckinDebug?.getStatus?.();
      return status && status.sessionDone !== true && ['open', 'in_progress', 'failed'].includes(status.state);
    } catch (_) {
      return false;
    }
  }

  function scheduleAutoOpen(reason, attempt = 0) {
    if (autoOpenTimer) clearTimeout(autoOpenTimer);
    autoOpenTimer = setTimeout(() => {
      const clientId = currentClientId();
      if (!clientId || autoOpenShownClients.has(clientId)) return;
      if (!HEYS.utils?.lsGet && attempt < 24) {
        scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (!readAutoOpenEnabled()) return;
      if (!hasAppShellMounted() && attempt < 24) {
        scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (hasActiveMorningCheckin()) {
        if (attempt < 24) scheduleAutoOpen(reason, attempt + 1);
        return;
      }
      if (global.document?.body?.classList?.contains('hunger-energy-modal-open')) return;
      if (show({ source: 'entry-auto-open', date: todayKey(), autoOpened: true })) {
        autoOpenShownClients.add(clientId);
      }
    }, attempt ? 250 : 450);
  }

  function installAutoOpen() {
    if (HEYS.__hungerEnergyAutoOpenInstalled) return;
    HEYS.__hungerEnergyAutoOpenInstalled = true;

    const onClientReady = () => scheduleAutoOpen('client-ready');
    const onSyncCompleted = (event) => {
      if (event?.detail?.phaseA) return;
      scheduleAutoOpen('sync-completed');
    };
    const onProgress = (event) => {
      if (event?.detail?.phase === 'ready') scheduleAutoOpen('app-ready');
    };
    const onCheckinComplete = () => scheduleAutoOpen('checkin-complete');

    global.addEventListener?.('heys:client-changed', onClientReady);
    global.addEventListener?.('heysSyncCompleted', onSyncCompleted);
    global.addEventListener?.('heys:progress', onProgress);
    global.addEventListener?.('heys:checkin-complete', onCheckinComplete);
    setTimeout(() => scheduleAutoOpen('boot'), 0);
  }

  function normalizeEventRow(row) {
    if (!row || typeof row !== 'object') return null;
    const recordedAt = row.recordedAt || row.createdAt || nowIso();
    const createdAt = row.createdAt || recordedAt;
    const updatedAt = row.updatedAt || row.outcomeAt || createdAt;
    return {
      ...row,
      id: row.id || (HEYS.utils?.uuid?.() || ('hes_' + Date.now().toString(36))),
      schemaVersion: EVENT_SCHEMA_VERSION,
      storageKey: STORAGE_KEY,
      cloudSyncKey: row.cloudSyncKey || STORAGE_KEY,
      syncStatus: row.syncStatus || 'queued',
      clientId: row.clientId || currentClientId(),
      createdAt,
      recordedAt,
      updatedAt
    };
  }

  function normalizeEventRows(rows) {
    const byId = new Map();
    safeArray(rows).forEach((row) => {
      const normalized = normalizeEventRow(row);
      if (!normalized) return;
      if (byId.has(normalized.id)) byId.delete(normalized.id);
      byId.set(normalized.id, normalized);
    });
    return Array.from(byId.values()).slice(-MAX_EVENTS);
  }

  function writeEvents(rows) {
    const U = HEYS.utils || {};
    const next = normalizeEventRows(rows);
    if (U.lsSet) U.lsSet(STORAGE_KEY, next);
    else if (HEYS.store?.set) HEYS.store.set(STORAGE_KEY, next);
    try {
      global.dispatchEvent(new CustomEvent('heys:hunger-energy-status-updated', { detail: next }));
    } catch (_) {}
    return next;
  }

  function addEvent(event) {
    const row = normalizeEventRow({
      createdAt: nowIso(),
      recordedAt: event?.recordedAt || nowIso(),
      eventType: event?.eventType || 'hunger_energy_status',
      ...event
    });
    writeEvents(readEvents().filter((item) => item?.id !== row.id).concat(row));
    return row;
  }

  function updateEvent(id, patchOrUpdater) {
    if (!id) return null;
    let updated = null;
    const next = readEvents().map((row) => {
      if (row?.id !== id) return row;
      const patch = typeof patchOrUpdater === 'function' ? patchOrUpdater(row) : patchOrUpdater;
      updated = normalizeEventRow({
        ...row,
        ...(patch || {}),
        id: row.id,
        updatedAt: patch?.updatedAt || nowIso(),
        syncStatus: 'queued'
      });
      return updated;
    });
    if (!updated) return null;
    writeEvents(next);
    return updated;
  }

  function minutesSince(dateTime) {
    if (!dateTime) return null;
    const t = Date.parse(dateTime);
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.round((Date.now() - t) / 60000));
  }

  function mealDateTime(date, time) {
    if (!date || !time) return null;
    const parts = String(time).split(':');
    if (parts.length < 2) return null;
    return date + 'T' + String(parts[0]).padStart(2, '0') + ':' + String(parts[1]).padStart(2, '0') + ':00';
  }

  function mealTimeValue(meal) {
    if (!meal) return '';
    return meal.time || meal.timeStart || meal.startTime || meal.createdAt || meal.ts || meal.timestamp || '';
  }

  function mealTimeToDateTime(date, value) {
    if (!value) return null;
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text;
    const match = /^(\d{1,2}):(\d{2})/.exec(text);
    if (!match) return mealDateTime(date, text);
    const rawHour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(rawHour) || !Number.isFinite(minute)) return null;
    const dayOffset = Math.floor(rawHour / 24);
    const hour = rawHour % 24;
    return addDays(date, dayOffset) + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00';
  }

  function parseClockMinutes(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  }

  function sleepTimeToDateTime(date, value, dayOffset) {
    const minutes = parseClockMinutes(value);
    if (minutes == null) return null;
    const hour = Math.floor(minutes / 60) % 24;
    const minute = minutes % 60;
    return addDays(date, dayOffset || 0) + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00';
  }

  function getOptionDay(opts) {
    return opts && opts.day && typeof opts.day === 'object' ? opts.day : null;
  }

  function getRuntimeDay(date) {
    const runtimeDay = HEYS.Day?.getDay?.();
    if (!runtimeDay || typeof runtimeDay !== 'object') return null;
    if (!date || !runtimeDay.date || runtimeDay.date === date) return runtimeDay;
    return null;
  }

  function getStoredDay(date) {
    if (!date) return null;
    return HEYS.dayUtils?.loadDay?.(date, true) || null;
  }

  function getRecentDayCandidates(date, primaryDay) {
    const rows = [];
    const seen = new Set();
    function push(dateKey, day) {
      if (!dateKey || !day || typeof day !== 'object') return;
      const key = dateKey + ':' + (day.updatedAt || day.date || rows.length);
      if (seen.has(key)) return;
      seen.add(key);
      rows.push({ date: dateKey, day });
    }

    const today = date || primaryDay?.date || todayKey();
    push(primaryDay?.date || today, primaryDay);
    push(today, getRuntimeDay(today));
    push(today, getStoredDay(today));
    for (let offset = 1; offset <= 3; offset += 1) {
      const prevDate = addDays(today, -offset);
      push(prevDate, getStoredDay(prevDate));
    }
    return rows;
  }

  function findLastMealContext(date, primaryDay) {
    const candidates = getRecentDayCandidates(date, primaryDay);
    let best = null;
    candidates.forEach(({ date: dayDate, day }) => {
      safeArray(day.meals).forEach((meal) => {
        if (!safeArray(meal && meal.items).length) return;
        const at = mealTimeToDateTime(dayDate, mealTimeValue(meal));
        if (!best || (at && (!best.at || Date.parse(at) > Date.parse(best.at)))) {
          best = { meal, at, date: dayDate };
        }
      });
    });
    return best;
  }

  function timestampOf(value) {
    const t = Date.parse(value || '');
    return Number.isFinite(t) ? t : null;
  }

  function formatShortTime(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function formatLocalDateTime(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  }

  function buildLogDateTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return { raw: String(value), iso: null, local: null };
    return {
      raw: String(value),
      iso: d.toISOString(),
      local: formatLocalDateTime(d.getTime()),
      timezoneOffsetMin: -d.getTimezoneOffset()
    };
  }

  function localDateKeyFromTs(value) {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayStartTs(date) {
    const t = Date.parse(String(date || todayKey()) + 'T00:00:00');
    return Number.isFinite(t) ? t : Date.parse(todayKey() + 'T00:00:00');
  }

  function hungerTimelineStartTs(date) {
    const t = Date.parse(String(date || todayKey()) + 'T' + String(HUNGER_TIMELINE_DAY_START_HOUR).padStart(2, '0') + ':00:00');
    return Number.isFinite(t) ? t : dayStartTs(date);
  }

  function collectMealTimeline(date, primaryDay) {
    const rows = [];
    const seen = new Set();
    getRecentDayCandidates(date, primaryDay).forEach(({ date: dayDate, day }) => {
      safeArray(day.meals).forEach((meal, index) => {
        if (!safeArray(meal && meal.items).length) return;
        const at = mealTimeToDateTime(dayDate, mealTimeValue(meal));
        const t = timestampOf(at);
        if (!Number.isFinite(t)) return;
        const key = dayDate + ':' + index + ':' + t;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          type: 'meal',
          t,
          at,
          label: 'еда ' + formatShortTime(t)
        });
      });
    });
    return rows.sort((a, b) => a.t - b.t);
  }

  function collectHungerTimeline() {
    return readEvents().map((row) => {
      const t = timestampOf(row.recordedAt || row.createdAt);
      const hungerLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
      if (!Number.isFinite(t) || !Number.isFinite(hungerLevel)) return null;
      return {
        type: 'hunger',
        id: row.id,
        t,
        level: Math.max(1, Math.min(10, Math.round(hungerLevel))),
        recordedAt: row.recordedAt || row.createdAt,
        label: 'голод ' + Math.round(hungerLevel) + '/10 ' + formatShortTime(t)
      };
    }).filter(Boolean).sort((a, b) => a.t - b.t);
  }

  function buildTimelineTicks(scaleStart, scaleEnd, xOf) {
    const spanHours = Math.max(1, (scaleEnd - scaleStart) / (60 * 60 * 1000));
    const intervalHours = spanHours > 12 ? 3 : 2;
    const tick = new Date(scaleStart);
    if (!Number.isFinite(tick.getTime())) return [];
    tick.setMinutes(0, 0, 0);
    const remainder = tick.getHours() % intervalHours;
    if (remainder !== 0 || tick.getTime() < scaleStart) {
      tick.setHours(tick.getHours() + ((intervalHours - remainder) || intervalHours));
    }
    const rows = [];
    while (tick.getTime() <= scaleEnd) {
      const t = tick.getTime();
      if (t >= scaleStart) rows.push({ t, x: Math.max(18, Math.min(302, xOf(t))), label: formatShortTime(t) });
      tick.setHours(tick.getHours() + intervalHours);
      if (rows.length > 12) break;
    }
    return rows;
  }

  function resolveSleepInterval(date, primaryDay) {
    const candidate = getRecentDayCandidates(date, primaryDay)
      .filter((entry) => entry.date === date)
      .map((entry) => entry.day)
      .find((day) => parseClockMinutes(day?.sleepStart) != null && parseClockMinutes(day?.sleepEnd) != null);
    if (!candidate) return null;
    const startMin = parseClockMinutes(candidate.sleepStart);
    const endMin = parseClockMinutes(candidate.sleepEnd);
    const crossesMidnight = startMin > endMin;
    const startAt = sleepTimeToDateTime(date, candidate.sleepStart, crossesMidnight ? -1 : 0);
    const endAt = sleepTimeToDateTime(date, candidate.sleepEnd, 0);
    const start = timestampOf(startAt);
    const end = timestampOf(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    return { start, end, source: 'sleep', sleepStart: candidate.sleepStart, sleepEnd: candidate.sleepEnd };
  }

  function buildNightBands(sleepInterval, scaleStart, scaleEnd, xOf) {
    if (!sleepInterval) return [];
    const start = Math.max(sleepInterval.start, scaleStart);
    const end = Math.min(sleepInterval.end, scaleEnd);
    if (end <= start) return [];
    const x1 = Math.max(18, Math.min(302, xOf(start)));
    const x2 = Math.max(18, Math.min(302, xOf(end)));
    if (x2 - x1 < 3) return [];
    return [{ x: x1, width: x2 - x1, source: sleepInterval.source }];
  }

  function buildSparkLinePoints(hungerPoints, meals) {
    if (hungerPoints.length < 2) return hungerPoints;
    const mealMarkers = safeArray(meals).slice().sort((a, b) => a.t - b.t);
    const rows = [hungerPoints[0]];
    for (let index = 1; index < hungerPoints.length; index += 1) {
      const prev = hungerPoints[index - 1];
      const next = hungerPoints[index];
      const meal = mealMarkers.find((item) => item.t > prev.t && item.t < next.t);
      if (meal && Math.abs(meal.x - prev.x) > 1 && Math.abs(next.x - meal.x) > 1) {
        rows.push({
          type: 'meal-hold',
          t: meal.t,
          level: prev.level,
          x: meal.x,
          y: prev.y,
          color: prev.color
        });
      }
      rows.push(next);
    }
    return rows;
  }

  function buildSparkTimeline({ date, day, draft, editTarget }) {
    const now = Date.now();
    const timelineDate = date || todayKey();
    const meals = collectMealTimeline(date, day);
    const hunger = collectHungerTimeline();
    const todayMeals = meals.filter((item) => localDateKeyFromTs(item.t) === timelineDate && item.t <= now);
    const lastTodayMeal = todayMeals.slice().sort((a, b) => b.t - a.t)[0];
    const lastMeal = lastTodayMeal || meals
      .filter((item) => item.t <= now)
      .sort((a, b) => b.t - a.t)[0];
    const shouldShowSleepContext = !lastTodayMeal;
    const visibleMeals = lastMeal ? [lastMeal] : [];
    const hungerStart = hungerTimelineStartTs(timelineDate);
    const visibleHunger = hunger.filter((item) => localDateKeyFromTs(item.t) === timelineDate && item.t >= hungerStart && item.t <= now);
    const previewLevel = Math.max(1, Math.min(10, Math.round(Number(draft?.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
    const preview = { type: 'preview', t: now, level: previewLevel, label: 'сейчас ' + previewLevel + '/10' };
    const hungerPoints = visibleHunger.concat(editTarget?.id ? [] : [preview]).sort((a, b) => a.t - b.t);
    const visibleItems = visibleMeals.concat(hungerPoints);
    const firstVisible = Math.min(...visibleItems.map((item) => item.t));
    const lastVisible = Math.max(...visibleItems.map((item) => item.t));
    const span = Math.max(1, lastVisible - firstVisible);
    const sidePad = visibleItems.length > 1 ? Math.max(12 * 60 * 1000, span * 0.08) : 45 * 60 * 1000;
    const scaleStart = firstVisible - sidePad;
    const scaleEnd = lastVisible + sidePad;
    const range = Math.max(1, scaleEnd - scaleStart);
    const xOf = (t) => 18 + ((t - scaleStart) / range) * 284;
    const yOf = (level) => 10 + ((10 - level) / 9) * 48;
    const sleepInterval = shouldShowSleepContext ? resolveSleepInterval(timelineDate, day) : null;
    const coloredHungerPoints = hungerPoints.map((item) => {
      const isEditing = !!editTarget?.id && item.id === editTarget.id;
      const level = isEditing
        ? Math.max(1, Math.min(10, Math.round(Number(editTarget.hungerLevel) || item.level)))
        : item.level;
      const x = Math.max(18, Math.min(302, xOf(item.t)));
      return {
        ...item,
        level,
        type: isEditing ? 'edit-preview' : item.type,
        isEditing,
        x,
        y: yOf(level),
        color: getHungerTone(level).main
      };
    });
    const coloredMeals = visibleMeals.map((item) => ({ ...item, x: Math.max(18, Math.min(302, xOf(item.t))) }));
    const linePoints = buildSparkLinePoints(coloredHungerPoints, coloredMeals);
    const path = linePoints.length > 1 ? linePoints.map((point, index) => {
      return (index ? 'L' : 'M') + point.x.toFixed(1) + ' ' + point.y.toFixed(1);
    }).join(' ') : '';
    return {
      meals: coloredMeals,
      hungerPoints: coloredHungerPoints,
      lineStops: linePoints.map((item) => ({
        offset: Math.max(0, Math.min(100, ((item.x - 18) / 284) * 100)),
        color: item.color
      })),
      ticks: buildTimelineTicks(scaleStart, scaleEnd, xOf),
      nightBands: buildNightBands(sleepInterval, scaleStart, scaleEnd, xOf),
      sleepInterval,
      path,
      hasHistory: visibleMeals.length > 0 || visibleHunger.length > 0
    };
  }

  function resolveDayData(opts) {
    const optionDay = getOptionDay(opts);
    const requestedDate = opts.date || optionDay?.date || todayKey();
    const candidates = [
      optionDay,
      getRuntimeDay(requestedDate),
      getStoredDay(requestedDate),
      HEYS.DayData?.getCurrentDay?.()
    ].filter(Boolean);
    const withMeals = candidates.find((candidate) =>
      safeArray(candidate.meals).some((meal) => safeArray(meal && meal.items).length > 0)
    );
    return withMeals || candidates[0] || { date: requestedDate };
  }

  function numeric(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function isQaEvent(row) {
    return row?.source === 'qa' || row?.eventType === 'qa' || row?.qa === true;
  }

  function buildHistorySignals() {
    const rows = readEvents();
    const userRows = rows.filter((row) => !isQaEvent(row));
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const today = todayKey();
    const hungerRows = userRows
      .map((row) => {
        const t = Date.parse(row.recordedAt || row.createdAt || '');
        const hungerLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
        return { row, t, hungerLevel };
      })
      .filter((entry) => Number.isFinite(entry.t));
    const risky = userRows.filter((row) => {
      const t = Date.parse(row.createdAt || '');
      if (!Number.isFinite(t) || t < cutoff) return false;
      const outcome = getOutcome(row);
      return BAD_OUTCOMES.includes(outcome) ||
        row.decision?.riskLevel === 'high' ||
        row.decision?.statusLabel === 'reboundRisk';
    });
    const days = new Set(risky.map((row) => String(row.createdAt || '').slice(0, 10)).filter(Boolean));
    const latest = hungerRows.slice().sort((a, b) => b.t - a.t)[0];
    const todayRows = hungerRows.filter((entry) => String(entry.row.recordedAt || entry.row.createdAt || '').slice(0, 10) === today);
    const recent6h = hungerRows.filter((entry) => now - entry.t <= 6 * 60 * 60 * 1000);
    const recent2h = hungerRows.filter((entry) => now - entry.t <= 2 * 60 * 60 * 1000);
    const highToday = todayRows.filter((entry) => entry.hungerLevel >= 7);
    const personalHungerModel = buildPersonalHungerModel(userRows);
    return {
      knownReboundPattern: risky.length >= 6 && days.size >= 7,
      personalPatternEvents: risky.length,
      personalPatternDays: days.size,
      personalHungerModel,
      previousHungerLevel: Number.isFinite(latest?.hungerLevel) ? latest.hungerLevel : null,
      previousHungerEventAt: latest?.row?.recordedAt || latest?.row?.createdAt || null,
      minutesSinceLastHungerEvent: latest ? Math.max(0, Math.round((now - latest.t) / 60000)) : null,
      recentHungerEventCount6h: recent6h.length,
      recentHighHungerCount6h: recent6h.filter((entry) => entry.hungerLevel >= 7).length,
      repeatedHighHungerToday: highToday.length >= 2,
      checkpointAttemptCount: recent2h.length
    };
  }

  function buildContextFromDay(options) {
    const opts = options || {};
    const day = resolveDayData(opts);
    const date = opts.date || day.date || todayKey();
    const lastMealContext = findLastMealContext(date, day);
    const lastMeal = lastMealContext?.meal || null;
    const lastMealAt = lastMealContext?.at || null;
    const minSinceMeal = minutesSince(lastMealAt);
    const sleepHours = numeric(day.sleepHours || day.sleepTotalHours);
    const stressValue = numeric(day.stressAvg || day.stressMorning || day.stress);
    const moodValue = numeric(day.moodAvg || day.moodMorning || day.mood);
    const trainings = safeArray(day.trainings);
    const trainingMinutes = trainings.reduce((sum, tr) => sum + safeArray(tr && tr.z).reduce((s, m) => s + numeric(m), 0), 0);
    const eatenKcal = numeric(opts.eatenKcal || day.savedEatenKcal || day.kcal);
    const optimum = numeric(opts.optimum);
    const hour = new Date().getHours();
    const history = buildHistorySignals();
    const todayMeals = safeArray(day.meals).filter((meal) => safeArray(meal && meal.items).length > 0);
    const noIntakeToday = hour >= 14 && eatenKcal <= 0 && todayMeals.length === 0;
    const hoursSinceMeal = minSinceMeal == null ? null : minSinceMeal / 60;
    const personalModel = history.personalHungerModel || {};
    const longGapNow = Number.isFinite(hoursSinceMeal) && hoursSinceMeal >= 8;
    const failedDelayHistory = !!personalModel.delayRiskHigh || (!!personalModel.longGapDelayRiskHigh && longGapNow);
    const successfulWaitHistory = !!personalModel.waitWorks && !failedDelayHistory;

    return {
      now: nowIso(),
      lastMealAt,
      hasMealData: !!lastMeal,
      mealTimeMissing: !!lastMeal && !lastMealAt,
      recentMeal: minSinceMeal != null && minSinceMeal <= 180,
      justAte: minSinceMeal != null && minSinceMeal <= 15,
      satietyLagLikely: minSinceMeal != null && minSinceMeal <= 20,
      hoursSinceMeal,
      todayMealCount: todayMeals.length,
      noIntakeToday,
      remainingKcal: optimum ? Math.max(0, optimum - eatenKcal) : undefined,
      veryLowIntakeDay: hour >= 17 && eatenKcal > 0 && eatenKcal < 900,
      sleepHours: sleepHours || undefined,
      sleepQuality: sleepHours && sleepHours < 5 ? 'veryPoor' : sleepHours && sleepHours < 6 ? 'poor' : undefined,
      stressLevel: stressValue >= 7 ? 'high' : undefined,
      moodDropping: moodValue > 0 && moodValue <= 3,
      trainingRecovery: trainingMinutes >= 60 ? 'hard' : undefined,
      hardTrainingRecovery: trainingMinutes >= 90,
      proteinDebt: !!opts.proteinDebt,
      insulinWaveState: opts.insulinWaveState,
      caffeineHabitual: !!opts.caffeineHabitual,
      caffeineRiskLow: !!opts.caffeineRiskLow,
      alcoholRecent: !!day.alcohol || !!opts.alcoholRecent,
      ...history,
      failedDelayHistory,
      successfulWaitHistory,
      personalLearningApplied: {
        failedDelayHistory,
        successfulWaitHistory,
        longGapNow,
        source: personalModel.learnedEnough ? personalModel.profileHint : 'learning'
      }
    };
  }

  function resolveHungerTrend(hungerLevel, context) {
    const previous = Number(context?.previousHungerLevel);
    const current = Number(hungerLevel);
    const minutesSincePrevious = Number(context?.minutesSinceLastHungerEvent);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return 'unknown';
    if (!Number.isFinite(minutesSincePrevious) || minutesSincePrevious > TREND_WINDOW_MIN) return 'unknown';
    if (current > previous) return 'rising';
    if (current < previous) return 'falling';
    return 'stable';
  }

  function compactDecision(decision) {
    return {
      statusLabel: decision.statusLabel,
      riskLevel: decision.riskBudget?.level,
      foodSupportLevel: decision.foodPriority?.level,
      suggestedAction: decision.suggestedAction,
      delayAllowed: decision.delayAllowed,
      hardOverride: decision.hardOverride || null,
      copyRisk: decision.copyRisk,
      recheckAfterMin: decision.recheckAfterMin || null,
      foodBandKcal: Array.isArray(decision.foodBandKcal) ? decision.foodBandKcal.slice() : null
    };
  }

  function getDisplayStatus(decision) {
    if (decision.suggestedAction === 'planNextMeal') return 'Сейчас можно не есть, но день требует плана';
    if (decision.suggestedAction === 'hydratePause') return 'Короткая пауза уместна';
    if (decision.suggestedAction === 'coffeePause') return 'Кофе только как короткая пауза';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') return 'Можно перепроверить позже';
    return STATUS_COPY[decision.statusLabel] || decision.statusLabel;
  }

  function translateDriver(driver) {
    return DRIVER_COPY[driver] || String(driver || '').replace(/_/g, ' ');
  }

  function unique(values) {
    const seen = new Set();
    return safeArray(values).filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function getOutcome(row) {
    return row?.outcomePlan?.userReported || row?.outcome || null;
  }

  function getDecisionAction(row) {
    return row?.decisionSnapshot?.suggestedAction || row?.decision?.suggestedAction || row?.log?.decision?.suggestedAction || null;
  }

  function isLongGapRow(row) {
    const hours = Number(row?.context?.hoursSinceMeal);
    const band = row?.mealGapRiskCurve?.currentBand;
    return (Number.isFinite(hours) && hours >= 8) || ['extended', 'long', 'veryLong'].includes(band);
  }

  function buildPersonalHungerModel(rows) {
    const outcomeRows = safeArray(rows)
      .map((row) => ({
        row,
        t: Date.parse(row.outcomeAt || row.outcomePlan?.userReportedAt || row.recordedAt || row.createdAt || ''),
        outcome: getOutcome(row),
        action: getDecisionAction(row)
      }))
      .filter((entry) => Number.isFinite(entry.t) && entry.outcome && entry.outcome !== 'calculated');
    const hungerOutcomeRows = outcomeRows.filter((entry) => entry.action !== 'fastCarbSafety');
    const outcomeDays = new Set(hungerOutcomeRows.map((entry) => String(entry.row.recordedAt || entry.row.createdAt || '').slice(0, 10)).filter(Boolean));
    const delayRows = hungerOutcomeRows.filter((entry) => DELAY_ACTIONS.includes(entry.action));
    const foodRows = hungerOutcomeRows.filter((entry) => FOOD_ACTIONS.includes(entry.action));
    const badDelayRows = delayRows.filter((entry) => BAD_OUTCOMES.includes(entry.outcome));
    const goodDelayRows = delayRows.filter((entry) => GOOD_WAIT_OUTCOMES.includes(entry.outcome));
    const goodFoodRows = foodRows.filter((entry) => GOOD_FOOD_OUTCOMES.includes(entry.outcome));
    const badLongGapDelayRows = badDelayRows.filter((entry) => isLongGapRow(entry.row));
    const badNonLongGapDelayRows = badDelayRows.filter((entry) => !isLongGapRow(entry.row));
    const learnedEnough = hungerOutcomeRows.length >= 6 && outcomeDays.size >= 3;
    const delayRiskHigh = learnedEnough && badNonLongGapDelayRows.length >= 2 && badDelayRows.length >= goodDelayRows.length;
    const longGapDelayRiskHigh = learnedEnough && badLongGapDelayRows.length >= 2;
    const waitWorks = learnedEnough && goodDelayRows.length >= 3 && goodDelayRows.length > badDelayRows.length;
    const foodAnchorHelpful = learnedEnough && goodFoodRows.length >= 3;
    const profileHint = delayRiskHigh || longGapDelayRiskHigh
      ? 'delay_risky'
      : waitWorks
        ? 'wait_often_works'
        : foodAnchorHelpful
          ? 'food_anchor_helpful'
          : 'learning';
    return {
      sampleSize: hungerOutcomeRows.length,
      ignoredSafetyOutcomeCount: outcomeRows.length - hungerOutcomeRows.length,
      days: outcomeDays.size,
      learnedEnough,
      delayAttempts: delayRows.length,
      badDelayCount: badDelayRows.length,
      goodDelayCount: goodDelayRows.length,
      foodAttempts: foodRows.length,
      goodFoodCount: goodFoodRows.length,
      longGapBadDelayCount: badLongGapDelayRows.length,
      generalBadDelayCount: badNonLongGapDelayRows.length,
      delayRiskHigh,
      longGapDelayRiskHigh,
      waitWorks,
      foodAnchorHelpful,
      profileHint
    };
  }

  function getDisplayDrivers(decision, input, context) {
    const drivers = [];
    drivers.push('голод ' + input.hungerLevel + '/10');
    if (decision.missingInputs.includes('safetyFlags')) drivers.push('safety не уточнён');
    if (input.controlLevel == null && input.hungerLevel >= 6) drivers.push('контроль не уточнён');
    else if (input.controlLevel != null && input.controlLevel <= 4) drivers.push('контроль низкий');
    else if (input.controlLevel != null && input.controlLevel <= 6) drivers.push('контроль средний');
    if (context.veryLowIntakeDay || decision.statusLabel === 'deficitPressure') drivers.push('дефицит сегодня');
    if (context.noIntakeToday) drivers.push('еда сегодня не найдена');
    if (context.justAte || context.recentMeal || context.satietyLagLikely) drivers.push('еда была недавно');

    const raw = unique((decision.riskBudget?.driversUp || [])
      .concat(decision.foodPriority?.driversUp || [], decision.foodPriority?.driversDown || []))
      .filter((driver) => driver !== 'hunger_rising' && driver !== 'hunger_stable_or_falling');
    raw.forEach((driver) => drivers.push(translateDriver(driver)));
    return unique(drivers).slice(0, 4);
  }

  function getPreliminaryAction(decision) {
    switch (decision.suggestedAction) {
      case 'riskBrakeMeal':
      case 'proteinFiberFirst':
      case 'eatSnack':
        return 'Предварительно: небольшой белково-клетчаточный перекус.';
      case 'eatMeal':
      case 'doNotDelay':
        return 'Предварительно: еда сейчас выглядит полезнее ожидания.';
      case 'hydratePause':
      case 'coffeePause':
      case 'delayWithCheck':
      case 'observe':
      default:
        return 'Предварительно: короткая пауза с перепроверкой.';
    }
  }

  function getRequiredInputs(decision, draft) {
    const hunger = Number(draft?.hungerLevel) || 0;
    return safeArray(decision?.missingInputs).filter((key) => {
      if (key === 'safetyFlags') return hunger >= 6 && !Array.isArray(draft.safetyFlags);
      if (key === 'controlLevel') return hunger >= 6 && draft.controlLevel == null;
      if (key === 'lastMealAt') return hunger >= 5;
      return key === 'freshContextData';
    });
  }

  function MissingPrompt({ missingInputs, onPatch }) {
    const missing = safeArray(missingInputs);
    const isVisible = missing.length > 0;
    let title = 'Уточнить для безопасного решения';
    let options = [];
    if (!isVisible) {
      title = '';
      options = [];
    } else if (missing.includes('safetyFlags')) {
      title = 'Есть дрожь, слабость или головокружение?';
      options = [
        ['Нет', { safetyFlags: [] }],
        ['Есть', { safetyFlags: [HEYS.HungerEnergyStatus.SAFETY_FLAGS.shaky] }]
      ];
    } else if (missing.includes('controlLevel')) {
      title = 'Могу выбрать еду спокойно?';
      options = [
        ['Да, спокойно', { controlLevel: 8 }],
        ['Тянет сорваться', { controlLevel: 3, cravingLevel: 8 }]
      ];
    } else if (missing.includes('lastMealAt')) {
      title = 'Ел недавно или давно?';
      options = [
        ['Недавно', { contextPatch: { justAte: true, recentMeal: true, satietyLagLikely: true } }],
        ['Давно', { contextPatch: { longGap: true } }]
      ];
    }
    return h('div', {
      className: 'hes-prompt' + (isVisible ? ' is-visible' : ' is-empty'),
      'aria-hidden': isVisible ? undefined : 'true'
    },
      h('div', { className: 'hes-prompt__title' }, title),
      h('div', { className: 'hes-prompt__chips' },
        options.map(([label, patch]) => h('button', {
          key: label,
          type: 'button',
          className: 'hes-chip',
          onClick: () => onPatch(patch)
        }, label))
      )
    );
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function mixChannel(from, to, ratio) {
    return Math.round(from + (to - from) * clamp01(ratio));
  }

  function mixRgb(from, to, ratio) {
    return [
      mixChannel(from[0], to[0], ratio),
      mixChannel(from[1], to[1], ratio),
      mixChannel(from[2], to[2], ratio)
    ];
  }

  function rgbCss(rgb) {
    return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')';
  }

  function rgbaCss(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  function getHungerTone(value) {
    const v = Math.max(1, Math.min(10, Number(value) || DEFAULT_DRAFT.hungerLevel));
    const green = [79, 157, 105];
    const amber = [215, 169, 40];
    const red = [216, 90, 74];
    const base = v <= 5.5
      ? mixRgb(green, amber, (v - 1) / 4.5)
      : mixRgb(amber, red, (v - 5.5) / 4.5);
    const soft = mixRgb(base, [255, 255, 255], 0.18);
    const action = mixRgb(base, [67, 69, 135], 0.36);
    const actionDeep = mixRgb(action, [23, 32, 51], 0.18);
    return {
      main: rgbCss(base),
      soft: rgbCss(soft),
      shadow: rgbaCss(base, 0.24),
      action: rgbCss(action),
      actionDeep: rgbCss(actionDeep),
      actionShadow: rgbaCss(action, 0.26)
    };
  }

  function getInitialDraftForState(state) {
    const day = resolveDayData(state || {});
    const date = state?.date || day.date || todayKey();
    const context = buildContextFromDay({ ...(state || {}), date, day });
    const previousLevel = Number(context.previousHungerLevel);
    const previousAt = context.previousHungerEventAt;
    const previousMinutes = Number(context.minutesSinceLastHungerEvent);
    const previousDate = previousAt ? localDateKeyFromTs(previousAt) : '';
    const isFresh = Number.isFinite(previousLevel)
      && (previousDate === todayKey() || (Number.isFinite(previousMinutes) && previousMinutes <= TREND_WINDOW_MIN));
    if (!isFresh) return { ...DEFAULT_DRAFT };
    const level = Math.max(1, Math.min(10, Math.round(previousLevel)));
    return {
      ...DEFAULT_DRAFT,
      hungerLevel: level,
      hungerVisual: previousLevel
    };
  }

  function HungerSlider({ value, changeNote, onPreview, onCommit, onDragStart, onDragEnd }) {
    const visualValue = Number.isFinite(Number(value)) ? Number(value) : 5;
    const roundedValue = Math.max(1, Math.min(10, Math.round(visualValue)));
    const label = String(roundedValue);
    const fillPercent = ((Math.max(1, Math.min(10, visualValue)) - 1) / 9) * 100;
    const fillPx = (fillPercent / 100) * 205;
    const hungerTone = getHungerTone(visualValue);
    const handlePreview = (e) => {
      onDragStart?.();
      onPreview(Number(e.target.value));
    };
    const handleCommit = (e) => {
      onCommit(Number(e.target.value));
      onDragEnd?.();
    };
    return h('div', { className: 'hes-slider' },
      h('div', { className: 'hes-slider__value' }, label),
      h('div', { className: 'hes-slider__status' }, HUNGER_STATUS_COPY[roundedValue] || ''),
      changeNote && h('div', { className: 'hes-slider__change' }, changeNote),
      h('div', {
        className: 'hes-slider__control',
        style: {
          '--hes-fill-percent': fillPercent + '%',
          '--hes-fill-px': fillPx + 'px',
          '--hes-fill-color': hungerTone.main,
          '--hes-fill-color-soft': hungerTone.soft,
          '--hes-fill-shadow': hungerTone.shadow
        }
      },
        h('div', { className: 'hes-slider__track', 'aria-hidden': 'true' },
          h('span', { className: 'hes-slider__fill' }),
          h('span', { className: 'hes-slider__thumb' })
        ),
        h('input', {
          className: 'hes-slider__range',
          type: 'range',
          min: 1,
          max: 10,
          step: 0.01,
          value: visualValue,
          'aria-label': 'Степень голода',
          onPointerDown: () => onDragStart?.(),
          onInput: handlePreview,
          onPointerUp: handleCommit,
          onPointerCancel: handleCommit,
          onTouchEnd: handleCommit
        })
      )
    );
  }

  function TimelineSpark({ date, day, draft, hint, editingEventId, onEditPoint }) {
    const data = buildSparkTimeline({
      date,
      day,
      draft,
      editTarget: editingEventId ? { id: editingEventId, hungerLevel: draft?.hungerLevel } : null
    });
    const gradientId = 'hes-hunger-spark-gradient';
    const canEditPoint = (point) => point?.id && point.type !== 'preview';
    const handlePointKey = (event, point) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onEditPoint?.(point);
    };
    return h('div', {
      className: 'hes-spark',
      role: onEditPoint ? 'group' : 'img',
      'aria-label': 'Связь прошлых оценок голода и приёмов пищи'
    },
      h('svg', {
        className: 'hes-spark__svg',
        viewBox: '0 0 320 86',
        focusable: 'false',
        'aria-hidden': onEditPoint ? undefined : 'true'
      },
        data.lineStops.length > 1 && h('defs', null,
          h('linearGradient', { id: gradientId, x1: 18, y1: 0, x2: 302, y2: 0, gradientUnits: 'userSpaceOnUse' },
            data.lineStops.map((stop, index) => h('stop', {
              key: 'stop-' + index,
              offset: stop.offset.toFixed(1) + '%',
              stopColor: stop.color
            }))
          )
        ),
        data.nightBands.map((band, index) => h('rect', {
          key: 'night-' + index,
          className: 'hes-spark__night',
          x: band.x,
          y: 18,
          width: band.width,
          height: 46,
          rx: 7
        })),
        h('line', { className: 'hes-spark__axis', x1: 18, y1: 64, x2: 302, y2: 64 }),
        data.ticks.map((tick, index) => h('g', { key: 'tick-' + index, className: 'hes-spark__tick' },
          h('line', { x1: tick.x, y1: 62, x2: tick.x, y2: 67 }),
          h('text', { x: tick.x, y: 78, textAnchor: 'middle' }, tick.label)
        )),
        data.meals.map((meal, index) => h('line', {
          key: 'meal-' + index,
          className: 'hes-spark__meal-line',
          x1: meal.x,
          y1: 22,
          x2: meal.x,
          y2: 64
        })),
        data.path && h('path', { className: 'hes-spark__line', d: data.path, style: { stroke: 'url(#' + gradientId + ')' } }),
        data.hungerPoints.map((point, index) => {
          const editable = canEditPoint(point);
          const className = [
            'hes-spark__point',
            point.type === 'preview' ? 'hes-spark__point--preview' : '',
            editable ? 'is-editable' : '',
            point.isEditing ? 'is-editing' : ''
          ].filter(Boolean).join(' ');
          const visibleCircle = h('circle', {
            className,
            cx: point.x,
            cy: point.y,
            r: point.type === 'preview' ? 6 : point.isEditing ? 6 : 5,
            style: point.type === 'preview'
              ? { stroke: point.color }
              : { fill: point.color }
          });
          if (!editable) return React.cloneElement(visibleCircle, { key: point.type + '-' + index });
          return h('g', {
            key: point.id || (point.type + '-' + index),
            className: 'hes-spark__point-button',
            role: 'button',
            tabIndex: 0,
            'aria-label': 'Изменить оценку голода ' + point.level + '/10, ' + formatShortTime(point.t),
            onClick: () => onEditPoint?.(point),
            onKeyDown: (event) => handlePointKey(event, point)
          },
            visibleCircle,
            h('circle', {
              className: 'hes-spark__point-hit',
              cx: point.x,
              cy: point.y,
              r: 14
            })
          );
        })
      ),
      h('div', { className: 'hes-spark__legend' },
        h('span', { className: 'hes-spark__legend-items' },
          h('span', null, h('i', { className: 'hes-spark__legend-dot hes-spark__legend-dot--hunger' }), 'голод'),
          h('span', null, h('i', { className: 'hes-spark__legend-line hes-spark__legend-line--meal' }), 'еда')
        ),
        hint && h('span', { className: 'hes-spark__hint' }, hint),
        !data.hasHistory && h('span', { className: 'hes-spark__muted' }, 'история появится после записей')
      )
    );
  }

  function formatFoodBand(band) {
    if (!band) return null;
    if (band[0] === 0 && band[1] === 0) return 'без еды сейчас';
    return band[0] + '-' + band[1] + ' ккал';
  }

  function formatMinuteWindow(windowMin) {
    if (!Array.isArray(windowMin) || windowMin.length < 2) return null;
    return windowMin[0] === windowMin[1]
      ? windowMin[0] + ' мин'
      : windowMin[0] + '-' + windowMin[1] + ' мин';
  }

  function formatShortDuration(minutes) {
    const value = Number(minutes);
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 60) return Math.max(1, Math.round(value)) + ' мин';
    const hours = value / 60;
    if (hours < 10) return (Math.round(hours * 10) / 10).toString().replace('.0', '') + ' ч';
    return Math.round(hours) + ' ч';
  }

  function getHungerChangeNote(draft, context) {
    const previous = Number(context?.previousHungerLevel);
    const current = Number(draft?.hungerLevel);
    const minutes = Number(context?.minutesSinceLastHungerEvent);
    if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
    if (!Number.isFinite(minutes) || minutes > 24 * 60) return null;
    const previousRounded = Math.max(1, Math.min(10, Math.round(previous)));
    const currentRounded = Math.max(1, Math.min(10, Math.round(current)));
    const duration = formatShortDuration(minutes);
    if (!duration) return null;
    if (currentRounded === previousRounded) return 'Без изменений с прошлой оценки, ' + duration;
    const suffix = currentRounded - previousRounded >= 3 && minutes <= 180 ? ' · быстрый рост' : '';
    return 'Было ' + previousRounded + ' → стало ' + currentRounded + ' за ' + duration + suffix;
  }

  function getLastMealHint(context) {
    const hours = Number(context?.hoursSinceMeal);
    if (!Number.isFinite(hours)) {
      if (context?.mealTimeMissing) return 'Время последней еды не указано';
      if (context?.todayMealCount === 0) return 'Сегодня еда ещё не найдена';
      return null;
    }
    return 'с последней еды ' + formatShortDuration(hours * 60);
  }

  function getRecommendationTitle(decision) {
    if (decision.suggestedAction === 'fastCarbSafety') return 'Проверить низкую глюкозу';
    if (decision.hardOverride || decision.suggestedAction === 'doNotDelay') return 'Сейчас лучше поесть';
    if (decision.suggestedAction === 'eatMeal') return 'Съесть полноценный приём';
    if (decision.suggestedAction === 'planNextMeal') return 'Запланировать еду';
    if (decision.suggestedAction === 'hydratePause') return 'Вода и пауза';
    if (decision.suggestedAction === 'coffeePause') return 'Короткая пауза';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') return 'Пока не есть';
    return 'Съесть небольшой перекус';
  }

  function getRecommendationDetail(decision) {
    const band = formatFoodBand(decision.foodBandKcal);
    if (decision.suggestedAction === 'fastCarbSafety') return 'Если есть диабет или низкая глюкоза: быстрые углеводы и проверка через 15 мин';
    if (decision.suggestedAction === 'planNextMeal') return 'Можно не есть сейчас, но выбери ближайший спокойный приём';
    if (decision.suggestedAction === 'hydratePause') return 'Вода или несладкий чай, затем перепроверить';
    if (decision.suggestedAction === 'coffeePause') return 'Кофе только если он привычный и низкорисковый';
    if (decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') {
      return decision.recheckAfterMin ? 'Вернуться к оценке через ' + decision.recheckAfterMin + ' мин' : 'Вернуться к оценке позже';
    }
    if (decision.suggestedAction === 'eatMeal') return band ? 'Нормальный приём пищи, ' + band : 'Нормальный приём пищи';
    if (decision.suggestedAction === 'doNotDelay') return band ? 'Не откладывать, ' + band : 'Не откладывать';
    return band ? 'Белок + клетчатка, ' + band : 'Белок + клетчатка';
  }

  function getNextBestAction(result) {
    const decision = result?.decision || {};
    const band = formatFoodBand(decision.foodBandKcal);
    if (decision.suggestedAction === 'planNextMeal') {
      return {
        title: 'Выбрать ближайшую еду',
        detail: 'Поставить спокойный приём в ближайшее окно',
        type: 'plan'
      };
    }
    if (decision.suggestedAction === 'hydratePause' || decision.suggestedAction === 'delayWithCheck' || decision.suggestedAction === 'observe') {
      return {
        title: 'Поставить перепроверку',
        detail: 'Вернуться к шкале через ' + (decision.recheckAfterMin || 45) + ' мин',
        type: 'check'
      };
    }
    if (decision.suggestedAction === 'coffeePause') {
      return {
        title: 'Короткая пауза',
        detail: 'Кофе только если он привычный, затем повторная оценка',
        type: 'check'
      };
    }
    if (decision.suggestedAction === 'fastCarbSafety') {
      return {
        title: 'Safety-сценарий',
        detail: 'Быстрые углеводы, затем перепроверка через 15 мин',
        type: 'safety'
      };
    }
    return {
      title: decision.suggestedAction === 'eatMeal' ? 'Собрать спокойный приём' : 'Собрать перекус',
      detail: band ? 'Белок + клетчатка, ' + band : 'Белок + клетчатка',
      type: 'food'
    };
  }

  function getOutcomeTitle(decision) {
    if (decision?.suggestedAction === 'fastCarbSafety') return 'Через 15 мин';
    if (decision?.recheckAfterMin) return 'Через ' + decision.recheckAfterMin + ' мин';
    if (decision?.postFoodOutcomeAfterMin) return 'Через ' + formatMinuteWindow(decision.postFoodOutcomeAfterMin);
    return 'После решения';
  }

  function getOutcomeOptions(decision) {
    if (decision?.suggestedAction === 'fastCarbSafety') {
      return [
        ['symptoms_better', 'Стало лучше'],
        ['checked_glucose', 'Проверил глюкозу'],
        ['not_better', 'Не лучше'],
        ['got_help', 'Обратился за помощью']
      ];
    }
    if (decision?.delayAllowed) {
      return [
        ['hunger_grew', 'Голод вырос'],
        ['hunger_passed', 'Прошёл'],
        ['ate_calmly', 'Поел спокойно'],
        ['lost_control', 'Потерял контроль']
      ];
    }
    return [
      ['hunger_lower', 'Голод снизился'],
      ['ate_calmly', 'Поел спокойно'],
      ['not_enough', 'Не помогло'],
      ['lost_control', 'Потерял контроль']
    ];
  }

  function getFollowUpQuestion(decision) {
    if (decision?.suggestedAction === 'fastCarbSafety') return 'Что изменилось через 15 минут?';
    if (decision?.delayAllowed) return 'Что случилось после паузы?';
    if (decision?.postFoodOutcomeAfterMin) return 'Что случилось после еды?';
    return null;
  }

  function buildPatternCards(result) {
    const log = result?.log || {};
    const context = result?.context || {};
    const model = context.personalHungerModel || log.personalModel || {};
    const velocity = log.hungerVelocity || {};
    const cards = [];
    if (velocity.fresh && Number(velocity.delta) >= 2) {
      cards.push({
        id: 'fast_rise',
        title: 'Быстро растёт',
        detail: '+' + velocity.delta + ' за ' + velocity.minutes + ' мин'
      });
    }
    if (Number(context.hoursSinceMeal) >= 18) {
      cards.push({
        id: 'long_gap',
        title: 'Длинный промежуток',
        detail: Math.round(context.hoursSinceMeal) + ' ч без еды'
      });
    }
    if (model.delayRiskHigh || model.longGapDelayRiskHigh) {
      cards.push({
        id: 'delay_risk',
        title: 'Паузы рискованны',
        detail: 'по прошлым исходам'
      });
    } else if (model.waitWorks) {
      cards.push({
        id: 'wait_works',
        title: 'Пауза часто работает',
        detail: 'по прошлым исходам'
      });
    }
    if (model.foodAnchorHelpful) {
      cards.push({
        id: 'food_anchor',
        title: 'Перекус помогает',
        detail: 'по прошлым исходам'
      });
    }
    if (!model.learnedEnough && Number(model.sampleSize) > 0) {
      cards.push({
        id: 'learning',
        title: 'Модель учится',
        detail: model.sampleSize + '/6 исходов'
      });
    }
    return unique(cards.map((card) => card.id)).map((id) => cards.find((card) => card.id === id)).slice(0, 2);
  }

  function buildOutcomeLearning(context) {
    const model = context?.personalHungerModel || {};
    return {
      sampleSize: model.sampleSize || 0,
      days: model.days || 0,
      learnedEnough: !!model.learnedEnough,
      profileHint: model.profileHint || 'learning',
      delayRiskHigh: !!model.delayRiskHigh,
      longGapDelayRiskHigh: !!model.longGapDelayRiskHigh,
      waitWorks: !!model.waitWorks,
      foodAnchorHelpful: !!model.foodAnchorHelpful,
      counts: {
        delayAttempts: model.delayAttempts || 0,
        badDelay: model.badDelayCount || 0,
        goodDelay: model.goodDelayCount || 0,
        foodAttempts: model.foodAttempts || 0,
        goodFood: model.goodFoodCount || 0
      }
    };
  }

  function getRecommendationReasons(result) {
    const reasons = [];
    const input = result?.input || {};
    const context = result?.context || {};
    const decision = result?.decision || {};
    if (input.hungerLevel) reasons.push('голод ' + input.hungerLevel + '/10');
    if (context.hoursSinceMeal >= 4) reasons.push(Math.round(context.hoursSinceMeal) + ' ч без еды');
    if (context.noIntakeToday) reasons.push('еда сегодня не найдена');
    if (input.hungerTrend === 'rising') reasons.push('голод растёт');
    if (context.repeatedHighHungerToday && Number(input.hungerLevel) >= 6) reasons.push('повторяется сегодня');
    if (decision.riskBudget?.level === 'high') reasons.push('риск ожидания высокий');
    safeArray(result?.drivers).forEach((driver) => reasons.push(driver));
    return unique(reasons).slice(0, 3);
  }

  function getContextBadges(result) {
    const context = result?.context || {};
    const input = result?.input || {};
    const badges = [];
    badges.push(context.hasMealData ? 'последняя еда найдена' : 'еда не найдена');
    if (context.noIntakeToday) badges.push('сегодня без еды');
    if (input.hungerTrend === 'unknown') badges.push('тренд не свежий');
    else badges.push(input.hungerTrend === 'rising' ? 'тренд растёт' : input.hungerTrend === 'falling' ? 'тренд снижается' : 'тренд стабилен');
    if (context.personalHungerModel?.learnedEnough) badges.push('личный паттерн учтён');
    else if (context.personalHungerModel?.sampleSize > 0) badges.push('личная модель учится');
    if (context.minutesSinceLastHungerEvent != null) badges.push('прошлая оценка ' + context.minutesSinceLastHungerEvent + ' мин назад');
    return unique(badges).slice(0, 4);
  }

  function buildHungerVelocity(input, context) {
    const previousLevel = Number(context.previousHungerLevel);
    const currentLevel = Number(input.hungerLevel);
    const minutes = Number(context.minutesSinceLastHungerEvent);
    const fresh = Number.isFinite(minutes) && minutes <= TREND_WINDOW_MIN;
    if (!Number.isFinite(previousLevel) || !Number.isFinite(currentLevel) || !Number.isFinite(minutes)) {
      return {
        previousLevel: null,
        currentLevel,
        delta: null,
        minutes: null,
        velocityPerHour: null,
        fresh: false
      };
    }
    const delta = currentLevel - previousLevel;
    return {
      previousLevel,
      currentLevel,
      delta,
      minutes,
      velocityPerHour: minutes > 0 ? Math.round((delta / minutes) * 60 * 10) / 10 : 0,
      fresh
    };
  }

  function buildMealGapRiskCurve(context) {
    const hours = Number(context.hoursSinceMeal);
    const thresholds = [4, 8, 12, 18, 24];
    return {
      hoursSinceMeal: Number.isFinite(hours) ? Math.round(hours * 10) / 10 : null,
      currentBand: !Number.isFinite(hours) ? 'unknown' :
        hours >= 24 ? 'veryLong' : hours >= 18 ? 'long' : hours >= 12 ? 'extended' : hours >= 8 ? 'noticeable' : hours >= 4 ? 'normalGap' : 'recent',
      markers: thresholds.map((threshold) => ({
        hour: threshold,
        passed: Number.isFinite(hours) ? hours >= threshold : false
      }))
    };
  }

  function cloneContext(context, patch) {
    return { ...(context || {}), ...(patch || {}) };
  }

  function buildDecisionTrace(input, context, decision) {
    const base = decision || HEYS.HungerEnergyStatus.assessHungerEvent(input, context);
    const rows = [];
    function add(label, patchInput, patchContext) {
      const alt = HEYS.HungerEnergyStatus.assessHungerEvent(
        { ...input, ...(patchInput || {}) },
        cloneContext(context, patchContext)
      );
      rows.push({
        factor: label,
        label: DEBUG_FACTOR_COPY[label] || label,
        riskDelta: base.riskBudget.score - alt.riskBudget.score,
        foodDelta: base.foodPriority.score - alt.foodPriority.score,
        actionIfRemoved: alt.suggestedAction,
        foodSupportIfRemoved: alt.foodPriority.level
      });
    }
    add('hungerLevel', { hungerLevel: 0 });
    if (input.hungerTrend === 'rising') add('hungerRising', { hungerTrend: 'unknown' });
    if (Number(context.hoursSinceMeal) >= 5 || context.longGap) {
      add('longGap', null, { hoursSinceMeal: 2, longGap: false });
    }
    if (context.noIntakeToday) add('noIntakeToday', null, { noIntakeToday: false });
    if (Number(context.remainingKcal) > 700) add('deficitPressure', null, { remainingKcal: 0 });
    return rows.filter((row) => row.riskDelta !== 0 || row.foodDelta !== 0 || row.actionIfRemoved !== base.suggestedAction);
  }

  function buildCounterfactuals(input, context) {
    const now = Date.parse(input?.now || context?.now || nowIso());
    const twoHoursAgo = Number.isFinite(now) ? new Date(now - 2 * 60 * 60 * 1000).toISOString() : null;
    const recentMealContext = {
      noIntakeToday: false,
      todayMealCount: Math.max(1, Number(context.todayMealCount) || 0),
      lastMealAt: twoHoursAgo || context.lastMealAt || null,
      hoursSinceMeal: 2,
      hasMealData: true,
      recentMeal: true,
      justAte: false,
      satietyLagLikely: false
    };
    const variants = [
      {
        id: 'meal_today_exists',
        label: 'если еда была 2ч назад',
        inputPatch: {},
        contextPatch: recentMealContext
      },
      {
        id: 'trend_not_rising',
        label: 'если голод не растёт',
        inputPatch: { hungerTrend: 'unknown' },
        contextPatch: {}
      },
      {
        id: 'short_gap',
        label: 'если промежуток короткий',
        inputPatch: {},
        contextPatch: { ...recentMealContext, longGap: false }
      }
    ];
    return variants.map((variant) => {
      const next = HEYS.HungerEnergyStatus.assessHungerEvent(
        { ...input, ...variant.inputPatch },
        cloneContext(context, variant.contextPatch)
      );
      return {
        id: variant.id,
        label: variant.label,
        suggestedAction: next.suggestedAction,
        riskLevel: next.riskBudget.level,
        foodSupportLevel: next.foodPriority.level,
        foodBandKcal: Array.isArray(next.foodBandKcal) ? next.foodBandKcal.slice() : null
      };
    });
  }

  function buildDecisionAudit(decision) {
    return {
      suggestedAction: decision.suggestedAction,
      delayAllowed: decision.delayAllowed,
      hardOverride: decision.hardOverride || null,
      riskLevel: decision.riskBudget?.level || null,
      foodSupportLevel: decision.foodPriority?.level || null,
      foodBandKcal: Array.isArray(decision.foodBandKcal) ? decision.foodBandKcal.slice() : null,
      recheckAfterMin: decision.recheckAfterMin || null,
      copyRisk: decision.copyRisk,
      requiresCuratorReview: !!decision.requiresCuratorReview,
      invariantErrors: safeArray(decision.invariantErrors),
      consistency: safeArray(decision.invariantErrors).length ? 'check_required' : 'ok'
    };
  }

  function buildDecisionLog({ source, input, context, decision, drivers }) {
    const hungerVelocity = buildHungerVelocity(input, context);
    const mealGapRiskCurve = buildMealGapRiskCurve(context);
    const decisionTrace = buildDecisionTrace(input, context, decision);
    const counterfactuals = buildCounterfactuals(input, context);
    const outcomeLearning = buildOutcomeLearning(context);
    const nextBestAction = getNextBestAction({ input, context, decision });
    const log = {
      feature: 'HungerEnergyStatus',
      version: 'ui_v1',
      source: source || 'hunger-fab',
      generatedAt: nowIso(),
      input,
      context: {
        now: context.now,
        lastMealAt: buildLogDateTime(context.lastMealAt),
        hoursSinceMeal: context.hoursSinceMeal ?? null,
        hasMealData: !!context.hasMealData,
        mealTimeMissing: !!context.mealTimeMissing,
        recentMeal: !!context.recentMeal,
        justAte: !!context.justAte,
        satietyLagLikely: !!context.satietyLagLikely,
        remainingKcal: context.remainingKcal,
        veryLowIntakeDay: !!context.veryLowIntakeDay,
        sleepHours: context.sleepHours,
        sleepQuality: context.sleepQuality,
        stressLevel: context.stressLevel,
        moodDropping: !!context.moodDropping,
        trainingRecovery: context.trainingRecovery,
        hardTrainingRecovery: !!context.hardTrainingRecovery,
        proteinDebt: !!context.proteinDebt,
        knownReboundPattern: !!context.knownReboundPattern,
        personalPatternEvents: context.personalPatternEvents || 0,
        personalPatternDays: context.personalPatternDays || 0,
        personalModel: context.personalHungerModel || null,
        personalLearningApplied: context.personalLearningApplied || null,
        failedDelayHistory: !!context.failedDelayHistory,
        successfulWaitHistory: !!context.successfulWaitHistory,
        previousHungerLevel: context.previousHungerLevel ?? null,
        previousHungerEventAt: context.previousHungerEventAt || null,
        minutesSinceLastHungerEvent: context.minutesSinceLastHungerEvent ?? null,
        todayMealCount: context.todayMealCount || 0,
        noIntakeToday: !!context.noIntakeToday,
        recentHungerEventCount6h: context.recentHungerEventCount6h || 0,
        recentHighHungerCount6h: context.recentHighHungerCount6h || 0,
        repeatedHighHungerToday: !!context.repeatedHighHungerToday,
        checkpointAttemptCount: context.checkpointAttemptCount || 0
      },
      decision,
      display: {
        status: getDisplayStatus(decision),
        action: ACTION_COPY[decision.suggestedAction] || decision.suggestedAction,
        foodBand: decision.foodBandKcal || null,
        riskLevel: decision.riskBudget?.level || null,
        foodSupportLevel: decision.foodPriority?.level || null,
        drivers,
        nextBestAction
      },
      contextQuality: {
        mealData: context.hasMealData ? 'last_meal_found' : 'last_meal_missing',
        trendFreshness: input.hungerTrend === 'unknown' ? 'not_fresh_or_missing' : 'fresh',
        noIntakeToday: !!context.noIntakeToday
      },
      decisionAudit: buildDecisionAudit(decision),
      hungerVelocity,
      mealGapRiskCurve,
      decisionTrace,
      counterfactuals,
      outcomeLearning,
      nextBestAction,
      outcome: {
        requestedAfterMin: decision.recheckAfterMin || null,
        requestedWindowMin: decision.postFoodOutcomeAfterMin || null,
        userReported: null,
        userReportedAt: null
      }
    };
    log.patternCards = buildPatternCards({ input, context, decision, drivers, log });
    return log;
  }

  function formatSigned(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    return (n > 0 ? '+' : '') + n;
  }

  function DebugSummary({ result }) {
    const log = result?.log || {};
    const velocity = log.hungerVelocity || {};
    const curve = log.mealGapRiskCurve || {};
    const learning = log.outcomeLearning || {};
    const audit = log.decisionAudit || {};
    const eventMeta = log.eventMeta || {};
    const trace = safeArray(log.decisionTrace).slice(0, 5);
    const counterfactuals = safeArray(log.counterfactuals).slice(0, 3);
    return h('div', { className: 'hes-debug-summary' },
      h('div', { className: 'hes-debug-grid' },
        h('div', null,
          h('span', null, 'Скорость'),
          h('strong', null, velocity.delta == null
            ? 'нет свежей пары'
            : formatSigned(velocity.delta) + ' за ' + velocity.minutes + ' мин')
        ),
        h('div', null,
          h('span', null, 'Промежуток'),
          h('strong', null, curve.hoursSinceMeal == null ? 'нет данных' : curve.hoursSinceMeal + ' ч')
        ),
        h('div', null,
          h('span', null, 'Личная модель'),
          h('strong', null, learning.learnedEnough ? learning.profileHint : (learning.sampleSize || 0) + '/6 исходов')
        ),
        h('div', null,
          h('span', null, 'Гейты'),
          h('strong', null, (audit.consistency || 'ok') + ' / ' + (audit.delayAllowed ? 'delay' : 'no-delay'))
        ),
        h('div', null,
          h('span', null, 'Событие'),
          h('strong', null, eventMeta.id ? (eventMeta.syncStatus || 'queued') + ' / ' + eventMeta.id : 'ещё нет')
        )
      ),
      trace.length > 0 && h('div', { className: 'hes-debug-list' },
        h('span', { className: 'hes-debug-list__title' }, 'Что двигало решение'),
        trace.map((row) => h('div', { key: row.factor, className: 'hes-debug-row' },
          h('span', null, row.label || row.factor),
          h('strong', null, 'risk ' + formatSigned(row.riskDelta) + ' / food ' + formatSigned(row.foodDelta))
        ))
      ),
      counterfactuals.length > 0 && h('div', { className: 'hes-debug-list' },
        h('span', { className: 'hes-debug-list__title' }, 'Что если'),
        counterfactuals.map((row) => h('div', { key: row.id, className: 'hes-debug-row' },
          h('span', null, row.label),
          h('strong', null, row.suggestedAction + ' / ' + row.foodSupportLevel)
        ))
      )
    );
  }

  function ModalShell() {
    const [state, setState] = React.useState(null);
    const [draft, setDraft] = React.useState(() => ({ ...DEFAULT_DRAFT, _openId: 0 }));
    const [contextPatch, setContextPatch] = React.useState({});
    const [result, setResult] = React.useState(null);
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const [copyDone, setCopyDone] = React.useState(false);
    const [isDragging, setIsDragging] = React.useState(false);
    const [outcomeSaved, setOutcomeSaved] = React.useState(null);
    const [autoOpenEnabled, setAutoOpenEnabledState] = React.useState(() => readAutoOpenEnabled());
    const [contextRefreshSeq, setContextRefreshSeq] = React.useState(0);
    const [editTarget, setEditTarget] = React.useState(null);
    setModalState = setState;

    React.useEffect(() => {
      if (!state) return undefined;
      document.body.classList.add('hunger-energy-modal-open');
      setDraft({ ...(state._initialDraft || getInitialDraftForState(state)), _openId: state._openId || 0 });
      setContextPatch({});
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setIsDragging(false);
      setOutcomeSaved(null);
      setAutoOpenEnabledState(readAutoOpenEnabled());
      setContextRefreshSeq(0);
      setEditTarget(null);
      return () => document.body.classList.remove('hunger-energy-modal-open');
    }, [state]);

    React.useEffect(() => {
      if (!state) return undefined;
      const refresh = () => setContextRefreshSeq((seq) => seq + 1);
      const timers = [60, 250, 900].map((delay) => setTimeout(refresh, delay));
      const onProgress = (event) => {
        if (!event?.detail?.phase || event.detail.phase === 'ready') refresh();
      };
      global.addEventListener?.('heysSyncCompleted', refresh);
      global.addEventListener?.('heys:client-changed', refresh);
      global.addEventListener?.('heys:hunger-energy-status-updated', refresh);
      global.addEventListener?.('heys:progress', onProgress);
      return () => {
        timers.forEach((timer) => clearTimeout(timer));
        global.removeEventListener?.('heysSyncCompleted', refresh);
        global.removeEventListener?.('heys:client-changed', refresh);
        global.removeEventListener?.('heys:hunger-energy-status-updated', refresh);
        global.removeEventListener?.('heys:progress', onProgress);
      };
    }, [state?._openId]);

    React.useEffect(() => {
      const refreshAutoOpen = () => setAutoOpenEnabledState(readAutoOpenEnabled());
      const handleProfileUpdated = (event) => {
        const fields = safeArray(event?.detail?.fields);
        const field = event?.detail?.field;
        if (fields.length > 0 && !fields.includes(AUTO_OPEN_PROFILE_FIELD)) return;
        if (field && field !== AUTO_OPEN_PROFILE_FIELD) return;
        refreshAutoOpen();
      };
      global.addEventListener?.('heys:profile-updated', handleProfileUpdated);
      global.addEventListener?.('heys:client-changed', refreshAutoOpen);
      return () => {
        global.removeEventListener?.('heys:profile-updated', handleProfileUpdated);
        global.removeEventListener?.('heys:client-changed', refreshAutoOpen);
      };
    }, []);

    if (!state) return null;

    const stateOpenId = state._openId || 0;
    const activeDraft = draft?._openId === stateOpenId
      ? draft
      : { ...(state._initialDraft || DEFAULT_DRAFT), _openId: stateOpenId };
    const timelineDay = resolveDayData({ ...state, _contextRefreshSeq: contextRefreshSeq });
    const timelineDate = state.date || timelineDay.date || todayKey();
    const baseContext = buildContextFromDay({ ...state, date: timelineDate, day: timelineDay });
    const context = { ...baseContext, ...contextPatch };
    const input = {
      now: nowIso(),
      hungerLevel: activeDraft.hungerLevel,
      controlLevel: activeDraft.controlLevel,
      cravingLevel: activeDraft.cravingLevel,
      hungerTrend: resolveHungerTrend(activeDraft.hungerLevel, context),
      safetyFlags: activeDraft.safetyFlags
    };
    const previewDecision = HEYS.HungerEnergyStatus.assessHungerEvent(input, context);
    const isEditingEvent = !!editTarget?.id;
    const requiredInputs = isDragging || isEditingEvent ? [] : getRequiredInputs(previewDecision, activeDraft);
    const hasRequiredInputs = requiredInputs.length > 0;
    const activeDecision = result?.decision || previewDecision;
    const modalMode = result ? (activeDecision.hardOverride ? 'safetyStop' : activeDecision.delayAllowed ? 'checkpoint' : 'foodRecommended') : 'input';
    const actionTone = getHungerTone(activeDraft.hungerVisual ?? activeDraft.hungerLevel);
    const hungerChangeNote = isEditingEvent
      ? 'Правка оценки ' + formatShortTime(editTarget.t)
      : getHungerChangeNote(activeDraft, context);
    const lastMealHint = getLastMealHint(context);

    function patchDraft(patch) {
      setDraft((prev) => ({
        ...((prev && prev._openId === stateOpenId) ? prev : activeDraft),
        ...patch,
        _openId: stateOpenId,
        contextPatch: undefined
      }));
      if (patch.contextPatch) setContextPatch((prev) => ({ ...prev, ...patch.contextPatch }));
    }

    function toggleAutoOpen() {
      const next = writeAutoOpenEnabled(!autoOpenEnabled);
      setAutoOpenEnabledState(next);
      const clientId = currentClientId();
      if (next && clientId) autoOpenShownClients.add(clientId);
    }

    function makeFinalInput() {
      return {
        ...input,
        safetyFlags: Array.isArray(activeDraft.safetyFlags) ? activeDraft.safetyFlags : []
      };
    }

    function startEditPoint(point) {
      if (!point?.id) return;
      const level = Math.max(1, Math.min(10, Math.round(Number(point.level) || DEFAULT_DRAFT.hungerLevel)));
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setOutcomeSaved(null);
      setContextPatch({});
      setEditTarget({
        id: point.id,
        t: point.t,
        recordedAt: point.recordedAt,
        originalLevel: level
      });
      setDraft({
        ...DEFAULT_DRAFT,
        hungerLevel: level,
        hungerVisual: level,
        _openId: stateOpenId
      });
    }

    function cancelEditPoint() {
      setEditTarget(null);
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextPatch({});
    }

    function saveEditedPoint() {
      if (!editTarget?.id) return;
      const level = Math.max(1, Math.min(10, Math.round(Number(activeDraft.hungerLevel) || DEFAULT_DRAFT.hungerLevel)));
      const editedAt = nowIso();
      updateEvent(editTarget.id, (row) => {
        const previousLevel = Number(row.hungerLevel ?? row.input?.hungerLevel);
        return {
          hungerLevel: level,
          hungerStatus: HUNGER_STATUS_COPY[level] || null,
          input: {
            ...(row.input || {}),
            hungerLevel: level
          },
          editHistory: safeArray(row.editHistory).concat({
            at: editedAt,
            field: 'hungerLevel',
            from: Number.isFinite(previousLevel) ? Math.round(previousLevel) : null,
            to: level
          }).slice(-8),
          editedAt,
          updatedAt: editedAt
        };
      });
      setEditTarget(null);
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextRefreshSeq((seq) => seq + 1);
    }

    function fixHunger() {
      if (hasRequiredInputs) return;
      const finalInput = makeFinalInput();
      const decision = HEYS.HungerEnergyStatus.assessHungerEvent(finalInput, context);
      const drivers = getDisplayDrivers(decision, finalInput, context);
      const log = buildDecisionLog({
        source: state.source || 'hunger-fab',
        input: finalInput,
        context,
        decision,
        drivers
      });
      const eventRow = addEvent({
        eventType: 'hunger_fixed',
        recordedAt: finalInput.now,
        date: String(finalInput.now || nowIso()).slice(0, 10),
        source: state.source || 'hunger-fab',
        hungerLevel: finalInput.hungerLevel,
        hungerStatus: HUNGER_STATUS_COPY[finalInput.hungerLevel] || null,
        input: finalInput,
        context: {
          lastMealAt: context.lastMealAt || null,
          hoursSinceMeal: context.hoursSinceMeal || null,
          todayMealCount: context.todayMealCount || 0,
          noIntakeToday: !!context.noIntakeToday,
          previousHungerLevel: context.previousHungerLevel ?? null,
          previousHungerEventAt: context.previousHungerEventAt || null,
          minutesSinceLastHungerEvent: context.minutesSinceLastHungerEvent ?? null,
          sleepQuality: context.sleepQuality || null,
          stressLevel: context.stressLevel || null,
          knownReboundPattern: !!context.knownReboundPattern,
          failedDelayHistory: !!context.failedDelayHistory,
          successfulWaitHistory: !!context.successfulWaitHistory,
          personalHungerModel: context.personalHungerModel || null,
          personalLearningApplied: context.personalLearningApplied || null
        },
        decision: compactDecision(decision),
        decisionSnapshot: compactDecision(decision),
        hungerVelocity: log.hungerVelocity,
        mealGapRiskCurve: log.mealGapRiskCurve,
        decisionTrace: log.decisionTrace,
        counterfactuals: log.counterfactuals,
        outcomeLearning: log.outcomeLearning,
        nextBestAction: log.nextBestAction,
        patternCards: log.patternCards,
        outcomePlan: log.outcome,
        followUpAfterMin: decision.recheckAfterMin || null,
        followUpQuestion: getFollowUpQuestion(decision),
        cloudSyncKey: STORAGE_KEY,
        outcome: 'calculated'
      });
      log.eventMeta = {
        id: eventRow.id,
        schemaVersion: eventRow.schemaVersion,
        storageKey: eventRow.storageKey,
        cloudSyncKey: eventRow.cloudSyncKey,
        syncStatus: eventRow.syncStatus,
        clientId: eventRow.clientId,
        recordedAt: eventRow.recordedAt,
        updatedAt: eventRow.updatedAt
      };
      setResult({ input: finalInput, context, decision, drivers, log, eventId: eventRow.id });
      setDetailsOpen(false);
      setCopyDone(false);
      setOutcomeSaved(null);
    }

    function resetInput() {
      setDraft({ ...getInitialDraftForState(state), _openId: stateOpenId });
      setContextPatch({});
      setResult(null);
      setDetailsOpen(false);
      setCopyDone(false);
      setOutcomeSaved(null);
      setEditTarget(null);
    }

    function recordOutcome(outcome) {
      if (!result?.eventId) return;
      const outcomeAt = nowIso();
      const rows = readEvents();
      const next = rows.map((row) => row.id === result.eventId ? {
        ...row,
        outcome,
        outcomeAt,
        updatedAt: outcomeAt,
        syncStatus: 'queued',
        outcomeEventId: (row.outcomeEventId || row.id) + ':' + outcomeAt,
        outcomePlan: {
          ...(row.outcomePlan || {}),
          userReported: outcome,
          userReportedAt: outcomeAt
        }
      } : row);
      writeEvents(next);
      setResult((prev) => prev ? {
        ...prev,
        log: {
          ...(prev.log || {}),
          outcome: {
            ...(prev.log?.outcome || {}),
            userReported: outcome,
            userReportedAt: outcomeAt
          },
          eventMeta: {
            ...(prev.log?.eventMeta || {}),
            syncStatus: 'queued',
            updatedAt: outcomeAt,
            outcomeEventId: (prev.log?.eventMeta?.outcomeEventId || prev.eventId) + ':' + outcomeAt
          }
        }
      } : prev);
      setOutcomeSaved(outcome);
    }

    async function copyLog() {
      const text = JSON.stringify(result?.log || {}, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        setCopyDone(true);
      } catch (_) {
        setCopyDone(false);
      }
    }

    return h('div', { className: 'hes-backdrop', onClick: () => hide() },
      h('section', {
        className: 'hes-sheet hes-sheet--' + modalMode,
        role: 'dialog',
        'aria-label': 'Осознанность и баланс энергообмена',
        style: {
          '--hes-action-color': actionTone.action,
          '--hes-action-color-deep': actionTone.actionDeep,
          '--hes-action-shadow': actionTone.actionShadow
        },
        onClick: (e) => e.stopPropagation()
      },
        h('header', { className: 'hes-head' },
          h('div', null,
            h('div', { className: 'hes-kicker' }, 'Баланс энергообмена'),
            result && h('h3', null, 'Рекомендация')
          ),
          h('div', { className: 'hes-head__actions' },
            h('label', { className: 'hes-auto-toggle' },
              h('span', { className: 'hes-auto-toggle__text' }, 'При входе'),
              h('input', {
                type: 'checkbox',
                checked: autoOpenEnabled,
                onChange: toggleAutoOpen,
                'aria-label': 'Показывать оценку голода при входе'
              }),
              h('span', { className: 'hes-auto-toggle__switch', 'aria-hidden': 'true' })
            ),
            h('button', { className: 'hes-close', type: 'button', onClick: () => hide(), 'aria-label': 'Закрыть' }, 'x')
          )
        ),
        !result ? h('div', { className: 'hes-input' },
          h(HungerSlider, {
            value: activeDraft.hungerVisual ?? activeDraft.hungerLevel,
            changeNote: hungerChangeNote,
            onPreview: (value) => setDraft((prev) => ({
              ...((prev && prev._openId === stateOpenId) ? prev : activeDraft),
              hungerVisual: value,
              _openId: stateOpenId
            })),
            onCommit: (value) => patchDraft({
              hungerVisual: value,
              hungerLevel: Math.max(1, Math.min(10, Math.round(value)))
            }),
            onDragStart: () => setIsDragging(true),
            onDragEnd: () => setIsDragging(false)
          }),
          h(MissingPrompt, {
            missingInputs: isDragging ? [] : requiredInputs,
            onPatch: patchDraft
          }),
          isEditingEvent && h('div', { className: 'hes-edit-note' },
            h('strong', null, 'Редактируется прошлая точка'),
            h('span', null, 'Время записи останется прежним')
          ),
          h(TimelineSpark, {
            date: timelineDate,
            day: timelineDay,
            draft: activeDraft,
            hint: lastMealHint,
            editingEventId: editTarget?.id,
            onEditPoint: startEditPoint
          })
        ) : null,
        result ? h('div', { className: 'hes-result' },
          (hungerChangeNote || lastMealHint) && h('div', { className: 'hes-context-summary' },
            hungerChangeNote && h('span', null, hungerChangeNote),
            lastMealHint && h('span', null, lastMealHint)
          ),
          h('div', { className: 'hes-verdict' },
            h('div', { className: 'hes-verdict__top' },
              h('span', { className: 'hes-confidence' }, result.decision.confidence === 'high' ? 'уверенно' : result.decision.confidence === 'medium' ? 'средняя уверенность' : 'нужно уточнить')
            ),
            h('strong', { className: 'hes-verdict__title' }, getRecommendationTitle(result.decision)),
            h('span', { className: 'hes-verdict__detail' }, getRecommendationDetail(result.decision))
          ),
          result.log?.nextBestAction && h('div', { className: 'hes-next-action' },
            h('span', null, 'Следующий шаг'),
            h('strong', null, result.log.nextBestAction.title),
            h('em', null, result.log.nextBestAction.detail)
          ),
          h('div', { className: 'hes-reasons' },
            h('div', { className: 'hes-reasons__title' }, 'Почему'),
            getRecommendationReasons(result).map((reason) => h('span', { key: reason }, reason))
          ),
          safeArray(result.log?.patternCards).length > 0 && h('div', { className: 'hes-patterns' },
            h('div', { className: 'hes-patterns__title' }, 'Паттерн'),
            safeArray(result.log.patternCards).map((card) => h('div', { key: card.id, className: 'hes-pattern-card' },
              h('strong', null, card.title),
              h('span', null, card.detail)
            ))
          ),
          h('div', { className: 'hes-context' },
            h('div', { className: 'hes-context__title' }, 'Данные'),
            getContextBadges(result).map((badge) => h('span', { key: badge }, badge))
          ),
          (result.decision.delayAllowed || result.decision.postFoodOutcomeAfterMin) && h('div', { className: 'hes-outcome' },
            h('div', { className: 'hes-outcome__title' }, getOutcomeTitle(result.decision)),
            h('div', { className: 'hes-outcome__chips' },
              getOutcomeOptions(result.decision).map(([value, label]) => h('button', {
                key: value,
                type: 'button',
                className: outcomeSaved === value ? 'is-active' : '',
                onClick: () => recordOutcome(value)
              }, label))
            )
          ),
          h('button', {
            type: 'button',
            className: 'hes-details-toggle',
            onClick: () => setDetailsOpen((open) => !open)
          }, detailsOpen ? 'Скрыть подробности' : 'Подробнее'),
          detailsOpen && h('div', { className: 'hes-debug' },
            h('div', { className: 'hes-debug__top' },
              h('strong', null, 'Технический расчёт'),
              h('button', { type: 'button', onClick: copyLog }, copyDone ? 'Скопировано' : 'Скопировать лог')
            ),
            h(DebugSummary, { result }),
            h('pre', null, JSON.stringify(result.log, null, 2))
          )
        ) : null,
        h('footer', { className: 'hes-actions' },
          !result ? (isEditingEvent ? [
            h('button', {
              key: 'cancel-edit',
              type: 'button',
              className: 'hes-secondary',
              onClick: cancelEditPoint
            }, 'Отмена'),
            h('button', {
              key: 'save-edit',
              type: 'button',
              className: 'hes-primary',
              onClick: saveEditedPoint
            }, 'Сохранить правку')
          ] : h('button', {
            type: 'button',
            className: 'hes-primary',
            disabled: hasRequiredInputs,
            onClick: fixHunger
          }, hasRequiredInputs ? 'Ответь на уточнение' : 'Зафиксировать голод')) : [
            h('button', {
              key: 'again',
              type: 'button',
              className: 'hes-secondary',
              onClick: resetInput
            }, 'Новая оценка'),
            h('button', {
              key: 'done',
              type: 'button',
              className: 'hes-primary',
              onClick: () => hide()
            }, 'Готово')
          ]
        )
      )
    );
  }

  function ensureStyles() {
    if (document.getElementById('hunger-energy-status-style')) return;
    const style = document.createElement('style');
    style.id = 'hunger-energy-status-style';
    style.textContent = `
.fab-group .hunger-energy-fab{width:52px;height:52px;border-radius:50%;border:1px solid rgba(255,255,255,.42);background:linear-gradient(135deg,#74639a 0%,#5a4e80 100%);color:#fff;box-shadow:0 10px 22px rgba(90,78,128,.18),0 3px 8px rgba(116,99,154,.14),inset 0 1px 0 rgba(255,255,255,.28);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:22px;line-height:1;transition:transform .2s cubic-bezier(.34,1.42,.64,1),box-shadow .2s ease;touch-action:manipulation}
.fab-group .hunger-energy-fab:hover{transform:scale(1.04)}
.fab-group .hunger-energy-fab:active{transform:scale(.94)}
.hes-backdrop{position:fixed;inset:0;z-index:3000;background:rgba(15,23,42,.26);display:flex;align-items:flex-end;justify-content:flex-end;padding:16px;padding-bottom:calc(16px + env(safe-area-inset-bottom,0px))}
.hes-sheet{width:min(440px,calc(100vw - 24px));max-height:min(720px,calc(100dvh - 28px));overflow:auto;background:rgba(255,255,255,.98);color:#172033;border:1px solid rgba(67,69,135,.14);border-radius:18px;box-shadow:0 24px 64px rgba(15,23,42,.24);animation:hesIn .18s ease-out}
.hes-head{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:60px;padding:16px 16px 8px 18px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
.hes-head>div:first-child{min-width:0;display:flex;align-items:center;min-height:44px}
.hes-head__actions{display:flex;align-items:center;gap:8px;flex-shrink:0}
.hes-kicker{font-size:11px;font-weight:800;letter-spacing:.06em;line-height:1.15;text-transform:uppercase;color:#434587}
.hes-head h3{margin:2px 0 0;font-size:20px;line-height:1.15;color:#172033}
.hes-close{width:44px;height:44px;border:0;border-radius:12px;background:#f1f5f9;color:#475569;font-size:20px;cursor:pointer}
.hes-auto-toggle{min-height:36px;display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(67,69,135,.12);border-radius:999px;background:#f8fbff;color:#475569;padding:0 8px;cursor:pointer;user-select:none}
.hes-auto-toggle:focus-within{outline:2px solid rgba(67,69,135,.22);outline-offset:2px}
.hes-auto-toggle__text{font-size:11px;font-weight:850;line-height:1;white-space:nowrap}
.hes-auto-toggle input{position:absolute;opacity:0;pointer-events:none}
.hes-auto-toggle__switch{position:relative;width:34px;height:20px;border-radius:999px;background:#dbe3ef;box-shadow:inset 0 0 0 1px rgba(67,69,135,.1);transition:background-color .18s ease}
.hes-auto-toggle__switch::before{content:"";position:absolute;left:2px;top:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(15,23,42,.18);transition:transform .18s ease}
.hes-auto-toggle input:checked+.hes-auto-toggle__switch{background:#434587}
.hes-auto-toggle input:checked+.hes-auto-toggle__switch::before{transform:translateX(14px)}
.hes-slider{min-height:260px;border-radius:14px;background:#f8fbff;border:1px solid rgba(29,112,183,.12);padding:10px;display:grid;grid-template-columns:48px 1fr;grid-template-rows:auto 1fr;gap:8px;align-items:center}
.hes-slider__value{grid-column:1/-1;text-align:center;font-size:32px;font-weight:900;color:#434587;line-height:1}
.hes-slider__range{height:176px;width:44px;writing-mode:vertical-lr;direction:rtl;accent-color:#434587;justify-self:center}
.hes-slider__anchors{display:flex;flex-direction:column;gap:4px}
.hes-slider__anchors button{min-width:44px;min-height:30px;border:1px solid rgba(67,69,135,.18);border-radius:9px;background:#fff;color:#475569;font-weight:800}
.hes-slider__anchors button.is-active{background:#434587;color:#fff}
.hes-confidence{font-size:11px;font-weight:750;color:#64748b;white-space:nowrap}
.hes-drivers{display:flex;flex-wrap:wrap;gap:6px}
.hes-drivers span,.hes-chip{border:1px solid rgba(67,69,135,.14);border-radius:999px;background:#fff;color:#334155;font-size:12px;font-weight:750;padding:7px 10px}
.hes-prompt{border-radius:14px;background:#fff7ed;border:1px solid rgba(234,88,12,.16);padding:12px}
.hes-prompt__title{font-size:13px;font-weight:850;color:#7c2d12;margin-bottom:8px}
.hes-prompt__chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-chip{min-height:44px;cursor:pointer}
.hes-footnote{font-size:12px;line-height:1.35;color:#64748b}
.hes-actions{position:sticky;bottom:0;z-index:2;display:flex;gap:8px;justify-content:flex-end;padding:8px 16px 16px;background:rgba(255,255,255,.98);backdrop-filter:blur(10px)}
.hes-primary,.hes-secondary{min-height:56px;border-radius:13px;padding:0 16px;font-weight:850;cursor:pointer}
.hes-actions .hes-primary,.hes-actions .hes-secondary{min-height:60px;font-size:15px}
.hes-primary{border:0;background:linear-gradient(135deg,var(--hes-action-color,#434587),var(--hes-action-color-deep,#37396f));color:#fff;box-shadow:0 10px 24px var(--hes-action-shadow,rgba(67,69,135,.22))}
.hes-primary:disabled{opacity:.55;cursor:not-allowed}
.hes-secondary{border:1px solid rgba(67,69,135,.18);background:#fff;color:#434587}
body.hunger-energy-modal-open .fab-group{opacity:0;pointer-events:none;transform:translateY(10px) scale(.96)}
[data-theme="dark"] .hes-sheet{background:#111827;color:#f8fafc;border-color:rgba(226,236,242,.16)}
[data-theme="dark"] .hes-head{background:rgba(17,24,39,.98)}
[data-theme="dark"] .hes-actions{background:rgba(17,24,39,.98)}
[data-theme="dark"] .hes-head h3{color:#f8fafc}
[data-theme="dark"] .hes-close,[data-theme="dark"] .hes-slider,[data-theme="dark"] .hes-chip{background:#1f2937;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-auto-toggle{background:#1f2937;color:#cbd5e1;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-auto-toggle__switch{background:#334155;box-shadow:inset 0 0 0 1px rgba(226,236,242,.12)}
[data-theme="dark"] .hes-auto-toggle input:checked+.hes-auto-toggle__switch{background:#6366f1}
@keyframes hesIn{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
@media (max-width:520px){.hes-backdrop{padding:8px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}.hes-sheet{width:100%;max-height:calc(100dvh - 20px);border-radius:18px 18px 0 0}.hes-head{min-height:58px;padding:14px 12px 8px 14px}.hes-slider{grid-template-columns:42px 1fr;min-height:246px}.hes-slider__range{height:162px}.hes-actions{padding:0 12px 12px}.hes-primary,.hes-secondary{flex:1}}
.hes-input{padding:10px 18px 12px;display:flex;flex-direction:column;gap:12px;align-items:stretch}
.hes-input .hes-slider{min-height:0;border:0;background:transparent;padding:6px 2px 2px;display:grid;grid-template-columns:1fr 68px 1fr;grid-template-rows:auto auto auto auto;column-gap:0;row-gap:7px;align-items:center;justify-content:center}
.hes-slider__value{grid-column:1/-1;grid-row:1;font-size:58px;font-weight:900;color:#434587;line-height:.92;text-align:center}
.hes-slider__status{grid-column:1/-1;grid-row:2;text-align:center;font-size:15px;font-weight:850;line-height:1.2;color:#475569}
.hes-slider__change{grid-column:1/-1;grid-row:3;justify-self:center;max-width:270px;border:1px solid rgba(67,69,135,.1);border-radius:999px;background:rgba(248,251,255,.82);color:#64748b;font-size:11px;font-weight:850;line-height:1.25;text-align:center;padding:5px 9px}
.hes-slider__control{grid-column:2;grid-row:4;position:relative;width:68px;height:205px;justify-self:center;margin-top:18px}
.hes-slider__track{position:absolute;inset:0}
.hes-slider__track::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:4px;transform:translateX(-50%);border-radius:999px;background:rgba(67,69,135,.10)}
.hes-slider__fill{position:absolute;left:0;bottom:0;width:100%;height:var(--hes-fill-px,102px);border-radius:999px;background:linear-gradient(180deg,var(--hes-fill-color-soft,#6b75a4) 0%,var(--hes-fill-color,#434587) 100%)}
.hes-slider__thumb{position:absolute;left:50%;bottom:calc(var(--hes-fill-px,102px) - 23px);width:46px;height:46px;transform:translateX(-50%);border-radius:50%;background:linear-gradient(135deg,var(--hes-fill-color-soft,#6b75a4),var(--hes-fill-color,#434587));border:5px solid #fff;box-shadow:0 8px 22px var(--hes-fill-shadow,rgba(67,69,135,.28))}
.hes-slider__range{position:absolute;left:50%;top:-23px;height:251px;width:68px;transform:translateX(-50%);writing-mode:vertical-lr;direction:rtl;opacity:0;cursor:pointer;touch-action:none}
.hes-prompt{height:112px;min-height:112px;box-sizing:border-box;border-radius:16px;background:#fff7ed;border:1px solid rgba(234,88,12,.16);padding:11px;opacity:1;transition:opacity .22s ease,background-color .22s ease,border-color .22s ease}
.hes-prompt.is-empty{opacity:0;background:transparent;border-color:transparent;pointer-events:none}
.hes-prompt.is-visible{opacity:1}
.hes-prompt__title{font-size:14px;font-weight:850;line-height:1.25;color:#7c2d12;margin-bottom:8px}
.hes-chip{min-height:52px;border-radius:14px;font-size:13px}
.hes-spark{height:108px;box-sizing:border-box;position:relative;border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#f8fbff;padding:7px 10px 8px}
.hes-spark__svg{display:block;width:100%;height:100%;overflow:visible}
.hes-spark__night{fill:#172033;opacity:.09}
.hes-spark__axis{stroke:#e3ebf6;stroke-width:2;stroke-linecap:round}
.hes-spark__tick line{stroke:#c8d5e6;stroke-width:1;stroke-linecap:round}
.hes-spark__tick text{fill:#94a3b8;font-size:8px;font-weight:800}
.hes-spark__line{fill:none;stroke:#434587;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;opacity:.9}
.hes-spark__point{fill:#434587;stroke:#fff;stroke-width:2.4}
.hes-spark__point--preview{fill:#ffffff;stroke:#434587;stroke-width:3}
.hes-spark__point-button{cursor:pointer;outline:none}
.hes-spark__point-button:focus-visible .hes-spark__point{stroke:#172033;stroke-width:3.4}
.hes-spark__point.is-editing{stroke:#434587;stroke-width:3.4}
.hes-spark__point-hit{fill:transparent;stroke:transparent;pointer-events:all}
.hes-spark__meal-line{stroke:#f08a74;stroke-width:2;stroke-linecap:round;stroke-dasharray:3 5;opacity:.58}
.hes-spark__legend{position:absolute;left:10px;right:10px;top:7px;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:16px;font-size:10px;font-weight:800;color:#64748b;pointer-events:none}
.hes-spark__legend-items,.hes-spark__hint{display:inline-flex;align-items:center;gap:8px;border-radius:999px;background:rgba(248,251,255,.78);padding:2px 6px;backdrop-filter:blur(6px)}
.hes-spark__legend span{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.hes-spark__legend-dot{width:6px;height:6px;border-radius:999px;display:inline-block}
.hes-spark__legend-dot--hunger{background:#434587}
.hes-spark__legend-line{width:10px;height:12px;display:inline-block;position:relative}
.hes-spark__legend-line::before{content:"";position:absolute;left:4px;top:0;bottom:0;border-left:2px dashed #f08a74;border-radius:999px;opacity:.82}
.hes-spark__muted{margin-left:auto;color:#94a3b8;font-weight:750}
.hes-spark__hint{margin-left:auto;max-width:150px;overflow:hidden;text-overflow:ellipsis;color:#64748b;font-size:10px;font-weight:850;line-height:1.2}
.hes-edit-note{border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#f8fbff;padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:10px;color:#64748b;font-size:11px;font-weight:800;line-height:1.25}
.hes-edit-note strong{color:#434587;font-size:12px}
.hes-edit-note span{text-align:right}
.hes-result{padding:10px 18px 132px;display:flex;flex-direction:column;gap:12px}
.hes-context-summary{border:1px solid rgba(67,69,135,.1);border-radius:14px;background:#f8fbff;padding:9px 11px;display:flex;flex-direction:column;gap:4px;color:#475569;font-size:12px;font-weight:850;line-height:1.3}
.hes-verdict{border-radius:16px;background:#eef6ff;border:1px solid rgba(29,112,183,.14);padding:14px;display:flex;flex-direction:column;gap:7px}
.hes-verdict__top{display:flex;justify-content:flex-end;min-height:16px}
.hes-verdict__title{font-size:22px;line-height:1.12;color:#172033}
.hes-verdict__detail{font-size:15px;line-height:1.35;color:#475569;font-weight:750}
.hes-next-action{border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#fff;padding:12px 14px;display:grid;gap:4px}
.hes-next-action span{font-size:12px;font-weight:850;color:#64748b}
.hes-next-action strong{font-size:16px;line-height:1.2;color:#172033}
.hes-next-action em{font-style:normal;font-size:13px;line-height:1.3;color:#475569;font-weight:750}
.hes-reasons{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:12px;display:flex;flex-wrap:wrap;gap:8px}
.hes-reasons__title{width:100%;font-size:12px;font-weight:850;color:#64748b}
.hes-reasons span{border:1px solid rgba(67,69,135,.12);border-radius:999px;background:#f8fafc;color:#334155;font-size:12px;font-weight:800;padding:7px 10px}
.hes-patterns{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-patterns__title{grid-column:1/-1;font-size:12px;font-weight:850;color:#64748b}
.hes-pattern-card{border-radius:12px;background:#f8fbff;border:1px solid rgba(29,112,183,.1);padding:9px;display:grid;gap:3px;min-width:0}
.hes-pattern-card strong{font-size:13px;line-height:1.15;color:#172033}
.hes-pattern-card span{font-size:11px;line-height:1.25;color:#64748b;font-weight:750}
.hes-context{border:1px solid rgba(15,23,42,.08);border-radius:16px;background:#fff;padding:10px 12px;display:flex;flex-wrap:wrap;gap:7px}
.hes-context__title{width:100%;font-size:12px;font-weight:850;color:#64748b}
.hes-context span{border-radius:999px;background:#eef6ff;color:#475569;font-size:11px;font-weight:800;padding:6px 9px}
.hes-outcome{border:1px solid rgba(67,69,135,.12);border-radius:16px;background:#fbfcff;padding:12px}
.hes-outcome__title{font-size:12px;font-weight:850;color:#64748b;margin-bottom:8px}
.hes-outcome__chips{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-outcome__chips button{min-height:38px;border:1px solid rgba(67,69,135,.14);border-radius:12px;background:#fff;color:#334155;font-size:12px;font-weight:850;cursor:pointer}
.hes-outcome__chips button.is-active{background:#434587;color:#fff;border-color:#434587}
.hes-details-toggle{min-height:42px;border:1px solid rgba(67,69,135,.18);border-radius:12px;background:#fff;color:#434587;font-weight:850;cursor:pointer}
.hes-debug{border:1px solid rgba(15,23,42,.1);border-radius:14px;background:#f8fafc;overflow:hidden;margin-bottom:18px}
.hes-debug__top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(15,23,42,.08)}
.hes-debug__top strong{font-size:13px;line-height:1.2}
.hes-debug__top button{min-height:32px;border:0;border-radius:10px;background:#434587;color:#fff;font-weight:800;font-size:12px;padding:0 10px;white-space:nowrap}
.hes-debug-summary{padding:12px;border-bottom:1px solid rgba(15,23,42,.08);display:flex;flex-direction:column;gap:10px}
.hes-debug-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.hes-debug-grid>div{border:1px solid rgba(67,69,135,.1);border-radius:12px;background:#fff;padding:9px}
.hes-debug-grid span,.hes-debug-list__title{display:block;font-size:11px;font-weight:850;color:#64748b;margin-bottom:4px}
.hes-debug-grid strong{display:block;font-size:13px;color:#172033}
.hes-debug-list{display:flex;flex-direction:column;gap:6px}
.hes-debug-row{display:flex;justify-content:space-between;gap:10px;align-items:center;border-radius:10px;background:#fff;padding:8px 9px;font-size:11px;color:#475569}
.hes-debug-row strong{font-size:11px;color:#172033;white-space:nowrap}
.hes-debug pre{margin:0;padding:12px 12px 72px;max-height:220px;overflow:auto;font-size:11px;line-height:1.45;white-space:pre-wrap;color:#172033}
[data-theme="dark"] .hes-debug{background:#0f172a;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-debug pre{color:#e5e7eb}
[data-theme="dark"] .hes-debug-grid>div,[data-theme="dark"] .hes-debug-row{background:#111827;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-debug-grid strong,[data-theme="dark"] .hes-debug-row strong{color:#f8fafc}
[data-theme="dark"] .hes-details-toggle{background:#1f2937;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-verdict{background:#172033;border-color:rgba(82,160,216,.2)}
[data-theme="dark"] .hes-verdict__title{color:#f8fafc}
[data-theme="dark"] .hes-next-action,[data-theme="dark"] .hes-patterns{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-next-action strong,[data-theme="dark"] .hes-pattern-card strong{color:#f8fafc}
[data-theme="dark"] .hes-pattern-card{background:#111827;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-reasons{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-reasons span{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-context,[data-theme="dark"] .hes-outcome{background:#1f2937;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-context span,[data-theme="dark"] .hes-outcome__chips button{background:#111827;color:#e5e7eb;border-color:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-outcome__chips button.is-active{background:#434587;color:#fff;border-color:#434587}
[data-theme="dark"] .hes-spark{background:#172033;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-spark__axis{stroke:rgba(226,236,242,.14)}
[data-theme="dark"] .hes-spark__night{fill:#020617;opacity:.26}
[data-theme="dark"] .hes-spark__tick line{stroke:rgba(226,236,242,.18)}
[data-theme="dark"] .hes-spark__tick text{fill:#94a3b8}
[data-theme="dark"] .hes-spark__point-button:focus-visible .hes-spark__point{stroke:#f8fafc}
[data-theme="dark"] .hes-slider__track::before{background:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-slider__change,[data-theme="dark"] .hes-context-summary{background:#172033;color:#cbd5e1;border-color:rgba(226,236,242,.12)}
[data-theme="dark"] .hes-spark__hint{background:rgba(17,24,39,.82);color:#cbd5e1}
[data-theme="dark"] .hes-edit-note{background:#172033;border-color:rgba(226,236,242,.12);color:#cbd5e1}
[data-theme="dark"] .hes-edit-note strong{color:#c7d2fe}
@keyframes hesFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:520px){.hes-input{padding:8px 14px 8px}.hes-result{padding:8px 14px 132px}.hes-input .hes-slider{grid-template-columns:1fr 68px 1fr}.hes-actions{padding:0 14px 14px}}
`;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    if (!React || !ReactDOM || !h) return false;
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'hunger-energy-status-modal-root';
      document.body.appendChild(modalRoot);
    }
    if (!modalRootInstance) {
      modalRootInstance = ReactDOM.createRoot(modalRoot);
      modalRootInstance.render(h(ModalShell));
    }
    ensureStyles();
    return true;
  }

  function show(options) {
    const clientId = HEYS.utils?.getCurrentClientId?.() || HEYS.currentClientId || '';
    if (!clientId) return false;
    const modalOptions = { ...(options || {}) };
    const seededOptions = {
      ...modalOptions,
      _openId: ++modalOpenSeq,
      _initialDraft: getInitialDraftForState(modalOptions)
    };
    if (!ensureRoot()) return false;
    if (HEYS.ModalManager) modalCleanup = HEYS.ModalManager.register('hunger-energy-status-modal', () => hide(true));
    const apply = () => {
      if (setModalState) setModalState(seededOptions);
      else setTimeout(apply, 16);
    };
    apply();
    return true;
  }

  function hide(skipManagerNotify) {
    if (modalCleanup && !skipManagerNotify) {
      modalCleanup();
      modalCleanup = null;
    }
    if (setModalState) setModalState(null);
  }

  function FabButton({ className = 'hunger-energy-fab', context = {}, ariaLabel = 'Открыть оценку голода' }) {
    return h('button', {
      className,
      type: 'button',
      onClick: () => show({ ...context, source: context.source || 'hunger-fab' }),
      'aria-label': ariaLabel
    }, h('span', { 'aria-hidden': 'true' }, '◒'));
  }

  HEYS.HungerEnergyStatusStorage = {
    readEvents,
    writeEvents,
    addEvent,
    updateEvent,
    buildHistorySignals
  };

  HEYS.HungerEnergyStatusAdapter = {
    buildContextFromDay,
    buildSparkTimeline,
    compactDecision
  };

  HEYS.HungerEnergyStatusModal = {
    show,
    hide,
    close: hide,
    FabButton,
    isAutoOpenEnabled: readAutoOpenEnabled,
    setAutoOpenEnabled: writeAutoOpenEnabled,
    scheduleAutoOpen
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { ensureRoot(); ensureStyles(); installAutoOpen(); });
    } else {
      setTimeout(() => { ensureRoot(); ensureStyles(); installAutoOpen(); }, 0);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
