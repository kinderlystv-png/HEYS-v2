# 🚀 AI_QUICK_COMMANDS.md - Ready-to-Use Commands for AI

<!-- @ANCHOR: instant_commands_for_ai -->

## ⚡ МГНОВЕННЫЕ КОМАНДЫ ДЛЯ ИИ:

<!-- @ANCHOR: project_diagnostics -->

### 🔍 ДИАГНОСТИКА ПРОЕКТА:

```bash
# Проверить все модули
grep -r "window.HEYS" *.js | head -20

# Найти поиск продуктов
grep -r "filter.*products\|search.*products" *.js

# Проверить новые модули
ls -la heys_*_v1.js

# Проверить систему якорей
ls -la TOOLS/universal-anchor-automation.js TOOLS/real-anchor-integration.js

# Статус TypeScript
cat TYPESCRIPT_STATUS.md | head -20
```

<!-- @ANCHOR: testing_commands -->

### 🧪 ТЕСТИРОВАНИЕ:

```bash
# Запуск сервера
start_panel.bat

# Супер-диагностическая панель с мониторингом якорей
open TESTS/super-diagnostic-center.html

# Диагностика модулей
curl http://localhost:8000/TESTS/module-test.html

# Проверка умного поиска
curl -s http://localhost:8000/heys_smart_search_with_typos_v1.js | head -10

# Проверка отслеживания ошибок
curl -s http://localhost:8000/heys_advanced_error_tracker_v1.js | head -10

# Проверка геймификации
curl -s http://localhost:8000/heys_gaming_system_v1.js | head -10
```

### 🔧 МОДИФИКАЦИЯ КОДА:

#### Добавить систему якорей при редактировании:

```javascript
// Использовать интегрированное редактирование с автоматическими якорями
const integration = new RealAnchorIntegration();
await integration.autoReplaceStringInFile(filePath, oldString, newString);
await integration.autoCreateFile(filePath, content);

// Анализ системы якорей
const automation = new UniversalAnchorAutomation();
const results = await automation.processAllFiles();
console.log(
  `Обработано ${results.totalFiles} файлов, добавлено ${results.totalAnchors} якорей`
);
```

#### Добавить умный поиск в новый компонент:

```javascript
// Проверить доступность
if (window.HEYS && window.HEYS.SmartSearchWithTypos) {
  const result = window.HEYS.SmartSearchWithTypos.search(query, dataSource, {
    enablePhonetic: true,
    enableSynonyms: true,
    maxSuggestions: 10,
  });
  return result.results;
} else {
  // Fallback к обычному поиску
  return dataSource.filter(item =>
    item.name.toLowerCase().includes(query.toLowerCase())
  );
}
```

#### Добавить отслеживание ошибок:

```javascript
try {
  // Ваш код
} catch (error) {
  if (window.HEYS && window.HEYS.AdvancedErrorTracker) {
    window.HEYS.AdvancedErrorTracker.logError(error, {
      type: 'component_error',
      additionalData: { component: 'YourComponent', action: 'specific_action' },
    });
  }
  throw error; // Пробрасываем ошибку дальше
}
```

### 📊 АНАЛИЗ ПРОИЗВОДИТЕЛЬНОСТИ:

```javascript
// В консоли браузера - получить статистику ошибок
console.table(HEYS.AdvancedErrorTracker.getErrorStats());

// Тест поиска с измерением времени
console.time('search');
const result = HEYS.SmartSearchWithTypos.search('молак', products);
console.timeEnd('search');
console.log(
  'Найдено:',
  result.results.length,
  'Исправления:',
  result.corrections
);

// Экспорт отчета об ошибках
const report = HEYS.AdvancedErrorTracker.exportErrors();
console.log('Отчет готов:', report);
```

---

## 🎯 ЧАСТЫЕ ЗАДАЧИ:

### ✅ Добавить новый модуль:

1. Создать файл `heys_module_name_v1.js`
2. Добавить в `index.html` после `heys_reports_v12.js`
3. Экспортировать в `window.HEYS.ModuleName`
4. Создать тест в `TESTS/`

### ✅ Исправить поиск в компоненте:

1. Найти: `products.filter(p => p.name.toLowerCase().includes(`
2. Заменить на умный поиск с fallback (см. код выше)
3. Тестировать на опечатках: "молак", "хлеп", "картошка"

### ✅ Добавить диагностику ошибок:

1. Обернуть критичный код в try-catch
2. Использовать `HEYS.AdvancedErrorTracker.logError`
3. Указать тип ошибки и контекст

### ✅ Создать новую страницу тестирования:

1. Скопировать `TESTS/module-test.html`
2. Добавить ссылку в `TESTS/index.html`
3. Подключить нужные модули с версиями

---

## 🔥 ЭКСТРЕННЫЕ КОМАНДЫ:

### 🚨 Если сломался поиск:

```javascript
// В консоли - диагностика
console.log('HEYS:', typeof window.HEYS);
console.log('SmartSearch:', typeof window.HEYS?.SmartSearchWithTypos);
console.log('Метод search:', typeof window.HEYS?.SmartSearchWithTypos?.search);

// Откатиться к простому поиску временно
window.HEYS.SmartSearchWithTypos = null;
```

### 🚨 Если переполнился лог ошибок:

```javascript
// Очистить ошибки
HEYS.AdvancedErrorTracker.clearErrors();

// Получить только критичные
const stats = HEYS.AdvancedErrorTracker.getErrorStats();
console.log('Критичные ошибки:', stats.bySeverity.critical);
```

### 🚨 Если нужно быстро протестировать:

```bash
# Открыть главные тесты
start http://localhost:8000/TESTS/index.html

# Диагностическая страница
start http://localhost:8000/TESTS/module-test.html

```

---

## 🚨 АВАРИЙНЫЕ КОМАНДЫ:

### Проект не запускается:

```bash
# Остановить все процессы
run_in_terminal("ОСТАНОВИТЬ_HEYS.bat", "Остановка серверов", false)

# Простой запуск
run_in_terminal("ПРОСТОЙ_ЗАПУСК.bat", "Запуск на порту 8000", true)

# Умный запуск с автопоиском порта
run_in_terminal("УМНЫЙ_ЗАПУСК_HEYS.bat", "Автопоиск порта", true)
```

### TypeScript ошибки:

```bash
# Проверить все ошибки
run_in_terminal("npx tsc --noEmit", "Проверка TypeScript", false)

# Проверить конкретный файл
get_errors(["heys_module_name.js"])

# Пересобрать production
run_in_terminal("build-production.bat", "Production сборка", false)
```

### Тесты не проходят:

```bash
# Быстрая диагностика (2 мин)
run_in_terminal("test-simple.bat", "Простая проверка", false)

# Полная диагностика (5 мин)
run_in_terminal("test-comprehensive.bat", "Полная проверка", false)

# Центр тестирования
open_simple_browser("http://localhost:8000/TESTS/index.html")

# TypeScript production test
open_simple_browser("http://localhost:8000/TESTS/typescript-production-test.html")
```

### Новые модули не работают:

```bash
# Проверить подключение в index.html
grep_search("heys_advanced_error_tracker|heys_smart_search", "index.html", false)

# Проверить в консоли браузера:
# HEYS.AdvancedErrorTracker !== undefined
# HEYS.SmartSearchWithTypos !== undefined

# Проверить ошибки загрузки
open_simple_browser("http://localhost:8000/TESTS/module-test.html")
```

### Критическая ошибка production:

```bash
# Экстренный откат к рабочей версии
run_in_terminal("git checkout HEAD~1", "Откат на предыдущую версию", false)

# Быстрая проверка
run_in_terminal("test-simple.bat", "Проверка после отката", false)

# Запуск резервной копии
run_in_terminal("ПРОСТОЙ_ЗАПУСК.bat", "Аварийный запуск", true)
```

---

## 🔧 ДИАГНОСТИЧЕСКИЕ КОМАНДЫ:

### Проверка статуса системы:

```javascript
// Проверить в консоли браузера:
console.log('Modules:', Object.keys(window.HEYS || {}));
console.log('Errors:', window.HEYS?.AdvancedErrorTracker?.getErrorStats());
console.log('Search available:', !!window.HEYS?.SmartSearchWithTypos);
```

### Проверка производительности:

```bash
# Открыть демо сравнения
open_simple_browser("http://localhost:8000/TESTS/comparison-demo.html")

# Проверить современные технологии
open_simple_browser("http://localhost:8000/TESTS/modern-tech-demo.html")
```

### Экспорт диагностики:

```javascript
// Экспорт всех ошибок для анализа
const report = HEYS.AdvancedErrorTracker.exportErrors();
console.log('Отчет готов:', report);

# Тест умного поиска
start http://localhost:8000/test-smart-search-integration.html
```

---

## 📋 ЧЕКЛИСТ ПЕРЕД КОММИТОМ:

### ✅ Обязательно проверить:

- [ ] Все модули загружаются без ошибок
- [ ] Поиск "молак" находит "Молоко"
- [ ] Fallback работает при отключенных модулях
- [ ] Нет breaking changes в существующем API
- [ ] Новые ошибки логируются корректно

### ✅ Запустить тесты:

- [ ] `TESTS/module-test.html` - зеленые галочки
- [ ] `test-smart-search-integration.html` - находит результаты
- [ ] Основное приложение `index.html` - поиск работает

### ✅ Проверить совместимость:

- [ ] Старые браузеры (fallback срабатывает)
- [ ] Медленные соединения (graceful degradation)
- [ ] Отключенный JavaScript (базовая функциональность)
