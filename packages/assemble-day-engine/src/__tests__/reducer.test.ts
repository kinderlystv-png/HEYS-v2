import { describe, expect, it } from 'vitest';
import { createInitialState, registries } from '../content/scenario.js';
import { collectEventCandidates, getActionOffers, initialEvent, isHeavyState, reduceStep, reduceTrustedCampaignStep } from '../reducer.js';
import { stateHash } from '../rng.js';
import { runCampaign } from '../simulation.js';
import { ReducerError, type GameState, type Registries } from '../types.js';

const STAGES = ['validate', 'advanceEnvironment', 'applyCosts', 'applyImmediateEffects', 'scheduleEffects', 'resolveCommitments', 'updateDerivedContext', 'collectEventCandidates', 'selectNextEvent', 'appendCausalJournal'];
const eventAt = (state: GameState, source: Registries = registries) => initialEvent(state, source);
const setCursor = (state: GameState, cursor: number, minuteOfDay: number): void => {
  state.scenarioCursor = cursor;
  state.clock.stepIndex = cursor;
  state.clock.dayIndex = registries.slots[cursor]!.dayIndex;
  state.clock.minuteOfDay = minuteOfDay;
  state.activeEventId = registries.slots[cursor]!.eventId!;
};

describe('atomic ten-stage reducer', () => {
  it('matches a literal golden hash, is deterministic and leaves input untouched', () => {
    const input = createInitialState('golden');
    const before = stateHash(input);
    const first = reduceStep({ state: input, openEvent: eventAt(input), actionId: 'eat_ready_meal' }, registries, true);
    const duplicate = createInitialState('golden');
    const second = reduceStep({ state: duplicate, openEvent: eventAt(duplicate), actionId: 'eat_ready_meal' }, registries, true);
    expect(first.stages.map((item) => item.stage)).toEqual(STAGES);
    expect(first.stateHash).toBe('4e5ba74c29a8b105');
    expect(first.stateHash).toBe(second.stateHash);
    expect(first.stages.map((item) => item.hash)).toEqual(second.stages.map((item) => item.hash));
    expect(first.nextEvent?.templateId).toBe('mon_commute');
    expect(stateHash(input)).toBe(before);
    expect(input.scenarioCursor).toBe(0);
  });

  it('returns a structured validation error without mutating state or RNG', () => {
    const input = createInitialState('rollback');
    input.economy.foodPortions.ready_meal = 0;
    const before = stateHash(input);
    let caught: unknown;
    try { reduceStep({ state: input, openEvent: eventAt(input), actionId: 'eat_ready_meal' }, registries); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(ReducerError);
    expect(caught).toMatchObject({ code: 'unavailable_action', stage: 'validate', entityId: 'eat_ready_meal' });
    expect(stateHash(input)).toBe(before);
    expect(input.rng.occurrences).toEqual({});
    const offer = getActionOffers(input, 'mon_breakfast', registries).find((item) => item.actionId === 'eat_ready_meal')!;
    expect(offer.unavailableMessages).toEqual(['Нет заранее приготовленной порции.']);
    expect(offer.unavailableMessages.join(' ')).not.toMatch(/insufficient_|requirement:/);
  });

  it('prices breakfast cooking only in a compressed morning and journals the input factor', () => {
    const compressed = createInitialState('compressed-breakfast');
    const compressedOffer = getActionOffers(compressed, 'mon_breakfast', registries).find((offer) => offer.actionId === 'cook_meal_batch')!;
    expect(compressedOffer).toMatchObject({ effectiveTimeMin: 70, effortScore: 37, effortLevel: 'high', riskScore: 12, risk: 'moderate', optionPressure: 20 });
    expect(compressedOffer.consequencePreview).toEqual(['Сжатое утро: готовка потребует ещё 10 минут, больше усилия и повысит напряжение']);
    expect(compressedOffer.geometryReasons[0]?.evidence).toMatchObject({ id: 're_multifactor_task_geometry', confidence: 'plausible_model' });
    expect(compressedOffer.consequences.conditional).toContain('Срочный рабочий хвост и ограниченное утреннее окно повышают напряжение от готовки');
    const awakeSinceMinute = compressed.clock.awakeSinceMinute;
    const output = reduceStep({ state: compressed, openEvent: eventAt(compressed), actionId: 'cook_meal_batch' }, registries);
    expect(output.state.clock.awakeSinceMinute).toBe(awakeSinceMinute);
    expect(output.journalEntries.some((entry) => entry.resultPath === 'decisionGeometry.cook_meal_batch.context.deadlinePressure')).toBe(true);
    expect(output.journalEntries.some((entry) => entry.resultPath === 'vitals.tension' && entry.mechanism === 'готовка в сжатом утре')).toBe(true);

    const openMorning = createInitialState('open-breakfast');
    openMorning.work.tasks[0]!.remainingMin = 120;
    openMorning.work.projectBacklogMin = 120;
    const openOffer = getActionOffers(openMorning, 'mon_breakfast', registries).find((offer) => offer.actionId === 'cook_meal_batch')!;
    expect(openOffer).toMatchObject({ effectiveTimeMin: 60, effortScore: 22, effortLevel: 'normal', riskScore: 4, risk: 'none', optionPressure: 0 });
    expect(openOffer.consequencePreview).toEqual([]);
    const openOutput = reduceStep({ state: openMorning, openEvent: eventAt(openMorning), actionId: 'cook_meal_batch' }, registries);
    expect(openOutput.journalEntries.some((entry) => entry.resultPath === 'vitals.tension' && entry.mechanism === 'готовка в сжатом утре')).toBe(false);

    const weekend = createInitialState('weekend-breakfast');
    weekend.clock.dayIndex = 6;
    const weekendOffer = getActionOffers(weekend, 'mon_breakfast', registries).find((offer) => offer.actionId === 'cook_meal_batch')!;
    expect(weekendOffer.consequencePreview).toEqual([]);
  });

  it('turns repeated cooking into a skill threshold that changes later offer geometry', () => {
    const state = createInitialState('development-cooking');
    const first = reduceStep({ state, openEvent: eventAt(state), actionId: 'cook_meal_batch' }, registries);
    expect(first.state.character.skills.cooking).toBe(37);
    expect(first.state.character.habits.meal_prep).toBe(23);
    const experienced = createInitialState('development-cooking-unlock');
    experienced.character.skills.cooking = 39;
    const offer = getActionOffers(experienced, 'mon_breakfast', registries).find((item) => item.actionId === 'cook_meal_batch')!;
    expect(offer.effectiveTimeMin).toBe(60);
    expect(offer.geometryReasons.map((item) => item.reason)).toContain('освоенный порядок готовки');
    const unlocked = reduceStep({ state: experienced, openEvent: eventAt(experienced), actionId: 'cook_meal_batch' }, registries);
    expect(unlocked.state.character.capabilities).toContain('kitchen.batch_prep_familiar');
    expect(unlocked.journalEntries.some((entry) => entry.resultPath === 'character.capabilities')).toBe(true);
  });

  it('persists an engine-selected echo event as the only valid next branch', () => {
    const state = createInitialState('echo-persisted');
    const cursor = registries.slots.findIndex((slot) => slot.eventId === 'fri_final_issue');
    setCursor(state, cursor, registries.slots[cursor]!.minuteOfDay);
    state.character.capabilities.push('work.reciprocal_support');
    state.activeEventId = 'fri_final_issue_with_support';
    const event = eventAt(state);
    expect(event.templateId).toBe('fri_final_issue_with_support');
    const output = reduceStep({ state, openEvent: event, actionId: 'work_careful' }, registries);
    expect(output.state.scenarioCursor).toBe(cursor + 1);
    expect(output.state.activeEventId).toBe(output.nextEvent?.templateId);
  });

  it('applies effective duration exactly once and derives it from the pre-action context', () => {
    const rested = createInitialState('time-rested');
    setCursor(rested, 4, 960);
    rested.vitals.energy = 90; rested.vitals.tension = 10; rested.vitals.hunger = 10; rested.accumulators.sleepDebtMin = 0;
    const tired = structuredClone(rested);
    tired.rng.seed = 'time-tired'; tired.campaignId = 'week01:time-tired'; tired.vitals.energy = 25; tired.vitals.tension = 78; tired.vitals.hunger = 72; tired.accumulators.sleepDebtMin = 300;
    const restedOutput = reduceStep({ state: rested, openEvent: eventAt(rested), actionId: 'work_standard' }, registries);
    const tiredOutput = reduceStep({ state: tired, openEvent: eventAt(tired), actionId: 'work_standard' }, registries);
    expect(restedOutput.appliedAction.effectiveTimeMin).toBe(75);
    expect(tiredOutput.appliedAction.effectiveTimeMin).toBe(100);
    expect(restedOutput.state.clock.minuteOfDay).toBe(1035);
    expect(tiredOutput.state.clock.minuteOfDay).toBe(1060);
    expect(tiredOutput.appliedAction.geometryReasons.flatMap((item) => item.inputPaths)).toContain('context.focusByTaskId.project_delivery');
  });

  it('evaluates conditional effects against the pre-action snapshot and journals the input geometry', () => {
    const input = createInitialState('pre-action');
    setCursor(input, 4, 960);
    input.accumulators.sleepDebtMin = 200;
    input.vitals.energy = 30; input.vitals.tension = 75; input.vitals.hunger = 70;
    const output = reduceStep({ state: input, openEvent: eventAt(input), actionId: 'work_standard' }, registries);
    expect(output.journalEntries.some((entry) => entry.sourceId === 'work_standard' && entry.mechanism === 'дефицит сна повысил цену работы')).toBe(true);
    expect(output.journalEntries.some((entry) => entry.resultPath === 'decisionGeometry.work_standard.context.focusByTaskId.project_delivery')).toBe(true);
  });

  it('runs due queue entries in stable trigger/id order', () => {
    const input = createInitialState('queue');
    input.scheduledEffects.push(
      { id: 'a_after', sourceId: 'a_after', trigger: { kind: 'after_steps', remainingSteps: 1 }, effects: [{ op: 'add_state', path: 'vitals.mood', delta: 2, reason: 'after step' }], status: 'pending' },
      { id: 'b_condition', sourceId: 'b_condition', trigger: { kind: 'condition', condition: { kind: 'compare', path: 'vitals.energy', op: 'gte', value: 1 } }, effects: [{ op: 'add_state', path: 'vitals.mood', delta: 3, reason: 'condition' }], status: 'pending' },
      { id: 'c_time', sourceId: 'c_time', trigger: { kind: 'at_time', dayIndex: 0, minuteOfDay: 421 }, effects: [{ op: 'add_state', path: 'vitals.mood', delta: 4, reason: 'time' }], status: 'pending' },
    );
    const output = reduceStep({ state: input, openEvent: eventAt(input), actionId: 'eat_quick_base' }, registries);
    const sources = output.journalEntries.filter((entry) => ['a_after', 'b_condition', 'c_time'].includes(entry.sourceId) && entry.resultPath === 'vitals.mood').map((entry) => entry.sourceId);
    expect(sources).toEqual(['c_time', 'a_after', 'b_condition']);
    expect(output.state.scheduledEffects.filter((item) => ['a_after', 'b_condition', 'c_time'].includes(item.id)).every((item) => item.status === 'applied')).toBe(true);
  });

  it('clamps after every operator rather than only after the effect list', () => {
    const local = structuredClone(registries);
    local.actions.eat_quick_base!.immediateEffects = [
      { op: 'add_state', path: 'vitals.mood', delta: 200, reason: 'cap high' },
      { op: 'add_state', path: 'vitals.mood', delta: -20, reason: 'subtract after cap' },
    ];
    const input = createInitialState('clamp');
    const output = reduceStep({ state: input, openEvent: eventAt(input, local), actionId: 'eat_quick_base' }, local);
    expect(output.state.vitals.mood).toBe(80);
  });

  it('never permits cash to become negative', () => {
    const input = createInitialState('cash');
    setCursor(input, 1, 480);
    input.economy.cashRub = 1799;
    const before = stateHash(input);
    expect(() => reduceStep({ state: input, openEvent: eventAt(input), actionId: 'buy_time_taxi' }, registries)).toThrow(/unavailable_action/);
    expect(input.economy.cashRub).toBe(1799);
    expect(stateHash(input)).toBe(before);
  });

  it('can renegotiate before resolution even when the action crosses the old due time', () => {
    const local = structuredClone(registries);
    local.actions.protect_commitment!.immediateEffects = [{ op: 'renegotiate_commitment', commitmentId: 'family_week', dueDayIndex: 6, dueMinuteOfDay: 1140, reason: 'срок согласован заранее' }];
    const input = createInitialState('renegotiate');
    setCursor(input, 28, 1130);
    const output = reduceStep({ state: input, openEvent: eventAt(input, local), actionId: 'protect_commitment' }, local);
    const commitment = output.state.commitments.find((item) => item.id === 'family_week');
    expect(commitment).toMatchObject({ status: 'renegotiated', dueDayIndex: 6, renegotiationsUsed: 1 });
    expect(output.journalEntries.some((entry) => entry.mechanism === 'срок согласован заранее')).toBe(true);
  });

  it('rejects stale EventInstance and records each material state change with a real source', () => {
    const input = createInitialState('journal');
    const stale = { ...eventAt(input), stepIndex: 99 };
    expect(() => reduceStep({ state: input, openEvent: stale, actionId: 'eat_quick_base' }, registries)).toThrow(/stale_event/);
    const output = reduceStep({ state: input, openEvent: eventAt(input), actionId: 'eat_quick_base' }, registries);
    expect(output.journalEntries.map((entry) => entry.resultPath)).toEqual(expect.arrayContaining(['clock', 'economy.foodPortions.quick_base', 'vitals.hunger', 'scenarioCursor', 'clock.stepIndex', 'eventLedger']));
    expect(output.journalEntries.every((entry) => entry.sourceId.length > 0 && entry.mechanism.length > 0)).toBe(true);
  });

  it('filters event candidates by budget and cooldown', () => {
    const input = createInitialState('candidates');
    setCursor(input, 12, 480);
    input.eventLedger.dayExternalLoad['2'] = 20;
    expect(collectEventCandidates(input, registries).map((item) => item.templateId)).not.toContain('wed_commute_delay');
    input.eventLedger.dayExternalLoad['2'] = 0;
    expect(collectEventCandidates(input, registries).map((item) => item.templateId)).toContain('wed_commute_delay');
    input.eventCooldownUntilDay.wed_commute_delay = 4;
    expect(collectEventCandidates(input, registries).map((item) => item.templateId)).not.toContain('wed_commute_delay');
  });

  it('uses seeded weighted selection for candidates tied after priority ordering', () => {
    const select = (seed: string) => {
      const local = structuredClone(registries);
      local.events.mon_commute_alt = { ...structuredClone(local.events.mon_commute!), id: 'mon_commute_alt', selectionWeight: 3 };
      const input = createInitialState(seed);
      return reduceStep({ state: input, openEvent: eventAt(input, local), actionId: 'eat_quick_base' }, local).nextEvent;
    };
    const first = select('weighted-golden');
    const duplicate = select('weighted-golden');
    expect(first?.templateId).toBe(duplicate?.templateId);
    expect(first?.openedBy.selectionRule).toBe('source>hardWindow>urgency>weighted-id');
  });

  it('rolls back rejected onOpen candidates identically in public and trusted paths', () => {
    const local = structuredClone(registries);
    local.events.mon_commute!.onOpenEffects = [{ op: 'add_state', path: 'vitals.energy', delta: -100, reason: 'rejected candidate damage' }];
    for (const id of local.events.mon_commute!.actionIds) { local.actions[id]!.baseOptionPressure = 100; local.actions[id]!.stabilizes = []; }
    local.events.mon_commute_alt = { ...structuredClone(local.events.mon_commute!), id: 'mon_commute_alt', source: 'scheduled_consequence', onOpenEffects: [], actionIds: ['eat_quick_base'] };
    const publicInput = createInitialState('rollback-candidate');
    const trustedInput = createInitialState('rollback-candidate');
    const publicOutput = reduceStep({ state: publicInput, openEvent: eventAt(publicInput, local), actionId: 'eat_quick_base' }, local);
    const trustedOutput = reduceTrustedCampaignStep({ state: trustedInput, openEvent: eventAt(trustedInput, local), actionId: 'eat_quick_base' }, local);
    expect(publicOutput.nextEvent?.templateId).toBe('mon_commute_alt');
    expect(trustedOutput.nextEvent?.templateId).toBe('mon_commute_alt');
    expect(stateHash(trustedOutput.state)).toBe(publicOutput.stateHash);
    expect(trustedOutput.state.eventLedger.occurrences.mon_commute).toBeUndefined();
    expect(trustedOutput.state.eventLedger.occurrences.mon_commute_alt).toBe(1);
  });

  it('uses the exact D56 heavy predicate and rejects a next event without a domain stabilizer', () => {
    const local = structuredClone(registries);
    for (const id of local.events.mon_commute!.actionIds) { local.actions[id]!.baseOptionPressure = 0; local.actions[id]!.stabilizes = []; }
    local.events.mon_commute_alt = { ...structuredClone(local.events.mon_commute!), id: 'mon_commute_alt', source: 'scheduled_consequence', actionIds: ['eat_quick_base'] };
    const input = createInitialState('d56-heavy');
    input.vitals.tension = 81;
    expect(isHeavyState(input)).toBe(true);
    const output = reduceStep({ state: input, openEvent: eventAt(input, local), actionId: 'eat_quick_base' }, local);
    expect(output.nextEvent?.templateId).toBe('mon_commute_alt');
    expect(output.state.eventLedger.occurrences.mon_commute).toBeUndefined();
  });

  it('applies an authored delayed coffee effect after exactly three subsequent steps', () => {
    let state = createInitialState('coffee-queue');
    let open = eventAt(state);
    let output = reduceStep({ state, openEvent: open, actionId: 'drink_coffee_100' }, registries);
    state = output.state; open = output.nextEvent!;
    const scheduledId = state.scheduledEffects.find((item) => item.sourceId === 'drink_coffee_100')!.id;
    expect(state.scheduledEffects.find((item) => item.id === scheduledId)?.trigger).toMatchObject({ kind: 'after_steps', remainingSteps: 3 });
    for (const actionId of ['commute_transit', 'renegotiate_work']) { output = reduceStep({ state, openEvent: open, actionId }, registries); state = output.state; open = output.nextEvent!; }
    expect(state.scheduledEffects.find((item) => item.id === scheduledId)?.status).toBe('pending');
    output = reduceStep({ state, openEvent: open, actionId: 'eat_quick_base' }, registries);
    expect(output.state.scheduledEffects.find((item) => item.id === scheduledId)?.status).toBe('applied');
  });

  it('reaches every anchor of the campaign, crosses sleep boundaries and closes the last day', { timeout: 120_000 }, () => {
    const result = runCampaign('all-slots', 'balanced');
    expect(result.visitedSlots).toEqual(Array.from({ length: registries.slots.length }, (_, index) => index + 1));
    expect(result.terminalLocks).toBe(0);
    const final = runCampaign('all-slots', 'balanced');
    expect(final.finalStateHash).toBe(result.finalStateHash);
    expect(result.transitions).toHaveLength(registries.slots.length);
  });

  it('keeps a real hunger stabilizer in the Saturday meal-prep fork', () => {
    const result = runCampaign('qa-00129', 'random_valid', true, false, false);
    expect(result.heavyWithoutStabilizerEvents).not.toContain('sat_meal_prep');
    expect(result.terminalLocks).toBe(0);
  });

  it('keeps trusted mass-QA semantics equivalent to the atomic path', { timeout: 120_000 }, () => {
    const atomic = runCampaign('equivalence', 'random_valid', false);
    const trusted = runCampaign('equivalence', 'random_valid', true);
    expect(trusted.finalStateHash).toBe(atomic.finalStateHash);
    expect(trusted.chosenActions).toEqual(atomic.chosenActions);
    expect(trusted.visitedEvents).toEqual(atomic.visitedEvents);
  });
});
