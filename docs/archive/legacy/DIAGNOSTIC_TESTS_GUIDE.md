# HEYS Diagnostic Tests Documentation

## Обзор системы тестирования

Система диагностики HEYS включает 23+ теста, разделенных на 6 категорий:

### Категории тестов

#### 🔧 Core Tests (5 тестов)

- **Config Parser** - Проверяет чтение и валидацию конфигурационного файла
- **Cache Invalidation** - Проверяет работу системы инвалидации кэша
- **Web Worker Fallback** - Проверяет fallback при недоступности Web Workers
- **Graceful Shutdown** - Проверяет корректное завершение работы системы
- **Version Mismatch Detector** - Проверяет детектор несовместимости версий

#### 🔒 Security Tests (4 теста)

- **Role Permission Matrix** - Проверяет матрицу прав доступа для разных ролей
- **Supabase RLS Security** - Проверяет Row Level Security в Supabase
- **Data Encryption** - Проверяет шифрование чувствительных данных
- **XSS Protection** - Проверяет защиту от XSS атак

#### ⚡ Performance Tests (4 теста)

- **Memory Leak Guard** - Проверяет отсутствие утечек памяти при множественных
  операциях
- **Large Dataset Rendering** - Проверяет производительность рендеринга больших
  списков
- **Database Query Performance** - Проверяет скорость выполнения запросов к базе
  данных
- **Bundle Size Check** - Проверяет размер загруженных скриптов

#### 🎨 UX Tests (5 тестов)

- **Real-Time Error Dashboard** - Проверяет обновление дашборда ошибок в
  реальном времени
- **Responsive Layout** - Проверяет адаптивность интерфейса под разные экраны
- **I18n Pluralization** - Проверяет корректную плюрализацию для русского языка
- **Dark Mode Contrast** - Проверяет контрастность в темной теме
- **Keyboard Navigation** - Проверяет доступность через клавиатуру

#### 📱 PWA Tests (5 тестов)

- **Service Worker Update Flow** - Проверяет процесс обновления Service Worker
- **PWA Installability** - Проверяет возможность установки как PWA
- **Offline Functionality** - Проверяет работу в offline режиме
- **Push Notifications** - Проверяет поддержку push уведомлений
- **WASM Fallback** - Проверяет fallback при недоступности WebAssembly

#### 🏛️ Legacy Tests (7 тестов)

- Старые тесты для обратной совместимости

## Профили запуска

### ⚡ Критические (KEEP)

Тесты с тегом `keep` - самые важные проверки (~10 тестов, ~30 секунд)

### 🏃‍♂️ Быстрые (KEEP + SIMPLIFY)

Критические + упрощенные тесты (~17 тестов, ~1 минута)

### 🚀 Полная диагностика

Все тесты кроме помеченных как `drop` (~20+ тестов, ~2 минуты)

### Категорийные профили

- **Core Tests** - только основные системные тесты
- **Security Tests** - только тесты безопасности
- **Performance Tests** - только тесты производительности
- **UX Tests** - только тесты пользовательского интерфейса
- **PWA Tests** - только тесты Progressive Web App

## Теги тестов

- `keep` - критически важные тесты
- `simplify` - упрощенные/быстрые тесты
- `drop` - устаревшие тесты (исключаются из полной диагностики)

## Тайм-ауты

- **Быстрые тесты**: 1000-2000ms
- **Средние тесты**: 3000-5000ms
- **Медленные тесты**: 8000-10000ms

## Формат результатов

### Простой результат

```javascript
return true; // или false
```

### Расширенный результат

```javascript
return {
  success: true,
  details: 'Подробная информация о тесте',
  error: 'Сообщение об ошибке (если success: false)',
};
```

### JSON Summary

```javascript
{
    "timestamp": "2025-08-27T...",
    "passed": 18,
    "failed": 2,
    "results": [
        {
            "name": "Config Parser",
            "category": "core",
            "tags": ["keep", "core"],
            "ok": true,
            "reason": "",
            "description": "Проверяет чтение и валидацию конфигурационного файла"
        }
    ]
}
```

## Добавление новых тестов

```javascript
window.addTest({
  name: 'My Test',
  category: 'core', // core, security, performance, ux, pwa
  tags: ['keep'], // keep, simplify, drop
  timeout: 3000,
  description: 'Описание теста',
  fn: async function () {
    // Логика теста
    return {
      success: true,
      details: 'Test passed',
    };
  },
});
```

## Мониторинг производительности

### Memory Leak Guard

- Выполняет 100 операций генерации отчетов
- Считает успешным прирост памяти < 2MB
- Использует `performance.memory.usedJSHeapSize`

### Large Dataset Rendering

- Рендерит 1000 элементов
- Считает успешным время < 100ms
- Поддерживает виртуальные списки

### Database Query Performance

- Проверяет IndexedDB, Supabase, LocalStorage
- Тайм-ауты: IndexedDB < 1s, Supabase < 2s, LocalStorage < 10ms

## Troubleshooting

### Частые проблемы

1. **Тесты не загружаются** - проверьте console на ошибки загрузки модулей
2. **Тайм-ауты** - увеличьте timeout для медленных тестов
3. **Ложные провалы** - проверьте зависимости и состояние системы
4. **Memory leaks** - используйте `performance.memory` и принудительную сборку
   мусора

### Debug режим

1. Откройте Console (F12)
2. Найдите "HEYS-Diag-Summary" для JSON результатов
3. Используйте `console.table(diagResults)` для табличного вида

## CI/CD Integration

```yaml
# .github/workflows/tests.yml
- name: Critical Tests
  run: curl -s http://localhost:8000/TESTS/api/run?profile=keep

- name: Full Tests
  run: curl -s http://localhost:8000/TESTS/api/run?profile=all
```

## Метрики качества

- **Покрытие**: ~95% функциональности HEYS
- **Скорость**: Критические тесты за 30 секунд
- **Надежность**: Менее 5% ложных провалов
- **Поддержка**: Автоматическое обнаружение изменений в коде
