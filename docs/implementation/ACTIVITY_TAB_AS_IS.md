# Вкладка «Актив» — как она устроена сейчас (as-is)

Документ описывает фактическое состояние кода на 2026-08-30 (рабочее дерево,
ветка `main`, незакоммиченные правки включены). Собран по запросу дизайнера
перед выпуском контракта на зону: у вкладки «Актив» контракта нет, и макет
рисовался бы по догадкам.

Ничего не предлагается сверх раздела «Что решать дизайнеру»: остальное — только
то, что выполняется. Каждый факт снабжён путём и строкой; пути относительны
корня репозитория.

**Область документа:** мобильный клиентский экран, вкладка `activity` («Актив»).
Тот же `DayTab`, что «Питание» и «Отчёты», отличается значением `subTab`.

---

## 0. Из чего исходить: stable против `main`

**Вкладка на stable беднее текущей ветки, а не богаче.** Здесь ситуация обратная
Инсайтам, где живая ветка оказалась урезанной.

- `stable.heyslab.ru` заморожен на линии `36df9ce3` (2026-08-10) —
  [stable-heyslab-build-recipe.md](../release/stable-heyslab-build-recipe.md).
- v4-переписывание Актива (`3539fcda9 feat(ui-v4): Activity tab tiered layout`,
  `7abfa3d25 fix(ui): Activity v4 stage-4 structure per owner review`) **не
  является предком** `36df9ce3` — проверено
  `git merge-base --is-ancestor 3539fcda9 36df9ce3` (не предок).
- Значит на stable живёт **старая формульная вкладка** (490 строк: заголовок «📏
  АКТИВНОСТЬ», карточка «Расчёт калорий», карточка быта, карточка зарядки, «📋
  Тренировки за 30 дней»), а в `main` — **v4-вкладка ярусами** (604 строки: hero
  «Цель дня», ярусы Сегодня / Действие / История).

**Канон для макета — `main`.** stable здесь прошлое поколение, а не эталон. Но
при переписывании v4 потеряла пять вещей, и их надо решать заново, а не
«возвращать как было» — см. §9 и §10.

**Контракта нет, канвас есть.** В пакете дизайна лежит
`docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tab-activity.v4.dc.html`
(67 КБ, четыре палитры одного экрана), но в нём **ноль блоков `[data-contract]`
и ноль кадров `data-demo`**, а `ACCEPTANCE-tab-activity.md` не существует.
`node scripts/ui-v4-check-contract-drift.mjs --list` вкладку не знает вовсе. Это
визуальный мудборд: числа брать неоткуда, приёмку сверять не с чем.

---

## 1. Что на вкладке

Вкладка `activity` рендерит **ровно один блок** — `compactActivity`. Всё
остальное в `page-day` отфильтровано на `mobileSubTab === 'stats'`
([heys_day_page_shell.js:418](apps/web/heys_day_page_shell.js:418)).

Цепочка: `tab === 'activity'` → `subTab: 'activity'`
([heys_app_shell_v1.js:6210](apps/web/heys_app_shell_v1.js:6210)) →
`showActivityContent`
([heys_day_tab_impl_v1.js:447](apps/web/heys_day_tab_impl_v1.js:447)) →
`compactActivity`
([heys_day_tab_impl_v1.js:2243](apps/web/heys_day_tab_impl_v1.js:2243)) →
`buildActivityCard`
([heys_day_activity_card_v1.js:6](apps/web/heys_day_activity_card_v1.js:6)) →
`ActivityTabV4`
([heys_day_activity_v1.js:206](apps/web/heys_day_activity_v1.js:206)).

### 1.1 Порядок сверху вниз

| #   | Блок                                                                        | Файл                                                                                                                                                                             | На какой вопрос отвечает           |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| —   | Шапка + капсула даты (sticky)                                               | [heys_app_shell_v1.js:3310](apps/web/heys_app_shell_v1.js:3310)                                                                                                                  | Какой день смотрю                  |
| 1   | Hero «Цель дня · N ккал» + раскрывающийся разбор                            | [heys_day_activity_v1.js:452](apps/web/heys_day_activity_v1.js:452), разбор [:417](apps/web/heys_day_activity_v1.js:417)                                                         | Сколько мне сегодня есть и из чего |
| 2   | Ярус «Сегодня»                                                              | [heys_day_activity_v1.js:478](apps/web/heys_day_activity_v1.js:478)                                                                                                              | —                                  |
| 3   | Шаги: число / цель, полоса, ползунок, «N ккал · правка ползунком»           | [heys_day_activity_v1.js:480](apps/web/heys_day_activity_v1.js:480)                                                                                                              | Сколько прошёл и сколько это дало  |
| 4   | «Кардио ›» — аккордеон, внутри весь блок тренировок                         | [heys_day_activity_v1.js:538](apps/web/heys_day_activity_v1.js:538) → [heys_day_trainings_v1.js:2803](apps/web/heys_day_trainings_v1.js:2803)                                    | Что за тренировки были             |
| 5   | Строки дня: Бытовая активность · Зарядка · Голод и энергия (или «Отметить») | [heys_day_activity_v1.js:335](apps/web/heys_day_activity_v1.js:335)                                                                                                              | Что уже отмечено, что нет          |
| 6   | Ярус «Действие» + кнопка «Добавить активность +» → лист из трёх кнопок      | [heys_day_activity_v1.js:555](apps/web/heys_day_activity_v1.js:555), лист [:298](apps/web/heys_day_activity_v1.js:298)                                                           | Как записать                       |
| 7   | Ярус «История»: календарь «Зарядка · N из 28» + «Тренировки за месяц · N ›» | [heys_day_activity_v1.js:565](apps/web/heys_day_activity_v1.js:565), календарь [heys_morning_activation_calendar_v1.js:303](apps/web/heys_morning_activation_calendar_v1.js:303) | Держится ли привычка               |
| —   | FAB-стопка (вода / голод / мессенджер / активность / еда)                   | [heys_day_page_shell.js:430](apps/web/heys_day_page_shell.js:430)                                                                                                                | Быстрое действие                   |

### 1.2 Что внутри «Кардио»

Аккордеон разворачивает `regularTrainingsBlock` — вызов `renderTrainingsBlock` в
режиме `trainingFilterMode: 'regular'` и `includeHouseholdEntries: true`
([heys_day_tab_impl_v1.js:1326](apps/web/heys_day_tab_impl_v1.js:1326)):

- строка программы куратора «Следующая тренировка — … · Программа ›»
  ([heys_day_trainings_v1.js:2768](apps/web/heys_day_trainings_v1.js:2768)) или
  «Программа пройдена» ([:2740](apps/web/heys_day_trainings_v1.js:2740));
- `PlanCard` — назначенный план, действия «Начать / Перенести / Пропустить»
  ([heys_day_trainings_v1.js:3748](apps/web/heys_day_trainings_v1.js:3748));
- `ProposalCard` — правка куратора, на которую клиент ещё не ответил
  ([:3716](apps/web/heys_day_trainings_v1.js:3716));
- `SummaryCard` — сводка силовой с журналом
  ([:3813](apps/web/heys_day_trainings_v1.js:3813));
- обычные карточки тренировок с чипами зон Z1…Z4
  ([:3549](apps/web/heys_day_trainings_v1.js:3549));
- карточки бытовой активности с кнопкой «×»
  ([:4052](apps/web/heys_day_trainings_v1.js:4052)).

### 1.3 Живо в коде, но снято с экрана

| Что                                                     | Где лежит                                                                                                                                                                       | Состояние                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chargeTrainingBlock` — отдельный рендер зарядки        | считается в [heys_day_tab_impl_v1.js:1350](apps/web/heys_day_tab_impl_v1.js:1350), кладётся в ctx в [heys_day_activity_card_v1.js:53](apps/web/heys_day_activity_card_v1.js:53) | `ActivityTabV4` его не разбирает из ctx — считается каждый рендер и выбрасывается                                                                                                                     |
| Карточка «⚡ Зарядка · пропущено» с причиной            | была на stable                                                                                                                                                                  | удалена; на stable тоже никогда не показывалась (§9 P)                                                                                                                                                |
| Кнопка правки цели шагов (✏️)                           | `openStepsGoalPicker` приходит в actions [heys_day_activity_v1.js:243](apps/web/heys_day_activity_v1.js:243)                                                                    | не вызывается ни разу                                                                                                                                                                                 |
| Пояснение «?» у TEF                                     | `setTefInfoPopup` в actions [:242](apps/web/heys_day_activity_v1.js:242)                                                                                                        | не вызывается; попап жив только на «Отчётах»                                                                                                                                                          |
| Бейдж числа бытовых активностей, «+ Тренировка», «⚡🔋» | были на stable                                                                                                                                                                  | сняты; CSS `.household-activity-card`, `.activity-actions-row`, `.add-charge-btn`, `.activity-charge-card` остался в [100-metrics-and-graphs.css](apps/web/styles/modules/100-metrics-and-graphs.css) |
| Вкладка «Месяц»                                         | `'month'` в `BASE_HOME_TABS` [heys_app_tab_state_v1.js:10](apps/web/heys_app_tab_state_v1.js:10)                                                                                | в `primaryTabs` её нет — выбираема как домашняя, но не в навигации                                                                                                                                    |

### 1.4 Как файл попадает в браузер

`heys_day_activity_v1.js` **не входит ни в один бандл** — грузится отдельным
`<script>` из `heys_day_stats_bundle_loader_v1.js`
([heys_day_stats_bundle_loader_v1.js:16](apps/web/heys_day_stats_bundle_loader_v1.js:16)),
последовательно, с `?v=<hash boot-day>`. Соседи по этому же списку:
`heys_day_trainings_v1.js`, `heys_day_training_popups_v1.js`,
`heys_discipline_matrix_v1.js`, экраны `strength/*`.

---

## 2. Что такое «актив» в данных

**Одна сущность с типом — нет.** Их три, и живут они в разных полях одного дня
`heys_dayv2_<дата>`.

| Сущность               | Где                                                 | Поля                                                                                                                                                                                                               | Пишет человек                                      | Считает движок                     |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------- |
| **Шаги**               | `day.steps` — скаляр                                | число                                                                                                                                                                                                              | ползунком или в утреннем чек-ине                   | `stepsKcal()`                      |
| **Тренировки**         | `day.trainings[]` — до 3 слотов                     | `{z:[4], time, type, mood, wellbeing, stress, comment, id?, source?, activityLabel?, intensity?, strengthEntryMode?, workoutLog?, plan?, planSnapshot?}` — [heys_models_v1.js:895](apps/web/heys_models_v1.js:895) | тип, время, минуты по 4 зонам, оценки, комментарий | `trainingKcal()` по `z` × MET зоны |
| **Бытовая активность** | `day.householdActivities[]` + legacy `householdMin` | `{minutes, time?, label?, icon?, source?}`                                                                                                                                                                         | минуты (шаг `household_minutes`)                   | `minutes × netKcalPerMin(2.5)`     |

### 2.1 Типы тренировки

Четыре, [heys_day_picker_modals.js:202](apps/web/heys_day_picker_modals.js:202):
`cardio` 🏃, `strength` 🏋️, `hobby` ⚽ «Активное хобби», `fingers` 🤚 «Пальцы».

**Для расхода тип не значит ничего** — калории считаются только по минутам в
зонах. Тип определяет вид карточки: только `strength` умеет структурный журнал
подходов.

### 2.2 Зарядка — не тип, а признак

Опознаётся тремя способами подряд
([heys_day_activity_v1.js:16](apps/web/heys_day_activity_v1.js:16)):

1. `training.source === 'morning_activation'`;
2. `activityLabel` = «зарядка» без учёта регистра;
3. `type === 'strength'` + сигнатура зон из белого списка
   `{'8,0,0,0', '8,6,0,0', '4,8,8,2'}` + пустой `activityLabel`.

Тот же предикат продублирован копипастой в
[heys_day_trainings_v1.js:2841](apps/web/heys_day_trainings_v1.js:2841) и
[heys_morning_checkin_v1.js:333](apps/web/heys_morning_checkin_v1.js:333).

Рядом лежит объект статуса
`day.morningActivation = {status, decidedAt, checkinAnsweredAt, intensity, postState, postEffect, replacement, firstMealTime, skipReason*}`.
Реально пишутся статусы `'done' | 'planned' | 'skipped' | 'pending'`
([heys_steps_v1.js:972](apps/web/heys_steps_v1.js:972)). Замена «тренировка
вместо зарядки» — `source: 'morning_activation_replacement'`, `z: [0,45,0,0]`,
`type: 'strength'` ([heys_steps_v1.js:5459](apps/web/heys_steps_v1.js:5459)).

### 2.3 Структурный лог упражнений

Это `training.workoutLog` у `type: 'strength'` при
`strengthEntryMode: 'workout_builder'`:

```
workoutLog = { version, zoneMinutes[4], totalDurationMinutes, startedAt?, completedAt?, note?,
               exercises: [ { id, name, unit, bodyweightFactor, ssGroup, rpe, restSec, note,
                              approaches: [ { id, weightKg, reps, done, type?:'warmup',
                                              extraWeightKg?, drops:[{weightKg,reps,done}] } ],
                              sets, reps, weightKg /* legacy-зеркало */ } ] }
```

Схема и вся арифметика —
[\_kernel/heys_kernel_strength_v1.js](apps/web/_kernel/heys_kernel_strength_v1.js).
Единица (`weight_reps | bodyweight | time | distance`) и коэффициент своего веса
копируются **снимком** из справочника
[heys_exercise_catalog_v1.js:8](apps/web/heys_exercise_catalog_v1.js:8) в момент
добавления упражнения — чтобы правка справочника не переписывала историю.

**Связь журнала с калориями — только через `zoneMinutes`.** Журнал сам по себе
калорий не даёт: `applyWorkoutLogToTraining` копирует `zoneMinutes` в
`training.z`
([heys_day_trainings_v1.js:3303](apps/web/heys_day_trainings_v1.js:3303)), а `z`
уже идёт в TDEE. По умолчанию новый журнал получает `[0, 45, 0, 0]`
([:3138](apps/web/heys_day_trainings_v1.js:3138)).

---

## 3. Числа блоков

| Число                     | Формула из кода                                                                                                                                                                                                                                                                                                                                                            | Окно                          | Минимум данных | Порог показа                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------- | ------------------------------------------------------------- |
| **Hero «Цель дня»**       | `displayOptimum`: рефид → `Refeed.getRefeedOptimum(optimum)`; долг → `optimum + dailyBoost`; снижение → `optimum − dailyReduction`; иначе `optimum`. Сам `optimum = r0(r0(bmr+actTotal+ndteBoost) × (1+def/100)) × cycleMult` — [heys_tdee_v1.js:376](apps/web/heys_tdee_v1.js:376), [heys_day_caloric_display_state.js:18](apps/web/heys_day_caloric_display_state.js:18) | день                          | нет            | нет, показывается всегда                                      |
| **Подпись под hero**      | рефид → «день загрузки»; `dailyBoost>0` → «компенсация долга»; `dailyReduction>0` → «снижение по плану»; `ndteBoost>0` → «буст после тренировки вчера»; иначе «от затрат без термического эффекта · ±N %» — [heys_day_activity_v1.js:106](apps/web/heys_day_activity_v1.js:106)                                                                                            | день                          | —              | нет                                                           |
| **Разбор hero**           | BMR → `+ Шаги` → `+ Быт` (если >0) → `+ Тренировки` = `r0(train1k+train2k)` (если >0) → `Тренировка вчера` (если `ndteData.active && ndte>0`) → `База (без TEF)` = `tdee − tefKcal` → `+ TEF` (если >0) → `Затраты` = `tdee` → `Дефицит/Профицит` (если ≠0) — [:417](apps/web/heys_day_activity_v1.js:417)                                                                 | день                          | —              | по строкам                                                    |
| **Шаги**                  | `stepsValue = day.steps \|\| 0`; `stepsGoal = clamp(profile.stepsGoal \|\| 7000, 1, 30000)`; `stepsPercent`: до цели — `value/goal×80`, сверх — `80 + (value−goal)/(30000−goal)×20` — [heys_day_steps_ui.js:48](apps/web/heys_day_steps_ui.js:48)                                                                                                                          | день                          | —              | нет                                                           |
| **Ккал шагов**            | `distanceKm = steps × (height×0.7/100) / 1000`; `min = distanceKm/5×60`; `kcal = r0(min × (3.5−1)×3.5×weight/200)` — [heys_tdee_v1.js:113](apps/web/heys_tdee_v1.js:113)                                                                                                                                                                                                   | день                          | —              | —                                                             |
| **«Кардио · N ккал»**     | `cardioKcal = r0(train1k + train2k)` — [heys_day_activity_v1.js:268](apps/web/heys_day_activity_v1.js:268); иначе «не отмечено»                                                                                                                                                                                                                                            | день                          | —              | **весь блок исчезает**, если `regularTrainingsBlock === null` |
| **Ккал зоны (чип Z1…Z4)** | `r0(z[i] × kcalMin[i])`, где `kcalMin[i] = (MET[i]−1)×3.5×weight/200` — [heys_day_trainings_v1.js:3524](apps/web/heys_day_trainings_v1.js:3524)                                                                                                                                                                                                                            | —                             | —              | чип «—» при 0                                                 |
| **Бытовая активность**    | `totalHouseholdMin + ' мин · ' + householdK + ' ккал'`, где `householdK = r0(min × (2.5−1)×3.5×weight/200)` — [heys_tdee_v1.js:294](apps/web/heys_tdee_v1.js:294)                                                                                                                                                                                                          | день                          | `>0` мин       | при 0 → строка «не отмечено»                                  |
| **Зарядка**               | `chargeKcal = Σ z[i]×kcalMin[i]` первой найденной MA-тренировки; строка `«HH:MM · N ккал»` / `«HH:MM · была»` / `«сделаю»` / `«была»` / `«не отмечено»` — [heys_day_activity_v1.js:86](apps/web/heys_day_activity_v1.js:86)                                                                                                                                                | день                          | —              | строка есть всегда                                            |
| **Голод и энергия**       | последняя запись за дату из `HungerEnergyStatusStorage.readEvents()`: `«голод N · энергия M»` — [heys_day_activity_v1.js:118](apps/web/heys_day_activity_v1.js:118)                                                                                                                                                                                                        | день                          | ≥1 событие     | нет записи → «не отмечено»                                    |
| **Календарь зарядки**     | `«Зарядка · doneCount из activeDays»`; `doneCount` = дни со статусом `done` **или** `replacement` — [heys_morning_activation_calendar_v1.js:250](apps/web/heys_morning_activation_calendar_v1.js:250)                                                                                                                                                                      | 28 дней или календарный месяц | нет            | нет                                                           |
| **Тренировки за месяц**   | число строк: все тренировки из 30 дней **назад от сегодня**, у которых `isTrainingSlotUsedMonth` и **не** зарядка; ккал = `Σ z[i]×kcalMin[i]` — [heys_day_activity_v1.js:160](apps/web/heys_day_activity_v1.js:160)                                                                                                                                                        | 30 дней от `todayISO()`       | нет            | 0 → «Нет тренировок за последние 30 дней»                     |
| **Строка «Отметить»**     | `pendingMarks = [быт если 0 мин, зарядка если не resolved, голод если нет записи]`; заменяет три пустые строки при `length ≥ 2` — [:276](apps/web/heys_day_activity_v1.js:276)                                                                                                                                                                                             | день                          | —              | —                                                             |

---

## 4. Расход и тоннаж

### 4.1 Расход — из МЕТ и минут; пульса нет нигде

Единая точка — `HEYS.TDEE.calculate`
([heys_tdee_v1.js:242](apps/web/heys_tdee_v1.js:242)):

```
weight  = day.weightMorning || profile.weight || 70
mets    = [2.5, 6, 8, 10], перекрываются зонами из heys_hr_zones (поле .MET)
netKcalPerMin(met, w) = (max(met − 1, 0) × 3.5 × w) / 200      ← НЕТТО, «над покоем»
bmr     = Mifflin-St Jeor, возраст из birthDate (не из profile.age)
trainingKcal(t) = Σ z[i] × netKcalPerMin(mets[i], weight)
                  но 0, если t.plan.status ∈ {assigned, skipped}
stepsKcal       = минуты ходьбы × netKcalPerMin(3.5, weight)
householdKcal   = минуты × netKcalPerMin(2.5, weight)
ndteBoost       = r0(bmr × ndte.tdeeBoost), только если вчерашние тренировки дали ≥ 300 ккал
baseExpenditure = r0(bmr + actTotal + ndteBoost)               ← без TEF
tdee            = r0(baseExpenditure + tefKcal)                ← с TEF, «Затраты»
optimum         = r0(r0(baseExpenditure × (1 + def/100)) × cycleMult)
```

Ключевое:

- **«−1» в формуле — не косметика.** Минута активности стоит столько, на сколько
  она дороже покоя: BMR уже покрывает все 24 часа. Комментарий
  [heys_tdee_v1.js:50](apps/web/heys_tdee_v1.js:50) фиксирует инцидент
  2026-08-08 — 140 минут быта давали +559 вместо +335.
- **Норма считается от `baseExpenditure`, без TEF** — «чтобы норма не догоняла
  съеденное». В затратах TEF есть, в цели — нет; отсюда подпись «от затрат без
  термического эффекта».
- **Ручного ввода расхода нет.** Человек вводит только минуты и шаги.
- **Назначенный план даёт 0 ккал** до старта —
  [heys_tdee_v1.js:225](apps/web/heys_tdee_v1.js:225).
- **Поправка на факт** (`heys_norm_correction_v1.js`) читает `expenditureSum` из
  тех же дней; отдельной ветки для тренировок там нет.

### 4.2 Тоннаж — другая механика, к калориям не привязан

Формула одна на всех — `TK.strength.trainingTonnage`
([\_kernel/heys_kernel_strength_v1.js:1091](apps/web/_kernel/heys_kernel_strength_v1.js:1091)),
день считает `dayTonnage`
([:1183](apps/web/_kernel/heys_kernel_strength_v1.js:1183)).

| Что                                                     | Идёт в тоннаж?                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Рабочий подход, отмечен выполненным                     | **да** (`totalVolume`)                                          |
| Рабочий подход, не отмечен                              | только в `plannedVolume`                                        |
| **Разминочный** (`type: 'warmup'`)                      | **нет** — ни в фактический, ни в плановый                       |
| **Дропсеты** (`drops[]`)                                | **да**, все ступени: «работа сделана вся»                       |
| Рекорд по весу                                          | только основная ступень — иначе дропсет становился бы PR        |
| Упражнение на своём весе без известной массы тела       | **нет**, попадает в счётчик `unmeasuredExercises`               |
| Секунды / метры (`unit: time \| distance`)              | **нет**, копятся своими величинами                              |
| Назначенная куратором тренировка                        | **нет** — день с планом обязан давать тот же тоннаж, что пустой |
| Legacy-строка `sets × reps × weightKg` без `approaches` | **да** целиком — признака выполнения там нет                    |

**Тоннаж нигде не показан на вкладке «Актив».** Он живёт в двух местах: подпись
под названием силовой внутри «Кардио» («Конструктор · 5 упр. · ~2,4 т объёма»,
[heys_day_trainings_v1.js:2884](apps/web/heys_day_trainings_v1.js:2884)) и
карточка «Тренировка завершена!» в конце сессии
([:2003](apps/web/heys_day_trainings_v1.js:2003)).

---

## 5. Рабочие веса и прогресс

Метрика написана и работает —
[heys_working_weights_v1.js](apps/web/heys_working_weights_v1.js):

- окно `WINDOW_DAYS = 28`, делится пополам;
- сравниваются максимальные рабочие веса одних и тех же упражнений (ключ —
  `exerciseId`, иначе нормализованное имя);
- нужно `MIN_SHARED_EXERCISES = 2` общих упражнения;
- растёт при `deltaPct ≥ GROWTH_PCT (2 %)` **и** `grew > fell`;
- величина порога продуктовая, подтверждена владельцем 2026-08-30
  ([heys_working_weights_v1.js:33](apps/web/heys_working_weights_v1.js:33)).

**На вкладке «Актив» её нет.** Единственный потребитель —
[heys_norm_correction_v1.js:900](apps/web/heys_norm_correction_v1.js:900):
вторая ступень лестницы доводов при перестройке состава. Человек видит её только
текстом на карточке поправки нормы
([heys_norm_correction_v1.js:628](apps/web/heys_norm_correction_v1.js:628)):

> **Похоже на перестройку** — «Вес стоит, но рабочие веса в зале растут 4 недели
> — тренировки продуктивны. Норму на этот цикл не трогаем.» Довод: косвенный ·
> Норма: заморожена · Ждём замер: ещё N дней

и, по истечении двух недель, кадр «Отличить перестройку было нечем»
([:645](apps/web/heys_norm_correction_v1.js:645)).

Итог: единственная метрика прогресса силы существует, но живёт в чужой зоне
(норма) и в отрицательной формулировке. Это развилка для дизайнера, а не дефект.

---

## 6. Состояния

### 6.1 Новый человек, тренировок нет, дневник пустой

```
Цель дня
1 940  ккал
от затрат без термического эффекта · −15 %        ›

СЕГОДНЯ
Шаги            0 / 7 000
0 ккал · правка ползунком

Отметить        быт, зарядка, голод

ДЕЙСТВИЕ
Добавить активность                                +

ИСТОРИЯ
Зарядка · 0 из 28     [28 дней] [Месяц]
● ● ● ● ● ● ● …   ← 27 красных точек «пропущено»
Тренировки за месяц                              0 ›
```

Раскрыв «Тренировки за месяц» — **«Нет тренировок за последние 30 дней»**
([heys_day_activity_v1.js:587](apps/web/heys_day_activity_v1.js:587)). Блока
«Кардио» нет вовсе.

### 6.2 День без активности у давнего клиента

То же самое, но календарь показывает реальную историю, а «Тренировки за месяц» —
накопленное число.

### 6.3 Есть шаги, нет тренировок

Заполненная полоса шагов и «N ккал · правка ползунком». Блок «Кардио»
по-прежнему **отсутствует**: `renderTrainingsBlock` возвращает `null`, когда нет
ни тренировок, ни быта
([heys_day_trainings_v1.js:3439](apps/web/heys_day_trainings_v1.js:3439)).

Пустого состояния «Нет тренировок» на этой вкладке не бывает: оно написано
только для режима `'all'`
([heys_day_trainings_v1.js:3448](apps/web/heys_day_trainings_v1.js:3448)), а
вкладка вызывает блок в режиме `'regular'`.

### 6.4 Программа куратора назначена на сегодня

Назначенный план — тренировка в `day.trainings` с `plan.status: 'assigned'` и
заполненным `workoutLog`. Она проходит `hasData`
([heys_day_picker_modals.js:61](apps/web/heys_day_picker_modals.js:61)) →
`visibleTrainings ≥ 1` → блок рендерится. Человек видит:

```
Кардио                                  не отмечено   ›
```

и всё: карточка плана — под чевроном. Калорий план не даёт (§4.1), поэтому
значение аккордеона именно «не отмечено».

### 6.5 Программа назначена на будущее, сегодня день отдыха

Строка «Следующая тренировка — завтра · Программа ›» живёт внутри того же
`regularTrainingsBlock`. Если сегодня нет ни тренировок, ни быта — блок `null`,
и **строка программы не появляется вообще**.

### 6.6 Программы нет

Ни строки, ни следа.

### 6.7 Read-only (триал истёк)

Сверху `Paywall.ReadOnlyBanner`
([heys_day_page_shell.js:374](apps/web/heys_day_page_shell.js:374)). Сама
вкладка не блокируется.

---

## 7. Действия

| Действие                             | Откуда                                                                           | Что открывается                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Записать тренировку                  | лист «Добавить активность» → «🏋️ Тренировка» (только при `visibleTrainings < 3`) | `openTrainingPicker(index)` — колесо времени, тип, минуты по зонам, оценки                                                      |
| Отметить зарядку                     | лист → «⚡ Зарядка», или строка «Зарядка · не отмечено»                          | шаг `morning_activation_followup`: «Сделал» / «Сделаю» / «Не сегодня» ([heys_steps_v1.js:5417](apps/web/heys_steps_v1.js:5417)) |
| Бытовая активность                   | лист → «🏠», или строка «не отмечено», или FAB «Активность»                      | шаг `household_minutes` ([heys_day_day_handlers.js:647](apps/web/heys_day_day_handlers.js:647))                                 |
| Разбор быта                          | тап по строке с минутами                                                         | шаг `household_stats` — «📊 Статистика активности»                                                                              |
| Правка шагов                         | ползунок под полосой                                                             | пишет `day.steps` на `touchend` ([heys_day_steps_ui.js:70](apps/web/heys_day_steps_ui.js:70))                                   |
| Голод и энергия                      | строка «Голод и энергия», или FAB                                                | `HungerEnergyStatusModal`                                                                                                       |
| Открыть программу                    | «Программа ›» внутри «Кардио»                                                    | полноэкранный `ProgramPathScreen`                                                                                               |
| Начать / перенести / пропустить план | `PlanCard` внутри «Кардио»                                                       | перенос **без согласования с куратором** ([heys_day_trainings_v1.js:3767](apps/web/heys_day_trainings_v1.js:3767))              |
| Принять / отклонить правку куратора  | `ProposalCard` внутри «Кардио»                                                   | перехватывает день, только пока нет ни одного закрытого подхода                                                                 |
| Вести подходы                        | «Открыть конструктор» / `SummaryCard`                                            | полноэкранный `StrengthBuilder`                                                                                                 |
| Удалить бытовую активность           | «×» на карточке внутри «Кардио»                                                  | с подтверждением и «Отменить» ([:3366](apps/web/heys_day_trainings_v1.js:3366))                                                 |
| Поправить прошлое                    | смена даты в капсуле                                                             | всё вышеперечисленное работает и на прошлой дате                                                                                |

### 7.1 Что делает куратор в чужом дневнике

Не с этой вкладки, а через MCP и панель:

- назначает программу и отдельные тренировки — пишет
  `training.plan = {status: 'assigned'}` + `planSnapshot` (passthrough полей —
  [heys_models_v1.js:924](apps/web/heys_models_v1.js:924));
- предлагает правку уже назначенной — `pendingPlanProposal`, клиент отвечает у
  себя на дне;
- правит шаги, добавляет и удаляет тренировки — прилетает клиенту баннером
  «Активность · N»
  ([heys_curator_actions_banner_v1.js:1272](apps/web/heys_curator_actions_banner_v1.js:1272))
  и подсвечивает элемент по
  `[data-curator-target="steps" | "training" | "activity"]`
  ([:200](apps/web/heys_curator_actions_banner_v1.js:200));
- **не может** отметить зарядку и править бытовую активность — таких адресов
  перехода в баннере нет.

---

## 8. Границы: где канон каждого числа

| Число                                                | Канон (единственный вычислитель)                                                                         | Кто ещё показывает                                                                        |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Расход, BMR, ккал шагов / быта / тренировок, оптимум | `HEYS.TDEE.calculate` — [heys_tdee_v1.js:242](apps/web/heys_tdee_v1.js:242)                              | Актив (hero + разбор), Питание (норма дня), Главная, Отчёты, недельная норма, зеркало MCP |
| Цель дня с поправкой                                 | `displayOptimum` — [heys_day_caloric_display_state.js:18](apps/web/heys_day_caloric_display_state.js:18) | Актив (hero), Питание, Главная                                                            |
| Шаги — сырое число                                   | `day.steps`                                                                                              | Актив (**единственная точка правки в приложении**), Главная, Отчёты, Инсайты              |
| **Цель шагов**                                       | `profile.stepsGoal` — **канона нет**, пять дефолтов (§9 G)                                               | Актив 7000, Отчёты 10000, Инсайты 8000                                                    |
| Зарядка — факт                                       | `day.morningActivation` + предикат, **продублированный в трёх файлах**                                   | Актив (строка + календарь), Отчёты (матрица дисциплины), утренний чек-ин, геймификация    |
| Тоннаж                                               | `TK.strength.trainingTonnage` / `dayTonnage`                                                             | подпись тренировки, экран «Тренировка завершена», зеркало MCP                             |
| Рост рабочих весов                                   | `HEYS.WorkingWeights.analyze`                                                                            | только карточка поправки нормы                                                            |
| Программа куратора                                   | `training.plan.status` в самих записях дня, не в индексе программы                                       | «Кардио» на Активе, экран «Программа»                                                     |

**Дублируется с другими зонами:** шаги (Главная + Отчёты), зарядка (Отчёты),
расход (норма дня в Питании и на Главной), голод и энергия (FAB + Питание +
Отчёты).

**Уникально для Актива:** минуты по зонам, структурный журнал упражнений,
календарь зарядки, список тренировок за месяц, программа куратора.

---

## 9. Сломано, обещано и не сделано

> **Закрыто 2026-08-30:** A, B, C, E, T. Правки и смоук —
> [§14](#14-закрытие-a-b-c-e-t-2026-08-30). Описания ниже оставлены как
> постановка: по ним писались тесты, и они объясняют, что именно было не так.
> Остальные пункты открыты.

### 9.1 Числа врут

**A. Всплывающая «формула» противоречит числу, из которого её открыли.** Чипы
зон и строка быта считают **нетто** (`kcalMin`, `netKcalPerMin`), а попапы
формулы — **брутто** (`kcalPerMin`):
[heys_day_training_popups_v1.js:118](apps/web/heys_day_training_popups_v1.js:118)
и [:194](apps/web/heys_day_training_popups_v1.js:194). Пример: 45 мин в Z2, вес
80 кг → чип «315 ккал», попап по тапу в тот же чип → «378 ккал». Сама
подписанная формула `минуты × MET × вес × 0.0175 − 1` неверна ни для одного из
двух вариантов: «−1» относится к MET, а не к произведению.

> Величина расхождения — `MET / (MET − 1)`, то есть у зон она разная: Z1 (2,5) —
> 1,67×, Z2 (6) — 1,2×, Z3 (8) — 1,14×, Z4 (10) — 1,11×. В первой редакции этого
> разбора пример по Z2 был посчитан по коэффициенту быта (1,67×) и назывался как
> «95 против 158»; верные числа — 315 против 378. Ошибку поймал смоук
> [activity-numbers-net-and-plan.test.js](apps/web/__tests__/activity-numbers-net-and-plan.test.js)
> при закрытии дефекта 2026-08-30.

**B. Ккал бытовой активности на одном экране расходятся в 1,67 раза.** Строка
яруса «Сегодня» показывает нетто из TDEE, а бейдж той же активности внутри
«Кардио» — брутто:
[heys_day_trainings_v1.js:4054](apps/web/heys_day_trainings_v1.js:4054). 60
минут при 80 кг: строка «126 ккал», бейдж «210 ккал».

**C. Третья тренировка не попадает в разбор.** `train3k` считается
([heys_day_tab_impl_v1.js:665](apps/web/heys_day_tab_impl_v1.js:665)) и входит в
`tdee`, но в карточку передаются только `train1k, train2k`
([:2258](apps/web/heys_day_tab_impl_v1.js:2258)), и
`cardioKcal = train1k + train2k`
([heys_day_activity_v1.js:268](apps/web/heys_day_activity_v1.js:268)). При трёх
тренировках строка «+ Тренировки» занижена, столбик разбора не сходится с
«Затратами», заголовок «Кардио» врёт. Дефект унаследован со stable.

**D. Разбор hero не приводит к числу над ним.** Цепочка кончается на «Дефицит
−15 %». Ни строки «Цель», ни строк «Долг» / «Загрузка» — а именно они и создают
разницу между `optimum` и показанным `displayOptimum`. В день с компенсацией
долга человек видит «Цель дня 2 210», раскрывает разбор и приходит к 1 940. На
stable строки `debt-row` / `refeed-row` / `formula-total` были — при
переписывании потеряны.

**E. «Тренировки за месяц» считает назначенное как сделанное.**
`isTrainingSlotUsedMonth` засчитывает любую запись с непустым `type`
([heys_day_activity_v1.js:37](apps/web/heys_day_activity_v1.js:37)), а
назначенный или пропущенный план — это `type: 'strength'`. В списке появляются
строки «0 ккал» за тренировки, которых не было.

**F. Окно «за месяц» привязано к сегодня, а не к выбранной дате** —
`parseISO(todayISO())`
([heys_day_activity_v1.js:174](apps/web/heys_day_activity_v1.js:174)). Листаешь
на 20 августа: hero и строки про 20-е, а «Тренировки за месяц» про последние 30
дней от сегодня.

**G. Цель шагов расходится между зонами.** `profile.stepsGoal` без значения
даёт:

| Зона                        | Дефолт | Где                                                                             |
| --------------------------- | ------ | ------------------------------------------------------------------------------- |
| Актив (ползунок)            | 7000   | [heys_day_steps_ui.js:13](apps/web/heys_day_steps_ui.js:13)                     |
| Отчёты, матрица дисциплины  | 10000  | [heys_discipline_matrix_v1.js:142](apps/web/heys_discipline_matrix_v1.js:142)   |
| `heys_status_v1.js`         | 10000  | [heys_status_v1.js:230](apps/web/heys_status_v1.js:230)                         |
| Онбординг шага «Цель шагов» | 10000  | [heys_steps_v1.js:3090](apps/web/heys_steps_v1.js:3090)                         |
| Плитка Главной              | 10000  | [widgets/widget_data.js:786](apps/web/widgets/widget_data.js:786)               |
| Инсайты                     | 8000   | [insights/pi_analytics_api.js:1563](apps/web/insights/pi_analytics_api.js:1563) |

Профиль в Отчётах читается сырым из LS
([heys_day_stats_v1.js:340](apps/web/heys_day_stats_v1.js:340)), поэтому 10000
там действительно применяется. Один и тот же день будет «в норме» в Отчётах и
«не в норме» на Активе.

### 9.2 Тексты обещают то, чего нет

**H. «Зарядка · N из 28» и красные точки у нового человека.**
`habitCalendarDisplayStatus` объявляет пропуском любой прошлый день без отметки
([heys_morning_activation_calendar_v1.js:170](apps/web/heys_morning_activation_calendar_v1.js:170))
— включая дни до установки приложения. Первый экран нового клиента: 27 красных
точек и «0 из 28».

**I. Переключатель «Месяц» в v4 ведёт в тупик.** Кнопки режима отрисованы, а
строка периода с названием месяца и стрелками `‹ ›` собрана в ветке
`!isActivityV4`
([heys_morning_activation_calendar_v1.js:307](apps/web/heys_morning_activation_calendar_v1.js:307)).
В v4 переключение на «Месяц» даёт сетку без подписи, какой это месяц, и без
возможности листать. Подпись остаётся «Зарядка · N из 30/31», а легенды
(«Сделано / Тренировкой / Пропущено») в v4 нет
([:412](apps/web/heys_morning_activation_calendar_v1.js:412)) — красная и серая
точки ничем не подписаны.

**J. Комментарий отрицает механику, которая работает.**
[heys_norm_correction_v1.js:659](apps/web/heys_norm_correction_v1.js:659) и
[:884](apps/web/heys_norm_correction_v1.js:884): «метрики роста рабочих весов в
проекте пока нет» — при том, что `HEYS.WorkingWeights` вызывается 20 строками
ниже.

**K. Подсказка «правка ползунком» без цели, которую можно поправить.** Число
цели рядом (`/ 10 000`) — просто текст: `openStepsGoalPicker` в v4 не подключён.
Правка цели осталась только в утреннем чек-ине и в быстром действии Инсайтов
([heys_day_tab_impl_v1.js:1185](apps/web/heys_day_tab_impl_v1.js:1185)).

**L. Оценка шагов по медиане не показана нигде — и на экране дня не
включается.** `resolveStepsInput` умеет подставлять медиану 14 дней (нужно ≥3
факта и хотя бы один факт за 90 дней) и возвращает флаги `stepsEstimated` /
`stepsMissing` ([heys_tdee_v1.js:168](apps/web/heys_tdee_v1.js:168)), но
`buildEnergyContext` их даже не пробрасывает
([heys_day_energy_context_v1.js:33](apps/web/heys_day_energy_context_v1.js:33)),
и ни один экран их не показывает. Хуже: на экране дня механизм вообще не
срабатывает — `ensureDay` приводит `steps` к `+d.steps || 0`
([heys_models_v1.js:820](apps/web/heys_models_v1.js:820)), а ветка оценки
включается только при `null`/`undefined`. Итог: у читателей, которые берут день
сырым (недельный TDEE, месячные отчёты, зеркало куратора), расход за тот же день
может отличаться от того, что видит человек.

### 9.3 Мёртвый код, который висит и опрашивает хранилище

**M. `chargeTrainingBlock` — самый дорогой из мёртвых.**
[heys_day_tab_impl_v1.js:1350](apps/web/heys_day_tab_impl_v1.js:1350) на каждой
смене тренировок целиком рендерит блок тренировок с фильтром
`morning_activation`, кладёт в ctx — и `ActivityTabV4` его не разбирает.
Результат выбрасывается.

**N. `kcalMin` не передаётся — вместо него пересчитывается весь TDEE.**
`ActivityTabV4` разбирает `kcalMin` из ctx
([heys_day_activity_v1.js:235](apps/web/heys_day_activity_v1.js:235)), но
`buildActivityCard` его туда не кладёт
([heys_day_activity_card_v1.js:45](apps/web/heys_day_activity_card_v1.js:45)) —
хотя в `heys_day_tab_impl_v1.js` он есть
([:673](apps/web/heys_day_tab_impl_v1.js:673)). Фолбэк вызывает
`HEYS.TDEE.calculate(day, prof)` **на каждый рендер вкладки**
([heys_day_activity_v1.js:255](apps/web/heys_day_activity_v1.js:255)) — чтение
localStorage, NDTE и цикл. Значение совпадает, поэтому дефект тихий.

**O. `readHungerSummary` читает хранилище на каждый рендер** — вызов не в
`useMemo` ([heys_day_activity_v1.js:265](apps/web/heys_day_activity_v1.js:265)),
а внутри — разбор всего массива событий и, при переполнении, запись обратно
([heys_hunger_energy_status_ui_v1.js:661](apps/web/heys_hunger_energy_status_ui_v1.js:661)).

**P. Вся ветка «причина пропуска зарядки» недостижима.** Она включается только
при `morningActivation.status === 'missed'`
([heys_morning_checkin_v1.js:571](apps/web/heys_morning_checkin_v1.js:571)), а
`'missed'` в продакшене **не пишет никто** — только тесты (проверено
`rg "status: 'missed'"`). Мертвы: список `MORNING_ACTIVATION_SKIP_REASONS`, шаг
`morning_activation_skip_reason`
([heys_steps_v1.js:5694](apps/web/heys_steps_v1.js:5694)), флаги
`skipReasonPending` / `skipReasonId`, ветка `'missed'` в календаре
([heys_morning_activation_calendar_v1.js:175](apps/web/heys_morning_activation_calendar_v1.js:175)).
Карточка «⚡ Зарядка · пропущено» на stable по той же причине никогда не
показывалась.

**Q. Календарь зарядки грузится дважды.** Он есть и в `postboot-3-ui-lazy`
([scripts/legacy-bundle-config.mjs:349](scripts/legacy-bundle-config.mjs:349)),
и отдельным `<script>` в
[heys_day_stats_bundle_loader_v1.js:11](apps/web/heys_day_stats_bundle_loader_v1.js:11).
Второй проход переопределяет `HEYS.morningActivationCalendar` → React видит
новый тип компонента → размонтирует и монтирует календарь заново. То же у
`heys_day_realdata_actions_v1.js` (три места сразу: `boot-day`,
`postboot-1-game-lazy`, загрузчик).

**R. `renderActivityCard` берёт `React` из глобала, а не из параметров** —
[heys_day_activity_v1.js:594](apps/web/heys_day_activity_v1.js:594). В браузере
работает, в изолированном тесте упадёт.

**S. Мёртвая константа** `MA_REPLACEMENT_FIRST_HALF_TRAINING`
([heys_day_activity_v1.js:7](apps/web/heys_day_activity_v1.js:7)) — объявлена,
не используется. Осталась от вырезанной карточки «тренировка вместо зарядки».

**T. Утечка структуры подхода в запасном пути.** `ensureWorkoutLogShape`
пересобирает подход в жёсткую форму `{id, weightKg, reps, done}` и упражнение из
фиксированного `base`
([heys_day_trainings_v1.js:3173](apps/web/heys_day_trainings_v1.js:3173)) —
`type: 'warmup'`, `drops[]`, `extraWeightKg`, `unit`, `bodyweightFactor` туда не
входят. Полноэкранный конструктор защищён: `onPatch` кладёт свой массив поверх
([:3666](apps/web/heys_day_trainings_v1.js:3666)). Но:

- `onPatchNote` ([:3682](apps/web/heys_day_trainings_v1.js:3682)) — правка
  заметки к тренировке **в самом конструкторе** записывает урезанные упражнения;
- `cloneExercisesForReplay` ([:709](apps/web/heys_day_trainings_v1.js:709)) —
  «повторить прошлую» теряет разминочные подходы и дропсеты;
- инлайновый список и автоэффекты старт/стоп
  ([:1162](apps/web/heys_day_trainings_v1.js:1162),
  [:3320](apps/web/heys_day_trainings_v1.js:3320)) — работают только когда
  полноэкранный конструктор не загрузился (`!fullscreenReady`,
  [:3869](apps/web/heys_day_trainings_v1.js:3869)), то есть в офлайне или при
  промахе кеша.

Последствие: разминка после такой правки начинает считаться в тоннаж, а
упражнение на своём весе — переставать.

---

## 10. Что решать дизайнеру

> **Закрыто 2026-08-30.** Все десять пунктов решены владельцем дизайна — см.
> [§13](#13-решения-2026-08-30). Список ниже оставлен как постановка вопросов,
> по которой решения принимались; читать его как открытый не нужно.

1. **«Кардио» — неправильное имя для того, что под ним лежит.** Под чевроном:
   программа куратора, назначенная силовая, предложение правки от куратора,
   силовые с журналом подходов, хобби, «Пальцы» и бытовая активность. Кардио —
   один из семи жильцов. Аккордеон свёрнут по умолчанию, а при пустом дне
   отсутствует вовсе, унося с собой строку «Следующая тренировка».
2. **Где живёт программа куратора.** Сейчас единственное, что человек видит про
   назначенную на сегодня тренировку — свёрнутая строка «Кардио · не отмечено».
3. **Разбор hero: до чего он должен доводить.** Цепочка кончается на проценте
   дефицита и не приходит к числу над ней. Нужны ли строки «Долг», «Загрузка»,
   «Цикл», «Цель» — и что делать, когда их несколько.
4. **Оценённые шаги.** Медиана вместо факта меняет норму дня; признак есть в
   движке, места на экране нет. Инвариант продукта требует, чтобы это было видно
   хотя бы пометкой.
5. **Пустой календарь зарядки.** 27 красных точек в первый день. Нужен горизонт:
   «до начала — серым» или окно от первой записи.
6. **Рост рабочих весов.** Метрика написана, но живёт в норме и говорит только
   «норму не трогаем». Место на вкладке про тренировки — вопрос к макету.
7. **Тоннаж на экране дня.** Сейчас только в подписи и в экране «Тренировка
   завершена». Нужен ли он в ярусе «Сегодня» — и какой: фактический или
   плановый.
8. **Цель шагов: 7000 или 10000.** Продуктовое решение, из которого чинится код.
9. **Правка цели шагов с вкладки** — вернуть или окончательно отдать чек-ину.
10. **Контракт.** Канвас без `[data-contract]` и без кадров `data-demo` не даёт
    ни чисел, ни геометрии, ни приёмочного листа — сводить экран с ним нельзя.
    Нужен контракт с числами и кадры на 375 px.

---

## 11. Что чинится кодом независимо от макета

| #    | Что                                                                                     | Где                                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A ✅ | Попапы «формулы» перевести на `netKcalPerMin`, исправить подписанную формулу            | [heys_day_training_popups_v1.js:118](apps/web/heys_day_training_popups_v1.js:118), [:194](apps/web/heys_day_training_popups_v1.js:194)     |
| B ✅ | Бейдж быта внутри блока тренировок — на нетто                                           | [heys_day_trainings_v1.js:4054](apps/web/heys_day_trainings_v1.js:4054)                                                                    |
| C ✅ | Пробросить `train3k` в карточку и в `cardioKcal`                                        | [heys_day_tab_impl_v1.js:2258](apps/web/heys_day_tab_impl_v1.js:2258), [heys_day_activity_v1.js:268](apps/web/heys_day_activity_v1.js:268) |
| E ✅ | Исключить `plan.status ∈ {assigned, skipped}` из списка тренировок за месяц             | [heys_day_activity_v1.js:37](apps/web/heys_day_activity_v1.js:37)                                                                          |
| F    | Якорить окно «за месяц» на выбранную дату                                               | [heys_day_activity_v1.js:174](apps/web/heys_day_activity_v1.js:174)                                                                        |
| G    | Свести дефолт `stepsGoal` к одному значению (после решения по п. 8)                     | шесть файлов, таблица в §9 G                                                                                                               |
| I    | Вернуть стрелки, подпись месяца и легенду в v4-раскладку календаря                      | [heys_morning_activation_calendar_v1.js:307](apps/web/heys_morning_activation_calendar_v1.js:307)                                          |
| J    | Обновить два устаревших комментария                                                     | [heys_norm_correction_v1.js:659](apps/web/heys_norm_correction_v1.js:659), [:884](apps/web/heys_norm_correction_v1.js:884)                 |
| M    | Убрать вычисление `chargeTrainingBlock` либо использовать его                           | [heys_day_tab_impl_v1.js:1350](apps/web/heys_day_tab_impl_v1.js:1350)                                                                      |
| N    | Передать `kcalMin` в `buildActivityCard`, снять фолбэк с полным TDEE                    | [heys_day_activity_card_v1.js:45](apps/web/heys_day_activity_card_v1.js:45)                                                                |
| O    | Обернуть `readHungerSummary` в `useMemo`                                                | [heys_day_activity_v1.js:265](apps/web/heys_day_activity_v1.js:265)                                                                        |
| P    | Снести мёртвую ветку причины пропуска либо начать писать `'missed'` (продуктовый выбор) | [heys_steps_v1.js:5694](apps/web/heys_steps_v1.js:5694), [heys_morning_checkin_v1.js:571](apps/web/heys_morning_checkin_v1.js:571)         |
| Q    | Убрать календарь из одного из двух путей загрузки                                       | [scripts/legacy-bundle-config.mjs:349](scripts/legacy-bundle-config.mjs:349)                                                               |
| R, S | `params.React` вместо глобала; убрать мёртвую константу                                 | [heys_day_activity_v1.js:594](apps/web/heys_day_activity_v1.js:594), [:7](apps/web/heys_day_activity_v1.js:7)                              |
| T ✅ | Сохранять `type` / `drops` / `extraWeightKg` / `unit` / `bodyweightFactor`              | [heys_day_trainings_v1.js:3173](apps/web/heys_day_trainings_v1.js:3173), [:709](apps/web/heys_day_trainings_v1.js:709)                     |

Из них **A, B, C, E, T** портят числа прямо сейчас и не зависят от того, каким
получится макет — их разумно закрыть до сведения экрана, чтобы приёмка не
зафиксировала неверные значения.

---

## 12. Как проверялись отрицательные выводы

По правилу `Diagnostics` из `CLAUDE.md` — каждый вывод «этого нет» подтверждён
двумя независимыми способами:

| Вывод                               | Способ 1                                                                            | Способ 2                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Контракта на зону нет               | `rg "data-contract"` по `tab-activity.v4.dc.html` — только скрипт аудита            | `node scripts/ui-v4-check-contract-drift.mjs --list` — зоны нет                     |
| `'missed'` в продакшене не пишется  | `rg "status: 'missed'"` — только `__tests__`                                        | чтение всех трёх вызовов `persistMorningActivationState`                            |
| v4-вкладки нет на stable            | `git merge-base --is-ancestor 3539fcda9 36df9ce3` → не предок                       | `git show 36df9ce3:apps/web/heys_day_activity_v1.js` — 490 строк формульной вкладки |
| `kcalMin` не передаётся             | сверка ключей `activityCtx` со списком деструктуризации в `ActivityTabV4`           | `rg "kcalMin" heys_day_activity_card_v1.js` — ни одного вхождения                   |
| `openStepsGoalPicker` не вызывается | `rg "openStepsGoalPicker" heys_day_activity_v1.js` — одна строка (деструктуризация) | чтение всех `onClick` файла                                                         |
| Файл не входит в бандл              | обход `LEGACY_BUNDLES` из `legacy-bundle-config.mjs` — не найден                    | найден в `scripts` загрузчика `heys_day_stats_bundle_loader_v1.js`                  |

---

## 13. Решения (2026-08-30)

Разбор снял главную неизвестность — канон `main`, а не stable, — и план
«восстановить снятое» отменён: восстанавливать нечего. Ниже решения владельца
дизайна по всем десяти развилкам §10 и ответы по двум вопросам к коду. Контракт
на зону пишется по этому разделу.

### 13.1 Решения по §10

| §10 | Решение                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | «Кардио» переименовать и разобрать по сущностям. Ярус «Сегодня» раскладывается на «Тренировки», «Бытовая активность», «Зарядка». Аккордеон остаётся только внутри «Тренировок» — для карточек с журналом. Пустой день блок не убивает: есть строка «Тренировок нет». |
| 2   | Программа куратора выходит из аккордеона наверх, отдельной строкой над ярусом «Сегодня». Назначенная на сегодня тренировка не может жить за свёрнутым чевроном со значением «не отмечено».                                                                           |
| 3   | Разбор hero обязан приходить к числу над ним. Цепочка кончается «Целью дня», а не процентом. Строки «Долг», «Загрузка», «Цикл» появляются, когда действуют, каждая своим знаком; порядок — порядок применения, как в попапе цели.                                    |
| 4   | Оценённые шаги помечаются обязательно, тем же приёмом, что «расчётный вес»: число с пометкой «оценка по медиане» и подпись, из чего. Меняет норму дня — значит человек это видит.                                                                                    |
| 5   | Календарь зарядки получает горизонт от первой записи. Дни до неё серые «не вели», не красные: 27 красных точек в первый день — не факт о человеке.                                                                                                                   |
| 6   | Рост рабочих весов выходит на вкладку, в ярус «История», рядом с календарём: «Рабочие веса · +4 % за 4 недели». В норме он остаётся доводом («норму не трогаем»), здесь становится фактом о тренировках — формулировка положительная.                                |
| 7   | Тоннаж — в ярус «Сегодня», **фактический** (по отмеченным подходам). Плановый показывается только внутри карточки силовой, где он про эту тренировку.                                                                                                                |
| 8   | Цель шагов — **10 000** (обоснование в 13.2).                                                                                                                                                                                                                        |
| 9   | Правка цели шагов **возвращается на вкладку** как правка плана дня (обоснование в 13.3).                                                                                                                                                                             |
| 10  | Контракт пишется после решений 8 и 9 и **после того, как закрыты A, B, C, E, T** (§11) — иначе приёмка зафиксирует неверные числа. Кадры на 375 px.                                                                                                                  |

### 13.2 Цель шагов — 10 000

Спор не «7000 против 10000», а «дефолт модели против константы движка, случайно
попавшей в эту роль».

- **Владелец поля объявляет 10 000:** `DEFAULT_PROFILE.stepsGoal = 10000`
  ([heys_user_v12.js:39](apps/web/heys_user_v12.js:39)) и санитайзер профиля
  `stepsGoal: пусто → 10000` ([:93](apps/web/heys_user_v12.js:93)); то же в
  [heys_user_tab_impl_v1.js:37](apps/web/heys_user_tab_impl_v1.js:37).
- **7000 — не дефолт, а `STEPS_GOAL_MIN`**
  ([heys_steps_v1.js:2812](apps/web/heys_steps_v1.js:2812)) — нижняя граница
  клампа рекомендации `[7000, 12000]`. Просочилась в дневной нормализатор
  `getProfile()` ([heys_day_utils.js:835](apps/web/heys_day_utils.js:835),
  [heys_core_v12.js:4613](apps/web/heys_core_v12.js:4613)), который выдумывает
  значение вместо того, чтобы отдавать поле как есть.
- **Миграция не нужна.** Ни один писатель профиля не сохраняет вывод
  `getProfile()` — все пишут поверх сырого объекта
  ([heys_steps_v1.js:3329](apps/web/heys_steps_v1.js:3329),
  [heys_norm_correction_v1.js:1158](apps/web/heys_norm_correction_v1.js:1158),
  [heys_consents_v1.js:606](apps/web/heys_consents_v1.js:606) и остальные).
  Смена литерала ничьё сохранённое значение не перепишет.

**Форма правки — не «заменить шесть литералов»:** владелец один
(`heys_user_v12`), нормализатор перестаёт выдумывать значение, читатели
спрашивают одну функцию. Заодно закрывается третий литерал 8000 в Инсайтах
([insights/pi_analytics_api.js:1563](apps/web/insights/pi_analytics_api.js:1563)),
который ни на чём не основан.

**Отдельно, литералом не чинится:**
[insights/pi_early_warning.js:2422](apps/web/insights/pi_early_warning.js:2422)
зовёт `calculateDayScore({ dayData })` вообще без профиля — там любой дефолт
применяется к чужой истории. Чинится передачей профиля.

### 13.3 Правка цели шагов — возвращается на вкладку

Формулировка «цель — настройка, а не действие дня» кодом не подтверждается:

- **Кнопка на вкладке никогда не была отдельным контролом:**
  `openStepsGoalPicker()` → `HEYS.showCheckin.steps()`
  ([heys_day_day_handlers.js:166](apps/web/heys_day_day_handlers.js:166)) — тот
  же шаг чек-ина. «Вернуть» = вернуть второй вход в тот же экран, а не завести
  настройку.
- **Поля «цель шагов» в Профиле нет вовсе** — только `DEFAULT_PROFILE` и
  санитайзер, ни одного input. Настройкой она нигде не живёт.
- **Это план на день:** шаг спрашивают каждое утро заново
  (`stepsGoalConfirmedDate` — дата, `needsStepsGoalCheckin` возвращает true
  везде, кроме сегодня —
  [heys_morning_checkin_v1.js:931](apps/web/heys_morning_checkin_v1.js:931)),
  рекомендация = медиана × 1,05 с клампом `[7000, 12000]` и модификаторами по
  сну, энергии и наличию тренировки
  ([heys_steps_v1.js:3072](apps/web/heys_steps_v1.js:3072)), а подпись под
  слайдером говорит прямо: «План на день — его видит куратор»
  ([:3067](apps/web/heys_steps_v1.js:3067)).
- **Если оставить только чек-ин:** пропустил утро — сегодняшний план не
  поставить ниоткуда, кроме быстрого действия в Инсайтах
  ([heys_day_tab_impl_v1.js:1185](apps/web/heys_day_tab_impl_v1.js:1185)).

**Решение:** тап по числу цели открывает тот же `showCheckin.steps`, рядом с
фактом. Подпись про правку остаётся и относится к обоим: ползунок правит факт,
тап по цели — план.

**Починка по дороге:** `showCheckin.steps` — единственный из `showCheckin.*`,
кто не передаёт `context: { dateKey }`
([heys_morning_checkin_v1.js:2941](apps/web/heys_morning_checkin_v1.js:2941)),
поэтому с прошлой даты он ставит план сегодняшнему дню. Вход остаётся — дату
надо передать.

### 13.4 Уточнения к решениям (проверено по коду)

| §10 | Уточнение                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | Наверх выходят **три разных элемента**, не один: строка «Следующая тренировка — … · Программа ›» ([heys_day_trainings_v1.js:2768](apps/web/heys_day_trainings_v1.js:2768)), карточка назначенного плана `PlanCard` ([:3748](apps/web/heys_day_trainings_v1.js:3748)) и `ProposalCard` — правка куратора, перехватывающая день ([:3716](apps/web/heys_day_trainings_v1.js:3716)). Строка и `PlanCard` взаимоисключающие: строка прячется, когда план на сегодня есть. |
| 3   | «Несколько сразу» почти невозможно: долг / снижение / загрузка — это `if / else if / else` ([heys_day_caloric_display_state.js:18](apps/web/heys_day_caloric_display_state.js:18)), одновременно ровно одна. Цикл — множитель **внутри** `optimum`, до всех трёх ([heys_tdee_v1.js:379](apps/web/heys_tdee_v1.js:379)). Итого максимум две строки поправки, порядок фиксирован: цикл → одна из трёх → Цель.                                                          |
| 4   | Пометку сейчас ставить не на чем: на экране дня механизм оценки **не срабатывает никогда** (§9 L). Сначала правка L, потом пометка — иначе рисуется состояние, которого не бывает.                                                                                                                                                                                                                                                                                   |
| 6   | Пустых состояния два, и по смыслу разных: `short_window` — меньше 14 дней с данными ([heys_working_weights_v1.js:105](apps/web/heys_working_weights_v1.js:105)); `no_shared_exercises` — сменил программу, сравнивать нечего ([:126](apps/web/heys_working_weights_v1.js:126)). Второе нельзя показывать как «не растут» — это прямо оговорено в коде.                                                                                                               |
| 7   | Предусловие: `computeDayTotalTonnage` не передаёт `bodyWeightKg` ([heys_day_trainings_v1.js:639](apps/web/heys_day_trainings_v1.js:639)), поэтому упражнения на своём весе дают ноль. Пока не починено, число в ярусе «Сегодня» будет расходиться с тем же числом в конструкторе, который вес передаёт ([strength/heys_strength_builder_ui_v1.js:113](apps/web/strength/heys_strength_builder_ui_v1.js:113)).                                                        |

Пункты 1, 5, 10 по коду проходят без оговорок.

### 13.5 Порядок работ

1. Дефекты **A, B, C, E, T** (§11) — числа, которые врут сейчас; закрываются до
   контракта, чтобы приёмка не зафиксировала неверные значения.
2. **L** (§9) — предусловие решения 4: без него помечать нечего.
3. **Предусловие решения 7** — `bodyWeightKg` в `computeDayTotalTonnage`.
4. Контракт с числами и кадры на 375 px.
5. Сведение экрана и тест сверки — по правилу «Сведение экрана с канвасом» из
   `CLAUDE.md`: задача заканчивается своим тестом сверки, а не начинается с
   него.

Правки по этому списку выполняются по отдельной команде: на 2026-08-30 ни один
из перечисленных дефектов не тронут — документ фиксирует решение, а не факт
починки.

---

## 14. Закрытие A, B, C, E, T (2026-08-30)

Первый пункт §13.5: числа, которые врут сейчас, закрыты до контракта, чтобы
приёмка не зафиксировала неверные значения. Один проход, пять дефектов.

### 14.1 Что изменилось

| Дефект | Правка                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A**  | Попап зоны берёт цену минуты из того же массива `kcalMin`, по которому считает чип; попап быта — из `HEYS.TDEE.netKcalPerMin` с локальным фолбэком. Подпись формулы переписана на `минуты × (MET − 1) × вес × 0.0175`. Хелперы `netKcalPerMin` / `netFormulaExpression` — [heys_day_training_popups_v1.js:30](apps/web/heys_day_training_popups_v1.js:30).                                                                           |
| **B**  | Бейдж бытовой активности внутри блока тренировок считает нетто: `householdNetKcalPerMin` — [heys_day_trainings_v1.js:16](apps/web/heys_day_trainings_v1.js:16), вызов на строке бейджа.                                                                                                                                                                                                                                              |
| **C**  | `train3k` проброшен от `energyCtx` до `cardioKcal`: [heys_day_tab_impl_v1.js](apps/web/heys_day_tab_impl_v1.js) (вызов `buildActivityCard` и deps мемо), [heys_day_activity_card_v1.js](apps/web/heys_day_activity_card_v1.js) (параметр и ctx), [heys_day_activity_v1.js](apps/web/heys_day_activity_v1.js) (деструктуризация и сумма).                                                                                             |
| **E**  | `isTrainingSlotUsedMonth` отсеивает назначенное куратором через канонический `TK.load.isNotPerformedTraining` с локальным фолбэком по тому же списку статусов (`assigned`, `skipped`, `moved`) — [heys_day_activity_v1.js:37](apps/web/heys_day_activity_v1.js:37).                                                                                                                                                                  |
| **T**  | Пересборка журнала переносит поля, от которых зависит тоннаж: `carryApproachSnapshotFields` (тип разминки, сбросы, довес, время, метры; отметка боли — только при правке того же подхода) и `carryExerciseSnapshotFields` (единица, коэффициент своего веса, группы мышц, id справочника) — [heys_day_trainings_v1.js:16](apps/web/heys_day_trainings_v1.js:16). Подключены в `ensureWorkoutLogShape` и в `cloneExercisesForReplay`. |

Списки переносимых полей зеркалят `TK.strength.normalizeApproach` и
`exerciseMeta.snapshot` — расходиться им нельзя, иначе тоннаж на дне и в
конструкторе разъедется снова.

### 14.2 Чем подтверждено

Смоук
[activity-numbers-net-and-plan.test.js](apps/web/__tests__/activity-numbers-net-and-plan.test.js)
— 16 сценариев, `npx vitest run` зелёный:

- **A** — попап зоны приходит к числу чипа (315, не 378 брутто); подпись
  содержит `(MET − 1)`; попап быта даёт 126, не 210; отдельный сценарий на
  фолбэк без загруженного `HEYS.TDEE`.
- **B** — бейдж быта в отрисованном блоке равен `householdKcal` из TDEE; строки
  «210 ккал» на экране нет.
- **C** — заголовок «Кардио» и строка «+ Тренировки» в раскрытом разборе дают
  190 при слотах 100 / 50 / 40; при пустом третьем слоте поведение прежнее.
- **E** — `assigned` / `skipped` / `moved` отсеяны, выполненное осталось;
  проверено и с загруженным ядром, и на фолбэке.
- **T** — тип разминки, сбросы, довес и снимок справочника переживают
  пересборку; тоннаж до и после равен (980 кг, разминка вне счёта); «повторить
  прошлую» сохраняет состав, но сбрасывает отметки и не тащит отметку боли;
  отдельная проверка, что `ensureWorkoutLogShape` действительно зовёт оба
  переносчика.

Соседние наборы прогнаны и зелёные (119 тестов): `activity-v4-structure`,
`program-week-overview`, `kernel-strength*`, `strength-builder-ui`,
`morning-activation-training-delete`, `training-card-strength-hr-zones`,
`training-plan-expenditure`, `home-tab-activity`.

### 14.3 Исправление в самом разборе

Пример дефекта A в первой редакции был посчитан неверно: расхождение нетто и
брутто равно `MET / (MET − 1)` и у зон разное, а для Z2 было взято 1,67× от
быта. Верные числа — 315 против 378, а не 95 против 158; величина быта (126
против 210) была верна. Ошибку поймал смоук при закрытии дефекта; §9 A
исправлен.

### 14.4 Найдено по ходу, не чинилось

`mainBlock` — второй мёртвый блок того же класса, что `chargeTrainingBlock` (§9
M): собирается на каждом рендере дня
([heys_day_tab_impl_v1.js:1298](apps/web/heys_day_tab_impl_v1.js:1298)) и не
рендерится нигде — единственное упоминание в коде это его собственное
присваивание. В нём живёт та же арифметика `train1k + train2k` без третьего
слота, что и в дефекте C, поэтому чинить её там смысла нет: блок надо удалять
целиком, и это отдельная задача.

### 14.5 Что осталось из §13.5

Пункты 2–5 не начаты: **L** (предусловие пометки оценённых шагов),
`bodyWeightKg` в `computeDayTotalTonnage` (предусловие тоннажа в ярусе
«Сегодня»), контракт с кадрами на 375 px, сведение экрана с тестом сверки.
