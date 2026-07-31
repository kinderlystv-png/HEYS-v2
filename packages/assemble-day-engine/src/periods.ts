import type { GameState, PeriodBoundary, PeriodState } from './types.js';

/**
 * Календарь кампании (`D72`). Абсолютный день живёт в `clock.dayIndex`, поэтому
 * день недели, номер недели и месяца выводятся, а не хранятся. В состоянии
 * остаются только счётчики завершённых периодов, идентификаторы уже применённых
 * границ и недели с подтверждённым планом.
 */
export const DEFAULT_PERIOD_STATE: PeriodState = {
  version: 1,
  daysPerWeek: 7,
  weeksPerMonth: 4,
  completedDays: 0,
  completedWeeks: 0,
  completedMonths: 0,
  appliedBoundaries: [],
  plannedWeeks: [],
};

export function createPeriodState(overrides: Partial<PeriodState> = {}): PeriodState {
  return { ...DEFAULT_PERIOD_STATE, appliedBoundaries: [], plannedWeeks: [], ...overrides };
}

export function daysPerMonth(periods: PeriodState): number {
  return periods.daysPerWeek * periods.weeksPerMonth;
}

export function dayOfWeekFor(periods: PeriodState, absoluteDay: number): number {
  return ((absoluteDay % periods.daysPerWeek) + periods.daysPerWeek) % periods.daysPerWeek;
}

export function weekIndexFor(periods: PeriodState, absoluteDay: number): number {
  return Math.floor(absoluteDay / periods.daysPerWeek);
}

export function monthIndexFor(periods: PeriodState, absoluteDay: number): number {
  return Math.floor(absoluteDay / daysPerMonth(periods));
}

export function currentWeekIndex(state: GameState): number {
  return weekIndexFor(state.periods, state.clock.dayIndex);
}

export function isLastDayOfWeek(periods: PeriodState, absoluteDay: number): boolean {
  return dayOfWeekFor(periods, absoluteDay) === periods.daysPerWeek - 1;
}

export function isLastWeekOfMonth(periods: PeriodState, weekIndex: number): boolean {
  return ((weekIndex % periods.weeksPerMonth) + periods.weeksPerMonth) % periods.weeksPerMonth === periods.weeksPerMonth - 1;
}

/**
 * Границы, которые закрывает завершённый абсолютный день. Месяц закрывается
 * только настоящим завершением месяца: конец авторского контента закрывает день
 * и неделю, но не выдаёт месячный итог за неполный месяц.
 */
export function boundariesForCompletedDay(input: {
  periods: PeriodState;
  completedDayIndex: number;
  nextDayIndex: number | null;
  afterStepIndex: number;
}): PeriodBoundary[] {
  const { periods, completedDayIndex, nextDayIndex, afterStepIndex } = input;
  const contentEnds = nextDayIndex === null;
  const week = weekIndexFor(periods, completedDayIndex);
  const boundaries: PeriodBoundary[] = [{
    id: `day:${completedDayIndex}`,
    kind: 'day',
    completedDayIndex,
    nextDayIndex,
    afterStepIndex,
    periodIndex: completedDayIndex,
  }];
  const closesWeek = isLastDayOfWeek(periods, completedDayIndex) || contentEnds;
  if (!closesWeek) return boundaries;
  boundaries.push({ id: `week:${week}`, kind: 'week', completedDayIndex, nextDayIndex, afterStepIndex, periodIndex: week });
  if (isLastWeekOfMonth(periods, week) && !contentEnds) {
    boundaries.push({ id: `month:${monthIndexFor(periods, completedDayIndex)}`, kind: 'month', completedDayIndex, nextDayIndex, afterStepIndex, periodIndex: monthIndexFor(periods, completedDayIndex) });
  }
  return boundaries;
}

/**
 * Применяет границы ровно один раз. Повторный вызов с тем же состоянием ничего
 * не меняет: идентификаторы уже применённых границ хранятся в состоянии, а
 * недельные счётчики сбрасываются только вместе с закрытием своей недели.
 */
export function applyPeriodBoundaries(state: GameState, boundaries: PeriodBoundary[]): PeriodBoundary[] {
  const applied: PeriodBoundary[] = [];
  for (const boundary of boundaries) {
    if (state.periods.appliedBoundaries.includes(boundary.id)) continue;
    state.periods.appliedBoundaries.push(boundary.id);
    applied.push(boundary);
    if (boundary.kind === 'day') {
      state.periods.completedDays += 1;
      continue;
    }
    if (boundary.kind === 'week') {
      state.periods.completedWeeks += 1;
      state.eventLedger.weekLargeCount = 0;
      compactAppliedBoundaries(state);
      continue;
    }
    state.periods.completedMonths += 1;
  }
  return applied;
}

/**
 * Журнал причин ограничен одним днём. Компактизация выполняется в редьюсере
 * на закрытии дня, поэтому replay и загрузка дают одинаковое состояние. Записи
 * завершённого дня сохраняются: итог дня считается уже после границы. Недельные
 * итоги опираются на `weekStats`, а не на журнал.
 */
export function compactCausalJournal(state: GameState, completedDayIndex: number): number {
  const before = state.causalJournal.length;
  state.causalJournal = state.causalJournal.filter((entry) => entry.dayIndex >= completedDayIndex);
  return before - state.causalJournal.length;
}

/**
 * Отложенные эффекты, которые уже применены или отменены, тоже не должны копиться
 * в состоянии: за тридцать дней они одни съедали заметную часть бюджета
 * чекпойнта. Их последствия уже в состоянии и в журнале, поэтому очередь чистится
 * на границе дня вместе с журналом.
 */
/**
 * Загрузка партнёра и ребёнка спадает за ночь (`D21`, Sprint 8). Спад
 * детерминированный и происходит на границе дня, поэтому «партнёр отказал»
 * всегда объясняется состоянием, а не скрытым броском.
 */
export const FAMILY_LOAD_NIGHTLY_RELIEF = 18;

export function relieveFamilyLoad(state: GameState): void {
  for (const person of ['partner', 'child'] as const) {
    state.family[person].load = Math.max(0, state.family[person].load - FAMILY_LOAD_NIGHTLY_RELIEF);
  }
}

export function compactScheduledEffects(state: GameState): number {
  const before = state.scheduledEffects.length;
  state.scheduledEffects = state.scheduledEffects.filter((item) => item.status === 'pending');
  return before - state.scheduledEffects.length;
}

/**
 * Переносит недельные счётчики в предыдущее ведро, когда началась новая неделя.
 * Итог закрытой недели читает то ведро, чей `weekIndex` совпадает с неделей
 * итога, поэтому граница не стирает данные, которые ей же нужны.
 */
export function rollWeekStats(state: GameState): void {
  const week = currentWeekIndex(state);
  if (state.weekStats.weekIndex === week) return;
  state.weekStats = {
    weekIndex: week,
    actionCounts: {},
    previousWeekIndex: state.weekStats.weekIndex,
    previousActionCounts: state.weekStats.actionCounts,
  };
}

export function weekActionCount(state: GameState, weekIndex: number, actionId: string): number {
  if (state.weekStats.weekIndex === weekIndex) return state.weekStats.actionCounts[actionId] ?? 0;
  if (state.weekStats.previousWeekIndex === weekIndex) return state.weekStats.previousActionCounts[actionId] ?? 0;
  return 0;
}

/**
 * Список применённых границ тоже не растёт бесконечно: повторно применить можно
 * только недавнюю границу, поэтому на закрытии недели хвост обрезается до
 * последних `APPLIED_BOUNDARY_HISTORY` записей. Порядок детерминирован.
 */
export const APPLIED_BOUNDARY_HISTORY = 24;

export function compactAppliedBoundaries(state: GameState): number {
  const before = state.periods.appliedBoundaries.length;
  if (before <= APPLIED_BOUNDARY_HISTORY) return 0;
  state.periods.appliedBoundaries = state.periods.appliedBoundaries.slice(before - APPLIED_BOUNDARY_HISTORY);
  return before - state.periods.appliedBoundaries.length;
}
