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

| Шаг                                                                                                       | Файл                                                                                                                                                                    | Статус |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1.1 axis_catalog (9 осей + ENUM §1.2/§1.3 + validate)                                                     | `heys_mobility_axis_catalog_v1.js`                                                                                                                                      | ✅     |
| 1.2 validators S1–S9 + R1 + equipment-gate + runAtom/runSession                                           | `heys_mobility_validators_v1.js`                                                                                                                                        | ✅     |
| 1.3 atom_catalog (все блоки A–J, 29 атомов + API + validateAtom + content cards)                          | `heys_mobility_atom_catalog_v1.js`                                                                                                                                      | ✅     |
| 1.4 тесты безопасности (S1–S9, fail-closed)                                                               | `__tests__/mobility-validators.test.js`                                                                                                                                 | ✅     |
| 1.5 тесты каталога (enum-валидность, гейты, doseConfidence)                                               | `__tests__/mobility-catalog.test.js`                                                                                                                                    | ✅     |
| 2.1 mode_engine (7 режимов + circadian/CWI/periodization advisory)                                        | `heys_mobility_mode_engine_v1.js`                                                                                                                                       | ✅     |
| 2.2 routine_builder (hybrid auto + manual edits через safety + limiter blockWeights + periodization gate) | `heys_mobility_routine_builder_v1.js`                                                                                                                                   | ✅     |
| 2.3 builder tests                                                                                         | `__tests__/mobility-builder.test.js`                                                                                                                                    | ✅     |
| 3.1 breath_runner                                                                                         | `heys_mobility_breath_runner_v1.js`                                                                                                                                     | ✅     |
| 3.2 routine_runner (hold/reps/flow/PNF/eccentric/CARs/SMR/breath lifecycle)                               | `heys_mobility_routine_runner_v1.js`                                                                                                                                    | ✅     |
| 3.3 runner tests                                                                                          | `__tests__/mobility-runner.test.js`                                                                                                                                     | ✅     |
| 4.1 assessment (ROM norms, limiter audit, retest)                                                         | `heys_mobility_assessment_v1.js`                                                                                                                                        | ✅     |
| 4.2 onboarding (profile normalization + population-aware mode recommendation)                             | `heys_mobility_onboarding_v1.js`                                                                                                                                        | ✅     |
| 4.3 readiness (HRV/subj advisory, non-blocking)                                                           | `heys_mobility_readiness_v1.js`                                                                                                                                         | ✅     |
| 4.4 assessment/readiness tests                                                                            | `__tests__/mobility-assessment-readiness.test.js`                                                                                                                       | ✅     |
| 5.1 bibliography + honest effect map                                                                      | `heys_mobility_bibliography_v1.js`                                                                                                                                      | ✅     |
| 5.2 bibliography tests                                                                                    | `__tests__/mobility-bibliography.test.js`                                                                                                                               | ✅     |
| 6.1 records store (client-scoped, injected storage)                                                       | `heys_mobility_records_store_v1.js`                                                                                                                                     | ✅     |
| 6.2 progression (MED, plateau axis switch, pain regress)                                                  | `heys_mobility_progression_v1.js`                                                                                                                                       | ✅     |
| 6.3 weekly calendar planner (phase/desk/retest)                                                           | `heys_mobility_calendar_v1.js`                                                                                                                                          | ✅     |
| 6.4 records/progression/calendar tests                                                                    | `__tests__/mobility-records-progression.test.js`, `__tests__/mobility-calendar.test.js`                                                                                 | ✅     |
| 7.1 source UI (mode/profile/assessment/readiness/progress/session/runner/effects/sources)                 | `heys_mobility_ui_v1.js`                                                                                                                                                | ✅     |
| 7.2 UI tests                                                                                              | `__tests__/mobility-ui.test.js`                                                                                                                                         | ✅     |
| 8.1 public entry API                                                                                      | `heys_mobility_entry_v1.js`                                                                                                                                             | ✅     |
| 8.2 lazy boot-stub                                                                                        | `heys_mobility_boot_stub_v1.js`                                                                                                                                         | ✅     |
| 8.3 source bundler script                                                                                 | `scripts/bundle-mobility.cjs` + `package.json` scripts                                                                                                                  | ✅     |
| 8.4 diary/loader source integration                                                                       | `heys_day_stats_bundle_loader_v1.js`, `heys_day_trainings_v1.js`                                                                                                        | ✅     |
| 8.5 entry/lazy tests                                                                                      | `__tests__/mobility-entry.test.js`                                                                                                                                      | ✅     |
| 9.1 implementation-map status sync                                                                        | `methodology/IMPLEMENTATION_MAP.md`                                                                                                                                     | ✅     |
| 9.2 ROM-progress trend + UI                                                                               | `heys_mobility_progression_v1.js`, `heys_mobility_ui_v1.js`                                                                                                             | ✅     |
| 9.3 atom instructional content + UI cards                                                                 | `heys_mobility_atom_catalog_v1.js`, `heys_mobility_ui_v1.js`                                                                                                            | ✅     |
| 9.4 limiter audit → builder priority                                                                      | `heys_mobility_routine_builder_v1.js`                                                                                                                                   | ✅     |
| 9.5 population focus (desk/hypermobile/older/pregnancy scoring)                                           | `heys_mobility_onboarding_v1.js`, `heys_mobility_routine_builder_v1.js`                                                                                                 | ✅     |
| 9.6 periodization high-tissue gate                                                                        | `heys_mobility_routine_builder_v1.js`                                                                                                                                   | ✅     |
| 9.7 weekly plan UI                                                                                        | `heys_mobility_calendar_v1.js`, `heys_mobility_ui_v1.js`                                                                                                                | ✅     |
| 9.8 CWI advisory visible in session UI                                                                    | `heys_mobility_mode_engine_v1.js`, `heys_mobility_ui_v1.js`                                                                                                             | ✅     |
| 9.9 execution UI (breath phases + lifecycle controls)                                                     | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.10 hybrid manual remove/replace tests                                                                   | `__tests__/mobility-builder.test.js`                                                                                                                                    | ✅     |
| 9.11 UI session rebuild on source props change                                                            | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.12 implementation-map stale queue cleanup                                                               | `methodology/IMPLEMENTATION_MAP.md`                                                                                                                                     | ✅     |
| 9.13 onboarding UI goal+disclaimer                                                                        | `heys_mobility_onboarding_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                             | ✅     |
| 9.14 assessment UI manual ROM input                                                                       | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.15 readiness UI manual inputs                                                                           | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.16 progression UI advisory + manual axis                                                                | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.17 practical reason labels in session UI                                                                | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.18 user-facing enum labels + map validator sync                                                         | `heys_mobility_ui_v1.js`, `methodology/IMPLEMENTATION_MAP.md`, `__tests__/mobility-ui.test.js`                                                                          | ✅     |
| 9.19 warmup + dose-confidence chips in UI                                                                 | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.20 records save UI for session+assessment                                                               | `heys_mobility_ui_v1.js`, `heys_mobility_entry_v1.js`, `__tests__/mobility-ui.test.js`                                                                                  | ✅     |
| 9.21 painFlag logging from runner UI                                                                      | `heys_mobility_routine_runner_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                         | ✅     |
| 9.22 execution lifecycle reset on mode change                                                             | `heys_mobility_ui_v1.js`, `__tests__/mobility-ui.test.js`                                                                                                               | ✅     |
| 9.23 TrainingStep bridge (type tab + fullscreen handoff + guarded mobilityLog persistence)                | `heys_training_step_v1.js`, `heys_mobility_entry_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/training-step-drums-tab.test.js`, `__tests__/mobility-ui.test.js`         | ✅     |
| 9.24 implementation-map coverage guard                                                                    | `methodology/tools/impl-coverage.mjs`, `package.json` (`check:mobility-map`)                                                                                            | ✅     |
| 9.25 visual prompt pack + 29 atom photos                                                                  | `methodology/VISUAL_PROMPTS.md`, `public/exercises/mobility/*.webp`, `heys_mobility_atom_catalog_v1.js`, `heys_mobility_ui_v1.js`, `__tests__/mobility-catalog.test.js` | ✅     |
| 9.26 TrainingStep mobile-tab click guard                                                                  | `heys_training_step_v1.js`, `__tests__/training-step-drums-tab.test.js`                                                                                                 | ✅     |
| 9.27 protocol catalog как у Fingers.PROGRAMS                                                              | `heys_mobility_protocols_catalog_v1.js`, `scripts/bundle-mobility.cjs`, `__tests__/mobility-protocols.test.js`                                                          | ✅     |
| 9.28 guided miniapp UI вместо формы-настроек                                                              | `heys_mobility_ui_v1.js`, `heys_mobility_entry_v1.js`, `__tests__/mobility-ui.test.js`, `__tests__/mobility-entry.test.js`                                              | ✅     |
| 9.29 progressive flow как у Fingers                                                                       | `heys_mobility_ui_v1.js`, `heys_mobility_routine_builder_v1.js`, `__tests__/mobility-ui.test.js`, `__tests__/mobility-builder.test.js`                                  | ✅     |
| 9.30 общий focus-mode UI shell                                                                            | `_kernel/heys_training_focus_ui_v1.js`, `heys_mobility_ui_v1.js`, `fingers/heys_fingers_session_ui_v1.js`, `scripts/bundle-{mobility,fingers}.cjs`                      | ✅     |
| 9.31 верификация зелёная                                                                                  | `pnpm vitest run apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js` → 132/132; `pnpm verify:legacy-bundles` → pass               | ✅     |

**Верификация.** Официальный
`pnpm vitest run apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js`
проходит штатно: **132/132**, каталог 29 атомов, `validateAll` без ошибок, все
`sourceIds` резолвятся в bibliography, entry/stub/bundler/TrainingStep-контракты
покрыты. Запись `mobilityLog` в дневник guarded: вызывается только при явном
`dateKey`, standalone сохранение остаётся в `recordsStore`. Дополнительно
проверен синтаксис изменённых source JS (`heys_training_step_v1.js`,
`heys_mobility_entry_v1.js`, `heys_mobility_ui_v1.js`,
`_kernel/heys_training_focus_ui_v1.js`) и bundle scripts через `node -c`.

**Coverage guard (2026-06-13):** добавлен `methodology/tools/impl-coverage.mjs`
и npm-скрипт `check:mobility-map`; guard сверяет методологию ↔ карту, Q-пул и
наличие обязательных source/test артефактов мобильности.

**Visual prompt pack + photos (2026-06-13):** добавлен
`methodology/VISUAL_PROMPTS.md` — единый premium photo style и 29 atom-specific
prompt anchors. Каждый атом получил `visualAsset`
`/exercises/mobility/<atomId>.webp` и `visualPromptRef`; сгенерированы 29/29
WebP-фото в `public/exercises/mobility/`, session UI и текущий runner-step
показывают фото, слот скрывается при 404. Визуальный QA: contact sheet
`tmp/imagegen/mobility/contact-sheet.png`, слабые кадры open-book и bolster
перегенерированы.

**TrainingStep click guard (2026-06-13):** кнопки типа тренировки получили
`type="button"` внутри шага формы; mobility-tab теперь имеет явный title,
fallback-сохранение типа при недоступном fullscreen-модуле покрыто тестом, а
`training-zones.shouldShow` пропускает `mobility` как dedicated overlay-flow.

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

**Protocol catalog + guided UI (2026-06-13):** добавлен верхний продуктовый слой
`Mobility.PROTOCOLS`/`protocolCatalog` как аналог `Fingers.PROGRAMS`: 10 готовых
протоколов, `defaultForMode`, `recommend`, `buildOptions`. Первый экран
перестроен в miniapp-flow: цель + инвентарь → карточка рекомендованного микса
или протокола → ведомая тренировка только после явного запуска; профиль, аудит,
прогресс и календарь остаются во вкладках. `openFullscreen({ protocolId })` и
public `buildSession` учитывают protocol options, но не обходят safety builder.

**Shared focus-mode UI (2026-06-13):** добавлен общий слой `HEYS.TrainingFocus`
в `_kernel/heys_training_focus_ui_v1.js`: `Header`, `Tabs`, `EquipmentBar`,
`GoalSelector`, `ReadinessCard`, `Registry`, `RegistryGrid`. Mobility теперь
использует этот shell вместо отдельной компоновки: тот же принцип, что у режима
пальцев (заголовок, иконки, табы, компактный Today, запуск runner по кнопке), но
контент и движок остаются мобильностью. Fingers тоже переведён на тот же слой
для `Header`, `Tabs`, `GoalSelector`, equipment-chips и registry grid, сохранив
доменную логику профиля/досок/блоков, фильтров и detail-modal. `bundle-mobility`
и `bundle-fingers` включают общий модуль.

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

**Текущий локальный QA-проход (2026-06-13):** правки лежат в рабочем дереве без
нового commit/push. `heys_mobility_bundle_v1.js` пересобран локально через
`pnpm --dir apps/web bundle:mobility`, потому что lazy stub грузит этот
runtime-артефакт.

## Локальные QA-фиксы TrainingStep → Mobility (2026-06-13)

- Исправлен первый клик по табу `Мобильность`: если
  `HEYS.Mobility.openFullscreen` ещё не загружен, `TrainingStep` теперь сам
  подгружает `heys_mobility_boot_stub_v1.js` и передаёт действие в lazy overlay.
- Исправлен визуальный баг overlay: mobility UI теперь инжектит собственный
  stylesheet (`#heys-mobility-ui-style`), `.mobility-overlay-root` становится
  `position: fixed` поверх приложения, а body/html scroll блокируется и
  восстанавливается при закрытии.
- Исправлен UX-перекос “портянкой”: первый экран перестроен в focus-mode как у
  режима пальцев — header, segmented tabs, компактный выбор цели и инвентаря,
  затем карточки `Сессия по методологии` / рекомендованный протокол. Guided
  runner больше не открыт сразу: он появляется только после `Запустить микс`,
  `Запустить протокол` или `Запустить свою`.
- Добавлен слой готовых протоколов: 10 protocol cards во вкладке `Протоколы`,
  выбор протокола возвращает на `Сегодня` и перестраивает guided session.
- Исправлен z-index overlay: мобильность поднимается до системного слоя
  `2147483000`, чтобы login/root app не перехватывал клики поверх overlay.
- Локальная browser-проверка на `localhost:3001`: overlay root занимает
  `390×844`, `position=fixed`, `z-index=2147483000`, `body.overflow=hidden`;
  первый экран содержит `.mobility-fs-tabs`, `.mobility-fs-equipment`,
  `.mobility-fs-goalsel`, `.mobility-fs-mixcard`, не показывает
  `.mobility-guided` до запуска; проверены `Запустить микс`, протокол
  `Пауза от сидения` и custom-сборка `Hip CARs` + `Box breathing`.
- Проверки:
  `pnpm vitest run apps/web/__tests__/mobility-*.test.js apps/web/__tests__/training-step-drums-tab.test.js`
  → 132/132; `pnpm verify:legacy-bundles` → ok.
- Shared-shell browser QA: Mobility на `localhost:3001` — first screen без
  runner, 6 целей, инвентарь, запуск микса, протокол `Пауза от сидения`, custom
  `Hip CARs` + `Box breathing`, реестр `Все упражнения`: 29/29 фото и 2 карточки
  в первой строке на 390px; Fingers — общий header/tabs/equipment/
  goals/registry-grid через `HEYS.TrainingFocus`, реестр: 36/36 фото и 2
  карточки в первой строке, клики `Протоколы`/`Своя`, z-index `2147483000`.

## Итог унификации ядра (2026-06)

- Общий регламент для всех тренировочных режимов зафиксирован в
  [`../_kernel/TRAINING_MODE_REGULATION.md`](../_kernel/TRAINING_MODE_REGULATION.md).
  Мобильность больше не считается отдельным движком; это domain layer поверх
  `HEYS.TrainingKernel.*` и `HEYS.TrainingFocus.*`.
- Новая общая логика должна идти в `_kernel`: sport registry, records adapter,
  assessment limiter, gate/issues, session pipeline, runner lifecycle, shared
  focus UI. Mobility-файлы оставляют только контент, правила S1–S9/R1, ROM/
  breath/PNF/SMR специфику, visual assets и практичные user-facing объяснения.
- Future-mode правило: бег/армрестлинг/плавание стартуют не с копирования
  mobility/fingers UI, а с `SPORT_CONFIG` + каталогов + тонких hooks против
  kernel contracts. Если приходится копировать механику выбора, records merge,
  runner state или registry/cards/search — это сигнал вынести механику в kernel.

## Guided runner shell (2026-06-15)

- В `HEYS.TrainingFocus` добавлен общий `GuidedRunnerPanel`: фото/фолбэк,
  заголовок, инструкция, метрики, progress, дыхательные фазы, controls и список
  шагов. Компонент помечает DOM `data-training-runner="guided"`, чтобы тесты
  ловили возврат к доменной самописной разметке.
- `Mobility.ExecutionPanel` теперь только готовит domain data из `routineRunner`
  и отдаёт её в `TrainingFocus.GuidedRunnerPanel`. При отсутствии
  `TrainingFocus` сохранён старый fallback, чтобы source-eval и деградация не
  ломались.
- Проверки:
  `pnpm vitest run apps/web/__tests__/kernel-training-focus-ui.test.js apps/web/__tests__/mobility-ui.test.js apps/web/__tests__/mobility-runner.test.js apps/web/__tests__/fingers-exercise-runner.test.js apps/web/__tests__/fingers-timer-kernel-equivalence.test.js`
  → 82/82.

## Guided launch + timer parity (2026-06-15)

- Исправлен UX-разрыв с режимом пальцев: выбор `Запустить микс`/протокола/своей
  сборки теперь только выбирает план, а не проваливает пользователя сразу в
  `idle` runner. На экране плана появляется большая кнопка
  `▶ Запустить ведомую сессию` и вторичная `Сохранить план без таймера`, как в
  пальцах.
- После `▶ Запустить ведомую сессию` мобильность открывает общий
  `GuidedRunnerPanel` с `autoStart`: первый timed-step сразу переходит в
  `running`, показывает countdown `осталось`, поддерживает `Пауза`/
  `Продолжить`/`Дальше`/`Отметить боль`/`Стоп` и авто-переход по окончании
  timed-step.
- Проверки:
  `pnpm vitest run apps/web/__tests__/kernel-training-focus-ui.test.js apps/web/__tests__/mobility-ui.test.js apps/web/__tests__/mobility-runner.test.js apps/web/__tests__/fingers-exercise-runner.test.js apps/web/__tests__/fingers-timer-kernel-equivalence.test.js`
  → 82/82.

## Guided preflight + circular runner parity (2026-06-15)

- UX доведён до поведения режима пальцев: кнопка `▶ Запустить ведомую сессию`
  теперь сначала открывает `HEYS.ConfirmModal` с preflight-чеклистом. Текст
  подготовки доменный: утром/перед нагрузкой — 60 секунд лёгкого марша или
  прыжков; вечером — поза мертвеца/длинный выдох; восстановление/rehab —
  спокойная ходьба и мягкая оценка боли.
- После подтверждения мобильность показывает тот же тип live-runner, что и
  пальцы: круговой таймер SVG, phase badge, `Пауза`/`Продолжить`/`Дальше`/
  `Боль`/`Стоп` в одной зоне controls и нижний список всех этапов тренировки.
  Текущий этап выделяется чёрным, остальные серые; фото текущего атома остаётся
  в DOM для совместимости, но live-view больше не занимает экран большой
  карточкой.
- Source-eval/test fallback сохранён: если `HEYS.ConfirmModal.show` отсутствует,
  старт остаётся прямым, как раньше, поэтому старые unit-тесты без ConfirmModal
  не ломаются.
- Проверки:
  `pnpm vitest run apps/web/__tests__/mobility-ui.test.js apps/web/__tests__/mobility-runner.test.js apps/web/__tests__/training-confirm-modal-layering.test.js`
  → 27/27.
- Browser QA на `http://localhost:3001/`: `HEYS.Mobility.openFullscreen()` →
  `Запустить микс` → `▶ Запустить ведомую сессию` показывает preflight поверх
  mobility overlay (`2147483400` > `2147483000`), вечерний preset содержит
  `позу мертвеца`, после `Всё ОК, начинаем` открыт `.mobility-guided-live` со
  статусом `running`, кольцом, roadmap и кнопками `Пауза`/`Стоп`.

### Follow-up polish (2026-06-15)

- `.mobility-guided-live` переведён из inline-card в отдельный fullscreen
  overlay (`position: fixed`, `z-index: 2147483200`), чтобы сопровождение
  открывалось как отдельный режим, а не ниже карточек плана.
- Roadmap этапов сделан строго построчным: у mobility и fingers dense/ultra
  dense больше не раскладывает упражнения по 2 в строку.
- Countdown digit центрируется явно через `width:100%`/`text-align:center`;
  browser QA на 390×844 показал `digitCenterDeltaX=0`, `listColumns=320px`, live
  overlay `top=0`, `height=844`.

### Shared live shell correction (2026-06-15)

- Причина визуального рассинхрона была в том, что раньше переиспользовались
  lifecycle/countdown CSS, но не сам live-shell пальцев. Общий каркас вынесен в
  `HEYS.TrainingFocus.LiveRunnerShell` и `HEYS.TrainingFocus.LiveRoadmap`.
- `Fingers.LiveSession` и `Mobility.ExecutionPanel` теперь рендерят общий root
  `.fingers-fs-live` и общий roadmap `.fingers-fs-live-roadmap`; домены
  добавляют только свои данные и доменные классы/controls.
- Browser QA на 390×844: mobility live root =
  `.fingers-fs-live.mobility-guided-live`, roadmap =
  `.fingers-fs-live-roadmap.mobility-live-roadmap`,
  `data-training-runner=guided`, список `display:flex; flex-direction:column`,
  `digitCenterDeltaX=0`.

### Shared countdown display correction (2026-06-15)

- Оставшийся рассинхрон был внутри runner: mobility уже использовала общий
  shell, но таймер/круг оставались доменным JSX. Вынесен общий
  `HEYS.TrainingFocus.LiveCountdownDisplay`; mobility теперь передаёт туда
  только данные упражнения, фото, фазу, прогресс и callbacks.
- Локальный browser QA после `bundle:fingers` + `bundle:mobility`: mobility live
  root `.fingers-fs-live.mobility-guided-live`, countdown
  `.heys-fingers-countdown.heys-fingers-continuous`, `--phase-color=#dc2626`,
  roadmap `flex-direction:column`, `digitCenterDeltaX=0`, controls =
  `Пауза/→/Боль/Прервать`.

### Abort confirm-flow parity (2026-06-16)

- `Прервать` в mobility runner больше не вызывает `abort` напрямую. Теперь
  повторяет поведение пальцев: `Прервать тренировку?` → при прогрессе
  `Записать прогресс?` → частичная сессия пишется в `recordsStore` и
  `TrainingStep.saveMobility` с `partial=true`, затем live runner закрывается.
- Тесты: добавлен regression на partial abort save; targeted UI прогон
  `mobility-ui + fingers-exercise-runner + confirm-modal-layering` = 77/77.
  Browser QA на 390×844 подтвердил две ConfirmModal, `partialProgress` в
  `heys_<clientId>_mobility_records_v1`, `liveStillOpen=false` после записи.

### Shared runner hardening (2026-06-17)

- Mobility resume теперь работает с choose-экрана: баннер виден до запуска,
  `Продолжить` открывает `ExecutionPanel` в режиме `resume`, а partial
  abort-save использует восстановленный `built/plan` snapshot, а не текущий
  quick-mix.
- Mobility active-session persistence вынесен в отдельный source-wrapper над
  `HEYS.TrainingKernel.activeSession`: `routine_active_session`, client-scoped
  local-only `localStorage`, stale 24h.
- Mobility timer использует общий `HEYS.TrainingKernel.timer.useTimerCore` и
  owner-lock через `TrainingKernel.runner.createOwnerLock`, чтобы второй live
  runner не стартовал поверх свежей активной сессии.
- Проверки: targeted `vitest` для fingers/mobility/kernel runner/timer/
  persistence/adapter — 12 файлов, 175 тестов; прямые kernel-regression tests
  добавлены для `activeSession` и `useTimerCore`.
- Ограничение: generated legacy bundles не пересобраны в этом проходе, потому
  что `bundle:*` требует отдельной явной команды.

## Риски / открытые

- atom_catalog покрывает все блоки A–J и у каждого атома есть `title`,
  `instruction`, `cues`, `visualAsset` и prompt-ref. `.webp`-файлы добавлены для
  29/29 атомов; дальнейшая мультимедийная полировка может заменить отдельные
  кадры без изменения контракта `/exercises/mobility/<atomId>.webp`.
- Mobility bundle создан и готов для lazy-load через stub. Legacy-sync был
  выполнен pre-commit hook'ом при feature-коммите; отдельный browser QA не
  запускался.
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
  weekly plan, CWI-advisory, guided runner, protocol cards, runner-plan, карта
  эффектов и SourceBadge рендерятся в React без подключения bundle.
- Entry/stub: `buildSession`/`buildRunPlan` делегируют доменным движкам,
  `renderPreviewPill` не ломает дневник, lazy stub грузит
  `heys_mobility_bundle_v1.js` только по действию пользователя.
