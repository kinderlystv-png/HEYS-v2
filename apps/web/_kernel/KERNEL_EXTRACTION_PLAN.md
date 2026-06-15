# Training Kernel Extraction Plan

Версия 1.0 · Июнь 2026

Канон архитектуры новых тренировочных режимов:
[`TRAINING_MODE_REGULATION.md`](TRAINING_MODE_REGULATION.md).

## Текущий статус

Ядро тренировочных режимов вынесено в source-слое: пальцы, мобильность и будущие
режимы должны использовать общие runtime-механизмы из `apps/web/_kernel/`, а
различаться через `SPORT_CONFIG`, каталоги, safety-правила, scoring hooks,
плееры и UI-нюансы.

Это не означает "один одинаковый режим для всех". Это означает один набор
строительных механизмов: records, gates, limiter, session pipeline, runner
lifecycle, bibliography, readiness/statistics, catalog index, shared focus UI.

## Что уже считается ядром

| Механизм                      | Kernel module                                                         | Доменный слой                              |
| ----------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Sport registry                | `heys_kernel_sports_v1.js`                                            | `heys_<mode>_sport_config_v1.js`           |
| Bibliography registry/UI      | `heys_kernel_bibliography_v1.js`, `heys_kernel_bibliography_ui_v1.js` | sourceIds, domain bibliography entries     |
| Dates/calendar primitives     | `heys_kernel_dates_v1.js`, `heys_kernel_calendar_v1.js`               | режимные календарные правила               |
| Readiness/statistics          | `heys_kernel_stats_v1.js`                                             | интерпретация и labels режима              |
| Catalog index                 | `heys_kernel_catalog_v1.js`                                           | atoms/protocol catalogs                    |
| Assessment primitives/limiter | `heys_kernel_assess_v1.js`                                            | benchmark/prior/zero-total policy hooks    |
| Gate/issues                   | `heys_kernel_gate_v1.js`                                              | S-rules and domain-specific validators     |
| Records adapter/merge         | `heys_kernel_records_v1.js`                                           | record schemas, positionId/liftId mapping  |
| Periodization mechanics       | `heys_kernel_periodization_v1.js`                                     | domain templates and load semantics        |
| Runner lifecycle              | `heys_kernel_runner_v1.js`                                            | hang/reps/breath/ROM display and cues      |
| Session pipeline              | `heys_kernel_session_v1.js`                                           | slots/candidates/scoring/dose hooks        |
| Shared focus UI               | `heys_training_focus_ui_v1.js`                                        | domain panels, visuals, copy, measurements |

## Definition of done для "100%"

Режим считается построенным на общем ядре, если:

1. `SPORT_CONFIG` зарегистрирован и загружается до доменных модулей.
2. Доменные modules вызывают `HEYS.TrainingKernel.*` для общих механизмов.
3. Домен не содержит нового records-store/timer/session-sorter, если это уже
   есть в ядре и отличается только конфигом.
4. Kernel files не содержат domain literals (`grip`, `edge`, `A2`,
   `jointRegion`, `ROM` и т.п.), кроме docs/tests/examples.
5. Есть prod-order тесты: kernel -> domain, как в bundle order.
6. Есть equivalence/characterization тесты для перенесённого поведения, если
   старый fallback ещё существует.
7. UI использует `TrainingFocus` для shell/tabs/registry/cards/search, а
   доменный UI добавляет только специфические панели.

## Что остаётся доменным по смыслу

- climbing grip/edge/anatomy, a2-risk, hangboard/reps labels;
- mobility joint regions, ROM screens, breath phase display, PNF/SMR copy;
- running pace zones, surfaces, ACWR/VO2 semantics;
- armwrestling position axes, elbow/wrist risk rules;
- протоколы, дозы, sources, illustrations, domain-specific methodology.

Если смысл разный, в ядро выносится только общая механика. Если механика
повторилась в двух режимах — переносим её в `_kernel` и оставляем в домене
config/hook.

## Gate перед интеграцией

Source-gate:

```bash
pnpm vitest run apps/web/__tests__/kernel-*.test.js apps/web/__tests__/fingers-*.test.js apps/web/__tests__/mobility-*.test.js
```

Для нового режима добавляется аналогичный glob
`apps/web/__tests__/<mode>-*.test.js`.

Browser QA и legacy bundle rebuild — отдельный integration/release шаг только по
явной команде. В обычной coder-задаче source-файлы и тесты не должны тащить за
собой generated bundles.

## Остаток работы

Не архитектурный долг ядра, а нормальная работа доменов:

- добавлять новые режимы через регламент, не через copy/paste;
- расширять `SPORT_CONFIG`, когда появляется общий параметр;
- переносить новый общий механизм в `_kernel` только после подтверждения на двух
  режимах или очевидного generic-контракта;
- поддерживать карты реализации режимов и coverage-checkers.

Если следующий режим — армрестлинг/бег/плавание, стартовый документ не должен
копировать пальцы. Он должен начинаться с
[`TRAINING_MODE_REGULATION.md`](TRAINING_MODE_REGULATION.md), затем описывать
только свою методологию и адаптеры.
