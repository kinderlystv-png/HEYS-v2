# Game state schema v2

> Статус: implementation-контракт<br> Набор документов: 0.31<br> Обновлено:
> 2026-07-29<br> Владелец: причинный движок

[← К карте документации](./README.md)

## Назначение

Документ задаёт сериализуемое состояние headless-прототипа. Источник продуктовых
ограничений: [`05_STATE_CAUSAL_ENGINE.md`](./05_STATE_CAUSAL_ENGINE.md), чисел:
[`09_CALIBRATION_QA.md`](./09_CALIBRATION_QA.md), решений о развитии и
экономике: [`10_DECISION_REGISTER.md`](./10_DECISION_REGISTER.md).

Схема описывает вымышленного персонажа контрольной недели. Персональные данные
HEYS в `GameStateV2` не входят.

## Нормативная форма

Псевдотипы ниже задают обязательные поля и их смысл. Реализация может
использовать TypeScript, Zod или JSON Schema, но сериализованный JSON обязан
сохранять этот контракт.

```ts
type Int0To100 = number;
type DayIndex = number;
type MinuteOfDay = number;
type EntityId = string;

interface GameStateV2 {
  schemaVersion: 2;
  campaignId: string;
  scenarioId: 'week-01-project-deadline';
  scenarioVersion: '3';
  calibrationVersion: '0.3';
  priceBookVersion: 'week-01-rub-v1';

  rng: {
    seed: string;
    algorithm: 'fnv1a-mulberry32-v1';
    occurrences: Record<string, number>;
  };

  clock: {
    dayIndex: DayIndex;
    minuteOfDay: MinuteOfDay;
    stepIndex: number;
    awakeSinceMinute: number;
  };

  character: CharacterStateV1;
  vitals: VitalsV1;
  accumulators: AccumulatorsV1;
  economy: EconomyStateV1;
  work: WorkStateV1;
  family: FamilyStateV1;
  commitments: CommitmentV1[];
  scheduledEffects: ScheduledEffectV1[];
  eventCooldownUntilDay: Record<EntityId, number>;
  activeEventId: EntityId | null;
  weeklyRules: WeeklyRuleV1[];
  monthlyPriorities: MonthlyPriorityV1[];
  causalJournal: CausalEntryV1[];
}
```

## Профиль и развитие

```ts
interface CharacterStateV1 {
  profile: {
    sleepNeedMin: number;
    chronotype: 'early' | 'neutral' | 'late';
    caffeineHalfLifeMin: number;
    caffeineSensitivity: number;
    digestionSensitivity: number;
    moodBaseline: Int0To100;
  };
  skills: Record<
    'professional' | 'planning' | 'cooking' | 'physical_fitness',
    Int0To100
  >;
  habits: Record<
    | 'caffeine_compensation'
    | 'late_work'
    | 'delivery'
    | 'short_walk'
    | 'meal_prep',
    Int0To100
  >;
  capabilities: EntityId[];
}
```

`skills`, `habits` и `capabilities` не складываются в общий уровень.
`capabilities` содержит открытые действия и инфраструктурные возможности,
например `kitchen.basic` или `work.ask_colleague_help`. Каждое изменение этих
полей требует причинной записи.

## Хранимое состояние

```ts
interface VitalsV1 {
  energy: Int0To100;
  mood: Int0To100;
  tension: Int0To100;
  hunger: Int0To100;
  physicalFatigue: Int0To100;
  discomfort: Int0To100;
  windDown: Int0To100;
}

interface AccumulatorsV1 {
  sleepDebtMin: number;
  activeCaffeineMg: number;
  satietyWindowMin: number;
  recoveryNeed: Int0To100;
  familyLoadPlayer7d: Int0To100;
  familyLoadPartner7d: Int0To100;
}
```

Допустимые диапазоны и основные стартовые значения принадлежат базовой
`calibration v0.1`; текущая `calibration v0.2` добавляет только контекстную цену
утренней готовки. Движок применяет границы после каждого оператора эффекта, а не
только в конце шага.

## Деньги, платежи и запас еды

```ts
type FoodCategory = 'ready_meal' | 'quick_base' | 'cook_stock';

interface EconomyStateV1 {
  cashRub: number;
  foodPortions: Record<FoodCategory, number>;
  expectedIncome: IncomeV1[];
  obligations: FinancialObligationV1[];
  financialGoal?: {
    id: EntityId;
    targetRub: number;
    reservedRub: number;
  };
}

interface IncomeV1 {
  id: EntityId;
  dueDayIndex: number;
  amountRub: number;
  status: 'expected' | 'received' | 'cancelled';
  source: 'salary' | 'bonus' | 'extra_work';
}

interface FinancialObligationV1 {
  id: EntityId;
  dueDayIndex: number;
  amountRub: number;
  status: 'scheduled' | 'deferred' | 'paid' | 'overdue';
  deferrable: boolean;
  deferralsUsed: number;
  maxDeferrals: number;
  deferCostRub: number;
}
```

`cashRub` не бывает отрицательным. Отрицательным может быть только вычисляемый
прогноз после ближайших платежей. Отсрочка меняет конкретное обязательство и
записывает цену; движок не создаёт автоматический кредит.

## Работа, семья и обязательства

```ts
interface WorkStateV1 {
  reputation: Int0To100;
  projectBacklogMin: number;
  helpDebt: number;
  tasks: WorkTaskV1[];
}

interface WorkTaskV1 {
  id: EntityId;
  remainingMin: number;
  requiredSkill: Int0To100;
  baseRisk: Int0To100;
  dueDayIndex: number;
  dueMinuteOfDay: MinuteOfDay;
  status: 'open' | 'done' | 'renegotiated' | 'failed';
}

interface FamilyStateV1 {
  partner: RelationshipV1;
  child: RelationshipV1;
  friction: Int0To100;
  participationBalance: number;
}

interface WeeklyRuleV1 {
  id: EntityId;
  kind:
    | 'protected_window'
    | 'spending_limit'
    | 'work_boundary'
    | 'movement_plan';
  enabled: boolean;
  sourceId: EntityId;
}

interface MonthlyPriorityV1 {
  domain: 'work' | 'family' | 'recovery' | 'social';
  level: 0 | 1 | 2;
}

interface RelationshipV1 {
  closeness: Int0To100;
  trust: Int0To100;
  available: boolean;
}

interface CommitmentV1 {
  id: EntityId;
  domain: 'work' | 'family' | 'finance' | 'recovery' | 'social';
  dueDayIndex: number;
  dueMinuteOfDay?: MinuteOfDay;
  status: 'open' | 'resolved' | 'renegotiated' | 'broken';
  owner: 'player' | 'partner' | 'shared';
  hard: boolean;
  renegotiationsUsed: number;
  sourceId: EntityId;
}
```

## Очередь и причинный журнал

```ts
interface ScheduledEffectV1 {
  id: EntityId;
  sourceId: EntityId;
  trigger:
    | { kind: 'at_time'; dayIndex: number; minuteOfDay: MinuteOfDay }
    | { kind: 'after_steps'; remainingSteps: number }
    | { kind: 'condition'; condition: ConditionV1 };
  effects: EffectV1[];
  status: 'pending' | 'applied' | 'cancelled';
}

interface CausalEntryV1 {
  id: EntityId;
  dayIndex: number;
  stepIndex: number;
  sourceId: EntityId;
  mechanism: string;
  resultPath: string;
  before?: number | string;
  after?: number | string;
  confidence: 'established' | 'plausible_model' | 'personal_hypothesis';
}
```

`EffectV1` определён в [`ACTION_SCHEMA.md`](./ACTION_SCHEMA.md). Очередь
сортируется по моменту срабатывания, затем по `id`. Журнал строится по
применённым изменениям; декларация эффекта без изменения состояния не создаёт
запись о результате.

## Вычисляемый контекст

Следующие поля не сериализуются:

```ts
interface DecisionContextV1 {
  sleepiness: Int0To100;
  sleepReadiness: Int0To100;
  deadlinePressure: Int0To100;
  financialPressure: Int0To100;
  familyImbalance: number;
  cashAfterNextObligationsRub: number;
  focusByTaskId: Record<EntityId, Int0To100>;
  optionPressureByActionId: Record<EntityId, Int0To100>;
}
```

Reducer пересчитывает контекст из хранимого состояния перед валидацией действия
и после применения шага. Сериализатор отклоняет JSON, который пытается сохранить
производное поле.

## Инварианты

1. Все значения конечны; `NaN`, `Infinity`, `Date`, `Map`, `Set` и функции
   запрещены.
2. Значения `0–100` остаются в диапазоне, `participationBalance` в `−100…100`,
   минуты суток в `0…1439`. Активная контрольная неделя использует
   `dayIndex 0…6`, а завершённый снимок после воскресного сна может иметь
   `dayIndex 7`.
3. `cashRub` и число порций неотрицательны и целочисленны.
4. ID уникальны внутри коллекции; ссылка на задачу, обязательство, действие или
   событие разрешается до запуска кампании.
5. Завершённая запись не возвращается в активный статус без отдельного
   миграционного правила.
6. Один и тот же JSON состояния, действие и seed дают один результат при
   одинаковых версиях схемы, сценария, калибровки и набора цен.
7. Первая схема не содержит `clientId`, дневник HEYS, диагноз, вес, лекарство
   или другой персональный признак.

## Сериализация и миграции

- Состояние сохраняется как UTF-8 JSON с `schemaVersion`.
- Реализация сортирует ключи перед хешированием QA-снимка; порядок ключей
  исходного JSON не влияет на hash.
- Загрузка выполняет schema validation до вычисления производных.
- Миграция является чистой функцией `GameStateVn -> GameStateVn+1` и не
  использует текущую дату, сеть или случайность.
- Несовместимая версия закрывает загрузку с явной ошибкой. Движок не пытается
  угадать форму старого состояния.
