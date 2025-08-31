/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ ⚓ СИСТЕМА ЯКОРНЫХ МЕТОК ДЛЯ НАВИГАЦИИ                                                   │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Использует уникальные метки вместо номеров строк для стабильной навигации               │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

class AnchorNavigationSystem {
  constructor() {
    this.anchorPattern = /\/\*\s*@ANCHOR:\s*(\w+)\s*\*\//g;
    this.sectionPattern = /\/\*\s*@SECTION:\s*([^*]+)\s*\*\//g;
  }

  // Создание якорной карты
  generateAnchorMap(fileName) {
    const border = '─'.repeat(85);

    return `/*
┌${border}┐
│ 🗺️ ЯКОРНАЯ НАВИГАЦИОННАЯ КАРТА ${fileName}${' '.repeat(Math.max(0, 50 - fileName.length))}│
├${border}┤
│ 📋 СТРУКТУРА ФАЙЛА (якорная навигация):                                               │
│                                                                                           │
│ 🛠️ ОСНОВНЫЕ СЕКЦИИ:                                                                     │
│    ├── @ANCHOR:INIT - Инициализация и настройка                                         │
│    ├── @ANCHOR:CORE - Основные функции                                                  │
│    ├── @ANCHOR:UI - Пользовательский интерфейс                                          │
│    ├── @ANCHOR:EVENTS - Обработчики событий                                             │
│    ├── @ANCHOR:UTILS - Вспомогательные функции                                          │
│    └── @ANCHOR:EXPORT - Экспорт и финализация                                           │
│                                                                                           │
│ 🔧 ПОДСЕКЦИИ:                                                                            │
│    ├── @ANCHOR:TESTS - Диагностические тесты                                            │
│    ├── @ANCHOR:VISUAL - Визуализация и анимации                                         │
│    ├── @ANCHOR:DATA - Управление данными                                                │
│    └── @ANCHOR:CONFIG - Конфигурация системы                                            │
│                                                                                           │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ 🎯 БЫСТРАЯ НАВИГАЦИЯ:                                                                    │
│    • Поиск якоря: Ctrl+F "@ANCHOR:ИМЯ"                                                  │
│    • Поиск секции: Ctrl+F "@SECTION:НАЗВАНИЕ"                                           │
│    • Якоря устойчивы к изменениям кода                                                  │
│    • Автоматическое обновление не требуется                                             │
└${border}┘
*/

`;
  }

  // Предложения по размещению якорей в коде
  suggestAnchors(content, fileName) {
    const lines = content.split('\n');
    const suggestions = [];

    // Анализ и предложения якорей
    lines.forEach((line, index) => {
      // Поиск функций
      if (line.match(/function\s+\w+/)) {
        const funcName = line.match(/function\s+(\w+)/)[1];
        suggestions.push({
          line: index + 1,
          type: 'function',
          anchor: `@ANCHOR:FUNC_${funcName.toUpperCase()}`,
          before: `/* @ANCHOR:FUNC_${funcName.toUpperCase()} */`,
          description: `Функция ${funcName}`,
        });
      }

      // Поиск классов
      if (line.match(/class\s+\w+/)) {
        const className = line.match(/class\s+(\w+)/)[1];
        suggestions.push({
          line: index + 1,
          type: 'class',
          anchor: `@ANCHOR:CLASS_${className.toUpperCase()}`,
          before: `/* @ANCHOR:CLASS_${className.toUpperCase()} */`,
          description: `Класс ${className}`,
        });
      }

      // Поиск секций
      if (line.match(/\/\/\s*[=\-]{3,}/)) {
        const sectionMatch = line.match(/\/\/\s*[=\-]{3,}\s*(.+?)\s*[=\-]{3,}/);
        if (sectionMatch) {
          const sectionName = sectionMatch[1].trim().toUpperCase().replace(/\s+/g, '_');
          suggestions.push({
            line: index + 1,
            type: 'section',
            anchor: `@ANCHOR:${sectionName}`,
            before: `/* @ANCHOR:${sectionName} */`,
            description: `Секция ${sectionMatch[1]}`,
          });
        }
      }
    });

    return suggestions;
  }

  // Автоматическое добавление якорей в код
  addAnchorsToCode(content, suggestions) {
    const lines = content.split('\n');
    let offset = 0;

    suggestions.forEach(suggestion => {
      const insertLine = suggestion.line - 1 + offset;
      lines.splice(insertLine, 0, suggestion.before);
      offset++;
    });

    return lines.join('\n');
  }

  // Создание интерактивной навигации для HTML
  createInteractiveNavigation(anchors) {
    const navHTML = `
<!-- Интерактивная навигация по якорям -->
<div id="anchor-navigation" style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 12px; z-index: 1000; max-width: 300px;">
    <div style="font-weight: bold; margin-bottom: 10px;">🗺️ Навигация</div>
    ${anchors
      .map(
        anchor => `
        <div style="margin: 5px 0; cursor: pointer; padding: 3px; border-radius: 3px;" 
             onclick="document.querySelector('[data-anchor=\\"${anchor.id}\\"]')?.scrollIntoView({behavior: 'smooth'})"
             onmouseover="this.style.backgroundColor='rgba(255,255,255,0.2)'"
             onmouseout="this.style.backgroundColor='transparent'">
            ${anchor.icon} ${anchor.name}
        </div>
    `
      )
      .join('')}
    <div style="margin-top: 10px; font-size: 10px; opacity: 0.7;">
        Клик для перехода
    </div>
</div>

<script>
// Автоскрытие навигации
let navTimer;
const nav = document.getElementById('anchor-navigation');

nav.addEventListener('mouseenter', () => {
    clearTimeout(navTimer);
    nav.style.opacity = '1';
});

nav.addEventListener('mouseleave', () => {
    navTimer = setTimeout(() => {
        nav.style.opacity = '0.3';
    }, 3000);
});

// Клавиши для быстрой навигации
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        nav.style.display = nav.style.display === 'none' ? 'block' : 'none';
    }
});
</script>
`;
    return navHTML;
  }
}

// Пример использования для реального файла
class FileAnchorManager {
  constructor() {
    this.anchorSystem = new AnchorNavigationSystem();
  }

  // Процесс добавления якорей в существующий файл
  processFile(filePath, content) {
    console.log(`🔍 Анализирую файл ${filePath} для якорной навигации...`);

    // 1. Генерируем предложения якорей
    const suggestions = this.anchorSystem.suggestAnchors(content, filePath);
    console.log(`💡 Найдено ${suggestions.length} мест для якорей`);

    // 2. Создаем обновленный код с якорями
    const codeWithAnchors = this.anchorSystem.addAnchorsToCode(content, suggestions);

    // 3. Создаем якорную карту
    const anchorMap = this.anchorSystem.generateAnchorMap(filePath);

    // 4. Объединяем карту и код
    const finalContent = anchorMap + codeWithAnchors;

    return {
      content: finalContent,
      suggestions: suggestions,
      map: anchorMap,
      stats: {
        originalLines: content.split('\n').length,
        newLines: finalContent.split('\n').length,
        anchorsAdded: suggestions.length,
      },
    };
  }

  // Создание отчета о якорной навигации
  generateReport(results) {
    return `
# 📊 ОТЧЕТ О ЯКОРНОЙ НАВИГАЦИИ

## 📁 Обработанный файл
- **Файл:** ${results.fileName}
- **Исходные строки:** ${results.stats.originalLines}
- **Строки с якорями:** ${results.stats.newLines}
- **Добавлено якорей:** ${results.stats.anchorsAdded}

## ⚓ Добавленные якоря

${results.suggestions.map(s => `- **${s.anchor}** - ${s.description} (строка ${s.line})`).join('\n')}

## 🎯 Использование

1. **Поиск по якорю:** \`Ctrl+F "@ANCHOR:ИМЯ"\`
2. **Навигация:** Якоря не зависят от номеров строк
3. **Стабильность:** Изменения кода не влияют на навигацию

## ✅ Преимущества якорной системы

- 🔒 **Стабильность** - якоря не сдвигаются при изменениях
- ⚡ **Быстрота** - мгновенный поиск по уникальным меткам
- 📋 **Понятность** - говорящие имена якорей
- 🔄 **Независимость** - не требует обновления при рефакторинге
`;
  }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AnchorNavigationSystem, FileAnchorManager };
}

if (typeof window !== 'undefined') {
  window.HEYS = window.HEYS || {};
  window.HEYS.AnchorNavigation = AnchorNavigationSystem;
  window.HEYS.FileAnchorManager = FileAnchorManager;
}
