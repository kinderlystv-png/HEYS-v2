# TODO — HEYS v2

**Обновлено**: 2025-12-17 | 📊
[DATA_MODEL_REFERENCE.md](./docs/DATA_MODEL_REFERENCE.md) | ✅
[done.md](./done.md)

> TODO = только активные задачи. Всё выполненное сразу уходит в `done.md`.

```bash
pnpm dev                                    # Dev → localhost:3001
pnpm type-check && pnpm lint && pnpm build  # Проверка
```

---

## 🔥 Приоритет (1–3 дня)

- 🔐 Телефон + PIN login — единый экран входа, сброс PIN, быстрый свитч
  клиентов.  
  **Файл:** [2025-12-12-phone-pin-login.md](./docs/tasks/2025-12-12-phone-pin-login.md)
  (~2-3ч)
- 🔄 Refeed Day чек-ин — toggle + причина, бейдж 🔄, streak <1.35.  
  **Файл:** [2025-12-12-refeed-day-checkin.md](./docs/tasks/2025-12-12-refeed-day-checkin.md)
  (~2-3ч)
- 🚨 PWA infinite update loop — race между cache и version.json, починить.  
  **Файл:** [2025-12-08-fix-infinite-update-loop.md](./docs/tasks/2025-12-08-fix-infinite-update-loop.md)
  (~30м)
- 📲 PWA features остаток — Badge API, Persistent Storage, BG Sync, Wake Lock,
  Share Target, shortcuts add-water/training.  
  **Файл:** [2025-11-30-pwa-features.md](./docs/tasks/2025-11-30-pwa-features.md)
  (~45м суммарно)
- 🍽️ Insulin wave new factors — FOOD_FORM_BONUS, resistant starch, липолиз
  шкала, гипо предупреждение.  
  **Файл:** [2025-12-10-insulin-wave-new-factors.md](./docs/tasks/2025-12-10-insulin-wave-new-factors.md)
  (~2-3ч)
- 🤖 Meal Optimizer — контекстные рекомендации, умные порции, история “что могло
  бы улучшить приём”.  
  **Файл:** [2025-12-10-meal-optimizer.md](./docs/tasks/2025-12-10-meal-optimizer.md)
  (~4-6ч)

---

## ⚡ Быстрые (≤1 час)

- 🗺️ Mini-heatmap недели (7 квадратиков, клик-на-день).  
  **Файл:** [2025-11-30-week-heatmap.md](./docs/tasks/2025-11-30-week-heatmap.md)
  (~20м)
- 📈 Calorie sparkline v2 — streak-линия, прогноз, выходные, morph, mood-бар.  
  **Файл:** [2025-11-29-sparkline-enhancements-v2.md](./docs/tasks/2025-11-29-sparkline-enhancements-v2.md)
  (~45м)
- 🎯 Прогресс к цели веса — weightGoal в профиле + progress-bar. (~30м)
- 📊 Data overview tab для куратора — таблица заполненности за 30 дней.  
  **Файл:** [2025-11-30-data-overview-tab.md](./docs/tasks/2025-11-30-data-overview-tab.md)
  (~60-90м)

---

## 🟡 Средние (1–2 часа)

- 🏅 XP & уровни — базовая петля (баллы за действия, прогресс-бар).  
  **Файл:** [2025-11-30-xp-levels-system.md](./docs/tasks/2025-11-30-xp-levels-system.md)
  (~2-3ч)
- 📰 Weekly Digest (вс) — лучший/худший день, тренды, прогноз. (~1.5ч)
- 📷 Фото еды — upload к приёму (input capture). (~1ч)

---

## 🟠 Крупные (2–4 часа)

- 🧩 Рефакторинг `heys_day_v12.js` — расколоть на компоненты/модули (charts,
  modals, scoring).  
  **Файл:** [2025-12-09-refactor-heys-day-v12.md](./docs/tasks/2025-12-09-refactor-heys-day-v12.md)
- 🌑 Полный dark mode — добить покрытия компонентов. (~2ч)
- 🔍 Персональные паттерны — анализ 30+ дней (повторяющиеся сценарии). (~2-3ч)

---

## 🔬 Deep Work (исследования, >1 день)

- 💊 Supplements scientific v2 — расписание, формы, лимиты.  
  **Файл:** [2025-12-15-supplements-scientific-v2.md](./docs/tasks/2025-12-15-supplements-scientific-v2.md)
  (~4-6ч)
- 🧠 Scientific roadmap — TEF, хронотип, адаптивный термогенез, предиктивные
  модели.  
  **Файл:** [2025-12-15-scientific-roadmap.md](./docs/tasks/2025-12-15-scientific-roadmap.md)
  (фазы, ~50ч)
- 🔮 Predictive Insights Module — аналитика 7–30 дней, WOW UI.  
  **Файл:** [2025-12-14-predictive-insights-module.md](./docs/tasks/2025-12-14-predictive-insights-module.md)
  (~6-10ч)
- 🧬 Metabolic Intelligence v2 — статус 0-100, риски, фенотип.  
  **Файл:** [2025-12-14-metabolic-intelligence-v2.md](./docs/tasks/2025-12-14-metabolic-intelligence-v2.md)
  (~8-10ч)

---

## 🟣 Возможно позже

- 📱 Сканер штрих-кодов (OFF/Online) — Open Food Facts API готов. (~2-3ч)
- 🏆 Gamification backlog — streak rewards, leaderboards, доп. бейджи.

---

## 🔧 Техдолг / QA

- Service Worker + IndexedDB (кэш оффлайн)
- Playwright UI тесты (smoke)
- TypeScript migration (точечно) | Spring animations | 30 мин | |
  Pull-to-refresh визуал | 25 мин | | Sound effects | 20 мин |

</details>

---

## 📊 Статус

| Метрика         | Результат |
| --------------- | --------- |
| pnpm type-check | ✅ PASS   |
| pnpm build      | ✅ PASS   |
| Активных задач  | **5**     |

---

📁 [docs/tasks/](./docs/tasks/) — промпты | ✅ [done.md](./done.md) — выполнено
