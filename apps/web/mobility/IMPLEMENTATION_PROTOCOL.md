# Протокол реализации — режим мобильности (для ревью)

Кодер-режим. Источники: `methodology/METHODOLOGY.md` (v0.5),
`methodology/IMPLEMENTATION_MAP.md` (v0.4), `methodology/CONSTRUCTOR_SPEC.md`
(v0.1). Правило: полный релиз без MVP; строим против контрактов ядра
(`SPORT_CONFIG`); коммит/бандл/пуш — только по явной команде.

## Очередь сборки (из карты)

CONSTRUCTOR_SPEC ✅ → [1] safety (S1–S9) + enums → [2] каталог атомов (данные) →
[3] routine_builder/mode_engine → [4] runners → [5] assessment+онбординг → [6]
readiness/records/progression.

## Сводка текущей реализации

| Шаг                                                                                                       | Файл                                                                                                                                                                  | Статус |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 axis_catalog (9 осей + ENUM §1.2/§1.3 + validate)                                                     | `heys_mobility_axis_catalog_v1.js`                                                                                                                                    | ✅     |
| 1.2 validators S1–S9 + R1 + equipment-gate + runAtom/runSession                                           | `heys_mobility_validators_v1.js`                                                                                                                                      | ✅     |
| 1.3 atom_catalog (все блоки A–J, 29 атомов + API + validateAtom + content cards)                          | `heys_mobility_atom_catalog_v1.js`                                                                                                                                    | ✅     |
| 1.4 тесты безопасности (S1–S9, fail-closed)                                                               | `__tests__/mobility-validators.test.js`                                                                                                                               | ✅     |
| 1.5 тесты каталога (enum-валидность, гейты, doseConfidence)                                               | `__tests__/mobility-catalog.test.js`                                                                                                                                  | ✅     |
| 2.1 mode_engine (7 режимов + circadian/CWI/periodization advisory)                                        | `heys_mobility_mode_engine_v1.js`                                                                                                                                     | ✅     |
| 2.2 routine_builder (hybrid auto + manual edits через safety + limiter blockWeights + periodization gate) | `heys_mobility_routine_builder_v1.js`                                                                                                                                 | ✅     |
| 2.3 builder tests                                                                                         | `__tests__/mobility-builder.test.js`                                                                                                                                  | ✅     |
| 3.1 breath_runner                                                                                         | `heys_mobility_breath_runner_v1.js`                                                                                                                                   | ✅     |
| 3.2 routine_runner (hold/reps/flow/PNF/eccentric/CARs/SMR/breath lifecycle)                               | `heys_mobility_routine_runner_v1.js`                                                                                                                                  | ✅     |
| 3.3 runner tests                                                                                          | `__tests__/mobility-runner.test.js`                                                                                                                                   | ✅     |
| 4.1 assessment (ROM norms, limiter audit, retest)                                                         | `heys_mobility_assessment_v1.js`                                                                                                                                      | ✅     |
| 4.2 onboarding (profile normalization + population-aware mode recommendation)                             | `heys_mobility_onboarding_v1.js`                                                                                                                                      | ✅     |
| 4.3 readiness (HRV/subj advisory, non-blocking)                                                           | `heys_mobility_readiness_v1.js`                                                                                                                                       | ✅     |
| 4.4 assessment/readiness tests                                                                            | `__tests__/mobility-assessment-readiness.test.js`                                                                                                                     | ✅     |
| 5.1 bibliography + honest effect map                                                                      | `heys_mobility_bibliography_v1.js`                                                                                                                                    | ✅     |
| 5.2 bibliography tests                                                                                    | `__tests__/mobility-bibliography.test.js`                                                                                                                             | ✅     |
| 6.1 records store (client-scoped, injected storage)                                                       | `heys_mobility_records_store_v1.js`                                                                                                                                   | ✅     |
| 6.2 progression (MED, plateau axis switch, pain regress)                                                  | `heys_mobility_progression_v1.js`                                                                                                                                     | ✅     |
| 6.3 weekly calendar planner (phase/desk/retest)                                                           | `heys_mobility_calendar_v1.js`                                                                                                                                        | ✅     |
| 6.4 records/progression/calendar tests                                                                    | `__tests__/mobility-records-progression.test.js`, `__tests__/mobility-calendar.test.js`                                                                               | ✅     |
| 7.1 source UI (mode/profile/assessment/readiness/progress/session/runner/effects/sources)                 | `heys_mobility_ui_v1.js`                                                                                                                                              | ✅     |
| 7.2 UI tests                                                                                              | `__tests__/mobility-ui.test.js`                                                                                                                                       | ✅     |
| 8.1 public entry API                                                                                      | `heys_mobility_entry_v1.js`                                                                                                                                           | ✅     |
| 8.2 lazy boot-stub                                                                                        | `heys_mobility_boot_stub_v1.js`                                                                                                                                       | ✅     |
| 8.3 source bundler script                                                                                 | `scripts/bundle-mobility.cjs` + `package.json` scripts                                                                                                                | ✅     |
| 8.4 diary/loader source integration                                                                       | `heys_day_stats_bundle_loader_v1.js`, `heys_day_trainings_v1.js`                                                                                                      | ✅     |
| 8.5 entry/lazy tests                                                                                      | `__tests__/mobility-entry.test.js`                                                                                                                                    | ✅     |
| 9.1 implementation-map status sync                                                                        | `methodology/IMPLEMENTATION_MAP.md`                                                                                                                                   | ✅     |
| 9.2 ROM-progress trend + UI                                                                               | `heys_mobility_progression_v1.js`, `heys_mobility_ui_v1.js`                                                                                                           | ✅     |
| 9.3 atom instructional content + UI cards                                                                 | `heys_mobility_atom_catalog_v1.js`, `heys_mobility_ui_v1.js`                                                                                                          | ✅     |
| 9.4 limiter audit → builder priority                                                                      | `heys_mobility_routine_builder_v1.js`                                                                                                                                 | ✅     |
| 9.5 population focus (desk/hypermobile/older/pregnancy scoring)                                           | `heys_mobility_onboarding_v1.js`, `heys_mobility_routine_builder_v1.js`                                                                                               | ✅     |
| 9.6 periodization high-tissue gate                                                                        | `heys_mobility_routine_builder_v1.js`                                                                                                                                 | ✅     |
| 9.7 weekly plan UI                                                                                        | `heys_mobility_calendar_v1.js`, `heys_mobility_ui_v1.js`                                                                                                              | ✅     |
| 9.8 CWI advisory visible in session UI                                                                    | `heys_mobility_mode_engine_v1.js`, `heys_mobility_ui_v1.js`                                                                                                           | ✅     |
| 9.9 execution UI (breath phases + lifecycle controls)                                                     | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.10 hybrid manual remove/replace tests                                                                   | `__tests__/mobility-builder.test.js`                                                                                                                                  | ✅     |
| 9.11 UI session rebuild on source props change                                                            | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.12 implementation-map stale queue cleanup                                                               | `methodology/IMPLEMENTATION_MAP.md`                                                                                                                                   | ✅     |
| 9.13 onboarding UI goal+disclaimer                                                                        | `heys_mobility_onboarding_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                           | ✅     |
| 9.14 assessment UI manual ROM input                                                                       | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.15 readiness UI manual inputs                                                                           | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.16 progression UI advisory + manual axis                                                                | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.17 practical reason labels in session UI                                                                | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.18 user-facing enum labels + map validator sync                                                         | `heys_mobility_ui_v1.js`, `methodology/IMPLEMENTATION_MAP.md`, `__tests__/mobility-ui.test.js`                                                                        | ✅     |
| 9.19 warmup + dose-confidence chips in UI                                                                 | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.20 records save UI for session+assessment                                                               | `heys_mobility_ui_v1.js`, `heys_mobility_entry_v1.js`, `__tests__/mobility-ui.test.js`                                                                                | ✅     |
| 9.21 painFlag logging from runner UI                                                                      | `heys_mobility_routine_runner_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                       | ✅     |
| 9.22 execution lifecycle reset on mode change                                                             | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                             | ✅     |
| 9.23 TrainingStep bridge (type tab + fullscreen handoff + guarded mobilityLog persistence)                | `heys_training_step_v1.js`, `heys_mobility_entry_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/training-step-drums-tab.test.js`, `__tests__/mobility-ui.test.js`       | ✅     |
| 9.24 implementation-map coverage guard                                                                    | `methodology/tools/impl-coverage.mjs`, `package.json` (`check:mobility-map`)                                                                                          | ✅     |
| 9.25 верификация зелёная                                                                                  | `pnpm vitest run apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js` → 123/123; `pnpm --dir apps/web check:mobility-map` → pass | ✅     |

**Верификация.** Официальный
`pnpm vitest run apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js`
проходит штатно: **123/123**, каталог 29 атомов, `validateAll` без ошибок, все
`sourceIds` резолвятся в bibliography, entry/stub/bundler/TrainingStep-контракты
покрыты. Запись `mobilityLog` в дневник guarded: вызывается только при явном
`dateKey`, standalone сохранение остаётся в `recordsStore`. Дополнительно
проверен синтаксис изменённых source JS (`heys_training_step_v1.js`,
`heys_mobility_entry_v1.js`, `heys_mobility_ui_v1.js`) через `node -c`.

**Coverage guard (2026-06-13):** добавлен `methodology/tools/impl-coverage.mjs`
и npm-скрипт `check:mobility-map`; guard сверяет методологию ↔ карту, Q-пул и
наличие обязательных source/test артефактов мобильности.

**После возврата stash (2026-06-13):** исправлен UI-регресс пересборки сессии
при изменении входных props (`screens`, CWI, phase/key-load), добавлены тесты на
manual `removeAtomIds`/`replaceAtoms`, и `IMPLEMENTATION_MAP.md` очищен от
старых формулировок «2-я очередь» там, где source уже реализован.

**Онбординг UI (2026-06-13):** закрыт gap карты `Q-onb-1`: профиль теперь
показывает все 4 входа (уровень, популяции, цель, оборудование) и дисклеймер;
смена цели перестраивает рекомендуемый режим, неизвестная цель нормализуется к
дефолту.

**Assessment UI (2026-06-13):** закрыт gap `8.1` UI-ввода: панель аудита теперь
показывает полный список ROM-скринов из `assessment.TEST_IDS`, принимает ручной
замер/активный/пассивный ROM и передаёт эти строки в builder для limiter
priority.

**Readiness UI (2026-06-13):** закрыт gap `8.3` UI-ввода: панель готовности
принимает субъективные шкалы и HRV-поля, сразу пересчитывает advisory, но не
блокирует сессию.

**Progression UI (2026-06-13):** закрыт gap `Q-progr-1`: прогресс-панель
показывает авто-подсказку `progression.suggest(...)` и даёт ручной выбор оси
прогрессии.

**Reason UI (2026-06-13):** session reasons больше не показываются как
внутренние id; основные причины сборки отображаются практичными формулировками.

**Labels/UI sync (2026-06-13):** purpose/autonomic/axis/progression reason в UI
теперь показываются человекочитаемо; implementation map синхронизирован с
фактическим `R1_autonomicCoherence` вместо старого имени `V_blockCompat`.

**Warmup/dose UI (2026-06-13):** session UI явно показывает, учтён ли разогрев,
а карточки атомов показывают `doseConfidence` как `Доза A/B/C`.

**Records UI (2026-06-13):** закрыт gap `CONSTRUCTOR_SPEC §6`: UI сохраняет
сессию и аудит через `recordsStore` с injected `clientId/storage`; public entry
пробрасывает эти параметры в `MobilityApp`.

**Pain logging UI (2026-06-13):** runner UI пишет `painFlag` в `recordsStore`;
materialized runner step несёт `atomId` и `jointRegion`, чтобы pain-stop был
привязан к конкретному атому/зоне.

**Runner lifecycle UI (2026-06-13):** execution state сбрасывается при смене
режима/плана, чтобы старый `running/paused/aborted` статус не переносился на
новую сессию.

Найденные/исправленные баги: (1) CARs ошибочно считались end-range (требовали
разминку) — убрано; (2) ревью-фиксы ниже.

## Ревью-фиксы (раунд 1, приняты)

- **High — S2 в агрегаторах:** `runSession` теперь вызывает `S2_painStop`
  (`context.painFlags`/`session.painFlags`); `runAtom` — зона-скоуп боль по
  `atom.jointRegion`. Прямая боль больше не проходит общий flow.
- **High — R1 на атомах:** `R1_autonomicCoherence` собирает вектор и с
  `block.autonomic`, и с `atom.autonomic` внутри блока.
- **Medium — общий контракт contraind:** `S6_smrContraindication` →
  `S6_contraindication` (общий):
  `context.contraindications ∩ atom.gates.contraind` → блок; плюс спец-кейсы
  `pre_power`+`beforePower` и `acute_injury`+зона. Больше не привязан только к
  МФР-модальностям.
- **Medium — схема дозы:** `validateAtom` проверяет обязательные поля `dose` по
  `doseShape` (`DOSE_REQUIRED` map, §1.3): hold→holdSec,
  pnf→contract/relax/hold, и т.д. Каталог проходит.
- **Low — протокол:** обновлён (этот блок).

Все ревью-кейсы покрыты тестами (S6 общий, S2 в агрегаторах, R1 на атомах,
dose-schema). Builder обязан гонять `runSession` перед `runAtom`; ручные
добавления (`extraAtomIds`) также проходят safety.

**Конвенции (как у пальцев):** IIFE-модули `HEYS.Mobility.*`, идемпотентные;
валидаторы = чистые функции `(input)→Issue[]`, fail-closed (нет данных →
`error`, не молча `ok`); гейты читаются из
`atom.gates.{minLevel,minAge,populationGate, contraind,equipment,prerequisites}`
(форма ядра, как у пальцев). Атом-схема — CONSTRUCTOR_SPEC §1.2 (правка:
`gates`-подобъект для совместимости с контрактом валидаторов ядра).

**Что НЕ делаю без команды:** commit, генерация bundle/legacy-sync, push. Source
bundler для mobility добавлен, но `heys_mobility_bundle_v1.js` не генерировался.

## Риски / открытые

- atom_catalog покрывает все блоки A–J и у каждого атома есть `title`,
  `instruction`, `cues`; видео/фото-контент остаётся будущей мультимедийной
  надстройкой, не блокером алгоритма и runner.
- Generated bundle/legacy-sync не запускался по правилам проекта; при явной
  команде `pnpm --dir apps/web bundle:mobility` создаст
  `heys_mobility_bundle_v1.js`.
- UI-flow подключён source-only через lazy stub/loader/diary branch. До
  генерации bundle пользовательское открытие будет пытаться загрузить
  отсутствующий generated file, поэтому это готово к integration flow, но не к
  ручному QA в браузере без bundle-команды.
- `IMPLEMENTATION_MAP.md` синхронизирован как source-ready; ROM-прогресс теперь
  считается через `progression.romTrend` и показывается в UI вместе со статусом
  ретеста.
- Weekly calendar planner строит 7-дневный план по phase/profile/records,
  показывает focus и retest в UI; generated calendar persistence не нужен.
- CWI/cold-water guidance не только хранится в `session.advisories`, но и
  выводится в session UI как практическая подсказка.
- Assessment формула лимитера — релизный стартовый вариант из §8.1/§8.2
  (deficit + active/passive gap); перцентильная аналитика и камера-гониометрия
  остаются будущей полировкой поверх полного режима.
- Records store использует dependency-injected storage; UI и public entry уже
  принимают `clientId/storage`, интеграция должна передать правильный
  client-scoped контекст.

## Что смотреть ревьюеру

- `gates`-форма атома и fail-closed в S1 (safety-критично).
- Соответствие enum CONSTRUCTOR_SPEC §1.2/§1.3.
- Покрытие S1–S9 тестами (особенно S1 age/level, S2 pain, S4 hypermobile, S6
  contraind).
- Builder: evening_relax не подмешивает tonify; pre_workout блокирует опасный
  manual-extra; equipment warning трактуется как недоступность для автоподбора;
  assessment `blockWeights` реально меняют порядок блоков; population focus
  меняет подбор атомов (например desk → грудной/тазобедренный акцент);
  peak/deload/key-load периодизация блокирует high tissue F-атомы в auto/manual.
- Runner: PNF фазы, breath plan, lifecycle.
- Assessment/readiness: limiter audit не диагноз; readiness advisory не
  блокирует.
- UI-source: режимы, профиль, ограничения, ROM-прогресс, atom content cards,
  weekly plan, CWI-advisory, runner-plan, карта эффектов и SourceBadge
  рендерятся в React без подключения bundle.
- Entry/stub: `buildSession`/`buildRunPlan` делегируют доменным движкам,
  `renderPreviewPill` не ломает дневник, lazy stub грузит
  `heys_mobility_bundle_v1.js` только по действию пользователя.
