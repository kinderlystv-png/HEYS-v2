# 🚨 ДИАГНОСТИКА И РЕШЕНИЕ ПРОБЛЕМ

## 🔍 ЧАСТЫЕ ОШИБКИ И РЕШЕНИЯ

### ❌ Ошибка: "Cannot resolve '@testing-library/jest-dom'"

**Причина:** Отсутствует установка или неправильный импорт

**Решение:**

```bash
npm install -D @testing-library/jest-dom
```

```javascript
// tests/setup.ts
import '@testing-library/jest-dom';
```

### ❌ Ошибка: "ReferenceError: global is not defined"

**Причина:** Проблемы с jsdom окружением

**Решение:**

```javascript
// vitest.config.js
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

### ❌ Ошибка: "Cannot find module '@/...'"

**Причина:** Неправильные path aliases

**Решение:**

```javascript
// vitest.config.js
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
```

### ❌ Ошибка: "TypeError: Cannot read property 'pathname' of undefined"

**Причина:** Отсутствует мок window.location для Next.js

**Решение:**

```javascript
// tests/setup.ts
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    search: '',
    hash: '',
    href: 'http://localhost:3000'
  }
});
```

### ❌ Ошибка: "IntersectionObserver is not defined"

**Причина:** API браузера недоступно в тестовом окружении

**Решение:**

```javascript
// tests/setup.ts
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}));
```

### ❌ Ошибка: "window.matchMedia is not a function"

**Причина:** CSS Media Queries API недоступно

**Решение:**

```javascript
// tests/setup.ts
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }))
});
```

## 🎭 ПРОБЛЕМЫ ПО ФРЕЙМВОРКАМ

### React/Next.js Специфичные

**❌ "useRouter is not defined"**

```javascript
// tests/mocks/next-router.js
import { vi } from 'vitest';

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  pathname: '/',
  query: {},
  asPath: '/'
};

vi.mock('next/router', () => ({
  useRouter: () => mockRouter
}));
```

**❌ "Image optimization error"**

```javascript
// vitest.config.js
export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts']
  }
});

// tests/setup.ts
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }) => ({
    type: 'img',
    props: { src, alt, ...props }
  })
}));
```

### Vue/Nuxt Специфичные

**❌ "createApp is not a function"**

```javascript
// tests/utils/test-wrapper.js
import { render } from '@testing-library/vue';
import { createApp } from 'vue';

export function renderWithProviders(component, options = {}) {
  return render(component, {
    global: {
      plugins: [/* ваши плагины */]
    },
    ...options
  });
}
```

**❌ "$nuxt is not defined"**

```javascript
// tests/setup.ts
global.$nuxt = {
  $router: {
    push: vi.fn(),
    replace: vi.fn()
  }
};
```

### SvelteKit Специфичные

**❌ "Cannot resolve '$app/stores'"**

```javascript
// vitest.config.js
export default defineConfig({
  test: {
    alias: {
      '$app': '@sveltejs/kit/app'
    }
  }
});
```

**❌ "page store is not readable"**

```javascript
// tests/mocks/svelte-stores.js
import { readable } from 'svelte/store';

export const page = readable({
  url: new URL('http://localhost'),
  params: {}
});
```

## 🔧 ДИАГНОСТИЧЕСКИЕ КОМАНДЫ

### Проверка установки

```bash
# Проверить Vitest
npx vitest --version

# Проверить зависимости
npm ls @testing-library/jest-dom
npm ls @testing-library/react  # или vue/svelte
```

### Отладка конфигурации

```bash
# Показать конфигурацию Vitest
npx vitest --config

# Проверить TypeScript
npx tsc --noEmit --skipLibCheck
```

### Запуск с отладкой

```bash
# Подробный вывод
npm run test -- --reporter=verbose

# Только определенный тест
npm run test -- tests/example.test.js

# С покрытием
npm run test -- --coverage
```

## 🛠️ ПОШАГОВАЯ ДИАГНОСТИКА

### Шаг 1: Базовая проверка

```javascript
// tests/diagnostic.test.js
import { describe, it, expect } from 'vitest';

describe('Diagnostic', () => {
  it('should have working vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have dom environment', () => {
    expect(typeof document).toBe('object');
  });
});
```

### Шаг 2: Проверка Testing Library

```javascript
// tests/diagnostic-dom.test.js
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react'; // или ваш фреймворк

describe('DOM Diagnostic', () => {
  it('should render simple element', () => {
    render(<div data-testid="test">Hello</div>);
    expect(screen.getByTestId('test')).toBeInTheDocument();
  });
});
```

### Шаг 3: Проверка импортов

```javascript
// tests/diagnostic-imports.test.js
import { describe, it, expect } from 'vitest';

describe('Import Diagnostic', () => {
  it('should import from src', async () => {
    try {
      // Попробуйте импортировать любой файл из src
      const module = await import('@/components/Button'); // или ваш путь
      expect(module).toBeDefined();
    } catch (error) {
      console.error('Import error:', error.message);
      throw error;
    }
  });
});
```

## 📊 ПРОИЗВОДИТЕЛЬНОСТЬ

### Медленные тесты

**Проблема:** Тесты выполняются долго

**Решения:**

```javascript
// vitest.config.js
export default defineConfig({
  test: {
    // Параллельность
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false
      }
    },

    // Таймауты
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
```

### Оптимизация моков

```javascript
// Ленивый импорт моков
vi.mock('@/lib/api', () => ({
  apiCall: vi.fn()
}));

// Очистка после каждого теста
afterEach(() => {
  vi.clearAllMocks();
});
```

## 🔄 МИГРАЦИЯ С ДРУГИХ ТЕСТОВЫХ БИБЛИОТЕК

### Jest → Vitest

```bash
# Удалить Jest
npm uninstall jest @types/jest

# Установить Vitest
npm install -D vitest

# Обновить scripts в package.json
# "test": "jest" → "test": "vitest"
```

### Cypress → Vitest

```javascript
// Вместо cy.get() использовать screen.getByTestId()
// Вместо cy.click() использовать userEvent.click()

// Было (Cypress)
cy.get('[data-testid="button"]').click();

// Стало (Vitest)
await user.click(screen.getByTestId('button'));
```

## 🆘 ЭКСТРЕННОЕ ВОССТАНОВЛЕНИЕ

### Если ничего не работает

```bash
# 1. Очистить кэш
rm -rf node_modules package-lock.json
npm install

# 2. Проверить Node.js версию
node --version  # Должна быть >= 16

# 3. Создать минимальную конфигурацию
echo "export default { test: { environment: 'jsdom' } }" > vitest.config.js

# 4. Создать простейший тест
echo "import { test, expect } from 'vitest'; test('works', () => { expect(true).toBe(true); });" > test.js

# 5. Запустить
npx vitest run test.js
```

### Откат к рабочему состоянию

```bash
# Сохранить текущие файлы
git add .
git commit -m "Before testing setup"

# При проблемах - откатиться
git reset --hard HEAD~1
```

## 📞 ПОДДЕРЖКА

При возникновении нестандартных проблем:

1. **Проверить версии** всех зависимостей
2. **Изучить логи** подробно
3. **Создать минимальный** воспроизводимый пример
4. **Сравнить с рабочим** проектом из примеров

**Помните: 99% проблем связаны с неправильной конфигурацией!**
