import { describe, expect, it } from 'vitest';

import { createInitialState, registries } from '../content/scenario.js';
import { collectEventCandidates, computeDecisionContext, getActionOffers, initialEvent, reduceStep } from '../reducer.js';
import { FAMILY_LOAD_NIGHTLY_RELIEF } from '../periods.js';
import type { GameState } from '../types.js';

const ASK_EVENT = 'wed_school_call';
const askAnchorIndex = registries.slots.findIndex((slot) => slot.eventId === ASK_EVENT);
const askAnchor = registries.slots[askAnchorIndex]!;

/** Ставит фикстуру в момент ситуации, где просьбу к партнёру реально можно выбрать. */
function atAskAnchor(seed: string): GameState {
  const state = createInitialState(seed);
  state.scenarioCursor = askAnchorIndex;
  state.clock.stepIndex = askAnchorIndex;
  state.clock.dayIndex = askAnchor.dayIndex;
  state.clock.minuteOfDay = askAnchor.minuteOfDay;
  state.activeEventId = ASK_EVENT;
  state.family.partner.windowFromMin = 600;
  state.family.partner.windowToMin = 1380;
  return state;
}

const askOffer = (state: GameState, eventId = ASK_EVENT) =>
  getActionOffers(state, eventId, registries).find((offer) => offer.actionId === 'ask_partner_help')!;

describe('family autonomy (Sprint 8)', () => {
  it('prices the request by the partner load and refuses only when it is explainable', () => {
    const rested = atAskAnchor('family-load');
    rested.family.partner.load = 10;
    const busy = structuredClone(rested);
    busy.family.partner.load = 55;
    const overloaded = structuredClone(rested);
    overloaded.family.partner.load = 80;

    expect(askOffer(rested).available).toBe(true);
    expect(askOffer(busy).available).toBe(true);
    expect(askOffer(busy).effortScore).toBeGreaterThan(askOffer(rested).effortScore);
    expect(askOffer(busy).geometryReasons.map((item) => item.reason)).toContain('накопленная нагрузка партнёра');

    const refused = askOffer(overloaded);
    expect(refused.available).toBe(false);
    // Отказ объясним состоянием, а не скрытым броском: причина названа и
    // указывает на конкретный вход.
    expect(refused.geometryReasons.map((item) => item.reason)).toContain('партнёр перегружен');
    expect(refused.geometryReasons.find((item) => item.reason === 'партнёр перегружен')!.inputPaths).toContain('context.partnerLoad');
  });

  it('makes the partner window a real input, not decoration', () => {
    const inside = atAskAnchor('family-window');
    const outside = structuredClone(inside);
    outside.family.partner.windowFromMin = inside.clock.minuteOfDay + 120;
    outside.family.partner.windowToMin = 1380;

    expect(computeDecisionContext(inside).partnerAvailableNow).toBe(1);
    expect(computeDecisionContext(outside).partnerAvailableNow).toBe(0);
    expect(askOffer(outside).effectiveTimeMin).toBeGreaterThan(askOffer(inside).effectiveTimeMin);
    expect(askOffer(outside).geometryReasons.map((item) => item.reason)).toContain('вне окна партнёра');
  });

  it('moves the load in both directions and names the input in the journal', () => {
    const state = atAskAnchor('family-transfer');

    const asked = reduceStep({ state, openEvent: initialEvent(state, registries), actionId: 'ask_partner_help' }, registries);
    expect(asked.state.family.partner.load).toBeGreaterThan(state.family.partner.load);
    expect(asked.journalEntries.some((entry) => entry.resultPath === 'family.partner.load')).toBe(true);

    const taken = reduceStep({ state, openEvent: initialEvent(state, registries), actionId: 'take_family_load' }, registries);
    expect(taken.state.family.partner.load).toBeLessThan(state.family.partner.load);
  });

  it('opens the reciprocal situation from the partner state and the child one from their own window', () => {
    const reciprocal = atAskAnchor('family-reciprocal');
    reciprocal.family.partner.load = 12;
    reciprocal.family.partner.trust = 84;
    expect(collectEventCandidates(reciprocal, registries).map((item) => item.templateId)).toContain('family_partner_offers');

    const loaded = structuredClone(reciprocal);
    loaded.family.partner.load = 60;
    expect(collectEventCandidates(loaded, registries).map((item) => item.templateId)).not.toContain('family_partner_offers');

    const child = createInitialState('family-child');
    child.clock.dayIndex = 0;
    child.clock.minuteOfDay = child.family.child.windowFromMin + 15;
    child.family.child.closeness = 70;
    expect(collectEventCandidates(child, registries).map((item) => item.templateId)).toContain('family_child_evening');

    const away = structuredClone(child);
    away.clock.minuteOfDay = child.family.child.windowToMin + 60;
    expect(collectEventCandidates(away, registries).map((item) => item.templateId)).not.toContain('family_child_evening');
  });

  it('turns a shared evening into a cheaper future request', () => {
    const state = atAskAnchor('family-shared-rhythm');
    state.family.partner.load = 12;

    const shared = reduceStep({ state, openEvent: initialEvent(state, registries), actionId: 'take_family_load' }, registries).state;
    expect(shared.character.capabilities).toContain('family.shared_rhythm');

    const withoutRhythm = structuredClone(shared);
    withoutRhythm.character.capabilities = withoutRhythm.character.capabilities.filter((id) => id !== 'family.shared_rhythm');
    const before = askOffer(withoutRhythm), after = askOffer(shared);
    expect(after.riskScore).toBeLessThan(before.riskScore);
    expect(after.geometryReasons.map((item) => item.reason)).toContain('закреплённый общий ритм');
  });

  it('relieves the accumulated load overnight instead of freezing it', () => {
    const state = createInitialState('family-relief');
    state.family.partner.load = 60;
    state.activeEventId = 'mon_breakfast';
    let current = state;
    while (current.clock.dayIndex === 0 && current.scenarioCursor < registries.slots.length) {
      const openEvent = initialEvent(current, registries);
      const offer = getActionOffers(current, openEvent.templateId, registries).find((item) => item.available)!;
      current = reduceStep({ state: current, openEvent, actionId: offer.actionId }, registries).state;
    }
    expect(current.clock.dayIndex).toBeGreaterThan(0);
    expect(current.family.partner.load).toBeLessThanOrEqual(60 - FAMILY_LOAD_NIGHTLY_RELIEF + 16);
  });
});
