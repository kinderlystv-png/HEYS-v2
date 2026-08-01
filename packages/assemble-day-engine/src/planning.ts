import { canonicalJson, stateHash } from './rng.js';
import { validateState } from './schema.js';
import { WEEKLY_RULE_PRESETS } from './content/planning.js';
import { currentWeekIndex } from './periods.js';
import {
  ReducerError,
  type ActionDefinition,
  type DecisionContext,
  type GameState,
  type PlanningDomain,
  type PlanningAdjustment,
  type PlanningPlan,
  type PlanningSignal,
  type PlanningStepOutput,
  type PlanningView,
  type WeeklyRulePresetId,
} from './types.js';

const WEEKLY_RULE_SLOTS = 2;
const ATTENTION_CAPACITY_UNITS = 3;
const RULE_IDS = new Set<WeeklyRulePresetId>(WEEKLY_RULE_PRESETS.map((item) => item.id));
const DOMAINS: ReadonlyArray<{ id: PlanningDomain; title: string }> = [
  { id: 'work', title: 'Работа' },
  { id: 'family', title: 'Семья' },
  { id: 'recovery', title: 'Восстановление' },
  { id: 'social', title: 'Друзья и увлечения' },
];
const DOMAIN_IDS = new Set<PlanningDomain>(DOMAINS.map((item) => item.id));
const clone = <T>(value: T): T => structuredClone(value);

function validatePlan(plan: PlanningPlan): PlanningView['issues'] {
  const issues: PlanningView['issues'] = [];
  const ids = Array.isArray(plan?.weeklyRuleIds) ? plan.weeklyRuleIds : [];
  if (ids.length !== WEEKLY_RULE_SLOTS) issues.push({ code: 'weekly_capacity', message: 'Выберите ровно две границы: третья не помещается в ёмкость недели.' });
  if (new Set(ids).size !== ids.length) issues.push({ code: 'weekly_duplicate', message: 'Одно правило недели выбрано несколько раз.' });
  if (ids.some((id) => !RULE_IDS.has(id))) issues.push({ code: 'weekly_unknown', message: 'В плане есть неизвестное правило недели.' });
  if (!DOMAIN_IDS.has(plan?.mainGoal)) issues.push({ code: 'main_unknown', message: 'Выберите главный фокус месяца.' });
  if (!DOMAIN_IDS.has(plan?.supportingGoal)) issues.push({ code: 'supporting_unknown', message: 'Выберите поддерживающий фокус месяца.' });
  if (plan?.mainGoal === plan?.supportingGoal) issues.push({ code: 'goals_equal', message: 'Главный и поддерживающий фокус должны отличаться.' });
  return issues;
}

function pressureLevel(value: number): PlanningView['pressures'][number]['level'] {
  return value >= 67 ? 'высокое' : value >= 38 ? 'умеренное' : 'низкое';
}

function recoveryPressure(state: GameState, context: DecisionContext): number {
  return Math.max(context.sleepiness, 100 - state.vitals.energy, state.accumulators.recoveryNeed);
}

export function getPlanningView(state: GameState, plan: PlanningPlan, context: DecisionContext): PlanningView {
  validateState(state);
  const issues = validatePlan(plan);
  const selected = new Set(plan.weeklyRuleIds);
  const openTasks = state.work.tasks.filter((item) => item.status === 'open' || item.status === 'renegotiated');
  const hardCommitments = state.commitments.filter((item) => item.status === 'open' && item.hard);
  const socialCommitments = state.commitments.filter((item) => item.status === 'open' && item.domain === 'social');
  const expectedIncome = state.economy.expectedIncome.filter((item) => item.status === 'expected');
  const obligations = state.economy.obligations.filter((item) => item.status === 'scheduled' || item.status === 'deferred' || item.status === 'overdue');
  const expectedIncomeRub = expectedIncome.reduce((sum, item) => sum + item.amountRub, 0);
  const obligationsRub = obligations.reduce((sum, item) => sum + item.amountRub, 0);
  const recovery = recoveryPressure(state, context);
  const conflicts: PlanningView['conflicts'] = [];
  if (selected.has('family_anchor') && selected.has('work_blocks') && hardCommitments.length && openTasks.length) {
    conflicts.push({ id: 'work_family_window', severity: 'critical', title: 'Работа и семья претендуют на одно окно', reason: `${openTasks[0]!.remainingMin} мин работы и жёсткие договорённости (${hardCommitments.length}) требуют места в неделе.`, inputPaths: ['work.tasks', 'commitments'] });
  }
  if (selected.has('protect_sleep') && selected.has('work_blocks') && context.deadlinePressure >= 67) {
    conflicts.push({ id: 'work_sleep_window', severity: 'important', title: 'Срок проекта давит на границу сна', reason: 'Рабочие блоки нужно разместить до вечернего окна, а не поверх него.', inputPaths: ['context.deadlinePressure', 'weeklyRules'] });
  }
  const importantDates = [
    ...openTasks.map((item) => ({ id: `task:${item.id}`, dayIndex: item.dueDayIndex, title: 'Срок проекта' })),
    ...hardCommitments.map((item) => ({ id: `commitment:${item.id}`, dayIndex: item.dueDayIndex, title: item.domain === 'family' ? 'Семейная договорённость' : 'Обязательство' })),
    ...expectedIncome.map((item) => ({ id: `income:${item.id}`, dayIndex: item.dueDayIndex, title: 'Ожидаемое поступление' })),
    ...obligations.map((item) => ({ id: `obligation:${item.id}`, dayIndex: item.dueDayIndex, title: 'Обязательный платёж' })),
  ].sort((left, right) => left.dayIndex - right.dayIndex || left.id.localeCompare(right.id));
  const risks: PlanningView['risks'] = [];
  if (openTasks.length) risks.push({ id: 'project_deadline', title: 'Срок проекта', reason: `${openTasks[0]!.remainingMin} мин работы остаётся до дня ${openTasks[0]!.dueDayIndex + 1}.` });
  if (hardCommitments.length) risks.push({ id: 'hard_commitments', title: 'Жёсткие договорённости', reason: `${hardCommitments.length} события нельзя сдвинуть без явной цены.` });
  if (context.cashAfterNextObligationsRub < 0) risks.push({ id: 'negative_reserve', title: 'Отрицательный финансовый резерв', reason: `После ожидаемых поступлений и платежей не хватает ${Math.abs(context.cashAfterNextObligationsRub).toLocaleString('ru-RU')} ₽.` });
  if (recovery >= 67) risks.push({ id: 'recovery_pressure', title: 'Высокая потребность в восстановлении', reason: 'Текущий запас сил ограничивает плотные решения.' });
  const opportunities: PlanningView['opportunities'] = [];
  if (expectedIncomeRub > 0) opportunities.push({ id: 'expected_income', title: 'Ожидаемое поступление', reason: `${expectedIncomeRub.toLocaleString('ru-RU')} ₽ уже есть в сценарии как ожидаемый доход.` });
  if (state.economy.foodPortions.ready_meal > 0) opportunities.push({ id: 'ready_meals', title: 'Готовые порции', reason: `${state.economy.foodPortions.ready_meal} порции сокращают цену ближайших решений о еде.` });
  if (state.character.capabilities.includes('work.ask_colleague_help')) opportunities.push({ id: 'colleague_help', title: 'Можно попросить коллегу', reason: 'Эта возможность уже открыта у персонажа.' });
  return {
    valid: issues.length === 0,
    issues,
    weeklyRules: WEEKLY_RULE_PRESETS.map((item) => ({ ...item, selected: selected.has(item.id) })),
    monthlyGoals: DOMAINS.map((item) => ({ ...item })),
    capacity: {
      weekly: { totalSlots: WEEKLY_RULE_SLOTS, allocatedSlots: selected.size, remainingSlots: Math.max(0, WEEKLY_RULE_SLOTS - selected.size) },
      attention: {
        totalUnits: ATTENTION_CAPACITY_UNITS,
        allocatedUnits: plan.mainGoal === plan.supportingGoal ? 2 : ATTENTION_CAPACITY_UNITS,
        unallocatedUnits: plan.mainGoal === plan.supportingGoal ? 1 : 0,
        mainUnits: 2,
        supportingUnits: plan.mainGoal === plan.supportingGoal ? 0 : 1,
      },
    },
    pressures: [
      { domain: 'work', title: 'Работа', level: pressureLevel(context.deadlinePressure), reason: `${state.work.projectBacklogMin} мин открытой работы.` },
      { domain: 'family', title: 'Семья', level: pressureLevel(Math.max(context.familyImbalance, hardCommitments.length ? 52 : 0)), reason: hardCommitments.length ? `Жёстких договорённостей: ${hardCommitments.length}.` : 'Жёстких договорённостей нет.' },
      { domain: 'recovery', title: 'Восстановление', level: pressureLevel(recovery), reason: `${state.accumulators.sleepDebtMin} мин долга сна.` },
      { domain: 'social', title: 'Друзья и увлечения', level: pressureLevel(socialCommitments.length * 26), reason: socialCommitments.length ? `Открытых договорённостей: ${socialCommitments.length}.` : 'Открытых договорённостей сейчас нет.' },
    ],
    conflicts,
    financialHorizon: { cashRub: state.economy.cashRub, expectedIncomeRub, obligationsRub, cashAfterNextObligationsRub: context.cashAfterNextObligationsRub },
    importantDates,
    risks,
    opportunities,
  };
}

export function reducePlanningStep(input: { state: GameState; plan: PlanningPlan }): PlanningStepOutput {
  try {
    validateState(input.state);
  } catch (error) {
    throw new ReducerError('invalid_state', 'planning', undefined, [error instanceof Error ? error.message : String(error)]);
  }
  const issues = validatePlan(input.plan);
  const weekIndex = currentWeekIndex(input.state);
  if (issues.length) throw new ReducerError('invalid_content', 'planning', 'planning_plan', issues.map((item) => `${item.code}:${item.message}`));
  const state = clone(input.state);
  const weeklyRules = WEEKLY_RULE_PRESETS
    .filter((item) => input.plan.weeklyRuleIds.includes(item.id))
    .map((item) => ({ id: item.id, kind: item.kind, enabled: true, sourceId: 'planning_plan' }));
  const monthlyPriorities = DOMAINS.map((item) => ({ domain: item.id, level: item.id === input.plan.mainGoal ? 2 as const : item.id === input.plan.supportingGoal ? 1 as const : 0 as const }));
  if (canonicalJson(state.weeklyRules) === canonicalJson(weeklyRules) && canonicalJson(state.monthlyPriorities) === canonicalJson(monthlyPriorities)) {
    throw new ReducerError('invalid_content', 'planning', 'planning_plan', ['no_op:plan already confirmed']);
  }
  // Контракт недели фиксируется один раз на неделю: следующая неделя получает
  // собственный planning-шаг, а уже закрытая неделя не переписывается задним числом.
  if (state.periods.plannedWeeks.includes(weekIndex)) {
    throw new ReducerError('invalid_content', 'planning', 'planning_plan', ['planning_locked:контракт этой недели уже зафиксирован']);
  }
  const startJournal = state.causalJournal.length;
  const journalBase = { dayIndex: state.clock.dayIndex, stepIndex: state.clock.stepIndex, sourceId: 'planning_plan', confidence: 'established' as const };
  state.causalJournal.push(
    { ...journalBase, id: `journal:${state.rng.seed}:planning:${startJournal}:weekly`, mechanism: 'правила недели подтверждены', resultPath: 'weeklyRules', before: canonicalJson(state.weeklyRules), after: canonicalJson(weeklyRules) },
    { ...journalBase, id: `journal:${state.rng.seed}:planning:${startJournal + 1}:monthly`, mechanism: 'приоритеты месяца подтверждены', resultPath: 'monthlyPriorities', before: canonicalJson(state.monthlyPriorities), after: canonicalJson(monthlyPriorities) },
  );
  state.weeklyRules = weeklyRules;
  state.monthlyPriorities = monthlyPriorities;
  state.periods.plannedWeeks = [weekIndex];
  validateState(state);
  return { state, journalEntries: state.causalJournal.slice(startJournal), stateHash: stateHash(state) };
}

export function getPlanningAdjustment(state: GameState, action: ActionDefinition, _eventId: string, effectiveTimeMin: number, eventTags: string[] = []): PlanningAdjustment {
  if (!state.causalJournal.some((entry) => entry.sourceId === 'planning_plan')) return { delta: { timeMin: 0, moneyRub: 0, effortScore: 0, riskScore: 0, optionPressure: 0 }, signals: [], inputPaths: [] };
  const signals: PlanningSignal[] = [];
  const delta = { timeMin: 0, moneyRub: 0, effortScore: 0, riskScore: 0, optionPressure: 0 };
  const inputPaths = new Set<string>();
  const priorities = new Map(state.monthlyPriorities.map((item) => [item.domain, item.level]));
  const highestPriority = action.priorityAlignment.supports.reduce<0 | 1 | 2>((highest, domain) => Math.max(highest, priorities.get(domain) ?? 0) as 0 | 1 | 2, 0);
  const priorityDomain = action.priorityAlignment.supports.find((domain) => priorities.get(domain) === highestPriority);
  if (highestPriority === 2 && priorityDomain) {
    signals.push({ kind: 'supports_main_goal', sourceId: priorityDomain, reason: 'Две из трёх единиц внимания заранее отданы главному фокусу.', inputPath: `planningCapacity.attention.${priorityDomain}` });
    delta.effortScore -= 4; delta.optionPressure -= 5; inputPaths.add('monthlyPriorities');
  } else if (highestPriority === 1 && priorityDomain) {
    signals.push({ kind: 'supports_supporting_goal', sourceId: priorityDomain, reason: 'Одна из трёх единиц внимания заранее отдана поддерживающему фокусу.', inputPath: `planningCapacity.attention.${priorityDomain}` });
    delta.effortScore -= 2; delta.optionPressure -= 2; inputPaths.add('monthlyPriorities');
  }
  const conflictingPriority = action.priorityAlignment.conflicts.find((domain) => (priorities.get(domain) ?? 0) > 0);
  if (conflictingPriority) {
    signals.push({ kind: 'conflicts_unfunded_goal', sourceId: conflictingPriority, reason: 'Действие забирает внимание у выбранного фокуса и повышает цену компромисса.', inputPath: `planningCapacity.attention.${conflictingPriority}` });
    delta.riskScore += priorities.get(conflictingPriority) === 2 ? 6 : 3;
    delta.optionPressure += priorities.get(conflictingPriority) === 2 ? 8 : 4;
    inputPaths.add('monthlyPriorities');
  }
  const enabled = new Set(state.weeklyRules.filter((item) => item.enabled).map((item) => item.id));
  const workAction = action.domains.includes('work');
  const inWorkWindow = eventTags.includes('planned_work_window');
  if (enabled.has('work_blocks') && workAction && inWorkWindow) {
    signals.push({ kind: 'supports_weekly_rule', sourceId: 'work_blocks', reason: 'Действие попало в заранее защищённое рабочее окно.', inputPath: 'planningCapacity.ruleSlots.work_blocks' });
    delta.effortScore -= 4; delta.optionPressure -= 3; inputPaths.add('weeklyRules');
  }
  if (enabled.has('work_blocks') && !workAction && inWorkWindow) {
    signals.push({ kind: 'conflicts_weekly_rule', sourceId: 'work_blocks', reason: 'Действие занимает заранее защищённое рабочее окно.', inputPath: 'planningCapacity.ruleSlots.work_blocks' });
    delta.riskScore += 4; delta.optionPressure += 10; inputPaths.add('weeklyRules');
  }
  const inFamilyWindow = eventTags.includes('family_anchor_window');
  if (enabled.has('family_anchor') && action.domains.includes('family') && inFamilyWindow) {
    signals.push({ kind: 'supports_weekly_rule', sourceId: 'family_anchor', reason: 'Действие использует заранее сохранённое семейное окно.', inputPath: 'planningCapacity.ruleSlots.family_anchor' });
    delta.effortScore -= 3; delta.optionPressure -= 3; inputPaths.add('weeklyRules');
  }
  const isEveningRecovery = eventTags.includes('sleep_boundary_window');
  if (enabled.has('protect_sleep') && isEveningRecovery && action.domains.some((item) => item === 'state' || item === 'movement') && !workAction) {
    signals.push({ kind: 'supports_weekly_rule', sourceId: 'protect_sleep', reason: 'Действие использует заранее защищённое вечернее окно.', inputPath: 'planningCapacity.ruleSlots.protect_sleep' });
    delta.effortScore -= 3; delta.optionPressure -= 4; inputPaths.add('weeklyRules');
  }
  if (enabled.has('protect_sleep') && (action.id === 'work_late' || workAction && state.clock.minuteOfDay + effectiveTimeMin > 1200)) {
    signals.push({ kind: 'conflicts_weekly_rule', sourceId: 'protect_sleep', reason: 'Действие заходит в защищённое вечернее окно.', inputPath: 'planningCapacity.ruleSlots.protect_sleep' });
    delta.timeMin += 10; delta.riskScore += 12; delta.optionPressure += 16; inputPaths.add('weeklyRules');
  }
  if (enabled.has('family_anchor') && workAction && inFamilyWindow) {
    signals.push({ kind: 'conflicts_weekly_rule', sourceId: 'family_anchor', reason: 'Работа пересекается с защищённой семейной договорённостью.', inputPath: 'planningCapacity.ruleSlots.family_anchor' });
    delta.riskScore += 10; delta.optionPressure += 15; inputPaths.add('weeklyRules');
  }
  return { delta, signals, inputPaths: [...inputPaths] };
}

export function getPlanningSignals(state: GameState, action: ActionDefinition, eventId: string, effectiveTimeMin: number, eventTags: string[] = []): PlanningSignal[] {
  return getPlanningAdjustment(state, action, eventId, effectiveTimeMin, eventTags).signals;
}
