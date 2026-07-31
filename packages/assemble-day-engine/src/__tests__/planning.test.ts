import { describe, expect, it } from 'vitest';
import { createInitialState, registries } from '../content/scenario.js';
import { getPlanningView, reducePlanningStep } from '../planning.js';
import { computeDecisionContext, getActionOffers, initialEvent, reduceStep } from '../reducer.js';
import { stateHash } from '../rng.js';
import type { PlanningPlan } from '../types.js';

const plan: PlanningPlan = {
  weeklyRuleIds: ['protect_sleep', 'work_blocks'],
  mainGoal: 'work',
  supportingGoal: 'family',
};

describe('planning reducer contract', () => {
  it('atomically confirms rules and priorities without advancing the campaign', () => {
    const input = createInitialState('planning-atomic');
    const before = structuredClone(input);
    const output = reducePlanningStep({ state: input, plan });

    expect(input).toEqual(before);
    expect(output.state.weeklyRules.map((item) => item.id)).toEqual(['protect_sleep', 'work_blocks']);
    expect(output.state.monthlyPriorities).toEqual([
      { domain: 'work', level: 2 },
      { domain: 'family', level: 1 },
      { domain: 'recovery', level: 0 },
      { domain: 'social', level: 0 },
    ]);
    expect(output.journalEntries.map((item) => item.resultPath)).toEqual(['weeklyRules', 'monthlyPriorities']);
    expect(output.journalEntries.every((item) => item.confidence === 'established')).toBe(true);
    expect(output.state.clock).toEqual(before.clock);
    expect(output.state.scenarioCursor).toBe(before.scenarioCursor);
    expect(output.state.scheduledEffects).toEqual(before.scheduledEffects);
    expect(output.state.rng).toEqual(before.rng);
    expect(output.state.eventLedger).toEqual(before.eventLedger);
    expect(output.stateHash).toBe(stateHash(output.state));
  });

  it('fails closed for incomplete, duplicate, unknown, equal and no-op plans', () => {
    const input = createInitialState('planning-invalid');
    const before = stateHash(input);
    expect(() => reducePlanningStep({ state: input, plan: { ...plan, weeklyRuleIds: ['protect_sleep'] } })).toThrow(/weekly_capacity/);
    expect(() => reducePlanningStep({ state: input, plan: { ...plan, weeklyRuleIds: ['protect_sleep', 'family_anchor', 'work_blocks'] } })).toThrow(/weekly_capacity/);
    expect(() => reducePlanningStep({ state: input, plan: { ...plan, weeklyRuleIds: ['protect_sleep', 'protect_sleep'] } })).toThrow(/weekly_duplicate/);
    expect(() => reducePlanningStep({ state: input, plan: { ...plan, weeklyRuleIds: ['protect_sleep', 'unknown'] as PlanningPlan['weeklyRuleIds'] } })).toThrow(/weekly_unknown/);
    expect(() => reducePlanningStep({ state: input, plan: { ...plan, supportingGoal: 'work' } })).toThrow(/goals_equal/);
    const confirmed = reducePlanningStep({ state: input, plan });
    expect(() => reducePlanningStep({ state: confirmed.state, plan })).toThrow(/no_op/);
    expect(stateHash(input)).toBe(before);
  });

  it('keeps preview pure and returns engine-owned pressure, conflicts and horizon data', () => {
    const input = createInitialState('planning-preview');
    const before = stateHash(input);
    const context = computeDecisionContext(input);
    const view = getPlanningView(input, plan, context);

    expect(view.valid).toBe(true);
    expect(view.conflicts.map((item) => item.id)).toContain('work_sleep_window');
    expect(view.capacity).toEqual({
      weekly: { totalSlots: 2, allocatedSlots: 2, remainingSlots: 0 },
      attention: { totalUnits: 3, allocatedUnits: 3, unallocatedUnits: 0, mainUnits: 2, supportingUnits: 1 },
    });
    expect(view.pressures).toHaveLength(4);
    expect(view.financialHorizon).toEqual({
      cashRub: 32000,
      expectedIncomeRub: 72000,
      obligationsRub: 45000,
      cashAfterNextObligationsRub: 59000,
    });
    expect(view.risks.length).toBeGreaterThan(0);
    expect(view.opportunities.length).toBeGreaterThan(0);
    expect(stateHash(input)).toBe(before);
  });

  it('changes real offer geometry through engine-owned planning and keeps the next step deterministic', () => {
    const input = createInitialState('planning-offers');
    const event = initialEvent(input, registries);
    const beforeOffers = getActionOffers(input, event.templateId, registries);
    const planned = reducePlanningStep({ state: input, plan }).state;
    const afterOffers = getActionOffers(planned, event.templateId, registries);
    expect(afterOffers.map((offer) => [offer.actionId, offer.effectiveTimeMin, offer.effortScore, offer.optionPressure])).not.toEqual(beforeOffers.map((offer) => [offer.actionId, offer.effectiveTimeMin, offer.effortScore, offer.optionPressure]));
    expect(afterOffers.some((offer) => offer.planningSignals.length > 0)).toBe(true);
    expect(afterOffers.some((offer) => offer.geometryReasons.some((item) => item.inputPaths.some((path) => path.startsWith('planningCapacity.'))))).toBe(true);
    const first = reduceStep({ state: planned, openEvent: initialEvent(planned, registries), actionId: 'cook_meal_batch' }, registries);
    const duplicatePlanned = reducePlanningStep({ state: createInitialState('planning-offers'), plan }).state;
    const duplicate = reduceStep({ state: duplicatePlanned, openEvent: initialEvent(duplicatePlanned, registries), actionId: 'cook_meal_batch' }, registries);
    expect(first.stateHash).toBe(duplicate.stateHash);
    expect(first.state.clock.stepIndex).toBe(1);
    expect(first.state.scenarioCursor).toBe(1);
    expect(first.journalEntries.some((entry) => entry.resultPath.includes('planningCapacity.'))).toBe(true);
  });

  it('locks the weekly contract after the first confirmed action', () => {
    const state = reducePlanningStep({ state: createInitialState('planning-lock'), plan }).state;
    const stepped = reduceStep({ state, openEvent: initialEvent(state, registries), actionId: 'eat_ready_meal' }, registries).state;
    expect(() => reducePlanningStep({ state: stepped, plan: { ...plan, mainGoal: 'recovery', supportingGoal: 'family' } })).toThrow(/planning_locked/);
  });

  it('marks a real weekly conflict on a relevant evening work action', () => {
    const state = reducePlanningStep({ state: createInitialState('planning-conflict'), plan: { ...plan, weeklyRuleIds: ['protect_sleep', 'family_anchor'] } }).state;
    state.scenarioCursor = 11;
    state.clock.stepIndex = 11;
    state.clock.dayIndex = registries.slots[11]!.dayIndex;
    state.clock.minuteOfDay = registries.slots[11]!.minuteOfDay;
    const offers = getActionOffers(state, registries.slots[11]!.eventId!, registries);
    const lateWork = offers.find((offer) => offer.actionId === 'work_late');
    expect(lateWork?.planningSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'conflicts_weekly_rule', sourceId: 'protect_sleep' }),
    ]));
  });

  it('funds work support from a selected focus and charges a competing focus in the same state', () => {
    const baseline = createInitialState('planning-counterfactual');
    const workPlan = reducePlanningStep({ state: baseline, plan }).state;
    const recoveryPlan = reducePlanningStep({
      state: createInitialState('planning-counterfactual'),
      plan: { weeklyRuleIds: ['protect_sleep', 'family_anchor'], mainGoal: 'recovery', supportingGoal: 'family' },
    }).state;
    const workOffer = getActionOffers(workPlan, 'mon_scope_expansion', registries).find((offer) => offer.actionId === 'accept_scope')!;
    const recoveryOffer = getActionOffers(recoveryPlan, 'mon_scope_expansion', registries).find((offer) => offer.actionId === 'accept_scope')!;

    expect(workOffer.planningSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'supports_main_goal', sourceId: 'work', inputPath: 'planningCapacity.attention.work' }),
      expect.objectContaining({ kind: 'supports_weekly_rule', sourceId: 'work_blocks', inputPath: 'planningCapacity.ruleSlots.work_blocks' }),
    ]));
    expect(recoveryOffer.planningSignals).toContainEqual(expect.objectContaining({ kind: 'conflicts_unfunded_goal', sourceId: 'recovery' }));
    expect(workOffer.effortScore).toBeLessThan(recoveryOffer.effortScore);
    expect(workOffer.optionPressure).toBeLessThan(recoveryOffer.optionPressure);
  });

  it('does not infer recovery support from generic state domains', () => {
    const state = reducePlanningStep({
      state: createInitialState('planning-explicit-alignment'),
      plan: { weeklyRuleIds: ['protect_sleep', 'family_anchor'], mainGoal: 'recovery', supportingGoal: 'family' },
    }).state;
    const coffee = getActionOffers(state, 'mon_breakfast', registries).find((offer) => offer.actionId === 'drink_coffee_100')!;
    expect(coffee.planningSignals.some((signal) => signal.kind.startsWith('supports_'))).toBe(false);
    expect(coffee.planningSignals).toContainEqual(expect.objectContaining({ kind: 'conflicts_unfunded_goal', sourceId: 'recovery' }));
  });

  it('applies family support only in a tagged family window and journals the concrete capacity input', () => {
    const state = reducePlanningStep({
      state: createInitialState('planning-family-window'),
      plan: { weeklyRuleIds: ['family_anchor', 'protect_sleep'], mainGoal: 'family', supportingGoal: 'recovery' },
    }).state;
    const night = getActionOffers(state, 'tue_night_wakeup', registries).find((offer) => offer.actionId === 'take_family_load')!;
    const anchor = getActionOffers(state, 'mon_family_dinner', registries).find((offer) => offer.actionId === 'protect_commitment')!;
    expect(night.planningSignals).not.toContainEqual(expect.objectContaining({ kind: 'supports_weekly_rule', sourceId: 'family_anchor' }));
    expect(anchor.planningSignals).toContainEqual(expect.objectContaining({ kind: 'supports_weekly_rule', sourceId: 'family_anchor' }));
    state.scenarioCursor = 5;
    state.clock.stepIndex = 5;
    // Ситуация теперь открывается временем и состоянием, поэтому часы должны
    // стоять в её окне, а не только курсор на её позиции.
    state.clock.dayIndex = registries.slots[5]!.dayIndex;
    state.clock.minuteOfDay = registries.slots[5]!.minuteOfDay;
    state.activeEventId = 'mon_family_dinner';
    const stepped = reduceStep({ state, openEvent: initialEvent(state, registries), actionId: 'protect_commitment' }, registries);
    expect(stepped.journalEntries.some((entry) => entry.resultPath.includes('planningCapacity.ruleSlots.family_anchor'))).toBe(true);
  });
});
