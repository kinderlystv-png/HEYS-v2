// heys_morning_checkin_v1.js — Утренний чек-ин: вес, сон, шаги
// Показывается при открытии приложения, если сегодня не заполнен вес
// 
// === МИГРАЦИЯ НА МОДУЛЬНУЮ СИСТЕМУ ===
// Этот файл теперь использует HEYS.StepModal + HEYS.Steps
// Старый API (HEYS.MorningCheckin, HEYS.shouldShowMorningCheckin) сохранён для совместимости
//
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};

  // === Утилиты ===
  function isMorningActivationDebugEnabled() {
    try {
      return global.__heysLogControl?.isEnabled?.('morning-checkin') === true
        || global.__heysLogControl?.isEnabled?.('ma') === true
        || global.localStorage?.getItem('heys_debug_ma') === '1'
        || global.localStorage?.getItem('heys_debug_morning_checkin') === '1';
    } catch (_) {
      return false;
    }
  }

  function logMorningActivationTrace(...args) {
    if (isMorningActivationDebugEnabled()) console.info(...args);
  }

  function traceMorningActivationDecision(event, payload = {}, level = 'info') {
    try {
      const clientId = getCurrentClientId();
      const body = {
        event,
        source: 'heys_morning_checkin_v1',
        client: String(clientId || '').slice(0, 8) || null,
        ...payload
      };
      if (!body.flowId && HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function') {
        body.flowId = HEYS.LogTrace.makeFlowId('morning-activation');
      }
      if (HEYS.LogTrace && typeof HEYS.LogTrace.trace === 'function') {
        HEYS.LogTrace.trace(level, '[HEYS.ma.trace]', body);
      } else if (isMorningActivationDebugEnabled()) {
        (level === 'warn' ? console.warn : console.info)('[HEYS.ma.trace]', body);
      }
    } catch (_) {
      // Trace must never affect morning activation.
    }
  }

  function getTodayKey() {
    // Используем «эффективную» дату: до 03:00 считаем, что день ещё предыдущий
    // Приоритет: dayUtils.todayISO (учитывает ночной порог) → models.todayISO → локальный fallback
    const dayUtils = HEYS.dayUtils || {};
    if (typeof dayUtils.todayISO === 'function') return dayUtils.todayISO();
    if (HEYS.models && typeof HEYS.models.todayISO === 'function') return HEYS.models.todayISO();

    // Fallback без зависимостей
    const d = new Date();
    if (d.getHours() < 3) {
      d.setDate(d.getDate() - 1);
    }
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function readStoredValue(key, fallback = null) {
    if (HEYS.store?.readSafe) return HEYS.store.readSafe(key, fallback);
    // Минимальный fallback на случай вызова до загрузки storage layer.
    try {
      const v = HEYS.utils?.lsGet?.(key, fallback);
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  }

  // 🔧 Force-raw профиль из scoped LS, минуя HEYS.store memory cache.
  // Cache в Store.get имеет легаси-логику: если cache содержит null
  // (от предыдущего store.get(key, null)), последующие store.get(key, {})
  // возвращают def без чтения LS. Это нормально для большинства callers,
  // но в read-after-sync критичных местах (wizard trigger) даёт race.
  // Helper всегда читает raw localStorage с decompression — авторитетный
  // источник истины. Возвращает null если scoped/legacy LS пустые.
  function readProfileForceRawScoped(clientId) {
    if (!clientId) return null;
    const tryDecompress = (raw) => {
      if (!raw) return null;
      const fn = global.HEYS?.store?.decompress;
      try { return fn ? fn(raw) : JSON.parse(raw); } catch (_) { return null; }
    };
    // Профиль считается "валидным" ТОЛЬКО при наличии personal-полей.
    // Просто `Object.keys.length > 0` недостаточно: между Phase A моментами
    // scoped LS может содержать ТОЛЬКО subscription-поля (subscription_status,
    // trial_started_at, ...) без personal данных (см. diagnostic logs где
    // scopedKeys=4 subscription-only, scopedRawLen=171 vs позже 1192/12 fields).
    // Тот же критерий что в HOT-sync guard saveClientKey ~9893.
    const isProfileShape = (p) => p && typeof p === 'object' &&
      (p.age || p.weight || p.height || p.firstName || p.profileCompleted === true);
    const scopedParsed = tryDecompress(localStorage.getItem(`heys_${clientId}_profile`));
    if (isProfileShape(scopedParsed)) return scopedParsed;
    // Legacy unscoped fallback с STRICT ownership check (2026-06-01, tightened
    // after pollution incident 2026-05-31): возвращаем legacy heys_profile ТОЛЬКО
    // если _sourceClientId явно совпадает с currentClientId. Раньше "true legacy"
    // (без маркера) тоже проходил → courator-style сессии видели чужой профиль
    // и перезаписывали им scoped. Теперь без маркера → null (cloud re-fetch
    // подтянет правильный профиль в scoped LS на следующем sync).
    const legacyParsed = tryDecompress(localStorage.getItem('heys_profile'));
    if (!isProfileShape(legacyParsed)) return null;
    const legacyOwner = legacyParsed && legacyParsed._sourceClientId;
    if (legacyOwner !== clientId) return null; // require explicit match — no more "trusted legacy"
    return legacyParsed;
  }

  function getCurrentClientId() {
    const U = HEYS.utils || {};
    if (U.getCurrentClientId) return U.getCurrentClientId();
    return HEYS.currentClientId || '';
  }

  function getCheckinSessionKey(clientId, dateKey) {
    return `heys_morning_checkin_done_${clientId || 'unknown'}_${dateKey || 'unknown'}`;
  }

  function countMealsWithItems(dayData) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    return meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0).length;
  }

  function parseTimeToMinutes(time) {
    if (typeof time !== 'string') return null;
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  function getFirstMealTime(dayData) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    const withItems = meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0);
    if (!withItems.length) return null;
    const minutesList = withItems
      .map((meal) => parseTimeToMinutes(meal?.time))
      .filter((m) => Number.isFinite(m));
    if (minutesList.length) {
      const first = Math.min(...minutesList);
      const hh = String(Math.floor(first / 60)).padStart(2, '0');
      const mm = String(first % 60).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return null;
  }

  /** Согласовано с heys_steps_v1.js readDayData: сначала scoped dayv2, иначе legacy unscoped. */
  function readDayV2ScopedFirst(dateKey, fallback = {}, options = {}) {
    const cid = getCurrentClientId();
    if (cid) {
      const scopedKey = `heys_${cid}_dayv2_${dateKey}`;
      const scoped = readStoredValue(scopedKey, null);
      if (scoped && typeof scoped === 'object') return scoped;
      if (options && options.allowUnscopedFallback === false) return fallback;
    }
    return readStoredValue(`heys_dayv2_${dateKey}`, fallback) || fallback;
  }

  /** P0 guard pattern (см. heys_steps_v1.js:264 saveDayData):
   *  если scoped key есть — НЕ пишем unscoped. Unscoped — это global LS
   *  shared между всеми клиентами одного браузера. Раньше dual-write делал
   *  cross-client contamination когда курaтор работает с несколькими клиентами
   *  в одной сессии (incident 2026-05-29 21:16: Александра's dayv2 залились
   *  в Poplanton'a через unscoped legacy path). */
  function normalizeDayForDate(dateKey, dayData, sourceLabel) {
    const base = dayData && typeof dayData === 'object' ? dayData : {};
    if (base.date && dateKey && String(base.date) !== String(dateKey)) {
      console.warn(sourceLabel + ' ABORT: date mismatch', {
        dateKey,
        payloadDate: base.date,
        mealsCount: Array.isArray(base.meals) ? base.meals.length : 0
      });
      return null;
    }
    return base.date ? base : { ...base, date: dateKey };
  }

  function writeDayV2ScopedAndLegacy(dateKey, dayData) {
    const safeDayData = normalizeDayForDate(dateKey, dayData, '[HEYS.morning] writeDayV2Scoped');
    if (!safeDayData) return false;
    let valueToSave = safeDayData;
    try {
      if (HEYS.dayMutationGuard?.mergeProtectedFields) {
        const structuralFields = new Set([
          'date',
          'meals',
          'deletedMealIds',
          'deletedItemIds',
          'deletedMealItemIds',
          'updatedAt',
        ]);
        const fields = Object.keys(safeDayData).filter((field) => !structuralFields.has(field));
        if (fields.length) {
          const current = readDayV2ScopedFirst(dateKey, null, { allowUnscopedFallback: false })
            || readDayV2ScopedFirst(dateKey, null);
          const protectedResult = HEYS.dayMutationGuard.mergeProtectedFields(dateKey, safeDayData, current, fields, {
            action: 'morning-checkin-day-write',
          });
          if (protectedResult.blocked) return false;
          valueToSave = protectedResult.day || safeDayData;
        }
      }
    } catch (_) { /* guard diagnostics only */ }
    const cid = getCurrentClientId();
    if (cid) {
      const scopedKey = `heys_${cid}_dayv2_${dateKey}`;
      if (HEYS.store?.set) {
        HEYS.store.set(scopedKey, valueToSave);
      } else if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(scopedKey, valueToSave);
      }
      try {
        if (HEYS.dayCache && typeof HEYS.dayCache.notifyDateUpdated === 'function') {
          HEYS.dayCache.notifyDateUpdated(dateKey);
        }
      } catch (_) { /* ignore */ }
      return true;
    }
    // Fallback: нет clientId (редкий pre-auth case) — только тогда unscoped.
    const unscopedKey = `heys_dayv2_${dateKey}`;
    if (HEYS.store?.set) {
      HEYS.store.set(unscopedKey, valueToSave);
    } else if (HEYS.utils?.lsSet) {
      HEYS.utils.lsSet(unscopedKey, valueToSave);
    } else {
      try {
        localStorage.setItem(unscopedKey, JSON.stringify(valueToSave));
      } catch (_) {
        // Fallback storage is unavailable
      }
    }
    try {
      if (HEYS.dayCache && typeof HEYS.dayCache.notifyDateUpdated === 'function') {
        HEYS.dayCache.notifyDateUpdated(dateKey);
      }
    } catch (_) {
      // ignore
    }
    return true;
  }

  /** Как mergeDayMealsPreferLiveIfRicher в heys_steps_v1.js — не терять новый продукт в React перед патчем MA. */
  function mergeMealsPreferLiveIfRicher(dateKey, dayData) {
    const base = dayData && typeof dayData === 'object' ? dayData : {};
    try {
      const live = HEYS.Day?.getDay?.();
      if (!live || typeof live !== 'object') return base;
      const dk = String(base.date || dateKey || '');
      const lk = String(live.date || '');
      if (lk && dk && lk !== dk) return base;
      const countMealLines = (d) => (Array.isArray(d?.meals) ? d.meals : []).reduce((s, m) => {
        return s + (Array.isArray(m?.items) ? m.items.length : 0);
      }, 0);
      const lc = countMealLines(live);
      const bc = countMealLines(base);
      if (lc > bc && Array.isArray(live.meals)) {
        return { ...base, meals: live.meals };
      }
    } catch (_) {
      // ignore
    }
    return base;
  }

  function persistMorningActivationPatch(dateKey, patch, source = 'morning-activation') {
    try {
      if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        HEYS.Day.requestFlush({ force: true });
      }
    } catch (_) {
      // ignore
    }
    let dayData = readDayV2ScopedFirst(dateKey, {}) || {};
    dayData = mergeMealsPreferLiveIfRicher(dateKey, dayData);
    dayData.morningActivation = {
      ...(dayData.morningActivation || {}),
      ...patch
    };
    // 🛡️ Monotonic updatedAt (2026-06-01 STALE-WRITER incident): между нашим
    // readDayV2ScopedFirst выше и writeDayV2ScopedAndLegacy ниже параллельный
    // writer (step save / Day.requestFlush async tail) может записать в LS
    // более свежий updatedAt. Если мы поставим Date.now() и он окажется
    // <= того что уже в LS, stale-writer guard в LS interceptor отвергнет
    // запись и MA patch потеряется. Re-read LS прямо здесь + гарантия
    // updatedAt > свежайшего в LS закрывает race окно.
    let _latestInLs = readDayV2ScopedFirst(dateKey, null);
    const _latestUpdatedAt = (_latestInLs && typeof _latestInLs.updatedAt === 'number') ? _latestInLs.updatedAt : 0;
    dayData.updatedAt = Math.max(Date.now(), _latestUpdatedAt + 1);
    writeDayV2ScopedAndLegacy(dateKey, dayData);
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: {
        date: dateKey,
        field: 'morningActivation',
        source,
        forceReload: true,
        data: { ...dayData, date: dateKey }
      }
    }));
  }

  // Zone signatures that identify morning activation trainings
  // Mirrors MA_ZONE_SIGS + isMorningActivationTraining in heys_day_trainings_v1.js
  const MA_ZONE_SIGS = new Set(['8,0,0,0', '8,6,0,0', '4,8,8,2']);
  function maTrainingZoneSig(training) {
    const z = Array.isArray(training?.z) ? training.z : [];
    return [0, 1, 2, 3].map((i) => Number(z[i]) || 0).join(',');
  }

  function dayHasMorningActivationSyncedActivity(dayData) {
    const trainings = Array.isArray(dayData?.trainings) ? dayData.trainings : [];
    const foundTraining = trainings.find((t) => {
      if (!t) return false;
      if (t.source === 'morning_activation') return true;
      if (t.source === 'morning_activation_replacement') return true;
      const label = typeof t.activityLabel === 'string' ? t.activityLabel.trim().toLowerCase() : '';
      if (label === 'зарядка') return true;
      // Тренировка добавлена вручную через пикер: strength + zone-сигнатура зарядки + без кастомного названия
      if (String(t.type) === 'strength' && MA_ZONE_SIGS.has(maTrainingZoneSig(t))) {
        const raw = typeof t.activityLabel === 'string' ? t.activityLabel.trim() : '';
        if (!raw) return true;
      }
      return false;
    });
    if (foundTraining) {
      logMorningActivationTrace('[MA.guard] dayHasMorningActivationSyncedActivity=true via training', {
        source: foundTraining.source,
        activityLabel: foundTraining.activityLabel
      });
      return true;
    }
    const household = Array.isArray(dayData?.householdActivities) ? dayData.householdActivities : [];
    const foundHousehold = household.find((h) => h && h.source === 'morning_activation');
    if (foundHousehold) {
      logMorningActivationTrace('[MA.guard] dayHasMorningActivationSyncedActivity=true via household');
      return true;
    }
    logMorningActivationTrace('[MA.guard] dayHasMorningActivationSyncedActivity=false', {
      trainings: trainings.map(t => ({ source: t?.source, label: t?.activityLabel })),
      householdSources: household.map(h => h?.source)
    });
    return false;
  }

  function isMorningActivationClearedByUser(dayData) {
    const ma = dayData?.morningActivation;
    if (!ma || typeof ma !== 'object') return false;
    return ma.clearedByUser === true || Number(ma.clearedAt) > 0;
  }

  function shouldOpenMorningActivationFollowup(dayData) {
    const mealCount = countMealsWithItems(dayData);
    const hasMealsWithItems = mealCount > 0;
    const firstMealTime = getFirstMealTime(dayData);
    const maStatus = dayData?.morningActivation?.status;
    const snoozeAtRaw = dayData?.morningActivation?.followupSnoozeUntilMealCount;
    const snoozeAt = Number(snoozeAtRaw);
    const hasActiveSnooze = snoozeAtRaw != null && Number.isFinite(snoozeAt) && mealCount <= snoozeAt;
    const maClearedByUser = isMorningActivationClearedByUser(dayData);
    const hasSynced = dayHasMorningActivationSyncedActivity(dayData);
    const trainings = (dayData?.trainings || []).map(t => ({
      source: t?.source,
      label: t?.activityLabel,
      zSum: Array.isArray(t?.z) ? t.z.reduce((s, v) => s + (Number(v) || 0), 0) : 0
    }));
    logMorningActivationTrace('[MA.should] CHECK', {
      hasMealsWithItems,
      mealCount,
      maStatus,
      followupSnoozeUntilMealCount: snoozeAtRaw,
      maClearedByUser,
      hasSynced,
      trainings,
      household: (dayData?.householdActivities || []).map(h => ({ source: h?.source, label: h?.label }))
    });
    if (!hasMealsWithItems) {
      logMorningActivationTrace('[MA.should] SKIP — no meals with items');
      return { ok: false, firstMealTime: null };
    }
    if (hasActiveSnooze) {
      logMorningActivationTrace('[MA.should] SKIP — followup snoozed until next meal add', { mealCount, snoozeAt });
      return { ok: false, firstMealTime };
    }
    if (maStatus === 'missed') {
      logMorningActivationTrace('[MA.should] SKIP — morningActivation missed');
      return { ok: false, firstMealTime };
    }
    // status=done is authoritative. Reopen only after an explicit user-cleared marker,
    // not from transient absence of the generated training card.
    if (maStatus === 'done' && !maClearedByUser) {
      logMorningActivationTrace('[MA.should] SKIP — morningActivation done');
      return { ok: false, firstMealTime };
    }
    if (maStatus === 'done' && maClearedByUser && !hasSynced) {
      logMorningActivationTrace('[MA.should] CONTINUE — done, но пользователь явно удалил MA-карточку');
    }
    if (hasSynced) {
      logMorningActivationTrace('[MA.should] SKIP — synced MA-like activity in day');
      return { ok: false, firstMealTime };
    }
    logMorningActivationTrace('[MA.should] OPEN — нет MA-активности в дне, maStatus=', maStatus);
    return { ok: true, firstMealTime };
  }

  /** Снимок для followup: store + актуальный React-день (удаление карточки может быть ещё не в LS). */
  function readDayDataMergedForMaFollowup(todayKey) {
    let d = readDayV2ScopedFirst(todayKey, {}) || {};
    try {
      const live = HEYS.Day && typeof HEYS.Day.getDay === 'function' ? HEYS.Day.getDay() : null;
      const liveDate = live && (live.date || todayKey);
      if (!live || String(liveDate) !== String(todayKey)) {
        logMorningActivationTrace('[MA.followup] read: store only (no live day or date mismatch)', {
          todayKey,
          liveDate: live ? liveDate : null,
          mealsWithItems: countMealsWithItems(d),
          maStatus: d?.morningActivation?.status
        });
        return d;
      }
      const nLive = countMealsWithItems(live);
      const nStore = countMealsWithItems(d);
      const useLiveMeals = nLive >= nStore;
      const merged = {
        ...d,
        meals: useLiveMeals ? (live.meals || d.meals) : d.meals,
        trainings: Array.isArray(live.trainings) ? live.trainings : d.trainings,
        householdActivities: Array.isArray(live.householdActivities) ? live.householdActivities : d.householdActivities,
        morningActivation: d.morningActivation || live.morningActivation
      };
      logMorningActivationTrace('[MA.followup] read: merged store+live', {
        todayKey,
        mealsStore: nStore,
        mealsLive: nLive,
        useLiveMeals: useLiveMeals,
        maStatus: merged.morningActivation?.status,
        trainingsSlots: (merged.trainings || []).map((t, i) => ({
          i,
          zSum: Array.isArray(t?.z) ? t.z.reduce((s, v) => s + (Number(v) || 0), 0) : 0,
          source: t?.source,
          label: t?.activityLabel
        }))
      });
      return merged;
    } catch (e) {
      logMorningActivationTrace('[MA.followup] read: merge failed, store only', e && e.message);
      return d;
    }
  }

  let followupOpening = false;
  let skipReasonOpening = false;
  let lastMealSignalAt = 0;
  let morningActivationModalRoot = null;
  let morningActivationModalRootInstance = null;

  function isMainStepModalOpen() {
    try {
      return !!document.getElementById('heys-step-modal-root');
    } catch (_) {
      return false;
    }
  }

  function closeMorningActivationOverlay() {
    if (morningActivationModalRootInstance) {
      morningActivationModalRootInstance.unmount();
      morningActivationModalRootInstance = null;
    }
    if (morningActivationModalRoot && morningActivationModalRoot.parentNode) {
      morningActivationModalRoot.parentNode.removeChild(morningActivationModalRoot);
    }
    morningActivationModalRoot = null;
  }

  function showMorningActivationModal(options) {
    const shouldStackOverStepModal = isMainStepModalOpen();
    if (!shouldStackOverStepModal) {
      HEYS.StepModal.show(options);
      return true;
    }

    const ReactDOMRef = global.ReactDOM || window.ReactDOM;
    if (!HEYS.StepModal?.Component || !ReactDOMRef?.createRoot) {
      logMorningActivationTrace('[MA.modal] SKIP stacked modal — StepModal.Component/ReactDOM missing');
      return false;
    }
    if (morningActivationModalRoot) {
      logMorningActivationTrace('[MA.modal] SKIP stacked modal — already open');
      return false;
    }

    morningActivationModalRoot = document.createElement('div');
    morningActivationModalRoot.id = 'heys-morning-activation-modal-root';
    morningActivationModalRoot.style.position = 'relative';
    morningActivationModalRoot.style.zIndex = '10000';
    document.body.appendChild(morningActivationModalRoot);
    morningActivationModalRootInstance = ReactDOMRef.createRoot(morningActivationModalRoot);

    const handleClose = () => {
      closeMorningActivationOverlay();
      options.onClose?.();
    };
    const handleComplete = (data) => {
      closeMorningActivationOverlay();
      options.onComplete?.(data);
    };

    morningActivationModalRootInstance.render(React.createElement(HEYS.StepModal.Component, {
      ...options,
      onClose: handleClose,
      onComplete: handleComplete
    }));
    return true;
  }

  function maybeOpenMorningActivationSkipReason(trigger = 'unknown', dateKeyArg) {
    const _tag = '[MA.skipReason]';
    if (skipReasonOpening) {
      logMorningActivationTrace(_tag, 'SKIP: already opening', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, reason: 'already_opening' });
      return;
    }
    if (!HEYS.StepModal?.show) {
      logMorningActivationTrace(_tag, 'SKIP: no StepModal', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, reason: 'no_step_modal' }, 'warn');
      return;
    }
    if (!HEYS.StepModal?.registry?.morning_activation_skip_reason) {
      logMorningActivationTrace(_tag, 'SKIP: step not registered', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, reason: 'step_not_registered' }, 'warn');
      return;
    }

    const currentClientId = getCurrentClientId();
    if (!currentClientId) {
      logMorningActivationTrace(_tag, 'SKIP: no clientId', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, reason: 'no_client' }, 'warn');
      return;
    }

    const dateKey = (typeof dateKeyArg === 'string' && dateKeyArg) ? dateKeyArg : getTodayKey();
    const dayData = readDayDataMergedForMaFollowup(dateKey);
    const ma = dayData?.morningActivation || {};

    const mealCount = countMealsWithItems(dayData);
    if (ma.status !== 'missed') {
      logMorningActivationTrace(_tag, 'SKIP: not missed', { maStatus: ma.status, trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, dateKey, reason: 'not_missed', status: ma.status || null, mealCount });
      return;
    }
    if (!ma.skipReasonPending) {
      logMorningActivationTrace(_tag, 'SKIP: not pending reason', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, dateKey, reason: 'not_pending', status: ma.status || null, reasonId: ma.skipReasonId || null, mealCount });
      return;
    }
    if (ma.skipReasonId) {
      logMorningActivationTrace(_tag, 'SKIP: reason already set', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, dateKey, reason: 'reason_already_set', status: ma.status || null, reasonId: ma.skipReasonId, mealCount });
      return;
    }
    if (mealCount < 1) {
      logMorningActivationTrace(_tag, 'SKIP: no meals with items yet', { trigger });
      traceMorningActivationDecision('skip_reason_open_blocked', { trigger, dateKey, reason: 'no_meals', status: ma.status || null, mealCount });
      return;
    }

    const answeredKey = `heys_ma_skip_reason_answered_${currentClientId}_${dateKey}`;
    try {
      if (sessionStorage.getItem(answeredKey) === '1') {
        logMorningActivationTrace(_tag, 'SKIP: already answered session', { trigger });
        traceMorningActivationDecision('skip_reason_open_blocked', { trigger, dateKey, reason: 'answered_session', status: ma.status || null, mealCount });
        return;
      }
    } catch (_) {
      // ignore
    }

    logMorningActivationTrace(_tag, 'OPENING skip-reason modal', { trigger, dateKey });
    traceMorningActivationDecision('skip_reason_modal_open', {
      trigger,
      dateKey,
      status: ma.status || null,
      mealCount
    });
    skipReasonOpening = true;
    try {
      const opened = showMorningActivationModal({
        steps: ['morning_activation_skip_reason'],
        title: 'Зарядка',
        showProgress: false,
        showStreak: false,
        showGreeting: false,
        showTip: false,
        allowSwipe: false,
        context: { dateKey, reason: trigger },
        onClose: () => {
          skipReasonOpening = false;
        },
        onComplete: () => {
          try {
            sessionStorage.setItem(answeredKey, '1');
          } catch (_) {
            // ignore
          }
          skipReasonOpening = false;
        }
      });
      if (!opened) skipReasonOpening = false;
    } catch (e) {
      skipReasonOpening = false;
      console.warn(_tag, 'show failed', e);
    }
  }

  function maybeOpenMorningActivationFollowup(reason = 'unknown') {
    const _tag = '[MA.followup]';
    if (followupOpening) { logMorningActivationTrace(_tag, 'SKIP: followupOpening=true', { reason }); return; }
    if (!HEYS.StepModal?.show) { logMorningActivationTrace(_tag, 'SKIP: no StepModal.show', { reason }); return; }
    if (!HEYS.StepModal?.registry?.morning_activation_followup) { logMorningActivationTrace(_tag, 'SKIP: step not registered', { reason }); return; }

    const currentClientId = getCurrentClientId();
    if (!currentClientId) { logMorningActivationTrace(_tag, 'SKIP: no clientId', { reason }); return; }
    const todayKey = getTodayKey();
    const dayData = readDayDataMergedForMaFollowup(todayKey);
    const check = shouldOpenMorningActivationFollowup(dayData);

    const _maStatus = dayData?.morningActivation?.status;
    const _trainingSources = (dayData?.trainings || []).map(t => t?.source).filter(Boolean);
    logMorningActivationTrace(_tag, 'DECISION', {
      reason,
      ok: check.ok,
      maStatus: _maStatus,
      trainingSources: _trainingSources,
      firstMealTime: check.firstMealTime,
      mealsWithItems: countMealsWithItems(dayData),
      hasSyncedGuard: dayHasMorningActivationSyncedActivity(dayData)
    });

    if (!check.ok) return;

    const mealCount = countMealsWithItems(dayData);
    const followupSessionGuardKey = `heys_morning_activation_followup_guard_${currentClientId || 'unknown'}_${todayKey}`;
    const followupSessionGuardRaw = (() => {
      try {
        return sessionStorage.getItem(followupSessionGuardKey);
      } catch (_) {
        return null;
      }
    })();
    const followupSessionGuard = Number(followupSessionGuardRaw);
    if (Number.isFinite(followupSessionGuard) && mealCount <= followupSessionGuard) {
      const actualStatus = dayData?.morningActivation?.status;
      const clearedByUser = isMorningActivationClearedByUser(dayData);
      const syncedNow = dayHasMorningActivationSyncedActivity(dayData);
      const hasRealData = actualStatus === 'missed' || (actualStatus === 'done' && !clearedByUser) || syncedNow;
      if (hasRealData) {
        logMorningActivationTrace(_tag, 'GUARD: confirmed by data', { guard: followupSessionGuard, mealCount, actualStatus, clearedByUser, reason });
        return;
      }
      const userActionReasons = ['meal-flow-finished'];
      if (!userActionReasons.includes(reason)) {
        logMorningActivationTrace(_tag, 'GUARD: kept (not user action)', { guard: followupSessionGuard, mealCount, reason });
        return;
      }
      if (reason === 'meal-flow-finished') {
        const signalAgeMs = Date.now() - lastMealSignalAt;
        if (!(Number.isFinite(signalAgeMs) && signalAgeMs >= 0 && signalAgeMs <= 2500)) {
          logMorningActivationTrace(_tag, 'GUARD: kept (meal-flow-finished without recent meal signal)', {
            guard: followupSessionGuard,
            mealCount,
            signalAgeMs
          });
          return;
        }
      }
      console.warn(_tag, 'GUARD OVERRIDE: data missing, user action', { guard: followupSessionGuard, mealCount, actualStatus, reason });
      try { sessionStorage.removeItem(followupSessionGuardKey); } catch (_) { }
    }
    const snoozeAt = dayData?.morningActivation?.followupSnoozeUntilMealCount;
    if (snoozeAt != null && mealCount <= snoozeAt) {
      logMorningActivationTrace(_tag, 'SNOOZE: blocked', { mealCount, snoozeAt, reason });
      return;
    }

    logMorningActivationTrace(_tag, 'OPENING MODAL', { reason, mealCount, maStatus: _maStatus, firstMealTime: check.firstMealTime });

    const currentState = dayData?.morningActivation || {};
    if (currentState.status !== 'pending' || currentState.firstMealTime !== check.firstMealTime) {
      persistMorningActivationPatch(todayKey, {
        status: 'pending',
        firstMealTime: check.firstMealTime,
        clearedByUser: null,
        clearedAt: null
      }, 'morning-activation-followup-open');
    }

    followupOpening = true;
    try {
      sessionStorage.setItem(followupSessionGuardKey, String(mealCount));
    } catch (_) {
      // sessionStorage may be unavailable
    }
    const opened = showMorningActivationModal({
      steps: ['morning_activation_followup'],
      title: 'Утренняя зарядка',
      showProgress: false,
      showStreak: false,
      showGreeting: false,
      showTip: false,
      allowSwipe: false,
      context: { dateKey: todayKey, firstMealTime: check.firstMealTime, reason },
      onClose: () => {
        const fresh = readDayV2ScopedFirst(todayKey, {}) || {};
        const mc = Math.max(countMealsWithItems(fresh), mealCount || 0);
        const existingSnoozeAt = Number(fresh?.morningActivation?.followupSnoozeUntilMealCount);
        if (!(Number.isFinite(existingSnoozeAt) && existingSnoozeAt >= mc)) {
          persistMorningActivationPatch(todayKey, {
            followupSnoozeUntilMealCount: mc
          }, 'morning-activation-followup-dismiss');
        }
        logMorningActivationTrace('[MorningCheckin] morning activation follow-up dismissed (Позже) — repeat after next meal add', {
          mealCount: mc
        });
        try {
          sessionStorage.setItem(followupSessionGuardKey, String(mc));
        } catch (_) {
          // sessionStorage may be unavailable
        }
        followupOpening = false;
      },
      onComplete: () => {
        const _freshData = readDayV2ScopedFirst(todayKey, {}) || {};
        logMorningActivationTrace('[MA.followup] onComplete', {
          maStatus: _freshData?.morningActivation?.status,
          trainingSources: (_freshData?.trainings || []).map(t => t?.source).filter(Boolean),
          todayKey
        });
        persistMorningActivationPatch(todayKey, {
          followupSnoozeUntilMealCount: null
        }, 'morning-activation-followup-complete');
        try {
          sessionStorage.setItem(followupSessionGuardKey, String(Number.MAX_SAFE_INTEGER));
        } catch (_) {
          // sessionStorage may be unavailable
        }
        followupOpening = false;
      }
    });
    if (!opened) followupOpening = false;
  }

  function markMorningActivationFollowupCompleted(dateKey, source = 'morning-activation-followup-completed', eventDetail = {}) {
    const todayKey = getTodayKey();
    const effectiveDateKey = dateKey || todayKey;
    const currentClientId = getCurrentClientId();
    const dayData = readDayV2ScopedFirst(effectiveDateKey, {}) || {};
    const ma = dayData?.morningActivation || {};
    const hasTerminalState = ma.status === 'done' || ma.status === 'missed';
    const hasReplacement = ma.replacement === 'first_half_training'
      || (Array.isArray(dayData?.trainings) && dayData.trainings.some((t) => t?.source === 'morning_activation_replacement'));
    const hasTerminalEvent = eventDetail?.terminal === true;
    if (!hasTerminalState && !hasReplacement && !hasTerminalEvent) {
      logMorningActivationTrace('[MA.followup] completion event ignored — no terminal state', {
        dateKey: effectiveDateKey,
        status: ma.status,
        source
      });
      return;
    }

    closeMorningActivationOverlay();
    try {
      if (typeof HEYS.StepModal?.hide === 'function' && isMainStepModalOpen()) {
        HEYS.StepModal.hide({ scrollToDiary: false });
      }
    } catch (_) {
      // ignore close fallback errors
    }
    persistMorningActivationPatch(effectiveDateKey, {
      followupSnoozeUntilMealCount: null
    }, 'morning-activation-followup-complete');
    try {
      const mealCount = countMealsWithItems(dayData);
      const guardKey = `heys_morning_activation_followup_guard_${currentClientId || 'unknown'}_${effectiveDateKey}`;
      sessionStorage.setItem(guardKey, String(Number.MAX_SAFE_INTEGER));
      logMorningActivationTrace('[MA.followup] completed via event', {
        dateKey: effectiveDateKey,
        mealCount,
        status: ma.status,
        source
      });
    } catch (_) {
      // sessionStorage may be unavailable
    }
    followupOpening = false;
  }

  function debugDayStorage(todayKey, currentClientId, altKey) {
    // DEBUG функция закомментирована для чистоты консоли
    return;
    /* Original debug code:
    try {
      const ls = global.localStorage;
      if (!ls) return;
      const directKey = `heys_dayv2_${todayKey}`;
      const nsKey = currentClientId ? `heys_${currentClientId}_dayv2_${todayKey}` : '';
      const rawDirect = ls.getItem(directKey);
      const rawNs = nsKey ? ls.getItem(nsKey) : null;
      let parsedDirect = null;
      let parsedNs = null;
      try { parsedDirect = rawDirect ? JSON.parse(rawDirect) : null; } catch (_) {}
      try { parsedNs = rawNs ? JSON.parse(rawNs) : null; } catch (_) {}
      const candidates = [];
      for (let i = 0; i < ls.length; i++) {
        const k = ls.key(i);
        if (k && k.includes('_dayv2_')) {
          candidates.push(k);
        }
      }
      // 🔇 v4.8.2: Debug логи отключены — включить при необходимости
    } catch (e) {
      // не ломаем основной поток из-за debug
    }
    */
  }

  /**
   * Проверяем, нужно ли показывать утренний чек-ин
   * ВАЖНО: Эта функция вызывается ПОСЛЕ события heysSyncCompleted,
   * поэтому проверка isInitialSyncCompleted не нужна
   * 
   * КРИТИЧНО: Если профиль не заполнен — ВСЕГДА показываем чек-ин!
   * Это нужно чтобы новый пользователь обязательно прошёл регистрационные шаги.
   */
  // 🆕 TASK-003 follow-up: при переоткрытии чек-ина из-за пропавших/недокачанных
  // данных (session-флаг стоит, но core-поля дня отсутствуют) показываем ТОЛЬКО
  // недостающие обязательные шаги, без опционального хвоста (cold/supplements/routine)
  // и без повторного прогона уже заполненного. Флаг выставляет shouldShowMorningCheckin,
  // читает MorningCheckin при заморозке списка шагов. Сбрасывается в начале каждого
  // shouldShowMorningCheckin, чтобы не протекать в ручной showCheckin.morning().
  let _reopenRequiredOnly = false;
  let _nextPlanYesterdayVerifyRequired = null;

  function hasCheckinValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function hasPositiveCheckinNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }

  function hasSleepTime(day) {
    return hasCheckinValue(day?.sleepStart) && hasCheckinValue(day?.sleepEnd);
  }

  function hasCheckinWeight(day) {
    return hasPositiveCheckinNumber(day?.weightMorning);
  }

  function hasSleepQuality(day) {
    return hasPositiveCheckinNumber(day?.sleepQuality);
  }

  function hasMorningMood(day) {
    return hasPositiveCheckinNumber(day?.moodMorning);
  }

  function hasCycleDay(day) {
    const value = Number(day?.cycleDay);
    return Number.isFinite(value) && value >= 1 && value <= 7;
  }

  function hasCycleDecision(day, profile) {
    if (!profile || profile.gender !== 'Женский' || profile.cycleTrackingEnabled !== true) return true;
    if (hasCycleDay(day)) return true;
    return (day?.cycleStatus === 'none' || day?.cycleStatus === 'skipped') && hasPositiveCheckinNumber(day?.cycleAnsweredAt);
  }

  function hasStepsGoal(profile) {
    return hasPositiveCheckinNumber(profile?.stepsGoal);
  }

  function isYesterdayVerifyDecisionReady() {
    return HEYS.YesterdayVerifyReady === true
      && HEYS.YesterdayVerify
      && HEYS.YesterdayVerify.stepRegistered === true
      && typeof HEYS.YesterdayVerify.shouldShow === 'function';
  }

  function shouldShowYesterdayVerifyRequired() {
    if (!isYesterdayVerifyDecisionReady()) {
      HEYS._morningCheckinWaitingForYesterdayVerify = Date.now();
      console.info('[MorningCheckin] ℹ️ YesterdayVerify not ready — defer yesterday-step decision');
      return false;
    }
    return HEYS.YesterdayVerify.shouldShow();
  }

  function shouldIncludeRefeedStep(profile, dateKey = getTodayKey()) {
    try {
      if (HEYS.Refeed?.shouldShowRefeedStep?.() !== true) return false;

      const day = readDayV2ScopedFirst(dateKey, {}) || {};
      if (typeof day?.isRefeedDay === 'boolean') return false;

      const effectiveProfile = profile || getFreshMorningProfile(getCurrentClientId()) || {};
      const hasRecommendation = HEYS.caloricDebt?.needsRefeed === true;
      const allowManual = effectiveProfile.allowManualRefeed === true;
      return hasRecommendation || allowManual;
    } catch (_) {
      return false;
    }
  }

  /** Отсутствуют ли core-поля утреннего чек-ина (вес/время сна/качество/настроение) в дне. */
  function coreCheckinDataMissing(mergedDay) {
    const d = mergedDay || {};
    if (!hasCheckinWeight(d)) return true;
    if (!hasSleepTime(d)) return true;
    if (!hasSleepQuality(d)) return true;
    if (!hasMorningMood(d)) return true;
    return false;
  }

  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};
    _reopenRequiredOnly = false;
    _nextPlanYesterdayVerifyRequired = null;

    // Если клиент не выбран — НЕ показываем чек-ин (чтобы не показывать до авторизации)
    const currentClientId = getCurrentClientId();
    if (!currentClientId) {
      // console.log('[MorningCheckin] No clientId, skip check');
      return false;
    }

    // First-login order is strict: legal consents must block registration.
    // On reload the registration flag can persist, so do not reopen profile
    // steps until the consent check has completed successfully.
    if (HEYS._consentsValid !== true) {
      console.info('[MorningCheckin] ℹ️ Consents not valid yet — defer registration/check-in', {
        consentsChecked: HEYS._consentsChecked,
        consentsValid: HEYS._consentsValid,
      });
      return false;
    }

    const todayKey = getTodayKey();
    const sessionKey = getCheckinSessionKey(currentClientId, todayKey);

    // Свежий день (todayKey + календарный для кросс-полуночной проверки) — нужен и
    // для решения по session-флагу (есть ли реально данные чекина), и для pending ниже.
    const _dayData = readDayV2ScopedFirst(todayKey, {}) || {};
    const _calendarKey = new Date().toISOString().slice(0, 10);
    const _altDayData = _calendarKey !== todayKey ? (readDayV2ScopedFirst(_calendarKey, {}) || {}) : {};
    const mergedDay = { ..._altDayData, ..._dayData };
    const profile = readProfileForceRawScoped(currentClientId) || readStoredValue('heys_profile', {}) || {};
    const yesterdayVerifyRequired = shouldShowYesterdayVerifyRequired();
    _nextPlanYesterdayVerifyRequired = yesterdayVerifyRequired;
    const existingProgress = readMorningProgress(todayKey, currentClientId);
    const remainingProgressSteps = getRemainingMorningSteps({
      ledger: existingProgress,
      dateKey: todayKey,
      clientId: currentClientId
    });

    // 🆕 v1.9.1: Если чек-ин уже был показан/пропущен в этой сессии — НЕ показываем
    // Переводим legacy-флаг в per-client/per-day ключ, чтобы не блокировать других клиентов
    try {
      if (sessionStorage.getItem('heys_morning_checkin_done') === 'true') {
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.removeItem('heys_morning_checkin_done');
      }
    } catch (_) {
      // sessionStorage may be unavailable in private mode
    }
    if (sessionStorage.getItem(sessionKey) === 'true') {
      // Session-флаг — только подсказка. Он закрывает gate, когда основные данные
      // на месте, в журнале нет незавершённых шагов и не появилась проверка прошлых дней.
      if (!coreCheckinDataMissing(mergedDay)
        && hasStepsGoal(profile)
        && remainingProgressSteps.length === 0
        && !yesterdayVerifyRequired) {
        console.info('[MorningCheckin] 🚫 Skip — sessionStorage флаг активен, данные чекина на месте:', sessionKey);
        return false;
      }
      _reopenRequiredOnly = coreCheckinDataMissing(mergedDay) || !hasStepsGoal(profile);
      console.warn('[MorningCheckin] ⚠️ session-флаг стоит, но чек-ин требует продолжения', {
        sessionKey,
        hasWeight: hasCheckinWeight(mergedDay),
        hasSleep: hasSleepTime(mergedDay),
        hasSleepQuality: hasSleepQuality(mergedDay),
        hasMood: hasMorningMood(mergedDay),
        hasStepsGoal: hasStepsGoal(profile),
        remainingSteps: remainingProgressSteps.map((row) => row.id),
        yesterdayVerifyRequired,
      });
      // fall through — ниже pending наберётся и вернём true
    }

    const flowStatus = existingProgress?.steps?.__flow__?.status || null;
    if (existingProgress && remainingProgressSteps.length > 0) {
      console.warn('[MorningCheckin] ↩️ Resuming flow with unfinished steps', {
        flowId: existingProgress.flowId,
        remainingSteps: remainingProgressSteps.map((row) => row.id),
        flowStatus
      });
      return true;
    }

    // 🔒 КРИТИЧНО: Если профиль не заполнен — ВСЕГДА показываем!
    // Регистрационные шаги (profile-personal, profile-body, etc.) обязательны для новых пользователей
    // Force-raw read минуя Store.get memory cache (закрывает race под VPN).
    // 🛡️ Sync-in-progress guard для давних клиентов. На ранней стадии boot'а
    // scoped LS может содержать ТОЛЬКО subscription-поля (subscription_status,
    // trial_started_at, ...) ДО того, как полный профиль приземлится из cloud
    // в LS. В этом окне visualy профиль "incomplete" (нет firstName/etc.), но
    // данные в облаке есть — race синхронизации. Отказываемся открывать
    // регистрационный визард в этот момент: следующий вызов shouldShow (после
    // dispatchForegroundHotSyncCompleted) увидит полный профиль.
    //
    // Time-based ограничение: для новых клиентов без cloud-профиля subscription-
    // only-состояние постоянное. После 8 сек после initial sync defer не
    // блокирует — wizard legitimately открывается для регистрации.
    const _scopedRaw = currentClientId ? localStorage.getItem(`heys_${currentClientId}_profile`) : null;
    let _scopedRawProfile = null;
    if (_scopedRaw) {
      const _fn = HEYS.store?.decompress;
      try { _scopedRawProfile = _fn ? _fn(_scopedRaw) : JSON.parse(_scopedRaw); } catch (_) { _scopedRawProfile = null; }
    }
    const _hasSubscriptionMarker = _scopedRawProfile && (_scopedRawProfile.subscription_status || _scopedRawProfile.trial_started_at);
    const _hasPersonalMarker = _scopedRawProfile && (_scopedRawProfile.firstName || _scopedRawProfile.age || _scopedRawProfile.weight || _scopedRawProfile.height || _scopedRawProfile.profileCompleted === true);
    if (_hasSubscriptionMarker && !_hasPersonalMarker) {
      const _syncAt = (window.HEYS && window.HEYS.cloud && window.HEYS.cloud._syncCompletedAt) || 0;
      const _syncAge = _syncAt ? (Date.now() - _syncAt) : Infinity;
      if (_syncAge < 8000) {
        console.warn('[MorningCheckin] 🛡️ partial subscription-only profile — sync in progress, deferring wizard', {
          clientId: currentClientId?.slice(0, 8),
          scopedKeys: Object.keys(_scopedRawProfile).slice(0, 8),
          syncAge: _syncAge,
        });
        return false;
      }
      // sync завершился >8s назад, personal данных так и нет — это новый
      // клиент без cloud-профиля → wizard legitimately открывается ниже.
    }

    if (HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete) {
      if (HEYS.ProfileSteps.isProfileIncomplete(profile)) {
        // Diagnostic dump чтобы понять почему именно incomplete
        console.log('[MorningCheckin] 🆕 Profile incomplete — forcing checkin with registration steps', {
          firstName: profile && profile.firstName,
          birthDate: profile && profile.birthDate,
          weight: profile && profile.weight,
          height: profile && profile.height,
          gender: profile && profile.gender,
          age: profile && profile.age,
          profileCompleted: profile && profile.profileCompleted,
          source: 'morning_checkin.shouldShowMorningCheckin',
          currentClientId: (window.HEYS && window.HEYS.currentClientId) ? String(window.HEYS.currentClientId).slice(0, 8) : 'NULL',
          scopedKeyExists: !!localStorage.getItem(`heys_${currentClientId || (window.HEYS && window.HEYS.currentClientId)}_profile`)
        });
        return true;
      }
    }

    // mergedDay уже посчитан выше (todayKey + календарный, кросс-полуночная проверка).
    const calendarKey = _calendarKey;

    const pending = [];
    if (!hasCheckinWeight(mergedDay)) pending.push('weight');
    if (!hasSleepTime(mergedDay)) pending.push('sleepTime');
    if (!hasSleepQuality(mergedDay)) pending.push('sleepQuality');
    if (!hasMorningMood(mergedDay)) pending.push('morning_mood');
    if (!hasStepsGoal(profile)) pending.push('stepsGoal');

    if (yesterdayVerifyRequired) {
      pending.push('yesterdayVerify');
    }

    console.info('[MorningCheckin] 🔍 shouldShow check', {
      clientId: currentClientId?.slice(0, 8),
      todayKey,
      calendarKey,
      pending,
      sessionFlag: sessionStorage.getItem(sessionKey),
    });

    return pending.length > 0;
  }

  /**
   * Централизованная функция для получения списка шагов чек-ина
   * Используется и в MorningCheckin, и в showCheckin.morning()
   */
  function getCheckinSteps(profile, opts) {
    const { filterCompleted = false, requiredOnly = false, yesterdayVerifyRequired = null } = opts || {};
    const steps = [];
    let hasProfileSteps = false;

    // 1. Проверяем профиль для новых пользователей
    if (HEYS.ProfileSteps && HEYS.ProfileSteps.isProfileIncomplete) {
      if (HEYS.ProfileSteps.isProfileIncomplete(profile)) {
        steps.push('profile-personal', 'profile-body', 'profile-goals', 'profile-metabolism');
        // 🎉 Шаг приветствия после регистрации — визуальный разделитель
        steps.push('welcome');
        hasProfileSteps = true;
      }
    }

    // 2.0. 📊 Верификация пропущенных дней — РАЗБОР ПЕРВЫМ
    // Семантика: сначала закрываем «вчера/позавчера», потом фиксируем «сегодня».
    // Conditional push: если pending дней нет — не добавляем «пустой» слот в прогресс-бар.
    // Источник правды о наличии pending: HEYS.YesterdayVerify.shouldShow() →
    // getPendingPastDays().totalPendingDays > 0.
    const includeYesterdayVerify = typeof yesterdayVerifyRequired === 'boolean'
      ? yesterdayVerifyRequired
      : shouldShowYesterdayVerifyRequired();
    if (includeYesterdayVerify) {
      steps.push('yesterdayVerify');
    }

    // 2.1. Required-блок: все шаги, по которым shouldShowMorningCheckin
    // решает «чек-ин ещё не сделан», идут сплошным блоком в начале.
    // Иначе пользователь, закрывший мастер крестиком на любом опциональном
    // шаге (refeed/measurements/cold/supplements c canSkip), не доходит до
    // последнего required-шага и каждый день застревает в той же ловушке
    // (incident 2026-06-08: stepsGoal стоял 4-м из 5 → не сохранялся годами).
    //
    // Вес в регистрации (целый) → профиль; вес в чек-ине (с десятыми) → день.
    steps.push('weight');
    steps.push('sleepTime', 'sleepQuality');
    steps.push('morning_mood');
    steps.push('stepsGoal');

    // 3. 🔄 Загрузочный день (Refeed) — опциональный, после required-блока.
    // Добавляем только когда сам шаг реально будет видимым в StepModal.
    if (shouldIncludeRefeedStep(profile)) {
      steps.push('refeedDay');
    }

    // 4. Условные шаги (cycle, measurements)
    // Для cycle: показываем если cycleTrackingEnabled=true ИЛИ если это регистрация (шаг спросит сам)
    // При регистрации профиль ещё пуст, но шаг cycle сам определит пол из StepModal data
    if (hasProfileSteps) {
      // При регистрации всегда добавляем cycle — шаг сам решит показывать ли (по полу из данных регистрации)
      steps.push('cycle');
    } else if (HEYS.Steps && HEYS.Steps.shouldShowCycleStep && HEYS.Steps.shouldShowCycleStep()) {
      steps.push('cycle');
    }
    if (HEYS.Steps && HEYS.Steps.shouldShowMeasurements && HEYS.Steps.shouldShowMeasurements()) {
      steps.push('measurements');
    }

    // 5. 🧊 Холодовое воздействие (опциональный шаг)
    steps.push('cold_exposure');

    // 6. 💊 Витамины (опциональный шаг, запоминается на след. день)
    steps.push('supplements');

    // 7. 🌟 Мотивирующий финальный шаг
    steps.push('morningRoutine');

    if (!filterCompleted && !requiredOnly) return steps;

    // Фильтруем уже-выполненные required-шаги (data-derived completion).
    // Регистрационные / opaque / opt-in шаги оставляем как есть — они либо нужны атомарно (registration),
    // либо conditional-gated на уровне push, либо canSkip:true и не требуют detection.
    const todayKey = getTodayKey();
    const dayDataF = readDayV2ScopedFirst(todayKey, {}) || {};
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayDataF = calendarKey !== todayKey ? (readDayV2ScopedFirst(calendarKey, {}) || {}) : {};
    const day = { ...altDayDataF, ...dayDataF };

    const filtered = steps.filter(id => {
      switch (id) {
        case 'weight': return !hasCheckinWeight(day);
        case 'sleepTime': return !hasSleepTime(day);
        case 'sleepQuality': return !hasSleepQuality(day);
        case 'morning_mood': return !hasMorningMood(day);
        case 'stepsGoal': return !hasStepsGoal(profile);
        case 'cycle': return !hasCycleDecision(day, profile);
        default: return true;
      }
    });

    // 🆕 TASK-003 follow-up: режим «переоткрытие для восстановления» — только
    // недостающие обязательные шаги, без опционального хвоста. Регистрацию
    // (profile-incomplete) не урезаем — её шаги нужны атомарно.
    if (requiredOnly && !hasProfileSteps) {
      const REQUIRED = new Set(['weight', 'sleepTime', 'sleepQuality', 'morning_mood', 'stepsGoal', 'yesterdayVerify']);
      return filtered.filter(id => REQUIRED.has(id));
    }

    return filtered;
  }

  function getScopedClientKey(logicalKey, clientId = getCurrentClientId()) {
    return clientId ? `heys_${clientId}_${logicalKey}` : logicalKey;
  }

  function readScopedClientValue(logicalKey, fallback = null, clientId = getCurrentClientId()) {
    return readStoredValue(getScopedClientKey(logicalKey, clientId), fallback);
  }

  function writeScopedClientValue(logicalKey, value, clientId = getCurrentClientId()) {
    const key = getScopedClientKey(logicalKey, clientId);
    if (HEYS.store?.set) {
      HEYS.store.set(key, value);
    } else if (HEYS.utils?.lsSet) {
      HEYS.utils.lsSet(key, value);
    }
  }

  function getMorningProgressKey(dateKey) {
    return `heys_morning_checkin_progress_v1_${dateKey}`;
  }

  const MORNING_CORE_STEPS = ['weight', 'sleepTime', 'sleepQuality', 'morning_mood', 'stepsGoal'];
  const MORNING_OPTIONAL_TAIL_STEPS = new Set(['refeedDay', 'cycle', 'measurements', 'cold_exposure', 'supplements']);
  const MORNING_DATA_COMPLETABLE_STEPS = new Set([
    ...MORNING_CORE_STEPS,
    'refeedDay',
    'cycle',
    'measurements',
    'cold_exposure',
    'supplements',
    'profile-metabolism'
  ]);
  const MORNING_REPLANNABLE_REQUIRED_STEPS = new Set([
    ...MORNING_CORE_STEPS,
    'yesterdayVerify',
    'profile-personal',
    'profile-body',
    'profile-goals',
    'profile-metabolism'
  ]);
  const MORNING_STEP_LABELS = {
    weight: 'вес',
    sleepTime: 'сон',
    sleepQuality: 'качество сна',
    morning_mood: 'самочувствие',
    stepsGoal: 'цель шагов',
    yesterdayVerify: 'проверка вчера',
    refeedDay: 'загрузочный день',
    cycle: 'цикл',
    measurements: 'замеры',
    cold_exposure: 'холод',
    supplements: 'добавки',
    morningRoutine: 'финал',
    __flow__: 'чек-ин'
  };

  function emitMorningCheckinStatus(dateKey, clientId, reason, opts = {}) {
    try {
      const status = getMorningCheckinStatus(dateKey, clientId, opts.ledger);
      window.dispatchEvent(new CustomEvent('heys:morning-checkin-status', {
        detail: { reason, status }
      }));
      return status;
    } catch (_) {
      return null;
    }
  }

  function traceMorningCheckin(event, meta = {}) {
    try {
      const payload = {
        event,
        dateKey: meta.dateKey || getTodayKey(),
        client: String(meta.clientId || getCurrentClientId() || '').slice(0, 8) || null,
        flowId: meta.flowId || null,
        stepId: meta.stepId || null,
        status: meta.status || null,
        error: meta.error || null,
        plannedStepIds: Array.isArray(meta.plannedStepIds) ? meta.plannedStepIds : null,
        remainingStepIds: Array.isArray(meta.remainingStepIds) ? meta.remainingStepIds : null,
        affectedKeys: Array.isArray(meta.affectedKeys) ? meta.affectedKeys : null
      };
      const isProblem = event === 'flow_failed'
        || event === 'flow_closed_by_user'
        || payload.status === 'failed_sync'
        || !!payload.error;
      const level = isProblem ? 'warn' : 'info';
      if (HEYS.LogTrace && typeof HEYS.LogTrace.trace === 'function') {
        HEYS.LogTrace.trace(level, '[CHECKIN.flow]', payload);
      } else {
        console.warn('[CHECKIN.flow]', payload);
      }
    } catch (_) {
      // Trace must never affect check-in.
    }
  }

  function createMorningFlowId(dateKey) {
    return `${dateKey}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function readMorningProgress(dateKey, clientId = getCurrentClientId()) {
    return readScopedClientValue(getMorningProgressKey(dateKey), null, clientId);
  }

  function readMorningProgressPersisted(dateKey, clientId = getCurrentClientId()) {
    try {
      const key = getScopedClientKey(getMorningProgressKey(dateKey), clientId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const decompress = HEYS.store?.decompress;
      return decompress ? decompress(raw) : JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  function writeMorningProgress(ledger, clientId = getCurrentClientId()) {
    if (!ledger || !ledger.dateKey) return ledger;
    const persisted = readMorningProgressPersisted(ledger.dateKey, clientId);
    const mergeProgress = HEYS.sync?.mergeMorningCheckinProgress;
    const merged = persisted && typeof mergeProgress === 'function'
      ? mergeProgress(ledger, persisted)
      : ledger;
    writeScopedClientValue(getMorningProgressKey(ledger.dateKey), merged, clientId);
    return merged;
  }

  function ensureMorningProgress({
    dateKey,
    clientId,
    flowId,
    plannedStepIds,
    remainingStepIds = plannedStepIds,
    replannedStepIds = []
  }) {
    const existing = readMorningProgress(dateKey, clientId);
    const ledger = existing || {
      version: 1,
      clientId,
      dateKey,
      flowId: flowId || createMorningFlowId(dateKey),
      plannedStepIds: [],
      steps: {}
    };
    const mutationAt = Date.now();
    let changed = !existing;
    ledger.steps = ledger.steps || {};
    ledger.plannedStepIds = Array.isArray(ledger.plannedStepIds) ? ledger.plannedStepIds : [];
    if (!existing && !ledger.steps.__flow__) {
      ledger.steps.__flow__ = { status: 'open', attempt: 1, updatedAt: mutationAt };
    }
    plannedStepIds.forEach((id) => {
      if (!ledger.plannedStepIds.includes(id)) {
        ledger.plannedStepIds.push(id);
        changed = true;
      }
      if (!ledger.steps[id]) {
        ledger.steps[id] = { status: 'planned', attempt: 1, updatedAt: mutationAt };
        changed = true;
      }
    });
    replannedStepIds.forEach((id) => {
      const row = ledger.steps[id] || {};
      if (row.status === 'saved_local' || row.status === 'skipped') return;
      ledger.steps[id] = {
        ...row,
        previousStatus: row.status || null,
        status: 'planned',
        attempt: (Number(row.attempt) || 0) + 1,
        replannedAt: mutationAt,
        updatedAt: mutationAt,
        savedAt: null,
        syncedAt: null,
        cloudPending: false,
        syncNote: null,
        error: null
      };
      changed = true;
    });
    const flowStatus = ledger.steps.__flow__?.status || null;
    if (existing && remainingStepIds.length > 0
      && (flowStatus === 'closed' || flowStatus === 'synced' || flowStatus === 'saved_local' || flowStatus === 'failed_sync')) {
      ledger.steps.__flow__ = {
        ...(ledger.steps.__flow__ || {}),
        status: 'open',
        attempt: (Number(ledger.steps.__flow__?.attempt) || 0) + 1,
        reopenedAt: mutationAt,
        updatedAt: mutationAt,
        closedAt: null,
        savedAt: null,
        syncedAt: null,
        cloudPending: false,
        syncNote: null,
        error: null
      };
      changed = true;
    }
    if (changed) ledger.updatedAt = Math.max(mutationAt, (Number(ledger.updatedAt) || 0) + 1);
    const written = changed ? writeMorningProgress(ledger, clientId) : ledger;
    const traceEvent = existing ? 'plan_resumed' : 'plan_created';
    traceMorningCheckin(traceEvent, {
      dateKey,
      clientId,
      flowId: written?.flowId,
      plannedStepIds: written?.plannedStepIds || plannedStepIds,
      remainingStepIds
    });
    emitMorningCheckinStatus(dateKey, clientId, traceEvent, { ledger: written });
    return written;
  }

  function isUnresolvedProgressStatus(status) {
    return status === 'failed_sync' || status === 'saved_local' || status === 'editing';
  }

  function markMorningProgressCloudPending(dateKey, stepId, affectedKeys, clientId, note = 'cloud_pending') {
    return markMorningProgressStep(dateKey, stepId, {
      status: 'saved_local',
      cloudPending: true,
      syncNote: note,
      affectedKeys: affectedKeys || [],
      error: null
    }, clientId);
  }

  function getRemainingMorningSteps({ ledger, dateKey, clientId }) {
    const plannedStepIds = Array.isArray(ledger?.plannedStepIds) ? ledger.plannedStepIds : [];
    if (!plannedStepIds.length) return [];
    const day = getFreshMorningDay(dateKey);
    const profile = getFreshMorningProfile(clientId);
    return plannedStepIds.map((id) => {
      const row = ledger?.steps?.[id] || {};
      const completeByData = id !== 'yesterdayVerify'
        && MORNING_DATA_COMPLETABLE_STEPS.has(id)
        && isMorningStepComplete(id, { dateKey, clientId, day, profile });
      return {
        id,
        status: row.status || (completeByData ? 'data_present' : 'missing'),
        completeByData
      };
    }).filter((row) => !isMorningStatusTerminal(row));
  }

  function mergeFreshStepsWithProgress(freshSteps, existingLedger, state = {}) {
    const dateKey = state.dateKey || getTodayKey();
    const clientId = state.clientId || getCurrentClientId();
    const day = getFreshMorningDay(dateKey);
    const profile = getFreshMorningProfile(clientId);
    const merged = existingLedger
      ? getRemainingMorningSteps({ ledger: existingLedger, dateKey, clientId }).map((row) => row.id)
      : [];
    const alreadyPlanned = new Set(existingLedger?.plannedStepIds || []);
    const replannedStepIds = getReplannedMorningStepIds(freshSteps, existingLedger);
    replannedStepIds.forEach((id) => {
      if (!merged.includes(id)) merged.push(id);
    });

    freshSteps.forEach((id) => {
      if (merged.includes(id) || alreadyPlanned.has(id)) return;
      const completeByData = id !== 'yesterdayVerify'
        && MORNING_DATA_COMPLETABLE_STEPS.has(id)
        && isMorningStepComplete(id, { dateKey, clientId, day, profile });
      if (!completeByData) merged.push(id);
    });
    return merged;
  }

  function getReplannedMorningStepIds(freshSteps, existingLedger) {
    if (!existingLedger) return [];
    const planned = new Set(existingLedger.plannedStepIds || []);
    return freshSteps.filter((id) => {
      if (!planned.has(id) || !MORNING_REPLANNABLE_REQUIRED_STEPS.has(id)) return false;
      const status = existingLedger.steps?.[id]?.status;
      return status === 'synced' || status === 'data_present';
    });
  }

  function markMorningProgressStep(dateKey, stepId, patch, clientId = getCurrentClientId()) {
    const ledger = readMorningProgress(dateKey, clientId);
    if (!ledger || !stepId) return null;
    const mutationAt = Date.now();
    ledger.steps = ledger.steps || {};
    ledger.steps[stepId] = {
      ...(ledger.steps[stepId] || {}),
      ...patch,
      updatedAt: mutationAt
    };
    ledger.updatedAt = Math.max(mutationAt, (Number(ledger.updatedAt) || 0) + 1);
    const written = writeMorningProgress(ledger, clientId);
    traceMorningCheckin('step_status', {
      dateKey,
      clientId,
      flowId: written?.flowId,
      stepId,
      status: written?.steps?.[stepId]?.status,
      error: written?.steps?.[stepId]?.error || null,
      affectedKeys: written?.steps?.[stepId]?.affectedKeys || []
    });
    emitMorningCheckinStatus(dateKey, clientId, 'step_status', { ledger: written });
    return written;
  }

  function getFreshMorningDay(dateKey) {
    const dayData = readDayV2ScopedFirst(dateKey, {}) || {};
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayData = calendarKey !== dateKey ? (readDayV2ScopedFirst(calendarKey, {}) || {}) : {};
    return { ...altDayData, ...dayData };
  }

  function getFreshMorningProfile(clientId = getCurrentClientId()) {
    return readProfileForceRawScoped(clientId) || readStoredValue('heys_profile', {}) || {};
  }

  function getMorningCorePresence(day, profile) {
    return {
      weight: hasCheckinWeight(day),
      sleepTime: hasSleepTime(day),
      sleepQuality: hasSleepQuality(day),
      morningMood: hasMorningMood(day),
      stepsGoal: hasStepsGoal(profile)
    };
  }

  function countMorningStepStatuses(steps) {
    return steps.reduce((acc, row) => {
      const s = row.status || 'unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
  }

  function isMorningStatusTerminal(row) {
    const status = row?.status || 'missing';
    return status === 'synced'
      || status === 'saved_local'
      || status === 'skipped'
      || status === 'data_present'
      || row?.completeByData === true;
  }

  function isMorningFinalBlockingStep(stepId) {
    return !MORNING_OPTIONAL_TAIL_STEPS.has(stepId);
  }

  function getBlockingMorningSteps({ ledger, dateKey, clientId }) {
    const plannedStepIds = Array.isArray(ledger?.plannedStepIds) ? ledger.plannedStepIds : [];
    if (!plannedStepIds.length) return [];
    const day = getFreshMorningDay(dateKey);
    const profile = getFreshMorningProfile(clientId);
    return plannedStepIds.map((id) => {
      const row = ledger?.steps?.[id] || {};
      // Once yesterdayVerify entered the plan it must be acknowledged in the
      // ledger. A later live shouldShow=false cannot silently satisfy it.
      const completeByData = id !== 'yesterdayVerify'
        && isMorningStepComplete(id, { dateKey, clientId, day, profile });
      return {
        id,
        status: row.status || (completeByData ? 'data_present' : 'missing'),
        completeByData
      };
    }).filter((row) => isMorningFinalBlockingStep(row.id) && !isMorningStatusTerminal(row));
  }

  function summarizeMorningCheckinStatus({ ledger, steps, corePresence, sessionDone }) {
    const flowStatus = ledger?.steps?.__flow__?.status || null;
    const failed = steps.find((row) => row.status === 'failed_sync');
    const unresolved = steps.find((row) => isUnresolvedProgressStatus(row.status));
    const blocking = steps.find((row) => isMorningFinalBlockingStep(row.id) && !isMorningStatusTerminal(row));
    const allCorePresent = Object.values(corePresence || {}).every(Boolean);
    if (failed) return { state: 'failed', label: `ошибка: ${MORNING_STEP_LABELS[failed.id] || failed.id}` };
    if (unresolved) return { state: 'in_progress', label: `сохраняется: ${MORNING_STEP_LABELS[unresolved.id] || unresolved.id}` };
    if (flowStatus === 'synced' && blocking) return { state: 'open', label: `не завершён: ${MORNING_STEP_LABELS[blocking.id] || blocking.id}` };
    if (flowStatus === 'synced') return { state: 'complete', label: 'чек-ин завершён' };
    if (flowStatus === 'failed_sync') return { state: 'failed', label: 'ошибка финальной синхронизации' };
    if (flowStatus === 'saved_local') return { state: 'in_progress', label: 'финальная синхронизация' };
    if (flowStatus === 'closed') return { state: 'closed', label: 'чек-ин прерван' };
    if (allCorePresent && sessionDone) return { state: 'core_done', label: 'обязательные шаги на месте' };
    if (ledger) return { state: 'open', label: 'чек-ин открыт/не завершён' };
    if (allCorePresent) return { state: 'data_present', label: 'данные есть, flow неизвестен' };
    return { state: 'missing', label: 'чек-ин не завершён' };
  }

  function getMorningCheckinStatus(dateKey = getTodayKey(), clientId = getCurrentClientId(), ledgerOverride = null) {
    const ledger = ledgerOverride || readMorningProgress(dateKey, clientId);
    const day = getFreshMorningDay(dateKey);
    const profile = getFreshMorningProfile(clientId);
    const corePresence = getMorningCorePresence(day, profile);
    const plannedStepIds = Array.isArray(ledger?.plannedStepIds) ? ledger.plannedStepIds.slice() : [];
    const stepIds = plannedStepIds.length
      ? plannedStepIds
      : MORNING_CORE_STEPS.filter((id) => !isMorningStepComplete(id, { dateKey, clientId, day, profile }));
    const steps = stepIds.map((id) => {
      const row = ledger?.steps?.[id] || {};
      return {
        id,
        label: MORNING_STEP_LABELS[id] || id,
        status: row.status || (isMorningStepComplete(id, { dateKey, clientId, day, profile }) ? 'data_present' : 'missing'),
        savedAt: row.savedAt || null,
        syncedAt: row.syncedAt || null,
        error: row.error || null,
        cloudPending: row.cloudPending === true,
        syncNote: row.syncNote || null,
        completeByData: isMorningStepComplete(id, { dateKey, clientId, day, profile })
      };
    });
    const sessionKey = getCheckinSessionKey(clientId, dateKey);
    let sessionDone = false;
    try {
      sessionDone = sessionStorage.getItem(sessionKey) === 'true';
    } catch (_) {
      sessionDone = false;
    }
    const summary = summarizeMorningCheckinStatus({ ledger, steps, corePresence, sessionDone });
    return {
      version: 1,
      dateKey,
      clientId,
      flowId: ledger?.flowId || null,
      state: summary.state,
      label: summary.label,
      sessionDone,
      updatedAt: ledger?.updatedAt || null,
      flowStatus: ledger?.steps?.__flow__?.status || null,
      plannedStepIds,
      counts: countMorningStepStatuses(steps),
      corePresence,
      steps
    };
  }

  function isMorningStepComplete(stepId, state = {}) {
    const dateKey = state.dateKey || getTodayKey();
    const clientId = state.clientId || getCurrentClientId();
    const day = state.day || getFreshMorningDay(dateKey);
    const profile = state.profile || getFreshMorningProfile(clientId);
    if (state.saveResult?.completed === true) return true;
    switch (stepId) {
      case 'weight': return hasCheckinWeight(day);
      case 'sleepTime': return hasSleepTime(day);
      case 'sleepQuality': return hasSleepQuality(day);
      case 'morning_mood': return hasMorningMood(day);
      case 'stepsGoal': return hasStepsGoal(profile);
      case 'yesterdayVerify': return !shouldShowYesterdayVerifyRequired();
      case 'refeedDay': return typeof day?.isRefeedDay === 'boolean' || !shouldIncludeRefeedStep(profile, dateKey);
      case 'cycle': return hasCycleDecision(day, profile);
      case 'measurements': {
        const m = day?.measurements;
        return !!m && ['waist', 'hips', 'thigh', 'biceps'].some((k) => hasPositiveCheckinNumber(m?.[k]));
      }
      case 'cold_exposure': return !!day?.coldExposure && typeof day.coldExposure === 'object' && !!day.coldExposure.type;
      case 'supplements': return Array.isArray(day?.supplementsPlanned);
      case 'morningRoutine':
        return false;
      case 'welcome':
        return true;
      case 'profile-personal':
      case 'profile-body':
      case 'profile-goals':
        return true;
      case 'profile-metabolism':
        return !(HEYS.ProfileSteps?.isProfileIncomplete?.(profile));
      default:
        return true;
    }
  }

  function getAffectedKeysForMorningStep(stepId, dateKey, saveResult) {
    if (saveResult && Array.isArray(saveResult.affectedKeys)) return saveResult.affectedKeys;
    if (saveResult && saveResult.skipped) return [];
    switch (stepId) {
      case 'stepsGoal':
      case 'profile-personal':
      case 'profile-body':
      case 'profile-goals':
      case 'profile-metabolism':
        return ['heys_profile'];
      case 'yesterdayVerify':
        return [];
      case 'cycle':
        return [`heys_dayv2_${dateKey}`];
      default:
        return [`heys_dayv2_${dateKey}`];
    }
  }

  async function flushAndMarkMorningStep(stepId, affectedKeys, timeoutMs, opts = {}) {
    const dateKey = opts.dateKey || getTodayKey();
    const clientId = opts.clientId || getCurrentClientId();
    if (opts.skipped) {
      markMorningProgressStep(dateKey, stepId, {
        status: 'skipped',
        savedAt: Date.now(),
        syncedAt: Date.now(),
        affectedKeys: affectedKeys || [],
        error: null
      }, clientId);
      return true;
    }

    markMorningProgressStep(dateKey, stepId, {
      status: 'saved_local',
      savedAt: Date.now(),
      affectedKeys: affectedKeys || [],
      cloudPending: false,
      syncNote: null,
      error: null
    }, clientId);

    const complete = isMorningStepComplete(stepId, { dateKey, clientId, saveResult: opts.saveResult });
    if (!complete) {
      const err = new Error('Шаг сохранён не полностью. Проверьте данные и попробуйте ещё раз.');
      markMorningProgressStep(dateKey, stepId, {
        status: 'failed_sync',
        error: err.message
      }, clientId);
      throw err;
    }

    if (!HEYS.cloud || typeof HEYS.cloud.flushPendingQueue !== 'function') {
      markMorningProgressCloudPending(dateKey, stepId, affectedKeys, clientId, 'sync_unavailable');
      return true;
    }

    let flushed = false;
    try {
      flushed = await HEYS.cloud.flushPendingQueue(timeoutMs || 10000);
    } catch (err) {
      markMorningProgressCloudPending(dateKey, stepId, affectedKeys, clientId, 'flush_failed');
      traceMorningCheckin('step_sync_deferred', {
        dateKey,
        clientId,
        stepId,
        status: 'saved_local',
        error: err?.message || String(err || 'flush_failed'),
        affectedKeys
      });
      return true;
    }
    if (!flushed) {
      markMorningProgressCloudPending(dateKey, stepId, affectedKeys, clientId, 'flush_timeout');
      return true;
    }

    markMorningProgressStep(dateKey, stepId, {
      status: 'synced',
      syncedAt: Date.now(),
      cloudPending: false,
      syncNote: null,
      error: null
    }, clientId);
    return true;
  }

  function buildMorningCheckinPlan(opts = {}) {
    const dateKey = opts.dateKey || getTodayKey();
    const clientId = opts.clientId || getCurrentClientId();
    const profile = opts.profile || getFreshMorningProfile(clientId);
    const cachedYesterdayVerifyRequired = opts.source === 'MorningCheckin'
      && typeof _nextPlanYesterdayVerifyRequired === 'boolean'
      ? _nextPlanYesterdayVerifyRequired
      : null;
    if (opts.source === 'MorningCheckin') _nextPlanYesterdayVerifyRequired = null;
    const freshSteps = getCheckinSteps(profile, {
      filterCompleted: opts.filterCompleted !== false,
      requiredOnly: !!opts.requiredOnly,
      yesterdayVerifyRequired: cachedYesterdayVerifyRequired
    });
    const existingLedger = readMorningProgress(dateKey, clientId);
    const steps = mergeFreshStepsWithProgress(freshSteps, existingLedger, { dateKey, clientId });
    const replannedStepIds = getReplannedMorningStepIds(freshSteps, existingLedger);
    const fullPlannedStepIds = Array.from(new Set([
      ...(existingLedger?.plannedStepIds || []),
      ...freshSteps
    ]));
    const flowId = createMorningFlowId(dateKey);
    const ledger = ensureMorningProgress({
      dateKey,
      clientId,
      flowId,
      plannedStepIds: fullPlannedStepIds,
      remainingStepIds: steps,
      replannedStepIds
    });
    return {
      dateKey,
      clientId,
      profile,
      steps,
      flowId: ledger?.flowId || flowId,
      isRegistrationCheckin: steps.includes('profile-personal')
    };
  }

  function createMorningStepAck(plan) {
    return async ({ stepId, saveResult, skipped }) => {
      const affectedKeys = getAffectedKeysForMorningStep(stepId, plan.dateKey, saveResult);
      const isSkipped = !!(skipped || saveResult?.skipped);
      traceMorningCheckin(isSkipped ? 'step_skip_ack_start' : 'step_ack_start', {
        dateKey: plan.dateKey,
        clientId: plan.clientId,
        flowId: plan.flowId,
        stepId,
        affectedKeys
      });
      return flushAndMarkMorningStep(stepId, affectedKeys, 10000, {
        dateKey: plan.dateKey,
        clientId: plan.clientId,
        skipped: isSkipped,
        saveResult
      });
    };
  }

  function dispatchMorningCheckinDayRefresh(dateKey, source) {
    const freshDay = getFreshMorningDay(dateKey);
    window.dispatchEvent(new CustomEvent('heys:day-updated', {
      detail: {
        date: dateKey,
        source,
        forceReload: true,
        data: { ...freshDay, date: dateKey }
      }
    }));
  }

  function completeMorningCheckin(plan, onComplete) {
    const todayKey = plan?.dateKey || getTodayKey();
    const currentClientId = plan?.clientId || getCurrentClientId();
    markMorningProgressStep(todayKey, '__flow__', {
      status: 'saved_local',
      savedAt: Date.now(),
      error: null
    }, currentClientId);
    traceMorningCheckin('flow_final_flush_start', {
      dateKey: todayKey,
      clientId: currentClientId,
      flowId: plan?.flowId
    });

    const finish = (opts = {}) => {
      const cloudPending = opts.cloudPending === true;
      const ledger = readMorningProgress(todayKey, currentClientId);
      const blocking = getBlockingMorningSteps({ ledger, dateKey: todayKey, clientId: currentClientId });
      if (blocking.length) {
        const labels = blocking.map((row) => MORNING_STEP_LABELS[row.id] || row.id).join(', ');
        throw new Error(`checkin_incomplete_steps:${labels}`);
      }

      dispatchMorningCheckinDayRefresh(todayKey, 'morning-checkin-complete');
      setTimeout(() => {
        dispatchMorningCheckinDayRefresh(todayKey, 'morning-checkin-complete-delayed');
      }, 500);

      window.dispatchEvent(new CustomEvent('heys:checkin-complete', {
        detail: { date: todayKey, type: 'morning' }
      }));

      try {
        const sessionKey = getCheckinSessionKey(currentClientId, todayKey);
        sessionStorage.setItem(sessionKey, 'true');
        sessionStorage.removeItem('heys_morning_checkin_done');
        sessionStorage.removeItem('heys_morning_supplements_advice_shown');
      } catch (e) { /* sessionStorage недоступен */ }
      markMorningProgressStep(todayKey, '__flow__', {
        status: cloudPending ? 'saved_local' : 'synced',
        savedAt: Date.now(),
        syncedAt: cloudPending ? null : Date.now(),
        cloudPending,
        syncNote: cloudPending ? (opts.syncNote || 'flush_timeout') : null,
        error: null
      }, currentClientId);
      traceMorningCheckin('flow_complete', {
        dateKey: todayKey,
        clientId: currentClientId,
        flowId: plan?.flowId,
        status: cloudPending ? 'saved_local' : 'synced'
      });
      if (onComplete) onComplete();
      return true;
    };

    if (HEYS.cloud && typeof HEYS.cloud.flushPendingQueue === 'function') {
      return HEYS.cloud.flushPendingQueue(10000).then(
        (flushed) => finish(flushed ? {} : { cloudPending: true, syncNote: 'checkin_sync_timeout' }),
        (err) => {
          markMorningProgressStep(todayKey, '__flow__', {
            status: 'saved_local',
            cloudPending: true,
            syncNote: 'checkin_sync_failed',
            error: null
          }, currentClientId);
          traceMorningCheckin('flow_sync_deferred', {
            dateKey: todayKey,
            clientId: currentClientId,
            flowId: plan?.flowId,
            status: 'saved_local',
            error: err?.message || String(err || 'checkin_sync_failed')
          });
          console.warn('[MorningCheckin] final sync deferred:', err?.message || err);
          return finish({ cloudPending: true, syncNote: 'checkin_sync_failed' });
        }
      );
    }
    traceMorningCheckin('flow_sync_deferred', {
      dateKey: todayKey,
      clientId: currentClientId,
      flowId: plan?.flowId,
      status: 'saved_local',
      error: 'checkin_sync_unavailable'
    });
    return Promise.resolve(finish({ cloudPending: true, syncNote: 'checkin_sync_unavailable' }));
  }

  /**
   * MorningCheckin — обёртка над новым StepModal
   * Использует шаги: [profile-steps], weight, sleepTime, sleepQuality, [measurements], stepsGoal
   * 
   * @param {function} onComplete - Вызывается при завершении всех шагов
   * @param {function} onClose - Вызывается при закрытии крестиком (отложить на потом)
   */
  function MorningCheckin({ onComplete, onClose }) {
    // 🛡️ Render-time guard: backstop под cold-start VPN race, когда
    // shouldShowMorningCheckin вернул true на устаревшем (incomplete) профиле,
    // а scoped LS уже содержит profileCompleted=true. В этом случае повторный
    // вызов shouldShowMorningCheckin со свежими данными вернёт false, и мы
    // закроем визард на следующем коммите React.
    //
    // ВАЖНО: для completed-профиля визард легитимно открывается ради дневного
    // флоу (например, утренний вес ещё не введён). В этом случае повторный
    // shouldShow всё равно вернёт true — не закрываем.
    if (window.React && typeof window.React.useEffect === 'function') {
      window.React.useEffect(function () {
        try {
          var cid = (window.HEYS && window.HEYS.currentClientId) || '';
          var helper = window.HEYS && window.HEYS.MorningCheckinUtils && window.HEYS.MorningCheckinUtils.readProfileForceRawScoped;
          if (!cid || typeof helper !== 'function') return;
          var scoped = helper(cid);
          if (!scoped || scoped.profileCompleted !== true) return;
          var stillNeeded = typeof window.HEYS.shouldShowMorningCheckin === 'function'
            ? window.HEYS.shouldShowMorningCheckin()
            : false;
          if (stillNeeded) return;
          console.warn('[MorningCheckin] 🛡️ render-time guard: profileCompleted=true и shouldShow=false (stale-data race) → auto-close wizard');
          if (typeof onClose === 'function') onClose();
        } catch (_) { }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    }

    // 🛡️ Замораживаем список шагов на время сессии визарда.
    // Без заморозки: WeightStepComponent immediate-write (500ms debounce) кладёт
    // dayv2.weightMorning в LS до того как пользователь нажмёт «Далее». На любом
    // следующем re-render'е MorningCheckin фильтр в getCheckinSteps выкидывает
    // 'weight' (он считается заполненным), массив укорачивается, currentStepIndex
    // в StepModal остаётся 0 — и под ним оказывается уже следующий шаг (сон).
    // Наружу это выглядит как «само перепрыгнуло на след. шаг, не давая ввести
    // десятые». Аналогично для sleep/mood/stepsGoal — любой шаг с immediate-write
    // или с записью в фоне будет страдать. Список шагов мастера — инвариант
    // сессии: открыли с N шагов → пройдём ровно эти N.
    const planRef = (window.React && typeof window.React.useRef === 'function')
      ? window.React.useRef(null)
      : { current: null };
    if (planRef.current === null) {
      // 🆕 TASK-003 follow-up: если shouldShowMorningCheckin открыл визард для
      // восстановления пропавших данных (session-флаг стоял, но core-поля пусты) —
      // показываем только недостающие обязательные шаги, без опционального хвоста.
      planRef.current = buildMorningCheckinPlan({
        source: 'MorningCheckin',
        requiredOnly: !!_reopenRequiredOnly
      });
    }

    // Если StepModal доступен — используем его
    if (HEYS.StepModal && HEYS.StepModal.Component) {
      const plan = planRef.current;
      const steps = plan.steps;

      // Определяем: это регистрационный чек-ин (есть profile-шаги)?
      const isRegistrationCheckin = plan.isRegistrationCheckin;

      // Обёртка для onComplete: обновляем данные дня
      const wrappedOnComplete = () => {
        return completeMorningCheckin(plan, onComplete);
      };

      // Edge case: после filterCompleted список пуст (race: shouldShow вернул true,
      // но между sync-completed и mount'ом какой-то required step доехал из cloud).
      // Avoid рендера пустого StepModal — auto-complete без UI.
      if (window.React && typeof window.React.useEffect === 'function') {
        window.React.useEffect(function () {
          if (steps.length === 0) {
            console.info('[MorningCheckin] all required steps already done → auto-complete without UI');
            wrappedOnComplete();
          }
          // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);
      }
      if (steps.length === 0) return null;

      // Защита от случайного закрытия чек-ина mid-flow.
      // Backdrop-click / крестик дёргают onClose — оборачиваем confirm-диалогом
      // (HEYS.ConfirmModal — нативный, fallback на window.confirm если модуль не загружен).
      // Render-time guard (787-803) и wrappedOnComplete вызывают исходный onClose/onComplete
      // напрямую (без обёртки) — это легитимные пути и не нуждаются в confirm.
      const onCloseWithConfirm = () => {
        if (isRegistrationCheckin) {
          const cm = HEYS && HEYS.ConfirmModal;
          if (cm && typeof cm.confirmAction === 'function') {
            cm.confirmAction({
              icon: '⚠️',
              title: 'Завершите первый вход',
              text: 'Сначала нужно подписать документы, заполнить профиль и пройти обязательный чек-ин.',
              actions: [
                { label: 'Продолжить', value: 'continue', style: 'primary', variant: 'fill', isDefault: true }
              ],
              onConfirm: () => {},
            });
          } else {
            window.alert('Сначала нужно завершить регистрацию и обязательный чек-ин.');
          }
          return;
        }
        const proceed = () => {
          markMorningProgressStep(plan.dateKey, '__flow__', {
            status: 'closed',
            closedAt: Date.now(),
            error: null
          }, plan.clientId);
          traceMorningCheckin('flow_closed_by_user', {
            dateKey: plan.dateKey,
            clientId: plan.clientId,
            flowId: plan.flowId,
            status: 'closed'
          });
          if (typeof onClose === 'function') onClose();
        };
        const cm = HEYS && HEYS.ConfirmModal;
        if (cm && typeof cm.confirmAction === 'function') {
          cm.confirmAction({
            icon: '⚠️',
            title: 'Прервать утренний чек-ин?',
            text: 'Уже сохранённые шаги останутся. Текущий незаконченный шаг не запишется — продолжите с него при следующем открытии.',
            confirmText: 'Прервать',
            cancelText: 'Продолжить',
            onConfirm: proceed,
          });
        } else if (window.confirm('Прервать утренний чек-ин? Уже сохранённые шаги останутся, текущий — нет.')) {
          proceed();
        }
      };

      return React.createElement(HEYS.StepModal.Component, {
        steps: steps,
        onComplete: wrappedOnComplete,
        onClose: onCloseWithConfirm,
        showProgress: true,
        showStreak: true,
        showGreeting: true,
        showTip: true,
        allowSwipe: false,
        freezeVisibleSteps: true,
        forceVisibleStepIds: steps.includes('yesterdayVerify') ? ['yesterdayVerify'] : [],
        requireStepAck: true,
        allowProgressForwardNav: false,
        onStepSaved: createMorningStepAck(plan)
      });
    }

    // Fallback: простое сообщение если StepModal не загружен
    return React.createElement('div', {
      style: {
        padding: '20px',
        textAlign: 'center',
        background: 'var(--card, #fff)',
        borderRadius: '12px',
        margin: '20px'
      }
    },
      React.createElement('p', null, 'Загрузка...'),
      React.createElement('p', { style: { fontSize: '12px', color: '#666' } },
        'Убедитесь что загружены heys_step_modal_v1.js и heys_steps_v1.js'
      )
    );
  }

  // === Экспорт (обратная совместимость) ===
  HEYS.MorningCheckin = MorningCheckin;
  HEYS.shouldShowMorningCheckin = shouldShowMorningCheckin;
  // Утилитарный helper для force-raw read профиля минуя Store.get memory cache.
  // Используется в read-after-sync критичных местах (handleSyncCompleted handler,
  // isProfileIncomplete defensive read) чтобы избежать race с устаревшим cache.
  HEYS.MorningCheckinUtils = HEYS.MorningCheckinUtils || {};
  HEYS.MorningCheckinUtils.readProfileForceRawScoped = readProfileForceRawScoped;
  HEYS.MorningCheckinUtils.readDayV2ScopedFirst = readDayV2ScopedFirst;
  HEYS.MorningCheckinUtils.writeDayV2Scoped = writeDayV2ScopedAndLegacy;
  HEYS.MorningCheckinUtils.shouldOpenMorningActivationFollowup = shouldOpenMorningActivationFollowup;
  HEYS.MorningCheckinUtils.dayHasMorningActivationSyncedActivity = dayHasMorningActivationSyncedActivity;
  HEYS.MorningCheckinUtils.isMorningActivationClearedByUser = isMorningActivationClearedByUser;
  HEYS.MorningCheckinUtils.getCheckinSteps = getCheckinSteps;
  HEYS.MorningCheckinUtils.coreCheckinDataMissing = coreCheckinDataMissing;
  HEYS.MorningCheckinUtils.isMorningStepComplete = isMorningStepComplete;
  HEYS.MorningCheckinUtils.buildMorningCheckinPlan = buildMorningCheckinPlan;
  HEYS.MorningCheckinUtils.mergeFreshStepsWithProgress = mergeFreshStepsWithProgress;
  HEYS.MorningCheckinUtils.getRemainingMorningSteps = getRemainingMorningSteps;
  HEYS.MorningCheckinUtils.getBlockingMorningSteps = getBlockingMorningSteps;
  HEYS.MorningCheckinUtils.flushAndMarkMorningStep = flushAndMarkMorningStep;
  HEYS.MorningCheckinUtils.readMorningProgress = readMorningProgress;
  HEYS.MorningCheckinUtils.writeMorningProgress = writeMorningProgress;
  HEYS.MorningCheckinUtils.getMorningCheckinStatus = getMorningCheckinStatus;
  HEYS.MorningCheckinUtils.requiredDecisionModules = ['YesterdayVerify'];
  HEYS.MorningCheckinUtils.isYesterdayVerifyDecisionReady = isYesterdayVerifyDecisionReady;
  HEYS.MorningCheckinDebug = HEYS.MorningCheckinDebug || {};
  HEYS.MorningCheckinDebug.getStatus = getMorningCheckinStatus;
  HEYS.MorningCheckinDebug.readProgress = readMorningProgress;
  HEYS.MorningCheckinDebug.dump = function dumpMorningCheckinStatus(dateKey, clientId) {
    const status = getMorningCheckinStatus(dateKey, clientId);
    console.warn('[CHECKIN.flow] status_dump', status);
    return status;
  };

  // PERF v7.1: notify boot-chain hook that deferred module is ready
  window.dispatchEvent(new CustomEvent('heys-morning-checkin-ready'));

  /**
   * Быстрый API для показа конкретных шагов
   */
  HEYS.showCheckin = {
    // Полный утренний чек-ин
    morning: (onComplete) => {
      if (HEYS.StepModal) {
        const plan = buildMorningCheckinPlan({
          source: 'showCheckin.morning',
          requiredOnly: false
        });
        const steps = plan.steps;

        // Обёртка для onComplete: обновляем данные дня
        const wrappedOnComplete = () => {
          if (plan.isRegistrationCheckin) {
            console.log('[showCheckin.morning] ✅ Registration checkin completed');
          }
          return completeMorningCheckin(plan, onComplete);
        };

        HEYS.StepModal.show({
          steps,
          onComplete: wrappedOnComplete,
          closeOnComplete: 'after',
          allowSwipe: false,
          freezeVisibleSteps: true,
          forceVisibleStepIds: steps.includes('yesterdayVerify') ? ['yesterdayVerify'] : [],
          requireStepAck: true,
          allowProgressForwardNav: false,
          onStepSaved: createMorningStepAck(plan)
        });
      }
    },

    // Только вес
    weight: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['weight'],
          title: 'Взвешивание',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только шаги (цель)
    steps: (onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['stepsGoal'],
          title: 'Цель шагов',
          showProgress: false,
          onComplete
        });
      }
    },

    // Только сон
    sleep: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['sleepTime', 'sleepQuality'],
          title: 'Сон',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только дневной сон
    daySleep: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['daySleep'],
          title: 'Дневной сон',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только утреннее настроение
    morningMood: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['morning_mood'],
          title: 'Самочувствие',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только замеры тела
    measurements: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        // Если первый аргумент — функция, это onComplete (обратная совместимость)
        const actualDateKey = typeof dateKey === 'function' ? null : dateKey;
        const actualOnComplete = typeof dateKey === 'function' ? dateKey : onComplete;

        HEYS.StepModal.show({
          steps: ['measurements'],
          title: 'Замеры тела',
          showProgress: false,
          context: { dateKey: actualDateKey || new Date().toISOString().slice(0, 10) },
          onComplete: actualOnComplete
        });
      }
    },

    // Только дефицит калорий
    deficit: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['deficit'],
          title: 'Цель калорий',
          showProgress: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    },

    // Только добавки
    supplements: (dateKey, onComplete) => {
      if (HEYS.StepModal) {
        HEYS.StepModal.show({
          steps: ['supplements'],
          title: '💊 Добавки',
          showProgress: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    },

    // Добавить приём пищи (через MealStep)
    meal: (dateKey, onComplete) => {
      if (HEYS.MealStep) {
        HEYS.MealStep.showAddMeal({
          dateKey: dateKey || new Date().toISOString().slice(0, 10),
          onComplete
        });
      } else if (HEYS.StepModal) {
        // Fallback если MealStep не загружен
        HEYS.StepModal.show({
          steps: ['mealTime', 'mealMood'],
          title: 'Новый приём',
          showProgress: true,
          showStreak: false,
          showGreeting: false,
          showTip: false,
          context: { dateKey: dateKey || new Date().toISOString().slice(0, 10) },
          onComplete
        });
      }
    }
  };

  window.addEventListener('heys:day-updated', (event) => {
    const detail = event?.detail || {};
    const dateKey = detail?.date || getTodayKey();
    if (dateKey !== getTodayKey()) return;
    if (detail?.source === 'morning-activation-followup-open') return;
    if (detail?.source === 'morning-activation-followup-dismiss') return;
    if (detail?.source === 'morning-activation-followup-complete') return;
    // Ignore saves from within the followup itself — status is being persisted, no need to re-check
    if (detail?.source === 'morning-activation-followup') return;
    if (detail?.source === 'morning-activation-sync') return;
    if (detail?.source === 'morning-activation-skip-reason') return;
    // Background sync and product-row writes must NOT open the charge modal.
    // Follow-up is triggered only by explicit meal-flow finish below.
  });

  window.addEventListener('heysProductAdded', () => {
    logMorningActivationTrace('[MA.event] heysProductAdded — followup waits for meal-flow finish');
    setTimeout(() => maybeOpenMorningActivationSkipReason('product-added'), 240);
  });

  window.addEventListener('heys:ma-skip-reason-check', (ev) => {
    const dk = ev && ev.detail && ev.detail.dateKey;
    setTimeout(() => maybeOpenMorningActivationSkipReason('missed-save', dk), 90);
  });

  window.addEventListener('heys:meal-flow-finished', (event) => {
    const detail = event?.detail || {};
    const dateKey = detail.dateKey || getTodayKey();
    if (dateKey !== getTodayKey()) {
      logMorningActivationTrace('[MA.event] meal-flow-finished SKIP — another date', { dateKey });
      return;
    }
    lastMealSignalAt = Date.now();
    logMorningActivationTrace('[MA.event] heys:meal-flow-finished', detail);
    setTimeout(() => maybeOpenMorningActivationFollowup('meal-flow-finished'), 220);
  });

  window.addEventListener('heys:morning-activation-followup-completed', (event) => {
    const detail = event?.detail || {};
    const dateKey = detail.dateKey || getTodayKey();
    if (dateKey !== getTodayKey()) return;
    setTimeout(() => markMorningActivationFollowupCompleted(dateKey, detail.source || 'event', detail), 0);
  });

  window.addEventListener('heys:morning-activation-followup-dismissed', (event) => {
    const detail = event?.detail || {};
    const dateKey = detail.dateKey || getTodayKey();
    if (dateKey !== getTodayKey()) return;
    const currentClientId = getCurrentClientId();
    const dayData = readDayV2ScopedFirst(dateKey, {}) || {};
    const mealCount = Math.max(
      countMealsWithItems(dayData),
      Number(detail.mealCount) || 0
    );
    const existingSnoozeAt = Number(dayData?.morningActivation?.followupSnoozeUntilMealCount);
    if (!(Number.isFinite(existingSnoozeAt) && existingSnoozeAt >= mealCount)) {
      persistMorningActivationPatch(dateKey, {
        followupSnoozeUntilMealCount: mealCount
      }, 'morning-activation-followup-dismiss');
    }
    closeMorningActivationOverlay();
    try {
      if (typeof HEYS.StepModal?.hide === 'function' && isMainStepModalOpen()) {
        HEYS.StepModal.hide({ scrollToDiary: false });
      }
    } catch (_) {
      // ignore close fallback errors
    }
    try {
      const guardKey = `heys_morning_activation_followup_guard_${currentClientId || 'unknown'}_${dateKey}`;
      sessionStorage.setItem(guardKey, String(mealCount));
    } catch (_) {
      // sessionStorage may be unavailable
    }
    followupOpening = false;
  });

  window.addEventListener('heys:morning-activation-skip-reason-picked', (event) => {
    const detail = event?.detail || {};
    const dateKey = detail.dateKey || getTodayKey();
    if (dateKey !== getTodayKey()) return;
    closeMorningActivationOverlay();
    try {
      if (typeof HEYS.StepModal?.hide === 'function' && isMainStepModalOpen()) {
        HEYS.StepModal.hide({ scrollToDiary: false });
      }
    } catch (_) {
      // ignore close fallback errors
    }
    try {
      const currentClientId = getCurrentClientId();
      const answeredKey = `heys_ma_skip_reason_answered_${currentClientId || 'unknown'}_${dateKey}`;
      sessionStorage.setItem(answeredKey, '1');
    } catch (_) {
      // sessionStorage may be unavailable
    }
    skipReasonOpening = false;
  });

  // module-init trigger removed: at page-load localStorage may not yet contain today's day data
  // (HOT sync writes arrive later). The modal must only appear after explicit meal-flow finish.

  // console.log('[HEYS] MorningCheckin v2 loaded (using StepModal)');

})(typeof window !== 'undefined' ? window : global);
