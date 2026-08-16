# Протокол: сплит регистрации и утреннего чек-ина

**Дата:** 2026-08-16  
**Canvas:** `docs/ui/handoff-v4/canvas/Регистрация и чек-ин v4.dc.html`  
**Статус:** реализовано в коде (локально); push/deploy не входили в этот шаг

## UI-гейт

`цель — закрыть регистрацию одним из трёх концов; главное действие — Начать утренний чек-ин или Проверить доступ; слой 1 — сводка или ожидание; слой 2 — написать куратору только при имени; критическое не скрывать — дневник закрыт до canWrite.`

## Крупные шаги

### 1. Два плана StepModal

- `getRegistrationSteps()` = 4 profile + `welcome` (итог)
- `getCheckinSteps()` = только дневные шаги, без profile/welcome
- `isProfileOnlyRegistration` включает `welcome` → ledger/dayv2 до canWrite не
  создаются
- Resume тела: `profileBodyCapturedAt`, переспрос если старше 3 дней; цель не
  устаревает

**Проверка:** `registration-welcome-split-smoke.test.js` (матрица планов, три
конца, resume тела, гейты, live trial); плюс
`morning-checkin-flow-resume.test.js`, `first-login-registration-flow.test.js`

### 2. Три конца без автоперехода

- open (`trial`/`active`): сводка + «Начать утренний чек-ин» → remount
  `mode=daily`
- waiting (`none`): «Профиль сохранён», «Проверить доступ», куратор только при
  имени
- dated (`trial_pending` + дата > `todayISO`): герой даты, «можно не открывать»,
  без пуша на экране
- Итог терминальный (`disableBack`); крестика у утра нет

**Проверка:** source-контракты в `first-login-onboarding-guardrails.test.js`;
welcome UI в `first-login-registration-flow.test.js`

### 3. Порядок первого входа и live trial

- OptionalFeatureOffer не между согласиями и профилем
- `subscription-waiting` не дублирует ending, пока `showMorningCheckin`
- Live `heys:subscription-changed` с ожидания → сразу daily, не сводка
- После complete дневного чек-ина → вкладка Главная (`widgets`)

**Проверка:** `trial-prestart-access-contract.test.js`; ручной смоук на
`dev:local`

### 4. ПЭП, цель×активность, копи и расчётный вес

- Обязательное согласие не чекается тапом: сначала полный текст, «Ознакомлен»
  после дочитывания, кнопка «Подписать оба»
- Шаг 3: цель × темп + `activityLevel` (`sedentary` / `light` / `active`), без
  молчаливого `moderate`
- Заголовки канваса, сон `− / +` шаг 0.5, открытый итог «Профиль готов», точки
  на 4 шагах (на `welcome` скрыты)
- «Не взвешивался» пишет `weightMorning` + `weightMorningEstimated`: норма
  берёт, тренд/график — нет

**Проверка:** `consent-markdown-render.test.js` (PEP),
`registration-welcome-split-smoke.test.js` (цели/копи),
`first-login-registration-flow.test.js`, `sleep-weight-xp-events.test.js`
(estimated)

### 5. Сверка с канвасом (светлый ряд)

Симуляция 2026-08-16: `registration-canvas-parity.test.js` + связанные тесты, 79
passed.

- Согласия: заголовок, «Коротко и честно», «Читать полностью →», футер «Откройте
  и дочитайте оба документа» / «Подписать оба» → «Подписать»; после двух галочек
  обязательные сжимаются; документ на весь экран с заголовком канваса;
  «Ознакомлен, принимаю» после дочитывания; шторка «Подпишите документы», код
  сам подписывает.
- Шаги 1–4: копи канваса, ИМТ цели 17,0 не блокирует, 18 лет блокирует колесо,
  имя «1», «Остался пол», «Готово» на шаге 4.
- Три конца welcome + возврат через неделю («Рост и вес — заново»).
- Сохранение: «Сохраняем профиль» / «Профиль не сохранился» / «Повторить сейчас»
  — без «Написать куратору».
- Без canWrite дневной план пустой: канон утра v4 не подставляет шаги до старта
  недели.

**Сознательно не один-в-один:** клавиатура ОС; номер попытки сохранения в
оверлее WaitMark не рисуем; «Профиль в настройках» не переделывался.

**Визуал согласий (2026-08-16, доведено к canvas):** необязательные только после
двух обязательных; без шапки-бордера; чекбокс 22×22 + inset; «Читать полностью
→» hit 40px; выход без стрелки и только до подписи обязательных; кнопка
`#c67139` / текст `#2b1608`; шторка подписи без handle, title/hint по центру.

**Команда:** из `apps/web` —
`pnpm exec vitest run __tests__/registration-canvas-parity.test.js __tests__/registration-welcome-split-smoke.test.js __tests__/consent-honest-summaries.test.js __tests__/first-login-registration-flow.test.js __tests__/consent-markdown-render.test.js __tests__/first-login-onboarding-guardrails.test.js __tests__/login-v4-structure.test.js`

## Не в этом PR

- Пустой шелл вкладок на ожидании
- Пуш утра дня старта
- Отметка расчётного веса в истории серии (склейка пяти экранов — в
  `MORNING_CHECKIN_V4_PROTOCOL.md`)

## Файлы

- `apps/web/heys_morning_checkin_v1.js`
- `apps/web/heys_profile_step_v1.js`
- `apps/web/heys_step_modal_v1.js`
- `apps/web/heys_consents_v1.js`
- `apps/web/heys_steps_v1.js`
- `apps/web/heys_models_v1.js`
- `apps/web/heys_day_weight_trends_v1.js`
- `apps/web/widgets/widget_data.js`
- `apps/web/heys_app_overlays_v1.js`
- `apps/web/heys_app_morning_checkin_v1.js`
- `apps/web/heys_app_gate_flow_v1.js`
- `apps/web/heys_app_gate_state_v1.js`
- `apps/web/heys_app_root_impl_v1.js`
- `apps/web/heys_app_tab_state_v1.js`
- тесты выше + docs
