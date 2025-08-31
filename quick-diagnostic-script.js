/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА quick-diagnostic-script.js (112 строк)                     │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 📋 СТРУКТУРА ФАЙЛА:                                                                       │
│                                                                                           │
│ 🔧 ИНИЦИАЛИЗАЦИЯ ДИАГНОСТИКИ (строки 1-20):                                              │
│    ├── Заголовок и описание скрипта (1-5)                                               │
│    ├── Проверка наличия компонентов (8-12)                                              │
│    └── Вывод статуса системы (13-20)                                                    │
│                                                                                           │
│ 📊 ДИАГНОСТИКА ЛОГГЕРА (строки 21-60):                                                   │
│    ├── Проверка состояния logger (21-30)                                                │
│    ├── Вывод session ID и активности (31-40)                                            │
│    ├── Анализ массива логов (41-50)                                                     │
│    └── Тестирование методов логирования (51-60)                                         │
│                                                                                           │
│ 🎛️ ДИАГНОСТИКА DASHBOARD (строки 61-90):                                                │
│    ├── Проверка элементов UI (61-70)                                                    │
│    ├── Тестирование панелей (71-80)                                                     │
│    └── Проверка обновления в реальном времени (81-90)                                   │
│                                                                                           │
│ ⚡ ИТОГОВЫЕ ТЕСТЫ (строки 91-112):                                                        │
│    ├── Генерация тестовых ошибок (91-100)                                               │
│    ├── Проверка integration с основной системой (101-110)                               │
│    └── Финальный отчет диагностики (111-112)                                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

// 🔧 БЫСТРАЯ ПРОВЕРКА ENHANCED ERROR LOGGING
// Вставьте этот код в консоль браузера на странице с Dashboard

console.log('🔧 БЫСТРАЯ ДИАГНОСТИКА ENHANCED ERROR LOGGING');
console.log('==============================================');

// Проверяем наличие компонентов
const hasLogger = !!window.enhancedLogger;
const hasDashboard = !!window.errorDashboard;

console.log(`📊 Logger: ${hasLogger ? '✅ Найден' : '❌ Не найден'}`);
console.log(`🎛️ Dashboard: ${hasDashboard ? '✅ Найден' : '❌ Не найден'}`);

if (hasLogger) {
  const logger = window.enhancedLogger;

  console.log('\n📋 СОСТОЯНИЕ ЛОГГЕРА:');
  console.log(`   📍 Session ID: ${logger.sessionId}`);
  console.log(`   ⚡ Is Active: ${logger.isActive}`);
  console.log(`   📊 Logs Array Length: ${logger.logs?.length || 0}`);

  // Проверяем статистику
  const stats = logger.getStats();
  console.log(`   📈 Stats Total: ${stats.total}`);

  // Проверяем метод getLogs()
  console.log('\n🔍 ПРОВЕРКА МЕТОДА getLogs():');

  // Без фильтров
  const allLogs = logger.getLogs();
  console.log(`   📋 getLogs() без фильтров: ${allLogs.length} логов`);

  // С пустыми фильтрами
  const emptyFilter = logger.getLogs({});
  console.log(`   📋 getLogs({}) с пустыми фильтрами: ${emptyFilter.length} логов`);

  // С фильтром level: 'all'
  const allLevelFilter = logger.getLogs({ level: 'all' });
  console.log(`   📋 getLogs({level: 'all'}): ${allLevelFilter.length} логов`);

  // Прямой доступ к массиву
  console.log(`   📋 Прямой доступ logger.logs: ${logger.logs?.length || 0} логов`);

  // Создаем тестовый лог
  console.log('\n🧪 СОЗДАНИЕ ТЕСТОВОГО ЛОГА:');
  logger.logInfo('Quick Diagnostic Test', {
    source: 'quick_diagnostic',
    timestamp: Date.now(),
  });

  // Проверяем после создания
  const afterTest = logger.getLogs();
  console.log(`   📋 После создания теста: ${afterTest.length} логов`);
  console.log(`   📊 Обновленная статистика: ${logger.getStats().total}`);

  // Показываем последние логи
  if (afterTest.length > 0) {
    console.log('\n📝 ПОСЛЕДНИЕ ЛОГИ:');
    afterTest.slice(-3).forEach((log, index) => {
      console.log(`   ${index + 1}. [${log.level.toUpperCase()}] ${log.title}`);
    });
  }
} else {
  console.log('❌ Логгер недоступен! Попытка создания...');
  if (window.EnhancedErrorLogger) {
    window.enhancedLogger = new window.EnhancedErrorLogger();
    console.log('✅ Логгер создан вручную');
  }
}

// Проверяем Dashboard
if (hasDashboard) {
  const dashboard = window.errorDashboard;

  console.log('\n🎛️ СОСТОЯНИЕ DASHBOARD:');
  console.log(`   📡 Connected to logger: ${!!dashboard.logger}`);
  console.log(`   ⚡ Is Active: ${dashboard.isActive}`);

  if (dashboard.logger) {
    console.log('\n🔍 ПРОВЕРКА ЭКСПОРТА DASHBOARD:');

    // Симулируем экспорт
    const activeLogger = dashboard.logger;
    const allLogs = activeLogger.getLogs ? activeLogger.getLogs() : [];
    const directLogs = activeLogger.logs || [];
    const stats = activeLogger.getStats ? activeLogger.getStats() : {};

    console.log(`   📊 Stats total: ${stats.total}`);
    console.log(`   📋 getLogs() возвращает: ${allLogs.length} логов`);
    console.log(`   📋 Прямой доступ: ${directLogs.length} логов`);

    if (allLogs.length === 0 && stats.total > 0) {
      console.warn(
        '⚠️ ПРОБЛЕМА: Статистика показывает логи, но getLogs() возвращает пустой массив!'
      );

      // Попробуем разные варианты фильтров
      console.log('🔍 Тестируем разные фильтры:');
      console.log(`   📋 getLogs(): ${activeLogger.getLogs().length}`);
      console.log(`   📋 getLogs({}): ${activeLogger.getLogs({}).length}`);
      console.log(
        `   📋 getLogs({level: 'all'}): ${activeLogger.getLogs({ level: 'all' }).length}`
      );
    }
  }
} else if (window.RealTimeErrorDashboard && hasLogger) {
  console.log('\n🎛️ СОЗДАНИЕ DASHBOARD:');
  window.errorDashboard = new window.RealTimeErrorDashboard();
  console.log('✅ Dashboard создан');
}

console.log('\n✅ БЫСТРАЯ ДИАГНОСТИКА ЗАВЕРШЕНА');
console.log('💡 Для экспорта используйте: window.errorDashboard?.exportReport()');
