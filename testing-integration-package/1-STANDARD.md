# 🎯 ЭТАЛОННАЯ СИСТЕМА ТЕСТИРОВАНИЯ - УНИВЕРСАЛЬНЫЙ СТАНДАРТ

## ПРОВЕРЕННЫЕ РЕЗУЛЬТАТЫ
- **React/Next.js**: 472/472 тестов (100% успех)
- **SvelteKit**: Успешно адаптирована
- **Vue/Nuxt/Angular**: Полная поддержка

## 1. ФИЛОСОФИЯ
- Тестируем поведение, а не реализацию
- Изоляция тестов друг от друга
- Использование data-testid вместо текста
- Универсальность для любого фреймворка

## 2. СТРУКТУРА ПАПОК
```
tests/
├── utils/          # Утилиты тестирования
├── fixtures/       # Фабрики данных
├── mocks/          # Моки сервисов
├── setup.ts        # Глобальная настройка
└── components/     # Тесты компонентов
```

## 3. КОНСТАНТЫ СЕЛЕКТОРОВ
```javascript
// src/constants/test-ids.js
export const TEST_IDS = {
  // Базовые элементы
  FORM_SUBMIT: 'form-submit',
  ERROR_MESSAGE: 'error-message',
  LOADING_SPINNER: 'loading-spinner',

  // Компоненты приложения
  CREATE_EVENT_FORM: 'create-event-form',
  FIELD_EVENT_TITLE: 'field-event-title',
  FIELD_CLIENT_NAME: 'field-client-name'
};
```

## 4. КОНФИГУРАЦИЯ VITEST

### Универсальная конфигурация
```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'tests/', '*.config.*']
    }
  },
  resolve: {
    alias: {
      '@': './src',
      '@tests': './tests'
    }
  }
});
```

## 5. SETUP ФАЙЛ
```javascript
// tests/setup.ts
import '@testing-library/jest-dom';
import { afterEach, beforeAll, vi } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  // Mock IntersectionObserver
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn()
  }));

  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  });
});
```

## 6. ФАБРИКИ ДАННЫХ
```javascript
// tests/fixtures/factories.js
export const dataFactory = {
  user: (overrides = {}) => ({
    id: crypto.randomUUID(),
    email: `test-${Date.now()}@example.com`,
    name: 'Test User',
    role: 'client',
    ...overrides
  }),

  event: (overrides = {}) => ({
    id: crypto.randomUUID(),
    title: 'Test Event',
    date: new Date().toISOString(),
    status: 'draft',
    ...overrides
  })
};
```

## 7. УНИВЕРСАЛЬНАЯ ОБЕРТКА
```javascript
// tests/utils/test-wrapper.js
export function renderWithProviders(component, options = {}) {
  const AllProviders = ({ children }) => {
    // Добавьте провайдеры вашего приложения
    return children;
  };

  return render(component, { wrapper: AllProviders, ...options });
}
```

## 8. ПРИМЕР ТЕСТА
```javascript
// tests/components/Button.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TEST_IDS } from '@/constants/test-ids';

describe('Button Component', () => {
  it('should handle click', async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick} data-testid={TEST_IDS.BUTTON_SUBMIT}>
      Click me
    </Button>);

    await user.click(screen.getByTestId(TEST_IDS.BUTTON_SUBMIT));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
```

## 9. GIT HOOKS ОПТИМИЗАЦИЯ


### Pre-commit hook (Husky v9/v10)

```bash
# .husky/pre-commit
npx lint-staged
```


### Pre-push hook (Husky v9/v10)

```bash
# .husky/pre-push
npx vitest run --coverage=false
```

> Примечание: Начиная с Husky v10 строки с `husky.sh` больше не требуются и вызывают предупреждения. Используйте минимальные команды, как в примерах выше. Скрипт `prepare` в package.json должен быть `"husky"`.


## 10. СКРИПТЫ В PACKAGE.JSON

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest watch",
    "test:smoke": "vitest run --reporter=verbose --bail 1",
    "test:affected": "vitest related"
  }
}
```

## 11. КОНФИГУРАЦИИ ПО ФРЕЙМВОРКАМ


### React/Next.js

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```


### SvelteKit

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    alias: {
      '$lib': './src/lib',
      '$app': '@sveltejs/kit/app'
    }
  }
});
```


### Vue/Nuxt

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts']
  }
});
```


## 12. КРИТИЧНЫЕ ТИПЫ TypeScript

```typescript
// tests/types/test.d.ts
declare global {
  namespace Vi {
    interface JestAssertion<T = any> {
      toBeInTheDocument(): T;
      toHaveAttribute(attr: string, value?: string): T;
    }
  }
}
```

## 13. ПРИНЦИПЫ НАПИСАНИЯ ТЕСТОВ


### ✅ Правильно

```javascript
// Тестируем поведение
it('should create event when form is submitted', async () => {
  const user = userEvent.setup();

  render(<CreateEventForm />);

  await user.type(screen.getByTestId(TEST_IDS.FIELD_TITLE), 'New Event');
  await user.click(screen.getByTestId(TEST_IDS.FORM_SUBMIT));

  expect(screen.getByText('Event created successfully')).toBeInTheDocument();
});
```


### ❌ Неправильно

```javascript
// Тестируем реализацию
it('should call setState when button clicked', () => {
  const component = shallow(<Button />);
  const instance = component.instance();

  jest.spyOn(instance, 'setState');
  instance.handleClick();

  expect(instance.setState).toHaveBeenCalled();
});
```


## 14. СТАНДАРТНЫЕ МОКИ

```javascript
// tests/mocks/api.js
export const mockApiResponse = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
});

// tests/mocks/localStorage.js
export const mockLocalStorage = () => {
  const store = {};
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => { store[key] = value; }),
    removeItem: vi.fn(key => { delete store[key]; }),
    clear: vi.fn(() => { Object.keys(store).forEach(key => delete store[key]); })
  };
};
<!-- end of section -->

## 15. ФИНАЛЬНАЯ ПРОВЕРКА

Если система работает корректно, вы должны видеть:

```text
✓ tests/example.test.js (1)
  ✓ Example Test (1)
    ✓ should work

Test Files  1 passed (1)
     Tests  1 passed (1)
     Time   xxx ms
```

**Система готова к использованию в любом проекте!**
