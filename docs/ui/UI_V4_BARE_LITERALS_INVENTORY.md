# Голые литералы цвета в закрытых зонах — опись для разметки

Вторая опись к [`UI_V4_SAND_ROLES_INVENTORY.md`](UI_V4_SAND_ROLES_INVENTORY.md).
Та описывает роли с именем набора; эта — второй источник того же песочного на
синем, который первая не видит по построению.

Роль `--v4-sand-*` заменяется на общую механически. Литерал вида `#efe3cf` не
заменяется ничем: он не роль, гейт неопределённых ролей его не видит (роли нет),
гейт чужих запасных значений не видит (запасного значения нет — есть само
значение). После разметки первой описи эти места **останутся песочными**, и
заметить это будет некому.

**Что сделать с этим файлом.** Разметьте так же, как первую опись: `герой` в
начале строки семейства там, где тёплый тон назван контрактом намеренно.
Неотмеченное — замена на роль отдельной задачей.

**Что здесь считается местом.** Значение цвета (`#hex`, `rgb…`, `hsl…`), стоящее
в объявлении напрямую, а не как имя роли. Запасное значение внутри
`var(--роль, …)` местом **не** считается: там роль есть, и это отдельный вопрос
со своим гейтом. Объявления самих ролей (`--v4-…: #…`) не считаются — это и есть
палитра.

**Охват и остаток.** Файлы взяты не на глаз: это все файлы, которые называют
своими обоснованиями вердикты **19 закрытых зон** — на 31 августа это все, кроме
`food-meal`, `reports-insights`, `water-add` и `curator-cabinet`, у которых ещё
стоят `?`. Список зон движется: кабинет куратора ушёл в незакрытые прямо во
время сборки этой описи, когда 202 его строки вернулись в `?`. Всего в этих
файлах **7212** голых литералов. В опись попали **1191** — тёплые: оттенок
12–55°, насыщенность от 10 %. Остальные 6021 палитре тоже не следуют, но
песочными экран не делают, и это отдельный разговор.

**Звёздочка** у литерала означает, что это в точности объявленное значение
песочной роли и ни одной синей — такое место переводится на роль без разговора.
Остальные тёплые тона свои собственные: ими нарисованы в основном легаси-экраны,
которые в v4 не сводили, и там нужно решение, а не механическая замена.

Всего мест: **1191** в 38 файлах, 478 семействах.

---

## `000-base-and-gamification.css` — 263

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

## `heys-components.css` — 191

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

## `730-widgets-dashboard.css` — 175

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
| `.widget-wd-sheet__check`             |    1 | `#8a4a20`                                                                                                                                                                     |
| `.widget-wd-sheet__opt`               |    1 | `rgba(207, 129, 68, 0.18)`                                                                                                                                                    |
| `.widgets-grid`                       |    1 | `#c67139`                                                                                                                                                                     |
| `.widgets-quick-scrim`                |    1 | `rgba(43, 22, 8, 0.34)`                                                                                                                                                       |

## `500-pwa-and-offline.css` — 71

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

## `733-ui-v4-login-theme.css` — 68

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
| `.consent-fulltext-backdrop`             |    1 | `rgba(42, 26, 12, 0.5)`                                  |
| `.consent-fulltext__close`               |    1 | `#23201b`                                                |
| `.consent-fulltext__progress-fill`       |    1 | `#cf8144`                                                |
| `.consent-fulltext__progress-label`      |    1 | `#e2a468`                                                |
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

## `400-water-and-hydration.css` — 58

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
| `.advice-v4-detail-overlay`           |    1 | `#141210`                                                                                              |
| `.advice-v4-detail__close`            |    1 | `#23201b`                                                                                              |
| `.advice-v4-detail__science-box`      |    1 | `#23201b`                                                                                              |
| `.advice-v4-detail__section-title`    |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-detail__tech-link`        |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-hide-ring__num`           |    1 | `#8a4a20`                                                                                              |
| `.advice-v4-hide-ring__progress`      |    1 | `#c67139`                                                                                              |
| `.advice-v4-panel`                    |    1 | `#23201b`                                                                                              |
| `.advice-v4-science`                  |    1 | `rgba(80, 50, 20, 0.12)`                                                                               |
| `.advice-v4-science__close`           |    1 | `#23201b`                                                                                              |
| `.advice-v4-science__source`          |    1 | `#23201b`                                                                                              |
| `.fab-group`                          |    1 | `#8a4a20`                                                                                              |

## `300-modals-and-day.css` — 50

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

## `heys_profile_step_v1.js` — 42

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

## `heys_supplements_v1.js` — 36

Зоны: `nutrition-tab`

| где в коде         | мест | литералы                                   |
| ------------------ | ---: | ------------------------------------------ |
| `valueStyle`       |    5 | `#fef3c7`, `#92400e`, `#d97706`            |
| `priorityColors`   |    4 | `#fdba74`, `#ea580c`, `#fde047`, `#ca8a04` |
| `GROUP_THEME`      |    3 | `#fef3c7`, `#f59e0b`, `#92400e`            |
| `color`            |    3 | `#92400e`                                  |
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

## `_meals.js` — 33

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

## `heys_consents_v1.js` — 28

Зоны: `home-widgets`, `login`, `registration`, `spinners`

| где в коде         | мест | литералы                                                           |
| ------------------ | ---: | ------------------------------------------------------------------ |
| `version`          |    7 | `#fef3c7`, `#92400e`, `#fcd34d`, `#f6e6dd`_, `#a1471c`_, `#8a4a20` |
| `handleClick`      |    4 | `#fef3c7`, `#fbbf24`, `#92400e`, `rgba(146,64,14,0.15)`            |
| `CONSENT_TEXTS`    |    3 | `#fef3c7`, `#f59e0b`, `#92400e`                                    |
| `res`              |    3 | `#fef3c7`, `#92400e`, `#fcd34d`                                    |
| `NotMedicineBadge` |    2 | `#fef3c7`, `#b45309`                                               |
| `clientId`         |    2 | `#fef3c7`, `#92400e`                                               |
| `done`             |    2 | `#f6e6dd`\*, `#d97642`                                             |
| `next`             |    2 | `#c67139`, `#2b1608`                                               |
| `openFull`         |    2 | `#8a4a20`                                                          |
| `boxStyle`         |    1 | `#c67139`                                                          |

## `715-yesterday-verify.css` — 21

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

## `heys_steps_v1.js` — 17

Зоны: `checkin-morning`, `cycle`, `date-remainders`, `undo-bar`

| где в коде            | мест | литералы                                                          |
| --------------------- | ---: | ----------------------------------------------------------------- |
| `suffix`              |    6 | `rgba(245, 158, 11, 0.35)`, `rgba(245, 158, 11, 0.12)`, `#b45309` |
| `isSelected`          |    4 | `#f97316`, `rgba(249, 115, 22, 0.1)`, `#ea580c`                   |
| `estimatedHint`       |    2 | `#efe3cf`, `#8a4a20`                                              |
| `getColor`            |    2 | `#eab308`                                                         |
| `getSleepAdviceColor` |    2 | `#fef08a`, `#854d0e`                                              |
| `thumbPx`             |    1 | `rgba(80, 50, 20, 0.25)`                                          |

## `heys_user_v12.js` — 16

Зоны: `home-widgets`

| где в коде        | мест | литералы                                                                                         |
| ----------------- | ---: | ------------------------------------------------------------------------------------------------ |
| `targetDate`      |    7 | `rgba(234, 179, 8, 0.1)`, `#eab308`, `#b45309`, `rgba(251, 191, 36, 0.15)`, `#92400e`, `#fef3c7` |
| `DEFICIT_PRESETS` |    2 | `#f97316`, `#eab308`                                                                             |
| `bmiCat`          |    2 | `#eab308`, `#f97316`                                                                             |
| `warnings`        |    2 | `#f97316`, `#eab308`                                                                             |
| `calPerMin`       |    1 | `#f59e0b`                                                                                        |
| `diff`            |    1 | `#f97316`                                                                                        |
| `preset`          |    1 | `#f97316`                                                                                        |

## `heys_user_tab_impl_v1.js` — 14

Зоны: `cycle`, `home-widgets`, `registration`, `settings-system`

| где в коде        | мест | литералы                                                         |
| ----------------- | ---: | ---------------------------------------------------------------- |
| `statusText`      |    4 | `#a1471c`\*, `rgba(161, 71, 28, 0.22)`, `rgba(138, 74, 32, 0.1)` |
| `DEFICIT_PRESETS` |    2 | `#f97316`, `#eab308`                                             |
| `bmiCat`          |    2 | `#eab308`, `#f97316`                                             |
| `res`             |    2 | `#f59e0b`, `#92400e`                                             |
| `calPerMin`       |    1 | `#a1471c`\*                                                      |
| `isEnabled`       |    1 | `rgba(138, 74, 32, 0.12)`                                        |
| `preset`          |    1 | `#f97316`                                                        |
| `targetDate`      |    1 | `rgba(138, 74, 32, 0.08)`                                        |

## `heys_widgets_ui_v1.js` — 14

Зоны: `home-widgets`, `settings-system`

| где в коде                 | мест | литералы                                                         |
| -------------------------- | ---: | ---------------------------------------------------------------- |
| `getRelapseGradientColors` |    6 | `#fdba74`, `#f97316`, `#fcd34d`, `#f59e0b`, `#fde68a`, `#eab308` |
| `_DYNAMIC_GRADIENTS`       |    3 | `#f59e0b`, `#fde68a`                                             |
| `_staticGradient`          |    2 | `#fde68a`, `#f59e0b`                                             |
| `getRelapseRiskColor`      |    1 | `#f97316`                                                        |
| `getStatusInfo`            |    1 | `#f97316`                                                        |
| `getStreakColor`           |    1 | `#f97316`                                                        |

## `critical.css` — 12

Зоны: `home-widgets`

| семейство         | мест | литералы                                              |
| ----------------- | ---: | ----------------------------------------------------- |
| `.hdr-date-group` |    6 | `#8a4a20`, `#f3e0d2`, `#23201b`, `#e2a468`, `#3a2620` |
| `.hdr-top`        |    2 | `#f5ead8`                                             |
| `.page-day`       |    2 | `#141210`                                             |
| `.card`           |    1 | `rgba(234, 179, 8, 0.08)`                             |
| `.hdr`            |    1 | `#141210`                                             |

## `heys_day_sparklines_v1.js` — 10

Зоны: `cycle`

| где в коде                | мест | литералы             |
| ------------------------- | ---: | -------------------- |
| `wd`                      |    4 | `#f97316`, `#eab308` |
| `getDayScoreColor`        |    2 | `#f97316`, `#eab308` |
| `cp2y`                    |    1 | `#f97316`            |
| `trendColor`              |    1 | `#fb923c`            |
| `weightLineGradientStops` |    1 | `#fb923c`            |
| `weightTrend`             |    1 | `#f97316`            |

## `heys_board_tab_v1.js` — 7

Зоны: `spinners`

| где в коде | мест | литералы                                                                                                                  |
| ---------- | ---: | ------------------------------------------------------------------------------------------------------------------------- |
| `style`    |    7 | `rgba(234,179,8,.06)`, `rgba(234,179,8,.25)`, `rgba(251,191,36,.1)`, `rgba(251,191,36,.28)`, `#f59e0b`, `#eab308`, … (+1) |

## `heys_cascade_card_v1.js` — 7

Зоны: `nutrition-tab`

| где в коде     | мест | литералы                                             |
| -------------- | ---: | ---------------------------------------------------- |
| `STATE_CONFIG` |    2 | `#eab308`, `#f59e0b`                                 |
| `badGrad`      |    2 | `rgba(253, 224, 71, 0.7)`, `rgba(249, 115, 22, 0.6)` |
| `goodShadow`   |    2 | `#f97316`, `#fde047`                                 |
| `conf`         |    1 | `#f59e0b`                                            |

## `heys_iw_ui.js` — 7

Зоны: `nutrition-tab`

| где в коде         | мест | литералы                                                             |
| ------------------ | ---: | -------------------------------------------------------------------- |
| `confidenceTone`   |    4 | `#9A6700`, `rgba(245,183,49,.12)`, `#A64B2A`, `rgba(218,112,74,.11)` |
| `isCuratorSession` |    2 | `rgba(245,183,49,.10)`, `#795500`                                    |
| `rangeWasCapped`   |    1 | `#9A6700`                                                            |

## `heys_gamification_v1.js` — 6

Зоны: `gamification`, `nutrition-tab`

| где в коде      | мест | литералы                             |
| --------------- | ---: | ------------------------------------ |
| `float`         |    2 | `#f59e0b`, `#fbbf24`                 |
| `fly`           |    2 | `#fbbf24`, `rgba(251, 191, 36, 0.6)` |
| `LEVEL_TITLES`  |    1 | `#eab308`                            |
| `RARITY_COLORS` |    1 | `#eab308`                            |

## `heys_scales_v1.js` — 6

Зоны: `gamification`

| где в коде             | мест | литералы                        |
| ---------------------- | ---: | ------------------------------- |
| `C`                    |    3 | `#eab308`, `#f97316`, `#f59e0b` |
| `MACRO_GRADIENT_STOPS` |    2 | `#fde68a`, `#f59e0b`            |
| `CLASSIC_STEP_COLOR`   |    1 | `#eab308`                       |

## `heys_day_stats_v1.js` — 5

Зоны: `cycle`, `norm-correction`

| где в коде      | мест | литералы             |
| --------------- | ---: | -------------------- |
| `carbsOverData` |    2 | `#fde68a`, `#f59e0b` |
| `pct`           |    2 | `#eab308`            |
| `diff`          |    1 | `#eab308`            |

## `heys_weekly_reports_v2.js` — 5

Зоны: `norm-correction`

| где в коде           | мест | литералы             |
| -------------------- | ---: | -------------------- |
| `_DYNAMIC_GRADIENTS` |    3 | `#f59e0b`, `#fde68a` |
| `_staticGradient`    |    2 | `#fde68a`, `#f59e0b` |

## `heys_app_shell_v1.js` — 4

Зоны: `curator-edits`, `date-remainders`, `home-widgets`, `login`,
`nutrition-tab`, `settings-system`, `spinners`, `tips`

| где в коде | мест | литералы             |
| ---------- | ---: | -------------------- |
| `dots`     |    2 | `#c67139`, `#efe3cf` |
| `source`   |    2 | `#c67139`, `#efe3cf` |

## `heys_paywall_v1.js` — 4

Зоны: `nutrition-tab`

| где в коде | мест | литералы                        |
| ---------- | ---: | ------------------------------- |
| `meta`     |    4 | `#fef3c7`, `#fde68a`, `#f59e0b` |

## `heys_login_theme_picker_v1.js` — 3

Зоны: `login`

| где в коде         | мест | литералы             |
| ------------------ | ---: | -------------------- |
| `PALETTE_VARIANTS` |    2 | `#c67139`, `#efe3cf` |
| `paletteSwatch`    |    1 | `#c67139`            |

## `heys_ratio_zones_v1.js` — 3

Зоны: `gamification`

| где в коде            | мест | литералы  |
| --------------------- | ---: | --------- |
| `DEFAULT_RATIO_ZONES` |    2 | `#eab308` |
| `zone`                |    1 | `#f59e0b` |

## `widget_data.js` — 3

Зоны: `checkin-morning`, `home-widgets`

| где в коде | мест | литералы  |
| ---------- | ---: | --------- |
| `v4`       |    2 | `#c67139` |
| `slope`    |    1 | `#eab308` |

## `heys-boot-mark.css` — 2

Зоны: `app-splash`, `registration`, `spinners`

| семейство                 | мест | литералы  |
| ------------------------- | ---: | --------- |
| `.heys-boot-visual-guard` |    1 | `#141210` |
| `.heys-wait-mark-overlay` |    1 | `#141210` |

## `heys_day_diary_section.js` — 2

Зоны: `nutrition-tab`

| где в коде     | мест | литералы             |
| -------------- | ---: | -------------------- |
| `numericScore` |    2 | `#eab308`, `#f97316` |

## `heys_theme_v1.js` — 2

Зоны: `settings-system`

| где в коде         | мест | литералы             |
| ------------------ | ---: | -------------------- |
| `THEME_COLOR_META` |    2 | `#c67139`, `#23201b` |

## `heys_trial_intake_v1.js` — 2

Зоны: `home-widgets`, `questionnaire`

| где в коде      | мест | литералы                |
| --------------- | ---: | ----------------------- |
| `cardStyle`     |    1 | `rgba(40, 24, 8, 0.08)` |
| `storageNotice` |    1 | `rgba(40, 24, 8, 0.16)` |

## `732-ui-v4-nutrition.css` — 1

Зоны: `home-widgets`, `nutrition-tab`

| семейство             | мест | литералы                 |
| --------------------- | ---: | ------------------------ |
| `.nutrition-v4-sheet` |    1 | `rgba(33, 30, 25, 0.34)` |

## `heys_add_product_step_v1.js` — 1

Зоны: `nutrition-tab`, `product-card`

| где в коде | мест | литералы    |
| ---------- | ---: | ----------- |
| `h`        |    1 | `#d99a63`\* |

## `heys_step_modal_v1.js` — 1

Зоны: `checkin-morning`, `registration`, `spinners`

| где в коде    | мест | литералы    |
| ------------- | ---: | ----------- |
| `targetIndex` |    1 | `#a1471c`\* |

## `heys_widgets_registry_v1.js` — 1

Зоны: `home-widgets`

| где в коде   | мест | литералы  |
| ------------ | ---: | --------- |
| `CATEGORIES` |    1 | `#f97316` |
