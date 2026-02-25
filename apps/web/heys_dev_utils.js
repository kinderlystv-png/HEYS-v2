// 🆕 PERF v9.2: Метка момента когда boot-core начал исполняться
window.__heysPerfMark && window.__heysPerfMark('boot-core: execute start');

/**
 * HEYS Development Utils v1.1
 * =============================
 * Утилиты для условного логирования в development/production режимах
 * 
 * 🔇 v4.7.0: По умолчанию логи ОТКЛЮЧЕНЫ даже на localhost
 *            Для включения: DEV.enable() или ?debug=verbose в URL
 */

(function () {
  'use strict';

  // 🔇 v4.7.0: Логи отключены по умолчанию для чистоты консоли
  // Включить можно через:
  // 1. URL параметр: ?debug=verbose
  // 2. В консоли: DEV.enable()
  // 3. localStorage: localStorage.setItem('heys_debug_verbose', 'true')
  const forceVerbose = location.search.includes('debug=verbose') ||
    localStorage.getItem('heys_debug_verbose') === 'true';

  let isVerbose = forceVerbose;

  // Экспортируем в window.DEV
  window.DEV = {
    /**
     * Логирование только при включённом verbose режиме
     * @param {...any} args - Аргументы для console.log
     */
    log: function (...args) {
      if (isVerbose) {
        console.log(...args);
      }
    },

    /**
     * Предупреждения только при включённом verbose режиме
     * @param {...any} args - Аргументы для console.warn
     */
    warn: function (...args) {
      if (isVerbose) {
        console.warn(...args);
      }
    },

    /**
     * Информационные сообщения только при включённом verbose режиме
     * @param {...any} args - Аргументы для console.info
     */
    info: function (...args) {
      if (isVerbose) {
        console.info(...args);
      }
    },

    /**
     * Debug сообщения только при включённом verbose режиме
     * @param {...any} args - Аргументы для console.debug
     */
    debug: function (...args) {
      if (isVerbose) {
        console.debug(...args);
      }
    },

    /**
     * Включить verbose логирование
     */
    enable: function () {
      isVerbose = true;
      localStorage.setItem('heys_debug_verbose', 'true');
      console.log('🔊 DEV logging ENABLED. Reload to see all logs.');
    },

    /**
     * Выключить verbose логирование
     */
    disable: function () {
      isVerbose = false;
      localStorage.removeItem('heys_debug_verbose');
      console.log('🔇 DEV logging DISABLED.');
    },

    /**
     * Проверка режима verbose
     * @returns {boolean} true если verbose режим
     */
    isVerbose: function () {
      return isVerbose;
    }
  };

  // Алиас для краткости
  window.devLog = window.DEV.log;
  window.devWarn = window.DEV.warn;
})();
