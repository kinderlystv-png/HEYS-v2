import { describe, expect, it } from 'vitest';

import { createInitialState, registries } from '../content/scenario.js';
import { getPeriodBoundaries } from '../campaign.js';
import { getActionOffers, initialEvent, reduceStep } from '../reducer.js';
import { applyPeriodBoundaries, boundariesForCompletedDay, createPeriodState, currentWeekIndex } from '../periods.js';
import { reducePlanningStep } from '../planning.js';
import { findCursorBoundEvents, validateRegistries, validateState } from '../schema.js';
import { stateHash } from '../rng.js';
import type { GameState, PeriodBoundary, Registries, ScenarioSlot } from '../types.js';

const plan = { weeklyRuleIds: ['protect_sleep', 'work_blocks'] as const, mainGoal: 'work' as const, supportingGoal: 'family' as const };

/**
 * Растянутый календарь: те же авторские ситуации, но 30 дней подряд. Он не
 * добавляет контент, а проверяет, что в движке не осталось предположений про
 * ровно семь дней и ровно 38 слотов.
 */
function extendedRegistries(days: number): Registries {
  const perDay = [420, 780, 1140];
  const slots: ScenarioSlot[] = [];
  const events = structuredClone(registries.events);
  for (let day = 0; day < days; day += 1) {
    perDay.forEach((minuteOfDay, index) => {
      const source = registries.slots[(slots.length) % registries.slots.length]!;
      const sourceEventId = source.eventId!;
      const eventId = `long_${day}_${index}`;
      const template = structuredClone(registries.events[sourceEventId]!);
      template.id = eventId;
      template.trigger = { kind: 'compare', path: 'scenarioCursor', op: 'eq', value: slots.length };
      template.hardWindow = { fromDayIndex: day, fromMinuteOfDay: minuteOfDay, toDayIndex: day, toMinuteOfDay: Math.min(1439, minuteOfDay + 120) };
      template.maxOccurrencesPerCampaign = 1;
      template.cooldownDays = 0;
      template.source = 'mandatory';
      template.load = { external: 0, total: 0, size: 'small' };
      template.onOpenEffects = [];
      events[eventId] = template;
      slots.push({
        slot: slots.length + 1,
        dayIndex: day,
        minuteOfDay,
        eventId,
        forkKind: 'ordinary',
        ...(index === 0 && day > 0 ? { sleepBeforeMin: 420, interruptionsMin: 0 } : {}),
      });
    });
  }
  return { actions: registries.actions, events, slots };
}

function longCampaignState(seed: string, days: number) {
  const extended = extendedRegistries(days);
  const state = createInitialState(seed);
  state.activeEventId = extended.slots[0]!.eventId!;
  state.eventLedger.occurrences = { [extended.slots[0]!.eventId!]: 1 };
  return { extended, state };
}

function play(state: GameState, extended: Registries) {
  const boundaries: PeriodBoundary[] = [];
  let current = state;
  while (current.scenarioCursor < extended.slots.length) {
    const before = current;
    const openEvent = initialEvent(current, extended);
    const offer = getActionOffers(current, openEvent.templateId, extended).find((item) => item.available);
    if (!offer) throw new Error(`no available action at cursor ${current.scenarioCursor}`);
    current = reduceStep({ state: current, openEvent, actionId: offer.actionId }, extended).state;
    boundaries.push(...getPeriodBoundaries(before, current, extended));
  }
  return { state: current, boundaries };
}

describe('period contract', () => {
  it('validates a 30-day calendar without week-01 size assumptions', { timeout: 60_000 }, () => {
    const { extended, state } = longCampaignState('periods-30', 30);
    expect(() => validateRegistries(extended, { ...state, activeEventId: extended.slots[0]!.eventId! })).not.toThrow();

    const played = play(state, extended);
    validateState(played.state);
    expect(played.state.clock.dayIndex).toBe(30);
    expect(played.state.periods.completedDays).toBe(30);
    expect(played.state.periods.completedWeeks).toBe(5);
    expect(played.state.periods.completedMonths).toBe(1);
    expect(played.boundaries.filter((item) => item.kind === 'day')).toHaveLength(30);
    expect(played.boundaries.filter((item) => item.kind === 'month').map((item) => item.id)).toEqual(['month:0']);
  });

  it('closes every boundary exactly once and resets only weekly counters', { timeout: 30_000 }, () => {
    const { extended, state } = longCampaignState('periods-idempotent', 14);
    const played = play(state, extended);

    expect(new Set(played.state.periods.appliedBoundaries).size).toBe(played.state.periods.appliedBoundaries.length);
    expect(played.state.periods.appliedBoundaries.filter((id) => id.startsWith('week:'))).toEqual(['week:0', 'week:1']);
    expect(played.state.eventLedger.weekLargeCount).toBe(0);
    expect(played.state.periods.completedDays).toBe(14);

    // Повторное применение тех же границ не двигает счётчики.
    const replayTarget = structuredClone(played.state);
    const repeated = applyPeriodBoundaries(replayTarget, boundariesForCompletedDay({
      periods: replayTarget.periods,
      completedDayIndex: 13,
      nextDayIndex: null,
      afterStepIndex: replayTarget.clock.stepIndex,
    }));
    expect(repeated).toEqual([]);
    expect(stateHash(replayTarget)).toBe(stateHash(played.state));
  });

  it('gives every new week its own planning lock', { timeout: 30_000 }, () => {
    const { extended, state } = longCampaignState('periods-planning', 14);
    const planned = reducePlanningStep({ state, plan: { ...plan, weeklyRuleIds: [...plan.weeklyRuleIds] } }).state;
    expect(planned.periods.plannedWeeks).toEqual([0]);
    expect(() => reducePlanningStep({ state: planned, plan: { ...plan, weeklyRuleIds: [...plan.weeklyRuleIds], supportingGoal: 'recovery' } })).toThrow(/planning_locked/);

    const played = play(planned, extended);
    expect(currentWeekIndex(played.state)).toBe(2);
    const replanned = reducePlanningStep({ state: played.state, plan: { weeklyRuleIds: ['family_anchor', 'work_blocks'], mainGoal: 'family', supportingGoal: 'recovery' } }).state;
    expect(replanned.periods.plannedWeeks).toEqual([0, 2]);
    expect(replanned.weeklyRules.map((item) => item.id)).toEqual(['family_anchor', 'work_blocks']);
  });

  it('replays a long campaign deterministically at every boundary', { timeout: 30_000 }, () => {
    const first = longCampaignState('periods-replay', 10);
    const second = longCampaignState('periods-replay', 10);
    const left = play(first.state, first.extended);
    const right = play(second.state, second.extended);

    expect(stateHash(left.state)).toBe(stateHash(right.state));
    expect(left.boundaries.map((item) => item.id)).toEqual(right.boundaries.map((item) => item.id));
  });

  it('keeps the calendar configurable instead of hard-coding a seven-day week', () => {
    const periods = createPeriodState({ daysPerWeek: 5, weeksPerMonth: 2 });
    expect(boundariesForCompletedDay({ periods, completedDayIndex: 4, nextDayIndex: 5, afterStepIndex: 1 }).map((item) => item.kind)).toEqual(['day', 'week']);
    expect(boundariesForCompletedDay({ periods, completedDayIndex: 9, nextDayIndex: 10, afterStepIndex: 1 }).map((item) => item.id)).toEqual(['day:9', 'week:1', 'month:0']);
    expect(boundariesForCompletedDay({ periods, completedDayIndex: 2, nextDayIndex: 3, afterStepIndex: 1 }).map((item) => item.kind)).toEqual(['day']);
  });
});

describe('state-driven situation contract (Sprint 22)', () => {
  it('fills anchors without a pinned situation from rule-driven selection', { timeout: 30_000 }, () => {
    const { extended, state } = longCampaignState('anchors-free', 6);
    // Только открытие кампании закреплено автором; остальные якоря — это время,
    // а не назначенная ситуация.
    const anchors: ScenarioSlot[] = extended.slots.map((slot, index) => { if (index === 0) return slot; const { eventId, ...rest } = slot; void eventId; return rest; });
    const free: Registries = { ...extended, slots: anchors };
    expect(() => validateRegistries(free, { ...state, activeEventId: anchors[0]!.eventId! })).not.toThrow();

    const played = play(state, free);
    expect(played.state.scenarioCursor).toBe(anchors.length);
    expect(played.state.periods.completedDays).toBe(6);
    expect(anchors.filter((slot) => slot.eventId)).toHaveLength(1);
  });

  it('reports how many authored situations still open by scenario position', () => {
    // Инвариант `D73`: цель — ноль. Понедельник переведён на условия состояния
    // и времени; число фиксируется явно, чтобы остаток нельзя было забыть.
    expect(findCursorBoundEvents(registries)).toHaveLength(36);
    expect(findCursorBoundEvents({ ...registries, events: {} })).toEqual([]);
  });
});

describe('Monday opens by state and time, not by position', () => {
  const mondayOrder = (seed: string, pick: (offers: ReturnType<typeof getActionOffers>) => string) => {
    let state = createInitialState(seed);
    const opened: string[] = [];
    while (state.clock.dayIndex === 0 && state.scenarioCursor < registries.slots.length) {
      const openEvent = initialEvent(state, registries);
      opened.push(openEvent.templateId);
      const offers = getActionOffers(state, openEvent.templateId, registries);
      state = reduceStep({ state, openEvent, actionId: pick(offers) }, registries).state;
    }
    return opened;
  };

  it('produces a different Monday sequence for a different trajectory on the same seed', () => {
    const cheapest = mondayOrder('monday-shape', (offers) => offers.filter((item) => item.available).sort((left, right) => left.effectiveTimeMin - right.effectiveTimeMin)[0]!.actionId);
    const slowest = mondayOrder('monday-shape', (offers) => offers.filter((item) => item.available).sort((left, right) => right.effectiveTimeMin - left.effectiveTimeMin)[0]!.actionId);

    expect(cheapest[0]).toBe('mon_breakfast');
    expect(slowest[0]).toBe('mon_breakfast');
    expect(cheapest.length).toBeGreaterThan(1);
    expect(new Set(cheapest).size).toBe(cheapest.length);
    expect(cheapest).not.toEqual(slowest);
  });

  it('repeats the same Monday sequence for the same trajectory', () => {
    const first = mondayOrder('monday-repeat', (offers) => offers.find((item) => item.available)!.actionId);
    const second = mondayOrder('monday-repeat', (offers) => offers.find((item) => item.available)!.actionId);
    expect(first).toEqual(second);
  });
});
