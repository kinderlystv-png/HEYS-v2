# Извлечение общего ядра тренировочных режимов — анализ и план

Версия 0.2 · Июнь 2026

**Namespace ядра:** `HEYS.TrainingKernel.*` (логика) рядом с
`HEYS.TrainingFocus` (UI-примитивы). Оба бандлера (`bundle-fingers.cjs`,
`bundle-mobility.cjs`) грузят kernel-модули из `apps/web/_kernel/` первыми.

**Статус извлечения:**

- ✅ **`heys_training_focus_ui_v1.js` — общий UI-примитив focus-режима**
  (использует и Fingers, и Mobility). Вынесены `Header`, `Tabs`, `EquipmentBar`,
  `GoalSelector`, `ReadinessCard`, `RegistryGrid`, `Registry`; общий `Registry`
  теперь включает поиск по id/title/meta/chips и selected actions. Mobility
  использует полный `Registry`, Fingers — общий `RegistryGrid` внутри своего
  расширенного реестра. Поменяешь базовую сетку / карточку / search в ядре →
  режимы получают это через общий компонент.
- ✅ **`heys_kernel_bibliography_ui_v1.js` — ОБЩИЙ UI библиографии
  (SourceBadge + BibliographyModal), data-driven (classPrefix/лейблы/sources
  через props).** Оба режима рендерят ОДНУ модалку «Источники и методология»:
  пальцы — байт-в-байт как раньше (verified react-dom/server), мобильность — тот
  же экран с 21 обогащённым источником. Данные/EFFECT_MAP/лейблы — доменные.
  Поменяешь вид в ядре → у обоих.
- ✅ **`heys_kernel_bibliography_v1.js` — реестр источников (ПИЛОТ, сделан).**
  `createRegistry(items)` (data-agnostic); оба домена строят реестр из своих
  данных и сохраняют публичные API (`Fingers.getSourceById`,
  `Mobility.bibliography.getSource/resolveSources/missingSources`). Данные,
  EFFECT_MAP и UI (SourceBadge/Modal) остались доменными. Mobility — строго
  (throws без ядра), Fingers (прод) — с fail-safe. Verified: node-harness
  17/17 + тесты `kernel-bibliography` / `mobility-bibliography` обновлены.
- ✅ **`heys_kernel_stats_v1.js` — robust-статистика (median / MAD-σ /
  robustZ).** Дубль `readiness`-математики вынесен: пальцы (median/madSigma) и
  мобильность (hrvZ через robustZ+MAD_SCALE) зовут ядро; доменные
  сигналы/пороги/advisory остались. Verified: equivalence-harness 25/25,
  `fingers.readiness.assess` и `mobility.readiness.score` идентичны (kernel vs
  fallback). Прод-safety: fallback.
- ✅ **`heys_kernel_catalog_v1.js` — индекс каталога (id + группировки).**
  `createIndex(items,{idKey,groupBy})`. Пальцы (`block_catalog`: getAtom/
  atomsByBlock/atomsByQuality + atomIds-backfill по blockId/quality) и
  мобильность (`atom_catalog`: getAtom/byBlock/byAxis/byPurpose по
  block/axis/purpose) зовут ядро; validate/validateAtom (схемы) — доменные.
  Verified: equivalence 9/9 (kernel vs fallback идентично). Прод-safety:
  fallback.
- ✅ **`heys_kernel_assess_v1.js` — математика оценки.** Единой сделана
  **формула дефицита** §3.1 (зовут оба: `computeDeficit` / `scoreMeasurement`).
  `normalize`/ `argmaxKey` — утилиты ядра, но домены ПОКА считают
  leadingLimiter/blockWeights локально (нюанс пальцев: при total=0 веса
  равномерны 1/N) — не вотвайрим, чтобы не менять поведение. Verified:
  equivalence 8/8. Прод-safety: fallback.
- 🛠 **Фикс прод-бага (catalog):** `validate()` пальцев читал локальный
  `ATOMS_BY_BLOCK` (пуст при активном kernel) → теперь через `atomsByBlock()`.
  Добавлены **прод-порядк-тесты** (kernel → домен):
  `fingers-block-catalog-kernel`, `kernel-integration` (stats+assess+catalog,
  оба домена) — kernel-ветка реально прогоняется в vitest (закрыто слепое пятно
  «тесты грузили без kernel»).
- ✅ **`heys_kernel_gate_v1.js` — validator-framework.** Вынесены Issue
  constructors (`ok/warn/err`), S1 level/age gate, S3 warmup-required каркас с
  доменными hooks, простые token-gates (`equipmentGate`, `prerequisitesGate`),
  `runRules` и `nonOk`. Оба домена делегируют S1 (набор уровней инъектируется: 3
  у мобильности / 4 c elite у пальцев); mobility `runAtom/runSession` и fingers
  `runAll` идут через общий rule-runner. `S3_warmupRequired` у обоих режимов
  теперь kernel-first: ядро проверяет общий flow, а домены передают
  `isIntensive/items/warmupDone` и свои коды (`S3.no_warmup` vs
  `S3.warmup_missing`). Mobility `E_equipmentGate` и Fingers
  `S9_prerequisitesGate` тоже kernel-first с локальным фолбэком; коды/тексты
  сохранены для существующего UI/тестов. Остальные S-правила остаются доменными
  (ткань/боль/популяция/МФР — методология различается). Прод-safety: fallback.
- ✅ **`heys_kernel_records_v1.js` — нижний storage-слой records.** Вынесены
  client-scoped key builder (colon / `heys_<cid>_...` стили), safe JSON
  read/write, memory storage для тестов, capped/windowed append + recent-window
  для историй, append/latest для именованных history-полей, stable `makeId`,
  generic `maxWins` для PR-сравнений, а также time-series helpers
  (`timestampFrom`, `sortByTimestamp`, `mapTimeSeries`, `selectSeries`) для
  истории измерений. Мобильность (`recordsStore`) и пальцы (`records`) зовут
  ядро для storage/key/cap; пальцы используют `maxWins` для MVC PR и общий
  windowed-history для `edgeHistory`/`tissueHistory`; MVC progression series и
  выбор canonical/longest history тоже идут через generic time-series helpers.
  Мобильность — `makeId` для ids, общий append/latest для
  `sessions/assessments/painFlags` и kernel-sort для ROM assessment series.
  Fingers progression-history использует общий `runner.estimateDoseSec` executor
  для domain-owned dose-value формул. Доменные semantics (MVC value mapping,
  ROM/audit/session shape, assessment battery, FDP/FDS/tissue extraction)
  остаются в режимах. Прод-safety: fallback.
- ✅ **`heys_kernel_onboarding_v1.js` — onboarding/profile primitives.**
  Вынесены `uniqueKnown`, `enumValue`, `numberValue`, `booleanValue`,
  `ageFromBirthDate` и schema-driven `normalizeProfile`. Мобильность делегирует
  полную `normalizeProfile` в ядро, передавая свои
  `LEVELS/POPULATIONS/EQUIPMENT/GOALS`; пальцы используют ядро для age prefill
  из `heys_profile.birthDate` и нормализации legacy theme. React wizard,
  рекомендации программ, disclaimers и mode mapping остаются доменными.
  Прод-safety: fallback.
- ✅ **`heys_kernel_dates_v1.js` — date-key слой и day arithmetic.** Вынесены
  `dateKeyUTC`, `dateKeyLocal`, `todayKeyLocal`, `addDays`, `dayLabel`,
  `sequenceDays`, `daysBetweenDateKeys`. Важно: ядро НЕ смешивает UTC/local —
  мобильность сохраняет прежние UTC ISO-дни в weekly planner, пальцы сохраняют
  local day-keys для дневника/календаря/periodization. Cooldown/режимы недели
  остаются доменными; ядро только даёт последовательность дней. Прод-safety:
  fallback.
- ✅ **`heys_kernel_calendar_v1.js` — calendar/grid primitives.** Вынесены
  `buildDays`, `monthCells`, `yearGrid` и thin wrappers над date-key/day-label.
  Мобильность делегирует 7-дневный weekly planner grid в ядро, сохраняя доменные
  `modeId/focus/retest`; пальцы делегируют month grid и 53×7 Monday-first
  heatmap grid в ядро, сохраняя extraction sessions/cooldown/цвета/UI.
  Прод-safety: fallback.
- ✅ **`heys_kernel_periodization_v1.js` — phase-machine периодизации.**
  Вынесены `PHASE_META`, `phaseForModel`, `energyFocusForPhase`, `buildWeeks`,
  `current`, `loadPolicy`. Пальцы делегируют построение недель/current/phase в
  ядро; мобильность делегирует phase→load policy (`peak/keyLoad`→maintain,
  `deload`→deload, base→develop) с доменными текстами. Выбор модели,
  slot-templates и доменные ограничения остаются в режимах. Прод-safety:
  fallback.
- ✅ **`heys_kernel_progression_v1.js` — progression primitives.** Вынесены
  `relativePlateau` (серия `{ts,value}` → plateau/deltaPct), `rangePlateau`
  (окно ROM/values → plateau) и `nextAxis(policy,currentAxis)`. Пальцы
  делегируют `detectPlateau` и axis-advance в ядро, передавая свой
  `PROGRESSION_POLICY`; мобильность делегирует ROM plateau и axis-advance,
  передавая свой `AXIS_ORDER`. Доменные пороги/оси/semantics остаются в режимах.
  Прод-safety: fallback.
- ✅ **`heys_kernel_session_v1.js` — builder-kit для session/routine builders.**
  Вынесены `cloneJson`, `uniq`, `hasIssueLevel`, `issueCodes`, `seededNoise`,
  `rotateBySeed`, `stableSortByScore`, `sortByScoreThenKey`, `firstPassing`,
  `rankCandidates` (filters → issues → blockIssue → score → stable/key sort).
  Мобильность использует ядро для clone/uniq/score-priority/seed noise и полного
  candidate pipeline в `routine_builder`; пальцы — для `variantSeed` rotation,
  методологических reorder pass (aerobic submode + FDP/FDS edge rotation),
  error-level checks и first-safe candidate selection внутри slot-fill. Slot
  maps, scoring, safety floors, dose materialization остаются доменными.
  Прод-safety: fallback.
- ✅ **`heys_kernel_runner_v1.js` — runner lifecycle + owner-lock.** Вынесены
  `createLinearState`, `transitionLinear`, `totalStepsOf` для пошаговых планов и
  generic owner-lock (`createOwnerLock`, TTL heartbeat, acquire/touch/release)
  для активных runner/timer экранов, а также cyclic phase-plan
  (`buildCyclicPhasePlan`) для дыхательных/интервальных плееров и
  `remainingSecFromSnapshot` для восстановления активной фазы после reload,
  `estimateStepsDurationSec/createRunPlan` для materialized run plans, а также
  `estimateDoseSec` с общими `num/avg` helpers для domain-owned doseShape формул
  и `estimateDoseMetrics/scaleMetrics` для общего исполнения domain-owned
  doseShape metric formulas (`durationSec/workSec/units`) плюс
  `summarizeMetrics` для суммирования списка упражнений без доменных подписей.
  Мобильность (`routineRunner`, `breathRunner`) делегирует lifecycle и расчёт
  `cycleSec/cycles`, `totalSteps/estimatedDurationSec` в ядро; пальцевый
  session-builder делегирует исполнение формул длительности/TUT в ядро
  (`DURATION_FORMULAS`/`TUT_FORMULAS` остаются climbing-data), session UI
  делегирует расчёт planned/partial exercise metrics в ядро через локальные
  `PLANNED_METRIC_FORMULAS` и сводку `duration/work/units` через
  `summarizeMetrics`, countdown использует общий owner-lock и общий расчёт
  remaining-sec из snapshot, но state-graph hang/reps/wake/snapshot/cues
  остаётся доменным до отдельного контракта. Прод-safety: fallback.
- ✅ **`heys_kernel_router_v1.js` — strangler-router primitives.** Вынесены
  generic telemetry, old/new/fallback routing, contract fallback, shadow-compare
  counters и rollout gate. Fingers `engineRouter` теперь kernel-first делегирует
  общий маршрут в ядро; domain-enrichment (MVC/level/history/planner), contract
  predicate и shadow-diff/danger budget остаются в пальцах как hook'и. Mobility
  пока не имеет strangler-роутера, но будущие режимы получают тот же каркас.
  Прод-safety: fallback.
- 📝 **progression — НЕ выносим как общий доменный движок:** общий только
  primitive-слой (`relativePlateau`, `rangePlateau`, `nextAxis`). Полные
  политики отличаются по методологии (ROM-диапазон у мобильности vs
  strength-дельта% у пальцев) и оси перегрузки разные → это легитимное доменное
  отличие, шарить нельзя.
- ⬜ остаётся (тяжёлые stateful/прод — отдельными верифицированными проходами +
  пересборка/QA): abstract lift-id/records merge policies, fingers timer
  state-graph (hang/reps/wake/snapshot/cues), session_builder advanced
  slot-fill/scoring, calendar UI, UI-примитивы.

## Ревью-фиксы (2026-06-14, глубокий аудит)

После полного аудита выноса (бандлеры, порядок загрузки, equivalence
kernel↔fallback, sync-скоупинг ключей, матрица покрытия) закрыты:

- **P0 cross-client (mobility records):** ключ переведён на канон
  `heys_<cid>_mobility_records_v1` (был colon `…v1:default` — не матчил
  `CLIENT_SCOPED_KEY_RE`, не чистился при смене клиента, общий `default`-бакет
  при незаданном clientId). Дефолт clientId → `HEYS.currentClientId`, не
  `'default'`. UI убрал `|| 'default'`. (Инвариант #4/#9.)
- **P0 `periodization.loadPolicy`:** добавлен `typeof number` guard — `null`/
  `undefined` больше не приводятся к 0 и не триггерят ложный `maintain`
  (`keyLoadWithinHours: null` из props). Магическое 48 →
  `PEAK_LOAD_WINDOW_HOURS`. Числовой 0 (нагрузка сейчас) корректно → `maintain`.
- **P1 equivalence-тест тяжёлых путей пальцев:**
  `__tests__/fingers-engine-equivalence.test.js` строит домен С ядром и БЕЗ и
  сверяет байт-в-байт `periodization.buildPlan/current`,
  `progression.detectPlateau`, `sessionBuilder.recommendDay`,
  `engineRouter.recommendDay`, `isValidSession`. Node-харнесс: 6/6 identical.
- **P1/P2 доки:** `dates.daysBetweenDateKeys` помечен local-only (не смешивать с
  UTC-ключами); `mode_engine` — почему mobility без макро-периодизации;
  `session_builder` — контракт `recommendDay(opts)→Session|null` для router.

Подтверждено хорошим (аудит): оба бандлера грузят все 16 kernel-модулей
kernel-first, `dates` раньше `calendar`/`periodization`; идемпотентность везде;
climbing-специфики в ядре нет; records читает один явный ключ (не сканирует LS).

**Осталось (extraction-долг, не баги):** DI до конца (пальцы records ещё читают
глобальный `currentClientId`), `SPORT_CONFIG` как единый регистрируемый
контракт; abstract lift-id + records merge-policy; timer state-graph пальцев;
advanced slot-fill/scoring; calendar UI и UI-примитивы; в `assess`
`leadingLimiter`/`blockWeights` ещё локальны.

**Итог:** «листовые» общие механизмы вынесены (15 kernel-модулей: bibliography
реестр+UI, stats, dates, calendar-grid, periodization, progression-primitives,
session-kit, runner-lifecycle, router, catalog, assess, gate, records-storage,
onboarding-primitives). Дальше — крупные stateful-движки, их делаем по одному с
пересборкой и визуальным QA в проде между шагами.

Цель: одно **переиспользуемое ядро** (движок) + разная **начинка/методология**
на домен, чтобы правка в одном месте меняла поведение всех режимов (пальцы,
мобильность, и будущие — плавание/силовой/бег/армрестлинг). Правило-основание —
CLAUDE.md/AGENTS.md «Архитектура тренировочных режимов: ядро + контент».

---

## 1. Текущее состояние (честно): общего кода ≈ ноль

Режим мобильности собран как **параллельная копия** модулей пальцев, а не на
общем ядре. Доказательства:

- Два namespace: `HEYS.Fingers.*` и `HEYS.Mobility.*` — полностью раздельные.
- `validators` дублирован (оба несут свои `ok/warn/err` + gate-runner + S1/S3).
- `readiness` дублирован (median/MAD у пальцев — своя реализация у мобильности).
- `assessment` (deficit×levelPrior→лимитер), `records_store`
  (PR/история/persist), `bibliography` (sourceId→ref), `session-builder`,
  `periodization/mode`, `progression`, `timer/runner`, UI-примитивы — у каждого
  домена своя копия.
- Нет каталога `apps/web/_kernel/` и общего пакета. Общее только
  **концептуально**: контракт `SPORT_CONFIG` (fingers CONSTRUCTOR_SPEC §4) и
  11-частная структура методологии.

**Вывод:** мы на стадии «две реф-реализации против одного контракта». Это ровно
та точка (правило двух/трёх), когда извлечение ядра оправдано и безопасно —
форма общего видна на двух доменах, climbing-допущения уже не забетонируются.

---

## 2. Сводная таблица: что переиспользуемо, что нет, и куда должно лечь

Колонки: **Способность** · **Пальцы** · **Мобильность** · **Сейчас общее?** (❌
дубль · ⚠️ частично · ✅) · **Generic-ядро (один источник)** · **Доменная часть
(данные/тонкий код)** · **Целевой слой**.

| Способность                       | Пальцы                                 | Мобильность                      |  Сейчас  | Generic-ядро                                                                                  | Доменное                                 | Цель                                            |
| --------------------------------- | -------------------------------------- | -------------------------------- | :------: | --------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Каталог осей/качеств              | `quality_catalog`                      | `axis_catalog`                   |    ❌    | enum-валидация, `inEnum`, форма                                                               | список осей+лейблы                       | Ядро(валидатор)+Контент                         |
| Каталог атомов                    | `block_catalog`                        | `atom_catalog`                   |    ❌    | `getAtom/byX`, `validateAtom` по схеме                                                        | сами атомы                               | Ядро(API+схема)+Контент                         |
| Валидаторы безопасности           | `validators`                           | `validators`                     |    ❌    | fail-closed gate-runner, `ok/warn/err`, S1 уровень/возраст, S3 разминка, `runAtom/runSession` | S2 ткань/боль, S4/S6 доменные правила    | Ядро(framework+общие S)+Контент(правила-данные) |
| Гейтинг уровня/возраста/популяции | `age_gating`                           | `onboarding`+S1/S4               |    ❌    | порядок уровней, fail-closed                                                                  | пороги/популяции                         | Ядро                                            |
| Сборка сессии                     | `mix_engine`/`session_builder`         | `routine_builder`                |    ❌    | slot-fill, gate-filter, лимитер-приоритет, hybrid (replace/extra/exclude), порядок блоков     | slot-map, модальности                    | Ядро(framework)+Контент(slot-map)               |
| Периодизация                      | `periodization_engine`                 | `mode_engine`                    |    ⚠️    | макро/мезо/deload/taper/maintain, phase-clamp                                                 | модели/шаблоны/режимы                    | Ядро(машинерия)+Контент(шаблоны)                |
| Прогрессия                        | `progression`                          | `progression`                    |    ❌    | плато-детект, оси перегрузки, switch-on-plateau                                               | policy осей                              | Ядро(framework)+Контент(policy)                 |
| Лимитер/оценка                    | `assessment`                           | `assessment`                     |    ❌    | scoring `deficit×levelPrior→веса блоков`                                                      | нормы/тесты/бенчмарки, тип-классификатор | Ядро(алгоритм)+Контент(нормы)                   |
| Readiness                         | `readiness`                            | `readiness`                      |    ❌    | median/MAD/z-score, band                                                                      | сигналы/окна домена                      | Ядро(математика)+Контент(сигналы)               |
| Records/история                   | `records_store`                        | `records_store`                  |    ❌    | client-scoped store, PR-detect, история, persist (DI)                                         | lift-identifier (grip+edge ↔ joint)     | Ядро(store+abstract-id)+Тонкий-домен(id-mapper) |
| Bibliography                      | `bibliography`                         | `bibliography`                   |    ❌    | реестр + `doseConfidence`-механизм                                                            | записи источников                        | Ядро(механизм)+Контент(записи)                  |
| Таймер/runner-shell               | `timer`+`warmup_runner`+UI-shell       | `routine_runner`+`breath_runner` |    ❌    | state-machine таймера, RPE/боль/abort lifecycle, runner-shell                                 | плееры (вис ↔ дыхание/гония/темп)       | Ядро(shell+timer)+Тонкий-домен(плееры)          |
| Strangler-роутер/флаги            | `engine_router`                        | — (`entry`)                      |   n/a    | strangler, contract-gate, fallback, shadow-compare                                            | —                                        | Ядро                                            |
| UI-примитивы                      | `session_ui` (chips/SourceBadge/trace) | `ui`                             |    ❌    | chip/badge/trace/reason, runner-shell UI                                                      | доменные экраны/визуализации             | Ядро(примитивы)+Тонкий-домен(экраны)            |
| Календарь/ретест                  | `calendar`                             | `calendar`                       |    ❌    | ретест-напоминание, week-plan                                                                 | —                                        | Ядро                                            |
| Онбординг                         | profile-поля                           | `onboarding`                     |    ⚠️    | сбор входов→профиль→гейты                                                                     | схема входов/режимы                      | Ядро(framework)+Контент(схема)                  |
| Контракт переносимости            | CONSTRUCTOR_SPEC §4                    | §4 (instance)                    | ✅(идея) | контракт `SPORT_CONFIG`                                                                       | конфиг per-domain                        | Контракт ядра                                   |

**Итог таблицы:** почти всё — ❌ дубль. По-настоящему общего кода нет; общий
пока только контракт-идея. То есть «менять в одном месте» сегодня недостижимо —
это и есть то, что чувствует пользователь.

---

## 3. Целевая модель (как должно быть)

```
apps/web/_kernel/            // ОДИН источник логики (HEYS.Kernel.*)
  validators/      gate-runner + общие S-правила
  session_builder/ slot-fill/gate/priority/hybrid/order
  periodization/   макро/мезо/deload/taper/maintenance
  progression/     плато/оси/switch
  assessment/      scoring deficit×levelPrior→веса
  readiness/       median/MAD/z-score
  records/         store + abstract lift-id (DI persist)
  bibliography/    реестр + doseConfidence
  runner/          timer state-machine + shell + RPE/pain/abort
  router/          strangler + contract-gate + fallback
  catalog/         API getAtom/byX + validate по схеме атома
  onboarding/      сбор входов→профиль→гейты
  ui/              примитивы (chip/badge/trace/runner-shell)
  contracts.d      схема атома, SPORT_CONFIG, validator-hook, assessment-iface,
                   periodization-template, lift-identifier, runner-phase-config

apps/web/fingers/  // ТОЛЬКО: SPORT_CONFIG + каталоги(данные) + тонкие плееры (вис) + climbing-UI
apps/web/mobility/ // ТОЛЬКО: SPORT_CONFIG + каталоги(данные) + тонкие плееры (дыхание/гония) + mobility-UI
```

Ядро **не знает** про grip/edge/jointRegion/cyclic_sigh — читает их из
`SPORT_CONFIG` и каталогов-данных. Домен регистрирует свой конфиг и зовёт ядро.

**Dependency injection (несущее).** Сейчас всё висит на `HEYS.Fingers`/
`HEYS.Mobility` + `currentClientId` + localStorage. Ядро должно принимать
контекст (клиент, хранилище, конфиг) **аргументами**, а не хардкодить namespace.
Это условие, без него вынести нельзя.

**Канонический словарь** (свести при выносе, из CONSTRUCTOR_SPEC §5):
`quality_catalog↔axis_catalog`→`catalog`, `mix_engine↔routine_builder`→
`session_builder`, `age_gating↔population_gating`→`gating`; `targetStimulus`
расширить до супермножества `{prep,develop,maintain,recover,regulate}`;
`autonomic` сделать опц. generic-осью; `primaryAxis` pluggable (energySystem ↔
purpose).

---

## 4. Порядок извлечения (strangler, по приоритету: дубль×низкая связанность)

Извлекаем по одному модулю, переключаем оба домена на ядро, держим тесты
зелёными. Очередь от безопасного к тяжёлому:

1. **bibliography** (чистый реестр, 0 связанности) — пилот: доказать паттерн
   «ядро+данные».
2. **readiness-математика** (median/MAD/z) — generic, сигналы=данные.
3. **catalog API + схема атома** (`getAtom/byX/validate`) — данные остаются в
   домене.
4. **validator-framework** (gate-runner + S1/S3 + `runAtom/runSession`);
   доменные S-правила (S2/S4/S6) — как hook'и/данные.
5. **assessment-scoring** (deficit×levelPrior→веса); нормы/тесты — данные.
6. **records-core** (store/PR/история) + abstract lift-id; id-mapper — в домене.
7. **runner-shell + timer state-machine**; плееры — в домене.
8. **session_builder framework** (slot/gate/priority/hybrid/order); slot-map —
   данные.
9. **periodization-машинерия** + **progression-framework**; шаблоны/policy —
   данные.
10. **router/strangler**, **onboarding-framework**, **UI-примитивы**,
    **calendar**.

После каждого шага: оба домена зовут ядро, прогон тестов обоих режимов
(regression для пальцев — они в проде, ломать нельзя).

---

## 5. Риски

- **Пальцы в проде** — извлечение не должно менять их поведение. Каждый шаг — за
  контрактом + shadow/тесты; начинать с leaf-модулей (bibliography, readiness).
- **DI-рефактор** namespace/storage/clientId — самый трудоёмкий, но
  обязательный.
- **Не абстрагировать из одного примера** — теперь не риск: два домена есть.
- **Объём** — это многошаговый рефактор, не один заход. Дёшево окупается с 3-го
  домена (плавание/силовой и т.д.).

---

_Документ — анализ и план. Реализация извлечения — отдельными согласованными
шагами (см. очередь §4), по явной команде; начинать с пилота bibliography._
