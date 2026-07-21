// heys_day_mutation_guard_v1.js — shared guard against stale dayv2 rollback writes.
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});
  const PREFIX = 'heys_day_mutation_guard_';
  const TTL_MS = 2 * 60 * 1000;
  const TRACE_KEYS = {
    copyMutations: 'heys_day_diag_copy_mutations',
    uploadRehydrates: 'heys_day_diag_upload_rehydrates',
  };

  function normalizeIds(values) {
    return Array.isArray(values) ? values.map(String).filter(Boolean) : [];
  }

  function collectIds(day) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    return {
      mealIds: meals.map((meal) => meal?.id).filter(Boolean),
      itemIds: meals.flatMap((meal) => (meal?.items || []).map((item) => item?.id)).filter(Boolean),
    };
  }

  function summarize(day) {
    const meals = Array.isArray(day?.meals) ? day.meals : [];
    const ids = collectIds(day);
    return {
      date: day?.date || null,
      updatedAt: day?.updatedAt || null,
      meals: meals.length,
      items: meals.reduce((sum, meal) => sum + ((meal?.items || []).length), 0),
      mealIds: ids.mealIds.slice(-8),
      itemIds: ids.itemIds.slice(-16),
    };
  }

  function write(dateStr, guard) {
    if (!dateStr) return null;
    const now = Date.now();
    const payload = {
      date: dateStr,
      ts: now,
      expiresAt: now + TTL_MS,
      ...(guard || {}),
    };
    try {
      HEYS._dayMutationGuards = HEYS._dayMutationGuards || {};
      HEYS._dayMutationGuards[dateStr] = payload;
    } catch (_) { /* noop */ }
    try {
      global.sessionStorage?.setItem?.(PREFIX + dateStr, JSON.stringify(payload));
    } catch (_) { /* noop */ }
    return payload;
  }

  function read(dateStr) {
    if (!dateStr) return null;
    const now = Date.now();
    let guard = null;
    try {
      guard = HEYS._dayMutationGuards && HEYS._dayMutationGuards[dateStr];
    } catch (_) { /* noop */ }
    if (!guard) {
      try {
        const raw = global.sessionStorage?.getItem?.(PREFIX + dateStr);
        if (raw) guard = JSON.parse(raw);
      } catch (_) { /* noop */ }
    }
    if (!guard || Number(guard.expiresAt || 0) <= now) return null;
    return guard;
  }

  function verify(day, guard) {
    const summary = summarize(day);
    const ids = collectIds(day);
    const mealIds = new Set(ids.mealIds.map(String));
    const itemIds = new Set(ids.itemIds.map(String));
    const expectedMealIds = normalizeIds(guard?.expectedMealIds);
    const expectedItemIds = normalizeIds(guard?.expectedItemIds);
    const expectedAbsentMealIds = normalizeIds(guard?.expectedAbsentMealIds);
    const expectedAbsentItemIds = normalizeIds(guard?.expectedAbsentItemIds);
    const missingMeals = expectedMealIds.filter((id) => !mealIds.has(id));
    const missingItems = expectedItemIds.filter((id) => !itemIds.has(id));
    const unexpectedMeals = expectedAbsentMealIds.filter((id) => mealIds.has(id));
    const unexpectedItems = expectedAbsentItemIds.filter((id) => itemIds.has(id));
    const ok = missingMeals.length === 0
      && missingItems.length === 0
      && unexpectedMeals.length === 0
      && unexpectedItems.length === 0
      && summary.meals >= Number(guard?.expectedMinMeals || 0)
      && summary.items >= Number(guard?.expectedMinItems || 0);

    return {
      ok,
      summary,
      missingMeals,
      missingItems,
      unexpectedMeals,
      unexpectedItems,
    };
  }

  function breaksGuard(day, guard) {
    return !!guard && !verify(day, guard).ok;
  }

  function delta(before, after) {
    const beforeIds = collectIds(before);
    const afterIds = collectIds(after);
    const beforeMealIds = new Set(beforeIds.mealIds);
    const beforeItemIds = new Set(beforeIds.itemIds);
    const afterMealIds = new Set(afterIds.mealIds);
    const afterItemIds = new Set(afterIds.itemIds);
    return {
      expectedMealIds: afterIds.mealIds.filter((id) => !beforeMealIds.has(id)),
      expectedItemIds: afterIds.itemIds.filter((id) => !beforeItemIds.has(id)),
      expectedAbsentMealIds: beforeIds.mealIds.filter((id) => !afterMealIds.has(id)),
      expectedAbsentItemIds: beforeIds.itemIds.filter((id) => !afterItemIds.has(id)),
    };
  }

  function assessExternalReplacement(current, incoming) {
    if (!current || typeof current !== 'object' || !incoming || typeof incoming !== 'object') {
      return {
        safe: true,
        reason: 'missing_comparable_day',
        missingMealIds: [],
        missingItemIds: [],
        staleMealTombstoneIds: [],
        staleItemTombstoneIds: [],
        legacyMealsDropped: 0,
        legacyItemsDropped: 0,
      };
    }

    const currentMeals = Array.isArray(current.meals) ? current.meals : [];
    const incomingMeals = Array.isArray(incoming.meals) ? incoming.meals : [];
    const incomingMealIds = new Set(incomingMeals.map((meal) => meal?.id).filter(Boolean).map(String));
    const incomingItemIds = new Set(incomingMeals
      .flatMap((meal) => (Array.isArray(meal?.items) ? meal.items : []))
      .map((item) => item?.id)
      .filter(Boolean)
      .map(String));
    const deletedMealIds = incoming.deletedMealIds && typeof incoming.deletedMealIds === 'object'
      ? incoming.deletedMealIds : {};
    const deletedItemIds = incoming.deletedItemIds && typeof incoming.deletedItemIds === 'object'
      ? incoming.deletedItemIds : {};

    const missingMealIds = [];
    const missingItemIds = [];
    const staleMealTombstoneIds = [];
    const staleItemTombstoneIds = [];
    const coveredMealIds = new Set();

    currentMeals.forEach((meal) => {
      if (!meal?.id || incomingMealIds.has(String(meal.id))) return;
      const id = String(meal.id);
      const tombstoneTs = Number(deletedMealIds[id]) || 0;
      const entityTs = Number(meal.updatedAt) || Number(current.updatedAt) || 0;
      if (tombstoneTs > 0 && tombstoneTs >= entityTs) {
        coveredMealIds.add(id);
        return;
      }
      missingMealIds.push(id);
      if (tombstoneTs > 0) staleMealTombstoneIds.push(id);
    });

    currentMeals.forEach((meal) => {
      if (meal?.id && coveredMealIds.has(String(meal.id))) return;
      (Array.isArray(meal?.items) ? meal.items : []).forEach((item) => {
        if (!item?.id || incomingItemIds.has(String(item.id))) return;
        const id = String(item.id);
        const tombstoneTs = Number(deletedItemIds[id]) || 0;
        // Keep parity with mergeItemsById: legacy items without updatedAt are
        // covered by any explicit positive tombstone; newer item edits win.
        const entityTs = Number(item.updatedAt) || 0;
        if (tombstoneTs > 0 && tombstoneTs >= entityTs) return;
        missingItemIds.push(id);
        if (tombstoneTs > 0) staleItemTombstoneIds.push(id);
      });
    });

    const currentLegacyMeals = currentMeals.filter((meal) => !meal?.id).length;
    const incomingLegacyMeals = incomingMeals.filter((meal) => !meal?.id).length;
    const legacyMealsDropped = Math.max(0, currentLegacyMeals - incomingLegacyMeals);
    const countLegacyItems = (meals) => meals.reduce((sum, meal) => {
      return sum + (Array.isArray(meal?.items) ? meal.items.filter((item) => !item?.id).length : 0);
    }, 0);
    const currentLegacyItems = countLegacyItems(currentMeals.filter((meal) => {
      return !meal?.id || !coveredMealIds.has(String(meal.id));
    }));
    const incomingLegacyItems = countLegacyItems(incomingMeals);
    const legacyItemsDropped = Math.max(0, currentLegacyItems - incomingLegacyItems);
    const safe = missingMealIds.length === 0
      && missingItemIds.length === 0
      && legacyMealsDropped === 0
      && legacyItemsDropped === 0;

    return {
      safe,
      reason: safe ? 'no_untombstoned_drop' : 'untombstoned_drop',
      missingMealIds,
      missingItemIds,
      staleMealTombstoneIds,
      staleItemTombstoneIds,
      legacyMealsDropped,
      legacyItemsDropped,
    };
  }

  function resolveExternalReplacement(current, incoming, options) {
    const opts = options || {};
    const directAssessment = assessExternalReplacement(current, incoming);
    if (!current || typeof current !== 'object') {
      return { ok: true, status: 'incoming', value: incoming, assessment: directAssessment };
    }
    if (!incoming || typeof incoming !== 'object') {
      return { ok: false, status: 'blocked', value: current, assessment: directAssessment };
    }

    try {
      if (typeof opts.isSameContent === 'function' && opts.isSameContent(current, incoming)) {
        return { ok: true, status: 'noop', value: current, assessment: directAssessment };
      }
    } catch (_) { /* continue through the safe resolver */ }

    if (typeof opts.mergeDayData === 'function') {
      try {
        const merged = opts.mergeDayData(current, incoming);
        if (merged && typeof merged === 'object') {
          const mergedAssessment = assessExternalReplacement(current, merged);
          if (!mergedAssessment.safe) {
            return { ok: false, status: 'blocked', value: current, assessment: mergedAssessment };
          }
          try {
            if (typeof opts.isSameContent === 'function' && opts.isSameContent(incoming, merged)) {
              return { ok: true, status: 'incoming', value: incoming, assessment: mergedAssessment };
            }
            if (typeof opts.isSameContent === 'function' && opts.isSameContent(current, merged)) {
              return { ok: true, status: 'noop', value: current, assessment: mergedAssessment };
            }
          } catch (_) { /* write the verified merge */ }
          return { ok: true, status: 'merged', value: merged, assessment: mergedAssessment };
        }
        // A provided merge callback returning no value after the explicit
        // content-equality check means conflict resolution was unavailable or
        // failed to produce a verified candidate. Do not fall back to wholesale
        // replacement: that would bypass entity-level timestamps.
        return { ok: false, status: 'blocked', value: current, assessment: directAssessment };
      } catch (_) {
        return { ok: false, status: 'blocked', value: current, assessment: directAssessment };
      }
    }

    return directAssessment.safe
      ? { ok: true, status: 'incoming', value: incoming, assessment: directAssessment }
      : { ok: false, status: 'blocked', value: current, assessment: directAssessment };
  }

  function mergeProtectedFields(dateStr, candidate, current, fields, opts) {
    const guard = read(dateStr);
    if (!guard || !breaksGuard(candidate, guard)) {
      return { day: candidate, protected: false, guard: guard || null };
    }
    if (!current || breaksGuard(current, guard)) {
      return { day: null, protected: true, blocked: true, guard };
    }

    const fieldList = normalizeIds(fields);
    if (!fieldList.length) {
      return { day: null, protected: true, blocked: true, guard };
    }

    const next = {
      ...current,
      date: current?.date || candidate?.date || dateStr,
      updatedAt: candidate?.updatedAt || Date.now(),
    };
    fieldList.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(candidate || {}, field)) {
        next[field] = candidate[field];
      }
    });
    if (opts?.copyUpdatedAtFields) {
      normalizeIds(opts.copyUpdatedAtFields).forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(candidate || {}, field)) {
          next[field] = candidate[field];
        }
      });
    }

    pushTrace('copyMutations', {
      action: opts?.action || 'merge_protected_fields',
      targetDate: dateStr,
      phase: 'protected_field_merge',
      guard,
      before: summarize(current),
      intended: summarize(candidate),
      readBack: summarize(next),
      fields: fieldList,
    }, '[HEYS.day.copyTrace]');

    return { day: next, protected: true, merged: true, guard };
  }

  function pushTrace(kind, entry, consoleLabel) {
    const row = { ts: Date.now(), ...(entry || {}) };
    try {
      const b = (HEYS._dayDiagBuffers = HEYS._dayDiagBuffers || {});
      if (!Array.isArray(b[kind])) b[kind] = [];
      b[kind].push(row);
      if (b[kind].length > 80) b[kind].shift();
    } catch (_) { /* diagnostics only */ }
    try {
      const storageKey = TRACE_KEYS[kind];
      if (storageKey) {
        const raw = global.sessionStorage?.getItem?.(storageKey);
        const rows = raw ? JSON.parse(raw) : [];
        const next = (Array.isArray(rows) ? rows : []).concat(row).slice(-80);
        global.sessionStorage?.setItem?.(storageKey, JSON.stringify(next));
      }
    } catch (_) { /* diagnostics only */ }
    try {
      if (consoleLabel) console.info(consoleLabel, row);
    } catch (_) { /* noop */ }
    return row;
  }

  function dateFromDayKey(key) {
    const match = String(key || '').match(/dayv2_(\d{4}-\d{2}-\d{2})$/);
    return match && match[1] || null;
  }

  HEYS.dayMutationGuard = {
    PREFIX,
    TTL_MS,
    TRACE_KEYS,
    collectIds,
    summarize,
    write,
    read,
    verify,
    breaksGuard,
    delta,
    assessExternalReplacement,
    resolveExternalReplacement,
    mergeProtectedFields,
    pushTrace,
    dateFromDayKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
