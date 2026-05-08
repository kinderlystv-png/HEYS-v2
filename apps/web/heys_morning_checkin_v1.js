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
    const legacyParsed = tryDecompress(localStorage.getItem('heys_profile'));
    return isProfileShape(legacyParsed) ? legacyParsed : null;
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
  function readDayV2ScopedFirst(dateKey, fallback = {}) {
    const cid = getCurrentClientId();
    if (cid) {
      const scopedKey = `heys_${cid}_dayv2_${dateKey}`;
      const scoped = readStoredValue(scopedKey, null);
      if (scoped && typeof scoped === 'object') return scoped;
    }
    return readStoredValue(`heys_dayv2_${dateKey}`, fallback) || fallback;
  }

  /** Согласовано с heys_steps_v1.js saveDayData: scoped + unscoped + dayCache. */
  function writeDayV2ScopedAndLegacy(dateKey, dayData) {
    const cid = getCurrentClientId();
    if (cid) {
      const scopedKey = `heys_${cid}_dayv2_${dateKey}`;
      if (HEYS.store?.set) {
        HEYS.store.set(scopedKey, dayData);
      } else if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(scopedKey, dayData);
      }
    }
    const unscopedKey = `heys_dayv2_${dateKey}`;
    if (HEYS.store?.set) {
      HEYS.store.set(unscopedKey, dayData);
    } else if (HEYS.utils?.lsSet) {
      HEYS.utils.lsSet(unscopedKey, dayData);
    } else {
      try {
        localStorage.setItem(unscopedKey, JSON.stringify(dayData));
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
    dayData.updatedAt = Date.now();
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
      console.warn('[MA.guard] dayHasMorningActivationSyncedActivity=true via training', {
        source: foundTraining.source,
        activityLabel: foundTraining.activityLabel
      });
      return true;
    }
    const household = Array.isArray(dayData?.householdActivities) ? dayData.householdActivities : [];
    const foundHousehold = household.find((h) => h && h.source === 'morning_activation');
    if (foundHousehold) {
      console.warn('[MA.guard] dayHasMorningActivationSyncedActivity=true via household');
      return true;
    }
    console.warn('[MA.guard] dayHasMorningActivationSyncedActivity=false', {
      trainings: trainings.map(t => ({ source: t?.source, label: t?.activityLabel })),
      householdSources: household.map(h => h?.source)
    });
    return false;
  }

  function shouldOpenMorningActivationFollowup(dayData) {
    const hasMealsWithItems = countMealsWithItems(dayData) > 0;
    const firstMealTime = getFirstMealTime(dayData);
    const maStatus = dayData?.morningActivation?.status;
    const hasSynced = dayHasMorningActivationSyncedActivity(dayData);
    const trainings = (dayData?.trainings || []).map(t => ({
      source: t?.source,
      label: t?.activityLabel,
      zSum: Array.isArray(t?.z) ? t.z.reduce((s, v) => s + (Number(v) || 0), 0) : 0
    }));
    console.info('[MA.should] CHECK', {
      hasMealsWithItems,
      maStatus,
      hasSynced,
      trainings,
      household: (dayData?.householdActivities || []).map(h => ({ source: h?.source, label: h?.label }))
    });
    if (!hasMealsWithItems) {
      console.info('[MA.should] SKIP — no meals with items');
      return { ok: false, firstMealTime: null };
    }
    if (maStatus === 'missed') {
      console.info('[MA.should] SKIP — morningActivation missed');
      return { ok: false, firstMealTime };
    }
    // «done» в storage без карточки зарядки в trainings — пользователь удалил активность; флаг done устарел.
    if (maStatus === 'done' && hasSynced) {
      console.info('[MA.should] SKIP — done и карточка зарядки ещё в дне');
      return { ok: false, firstMealTime };
    }
    if (maStatus === 'done' && !hasSynced) {
      console.info('[MA.should] CONTINUE — status done, но synced MA-активности нет (после удаления карточки)');
    }
    if (hasSynced) {
      console.info('[MA.should] SKIP — synced MA-like activity in day');
      return { ok: false, firstMealTime };
    }
    console.info('[MA.should] OPEN — нет MA-активности в дне, maStatus=', maStatus);
    return { ok: true, firstMealTime };
  }

  /** Снимок для followup: store + актуальный React-день (удаление карточки может быть ещё не в LS). */
  function readDayDataMergedForMaFollowup(todayKey) {
    let d = readDayV2ScopedFirst(todayKey, {}) || {};
    try {
      const live = HEYS.Day && typeof HEYS.Day.getDay === 'function' ? HEYS.Day.getDay() : null;
      const liveDate = live && (live.date || todayKey);
      if (!live || String(liveDate) !== String(todayKey)) {
        console.info('[MA.followup] read: store only (no live day or date mismatch)', {
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
      console.info('[MA.followup] read: merged store+live', {
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
      console.info('[MA.followup] read: merge failed, store only', e && e.message);
      return d;
    }
  }

  let followupOpening = false;
  let skipReasonOpening = false;
  let lastMealSignalAt = 0;
  let pendingFollowupAfterProductFlow = false;

  function maybeOpenMorningActivationSkipReason(trigger = 'unknown', dateKeyArg) {
    const _tag = '[MA.skipReason]';
    if (skipReasonOpening) { console.info(_tag, 'SKIP: already opening', { trigger }); return; }
    if (!HEYS.StepModal?.show) { console.info(_tag, 'SKIP: no StepModal', { trigger }); return; }
    if (!HEYS.StepModal?.registry?.morning_activation_skip_reason) { console.info(_tag, 'SKIP: step not registered', { trigger }); return; }
    if (document.getElementById('heys-step-modal-root')) { console.info(_tag, 'SKIP: modal root exists', { trigger }); return; }

    const currentClientId = getCurrentClientId();
    if (!currentClientId) { console.info(_tag, 'SKIP: no clientId', { trigger }); return; }

    const dateKey = (typeof dateKeyArg === 'string' && dateKeyArg) ? dateKeyArg : getTodayKey();
    const dayData = readDayDataMergedForMaFollowup(dateKey);
    const ma = dayData?.morningActivation || {};

    if (ma.status !== 'missed') { console.info(_tag, 'SKIP: not missed', { maStatus: ma.status, trigger }); return; }
    if (!ma.skipReasonPending) { console.info(_tag, 'SKIP: not pending reason', { trigger }); return; }
    if (ma.skipReasonId) { console.info(_tag, 'SKIP: reason already set', { trigger }); return; }
    if (countMealsWithItems(dayData) < 1) { console.info(_tag, 'SKIP: no meals with items yet', { trigger }); return; }

    const answeredKey = `heys_ma_skip_reason_answered_${currentClientId}_${dateKey}`;
    try {
      if (sessionStorage.getItem(answeredKey) === '1') { console.info(_tag, 'SKIP: already answered session', { trigger }); return; }
    } catch (_) {
      // ignore
    }

    console.warn(_tag, 'OPENING skip-reason modal', { trigger, dateKey });
    skipReasonOpening = true;
    try {
      HEYS.StepModal.show({
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
    } catch (e) {
      skipReasonOpening = false;
      console.warn(_tag, 'show failed', e);
    }
  }

  function maybeOpenMorningActivationFollowup(reason = 'unknown') {
    const _tag = '[MA.followup]';
    if (followupOpening) { console.info(_tag, 'SKIP: followupOpening=true', { reason }); return; }
    if (!HEYS.StepModal?.show) { console.info(_tag, 'SKIP: no StepModal.show', { reason }); return; }
    if (!HEYS.StepModal?.registry?.morning_activation_followup) { console.info(_tag, 'SKIP: step not registered', { reason }); return; }
    if (document.getElementById('heys-step-modal-root')) { console.info(_tag, 'SKIP: modal root exists', { reason }); return; }

    const currentClientId = getCurrentClientId();
    if (!currentClientId) { console.info(_tag, 'SKIP: no clientId', { reason }); return; }
    const todayKey = getTodayKey();
    const dayData = readDayDataMergedForMaFollowup(todayKey);
    const check = shouldOpenMorningActivationFollowup(dayData);

    const _maStatus = dayData?.morningActivation?.status;
    const _trainingSources = (dayData?.trainings || []).map(t => t?.source).filter(Boolean);
    console.info(_tag, 'DECISION', {
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
      const syncedNow = dayHasMorningActivationSyncedActivity(dayData);
      const hasRealData = actualStatus === 'missed' || (actualStatus === 'done' && syncedNow) || syncedNow;
      if (hasRealData) {
        console.info(_tag, 'GUARD: confirmed by data', { guard: followupSessionGuard, mealCount, actualStatus, reason });
        return;
      }
      const userActionReasons = ['product-added', 'stepmodal-closed'];
      if (!userActionReasons.includes(reason)) {
        console.info(_tag, 'GUARD: kept (not user action)', { guard: followupSessionGuard, mealCount, reason });
        return;
      }
      if (reason === 'stepmodal-closed') {
        const signalAgeMs = Date.now() - lastMealSignalAt;
        if (!(Number.isFinite(signalAgeMs) && signalAgeMs >= 0 && signalAgeMs <= 2500)) {
          console.info(_tag, 'GUARD: kept (stepmodal-closed without recent meal signal)', {
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
      console.info(_tag, 'SNOOZE: blocked', { mealCount, snoozeAt, reason });
      return;
    }

    console.warn(_tag, 'OPENING MODAL', { reason, mealCount, maStatus: _maStatus, firstMealTime: check.firstMealTime });

    const currentState = dayData?.morningActivation || {};
    if (currentState.status !== 'pending' || currentState.firstMealTime !== check.firstMealTime) {
      persistMorningActivationPatch(todayKey, {
        status: 'pending',
        firstMealTime: check.firstMealTime
      }, 'morning-activation-followup-open');
    }

    followupOpening = true;
    try {
      sessionStorage.setItem(followupSessionGuardKey, String(mealCount));
    } catch (_) {
      // sessionStorage may be unavailable
    }
    HEYS.StepModal.show({
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
        const mc = countMealsWithItems(fresh);
        persistMorningActivationPatch(todayKey, {
          followupSnoozeUntilMealCount: mc
        }, 'morning-activation-followup-dismiss');
        console.info('[MorningCheckin] morning activation follow-up dismissed (Позже) — repeat after next meal add', {
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
        console.warn('[MA.followup] onComplete', {
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
  function shouldShowMorningCheckin() {
    const U = HEYS.utils || {};

    // Если клиент не выбран — НЕ показываем чек-ин (чтобы не показывать до авторизации)
    const currentClientId = getCurrentClientId();
    if (!currentClientId) {
      // console.log('[MorningCheckin] No clientId, skip check');
      return false;
    }

    const todayKey = getTodayKey();
    const sessionKey = getCheckinSessionKey(currentClientId, todayKey);

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
      console.info('[MorningCheckin] 🚫 Skip — sessionStorage флаг активен:', sessionKey);
      return false;
    }

    // 🔒 КРИТИЧНО: Если профиль не заполнен — ВСЕГДА показываем!
    // Регистрационные шаги (profile-personal, profile-body, etc.) обязательны для новых пользователей
    // Force-raw read минуя Store.get memory cache (закрывает race под VPN).
    const profile = readProfileForceRawScoped(currentClientId) || readStoredValue('heys_profile', {}) || {};

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

    const dayData = readDayV2ScopedFirst(todayKey, {});
    const calendarKey = new Date().toISOString().slice(0, 10);
    const altDayData = calendarKey !== todayKey ? readDayV2ScopedFirst(calendarKey, {}) : {};

    const hasWeightPrimary = dayData && dayData.weightMorning != null && dayData.weightMorning !== '' && dayData.weightMorning !== 0;
    const hasWeightAlt = altDayData && altDayData.weightMorning != null && altDayData.weightMorning !== '' && altDayData.weightMorning !== 0;
    const hasWeight = hasWeightPrimary || hasWeightAlt;

    console.info('[MorningCheckin] 🔍 shouldShowMorningCheckin check:', {
      clientId: currentClientId?.slice(0, 8),
      todayKey,
      calendarKey,
      weightMorningPrimary: dayData?.weightMorning,
      weightMorningAlt: altDayData?.weightMorning,
      hasWeightPrimary,
      hasWeightAlt,
      hasWeight,
      sessionKey,
      sessionFlag: sessionStorage.getItem(sessionKey),
    });

    // Показываем, если ни в эффективном дне (до 3:00 = вчера), ни в календарном ключе нет веса
    return !hasWeight;
  }

  /**
   * Централизованная функция для получения списка шагов чек-ина
   * Используется и в MorningCheckin, и в showCheckin.morning()
   */
  function getCheckinSteps(profile) {
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

    // 2. Шаг веса — ВСЕГДА спрашиваем в чек-ине
    // Вес в регистрации (целый) → профиль (базовый вес для расчётов)
    // Вес в чек-ине (с десятыми) → день (точное утреннее взвешивание)
    steps.push('weight');

    // 2.1. 📊 Верификация данных за вчера
    // Показывается ТОЛЬКО если вчера <50% калорий и хотя бы 1 приём пищи
    // Спрашивает: реальное голодание или незаполненные данные?
    steps.push('yesterdayVerify');

    // 3. Остальные шаги чек-ина
    steps.push('sleepTime', 'sleepQuality');

    // 3. 🔄 Загрузочный день (Refeed) — СРАЗУ после sleepQuality
    // Показывается всегда — клиент сам решает, система подсветит рекомендацию если есть долг
    steps.push('refeedDay');

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

    // 7. 😊 Утреннее настроение (обязательный шаг)
    steps.push('morning_mood');

    // 8. Завершающий шаг — цель по шагам
    steps.push('stepsGoal');

    // 9. 🌟 Мотивирующий финальный шаг
    steps.push('morningRoutine');

    return steps;
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

    // Если StepModal доступен — используем его
    if (HEYS.StepModal && HEYS.StepModal.Component) {
      const profile = readStoredValue('heys_profile', {});
      const steps = getCheckinSteps(profile);

      // Определяем: это регистрационный чек-ин (есть profile-шаги)?
      const isRegistrationCheckin = steps.includes('profile-personal');

      // Обёртка для onComplete: обновляем данные дня
      const wrappedOnComplete = () => {
        // 🎉 Поздравительная модалка теперь показывается как шаг 'welcome' внутри flow

        // 🎫 Автостарт триала УБРАН (v5.0)
        // Триал стартует только через куратора:
        //   1. Клиент оставляет заявку на лендинге
        //   2. Куратор одобряет → даёт PIN
        //   3. При первом логине → activate_trial_timer_by_session
        // См. database/2026-02-08_trial_machine_fix.sql

        // 🔔 Устанавливаем флаг для советов по витаминам
        try {
          const currentClientId = getCurrentClientId();
          const sessionKey = getCheckinSessionKey(currentClientId, todayKey);
          sessionStorage.setItem(sessionKey, 'true');
          sessionStorage.removeItem('heys_morning_checkin_done');
          // Очищаем флаг показа совета — чтобы он показался после чек-ина
          sessionStorage.removeItem('heys_morning_supplements_advice_shown');
        } catch (e) { /* sessionStorage недоступен */ }

        // 🔄 Принудительно обновляем данные дня после завершения чек-ина
        const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: todayKey, source: 'morning-checkin-complete', forceReload: true }
        }));

        // 💊 Вызываем событие для обновления советов
        window.dispatchEvent(new CustomEvent('heys:checkin-complete', {
          detail: { date: todayKey, type: 'morning' }
        }));

        if (onComplete) onComplete();
      };

      return React.createElement(HEYS.StepModal.Component, {
        steps: steps,
        onComplete: wrappedOnComplete,
        onClose: onClose, // Крестик в хедере для закрытия без сохранения
        showProgress: true,
        showStreak: true,
        showGreeting: true,
        showTip: true,
        allowSwipe: true
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

  // PERF v7.1: notify boot-chain hook that deferred module is ready
  window.dispatchEvent(new CustomEvent('heys-morning-checkin-ready'));

  /**
   * Быстрый API для показа конкретных шагов
   */
  HEYS.showCheckin = {
    // Полный утренний чек-ин
    morning: (onComplete) => {
      if (HEYS.StepModal) {
        const profile = readStoredValue('heys_profile', {});
        const steps = getCheckinSteps(profile);

        // Определяем: это регистрационный чек-ин (есть profile-шаги)?
        const isRegistrationCheckin = steps.includes('profile-personal');

        // Обёртка для onComplete: обновляем данные дня
        const wrappedOnComplete = () => {
          // 🎉 Поздравительная модалка теперь показывается как шаг 'welcome' внутри flow

          // 🎫 Автостарт триала уже произошёл в стартовом useEffect (через HEYS.Subscription)
          // Этот блок оставлен для логирования
          if (isRegistrationCheckin) {
            console.log('[showCheckin.morning] ✅ Registration checkin completed');
          }

          // 🔔 Устанавливаем флаг для советов по витаминам
          try {
            const currentClientId = getCurrentClientId();
            const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
            const sessionKey = getCheckinSessionKey(currentClientId, todayKey);
            sessionStorage.setItem(sessionKey, 'true');
            sessionStorage.removeItem('heys_morning_checkin_done');
            // Очищаем флаг показа совета — чтобы он показался после чек-ина
            sessionStorage.removeItem('heys_morning_supplements_advice_shown');
          } catch (e) { /* sessionStorage недоступен */ }

          // 🔄 Принудительно обновляем данные дня после завершения чек-ина
          const todayKey = (HEYS.utils && HEYS.utils.getTodayKey) ? HEYS.utils.getTodayKey() : new Date().toISOString().slice(0, 10);
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: todayKey, source: 'morning-checkin-complete', forceReload: true }
          }));

          // 💊 Вызываем событие для обновления советов
          window.dispatchEvent(new CustomEvent('heys:checkin-complete', {
            detail: { date: todayKey, type: 'morning' }
          }));

          if (onComplete) onComplete();
        };

        HEYS.StepModal.show({
          steps,
          onComplete: wrappedOnComplete
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
    // Only trigger followup if we are inside an active product-add flow.
    // Background sync (local-write, HOT events) must NOT open the modal on their own.
    if (!pendingFollowupAfterProductFlow) return;
    console.info('[MA.event] day-updated (product-flow) →', detail?.source, { field: detail?.field });
    setTimeout(() => maybeOpenMorningActivationFollowup(detail?.source || 'day-updated'), 60);
  });

  window.addEventListener('heysProductAdded', () => {
    lastMealSignalAt = Date.now();
    pendingFollowupAfterProductFlow = true;
    console.warn('[MA.event] heysProductAdded — pendingFollowupAfterProductFlow=true');
    setTimeout(() => maybeOpenMorningActivationSkipReason('product-added'), 240);
  });

  window.addEventListener('heys:ma-skip-reason-check', (ev) => {
    const dk = ev && ev.detail && ev.detail.dateKey;
    setTimeout(() => maybeOpenMorningActivationSkipReason('missed-save', dk), 90);
  });

  document.addEventListener('heys-stepmodal-closed', () => {
    console.warn('[MA.event] heys-stepmodal-closed', { pendingFollowupAfterProductFlow });
    if (!pendingFollowupAfterProductFlow) {
      console.warn('[MA.event] heys-stepmodal-closed SKIP — not a product-add flow');
      return;
    }
    pendingFollowupAfterProductFlow = false;
    setTimeout(() => maybeOpenMorningActivationFollowup('stepmodal-closed'), 220);
  });

  // module-init trigger removed: at page-load localStorage may not yet contain today's day data
  // (HOT sync writes arrive later). The modal must only appear after a product-add flow.

  // console.log('[HEYS] MorningCheckin v2 loaded (using StepModal)');

})(typeof window !== 'undefined' ? window : global);