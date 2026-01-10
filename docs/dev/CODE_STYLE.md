# 🎨 HEYS Code Style Guide

> Правила кода и стилей для проекта HEYS

---

## Запрещено → Правильно

| 🚫 Запрещено                      | ✅ Правильно                                  |
| --------------------------------- | --------------------------------------------- |
| `console.log/warn/error` напрямую | `HEYS.analytics.trackError()` или минимально  |
| `localStorage.setItem` напрямую   | `U.lsSet('heys_key', val)` — auto clientId    |
| Monkey patching `console.*`       | Простой wrapper если нужен                    |
| FPS/memory profiling              | Это nutrition app, не game engine             |
| Переписывать Legacy JS → TS       | Только по явному запросу                      |
| `select('*')` в Supabase          | `select('id, name, ...')` — конкретные поля   |
| Глобальные listeners без cleanup  | `addEventListener` + cleanup в unmount        |
| ASCII navigation maps в JS        | 1-line JSDoc: `// file.js — description`      |
| **Inline styles в JSX**           | **Tailwind классы** (см. секцию CSS)          |
| **Произвольные CSS классы**       | **BEM-naming** `.block__element--modifier`    |
| **Стили в `<style>` тегах**       | **Tailwind или `styles/heys-components.css`** |
| **Дублирование стилей**           | **Переиспользуй существующие классы**         |

---

## 🎨 CSS & Стили

### Единый источник правды

```
apps/web/
├── styles/heys-components.css  # Компонентные стили (BEM)
├── index.html                  # Только Tailwind классы
└── *.js                        # React: только Tailwind, НЕ inline styles
```

### Правила стилей

| Тип                         | Где писать                        | Пример                                   |
| --------------------------- | --------------------------------- | ---------------------------------------- |
| **Layout, spacing, colors** | Tailwind в JSX                    | `className="flex gap-2 bg-blue-500"`     |
| **Сложная анимация**        | `styles/heys-components.css`      | `.meal-card { animation: slideIn 0.2s }` |
| **Повторяющийся компонент** | CSS класс в `heys-components.css` | `.btn-primary`, `.card-meal`             |
| **Одноразовый стиль**       | Tailwind arbitrary                | `className="w-[73px]"`                   |

### BEM Naming Convention

```css
/* ✅ Правильно — BEM */
.water-tracker {
} /* Block */
.water-tracker__button {
} /* Element */
.water-tracker__button--active {
} /* Modifier */

/* 🚫 Запрещено — произвольные имена */
.drink-btn {
}
.waterBtn {
}
.my-water-button {
}
```

### Чеклист перед добавлением стилей

1. ❓ **Можно ли сделать Tailwind?** → Да = используй Tailwind
2. ❓ **Стиль уже существует?** → Поищи в `heys-components.css`
3. ❓ **Это повторяющийся паттерн?** → Создай BEM-класс в CSS файле
4. ❓ **Inline style необходим?** → Только для динамических значений (`style={{ width: \`${pct}%\` }}`)

### Частые ошибки стилей

| Код  | Ошибка                  | Решение                                              |
| ---- | ----------------------- | ---------------------------------------------------- |
| S001 | Inline styles в JSX     | `style={{color:'red'}}` → `className="text-red-500"` |
| S002 | Стили в `<style>` теге  | Перенести в `heys-components.css`                    |
| S003 | Произвольное имя класса | Использовать BEM: `.block__element--modifier`        |
| S004 | Дублирование стилей     | Найти и переиспользовать существующий класс          |
| S005 | `!important`            | Увеличить специфичность или рефакторить              |

---

## 🔧 CSS Refactoring Rules

### 🚫 NO-TOUCH ZONES (не трогать без явного запроса!)

- `@keyframes` — все анимации
- `.confetti-*` — confetti эффекты
- `.water-ring`, `.water-splash` — водные анимации
- `safe-area` rules — iOS отступы
- `.mpc-*` — MealProductCard компоненты

### Правила рефакторинга CSS

| Правило                   | Описание                                   |
| ------------------------- | ------------------------------------------ |
| **Не трогать main.css**   | Только @import'ы, редактируй модули        |
| **Не снимать !important** | Без проверки конфликтов в light/dark       |
| **Скоупить классы**       | `.component__element` вместо `.element`    |
| **Фиксировать метрики**   | ДО и ПОСЛЕ: строки, !important, @keyframes |
| **Тест light/dark**       | После каждого блока правок                 |

### Модульная структура стилей

```
styles/modules/
├── 000-base-and-gamification.css  # Base, confetti, achievements
├── 100-metrics-and-graphs.css     # Graphs, sparklines
├── 200-dark-and-effects.css       # Dark theme overrides
├── 300-modals-and-day.css         # Modals, day UI
├── 400-water-and-hydration.css    # Water tracker
├── 500-pwa-and-offline.css        # PWA, install prompts
└── 600-steps-and-aps.css          # Steps, APS flow
```

### Перед рефакторингом CSS — ОБЯЗАТЕЛЬНО:

1. **Запустить `pnpm css:audit`** — зафиксировать метрики
2. **Определить scope** — какой модуль затрагивается
3. **Проверить NO-TOUCH** — не ломаем ли анимации
4. **Тест после правок** — light mode + dark mode + mobile

---

## Commit Style

```bash
feat: add client selection modal
fix: resolve Supabase RLS permissions
refactor: simplify performance monitoring (-1099 lines)
chore: archive legacy performance monitor
docs: update architecture diagram
```
