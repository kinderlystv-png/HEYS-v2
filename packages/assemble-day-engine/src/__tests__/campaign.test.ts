import { describe, expect, it } from 'vitest';
import { getCampaignBrief, getCampaignOutcome, getCharacterDevelopment, getPeriodBoundaries, getPeriodSummary, getStepSummary } from '../campaign.js';
import { CAMPAIGN_DAYS, createInitialState, registries } from '../content/scenario.js';
import { reducePlanningStep } from '../planning.js';
import { collectEventCandidates, getActionOffers, initialEvent, reduceStep } from '../reducer.js';
import type { GameState, PeriodBoundary } from '../types.js';

function takeFirstAvailable(state: GameState) {
  const event = initialEvent(state, registries);
  const actionId = getActionOffers(state, event.templateId, registries).find((offer) => offer.available)!.actionId;
  return { actionId, output: reduceStep({ state, openEvent: event, actionId }, registries) };
}

describe('campaign brief and period summaries', () => {
  it('builds the opening brief from the actual scenario contract', () => {
    const brief = getCampaignBrief(createInitialState('brief'), registries);
    expect(brief.mission.summary).toContain('420 мин');
    expect(brief.mission.summary).toContain('пятницу 17:00');
    expect(brief.stakes.find((item) => item.id === 'commitments')?.summary).toContain('2');
    expect(brief.stakes.find((item) => item.id === 'finance')?.summary).toContain('45 000 ₽');
    expect(brief.choiceSpace).toContain(`${registries.slots.length} развилок`);
  });

  it('detects a day boundary from authored slots even before the next day clock is applied', () => {
    let state = createInitialState('day-boundary');
    let boundaries: PeriodBoundary[] = [];
    for (let index = 0; index < 6; index += 1) {
      const before = state;
      const step = takeFirstAvailable(state);
      state = step.output.state;
      boundaries = getPeriodBoundaries(before, state, registries);
    }
    expect(state.clock.dayIndex).toBe(0);
    expect(state.activeEventId).toBe('tue_night_wakeup');
    expect(boundaries).toEqual([{ id: 'day:0', kind: 'day', completedDayIndex: 0, nextDayIndex: 1, afterStepIndex: 6, periodIndex: 0 }]);
    const first = getPeriodSummary(state, boundaries[0]!, registries);
    expect(getPeriodSummary(state, boundaries[0]!, registries)).toEqual(first);
    expect(JSON.stringify(first)).not.toMatch(/vitals\.|work\.tasks|decisionGeometry|\b(?:energy|tension)\s+\d/i);
  });

  it('returns one summary per day, weekly checkpoints and a month boundary', { timeout: 120_000 }, () => {
    let state = reducePlanningStep({
      state: createInitialState('week-summary'),
      plan: { weeklyRuleIds: ['protect_sleep', 'work_blocks'], mainGoal: 'work', supportingGoal: 'family' },
    }).state;
    const boundaries: PeriodBoundary[] = [];
    while (state.scenarioCursor < registries.slots.length) {
      const before = state;
      const step = takeFirstAvailable(state);
      state = step.output.state;
      boundaries.push(...getPeriodBoundaries(before, state, registries));
    }
    // Кампания стала тридцатидневной (`CAMPAIGN_DAYS`), поэтому границ больше
    // одной недели: проверяется сам контракт периодов, а не длина авторской
    // недели.
    expect(boundaries.filter((item) => item.kind === 'day')).toHaveLength(CAMPAIGN_DAYS);
    expect(boundaries.filter((item) => item.kind === 'week').length).toBeGreaterThan(1);
    expect(boundaries.filter((item) => item.kind === 'month').length).toBeGreaterThan(0);
    const week = getPeriodSummary(state, boundaries.filter((item) => item.kind === 'week').at(-1)!, registries);
    expect(week.brief?.mission.title).toBe('Сдать проект и не потерять опоры недели');
    expect(week.rules).toHaveLength(2);
    expect(week.commitments?.summary).toMatch(/Выполнено: \d+; нарушено: \d+; осталось открыто: \d+/);
    expect(week.axes?.map((axis) => axis.id)).toEqual(['work', 'family', 'finance', 'recovery']);
    expect(week.openThreads).toEqual(getCampaignOutcome(state).openThreads);
    expect(JSON.stringify(week.axes)).not.toMatch(/Энергия \d|напряжение \d|доверие [+-]?\d/i);
  });

  it('gives a directional step result while keeping raw paths out of user copy', () => {
    const before = createInitialState('step-summary');
    const output = reduceStep({ state: before, openEvent: initialEvent(before, registries), actionId: 'eat_ready_meal' }, registries);
    const summary = getStepSummary({ before, output, registries, eventTitle: 'Начало недели', actionLabel: 'Съесть заранее приготовленный завтрак' });
    expect(summary.mainChange).toMatch(/(вырос|снизил|измен)/);
    expect(summary.causalLink).toContain('Начало недели → Съесть заранее приготовленный завтрак');
    expect(JSON.stringify(summary)).not.toMatch(/vitals\.|accumulators\.|work\.tasks/);
  });

  it('calls only future-changing character fields development and uses neutral directions', () => {
    const state = createInitialState('development-map');
    state.character.skills.professional += 2;
    state.character.skills.cooking += 2;
    state.character.skills.planning += 2;
    state.character.habits.caffeine_compensation += 2;
    state.character.habits.late_work += 2;
    state.character.habits.meal_prep += 3;
    state.character.capabilities.push('kitchen.batch_prep_familiar', 'work.reciprocal_support');
    const items = getCharacterDevelopment(state);
    expect(items.map((item) => item.id)).toEqual([
      'skill:professional',
      'skill:cooking',
      'capability:work.reciprocal_support',
    ]);
    expect(items.map((item) => item.direction)).toEqual(['strengthened', 'strengthened', 'changed']);
    expect(JSON.stringify(items)).not.toMatch(/improved|gained|Компенсация кофеином|Поздняя работа|Подготовка еды/);
    expect(items.every((item) => item.summary.length > 40 && item.evidencePaths.length > 1)).toBe(true);
  });

  it('proves distinct cooking, professional and reciprocal-support counterfactuals', () => {
    const compressed = createInitialState('development-offers');
    compressed.vitals.energy = 45;
    compressed.vitals.tension = 55;
    compressed.vitals.hunger = 55;
    compressed.accumulators.sleepDebtMin = 150;
    compressed.clock.minuteOfDay = 960;
    const practiced = structuredClone(compressed);
    practiced.character.skills.professional = 75;
    const ordinaryWork = getActionOffers(compressed, 'mon_project_block', registries).find((item) => item.actionId === 'work_standard')!;
    const practicedWork = getActionOffers(practiced, 'mon_project_block', registries).find((item) => item.actionId === 'work_standard')!;
    expect(ordinaryWork.geometryReasons.map((item) => item.reason)).toContain('низкий фокус');
    expect(practicedWork.geometryReasons.map((item) => item.reason)).not.toContain('низкий фокус');
    expect(practicedWork.effectiveTimeMin).toBeLessThan(ordinaryWork.effectiveTimeMin);

    const noviceCook = createInitialState('development-cooking-echo');
    const practicedCook = structuredClone(noviceCook);
    practicedCook.character.skills.cooking = 37;
    const noviceOffer = getActionOffers(noviceCook, 'mon_breakfast', registries).find((item) => item.actionId === 'cook_meal_batch')!;
    const practicedOffer = getActionOffers(practicedCook, 'mon_breakfast', registries).find((item) => item.actionId === 'cook_meal_batch')!;
    expect(practicedOffer.effectiveTimeMin).toBeLessThan(noviceOffer.effectiveTimeMin);
    // Ситуации открываются временем и состоянием, поэтому фикстуру нужно
    // ставить не только на позицию, но и в окно самой ситуации.
    const mealPrepAnchor = registries.slots[registries.slots.findIndex((slot) => slot.eventId === 'sat_meal_prep')]!;
    for (const state of [noviceCook, practicedCook]) {
      state.scenarioCursor = registries.slots.indexOf(mealPrepAnchor);
      state.clock.dayIndex = mealPrepAnchor.dayIndex;
      state.clock.minuteOfDay = mealPrepAnchor.minuteOfDay;
    }
    expect(collectEventCandidates(noviceCook, registries).map((item) => item.templateId)).toContain('sat_meal_prep');
    expect(collectEventCandidates(practicedCook, registries).map((item) => item.templateId)).toContain('sat_meal_prep_familiar');

    const oneWayHelp = createInitialState('development-support-echo');
    const reciprocalHelp = structuredClone(oneWayHelp);
    reciprocalHelp.character.capabilities.push('work.reciprocal_support');
    const finalIssueAnchor = registries.slots[registries.slots.findIndex((slot) => slot.eventId === 'fri_final_issue')]!;
    for (const state of [oneWayHelp, reciprocalHelp]) {
      state.scenarioCursor = registries.slots.indexOf(finalIssueAnchor);
      state.clock.dayIndex = finalIssueAnchor.dayIndex;
      state.clock.minuteOfDay = finalIssueAnchor.minuteOfDay;
    }
    expect(collectEventCandidates(oneWayHelp, registries).map((item) => item.templateId)).toContain('fri_final_issue');
    expect(collectEventCandidates(reciprocalHelp, registries).map((item) => item.templateId)).toContain('fri_final_issue_with_support');
  });
});
