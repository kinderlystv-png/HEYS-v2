# Голые литералы цвета — опись для разметки

Собирается командой `node scripts/ui-v4-list-bare-literals.mjs`: правило счёта
живёт в скрипте, поэтому число можно повторить, а не только прочитать.

Вторая опись к [`UI_V4_SAND_ROLES_INVENTORY.md`](UI_V4_SAND_ROLES_INVENTORY.md).
Та описывает роли с именем набора; эта — второй источник того же песочного на
синем, который первая не видит по построению. Роль `--v4-sand-*` заменяется на
общую механически; литерал вида `#efe3cf` не заменяется ничем, и после разметки
первой описи эти места **останутся песочными**.

**Что сделать с этим файлом.** Разметьте так же, как первую опись: `герой` в
начале строки семейства там, где тёплый тон назван контрактом намеренно.
Неотмеченное — замена на роль отдельной задачей.

## Что считается местом — полное правило

1. Цветной токен: `#hex` (3, 4, 6 или 8 знаков), `rgb()`, `rgba()`, `hsl()`,
   `hsla()`.
2. Комментарии вырезаются до счёта: в этом коде принято объяснять словами,
   почему литерал заменён ролью, и такие упоминания цветом на экране не
   являются.
3. Запасное значение внутри `var(--роль, …)` местом **не** считается — роль там
   есть, и это отдельный вопрос со своим гейтом.
4. Объявление самой роли (`--v4-…: #…`) не считается: это и есть палитра.
5. Правило без класса в селекторе (шаг `@keyframes`, `:root`, элементный
   селектор) считается наравне с остальными.
6. Считаются **места**, а не разные значения: один `#efe3cf` в пяти объявлениях
   — пять мест.
7. Тёплый цвет: оттенок 12–55°, насыщенность от 10 %, не серый. **Альфа не
   влияет** — тёплая тень под 8 % на синей поверхности всё равно тёплая.

Седьмой пункт спорный, поэтому вот то же множество под четырьмя правилами:

| правило                       | мест |
| ----------------------------- | ---: |
| только hex                    | 1546 |
| hex + непрозрачный `rgb()`    | 1555 |
| hex + `rgba()` с альфой ≥ 0,5 | 1705 |
| все, включая полупрозрачные   | 2395 |

В описи — последняя строка, **2395**.

## Охват

Просмотрены все модули стилей (47) и файлы кода, названные обоснованиями
вердиктов закрытых зон (103). Закрытых зон 21; незакрытой считается та, где ещё
стоят «?» — сейчас это `reports-insights`, `water-add`. Всего голых литералов в
этих файлах 15550; тёплых 2395. Остальные палитре тоже не следуют, но песочными
экран не делают, и это отдельный разговор.

Файл, которого здесь нет, **просмотрен и чист**: его отсутствие означает ноль, а
не «не смотрели». Так, `733-ui-v4-reports.css` и `734-ui-v4-curator-panel.css`
не содержат ни одного голого литерала — их цвета либо роли, либо запасные
значения при ролях, либо упоминания в комментариях.

**Звёздочка** у литерала означает, что это в точности значение песочной роли и
ни одной синей — такое место переводится на роль без разговора. Их 36.

Всего мест: **2395** в 65 файлах.

---

## Файлы, названные обоснованиями закрытых зон

### `000-base-and-gamification.css` — 274

Зоны: `cycle`, `home-widgets`, `nutrition-tab`, `registration`, `tips`

| семейство                              | мест | литералы                                                                                                                                   |
| -------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `.ct-wb-ex-grid`                       |   11 | `#fde68a`, `#b45309`, `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(120, 53, 15, 0.4)`, … (+5)                                                    |
| `.ct-wb-ex-remove`                     |   11 | `#fde68a`, `#b45309`, `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(120, 53, 15, 0.4)`, … (+5)                                                    |
| `.ct-wb-stepper`                       |   11 | `#fde68a`, `#b45309`, `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(120, 53, 15, 0.4)`, … (+5)                                                    |
| `.ews-badge`                           |    9 | `rgba(249, 115, 22, 0.15)`, `#ea580c`, `rgba(249, 115, 22, 0.25)`, `rgba(249, 115, 22, 0.3)`, `rgba(234, 88, 12, 0.22)`, `#ca8a04`, … (+1) |
| `.yesterday-quick-btn`                 |    9 | `#fde68a`, `#fef3c7`, `#78350f`, `#fcd34d`, `#b45309`, `rgba(245, 158, 11, 0.28)`, … (+2)                                                  |
| `.crs-bar-orange`                      |    6 | `#d97706`, `#f59e0b`, `#fbbf24`                                                                                                            |
| `.ct-wb-ex-name-header-fav`            |    6 | `#f59e0b`, `rgba(245, 158, 11, 0.45)`, `#fef3c7`, `#fbbf24`, `rgba(120, 53, 15, 0.35)`                                                     |
| `.ct-wb-rest-watch`                    |    6 | `rgba(245, 158, 11, 0.65)`, `rgba(245, 158, 11, 0.14)`, `#b45309`, `rgba(245, 158, 11, 0.22)`, `#fde68a`                                   |
| `.ct-wb-summary-cell`                  |    6 | `rgba(254, 243, 199, 0.85)`, `rgba(245, 158, 11, 0.55)`, `#b45309`, `rgba(120, 53, 15, 0.6)`, `#fde68a`                                    |
| `.game-daily-mult`                     |    6 | `#fbbf24`, `rgba(251, 191, 36, 0.2)`, `#f97316`, `rgba(249, 115, 22, 0.3)`, `rgba(234, 88, 12, 0.3)`, `rgba(249, 115, 22, 0.5)`            |
| `.meal-sticky-bar`                     |    6 | `rgba(255, 237, 213, 0.92)`, `rgba(254, 215, 170, 0.6)`, `#c2410c`, `#fef3c7`, `#b45309`                                                   |
| `.ct-wb-workout-pill-pr`               |    5 | `rgba(245, 158, 11, 0.18)`, `#b45309`, `rgba(245, 158, 11, 0.45)`, `rgba(245, 158, 11, 0.30)`, `#fde68a`                                   |
| `.date-picker`                         |    5 | `#fef3c7`, `#fde68a`, `#fcd34d`, `#b45309`                                                                                                 |
| `.date-picker-sheet`                   |    5 | `#c67139`, `#23201b`, `#f3e0d2`, `#3a2620`, `#e2a468`                                                                                      |
| `.tab-settings-menu`                   |    5 | `#f6e6dd`\*, `#c67139`, `#141210`, `#2c231c`, `rgba(20, 18, 16, 0.55)`                                                                     |
| `.compact-train`                       |    4 | `rgba(249, 115, 22, 0.08)`, `rgba(249, 115, 22, 0.2)`, `rgba(249, 115, 22, 0.12)`, `rgba(249, 115, 22, 0.3)`                               |
| `.compact-train-fold-btn`              |    4 | `rgba(249, 115, 22, 0.45)`, `#ea580c`, `rgba(251, 146, 60, 0.45)`, `#fdba74`                                                               |
| `.compact-zone-inline`                 |    4 | `#fef3c7`, `#fde68a`, `#fcd34d`, `#f97316`                                                                                                 |
| `.game-notification`                   |    4 | `#b45309`, `#d97706`, `rgba(251, 191, 36, 0.3)`, `rgba(234, 179, 8, 0.4)`                                                                  |
| `.hdr-settings-sheet__chips`           |    4 | `#c67139`, `#2b1608`                                                                                                                       |
| `.mpc-grams-btn`                       |    4 | `#fef3c7`, `#fde68a`, `#f59e0b`, `#92400e`                                                                                                 |
| `.profile-section`                     |    4 | `rgba(138, 74, 32, 0.06)`, `rgba(198, 113, 57, 0.12)`, `#e2a468`, `rgba(226, 164, 104, 0.14)`                                              |
| `.cloud-sync-indicator`                |    3 | `#f59e0b`, `rgba(245, 158, 11, 0.15)`                                                                                                      |
| `.ct-wb-ex-name-suggest-fav`           |    3 | `#f59e0b`, `rgba(245, 158, 11, 0.12)`, `#fbbf24`                                                                                           |
| `.ct-wb-ex-row`                        |    3 | `#f59e0b`, `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.12)`                                                                          |
| `.date-picker-streak`                  |    3 | `#fef3c7`, `#fde68a`, `#92400e`                                                                                                            |
| `.game-xp`                             |    3 | `#fbbf24`, `#fde047`, `rgba(253, 224, 71, 0.9)`                                                                                            |
| `.hdr-settings-sheet__chip`            |    3 | `#efe3cf`, `#c67139`, `#2f2820`                                                                                                            |
| `.meal-collapsed-plaque`               |    3 | `rgba(255, 237, 213, 0.98)`, `rgba(254, 215, 170, 0.9)`, `#c2410c`                                                                         |
| `.meal-header-inside`                  |    3 | `#ffedd5`, `#fed7aa`, `#c2410c`                                                                                                            |
| `.meal-time-badge-inside`              |    3 | `#fef3c7`, `#92400e`, `#fde68a`                                                                                                            |
| `.profile-message`                     |    3 | `rgba(138, 74, 32, 0.1)`, `#a1471c`\*, `rgba(161, 71, 28, 0.18)`                                                                           |
| `.tabs`                                |    3 | `#141210`, `#e2a468`, `#2f2820`                                                                                                            |
| `.compact-badge`                       |    2 | `#f97316`, `#ea580c`                                                                                                                       |
| `.ct-wb-ex-ss-connector`               |    2 | `rgba(245, 158, 11, 0.65)`, `rgba(245, 158, 11, 0.08)`                                                                                     |
| `.game-daily-bonus`                    |    2 | `#f59e0b`, `#d97706`                                                                                                                       |
| `.game-expand-btn`                     |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.5)`                                                                                                       |
| `.game-multiplier`                     |    2 | `#fbbf24`, `rgba(251, 191, 36, 0.2)`                                                                                                       |
| `.game-panel-expanded`                 |    2 | `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.12)`                                                                                         |
| `.hdr-settings-sheet__close`           |    2 | `#3a2a22`, `#e8925a`                                                                                                                       |
| `.hdr-settings-sheet__diag-toggle`     |    2 | `#8a4a20`                                                                                                                                  |
| `.hdr-settings-sheet__fab-notice`      |    2 | `#f6e6dd`\*, `#3a2d26`                                                                                                                     |
| `.hdr-settings-sheet__fab-ok`          |    2 | `#8a4a20`, `#d08a52`                                                                                                                       |
| `.hdr-settings-sheet__meta-text`       |    2 | `#8a4a20`, `#e2a468`                                                                                                                       |
| `.hdr-settings-sheet__tier`            |    2 | `#8a4a20`, `#e2a468`                                                                                                                       |
| `.meal-sep`                            |    2 | `#c2410c`                                                                                                                                  |
| `.meal-sticky-bar__time`               |    2 | `#fef3c7`, `#b45309`                                                                                                                       |
| `.meal-time-badge`                     |    2 | `#fef3c7`, `#92400e`                                                                                                                       |
| `.profile-accordion`                   |    2 | `rgba(138, 74, 32, 0.12)`, `rgba(138, 74, 32, 0.14)`                                                                                       |
| `.profile-advice-chip`                 |    2 | `rgba(138, 74, 32, 0.1)`, `rgba(198, 113, 57, 0.35)`                                                                                       |
| `.profile-hr-zone__chip`               |    2 | `rgba(138, 74, 32, 0.08)`, `rgba(138, 74, 32, 0.12)`                                                                                       |
| `.push-badge`                          |    2 | `#d97706`, `rgba(217, 119, 6, 0.22)`                                                                                                       |
| `.xp-bar-fill`                         |    2 | `#fbbf24`, `#f59e0b`                                                                                                                       |
| `0%`                                   |    2 | `rgba(253, 224, 71, 0.6)`, `rgba(245, 158, 11, 0.4)`                                                                                       |
| `0%, 100%`                             |    2 | `rgba(234, 179, 8, 0.3)`                                                                                                                   |
| `100%`                                 |    2 | `rgba(253, 224, 71, 0.7)`, `rgba(245, 158, 11, 0.0)`                                                                                       |
| `50%`                                  |    2 | `rgba(234, 179, 8, 0.6)`                                                                                                                   |
| `.achievement-badge`                   |    1 | `rgba(234, 179, 8, 0.5)`                                                                                                                   |
| `.compact-zone-kcal`                   |    1 | `#f97316`                                                                                                                                  |
| `.ct-wb-ex-ap-pr`                      |    1 | `rgba(245, 158, 11, 0.55)`                                                                                                                 |
| `.ct-wb-ex-ap-row`                     |    1 | `rgba(245, 158, 11, 0.5)`                                                                                                                  |
| `.ct-wb-ex-folded-pr`                  |    1 | `rgba(245, 158, 11, 0.55)`                                                                                                                 |
| `.ct-wb-summary-emoji`                 |    1 | `rgba(245, 158, 11, 0.55)`                                                                                                                 |
| `.default-home-badge`                  |    1 | `rgba(249, 115, 22, 0.5)`                                                                                                                  |
| `.game-level-number`                   |    1 | `#e2a468`                                                                                                                                  |
| `.game-personal-best`                  |    1 | `#fbbf24`                                                                                                                                  |
| `.game-progress`                       |    1 | `rgba(255, 215, 0, 0.6)`                                                                                                                   |
| `.game-streak-chip__icon`              |    1 | `#c67139`                                                                                                                                  |
| `.game-weekly-card`                    |    1 | `rgba(234, 179, 8, 0.4)`                                                                                                                   |
| `.hdr-settings-sheet__diag-btn`        |    1 | `#141210`                                                                                                                                  |
| `.hdr-settings-sheet__diag-panel`      |    1 | `#23201b`                                                                                                                                  |
| `.hdr-settings-sheet__fab-notice-icon` |    1 | `#8a4a20`                                                                                                                                  |
| `.hdr-settings-sheet__group`           |    1 | `#23201b`                                                                                                                                  |
| `.hdr-settings-sheet__head`            |    1 | `#14110f`                                                                                                                                  |
| `.hdr-settings-sheet__row`             |    1 | `#e2a468`                                                                                                                                  |
| `.legend-item`                         |    1 | `#f97316`                                                                                                                                  |
| `.meal-type-preview-value`             |    1 | `#c2410c`                                                                                                                                  |
| `.measurements-card`                   |    1 | `#fed7aa`                                                                                                                                  |
| `.measurements-card__badge`            |    1 | `#ea580c`                                                                                                                                  |
| `.measurements-card__row`              |    1 | `#fbbf24`                                                                                                                                  |
| `.measurements-card__warn`             |    1 | `#b45309`                                                                                                                                  |
| `.notif-first-category`                |    1 | `#fbbf24`                                                                                                                                  |
| `.notify-detail`                       |    1 | `rgba(80, 50, 20, 0.1)`                                                                                                                    |
| `.past-day-banner`                     |    1 | `#f3e0d2`                                                                                                                                  |
| `.past-day-banner__text`               |    1 | `#8a4a20`                                                                                                                                  |
| `.past-day-banner__today`              |    1 | `#c67139`                                                                                                                                  |
| `.profile-consent-row`                 |    1 | `rgba(138, 74, 32, 0.1)`                                                                                                                   |
| `.profile-field-group`                 |    1 | `rgba(198, 113, 57, 0.12)`                                                                                                                 |
| `.profile-goal-metric`                 |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-goal-panel`                  |    1 | `rgba(138, 74, 32, 0.1)`                                                                                                                   |
| `.profile-goal-panel__source`          |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-goal-progress`               |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-goal-warn`                   |    1 | `#a1471c`\*                                                                                                                                |
| `.profile-hr-zone`                     |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-hr-zone__name`               |    1 | `rgba(138, 74, 32, 0.1)`                                                                                                                   |
| `.profile-inline-checks`               |    1 | `rgba(138, 74, 32, 0.1)`                                                                                                                   |
| `.profile-ios-install`                 |    1 | `rgba(138, 74, 32, 0.12)`                                                                                                                  |
| `.profile-progress-bar`                |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-push-input`                  |    1 | `rgba(138, 74, 32, 0.16)`                                                                                                                  |
| `.profile-push-status`                 |    1 | `rgba(138, 74, 32, 0.08)`                                                                                                                  |
| `.profile-push-status__btn`            |    1 | `rgba(138, 74, 32, 0.28)`                                                                                                                  |
| `.profile-subscription-card`           |    1 | `rgba(198, 113, 57, 0.18)`                                                                                                                 |
| `.profile-weight-diff`                 |    1 | `#a1471c`\*                                                                                                                                |
| `.roadmap-item`                        |    1 | `rgba(255, 215, 0, 0.15)`                                                                                                                  |
| `.roadmap-you`                         |    1 | `#fbbf24`                                                                                                                                  |
| `.swipeable-action-btn`                |    1 | `#f59e0b`                                                                                                                                  |
| `.tab`                                 |    1 | `rgba(249, 115, 22, 0.4)`                                                                                                                  |
| `.tab-settings-diary-toggle__knob`     |    1 | `rgba(80, 50, 20, 0.3)`                                                                                                                    |
| `.tone-amber`                          |    1 | `#fde68a`                                                                                                                                  |
| `.tone-green`                          |    1 | `#f9c58d`                                                                                                                                  |
| `.weekly-progress-fill`                |    1 | `#eab308`                                                                                                                                  |
| `.xp-bar-value`                        |    1 | `#fbbf24`                                                                                                                                  |
| `30%`                                  |    1 | `#fbbf24`                                                                                                                                  |
| `40%`                                  |    1 | `rgba(253, 224, 71, 1)`                                                                                                                    |
| `70%`                                  |    1 | `rgba(245, 158, 11, 0.7)`                                                                                                                  |

### `heys-components.css` — 198

Зоны: `checkin-morning`, `home-widgets`, `pwa-update`, `spinners`, `undo-bar`

| семейство                                          | мест | литералы                                                                                                                                                    |
| -------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.onboarding-fusion__medal`                        |   11 | `#fff8dc`, `#fbbf24`, `#b45309`, `rgba(234, 179, 8, 0.9)`, `rgba(250, 204, 21, 0.6)`, `rgba(250, 204, 21, 0.3)`, … (+4)                                     |
| `.meal-role-coach-card`                            |    9 | `rgba(245, 158, 11, 0.2)`, `#f59e0b`, `rgba(245, 158, 11, 0.14)`, `#b45309`, `rgba(120, 53, 15, 0.3)`, `rgba(245, 158, 11, 0.15)`, … (+1)                   |
| `.meal-rec-card__advisory`                         |    8 | `rgba(251, 191, 36, 0.08)`, `#fbbf24`, `#78350f`, `rgba(245, 158, 11, 0.08)`, `#f59e0b`, `rgba(251, 191, 36, 0.12)`, … (+1)                                 |
| `.monthly-reports-legend__item`                    |    8 | `#92400e`, `rgba(250, 204, 21, 0.2)`, `rgba(245, 158, 11, 0.24)`, `#fde68a`, `rgba(250, 204, 21, 0.16)`, `rgba(250, 204, 21, 0.28)`                         |
| `.onboarding-medal`                                |    8 | `#fff4c2`, `#fbbf24`, `rgba(234, 179, 8, 0.9)`, `rgba(250, 204, 21, 0.9)`, `#fcd34d`, `#b45309`, … (+2)                                                     |
| `.sync-lock-overlay__vpn-badge`                    |    8 | `#92400e`, `rgba(251, 191, 36, 0.14)`, `rgba(251, 191, 36, 0.45)`, `rgba(251, 191, 36, 0.08)`, `#fcd34d`, `rgba(251, 191, 36, 0.1)`, … (+2)                 |
| `.client-dropdown-leaderboard__head-balance-badge` |    7 | `rgba(254, 240, 138, 0.7)`, `rgba(251, 191, 36, 0.38)`, `#92400e`, `rgba(120, 53, 15, 0.62)`, `rgba(113, 63, 18, 0.86)`, `rgba(251, 191, 36, 0.28)`, … (+1) |
| `.confirm-modal-btn`                               |    7 | `#f59e0b`, `#d97706`, `#b45309`, `rgba(180, 83, 9, 0.65)`                                                                                                   |
| `.diary-fiber-panel__chip`                         |    6 | `rgba(217, 119, 6, 0.18)`, `rgba(254, 243, 199, 0.68)`, `#92400e`, `rgba(251, 191, 36, 0.24)`, `rgba(120, 53, 15, 0.32)`, `#fcd34d`                         |
| `.weekly-wrap-step__badge`                         |    6 | `#ffedd5`, `#c2410c`, `#fdba74`, `rgba(251, 146, 60, 0.2)`, `#f97316`                                                                                       |
| `.weekly-wrap-step__stat`                          |    6 | `rgba(255, 237, 213, 0.96)`, `rgba(253, 186, 116, 0.82)`, `#fbbf24`, `#f97316`, `rgba(194, 65, 12, 0.24)`, `rgba(251, 146, 60, 0.34)`                       |
| `.game-streak__flame`                              |    5 | `rgba(245, 158, 11, 0.5)`, `rgba(245, 158, 11, 0.45)`, `rgba(245, 158, 11, 0.6)`, `rgba(249, 115, 22, 0.7)`, `rgba(250, 204, 21, 0.8)`                      |
| `.weekly-wrap-breakdown__note`                     |    5 | `rgba(253, 186, 116, 0.5)`, `#9a3412`, `rgba(124, 45, 18, 0.24)`, `rgba(251, 146, 60, 0.36)`, `#fdba74`                                                     |
| `.completeness-score`                              |    4 | `#fef3c7`, `#92400e`, `#78350f`, `#fcd34d`                                                                                                                  |
| `.date-picker-streak`                              |    4 | `rgba(146, 64, 14, 0.56)`, `rgba(120, 53, 15, 0.78)`, `#fde68a`, `rgba(251, 191, 36, 0.24)`                                                                 |
| `.meal-rec-card__macro-chip`                       |    4 | `#fef3c7`, `#92400e`, `rgba(251, 191, 36, 0.2)`, `#fcd34d`                                                                                                  |
| `.meal-rec-card__meal-badge`                       |    4 | `#fef3c7`, `#92400e`, `rgba(251, 191, 36, 0.15)`, `#fcd34d`                                                                                                 |
| `.monthly-week-card`                               |    4 | `rgba(250, 204, 21, 0.2)`, `rgba(245, 158, 11, 0.3)`, `rgba(250, 204, 21, 0.18)`, `rgba(250, 204, 21, 0.32)`                                                |
| `.pe-warning`                                      |    4 | `#92400e`, `#2a1f0a`, `#713f12`, `#facc15`                                                                                                                  |
| `.product-name-cell__badge`                        |    4 | `#fef3c7`, `#b45309`, `rgba(251, 191, 36, 0.2)`, `#fcd34d`                                                                                                  |
| `.reports-legacy-banner`                           |    4 | `#fde68a`, `#92400e`, `rgba(251, 191, 36, 0.12)`, `rgba(251, 191, 36, 0.3)`                                                                                 |
| `.action-card__priority`                           |    3 | `#f97316`, `#ea580c`, `#ca8a04`                                                                                                                             |
| `.advice-diagnostics-stat-card`                    |    3 | `rgba(254, 243, 199, 0.92)`, `rgba(245, 158, 11, 0.22)`, `rgba(120, 53, 15, 0.92)`                                                                          |
| `.info-modal__debug`                               |    3 | `rgba(120, 53, 15, 0.18)`, `rgba(251, 191, 36, 0.18)`, `#fde68a`                                                                                            |
| `.onboarding-fusion__btn`                          |    3 | `#fbbf24`, `#f59e0b`, `rgba(250, 204, 21, 0.5)`                                                                                                             |
| `.weekly-wrap-breakdown__badge`                    |    3 | `#ffedd5`, `#c2410c`, `#fdba74`                                                                                                                             |
| `.widget`                                          |    3 | `rgba(120, 53, 15, 0.36)`, `#fde68a`, `rgba(251, 191, 36, 0.22)`                                                                                            |
| `50%`                                              |    3 | `rgba(250, 204, 21, 0.5)`, `rgba(250, 204, 21, 0.7)`, `rgba(250, 204, 21, 0.3)`                                                                             |
| `.advice-diagnostics-grade`                        |    2 | `#fef3c7`, `#b45309`                                                                                                                                        |
| `.confidence-badge`                                |    2 | `#facc15`                                                                                                                                                   |
| `.diary-fiber-panel__hide`                         |    2 | `rgba(217, 119, 6, 0.24)`, `#92400e`                                                                                                                        |
| `.diary-fiber-panel__week-bar`                     |    2 | `rgba(251, 191, 36, 0.92)`, `rgba(217, 119, 6, 0.9)`                                                                                                        |
| `.flying-xp-item`                                  |    2 | `#fbbf24`, `rgba(251, 191, 36, 0.6)`                                                                                                                        |
| `.game-mission-card__bar-fill`                     |    2 | `#f59e0b`, `#fbbf24`                                                                                                                                        |
| `.game-missions-dot`                               |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.6)`                                                                                                                        |
| `.goal-progress-bar`                               |    2 | `rgba(245, 158, 11, 0.18)`, `rgba(234, 179, 8, 0.18)`                                                                                                       |
| `.info-modal__section`                             |    2 | `rgba(120, 53, 15, 0.22)`, `rgba(251, 191, 36, 0.34)`                                                                                                       |
| `.onboarding-fusion__xp`                           |    2 | `#fbbf24`, `rgba(250, 204, 21, 0.5)`                                                                                                                        |
| `.reports-legacy-banner__text`                     |    2 | `#b45309`, `#fcd34d`                                                                                                                                        |
| `.score-explainer-modal__category-score`           |    2 | `rgba(245, 158, 11, 0.14)`, `#d97706`                                                                                                                       |
| `.score-explainer-modal__signal-chip`              |    2 | `#7c2d12`, `#fed7aa`                                                                                                                                        |
| `.tab-advice-badge`                                |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.8)`                                                                                                                        |
| `0%`                                               |    2 | `rgba(250, 204, 21, 0.9)`, `rgba(250, 204, 21, 0.5)`                                                                                                        |
| `.achievement-story-label`                         |    1 | `#f59e0b`                                                                                                                                                   |
| `.dual-risk-panel__status-warn`                    |    1 | `#fcd34d`                                                                                                                                                   |
| `.game-mission-card__xp`                           |    1 | `#fbbf24`                                                                                                                                                   |
| `.game-missions-inline`                            |    1 | `#f59e0b`                                                                                                                                                   |
| `.hdr`                                             |    1 | `#141210`                                                                                                                                                   |
| `.hdr-top`                                         |    1 | `#f5ead8`                                                                                                                                                   |
| `.heys-system-banner`                              |    1 | `#1c1712`                                                                                                                                                   |
| `.heys-update-prompt__backdrop`                    |    1 | `rgba(42, 26, 12, 0.9)`                                                                                                                                     |
| `.mc-modal`                                        |    1 | `#c67139`                                                                                                                                                   |
| `.meal-plate-guide__effect`                        |    1 | `#ea580c`                                                                                                                                                   |
| `.meal-rec-card__timeline-dot`                     |    1 | `#f59e0b`                                                                                                                                                   |
| `.meal-rec-card__timeline-track`                   |    1 | `#fef3c7`                                                                                                                                                   |
| `.onboarding-fusion__ray`                          |    1 | `rgba(250, 204, 21, 0.8)`                                                                                                                                   |
| `.onboarding-fusion__ring`                         |    1 | `rgba(250, 204, 21, 0.3)`                                                                                                                                   |
| `.score-explainer-modal__summary-value`            |    1 | `#ea580c`                                                                                                                                                   |
| `.weekly-wrap-step__delta-pct`                     |    1 | `#f59e0b`                                                                                                                                                   |
| `.weekly-wrap-step__macros`                        |    1 | `#f59e0b`                                                                                                                                                   |
| `.weekly-wrap-step__stat-value`                    |    1 | `#f59e0b`                                                                                                                                                   |
| `.widget-relapse-risk__dev-compare-card`           |    1 | `rgba(254, 243, 199, 0.94)`                                                                                                                                 |
| `0%, 100%`                                         |    1 | `rgba(250, 204, 21, 0.2)`                                                                                                                                   |
| `100%`                                             |    1 | `rgba(250, 204, 21, 0.9)`                                                                                                                                   |

### `730-widgets-dashboard.css` — 178

Зоны: `home-widgets`, `nutrition-tab`

| семейство                             | мест | литералы                                                                                                                                                                      |
| ------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.widgets-quick-pencil`               |   12 | `#efe3cf`, `#8a4a20`, `rgba(80, 50, 20, 0.1)`, `rgba(80, 50, 20, 0.14)`, `#f6e6dd`\*, `#c67139`, … (+4)                                                                       |
| `.widgets-tab`                        |   10 | `#141210`, `#23201b`, `#2f2820`, `rgba(80, 50, 20, 0.22)`, `#c67139`, `#7a4218`                                                                                               |
| `.reports-overview-card`              |    9 | `rgba(234, 88, 12, 0.26)`, `rgba(255, 237, 213, 0.96)`, `rgba(254, 215, 170, 0.94)`, `rgba(234, 88, 12, 0.14)`, `#7c2d12`, `rgba(249, 115, 22, 0.35)`, … (+3)                 |
| `.reports-overview-card__stat`        |    8 | `rgba(251, 146, 60, 0.18)`, `rgba(154, 52, 18, 0.06)`, `rgba(251, 146, 60, 0.28)`, `rgba(154, 52, 18, 0.08)`, `rgba(255, 237, 213, 0.08)`, `rgba(251, 146, 60, 0.16)`, … (+2) |
| `.widget`                             |    7 | `rgba(251, 191, 36, 0.4)`, `rgba(251, 191, 36, 0.25)`, `rgba(249, 115, 22, 0.4)`, `rgba(255, 214, 10, 0.12)`, `#FFD60A`, `#FFEA80`, … (+1)                                    |
| `.empty-meal-alert`                   |    6 | `rgba(234, 88, 12, 0.58)`, `rgba(254, 215, 170, 0.92)`, `rgba(194, 65, 12, 0.14)`, `rgba(251, 146, 60, 0.62)`, `rgba(67, 33, 18, 0.98)`, `rgba(124, 45, 18, 0.92)`            |
| `.widget-relapse-risk__action-card`   |    6 | `rgba(251, 191, 36, 0.22)`, `rgba(245, 158, 11, 0.1)`, `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.07)`, `rgba(245, 158, 11, 0.22)`, `rgba(245, 158, 11, 0.08)`         |
| `.widgets-quick-fab`                  |    6 | `#c67139`, `#2b1608`, `rgba(80, 50, 20, 0.14)`, `rgba(120, 60, 20, 0.28)`, `#cf8144`, `#1a0f04`                                                                               |
| `.widgets-quick-chip`                 |    5 | `#8a4a20`, `rgba(80, 50, 20, 0.1)`, `rgba(80, 50, 20, 0.14)`, `#23201b`, `#e2a468`                                                                                            |
| `.widgets-settings-fab`               |    5 | `rgba(80, 50, 20, 0.1)`, `rgba(80, 50, 20, 0.14)`, `rgba(20, 18, 16, 0.85)`, `#23201b`, `#e2a468`                                                                             |
| `.widget-crash-risk__ews-badge`       |    4 | `rgba(249, 115, 22, 0.15)`, `#ea580c`, `rgba(251, 146, 60, 0.2)`, `#fb923c`                                                                                                   |
| `.widgets-header__btn`                |    4 | `rgba(249, 115, 22, 0.12)`, `rgba(249, 115, 22, 0.18)`, `#fdba74`                                                                                                             |
| `.widgets-quick-minus`                |    4 | `#f6e6dd`_, `#8a4a20`, `#3a241a`_, `#e2a468`                                                                                                                                  |
| `.widgets-quick-sheet__chip`          |    4 | `#efe3cf`, `#8a4a20`, `#2f2820`, `#e2a468`                                                                                                                                    |
| `.reports-overview-card__action`      |    3 | `rgba(251, 146, 60, 0.22)`, `rgba(255, 237, 213, 0.1)`, `rgba(251, 146, 60, 0.18)`                                                                                            |
| `.reports-overview-card__count`       |    3 | `rgba(251, 146, 60, 0.26)`, `rgba(154, 52, 18, 0.48)`, `rgba(251, 146, 60, 0.24)`                                                                                             |
| `.widget-heatmap__cell`               |    3 | `#eab308`, `#fbbf24`, `rgba(234, 179, 8, 0.3)`                                                                                                                                |
| `.widget-macros__bar`                 |    3 | `#FFD60A`, `#FFEA80`, `rgba(255, 214, 10, 0.3)`                                                                                                                               |
| `.widget-relapse-risk__action-icon`   |    3 | `#f59e0b`, `#fbbf24`, `rgba(245, 158, 11, 0.2)`                                                                                                                               |
| `.widget-v4-catalog__remove-btn`      |    3 | `#c67139`, `#cf8144`, `#e2a468`                                                                                                                                               |
| `.widgets-quick-sheet`                |    3 | `rgba(80, 50, 20, 0.14)`, `rgba(80, 50, 20, 0.26)`, `#23201b`                                                                                                                 |
| `.empty-meal-alert__action`           |    2 | `rgba(154, 52, 18, 0.24)`, `rgba(194, 65, 12, 0.28)`                                                                                                                          |
| `.empty-meal-alert__copy`             |    2 | `#7c2d12`                                                                                                                                                                     |
| `.empty-meal-alert__icon`             |    2 | `#ea580c`, `rgba(194, 65, 12, 0.2)`                                                                                                                                           |
| `.page-reports`                       |    2 | `#141210`                                                                                                                                                                     |
| `.reports-overview-card__body`        |    2 | `rgba(124, 45, 18, 0.82)`, `rgba(255, 237, 213, 0.82)`                                                                                                                        |
| `.reports-overview-card__stat-label`  |    2 | `rgba(124, 45, 18, 0.62)`, `rgba(255, 237, 213, 0.64)`                                                                                                                        |
| `.widget-insulin__status`             |    2 | `rgba(249, 115, 22, 0.12)`, `rgba(234, 179, 8, 0.12)`                                                                                                                         |
| `.widget-macros__bar-fill`            |    2 | `#FFD60A`, `#FFEA80`                                                                                                                                                          |
| `.widget-relapse-risk__modal-content` |    2 | `rgba(251, 191, 36, 0.08)`                                                                                                                                                    |
| `.widget-streak__record`              |    2 | `#FFD60A`, `#FF9F0A`                                                                                                                                                          |
| `.widget-streak__value`               |    2 | `#FF9500`, `#FF6B00`                                                                                                                                                          |
| `.widget-v4-hero-num__val`            |    2 | `#8a4a20`                                                                                                                                                                     |
| `.widget-v4-hold-hint__pill`          |    2 | `rgba(198, 113, 57, 0.16)`, `#8a4a20`                                                                                                                                         |
| `.widget-v4-periods__btn`             |    2 | `#8a4a20`, `#c67139`                                                                                                                                                          |
| `.widget-v4-row__value`               |    2 | `#8a4a20`                                                                                                                                                                     |
| `.widget-v4-spark`                    |    2 | `#c67139`                                                                                                                                                                     |
| `.widget-wd`                          |    2 | `#c67139`, `#2f2820`                                                                                                                                                          |
| `.widgets-longpress-hint`             |    2 | `rgba(80, 50, 20, 0.1)`, `rgba(80, 50, 20, 0.3)`                                                                                                                              |
| `.widgets-quick-sheet__row-icon`      |    2 | `#8a4a20`, `#e2a468`                                                                                                                                                          |
| `0%, 100%`                            |    2 | `rgba(249, 115, 22, 0.4)`, `rgba(255, 214, 10, 0.4)`                                                                                                                          |
| `50%`                                 |    2 | `rgba(249, 115, 22, 0.6)`, `rgba(255, 214, 10, 0)`                                                                                                                            |
| `.heys-android`                       |    1 | `#141210`                                                                                                                                                                     |
| `.page-day`                           |    1 | `#141210`                                                                                                                                                                     |
| `.pct-badge`                          |    1 | `rgba(234, 179, 8, 0.12)`                                                                                                                                                     |
| `.reports-fullscreen-modal`           |    1 | `rgba(67, 20, 7, 0.98)`                                                                                                                                                       |
| `.widget-bd-sheet__driver-mark`       |    1 | `#c9922e`\*                                                                                                                                                                   |
| `.widget-bd-sheet__driver-row`        |    1 | `#c9922e`\*                                                                                                                                                                   |
| `.widget-bd-sheet__factor-bar`        |    1 | `#c9922e`\*                                                                                                                                                                   |
| `.widget-calories__hero-bar-fill`     |    1 | `#c67139`                                                                                                                                                                     |
| `.widget-calories__hero-value`        |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-cascade__badge`              |    1 | `rgba(245, 158, 11, 0.16)`                                                                                                                                                    |
| `.widget-cascade__dot`                |    1 | `#facc15`                                                                                                                                                                     |
| `.widget-crash-risk`                  |    1 | `#fb923c`                                                                                                                                                                     |
| `.widget-sleep__star`                 |    1 | `rgba(255, 214, 10, 0.4)`                                                                                                                                                     |
| `.widget-streak__fire`                |    1 | `rgba(249, 115, 22, 0.4)`                                                                                                                                                     |
| `.widget-v4-catalog__blocked-text`    |    1 | `#e08a72`                                                                                                                                                                     |
| `.widget-v4-empty__btn`               |    1 | `#c67139`                                                                                                                                                                     |
| `.widget-v4-mini__value`              |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-v4-stack__footer`            |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-v4-tile`                     |    1 | `#c67139`                                                                                                                                                                     |
| `.widget-v4-val`                      |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-v4-warn`                     |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-wd-sheet`                    |    1 | `rgba(80, 50, 20, 0.22)`                                                                                                                                                      |
| `.widget-wd-sheet__opt`               |    1 | `rgba(207, 129, 68, 0.18)`                                                                                                                                                    |
| `.widgets-grid`                       |    1 | `#c67139`                                                                                                                                                                     |
| `.widgets-quick-scrim`                |    1 | `rgba(43, 22, 8, 0.34)`                                                                                                                                                       |

### `500-pwa-and-offline.css` — 71

Зоны: `checkin-morning`, `cycle`, `registration`, `settings-system`

| семейство                             | мест | литералы                                                                    |
| ------------------------------------- | ---: | --------------------------------------------------------------------------- |
| `.mc-steps-btn`                       |   11 | `#f59e0b`, `#fef3c7`, `rgba(245, 158, 11, 0.2)`, `rgba(245, 158, 11, 0.15)` |
| `.ios-home-install-modal__btn`        |    6 | `#efe3cf`, `#c67139`, `#2b1608`, `#23201b`, `#cf8144`, `#201509`            |
| `.mc-steps-footer-hint`               |    5 | `#fef3c7`, `#fcd34d`, `rgba(251, 191, 36, 0.15)`, `rgba(251, 191, 36, 0.3)` |
| `.ios-home-install-modal__num`        |    4 | `#efe3cf`, `#c67139`, `#2f2820`, `#cf8144`                                  |
| `.mc-streak-badge`                    |    4 | `#fef3c7`, `#fde68a`, `rgba(251, 191, 36, 0.2)`, `rgba(245, 158, 11, 0.15)` |
| `.ca-modal`                           |    2 | `rgba(40, 20, 0, 0.34)`, `#191613`                                          |
| `.ca-modal__ack-btn`                  |    2 | `#cf8144`, `#201509`                                                        |
| `.ca-modal__later-btn`                |    2 | `rgba(198, 113, 57, 0.35)`, `#23201b`                                       |
| `.ca-tab-dot-mark`                    |    2 | `#cf8144`, `#141210`                                                        |
| `.household-steps-hint`               |    2 | `#9a3412`, `#fed7aa`                                                        |
| `.ios-home-install-modal`             |    2 | `#1a1714`, `rgba(40, 24, 8, 0.34)`                                          |
| `.ios-home-install-modal__phone`      |    2 | `#c67139`, `#cf8144`                                                        |
| `.mc-modal`                           |    2 | `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.12)`                          |
| `.mc-recorded-row__kcal`              |    2 | `#8a4a20`, `#e2a468`                                                        |
| `.mc-rest-consent-banner`             |    2 | `rgba(198, 113, 57, 0.08)`, `rgba(198, 113, 57, 0.18)`                      |
| `.mc-steps-bonus`                     |    2 | `#ea580c`, `#fb923c`                                                        |
| `.ca-modal__date-kcal`                |    1 | `#e2a468`                                                                   |
| `.ca-modal__item`                     |    1 | `#23201b`                                                                   |
| `.ios-home-install-modal__close`      |    1 | `rgba(26, 23, 20, 0.42)`                                                    |
| `.ios-home-install-modal__footnote`   |    1 | `rgba(26, 23, 20, 0.45)`                                                    |
| `.ios-home-install-modal__lead`       |    1 | `rgba(26, 23, 20, 0.5)`                                                     |
| `.ios-home-install-modal__step-hint`  |    1 | `rgba(26, 23, 20, 0.5)`                                                     |
| `.ios-home-install-modal__step-icon`  |    1 | `rgba(26, 23, 20, 0.28)`                                                    |
| `.ios-home-install-modal__step-title` |    1 | `#1a1714`                                                                   |
| `.ios-home-install-modal__title`      |    1 | `#1a1714`                                                                   |
| `.ios-pwa-banner`                     |    1 | `rgba(80, 50, 20, 0.1)`                                                     |
| `.ios-share-icon`                     |    1 | `#f0dcc6`                                                                   |
| `.ios-step-num`                       |    1 | `#f0dcc6`                                                                   |
| `.mc-recorded-card`                   |    1 | `#2c231c`                                                                   |
| `.mc-recorded-row__mark`              |    1 | `#8a4a20`                                                                   |
| `.mc-rest-consent-card`               |    1 | `rgba(198, 113, 57, 0.28)`                                                  |
| `.mc-steps-value`                     |    1 | `#f59e0b`                                                                   |
| `.mc-streak-count`                    |    1 | `#b45309`                                                                   |
| `.mc-streak-text`                     |    1 | `#d97706`                                                                   |
| `.pwa-banner-content`                 |    1 | `rgba(80, 50, 20, 0.1)`                                                     |

### `733-ui-v4-login-theme.css` — 68

Зоны: `login`

| семейство                                | мест | литералы                                                 |
| ---------------------------------------- | ---: | -------------------------------------------------------- |
| `.heys-auth-card`                        |   11 | `#141210`, `#efe3cf`, `#23201b`, `#c67139`, `#2b1608`    |
| `.heys-consent-sign-sheet`               |    5 | `rgba(40, 20, 0, 0.28)`, `#c67139`, `#141210`, `#23201b` |
| `.heys-auth-field`                       |    4 | `#c67139`, `#2f2820`, `#cf8144`                          |
| `.heys-consent-sign-sheet__primary`      |    4 | `#c67139`, `#2b1608`, `#cf8144`, `#201509`               |
| `.consent-fulltext__accept`              |    3 | `#23201b`, `#cf8144`, `#201509`                          |
| `.consent-fulltext__badge`               |    3 | `#2c231c`, `#e2a468`, `#23201b`                          |
| `.heys-auth-pin-input`                   |    3 | `#c67139`, `#f3e0d2`                                     |
| `.heys-auth-shell`                       |    3 | `#efe3cf`, `#2f2820`                                     |
| `.consent-fulltext`                      |    2 | `rgba(40, 20, 0, 0.34)`, `#141210`                       |
| `.heys-auth-pep-dock`                    |    2 | `#efe3cf`, `#2f2820`                                     |
| `.heys-auth-pin-section`                 |    2 | `#a1471c`\*, `#cf8144`                                   |
| `.heys-auth-support-link`                |    2 | `#8a4a20`, `#e2a468`                                     |
| `.heys-consent-sign-sheet__doc-version`  |    2 | `#8a4a20`, `#e2a468`                                     |
| `.heys-consent-sign-sheet__done-icon`    |    2 | `#2c231c`, `#e2a468`                                     |
| `.consent-doc-bq`                        |    1 | `#23201b`                                                |
| `.consent-doc-li`                        |    1 | `#cf8144`                                                |
| `.consent-fulltext__close`               |    1 | `#23201b`                                                |
| `.consent-fulltext__progress-fill`       |    1 | `#cf8144`                                                |
| `.consent-fulltext__progress-label`      |    1 | `#e2a468`                                                |
| `.consent-fulltext-backdrop`             |    1 | `rgba(42, 26, 12, 0.5)`                                  |
| `.heys-auth-btn`                         |    1 | `#c67139`                                                |
| `.heys-auth-error`                       |    1 | `#a1471c`\*                                              |
| `.heys-auth-error-slot`                  |    1 | `#a1471c`\*                                              |
| `.heys-auth-input`                       |    1 | `#c67139`                                                |
| `.heys-auth-key`                         |    1 | `#23201b`                                                |
| `.heys-auth-maintenance-block`           |    1 | `#efe3cf`                                                |
| `.heys-auth-notice`                      |    1 | `#efe3cf`                                                |
| `.heys-auth-support-action`              |    1 | `#c67139`                                                |
| `.heys-consent-sign-sheet__doc-card`     |    1 | `#23201b`                                                |
| `.heys-consent-sign-sheet__doc-link`     |    1 | `#8a4a20`                                                |
| `.heys-consent-sign-sheet__doc-link-row` |    1 | `#23201b`                                                |
| `.heys-consent-sign-sheet__kicker`       |    1 | `#8a4a20`                                                |
| `.heys-login-theme__chip`                |    1 | `#c67139`                                                |
| `.heys-login-theme__soft-card`           |    1 | `#c67139`                                                |

### `400-water-and-hydration.css` — 60

Зоны: `nutrition-tab`, `tips`

| семейство                             | мест | литералы                                                                                               |
| ------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------ |
| `.advice-list-container`              |   12 | `#efe3cf`, `#8a4a20`, `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.12)`, `#c67139`, `#141210`, … (+3) |
| `.advice-fab`                         |    6 | `#fbbf24`, `#f59e0b`, `rgba(251, 191, 36, 0.4)`, `#d97706`, `rgba(245, 158, 11, 0.3)`                  |
| `.advice-v4-detail__primary`          |    4 | `#c67139`, `#2b1608`, `#cf8144`, `#1a0f04`                                                             |
| `.advice-v4-disclaimer-card`          |    3 | `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.16)`, `#141210`                                          |
| `.advice-v4-panel__btn`               |    3 | `#efe3cf`, `rgba(198, 113, 57, 0.22)`, `#e8b48a`                                                       |
| `.advice-list-item-bg-right`          |    2 | `#f59e0b`, `#d97706`                                                                                   |
| `.advice-service-section-label`       |    2 | `#8a4a20`, `#e8b48a`                                                                                   |
| `.advice-v4-detail__eyebrow`          |    2 | `#8a4a20`, `#e2a468`                                                                                   |
| `.advice-v4-disclaimer-card__primary` |    2 | `#cf8144`, `#1a0f04`                                                                                   |
| `.advice-v4-hide-return`              |    2 | `#efe3cf`, `#8a4a20`                                                                                   |
| `.advice-v4-toast-card`               |    2 | `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.14)`                                                     |
| `.advice-v4-toast-card__primary`      |    2 | `#c67139`, `#2b1608`                                                                                   |
| `.advice-list-header-link`            |    1 | `#8a4a20`                                                                                              |
| `.advice-service-list`                |    1 | `#23201b`                                                                                              |
| `.advice-service-note`                |    1 | `#3a2f28`                                                                                              |
| `.advice-service-overlay`             |    1 | `#1a1817`                                                                                              |
| `.advice-v4-detail__close`            |    1 | `#23201b`                                                                                              |
| `.advice-v4-detail__science-box`      |    1 | `#23201b`                                                                                              |
| `.advice-v4-detail__section-title`    |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-detail__tech-link`        |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-detail-overlay`           |    1 | `#141210`                                                                                              |
| `.advice-v4-hide-ring__num`           |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-hide-ring__progress`      |    1 | `#c67139`                                                                                              |
| `.advice-v4-panel`                    |    1 | `#23201b`                                                                                              |
| `.advice-v4-science`                  |    1 | `rgba(80, 50, 20, 0.12)`                                                                               |
| `.advice-v4-science__close`           |    1 | `#23201b`                                                                                              |
| `.advice-v4-science__source`          |    1 | `#23201b`                                                                                              |
| `.fab-group`                          |    1 | `#8a4a20`                                                                                              |
| `0%, 100%`                            |    1 | `rgba(251, 191, 36, 0.4)`                                                                              |
| `50%`                                 |    1 | `rgba(251, 191, 36, 0.6)`                                                                              |

### `300-modals-and-day.css` — 52

Зоны: `registration`

| семейство                               | мест | литералы                                                                                                                                                     |
| --------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.day-wave-overview`                    |    8 | `rgba(245, 158, 11, 0.22)`, `rgba(254, 243, 199, 0.82)`, `rgba(254, 243, 199, 0)`, `rgba(245, 158, 11, 0.14)`, `#b45309`, `rgba(245, 158, 11, 0.24)`, … (+2) |
| `.meal-timer-hint`                      |    6 | `rgba(245, 158, 11, 0.1)`, `rgba(245, 158, 11, 0.2)`, `#d97706`, `rgba(251, 191, 36, 0.15)`, `rgba(251, 191, 36, 0.3)`, `#fcd34d`                            |
| `.smart-tip`                            |    6 | `#fef3c7`, `#fde68a`, `#92400e`, `rgba(251, 191, 36, 0.15)`, `rgba(245, 158, 11, 0.15)`, `#fcd34d`                                                           |
| `.sleep-breakdown-cta`                  |    5 | `#2e1e0c`, `#3d2a10`, `rgba(251, 146, 60, 0.35)`, `#fdba74`, `rgba(249, 115, 22, 0.12)`                                                                      |
| `.day-wave-overview__interaction-zone`  |    4 | `rgba(245, 158, 11, 0.075)`, `rgba(245, 158, 11, 0.16)`, `rgba(245, 158, 11, 0.1)`, `rgba(251, 191, 36, 0.16)`                                               |
| `.mood-slider-negative`                 |    4 | `#f59e0b`, `#f97316`                                                                                                                                         |
| `.mood-slider-positive`                 |    4 | `#f97316`, `#f59e0b`                                                                                                                                         |
| `.sleep-quality-preset-ok`              |    3 | `rgba(234, 179, 8, 0.1)`, `#ca8a04`, `rgba(251, 191, 36, 0.2)`                                                                                               |
| `.grams-preview-kcal`                   |    2 | `#ff9500`, `#ffd60a`                                                                                                                                         |
| `.insulin-almost`                       |    2 | `rgba(249, 115, 22, 0.1)`, `#c2410c`                                                                                                                         |
| `.day-wave-overview__interaction-label` |    1 | `#92400e`                                                                                                                                                    |
| `.day-wave-overview__overlaps`          |    1 | `#92400e`                                                                                                                                                    |
| `.rating-progress-dot`                  |    1 | `#fbbf24`                                                                                                                                                    |
| `.sleep-breakdown-reason`               |    1 | `#fdba74`                                                                                                                                                    |
| `.sleep-quality-stars`                  |    1 | `#fbbf24`                                                                                                                                                    |
| `.sleep-quality-value`                  |    1 | `#f59e0b`                                                                                                                                                    |
| `0%, 100%`                              |    1 | `#fbbf24`                                                                                                                                                    |
| `50%`                                   |    1 | `#fbbf24`                                                                                                                                                    |

### `heys_profile_step_v1.js` — 42

Зоны: `registration`

| где в коде       | мест | литералы                                                |
| ---------------- | ---: | ------------------------------------------------------- |
| `lastNameNode`   |   12 | `#8a4a20`, `#a1471c`_, `#c67139`, `#2b1608`, `#f6e6dd`_ |
| `on`             |    8 | `#efe3cf`, `#c67139`, `#2b1608`                         |
| `wheelCard`      |    5 | `#f6e6dd`_, `#a1471c`_, `#efe3cf`                       |
| `next`           |    4 | `#8a4a20`, `#c67139`, `#2b1608`                         |
| `startDetailed`  |    4 | `#f6e6dd`\*, `#8a4a20`                                  |
| `cardShell`      |    3 | `#efe3cf`, `#f6e6dd`\*, `#8a4a20`                       |
| `getBMICategory` |    2 | `#eab308`, `#f97316`                                    |
| `isSelected`     |    2 | `#efe3cf`, `#c67139`                                    |
| `primaryBtn`     |    1 | `#c67139`                                               |
| `tier`           |    1 | `#8a4a20`                                               |

### `heys_supplements_v1.js` — 36

Зоны: `nutrition-tab`

| где в коде         | мест | литералы                                   |
| ------------------ | ---: | ------------------------------------------ |
| `valueStyle`       |    5 | `#fef3c7`, `#92400e`, `#d97706`            |
| `priorityColors`   |    4 | `#fdba74`, `#ea580c`, `#fde047`, `#ca8a04` |
| `color`            |    3 | `#92400e`                                  |
| `GROUP_THEME`      |    3 | `#fef3c7`, `#f59e0b`, `#92400e`            |
| `doseColors`       |    2 | `#d97706`, `#fef3c7`                       |
| `doseSafety`       |    2 | `#fef3c7`, `#92400e`                       |
| `doseStatusColors` |    2 | `#92400e`, `#fef3c7`                       |
| `effect`           |    2 | `#fef3c7`, `#92400e`                       |
| `itemSources`      |    2 | `#fef3c7`, `#92400e`                       |
| `levelMeta`        |    2 | `#92400e`, `#fef3c7`                       |
| `needsBreak`       |    2 | `#fef3c7`, `#92400e`                       |
| `reminder`         |    2 | `#d97706`                                  |
| `current`          |    1 | `#d97706`                                  |
| `hasEffects`       |    1 | `#f59e0b`                                  |
| `isChecked`        |    1 | `#fef3c7`                                  |
| `isPlanned`        |    1 | `#fcd34d`                                  |
| `userFlags`        |    1 | `#d97706`                                  |

### `_meals.js` — 33

Зоны: `undo-bar`

| где в коде               | мест | литералы                                                                                                         |
| ------------------------ | ---: | ---------------------------------------------------------------------------------------------------------------- |
| `rect`                   |   10 | `#fef3c7`, `#b45309`, `#f59e0b`, `rgba(245, 158, 0, 0.08)`, `rgba(251, 191, 36, 0.05)`, `rgba(245, 158, 0, 0.2)` |
| `qualityBadgeStyle`      |    6 | `rgba(245, 158, 11, 0.14)`, `#b45309`, `rgba(245, 158, 11, 0.28)`, `#fbbf24`, `rgba(251,191,36,0.3)`, `#92400e`  |
| `inRiskWindow`           |    4 | `rgba(249,115,22,0.12)`, `rgba(234,179,8,0.1)`, `#ea580c`, `#ca8a04`                                             |
| `getActivityContextTone` |    3 | `#eab30833`, `#ca8a04`, `#eab30855`                                                                              |
| `barFill`                |    2 | `#fbbf24`, `#f59e0b`                                                                                             |
| `gi`                     |    2 | `#eab308`, `#f97316`                                                                                             |
| `hasHeaderBadges`        |    2 | `#fef3c7`, `#b45309`                                                                                             |
| `utils`                  |    2 | `#fef3c7`, `#92400e`                                                                                             |
| `y`                      |    2 | `#eab308`                                                                                                        |

### `_meals.js` — 33

Зоны: `date-remainders`, `home-widgets`, `nutrition-tab`, `undo-bar`

| где в коде               | мест | литералы                                                                                                         |
| ------------------------ | ---: | ---------------------------------------------------------------------------------------------------------------- |
| `rect`                   |   10 | `#fef3c7`, `#b45309`, `#f59e0b`, `rgba(245, 158, 0, 0.08)`, `rgba(251, 191, 36, 0.05)`, `rgba(245, 158, 0, 0.2)` |
| `qualityBadgeStyle`      |    6 | `rgba(245, 158, 11, 0.14)`, `#b45309`, `rgba(245, 158, 11, 0.28)`, `#fbbf24`, `rgba(251,191,36,0.3)`, `#92400e`  |
| `inRiskWindow`           |    4 | `rgba(249,115,22,0.12)`, `rgba(234,179,8,0.1)`, `#ea580c`, `#ca8a04`                                             |
| `getActivityContextTone` |    3 | `#eab30833`, `#ca8a04`, `#eab30855`                                                                              |
| `barFill`                |    2 | `#fbbf24`, `#f59e0b`                                                                                             |
| `gi`                     |    2 | `#eab308`, `#f97316`                                                                                             |
| `hasHeaderBadges`        |    2 | `#fef3c7`, `#b45309`                                                                                             |
| `utils`                  |    2 | `#fef3c7`, `#92400e`                                                                                             |
| `y`                      |    2 | `#eab308`                                                                                                        |

### `heys_consents_v1.js` — 28

Зоны: `login`

| где в коде         | мест | литералы                                                           |
| ------------------ | ---: | ------------------------------------------------------------------ |
| `version`          |    7 | `#fef3c7`, `#92400e`, `#fcd34d`, `#f6e6dd`_, `#a1471c`_, `#8a4a20` |
| `handleClick`      |    4 | `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(146,64,14,0.15)`            |
| `CONSENT_TEXTS`    |    3 | `#fef3c7`, `#f59e0b`, `#92400e`                                    |
| `res`              |    3 | `#fef3c7`, `#92400e`, `#fcd34d`                                    |
| `clientId`         |    2 | `#fef3c7`, `#92400e`                                               |
| `done`             |    2 | `#f6e6dd`\*, `#d97642`                                             |
| `next`             |    2 | `#c67139`, `#2b1608`                                               |
| `NotMedicineBadge` |    2 | `#fef3c7`, `#b45309`                                               |
| `openFull`         |    2 | `#8a4a20`                                                          |
| `boxStyle`         |    1 | `#c67139`                                                          |

### `heys_consents_v1.js` — 28

Зоны: `home-widgets`, `login`, `registration`, `spinners`

| где в коде         | мест | литералы                                                           |
| ------------------ | ---: | ------------------------------------------------------------------ |
| `version`          |    7 | `#fef3c7`, `#92400e`, `#fcd34d`, `#f6e6dd`_, `#a1471c`_, `#8a4a20` |
| `handleClick`      |    4 | `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(146,64,14,0.15)`            |
| `CONSENT_TEXTS`    |    3 | `#fef3c7`, `#f59e0b`, `#92400e`                                    |
| `res`              |    3 | `#fef3c7`, `#92400e`, `#fcd34d`                                    |
| `clientId`         |    2 | `#fef3c7`, `#92400e`                                               |
| `done`             |    2 | `#f6e6dd`\*, `#d97642`                                             |
| `next`             |    2 | `#c67139`, `#2b1608`                                               |
| `NotMedicineBadge` |    2 | `#fef3c7`, `#b45309`                                               |
| `openFull`         |    2 | `#8a4a20`                                                          |
| `boxStyle`         |    1 | `#c67139`                                                          |

### `heys_trial_queue_v1.js` — 22

Зоны: `curator-cabinet`

| где в коде           | мест | литералы                                                         |
| -------------------- | ---: | ---------------------------------------------------------------- |
| `res`                |    9 | `#efc36f`, `#724b05`, `#d8a84e`                                  |
| `answerLabel`        |    8 | `#efc36f`, `#7a4b00`, `#fff0c7`, `#ead9b3`, `#724b05`, `#b7791f` |
| `meta`               |    3 | `rgba(245, 158, 11, 0.1)`, `#92400e`, `#f59e0b`                  |
| `getQueueStatusMeta` |    2 | `#f59e0b`                                                        |

### `715-yesterday-verify.css` — 21

Зоны: `checkin-morning`

| семейство            | мест | литералы                                                                 |
| -------------------- | ---: | ------------------------------------------------------------------------ |
| `.yv-info`           |    7 | `#fef3c7`, `#fde68a`, `#fbbf24`, `#713f12`, `#78350f`, `#f97316`, … (+1) |
| `.yv-slider-value`   |    3 | `#d4a574`, `#e08a5a`, `#a86b2a`                                          |
| `.yv-v4-slider-fill` |    3 | `#b8925a`, `#c67139`, `#d4844a`                                          |
| `.yv-info-date`      |    2 | `#92400e`, `#fcd34d`                                                     |
| `.yv-info-stats`     |    2 | `#78350f`, `#fed7aa`                                                     |
| `.yv-info-target`    |    2 | `#78350f`, `#fed7aa`                                                     |
| `.yv-info-percent`   |    1 | `#b45309`                                                                |
| `.yv-option`         |    1 | `rgba(249, 115, 22, 0.15)`                                               |

### `heys_steps_v1.js` — 17

Зоны: `checkin-morning`, `cycle`, `date-remainders`, `undo-bar`

| где в коде            | мест | литералы                                                          |
| --------------------- | ---: | ----------------------------------------------------------------- |
| `suffix`              |    6 | `rgba(245, 158, 11, 0.35)`, `rgba(245, 158, 11, 0.12)`, `#b45309` |
| `isSelected`          |    4 | `#f97316`, `rgba(249, 115, 22, 0.1)`, `#ea580c`                   |
| `estimatedHint`       |    2 | `#efe3cf`, `#8a4a20`                                              |
| `getColor`            |    2 | `#eab308`                                                         |
| `getSleepAdviceColor` |    2 | `#fef08a`, `#854d0e`                                              |
| `thumbPx`             |    1 | `rgba(80, 50, 20, 0.25)`                                          |

### `heys_user_v12.js` — 16

Зоны: `home-widgets`

| где в коде        | мест | литералы                                                                                         |
| ----------------- | ---: | ------------------------------------------------------------------------------------------------ |
| `targetDate`      |    7 | `rgba(234, 179, 8, 0.1)`, `#eab308`, `#b45309`, `rgba(251, 191, 36, 0.15)`, `#92400e`, `#fef3c7` |
| `bmiCat`          |    2 | `#eab308`, `#f97316`                                                                             |
| `DEFICIT_PRESETS` |    2 | `#f97316`, `#eab308`                                                                             |
| `warnings`        |    2 | `#f97316`, `#eab308`                                                                             |
| `calPerMin`       |    1 | `#f59e0b`                                                                                        |
| `diff`            |    1 | `#f97316`                                                                                        |
| `preset`          |    1 | `#f97316`                                                                                        |

### `heys_user_tab_impl_v1.js` — 14

Зоны: `cycle`, `home-widgets`, `registration`, `settings-system`

| где в коде        | мест | литералы                                                         |
| ----------------- | ---: | ---------------------------------------------------------------- |
| `statusText`      |    4 | `#a1471c`\*, `rgba(161, 71, 28, 0.22)`, `rgba(138, 74, 32, 0.1)` |
| `bmiCat`          |    2 | `#eab308`, `#f97316`                                             |
| `DEFICIT_PRESETS` |    2 | `#f97316`, `#eab308`                                             |
| `res`             |    2 | `#f59e0b`, `#92400e`                                             |
| `calPerMin`       |    1 | `#a1471c`\*                                                      |
| `isEnabled`       |    1 | `rgba(138, 74, 32, 0.12)`                                        |
| `preset`          |    1 | `#f97316`                                                        |
| `targetDate`      |    1 | `rgba(138, 74, 32, 0.08)`                                        |

### `heys_widgets_ui_v1.js` — 14

Зоны: `home-widgets`, `settings-system`

| где в коде                 | мест | литералы                                                         |
| -------------------------- | ---: | ---------------------------------------------------------------- |
| `getRelapseGradientColors` |    6 | `#fdba74`, `#f97316`, `#fcd34d`, `#f59e0b`, `#fde68a`, `#eab308` |
| `_DYNAMIC_GRADIENTS`       |    3 | `#f59e0b`, `#fde68a`                                             |
| `_staticGradient`          |    2 | `#fde68a`, `#f59e0b`                                             |
| `getRelapseRiskColor`      |    1 | `#f97316`                                                        |
| `getStatusInfo`            |    1 | `#f97316`                                                        |
| `getStreakColor`           |    1 | `#f97316`                                                        |

### `critical.css` — 12

Зоны: `home-widgets`

| семейство         | мест | литералы                                              |
| ----------------- | ---: | ----------------------------------------------------- |
| `.hdr-date-group` |    6 | `#8a4a20`, `#f3e0d2`, `#23201b`, `#e2a468`, `#3a2620` |
| `.hdr-top`        |    2 | `#f5ead8`                                             |
| `.page-day`       |    2 | `#141210`                                             |
| `.card`           |    1 | `rgba(234, 179, 8, 0.08)`                             |
| `.hdr`            |    1 | `#141210`                                             |

### `heys_day_sparklines_v1.js` — 10

Зоны: `cycle`

| где в коде                | мест | литералы             |
| ------------------------- | ---: | -------------------- |
| `wd`                      |    4 | `#f97316`, `#eab308` |
| `getDayScoreColor`        |    2 | `#f97316`, `#eab308` |
| `cp2y`                    |    1 | `#f97316`            |
| `trendAreaTopColor`       |    1 | `#fb923c`            |
| `trendColor`              |    1 | `#f97316`            |
| `weightLineGradientStops` |    1 | `#fb923c`            |

### `heys_board_tab_v1.js` — 7

Зоны: `spinners`

| где в коде | мест | литералы                                                                                                                  |
| ---------- | ---: | ------------------------------------------------------------------------------------------------------------------------- |
| `style`    |    7 | `rgba(234,179,8,.06)`, `rgba(234,179,8,.25)`, `rgba(251,191,36,.1)`, `rgba(251,191,36,.28)`, `#f59e0b`, `#eab308`, … (+1) |

### `heys_cascade_card_v1.js` — 7

Зоны: `nutrition-tab`

| где в коде     | мест | литералы                                             |
| -------------- | ---: | ---------------------------------------------------- |
| `badGrad`      |    2 | `#f97316`, `#fde047`                                 |
| `badShadow`    |    2 | `rgba(253, 224, 71, 0.7)`, `rgba(249, 115, 22, 0.6)` |
| `STATE_CONFIG` |    2 | `#eab308`, `#f59e0b`                                 |
| `cebColor`     |    1 | `#f59e0b`                                            |

### `heys_iw_ui.js` — 7

Зоны: `nutrition-tab`

| где в коде         | мест | литералы                                                             |
| ------------------ | ---: | -------------------------------------------------------------------- |
| `confidenceTone`   |    4 | `#9A6700`, `rgba(245,183,49,.12)`, `#A64B2A`, `rgba(218,112,74,.11)` |
| `isCuratorSession` |    2 | `rgba(245,183,49,.10)`, `#795500`                                    |
| `rangeWasCapped`   |    1 | `#9A6700`                                                            |

### `heys_gamification_v1.js` — 6

Зоны: `gamification`, `nutrition-tab`

| где в коде      | мест | литералы                             |
| --------------- | ---: | ------------------------------------ |
| `float`         |    2 | `#f59e0b`, `#fbbf24`                 |
| `fly`           |    2 | `#fbbf24`, `rgba(251, 191, 36, 0.6)` |
| `LEVEL_TITLES`  |    1 | `#eab308`                            |
| `RARITY_COLORS` |    1 | `#eab308`                            |

### `heys_scales_v1.js` — 6

Зоны: `gamification`

| где в коде             | мест | литералы                        |
| ---------------------- | ---: | ------------------------------- |
| `C`                    |    3 | `#eab308`, `#f97316`, `#f59e0b` |
| `MACRO_GRADIENT_STOPS` |    2 | `#fde68a`, `#f59e0b`            |
| `CLASSIC_STEP_COLOR`   |    1 | `#eab308`                       |

### `heys_day_stats_v1.js` — 5

Зоны: `cycle`, `norm-correction`

| где в коде      | мест | литералы             |
| --------------- | ---: | -------------------- |
| `carbsOverData` |    2 | `#fde68a`, `#f59e0b` |
| `gradient`      |    2 | `#eab308`            |
| `color`         |    1 | `#eab308`            |

### `heys_weekly_reports_v2.js` — 5

Зоны: `norm-correction`

| где в коде           | мест | литералы             |
| -------------------- | ---: | -------------------- |
| `_DYNAMIC_GRADIENTS` |    3 | `#f59e0b`, `#fde68a` |
| `_staticGradient`    |    2 | `#fde68a`, `#f59e0b` |

### `heys_app_shell_v1.js` — 4

Зоны: `curator-edits`, `date-remainders`, `home-widgets`, `login`,
`nutrition-tab`, `settings-system`, `spinners`, `tips`

| где в коде | мест | литералы             |
| ---------- | ---: | -------------------- |
| `dots`     |    2 | `#c67139`, `#efe3cf` |
| `source`   |    2 | `#c67139`, `#efe3cf` |

### `heys_paywall_v1.js` — 4

Зоны: `nutrition-tab`

| где в коде | мест | литералы                        |
| ---------- | ---: | ------------------------------- |
| `meta`     |    4 | `#fef3c7`, `#fde68a`, `#f59e0b` |

### `heys_login_theme_picker_v1.js` — 3

Зоны: `login`

| где в коде         | мест | литералы             |
| ------------------ | ---: | -------------------- |
| `PALETTE_VARIANTS` |    2 | `#c67139`, `#efe3cf` |
| `paletteSwatch`    |    1 | `#c67139`            |

### `heys_login_theme_picker_v1.js` — 3

Зоны: `login`

| где в коде         | мест | литералы             |
| ------------------ | ---: | -------------------- |
| `PALETTE_VARIANTS` |    2 | `#c67139`, `#efe3cf` |
| `paletteSwatch`    |    1 | `#c67139`            |

### `heys_ratio_zones_v1.js` — 3

Зоны: `gamification`

| где в коде            | мест | литералы  |
| --------------------- | ---: | --------- |
| `DEFAULT_RATIO_ZONES` |    2 | `#eab308` |
| `zone`                |    1 | `#f59e0b` |

### `heys-boot-mark.css` — 3

Зоны: `registration`

| семейство                                  | мест | литералы  |
| ------------------------------------------ | ---: | --------- |
| `.heys-boot-visual-guard`                  |    1 | `#141210` |
| `.heys-wait-mark-overlay`                  |    1 | `#141210` |
| `html[data-theme="sand-dark"], html[data-` |    1 | `#141210` |

### `heys-boot-mark.css` — 3

Зоны: `app-splash`, `spinners`

| семейство                                  | мест | литералы  |
| ------------------------------------------ | ---: | --------- |
| `.heys-boot-visual-guard`                  |    1 | `#141210` |
| `.heys-wait-mark-overlay`                  |    1 | `#141210` |
| `html[data-theme="sand-dark"], html[data-` |    1 | `#141210` |

### `widget_data.js` — 3

Зоны: `home-widgets`

| где в коде | мест | литералы  |
| ---------- | ---: | --------- |
| `v4`       |    2 | `#c67139` |
| `slope`    |    1 | `#eab308` |

### `widget_data.js` — 3

Зоны: `checkin-morning`

| где в коде | мест | литералы  |
| ---------- | ---: | --------- |
| `v4`       |    2 | `#c67139` |
| `slope`    |    1 | `#eab308` |

### `heys_day_diary_section.js` — 2

Зоны: `nutrition-tab`

| где в коде     | мест | литералы             |
| -------------- | ---: | -------------------- |
| `numericScore` |    2 | `#eab308`, `#f97316` |

### `heys_theme_v1.js` — 2

Зоны: `settings-system`

| где в коде         | мест | литералы             |
| ------------------ | ---: | -------------------- |
| `THEME_COLOR_META` |    2 | `#c67139`, `#23201b` |

### `heys_trial_intake_v1.js` — 2

Зоны: `home-widgets`, `questionnaire`

| где в коде      | мест | литералы                |
| --------------- | ---: | ----------------------- |
| `cardStyle`     |    1 | `rgba(40, 24, 8, 0.08)` |
| `storageNotice` |    1 | `rgba(40, 24, 8, 0.16)` |

### `732-ui-v4-nutrition.css` — 1

Зоны: `home-widgets`, `nutrition-tab`

| семейство             | мест | литералы                 |
| --------------------- | ---: | ------------------------ |
| `.nutrition-v4-sheet` |    1 | `rgba(33, 30, 25, 0.34)` |

### `heys_add_product_step_v1.js` — 1

Зоны: `nutrition-tab`, `product-card`

| где в коде | мест | литералы    |
| ---------- | ---: | ----------- |
| `h`        |    1 | `#d99a63`\* |

### `heys_step_modal_v1.js` — 1

Зоны: `checkin-morning`, `registration`, `spinners`

| где в коде    | мест | литералы    |
| ------------- | ---: | ----------- |
| `targetIndex` |    1 | `#a1471c`\* |

### `heys_widgets_registry_v1.js` — 1

Зоны: `home-widgets`

| где в коде   | мест | литералы  |
| ------------ | ---: | --------- |
| `CATEGORIES` |    1 | `#f97316` |

## Модули, которых вердикты не называют

Эти файлы не назвал ни один вердикт закрытой зоны. Причины разные, и их важно не
путать. Большинство — легаси-экраны, которых v4 не касался вовсе: им нужна своя
зона, а не решение про героя. Но здесь же лежит `731-ui-v4-activity.css` —
модуль **закрытой** зоны `tab-activity`, чьи вердикты ни разу не сослались на
свой файл. Такие места разметки требуют наравне с первым разделом, и найти их
можно было только просмотром по имени файла, а не по обоснованиям.

### `100-metrics-and-graphs.css` — 212

| семейство                         | мест | литералы                                                                                                                                                            |
| --------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.sparkline-popup-v2`             |   36 | `#b45309`, `#fef3c7`, `#fde68a`, `#fcd34d`, `#92400e`, `#f59e0b`, … (+2)                                                                                            |
| `.add-training-btn`               |   13 | `#f97316`, `rgba(249, 115, 22, 0.08)`, `#ea580c`, `#c2410c`, `rgba(249, 115, 22, 0.15)`, `rgba(245, 158, 11, 0.55)`, … (+6)                                         |
| `50%`                             |    9 | `rgba(249, 115, 22, 0.8)`, `rgba(249, 115, 22, 1)`, `rgba(251, 191, 36, 0.8)`, `rgba(251, 191, 36, 1)`, `rgba(245, 158, 11, 0)`, `rgba(251, 191, 36, 0.6)`, … (+3)  |
| `.training-card-rating`           |    8 | `#fef3c7`, `#fde68a`, `#fcd34d`, `#ffedd5`, `#fed7aa`, `#fdba74`, … (+2)                                                                                            |
| `0%, 100%`                        |    8 | `rgba(249, 115, 22, 0.5)`, `rgba(249, 115, 22, 0.6)`, `rgba(251, 191, 36, 0.5)`, `rgba(251, 191, 36, 0.6)`, `rgba(245, 158, 11, 0.4)`, `#fbbf24`, … (+2)            |
| `.weight-sparkline-container`     |    7 | `rgba(251, 146, 60, 0.18)`, `#f97316`                                                                                                                               |
| `.goal-progress-bar`              |    6 | `rgba(245, 158, 11, 0.16)`, `rgba(245, 158, 11, 0.05)`, `rgba(245, 158, 11, 0.88)`, `rgba(234, 179, 8, 0.17)`, `rgba(234, 179, 8, 0.06)`, `rgba(234, 179, 8, 0.85)` |
| `.sparkline-popup-tag`            |    6 | `#fef3c7`, `#d97706`, `#fde68a`, `#92400e`, `#f59e0b`                                                                                                               |
| `.week-heatmap-deficit-badge`     |    6 | `#f97316`, `rgba(249, 115, 22, 0.12)`, `rgba(249, 115, 22, 0.3)`, `rgba(124, 45, 18, 0.34)`, `rgba(251, 146, 60, 0.34)`, `#fdba74`                                  |
| `.week-heatmap-deficit`           |    5 | `rgba(234, 179, 8, 0.08)`, `rgba(245, 158, 11, 0.05)`, `rgba(234, 179, 8, 0.15)`, `rgba(180, 83, 9, 0.24)`, `rgba(251, 146, 60, 0.3)`                               |
| `.correlation-block`              |    4 | `#ffedd5`, `#fed7aa`, `#fef9c3`, `#fde047`                                                                                                                          |
| `.macro-badge-popup-streak`       |    4 | `#d97706`, `#fef3c7`, `#fde68a`, `#fcd34d`                                                                                                                          |
| `.macro-toast`                    |    4 | `#fef3c7`, `#fde68a`, `#fbbf24`, `#f59e0b`                                                                                                                          |
| `.metric-popup-streak`            |    4 | `#d97706`, `#fef3c7`, `#fde68a`, `#fcd34d`                                                                                                                          |
| `.week-heatmap-deficit-excluded`  |    4 | `rgba(234, 179, 8, 0.35)`, `rgba(113, 63, 18, 0.48)`, `rgba(234, 179, 8, 0.36)`, `#fde68a`                                                                          |
| `.caloric-excess-cardio`          |    3 | `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.25)`, `#d97706`                                                                                                   |
| `.caloric-insight-item-v2`        |    3 | `#f59e0b`, `rgba(245, 158, 11, 0.05)`, `rgba(249, 115, 22, 0.06)`                                                                                                   |
| `.debt-refeed-hint`               |    3 | `#f59e0b`, `rgba(245, 158, 11, 0.06)`, `rgba(245, 158, 11, 0.4)`                                                                                                    |
| `.macro-tip-fat`                  |    3 | `rgba(245, 158, 11, 0.08)`, `rgba(251, 191, 36, 0.12)`, `rgba(245, 158, 11, 0.2)`                                                                                   |
| `.sparkline-dot-gold`             |    3 | `#fbbf24`, `#f59e0b`, `rgba(251, 191, 36, 0.6)`                                                                                                                     |
| `.sparkline-dot-gold-today`       |    3 | `#fbbf24`, `#f59e0b`, `rgba(251, 191, 36, 0.8)`                                                                                                                     |
| `.sparkline-dot-refeed`           |    3 | `#f97316`, `#ea580c`, `rgba(249, 115, 22, 0.6)`                                                                                                                     |
| `.sparkline-dot-refeed-today`     |    3 | `#f97316`, `#ea580c`, `rgba(249, 115, 22, 0.8)`                                                                                                                     |
| `.sparkline-popup-header`         |    3 | `#fef3c7`, `#d97706`, `#b45309`                                                                                                                                     |
| `.sparkline-popup-perfect`        |    3 | `#fef3c7`, `#fde68a`, `#f59e0b`                                                                                                                                     |
| `.training-type-btn`              |    3 | `#f97316`, `#ffedd5`, `#ea580c`                                                                                                                                     |
| `.week-heatmap-day`               |    3 | `rgba(251, 191, 36, 0.15)`, `rgba(251, 191, 36, 0.25)`, `#fbbf24`                                                                                                   |
| `.weight-card-modern`             |    3 | `rgba(251, 146, 60, 0.08)`, `rgba(249, 115, 22, 0.12)`, `rgba(251, 146, 60, 0.3)`                                                                                   |
| `.activity-charge-card`           |    2 | `rgba(245, 158, 11, 0.2)`, `rgba(245, 158, 11, 0.22)`                                                                                                               |
| `.caloric-balance-card`           |    2 | `rgba(234, 179, 8, 0.08)`, `rgba(234, 179, 8, 0.2)`                                                                                                                 |
| `.context-badge-circadian`        |    2 | `#fef3c7`, `#92400e`                                                                                                                                                |
| `.context-badge-emotional`        |    2 | `#fef9c3`, `#854d0e`                                                                                                                                                |
| `.metric-popup-reminder`          |    2 | `#ea580c`, `#fed7aa`                                                                                                                                                |
| `.sparkline-heatmap-day`          |    2 | `#fde047`, `#f97316`                                                                                                                                                |
| `.sparkline-slider-tooltip-ratio` |    2 | `#fef3c7`, `#d97706`                                                                                                                                                |
| `.sparkline-slider-tooltip-tag`   |    2 | `#fef3c7`, `#d97706`                                                                                                                                                |
| `.sparkline-streak-line`          |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.6)`                                                                                                                                |
| `.tdee-row-empty`                 |    2 | `#fef3c7`, `#92400e`                                                                                                                                                |
| `.training-zone-header`           |    2 | `#fef3c7`, `#d97706`                                                                                                                                                |
| `.week-heatmap-streak`            |    2 | `#f59e0b`, `#fef3c7`                                                                                                                                                |
| `.weight-goal-hint`               |    2 | `rgba(234, 179, 8, 0.1)`, `rgba(234, 179, 8, 0.3)`                                                                                                                  |
| `.weight-goal-hint-link`          |    2 | `#d97706`, `#b45309`                                                                                                                                                |
| `.caloric-debt-day`               |    1 | `rgba(245, 158, 11, 0.3)`                                                                                                                                           |
| `.deficit-actual-value`           |    1 | `#f59e0b`                                                                                                                                                           |
| `.deficit-card-trend`             |    1 | `#f59e0b`                                                                                                                                                           |
| `.deficit-value-number`           |    1 | `#f59e0b`                                                                                                                                                           |
| `.goal-progress-fill`             |    1 | `#f97316`                                                                                                                                                           |
| `.macro-toast-extra-achievement`  |    1 | `rgba(234, 179, 8, 0.2)`                                                                                                                                            |
| `.macro-toast-fat`                |    1 | `#f59e0b`                                                                                                                                                           |
| `.sparkline-annotation-holiday`   |    1 | `#f59e0b`                                                                                                                                                           |
| `.sparkline-burn-glow`            |    1 | `#f97316`                                                                                                                                                           |
| `.sparkline-dot-warn`             |    1 | `#f59e0b`                                                                                                                                                           |
| `.sparkline-popup-motivation`     |    1 | `#78350f`                                                                                                                                                           |
| `.sparkline-popup-subtitle`       |    1 | `#92400e`                                                                                                                                                           |
| `.sparkline-popup-value`          |    1 | `#f59e0b`                                                                                                                                                           |
| `.sparkline-sleep-indicator`      |    1 | `rgba(249, 115, 22, 0.4)`                                                                                                                                           |
| `.training-zones-kcal`            |    1 | `#f97316`                                                                                                                                                           |
| `.week-heatmap-stat`              |    1 | `#ca8a04`                                                                                                                                                           |
| `.weight-card-empty`              |    1 | `#c2410c`                                                                                                                                                           |
| `.weight-sparkline-dot`           |    1 | `rgba(249, 115, 22, 0.35)`                                                                                                                                          |
| `.zone-formula-result`            |    1 | `#f97316`                                                                                                                                                           |
| `.zone-picker-kcal-hint`          |    1 | `#f97316`                                                                                                                                                           |
| `0%`                              |    1 | `rgba(245, 158, 11, 0)`                                                                                                                                             |

### `fingers.css` — 193

| семейство                                 | мест | литералы                                                                                                                                                                     |
| ----------------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.fingers-ob-root`                        |   24 | `#d97e3b`, `#8a3e1a`, `rgba(138, 62, 26, 0.55)`, `rgba(138, 62, 26, 0.50)`, `rgba(60, 50, 42, 0.35)`, `#1c1b19`, … (+16)                                                     |
| `.fingers-fs-program-card`                |   16 | `rgba(245, 158, 11, 0.30)`, `rgba(245, 158, 11, 0.10)`, `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.22)`, `rgba(245, 158, 11, 0.35)`, `rgba(45, 35, 22, 0.88)`, … (+8) |
| `.fingers-fs-constructor-card`            |   10 | `#92400e`, `rgba(254, 243, 199, 0.85)`, `rgba(253, 230, 138, 0.55)`, `rgba(245, 158, 11, 0.25)`, `#f59e0b`, `#ea580c`, … (+4)                                                |
| `.fingers-fs-equipment-chip`              |    8 | `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.05)`, `#b45309`, `rgba(245, 158, 11, 0.22)`, `rgba(252, 211, 77, 0.16)`, `rgba(252, 211, 77, 0.06)`, … (+2)                |
| `.fingers-fs-progress-callout`            |    7 | `#92400e`, `rgba(254, 243, 199, 0.85)`, `rgba(253, 230, 138, 0.55)`, `rgba(245, 158, 11, 0.55)`, `#fcd34d`, `rgba(120, 53, 15, 0.30)`, … (+1)                                |
| `.fingers-fs-resume-banner`               |    7 | `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.05)`, `rgba(245, 158, 11, 0.30)`, `#b45309`, `rgba(245, 158, 11, 0.18)`, `rgba(245, 158, 11, 0.06)`, … (+1)                |
| `.fingers-fs-asym`                        |    6 | `rgba(254, 243, 199, 0.85)`, `rgba(253, 230, 138, 0.45)`, `rgba(245, 158, 11, 0.55)`, `rgba(120, 53, 15, 0.30)`, `rgba(120, 53, 15, 0.18)`, `rgba(245, 158, 11, 0.5)`        |
| `.fingers-fs-mixcard__btn`                |    6 | `#b45309`, `rgba(245, 158, 11, 0.35)`, `rgba(245, 158, 11, 0.55)`, `#f59e0b`, `#d97706`, `rgba(217, 119, 6, 0.32)`                                                           |
| `.fingers-settings__level-chip`           |    6 | `rgba(194, 65, 12, 0.44)`, `rgba(251, 146, 60, 0.16)`, `#9a3412`, `rgba(251, 146, 60, 0.46)`, `#fed7aa`                                                                      |
| `.fingers-fs-chip`                        |    5 | `rgba(245, 158, 11, 0.18)`, `rgba(245, 158, 11, 0.08)`, `#b45309`, `rgba(245, 158, 11, 0.24)`, `#fcd34d`                                                                     |
| `.fingers-fs-mixcard__goal-btn`           |    5 | `rgba(245, 158, 11, 0.30)`, `rgba(245, 158, 11, 0.55)`, `#f59e0b`, `#ea580c`, `rgba(234, 88, 12, 0.34)`                                                                      |
| `.fingers-fs-readiness-banner`            |    5 | `#b45309`, `rgba(245, 158, 11, 0.12)`, `rgba(245, 158, 11, 0.04)`, `rgba(245, 158, 11, 0.22)`, `#fcd34d`                                                                     |
| `.fingers-fs-summary__achievement`        |    5 | `rgba(245, 158, 11, 0.18)`, `rgba(245, 158, 11, 0.08)`, `#b45309`, `rgba(245, 158, 11, 0.30)`, `#fcd34d`                                                                     |
| `.fingers-grip-tile`                      |    5 | `#f59e0b`, `#b45309`, `#fcd34d`                                                                                                                                              |
| `.fingers-bib-source`                     |    4 | `#f59e0b`, `#ea580c`, `#b45309`, `#fcd34d`                                                                                                                                   |
| `.fingers-fs`                             |    4 | `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.10)`, `#1c1b19`, `rgba(20, 14, 10, 0.30)`                                                                                  |
| `.fingers-fs-intensity-filter__chip`      |    4 | `#f59e0b`, `#d97706`, `rgba(245, 158, 11, 0.25)`                                                                                                                             |
| `.fingers-fs-mixcard__inner`              |    4 | `rgba(245, 158, 11, 0.12)`, `rgba(217, 119, 6, 0.08)`, `rgba(245, 158, 11, 0.32)`, `rgba(217, 119, 6, 0.18)`                                                                 |
| `.fingers-fs-progress-session__intensity` |    4 | `rgba(245, 158, 11, 0.18)`, `rgba(245, 158, 11, 0.08)`, `#b45309`, `#fcd34d`                                                                                                 |
| `.fingers-fs-resume-banner__btn`          |    4 | `#f59e0b`, `#d97706`, `rgba(245, 158, 11, 0.30)`                                                                                                                             |
| `.fingers-settings__advisory`             |    4 | `rgba(192, 86, 31, 0.20)`, `rgba(192, 86, 31, 0.07)`, `rgba(220, 120, 60, 0.12)`, `rgba(220, 120, 60, 0.26)`                                                                 |
| `.fingers-tb__reminder`                   |    4 | `rgba(192, 86, 31, 0.09)`, `rgba(192, 86, 31, 0.22)`, `rgba(220, 120, 60, 0.14)`, `rgba(220, 120, 60, 0.3)`                                                                  |
| `0%, 100%`                                |    4 | `rgba(245, 158, 11, 0.20)`, `rgba(245, 158, 11, 0.10)`, `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.06)`                                                               |
| `50%`                                     |    4 | `rgba(245, 158, 11, 0.0)`, `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.22)`, `rgba(245, 158, 11, 0.12)`                                                                |
| `.fingers-fs-mixcard__badge`              |    3 | `#f59e0b`, `#d97706`, `rgba(217, 119, 6, 0.30)`                                                                                                                              |
| `.fingers-fs-mixcard__int-btn`            |    3 | `#f59e0b`, `#d97706`, `rgba(245, 158, 11, 0.30)`                                                                                                                             |
| `.fingers-fs-preflight-notes`             |    3 | `rgba(245, 158, 11, 0.10)`, `rgba(245, 158, 11, 0.55)`, `rgba(245, 158, 11, 0.14)`                                                                                           |
| `.fingers-fs-program-card__rec-badge`     |    3 | `#f59e0b`, `#ea580c`, `rgba(245, 158, 11, 0.42)`                                                                                                                             |
| `.fingers-fs-progress-stat`               |    3 | `rgba(245,158,11,0.18)`, `#f59e0b`, `#ea580c`                                                                                                                                |
| `.fingers-mh-test__result-icon`           |    3 | `#f59e0b`, `#ea580c`, `rgba(245, 158, 11, 0.40)`                                                                                                                             |
| `.fingers-fs-mixcard__goal-label`         |    2 | `rgba(146, 64, 14, 0.78)`, `rgba(252, 211, 77, 0.78)`                                                                                                                        |
| `.fingers-fs-mixcard__goalhint`           |    2 | `rgba(146, 64, 14, 0.72)`, `rgba(252, 211, 77, 0.72)`                                                                                                                        |
| `.fingers-fs-mixcard__intensity-toggle`   |    2 | `rgba(245, 158, 11, 0.30)`                                                                                                                                                   |
| `.fingers-fs-preflight-note`              |    2 | `#b45309`, `#fcd34d`                                                                                                                                                         |
| `.fingers-mh-test__result-warn`           |    2 | `rgba(245, 158, 11, 0.10)`, `#92400e`                                                                                                                                        |
| `.fingers-settings__profile-value`        |    2 | `#ea580c`, `#fcd34d`                                                                                                                                                         |
| `.fingers-fs__title-icon`                 |    1 | `rgba(245, 158, 11, 0.28)`                                                                                                                                                   |
| `.fingers-fs-cycle-plan__week`            |    1 | `rgba(60, 50, 42, 0.10)`                                                                                                                                                     |
| `.fingers-fs-mixcard__source-more`        |    1 | `rgba(60, 50, 42, 0.07)`                                                                                                                                                     |
| `.fingers-tb`                             |    1 | `rgba(60, 50, 42, 0.22)`                                                                                                                                                     |
| `.fingers-tb__bar-track`                  |    1 | `rgba(60, 50, 42, 0.12)`                                                                                                                                                     |
| `.fingers-tb__chart`                      |    1 | `rgba(60, 50, 42, 0.1)`                                                                                                                                                      |
| `.fingers-tb__chart-delta`                |    1 | `#c0561f`                                                                                                                                                                    |
| `.fingers-tb__due`                        |    1 | `#c0561f`                                                                                                                                                                    |

### `720-predictive-insights.css` — 146

| семейство                                  | мест | литералы                                                                                                                                                                   |
| ------------------------------------------ | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.metabolic-quick-status__badge`           |   15 | `#fed7aa`, `#fdba74`, `#9a3412`, `rgba(234, 88, 12, 0.2)`, `#fef3c7`, `#fde68a`, … (+7)                                                                                    |
| `.dark`                                    |   12 | `rgba(251, 146, 60, 0.3)`, `rgba(234, 88, 12, 0.4)`, `#fed7aa`, `#78350f`, `#92400e`, `rgba(245, 158, 11, 0.2)`, … (+6)                                                    |
| `.insights-ring-mini`                      |   11 | `rgba(251, 191, 36, 0.15)`, `rgba(245, 158, 11, 0.2)`, `rgba(245, 158, 11, 0.3)`, `rgba(251, 146, 60, 0.15)`, `rgba(249, 115, 22, 0.2)`, `rgba(249, 115, 22, 0.3)`, … (+5) |
| `.insights-tab__score-interpretation`      |    8 | `rgba(234, 179, 8, 0.10)`, `#854d0e`, `rgba(234, 179, 8, 0.25)`, `rgba(249, 115, 22, 0.10)`, `#9a3412`, `rgba(249, 115, 22, 0.30)`, … (+2)                                 |
| `.meal-timing-v2__sleep`                   |    8 | `#fef3c7`, `#fde68a`, `rgba(245, 158, 11, 0.2)`, `#b45309`, `rgba(234, 179, 8, 0.15)`, `rgba(245, 158, 11, 0.25)`, … (+1)                                                  |
| `.early-warning-badge`                     |    6 | `rgba(249, 115, 22, 0.1)`, `#9a3412`, `rgba(249, 115, 22, 0.3)`, `rgba(249, 115, 22, 0.15)`, `#fdba74`, `rgba(249, 115, 22, 0.4)`                                          |
| `.pattern-debug-modal__contribution-badge` |    6 | `#b45309`, `rgba(245, 158, 11, 0.14)`, `rgba(245, 158, 11, 0.24)`, `#fcd34d`, `rgba(245, 158, 11, 0.22)`, `rgba(251, 191, 36, 0.34)`                                       |
| `.pattern-debug-modal__preview-badge`      |    6 | `rgba(245, 158, 11, 0.35)`, `rgba(245, 158, 11, 0.12)`, `#b45309`, `rgba(251, 191, 36, 0.38)`, `rgba(245, 158, 11, 0.2)`, `#fcd34d`                                        |
| `.insights-streaks`                        |    5 | `rgba(251, 146, 60, 0.08)`, `rgba(249, 115, 22, 0.04)`, `#fb923c`, `rgba(251, 146, 60, 0.15)`, `rgba(249, 115, 22, 0.08)`                                                  |
| `.insights-tab__section`                   |    5 | `#f59e0b`, `rgba(245, 158, 11, 0.04)`, `rgba(245, 158, 11, 0.03)`, `rgba(245, 158, 11, 0.06)`                                                                              |
| `.meal-rec-card__macro-chip`               |    5 | `#f59e0b`, `rgba(245, 158, 11, 0.08)`, `#d97706`, `rgba(245, 158, 11, 0.15)`                                                                                               |
| `.meal-timing-v2__header-icon`             |    5 | `#fef3c7`, `#fde68a`, `rgba(251, 191, 36, 0.25)`, `#78350f`, `#92400e`                                                                                                     |
| `.pattern-debug-modal__reason`             |    5 | `rgba(217, 119, 6, 0.06)`, `#d97706`, `rgba(217, 119, 6, 0.12)`, `rgba(245, 158, 11, 0.1)`, `rgba(245, 158, 11, 0.15)`                                                     |
| `.early-warning-card`                      |    4 | `#f97316`, `#ea580c`, `#fb923c`                                                                                                                                            |
| `.info-modal__debug`                       |    4 | `rgba(245, 158, 11, 0.1)`, `#92400e`, `#fcd34d`                                                                                                                            |
| `.risk-traffic-light__light`               |    4 | `rgba(245, 158, 11, 0.2)`, `#f59e0b`, `rgba(245, 158, 11, 0.5)`                                                                                                            |
| `.insights-monthly-wrap__highlight`        |    3 | `rgba(245, 158, 11, 0.08)`, `#f59e0b`, `rgba(245, 158, 11, 0.15)`                                                                                                          |
| `.meal-timing-v2__priority-badge`          |    3 | `#d97706`, `#fef3c7`, `#fde68a`                                                                                                                                            |
| `.weekly-wrap-card__achievement`           |    3 | `rgba(251, 191, 36, 0.2)`, `rgba(245, 158, 11, 0.2)`, `rgba(245, 158, 11, 0.3)`                                                                                            |
| `.early-warning-card__cta`                 |    2 | `#ea580c`, `#fb923c`                                                                                                                                                       |
| `.early-warning-card__title`               |    2 | `#c2410c`, `#fdba74`                                                                                                                                                       |
| `.info-modal__section`                     |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.15)`                                                                                                                                      |
| `.insights-metabolism-card__quality`       |    2 | `rgba(234, 179, 8, 0.15)`, `#ca8a04`                                                                                                                                       |
| `.insights-streak__count`                  |    2 | `#ea580c`, `#fb923c`                                                                                                                                                       |
| `.insights-tab`                            |    2 | `#23201b`                                                                                                                                                                  |
| `.insights-wrap__effect-badge`             |    2 | `rgba(245, 158, 11, 0.15)`, `#d97706`                                                                                                                                      |
| `.meal-timing-card`                        |    2 | `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.2)`                                                                                                                      |
| `.risk-traffic-light`                      |    2 | `rgba(245, 158, 11, 0.05)`, `rgba(245, 158, 11, 0.1)`                                                                                                                      |
| `.whatif-scenarios-panel__warning`         |    2 | `rgba(245, 158, 11, 0.1)`, `#f59e0b`                                                                                                                                       |
| `.insights-pattern__icon`                  |    1 | `rgba(245, 158, 11, 0.15)`                                                                                                                                                 |
| `.insights-priority-action`                |    1 | `#f59e0b`                                                                                                                                                                  |
| `.insights-ring-card`                      |    1 | `#f59e0b`                                                                                                                                                                  |
| `.metabolic-quick-status__light`           |    1 | `rgba(234, 179, 8, 0.5)`                                                                                                                                                   |
| `.pattern-debug-modal__score`              |    1 | `#d97706`                                                                                                                                                                  |
| `.phenotype-panel__confidence`             |    1 | `#f59e0b`                                                                                                                                                                  |
| `.phenotype-panel__warning`                |    1 | `#f59e0b`                                                                                                                                                                  |
| `.weekly-wrap-card__achievement-label`     |    1 | `#92400e`                                                                                                                                                                  |

### `200-dark-and-effects.css` — 107

| семейство                         | мест | литералы                                                                                                    |
| --------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------- |
| `.correlation-block`              |    7 | `#7c2d12`, `#78350f`, `#f97316`, `rgba(249, 115, 22, 0.2)`, `#713f12`, `rgba(251, 191, 36, 0.2)`            |
| `.training-card-rating`           |    7 | `#451a03`, `#78350f`, `#d97706`, `#431407`, `#7c2d12`, `#ea580c`, … (+1)                                    |
| `.ews-badge`                      |    5 | `rgba(251, 146, 60, 0.2)`, `#fb923c`, `rgba(251, 146, 60, 0.3)`, `rgba(251, 146, 60, 0.4)`                  |
| `.insulin-almost`                 |    5 | `#fdba74`, `rgba(251, 146, 60, 0.15)`, `#fb923c`                                                            |
| `.meal-header-inside`             |    5 | `#431407`, `#7c2d12`, `#9a3412`, `#fb923c`                                                                  |
| `.sleep-breakdown-cta`            |    5 | `#fff1c2`, `#fdba74`, `#fb923c`, `#7c2d12`, `rgba(249, 115, 22, 0.24)`                                      |
| `.caloric-insight-item-v2`        |    4 | `rgba(251, 146, 60, 0.12)`, `#f97316`                                                                       |
| `.compact-train`                  |    4 | `rgba(249, 115, 22, 0.15)`, `rgba(249, 115, 22, 0.3)`, `rgba(249, 115, 22, 0.2)`, `rgba(249, 115, 22, 0.4)` |
| `.insulin-soon`                   |    4 | `#fcd34d`, `rgba(251, 191, 36, 0.15)`                                                                       |
| `.macro-badge-popup-streak`       |    4 | `#78350f`, `#92400e`, `#fb923c`, `#fde68a`                                                                  |
| `.mpc-grams-btn`                  |    4 | `rgba(254, 243, 199, 0.15)`, `rgba(253, 230, 138, 0.15)`, `#d97706`, `#fcd34d`                              |
| `.training-type-btn`              |    4 | `#f97316`, `#3d2a1a`, `#4a3420`, `#fb923c`                                                                  |
| `.compact-zone-inline`            |    3 | `#451a03`, `#78350f`, `#d97706`                                                                             |
| `.macro-toast-achievement`        |    3 | `#fb923c`, `#833d12`, `#a14818`                                                                             |
| `.meal-sep`                       |    3 | `#fb923c`, `rgba(251, 146, 60, 0.2)`, `#fde68a`                                                             |
| `.meal-time-badge-inside`         |    3 | `#78350f`, `#fcd34d`, `#92400e`                                                                             |
| `.metric-popup-reminder`          |    3 | `#451a03`, `#92400e`, `#fb923c`                                                                             |
| `.metric-popup-streak`            |    3 | `#451a03`, `#78350f`, `#92400e`                                                                             |
| `.offline-nodata-overlay`         |    3 | `#422006`, `#451a03`, `#92400e`                                                                             |
| `.day-score-preset-ok`            |    2 | `rgba(234, 179, 8, 0.1)`, `#ca8a04`                                                                         |
| `.macro-toast-fat`                |    2 | `#3d3520`, `#4a4028`                                                                                        |
| `.macro-toast-warning`            |    2 | `#3d3520`, `#4a4028`                                                                                        |
| `.meal-time-badge`                |    2 | `rgba(251, 146, 60, 0.2)`, `#fde68a`                                                                        |
| `.measurements-card__badge`       |    2 | `rgba(234, 88, 12, 0.15)`, `#fb923c`                                                                        |
| `.sparkline-burn-glow`            |    2 | `#fb923c`, `rgba(251, 146, 60, 0.5)`                                                                        |
| `.sparkline-slider-tooltip-ratio` |    2 | `#713f12`, `#fcd34d`                                                                                        |
| `.tone-amber`                     |    2 | `#2e2a1a`, `#4a4020`                                                                                        |
| `.weight-goal-hint`               |    2 | `rgba(251, 191, 36, 0.15)`, `rgba(251, 191, 36, 0.3)`                                                       |
| `.measurements-card`              |    1 | `rgba(251, 146, 60, 0.3)`                                                                                   |
| `.measurements-card__row`         |    1 | `rgba(251, 191, 36, 0.08)`                                                                                  |
| `.measurements-card__warn`        |    1 | `#f59e0b`                                                                                                   |
| `.offline-nodata-title`           |    1 | `#fde68a`                                                                                                   |
| `.sleep-breakdown-reason`         |    1 | `#9a3412`                                                                                                   |
| `.sparkline-dot-warn`             |    1 | `#713f12`                                                                                                   |
| `.sparkline-streak-line`          |    1 | `rgba(251, 191, 36, 0.6)`                                                                                   |
| `.training-zone-header`           |    1 | `#451a03`                                                                                                   |
| `.training-zones-kcal`            |    1 | `#fb923c`                                                                                                   |
| `.weight-goal-hint-link`          |    1 | `#fcd34d`                                                                                                   |

### `710-refeed.css` — 92

| семейство                  | мест | литералы                                                                                                                                   |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `.refeed-toggle`           |   13 | `#fef3c7`, `#f59e0b`, `#b45309`, `#fde68a`, `#92400e`, `#fcd34d`, … (+1)                                                                   |
| `.metrics-card`            |   10 | `rgba(254, 243, 199, 0.3)`, `rgba(253, 230, 138, 0.2)`, `rgba(245, 158, 11, 0.4)`, `rgba(245, 158, 11, 0.2)`, `#f59e0b`, `#d97706`, … (+3) |
| `.refeed-option`           |    8 | `#f59e0b`, `rgba(245, 158, 11, 0.2)`, `#fef3c7`, `#fde68a`, `#78350f`, `#92400e`                                                           |
| `.refeed-card`             |    7 | `#fef3c7`, `#fde68a`, `#f59e0b`, `rgba(245, 158, 11, 0.15)`, `#78350f`, `#92400e`                                                          |
| `.refeed-reason`           |    7 | `#f59e0b`, `#fef3c7`, `#fde68a`, `rgba(245, 158, 11, 0.2)`, `#78350f`, `#92400e`                                                           |
| `.refeed-badge`            |    6 | `#f59e0b`, `#d97706`, `rgba(245, 158, 11, 0.15)`, `#b45309`, `rgba(245, 158, 11, 0.25)`                                                    |
| `.refeed-hint`             |    5 | `#fef3c7`, `#fde68a`, `#f59e0b`, `#78350f`, `#92400e`                                                                                      |
| `.refeed-card__hint`       |    4 | `#78350f`, `rgba(245, 158, 11, 0.3)`, `#fde68a`, `rgba(245, 158, 11, 0.4)`                                                                 |
| `.refeed-card__status`     |    4 | `rgba(245, 158, 11, 0.2)`, `#b45309`, `rgba(234, 179, 8, 0.2)`, `#a16207`                                                                  |
| `.refeed-hint-inline`      |    4 | `#b45309`, `rgba(245, 158, 11, 0.15)`, `rgba(245, 158, 11, 0.25)`, `#fcd34d`                                                               |
| `.refeed-card__stats-item` |    3 | `#92400e`, `rgba(245, 158, 11, 0.1)`, `#fcd34d`                                                                                            |
| `50%`                      |    3 | `rgba(245, 158, 11, 0)`, `#fef3c7`                                                                                                         |
| `.refeed-card__badge`      |    2 | `#92400e`, `#fcd34d`                                                                                                                       |
| `.refeed-card__stats`      |    2 | `rgba(245, 158, 11, 0.2)`, `rgba(245, 158, 11, 0.3)`                                                                                       |
| `.refeed-card__title`      |    2 | `#92400e`, `#fde68a`                                                                                                                       |
| `.refeed-hint-details`     |    2 | `#b45309`, `#fcd34d`                                                                                                                       |
| `.refeed-hint-title`       |    2 | `#92400e`, `#fde68a`                                                                                                                       |
| `.week-heatmap-day`        |    2 | `#f59e0b`, `rgba(245, 158, 11, 0.3)`                                                                                                       |
| `.refeed-option-check`     |    1 | `#f59e0b`                                                                                                                                  |
| `.sparkline-point`         |    1 | `#f59e0b`                                                                                                                                  |
| `.sparkline-refeed-flag`   |    1 | `#f59e0b`                                                                                                                                  |
| `0%`                       |    1 | `rgba(245, 158, 11, 0.6)`                                                                                                                  |
| `0%, 100%`                 |    1 | `rgba(245, 158, 11, 0.4)`                                                                                                                  |
| `100%`                     |    1 | `rgba(245, 158, 11, 0)`                                                                                                                    |

### `725-metabolic-intelligence.css` — 73

| семейство                                    | мест | литералы                                                                                                                                                                 |
| -------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.dark`                                      |   14 | `rgba(249, 115, 22, 0.10)`, `rgba(234, 179, 8, 0.2)`, `rgba(245, 158, 11, 0.2)`, `rgba(234, 179, 8, 0.15)`, `rgba(234, 179, 8, 0.3)`, `rgba(245, 158, 11, 0.15)`, … (+7) |
| `.priority-badge`                            |    6 | `rgba(249, 115, 22, 0.15)`, `#f97316`, `rgba(249, 115, 22, 0.3)`, `rgba(234, 179, 8, 0.15)`, `#ca8a04`, `rgba(234, 179, 8, 0.3)`                                         |
| `.adv-analytics__stat`                       |    5 | `#fed7aa`, `rgba(234, 179, 8, 0.08)`, `rgba(234, 179, 8, 0.2)`, `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.2)`                                                    |
| `.phenotype-panel__item`                     |    3 | `#b45309`, `#422006`, `#fcd34d`                                                                                                                                          |
| `.phenotype-panel__progress`                 |    3 | `#fde047`, `#422006`, `#854d0e`                                                                                                                                          |
| `.adv-analytics__al-component`               |    2 | `rgba(245, 158, 11, 0.15)`, `#d97706`                                                                                                                                    |
| `.adv-analytics__energy-bar`                 |    2 | `#f59e0b`, `#d97706`                                                                                                                                                     |
| `.adv-analytics__recommendations`            |    2 | `rgba(234, 179, 8, 0.1)`, `rgba(249, 115, 22, 0.1)`                                                                                                                      |
| `.adv-analytics__risk-main`                  |    2 | `#fef3c7`, `#fed7aa`                                                                                                                                                     |
| `.adv-analytics-card__confidence-mini`       |    2 | `#fef3c7`, `#d97706`                                                                                                                                                     |
| `.crash-risk-alert`                          |    2 | `#422006`, `#eab308`                                                                                                                                                     |
| `.phenotype-expandable-card__next-tier`      |    2 | `#fef3c7`, `#fde68a`                                                                                                                                                     |
| `.phenotype-modal__next-tier`                |    2 | `#fef3c7`, `#fde68a`                                                                                                                                                     |
| `.phenotype-panel__progress-label`           |    2 | `#854d0e`, `#fcd34d`                                                                                                                                                     |
| `.phenotype-panel__tier-badge`               |    2 | `#f59e0b`, `#d97706`                                                                                                                                                     |
| `.whatif-result__verdict`                    |    2 | `rgba(234, 179, 8, 0.15)`, `#ca8a04`                                                                                                                                     |
| `.adv-analytics__confidence`                 |    1 | `#f59e0b`                                                                                                                                                                |
| `.adv-analytics__corr-fill`                  |    1 | `#f59e0b`                                                                                                                                                                |
| `.adv-analytics__pattern`                    |    1 | `#f59e0b`                                                                                                                                                                |
| `.adv-analytics__recommendation`             |    1 | `#78350f`                                                                                                                                                                |
| `.adv-analytics__recommendations-title`      |    1 | `#92400e`                                                                                                                                                                |
| `.adv-analytics__risk-factor-fill`           |    1 | `#f59e0b`                                                                                                                                                                |
| `.adv-analytics__science-card`               |    1 | `#f59e0b`                                                                                                                                                                |
| `.dual-risk-panel__status`                   |    1 | `#f59e0b`                                                                                                                                                                |
| `.dual-risk-panel__status-warn`              |    1 | `#f59e0b`                                                                                                                                                                |
| `.phenotype-expandable-card__list-item`      |    1 | `#f59e0b`                                                                                                                                                                |
| `.phenotype-expandable-card__next-tier-text` |    1 | `#92400e`                                                                                                                                                                |
| `.phenotype-modal__list-item`                |    1 | `#f59e0b`                                                                                                                                                                |
| `.phenotype-modal__next-tier-title`          |    1 | `#92400e`                                                                                                                                                                |
| `.phenotype-modal__unlock-tag`               |    1 | `#92400e`                                                                                                                                                                |
| `.phenotype-panel__progress-bar`             |    1 | `#fde047`                                                                                                                                                                |
| `.reason-card`                               |    1 | `#f59e0b`                                                                                                                                                                |
| `.risk-panel__factor`                        |    1 | `rgba(249, 115, 22, 0.05)`                                                                                                                                               |
| `.whatif-custom__field`                      |    1 | `#eab308`                                                                                                                                                                |
| `0%, 100%`                                   |    1 | `rgba(249, 115, 22, 0.05)`                                                                                                                                               |
| `50%`                                        |    1 | `rgba(249, 115, 22, 0.08)`                                                                                                                                               |

### `900-planning.css` — 56

| семейство                           | мест | литералы                                                                                                                                                                     |
| ----------------------------------- | ---: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.planning-task-row`                |    8 | `rgba(255, 237, 213, 0.88)`, `rgba(249, 115, 22, 0.18)`, `rgba(251, 146, 60, 0.12)`, `rgba(249, 115, 22, 0.16)`, `rgba(67, 20, 7, 0.92)`, `rgba(249, 115, 22, 0.24)`, … (+2) |
| `.planning-add-btn`                 |    6 | `#f59e0b`, `#f97316`, `rgba(249, 115, 22, 0.34)`, `#ea580c`, `rgba(249, 115, 22, 0.28)`                                                                                      |
| `.planning-calendar-context-block`  |    6 | `rgba(180, 83, 9, 0.2)`, `rgba(251, 191, 36, 0.2)`, `#92400e`, `rgba(251, 191, 36, 0.22)`, `rgba(180, 83, 9, 0.24)`, `#fde68a`                                               |
| `.planning-project-group`           |    6 | `rgba(249, 115, 22, 0.16)`                                                                                                                                                   |
| `.planning-task-group__header`      |    6 | `rgba(255, 237, 213, 0.88)`, `rgba(249, 115, 22, 0.18)`, `rgba(251, 146, 60, 0.12)`, `rgba(67, 20, 7, 0.92)`, `rgba(249, 115, 22, 0.24)`, `rgba(194, 65, 12, 0.2)`           |
| `.planning-task-node`               |    6 | `rgba(249, 115, 22, 0.16)`                                                                                                                                                   |
| `.planning-task-row__meta-chip`     |    6 | `#b45309`, `rgba(245, 158, 11, 0.18)`, `#92400e`, `#fde68a`, `rgba(245, 158, 11, 0.2)`                                                                                       |
| `.planning-calendar-day-pressure`   |    4 | `#b45309`, `rgba(245, 158, 11, 0.14)`, `#fcd34d`, `rgba(245, 158, 11, 0.18)`                                                                                                 |
| `.planning-goals-workspace__course` |    3 | `#d97706`, `rgba(245, 158, 11, 0.08)`, `rgba(245, 158, 11, 0.12)`                                                                                                            |
| `.planning-calendar-drag-conflict`  |    2 | `#b45309`, `#fcd34d`                                                                                                                                                         |
| `.planning-goals-card__course`      |    2 | `rgba(245, 158, 11, 0.11)`, `#a16207`                                                                                                                                        |
| `.planning-calendar-state-marker`   |    1 | `#c1842f`                                                                                                                                                                    |

### `600-steps-and-aps.css` — 48

| семейство                      | мест | литералы                                                                                        |
| ------------------------------ | ---: | ----------------------------------------------------------------------------------------------- |
| `.aps-ready-sets-btn`          |    7 | `#fef3c7`, `#fde68a`, `#fbbf24`, `#92400e`, `#fcd34d`, `#f59e0b`                                |
| `.aps-similar-warn`            |    6 | `rgba(180, 83, 9, 0.18)`, `#fef3c7`, `#78350f`, `#3b2a08`, `rgba(252, 211, 77, 0.2)`, `#fcd34d` |
| `.aps-similar-warn__item`      |    4 | `rgba(180, 83, 9, 0.22)`, `#78350f`, `rgba(252, 211, 77, 0.24)`, `#fcd34d`                      |
| `.aps-smart-rec`               |    4 | `#fef3c7`, `#fde68a`, `#78350f`, `#92400e`                                                      |
| `.aps-did-you-mean`            |    3 | `rgba(255, 213, 0, 0.08)`, `rgba(255, 213, 0, 0.2)`, `rgba(255, 213, 0, 0.5)`                   |
| `.aps-kcal-input`              |    3 | `#f59e0b`, `#d97706`                                                                            |
| `.mc-modal`                    |    3 | `#2b1608`, `rgba(80, 50, 20, 0.09)`, `rgba(80, 50, 20, 0.12)`                                   |
| `.aps-fav-btn`                 |    2 | `#fef3c7`, `#f59e0b`                                                                            |
| `.aps-kcal-input-row`          |    2 | `#fef3c7`, `#78350f`                                                                            |
| `.aps-kcal-label`              |    2 | `#92400e`, `#fcd34d`                                                                            |
| `.aps-rec-hint`                |    2 | `#92400e`, `#fcd34d`                                                                            |
| `.aps-similar-warn__dismiss`   |    2 | `#78350f`, `#fcd34d`                                                                            |
| `.aps-v4-preset-confirm__card` |    2 | `rgba(80, 50, 20, 0.16)`, `rgba(80, 50, 20, 0.22)`                                              |
| `0%`                           |    2 | `#fbbf24`, `rgba(251, 191, 36, 0.3)`                                                            |
| `100%`                         |    2 | `#f59e0b`, `rgba(251, 191, 36, 0.5)`                                                            |
| `.photo-viewer-action`         |    1 | `#e2a468`                                                                                       |
| `.photo-viewer-overlay`        |    1 | `#141210`                                                                                       |

### `1000-messenger.css` — 38

| семейство                         | мест | литералы                                              |
| --------------------------------- | ---: | ----------------------------------------------------- |
| `.messenger-food-hint__pill`      |    6 | `#e9d9b4`, `#8a6d2b`, `#3a3020`, `#d3be8e`, `#4a3a14` |
| `.messenger-food-hint`            |    5 | `#efe1c2`, `#6e5a2e`, `#201c15`, `#33291a`, `#b7a582` |
| `.messenger-food-hint__step`      |    4 | `#e9d9b4`, `#8a6d2b`, `#3a3020`, `#d3be8e`            |
| `.messenger-search__snippet`      |    4 | `#fff0c9`, `#4a3a14`, `#3a3020`, `#e4d3a9`            |
| `.messenger-apply__note`          |    3 | `#8a7549`, `#201c15`, `#b7a582`                       |
| `.messenger-food-hint__icon`      |    2 | `#b58b36`, `#c2a164`                                  |
| `.messenger-food-hint__text`      |    2 | `#4a3a14`, `#e4d3a9`                                  |
| `.messenger-food-hint__time`      |    2 | `#b58b36`, `#4a3a14`                                  |
| `0%, 55%`                         |    2 | `rgba(255, 240, 201, 0.9)`, `rgba(58, 48, 32, 0.95)`  |
| `100%`                            |    2 | `rgba(255, 240, 201, 0)`, `rgba(58, 48, 32, 0)`       |
| `.fab-group`                      |    1 | `#8a4a20`                                             |
| `.messenger-food-hint__hide`      |    1 | `#8a7549`                                             |
| `.messenger-food-hint__step-note` |    1 | `#8a7549`                                             |
| `.messenger-offline-bar__dot`     |    1 | `#c9ae7a`                                             |
| `.messenger-subtitle__dot`        |    1 | `#c9ae7a`                                             |
| `.msg-row`                        |    1 | `rgba(255, 240, 201, 0.9)`                            |

### `drums-finger-trainer.css` — 23

| семейство                     | мест | литералы                                                                             |
| ----------------------------- | ---: | ------------------------------------------------------------------------------------ |
| `.drums-ft-pain`              |    5 | `#9a3412`, `#ea580c`, `rgba(251, 146, 60, 0.28)`, `rgba(67, 20, 7, 0.42)`, `#fed7aa` |
| `.drums-ft-phase-banner`      |    4 | `rgba(217, 119, 6, 0.12)`, `#b45309`, `rgba(217, 119, 6, 0.22)`, `#fde68a`           |
| `.drums-ft-safety-stop`       |    3 | `#9a3412`, `#7c2d12`, `#fed7aa`                                                      |
| `.drums-ft-alert`             |    2 | `#9a3412`, `#ea580c`                                                                 |
| `.drums-ft-note-mark`         |    2 | `rgba(245, 158, 11, 0.55)`, `#f59e0b`                                                |
| `.drums-ft-controls`          |    1 | `#f59e0b`                                                                            |
| `.drums-ft-notation__accent`  |    1 | `#ea580c`                                                                            |
| `.drums-ft-notation__cursor`  |    1 | `#f59e0b`                                                                            |
| `.drums-ft-pill__icon`        |    1 | `rgba(245, 158, 11, 0.16)`                                                           |
| `.drums-ft-technique__accent` |    1 | `#ea580c`                                                                            |
| `.drums-ft-technique__step`   |    1 | `#f59e0b`                                                                            |
| `.drums-ft-technique__tip`    |    1 | `#f59e0b`                                                                            |

### `610-aps-meal-flow.css` — 21

| семейство                     | мест | литералы                                                                 |
| ----------------------------- | ---: | ------------------------------------------------------------------------ |
| `.mpc-save-preset-btn`        |    8 | `#fef3c7`, `#fde68a`, `#fbbf24`, `#fcd34d`, `#f59e0b`, `#78350f`, … (+1) |
| `.meal-quality-streak-banner` |    7 | `#fef3c7`, `#fde68a`, `rgba(251, 191, 36, 0.3)`, `#78350f`, `#92400e`    |
| `.meal-mood-scale__slider`    |    2 | `rgba(80, 50, 20, 0.25)`                                                 |
| `.meal-night-hint`            |    2 | `#3a2620`, `#e2a468`                                                     |
| `.aps-grams-slider`           |    1 | `#eab308`                                                                |
| `.meal-time-value`            |    1 | `#8a4a20`                                                                |

### `740-cascade-card.css` — 20

| семейство                     | мест | литералы                                                          |
| ----------------------------- | ---: | ----------------------------------------------------------------- |
| `.cascade-dot`                |    8 | `#f97316`, `#facc15`, `#f59e0b`, `#d97706`, `#b45309`             |
| `.cascade-card__hint`         |    3 | `rgba(245, 158, 11, 0.08)`, `#b45309`                             |
| `.cascade-timeline-row`       |    3 | `rgba(245, 158, 11, 0.12)`, `#b45309`, `rgba(245, 158, 11, 0.18)` |
| `.cascade-card__breaks-info`  |    2 | `rgba(245, 158, 11, 0.07)`, `rgba(245, 158, 11, 0.1)`             |
| `.cascade-dot-connector`      |    2 | `#fbbf24`, `#b45309`                                              |
| `.cascade-card__breaks-label` |    1 | `#b45309`                                                         |
| `.cascade-timeline-weight`    |    1 | `#b45309`                                                         |

### `750-strength-builder.css` — 15

| семейство        | мест | литералы                                               |
| ---------------- | ---: | ------------------------------------------------------ |
| `.sb-card-badge` |    2 | `rgba(249, 115, 22, 0.14)`, `#9a3412`                  |
| `.sb-card-bar`   |    2 | `#f97316`, `#c2410c`                                   |
| `.sb-card-cta`   |    2 | `#c2410c`, `#9a3412`                                   |
| `.sb-chip`       |    2 | `rgba(249, 115, 22, 0.45)`, `rgba(249, 115, 22, 0.14)` |
| `.sb-finish`     |    2 | `#c2410c`, `#9a3412`                                   |
| `.sb-card`       |    1 | `rgba(249, 115, 22, 0.35)`                             |
| `.sb-cat-add`    |    1 | `rgba(249, 115, 22, 0.45)`                             |
| `.sb-ex`         |    1 | `rgba(249, 115, 22, 0.45)`                             |
| `.sb-ss`         |    1 | `rgba(249, 115, 22, 0.4)`                              |
| `.sb-star`       |    1 | `#f97316`                                              |

### `611-aps-product-card.css` — 9

| семейство                    | мест | литералы                   |
| ---------------------------- | ---: | -------------------------- |
| `.aps-barcode-overlay`       |    2 | `#141210`                  |
| `.aps-barcode-camera`        |    1 | `#141210`                  |
| `.aps-barcode-error`         |    1 | `#b45309`                  |
| `.aps-barcode-finder-corner` |    1 | `#cf8144`                  |
| `.aps-barcode-finder-line`   |    1 | `#cf8144`                  |
| `.aps-product-name`          |    1 | `rgba(255, 213, 0, 0.4)`   |
| `.aps-v4-create-auto-field`  |    1 | `rgba(198, 113, 57, 0.12)` |
| `.aps-v4-harm-radio`         |    1 | `rgba(198, 113, 57, 0.12)` |

### `905-planning-chrono.css` — 8

| семейство                  | мест | литералы                                                                                   |
| -------------------------- | ---: | ------------------------------------------------------------------------------------------ |
| `.chrono-overview__streak` |    4 | `rgba(234, 88, 12, 0.10)`, `#9a3412`, `rgba(234, 88, 12, 0.18)`, `rgba(234, 88, 12, 0.35)` |
| `.chrono-duration__target` |    2 | `hsl(28, 85%, 52%)`                                                                        |
| `.theme-dark`              |    2 | `rgba(234, 88, 12, 0.22)`, `#fdba74`                                                       |

### `800-meal-optimizer.css` — 7

| семейство               | мест | литералы                                                                    |
| ----------------------- | ---: | --------------------------------------------------------------------------- |
| `.dark-theme`           |    4 | `rgba(245, 158, 11, 0.15)`, `#f59e0b`, `rgba(234, 179, 8, 0.15)`, `#eab308` |
| `.meal-optimizer__item` |    3 | `#f59e0b`, `#fef3c7`, `#fef9c3`                                             |

### `731-ui-v4-activity.css` — 6

| семейство              | мест | литералы             |
| ---------------------- | ---: | -------------------- |
| `.activity-v4`         |    3 | `#23201b`, `#2b1608` |
| `.activity-v4-cta`     |    1 | `#2b1608`            |
| `.activity-v4-program` |    1 | `#2b1608`            |
| `.page-day`            |    1 | `#23201b`            |

### `906-planning-goal-map.css` — 6

| семейство        | мест | литералы                                   |
| ---------------- | ---: | ------------------------------------------ |
| `.goal-map-node` |    6 | `#b88465`, `#452e26`, `#b29c61`, `#3b3523` |

### `612-training-step.css` — 2

| семейство             | мест | литералы  |
| --------------------- | ---: | --------- |
| `.ts-slider`          |    1 | `#eab308` |
| `.ts-slider-negative` |    1 | `#eab308` |

### `907-planning-reading.css` — 2

| семейство                         | мест | литералы  |
| --------------------------------- | ---: | --------- |
| `.reading-cover__editorial-role`  |    1 | `#51472f` |
| `.reading-reader__palette-option` |    1 | `#f6d977` |

### `912-planning-game-assemble-day.css` — 2

| семейство                   | мест | литералы  |
| --------------------------- | ---: | --------- |
| `.assemble-day-choice-rule` |    1 | `#735b32` |
| `.assemble-day-conflict`    |    1 | `#735138` |
