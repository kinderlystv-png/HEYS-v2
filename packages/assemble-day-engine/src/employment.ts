import { canonicalJson, stateHash } from './rng.js';
import { validateState } from './schema.js';
import { ReducerError, type EmploymentFormat, type GameState, type Income, type PlanningStepOutput } from './types.js';

/**
 * Форматы занятости (`D18`, `D76`). Они различаются доходом, дорогой,
 * стабильностью и вечерним вторжением работы — не «уровнем». Универсально
 * лучшего формата нет: каждый выигрывает в одном и уступает в другом.
 */
export interface EmploymentProfile {
  id: EmploymentFormat;
  title: string;
  summary: string;
  fortnightIncomeRub: number;
  incomeVarianceRub: number;
  commuteMinutesPerDay: number;
  eveningIntrusion: string;
  tradeoff: string;
}

export const EMPLOYMENT_PROFILES: Record<EmploymentFormat, EmploymentProfile> = {
  office: {
    id: 'office',
    title: 'Офис',
    summary: 'Ровный доход и предсказуемый график, но дорога съедает время каждый день.',
    fortnightIncomeRub: 72000,
    incomeVarianceRub: 0,
    commuteMinutesPerDay: 90,
    eveningIntrusion: 'Вечер обычно остаётся свободным.',
    tradeoff: 'Стабильность и свободный вечер в обмен на время в дороге.',
  },
  remote: {
    id: 'remote',
    title: 'Удалённо',
    summary: 'Дороги нет, но работа легче просачивается в вечер.',
    fortnightIncomeRub: 66000,
    incomeVarianceRub: 0,
    commuteMinutesPerDay: 0,
    eveningIntrusion: 'Работа чаще заходит в вечернее окно.',
    tradeoff: 'Свободное время дня в обмен на размытую границу вечера.',
  },
  project: {
    id: 'project',
    title: 'Проектно',
    summary: 'Доход выше в удачный период и заметно ниже в спокойный.',
    fortnightIncomeRub: 58000,
    incomeVarianceRub: 34000,
    commuteMinutesPerDay: 30,
    eveningIntrusion: 'Вечер зависит от фазы проекта.',
    tradeoff: 'Больший потолок дохода в обмен на его нестабильность.',
  },
};

export const FINANCIAL_GOAL_TARGET_RUB = 60000;
const FORTNIGHT_DAYS = 14;

export function employmentSetupView() {
  return {
    goal: {
      id: 'reserve_by_month',
      title: 'Финансовый резерв к концу месяца',
      targetRub: FINANCIAL_GOAL_TARGET_RUB,
      summary: `Цель кампании — сохранить ${FINANCIAL_GOAL_TARGET_RUB.toLocaleString('ru-RU')} ₽ резерва после обязательных платежей.`,
    },
    formats: Object.values(EMPLOYMENT_PROFILES).map((profile) => ({ ...profile })),
  };
}

/**
 * Атомарный шаг выбора формата: он создаёт ритм дохода и обязательные платежи на
 * весь горизонт кампании, ставит финансовую цель и пишет причину в журнал.
 * Повторный выбор запрещён — формат меняется историей, а не переключателем.
 */
export function reduceEmploymentSetup(input: { state: GameState; format: EmploymentFormat; campaignDays: number }): PlanningStepOutput {
  try {
    validateState(input.state);
  } catch (error) {
    throw new ReducerError('invalid_state', 'employment', undefined, [error instanceof Error ? error.message : String(error)]);
  }
  const profile = EMPLOYMENT_PROFILES[input.format];
  if (!profile) throw new ReducerError('invalid_content', 'employment', 'employment_format', ['unknown employment format']);
  if (input.state.employment.format) throw new ReducerError('invalid_content', 'employment', 'employment_format', ['employment_locked:формат занятости уже выбран']);
  if (input.state.clock.stepIndex > 0) throw new ReducerError('invalid_content', 'employment', 'employment_format', ['employment_late:формат выбирается до первого решения кампании']);

  const state = structuredClone(input.state);
  const startJournal = state.causalJournal.length;
  const incomes: Income[] = [];
  for (let dayIndex = FORTNIGHT_DAYS - 1; dayIndex < input.campaignDays; dayIndex += FORTNIGHT_DAYS) {
    incomes.push({ id: `salary_d${dayIndex}`, dueDayIndex: dayIndex, amountRub: profile.fortnightIncomeRub, status: 'expected', source: 'salary' });
  }
  state.economy.expectedIncome = incomes;
  state.economy.obligations = state.economy.obligations.map((item) => ({ ...item }));
  state.economy.financialGoal = { id: 'reserve_by_month', targetRub: FINANCIAL_GOAL_TARGET_RUB, reservedRub: 0 };
  state.employment = { format: profile.id, chosenAtStepIndex: state.clock.stepIndex };
  state.scheduledEffects = [
    ...state.scheduledEffects.filter((item) => item.sourceId !== 'salary' && item.sourceId !== 'bonus'),
    ...incomes.map((income) => ({
      id: `${income.id}_effect`,
      sourceId: income.id,
      trigger: { kind: 'at_time' as const, dayIndex: income.dueDayIndex, minuteOfDay: 1020 },
      effects: [
        ...(profile.incomeVarianceRub ? [{ op: 'bounded_roll' as const, value: { seedKey: `income:${income.id}`, targetPath: `economy.expectedIncome.${incomes.indexOf(income)}.amountRub`, minDelta: -profile.incomeVarianceRub, maxDelta: profile.incomeVarianceRub }, reason: 'нестабильный проектный доход' }] : []),
        { op: 'receive_income' as const, incomeId: income.id, reason: 'доход по выбранному формату' },
      ],
      status: 'pending' as const,
    })),
  ];

  const journalBase = { dayIndex: state.clock.dayIndex, stepIndex: state.clock.stepIndex, sourceId: 'employment_setup', confidence: 'established' as const };
  state.causalJournal.push(
    { ...journalBase, id: `journal:${state.rng.seed}:employment:${startJournal}:format`, mechanism: `формат занятости выбран: ${profile.title}`, resultPath: 'employment.format', before: canonicalJson(input.state.employment.format), after: canonicalJson(profile.id) },
    { ...journalBase, id: `journal:${state.rng.seed}:employment:${startJournal + 1}:income`, mechanism: 'ритм дохода создан выбранным форматом', resultPath: 'economy.expectedIncome', before: canonicalJson(input.state.economy.expectedIncome.map((item) => item.id)), after: canonicalJson(incomes.map((item) => item.id)) },
    { ...journalBase, id: `journal:${state.rng.seed}:employment:${startJournal + 2}:goal`, mechanism: 'финансовая цель кампании зафиксирована', resultPath: 'economy.financialGoal', before: canonicalJson(input.state.economy.financialGoal ?? null), after: canonicalJson(state.economy.financialGoal) },
  );
  validateState(state);
  return { state, journalEntries: state.causalJournal.slice(startJournal), stateHash: stateHash(state) };
}
