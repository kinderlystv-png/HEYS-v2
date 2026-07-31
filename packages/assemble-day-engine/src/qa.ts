import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { getActionOffers, initialEvent, reduceStep } from './reducer.js';
import { createInitialState, registries } from './content/scenario.js';
import { POLICY_IDS, scoreOffer } from './policies.js';
import { canonicalJson, fnv1a64 } from './rng.js';
import { runCampaign } from './simulation.js';
import { CONTRACT, type ActionOffer, type CampaignResult, type GameState, type PolicyId } from './types.js';

type Gate = { threshold: string; actual: number; passed: boolean };
export interface QaRawCounts { terminal: number; ordinary: number; ordinaryTwo: number; hard: number; hardSingle: number; heavy: number; stabilized: number; multiStabilized: number; maxExternal: number; maxTotal: number; maxLargeDay: number; maxLargeWeek: number; boundarySteps: number; totalSteps: number; auditedTransitions: number; unexplained: number; personalization: number }
type CounterfactualResult = {
  id: string;
  eventId: string;
  actionId: string;
  inputFactors: string[];
  changedFields: string[];
  journalNamedInputs: boolean;
  dominantContextCount: number;
  passed: boolean;
};

export interface QaReport {
  reportVersion: 2;
  createdAt: string;
  schemaVersion: 2;
  scenarioId: string;
  scenarioVersion: string;
  calibrationVersion: string;
  priceBookVersion: string;
  rngAlgorithm: string;
  codeRevision: string;
  sourceFingerprint: string;
  simulation: {
    contracts: typeof CONTRACT;
    seedCount: number;
    seedStart: number;
    policyIds: PolicyId[];
    runCount: number;
    replayVerificationCount: number;
    simulationHash: string;
    campaignHash: string;
    campaignSeedHashes: string[];
    rawCounts: QaRawCounts;
    metrics: Record<string, number>;
    gates: Record<string, Gate>;
    coverage: { slots: number; events: number; actions: number; missingSlots: number[]; missingEvents: string[]; missingActions: string[] };
    counterfactuals: CounterfactualResult[];
    distributions: { actionFrequency: Record<string, number>; eventFrequency: Record<string, number>; policyOutcomes: Record<PolicyId, CampaignResult['outcomes']>; heavyWithoutStabilizerByEvent: Record<string, number>; unexplainedPathFrequency: Record<string, number>; boundaryPathFrequency: Record<string, number>; auditedTransitionCount: number; auditedActionCount: number };
    failures: Array<{ seed: string; policyId: PolicyId; dayIndex: number; stepIndex: number; gate: string; stateHash: string; replayKey: string }>;
  };
}

const QA_POLICIES = POLICY_IDS.filter((id): id is Exclude<PolicyId, 'random_valid'> => id !== 'random_valid');
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function revision(): string {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'packages/assemble-day-engine', 'docs/assemble-day'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
    return `${head}${dirty ? '-dirty' : ''}`;
  } catch { return 'unknown-local'; }
}

function filesBelow(path: string): string[] {
  return readdirSync(path).flatMap((name) => {
    const child = resolve(path, name);
    return statSync(child).isDirectory() ? filesBelow(child) : [child];
  });
}

function sourceFingerprint(): string {
  const contractFiles = ['GAME_STATE_SCHEMA.md', 'ACTION_SCHEMA.md', 'EVENT_SCHEMA.md', 'CAUSAL_REDUCER_PROTOCOL.md', 'SCENARIO_WEEK_01.md', 'CAUSAL_QA_PLAN.md', '09_CALIBRATION_QA.md', 'TECHNICAL_CONTRACT_ADDENDUM.md'].map((name) => resolve(REPO_ROOT, 'docs/assemble-day', name));
  const files = [...filesBelow(resolve(REPO_ROOT, 'packages/assemble-day-engine/src')), ...contractFiles].sort();
  return fnv1a64(files.map((path) => `${path.slice(REPO_ROOT.length + 1)}\n${readFileSync(path, 'utf8')}`).join('\n'));
}

function setTaskBacklog(state: GameState, minutes: number): void {
  const task = state.work.tasks.find((item) => item.id === 'project_delivery');
  if (!task) throw new Error('project_delivery fixture missing');
  task.remainingMin = minutes;
  task.status = 'open';
  state.work.projectBacklogMin = minutes;
}

function rankVector(offers: ActionOffer[], actionId: string): number[] {
  return QA_POLICIES.map((policyId) => offers.filter((offer) => offer.available).map((offer) => ({ actionId: offer.actionId, score: scoreOffer(offer, policyId) })).sort((a, b) => b.score - a.score || a.actionId.localeCompare(b.actionId)).findIndex((item) => item.actionId === actionId));
}

function dominatesAllPolicies(target: ActionOffer, alternatives: ActionOffer[]): boolean {
  if (!target.available) return false;
  const others = alternatives.filter((offer) => offer.available && offer.actionId !== target.actionId);
  return others.length > 0 && others.every((other) => {
    const comparisons = QA_POLICIES.map((policyId) => scoreOffer(target, policyId) - scoreOffer(other, policyId));
    return comparisons.every((delta) => delta >= 0) && comparisons.some((delta) => delta > 0);
  });
}

interface CounterfactualCase {
  id: string;
  eventId: string;
  actionId: string;
  inputFactors: string[];
  left(state: GameState): void;
  right(state: GameState): void;
}

function counterfactualCases(): CounterfactualCase[] {
  return [
    { id: 'breakfast_cooking_open_vs_compressed_morning', eventId: 'mon_breakfast', actionId: 'cook_meal_batch', inputFactors: ['context.deadlinePressure'], left: (s) => { setTaskBacklog(s, 120); }, right: (s) => { setTaskBacklog(s, 420); } },
    { id: 'work_after_normal_vs_two_short_nights', eventId: 'mon_project_block', actionId: 'work_standard', inputFactors: ['context.focusByTaskId.project_delivery'], left: (s) => { s.accumulators.sleepDebtMin = 20; s.vitals.energy = 76; s.vitals.tension = 28; }, right: (s) => { s.accumulators.sleepDebtMin = 320; s.vitals.energy = 28; s.vitals.tension = 74; s.vitals.hunger = 68; } },
    { id: 'food_order_sufficient_vs_low_reserve', eventId: 'mon_lunch_window', actionId: 'order_food', inputFactors: ['context.cashAfterNextObligationsRub'], left: (s) => { s.economy.cashRub = 90000; }, right: (s) => { s.economy.cashRub = 2000; s.economy.expectedIncome.forEach((income) => { income.status = 'cancelled'; }); } },
    { id: 'partner_request_balanced_vs_skewed_load', eventId: 'tue_pickup_conflict', actionId: 'ask_partner_help', inputFactors: ['context.familyImbalance'], left: (s) => { s.accumulators.familyLoadPlayer7d = 25; s.accumulators.familyLoadPartner7d = 22; }, right: (s) => { s.accumulators.familyLoadPlayer7d = 70; s.accumulators.familyLoadPartner7d = 20; } },
    { id: 'training_normal_vs_heavy_recovery', eventId: 'thu_movement_plan', actionId: 'train_planned', inputFactors: ['accumulators.recoveryNeed'], left: (s) => { s.accumulators.recoveryNeed = 30; }, right: (s) => { s.accumulators.recoveryNeed = 82; } },
    { id: 'coffee_morning_zero_vs_evening_180mg', eventId: 'mon_breakfast', actionId: 'drink_coffee_100', inputFactors: ['accumulators.activeCaffeineMg'], left: (s) => { s.clock.minuteOfDay = 480; s.accumulators.activeCaffeineMg = 0; }, right: (s) => { s.clock.minuteOfDay = 1200; s.accumulators.activeCaffeineMg = 180; } },
    { id: 'fast_work_focus_75_vs_35', eventId: 'tue_review_prep', actionId: 'work_fast', inputFactors: ['context.focusByTaskId.project_delivery'], left: (s) => { s.vitals.energy = 90; s.vitals.tension = 10; s.vitals.hunger = 10; s.accumulators.sleepDebtMin = 0; }, right: (s) => { s.vitals.energy = 25; s.vitals.tension = 78; s.vitals.hunger = 72; s.accumulators.sleepDebtMin = 300; } },
    { id: 'cancel_family_plan_early_vs_two_breaches', eventId: 'fri_family_plan', actionId: 'work_late', inputFactors: ['family.friction'], left: (s) => { s.family.friction = 20; s.family.partner.trust = 74; }, right: (s) => { s.family.friction = 70; s.family.partner.trust = 54; } },
    { id: 'taxi_high_vs_negative_reserve', eventId: 'mon_commute', actionId: 'buy_time_taxi', inputFactors: ['context.cashAfterNextObligationsRub'], left: (s) => { s.economy.cashRub = 90000; }, right: (s) => { s.economy.cashRub = 1800; s.economy.expectedIncome.forEach((income) => { income.status = 'cancelled'; }); } },
    { id: 'friends_weekend_vs_early_deadline', eventId: 'sat_social_invite', actionId: 'meet_friends_short', inputFactors: ['context.deadlinePressure'], left: (s) => { s.clock.dayIndex = 5; setTaskBacklog(s, 30); }, right: (s) => { s.clock.dayIndex = 3; setTaskBacklog(s, 600); } },
    { id: 'early_sleep_noncritical_vs_urgent_backlog', eventId: 'sun_early_finish', actionId: 'wind_down_early', inputFactors: ['context.deadlinePressure'], left: (s) => { s.clock.dayIndex = 6; setTaskBacklog(s, 20); }, right: (s) => { s.clock.dayIndex = 4; setTaskBacklog(s, 600); } },
  ];
}

function counterfactuals(): CounterfactualResult[] {
  return counterfactualCases().map((fixture) => {
    const left = createInitialState(`cf:${fixture.id}:left`);
    const right = createInitialState(`cf:${fixture.id}:right`);
    fixture.left(left); fixture.right(right);
    const leftOffers = getActionOffers(left, fixture.eventId, registries);
    const rightOffers = getActionOffers(right, fixture.eventId, registries);
    const l = leftOffers.find((offer) => offer.actionId === fixture.actionId);
    const r = rightOffers.find((offer) => offer.actionId === fixture.actionId);
    if (!l || !r) throw new Error(`Counterfactual action ${fixture.actionId} missing in ${fixture.eventId}`);
    const geometry = (offer: ActionOffer, offers: ActionOffer[]) => ({ available: offer.available, effectiveTimeMin: offer.effectiveTimeMin, effortScore: offer.effortScore, riskScore: offer.riskScore, ordering: rankVector(offers, offer.actionId), consequencePreview: offer.consequencePreview });
    const leftGeometry = geometry(l, leftOffers), rightGeometry = geometry(r, rightOffers);
    const changedFields = Object.keys(leftGeometry).filter((key) => canonicalJson(leftGeometry[key as keyof typeof leftGeometry]) !== canonicalJson(rightGeometry[key as keyof typeof rightGeometry]));
    const runJournal = (state: GameState) => { const cursor=registries.slots.findIndex((slot)=>slot.eventId===fixture.eventId);if(cursor<0)throw new Error(`Counterfactual event ${fixture.eventId} missing`);const aligned=structuredClone(state),slot=registries.slots[cursor]!;aligned.scenarioCursor=cursor;aligned.activeEventId=fixture.eventId;aligned.clock.stepIndex=cursor;aligned.clock.dayIndex=slot.dayIndex;aligned.clock.minuteOfDay=slot.minuteOfDay;return reduceStep({state:aligned,openEvent:initialEvent(aligned,registries),actionId:fixture.actionId},registries).journalEntries; };
    const journalEntries = [...runJournal(left), ...runJournal(right)];
    const journalNamedInputs = fixture.inputFactors.every((path) => journalEntries.some((entry) => entry.resultPath === `decisionGeometry.${fixture.actionId}.${path}`));
    const dominantContextCount = Number(dominatesAllPolicies(l, leftOffers)) + Number(dominatesAllPolicies(r, rightOffers));
    return { id: fixture.id, eventId: fixture.eventId, actionId: fixture.actionId, inputFactors: fixture.inputFactors, changedFields, journalNamedInputs, dominantContextCount, passed: changedFields.length >= 2 && journalNamedInputs };
  });
}

const zeroOutcomes = (): CampaignResult['outcomes'] => ({ money: 0, work: 0, family: 0, recovery: 0, sleep: 0 });

export function runCausalQa(seedCount = 10_000, createdAt = new Date().toISOString(), seedStart = 0): QaReport {
  if (!Number.isInteger(seedCount) || seedCount < 1) throw new Error('seedCount must be a positive integer');
  if (!Number.isInteger(seedStart) || seedStart < 0) throw new Error('seedStart must be a non-negative integer');
  const fingerprint = sourceFingerprint();
  const slotSet = new Set<number>(), eventSet = new Set<string>(), actionSet = new Set<string>();
  const actionFrequency: Record<string, number> = {}, eventFrequency: Record<string, number> = {};
  const auditedActions = new Set<string>();
  const heavyWithoutStabilizerByEvent: Record<string, number> = {}, unexplainedPathFrequency: Record<string, number> = {}, boundaryPathFrequency: Record<string, number> = {};
  const failures: QaReport['simulation']['failures'] = [];
  const firstReplay = new Map<PolicyId, CampaignResult>();
  const policyOutcomes = Object.fromEntries(POLICY_IDS.map((id) => [id, zeroOutcomes()])) as Record<PolicyId, CampaignResult['outcomes']>;
  let runs = 0, terminal = 0, ordinary = 0, ordinaryTwo = 0, hard = 0, hardSingle = 0, heavy = 0, stabilized = 0, multiStabilized = 0;
  let maxExternal = 0, maxTotal = 0, maxLargeDay = 0, maxLargeWeek = 0, boundarySteps = 0, totalSteps = 0, auditedTransitions = 0, unexplained = 0, personalization = 0;
  const finalHashes: string[] = [];

  for (let localSeedIndex = 0; localSeedIndex < seedCount; localSeedIndex++) for (const policyId of POLICY_IDS) {
    const seedIndex=seedStart+localSeedIndex,seed = `qa-${String(seedIndex).padStart(5, '0')}`;
    const result = runCampaign(seed, policyId, true, true, localSeedIndex === 0);
    if (localSeedIndex === 0) firstReplay.set(policyId, structuredClone(result));
    runs += 1; terminal += result.terminalLocks; ordinary += result.ordinaryForks; ordinaryTwo += result.ordinaryTwoChoiceForks; hard += result.hardForks; hardSingle += result.hardSingleChoiceForks; heavy += result.heavyStates; stabilized += result.heavyWithStabilizer; multiStabilized += result.heavyWithMultipleStabilizers;
    maxExternal = Math.max(maxExternal, result.maxExternalLoad); maxTotal = Math.max(maxTotal, result.maxTotalLoad); maxLargeDay = Math.max(maxLargeDay, result.maxLargePerDay); maxLargeWeek = Math.max(maxLargeWeek, result.weekLargeCount);
    boundarySteps += result.boundarySteps; totalSteps += result.totalSteps; auditedTransitions += result.auditedTransitions; unexplained += result.unexplainedLongTermChanges; personalization += result.personalizationInputsDetected;
    result.heavyWithoutStabilizerEvents.forEach((id) => { heavyWithoutStabilizerByEvent[id] = (heavyWithoutStabilizerByEvent[id] ?? 0) + 1; }); result.unexplainedPaths.forEach((path) => { unexplainedPathFrequency[path] = (unexplainedPathFrequency[path] ?? 0) + 1; }); result.boundaryPaths.forEach((path) => { boundaryPathFrequency[path] = (boundaryPathFrequency[path] ?? 0) + 1; });
    for (const key of Object.keys(result.outcomes) as Array<keyof CampaignResult['outcomes']>) policyOutcomes[policyId][key] += result.outcomes[key];
    result.visitedSlots.forEach((slot) => slotSet.add(slot));
    result.visitedEvents.forEach((event) => { eventSet.add(event); eventFrequency[event] = (eventFrequency[event] ?? 0) + 1; });
    result.chosenActions.forEach((action) => { actionSet.add(action); actionFrequency[action] = (actionFrequency[action] ?? 0) + 1; });
    result.chosenActions.forEach((action) => auditedActions.add(action));
    finalHashes.push(`${seed}:${policyId}:${result.finalStateHash}`);
    if (result.terminalLocks) failures.push({ seed, policyId, dayIndex: result.visitedSlots.length ? registries.slots[Math.min(result.visitedSlots.length - 1, 37)]!.dayIndex : 0, stepIndex: result.totalSteps, gate: 'terminalLockCount', stateHash: result.finalStateHash, replayKey: `${CONTRACT.scenarioVersion}:${CONTRACT.calibrationVersion}:${seed}:${policyId}:${result.totalSteps}` });
  }

  let reproMismatch = 0, replayVerificationCount = 0;
  for (const policyId of POLICY_IDS) {
    const expected = firstReplay.get(policyId)!;
    const replaySeed=`qa-${String(seedStart).padStart(5,'0')}`,replay = runCampaign(replaySeed, policyId, true, true, true);
    const count=Math.max(expected.transitions.length,replay.transitions.length);for(let index=0;index<count;index++){replayVerificationCount+=1;const left=expected.transitions[index],right=replay.transitions[index];if(!left||!right||canonicalJson(left)!==canonicalJson(right))reproMismatch+=1;}if(replay.finalStateHash!==expected.finalStateHash)reproMismatch+=1;
  }

  const counter = counterfactuals();
  const outcomeKeys = ['money', 'work', 'family', 'recovery', 'sleep'] as const;
  const policyGlobalDominanceCount = POLICY_IDS.filter((policy) => POLICY_IDS.filter((other) => other !== policy).every((other) => outcomeKeys.every((key) => policyOutcomes[policy][key] >= policyOutcomes[other][key]) && outcomeKeys.some((key) => policyOutcomes[policy][key] > policyOutcomes[other][key]))).length;
  const metrics = {
    terminalLockCount: terminal,
    heavyStateStabilizationRate: heavy ? stabilized / heavy : 1,
    heavyMultiStabilizationRate: heavy ? multiStabilized / heavy : 1,
    ordinaryTwoChoiceRate: ordinary ? ordinaryTwo / ordinary : 1,
    hardSingleChoiceRate: hard ? hardSingle / hard : 0,
    actionDominanceRate: counter.reduce((sum, item) => sum + item.dominantContextCount, 0) / (counter.length * 2),
    policyGlobalDominanceCount,
    largeExternalPerDayMax: maxLargeDay,
    largeExternalPerWeekMax: maxLargeWeek,
    externalLoadPerDayMax: maxExternal,
    totalEventLoadPerDayMax: maxTotal,
    boundaryStepRate: totalSteps ? boundarySteps / totalSteps : 0,
    unexplainedLongTermChangeCount: unexplained,
    reproMismatchCount: reproMismatch,
    personalizationAdvantageCount: personalization,
    counterfactualPassRate: counter.filter((item) => item.passed).length / counter.length,
    auditedActionCount: auditedActions.size,
    echoEventCoverageRate: ['thu_colleague_reciprocity','fri_final_issue_with_support','sat_meal_prep_familiar','sun_family_time_reciprocal'].filter((id)=>eventSet.has(id)).length / 4,
  };
  const gate = (threshold: string, actual: number, passed: boolean): Gate => ({ threshold, actual, passed });
  // `D74`: покрытие каталога перестало быть блокирующим gate. Оно измеряется и
  // попадает в отчёт, но при свободном порядке ситуаций одна выборка не обязана
  // показать весь контент; достижимость проверяет профиль `qa-profile.ts`.
  const gates: Record<string, Gate> = {
    terminalLockCount: gate('=0', metrics.terminalLockCount, metrics.terminalLockCount === 0),
    heavyStateStabilizationRate: gate('=1', metrics.heavyStateStabilizationRate, metrics.heavyStateStabilizationRate === 1),
    heavyMultiStabilizationRate: gate('>=0.85', metrics.heavyMultiStabilizationRate, metrics.heavyMultiStabilizationRate >= .85),
    ordinaryTwoChoiceRate: gate('>=0.98', metrics.ordinaryTwoChoiceRate, metrics.ordinaryTwoChoiceRate >= .98),
    hardSingleChoiceRate: gate('<=0.02', metrics.hardSingleChoiceRate, metrics.hardSingleChoiceRate <= .02),
    actionDominanceRate: gate('<=0.70', metrics.actionDominanceRate, metrics.actionDominanceRate <= .70),
    policyGlobalDominanceCount: gate('=0', metrics.policyGlobalDominanceCount, metrics.policyGlobalDominanceCount === 0),
    largeExternalPerDayMax: gate('<=1', metrics.largeExternalPerDayMax, metrics.largeExternalPerDayMax <= 1),
    largeExternalPerWeekMax: gate('<=4', metrics.largeExternalPerWeekMax, metrics.largeExternalPerWeekMax <= 4),
    externalLoadPerDayMax: gate('<=50', metrics.externalLoadPerDayMax, metrics.externalLoadPerDayMax <= 50),
    totalEventLoadPerDayMax: gate('<=90', metrics.totalEventLoadPerDayMax, metrics.totalEventLoadPerDayMax <= 90),
    boundaryStepRate: gate('<=0.20', metrics.boundaryStepRate, metrics.boundaryStepRate <= .20),
    unexplainedLongTermChangeCount: gate('=0', metrics.unexplainedLongTermChangeCount, metrics.unexplainedLongTermChangeCount === 0),
    reproMismatchCount: gate('=0', metrics.reproMismatchCount, metrics.reproMismatchCount === 0),
    personalizationAdvantageCount: gate('=0', metrics.personalizationAdvantageCount, metrics.personalizationAdvantageCount === 0),
    counterfactualPassRate: gate('=1', metrics.counterfactualPassRate, metrics.counterfactualPassRate === 1),
  };
  const missingSlots = registries.slots.map((item) => item.slot).filter((id) => !slotSet.has(id));
  const missingEvents = Object.keys(registries.events).filter((id) => !eventSet.has(id));
  const missingActions = Object.keys(registries.actions).filter((id) => !actionSet.has(id));
  const campaignSeedHashes=Array.from({length:seedCount},(_,index)=>fnv1a64(finalHashes.slice(index*POLICY_IDS.length,(index+1)*POLICY_IDS.length).join('\n')));
  const campaignHash = fnv1a64(campaignSeedHashes.join('\n'));
  const rawCounts:QaRawCounts={terminal,ordinary,ordinaryTwo,hard,hardSingle,heavy,stabilized,multiStabilized,maxExternal,maxTotal,maxLargeDay,maxLargeWeek,boundarySteps,totalSteps,auditedTransitions,unexplained,personalization};
  const stablePayload = { contracts: CONTRACT, sourceFingerprint: fingerprint, seedCount, seedStart, policyIds: POLICY_IDS, runCount: runs, replayVerificationCount, campaignHash, campaignSeedHashes, rawCounts, metrics, gates, coverage: { slots: slotSet.size, events: eventSet.size, actions: actionSet.size, missingSlots, missingEvents, missingActions }, counterfactuals: counter, distributions: { actionFrequency, eventFrequency, policyOutcomes, heavyWithoutStabilizerByEvent, unexplainedPathFrequency, boundaryPathFrequency, auditedTransitionCount: auditedTransitions, auditedActionCount: auditedActions.size }, failures };
  return { reportVersion: 2, createdAt, schemaVersion: 2, scenarioId: CONTRACT.scenarioId, scenarioVersion: CONTRACT.scenarioVersion, calibrationVersion: CONTRACT.calibrationVersion, priceBookVersion: CONTRACT.priceBookVersion, rngAlgorithm: CONTRACT.rngAlgorithm, codeRevision: revision(), sourceFingerprint: fingerprint, simulation: { ...stablePayload, simulationHash: fnv1a64(canonicalJson(stablePayload)) } };
}
