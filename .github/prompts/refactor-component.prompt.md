---
description: Рефакторинг React-компонента с оптимизацией рендеров
---

# Рефакторинг компонента

## Входные данные

- Файл: `{{filePath}}`
- Компонент: `{{componentName}}`
- Проблема: `{{problem}}`

## Анализ (Phase 0 — до начала)

1. Прочитать файл целиком, оценить LOC
2. Найти все зависимости:
   - Props (что получает)
   - Closures (какие переменные замыкает)
   - Handlers (какие обработчики создаёт)
   - Глобалы (`HEYS.*`, `window.*`)
3. Проверить `git status` — нет ли незакоммиченных изменений
4. Скриншот текущего UI (если визуальный компонент)

## Паттерны HEYS

```javascript
// ✅ Функциональный setState в useCallback
const handler = useCallback((param) => {
  setDay((prev) => ({ ...prev, field: newValue }));
}, []); // стабильная ссылка

// ✅ React.memo с кастомным компаратором (если props сложные)
const MyComponent = React.memo(
  function MyComponent(props) {
    // ...
  },
  (prev, next) => prev.id === next.id && prev.value === next.value,
);

// ❌ НЕ передавать Set/Map как props (ломает memo)
// ❌ НЕ замыкать day напрямую в useCallback
```

## Правила

- Tailwind first — inline styles запрещены
- `U.lsSet()`/`U.lsGet()` — не raw localStorage
- `HEYS.YandexAPI.rpc()` — не `cloud.client.rpc()`
- `console.info('[HEYS.module] ...')` — не `console.log`
- LOC ≤ 2000 на файл

## Чеклист после

- [ ] Нет новых ошибок в консоли
- [ ] UI визуально идентичен
- [ ] `pnpm type-check` проходит
- [ ] `pnpm lint` проходит
- [ ] Тест: основной flow работает
