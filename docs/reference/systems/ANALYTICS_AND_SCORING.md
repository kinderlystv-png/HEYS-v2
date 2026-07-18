# Аналитика, scoring и предупреждения

> **Статус:** основные source-пути проверены 2026-07-18<br> **Охват:**
> субъективная оценка дня, Status/Unified Day Score, Predictive Insights, Early
> Warning и relapse risk<br> **Не подтверждено:** научная валидность моделей,
> production-качество данных, фактическая доставка EWS push и полный UI/browser
> flow

## Карта уровней

В проекте нет одного универсального «score». Несколько моделей отвечают на
разные вопросы и используют пересекающиеся данные:

```text
DayRecord + products + profile + history
  ├─ dayScore / dayScoreRaw (1–10): субъективное состояние
  ├─ HEYS.Status (0–100): rule-based факторы текущего дня
  ├─ HEYS.DayScore (0–100): Status + субъективное + Cascade momentum
  ├─ HEYS.RelapseRisk (0–100): риск по текущему дню и истории
  └─ HEYS.PredictiveInsights
       ├─ patterns + Health/Trend Score
       └─ Early Warning → warnings, trends, causal chains, snapshot
```

Главный риск сопровождения — одинаковые слова `dayScore`, `status score` и
`health score` используются для разных шкал. Агент обязан проверять namespace,
единицу и источник, а не ориентироваться на имя поля.

## Владельцы ответственности

| Область                                           | Точка                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Авторасчёт субъективного `dayScore`/`dayScoreRaw` | `heys_day_calculations.js`, `heys_day_rating_averages_v1.js`                    |
| Rule-based факторы текущего дня                   | `heys_status_v1.js` → `HEYS.Status`                                             |
| Композитный Day Score 0–100                       | `heys_day_score_v1.js` → `HEYS.DayScore`                                        |
| Risk Radar / relapse risk                         | `heys_relapse_risk_v1.js`                                                       |
| Публичный legacy-фасад аналитики                  | `heys_predictive_insights_v1.js`                                                |
| Pattern registry и расчёты                        | `insights/pi_patterns.js`, `insights/patterns/*`, `insights/pi_calculations.js` |
| Пороги и персонализация                           | `insights/pi_thresholds.js`, `insights/pi_phenotype.js`                         |
| Early Warning                                     | `insights/pi_early_warning.js`                                                  |
| Causal chains                                     | `insights/pi_causal_chains.js`                                                  |
| Feedback/outcomes                                 | `insights/pi_feedback_loop.js`, `insights/pi_outcome_modal.js`                  |
| Основная UI-сборка insights                       | `insights/pi_ui_dashboard.js`, `heys_insights_tab_v1.js`                        |

## Текущий день: три разных оценки

`calculateDayAverages` вычисляет `dayScoreRaw` по mood, wellbeing и
инвертированному stress, затем округляет его в `dayScore`. Ручной ввод ставит
`dayScoreManual` и не должен быть затёрт реактивным авторасчётом. Это шкала
1–10, хотя нулевое/пустое значение также используется как «не задано».

`HEYS.Status.calculateStatus` — самостоятельная rule-based модель. Текущий
source содержит 11 факторов в четырёх категориях; недоступные субъективные
факторы исключаются, после чего веса нормализуются по доступным. Накопительные
показатели корректируются по времени дня, а результат может сглаживаться не
более чем на 15 пунктов относительно переданного предыдущего значения. Timing
score и details используют один helper максимального валидного `meal.time`,
поэтому порядок элементов `meals` на результат не влияет.

`HEYS.DayScore.calculateDayScore` строит ещё один показатель 0–100: 70% Status,
15% субъективный `dayData.dayScore`, 15% Cascade CRS. Если доступен Meal
Quality, он дополнительно меняет nutrition-вклад Status. Результат возвращается
как view-model и не совпадает с одноимённым полем `DayRecord.dayScore`.

## Predictive Insights

`HEYS.PredictiveInsights.analyze` — legacy-compatible вход в модульный контур
`HEYS.InsightsPI`. Он читает client-scoped историю дней, получает/строит product
index, формирует fingerprints клиента, истории, профиля и продуктов, а затем
использует TTL cache. При недостатке дней возвращается `available:false`.

Анализ запускает набор независимых pattern analyzers. Каждый pattern должен сам
сообщать доступность; общий слой нормализует отсутствующий `reason`,
дедуплицирует одинаковые pattern ids, строит Health Score, what-if, прогноз
веса, weekly/monthly wrap и priority actions. Поэтому `available:true` общего
результата не означает, что доступен каждый pattern.

`scoreHistory` имеет выходной контракт 0–100. Подтверждённые persistent поля
`dayScoreRaw/dayScore` сначала проверяются как шкала 1–10 и умножаются на 10;
значения вне этой семантики не преобразуются эвристически и уходят в proxy,
который уже выражен в 0–100.

Публичный объект также содержит legacy helpers и lazy getters. Наличие имени
функции в `HEYS.PredictiveInsights` не доказывает, что соответствующий модуль
уже загружен: getter может вернуть `undefined`.

## Early Warning

`HEYS.InsightsPI.earlyWarning.detect` объединяет проверки текущих и исторических
ухудшений. Полный режим включает проверки питания, сна, веса, активности,
самочувствия и logging gaps; acute mode пропускает часть долгосрочных проверок.
Результаты сортируются, обогащаются trend/frequency/priority и объединяются в
global risk score.

У detect есть побочные эффекты:

- обновление warning trends;
- асинхронный расчёт weekly progress в fire-and-forget режиме;
- опциональный запуск causal chains;
- запись `heys_ews_snapshot` для дальнейшего server-side push.

Следовательно, это не чистая функция. Возвращённый результат может быть готов,
когда weekly progress или cloud sync ещё завершились ошибкой.

## Relapse risk

`HEYS.RelapseRisk.calculate` — отдельная rule-based модель со своими профилями
весов и временными окнами. Она предпочитает `dayScoreRaw`, затем `dayScore`,
затем сама восстанавливает субъективную оценку. Это ещё одна причина не менять
семантику поля `dayScore` без проверки всех downstream readers.

Модель использует текущий DayData с fallback на local storage и собирает
историю. Её результат — оценка риска и объяснение факторов, а не клинический
прогноз. Тесты для relapse risk есть; для Status/Unified Day Score отдельного
очевидного production-unit suite в проверенном наборе не найдено.

## Инварианты

1. Каждый score передаётся вместе с namespace и шкалой.
2. `DayRecord.dayScore` (1–10) не подменяется `HEYS.DayScore.score` (0–100).
3. Ручная субъективная оценка не перезаписывается авторасчётом.
4. Аналитика строится в выбранном client context и кеш учитывает client id.
5. Pattern без достаточных данных отмечается unavailable, а не получает
   уверенное нулевое значение.
6. Изменение нутриентного или day-контракта проверяется во всех pattern readers.
7. EWS snapshot содержит только вычисленную оценку, не медицинский диагноз.
8. UI должен показывать причины/доступность, а не только итоговое число.

## Подтверждённые слабые места и пробелы

- `SCORING_REFERENCE.md` описывает старый Status-контракт: 9 факторов и веса
  15/10/…, тогда как current source содержит 11 факторов и другие веса.
- В том же справочнике указан API `HEYS.StatusScore.calculate`, но source
  экспортирует `HEYS.Status.calculateStatus`.
- Название `dayScore` конфликтует между persistent шкалой 1–10 и модулем Unified
  Day Score 0–100; тип/имя не предотвращают смешение.
- Predictive Insights содержит собственный упрощённый `simulateFood`, который
  повторяет часть логики инсулиновой волны вместо вызова канонического engine.
  Формулы могут расходиться.
- В коде и старых docs есть фиксированные заявления о количестве
  patterns/checks. Они быстро устаревают и не должны считаться контрактом.
- Общая confidence в `analyze` в основном зависит от числа дней, а не от полноты
  конкретных полей; отдельные patterns обязаны компенсировать это своей
  проверкой доступности.
- Early Warning одновременно вычисляет, пишет snapshot и запускает async work.
  Ошибка побочного эффекта не делает синхронный `detect` неуспешным.
- Legacy getters могут выглядеть как доступный API до загрузки владельца.
- Научные/медицинские заявления старого аналитического справочника в этой
  ревизии не валидировались; repository tests доказывают код, не физиологию.

## Как поддерживать без устаревания

- В этом досье сохранять уровни, владельцев, шкалы, зависимости и риски.
- Таблицы коэффициентов держать в source; старые detailed docs использовать как
  маршрут, а не копировать сюда.
- При добавлении score явно выбрать новое имя, шкалу, missing-data policy,
  explainability и владельца persistence.
- При изменении `dayScore` проверять DayTab, relapse risk, Predictive Insights,
  EWS и cloud merge.

## Facts Table

| ID  | Утверждение                                                                              | Проверка                                                                                                                                                                   | Статус               |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| A1  | Субъективный day score вычисляется из mood/wellbeing/stress и имеет raw + integer        | `sed -n '130,205p' apps/web/heys_day_calculations.js`                                                                                                                      | проверено 2026-07-17 |
| A2  | Current Status содержит 11 факторов и экспортируется как `HEYS.Status.calculateStatus`   | `sed -n '25,75p' apps/web/heys_status_v1.js && sed -n '680,710p' apps/web/heys_status_v1.js`                                                                               | проверено 2026-07-17 |
| A3  | Unified Day Score смешивает Status, subjective и Cascade с весами 70/15/15               | `sed -n '25,205p' apps/web/heys_day_score_v1.js`                                                                                                                           | проверено 2026-07-17 |
| A4  | Старый scoring doc указывает 9 факторов и другой namespace                               | `sed -n '15,65p' docs/SCORING_REFERENCE.md`                                                                                                                                | проверено 2026-07-17 |
| A5  | Predictive analyze строит client/data/profile/product fingerprints и minimum-days gate   | `sed -n '632,710p' apps/web/heys_predictive_insights_v1.js`                                                                                                                | проверено 2026-07-17 |
| A6  | Общий result содержит patterns, healthScore, predictions/wraps/actions и кешируется      | `sed -n '850,1005p' apps/web/heys_predictive_insights_v1.js`                                                                                                               | проверено 2026-07-17 |
| A7  | `scoreHistory` нормализует подтверждённую шкалу 1–10 в единый output 0–100               | `rg -n -e 'getStoredScore100' -e 'buildScoreHistory' apps/web/heys_predictive_insights_v1.js && pnpm vitest run apps/web/__tests__/predictive-score-history-scale.test.js` | проверено 2026-07-18 |
| A8  | EWS detect пишет snapshot и запускает weekly progress асинхронно                         | `sed -n '4700,4845p' apps/web/insights/pi_early_warning.js`                                                                                                                | проверено 2026-07-17 |
| A9  | Relapse risk предпочитает `dayScoreRaw`, затем `dayScore`                                | `sed -n '170,210p' apps/web/heys_relapse_risk_v1.js`                                                                                                                       | проверено 2026-07-17 |
| A10 | Relapse risk имеет отдельный unit test                                                   | `test -f apps/web/__tests__/heys_relapse_risk.test.js`                                                                                                                     | проверено 2026-07-17 |
| A11 | Analytics modules входят в разные lazy bundle segments                                   | `rg -n -e 'heys_relapse_risk' -e 'heys_status_v1' -e 'pi_early_warning' -e 'heys_predictive_insights' -e 'heys_day_score' scripts/legacy-bundle-config.mjs`                | проверено 2026-07-17 |
| A12 | Predictive what-if дублирует собственный wave multiplier                                 | `rg -n -e 'function simulateFood' -e 'waveMultiplier' apps/web/heys_predictive_insights_v1.js`                                                                             | проверено 2026-07-17 |
| A13 | Status score/details выбирают одно позднейшее валидное время независимо от порядка meals | `rg -n 'getLatestValidMeal' apps/web/heys_status_v1.js && pnpm vitest run apps/web/__tests__/status-latest-meal-time.test.js`                                              | проверено 2026-07-18 |

## Связанные источники

- [`DATA_MODEL_ANALYTICS.md`](../../DATA_MODEL_ANALYTICS.md) — историческая
  подробная карта patterns, EWS и gamification; сверять с source.
- [`SCORING_REFERENCE.md`](../../SCORING_REFERENCE.md) — подробные старые
  формулы; current Status section частично устарел.
- [`NUTRITION_AND_INSULIN.md`](NUTRITION_AND_INSULIN.md) — исходные пищевые
  расчёты и модель волны.
- [`BACKGROUND_JOBS.md`](BACKGROUND_JOBS.md) — потребитель EWS snapshot.
