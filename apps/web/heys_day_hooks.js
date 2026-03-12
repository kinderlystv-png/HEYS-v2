// heys_day_hooks.js — React hooks for Day component

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  function getReact() {
    const React = global.React;
    if (!React) {
      throw new Error('[heys_day_hooks] React is required');
    }
    return React;
  }

  const storeGet = (key, def) => {
    try {
      if (HEYS.store?.get) return HEYS.store.get(key, def);
      if (HEYS.utils?.lsGet) return HEYS.utils.lsGet(key, def);
      const raw = global.localStorage?.getItem(key);
      return raw ? JSON.parse(raw) : def;
    } catch (e) {
      return def;
    }
  };

  const storeSet = (key, value) => {
    try {
      if (HEYS.store?.set) {
        HEYS.store.set(key, value);
        return;
      }
      if (HEYS.utils?.lsSet) {
        HEYS.utils.lsSet(key, value);
        return;
      }
      global.localStorage?.setItem(key, JSON.stringify(value));
    } catch (e) { }
  };

  // Импортируем утилиты из dayUtils
  const getDayUtils = () => HEYS.dayUtils || {};

  function isSyntheticEstimatedItem(item) {
    if (!item || typeof item !== 'object') return false;
    const productId = String(item.product_id ?? item.productId ?? '');
    const itemId = String(item.id ?? '');
    const estimatedSource = String(item.estimatedSource ?? '');
    return !!(
      item.isEstimated ||
      item.virtualProduct ||
      item.skipProductRestore ||
      item.skipOrphanTracking ||
      estimatedSource === 'morning-checkin' ||
      productId.startsWith('estimated_') ||
      productId.startsWith('estimated_quickfill_') ||
      itemId.startsWith('estimated_')
    );
  }

  // Хук для централизованного автосохранения дня с учётом гонок и межвкладочной синхронизации
  // Поддерживает ночную логику: приёмы 00:00-02:59 сохраняются под следующий календарный день
  function useDayAutosave({
    day,
    date,
    lsSet,
    lsGetFn,
    keyPrefix = 'heys_dayv2_',
    debounceMs = 500,
    now = () => Date.now(),
    disabled = false, // ЗАЩИТА: не сохранять пока данные не загружены
  }) {
    const React = getReact();
    const utils = getDayUtils();
    // ВАЖНО: Используем динамический вызов чтобы всегда брать актуальный HEYS.utils.lsSet
    // Это нужно для синхронизации с облаком (диспатч события heys:data-saved)
    const lsSetFn = React.useCallback((key, val) => {
      const actualLsSet = global.HEYS?.utils?.lsSet || lsSet || utils.lsSet;
      if (actualLsSet) {
        actualLsSet(key, val);
        return;
      }
      storeSet(key, val);
    }, [lsSet, utils.lsSet]);
    const lsGetFunc = lsGetFn || utils.lsGet;

    const timerRef = React.useRef(null);
    const prevStoredSnapRef = React.useRef(null);
    const prevDaySnapRef = React.useRef(null);
    const sourceIdRef = React.useRef((global.crypto && typeof global.crypto.randomUUID === 'function') ? global.crypto.randomUUID() : String(Math.random()));
    const channelRef = React.useRef(null);
    const isUnmountedRef = React.useRef(false);

    React.useEffect(() => {
      isUnmountedRef.current = false;
      if ('BroadcastChannel' in global) {
        const channel = new BroadcastChannel('heys_day_updates');
        channelRef.current = channel;
        return () => {
          isUnmountedRef.current = true;
          channel.close();
          channelRef.current = null;
        };
      }
      channelRef.current = null;
    }, []);

    const getKey = React.useCallback((dateStr) => keyPrefix + dateStr, [keyPrefix]);

    const stripMeta = React.useCallback((payload) => {
      if (!payload) return payload;
      const { updatedAt, _sourceId, ...rest } = payload;
      return rest;
    }, []);

    const readExisting = React.useCallback((key) => {
      if (!key) return null;
      try {
        if (global.HEYS?.store?.invalidate) {
          global.HEYS.store.invalidate(key);
        }
        const stored = lsGetFunc ? lsGetFunc(key, null) : storeGet(key, null);
        if (stored && typeof stored === 'object') return stored;
        if (typeof stored === 'string') {
          return JSON.parse(stored);
        }
      } catch (e) { }

      const readRawLocal = (rawKey) => {
        if (!rawKey) return null;
        try {
          const raw = global.localStorage?.getItem(rawKey);
          if (!raw) return null;
          if (raw.startsWith('¤Z¤') && global.HEYS?.store?.decompress) {
            return global.HEYS.store.decompress(raw);
          }
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      };

      try {
        const cid = global.HEYS?.currentClientId;
        const isScoped = cid && key.startsWith('heys_') && !key.includes(cid);
        const scopedKey = isScoped ? ('heys_' + cid + '_' + key.substring('heys_'.length)) : key;
        const scopedVal = readRawLocal(scopedKey);
        if (scopedVal && typeof scopedVal === 'object') return scopedVal;
        const rawVal = readRawLocal(key);
        if (rawVal && typeof rawVal === 'object') return rawVal;
      } catch (e) { }
      return null;
    }, [lsGetFunc]);

    const isMeaningfulDayData = React.useCallback((data) => {
      if (!data || typeof data !== 'object') return false;
      const mealsCount = Array.isArray(data.meals) ? data.meals.length : 0;
      const trainingsCount = Array.isArray(data.trainings) ? data.trainings.length : 0;
      if (mealsCount > 0 || trainingsCount > 0) return true;
      if ((data.waterMl || 0) > 0) return true;
      if ((data.steps || 0) > 0) return true;
      if ((data.weightMorning || 0) > 0) return true;
      if (data.sleepStart || data.sleepEnd || data.sleepQuality || data.sleepNote) return true;
      if (data.dayScore || data.moodAvg || data.wellbeingAvg || data.stressAvg) return true;
      if (data.moodMorning || data.wellbeingMorning || data.stressMorning) return true;
      if (data.householdMin || (Array.isArray(data.householdActivities) && data.householdActivities.length > 0)) return true;
      if (data.isRefeedDay || data.refeedReason) return true;
      if (data.cycleDay !== null && data.cycleDay !== undefined) return true;
      if (data.deficitPct !== null && data.deficitPct !== undefined && data.deficitPct !== '') return true;
      if ((Array.isArray(data.supplementsPlanned) && data.supplementsPlanned.length > 0) ||
        (Array.isArray(data.supplementsTaken) && data.supplementsTaken.length > 0)) return true;
      return false;
    }, []);

    // Очистка фото от base64 данных перед сохранением (экономия localStorage)
    const stripPhotoData = React.useCallback((payload) => {
      if (!payload?.meals) return payload;
      return {
        ...payload,
        meals: payload.meals.map(meal => {
          if (!meal?.photos?.length) return meal;
          return {
            ...meal,
            photos: meal.photos.map(photo => {
              // Если есть URL — удаляем data (base64)
              // Если нет URL (pending) — сохраняем data для offline
              if (photo.url) {
                const { data, ...rest } = photo;
                return rest;
              }
              // Pending фото: сохраняем, но ограничиваем размер
              // Если data > 100KB — не сохраняем в localStorage (только в pending queue)
              if (photo.data && photo.data.length > 100000) {
                console.warn('[AUTOSAVE] Photo too large for localStorage, skipping data');
                const { data, ...rest } = photo;
                return { ...rest, dataSkipped: true };
              }
              return photo;
            })
          };
        })
      };
    }, []);

    // Сохранение данных дня под конкретную дату
    const saveToDate = React.useCallback((dateStr, payload) => {
      if (!dateStr || !payload) return;
      const key = getKey(dateStr);
      const current = readExisting(key);
      const incomingUpdatedAt = payload.updatedAt != null ? payload.updatedAt : now();

      if (payload.isFastingDay || payload.isIncomplete || current?.isFastingDay || current?.isIncomplete) {
        console.info('[HEYS.dayRealData] 💾 saveToDate attempt', {
          key,
          date: dateStr,
          incomingUpdatedAt,
          payloadFlags: {
            isFastingDay: !!payload.isFastingDay,
            isIncomplete: !!payload.isIncomplete
          },
          currentFlags: {
            isFastingDay: !!current?.isFastingDay,
            isIncomplete: !!current?.isIncomplete
          },
          currentUpdatedAt: current?.updatedAt || 0
        });
      }

      if (current && current.updatedAt > incomingUpdatedAt) {
        if (payload.isFastingDay || payload.isIncomplete || current?.isFastingDay || current?.isIncomplete) {
          console.warn('[HEYS.dayRealData] ⏭️ saveToDate skipped: newer current data', {
            key,
            date: dateStr,
            incomingUpdatedAt,
            currentUpdatedAt: current.updatedAt
          });
        }
        return;
      }
      if (current && current.updatedAt === incomingUpdatedAt && current._sourceId && current._sourceId > sourceIdRef.current) {
        if (payload.isFastingDay || payload.isIncomplete || current?.isFastingDay || current?.isIncomplete) {
          console.warn('[HEYS.dayRealData] ⏭️ saveToDate skipped: source ordering', {
            key,
            date: dateStr,
            incomingUpdatedAt,
            currentSourceId: current._sourceId,
            sourceId: sourceIdRef.current
          });
        }
        return;
      }

      if (current && isMeaningfulDayData(current) && !isMeaningfulDayData(payload)) {
        if (payload.isFastingDay || payload.isIncomplete || current?.isFastingDay || current?.isIncomplete) {
          console.warn('[HEYS.dayRealData] ⏭️ saveToDate skipped: non-meaningful payload would overwrite meaningful day', {
            key,
            date: dateStr
          });
        }
        return;
      }

      // 🔍 DEBUG: Проверка на продукты без нутриентов в meals
      const emptyItems = [];
      (payload.meals || []).forEach((meal, mi) => {
        (meal.items || []).forEach((item, ii) => {
          if (isSyntheticEstimatedItem(item)) return;
          if (!item.kcal100 && !item.protein100 && !item.carbs100) {
            emptyItems.push({
              mealIndex: mi,
              itemIndex: ii,
              name: item.name,
              id: item.id,
              product_id: item.product_id,
              grams: item.grams
            });
          }
        });
      });
      if (emptyItems.length > 0) {
        console.warn('⚠️ [AUTOSAVE] Items WITHOUT nutrients being saved:', emptyItems);
        // Попробуем найти продукт в базе для этого item
        emptyItems.forEach(item => {
          const products = HEYS?.products?.getAll?.() || [];
          const found = products.find(p =>
            p.name?.toLowerCase() === item.name?.toLowerCase() ||
            String(p.id) === String(item.product_id)
          );
          if (found) {
            console.info('[HEYS.dayHooks] 🔍 [AUTOSAVE] Found product in DB for empty item:', item.name, {
              dbHasNutrients: !!(found.kcal100 || found.protein100),
              dbKcal100: found.kcal100,
              dbProtein100: found.protein100
            });
          } else {
            console.error('🚨 [AUTOSAVE] Product NOT FOUND in DB for:', item.name);
          }
        });
      }

      // Очищаем фото от base64 перед сохранением
      const cleanedPayload = stripPhotoData(payload);

      const toStore = {
        ...cleanedPayload,
        date: dateStr,
        schemaVersion: payload.schemaVersion != null ? payload.schemaVersion : 3,
        updatedAt: incomingUpdatedAt,
        _sourceId: sourceIdRef.current,
      };

      try {
        lsSetFn(key, toStore);
        if (toStore.isFastingDay || toStore.isIncomplete || current?.isFastingDay || current?.isIncomplete) {
          const storedAfterWrite = readExisting(key);
          console.info('[HEYS.dayRealData] 💾 saveToDate persisted', {
            key,
            date: dateStr,
            storedFlags: {
              isFastingDay: !!storedAfterWrite?.isFastingDay,
              isIncomplete: !!storedAfterWrite?.isIncomplete
            },
            storedUpdatedAt: storedAfterWrite?.updatedAt || 0
          });
        }
        if (channelRef.current && !isUnmountedRef.current) {
          try {
            channelRef.current.postMessage({ type: 'day:update', date: dateStr, payload: toStore });
          } catch (e) { }
        }
      } catch (error) {
        console.error('[AUTOSAVE] localStorage write failed:', error);
      }
    }, [getKey, lsSetFn, now, readExisting, stripPhotoData, isMeaningfulDayData]);

    const flush = React.useCallback((options = {}) => {
      const force = options && options.force === true;
      if (!force && (disabled || isUnmountedRef.current)) return;
      if (!day || !day.date) return;

      if (force) {
        const key = getKey(day.date);
        const existing = readExisting(key);
        if (isMeaningfulDayData(existing) && !isMeaningfulDayData(day)) return;
      }

      const daySnap = JSON.stringify(stripMeta(day));
      if (prevDaySnapRef.current === daySnap) return;

      const updatedAt = day.updatedAt != null ? day.updatedAt : now();

      // Просто сохраняем все приёмы под текущую дату
      // Ночная логика теперь в todayISO() — до 3:00 "сегодня" = вчера
      const payload = {
        ...day,
        updatedAt,
      };
      if (payload.isFastingDay || payload.isIncomplete) {
        console.info('[HEYS.dayRealData] 💾 flush day payload', {
          date: day.date,
          updatedAt,
          flags: {
            isFastingDay: !!payload.isFastingDay,
            isIncomplete: !!payload.isIncomplete
          },
          mealsCount: (payload.meals || []).length
        });
      }
      saveToDate(day.date, payload);
      prevStoredSnapRef.current = JSON.stringify(payload);
      prevDaySnapRef.current = daySnap;
    }, [day, now, saveToDate, stripMeta, disabled, getKey, readExisting, isMeaningfulDayData]);

    React.useEffect(() => {
      // 🔒 ЗАЩИТА: Не инициализируем prevDaySnapRef до гидратации!
      // Иначе после sync данные изменятся, а ref будет содержать старую версию
      if (disabled) return;
      if (!day || !day.date) return;
      // ✅ FIX: getKey ожидает dateStr, а не объект day
      // Иначе получаем ключ вида "heys_dayv2_[object Object]" и ломаем init снапов.
      const key = getKey(day.date);
      const current = readExisting(key);
      if (current) {
        prevStoredSnapRef.current = JSON.stringify(current);
        prevDaySnapRef.current = JSON.stringify(stripMeta(current));
      } else {
        prevDaySnapRef.current = JSON.stringify(stripMeta(day));
      }
    }, [day && day.date, getKey, readExisting, stripMeta, disabled]);

    React.useEffect(() => {
      if (disabled) return; // ЗАЩИТА: не запускать таймер до гидратации
      if (!day || !day.date) return;

      // 🔒 ЗАЩИТА: Инициализируем prevDaySnapRef при первом включении
      // Это предотвращает ложный save сразу после isHydrated=true
      const daySnap = JSON.stringify(stripMeta(day));

      if (prevDaySnapRef.current === null) {
        // Первый запуск после гидратации — просто запоминаем состояние без save
        prevDaySnapRef.current = daySnap;
        return;
      }

      if (prevDaySnapRef.current === daySnap) return;

      // ☁️ Сразу показать что данные изменились (до debounce)
      // Это запустит анимацию синхронизации в облачном индикаторе
      if (typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('heys:data-saved', { detail: { key: 'day', type: 'data' } }));
      }

      global.clearTimeout(timerRef.current);
      timerRef.current = global.setTimeout(flush, debounceMs);
      return () => { global.clearTimeout(timerRef.current); };
    }, [day, debounceMs, flush, stripMeta, disabled]);

    React.useEffect(() => {
      return () => {
        global.clearTimeout(timerRef.current);
        if (!disabled) flush(); // ЗАЩИТА: не сохранять при unmount если не гидратировано
      };
    }, [flush, disabled]);

    React.useEffect(() => {
      const onVisChange = () => {
        if (!disabled && global.document.visibilityState !== 'visible') flush();
      };
      global.document.addEventListener('visibilitychange', onVisChange);
      global.addEventListener('pagehide', flush);
      return () => {
        global.document.removeEventListener('visibilitychange', onVisChange);
        global.removeEventListener('pagehide', flush);
      };
    }, [flush]);

    return { flush };
  }

  // Хук для централизованной детекции мобильных устройств с поддержкой ротации
  function useMobileDetection(breakpoint = 768) {
    const React = getReact();
    const [isMobile, setIsMobile] = React.useState(() => {
      if (typeof window === 'undefined') return false;
      return window.innerWidth <= breakpoint;
    });

    React.useEffect(() => {
      if (typeof window === 'undefined' || !window.matchMedia) return;

      const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);

      const handleChange = (e) => {
        setIsMobile(e.matches);
      };

      // Начальное значение
      setIsMobile(mediaQuery.matches);

      // Подписка на изменения (поддержка ротации экрана)
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else {
        // Fallback для старых браузеров
        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
      }
    }, [breakpoint]);

    return isMobile;
  }

  // 🔧 v3.19.2: Глобальный кэш prefetch для предотвращения повторных запросов
  // Сохраняется между размонтированиями компонента
  const globalPrefetchCache = {
    prefetched: new Set(),
    lastPrefetchTime: 0,
    PREFETCH_COOLDOWN: 5000 // 5 секунд между prefetch
  };

  // Хук для Smart Prefetch — предзагрузка данных ±N дней при наличии интернета
  function useSmartPrefetch({
    currentDate,
    daysRange = 7,  // ±7 дней
    enabled = true
  }) {
    const React = getReact();
    // 🔧 v3.19.2: Используем глобальный кэш вместо локального ref
    const prefetchedRef = React.useRef(globalPrefetchCache.prefetched);
    const utils = getDayUtils();
    const lsGet = utils.lsGet || HEYS.utils?.lsGet;

    // Генерация списка дат для prefetch
    const getDatesToPrefetch = React.useCallback((centerDate) => {
      const dates = [];
      const center = new Date(centerDate);

      for (let i = -daysRange; i <= daysRange; i++) {
        const d = new Date(center);
        d.setDate(d.getDate() + i);
        dates.push(d.toISOString().slice(0, 10));
      }

      return dates;
    }, [daysRange]);

    // Prefetch данных через Supabase (если доступно)
    const prefetchFromCloud = React.useCallback(async (dates) => {
      if (!navigator.onLine) return;
      if (!HEYS.cloud?.isAuthenticated?.()) return;

      // 🔧 v3.19.2: Cooldown защита от частых вызовов
      const now = Date.now();
      if (now - globalPrefetchCache.lastPrefetchTime < globalPrefetchCache.PREFETCH_COOLDOWN) {
        return; // Слишком частые вызовы — пропускаем
      }

      const toFetch = dates.filter(d => !prefetchedRef.current.has(d));
      if (toFetch.length === 0) return;

      try {
        // 🔧 v3.19.2: Обновляем время последнего prefetch
        globalPrefetchCache.lastPrefetchTime = now;

        // Пометим как "в процессе" чтобы избежать дублирования
        toFetch.forEach(d => prefetchedRef.current.add(d));

        // Загружаем данные через cloud sync
        if (HEYS.cloud?.fetchDays) {
          await HEYS.cloud.fetchDays(toFetch);
        }
      } catch (error) {
        // Откатываем пометки при ошибке
        toFetch.forEach(d => prefetchedRef.current.delete(d));
      }
    }, []);

    // Prefetch при смене даты или восстановлении соединения
    React.useEffect(() => {
      if (!enabled || !currentDate) return;

      const dates = getDatesToPrefetch(currentDate);
      prefetchFromCloud(dates);

      // Подписка на восстановление соединения
      const handleOnline = () => {
        prefetchFromCloud(getDatesToPrefetch(currentDate));
      };

      window.addEventListener('online', handleOnline);
      return () => window.removeEventListener('online', handleOnline);
    }, [currentDate, enabled, getDatesToPrefetch, prefetchFromCloud]);

    // Ручной триггер prefetch
    const triggerPrefetch = React.useCallback(() => {
      if (!currentDate) return;
      prefetchedRef.current.clear();
      prefetchFromCloud(getDatesToPrefetch(currentDate));
    }, [currentDate, getDatesToPrefetch, prefetchFromCloud]);

    return { triggerPrefetch };
  }

  // === Exports ===
  HEYS.dayHooks = {
    useDayAutosave,
    useMobileDetection,
    useSmartPrefetch
  };

})(window);
