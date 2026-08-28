// curator-action-diff.js
// Семантический diff OLD vs NEW значения client_kv_store row для логирования
// действий куратора. Возвращает массив action-объектов которые потом идут
// в client_data_changelog.actions JSONB и используются:
//   1) cron'ом для динамического push body ("+1 приём, вес 89→90")
//   2) in-app banner'ом для показа клиенту списка изменений.
//
// Контракт:
//   computeCuratorActionPayload(oldV, newV, key) → {
//     actions: [...],
//     day_kcal_before?: number,  // сумма ккал приёмов old dayv2; пустой день = 0
//     day_kcal_after?: number,
//     day_kcal_by_date?: { [YYYY-MM-DD]: { before?, after? } }
//   }
//   - oldV: JSONB (может быть null если INSERT)
//   - newV: JSONB (всегда не null)
//   - key: string ('heys_dayv2_YYYY-MM-DD' | 'heys_profile' | 'heys_norms' | etc.)
//   - Возврат: { actions: [...] }, пустой массив если no-op.
//     day_kcal_* только для dayv2. Старые changelog rows без полей — легально:
//     клиент рисует шапку даты без калорий.
//   buildChangelogActionsEnvelope(payloads, actionsWithMeta) — JSONB записи
//     client_data_changelog.actions (merge_save и batch_upsert).
//
// Cap: max 50 actions, лишние схлопываются в {type:'truncated',count:N}.

'use strict';

const ACTIONS_CAP = 50;

// 📝 v2 (2026-05-18): whitelist подход.
// В client_kv_store десятки служебных ключей (heys_advice_*, heys_ews_*,
// heys_debug_*, heys_cascade_*, heys_last_grams_*, и т.д.) — они автогенерируются
// при работе curator-вкладки и НЕ являются "действиями куратора" в человеческом
// смысле. Раньше фильтр был blacklist (только heys_push_, heys_ui_, heys_log_)
// и весь мусор протекал в фид. Теперь логируем только семантически значимые ключи.
function isLoggableKey(key) {
  if (typeof key !== 'string') return false;
  if (/^heys_dayv2_\d{4}-\d{2}-\d{2}$/.test(key)) return true;
  if (key === 'heys_profile') return true;
  if (key === 'heys_norms') return true;
  if (key.startsWith('heys_planning_')) return true; // тренировочный план / задачи
  return false;
}

function isServiceKey(key) {
  return !isLoggableKey(key);
}

// ─── Утилиты ─────────────────────────────────────────────────────────

function safeArr(x) { return Array.isArray(x) ? x : []; }
function safeObj(x) { return (x && typeof x === 'object' && !Array.isArray(x)) ? x : null; }

function isNumber(n) { return typeof n === 'number' && Number.isFinite(n); }

// Стабильный ключ meal'a: meal.id > (time+name) fallback.
function mealKey(m) {
  if (!m || typeof m !== 'object') return null;
  if (m.id) return `id:${m.id}`;
  const t = m.time || '';
  const n = m.name || '';
  return `tn:${t}|${n}`;
}

// Тренировка не имеет id, key — это позиция в массиве + activityLabel/type.
// Empty training определяется как: все z[]=0 И нет type И нет activityLabel.
function isEmptyTraining(t) {
  if (!t || typeof t !== 'object') return true;
  const z = safeArr(t.z);
  const sum = z.reduce((s, v) => s + (Number(v) || 0), 0);
  return sum === 0 && !t.type && !t.activityLabel;
}

function trainingLabel(t) {
  if (!t) return 'тренировка';
  return t.activityLabel || t.type || t.kind || 'тренировка';
}

function trainingDurationMin(t) {
  if (!t) return null;
  if (isNumber(t.duration_min)) return t.duration_min;
  if (isNumber(t.duration)) return t.duration;
  const z = safeArr(t.z);
  if (z.length > 0) {
    const sum = z.reduce((s, v) => s + (Number(v) || 0), 0);
    return sum > 0 ? sum : null;
  }
  return null;
}

// ─── Meal payload helpers ────────────────────────────────────────────

// Человеческое имя приёма по mealType. fallback на meal.name если type незнакомый.
const MEAL_TYPE_LABELS = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
  coffee_break: 'Кофе-брейк',
  snack1: 'Перекус',
  snack2: 'Перекус',
  snack3: 'Перекус',
};

function mealTypeLabel(m) {
  if (!m) return 'Приём пищи';
  const byType = MEAL_TYPE_LABELS[m.mealType];
  if (byType) return byType;
  const name = (m.name || '').trim();
  return name || 'Приём пищи';
}

// Совместимость со старым кодом (используется в тестах).
function mealLabel(m) {
  return mealTypeLabel(m);
}

// Расчёт kcal для одного item. Реальная структура HEYS:
//   item.kcal100 * item.grams / 100 (основной путь)
//   item.kcal (если уже посчитан)
//   item.product.kcal100 (legacy fallback)
function computeItemKcal(it) {
  if (!it) return null;
  if (isNumber(it.kcal)) return it.kcal;
  const kcal100 = it.kcal100 ?? it.product?.kcal100;
  const grams = it.grams ?? it.quantity;
  if (isNumber(kcal100) && isNumber(grams)) return (kcal100 * grams) / 100;
  if (isNumber(it.calories)) return it.calories;
  return null;
}

function mealTotalKcal(m) {
  const items = safeArr(m?.items);
  if (items.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const it of items) {
    const k = computeItemKcal(it);
    if (isNumber(k)) { sum += k; any = true; }
  }
  return any ? Math.round(sum) : null;
}

function itemsKcalSum(items) {
  let sum = 0;
  let any = false;
  for (const it of safeArr(items)) {
    const k = computeItemKcal(it);
    if (isNumber(k)) { sum += k; any = true; }
  }
  return any ? Math.round(sum) : null;
}

/** Сумма ккал приёмов дня. Пустой день → 0. Приёмы есть, но ккал не считаются → null. */
function dayMealsKcal(dayV) {
  const day = safeObj(dayV);
  if (!day) return 0;
  const meals = safeArr(day.meals);
  let sum = 0;
  let any = false;
  for (const m of meals) {
    const k = mealTotalKcal(m);
    if (isNumber(k)) { sum += k; any = true; }
  }
  if (any) return Math.round(sum);
  return meals.length === 0 ? 0 : null;
}

function dateFromDayv2Key(key) {
  const m = String(key || '').match(/^heys_dayv2_(\d{4}-\d{2}-\d{2})$/);
  return m ? m[1] : null;
}

// Сохраняем для backward-compat — возвращает то же что mealTotalKcal.
function mealKcal(m) {
  return mealTotalKcal(m);
}

function itemName(it) {
  return it?.product?.name || it?.name || it?.title || '?';
}

function itemGrams(it) {
  const g = it?.grams ?? it?.quantity;
  return isNumber(g) ? g : null;
}

function itemProductId(it) {
  return it?.product_id ?? it?.productId ?? it?.product?.id ?? it?.product?.product_id ?? null;
}

function itemIdentityKey(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.id) return `id:${it.id}`;
  const productId = itemProductId(it);
  if (productId) return `product:${productId}`;
  const name = itemName(it);
  return name && name !== '?' ? `name:${name}` : null;
}

function mealBaseAction(type, meal) {
  const a = {
    type,
    meal_label: mealTypeLabel(meal),
    meal_name: meal?.name || mealTypeLabel(meal),
  };
  if (meal?.id) a.meal_id = meal.id;
  if (meal?.time) a.time = meal.time;
  return a;
}

// Сжатый список items для payload: name + grams, без 30 жиро-витаминных полей.
function mealItemsSummary(items, maxItems = 12) {
  const arr = safeArr(items);
  return arr.slice(0, maxItems).map((it) => {
    const obj = { name: itemName(it) };
    if (it?.id) obj.item_id = it.id;
    const productId = itemProductId(it);
    if (productId) obj.product_id = productId;
    const g = itemGrams(it);
    if (g !== null) obj.grams = g;
    return obj;
  });
}

function buildItemChangedAction(meal, oldItem, newItem) {
  const oldName = itemName(oldItem);
  const newName = itemName(newItem);
  const oldGrams = itemGrams(oldItem);
  const newGrams = itemGrams(newItem);
  const a = mealBaseAction('meal_item_changed', meal);
  const itemId = newItem?.id || oldItem?.id;
  const productId = itemProductId(newItem) || itemProductId(oldItem);
  if (itemId) a.item_id = itemId;
  if (productId) a.product_id = productId;
  a.name = newName || oldName || '?';
  if (oldName !== newName) {
    a.from_name = oldName;
    a.to_name = newName;
  }
  if (oldGrams !== null && newGrams !== null && Math.abs(oldGrams - newGrams) >= 0.5) {
    a.from_grams = oldGrams;
    a.to_grams = newGrams;
    const fromKcal = computeItemKcal(oldItem);
    const toKcal = computeItemKcal(newItem);
    if (isNumber(fromKcal) && isNumber(toKcal)) {
      a.from_kcal = Math.round(fromKcal);
      a.to_kcal = Math.round(toKcal);
      a.kcal_delta = a.to_kcal - a.from_kcal;
    }
  }
  return (a.from_name !== undefined || a.from_grams !== undefined) ? a : null;
}

// ─── dayv2 diff ──────────────────────────────────────────────────────

function diffMeals(oldMeals, newMeals, actions) {
  const oldArr = safeArr(oldMeals);
  const newArr = safeArr(newMeals);
  const oldMap = new Map();
  for (const m of oldArr) {
    const k = mealKey(m);
    if (k) oldMap.set(k, m);
  }
  const newKeys = new Set();

  // Added / Changed
  for (const nm of newArr) {
    const k = mealKey(nm);
    if (!k) continue;
    newKeys.add(k);
    const oldMeal = oldMap.get(k);
    const newItems = safeArr(nm.items);
    const newItemsLen = newItems.length;

    if (!oldMeal) {
      // Meal added (только если есть items, иначе пустой плейсхолдер).
      if (newItemsLen > 0) {
        const a = mealBaseAction('meal_added', nm);
        a.name = mealTypeLabel(nm); // backward-compat для banner / push
        a.items = mealItemsSummary(newItems);
        const total = mealTotalKcal(nm);
        if (total !== null) a.kcal = total;
        actions.push(a);
      }
      continue;
    }

    const oldItems = safeArr(oldMeal.items);
    const oldItemsLen = oldItems.length;

    if (oldItemsLen === 0 && newItemsLen > 0) {
      // Был пустой meal — стал заполнен → "added"
      const a = mealBaseAction('meal_added', nm);
      a.name = mealTypeLabel(nm);
      a.items = mealItemsSummary(newItems);
      const total = mealTotalKcal(nm);
      if (total !== null) a.kcal = total;
      actions.push(a);
    } else if (newItemsLen < oldItemsLen && newItemsLen === 0) {
      const removed = { type: 'meal_removed', name: mealTypeLabel(oldMeal), meal_label: mealTypeLabel(oldMeal) };
      if (oldMeal.time) removed.time = oldMeal.time;
      const removedKcal = mealTotalKcal(oldMeal);
      if (isNumber(removedKcal) && removedKcal > 0) removed.kcal = removedKcal;
      actions.push(removed);
    } else {
      const oldItemsByKey = new Map();
      const newItemsByKey = new Map();
      for (const it of oldItems) {
        const key = itemIdentityKey(it);
        if (key && !oldItemsByKey.has(key)) oldItemsByKey.set(key, it);
      }
      for (const it of newItems) {
        const key = itemIdentityKey(it);
        if (key && !newItemsByKey.has(key)) newItemsByKey.set(key, it);
      }

      const added = [];
      for (const it of newItems) {
        const key = itemIdentityKey(it);
        if (!key || !oldItemsByKey.has(key)) added.push(it);
      }
      if (added.length > 0) {
        const a = mealBaseAction('meal_item_added', nm);
        a.items = mealItemsSummary(added);
        a.count = added.length;
        const addedKcal = itemsKcalSum(added);
        if (isNumber(addedKcal)) a.kcal_delta = addedKcal;
        actions.push(a);
      }

      const removed = [];
      for (const it of oldItems) {
        const key = itemIdentityKey(it);
        if (!key || !newItemsByKey.has(key)) removed.push(it);
      }
      if (removed.length > 0) {
        const a = mealBaseAction('meal_item_removed', nm);
        a.items = mealItemsSummary(removed);
        a.count = removed.length;
        const removedKcal = itemsKcalSum(removed);
        if (isNumber(removedKcal)) a.kcal_delta = -removedKcal;
        actions.push(a);
      }

      for (const [key, oldItem] of oldItemsByKey) {
        const newItem = newItemsByKey.get(key);
        if (!newItem) continue;
        const changed = buildItemChangedAction(nm, oldItem, newItem);
        if (changed) actions.push(changed);
      }
    }
  }

  // Removed (был в old, нет в new)
  for (const om of oldArr) {
    const k = mealKey(om);
    if (!k) continue;
    if (newKeys.has(k)) continue;
    if (safeArr(om.items).length > 0) {
      const removed = { type: 'meal_removed', name: mealTypeLabel(om), meal_label: mealTypeLabel(om) };
      if (om.time) removed.time = om.time;
      const removedKcal = mealTotalKcal(om);
      if (isNumber(removedKcal) && removedKcal > 0) removed.kcal = removedKcal;
      actions.push(removed);
    }
  }
}

function diffTrainings(oldTr, newTr, actions) {
  const oldArr = safeArr(oldTr);
  const newArr = safeArr(newTr);
  const maxLen = Math.max(oldArr.length, newArr.length);
  for (let i = 0; i < maxLen; i++) {
    const o = oldArr[i];
    const n = newArr[i];
    const oEmpty = isEmptyTraining(o);
    const nEmpty = isEmptyTraining(n);
    if (oEmpty && !nEmpty) {
      const a = { type: 'training_added', kind: trainingLabel(n), training_index: i };
      const d = trainingDurationMin(n);
      if (d) a.duration_min = d;
      if (n && n.time) a.time = n.time;
      actions.push(a);
    } else if (!oEmpty && nEmpty) {
      actions.push({ type: 'training_removed', kind: trainingLabel(o), training_index: i });
    }
  }
}

function diffScalar(oldVal, newVal, type, actions, opts = {}) {
  const cmp = opts.numericTolerance ?? 0;
  const oIsN = isNumber(oldVal);
  const nIsN = isNumber(newVal);
  if (nIsN && (!oIsN || Math.abs(oldVal - newVal) > cmp)) {
    const a = { type };
    if (oIsN) a.from = oldVal;
    a.to = newVal;
    actions.push(a);
  } else if (oIsN && !nIsN && opts.allowClear) {
    actions.push({ type, from: oldVal, to: null });
  }
}

function diffDayv2(oldV, newV, actions) {
  const oldDay = safeObj(oldV) || {};
  const newDay = safeObj(newV) || {};
  diffMeals(oldDay.meals, newDay.meals, actions);
  diffTrainings(oldDay.trainings, newDay.trainings, actions);
  diffSupplementTakenMarks(oldDay.supplementsTaken, newDay.supplementsTaken, actions);
  diffScalar(oldDay.weightMorning, newDay.weightMorning, 'weight_set', actions, { numericTolerance: 0.05 });
  // Поле блоба дня называется steps (heys-mcp/lib/day.js, apps/web) — по
  // stepsCount диф молчал, и кураторская правка шагов не попадала в фид.
  diffScalar(oldDay.steps, newDay.steps, 'steps_set', actions, { numericTolerance: 50 });
  const oSleepH = computeSleepHours(oldDay);
  const nSleepH = computeSleepHours(newDay);
  diffScalar(oSleepH, nSleepH, 'sleep_set', actions, { numericTolerance: 0.1 });
  diffScalar(oldDay.waterMl, newDay.waterMl, 'water_set', actions, { numericTolerance: 50 });
}

function normalizeSupplementIds(value) {
  const ids = safeArr(value)
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function supplementIdSetsEqual(left, right) {
  const a = normalizeSupplementIds(left);
  const b = normalizeSupplementIds(right);
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}

function supplementSettingsChanged(oldSettings, newSettings, supplementIds) {
  const oldMap = safeObj(oldSettings) || {};
  const newMap = safeObj(newSettings) || {};
  return normalizeSupplementIds(supplementIds)
    .some((id) => !deepEqual(oldMap[id], newMap[id]));
}

function diffSupplementCourse(oldV, newV, actions) {
  const oldProfile = safeObj(oldV) || {};
  const newProfile = safeObj(newV) || {};
  const oldIds = normalizeSupplementIds(oldProfile.plannedSupplements);
  const newIds = normalizeSupplementIds(newProfile.plannedSupplements);

  if (oldIds.length === 0 && newIds.length > 0) {
    actions.push({ type: 'supplement_course_assigned', supplement_ids: newIds });
    return;
  }
  if (oldIds.length > 0 && newIds.length === 0) {
    actions.push({ type: 'supplement_course_cancelled', supplement_ids: oldIds });
    return;
  }
  if (oldIds.length === 0 || newIds.length === 0) return;

  const addedIds = newIds.filter((id) => !oldIds.includes(id));
  const removedIds = oldIds.filter((id) => !newIds.includes(id));
  const settingsChanged = supplementSettingsChanged(
    oldProfile.supplementSettings,
    newProfile.supplementSettings,
    [...oldIds, ...newIds],
  );
  if (!supplementIdSetsEqual(oldIds, newIds) || settingsChanged) {
    actions.push({
      type: 'supplement_course_changed',
      supplement_ids: newIds,
      ...(addedIds.length > 0 ? { added_ids: addedIds } : {}),
      ...(removedIds.length > 0 ? { removed_ids: removedIds } : {}),
      ...(settingsChanged ? { settings_changed: true } : {}),
    });
  }
}

function diffSupplementTakenMarks(oldTaken, newTaken, actions) {
  const oldIds = normalizeSupplementIds(oldTaken);
  const newSet = new Set(normalizeSupplementIds(newTaken));
  oldIds.forEach((id) => {
    if (!newSet.has(id)) {
      actions.push({ type: 'supplement_mark_removed', supplement_id: id });
    }
  });
}

function computeSleepHours(day) {
  if (!day) return null;
  if (isNumber(day.sleepHours)) return day.sleepHours;
  const start = day.sleepStart;
  const end = day.sleepEnd;
  if (!start || !end) return null;
  const ps = parseHHMM(start);
  const pe = parseHHMM(end);
  if (ps === null || pe === null) return null;
  let mins = pe - ps;
  if (mins < 0) mins += 24 * 60; // crossed midnight
  return Math.round((mins / 60) * 10) / 10;
}

function parseHHMM(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

// ─── profile / norms diff ────────────────────────────────────────────

function diffObjectFields(oldV, newV, type, actions, opts = {}) {
  const oldObj = safeObj(oldV) || {};
  const newObj = safeObj(newV) || {};
  const ignored = new Set(opts.ignoreFields || ['updatedAt', 'updated_at']);
  const changed = [];
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);
  for (const k of allKeys) {
    if (ignored.has(k)) continue;
    const oldVal = oldObj[k];
    const newVal = newObj[k];
    if (!deepEqual(oldVal, newVal)) changed.push(k);
  }
  if (changed.length > 0) {
    actions.push({ type, fields: changed.slice(0, 10) });
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// ─── Public API ──────────────────────────────────────────────────────

function computeCuratorActionPayload(oldV, newV, key) {
  if (!isLoggableKey(key)) return { actions: [] };
  const actions = [];

  if (/^heys_dayv2_\d{4}-\d{2}-\d{2}$/.test(key)) {
    diffDayv2(oldV, newV, actions);
  } else if (key === 'heys_profile') {
    diffSupplementCourse(oldV, newV, actions);
    diffObjectFields(oldV, newV, 'profile_changed', actions, {
      ignoreFields: ['updatedAt', 'updated_at', 'plannedSupplements', 'supplementSettings'],
    });
  } else if (key === 'heys_norms') {
    diffObjectFields(oldV, newV, 'norms_changed', actions);
  } else if (key.startsWith('heys_planning_')) {
    if (!deepEqual(oldV, newV)) {
      actions.push({ type: 'planning_changed' });
    }
  }

  let resultActions = actions;
  if (actions.length > ACTIONS_CAP) {
    const head = actions.slice(0, ACTIONS_CAP - 1);
    const rest = actions.length - head.length;
    head.push({ type: 'truncated', count: rest });
    resultActions = head;
  }

  const result = { actions: resultActions };
  attachDayKcalFields(result, oldV, newV, key);
  return result;
}

function attachDayKcalFields(result, oldV, newV, key) {
  const date = dateFromDayv2Key(key);
  if (!date) return;
  const before = dayMealsKcal(oldV);
  const after = dayMealsKcal(newV);
  if (isNumber(before)) result.day_kcal_before = before;
  if (isNumber(after)) result.day_kcal_after = after;
  if (!isNumber(before) && !isNumber(after)) return;
  result.day_kcal_by_date = {
    [date]: {
      ...(isNumber(before) ? { before } : {}),
      ...(isNumber(after) ? { after } : {}),
    },
  };
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/** Собирает JSONB envelope changelog из одного или нескольких payload. */
function buildChangelogActionsEnvelope(payloads, actionsWithMeta) {
  const list = Array.isArray(payloads) ? payloads.filter(Boolean) : [];
  const envelope = { actions: Array.isArray(actionsWithMeta) ? actionsWithMeta : [] };
  const byDate = {};
  for (const payload of list) {
    if (payload.day_kcal_by_date && typeof payload.day_kcal_by_date === 'object') {
      Object.assign(byDate, payload.day_kcal_by_date);
    }
  }
  const dates = Object.keys(byDate);
  if (dates.length === 1) {
    const slice = byDate[dates[0]] || {};
    if (isFiniteNumber(slice.before)) envelope.day_kcal_before = slice.before;
    if (isFiniteNumber(slice.after)) envelope.day_kcal_after = slice.after;
  }
  if (dates.length > 0) envelope.day_kcal_by_date = byDate;
  return envelope;
}

module.exports = {
  computeCuratorActionPayload,
  buildChangelogActionsEnvelope,
  _internal: {
    diffDayv2,
    diffMeals,
    diffTrainings,
    diffSupplementCourse,
    diffSupplementTakenMarks,
    computeSleepHours,
    parseHHMM,
    deepEqual,
    isServiceKey,
    isLoggableKey,
    mealKey,
    mealTypeLabel,
    mealLabel,
	    mealTotalKcal,
	    mealKcal,
	    dayMealsKcal,
	    dateFromDayv2Key,
	    mealItemsSummary,
	    itemIdentityKey,
	    isEmptyTraining,
	  },
	};
