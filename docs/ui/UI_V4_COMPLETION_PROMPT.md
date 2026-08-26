# Handoff: довести UI v4 до контракта канваса (cloud agents)

Канонический документ для облачных агентов, закрывающих сведение продукта с
семнадцатой сборкой пакета дизайна. Состояние снимка — **26 августа 2026**.

Пакет: **17 зон**, **1487 строк** контракта с вердиктами (1488 в канвасе; одна
строка без вердикта — см. гигиену ниже).

**База для cloud deploy:** `1560cc8b`
(`docs(ui): handoff — session 26.08 workers DONE, +39 ahead`).

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

| Подгейт                           | Состояние   | Примечание                                                                                                                                                                 |
| --------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui-v4-check-undefined-roles.mjs` | **красный** | WIP в `000-base-and-gamification.css`, `500-pwa-and-offline.css`: голые `--v4-sand-act-fill`, `--v4-sand-bg` — объявить в `002-ui-v4-palette-roles.css` или заменить ролью |
| `ui-v4-check-contract-drift.mjs`  | **зелёный** | «Контракты не двигались: 17 зоны, 1487 строк» (проверено 26.08 ~03:10)                                                                                                     |

Перед push оба подгейта обязаны быть зелёными на **чистом дереве** после merge
всех локальных batch (session 26.08 — workers DONE, push ещё нет).

### Вердикты — итого и по зонам

**Итого:** `=` 1185 · `≠` 193 · `?` 6 · `—` 95

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

### Что DONE (коммиты на main, локально **+39** от origin)

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

### Lanes (6–8 независимых)

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

- [ ] Все локальные коммиты session batch **запушены** или явно согласованы как
      ahead-only (`1560cc8b` base — fetch `origin/main`, сверить ahead count)
- [ ] `pnpm ui:v4:check` — зелёный (см. **Pre-push blockers** ниже)
- [ ] `npx vitest run --root .` из `apps/web` — зелёный на **остановленных**
      workers (без параллельных lane в том же дереве)
- [ ] `git status apps/web docs/ui` — нет чужого dirty в hot files

### На каждый cloud agent (в prompt)

- [ ] Блок **lane** из таблицы lanes (владение + DO NOT edit)
- [ ] Ссылка: `docs/ui/UI_V4_COMPLETION_PROMPT.md` (этот файл, base `1560cc8b`)
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

## Cloud agent launch template

### Репозиторий

- **Repo:** `HEYS-v2`
- **Branch:** `main` (локально **+39** коммитов от `origin/main` на 26.08 —
  fetch перед стартом)
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

Честный снимок **перед push/deploy** (base `1560cc8b`, проверено на устройстве
26.08). Все пункты ниже обязаны быть **зелёными**; иначе push запрещён.

| #   | Блокер                        | Команда / тест                                                             | Состояние 26.08                                                                                                 |
| --- | ----------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | Undefined roles gate          | `pnpm ui:v4:check` → `ui-v4-check-undefined-roles.mjs`                     | **красный** — `--v4-sand-act-fill`, `--v4-sand-bg` в `000-base-and-gamification.css`, `500-pwa-and-offline.css` |
| 2   | Widgets sphere geometry       | `npx vitest run --root . __tests__/widgets-v4-sphere.test.js`              | **красный**                                                                                                     |
| 3   | Check-in evening / pack limit | `npx vitest run --root . __tests__/checkin-evening-and-pack-limit.test.js` | **красный**                                                                                                     |
| 4   | Nutrition canvas geometry     | `npx vitest run --root . __tests__/nutrition-v4-canvas-geometry.test.js`   | **красный**                                                                                                     |

**Правило:** параллельные cloud workers **остановлены** → на устройстве один
прогон `npx vitest run --root .` из `apps/web` + `pnpm ui:v4:check`. Частичный
vitest по lane во время wave **не** заменяет финальный полный прогон.

Drift-гейт (`ui-v4-check-contract-drift.mjs`) на 26.08 **зелёный** — это не
отменяет четыре блокера выше.

---

## Pre-push checklist (для человека)

- [x] Local workers session 26.08 — **DONE** (`37ec9d26`, `a58bfe19`,
      `ba60afbb`, `af6a60df`, regressions `ffe24fe2`…`79c7bcb0`)
- [ ] `git status` чистый в `apps/web` и `docs/ui/` (кроме осознанного scope)
- [ ] `pnpm ui:v4:check` — оба подгейта зелёные (**сейчас красный** undefined
      roles: `--v4-sand-act-fill` в `000-base-and-gamification.css`;
      `--v4-sand-act-fill`, `--v4-sand-bg` в `500-pwa-and-offline.css` —
      объявить в `002-ui-v4-palette-roles.css` или заменить ролью)
- [ ] Zone test clusters зелёные; финально `npx vitest run --root .` из
      `apps/web`
- [ ] `docs/ui/ui-v4-contract-verdicts.json` — rehash для затронутых зон (cycle
      pending)
- [ ] Preview bundles собраны integration-проходом или CI (`build:ci`)
- [ ] Список коммитов ahead of origin (26.08: **39** на main) — согласован scope
- [ ] Прямая команда пользователя на push/deploy

**Ready for push (26.08):** **нет** — undefined roles gate + cycle rehash +
полный vitest/integration bundles.

---

## Общие правила (кратко)

- **Вердикт ставит сводящий экран** в той же задаче. `=` — с файлом и строкой
  кода.
- **Контракт старше кадра** — отступления в протокол и тест сверки.
- **Отрицательный вывод** — два независимых способа; кириллица — только ripgrep.
- **Progressive disclosure** — перед UI-правкой одна строка UI-гейт (см.
  CLAUDE.md).
- Закрытые FINDINGS → `UI_V4_FINDINGS_HISTORY.md`.
