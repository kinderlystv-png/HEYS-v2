# CuratorPanel - Панель куратора

Рефакторинг компонента панели куратора для улучшения читаемости,
производительности и поддержки.

## 📁 Структура проекта

```
CuratorPanel/
├── index.tsx                    # Главная точка входа
├── CuratorPanelContainer.tsx    # Контейнер с lazy loading
├── CuratorPanel.css            # Стили компонента
├── context/
│   └── CuratorContext.tsx       # Контекст для общих данных
├── hooks/
│   ├── useCuratorData.ts        # Хук для работы с API
│   ├── useUsersTab.ts          # Хук для вкладки пользователей
│   └── useTasksTab.ts          # Хук для вкладки задач
├── components/
│   ├── TabNavigation.tsx        # Навигация между вкладками
│   ├── UsersTabPanel/          # Компоненты вкладки пользователей
│   │   ├── index.tsx
│   │   └── components/
│   │       ├── ErrorAlert.tsx
│   │       ├── LoadingSpinner.tsx
│   │       ├── UserDetails.tsx
│   │       ├── UsersFilters.tsx
│   │       ├── UsersList.tsx
│   │       └── UsersStats.tsx
│   ├── TasksTabPanel/          # Компоненты вкладки задач (TODO)
│   ├── StatsTabPanel/          # Компоненты статистики (TODO)
│   └── SettingsTabPanel/       # Компоненты настроек (TODO)
├── types/
│   └── curator.types.ts        # TypeScript типы
├── utils/
│   └── logger.ts              # Утилита для логирования
└── __tests__/
    └── CuratorPanel.test.tsx   # Тесты компонента
```

## 🎯 Ключевые улучшения

### 1. Архитектурные изменения

- **Разделение ответственностей**: Каждый компонент имеет четкую роль
- **Custom hooks**: Бизнес-логика вынесена в переиспользуемые хуки
- **Контекст**: Общие данные управляются через React Context
- **Lazy loading**: Вкладки загружаются только при необходимости

### 2. Производительность

- **React.memo**: Предотвращение лишних ререндеров
- **useMemo/useCallback**: Мемоизация вычислений и функций
- **Оптимизированные запросы**: Параллельные API вызовы
- **Виртуализация**: Готовность к обработке больших списков

### 3. Типизация

- **Строгие типы**: Полная типизация всех данных и пропсов
- **Type safety**: Предотвращение ошибок времени выполнения
- **Автодополнение**: Улучшенный DX с IntelliSense

### 4. Тестируемость

- **Unit тесты**: Изолированное тестирование хуков
- **Component тесты**: Тестирование UI компонентов
- **Моки**: Простое мокирование зависимостей

## 🚀 Использование

### Базовое использование

```tsx
import CuratorPanel from '@/components/CuratorPanel';

const App = () => {
  return (
    <div className="app">
      <CuratorPanel />
    </div>
  );
};
```

### Использование хуков отдельно

```tsx
import { useCuratorData } from '@/components/CuratorPanel/hooks/useCuratorData';

const CustomComponent = () => {
  const { data, isLoading, error, refreshData } = useCuratorData();

  // Ваша логика...
};
```

### Доступ к контексту

```tsx
import { useCuratorContext } from '@/components/CuratorPanel/context/CuratorContext';

const ChildComponent = () => {
  const { curatorData, activeTab, setActiveTab } = useCuratorContext();

  // Ваша логика...
};
```

## 📊 API Reference

### Types

#### CuratorUser

```typescript
interface CuratorUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'curator' | 'moderator' | 'user';
  permissions: string[];
  status: 'active' | 'inactive' | 'suspended';
  createdAt: Date;
  updatedAt: Date;
  lastActivity?: Date;
  avatar?: string;
  metadata?: Record<string, unknown>;
}
```

#### CuratorTask

```typescript
interface CuratorTask {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in-progress' | 'completed' | 'rejected' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  assignedBy?: string;
  dueDate?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  attachments?: string[];
}
```

### Hooks

#### useCuratorData()

Основной хук для работы с данными куратора.

**Возвращает:**

```typescript
{
  data: CuratorDataResponse | null;
  isLoading: boolean;
  error: Error | null;
  refreshData: () => Promise<void>;
  updateUserRole: (userId: string, newRole: string) =>
    Promise<{ success: boolean; error?: string }>;
  updateTaskStatus: (taskId: string, newStatus: string) =>
    Promise<{ success: boolean; error?: string }>;
}
```

#### useUsersTab()

Хук для управления вкладкой пользователей.

**Возвращает:**

```typescript
{
  users: CuratorUser[];
  selectedUser: CuratorUser | null;
  userStats: UserStats;
  isLoading: boolean;
  error: Error | null;
  // Фильтры и сортировка
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  roleFilter: string;
  setRoleFilter: (role: string) => void;
  // ... другие фильтры
  // Действия
  handleUserSelect: (userId: string) => void;
  handleRoleUpdate: (userId: string, newRole: CuratorUserRole) => Promise<Result>;
  clearFilters: () => void;
  refreshData: () => Promise<void>;
}
```

## 🧪 Тестирование

### Запуск тестов

```bash
# Все тесты
npm test

# Только компонент CuratorPanel
npm test CuratorPanel

# Тесты в watch режиме
npm test -- --watch
```

### Пример теста

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CuratorPanel from '../index';

test('должен показывать список пользователей', async () => {
  render(<CuratorPanel />);

  await waitFor(() => {
    expect(screen.getByText('Управление пользователями')).toBeInTheDocument();
  });
});
```

## 🎨 Стилизация

Компонент использует CSS модули и CSS переменные для легкой кастомизации.

### Основные CSS классы

- `.curator-panel` - Корневой контейнер
- `.curator-tab-navigation` - Навигация по вкладкам
- `.users-tab-panel` - Вкладка пользователей
- `.user-card` - Карточка пользователя
- `.user-details` - Панель деталей пользователя

### Кастомизация тем

```css
.curator-panel {
  --primary-color: #007bff;
  --success-color: #28a745;
  --warning-color: #ffc107;
  --danger-color: #dc3545;
  --background-color: #f8f9fa;
}
```

## 🔄 Миграция с старой версии

1. **Импорты**: Обновите пути импортов

   ```typescript
   // Было
   import CuratorPanel from './CuratorPanel';

   // Стало
   import CuratorPanel from './CuratorPanel';
   ```

2. **Props**: Компонент больше не принимает пропсы, используйте контекст

   ```typescript
   // Было
   <CuratorPanel initialData={data} />

   // Стало
   <CuratorProvider initialTab="users">
     <CuratorPanel />
   </CuratorProvider>
   ```

3. **Callbacks**: Используйте хуки вместо callback пропсов

   ```typescript
   // Было
   <CuratorPanel onUserUpdate={handleUpdate} />

   // Стало
   const { updateUserRole } = useCuratorContext();
   ```

## 🚧 TODO

### Этап 2: Вкладки задач и статистики

- [ ] Создать TasksTabPanel с полным функционалом
- [ ] Добавить StatsTabPanel с графиками и метриками
- [ ] Интегрировать библиотеку графиков (Chart.js/Recharts)

### Этап 3: Настройки и права доступа

- [ ] Создать SettingsTabPanel
- [ ] Добавить управление правами доступа
- [ ] Интегрировать систему уведомлений

### Этап 4: Дополнительные возможности

- [ ] Добавить виртуализацию для больших списков
- [ ] Реализовать drag-and-drop для задач
- [ ] Добавить экспорт данных в различные форматы
- [ ] Интегрировать поиск с подсветкой

### Этап 5: Оптимизация

- [ ] Добавить Service Worker для кэширования
- [ ] Реализовать оптимистичные обновления
- [ ] Добавить скелетоны загрузки
- [ ] Настроить bundle анализ и tree shaking

## 🤝 Вклад в разработку

1. Форкните репозиторий
2. Создайте feature ветку (`git checkout -b feature/amazing-feature`)
3. Выберите intended scope и закоммитьте изменения после явного разрешения
   (`git add <files> && git commit -m 'Add amazing feature'`)
4. Запушьте в ветку только после явной команды на push
   (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📝 Лицензия

Этот проект лицензирован под MIT License.
