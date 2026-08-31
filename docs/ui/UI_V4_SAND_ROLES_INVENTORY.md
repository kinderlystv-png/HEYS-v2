# Роли набора в модулях — опись для разметки

Роль вида `--v4-sand-*` в модуле запирает цвет мимо выбора человека: в синих
наборах она держит песочное значение, тогда как общая роль меняется. Решение
владельца 31 августа: синий обязан быть синим целиком, а тёплый цвет героя
выражается отдельной ролью `--v4-hero-act`, а не именем набора.

**Что сделать с этим файлом.** Отметьте геройские места — те, где контракт прямо
называет терракоту героем (Калории, Оценка дня и подобное). Их десятки. Всё
неотмеченное — механическая замена на общую роль отдельной задачей.

Пометка: поставьте `герой` в начало строки семейства.

Всего мест: **581** в 13 модулях, 256 семействах.

## `610-aps-meal-flow.css` — 158

| семейство                      | мест | роли                                                                                                                           |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.aps-v4-meal-summary`         | 16   | `--v4-sand-ink`, `--v4-sand-hero`, `--v4-sand-act-deep`, `--v4-sand-surface`, `--v4-sand-act`                                  |
| `.mpr-btn`                     | 10   | `--v4-sand-surface-soft`, `--v4-sand-ok-text`, `--v4-sand-ink`, `--v4-sand-tint-green`, `--v4-sand-hero`, `--v4-sand-act-deep` |
| `.mpr-create-btn`              | 8    | `--v4-sand-hero`, `--v4-sand-act-deep`, `--v4-sand-act`, `--v4-sand-surface`, `--v4-sand-ink`                                  |
| `.aps-v4-grams-impact`         | 8    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-act-deep`, `--v4-sand-act`                                                    |
| `.meal-mood-scale`             | 7    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-ok-text`, `--v4-sand-act-deep`, `--v4-sand-surface-soft`                      |
| `.mpr-card`                    | 7    | `--v4-sand-surface-soft`, `--v4-sand-tint-green`, `--v4-sand-ink`, `--v4-sand-ok-text`                                         |
| `.aps-v4-grams-chip`           | 7    | `--v4-sand-surface-soft`, `--v4-sand-ink`, `--v4-sand-act`, `--v4-sand-tint-green`, `--v4-sand-green-ink`                      |
| `.aps-v4-grams-hero`           | 6    | `--v4-sand-hero`, `--v4-sand-ink`, `--v4-sand-surface-soft`, `--v4-sand-act-deep`                                              |
| `.meal-time-hero`              | 5    | `--v4-sand-hero`, `--v4-sand-ink`, `--v4-sand-act-deep`                                                                        |
| `.flow-selection-btn`          | 5    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-hero`, `--v4-sand-act`                                                        |
| `.mpr-preview-set-tools`       | 5    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-surface-soft`                                                                 |
| `.aps-v4-search-state`         | 5    | `--v4-sand-hero`, `--v4-sand-accent-bg`, `--v4-sand-ink`                                                                       |
| `.meal-type-chip`              | 4    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-hero`, `--v4-sand-act-deep`                                                   |
| `.meal-mood-chip`              | 4    | `--v4-sand-surface`, `--v4-sand-ink`, `--v4-sand-hero`, `--v4-sand-act-deep`                                                   |
| `.mpr-assemble-btn`            | 4    | `--v4-sand-surface`, `--v4-sand-act-deep`, `--v4-sand-ink`                                                                     |
| `.meal-type-btn`               | 3    | `--v4-sand-surface`, `--v4-sand-hero`, `--v4-sand-act-deep`                                                                    |
| `.mpr-suggested-card`          | 3    | `--v4-sand-tint-green`, `--v4-sand-ink`, `--v4-sand-ok-text`                                                                   |
| `.aps-v4-search-tab`           | 3    | `--v4-sand-ink`, `--v4-sand-act-deep`, `--v4-sand-act`                                                                         |
| `.aps-v4-grams-unit`           | 3    | `--v4-sand-ink`, `--v4-sand-surface-soft`, `--v4-sand-act-deep`                                                                |
| `.meal-night-hint`             | 2    | `--v4-sand-accent-bg`, `--v4-sand-act-deep`                                                                                    |
| `.meal-time-wave`              | 2    | `--v4-sand-accent-bg`, `--v4-sand-act-deep`                                                                                    |
| `.mpr-back-btn`                | 2    | `--v4-sand-ink`, `--v4-sand-surface`                                                                                           |
| `.mpr-my-set-row`              | 2    | `--v4-sand-ink`                                                                                                                |
| `.mpr-search-input`            | 2    | `--v4-sand-ink`                                                                                                                |
| `.mpr-search-clear`            | 2    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-search-offline`       | 2    | `--v4-sand-accent-bg`, `--v4-sand-act-deep`                                                                                    |
| `.aps-v4-grams-duplicate`      | 2    | `--v4-sand-hero`, `--v4-sand-act-deep`                                                                                         |
| `.aps-v4-search-field`         | 2    | `--v4-sand-surface-soft`, `--v4-sand-act`                                                                                      |
| `.meal-time-step`              | 1    | `--v4-sand-act-deep`                                                                                                           |
| `.meal-type-hint`              | 1    | `--v4-sand-ink`                                                                                                                |
| `.meal-time-cta`               | 1    | `--v4-sand-act`                                                                                                                |
| `.flow-selection-row`          | 1    | `--v4-sand-surface`                                                                                                            |
| `.meal-type-btn-name`          | 1    | `--v4-sand-ink`                                                                                                                |
| `.meal-mood-tier`              | 1    | `--v4-sand-act-deep`                                                                                                           |
| `.mpr-title`                   | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-header-edit-btn`         | 1    | `--v4-sand-act-deep`                                                                                                           |
| `.mpr-tier`                    | 1    | `--v4-sand-act-deep`                                                                                                           |
| `.mpr-my-sets-list`            | 1    | `--v4-sand-surface`                                                                                                            |
| `.mpr-footnote`                | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-delete-preset-btn`       | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-card-name`               | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-card-meta`               | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-empty`                   | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-search-row`              | 1    | `--v4-sand-surface`                                                                                                            |
| `.mpr-search-result-macros`    | 1    | `--v4-sand-ink`                                                                                                                |
| `.mpr-preview-item`            | 1    | `--v4-sand-surface`                                                                                                            |
| `.aps-search-field`            | 1    | `--v4-sand-surface`                                                                                                            |
| `.aps-search-input`            | 1    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-search-lead`          | 1    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-search-footnote`      | 1    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-grams-converted`      | 1    | `--v4-sand-act-deep`                                                                                                           |
| `.aps-v4-grams-converted-note` | 1    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-grams-last`           | 1    | `--v4-sand-ink`                                                                                                                |
| `.aps-v4-grams-over`           | 1    | `--v4-sand-hero`                                                                                                               |
| `.mpc-recipe-line`             | 1    | `--v4-sand-ink`                                                                                                                |

## `500-pwa-and-offline.css` — 100

| семейство                    | мест | роли                                                                                                  |
| ---------------------------- | ---- | ----------------------------------------------------------------------------------------------------- |
| `.mc-modal`                  | 14   | `--v4-sand-surface-soft`, `--v4-sand-act`, `--v4-sand-ink`, `--v4-sand-surface`, `--v4-sand-act-text` |
| `.cycle-card-v4`             | 10   | `--v4-sand-surface`, `--v4-sand-act-text`, `--v4-sand-surface-soft`, `--v4-sand-act`                  |
| `.mc-pill`                   | 4    | `--v4-sand-act`, `--v4-sand-surface-soft`, `--v4-sand-ink`                                            |
| `.mc-rest-type`              | 4    | `--v4-sand-surface-soft`, `--v4-sand-hero`, `--v4-sand-act`, `--v4-sand-ink`                          |
| `.mc-rest-row`               | 3    | `--v4-sand-tint`, `--v4-sand-surface`                                                                 |
| `.cycle-v4-btn`              | 3    | `--v4-sand-surface`, `--v4-sand-act`, `--v4-sand-act-text`                                            |
| `.cycle-date-picker-cell`    | 3    | `--v4-sand-surface`, `--v4-sand-act`, `--v4-sand-act-text`                                            |
| `.mc-rest-cold-time`         | 3    | `--v4-sand-surface-soft`, `--v4-sand-act-text`                                                        |
| `.mc-steps-advice-mark`      | 2    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-measure-side-pill` | 2    | `--v4-sand-surface`, `--v4-sand-act`                                                                  |
| `.mc-note-toggle-icon`       | 2    | `--v4-sand-hero`, `--v4-sand-act-text`                                                                |
| `.mc-rest-cycle-btn`         | 2    | `--v4-sand-act`, `--v4-sand-surface-soft`                                                             |
| `.profile-v4-toggle`         | 2    | `--v4-sand-act`, `--v4-sand-surface-soft`                                                             |
| `.mc-rest-supp-add-icon`     | 2    | `--v4-sand-hero`, `--v4-sand-act-text`                                                                |
| `.mc-supp-flow-empty-icon`   | 2    | `--v4-sand-hero`, `--v4-sand-act-text`                                                                |
| `.mc-supp-flow-add-row`      | 2    | `--v4-sand-hero`, `--v4-sand-act-text`                                                                |
| `.pwa-banner-title`          | 1    | `--v4-sand-ink`                                                                                       |
| `.pwa-banner-install`        | 1    | `--v4-sand-act`                                                                                       |
| `.pwa-banner-later`          | 1    | `--v4-sand-act-text`                                                                                  |
| `.ios-banner-content`        | 1    | `--v4-sand-ink`                                                                                       |
| `.ios-step`                  | 1    | `--v4-sand-ink`                                                                                       |
| `.ios-step-num`              | 1    | `--v4-sand-act-text`                                                                                  |
| `.ios-share-icon`            | 1    | `--v4-sand-act-text`                                                                                  |
| `.ios-got-it-btn`            | 1    | `--v4-sand-act`                                                                                       |
| `.ios-home-install-modal`    | 1    | `--v4-sand-tint`                                                                                      |
| `.mc-daily-footer`           | 1    | `--v4-sand-surface-soft`                                                                              |
| `.mc-daily-footer-secondary` | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-daily-footer-primary`   | 1    | `--v4-sand-act`                                                                                       |
| `.mc-progress-dots`          | 1    | `--v4-sand-act`                                                                                       |
| `.mc-hero-number`            | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-scale-card`             | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-rest-card`              | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-weight-hero-value`      | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-weight-kilo-card`       | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-weight-comma`           | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-sleep-block`            | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-steps-hero-value`       | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-measure-row`       | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-rest-measure-input`     | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-consent-primary`   | 1    | `--v4-sand-act`                                                                                       |
| `.mc-note-toggle`            | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-steps-info-card`        | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-rest-cycle-mark-chip`   | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-cycle-card`        | 1    | `--v4-sand-surface`                                                                                   |
| `.mc-rest-cycle-week-badge`  | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-cycle-tier`        | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-rest-cycle-day-btn`     | 1    | `--v4-sand-act`                                                                                       |
| `.cycle-date-picker-sheet`   | 1    | `--v4-sand-surface-soft`                                                                              |
| `.mc-rest-supp-add`          | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-supp-flow-foot`         | 1    | `--v4-sand-surface-soft`                                                                              |
| `.mc-supp-flow-btn`          | 1    | `--v4-sand-act`                                                                                       |
| `.mc-supp-flow-add-icon`     | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-supp-flow-tier`         | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-supp-flow-chip`         | 1    | `--v4-sand-act`                                                                                       |
| `.mc-supp-flow-dose-num`     | 1    | `--v4-sand-act-text`                                                                                  |
| `.mc-supp-flow-timing-label` | 1    | `--v4-sand-act-text`                                                                                  |

## `000-base-and-gamification.css` — 96

| семейство                    | мест | роли                                                                                                                                                         |
| ---------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.game-v4-sheet`             | 32   | `--v4-sand-ink`, `--v4-sand-surface`, `--v4-sand-hero`, `--v4-sand-act-text`, `--v4-sand-act-mid`, `--v4-sand-act`, `--v4-sand-ok-fill`, `--v4-sand-ok-text` |
| `.profile-section`           | 7    | `--v4-sand-tint`, `--v4-sand-act`, `--v4-sand-hero`                                                                                                          |
| `.profile-goal-panel`        | 5    | `--v4-sand-hero`, `--v4-sand-ok-fill-soft`, `--v4-sand-act`, `--v4-sand-ok-text`                                                                             |
| `.date-picker-sheet`         | 4    | `--v4-sand-surface-soft`, `--v4-sand-act`, `--v4-sand-surface`, `--v4-sand-act-text`                                                                         |
| `.profile-push-status`       | 4    | `--v4-sand-hero`, `--v4-sand-ok-fill-soft`, `--v4-sand-act-text`, `--v4-sand-act`                                                                            |
| `.profile-message`           | 4    | `--v4-sand-hero`, `--v4-sand-ink`, `--v4-sand-ok-fill-soft`, `--v4-sand-ok-text`                                                                             |
| `.profile-subscription-card` | 4    | `--v4-sand-hero`, `--v4-sand-tint`, `--v4-sand-act`                                                                                                          |
| `.profile-hr-zone`           | 3    | `--v4-sand-hero`, `--v4-sand-ok-fill-soft`, `--v4-sand-ok-text`                                                                                              |
| `.profile-field-group`       | 2    | `--v4-sand-act`                                                                                                                                              |
| `.profile-accordion`         | 2    | `--v4-sand-act`, `--v4-sand-act-text`                                                                                                                        |
| `.profile-ios-install`       | 2    | `--v4-sand-hero`, `--v4-sand-ink`                                                                                                                            |
| `.profile-hint`              | 2    | `--v4-sand-act-mid`, `--v4-sand-ok-fill`                                                                                                                     |
| `.profile-advice-chip`       | 2    | `--v4-sand-tint`, `--v4-sand-act-text`                                                                                                                       |
| `.profile-goal-progress`     | 2    | `--v4-sand-hero`, `--v4-sand-ok-text`                                                                                                                        |
| `.profile-progress-bar`      | 2    | `--v4-sand-act`, `--v4-sand-ok-fill`                                                                                                                         |
| `.profile-advice-stats`      | 2    | `--v4-sand-ok-fill-soft`, `--v4-sand-ok-text`                                                                                                                |
| `.card`                      | 1    | `--v4-sand-ink-slate`                                                                                                                                        |
| `.hdr-readonly-banner`       | 1    | `--v4-sand-warn-bg`                                                                                                                                          |
| `.game-level-number`         | 1    | `--v4-sand-act-text`                                                                                                                                         |
| `.game-streak-chip`          | 1    | `--v4-sand-act-text`                                                                                                                                         |
| `.push-first-day-prompt`     | 1    | `--v4-sand-ink`                                                                                                                                              |
| `.hdr-header-icon-btn`       | 1    | `--v4-sand-ink`                                                                                                                                              |
| `.hdr-widgets-edit-btn`      | 1    | `--v4-sand-act-text`                                                                                                                                         |
| `.tabs`                      | 1    | `--v4-sand-act-text`                                                                                                                                         |
| `.hdr-settings-sheet`        | 1    | `--v4-sand-act-text`                                                                                                                                         |
| `.tab-settings-diary-toggle` | 1    | `--v4-sand-act`                                                                                                                                              |
| `.tab-advice-badge`          | 1    | `--v4-sand-act`                                                                                                                                              |
| `.toggle-switch`             | 1    | `--v4-sand-act`                                                                                                                                              |
| `.profile-push-toast`        | 1    | `--v4-sand-ok-fill`                                                                                                                                          |
| `.profile-inline-check`      | 1    | `--v4-sand-act`                                                                                                                                              |
| `.profile-weight-diff`       | 1    | `--v4-sand-ok-text`                                                                                                                                          |
| `.profile-consent-row`       | 1    | `--v4-sand-ok-fill-soft`                                                                                                                                     |
| `.game-panel-expanded`       | 1    | `--v4-sand-ink`                                                                                                                                              |

## `730-widgets-dashboard.css` — 61

| семейство                   | мест | роли                                                                                                     |
| --------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| `.widget-v4-insulin-wave`   | 8    | `--v4-sand-wave`, `--v4-sand-act`, `--v4-sand-ink`                                                       |
| `.widget-v4-catalog`        | 6    | `--v4-sand-act-mid`, `--v4-sand-surface`, `--v4-sand-ok-fill`, `--v4-sand-ok-text`, `--v4-sand-act-text` |
| `.widget-calories`          | 5    | `--v4-sand-ok-text`, `--v4-sand-act-text`, `--v4-sand-ink`, `--v4-sand-ok-fill`                          |
| `.widget-bd-sheet`          | 5    | `--v4-sand-surface`, `--v4-sand-act`, `--v4-sand-ok-text`                                                |
| `.widgets-tab`              | 3    | `--v4-sand-surface`, `--v4-sand-surface-soft`, `--v4-sand-act-mid`                                       |
| `.widget-v4-recommended`    | 3    | `--v4-sand-surface`, `--v4-sand-act`, `--v4-sand-act-text`                                               |
| `.widget-v4-row`            | 2    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-insulin-daybar` | 2    | `--v4-sand-ink`, `--v4-sand-wave`                                                                        |
| `.widget-v4-add`            | 2    | `--v4-sand-act-mid`                                                                                      |
| `.widget-v4-empty`          | 2    | `--v4-sand-surface`, `--v4-sand-act-text`                                                                |
| `.widget-v4-checklist`      | 2    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-wd-sheet`          | 2    | `--v4-sand-act`                                                                                          |
| `.widget-v4-week-bars`      | 2    | `--v4-sand-act`                                                                                          |
| `.widgets-settings-fab`     | 1    | `--v4-sand-act-text`                                                                                     |
| `.widget-weight`            | 1    | `--v4-sand-ok-text`                                                                                      |
| `.widget-v4-val`            | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-hero-num`       | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-stack`          | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-wave`           | 1    | `--v4-sand-wave-fill`                                                                                    |
| `.widget-v4-mini`           | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-hold-hint`      | 1    | `--v4-sand-ok-text`                                                                                      |
| `.widget-v4-weekbars`       | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-rhythm`         | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-wd`                | 1    | `--v4-sand-ok-fill`                                                                                      |
| `.widget-v4-tile`           | 1    | `--v4-sand-surface`                                                                                      |
| `.widget-v4-water-hour`     | 1    | `--v4-sand-ink`                                                                                          |
| `.widget-risk-main`         | 1    | `--v4-sand-act-text`                                                                                     |
| `.widget-relapse-risk`      | 1    | `--v4-sand-ok-text`                                                                                      |
| `.widget-v4-macro-bar-row`  | 1    | `--v4-sand-ink`                                                                                          |
| `.widget-v4-sleep-window`   | 1    | `--v4-sand-water`                                                                                        |

## `600-steps-and-aps.css` — 49

| семейство                | мест | роли                                                                                                                                                                 |
| ------------------------ | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.aps-v4-flow`           | 14   | `--v4-sand-ink`, `--v4-sand-surface-soft`, `--v4-sand-act`, `--v4-sand-tint`, `--v4-sand-act-deep`, `--v4-sand-act-soft`, `--v4-sand-hero-dark`, `--v4-sand-surface` |
| `.mc-modal`              | 6    | `--v4-sand-surface-soft`, `--v4-sand-ink`, `--v4-sand-act-deep`                                                                                                      |
| `.aps-v4-exit-dialog`    | 4    | `--v4-sand-surface-soft`, `--v4-sand-act-deep`, `--v4-sand-ink`                                                                                                      |
| `.aps-v4-notsent-chip`   | 3    | `--v4-sand-accent-bg`, `--v4-sand-act-deep`                                                                                                                          |
| `.aps-v4-product-row`    | 3    | `--v4-sand-ink`, `--v4-sand-act-deep`                                                                                                                                |
| `.aps-fav-btn`           | 2    | `--v4-sand-ink`, `--v4-sand-act`                                                                                                                                     |
| `.aps-v4-card`           | 2    | `--v4-sand-surface-soft`, `--v4-sand-ok-text`                                                                                                                        |
| `.aps-v4-error-hero`     | 2    | `--v4-sand-accent-bg`, `--v4-sand-ink`                                                                                                                               |
| `.aps-v4-footer`         | 2    | `--v4-sand-surface-soft`                                                                                                                                             |
| `.aps-v4-btn-paper`      | 2    | `--v4-sand-surface-soft`, `--v4-sand-ink`                                                                                                                            |
| `.aps-v4-btn-attention`  | 2    | `--v4-sand-ink`, `--v4-sand-accent-bg`                                                                                                                               |
| `.aps-v4-step`           | 1    | `--v4-sand-ink`                                                                                                                                                      |
| `.aps-v4-btn-primary`    | 1    | `--v4-sand-act`                                                                                                                                                      |
| `.aps-v4-btn-ghost`      | 1    | `--v4-sand-act-deep`                                                                                                                                                 |
| `.aps-v4-btn-pin`        | 1    | `--v4-sand-act`                                                                                                                                                      |
| `.aps-v4-exit-backdrop`  | 1    | `--v4-sand-ink`                                                                                                                                                      |
| `.aps-v4-browse-list`    | 1    | `--v4-sand-surface`                                                                                                                                                  |
| `.aps-v4-preset-confirm` | 1    | `--v4-sand-surface-soft`                                                                                                                                             |

## `611-aps-product-card.css` — 38

| семейство                        | мест | роли                                                            |
| -------------------------------- | ---- | --------------------------------------------------------------- |
| `.aps-v4-create-field`           | 4    | `--v4-sand-ink`, `--v4-sand-surface-soft`, `--v4-sand-act`      |
| `.aps-v4-portions-row`           | 4    | `--v4-sand-ink`, `--v4-sand-act-deep`                           |
| `.aps-v4-harm-calc-card`         | 3    | `--v4-sand-ok-bg`, `--v4-sand-ok-text`                          |
| `.aps-v4-harm-radio`             | 3    | `--v4-sand-surface-soft`, `--v4-sand-ink`, `--v4-sand-act`      |
| `.aps-v4-create-auto-field`      | 3    | `--v4-sand-surface-soft`, `--v4-sand-ink`, `--v4-sand-act-deep` |
| `.aps-v4-outcome`                | 3    | `--v4-sand-ok-text`, `--v4-sand-hero`, `--v4-sand-act-deep`     |
| `.aps-barcode-close`             | 2    | `--v4-sand-ink`                                                 |
| `.aps-barcode-start`             | 2    | `--v4-sand-surface-soft`, `--v4-sand-ink`                       |
| `.aps-barcode-input`             | 2    | `--v4-sand-surface`, `--v4-sand-ink`                            |
| `.aps-v4-create-dot`             | 2    | `--v4-sand-ink`, `--v4-sand-act`                                |
| `.aps-barcode-modal`             | 1    | `--v4-sand-ink`                                                 |
| `.aps-barcode-title`             | 1    | `--v4-sand-ink`                                                 |
| `.aps-barcode-subtitle`          | 1    | `--v4-sand-ink`                                                 |
| `.aps-v4-create-shell`           | 1    | `--v4-sand-ink`                                                 |
| `.aps-v4-harm-product`           | 1    | `--v4-sand-ink`                                                 |
| `.aps-v4-harm-breakdown-toggle`  | 1    | `--v4-sand-act-deep`                                            |
| `.aps-v4-harm-breakdown`         | 1    | `--v4-sand-surface-soft`                                        |
| `.aps-v4-create-advanced-toggle` | 1    | `--v4-sand-act-deep`                                            |
| `.aps-v4-portions-product`       | 1    | `--v4-sand-ink`                                                 |
| `.aps-v4-portions-list`          | 1    | `--v4-sand-surface-soft`                                        |

## `733-ui-v4-login-theme.css` — 24

| семейство                   | мест | роли                                                                                                                                          |
| --------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `.consent-fulltext`         | 13   | `--v4-sand-surface-soft`, `--v4-sand-ink`, `--v4-sand-surface`, `--v4-sand-act-text`, `--v4-sand-act`, `--v4-sand-hero`, `--v4-sand-ink-deep` |
| `.heys-consent-sign-sheet`  | 2    | `--v4-sand-surface-soft`                                                                                                                      |
| `.consent-doc-li`           | 2    | `--v4-sand-act`, `--v4-sand-ink`                                                                                                              |
| `.heys-auth-btn`            | 1    | `--v4-sand-ink-deep`                                                                                                                          |
| `.heys-auth-support-action` | 1    | `--v4-sand-ink-deep`                                                                                                                          |
| `.heys-login-theme`         | 1    | `--v4-sand-ink-deep`                                                                                                                          |
| `.consent-doc-h2`           | 1    | `--v4-sand-ink`                                                                                                                               |
| `.consent-doc-h4`           | 1    | `--v4-sand-ink`                                                                                                                               |
| `.consent-doc-bq`           | 1    | `--v4-sand-surface`                                                                                                                           |
| `.consent-doc-contact-card` | 1    | `--v4-sand-surface`                                                                                                                           |

## `733-ui-v4-reports.css` — 15

**Замерено 31 августа, самое видное место файла.** `.reports-v4-hero__value` и
`__phrase` — главное число вкладки «Отчёты» («+1 435 ккал») и фраза под ним —
стоят на `--v4-sand-act-deep`. Роль держит `#8a4a20` во всех наборах, поэтому в
**синей палитре число коричневое на синей карточке**; честная `--v4-act-text`
даёт там `#1d5e96`. Прочитано `getComputedStyle` на четырёх наборах, не по коду.

Читаемость не страдает (тёмное на светлом), поэтому это не дефект доступности, а
потеря набора: самый крупный элемент вкладки не переключается вместе с палитрой.
Если разметка будет по приоритету, эти два места стоит взять первыми в файле.

Фон самого героя (`--v4-sand-hero`) из описи убран — переведён на `--v4-hero`
тем же днём: палитровое правило перебивало его на первую поверхность, и, сняв
перебивку, я обнажил бы песочную карточку на синей вкладке.

| семейство                   | мест | роли                                      |
| --------------------------- | ---- | ----------------------------------------- |
| `.reports-v4-hero`          | 2    | `--v4-sand-act-deep`                      |
| `.reports-v4-summary-card`  | 2    | `--v4-sand-ink`, `--v4-sand-act-deep`     |
| `.reports-v4-dynamics-card` | 2    | `--v4-sand-surface`, `--v4-sand-act-deep` |
| `.reports-v4-wellbeing`     | 2    | `--v4-sand-surface`, `--v4-sand-act-deep` |
| `.reports-v4-days`          | 2    | `--v4-sand-surface`, `--v4-sand-ink`      |
| `.reports-v4-period-pill`   | 1    | `--v4-sand-act-deep`                      |
| `.reports-v4-score-slot`    | 1    | `--v4-sand-hero`                          |
| `.reports-v4-zero-actions`  | 1    | `--v4-sand-act-deep`                      |
| `.reports-v4-stub`          | 1    | `--v4-sand-act-deep`                      |
| `.heys-score-screen`        | 1    | `--v4-sand-act-mid`                       |

## `734-ui-v4-insights.css` — 14

| семейство                  | мест | роли                                           |
| -------------------------- | ---- | ---------------------------------------------- |
| `.insights-v4-attention`   | 3    | `--v4-sand-surface-soft`, `--v4-sand-act-deep` |
| `.insights-v4-stub`        | 2    | `--v4-sand-act-deep`                           |
| `.insights-v4-thresh`      | 2    | `--v4-sand-act-deep`                           |
| `.insights-v4-period-pill` | 1    | `--v4-sand-act-deep`                           |
| `.insights-v4-tier`        | 1    | `--v4-sand-act-mid`                            |
| `.insights-v4-hero`        | 1    | `--v4-sand-act-deep`                           |
| `.insights-v4-patterns`    | 1    | `--v4-sand-surface-soft`                       |
| `.insights-v4-detail`      | 1    | `--v4-sand-act-deep`                           |
| `.insights-v4-maturity`    | 1    | `--v4-sand-act-deep`                           |
| `.insights-v4-window`      | 1    | `--v4-sand-act-deep`                           |

## `715-yesterday-verify.css` — 10

| семейство                   | мест | роли                                        |
| --------------------------- | ---- | ------------------------------------------- |
| `.yv-force`                 | 2    | `--v4-sand-act`, `--v4-sand-act-text`       |
| `.yv-slider-value`          | 2    | `--v4-sand-green-ink`, `--v4-sand-act-text` |
| `.yv-hero-title`            | 1    | `--v4-sand-ink`                             |
| `.yv-pack-primary`          | 1    | `--v4-sand-act`                             |
| `.yv-slider-tick`           | 1    | `--v4-sand-green-ink`                       |
| `.yv-v4-slider-norm-zone`   | 1    | `--v4-sand-tint-green`                      |
| `.yv-v4-slider-center-mark` | 1    | `--v4-sand-green-ink`                       |
| `.yv-v4-slider-fill`        | 1    | `--v4-sand-act`                             |

## `732-ui-v4-nutrition.css` — 6

| семейство                | мест | роли                                                    |
| ------------------------ | ---- | ------------------------------------------------------- |
| `.nutrition-v4-meal-row` | 5    | `--v4-sand-hero`, `--v4-sand-act-deep`, `--v4-sand-ink` |
| `.nutrition-v4-sheet`    | 1    | `--v4-sand-surface-soft`                                |

## `740-cascade-card.css` — 6

| семейство             | мест | роли                 |
| --------------------- | ---- | -------------------- |
| `.heys-score-zonebar` | 6    | `--v4-sand-act-deep` |

## `400-water-and-hydration.css` — 4

| семейство                | мест | роли                                 |
| ------------------------ | ---- | ------------------------------------ |
| `.advice-v4-toast-card`  | 2    | `--v4-sand-act`, `--v4-sand-ok-fill` |
| `.advice-list-container` | 1    | `--v4-sand-ok-fill`                  |
| `.water-column`          | 1    | `--v4-sand-ink`                      |
