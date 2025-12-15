---
template-version: 1.1.0
created: 2025-12-15
updated: 2025-12-15
priority: medium
scope: insights-tab
status: NEW (не реализовано)
---

# Feedback Loop — самообучение на отклике

## Текущее состояние
**НЕ РЕАЛИЗОВАНО**. Механизма сбора feedback по прогнозам/советам НЕТ.

## Что сделать
- Хранилище `HEYS.FeedbackStore` (lsSet/lsGet), опциональный sync в облако
- Компонент `FeedbackWidget` (микро-опрос) для точек:
  - FORECAST_ACCURACY (конец дня)
  - ADVICE_USEFULNESS (после совета)
  - CRASH_ANALYSIS (после срыва, отложено)
  - MORNING_FEELING (утренний чек-ин)
- Триггеры показа (не чаще 1/день, не во время ввода, не ночью)
- Обновление локальной модели: корректировка точности прогнозов, предпочтения советов
- Дашборд улучшений (accuracy trends, preferred advice)

## UX
- Минимизируемое окно, быстрые ответы (кнопки/scale)
- Спасибо-экран после ответа
- Respect opt-out: выключение в настройках/kill-switch

## Guardrails
- Все данные локальны; синхронизация только при онлайн и согласии
- Kill-switch: `heys_feature_metabolic=0` скрывает опросы
- Без медицинских формулировок

## Acceptance
- Feedback сохраняется локально, без падений
- Ответы корректируют локальные веса (см. adjustPrediction)
- Показ не спамит: частота ≤1/день/тип
- `pnpm type-check && pnpm build` PASS
