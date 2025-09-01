# 📖 РУКОВОДСТВО ПО ИСПОЛЬЗОВАНИЮ ENHANCED ERROR LOGGING SYSTEM

## 🚀 Быстрый старт

### Автоматическая инициализация

Система автоматически инициализируется при загрузке страниц диагностического
центра. Все компоненты будут доступны глобально:

- `window.enhancedLogger` - основной логгер
- `window.errorDashboard` - real-time dashboard
- `window.StackTraceAnalyzer` - анализатор стеков
- `window.ErrorClassificationEngine` - классификатор ошибок

### Проверка работоспособности

Запустите диагностический центр и найдите тест "Enhanced Error Logging" - он
должен показать зеленый статус.

## 🔧 Основные возможности

### 1. Автоматическое логирование

Система автоматически перехватывает:

- `console.error()` и `console.warn()`
- JavaScript ошибки (`window.onerror`)
- Unhandled Promise rejections
- Ошибки из HEYS модулей

### 2. Real-time мониторинг

Dashboard отображается в правом верхнем углу экрана с:

- Статистикой ошибок по уровням
- Графиком ошибок по времени
- Списком последних ошибок
- Фильтрацией и поиском

### 3. Детальная классификация

Автоматическое определение типов ошибок:

- **HEYS-специфичные** (core, storage, user, diagnostics, reports)
- **Общие типы** (module, type, syntax, network, performance, security)
- **Уровни критичности** (critical, high, medium, low)

### 4. Умные рекомендации

Для каждой ошибки генерируются:

- Специфичные рекомендации по исправлению
- Общие рекомендации по категории
- HEYS-специфичные советы

## 💻 Программное использование

### Ручное логирование

```javascript
// Основные методы
enhancedLogger.logError('Критическая ошибка', {
  module: 'heys_core',
  action: 'initialization',
  details: error.message,
});

enhancedLogger.logWarning('Предупреждение о производительности', {
  loadTime: 5000,
  threshold: 3000,
});

enhancedLogger.logInfo('Информационное сообщение', {
  event: 'user_action',
  timestamp: Date.now(),
});
```

### Получение статистики

```javascript
const stats = enhancedLogger.getStats();
console.log(`Всего ошибок: ${stats.total}`);
console.log(`По уровням:`, stats.byLevel);
console.log(`По типам:`, stats.byType);
```

### Фильтрация логов

```javascript
// Последние ошибки за час
const recentErrors = enhancedLogger.getLogs({
  level: 'error',
  since: Date.now() - 60 * 60 * 1000,
});

// Поиск по тексту
const searchResults = enhancedLogger.getLogs({
  searchText: 'HEYS.core',
});

// HEYS-специфичные ошибки
const heysErrors = enhancedLogger.getLogs({
  classification: 'heys-core',
});
```

### Экспорт данных

```javascript
// JSON экспорт
const jsonReport = enhancedLogger.exportLogs('json');

// CSV экспорт
const csvReport = enhancedLogger.exportLogs('csv');

// Сохранение в файл
const blob = new Blob([jsonReport], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'error-report.json';
a.click();
```

## 🎛️ Настройки и конфигурация

### Базовые настройки

```javascript
enhancedLogger.setConfig({
  maxLogs: 2000, // Максимум логов в памяти
  logLevels: ['error', 'warning'], // Отслеживаемые уровни
  autoClassify: true, // Автоклассификация
  realTimeUpdates: true, // Real-time обновления
  detailedStackTrace: true, // Детальный анализ стека
  performanceTracking: false, // Отключить мониторинг производительности
});
```

### Управление dashboard

```javascript
// Пауза/запуск мониторинга
errorDashboard.togglePause();

// Очистка данных
errorDashboard.clearDashboard();

// Обновление фильтров
errorDashboard.updateFilter('level', 'error');
errorDashboard.updateFilter('timeRange', '1h');
errorDashboard.updateFilter('searchText', 'HEYS');
```

### Подписка на события

```javascript
// Слушатель новых логов
enhancedLogger.addListener((logEntry) => {
  if (logEntry.level === 'error') {
    console.log('Новая ошибка:', logEntry.title);
  }
});

// Event-based подход
window.addEventListener('enhancedLogEntry', (event) => {
  const logEntry = event.detail;
  // Обработка нового лога
});
```

## 📊 Интеграция с HEYS

### Автоматическая интеграция

Система автоматически интегрируется с:

- `heys_advanced_error_tracker_v1.js`
- Всеми модулями HEYS namespace
- Диагностической системой

### Расширение для модулей HEYS

```javascript
// В ваших HEYS модулях
if (window.enhancedLogger) {
  // Логирование с контекстом модуля
  window.enhancedLogger.logError('Module initialization failed', {
    module: 'heys_custom_module',
    version: '1.0.0',
    context: {
      /* дополнительные данные */
    },
  });
}
```

## 🔍 Диагностика и отладка

### Проверка состояния системы

```javascript
// Основные проверки
console.log('Logger active:', enhancedLogger.isActive);
console.log('Session ID:', enhancedLogger.sessionId);
console.log('Total logs:', enhancedLogger.logs.length);

// Проверка компонентов
console.log('Stack analyzer:', !!enhancedLogger.stackAnalyzer);
console.log('Error classifier:', !!enhancedLogger.errorClassifier);
console.log('Dashboard:', !!window.errorDashboard);
```

### Тестирование системы

```javascript
// Запуск полного тестирования
const tester = new EnhancedErrorLoggingTests();
const results = await tester.runAllTests();
console.log(`Тестов прошло: ${results.passed}/${results.total}`);
```

### Отладочные команды

```javascript
// Генерация тестовых ошибок
console.error('Test error for debugging');
console.warn('Test warning for debugging');

// Очистка и перезапуск
enhancedLogger.clearLogs();
enhancedLogger.restart();

// Остановка/запуск
enhancedLogger.stop();
enhancedLogger.start();
```

## 📱 Клавиатурные сокращения

- `Ctrl+Shift+E` - пауза/запуск real-time dashboard
- Двойной клик на заголовке dashboard - минимизация
- Клик вне модального окна - закрытие

## ⚠️ Важные замечания

### Производительность

- Система оптимизирована для минимального влияния на производительность
- Автоматическое управление размером логов (по умолчанию 1000 записей)
- Умная фильтрация для предотвращения спама

### Безопасность

- Не логирует чувствительные данные автоматически
- Возможность настройки уровней логирования
- Локальное хранение данных (не отправляется на сервер)

### Совместимость

- Работает во всех современных браузерах
- Совместимо с существующей экосистемой HEYS
- Не ломает существующие error handlers

## 🆘 Решение проблем

### Dashboard не отображается

```javascript
// Принудительная инициализация
window.errorDashboard = new RealTimeErrorDashboard();
```

### Логи не перехватываются

```javascript
// Проверка активности
console.log('Logger active:', enhancedLogger.isActive);

// Перезапуск перехвата
enhancedLogger.setupConsoleInterceptor();
```

### Высокое потребление памяти

```javascript
// Уменьшение буфера логов
enhancedLogger.setConfig({ maxLogs: 500 });

// Ручная очистка
enhancedLogger.clearLogs();
```

---

**Автор системы:** AI Assistant  
**Версия:** 1.0.0  
**Дата создания:** 26 августа 2025  
**Статус:** ✅ Готово к использованию
