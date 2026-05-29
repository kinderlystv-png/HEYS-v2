/**
 * 🏗️ HEYS Custom ESLint Rules
 * 
 * Кастомные правила для проверки архитектуры модулей HEYS.
 * 
 * Использование в .eslintrc.cjs:
 * 
 *   plugins: ['@heys'],
 *   rules: {
 *     '@heys/module-architecture': 'error'
 *   }
 * 
 * Или с кастомными лимитами:
 * 
 *   rules: {
 *     '@heys/module-architecture': ['error', {
 *       locLimit: 2000,
 *       functionsLimit: 80,
 *       heysRefsLimit: 50
 *     }]
 *   }
 */

const moduleArchitecture = require('./module-architecture.cjs');
const noSetStateSideEffects = require('./no-setstate-side-effects.cjs');

module.exports = {
  rules: {
    'module-architecture': moduleArchitecture,
    'no-setstate-side-effects': noSetStateSideEffects,
  },
  configs: {
    recommended: {
      plugins: ['@heys'],
      rules: {
        '@heys/module-architecture': 'error',
        '@heys/no-setstate-side-effects': 'error',
      },
    },
    // Мягкий режим - только warnings
    lenient: {
      plugins: ['@heys'],
      rules: {
        '@heys/module-architecture': 'warn',
        '@heys/no-setstate-side-effects': 'warn',
      },
    },
  },
};
