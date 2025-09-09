# Error Handling Migration Guide - EAP 3.0

## Обзор

В рамках модернизации EAP 3.0 мы заменяем устаревшую систему обработки ошибок на современные TypeScript компоненты с улучшенной функциональностью и типизацией.

## Что изменилось

### Старая система
- `heys_error_boundary_v1.js` - UMD-модуль с классовым компонентом
- Глобальная функция `window.HEYS.logError()`
- Отсутствие TypeScript типизации
- Ограниченная функциональность

### Новая система
- `ErrorBoundary.tsx` - современный TypeScript компонент
- `useErrorHandler` - хук для функциональных компонентов
- `errorLogger` - полнофункциональная система логирования
- Полная типизация и современный API

## Компоненты

### 1. ErrorBoundary (Class Component)

```tsx
import { ErrorBoundary } from '@heys/shared';

function App() {
  return (
    <ErrorBoundary
      fallback={<div>Что-то пошло не так</div>}
      onError={(error, errorInfo) => {
        // Обработка ошибки
        console.error('App error:', error);
      }}
      resetKeys={[userId, currentPage]}
    >
      <YourComponent />
    </ErrorBoundary>
  );
}
```

#### Пропсы ErrorBoundary

| Пропс | Тип | Описание |
|-------|-----|----------|
| `children` | `ReactNode` | Дочерние компоненты |
| `fallback` | `ReactNode` | UI для отображения при ошибке |
| `onError` | `(error, errorInfo) => void` | Коллбэк при ошибке |
| `resetOnPropsChange` | `boolean` | Сбрасывать состояние при изменении пропсов |
| `resetKeys` | `Array` | Ключи для автоматического сброса |

### 2. useErrorHandler (Hook)

```tsx
import { useErrorHandler } from '@heys/shared';

function MyComponent() {
  const { hasError, error, captureError, resetError } = useErrorHandler([userId], {
    onError: (error, context) => {
      console.error('Component error:', error);
    }
  });

  const handleAsyncOperation = async () => {
    try {
      await riskyAsyncOperation();
    } catch (error) {
      captureError(error, 'Async operation failed');
    }
  };

  if (hasError) {
    return (
      <div>
        <p>Ошибка: {error?.message}</p>
        <button onClick={resetError}>Повторить</button>
      </div>
    );
  }

  return <div>Normal component content</div>;
}
```

### 3. errorLogger (Service)

```typescript
import { errorLogger } from '@heys/shared';

// Настройка логгера
errorLogger.configure({
  apiEndpoint: '/api/errors',
  apiKey: 'your-api-key'
});

// Логирование ошибки
errorLogger.logError(new Error('Something went wrong'), {
  userId: '123',
  action: 'button_click',
  component: 'UserProfile'
});

// Получение логов
const logs = errorLogger.getLogs();
const persistedLogs = errorLogger.getPersistedLogs();

// Очистка логов
errorLogger.clearLogs();
```

### 4. withErrorHandler (HOC)

```tsx
import { withErrorHandler } from '@heys/shared';

const MyComponent = ({ data }) => {
  return <div>{data.map(item => <Item key={item.id} {...item} />)}</div>;
};

export default withErrorHandler(MyComponent, <div>Error in MyComponent</div>);
```

## Миграция

### Автоматическая миграция

Запустите скрипт миграции для автоматической замены устаревшего кода:

```bash
# Предварительный просмотр изменений
node scripts/migrate-error-handling.js --dry-run

# Применение изменений
node scripts/migrate-error-handling.js
```

### Ручная миграция

#### 1. Замена импортов

**До:**
```javascript
// Старый способ - UMD модуль
<script src="./misc/heys_error_boundary_v1.js"></script>
```

**После:**
```typescript
import { ErrorBoundary, errorLogger } from '@heys/shared';
```

#### 2. Замена использования ErrorBoundary

**До:**
```javascript
// Глобальный компонент
React.createElement(window.HEYS.ErrorBoundary, { children: ... })
```

**После:**
```tsx
<ErrorBoundary onError={errorLogger.logError}>
  {children}
</ErrorBoundary>
```

#### 3. Замена логирования ошибок

**До:**
```javascript
if (window.HEYS && window.HEYS.logError) {
  window.HEYS.logError(error, info);
}
```

**После:**
```typescript
errorLogger.logError(error, info);
```

#### 4. Миграция классовых компонентов

**До:**
```javascript
class MyComponent extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('Error:', error);
  }
  
  render() {
    return <div>{this.props.children}</div>;
  }
}
```

**После:**
```tsx
function MyComponent({ children }) {
  const { hasError, captureError } = useErrorHandler();
  
  useEffect(() => {
    const handleError = (error) => captureError(error);
    // Настройка обработчиков ошибок
  }, [captureError]);
  
  return <div>{children}</div>;
}
```

## Лучшие практики

### 1. Размещение ErrorBoundary

```tsx
// ✅ Хорошо - обёртка на высоком уровне
function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={
            <ErrorBoundary fallback={<ProfileError />}>
              <Profile />
            </ErrorBoundary>
          } />
        </Routes>
      </Router>
    </ErrorBoundary>
  );
}
```

### 2. Обработка асинхронных ошибок

```tsx
function AsyncComponent() {
  const { captureError } = useErrorHandler();
  
  const loadData = useCallback(async () => {
    try {
      const data = await fetchData();
      setData(data);
    } catch (error) {
      captureError(error, 'Failed to load data');
    }
  }, [captureError]);
  
  useEffect(() => {
    loadData();
  }, [loadData]);
}
```

### 3. Настройка логирования

```typescript
// В main.tsx или app.tsx
errorLogger.configure({
  apiEndpoint: process.env.REACT_APP_ERROR_ENDPOINT,
  apiKey: process.env.REACT_APP_ERROR_API_KEY
});
```

### 4. Кастомные fallback UI

```tsx
const CustomErrorFallback = ({ error, resetError }) => (
  <div className="error-container">
    <h2>Произошла ошибка</h2>
    <details>
      <summary>Детали ошибки</summary>
      <pre>{error.message}</pre>
    </details>
    <button onClick={resetError}>Попробовать снова</button>
  </div>
);

<ErrorBoundary fallback={<CustomErrorFallback />}>
  <MyComponent />
</ErrorBoundary>
```

## Устранение неполадок

### Типичные проблемы

1. **Import ошибки**
   ```
   Error: Cannot find module '@heys/shared'
   ```
   Решение: Убедитесь, что пакет `@heys/shared` установлен и правильно экспортирует компоненты.

2. **React не найден**
   ```
   Error: React is not defined
   ```
   Решение: Добавьте `import React from 'react'` в файлы с JSX.

3. **Конфликт глобальных типов**
   ```
   Error: Property 'HEYS' already declared
   ```
   Решение: Удалите старые объявления типов из legacy файлов.

### Отладка

Включите детальное логирование для отладки:

```typescript
// В development режиме
if (process.env.NODE_ENV === 'development') {
  window.addEventListener('error', (event) => {
    console.log('Global error:', event.error);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    console.log('Unhandled promise rejection:', event.reason);
  });
}
```

## Совместимость

### Обратная совместимость

Новая система поддерживает обратную совместимость:

```typescript
// Legacy код продолжит работать
if (window.HEYS?.logError) {
  window.HEYS.logError(error, info);
}

// Но рекомендуется использовать новый API
errorLogger.logError(error, info);
```

### Поэтапная миграция

1. **Этап 1**: Установите новые компоненты параллельно со старыми
2. **Этап 2**: Мигрируйте критически важные компоненты
3. **Этап 3**: Замените остальные компоненты
4. **Этап 4**: Удалите legacy код

## Дополнительные ресурсы

- [React Error Boundaries](https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary)
- [Error Handling in React](https://react.dev/learn/error-boundaries)
- [TypeScript Best Practices](https://typescript-eslint.io/rules/)

---

*Этот документ является частью модернизации EAP 3.0. Для вопросов обращайтесь к команде разработки.*
