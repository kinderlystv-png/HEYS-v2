# Протокол: утренний чек-ин v4

**Дата:** 2026-08-16  
**Canvas:** `docs/ui/handoff-v4/canvas/Регистрация и чек-ин v4.dc.html`  
**Статус:** локально собрано; push/deploy не входят

## UI-гейт

`цель — закрыть утро пятью экранами; главное действие — Дальше / Готово; слой 1 — вопрос и первичная кнопка; слой 2 — заметка сна, тип холода, замеры, курс добавок; критическое не скрывать — пропуск веса пишет расчётный, не измеренный.`

## Инварианты

- Одна поставка всего ритуала. Регистрация уже сплитирована и не переделывается.
- Экран «Записано» и правило «не взвешивался» — один смысл: кадр
  `checkinRecorded` не подключать без `weightMorningSource`.
- `weightMorningSource`: `measured` | `estimated_avg` | `estimated_profile`.
- Estimated не кормит `getLastKnownWeight` и тренд.
- Серия дня растёт на расчётном весе. **Отметка в истории серии — не эта
  задача.**

## Крупные шаги

### 1. Хром StepModal — сделано

- Дневной layout: без крестика, первичная кнопка в футере, точки-пилюли.
- `yesterdayVerify` и `checkinRecorded` — `hiddenFromProgress`.
- Регистрация и точечные `showCheckin.*` остаются на старом хроме.

### 2. План экранов — сделано

Полное утро:
`[yesterdayVerify?], weight, sleep, morning_mood, stepsGoal, morningRest, checkinRecorded`.

- `sleep` пишет `sleepStart/sleepEnd` + `sleepQuality` одним ack.
- `morningRest` не блокирует `completeMorningCheckin`.
- `_dailyRequiredOnly` только reopen пропавших core, не каждое утро.
- Старый ledger `sleepTime`/`sleepQuality`/хвост схлопывается в новые id.
- Точечные входы `showCheckin.sleep` / `.weight` / добавки — старые id.

### 3. Вес — сделано

- «Дальше» — измеренный: `weightMorning` + `profile.weight` + XP.
- «Не взвешивался» — среднее трёх измеренных, иначе профиль. Не трогает профиль
  и XP.
- На «Записано» после skip — «сегодня без взвешивания» и метка «расчётный».

### 4. Вчера — сделано

Четыре выхода, причина только еда. Пачка: «Оценить все по ощущениям»; «Очистить
N пустых» не трогает день с ккал. Проверка:
`apps/web/__tests__/yesterday-verify-v4-pack.test.js`.

## Долг

- Серия растёт на расчётном весе, отметка в истории — следующая задача.
- Тёмные и синие новых кадров — QA-референс после первого превью пяти экранов на
  токенах.

## Не в этой поставке

- ПЭП согласий, пустой шелл вкладок, пуш дня старта.
- Чипы сна и активность **регистрации**.
- Цикл.

## Файлы

- `apps/web/heys_morning_checkin_v1.js`
- `apps/web/heys_step_modal_v1.js`
- `apps/web/heys_steps_v1.js`
- `apps/web/heys_yesterday_verify_v1.js`
- `apps/web/heys_day_weight_trends_v1.js`
- `apps/web/styles/modules/500-pwa-and-offline.css`
- `apps/web/styles/modules/715-yesterday-verify.css`
- тесты `apps/web/__tests__/morning-checkin-*`, `yesterday-verify-*`
