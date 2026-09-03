// heys_steps_v1.js — Библиотека шагов для StepModal
// WeightStep, SleepTimeStep, SleepQualityStep, StepsGoalStep
(function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const { useState, useMemo, useCallback, useEffect, useRef } = React;

  // Ждём загрузки StepModal
  if (!HEYS.StepModal) {
    console.error('heys_steps_v1.js: HEYS.StepModal not found. Load heys_step_modal_v1.js first.');
    return;
  }

  const { WheelPicker, registerStep, utils } = HEYS.StepModal;
  // Используем общие утилиты из StepModal
  const { lsGet: baseLsGet, lsSet: baseLsSet, getTodayKey } = utils;

  const tryParseStoredValue = (raw, fallback) => {
    if (raw === null || raw === undefined) return fallback;
    if (typeof raw === 'string') {
      let str = raw;
      if (str.startsWith('¤Z¤') && HEYS.store?.decompress) {
        try { str = HEYS.store.decompress(str); } catch (_) {
          // Keep raw value when compressed payload is invalid
        }
      }
      try { return JSON.parse(str); } catch (_) { return str; }
    }
    return raw;
  };

  const lsGet = (key, def) => {
    try {
      if (HEYS.store?.get) {
        const stored = HEYS.store.get(key, null);
        if (stored !== null && stored !== undefined) {
          return tryParseStoredValue(stored, def);
        }
      }
      if (baseLsGet) return baseLsGet(key, def);
      const raw = localStorage.getItem(key);
      if (raw !== null && raw !== undefined) return tryParseStoredValue(raw, def);
      return def;
    } catch {
      return def;
    }
  };

  const lsSet = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      if (baseLsSet) {
        baseLsSet(key, value);
        return;
      }
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable in private mode
    }
  };

  const stopRangeGesture = (event) => {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
  };

  const getRangeGestureProps = (onValue) => {
    const handleRangeValue = (event) => {
      stopRangeGesture(event);
      const nextValue = Number(event.target.value);
      if (!Number.isFinite(nextValue)) return;
      onValue(nextValue, event);
    };

    return {
      onInput: handleRangeValue,
      onChange: handleRangeValue,
      onPointerDown: stopRangeGesture,
      onPointerMove: stopRangeGesture,
      onPointerUp: stopRangeGesture,
      onTouchStart: stopRangeGesture,
      onTouchMove: stopRangeGesture,
      onTouchEnd: stopRangeGesture,
      onMouseDown: stopRangeGesture,
      onMouseMove: stopRangeGesture,
      onMouseUp: stopRangeGesture
    };
  };

  function DragValueSlider({
    value,
    onValue,
    min = 1,
    max = 10,
    step = 1,
    className = 'mc-quality-slider',
    background,
    ariaLabel,
    ariaLabelTrack,
    style,
    variant,
    fill,
    thumbSize,
    valueToRatio = null,
    ratioToValue = null,
    stepForValue = null
  }) {
    const trackRef = useRef(null);
    const draggingRef = useRef(false);
    const numericValue = Number(value);
    const safeMin = Number(min);
    const safeMax = Number(max);
    const safeStep = Number(step) || 1;
    const resolveStep = (currentValue) => {
      if (typeof stepForValue === 'function') {
        const nextStep = Number(stepForValue(currentValue));
        if (Number.isFinite(nextStep) && nextStep > 0) return nextStep;
      }
      return safeStep;
    };
    const ratioFromValue = (currentValue) => {
      if (typeof valueToRatio === 'function') {
        const mapped = Number(valueToRatio(currentValue, safeMin, safeMax));
        if (Number.isFinite(mapped)) return Math.max(0, Math.min(1, mapped));
      }
      if (!(safeMax > safeMin)) return 0;
      return (Number(currentValue) - safeMin) / (safeMax - safeMin);
    };
    const valueFromRatio = (ratio) => {
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      if (typeof ratioToValue === 'function') {
        const mapped = Number(ratioToValue(clampedRatio, safeMin, safeMax));
        if (Number.isFinite(mapped)) {
          return Math.max(safeMin, Math.min(safeMax, mapped));
        }
      }
      const rawValue = safeMin + clampedRatio * (safeMax - safeMin);
      const stepped = Math.round(rawValue / safeStep) * safeStep;
      return Math.max(safeMin, Math.min(safeMax, stepped));
    };
    const percent = ratioFromValue(numericValue) * 100;
    const clampedPercent = Math.max(0, Math.min(100, percent));

    const valueFromClientX = (clientX) => {
      const rect = trackRef.current?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0) return numericValue;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return valueFromRatio(ratio);
    };

    const applyClientX = (clientX, event) => {
      stopRangeGesture(event);
      // `touch-action: none` below already owns the slider gesture. Calling
      // preventDefault from React's passive touch listener creates a browser
      // warning and adds work to every drag frame.
      if (event && event.type?.indexOf('touch') !== 0 && event.cancelable && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }
      const nextValue = valueFromClientX(clientX);
      if (nextValue !== numericValue) onValue(nextValue, event);
    };

    const startDrag = (event) => {
      draggingRef.current = true;
      if (event.currentTarget?.setPointerCapture && event.pointerId !== undefined) {
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch (_) {}
      }
      applyClientX(event.clientX, event);
    };

    const moveDrag = (event) => {
      if (!draggingRef.current) return;
      applyClientX(event.clientX, event);
    };

    const moveMouse = (event) => {
      if (!draggingRef.current) return;
      applyClientX(event.clientX, event);
    };

    const endDrag = (event) => {
      draggingRef.current = false;
      if (typeof document !== 'undefined') {
        document.removeEventListener('mousemove', moveMouse);
        document.removeEventListener('mouseup', endDrag);
      }
      stopRangeGesture(event);
    };

    const startMouse = (event) => {
      draggingRef.current = true;
      if (typeof document !== 'undefined') {
        document.addEventListener('mousemove', moveMouse);
        document.addEventListener('mouseup', endDrag);
      }
      applyClientX(event.clientX, event);
    };

    const touchClientX = (event) => {
      const touch = event.touches?.[0] || event.changedTouches?.[0];
      return touch ? touch.clientX : null;
    };

    const startTouch = (event) => {
      const clientX = touchClientX(event);
      if (clientX === null) return;
      draggingRef.current = true;
      applyClientX(clientX, event);
    };

    const moveTouch = (event) => {
      if (!draggingRef.current) return;
      const clientX = touchClientX(event);
      if (clientX === null) return;
      applyClientX(clientX, event);
    };

    const handleKeyDown = (event) => {
      let nextValue = numericValue;
      const keyStep = resolveStep(numericValue);
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') nextValue += keyStep;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') nextValue -= keyStep;
      else if (event.key === 'Home') nextValue = safeMin;
      else if (event.key === 'End') nextValue = safeMax;
      else return;
      event.preventDefault();
      onValue(Math.max(safeMin, Math.min(safeMax, nextValue)), event);
    };

    const isV4 = variant === 'v4' || String(className || '').indexOf('mc-v4-scale') !== -1;
    const fillColor = fill === 'act'
      ? 'var(--v4-sand-act, #c67139)'
      : '#7a8a5e';
    const thumbPx = isV4 ? (Number(thumbSize) || 20) : 34;

    return React.createElement('div', {
      ref: trackRef,
      className: `${className} mc-drag-slider${isV4 ? ' mc-v4-scale' : ''}${fill === 'act' ? ' mc-v4-scale--act' : ''}`,
      role: 'slider',
      tabIndex: 0,
      'aria-label': ariaLabel,
      ...(ariaLabelTrack ? { 'aria-valuetext': ariaLabelTrack } : {}),
      'aria-valuemin': safeMin,
      'aria-valuemax': safeMax,
      'aria-valuenow': numericValue,
      onPointerDown: startDrag,
      onPointerMove: moveDrag,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onTouchStart: startTouch,
      onTouchMove: moveTouch,
      onTouchEnd: endDrag,
      onMouseDown: startMouse,
      onMouseMove: moveMouse,
      onMouseUp: endDrag,
      onMouseLeave: endDrag,
      onKeyDown: handleKeyDown,
      style: Object.assign({
        position: 'relative',
        display: 'block',
        width: '100%',
        height: isV4 ? '26px' : '39px',
        borderRadius: isV4 ? '999px' : '4px',
        touchAction: 'none',
        userSelect: 'none',
        cursor: 'grab',
        background: isV4 ? (background || 'var(--v4-chip, #efe3cf)') : background
      }, style || {})
    },
      isV4 && React.createElement('span', {
        'aria-hidden': 'true',
        className: 'mc-v4-scale-fill',
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          height: '26px',
          width: `${clampedPercent}%`,
          borderRadius: 999,
          background: fillColor,
          pointerEvents: 'none'
        }
      }),
      React.createElement('span', {
        'aria-hidden': 'true',
        className: isV4 ? 'mc-v4-scale-thumb' : undefined,
        style: isV4 ? {
          position: 'absolute',
          left: `${clampedPercent}%`,
          top: '50%',
          width: thumbPx,
          height: thumbPx,
          transform: 'translate(-50%, -50%)',
          borderRadius: 999,
          background: 'var(--v4-bg, #fffaf1)',
          boxShadow: '0 1px 3px rgba(80, 50, 20, 0.25)',
          pointerEvents: 'none'
        } : {
          position: 'absolute',
          left: `calc(${clampedPercent}% - 17px)`,
          top: '50%',
          width: '34px',
          height: '34px',
          transform: 'translateY(-50%)',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
          boxShadow: '0 2px 8px rgba(59, 130, 246, 0.38)',
          pointerEvents: 'none'
        }
      })
    );
  }

  function resolveDateKey(rawDateKey) {
    const isIsoDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

    if (isIsoDate(rawDateKey)) return rawDateKey;

    if (rawDateKey instanceof Date && !Number.isNaN(rawDateKey.getTime())) {
      return rawDateKey.toISOString().slice(0, 10);
    }

    if (typeof rawDateKey === 'number') {
      const d = new Date(rawDateKey);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    if (rawDateKey && typeof rawDateKey === 'object') {
      if (isIsoDate(rawDateKey.dateKey)) return rawDateKey.dateKey;
      if (isIsoDate(rawDateKey.date)) return rawDateKey.date;
      if (rawDateKey.value instanceof Date && !Number.isNaN(rawDateKey.value.getTime())) {
        return rawDateKey.value.toISOString().slice(0, 10);
      }
    }

    const today = getTodayKey?.();
    if (isIsoDate(today)) return today;
    return new Date().toISOString().slice(0, 10);
  }

  function getCurrentClientId() {
    const cidFromRuntime = HEYS.currentClientId || HEYS.utils?.getCurrentClientId?.() || '';
    if (cidFromRuntime) return String(cidFromRuntime);

    const cidFromStore = lsGet('heys_client_current', '');
    if (cidFromStore && typeof cidFromStore === 'string') return String(cidFromStore);

    const pinSession = lsGet('heys_pin_session', null);
    if (pinSession?.clientId) return String(pinSession.clientId);

    const profile = lsGet('heys_profile', null);
    if (profile?.id) return String(profile.id);

    const cid = '';
    return String(cid || '');
  }

  function getScopedDayKey(dateKey) {
    const cid = getCurrentClientId();
    return cid ? `heys_${cid}_dayv2_${dateKey}` : null;
  }

  function hasStepValue(value) {
    return value !== undefined && value !== null && value !== '';
  }

  function hasPositiveStepNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }

  function hasSleepTime(dayData) {
    return hasStepValue(dayData?.sleepStart) && hasStepValue(dayData?.sleepEnd);
  }

  function getUnscopedDayKey(dateKey) {
    return `heys_dayv2_${dateKey}`;
  }

  function readDayData(dateKey, fallback = {}) {
    const scopedKey = getScopedDayKey(dateKey);
    if (scopedKey) {
      const scopedData = lsGet(scopedKey, null);
      if (scopedData && typeof scopedData === 'object') return scopedData;
      // 🛡️ P0 (2026-05-18 incident): если есть scoped key — НЕ делаем fallback
      // на unscoped `heys_dayv2_<date>`. Unscoped key — global LS shared между
      // всеми клиентами одного браузера. Для curator с двумя клиентами это
      // приводило к contamination: curator на Poplanton делает checkin → пишет
      // unscoped + scoped Poplanton. Switch на Александру → её scoped пуст →
      // fallback читает unscoped (Poplanton's data) → setDay → upload в Александра's
      // cloud. Возвращаем fallback (empty) — лучше пустой день чем чужие данные.
      return fallback;
    }
    return lsGet(getUnscopedDayKey(dateKey), fallback) || fallback;
  }

  function countMealItems(dayData) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    return meals.reduce((sum, meal) => sum + (Array.isArray(meal?.items) ? meal.items.length : 0), 0);
  }

  function countMealsWithItems(dayData) {
    const meals = Array.isArray(dayData?.meals) ? dayData.meals : [];
    return meals.filter((meal) => Array.isArray(meal?.items) && meal.items.length > 0).length;
  }

  function pickRicherDayData(a, b) {
    const left = a && typeof a === 'object' ? a : {};
    const right = b && typeof b === 'object' ? b : {};
    const leftItems = countMealItems(left);
    const rightItems = countMealItems(right);
    if (rightItems !== leftItems) return rightItems > leftItems ? right : left;
    const leftUpdated = Number(left.updatedAt) || 0;
    const rightUpdated = Number(right.updatedAt) || 0;
    return rightUpdated > leftUpdated ? right : left;
  }

  function matchesDateKey(dayData, dateKey) {
    if (!dayData || typeof dayData !== 'object') return false;
    return !dayData.date || !dateKey || String(dayData.date) === String(dateKey);
  }

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

  function flushDayTabBeforeRead() {
    try {
      if (typeof HEYS.Day?.requestFlush === 'function') {
        HEYS.Day.requestFlush({ force: true });
      }
    } catch (_) {
      // ignore flush errors
    }
  }

  function invalidateDayReadCaches(dateKey) {
    try {
      if (HEYS.dayCache && typeof HEYS.dayCache.invalidate === 'function') {
        HEYS.dayCache.invalidate(dateKey);
      }
    } catch (_) {
      // ignore
    }
    const unscoped = getUnscopedDayKey(dateKey);
    const scoped = getScopedDayKey(dateKey);
    try {
      if (HEYS.store?.invalidate) {
        HEYS.store.invalidate(unscoped);
        if (scoped) HEYS.store.invalidate(scoped);
      }
    } catch (_) {
      // ignore
    }
  }

  function readDayFromRawLocalStorage(dateKey) {
    const cid = getCurrentClientId();
    const keys = [];
    if (cid) keys.push(`heys_${cid}_dayv2_${dateKey}`);
    keys.push(`heys_dayv2_${dateKey}`);
    let best = null;
    let bestItems = -1;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      try {
        const raw = global.localStorage?.getItem(k);
        if (!raw) continue;
        const obj = tryParseStoredValue(raw, null);
        if (obj && typeof obj === 'object') {
          const n = countMealItems(obj);
          if (n > bestItems) {
            bestItems = n;
            best = obj;
          }
        }
      } catch (_) {
        // ignore parse errors
      }
    }
    return best;
  }

  function getLatestDayUpdatedAt(dateKey) {
    const candidates = [
      readDayData(dateKey, null),
      readDayFromRawLocalStorage(dateKey)
    ];
    return candidates.reduce((max, day) => {
      const updatedAt = Number(day?.updatedAt) || 0;
      return updatedAt > max ? updatedAt : max;
    }, 0);
  }

  function getFreshDayData(dateKey) {
    flushDayTabBeforeRead();
    invalidateDayReadCaches(dateKey);

    let result = readDayData(dateKey, {}) || {};
    try {
      const liveDay = HEYS.Day?.getDay?.();
      if (matchesDateKey(liveDay, dateKey)) {
        result = pickRicherDayData(result, liveDay);
      }
    } catch (_) {
      // ignore live day read errors
    }
    const scopedKey = getScopedDayKey(dateKey);
    if (scopedKey) {
      const scopedData = lsGet(scopedKey, null);
      if (matchesDateKey(scopedData, dateKey)) {
        result = pickRicherDayData(result, scopedData);
      }
    }
    const unscopedData = lsGet(getUnscopedDayKey(dateKey), null);
    if (matchesDateKey(unscopedData, dateKey)) {
      result = pickRicherDayData(result, unscopedData);
    }
    const rawLocal = readDayFromRawLocalStorage(dateKey);
    if (matchesDateKey(rawLocal, dateKey)) {
      result = pickRicherDayData(result, rawLocal);
    }
    return result && typeof result === 'object' ? result : {};
  }

  /** Перед MA persist/sync: приёмы из live только если там строго больше строк, чем в base (новый продукт уже в React). */
  function mergeDayMealsPreferLiveIfRicher(dateKey, dayData) {
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

  function saveDayData(dateKey, dayData) {
    const safeDayData = normalizeDayForDate(dateKey, dayData, '[HEYS.steps] saveDayData');
    if (!safeDayData) return false;
    const scopedKey = getScopedDayKey(dateKey);
    const notifyDayCache = () => {
      try {
        if (HEYS.dayCache && typeof HEYS.dayCache.notifyDateUpdated === 'function') {
          HEYS.dayCache.notifyDateUpdated(dateKey);
        }
      } catch (_) {
        // ignore
      }
    };
    if (scopedKey) {
      if (HEYS.store?.set) {
        HEYS.store.set(scopedKey, safeDayData);
      } else {
        lsSet(scopedKey, safeDayData);
      }
      // 🛡️ P0 (2026-05-18 incident): когда scoped key есть, НЕ пишем unscoped.
      // Unscoped — global LS shared между всеми клиентами одного браузера.
      // Раньше делали dual-write для backward compat с legacy модулями, но
      // это создавало cross-client contamination когда curator работает с
      // несколькими клиентами в одной сессии. Legacy модули которые читают
      // unscoped должны быть обновлены на scoped path (через HEYS.store).
      notifyDayCache();
      return true;
    }
    // Только если нет client-scope (нет авторизации/инициализации) — пишем
    // unscoped как fallback. Это редкий случай — обычно scope есть.
    if (HEYS.store?.set) {
      HEYS.store.set(getUnscopedDayKey(dateKey), safeDayData);
    } else {
      lsSet(getUnscopedDayKey(dateKey), safeDayData);
    }
    notifyDayCache();
    return true;
  }

  const MORNING_ACTIVATION_COPY_HISTORY_KEY = 'heys_morning_activation_copy_history_v1';

  /** Подписи для UI (карточка дня + мини-модалка «почему без зарядки») */
  const MORNING_ACTIVATION_SKIP_REASONS = [
    { id: 'no_time', label: 'Не было времени' },
    { id: 'low_mood', label: 'Плохое настроение или самочувствие' },
    { id: 'low_energy', label: 'Мало сил и энергии' },
    { id: 'other_priority', label: 'Были другие приоритеты' },
    { id: 'other', label: 'Другая причина' }
  ];
  const MORNING_ACTIVATION_INTENSITY_PRESETS = {
    super_light: {
      label: 'Суперлегкая',
      shortLabel: 'лёгк.',
      duration: 8
    },
    medium: {
      label: 'Средне',
      shortLabel: 'сред.',
      duration: 14
    },
    high: {
      label: 'Высокоинтенсивная',
      shortLabel: 'выс.',
      duration: 22
    }
  };

  const MORNING_ACTIVATION_COPY_VARIANTS = [
    {
      id: 'ma-1',
      opener: 'Небольшой импульс утром даёт телу «старт без рывка».',
      science: '2-8 минут мягкой мышечной активации улучшают нейромышечный тонус и снижают ощущение скованности к первому приёму пищи.',
      protocol: {
        low: '2 круга: тяга резинки к корпусу 6× + мягкая мобилизация плеч/шеи 60 секунд.',
        mid: '3 круга: тяга резинки 10× + присед с резинкой 8× + растяжка грудного отдела 40 секунд.',
        high: '4 круга: тяга 12× + присед 10× + выпады 8×/сторона + растяжка 45 секунд.'
      }
    },
    {
      id: 'ma-2',
      opener: 'Сегодня цель — не «героизм», а стабильный тонус.',
      science: 'Короткая зарядка утром повышает чувствительность к нагрузке днём и уменьшает накопление вялости в первой половине дня.',
      protocol: {
        low: '3 минуты: лопаточная тяга резинки + плавные наклоны и раскрытие грудной клетки.',
        mid: '6-8 минут: 3 блока по 2 минуты — резинка, корпус, растяжка.',
        high: '10-12 минут интервально: 40 секунд работа / 20 секунд отдых, 4-5 раундов.'
      }
    },
    {
      id: 'ma-3',
      opener: 'Сделай «микро-победу» до того, как день ускорится.',
      science: 'Ранняя активация крупных мышц повышает субъективную энергию и улучшает исполнительный контроль в утренние часы.',
      protocol: {
        low: 'Минимум: тяга резинки стоя 2×8 + растяжка икр и спины 90 секунд.',
        mid: 'База: 3×(тяга 10 + отведение рук 10 + растяжка 30 секунд).',
        high: 'Интенсив: 4×(тяга 12 + присед 12 + планка 30 секунд + растяжка 20 секунд).'
      }
    },
    {
      id: 'ma-4',
      opener: 'Мягкий старт сегодня важнее идеального плана.',
      science: 'Даже короткая рутина «резинка + растяжка» снижает утреннюю ригидность и помогает быстрее включиться в рабочий ритм.',
      protocol: {
        low: '4 минуты: резинка на верх спины + мобилизация шеи/плеч.',
        mid: '7 минут: резинка на спину + ягодичный мост + растяжка сгибателей бедра.',
        high: '12 минут: 3 круга силовой активации + динамическая растяжка.'
      }
    },
    {
      id: 'ma-5',
      opener: 'Сейчас достаточно одного точного шага — зарядки на 5-10 минут.',
      science: 'Короткая утренняя активность улучшает кровоток и субъективное ощущение «проснулся телом», что повышает шанс удержать режим в течение дня.',
      protocol: {
        low: '2-3 упражнения по 1 подходу: без отказа, только «разбудить» мышцы.',
        mid: '3 упражнения по 2 подхода: резинка, ноги, корпус + короткая растяжка.',
        high: '4 упражнения по 2-3 подхода: умеренно интенсивно, но без избыточного пульса.'
      }
    },
    {
      id: 'ma-6',
      opener: 'Пусть зарядка будет «тихим якорем» утра.',
      science: 'Повторяемый утренний ритуал формирует устойчивую привычку за счёт низкого порога входа и предсказуемого вознаграждения.',
      protocol: {
        low: 'Якорь-минимум: 1 круг резинки + 2 минуты растяжки.',
        mid: 'Стандарт: 2 круга резинки + 3 минуты суставной мобильности.',
        high: 'Продвинутый: 3-4 круга с контролем техники и дыхания.'
      }
    },
    {
      id: 'ma-7',
      opener: 'Лучше коротко и стабильно, чем редко и «идеально».',
      science: 'Регулярные короткие сессии активности дают более устойчивый поведенческий эффект, чем редкие перегруженные тренировки.',
      protocol: {
        low: '3-4 минуты: без таймера, плавный темп, акцент на амплитуду.',
        mid: '6-9 минут: таймер 45/15, 3-4 упражнения.',
        high: '10-14 минут: таймер 50/20, 4 упражнения + финальная растяжка.'
      }
    },
    {
      id: 'ma-8',
      opener: 'Проверь состояние и подбери режим, а не наоборот.',
      science: 'Автоподстройка по самочувствию снижает риск срыва: телу легче поддерживать рутину, когда нагрузка соответствует ресурсу дня.',
      protocol: {
        low: 'Режим восстановления: мобилизация + резинка в лёгкой амплитуде.',
        mid: 'Режим поддержки: умеренный объём без закисления.',
        high: 'Режим драйва: плотный блок с контролем дыхания и техники.'
      }
    },
    {
      id: 'ma-9',
      opener: 'Сделай зарядку как «переключатель внимания» на день.',
      science: 'Короткое движение утром активирует префронтальные сети и помогает быстрее перейти в режим выполнения задач.',
      protocol: {
        low: 'Фокус-блок 4 минуты: резинка + растяжка шеи/груди.',
        mid: 'Фокус-блок 7 минут: 2 круга с равномерным дыханием.',
        high: 'Фокус-блок 12 минут: 3-4 круга + короткая заминка.'
      }
    },
    {
      id: 'ma-10',
      opener: 'Ты уже в процессе: закрепи его короткой утренней зарядкой.',
      science: 'Утренняя активация уменьшает «входной барьер» для остальной активности дня и повышает вероятность завершить план по движению.',
      protocol: {
        low: 'Мини-протокол: 5 минут без пропусков, комфортный темп.',
        mid: 'Базовый протокол: 8-10 минут, умеренная плотность.',
        high: 'Интенсивный протокол: 12-15 минут, но без отказа.'
      }
    }
  ];

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

  function getFirstMealTimeFromDay(dayData) {
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

  function getEnergyBucket(mood, wellbeing, stress) {
    const normalizedStress = Math.max(0, Math.min(10, Number(stress) || 0));
    const normalizedMood = Math.max(0, Math.min(10, Number(mood) || 0));
    const normalizedWellbeing = Math.max(0, Math.min(10, Number(wellbeing) || 0));
    const score = (normalizedMood + normalizedWellbeing + (10 - normalizedStress)) / 3;
    if (score >= 7.2) return 'high';
    if (score >= 5.2) return 'mid';
    return 'low';
  }

  /**
   * Персональная рекомендация интенсивности утренней зарядки по mood/wellbeing/stress утра.
   * @returns {{ intensity: 'super_light'|'medium'|'high', bucket: string, hint: string }}
   */
  function getMorningActivationIntensityRecommendation(dayData) {
    const mood = dayData?.moodMorning;
    const wellbeing = dayData?.wellbeingMorning;
    const stress = dayData?.stressMorning;
    const hasMorning = [mood, wellbeing, stress].some((v) => Number.isFinite(Number(v)));
    const bucket = hasMorning ? getEnergyBucket(mood, wellbeing, stress) : 'mid';
    if (bucket === 'low') {
      return {
        intensity: 'super_light',
        bucket,
        hint: 'По утру ресурс ниже — начни с самого мягкого варианта.'
      };
    }
    if (bucket === 'high') {
      return {
        intensity: 'high',
        bucket,
        hint: 'Утро в хорошем тонусе — можешь выбрать более плотный блок, если телу комфортно.'
      };
    }
    return {
      intensity: 'medium',
      bucket,
      hint: 'Баланс утра — средняя интенсивность чаще всего попадает в ресурс.'
    };
  }

  // 'missed' здесь наравне с остальными: это тоже ответ человека («не сегодня»),
  // а не отсутствие ответа. 'skipped' оставлен для дней, записанных прежней
  // версией, — переписывать историю задним числом мы не будем.
  const MORNING_ACTIVATION_CHECKIN_STATUSES = new Set(['done', 'planned', 'skipped', 'missed']);

  // Последний кофе шага «Остальное». Три варианта отвечают границей, названной
  // на самой пилюле, четвёртый — своим временем; порог читает виджет
  // «Готовность ко сну», второго алгоритма нет.
  const MORNING_COFFEE_CHOICES = ['before12', 'exact', 'after17', 'none'];

  /**
   * Минута последнего кофе из ответа чек-ина — одно чтение поля на всех, кто
   * считает порог. `null` — не пил, `undefined` — не отвечал: ноль здесь
   * означал бы полночь, а не отсутствие ответа.
   * Бакеты отвечают числом, названным на самой пилюле: «до 12:00» — 12:00,
   * «после 17» — 17:00. Кому важна минута, тот выбирает своё время.
   */
  function getLastCoffeeMinutes(dayData) {
    const coffee = dayData && dayData.lastCoffee;
    if (!coffee) return undefined;
    if (coffee.choice === 'none') return null;
    if (coffee.choice === 'before12') return 12 * 60;
    if (coffee.choice === 'after17') return 17 * 60;
    if (coffee.choice === 'exact') {
      const parts = String(coffee.time || '').split(':');
      const hours = Number(parts[0]);
      const minutes = Number(parts[1]);
      if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
      return hours * 60 + minutes;
    }
    return undefined;
  }

  function isMorningActivationCheckinStatus(status) {
    return MORNING_ACTIVATION_CHECKIN_STATUSES.has(status);
  }

  function getMorningActivationBadgeMeta(state) {
    const intensityMeta = state?.intensity ? MORNING_ACTIVATION_INTENSITY_PRESETS[state.intensity] : null;
    if (state?.status === 'done') {
      const suffix = intensityMeta ? ` · ${intensityMeta.shortLabel}` : ' · была';
      return {
        label: `done${suffix}`,
        title: intensityMeta ? `Зарядка отмечена, интенсивность: ${intensityMeta.label}` : 'Зарядка была — интенсивность не уточняли',
        style: {
          border: '1px solid rgba(16, 185, 129, 0.35)',
          background: 'rgba(16, 185, 129, 0.12)',
          color: '#047857'
        }
      };
    }
    if (state?.status === 'planned') {
      return {
        label: 'сделаю',
        title: 'Рутина запланирована на сегодня',
        style: {
          border: '1px solid rgba(245, 158, 11, 0.35)',
          background: 'rgba(245, 158, 11, 0.12)',
          color: '#b45309'
        }
      };
    }
    if (state?.status === 'skipped' || state?.status === 'missed') {
      return {
        label: 'не сегодня',
        title: 'Рутина закрыта на сегодня',
        style: {
          border: '1px solid rgba(100, 116, 139, 0.35)',
          background: 'rgba(148, 163, 184, 0.08)',
          color: '#475569'
        }
      };
    }
    if (state?.status === 'pending') {
      return {
        label: 'pending',
        title: 'Первый приём пищи уже есть — подтверди статус зарядки',
        style: {
          border: '1px solid rgba(245, 158, 11, 0.35)',
          background: 'rgba(245, 158, 11, 0.12)',
          color: '#b45309'
        }
      };
    }
    return {
      label: 'до 1-го приёма',
      title: 'Метрика фиксируется после первого приёма пищи',
      style: {
        border: '1px solid rgba(100, 116, 139, 0.35)',
        background: 'rgba(148, 163, 184, 0.08)',
        color: '#475569'
      }
    };
  }

  let _morningActivationPlannedReminderTimer = null;
  let _morningActivationPlannedReminderId = null;

  function cancelMorningActivationPlannedReminder() {
    if (_morningActivationPlannedReminderTimer) {
      clearTimeout(_morningActivationPlannedReminderTimer);
      _morningActivationPlannedReminderTimer = null;
    }
    if (_morningActivationPlannedReminderId && HEYS.push?.cancelLocalNotification) {
      try {
        HEYS.push.cancelLocalNotification(_morningActivationPlannedReminderId);
      } catch (_) {
        // ignore
      }
    }
    _morningActivationPlannedReminderId = null;
  }

  function scheduleMorningActivationPlannedReminder(dateKey) {
    cancelMorningActivationPlannedReminder();
    const dayData = readDayData(dateKey, {});
    if (dayData?.morningActivation?.status !== 'planned') return;
    const now = new Date();
    const target = new Date(now);
    target.setHours(14, 0, 0, 0);
    if (target <= now) return;
    const payload = {
      id: `ma-planned-${dateKey}`,
      fireAt: target.getTime(),
      title: 'Утренняя рутина',
      body: 'Обещали сделать зарядку сегодня.',
      tag: `ma-planned-${dateKey}`
    };
    _morningActivationPlannedReminderId = payload.id;
    persistMorningActivationState(dateKey, {
      plannedReminderAt: target.toISOString()
    }, 'morning-activation-planned-reminder');
    if (HEYS.push?.scheduleLocalNotification) {
      HEYS.push.scheduleLocalNotification(payload).catch(() => {
        _morningActivationPlannedReminderTimer = setTimeout(() => {
          try {
            const fresh = readDayData(dateKey, {});
            if (fresh?.morningActivation?.status !== 'planned') return;
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(payload.title, {
                body: payload.body,
                tag: payload.tag
              });
            }
          } catch (_) {
            // ignore
          }
        }, payload.fireAt - Date.now());
      });
      return;
    }
    _morningActivationPlannedReminderTimer = setTimeout(() => {
      try {
        const fresh = readDayData(dateKey, {});
        if (fresh?.morningActivation?.status !== 'planned') return;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(payload.title, {
            body: payload.body,
            tag: payload.tag
          });
        }
      } catch (_) {
        // ignore
      }
    }, payload.fireAt - Date.now());
  }

  function getMorningActivationRoutineStreak() {
    try {
      const stats = HEYS.game?.getStats?.();
      const current = Number(stats?.morningActivationStreak?.current);
      if (Number.isFinite(current) && current > 0) return current;
    } catch (_) {
      // ignore
    }
    return 0;
  }

  function applyMorningActivationCheckinAnswer(dateKey, answer, source = 'morning-rest-routine') {
    const now = Date.now();
    const basePatch = {
      decidedAt: now,
      checkinAnsweredAt: now,
      followupSnoozeUntilMealCount: null,
      skipReasonPending: false
    };
    if (answer === 'done') {
      const saved = persistMorningActivationState(dateKey, {
        ...basePatch,
        status: 'done',
        intensity: null,
        intensitySource: null,
        postState: null,
        postEffect: null
      }, source);
      syncMorningActivationActivity(dateKey, {
        ...(saved?.morningActivation || {}),
        status: 'done',
        intensity: null
      });
      try {
        HEYS.game?.recordMorningActivationDone?.(dateKey);
      } catch (_) {
        // ignore
      }
      cancelMorningActivationPlannedReminder();
      return saved;
    }
    if (answer === 'planned') {
      const saved = persistMorningActivationState(dateKey, {
        ...basePatch,
        status: 'planned',
        intensity: null,
        intensitySource: null
      }, source);
      scheduleMorningActivationPlannedReminder(dateKey);
      return saved;
    }
    if (answer === 'skipped') {
      cancelMorningActivationPlannedReminder();
      // Статус пропуска начинает писаться (решение владельца 31 августа).
      // Раньше «не сегодня» писало 'skipped', которого не знал никто ниже:
      // календарь красил день пропуском только по фолбэку «прошлый день без
      // записи», слияние не считало ответ окончательным, а ветка вопроса
      // о причине была недостижима вовсе — её открытие требует 'missed'.
      const saved = persistMorningActivationState(dateKey, {
        ...basePatch,
        status: 'missed',
        skipReasonPending: true,
        intensity: null,
        intensitySource: null,
        postState: null,
        postEffect: null
      }, source);
      // Причину спрашиваем в тот же день. Обработчик сам дождётся первого
      // приёма пищи: два вопроса подряд — это допрос, а не сбор данных.
      try {
        global.dispatchEvent(new CustomEvent('heys:ma-skip-reason-check', {
          detail: { dateKey }
        }));
      } catch (_) { /* noop */ }
      return saved;
    }
    return null;
  }

  function needsHealthOptionalConsent(profileInput) {
    const profile = profileInput || lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    const measurementsAvailable = hf?.isMeasurementsFeatureAvailable
      ? hf.isMeasurementsFeatureAvailable(profile) !== false
      : true;
    const supplementsAvailable = hf?.isSupplementsFeatureAvailable
      ? hf.isSupplementsFeatureAvailable(profile) !== false
      : true;
    const needMeasurements = measurementsAvailable
      && !(hf?.isMeasurementsTrackingEnabled
        ? hf.isMeasurementsTrackingEnabled(profile)
        : profile.measurementsTrackingEnabled === true);
    const needSupplements = supplementsAvailable
      && !(hf?.isSupplementsTrackingEnabled
        ? hf.isSupplementsTrackingEnabled(profile)
        : profile.supplementsTrackingEnabled === true);
    return needMeasurements || needSupplements;
  }

  function shouldShowMorningRestConsentBanner(profileInput) {
    const profile = profileInput || lsGet('heys_profile', {}) || {};
    if (!needsHealthOptionalConsent(profile)) return false;
    const snoozeUntil = profile.healthOptionalConsentSnoozeUntil;
    const todayKey = getTodayKey();
    if (snoozeUntil && String(todayKey) < String(snoozeUntil).slice(0, 10)) return false;
    const count = Number(profile.healthOptionalConsentSnoozeCount) || 0;
    return count < 3;
  }

  function isMorningRestHealthConsentComplete(profileInput) {
    return !needsHealthOptionalConsent(profileInput || lsGet('heys_profile', {}) || {});
  }

  function getMorningRestConsentBannerCopy(profileInput) {
    const profile = profileInput || lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    const measurementsOn = hf?.isMeasurementsTrackingEnabled
      ? hf.isMeasurementsTrackingEnabled(profile)
      : profile.measurementsTrackingEnabled === true;
    const supplementsOn = hf?.isSupplementsTrackingEnabled
      ? hf.isSupplementsTrackingEnabled(profile)
      : profile.supplementsTrackingEnabled === true;
    if (!measurementsOn && !supplementsOn) {
      return {
        title: 'Замеры и добавки выключены',
        body: 'Обхваты и курс добавок — данные о здоровье. Их пишем только после отдельного согласия, которое можно отозвать одним касанием.'
      };
    }
    if (!supplementsOn) {
      return {
        title: 'Добавки выключены',
        body: 'Курс добавок — данные о здоровье. Подпишите согласие, чтобы видеть витамины в чек-ине и дневнике.'
      };
    }
    return {
      title: 'Замеры выключены',
      body: 'Обхваты тела — данные о здоровье. Подпишите согласие, чтобы напоминать о замерах в чек-ине.'
    };
  }

  function snoozeHealthOptionalConsent() {
    const profile = lsGet('heys_profile', {}) || {};
    const until = new Date();
    until.setDate(until.getDate() + 7);
    profile.healthOptionalConsentSnoozeUntil = until.toISOString().slice(0, 10);
    profile.healthOptionalConsentSnoozeCount = (Number(profile.healthOptionalConsentSnoozeCount) || 0) + 1;
    profile.updatedAt = Date.now();
    lsSet('heys_profile', profile);
    window.dispatchEvent(new CustomEvent('heys:profile-updated', {
      detail: { source: 'morning-rest-consent-snooze' }
    }));
    return profile;
  }

  function openHealthOptionalConsentFromCheckin() {
    const profile = lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    const tasks = [];
    const needMeasurements = hf?.isMeasurementsFeatureAvailable?.(profile) !== false
      && !(hf?.isMeasurementsTrackingEnabled?.(profile));
    const needSupplements = hf?.isSupplementsFeatureAvailable?.(profile) !== false
      && !(hf?.isSupplementsTrackingEnabled?.(profile));
    if (needMeasurements) tasks.push('body_measurements');
    if (needSupplements) tasks.push('supplements_tracking');
    if (!tasks.length) return Promise.resolve();
    return tasks.reduce((chain, consentType) => chain.then(() => (
      HEYS.Consents?.api?.requestOptionalFeatureConsent
        ? HEYS.Consents.api.requestOptionalFeatureConsent(consentType)
        : Promise.resolve()
    )), Promise.resolve());
  }

  function getRefeedStepsHint() {
    try {
      if (HEYS.caloricDebt?.needsRefeed === true) {
        const debt = Math.round(Number(HEYS.caloricDebt?.debt || HEYS.caloricDebt?.totalDebt) || 0);
        if (debt > 0) return `Советуем: долг ${debt.toLocaleString('ru-RU')} ккал`;
      }
    } catch (_) {
      // ignore
    }
    return 'Советуем: долг за три недели';
  }

  function isMorningRestMeasurementsConsentOn(profileInput) {
    const profile = profileInput || lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    if (hf && typeof hf.isMeasurementsFeatureAvailable === 'function'
      && hf.isMeasurementsFeatureAvailable(profile) === false) {
      return false;
    }
    if (hf && typeof hf.isMeasurementsTrackingEnabled === 'function') {
      return hf.isMeasurementsTrackingEnabled(profile);
    }
    return profile.measurementsTrackingEnabled === true;
  }

  function buildMorningRestSparseNote(flags) {
    const missing = [];
    if (flags.showConsentBanner) {
      // Плашка согласия — не дублируем в подписи.
    } else if (!flags.showSupplementsCard) {
      missing.push('добавок в курсе нет');
    }
    if (!flags.showMeasurements) missing.push('замеры свежие');
    if (!flags.showRefeed) missing.push('загрузочный не рекомендован');
    if (!missing.length) return '';
    return `${missing.join(', ')} — остались две ежедневные карточки: душ и рутина. Короче этого пятый шаг не бывает.`;
  }

  function clampMoodValue(value, fallback = 5) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(1, Math.min(10, Math.round(numeric)));
  }

  function normalizePostState(postState, fallback = null) {
    if (!postState || typeof postState !== 'object') return fallback;
    return {
      mood: clampMoodValue(postState.mood, 5),
      wellbeing: clampMoodValue(postState.wellbeing, 5),
      stress: clampMoodValue(postState.stress, 5)
    };
  }

  function normalizeMorningActivationState(dateKey, dayDataInput = null) {
    const dayData = dayDataInput && typeof dayDataInput === 'object' ? dayDataInput : readDayData(dateKey, {});
    const stored = dayData?.morningActivation && typeof dayData.morningActivation === 'object'
      ? dayData.morningActivation
      : {};
    const firstMealTime = stored.firstMealTime || getFirstMealTimeFromDay(dayData);
    let status = stored.status;
    if (!isMorningActivationCheckinStatus(status) && status !== 'missed') {
      status = firstMealTime ? 'pending' : 'pre_meal';
    }
    return {
      status,
      firstMealTime: firstMealTime || null,
      intensity: stored.intensity || null,
      intensitySource: stored.intensitySource || null,
      postState: normalizePostState(stored.postState, null),
      postEffect: stored.postEffect && typeof stored.postEffect === 'object' ? stored.postEffect : null,
      copyId: stored.copyId || null,
      decidedAt: stored.decidedAt || null,
      checkinAnsweredAt: stored.checkinAnsweredAt || null,
      plannedReminderAt: stored.plannedReminderAt || null
    };
  }

  function persistMorningActivationState(dateKey, nextState, source = 'morning-activation') {
    try {
      if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        HEYS.Day.requestFlush({ force: true });
      }
    } catch (_) {
      // ignore
    }
    let dayData = getFreshDayData(dateKey);
    dayData = mergeDayMealsPreferLiveIfRicher(dateKey, dayData);
    dayData.morningActivation = {
      ...(dayData.morningActivation || {}),
      ...nextState
    };
    dayData.updatedAt = Math.max(Date.now(), getLatestDayUpdatedAt(dateKey) + 1);
    saveDayData(dateKey, dayData);
    if (typeof window !== 'undefined') {
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
    return dayData;
  }

  function notifyMorningActivationFollowupCompleted(dateKey, source) {
    try {
      window.dispatchEvent(new CustomEvent('heys:morning-activation-followup-completed', {
        detail: {
          dateKey,
          source: source || 'morning-activation-followup',
          terminal: true
        }
      }));
    } catch (_) {
      // ignore
    }
  }

  function notifyMorningActivationFollowupDismissed(dateKey, mealCount) {
    try {
      window.dispatchEvent(new CustomEvent('heys:morning-activation-followup-dismissed', {
        detail: {
          dateKey,
          mealCount,
          source: 'morning-activation-followup-dismiss'
        }
      }));
    } catch (_) {
      // ignore
    }
  }

  function markMorningActivationSkipReasonAnswered(dateKey) {
    const clientId = getCurrentClientId();
    if (!clientId || !dateKey) return;
    try {
      sessionStorage.setItem(`heys_ma_skip_reason_answered_${clientId}_${dateKey}`, '1');
    } catch (_) {
      // sessionStorage can be unavailable in private mode
    }
  }

  function traceMorningActivation(event, payload = {}, level = 'info') {
    try {
      const clientId = getCurrentClientId();
      const body = {
        event,
        source: 'heys_steps_v1',
        client: String(clientId || '').slice(0, 8) || null,
        ...payload
      };
      if (!body.flowId && HEYS.LogTrace && typeof HEYS.LogTrace.makeFlowId === 'function') {
        body.flowId = HEYS.LogTrace.makeFlowId('morning-activation');
      }
      if (HEYS.LogTrace && typeof HEYS.LogTrace.trace === 'function') {
        HEYS.LogTrace.trace(level, '[HEYS.ma.trace]', body);
      } else {
        (level === 'warn' ? console.warn : console.info)('[HEYS.ma.trace]', body);
      }
      return body.flowId || null;
    } catch (_) {
      return null;
    }
  }

  function verifyMorningActivationSkipReasonWrite(dateKey, dayData, flowId) {
    try {
      if (!HEYS.LogTrace || typeof HEYS.LogTrace.verifyKvWrite !== 'function') return;
      const key = `heys_dayv2_${dateKey}`;
      const expectedSummary = typeof HEYS.LogTrace.summarizeValue === 'function'
        ? HEYS.LogTrace.summarizeValue(dayData)
        : null;
      HEYS.LogTrace.verifyKvWrite({
        prefix: '[HEYS.ma.trace]',
        flowId,
        key,
        expectedSummary,
        delayMs: 2500
      });
    } catch (_) {
      // Readback diagnostics must never block the user flow.
    }
  }

  function removeMorningActivationArtifacts(dayData) {
    const maZoneSignatures = new Set(['8,0,0,0', '8,6,0,0', '4,8,8,2']);
    const trainingZoneSignature = (training) => {
      const z = Array.isArray(training?.z) ? training.z : [];
      return [0, 1, 2, 3].map((i) => Number(z[i]) || 0).join(',');
    };
    const isMorningActivationLike = (training) => {
      if (!training || typeof training !== 'object') return false;
      if (training.source === 'morning_activation') return true;
      const label = typeof training.activityLabel === 'string' ? training.activityLabel.trim().toLowerCase() : '';
      if (label === 'зарядка') return true;
      if (String(training.type) === 'strength' && maZoneSignatures.has(trainingZoneSignature(training))) {
        const rawLabel = typeof training.activityLabel === 'string' ? training.activityLabel.trim() : '';
        if (!rawLabel) return true;
      }
      return false;
    };
    let changed = false;
    const trainings = Array.isArray(dayData.trainings) ? dayData.trainings : [];
    const filteredTrainings = trainings.filter((training) => !isMorningActivationLike(training));
    if (filteredTrainings.length !== trainings.length) {
      dayData.trainings = filteredTrainings;
      changed = true;
    }

    const householdActivities = Array.isArray(dayData.householdActivities) ? dayData.householdActivities : [];
    const filteredHousehold = householdActivities.filter((activity) => activity?.source !== 'morning_activation');
    if (filteredHousehold.length !== householdActivities.length) {
      dayData.householdActivities = filteredHousehold;
      changed = true;
    }

    const totalHousehold = (dayData.householdActivities || []).reduce((sum, activity) => sum + (Number(activity?.minutes) || 0), 0);
    if ((dayData.householdMin || 0) !== totalHousehold) {
      dayData.householdMin = totalHousehold;
      changed = true;
    }

    const householdTime = dayData.householdActivities?.[0]?.time || '';
    if ((dayData.householdTime || '') !== householdTime) {
      dayData.householdTime = householdTime;
      changed = true;
    }

    return changed;
  }

  function syncMorningActivationActivity(dateKey, stateInput) {
    try {
      if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        HEYS.Day.requestFlush({ force: true });
      }
    } catch (_) {
      // ignore
    }
    let dayData = getFreshDayData(dateKey);
    dayData = mergeDayMealsPreferLiveIfRicher(dateKey, dayData);
    const state = stateInput || normalizeMorningActivationState(dateKey, dayData);
    const mutationTs = Date.now();
    const householdBefore = JSON.stringify([
      dayData.householdActivities || [],
      dayData.householdMin || 0,
      dayData.householdTime || '',
    ]);
    let changed = removeMorningActivationArtifacts(dayData);
    const householdChanged = householdBefore !== JSON.stringify([
      dayData.householdActivities || [],
      dayData.householdMin || 0,
      dayData.householdTime || '',
    ]);

    if (state.status === 'done' && state.intensity && MORNING_ACTIVATION_INTENSITY_PRESETS[state.intensity]) {
      const minutesByZone = state.intensity === 'high'
        ? [4, 8, 8, 2]
        : state.intensity === 'medium'
          ? [8, 6, 0, 0]
          : [8, 0, 0, 0];
      const trainings = Array.isArray(dayData.trainings) ? dayData.trainings.slice() : [];
      const trainingEntry = {
        z: minutesByZone,
        time: state.firstMealTime || '',
        type: 'strength',
        activityLabel: 'Зарядка',
        source: 'morning_activation',
        intensity: state.intensity,
        mood: state.postState?.mood ?? 0,
        wellbeing: state.postState?.wellbeing ?? 0,
        stress: state.postState?.stress ?? 0,
        comment: '',
        updatedAt: mutationTs
      };
      const emptyIndex = trainings.findIndex((training) => {
        const totalMinutes = Array.isArray(training?.z)
          ? training.z.reduce((sum, item) => sum + (Number(item) || 0), 0)
          : 0;
        return totalMinutes === 0 && !training?.type && !training?.activityLabel;
      });
      if (emptyIndex >= 0) {
        trainings[emptyIndex] = trainingEntry;
      } else if (trainings.length < 3) {
        trainings.push(trainingEntry);
      } else {
        trainings[trainings.length - 1] = trainingEntry;
      }
      dayData.trainings = trainings;
      changed = true;
    }

    if (!changed) return;

    if (householdChanged) {
      dayData.householdUpdatedAt = Math.max(mutationTs, (Number(dayData.householdUpdatedAt) || 0) + 1);
    }
    dayData.updatedAt = Math.max(mutationTs, Number(dayData.householdUpdatedAt) || 0);
    // Тренировка несёт свои mood/wellbeing/stress — без пересчёта они не
    // попадают в среднее по дню, пока клиент не откроет вкладку дня.
    HEYS.dayCalculations?.applyDayAverages?.(dayData);
    saveDayData(dateKey, dayData);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'morningActivation',
          source: 'morning-activation-sync',
          forceReload: true,
          data: { ...dayData, date: dateKey }
        }
      }));
    }
  }

  function getMorningActivationCopyVariant(id) {
    return MORNING_ACTIVATION_COPY_VARIANTS.find((item) => item.id === id) || null;
  }

  function upsertMorningActivationCopyHistory(dateKey, variantId) {
    const historyRaw = lsGet(MORNING_ACTIVATION_COPY_HISTORY_KEY, []);
    const history = Array.isArray(historyRaw) ? historyRaw.filter((item) => item && item.date && item.id) : [];
    const withoutToday = history.filter((item) => item.date !== dateKey);
    const next = [...withoutToday, { date: dateKey, id: variantId }]
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))
      .slice(-21);
    lsSet(MORNING_ACTIVATION_COPY_HISTORY_KEY, next);
  }

  function pickMorningActivationCopy(dateKey, existingCopyId = null) {
    if (existingCopyId) {
      const existing = getMorningActivationCopyVariant(existingCopyId);
      if (existing) return existing;
    }

    const historyRaw = lsGet(MORNING_ACTIVATION_COPY_HISTORY_KEY, []);
    const history = Array.isArray(historyRaw) ? historyRaw.filter((item) => item && item.date && item.id) : [];
    const recentIds = history.slice(-5).map((item) => item.id);
    const freshPool = MORNING_ACTIVATION_COPY_VARIANTS.filter((variant) => !recentIds.includes(variant.id));
    const pool = freshPool.length ? freshPool : MORNING_ACTIVATION_COPY_VARIANTS;

    const numericSeed = String(dateKey || getTodayKey())
      .split('')
      .reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const selected = pool[numericSeed % pool.length] || MORNING_ACTIVATION_COPY_VARIANTS[0];
    upsertMorningActivationCopyHistory(dateKey, selected.id);
    return selected;
  }

  // ============================================================
  // WEIGHT STEP
  // ============================================================

  function isEstimatedMorningWeight(day) {
    const source = String(day?.weightMorningSource || '');
    if (source === 'estimated_avg' || source === 'estimated_profile') return true;
    return !!(day && day.weightMorningEstimated === true);
  }

  function isMeasuredMorningWeight(day) {
    const weight = Number(day?.weightMorning);
    return Number.isFinite(weight) && weight > 0 && !isEstimatedMorningWeight(day);
  }

  function formatEstimateSampleDate(iso) {
    try {
      const date = new Date(`${iso}T12:00:00`);
      if (Number.isNaN(date.getTime())) return iso;
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    } catch (_) {
      return iso;
    }
  }

  function collectRecentMeasuredWeights(limit = 3) {
    const todayKey = typeof getTodayKey === 'function' ? getTodayKey() : new Date().toISOString().slice(0, 10);
    const [year, month, day] = String(todayKey).split('-').map(Number);
    const today = new Date(year, (month || 1) - 1, day || 1);
    const samples = [];
    for (let i = 1; i <= 60 && samples.length < limit; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayData = readDayData(key, {});
      if (isMeasuredMorningWeight(dayData)) {
        samples.push({ date: key, weight: +dayData.weightMorning });
      }
    }
    return samples;
  }

  function estimateMorningWeight() {
    const samples = collectRecentMeasuredWeights(3);
    if (samples.length >= 3) {
      const avg = samples.reduce((sum, item) => sum + item.weight, 0) / samples.length;
      return {
        weight: Math.round(avg * 10) / 10,
        source: 'estimated_avg',
        samples,
      };
    }
    const profile = lsGet('heys_profile', { weight: 70 }) || {};
    const profileWeight = Number(profile.weight);
    return {
      weight: Math.round((profileWeight > 0 ? profileWeight : 70) * 10) / 10,
      source: 'estimated_profile',
      samples,
    };
  }

  function mapEstimateSource(raw) {
    if (raw === 'estimated_avg' || raw === 'average3') return 'estimated_avg';
    if (raw === 'estimated_profile' || raw === 'profile') return 'estimated_profile';
    return raw === 'measured' ? 'measured' : 'estimated_profile';
  }

  function persistMorningWeight(dateKey, weight, { estimated = false, source = null } = {}) {
    const dayData = getFreshDayData(dateKey);
    const mutationAt = Math.max(Date.now(), (Number(dayData.weightUpdatedAt) || 0) + 1);
    dayData.date = dateKey;
    dayData.weightMorning = weight;
    dayData.weightUpdatedAt = mutationAt;
    dayData.updatedAt = mutationAt;
    if (estimated) {
      const mapped = mapEstimateSource(source || 'profile');
      dayData.weightMorningSource = mapped;
      dayData.weightMorningEstimated = true;
      dayData.weightMorningEstimateSource = mapped;
    } else {
      dayData.weightMorningSource = 'measured';
      delete dayData.weightMorningEstimated;
      delete dayData.weightMorningEstimateSource;
      dayData._curatorEdits = HEYS.models?.clearCuratorMarks?.(dayData, 'weightMorning', mutationAt);
    }
    return { saved: saveDayData(dateKey, dayData), dayData, mutationAt };
  }

  function getLastKnownWeight() {
    const profile = lsGet('heys_profile', { weight: 70 });
    const today = new Date();

    const todayKey = today.toISOString().slice(0, 10);
    const todayData = readDayData(todayKey, {});
    if (isMeasuredMorningWeight(todayData)) {
      return { weight: todayData.weightMorning, daysAgo: 0, date: todayKey };
    }

    for (let i = 1; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, {});
      if (isMeasuredMorningWeight(dayData)) {
        return { weight: dayData.weightMorning, daysAgo: i, date: key };
      }
    }
    if (profile.weight) {
      return { weight: profile.weight, daysAgo: null, date: null };
    }
    return { weight: 70, daysAgo: null, date: null };
  }

  function getYesterdayWeight() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    const dayData = readDayData(key, {});
    return isMeasuredMorningWeight(dayData) ? dayData.weightMorning : null;
  }

  function getWeightForecast() {
    const weights = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, {});
      if (isMeasuredMorningWeight(dayData)) {
        weights.push({ day: -i, weight: dayData.weightMorning });
      }
    }
    if (weights.length < 3) return null;
    const n = weights.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of weights) {
      sumX += p.day;
      sumY += p.weight;
      sumXY += p.day * p.weight;
      sumXX += p.day * p.day;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    const forecastWeight = intercept + slope * 14;
    const weeklyChange = slope * 7;
    return {
      weight: Math.round(forecastWeight * 10) / 10,
      weeklyChange: Math.round(weeklyChange * 100) / 100,
      confidence: weights.length >= 7 ? 'high' : 'low'
    };
  }

  function getWeekWeightDelta(currentWeight) {
    const samples = collectRecentMeasuredWeights(14);
    if (!samples.length) return null;
    const todayKey = typeof getTodayKey === 'function' ? getTodayKey() : new Date().toISOString().slice(0, 10);
    const [year, month, day] = String(todayKey).split('-').map(Number);
    const today = new Date(year, (month || 1) - 1, day || 1);
    let best = null;
    let bestDist = 99;
    samples.forEach((sample) => {
      const [sy, sm, sd] = String(sample.date).split('-').map(Number);
      const then = new Date(sy, (sm || 1) - 1, sd || 1);
      const daysAgo = Math.round((today - then) / 86400000);
      const dist = Math.abs(daysAgo - 7);
      if (daysAgo >= 4 && dist < bestDist) {
        best = sample;
        bestDist = dist;
      }
    });
    if (!best) return null;
    const delta = Number(currentWeight) - Number(best.weight);
    if (!Number.isFinite(delta)) return null;
    return Math.round(delta * 10) / 10;
  }

  function buildDailyCheckinGreeting({ firstMorning, evening } = {}) {
    const profile = lsGet('heys_profile', {}) || {};
    const firstName = String(profile.firstName || '').trim();
    const now = new Date();
    const weekday = now.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    const capWeekday = weekday ? weekday.charAt(0).toUpperCase() + weekday.slice(1) : '';
    const dateLine = firstMorning && capWeekday ? `${capWeekday} — первый день недели` : capWeekday;
    const streak = firstMorning ? 0 : Number(HEYS.Day?.getStreak?.() || 0);
    // Шапка первого вопроса — не вопрос чек-ина, но «Доброе утро» в 20:00 врёт.
    // Берём уже существующее в продукте вечернее приветствие (login-экран).
    // Строка «чек-ин не пройден до вечера» запрещает второй набор формулировок
    // под один экран; приветствие в него не входит — это не вопрос и не подпись
    // ответа, а та же строка продукта, что на входе.
    const hello = evening ? 'Добрый вечер' : 'Доброе утро';
    const title = firstName ? `${hello}, ${firstName}` : hello;
    return React.createElement('div', { className: 'mc-daily-greeting' },
      React.createElement('div', { className: 'mc-daily-greeting-title' }, title),
      React.createElement('div', { className: 'mc-daily-greeting-date' }, dateLine),
      streak > 0 && React.createElement('div', {
        className: 'mc-daily-streak-banner',
        style: { borderRadius: 16 }
      },
        React.createElement('span', { className: 'mc-daily-streak-count' }, String(streak)),
        React.createElement('span', { className: 'mc-daily-streak-text' },
          streak === 1
            ? 'день подряд — отметьте сегодня, чтобы продолжить серию'
            : 'дней подряд — отметьте сегодня, чтобы продолжить серию')
      )
    );
  }

  function WeightStepComponent({ data, onChange, context }) {
    const lastWeight = useMemo(() => getLastKnownWeight(), []);
    const measuredHistory = useMemo(() => collectRecentMeasuredWeights(14), []);

    const estimated = data.estimated === true;
    const estimateSource = data.estimateSource || 'profile';
    const estimateSamples = Array.isArray(data.estimateSamples) ? data.estimateSamples : [];
    const weightKg = data.weightKg ?? Math.floor(lastWeight.weight);
    const weightG = data.weightG ?? Math.round((lastWeight.weight % 1) * 10);
    const currentWeight = weightKg + weightG / 10;
    const isFirstMorning = !estimated && measuredHistory.length === 0;
    const weekDelta = !estimated && !isFirstMorning ? getWeekWeightDelta(currentWeight) : null;
    const weightLabel = currentWeight.toFixed(1).replace('.', ',');
    const greeting = context?.dailyCheckin && !estimated
      ? buildDailyCheckinGreeting({
        firstMorning: isFirstMorning,
        evening: context?.daypart === 'evening'
      })
      : null;

    const kgValues = useMemo(() => Array.from({ length: 101 }, (_, i) => 40 + i), []);
    const gValues = useMemo(() => Array.from({ length: 10 }, (_, i) => i), []);

    const prevWeightGRef = useRef(weightG);

    useEffect(() => {
      prevWeightGRef.current = weightG;
    }, [weightG]);

    const weightInitialRef = useRef(null);
    useEffect(() => {
      if (estimated) return undefined;
      if (weightInitialRef.current === null) {
        weightInitialRef.current = { kg: weightKg, g: weightG };
        return undefined;
      }
      if (weightKg === weightInitialRef.current.kg && weightG === weightInitialRef.current.g) {
        return undefined;
      }
      const timer = setTimeout(() => {
        const dateKey = getTodayKey();
        persistMorningWeight(dateKey, (weightKg || 70) + (weightG || 0) / 10, { estimated: false });
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('heys:day-updated', {
            detail: { date: dateKey, field: 'weightMorning', value: (weightKg || 70) + (weightG || 0) / 10, source: 'weight-step-immediate' }
          }));
        }
      }, 500);
      return () => clearTimeout(timer);
    }, [weightKg, weightG, estimated]);

    const setWeightKg = (v) => onChange({ ...data, estimated: false, weightKg: v, weightG: data.weightG ?? weightG });
    const setWeightG = (v) => {
      const prevG = prevWeightGRef.current;
      const currentKg = data.weightKg ?? weightKg;
      let nextKg = currentKg;

      if (prevG === 9 && v === 0) {
        const currentIndex = kgValues.indexOf(currentKg);
        const nextIndex = currentIndex >= 0
          ? (currentIndex + 1) % kgValues.length
          : 0;
        nextKg = kgValues[nextIndex];
      } else if (prevG === 0 && v === 9) {
        const currentIndex = kgValues.indexOf(currentKg);
        const nextIndex = currentIndex >= 0
          ? (currentIndex - 1 + kgValues.length) % kgValues.length
          : kgValues.length - 1;
        nextKg = kgValues[nextIndex];
      }

      prevWeightGRef.current = v;
      onChange({ ...data, estimated: false, weightKg: nextKg, weightG: v });
    };

    const applyEstimate = () => {
      const estimate = estimateMorningWeight();
      onChange({
        ...data,
        estimated: true,
        estimateSource: estimate.source,
        estimateSamples: estimate.samples,
        weightKg: Math.floor(estimate.weight),
        weightG: Math.round((estimate.weight % 1) * 10),
      });
      const dateKey = getTodayKey();
      persistMorningWeight(dateKey, estimate.weight, { estimated: true, source: estimate.source });
    };

    const estimatedBadge = estimateSource === 'estimated_avg' || estimateSource === 'average3'
      ? 'Расчётный'
      : 'Из профиля';
    const estimatedHint = estimateSource === 'estimated_avg' || estimateSource === 'average3'
      ? 'Норма дня эту цифру берёт, тренд и график — нет. Серия растёт как обычно.'
      : 'Как только наберётся три взвешивания, расчётный вес начнёт считаться по ним.';

    if (estimated) {
      return React.createElement('div', {
        className: 'mc-weight-step mc-weight-step--estimated',
        style: { display: 'flex', flexDirection: 'column', alignItems: 'center' }
      },
        greeting,
        React.createElement('div', { className: 'mc-step-kicker' }, 'Вес на утро'),
        React.createElement('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 } },
          React.createElement('span', { style: { fontSize: 58, fontWeight: 600, lineHeight: 0.9, color: 'rgba(0,0,0,.45)', letterSpacing: '-0.045em' } }, weightLabel),
          React.createElement('span', { style: { fontSize: 13, fontWeight: 600, lineHeight: 1, color: 'rgba(0,0,0,.38)' } }, 'кг')
        ),
        React.createElement('div', {
          style: {
            marginTop: 12, padding: '5px 12px', borderRadius: 999, background: 'var(--v4-chip, #efe3cf)',
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--v4-act-text, #8a4a20)'
          }
        }, estimatedBadge),
        React.createElement('div', {
          style: { width: '100%', background: '#f7efe2', borderRadius: 20, padding: '15px 17px', marginTop: 22 }
        },
          estimateSource === 'estimated_avg' || estimateSource === 'average3'
            ? [
              React.createElement('div', {
                key: 'title',
                style: { fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: 'rgba(0,0,0,.6)' }
              }, 'Среднее за три последних взвешивания'),
              ...estimateSamples.map((sample) => React.createElement('div', {
                key: sample.date,
                // Строка контракта «вторичные тоны» (уточнение 2 сентября по
                // контрасту): строки прошлых взвешиваний стояли на 42–50 %
                // (контраст 2,98–3,87) и подняты до дна тона — 56 %. Это роль
                // --v4-ink-data, а не литерал: в тёмных наборах она считается
                // от чернил набора.
                style: { display: 'flex', justifyContent: 'space-between', marginTop: 11, fontSize: 12, fontWeight: 600, lineHeight: 1, color: 'var(--v4-ink-data, rgba(0,0,0,.56))' }
              },
                React.createElement('span', null, formatEstimateSampleDate(sample.date)),
                React.createElement('span', null, `${Number(sample.weight).toFixed(1).replace('.', ',')} кг`)
              ))
            ]
            : React.createElement('div', {
              style: { fontSize: 11.5, fontWeight: 600, lineHeight: 1.5, color: 'rgba(0,0,0,.6)' }
            }, 'Взвешиваний пока меньше трёх — среднее считать не из чего, берём вес из анкеты.')
        ),
        React.createElement('p', {
          style: { fontSize: 11, fontWeight: 500, lineHeight: 1.5, color: 'rgba(0,0,0,.45)', marginTop: 14, textAlign: 'center' }
        }, estimatedHint),
        !context?.dailyCheckin && React.createElement('button', {
          type: 'button',
          onClick: () => onChange({ ...data, estimated: false }),
          style: {
            marginTop: 18, minHeight: 44, padding: '10px 16px', border: 'none', background: 'transparent',
            color: 'rgba(0,0,0,.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer'
          }
        }, 'Ввести вес')
      );
    }

    return React.createElement('div', { className: 'mc-weight-step' },
      greeting,
      React.createElement('div', { className: 'mc-weight-hero' },
        React.createElement('div', { className: 'mc-step-kicker' }, 'Вес на утро'),
        React.createElement('div', { className: 'mc-weight-hero-row' },
          React.createElement('span', { className: 'mc-weight-hero-value' }, weightLabel),
          React.createElement('span', { className: 'mc-weight-hero-unit' }, 'кг')
        ),
        weekDelta !== null && React.createElement('div', {
          className: 'mc-weight-week-delta' + (weekDelta < 0 ? ' mc-weight-week-delta--down' : weekDelta > 0 ? ' mc-weight-week-delta--up' : '')
        },
          weekDelta < 0 && React.createElement('svg', {
            width: 13,
            height: 13,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 3.2,
            strokeLinecap: 'round',
            'aria-hidden': 'true'
          }, React.createElement('path', { d: 'M6 15l6-6 6 6' })),
          weekDelta > 0 && React.createElement('svg', {
            width: 13,
            height: 13,
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 3.2,
            strokeLinecap: 'round',
            'aria-hidden': 'true'
          }, React.createElement('path', { d: 'M6 9l6 6 6-6' })),
          `${weekDelta > 0 ? '+' : ''}${String(weekDelta).replace('.', ',')} кг за неделю`
        ),
        isFirstMorning && React.createElement('div', {
          className: 'mc-recorded-hint',
          style: { textAlign: 'center', marginTop: 12 }
        }, 'Из профиля — поправьте, если весы показывают другое')
      ),
      React.createElement('div', {
        className: 'mc-weight-kilo-card',
        // Контракт «капсула веса»: радиус 22.
        style: { borderRadius: 22, overflow: 'hidden' }
      },
        React.createElement('div', { className: 'mc-kilo-label' }, 'Килограммы'),
        React.createElement('div', { className: 'mc-weight-pickers' },
          React.createElement(WheelPicker, {
            values: kgValues,
            value: weightKg,
            onChange: setWeightKg,
            label: '',
            compact: true
          }),
          React.createElement('span', { className: 'mc-weight-comma' }, ','),
          React.createElement(WheelPicker, {
            values: gValues,
            value: weightG,
            onChange: setWeightG,
            label: '',
            compact: true
          })
        )
      ),
      isFirstMorning && React.createElement('p', {
        className: 'mc-recorded-hint',
        style: { textAlign: 'center', marginTop: 16 }
      }, 'Динамика появится через неделю взвешиваний.'),
      !context?.dailyCheckin && React.createElement('button', {
        type: 'button',
        onClick: applyEstimate,
        style: {
          marginTop: 16, width: '100%', minHeight: 48, borderRadius: 999, border: 'none',
          background: 'var(--v4-sand-hero, #f7efe2)', color: 'rgba(0,0,0,.55)', fontSize: 12, fontWeight: 700, cursor: 'pointer'
        }
      }, 'Не взвешивался')
    );
  }

  registerStep('weight', {
    title: 'Вес',
    hint: 'Взвесьтесь натощак',
    component: WeightStepComponent,
    secondaryLabelWhen: (data) => (data && data.estimated ? 'Ввести вес' : 'Не взвешивался'),
    applySecondary: (data) => {
      if (data && data.estimated) {
        return { ...data, estimated: false };
      }
      const estimate = estimateMorningWeight();
      const dateKey = getTodayKey();
      persistMorningWeight(dateKey, estimate.weight, { estimated: true, source: estimate.source });
      return {
        ...(data || {}),
        estimated: true,
        estimateSource: estimate.source,
        estimateSamples: estimate.samples,
        weightKg: Math.floor(estimate.weight),
        weightG: Math.round((estimate.weight % 1) * 10),
      };
    },
    getInitialData: (context) => {
      if (context && context.dateKey) {
        const dayData = readDayData(context.dateKey, {});
        if (isEstimatedMorningWeight(dayData) && Number(dayData.weightMorning) > 0) {
          return {
            estimated: true,
            estimateSource: mapEstimateSource(dayData.weightMorningSource || dayData.weightMorningEstimateSource || 'profile'),
            estimateSamples: collectRecentMeasuredWeights(3),
            weightKg: Math.floor(dayData.weightMorning),
            weightG: Math.round((dayData.weightMorning % 1) * 10)
          };
        }
        if (isMeasuredMorningWeight(dayData)) {
          return {
            weightKg: Math.floor(dayData.weightMorning),
            weightG: Math.round((dayData.weightMorning % 1) * 10)
          };
        }
      }
      const last = getLastKnownWeight();
      return {
        weightKg: Math.floor(last.weight),
        weightG: Math.round((last.weight % 1) * 10)
      };
    },
    save: (data, context) => {
      const dateKey = (context && context.dateKey) || getTodayKey();
      const estimated = data.estimated === true;
      const estimate = estimated ? estimateMorningWeight() : null;
      const fromPicker = (data.weightKg || 70) + (data.weightG || 0) / 10;
      const weight = estimated
        ? (Number.isFinite(fromPicker) && (data.weightKg != null || data.weightG != null) ? fromPicker : estimate.weight)
        : fromPicker;
      const persisted = persistMorningWeight(dateKey, weight, {
        estimated,
        source: estimate?.source || data.estimateSource
      });
      if (!persisted.saved) {
        throw new Error('Не удалось сохранить вес. Попробуйте ещё раз.');
      }

      if (!estimated) {
        const profile = lsGet('heys_profile', {});
        if (profile.weight !== weight) {
          profile.weight = weight;
          profile.updatedAt = Date.now();
          lsSet('heys_profile', profile);
          console.log('[WeightStep] Profile weight updated:', weight, 'kg');

          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('heys:profile-updated', {
              detail: { profile, source: 'weight-step' }
            }));
          }
        }
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: { date: dateKey, field: 'weightMorning', value: weight, forceReload: true }
        }));
        if (!estimated) {
          window.dispatchEvent(new CustomEvent('heysWeightLogged', {
            detail: { weight, date: dateKey, source: 'weight-step' }
          }));
        }
      }
      return {
        affectedKeys: [`heys_dayv2_${dateKey}`],
        completed: true
      };
    }
  });

  // ============================================================
  // SLEEP TIME STEP
  // ============================================================

  function getLastSleepData() {
    const today = new Date();
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, {});
      if (dayData.sleepStart && dayData.sleepEnd) {
        return {
          sleepStart: dayData.sleepStart,
          sleepEnd: dayData.sleepEnd,
          sleepQuality: dayData.sleepQuality || 7
        };
      }
    }
    return { sleepStart: '23:00', sleepEnd: '07:00', sleepQuality: 7 };
  }

  function calcSleepHours(startH, startM, endH, endM) {
    let startMins = startH * 60 + startM;
    let endMins = endH * 60 + endM;
    if (endMins <= startMins) {
      endMins += 24 * 60;
    }
    return (endMins - startMins) / 60;
  }

  function normalizeDaySleepMinutes(value) {
    if (HEYS.dayUtils?.normalizeDaySleepMinutes) {
      return HEYS.dayUtils.normalizeDaySleepMinutes(value);
    }
    const num = Math.round(Number(value) || 0);
    return num > 0 ? num : 0;
  }

  function getNightSleepHoursFromData(data) {
    return calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);
  }

  function getTotalSleepHoursFromData(data) {
    const napHours = normalizeDaySleepMinutes(data.daySleepMinutes) / 60;
    return Math.round((getNightSleepHoursFromData(data) + napHours) * 10) / 10;
  }

  function SleepTimeStepComponent({ data, onChange }) {
    const lastSleep = useMemo(() => getLastSleepData(), []);
    const latestDataRef = useRef(data);
    latestDataRef.current = data;

    const sleepStartH = data.sleepStartH ?? parseInt(lastSleep.sleepStart.split(':')[0], 10);
    const sleepStartM = data.sleepStartM ?? parseInt(lastSleep.sleepStart.split(':')[1], 10);
    const sleepEndH = data.sleepEndH ?? parseInt(lastSleep.sleepEnd.split(':')[0], 10);
    const sleepEndM = data.sleepEndM ?? parseInt(lastSleep.sleepEnd.split(':')[1], 10);

    const sleepHours = calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM);

    // Используем переиспользуемый TimePicker из StepModal
    const TimePicker = HEYS.StepModal.TimePicker;

    // Helper для форматирования времени
    const pad2 = (n) => String(n).padStart(2, '0');

    // Обновляет данные с форматированными полями для onComplete
    const updateData = (patch) => {
      const newData = { ...latestDataRef.current, ...patch };
      const startH = newData.sleepStartH ?? sleepStartH;
      const startM = newData.sleepStartM ?? sleepStartM;
      const endH = newData.sleepEndH ?? sleepEndH;
      const endM = newData.sleepEndM ?? sleepEndM;
      const daySleepMinutes = normalizeDaySleepMinutes(newData.daySleepMinutes);
      const nextData = {
        ...newData,
        daySleepMinutes,
        // Форматированные поля для onComplete callback
        sleepStart: `${pad2(startH)}:${pad2(startM)}`,
        sleepEnd: `${pad2(endH)}:${pad2(endM)}`,
        sleepHours: Math.round((calcSleepHours(startH, startM, endH, endM) + daySleepMinutes / 60) * 10) / 10
      };

      latestDataRef.current = nextData;
      onChange(nextData);
    };

    // Callbacks для времени засыпания
    const setSleepStartH = (h) => {
      updateData({
        sleepStartH: h
      });
    };

    const setSleepStartM = (m) => {
      updateData({
        sleepStartM: m
      });
    };

    // Единый callback для linkedScroll — засыпание
    const setSleepStartTime = (h, m) => {
      updateData({
        sleepStartH: h,
        sleepStartM: m
      });
    };

    // Callbacks для времени пробуждения
    const setSleepEndH = (h) => {
      updateData({
        sleepEndH: h
      });
    };

    const setSleepEndM = (m) => {
      updateData({
        sleepEndM: m
      });
    };

    // Единый callback для linkedScroll — пробуждение
    const setSleepEndTime = (h, m) => {
      updateData({
        sleepEndH: h,
        sleepEndM: m
      });
    };

    return React.createElement('div', { className: 'mc-sleep-step' },
      React.createElement('div', { className: 'mc-sleep-display' },
        React.createElement('span', { className: 'mc-sleep-value' }, sleepHours.toFixed(1)),
        React.createElement('span', { className: 'mc-sleep-unit' }, ' ч сна')
      ),
      React.createElement('div', { className: 'mc-sleep-times' },
        React.createElement('div', { className: 'mc-sleep-block' },
          React.createElement('div', { className: 'mc-sleep-label' }, '🌙 Лёг'),
          React.createElement(TimePicker, {
            hours: sleepStartH,
            minutes: sleepStartM,
            onHoursChange: setSleepStartH,
            onMinutesChange: setSleepStartM,
            onTimeChange: setSleepStartTime,
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            className: 'mc-time-pickers'
          })
        ),
        React.createElement('div', { className: 'mc-sleep-block' },
          React.createElement('div', { className: 'mc-sleep-label' }, '☀️ Встал'),
          React.createElement(TimePicker, {
            hours: sleepEndH,
            minutes: sleepEndM,
            onHoursChange: setSleepEndH,
            onMinutesChange: setSleepEndM,
            onTimeChange: setSleepEndTime,
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            className: 'mc-time-pickers'
          })
        )
      )
    );
  }

  registerStep('sleepTime', {
    title: 'Сон',
    hint: 'Во сколько легли и встали',
    component: SleepTimeStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      // Если есть dateKey в context — берём данные из того дня
      if (dateKey) {
        const dayData = readDayData(dateKey, {});
        if (hasSleepTime(dayData)) {
          const sleepStartH = parseInt(dayData.sleepStart.split(':')[0], 10);
          const sleepStartM = parseInt(dayData.sleepStart.split(':')[1], 10);
          const sleepEndH = parseInt(dayData.sleepEnd.split(':')[0], 10);
          const sleepEndM = parseInt(dayData.sleepEnd.split(':')[1], 10);
          return {
            sleepStartH,
            sleepStartM,
            sleepEndH,
            sleepEndM,
            daySleepMinutes: normalizeDaySleepMinutes(dayData.daySleepMinutes),
            sleepStart: dayData.sleepStart,
            sleepEnd: dayData.sleepEnd,
            sleepHours: dayData.sleepHours || Math.round((calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM) + normalizeDaySleepMinutes(dayData.daySleepMinutes) / 60) * 10) / 10
          };
        }
      }
      // Иначе — последние данные о сне
      const last = getLastSleepData();
      const sleepStartH = parseInt(last.sleepStart.split(':')[0], 10);
      const sleepStartM = parseInt(last.sleepStart.split(':')[1], 10);
      const sleepEndH = parseInt(last.sleepEnd.split(':')[0], 10);
      const sleepEndM = parseInt(last.sleepEnd.split(':')[1], 10);
      return {
        sleepStartH,
        sleepStartM,
        sleepEndH,
        sleepEndM,
        daySleepMinutes: 0,
        // Форматированные поля для onComplete
        sleepStart: last.sleepStart,
        sleepEnd: last.sleepEnd,
        sleepHours: Math.round(calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM) * 10) / 10
      };
    },
    save: (data, context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = getFreshDayData(dateKey);
      const sleepStart = `${String(data.sleepStartH).padStart(2, '0')}:${String(data.sleepStartM).padStart(2, '0')}`;
      const sleepEnd = `${String(data.sleepEndH).padStart(2, '0')}:${String(data.sleepEndM).padStart(2, '0')}`;
      const daySleepMinutes = normalizeDaySleepMinutes(dayData.daySleepMinutes ?? data.daySleepMinutes);
      const sleepHours = calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);

      dayData.date = dateKey;
      dayData.sleepStart = sleepStart;
      dayData.sleepEnd = sleepEnd;
      dayData.daySleepMinutes = daySleepMinutes;
      dayData.sleepHours = Math.round((sleepHours + daySleepMinutes / 60) * 10) / 10;
      dayData.updatedAt = Date.now();
      dayData._curatorEdits = HEYS.models?.clearCuratorMarks?.(dayData, ['sleepStart', 'sleepEnd'], dayData.updatedAt);
      const savedSleep = saveDayData(dateKey, dayData);
      console.info('[HEYS.sleepTime] ✅ Saved:', { dateKey, sleepStart, sleepEnd, daySleepMinutes, sleepHours: dayData.sleepHours });
      // TASK-003: несём полный payload дня (с live-meals merge), чтобы apply пошёл
      // immediate-путём (heys_day_effects.js:488) и значения сна доехали в React
      // даже под троттлингом таба, минуя SKIP_RAF_PENDING.
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey, field: 'sleep', source: 'sleep-step', forceReload: true,
          data: mergeDayMealsPreferLiveIfRicher(dateKey, { ...dayData, date: dateKey })
        }
      }));
      // 🎮 XP: ночной сон — основная запись сна за день (sleepStart/End/sleepHours),
      // поэтому событие шлём отсюда, а не из шага качества сна или дневного досыпа.
      // Только по факту успешной записи; дубли гасит геймификация
      // (sleep_logged: maxPerDay 1 + dedup-guard).
      if (savedSleep) {
        window.dispatchEvent(new CustomEvent('heysSleepLogged', {
          detail: {
            date: dateKey, sleepStart, sleepEnd,
            sleepHours: dayData.sleepHours, source: 'sleep-step'
          }
        }));
      }
    },
    xpAction: 'sleep_logged'
  });

  // ============================================================
  // DAY SLEEP STEP
  // ============================================================

  const DAY_SLEEP_OPTIONS = [0, 15, 20, 30, 45, 60, 90, 120, 150, 180];

  function formatDaySleepLabel(minutes) {
    if (!minutes) return 'Без досыпа';
    if (minutes < 60) return `${minutes} мин`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins ? `${hours} ч ${mins} мин` : `${hours} ч`;
  }

  function DaySleepStepComponent({ data, onChange }) {
    const selectedMinutes = normalizeDaySleepMinutes(data.daySleepMinutes);
    const nightSleepHours = Number.isFinite(data.nightSleepHours)
      ? Number(data.nightSleepHours)
      : null;
    const totalSleepHours = nightSleepHours == null
      ? selectedMinutes / 60
      : Math.round((nightSleepHours + selectedMinutes / 60) * 10) / 10;

    return React.createElement('div', { className: 'mc-day-sleep-step' },
      React.createElement('div', { className: 'mc-day-sleep-summary' },
        React.createElement('div', { className: 'mc-day-sleep-summary__value' }, formatDaySleepLabel(selectedMinutes)),
        React.createElement('div', { className: 'mc-day-sleep-summary__hint' },
          nightSleepHours == null
            ? 'Укажи, сколько удалось доспать днём'
            : `Итого сна за день: ${totalSleepHours.toFixed(1)} ч`
        )
      ),
      React.createElement('div', { className: 'mc-day-sleep-options' },
        DAY_SLEEP_OPTIONS.map((minutes) => React.createElement('button', {
          key: minutes,
          type: 'button',
          className: `mc-day-sleep-option ${selectedMinutes === minutes ? 'mc-day-sleep-option--active' : ''}`,
          onClick: () => onChange({
            ...data,
            daySleepMinutes: minutes,
            nightSleepHours,
            sleepHours: nightSleepHours == null ? undefined : Math.round((nightSleepHours + minutes / 60) * 10) / 10
          })
        }, formatDaySleepLabel(minutes))
        )
      )
    );
  }

  registerStep('daySleep', {
    title: 'Дневной сон',
    hint: 'Добавь досып за день, если он был',
    component: DaySleepStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = readDayData(dateKey, {});
      const nightSleepHours = HEYS.dayUtils?.getNightSleepHours
        ? HEYS.dayUtils.getNightSleepHours(dayData)
        : ((dayData.sleepStart && dayData.sleepEnd)
          ? Math.round(calcSleepHours(
            parseInt(dayData.sleepStart.split(':')[0], 10),
            parseInt(dayData.sleepStart.split(':')[1], 10),
            parseInt(dayData.sleepEnd.split(':')[0], 10),
            parseInt(dayData.sleepEnd.split(':')[1], 10)
          ) * 10) / 10
          : null);

      return {
        daySleepMinutes: normalizeDaySleepMinutes(dayData.daySleepMinutes),
        nightSleepHours,
        sleepHours: nightSleepHours == null
          ? undefined
          : Math.round((nightSleepHours + normalizeDaySleepMinutes(dayData.daySleepMinutes) / 60) * 10) / 10
      };
    },
    save: (data, context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = getFreshDayData(dateKey);
      const daySleepMinutes = normalizeDaySleepMinutes(data.daySleepMinutes);
      const nightSleepHours = HEYS.dayUtils?.getNightSleepHours
        ? HEYS.dayUtils.getNightSleepHours(dayData)
        : ((dayData.sleepStart && dayData.sleepEnd)
          ? Math.round(calcSleepHours(
            parseInt(dayData.sleepStart.split(':')[0], 10),
            parseInt(dayData.sleepStart.split(':')[1], 10),
            parseInt(dayData.sleepEnd.split(':')[0], 10),
            parseInt(dayData.sleepEnd.split(':')[1], 10)
          ) * 10) / 10
          : 0);

      dayData.date = dateKey;
      dayData.daySleepMinutes = daySleepMinutes;
      dayData.sleepHours = Math.round((nightSleepHours + daySleepMinutes / 60) * 10) / 10;
      dayData.updatedAt = Date.now();
      saveDayData(dateKey, dayData);
      console.info('[HEYS.daySleep] ✅ Saved:', { dateKey, daySleepMinutes, sleepHours: dayData.sleepHours });
      // TASK-003: полный payload → immediate apply минуя SKIP_RAF_PENDING.
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey, field: 'daySleepMinutes', source: 'day-sleep-step', forceReload: true,
          data: mergeDayMealsPreferLiveIfRicher(dateKey, { ...dayData, date: dateKey })
        }
      }));
    },
    xpAction: 'sleep_logged'
  });

  // ============================================================
  // SLEEP QUALITY STEP
  // ============================================================

  const SLEEP_QUALITY_EMOJI = ['😴', '😟', '😕', '😐', '🙂', '😊', '😃', '🌟', '✨', '🌈'];
  const SLEEP_QUALITY_LABELS = [
    'Очень низко', 'Очень низко', 'Так себе', 'Так себе', 'Нормально',
    'Нормально', 'Выше обычного', 'Выше обычного', 'Очень высоко', 'Очень высоко'
  ];

  const SLEEP_ADVICE = {
    bad: [
      { icon: '📵', text: 'Попробуй без экранов за час до сна' },
      { icon: '🌡️', text: 'Прохладная комната (18-20°C) улучшает сон' },
      { icon: '🧘', text: 'Лёгкая растяжка перед сном снимает напряжение' },
      { icon: '☕', text: 'Последний кофе — до 14:00' },
      { icon: '🚶', text: 'Прогулка вечером поможет расслабиться' }
    ],
    medium: [
      { icon: '⏰', text: 'Попробуй ложиться в одно время' },
      { icon: '🌙', text: 'Затемни комнату для глубокого сна' },
      { icon: '📖', text: 'Книга перед сном лучше телефона' },
      { icon: '💨', text: 'Проветри комнату перед сном' }
    ],
    good: [
      { icon: '✨', text: 'Отличный режим! Продолжай в том же духе' },
      { icon: '💪', text: 'Качественный сон = больше энергии днём' },
      { icon: '🧠', text: 'Хороший сон улучшает концентрацию' }
    ],
    excellent: [
      { icon: '🌟', text: 'Идеально! Ты мастер сна!' },
      { icon: '🏆', text: 'Твой секрет успеха — в режиме' },
      { icon: '🚀', text: 'С таким сном горы свернёшь!' }
    ]
  };

  function getSleepAdvice(quality) {
    if (quality <= 3) return SLEEP_ADVICE.bad;
    if (quality <= 6) return SLEEP_ADVICE.medium;
    if (quality <= 8) return SLEEP_ADVICE.good;
    return SLEEP_ADVICE.excellent;
  }

  function getSleepAdviceColor(quality) {
    if (quality <= 3) return { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' };
    if (quality <= 6) return { bg: '#fefce8', border: '#fef08a', text: '#854d0e' };
    if (quality <= 8) return { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' };
    return { bg: '#ecfdf5', border: '#6ee7b7', text: '#047857' };
  }

  function getQualityColor(quality) {
    if (quality <= 3) {
      const t = (quality - 1) / 2;
      return `hsl(${Math.round(t * 30)}, 80%, 50%)`;
    } else if (quality <= 6) {
      const t = (quality - 3) / 3;
      return `hsl(${Math.round(30 + t * 40)}, 80%, 50%)`;
    } else {
      const t = (quality - 6) / 4;
      return `hsl(${Math.round(70 + t * 90)}, 70%, 45%)`;
    }
  }

  function SleepQualityStepComponent({ data, onChange }) {
    const lastSleep = useMemo(() => getLastSleepData(), []);
    const sleepQuality = data.sleepQuality ?? lastSleep.sleepQuality ?? 7;
    const sleepNote = data.sleepNote ?? '';

    const qualityColor = getQualityColor(sleepQuality);
    const adviceList = getSleepAdvice(sleepQuality);
    const adviceColors = getSleepAdviceColor(sleepQuality);
    const adviceIndex = (sleepQuality * 7) % adviceList.length;
    const currentAdvice = adviceList[adviceIndex];

    const commentQuestion = sleepQuality <= 4
      ? '😔 Что помешало выспаться?'
      : sleepQuality >= 8
        ? '✨ Что помогло хорошо выспаться?'
        : '💭 Заметка о сне';
    const commentPlaceholder = sleepQuality <= 4
      ? 'Шум, стресс, поздно лёг...'
      : sleepQuality >= 8
        ? 'Режим, тишина, прохлада...'
        : 'Любые заметки...';

    return React.createElement('div', {
      className: 'mc-quality-step',
      style: { '--quality-color': qualityColor }
    },
      React.createElement('div', { className: 'mc-quality-display' },
        React.createElement('span', {
          className: 'mc-quality-emoji',
          style: { filter: `drop-shadow(0 0 8px ${qualityColor})` }
        }, SLEEP_QUALITY_EMOJI[sleepQuality - 1]),
        React.createElement('span', { className: 'mc-quality-label' }, SLEEP_QUALITY_LABELS[sleepQuality - 1])
      ),
      React.createElement('input', Object.assign({
        type: 'range',
        className: 'mc-quality-slider',
        min: 1,
        max: 10,
        value: sleepQuality,
      }, getRangeGestureProps((nextValue) => onChange({ ...data, sleepQuality: nextValue })), {
        style: {
          touchAction: 'none',
          background: `linear-gradient(to right, ${qualityColor} ${(sleepQuality - 1) * 11.1}%, #e5e7eb ${(sleepQuality - 1) * 11.1}%)`
        }
      })),
      React.createElement('div', { className: 'mc-quality-buttons' },
        [1, 4, 7, 10].map(q =>
          React.createElement('button', {
            key: q,
            className: `mc-quality-btn ${sleepQuality === q ? 'mc-quality-btn--active' : ''}`,
            onClick: () => onChange({ ...data, sleepQuality: q }),
            style: sleepQuality === q ? { backgroundColor: qualityColor, borderColor: qualityColor } : {}
          }, SLEEP_QUALITY_EMOJI[q - 1])
        )
      ),
      React.createElement('div', {
        className: 'mc-sleep-advice',
        style: {
          backgroundColor: adviceColors.bg,
          borderColor: adviceColors.border
        }
      },
        React.createElement('span', { className: 'mc-sleep-advice-icon' }, currentAdvice.icon),
        React.createElement('span', {
          className: 'mc-sleep-advice-text',
          style: { color: adviceColors.text }
        }, currentAdvice.text)
      ),
      React.createElement('div', {
        className: 'mc-sleep-comment',
        style: { borderColor: adviceColors.border }
      },
        React.createElement('label', {
          className: 'mc-sleep-comment-label',
          style: { color: adviceColors.text }
        }, commentQuestion),
        React.createElement('input', {
          type: 'text',
          className: 'mc-sleep-comment-input',
          placeholder: commentPlaceholder,
          value: sleepNote,
          onChange: (e) => onChange({ ...data, sleepNote: e.target.value })
        })
      )
    );
  }

  registerStep('sleepQuality', {
    title: 'Как выспались?',
    hint: '',
    component: SleepQualityStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      // Если есть dateKey в context — берём данные из того дня
      if (dateKey) {
        const dayData = readDayData(dateKey, {});
        if (hasPositiveStepNumber(dayData.sleepQuality)) {
          return {
            sleepQuality: dayData.sleepQuality,
            sleepNote: ''  // Не предзаполняем заметку — каждый раз новая
          };
        }
      }
      // Иначе — последние данные
      const last = getLastSleepData();
      return {
        sleepQuality: last.sleepQuality || 7,
        sleepNote: ''
      };
    },
    save: (data, context, allStepData) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = getFreshDayData(dateKey);
      dayData.sleepQuality = data.sleepQuality;

      // Убеждаемся, что не затираем данные времени сна из sleepTime-шага
      // (HEYS.store может вернуть закэшированную версию без sleepStart)
      if (allStepData?.sleepTime) {
        const st = allStepData.sleepTime;
        if (st.sleepStart) dayData.sleepStart = st.sleepStart;
        if (st.sleepEnd) dayData.sleepEnd = st.sleepEnd;
        if (st.sleepHours !== undefined) dayData.sleepHours = st.sleepHours;
        if (st.daySleepMinutes !== undefined) dayData.daySleepMinutes = normalizeDaySleepMinutes(st.daySleepMinutes);
      }

      if (data.sleepNote && data.sleepNote.trim()) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const noteWithTime = `[${timeStr}] ${data.sleepNote.trim()}`;
        dayData.sleepNote = dayData.sleepNote
          ? dayData.sleepNote + '\n' + noteWithTime
          : noteWithTime;
        dayData.sleepNoteUpdatedAt = Math.max(Date.now(), (Number(dayData.sleepNoteUpdatedAt) || 0) + 1);
      }

      dayData.date = dateKey;
      dayData.updatedAt = Date.now();
      dayData._curatorEdits = HEYS.models?.clearCuratorMarks?.(dayData, 'sleepQuality', dayData.updatedAt);
      saveDayData(dateKey, dayData);
      console.info('[HEYS.sleepQuality] ✅ Saved:', { dateKey, sleepQuality: dayData.sleepQuality, sleepStart: dayData.sleepStart, sleepEnd: dayData.sleepEnd });
      // TASK-003: полный payload → immediate apply минуя SKIP_RAF_PENDING.
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey, field: 'sleep', source: 'sleep-quality-step', forceReload: true,
          data: mergeDayMealsPreferLiveIfRicher(dateKey, { ...dayData, date: dateKey })
        }
      }));
    }
  });

  function sleepNotePrompt(quality) {
    if (quality <= 4) return 'Что помешало спать';
    if (quality >= 8) return 'Что помогло';
    return 'Заметка о ночи';
  }

  function formatSleepDuration(hours) {
    const total = Math.max(0, Math.round(Number(hours) * 60));
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  }

  function pluralRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function formatSleepDurationWords(hours) {
    const totalMin = Math.max(0, Math.round(Number(hours) * 60));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const parts = [];
    if (h > 0) parts.push(`${h} ${pluralRu(h, 'час', 'часа', 'часов')}`);
    if (m > 0) parts.push(`${m} ${pluralRu(m, 'минута', 'минуты', 'минут')}`);
    return parts.join(' ') || '0 минут';
  }

  function buildSleepCapsuleAriaLabel(startH, startM, endH, endM, sleepHours) {
    const fell = `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`;
    const woke = `${endH}:${String(endM).padStart(2, '0')}`;
    return `лёг в ${fell}, встал в ${woke}, ${formatSleepDurationWords(sleepHours)}`;
  }

  function buildScaleSliderAriaLabel(title, value, max = 10) {
    const label = String(title || '').trim().toLowerCase();
    return `${label}, ${value} из ${max}`;
  }

  function buildStepsTrackAriaLabel(stepsGoal, adviceLabel) {
    const goal = Math.round(Number(stepsGoal) || 0).toLocaleString('ru-RU');
    return `Цель по шагам, ${goal} шагов, ${adviceLabel}`;
  }

  function sleepNormLine(hours) {
    const profile = lsGet('heys_profile', {}) || {};
    const norm = Number(profile.sleepHours) || 8;
    const diff = Number(hours) - norm;
    if (!Number.isFinite(diff) || Math.abs(diff) < 0.2) return 'как ваша норма';
    const absMin = Math.round(Math.abs(diff) * 2) / 2;
    const amount = absMin === 0.5
      ? 'полчаса'
      : (absMin === 1 ? 'час' : `${String(absMin).replace('.', ',')} ч`);
    return diff < 0
      ? `на ${amount} меньше вашей нормы`
      : `на ${amount} больше вашей нормы`;
  }

  function CombinedSleepStepComponent({ data, onChange }) {
    const TimePicker = HEYS.StepModal.TimePicker;
    const lastSleep = useMemo(() => getLastSleepData(), []);
    const sleepStartH = data.sleepStartH ?? parseInt(String(lastSleep.sleepStart || '23:00').split(':')[0], 10);
    const sleepStartM = data.sleepStartM ?? parseInt(String(lastSleep.sleepStart || '23:00').split(':')[1], 10);
    const sleepEndH = data.sleepEndH ?? parseInt(String(lastSleep.sleepEnd || '07:00').split(':')[0], 10);
    const sleepEndM = data.sleepEndM ?? parseInt(String(lastSleep.sleepEnd || '07:00').split(':')[1], 10);
    const sleepQuality = data.sleepQuality ?? lastSleep.sleepQuality ?? 7;
    const sleepNote = data.sleepNote ?? '';
    const noteOpen = data.noteOpen === true || String(sleepNote).length > 0;
    const sleepHours = calcSleepHours(sleepStartH, sleepStartM, sleepEndH, sleepEndM);
    const qualityWord = SLEEP_QUALITY_LABELS[Math.max(0, Math.min(9, sleepQuality - 1))] || '';
    const update = (patch) => onChange({ ...data, sleepStartH, sleepStartM, sleepEndH, sleepEndM, sleepQuality, sleepNote, ...patch });

    return React.createElement('div', { className: 'mc-sleep-combined' },
      React.createElement('div', { className: 'mc-step-kicker' }, 'Сон этой ночью'),
      React.createElement('div', { className: 'mc-hero-number' }, formatSleepDuration(sleepHours)),
      React.createElement('div', { className: 'mc-sleep-norm' }, sleepNormLine(sleepHours)),
      React.createElement('div', { className: 'mc-scale-card' },
        React.createElement('div', { className: 'mc-scale-head' },
          React.createElement('span', null, 'Насколько выспались'),
          React.createElement('span', { className: 'mc-scale-value' },
            React.createElement('b', { className: 'n', style: { font: '700 13px/1 Figtree, system-ui, sans-serif', color: 'var(--v4-sand-act-text, #8a4a20)' } }, String(sleepQuality)),
            ` · ${String(qualityWord).toLowerCase()}`
          )
        ),
        React.createElement(DragValueSlider, {
          className: 'mc-v4-scale',
          variant: 'v4',
          fill: 'olive',
          min: 1,
          max: 10,
          value: sleepQuality,
          onValue: (nextValue) => update({ sleepQuality: nextValue }),
          ariaLabel: buildScaleSliderAriaLabel('Насколько выспались', sleepQuality)
        }),
        React.createElement('button', {
          type: 'button',
          className: 'mc-note-toggle',
          onClick: () => update({ noteOpen: !noteOpen })
        },
          React.createElement('span', { className: 'mc-note-toggle-icon', 'aria-hidden': 'true' },
            React.createElement('svg', {
              width: 12,
              height: 12,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 3,
              strokeLinecap: 'round'
            }, React.createElement('path', { d: 'M12 6v12M6 12h12' }))
          ),
          sleepNotePrompt(sleepQuality)
        ),
        noteOpen && React.createElement('textarea', {
          className: 'mc-note-input',
          rows: 2,
          value: sleepNote,
          placeholder: 'Необязательно',
          onChange: (e) => update({ sleepNote: e.target.value })
        })
      ),
      React.createElement('div', {
        className: 'mc-sleep-times mc-sleep-times--split',
        role: 'group',
        'aria-label': buildSleepCapsuleAriaLabel(sleepStartH, sleepStartM, sleepEndH, sleepEndM, sleepHours)
      },
        React.createElement('div', { className: 'mc-sleep-block', 'aria-hidden': 'true' },
          React.createElement('div', { className: 'mc-sleep-label' }, 'Легли'),
          React.createElement(TimePicker, {
            hours: sleepStartH,
            minutes: sleepStartM,
            onHoursChange: (h) => update({ sleepStartH: h }),
            onMinutesChange: (m) => update({ sleepStartM: m }),
            onTimeChange: (h, m) => update({ sleepStartH: h, sleepStartM: m }),
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            compact: true,
            className: 'mc-sleep-clock'
          })
        ),
        React.createElement('div', { className: 'mc-sleep-block', 'aria-hidden': 'true' },
          React.createElement('div', { className: 'mc-sleep-label' }, 'Встали'),
          React.createElement(TimePicker, {
            hours: sleepEndH,
            minutes: sleepEndM,
            onHoursChange: (h) => update({ sleepEndH: h }),
            onMinutesChange: (m) => update({ sleepEndM: m }),
            onTimeChange: (h, m) => update({ sleepEndH: h, sleepEndM: m }),
            hoursLabel: '',
            minutesLabel: '',
            display: null,
            linkedScroll: true,
            compact: true,
            className: 'mc-sleep-clock'
          })
        )
      )
    );
  }

  registerStep('sleep', {
    title: 'Сон',
    hint: '',
    component: CombinedSleepStepComponent,
    getInitialData: (context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = dateKey ? readDayData(dateKey, {}) : {};
      const last = getLastSleepData();
      const start = hasSleepTime(dayData) ? dayData.sleepStart : last.sleepStart;
      const end = hasSleepTime(dayData) ? dayData.sleepEnd : last.sleepEnd;
      const sleepStartH = parseInt(String(start).split(':')[0], 10);
      const sleepStartM = parseInt(String(start).split(':')[1], 10);
      const sleepEndH = parseInt(String(end).split(':')[0], 10);
      const sleepEndM = parseInt(String(end).split(':')[1], 10);
      return {
        sleepStartH,
        sleepStartM,
        sleepEndH,
        sleepEndM,
        sleepQuality: hasPositiveStepNumber(dayData.sleepQuality) ? dayData.sleepQuality : (last.sleepQuality || 7),
        sleepNote: '',
        noteOpen: false
      };
    },
    save: (data, context) => {
      const dateKey = resolveDateKey(context?.dateKey);
      const dayData = getFreshDayData(dateKey);
      const sleepStart = `${String(data.sleepStartH).padStart(2, '0')}:${String(data.sleepStartM).padStart(2, '0')}`;
      const sleepEnd = `${String(data.sleepEndH).padStart(2, '0')}:${String(data.sleepEndM).padStart(2, '0')}`;
      const daySleepMinutes = normalizeDaySleepMinutes(dayData.daySleepMinutes ?? data.daySleepMinutes);
      const sleepHours = calcSleepHours(data.sleepStartH, data.sleepStartM, data.sleepEndH, data.sleepEndM);
      dayData.date = dateKey;
      dayData.sleepStart = sleepStart;
      dayData.sleepEnd = sleepEnd;
      dayData.daySleepMinutes = daySleepMinutes;
      dayData.sleepHours = Math.round((sleepHours + daySleepMinutes / 60) * 10) / 10;
      dayData.sleepQuality = data.sleepQuality;
      if (data.sleepNote && String(data.sleepNote).trim()) {
        const timeStr = new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        const noteWithTime = `[${timeStr}] ${String(data.sleepNote).trim()}`;
        dayData.sleepNote = dayData.sleepNote ? dayData.sleepNote + '\n' + noteWithTime : noteWithTime;
        dayData.sleepNoteUpdatedAt = Math.max(Date.now(), (Number(dayData.sleepNoteUpdatedAt) || 0) + 1);
      }
      dayData.updatedAt = Date.now();
      dayData._curatorEdits = HEYS.models?.clearCuratorMarks?.(dayData, ['sleepStart', 'sleepEnd', 'sleepQuality'], dayData.updatedAt);
      const savedSleep = saveDayData(dateKey, dayData);
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey, field: 'sleep', source: 'sleep-combined-step', forceReload: true,
          data: mergeDayMealsPreferLiveIfRicher(dateKey, { ...dayData, date: dateKey })
        }
      }));
      if (savedSleep) {
        window.dispatchEvent(new CustomEvent('heysSleepLogged', {
          detail: {
            date: dateKey, sleepStart, sleepEnd,
            sleepHours: dayData.sleepHours, source: 'sleep-combined-step'
          }
        }));
      }
      return { affectedKeys: [`heys_dayv2_${dateKey}`], completed: true };
    },
    xpAction: 'sleep_logged'
  });

  // ============================================================
  // STEPS GOAL STEP
  // ============================================================

  const STEPS_GOAL_MIN = 7000;
  const STEPS_GOAL_MAX = 12000;
  const STEPS_HISTORY_LOOKBACK_DAYS = 14;
  const STEPS_HISTORY_MIN_DAYS = 3;
  // Visual range of the goal slider. Norm (~10k) sits at ~2/3 of the track
  // so a typical day does not feel "near zero" on a linear 3k–30k scale.
  const STEPS_GOAL_SLIDER_MIN = 3000;
  const STEPS_GOAL_SLIDER_MAX = 30000;
  const STEPS_GOAL_SLIDER_ANCHOR = 10000;
  const STEPS_GOAL_SLIDER_ANCHOR_RATIO = 2 / 3;

  function stepsGoalSliderValueToRatio(value, min = STEPS_GOAL_SLIDER_MIN, max = STEPS_GOAL_SLIDER_MAX) {
    const safeMin = Number(min);
    const safeMax = Number(max);
    const anchor = Math.max(safeMin, Math.min(safeMax, STEPS_GOAL_SLIDER_ANCHOR));
    const v = Math.max(safeMin, Math.min(safeMax, Number(value) || safeMin));
    if (!(safeMax > safeMin)) return 0;
    if (v <= anchor) {
      if (!(anchor > safeMin)) return 0;
      return ((v - safeMin) / (anchor - safeMin)) * STEPS_GOAL_SLIDER_ANCHOR_RATIO;
    }
    if (!(safeMax > anchor)) return 1;
    return STEPS_GOAL_SLIDER_ANCHOR_RATIO
      + ((v - anchor) / (safeMax - anchor)) * (1 - STEPS_GOAL_SLIDER_ANCHOR_RATIO);
  }

  function stepsGoalSliderRatioToValue(ratio, min = STEPS_GOAL_SLIDER_MIN, max = STEPS_GOAL_SLIDER_MAX) {
    const safeMin = Number(min);
    const safeMax = Number(max);
    const anchor = Math.max(safeMin, Math.min(safeMax, STEPS_GOAL_SLIDER_ANCHOR));
    const r = Math.max(0, Math.min(1, Number(ratio) || 0));
    let raw;
    if (r <= STEPS_GOAL_SLIDER_ANCHOR_RATIO) {
      raw = safeMin + (STEPS_GOAL_SLIDER_ANCHOR_RATIO > 0
        ? (r / STEPS_GOAL_SLIDER_ANCHOR_RATIO) * (anchor - safeMin)
        : 0);
    } else {
      raw = anchor + ((r - STEPS_GOAL_SLIDER_ANCHOR_RATIO) / (1 - STEPS_GOAL_SLIDER_ANCHOR_RATIO))
        * (safeMax - anchor);
    }
    return Math.max(safeMin, Math.min(safeMax, Math.round(raw / 500) * 500));
  }

  function stepsGoalSliderStepForValue(_value) {
    return 500;
  }

  function roundStepsGoal(value) {
    return Math.round(Number(value) / 100) * 100;
  }

  function medianStepsValue(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  /** Канон — HEYS.TDEE.hasStepsFact; фолбэк на случай порядка загрузки модулей. */
  function hasStepsFactForHistory(dayData) {
    const canonical = HEYS.TDEE && HEYS.TDEE.hasStepsFact;
    if (typeof canonical === 'function') return !!canonical(dayData);
    const d = dayData || {};
    if (d.steps === null || d.steps === undefined) return false;
    if ((Number(d.steps) || 0) > 0) return true;
    return (Number(d.stepsUpdatedAt) || 0) > 0;
  }

  function collectRecentStepsHistory(readDay, today, lookbackDays = STEPS_HISTORY_LOOKBACK_DAYS) {
    const stepsData = [];
    const anchor = today instanceof Date && !Number.isNaN(today.getTime()) ? new Date(today) : new Date();
    for (let i = 1; i <= lookbackDays; i++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDay(key, {}) || {};
      // «Есть факт» спрашиваем там же, где его спрашивает расчёт нормы
      // (HEYS.TDEE.hasStepsFact): иначе медиана считалась бы по одному правилу,
      // а решение «подставлять ли её» — по другому. Ноль с меткой правки это
      // факт «прошёл ноль», ноль без метки — незаполненный день.
      if (hasStepsFactForHistory(dayData)) {
        stepsData.push(Number(dayData.steps) || 0);
      }
    }
    return stepsData;
  }

  function getTrainingMinutesLoad(training) {
    const zones = Array.isArray(training?.z) ? training.z : [];
    return zones.reduce((sum, value) => sum + (Number(value) || 0), 0);
  }

  function isMorningActivationTraining(training) {
    if (!training || typeof training !== 'object') return false;
    if (training.source === 'morning_activation') return true;
    const label = typeof training.activityLabel === 'string' ? training.activityLabel.trim().toLowerCase() : '';
    return label === 'зарядка';
  }

  function isStepsGoalTrainingDay(trainings) {
    const list = Array.isArray(trainings) ? trainings : [];
    return list.some((training) => {
      if (!training || typeof training !== 'object') return false;
      if (isMorningActivationTraining(training)) return false;
      const planStatus = training.plan?.status;
      if (planStatus === 'skipped') return false;
      const load = getTrainingMinutesLoad(training);
      if (load <= 40) return false;
      const type = String(training.type || '').toLowerCase();
      const isStrengthOrCardio = type === 'strength' || type === 'cardio' || type.includes('cardio') || type === 'run';
      if (type && !isStrengthOrCardio) return false;
      if (planStatus === 'assigned' || planStatus === 'started' || planStatus === 'done') return true;
      return !training.plan && load > 40;
    });
  }

  function resolveStepsGoalContext(context = {}, allStepData = {}, readDay = readDayData) {
    const dateKey = resolveDateKey(context?.dateKey);
    const dayData = readDay(dateKey, {}) || {};
    const sleepTime = allStepData?.sleepTime || {};
    const sleepQualityStep = allStepData?.sleepQuality || {};
    const moodStep = allStepData?.morning_mood || {};

    const sleepHoursRaw = Number(sleepTime.sleepHours ?? dayData.sleepHours);
    const sleepHours = Number.isFinite(sleepHoursRaw) ? sleepHoursRaw : null;
    const sleepQualityRaw = Number(sleepQualityStep.sleepQuality ?? dayData.sleepQuality);
    const sleepQuality = Number.isFinite(sleepQualityRaw) ? sleepQualityRaw : null;

    const moodRaw = Number(moodStep.mood ?? dayData.moodMorning);
    const wellbeingRaw = Number(moodStep.wellbeing ?? dayData.wellbeingMorning);
    const stressRaw = Number(moodStep.stress ?? dayData.stressMorning);
    const mood = Number.isFinite(moodRaw) ? moodRaw : null;
    const wellbeing = Number.isFinite(wellbeingRaw) ? wellbeingRaw : null;
    const stress = Number.isFinite(stressRaw) ? stressRaw : null;

    const hasMorningSignals = [mood, wellbeing, stress].some((value) => Number.isFinite(value));
    const energyBucket = hasMorningSignals ? getEnergyBucket(mood, wellbeing, stress) : 'mid';
    const trainings = Array.isArray(dayData.trainings) ? dayData.trainings : [];

    return {
      dateKey,
      sleepHours,
      sleepQuality,
      mood,
      wellbeing,
      stress,
      energyBucket,
      trainings,
      hasMorningSignals
    };
  }

  function buildStepsGoalReasonLine(recommended, median, ctx, modifiers) {
    if (!Number.isFinite(recommended) || recommended <= 0) return '';
    const parts = [];
    if (median > 0) {
      parts.push(`обычно ~${median.toLocaleString('ru-RU')}`);
    }
    if (Number.isFinite(ctx.sleepHours)) {
      if (ctx.sleepHours < 6.5) parts.push('сон короче обычного');
      else parts.push(`сон ${ctx.sleepHours.toFixed(1)} ч`);
    }
    if (ctx.energyBucket === 'high') parts.push('самочувствие высокое');
    else if (ctx.energyBucket === 'low') parts.push('ресурс ниже обычного');
    if (modifiers.some((item) => item.id === 'training')) {
      parts.push('есть тренировка');
    }
    if (!parts.length) {
      return `Рекомендуем ${recommended.toLocaleString('ru-RU')} шагов`;
    }
    return `Рекомендуем ${recommended.toLocaleString('ru-RU')}: ${parts.join(', ')}`;
  }

  function formatSleepHoursHuman(hours) {
    const totalMin = Math.max(0, Math.round(Number(hours) * 60));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (m === 0) return `${h} ч`;
    return `${h} ч ${m} мин`;
  }

  function buildStepsGoalNarrative(stats, awayFromAdvice, adviceValue) {
    const fmt = (value) => Number(value).toLocaleString('ru-RU');
    const mods = stats.modifiers || [];
    const ctx = stats.context || {};
    const hasSleep = mods.some((item) => item.id === 'sleep');
    const hasEnergyLow = mods.some((item) => item.id === 'energy_low');
    const hasTraining = mods.some((item) => item.id === 'training');

    if (stats.fallback || stats.daysWithData < STEPS_HISTORY_MIN_DAYS) {
      return {
        headline: 'Пока не из чего считать вашу обычную ходьбу — это просто начало',
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: 'Через несколько дней цифра начнёт подстраиваться под вас.',
        infoCard: null
      };
    }

    if (awayFromAdvice) {
      return {
        headline: 'Выходной с прогулкой — поставили своё, выше совета',
        sliderHint: null,
        footnote: `Метка стоит на совете — касание по ней возвращает ${fmt(adviceValue)}.`,
        infoCard: null
      };
    }

    if (stats.cappedAtMax && !hasSleep && !hasEnergyLow && !hasTraining) {
      return {
        headline: 'Вы ходите много — выше двенадцати тысяч совет не поднимается',
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: 'Коридор совета — 7 000–12 000 шагов; выше двенадцати тысяч совет не поднимается.',
        infoCard: null
      };
    }

    if (Math.round(adviceValue) <= STEPS_GOAL_MIN && stats.baseline < STEPS_GOAL_MIN) {
      return {
        headline: `Обычно вы проходите около ${fmt(Math.round(stats.median))} — берём чуть выше`,
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: 'Коридор совета — 7 000–12 000 шагов.',
        infoCard: null
      };
    }

    if (hasSleep && hasEnergyLow) {
      return {
        headline: 'Короткий сон и тяжёлое самочувствие — цель заметно ниже обычной',
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: null,
        infoCard: 'Два смягчения подряд — короткий сон и тяжёлое утро.'
      };
    }

    if (hasSleep) {
      const sleepLabel = Number.isFinite(ctx.sleepHours)
        ? formatSleepHoursHuman(ctx.sleepHours)
        : 'мало';
      return {
        headline: `Спали ${sleepLabel} — сегодня берём мягче обычных ${fmt(stats.baseline)}`,
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: 'Мягче — не меньше: план остаётся, просто по силам этого утра.',
        infoCard: null
      };
    }

    if (hasTraining) {
      return {
        headline: 'Сегодня есть тренировка — оставляем место на саму сессию',
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: 'Зарядка на цифру не влияет — только полноценная тренировка дольше сорока минут.',
        infoCard: null
      };
    }

    if (hasEnergyLow) {
      return {
        headline: 'Утренний ресурс ниже обычного — цель ниже обычной',
        sliderHint: 'Сдвиньте пальцем, если день будет другим',
        footnote: null,
        infoCard: null
      };
    }

    return {
      headline: `Обычно вы проходите около ${fmt(Math.round(stats.median))} — берём чуть выше`,
      sliderHint: 'Сдвиньте пальцем, если день будет другим',
      footnote: 'План на день — его видит куратор. Расход считается по факту пройденного.',
      infoCard: null
    };
  }

  function computeAdaptiveStepsGoal(options = {}) {
    const profile = options.profile || lsGet('heys_profile', {}) || {};
    const readDay = typeof options.readDay === 'function' ? options.readDay : readDayData;
    const today = options.today instanceof Date ? options.today : new Date();
    const ctx = resolveStepsGoalContext(options.context || {}, options.allStepData || {}, readDay);
    const stepsData = collectRecentStepsHistory(readDay, today, STEPS_HISTORY_LOOKBACK_DAYS);
    const daysWithData = stepsData.length;
    const minHealthy = STEPS_GOAL_MIN;
    const avg7Slice = stepsData.slice(0, 7);
    const avg7 = avg7Slice.length
      ? Math.round(avg7Slice.reduce((sum, value) => sum + value, 0) / avg7Slice.length)
      : 0;
    const avg = avg7;
    const median = medianStepsValue(stepsData);

    if (daysWithData < STEPS_HISTORY_MIN_DAYS) {
      const fallbackRecommended = Math.max(
        minHealthy,
        Math.min(STEPS_GOAL_MAX, roundStepsGoal(profile.stepsGoal || 10000))
      );
      return {
        recommended: fallbackRecommended,
        median,
        avg7,
        avg,
        daysWithData,
        baseline: fallbackRecommended,
        minHealthy,
        modifiers: [],
        reasonLine: '',
        fallback: true,
        context: ctx
      };
    }

    const rawBaseline = median * 1.05;
    const baseline = roundStepsGoal(Math.min(STEPS_GOAL_MAX, Math.max(minHealthy, rawBaseline)));
    const cappedAtMax = rawBaseline > STEPS_GOAL_MAX;
    let adjusted = baseline;
    const modifiers = [];

    if ((Number.isFinite(ctx.sleepHours) && ctx.sleepHours < 6.5)
      || (Number.isFinite(ctx.sleepQuality) && ctx.sleepQuality <= 4)) {
      adjusted *= 0.85;
      modifiers.push({ id: 'sleep', factor: 0.85, label: 'короткий или плохой сон' });
    }
    if (ctx.energyBucket === 'low') {
      adjusted *= 0.85;
      modifiers.push({ id: 'energy_low', factor: 0.85, label: 'утренний ресурс ниже обычного' });
    } else if (ctx.energyBucket === 'high') {
      adjusted *= 1.05;
      modifiers.push({ id: 'energy_high', factor: 1.05, label: 'утренний ресурс высокий' });
    }
    if (isStepsGoalTrainingDay(ctx.trainings)) {
      adjusted *= 0.85;
      modifiers.push({ id: 'training', factor: 0.85, label: 'запланирована тренировка' });
    }

    const recommended = roundStepsGoal(Math.max(minHealthy, Math.min(STEPS_GOAL_MAX, adjusted)));
    const reasonLine = buildStepsGoalReasonLine(recommended, median, ctx, modifiers);

    return {
      recommended,
      median,
      avg7,
      avg,
      daysWithData,
      baseline,
      cappedAtMax,
      minHealthy,
      modifiers,
      reasonLine,
      fallback: false,
      context: ctx
    };
  }

  function getWeeklyStepsStats(weight = 70, context, allStepData) {
    const stats = computeAdaptiveStepsGoal({
      profile: { ...(lsGet('heys_profile', {}) || {}), weight },
      context,
      allStepData
    });
    return {
      avg: stats.avg7 || stats.avg || 0,
      daysWithData: stats.daysWithData,
      recommended: stats.recommended,
      minHealthy: stats.minHealthy || STEPS_GOAL_MIN,
      median: stats.median,
      avg7: stats.avg7,
      baseline: stats.baseline,
      modifiers: stats.modifiers,
      reasonLine: stats.reasonLine,
      fallback: stats.fallback,
      context: stats.context
    };
  }

  function StepsGoalStepComponent({ data, onChange, stepData, context }) {
    // Контракт checkin-morning, «чек-ин не пройден до вечера» (решение
    // 24 августа): экран один и вечером тоже — «Цель по шагам» относится к уже
    // прошедшему дню и не переписывается. Второго набора формулировок под этот
    // экран нет: два текста — два места правки и два повода разойтись. Ответ
    // отсюда всегда уходит в profile.stepsGoal (см. save ниже), вечернего
    // близнеца с приёмником day.steps здесь заводить нельзя.
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = stepData?.weight?.weightKg ? (stepData.weight.weightKg + (stepData.weight.weightG || 0) / 10) : profile.weight || 70;
    const stepsStats = useMemo(
      () => computeAdaptiveStepsGoal({
        profile: { ...profile, weight },
        context,
        allStepData: stepData,
        today: context?.dateKey ? new Date(`${context.dateKey}T12:00:00.000Z`) : undefined,
      }),
      [weight, profile, context, stepData]
    );

    const defaultStepsGoal = useMemo(() => stepsStats.recommended, [stepsStats.recommended]);

    const sliderMin = STEPS_GOAL_SLIDER_MIN;
    const sliderMax = STEPS_GOAL_SLIDER_MAX;
    const stepsGoal = Math.max(sliderMin, Math.min(sliderMax, data.stepsGoal ?? defaultStepsGoal));
    const hasStepsHistory = stepsStats.daysWithData >= STEPS_HISTORY_MIN_DAYS && !stepsStats.fallback;

    // Расчёт бонуса ккал
    const isFemale = profile.gender === 'Женский';
    const coef = isFemale ? 0.5 : 0.57;
    const referenceSteps = stepsStats.median || stepsStats.avg7 || stepsStats.avg || 0;
    const bonusSteps = stepsGoal - referenceSteps;
    const bonusKm = bonusSteps * 0.7 / 1000;
    const bonusKcal = Math.round(coef * weight * bonusKm);

    const adviceValue = Math.max(
      sliderMin,
      Math.min(sliderMax, Math.round(Number(stepsStats.recommended) || defaultStepsGoal))
    );
    const advicePercent = Math.min(
      100,
      Math.max(0, stepsGoalSliderValueToRatio(adviceValue, sliderMin, sliderMax) * 100)
    );
    const adviceLabel = `${hasStepsHistory ? 'Совет' : 'Старт'} · ${adviceValue.toLocaleString('ru-RU')}`;
    const stepsTrackAriaLabel = buildStepsTrackAriaLabel(stepsGoal, adviceLabel);
    const awayFromAdvice = Math.round(stepsGoal) !== adviceValue;
    const narrative = buildStepsGoalNarrative(stepsStats, awayFromAdvice, adviceValue);

    const restoreAdvice = (event) => {
      if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
      }
      onChange({ ...data, stepsGoal: adviceValue });
    };

    return React.createElement('div', { className: 'mc-steps-step' },
      React.createElement('div', { className: 'mc-step-kicker' }, 'Шаги на сегодня'),
      React.createElement('div', {
        className: 'mc-steps-hero' + (awayFromAdvice ? ' mc-steps-hero--custom' : '')
      },
        React.createElement('span', { className: 'mc-steps-hero-value' },
          Math.round(stepsGoal).toLocaleString('ru-RU')
        ),
        React.createElement('span', { className: 'mc-steps-unit' }, 'шагов')
      ),
      React.createElement('div', { className: 'mc-recorded-sub', style: { textAlign: 'center', fontWeight: 600 } }, narrative.headline),
      React.createElement('div', { className: 'mc-steps-slider-container', style: { width: '100%', marginTop: 20 } },
        React.createElement('div', { style: { position: 'relative', height: 17 } },
          React.createElement('button', {
            type: 'button',
            className: 'mc-steps-advice-mark',
            style: { left: `${advicePercent}%` },
            onClick: restoreAdvice,
            'aria-hidden': 'true',
            tabIndex: -1
          }, adviceLabel)
        ),
        React.createElement(DragValueSlider, {
          className: 'mc-v4-scale',
          variant: 'v4',
          fill: awayFromAdvice ? 'act' : undefined,
          min: sliderMin,
          max: sliderMax,
          step: 500,
          value: stepsGoal,
          thumbSize: 22,
          valueToRatio: stepsGoalSliderValueToRatio,
          ratioToValue: stepsGoalSliderRatioToValue,
          stepForValue: stepsGoalSliderStepForValue,
          onValue: (nextValue) => onChange({ ...data, stepsGoal: nextValue }),
          ariaLabel: 'Цель по шагам',
          ariaLabelTrack: stepsTrackAriaLabel,
          style: { marginTop: 0 }
        }),
        React.createElement('div', { className: 'mc-steps-slider-labels' },
          React.createElement('span', null, '3 000'),
          React.createElement('span', null, '30 000')
        ),
        narrative.sliderHint && React.createElement('div', {
          className: 'mc-recorded-hint',
          style: { textAlign: 'center', marginTop: 11, fontWeight: 600 }
        }, narrative.sliderHint)
      ),
      narrative.infoCard && React.createElement('div', { className: 'mc-steps-info-card' }, narrative.infoCard),
      data.showRefeed && React.createElement('div', { className: 'mc-steps-refeed-row' },
        React.createElement('div', null,
          React.createElement('div', { className: 'mc-steps-refeed-title' }, 'Загрузочный день'),
          React.createElement('div', { className: 'mc-steps-refeed-hint' }, data.refeedHint || getRefeedStepsHint())
        ),
        React.createElement('div', { className: 'mc-rest-yesno' },
          React.createElement('button', {
            type: 'button',
            className: 'mc-pill mc-pill--mini mc-pill--choice' + (data.isRefeedDay === true ? ' is-on' : ''),
            onClick: () => onChange({ ...data, isRefeedDay: true, refeedManual: true })
          }, 'Да'),
          React.createElement('button', {
            type: 'button',
            className: 'mc-pill mc-pill--mini mc-pill--choice' + (data.isRefeedDay !== true ? ' is-on' : ''),
            onClick: () => onChange({ ...data, isRefeedDay: false, refeedManual: true })
          }, 'Нет')
        )
      ),
      narrative.footnote && React.createElement('div', {
        className: 'mc-recorded-hint',
        style: { textAlign: 'center', marginTop: (narrative.infoCard || data.showRefeed) ? 14 : 26 }
      }, narrative.footnote)
    );
  }

  registerStep('stepsGoal', {
    title: 'Шаги',
    hint: 'Какой день тебя ждёт?',
    component: StepsGoalStepComponent,
    getInitialData: (context, allStepData) => {
      const profile = lsGet('heys_profile', {});
      const dateKey = context?.dateKey || getTodayKey();
      const dayData = readDayData(dateKey, {});
      const stats = computeAdaptiveStepsGoal({
        profile,
        context,
        allStepData,
        today: new Date(`${dateKey}T12:00:00.000Z`),
      });
      const showRefeed = typeof HEYS.MorningCheckinUtils?.shouldIncludeRefeedStep === 'function'
        ? HEYS.MorningCheckinUtils.shouldIncludeRefeedStep(profile, dateKey)
        : false;
      return {
        stepsGoal: stats.recommended,
        showRefeed,
        isRefeedDay: typeof dayData.isRefeedDay === 'boolean' ? dayData.isRefeedDay : false,
        refeedHint: getRefeedStepsHint()
      };
    },
    save: (data, context) => {
      const profile = lsGet('heys_profile', {});
      const dateKey = context?.dateKey
        || HEYS.dayUtils?.todayISO?.()
        || new Date().toISOString().slice(0, 10);
      profile.stepsGoal = data.stepsGoal;
      profile.stepsGoalConfirmedDate = dateKey;
      profile.updatedAt = Date.now();
      lsSet('heys_profile', profile);
      if (data.showRefeed === true && typeof data.isRefeedDay === 'boolean') {
        const dayData = getFreshDayData(dateKey);
        dayData.date = dateKey;
        dayData.isRefeedDay = data.isRefeedDay;
        if (data.isRefeedDay === true) {
          dayData.refeedReason = dayData.refeedReason || 'deficit';
        } else if (data.refeedManual === true) {
          dayData.refeedReason = null;
        }
        dayData.updatedAt = Date.now();
        saveDayData(dateKey, dayData);
      }
      window.dispatchEvent(new CustomEvent('heys:profile-updated', {
        detail: { stepsGoal: data.stepsGoal, stepsGoalConfirmedDate: dateKey }
      }));
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'isRefeedDay', source: 'steps-goal-step', forceReload: true }
      }));
    }
  });

  // =============================================
  // ШАГ 5: ДЕФИЦИТ КАЛОРИЙ
  // =============================================

  /**
   * Получить текущий дефицит из дня или профиля
   */
  function getCurrentDeficit(dateKey) {
    const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
    if (day.deficitPct !== undefined && day.deficitPct !== null && day.deficitPct !== '') {
      return day.deficitPct;
    }
    const profile = lsGet('heys_profile', {});
    return profile.deficitPctTarget ?? 15;
  }

  /**
   * DeficitStep — Шаг выбора дефицита калорий
   * Диапазон: -20% (дефицит/похудение) до +20% (профицит/набор)
   */
  function DeficitStepComponent({ data, onChange }) {
    const { useMemo, useCallback } = React;

    const deficit = data.deficit ?? 0;

    // Значения для колеса: от -20 до +20
    const deficitValues = useMemo(() => Array.from({ length: 41 }, (_, i) => i - 20), []);

    // Получаем цвет и описание в зависимости от значения
    const getDeficitInfo = useCallback((val) => HEYS.scales.deficit(val), []);

    const info = getDeficitInfo(deficit);

    // Колесо дефицита отклика не даёт — checkin-morning «на кручение колёс и
    // ползунков её нет».
    const setDeficit = (v) => {
      onChange({ ...data, deficit: v });
    };

    // Форматирование значения для отображения в колесе
    const formatValue = (v) => (v > 0 ? '+' : '') + v + '%';

    // Быстрые пресеты
    const presets = [
      { value: -15, label: '-15%', emoji: '🔥' },
      { value: -10, label: '-10%', emoji: '🎯' },
      { value: 0, label: '0%', emoji: '⚖️' },
      { value: 10, label: '+10%', emoji: '💪' },
    ];

    return React.createElement('div', { className: 'step-deficit' },
      // Основной дисплей
      React.createElement('div', { className: 'deficit-display' },
        React.createElement('div', { className: 'deficit-value', style: { color: info.color } },
          (deficit > 0 ? '+' : '') + deficit + '%'
        ),
        React.createElement('div', { className: 'deficit-label' },
          info.emoji + ' ' + info.label
        )
      ),

      // WheelPicker вместо слайдера
      React.createElement('div', { className: 'deficit-wheel-container' },
        React.createElement(WheelPicker, {
          values: deficitValues,
          value: deficit,
          onChange: setDeficit,
          label: '%',
          formatValue: formatValue
        })
      ),

      // Подсказка
      React.createElement('div', { className: 'deficit-hint' },
        'Отрицательный = дефицит (похудение)',
        React.createElement('br'),
        'Положительный = профицит (набор)',
        React.createElement('br'),
        'Норма дня в HEYS считается от вашего расхода; при затяжном жёстком дефиците метаболизм может адаптироваться — см. инсайт «Адаптивный термогенез».'
      ),

      // Быстрые пресеты
      React.createElement('div', { className: 'deficit-presets' },
        presets.map(p =>
          React.createElement('button', {
            key: p.value,
            className: 'deficit-preset' + (deficit === p.value ? ' active' : ''),
            onClick: () => {
              onChange({ ...data, deficit: p.value });
            },
            style: deficit === p.value ? {
              backgroundColor: info.color,
              borderColor: info.color
            } : {}
          }, p.emoji + ' ' + p.label)
        )
      )
    );
  }

  // Регистрация шага дефицита
  registerStep('deficit', {
    title: 'Дефицит',
    hint: 'Цель калорийности относительно нормы дня; устойчивый дефицит обычно переносится легче экстремального',
    component: DeficitStepComponent,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      return { deficit: getCurrentDeficit(dateKey), dateKey };
    },
    save: (data) => {
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const day = getFreshDayData(dateKey);
      const mutationAt = Math.max(Date.now(), (Number(day.deficitUpdatedAt) || 0) + 1);
      day.date = dateKey;
      day.deficitPct = data.deficit;
      day.deficitUpdatedAt = mutationAt;
      day.updatedAt = mutationAt;
      saveDayData(dateKey, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'deficitPct', value: data.deficit, source: 'deficit-step', forceReload: true }
      }));
    }
  });

  // =============================================
  // ШАГ 6: БЫТОВАЯ АКТИВНОСТЬ (Household)
  // =============================================

  /**
   * Примеры бытовой активности с MET коэффициентами
   * (активность на ногах БЕЗ движения — шаги считаем отдельно браслетом)
   */
  const HOUSEHOLD_EXAMPLES = [
    { icon: '🧹', name: 'Уборка', met: 3.0, minutes: 30 },
    { icon: '👶', name: 'Игры с детьми', met: 3.5, minutes: 40 },
    { icon: '🏢', name: 'Работа стоя', met: 2.0, minutes: 25 },
    { icon: '🍳', name: 'Готовка', met: 2.5, minutes: 30 },
    { icon: '🔧', name: 'Дом. дела', met: 3.5, minutes: 35 }
  ];

  /**
   * Пресеты времени бытовой активности
   */
  const HOUSEHOLD_PRESETS = [
    { label: '15 мин', value: 15, icon: '⚡' },
    { label: '30 мин', value: 30, icon: '🚶' },
    { label: '1 час', value: 60, icon: '🏃' },
    { label: '2 часа', value: 120, icon: '💪' }
  ];

  // Получить историю бытовой активности за N дней (минуты)
  function getHouseholdHistory(days = 7) {
    const result = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};
      const min = Number(dayData.householdMin) || 0;
      result.push({ date: key, minutes: min });
    }
    return result;
  }

  /**
   * Рассчитать ккал от бытовой активности
   */
  function calcHouseholdKcal(minutes, weight = 70) {
    // Средний MET для бытовой активности ~2.5
    // Формула: ккал = MET * вес(кг) * время(ч)
    const met = 2.5;
    return Math.round(met * weight * (minutes / 60));
  }

  /**
   * Получить статистику бытовой активности за неделю
   */
  function getWeeklyHouseholdStats() {
    const history = getHouseholdHistory(7);
    const nonZero = history.filter(h => h.minutes > 0).map(h => h.minutes);
    if (nonZero.length === 0) return { avg: 0, daysWithData: 0, trend: 'none', history };
    const avg = Math.round(nonZero.reduce((a, b) => a + b, 0) / nonZero.length);
    const trend = nonZero.length >= 3 ? (nonZero[0] > nonZero[2] ? 'up' : nonZero[0] < nonZero[2] ? 'down' : 'stable') : 'none';
    return { avg, daysWithData: nonZero.length, trend, history };
  }

  // Месячные метрики и streak подряд (дни >=30 мин)
  function getHouseholdMonthlyStats() {
    const history30 = getHouseholdHistory(30);
    const total30 = history30.reduce((a, b) => a + b.minutes, 0);
    let streak = 0;
    for (let i = 0; i < history30.length; i++) {
      if (history30[i].minutes >= 30) streak += 1; else break;
    }
    return { total30, streak, history30 };
  }

  /**
   * HouseholdStep — Шаг 1: Минуты + время (ввод данных)
   */
  function HouseholdMinutesComponent({ data, onChange, context }) {
    const { useCallback, useMemo } = React;

    const dateKey = context?.dateKey || new Date().toISOString().slice(0, 10);
    const minutes = data.minutes ?? 0;
    const householdTime = data.householdTime ?? '';

    // Получаем вес для расчёта калорий
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    const kcalBurned = calcHouseholdKcal(minutes, weight);

    // Цвет в зависимости от количества минут
    const getColor = useCallback((min) => {
      if (min === 0) return '#94a3b8';
      if (min < 30) return '#eab308';
      if (min < 60) return '#22c55e';
      return '#10b981';
    }, []);

    const color = getColor(minutes);

    // Slider
    const sliderMin = 0;
    const sliderMax = 180;
    const sliderPercent = Math.min(100, (minutes / sliderMax) * 100);

    // Quick preset buttons
    const handlePreset = (value) => {
      onChange({ ...data, minutes: value });
    };

    // Статус текст
    const getStatusText = (min) => {
      if (min === 0) return 'Не указано';
      if (min < 30) return 'Небольшая активность';
      if (min < 60) return 'Хорошая активность';
      if (min < 120) return 'Отличная активность!';
      return 'Супер активный день! 🔥';
    };

    // Парсим время для TimePicker (числа)
    const [currentHour, currentMinute] = useMemo(() => {
      if (householdTime) {
        const [h, m] = householdTime.split(':').map(Number);
        return [h || 0, Math.floor((m || 0) / 5) * 5];
      }

      const now = new Date();
      const roundedMinutes = Math.floor(now.getMinutes() / 5) * 5;
      return [now.getHours(), roundedMinutes];
    }, [householdTime]);

    // Используем переиспользуемый TimePicker из StepModal
    const TimePicker = HEYS.StepModal.TimePicker;
    const pad2 = HEYS.StepModal.pad2;

    // Haptic уже в TimePicker
    const setHour = (h) => {
      const newTime = `${pad2(h)}:${pad2(currentMinute)}`;
      onChange({ ...data, householdTime: newTime });
    };

    const setMinute = (m) => {
      const newTime = `${pad2(currentHour)}:${pad2(m)}`;
      onChange({ ...data, householdTime: newTime });
    };

    // Единый callback для linkedScroll
    const setTime = (h, m) => {
      const newTime = `${pad2(h)}:${pad2(m)}`;
      onChange({ ...data, householdTime: newTime });
    };

    return React.createElement('div', { className: 'step-household step-household-minutes' },
      // Основной дисплей
      React.createElement('div', { className: 'household-display' },
        React.createElement('div', { className: 'household-value', style: { color } },
          minutes,
          React.createElement('span', { className: 'household-unit' }, ' мин')
        ),
        React.createElement('div', { className: 'household-kcal' },
          kcalBurned > 0 && React.createElement('span', null, '🔥 ~' + kcalBurned + ' ккал')
        ),
        React.createElement('div', { className: 'household-status' }, getStatusText(minutes))
      ),

      // Слайдер
      React.createElement('div', { className: 'household-slider-container' },
        React.createElement('input', Object.assign({
          type: 'range',
          className: 'household-slider',
          min: sliderMin,
          max: sliderMax,
          step: 5,
          value: minutes,
        }, getRangeGestureProps((nextValue) => {
            onChange({ ...data, minutes: nextValue });
          }), {
          style: {
            touchAction: 'none',
            background: `linear-gradient(to right, ${color} ${sliderPercent}%, #e5e7eb ${sliderPercent}%)`
          }
        })),
        React.createElement('div', { className: 'household-slider-labels' },
          React.createElement('span', null, '0'),
          React.createElement('span', null, '30'),
          React.createElement('span', null, '1ч'),
          React.createElement('span', null, '1.5ч'),
          React.createElement('span', null, '2ч'),
          React.createElement('span', null, '2.5ч'),
          React.createElement('span', null, '3ч')
        )
      ),

      // Быстрые пресеты
      React.createElement('div', { className: 'household-presets' },
        HOUSEHOLD_PRESETS.map(p =>
          React.createElement('button', {
            key: p.value,
            type: 'button',
            className: 'household-preset' + (minutes === p.value ? ' active' : ''),
            onClick: () => handlePreset(p.value),
            style: minutes === p.value ? {
              backgroundColor: color,
              borderColor: color,
              color: '#fff'
            } : {}
          }, p.icon + ' ' + p.label)
        )
      ),

      // Секция времени (компактная)
      React.createElement('div', { className: 'household-time-section' },
        React.createElement('div', { className: 'household-time-header' },
          React.createElement('span', { className: 'household-time-label' }, '⏰ Когда была активность?'),
          householdTime && React.createElement('span', { className: 'household-time-value-small' }, householdTime)
        ),
        React.createElement(TimePicker, {
          hours: currentHour,
          minutes: currentMinute,
          onHoursChange: setHour,
          onMinutesChange: setMinute,
          onTimeChange: setTime,
          hoursLabel: '',
          minutesLabel: '',
          display: null,
          linkedScroll: true,
          className: 'household-time-pickers compact'
        }),
        householdTime && React.createElement('button', {
          type: 'button',
          className: 'household-time-clear',
          onClick: () => {
            onChange({ ...data, householdTime: '' });
          }
        }, '✕ Сбросить')
      )
    );
  }

  /**
   * HouseholdStatsStep — Шаг 2: Статистика + график + бейджи (обратная связь)
   * Получает данные от первого шага через stepData.household_minutes
   */
  function HouseholdStatsComponent({ data, onChange, context, stepData }) {
    const { useMemo } = React;

    // Берём данные от первого шага (household_minutes) — они актуальные
    const minutesData = stepData?.household_minutes || data || {};
    const minutes = minutesData.minutes ?? 0;
    const householdTime = minutesData.householdTime ?? '';
    const todayKey = new Date().toISOString().slice(0, 10);

    // Получаем вес для расчёта калорий
    const profile = useMemo(() => lsGet('heys_profile', {}), []);
    const weight = profile.weight || 70;
    const kcalBurned = calcHouseholdKcal(minutes, weight);

    // Статистика за неделю и месяц
    const weeklyStats = useMemo(() => getWeeklyHouseholdStats(), []);
    const monthlyStats = useMemo(() => getHouseholdMonthlyStats(), []);
    const history7 = weeklyStats.history || getHouseholdHistory(7);

    // Для спарклайна
    const targetMin = 30;
    const maxSpark = Math.max(...history7.map(h => h.minutes), 90);
    const sparkBars = history7.slice().reverse();

    // Бэйджи достижений
    const showStreakBadge = monthlyStats.streak >= 3;
    const showMonthlyBadge = monthlyStats.total30 >= 500;

    // Цвет
    const getColor = (min) => {
      if (min === 0) return '#94a3b8';
      if (min < 30) return '#eab308';
      if (min < 60) return '#22c55e';
      return '#10b981';
    };
    const color = getColor(minutes);

    return React.createElement('div', { className: 'step-household step-household-stats' },
      // Сводка: что введено
      React.createElement('div', { className: 'household-summary' },
        React.createElement('div', { className: 'household-summary-main' },
          React.createElement('span', { className: 'household-summary-value', style: { color } }, minutes + ' мин'),
          householdTime && React.createElement('span', { className: 'household-summary-time' }, ' в ' + householdTime),
          kcalBurned > 0 && React.createElement('span', { className: 'household-summary-kcal' }, ' • 🔥 ' + kcalBurned + ' ккал')
        )
      ),

      // Статистика за неделю
      weeklyStats.daysWithData > 0 && React.createElement('div', { className: 'household-weekly-stats' },
        React.createElement('span', { className: 'household-stats-icon' }, '📊'),
        React.createElement('span', { className: 'household-stats-text' },
          'В среднем за неделю: ' + weeklyStats.avg + ' мин',
          weeklyStats.trend === 'up' && ' ↑',
          weeklyStats.trend === 'down' && ' ↓'
        )
      ),

      // Спарклайн 7 дней
      React.createElement('div', { className: 'household-spark' },
        React.createElement('div', { className: 'household-spark-values' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('span', { key: h.date, className: isToday ? 'today' : '' },
              h.minutes > 0 ? `${h.minutes}` : '—'
            );
          })
        ),
        React.createElement('div', { className: 'household-spark-bars' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('div', {
              key: h.date,
              className: 'household-spark-bar' + (isToday ? ' today' : ''),
              title: `${h.date}: ${h.minutes} мин`,
              style: { height: `${Math.max(10, (h.minutes / maxSpark) * 100)}%`, background: h.minutes >= targetMin ? '#10b981' : '#e5e7eb' }
            });
          })
        ),
        React.createElement('div', { className: 'household-spark-labels' },
          sparkBars.map((h) => {
            const isToday = h.date === todayKey;
            return React.createElement('span', { key: h.date, className: isToday ? 'today' : '' }, h.date.slice(8));
          })
        )
      ),

      // Бэйджи достижений
      (showStreakBadge || showMonthlyBadge) && React.createElement('div', { className: 'household-badges' },
        showStreakBadge && React.createElement('span', { className: 'household-badge success' }, '🏅 ' + monthlyStats.streak + ' дней подряд ≥30 мин'),
        showMonthlyBadge && React.createElement('span', { className: 'household-badge info' }, '📆 ' + monthlyStats.total30 + ' мин за месяц')
      ),

      // Примеры активности (для справки)
      React.createElement('div', { className: 'household-examples' },
        React.createElement('div', { className: 'household-examples-title' }, '💡 Примеры бытовой активности:'),
        React.createElement('div', { className: 'household-examples-grid' },
          HOUSEHOLD_EXAMPLES.slice(0, 6).map((ex, i) =>
            React.createElement('span', {
              key: i,
              className: 'household-example readonly',
              title: `MET: ${ex.met}`
            }, ex.icon + ' ' + ex.name)
          )
        )
      )
    );
  }

  // Регистрация шага 1: Минуты бытовой активности
  registerStep('household_minutes', {
    title: 'Бытовая активность',
    hint: 'Сколько минут?',
    component: HouseholdMinutesComponent,
    getInitialData: (ctx) => {
      console.log('[Household getInitialData] ctx:', ctx);
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const editIndex = ctx?.editIndex ?? null;
      console.log('[Household getInitialData] dateKey:', dateKey, 'editIndex:', editIndex);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      console.log('[Household getInitialData] day:', day);
      console.log('[Household getInitialData] day.householdActivities:', day.householdActivities);
      console.log('[Household getInitialData] day.householdMin:', day.householdMin);
      const weekly = getWeeklyHouseholdStats();

      // Backward compatible: householdActivities массив или legacy householdMin
      const activities = day.householdActivities ||
        (day.householdMin > 0 ? [{ minutes: day.householdMin, time: day.householdTime || '' }] : []);
      console.log('[Household getInitialData] activities:', activities);

      // Если редактируем существующую — берём её данные
      if (editIndex !== null && editIndex >= 0 && activities[editIndex]) {
        const activity = activities[editIndex];
        console.log('[Household getInitialData] EDIT MODE - activity:', activity);
        return {
          minutes: activity.minutes || 0,
          householdTime: activity.time || '',
          dateKey,
          editIndex
        };
      }

      console.log('[Household getInitialData] ADD MODE - using defaults');
      // Добавление новой — дефолтные значения
      return { minutes: weekly.avg || 30, householdTime: '', dateKey, editIndex: null };
    },
    save: (data) => {
      console.log('[Household save] data:', data);
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const editIndex = data.editIndex;
      console.log('[Household save] editIndex:', editIndex, 'typeof:', typeof editIndex);
      const day = getFreshDayData(dateKey);
      day.date = dateKey;
      console.log('[Household save] day.householdActivities:', day.householdActivities);

      // Инициализируем массив если его нет
      if (!day.householdActivities) {
        // Миграция старых данных
        if (day.householdMin > 0) {
          day.householdActivities = [{ minutes: day.householdMin, time: day.householdTime || '' }];
        } else {
          day.householdActivities = [];
        }
      }

      const newActivity = { minutes: data.minutes, time: data.householdTime || '' };

      if (typeof editIndex === 'number' && editIndex >= 0 && editIndex < day.householdActivities.length) {
        // Редактирование существующей
        day.householdActivities[editIndex] = newActivity;
      } else {
        // Добавление новой
        day.householdActivities.push(newActivity);
      }

      // Обновляем legacy поля для совместимости
      day.householdMin = day.householdActivities.reduce((sum, h) => sum + (+h.minutes || 0), 0);
      day.householdTime = day.householdActivities[0]?.time || '';
      day.householdUpdatedAt = Math.max(Date.now(), (Number(day.householdUpdatedAt) || 0) + 1);
      day.updatedAt = day.householdUpdatedAt;
      saveDayData(dateKey, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'householdActivities',
          value: day.householdActivities,
          householdMin: day.householdMin,
          householdTime: day.householdTime,
          source: 'household-step',
          forceReload: true
        }
      }));

      if (typeof window !== 'undefined' && data.minutes > 0) {
        window.dispatchEvent(new CustomEvent('heysHouseholdActivityAdded', {
          detail: { minutes: data.minutes, date: dateKey }
        }));
      }
    },
    xpAction: 'household_logged'
  });

  // Регистрация шага 2: Статистика бытовой активности (read-only)
  registerStep('household_stats', {
    title: 'Статистика',
    hint: 'Ваш прогресс',
    component: HouseholdStatsComponent,
    canSkip: true,
    skipLabel: 'Готово',
    getInitialData: (ctx, prevData) => {
      // Получаем данные от предыдущего шага (household_minutes)
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      // Приоритет: данные от предыдущего шага > данные из storage
      const minutes = prevData?.minutes ?? day.householdMin ?? 0;
      const householdTime = prevData?.householdTime ?? day.householdTime ?? '';
      return { minutes, householdTime, dateKey };
    }
    // НЕТ save — это read-only шаг для показа статистики
  });

  // Регистрация комбинированного шага (для обратной совместимости)
  registerStep('household', {
    title: 'Бытовая активность',
    hint: 'Время на ногах помимо тренировок',
    component: HouseholdMinutesComponent,  // Показываем только минуты в старом режиме
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = lsGet(`heys_dayv2_${dateKey}`, {}) || {};
      const weekly = getWeeklyHouseholdStats();
      const minutes = day.householdMin || weekly.avg || 0;
      const householdTime = day.householdTime || '';
      return { minutes, householdTime, dateKey };
    },
    save: (data) => {
      const dateKey = data.dateKey || new Date().toISOString().slice(0, 10);
      const day = getFreshDayData(dateKey);
      day.date = dateKey;
      day.householdMin = data.minutes;
      day.householdTime = data.householdTime || '';
      day.householdUpdatedAt = Math.max(Date.now(), (Number(day.householdUpdatedAt) || 0) + 1);
      day.updatedAt = day.householdUpdatedAt;
      saveDayData(dateKey, day);

      // Уведомляем о изменении дня
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'householdMin', value: data.minutes, householdTime: data.householdTime, source: 'household-step' }
      }));

      if (typeof window !== 'undefined' && data.minutes > 0) {
        window.dispatchEvent(new CustomEvent('heysHouseholdActivityAdded', {
          detail: { minutes: data.minutes, date: dateKey }
        }));
      }
    },
    xpAction: 'household_logged'
  });

  // ============================================================
  // CYCLE STEP — Особый период (менструальный цикл)
  // ============================================================

  /**
   * Проверка: нужно ли показывать шаг cycle?
   * Release gate: трекинг цикла снят с релиза (prompt-cycle-removal).
   * Исторически: cycleTrackingEnabled=true и gender=Женский.
   */
  function shouldShowCycleStep() {
    try {
      const hf = HEYS.healthFeatures;
      if (hf && typeof hf.isCycleFeatureAvailable === 'function' && !hf.isCycleFeatureAvailable()) {
        return false;
      }
      if (hf && typeof hf.isCycleTrackingEnabled === 'function') {
        return hf.isCycleTrackingEnabled(lsGet('heys_profile', {}));
      }
      const profile = lsGet('heys_profile', {});
      // 🛡️ v65 FIX: check gender — cycle step is only for female users
      return profile.cycleTrackingEnabled === true && profile.gender === 'Женский';
    } catch {
      return false;
    }
  }

  /**
   * Компонент шага "Особый период" (v2 — с автоматическим проставлением)
   * Показывается только для женщин (проверка из stepData или профиля)
   */
  function CycleStepComponent({ data, onChange, stepData, context }) {
    const { useState, useCallback, useEffect } = React;

    // Проверяем пол: из stepData (регистрация) или из профиля
    const genderFromSteps = stepData?.['profile-personal']?.gender;
    const profile = lsGet('heys_profile', {});
    const gender = genderFromSteps || profile.gender;
    const isFemale = gender === 'Женский';

    // Также проверяем cycleTrackingEnabled из шагов или профиля
    const trackingFromSteps = stepData?.['profile-personal']?.cycleTrackingEnabled;
    const cycleTrackingEnabled = trackingFromSteps !== undefined ? trackingFromSteps : profile.cycleTrackingEnabled;

    // Если не женщина или трекинг выключен — автоматически пропускаем шаг
    const shouldSkip = !isFemale || cycleTrackingEnabled === false;

    // cycleDay: null = нет периода, 1-7 = день периода
    const [cycleDay, setCycleDay] = useState(data?.cycleDay || null);
    const [isEnabled, setIsEnabled] = useState(cycleDay !== null);
    const [showDayPicker, setShowDayPicker] = useState(false);

    // Получаем текущую дату
    const dateKey = data?._dateKey || new Date().toISOString().slice(0, 10);

    // Автопропуск если не нужен этот шаг
    useEffect(() => {
      if (shouldSkip && context?.onNext) {
        // Небольшая задержка чтобы не было мигания
        const timer = setTimeout(() => {
          onChange({ cycleDay: null, cycleStatus: 'skipped', cycleAnsweredAt: Date.now(), _skipped: true });
          context.onNext();
        }, 50);
        return () => clearTimeout(timer);
      }
    }, [shouldSkip, context, onChange]);

    // Если должны пропустить — показываем заглушку
    if (shouldSkip) {
      return React.createElement('div', { className: 'mc-cycle-step mc-cycle-skip' },
        React.createElement('div', { className: 'mc-cycle-header' },
          React.createElement('span', { className: 'mc-cycle-title' }, 'Пропускаем...')
        )
      );
    }

    // Обработчик toggle "Да/Нет"
    const handleToggle = useCallback(() => {
      const newEnabled = !isEnabled;
      setIsEnabled(newEnabled);
      if (newEnabled) {
        // Включаем — показываем выбор дня
        setShowDayPicker(true);
      } else {
        // Выключаем — сбрасываем и очищаем все связанные дни
        setCycleDay(null);
        onChange({ cycleDay: null, cycleStatus: 'none', cycleAnsweredAt: Date.now() });
        setShowDayPicker(false);

        // Очищаем связанные дни
        if (HEYS.Cycle?.clearCycleDays) {
          HEYS.Cycle.clearCycleDays(dateKey, lsGet, lsSet);
        }
      }
    }, [isEnabled, onChange, dateKey]);

    // Выбор дня с автоматическим проставлением всех 7 дней
    const selectDay = useCallback((day) => {
      setCycleDay(day);
      onChange({ cycleDay: day, cycleStatus: null, cycleAnsweredAt: Date.now() });
      setShowDayPicker(false);

      // Автоматически проставляем все 7 дней
      if (HEYS.Cycle?.setCycleDaysAuto) {
        const result = HEYS.Cycle.setCycleDaysAuto(dateKey, day, lsGet, lsSet);
        console.log('[Cycle Step] Auto-filled', result.updated, 'days');
      }
    }, [onChange, dateKey]);

    // Быстрые опции
    const quickOptions = [
      { day: 1, label: 'Первый день', hint: 'Только начался' },
      { day: 2, label: 'Второй день', hint: '' },
      { day: 3, label: 'Третий день', hint: '' },
      { day: 4, label: 'Середина', hint: '4-5 день' },
      { day: 6, label: 'Почти конец', hint: '6-7 день' }
    ];

    return React.createElement('div', { className: 'mc-cycle-step' },
      // Вопрос — чтобы было понятно о чём спрашиваем
      React.createElement('div', { className: 'mc-cycle-question' },
        'Сегодня особые дни?'
      ),

      // Заголовок с toggle
      React.createElement('div', { className: 'mc-cycle-header' },
        React.createElement('div', { className: 'mc-cycle-header-left' },
          React.createElement('span', { className: 'mc-cycle-title' }, 'Особые дни')
        ),
        // Toggle кнопка
        React.createElement('button', {
          type: 'button',
          className: 'mc-cycle-toggle ' + (isEnabled ? 'active' : ''),
          onClick: handleToggle,
          'aria-pressed': isEnabled
        }, isEnabled ? 'Да' : 'Нет')
      ),

      // Если включено и есть день — показываем текущий статус
      isEnabled && cycleDay && !showDayPicker && React.createElement('div', { className: 'mc-cycle-status' },
        React.createElement('div', { className: 'mc-cycle-status-main' },
          React.createElement('span', { className: 'mc-cycle-status-day' }, 'День ' + cycleDay),
          React.createElement('span', { className: 'mc-cycle-status-info' },
            cycleDay <= 3 ? 'Начало периода' :
              cycleDay <= 5 ? 'Середина периода' :
                'Конец периода'
          )
        ),
        React.createElement('button', {
          type: 'button',
          className: 'mc-cycle-change-btn',
          onClick: () => setShowDayPicker(true)
        }, 'Изменить')
      ),

      // Выпадашка выбора дня
      isEnabled && showDayPicker && React.createElement('div', { className: 'mc-cycle-picker' },
        React.createElement('div', { className: 'mc-cycle-picker-title' },
          'Какой сегодня день?'
        ),

        // Быстрые опции
        React.createElement('div', { className: 'mc-cycle-options' },
          quickOptions.map(opt =>
            React.createElement('button', {
              key: opt.day,
              type: 'button',
              className: 'mc-cycle-option ' + (cycleDay === opt.day ? 'active' : ''),
              onClick: () => selectDay(opt.day)
            },
              React.createElement('span', { className: 'mc-cycle-option-day' }, opt.day),
              React.createElement('span', { className: 'mc-cycle-option-label' }, opt.label),
              opt.hint && React.createElement('span', { className: 'mc-cycle-option-hint' }, opt.hint)
            )
          )
        ),

        // Точный выбор дня (1-7)
        React.createElement('div', { className: 'mc-cycle-exact' },
          React.createElement('span', { className: 'mc-cycle-exact-label' }, 'Точный день:'),
          React.createElement('div', { className: 'mc-cycle-exact-days' },
            [1, 2, 3, 4, 5, 6, 7].map(d =>
              React.createElement('button', {
                key: d,
                type: 'button',
                className: 'mc-cycle-exact-btn ' + (cycleDay === d ? 'active' : ''),
                onClick: () => selectDay(d)
              }, d)
            )
          )
        ),

        // Подсказка об автозаполнении
        React.createElement('div', { className: 'mc-cycle-auto-hint' },
          React.createElement('span', { className: 'mc-cycle-hint-icon' }, '✨'),
          React.createElement('span', { className: 'mc-cycle-hint-text' },
            'Дни 1-7 проставятся автоматически'
          )
        )
      ),

      // Если выключено — подсказка
      !isEnabled && React.createElement('div', { className: 'mc-cycle-disabled-hint' },
        'Отмечайте для адаптированных рекомендаций'
      )
    );
  }

  // Регистрация шага особого периода
  registerStep('cycle', {
    title: 'Особый период',
    hint: 'Адаптация норм',
    component: CycleStepComponent,
    canSkip: true,
    // shouldShow — проверяем, включён ли tracking в профиле
    shouldShow: shouldShowCycleStep,
    getInitialData: (ctx) => {
      const dateKey = ctx?.dateKey || new Date().toISOString().slice(0, 10);
      const day = readDayData(dateKey, {}) || {};
      return {
        cycleDay: day.cycleDay || null,
        cycleStatus: day.cycleStatus || null,
        cycleAnsweredAt: day.cycleAnsweredAt || null,
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || new Date().toISOString().slice(0, 10);
      const cycleDay = data.cycleDay;

      // Используем автоматическое проставление 7 дней
      if (cycleDay != null && cycleDay >= 1 && cycleDay <= 7) {
        // setCycleDaysAuto проставит дни 1-7 автоматически
        if (HEYS.Cycle && HEYS.Cycle.setCycleDaysAuto) {
          HEYS.Cycle.setCycleDaysAuto(dateKey, cycleDay, lsGet, lsSet);
        } else {
          // Fallback: просто сохраняем один день
          const day = getFreshDayData(dateKey);
          day.date = dateKey;
          day.cycleDay = cycleDay;
          day.cycleStatus = null;
          day.cycleAnsweredAt = data.cycleAnsweredAt || Date.now();
          day.cycleUpdatedAt = Math.max(Date.now(), (Number(day.cycleUpdatedAt) || 0) + 1);
          day.updatedAt = day.cycleUpdatedAt;
          saveDayData(dateKey, day);
        }
        if (HEYS.Cycle && HEYS.Cycle.setCycleDaysAuto) {
          const day = getFreshDayData(dateKey);
          day.date = dateKey;
          day.cycleStatus = null;
          day.cycleAnsweredAt = data.cycleAnsweredAt || Date.now();
          day.cycleUpdatedAt = Math.max(Date.now(), (Number(day.cycleUpdatedAt) || 0) + 1);
          day.updatedAt = day.cycleUpdatedAt;
          saveDayData(dateKey, day);
        }
      } else if (cycleDay == null) {
        // Очищаем все связанные дни цикла
        if (HEYS.Cycle && HEYS.Cycle.clearCycleDays) {
          HEYS.Cycle.clearCycleDays(dateKey, lsGet, lsSet);
        } else {
          // Fallback: очищаем только текущий день
          const day = getFreshDayData(dateKey);
          day.date = dateKey;
          day.cycleDay = null;
          day.cycleStatus = 'none';
          day.cycleAnsweredAt = data.cycleAnsweredAt || Date.now();
          day.cycleUpdatedAt = Math.max(Date.now(), (Number(day.cycleUpdatedAt) || 0) + 1);
          day.updatedAt = day.cycleUpdatedAt;
          saveDayData(dateKey, day);
        }
        if (HEYS.Cycle && HEYS.Cycle.clearCycleDays) {
          const day = getFreshDayData(dateKey);
          day.date = dateKey;
          day.cycleDay = null;
          day.cycleStatus = data._skipped ? 'skipped' : 'none';
          day.cycleAnsweredAt = data.cycleAnsweredAt || Date.now();
          day.cycleUpdatedAt = Math.max(Date.now(), (Number(day.cycleUpdatedAt) || 0) + 1);
          day.updatedAt = day.cycleUpdatedAt;
          saveDayData(dateKey, day);
        }
      }

      // Триггер облачной синхронизации
      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'cycle' }
      }));

      // Уведомляем DayTab о изменении
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'cycleDay',
          value: data.cycleDay,
          source: 'cycle-step',
          updatedAt: Date.now()
        }
      }));
      return {
        affectedKeys: [`heys_dayv2_${dateKey}`],
        completed: true
      };
    },
    xpAction: 'cycle_logged'
  });

  // ============================================================
  // MEASUREMENTS STEP — Замеры тела (обхваты: талия, бёдра, бедро, бицепс)
  // ============================================================

  const MEASUREMENT_FIELDS = [
    { key: 'waist', label: 'Обхват талии', icon: '📏', hint: 'На уровне пупка', min: 40, max: 150, hasSide: false },
    { key: 'hips', label: 'Обхват бёдер', icon: '🍑', hint: 'По ягодицам', min: 60, max: 150, hasSide: false },
    { key: 'thigh', label: 'Обхват бедра', icon: '🦵', hint: 'Одна сторона', min: 30, max: 100, hasSide: true },
    { key: 'biceps', label: 'Обхват бицепса', icon: '💪', hint: 'В напряжении', min: 20, max: 60, hasSide: true }
  ];

  // Сохранённая сторона (левая/правая) — запоминаем выбор
  const MEASUREMENT_SIDE_KEY = 'heys_measurement_side';
  function getMeasurementSide() {
    try { return lsGet(MEASUREMENT_SIDE_KEY, 'right'); } catch { return 'right'; }
  }
  function setMeasurementSide(side) {
    try { lsSet(MEASUREMENT_SIDE_KEY, side); } catch {
      // Ignore storage write errors for optional preference
    }
  }

  /**
   * Поиск последних замеров за 60 дней
   */
  function getLastMeasurements() {
    const today = new Date();
    for (let i = 0; i <= 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, null);
      if (!dayData || typeof dayData !== 'object') continue;
      const m = dayData.measurements;
      if (m && m.measuredAt && (m.waist || m.hips || m.thigh || m.biceps)) {
        return {
          ...m,
          daysAgo: i,
          foundDate: key
        };
      }
    }
    return {
      waist: null,
      hips: null,
      thigh: null,
      biceps: null,
      measuredAt: null,
      daysAgo: null,
      foundDate: null
    };
  }

  function getLastMeasurementByField(field) {
    const today = new Date();
    for (let i = 0; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, {}) || {};
      const m = dayData.measurements;
      if (m && m.measuredAt && m[field]) {
        return { value: m[field], date: key, daysAgo: i };
      }
    }
    return { value: null, date: null, daysAgo: null };
  }

  function getMeasurementsHistory(days = 30) {
    const today = new Date();
    const list = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dayData = readDayData(key, null);
      if (!dayData || typeof dayData !== 'object') continue;
      const m = dayData.measurements;
      if (m && m.measuredAt) {
        list.push({ date: key, ...m });
      }
    }
    return list;
  }

  /**
   * Строка замеров на шаге 5: только просрочка ≥7 дней, неполный последний замер или «ещё не было».
   * Свежие (<7 дней) — скрываем, в подписи «замеры свежие» (кадр «минимум»).
   */
  function shouldShowMeasurements() {
    const profile = lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    if (hf && typeof hf.isMeasurementsTrackingEnabled === 'function') {
      if (!hf.isMeasurementsTrackingEnabled(profile)) return false;
    } else if (profile.measurementsTrackingEnabled !== true) {
      return false;
    }

    const last = getLastMeasurements();
    if (!last.measuredAt) return true;
    if (last.waist && (!last.hips || !last.thigh || !last.biceps)) return true;

    const daysAgo = Number(last.daysAgo);
    if (Number.isFinite(daysAgo) && daysAgo < 7) return false;
    return Number.isFinite(daysAgo) && daysAgo >= 7;
  }

  function isMeasurementsOverdue(lastMeasurements) {
    if (!lastMeasurements || !lastMeasurements.measuredAt) return true;
    const daysAgo = Number(lastMeasurements.daysAgo);
    return Number.isFinite(daysAgo) && daysAgo >= 7;
  }

  // «21 день», а не «21 дней»: русское склонение считается по последним двум
  // разрядам, и без этого метка просрочки врала на 21, 22, 31, 32 и далее.
  function pluralDays(count) {
    const abs = Math.abs(Number(count));
    const tail100 = abs % 100;
    if (tail100 >= 11 && tail100 <= 14) return 'дней';
    const tail10 = abs % 10;
    if (tail10 === 1) return 'день';
    if (tail10 >= 2 && tail10 <= 4) return 'дня';
    return 'дней';
  }

  // Контракт checkin-morning, «вид просроченной строки»: метка числом дней стоит
  // справа, 10 px/700. Это именно число дней — когда замеров не было ни разу,
  // числа нет и метки нет: про «ещё не было» говорит подпись самой строки.
  function formatMeasurementsOverdueBadge(lastMeasurements) {
    if (!lastMeasurements?.measuredAt) return null;
    const daysAgo = Number(lastMeasurements.daysAgo);
    if (!Number.isFinite(daysAgo) || daysAgo < 7) return null;
    return `${daysAgo} ${pluralDays(daysAgo)}`;
  }

  function MeasurementsStepComponent({ data, onChange }) {
    const lastMeasurements = useMemo(() => getLastMeasurements(), []);

    // Сторона измерения (левая/правая)
    const [side, setSideState] = useState(() => getMeasurementSide());
    const setSide = (newSide) => {
      setSideState(newSide);
      setMeasurementSide(newSide);
    };

    // Локальный текстовый state для инпутов — инициализируем из data
    const [inputValues, setInputValues] = useState(() => {
      const init = {};
      MEASUREMENT_FIELDS.forEach(f => {
        if (data[f.key] !== null && data[f.key] !== undefined) {
          init[f.key] = String(data[f.key]);
        }
      });
      return init;
    });

    const lastByField = useMemo(() => {
      const res = {};
      MEASUREMENT_FIELDS.forEach((f) => {
        res[f.key] = getLastMeasurementByField(f.key);
      });
      return res;
    }, []);

    // Получаем значение: из локального state
    const getInputValue = (key) => {
      return inputValues[key] ?? '';
    };

    const handleInputChange = (key, textValue) => {
      // Сохраняем текст как есть (для нормального ввода)
      setInputValues(prev => ({ ...prev, [key]: textValue }));

      // Парсим число и обновляем данные
      const cleaned = textValue.replace(',', '.');
      if (cleaned === '' || cleaned === '.') {
        onChange({ ...data, [key]: null });
      } else {
        const num = parseFloat(cleaned);
        if (!isNaN(num)) {
          onChange({ ...data, [key]: num });
        }
      }
    };

    const handleFocus = (key, e) => {
      // При фокусе выделяем всё
      e.target.select();
    };

    const lastMeasuredInfo = lastMeasurements.measuredAt
      ? `Последний замер: ${lastMeasurements.daysAgo === 0 ? 'сегодня' : lastMeasurements.daysAgo === 1 ? 'вчера' : lastMeasurements.daysAgo + ' дн. назад'}`
      : 'Первый замер';

    return React.createElement('div', { className: 'mc-measurements-step' },
      React.createElement('div', { className: 'mc-measurements-info' },
        React.createElement('span', { className: 'mc-measurements-info-icon' }, '📅'),
        React.createElement('span', { className: 'mc-measurements-info-text' }, lastMeasuredInfo)
      ),

      React.createElement('div', { className: 'mc-measurements-fields' },
        MEASUREMENT_FIELDS.map(field => {
          const numValue = data[field.key];
          const last = lastByField[field.key];
          const placeholder = last.value ? String(last.value) : '—';
          const delta = last.value && numValue ? numValue - last.value : null;
          const deltaPct = (last.value && numValue) ? (numValue - last.value) / last.value : null;
          const showWarning = deltaPct !== null && Math.abs(deltaPct) > 0.15;
          const progressLabel = last.value && numValue ? `${delta > 0 ? '+' : ''}${(Math.round(delta * 10) / 10)} см` : null;

          return React.createElement('div', {
            key: field.key,
            className: 'mc-measurement-field'
          },
            React.createElement('div', { className: 'mc-measurement-header' },
              React.createElement('span', { className: 'mc-measurement-icon' }, field.icon),
              React.createElement('span', { className: 'mc-measurement-label' }, field.label),
              last.value && React.createElement('span', { className: 'mc-measurement-prev' }, `было: ${last.value}`)
            ),
            React.createElement('div', { className: 'mc-measurement-input-row' },
              React.createElement('input', {
                type: 'text',
                inputMode: 'decimal',
                pattern: '[0-9]*\\.?[0-9]*',
                className: 'mc-measurement-input',
                value: getInputValue(field.key),
                placeholder,
                onFocus: (e) => handleFocus(field.key, e),
                onChange: (e) => handleInputChange(field.key, e.target.value)
              }),
              React.createElement('span', { className: 'mc-measurement-unit' }, 'см'),
              progressLabel && React.createElement('span', {
                className: 'mc-measurement-delta' + (delta > 0 ? ' up' : delta < 0 ? ' down' : '')
              }, progressLabel)
            ),
            !last.value && React.createElement('div', { className: 'mc-measurement-no-data' }, 'Первый замер'),
            showWarning && React.createElement('div', { className: 'mc-measurement-warning', role: 'alert' }, '⚠️ Проверьте ввод'),
            // Хинт + индикатор стороны для бедра/бицепса
            React.createElement('div', { className: 'mc-measurement-hint' },
              field.hasSide
                ? `${field.hint} (${side === 'left' ? 'левая' : 'правая'})`
                : field.hint
            )
          );
        })
      ),

      // Переключатель стороны (только если есть поля с hasSide)
      MEASUREMENT_FIELDS.some(f => f.hasSide) && React.createElement('div', { className: 'mc-measurements-side-toggle' },
        React.createElement('span', { className: 'mc-measurements-side-label' }, 'Сторона замера:'),
        React.createElement('div', { className: 'mc-measurements-side-buttons' },
          React.createElement('button', {
            type: 'button',
            className: 'mc-measurements-side-btn' + (side === 'left' ? ' active' : ''),
            onClick: () => setSide('left')
          }, '← Левая'),
          React.createElement('button', {
            type: 'button',
            className: 'mc-measurements-side-btn' + (side === 'right' ? ' active' : ''),
            onClick: () => setSide('right')
          }, 'Правая →')
        )
      ),

      React.createElement('div', { className: 'mc-measurements-tip' },
        React.createElement('span', { className: 'mc-measurements-tip-icon' }, '💡'),
        React.createElement('span', { className: 'mc-measurements-tip-text' },
          'Мерьте утром, одна сторона, без одежды'
        )
      )
    );
  }

  // Регистрация шага замеров
  registerStep('measurements', {
    title: 'Замеры тела',
    hint: 'Еженедельный контроль',
    component: MeasurementsStepComponent,
    canSkip: true,  // Можно пропустить
    getInitialData: (context = {}) => {
      // Используем дату из context или сегодня
      const dateKey = context.dateKey || getTodayKey();

      // Используем lsGet — он:
      // 1. Работает со scoped-ключами (clientId)
      // 2. Декомпрессирует данные (¤Z¤ prefix)
      // 3. Синхронизирован с облаком через HEYS.store
      const dayData = lsGet(`heys_dayv2_${dateKey}`, {});

      const m = dayData?.measurements || {};
      return {
        waist: m.waist ?? null,
        hips: m.hips ?? null,
        thigh: m.thigh ?? null,
        biceps: m.biceps ?? null,
        _dateKey: dateKey // Передаём дату для save
      };
    },
    save: (data) => {
      const profile = lsGet('heys_profile', {}) || {};
      const hf = HEYS.healthFeatures;
      const measurementsEnabled = hf && typeof hf.isMeasurementsTrackingEnabled === 'function'
        ? hf.isMeasurementsTrackingEnabled(profile)
        : profile.measurementsTrackingEnabled === true;
      if (!measurementsEnabled) {
        return {
          skipped: true,
          reason: 'measurements_tracking_disabled',
          affectedKeys: []
        };
      }

      // Используем дату из data._dateKey (переданную из getInitialData) или сегодня
      const dateKey = data._dateKey || getTodayKey();
      const dayData = getFreshDayData(dateKey);
      dayData.date = dateKey;
      const hasData = ['waist', 'hips', 'thigh', 'biceps'].some(k => data[k] !== null && data[k] !== undefined && !Number.isNaN(data[k]));

      if (!hasData) {
        return {
          skipped: true,
          reason: 'empty_measurements',
          affectedKeys: []
        };
      }

      const newUpdatedAt = Date.now();
      dayData.measurements = {
        waist: data.waist ?? null,
        hips: data.hips ?? null,
        thigh: data.thigh ?? null,
        biceps: data.biceps ?? null,
        measuredAt: dateKey
      };
      dayData.updatedAt = newUpdatedAt;
      saveDayData(dateKey, dayData);

      // Триггер облачной синхронизации
      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'measurements' }
      }));

      // Уведомляем DayTab о изменении (с forceReload)
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'measurements',
          value: dayData.measurements,
          source: 'measurements-step',
          updatedAt: newUpdatedAt,
          forceReload: true
        }
      }));
      return {
        affectedKeys: [`heys_dayv2_${dateKey}`],
        completed: true
      };
    },
    xpAction: 'measurements_logged'
  });

  // ============================================================
  // COLD EXPOSURE STEP — 🧊 Холодовое воздействие
  // v3.2.1: Улучшает инсулиновую чувствительность на ~5-12%
  // v3.3.0: Добавлены 3 слайдера оценок (mood, wellbeing, stress)
  // ============================================================

  const COLD_TYPES = [
    { id: 'none', icon: '🚿', label: 'Нет', desc: 'Обычный душ' },
    { id: 'coldShower', icon: '🧊', label: 'Холодный душ', desc: '2-3 мин, -5% волна' },
    { id: 'coldBath', icon: '🛁', label: 'Холодная ванна', desc: '10+ мин, -10% волна' },
    { id: 'coldSwim', icon: '🏊', label: 'Моржевание', desc: '5+ мин, -12% волна' }
  ];

  // Emoji для оценок холода
  const COLD_MOOD_EMOJI = ['😢', '😢', '😕', '😕', '😐', '😐', '🙂', '🙂', '😊', '😊', '😄'];
  const COLD_WELLBEING_EMOJI = ['🥶', '🥶', '😓', '😓', '😐', '😐', '🙂', '🙂', '💪', '💪', '🔥'];
  const COLD_STRESS_EMOJI = ['😌', '😌', '🙂', '🙂', '😐', '😐', '😟', '😟', '😰', '😰', '😱'];

  // Пресеты для быстрого выбора
  const COLD_PRESETS_POSITIVE = [
    { emoji: '👎', value: 2, label: 'Плохо' },
    { emoji: '👌', value: 5, label: 'Норм' },
    { emoji: '👍', value: 8, label: 'Хорошо' }
  ];
  const COLD_PRESETS_NEGATIVE = [
    { emoji: '😌', value: 2, label: 'Спокоен' },
    { emoji: '😐', value: 5, label: 'Средне' },
    { emoji: '😰', value: 8, label: 'Стресс' }
  ];

  // Цвета для позитивных шкал
  const getColdPositiveColor = (v) => HEYS.scales.wellbeing(v).color;

  // Цвета для негативных шкал (stress)
  const getColdNegativeColor = (v) => HEYS.scales.stress(v).color;

  // Текст для значений
  const getColdMoodText = (v) => v <= 2 ? 'Плохо' : v <= 4 ? 'Так себе' : v <= 6 ? 'Норм' : v <= 8 ? 'Хорошо' : 'Отлично';
  const getColdWellbeingText = (v) => v <= 2 ? 'Замёрз' : v <= 4 ? 'Холодно' : v <= 6 ? 'Терпимо' : v <= 8 ? 'Бодрит' : 'Огонь!';
  const getColdStressText = (v) => v <= 2 ? 'Спокоен' : v <= 4 ? 'Немного' : v <= 6 ? 'Средне' : v <= 8 ? 'Много' : 'Очень';

  // Компонент слайдера оценки для холода
  function ColdRatingSlider({ field, value, emoji, title, presets, getColor, getText, isNegative, onChange }) {
    const color = getColor(value);
    return React.createElement('div', {
      className: 'cold-rating-card',
      style: {
        padding: '12px',
        borderRadius: '10px',
        background: isNegative
          ? (value <= 3 ? 'rgba(16, 185, 129, 0.08)' : value >= 7 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(59, 130, 246, 0.06)')
          : (value <= 3 ? 'rgba(239, 68, 68, 0.08)' : value >= 7 ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.06)'),
        marginBottom: '8px'
      }
    },
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '8px'
        }
      },
        // Emoji + заголовок
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          React.createElement('span', { style: { fontSize: '20px' } }, emoji),
          React.createElement('span', { style: { fontWeight: '600', fontSize: '13px' } }, title)
        ),
        // Значение + текст
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          React.createElement('span', {
            style: {
              fontWeight: '700',
              fontSize: '16px',
              color: color
            }
          }, value),
          React.createElement('span', {
            style: { fontSize: '12px', color: '#64748b' }
          }, getText(value))
        )
      ),
      // Пресеты
      React.createElement('div', {
        style: {
          display: 'flex',
          gap: '6px',
          marginBottom: '8px'
        }
      },
        presets.map(p => React.createElement('button', {
          key: p.value,
          onClick: () => onChange(p.value),
          style: {
            flex: 1,
            padding: '6px',
            borderRadius: '6px',
            border: value === p.value ? `2px solid ${color}` : '1px solid #e2e8f0',
            background: value === p.value ? `${color}15` : '#fff',
            cursor: 'pointer',
            fontSize: '14px',
            transition: 'all 0.15s'
          }
        }, p.emoji))
      ),
      // Слайдер
      React.createElement('input', Object.assign({
        type: 'range',
        min: 1,
        max: 10,
        value: value,
      }, getRangeGestureProps((nextValue) => onChange(nextValue)), {
        style: {
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          appearance: 'none',
          touchAction: 'none',
          background: `linear-gradient(to right, ${color} ${(value - 1) * 11.1}%, #e5e7eb ${(value - 1) * 11.1}%)`,
          cursor: 'pointer'
        }
      }))
    );
  }

  function ColdExposureStepComponent({ data, onChange }) {
    const selectedType = data.coldType || 'none';
    const time = data.coldTime || new Date().toTimeString().slice(0, 5);

    return React.createElement('div', { className: 'mc-cold-step' },
      // Кнопки выбора типа
      React.createElement('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '12px',
          marginBottom: '16px'
        }
      },
        COLD_TYPES.map(t => React.createElement('button', {
          key: t.id,
          onClick: () => onChange({ ...data, coldType: t.id, coldTime: t.id !== 'none' ? time : null }),
          style: {
            padding: '12px',
            borderRadius: '12px',
            border: selectedType === t.id ? '2px solid #3b82f6' : '2px solid #e2e8f0',
            background: selectedType === t.id ? 'rgba(59, 130, 246, 0.1)' : '#fff',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }
        },
          React.createElement('div', { style: { fontSize: '24px', marginBottom: '4px' } }, t.icon),
          React.createElement('div', { style: { fontWeight: '600', fontSize: '13px' } }, t.label),
          React.createElement('div', { style: { fontSize: '11px', color: '#64748b' } }, t.desc)
        ))
      ),
      // Время (если выбрано что-то кроме "нет")
      selectedType !== 'none' && React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          background: 'rgba(59, 130, 246, 0.05)',
          borderRadius: '8px',
          marginBottom: '16px'
        }
      },
        React.createElement('span', { style: { fontSize: '14px', color: '#64748b' } }, '⏰ Время:'),
        React.createElement('input', {
          type: 'time',
          value: time,
          onChange: (e) => onChange({ ...data, coldTime: e.target.value }),
          style: {
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid #e2e8f0',
            fontSize: '16px',
            fontWeight: '600'
          }
        })
      ),
      // Подсказка о пользе
      selectedType !== 'none' && React.createElement('div', {
        style: {
          padding: '10px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 197, 253, 0.15))',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#3b82f6'
        }
      },
        '💡 Холод активирует бурый жир и улучшает чувствительность к инсулину на 4-5 часов'
      )
    );
  }

  registerStep('cold_exposure', {
    title: 'Холодовое воздействие',
    hint: 'Был ли холодный душ?',
    canSkip: true,
    component: ColdExposureStepComponent,
    getInitialData: () => {
      const dateKey = getTodayKey();
      const dayData = readDayData(dateKey, {});
      const cold = dayData.coldExposure ?? {};  // null-safe: ?? вместо ||
      return {
        coldType: cold.type || 'none',
        coldTime: cold.time || new Date().toTimeString().slice(0, 5),
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || getTodayKey();
      const dayData = getFreshDayData(dateKey);
      dayData.date = dateKey;

      if (data.coldType && data.coldType !== 'none') {
        dayData.coldExposure = {
          type: data.coldType,
          time: data.coldTime,
          answeredAt: Date.now()
        };
      } else {
        dayData.coldExposure = {
          type: 'none',
          time: null,
          answeredAt: Date.now()
        };
      }

      dayData.updatedAt = Date.now();
      saveDayData(dateKey, dayData);

      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'coldExposure' }
      }));
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'coldExposure', source: 'cold-exposure-step' }
      }));
      return {
        affectedKeys: [`heys_dayv2_${dateKey}`],
        completed: true
      };
    },
    xpAction: 'cold_exposure_logged'
  });

  // ============================================================
  // MORNING MOOD STEP — 📊 Утреннее настроение (обязательный)
  // Дефолт = среднее за вчера
  // WOW-эффекты: staggered animation, пресеты, pulse, градиенты
  // ============================================================

  // Хелперы для оценок (как в тренировке)
  function getMoodEmoji(v) {
    if (v <= 2) return '😫';
    if (v <= 4) return '😕';
    if (v <= 6) return '😐';
    if (v <= 8) return '😊';
    return '🤩';
  }

  function getStressEmoji(v) {
    if (v <= 2) return '😌';
    if (v <= 4) return '🙂';
    if (v <= 6) return '😐';
    if (v <= 8) return '😟';
    return '😰';
  }

  function getWellbeingEmoji(v) {
    if (v <= 2) return '🤒';
    if (v <= 4) return '😓';
    if (v <= 6) return '😐';
    if (v <= 8) return '💪';
    return '🏆';
  }

  function getMoodColor(v) {
    return HEYS.scales.moodRating(v).color;
  }

  function getStressColor(v) {
    return HEYS.scales.stressRating(v).color;
  }

  // Пресеты быстрого выбора (5 вариантов)
  const MOOD_PRESETS = [
    { value: 2, emoji: '😫' },
    { value: 4, emoji: '😞' },
    { value: 6, emoji: '😐' },
    { value: 8, emoji: '😊' },
    { value: 10, emoji: '🔥' }
  ];

  const STRESS_PRESETS = [
    { value: 2, emoji: '😌' },
    { value: 4, emoji: '🙂' },
    { value: 6, emoji: '😐' },
    { value: 8, emoji: '😟' },
    { value: 10, emoji: '😰' }
  ];

  // Получение среднего за вчера
  function getYesterdayMoodAvg() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = yesterday.toISOString().slice(0, 10);
    // 🔧 FIX: Добавляем || {} на случай если lsGet вернёт null
    const dayData = lsGet(`heys_dayv2_${key}`, {}) || {};

    // Собираем все оценки настроения за день (из приёмов пищи + утреннее)
    const moodValues = [];
    const wellbeingValues = [];
    const stressValues = [];

    // Утреннее настроение
    if (dayData.moodMorning) moodValues.push(dayData.moodMorning);
    if (dayData.wellbeingMorning) wellbeingValues.push(dayData.wellbeingMorning);
    if (dayData.stressMorning) stressValues.push(dayData.stressMorning);

    // Из приёмов пищи
    if (dayData.meals && dayData.meals.length > 0) {
      dayData.meals.forEach(meal => {
        if (meal.mood) moodValues.push(meal.mood);
        if (meal.wellbeing) wellbeingValues.push(meal.wellbeing);
        if (meal.stress) stressValues.push(meal.stress);
      });
    }

    // Пост-оценка после утренней зарядки (если есть)
    const postState = normalizePostState(dayData?.morningActivation?.postState, null);
    if (postState) {
      moodValues.push(postState.mood);
      wellbeingValues.push(postState.wellbeing);
      stressValues.push(postState.stress);
    }

    const avg = arr => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 5;

    return {
      mood: avg(moodValues),
      wellbeing: avg(wellbeingValues),
      stress: avg(stressValues)
    };
  }

  // CSS для анимаций (добавляется один раз)
  if (typeof document !== 'undefined' && !document.getElementById('morning-mood-styles')) {
    const style = document.createElement('style');
    style.id = 'morning-mood-styles';
    style.textContent = `
      @keyframes moodPulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.08); }
      }
      @keyframes emojiPop {
        0% { transform: scale(0.9); }
        50% { transform: scale(1.15); }
        100% { transform: scale(1); }
      }
      .mood-value-pulse {
        animation: moodPulse 0.25s ease-out;
      }
      .mood-emoji-pop {
        animation: emojiPop 0.2s ease-out;
      }
      .mood-preset-btn {
        transition: background 0.1s, border-color 0.1s;
      }
      .mood-preset-btn:active {
        transform: scale(0.95);
      }
    `;
    document.head.appendChild(style);
  }

  function MorningMoodStepComponent({ data, onChange }) {
    const mood = data.mood ?? 5;
    const wellbeing = data.wellbeing ?? 5;
    const stress = data.stress ?? 5;

    const updateField = (field, value) => {
      onChange({ ...data, [field]: value });
    };

    return React.createElement('div', { className: 'mc-mood-step' },
      React.createElement('div', { className: 'mc-step-kicker' }, 'Как вы сегодня'),
      React.createElement('div', { className: 'mc-recorded-sub', style: { textAlign: 'center' } },
        'Три коротких шкалы — по ним куратор видит, чем объяснить день.'
      ),
      [
        { field: 'mood', value: mood, title: 'Настроение', kind: 'mood' },
        { field: 'wellbeing', value: wellbeing, title: 'Самочувствие', kind: 'mood' },
        { field: 'stress', value: stress, title: 'Стресс', kind: 'stress' }
      ].map((row) => React.createElement('div', { key: row.field, className: 'mc-scale-card' },
        React.createElement('div', { className: 'mc-scale-head' },
          React.createElement('span', null, row.title),
          React.createElement('span', { className: 'mc-scale-value' },
            React.createElement('b', { className: 'n', style: { font: '700 13px/1 Figtree, system-ui, sans-serif', color: 'var(--v4-sand-act-text, #8a4a20)' } }, String(row.value)),
            ` · ${scaleWord(row.value, row.kind)}`
          )
        ),
        React.createElement(DragValueSlider, {
          className: 'mc-v4-scale',
          variant: 'v4',
          fill: row.kind === 'stress' ? 'act' : 'olive',
          min: 1,
          max: 10,
          value: row.value,
          onValue: (nextValue) => updateField(row.field, nextValue),
          ariaLabel: buildScaleSliderAriaLabel(row.title, row.value)
        })
      )),
      React.createElement('div', { className: 'mc-recorded-hint' }, 'Шкалы 1–10. Подпись справа называет значение словом — число одно не читается.')
    );
  }

  registerStep('morning_mood', {
    title: 'Утреннее настроение',
    hint: 'Как себя чувствуешь?',
    canSkip: false, // Обязательный шаг!
    component: MorningMoodStepComponent,
    getInitialData: () => {
      const dateKey = getTodayKey();
      // 🔧 FIX: Добавляем || {} на случай если lsGet вернёт null (новый клиент)
      const dayData = readDayData(dateKey, {});

      // Если уже есть данные за сегодня — берём их
      if (hasPositiveStepNumber(dayData.moodMorning)) {
        return {
          mood: dayData.moodMorning,
          wellbeing: dayData.wellbeingMorning ?? 5,
          stress: dayData.stressMorning ?? 5,
          _dateKey: dateKey
        };
      }

      // Иначе берём среднее за вчера
      const yesterdayAvg = getYesterdayMoodAvg();
      return {
        mood: yesterdayAvg.mood,
        wellbeing: yesterdayAvg.wellbeing,
        stress: yesterdayAvg.stress,
        _dateKey: dateKey
      };
    },
    save: (data) => {
      const dateKey = data._dateKey || getTodayKey();
      const dayData = getFreshDayData(dateKey);

      dayData.date = dateKey;
      dayData.moodMorning = data.mood ?? 5;
      dayData.wellbeingMorning = data.wellbeing ?? 5;
      dayData.stressMorning = data.stress ?? 5;

      dayData.updatedAt = Date.now();
      dayData._curatorEdits = HEYS.models?.clearCuratorMarks?.(
        dayData, ['moodMorning', 'wellbeingMorning', 'stressMorning'], dayData.updatedAt);
      // Морнинг-чек-ин пишет напрямую в storage, минуя вкладку дня — без этого
      // moodAvg/wellbeingAvg/stressAvg/dayScore протухают до её открытия.
      HEYS.dayCalculations?.applyDayAverages?.(dayData);
      saveDayData(dateKey, dayData);

      window.dispatchEvent(new CustomEvent('heys:data-saved', {
        detail: { key: `day:${dateKey}`, type: 'morningMood' }
      }));
      // iOS PWA: keep the header "Next" tap path light. StepModal navigates
      // only after save() returns, while heys:day-updated wakes DayTab state
      // subscribers. Defer that heavier refresh until the slide transition has
      // already moved to the next step; the day data is saved synchronously above.
      const dayUpdatedDetail = {
        date: dateKey,
        field: 'morningMood',
        source: 'morning-mood-step',
        forceReload: true,
        data: mergeDayMealsPreferLiveIfRicher(dateKey, { ...dayData, date: dateKey })
      };
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: dayUpdatedDetail
        }));
      }, 260);
    },
    xpAction: 'morning_mood_logged'
  });

  // ============================================================
  // MORNING ROUTINE STEP — Завершающий мотивирующий шаг
  // Персонализированное приветствие по настроению
  // ============================================================

  function MorningRoutineStepComponent({ data, onChange, context }) {
    const dateKey = context?.dateKey || getTodayKey();
    const dayData = readDayData(dateKey, {});
    const morningMood = dayData.moodMorning ?? 5;
    const morningWellbeing = dayData.wellbeingMorning ?? 5;
    const morningStress = dayData.stressMorning ?? 5;
    const energyBucket = getEnergyBucket(morningMood, morningWellbeing, morningStress);
    const morningState = normalizeMorningActivationState(dateKey, dayData);
    const badgeMeta = getMorningActivationBadgeMeta(morningState);

    const copyVariant = useMemo(
      () => pickMorningActivationCopy(dateKey, morningState.copyId),
      [dateKey, morningState.copyId]
    );

    useEffect(() => {
      if (morningState.copyId === copyVariant.id) return;
      persistMorningActivationState(dateKey, {
        copyId: copyVariant.id
      }, 'morning-activation-copy');
    }, [copyVariant.id, dateKey, morningState.copyId]);

    const protocolText = energyBucket === 'high'
      ? copyVariant.protocol.high
      : energyBucket === 'mid'
        ? copyVariant.protocol.mid
        : copyVariant.protocol.low;

    const energyLabel = energyBucket === 'high'
      ? 'Высокий ресурс'
      : energyBucket === 'mid'
        ? 'Средний ресурс'
        : 'Бережный режим';

    const proceedNext = () => {
      onChange({
        ...data,
        selectedCopyId: copyVariant.id,
        status: morningState.status
      });
      context?.onNext?.();
    };

    return React.createElement('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        padding: '6px 0'
      }
    },
      React.createElement('div', {
        style: {
          borderRadius: '16px',
          padding: '14px 14px 12px',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(20,184,166,0.08))',
          border: '1px solid rgba(16,185,129,0.2)'
        }
      },
        React.createElement('div', {
          style: {
            fontSize: '13px',
            fontWeight: '700',
            color: '#047857',
            marginBottom: '8px',
            letterSpacing: '0.02em'
          }
        }, 'Финальный шаг: резинки + мини-растяжка'),
        React.createElement('div', {
          style: {
            fontSize: '18px',
            fontWeight: '700',
            color: 'var(--text, #0f172a)',
            marginBottom: '6px',
            lineHeight: '1.3'
          }
        }, copyVariant.opener),
        React.createElement('div', {
          style: {
            fontSize: '13px',
            lineHeight: '1.45',
            color: '#334155'
          }
        }, copyVariant.science)
      ),
      React.createElement('div', {
        style: {
          borderRadius: '14px',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          background: '#f8fafc',
          padding: '12px'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '8px'
          }
        },
          React.createElement('div', {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minWidth: 0
            }
          },
            React.createElement('span', { style: { fontSize: '22px' } }, '💪'),
            React.createElement('div', { style: { minWidth: 0 } },
              React.createElement('div', {
                style: {
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#0f172a'
                }
              }, 'Резинки + мини-растяжка утром'),
              React.createElement('div', {
                style: {
                  fontSize: '11px',
                  color: '#64748b',
                  marginTop: '2px'
                }
              }, 'Метрика фиксируется после первого приёма пищи')
            )
          ),
          React.createElement('span', {
            title: badgeMeta.title,
            style: {
              ...badgeMeta.style,
              fontSize: '10px',
              fontWeight: '700',
              borderRadius: '999px',
              padding: '4px 8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap'
            }
          }, badgeMeta.label)
        ),
        React.createElement('div', {
          style: {
            fontSize: '12px',
            color: '#334155',
            lineHeight: '1.45'
          }
        },
          `Режим на сегодня: ${energyLabel}. `,
          protocolText
        ),
        morningState.firstMealTime && React.createElement('div', {
          style: {
            marginTop: '8px',
            fontSize: '11px',
            color: '#64748b'
          }
        }, `Первый приём пищи: ${morningState.firstMealTime}`)
      ),
      React.createElement('button', {
        onClick: proceedNext,
        style: {
          width: '100%',
          textAlign: 'center',
          padding: '16px 18px',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          borderRadius: '14px',
          border: 'none',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '800',
          color: '#fff',
          letterSpacing: '0.02em'
        }
      }, 'Продолжить'),
      React.createElement('div', {
        style: {
          textAlign: 'center',
          fontSize: '11px',
          color: '#64748b'
        }
      }, 'После первого приёма пищи откроется подтверждение: done / missed + интенсивность.')
    );
  }

  function MorningActivationFollowupStepComponent({ context }) {
    const dateKey = context?.dateKey || getTodayKey();
    const dayData = readDayData(dateKey, {});
    const initialState = normalizeMorningActivationState(dateKey, dayData);
    const firstMealTimeValue = initialState.firstMealTime || getFirstMealTimeFromDay(dayData) || null;
    const firstMealTimeLabel = firstMealTimeValue || '—';
    const readMaDayForCalendar = useCallback((dk) => readDayData(dk, {}), []);
    const MorningActivationHabitCalendar = HEYS.morningActivationCalendar?.MorningActivationHabitCalendar;
    const terminalActionRef = useRef(false);

    const finishFollowup = (source) => {
      notifyMorningActivationFollowupCompleted(dateKey, source);
      context?.onNext?.();
    };

    const saveAnswer = (answer) => {
      if (terminalActionRef.current) return;
      terminalActionRef.current = true;
      const nextState = normalizeMorningActivationState(dateKey, getFreshDayData(dateKey));
      const patch = {
        firstMealTime: nextState.firstMealTime || firstMealTimeValue || null
      };
      if (answer === 'done') {
        applyMorningActivationCheckinAnswer(dateKey, 'done', 'morning-activation-followup');
        finishFollowup('morning-activation-done');
        return;
      }
      if (answer === 'planned') {
        applyMorningActivationCheckinAnswer(dateKey, 'planned', 'morning-activation-followup');
        finishFollowup('morning-activation-planned');
        return;
      }
      applyMorningActivationCheckinAnswer(dateKey, 'skipped', 'morning-activation-followup');
      finishFollowup('morning-activation-skipped');
    };

    // Кадр «Рутина · резервный вопрос после еды». Всё, кроме самого слоя и
    // его выезда, — содержимое листа: заметка на --gr-bg, календарь тем же
    // блоком, что в «Активе», и три ответа ОДНИМ РЯДОМ пилюль. Прежде здесь
    // стояли изумрудные литералы прежней системы и три кнопки стопкой на всю
    // ширину — обе ветки сняты строкой «резервный вопрос · снято».
    const answerPill = (label, kind, onClick) => React.createElement('button', {
      type: 'button',
      className: 'ma-followup-answer' + (kind === 'done' ? ' ma-followup-answer--done' : ''),
      onClick
    }, label);

    return React.createElement('div', { className: 'ma-followup-step' },
      React.createElement('div', { className: 'ma-followup-note' },
        React.createElement('div', { className: 'ma-followup-note-title' }, 'Утренняя рутина'),
        React.createElement('div', { className: 'ma-followup-note-text' },
          `Утром ответа не было. После первого приёма пищи (${firstMealTimeLabel}) отметьте статус.`)
      ),
      MorningActivationHabitCalendar
        ? React.createElement(MorningActivationHabitCalendar, {
          dateKey,
          readDayData: readMaDayForCalendar,
          headingTitle: 'Календарь привычки',
          layoutClass: 'ma-habit-cal--activity-v4 ma-habit-cal--sheet'
        })
        : null,
      React.createElement('div', { className: 'ma-followup-answers' },
        answerPill('Сделал', 'done', () => saveAnswer('done')),
        answerPill('Сделаю', 'plain', () => saveAnswer('planned')),
        answerPill('Не сегодня', 'plain', () => saveAnswer('skipped'))
      )
    );
  }

  function getFirstHalfTrainingTime(firstMealTime) {
    const parsed = parseTimeToMinutes(firstMealTime);
    if (Number.isFinite(parsed) && parsed < 12 * 60) return firstMealTime;
    return '11:00';
  }

  function saveFirstHalfTrainingInsteadOfActivation(dateKey, firstMealTimeValue) {
    try {
      if (HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        HEYS.Day.requestFlush({ force: true });
      }
    } catch (_) {
      // ignore
    }
    let dayData = getFreshDayData(dateKey);
    dayData = mergeDayMealsPreferLiveIfRicher(dateKey, dayData);
    removeMorningActivationArtifacts(dayData);
    const mutationTs = Math.max(Date.now(), getLatestDayUpdatedAt(dateKey) + 1);

    const trainingEntry = {
      z: [0, 45, 0, 0],
      time: getFirstHalfTrainingTime(firstMealTimeValue),
      type: 'strength',
      activityLabel: 'Тренировка в первой половине дня',
      source: 'morning_activation_replacement',
      comment: 'Вместо утренней зарядки',
      updatedAt: mutationTs
    };
    const trainings = Array.isArray(dayData.trainings) ? dayData.trainings.slice() : [];
    const emptyIndex = trainings.findIndex((training) => {
      const totalMinutes = Array.isArray(training?.z)
        ? training.z.reduce((sum, item) => sum + (Number(item) || 0), 0)
        : 0;
      return totalMinutes === 0 && !training?.type && !training?.activityLabel;
    });
    if (emptyIndex >= 0) {
      trainings[emptyIndex] = trainingEntry;
    } else {
      trainings.push(trainingEntry);
    }
    dayData.trainings = trainings;

    const nextState = normalizeMorningActivationState(dateKey, dayData);
    dayData.morningActivation = {
      ...(dayData.morningActivation || {}),
      ...nextState,
      status: 'done',
      intensity: null,
      postState: null,
      postEffect: null,
      firstMealTime: nextState.firstMealTime || firstMealTimeValue || null,
      decidedAt: Date.now(),
      followupSnoozeUntilMealCount: null,
      replacement: 'first_half_training'
    };
    dayData.updatedAt = mutationTs;
    saveDayData(dateKey, dayData);
    notifyMorningActivationFollowupCompleted(dateKey, 'morning-activation-replacement');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: {
          date: dateKey,
          field: 'morningActivation',
          source: 'morning-activation-first-half-training',
          forceReload: true,
          data: { ...dayData, date: dateKey }
        }
      }));
    }
    return dayData;
  }

  // ============================================================
  // SUPPLEMENTS STEP — 💊 Витамины на сегодня
  // Все категории видны для discovery, выбранные — с оранжевой рамкой
  // ============================================================

  function SupplementsStepComponent({ data, onChange }) {
    const Supps = HEYS.Supplements;
    if (!Supps) {
      return React.createElement('div', {
        style: { padding: '20px', textAlign: 'center', color: '#64748b' }
      }, '⏳ Загрузка витаминов...');
    }

    const byCategory = useMemo(() => Supps.getByCategory(), []);
    const selected = data.selected || [];

    const toggle = (id) => {
      const newSelected = selected.includes(id)
        ? selected.filter(s => s !== id)
        : [...selected, id];
      onChange({ ...data, selected: newSelected });
    };

    return React.createElement('div', {
      className: 'mc-supplements-step',
      style: {
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '60vh'
      }
    },
      // Скроллящийся список категорий
      React.createElement('div', {
        style: {
          flex: 1,
          overflowY: 'auto',
          paddingRight: '4px'
        }
      },
        // Категории
        Object.entries(byCategory).map(([catId, supps]) => {
          const cat = Supps.CATEGORIES[catId];
          return React.createElement('div', {
            key: catId,
            style: { marginBottom: '16px' }
          },
            // Заголовок категории
            React.createElement('div', {
              style: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#64748b',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }
            },
              React.createElement('span', null, cat.icon),
              React.createElement('span', null, cat.name)
            ),
            // Чипы витаминов
            React.createElement('div', {
              style: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px'
              }
            },
              supps.map(supp => {
                const isSelected = selected.includes(supp.id);
                return React.createElement('button', {
                  key: supp.id,
                  onClick: () => toggle(supp.id),
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 12px',
                    borderRadius: '20px',
                    border: isSelected ? '2px solid #f97316' : '2px solid #e2e8f0',
                    background: isSelected ? 'rgba(249, 115, 22, 0.1)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: isSelected ? '600' : '500',
                    color: isSelected ? '#ea580c' : '#374151',
                    transition: 'all 0.2s'
                  }
                },
                  React.createElement('span', null, supp.icon),
                  React.createElement('span', null, supp.name)
                );
              })
            )
          );
        })
      ),
      // Счётчик внизу — ВНЕ скролла!
      React.createElement('div', {
        style: {
          marginTop: '12px',
          padding: '12px',
          background: selected.length > 0 ? '#fff7ed' : '#f8fafc',
          borderRadius: '12px',
          textAlign: 'center',
          fontSize: '14px',
          fontWeight: '600',
          color: selected.length > 0 ? '#ea580c' : '#64748b',
          flexShrink: 0
        }
      },
        selected.length > 0
          ? `💊 Выбрано: ${selected.length}`
          : '💊 Выберите добавки на сегодня'
      )
    );
  }

  registerStep('supplements', {
    title: 'Добавки',
    hint: 'Что планируете принять?',
    canSkip: true,
    component: SupplementsStepComponent,
    getInitialData: () => {
      // Берём из профиля (запомненный выбор с прошлого дня)
      const planned = HEYS.Supplements?.getPlanned() || [];
      return { selected: planned };
    },
    save: (data, context) => {
      const profile = lsGet('heys_profile', {}) || {};
      const hf = HEYS.healthFeatures;
      const supplementsEnabled = hf && typeof hf.isSupplementsTrackingEnabled === 'function'
        ? hf.isSupplementsTrackingEnabled(profile)
        : profile.supplementsTrackingEnabled === true;
      if (!supplementsEnabled) {
        return {
          skipped: true,
          reason: 'supplements_tracking_disabled',
          affectedKeys: []
        };
      }

      // Используем dateKey из контекста (для редактирования прошлых дней) или сегодня
      const dateKey = context?.dateKey || getTodayKey();
      const selected = Array.isArray(data?.selected) ? data.selected : [];

      if (HEYS.Supplements && HEYS.Supplements.savePlanned) {
        return HEYS.Supplements.savePlanned(selected, {
          dateKey,
          source: 'supplements-step-save'
        });
      }

      const dayData = getFreshDayData(dateKey);
      const mutationAt = Math.max(Date.now(), (Number(dayData.supplementsPlannedUpdatedAt) || 0) + 1);
      dayData.date = dateKey;
      dayData.supplementsPlanned = selected;
      dayData.supplementsPlannedUpdatedAt = mutationAt;
      dayData.updatedAt = mutationAt;
      saveDayData(dateKey, dayData);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('heys:day-updated', {
          detail: {
            date: dateKey,
            field: 'supplementsPlanned',
            forceReload: true,
            source: 'supplements-step-save-fallback'
          }
        }));
      }
      return {
        affectedKeys: [`heys_dayv2_${dateKey}`],
        completed: true
      };
    },
    xpAction: 'supplements_planned'
  });

  function MorningActivationSkipReasonStepComponent({ context }) {
    const dateKey = context?.dateKey || getTodayKey();
    const pickedRef = useRef(false);
    const pick = (id) => {
      if (pickedRef.current) return;
      pickedRef.current = true;
      const savedDay = persistMorningActivationState(dateKey, {
        skipReasonId: id,
        skipReasonPending: false,
        skipReasonCapturedAt: Date.now()
      }, 'morning-activation-skip-reason');
      markMorningActivationSkipReasonAnswered(dateKey);
      const flowId = traceMorningActivation('skip_reason_picked', {
        dateKey,
        reasonId: id,
        status: savedDay?.morningActivation?.status || null,
        skipReasonPending: savedDay?.morningActivation?.skipReasonPending === true
      });
      verifyMorningActivationSkipReasonWrite(dateKey, savedDay, flowId);
      try {
        window.dispatchEvent(new CustomEvent('heys:morning-activation-skip-reason-picked', {
          detail: { dateKey, reasonId: id, terminal: true }
        }));
      } catch (_) {
        // ignore
      }
      const nextResult = context?.onNext?.();
      if (nextResult && typeof nextResult.catch === 'function') {
        nextResult.catch(() => {
          pickedRef.current = false;
        });
      }
      setTimeout(() => {
        try {
          const modalStillOpen = document.getElementById('heys-step-modal-root')
            || document.getElementById('heys-morning-activation-modal-root');
          if (modalStillOpen && typeof context?.onClose === 'function') context.onClose();
        } catch (_) {
          // ignore fallback close errors
        }
      }, 250);
    };
    // Кадр «Рутина · причина пропуска»: заголовок 16/700, под ним через 4
    // подпись, пять строк-ответов через 12 зазором 7. Прежде экран был на
    // прежней системе — инлайновые тона и обводка, кегль 13/12/14 — и на «ты»,
    // хотя лист говорит человеку «вы».
    return React.createElement('div', { className: 'ma-skip-reason-stack' },
      React.createElement('div', { className: 'ma-skip-reason-options' },
        MORNING_ACTIVATION_SKIP_REASONS.map((opt) => React.createElement('button', {
          key: opt.id,
          type: 'button',
          className: 'ma-skip-reason-option',
          onClick: () => pick(opt.id)
        }, opt.label))
      )
    );
  }

  registerStep('morningRoutine', {
    title: 'Утренний фокус',
    hint: 'Резинки + мини-растяжка',
    canSkip: true,
    hideHeaderNext: true,
    component: MorningRoutineStepComponent,
    getInitialData: () => ({
      selectedCopyId: null
    }),
    save: (data, context) => {
      const dateKey = context?.dateKey || getTodayKey();
      if (data?.selectedCopyId) {
        persistMorningActivationState(dateKey, { copyId: data.selectedCopyId }, 'morning-routine-save');
      }
      return {
        completed: true,
        affectedKeys: data?.selectedCopyId ? [`heys_dayv2_${dateKey}`] : []
      };
    },
    xpAction: 'morning_routine_completed'
  });

  registerStep('morning_activation_followup', {
    title: 'Зарядка после 1-го приёма',
    hint: 'Статус привычки',
    canSkip: true,
    hideHeaderNext: true,
    component: MorningActivationFollowupStepComponent,
    getInitialData: (context) => {
      const dateKey = context?.dateKey || getTodayKey();
      return normalizeMorningActivationState(dateKey, readDayData(dateKey, {}));
    },
    save: () => { },
    xpAction: 'morning_routine_completed'
  });

  registerStep('morning_activation_skip_reason', {
    // Решение владельца 3 сентября: слой остаётся диалогом по центру, поэтому
    // выход несёт крестик шапки, а не ручка. Заголовок и подпись листа подняты
    // в шапку — иначе они шли вторым заголовком под заголовком шага, и на
    // экране стояло два заголовка об одном. Текст взят у кадра «Рутина ·
    // причина пропуска»: он точнее прежнего «Зарядка».
    title: 'Почему сегодня без зарядки?',
    hint: 'Ответ видите только вы — он нужен для картины дня.',
    canSkip: true,
    hideHeaderNext: true,
    component: MorningActivationSkipReasonStepComponent,
    getInitialData: () => ({}),
    save: () => { }
  });

  function scaleWord(value, kind) {
    const n = Number(value);
    if (kind === 'stress') {
      if (n <= 2) return 'нет';
      if (n <= 4) return 'немного';
      if (n <= 6) return 'средне';
      if (n <= 8) return 'сильно';
      return 'очень сильно';
    }
    if (n <= 2) return 'очень низко';
    if (n <= 4) return 'так себе';
    if (n <= 6) return 'нормально';
    if (n <= 8) return 'выше обычного';
    return 'очень высоко';
  }

  function getColdExposureStreak(dateKey = getTodayKey()) {
    let streak = 0;
    const anchor = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(anchor.getTime())) return 0;
    const toKey = (d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    for (let i = 1; i <= 60; i += 1) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const day = readDayData(toKey(d), {}) || {};
      const type = day?.coldExposure?.type;
      if (type && type !== 'none') streak += 1;
      else break;
    }
    return streak;
  }

  function formatColdStreakLabel(streak) {
    const n = Number(streak) || 0;
    if (n <= 0) return null;
    const mod10 = n % 10;
    const mod100 = n % 100;
    let word = 'дней';
    if (mod10 === 1 && mod100 !== 11) word = 'день';
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'дня';
    return `${n} ${word} подряд`;
  }

  function isMorningRestSupplementsFeatureOn() {
    const profile = lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    if (hf && typeof hf.isSupplementsFeatureAvailable === 'function') {
      return hf.isSupplementsFeatureAvailable(profile) !== false;
    }
    return true;
  }

  function isMorningRestSupplementsEnabled() {
    const profile = lsGet('heys_profile', {}) || {};
    const hf = HEYS.healthFeatures;
    if (hf && typeof hf.isSupplementsTrackingEnabled === 'function') {
      return hf.isSupplementsTrackingEnabled(profile);
    }
    return profile.supplementsTrackingEnabled === true;
  }

  const MORNING_REST_SUPP_TIMING_OPTIONS = [
    { id: 'morning', label: 'Утром' },
    { id: 'anytime', label: 'Днём' },
    { id: 'evening', label: 'Вечером' },
    { id: 'withFood', label: 'С едой' }
  ];

  const MORNING_REST_SUPP_COURSE_NAMES = {
    vitD: 'Витамин D3',
    magnesium: 'Магний глицинат',
    omega3: 'Омега-3'
  };

  const MORNING_REST_SUPP_CARD_NAMES = {
    vitD: 'Витамин D',
    vitC: 'Витамин C',
    magnesium: 'Магний',
    omega3: 'Омега-3',
    zinc: 'Цинк',
    selenium: 'Селен',
    b12: 'B12',
    b6: 'B6',
    iodine: 'Йод',
    k2: 'K2',
    calcium: 'Кальций',
    lecithin: 'Лецитин',
    creatine: 'Креатин',
    bcaa: 'BCAA',
    protein: 'Протеин',
    melatonin: 'Мелатонин',
    glycine: 'Глицин',
    ltheanine: 'L-теанин',
    collagen: 'Коллаген'
  };

  const MORNING_REST_SUPP_DOSE_DEFAULTS = {
    vitD: { dose: 5000, unit: 'МЕ', step: 500, hint: 'Шаг 500 МЕ. Обычная дозировка — от 1 000 до 5 000.' },
    magnesium: { dose: 400, unit: 'мг', step: 50, hint: 'Шаг 50 мг. Обычная дозировка — от 200 до 400.' },
    omega3: { dose: 1000, unit: 'мг', step: 100, hint: 'Шаг 100 мг. Смотрите содержание EPA+DHA на упаковке.' },
    iodine: { dose: 150, unit: 'мкг', step: 25, hint: 'Шаг 25 мкг. Обычная суточная норма — около 150 мкг.' }
  };

  const MORNING_REST_SUPP_ADD_GROUPS = [
    { label: 'Витамины и микроэлементы', ids: ['vitD', 'vitC', 'zinc', 'selenium', 'b12', 'b6', 'iodine'] },
    { label: 'Минералы и жиры', ids: ['magnesium', 'omega3', 'calcium', 'k2', 'lecithin'] },
    { label: 'Сон и восстановление', ids: ['melatonin', 'glycine', 'ltheanine', 'collagen'] },
    { label: 'Спортивное питание', ids: ['creatine', 'bcaa', 'protein'] }
  ];

  function formatMorningRestSuppTiming(timing) {
    const map = {
      morning: 'утром',
      evening: 'вечером',
      beforeBed: 'перед сном',
      withFood: 'с едой',
      withFat: 'с жирной едой',
      empty: 'натощак',
      beforeMeal: 'до еды',
      afterTrain: 'после трени',
      anytime: 'днём'
    };
    return map[timing] || '';
  }

  function formatSuppDoseNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return String(value ?? '');
    return String(Math.round(num)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function getMorningRestSuppCardName(id) {
    if (MORNING_REST_SUPP_CARD_NAMES[id]) return MORNING_REST_SUPP_CARD_NAMES[id];
    return HEYS.Supplements?.CATALOG?.[id]?.name || id;
  }

  function getMorningRestSuppCourseName(id) {
    if (MORNING_REST_SUPP_COURSE_NAMES[id]) return MORNING_REST_SUPP_COURSE_NAMES[id];
    return getMorningRestSuppCardName(id);
  }

  function getMorningRestSuppDoseDefaults(id) {
    if (MORNING_REST_SUPP_DOSE_DEFAULTS[id]) return { ...MORNING_REST_SUPP_DOSE_DEFAULTS[id] };
    const unitById = {
      vitD: 'МЕ',
      k2: 'мкг',
      folic: 'мкг',
      b12: 'мкг',
      b6: 'мг',
      biotin: 'мкг',
      selenium: 'мкг',
      iodine: 'мкг',
      omega3: 'мг',
      fishOil: 'г',
      creatine: 'г',
      bcaa: 'г',
      protein: 'г'
    };
    const unit = unitById[id] || 'мг';
    return { dose: 100, unit, step: 10, hint: 'Дозу можно изменить в курсе в любой день.' };
  }

  function initMorningRestSuppDoseDraft(id) {
    const Supps = HEYS.Supplements;
    const setting = Supps?.getSupplementSetting?.(id) || {};
    const defaults = getMorningRestSuppDoseDefaults(id);
    const catalog = Supps?.CATALOG?.[id] || {};
    const timing = setting?.timing || catalog.timing || 'morning';
    const normalizedTiming = MORNING_REST_SUPP_TIMING_OPTIONS.some((row) => row.id === timing)
      ? timing
      : 'morning';
    return {
      dose: setting?.dose != null ? Number(setting.dose) : defaults.dose,
      unit: setting?.unit || defaults.unit,
      timing: normalizedTiming
    };
  }

  function formatMorningRestSuppCourseLine(id) {
    const Supps = HEYS.Supplements;
    const setting = Supps?.getSupplementSetting?.(id) || {};
    const defaults = getMorningRestSuppDoseDefaults(id);
    const dose = setting?.dose != null ? setting.dose : defaults.dose;
    const unit = setting?.unit || defaults.unit;
    const timing = formatMorningRestSuppTiming(setting?.timing || Supps?.CATALOG?.[id]?.timing);
    const doseLabel = `${formatSuppDoseNumber(dose)} ${unit}`;
    return { name: getMorningRestSuppCourseName(id), meta: timing ? `${doseLabel} · ${timing}` : doseLabel };
  }

  function formatMorningRestSupplementRow(id) {
    const Supps = HEYS.Supplements;
    const setting = Supps?.getSupplementSetting?.(id) || {};
    const defaults = getMorningRestSuppDoseDefaults(id);
    const name = getMorningRestSuppCardName(id);
    const dose = setting?.dose != null ? setting.dose : defaults.dose;
    const unit = setting?.unit || defaults.unit;
    const title = dose ? `${name} · ${formatSuppDoseNumber(dose)} ${unit}` : name;
    const timing = formatMorningRestSuppTiming(setting?.timing || Supps?.CATALOG?.[id]?.timing);
    return { title, timing };
  }

  function persistMorningRestSuppPlanned(selected, dateKey) {
    if (HEYS.Supplements?.savePlanned) {
      HEYS.Supplements.savePlanned(selected, {
        dateKey,
        source: 'morning-rest-supplements',
        syncDay: false
      });
    }
  }

  function getMorningRestSuppAddCatalog(searchQuery) {
    const catalog = HEYS.Supplements?.CATALOG || {};
    const query = String(searchQuery || '').trim().toLowerCase();
    return MORNING_REST_SUPP_ADD_GROUPS.map((group) => {
      const items = [];
      group.ids.forEach((id) => {
        const supp = catalog[id];
        if (!supp) return;
        const label = supp.name || id;
        if (query && !label.toLowerCase().includes(query) && !id.toLowerCase().includes(query)) return;
        items.push({ id, ...supp });
      });
      return items.length ? { label: group.label, items } : null;
    }).filter(Boolean);
  }

  function countMorningRestSuppSelectedWord(count) {
    const n = Number(count) || 0;
    if (n === 1) return 'один';
    if (n === 2) return 'два';
    if (n === 3) return 'три';
    if (n === 4) return 'четыре';
    return String(n);
  }

  function renderMorningRestSuppCheckIcon() {
    return React.createElement('svg', {
      width: 12,
      height: 12,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 3.4,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true'
    }, React.createElement('path', { d: 'M5 13l4 4L19 7' }));
  }

  function renderMorningRestSuppChevron() {
    return React.createElement('span', { className: 'mc-supp-flow-chevron', 'aria-hidden': 'true' },
      React.createElement('svg', {
        width: 15,
        height: 15,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.75,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }, React.createElement('path', { d: 'M9 6l6 6-6 6' }))
    );
  }

  function renderMorningRestSuppFlowFoot(modifier, ...children) {
    const mod = modifier ? ` mc-supp-flow-foot--${modifier}` : '';
    return React.createElement('div', { className: 'mc-supp-flow-foot' + mod }, ...children);
  }

  function renderMorningRestSuppLayer(layerClass, footModifier, bodyChildren, ...footChildren) {
    const body = Array.isArray(bodyChildren) ? bodyChildren : [bodyChildren];
    return React.createElement('div', {
      className: 'mc-rest-step mc-rest-step--layer mc-supp-flow ' + layerClass
    },
      React.createElement('div', { className: 'mc-supp-flow-body' }, ...body),
      renderMorningRestSuppFlowFoot(footModifier, ...footChildren)
    );
  }

  function MorningRestSupplementsFlow({ data, onChange, planned, dateKey }) {
    const Supps = HEYS.Supplements;
    const layer = data.supplementsLayer || (planned.length > 0 ? 'course' : 'empty');
    const addDraft = Array.isArray(data.supplementsAddDraft) ? data.supplementsAddDraft : [...planned];
    const plannedAtOpen = Array.isArray(data.supplementsPlannedAtOpen) ? data.supplementsPlannedAtOpen : [...planned];
    const [searchQuery, setSearchQuery] = React.useState('');
    const doseDraft = data.supplementsDoseDraft || {};
    const doseId = data.supplementsDoseId || null;
    const closeSupplements = () => onChange({
      ...data,
      supplementsOpen: false,
      supplementsLayer: null,
      supplementsAddDraft: null,
      supplementsPlannedAtOpen: null,
      supplementsDoseId: null,
      supplementsDoseQueue: null,
      supplementsDoseDraft: null
    });
    const setLayer = (patch) => onChange({ ...data, ...patch });
    const openAddLayer = () => setLayer({
      supplementsLayer: 'add',
      supplementsAddDraft: [...planned],
      supplementsPlannedAtOpen: [...planned]
    });
    const openDoseLayer = (suppId, queue) => setLayer({
      supplementsLayer: 'dose',
      supplementsDoseId: suppId,
      supplementsDoseQueue: queue || [],
      supplementsDoseDraft: initMorningRestSuppDoseDraft(suppId)
    });
    const commitDoseAndAdvance = () => {
      if (!doseId || !Supps) return;
      Supps.setSupplementSetting?.(doseId, {
        dose: doseDraft.dose,
        unit: doseDraft.unit,
        timing: doseDraft.timing
      });
      const nextPlanned = planned.includes(doseId) ? planned : [...planned, doseId];
      persistMorningRestSuppPlanned(nextPlanned, dateKey);
      const queue = Array.isArray(data.supplementsDoseQueue) ? [...data.supplementsDoseQueue] : [];
      const nextId = queue.shift();
      if (nextId) {
        onChange({
          ...data,
          selected: nextPlanned,
          supplementsDoseId: nextId,
          supplementsDoseQueue: queue,
          supplementsDoseDraft: initMorningRestSuppDoseDraft(nextId)
        });
        return;
      }
      onChange({
        ...data,
        selected: nextPlanned,
        supplementsLayer: nextPlanned.length > 0 ? 'course' : 'empty',
        supplementsAddDraft: nextPlanned,
        supplementsPlannedAtOpen: nextPlanned,
        supplementsDoseId: null,
        supplementsDoseQueue: null,
        supplementsDoseDraft: null
      });
    };
    const startDoseQueueFromAdd = () => {
      const queue = addDraft.filter((id) => !plannedAtOpen.includes(id));
      if (!queue.length) {
        persistMorningRestSuppPlanned(addDraft, dateKey);
        onChange({
          ...data,
          selected: addDraft,
          supplementsLayer: addDraft.length > 0 ? 'course' : 'empty',
          supplementsAddDraft: addDraft,
          supplementsPlannedAtOpen: addDraft
        });
        return;
      }
      openDoseLayer(queue[0], queue.slice(1));
    };
    const toggleAddDraft = (id) => {
      const nextDraft = addDraft.includes(id)
        ? addDraft.filter((row) => row !== id)
        : [...addDraft, id];
      onChange({ ...data, supplementsAddDraft: nextDraft });
    };
    const removeFromCourse = (id) => {
      const nextPlanned = planned.filter((row) => row !== id);
      const nextDraft = (Array.isArray(data.supplementsAddDraft) ? data.supplementsAddDraft : planned)
        .filter((row) => row !== id);
      persistMorningRestSuppPlanned(nextPlanned, dateKey);
      const nextLayer = layer === 'add'
        ? 'add'
        : (nextPlanned.length > 0 ? 'course' : 'empty');
      onChange({
        ...data,
        selected: nextPlanned,
        supplementsAddDraft: nextDraft,
        supplementsPlannedAtOpen: nextPlanned,
        supplementsLayer: nextLayer,
        supplementsDoseId: null,
        supplementsDoseQueue: null,
        supplementsDoseDraft: null
      });
    };

    if (layer === 'empty') {
      return renderMorningRestSuppLayer(
        'mc-supp-flow--empty',
        'stack',
        [
          React.createElement('div', { className: 'mc-supp-flow-empty-card' },
            React.createElement('span', { className: 'mc-supp-flow-empty-icon', 'aria-hidden': 'true' },
              React.createElement('svg', {
                width: 21,
                height: 21,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2.4,
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              },
                React.createElement('path', { d: 'M10.5 20.5a4.95 4.95 0 01-7-7l7-7a4.95 4.95 0 017 7z' }),
                React.createElement('path', { d: 'M8.5 8.5l7 7' })
              )
            ),
            React.createElement('div', { className: 'mc-supp-flow-empty-title' }, 'Курс пока пуст'),
            React.createElement('div', { className: 'mc-supp-flow-empty-body' },
              'Добавки — витамины, минералы, омега. Добавьте курс, чтобы видеть его каждое утро.'
            )
          ),
          React.createElement('div', { className: 'mc-supp-flow-note' },
            'Это список на день, а не отметка «выпил»: факт приёма отмечается в дневнике.'
          )
        ],
        React.createElement('button', {
          type: 'button',
          className: 'mc-supp-flow-btn mc-supp-flow-btn--primary',
          onClick: openAddLayer
        }, 'Добавить в курс'),
        React.createElement('button', {
          type: 'button',
          className: 'mc-supp-flow-later',
          onClick: closeSupplements
        }, 'Позже')
      );
    }

    if (layer === 'course') {
      return renderMorningRestSuppLayer(
        'mc-supp-flow--course',
        null,
        [
          React.createElement('div', { className: 'mc-supp-flow-lead' },
            'Курс на день. Утром вы его просто видите — факт приёма отмечается в дневнике.'
          ),
          React.createElement('div', { className: 'mc-supp-flow-course-list' },
            planned.map((id) => {
              const row = formatMorningRestSuppCourseLine(id);
              return React.createElement('button', {
                key: id,
                type: 'button',
                className: 'mc-supp-flow-course-row',
                onClick: () => openDoseLayer(id, [])
              },
                React.createElement('div', { className: 'mc-supp-flow-course-copy' },
                  React.createElement('b', null, row.name),
                  React.createElement('span', null, row.meta)
                ),
                renderMorningRestSuppChevron()
              );
            })
          ),
          React.createElement('button', {
            type: 'button',
            className: 'mc-supp-flow-add-row',
            onClick: openAddLayer
          },
            React.createElement('span', { className: 'mc-supp-flow-add-icon', 'aria-hidden': 'true' },
              React.createElement('svg', {
                width: 13,
                height: 13,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 3,
                strokeLinecap: 'round'
              }, React.createElement('path', { d: 'M12 6v12M6 12h12' }))
            ),
            React.createElement('span', null, 'Добавить в курс')
          ),
          React.createElement('div', { className: 'mc-supp-flow-note mc-supp-flow-note--left' },
            'Курс живёт до отмены: пункт убирается тем же экраном, где добавляется. Куратор видит состав, но не меняет его без вас.'
          )
        ],
        React.createElement('button', {
          type: 'button',
          className: 'mc-supp-flow-btn mc-supp-flow-btn--primary',
          onClick: closeSupplements
        }, 'Готово')
      );
    }

    if (layer === 'add') {
      const groups = getMorningRestSuppAddCatalog(searchQuery);
      const selectedCount = addDraft.length;
      return renderMorningRestSuppLayer(
        'mc-supp-flow--add',
        'add',
        [
          React.createElement('div', { className: 'mc-supp-flow-search' },
            React.createElement('svg', {
              width: 15,
              height: 15,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2.6,
              strokeLinecap: 'round',
              'aria-hidden': 'true'
            },
              React.createElement('circle', { cx: 11, cy: 11, r: 7 }),
              React.createElement('path', { d: 'M20 20l-4.2-4.2' })
            ),
            React.createElement('input', {
              type: 'search',
              className: 'mc-supp-flow-search-input',
              placeholder: 'Поиск по названию',
              value: searchQuery,
              onChange: (event) => setSearchQuery(event.target.value),
              'aria-label': 'Поиск по названию'
            })
          ),
          React.createElement('div', { className: 'mc-supp-flow-groups' },
            groups.map((group) => React.createElement('div', { key: group.label, className: 'mc-supp-flow-group' },
              React.createElement('div', { className: 'mc-supp-flow-tier' }, group.label),
              React.createElement('div', { className: 'mc-supp-flow-chips' },
                group.items.map((item) => {
                  const isOn = addDraft.includes(item.id);
                  return React.createElement('button', {
                    key: item.id,
                    type: 'button',
                    className: 'mc-supp-flow-chip' + (isOn ? ' is-on' : ''),
                    onClick: () => {
                      if (isOn && planned.includes(item.id)) {
                        removeFromCourse(item.id);
                        return;
                      }
                      toggleAddDraft(item.id);
                    }
                  },
                    isOn && renderMorningRestSuppCheckIcon(),
                    React.createElement('span', null, item.name)
                  );
                })
              )
            ))
          )
        ],
        selectedCount > 0
          ? React.createElement('span', { className: 'mc-supp-flow-selected-count' },
            'Выбрано',
            React.createElement('br'),
            countMorningRestSuppSelectedWord(selectedCount)
          )
          : React.createElement('span', { className: 'mc-supp-flow-selected-count' }, 'Ничего не выбрано'),
        React.createElement('button', {
          type: 'button',
          className: 'mc-supp-flow-btn mc-supp-flow-btn--primary mc-supp-flow-btn--grow',
          disabled: selectedCount === 0,
          onClick: startDoseQueueFromAdd
        }, 'Дозы и время')
      );
    }

    if (layer === 'dose' && doseId) {
      const defaults = getMorningRestSuppDoseDefaults(doseId);
      const step = defaults.step || 10;
      const minDose = step;
      const currentDose = Number(doseDraft.dose);
      const safeDose = Number.isFinite(currentDose) ? currentDose : defaults.dose;
      const decDose = () => onChange({
        ...data,
        supplementsDoseDraft: {
          ...doseDraft,
          dose: Math.max(minDose, safeDose - step)
        }
      });
      const incDose = () => onChange({
        ...data,
        supplementsDoseDraft: {
          ...doseDraft,
          dose: safeDose + step
        }
      });
      const alreadyInCourse = planned.includes(doseId);
      return renderMorningRestSuppLayer(
        'mc-supp-flow--dose',
        null,
        [
          React.createElement('div', { className: 'mc-supp-flow-dose-kicker' }, 'Доза на день'),
          React.createElement('div', { className: 'mc-supp-flow-dose-stepper' },
            React.createElement('button', {
              type: 'button',
              className: 'mc-supp-flow-dose-btn',
              onClick: decDose,
              'aria-label': 'Уменьшить дозу'
            },
              React.createElement('svg', {
                width: 16,
                height: 16,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 3,
                strokeLinecap: 'round'
              }, React.createElement('path', { d: 'M6 12h12' }))
            ),
            React.createElement('div', { className: 'mc-supp-flow-dose-value' },
              React.createElement('span', { className: 'mc-supp-flow-dose-num' }, formatSuppDoseNumber(safeDose)),
              React.createElement('span', { className: 'mc-supp-flow-dose-unit' }, doseDraft.unit || defaults.unit)
            ),
            React.createElement('button', {
              type: 'button',
              className: 'mc-supp-flow-dose-btn',
              onClick: incDose,
              'aria-label': 'Увеличить дозу'
            },
              React.createElement('svg', {
                width: 16,
                height: 16,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 3,
                strokeLinecap: 'round'
              },
                React.createElement('path', { d: 'M12 6v12M6 12h12' })
              )
            )
          ),
          React.createElement('div', { className: 'mc-supp-flow-dose-hint' }, defaults.hint),
          React.createElement('div', { className: 'mc-supp-flow-timing-label' }, 'Когда принимать'),
          React.createElement('div', { className: 'mc-supp-flow-timing-row' },
            MORNING_REST_SUPP_TIMING_OPTIONS.map((row) => React.createElement('button', {
              key: row.id,
              type: 'button',
              className: 'mc-pill mc-pill--mini mc-pill--choice' + (doseDraft.timing === row.id ? ' is-on' : ''),
              onClick: () => onChange({
                ...data,
                supplementsDoseDraft: { ...doseDraft, timing: row.id }
              })
            }, row.label))
          ),
          React.createElement('div', { className: 'mc-supp-flow-note mc-supp-flow-note--left' },
            'Время — подсказка для утреннего списка, а не напоминание. Дозу и время можно поменять в курсе в любой день.'
          )
        ],
        React.createElement('button', {
          type: 'button',
          className: 'mc-supp-flow-btn mc-supp-flow-btn--primary',
          onClick: commitDoseAndAdvance
        }, alreadyInCourse ? 'Сохранить' : 'Добавить в курс')
      );
    }

    return null;
  }

  function isMorningRestCycleRowVisible(profile) {
    try {
      const hf = HEYS.healthFeatures;
      if (hf && typeof hf.isCycleTrackingEnabled === 'function') {
        return hf.isCycleTrackingEnabled(profile);
      }
    } catch (_) { /* noop */ }
    return profile?.gender === 'Женский' && profile?.cycleTrackingEnabled === true;
  }

  function renderMorningRestCycleRow(data, onChange, profile, context) {
    if (!isMorningRestCycleRowVisible(profile)) return null;

    const CycleUI = HEYS.CycleUI || {};
    const dateKey = data._dateKey || context?.dateKey || getTodayKey();
    const cycleOpen = data.cycleOpen === true;
    const cycleDays = [1, 2, 3, 4, 5, 6, 7];
    const storedDay = Number(data.cycleDay);
    const hasStoredDay = Number.isFinite(storedDay) && storedDay >= 1 && storedDay <= 7;
    const suggestedDay = typeof CycleUI.getSuggestedCycleDay === 'function'
      ? CycleUI.getSuggestedCycleDay(dateKey, lsGet)
      : null;
    const weekCardMode = typeof CycleUI.isCycleWeekCardMode === 'function'
      ? CycleUI.isCycleWeekCardMode(dateKey, hasStoredDay ? storedDay : null, lsGet)
      : (hasStoredDay || suggestedDay != null);
    const activeDay = typeof CycleUI.resolveCycleDayForUi === 'function'
      ? CycleUI.resolveCycleDayForUi(dateKey, hasStoredDay ? storedDay : null, lsGet)
      : (hasStoredDay ? storedDay : (suggestedDay || 1));
    const endedOnDay = Number(data.cycleEndedOnDay);
    const endedLabel = Number.isFinite(endedOnDay) && endedOnDay >= 1 && endedOnDay <= 7
      ? `закончились на ${endedOnDay}-й`
      : null;

    const commitCycleSelection = (nextDay, patch) => {
      onChange({
        ...data,
        cycleDay: nextDay,
        cycleStatus: null,
        cycleEndedOnDay: null,
        cycleOpen: false,
        ...patch,
      });
    };

    const runDestructiveCycleAction = (label, mutate, snapshot) => {
      mutate();
      if (HEYS.CycleUI?.pushCycleUndo) {
        HEYS.CycleUI.pushCycleUndo(label, () => {
          if (HEYS.CycleUI.restoreCycleWeekSnapshot) {
            HEYS.CycleUI.restoreCycleWeekSnapshot(snapshot, lsGet, lsSet);
          }
          onChange({
            ...data,
            cycleDay: snapshot?.find((row) => row.date === dateKey)?.cycleDay ?? data.cycleDay,
            cycleStatus: null,
            cycleEndedOnDay: null,
            cycleOpen: false,
          });
        });
        return;
      }
    };

    const handleCycleDayKeyDown = (event) => {
      const current = activeDay;
      const idx = cycleDays.indexOf(current);
      if (idx < 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        onChange({ ...data, cycleDay: cycleDays[Math.min(cycleDays.length - 1, idx + 1)], cycleOpen: true });
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        onChange({ ...data, cycleDay: cycleDays[Math.max(0, idx - 1)], cycleOpen: true });
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        onChange({ ...data, cycleDay: current, cycleOpen: true });
      }
    };

    const renderDayRow = (selectedDay) => React.createElement('div', {
      className: 'mc-rest-cycle-days',
      role: 'radiogroup',
      'aria-label': 'Какой день',
      onKeyDown: handleCycleDayKeyDown
    },
      cycleDays.map((day) => React.createElement('button', {
        key: day,
        type: 'button',
        role: 'radio',
        className: 'mc-rest-cycle-day-btn' + (selectedDay === day ? ' is-on' : ''),
        'aria-checked': selectedDay === day,
        'aria-label': `День ${day}`,
        tabIndex: selectedDay === day ? 0 : -1,
        onClick: () => onChange({ ...data, cycleOpen: true, cycleDay: day, cycleEndedOnDay: null })
      }, String(day)))
    );

    if (endedLabel && !cycleOpen && !weekCardMode) {
      return React.createElement('div', { className: 'mc-rest-row mc-rest-row--cycle mc-rest-row--cycle-ended' },
        React.createElement('div', null,
          React.createElement('div', { className: 'mc-rest-card-title' }, 'Особые дни'),
          React.createElement('div', { className: 'mc-rest-card-hint mc-rest-card-hint--muted' }, endedLabel),
          React.createElement('div', { className: 'mc-rest-cycle-ended-note' },
            'Нормы дальше идут по счёту фаз — влияние на организм не кончается вместе с днями.'
          )
        )
      );
    }

    if (weekCardMode && !cycleOpen) {
      const badge = typeof CycleUI.formatCycleWeekBadge === 'function'
        ? CycleUI.formatCycleWeekBadge(activeDay)
        : `День ${activeDay}`;
      const hint = typeof CycleUI.formatCycleWeekHint === 'function'
        ? CycleUI.formatCycleWeekHint(dateKey, activeDay, lsGet)
        : '';
      return React.createElement('div', { className: 'mc-rest-cycle-week-card' },
        React.createElement('div', { className: 'mc-rest-cycle-week-head' },
          React.createElement('div', { className: 'mc-rest-cycle-week-title' }, 'Особые дни'),
          React.createElement('div', { className: 'mc-rest-cycle-week-badge' }, badge)
        ),
        hint && React.createElement('div', { className: 'mc-rest-cycle-week-hint' }, hint),
        renderDayRow(activeDay),
        React.createElement('div', { className: 'mc-rest-cycle-week-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'mc-rest-cycle-btn mc-rest-cycle-btn--secondary',
            onClick: () => {
              const snapshot = HEYS.CycleUI?.snapshotCycleWeek?.(dateKey, lsGet) || [];
              runDestructiveCycleAction('Особые дни закрыты', () => {
                if (HEYS.CycleUI?.clearCycleWeek) HEYS.CycleUI.clearCycleWeek(dateKey, lsGet, lsSet);
                onChange({
                  ...data,
                  cycleDay: null,
                  cycleStatus: 'none',
                  cycleEndedOnDay: activeDay,
                  cycleOpen: false,
                });
              }, snapshot);
            }
          }, 'Закончились'),
          React.createElement('button', {
            type: 'button',
            className: 'mc-rest-cycle-btn mc-rest-cycle-btn--primary',
            onClick: () => commitCycleSelection(activeDay)
          }, 'Верно')
        )
      );
    }

    if (!cycleOpen) {
      return React.createElement('div', { className: 'mc-rest-row mc-rest-row--cycle' },
        React.createElement('div', null,
          React.createElement('div', { className: 'mc-rest-card-title' }, 'Особые дни'),
          React.createElement('div', { className: 'mc-rest-card-hint' }, 'Нормы дня подстроятся под них')
        ),
        React.createElement('button', {
          type: 'button',
          className: 'mc-rest-cycle-mark-chip',
          'aria-label': 'Отметить особые дни',
          onClick: () => onChange({
            ...data,
            cycleOpen: true,
            cycleDay: hasStoredDay ? storedDay : (suggestedDay || 1),
            cycleEndedOnDay: null,
          })
        }, 'Отметить')
      );
    }

    return React.createElement('div', { className: 'mc-rest-cycle-card mc-rest-cycle-card--expanded' },
      React.createElement('div', { className: 'mc-rest-cycle-expanded-head' },
        React.createElement('div', { className: 'mc-rest-card-title' }, 'Особые дни'),
        React.createElement('button', {
          type: 'button',
          className: 'mc-rest-cycle-none-btn',
          onClick: () => {
            const snapshot = HEYS.CycleUI?.snapshotCycleWeek?.(dateKey, lsGet) || [];
            const clearedCount = snapshot.length || 7;
            runDestructiveCycleAction(`Особые дни сняты · ${clearedCount} ${pluralDays(clearedCount)}`, () => {
              if (HEYS.CycleUI?.clearCycleWeek) HEYS.CycleUI.clearCycleWeek(dateKey, lsGet, lsSet);
              onChange({
                ...data,
                cycleDay: null,
                cycleStatus: 'none',
                cycleEndedOnDay: null,
                cycleOpen: false,
              });
            }, snapshot);
          }
        }, 'Не идут')
      ),
      React.createElement('div', { className: 'mc-rest-cycle-tier' }, 'Какой день'),
      renderDayRow(activeDay),
      React.createElement('div', { className: 'mc-rest-cycle-auto-hint' }, 'Дни 1–7 проставятся сами, дальше счёт идёт вперёд.')
    );
  }

  function MorningRestStepComponent({ data, onChange, context }) {
    const dateKey = context?.dateKey || getTodayKey();
    const profile = lsGet('heys_profile', {}) || {};
    const coldType = data.coldType || 'none';
    const coldFocus = data.coldOpen === true;
    const measurementsFocus = data.measurementsOpen === true;
    const supplementsFocus = data.supplementsOpen === true;
    const supplementsFeatureOn = isMorningRestSupplementsFeatureOn();
    const measurementsConsentOn = isMorningRestMeasurementsConsentOn(profile);
    const supplementsConsentOn = isMorningRestSupplementsEnabled();
    const planned = supplementsConsentOn && Array.isArray(data.selected) ? data.selected : [];
    const measurementsEligible = data.showMeasurements === true
      || (HEYS.Steps && typeof HEYS.Steps.shouldShowMeasurements === 'function' && HEYS.Steps.shouldShowMeasurements());
    const showConsentBanner = shouldShowMorningRestConsentBanner(profile) && data.consentBannerDismissed !== true;
    const consentBannerCopy = getMorningRestConsentBannerCopy(profile);
    const showMeasurements = measurementsConsentOn && measurementsEligible;
    const showSupplements = supplementsConsentOn && supplementsFeatureOn;
    const showSupplementsCard = showSupplements && planned.length > 0;
    const routineStatus = data.routineStatus || null;
    const routineStreak = data.routineStreak != null
      ? data.routineStreak
      : getMorningActivationRoutineStreak();
    const setRoutineStatus = (nextStatus) => {
      onChange({ ...data, routineStatus: nextStatus });
      applyMorningActivationCheckinAnswer(dateKey, nextStatus, 'morning-rest-routine');
    };
    const nowTime = () => new Date().toTimeString().slice(0, 5);
    const openColdLayer = () => {
      const time = data.coldTime || nowTime();
      onChange({
        ...data,
        coldOpen: true,
        coldType: coldType !== 'none' ? coldType : 'coldShower',
        coldTime: time,
        coldPicked: true,
        measurementsOpen: false
      });
    };
    const setColdType = (type) => {
      onChange({
        ...data,
        coldOpen: true,
        coldType: type,
        coldTime: data.coldTime || nowTime(),
        coldPicked: true
      });
    };
    const setColdNone = () => {
      onChange({
        ...data,
        coldOpen: false,
        coldType: 'none',
        coldTime: null,
        coldPicked: true,
        coldTimeOpen: false
      });
    };
    const clearColdMark = () => {
      onChange({
        ...data,
        coldOpen: false,
        coldType: 'none',
        coldTime: null,
        coldPicked: false,
        coldTimeOpen: false
      });
    };
    const clearMeasurementsMark = () => {
      onChange({
        ...data,
        measurementsOpen: false,
        waist: '',
        hips: '',
        thigh: '',
        biceps: '',
        measurementsSide: null
      });
    };
    const renderClearMark = (onClick, label = 'Убрать отметку') => React.createElement('button', {
      type: 'button',
      className: 'mc-rest-clear-mark',
      onClick
    },
      React.createElement('svg', {
        width: 13,
        height: 13,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.75,
        strokeLinecap: 'round',
        'aria-hidden': 'true'
      }, React.createElement('path', { d: 'M18 6L6 18M6 6l12 12' })),
      React.createElement('span', null, label)
    );
    const formatCmField = (raw) => {
      if (raw == null || raw === '') return '';
      const n = Number(String(raw).replace(',', '.'));
      if (!Number.isFinite(n) || n <= 0) return String(raw);
      return n.toFixed(1).replace('.', ',');
    };
    const coldTimeLabel = (data.coldTime && String(data.coldTime).slice(0, 5)) || nowTime();
    const parseColdTime = (raw) => {
      const parts = String(raw || coldTimeLabel).split(':');
      let hours = Math.max(0, Math.min(23, Number(parts[0]) || 0));
      let minutes = Math.max(0, Math.min(59, Number(parts[1]) || 0));
      // TimePicker minutes step is 5 — snap for wheel highlight
      minutes = Math.round(minutes / 5) * 5;
      if (minutes === 60) {
        minutes = 0;
        hours = (hours + 1) % 24;
      }
      return { hours, minutes };
    };
    const coldClock = parseColdTime(data.coldTime);
    const pad2 = (n) => String(n).padStart(2, '0');
    const setColdHours = (hours) => {
      onChange({ ...data, coldTime: `${pad2(hours)}:${pad2(coldClock.minutes)}` });
    };
    const setColdMinutes = (minutes) => {
      onChange({ ...data, coldTime: `${pad2(coldClock.hours)}:${pad2(minutes)}` });
    };
    const setColdClock = (hours, minutes) => {
      onChange({ ...data, coldTime: `${pad2(hours)}:${pad2(minutes)}` });
    };

    // Последний кофе: четыре варианта, из них один со своим временем. Шаг
    // проходится без ответа — тогда пункт кофеина в «Готовности ко сну»
    // остаётся без данных и в счётчик не идёт (контракт «кофе не обязателен»).
    const coffeeChoice = data.coffeeChoice || null;
    const coffeeFocus = data.coffeeOpen === true;
    const coffeeClock = parseColdTime(data.coffeeTime || nowTime());
    const setCoffeeChoice = (choice) => {
      onChange({ ...data, coffeeChoice: choice, coffeeOpen: false, coffeeTime: null });
    };
    const openCoffeeLayer = () => {
      onChange({
        ...data,
        coffeeChoice: 'exact',
        coffeeTime: data.coffeeTime || nowTime(),
        coffeeOpen: true,
        coldOpen: false,
        measurementsOpen: false
      });
    };
    const setCoffeeClock = (hours, minutes) => {
      onChange({ ...data, coffeeTime: `${pad2(hours)}:${pad2(minutes)}` });
    };
    const clearCoffeeMark = () => {
      onChange({ ...data, coffeeChoice: null, coffeeTime: null, coffeeOpen: false });
    };
    const TimePicker = HEYS.StepModal?.TimePicker;

    const lastMeasurements = (HEYS.Steps && typeof HEYS.Steps.getLastMeasurements === 'function')
      ? HEYS.Steps.getLastMeasurements()
      : getLastMeasurements();
    const openSupplementsLayer = () => {
      if (!supplementsConsentOn) {
        openHealthOptionalConsentFromCheckin().catch(() => {});
        return;
      }
      onChange({
        ...data,
        supplementsOpen: true,
        supplementsLayer: planned.length > 0 ? 'course' : 'empty',
        supplementsAddDraft: [...planned],
        supplementsPlannedAtOpen: [...planned],
        supplementsDoseId: null,
        supplementsDoseQueue: null,
        supplementsDoseDraft: null,
        coldOpen: false,
        measurementsOpen: false
      });
    };
    const openSupplementsAddLayer = () => {
      if (!supplementsConsentOn) {
        openHealthOptionalConsentFromCheckin().catch(() => {});
        return;
      }
      onChange({
        ...data,
        supplementsOpen: true,
        supplementsLayer: 'add',
        supplementsAddDraft: [...planned],
        supplementsPlannedAtOpen: [...planned],
        supplementsDoseId: null,
        supplementsDoseQueue: null,
        supplementsDoseDraft: null,
        coldOpen: false,
        measurementsOpen: false
      });
    };
    const openMeasurementsLayer = () => {
      const last = lastMeasurements || {};
      const side = data.measurementsSide || getMeasurementSide() || 'left';
      onChange({
        ...data,
        measurementsOpen: true,
        coldOpen: false,
        supplementsOpen: false,
        waist: data.waist !== undefined && data.waist !== '' ? data.waist : formatCmField(last.waist),
        hips: data.hips !== undefined && data.hips !== '' ? data.hips : formatCmField(last.hips),
        thigh: data.thigh !== undefined && data.thigh !== '' ? data.thigh : formatCmField(last.thigh),
        biceps: data.biceps !== undefined && data.biceps !== '' ? data.biceps : formatCmField(last.biceps),
        measurementsSide: side
      });
    };
    const spellDaysCount = (n) => ([
      'ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь',
      'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать', 'тринадцать',
      'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать',
      'девятнадцать', 'двадцать'
    ][n] || String(n));
    const formatMeasurementDaysAgo = (daysAgo) => {
      if (!Number.isFinite(daysAgo)) return '';
      if (daysAgo === 0) return 'Сегодня уже были';
      return `Прошло ${daysAgo} ${pluralDays(daysAgo)} с прошлых`;
    };
    const formatMeasurementDaysAgoWords = (daysAgo) => {
      if (!Number.isFinite(daysAgo)) return '';
      if (daysAgo === 0) return 'Сегодня уже были';
      return `Прошло ${spellDaysCount(daysAgo)} ${pluralDays(daysAgo)} с прошлых`;
    };
    const measurementRowHint = isMeasurementsOverdue(lastMeasurements)
      ? 'Без обхвата виден только вес'
      : (lastMeasurements?.daysAgo == null
        ? 'Ещё не было замеров'
        : formatMeasurementDaysAgo(lastMeasurements.daysAgo));
    const measurementLayerHint = lastMeasurements?.daysAgo == null
      ? 'Ещё не было замеров'
      : formatMeasurementDaysAgoWords(lastMeasurements.daysAgo);
    const measurementsOverdue = showMeasurements && isMeasurementsOverdue(lastMeasurements);
    const measurementsOverdueBadge = measurementsOverdue
      ? formatMeasurementsOverdueBadge(lastMeasurements)
      : null;
    const sparseNote = buildMorningRestSparseNote({
      showSupplementsCard,
      showConsentBanner,
      showMeasurements,
      showRefeed: false
    });
    const coldNoneSelected = data.coldPicked === true && coldType === 'none' && !coldFocus;
    const coldStreakLabel = formatColdStreakLabel(
      data.coldStreak != null ? data.coldStreak : getColdExposureStreak(context?.dateKey || getTodayKey())
    );
    const measureSide = data.measurementsSide || getMeasurementSide() || 'left';
    const measureFields = [
      { key: 'waist', label: 'Талия' },
      { key: 'hips', label: 'Бёдра' },
      { key: 'thigh', label: 'Бедро' },
      { key: 'biceps', label: 'Бицепс' }
    ];

    if (supplementsFocus) {
      return React.createElement(MorningRestSupplementsFlow, {
        data,
        onChange,
        planned,
        dateKey
      });
    }

    if (measurementsFocus) {
      return React.createElement('div', { className: 'mc-rest-step mc-rest-step--layer' },
        React.createElement('div', { className: 'mc-rest-layer-title' }, 'Замеры'),
        React.createElement('div', { className: 'mc-rest-layer-hint' },
          measurementLayerHint === 'Ещё не было замеров'
            ? 'Сантиметр честнее весов на короткой дистанции.'
            : `${measurementLayerHint}. Сантиметр честнее весов на короткой дистанции.`
        ),
        React.createElement('div', { className: 'mc-rest-measure-list' },
          measureFields.map((row) => React.createElement('label', {
            key: row.key,
            className: 'mc-rest-measure-row'
          },
            React.createElement('span', { className: 'mc-rest-measure-label' }, row.label),
            React.createElement('span', { className: 'mc-rest-measure-value' },
              React.createElement('input', {
                type: 'text',
                inputMode: 'decimal',
                className: 'mc-rest-measure-input',
                value: data[row.key] ?? '',
                placeholder: '—',
                'aria-label': `${row.label}, см`,
                onChange: (e) => onChange({ ...data, [row.key]: e.target.value })
              }),
              React.createElement('span', { className: 'mc-rest-measure-unit' }, 'см')
            )
          ))
        ),
        React.createElement('div', { className: 'mc-rest-measure-side' },
          React.createElement('span', { className: 'mc-rest-measure-side-label' }, 'Сторона'),
          React.createElement('div', { className: 'mc-rest-measure-side-pills' },
            React.createElement('button', {
              type: 'button',
              className: 'mc-rest-measure-side-pill' + (measureSide === 'left' ? ' is-on' : ''),
              onClick: () => {
                setMeasurementSide('left');
                onChange({ ...data, measurementsSide: 'left' });
              }
            }, 'Левая'),
            React.createElement('button', {
              type: 'button',
              className: 'mc-rest-measure-side-pill' + (measureSide === 'right' ? ' is-on' : ''),
              onClick: () => {
                setMeasurementSide('right');
                onChange({ ...data, measurementsSide: 'right' });
              }
            }, 'Правая')
          )
        ),
        renderClearMark(clearMeasurementsMark, 'Не сейчас'),
        React.createElement('div', {
          className: 'mc-recorded-hint mc-rest-clear-mark-hint mc-rest-measure-foot-hint'
        }, 'Можно заполнить только талию. Пропустите — напомним через неделю.')
      );
    }

    if (coffeeFocus) {
      return React.createElement('div', { className: 'mc-rest-step mc-rest-step--layer' },
        React.createElement('div', { className: 'mc-rest-cold' },
          React.createElement('div', { className: 'mc-rest-cold-head' },
            React.createElement('div', { className: 'mc-rest-cold-title' }, 'Последний кофе'),
            React.createElement('div', { className: 'mc-rest-coffee-note' }, 'до отбоя 8 ч')
          ),
          React.createElement('div', { className: 'mc-rest-cold-hint' },
            'Во сколько была последняя чашка — считаем от неё до отбоя.'
          ),
          React.createElement('div', { className: 'mc-rest-cold-time' },
            React.createElement('div', { className: 'mc-sleep-label mc-rest-cold-when-label' }, 'Когда'),
            TimePicker && React.createElement(TimePicker, {
              hours: coffeeClock.hours,
              minutes: coffeeClock.minutes,
              onHoursChange: (hours) => setCoffeeClock(hours, coffeeClock.minutes),
              onMinutesChange: (minutes) => setCoffeeClock(coffeeClock.hours, minutes),
              onTimeChange: setCoffeeClock,
              hoursLabel: '',
              minutesLabel: '',
              display: null,
              linkedScroll: true,
              compact: true,
              className: 'mc-rest-cold-clock'
            })
          )
        ),
        renderClearMark(clearCoffeeMark),
        React.createElement('div', {
          className: 'mc-recorded-hint mc-rest-clear-mark-hint'
        }, 'Кофе можно не отмечать — тогда пункт «Готовность ко сну» просто останется без данных.')
      );
    }

    if (coldFocus) {
      return React.createElement('div', { className: 'mc-rest-step mc-rest-step--layer' },
        React.createElement('div', { className: 'mc-rest-cold' },
          React.createElement('div', { className: 'mc-rest-cold-head' },
            React.createElement('div', { className: 'mc-rest-cold-title' }, 'Холод сегодня был'),
            coldStreakLabel && React.createElement('div', { className: 'mc-rest-cold-streak' }, coldStreakLabel)
          ),
          React.createElement('div', { className: 'mc-rest-cold-hint' },
            'Тридцать секунд в конце обычного душа — достаточно.'
          ),
          React.createElement('div', { className: 'mc-rest-cold-types' },
            [
              { id: 'coldShower', label: 'Прохладный душ', wave: 'волна −5 %' },
              { id: 'coldBath', label: 'Холодная ванна', wave: 'волна −10 %' },
              { id: 'coldSwim', label: 'Прорубь', wave: 'волна −12 %' }
            ].map((row) => React.createElement('button', {
              key: row.id,
              type: 'button',
              className: 'mc-rest-type' + (coldType === row.id ? ' is-on' : ''),
              onClick: () => setColdType(row.id)
            },
              React.createElement('span', null, row.label),
              React.createElement('span', { className: 'mc-rest-wave' }, row.wave)
            ))
          ),
          React.createElement('div', {
            className: 'mc-rest-cold-time'
          },
            React.createElement('div', { className: 'mc-sleep-label mc-rest-cold-when-label' }, 'Когда'),
            TimePicker && React.createElement(TimePicker, {
              hours: coldClock.hours,
              minutes: coldClock.minutes,
              onHoursChange: setColdHours,
              onMinutesChange: setColdMinutes,
              onTimeChange: setColdClock,
              hoursLabel: '',
              minutesLabel: '',
              display: null,
              linkedScroll: true,
              compact: true,
              className: 'mc-rest-cold-clock'
            })
          )
        ),
        renderClearMark(clearColdMark),
        React.createElement('div', {
          className: 'mc-recorded-hint mc-rest-clear-mark-hint'
        }, '«Не сегодня» тоже записывается — иначе вопрос вернётся через час.')
      );
    }

    const cycleDayValue = Number(data.cycleDay);
    const cycleOnWeek = Number.isFinite(cycleDayValue) && cycleDayValue >= 1 && cycleDayValue <= 7;
    const cycleSuggested = HEYS.CycleUI?.getSuggestedCycleDay?.(dateKey, lsGet);
    const cycleWeekTop = !!(cycleOnWeek || cycleSuggested);
    const cycleRow = renderMorningRestCycleRow(data, onChange, profile, context);

    const coldRow = React.createElement('div', { className: 'mc-rest-row mc-rest-row--cold' },
      React.createElement('div', null,
        React.createElement('div', { className: 'mc-rest-card-title' }, 'Прохладный душ'),
        coldStreakLabel && React.createElement('div', { className: 'mc-rest-card-hint' }, coldStreakLabel)
      ),
      React.createElement('div', { className: 'mc-rest-row-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'mc-pill mc-pill--choice',
          onClick: openColdLayer
        }, 'Было'),
        React.createElement('button', {
          type: 'button',
          className: 'mc-pill mc-pill--choice' + (coldNoneSelected ? ' is-on' : ''),
          onClick: setColdNone
        }, 'Не сегодня')
      )
    );

    const coldCard = React.createElement('div', { className: 'mc-rest-cold' },
      React.createElement('div', { className: 'mc-rest-cold-head' },
        React.createElement('div', { className: 'mc-rest-cold-title' }, 'Прохладный душ'),
        coldStreakLabel && React.createElement('div', { className: 'mc-rest-cold-streak' }, coldStreakLabel)
      ),
      React.createElement('div', { className: 'mc-rest-cold-hint' },
        'Хотя бы тридцать секунд в конце обычного душа — этого достаточно.'
      ),
      React.createElement('div', { className: 'mc-rest-cold-actions' },
        React.createElement('button', {
          type: 'button',
          className: 'mc-pill mc-pill--choice',
          onClick: openColdLayer
        }, 'Было'),
        React.createElement('button', {
          type: 'button',
          className: 'mc-pill mc-pill--choice' + (coldNoneSelected ? ' is-on' : ''),
          onClick: setColdNone
        }, 'Не сегодня')
      )
    );

    // Кадр «Чек-ин · остальное»: блок стоит первым из редких — до добавок и
    // рутины. Форма карточки — общая для шага (радиус 20, поля 16/17), как у
    // добавок и рутины: кадр рисует вторую форму, но контракт «вид карточки
    // шага» старше кадра (см. .mc-rest-card в 500-pwa-and-offline.css).
    const coffeeCard = React.createElement('div', { className: 'mc-rest-card mc-rest-card--coffee' },
      React.createElement('div', { className: 'mc-rest-cold-head' },
        React.createElement('div', { className: 'mc-rest-card-title' }, 'Последний кофе'),
        React.createElement('div', { className: 'mc-rest-coffee-note' }, 'до отбоя 8 ч')
      ),
      React.createElement('div', { className: 'mc-rest-coffee-actions' },
        [
          { id: 'before12', label: 'до 12:00' },
          { id: 'exact', label: data.coffeeTime ? String(data.coffeeTime).slice(0, 5) : 'своё время' },
          { id: 'after17', label: 'после 17' },
          { id: 'none', label: 'не пил' }
        ].map((row) => React.createElement('button', {
          key: row.id,
          type: 'button',
          className: 'mc-pill mc-pill--choice' + (coffeeChoice === row.id ? ' is-on' : ''),
          onClick: row.id === 'exact' ? openCoffeeLayer : () => setCoffeeChoice(row.id)
        }, row.label))
      ),
      React.createElement('div', { className: 'mc-rest-card-hint mc-rest-coffee-why' },
        'Нужно для пункта «Готовность ко сну»: кофе позже восьми часов до отбоя мешает сну. Точное время — тапом по «своё время».'
      )
    );

    const measurementsDeferred = cycleWeekTop;
    const measurementsNode = showMeasurements && (measurementsDeferred
      ? React.createElement('div', {
        className: 'mc-rest-row mc-rest-row--measurements-deferred',
        role: 'group',
        'aria-disabled': 'true',
        'aria-label': 'Замеры отложены. Задержка воды искажает обхваты, вернутся после периода'
      },
        React.createElement('div', null,
          React.createElement('div', { className: 'mc-rest-card-title mc-rest-card-title--muted' }, 'Замеры отложены'),
          React.createElement('div', { className: 'mc-rest-card-hint mc-rest-card-hint--muted' },
            'Задержка воды искажает обхваты — вернутся после периода'
          )
        )
      )
      : React.createElement('button', {
        type: 'button',
        className: 'mc-rest-row' + (measurementsOverdue ? ' mc-rest-row--overdue' : ''),
        onClick: openMeasurementsLayer
      },
        React.createElement('div', null,
          React.createElement('div', { className: 'mc-rest-card-title' }, 'Замеры'),
          React.createElement('div', { className: 'mc-rest-card-hint' }, measurementRowHint)
        ),
        measurementsOverdueBadge && React.createElement('span', {
          className: 'mc-rest-overdue-badge'
        }, measurementsOverdueBadge),
        React.createElement('span', {
          className: 'mc-rest-chevron' + (measurementsOverdue ? ' mc-rest-chevron--accent' : ''),
          'aria-hidden': 'true'
        }, '›')
      ));

    return React.createElement('div', {
      className: 'mc-rest-step' + (cycleWeekTop ? ' mc-rest-step--cycle-week' : '')
    },
      cycleWeekTop ? cycleRow : coldCard,
      coffeeCard,
      showSupplementsCard && React.createElement('div', { className: 'mc-rest-card mc-rest-card--supplements' },
        React.createElement('button', {
          type: 'button',
          className: 'mc-rest-supp-head',
          onClick: openSupplementsLayer
        },
          React.createElement('span', { className: 'mc-rest-card-title' }, 'Добавки на сегодня'),
          React.createElement('span', { className: 'mc-rest-chevron mc-rest-chevron--down', 'aria-hidden': 'true' })
        ),
        React.createElement('div', {
          className: 'mc-rest-supp-list'
        },
          planned.map((id) => {
            const row = formatMorningRestSupplementRow(id);
            return React.createElement('div', { key: id, className: 'mc-rest-supp-row' },
              React.createElement('span', { className: 'mc-rest-supp-name' }, row.title),
              row.timing && React.createElement('span', { className: 'mc-rest-supp-time' }, row.timing)
            );
          })
        ),
        React.createElement('button', {
          type: 'button',
          className: 'mc-rest-supp-add',
          onClick: openSupplementsAddLayer
        },
          React.createElement('span', { className: 'mc-rest-supp-add-icon', 'aria-hidden': 'true' },
            React.createElement('svg', {
              width: 13,
              height: 13,
              viewBox: '0 0 24 24',
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 3,
              strokeLinecap: 'round'
            }, React.createElement('path', { d: 'M12 6v12M6 12h12' }))
          ),
          React.createElement('span', null, 'Добавить в курс')
        )
      ),
      React.createElement('div', { className: 'mc-rest-card mc-rest-card--routine' },
        React.createElement('div', { className: 'mc-rest-cold-head' },
          React.createElement('div', { className: 'mc-rest-card-title' }, 'Утренняя рутина'),
          routineStreak > 0 && React.createElement('div', { className: 'mc-rest-cold-streak' },
            formatColdStreakLabel(routineStreak)
          )
        ),
        React.createElement('div', { className: 'mc-rest-card-hint' }, 'Резинки и разогрев · 6 минут'),
        React.createElement('div', { className: 'mc-rest-routine-actions' },
          ['done', 'planned', 'skipped'].map((status) => React.createElement('button', {
            key: status,
            type: 'button',
            className: 'mc-pill mc-pill--mini mc-pill--choice' + (routineStatus === status ? ' is-on' : ''),
            onClick: () => setRoutineStatus(status)
          }, status === 'done' ? 'Сделал' : status === 'planned' ? 'Сделаю' : 'Не сегодня'))
        )
      ),
      !cycleWeekTop && cycleRow,
      cycleWeekTop ? coldRow : null,
      measurementsNode,
      sparseNote && React.createElement('div', { className: 'mc-rest-empty-note' }, sparseNote),
      showConsentBanner && React.createElement('div', { className: 'mc-rest-consent-card' },
        React.createElement('div', { className: 'mc-rest-consent-card-title' }, consentBannerCopy.title),
        React.createElement('div', { className: 'mc-rest-consent-card-body' }, consentBannerCopy.body),
        React.createElement('div', { className: 'mc-rest-consent-actions' },
          React.createElement('button', {
            type: 'button',
            className: 'mc-rest-consent-primary',
            onClick: () => {
              openHealthOptionalConsentFromCheckin().catch(() => {});
            }
          }, 'Прочитать и подписать'),
          React.createElement('button', {
            type: 'button',
            className: 'mc-rest-consent-secondary',
            onClick: () => {
              snoozeHealthOptionalConsent();
              onChange({ ...data, consentBannerDismissed: true });
            }
          }, 'Не сейчас')
        )
      )
    );
  }

  registerStep('morningRest', {
    title: 'Остальное',
    hint: '',
    canSkip: false,
    nextLabel: 'Готово',
    component: MorningRestStepComponent,
    showHeaderBack: (data) => !!(data && (data.coldOpen === true || data.coffeeOpen === true || data.measurementsOpen === true || data.supplementsOpen === true)),
    hideProgressDots: (data) => !!(data && data.supplementsOpen === true),
    headerCaption: (data) => {
      if (!data?.supplementsOpen) return null;
      if (data.supplementsLayer === 'add') return 'Добавить в курс';
      if (data.supplementsLayer === 'dose' && data.supplementsDoseId) {
        return getMorningRestSuppCourseName(data.supplementsDoseId);
      }
      return 'Добавки';
    },
    hideDailyFooter: (data) => {
      if (!data?.supplementsOpen) return false;
      return true;
    },
    applyHeaderBack: (data) => {
      const next = { ...(data || {}) };
      if (next.supplementsOpen) {
        if (next.supplementsLayer === 'dose') {
          next.supplementsLayer = 'add';
          next.supplementsDoseId = null;
          next.supplementsDoseQueue = null;
          next.supplementsDoseDraft = null;
          return next;
        }
        if (next.supplementsLayer === 'add') {
          const plannedOpen = Array.isArray(next.selected) ? next.selected : [];
          next.supplementsLayer = plannedOpen.length > 0 ? 'course' : 'empty';
          next.supplementsAddDraft = [...plannedOpen];
          next.supplementsPlannedAtOpen = [...plannedOpen];
          return next;
        }
        next.supplementsOpen = false;
        next.supplementsLayer = null;
        next.supplementsAddDraft = null;
        next.supplementsPlannedAtOpen = null;
        next.supplementsDoseId = null;
        next.supplementsDoseQueue = null;
        next.supplementsDoseDraft = null;
        return next;
      }
      next.measurementsOpen = false;
      next.coldOpen = false;
      next.coffeeOpen = false;
      return next;
    },
    getInitialData: (context) => {
      const dateKey = context?.dateKey || getTodayKey();
      const dayData = readDayData(dateKey, {});
      const profile = lsGet('heys_profile', {}) || {};
      const hf = HEYS.healthFeatures;
      const measurementsConsentOn = isMorningRestMeasurementsConsentOn(profile);
      const supplementsConsentOn = hf && typeof hf.isSupplementsTrackingEnabled === 'function'
        ? hf.isSupplementsTrackingEnabled(profile)
        : profile.supplementsTrackingEnabled === true;
      const supplementsFeatureOn = hf && typeof hf.isSupplementsFeatureAvailable === 'function'
        ? hf.isSupplementsFeatureAvailable(profile) !== false
        : true;
      const planned = supplementsConsentOn ? (HEYS.Supplements?.getPlanned?.() || []) : [];
      const cold = dayData.coldExposure || {};
      const coffee = dayData.lastCoffee || {};
      const maState = normalizeMorningActivationState(dateKey, dayData);
      const routineStatus = isMorningActivationCheckinStatus(maState.status) ? maState.status : null;
      const cycleDayValue = Number(dayData.cycleDay);
      const cycleDay = Number.isFinite(cycleDayValue) && cycleDayValue >= 1 && cycleDayValue <= 7
        ? cycleDayValue
        : null;
      if (maState.status === 'planned') {
        scheduleMorningActivationPlannedReminder(dateKey);
      }
      return {
        coldType: cold.type || 'none',
        coldTime: cold.time || null,
        coldPicked: !!cold.type,
        coldOpen: false,
        coffeeChoice: MORNING_COFFEE_CHOICES.includes(coffee.choice) ? coffee.choice : null,
        coffeeTime: coffee.choice === 'exact' && coffee.time ? coffee.time : null,
        coffeeOpen: false,
        cycleDay,
        cycleOpen: false,
        cycleEndedOnDay: Number.isFinite(Number(dayData.cycleEndedOnDay)) ? Number(dayData.cycleEndedOnDay) : null,
        supplementsOpen: false,
        supplementsLayer: null,
        supplementsAddDraft: null,
        supplementsPlannedAtOpen: null,
        supplementsDoseId: null,
        supplementsDoseQueue: null,
        supplementsDoseDraft: null,
        selected: planned,
        showMeasurements: measurementsConsentOn && !!(HEYS.Steps?.shouldShowMeasurements?.()),
        showSupplements: supplementsConsentOn && supplementsFeatureOn,
        routineStatus,
        routineStreak: getMorningActivationRoutineStreak(),
        coldStreak: getColdExposureStreak(dateKey),
        _dateKey: dateKey
      };
    },
    save: (data, context) => {
      const dateKey = data._dateKey || context?.dateKey || getTodayKey();
      const dayData = getFreshDayData(dateKey);
      dayData.date = dateKey;
      dayData.coldExposure = {
        type: data.coldType || 'none',
        time: data.coldType && data.coldType !== 'none' ? (data.coldTime || new Date().toTimeString().slice(0, 5)) : null,
        answeredAt: Date.now()
      };
      // Без ответа поле не заводим и старое убираем: «нет данных» у пункта
      // кофеина — это отсутствие записи, а не отдельное значение.
      const coffeeAnswered = MORNING_COFFEE_CHOICES.includes(data.coffeeChoice)
        && (data.coffeeChoice !== 'exact' || !!data.coffeeTime);
      if (coffeeAnswered) {
        dayData.lastCoffee = {
          choice: data.coffeeChoice,
          time: data.coffeeChoice === 'exact' ? data.coffeeTime : null,
          answeredAt: Date.now()
        };
      } else if (dayData.lastCoffee) {
        delete dayData.lastCoffee;
      }
      if (Array.isArray(data.selected)) {
        dayData.supplementsPlanned = data.selected;
        dayData.supplementsPlannedUpdatedAt = Date.now();
        if (HEYS.Supplements?.savePlanned) {
          HEYS.Supplements.savePlanned(data.selected, {
            dateKey,
            source: 'morning-rest-step',
            syncDay: false
          });
        }
      }
      if (isMorningActivationCheckinStatus(data.routineStatus)) {
        dayData.morningActivation = {
          ...(dayData.morningActivation || {}),
          status: data.routineStatus,
          decidedAt: dayData.morningActivation?.decidedAt || Date.now(),
          checkinAnsweredAt: dayData.morningActivation?.checkinAnsweredAt || Date.now()
        };
      }
      const nextCycleDay = Number(data.cycleDay);
      if (Number.isFinite(nextCycleDay) && nextCycleDay >= 1 && nextCycleDay <= 7) {
        dayData.cycleDay = nextCycleDay;
        dayData.cycleStatus = null;
        dayData.cycleAnsweredAt = Date.now();
        dayData.cycleUpdatedAt = Math.max(Date.now(), (Number(dayData.cycleUpdatedAt) || 0) + 1);
        if (HEYS.Cycle?.setCycleDaysAuto) {
          HEYS.Cycle.setCycleDaysAuto(dateKey, nextCycleDay, lsGet, lsSet);
        }
      } else if (data.cycleStatus === 'none' || data.cycleOpen === true) {
        dayData.cycleDay = null;
        dayData.cycleStatus = data.cycleStatus === 'none' ? 'none' : (dayData.cycleStatus || null);
        dayData.cycleAnsweredAt = Date.now();
        dayData.cycleUpdatedAt = Math.max(Date.now(), (Number(dayData.cycleUpdatedAt) || 0) + 1);
      }
      if (Number.isFinite(Number(data.cycleEndedOnDay))) {
        dayData.cycleEndedOnDay = Number(data.cycleEndedOnDay);
      } else if (Number.isFinite(nextCycleDay) && nextCycleDay >= 1) {
        delete dayData.cycleEndedOnDay;
      }
      const waist = parseFloat(String(data.waist || '').replace(',', '.'));
      if (Number.isFinite(waist) && waist > 0) {
        dayData.measurements = {
          ...(dayData.measurements || {}),
          waist,
          hips: parseFloat(String(data.hips || '').replace(',', '.')) || dayData.measurements?.hips,
          thigh: parseFloat(String(data.thigh || '').replace(',', '.')) || dayData.measurements?.thigh,
          biceps: parseFloat(String(data.biceps || '').replace(',', '.')) || dayData.measurements?.biceps,
          measuredAt: Date.now()
        };
      }
      dayData.updatedAt = Date.now();
      saveDayData(dateKey, dayData);
      window.dispatchEvent(new CustomEvent('heys:day-updated', {
        detail: { date: dateKey, field: 'morningRest', source: 'morning-rest-step', forceReload: true }
      }));
      return { affectedKeys: [`heys_dayv2_${dateKey}`], completed: true };
    }
  });

  function CheckinRecordedStepComponent({ stepData, context }) {
    // UI-гейт: цель — итог утра; главное — «На главную»; слой 1 — серия/норма/шаги;
    // слой 2 — нет; критическое — норма и план не прятать.
    const dateKey = context?.dateKey || getTodayKey();
    const day = readDayData(dateKey, {}) || {};
    const profile = lsGet('heys_profile', {}) || {};
    const estimated = isEstimatedMorningWeight(day);
    const weight = Number(day.weightMorning);
    const streak = Number(HEYS.Day?.getStreak?.() || 0);
    const stepsGoal = Number(profile.stepsGoal) || 0;
    // Канон утренней нормы = resolveDailyTargets → optimum.
    let kcal = 0;
    try {
      const targets = HEYS.TDEE?.resolveDailyTargets?.(profile, day);
      kcal = Number(targets?.kcal) || 0;
    } catch (_) { /* TDEE может ещё не загрузиться */ }
    if (!(kcal > 0)) {
      try {
        const calc = HEYS.TDEE?.calculate?.(day, profile);
        kcal = Number(calc?.optimum) || 0;
      } catch (_) { /* noop */ }
    }
    if (!(kcal > 0)) kcal = Number(profile.kcalTarget || profile.optimum || 0) || 0;

    const streakText = streak > 0
      ? (estimated
        ? `Серия — ${streak} ${pluralDays(streak)} подряд, сегодня без взвешивания`
        : `Серия — ${streak} ${pluralDays(streak)} подряд`)
      : (estimated ? 'Сегодня без взвешивания' : 'Утро закрыто');

    const showWeightRow = estimated && Number.isFinite(weight) && weight > 0;

    return React.createElement('div', { className: 'mc-recorded' },
      React.createElement('div', { className: 'mc-recorded-check', 'aria-hidden': 'true' },
        React.createElement('svg', { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: '#5c6a45', strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' },
          React.createElement('path', { d: 'M5 13l4 4L19 7' })
        )
      ),
      React.createElement('div', { className: 'mc-recorded-title' }, 'Чек-ин записан'),
      React.createElement('div', { className: 'mc-recorded-sub' }, streakText),
      React.createElement('div', { className: 'mc-recorded-card' },
        showWeightRow && React.createElement('div', { className: 'mc-recorded-row' },
          React.createElement('span', null, 'Вес дня'),
          React.createElement('span', { className: 'mc-recorded-row__value' },
            `${weight.toFixed(1).replace('.', ',')} кг · `,
            React.createElement('span', { className: 'mc-recorded-row__mark' }, 'расчётный')
          )
        ),
        kcal > 0 && React.createElement('div', { className: 'mc-recorded-row' },
          React.createElement('span', null, 'Норма на утро'),
          React.createElement('span', { className: 'mc-recorded-row__kcal' },
            `${Math.round(kcal).toLocaleString('ru-RU')} ккал`
          )
        ),
        stepsGoal > 0 && React.createElement('div', { className: 'mc-recorded-row' },
          React.createElement('span', null, 'План по шагам'),
          React.createElement('span', { className: 'mc-recorded-row__value' },
            Math.round(stepsGoal).toLocaleString('ru-RU')
          )
        )
      ),
      React.createElement('div', { className: 'mc-recorded-hint' },
        estimated
          ? 'График веса эту точку не ставит — в нём только реальные взвешивания.'
          : 'Норма уточнится к вечеру по факту шагов и тренировок.'
      )
    );
  }

  function pluralDays(n) {
    const abs = Math.abs(Number(n) || 0) % 100;
    const d = abs % 10;
    if (abs > 10 && abs < 20) return 'дней';
    if (d === 1) return 'день';
    if (d >= 2 && d <= 4) return 'дня';
    return 'дней';
  }

  registerStep('checkinRecorded', {
    title: 'Записано',
    hint: '',
    hideProgressDots: true,
    hiddenFromProgress: true,
    nextLabel: 'На главную',
    component: CheckinRecordedStepComponent,
    getInitialData: () => ({}),
    save: () => ({ completed: true, affectedKeys: [] })
  });

  // =============================================

  // === Экспорт шагов ===
  HEYS.morningActivationSkipReasons = MORNING_ACTIVATION_SKIP_REASONS;

  HEYS.MorningActivation = {
    applyCheckinAnswer: applyMorningActivationCheckinAnswer,
    schedulePlannedReminder: scheduleMorningActivationPlannedReminder,
    cancelPlannedReminder: cancelMorningActivationPlannedReminder,
    normalizeState: normalizeMorningActivationState
  };

  HEYS.Steps = {
    Weight: WeightStepComponent,
    SleepTime: SleepTimeStepComponent,
    SleepQuality: SleepQualityStepComponent,
    StepsGoal: StepsGoalStepComponent,
    Deficit: DeficitStepComponent,
    HouseholdMinutes: HouseholdMinutesComponent,
    HouseholdStats: HouseholdStatsComponent,
    Cycle: CycleStepComponent,
    Measurements: MeasurementsStepComponent,
    ColdExposure: ColdExposureStepComponent,
    Supplements: SupplementsStepComponent,  // 💊 Витамины
    MorningRoutine: MorningRoutineStepComponent,  // 🌟 Мотивирующий финал
    getLastMeasurementByField,
    getMeasurementsHistory,
    getLastCoffeeMinutes,
    MORNING_COFFEE_CHOICES,
    // Утилиты
    getLastKnownWeight,
    getYesterdayWeight,
    getWeightForecast,
    estimateMorningWeight,
    isMeasuredMorningWeight,
    isEstimatedMorningWeight,
    getLastSleepData,
    getWeeklyStepsStats,
    computeAdaptiveStepsGoal,
    resolveStepsGoalContext,
    stepsGoalSliderValueToRatio,
    stepsGoalSliderRatioToValue,
    stepsGoalSliderStepForValue,
    medianStepsValue,
    collectRecentStepsHistory,
    STEPS_HISTORY_LOOKBACK_DAYS,
    STEPS_HISTORY_MIN_DAYS,
    calcSleepHours,
    getCurrentDeficit,
    calcHouseholdKcal,
    getWeeklyHouseholdStats,
    getLastMeasurements,
    shouldShowMeasurements,
    isMeasurementsOverdue,
    formatMeasurementsOverdueBadge,
    shouldShowCycleStep
  };

  // Verbose init log removed

})(typeof window !== 'undefined' ? window : global);
