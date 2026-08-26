# Handoff: довести UI v4 до контракта канваса (cloud agents)

Канонический документ для облачных агентов, закрывающих сведение продукта с
семнадцатой сборкой пакета дизайна. Состояние снимка — **26 августа 2026**.

Пакет: **17 зон**, **1487 строк** контракта с вердиктами (1488 в канвасе; одна
строка без вердикта — см. гигиену ниже).

**Перед cloud wave на устройстве:** `git status --short --branch` — все session
commits должны быть на `origin/main` до старта волны (число ahead не
хардкодить).

---

## Облачные сессии vs устройство (обязательно прочитать)

Правила из `CLAUDE.md` § Cowork / облачные сессии — для **всех** cloud agents и
для человека на устройстве.

| Правило                                          | Следствие                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cloud FS ≠ device FS**                         | `git status`, `git log`, содержимое файлов и результаты проверок — только из дерева **на устройстве**. Путь из облачной ФС не подставлять в команды на устройстве.                                                                                            |
| **Правки в облаке ≠ правки в репо**              | Изменение в облачной сессии для репозитория не существует, пока не перенесено на устройство (merge, patch, PR, явный file output).                                                                                                                            |
| **Commit / hooks / push — только на устройстве** | Cloud agent **не** пушит и **не** обходит hooks. Выход: patch, PR или явный список файлов для merge человеком/агентом на устройстве.                                                                                                                          |
| **Рекомендуемый поток**                          | Cloud agents работают в **Cursor cloud branch / worktree**; после merge на устройстве — `pnpm ship "…" --no-push` (или `HEYS_COMMIT_SOURCE_ONLY=1 git commit`) и интеграционные гейты **на устройстве**. Push/deploy — только по прямой команде пользователя. |

Облачный агент, который «закоммитил» у себя, **не** считается shipped. Факт
проверяй на устройстве: `git log -1 --oneline`, `git status --short --branch`.

---

## Status snapshot (date 2026-08-26)

### Гейт `pnpm ui:v4:check`

| Подгейт                           | Состояние   | Примечание                                                                       |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| `ui-v4-check-undefined-roles.mjs` | **зелёный** | 25 известных ролей; голых `var(--v4-*)` без маркера нет (проверено 26.08 ~03:38) |
| `ui-v4-check-contract-drift.mjs`  | **зелёный** | «Контракты не двигались: 17 зоны, 1487 строк» (проверено 26.08 ~03:38)           |

Перед push оба подгейта обязаны быть зелёными на **чистом дереве** после merge
всех локальных batch. Cloud agent **перед wave** перепроверяет на устройстве —
см. **Pre-push blockers**.

### Вердикты — итого и по зонам

**Итого:** `=` 1185 · `≠` 193 · `?` 6 · `—` 103

| Зона            | Строк | =   | ≠   | ?   | —   | Снято      |
| --------------- | ----- | --- | --- | --- | --- | ---------- |
| home-widgets    | 286   | 243 | 34  | 1   | 8   | 2026-08-24 |
| water-add       | 96    | 70  | 15  | 0   | 11  | 2026-08-24 |
| checkin-morning | 82    | 67  | 8   | 3   | 4   | 2026-08-24 |
| nutrition-tab   | 220   | 197 | 9   | 0   | 14  | 2026-08-24 |
| date-remainders | 64    | 46  | 10  | 0   | 8   | 2026-08-24 |
| undo-bar        | 48    | 41  | 3   | 1   | 3   | 2026-08-24 |
| app-splash      | 38    | 33  | 1   | 0   | 4   | 2026-08-24 |
| curator-edits   | 54    | 44  | 6   | 0   | 4   | 2026-08-24 |
| gamification    | 77    | 63  | 9   | 0   | 5   | 2026-08-24 |
| login           | 71    | 58  | 8   | 0   | 5   | 2026-08-24 |
| pwa-update      | 55    | 42  | 9   | 0   | 4   | 2026-08-24 |
| questionnaire   | 57    | 45  | 7   | 0   | 5   | 2026-08-24 |
| registration    | 63    | 44  | 15  | 0   | 4   | 2026-08-24 |
| settings-system | 71    | 54  | 10  | 0   | 7   | 2026-08-24 |
| spinners        | 58    | 51  | 3   | 0   | 4   | 2026-08-24 |
| tips            | 69    | 49  | 13  | 0   | 7   | 2026-08-24 |
| cycle           | 78    | 38  | 33  | 1   | 6   | 2026-08-26 |

Сводка: `node scripts/ui-v4-check-contract-drift.mjs --list`

**Гигиена канваса (не блокирует drift сейчас, но чинить до rehash):** в
`checkin-morning.v4.dc.html` ключ «замеры на неделе периода» продублирован в
`ACCEPTANCE-checkin-morning.md` — при `--rehash checkin-morning` убедиться, что
вердикт адресует живую строку из `.dc.html`.

### Что DONE (коммиты на main; sync с origin — сверить на устройстве)

| Область                         | SHA                     | Что                                                                                                                  |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Пакет дизайна 17                | `9ec6daad`              | handoff v4 package 17 — full canvas sync                                                                             |
| Снимок cycle                    | `75c766bc`              | cycle zone verdicts snapshot                                                                                         |
| Widget breakdown batch 1        | `67388fd8`              | 12 листов разбора плитки                                                                                             |
| Check-in a11y                   | `cc70d34e`              | progressbar, aria по контракту                                                                                       |
| Системный шрифт / zoom          | `b98f93a2`              | allow system font scale and pinch zoom                                                                               |
| Profile groups                  | `20581852`              | три группы профиля по контракту                                                                                      |
| Nutrition chips a11y            | `d5246425`              | nutrition tab v4 chips a11y + tests                                                                                  |
| Long-press + layer ladder       | `85cc5bc3`              | unified long-press 350 ms, v4 layers                                                                                 |
| Line roles (3)                  | `8308d1d8`              | три роли линии вместо процентов                                                                                      |
| Drift pass 6 zones              | `e208d36d`              | verdict pass для шести зон                                                                                           |
| Subscription / nutrition guards | `ac2b00cd`              | paywall paths + nutrition-v4-structure                                                                               |
| **5 regression fixes**          | `ffe24fe2`…`79c7bcb0`   | FAB water cross-day · confetti flags · stepsGoal aria · view-change sheet bg · breakdown harness                     |
| Handoff cloud-agent             | `60cb9cbe`              | канонический `UI_V4_COMPLETION_PROMPT.md`                                                                            |
| **Cycle engine**                | `37ec9d26` (`f0cfa1fc`) | kcal/water/insulin multipliers, 28-day count, norm wiring — **старые engine-blockers в отчёте cycle UI сняты**       |
| **Cycle UI**                    | `a58bfe19` (`c7511dca`) | check-in step 5, ribbon/forecast, profile toggle, 5s undo, sparkline labels; shared files с nutrition/checkin        |
| **Home widgets**                | `ba60afbb` (`687f795a`) | rem tiles, breakdown data bindings; **2 строки `≠`→`=`** + rehash home-widgets                                       |
| **Nutrition / checkin**         | `af6a60df` (`5f9e5811`) | «Особый период» на nutrition-tab; **7 строк контракта** (nutrition + checkin smoke/structure); часть UI в `a58bfe19` |

### Completed local session 2026-08-26

Три параллельных воркера **закрыты и закоммичены** (source-only, без push).
Перед стартом cloud agent перечитай `git status apps/web` — только новый dirty
scope, не этот batch.

| Воркер                  | SHA        | Зона                           | Статус |
| ----------------------- | ---------- | ------------------------------ | ------ |
| **cycle UI**            | `a58bfe19` | cycle (+ shared nutrition)     | DONE   |
| **home-widgets**        | `ba60afbb` | home-widgets                   | DONE   |
| **nutrition / checkin** | `af6a60df` | nutrition-tab, checkin-morning | DONE   |

Verdict snapshot после batch: drift-гейт зелёный; итоговые счётчики — таблица
выше (cycle: код в `a58bfe19`/`37ec9d26`, **33 `≠` остаются** — rehash cycle
отдельно).

**Пять зон «МАКЕТ НЕ СОГЛАСОВАН»** — контракта нет, не реализовывать:
`tab-insights`, `tab-activity`, `tab-reports`, `food-add`, `food-add-short`.

---

## Источник правды

**Строки контракта, и только они.** Каталог канвасов:

```
docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/
```

Строка: `<div class="spec"><b>ИМЯ</b><span data-v="ЗНАЧЕНИЕ">`.

Не сверяйся по `README.md`, `INDEX.md`, приёмочным листам, `UI_V4_FINDINGS.md` —
они отстают. Проза «Решений» — пересказ; при расхождении верен `data-v`.

Начинай с `node scripts/ui-v4-check-contract-drift.mjs --list`. Перечитывай
канвас с диска перед каждым крупным блоком.

---

## Remaining work — prioritized queue

Очерёдность: **cycle** (новая зона, 33 `≠`) → **home-widgets** (34 `≠`) →
**registration** (15) → **water-add** (15) → **tips** (13) → остальные по
убыванию `≠`. Строки с `?` — не закрывать в `=` без решения владельца/дизайна.

Для каждой зоны ниже: канвас, продуктовые файлы, тесты, процедура вердикта.

### cycle — 33 `≠`, 1 `?` (код частично в `37ec9d26` + `a58bfe19`)

|                        |                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**             | `cycle.v4.dc.html`                                                                                                                                                                                                                                                     |
| **Продукт**            | `heys_cycle_ui_v1.js`, `heys_day_cycle_card_v1.js`, `heys_day_cycle_state.js`, `heys_cycle_v1.js`, `heys_user_tab_impl_v1.js` (toggle), `heys_day_pickers.js` (календарь 28 дней), `heys_day_weight_trends_v1.js`, `styles/modules/730-widgets-dashboard.css` (ribbon) |
| **Тесты**              | `npx vitest run __tests__/cycle-v4-contract.test.js __tests__/cycle-engine-v4.test.js`                                                                                                                                                                                 |
| **Уже в коде**         | engine multipliers + 28-day count (`37ec9d26`); check-in step 5, ribbon/forecast, profile toggle, 5s undo (`a58bfe19`). **Engine-blockers из старого cycle UI отчёта сняты** — не блокируют lane                                                                       |
| **Темы `≠` (остаток)** | отметка **задним числом**; **день 29** / граница цикла; **release gate** `CYCLE_TRACKING_IN_RELEASE`; **геометрия графика** (weight trends); двухшаговая дата «1–7» + «Это было сегодня» / «Другой день» (частично); a11y выбора даты                                  |
| **`?` blocker**        | «выключение не переписывает прошлое» — продуктовое решение до `=`                                                                                                                                                                                                      |
| **rehash**             | После закрытия batch: `node scripts/ui-v4-check-contract-drift.mjs --rehash cycle`                                                                                                                                                                                     |

### home-widgets — 34 `≠`, 1 `?`

|                 |                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**      | `home-widgets.v4.dc.html`                                                                                                                                                                                                             |
| **Продукт**     | `heys_widgets_variants_v4.js`, `heys_widgets_ui_v1.js`, `heys_widgets_core_v1.js`, `heys_day_page_shell.js` (QuickActionsFab), `styles/modules/730-widgets-dashboard.css`, `styles/modules/002-ui-v4-palette-roles.css` (роли плиток) |
| **Тесты**       | `widgets-v4-canvas-geometry.test.js`, `home-widgets-breakdown-v4.test.js`, `widgets-v4-bottom-corner-layout.test.js`, `line-roles-v4.test.js`, `widgets-quick-actions-v4.test.js`                                                     |
| **Темы `≠`**    | роли плитки (песочные vs контрактные); FAB/QuickActions дубль; слова на экране (ккал, эмодзи); режим куратора; hardware back; breakdown batch 2 — **rem tiles + bindings в `ba60afbb` (2 `≠`→`=` + rehash)**                          |
| **`?` blocker** | «роли линий · правило продукта» — 9 % вне трёх ролей; см. `UI_V4_FINDINGS.md` и `line-roles-v4.test.js`. **Не `--rehash`** пока дизайн не назовет роли для 6/7/9/10/14/22/45 %                                                        |
| **rehash**      | Только для строк, где вердикт `=`/`≠` финален и дизайн не спорит                                                                                                                                                                      |

### registration — 15 `≠`

|              |                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `registration.v4.dc.html`                                                                                                          |
| **Продукт**  | `heys_profile_step_v1.js`, `heys_consents_v1.js`, `heys_step_modal_v1.js`, `heys_auth_v1.js`, `styles/modules/733-ui-v4-login.css` |
| **Тесты**    | `registration-v4-contract-sweep.test.js`, `consent-v4-accessibility-smoke.test.js`                                                 |
| **Темы `≠`** | профиль в настройках (8 групп vs 3); согласие на шаге 1; пределы вес/рост; вибрация; порядок слоёв consent                         |
| **rehash**   | `--rehash registration`                                                                                                            |

### water-add — 15 `≠`

|              |                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `water-add.v4.dc.html`                                                                                                 |
| **Продукт**  | `heys_day_water_v1.js`, `heys_day_water_card_v1.js`, `heys_day_handlers.js`, `styles/modules/400-water-and-advice.css` |
| **Тесты**    | `water-add-v4.test.js`, `water-custom-volume-v4.test.js`                                                               |
| **Темы `≠`** | reduced-motion на капле; держатель места; fixed px vs rem; слова «стакан»; порядок слоёв popover                       |
| **rehash**   | `--rehash water-add`                                                                                                   |

### tips — 13 `≠`

|              |                                                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `tips.v4.dc.html`                                                                                                                              |
| **Продукт**  | `day/_advice.js`, `advice/_core.js`, `heys_day_advice_integration_v1.js`, `heys_advice_rules_v1.js`, `styles/modules/400-water-and-advice.css` |
| **Тесты**    | `advice-v4-panels.test.js`, `advice-v4-tips-behaviour.test.js`                                                                                 |
| **Темы `≠`** | герой детали (#efe3cf vs контракт); merge по id между устройствами; вибрация 20 vs 10 ms; точка входа не на Главной                            |
| **rehash**   | `--rehash tips`                                                                                                                                |

### date-remainders — 10 `≠`

|              |                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `date-remainders.v4.dc.html`                                                                                                                      |
| **Продукт**  | `heys_day_pickers.js`, `styles/modules/000-base-and-gamification.css` (капсула, шторка, клетки)                                                   |
| **Тесты**    | `date-remainders-v4-smoke.test.js`, `date-remainders-v4-cell.test.js`, `date-picker-v4-capsule.test.js`, `date-picker-sheet-v4-structure.test.js` |
| **Темы `≠`** | полоса цикла 3 px; «ночь до 03:00» (кадра нет — долг дизайнера); переход суток; нажатие 70 %                                                      |
| **FINDINGS** | «ночь до 03:00» — ждёт кадр в `date-remainders.v4.dc.html`                                                                                        |
| **rehash**   | `--rehash date-remainders`                                                                                                                        |

### settings-system — 10 `≠`

|              |                                                                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| **Канвас**   | `settings-system.v4.dc.html`                                                                         |
| **Продукт**  | `heys_app_shell_v1.js`, `heys_user_tab_impl_v1.js`, `heys_theme_v1.js`, `heys_health_features_v1.js` |
| **Тесты**    | `settings-v4-notify-detail.test.js`, `profile-v4-groups.test.js`                                     |
| **Темы `≠`** | UI настройки цикла в профиле; звук воды; режим куратора; «Выйти» вне ярусов                          |
| **rehash**   | `--rehash settings-system`                                                                           |

### checkin-morning — 8 `≠`, 3 `?`

|              |                                                                                                                             |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `checkin-morning.v4.dc.html`                                                                                                |
| **Продукт**  | `heys_morning_checkin_v1.js`, `heys_steps_v1.js`, `heys_step_modal_v1.js`, `styles/modules/500-pwa-and-offline.css`         |
| **Тесты**    | `morning-checkin-v4-a11y-smoke.test.js`, `morning-checkin-v4-smoke.test.js`, `morning-checkin-v4-contract-geometry.test.js` |
| **Темы `≠`** | крестик < 44 px; утренний push; «Не сохранилось»; debounce 350 ms на «Дальше»; fixed px в капсуле                           |
| **`?`**      | выход/производительность; длинные названия; режим куратора                                                                  |
| **rehash**   | `--rehash checkin-morning` после fix дубля ключа                                                                            |

### nutrition-tab — 9 `≠`

|              |                                                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `nutrition-tab.v4.dc.html`                                                                                                 |
| **Продукт**  | `heys_day_nutrition_v1.js`, `styles/modules/732-ui-v4-nutrition.css`                                                       |
| **Тесты**    | `nutrition-v4-canvas-geometry.test.js`, `nutrition-tab-v4-contract-fixes.test.js`, `nutrition-tab-v4-states.test.js`       |
| **Темы `≠`** | min-height чипа 34 vs 30; merge добавок; держатель места — **«Особый период» / три чипа закрыты** (`af6a60df`, `a58bfe19`) |
| **FINDINGS** | три чипа ждут полей профиля — см. `UI_V4_FINDINGS.md`                                                                      |
| **rehash**   | `--rehash nutrition-tab`                                                                                                   |

### gamification — 9 `≠`

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Канвас**   | `gamification.v4.dc.html`                                                                                    |
| **Продукт**  | `heys_gamification_v1.js`, `heys_gamification_screens_v1.js`, `styles/modules/000-base-and-gamification.css` |
| **Тесты**    | `gamification-v4-achievement-row.test.js`, `gamification-v4-order.test.js`                                   |
| **Темы `≠`** | три границы суток → одна; держатель места; порядок достигнутых; карточка «Ближе всего»                       |
| **rehash**   | `--rehash gamification`                                                                                      |

### pwa-update — 9 `≠`

|              |                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Канвас**   | `pwa-update.v4.dc.html`                                                                   |
| **Продукт**  | `heys_platform_apis_v1.js`, `heys_pwa_module_v1.js`, `styles/modules/heys-components.css` |
| **Тесты**    | `pwa-install-banner-v4-structure.test.js`, `sync-pending-banner-v4.test.js`               |
| **Темы `≠`** | нажатие scale vs opacity 70 %; «Готово!» vs контракт; длинные версии; вибрация            |
| **rehash**   | `--rehash pwa-update`                                                                     |

### login — 8 `≠`

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| **Канвас**   | `login.v4.dc.html`                                                                             |
| **Продукт**  | `heys_login_screen_v1.js`, `styles/modules/733-ui-v4-login.css`                                |
| **Тесты**    | `login-v4-input-contract.test.js`, `login-v4-structure.test.js`                                |
| **Темы `≠`** | «Код от куратора» vs «Код доступа»; первое появление / приветствие; длинный текст ошибки 38 px |
| **rehash**   | `--rehash login`                                                                               |

### questionnaire — 7 `≠`

|              |                                                                                    |
| ------------ | ---------------------------------------------------------------------------------- |
| **Канвас**   | `questionnaire.v4.dc.html`                                                         |
| **Продукт**  | `heys_trial_intake_v1.js`                                                          |
| **Тесты**    | `intake-v4-blocked-action.test.js`, `pep-access-v4-structure.test.js`              |
| **Темы `≠`** | прокрутка при смене вкладки vs сохранение; нажатие кнопок; нижняя граница возраста |
| **rehash**   | `--rehash questionnaire`                                                           |

### curator-edits — 6 `≠`

|              |                                                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Канвас**   | `curator-edits.v4.dc.html`                                                                                             |
| **Продукт**  | `heys_curator_actions_banner_v1.js`, серверные RPC добавок                                                             |
| **Тесты**    | `curator-edits-v4-product-rules.test.js`                                                                               |
| **Темы `≠`** | **куратор правит добавки** — 4 действия журнала нет на клиенте и сервере; офлайн только live fetch; z-index над листом |
| **rehash**   | `--rehash curator-edits`                                                                                               |

### undo-bar — 3 `≠`, 1 `?`

|              |                                                                 |
| ------------ | --------------------------------------------------------------- |
| **Канвас**   | `undo-bar.v4.dc.html`                                           |
| **Продукт**  | `heys_app_ui_state_v1.js`, `day/_meals.js`, cycle undo handlers |
| **Тесты**    | `undo-bar-v4-contract.test.js`                                  |
| **Темы `≠`** | вибрация удаления; undo cycle «Особые дни»                      |
| **`?`**      | «слова на экране» — «Вернуть» vs «Отменить» (спор в пакете)     |
| **rehash**   | `--rehash undo-bar`                                             |

### spinners — 3 `≠`

|             |                                                                    |
| ----------- | ------------------------------------------------------------------ |
| **Канвас**  | `spinners.v4.dc.html` + `app-splash.v4.dc.html` (пересечение boot) |
| **Продукт** | `index.html`, `heys_loading_progress_v1.js`                        |
| **Тесты**   | `spinners-v4-offline-start.test.js`                                |
| **rehash**  | `--rehash spinners`                                                |

### app-splash — 1 `≠`

|             |                                        |
| ----------- | -------------------------------------- |
| **Канвас**  | `app-splash.v4.dc.html`                |
| **Продукт** | `heys_theme_v1.js` (миграция theme_v1) |
| **Тесты**   | `spinners-v4-offline-start.test.js`    |
| **rehash**  | `--rehash app-splash`                  |

### Процедура закрытия вердикта (все зоны)

1. Сверить строку в `.dc.html` на диске (`data-v`).
2. Править код → прогнать zone test cluster.
3. Записать вердикт:
   ```bash
   node scratchpad/verdicts/apply-verdict.mjs --zone <zone> --key "<имя строки>" --verdict = --fact "file:line"
   ```
   Batch: `--batch scratchpad/verdicts/<zone>-batch.json`
4. Когда batch зоны готов:
   `node scripts/ui-v4-check-contract-drift.mjs --rehash <zone>`
5. Спорное без решения — `?` + запись в `docs/ui/UI_V4_FINDINGS.md`; закрытое —
   в `UI_V4_FINDINGS_HISTORY.md`.

**Хеши руками не править** — только `apply-verdict.mjs` / `--rehash`.

---

## Parallelization plan for cloud agents

### Правила

- **Владение по файлам**, не по темам. Два агента в одном файле = блокировка.
- Коммиты **source-only**:
  ```bash
  HEYS_COMMIT_SOURCE_ONLY=1 git commit -F <msg> -- <явные пути>
  ```
- **NO push / deploy / PR** без прямой команды пользователя.
- **NO full vitest** при параллельной работе — только cluster своей зоны.
- Prettier на CSS **не запускать** (переформатирует чужие зоны).
- После правки legacy UI: `pnpm bundle:legacy:auto --files=<свои>` + reload
  `pnpm dev:local` (если сервер уже поднят).
- Финальная интеграция (один агент, чистое дерево): `pnpm ui:v4:check` +
  `npx vitest run --root .` из `apps/web`.

### Lanes (6–8 независимых)[^lanes-waves]

[^lanes-waves]:
    **14 lanes total** — запуск двумя волнами **8 + 6** (см.
    [Recommended waves](#recommended-waves)); не все 14 параллельно.

| Lane                               | Владение (edit)                                                                                                                                                                                                       | DO NOT edit                                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **cycle-ui-checkin**               | **Остаток cycle `≠`:** backdate, day-29, release gate, chart geometry, двухшаговая дата, a11y даты. **Не дублировать** уже в `a58bfe19`/`37ec9d26`: step 5 check-in, ribbon, profile toggle, undo, engine multipliers | `heys_day_pickers.js` (calendar lane), `730-widgets-dashboard.css` (typography lane), nutrition-only files |
| **cycle-ui-calendar-undo**         | `heys_day_pickers.js` (режим cycle 28d, backdate flow), undo cycle в `day/_meals.js`, `heys_app_ui_state_v1.js`                                                                                                       | `heys_cycle_ui_v1.js` (ядро UI — готово в `a58bfe19`), nutrition, widgets                                  |
| **home-widgets-typography**        | `styles/modules/730-widgets-dashboard.css`, `styles/modules/002-ui-v4-palette-roles.css` (роли плиток/линий)                                                                                                          | `heys_widgets_variants_v4.js` (breakdown), cycle, nutrition                                                |
| **home-widgets-breakdown-content** | `heys_widgets_variants_v4.js`, `heys_widgets_ui_v1.js`, `__tests__/home-widgets-breakdown-v4.test.js`                                                                                                                 | `730-widgets-dashboard.css` (геометрия сетки — lane typography), `heys_day_page_shell.js`                  |
| **nutrition-tab**                  | `heys_day_nutrition_v1.js`, `styles/modules/732-ui-v4-nutrition.css`, nutrition `__tests__/*`                                                                                                                         | `heys_morning_checkin_v1.js`, widgets                                                                      |
| **checkin-a11y**                   | `heys_morning_checkin_v1.js`, `heys_steps_v1.js`, `styles/modules/500-pwa-and-offline.css` (checkin scope), checkin `__tests__/*`                                                                                     | nutrition-tab, cycle UI                                                                                    |
| **profile-registration**           | `heys_profile_step_v1.js`, `heys_consents_v1.js`, `heys_user_tab_impl_v1.js` (profile groups only), registration tests                                                                                                | `heys_app_shell_v1.js` (settings), widgets                                                                 |
| **date-remainders**                | `heys_day_pickers.js` (date capsule/sheet, не cycle mode), `000-base-and-gamification.css` (date-picker block ~7900–8700)                                                                                             | cycle calendar lane, widgets                                                                               |
| **water-add**                      | `heys_day_water_v1.js`, `heys_day_water_card_v1.js`, `400-water-and-advice.css`, water tests                                                                                                                          | advice/tips                                                                                                |
| **tips-advice**                    | `day/_advice.js`, `advice/_core.js`, advice tests                                                                                                                                                                     | water-add, widgets                                                                                         |
| **login-registration-ui**          | `heys_login_screen_v1.js`, `733-ui-v4-login.css`, login tests                                                                                                                                                         | profile_step (other lane)                                                                                  |
| **settings-system**                | `heys_app_shell_v1.js` (settings tab), `heys_theme_v1.js`, settings tests                                                                                                                                             | user_tab profile groups                                                                                    |
| **curator-supplements**            | `heys_curator_actions_banner_v1.js`, API/RPC добавок (если в scope), curator tests                                                                                                                                    | widgets, day handlers                                                                                      |
| **platform-misc**                  | `heys_platform_apis_v1.js`, `heys_gamification_v1.js`, `index.html` (spinners), pwa/gamification tests                                                                                                                | product UI lanes above                                                                                     |

Lanes **cycle-ui-checkin** + **cycle-ui-calendar-undo** координируют через
`heys_day_pickers.js` — не работать одновременно; calendar lane стартует после
check-in ribbon или по разным веткам файла (cycle mode vs date sheet).

Lanes **home-widgets-typography** + **home-widgets-breakdown-content** — то же
для `730-widgets` vs `heys_widgets_variants_v4.js`.

---

## Раздача полос — анти-collision

**14 lanes** ниже — не темы, а **эксклюзивное владение файлами**. Одна полоса =
один агент на wave; список «DO NOT edit» обязателен.

### MERGE ORDER (когда один файл — две полосы)

| Ситуация                                                                  | Порядок merge на устройстве | Иначе                                                             |
| ------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------- |
| Один файл, engine + UI (напр. `heys_cycle_v1.js` + `heys_cycle_ui_v1.js`) | **engine → UI**             | Конфликт логики; UI lane не стартует, пока engine не в main/ветке |
| Разные файлы, lanes из таблицы                                            | Параллельно                 | —                                                                 |
| Два lane в одном файле без разведения по ветке                            | **Запрещено** в одной wave  | Развести по времени или по cloud branch                           |

### Запрещённые пересечения (forbidden overlap)

| Файл                        | Макс. агентов / wave | Lanes, которые его трогают                                                 |
| --------------------------- | -------------------- | -------------------------------------------------------------------------- |
| `heys_cycle_v1.js`          | **1**                | cycle engine (закрыт в `37ec9d26`); не открывать повторно без явного scope |
| `heys_cycle_ui_v1.js`       | **1**                | **cycle-ui-checkin**                                                       |
| `heys_day_nutrition_v1.js`  | **1**                | **nutrition-tab**; пересечение с cycle UI — только после merge `a58bfe19`  |
| `heys_widgets_ui_v1.js`     | **1**                | **home-widgets-breakdown-content**                                         |
| `heys_day_pickers.js`       | **1**                | **cycle-ui-calendar-undo** XOR **date-remainders** — не одновременно       |
| `730-widgets-dashboard.css` | **1**                | **home-widgets-typography** XOR breakdown — не одновременно                |

**Hot files:** `heys_cycle_v1.js`, `heys_cycle_ui_v1.js`,
`heys_day_nutrition_v1.js`, `heys_widgets_ui_v1.js` — **не более одного агента
на файл на wave**. Нарушение = остановка wave, ручной merge на устройстве.

Перед стартом lane: `git status apps/web/<file>` на **устройстве** — файл не
должен быть dirty у другого воркера.

---

## Cloud launch checklist

Чеклист **перед** запуском wave и **после** merge облачных веток на устройстве.

### На устройстве (до старта cloud wave)

- [ ] Сверить на устройстве: `git status --short --branch` — все session commits
      должны быть на `origin/main` перед cloud wave (fetch `origin/main`, не
      хардкодить ahead count)
- [ ] `pnpm ui:v4:check` — зелёный (см. **Pre-push blockers** ниже)
- [ ] `npx vitest run --root .` из `apps/web` — зелёный на **остановленных**
      workers (без параллельных lane в том же дереве)
- [ ] `git status apps/web docs/ui` — нет чужого dirty в hot files

### На каждый cloud agent (в prompt)

- [ ] Блок **lane** из таблицы lanes (владение + DO NOT edit)
- [ ] Ссылка: `docs/ui/UI_V4_COMPLETION_PROMPT.md` (этот файл)
- [ ] Путь канваса:
      `docs/ui/handoff-v4/canvas/…/design_handoff_heys_v4/<zone>.v4.dc.html`
- [ ] Напоминание: cloud FS ≠ device; commit/push только после merge на
      устройстве

### После cloud wave (на устройстве)

- [ ] Merge cloud branches / PR → одно дерево на устройстве
- [ ] Интеграция: `pnpm ui:v4:check` + полный vitest
- [ ] `--rehash <zone>` для каждой затронутой зоны
- [ ] **NO push / deploy** до прямой команды пользователя

---

## Recommended waves

Список полос для запуска cloud agents: одна волна = один checkout на устройстве
или отдельные cloud branches. Таблица [Lanes](#lanes-68-независимых) — владение
файлами; [Hot files](#раздача-полос--анти-collision) — лимиты на wave.

### Wave 1 (8 agents — без hot-file collision, старт сразу после push)

| #   | Lane                               | Scope (одна строка)                                                                            |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | **cycle-ui-checkin**               | Остаток cycle `≠`: backdate, day-29, release gate, chart geometry, двухшаговая дата, a11y даты |
| 2   | **home-widgets-breakdown-content** | Breakdown плитки: `heys_widgets_variants_v4.js`, bindings, batch 2 контент                     |
| 3   | **nutrition-tab**                  | Nutrition tab: чипы, merge добавок, min-height, «Особый период»                                |
| 4   | **checkin-a11y**                   | Утренний чек-ин: a11y, debounce, крестик 44 px, push, капсула                                  |
| 5   | **profile-registration**           | Профиль/регистрация: группы, consents, шаги, пределы вес/рост                                  |
| 6   | **water-add**                      | Вода: reduced-motion, popover, слова «стакан», rem vs px                                       |
| 7   | **tips-advice**                    | Советы: герой детали, merge id, вибрация, точка входа                                          |
| 8   | **login-registration-ui**          | Логин: «Код доступа», приветствие, ошибки 38 px                                                |

### Wave 2 (6 agents — после merge Wave 1 ИЛИ на отдельных cloud branches)

| #   | Lane                        | Scope (одна строка)                                                                 |
| --- | --------------------------- | ----------------------------------------------------------------------------------- |
| 1   | **cycle-ui-calendar-undo**  | Календарь cycle 28d, backdate flow, undo cycle — **не параллельно date-remainders** |
| 2   | **home-widgets-typography** | CSS плиток/линий, роли палитры — **не параллельно breakdown в той же wave**         |
| 3   | **date-remainders**         | Капсула даты, шторка, полоса цикла 3 px, переход суток                              |
| 4   | **settings-system**         | Настройки: цикл в профиле, звук воды, режим куратора, «Выйти»                       |
| 5   | **curator-supplements**     | Кураторские добавки: 4 действия журнала, RPC, офлайн                                |
| 6   | **platform-misc**           | PWA, gamification, spinners, app-splash — platform/gamification зоны                |

### Rules

- **Max 8** в Wave 1, **max 6** в Wave 2 — **не** запускать все 14 сразу.
- **Один агент = одна lane** = вставить prompt ниже для этой lane.
- Если один checkout на устройстве — **дождаться merge Wave 1** перед Wave 2.
- Таблица **Hot files** и **DO NOT edit** из lanes — по-прежнему обязательны.

---

### Wave 1 — copy-paste prompts

#### cycle-ui-checkin

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: cycle (lane: cycle-ui-checkin).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — секции cycle, lanes, hot files.

Задача: закрыть остаток cycle «≠» (backdate, day-29, release gate CYCLE_TRACKING_IN_RELEASE, геометрия weight trends, двухшаговая дата «1–7» + «Это было сегодня»/«Другой день», a11y выбора даты). Не дублировать уже в a58bfe19/37ec9d26: step 5 check-in, ribbon, profile toggle, undo, engine multipliers.
Источник чисел: data-v в cycle.v4.dc.html на диске.
DO NOT EDIT: heys_day_pickers.js (calendar lane), styles/modules/730-widgets-dashboard.css, heys_day_nutrition_v1.js и прочие nutrition-only.

Файлы lane: heys_cycle_ui_v1.js, heys_day_cycle_card_v1.js, heys_day_cycle_state.js, heys_user_tab_impl_v1.js (toggle), heys_day_weight_trends_v1.js.
Тесты: npx vitest run --root . __tests__/cycle-v4-contract.test.js __tests__/cycle-engine-v4.test.js
Вердикты: scratchpad/verdicts/apply-verdict.mjs; rehash: --rehash cycle

Коммит: HEYS_COMMIT_SOURCE_ONLY=1, явные пути. Push/deploy — запрещены.
Prettier CSS — не запускать.
После legacy-правок: pnpm bundle:legacy:auto --files=heys_cycle_ui_v1.js,heys_day_cycle_card_v1.js,heys_day_cycle_state.js,heys_user_tab_impl_v1.js,heys_day_weight_trends_v1.js

Критерий готово: zone test cluster зелёный; «?» «выключение не переписывает прошлое» — только ? + FINDINGS; pnpm ui:v4:check если менял роли.
```

#### home-widgets-breakdown-content

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: home-widgets (lane: home-widgets-breakdown-content).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — home-widgets, lanes.

Задача: закрыть «≠» breakdown/content плитки (bindings, rem tiles batch 2, слова на экране, FAB/QuickActions где в scope variants). Строку «роли линий · правило продукта» (? ) — не в = без дизайна.
Источник чисел: data-v в home-widgets.v4.dc.html.
DO NOT EDIT: styles/modules/730-widgets-dashboard.css, heys_day_page_shell.js.

Файлы lane: heys_widgets_variants_v4.js, heys_widgets_ui_v1.js, heys_widgets_core_v1.js, __tests__/home-widgets-breakdown-v4.test.js.
Тесты: npx vitest run --root . __tests__/home-widgets-breakdown-v4.test.js __tests__/widgets-v4-canvas-geometry.test.js __tests__/widgets-v4-bottom-corner-layout.test.js __tests__/widgets-quick-actions-v4.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash home-widgets (только финальные =/≠)

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены. Prettier CSS — не запускать.
После правок: pnpm bundle:legacy:auto --files=heys_widgets_variants_v4.js,heys_widgets_ui_v1.js,heys_widgets_core_v1.js

Критерий готово: breakdown test cluster зелёный.
```

#### nutrition-tab

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: nutrition-tab (lane: nutrition-tab).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — nutrition-tab, lanes.

Задача: закрыть «≠» nutrition-tab (min-height чипа, merge добавок, держатель места; «Особый период» уже частично в af6a60df).
Источник чисел: data-v в nutrition-tab.v4.dc.html.
DO NOT EDIT: heys_morning_checkin_v1.js, heys_widgets_*, cycle UI.

Файлы lane: heys_day_nutrition_v1.js, styles/modules/732-ui-v4-nutrition.css, nutrition __tests__/*.
Тесты: npx vitest run --root . __tests__/nutrition-v4-canvas-geometry.test.js __tests__/nutrition-tab-v4-contract-fixes.test.js __tests__/nutrition-tab-v4-states.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash nutrition-tab

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены. Prettier CSS — не запускать.
После правок: pnpm bundle:legacy:auto --files=heys_day_nutrition_v1.js

Критерий готово: nutrition test cluster зелёный; три чипа с ? — FINDINGS если нет полей профиля.
```

#### checkin-a11y

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: checkin-morning (lane: checkin-a11y).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — checkin-morning, lanes.

Задача: закрыть «≠» утреннего чек-ина (крестик ≥44 px, утренний push, «Не сохранилось», debounce 350 ms «Дальше», fixed px в капсуле). «?» — только с FINDINGS.
Источник чисел: data-v в checkin-morning.v4.dc.html.
DO NOT EDIT: heys_day_nutrition_v1.js, heys_cycle_ui_v1.js, widgets.

Файлы lane: heys_morning_checkin_v1.js, heys_steps_v1.js, styles/modules/500-pwa-and-offline.css (checkin scope), checkin __tests__/*.
Тесты: npx vitest run --root . __tests__/morning-checkin-v4-a11y-smoke.test.js __tests__/morning-checkin-v4-smoke.test.js __tests__/morning-checkin-v4-contract-geometry.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash checkin-morning (после fix дубля ключа «замеры на неделе»)

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_morning_checkin_v1.js,heys_steps_v1.js

Критерий готово: checkin test cluster зелёный.
```

#### profile-registration

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: registration (lane: profile-registration).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — registration, lanes.

Задача: закрыть «≠» регистрации/профиля (группы профиля, согласие шаг 1, пределы вес/рост, вибрация, порядок слоёв consent).
Источник чисел: data-v в registration.v4.dc.html.
DO NOT EDIT: heys_app_shell_v1.js (settings lane), heys_widgets_*.

Файлы lane: heys_profile_step_v1.js, heys_consents_v1.js, heys_step_modal_v1.js, heys_auth_v1.js, heys_user_tab_impl_v1.js (profile groups only), styles/modules/733-ui-v4-login.css (registration scope).
Тесты: npx vitest run --root . __tests__/registration-v4-contract-sweep.test.js __tests__/consent-v4-accessibility-smoke.test.js __tests__/profile-v4-groups.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash registration

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_profile_step_v1.js,heys_consents_v1.js,heys_user_tab_impl_v1.js

Критерий готово: registration test cluster зелёный.
```

#### water-add

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: water-add (lane: water-add).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — water-add, lanes.

Задача: закрыть «≠» water-add (reduced-motion на капле, держатель места, rem vs fixed px, слова «стакан», порядок слоёв popover).
Источник чисел: data-v в water-add.v4.dc.html.
DO NOT EDIT: day/_advice.js, advice/_core.js, widgets.

Файлы lane: heys_day_water_v1.js, heys_day_water_card_v1.js, heys_day_handlers.js (water scope), styles/modules/400-water-and-advice.css (water scope).
Тесты: npx vitest run --root . __tests__/water-add-v4.test.js __tests__/water-custom-volume-v4.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash water-add

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_day_water_v1.js,heys_day_water_card_v1.js,heys_day_handlers.js

Критерий готово: water test cluster зелёный.
```

#### tips-advice

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: tips (lane: tips-advice).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — tips, lanes.

Задача: закрыть «≠» tips (герой детали, merge по id между устройствами, вибрация 20 vs 10 ms, точка входа не на Главной).
Источник чисел: data-v в tips.v4.dc.html.
DO NOT EDIT: heys_day_water_v1.js, heys_widgets_*.

Файлы lane: day/_advice.js, advice/_core.js, heys_day_advice_integration_v1.js, heys_advice_rules_v1.js, styles/modules/400-water-and-advice.css (advice scope).
Тесты: npx vitest run --root . __tests__/advice-v4-panels.test.js __tests__/advice-v4-tips-behaviour.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash tips

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=day/_advice.js,advice/_core.js,heys_day_advice_integration_v1.js

Критерий готово: advice test cluster зелёный.
```

#### login-registration-ui

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: login (lane: login-registration-ui).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — login, lanes.

Задача: закрыть «≠» login («Код от куратора» vs «Код доступа», первое появление/приветствие, длинный текст ошибки 38 px).
Источник чисел: data-v в login.v4.dc.html.
DO NOT EDIT: heys_profile_step_v1.js, heys_consents_v1.js (profile-registration lane).

Файлы lane: heys_login_screen_v1.js, styles/modules/733-ui-v4-login.css (login scope).
Тесты: npx vitest run --root . __tests__/login-v4-input-contract.test.js __tests__/login-v4-structure.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash login

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_login_screen_v1.js

Критерий готово: login test cluster зелёный.
```

---

### Wave 2 — copy-paste prompts

#### cycle-ui-calendar-undo

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: cycle + undo-bar (lane: cycle-ui-calendar-undo).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — cycle, undo-bar, lanes, merge order.

Задача: календарь cycle 28d и backdate flow в heys_day_pickers.js; undo cycle «Особые дни» в day/_meals.js, heys_app_ui_state_v1.js. Старт только после merge cycle-ui-checkin ИЛИ отдельная cloud branch.
Источник чисел: cycle.v4.dc.html, undo-bar.v4.dc.html.
DO NOT EDIT: heys_cycle_ui_v1.js (ядро UI — cycle-ui-checkin), nutrition, widgets.

Файлы lane: heys_day_pickers.js (cycle mode), day/_meals.js, heys_app_ui_state_v1.js.
Тесты: npx vitest run --root . __tests__/undo-bar-v4-contract.test.js __tests__/cycle-v4-contract.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash cycle --rehash undo-bar

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_day_pickers.js

Критерий готово: undo + cycle picker tests зелёные; не параллельно date-remainders на heys_day_pickers.js.
```

#### home-widgets-typography

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: home-widgets (lane: home-widgets-typography).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — home-widgets, lanes.

Задача: закрыть «≠» геометрии/типографики плиток (роли плиток, песочные vs контрактные, CSS сетки в 730-widgets). Не трогать breakdown content в variants.
Источник чисел: data-v в home-widgets.v4.dc.html.
DO NOT EDIT: heys_widgets_variants_v4.js, heys_widgets_ui_v1.js, cycle, nutrition.

Файлы lane: styles/modules/730-widgets-dashboard.css, styles/modules/002-ui-v4-palette-roles.css (роли плиток/линий).
Тесты: npx vitest run --root . __tests__/widgets-v4-canvas-geometry.test.js __tests__/line-roles-v4.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash home-widgets

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены. Prettier CSS — не запускать.
Критерий готово: widgets geometry tests зелёные; pnpm ui:v4:check если объявлял новые роли.
```

#### date-remainders

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: date-remainders (lane: date-remainders).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — date-remainders, lanes.

Задача: закрыть «≠» date-remainders (полоса цикла 3 px, переход суток, нажатие 70 %; «ночь до 03:00» — ? + FINDINGS без кадра).
Источник чисел: data-v в date-remainders.v4.dc.html.
DO NOT EDIT: cycle mode в heys_day_pickers.js (cycle-ui-calendar-undo), widgets.

Файлы lane: heys_day_pickers.js (date capsule/sheet, не cycle mode), styles/modules/000-base-and-gamification.css (date-picker ~7900–8700).
Тесты: npx vitest run --root . __tests__/date-remainders-v4-smoke.test.js __tests__/date-remainders-v4-cell.test.js __tests__/date-picker-v4-capsule.test.js __tests__/date-picker-sheet-v4-structure.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash date-remainders

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_day_pickers.js

Критерий гotово: date-remainders test cluster зелёный; не параллельно cycle-ui-calendar-undo.
```

#### settings-system

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: settings-system (lane: settings-system).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — settings-system, lanes.

Задача: закрыть «≠» settings-system (UI настройки цикла в профиле, звук воды, режим куратора, «Выйти» вне ярусов).
Источник чисел: data-v в settings-system.v4.dc.html.
DO NOT EDIT: heys_user_tab_impl_v1.js profile groups (profile-registration lane).

Файлы lane: heys_app_shell_v1.js (settings tab), heys_theme_v1.js, heys_health_features_v1.js.
Тесты: npx vitest run --root . __tests__/settings-v4-notify-detail.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash settings-system

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_app_shell_v1.js,heys_theme_v1.js

Критерий готово: settings tests зелёные.
```

#### curator-supplements

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зона: curator-edits (lane: curator-supplements).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — curator-edits, lanes.

Задача: закрыть «≠» curator-edits (4 действия журнала добавок на клиенте/сервере, офлайн live fetch, z-index над листом).
Источник чисел: data-v в curator-edits.v4.dc.html.
DO NOT EDIT: heys_widgets_*, heys_day_handlers.js.

Файлы lane: heys_curator_actions_banner_v1.js, серверные RPC добавок (если в scope).
Тесты: npx vitest run --root . __tests__/curator-edits-v4-product-rules.test.js
Вердикты: apply-verdict.mjs; rehash: --rehash curator-edits

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
Критерий гotово: curator tests зелёные; server scope — только явные RPC в handoff.
```

#### platform-misc

**Copy-paste prompt:**

```
Репозиторий: HEYS-v2, ветка main.
Зоны: pwa-update, gamification, spinners, app-splash (lane: platform-misc).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — соответствующие секции Remaining work, lanes.

Задача: закрыть «≠» platform/gamification зон (PWA баннеры, gamification порядок/границы суток, spinners boot, app-splash theme migration).
Источник чисел: data-v в pwa-update.v4.dc.html, gamification.v4.dc.html, spinners.v4.dc.html, app-splash.v4.dc.html.
DO NOT EDIT: product UI lanes (nutrition, widgets, cycle, checkin, water, tips, login, registration, settings, curator).

Файлы lane: heys_platform_apis_v1.js, heys_pwa_module_v1.js, heys_gamification_v1.js, heys_gamification_screens_v1.js, index.html, heys_loading_progress_v1.js, styles/modules/000-base-and-gamification.css (gamification scope), styles/modules/heys-components.css.
Тесты: npx vitest run --root . __tests__/pwa-install-banner-v4-structure.test.js __tests__/sync-pending-banner-v4.test.js __tests__/gamification-v4-achievement-row.test.js __tests__/gamification-v4-order.test.js __tests__/spinners-v4-offline-start.test.js
Вердикты: apply-verdict.mjs; rehash по каждой затронутой зоне (--rehash pwa-update, gamification, spinners, app-splash)

Коммит: HEYS_COMMIT_SOURCE_ONLY=1. Push/deploy — запрещены.
После правок: pnpm bundle:legacy:auto --files=heys_platform_apis_v1.js,heys_pwa_module_v1.js,heys_gamification_v1.js

Критерий гotово: platform test cluster зелёный; undefined roles gate не ухудшать.
```

---

## Cloud agent launch template

### Репозиторий

- **Repo:** `HEYS-v2`
- **Branch:** `main` — перед стартом на устройстве:
  `git status --short --branch` (все session commits на `origin/main`, ahead
  count не хардкодить)
- **Dev:** `pnpm dev:local` (API :4001 + web :3001)

### Обязательное чтение

1. Этот файл — `docs/ui/UI_V4_COMPLETION_PROMPT.md`
2. `.cursor/rules/canvas-to-code.mdc` — контракт → кадры → гейт
3. `docs/ui/ui-v4-contract-verdicts.json` — свои строки зоны
4. Канвас зоны:
   `docs/ui/handoff-v4/canvas/…/design_handoff_heys_v4/<zone>.v4.dc.html`
5. User-facing текст: `apps/landing/COPY_VOICE.md`
6. Открытые споры: `docs/ui/UI_V4_FINDINGS.md`

### Prompt (copy-paste)

```
Репозиторий: HEYS-v2, ветка main.
Зона: <ZONE> (lane: <LANE>).
Handoff: docs/ui/UI_V4_COMPLETION_PROMPT.md — прочитай целиком.

Задача: закрыть строки контракта с вердиктом «≠» в зоне <ZONE>.
Источник чисел: data-v в <zone>.v4.dc.html на диске.
Не трогай файлы из колонки DO NOT EDIT для lane <LANE>.

Файлы lane: <список из таблицы lanes>.
Тесты: npx vitest run --root . <test files>.
Вердикты: scratchpad/verdicts/apply-verdict.mjs; rehash: --rehash <ZONE>.

Коммит: HEYS_COMMIT_SOURCE_ONLY=1, явные пути. Push/deploy — запрещены.
Prettier CSS — не запускать.
После legacy-правок: pnpm bundle:legacy:auto --files=<…>.

Критерий готово: zone test cluster зелёный; закрытые строки = или ? с FINDINGS;
pnpm ui:v4:check по затронутым ролям (если менял палитру).
```

---

## Pre-push blockers (26.08 reviewer audit)

**Снимок 26.08 ~03:38 (устройство): ALL GREEN** — 454 files, 5711 tests;
`pnpm ui:v4:check` (roles + drift) зелёный. Push блокируют только незавершённый
scope и отсутствие прямой команды пользователя, не красные гейты.

| Проверка      | Команда                                 | Состояние 26.08 |
| ------------- | --------------------------------------- | --------------- |
| UI v4 gates   | `pnpm ui:v4:check` (roles + drift)      | **зелёный**     |
| Полный vitest | `npx vitest run --root .` из `apps/web` | **зелёный**     |

Fixes, закрывшие прежние блокеры: `5bfc5e10`, `94325590`, `c186ebe6`,
`fccbdbee`.

### RESOLVED 26.08 — не чинить повторно

| #   | Было красным                                           | Fix SHA    |
| --- | ------------------------------------------------------ | ---------- |
| 1   | Undefined roles (`--v4-sand-act-fill`, `--v4-sand-bg`) | `5bfc5e10` |
| 2   | `widgets-v4-sphere.test.js`                            | `c186ebe6` |
| 3   | `checkin-evening-and-pack-limit.test.js`               | `fccbdbee` |
| 4   | `nutrition-v4-canvas-geometry.test.js`                 | `94325590` |

### Правило для cloud agents

**Перед стартом wave** — на **устройстве** (не в cloud FS) перепроверить:

```bash
pnpm ui:v4:check
npx vitest run --root .   # из apps/web
```

Если любая команда падает — **остановить wave**, чинить на устройстве первым.

**После wave:** частичный vitest по lane **не** заменяет финальный полный прогон
на устройстве.

---

## Pre-push checklist (для человека)

- [x] Local workers session 26.08 — **DONE** (`37ec9d26`, `a58bfe19`,
      `ba60afbb`, `af6a60df`, regressions `ffe24fe2`…`79c7bcb0`)
- [ ] `git status` чистый в `apps/web` и `docs/ui/` (кроме осознанного scope)
- [ ] `pnpm ui:v4:check` — оба подгейта зелёные (26.08 ~03:38: зелёный;
      перепроверить на устройстве перед push)
- [ ] Zone test clusters зелёные; финально `npx vitest run --root .` из
      `apps/web` (26.08 ~03:38: 454 files, 5711 tests — зелёный)
- [ ] `docs/ui/ui-v4-contract-verdicts.json` — rehash для затронутых зон (cycle
      pending)
- [ ] Preview bundles собраны integration-проходом или CI (`build:ci`)
- [ ] Сверить на устройстве: `git status --short --branch` — session commits на
      `origin/main`, scope согласован (ahead count не хардкодить)
- [ ] Прямая команда пользователя на push/deploy

**Ready for push (26.08 ~03:38):** гейты и vitest зелёные; остаётся cycle
rehash, integration bundles и прямая команда на push/deploy.

---

## Общие правила (кратко)

- **Вердикт ставит сводящий экран** в той же задаче. `=` — с файлом и строкой
  кода.
- **Контракт старше кадра** — отступления в протокол и тест сверки.
- **Отрицательный вывод** — два независимых способа; кириллица — только ripgrep.
- **Progressive disclosure** — перед UI-правкой одна строка UI-гейт (см.
  CLAUDE.md).
- Закрытые FINDINGS → `UI_V4_FINDINGS_HISTORY.md`.
