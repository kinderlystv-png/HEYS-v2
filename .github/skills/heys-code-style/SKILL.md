---
applyTo: "apps/web/**/*.js"
description: Стиль кода HEYS — запреты, паттерны, CSS
---

# HEYS Code Style Skill

> Активируется при написании/редактировании кода

## Триггеры (keywords)
- создай, добавь, напиши код
- рефакторинг, исправь
- стили, CSS, Tailwind

## Правила кода

### Запрещено → Правильно
| ❌ Нельзя | ✅ Правильно |
|-----------|-------------|
| `console.log` напрямую | `HEYS.analytics.trackError()` |
| `localStorage.setItem` | `U.lsSet('heys_key', val)` |
| `select('*')` в SQL | Конкретные поля |
| Inline styles | Tailwind классы |
| `cloud.client.rpc()` | `HEYS.YandexAPI.rpc()` |

### CSS
- **Tailwind first** — inline styles запрещены
- **BEM naming** для кастомных классов: `.block__element--modifier`
- Стили в `styles/heys-components.css`

### Commit style
```
feat: add client selection modal
fix: resolve Supabase RLS permissions
refactor: simplify performance monitoring
```

## Ключевые паттерны
```javascript
// Storage
U.lsSet('heys_products', products);  // с clientId namespace
HEYS.store.set('key', value);        // с cache + watchers

// API
const result = await HEYS.YandexAPI.rpc('get_shared_products', {});
```
