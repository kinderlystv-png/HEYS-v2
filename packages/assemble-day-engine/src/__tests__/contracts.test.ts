import { describe, expect, it } from 'vitest';
import { actions } from '../content/actions.js';
import { createInitialState, events, registries, slots } from '../content/scenario.js';
import { RULE_EVIDENCE } from '../content/presentation.js';
import { validateAction, validateEffect, validateEvent, validateRegistries, validateState } from '../schema.js';
import type { Effect } from '../types.js';

describe('runtime contracts', () => {
  it('accepts the complete authored registries and exact initial fixture', () => {
    const state = createInitialState('schema-golden');
    expect(() => validateRegistries(registries, state)).not.toThrow();
    expect(() => validateState(state)).not.toThrow();
    expect(Object.keys(actions)).toHaveLength(31);
    expect(Object.keys(events)).toHaveLength(49);
    expect(Object.values(events).every((event) => event.copy.title && event.copy.situation && !event.copy.situation.startsWith('Контрольная развилка'))).toBe(true);
    expect(Object.values(actions).every((action) => RULE_EVIDENCE[action.ruleEvidenceId])).toBe(true);
    expect(actions.eat_ready_meal?.copy.contextual?.mon_breakfast?.label).toBe('Съесть заранее приготовленный завтрак');
    expect(actions.cook_meal_batch?.copy.contextual?.mon_breakfast?.label).toBe('Приготовить завтрак');
    expect(slots.map((slot) => slot.slot)).toEqual(Array.from({ length: slots.length }, (_, index) => index + 1));
    expect(state).not.toHaveProperty('derived');
    expect(state).not.toHaveProperty('context');
  });

  it('fails closed for versions, paths, operators and non-JSON values', () => {
    const state = createInitialState('bad-version');
    (state as unknown as { scenarioVersion: string }).scenarioVersion = 'wrong';
    expect(() => validateState(state)).toThrow(/contract mismatch/);
    expect(() => validateEffect({ op: 'add_state', path: 'derived.focus', delta: 1, reason: 'bad' })).toThrow(/unknown or forbidden/);
    expect(() => validateEffect({ op: 'execute_callback' } as unknown as Effect)).toThrow(/unknown effect operator/);
    const dated = structuredClone(actions.work_standard!);
    (dated.explanation as unknown as { date: Date }).date = new Date();
    expect(() => validateAction(dated)).toThrow(/non-plain JSON object/);
  });

  it('rejects incomplete content and unresolved registry references', () => {
    expect(() => validateAction({ ...actions.work_standard!, id: '' })).toThrow(/snake_case/);
    expect(() => validateEvent({ ...events.mon_breakfast!, actionIds: [] })).toThrow(/at least one action/);
    const broken = structuredClone(registries);
    broken.events.mon_breakfast!.actionIds.push('missing_action');
    expect(() => validateRegistries(broken, createInitialState('broken-registry'))).toThrow(/unknown action/);
    const badReference = structuredClone(registries);
    badReference.actions.work_standard!.immediateEffects[0] = { op: 'progress_task', taskId: 'missing_task', minutes: 1, reason: 'bad ref' };
    expect(() => validateRegistries(badReference, createInitialState('bad-ref'))).toThrow(/unknown task/);
    const badTrigger = structuredClone(actions.drink_coffee_100!);
    badTrigger.scheduledEffects[0]!.trigger = { kind: 'after_steps', steps: -3 };
    expect(() => validateAction(badTrigger)).toThrow(/must be positive/);
    const badComparator = structuredClone(actions.work_standard!);
    badComparator.requirements.push({ kind: 'range', path: 'economy.cashRub', op: 'wat' as 'gte', value: 0 });
    expect(() => validateAction(badComparator)).toThrow(/unknown comparator/);
    const rawPlaceholder = structuredClone(events.mon_breakfast!);
    rawPlaceholder.copy.situation = 'Контрольная развилка 1';
    expect(() => validateEvent(rawPlaceholder)).toThrow(/authored title and situation/);
  });
});
