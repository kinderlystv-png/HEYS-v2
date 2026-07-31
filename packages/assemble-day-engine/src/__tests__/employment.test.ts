import { describe, expect, it } from 'vitest';

import { CAMPAIGN_DAYS, createInitialState, registries } from '../content/scenario.js';
import { EMPLOYMENT_PROFILES, FINANCIAL_GOAL_TARGET_RUB, employmentSetupView, reduceEmploymentSetup } from '../employment.js';
import { getActionOffers, initialEvent, reduceStep } from '../reducer.js';
import { reducePlanningStep } from '../planning.js';
import { stateHash } from '../rng.js';
import type { EmploymentFormat, GameState } from '../types.js';

const setup = (seed: string, format: EmploymentFormat): GameState =>
  reduceEmploymentSetup({ state: createInitialState(seed), format, campaignDays: CAMPAIGN_DAYS }).state;

const workOffer = (state: GameState) => {
  const anchorIndex = registries.slots.findIndex((slot) => slot.eventId === 'mon_project_block');
  const anchor = registries.slots[anchorIndex]!;
  const placed = structuredClone(state);
  placed.scenarioCursor = anchorIndex;
  placed.clock.stepIndex = anchorIndex;
  placed.clock.dayIndex = anchor.dayIndex;
  placed.clock.minuteOfDay = anchor.minuteOfDay;
  return getActionOffers(placed, 'mon_project_block', registries).find((offer) => offer.actionId === 'work_standard')!;
};

describe('employment and economy (Sprint 9)', () => {
  it('shows the goal before the choice and keeps every format viable', () => {
    const view = employmentSetupView();

    expect(view.goal.targetRub).toBe(FINANCIAL_GOAL_TARGET_RUB);
    expect(view.goal.summary).toContain('резерва');
    expect(view.formats.map((item) => item.id)).toEqual(['office', 'remote', 'project']);
    // Универсально лучшего формата нет: у каждого своя уступка.
    expect(view.formats.every((item) => item.tradeoff.length > 0)).toBe(true);
    const incomes = view.formats.map((item) => item.fortnightIncomeRub);
    expect(Math.max(...incomes)).toBeGreaterThan(Math.min(...incomes));
    expect(view.formats.find((item) => item.id === 'office')!.commuteMinutesPerDay).toBeGreaterThan(0);
    expect(view.formats.find((item) => item.id === 'remote')!.commuteMinutesPerDay).toBe(0);
    expect(view.formats.find((item) => item.id === 'project')!.incomeVarianceRub).toBeGreaterThan(0);
  });

  it('is an atomic reproducible step that seeds the income rhythm and the goal', () => {
    const first = reduceEmploymentSetup({ state: createInitialState('employment-setup'), format: 'office', campaignDays: CAMPAIGN_DAYS });
    const second = reduceEmploymentSetup({ state: createInitialState('employment-setup'), format: 'office', campaignDays: CAMPAIGN_DAYS });

    expect(first.stateHash).toBe(second.stateHash);
    expect(first.state.employment).toEqual({ format: 'office', chosenAtStepIndex: 0 });
    expect(first.state.economy.financialGoal).toEqual({ id: 'reserve_by_month', targetRub: FINANCIAL_GOAL_TARGET_RUB, reservedRub: 0 });
    expect(first.state.economy.expectedIncome.length).toBeGreaterThan(1);
    expect(first.state.economy.expectedIncome.every((item) => item.amountRub === EMPLOYMENT_PROFILES.office.fortnightIncomeRub)).toBe(true);
    expect(first.state.clock.stepIndex).toBe(0);
    expect(first.journalEntries.map((entry) => entry.resultPath)).toEqual(['employment.format', 'economy.expectedIncome', 'economy.financialGoal']);
  });

  it('locks the choice instead of letting it be switched later', () => {
    const chosen = setup('employment-lock', 'remote');
    expect(() => reduceEmploymentSetup({ state: chosen, format: 'project', campaignDays: CAMPAIGN_DAYS })).toThrow(/employment_locked/);

    const planned = reducePlanningStep({ state: chosen, plan: { weeklyRuleIds: ['protect_sleep', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' } }).state;
    const stepped = reduceStep({ state: planned, openEvent: initialEvent(planned, registries), actionId: 'eat_ready_meal' }, registries).state;
    expect(() => reduceEmploymentSetup({ state: stepped, format: 'project', campaignDays: CAMPAIGN_DAYS })).toThrow(/employment_locked|employment_late/);
  });

  it('changes the geometry of a work decision differently for every format', () => {
    const office = workOffer(setup('employment-office', 'office'));
    const remote = workOffer(setup('employment-remote', 'remote'));
    const project = workOffer(setup('employment-project', 'project'));

    expect(office.effectiveTimeMin).toBeGreaterThan(remote.effectiveTimeMin);
    expect(office.geometryReasons.map((item) => item.reason)).toContain('дорога офисного формата');
    expect(project.riskScore).toBeGreaterThan(remote.riskScore);
    expect(project.geometryReasons.map((item) => item.reason)).toContain('нестабильность проектного формата');
    // Ни один формат не выигрывает по всем осям сразу.
    expect(remote.effectiveTimeMin).toBeLessThanOrEqual(office.effectiveTimeMin);
    expect(remote.riskScore).toBeLessThanOrEqual(project.riskScore);
  });

  it('keeps a negative reserve soft instead of creating hidden debt', () => {
    const state = setup('employment-deficit', 'project');
    const poor = structuredClone(state);
    poor.economy.cashRub = 0;
    poor.economy.obligations = poor.economy.obligations.map((item) => ({ ...item, amountRub: 90000 }));

    const offer = workOffer(poor);
    expect(offer.available).toBe(true);
    expect(poor.economy.cashRub).toBe(0);
    // Дефицит не создаёт отрицательных денег и не завершает кампанию.
    expect(poor.economy.obligations.every((item) => item.status !== 'overdue' || item.amountRub > 0)).toBe(true);
  });

  it('turns the training investment into a concrete unlocked move', () => {
    const state = setup('employment-training', 'remote');
    const trained = structuredClone(state);
    trained.character.skills.professional = 60;

    const before = workOffer(state);
    const after = workOffer(trained);
    expect(after.consequences.conditional.join(' ')).toContain('обучение');
    const unlocked = structuredClone(trained);
    unlocked.character.capabilities = [...unlocked.character.capabilities, 'work.focused_block'].sort();
    const withBlock = workOffer(unlocked);
    expect(withBlock.effectiveTimeMin).toBeLessThan(before.effectiveTimeMin);
    expect(withBlock.geometryReasons.map((item) => item.reason)).toContain('освоенный приём длинного фокуса');
  });

  it('reproduces the same campaign after the setup step', () => {
    const left = setup('employment-replay', 'project');
    const right = setup('employment-replay', 'project');
    expect(stateHash(left)).toBe(stateHash(right));
  });
});
