# Извлечение общего ядра тренировочных режимов — анализ и план

Версия 0.2 · Июнь 2026

**Namespace ядра:** `HEYS.TrainingKernel.*` (логика) рядом с
`HEYS.TrainingFocus` (UI-примитивы). Оба бандлера (`bundle-fingers.cjs`,
`bundle-mobility.cjs`) грузят kernel-модули из `apps/web/_kernel/` первыми.

**Статус извлечения:**

- ✅ `heys_training_focus_ui_v1.js` — общий UI-примитив focus-режима (использует
  и Fingers, и Mobility). Первый кирпич ядра.
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
- ⬜ остальное по §4 (readiness-math → catalog API → validator-framework → …).

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
