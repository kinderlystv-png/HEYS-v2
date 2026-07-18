# Тренировочное ядро и режимы

> **Статус:** source architecture проверена 2026-07-18 **Охват:**
> TrainingKernel/TrainingFocus, bundle boundary, fingers и mobility, session
> lifecycle, persistence, diary integration, tests и methodology maps **Не
> подтверждено:** browser/device runtime, generated bundle freshness, научная
> полнота каждой методологии и production usage

## Роль системы

Тренировочные режимы построены как общее домен-агностичное ядро и два
референс-домена. Ядро предоставляет механизмы; пальцы и мобильность определяют
методологию, каталоги, safety-правила, scoring hooks, плееры и UI-смысл.

```text
TrainingStep в дневнике
  → lazy boot stub
  → domain bundle
       ├─ TrainingKernel / TrainingFocus modules (первыми)
       └─ domain config + catalogs + validators + adapters + UI + entry
  → build session
  → gate / assessment / readiness / periodization
  → runner + local active-session snapshot
  → finish/partial save
       ├─ domain records history
       └─ day.trainings[].fingersLog | mobilityLog → обычный day sync
```

## Устойчивые границы

| Слой                   | Владелец                                  | Что там должно жить                                                                                                                                                                      |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Общая механика         | `apps/web/_kernel/`                       | sport registry, dates/calendar, catalog, gates, assessment math, records primitives, session pipeline, runner/timer, active snapshot, periodization/progression, bibliography и focus UI |
| Домен-данные           | methodology + domain catalogs             | оси/качества, атомы, протоколы, дозы, ограничения, benchmarks, sources, labels/assets                                                                                                    |
| Тонкий доменный код    | `apps/web/fingers/`, `apps/web/mobility/` | adapters/hooks, специальные измерители/плееры, domain scoring и UI                                                                                                                       |
| Интеграция с дневником | `HEYS.TrainingStep`                       | создать/обновить training entry и сохранить domain log                                                                                                                                   |
| Cloud persistence      | обычный dayv2 sync                        | завершённая/частичная запись как часть дня                                                                                                                                               |
| Crash recovery         | `TrainingKernel.activeSession`            | local-only client-scoped snapshot активного runner                                                                                                                                       |

Канонический регламент — `_kernel/TRAINING_MODE_REGULATION.md`. Подробные
методологии и implementation maps остаются источниками доменного смысла; это
досье не дублирует их.

## Загрузка и bundle contract

Пальцы и мобильность загружаются лениво через отдельные boot stubs. Каждый
domain bundle включает собственную копию kernel source в одинаковом порядке,
затем доменные модули и public entry последним. IIFE registration guards делают
повторную загрузку общей механики идемпотентной.

Это означает, что `_kernel` пока не является отдельным runtime bundle/package:
он физически встраивается в оба generated bundle. Изменение kernel-файла должно
пересобрать оба домена; текущий общий legacy dependency map явно знает fingers,
но mobility обслуживается отдельным bundle script/coverage flow. Generated files
не являются редактируемым source.

## Общий lifecycle

`SPORT_CONFIG` регистрирует домен до его consumers. Builder формирует session и
trace, validators возвращают структурированные issues, runner ведёт phase state,
а domain display интерпретирует шаги. Timer/runner callbacks не должны содержать
доменную методологию.

`activeSession.create()` добавляет доменный suffix к client-scoped localStorage
key, debounce-ит snapshot, не перезаписывает более свежий state из другой
вкладки, определяет stale и очищает snapshot после завершения/отказа. Snapshot
намеренно не синхронизируется в cloud: иначе отменённая локальная сессия могла
бы воскреснуть после sync/reload.

Завершённый результат сохраняется двумя путями:

1. domain records store — PR/assessment/session history в client-scoped JSON;
2. `TrainingStep.saveFingers` или `saveMobility` — domain log внутри training
   записи дня, после чего действует обычный day persistence/sync.

Эти side effects не образуют общую транзакцию. Fingers сохраняет day log, затем
best-effort обновляет edge/tissue/progression histories; падение вторичной
истории не отменяет дневник. Mobility объединяет два последовательных write в
orchestration result: `saved_both`, `diary_pending` или `failed`. Records write
идемпотентен внутри diary context, поэтому точный повтор не создаёт дубль;
пользовательский success появляется только после подтверждения канонического day
log.

## Режим пальцев

Пальцы — climbing/fingerboard домен: grips/boards/programs/quality/block
catalogs, age/pain/tissue safety, assessment/calibration, progression,
periodization, hang/reps/circuit players и anatomy visuals.

Public integration contract находится в `heys_fingers_entry_v1.js`:
открытие/закрытие fullscreen, readiness, preview pill и body-weight resolver.
Остальные `HEYS.Fingers.*` объекты считаются internal, даже если доступны
глобально.

Fingers использует kernel-first adapters, но в части перенесённых механизмов
сохраняет fallback. Equivalence tests нужны до удаления fallback: его наличие
поддерживает отказоустойчивость, но может скрыть неверный production order или
расхождение двух реализаций.

## Мобильность

Mobility — домен осей/атомов/протоколов для утренней, pre/post workout,
развивающей, вечерней, rehab-frame и anti-sedentary практики. Специфичными
остаются ROM assessment, breath/PNF/SMR semantics, course planner и domain UI.

Public entry строит session/course, открывает fullscreen и рисует diary pill.
Runner умеет сохранять завершённый и частичный `mobilityLog`; records отдельно
хранят session/assessment history. При partial write UI сохраняет payload
попытки и показывает повтор; `TrainingStep.saveMobility` подтверждает запись
readback-проверкой поля `trainings`. Единый `recordsView` загружается из
client-scoped store и обновляется после write, поэтому builder, «Прогресс» и
«Календарь» видят одну актуальную history.

Onboarding работает fail-closed на трёх границах: defaults не выдумывают возраст
и принятие предупреждения, public builders валидируют профиль, а первый слой UI
не показывает запуск до явного заполнения обязательных данных.

## Тестовый контур

Есть отдельные kernel tests, широкие fingers/mobility regression tests,
production-order/integration и equivalence tests. Они доказывают source
contracts в jsdom/VM, но не доказывают актуальность generated bundle, browser
layout, audio/wake lock или реальную запись через production sync.

Coverage checker mobility проверяет связность implementation map с source/test
артефактами. Он доказывает наличие трассировки, а не научную корректность каждой
дозы или полноту пользовательского runtime.

## Инварианты

1. Общий механизм не копируется в новый домен; домен передаёт config/hook/data.
2. Kernel не содержит climbing/mobility literals и порогов.
3. `SPORT_CONFIG` и kernel modules загружаются до domain consumers; entry —
   last.
4. Safety неизвестного профиля должна быть fail-closed, без выдуманного возраста
   или принятого согласия.
5. Причина, изменившая рекомендацию, доступна пользователю через issue/trace/UI.
6. Active snapshot client-scoped и local-only.
7. Завершённая тренировка хранится в `day.trainings[]` с domain log и
   синхронизируется как день.
8. Domain records не заменяют diary record и наоборот.
9. Generated bundles не редактируются вручную.
10. Fallback удаляется только после characterization/equivalence evidence.

## Подтверждённые слабые места и пробелы

- Mobility onboarding теперь fail-closed на трёх границах: безопасные defaults,
  public builders и первый слой UI. Возраст и предупреждение нельзя считать
  заполненными неявно.
- Kernel встраивается отдельно в два domain bundle. Есть риск drift/freshness и
  лишней дубликации runtime; registration guard решает повторный eval, но не
  доказывает одинаковую версию source в generated artifacts.
- Общий `scripts/legacy-bundle-config.mjs` описывает fingers sources неполно
  относительно фактического `bundle-fingers.cjs` и не содержит mobility bundle
  entry. Автоматический scoped rebuild по kernel source может не гарантировать
  пересборку обоих тренировочных bundle.
- Domain records и diary save физически не транзакционны. Mobility теперь явно
  показывает partial state и даёт идемпотентный повтор; незавершённая попытка
  хранится в UI-сессии и не переживает закрытие страницы.
- Fingers имеет несколько best-effort secondary histories с подавлением ошибок;
  дневник сохранится, но progression/tissue/edge evidence может тихо отстать.
- Fallback paths повышают живучесть, но способны маскировать неверный bundle
  order; нужны сохранённые equivalence/prod-order tests.
- Методологические документы заявляют полную source-реализацию, но browser QA и
  generated bundle freshness отдельно не подтверждены этим аудитом.
- Нет проверки реального device wake lock/audio/voice lifecycle и поведения при
  нескольких вкладках вне unit simulation.

## Facts Table

| ID   | Утверждение                                                                            | Проверка                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Статус                                                   |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| TR1  | Регламент задаёт три слоя и обязательные contracts нового режима                       | `sed -n '1,115p' apps/web/_kernel/TRAINING_MODE_REGULATION.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | проверено 2026-07-17                                     |
| TR2  | Fingers и mobility bundles включают kernel перед domain и entry last                   | `sed -n '15,105p' apps/web/scripts/bundle-fingers.cjs && sed -n '15,70p' apps/web/scripts/bundle-mobility.cjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | проверено 2026-07-17                                     |
| TR3  | Оба режима имеют lazy boot stub и отдельный ready event                                | `rg -n 'BUNDLE_FILE                                                                                                                                  \| READY_EVENT' apps/web/heys_fingers_boot_stub_v1.js apps/web/heys_mobility_boot_stub_v1.js`                                                                                                                                                                                                                                                                                                                                                                                                                              | проверено 2026-07-17                                     |
| TR4  | Active sessions используют общий client-scoped local-only store                        | `sed -n '1,145p' apps/web/_kernel/heys_kernel_active_session_v1.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | проверено 2026-07-17                                     |
| TR5  | Domain persistence wrappers отличаются suffix, но используют один kernel               | `sed -n '1,60p' apps/web/fingers/heys_fingers_session_persistence_v1.js && sed -n '1,55p' apps/web/mobility/heys_mobility_session_persistence_v1.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | проверено 2026-07-17                                     |
| TR6  | Fingers finish сохраняет day log, затем best-effort secondary histories                | `sed -n '6030,6070p' apps/web/fingers/heys_fingers_session_ui_v1.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | проверено 2026-07-17                                     |
| TR7  | Mobility различает success/partial/failure и повторяет pair-save без дубля             | `rg -n 'persistMobilitySessionPair                                                                                                                   \| saved_both                                                                                 \| diary_pending                                            \| idempotencyKey' apps/web/mobility/heys_mobility_ui_v1.js apps/web/mobility/heys_mobility_records_store_v1.js apps/web/heys_training_step_v1.js && pnpm vitest run apps/web/**tests**/mobility-ui.test.js apps/web/**tests**/mobility-records-progression.test.js apps/web/**tests**/training-step-drums-tab.test.js apps/web/**tests**/storage-layer.test.js` | проверено 2026-07-18                                     |
| TR8  | Mobility defaults, public builders и UI блокируют запуск без возраста и предупреждения | `rg -n 'DEFAULT_PROFILE                                                                                                                              \| validateBuildProfile                                                                       \| SafetyOnboardingGate                                     \| onboarding.disclaimer' apps/web/mobility/heys_mobility_entry_v1.js apps/web/mobility/heys_mobility_ui_v1.js apps/web/mobility/heys_mobility_onboarding_v1.js`                                                                                                                                                                                                 | проверено 2026-07-17                                     |
| TR9  | Есть kernel, domain и equivalence regression tests                                     | `find apps/web/**tests** -maxdepth 1 -type f \( -name 'kernel-_.test.js' -o -name 'fingers-_.test.js' -o -name 'mobility-\*.test.js' \)              \| sort`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | проверено 2026-07-17                                     |
| TR10 | Legacy dependency map знает fingers, но не mobility training bundle                    | `rg -n 'fingers                                                                                                                                      \| mobility' scripts/legacy-bundle-config.mjs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | проверено 2026-07-17: fingers есть, mobility отсутствует |

## Куда идти глубже

- Общий контракт: `_kernel/TRAINING_MODE_REGULATION.md`
- Извлечение ядра: `_kernel/KERNEL_EXTRACTION_PLAN.md`
- Пальцы: `fingers/README.md`, `fingers/methodology/IMPLEMENTATION_MAP.md`
- Мобильность: `mobility/methodology/IMPLEMENTATION_MAP.md`,
  `mobility/IMPLEMENTATION_PROTOCOL.md`
