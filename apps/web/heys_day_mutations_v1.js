/**
 * heys_day_mutations_v1.js — Immutable mutation helpers for day objects.
 *
 * Every meal-level edit must go through these helpers (or call sites must
 * manually bump `meal.updatedAt`) so server-side merge can decide which
 * version of a specific meal is newer when two clients edit different meals
 * of the same day concurrently.
 *
 * Without per-meal updatedAt, merge falls back to day.updatedAt — which works
 * for "different meal IDs survive both" but loses precision when both sides
 * edit the SAME meal at slightly different moments.
 *
 * Backward compat: existing meals/days without `meal.updatedAt` work fine —
 * mergeDayData falls back to `day.updatedAt` when meal-level timestamp is missing.
 */
(function (global) {
  'use strict';

  const HEYS = (global.HEYS = global.HEYS || {});

  function now() {
    return Date.now();
  }

  // Bump both meal.updatedAt and day.updatedAt for a specific meal edit.
  // Used when modifying items, time, name, or any other meal-level field.
  function touchMeal(day, mealId, mutator) {
    if (!day || !mealId) return day;
    const ts = now();
    const meals = (day.meals || []).map((m) => {
      if (!m || m.id !== mealId) return m;
      const next = typeof mutator === 'function' ? mutator({ ...m }) : { ...m };
      next.updatedAt = ts;
      return next;
    });
    return { ...day, meals, updatedAt: ts };
  }

  // Append a new meal to the day with both timestamps stamped.
  function addMeal(day, newMeal) {
    if (!day || !newMeal || !newMeal.id) return day;
    const ts = now();
    const meal = { ...newMeal, updatedAt: ts };
    return {
      ...(day || {}),
      meals: [...((day && day.meals) || []), meal],
      updatedAt: ts,
    };
  }

  // Remove a meal by ID. Writes a tombstone in deletedMealIds so a stale
  // device pushing the meal back gets filtered by mergeDayData on next sync.
  function removeMeal(day, mealId) {
    if (!day || !mealId) return day;
    const ts = now();
    const prevTombstones = (day.deletedMealIds && typeof day.deletedMealIds === 'object' && !Array.isArray(day.deletedMealIds))
      ? day.deletedMealIds : {};
    return {
      ...day,
      meals: (day.meals || []).filter((m) => m && m.id !== mealId),
      deletedMealIds: { ...prevTombstones, [mealId]: ts },
      updatedAt: ts,
    };
  }

  // Add an item to a specific meal (common pattern for "add product to meal").
  function addItemToMeal(day, mealId, newItem) {
    if (!day || !mealId || !newItem) return day;
    return touchMeal(day, mealId, (meal) => ({
      ...meal,
      items: [...(meal.items || []), newItem],
    }));
  }

  // Remove an item by ID from a meal.
  function removeItemFromMeal(day, mealId, itemId) {
    if (!day || !mealId || !itemId) return day;
    return touchMeal(day, mealId, (meal) => ({
      ...meal,
      items: (meal.items || []).filter((it) => it && it.id !== itemId),
    }));
  }

  // Replace an item by ID inside a meal (e.g. changing grams).
  function updateItemInMeal(day, mealId, itemId, patch) {
    if (!day || !mealId || !itemId) return day;
    return touchMeal(day, mealId, (meal) => ({
      ...meal,
      items: (meal.items || []).map((it) =>
        it && it.id === itemId ? { ...it, ...patch } : it
      ),
    }));
  }

  HEYS.dayMutations = {
    touchMeal,
    addMeal,
    removeMeal,
    addItemToMeal,
    removeItemFromMeal,
    updateItemInMeal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
