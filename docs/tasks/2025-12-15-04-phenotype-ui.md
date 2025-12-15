---
template-version: 1.1.0
created: 2025-12-15
updated: 2025-12-15
priority: low
scope: insights-tab
status: NEW (не реализовано)
---

# UI фенотипа — визуализация метаболического типа

## Текущее состояние
`identifyPhenotype()` существует в core, но **UI для отображения НЕТ**.
Нужен полноценный компонент визуализации.

## Что сделать
- Компонент `PhenotypeSection` в `heys_predictive_insights_v1.js`
- Краткая карточка типа (иконка, цвет, short desc)
- Раскрываемые виды:
  - Overview (strengths/weaknesses)
  - RadarChart характеристик (D3/SVG)
  - PersonalThresholds view (зоны + текущие значения)
  - Evolution timeline (смены типа)
  - Recommendations (персональный план)
- Конфиги типов (sprinter/marathoner/powerlifter/balanced/nightowl) с цветами/гранями

## UX
- Анимации: pulse иконки, slideDown деталей, hover на рекомендациях
- Mobile-first, touch ≥44px
- Lazy render тяжёлых графиков

## Guardrails
- Данные локальные, без новых запросов
- Без медицинских обещаний/диагнозов
- Kill-switch: `heys_feature_metabolic=0`

## Acceptance
- Карточка типа рендерится без ошибок
- Radar/thresholds/timeline показывают корректные данные
- Рекомендации кликабельны
- `pnpm type-check && pnpm build` PASS
