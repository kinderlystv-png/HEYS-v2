# Action schema v2

> Статус: implementation-контракт<br> Набор документов: 0.37<br> Обновлено:
> 2026-07-30<br> Владелец: причинный движок и контент сценария

[← К карте документации](./README.md)

## Назначение

Действие описывает доступность, известную цену, немедленный результат,
отложенные эффекты и объяснение. Контент не содержит исполняемых функций и не
меняет порядок reducer.

## Корневая схема

```ts
interface ActionDefinitionV2 {
  schemaVersion: 2;
  id: string;
  version: 1;
  domains: Array<
    'state' | 'food' | 'work' | 'family' | 'finance' | 'movement' | 'social'
  >;
  priorityAlignment: {
    supports: Array<'work' | 'family' | 'recovery' | 'social'>;
    conflicts: Array<'work' | 'family' | 'recovery' | 'social'>;
  };
  copy: {
    label: string;
    summary: string;
    knownCost: string;
    contextual?: Record<string, { label: string; summary: string }>;
  };
  ruleEvidenceId: RuleEvidenceId;
  requirements: RequirementV1[];
  cost: ActionCostV1;
  immediateEffects: EffectV1[];
  conditionalEffects: ConditionalEffectV1[];
  scheduledEffects: ScheduledEffectDefinitionV1[];
  uncertainty?: UncertaintyV1;
  explanation: {
    immediate: string;
    risk?: string;
    unavailable?: string;
  };
  tags: string[];
}
```

`priorityAlignment` — обязательное authored-решение контента. Движок не выводит
фокус из широкого `domains`: поэтому кофе или поздняя работа не становятся
«восстановлением» только из-за домена `state`. Одно действие не может
одновременно поддерживать и конфликтовать с одной областью.

`copy` сообщает игроку практический смысл. Формулы, внутренние коэффициенты и
оценка «правильно / неправильно» в текст не входят. `contextual` позволяет
одному engine-action иметь точную подпись в конкретном authored event без
дублирования copy и branching в UI.

## Требования

```ts
type RequirementV1 =
  | {
      kind: 'range';
      path: string;
      op: 'lt' | 'lte' | 'eq' | 'gte' | 'gt';
      value: number;
    }
  | { kind: 'clock_window'; fromMin: number; toMin: number }
  | { kind: 'inventory'; category: FoodCategory; minPortions: number }
  | { kind: 'capability'; id: string }
  | { kind: 'task_status'; taskId: string; status: WorkTaskV1['status'] }
  | {
      kind: 'commitment_status';
      commitmentId: string;
      status: CommitmentV1['status'];
    }
  | { kind: 'event_is'; eventId: string };
```

Все требования проверяются по состоянию и производному контексту до шага.
Неуспешная проверка возвращает код причины и не меняет state или RNG.

## Цена

```ts
interface ActionCostV1 {
  timeMin: number;
  moneyRub: number;
  inventory?: Array<{ category: FoodCategory; portions: number }>;
  effort?: {
    cognitive?: 'none' | 'light' | 'normal' | 'high';
    physical?: 'none' | 'light' | 'normal' | 'high';
    social?: 'none' | 'light' | 'normal' | 'high';
  };
}
```

Время, рубли и расход порций детерминированы и видны до подтверждения. Контекст
может менять расчётную длительность или усилие только через объявленный
модификатор и обязан обновить `knownCost` перед выбором.

## Условия

```ts
type ConditionV1 =
  | {
      kind: 'compare';
      path: string;
      op: 'lt' | 'lte' | 'eq' | 'gte' | 'gt';
      value: number | string;
    }
  | { kind: 'capability'; id: string }
  | { kind: 'all'; conditions: ConditionV1[] }
  | { kind: 'any'; conditions: ConditionV1[] }
  | { kind: 'not'; condition: ConditionV1 };

interface ConditionalEffectV1 {
  when: ConditionV1;
  evaluateAt: 'pre_action';
  effects: EffectV1[];
  explanation: string;
  ruleEvidenceId: RuleEvidenceId;
}
```

Условные эффекты используют снимок до действия. Собственный немедленный эффект
действия не может включить свой модификатор задним числом.

## Операторы эффекта

```ts
type EffectV1 =
  | { op: 'add_state'; path: string; delta: number; reason: string }
  | { op: 'set_min'; path: string; value: number; reason: string }
  | { op: 'set_max'; path: string; value: number; reason: string }
  | { op: 'consume_resource'; path: string; amount: number; reason: string }
  | {
      op: 'add_inventory';
      category: FoodCategory;
      portions: number;
      reason: string;
    }
  | { op: 'advance_time'; minutes: number; reason: string }
  | { op: 'progress_task'; taskId: string; minutes: number; reason: string }
  | { op: 'create_commitment'; value: CommitmentV1; reason: string }
  | { op: 'resolve_commitment'; commitmentId: string; reason: string }
  | { op: 'break_commitment'; commitmentId: string; reason: string }
  | {
      op: 'adjust_relationship';
      target: 'partner' | 'child';
      dimension: 'closeness' | 'trust';
      delta: number;
      reason: string;
    }
  | {
      op: 'adjust_habit';
      habitId: keyof CharacterStateV1['habits'];
      delta: number;
      reason: string;
    }
  | {
      op: 'adjust_skill';
      skillId: keyof CharacterStateV1['skills'];
      delta: number;
      reason: string;
    }
  | { op: 'grant_capability'; capabilityId: string; reason: string }
  | { op: 'add_event_cooldown'; eventId: string; days: number; reason: string }
  | { op: 'bounded_roll'; value: BoundedRollV1; reason: string }
  | {
      op: 'append_causal_link';
      mechanism: string;
      resultPath: string;
      confidence: CausalEntryV1['confidence'];
    };
```

`adjust_skill` и `grant_capability` добавлены по `D12`. Новый оператор после v1
требует продуктового обоснования и новой версии schema; сценарий не получает
произвольный `script` или `callback`.

## Отложенный эффект и случайность

```ts
interface ScheduledEffectDefinitionV1 {
  id: string;
  trigger:
    | { kind: 'at_time'; dayOffset: number; minuteOfDay: number }
    | { kind: 'after_steps'; steps: number }
    | { kind: 'condition'; condition: ConditionV1 };
  effects: EffectV1[];
  ruleEvidenceId: RuleEvidenceId;
}

interface UncertaintyV1 {
  class: 'none' | 'bounded';
  confidence: CausalEntryV1['confidence'];
  visibleRisk: 'none' | 'low' | 'moderate' | 'high' | 'very_high';
}

interface BoundedRollV1 {
  seedKey: string;
  targetPath: string;
  minDelta: number;
  maxDelta: number;
}
```

Каждый `seedKey` уникален внутри действия. Известная цена не использует
`bounded_roll`. Результат броска остаётся внутри объявленного диапазона и
попадает в причинный журнал.

## Геометрия варианта

UI получает вычисленное представление, а не читает скрытые поля schema:

```ts
interface ActionOfferV1 {
  actionId: string;
  available: boolean;
  unavailableReasons: string[];
  unavailableMessages: string[];
  effectiveTimeMin: number;
  moneyRub: number;
  effort: ActionCostV1['effort'];
  effortScore: number;
  effortLevel: 'none' | 'light' | 'normal' | 'high';
  risk: UncertaintyV1['visibleRisk'];
  riskScore: number;
  optionPressure: number;
  consequencePreview: string[];
  consequences: {
    immediate: string[];
    delayed: string[];
    conditional: string[];
  };
  evidence: RuleEvidence;
  geometryReasons: Array<{
    reason: string;
    inputPaths: string[];
    evidence: RuleEvidence;
  }>;
  planningSignals: Array<{
    kind:
      | 'supports_weekly_rule'
      | 'conflicts_weekly_rule'
      | 'supports_main_goal'
      | 'supports_supporting_goal'
      | 'conflicts_unfunded_goal';
    sourceId: string;
    reason: string;
    inputPath: string;
  }>;
}
```

Состояние может менять доступность, время, усилие, риск, порядок и прогноз
результата. Числовые поля нужны движку и QA; UI показывает `effectiveTimeMin`,
`moneyRub`, качественные `effortLevel`/`risk` и краткий `consequencePreview`, не
воспроизводя пороги или условия. `geometryReasons` перечисляет реальные входы
причинного журнала. `unavailableMessages` и `consequences` — готовая human-copy
проекция; UI не переводит raw codes и не читает effect schema. Evidence содержит
стабильный `ruleEvidenceId`, confidence, source label и transfer limit.
`optionPressure` не выбирает действие и не закрывает альтернативы.

## Валидация контента

1. `id` стабилен, уникален и использует `snake_case`.
2. Денежные поля являются целыми рублями и неотрицательны.
3. Каждый state-changing оператор содержит `reason` или отдельный
   `append_causal_link`.
4. Условие ссылается только на разрешённый path schema.
5. `scheduledEffects.id` и `bounded_roll.seedKey` уникальны внутри действия.
6. Сумма немедленного изменения одной видимой шкалы проходит caps текущей
   `calibrationVersion`.
7. Действие, способное нарушить жёсткое обязательство, показывает это в
   `consequencePreview` до подтверждения.
8. Контент не содержит HTML, исполняемый код, персональные данные HEYS или
   внешний URL.
9. `priorityAlignment` задан явно; одинаковая область не входит одновременно в
   `supports` и `conflicts`.

## Пример

```yaml
schemaVersion: 2
id: order_food_and_finish_work
version: 1
domains: [food, work, finance, family]
copy:
  label: Заказать еду и закончить задачу
  summary: Еда приедет, пока вы работаете
  knownCost: 80 минут и 1 100 ₽
requirements:
  - { kind: range, path: economy.cashRub, op: gte, value: 1100 }
cost:
  timeMin: 80
  moneyRub: 1100
  effort: { cognitive: normal }
immediateEffects:
  - {
      op: add_state,
      path: vitals.hunger,
      delta: -42,
      reason: Доставка закрыла текущий голод,
    }
conditionalEffects:
  - when:
      { kind: compare, path: accumulators.sleepDebtMin, op: gte, value: 180 }
    evaluateAt: pre_action
    effects:
      - {
          op: add_state,
          path: vitals.tension,
          delta: 4,
          reason: Короткий сон повысил цену рабочей нагрузки,
        }
    explanation: После короткой ночи задача требует больше усилия
scheduledEffects: []
uncertainty:
  { class: bounded, confidence: plausible_model, visibleRisk: moderate }
explanation:
  immediate: Еда станет доступна без отдельной готовки
  risk: Семейный вечер может начаться позже
tags: [delivery, deadline]
```
