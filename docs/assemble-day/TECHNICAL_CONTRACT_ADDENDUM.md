# Технический addendum v0.35

Статус: обязательное исполнимое уточнение v0.35. Продуктовые решения
D12/D14/D15/D16 и пороги D60 не изменяются; решения D61–D68 добавляют системный
игровой цикл.

## 1. Portable determinism

- Строки RNG кодируются UTF-8. `fnv1a-mulberry32-v1` означает FNV-1a 32-bit с
  offset `2166136261` и prime `16777619`, затем один стандартный шаг Mulberry32.
- State hash — canonical JSON (ключи объектов рекурсивно по Unicode code-point
  order, порядок массивов сохранён, нечисловые значения запрещены) и FNV-1a
  64-bit, lowercase hex из 16 символов.
- Шкалы состояния ограничиваются и округляются до 4 знаков после каждого
  меняющего их оператора; деньги, минуты, inventory и counters остаются целыми.
- IDs журнала и эффектов строятся из `rng.seed`, `stepIndex`, source и
  локального ordinal. Wall clock не входит в simulation payload.

## 2. Исполнимое состояние

`GameStateV2` включает:

- `scenarioCursor` — индекс следующего из 38 decision slots;
- `activeEventId` — выбранная движком текущая причинная ветвь до её
  подтверждения;
- `eventLedger` — occurrence по template, дневные total/external/large loads,
  week large count и consecutive heavy count;
- полным initial fixture: versions, RNG counters, capabilities, expected income,
  obligations, tasks, commitments, queue, rules и priorities.

`projectBacklogMin` равен сумме `remainingMin` активных задач и пересчитывается
после task effects. `StepOutputV1.nextEvent` равен `null` после slot 38.

## 3. Закрытые операторы

К `EffectV1` добавляются data-driven операторы: `create_task`, `set_task`,
`create_income`, `receive_income`, `set_obligation`, `renegotiate_commitment` и
`sleep_transition`. Операторы содержат payload и path, не action ID;
scenario-specific ветвление в reducer запрещено.

Переход сна — явный `sleep_transition` в данных границы дней, а не 39-я
развилка. Он применяет формулы калибровки при переходе к первому якорю
следующего дня. Если ночь разделена обязательным ночным событием, каждый сегмент
использует собственное окно как target, чтобы потребность в одном и том же сне
не начислялась дважды. Вечерние действия меняют входы сна через `windDown`,
кофеин, напряжение и время.

## 4. События и manifest

- `SCENARIO_WEEK_01` является массивом ровно из 38 полных records: slot, anchor,
  event template и action IDs.
- При пересечении anchor среда продвигается до `max(currentClock, anchor)`; slot
  не пропускается.
- Manifest slot — основная развилка; hard consequence того же окна записывается
  эффектом/журналом, не добавляя slot.
- Event selection сортирует кандидатов по source priority, hard window и
  urgency; внутри равной группы выполняет weighted RNG по предварительно
  отсортированным IDs.
- Ledger обновляется атомарно при выборе события. Cooldown, max occurrences и
  D59 gates проверяются до commit; rejected `onOpenEffects` полностью
  откатываются.

## 5. Геометрия действия и политики

`ActionDefinitionV2` получает декларативные `geometryRules`: условие и дельты
`available`, `timeMin`, `moneyRub`, `effortScore`, `riskScore`,
`optionPressure`, `preview`. Rules оцениваются по состоянию без action-ID веток.
`ActionOfferV1` возвращает итоговые scores вместе с качественными `effortLevel`
и `risk`, поэтому UI не повторяет числовые пороги.

Inventory-cost может содержать `fallbackMoneyRub`: если базовая порция
закончилась, действие остаётся доступной простой покупкой по указанной цене. Это
исполнимый data-driven вариант инварианта D56; reducer не знает ID действия или
продукта.

Семь политик используют нормализованный вектор результата
`[work, family, recovery, money, time, risk]`, веса:

| policy           |          work | family | recovery | money | time | risk |
| ---------------- | ------------: | -----: | -------: | ----: | ---: | ---: |
| maximize_work    |             4 |    0.5 |      0.5 |     1 |    1 |   -1 |
| protect_family   |           0.5 |      4 |        1 |   0.5 |  0.5 |   -1 |
| protect_recovery |           0.5 |      1 |        4 |   0.5 |    1 |   -1 |
| save_money       |             1 |    0.5 |      0.5 |     4 |  0.5 |   -1 |
| buy_time         |             1 |    0.5 |        1 |   0.5 |    4 |   -1 |
| balanced         |             1 |      1 |        1 |     1 |    1 | -1.5 |
| random_valid     | seeded choice |        |          |       |      |      |

Utilities tie-break by action ID. `random_valid` uses seed key
`policy:random_valid:<slot>`.

## 5.1. Planning capacity

- недельный planning step принимает ровно два rule slots из трёх;
- фокусы распределяют три единицы внимания `2+1`;
- `ActionDefinitionV2.priorityAlignment` явно перечисляет поддерживаемые и
  конфликтующие области;
- event tags определяют рабочее, семейное и вечернее окна;
- derived capacity не хранится в state, поэтому schema остаётся v2;
- изменение planning geometry версионировано как scenario v4, calibration v0.4;
- производные `CampaignBrief`, `StepSummary`, `PeriodBoundary` и `PeriodSummary`
  добавлены в technical contract v0.33 без изменения state schema, scenario и
  calibration.

## 5.2. Campaign brief и period projections

- `CampaignBrief` вычисляется из same-seed initial state и registries;
- `getPeriodBoundaries` принимает только соседний reducer transition и сверяет
  authored slots, а не только clock;
- последний slot недели возвращает `[day, week]` в этом порядке;
- `getPeriodSummary` не мутирует state, RNG или journal и не сериализуется в
  checkpoint;
- пользовательская проекция не содержит raw state paths и внутренних значений
  `0–100`; exact evidence остаётся в diagnostic trace;
- week summary зеркально содержит brief, rules, commitments, qualitative
  pressure, четыре axes и `openThreads`; month summary не создаётся.

## 5.3. Development projection

- `CharacterDevelopmentItem.direction` принимает только `strengthened`,
  `weakened` или `changed`;
- projection включает поле лишь при наличии исполнимого downstream и
  counterfactual regression;
- v0.34 допускает `professional → focus/offer geometry`,
  `cooking → cook geometry + sat echo` и
  `work.reciprocal_support → work echo events`;
- остальные persisted skills/habits/capabilities остаются causal history и
  diagnostic evidence, но не user-facing development;
- projection replay-derived и не расширяет `GameStateV2` или checkpoint v2.

## 5.4. Content, evidence и presentation projection

- `src/content/presentation.ts` владеет authored copy базовых событий,
  контекстными подписями действий, human unavailable messages и runtime
  rule-evidence records;
- `ActionDefinitionV2`, conditional/scheduled effects и `GeometryRule` обязаны
  ссылаться на известный `ruleEvidenceId`; schema fail-closed отклоняет
  отсутствующий ID или placeholder event copy;
- `ActionOfferV1` возвращает human consequences, unavailable messages,
  offer-changing geometry factors и evidence
  `{confidence, sourceLabel, transferLimit}`; raw input paths остаются журналом
  и trace;
- technical trace сохраняет полные state/offers/reducer stages, а human history
  не показывает raw IDs, paths или deltas;
- `SyntheticObservation` вычисляется только из fixed-character campaign state и
  явно не является персональным наблюдением HEYS;
- `getCharacterPresentation(state)` возвращает закрытые pose/expression/load/
  dayPhase, три qualitative indicators, не более двух human reasons и ARIA-
  summary; пороги принадлежат engine presentation и переиспользуются campaign-
  projection;
- `CharacterPresentation` replay-derived, не мутирует state и не расширяет
  `GameStateV2`, checkpoint v2, reducer, RNG или persistence; first-touch не
  создаёт отдельного visual state;
- presentation additions не меняют `GameStateV2`, scenario v4, calibration v0.4,
  RNG, reducer order или D60/D66 gates.

## 6. QA denominators

- Ordinary fork: manifest record with `forkKind: ordinary`; hard single choice
  is separately marked `forkKind: hard`.
- Heavy state определяется ровно условиями D56: `energy < 25`, `tension > 80`,
  `hunger > 85`, `sleepDebtMin > 300` или `financialPressure > 85`.
- Stabilizer считается доказанным только после reducer-preview practically
  available действия: оно должно реально уменьшить дефицит/хвост/трение, закрыть
  или пересогласовать обязательство, создать подготовленный запас/правило либо
  записать причинно проверяемое предотвращение новой задачи или переделки.
  Одного тега недостаточно.
- Массовые availability/balance gates и долгосрочный diff-аудит считаются по
  всем policy-runs. Воспроизводимость отдельно повторяет все 38 переходов
  контрольного seed для каждой политики и сравнивает 266 пар transition hashes и
  семь final hashes.
- Stable simulation payload не содержит `createdAt` и code revision. Artifact
  metadata хранится рядом и не влияет на comparison hash.
