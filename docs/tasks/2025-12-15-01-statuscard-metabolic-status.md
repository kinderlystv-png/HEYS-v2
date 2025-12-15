---
template-version: 1.1.0
created: 2025-12-15
updated: 2025-12-15
priority: high
scope: insights-tab
status: ENHANCEMENT (компонент существует, нужны улучшения)
---

# StatusCard — улучшение метаболического статуса 0-100

## Текущее состояние
`MetabolicStatusCard` уже реализован в `heys_predictive_insights_v1.js:3216`.
Показывает: score badge, metabolicPhase, riskLevel, reasons, nextSteps.

## Что ДОБАВИТЬ
- ✅ ~~Базовый компонент~~ → уже есть
- ⬜ **Кольцо с count-up анимацией** (сейчас просто badge — нужен progress ring)
- ⬜ **Тренд ↑/↓** — сравнение с вчерашним статусом
- ⬜ **Breakdown по столпам** — визуальные mini-bars (питание/тайминг/сон/активность)
- ⬜ **Gradient цвет** — плавный переход 0-100 (сейчас discrete zones)
- ⬜ **Confidence badge** — показать уверенность в оценке (low/medium/high)

## Данные
Использовать уже готовое API `HEYS.Metabolic.getStatus()` (score, reasons, nextSteps, risk, confidence). Без новых запросов.

## UX
- Плавная анимация 1.5с, морфинг при обновлении
- Touch ≥44px, mobile-first
- Skeleton при загрузке
- Tooltip/expand при клике на причину

## Guardrails
- EMA сглаживание статуса (не скачет)
- Гистерезис для riskLevel
- Kill-switch: `localStorage.heys_feature_metabolic=0` скрывает блок
- Без медицинских обещаний

## Acceptance
- Рендер без ошибок, 60 FPS
- Статус и тренд корректны
- Причины кликабельны, детали показываются
- `pnpm type-check && pnpm build` PASS
