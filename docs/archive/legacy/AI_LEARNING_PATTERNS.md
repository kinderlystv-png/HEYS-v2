# 🧠 AI_LEARNING_PATTERNS.md - Patterns for Maximum AI Efficiency

## 🎯 ЭФФЕКТИВНЫЕ ПАТТЕРНЫ ОБУЧЕНИЯ ИИ:

### 🚀 ПРИНЦИП "QUICK WIN":

**Задача:** ИИ должен за 30 секунд понять, что можно делать с проектом

#### ✅ ГОТОВЫЕ ШАБЛОНЫ:

**Автоматические якоря при работе с файлами:**

```javascript
// ШАБЛОН: Редактирование файлов с автоматическими якорями
const integration = new RealAnchorIntegration();

// Замена строки с автоматическим добавлением якорей
await integration.autoReplaceStringInFile(filePath, oldString, newString);

// Создание файла с автоматическими якорями
await integration.autoCreateFile(filePath, content);

// Универсальная обработка всех файлов проекта
const automation = new UniversalAnchorAutomation();
const results = await automation.processAllFiles();
console.log(
  `Добавлено ${results.totalAnchors} якорей в ${results.totalFiles} файлов`
);
```

**Умный поиск в любом компоненте:**

```javascript
// ШАБЛОН: Поиск с автоматическим fallback
const searchResults = React.useMemo(() => {
  if (!query) return allItems;

  // Умный поиск если доступен
  if (window.HEYS?.SmartSearchWithTypos) {
    try {
      const result = window.HEYS.SmartSearchWithTypos.search(query, allItems, {
        enablePhonetic: true,
        enableSynonyms: true,
        maxSuggestions: 20,
      });
      return result.results;
    } catch (error) {
      console.warn('[Component] Fallback to simple search:', error);
    }
  }

  // Простой поиск как fallback
  return allItems.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );
}, [query, allItems]);
```

**Геймификация в компонентах:**

```javascript
// ШАБЛОН: Интеграция геймификации
React.useEffect(() => {
  if (window.HEYS?.GamingSystem) {
    // Разблокировать достижение
    window.HEYS.GamingSystem.unlockAchievement('FEATURE_USED', {
      feature: componentName,
      timestamp: Date.now(),
    });

    // Обновить прогресс
    window.HEYS.GamingSystem.updateProgress('COMPONENT_INTERACTIONS', 1);
  }
}, [componentAction]);
```

**Отслеживание ошибок в компоненте:**

```javascript
// ШАБЛОН: Обертка для компонентов
function withErrorTracking(Component, componentName) {
  return function WrappedComponent(props) {
    React.useEffect(() => {
      const handleError = (error, errorInfo) => {
        if (window.HEYS?.AdvancedErrorTracker) {
          window.HEYS.AdvancedErrorTracker.logError(error, {
            type: 'react_component',
            additionalData: {
              component: componentName,
              props: Object.keys(props),
              errorInfo,
            },
          });
        }
      };

      window.addEventListener('error', handleError);
      return () => window.removeEventListener('error', handleError);
    }, []);

    return React.createElement(Component, props);
  };
}
```

---

## 🔄 АРХИТЕКТУРНЫЕ ПАТТЕРНЫ:

### ⚓ НАВИГАЦИОННЫЕ ЯКОРЯ:

```javascript
// ПАТТЕРН: Автоматические якоря для лучшей навигации
class CodeNavigator {
  // @ANCHOR: main_class_definition
  constructor() {
    this.anchorPattern = /@ANCHOR:\s*(.+)/g;
  }

  // @ANCHOR: extract_anchors_method
  extractAnchors(code) {
    const anchors = [];
    let match;
    while ((match = this.anchorPattern.exec(code)) !== null) {
      anchors.push({
        name: match[1].trim(),
        line: code.substring(0, match.index).split('\n').length,
      });
    }
    return anchors;
  }

  // @ANCHOR: navigate_to_anchor_method
  navigateToAnchor(anchorName, editor) {
    const anchors = this.extractAnchors(editor.getValue());
    const anchor = anchors.find(a => a.name === anchorName);
    if (anchor) {
      editor.gotoLine(anchor.line);
    }
  }
}
```

### 📊 4-УРОВНЕВАЯ АРХИТЕКТУРА ДАННЫХ:

```javascript
// ПАТТЕРН: Универсальная работа с данными
class DataManager {
  constructor(key) {
    this.key = key;
  }

  // Level 1: React State (быстрое чтение)
  useState(initialData) {
    return React.useState(this.get() || initialData);
  }

  // Level 2: localStorage (локальное хранение)
  get(fallback = null) {
    return window.HEYS?.utils?.lsGet(this.key, fallback) || fallback;
  }

  set(data) {
    window.HEYS?.utils?.lsSet(this.key, data);
    return this.notifyWatchers(data);
  }

  // Level 3: IndexedDB (индексированное хранение)
  async saveToIndexedDB(data) {
    if (window.HEYS?.indexedDB) {
      return window.HEYS.indexedDB.store(data, this.key);
    }
  }

  // Level 4: Cloud (облачная синхронизация)
  async syncToCloud(data, clientId) {
    if (window.HEYS?.cloud && clientId) {
      return window.HEYS.cloud.bootstrapClientSync(clientId);
    }
  }
}

// Использование:
const productsManager = new DataManager('heys_products');
const [products, setProducts] = productsManager.useState([]);
```

### 🔧 МОДУЛЬНЫЙ ПАТТЕРН:

```javascript
// ШАБЛОН: Новый модуль HEYS
(function (global) {
  'use strict';

  // Инициализация namespace
  global.HEYS = global.HEYS || {};

  // Конфигурация модуля
  const CONFIG = {
    enabled: true,
    debugMode: false,
    version: '1.0',
  };

  // Основной класс модуля
  class ModuleName {
    constructor() {
      this.initialized = false;
      this.data = new Map();
    }

    init() {
      if (this.initialized) return;

      console.log(`🚀 ModuleName v${CONFIG.version} инициализирован`);
      this.initialized = true;

      // Интеграция с error tracking
      if (global.HEYS.AdvancedErrorTracker) {
        this.errorTracker = global.HEYS.AdvancedErrorTracker;
      }
    }

    // Основной API метод
    mainMethod(input, options = {}) {
      try {
        const result = this.processInput(input, options);
        return this.formatResult(result);
      } catch (error) {
        this.handleError(error, { input, options });
        throw error;
      }
    }

    handleError(error, context) {
      if (this.errorTracker) {
        this.errorTracker.logError(error, {
          type: 'module_error',
          additionalData: { module: 'ModuleName', ...context },
        });
      }
    }
  }

  // Создание глобального экземпляра
  const moduleInstance = new ModuleName();

  // Экспорт в HEYS namespace
  global.HEYS.ModuleName = {
    mainMethod: (input, options) => moduleInstance.mainMethod(input, options),
    configure: newConfig => Object.assign(CONFIG, newConfig),
    getStatus: () => ({
      initialized: moduleInstance.initialized,
      version: CONFIG.version,
    }),
  };

  // Автоинициализация
  if (typeof window !== 'undefined') {
    setTimeout(() => moduleInstance.init(), 100);
  }
})(window);
```

---

## 🎨 UI ПАТТЕРНЫ:

### 🔍 УМНЫЙ ПОИСК + DROPDOWN:

```javascript
// ШАБЛОН: Поиск с выпадающим списком
function SmartSearchInput({ data, onSelect, placeholder = 'Поиск...' }) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const [selectedIndex, setSelectedIndex] = React.useState(-1);

  const results = React.useMemo(() => {
    if (!query || query.length < 2) return [];

    if (window.HEYS?.SmartSearchWithTypos) {
      try {
        const searchResult = window.HEYS.SmartSearchWithTypos.search(
          query,
          data,
          {
            enablePhonetic: true,
            enableSynonyms: true,
            maxSuggestions: 10,
          }
        );
        return searchResult.results || [];
      } catch (error) {
        console.warn('[SmartSearch] Fallback to simple search');
      }
    }

    return data
      .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
  }, [query, data]);

  const handleKeyDown = React.useCallback(
    e => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && results[selectedIndex]) {
            onSelect(results[selectedIndex]);
            setQuery('');
            setIsOpen(false);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSelectedIndex(-1);
          break;
      }
    },
    [results, selectedIndex, onSelect]
  );

  return React.createElement(
    'div',
    { className: 'smart-search-container', style: { position: 'relative' } },
    React.createElement('input', {
      type: 'text',
      value: query,
      placeholder,
      onChange: e => {
        setQuery(e.target.value);
        setIsOpen(true);
      },
      onKeyDown: handleKeyDown,
      onFocus: () => setIsOpen(true),
      onBlur: () => setTimeout(() => setIsOpen(false), 200),
    }),
    isOpen &&
      results.length > 0 &&
      React.createElement(
        'div',
        {
          className: 'dropdown',
          style: {
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'white',
            border: '1px solid #ddd',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            zIndex: 1000,
            maxHeight: '200px',
            overflow: 'auto',
          },
        },
        results.map((item, index) =>
          React.createElement(
            'div',
            {
              key: item.id || index,
              className: `dropdown-item ${index === selectedIndex ? 'selected' : ''}`,
              style: {
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor:
                  index === selectedIndex ? '#f0f0f0' : 'transparent',
              },
              onMouseDown: () => {
                onSelect(item);
                setQuery('');
                setIsOpen(false);
              },
              onMouseEnter: () => setSelectedIndex(index),
            },
            item.name
          )
        )
      )
  );
}
```

---

## 📈 ПРОИЗВОДИТЕЛЬНОСТЬ ПАТТЕРНЫ:

### ⚡ ЛЕНИВАЯ ЗАГРУЗКА МОДУЛЕЙ:

```javascript
// ПАТТЕРН: Модуль загружается только при необходимости
const LazyModule = {
  _instance: null,
  _loading: false,

  async get() {
    if (this._instance) return this._instance;
    if (this._loading)
      return new Promise(resolve => {
        const check = () =>
          this._instance ? resolve(this._instance) : setTimeout(check, 10);
        check();
      });

    this._loading = true;

    try {
      // Проверяем, не загружен ли уже
      if (window.HEYS?.ModuleName) {
        this._instance = window.HEYS.ModuleName;
        return this._instance;
      }

      // Динамическая загрузка
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'heys_module_name_v1.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });

      this._instance = window.HEYS?.ModuleName;
      return this._instance;
    } finally {
      this._loading = false;
    }
  },

  // Использование с fallback
  async safeCall(method, ...args) {
    try {
      const module = await this.get();
      return module?.[method]?.(...args);
    } catch (error) {
      console.warn(`LazyModule.${method} failed, using fallback:`, error);
      return this.fallback(method, ...args);
    }
  },

  fallback(method, ...args) {
    // Простая реализация без модуля
    switch (method) {
      case 'search':
        const [query, data] = args;
        return { results: data.filter(item => item.name.includes(query)) };
      default:
        return null;
    }
  },
};
```

---

## 🎯 ПАТТЕРН "КОПИРУЙ-ВСТАВЛЯЙ":

### ✅ Для добавления умного поиска в существующий компонент:

1. **Найти:** `products.filter(p => p.name.toLowerCase().includes(`
2. **Заменить:** Шаблоном умного поиска (см. выше)
3. **Протестировать:** "молак" → "Молоко"

### ✅ Для добавления error tracking в функцию:

1. **Обернуть:** Функцию в try-catch
2. **Добавить:** `HEYS.AdvancedErrorTracker.logError` в catch
3. **Указать:** Тип ошибки и контекст

### ✅ Для создания нового модуля:

1. **Скопировать:** Шаблон модульного паттерна
2. **Заменить:** ModuleName на ваше имя
3. **Добавить:** В index.html после других модулей
