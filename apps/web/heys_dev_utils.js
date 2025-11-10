/**
 * HEYS Development Utils v1.0
 * =============================
 * Утилиты для условного логирования в development/production режимах
 * 
 * Использование:
 *   // Вместо console.log('message', data):
 *   DEV.log('message', data);
 *   
 *   // Вместо console.warn('warning', error):
 *   DEV.warn('warning', error);
 */

(function() {
  'use strict';

  // Определяем режим разработки
  const isDev = location.hostname === 'localhost' || 
                location.hostname === '127.0.0.1' || 
                location.port === '3001' ||
                location.search.includes('debug=true');

  // Экспортируем в window.DEV
  window.DEV = {
    /**
     * Логирование только в development режиме
     * @param {...any} args - Аргументы для console.log
     */
    log: function(...args) {
      if (isDev) {
        console.log(...args);
      }
    },

    /**
     * Предупреждения только в development режиме
     * @param {...any} args - Аргументы для console.warn
     */
    warn: function(...args) {
      if (isDev) {
        console.warn(...args);
      }
    },

    /**
     * Информационные сообщения только в development режиме
     * @param {...any} args - Аргументы для console.info
     */
    info: function(...args) {
      if (isDev) {
        console.info(...args);
      }
    },

    /**
     * Debug сообщения только в development режиме
     * @param {...any} args - Аргументы для console.debug
     */
    debug: function(...args) {
      if (isDev) {
        console.debug(...args);
      }
    },

    /**
     * Проверка режима разработки
     * @returns {boolean} true если development режим
     */
    isDev: function() {
      return isDev;
    }
  };

  // Алиас для краткости
  window.devLog = window.DEV.log;
  window.devWarn = window.DEV.warn;

  if (isDev) {
    console.log('[HEYS Dev Utils] Initialized ✓ (Development Mode)');
  }
})();
