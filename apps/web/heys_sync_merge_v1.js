/**
 * heys_sync_merge_v1.js — Pure merge logic for HEYS day/scalar KV blobs.
 *
 * Used by:
 *   - Browser: HEYS.sync.mergeDayData (called from bootstrapClientSync during
 *     cloud→local pull and from save-time routing).
 *   - Server: yandex-cloud-functions/heys-api-rpc/lib/heys_sync_merge_v1.js
 *     (same file copied at deploy time; merges incoming with current cloud
 *     version inside a Postgres transaction).
 *
 * Pure functions — no side effects on window/global. Optional helpers passed
 * via options (logFn, hashFn, workoutLogHasTrackableContent).
 *
 * UMD wrapper so the same file works as <script> (registers HEYS.sync) and
 * as `require('./heys_sync_merge_v1.js')` from Node.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const api = factory();
    root.HEYS = root.HEYS || {};
    root.HEYS.sync = Object.assign(root.HEYS.sync || {}, api);
  }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // ─── mergeItemsById ──────────────────────────────────────────────────────
  function mergeItemsById(remoteItems = [], localItems = [], preferLocal = true) {
    if (!preferLocal) {
      // preferRemote: only remote items survive — required for cross-device deletions on pull-refresh
      return remoteItems.filter((item) => item && item.id);
    }
    const itemsMap = new Map();
    remoteItems.forEach((item) => {
      if (item && item.id) itemsMap.set(item.id, item);
    });
    localItems.forEach((item) => {
      if (item && item.id) itemsMap.set(item.id, item);
    });
    return Array.from(itemsMap.values());
  }

  // ─── unionMaxTimestamp ────────────────────────────────────────────────
  // Merge two { id: timestamp } maps, keeping max timestamp per id.
  // Used for meal tombstones (deletedMealIds) — both sides may have
  // independent deletion records; merge keeps the latest deletion per id.
  function unionMaxTimestamp(localMap, remoteMap) {
    const out = { ...(remoteMap || {}) };
    if (localMap) {
      for (const id of Object.keys(localMap)) {
        out[id] = Math.max(out[id] || 0, localMap[id] || 0);
      }
    }
    return out;
  }

  // ─── stripStaleSavedDisplayNutrientsIfEmptyDiary ─────────────────────────
  // Removes cached display nutrients when meals/items are empty (same invariant
  // as dayMealsIntegrity).
  function stripStaleSavedDisplayNutrientsIfEmptyDiary(dayObj) {
    if (!dayObj || typeof dayObj !== 'object') return dayObj;
    const meals = Array.isArray(dayObj.meals) ? dayObj.meals : [];
    const hasItems = meals.some((m) => Array.isArray(m && m.items) && m.items.length > 0);
    if (hasItems) return dayObj;
    const next = { ...dayObj };
    delete next.savedEatenKcal;
    delete next.savedDisplayOptimum;
    delete next.savedEatenProt;
    delete next.savedEatenCarbs;
    delete next.savedEatenFat;
    delete next.savedEatenFiber;
    return next;
  }

  // ─── mergeDayData ────────────────────────────────────────────────────────
  //
  // Options:
  //   forceKeepAll: bool — pull-to-refresh mode, keep ALL meals (no deletion detection)
  //   preferRemote: bool — pull-to-refresh, remote wins for items/meals
  //   logFn: function — optional logger (defaults to no-op)
  //   hashFn: function(day) → string — optional content hash to skip identical merges
  //   workoutLogHasTrackableContent: function(workoutLog) → bool — optional richness check
  //
  function mergeDayData(local, remote, options) {
    options = options || {};
    const forceKeepAll = !!options.forceKeepAll;
    const preferRemote = !!options.preferRemote;
    const logFn = typeof options.logFn === 'function' ? options.logFn : function () {};
    const hashFn = typeof options.hashFn === 'function' ? options.hashFn : null;
    const workoutLogHasTrackableContent =
      typeof options.workoutLogHasTrackableContent === 'function'
        ? options.workoutLogHasTrackableContent
        : null;

    // Normalize trainings (quality/feelAfter → mood/wellbeing/stress)
    const normalizeTrainings = (trainings) =>
      (trainings || []).map((t) => {
        t = t || {};
        if (t.quality !== undefined || t.feelAfter !== undefined) {
          const { quality, feelAfter, ...rest } = t;
          return {
            ...rest,
            mood: rest.mood !== undefined ? rest.mood : (quality !== undefined ? quality : 5),
            wellbeing:
              rest.wellbeing !== undefined ? rest.wellbeing : (feelAfter !== undefined ? feelAfter : 5),
            stress: rest.stress !== undefined ? rest.stress : 5,
          };
        }
        return t;
      });

    if (!local || !remote) return null;

    local = { ...local, trainings: normalizeTrainings(local && local.trainings) };
    remote = { ...remote, trainings: normalizeTrainings(remote && remote.trainings) };

    // Skip if content-identical
    if (hashFn) {
      const localHash = hashFn(local);
      const remoteHash = hashFn(remote);
      if (localHash === remoteHash) return null;
    } else {
      const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
      const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
      if (localJson === remoteJson) return null;
    }

    const merged = {
      ...remote,
      date: remote.date || local.date,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
      _mergedAt: Date.now(),
    };

    // Numeric fields: steps/water → max; householdMin → freshest
    merged.steps = Math.max(local.steps || 0, remote.steps || 0);
    merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);

    if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.householdMin = local.householdMin != null ? local.householdMin : (remote.householdMin != null ? remote.householdMin : 0);
      merged.householdTime = local.householdTime != null ? local.householdTime : (remote.householdTime != null ? remote.householdTime : '');
      merged.householdActivities = local.householdActivities || remote.householdActivities || undefined;
    } else {
      merged.householdMin = remote.householdMin != null ? remote.householdMin : (local.householdMin != null ? local.householdMin : 0);
      merged.householdTime = remote.householdTime != null ? remote.householdTime : (local.householdTime != null ? local.householdTime : '');
      merged.householdActivities = remote.householdActivities || local.householdActivities || undefined;
    }

    // Morning weight: prefer non-zero, prefer freshest if both set
    if (local.weightMorning && remote.weightMorning) {
      merged.weightMorning =
        (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local.weightMorning : remote.weightMorning;
    } else {
      merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
    }

    // Sleep: non-empty wins
    merged.sleepStart = local.sleepStart || remote.sleepStart || '';
    merged.sleepEnd = local.sleepEnd || remote.sleepEnd || '';
    merged.sleepQuality = local.sleepQuality || remote.sleepQuality || '';
    merged.sleepNote = local.sleepNote || remote.sleepNote || '';

    // Day score: manual override wins
    if (local.dayScoreManual) {
      merged.dayScore = local.dayScore;
      merged.dayScoreManual = true;
    } else if (remote.dayScoreManual) {
      merged.dayScore = remote.dayScore;
      merged.dayScoreManual = true;
    } else {
      merged.dayScore = local.dayScore || remote.dayScore || '';
    }
    merged.dayComment = local.dayComment || remote.dayComment || '';

    // Cycle: explicit null reset preserved if it came from the fresher side
    if (local.cycleDay === null && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.cycleDay = null;
    } else if (remote.cycleDay === null && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      merged.cycleDay = null;
    } else {
      merged.cycleDay = local.cycleDay || remote.cycleDay || null;
    }

    // ─── Meals: merge by id with deletion detection ────────────────────────
    const localMeals = local.meals || [];
    const remoteMeals = remote.meals || [];
    const mealsMap = new Map();
    const localMealIds = new Set(localMeals.filter((m) => m && m.id).map((m) => m.id));
    const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    // Tombstone-aware deletion handling. Applied ALWAYS (even when forceKeepAll/preferRemote)
    // because tombstones are explicit user actions — flags only control implicit deletion heuristic.
    const localDeletedMealIds = (local.deletedMealIds && typeof local.deletedMealIds === 'object' && !Array.isArray(local.deletedMealIds)) ? local.deletedMealIds : {};
    const remoteDeletedMealIds = (remote.deletedMealIds && typeof remote.deletedMealIds === 'object' && !Array.isArray(remote.deletedMealIds)) ? remote.deletedMealIds : {};
    const mergedDeletedMealIds = unionMaxTimestamp(localDeletedMealIds, remoteDeletedMealIds);
    const dayLocalTs = local.updatedAt || 0;
    const dayRemoteTs = remote.updatedAt || 0;

    // morningActivation: 'done'/'missed' status takes priority
    {
      const localMA = local.morningActivation || null;
      const remoteMA = remote.morningActivation || null;
      const localMAStatus = localMA && localMA.status;
      const remoteMAStatus = remoteMA && remoteMA.status;
      if (localMAStatus === 'done' || localMAStatus === 'missed') {
        merged.morningActivation = localMA;
      } else if (remoteMAStatus === 'done' || remoteMAStatus === 'missed') {
        merged.morningActivation = remoteMA;
      } else if (localIsNewer) {
        merged.morningActivation = localMA != null ? localMA : (remoteMA != null ? remoteMA : null);
      } else {
        merged.morningActivation = remoteMA != null ? remoteMA : (localMA != null ? localMA : null);
      }
    }

    // Remote meals first (will be overwritten by local if collision)
    remoteMeals.forEach((meal) => {
      if (!meal || !meal.id) return;
      // Tombstone check: if explicit deletion is newer than this meal's last edit, skip it
      const tombstoneTs = mergedDeletedMealIds[meal.id];
      const mealTs = meal.updatedAt || dayRemoteTs;
      if (tombstoneTs && tombstoneTs >= mealTs) {
        logFn(`🪦 [MERGE] Meal ${meal.id} tombstoned (${tombstoneTs} >= ${mealTs}), skipping from remote`);
        return;
      }
      if (!forceKeepAll && !preferRemote && localIsNewer && !localMealIds.has(meal.id)) {
        // Local is fresher and this meal isn't in local → deleted by user
        logFn(`🗑️ [MERGE] Meal ${meal.id} deleted locally, skipping from remote`);
        return;
      }
      mealsMap.set(meal.id, meal);
    });

    // Local meals: merge items if both sides have the meal
    localMeals.forEach((meal) => {
      if (!meal || !meal.id) return;
      // Tombstone check: if remote (other device) has newer deletion mark, skip local meal too
      const tombstoneTs = mergedDeletedMealIds[meal.id];
      const mealTs = meal.updatedAt || dayLocalTs;
      if (tombstoneTs && tombstoneTs >= mealTs) {
        logFn(`🪦 [MERGE] Meal ${meal.id} tombstoned (${tombstoneTs} >= ${mealTs}), skipping from local`);
        return;
      }
      const existing = mealsMap.get(meal.id);
      if (!existing) {
        mealsMap.set(meal.id, meal);
      } else {
        // ─── meal-level merge ────────────────────────────────────────────
        // Use meal.updatedAt for finer-grained "who edited THIS meal more recently"
        // (Phase 2). Falls back to day.updatedAt for legacy data without meal.updatedAt.
        const localMealTs = meal.updatedAt || local.updatedAt || 0;
        const remoteMealTs = existing.updatedAt || remote.updatedAt || 0;
        const mealLocalIsNewer = localMealTs >= remoteMealTs;
        const preferLocal = preferRemote ? false : mealLocalIsNewer;

        const mergedItems = mergeItemsById(existing.items || [], meal.items || [], preferLocal);

        const mergedMeal = preferRemote
          ? { ...meal, ...existing, items: mergedItems }
          : mealLocalIsNewer
            ? { ...existing, ...meal, items: mergedItems }
            : { ...meal, ...existing, items: mergedItems };
        // Preserve the freshest meal-level updatedAt
        mergedMeal.updatedAt = Math.max(localMealTs, remoteMealTs) || undefined;
        mealsMap.set(meal.id, mergedMeal);
      }
    });

    merged.meals = Array.from(mealsMap.values()).sort((a, b) =>
      (a.time || '').localeCompare(b.time || '')
    );
    merged.deletedMealIds = mergedDeletedMealIds;

    // ─── Trainings: position-indexed merge ────────────────────────────────
    const localTrainings = local.trainings || [];
    const remoteTrainings = remote.trainings || [];
    merged.trainings = [];
    const localIsNewerForTrainings = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    const isMorningActivationTrainingRow = (t) => {
      if (!t || typeof t !== 'object') return false;
      if (t.source === 'morning_activation') return true;
      const lab = String(t.activityLabel || '').trim().toLowerCase();
      return lab === 'зарядка';
    };
    const localMaStatusForTrainings = local.morningActivation && local.morningActivation.status;
    const protectLocalMorningActivationRow =
      localMaStatusForTrainings === 'done' || localMaStatusForTrainings === 'missed';

    const workoutLogRichness = (t) => {
      if (!t || !t.workoutLog || typeof t.workoutLog !== 'object') return 0;
      const wl = t.workoutLog;
      const n = Array.isArray(wl.exercises) ? wl.exercises.length : 0;
      let score = n * 10;
      if (n > 1) score += 5;
      if (Array.isArray(wl.zoneMinutes) && wl.zoneMinutes.some((m) => +m > 0)) score += 100;
      try {
        if (workoutLogHasTrackableContent && workoutLogHasTrackableContent(wl)) score += 1000;
      } catch (e) {
        /* noop */
      }
      return score;
    };

    const maxTrainings = Math.max(localTrainings.length, remoteTrainings.length, 3);
    for (let i = 0; i < maxTrainings; i++) {
      const lt = localTrainings[i] || { z: [0, 0, 0, 0] };
      const rt = remoteTrainings[i] || { z: [0, 0, 0, 0] };
      const ltSum = (lt.z || []).reduce((a, b) => a + (b || 0), 0);
      const rtSum = (rt.z || []).reduce((a, b) => a + (b || 0), 0);

      let winner;
      if (localIsNewerForTrainings) {
        winner = lt;
      } else if (ltSum === 0 && rtSum > 0) {
        winner = rt;
      } else if (rtSum === 0 && ltSum > 0) {
        winner = lt;
      } else if (ltSum === 0 && rtSum === 0) {
        const lRich = workoutLogRichness(lt);
        const rRich = workoutLogRichness(rt);
        if (lRich > rRich) winner = lt;
        else if (rRich > lRich) winner = rt;
        else if (lRich > 0 && rRich > 0) winner = lt;
        else if (
          protectLocalMorningActivationRow &&
          isMorningActivationTrainingRow(lt) &&
          !isMorningActivationTrainingRow(rt)
        ) {
          winner = lt;
        } else {
          winner = rt;
        }
      } else {
        if (
          protectLocalMorningActivationRow &&
          isMorningActivationTrainingRow(lt) &&
          !isMorningActivationTrainingRow(rt)
        ) {
          winner = lt;
        } else {
          winner = rt;
        }
      }
      const loser = winner === lt ? rt : lt;

      const getMergedRating = (field) => {
        const wVal = winner[field];
        const lVal = loser[field];
        if (wVal !== undefined) return wVal;
        if (lVal !== undefined) return lVal;
        return undefined;
      };

      winner = {
        ...winner,
        mood: getMergedRating('mood'),
        wellbeing: getMergedRating('wellbeing'),
        stress: getMergedRating('stress'),
        quality: undefined,
        feelAfter: undefined,
      };

      merged.trainings.push(winner);
    }

    logFn('🔀 [MERGE] Result:', {
      meals: merged.meals.length,
      steps: merged.steps,
      water: merged.waterMl,
      trainings: merged.trainings.filter((t) => t.z && t.z.some((z) => z > 0)).length,
    });

    return stripStaleSavedDisplayNutrientsIfEmptyDiary(merged);
  }

  // ─── mergeScalarKv ───────────────────────────────────────────────────────
  // Generic shallow merge for KV blobs like heys_norms, heys_profile.
  // Each top-level field's "winner" is decided by parent-level updatedAt:
  //   - Object values: deep-merge (newer overlay on older, retains both halves)
  //   - Scalar/array values: pick from whichever side has fresher updatedAt
  //
  // Both sides must have `updatedAt` at the root (caller's responsibility).
  // For backward compat: if a side has no `updatedAt`, treats it as 0 (so the
  // other side always wins).
  function mergeScalarKv(incoming, current) {
    if (incoming == null) return current;
    if (current == null) return incoming;
    if (typeof incoming !== 'object' || typeof current !== 'object') {
      // Non-object → newer wins
      const incomingTs = (incoming && incoming.updatedAt) || 0;
      const currentTs = (current && current.updatedAt) || 0;
      return incomingTs >= currentTs ? incoming : current;
    }
    if (Array.isArray(incoming) || Array.isArray(current)) {
      // Arrays → fresher wins atomically (no positional merging)
      const incomingTs = (incoming && incoming.updatedAt) || 0;
      const currentTs = (current && current.updatedAt) || 0;
      return incomingTs >= currentTs ? incoming : current;
    }

    const incomingTs = incoming.updatedAt || 0;
    const currentTs = current.updatedAt || 0;
    const incomingIsNewer = incomingTs >= currentTs;

    // Start from the older side, then overlay fresher fields.
    const base = incomingIsNewer ? current : incoming;
    const overlay = incomingIsNewer ? incoming : current;
    const merged = { ...base };

    Object.keys(overlay).forEach((key) => {
      if (key === '_meta' || key === '_sourceId') return; // skip metadata on root
      const overlayVal = overlay[key];
      const baseVal = base[key];
      if (
        overlayVal &&
        baseVal &&
        typeof overlayVal === 'object' &&
        typeof baseVal === 'object' &&
        !Array.isArray(overlayVal) &&
        !Array.isArray(baseVal)
      ) {
        // Nested object → shallow merge. 🛡️ FIX 2026-05-23: ранее использовался
        // прямой `{ ...baseVal, ...overlayVal }` — overlay затирал nested
        // `_meta`/`_sourceId` который должен быть locally-controlled (как и
        // на root-level). Теперь стартуем с base (все его поля включая
        // metadata), оверлеем только non-metadata keys из overlay.
        // Это симметрично с root-level skip на строке 377.
        const nestedMerged = { ...baseVal };
        Object.keys(overlayVal).forEach((nk) => {
          if (nk === '_meta' || nk === '_sourceId') return;
          nestedMerged[nk] = overlayVal[nk];
        });
        merged[key] = nestedMerged;
      } else {
        // Scalar / array → take from overlay (fresher side)
        merged[key] = overlayVal;
      }
    });

    merged.updatedAt = Math.max(incomingTs, currentTs, Date.now());
    return merged;
  }

  return {
    mergeDayData,
    mergeItemsById,
    mergeScalarKv,
    stripStaleSavedDisplayNutrientsIfEmptyDiary,
  };
});
