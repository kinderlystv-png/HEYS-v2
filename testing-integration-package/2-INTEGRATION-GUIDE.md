# 🤖 РУКОВОДСТВО ПО ИНТЕГРАЦИИ ДЛЯ ИИ-АССИСТЕНТОВ

## 🎯 ЦЕЛЬ
Полная автоматизация внедрения эталонной системы тестирования в любой проект с помощью ИИ-ассистента.

## 📋 ЧЕКЛИСТ ИНТЕГРАЦИИ

### ✅ Этап 1: Анализ проекта

1. **Определить фреймворк**
   ```bash
   # Поиск package.json
   find . -name "package.json" -type f

   # Анализ зависимостей
   grep -E "(react|vue|svelte|angular)" package.json
   ```

2. **Проверить структуру**
   ```bash
   # Есть ли папка tests?
   ls -la | grep tests

   # Есть ли папка src?
   ls -la | grep src
   ```

3. **Анализ существующих тестов**
   ```bash
   # Поиск тестов
   find . -name "*.test.*" -o -name "*.spec.*"
   ```

### ✅ Этап 2: Подготовка окружения

1. **Установка зависимостей**
   ```bash
   # Базовые пакеты
   npm install -D vitest @testing-library/jest-dom

   # React
   npm install -D @testing-library/react @testing-library/user-event @vitejs/plugin-react

   # Vue
   npm install -D @testing-library/vue @vitejs/plugin-vue

   # Svelte
   npm install -D @testing-library/svelte @testing-library/user-event
   ```

2. **Создание структуры папок**
   ```bash
   mkdir -p tests/{utils,fixtures,mocks,components}
   mkdir -p src/constants
   ```

### ✅ Этап 3: Базовая конфигурация

1. **Создать vitest.config.js**
   - Скопировать из `1-STANDARD.md` секцию 4
   - Адаптировать под найденный фреймворк (секция 11)

2. **Создать tests/setup.ts**
   - Скопировать из `1-STANDARD.md` секцию 5

3. **Обновить package.json**
   - Добавить скрипты из секции 10

### ✅ Этап 4: Создание базовых файлов

1. **tests/utils/test-wrapper.js**
   ```javascript
   // Базовая версия - адаптировать под фреймворк
   export function renderWithProviders(component, options = {}) {
     return render(component, options);
   }
   ```

2. **tests/fixtures/factories.js**
   - Скопировать из `1-STANDARD.md` секцию 6
   - Адаптировать под модели проекта

3. **src/constants/test-ids.js**
   - Скопировать базовые константы из секции 3
   - Добавить специфичные для проекта

### ✅ Этап 5: Создание тестового примера

1. **Простой тест**
   ```javascript
   // tests/example.test.js
   import { describe, it, expect } from 'vitest';

   describe('Setup Test', () => {
     it('should work', () => {
       expect(true).toBe(true);
     });
   });
   ```

2. **Запуск и проверка**
   ```bash
   npm run test
   ```

### ✅ Этап 6: Первый компонентный тест

1. **Найти простой компонент**
   ```bash
   # Поиск кнопок/простых компонентов
   find src -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" | head -5
   ```

2. **Создать тест**
   - Использовать пример из секции 8 в `1-STANDARD.md`
   - Адаптировать под найденный компонент

## 🔧 ШАБЛОНЫ ПО ФРЕЙМВОРКАМ

### React/Next.js
```javascript
// tests/utils/test-wrapper.js
import { render } from '@testing-library/react';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}

// tests/components/Example.test.jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../utils/test-wrapper';
import Button from '@/components/Button';

describe('Button', () => {
  it('should render', () => {
    renderWithProviders(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

### Vue/Nuxt
```javascript
// tests/utils/test-wrapper.js
import { render } from '@testing-library/vue';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}

// tests/components/Example.test.js
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/vue';
import { renderWithProviders } from '../utils/test-wrapper';
import Button from '@/components/Button.vue';

describe('Button', () => {
  it('should render', () => {
    renderWithProviders(Button, { slots: { default: 'Click me' } });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

### SvelteKit
```javascript
// tests/utils/test-wrapper.js
import { render } from '@testing-library/svelte';

export function renderWithProviders(component, options = {}) {
  return render(component, options);
}

// tests/components/Example.test.js
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithProviders } from '../utils/test-wrapper';
import Button from '$lib/components/Button.svelte';

describe('Button', () => {
  it('should render', () => {
    renderWithProviders(Button, { props: { children: 'Click me' } });
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
```

## 🚨 КРИТИЧНЫЕ ПРОВЕРКИ

### 1. TypeScript Support
```bash
# Если есть TypeScript
npm install -D @types/jsdom

# Создать tests/types/test.d.ts
echo 'import "@testing-library/jest-dom";' > tests/types/test.d.ts
```

### 2. Path Aliases
```javascript
// Проверить и адаптировать aliases в vitest.config.js
resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '~': path.resolve(__dirname, './'),
    '$lib': path.resolve(__dirname, './src/lib') // SvelteKit
  }
}
```

### 3. Environment Variables
```javascript
// vitest.config.js - если нужны env переменные
test: {
  env: {
    NODE_ENV: 'test'
  }
}
```

## 📊 ВАЛИДАЦИЯ ИНТЕГРАЦИИ

### Тесты должны проходить
```bash
npm run test
# ✓ tests/example.test.js (1)
#   ✓ Setup Test (1)
#     ✓ should work
```

### Coverage должен работать
```bash
npm run test:coverage
# % Coverage report from v8
```

### TypeScript должен компилироваться
```bash
npx tsc --noEmit
# No errors
```

## 🎭 ГОТОВЫЕ КОМАНДЫ ДЛЯ ИИ

### Полная установка React
```bash
npm install -D vitest @testing-library/jest-dom @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom
mkdir -p tests/{utils,fixtures,mocks,components} src/constants
```

### Полная установка Vue
```bash
npm install -D vitest @testing-library/jest-dom @testing-library/vue @testing-library/user-event @vitejs/plugin-vue jsdom
mkdir -p tests/{utils,fixtures,mocks,components} src/constants
```

### Полная установка Svelte
```bash
npm install -D vitest @testing-library/jest-dom @testing-library/svelte @testing-library/user-event jsdom
mkdir -p tests/{utils,fixtures,mocks,components} src/constants
```

## ⚡ БЫСТРЫЙ СТАРТ ДЛЯ ИИ

1. **Определить фреймворк** (package.json dependencies)
2. **Выполнить команду установки** (см. выше)
3. **Скопировать конфигурации** из `1-STANDARD.md`
4. **Создать пример теста**
5. **Запустить `npm run test`**
6. **При успехе - писать реальные тесты**

## 🔄 АЛГОРИТМ ДЕЙСТВИЙ ИИ

```
ЕСЛИ package.json содержит "react" ИЛИ "next":
  - Использовать React setup
  - Копировать React конфигурацию
  - Создать React test wrapper

ИНАЧЕ ЕСЛИ package.json содержит "vue" ИЛИ "nuxt":
  - Использовать Vue setup
  - Копировать Vue конфигурацию
  - Создать Vue test wrapper

ИНАЧЕ ЕСЛИ package.json содержит "svelte":
  - Использовать Svelte setup
  - Копировать Svelte конфигурацию
  - Создать Svelte test wrapper

ИНАЧЕ:
  - Запросить уточнение фреймворка
  - Предложить варианты
```

**Результат: Готовая система тестирования за 5 минут!**
