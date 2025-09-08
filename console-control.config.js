/**
 * Console Usage Control for HEYS Platform
 * Контроль использования console в коде
 */

// Проверка режима production
const isProduction = process.env.NODE_ENV === 'production';

// Статистика использования console
const consoleUsageStats = {
  totalCalls: 0,
  logCalls: 0,
  errorCalls: 0,
  warnCalls: 0,
  infoCalls: 0,
  debugCalls: 0
};

// Контролируемые методы console
const CONTROLLED_METHODS = ['log', 'error', 'warn', 'info', 'debug', 'trace'];

// Функция контроля console
const controlConsoleUsage = () => {
  // В production блокируем console
  if (isProduction) {
    CONTROLLED_METHODS.forEach(method => {
      if (console[method]) {
        console[method] = (..._args) => {
          consoleUsageStats.totalCalls++;
          consoleUsageStats[`${method}Calls`] = (consoleUsageStats[`${method}Calls`] || 0) + 1;
          
          // В production ничего не выводим
          // Только собираем статистику
        };
      }
    });
  }
};

// Получение статистики
const getConsoleStats = () => ({ ...consoleUsageStats });

// Сброс статистики
const resetConsoleStats = () => {
  Object.keys(consoleUsageStats).forEach(key => {
    consoleUsageStats[key] = 0;
  });
};

// Инициализация контроля
controlConsoleUsage();

// Экспорт
module.exports = {
  isProduction,
  consoleUsageStats,
  controlConsoleUsage,
  getConsoleStats,
  resetConsoleStats,
  CONTROLLED_METHODS
};

// ES6 default export
if (typeof exports === 'object') {
  exports.default = {
    isProduction,
    consoleUsageStats,
    controlConsoleUsage,
    getConsoleStats,
    resetConsoleStats,
    CONTROLLED_METHODS
  };
}
