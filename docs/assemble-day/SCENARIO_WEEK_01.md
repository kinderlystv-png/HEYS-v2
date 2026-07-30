# Scenario week 01: неделя до сдачи проекта

> Статус: implementation-контракт сценария<br> Набор документов: 0.34<br>
> Обновлено: 2026-07-30<br> Владелец: контент первого вертикального среза

[← К карте документации](./README.md)

## Идентификаторы

```yaml
scenarioId: week-01-project-deadline
scenarioVersion: '4'
schemaVersion: 2
calibrationVersion: '0.4'
priceBookVersion: week-01-rub-v1
days: 7
decisionSlots: 38
```

Сценарий использует один фиксированный профиль и не читает данные HEYS.
[`08_VERTICAL_SLICE.md`](./08_VERTICAL_SLICE.md) владеет продуктовым смыслом
недели, а этот файл задаёт реализационный manifest.

Scenario v4 добавляет content-owned теги `planned_work_window`,
`family_anchor_window` и `sleep_boundary_window`. Они определяют применимость
недельных правил; UI и reducer не распознают окна по event ID.

## Цели и жёсткие якоря

```yaml
goals:
  - { id: submit_project, domain: work, due: '4@17:00', hard: true }
  - { id: protect_friday_evening, domain: family, due: '4@19:00', hard: false }
  - { id: attend_school_event, domain: family, due: '5@09:00', hard: true }
  - { id: movement_sessions, domain: recovery, target: 2, hard: false }
  - {
      id: preserve_payment_reserve,
      domain: finance,
      due: '7@09:00',
      hard: false,
    }
scheduledFacts:
  - { id: salary, at: '4@17:00', amountRub: 72000 }
  - {
      id: project_bonus,
      at: '4@17:00',
      minRub: 0,
      maxRub: 4000,
      seedKey: project_bonus,
    }
  - {
      id: housing_payment,
      at: '7@09:00',
      amountRub: 45000,
      deferrable: true,
      maxDeferrals: 1,
    }
```

`scheduledFacts` применяются очередью эффектов. Они не занимают слот решения и
не маскируются под событие.

## Начальное состояние

```yaml
clock: { dayIndex: 0, minuteOfDay: 420, stepIndex: 0, awakeSinceMinute: 420 }
profile:
  sleepNeedMin: 480
  chronotype: neutral
  caffeineHalfLifeMin: 300
  caffeineSensitivity: 1.0
  digestionSensitivity: 1.0
  moodBaseline: 55
skills: { professional: 52, planning: 45, cooking: 35, physical_fitness: 45 }
habits:
  caffeine_compensation: 45
  late_work: 40
  delivery: 35
  short_walk: 30
  meal_prep: 20
vitals:
  {
    energy: 68,
    mood: 61,
    tension: 34,
    hunger: 25,
    physicalFatigue: 18,
    discomfort: 0,
    windDown: 20,
  }
accumulators:
  sleepDebtMin: 30
  activeCaffeineMg: 0
  satietyWindowMin: 0
  recoveryNeed: 22
  familyLoadPlayer7d: 18
  familyLoadPartner7d: 18
economy:
  cashRub: 32000
  foodPortions: { ready_meal: 2, quick_base: 3, cook_stock: 5 }
work: { reputation: 58, projectBacklogMin: 420, helpDebt: 0 }
family:
  partner: { closeness: 72, trust: 74, available: true }
  child: { closeness: 76, trust: 73, available: true }
  friction: 18
  participationBalance: 0
```

Полный initial state дополняется обязательствами, задачей `project_delivery` и
capabilities согласно `GAME_STATE_SCHEMA.md`.

## Повторно используемые действия

Action Registry обязан содержать 31 действие: 18 повторно используемых базовых и
13 сценарных.

| ID                   | Базовая цена           | Основной результат                                                         |
| -------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `eat_ready_meal`     | 20 мин, 1 `ready_meal` | сильнее снижает голод, создаёт окно сытости                                |
| `eat_quick_base`     | 10 мин, 1 `quick_base` | умеренно снижает голод, короткое окно сытости                              |
| `cook_meal_batch`    | 60 мин, 3 `cook_stock` | еда сейчас и 2 готовые порции                                              |
| `order_food`         | 40–80 мин, 1 100 ₽     | экономит активное время, уменьшает резерв                                  |
| `drink_coffee_100`   | 10 мин, 250 ₽          | добавляет 100 мг кофеина без снижения долга сна                            |
| `walk_short`         | 25 мин                 | лёгкое движение, снижение напряжения и небольшой измеримый прирост энергии |
| `train_light`        | 35 мин                 | сессия движения с низкой восстановительной ценой                           |
| `train_planned`      | 70 мин                 | обычная сессия, цена зависит от восстановления                             |
| `work_standard`      | контекстно             | прогресс задачи с базовым риском                                           |
| `work_fast`          | `−20%` времени         | выше риск ошибки и переделки                                               |
| `work_careful`       | `+20%` времени         | ниже риск ошибки                                                           |
| `ask_colleague_help` | 15 мин, `helpDebt +1`  | уменьшает рабочий хвост с социальной ценой                                 |
| `renegotiate_work`   | 25 мин                 | меняет срок или объём, влияет на репутацию по контексту                    |
| `work_late`          | 60–120 мин             | прогресс работы, рост поздней нагрузки и привычности                       |
| `ask_partner_help`   | 10 мин                 | переносит семейную нагрузку с контекстной ценой                            |
| `take_family_load`   | 30–120 мин             | выполняет семейное обязательство и увеличивает участие                     |
| `protect_commitment` | контекстно             | сохраняет обещание ценой другого плана                                     |
| `wind_down_early`    | 60 мин                 | повышает `windDown`, оставляет незавершённые задачи                        |

Сценарные действия вроде такси, покупки продуктов или короткой встречи с
друзьями используют ту же `ActionDefinitionV1` и входят в общий QA-count 31.

Event Registry содержит 42 templates для 38 slots. Четыре дополнительные
templates — взаимоисключающие эхо-варианты коллегиальной взаимности, поддержки
перед финалом, знакомой пакетной готовки и семейной взаимности; каждый имеет
реальный state/capability trigger.

В `mon_breakfast` UI переименовывает `eat_ready_meal` в «Съесть заранее
приготовленный завтрак», а `cook_meal_batch` — в «Приготовить завтрак». Первое
действие расходует готовую порцию и не включает готовку. Второе расходует
продукты, занимает базовые 60 минут и создаёт две будущие порции; по
`calibration v0.2` только в сжатом утре его `ActionOffer` получает
дополнительную цену. Ни одно из действий не меняет `clock.awakeSinceMinute`.

## Реестр сценарных действий

| ID                            | Цена            | Эффект или обязательство                                 |
| ----------------------------- | --------------- | -------------------------------------------------------- |
| `commute_transit`             | 55 мин, 120 ₽   | прибыть обычным маршрутом                                |
| `buy_time_taxi`               | 25 мин, 1 800 ₽ | сократить дорогу, уменьшить резерв                       |
| `accept_scope`                | 10 мин          | увеличить `projectBacklogMin` на 120                     |
| `decline_extra_project`       | 15 мин          | сохранить ресурс, отказаться от дополнительного дохода   |
| `accept_extra_project`        | 150 мин         | создать отдельную задачу и ожидаемый доход 3 000 ₽       |
| `repay_colleague_help`        | 45 мин          | уменьшить `helpDebt` на 1                                |
| `shop_food`                   | 90 мин, 5 500 ₽ | добавить 4 `quick_base` и 6 `cook_stock`                 |
| `meet_friends_short`          | 90 мин, 1 200 ₽ | социальный эффект без поздней ночи                       |
| `decline_social`              | 5 мин           | сохранить окно без скрытого штрафа                       |
| `plan_next_week`              | 45 мин          | создать правила недели и снизить неопределённость        |
| `buy_time_and_pickup`         | 70 мин, 1 800 ₽ | выполнить школьное обязательство, перенести работу       |
| `postpone_shopping`           | 5 мин           | оставить текущий запас и показать риск пустого инвентаря |
| `attend_school_event_by_taxi` | 45 мин, 1 800 ₽ | выполнить школьное обязательство и купить время          |

## Manifest 38 развилок

Формат строки: `slot`, плановое время, источник, event ID и разрешённые
действия. Trigger и hard window задаются в Event Registry; таблица фиксирует
полный состав кампании.

| Slot | Время    | Source                | Event ID                  | Action IDs                                                                          |
| ---: | -------- | --------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
|    1 | Пн 07:00 | causal                | `mon_breakfast`           | `eat_ready_meal`, `cook_meal_batch`, `eat_quick_base`, `drink_coffee_100`           |
|    2 | Пн 08:00 | mandatory             | `mon_commute`             | `commute_transit`, `buy_time_taxi`                                                  |
|    3 | Пн 09:30 | mandatory             | `mon_scope_expansion`     | `accept_scope`, `renegotiate_work`                                                  |
|    4 | Пн 13:00 | causal                | `mon_lunch_window`        | `eat_ready_meal`, `eat_quick_base`, `order_food`                                    |
|    5 | Пн 16:00 | mandatory             | `mon_project_block`       | `work_standard`, `work_careful`, `ask_colleague_help`                               |
|    6 | Пн 19:00 | mandatory             | `mon_family_dinner`       | `protect_commitment`, `order_food`, `work_late`                                     |
|    7 | Вт 02:30 | mandatory             | `tue_night_wakeup`        | `take_family_load`, `ask_partner_help`                                              |
|    8 | Вт 07:00 | causal                | `tue_recovery_breakfast`  | `eat_quick_base`, `eat_ready_meal`, `drink_coffee_100`                              |
|    9 | Вт 09:00 | mandatory             | `tue_review_prep`         | `work_standard`, `work_fast`, `ask_colleague_help`                                  |
|   10 | Вт 12:00 | scheduled_consequence | `tue_review_result`       | `work_careful`, `renegotiate_work`, `ask_colleague_help`                            |
|   11 | Вт 15:30 | mandatory             | `tue_pickup_conflict`     | `take_family_load`, `ask_partner_help`, `buy_time_and_pickup`                       |
|   12 | Вт 19:00 | causal                | `tue_evening_pressure`    | `order_food`, `work_late`, `wind_down_early`, `protect_commitment`                  |
|   13 | Ср 08:00 | external              | `wed_commute_delay`       | `commute_transit`, `buy_time_taxi`, `renegotiate_work`                              |
|   14 | Ср 10:00 | mandatory             | `wed_long_meeting`        | `work_standard`, `work_fast`, `renegotiate_work`, `eat_quick_base`, `walk_short`    |
|   15 | Ср 13:30 | causal                | `wed_late_lunch`          | `eat_quick_base`, `order_food`, `eat_ready_meal`                                    |
|   16 | Ср 14:30 | mandatory             | `wed_school_call`         | `take_family_load`, `ask_partner_help`, `buy_time_and_pickup`                       |
|   17 | Ср 17:00 | causal                | `wed_work_recovery`       | `work_standard`, `ask_colleague_help`, `renegotiate_work`                           |
|   18 | Ср 20:00 | causal                | `wed_evening_stabilize`   | `walk_short`, `wind_down_early`, `work_late`                                        |
|   19 | Чт 08:00 | opportunity           | `thu_hybrid_start`        | `work_standard`, `walk_short`, `eat_ready_meal`                                     |
|   20 | Чт 10:00 | scheduled_consequence | `thu_colleague_help_debt` | `repay_colleague_help`, `work_standard`, `renegotiate_work`                         |
|   21 | Чт 12:00 | opportunity           | `thu_extra_project`       | `accept_extra_project`, `decline_extra_project`                                     |
|   22 | Чт 18:00 | mandatory             | `thu_movement_plan`       | `train_planned`, `train_light`, `work_late`                                         |
|   23 | Чт 20:00 | mandatory             | `thu_family_evening`      | `protect_commitment`, `wind_down_early`, `work_late`                                |
|   24 | Пт 08:00 | mandatory             | `fri_deadline_plan`       | `work_standard`, `work_careful`, `work_fast`, `eat_quick_base`, `walk_short`        |
|   25 | Пт 10:00 | causal                | `fri_final_issue`         | `work_fast`, `work_careful`, `ask_colleague_help`                                   |
|   26 | Пт 13:00 | causal                | `fri_lunch`               | `eat_ready_meal`, `eat_quick_base`, `order_food`                                    |
|   27 | Пт 15:30 | mandatory             | `fri_submit`              | `work_standard`, `work_careful`, `renegotiate_work`, `eat_quick_base`, `walk_short` |
|   28 | Пт 17:15 | opportunity           | `fri_after_submit`        | `walk_short`, `decline_extra_project`, `accept_extra_project`                       |
|   29 | Пт 19:00 | mandatory             | `fri_family_plan`         | `protect_commitment`, `work_late`, `renegotiate_work`                               |
|   30 | Сб 09:00 | mandatory             | `sat_school_event`        | `protect_commitment`, `attend_school_event_by_taxi`                                 |
|   31 | Сб 12:00 | mandatory             | `sat_household_stock`     | `shop_food`, `order_food`, `postpone_shopping`                                      |
|   32 | Сб 15:00 | opportunity           | `sat_meal_prep`           | `cook_meal_batch`, `eat_ready_meal`, `eat_quick_base`, `walk_short`                 |
|   33 | Сб 18:00 | opportunity           | `sat_social_invite`       | `meet_friends_short`, `decline_social`, `protect_commitment`                        |
|   34 | Сб 22:00 | causal                | `sat_evening_close`       | `wind_down_early`, `walk_short`, `work_late`                                        |
|   35 | Вс 09:00 | causal                | `sun_recovery_start`      | `eat_ready_meal`, `walk_short`, `train_light`                                       |
|   36 | Вс 12:00 | mandatory             | `sun_family_time`         | `take_family_load`, `protect_commitment`, `walk_short`                              |
|   37 | Вс 16:00 | mandatory             | `sun_week_preparation`    | `cook_meal_batch`, `plan_next_week`, `work_standard`                                |
|   38 | Вс 21:00 | mandatory             | `sun_early_finish`        | `wind_down_early`, `plan_next_week`, `work_late`                                    |

## Контекстные карточки последствий

До восьми карточек могут появиться поверх manifest, но не заменяют его слоты:

- рабочая переделка после ошибки;
- созревший эффект позднего кофеина;
- нарушенное обещание ребёнку;
- рост семейного трения;
- ответный долг помощи коллеге;
- финансовое давление перед платежом;
- восстановительная цена тяжёлой тренировки;
- результат защищённого семейного плана.

Карточка либо содержит новую развилку по Event Schema, либо является записью
журнала без действия. Второй вариант не увеличивает `decisionSlots`.

## Инварианты сценария

1. Все 38 слотов достижимы или заменены документированным жёстким последствием
   того же временного окна.
2. Зарплата и платёж применяются scheduled effects, независимо от выбранного UI.
3. В пятницу проект можно сдать вовремя минимум двумя траекториями без terminal
   lock.
4. Субботнее школьное событие не отменяется случайным генератором.
5. В тяжёлом состоянии каждый слот проходит стабилизационный gate `D56`.
6. Внешний генератор соблюдает caps `D59` и не меняет фиксированные якоря.
7. Недельная сводка строится из причинного журнала, а не из заранее написанной
   концовки.
