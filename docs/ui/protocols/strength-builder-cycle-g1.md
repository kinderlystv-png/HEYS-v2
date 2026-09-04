# Г1 «Программа · цикл» — протокол реализации

**Зона:** `strength-builder` · кадр `data-oid="Г1"` ·
`data-vid="вид · экран цикла"`  
**Канвас:** `docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:549`  
**Статус:**
Phase 2 завершена (2026-09-04)

## UI-гейт

- **Цель:** показать клиенту назначенный цикл — где он в программе, фазы недель,
  эта неделя.
- **Главное действие:** прочитать прогресс и понять, что делать сегодня (строка
  «сегодня» в блоке «Эта неделя»).
- **Слой 1:** шапка (название, куратор, неделя), три плитки (выполнено / тоннаж
  / рекорды), фазы, эта неделя.
- **Слой 2:** сноска про разгрузку (`.sb-cycle-footnote`) — методологическое
  пояснение, не скрывает безопасность.
- **Критическое не скрывать:** пропуск vs разгрузка (текст сноски); статусы дней
  недели.

## Контракт → UI (строки 01–33)

| Ключ  | data-v                                              | Элемент / поведение                               |
| ----- | --------------------------------------------------- | ------------------------------------------------- |
| 01    | шапка                                               | `.sb-cycle-top` — заголовок экрана                |
| 02    | column gap 3px                                      | колонка title + key                               |
| 03    | «Набор массы · 8 недель»                            | `.sb-cycle-title` — `program.title · N недель`    |
| 04    | «назначил Артём · с 4 августа»                      | `.sb-cycle-key` — `assignedBy` + `startDate`      |
| 05    | «неделя 2»                                          | `.sb-cycle-badge` — текущая `weekIndex`           |
| 06    | область прокрутки                                   | `.sb-cycle-scroll`                                |
| 07    | gap 8px margin-top 12px                             | `.sb-cycle-metrics`                               |
| 08    | плитка flex:1 column gap 5px c1 radius 14 pad 10/11 | `.sb-cycle-metric`                                |
| 09    | «Выполнено» label                                   | `.sb-cycle-metric-label`                          |
| 10    | «4 / 12» mono 17/800                                | `.sb-cycle-metric-value` done/total               |
| 11    | плитка tint + inset acs (рекорды)                   | `.sb-cycle-metric.is-accent`                      |
| 12    | «2» mono ac                                         | значение рекордов                                 |
| 13    | «Фазы недель»                                       | `.sb-cycle-tier`                                  |
| 14    | `.grp` active border acs mb 8 r 16                  | `.sb-cycle-phase.is-active`                       |
| 15–17 | row: num + col + pct                                | `.sb-cycle-phase-head`                            |
| 16    | num 26×26 active acs                                | `.sb-cycle-phase-num.is-active`                   |
| 18–19 | name + detail                                       | `.sb-cycle-phase-name`, `.sb-cycle-phase-detail`  |
| 20    | «67 %» gr                                           | `.sb-cycle-phase-pct.is-done`                     |
| 21–23 | week cells row                                      | `.sb-cycle-phase-weeks` / `.is-done` / `.is-plan` |
| 24–26 | inactive phase                                      | `.sb-cycle-phase` + num plan + «план»             |
| 27    | список `.cd`                                        | `.sb-cycle-week-list`                             |
| 28–32 | row / label / status                                | `.sb-cycle-week-row`, «сделано»/«сегодня»         |
| 33    | сноска разгрузки                                    | `.sb-cycle-footnote`                              |

## Что построить

- **CycleScreen** — полноэкранный слой
  (`HEYS.StrengthBuilderParts.CycleScreen`), DOM под кадр Г1.
- **Вход:** `ProgramNextLine` → `openPath()` монтирует CycleScreen вместо legacy
  `ProgramPathScreen`.
- **Данные:** `heys_training_program` + live `plan.status` по дням; фазы из
  `program.phases` или эвристика по `weekIndex`; тоннаж/рекорды из `readDay` +
  kernel.
- **CSS:** `750-strength-builder.css` — блок `.sb-root.program-cycle`.
- **Тест:** `strength-builder-cycle-v4-canvas-contract.test.js` — geometry по
  stop-кадру 375px.

## Зависимости

| Есть                                                   | Нет / частично                                              |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| `useProgramState`, `ProgramNextLine`, fullscreen mount | `program.phases` в схеме KV (fallback: эвристика)           |
| `ProgramDoneScreen` паттерн в `proposal_ui`            | Отдельный razbor/geometry гейт (создаём)                    |
| `trainingTonnage`, `dayTonnage` в kernel               | Точный счёт PR без history — приближение через planSnapshot |
| `750-strength-builder.css` палитра `--c1/--acs/...`    | CSS для цикла (добавляем)                                   |

## Phase 2 — шаги

1. `buildProgramCycleSnapshot` + `CycleScreen` в
   `heys_strength_proposal_ui_v1.js`
2. Wire `openPath` в `heys_day_trainings_v1.js`
3. CSS `.program-cycle` в `750-strength-builder.css`
4. Contract test + обновить `program-week-overview` smoke при необходимости
5. Вердикты `Программа · цикл · 01–33` и `вид · экран цикла` — только
   реализованные строки
6. Gates: roles, drift, vitest
