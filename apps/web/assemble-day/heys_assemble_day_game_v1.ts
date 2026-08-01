import { CAMPAIGN_DAYS, createInitialState, registries } from '../../../packages/assemble-day-engine/src/content/scenario.ts';
import { employmentSetupView, reduceEmploymentSetup } from '../../../packages/assemble-day-engine/src/employment.ts';
import { getCharacterPresentation, getRuleEvidence } from '../../../packages/assemble-day-engine/src/content/presentation.ts';
import { compareCampaignOutcomes, getCampaignBrief, getCampaignOutcome, getCharacterDevelopment, getPeriodBoundaries, getPeriodSummary, getStepSummary, getSyntheticObservation } from '../../../packages/assemble-day-engine/src/campaign.ts';
import { getPlanningView, reducePlanningStep } from '../../../packages/assemble-day-engine/src/planning.ts';
import { computeDecisionContext, getActionOffers, initialEvent, reduceStep } from '../../../packages/assemble-day-engine/src/reducer.ts';
import { fnv1a64, stateHash } from '../../../packages/assemble-day-engine/src/rng.ts';
import { validateState } from '../../../packages/assemble-day-engine/src/schema.ts';
import { CONTRACT, type ActionOffer, type EmploymentFormat, type CampaignOutcome, type CausalEntry, type CharacterPresentation, type GameState, type PeriodBoundary, type PeriodSummary, type PlanningDomain, type PlanningPlan, type StepSummary, type WeeklyRulePresetId } from '../../../packages/assemble-day-engine/src/types.ts';

declare global {
  interface Window {
    HEYS?: any;
    React?: any;
  }
}

const STORAGE_KEY = 'heys_planning_assemble_day_campaign_v1';
const ENVELOPE_VERSION = 3;
const CHECKPOINT_BUDGET_BYTES = 128 * 1024;
const UUID_RE = /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i;

type DiagnosticOffer = ActionOffer & {
  label: string;
  summary: string;
  knownCost: string;
  effortLabel: string;
  riskLabel: string;
  consequenceSummary: string;
};
type DiagnosticDecision = {
  kind: 'action';
  revision: number;
  stepIndex: number;
  eventId: string;
  actionId: string;
} | {
  kind: 'planning';
  revision: number;
  stepIndex: number;
  plan: PlanningPlan;
} | {
  kind: 'employment';
  revision: number;
  stepIndex: number;
  format: EmploymentFormat;
};
type DiagnosticLedger = {
  version: 1;
  history: 'complete' | 'legacy_partial';
  decisions: DiagnosticDecision[];
};

type CampaignSession = {
  state: GameState;
  lastStepSummary: StepSummary | null;
  periodSummaries: PeriodSummary[];
  revision: number;
  diagnostics: DiagnosticLedger;
  /**
   * Снимок на последней закрытой границе периода. Восстановление начинается с
   * него, поэтому стоимость сохранения и загрузки зависит от длины текущего
   * периода, а не от длины жизни персонажа.
   */
  anchor: CampaignAnchor;
  comparisonBaseline?: { outcome: CampaignOutcome; finalStateHash: string };
};

type CampaignAnchor = {
  revision: number;
  stateHash: string;
  state: GameState;
  lastStepSummary: StepSummary | null;
  periodSummaries: PeriodSummary[];
  lastDecisionKind: DiagnosticDecision['kind'] | null;
};

type CampaignEnvelope = {
  envelopeVersion: 3;
  scopeTag: string;
  gameSeed: string;
  savedAt: string;
  revision: number;
  stateHash: string;
  contract: typeof CONTRACT;
  anchor: CampaignAnchor;
  diagnostics: DiagnosticLedger;
  lifetime: { decisions: number };
  comparisonBaseline?: CampaignSession['comparisonBaseline'];
};

type LegacyCampaignEnvelope = {
  envelopeVersion: 1;
  clientId: string;
  campaignId: string;
  savedAt: string;
  revision: number;
  stateHash: string;
  contract: typeof CONTRACT;
  state: GameState;
  lastSummary: StepSummary | null;
  diagnostics?: DiagnosticLedger;
  comparisonBaseline?: CampaignSession['comparisonBaseline'];
};

type LoadResult =
  | { status: 'empty' }
  | { status: 'ready'; session: CampaignSession }
  | { status: 'unavailable' | 'foreign' | 'incompatible' | 'corrupt' | 'privacy'; message: string };

type SaveResult =
  | { status: 'saved'; envelope: CampaignEnvelope; sizeBytes: number; budgetBytes: number }
  | { status: 'unavailable' | 'conflict' | 'failed'; message: string };

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const WEEKLY_RULE_IDS = new Set<WeeklyRulePresetId>(['protect_sleep', 'family_anchor', 'work_blocks']);
const STORAGE_CONTRACT_KEYS = [
  'schemaVersion', 'scenarioId', 'scenarioVersion', 'calibrationVersion',
  'technicalContractVersion', 'priceBookVersion', 'rngAlgorithm', 'hashAlgorithm',
] as const;

const PATH_LABELS: Array<[RegExp, string]> = [
  [/^vitals\.energy$/, 'запас сил'],
  [/^vitals\.mood$/, 'настроение'],
  [/^vitals\.tension$/, 'напряжение'],
  [/^vitals\.hunger$/, 'сытость'],
  [/^work\./, 'ход проекта'],
  [/^family\./, 'семейный баланс'],
  [/^economy\.foodPortions\./, 'домашний запас еды'],
  [/^economy\./, 'финансовый запас'],
  [/^accumulators\.satietyWindowMin$/, 'запас сытости'],
  [/^accumulators\./, 'восстановление'],
  [/^commitments/, 'договорённости'],
  [/^weeklyRules/, 'правила недели'],
  [/^monthlyPriorities/, 'приоритеты месяца'],
];

function contractMatches(candidate: unknown): candidate is typeof CONTRACT {
  if (!candidate || typeof candidate !== 'object') return false;
  return STORAGE_CONTRACT_KEYS.every((key) => (candidate as any)[key] === CONTRACT[key]);
}

function eventCopy(eventId: string) {
  const authored = registries.events[eventId]?.copy;
  return authored ? { title: authored.title, situation: authored.situation } : { title: 'Развилка дня', situation: 'Появилось решение, которое повлияет на оставшуюся часть дня.' };
}

function formatTime(minutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function riskLabel(risk: ActionOffer['risk']) {
  return ({ none: 'без заметного риска', low: 'низкий риск', moderate: 'умеренный риск', high: 'высокий риск', very_high: 'очень высокий риск' } as const)[risk];
}

function effortLabel(effort: ActionOffer['effortLevel']) {
  return ({ none: 'без усилия', light: 'лёгкое усилие', normal: 'умеренное усилие', high: 'высокое усилие' } as const)[effort];
}

function outcomeDirectionLabel(direction: 'kept' | 'traded' | 'strained') {
  return ({ kept: 'Сохранено', traded: 'Компромисс', strained: 'Под напряжением' } as const)[direction];
}

function confidenceLabel(confidence: ActionOffer['evidence']['confidence']) {
  return ({ established: 'подтверждённое правило кампании', plausible_model: 'правдоподобная игровая модель', personal_hypothesis: 'непроверенная гипотеза' } as const)[confidence];
}

function actionLabel(actionId: string) {
  return registries.actions[actionId]?.copy.label || actionId;
}

function actionCopy(eventId: string, actionId: string) {
  const action = registries.actions[actionId];
  return action?.copy.contextual?.[eventId] || {
    label: action?.copy.label || actionId,
    summary: action?.copy.summary || '',
  };
}

function presentOffer(eventId: string, offer: ActionOffer): DiagnosticOffer {
  const copy = actionCopy(eventId, offer.actionId);
  return {
    ...offer,
    label: copy.label,
    summary: copy.summary,
    knownCost: registries.actions[offer.actionId]?.copy.knownCost || '',
    effortLabel: effortLabel(offer.effortLevel),
    riskLabel: riskLabel(offer.risk),
    consequenceSummary: [
      offer.consequences.immediate.length ? `Сразу: ${offer.consequences.immediate.join('; ')}` : '',
      offer.consequences.delayed.length ? `Позже: ${offer.consequences.delayed.join('; ')}` : '',
      offer.consequences.conditional.length ? `В этом контексте: ${offer.consequences.conditional.join('; ')}` : '',
    ].filter(Boolean).join('. '),
  };
}

function pathLabel(path: string) {
  return PATH_LABELS.find(([pattern]) => pattern.test(path))?.[1] || 'следующие решения';
}

function meaningfulEntries(entries: CausalEntry[]) {
  return entries.filter((entry) => !/^(clock|scenarioCursor|eventLedger|rng|eventCooldownUntilDay)/.test(entry.resultPath));
}

function mechanismLabel(mechanism: string) {
  return ({
    'эффективная длительность действия': 'за время действия',
    'цена усилия': 'затраты усилия',
  } as Record<string, string>)[mechanism] || mechanism;
}

function containsUuid(value: unknown) {
  try {
    return UUID_RE.test(typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    return true;
  }
}

function createOpaqueGameSeed() {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
    return `ad1_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  const entropy = `${Date.now()}:${window.performance?.now?.() || 0}:${Math.random()}`;
  return `ad1_${fnv1a64(entropy)}${fnv1a64(`${entropy}:fallback`)}`;
}

function assertGameSeed(seed: unknown): asserts seed is string {
  if (typeof seed !== 'string' || !seed || seed.length > 128 || containsUuid(seed)) throw new Error('game seed must be opaque and UUID-free');
}

function scopeTagFor(clientId: string) {
  return `scope1_${fnv1a64(`assemble-day:${clientId.trim().toLowerCase()}`)}`;
}

function comparisonBaselineFrom(value: unknown): CampaignSession['comparisonBaseline'] | undefined {
  if (value === undefined) return undefined;
  const baseline = value as CampaignSession['comparisonBaseline'];
  if (!baseline || typeof baseline !== 'object' || !baseline.outcome || typeof baseline.outcome !== 'object' || typeof baseline.finalStateHash !== 'string') {
    throw new Error('invalid comparison baseline');
  }
  return { outcome: structuredClone(baseline.outcome), finalStateHash: baseline.finalStateHash };
}

function createSession(seed = createOpaqueGameSeed(), comparisonBaseline?: CampaignSession['comparisonBaseline']): CampaignSession {
  assertGameSeed(seed);
  const state = createInitialState(seed);
  validateState(state);
  const anchor: CampaignAnchor = { revision: 0, stateHash: stateHash(state), state: structuredClone(state), lastStepSummary: null, periodSummaries: [], lastDecisionKind: null };
  return { state, lastStepSummary: null, periodSummaries: [], revision: 0, diagnostics: { version: 1, history: 'complete', decisions: [] }, anchor, ...(comparisonBaseline ? { comparisonBaseline } : {}) };
}

function diagnosticStateSnapshot(state: GameState): Omit<GameState, 'causalJournal'> {
  const snapshot = structuredClone(state) as GameState;
  delete (snapshot as Partial<GameState>).causalJournal;
  return snapshot as Omit<GameState, 'causalJournal'>;
}

function diagnosticsFrom(value: unknown, revision: number, anchorRevision = 0): DiagnosticLedger {
  if (value === undefined) return { version: 1, history: revision === 0 ? 'complete' : 'legacy_partial', decisions: [] };
  const ledger = value as DiagnosticLedger;
  if (!ledger || typeof ledger !== 'object' || ledger.version !== 1 || !['complete', 'legacy_partial'].includes(ledger.history)
    || !Array.isArray(ledger.decisions) || ledger.decisions.some((decision) => !decision || typeof decision !== 'object'
      || !['action', 'planning', 'employment'].includes((decision as any).kind)
      || !Number.isInteger((decision as any).revision)
      || !Number.isInteger((decision as any).stepIndex)
      || ((decision as any).kind === 'action' && (typeof (decision as any).eventId !== 'string' || typeof (decision as any).actionId !== 'string'))
      || ((decision as any).kind === 'planning' && !(decision as any).plan)
      || ((decision as any).kind === 'employment' && typeof (decision as any).format !== 'string'))) {
    throw new Error('invalid diagnostic ledger');
  }
  const decisions = structuredClone(ledger.decisions);
  if (decisions.some((decision) => decision.revision <= 0 || decision.stepIndex < 0)) throw new Error('invalid diagnostic position');
  if (decisions.some((decision, index) => decision.revision !== anchorRevision + index + 1)) throw new Error('diagnostic revision sequence');
  if (decisions.length ? decisions.at(-1)!.revision !== revision : ledger.history === 'complete' && revision !== anchorRevision) throw new Error('diagnostic revision mismatch');
  return { version: 1, history: ledger.history, decisions };
}

function planningDraftFromState(state: GameState): PlanningPlan {
  const ordered = state.monthlyPriorities.slice().sort((left, right) => right.level - left.level);
  const mainGoal = ordered[0]?.domain || 'work';
  const supportingGoal = ordered.find((item) => item.domain !== mainGoal)?.domain || 'family';
  return {
    weeklyRuleIds: state.weeklyRules.map((item) => item.id).filter((id): id is WeeklyRulePresetId => WEEKLY_RULE_IDS.has(id as WeeklyRulePresetId)),
    mainGoal,
    supportingGoal,
  };
}

function planningMatchesState(state: GameState, plan: PlanningPlan) {
  const stateRules = state.weeklyRules.filter((item) => item.enabled).map((item) => item.id).sort();
  const planRules = [...plan.weeklyRuleIds].sort();
  const main = state.monthlyPriorities.find((item) => item.level === 2)?.domain;
  const supporting = state.monthlyPriorities.find((item) => item.level === 1)?.domain;
  return state.causalJournal.some((entry) => entry.sourceId === 'planning_plan')
    && JSON.stringify(stateRules) === JSON.stringify(planRules)
    && main === plan.mainGoal
    && supporting === plan.supportingGoal;
}

function getPlanningCampaignView(session: CampaignSession, plan: PlanningPlan) {
  return getPlanningView(session.state, plan, computeDecisionContext(session.state));
}

function getCampaignView(session: CampaignSession) {
  validateState(session.state);
  const complete = session.state.scenarioCursor >= registries.slots.length;
  const openEvent = complete ? null : initialEvent(session.state, registries);
  const slot = registries.slots[session.state.scenarioCursor] || null;
  const offers = openEvent ? getActionOffers(session.state, openEvent.templateId, registries) : [];
  return {
    complete,
    openEvent,
    slot,
    event: openEvent ? { ...eventCopy(openEvent.templateId), id: openEvent.templateId } : null,
    offers: offers.map((offer) => presentOffer(openEvent?.templateId || '', offer)),
    context: computeDecisionContext(session.state),
    dayName: DAY_NAMES[session.state.clock.dayIndex] || `День ${session.state.clock.dayIndex + 1}`,
    timeLabel: formatTime(session.state.clock.minuteOfDay),
    progress: { current: Math.min(session.state.scenarioCursor + 1, registries.slots.length), total: registries.slots.length },
  };
}

function confirmAction(session: CampaignSession, actionId: string): CampaignSession {
  validateState(session.state);
  const openEvent = initialEvent(session.state, registries);
  const output = reduceStep({ state: session.state, openEvent, actionId }, registries);
  const revision = session.revision + 1;
  const decision: DiagnosticDecision = { kind: 'action', revision, stepIndex: session.state.clock.stepIndex, eventId: openEvent.templateId, actionId };
  const copy = eventCopy(openEvent.templateId);
  const chosenCopy = actionCopy(openEvent.templateId, actionId);
  const lastStepSummary = getStepSummary({ before: session.state, output, registries, eventTitle: copy.title, actionLabel: chosenCopy.label });
  const periodSummaries = getPeriodBoundaries(session.state, output.state, registries).map((boundary) => getPeriodSummary(output.state, boundary, registries));
  const next: CampaignSession = { ...session, state: output.state, lastStepSummary, periodSummaries, revision, diagnostics: { ...session.diagnostics, decisions: [...session.diagnostics.decisions, decision] } };
  return periodSummaries.length ? reanchor(next) : next;
}

/**
 * Выбор формата занятости — отдельное подтверждённое решение до плана недели.
 * Он необратим, поэтому экран называет цену прямо, а не прячет её во второй слой.
 */
function confirmEmployment(session: CampaignSession, format: EmploymentFormat): CampaignSession {
  const output = reduceEmploymentSetup({ state: session.state, format, campaignDays: CAMPAIGN_DAYS });
  const revision = session.revision + 1;
  const decision: DiagnosticDecision = { kind: 'employment', revision, stepIndex: session.state.clock.stepIndex, format };
  return { ...session, state: output.state, revision, diagnostics: { ...session.diagnostics, decisions: [...session.diagnostics.decisions, decision] } };
}

function confirmPlanning(session: CampaignSession, plan: PlanningPlan): CampaignSession {
  const output = reducePlanningStep({ state: session.state, plan });
  const revision = session.revision + 1;
  const decision: DiagnosticDecision = { kind: 'planning', revision, stepIndex: session.state.clock.stepIndex, plan: structuredClone(plan) };
  return { ...session, state: output.state, lastStepSummary: session.lastStepSummary, periodSummaries: session.periodSummaries, revision, diagnostics: { ...session.diagnostics, decisions: [...session.diagnostics.decisions, decision] } };
}

/**
 * Переносит якорь на текущее состояние и очищает хвост решений. Вызывается на
 * закрытии периода, поэтому хвост никогда не длиннее одного периода.
 */
function reanchor(session: CampaignSession): CampaignSession {
  const anchor: CampaignAnchor = {
    revision: session.revision,
    stateHash: stateHash(session.state),
    state: structuredClone(session.state),
    lastStepSummary: session.lastStepSummary ? structuredClone(session.lastStepSummary) : null,
    periodSummaries: structuredClone(session.periodSummaries),
    lastDecisionKind: session.diagnostics.decisions.at(-1)?.kind ?? session.anchor.lastDecisionKind,
  };
  return { ...session, anchor, diagnostics: { ...session.diagnostics, decisions: [] } };
}

function replayDecisions(anchor: CampaignAnchor, diagnostics: DiagnosticLedger, comparisonBaseline?: CampaignSession['comparisonBaseline']): CampaignSession {
  assertGameSeed(anchor.state.rng.seed);
  if (diagnostics.history !== 'complete') throw new Error('complete decision history required');
  let state = structuredClone(anchor.state);
  let lastStepSummary: StepSummary | null = anchor.lastStepSummary ? structuredClone(anchor.lastStepSummary) : null;
  let periodSummaries: PeriodSummary[] = structuredClone(anchor.periodSummaries);
  for (const decision of diagnostics.decisions) {
    if (decision.kind === 'action') {
      const slot = registries.slots[state.scenarioCursor];
      if (!slot || state.activeEventId !== decision.eventId || state.clock.stepIndex !== decision.stepIndex) throw new Error(`action replay mismatch at revision ${decision.revision}`);
      const openEvent = initialEvent(state, registries);
      const output = reduceStep({ state, openEvent, actionId: decision.actionId }, registries);
      const copy = eventCopy(decision.eventId);
      const chosenCopy = actionCopy(decision.eventId, decision.actionId);
      lastStepSummary = getStepSummary({ before: state, output, registries, eventTitle: copy.title, actionLabel: chosenCopy.label });
      periodSummaries = getPeriodBoundaries(state, output.state, registries).map((boundary) => getPeriodSummary(output.state, boundary, registries));
      state = output.state;
    } else if (decision.kind === 'employment') {
      if (state.clock.stepIndex !== decision.stepIndex) throw new Error(`employment replay mismatch at revision ${decision.revision}`);
      state = reduceEmploymentSetup({ state, format: decision.format, campaignDays: CAMPAIGN_DAYS }).state;
    } else {
      if (state.clock.stepIndex !== decision.stepIndex) throw new Error(`planning replay mismatch at revision ${decision.revision}`);
      state = reducePlanningStep({ state, plan: decision.plan }).state;
    }
  }
  validateState(state);
  return {
    state,
    lastStepSummary,
    periodSummaries,
    revision: diagnostics.decisions.at(-1)?.revision || anchor.revision,
    diagnostics: structuredClone(diagnostics),
    anchor: structuredClone(anchor),
    ...(comparisonBaseline ? { comparisonBaseline } : {}),
  };
}

function physicalStorageKey(clientId: string) {
  return `heys_${clientId}_${STORAGE_KEY.replace(/^heys_/, '')}`;
}

function checkpointSizeBytes(clientId: string, envelope: CampaignEnvelope) {
  return (physicalStorageKey(clientId).length + JSON.stringify(envelope).length) * 2;
}

function hasRawClientIdentifier(value: unknown, clientId: string) {
  if (containsUuid(value)) return true;
  try {
    return Boolean(clientId) && JSON.stringify(value).toLowerCase().includes(clientId.toLowerCase());
  } catch {
    return true;
  }
}

function makeEnvelope(session: CampaignSession, clientId: string): CampaignEnvelope {
  assertGameSeed(session.state.rng.seed);
  const diagnostics = diagnosticsFrom(session.diagnostics, session.revision, session.anchor.revision);
  if (diagnostics.history !== 'complete' || hasRawClientIdentifier({ anchor: session.anchor, diagnostics, comparisonBaseline: session.comparisonBaseline }, clientId)) {
    throw new Error('checkpoint contains a personal identifier or incomplete history');
  }
  if (stateHash(session.anchor.state) !== session.anchor.stateHash) throw new Error('checkpoint anchor hash mismatch');
  // Проверка стоит ровно один период: якорь плюс хвост решений после него.
  const replayed = replayDecisions(session.anchor, diagnostics, session.comparisonBaseline);
  if (stateHash(replayed.state) !== stateHash(session.state)
    || JSON.stringify(replayed.lastStepSummary) !== JSON.stringify(session.lastStepSummary)
    || JSON.stringify(replayed.periodSummaries) !== JSON.stringify(session.periodSummaries)) {
    throw new Error('checkpoint tail does not reproduce the session');
  }
  return {
    envelopeVersion: ENVELOPE_VERSION,
    scopeTag: scopeTagFor(clientId),
    gameSeed: session.state.rng.seed,
    savedAt: new Date().toISOString(),
    revision: session.revision,
    stateHash: stateHash(session.state),
    contract: { ...CONTRACT },
    anchor: structuredClone(session.anchor),
    diagnostics,
    lifetime: { decisions: session.revision },
    comparisonBaseline: session.comparisonBaseline,
  };
}

function loadLegacyCheckpoint(envelope: LegacyCampaignEnvelope, clientId: string): LoadResult {
  if (!contractMatches(envelope.contract)) return { status: 'incompatible', message: 'Сохранение создано другой версией игры. Начните новую кампанию явно или вернитесь в HEYS.' };
  if (envelope.clientId !== clientId) return { status: 'foreign', message: 'Сохранение принадлежит другому профилю HEYS и не будет открыто.' };
  if (hasRawClientIdentifier({ state: envelope.state, diagnostics: envelope.diagnostics, comparisonBaseline: envelope.comparisonBaseline }, clientId)) {
    return { status: 'privacy', message: 'Старое сохранение содержит идентификатор профиля внутри кампании. Оно оставлено без изменений: начните новую кампанию явно или вернитесь в HEYS.' };
  }
  try {
    validateState(envelope.state);
    if (!Number.isInteger(envelope.revision) || envelope.revision < 0 || envelope.campaignId !== envelope.state.campaignId || stateHash(envelope.state) !== envelope.stateHash) throw new Error('legacy checkpoint mismatch');
    const diagnostics = diagnosticsFrom(envelope.diagnostics, envelope.revision);
    if (diagnostics.history !== 'complete') return { status: 'incompatible', message: 'В старом сохранении нет полной истории решений для безопасного восстановления. Оно оставлено без изменений.' };
    const comparisonBaseline = comparisonBaselineFrom(envelope.comparisonBaseline);
    const session = replayDecisions(initialAnchor(envelope.state.rng.seed), diagnostics, comparisonBaseline);
    if (stateHash(session.state) !== envelope.stateHash) throw new Error('legacy replay mismatch');
    return { status: 'ready', session };
  } catch {
    return { status: 'corrupt', message: 'Сохранение не прошло проверку целостности. Оно оставлено без изменений.' };
  }
}

function initialAnchor(seed: string): CampaignAnchor {
  const state = createInitialState(seed);
  return { revision: 0, stateHash: stateHash(state), state, lastStepSummary: null, periodSummaries: [], lastDecisionKind: null };
}

function anchorFrom(value: unknown, gameSeed: string): CampaignAnchor {
  const anchor = value as CampaignAnchor;
  if (!anchor || typeof anchor !== 'object' || !Number.isInteger(anchor.revision) || anchor.revision < 0 || typeof anchor.stateHash !== 'string') throw new Error('invalid checkpoint anchor');
  const state = structuredClone(anchor.state);
  validateState(state);
  if (state.rng.seed !== gameSeed) throw new Error('anchor seed mismatch');
  if (stateHash(state) !== anchor.stateHash) throw new Error('anchor hash mismatch');
  if (!Array.isArray(anchor.periodSummaries)) throw new Error('invalid anchor summaries');
  return {
    revision: anchor.revision,
    stateHash: anchor.stateHash,
    state,
    lastStepSummary: anchor.lastStepSummary ? structuredClone(anchor.lastStepSummary) : null,
    periodSummaries: structuredClone(anchor.periodSummaries),
    lastDecisionKind: anchor.lastDecisionKind === 'action' || anchor.lastDecisionKind === 'planning' ? anchor.lastDecisionKind : null,
  };
}

function loadCheckpoint(store: any, clientId: string, _fresh = false): LoadResult {
  if (!store?.getPersisted || !clientId) return { status: 'unavailable', message: 'Профиль HEYS недоступен. Вернитесь в HEYS и откройте игру снова.' };
  const missing = Object.freeze({ missingCheckpoint: true });
  let value: unknown;
  try {
    value = store.getPersisted(STORAGE_KEY, missing);
  } catch {
    return { status: 'corrupt', message: 'Сохранение не удалось прочитать. Оно оставлено без изменений.' };
  }
  if (value === missing) return { status: 'empty' };
  if (value == null || typeof value !== 'object') return { status: 'corrupt', message: 'Формат сохранения повреждён. Оно оставлено без изменений.' };
  const version = (value as { envelopeVersion?: unknown }).envelopeVersion;
  if (version === 1) return loadLegacyCheckpoint(value as LegacyCampaignEnvelope, clientId);
  if (version !== ENVELOPE_VERSION) {
    return { status: 'incompatible', message: 'Сохранение создано другой версией игры. Начните новую кампанию явно или вернитесь в HEYS.' };
  }
  const envelope = value as CampaignEnvelope;
  if (!contractMatches(envelope.contract)) return { status: 'incompatible', message: 'Сохранение создано другой версией игры. Начните новую кампанию явно или вернитесь в HEYS.' };
  if (envelope.scopeTag !== scopeTagFor(clientId)) return { status: 'foreign', message: 'Сохранение принадлежит другому профилю HEYS и не будет открыто.' };
  if (checkpointSizeBytes(clientId, envelope) > CHECKPOINT_BUDGET_BYTES) return { status: 'incompatible', message: 'Сохранение превышает безопасный размер этой версии игры. Оно оставлено без изменений.' };
  if (hasRawClientIdentifier({ gameSeed: envelope.gameSeed, anchor: envelope.anchor, diagnostics: envelope.diagnostics, comparisonBaseline: envelope.comparisonBaseline }, clientId)) {
    return { status: 'privacy', message: 'Сохранение содержит идентификатор профиля внутри кампании. Оно оставлено без изменений.' };
  }
  try {
    const anchor = anchorFrom(envelope.anchor, envelope.gameSeed);
    const diagnostics = diagnosticsFrom(envelope.diagnostics, envelope.revision, anchor.revision);
    if (diagnostics.history !== 'complete' || !Number.isInteger(envelope.revision) || envelope.revision < 0 || typeof envelope.stateHash !== 'string') throw new Error('checkpoint shape mismatch');
    const comparisonBaseline = comparisonBaselineFrom(envelope.comparisonBaseline);
    const session = replayDecisions(anchor, diagnostics, comparisonBaseline);
    if (session.revision !== envelope.revision || stateHash(session.state) !== envelope.stateHash) throw new Error('checkpoint replay mismatch');
    return { status: 'ready', session };
  } catch {
    return { status: 'corrupt', message: 'Сохранение не прошло проверку целостности. Оно оставлено без изменений.' };
  }
}

function redactDiagnosticIdentifiers(value: unknown, identifiers: string[]): unknown {
  if (typeof value === 'string') return identifiers.reduce((text, identifier) => identifier ? text.replaceAll(identifier, '[redacted-game-id]') : text, value);
  if (Array.isArray(value)) return value.map((item) => redactDiagnosticIdentifiers(item, identifiers));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactDiagnosticIdentifiers(item, identifiers)]));
  return value;
}

function createDiagnosticTrace(session: CampaignSession) {
  const steps: unknown[] = [];
  // Полный лог строится от якоря: детали периодов до него намеренно усечены,
  // а причинно значимое состояние целиком лежит в самом якоре.
  let replayState = structuredClone(session.anchor.state);
  let replayStatus: 'match' | 'mismatch' | 'partial' = session.diagnostics.history === 'complete' ? (session.anchor.revision > 0 ? 'partial' : 'match') : 'partial';
  let replayError = '';
  if (session.diagnostics.history === 'complete') {
    try {
      for (const decision of session.diagnostics.decisions) {
        if (decision.kind === 'action') {
          const slot = registries.slots[replayState.scenarioCursor];
          if (!slot || replayState.activeEventId !== decision.eventId || replayState.clock.stepIndex !== decision.stepIndex) throw new Error(`action replay mismatch at revision ${decision.revision}`);
          const event = initialEvent(replayState, registries);
          const contextBefore = computeDecisionContext(replayState);
          const offersBefore = getActionOffers(replayState, event.templateId, registries, contextBefore).map((offer) => presentOffer(event.templateId, offer));
          const stateBefore = diagnosticStateSnapshot(replayState);
          const stateBeforeHash = stateHash(replayState);
          const output = reduceStep({ state: replayState, openEvent: event, actionId: decision.actionId }, registries, true);
          steps.push({
            ...decision, event: { ...event, id: '[redacted-game-id]' }, slot: structuredClone(slot),
            contextBefore, offersBefore, actionDefinition: structuredClone(registries.actions[decision.actionId]),
            appliedAction: output.appliedAction, stateBefore, stateBeforeHash,
            reducerStages: output.stages, journalEntries: output.journalEntries,
            nextEvent: output.nextEvent ? { ...output.nextEvent, id: '[redacted-game-id]' } : null,
            stateAfter: diagnosticStateSnapshot(output.state), stateAfterHash: output.stateHash,
          });
          replayState = output.state;
        } else if (decision.kind === 'employment') {
          if (replayState.clock.stepIndex !== decision.stepIndex) throw new Error(`employment replay mismatch at revision ${decision.revision}`);
          const contextBefore = computeDecisionContext(replayState);
          const stateBefore = diagnosticStateSnapshot(replayState);
          const stateBeforeHash = stateHash(replayState);
          const output = reduceEmploymentSetup({ state: replayState, format: decision.format, campaignDays: CAMPAIGN_DAYS });
          steps.push({
            ...decision, contextBefore, stateBefore, stateBeforeHash,
            reducerStages: [{ stage: 'employment', hash: output.stateHash }], journalEntries: output.journalEntries,
            stateAfter: diagnosticStateSnapshot(output.state), stateAfterHash: output.stateHash,
          });
          replayState = output.state;
        } else {
          if (replayState.clock.stepIndex !== decision.stepIndex) throw new Error(`planning replay mismatch at revision ${decision.revision}`);
          const contextBefore = computeDecisionContext(replayState);
          const planningView = getPlanningView(replayState, decision.plan, contextBefore);
          const stateBefore = diagnosticStateSnapshot(replayState);
          const stateBeforeHash = stateHash(replayState);
          const output = reducePlanningStep({ state: replayState, plan: decision.plan });
          steps.push({
            ...decision, contextBefore, planningView, stateBefore, stateBeforeHash,
            reducerStages: [{ stage: 'planning', hash: output.stateHash }], journalEntries: output.journalEntries,
            stateAfter: diagnosticStateSnapshot(output.state), stateAfterHash: output.stateHash,
          });
          replayState = output.state;
        }
      }
      if (stateHash(replayState) !== stateHash(session.state)) replayStatus = 'mismatch';
    } catch (error) {
      replayStatus = 'mismatch';
      replayError = error instanceof Error ? error.message : String(error);
    }
  }
  const payload = {
    traceVersion: 1,
    generatedAt: new Date().toISOString(),
    product: 'HEYS Assemble Day',
    contract: { ...CONTRACT },
    privacy: {
      containsPersonalHeysData: false,
      note: 'Only the fictional campaign is included; client and game identifiers are removed.',
    },
    summary: {
      revision: session.revision,
      gameStepIndex: session.state.clock.stepIndex,
      actionSteps: session.diagnostics.decisions.filter((entry) => entry.kind === 'action').length,
      planningSteps: session.diagnostics.decisions.filter((entry) => entry.kind === 'planning').length,
      history: session.diagnostics.history,
      currentStateHash: stateHash(session.state),
    },
    replayIntegrity: {
      status: replayStatus,
      replayStateHash: replayStatus === 'partial' ? null : stateHash(replayState),
      actualStateHash: stateHash(session.state),
      ...(replayError ? { error: replayError } : {}),
    },
    capturedMechanics: [
      'state before and after each confirmed step',
      'decision context and every ActionOffer',
      'availability, geometry, planning signals, effort, risk and option pressure',
      'selected action and reducer stage hashes',
      'causal journal delta, scheduled effects, RNG and event ledger',
      'planning input, planning view and atomic planning output',
      'engine-owned campaign brief, directional step result and idempotent period summaries',
      'persisted causal echo event, character development and multidimensional campaign outcome',
    ],
    catalog: structuredClone(registries),
    currentState: structuredClone(session.state),
    campaignBrief: getCampaignBrief(session.state, registries),
    currentPeriodSummaries: structuredClone(session.periodSummaries),
    derivedOutcome: getCampaignOutcome(session.state),
    comparisonBaseline: session.comparisonBaseline || null,
    recordedDecisions: structuredClone(session.diagnostics.decisions),
    steps,
  };
  return redactDiagnosticIdentifiers(payload, [session.state.rng.seed, session.state.campaignId]);
}

function serializeDiagnosticTrace(session: CampaignSession) {
  return JSON.stringify(createDiagnosticTrace(session), null, 2);
}

async function copyDiagnosticTrace(session: CampaignSession) {
  const text = serializeDiagnosticTrace(session);
  try {
    if (!window.navigator?.clipboard?.writeText) throw new Error('clipboard api unavailable');
    await window.navigator.clipboard.writeText(text);
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
    field.remove();
    if (!copied) throw new Error('clipboard write failed');
  }
  return text.length;
}

function saveCheckpoint(store: any, clientId: string, session: CampaignSession, forceNewCampaign = false): SaveResult {
  if (!store?.getPersisted || !store?.set || !clientId) return { status: 'unavailable', message: 'Не удалось связать прогресс с текущим профилем HEYS.' };
  const current = loadCheckpoint(store, clientId, true);
  if (!forceNewCampaign && current.status === 'ready') {
    if (current.session.state.campaignId !== session.state.campaignId) return { status: 'conflict', message: 'В профиле уже есть другая кампания. Прогресс не перезаписан.' };
    if (current.session.revision > session.revision) return { status: 'conflict', message: 'Найдено более новое сохранение. Текущий шаг не перезаписал его.' };
    if (current.session.revision === session.revision && stateHash(current.session.state) !== stateHash(session.state)) return { status: 'conflict', message: 'Сохранение уже содержит другое решение этого шага. Оно не перезаписано.' };
  } else if (!forceNewCampaign && current.status !== 'empty' && current.status !== 'ready') {
    return { status: 'conflict', message: current.message };
  }
  try {
    const envelope = makeEnvelope(session, clientId);
    const sizeBytes = checkpointSizeBytes(clientId, envelope);
    if (sizeBytes > CHECKPOINT_BUDGET_BYTES) {
      return { status: 'failed', message: 'Шаг принят, но компактное сохранение превысило безопасный размер. Существующий прогресс оставлен без изменений.' };
    }
    const written = store.set(STORAGE_KEY, envelope);
    if (written === false) return { status: 'failed', message: 'Шаг принят, но сохранить его не удалось. Не закрывайте игру и повторите действие.' };
    return { status: 'saved', envelope, sizeBytes, budgetBytes: CHECKPOINT_BUDGET_BYTES };
  } catch {
    return { status: 'failed', message: 'Шаг принят, но сохранить его не удалось. Не закрывайте игру и повторите действие.' };
  }
}

const h = (...args: any[]) => window.React.createElement(...args);

/**
 * Панорама места: холст 180×48 логических пикселей при том же масштабе 2×, что и
 * прежняя сцена 56×48. Обстановка — фон, персонаж — отдельный слой поверх неё,
 * поэтому один спрайт переиспользуется во всех местах. Кадр меняется только
 * вместе с подтверждённым состоянием, анимации перехода между местами нет.
 */
const SCENE_WIDTH = 180;
const SCENE_CHARACTER_X = 58;

/** Окно вместе с ночными огнями: время суток несёт свет, а не новые предметы. */
function sceneWindow(dx: number, night: boolean) {
  return h('g', { key: `window-${dx}`, transform: `translate(${dx},0)` },
    h('rect', { className: 'scene-window', x: 35, y: 5, width: 16, height: 13 }),
    h('path', { className: 'scene-mid', d: 'M36 16v-3h2v2h2v-4h2v3h2v-2h2v3h4v1z' }),
    h('path', { className: 'scene-ink', d: 'M35 5h16v2H35zm0 4h16v1H35z' }),
    night && h('path', { className: 'scene-highlight', d: 'M39 11h1v1h-1zm7-2h1v1h-1zm2 4h1v1h-1z' }),
  );
}

function scenePicture(dx: number) {
  return h('path', { key: `picture-${dx}`, className: 'scene-ink', transform: `translate(${dx},0)`, d: 'M6 6h10v10H6zm2 2v6h6V8zm1 1h2v2H9zm3 0h1v4h-1z' });
}

function sceneShelf(dx: number) {
  return h('g', { key: `shelf-${dx}`, transform: `translate(${dx},0)` },
    h('rect', { className: 'scene-ink', x: 41, y: 25, width: 11, height: 13 }),
    h('rect', { className: 'scene-bg', x: 43, y: 27, width: 7, height: 3 }),
    h('rect', { className: 'scene-bg', x: 43, y: 32, width: 1, height: 4 }),
    h('rect', { className: 'scene-bg', x: 46, y: 31, width: 1, height: 5 }),
    h('rect', { className: 'scene-bg', x: 49, y: 32, width: 1, height: 4 }),
  );
}

function sceneTable(dx: number, dy = 0) {
  return h('g', { key: `table-${dx}`, transform: `translate(${dx},${dy})` },
    h('rect', { className: 'scene-ink', x: 5, y: 25, width: 14, height: 2 }),
    h('rect', { className: 'scene-ink', x: 7, y: 27, width: 2, height: 11 }),
    h('rect', { className: 'scene-ink', x: 16, y: 27, width: 2, height: 11 }),
  );
}

function scenePlant(dx: number, dy = 0) {
  return h('g', { key: `plant-${dx}`, transform: `translate(${dx},${dy})` },
    h('rect', { className: 'scene-mid', x: 10, y: 21, width: 4, height: 4 }),
    h('path', { className: 'scene-ink', d: 'M12 21v-4h1v2h2v1h-2v1zm0-1H9v-1h2v-2h1z' }),
  );
}

/** Мебель за спиной персонажа заливается светлым: иначе силуэт сливается с обивкой. */
function sceneSeat(kind: 'chair' | 'sofa', dx: number, dy: number) {
  return kind === 'chair'
    ? h('g', { key: 'seat', transform: `translate(${dx},${dy})` },
      h('rect', { className: 'scene-ink', x: 0, y: 0, width: 20, height: 12 }),
      h('rect', { className: 'scene-floor', x: 2, y: 2, width: 16, height: 8 }),
      h('rect', { className: 'scene-ink', x: 8, y: 12, width: 4, height: 4 }),
      h('rect', { className: 'scene-ink', x: 4, y: 16, width: 12, height: 2 }),
    )
    : h('g', { key: 'seat', transform: `translate(${dx},${dy})` },
      h('rect', { className: 'scene-ink', x: 0, y: 0, width: 40, height: 8 }),
      h('rect', { className: 'scene-floor', x: 2, y: 2, width: 36, height: 6 }),
      h('rect', { className: 'scene-ink', x: 0, y: 8, width: 40, height: 10 }),
      h('rect', { className: 'scene-floor', x: 4, y: 10, width: 32, height: 6 }),
      h('rect', { className: 'scene-mid', x: 5, y: 3, width: 7, height: 5 }),
      h('rect', { className: 'scene-ink', x: 2, y: 18, width: 3, height: 3 }),
      h('rect', { className: 'scene-ink', x: 35, y: 18, width: 3, height: 3 }),
    );
}

/** Обстановка позади персонажа. Три-четыре якоря на место, больше не добавляем. */
function scenePlaceBack(place: CharacterPresentation['frame']['place'], night: boolean) {
  if (place === 'bedroom') {
    return [
      scenePicture(14),
      h('g', { key: 'bed', transform: 'translate(14,16)' },
        h('rect', { className: 'scene-ink', x: 0, y: 6, width: 3, height: 16 }),
        h('rect', { className: 'scene-skin', x: 3, y: 14, width: 36, height: 3 }),
        h('rect', { className: 'scene-ink', x: 5, y: 9, width: 10, height: 1 }),
        h('rect', { className: 'scene-skin', x: 5, y: 10, width: 10, height: 4 }),
        h('rect', { className: 'scene-mid', x: 18, y: 12, width: 21, height: 5 }),
        h('rect', { className: 'scene-ink', x: 24, y: 12, width: 1, height: 5 }),
        h('rect', { className: 'scene-ink', x: 31, y: 12, width: 1, height: 5 }),
        h('rect', { className: 'scene-ink', x: 3, y: 17, width: 36, height: 2 }),
        h('rect', { className: 'scene-ink', x: 4, y: 19, width: 2, height: 3 }),
        h('rect', { className: 'scene-ink', x: 36, y: 19, width: 2, height: 3 }),
      ),
      sceneTable(50), scenePlant(49), sceneWindow(65, night), sceneShelf(90),
      h('g', { key: 'door', transform: 'translate(150,14)' },
        h('rect', { className: 'scene-ink', x: 0, y: 0, width: 16, height: 24 }),
        h('rect', { className: 'scene-bg', x: 2, y: 2, width: 12, height: 22 }),
        h('rect', { className: 'scene-mid', x: 11, y: 15, width: 2, height: 2 }),
      ),
    ];
  }
  if (place === 'kitchen') {
    return [
      h('g', { key: 'kitchen', transform: 'translate(22,0)' },
        h('rect', { className: 'scene-ink', x: 4, y: 6, width: 34, height: 12 }),
        h('rect', { className: 'scene-bg', x: 6, y: 8, width: 14, height: 8 }),
        h('rect', { className: 'scene-bg', x: 22, y: 8, width: 14, height: 8 }),
        h('rect', { className: 'scene-ink', x: 0, y: 25, width: 50, height: 2 }),
        h('rect', { className: 'scene-ink', x: 0, y: 27, width: 50, height: 11 }),
        h('rect', { className: 'scene-bg', x: 2, y: 29, width: 22, height: 7 }),
        h('rect', { className: 'scene-bg', x: 26, y: 29, width: 22, height: 7 }),
      ),
      h('g', { key: 'pot', transform: 'translate(38,15)' },
        h('rect', { className: 'scene-ink', x: 2, y: 0, width: 1, height: 2 }),
        h('rect', { className: 'scene-ink', x: 5, y: 1, width: 1, height: 2 }),
        h('rect', { className: 'scene-ink', x: 0, y: 4, width: 8, height: 1 }),
        h('rect', { className: 'scene-mid', x: 0, y: 5, width: 8, height: 5 }),
      ),
      sceneWindow(65, night),
      h('g', { key: 'fridge', transform: 'translate(126,14)' },
        h('rect', { className: 'scene-ink', x: 0, y: 0, width: 16, height: 24 }),
        h('rect', { className: 'scene-bg', x: 2, y: 2, width: 12, height: 8 }),
        h('rect', { className: 'scene-bg', x: 2, y: 12, width: 12, height: 10 }),
        h('rect', { className: 'scene-mid', x: 11, y: 4, width: 1, height: 4 }),
      ),
    ];
  }
  if (place === 'commute') {
    return [
      h('g', { key: 'skyline', className: 'scene-mid' },
        h('rect', { x: 6, y: 22, width: 9, height: 16 }),
        h('rect', { x: 18, y: 17, width: 7, height: 21 }),
        h('rect', { x: 28, y: 25, width: 10, height: 13 }),
        h('rect', { x: 142, y: 20, width: 8, height: 18 }),
        h('rect', { x: 154, y: 26, width: 10, height: 12 }),
        h('rect', { x: 168, y: 15, width: 8, height: 23 }),
      ),
      h('g', { key: 'marks', className: 'scene-skin' },
        h('rect', { x: 4, y: 42, width: 8, height: 1 }),
        h('rect', { x: 28, y: 42, width: 8, height: 1 }),
        h('rect', { x: 52, y: 42, width: 8, height: 1 }),
        h('rect', { x: 76, y: 42, width: 8, height: 1 }),
        h('rect', { x: 100, y: 42, width: 8, height: 1 }),
        h('rect', { x: 124, y: 42, width: 8, height: 1 }),
        h('rect', { x: 148, y: 42, width: 8, height: 1 }),
      ),
      h('g', { key: 'car', transform: 'translate(44,14)' },
        h('rect', { className: 'scene-ink', x: 22, y: 0, width: 46, height: 1 }),
        h('rect', { className: 'scene-mid', x: 22, y: 1, width: 46, height: 11 }),
        h('rect', { className: 'scene-ink', x: 22, y: 1, width: 1, height: 11 }),
        h('rect', { className: 'scene-ink', x: 67, y: 1, width: 1, height: 11 }),
        h('rect', { className: 'scene-window', x: 26, y: 3, width: 18, height: 8 }),
        h('rect', { className: 'scene-window', x: 48, y: 3, width: 16, height: 8 }),
        h('rect', { className: 'scene-ink', x: 0, y: 11, width: 88, height: 1 }),
        h('rect', { className: 'scene-mid', x: 0, y: 12, width: 88, height: 10 }),
        h('rect', { className: 'scene-ink', x: 0, y: 22, width: 88, height: 1 }),
        h('rect', { className: 'scene-ink', x: 0, y: 12, width: 1, height: 10 }),
        h('rect', { className: 'scene-ink', x: 87, y: 12, width: 1, height: 10 }),
        h('rect', { className: 'scene-skin', x: 84, y: 16, width: 3, height: 3 }),
        h('rect', { className: 'scene-skin', x: 1, y: 16, width: 3, height: 3 }),
        h('rect', { className: 'scene-ink', x: 15, y: 18, width: 10, height: 10 }),
        h('rect', { className: 'scene-ink', x: 14, y: 20, width: 12, height: 6 }),
        h('rect', { className: 'scene-bg', x: 18, y: 21, width: 4, height: 4 }),
        h('rect', { className: 'scene-ink', x: 65, y: 18, width: 10, height: 10 }),
        h('rect', { className: 'scene-ink', x: 64, y: 20, width: 12, height: 6 }),
        h('rect', { className: 'scene-bg', x: 68, y: 21, width: 4, height: 4 }),
      ),
      h('g', { key: 'traffic', transform: 'translate(150,6)' },
        h('rect', { className: 'scene-ink', x: 4, y: 13, width: 3, height: 19 }),
        h('rect', { className: 'scene-ink', x: 0, y: 0, width: 11, height: 13 }),
        h('rect', { className: 'scene-mid', x: 3, y: 2, width: 5, height: 4 }),
        h('rect', { className: 'scene-bg', x: 3, y: 8, width: 5, height: 3 }),
      ),
    ];
  }
  if (place === 'work') {
    return [scenePicture(8), sceneShelf(-25), sceneSeat('chair', 76, 20), sceneWindow(112, night)];
  }
  return [scenePicture(8), sceneShelf(-25), sceneSeat('sofa', 62, 17), sceneWindow(88, night),
    h('g', { key: 'lamp', transform: 'translate(110,16)' },
      h('rect', { className: 'scene-mid', x: 0, y: 0, width: 9, height: 1 }),
      h('rect', { className: 'scene-mid', x: 1, y: 1, width: 7, height: 5 }),
      h('rect', { className: 'scene-ink', x: 4, y: 6, width: 1, height: 14 }),
      h('rect', { className: 'scene-ink', x: 1, y: 20, width: 7, height: 2 }),
    ),
    sceneTable(125), scenePlant(124),
  ];
}

/** Предметы перед персонажем: рабочий стол закрывает его по пояс, иначе он читается стоящим сбоку. */
function scenePlaceFront(place: CharacterPresentation['frame']['place']) {
  if (place !== 'work') return [];
  return [
    h('g', { key: 'desk', transform: 'translate(60,33)' },
      h('rect', { className: 'scene-ink', x: 0, y: 0, width: 56, height: 2 }),
      h('rect', { className: 'scene-ink', x: 2, y: 2, width: 2, height: 3 }),
      h('rect', { className: 'scene-ink', x: 52, y: 2, width: 2, height: 3 }),
    ),
    scenePlant(55, 8),
    h('g', { key: 'monitor', transform: 'translate(98,18)' },
      h('rect', { className: 'scene-ink', x: 0, y: 0, width: 18, height: 13 }),
      h('rect', { className: 'scene-bg', x: 2, y: 2, width: 14, height: 9 }),
      h('rect', { className: 'scene-mid', x: 4, y: 4, width: 8, height: 1 }),
      h('rect', { className: 'scene-mid', x: 4, y: 6, width: 10, height: 1 }),
      h('rect', { className: 'scene-mid', x: 4, y: 8, width: 6, height: 1 }),
      h('rect', { className: 'scene-ink', x: 7, y: 13, width: 4, height: 2 }),
    ),
  ];
}

function CharacterScene({ presentation }: { presentation: CharacterPresentation }) {
  const { pose, expression, load, dayPhase, place } = presentation.frame;
  const recovering = pose === 'recovering';
  const headY = recovering ? 22 : pose === 'depleted' ? 21 : 18;
  const bodyY = recovering ? 28 : pose === 'depleted' ? 28 : 25;
  // Контуры рта замкнуты: незакрытый path не имеет площади, а stroke у сцены не задан — иначе выражение не рисуется.
  const mouth = expression === 'bright'
    ? `M28 ${headY + 6}h2v1h-2zM27 ${headY + 5}h1v1h-1zM30 ${headY + 5}h1v1h-1z`
    : expression === 'subdued'
      ? `M28 ${headY + 6}h2v1h-2z`
      : `M27 ${headY + 6}h4v1h-4z`;
  const frameKey = `${pose}:${expression}:${load}:${dayPhase}:${place}`;
  const inCar = place === 'commute';
  // В машине человек и так сидит: видны голова и плечи, посадка головы по-прежнему несёт позу.
  const characterX = inCar ? 48 : SCENE_CHARACTER_X;
  return h('svg', {
    className: `assemble-day-character__scene is-${dayPhase} is-${load} is-${place}`,
    viewBox: `0 0 ${SCENE_WIDTH} 48`,
    preserveAspectRatio: 'xMidYMid slice',
    'aria-hidden': 'true',
    focusable: 'false',
    shapeRendering: 'crispEdges',
    'data-frame-key': frameKey,
    'data-pose': pose,
    'data-expression': expression,
    'data-load': load,
    'data-place': place,
  },
  h('rect', { className: 'scene-bg', x: 0, y: 0, width: SCENE_WIDTH, height: 48 }),
  h('rect', { className: 'scene-floor', x: 0, y: 38, width: SCENE_WIDTH, height: 10 }),
  ...scenePlaceBack(place, dayPhase === 'night'),
  recovering && !inCar && place !== 'work' && place !== 'living' && h('g', { key: 'stool', className: 'scene-stool', transform: `translate(${characterX},0)` },
    h('rect', { className: 'scene-ink', x: 24, y: 36, width: 10, height: 2 }),
    h('rect', { className: 'scene-ink', x: 25, y: 38, width: 2, height: 5 }),
    h('rect', { className: 'scene-ink', x: 31, y: 38, width: 2, height: 5 }),
  ),
  // Три уровня намеренно: клип по стеклу, затем сдвиг в место, и только внутри — слой позы, у которого свой CSS-transform.
  h('g', { key: 'character', clipPath: inCar ? 'url(#assemble-day-car-window)' : undefined },
    h('g', { transform: `translate(${characterX},0)` },
    h('g', { className: `scene-character pose-${pose}` },
      h('rect', { className: 'scene-skin', x: 25, y: headY, width: 8, height: 8 }),
      h('path', { className: 'scene-ink', d: `M25 ${headY + 1}v-2h7v1h2v5h-1v-4z` }),
      h('rect', { className: 'scene-ink', x: 27, y: headY + 3, width: 1, height: 1 }),
      h('rect', { className: 'scene-ink', x: 31, y: headY + 3, width: 1, height: 1 }),
      h('path', { className: 'scene-ink scene-mouth', d: mouth }),
      h('rect', { className: 'scene-mid', x: 24, y: bodyY, width: 10, height: recovering ? 7 : 10 }),
      !inCar && h('path', { className: 'scene-ink', d: recovering ? `M24 ${bodyY + 6}h10v2h-4v4h-2v-4h-4z` : `M24 ${bodyY + 9}h4v8h-2v-6h-2zm6 0h4v2h-2v6h-2z` }),
      !inCar && h('path', { className: 'scene-ink', d: recovering ? `M24 ${bodyY + 1}h-2v5h2zm10 0h2v5h-2z` : `M24 ${bodyY + 1}h-2v7h2zm10 0h2v7h-2z` }),
    ),
    ),
  ),
  ...scenePlaceFront(place),
  load === 'pressured' && h('g', { key: 'pressure', className: 'scene-pressure', 'data-pressure-marks': 'true', transform: `translate(${characterX},0)` },
    h('path', { d: 'M22 14h1v-3h1v4h-2z' }),
    h('path', { d: 'M26 13h1V9h1v5h-2z' }),
    h('path', { d: 'M32 14h1v-3h1v4h-2z' }),
  ),
  inCar && h('clipPath', { key: 'car-clip', id: 'assemble-day-car-window' },
    h('rect', { x: 70, y: 17, width: 18, height: 8 }),
  ),
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return h('div', { className: `assemble-day-status assemble-day-status--${tone}` },
    h('span', null, label), h('strong', null, value),
  );
}

function CharacterCard({ state }: { state: GameState }) {
  const presentation = getCharacterPresentation(state);
  return h('section', { className: 'assemble-day-card assemble-day-character', 'aria-labelledby': 'assemble-day-character-title', 'aria-describedby': 'assemble-day-character-summary' },
    h(CharacterScene, { presentation }),
    h('div', { className: 'assemble-day-character__copy' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Фиксированный персонаж'),
      h('h2', { id: 'assemble-day-character-title' }, 'Координатор проектов'),
      h('p', null, 'Партнёр и ребёнок 8 лет · неделя до сдачи проекта'),
    ),
    h('p', { id: 'assemble-day-character-summary', className: 'assemble-day-sr-only', 'aria-live': 'polite' }, presentation.ariaSummary),
    h('div', { className: 'assemble-day-statuses' },
      ...presentation.indicators.map((item) => h(StatusPill, { key: item.id, label: item.label, value: item.value, tone: item.tone })),
    ),
    h('details', { className: 'assemble-day-character__details' },
      h('summary', null, 'Состояние персонажа'),
      h('p', null, presentation.summary),
      presentation.reasons.length
        ? h('ul', { className: 'assemble-day-list' }, ...presentation.reasons.map((reason) => h('li', { key: reason.id }, h('strong', null, reason.label), h('span', null, reason.summary))))
        : h('p', null, 'Сейчас нет дополнительного фактора, который нужно вынести в первый слой.'),
    ),
  );
}

function CampaignBriefCard({ state, compact = false }: { state: GameState; compact?: boolean }) {
  const brief = getCampaignBrief(state, registries);
  return h('section', { className: `assemble-day-card assemble-day-brief${compact ? ' is-compact' : ''}`, 'aria-labelledby': compact ? undefined : 'assemble-day-brief-title' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Задача кампании'),
    h('h2', { id: compact ? undefined : 'assemble-day-brief-title' }, brief.mission.title),
    h('p', null, brief.mission.summary),
    h('div', { className: 'assemble-day-brief__stakes' }, ...brief.stakes.map((item) => h('div', { key: item.id }, h('strong', null, item.title), h('span', null, item.summary)))),
    h('p', { className: 'assemble-day-brief__space' }, brief.choiceSpace),
  );
}

function DayContextStrip({ state }: { state: GameState }) {
  const open = state.commitments.filter((item) => item.status === 'open' || item.status === 'renegotiated').sort((a, b) => a.dueDayIndex - b.dueDayIndex || (a.dueMinuteOfDay || 1439) - (b.dueMinuteOfDay || 1439));
  const nextSlot = registries.slots[state.scenarioCursor + 1];
  const nearest = open[0];
  return h('section', { className: 'assemble-day-card assemble-day-context', 'aria-label': 'Контекст дня' },
    h('dl', null,
      h('div', null, h('dt', null, 'Деньги'), h('dd', null, `${state.economy.cashRub.toLocaleString('ru-RU')} ₽`)),
      h('div', null, h('dt', null, 'Ближайшее обещание'), h('dd', null, nearest ? `${nearest.domain === 'family' ? 'Семья' : 'Дело'} · ${DAY_NAMES[nearest.dueDayIndex]}` : 'Открытых нет')),
      h('div', null, h('dt', null, 'Следующее окно'), h('dd', null, nextSlot ? `${DAY_NAMES[nextSlot.dayIndex]} · ${formatTime(nextSlot.minuteOfDay)}` : 'Итог недели')),
    ),
    h('details', null, h('summary', null, 'Вся линия дня'), h('p', null, open.length ? open.map((item) => `${DAY_NAMES[item.dueDayIndex]} ${formatTime(item.dueMinuteOfDay || 1439)} · ${item.domain}`).join(' · ') : 'Открытых договорённостей нет.')),
  );
}

function ResultBeat({ summary, saveMessage, saveTone, onContinue, onRetry }: any) {
  const React = window.React;
  const headingRef = React.useRef(null);
  React.useEffect(() => { headingRef.current?.focus(); }, []);
  const blocked = saveTone === 'error';
  return h('section', { className: 'assemble-day-card assemble-day-result', 'aria-labelledby': 'assemble-day-result-title', 'aria-live': 'polite', 'aria-atomic': 'true' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Результат решения'),
    h('h2', { id: 'assemble-day-result-title', tabIndex: -1, ref: headingRef }, summary.actionLabel),
    h('p', null, summary.mainChange),
    h('p', { className: 'assemble-day-summary__causal' }, summary.causalLink),
    h('p', { className: 'assemble-day-summary__carry' }, summary.carryover),
    saveMessage && h('p', { className: `assemble-day-alert assemble-day-alert--${saveTone || 'error'}`, role: blocked ? 'alert' : 'status' }, saveMessage),
    blocked
      ? h('button', { type: 'button', className: 'assemble-day-primary', onClick: onRetry }, 'Повторить сохранение')
      : h('button', { type: 'button', className: 'assemble-day-primary', onClick: onContinue }, 'Продолжить'),
  );
}

function DayScreen({ session, selectedActionId, onSelect, onConfirm, saveMessage, saveTone, resultRevision, onContinueResult, onRetrySave, periodSummary, onContinuePeriod, onOpenPlan, onReplaySameSeed, onStartNew }: any) {
  const React = window.React;
  const view = getCampaignView(session);
  const availableIds = view.offers.filter((offer: ActionOffer) => offer.available).map((offer: ActionOffer) => offer.actionId);
  const [focusedActionId, setFocusedActionId] = React.useState(() => selectedActionId || availableIds[0] || '');
  React.useEffect(() => {
    setFocusedActionId(selectedActionId || availableIds[0] || '');
  }, [session.state.activeEventId, selectedActionId]);
  const moveOptionFocus = (currentId: string, delta: number) => {
    if (selectedActionId || !availableIds.length) return;
    const current = Math.max(0, availableIds.indexOf(currentId));
    const nextId = availableIds[(current + delta + availableIds.length) % availableIds.length]!;
    setFocusedActionId(nextId);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-action-id="${nextId}"]`)?.focus());
  };
  if (resultRevision === session.revision && session.lastStepSummary) return h('div', { className: 'assemble-day-screen assemble-day-screen--day' }, h(CharacterCard, { state: session.state }), h(ResultBeat, { summary: session.lastStepSummary, saveMessage, saveTone, onContinue: onContinueResult, onRetry: onRetrySave }));
  if (periodSummary && periodSummary.kind !== 'week') {
    const closesWeek = session.periodSummaries.some((item) => item.kind === 'week');
    const closesMonth = session.periodSummaries.some((item) => item.kind === 'month');
    const nextLabel = periodSummary.kind === 'month'
      ? 'Продолжить жизнь'
      : closesMonth ? 'Посмотреть итог месяца' : closesWeek ? 'Посмотреть итог недели' : 'Перейти к следующему дню';
    return h('div', { className: 'assemble-day-screen assemble-day-screen--day' }, h(CharacterCard, { state: session.state }), h(DaySummaryCard, { summary: periodSummary, onContinue: onContinuePeriod, nextLabel }));
  }
  if (periodSummary?.kind === 'week') return h(CompletionSummary, { session, summary: periodSummary, onReplaySameSeed, onStartNew });
  if (view.complete) return h(CompletionSummary, { session, onReplaySameSeed, onStartNew });
  const planConfirmed = session.state.causalJournal.some((entry) => entry.sourceId === 'planning_plan');
  if (!planConfirmed) return h('div', { className: 'assemble-day-screen assemble-day-screen--day' }, h(CharacterCard, { state: session.state }), h(CampaignBriefCard, { state: session.state }), h('section', { className: 'assemble-day-card assemble-day-contract-start' }, h('span', { className: 'assemble-day-eyebrow' }, 'Контракт недели'), h('h2', null, 'Сначала выберите, что будете защищать'), h('p', null, 'Две недельные границы и два разных фокуса изменят усилие, риск и давление в следующих развилках.'), h('button', { type: 'button', className: 'assemble-day-primary', onClick: onOpenPlan }, 'Выбрать правила недели')));
  const choiceLocked = Boolean(selectedActionId);
  return h('div', { className: 'assemble-day-screen assemble-day-screen--day' },
    h(CharacterCard, { state: session.state }),
    h(DayContextStrip, { state: session.state }),
    h('section', { className: 'assemble-day-card assemble-day-decision' },
      h('header', { className: 'assemble-day-decision__header' },
        h('div', null,
          h('span', { className: 'assemble-day-eyebrow' }, `${view.dayName} · ${view.timeLabel}`),
          h('h2', null, view.event?.title),
        ),
        h('span', { className: 'assemble-day-progress' }, `${view.progress.current}/${view.progress.total}`),
      ),
      h('p', { className: 'assemble-day-situation' }, view.event?.situation),
      h('p', {
        className: `assemble-day-choice-rule${choiceLocked ? ' is-locked' : ''}`,
        role: 'status',
      }, choiceLocked
        ? 'Вариант зафиксирован. Проверьте последствия и подтвердите решение.'
        : 'Первое нажатие, Пробел или Enter фиксирует вариант. Стрелки только перемещают фокус: сначала сравните время, деньги и риск.'),
      h('div', { className: 'assemble-day-options', role: 'radiogroup', 'aria-label': 'Варианты решения' },
        ...view.offers.map((offer: any) => {
          const selected = selectedActionId === offer.actionId;
          const lockedByAnother = choiceLocked && !selected;
          const titleId = `assemble-day-option-${offer.actionId}-title`;
          const descriptionId = `assemble-day-option-${offer.actionId}-description`;
          const inactive = !offer.available || lockedByAnother;
          const reasons = [...new Set((offer.geometryReasons || []).map((item: any) => item.reason))];
          const evidence = [...new Map([offer.evidence, ...(offer.geometryReasons || []).map((item: any) => item.evidence)].filter(Boolean).map((item: any) => [item.id, item])).values()];
          return h('div', { key: offer.actionId, className: 'assemble-day-option-wrap', role: 'none' },
          h('button', {
            type: 'button', role: 'radio', 'aria-checked': selected, 'aria-disabled': inactive || undefined,
            'aria-labelledby': titleId, 'aria-describedby': descriptionId,
            tabIndex: inactive ? -1 : (selected || (!choiceLocked && focusedActionId === offer.actionId) ? 0 : -1),
            className: `assemble-day-option${selected ? ' is-selected' : ''}${lockedByAnother ? ' is-locked' : ''}`,
            onClick: () => { if (!inactive) onSelect(offer.actionId); },
            onKeyDown: (event: KeyboardEvent) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveOptionFocus(offer.actionId, 1); }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveOptionFocus(offer.actionId, -1); }
              if ((event.key === 'Enter' || event.key === ' ') && !inactive) { event.preventDefault(); onSelect(offer.actionId); }
            },
            'data-action-id': offer.actionId,
          },
          h('span', { id: titleId, className: 'assemble-day-option__title' }, offer.label),
          selected && h('span', { className: 'assemble-day-option__selected', 'aria-hidden': 'true' }, 'Выбрано'),
          h('span', { id: descriptionId, className: 'assemble-day-option__body' },
          offer.summary.trim().toLocaleLowerCase('ru-RU') !== offer.label.trim().toLocaleLowerCase('ru-RU')
            && h('span', { className: 'assemble-day-option__summary' }, offer.summary),
          h('span', { className: 'assemble-day-option__meta' },
            h('span', null, `${offer.effectiveTimeMin} мин`),
            offer.moneyRub > 0 && h('span', null, `${offer.moneyRub.toLocaleString('ru-RU')} ₽`),
            h('span', null, offer.effortLabel),
            h('span', null, offer.riskLabel),
          ),
          (offer.consequencePreview?.[0] || offer.consequenceSummary)
            && h('span', { className: 'assemble-day-option__known' }, [offer.consequenceSummary, ...offer.consequencePreview].filter(Boolean).join('. ')),
          reasons.length > 0 && h('span', { className: 'assemble-day-option__factors' }, `Учтено: ${reasons.join('; ')}.`),
          offer.planningSignals?.length > 0
            && h('span', { className: 'assemble-day-option__signals' }, ...offer.planningSignals.map((signal: any) => h('span', { key: `${signal.kind}:${signal.sourceId}`, className: signal.kind.startsWith('conflicts_') ? 'is-conflict' : 'is-support' }, `${signal.kind.startsWith('conflicts_') ? 'Конфликт' : 'Поддерживает'}: ${signal.reason}`))),
          lockedByAnother && h('span', { className: 'assemble-day-option__locked' }, 'Закрыто после первого выбора'),
          !offer.available && h('span', { className: 'assemble-day-option__unavailable' }, offer.unavailableMessages[0] || 'Сейчас недоступно'),
          )),
          h('details', { className: 'assemble-day-option__evidence' },
            h('summary', null, 'Почему игра так оценивает вариант'),
            h('ul', { className: 'assemble-day-list' }, ...evidence.map((item: any) => h('li', { key: item.id }, h('strong', null, item.sourceLabel), h('span', null, confidenceLabel(item.confidence)), h('small', null, item.transferLimit)))),
          ));
        }),
      ),
      saveMessage && h('p', { className: `assemble-day-alert assemble-day-alert--${saveTone || 'error'}`, role: 'status' }, saveMessage),
      h('button', {
        type: 'button', className: 'assemble-day-primary', disabled: !selectedActionId,
        onClick: onConfirm,
      }, 'Подтвердить решение'),
    ),
  );
}

const PERIOD_EYEBROW: Record<PeriodSummary['kind'], string> = { day: 'Итог дня', week: 'Итог недели', month: 'Итог месяца' };

function DaySummaryCard({ summary, onContinue, nextLabel }: { summary: PeriodSummary; onContinue: () => void; nextLabel: string }) {
  return h('section', { className: `assemble-day-card assemble-day-summary assemble-day-summary--${summary.kind}` },
    h('span', { className: 'assemble-day-eyebrow' }, PERIOD_EYEBROW[summary.kind]),
    h('h2', null, summary.title),
    h('p', null, summary.headline),
    h('p', { className: 'assemble-day-summary__causal' }, summary.causalLink),
    h('p', { className: 'assemble-day-summary__carry' }, summary.carryover),
    summary.axes?.length ? h('div', { className: 'assemble-day-outcome-grid' }, ...summary.axes.map((axis) => h('article', { key: axis.id, className: `is-${axis.direction}` }, h('strong', null, axis.title), h('span', null, axis.summary)))) : null,
    summary.openThreads?.length ? h('details', { className: 'assemble-day-details' },
      h('summary', null, 'Что осталось открытым'),
      h('ul', { className: 'assemble-day-list' }, ...summary.openThreads.map((item, index) => h('li', { key: `${index}:${item}` }, item))),
    ) : null,
    h('button', { type: 'button', className: 'assemble-day-primary', onClick: onContinue }, nextLabel),
  );
}

function WeekScreen({ session, plan, onToggleRule, onContinue }: { session: CampaignSession; plan: PlanningPlan; onToggleRule: (id: WeeklyRulePresetId) => void; onContinue: () => void }) {
  const planning = getPlanningCampaignView(session, plan);
  const locked = session.state.clock.stepIndex > 0;
  const currentDay = session.state.clock.dayIndex;
  const dayProgress = DAY_NAMES.map((name, index) => ({ name, status: index < currentDay ? 'Готово' : index === currentDay ? 'Сейчас' : 'Впереди' }));
  const commitments = session.state.commitments.filter((item) => item.status === 'open').slice(0, 3);
  return h('div', { className: 'assemble-day-screen' },
    !locked && h(CampaignBriefCard, { state: session.state, compact: true }),
    h('section', { className: 'assemble-day-card assemble-day-plan-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'План недели'),
      h('h2', null, 'Какие границы сохранить'),
      h('p', null, locked ? 'Контракт уже влияет на развилки этой недели. Изменить его задним числом нельзя.' : 'Ёмкости хватает на две границы из трёх. Цена каждого отказа показана до подтверждения плана.'),
      h('div', { className: 'assemble-day-capacity', role: 'status', 'aria-live': 'polite' },
        h('div', null, h('span', null, 'Защищённые окна'), h('strong', null, `${planning.capacity.weekly.allocatedSlots}/${planning.capacity.weekly.totalSlots}`)),
        h('p', null, planning.capacity.weekly.remainingSlots
          ? `Осталось мест: ${planning.capacity.weekly.remainingSlots}.`
          : 'Ёмкость заполнена. Чтобы выбрать другую границу, сначала освободите одно место.'),
      ),
      h('div', { className: 'assemble-day-rule-grid', role: 'group', 'aria-label': 'Правила недели' },
        ...planning.weeklyRules.map((rule) => h('button', {
          key: rule.id, type: 'button', role: 'checkbox', 'aria-checked': rule.selected, disabled: locked || (!rule.selected && planning.capacity.weekly.remainingSlots === 0),
          className: `assemble-day-rule${rule.selected ? ' is-selected' : ''}`,
          onClick: () => onToggleRule(rule.id),
        }, h('strong', null, rule.title), rule.selected && h('span', { className: 'assemble-day-rule__selected', 'aria-hidden': 'true' }, 'Выбрано'), h('span', null, rule.summary), h('small', null, `Источник: ${rule.source}`), h('small', null, `Цена: ${rule.tradeoff}`))),
      ),
      h('div', { className: 'assemble-day-pressure-grid', 'aria-label': 'Давление недели' },
        ...planning.pressures.map((item) => h('div', { key: item.title, className: `assemble-day-pressure is-${item.level}` }, h('span', null, item.title), h('strong', null, item.level), h('small', null, item.reason))),
      ),
      h('div', { className: 'assemble-day-conflicts', 'aria-live': 'polite' },
        planning.conflicts.length
          ? planning.conflicts.map((item) => h('div', { key: item.id, className: `assemble-day-conflict is-${item.severity}` }, h('strong', null, item.title), h('span', null, item.reason)))
          : h('p', null, 'Явных конфликтов выбранных правил сейчас нет.'),
      ),
      planning.issues.find((item) => item.code.startsWith('weekly_')) && h('p', { className: 'assemble-day-alert', role: 'status' }, planning.issues.find((item) => item.code.startsWith('weekly_'))?.message),
      h('button', { type: 'button', className: 'assemble-day-primary', disabled: plan.weeklyRuleIds.length !== planning.capacity.weekly.totalSlots, onClick: onContinue }, 'Продолжить к приоритетам'),
    ),
    h('details', { className: 'assemble-day-card assemble-day-details' },
      h('summary', null, 'Показать неделю и договорённости'),
      h('p', null, `Контрольная точка: ${DAY_NAMES[currentDay] || 'неделя завершена'}.`),
      h('div', { className: 'assemble-day-week-strip' }, ...dayProgress.map((day) => h('div', { key: day.name, className: `assemble-day-week-day is-${day.status.toLowerCase()}` }, h('strong', null, day.name.slice(0, 2)), h('span', null, day.status)))),
      commitments.length ? h('ul', { className: 'assemble-day-list' }, ...commitments.map((item) => h('li', { key: item.id }, `${item.domain === 'family' ? 'Семья' : 'Дело'} · до ${DAY_NAMES[item.dueDayIndex] || `дня ${item.dueDayIndex + 1}`}`))) : h('p', null, 'Открытых договорённостей сейчас нет.'),
    ),
  );
}

function GoalGroup({ label, value, goals, onChange, disabled = false }: { label: string; value: PlanningDomain; goals: Array<{ id: PlanningDomain; title: string }>; onChange: (id: PlanningDomain) => void; disabled?: boolean }) {
  return h('fieldset', { className: 'assemble-day-goals', role: 'radiogroup', 'aria-label': label },
    h('legend', null, label),
    ...goals.map((goal, index) => {
      const selected = value === goal.id;
      return h('button', {
        key: goal.id, type: 'button', role: 'radio', 'aria-checked': selected, disabled, tabIndex: selected ? 0 : -1,
        className: selected ? 'is-selected' : '', onClick: () => onChange(goal.id), 'data-goal-id': goal.id,
        onKeyDown: (event: KeyboardEvent) => {
          if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) return;
          event.preventDefault();
          const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
          const next = goals[(index + delta + goals.length) % goals.length]!;
          onChange(next.id);
          const group = (event.currentTarget as HTMLElement).closest('[role="radiogroup"]');
          window.requestAnimationFrame(() => group?.querySelector<HTMLElement>(`[data-goal-id="${next.id}"]`)?.focus());
        },
      }, h('span', null, goal.title), selected && h('small', { 'aria-hidden': 'true' }, 'Выбрано'));
    }),
  );
}

function MoneyValue({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return h('div', { className: `assemble-day-money${warning ? ' is-warning' : ''}` }, h('span', null, label), h('strong', null, `${value.toLocaleString('ru-RU')} ₽`));
}

function MonthScreen({ session, plan, onGoalChange, onConfirm, onGoWeek, onGoDay, planMessage, planTone }: any) {
  const planning = getPlanningCampaignView(session, plan);
  const confirmed = planningMatchesState(session.state, plan);
  const weeklyReady = plan.weeklyRuleIds.length === planning.capacity.weekly.totalSlots;
  const locked = session.state.clock.stepIndex > 0;
  return h('div', { className: 'assemble-day-screen' },
    h('section', { className: 'assemble-day-card assemble-day-plan-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Горизонт планирования'),
      h('h2', null, 'Что защищать в первую очередь'),
      h('p', null, 'Три единицы внимания делятся заранее: две получает главный фокус, одну — поддерживающий. Остальные области остаются без подготовленного резерва.'),
      !weeklyReady && h('div', { className: 'assemble-day-conflict is-critical', role: 'alert' }, h('strong', null, 'Сначала выберите правила недели'), h('span', null, 'Для цельного плана нужны минимум две недельные границы.'), h('button', { type: 'button', className: 'assemble-day-secondary', onClick: onGoWeek }, 'Вернуться к неделе')),
      h('div', { className: 'assemble-day-goal-grid' },
        h(GoalGroup, { label: 'Главный фокус', value: plan.mainGoal, goals: planning.monthlyGoals, disabled: locked, onChange: (id: PlanningDomain) => onGoalChange('mainGoal', id) }),
        h(GoalGroup, { label: 'Поддерживающий фокус', value: plan.supportingGoal, goals: planning.monthlyGoals, disabled: locked, onChange: (id: PlanningDomain) => onGoalChange('supportingGoal', id) }),
      ),
      h('div', { className: 'assemble-day-capacity assemble-day-capacity--attention', role: 'status', 'aria-live': 'polite' },
        h('div', null, h('span', null, 'Внимание распределено'), h('strong', null, `${planning.capacity.attention.allocatedUnits}/${planning.capacity.attention.totalUnits}`)),
        h('p', null, `${planning.capacity.attention.mainUnits} — главный фокус, ${planning.capacity.attention.supportingUnits} — поддерживающий. Смена фокуса меняет, какие решения получают подготовку и какие вступают с ним в конфликт.`),
      ),
      planning.issues.find((item) => item.code === 'goals_equal') && h('p', { className: 'assemble-day-alert', role: 'alert' }, planning.issues.find((item) => item.code === 'goals_equal')?.message),
      h('section', { className: 'assemble-day-horizon', 'aria-label': 'Финансовый горизонт' },
        h('h3', null, 'Финансовый горизонт'),
        h('div', { className: 'assemble-day-money-grid' },
          h(MoneyValue, { label: 'Сейчас', value: planning.financialHorizon.cashRub }),
          h(MoneyValue, { label: 'Ожидается', value: planning.financialHorizon.expectedIncomeRub }),
          h(MoneyValue, { label: 'Платежи', value: -planning.financialHorizon.obligationsRub }),
          h(MoneyValue, { label: 'После платежей', value: planning.financialHorizon.cashAfterNextObligationsRub, warning: planning.financialHorizon.cashAfterNextObligationsRub < 0 }),
        ),
      ),
      h('div', { className: 'assemble-day-risk-opportunity' },
        h('div', null, h('span', null, 'Что может помешать'), h('strong', null, planning.risks[0]?.title || 'Явных рисков нет'), h('small', null, planning.risks[0]?.reason || 'Текущая модель не показывает отдельного риска.')),
        h('div', null, h('span', null, 'Что может помочь'), h('strong', null, planning.opportunities[0]?.title || 'Явных возможностей нет'), h('small', null, planning.opportunities[0]?.reason || 'Текущая модель не показывает отдельной возможности.')),
      ),
      planMessage && h('p', { className: `assemble-day-alert assemble-day-alert--${planTone || 'error'}`, role: 'status' }, planMessage),
      confirmed
        ? h('button', { type: 'button', className: 'assemble-day-primary', onClick: onGoDay }, 'Перейти к дню')
        : h('button', { type: 'button', className: 'assemble-day-primary', disabled: !weeklyReady || !planning.valid, onClick: onConfirm }, 'Подтвердить план'),
    ),
    h('details', { className: 'assemble-day-card assemble-day-details' },
      h('summary', null, 'Все риски, возможности и даты'),
      h('h3', null, 'Риски'),
      h('ul', { className: 'assemble-day-list' }, ...planning.risks.map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.reason)))),
      h('h3', null, 'Возможности'),
      h('ul', { className: 'assemble-day-list' }, ...planning.opportunities.map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.reason)))),
      h('h3', null, 'Важные даты'),
      h('ul', { className: 'assemble-day-list' }, ...planning.importantDates.map((item) => h('li', { key: item.id }, `${DAY_NAMES[item.dayIndex] || `День ${item.dayIndex + 1}`} · ${item.title}`))),
      h('p', null, 'Это модель кампании, а не оценка вашей реальной жизни.'),
    ),
  );
}

function journalGroups(session: CampaignSession) {
  const development = getCharacterDevelopment(session.state);
  return session.diagnostics.decisions.slice().reverse().map((decision) => {
    const sourceFor = (kind: DiagnosticDecision['kind']) => kind === 'planning' ? 'planning_plan' : kind === 'employment' ? 'employment_setup' : null;
    const wantedSource = sourceFor(decision.kind);
    const entries = meaningfulEntries(session.state.causalJournal).filter((entry) => entry.stepIndex === (decision.kind === 'action' ? decision.stepIndex + 1 : decision.stepIndex)
      && (wantedSource ? entry.sourceId === wantedSource : entry.sourceId !== 'planning_plan' && entry.sourceId !== 'employment_setup'));
    const title = decision.kind === 'planning'
      ? 'Контракт недели'
      : decision.kind === 'employment'
        ? 'Формат занятости'
        : `${eventCopy(decision.eventId).title} → ${actionCopy(decision.eventId, decision.actionId).label}`;
    const primary = entries.find((entry) => !/decisionGeometry|activeEventId/.test(entry.resultPath)) || entries[0];
    const carry = entries.find((entry) => /scheduledEffects|commitments|character|family|work|weeklyRules|monthlyPriorities/.test(entry.resultPath));
    const carriedDevelopment = carry && development.find((item) => item.evidencePaths.includes(carry.resultPath));
    const evidence = decision.kind === 'planning' || decision.kind === 'employment'
      ? getRuleEvidence(decision.kind === 'planning' ? 're_planning_capacity_tradeoff' : 're_financial_pressure_choice')
      : getRuleEvidence(registries.actions[decision.actionId]!.ruleEvidenceId);
    return { id:`decision:${decision.revision}`, title, primary, carry, carrySummary:carriedDevelopment?.summary, evidence, entries };
  }).filter((group) => group.entries.length);
}

function LifeScreen({ session, onCopyTrace, traceMessage, traceTone, traceBusy }: { session: CampaignSession; onCopyTrace: () => void; traceMessage: string; traceTone: string; traceBusy: boolean }) {
  const outcome = getCampaignOutcome(session.state);
  const development = getCharacterDevelopment(session.state);
  const observation = getSyntheticObservation(session.state);
  const groups = journalGroups(session);
  const traceComplete = session.diagnostics.history === 'complete';
  return h('div', { className: 'assemble-day-screen' },
    h('section', { className: 'assemble-day-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Жизнь персонажа'),
      h('h2', null, 'Что уже изменилось'),
      h('div', { className: 'assemble-day-life-grid' },
        ...outcome.axes.map((axis) => h('div', { key: axis.id, className:`is-${axis.direction}` }, h('strong', null, axis.title), h('small', null, outcomeDirectionLabel(axis.direction)), h('span', null, axis.summary))),
      ),
    ),
    h('section', { className: 'assemble-day-card assemble-day-observation', 'aria-label': 'Игровое наблюдение' },
      h('span', { className: 'assemble-day-eyebrow' }, observation.label),
      h('h2', null, observation.title),
      h('p', null, observation.summary),
      h('small', null, observation.disclaimer),
    ),
    h('section', { className: 'assemble-day-card assemble-day-development' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Развитие без общего уровня'),
      h('h2', null, development.length ? 'Решения изменили будущие возможности' : 'Изменения появятся после повторённых решений'),
      development.length ? h('ul', { className: 'assemble-day-list' }, ...development.slice(0, 4).map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.summary)))) : h('p', null, 'Игра показывает только реальные изменения персонажа, без очков опыта.'),
      development.length > 4 && h('details', null, h('summary', null, 'Показать все изменения'), h('ul', { className: 'assemble-day-list' }, ...development.slice(4).map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.summary))))),
    ),
    h('details', { className: 'assemble-day-card assemble-day-details assemble-day-journal' },
      h('summary', null, `История решений · ${groups.length}`),
      groups.length ? h('ol', null, ...groups.map((group) => h('li', { key: group.id, className:'assemble-day-journal-group' },
        h('strong', null, group.title),
        group.primary && h('span', null, `${mechanismLabel(group.primary.mechanism)} → ${pathLabel(group.primary.resultPath)}`),
        group.carry && h('small', null, group.carrySummary || `Перенос: ${pathLabel(group.carry.resultPath)}`),
        h('small', null, `${group.evidence.sourceLabel} · ${confidenceLabel(group.evidence.confidence)}.`),
        h('small', null, group.evidence.transferLimit),
      ))) : h('p', null, 'История появится после первого подтверждённого решения.'),
    ),
    h('details', { className: 'assemble-day-card assemble-day-details assemble-day-diagnostic' },
      h('summary', null, 'Диагностика кампании'),
      h('section', { 'aria-label': 'Диагностика кампании' },
        h('h3', null, 'Технический лог кампании'),
        h('p', null, traceComplete
          ? `Записаны все подтверждённые решения: ${session.diagnostics.decisions.length}. Лог содержит состояние, варианты, стадии расчёта и причинный журнал.`
          : 'Это сохранение начато в предыдущей версии. Для полного лога с первого решения начните новую кампанию.'),
        h('button', { type: 'button', className: 'assemble-day-secondary', disabled: traceBusy, onClick: onCopyTrace }, traceBusy ? 'Собираем технический лог…' : 'Скопировать технический лог'),
        traceMessage && h('p', { className: `assemble-day-alert assemble-day-alert--${traceTone || 'error'}`, role: 'status' }, traceMessage),
      ),
    ),
  );
}

function CompletionSummary({ session, summary, onReplaySameSeed, onStartNew }: { session: CampaignSession; summary?: PeriodSummary; onReplaySameSeed: () => void; onStartNew: () => void }) {
  const outcome = getCampaignOutcome(session.state);
  const week = summary?.kind === 'week' ? summary : session.periodSummaries.find((item) => item.kind === 'week');
  const brief = week?.brief || getCampaignBrief(session.state, registries);
  const comparison = session.comparisonBaseline ? compareCampaignOutcomes(session.comparisonBaseline.outcome, outcome) : [];
  return h('section', { className: 'assemble-day-card assemble-day-complete' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Неделя завершена'),
    h('h2', null, week?.title || 'Контрольная точка недели'),
    h('p', null, week?.headline || 'Итог складывается из четырёх независимых линий без общего балла.'),
    h('section', { className: 'assemble-day-complete__brief' }, h('strong', null, brief.mission.title), h('span', null, brief.mission.summary)),
    week?.rules?.length && h('section', { className: 'assemble-day-complete__rules', 'aria-label': 'Что стало с правилами недели' },
      h('h3', null, 'Выбранные границы'),
      ...week.rules.map((rule) => h('article', { key: rule.id, className: `is-${rule.direction}` }, h('strong', null, rule.title), h('small', null, outcomeDirectionLabel(rule.direction)), h('span', null, rule.summary))),
    ),
    week?.commitments && h('p', { className: 'assemble-day-summary__causal' }, week.commitments.summary),
    week?.pressure && h('p', { className: 'assemble-day-summary__carry' }, week.pressure),
    h('h3', null, 'Четыре линии итога'),
    h('div', { className:'assemble-day-outcome-grid' }, ...(week?.axes || outcome.axes).map((axis)=>h('article',{key:axis.id,className:`is-${axis.direction}`},h('strong',null,axis.title),h('small',null,outcomeDirectionLabel(axis.direction)),h('span',null,axis.summary)))),
    h('section', { className: 'assemble-day-complete__threads', 'aria-label': 'Открытые нити' },
      h('h3', null, 'Что осталось открытым'),
      (week?.openThreads || outcome.openThreads).length
        ? h('ul', { className: 'assemble-day-list' }, ...(week?.openThreads || outcome.openThreads).map((item, index) => h('li', { key: `${index}:${item}` }, item)))
        : h('p', null, 'Обязательные нити недели закрыты.'),
    ),
    comparison.length>0 && h('section',{className:'assemble-day-comparison'},h('h3',null,'Сравнение с прошлым прохождением'),...comparison.map((item)=>h('p',{key:item.id},h('strong',null,item.title),` · ${item.changed?'результат изменился':'результат сохранился'} · ${item.summary}`))),
    h('button',{type:'button',className:'assemble-day-primary',onClick:onReplaySameSeed},'Пройти этот сценарий иначе'),
    h('button',{type:'button',className:'assemble-day-secondary',onClick:onStartNew},'Начать с новым сценарием'),
    h('small',null,'Новое прохождение сохранится только после первого подтверждённого решения.'),
  );
}

/**
 * Первый слой выбора формата: цель кампании, три варианта с их уступкой и одно
 * доминирующее действие. Необратимость названа прямо и не спрятана во второй
 * слой, потому что это критическое последствие.
 */
function EmploymentScreen({ selected, onSelect, onConfirm, message, tone }: any) {
  const view = employmentSetupView();
  return h('div', { className: 'assemble-day-screen assemble-day-screen--setup' },
    h('section', { className: 'assemble-day-card assemble-day-goal' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Цель кампании'),
      h('h2', null, view.goal.title),
      h('p', null, view.goal.summary),
    ),
    h('section', { className: 'assemble-day-card assemble-day-formats', 'aria-labelledby': 'assemble-day-format-title' },
      h('h2', { id: 'assemble-day-format-title' }, 'С чего начинается месяц'),
      h('p', null, 'Формат занятости задаёт доход, дорогу и то, насколько работа заходит в вечер. Он выбирается один раз и дальше меняется только историей кампании.'),
      h('div', { className: 'assemble-day-formats__grid', role: 'radiogroup', 'aria-label': 'Формат занятости' },
        ...view.formats.map((format: any) => h('button', {
          key: format.id,
          type: 'button',
          role: 'radio',
          'aria-checked': selected === format.id ? 'true' : 'false',
          className: 'assemble-day-format' + (selected === format.id ? ' is-selected' : ''),
          onClick: () => onSelect(format.id),
        },
          h('strong', null, format.title),
          h('span', { className: 'assemble-day-format__summary' }, format.summary),
          h('span', { className: 'assemble-day-format__tradeoff' }, format.tradeoff),
          h('details', { className: 'assemble-day-format__details' },
            h('summary', null, 'Подробнее'),
            h('p', null, `Доход раз в две недели: ${format.fortnightIncomeRub.toLocaleString('ru-RU')} ₽${format.incomeVarianceRub ? ` ± ${format.incomeVarianceRub.toLocaleString('ru-RU')} ₽` : ''}.`),
            h('p', null, format.commuteMinutesPerDay ? `Дорога: ${format.commuteMinutesPerDay} мин в день.` : 'Дороги нет.'),
            h('p', null, format.eveningIntrusion),
          ),
        )),
      ),
      message && h('p', { className: 'assemble-day-plan-message is-' + (tone || ''), role: 'status' }, message),
      h('button', { type: 'button', className: 'assemble-day-primary', disabled: !selected, onClick: onConfirm }, 'Подтвердить формат'),
      h('small', null, 'Выбор фиксируется вместе с ритмом дохода и целью месяца и не переключается позже.'),
    ),
  );
}

function RestartPanel({ onConfirm, onCancel }: any) {
  return h('section', { className: 'assemble-day-card assemble-day-restart-confirm', role: 'alertdialog', 'aria-label': 'Начать кампанию заново' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Новая кампания'),
    h('h2', null, 'Начать заново?'),
    h('p', null, 'Текущая кампания будет заменена новой с другим сценарием. Прогресс этой недели не сохранится.'),
    h('button', { type: 'button', className: 'assemble-day-primary', onClick: onConfirm }, 'Начать заново'),
    h('button', { type: 'button', className: 'assemble-day-secondary', onClick: onCancel }, 'Вернуться к кампании'),
  );
}

function RecoveryPanel({ result, onNew, onExit }: any) {
  return h('section', { className: 'assemble-day-card assemble-day-recovery', role: 'alert' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Сохранение требует решения'),
    h('h2', null, 'Продолжить эту кампанию нельзя'),
    h('p', null, result.message),
    h('button', { type: 'button', className: 'assemble-day-primary', onClick: onNew }, 'Начать новую кампанию'),
    h('button', { type: 'button', className: 'assemble-day-secondary', onClick: onExit }, 'Вернуться в HEYS'),
  );
}

function AssembleDayGame({ onExit = () => undefined }: { onExit?: () => void }) {
  const React = window.React;
  const clientId = String(window.HEYS?.currentClientId || '');
  const store = window.HEYS?.store;
  const initialLoad = React.useMemo(() => loadCheckpoint(store, clientId), [store, clientId]);
  const [loadIssue, setLoadIssue] = React.useState(initialLoad.status === 'ready' || initialLoad.status === 'empty' ? null : initialLoad);
  const [session, setSession] = React.useState(() => initialLoad.status === 'ready' ? initialLoad.session : createSession());
  const [activeScreen, setActiveScreen] = React.useState('day');
  const [selectedActionId, setSelectedActionId] = React.useState('');
  const [saveMessage, setSaveMessage] = React.useState('');
  const [saveTone, setSaveTone] = React.useState('');
  const [forceNewCampaign, setForceNewCampaign] = React.useState(false);
  const [planningDraft, setPlanningDraft] = React.useState(() => planningDraftFromState(initialLoad.status === 'ready' ? initialLoad.session.state : session.state));
  const [planMessage, setPlanMessage] = React.useState('');
  const [planTone, setPlanTone] = React.useState('');
  const [traceMessage, setTraceMessage] = React.useState('');
  const [traceTone, setTraceTone] = React.useState('');
  const [traceBusy, setTraceBusy] = React.useState(false);
  const [resultRevision, setResultRevision] = React.useState(() => initialLoad.status === 'ready' && initialLoad.session.lastStepSummary
    && (initialLoad.session.diagnostics.decisions.at(-1)?.kind ?? initialLoad.session.anchor.lastDecisionKind) === 'action'
    ? initialLoad.session.revision : null);
  const [periodSummaryIndex, setPeriodSummaryIndex] = React.useState<number | null>(null);
  const [restartOpen, setRestartOpen] = React.useState(false);
  const [employmentDraft, setEmploymentDraft] = React.useState('');
  const [employmentMessage, setEmploymentMessage] = React.useState('');
  const [employmentTone, setEmploymentTone] = React.useState('');

  const startNew = () => {
    const next = createSession();
    setSession(next);
    setPlanningDraft(planningDraftFromState(next.state));
    setLoadIssue(null);
    setForceNewCampaign(true);
    setRestartOpen(false);
    setActiveScreen('day');
    setEmploymentDraft('');
    setEmploymentMessage('');
    setEmploymentTone('');
    setSelectedActionId('');
    setSaveMessage('');
    setSaveTone('');
    setPlanMessage('');
    setPlanTone('');
    setTraceMessage('');
    setTraceTone('');
    setTraceBusy(false);
    setResultRevision(null);
    setPeriodSummaryIndex(null);
  };

  const replaySameSeed = () => {
    const baseline = { outcome: getCampaignOutcome(session.state), finalStateHash: stateHash(session.state) };
    const next = createSession(session.state.rng.seed, baseline);
    setSession(next); setPlanningDraft(planningDraftFromState(next.state)); setForceNewCampaign(true); setSelectedActionId(''); setResultRevision(null); setPeriodSummaryIndex(null); setSaveMessage(''); setSaveTone(''); setPlanMessage(''); setPlanTone(''); setActiveScreen('week');
  };

  const confirm = () => {
    if (!selectedActionId) return;
    try {
      const nextSession = confirmAction(session, selectedActionId);
      const result = saveCheckpoint(store, clientId, nextSession, forceNewCampaign);
      setSession(nextSession);
      setSelectedActionId('');
      setPeriodSummaryIndex(null);
      if (result.status === 'saved') setForceNewCampaign(false);
      setSaveMessage(result.status === 'saved' ? 'Шаг сохранён в профиле HEYS.' : result.message);
      setSaveTone(result.status === 'saved' ? 'success' : 'error');
      setResultRevision(nextSession.revision);
    } catch {
      setSelectedActionId('');
      setSaveMessage('Этот вариант больше недоступен. Выберите решение из обновлённого списка.');
      setSaveTone('error');
    }
  };

  const retrySave = () => {
    const result = saveCheckpoint(store, clientId, session, forceNewCampaign);
    setSaveMessage(result.status === 'saved' ? 'Шаг сохранён в профиле HEYS.' : result.message);
    setSaveTone(result.status === 'saved' ? 'success' : 'error');
    if (result.status === 'saved') setForceNewCampaign(false);
  };

  const confirmPlan = () => {
    try {
      const nextSession = confirmPlanning(session, planningDraft);
      const result = saveCheckpoint(store, clientId, nextSession, forceNewCampaign);
      if (result.status !== 'saved') {
        setPlanMessage(result.message);
        setPlanTone('error');
        return;
      }
      setSession(nextSession);
      setPlanningDraft(planningDraftFromState(nextSession.state));
      setForceNewCampaign(false);
      setPlanMessage('План принят. Его правила и фокусы учитываются в следующих решениях.');
      setPlanTone('success');
    } catch {
      setPlanMessage('План не принят. Проверьте правила недели и приоритеты месяца.');
      setPlanTone('error');
    }
  };

  const copyTrace = async () => {
    if (traceBusy) return;
    setTraceBusy(true);
    setTraceMessage('Собираем полный технический лог…');
    setTraceTone('');
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    try {
      const length = await copyDiagnosticTrace(session);
      setTraceMessage(`Технический лог скопирован · ${Math.max(1, Math.round(length / 1024)).toLocaleString('ru-RU')} КБ.`);
      setTraceTone('success');
    } catch {
      setTraceMessage('Браузер не разрешил копирование. Разрешите доступ к буферу обмена и повторите.');
      setTraceTone('error');
    } finally {
      setTraceBusy(false);
    }
  };

  const confirmEmploymentChoice = () => {
    if (!employmentDraft) return;
    try {
      const nextSession = confirmEmployment(session, employmentDraft as EmploymentFormat);
      const result = saveCheckpoint(store, clientId, nextSession, forceNewCampaign);
      if (result.status === 'saved') setForceNewCampaign(false);
      setSession(nextSession);
      setPlanningDraft(planningDraftFromState(nextSession.state));
      setEmploymentMessage(result.status === 'saved' ? 'Формат принят: ритм дохода и цель месяца зафиксированы.' : result.message);
      setEmploymentTone(result.status === 'saved' ? 'success' : 'error');
      if (result.status === 'saved') setActiveScreen('week');
    } catch (error) {
      setEmploymentMessage('Формат не удалось зафиксировать. Повторите выбор.');
      setEmploymentTone('error');
    }
  };

  if (loadIssue) return h('div', { className: 'assemble-day-app' }, h(RecoveryPanel, { result: loadIssue, onNew: startNew, onExit }));

  const screens: Record<string, any> = {
    day: h(DayScreen, {
      session,
      selectedActionId,
      onSelect: (id: string) => { setSelectedActionId((current: string) => current || id); setSaveMessage(''); setSaveTone(''); },
      onConfirm: confirm,
      saveMessage,
      saveTone,
      resultRevision,
      onContinueResult: () => { setResultRevision(null); setPeriodSummaryIndex(session.periodSummaries.length ? 0 : null); setSaveMessage(''); setSaveTone(''); },
      onRetrySave: retrySave,
      periodSummary: periodSummaryIndex === null ? null : session.periodSummaries[periodSummaryIndex],
      onContinuePeriod: () => setPeriodSummaryIndex((current: number | null) => current !== null && current + 1 < session.periodSummaries.length ? current + 1 : null),
      onOpenPlan: () => setActiveScreen('week'),
      onReplaySameSeed: replaySameSeed,
      onStartNew: startNew,
    }),
    week: h(WeekScreen, {
      session,
      plan: planningDraft,
      onToggleRule: (id: WeeklyRulePresetId) => { setPlanningDraft((current: PlanningPlan) => ({ ...current, weeklyRuleIds: current.weeklyRuleIds.includes(id) ? current.weeklyRuleIds.filter((item) => item !== id) : current.weeklyRuleIds.length < 2 ? [...current.weeklyRuleIds, id] : current.weeklyRuleIds })); setPlanMessage(''); setPlanTone(''); },
      onContinue: () => setActiveScreen('month'),
    }),
    month: h(MonthScreen, {
      session,
      plan: planningDraft,
      onGoalChange: (key: 'mainGoal' | 'supportingGoal', id: PlanningDomain) => { setPlanningDraft((current: PlanningPlan) => ({ ...current, [key]: id })); setPlanMessage(''); setPlanTone(''); },
      onConfirm: confirmPlan,
      onGoWeek: () => setActiveScreen('week'),
      onGoDay: () => setActiveScreen('day'),
      planMessage,
      planTone,
    }),
    life: h(LifeScreen, { session, onCopyTrace: copyTrace, traceMessage, traceTone, traceBusy }),
  };

  // Пока формат не выбран, кампания не начинается: это первый и единственный
  // шаг, поэтому переключатель масштабов не показывается и не конкурирует с ним.
  if (!session.state.employment.format && !restartOpen) {
    return h('div', { className: 'assemble-day-app' },
      h('div', { className: 'assemble-day-shell' },
        h('main', { className: 'assemble-day-content' }, h(EmploymentScreen, {
          selected: employmentDraft,
          onSelect: (format: string) => { setEmploymentDraft(format); setEmploymentMessage(''); setEmploymentTone(''); },
          onConfirm: confirmEmploymentChoice,
          message: employmentMessage,
          tone: employmentTone,
        })),
      ),
    );
  }

  return h('div', { className: 'assemble-day-app' },
    h('div', { className: 'assemble-day-shell' },
      h('div', { className: 'assemble-day-topbar' },
        h('nav', { className: 'assemble-day-tabs', 'aria-label': 'Масштаб кампании' },
          ...[['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['life', 'Жизнь']].map(([id, label]) => h('button', {
            key: id, type: 'button', className: activeScreen === id ? 'is-active' : '', 'aria-current': activeScreen === id ? 'page' : undefined, onClick: () => setActiveScreen(id),
          }, label)),
        ),
        h('button', { type: 'button', className: 'assemble-day-restart', onClick: () => setRestartOpen(true) }, 'Начать заново'),
      ),
      h('main', { className: 'assemble-day-content' }, restartOpen
        ? h(RestartPanel, { onConfirm: startNew, onCancel: () => setRestartOpen(false) })
        : screens[activeScreen]),
    ),
  );
}

const HEYS = window.HEYS = window.HEYS || {};
HEYS.PlanningGames = HEYS.PlanningGames || {};
HEYS.PlanningGames.modules = HEYS.PlanningGames.modules || {};
HEYS.PlanningGames.modules['assemble-day'] = {
  Component: AssembleDayGame,
  api: {
    version: 1,
    storageKey: STORAGE_KEY,
    envelopeVersion: ENVELOPE_VERSION,
    checkpointBudgetBytes: CHECKPOINT_BUDGET_BYTES,
    contract: CONTRACT,
    eventCopy: Object.fromEntries(Object.entries(registries.events).map(([id, event]) => [id, event.copy])),
    createSession,
    getCampaignBrief: (state: GameState) => getCampaignBrief(state, registries),
    getCharacterPresentation,
    getCampaignView,
    confirmAction,
    getPlanningCampaignView,
    confirmPlanning,
    confirmEmployment,
    employmentSetupView,
    getPeriodBoundaries: (before: GameState, after: GameState) => getPeriodBoundaries(before, after, registries),
    getPeriodSummary: (state: GameState, boundary: PeriodBoundary) => getPeriodSummary(state, boundary, registries),
    loadCheckpoint,
    saveCheckpoint,
    checkpointSizeBytes,
    makeEnvelope,
    createDiagnosticTrace,
    serializeDiagnosticTrace,
    copyDiagnosticTrace,
  },
};
