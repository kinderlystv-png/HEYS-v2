import { createInitialState, registries } from '../../../packages/assemble-day-engine/src/content/scenario.ts';
import { compareCampaignOutcomes, getCampaignOutcome, getCharacterDevelopment } from '../../../packages/assemble-day-engine/src/campaign.ts';
import { getPlanningView, reducePlanningStep } from '../../../packages/assemble-day-engine/src/planning.ts';
import { computeDecisionContext, getActionOffers, initialEvent, reduceStep } from '../../../packages/assemble-day-engine/src/reducer.ts';
import { stateHash } from '../../../packages/assemble-day-engine/src/rng.ts';
import { validateState } from '../../../packages/assemble-day-engine/src/schema.ts';
import { CONTRACT, type ActionOffer, type CampaignOutcome, type CausalEntry, type GameState, type PlanningDomain, type PlanningPlan, type StepOutput, type WeeklyRulePresetId } from '../../../packages/assemble-day-engine/src/types.ts';

declare global {
  interface Window {
    HEYS?: any;
    React?: any;
  }
}

const STORAGE_KEY = 'heys_planning_assemble_day_campaign_v1';
const ENVELOPE_VERSION = 1;

type DaySummary = {
  dayIndex: number;
  eventTitle: string;
  actionLabel: string;
  mainChange: string;
  causalLink: string;
  carryover: string;
};

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
};
type DiagnosticLedger = {
  version: 1;
  history: 'complete' | 'legacy_partial';
  decisions: DiagnosticDecision[];
};

type CampaignSession = {
  state: GameState;
  lastSummary: DaySummary | null;
  revision: number;
  diagnostics: DiagnosticLedger;
  comparisonBaseline?: { outcome: CampaignOutcome; finalStateHash: string; decisions: Array<{ eventId: string; actionId: string }> };
};

type CampaignEnvelope = {
  envelopeVersion: 1;
  clientId: string;
  campaignId: string;
  savedAt: string;
  revision: number;
  stateHash: string;
  contract: typeof CONTRACT;
  state: GameState;
  lastSummary: DaySummary | null;
  diagnostics?: DiagnosticLedger;
  comparisonBaseline?: CampaignSession['comparisonBaseline'];
};

type LoadResult =
  | { status: 'empty' }
  | { status: 'ready'; session: CampaignSession }
  | { status: 'unavailable' | 'foreign' | 'incompatible' | 'corrupt'; message: string };

type SaveResult =
  | { status: 'saved'; envelope: CampaignEnvelope }
  | { status: 'unavailable' | 'conflict' | 'failed'; message: string };

const DAY_NAMES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const WEEKLY_RULE_IDS = new Set<WeeklyRulePresetId>(['protect_sleep', 'family_anchor', 'work_blocks']);
const STORAGE_CONTRACT_KEYS = [
  'schemaVersion', 'scenarioId', 'scenarioVersion', 'calibrationVersion',
  'technicalContractVersion', 'priceBookVersion', 'rngAlgorithm', 'hashAlgorithm',
] as const;

const EVENT_COPY: Record<string, { title: string; situation: string }> = {
  mon_breakfast: { title: 'Начало недели', situation: 'Утро уже началось, а завтрак и первый рабочий блок конкурируют за время.' },
  mon_commute: { title: 'Дорога к первому делу', situation: 'До начала работы нужно выбрать между временем в пути и расходами.' },
  mon_scope_expansion: { title: 'Проект стал больше', situation: 'В задачу добавили новые требования, но срок остался прежним.' },
  mon_lunch_window: { title: 'Окно на обед', situation: 'Работа идёт плотнее плана, а пауза быстро сокращается.' },
  mon_project_block: { title: 'Основной рабочий блок', situation: 'Можно ускориться, вложиться в качество или разделить нагрузку.' },
  mon_family_dinner: { title: 'Вечерняя договорённость', situation: 'Семейный ужин начинается в то же время, когда работа требует продолжения.' },
  tue_night_wakeup: { title: 'Ночная нагрузка', situation: 'Ночью ребёнку понадобилась помощь, и утро началось раньше обычного.' },
  tue_recovery_breakfast: { title: 'Утро после короткого сна', situation: 'Нужно восстановить силы и не потерять темп перед рабочим днём.' },
  tue_review_prep: { title: 'Подготовка к просмотру', situation: 'До проверки проекта осталось немного времени, а часть работы не закрыта.' },
  tue_review_result: { title: 'Результат проверки', situation: 'Проверка выявила вопросы, которые нужно разобрать без потери всего дня.' },
  tue_pickup_conflict: { title: 'Кто заберёт ребёнка', situation: 'Семейная задача совпала с рабочим обязательством.' },
  tue_evening_pressure: { title: 'Насыщенный вечер', situation: 'После плотного дня остаются быт, восстановление и незакрытая работа.' },
  wed_commute_delay: { title: 'Задержка в дороге', situation: 'Внешняя задержка сдвинула начало дня и усилила давление на расписание.' },
  wed_long_meeting: { title: 'Встреча затянулась', situation: 'Длинная встреча заняла время, запланированное на работу и паузу.' },
  wed_late_lunch: { title: 'Поздний обед', situation: 'Перерыв снова сдвинулся, а до следующей задачи осталось мало времени.' },
  wed_school_call: { title: 'Звонок из школы', situation: 'Нужно быстро решить семейный вопрос в середине рабочего дня.' },
  wed_work_recovery: { title: 'Вернуться в рабочий ритм', situation: 'После неожиданного перерыва нужно заново собрать оставшуюся часть дня.' },
  wed_evening_stabilize: { title: 'Стабилизировать вечер', situation: 'День был напряжённым; следующий выбор повлияет на сон и завтрашний запас сил.' },
  thu_hybrid_start: { title: 'Гибкое начало дня', situation: 'Свободное окно можно направить на работу, движение или бытовой запас.' },
  thu_colleague_help_debt: { title: 'Ответить на помощь', situation: 'Коллега помог раньше, и теперь нужно решить, когда вернуть поддержку.' },
  thu_extra_project: { title: 'Дополнительный проект', situation: 'Появилась новая возможность, но она увеличит нагрузку текущей недели.' },
  thu_movement_plan: { title: 'Запланированное движение', situation: 'В календаре есть тренировка, а рабочие задачи ещё не завершены.' },
  thu_family_evening: { title: 'Семейный вечер', situation: 'Время с близкими снова пересекается с рабочим давлением.' },
  fri_deadline_plan: { title: 'План на день сдачи', situation: 'До отправки проекта нужно распределить внимание между скоростью и устойчивостью.' },
  fri_final_issue: { title: 'Последняя проблема', situation: 'Перед сдачей обнаружена ошибка, которую нельзя просто игнорировать.' },
  fri_lunch: { title: 'Пауза перед финишем', situation: 'До отправки осталось несколько часов, и решение о паузе повлияет на концентрацию.' },
  fri_submit: { title: 'Отправка проекта', situation: 'Наступил момент сдачи: важно выбрать реалистичный способ завершить работу.' },
  fri_after_submit: { title: 'После отправки', situation: 'Главная задача закрыта, и освободившееся время можно распределить по-разному.' },
  fri_family_plan: { title: 'Планы на вечер', situation: 'После рабочей недели нужно подтвердить или пересобрать семейную договорённость.' },
  sat_school_event: { title: 'Школьное событие', situation: 'Важное семейное событие требует времени и точного решения по дороге.' },
  sat_household_stock: { title: 'Домашние запасы', situation: 'Продукты заканчиваются, и выбор сейчас повлияет на следующие дни.' },
  sat_meal_prep: { title: 'Запас еды', situation: 'Есть окно, чтобы подготовить еду заранее, перекусить или восстановиться.' },
  sat_social_invite: { title: 'Встреча с друзьями', situation: 'Появилось приглашение, которое нужно совместить с уже данными обещаниями.' },
  sat_evening_close: { title: 'Завершение субботы', situation: 'Вечер можно использовать для восстановления, движения или работы.' },
  sun_recovery_start: { title: 'Спокойное начало дня', situation: 'Последний день недели начинается с выбора темпа и способа восстановиться.' },
  sun_family_time: { title: 'Время с семьёй', situation: 'Совместное время нужно распределить так, чтобы нагрузка не легла на одного.' },
  sun_week_preparation: { title: 'Подготовка новой недели', situation: 'Можно заранее уменьшить бытовую или рабочую нагрузку следующих дней.' },
  sun_early_finish: { title: 'Закрыть неделю', situation: 'Последнее решение определит, с каким запасом сил начнётся понедельник.' },
};

const EVENT_ACTION_COPY: Record<string, Record<string, { label: string; summary: string }>> = {
  mon_breakfast: {
    eat_ready_meal: {
      label: 'Съесть заранее приготовленный завтрак',
      summary: 'Разогреть готовую порцию: утром готовить не нужно.',
    },
    cook_meal_batch: {
      label: 'Приготовить завтрак',
      summary: 'Приготовить еду сейчас и оставить две готовые порции на следующие приёмы.',
    },
  },
};

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
  return EVENT_COPY[eventId] || (authored ? { title: authored.title, situation: authored.situation } : { title: 'Развилка дня', situation: 'Появилось решение, которое повлияет на оставшуюся часть дня.' });
}

function formatTime(minutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function qualitative(value: number, inverse = false) {
  const level = value >= 67 ? 'высокое' : value >= 38 ? 'умеренное' : 'низкое';
  if (!inverse) return level;
  return level === 'высокое' ? 'низкое' : level === 'низкое' ? 'высокое' : 'умеренное';
}

function riskLabel(risk: ActionOffer['risk']) {
  return ({ none: 'без заметного риска', low: 'низкий риск', moderate: 'умеренный риск', high: 'высокий риск', very_high: 'очень высокий риск' } as const)[risk];
}

function effortLabel(effort: ActionOffer['effortLevel']) {
  return ({ none: 'без усилия', light: 'лёгкое усилие', normal: 'умеренное усилие', high: 'высокое усилие' } as const)[effort];
}

function actionLabel(actionId: string) {
  return registries.actions[actionId]?.copy.label || actionId;
}

function actionCopy(eventId: string, actionId: string) {
  const action = registries.actions[actionId];
  return EVENT_ACTION_COPY[eventId]?.[actionId] || {
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
    consequenceSummary: consequenceSummary(offer.actionId),
  };
}

function effectReason(effect: any) {
  if (typeof effect?.reason === 'string') return effect.reason;
  if (effect?.op === 'append_causal_link' && typeof effect.mechanism === 'string') return effect.mechanism;
  return '';
}

function consequenceSummary(actionId: string) {
  const action = registries.actions[actionId];
  if (!action) return '';
  const immediate = [...new Set(action.immediateEffects.map(effectReason).filter(Boolean))].slice(0, 2);
  const delayed = [...new Set(action.scheduledEffects.flatMap((item) => item.effects.map(effectReason)).filter(Boolean))].slice(0, 1);
  const parts = [
    immediate.length ? `Сразу: ${immediate.join('; ')}` : '',
    delayed.length ? `Позже: ${delayed.join('; ')}` : '',
  ].filter(Boolean);
  return parts.join('. ');
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

function summarizeStep(before: GameState, output: StepOutput): DaySummary {
  const entries = meaningfulEntries(output.journalEntries);
  const actionEntries = entries.filter((entry) => entry.sourceId === output.appliedAction.actionId);
  const immediateMechanisms = new Set(
    registries.actions[output.appliedAction.actionId]?.immediateEffects.map(effectReason).filter(Boolean) || [],
  );
  const immediateEntries = actionEntries.filter((entry) => immediateMechanisms.has(entry.mechanism));
  const primary = immediateEntries.find((entry) => !/^accumulators\./.test(entry.resultPath))
    || immediateEntries[0]
    || actionEntries.find((entry) => !/^(цена усилия|расход |денежная цена действия)/.test(entry.mechanism))
    || actionEntries[0]
    || entries[0]
    || output.journalEntries[0];
  const carried = entries.find((entry) => /commitments|weeklyRules|monthlyPriorities|scheduledEffects|work\.tasks|economy\.obligations|accumulators/.test(entry.resultPath));
  const eventId = before.activeEventId || registries.slots[before.scenarioCursor]?.eventId || '';
  const copy = eventCopy(eventId);
  const chosenCopy = actionCopy(eventId, output.appliedAction.actionId);
  return {
    dayIndex: before.clock.dayIndex,
    eventTitle: copy.title,
    actionLabel: output.appliedAction ? chosenCopy.label : 'Решение принято',
    mainChange: primary ? `Главное изменение: ${pathLabel(primary.resultPath)}.` : 'Решение принято без немедленной заметной перемены.',
    causalLink: primary ? `${copy.title} → ${chosenCopy.label} → ${mechanismLabel(primary.mechanism)} → ${pathLabel(primary.resultPath)}.` : `${copy.title} → решение учтено в следующем шаге.`,
    carryover: carried ? `Дальше повлияет: ${pathLabel(carried.resultPath)}.` : 'Дальше повлияют оставшиеся время и ресурсы.',
  };
}

function createSession(seed = `campaign-${Date.now()}`, comparisonBaseline?: CampaignSession['comparisonBaseline']): CampaignSession {
  const state = createInitialState(seed);
  validateState(state);
  return { state, lastSummary: null, revision: 0, diagnostics: { version: 1, history: 'complete', decisions: [] }, ...(comparisonBaseline ? { comparisonBaseline } : {}) };
}

function diagnosticStateSnapshot(state: GameState): Omit<GameState, 'causalJournal'> {
  const snapshot = structuredClone(state) as GameState;
  delete (snapshot as Partial<GameState>).causalJournal;
  return snapshot as Omit<GameState, 'causalJournal'>;
}

function diagnosticsFrom(value: unknown, revision: number): DiagnosticLedger {
  if (value === undefined) return { version: 1, history: revision === 0 ? 'complete' : 'legacy_partial', decisions: [] };
  const ledger = value as DiagnosticLedger;
  if (!ledger || typeof ledger !== 'object' || ledger.version !== 1 || !['complete', 'legacy_partial'].includes(ledger.history)
    || !Array.isArray(ledger.decisions) || ledger.decisions.some((decision) => !decision || typeof decision !== 'object'
      || !['action', 'planning'].includes((decision as any).kind)
      || !Number.isInteger((decision as any).revision)
      || !Number.isInteger((decision as any).stepIndex)
      || ((decision as any).kind === 'action' && (typeof (decision as any).eventId !== 'string' || typeof (decision as any).actionId !== 'string'))
      || ((decision as any).kind === 'planning' && !(decision as any).plan))) {
    throw new Error('invalid diagnostic ledger');
  }
  const decisions = structuredClone(ledger.decisions);
  if (decisions.some((decision, index) => index > 0 && decision.revision <= decisions[index - 1]!.revision)) throw new Error('diagnostic revision order');
  if (decisions.length ? decisions.at(-1)!.revision !== revision : ledger.history === 'complete' && revision !== 0) throw new Error('diagnostic revision mismatch');
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
  return { ...session, state: output.state, lastSummary: summarizeStep(session.state, output), revision, diagnostics: { ...session.diagnostics, decisions: [...session.diagnostics.decisions, decision] } };
}

function confirmPlanning(session: CampaignSession, plan: PlanningPlan): CampaignSession {
  const output = reducePlanningStep({ state: session.state, plan });
  const revision = session.revision + 1;
  const decision: DiagnosticDecision = { kind: 'planning', revision, stepIndex: session.state.clock.stepIndex, plan: structuredClone(plan) };
  return { ...session, state: output.state, lastSummary: session.lastSummary, revision, diagnostics: { ...session.diagnostics, decisions: [...session.diagnostics.decisions, decision] } };
}

function makeEnvelope(session: CampaignSession, clientId: string): CampaignEnvelope {
  return {
    envelopeVersion: ENVELOPE_VERSION,
    clientId,
    campaignId: session.state.campaignId,
    savedAt: new Date().toISOString(),
    revision: session.revision,
    stateHash: stateHash(session.state),
    contract: { ...CONTRACT },
    state: session.state,
    lastSummary: session.lastSummary,
    diagnostics: session.diagnostics,
    comparisonBaseline: session.comparisonBaseline,
  };
}

function loadCheckpoint(store: any, clientId: string, fresh = false): LoadResult {
  if (!store?.get || !clientId) return { status: 'unavailable', message: 'Профиль HEYS недоступен. Вернитесь в HEYS и откройте игру снова.' };
  let value: unknown;
  try {
    value = fresh && typeof store.getPersisted === 'function'
      ? store.getPersisted(STORAGE_KEY, null)
      : store.get(STORAGE_KEY, null);
  } catch {
    return { status: 'corrupt', message: 'Сохранение не удалось прочитать. Оно оставлено без изменений.' };
  }
  if (value == null) return { status: 'empty' };
  if (!value || typeof value !== 'object') return { status: 'corrupt', message: 'Формат сохранения повреждён. Оно оставлено без изменений.' };
  const envelope = value as CampaignEnvelope;
  if (envelope.envelopeVersion !== ENVELOPE_VERSION || !contractMatches(envelope.contract)) {
    return { status: 'incompatible', message: 'Сохранение создано другой версией игры. Начните новую кампанию явно или вернитесь в HEYS.' };
  }
  if (envelope.clientId !== clientId) return { status: 'foreign', message: 'Сохранение принадлежит другому профилю HEYS и не будет открыто.' };
  try {
    validateState(envelope.state);
    if (stateHash(envelope.state) !== envelope.stateHash || !Number.isInteger(envelope.revision) || envelope.revision < envelope.state.clock.stepIndex || envelope.campaignId !== envelope.state.campaignId) {
      throw new Error('checkpoint mismatch');
    }
    const diagnostics = diagnosticsFrom(envelope.diagnostics, envelope.revision);
    return { status: 'ready', session: { state: envelope.state, lastSummary: envelope.lastSummary || null, revision: envelope.revision, diagnostics, ...(envelope.comparisonBaseline ? { comparisonBaseline: envelope.comparisonBaseline } : {}) } };
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
  let replayState = createInitialState(session.state.rng.seed);
  let replayStatus: 'match' | 'mismatch' | 'partial' = session.diagnostics.history === 'complete' ? 'match' : 'partial';
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
      'persisted causal echo event, character development and multidimensional campaign outcome',
    ],
    catalog: structuredClone(registries),
    currentState: structuredClone(session.state),
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
  if (!store?.get || !store?.set || !clientId) return { status: 'unavailable', message: 'Не удалось связать прогресс с текущим профилем HEYS.' };
  const current = loadCheckpoint(store, clientId, true);
  if (!forceNewCampaign && current.status === 'ready') {
    if (current.session.state.campaignId !== session.state.campaignId) return { status: 'conflict', message: 'В профиле уже есть другая кампания. Прогресс не перезаписан.' };
    if (current.session.revision > session.revision) return { status: 'conflict', message: 'Найдено более новое сохранение. Текущий шаг не перезаписал его.' };
    if (current.session.revision === session.revision && stateHash(current.session.state) !== stateHash(session.state)) return { status: 'conflict', message: 'Сохранение уже содержит другое решение этого шага. Оно не перезаписано.' };
  } else if (!forceNewCampaign && current.status !== 'empty' && current.status !== 'ready') {
    return { status: 'conflict', message: current.message };
  }
  const envelope = makeEnvelope(session, clientId);
  try {
    const written = store.set(STORAGE_KEY, envelope);
    if (written === false) return { status: 'failed', message: 'Шаг принят, но сохранить его не удалось. Не закрывайте игру и повторите действие.' };
    return { status: 'saved', envelope };
  } catch {
    return { status: 'failed', message: 'Шаг принят, но сохранить его не удалось. Не закрывайте игру и повторите действие.' };
  }
}

function Silhouette() {
  return h('span', { className: 'assemble-day-character__silhouette', 'aria-hidden': 'true' },
    h('span', { className: 'assemble-day-character__head' }),
    h('span', { className: 'assemble-day-character__body' }),
  );
}

const h = (...args: any[]) => window.React.createElement(...args);

function StatusPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return h('div', { className: `assemble-day-status assemble-day-status--${tone}` },
    h('span', null, label), h('strong', null, value),
  );
}

function CharacterCard({ state }: { state: GameState }) {
  return h('section', { className: 'assemble-day-card assemble-day-character', 'aria-label': 'Персонаж и текущее состояние' },
    h(Silhouette),
    h('div', { className: 'assemble-day-character__copy' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Фиксированный персонаж'),
      h('h2', null, 'Координатор проектов'),
      h('p', null, 'Партнёр и ребёнок 8 лет · неделя до сдачи проекта'),
    ),
    h('div', { className: 'assemble-day-statuses' },
      h(StatusPill, { label: 'Энергия', value: qualitative(state.vitals.energy), tone: state.vitals.energy < 38 ? 'warning' : 'calm' }),
      h(StatusPill, { label: 'Настроение', value: qualitative(state.vitals.mood), tone: 'neutral' }),
      h(StatusPill, { label: 'Напряжение', value: qualitative(state.vitals.tension), tone: state.vitals.tension >= 67 ? 'warning' : 'neutral' }),
    ),
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
  const blocked = saveTone === 'error';
  return h('section', { className: 'assemble-day-card assemble-day-result', 'aria-labelledby': 'assemble-day-result-title' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Результат решения'),
    h('h2', { id: 'assemble-day-result-title', tabIndex: -1 }, summary.actionLabel),
    h('p', null, summary.mainChange),
    h('p', { className: 'assemble-day-summary__causal' }, summary.causalLink),
    h('p', { className: 'assemble-day-summary__carry' }, summary.carryover),
    saveMessage && h('p', { className: `assemble-day-alert assemble-day-alert--${saveTone || 'error'}`, role: blocked ? 'alert' : 'status' }, saveMessage),
    blocked
      ? h('button', { type: 'button', className: 'assemble-day-primary', onClick: onRetry }, 'Повторить сохранение')
      : h('button', { type: 'button', className: 'assemble-day-primary', onClick: onContinue }, 'Продолжить'),
  );
}

function DayScreen({ session, selectedActionId, onSelect, onConfirm, saveMessage, saveTone, resultRevision, onContinueResult, onRetrySave, onOpenPlan, onReplaySameSeed, onStartNew }: any) {
  const view = getCampaignView(session);
  if (resultRevision === session.revision && session.lastSummary) return h('div', { className: 'assemble-day-screen assemble-day-screen--day' }, h(CharacterCard, { state: session.state }), h(ResultBeat, { summary: session.lastSummary, saveMessage, saveTone, onContinue: onContinueResult, onRetry: onRetrySave }));
  if (view.complete) return h(CompletionSummary, { session, onReplaySameSeed, onStartNew });
  const planConfirmed = session.state.causalJournal.some((entry) => entry.sourceId === 'planning_plan');
  if (!planConfirmed) return h('div', { className: 'assemble-day-screen assemble-day-screen--day' }, h(CharacterCard, { state: session.state }), h('section', { className: 'assemble-day-card assemble-day-contract-start' }, h('span', { className: 'assemble-day-eyebrow' }, 'Контракт недели'), h('h2', null, 'Сначала выберите, что будете защищать'), h('p', null, 'Два или три правила и приоритеты изменят время, усилие и давление в следующих развилках.'), h('button', { type: 'button', className: 'assemble-day-primary', onClick: onOpenPlan }, 'Выбрать правила недели')));
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
        : 'Первое нажатие фиксирует вариант. Сначала сравните время, деньги и риск — изменить решение после нажатия нельзя.'),
      h('div', { className: 'assemble-day-options', role: 'radiogroup', 'aria-label': 'Варианты решения' },
        ...view.offers.map((offer: any) => {
          const selected = selectedActionId === offer.actionId;
          const lockedByAnother = choiceLocked && !selected;
          return h('button', {
            key: offer.actionId,
            type: 'button',
            role: 'radio',
            'aria-checked': selected,
            disabled: !offer.available || lockedByAnother,
            className: `assemble-day-option${selected ? ' is-selected' : ''}${lockedByAnother ? ' is-locked' : ''}`,
            onClick: () => onSelect(offer.actionId),
            'data-action-id': offer.actionId,
          },
          h('span', { className: 'assemble-day-option__title' }, offer.label),
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
          selected && offer.planningSignals?.length > 0
            && h('span', { className: 'assemble-day-option__signals' }, ...offer.planningSignals.map((signal: any) => h('span', { key: `${signal.kind}:${signal.sourceId}`, className: signal.kind === 'conflicts_weekly_rule' ? 'is-conflict' : 'is-support' }, signal.reason))),
          lockedByAnother && h('span', { className: 'assemble-day-option__locked' }, 'Закрыто после первого выбора'),
          !offer.available && h('span', { className: 'assemble-day-option__unavailable' }, offer.unavailableReasons[0] || 'Сейчас недоступно'),
          );
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

function DaySummaryCard({ summary }: { summary: DaySummary }) {
  return h('section', { className: 'assemble-day-card assemble-day-summary' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Краткий итог последнего шага'),
    h('h2', null, summary.actionLabel),
    h('p', null, summary.mainChange),
    h('p', { className: 'assemble-day-summary__causal' }, summary.causalLink),
    h('p', { className: 'assemble-day-summary__carry' }, summary.carryover),
  );
}

function WeekScreen({ session, plan, onToggleRule, onContinue }: { session: CampaignSession; plan: PlanningPlan; onToggleRule: (id: WeeklyRulePresetId) => void; onContinue: () => void }) {
  const planning = getPlanningCampaignView(session, plan);
  const locked = session.state.clock.stepIndex > 0;
  const currentDay = session.state.clock.dayIndex;
  const dayProgress = DAY_NAMES.map((name, index) => ({ name, status: index < currentDay ? 'Готово' : index === currentDay ? 'Сейчас' : 'Впереди' }));
  const commitments = session.state.commitments.filter((item) => item.status === 'open').slice(0, 3);
  return h('div', { className: 'assemble-day-screen' },
    h('section', { className: 'assemble-day-card assemble-day-plan-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'План недели'),
      h('h2', null, 'Какие границы сохранить'),
      h('p', null, locked ? 'Контракт уже влияет на развилки этой недели. Изменить его задним числом нельзя.' : 'Выберите минимум два правила. Цена пересечений показана до подтверждения плана.'),
      h('div', { className: 'assemble-day-rule-grid', role: 'group', 'aria-label': 'Правила недели' },
        ...planning.weeklyRules.map((rule) => h('button', {
          key: rule.id, type: 'button', role: 'checkbox', 'aria-checked': rule.selected, disabled: locked,
          className: `assemble-day-rule${rule.selected ? ' is-selected' : ''}`,
          onClick: () => onToggleRule(rule.id),
        }, h('strong', null, rule.title), h('span', null, rule.summary))),
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
      h('button', { type: 'button', className: 'assemble-day-primary', disabled: plan.weeklyRuleIds.length < 2, onClick: onContinue }, 'Продолжить к приоритетам'),
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
  return h('fieldset', { className: 'assemble-day-goals' },
    h('legend', null, label),
    ...goals.map((goal) => h('button', { key: goal.id, type: 'button', role: 'radio', 'aria-checked': value === goal.id, disabled, className: value === goal.id ? 'is-selected' : '', onClick: () => onChange(goal.id) }, goal.title)),
  );
}

function MoneyValue({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return h('div', { className: `assemble-day-money${warning ? ' is-warning' : ''}` }, h('span', null, label), h('strong', null, `${value.toLocaleString('ru-RU')} ₽`));
}

function MonthScreen({ session, plan, onGoalChange, onConfirm, onGoWeek, onGoDay, planMessage, planTone }: any) {
  const planning = getPlanningCampaignView(session, plan);
  const confirmed = planningMatchesState(session.state, plan);
  const weeklyReady = plan.weeklyRuleIds.length >= 2;
  const locked = session.state.clock.stepIndex > 0;
  return h('div', { className: 'assemble-day-screen' },
    h('section', { className: 'assemble-day-card assemble-day-plan-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'План месяца'),
      h('h2', null, 'Что защищать в первую очередь'),
      h('p', null, 'Главный фокус получает приоритет, поддерживающий помогает не потерять вторую важную область.'),
      !weeklyReady && h('div', { className: 'assemble-day-conflict is-critical', role: 'alert' }, h('strong', null, 'Сначала выберите правила недели'), h('span', null, 'Для цельного плана нужны минимум две недельные границы.'), h('button', { type: 'button', className: 'assemble-day-secondary', onClick: onGoWeek }, 'Вернуться к неделе')),
      h('div', { className: 'assemble-day-goal-grid' },
        h(GoalGroup, { label: 'Главный фокус', value: plan.mainGoal, goals: planning.monthlyGoals, disabled: locked, onChange: (id: PlanningDomain) => onGoalChange('mainGoal', id) }),
        h(GoalGroup, { label: 'Поддерживающий фокус', value: plan.supportingGoal, goals: planning.monthlyGoals, disabled: locked, onChange: (id: PlanningDomain) => onGoalChange('supportingGoal', id) }),
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
  return session.diagnostics.decisions.slice().reverse().map((decision) => {
    const entries = meaningfulEntries(session.state.causalJournal).filter((entry) => entry.stepIndex === (decision.kind === 'action' ? decision.stepIndex + 1 : decision.stepIndex) && (decision.kind === 'planning' ? entry.sourceId === 'planning_plan' : entry.sourceId !== 'planning_plan'));
    const title = decision.kind === 'planning' ? 'Контракт недели' : `${eventCopy(decision.eventId).title} → ${actionCopy(decision.eventId, decision.actionId).label}`;
    const primary = entries.find((entry) => !/decisionGeometry|activeEventId/.test(entry.resultPath)) || entries[0];
    const carry = entries.find((entry) => /scheduledEffects|commitments|character|family|work|weeklyRules|monthlyPriorities/.test(entry.resultPath));
    return { id:`decision:${decision.revision}`, title, primary, carry, entries };
  }).filter((group) => group.entries.length);
}

function LifeScreen({ session, onCopyTrace, traceMessage, traceTone, traceBusy }: { session: CampaignSession; onCopyTrace: () => void; traceMessage: string; traceTone: string; traceBusy: boolean }) {
  const outcome = getCampaignOutcome(session.state);
  const development = getCharacterDevelopment(session.state);
  const groups = journalGroups(session);
  const traceComplete = session.diagnostics.history === 'complete';
  return h('div', { className: 'assemble-day-screen' },
    h('section', { className: 'assemble-day-card' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Жизнь персонажа'),
      h('h2', null, 'Что уже изменилось'),
      h('div', { className: 'assemble-day-life-grid' },
        ...outcome.axes.map((axis) => h('div', { key: axis.id, className:`is-${axis.direction}` }, h('strong', null, axis.title), h('span', null, axis.summary))),
      ),
    ),
    h('section', { className: 'assemble-day-card assemble-day-development' },
      h('span', { className: 'assemble-day-eyebrow' }, 'Развитие без общего уровня'),
      h('h2', null, development.length ? 'Решения оставили навыки и привычки' : 'Изменения появятся после повторённых решений'),
      development.length ? h('ul', { className: 'assemble-day-list' }, ...development.slice(0, 4).map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.summary)))) : h('p', null, 'Игра показывает только реальные изменения персонажа, без очков опыта.'),
      development.length > 4 && h('details', null, h('summary', null, 'Показать все изменения'), h('ul', { className: 'assemble-day-list' }, ...development.slice(4).map((item) => h('li', { key: item.id }, h('strong', null, item.title), h('span', null, item.summary))))),
    ),
    h('details', { className: 'assemble-day-card assemble-day-details assemble-day-journal' },
      h('summary', null, `История решений · ${groups.length}`),
      groups.length ? h('ol', null, ...groups.map((group) => h('li', { key: group.id, className:'assemble-day-journal-group' },
        h('strong', null, group.title),
        group.primary && h('span', null, `${mechanismLabel(group.primary.mechanism)} → ${pathLabel(group.primary.resultPath)}`),
        group.carry && h('small', null, `Перенос: ${pathLabel(group.carry.resultPath)}`),
        h('details', null,
          h('summary', null, 'Точные изменения'),
          h('ul', null, ...group.entries.map((entry) => h('li', { key:entry.id }, `${entry.resultPath}: ${String(entry.before ?? '—')} → ${String(entry.after ?? '—')}`))),
        ),
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

function CompletionSummary({ session, onReplaySameSeed, onStartNew }: { session: CampaignSession; onReplaySameSeed: () => void; onStartNew: () => void }) {
  const outcome = getCampaignOutcome(session.state);
  const comparison = session.comparisonBaseline ? compareCampaignOutcomes(session.comparisonBaseline.outcome, outcome) : [];
  return h('section', { className: 'assemble-day-card assemble-day-complete' },
    h('span', { className: 'assemble-day-eyebrow' }, 'Неделя завершена'),
    h('h2', null, 'Итог складывается из четырёх линий'),
    h('p', null, 'Здесь нет общего балла: видно, что удалось сохранить, чем пришлось поступиться и что осталось открытым.'),
    h('div', { className:'assemble-day-outcome-grid' }, ...outcome.axes.map((axis)=>h('article',{key:axis.id,className:`is-${axis.direction}`},h('strong',null,axis.title),h('span',null,axis.summary)))),
    comparison.length>0 && h('section',{className:'assemble-day-comparison'},h('h3',null,'Сравнение с прошлым прохождением'),...comparison.map((item)=>h('p',{key:item.id},h('strong',null,item.title),` · ${item.changed?'результат изменился':'результат сохранился'} · ${item.summary}`))),
    h('button',{type:'button',className:'assemble-day-primary',onClick:onReplaySameSeed},'Пройти этот сценарий иначе'),
    h('button',{type:'button',className:'assemble-day-secondary',onClick:onStartNew},'Начать с новым сценарием'),
    h('small',null,'Новое прохождение сохранится только после первого подтверждённого решения.'),
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
  const [session, setSession] = React.useState(() => initialLoad.status === 'ready' ? initialLoad.session : createSession(`assemble-day:${clientId || 'unknown'}:${new Date().toISOString().slice(0, 10)}`));
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
  const [resultRevision, setResultRevision] = React.useState(() => initialLoad.status === 'ready' && initialLoad.session.lastSummary && initialLoad.session.diagnostics.decisions.at(-1)?.kind === 'action' ? initialLoad.session.revision : null);

  const startNew = () => {
    const next = createSession(`assemble-day:${clientId || 'unknown'}:${Date.now()}`);
    setSession(next);
    setPlanningDraft(planningDraftFromState(next.state));
    setLoadIssue(null);
    setForceNewCampaign(true);
    setSelectedActionId('');
    setSaveMessage('');
    setSaveTone('');
    setPlanMessage('');
    setPlanTone('');
    setTraceMessage('');
    setTraceTone('');
    setTraceBusy(false);
    setResultRevision(null);
  };

  const replaySameSeed = () => {
    const baseline = { outcome: getCampaignOutcome(session.state), finalStateHash: stateHash(session.state), decisions: session.diagnostics.decisions.filter((item): item is Extract<DiagnosticDecision, { kind: 'action' }> => item.kind === 'action').map((item) => ({ eventId: item.eventId, actionId: item.actionId })) };
    const next = createSession(session.state.rng.seed, baseline);
    setSession(next); setPlanningDraft(planningDraftFromState(next.state)); setForceNewCampaign(true); setSelectedActionId(''); setResultRevision(null); setSaveMessage(''); setSaveTone(''); setPlanMessage(''); setPlanTone(''); setActiveScreen('week');
  };

  const confirm = () => {
    if (!selectedActionId) return;
    try {
      const nextSession = confirmAction(session, selectedActionId);
      const result = saveCheckpoint(store, clientId, nextSession, forceNewCampaign);
      setSession(nextSession);
      setSelectedActionId('');
      setForceNewCampaign(false);
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

  if (loadIssue) return h('div', { className: 'assemble-day-app' }, h(RecoveryPanel, { result: loadIssue, onNew: startNew, onExit }));

  const screens: Record<string, any> = {
    day: h(DayScreen, { session, selectedActionId, onSelect: (id: string) => { setSelectedActionId((current: string) => current || id); setSaveMessage(''); setSaveTone(''); }, onConfirm: confirm, saveMessage, saveTone, resultRevision, onContinueResult: () => { setResultRevision(null); setSaveMessage(''); setSaveTone(''); }, onRetrySave: retrySave, onOpenPlan: () => setActiveScreen('week'), onReplaySameSeed: replaySameSeed, onStartNew: startNew }),
    week: h(WeekScreen, {
      session,
      plan: planningDraft,
      onToggleRule: (id: WeeklyRulePresetId) => { setPlanningDraft((current: PlanningPlan) => ({ ...current, weeklyRuleIds: current.weeklyRuleIds.includes(id) ? current.weeklyRuleIds.filter((item) => item !== id) : [...current.weeklyRuleIds, id] })); setPlanMessage(''); setPlanTone(''); },
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

  return h('div', { className: 'assemble-day-app' },
    h('div', { className: 'assemble-day-shell' },
      h('nav', { className: 'assemble-day-tabs', 'aria-label': 'Масштаб кампании' },
        ...[['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц'], ['life', 'Жизнь']].map(([id, label]) => h('button', {
          key: id, type: 'button', className: activeScreen === id ? 'is-active' : '', 'aria-current': activeScreen === id ? 'page' : undefined, onClick: () => setActiveScreen(id),
        }, label)),
      ),
      h('main', { className: 'assemble-day-content' }, screens[activeScreen]),
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
    contract: CONTRACT,
    eventCopy: EVENT_COPY,
    createSession,
    getCampaignView,
    confirmAction,
    getPlanningCampaignView,
    confirmPlanning,
    loadCheckpoint,
    saveCheckpoint,
    createDiagnosticTrace,
    serializeDiagnosticTrace,
    copyDiagnosticTrace,
  },
};
