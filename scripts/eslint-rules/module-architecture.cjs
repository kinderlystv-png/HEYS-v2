/**
 * 🏗️ ESLint Rule: module-architecture
 * 
 * Проверяет архитектурные ограничения модулей HEYS:
 *   - LOC ≤ 2000
 *   - Функции ≤ 80  
 *   - HEYS.* ссылки ≤ 50
 *   - Нет warnMissing() fallbacks
 * 
 * @type {import('eslint').Rule.RuleModule}
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_LIMITS = {
  LOC: { error: 2000, warn: 1500 },
  FUNCTIONS: { error: 80, warn: 60 },
  HEYS_REFS: { error: 50, warn: 40 },
};

const DEFAULT_CONFIG_PATH = path.resolve(process.cwd(), 'config', 'module-limits.json');
let limitsConfig = null;

const loadLimitsConfig = (configPath) => {
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    limitsConfig = JSON.parse(raw);
  } catch {
    limitsConfig = null;
  }
};

loadLimitsConfig(DEFAULT_CONFIG_PATH);

const getConfigLimits = (filename) => {
  const defaults = limitsConfig?.defaults || {};
  const locDefaults = defaults.loc || {};
  const funcDefaults = defaults.functions || {};
  const refsDefaults = defaults.heysRefs || {};
  const basename = path.basename(filename);
  const fileEntry = limitsConfig?.files?.[basename] || {};
  const fileLimits = fileEntry.limits || {};

  return {
    loc: {
      error: fileLimits.loc?.error ?? locDefaults.error ?? DEFAULT_LIMITS.LOC.error,
      warn: fileLimits.loc?.warn ?? locDefaults.warn ?? DEFAULT_LIMITS.LOC.warn,
    },
    functions: {
      error: fileLimits.functions?.error ?? funcDefaults.error ?? DEFAULT_LIMITS.FUNCTIONS.error,
      warn: fileLimits.functions?.warn ?? funcDefaults.warn ?? DEFAULT_LIMITS.FUNCTIONS.warn,
    },
    heysRefs: {
      error: fileLimits.heysRefs?.error ?? refsDefaults.error ?? DEFAULT_LIMITS.HEYS_REFS.error,
      warn: fileLimits.heysRefs?.warn ?? refsDefaults.warn ?? DEFAULT_LIMITS.HEYS_REFS.warn,
    },
  };
};

// =============================================================================
// Рекомендации
// =============================================================================

const RECOMMENDATIONS = {
  LOC: {
    quickWin: [
      'Выдели утилитарные функции в отдельный файл *_utils.js',
      'React компоненты → отдельный *_components.js',
      'Константы/конфиги → *_config.js',
    ],
    strategic: [
      'Разбей модуль по доменам (UI / бизнес-логика / данные)',
      'Создай sub-modules в папке с именем модуля',
      'Используй фасад-паттерн: главный файл только re-export\'ит',
    ],
  },
  FUNCTIONS: {
    quickWin: [
      'Сгруппируй похожие функции в объект-namespace',
      'Приватные helpers → вложенный модуль',
      'Объедини однотипные функции в одну с параметром',
    ],
    strategic: [
      'Проведи аудит: какие функции НЕ экспортируются?',
      'Неэкспортируемые helpers → отдельный internal.js',
      'Используй composition вместо множества мелких функций',
    ],
  },
  HEYS_REFS: {
    quickWin: [
      'Кэшируй частые обращения: const { utils, store } = HEYS',
      'Передавай зависимости параметрами в функции',
      'В начале модуля: const U = HEYS.utils, S = HEYS.store',
    ],
    strategic: [
      'Внедри Dependency Injection в init()',
      'Создай локальные алиасы в начале модуля',
      'Пересмотри архитектуру: возможно модуль делает слишком много',
    ],
  },
  WARN_MISSING: {
    quickWin: [
      'Замени на явную проверку в init(): if (!HEYS.X) throw new Error("X required")',
    ],
    strategic: [
      'Используй Dependency Injection паттерн',
      'Документируй обязательные зависимости в JSDoc модуля',
    ],
  },
};

function formatRecommendations(type, level = 'error') {
  const rec = RECOMMENDATIONS[type];
  if (!rec) return '';
  
  const lines = [];
  
  if (level === 'error') {
    lines.push('\n\n🎯 QUICK WIN:');
    rec.quickWin.forEach(tip => lines.push(`   • ${tip}`));
    lines.push('\n📈 СТРАТЕГИЧЕСКОЕ:');
    rec.strategic.forEach(tip => lines.push(`   • ${tip}`));
  } else {
    lines.push('\n\n⚡ Рекомендации:');
    rec.quickWin.slice(0, 2).forEach(tip => lines.push(`   • ${tip}`));
  }
  
  lines.push('\n📚 Документация: docs/dev/MODULE_ARCHITECTURE.md');
  
  return lines.join('\n');
}

// =============================================================================
// Rule Implementation
// =============================================================================

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Enforce HEYS module architecture limits',
      category: 'Best Practices',
      recommended: true,
      url: 'https://github.com/kinderlystv-png/HEYS-v2/blob/main/docs/dev/MODULE_ARCHITECTURE.md',
    },
    messages: {
      locError: 'Модуль превышает лимит LOC: {{count}} > {{limit}}{{recommendations}}',
      locWarning: 'Модуль близок к лимиту LOC: {{count}} (лимит: {{limit}}){{recommendations}}',
      functionsError: 'Модуль превышает лимит функций: {{count}} > {{limit}}{{recommendations}}',
      functionsWarning: 'Модуль близок к лимиту функций: {{count}} (лимит: {{limit}}){{recommendations}}',
      heysRefsError: 'Модуль превышает лимит HEYS.* ссылок: {{count}} > {{limit}}{{recommendations}}',
      heysRefsWarning: 'Модуль близок к лимиту HEYS.* ссылок: {{count}} (лимит: {{limit}}){{recommendations}}',
      warnMissingForbidden: 'Паттерн warnMissing() запрещён. Используй явную проверку в init(){{recommendations}}',
    },
    schema: [
      {
        type: 'object',
        properties: {
          locLimit: { type: 'number', default: DEFAULT_LIMITS.LOC.error },
          locWarning: { type: 'number', default: DEFAULT_LIMITS.LOC.warn },
          functionsLimit: { type: 'number', default: DEFAULT_LIMITS.FUNCTIONS.error },
          functionsWarning: { type: 'number', default: DEFAULT_LIMITS.FUNCTIONS.warn },
          heysRefsLimit: { type: 'number', default: DEFAULT_LIMITS.HEYS_REFS.error },
          heysRefsWarning: { type: 'number', default: DEFAULT_LIMITS.HEYS_REFS.warn },
          limitsConfigPath: { type: 'string' },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const options = context.options[0] || {};
    const filename = context.getFilename();
    const configPath = options.limitsConfigPath
      ? path.resolve(process.cwd(), options.limitsConfigPath)
      : DEFAULT_CONFIG_PATH;

    if (configPath !== DEFAULT_CONFIG_PATH) {
      loadLimitsConfig(configPath);
    }

    const configLimits = getConfigLimits(filename);
    const limits = {
      loc: {
        error: options.locLimit ?? configLimits.loc.error,
        warn: options.locWarning ?? configLimits.loc.warn,
      },
      functions: {
        error: options.functionsLimit ?? configLimits.functions.error,
        warn: options.functionsWarning ?? configLimits.functions.warn,
      },
      heysRefs: {
        error: options.heysRefsLimit ?? configLimits.heysRefs.error,
        warn: options.heysRefsWarning ?? configLimits.heysRefs.warn,
      },
    };
    
    // Пропускаем файлы не из apps/web или не heys_*.js
    if (!filename.includes('apps/web')) {
      return {};
    }
    
    // Пропускаем тесты и архив
    const baseName = path.basename(filename);
    if (!baseName.startsWith('heys_') || !baseName.endsWith('.js')) {
      return {};
    }

    if (filename.includes('.test.') || filename.includes('.spec.') || filename.includes('archive')) {
      return {};
    }

    let functionCount = 0;
    let heysRefsCount = 0;
    const heysRefsLocations = [];
    const warnMissingLocations = [];

    return {
      // Считаем функции
      FunctionDeclaration() {
        functionCount++;
      },
      FunctionExpression() {
        functionCount++;
      },
      ArrowFunctionExpression() {
        functionCount++;
      },

      // Считаем HEYS.* ссылки
      MemberExpression(node) {
        if (
          node.object.type === 'Identifier' &&
          node.object.name === 'HEYS'
        ) {
          heysRefsCount++;
          heysRefsLocations.push(node.loc);
        }
      },

      // Ищем warnMissing
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'warnMissing' || node.callee.name === 'warn_missing')
        ) {
          warnMissingLocations.push(node);
        }
      },

      // Проверяем в конце файла
      'Program:exit'(node) {
        const sourceCode = context.getSourceCode();
        const lines = sourceCode.lines || sourceCode.getText().split('\n');
        const loc = lines.length;

        // Проверка LOC
        if (loc > limits.loc.error) {
          context.report({
            node,
            messageId: 'locError',
            data: {
              count: loc,
              limit: limits.loc.error,
              recommendations: formatRecommendations('LOC', 'error'),
            },
          });
        } else if (loc > limits.loc.warn) {
          context.report({
            node,
            messageId: 'locWarning',
            data: {
              count: loc,
              limit: limits.loc.error,
              recommendations: formatRecommendations('LOC', 'warn'),
            },
          });
        }

        // Проверка функций
        if (functionCount > limits.functions.error) {
          context.report({
            node,
            messageId: 'functionsError',
            data: {
              count: functionCount,
              limit: limits.functions.error,
              recommendations: formatRecommendations('FUNCTIONS', 'error'),
            },
          });
        } else if (functionCount > limits.functions.warn) {
          context.report({
            node,
            messageId: 'functionsWarning',
            data: {
              count: functionCount,
              limit: limits.functions.error,
              recommendations: formatRecommendations('FUNCTIONS', 'warn'),
            },
          });
        }

        // Проверка HEYS.* ссылок
        if (heysRefsCount > limits.heysRefs.error) {
          context.report({
            node,
            messageId: 'heysRefsError',
            data: {
              count: heysRefsCount,
              limit: limits.heysRefs.error,
              recommendations: formatRecommendations('HEYS_REFS', 'error'),
            },
          });
        } else if (heysRefsCount > limits.heysRefs.warn) {
          context.report({
            node,
            messageId: 'heysRefsWarning',
            data: {
              count: heysRefsCount,
              limit: limits.heysRefs.error,
              recommendations: formatRecommendations('HEYS_REFS', 'warn'),
            },
          });
        }

        // Проверка warnMissing
        warnMissingLocations.forEach(callNode => {
          context.report({
            node: callNode,
            messageId: 'warnMissingForbidden',
            data: {
              recommendations: formatRecommendations('WARN_MISSING', 'error'),
            },
          });
        });
      },
    };
  },
};
