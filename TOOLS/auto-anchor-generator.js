/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🔧 АВТОМАТИЧЕСКИЙ ГЕНЕРАТОР ЯКОРЕЙ (Auto Anchor Generator)                               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Автоматически добавляет якорные метки в код при сохранении файлов                       │
│ Интегрируется с VSCode через save hooks или запускается вручную                         │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

class AutoAnchorGenerator {
  constructor() {
    this.config = {
      // Минимальный размер файла для добавления якорей (строки)
      minFileSize: 100,

      // Паттерны для автоматического определения точек якорей
      anchorPatterns: {
        js: [
          {
            pattern: /^class\s+(\w+)/gm,
            template: '// @ANCHOR:CLASS_{NAME}\n// КЛАСС {NAME}',
            position: 'before',
          },
          {
            pattern: /^(\s*)(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/gm,
            template: '{indent}// @ANCHOR:METHOD_{NAME}\n{indent}// МЕТОД {NAME}',
            position: 'before',
            condition: (match, context) => {
              // Только для методов в классах или больших функций
              return context.insideClass || match[0].length > 50;
            },
          },
          {
            pattern: /^(\s*)(\/\/\s*[=\-]{5,}.*[=\-]{5,})/gm,
            template: '{indent}// @ANCHOR:SECTION_{NAME}',
            position: 'before',
          },
        ],
        html: [
          {
            pattern: /(<style[^>]*>)/gi,
            template: '<!-- @ANCHOR:CSS_STYLES -->\n<!-- CSS СТИЛИ -->',
            position: 'before',
          },
          {
            pattern: /(<script[^>]*>)/gi,
            template: '<!-- @ANCHOR:JAVASCRIPT -->\n<!-- JAVASCRIPT КОД -->',
            position: 'before',
          },
          {
            pattern: /(class\s+(\w+))/gm,
            template: '        // @ANCHOR:CLASS_{NAME}\n        // КЛАСС {NAME}',
            position: 'before',
          },
        ],
      },

      // Исключения - где НЕ добавлять якоря
      excludePatterns: [
        /^\/\/ @ANCHOR:/, // Уже есть якорь
        /^<!--.*@ANCHOR:/, // HTML якорь уже есть
        /^\s*$/, // Пустые строки
        /^\s*\/\/.*тест/i, // Простые тесты
      ],
    };
  }

  // Основной метод - добавление якорей в код
  async addAnchorsToCode(content, fileName, options = {}) {
    const ext = this.getFileExtension(fileName);
    const lines = content.split('\n');

    console.log(`🔧 Обработка файла: ${fileName} (${lines.length} строк)`);

    // Проверяем, нужно ли добавлять якоря
    if (!this.shouldProcessFile(lines, fileName, options)) {
      console.log(`⏩ Файл пропущен: ${fileName}`);
      return { content, changes: [] };
    }

    const patterns = this.config.anchorPatterns[ext] || this.config.anchorPatterns.js;
    const changes = [];
    let modifiedContent = content;
    let offset = 0; // Смещение из-за добавленных строк

    // Обрабатываем каждый паттерн
    for (const pattern of patterns) {
      const matches = this.findPatternMatches(modifiedContent, pattern);

      for (const match of matches.reverse()) {
        // Обрабатываем с конца, чтобы не сбивать позиции
        const anchorText = this.generateAnchorText(match, pattern);

        if (this.shouldAddAnchor(match, modifiedContent)) {
          const { newContent, linesAdded } = this.insertAnchor(
            modifiedContent,
            match,
            anchorText,
            pattern.position
          );

          modifiedContent = newContent;
          changes.push({
            type: 'anchor_added',
            line: match.line + offset,
            pattern: pattern.pattern.source,
            anchor: anchorText,
          });
          offset += linesAdded;
        }
      }
    }

    console.log(`✅ Обработано: ${changes.length} якорей добавлено`);
    return { content: modifiedContent, changes };
  }

  // Генерация текста якоря на основе найденного совпадения
  generateAnchorText(match, pattern) {
    let template = pattern.template;

    // Замена переменных в шаблоне
    template = template.replace(/{NAME}/g, match.name || 'UNKNOWN');
    template = template.replace(/{indent}/g, match.indent || '');

    // Нормализация имени для якоря
    const normalizedName = (match.name || 'SECTION').toUpperCase().replace(/[^A-Z0-9]/g, '_');

    template = template.replace(/{NORMALIZED_NAME}/g, normalizedName);

    return template;
  }

  // Вставка якоря в код
  insertAnchor(content, match, anchorText, position) {
    const lines = content.split('\n');
    const targetLine = position === 'before' ? match.line - 1 : match.line;

    lines.splice(targetLine, 0, anchorText);

    return {
      newContent: lines.join('\n'),
      linesAdded: anchorText.split('\n').length,
    };
  }

  // Поиск совпадений с паттерном
  findPatternMatches(content, pattern) {
    const matches = [];
    const lines = content.split('\n');

    let match;
    while ((match = pattern.pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      const lineContent = lines[lineNumber - 1];

      matches.push({
        line: lineNumber,
        index: match.index,
        fullMatch: match[0],
        name: match[2] || match[1] || 'UNNAMED',
        indent: lineContent.match(/^\s*/)[0],
        context: this.getMatchContext(lines, lineNumber - 1),
      });
    }

    return matches;
  }

  // Определение контекста совпадения
  getMatchContext(lines, lineIndex) {
    const context = {
      insideClass: false,
      insideFunction: false,
      indentLevel: 0,
    };

    // Поиск класса выше
    for (let i = lineIndex - 1; i >= 0; i--) {
      if (/^class\s+\w+/.test(lines[i])) {
        context.insideClass = true;
        break;
      }
    }

    // Уровень отступов
    const indent = lines[lineIndex].match(/^\s*/)[0];
    context.indentLevel = indent.length;

    return context;
  }

  // Проверка, нужно ли добавлять якорь
  shouldAddAnchor(match, content) {
    const lineContent = content.split('\n')[match.line - 1];

    // Проверяем исключения
    for (const excludePattern of this.config.excludePatterns) {
      if (excludePattern.test(lineContent)) {
        return false;
      }
    }

    // Проверяем, нет ли уже якоря рядом
    const lines = content.split('\n');
    const checkRange = 3; // Проверяем 3 строки выше и ниже

    for (
      let i = Math.max(0, match.line - checkRange);
      i < Math.min(lines.length, match.line + checkRange);
      i++
    ) {
      if (/@ANCHOR:/i.test(lines[i])) {
        return false; // Якорь уже есть рядом
      }
    }

    return true;
  }

  // Проверка, нужно ли обрабатывать файл
  shouldProcessFile(lines, fileName, options) {
    // Размер файла
    if (lines.length < this.config.minFileSize && !options.force) {
      return false;
    }

    // Исключаем файлы-демо и тесты
    if (/(?:demo|test|spec)\.(?:js|html)$/i.test(fileName) && !options.force) {
      return false;
    }

    // Уже обработанные файлы (если много якорей)
    const anchorCount = lines.filter(line => /@ANCHOR:/i.test(line)).length;
    if (anchorCount > lines.length * 0.1) {
      // Больше 10% строк с якорями
      return false;
    }

    return true;
  }

  // Вспомогательные методы
  getFileExtension(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    return ['js', 'html', 'css', 'ts'].includes(ext) ? ext : 'js';
  }

  // Интеграция с файловой системой
  async processFile(filePath, options = {}) {
    try {
      const fs = require('fs').promises;
      const content = await fs.readFile(filePath, 'utf8');

      const result = await this.addAnchorsToCode(content, filePath, options);

      if (result.changes.length > 0 && !options.dryRun) {
        await fs.writeFile(filePath, result.content, 'utf8');
        console.log(`💾 Файл сохранен: ${filePath}`);
      }

      return result;
    } catch (error) {
      console.error(`❌ Ошибка обработки ${filePath}:`, error);
      return { content: null, changes: [], error };
    }
  }

  // Пакетная обработка файлов
  async processDirectory(dirPath, options = {}) {
    const fs = require('fs').promises;
    const path = require('path');

    const files = await fs.readdir(dirPath, { withFileTypes: true });
    const results = [];

    for (const file of files) {
      if (file.isFile() && /\.(js|html|ts)$/.test(file.name)) {
        const filePath = path.join(dirPath, file.name);
        const result = await this.processFile(filePath, options);
        results.push({ file: file.name, ...result });
      }
    }

    return results;
  }
}

// Интеграция с VSCode через extension
class VSCodeAnchorIntegration {
  constructor() {
    this.generator = new AutoAnchorGenerator();
  }

  // Хук на сохранение файла
  onWillSaveDocument(document) {
    if (this.shouldAutoProcess(document)) {
      return this.addAnchorsOnSave(document);
    }
  }

  async addAnchorsOnSave(document) {
    const result = await this.generator.addAnchorsToCode(document.getText(), document.fileName, {
      autoSave: true,
    });

    if (result.changes.length > 0) {
      // Создаем edits для VSCode
      const edits = result.changes.map(change => ({
        range: new vscode.Range(change.line, 0, change.line, 0),
        newText: change.anchor + '\n',
      }));

      return edits;
    }

    return [];
  }

  shouldAutoProcess(document) {
    const config = vscode.workspace.getConfiguration('heys.anchors');
    return config.get('autoGenerate', false) && /\.(js|html|ts)$/.test(document.fileName);
  }
}

// Экспорт для использования
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AutoAnchorGenerator, VSCodeAnchorIntegration };
}

// Использование в браузере
if (typeof window !== 'undefined') {
  window.AutoAnchorGenerator = AutoAnchorGenerator;
}

/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 📖 ИНСТРУКЦИЯ ПО ИСПОЛЬЗОВАНИЮ:                                                          │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                           │
│ 1. Автоматический режим (VSCode):                                                        │
│    - Установить расширение с этим кодом                                                  │
│    - Включить настройку "heys.anchors.autoGenerate": true                               │
│    - Якоря добавляются при сохранении файла                                             │
│                                                                                           │
│ 2. Ручной режим:                                                                         │
│    const generator = new AutoAnchorGenerator();                                          │
│    const result = await generator.processFile('path/to/file.js');                       │
│                                                                                           │
│ 3. Пакетная обработка:                                                                   │
│    const results = await generator.processDirectory('./src');                            │
│                                                                                           │
│ 4. Предварительный просмотр:                                                             │
│    const result = await generator.processFile('file.js', { dryRun: true });             │
│                                                                                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/
