---
template-version: 1.1.0
created: 2025-12-15
updated: 2025-12-15
priority: high
scope: insights-tab
status: ENHANCEMENT (компонент существует, нужны улучшения)
---

# PredictiveDashboard — улучшение панели прогнозов

## Текущее состояние
`PredictiveDashboard` уже реализован в `heys_predictive_insights_v1.js:3419`.
Показывает: CrashRiskAlert (если risk>30%), TomorrowForecast (energyWindows, trainingWindow).

## Что ДОБАВИТЬ
- ✅ ~~CrashRiskAlert~~ → уже есть (primaryTrigger, preventionStrategy)
- ✅ ~~TomorrowForecast~~ → уже есть (collapsible карточка)
- ⬜ **Табы Risk|Forecast|Phenotype** — сейчас один линейный layout
- ⬜ **Timeline-навигация [-7..+7]** — скроллер по датам
- ⬜ **RiskMeter (спидометр)** — визуальный gauge 0-100%
- ⬜ **What-if сценарии** — optimistic/likely/worst прогнозы

### Risk tab
- Использовать `calculateCrashRisk()`/`calculateCrashRisk24h()`
- RiskMeter (спидометр 0-100%, зоны: зел/жёлт/красн)
- Факторы риска + предложения (mitigation)
- График риска: текущий / 24h / история 7d

### Forecast tab
- Функция `calculatePerformanceForecast()` (реализовать) → энергия/фокус на завтра + неделя
- What-if: сценарии optimistic/likely/worst
- Рекомендации для улучшения прогноза

### Phenotype tab
- Использовать `identifyPhenotype()` (уже есть)
- Краткий вывод типа + кнопка «подробнее» (свяжется с UI фенотипа из отдельного промпта)

## UX
- Lazy load табов, skeleton при загрузке
- Анимации: slide/fade при смене табов, морфинг графиков
- Mobile-first, touch ≥44px

## Guardrails
- Без новых API-запросов, только локальные данные
- Гистерезис для riskLevel (не мигать)
- Kill-switch: `heys_feature_metabolic=0`

## Acceptance
- Все три таба рендерятся без ошибок
- RiskMeter показывает корректные уровни
- Forecast выдаёт реалистичные окна энергии (без NaN)
- `pnpm type-check && pnpm build` PASS
