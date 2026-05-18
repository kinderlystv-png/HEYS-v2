// curator-action-format.js
// Утилиты для агрегации actions array → push body string.
//
// Контракт:
//   collapseNetChange(actions) → actions[] (add+remove одного meal схлопывается)
//   bucketize(actions) → {meals_added, meals_removed, trainings_added, weight, …}
//   formatBody(buckets) → "+2 приёма пищи, +1 тренировка, вес 89→90"
//
// Используется jobCuratorBatching в index.js.

'use strict';

// ─── collapseNetChange ───────────────────────────────────────────────
//
// Куратор за 15-минутное окно мог добавить meal и потом удалить.
// Net change == 0, в push'е не показываем. Сейчас meals не имеют
// сквозного id (id уникален в момент создания, но removed = по имени).
// Делаем простую эвристику: pair add+remove с одинаковым `name`.

function collapseNetChange(actions) {
  if (!Array.isArray(actions)) return [];
  const result = [];
  const removedNames = new Set();
  for (const a of actions) {
    if (a && a.type === 'meal_removed' && a.name) {
      removedNames.add(a.name);
    }
  }
  const addedSeenForRemove = new Set();
  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'meal_added' && a.name && removedNames.has(a.name) && !addedSeenForRemove.has(a.name)) {
      // Schip both this add and one removed entry with same name.
      addedSeenForRemove.add(a.name);
      continue;
    }
    if (a.type === 'meal_removed' && a.name && addedSeenForRemove.has(a.name)) {
      // Уже схлопнули add с этим именем — теперь съедаем парный remove.
      addedSeenForRemove.delete(a.name); // одну пару — одно списание
      continue;
    }
    result.push(a);
  }
  return result;
}

// ─── bucketize ───────────────────────────────────────────────────────

function bucketize(actions) {
  const b = {
    meals_added: 0,
    meals_removed: 0,
    meal_items_added: 0,
    trainings_added: 0,
    trainings_removed: 0,
    weight: null,      // {from, to}
    steps: null,       // value
    sleep: null,       // hours
    water: null,       // ml
    norms_fields: [],
    profile_fields: [],
    other_keys: [],
    truncated_count: 0,
  };
  for (const a of (actions || [])) {
    if (!a || typeof a !== 'object') continue;
    switch (a.type) {
      case 'meal_added':       b.meals_added++; break;
      case 'meal_removed':     b.meals_removed++; break;
      case 'meal_item_added':  b.meal_items_added += (a.count || 1); break;
      case 'training_added':   b.trainings_added++; break;
      case 'training_removed': b.trainings_removed++; break;
      case 'weight_set':       b.weight = { from: a.from, to: a.to }; break;
      case 'steps_set':        b.steps = a.to; break;
      case 'sleep_set':        b.sleep = a.to; break;
      case 'water_set':        b.water = a.to; break;
      case 'norms_changed':    b.norms_fields.push(...(a.fields || [])); break;
      case 'profile_changed':  b.profile_fields.push(...(a.fields || [])); break;
      case 'other_changed':    if (a.key) b.other_keys.push(a.key); break;
      case 'truncated':        b.truncated_count += (a.count || 0); break;
    }
  }
  return b;
}

// ─── formatBody ──────────────────────────────────────────────────────

function pluralRu(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const lastTwo = abs;
  const last = abs % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function formatBody(b) {
  if (!b) return 'Куратор внёс изменения. Загляни в приложение.';
  const parts = [];

  const totalMealsAdded = b.meals_added + (b.meal_items_added > 0 ? 0 : 0);
  // Считаем приёмы пищи + дописанные в существующие.
  if (b.meals_added > 0) {
    parts.push(`+${b.meals_added} ${pluralRu(b.meals_added, 'приём пищи', 'приёма пищи', 'приёмов пищи')}`);
  }
  if (b.meal_items_added > 0 && b.meals_added === 0) {
    // Если приёмов не добавили, но докинули продуктов — отдельно.
    parts.push(`+${b.meal_items_added} ${pluralRu(b.meal_items_added, 'продукт', 'продукта', 'продуктов')}`);
  }
  if (b.meals_removed > 0) {
    parts.push(`−${b.meals_removed} ${pluralRu(b.meals_removed, 'приём', 'приёма', 'приёмов')}`);
  }
  if (b.trainings_added > 0) {
    parts.push(`+${b.trainings_added} ${pluralRu(b.trainings_added, 'тренировка', 'тренировки', 'тренировок')}`);
  }
  if (b.trainings_removed > 0) {
    parts.push(`−${b.trainings_removed} ${pluralRu(b.trainings_removed, 'тренировка', 'тренировки', 'тренировок')}`);
  }
  if (b.weight) {
    if (b.weight.from != null) {
      parts.push(`вес ${trimNum(b.weight.from)}→${trimNum(b.weight.to)}`);
    } else {
      parts.push(`вес ${trimNum(b.weight.to)}`);
    }
  }
  if (b.sleep != null) {
    parts.push(`сон ${trimNum(b.sleep)} ч`);
  }
  if (b.steps != null) {
    parts.push(`${b.steps} шагов`);
  }
  if (b.water != null) {
    parts.push(`вода ${b.water} мл`);
  }
  if (b.norms_fields.length > 0) {
    parts.push('обновлены нормы');
  }
  if (b.profile_fields.length > 0) {
    parts.push('обновлён профиль');
  }
  if (parts.length === 0 && b.other_keys.length > 0) {
    parts.push(`${b.other_keys.length} ${pluralRu(b.other_keys.length, 'правка', 'правки', 'правок')}`);
  }
  if (parts.length === 0) {
    return 'Куратор обновил твои данные';
  }
  // Cap 3 parts to keep notification short
  if (parts.length > 3) {
    const total = b.meals_added + b.trainings_added + (b.weight ? 1 : 0) + (b.sleep != null ? 1 : 0)
      + (b.steps != null ? 1 : 0) + (b.water != null ? 1 : 0)
      + b.norms_fields.length + b.profile_fields.length;
    return `+${total} ${pluralRu(total, 'изменение', 'изменения', 'изменений')} от куратора`;
  }
  return parts.join(', ');
}

function trimNum(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  if (Math.abs(n - Math.round(n)) < 0.05) return String(Math.round(n));
  return n.toFixed(1).replace(/\.0$/, '');
}

module.exports = {
  collapseNetChange,
  bucketize,
  formatBody,
  _internal: { pluralRu, trimNum },
};
