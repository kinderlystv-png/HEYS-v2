# Event schema v1

> Статус: implementation-контракт<br> Набор документов: 0.31<br> Обновлено:
> 2026-07-29<br> Владелец: генератор событий и контент сценария

[← К карте документации](./README.md)

## Назначение

Событие создаёт следующую развилку из обязательства, созревшего последствия,
причинного триггера, внешней помехи или возможности. Событие не выбирает реакцию
за игрока.

## Шаблон события

```ts
type EventSource =
  | 'mandatory'
  | 'scheduled_consequence'
  | 'causal'
  | 'external'
  | 'opportunity';

interface EventTemplateV1 {
  schemaVersion: 1;
  id: string;
  version: 1;
  source: EventSource;
  copy: {
    title: string;
    situation: string;
    causeHint?: string;
  };
  trigger: ConditionV1;
  hardWindow?: {
    fromDayIndex: number;
    fromMinuteOfDay: number;
    toDayIndex: number;
    toMinuteOfDay: number;
  };
  urgency: 0 | 1 | 2 | 3;
  selectionWeight: number;
  cooldownDays: number;
  maxOccurrencesPerCampaign?: number;
  load: EventLoadV1;
  onOpenEffects: EventOpenEffectV1[];
  actionIds: string[];
  tags: string[];
}

interface EventLoadV1 {
  total: number;
  external: number;
  size: 'none' | 'small' | 'medium' | 'large';
}
```

`selectionWeight` участвует только в выборе между кандидатами одного источника и
одинаковой срочности. Значение должно быть положительным целым числом.

## Эффект открытия

```ts
type EventOpenEffectV1 =
  | { op: 'advance_time'; minutes: number; reason: string }
  | {
      op: 'add_state';
      path: 'vitals.tension' | 'vitals.mood' | 'vitals.energy';
      delta: number;
      reason: string;
    }
  | { op: 'create_commitment'; value: CommitmentV1; reason: string }
  | {
      op: 'append_causal_link';
      mechanism: string;
      resultPath: string;
      confidence: CausalEntryV1['confidence'];
    };
```

Этот список закрыт. Открытие события может зафиксировать прошедшее время,
краткосрочную реакцию или новое обязательство. Оно не списывает деньги, не
уменьшает отношения, не выполняет рабочую задачу и не меняет навык. Такие
последствия возникают после действия игрока или созревшего ранее эффекта.

## Кандидат и экземпляр

```ts
interface EventCandidateV1 {
  templateId: string;
  source: EventSource;
  urgency: number;
  selectionWeight: number;
  triggerReasons: string[];
  practicallyAvailableActionIds: string[];
}

interface EventInstanceV1 {
  id: string;
  templateId: string;
  dayIndex: number;
  stepIndex: number;
  source: EventSource;
  actionIds: string[];
  openedBy: {
    triggerReasons: string[];
    selectionRule: string;
    rngKey?: string;
  };
}
```

`EventInstanceV1` хранится в снимке решения и отчёте QA. Его `templateId`
дублируется в `GameStateV2.activeEventId`, пока развилка не завершена: это
сохраняет выбранную движком причинную ветвь при reload и запрещает UI подменять
её canonical event слота. После подтверждённого шага поле получает следующий
выбранный event либо `null` в финале.

## Порядок сбора

Reducer собирает кандидатов в пяти очередях:

1. `mandatory`;
2. `scheduled_consequence`;
3. `causal`;
4. `external`;
5. `opportunity`.

Внутри очереди сначала идут события с закрывающимся `hardWindow`, затем более
высокая `urgency`, затем стабильный `id`. Seeded roll применяется только к
кандидатам, которые остались равны после этих правил.

Обязательство с наступившим жёстким сроком имеет приоритет над случайной
помехой. Возможность не вытесняет созревшее причинное последствие.

## Бюджет и cooldown

Для `calibration v0.1` генератор применяет следующие ограничения:

- внешняя нагрузка за день не выше `50`;
- общая нагрузка внешних и причинных событий за день не выше `90`;
- не более одного крупного внешнего события за день;
- не более четырёх крупных внешних событий за неделю;
- `cooldownDays >= 2` для внешнего шаблона;
- после двух тяжёлых событий подряд внешнее крупное событие не выбирается;
- незапланированная потеря денег после реакции игрока не выше `2 500 ₽`;
- открытие одного события не меняет видимую шкалу больше чем на `8` пунктов.

Обязательное событие не блокируется общим бюджетом. Генератор помечает
превышение как сценарную ошибку, если автор создал несколько несовместимых
жёстких обязательств.

## Практическая доступность

До выбора события reducer строит `ActionOfferV1` для каждого `actionId`. Обычная
развилка допускается, если минимум два варианта практически доступны. Жёсткое
обязательство может оставить один вариант только при явной причине и должно
входить в допустимые `≤2%` исключений `D60`.

Если состояние тяжёлое по `D56`, выбранное событие обязано содержать доступный
стабилизирующий путь. Генератор не добавляет бесплатный rescue-вариант; он
выбирает только среди заранее описанных действий с реальной ценой.

## Ограниченная случайность

RNG используется для выбора между равными допустимыми кандидатами и для
объявленного `bounded_roll`. Ключ выбора события:

```text
event-select:<dayIndex>:<stepIndex>:<source>:<candidate-id-list>
```

Список ID сортируется до формирования ключа. Добавление неподходящего кандидата
не меняет результат, потому что он отсеивается до RNG.

## Валидация контента

1. `id` уникален и использует `snake_case`.
2. Все `actionIds` разрешаются в Action Registry до запуска.
3. Внешнее событие имеет `cooldownDays >= 2`, ненулевую нагрузку и cap кампании.
4. `onOpenEffects` используют только закрытый список операторов.
5. Событие без действия игрока запрещено; автоматическое плановое начисление
   относится к scheduled effect, а не к Event Registry.
6. Крупный ущерб карьере, семье или финансам не возникает только из факта
   выпадения внешнего события.
7. Причинное событие содержит `causeHint` и trigger, который можно восстановить
   из state.
8. Шаблон не ссылается на реальные персональные данные HEYS.

## Пример

```yaml
schemaVersion: 1
id: school_calls_early
version: 1
source: mandatory
copy:
  title: Из школы позвонили раньше
  situation: Ребёнка нужно забрать до 16:00
  causeHint: Изменилось школьное расписание
trigger:
  kind: compare
  path: clock.dayIndex
  op: eq
  value: 2
hardWindow:
  fromDayIndex: 2
  fromMinuteOfDay: 840
  toDayIndex: 2
  toMinuteOfDay: 960
urgency: 3
selectionWeight: 1
cooldownDays: 0
maxOccurrencesPerCampaign: 1
load: { total: 30, external: 0, size: medium }
onOpenEffects:
  - {
      op: create_commitment,
      value:
        {
          id: child_pickup_wed,
          domain: family,
          dueDayIndex: 2,
          dueMinuteOfDay: 960,
          status: open,
          owner: shared,
          hard: true,
          renegotiationsUsed: 0,
          sourceId: school_calls_early,
        },
      reason: Школа закрывается в 16:00,
    }
actionIds: [take_family_responsibility, ask_partner_help, buy_time_and_pickup]
tags: [family, school, hard_window]
```
