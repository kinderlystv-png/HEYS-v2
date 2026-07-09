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
    mergeProtectedFields,
    pushTrace,
    dateFromDayKey,
  };
})(typeof window !== 'undefined' ? window : globalThis);
