import { weekIndexFor } from './periods.js';
import type { CampaignResult, GameState, Registries } from './types.js';

/**
 * Профиль проверки под длинные кампании (`D74`). Инварианты не зависят от того,
 * в каком порядке открылись ситуации: они проверяют свойства прожитой кампании,
 * а не совпадение с авторской последовательностью. Именно поэтому они переживают
 * перевод каталога на условия состояния, в отличие от покрытия «38 из 38».
 */
export interface InvariantViolation {
  id: string;
  summary: string;
  evidence: string;
}

export interface CampaignObservation {
  seed: string;
  policyId: string;
  result: CampaignResult;
  finalState: GameState;
}

type Check = (observation: CampaignObservation, registries: Registries) => InvariantViolation[];

const violation = (id: string, summary: string, evidence: string): InvariantViolation => ({ id, summary, evidence });

/** Кампания не должна упираться в состояние без единого доступного варианта. */
const noTerminalLocks: Check = ({ seed, policyId, result }) => result.terminalLocks
  ? [violation('no_terminal_locks', 'Кампания осталась без доступных вариантов', `${seed}/${policyId}: ${result.terminalLocks} тупик(ов) на ${result.totalSteps} шагах`)]
  : [];

/** В тяжёлом состоянии всегда остаётся хотя бы один платный выход. */
const heavyStateHasStabilizer: Check = ({ seed, policyId, result }) => result.heavyStates && result.heavyWithStabilizer < result.heavyStates
  ? [violation('heavy_state_has_stabilizer', 'Тяжёлое состояние осталось без стабилизирующего действия', `${seed}/${policyId}: ${result.heavyStates - result.heavyWithStabilizer} из ${result.heavyStates}; ситуации: ${[...new Set(result.heavyWithoutStabilizerEvents)].join(', ') || '—'}`)]
  : [];

/** Бюджеты нагрузки и потолки крупных внешних событий соблюдаются. */
const loadBudgetsRespected: Check = ({ seed, policyId, result }) => {
  const issues: InvariantViolation[] = [];
  if (result.maxExternalLoad > 50) issues.push(violation('load_budget_external', 'Дневная внешняя нагрузка превысила бюджет', `${seed}/${policyId}: ${result.maxExternalLoad} > 50`));
  if (result.maxTotalLoad > 90) issues.push(violation('load_budget_total', 'Общая дневная нагрузка превысила бюджет', `${seed}/${policyId}: ${result.maxTotalLoad} > 90`));
  if (result.maxLargePerDay > 1) issues.push(violation('load_budget_large_day', 'Больше одного крупного внешнего события за день', `${seed}/${policyId}: ${result.maxLargePerDay}`));
  if (result.weekLargeCount > 4) issues.push(violation('load_budget_large_week', 'Больше четырёх крупных внешних событий за неделю', `${seed}/${policyId}: ${result.weekLargeCount}`));
  return issues;
};

/** Каждое долгосрочное изменение состояния объяснено записью в журнале причин. */
const causalityExplained: Check = ({ seed, policyId, result }) => result.unexplainedLongTermChanges
  ? [violation('causality_explained', 'Долгосрочное изменение состояния осталось без причины в журнале', `${seed}/${policyId}: ${result.unexplainedLongTermChanges}; пути: ${[...new Set(result.unexplainedPaths)].slice(0, 5).join(', ')}`)]
  : [];

/** Границы периодов закрываются ровно один раз и согласованы со счётчиками. */
const boundariesIdempotent: Check = ({ seed, policyId, finalState }) => {
  const issues: InvariantViolation[] = [];
  const applied = finalState.periods.appliedBoundaries;
  if (new Set(applied).size !== applied.length) issues.push(violation('boundaries_idempotent', 'Граница периода применена дважды', `${seed}/${policyId}: ${applied.length} записей, уникальных ${new Set(applied).size}`));
  const days = finalState.periods.completedDays;
  const weeks = finalState.periods.completedWeeks;
  const expectedWeeks = weekIndexFor(finalState.periods, Math.max(0, days - 1)) + (days ? 1 : 0);
  if (weeks > expectedWeeks) issues.push(violation('boundaries_week_count', 'Закрыто больше недель, чем прожито дней', `${seed}/${policyId}: недель ${weeks}, дней ${days}`));
  return issues;
};

/** Состояние не растёт вместе с длиной жизни: журнал ограничен одним днём. */
const stateStaysBounded: Check = ({ seed, policyId, finalState }) => {
  const dayIndexes = new Set(finalState.causalJournal.map((entry) => entry.dayIndex));
  return dayIndexes.size > 2
    ? [violation('state_stays_bounded', 'Журнал причин вышел за границу одного дня', `${seed}/${policyId}: дней в журнале ${dayIndexes.size}, записей ${finalState.causalJournal.length}`)]
    : [];
};

export const CAMPAIGN_INVARIANTS: Array<{ id: string; check: Check }> = [
  { id: 'no_terminal_locks', check: noTerminalLocks },
  { id: 'heavy_state_has_stabilizer', check: heavyStateHasStabilizer },
  { id: 'load_budgets_respected', check: loadBudgetsRespected },
  { id: 'causality_explained', check: causalityExplained },
  { id: 'boundaries_idempotent', check: boundariesIdempotent },
  { id: 'state_stays_bounded', check: stateStaysBounded },
];

export function checkCampaignInvariants(observation: CampaignObservation, registries: Registries): InvariantViolation[] {
  return CAMPAIGN_INVARIANTS.flatMap((item) => item.check(observation, registries));
}

/**
 * Достижимость контента измеряется по набору кампаний, а не внутри одной: при
 * свободном порядке одна кампания и не обязана показать весь каталог.
 */
export function unreachableContent(observations: CampaignObservation[], registries: Registries): { events: string[]; actions: string[] } {
  const events = new Set<string>(), actions = new Set<string>();
  for (const observation of observations) {
    observation.result.visitedEvents.forEach((id) => events.add(id));
    observation.result.chosenActions.forEach((id) => actions.add(id));
  }
  return {
    events: Object.keys(registries.events).filter((id) => !events.has(id)).sort(),
    actions: Object.keys(registries.actions).filter((id) => !actions.has(id)).sort(),
  };
}

/**
 * Распределения нужны, чтобы вариативность можно было оценить числом, а не на
 * глаз: доля самой частой ситуации и самого частого действия показывают, не
 * схлопнулся ли свободный порядок обратно в один маршрут.
 */
export function variabilityProfile(observations: CampaignObservation[]): {
  distinctSequences: number;
  campaigns: number;
  topEventShare: number;
  topActionShare: number;
} {
  const sequences = new Set<string>();
  const eventCounts: Record<string, number> = {}, actionCounts: Record<string, number> = {};
  let eventTotal = 0, actionTotal = 0;
  for (const observation of observations) {
    sequences.add(observation.result.visitedEvents.join('>'));
    for (const id of observation.result.visitedEvents) { eventCounts[id] = (eventCounts[id] ?? 0) + 1; eventTotal += 1; }
    for (const id of observation.result.chosenActions) { actionCounts[id] = (actionCounts[id] ?? 0) + 1; actionTotal += 1; }
  }
  const top = (counts: Record<string, number>, total: number) => total ? Math.max(0, ...Object.values(counts)) / total : 0;
  return {
    distinctSequences: sequences.size,
    campaigns: observations.length,
    topEventShare: top(eventCounts, eventTotal),
    topActionShare: top(actionCounts, actionTotal),
  };
}
