# Relapse Risk Score v1 — implementation brief

> Repo: `HEYS-v2` Date: 2026-03-19 Language: ответы/обсуждение на русском, код
> на английском.

## Цель

Спроектировать и внедрить новую аналитическую сущность **Relapse Risk Score v1**
как предиктор риска:

- переедания;
- срыва по калориям;
- тяги к вредной / hyperpalatable / ultra-processed еде;
- вечернего loss-of-control eating;
- компенсационного поведения после недоедания / стресса / недосыпа.

Новая метрика должна **дополнять**, а не заменять:

- `dayScore` (0-10) — subjective/emotional day score;
- `Status Score` (0-100) — daily quality/compliance score.

## Продуктовая гипотеза

Сейчас в системе есть:

1. `dayScore` — хорошо отражает субъективное состояние дня;
2. `Status Score` — хорошо отражает качество дня по режиму и базовым health
   factors.

Но для практического сценария **"каков риск срыва / переедания в ближайшие часы
или сегодня вечером"** нужен отдельный score.

### Новая роль `Relapse Risk Score`

Он должен отвечать на вопрос:

> Насколько высок риск, что пользователь в ближайшее время сорвётся на калории,
> вредную еду, сладкое, hyperpalatable food или компенсаторное переедание?

## Что считать источником истины

### Уже существующие сущности

- `dayScore` — не удалять, а сохранить как subjective layer;
- `Status Score` — не удалять, а сохранить как daily quality layer;
- существующие risk/emotional/cascade/crash pieces использовать как источники
  идей и факторов.

### Новая целевая архитектура

Система должна стать 3-слойной:

1. **Subjective layer** → `dayScore`
2. **Compliance layer** → `Status Score`
3. **Predictive layer** → `Relapse Risk Score`

## Что должно войти в `Relapse Risk Score v1`

Минимально ожидаемые факторы риска:

### 1. Stress burden

Использовать:

- `stressAvg`
- high stress today
- recent stress streak / EMA stress if available
- рост стресса к вечеру

### 2. Sleep debt / recovery depletion

Использовать:

- текущий недосып
- плохой сон / low sleep quality
- повторяющийся недосып 2-3+ дней

### 3. Restriction pressure

Использовать:

- сильный недобор калорий сегодня;
- хронический недобор за 3-5 дней;
- поздний недобор к вечеру;
- недобор белка / сытости;
- long gaps between meals.

### 4. Food reward exposure

Использовать:

- высокий `harm`;
- simple carbs overload;
- sugar + fat style exposure если можно вывести;
- ultra-processed / hyperpalatable heuristics по доступным полям;
- вечернее употребление reward foods.

### 5. Time-of-day / behavior context

Использовать:

- вечер / поздний вечер;
- weekend / Friday-social trigger;
- длинное окно без еды;
- late meal + high stress + underfeeding combo.

### 6. Emotional vulnerability

Использовать как минимум:

- `dayScore` как слабый secondary signal;
- low mood / low wellbeing;
- mismatch: низкий `dayScore` + высокий стресс + недоедание.

## Что НЕ делать

- Не объединять `dayScore`, `Status Score` и `Relapse Risk Score` в один общий
  score.
- Не делать black box без explainability.
- Не делать ML/AI prediction без хорошего rule-based baseline.
- Не опираться только на calories или только на mood.
- Не дублировать полностью существующий crash risk один в один.

## Целевой output новой метрики

Нужна структура примерно такого вида:

```js
{
  score: 0-100,
  level: 'low' | 'guarded' | 'elevated' | 'high' | 'critical',
  confidence: 0-100,
  primaryDrivers: [
    { id, label, impact, direction, explanation }
  ],
  protectiveFactors: [
    { id, label, impact, explanation }
  ],
  windows: {
    next3h: number,
    tonight: number,
    next24h: number
  },
  recommendations: [
    { id, text, priority, type }
  ],
  debug: {
    stressComponent,
    sleepComponent,
    restrictionComponent,
    rewardFoodComponent,
    timingComponent,
    emotionalComponent
  }
}
```

## Предлагаемая шкала уровней

- `0-19` → `low`
- `20-39` → `guarded`
- `40-59` → `elevated`
- `60-79` → `high`
- `80-100` → `critical`

Сделать границы конфигурируемыми.

## Что доработать в существующих оценках

### A. `dayScore`

Нужно усилить как subjective analytics layer:

- хранить raw precision (не только округлённое значение);
- оставить UI round для display;
- добавить optional derived metrics:
  - delta vs morning;
  - delta vs yesterday;
  - intraday volatility;
  - trend over day;
- не перегружать `dayScore`, не делать из него predictor срыва.

### B. `Status Score`

Нужно усилить как compliance/quality layer:

- сохранить роль daily quality score;
- по возможности смягчить слишком жёсткие пороговые переходы;
- подумать над semi-continuous scoring вместо только bucket logic;
- улучшить explainability breakdown;
- НЕ превращать его в emotional risk metric;
- отдельно подумать, стоит ли добавить weak nutrition-quality signals (`harm`,
  UPF proxy) без ломки смысла score.

## Где внедрить `Relapse Risk Score`

### 1. Insights

Добавить в инсайты как полноценный блок риска срыва:

- score + level;
- top-3 драйвера риска;
- protective factors;
- practical next step;
- отдельный визуальный акцент на `tonight risk`.

### 2. Widget

Сделать отдельный виджет:

- компактный;
- visually strong;
- понятный за 1 секунду;
- с short explanation;
- опционально micro / standard variants.

### 3. Advice integration

Использовать для триггера советов:

- anti-binge interventions;
- recovery suggestions;
- evening rescue prompts;
- “не дожимай дефицит” type advice;
- “сейчас лучше safe meal, а не сладкое” type advice.

## Ожидаемые UX-принципы

- Не токсичный tone of voice.
- Не стыдить пользователя за риск срыва.
- Делать акцент на управляемость и профилактику.
- Объяснять причинность: **почему риск вырос именно сегодня**.
- Показывать защитные факторы, а не только негатив.

## Что проверить в кодовой базе

При реализации обязательно проверить и использовать, где уместно:

- текущий `dayScore` pipeline;
- `Status Score` module;
- crash risk / emotional risk / cascade / EWS pieces;
- emotional advice rules;
- widgets data providers + widget UI;
- insights dashboard / cards;
- history-based analytics;
- places where there is API mismatch or naming drift.

## Отдельный audit focus

Во время реализации проверить:

1. нет ли дублирующей risk-логики в нескольких модулях;
2. нет ли несоответствия API exports/imports;
3. можно ли переиспользовать существующие factors вместо копипасты;
4. где лучше хранить canonical config / thresholds / weights;
5. как сделать score explainable и testable.

### Audit findings, которые обязательно учесть в реализации

Ниже — важные выводы из предварительного аудита, которые нельзя потерять при
кодинге.

#### 1. `dayScore` в коде шире, чем в части документации

Фактический код считает `dayScore` не только из утреннего чек-ина, а из:

- утренних оценок;
- оценок приёмов пищи;
- оценок тренировок.

Следствие:

- при рефакторинге нельзя опираться только на старые doc-формулировки;
- source of truth для `dayScore` — текущий runtime code path;
- после внедрения новой системы нужно обновить docs, если они расходятся с
  кодом.

#### 2. `stressAvg` — центральный мост между несколькими системами

По аудиту именно `stressAvg` сильнее всего связан сразу с несколькими слоями:

- `dayScore`;
- `Status Score`;
- emotional risk;
- crash risk;
- predictive / binge-like logic.

Следствие:

- `stressAvg` должен рассматриваться как first-class canonical input;
- любые изменения в его сборе, шкале или fallback-логике нужно проверять across
  modules;
- при добавлении `Relapse Risk Score` не делать параллельный “альтернативный
  стресс”, если можно переиспользовать текущий canonical signal.

#### 3. У существующих risk-систем уже есть overlap

В проекте уже есть куски логики, связанные со срывом/риском:

- emotional risk;
- crash risk;
- cascade-like logic;
- EWS warnings;
- части predictive insights.

Следствие:

- новая система не должна быть ещё одной изолированной параллельной risk-веткой;
- нужно сначала построить карту reuse/ownership;
- желательно определить, какой модуль станет canonical source для relapse/binge
  risk, а какие будут consumer layers.

#### 4. Есть подозрение на API drift в `Status Score`

По аудиту встречается несогласованность:

- в живом модуле экспортируется `HEYS.Status.calculateStatus`;
- в части кода/legacy references может ожидаться `HEYS.Status.calculate`.

Следствие:

- при реализации обязательно проверить фактические consumers;
- если drift подтвердится — либо выровнять вызовы, либо добавить безопасный
  compatibility alias;
- этот пункт важен, чтобы не унаследовать тихо ломающийся fallback в
  аналитике/EWS.

#### 5. `Status Score` не должен быть переосмыслен как predictor of relapse

По аудиту это хороший daily quality/compliance score, но слабый прямой predictor
binge/relapse risk.

Следствие:

- не пытаться “допихнуть” relapse semantics в сам `Status Score`;
- допускается мягкое улучшение explainability / smoothness / weak food-quality
  signals;
- но predictive role должна жить в отдельном `Relapse Risk Score`.

#### 6. `dayScore` не должен доминировать в новой predictive модели

По аудиту `dayScore` полезен как emotional context, но сам по себе не видит:

- chronic restriction;
- reward-food exposure;
- aggressive evening underfeeding;
- many-day patterns.

Следствие:

- `dayScore` использовать как secondary / contextual signal;
- не позволять низкому `dayScore` в одиночку разгонять риск до экстремальных
  значений;
- особенно внимательно валидировать это тест-кейсами.

#### 7. Валидация должна идти по жизненным сценариям, а не только по формуле

Нужно проверять модель не только “математически”, но и на realistic cases:

- высокий стресс + недосып + вечерний недобор;
- хороший день по субъективным ощущениям, но сильный restriction pressure;
- плохой `dayScore`, но хороший сон и нормальная структура питания;
- Friday/weekend + reward exposure.

Следствие:

- при реализации нужен scenario-based validation набор;
- если формула даёт неинтуитивные results, нужно калибровать веса/thresholds, а
  не защищать модель любой ценой.

#### 8. После реализации нужно обновить документацию score-систем

В рамках задачи желательно не оставить knowledge split между кодом и docs.

Минимум проверить и при необходимости обновить:

- `SCORING_REFERENCE.md`;
- `DATA_MODEL_REFERENCE.md` / `DATA_MODEL_ANALYTICS.md`;
- внутренние task/docs по score systems.

#### 9. Не забыть про persistence / sync / merge implications

Если в рамках задачи будут добавляться новые поля вроде:

- `dayScoreRaw`
- `emotionalDrift`
- `emotionalVolatility`
- cached relapse risk snapshots

нужно заранее решить:

- являются ли они canonical persisted data или derived runtime data;
- нужно ли хранить их в `DayRecord`;
- как они поведут себя в cloud merge / sync / older clients;
- не создадут ли лишние конфликты в `updatedAt`/merge semantics.

Предпочтительный baseline:

- всё, что можно, держать как **derived / computed data**;
- новые persisted поля добавлять только если есть ясная продуктовая причина;
- при persistence-изменениях отдельно проверить sync/storage docs и merge
  behavior.

#### 10. После внедрения нужна калибровка на реальных сценариях

Даже хороший baseline score после первого внедрения потребует настройки.

Нужно заранее предусмотреть:

- возможность быстро менять thresholds/weights;
- debug output для сравнения сценариев;
- простую таблицу expected scenarios → expected score band;
- post-implementation review: где модель переоценивает/недооценивает риск.

Минимальный practical goal:

- модель не должна быть идеальной “научно”;
- она должна быть **устойчиво полезной, объяснимой и интуитивно правдоподобной**
  в реальных кейсах.

## Этапы реализации

### Phase 1 — audit and design

- inventory текущих score/risk систем;
- map existing factors and overlaps;
- final formula proposal for `Relapse Risk Score v1`;
- decide API + storage + usage points.

Статус: **done in current branch**.

### Phase 2 — core engine

- создать новый модуль score calculation;
- вынести config / thresholds / weights;
- сделать explainable output;
- добавить unit-friendly pure functions.

Статус: **done in current branch**.

### Phase 3 — insights integration

- внедрить в Insights;
- показать level / drivers / recommendations;
- не ломать existing dashboards.

Статус: **done in current branch**.

### Phase 4 — widget

- отдельный widget type;
- data provider;
- compact and standard UI.

Статус: **done in current branch**.

### Phase 5 — advice usage

- подключить risk score к advice prioritization;
- добавить preventive rescue advice rules.

### Phase 6 — refinement of old scores (follow-up, not first run)

- доработать `dayScore` как subjective layer;
- доработать `Status Score` как compliance layer;
- избежать смешения ролей.

## Статус текущей реализации (2026-03-19)

Уже сделано в текущей ветке:

- добавлен core engine `apps/web/heys_relapse_risk_v1.js`;
- экспортирован namespace `HEYS.RelapseRisk` с `calculate()` и test-friendly
  `__private` helpers;
- добавлены unit tests: `apps/web/__tests__/heys_relapse_risk.test.js`;
- модуль зарегистрирован в `scripts/legacy-bundle-config.mjs`;
- выполнен полный legacy rebuild после изменения bundle config;
- подтверждено попадание модуля в `postboot-1-game.bundle.d19a0f78cbfc.js`;
- обновлены `apps/web/bundle-manifest.json` и `apps/web/index.html` на новый
  hash `d19a0f78cbfc`.
- `HEYS.RelapseRisk.calculate()` встроен в
  `apps/web/insights/pi_ui_dashboard.js` как canonical source для Insights risk
  layer;
- динамический priority для секции `CRASH_RISK` теперь получает реальный
  `relapseRisk.score`, а не fallback-only warnings;
- `MetabolicQuickStatus` переведён с ad-hoc emotional risk на canonical relapse
  risk engine;
- выполнен selective rebuild Insights bundle;
- подтверждено обновление `postboot-2-insights.bundle.dbea60c44a67.js` в
  `apps/web/public/`, `apps/web/bundle-manifest.json` и `apps/web/index.html`.
- добавлен отдельный widget type `relapseRisk` в widget registry, без подмены
  существующего EWS-виджета `crashRisk`;
- в `apps/web/heys_widgets_data_v1.js` добавлен widget data provider, который
  использует canonical `HEYS.RelapseRisk.calculate()` и собирает current day +
  recent history;
- в `apps/web/heys_widgets_ui_v1.js` добавлен `RelapseRiskWidgetContent`,
  собранный по тому же принципу, что и `calories`: центральный KPI + нижний
  info-bar для `2x2` и компактный progress layout для wide/short размеров;
- `2x2` вариант дополирован до Insights-style speedometer: вместо локального
  gauge теперь используется тот же полукруглый visual language, что и в
  crash-risk секции Insights; убран явный hint про tap details;
- explainability modal для relapse risk обновлён до premium-вида: hero со
  speedometer, summary cards, equation strip и более согласованные section
  cards, без изменения canonical relapse logic;
- добавлены и обновлены стили widget dashboard для `relapseRisk`;
- выполнен selective rebuild widgets bundle;
- подтверждено обновление `postboot-3-ui.bundle.51cbc0cea45a.js` в
  `apps/web/public/`, `apps/web/bundle-manifest.json` и `apps/web/index.html`;
- выполнена browser verification для runtime-sensitive widget/modal changes:
  `localhost:3001` реально загрузил `postboot-3-ui.bundle.51cbc0cea45a.js` в
  `script[src]` (локальная страница была на auth screen, поэтому browser-check
  ограничился runtime asset verification, а не визуальным проходом внутри
  widgets tab).

Следующий практический шаг:

- advice wiring без повторного переписывания core engine.

## Критерии качества

Результат должен быть:

- scientifically plausible;
- product-useful;
- explainable;
- psychologically safe;
- modular;
- reusable in Insights / widgets / advice;
- easy to debug;
- easy to extend later with personalization.

## Желательные артефакты результата

1. новый модуль `Relapse Risk Score v1`;
2. интеграция в Insights;
3. отдельный виджет риска;
4. обновлённая карта score-систем;
5. точечные улучшения `dayScore` и `Status Score` (follow-up после стабилизации
   core engine);
6. документация по смыслу каждой оценки.

## Техническое ТЗ v2 — предлагаемая реализация

Ниже — не догма, а **recommended baseline design**, от которого удобно
стартовать в коде.

### 1. Семантика трёх score-систем

| Score                | Роль                          | Горизонт                     | Главный вопрос                         |
| -------------------- | ----------------------------- | ---------------------------- | -------------------------------------- |
| `dayScore`           | subjective state              | текущий день                 | как я себя чувствую?                   |
| `Status Score`       | daily quality / compliance    | текущий день                 | насколько день качественный по режиму? |
| `Relapse Risk Score` | predictive binge/relapse risk | ближайшие часы / вечер / 24ч | насколько вероятен срыв?               |

### 2. Предлагаемая формула `Relapse Risk Score v1`

#### Общий принцип

Score собирается как explainable composite из 6 компонентов:

```text
RelapseRisk = clamp(
  StressLoad
  + SleepDebt
  + RestrictionPressure
  + RewardExposure
  + TimingContext
  + EmotionalVulnerability
  - ProtectiveBuffer,
0, 100)
```

Каждый компонент должен быть рассчитан как число `0..100`, после чего
переводиться в вклад в итоговую сумму через весовой коэффициент.

#### Предлагаемые веса baseline v1

| Компонент                | Вес | Почему                                                                  |
| ------------------------ | --: | ----------------------------------------------------------------------- |
| `stressLoad`             | 24% | самый сильный и прямой драйвер эмоционального eating                    |
| `sleepDebt`              | 18% | недосып устойчиво связан с hunger/reward dysregulation                  |
| `restrictionPressure`    | 22% | хроническое недоедание и вечерний недобор — сильные триггеры срыва      |
| `rewardExposure`         | 16% | hyperpalatable / вредная еда подталкивает к loss of control             |
| `timingContext`          | 10% | вечер, длинные окна голода, weekend context                             |
| `emotionalVulnerability` | 10% | low `dayScore`, low mood, low wellbeing как вторичный уязвимый контекст |

Итого: `100%`

### 3. Предлагаемая детализация компонентов

#### A. `stressLoad` (0-100)

Источники:

- `day.stressAvg`
- rolling recent stress (3-7 дней)
- optional EMA stress
- rise-to-evening heuristic if available

Baseline:

```text
stressBase = mapStressAvg(day.stressAvg)
stressTrendBonus = recentStressEMA > threshold ? +10..20 : 0
stressLoad = clamp(stressBase + stressTrendBonus, 0, 100)
```

Пример порогов:

| `stressAvg` | `stressBase` |
| ----------- | -----------: |
| `0-2.9`     |            5 |
| `3-4.9`     |           25 |
| `5-6.4`     |           50 |
| `6.5-7.9`   |           75 |
| `8+`        |           90 |

#### B. `sleepDebt` (0-100)

Источники:

- текущий sleep debt
- `sleepQuality`
- recent sleep debt streak

Baseline:

```text
sleepDebtHours = max(0, sleepNorm - actualSleep)
sleepDebtScore = mapSleepDebt(sleepDebtHours)
sleepQualityPenalty = low sleep quality ? +0..20 : 0
sleepStreakPenalty = repeated undersleep ? +0..20 : 0
sleepDebt = clamp(sleepDebtScore + sleepQualityPenalty + sleepStreakPenalty, 0, 100)
```

#### C. `restrictionPressure` (0-100)

Это один из главных компонентов.

Источники:

- сильный текущий недобор калорий
- вечерний недобор
- chronic deficit streak 3-5 days
- низкий белок / low satiety proxy
- long fasting gaps

Baseline:

```text
currentUndereating = score from kcalPct vs target
eveningUndereatingBonus = if hour >= 18 and kcalPct too low
proteinUndershootBonus = if protein ratio low
chronicRestrictionBonus = based on 3-5 day pattern
gapPenalty = long gap since last meal

restrictionPressure = clamp(sum, 0, 100)
```

#### D. `rewardExposure` (0-100)

Источники:

- `dayTot.harm`
- simple carbs overload
- late reward food exposure
- optional heuristic for sugar+fat / UPF / hyperpalatable combos

Baseline:

```text
harmScore = mapHarm(dayTot.harm)
simpleCarbPenalty = mapSimpleCarb(simplePct or grams)
lateRewardBonus = if evening + high simple/harm
comboBonus = if high simple + high fat/harm

rewardExposure = clamp(sum, 0, 100)
```

#### E. `timingContext` (0-100)

Источники:

- hour of day
- long gap since meal
- late evening
- Friday/weekend
- underfed + late combo

Это не основной драйвер, а **context amplifier**.

#### F. `emotionalVulnerability` (0-100)

Источники:

- `dayScore`
- `moodAvg`
- `wellbeingAvg`
- mismatch between low subjective state and underfed/high stress state

Важно: этот компонент должен быть **secondary**, а не главным.

### 4. Protective buffer

Нужен отдельный слой защитных факторов, чтобы score не был односторонне
“карательным”.

Источники protective factors:

- хороший сон
- достаточное питание к вечеру
- нормальный белок
- low stress
- наличие structured meals
- хорошая вода
- наличие прогулки / training / routine stabilizer

Baseline:

```text
protectiveBuffer = min(30, sum(protective bonuses))
```

Рекомендуемый потолок защиты — не больше `25-30`, чтобы protective factors не
маскировали тяжёлые риски полностью.

### 5. Окна прогноза

Новый score должен уметь возвращать не только общий риск, но и **temporal
windows**:

#### `next3h`

Больше зависит от:

- stress right now
- long gap
- evening timing
- reward exposure already today

#### `tonight`

Главное окно риска.

Больше зависит от:

- вечерний недобор
- стресс
- недосып
- reward-food exposure
- Friday/weekend

#### `next24h`

Больше зависит от:

- chronic restriction
- repeated sleep debt
- high recent stress load
- recent volatility

### 6. Предлагаемая итоговая шкала

| Диапазон | Level      | Смысл              | UI тон                          |
| -------- | ---------- | ------------------ | ------------------------------- |
| `0-19`   | `low`      | риск низкий        | спокойный                       |
| `20-39`  | `guarded`  | есть уязвимость    | профилактический                |
| `40-59`  | `elevated` | заметный риск      | собранный, поддерживающий       |
| `60-79`  | `high`     | высокий риск       | intervention-focused            |
| `80-100` | `critical` | очень высокий риск | rescue mode, но без токсичности |

### 7. Confidence score

Нужно возвращать `confidence`, чтобы честно показывать качество предсказания.

Пример факторов confidence:

- есть ли `stressAvg`
- есть ли сон
- есть ли данные о еде / приёмах пищи
- есть ли история 3-7 дней
- есть ли `harm` / `simple` / `protein`

```text
confidence = weighted completeness of required inputs
```

Если confidence низкий, UI должен писать не “точный риск”, а “предварительная
оценка риска”.

### 8. Data contract / API proposal

#### Новый модуль

Рекомендуемый namespace:

```js
HEYS.RelapseRisk;
```

Для MVP core engine принять конкретный layout без лишней развилки:

```text
apps/web/heys_relapse_risk_v1.js
```

Если модуль попадает в legacy runtime, его нужно явно зарегистрировать в
`scripts/legacy-bundle-config.mjs`. Для стартового baseline — ориентироваться на
размещение рядом с `heys_status_v1.js` и проверять, в какой legacy bundle
подключён его consumer path.

#### Основные методы

```js
HEYS.RelapseRisk.calculate(options);
HEYS.RelapseRisk.getLevel(score);
HEYS.RelapseRisk.getRecommendations(result);
HEYS.RelapseRisk.getDrivers(result);
```

#### Пример calculate API

```js
HEYS.RelapseRisk.calculate({
  dayData,
  profile,
  dayTot,
  normAbs,
  historyDays,
  now,
  pIndex,
});
```

### 9. Предлагаемая схема debug output

```js
debug: {
  inputs: {
    stressAvg,
    sleepHours,
    sleepQuality,
    kcalPct,
    proteinPct,
    harm,
    simpleCarbs,
    lastMealTime,
    currentHour,
    dayScore,
  },
  components: {
    stressLoad,
    sleepDebt,
    restrictionPressure,
    rewardExposure,
    timingContext,
    emotionalVulnerability,
    protectiveBuffer,
  },
  windows: {
    next3h,
    tonight,
    next24h,
  }
}
```

Это нужно для explainability, QA и тонкой настройки весов.

### 10. Что улучшить в `dayScore` технически

#### Предлагаемое расширение output

Вместо одного только `dayScore` возвращать из расчётного слоя:

```js
{
  moodAvg,
  wellbeingAvg,
  stressAvg,
  dayScore,
  dayScoreRaw,
  emotionalDrift,
  emotionalVolatility,
  deltaVsMorning,
}
```

#### Смысл

- `dayScore` оставить как display-friendly;
- `dayScoreRaw` использовать в аналитике;
- volatility и drift использовать как signal, но не показывать везде сразу.

### 11. Что улучшить в `Status Score` технически

#### Предлагаемое направление

- перейти от грубых ступенек к более smooth scoring там, где это безопасно;
- добавить richer breakdown по факторам;
- сохранить explainability;
- не смешивать с predictive binge risk.

#### Важно

`Status Score` должен остаться ответом на вопрос:

> Насколько день качественный по поведению и режиму?

а не:

> Насколько человек близок к срыву?

### 12. Предлагаемая визуальная модель widget для `Relapse Risk`

#### Micro

- одно число / цвет / иконка;
- маленький subtitle типа `Tonight high`.

#### Standard

- score + level;
- 1-2 главных driver chips;
- one-step action;
- optional shield/protective badge.

#### UX tone

Не использовать tone типа:

- “опасно, вы сорвётесь”;
- “вы сделали всё неправильно”.

Использовать tone типа:

- “сегодня риск выше обычного”;
- “лучше сейчас выбрать безопасный приём пищи”;
- “организм под нагрузкой, не дожимай дефицит”.

### 13. Предлагаемый порядок файлов для анализа и вероятных изменений

Ниже — вероятный shortlist, который стоит проверить первым.

#### Core / scoring

- `apps/web/heys_day_calculations.js`
- `apps/web/heys_day_rating_averages_v1.js`
- `apps/web/heys_status_v1.js`
- `apps/web/heys_metabolic_intelligence_v1.js`
- `apps/web/heys_day_caloric_balance_v1.js`

#### Insights / risk / analytics

- `apps/web/insights/pi_ui_dashboard.js`
- `apps/web/insights/pi_early_warning.js`
- `apps/web/insights/pi_analytics_api.js`
- `apps/web/heys_predictive_insights_v1.js`

#### Widgets

- `apps/web/heys_widgets_data_v1.js`
- `apps/web/heys_widgets_ui_v1.js`
- `apps/web/widgets/widget_data.js`
- widget registry / widget type registration files if present

#### Advice

- `apps/web/advice/_emotional.js`
- `apps/web/advice/_nutrition.js`
- `apps/web/heys_advice_rules_v1.js`
- day advice integration files

#### Day UI

- `apps/web/heys_day_side_block_v1.js`
- `apps/web/heys_day_sleep_score_popups_v1.js`
- `apps/web/heys_day_sparklines_v1.js`

### 14. Рекомендуемый модульный layout

Для снижения scope ambiguity зафиксировать baseline layout так:

```text
apps/web/
  heys_relapse_risk_v1.js
  heys_relapse_risk_widget_v1.js
  heys_relapse_risk_insights_v1.js
```

Но для **первого implementation run** обязательным считать только:

```text
apps/web/
  heys_relapse_risk_v1.js
```

UI / widget / insights файлы — follow-up layers после стабилизации core engine.

Отдельно:

- новый runtime module **не появится в bundle сам по себе**;
- при добавлении `apps/web/heys_relapse_risk_v1.js` нужно обновить
  `scripts/legacy-bundle-config.mjs`;
- после этого обязателен rebuild и файловая post-build validation по правилам
  репозитория.

### 15. Главные продуктовые guardrails

При реализации держать в голове:

1. `dayScore` ≠ quality score
2. `Status Score` ≠ relapse predictor
3. `Relapse Risk Score` ≠ shame score
4. risk logic должна быть explainable
5. пользователь должен видеть не только risk, но и **protective path**

### 16. Что считать хорошим MVP результата

MVP можно считать хорошим, если после внедрения система умеет:

- различать low / elevated / high relapse risk;
- объяснять 2-3 главных драйвера риска;
- отдельно подсвечивать tonight risk;
- давать защитное действие “что сделать сейчас”;
- не ломать старые score-системы;
- повторно использовать существующие risk signals, а не плодить параллельные
  сущности без нужды.

Для **первого coding run** считать достаточным более узкий MVP:

1. есть новый чистый core engine `HEYS.RelapseRisk.calculate()`;
2. есть config/thresholds/helpers и explainable debug payload;
3. есть scenario-based tests или минимум test-friendly deterministic cases;
4. runtime module зарегистрирован в legacy bundle, выполнен rebuild и post-build
   validation;
5. подготовлен короткий integration note, куда и как подключать
   Insights/widget/advice во втором заходе.

## Formula draft v1 — implementation-ready baseline

Ниже — более прикладной вариант, который уже можно превращать в код почти
напрямую.

### 1. Целевой контракт функции

```js
function calculateRelapseRisk(options) {
  return {
    score,
    level,
    confidence,
    primaryDrivers,
    protectiveFactors,
    windows,
    recommendations,
    debug,
  };
}
```

### 2. Нормализационные helper-функции

#### `clamp01(x)`

```js
const clamp01 = (x) => Math.max(0, Math.min(1, x));
```

#### `clamp100(x)`

```js
const clamp100 = (x) => Math.max(0, Math.min(100, x));
```

#### `lerpScore(value, from, to)`

Линейно переводит значение в диапазон `0..100`.

```js
function lerpScore(value, from, to) {
  if (!Number.isFinite(value)) return 0;
  if (value <= from) return 0;
  if (value >= to) return 100;
  return ((value - from) / (to - from)) * 100;
}
```

### 3. Input set v1

Рекомендуемый минимальный набор входов:

```js
{
  dayData,
  dayTot,
  normAbs,
  profile,
  historyDays,
  now,
  pIndex,
}
```

### 3.1. Важное уточнение по реальной data model

Ниже — фактически подтверждённые имена полей, чтобы агент не опирался на
вымышленные структуры.

- `dayData.sleepHours` — реальное расчётное поле total sleep hours;
- `dayData.sleepQuality` — реальное поле качества сна;
- `dayData.sleepStart` / `dayData.sleepEnd` / `dayData.daySleepMinutes` —
  исходные sleep fields;
- `dayData.waterMl` — реальное поле воды;
- `dayData.meals[]` использует `meal.time` в формате `HH:MM` как timestamp meal;
- `dayTot.prot` — канонический day-level protein key;
- `dayTot.simple` — канонический day-level simple carbs key;
- `dayTot.harm` — канонический day-level weighted harm aggregate;
- `normAbs.kcal` и `normAbs.prot` — реальные keys для норм;
- `historyDays` в runtime могут приходить **не в одном формате**: как raw day
  records или как normalized sparkline/history entries.

Следствие для реализации:

- если реальная data model отличается от draft snippet — **адаптировать формулу
  под реальные поля**, а не ломать data model ради черновика;
- все risky места нормализовать через helpers вроде `normalizeInputs()`,
  `getHistoryKcalRatio()`, `getHoursSinceLastMeal()`;
- `pIndex` не считать обязательным входом для MVP core engine, если модуль
  напрямую не работает с product lookups.

Где желательно иметь:

- `dayData.stressAvg`
- `dayData.moodAvg`
- `dayData.wellbeingAvg`
- `dayData.dayScore`
- `dayData.sleepHours` / вычислимый sleep
- `dayData.sleepQuality`
- `dayData.meals`
- `dayData.trainings`
- `dayTot.kcal`
- `dayTot.prot`
- `dayTot.simple`
- `dayTot.harm`
- `normAbs.kcal`
- `normAbs.prot`

Для `historyDays` желательно уметь читать как минимум один из двух вариантов:

- raw-style: day records с полями, из которых можно вычислить totals/ratios;
- normalized-style: entries наподобие
  `{ date, kcal, target, sleepHours, sleepQuality, dayScore, waterMl, prot }`.

### 4. Component formulas

#### A. `stressLoad`

```js
const stressAvg = Number(dayData?.stressAvg || 0);
const recentStressValues = historyDays
  .map((d) => Number(d?.stressAvg || 0))
  .filter((v) => v > 0);

const stressBase = clamp100(
  stressAvg <= 2
    ? 5
    : stressAvg <= 4
      ? 20 + (stressAvg - 2) * 10
      : stressAvg <= 6
        ? 40 + (stressAvg - 4) * 15
        : stressAvg <= 8
          ? 70 + (stressAvg - 6) * 10
          : 95,
);

const recentStressMean = recentStressValues.length
  ? recentStressValues.reduce((a, b) => a + b, 0) / recentStressValues.length
  : 0;

const stressTrendBonus =
  recentStressMean >= 6.5 ? 15 : recentStressMean >= 5 ? 8 : 0;
const stressLoad = clamp100(stressBase + stressTrendBonus);
```

Интерпретация:

- текущий стресс — главный драйвер;
- повторяющийся стресс последних дней усиливает риск.

#### B. `sleepDebt`

```js
const sleepNorm = Number(profile?.sleepHours || 8);
const sleepHours = Number(dayData?.sleepHours || 0);
const sleepQuality = Number(dayData?.sleepQuality || 0);
const debt = Math.max(0, sleepNorm - sleepHours);

const debtBase = clamp100(
  debt <= 0.5
    ? 0
    : debt <= 1.0
      ? 15
      : debt <= 2.0
        ? 35 + (debt - 1) * 20
        : debt <= 3.0
          ? 60 + (debt - 2) * 20
          : 90,
);

const qualityPenalty =
  sleepQuality > 0 && sleepQuality <= 2
    ? 20
    : sleepQuality > 0 && sleepQuality <= 3
      ? 10
      : 0;

const recentSleepDebtDays = historyDays.filter((d) => {
  const h = Number(d?.sleepHours || 0);
  return h > 0 && h < sleepNorm - 1;
}).length;

const sleepStreakPenalty =
  recentSleepDebtDays >= 3 ? 15 : recentSleepDebtDays >= 2 ? 8 : 0;
const sleepDebt = clamp100(debtBase + qualityPenalty + sleepStreakPenalty);
```

#### C. `restrictionPressure`

```js
const kcalTarget = Math.max(1, Number(normAbs?.kcal || 0));
const kcalEaten = Math.max(0, Number(dayTot?.kcal || 0));
const kcalPct = kcalTarget > 0 ? kcalEaten / kcalTarget : 0;

const protTarget = Math.max(1, Number(normAbs?.prot || 0));
const protEaten = Math.max(0, Number(dayTot?.prot || 0));
const protPct = protTarget > 0 ? protEaten / protTarget : 0;

const hour = now ? new Date(now).getHours() : new Date().getHours();

const baseUndereating =
  kcalPct >= 0.9
    ? 0
    : kcalPct >= 0.8
      ? 10
      : kcalPct >= 0.7
        ? 25
        : kcalPct >= 0.6
          ? 45
          : kcalPct >= 0.5
            ? 65
            : 85;

const eveningUndereatingBonus =
  hour >= 18 && kcalPct < 0.7 ? 18 : hour >= 16 && kcalPct < 0.6 ? 12 : 0;

const proteinPenalty =
  protPct >= 0.9 ? 0 : protPct >= 0.75 ? 8 : protPct >= 0.6 ? 18 : 30;

const chronicLowDays = historyDays.filter((d) => {
  const ratio = getHistoryKcalRatio(d); // helper must support raw day records and normalized history entries
  return ratio > 0 && ratio < 0.8;
}).length;

const chronicRestrictionBonus =
  chronicLowDays >= 4 ? 20 : chronicLowDays >= 2 ? 10 : 0;

const gapHours = getHoursSinceLastMeal(dayData, now); // use dayData.meals[].time (HH:MM) as the canonical meal timestamp
const longGapPenalty = gapHours >= 7 ? 18 : gapHours >= 5 ? 10 : 0;

const restrictionPressure = clamp100(
  baseUndereating +
    eveningUndereatingBonus +
    proteinPenalty +
    chronicRestrictionBonus +
    longGapPenalty,
);
```

#### D. `rewardExposure`

```js
const harm = Number(dayTot?.harm || 0);
const simple = Number(dayTot?.simple || 0);
const totalKcal = Math.max(0, Number(dayTot?.kcal || 0));

const harmPenalty =
  harm <= 2 ? 0 : harm <= 4 ? 10 : harm <= 6 ? 25 : harm <= 8 ? 45 : 65;

const simplePenalty =
  simple <= 25
    ? 0
    : simple <= 40
      ? 10
      : simple <= 60
        ? 25
        : simple <= 90
          ? 45
          : 60;

const eveningRewardBonus =
  hour >= 18 && (simple >= 50 || harm >= 6)
    ? 15
    : hour >= 21 && (simple >= 35 || harm >= 5)
      ? 20
      : 0;

const comboBonus = harm >= 5 && simple >= 45 ? 15 : 0;

const rewardExposure = clamp100(
  harmPenalty + simplePenalty + eveningRewardBonus + comboBonus,
);
```

#### E. `timingContext`

```js
const isWeekend = [0, 5, 6].includes(
  (now ? new Date(now) : new Date()).getDay(),
);

const eveningPenalty = hour >= 22 ? 35 : hour >= 20 ? 20 : hour >= 18 ? 10 : 0;

const weekendPenalty = isWeekend ? 10 : 0;
const lateGapComboBonus = hour >= 18 && gapHours >= 5 ? 18 : 0;

const timingContext = clamp100(
  eveningPenalty + weekendPenalty + lateGapComboBonus,
);
```

#### F. `emotionalVulnerability`

```js
const dayScore = Number(dayData?.dayScore || 0);
const moodAvg = Number(dayData?.moodAvg || 0);
const wellbeingAvg = Number(dayData?.wellbeingAvg || 0);

const dayScorePenalty =
  dayScore <= 0
    ? 0
    : dayScore <= 3
      ? 40
      : dayScore <= 5
        ? 25
        : dayScore <= 7
          ? 10
          : 0;

const moodPenalty =
  moodAvg > 0 && moodAvg < 4 ? 18 : moodAvg > 0 && moodAvg < 6 ? 8 : 0;

const wellbeingPenalty =
  wellbeingAvg > 0 && wellbeingAvg < 4
    ? 18
    : wellbeingAvg > 0 && wellbeingAvg < 6
      ? 8
      : 0;

const mismatchBonus =
  stressAvg >= 6 && kcalPct < 0.7
    ? 18
    : stressAvg >= 5 && dayScore > 0 && dayScore <= 5
      ? 10
      : 0;

const emotionalVulnerability = clamp100(
  dayScorePenalty + moodPenalty + wellbeingPenalty + mismatchBonus,
);
```

### 5. Protective buffer formula

```js
const lowStressBonus = stressAvg > 0 && stressAvg <= 3 ? 8 : 0;
const goodSleepBonus = sleepHours >= sleepNorm * 0.95 ? 8 : 0;
const enoughCaloriesBonus = hour >= 18 && kcalPct >= 0.8 ? 8 : 0;
const enoughProteinBonus = protPct >= 0.9 ? 6 : 0;
const mealStructureBonus =
  Array.isArray(dayData?.meals) && dayData.meals.length >= 3 ? 5 : 0;
const hydrationBonus = Number(dayData?.waterMl || 0) >= 1800 ? 4 : 0;

const protectiveBuffer = Math.min(
  30,
  lowStressBonus +
    goodSleepBonus +
    enoughCaloriesBonus +
    enoughProteinBonus +
    mealStructureBonus +
    hydrationBonus,
);
```

### 6. Weighted composition

После расчёта компонентов `0..100` собирать итог так:

```js
const weightedScore =
  stressLoad * 0.24 +
  sleepDebt * 0.18 +
  restrictionPressure * 0.22 +
  rewardExposure * 0.16 +
  timingContext * 0.1 +
  emotionalVulnerability * 0.1;

const score = clamp100(weightedScore - protectiveBuffer);
```

### 7. Windows formula

#### `next3h`

```js
const next3h = clamp100(
  stressLoad * 0.35 +
    restrictionPressure * 0.25 +
    rewardExposure * 0.2 +
    timingContext * 0.2 -
    protectiveBuffer * 0.4,
);
```

#### `tonight`

```js
const tonight = clamp100(
  stressLoad * 0.22 +
    sleepDebt * 0.18 +
    restrictionPressure * 0.25 +
    rewardExposure * 0.18 +
    timingContext * 0.12 +
    emotionalVulnerability * 0.05 -
    protectiveBuffer * 0.5,
);
```

#### `next24h`

```js
const next24h = clamp100(
  stressLoad * 0.2 +
    sleepDebt * 0.2 +
    restrictionPressure * 0.25 +
    rewardExposure * 0.12 +
    timingContext * 0.08 +
    emotionalVulnerability * 0.15 -
    protectiveBuffer * 0.35,
);
```

### 8. Confidence formula

```js
let confidencePoints = 0;

if (stressAvg > 0) confidencePoints += 20;
if (sleepHours > 0) confidencePoints += 20;
if (kcalTarget > 0 && totalKcal > 0) confidencePoints += 20;
if (protTarget > 0) confidencePoints += 10;
if (Array.isArray(dayData?.meals) && dayData.meals.length > 0)
  confidencePoints += 10;
if (historyDays.length >= 3) confidencePoints += 10;
if (Number.isFinite(harm) || Number.isFinite(simple)) confidencePoints += 10;

const confidence = clamp100(confidencePoints);
```

Интерпретация:

- `0-39` — rough estimate
- `40-69` — moderate confidence
- `70-100` — good confidence

### 9. Level mapping

```js
function getRelapseRiskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 40) return 'elevated';
  if (score >= 20) return 'guarded';
  return 'low';
}
```

### 10. Driver extraction logic

Рекомендуемый принцип:

1. собрать все компоненты и sub-penalties в массив;
2. отфильтровать `impact > 0`;
3. отсортировать по impact desc;
4. взять top-3;
5. каждому driver дать human explanation.

Пример:

```js
primaryDrivers = [
  {
    id: 'restriction_pressure_evening',
    label: 'Сильный недобор к вечеру',
    impact: 22,
    direction: 'up',
    explanation:
      'К вечеру организму не хватает энергии, это повышает риск тяги к быстрым калориям.',
  },
];
```

### 11. Protective factors extraction

Тот же принцип, но для бонусов:

```js
protectiveFactors = [
  {
    id: 'good_sleep',
    label: 'Нормальный сон',
    impact: -8,
    explanation:
      'Сон снижает тягу к hyperpalatable еде и улучшает контроль аппетита.',
  },
];
```

### 12. Recommendation matrix draft

#### Если главный драйвер — `restrictionPressure`

Рекомендации:

- safe structured meal
- не дожимать дефицит
- protein + fiber first

#### Если главный драйвер — `stressLoad`

Рекомендации:

- anti-stress pause
- remove friction with food decisions
- заранее выбрать safe option

#### Если главный драйвер — `rewardExposure`

Рекомендации:

- stop escalation now
- add non-trigger meal
- reduce sweet/fat continuation

#### Если главный драйвер — `sleepDebt`

Рекомендации:

- не строить жесткий дефицит сегодня
- раньше завершить день
- evening self-protection mode

### 13. Псевдокод полной функции

```js
function calculateRelapseRisk(options = {}) {
  const ctx = normalizeInputs(options);

  const stressLoad = calcStressLoad(ctx);
  const sleepDebt = calcSleepDebt(ctx);
  const restrictionPressure = calcRestrictionPressure(ctx);
  const rewardExposure = calcRewardExposure(ctx);
  const timingContext = calcTimingContext(ctx);
  const emotionalVulnerability = calcEmotionalVulnerability(ctx);
  const protectiveBuffer = calcProtectiveBuffer(ctx);

  const score = composeWeightedRisk({
    stressLoad,
    sleepDebt,
    restrictionPressure,
    rewardExposure,
    timingContext,
    emotionalVulnerability,
    protectiveBuffer,
  });

  const windows = calcRiskWindows({
    stressLoad,
    sleepDebt,
    restrictionPressure,
    rewardExposure,
    timingContext,
    emotionalVulnerability,
    protectiveBuffer,
  });

  const confidence = calcConfidence(ctx);
  const level = getRelapseRiskLevel(score);
  const primaryDrivers = extractPrimaryDrivers(ctx);
  const protectiveFactors = extractProtectiveFactors(ctx);
  const recommendations = buildRelapseRiskRecommendations({
    score,
    level,
    windows,
    primaryDrivers,
    protectiveFactors,
    ctx,
  });

  return {
    score,
    level,
    confidence,
    primaryDrivers,
    protectiveFactors,
    windows,
    recommendations,
    debug: buildDebugPayload(ctx),
  };
}
```

### 14. Что считать хорошими первыми тест-кейсами

1. **Low-risk stable day**
   - нормальный сон
   - низкий стресс
   - добор калорий
   - нормальный белок
   - низкий harm
   - ожидаемый риск: `low`

2. **Evening underfed stress day**
   - высокий стресс
   - вечер
   - сильный недобор калорий
   - большой gap
   - ожидаемый риск: `high`

3. **Sleep debt + reward exposure**
   - недосып
   - сладкое / высокий harm
   - Friday evening
   - ожидаемый риск: `high/critical`

4. **Bad subjective state but decent structure**
   - low `dayScore`
   - но нормальные калории, белок, сон
   - ожидаемый риск: `guarded/elevated`, но не `critical`

5. **Good subjective state but strong restriction**
   - `dayScore` хороший
   - к вечеру сильный недобор и long gap
   - ожидаемый риск должен расти

### 15. Правило здравого смысла

Если итог модели даёт странный вывод вроде:

- `score < 20` при стрессе 8/10 + сне 5ч + kcalPct 0.45 в 21:00,

значит веса/thresholds нужно корректировать.

Если модель выдаёт:

- `score > 80` только потому что `dayScore = 4`,

это тоже ошибка: subjective layer не должен доминировать над реальными
behavioral predictors.

## Готовый prompt для coding agent — follow-up Phase 3-5 run

Скопируй текст ниже целиком в новый запуск агента.

---

В `HEYS-v2` уже реализован базовый core engine для **Relapse Risk Score v1**.

Что уже сделано и не нужно делать заново:

- создан `apps/web/heys_relapse_risk_v1.js`;
- экспортирован `HEYS.RelapseRisk.calculate()`;
- добавлены test-friendly helpers и unit tests;
- модуль зарегистрирован в legacy bundle config и уже попал в
  `postboot-1-game.bundle.d19a0f78cbfc.js`.

Теперь нужен **следующий шаг**: аккуратная интеграция этого score в оставшиеся
product consumer layers.

Контекст:

- в проекте уже есть `dayScore` (subjective/emotional day score) и
  `Status Score` (daily quality/compliance score);
- их НЕ нужно заменять одним новым score;
- нужно сделать 3-слойную систему:
  1. `dayScore` — subjective layer,
  2. `Status Score` — compliance layer,
  3. `Relapse Risk Score` — predictive relapse/binge risk layer.

Важно по scope:

- этот запуск **не должен** переписывать core engine без реальной необходимости;
- использовать существующий `HEYS.RelapseRisk.calculate()` как canonical source
  для relapse risk;
- focus этого run: widget + advice wiring;
- refinement `dayScore` и `Status Score` по-прежнему считать follow-up задачей,
  не мешать её с UI/integration слоем.

Что нужно сделать:

1. найти текущие точки встраивания для widgets и advice, где score логично
   показать или использовать;
2. добавить widget/data-provider для relapse risk, не дублируя расчёт в другом
   месте;
3. подключить score к advice / preventive interventions без жёсткого
   переписывания старой advice-логики;
4. проверить, что не появилось второй параллельной canonical implementation
   relapse risk;
5. выполнить нужный rebuild legacy bundle и post-build validation;
6. кратко задокументировать, где score теперь потребляется.

Подтверждённые data-model ориентиры:

- использовать реальные keys: `dayData.sleepHours`, `dayData.sleepQuality`,
  `dayData.waterMl`, `meal.time`, `dayTot.prot`, `dayTot.simple`, `dayTot.harm`,
  `normAbs.kcal`, `normAbs.prot`;
- `historyDays` может приходить в разных shape, поэтому нужно сделать
  normalization layer и не хардкодить только один формат;
- `pIndex` не обязателен для MVP, если он реально не нужен для расчёта score;
- если реальные поля отличаются от draft formula snippets, адаптируй расчёт под
  реальную модель данных, а не наоборот.

Требования к реализации:

- ответы на русском, код на английском;
- не ломать существующие score-системы;
- новая логика должна быть explainable;
- использовать небольшие, локальные, проверяемые изменения;
- при необходимости добавлять конфиги/утилиты/виджеты/документацию;
- учитывать hidden coupling в Insights, widgets, advice, EWS, metabolic modules;
- всё, что можно, держать как derived runtime data, не добавляя новые persisted
  поля без явной необходимости;
- если изменение затрагивает legacy runtime в `apps/web/**`, выполнить
  обязательный rebuild legacy bundle и post-build validation по правилам
  репозитория.

Ожидаемый output:

- новые/обновлённые файлы;
- где именно `HEYS.RelapseRisk` теперь встроен;
- какие consumer layers используют canonical relapse risk calculation;
- какие проверки выполнены;
- какие риски/ограничения остались.

Сначала исследуй кодовую базу и покажи компактный implementation plan, затем
внеси изменения по шагам и проверяй их по мере работы.
