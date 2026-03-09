---
name: heys-testing
description: 'Testing patterns for HEYS: Vitest unit tests, Playwright e2e'
---

# 🧪 HEYS Testing Skill

> Vitest (unit), Playwright (e2e), test patterns

---

## 🔑 Когда активируется

- Файлы `*.test.ts`, `*.spec.ts`
- Написание/редактирование тестов
- Папки `__tests__/`, `TESTS/`, `e2e/`

---

## 🏗️ Структура тестов

```
HEYS-v2/
├── TESTS/
│   ├── e2e/                    # Playwright e2e тесты
│   │   ├── food-logging.spec.ts
│   │   ├── user-authentication.spec.ts
│   │   └── basic.spec.ts
│   ├── integration/            # Интеграционные
│   └── suites/                 # Тематические наборы
├── packages/
│   └── core/src/__tests__/     # Unit тесты пакета
└── vitest.config.ts            # Конфигурация Vitest
```

---

## ⚙️ Запуск тестов

```bash
# Все тесты
pnpm run test:all

# Только unit (Vitest)
pnpm test

# Только e2e (Playwright)
pnpm test:e2e

# Конкретный файл
pnpm vitest run path/to/file.test.ts
```

---

## 📝 Паттерны

### Vitest Unit Test

```typescript
import { describe, expect, it, vi } from 'vitest';

describe('MyModule', () => {
  it('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });

  it('should handle edge case', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### Playwright E2E Test

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('user can perform action', async ({ page }) => {
    await page.click('[data-testid="button"]');
    await expect(page.locator('[data-testid="result"]')).toBeVisible();
  });
});
```

---

## 🎯 Data-testid Convention

```html
<!-- Кнопки -->
<button data-testid="save-food-entry">Save</button>
<button data-testid="add-food-button">Add</button>

<!-- Инпуты -->
<input data-testid="food-name-input" />
<input data-testid="quantity-input" />

<!-- Контейнеры -->
<div data-testid="dashboard">...</div>
<div data-testid="food-entry">...</div>
```

**Формат:** `{action/type}-{entity}-{element}`

---

## ✅ Чеклист теста

1. **Название** — описывает что тестируется
2. **Arrange** — подготовка данных
3. **Act** — выполнение действия
4. **Assert** — проверка результата
5. **Cleanup** — очистка (если нужна)

---

## 🚫 Антипаттерны

| ❌ Нельзя             | ✅ Правильно                      |
| --------------------- | --------------------------------- |
| `test('test 1')`      | `test('should add food entry')`   |
| Хардкод селекторов    | `data-testid` атрибуты            |
| Sleep вместо ожидания | `await expect(...).toBeVisible()` |
| Зависимые тесты       | Изолированные тесты               |
| Тесты без assertions  | Минимум 1 expect                  |
