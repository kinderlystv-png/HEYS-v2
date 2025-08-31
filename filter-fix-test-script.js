// 🔧 ТЕСТ ИСПРАВЛЕНИЯ ФИЛЬТРОВ ENHANCED ERROR LOGGING
// Вставьте этот код в консоль браузера на странице с Dashboard

console.log('🔧 ТЕСТ ИСПРАВЛЕНИЯ ФИЛЬТРОВ');
console.log('============================');

if (!window.errorDashboard || !window.enhancedLogger) {
  console.log('❌ Dashboard или Logger не найдены');
} else {
  const dashboard = window.errorDashboard;
  const logger = window.enhancedLogger;

  console.log('📊 ИСХОДНОЕ СОСТОЯНИЕ:');
  console.log(`   📋 Логов в Logger: ${logger.logs?.length || 0}`);
  console.log(`   📈 Статистика Logger:`, logger.getStats());
  console.log(`   🎛️ Фильтры Dashboard:`, dashboard.filters);

  // Тестируем конвертацию фильтров
  console.log('\n🔄 ТЕСТ КОНВЕРТАЦИИ ФИЛЬТРОВ:');
  const originalFilters = dashboard.filters;
  const convertedFilters = dashboard.convertFiltersForLogger(originalFilters);

  console.log(`   📥 Исходные фильтры:`, originalFilters);
  console.log(`   📤 Конвертированные фильтры:`, convertedFilters);

  // Тестируем получение логов с разными фильтрами
  console.log('\n🔍 ТЕСТ ПОЛУЧЕНИЯ ЛОГОВ:');

  const allLogs = logger.getLogs();
  const emptyFilterLogs = logger.getLogs({});
  const originalFilterLogs = logger.getLogs(originalFilters);
  const convertedFilterLogs = logger.getLogs(convertedFilters);

  console.log(`   📋 getLogs(): ${allLogs.length} логов`);
  console.log(`   📋 getLogs({}): ${emptyFilterLogs.length} логов`);
  console.log(`   📋 getLogs(originalFilters): ${originalFilterLogs.length} логов`);
  console.log(`   📋 getLogs(convertedFilters): ${convertedFilterLogs.length} логов`);

  // Проверяем временной фильтр
  if (convertedFilters.since) {
    const now = Date.now();
    const sinceTime = convertedFilters.since;
    const hoursDiff = (now - sinceTime) / (1000 * 60 * 60);
    console.log(
      `   ⏰ Фильтр времени: since ${new Date(sinceTime).toLocaleTimeString()} (${hoursDiff.toFixed(1)}h ago)`
    );

    // Проверяем timestamps логов
    if (logger.logs.length > 0) {
      console.log('   📅 Timestamps логов:');
      logger.logs.forEach((log, i) => {
        const age = (now - log.timestamp) / (1000 * 60);
        const tooOld = log.timestamp < sinceTime;
        console.log(
          `     ${i + 1}. ${new Date(log.timestamp).toLocaleTimeString()} (${age.toFixed(1)}m ago) ${tooOld ? '❌ TOO OLD' : '✅ OK'}`
        );
      });
    }
  }

  // Создаем новый лог для теста
  console.log('\n🧪 СОЗДАНИЕ ТЕСТОВОГО ЛОГА:');
  logger.logInfo('Filter Test Log', {
    source: 'filter_test',
    timestamp: Date.now(),
  });

  // Повторяем тесты после создания лога
  console.log('\n🔄 ПОВТОРНЫЙ ТЕСТ ПОСЛЕ СОЗДАНИЯ ЛОГА:');
  const newAllLogs = logger.getLogs();
  const newConvertedFilterLogs = logger.getLogs(convertedFilters);

  console.log(
    `   📋 getLogs(): ${newAllLogs.length} логов (+${newAllLogs.length - allLogs.length})`
  );
  console.log(
    `   📋 getLogs(convertedFilters): ${newConvertedFilterLogs.length} логов (+${newConvertedFilterLogs.length - convertedFilterLogs.length})`
  );

  // Тестируем экспорт
  console.log('\n📤 ТЕСТ ЭКСПОРТА:');
  console.log('   🎯 Запускаем dashboard.exportReport()...');

  // Имитируем экспорт без скачивания файла
  const activeLogger = dashboard.logger || window.enhancedLogger;
  const exportAllLogs = activeLogger.getLogs ? activeLogger.getLogs() : [];
  const exportConvertedFilters = dashboard.convertFiltersForLogger(dashboard.filters);
  const exportFilteredLogs = activeLogger.getLogs
    ? activeLogger.getLogs(exportConvertedFilters)
    : [];

  console.log(`   📊 Экспорт всех логов: ${exportAllLogs.length}`);
  console.log(`   📊 Экспорт отфильтрованных: ${exportFilteredLogs.length}`);

  if (exportAllLogs.length === 0 && logger.getStats().total > 0) {
    console.warn('⚠️ ПРОБЛЕМА: Статистика показывает логи, но экспорт возвращает пустой массив!');
  } else {
    console.log('✅ Экспорт работает корректно');
  }
}

console.log('\n✅ ТЕСТ ЗАВЕРШЕН');
