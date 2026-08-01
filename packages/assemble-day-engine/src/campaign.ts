import { createInitialState } from './content/scenario.js';
import { WEEKLY_RULE_PRESETS } from './content/planning.js';
import { getCharacterPresentationLevel } from './content/presentation.js';
import { computeDecisionContext } from './reducer.js';
import { boundariesForCompletedDay, weekActionCount, weekIndexFor } from './periods.js';
import type {
  CampaignBrief,
  CampaignOutcome,
  CampaignOutcomeAxis,
  CharacterDevelopmentItem,
  CausalEntry,
  GameState,
  PeriodBoundary,
  PeriodRuleResult,
  PeriodSummary,
  OutcomeDirection,
  Registries,
  StepOutput,
  StepSummary,
  SyntheticObservation,
} from './types.js';

const DAY_NAMES = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
const DAY_TITLES = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const PATH_LABELS: Array<[RegExp, string]> = [
  [/^vitals\.energy$/, 'запас сил'],
  [/^vitals\.mood$/, 'настроение'],
  [/^vitals\.tension$/, 'напряжение'],
  [/^vitals\.hunger$/, 'голод'],
  [/^work\.(tasks|projectBacklogMin)/, 'объём открытой работы'],
  [/^family\.friction$/, 'семейное напряжение'],
  [/^family\./, 'семейные отношения'],
  [/^economy\.foodPortions\./, 'домашний запас еды'],
  [/^economy\./, 'финансовый запас'],
  [/^accumulators\.sleepDebtMin$/, 'дефицит сна'],
  [/^accumulators\.satietyWindowMin$/, 'запас сытости'],
  [/^accumulators\./, 'потребность в восстановлении'],
  [/^commitments/, 'договорённости'],
  [/^character\./, 'устойчивый паттерн персонажа'],
];

function formatTime(minutes: number): string { return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`; }
function qualitative(value: number, gender: 'masculine' | 'feminine' | 'neuter' = 'masculine'): string {
  const level = getCharacterPresentationLevel(value);
  return {
    masculine: { high: 'высокий', moderate: 'умеренный', low: 'низкий' },
    feminine: { high: 'высокая', moderate: 'умеренная', low: 'низкая' },
    neuter: { high: 'высокое', moderate: 'умеренное', low: 'низкое' },
  }[gender][level];
}
function pathLabel(path: string): string { return PATH_LABELS.find(([pattern]) => pattern.test(path))?.[1] || 'следующие решения'; }
function meaningful(entries: CausalEntry[]): CausalEntry[] {
  return entries.filter((entry) => !/^(clock|scenarioCursor|eventLedger|rng|eventCooldownUntilDay|decisionGeometry|eventTrigger|activeEventId)/.test(entry.resultPath));
}
function changeDirection(entry: CausalEntry): string {
  if (typeof entry.before === 'number' && typeof entry.after === 'number') {
    if (entry.after === entry.before) return 'не изменился';
    const label = pathLabel(entry.resultPath);
    const plural = /отношения|договорённости/.test(label);
    const feminine = /потребность/.test(label);
    const neuter = /настроение|напряжение/.test(label);
    if (plural) return entry.after > entry.before ? 'усилились' : 'ослабли';
    if (feminine) return entry.after > entry.before ? 'выросла' : 'снизилась';
    if (neuter) return entry.after > entry.before ? 'выросло' : 'снизилось';
    return entry.after > entry.before ? 'вырос' : 'снизился';
  }
  if (entry.after === 'done') return 'закрыт';
  if (entry.after === 'resolved') return 'выполнены';
  if (entry.after === 'broken') return 'нарушены';
  return 'изменились';
}
function primaryEntry(entries: CausalEntry[], registries?: Registries): CausalEntry | undefined {
  const useful = meaningful(entries);
  const actionDriven = registries ? useful.filter((entry) => Boolean(registries.actions[entry.sourceId])) : useful;
  const score = (entry: CausalEntry): number => {
    if (/^commitments|^work\.tasks\..*\.status/.test(entry.resultPath)) return 100;
    if (/^work\.(tasks|projectBacklogMin)/.test(entry.resultPath)) return 90;
    if (/^family\./.test(entry.resultPath)) return 80;
    if (/^character\.|^scheduledEffects/.test(entry.resultPath)) return 70;
    if (/^economy\./.test(entry.resultPath)) return 60;
    if (/^vitals\.(energy|mood|tension)/.test(entry.resultPath)) return 50;
    if (/^accumulators\.sleepDebtMin/.test(entry.resultPath)) return 40;
    return 0;
  };
  return actionDriven.map((entry, index) => ({ entry, index, score: score(entry) })).sort((left, right) => right.score - left.score || left.index - right.index)[0]?.entry || useful[0];
}
function sourceTitle(entry: CausalEntry, registries: Registries): string {
  return registries.actions[entry.sourceId]?.copy.label || registries.events[entry.sourceId]?.copy.title || 'Решения периода';
}
function openThreads(state: GameState): string[] {
  const task = state.work.tasks.find((item) => item.id === 'project_delivery');
  const items = task?.status !== 'done' ? [`Проект остаётся открыт: ${task?.remainingMin ?? state.work.projectBacklogMin} мин работы.`] : [];
  for (const item of state.commitments.filter((entry) => entry.status === 'open' || entry.status === 'renegotiated')) {
    const owner = item.domain === 'family' ? 'Семейная договорённость' : item.domain === 'work' ? 'Рабочая договорённость' : 'Договорённость';
    items.push(`${owner} на ${DAY_NAMES[item.dueDayIndex] || `день ${item.dueDayIndex + 1}`} остаётся открытой.`);
  }
  return items;
}

export function getCampaignBrief(state: GameState, registries: Registries): CampaignBrief {
  const initial = createInitialState(state.rng.seed);
  const task = initial.work.tasks.find((item) => item.id === 'project_delivery')!;
  const commitments = initial.commitments.filter((item) => item.hard);
  const income = initial.economy.expectedIncome.filter((item) => item.status === 'expected').reduce((sum, item) => sum + item.amountRub, 0);
  const obligations = initial.economy.obligations.filter((item) => item.status === 'scheduled').reduce((sum, item) => sum + item.amountRub, 0);
  return {
    mission: {
      title: 'Сдать проект и не потерять опоры недели',
      summary: `${task.remainingMin} мин работы нужно завершить к ${DAY_NAMES[task.dueDayIndex]} ${formatTime(task.dueMinuteOfDay)}.`,
    },
    stakes: [
      { id: 'commitments', title: 'Договорённости', summary: `Жёстких семейных договорённостей в неделе: ${commitments.length}.` },
      { id: 'finance', title: 'Финансовая граница', summary: `${initial.economy.cashRub.toLocaleString('ru-RU')} ₽ сейчас, ${income.toLocaleString('ru-RU')} ₽ ожидается и ${obligations.toLocaleString('ru-RU')} ₽ обязательного платежа впереди.` },
      { id: 'recovery', title: 'Запас сил', summary: 'Работа, семья и восстановление конкурируют за одни и те же окна.' },
    ],
    choiceSpace: `${registries.slots.length} развилок, две недельные границы и два разных фокуса. Единственного правильного маршрута нет.`,
  };
}

export function getStepSummary(input: {
  before: GameState;
  output: StepOutput;
  registries: Registries;
  eventTitle: string;
  actionLabel: string;
}): StepSummary {
  const entries = meaningful(input.output.journalEntries);
  const actionEntries = entries.filter((entry) => entry.sourceId === input.output.appliedAction.actionId);
  const immediateMechanisms = new Set(input.registries.actions[input.output.appliedAction.actionId]?.immediateEffects.map((effect) => 'reason' in effect ? effect.reason : '').filter(Boolean) || []);
  const immediateEntries = actionEntries.filter((entry) => immediateMechanisms.has(entry.mechanism));
  const immediateUserEffects = immediateEntries.some((entry) => !entry.resultPath.startsWith('character.'))
    ? immediateEntries.filter((entry) => !entry.resultPath.startsWith('character.'))
    : immediateEntries;
  const primary = primaryEntry(immediateUserEffects, input.registries)
    || primaryEntry(actionEntries.filter((entry) => !/^(цена усилия|расход |денежная цена действия)/.test(entry.mechanism)), input.registries)
    || primaryEntry(entries, input.registries);
  const carried = entries.find((entry) => /commitments|scheduledEffects|work\.tasks|economy\.obligations|accumulators|character\./.test(entry.resultPath));
  const result = primary ? `${pathLabel(primary.resultPath)} ${changeDirection(primary)}` : 'заметного немедленного изменения нет';
  return {
    dayIndex: input.before.clock.dayIndex,
    eventTitle: input.eventTitle,
    actionLabel: input.actionLabel,
    mainChange: primary ? `Главное изменение: ${result}.` : 'Решение принято без заметной немедленной перемены.',
    causalLink: primary ? `${input.eventTitle} → ${input.actionLabel} → ${primary.mechanism} → ${result}.` : `${input.eventTitle} → решение учтено в следующем шаге.`,
    carryover: carried ? `Дальше повлияет: ${pathLabel(carried.resultPath)}.` : 'Дальше повлияют оставшиеся время и ресурсы.',
  };
}

/**
 * Границы периодов принадлежат редьюсеру: он применяет их ровно один раз и
 * записывает идентификаторы в состояние. Здесь остаётся только разница между
 * двумя состояниями, поэтому второго источника истины не появляется.
 */
export function getPeriodBoundaries(before: GameState, after: GameState, registries: Registries): PeriodBoundary[] {
  if (after.scenarioCursor !== before.scenarioCursor + 1) return [];
  const completedSlot = registries.slots[before.scenarioCursor];
  if (!completedSlot) return [];
  const appliedNow = new Set(after.periods.appliedBoundaries.filter((id) => !before.periods.appliedBoundaries.includes(id)));
  if (!appliedNow.size) return [];
  const nextSlot = registries.slots[after.scenarioCursor];
  return boundariesForCompletedDay({
    periods: after.periods,
    completedDayIndex: completedSlot.dayIndex,
    nextDayIndex: nextSlot ? nextSlot.dayIndex : null,
    afterStepIndex: after.clock.stepIndex,
  }).filter((boundary) => appliedNow.has(boundary.id));
}

function dayEntries(state: GameState, dayIndex: number, registries: Registries): CausalEntry[] {
  const indices = registries.slots.map((slot, index) => slot.dayIndex === dayIndex ? index + 1 : -1).filter((index) => index > 0);
  if (!indices.length) return [];
  const from = Math.min(...indices), to = Math.max(...indices);
  return state.causalJournal.filter((entry) => entry.stepIndex >= from && entry.stepIndex <= to);
}

function weeklyRuleResults(state: GameState, weekIndex = weekIndexFor(state.periods, Math.max(0, state.clock.dayIndex - 1))): PeriodRuleResult[] {
  const lateWork = weekActionCount(state, weekIndex, 'work_late');
  const brokenFamily = state.commitments.filter((item) => item.domain === 'family' && item.status === 'broken').length;
  const task = state.work.tasks.find((item) => item.id === 'project_delivery');
  return state.weeklyRules.filter((item) => item.enabled && WEEKLY_RULE_PRESETS.some((preset) => preset.id === item.id)).map((item) => {
    const id = item.id as PeriodRuleResult['id'];
    const title = WEEKLY_RULE_PRESETS.find((preset) => preset.id === id)?.title || id;
    if (id === 'protect_sleep') return { id, title, direction: lateWork === 0 ? 'kept' : lateWork <= 2 ? 'traded' : 'strained', summary: lateWork === 0 ? 'Поздняя работа не вытеснила вечернюю границу.' : `Поздняя работа выбрана ${lateWork} раз: граница потребовала компромисса.` };
    if (id === 'family_anchor') return { id, title, direction: brokenFamily === 0 ? 'kept' : brokenFamily === 1 ? 'traded' : 'strained', summary: brokenFamily === 0 ? 'Жёсткие семейные договорённости не нарушены.' : `Нарушено семейных договорённостей: ${brokenFamily}.` };
    return { id, title, direction: task?.status === 'done' ? 'kept' : (task?.remainingMin ?? 999) < 210 ? 'traded' : 'strained', summary: task?.status === 'done' ? 'Проект закрыт в пределах недели.' : `Проект остался открыт: ${task?.remainingMin ?? state.work.projectBacklogMin} мин работы.` };
  });
}

export function getPeriodSummary(state: GameState, boundary: PeriodBoundary, registries: Registries): PeriodSummary {
  if (boundary.kind === 'month') {
    const outcome = getCampaignOutcome(state);
    const goal = state.economy.financialGoal;
    const reserve = computeDecisionContext(state).cashAfterNextObligationsRub;
    const goalDirection: OutcomeDirection = !goal ? 'traded' : reserve >= goal.targetRub ? 'kept' : reserve >= goal.targetRub / 2 ? 'traded' : 'strained';
    return {
      id: boundary.id,
      kind: 'month',
      completedDayIndex: boundary.completedDayIndex,
      title: `Месяц ${boundary.periodIndex + 1} завершён`,
      headline: goal
        ? `Финансовая цель месяца: ${goal.targetRub.toLocaleString('ru-RU')} ₽ резерва. Сейчас после ближайших платежей ${reserve.toLocaleString('ru-RU')} ₽.`
        : 'Месяц завершён: итог складывается из тех же четырёх линий, что и недельный.',
      causalLink: 'Месяц собирает последствия недель: перенесённые нити, выполненные договорённости и накопленное состояние.',
      carryover: outcome.openThreads.length ? `${outcome.openThreads.length} открытые нити переходят в следующий месяц.` : 'Открытых нитей на конец месяца не осталось.',
      axes: outcome.axes.map((axis) => axis.id === 'finance' ? { ...axis, direction: goalDirection } : axis),
      openThreads: outcome.openThreads,
    };
  }
  if (boundary.kind === 'week') {
    const outcome = getCampaignOutcome(state);
    const resolved = state.commitments.filter((item) => item.status === 'resolved').length;
    const broken = state.commitments.filter((item) => item.status === 'broken').length;
    const open = state.commitments.filter((item) => item.status === 'open' || item.status === 'renegotiated').length;
    const context = computeDecisionContext(state);
    return {
      id: boundary.id,
      kind: 'week',
      completedDayIndex: boundary.completedDayIndex,
      title: 'Контрольная точка недели',
      headline: 'Итог сверяет ту же миссию, правила и ставки, с которыми началась неделя.',
      causalLink: 'Выбранные границы меняли цену решений; подтверждённые действия сформировали итог по четырём независимым линиям.',
      carryover: outcome.openThreads.length ? `${outcome.openThreads.length} открытые нити переходят дальше.` : 'Обязательные нити этой недели закрыты.',
      brief: getCampaignBrief(state, registries),
      rules: weeklyRuleResults(state, boundary.periodIndex),
      commitments: { resolved, broken, open, summary: `Выполнено: ${resolved}; нарушено: ${broken}; осталось открыто: ${open}.` },
      pressure: `К финалу давление проекта ${qualitative(context.deadlinePressure, 'neuter')}, семейное давление ${qualitative(context.familyImbalance, 'neuter')}, потребность в восстановлении ${qualitative(Math.max(context.sleepiness, 100 - state.vitals.energy, state.accumulators.recoveryNeed), 'feminine')}.`,
      axes: outcome.axes,
      openThreads: outcome.openThreads,
    };
  }
  const entries = dayEntries(state, boundary.completedDayIndex, registries);
  const primary = primaryEntry(entries, registries);
  const threads = openThreads(state);
  const result = primary ? `${pathLabel(primary.resultPath)} ${changeDirection(primary)}` : 'состояние сохранилось без крупного сдвига';
  return {
    id: boundary.id,
    kind: 'day',
    completedDayIndex: boundary.completedDayIndex,
    title: `День завершён: ${DAY_TITLES[boundary.completedDayIndex] || boundary.completedDayIndex + 1}`,
    headline: `${result.charAt(0).toUpperCase()}${result.slice(1)}.`,
    causalLink: primary ? `${sourceTitle(primary, registries)} → ${primary.mechanism} → ${result}.` : 'Решения дня не создали одного доминирующего изменения.',
    carryover: threads[0] ? `На следующий день: ${threads[0]}` : 'На следующий день переходят текущее состояние и оставшиеся ресурсы.',
  };
}

export function getCharacterDevelopment(state: GameState): CharacterDevelopmentItem[] {
  const initial = createInitialState(state.rng.seed), items: CharacterDevelopmentItem[] = [];
  const professionalDelta = state.character.skills.professional - initial.character.skills.professional;
  if (professionalDelta) items.push({
    id: 'skill:professional',
    title: 'Рабочий паттерн',
    direction: professionalDelta > 0 ? 'strengthened' : 'weakened',
    summary: professionalDelta > 0
      ? 'Практика укрепила рабочий паттерн: будущий фокус меняет время и риск проектных вариантов.'
      : 'Рабочий паттерн ослаб: будущие проектные варианты потребуют больше внимания.',
    evidencePaths: ['character.skills.professional', 'context.focusByTaskId.project_delivery'],
  });
  const cookingDelta = state.character.skills.cooking - initial.character.skills.cooking;
  if (cookingDelta) items.push({
    id: 'skill:cooking',
    title: 'Порядок готовки',
    direction: cookingDelta > 0 ? 'strengthened' : 'weakened',
    summary: cookingDelta > 0
      ? 'Повторённая готовка укрепила порядок: следующие приготовления дешевле по времени и усилию, а субботнее окно меняется.'
      : 'Порядок готовки ослаб: следующие приготовления снова требуют больше времени и усилия.',
    evidencePaths: ['character.skills.cooking', 'decisionGeometry.cook_meal_batch.character.skills.cooking', 'eventTrigger.sat_meal_prep_familiar.character.skills.cooking'],
  });
  if (!initial.character.capabilities.includes('work.reciprocal_support') && state.character.capabilities.includes('work.reciprocal_support')) items.push({
    id: 'capability:work.reciprocal_support',
    title: 'Взаимная помощь с коллегой',
    direction: 'changed',
    summary: 'Повторная совместная работа открыла взаимную поддержку: будущая срочная проверка приходит с меньшим давлением.',
    evidencePaths: ['character.capabilities', 'eventTrigger.fri_final_issue_with_support.character.capabilities'],
  });
  return items;
}

export function getSyntheticObservation(state: GameState): SyntheticObservation {
  const development = getCharacterDevelopment(state);
  const strongest = development.find((item) => item.direction === 'changed') || development[0];
  return strongest ? {
    label: 'Игровое наблюдение',
    title: strongest.title,
    summary: strongest.summary,
    disclaimer: 'Наблюдение относится только к вымышленному персонажу этой кампании и не использует данные дневника HEYS.',
  } : {
    label: 'Игровое наблюдение',
    title: 'Устойчивый паттерн ещё не проявился',
    summary: 'Пока ни одно повторённое решение не изменило будущие варианты персонажа.',
    disclaimer: 'Наблюдение относится только к вымышленному персонажу этой кампании и не использует данные дневника HEYS.',
  };
}

export function getCampaignOutcome(state: GameState): CampaignOutcome {
  const initial = createInitialState(state.rng.seed), context = computeDecisionContext(state), task = state.work.tasks.find((item) => item.id === 'project_delivery');
  const familyResolved = state.commitments.filter((item) => item.domain === 'family' && item.status === 'resolved').length;
  const familyBroken = state.commitments.filter((item) => item.domain === 'family' && item.status === 'broken').length;
  const trustDelta = state.family.partner.trust - initial.family.partner.trust;
  const energy = qualitative(state.vitals.energy), tension = qualitative(state.vitals.tension, 'neuter');
  const axes: CampaignOutcomeAxis[] = [
    { id: 'work', title: 'Проект', direction: task?.status === 'done' ? 'kept' : (task?.remainingMin ?? 999) < initial.work.projectBacklogMin / 2 ? 'traded' : 'strained', summary: task?.status === 'done' ? 'Проект завершён.' : `Проект остался открыт: ${task?.remainingMin ?? state.work.projectBacklogMin} мин работы.`, evidencePaths: ['work.tasks.project_delivery.status', 'work.projectBacklogMin'] },
    { id: 'family', title: 'Договорённости', direction: familyBroken === 0 && trustDelta >= 0 ? 'kept' : familyBroken <= 1 ? 'traded' : 'strained', summary: familyBroken === 0 ? `Выполнено семейных договорённостей: ${familyResolved}; нарушенных нет.` : `Выполнено: ${familyResolved}; нарушено: ${familyBroken}.`, evidencePaths: ['commitments', 'family.partner.trust', 'family.friction'] },
    { id: 'finance', title: 'Финансовый запас', direction: context.cashAfterNextObligationsRub >= 0 ? 'kept' : state.economy.cashRub > 0 ? 'traded' : 'strained', summary: context.cashAfterNextObligationsRub >= 0 ? `После ближайших платежей остаётся ${context.cashAfterNextObligationsRub.toLocaleString('ru-RU')} ₽.` : `После ближайших платежей не хватает ${Math.abs(context.cashAfterNextObligationsRub).toLocaleString('ru-RU')} ₽.`, evidencePaths: ['economy.cashRub', 'context.cashAfterNextObligationsRub'] },
    { id: 'recovery', title: 'Восстановление', direction: state.vitals.energy >= 45 && state.vitals.tension < 60 ? 'kept' : state.vitals.energy >= 25 && state.vitals.tension < 80 ? 'traded' : 'strained', summary: `Запас сил ${energy}, напряжение ${tension}; последствия сна перенесены в следующий цикл.`, evidencePaths: ['vitals.energy', 'vitals.tension', 'accumulators.sleepDebtMin'] },
  ];
  return { axes, development: getCharacterDevelopment(state), openThreads: openThreads(state) };
}

export function compareCampaignOutcomes(previous: CampaignOutcome, current: CampaignOutcome) {
  return current.axes.map((axis) => { const before = previous.axes.find((item) => item.id === axis.id)!; return { id: axis.id, title: axis.title, before: before.direction, after: axis.direction, changed: before.direction !== axis.direction || before.summary !== axis.summary, summary: axis.summary }; });
}
