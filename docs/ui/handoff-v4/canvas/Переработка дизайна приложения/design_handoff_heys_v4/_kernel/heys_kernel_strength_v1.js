/* heys_kernel_strength_v1.js — арифметика силовой тренировки.
   Единственный источник расчёта для зоны strength-builder.
   Простой ES-модуль без сборки: работает и в браузере, и в Node.
   Значения и правила — из контракта канваса strength-builder.v4.dc.html.
   Проверяется фикстурой fixtures/workout-23-sets.json. */

export const MUSCLE_GROUPS = Object.freeze([
  'грудь', 'спина', 'плечи', 'бицепс', 'трицепс',
  'пресс', 'поясница', 'ягодицы', 'квадрицепс', 'бицепс бедра', 'икры'
]);

/** Доля своего веса по ответу «на что похоже движение». Физический факт, не настройка. */
export const BODYWEIGHT_SHARE = Object.freeze({
  pullup: 1.0,     // как подтягивания — поднимается всё тело
  pistol: 0.85,    // как приседания на одной — почти всё, ноги на опоре
  pushup: 0.64,    // как отжимания от пола — часть веса на ногах
  crunch: 0.35     // как скручивания — поднимается корпус
  // «Не знаю» — коэффициента нет, упражнение идёт без объёма
});

export const SYNERGIST_SHARE = 0.5;
export const DROP_STEP = 0.8;      // автоподстановка веса ступени дропа: −20 %
export const DROP_MAX_STEPS = 3;
export const REST_DEFAULT_SEC = 90; // тяжесть не отмечена

/** Подход — единица учёта. Раунд только группирует и в схеме не хранится. */
export function isWorkingSet(set) {
  return set.type !== 'warmup';
}

/** Дроп принадлежит подходу и своего номера не имеет. */
export function countSets(workout) {
  let n = 0;
  for (const ex of workout.exercises) {
    for (const set of ex.sets) if (isWorkingSet(set)) n += 1;
  }
  return n;
}

/** Вес одного повтора: снаряд либо доля своего веса плюс довес. */
export function repWeight(exercise, set, bodyWeightKg) {
  if (exercise.unit === 'bodyweight') {
    if (exercise.bodyweightShare == null) return null; // коэффициента нет — не считаем
    return bodyWeightKg * exercise.bodyweightShare + (set.addedKg || 0);
  }
  if (exercise.unit === 'weight') return set.weightKg || 0;
  return null; // время и метры в тоннаж не идут
}

/** Тоннаж подхода. null значит «не посчитали» — это не ноль. */
export function setTonnage(exercise, set, bodyWeightKg) {
  if (!isWorkingSet(set)) return 0;         // разминка вне объёма
  const w = repWeight(exercise, set, bodyWeightKg);
  if (w == null) return null;
  return w * (set.reps || 0);
}

export function exerciseTonnage(exercise, bodyWeightKg) {
  let sum = 0, uncounted = false;
  for (const set of exercise.sets) {
    const t = setTonnage(exercise, set, bodyWeightKg);
    if (t == null) uncounted = true; else sum += t;
  }
  return { kg: sum, uncounted };
}

export function workoutTonnage(workout) {
  let kg = 0;
  const uncounted = [];
  for (const ex of workout.exercises) {
    const r = exerciseTonnage(ex, workout.bodyWeightKg);
    kg += r.kg;
    if (r.uncounted) uncounted.push(ex.name);
  }
  return { kg, uncounted };
}

/** Объём по группам: основная берёт полный вес подхода, синергисты половину. */
export function muscleVolume(workout) {
  const out = {};
  for (const ex of workout.exercises) {
    const { kg } = exerciseTonnage(ex, workout.bodyWeightKg);
    if (!kg) continue;
    if (ex.primary) out[ex.primary] = (out[ex.primary] || 0) + kg;
    for (const g of ex.synergists || []) out[g] = (out[g] || 0) + kg * SYNERGIST_SHARE;
  }
  return out;
}

/** Расчётный максимум по Эпли. Формула зафиксирована и здесь, и в контракте. */
export function epley(weightKg, reps) {
  if (!weightKg || !reps) return 0;
  return reps === 1 ? weightKg : weightKg * (1 + reps / 30);
}

export function estimatedMax(workout, exerciseName) {
  const ex = workout.exercises.find(e => e.name === exerciseName);
  if (!ex || ex.unit !== 'weight') return 0;
  let best = 0;
  for (const set of ex.sets) {
    if (!isWorkingSet(set)) continue;
    best = Math.max(best, epley(set.weightKg, set.reps));
  }
  return Math.round(best);
}

/** Отдых по тяжести. Шкала грубая, промежуточных ступеней нет. */
export function restSeconds(hardness) {
  if (hardness == null) return REST_DEFAULT_SEC;
  if (hardness >= 9) return 180;
  if (hardness >= 7) return 120;
  return 60;
}

/** Отдых связки — максимум из значений участников, не сумма и не среднее. */
export function supersetRest(members) {
  return Math.max(...members.map(m => m.restSec || 0));
}

/** Время в зале считается по отмеченным подходам, а не по часам от старта. */
export function activeMinutes(workout) {
  let sec = 0;
  for (const ex of workout.exercises)
    for (const set of ex.sets)
      if (set.done && set.elapsedSec) sec += set.elapsedSec;
  return Math.round(sec / 60);
}
