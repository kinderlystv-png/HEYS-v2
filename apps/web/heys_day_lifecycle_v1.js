// heys_day_lifecycle_v1.js — Day lifecycle management (hydration, sync, refs)
// Extracted from heys_day_v12.js (PR-3)
// Handles day data loading from localStorage and cloud sync

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;

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

  /**
   * Custom hook for day data hydration and synchronization
   * Manages loading day from localStorage, cloud sync, and event handling
   * 
   * @param {Object} params - Hook parameters
   * @param {string} params.date - Current date (YYYY-MM-DD)
   * @param {Object} params.prof - User profile
   * @param {Function} params.lsGet - localStorage getter
   * @param {Function} params.lsSet - localStorage setter
   * @param {Function} params.ensureDay - Day data normalizer
   * @param {Object} params.cloud - Cloud sync client
   * @param {string} params.clientId - Current client ID
   * @param {Function} params.flush - Flush function to save current day
   * @returns {Object} { day, setDay, isHydrated, refs }
   */
  function useDayHydration(params) {
    const {
      date,
      prof,
      lsGet,
      lsSet,
      ensureDay,
      cloud,
      clientId,
      flush
    } = params;

    const { useState, useEffect, useRef } = React;

    // State
    const [isHydrated, setIsHydrated] = useState(false);
    const [dayRaw, setDayRaw] = useState(() => {
      const key = 'heys_dayv2_' + date;
      const v = lsGet ? lsGet(key, null) : storeGet(key, null);
      return v && v.date ? ensureDay(v, prof) : ensureDay({ date }, prof);
    });

    // Refs for sync coordination
    const prevDateRef = useRef(date);
    const lastLoadedUpdatedAtRef = useRef(0);
    const blockCloudUpdatesUntilRef = useRef(0);
    const isSyncingRef = useRef(false);
    const lastProcessedEventRef = useRef({ date: null, source: null, timestamp: 0 });

    // Effect 1: Register flush function with global API
    useEffect(() => {
      if (!HEYS.Day) HEYS.Day = {};
      HEYS.Day.requestFlush = flush;
      HEYS.Day.isBlockingCloudUpdates = () => Date.now() < blockCloudUpdatesUntilRef.current;
      HEYS.Day.getBlockUntil = () => blockCloudUpdatesUntilRef.current;
      HEYS.Day.setBlockCloudUpdates = (until) => { blockCloudUpdatesUntilRef.current = until; };
      HEYS.Day.setLastLoadedUpdatedAt = (ts) => { lastLoadedUpdatedAtRef.current = ts; };

      return () => {
        if (HEYS.Day && HEYS.Day.requestFlush === flush) {
          delete HEYS.Day.requestFlush;
          delete HEYS.Day.isBlockingCloudUpdates;
          delete HEYS.Day.getBlockUntil;
          delete HEYS.Day.setBlockCloudUpdates;
          delete HEYS.Day.setLastLoadedUpdatedAt;
        }
      };
    }, [flush]);

    // Effect 2: Save current date to storage
    useEffect(() => {
      if (lsSet) {
        lsSet('heys_dayv2_date', date);
      } else {
        storeSet('heys_dayv2_date', date);
      }
    }, [date, lsSet]);

    // Effect 3: Load day data from localStorage and cloud when date changes
    useEffect(() => {
      let cancelled = false;

      // Save current day before switching dates
      const dateActuallyChanged = prevDateRef.current !== date;
      if (dateActuallyChanged && HEYS.Day && typeof HEYS.Day.requestFlush === 'function') {
        console.info(`[HEYS] 📅 Смена даты: ${prevDateRef.current} → ${date}, сохраняем предыдущий день...`);
        HEYS.Day.requestFlush();
      }
      prevDateRef.current = date;

      setIsHydrated(false);
      lastLoadedUpdatedAtRef.current = 0;

      const doLocal = () => {
        if (cancelled) return;
        const profNow = prof || {};
        const key = 'heys_dayv2_' + date;
        const v = lsGet ? lsGet(key, null) : storeGet(key, null);

        if (v && v.date) {
          // Protection: don't overwrite newer data
          if (v.updatedAt && lastLoadedUpdatedAtRef.current > 0 && v.updatedAt < lastLoadedUpdatedAtRef.current) {
            return; // Skip outdated local data
          }

          const normalized = ensureDay(v, profNow);
          lastLoadedUpdatedAtRef.current = v.updatedAt || 0;
          setDayRaw(normalized);
        } else {
          setDayRaw(ensureDay({ date }, profNow));
        }
        setIsHydrated(true);
      };

      // Load from localStorage first
      doLocal();

      // Then try cloud sync if available
      if (cloud && clientId) {
        const doCloud = async () => {
          if (cancelled) return;
          if (isSyncingRef.current) return;

          try {
            isSyncingRef.current = true;
            const resp = await cloud.rpc('getDayData', { date, clientId });

            if (cancelled) return;
            if (resp && resp.data && resp.data.date === date) {
              const cloudData = resp.data;
              const cloudUpdatedAt = cloudData.updatedAt || 0;

              // Only use cloud data if it's newer
              if (cloudUpdatedAt > lastLoadedUpdatedAtRef.current) {
                const normalized = ensureDay(cloudData, prof);
                lastLoadedUpdatedAtRef.current = cloudUpdatedAt;
                setDayRaw(normalized);
              }
            }
          } catch (err) {
            if (!cancelled) {
              console.warn('[HEYS] Sync failed, using local cache:', err?.message || err);
            }
          } finally {
            isSyncingRef.current = false;
          }
        };

        doCloud();
      }

      return () => { cancelled = true; };
    }, [date, prof, lsGet, ensureDay, cloud, clientId]);

    // Effect 4: Handle heys:day-updated events
    useEffect(() => {
      const handleDayUpdated = (event) => {
        const { date: eventDate, source, data, syncTimestampOnly, updatedAt } = event.detail || {};

        if (eventDate !== date) return; // Not for current date

        // v25.8.6.1: Handle timestamp-only sync (prevent fetchDays overwrite)
        if (syncTimestampOnly && updatedAt) {
          const newTimestamp = Math.max(lastLoadedUpdatedAtRef.current || 0, updatedAt);
          lastLoadedUpdatedAtRef.current = newTimestamp;
          console.info(`[HEYS.day] ⏱️ Timestamp ref synced: ${newTimestamp} (source: ${source})`);
          return; // Don't reload day, just updated timestamp ref
        }

        // Deduplicate events
        const now = Date.now();
        if (lastProcessedEventRef.current.date === eventDate &&
          lastProcessedEventRef.current.source === source &&
          now - lastProcessedEventRef.current.timestamp < 100) {
          return; // Skip duplicate
        }
        lastProcessedEventRef.current = { date: eventDate, source, timestamp: now };

        if (data && data.date === date) {
          const normalized = ensureDay(data, prof);
          const dataUpdatedAt = data.updatedAt || 0;

          // Only update if data is newer
          if (dataUpdatedAt > lastLoadedUpdatedAtRef.current) {
            lastLoadedUpdatedAtRef.current = dataUpdatedAt;
            setDayRaw(normalized);
          }
        }
      };

      window.addEventListener('heys:day-updated', handleDayUpdated);
      return () => {
        window.removeEventListener('heys:day-updated', handleDayUpdated);
      };
    }, [date, prof, ensureDay]);

    return {
      day: dayRaw,
      setDay: setDayRaw,
      isHydrated,
      refs: {
        prevDateRef,
        lastLoadedUpdatedAtRef,
        blockCloudUpdatesUntilRef,
        isSyncingRef,
        lastProcessedEventRef
      }
    };
  }

  // Export
  HEYS.dayLifecycle = {
    useDayHydration
  };

})(window);
