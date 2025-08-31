// 🔍 ENHANCED ERROR LOGGER DIAGNOSTIC SCRIPT
// Скопируйте и вставьте этот код в консоль браузера для диагностики

console.log('🔍 ENHANCED ERROR LOGGER DIAGNOSTICS');
console.log('=====================================');

// Проверка наличия компонентов
const components = {
  EnhancedErrorLogger: typeof window.EnhancedErrorLogger !== 'undefined',
  'enhancedLogger (instance)': typeof window.enhancedLogger !== 'undefined',
  StackTraceAnalyzer: typeof window.StackTraceAnalyzer !== 'undefined',
  ErrorClassificationEngine: typeof window.ErrorClassificationEngine !== 'undefined',
  RealTimeErrorDashboard: typeof window.RealTimeErrorDashboard !== 'undefined',
  'errorDashboard (instance)': typeof window.errorDashboard !== 'undefined',
};

console.log('\n📋 КОМПОНЕНТЫ:');
for (const [name, available] of Object.entries(components)) {
  console.log(`${available ? '✅' : '❌'} ${name}: ${available ? 'Доступен' : 'Недоступен'}`);
}

// Проверка активного логгера
if (window.enhancedLogger) {
  console.log('\n📊 СОСТОЯНИЕ ЛОГГЕРА:');
  console.log('📍 Session ID:', window.enhancedLogger.sessionId);
  console.log('⚡ Is Active:', window.enhancedLogger.isActive);
  console.log('📋 Logs Array Length:', window.enhancedLogger.logs?.length || 0);
  console.log('📊 Stats:', window.enhancedLogger.getStats());

  // Прямой доступ к логам
  console.log('\n📝 ПРЯМОЙ ДОСТУП К ЛОГАМ:');
  if (window.enhancedLogger.logs && window.enhancedLogger.logs.length > 0) {
    console.log('✅ Логи найдены:', window.enhancedLogger.logs.length);
    window.enhancedLogger.logs.forEach((log, index) => {
      console.log(`  ${index + 1}. [${log.level.toUpperCase()}] ${log.title}`);
    });
  } else {
    console.log('❌ Логи не найдены или массив пустой');
  }

  // Тест метода getLogs()
  console.log('\n🔍 ТЕСТ МЕТОДА getLogs():');
  const allLogsFromMethod = window.enhancedLogger.getLogs();
  console.log('📋 getLogs() возвращает:', allLogsFromMethod.length, 'логов');

  // Создаем тестовый лог
  console.log('\n🧪 СОЗДАНИЕ ТЕСТОВОГО ЛОГА:');
  window.enhancedLogger.logInfo('Diagnostic Test Log', {
    source: 'console_diagnostic',
    timestamp: Date.now(),
  });

  console.log('📊 После создания теста:');
  console.log('📋 Logs Array Length:', window.enhancedLogger.logs?.length || 0);
  console.log('📊 Stats:', window.enhancedLogger.getStats());
} else {
  console.log('\n❌ ЛОГГЕР НЕ НАЙДЕН!');
  console.log('💡 Попытка создания логгера...');

  if (window.EnhancedErrorLogger) {
    window.enhancedLogger = new window.EnhancedErrorLogger();
    console.log('✅ Логгер создан вручную');
    console.log('📍 Session ID:', window.enhancedLogger.sessionId);
  } else {
    console.log('❌ Класс EnhancedErrorLogger недоступен');
  }
}

// Проверка Dashboard
if (window.errorDashboard) {
  console.log('\n🎛️ DASHBOARD:');
  console.log('📡 Connected to logger:', !!window.errorDashboard.logger);
  console.log('⚡ Is Active:', window.errorDashboard.isActive);
} else if (window.RealTimeErrorDashboard) {
  console.log('\n🎛️ СОЗДАНИЕ DASHBOARD:');
  window.errorDashboard = new window.RealTimeErrorDashboard();
  window.errorDashboard.init();
  console.log('✅ Dashboard создан');
}

console.log('\n🔧 ДОСТУПНЫЕ КОМАНДЫ:');
console.log('window.enhancedLogger.logError("Test Error", {source: "console"})');
console.log('window.enhancedLogger.getStats()');
console.log('window.enhancedLogger.getLogs()');
console.log('window.enhancedLogger.exportLogs()');
console.log('window.errorDashboard?.exportReport()');

console.log('\n✅ ДИАГНОСТИКА ЗАВЕРШЕНА');
