// curator-action-diff.js
// Семантический diff OLD vs NEW значения client_kv_store row для логирования
// действий куратора. Возвращает массив action-объектов которые потом идут
// в client_data_changelog.actions JSONB и используются:
//   1) cron'ом для динамического push body ("+1 приём, вес 89→90")
//   2) in-app banner'ом для показа клиенту списка изменений.
//
// Контракт:
//   computeCuratorActionPayload(oldV, newV, key) → { actions: [...] }
//   - oldV: JSONB (может быть null если INSERT)
//   - newV: JSONB (всегда не null)
//   - key: string ('heys_dayv2_YYYY-MM-DD' | 'heys_profile' | 'heys_norms' | etc.)
//   - Возврат: { actions: [...] }, пустой массив если no-op.
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

// Backward-compat alias (использовался в тестах). Возвращает true для НЕ-loggable.
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

// Имя приёма пищи для отображения. Если meal.name типичный ("Приём", "Завтрак" и т.д.)
// и есть items с продуктом — берём первый продукт как описание.
function mealLabel(m) {
  if (!m) return 'приём пищи';
  const name = (m.name || '').trim();
  const items = safeArr(m.items);
  if (items.length > 0) {
    const first = items[0];
    const pname = first?.product?.name || first?.name || first?.title;
    if (pname) {
      const qty = first.quantity || first.grams;
      const qtyStr = isNumber(qty) ? ` ${qty} г` : '';
      return `${pname}${qtyStr}`;
    }
  }
  return name || 'приём пищи';
}

// Считаем kcal для meal'a из items (если есть). Optional.
function mealKcal(m) {
  const items = safeArr(m?.items);
  if (items.length === 0) return null;
  let sum = 0;
  let any = false;
  for (const it of items) {
    const k = it?.kcal ?? it?.calories ?? it?.product?.kcal;
    if (isNumber(k)) { sum += k; any = true; }
  }
  return any ? Math.round(sum) : null;
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
    if (!oldMeal) {
      // Meal added (only counts if has any items, иначе пустой "Приём" не event)
      if (safeArr(nm.items).length > 0) {
        const a = { type: 'meal_added', name: mealLabel(nm) };
        const kc = mealKcal(nm);
        if (kc !== null) a.kcal = kc;
        actions.push(a);
      }
      continue;
    }
    // Diff items внутри meal'a (added items).
    const oldItemsLen = safeArr(oldMeal.items).length;
    const newItemsLen = safeArr(nm.items).length;
    if (oldItemsLen === 0 && newItemsLen > 0) {
      // Был пустой meal — стал с едой, это "added" а не "item_added"
      const a = { type: 'meal_added', name: mealLabel(nm) };
      const kc = mealKcal(nm);
      if (kc !== null) a.kcal = kc;
      actions.push(a);
    } else if (newItemsLen > oldItemsLen) {
      // Добавлены items к существующему meal'у — фиксируем разницу
      const added = newItemsLen - oldItemsLen;
      actions.push({
        type: 'meal_item_added',
        meal_name: nm.name || mealLabel(nm),
        count: added,
      });
    } else if (newItemsLen < oldItemsLen && newItemsLen === 0) {
      actions.push({ type: 'meal_removed', name: mealLabel(oldMeal) });
    }
  }

  // Removed (был в old, нет в new)
  for (const om of oldArr) {
    const k = mealKey(om);
    if (!k) continue;
    if (newKeys.has(k)) continue;
    // Считаем как removed только если had items.
    if (safeArr(om.items).length > 0) {
      actions.push({ type: 'meal_removed', name: mealLabel(om) });
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
      const a = { type: 'training_added', kind: trainingLabel(n) };
      const d = trainingDurationMin(n);
      if (d) a.duration_min = d;
      actions.push(a);
    } else if (!oEmpty && nEmpty) {
      actions.push({ type: 'training_removed', kind: trainingLabel(o) });
    }
    // Изменение существующей тренировки (без add/remove) не репортим — слишком гранулярно.
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
  diffScalar(oldDay.weightMorning, newDay.weightMorning, 'weight_set', actions, { numericTolerance: 0.05 });
  diffScalar(oldDay.stepsCount, newDay.stepsCount, 'steps_set', actions, { numericTolerance: 50 });
  // sleep: считаем часы из sleepStart/sleepEnd ИЛИ из sleepHours напрямую если есть.
  const oSleepH = computeSleepHours(oldDay);
  const nSleepH = computeSleepHours(newDay);
  diffScalar(oSleepH, nSleepH, 'sleep_set', actions, { numericTolerance: 0.1 });
  diffScalar(oldDay.waterMl, newDay.waterMl, 'water_set', actions, { numericTolerance: 50 });
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
    actions.push({ type, fields: changed.slice(0, 10) }); // cap fields list
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
    diffObjectFields(oldV, newV, 'profile_changed', actions);
  } else if (key === 'heys_norms') {
    diffObjectFields(oldV, newV, 'norms_changed', actions);
  } else if (key.startsWith('heys_planning_')) {
    // Planning: показываем факт правки без детализации (структура сложная).
    if (!deepEqual(oldV, newV)) {
      actions.push({ type: 'planning_changed' });
    }
  }

  if (actions.length > ACTIONS_CAP) {
    const head = actions.slice(0, ACTIONS_CAP - 1);
    const rest = actions.length - head.length;
    head.push({ type: 'truncated', count: rest });
    return { actions: head };
  }
  return { actions };
}

module.exports = {
  computeCuratorActionPayload,
  // exported for tests
  _internal: {
    diffDayv2,
    diffMeals,
    diffTrainings,
    computeSleepHours,
    parseHHMM,
    deepEqual,
    isServiceKey,
    isLoggableKey,
    mealKey,
    isEmptyTraining,
  },
};
