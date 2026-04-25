// heys_content_hash_v1.js — Foundation 0: content-addressed identity layer.
//
// Зачем: paттерн «JSON.stringify(весь день) для сравнения отпечатка» на горячих путях
// (autosave, mergeDayData, EWS scoring) — O(meals × items) на каждый тик.
// Замена через FNV-1a + per-item кэш `_h` поля в meal/training/supplement даёт
// 5-21× speedup в steady state (бенчмарк tmp/heys-bench/content_hash_bench.mjs).
//
// API:
//   HEYS.contentHash.fnv1a(str)          — базовый hash, возвращает hex строку (8 chars)
//   HEYS.contentHash.hashMeal(meal)      — hash приёма пищи, обновляет meal._h
//   HEYS.contentHash.hashItem(item)      — hash meal item / training / supplement
//   HEYS.contentHash.hashDay(day)        — комбинированный hash дня (use cached _h)
//   HEYS.contentHash.invalidateMeal(m)   — сбросить meal._h, форсируя пересчёт
//   HEYS.contentHash.combine(...hashes)  — комбинировать произвольный набор хешей
//
// Дизайн:
//   • _h — string поле, исключается из user-visible payload
//   • При мутации items/nutrients вызывать invalidateMeal(m) перед save
//   • hashDay переиспользует все meal._h без stringify
//
// БЕЗОПАСНОСТЬ:
//   • Hash коллизии возможны (32-bit). Для perf-сравнения это ОК — false equal приведёт
//     к редкому пропуску save, но user data не теряется (на следующем save проверка повторится).
//   • Для криптографических задач НЕ использовать.
//
(function (global) {
  'use strict';
  const HEYS = global.HEYS = global.HEYS || {};

  // ── FNV-1a 32-bit ────────────────────────────────────────────────────────
  // Простой и быстрый — на JS оказался не медленнее xxhash32, на 30% проще.
  function fnv1a(str) {
    if (str == null) return '00000000';
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Уплотняем до 8 hex для коротких ключей кэша
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  // ── per-item hash ────────────────────────────────────────────────────────
  // Используется для meal items, trainings, supplements.
  // Не модифицирует item — возвращает hash. Caller сам кладёт в `_h`.
  // ВАЖНО: исключаем `_h` из stringify, иначе fallback path `t._h = h` (enumerable)
  // приведёт к разным хешам между runs (1-й run без _h, 2-й с _h в payload).
  function hashItem(item) {
    if (!item) return '00000000';
    if (item._h !== undefined) {
      const { _h, ...rest } = item;
      return fnv1a(JSON.stringify(rest));
    }
    return fnv1a(JSON.stringify(item));
  }

  // ── meal hash ────────────────────────────────────────────────────────────
  // Кэшируется в meal._h. Если присутствует и не помечен dirty — переиспользуется.
  function hashMeal(meal) {
    if (!meal) return '00000000';
    if (typeof meal._h === 'string' && meal._h.length === 8) return meal._h;
    // Сериализуем БЕЗ _h (если осталось от старой версии) и БЕЗ id (id стабильный)
    const { _h, ...rest } = meal;
    const h = fnv1a(JSON.stringify(rest));
    // Безопасная мутация: добавляем _h non-enumerable, чтобы не уехало в JSON.stringify
    // основного payload (который сам не использует stripMeta — типа upload в облако).
    try {
      Object.defineProperty(meal, '_h', {
        value: h,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    } catch (_) {
      meal._h = h; // fallback: если объект frozen, просто игнорируем
    }
    return h;
  }

  // Инвалидация: вызывать перед save если меняли items/nutrients/name
  function invalidateMeal(meal) {
    if (!meal) return;
    try { delete meal._h; } catch (_) { meal._h = null; }
  }

  // ── day-level combined hash ──────────────────────────────────────────────
  // Используется autosave и mergeDayData для O(1) сравнения.
  //
  // Стратегия: разделить большие/частые vs маленькие/редкие поля.
  //   • БОЛЬШИЕ (meals, trainings, supplements) — через cached _h на каждый item.
  //     Это даёт основной win — JSON.stringify этих массивов и есть основная стоимость.
  //   • ОСТАЛЬНЫЕ поля (householdMin, sleepStart, dayScore, morningActivation, ...) —
  //     простой JSON.stringify оставшегося объекта. Эти поля маленькие (~100 байт),
  //     stringify тривиален. Это даёт безопасность — никаких пропущенных полей.
  //
  // Поля исключаются из хеша:
  //   • updatedAt, _sourceId, _mergedAt — meta, не часть контента
  //   • _h — наш собственный кэш
  //   • meals, trainings, supplementsPlanned, supplementsTaken — обработаны отдельно
  //
  const EXCLUDED_DAY_KEYS = new Set([
    'updatedAt', '_sourceId', '_mergedAt', '_h',
    'meals', 'trainings', 'supplementsPlanned', 'supplementsTaken',
  ]);

  function hashDay(day) {
    if (!day) return '00000000';
    const parts = [];

    // 1. Большие массивы — через cached _h
    const meals = day.meals || [];
    for (let i = 0; i < meals.length; i++) parts.push(hashMeal(meals[i]));

    const trainings = day.trainings || [];
    for (let i = 0; i < trainings.length; i++) {
      const t = trainings[i];
      if (t && typeof t._h === 'string' && t._h.length === 8) { parts.push(t._h); continue; }
      const h = hashItem(t);
      if (t) {
        try { Object.defineProperty(t, '_h', { value: h, enumerable: false, writable: true, configurable: true }); }
        catch (_) { t._h = h; }
      }
      parts.push(h);
    }

    const sp = day.supplementsPlanned || [];
    for (let i = 0; i < sp.length; i++) parts.push(hashItem(sp[i]));
    const st = day.supplementsTaken || [];
    for (let i = 0; i < st.length; i++) parts.push(hashItem(st[i]));

    // 2. Все остальные поля — собрать в плоский объект и сериализовать.
    // Это покрывает household*, sleep*, dayScore*, dayComment, cycleDay, morningActivation, etc.
    // Объект маленький (~100-300 байт), stringify тривиален.
    const rest = {};
    const keys = Object.keys(day).sort(); // sort для детерминированности
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (EXCLUDED_DAY_KEYS.has(k)) continue;
      rest[k] = day[k];
    }
    parts.push(fnv1a(JSON.stringify(rest)));

    return fnv1a(parts.join('|'));
  }

  // Утилита: комбинировать произвольный набор хешей (для custom сценариев)
  function combine(...hashes) {
    return fnv1a(hashes.filter(Boolean).join('|'));
  }

  HEYS.contentHash = {
    fnv1a,
    hashItem,
    hashMeal,
    invalidateMeal,
    hashDay,
    combine,
    // Версия — на случай если изменим алгоритм в будущем
    version: 1,
  };

  // Лёгкая телеметрия — счётчик вызовов hashDay для диагностики
  let _hashDayCalls = 0;
  const origHashDay = HEYS.contentHash.hashDay;
  HEYS.contentHash.hashDay = function (day) {
    _hashDayCalls += 1;
    return origHashDay(day);
  };
  HEYS.contentHash.getStats = function () {
    return { hashDayCalls: _hashDayCalls, version: 1 };
  };
})(typeof window !== 'undefined' ? window : globalThis);
