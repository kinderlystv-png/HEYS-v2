# Headless-движок «Собери день»

> **Статус:** technical contract v0.38 реализован; Sprint 24 `FULL QA PENDING`
> 2026-08-01 **Охват:** package API, registries, reducer, RNG/hash, scenario v6,
> 336-дневный runtime, интерактивный UI, checkpoint envelope v3, профиль Sprint
> 23/v1.3 и текущие production gates **Не подтверждено:** longitudinal value
> годовой кампании, персональная интеграция HEYS и кураторский контур

## Роль и граница

`@heys/assemble-day-engine` — изолированный Node-only simulation package. Он не
импортирует `apps/web`, не читает localStorage/cloud и не использует данные
пользователей. Browser-adapter в `apps/web/assemble-day/` импортирует
runtime-модули движка и передаёт UI реальные offers/state/journal без формул или
scenario branching в компонентах. Browser-session получает независимый opaque
game seed; raw `clientId` остаётся только аргументом client-scoped storage и не
попадает в `GameState`, RNG, campaign ID, ledger или диагностический trace.

```text
complete GameStateV4 + 2012-slot/49-event calendar + 33-action registry
  → runtime validation
  → pure atomic 10-stage reducer
  → deterministic event ledger + causal journal
  → seven policy campaigns
  → reproducible causal-QA JSON
```

## Текущий production gate

- Sprints 0–5, 8–12, 14, 15 и 21–23
  [`production-мегаплана`](../../assemble-day/assemble_prodution_megaplan.md)
  завершены: единый маршрут, H33, blockers Sprints 8/9/14, rule-evidence
  registry v0.2, opaque game seed, bounded checkpoint v3, доказанный click-only
  delivery и ограниченная planning capacity. Sprint 3 добавил engine-owned
  campaign brief, slot-owned day/week boundaries, replay-derived summaries и
  зеркальную недельную контрольную точку D4/D64. Sprint 4 ограничил development
  тремя downstream-подтверждёнными линиями и заменил оценочную семантику
  нейтральной. Sprint 5 перенёс authored presentation в engine, связал
  `ruleEvidenceId` и закрыл focused a11y gate.
- Sprint 12 принят владельцем. Sprint 24 находится `FULL QA PENDING`: полный
  год, production-календарь и существующая карточка годового итога реализованы;
  точечные variability/critical-hunger gates зелёные, но новый полный профиль
  current source не завершён. Sprint 25 не начинался.
- 336-дневный lifecycle, месячная/годовая сводка, state-driven catalog,
  same-seed replay и профиль Sprint 23 реализованы; внешняя пригодность остаётся
  `DEFERRED`.
- Реальные данные, персональный режим и куратор запрещены до Sprint 20,
  отдельного `D8`-процесса и product/expert/legal/privacy gate.

## Владельцы контрактов

| Контракт                                      | Источник                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Продуктовые решения D1–D68 и calibration v0.4 | [`docs/assemble-day/`](../../assemble-day/)                                                                                                                                                                                                                                                            |
| Rule-evidence governance v0.2 (`D8`, `D45`)   | [`09_CALIBRATION_QA.md`](../../assemble-day/09_CALIBRATION_QA.md#rule-evidence-registry-v02)                                                                                                                                                                                                           |
| Production-очередь и gates                    | [`assemble_prodution_megaplan.md`](../../assemble-day/assemble_prodution_megaplan.md)                                                                                                                                                                                                                  |
| Исполнимые уточнения v0.38                    | [`TECHNICAL_CONTRACT_ADDENDUM.md`](../../assemble-day/TECHNICAL_CONTRACT_ADDENDUM.md)                                                                                                                                                                                                                  |
| Types и contract versions                     | [`src/types.ts`](../../../packages/assemble-day-engine/src/types.ts)                                                                                                                                                                                                                                   |
| Runtime validators                            | [`src/schema.ts`](../../../packages/assemble-day-engine/src/schema.ts)                                                                                                                                                                                                                                 |
| Action/event/2012-slot data                   | [`src/content/`](../../../packages/assemble-day-engine/src/content/)                                                                                                                                                                                                                                   |
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
   успешного reducer-step. Envelope v3 содержит opaque game seed, revision,
   contract versions, state hash, bounded state-якорь последней границы и хвост
   подтверждённых решений; хвост воспроизводится тем же reducer и сверяется по
   hash.
8. Ключ `heys_planning_assemble_day_campaign_v1` получает client scope через
   `HEYS.store`; raw `clientId` остаётся только на этой границе. Missing,
   corrupt, foreign, stale, privacy-unsafe и incompatible snapshots получают
   разные явные статусы и не перезаписываются молча.
9. `src/content/presentation.ts` и registries владеют authored event/action
   presentation. Schema отклоняет placeholder event copy; UI не хранит второй
   словарь и не переводит raw unavailable codes.
10. До открытия карточки браузер не запрашивает и не исполняет bundle или CSS
    игры; после первого открытия ресурсы могут оставаться в памяти и SW cache.
11. UI-adapter показывает цену, human consequences, unavailable messages и
    offer-changing factors из `ActionOffer`. Раскрываемый слой использует
    engine-owned source/confidence/transfer limit; raw paths/deltas доступны
    только technical trace.
12. Planning draft не является прогрессом. `reducePlanningStep` принимает ровно
    два rule slots из трёх и разные фокусы, атомарно заменяет только
    `weeklyRules` и `monthlyPriorities`, добавляет established journal entries и
    не двигает scenario cursor, clock, RNG, event ledger или scheduled effects.
13. Checkpoint revision отделена от `clock.stepIndex`: она растёт после обычного
    или planning reducer-step, поэтому стратегический план сохраняется без
    изменения RNG/event IDs. Старые snapshots с `revision === clock.stepIndex`
    остаются совместимыми.
14. Подтверждённый план распределяет внимание `2+1`; authored action alignment и
    event window tags добавляют к `ActionOffer` engine-owned сигналы и числовые
    дельты усилия/риска/pressure. Само правило не сокращает время; UI не
    содержит формул. Planning-step не двигает сценарий и не ослабляет QA.
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
    сырой seed/campaign ID или дневник. Legacy envelope v1 загружается только
    если его boundary `clientId` совпадает с профилем, game payload не содержит
    UUID и имеет полный replay-ledger; частичный или privacy-unsafe снимок
    остаётся неизменным с явным статусом.
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
21. Bounded-state contract v0.37 не хранит lifetime-хвосты: causal journal
    сохраняет компактные дайджесты вместо полных `eventLedger`/`periods`, а на
    границе дня удаляются завершённые `event-select` occurrence keys и дневные
    load-map. Следующий день не затрагивается; QA-максимумы снимаются до
    компактизации.
22. Technical contract v0.38 задаёт `GameStateV4`, 336 дней / 2012 slots,
    `PeriodState` v2 и идемпотентную границу `year`. После удаления
    концентрирующего `routine_meal_break` точечные gates проходят, но прежний QA
    v1.3 не является evidence current source; полный профиль pending.

## Проверка

- `pnpm exec tsc -p packages/assemble-day-engine/tsconfig.json --noEmit`
- `pnpm exec vitest run --config packages/assemble-day-engine/vitest.config.ts`
- `pnpm --dir packages/assemble-day-engine test -- src/__tests__/planning.test.ts src/__tests__/reducer.test.ts`
- Только отдельный runner/CI, не рабочий ноутбук:
  `node --import tsx packages/assemble-day-engine/src/cli/run-causal-qa.ts --seeds=10000 --output=docs/assemble-day/reports/causal-qa-v0.3.json`
- `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js __tests__/planning-games-ui.test.js __tests__/storage-layer.test.js __tests__/storage-registry.test.js --no-coverage`

Последний полный отчёт для `calibration v0.2`: 10 000 seed, семь policies, 70
000 runs, 2 660 000 проверенных переходов, 266 replay-сравнений, 38/38 slots,
38/38 events, 31/31 actions и `failedGates=[]`. Simulation hash
`924019c1e1aad75e`, source fingerprint `cb1a4b933c03dcf6`.

Ограниченный локальный smoke для `calibration v0.3`: 20 seed, семь policies, 140
runs, 38/38 slots, 42/42 events, 31/31 actions,
`heavyMultiStabilizationRate=0.999031007751938`, `echoEventCoverageRate=1` и
`failedGates=[]`. Это проверка исполнения новых контрактов, а не замена полного
10 000-seed отчёта.

Для `calibration v0.4` focused `qa.test.ts` повторно выполнил последовательный
smoke 20 seed × 7 policies и сохранил все gates. Полный v0.4 report не
создавался и остаётся Sprint 7.

Технический walkthrough UI, раздельные рубрики причинности/интереса и
человеческий gate:
[`vertical-slice-evaluation-v0.1.md`](../../assemble-day/reports/vertical-slice-evaluation-v0.1.md).

## Facts Table

| ID   | Утверждение                                                                                                                                                                                                                                                                                                                                                                                                               | Проверка                                                                                                                                                                                                                                                                        | Статус                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| AD1  | Package не зависит от web/browser runtime                                                                                                                                                                                                                                                                                                                                                                                 | `rg -n -e "apps/web" -e "localStorage" -e "window\\." -e "document\\." packages/assemble-day-engine/src`                                                                                                                                                                        | проверено 2026-07-29: совпадений нет                                                              |
| AD2  | Реестры содержат 33 действия, 49 event templates и production-календарь из 2012 slots                                                                                                                                                                                                                                                                                                                                     | `node --import tsx -e "import('./packages/assemble-day-engine/src/content/scenario.ts').then(({registries})=>console.log(registries.slots.length,Object.keys(registries.events).length,Object.keys(registries.actions).length))"`                                               | проверено 2026-08-01: `2012 49 33`                                                                |
| AD3  | Публичный reducer проходит десять именованных стадий и atomic rollback                                                                                                                                                                                                                                                                                                                                                    | `pnpm exec vitest run --config packages/assemble-day-engine/vitest.config.ts`                                                                                                                                                                                                   | проверено 2026-07-29, reducer tests                                                               |
| AD4  | Полный D60 gate прошёл 10 000 seed × 7 policies и проверил каждый переход                                                                                                                                                                                                                                                                                                                                                 | `node -e "const s=require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation; console.log(s.seedCount,s.runCount,s.rawCounts.auditedTransitions,s.rawCounts.heavy===s.rawCounts.stabilized,Object.values(s.gates).every(g=>g.passed))"`                              | проверено 2026-07-29: `10000 70000 2660000 true true`                                             |
| AD5  | Отчёт фиксирует версии RNG/hash/schema/scenario/calibration                                                                                                                                                                                                                                                                                                                                                               | `node -e "console.log(require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation.contracts)"`                                                                                                                                                                        | проверено 2026-07-29: scenario `2`, calibration `0.2`                                             |
| AD6  | Browser-adapter проходит реальный первый reducer-step и не меняет input                                                                                                                                                                                                                                                                                                                                                   | focused web tests                                                                                                                                                                                                                                                               | проверено 2026-07-29                                                                              |
| AD7  | Envelope v2 сохраняет только compact ledger; reload replay-восстанавливает точные state/summary/trace, а missing/corrupt/foreign/privacy/incompatible snapshots и stale writes различаются и не сбрасываются молча                                                                                                                                                                                                        | focused web + storage tests                                                                                                                                                                                                                                                     | проверено 2026-07-30: 98 tests PASS                                                               |
| AD8  | До открытия карточки модуль и ресурсы игры отсутствуют; после клика запрашиваются только отдельные JS/CSS                                                                                                                                                                                                                                                                                                                 | focused web tests + isolated browser resource trace                                                                                                                                                                                                                             | проверено 2026-07-30: до клика `0/0/unregistered`, после — JS+CSS и fullscreen                    |
| AD9  | Цена, последствия, краткий итог и полный журнал используют данные reducer/registries и сохраняют причинный источник                                                                                                                                                                                                                                                                                                       | focused web tests + browser walkthrough                                                                                                                                                                                                                                         | проверено 2026-07-29                                                                              |
| AD10 | Planning-step атомарен, не двигает сценарий/RNG/queue; ровно `2/3` границы и внимание `2+1` через `calibration v0.4` меняют bounded-геометрию offers и reducer journal                                                                                                                                                                                                                                                    | `planning.test.ts` + focused web tests                                                                                                                                                                                                                                          | проверено 2026-07-30                                                                              |
| AD11 | Первое касание нельзя заменить другим вариантом; до подтверждения checkpoint отсутствует, после подтверждения сохраняется один reducer-step                                                                                                                                                                                                                                                                               | focused web test                                                                                                                                                                                                                                                                | проверено 2026-07-29                                                                              |
| AD12 | Готовая порция и готовка различаются по цене; контекстная надбавка возникает только в сжатом утре, journal называет входной фактор, а regression `qa-00129/random_valid` не остаётся без стабилизирующего пути                                                                                                                                                                                                            | focused reducer/web tests + `causal-qa-v0.2.json`                                                                                                                                                                                                                               | проверено 2026-07-29                                                                              |
| AD13 | Checkpoint v3 хранит bounded full-state anchor и компактный хвост подтверждённых решений; trace воспроизводит полные engine-стадии и совпадает с state hash. Legacy v1 мигрирует, а v2 и несовместимый technical contract получают явный статус без молчаливого сброса                                                                                                                                                    | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage`                                                                                                                                                                                | проверено 2026-08-01: focused web tests PASS                                                      |
| AD14 | План реально меняет offer geometry, после первого действия заблокирован, а active echo event сохраняется и отклоняет stale canonical event                                                                                                                                                                                                                                                                                | `planning.test.ts` + `reducer.test.ts`                                                                                                                                                                                                                                          | проверено 2026-07-29                                                                              |
| AD15 | UI показывает известные последствия до касания, отдельный result beat, четыре оси, развитие, grouped journal и same-seed replay                                                                                                                                                                                                                                                                                           | `planning-game-assemble-day.test.js` + browser smoke                                                                                                                                                                                                                            | проверено 2026-07-30: 390×844 и 1440×900, reload/resume, exit/focus, console errors `0`           |
| AD16 | D8 открыт, а registry v0.2 не выдаёт ни одну строку за экспертно рассмотренную                                                                                                                                                                                                                                                                                                                                            | `rg -n -e 'D8 .*Открыто' -e 'Rule-evidence registry v0.2' -e 'reviewed.*запрещён' docs/assemble-day/{10_DECISION_REGISTER.md,09_CALIBRATION_QA.md}`                                                                                                                             | проверено 2026-07-30: `D8=Открыто`, reviewed rows отсутствуют                                     |
| AD17 | Канонический current route одинаков: Sprint 12 принят; Sprint 24 `FULL QA PENDING`, Sprint 25 не начат                                                                                                                                                                                                                                                                                                                    | `rg -n -e 'Sprint 12' -e 'FULL QA PENDING' -e 'Sprint 25' docs/assemble-day/{README.md,HANDOFF_FOR_IMPLEMENTER.md,assemble_prodution_megaplan.md}`                                                                                                                              | проверено 2026-08-01                                                                              |
| AD18 | Full causal QA v0.4 отсутствует; полный последний report относится к v0.2                                                                                                                                                                                                                                                                                                                                                 | `test ! -e docs/assemble-day/reports/causal-qa-v0.4.json && node -e "console.log(require('./docs/assemble-day/reports/causal-qa-v0.2.json').simulation.contracts.calibrationVersion)"`                                                                                          | проверено 2026-07-30: absent; `0.2`                                                               |
| AD19 | Browser создаёт UUID-free opaque seed; UUID клиента отсутствует в state/campaignId/RNG/ledger/trace, а raw clientId используется только для scope-tag и `HEYS.store` boundary                                                                                                                                                                                                                                             | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage` + `rg -n -e 'clientId.*createSession' -e 'createSession.*clientId' apps/web/assemble-day/heys_assemble_day_game_v1.ts`                                                         | проверено 2026-07-30: privacy regression и source scan PASS                                       |
| AD20 | Month/year outcome реализован; longitudinal value и replay value/diversity остаются hypothesis                                                                                                                                                                                                                                                                                                                            | `rg -n -e 'year' -e 'H23' -e 'H31' docs/assemble-day/{README.md,10_DECISION_REGISTER.md,11_HYPOTHESES_BACKLOG.md,12_ROADMAP.md}`                                                                                                                                                | проверено 2026-08-01                                                                              |
| AD21 | Полный недельный checkpoint имеет минимум 480 KiB запаса до внешнего лимита 512 KiB и остаётся ниже внутреннего hard cap 128 KiB; reload даёт точное равенство state/summary/ledger                                                                                                                                                                                                                                       | `pnpm --dir apps/web exec vitest run __tests__/planning-game-assemble-day.test.js --no-coverage`                                                                                                                                                                                | проверено 2026-07-30                                                                              |
| AD22 | Planning не выводит фокус из broad action domains: schema v2 требует authored supports/conflicts, event tags владеют окнами, а counterfactual показывает и помощь, и цену                                                                                                                                                                                                                                                 | `pnpm exec vitest run --config packages/assemble-day-engine/vitest.config.ts packages/assemble-day-engine/src/__tests__/planning.test.ts packages/assemble-day-engine/src/__tests__/contracts.test.ts packages/assemble-day-engine/src/__tests__/reducer.test.ts --no-coverage` | проверено 2026-07-30: 32/32 PASS                                                                  |
| AD23 | Brief строится из initial scenario; семь day + один week boundary выводятся из authored slots; summaries идемпотентны/replay-derived, а финал содержит rules/commitments/pressure/axes/openThreads без raw 0–100                                                                                                                                                                                                          | `campaign.test.ts` + `planning-game-assemble-day.test.js`                                                                                                                                                                                                                       | проверено 2026-07-30: engine 4/4, web 14/14 PASS                                                  |
| AD24 | Development projection показывает только professional/cooking/reciprocal-support; каждый элемент имеет downstream counterfactual, а decorative habits/capabilities остаются history/trace                                                                                                                                                                                                                                 | `campaign.test.ts` + `reducer.test.ts` + `campaign.ts`                                                                                                                                                                                                                          | проверено 2026-07-30: neutral directions и offer/event counterfactuals PASS                       |
| AD25 | Event/action presentation, human unavailable/consequence copy и rule evidence принадлежат engine; UI не держит дублирующий словарь, human history не показывает raw paths/deltas, decision/planning radios и result focus имеют focused regressions                                                                                                                                                                       | `contracts.test.ts` + `reducer.test.ts` + `planning-game-assemble-day.test.js` + browser smoke                                                                                                                                                                                  | проверено 2026-07-30: engine `38/38`, web `14/14`; runtime smoke ниже                             |
| AD26 | Pocket Retro character scene получает pose/expression/load/dayPhase, три qualitative labels и максимум две причины из чистого `CharacterPresentation`; UI не содержит порогов `38/67`, PNG/remote assets или visual loop, first-touch не меняет frame, reload восстанавливает ту же projection                                                                                                                            | `presentation.test.ts` + `planning-game-assemble-day.test.js` + `planning-games-ui.test.js` + browser smoke                                                                                                                                                                     | проверено 2026-07-30: engine counterfactuals и web/lazy regressions PASS                          |
| AD27 | Место действия — пятая ось `frame.place` (`bedroom`/`kitchen`/`commute`/`work`/`living`): выводится из `activeEventId` по таблице контента, при незнакомом или пустом событии падает на место по фазе дня и не зависит от энергии/настроения/напряжения. Сцена — панорама 180×48 при прежнем масштабе 2× и прежней высоте 96 px; обстановка рисуется вокруг одного спрайта персонажа, анимации перехода между местами нет | `presentation.test.ts` + `planning-game-assemble-day.test.js`                                                                                                                                                                                                                   | проверено 2026-08-01: engine 5/5, web 17/17; все пять мест 28–48 примитивов из 80                 |
| AD28 | Bounded-state contract v0.37 заменяет растущие ledger/period snapshots компактными дайджестами и чистит завершённые event-selection RNG/day-load хвосты на границе дня; 112-дневный state не больше 30-дневного, budget и QA-пороги не менялись                                                                                                                                                                           | `pnpm --filter @heys/assemble-day-engine measure:sprint-24-growth` + focused engine/profile tests                                                                                                                                                                               | проверено 2026-08-01: 59 516 → 59 294 UTF-16 байта; browser max 77 616                            |
| AD29 | Sprint 24 block 3 реализует 336 дней, одну годовую границу и существующую карточку годового итога; точечные variability/critical-hunger gates проходят, полный профиль current source pending                                                                                                                                                                                                                             | focused engine tests + `reports/sprint-24-implementation-protocol.md`                                                                                                                                                                                                           | проверено 2026-08-01: targeted PASS; full QA остановлен из-за локальной нагрузки                  |
| AD30 | Локальный QA разделён на 112-дневный smoke и полный 336-дневный профиль; runner последовательный и возобновляемый по fingerprint-bound checkpoint, а variability входит в `report.passed`. Смена process priority best-effort; гарантированный limiter — `--max-new=N`                                                                                                                                                    | `pnpm --filter @heys/assemble-day-engine qa:smoke` + pause/resume через `--max-new=1` + focused `qa-profile.test.ts` + direct `setPriority` probe                                                                                                                               | проверено 2026-08-01: smoke 27,37 с, 3/3, 0 нарушений; resume 1/3 → 3/3; sandbox priority `EPERM` |
| AD31 | Пакетный Vitest не дублирует полный QA: локальные reducer/profile fixtures ограничены 7–14 днями, historical harness — 3 днями с явным `horizonDays`; один fork ограничивает пик CPU. Неполный `--max-new` возвращает 75, а последний элемент пишет отчёт сразу                                                                                                                                                           | `pnpm --filter @heys/assemble-day-engine test` + `src/__tests__/{reducer,qa-profile,qa}.test.ts`                                                                                                                                                                                | проверено 2026-08-01: 11/11 файлов, 76/76 тестов, 66,75 с, RPC timeout нет                        |
