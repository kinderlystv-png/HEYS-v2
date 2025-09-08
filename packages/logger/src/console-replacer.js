/**
 * Console Replacer - Система замены console на logger
 * Обеспечивает строгий контроль использования console в коде
 */

// Простая версия без импортов для избежания циклических зависимостей
const createConsoleReplacer = () => {
  // Сохраняем оригинальные методы console
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    trace: console.trace,
    group: console.group,
    groupEnd: console.groupEnd,
    time: console.time,
    timeEnd: console.timeEnd,
    count: console.count,
    clear: console.clear
  };

  // Счетчики использования
  const usageStats = {
    log: 0,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    trace: 0,
    group: 0,
    groupEnd: 0,
    time: 0,
    timeEnd: 0,
    count: 0,
    clear: 0,
    total: 0
  };

  // Создаем предупреждающие заместители
  const createReplacementMethod = (methodName) => {
    return (...args) => {
      usageStats[methodName]++;
      usageStats.total++;
      
      // В development показываем предупреждение
      if (process.env.NODE_ENV === 'development') {
        originalConsole.warn(
          `⚠️  [HEYS Logger] console.${methodName}() used instead of logger.${methodName}()`
        );
        originalConsole.warn(`   Use: import { logger } from '@heys/logger'`);
        originalConsole.warn(`   Then: logger.${methodName}(${args.map(() => '...').join(', ')})`);
        originalConsole.warn('   Stack trace:');
        originalConsole.trace();
      }
      
      // В production полностью блокируем
      if (process.env.NODE_ENV === 'production') {
        // Не выводим ничего, только считаем статистику
        return;
      }
      
      // В остальных случаях пропускаем через оригинальный метод
      return originalConsole[methodName](...args);
    };
  };

  return {
    // Методы управления
    install() {
      // Заменяем методы console
      console.log = createReplacementMethod('log');
      console.error = createReplacementMethod('error');
      console.warn = createReplacementMethod('warn');
      console.info = createReplacementMethod('info');
      console.debug = createReplacementMethod('debug');
      console.trace = createReplacementMethod('trace');
      console.group = createReplacementMethod('group');
      console.groupEnd = createReplacementMethod('groupEnd');
      console.time = createReplacementMethod('time');
      console.timeEnd = createReplacementMethod('timeEnd');
      console.count = createReplacementMethod('count');
      console.clear = createReplacementMethod('clear');
    },

    uninstall() {
      // Восстанавливаем оригинальные методы
      Object.assign(console, originalConsole);
    },

    getUsageStats() {
      return { ...usageStats };
    },

    resetStats() {
      Object.keys(usageStats).forEach(key => {
        usageStats[key] = 0;
      });
    },

    // Проверка использования console в коде
    auditCode(codeString) {
      const consoleUsage = [];
      const lines = codeString.split('\n');
      
      lines.forEach((line, index) => {
        const consoleMatch = line.match(/console\.(log|error|warn|info|debug|trace|group|groupEnd|time|timeEnd|count|clear)/g);
        if (consoleMatch) {
          consoleUsage.push({
            line: index + 1,
            content: line.trim(),
            methods: consoleMatch
          });
        }
      });
      
      return consoleUsage;
    },

    // Автоматическая замена console на logger в коде
    replaceInCode(codeString) {
      return codeString
        .replace(/console\.log\(/g, 'logger.info(')
        .replace(/console\.error\(/g, 'logger.error(')
        .replace(/console\.warn\(/g, 'logger.warn(')
        .replace(/console\.info\(/g, 'logger.info(')
        .replace(/console\.debug\(/g, 'logger.debug(')
        .replace(/console\.trace\(/g, 'logger.trace(');
    }
  };
};

// Глобальный экземпляр
const consoleReplacer = createConsoleReplacer();

// Автоматическая установка в production
if (process.env.NODE_ENV === 'production') {
  consoleReplacer.install();
}

// Экспорты
module.exports = {
  consoleReplacer,
  createConsoleReplacer
};

// ES6 экспорт
if (typeof exports === 'object') {
  exports.default = consoleReplacer;
}
