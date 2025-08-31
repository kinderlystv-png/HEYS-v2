#!/usr/bin/env node
/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ ДЛЯ БОЛЬШИХ ФАЙЛОВ                                      │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Автоматически создает навигационные карты для файлов с большим количеством строк        │
│ Анализирует структуру кода и создает краткую карту для быстрой навигации                │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

const fs = require('fs');
const path = require('path');

class CodeMapper {
  constructor() {
    this.patterns = {
      js: {
        functions: /function\s+(\w+)/g,
        classes: /class\s+(\w+)/g,
        exports: /(?:export|exports\.(\w+))/g,
        comments: /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        sections: /\/\/\s*[-=]{3,}\s*(.+?)\s*[-=]{3,}/g,
      },
      html: {
        sections: /<!--\s*(.+?)\s*-->/g,
        scripts: /<script[^>]*>([\s\S]*?)<\/script>/g,
        styles: /<style[^>]*>([\s\S]*?)<\/style>/g,
        classes: /class\s+(\w+)/g,
        ids: /id="([^"]+)"/g,
      },
      css: {
        selectors: /([.#][\w-]+)(?:\s*{|\s*,)/g,
        mediaQueries: /@media[^{]+{/g,
      },
    };
  }

  analyzeFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const totalLines = lines.length;
    const ext = path.extname(filePath).slice(1);

    console.log(`📊 Анализирую файл: ${path.basename(filePath)} (${totalLines} строк)`);

    const sections = this.findSections(content, lines, ext);
    const map = this.generateNavigationMap(filePath, totalLines, sections, ext);

    return {
      filePath,
      totalLines,
      sections,
      map,
      needsMap: totalLines > 500, // Файлы больше 500 строк нуждаются в карте
    };
  }

  findSections(content, lines, ext) {
    const sections = [];
    const patterns = this.patterns[ext] || this.patterns.js;

    // Поиск основных секций
    if (ext === 'js') {
      sections.push(...this.findJSSections(content, lines));
    } else if (ext === 'html') {
      sections.push(...this.findHTMLSections(content, lines));
    }

    return sections.sort((a, b) => a.startLine - b.startLine);
  }

  findJSSections(content, lines) {
    const sections = [];

    // Поиск функций
    const functionMatches = [...content.matchAll(/function\s+(\w+)/g)];
    functionMatches.forEach(match => {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      sections.push({
        type: 'function',
        name: match[1],
        startLine: lineIndex + 1,
        endLine: this.findFunctionEnd(lines, lineIndex),
      });
    });

    // Поиск классов
    const classMatches = [...content.matchAll(/class\s+(\w+)/g)];
    classMatches.forEach(match => {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      sections.push({
        type: 'class',
        name: match[1],
        startLine: lineIndex + 1,
        endLine: this.findClassEnd(lines, lineIndex),
      });
    });

    // Поиск комментариев-разделителей
    const sectionMatches = [...content.matchAll(/\/\/\s*[=\-]{3,}\s*(.+?)\s*[=\-]{3,}/g)];
    sectionMatches.forEach(match => {
      const lineIndex = content.substring(0, match.index).split('\n').length - 1;
      sections.push({
        type: 'section',
        name: match[1].trim(),
        startLine: lineIndex + 1,
        endLine: lineIndex + 50, // Приблизительная длина секции
      });
    });

    return sections;
  }

  findHTMLSections(content, lines) {
    const sections = [];

    // Поиск стилей
    const styleMatch = content.match(/<style[^>]*>/);
    if (styleMatch) {
      const startIndex = content.indexOf('<style');
      const endIndex = content.indexOf('</style>') + 8;
      const startLine = content.substring(0, startIndex).split('\n').length;
      const endLine = content.substring(0, endIndex).split('\n').length;

      sections.push({
        type: 'styles',
        name: 'CSS Стили',
        startLine,
        endLine,
      });
    }

    // Поиск скриптов
    const scriptMatches = [...content.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)];
    scriptMatches.forEach((match, index) => {
      const startIndex = match.index;
      const endIndex = startIndex + match[0].length;
      const startLine = content.substring(0, startIndex).split('\n').length;
      const endLine = content.substring(0, endIndex).split('\n').length;

      sections.push({
        type: 'script',
        name: `JavaScript блок ${index + 1}`,
        startLine,
        endLine,
      });
    });

    return sections;
  }

  findFunctionEnd(lines, startLine) {
    let braceCount = 0;
    let inFunction = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inFunction = true;
        } else if (char === '}') {
          braceCount--;
          if (inFunction && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }

    return startLine + 30; // Фолбэк
  }

  findClassEnd(lines, startLine) {
    // Аналогично findFunctionEnd, но для классов
    return this.findFunctionEnd(lines, startLine);
  }

  generateNavigationMap(filePath, totalLines, sections, ext) {
    const fileName = path.basename(filePath);
    const border = '─'.repeat(85);

    let map = `/*\n┌${border}┐\n`;
    map += `│ 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА ${fileName} (${totalLines} строк)${' '.repeat(Math.max(0, 85 - fileName.length - totalLines.toString().length - 45))}│\n`;
    map += `├${border}┤\n`;
    map += `│ 📋 СТРУКТУРА ФАЙЛА:${' '.repeat(85 - 20)}│\n`;
    map += `│${' '.repeat(85)}│\n`;

    // Группируем секции по типам
    const groupedSections = this.groupSectionsByType(sections);

    Object.entries(groupedSections).forEach(([type, typeSections]) => {
      const typeIcon = this.getTypeIcon(type);
      const typeName = this.getTypeName(type);

      map += `│ ${typeIcon} ${typeName}:${' '.repeat(85 - typeName.length - 5)}│\n`;

      typeSections.forEach(section => {
        const sectionLine = `│    ├── ${section.name} (${section.startLine}-${section.endLine})`;
        const padding = ' '.repeat(Math.max(0, 85 - sectionLine.length + 4));
        map += `${sectionLine}${padding}│\n`;
      });

      map += `│${' '.repeat(85)}│\n`;
    });

    map += `├${border}┤\n`;
    map += `│ 🎯 БЫСТРЫЙ ПОИСК:${' '.repeat(85 - 18)}│\n`;
    map += `│    • Найти функцию: Ctrl+F "function " + название${' '.repeat(85 - 52)}│\n`;
    map += `│    • Найти класс: Ctrl+F "class " + название${' '.repeat(85 - 48)}│\n`;
    map += `│    • Общий поиск: Ctrl+F + ключевое слово${' '.repeat(85 - 45)}│\n`;
    map += `└${border}┘\n*/\n\n`;

    return map;
  }

  groupSectionsByType(sections) {
    const grouped = {};

    sections.forEach(section => {
      if (!grouped[section.type]) {
        grouped[section.type] = [];
      }
      grouped[section.type].push(section);
    });

    return grouped;
  }

  getTypeIcon(type) {
    const icons = {
      function: '⚙️',
      class: '📦',
      section: '📋',
      styles: '🎨',
      script: '📜',
      export: '🔗',
      import: '📥',
    };
    return icons[type] || '📄';
  }

  getTypeName(type) {
    const names = {
      function: 'ФУНКЦИИ',
      class: 'КЛАССЫ',
      section: 'СЕКЦИИ',
      styles: 'CSS СТИЛИ',
      script: 'JAVASCRIPT',
      export: 'ЭКСПОРТЫ',
      import: 'ИМПОРТЫ',
    };
    return names[type] || type.toUpperCase();
  }

  processProject(projectPath) {
    console.log(`🔍 Сканирую проект: ${projectPath}`);

    const results = [];
    const files = this.findLargeFiles(projectPath);

    files.forEach(filePath => {
      try {
        const analysis = this.analyzeFile(filePath);
        results.push(analysis);

        if (analysis.needsMap) {
          console.log(`✅ Карта создана для: ${path.basename(filePath)}`);
        } else {
          console.log(`⚪ Файл не нуждается в карте: ${path.basename(filePath)}`);
        }
      } catch (error) {
        console.error(`❌ Ошибка анализа ${filePath}:`, error.message);
      }
    });

    return results;
  }

  findLargeFiles(projectPath, minLines = 300) {
    const files = [];
    const extensions = ['.js', '.html', '.css', '.ts', '.jsx', '.tsx'];

    const scan = dir => {
      try {
        const items = fs.readdirSync(dir);

        items.forEach(item => {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory() && !item.startsWith('.') && !item.includes('node_modules')) {
            scan(fullPath);
          } else if (stat.isFile() && extensions.includes(path.extname(item))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lineCount = content.split('\n').length;

            if (lineCount >= minLines) {
              files.push(fullPath);
            }
          }
        });
      } catch (error) {
        console.warn(`⚠️ Не удалось прочитать директорию: ${dir}`);
      }
    };

    scan(projectPath);
    return files;
  }
}

// Пример использования
if (require.main === module) {
  const mapper = new CodeMapper();
  const projectPath = process.argv[2] || './';

  console.log('🗺️ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ HEYS');
  console.log('=====================================');

  const results = mapper.processProject(projectPath);

  console.log('\n📊 СВОДКА:');
  console.log(`Всего проанализировано файлов: ${results.length}`);
  console.log(`Файлов нуждающихся в картах: ${results.filter(r => r.needsMap).length}`);

  // Создаем отчет
  const report = results.map(r => ({
    file: path.basename(r.filePath),
    lines: r.totalLines,
    sections: r.sections.length,
    needsMap: r.needsMap,
  }));

  console.table(report);
}

module.exports = CodeMapper;
