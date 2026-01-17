// heys_cloud_merge_v1.js — merge helpers for cloud sync
; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const cloud = HEYS.cloud = HEYS.cloud || {};

  function getLogger() {
    const logger = cloud._log || {};
    return {
      log: logger.log || function () { },
      logCritical: logger.logCritical || function () { },
    };
  }

  function mergeItemsById(remoteItems = [], localItems = [], preferLocal = true) {
    if (!preferLocal) {
      return remoteItems.filter(item => item && item.id);
    }

    const itemsMap = new Map();
    remoteItems.forEach(item => {
      if (item && item.id) {
        itemsMap.set(item.id, item);
      }
    });

    localItems.forEach(item => {
      if (item && item.id) {
        itemsMap.set(item.id, item);
      }
    });

    return Array.from(itemsMap.values());
  }

  function mergeDayData(local, remote, options = {}) {
    const { log, logCritical } = getLogger();
    const forceKeepAll = options.forceKeepAll || false;
    const preferRemote = options.preferRemote || false;

    const normalizeTrainings = (trainings = []) => trainings.map((t = {}) => {
      if (t.quality !== undefined || t.feelAfter !== undefined) {
        const { quality, feelAfter, ...rest } = t;
        return {
          ...rest,
          mood: rest.mood ?? quality ?? 5,
          wellbeing: rest.wellbeing ?? feelAfter ?? 5,
          stress: rest.stress ?? 5
        };
      }
      return t;
    });

    local = {
      ...local,
      trainings: normalizeTrainings(local?.trainings)
    };
    remote = {
      ...remote,
      trainings: normalizeTrainings(remote?.trainings)
    };

    if (!local || !remote) return null;

    const localJson = JSON.stringify({ ...local, updatedAt: 0, _sourceId: '' });
    const remoteJson = JSON.stringify({ ...remote, updatedAt: 0, _sourceId: '' });
    if (localJson === remoteJson) return null;

    const merged = {
      ...remote,
      date: local.date || remote.date,
      updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0, Date.now()),
      _mergedAt: Date.now(),
    };

    merged.steps = Math.max(local.steps || 0, remote.steps || 0);
    merged.waterMl = Math.max(local.waterMl || 0, remote.waterMl || 0);

    if ((local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.householdMin = local.householdMin ?? remote.householdMin ?? 0;
      merged.householdTime = local.householdTime ?? remote.householdTime ?? '';
      merged.householdActivities = local.householdActivities || remote.householdActivities || undefined;
    } else {
      merged.householdMin = remote.householdMin ?? local.householdMin ?? 0;
      merged.householdTime = remote.householdTime ?? local.householdTime ?? '';
      merged.householdActivities = remote.householdActivities || local.householdActivities || undefined;
    }

    if (local.weightMorning && remote.weightMorning) {
      merged.weightMorning = (local.updatedAt || 0) >= (remote.updatedAt || 0)
        ? local.weightMorning
        : remote.weightMorning;
    } else {
      merged.weightMorning = local.weightMorning || remote.weightMorning || 0;
    }

    merged.sleepStart = local.sleepStart || remote.sleepStart || '';
    merged.sleepEnd = local.sleepEnd || remote.sleepEnd || '';
    merged.sleepQuality = local.sleepQuality || remote.sleepQuality || '';
    merged.sleepNote = local.sleepNote || remote.sleepNote || '';

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

    if (local.cycleDay === null && (local.updatedAt || 0) >= (remote.updatedAt || 0)) {
      merged.cycleDay = null;
    } else if (remote.cycleDay === null && (remote.updatedAt || 0) > (local.updatedAt || 0)) {
      merged.cycleDay = null;
    } else {
      merged.cycleDay = local.cycleDay || remote.cycleDay || null;
    }

    const localMeals = local.meals || [];
    const remoteMeals = remote.meals || [];
    const mealsMap = new Map();
    const localMealIds = new Set(localMeals.filter(m => m?.id).map(m => m.id));
    const localIsNewer = (local.updatedAt || 0) >= (remote.updatedAt || 0);

    remoteMeals.forEach(meal => {
      if (!meal || !meal.id) return;

      if (!forceKeepAll && !preferRemote && localIsNewer && !localMealIds.has(meal.id)) {
        log(`🗑️ [MERGE] Meal ${meal.id} deleted locally, skipping from remote`);
        return;
      }

      mealsMap.set(meal.id, meal);
    });

    localMeals.forEach(meal => {
      if (!meal || !meal.id) return;
      const existing = mealsMap.get(meal.id);
      if (!existing) {
        mealsMap.set(meal.id, meal);
      } else {
        const preferLocal = preferRemote ? false : localIsNewer;
        const mergedItems = mergeItemsById(existing.items || [], meal.items || [], preferLocal);
        const mergedMeal = preferRemote
          ? { ...meal, ...existing, items: mergedItems }
          : localIsNewer
            ? { ...existing, ...meal, items: mergedItems }
            : { ...meal, ...existing, items: mergedItems };
        mealsMap.set(meal.id, mergedMeal);
      }
    });

    merged.meals = Array.from(mealsMap.values())
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const localTrainings = local.trainings || [];
    const remoteTrainings = remote.trainings || [];
    merged.trainings = [];

    const localIsNewerForTrainings = (local.updatedAt || 0) >= (remote.updatedAt || 0);

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
      } else {
        winner = rt;
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
        feelAfter: undefined
      };

      merged.trainings.push(winner);
    }

    log('🔀 [MERGE] Result:', {
      meals: merged.meals.length,
      steps: merged.steps,
      water: merged.waterMl,
      trainings: merged.trainings.filter(t => t.z?.some(z => z > 0)).length
    });

    return merged;
  }

  function mergeProductsData(localProducts, remoteProducts) {
    const { log, logCritical } = getLogger();
    const local = Array.isArray(localProducts) ? localProducts : [];
    const remote = Array.isArray(remoteProducts) ? remoteProducts : [];

    const normalizeName = (name) => String(name || '').trim().toLowerCase();

    const isValidProduct = (p) => {
      if (!p) return false;
      const name = normalizeName(p.name);
      return name.length > 0;
    };

    const getProductScore = (p) => {
      let score = 0;
      if (p.id) score += 1;
      if (p.name) score += 2;
      if (p.kcal100 > 0) score += 1;
      if (p.protein100 > 0) score += 1;
      if (p.carbs100 > 0 || p.simple100 > 0 || p.complex100 > 0) score += 1;
      if (p.fat100 > 0 || p.badFat100 > 0 || p.goodFat100 > 0) score += 1;
      if (p.fiber100 > 0) score += 1;
      if (p.gi > 0) score += 1;
      if (p.portions && p.portions.length > 0) score += 2;
      if (p.createdAt) score += 1;
      return score;
    };

    const isBetterProduct = (p1, p2) => {
      const score1 = getProductScore(p1);
      const score2 = getProductScore(p2);
      if (score1 !== score2) return score1 > score2;
      const time1 = p1.createdAt || 0;
      const time2 = p2.createdAt || 0;
      return time1 > time2;
    };

    const dedupeArray = (arr, source) => {
      const seen = new Map();
      const duplicates = [];

      arr.forEach(p => {
        if (!isValidProduct(p)) return;
        const key = normalizeName(p.name);
        const existing = seen.get(key);

        if (!existing) {
          seen.set(key, p);
        } else {
          duplicates.push({ name: p.name, source });
          if (isBetterProduct(p, existing)) {
            seen.set(key, p);
          }
        }
      });

      if (duplicates.length > 0) {
        logCritical(`⚠️ [MERGE] Found ${duplicates.length} duplicate(s) in ${source}: ${duplicates.map(d => `"${d.name}"`).join(', ')}`);
      }

      return Array.from(seen.values());
    };

    const localDeduped = dedupeArray(local, 'local');
    const remoteDeduped = dedupeArray(remote, 'remote');

    if (localDeduped.length === 0) return remoteDeduped;
    if (remoteDeduped.length === 0) return localDeduped;

    const resultMap = new Map();

    remoteDeduped.forEach(p => {
      const key = normalizeName(p.name);
      resultMap.set(key, p);
    });

    let addedFromLocal = 0;
    let updatedFromLocal = 0;

    localDeduped.forEach(p => {
      const key = normalizeName(p.name);
      const existing = resultMap.get(key);

      if (!existing) {
        resultMap.set(key, p);
        addedFromLocal++;
      } else if (isBetterProduct(p, existing)) {
        resultMap.set(key, p);
        updatedFromLocal++;
      }
    });

    const merged = Array.from(resultMap.values());

    const localDupes = local.length - localDeduped.length;
    const remoteDupes = remote.length - remoteDeduped.length;
    const totalDupes = localDupes + remoteDupes;

    const stats = {
      local: local.length,
      localDeduped: localDeduped.length,
      remote: remote.length,
      remoteDeduped: remoteDeduped.length,
      merged: merged.length,
      addedFromLocal,
      updatedFromLocal,
      duplicatesRemoved: totalDupes
    };

    const delta = merged.length - remoteDeduped.length;
    logCritical(`🔀 [MERGE PRODUCTS] local: ${stats.local}${localDupes ? ` (−${localDupes} dupes)` : ''}, remote: ${stats.remote}${remoteDupes ? ` (−${remoteDupes} dupes)` : ''} → merged: ${merged.length} (${delta >= 0 ? '+' : ''}${delta})`);

    if (addedFromLocal > 0 || updatedFromLocal > 0) {
      log(`📦 [MERGE] Added ${addedFromLocal} new, updated ${updatedFromLocal} existing`);
    }

    return merged;
  }

  HEYS.CloudMerge = HEYS.CloudMerge || {};
  HEYS.CloudMerge.mergeItemsById = mergeItemsById;
  HEYS.CloudMerge.mergeDayData = mergeDayData;
  HEYS.CloudMerge.mergeProductsData = mergeProductsData;
})(window);
