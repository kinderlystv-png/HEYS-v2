# Регламент тренировочных режимов HEYS

Версия 1.0 · Июнь 2026

Этот документ — общий контракт для режима пальцев, мобильности/зарядки и
следующих режимов (бег, армрестлинг, плавание, силовой и т.д.). Цель простая:
**один runtime-движок для общих механизмов, разные доменные контексты для
методологии**.

## Что означает "100%"

"100%" не значит, что весь код одинаковый. Это значит:

- общие механизмы живут в `apps/web/_kernel/` и доступны как
  `HEYS.TrainingKernel.*` / `HEYS.TrainingFocus.*`;
- режим подключает их через `SPORT_CONFIG`, каталоги, валидаторы-данные,
  assessment/records/session/runner hooks;
- домен оставляет у себя только методологию, контент, специализированный плеер и
  визуальные детали;
- новый режим можно начать не копированием `fingers` или `mobility`, а созданием
  нового набора данных и тонких адаптеров против этих контрактов.

## Три слоя

| Слой                | Где лежит                                        | Что хранит                                                                                                                                                                                                    |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ядро                | `apps/web/_kernel/`                              | sport registry, dates/calendar helpers, catalog index, gate/issues, assessment primitives, records adapter, session pipeline, runner state graph, periodization/readiness helpers, shared focus UI primitives |
| Домен-данные        | `apps/web/<mode>/methodology/` + каталоги режима | оси/качества, атомы/блоки, протоколы, дозы, safety-правила, бенчмарки, источники, онбординг-схема, UI labels/assets                                                                                           |
| Тонкий доменный код | `apps/web/<mode>/heys_<mode>_*.js`               | resolver'ы benchmark/prior, специальные плееры и измерители, domain-specific scoring hooks, визуализации и тексты                                                                                             |

Если логика одинакова в двух режимах — она кандидат в ядро. Если отличается
методологический смысл (например, вис-таймер пальцев и дыхательный пейсер
мобильности), в ядро выносится только state-machine/lifecycle, а доменный плеер
остаётся в режиме.

## Канонический словарь

Новые режимы мапят свои термины на словарь ядра, а не создают параллельные
движки.

| Kernel-термин        | Пальцы                   | Мобильность                    | Смысл                                                      |
| -------------------- | ------------------------ | ------------------------------ | ---------------------------------------------------------- |
| `SPORT_CONFIG`       | climbing/fingers config  | mobility config                | доменные числа, уровни, лимиты, labels                     |
| `catalog` / `atom`   | block catalog / exercise | atom catalog                   | единица действия с дозой и гейтами                         |
| `gate` / `Issue`     | S1-S9 + V\_\*            | S1-S9 + R1                     | fail-closed safety/reporting                               |
| `assessment limiter` | MVC/test battery         | ROM/скрины                     | deficit -> limiter -> weights/stimulus                     |
| `records adapter`    | PR/history/session logs  | mobility session/ROM logs      | client-scoped persistence + merge                          |
| `session pipeline`   | slots по качествам       | purpose/mode/block rules       | candidates -> gates -> score -> selection -> trace         |
| `runner phase graph` | hang/reps/circuit/etc.   | hold/reps/flow/PNF/breath/etc. | start/pause/resume/skip/abort/snapshot/cues                |
| `TrainingFocus`      | "Сила хвата" shell       | "Мобильность" shell            | общий miniapp shell: header/tabs/registry/cards/containers |

Запрещено плодить новые имена для тех же механизмов (`quality_catalog` vs
`axis_catalog`, `mix_engine` vs `routine_builder`) без явной причины. Домен
может иметь своё название в методологии, но код должен мапить его на контракт.

## Обязательные артефакты нового режима

Каждый новый тренировочный режим создаётся полным релизным модулем, не MVP:

1. `methodology/METHODOLOGY.md` — научная и практическая методология.
2. `methodology/CONSTRUCTOR_SPEC.md` — схема данных и привязка к kernel
   contracts: `SPORT_CONFIG`, atom schema, safety, assessment, records, session,
   runner, UI.
3. `methodology/IMPLEMENTATION_MAP.md` — ID методологии -> код -> тесты -> UI.
4. `IMPLEMENTATION_PROTOCOL.md` — журнал сборки, проверки и review-focus.
5. `heys_<mode>_sport_config_v1.js` — регистрация режима в kernel sport
   registry.
6. Каталоги и доменные данные: axes/qualities, atoms, protocols, bibliography,
   visuals/prompts.
7. Тонкие адаптеры: validators, assessment, records store, session builder,
   runner, UI entry.
8. Тесты: kernel-contract, domain regression, prod-order, equivalence where
   fallback exists, UI smoke.

## Порядок сборки режима

1. **Methodology/data first:** словарь, источники, атомы, дозы, safety IDs.
2. **SPORT_CONFIG:** уровни, labels, риск-модель, default policy.
3. **Safety/gates:** fail-closed валидаторы до builder.
4. **Catalog/index:** atom/protocol registry через kernel catalog helpers.
5. **Assessment/records:** limiter inputs и client-scoped persistence через
   kernel adapters.
6. **Session pipeline:** slots/candidates/gates/scoring/trace через
   `TrainingKernel.session`.
7. **Runner:** lifecycle через `TrainingKernel.runner`, доменный display/hook
   отдельно.
8. **Focus UI:** общий shell/tabs/cards/search через `TrainingFocus`, доменные
   панели только там, где действительно другой UX.
9. **Browser QA/release artifacts:** только по отдельной явной команде на
   локальную сборку/бандлы/релиз.

## Правила изменения существующих режимов

- Общая логика сначала идёт в `_kernel`, домен получает только config/hook.
- Перед переносом поведения добавляется characterization/equivalence test:
  kernel-path должен совпасть с fallback там, где поведение уже стабилизировано.
- Доменный код не читает `HEYS.currentClientId` напрямую, если это можно сделать
  через injected records adapter.
- Safety остаётся fail-closed: неизвестный возраст/уровень/профиль не считается
  безопасным молча.
- Пользовательский UI обязан показывать практическую причину, если методология
  изменила рекомендацию: badge, trace, reason, tooltip или строка в нужном месте
  flow.

## Что не выносится в ядро

- climbing-specific grip/edge/anatomy visuals;
- breath/ROM display, если это именно доменный экран;
- доменные пороги, названия качеств, тесты, протоколы, источники;
- тексты и иллюстрации упражнений;
- методологически разные progression/periodization semantics, пока нет общего
  контракта на двух-трёх режимах.

Ядро даёт механику. Домен даёт смысл.

## Gate качества

Перед тем как считать режим архитектурно готовым:

```bash
pnpm vitest run apps/web/__tests__/kernel-*.test.js apps/web/__tests__/fingers-*.test.js apps/web/__tests__/mobility-*.test.js
```

Для нового режима добавляются свои `apps/web/__tests__/<mode>-*.test.js` и
prod-order/equivalence тесты, если есть fallback. Проверка браузера и legacy
bundles запускаются отдельно только по явной integration/release-команде.

Дополнительные проверки:

- kernel files не содержат доменных литералов (`grip`, `edge`, `A2`,
  `jointRegion`, `ROM` и т.п.), кроме docs/tests/adapter examples;
- новый режим зарегистрирован в `SPORT_CONFIG`;
- records keys client-scoped и проходят cleanup/sync;
- cards/registry/search в `TrainingFocus` переиспользуются, а не копируются.

## Примеры будущих режимов

**Армрестлинг.** Домен добавляет оси pronation/supination/cupping/riser, тесты
позиционной силы, протоколы holds/reps, свой risk model локтя/запястья. Ядро
остаётся тем же: records, limiter, session pipeline, runner phases,
TrainingFocus.

**Бег.** Домен добавляет pace zones, surfaces, ACWR/VO2-поля, интервальный
runner display, тесты темпа/HR. Ядро остаётся тем же: readiness, periodization
mechanics, records merge, session pipeline, focus UI.

**Плавание.** Домен добавляет stroke mechanics, drills, pace/rest intervals,
технику видео/метрики. Ядро остаётся тем же: catalog/gates/assessment/runner
lifecycle/records.

## Review checklist

- Новый код добавляет общий механизм в `_kernel`, а не копирует его в домен.
- `SPORT_CONFIG` есть и загружается до доменных модулей.
- Доменные каталоги — данные; тонкий код только адаптирует hooks.
- Есть test gate: unit + domain + prod-order + equivalence where applicable.
- UI не показывает пользователю всю механику сразу: сначала цель/контекст, потом
  mix/protocol/custom, затем сопровождение.
