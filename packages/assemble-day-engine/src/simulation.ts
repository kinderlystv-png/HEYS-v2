import { CAMPAIGN_DAYS, createInitialState, registries } from './content/scenario.js';
import { reduceEmploymentSetup } from './employment.js';
import { reducePlanningStep } from './planning.js';
import { selectAction } from './policies.js';
import {
  computeDecisionContext,
  getActionOffers,
  initialEvent,
  isHeavyState,
  reduceStep,
  reduceTrustedCampaignStep,
} from './reducer.js';
import { canonicalJson, fnv1a64, stateHash } from './rng.js';
import { validateRegistries, validateState } from './schema.js';
import type {
  EmploymentFormat,
  CampaignResult,
  DecisionContext,
  EventInstance,
  GameState,
  PlanningPlan,
  PolicyId,
} from './types.js';

let registriesValidated = false;
const stabilizationCache = new Map<string, number>();
function pressure(context: DecisionContext, state: GameState) {
  const values = {
    deadline: context.deadlinePressure,
    financial: context.financialPressure,
    family: context.familyImbalance,
    recovery: Math.max(
      context.sleepiness,
      100 - context.sleepReadiness,
      100 - state.vitals.energy,
      state.accumulators.recoveryNeed,
    ),
  };
  return Object.entries(values).sort((a, b) => b[1] - a[1])[0] as [keyof typeof values, number];
}
const LONG_TERM_ROOTS = new Set([
  'character',
  'economy',
  'work',
  'family',
  'commitments',
  'weeklyRules',
  'monthlyPriorities',
]);
function semanticLeaves(value: unknown, path: string, out: Record<string, string>): void {
  if (value === null || typeof value !== 'object') {
    out[path] = canonicalJson(value);
    return;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === 'object' && 'id' in (item as object)))
      for (const item of value) {
        const record = item as Record<string, unknown>;
        semanticLeaves(record, `${path}.${String(record.id)}`, out);
      }
    else out[path] = canonicalJson(value);
    return;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!path && !LONG_TERM_ROOTS.has(key)) continue;
    semanticLeaves(item, path ? `${path}.${key}` : key, out);
  }
}
function semanticSnapshot(state: GameState): Record<string, string> {
  const out: Record<string, string> = {};
  semanticLeaves(state, '', out);
  return out;
}
function unexplained(
  left: Record<string, string>,
  right: Record<string, string>,
  resultPaths: string[],
): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((path) => left[path] !== right[path])
    .filter(
      (path) =>
        !resultPaths.some(
          (result) =>
            path === result || path.startsWith(`${result}.`) || result.startsWith(`${path}.`),
        ),
    );
}
function containsPersonalization(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (/clientid|heys|diagnos|medicine|medication|weightkg|personaldata/i.test(key)) return true;
    if (containsPersonalization(item)) return true;
  }
  return false;
}
function probeKey(
  state: GameState,
  event: EventInstance,
  domain: string,
  offers: ReturnType<typeof getActionOffers>,
): string {
  const context = computeDecisionContext(state),
    task = state.work.tasks.find((item) => item.id === 'project_delivery');
  return fnv1a64(
    canonicalJson({
      event: event.templateId,
      domain,
      day: state.clock.dayIndex,
      energy: state.vitals.energy,
      tension: state.vitals.tension,
      hunger: state.vitals.hunger,
      windDown: state.vitals.windDown,
      recovery: state.accumulators.recoveryNeed,
      sleepDebt: state.accumulators.sleepDebtMin,
      backlog: state.work.projectBacklogMin,
      due: task?.dueDayIndex,
      status: task?.status,
      financial: context.cashAfterNextObligationsRub,
      family: context.familyImbalance,
      friction: state.family.friction,
      trust: state.family.partner.trust,
      food: state.economy.foodPortions,
      commitments: state.commitments.map((item) => [item.id, item.status]),
      weeklyRules: state.weeklyRules.length,
      offers: offers.filter((item) => item.available).map((item) => item.actionId),
    }),
  );
}
function actualStabilizerCount(
  state: GameState,
  event: EventInstance,
  offers: ReturnType<typeof getActionOffers>,
  domain: 'deadline' | 'financial' | 'family' | 'recovery',
): number {
  const key = probeKey(state, event, domain, offers),
    cached = stabilizationCache.get(key);
  if (cached !== undefined) return cached;
  const beforeContext = computeDecisionContext(state),
    beforeDue = state.work.tasks.find((item) => item.id === 'project_delivery')?.dueDayIndex ?? 0,
    beforeCommitments = new Map(state.commitments.map((item) => [item.id, item.status])),
    beforeFood = Object.values(state.economy.foodPortions).reduce((sum, value) => sum + value, 0),
    beforeDevelopment = canonicalJson({
      skills: state.character.skills,
      habits: state.character.habits,
      capabilities: state.character.capabilities,
    });
  let count = 0;
  for (const offer of offers.filter((item) => item.available && item.stabilizes.length)) {
    try {
      const preview = structuredClone({
          ...state,
          causalJournal: state.causalJournal.filter((entry) => entry.sourceId === 'planning_plan'),
        }) as GameState,
        output = reduceTrustedCampaignStep(
          { state: preview, openEvent: event, actionId: offer.actionId },
          registries,
        ),
        after = output.state,
        afterContext = computeDecisionContext(after),
        afterFood = Object.values(after.economy.foodPortions).reduce(
          (sum, value) => sum + value,
          0,
        ),
        afterDevelopment = canonicalJson({
          skills: after.character.skills,
          habits: after.character.habits,
          capabilities: after.character.capabilities,
        });
      const actual =
        after.work.projectBacklogMin <= state.work.projectBacklogMin - 10 ||
        (after.work.tasks.find((item) => item.id === 'project_delivery')?.dueDayIndex ?? 0) >
          beforeDue ||
        after.work.helpDebt < state.work.helpDebt ||
        output.journalEntries.some(
          (entry) =>
            entry.resultPath === 'work.reviewRisk' ||
            entry.resultPath === 'work.tasks.extra_project.avoided' ||
            entry.resultPath === 'work.helpDebt.repaid',
        ) ||
        afterContext.cashAfterNextObligationsRub >=
          beforeContext.cashAfterNextObligationsRub + 100 ||
        afterFood > beforeFood ||
        afterDevelopment !== beforeDevelopment ||
        after.weeklyRules.length > state.weeklyRules.length ||
        after.family.participationBalance !== state.family.participationBalance ||
        after.family.friction <= state.family.friction - 4 ||
        afterContext.familyImbalance <= beforeContext.familyImbalance - 5 ||
        after.family.partner.trust > state.family.partner.trust ||
        after.commitments.some(
          (item) =>
            beforeCommitments.get(item.id) === 'open' &&
            (item.status === 'resolved' || item.status === 'renegotiated'),
        ) ||
        after.vitals.hunger <= state.vitals.hunger - 10 ||
        after.vitals.tension <= state.vitals.tension - 8 ||
        after.vitals.energy >= state.vitals.energy + 4 ||
        after.vitals.mood >= state.vitals.mood + 4 ||
        after.accumulators.recoveryNeed <= state.accumulators.recoveryNeed - 5 ||
        after.vitals.windDown >= state.vitals.windDown + 10;
      if (actual) count += 1;
    } catch {
      /* unavailable preview is not a stabilizer */
    }
  }
  stabilizationCache.set(key, count);
  return count;
}

function planForPolicy(policyId: PolicyId): PlanningPlan {
  return policyId === 'protect_family'
    ? {
        weeklyRuleIds: ['family_anchor', 'protect_sleep'],
        mainGoal: 'family',
        supportingGoal: 'recovery',
      }
    : policyId === 'protect_recovery'
      ? {
          weeklyRuleIds: ['protect_sleep', 'family_anchor'],
          mainGoal: 'recovery',
          supportingGoal: 'family',
        }
      : policyId === 'maximize_work'
        ? {
            weeklyRuleIds: ['work_blocks', 'protect_sleep'],
            mainGoal: 'work',
            supportingGoal: 'recovery',
          }
        : policyId === 'save_money'
          ? {
              weeklyRuleIds: ['work_blocks', 'family_anchor'],
              mainGoal: 'work',
              supportingGoal: 'family',
            }
          : policyId === 'buy_time'
            ? {
                weeklyRuleIds: ['work_blocks', 'family_anchor'],
                mainGoal: 'social',
                supportingGoal: 'work',
              }
            : {
                weeklyRuleIds: ['protect_sleep', 'work_blocks'],
                mainGoal: 'work',
                supportingGoal: 'family',
              };
}

export function runCampaign(
  seed: string,
  policyId: PolicyId,
  trustedQaMode = false,
  auditTransitions = true,
  captureReplay = auditTransitions,
  employmentFormat: EmploymentFormat | null = null,
  horizonDays = CAMPAIGN_DAYS,
): CampaignResult {
  if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > CAMPAIGN_DAYS) throw new Error(`Invalid campaign horizon: ${horizonDays}`);
  let state = createInitialState(seed);
  if (!registriesValidated) {
    validateRegistries(registries, state);
    registriesValidated = true;
  }
  validateState(state);
  // Живой игрок обязан выбрать формат занятости до плана недели, поэтому и
  // проверочная кампания проходит тот же шаг: иначе QA гоняет состояние,
  // которого в игре не бывает.
  if (employmentFormat) state = reduceEmploymentSetup({ state, format: employmentFormat, campaignDays: CAMPAIGN_DAYS }).state;
  state = reducePlanningStep({ state, plan: planForPolicy(policyId) }).state;
  let openEvent = initialEvent(state, registries);
  const result: CampaignResult = {
    seed,
    policyId,
    finalStateHash: '',
    visitedSlots: [],
    visitedEvents: [],
    chosenActions: [],
    ordinaryForks: 0,
    ordinaryTwoChoiceForks: 0,
    hardForks: 0,
    hardSingleChoiceForks: 0,
    heavyStates: 0,
    heavyWithStabilizer: 0,
    heavyWithMultipleStabilizers: 0,
    heavyWithoutStabilizerEvents: [],
    heavyWithoutMultipleStabilizerEvents: [],
    terminalLocks: 0,
    maxExternalLoad: 0,
    maxTotalLoad: 0,
    maxLargePerDay: 0,
    weekLargeCount: 0,
    boundarySteps: 0,
    boundaryPaths: [],
    totalSteps: 0,
    auditedTransitions: 0,
    unexplainedLongTermChanges: 0,
    unexplainedPaths: [],
    personalizationInputsDetected: 0,
    transitions: [],
    outcomes: { money: 0, work: 0, family: 0, recovery: 0, sleep: 0 },
  };
  while (state.scenarioCursor < registries.slots.length) {
    if (registries.slots[state.scenarioCursor]!.dayIndex >= horizonDays) break;
    result.maxExternalLoad = Math.max(result.maxExternalLoad, ...Object.values(state.eventLedger.dayExternalLoad));
    result.maxTotalLoad = Math.max(result.maxTotalLoad, ...Object.values(state.eventLedger.dayTotalLoad));
    result.maxLargePerDay = Math.max(result.maxLargePerDay, ...Object.values(state.eventLedger.dayLargeCount));
    const slot = registries.slots[state.scenarioCursor]!,
      event = registries.events[openEvent.templateId]!,
      context = computeDecisionContext(state),
      offers = getActionOffers(state, event.id, registries, context),
      available = offers.filter((item) => item.available);
    result.visitedSlots.push(slot.slot);
    result.visitedEvents.push(event.id);
    if (slot.forkKind === 'ordinary') {
      result.ordinaryForks += 1;
      if (available.length >= 2) result.ordinaryTwoChoiceForks += 1;
    } else {
      result.hardForks += 1;
      if (available.length === 1) result.hardSingleChoiceForks += 1;
    }
    const [domain] = pressure(context, state),
      heavy = isHeavyState(state, context);
    if (heavy) {
      result.heavyStates += 1;
      const stabilizers = actualStabilizerCount(state, openEvent, offers, domain);
      if (stabilizers > 0) result.heavyWithStabilizer += 1;
      else result.heavyWithoutStabilizerEvents.push(event.id);
      if (stabilizers >= 2) result.heavyWithMultipleStabilizers += 1;
      else result.heavyWithoutMultipleStabilizerEvents.push(event.id);
    }
    if (!available.length) {
      result.terminalLocks += 1;
      break;
    }
    const selected = selectAction(state, slot.slot, policyId, offers);
    result.chosenActions.push(selected.actionId);
    const before = auditTransitions ? semanticSnapshot(state) : undefined,
      inputKey =
        before && captureReplay
          ? fnv1a64(
              canonicalJson({ before, event: openEvent.templateId, actionId: selected.actionId }),
            )
          : '';
    const output = trustedQaMode
      ? reduceTrustedCampaignStep({ state, openEvent, actionId: selected.actionId }, registries)
      : reduceStep({ state, openEvent, actionId: selected.actionId }, registries);
    state = output.state;
    if (before) {
      const after = semanticSnapshot(state),
        missing = unexplained(
          before,
          after,
          output.journalEntries.map((item) => item.resultPath),
        );
      if (captureReplay) {
        const outputHash =
          output.stateHash || fnv1a64(canonicalJson({ after, journal: output.journalEntries }));
        result.transitions.push({ inputKey, outputHash });
      }
      result.unexplainedLongTermChanges += missing.length;
      result.unexplainedPaths.push(...missing);
      result.auditedTransitions += 1;
    }
    result.totalSteps += 1;
    const boundaries = (['energy', 'mood', 'tension'] as const).filter(
      (key) => state.vitals[key] === 0 || state.vitals[key] === 100,
    );
    if (boundaries.length) {
      result.boundarySteps += 1;
      result.boundaryPaths.push(...boundaries.map((key) => `vitals.${key}:${state.vitals[key]}`));
    }
    if (output.nextEvent) openEvent = output.nextEvent;
  }
  validateState(state);
  result.finalStateHash = stateHash(state);
  result.personalizationInputsDetected = Number(containsPersonalization(state));
  result.weekLargeCount = state.eventLedger.weekLargeCount;
  const finalContext = computeDecisionContext(state);
  result.outcomes = {
    money: state.economy.cashRub,
    work: -state.work.projectBacklogMin,
    family:
      state.family.partner.closeness +
      state.family.partner.trust +
      state.family.child.closeness -
      state.family.friction,
    recovery: state.vitals.energy - state.vitals.tension - state.vitals.physicalFatigue,
    sleep: -state.accumulators.sleepDebtMin + finalContext.sleepReadiness,
  };
  lastFinalState = state;
  return result;
}

/**
 * Последнее финальное состояние прогона. Нужно профилю инвариантов (`D74`),
 * который проверяет свойства прожитой кампании, а не только её счётчики.
 * Не хранится в `CampaignResult`, чтобы массовый прогон не тащил состояния.
 */
let lastFinalState: GameState | null = null;

export function runCampaignWithState(
  seed: string,
  policyId: PolicyId,
  trustedQaMode = false,
  auditTransitions = true,
  captureReplay = auditTransitions,
  employmentFormat: EmploymentFormat | null = null,
  horizonDays = CAMPAIGN_DAYS,
): { result: CampaignResult; finalState: GameState } {
  const result = runCampaign(seed, policyId, trustedQaMode, auditTransitions, captureReplay, employmentFormat, horizonDays);
  if (!lastFinalState) throw new Error('campaign did not produce a final state');
  return { result, finalState: lastFinalState };
}
