# Headless-движок «Собери день»

> **Статус:** source contracts и vertical-slice baseline проверены 2026-07-29;
> production docs-contract v0.32 синхронизирован 2026-07-30  
> **Охват:** package API, registries, reducer, RNG/hash, scenario manifest v3,
> policies, интерактивный UI, checkpoint D7, tests, полный v0.2 report и текущие
> production gates  
> **Не подтверждено:** full QA v0.3, человеческая причинность/интерес,
> longitudinal value, персональная интеграция HEYS и кураторский контур

## Роль и граница

`@heys/assemble-day-engine` — изолированный Node-only simulation package. Он не
импортирует `apps/web`, не читает localStorage/cloud и не использует данные
пользователей. Browser-adapter в `apps/web/assemble-day/` импортирует
runtime-модули движка и передаёт UI реальные offers/state/journal без формул или
scenario branching в компонентах. Однако текущий start path adapter формирует
seed с raw `clientId`, который достигает сериализованного `campaignId`/RNG; это
подтверждённый privacy-blocker Sprint 1, а не свойство Node-package.

```text
complete GameStateV2 + 38-slot/42-event manifest + 31-action registry
  → runtime validation
  → pure atomic 10-stage reducer
  → deterministic event ledger + causal journal
  → seven policy campaigns
  → reproducible causal-QA JSON
```

## Текущий production gate

- Sprint 0
  [`production-мегаплана`](../../assemble-day/assemble_prodution_megaplan.md)
  завершён как docs/contract: единый маршрут, H33, blockers Sprints 8/9/14 и
  rule-evidence registry v0.1.
- Следующий разрешённый шаг — Sprint 1: opaque game seed, bounded checkpoint и
  доказанный click-only delivery.
- До formative human gate Sprint 6 обязательны Sprints 1–5. Full QA v0.3
  выполняется затем в Sprint 7 на отдельном runner.
- Настоящий 30-дневный lifecycle и месячная причинная сводка `DEFERRED` до
  Sprints 13–15. Same-seed replay существует, но его ценность и необходимость
  дополнительного разнообразия остаются `H31`/`H23`.
- Реальные данные, персональный режим и куратор запрещены до Sprint 20,
  отдельного `D8`-процесса и product/expert/legal/privacy gate.

## Владельцы контрактов

| Контракт                                      | Источник                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Продуктовые решения D1–D68 и calibration v0.3 | [`docs/assemble-day/`](../../assemble-day/)                                                                                                                                                                                                                                                            |
| Rule-evidence governance v0.1 (`D8`, `D45`)   | [`09_CALIBRATION_QA.md`](../../assemble-day/09_CALIBRATION_QA.md#rule-evidence-registry-v01)                                                                                                                                                                                                           |
| Production-очередь и gates                    | [`assemble_prodution_megaplan.md`](../../assemble-day/assemble_prodution_megaplan.md)                                                                                                                                                                                                                  |
| Исполнимые уточнения v0.31                    | [`TECHNICAL_CONTRACT_ADDENDUM.md`](../../assemble-day/TECHNICAL_CONTRACT_ADDENDUM.md)                                                                                                                                                                                                                  |
| Types и contract versions                     | [`src/types.ts`](../../../packages/assemble-day-engine/src/types.ts)                                                                                                                                                                                                                                   |
| Runtime validators                            | [`src/schema.ts`](../../../packages/assemble-day-engine/src/schema.ts)                                                                                                                                                                                                                                 |
| Action/event/38-slot data                     | [`src/content/`](../../../packages/assemble-day-engine/src/content/)                                                                                                                                                                                                                                   |
| Reducer и geometry                            | [`src/reducer.ts`](../../../packages/assemble-day-engine/src/reducer.ts)                                                                                                                                                                                                                               |
| Недельный/месячный planning-step и preview    | [`src/planning.ts`](../../../packages/assemble-day-engine/src/planning.ts)                                                                                                                                                                                                                             |
| RNG и canonical state hash                    | [`src/rng.ts`](../../../packages/assemble-day-engine/src/rng.ts)                                                                                                                                                                                                                                       |
| Policies, итог/развитие, campaign и QA        | [`src/policies.ts`](../../../packages/assemble-day-engine/src/policies.ts), [`src/campaign.ts`](../../../packages/assemble-day-engine/src/campaign.ts), [`src/simulation.ts`](../../../packages/assemble-day-engine/src/simulation.ts), [`src/qa.ts`](../../../packages/assemble-day-engine/src/qa.ts) |
| Browser-adapter и UI                          | [`heys_assemble_day_game_v1.ts`](../../../apps/web/assemble-day/heys_assemble_day_game_v1.ts)                                                                                                                                                                                                          |
| Lazy entry и fullscreen shell                 | [`heys_planning_v1.js`](../../../apps/web/heys_planning_v1.js)                                                                                                                                                                                                                                         |
| Client-scoped storage policy                  | [`heys_storage_registry_v1.js`](../../../apps/web/heys_storage_registry_v1.js)                                                                                                                                                                                                                         |

## Инварианты

1. Публичный reducer клонирует input и либо возвращает целое новое состояние,
   либо не меняет input/RNG/journal.
2. Scenario-specific поведение живёт в registries и manifest, не в ветках по
   action/event ID.
3. UTF-8 FNV-1a + Mulberry32, canonical JSON и FNV-1a 64 имеют golden vectors.
4. Event-ledger атомарно обеспечивает D59: daily/weekly caps, cooldown, max
   occurrences и запрет третьего тяжёлого события подряд.
5. Full QA использует тот же reducer pipeline в trusted campaign mode;
   equivalence test сравнивает его с атомарным путём.
6. Artifact metadata не входит в simulation hash; версии всех контрактов
   обязательны в отчёте.
7. UI-состояние выбора не сохраняется: checkpoint создаётся только после
   успешного `reduceStep` и содержит целое проверенное состояние с
   hash/revision.
8. Ключ `heys_planning_assemble_day_campaign_v1` получает client scope через
   `HEYS.store`; несовместимое, повреждённое или более новое сохранение не
   перезаписывается молча.
9. Текущий baseline держит полный presentation-copy в UI-adapter, а registries —
   технические placeholders. Это подтверждённый ownership-gap Sprint 5, а не
   целевой контракт; до его закрытия placeholder-тексты не показываются
   пользователю и не меняют логику движка.
10. До открытия карточки браузер не запрашивает и не исполняет bundle или CSS
    игры; после первого открытия ресурсы могут оставаться в памяти и SW cache.
11. UI-adapter показывает цену из `ActionOffer`, а ближайшие и отложенные
    последствия — из декларативных action effects. Краткий итог и полный журнал
    не подменяют причинный источник операционной ценой.
12. Planning draft не является прогрессом. `reducePlanningStep` атомарно
    заменяет только `weeklyRules` и `monthlyPriorities`, добавляет established
    journal entries и не двигает scenario cursor, clock, RNG, event ledger или
    scheduled effects.
13. Checkpoint revision отделена от `clock.stepIndex`: она растёт после обычного
    или planning reducer-step, поэтому стратегический план сохраняется без
    изменения RNG/event IDs. Старые snapshots с `revision === clock.stepIndex`
    остаются совместимыми.
14. Подтверждённый план добавляет к `ActionOffer` engine-owned сигналы и
    числовые дельты времени/усилия/риска/pressure; UI не содержит формул.
    Planning-step не двигает сценарий и не ослабляет QA-пороги.
15. До первого касания видны известные последствия всех вариантов. Касание
    фиксирует вариант только в памяти UI; reducer/checkpoint выполняются
    отдельным подтверждением, после которого отдельный result beat скрывает
    следующую развилку до «Продолжить».
16. `cook_meal_batch` в `mon_breakfast` — отдельное от готовой порции действие.
    Базовые время/усилие/риск и надбавка при действительно сжатом утре приходят
    из `ActionOffer`/reducer; journal называет `context.deadlinePressure`, а
    `awakeSinceMinute` не меняется действием.
17. Диагностический ledger хранит только подтверждённые action/planning-решения.
    Полный JSON строится при копировании детерминированным replay через тот же
    engine, включает offers, контекст, state before/after, десять stage hashes и
    journal delta, проверяет итоговый state hash и не экспортирует client ID,
    сырой seed/campaign ID или дневник. Старый checkpoint без ledger имеет явный
    статус `legacy_partial`.
18. Выбранная event-ветвь хранится в `activeEventId`. Capability/condition
    trigger открывает отдельное эхо-событие, а journal фиксирует входные trigger
    paths; reload не может вернуть canonical event слота.
19. `getCharacterDevelopment` и `getCampaignOutcome` выводят фактические
    навыки/привычки/capabilities и четыре оси итога без XP, уровня, счёта или
    win/lose. Same-seed replay сравнивает стратегию при одинаковых внешних
    условиях.
20. D56 `100%` тяжёлых состояний с минимум одним реальным stabilizer сохранён;
    v0.3 дополнительно требует два reducer-подтверждённых пути минимум в `85%`
    тяжёлых состояний.

## Проверка

- `pnpm exec tsc -p packages/assemble-day-engine/tsconfig.json --noEmit`
- `pnpm exec vitest run --config packages/assemble-day-engine/vitest.config.ts`
- `pnpm --dir packages/assemble-day-engine test -- src/__tests__/planning.test.ts src/__tests__/reducer.test.ts`
- Только отдельный runner/CI, не рабочий ноутбук:
  `node --import tsx packages/assemble-day-engine/src/cli/run-causal-qa.ts --seeds=10000 --output=docs/assemble-day/reports/causal-qa-v0.3.json`
- `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js __tests__/planning-games-ui.test.js __tests__/storage-registry.test.js`

Последний полный отчёт для `calibration v0.2`: 10 000 seed, семь policies, 70
000 runs, 2 660 000 проверенных переходов, 266 replay-сравнений, 38/38 slots,
38/38 events, 31/31 actions и `failedGates=[]`. Simulation hash
`924019c1e1aad75e`, source fingerprint `cb1a4b933c03dcf6`.

Ограниченный локальный smoke для `calibration v0.3`: 20 seed, семь policies, 140
runs, 38/38 slots, 42/42 events, 31/31 actions,
`heavyMultiStabilizationRate=0.999031007751938`, `echoEventCoverageRate=1` и
`failedGates=[]`. Это проверка исполнения новых контрактов, а не замена полного
10 000-seed отчёта.

Технический walkthrough UI, раздельные рубрики причинности/интереса и
человеческий gate:
[`vertical-slice-evaluation-v0.1.md`](../../assemble-day/reports/vertical-slice-evaluation-v0.1.md).

## Facts Table

| ID   | Утверждение                                                                                                                                                                                                                                | Проверка                                                                                                                                                                                                                                           | Статус                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| AD1  | Package не зависит от web/browser runtime                                                                                                                                                                                                  | `rg -n -e "apps/web" -e "localStorage" -e "window\\." -e "document\\." packages/assemble-day-engine/src`                                                                                                                                           | проверено 2026-07-29: совпадений нет                                                                   |
| AD2  | Реестры содержат 31 действие и manifest из 38 slots / 42 event templates                                                                                                                                                                   | `node --import tsx packages/assemble-day-engine/src/cli/run-causal-qa.ts --seeds=20 --output=/tmp/assemble-day-qa-v03-smoke.json`                                                                                                                  | проверено 2026-07-29: coverage полный, `failedGates=[]`                                                |
| AD3  | Публичный reducer проходит десять именованных стадий и atomic rollback                                                                                                                                                                     | `pnpm exec vitest run --config packages/assemble-day-engine/vitest.config.ts`                                                                                                                                                                      | проверено 2026-07-29, reducer tests                                                                    |
| AD4  | Полный D60 gate прошёл 10 000 seed × 7 policies и проверил каждый переход                                                                                                                                                                  | `node -e "const s=require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation; console.log(s.seedCount,s.runCount,s.rawCounts.auditedTransitions,s.rawCounts.heavy===s.rawCounts.stabilized,Object.values(s.gates).every(g=>g.passed))"` | проверено 2026-07-29: `10000 70000 2660000 true true`                                                  |
| AD5  | Отчёт фиксирует версии RNG/hash/schema/scenario/calibration                                                                                                                                                                                | `node -e "console.log(require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation.contracts)"`                                                                                                                                           | проверено 2026-07-29: scenario `2`, calibration `0.2`                                                  |
| AD6  | Browser-adapter проходит реальный первый reducer-step и не меняет input                                                                                                                                                                    | focused web tests                                                                                                                                                                                                                                  | проверено 2026-07-29                                                                                   |
| AD7  | Подтверждённый шаг сохраняется, reload возобновляет revision, stale/incompatible снимки отклоняются                                                                                                                                        | focused web tests                                                                                                                                                                                                                                  | проверено 2026-07-29                                                                                   |
| AD8  | До открытия карточки модуль и ресурсы игры отсутствуют; после клика запрашиваются только отдельные JS/CSS                                                                                                                                  | focused web tests + browser resource trace                                                                                                                                                                                                         | проверено 2026-07-29                                                                                   |
| AD9  | Цена, последствия, краткий итог и полный журнал используют данные reducer/registries и сохраняют причинный источник                                                                                                                        | focused web tests + browser walkthrough                                                                                                                                                                                                            | проверено 2026-07-29                                                                                   |
| AD10 | Planning-step атомарен, не двигает сценарий/RNG/queue; draft не сохраняется, а подтверждённые правила и фокусы через `calibration v0.3` меняют bounded-геометрию следующих offers и reducer journal                                        | `planning.test.ts` + focused web tests                                                                                                                                                                                                             | проверено 2026-07-29                                                                                   |
| AD11 | Первое касание нельзя заменить другим вариантом; до подтверждения checkpoint отсутствует, после подтверждения сохраняется один reducer-step                                                                                                | focused web test                                                                                                                                                                                                                                   | проверено 2026-07-29                                                                                   |
| AD12 | Готовая порция и готовка различаются по цене; контекстная надбавка возникает только в сжатом утре, journal называет входной фактор, а regression `qa-00129/random_valid` не остаётся без стабилизирующего пути                             | focused reducer/web tests + `causal-qa-v0.2.json`                                                                                                                                                                                                  | проверено 2026-07-29                                                                                   |
| AD13 | Checkpoint хранит компактный ledger подтверждённых решений, а скопированный trace воспроизводит полные engine-стадии и совпадает с текущим state hash; legacy-снимок помечается как partial, raw client/seed identifiers не экспортируются | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js`                                                                                                                                                                 | проверено 2026-07-29                                                                                   |
| AD14 | План реально меняет offer geometry, после первого действия заблокирован, а active echo event сохраняется и отклоняет stale canonical event                                                                                                 | `planning.test.ts` + `reducer.test.ts`                                                                                                                                                                                                             | проверено 2026-07-29                                                                                   |
| AD15 | UI показывает известные последствия до касания, отдельный result beat, четыре оси, развитие, grouped journal и same-seed replay                                                                                                            | `planning-game-assemble-day.test.js` + browser smoke                                                                                                                                                                                               | проверено source/focused tests 2026-07-29; browser integration подтверждается после свежей lazy-сборки |
| AD16 | D8 открыт, а registry v0.1 не выдаёт ни одну строку за экспертно рассмотренную                                                                                                                                                             | `rg -n -e 'D8 .*Открыто' -e 'Rule-evidence registry v0.1' -e 'reviewed.*запрещён' docs/assemble-day/{10_DECISION_REGISTER.md,09_CALIBRATION_QA.md}`                                                                                                | проверено 2026-07-30: `D8=Открыто`, reviewed rows отсутствуют                                          |
| AD17 | Канонический current route одинаков: Sprint 0 DONE → Sprint 1; human gate Sprint 6                                                                                                                                                         | `rg -n -e 'Sprint 0.*заверш' -e 'Следующ.*Sprint 1' -e 'human.*Sprint 6' -e 'formative.*Sprint 6' docs/assemble-day/{README.md,12_ROADMAP.md,assemble_prodution_megaplan.md}`                                                                      | проверено 2026-07-30                                                                                   |
| AD18 | Full causal QA v0.3 отсутствует; полный последний report относится к v0.2                                                                                                                                                                  | `test ! -e docs/assemble-day/reports/causal-qa-v0.3.json && node -e "console.log(require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation.contracts.calibrationVersion)"`                                                             | проверено 2026-07-30: absent; `0.2`                                                                    |
| AD19 | Raw clientId участвует в текущем browser seed и затем сохраняется package initial state                                                                                                                                                    | `rg -n -e 'clientId.*seed' -e 'seed.*clientId' -e 'campaignId:.*seed' -e 'rng:.*seed' apps/web/assemble-day/heys_assemble_day_game_v1.ts packages/assemble-day-engine/src/content/scenario.ts`                                                     | проверено 2026-07-30: Sprint 1 blocker                                                                 |
| AD20 | Month outcome — deferred runtime, replay value/diversity — hypothesis                                                                                                                                                                      | `rg -n -e 'месячн.*DEFERRED' -e 'H23' -e 'H31' docs/assemble-day/{README.md,10_DECISION_REGISTER.md,11_HYPOTHESES_BACKLOG.md,12_ROADMAP.md}`                                                                                                       | проверено 2026-07-30                                                                                   |
