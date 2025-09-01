/*
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│ 🗺️ ДИНАМИЧЕСКИЙ ГЕНЕРАТОР НАВИГАЦИОННЫХ КАРТ                                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│ Автоматически создает актуальные карты на основе анализа кода в реальном времени        │
└─────────────────────────────────────────────────────────────────────────────────────────┘
*/

class DynamicNavigationMapper {
  constructor() {
    this.patterns = {
      js: {
        functions: /function\s+(\w+)\s*\(/g,
        classes: /class\s+(\w+)/g,
        methods: /(\w+)\s*\([^)]*\)\s*{/g,
        comments: /\/\*[\s\S]*?\*\/|\/\/.*$/gm,
        sections: /\/\/\s*[=\-]{3,}\s*(.+?)\s*[=\-]{3,}/g,
        exports: /(?:export|exports\.)(\w+)/g,
      },
      html: {
        sections: /<!--\s*(.+?)\s*-->/g,
        scripts: /<script[^>]*>/g,
        styles: /<style[^>]*>/g,
        classes: /class\s+(\w+)/g,
        ids: /id="([^"]+)"/g,
        functions: /function\s+(\w+)\s*\(/g,
      },
    };
  }

  // Основной метод генерации карты
  generateLiveMap(content, fileName) {
    const lines = content.split('\n');
    const totalLines = lines.length;
    const ext = this.getFileExtension(fileName);

    const sections = this.findCodeSections(content, lines, ext);
    const map = this.buildNavigationMap(fileName, totalLines, sections);

    return {
      map,
      sections,
      timestamp: new Date().toISOString(),
      checksum: this.calculateChecksum(content),
    };
  }

  // Поиск секций кода с точными номерами строк
  findCodeSections(content, lines, ext) {
    const sections = [];
    const patterns = this.patterns[ext] || this.patterns.js;

    // Поиск функций с точными позициями
    this.findMatches(content, patterns.functions, 'function').forEach((match) => {
      const endLine = this.findBlockEnd(lines, match.line - 1);
      sections.push({
        type: 'function',
        name: match.name,
        startLine: match.line,
        endLine: endLine,
        content: match.fullMatch,
      });
    });

    // Поиск классов
    this.findMatches(content, patterns.classes, 'class').forEach((match) => {
      const endLine = this.findBlockEnd(lines, match.line - 1);
      sections.push({
        type: 'class',
        name: match.name,
        startLine: match.line,
        endLine: endLine,
        content: match.fullMatch,
      });
    });

    // Поиск секций-комментариев
    this.findMatches(content, patterns.sections, 'section').forEach((match) => {
      sections.push({
        type: 'section',
        name: match.name,
        startLine: match.line,
        endLine: match.line,
        content: match.fullMatch,
      });
    });

    return sections.sort((a, b) => a.startLine - b.startLine);
  }

  // Универсальный поиск совпадений с номерами строк
  findMatches(content, regex, type) {
    const matches = [];
    let match;

    while ((match = regex.exec(content)) !== null) {
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      matches.push({
        name: match[1] || `${type}_${matches.length + 1}`,
        line: lineNumber,
        fullMatch: match[0],
        index: match.index,
      });
    }

    return matches;
  }

  // Поиск конца блока кода (по фигурным скобкам)
  findBlockEnd(lines, startLine) {
    let braceCount = 0;
    let inBlock = false;

    for (let i = startLine; i < lines.length; i++) {
      const line = lines[i];

      for (const char of line) {
        if (char === '{') {
          braceCount++;
          inBlock = true;
        } else if (char === '}') {
          braceCount--;
          if (inBlock && braceCount === 0) {
            return i + 1;
          }
        }
      }
    }

    return startLine + 20; // Фолбэк для функций без {}
  }

  // Построение красивой карты
  buildNavigationMap(fileName, totalLines, sections) {
    const border = '─'.repeat(85);
    const timestamp = new Date().toLocaleString('ru-RU');

    let map = `/*\n┌${border}┐\n`;
    map += `│ 🗺️ АВТОГЕНЕРИРОВАННАЯ КАРТА ${fileName} (${totalLines} строк)${' '.repeat(Math.max(0, 40 - fileName.length))}│\n`;
    map += `│ ⏰ Создано: ${timestamp}${' '.repeat(85 - timestamp.length - 12)}│\n`;
    map += `├${border}┤\n`;
    map += `│ 📋 СТРУКТУРА ФАЙЛА:${' '.repeat(85 - 20)}│\n`;
    map += `│${' '.repeat(85)}│\n`;

    // Группируем по типам
    const grouped = this.groupByType(sections);

    Object.entries(grouped).forEach(([type, items]) => {
      const icon = this.getTypeIcon(type);
      const name = this.getTypeName(type);

      map += `│ ${icon} ${name}:${' '.repeat(85 - name.length - 5)}│\n`;

      items.forEach((item) => {
        const line = `│    ├── ${item.name} (${item.startLine}-${item.endLine})`;
        const padding = ' '.repeat(Math.max(0, 89 - line.length));
        map += `${line}${padding}│\n`;
      });

      map += `│${' '.repeat(85)}│\n`;
    });

    map += `├${border}┤\n`;
    map += `│ 🎯 БЫСТРАЯ НАВИГАЦИЯ:${' '.repeat(85 - 22)}│\n`;
    map += `│    • Ctrl+G - переход к строке${' '.repeat(85 - 35)}│\n`;
    map += `│    • Ctrl+F - поиск по имени${' '.repeat(85 - 33)}│\n`;
    map += `│    • Карта обновляется автоматически${' '.repeat(85 - 41)}│\n`;
    map += `└${border}┘\n*/\n\n`;

    return map;
  }

  // Вспомогательные методы
  groupByType(sections) {
    const grouped = {};
    sections.forEach((section) => {
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
      method: '🔧',
      export: '🔗',
    };
    return icons[type] || '📄';
  }

  getTypeName(type) {
    const names = {
      function: 'ФУНКЦИИ',
      class: 'КЛАССЫ',
      section: 'СЕКЦИИ',
      method: 'МЕТОДЫ',
      export: 'ЭКСПОРТЫ',
    };
    return names[type] || type.toUpperCase();
  }

  getFileExtension(fileName) {
    return fileName.split('.').pop().toLowerCase();
  }

  calculateChecksum(content) {
    // Простая контрольная сумма для отслеживания изменений
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // 32-битное целое
    }
    return hash.toString(16);
  }

  // Проверка актуальности карты
  isMapOutdated(content, existingChecksum) {
    const currentChecksum = this.calculateChecksum(content);
    return currentChecksum !== existingChecksum;
  }
}

// Система автоматического обновления карт
class NavigationMapManager {
  constructor() {
    this.mapper = new DynamicNavigationMapper();
    this.watchedFiles = new Map();
    this.updateInterval = 5000; // 5 секунд
  }

  // Добавить файл в отслеживание
  watchFile(filePath, content) {
    const mapData = this.mapper.generateLiveMap(content, filePath);
    this.watchedFiles.set(filePath, {
      ...mapData,
      lastUpdate: Date.now(),
    });

    console.log(`📍 Файл ${filePath} добавлен в отслеживание`);
    return mapData.map;
  }

  // Проверить и обновить карту если нужно
  updateMapIfNeeded(filePath, currentContent) {
    const watchData = this.watchedFiles.get(filePath);
    if (!watchData) {
      return this.watchFile(filePath, currentContent);
    }

    if (this.mapper.isMapOutdated(currentContent, watchData.checksum)) {
      console.log(`🔄 Обновляю карту для ${filePath}`);
      const newMapData = this.mapper.generateLiveMap(currentContent, filePath);

      this.watchedFiles.set(filePath, {
        ...newMapData,
        lastUpdate: Date.now(),
      });

      return newMapData.map;
    }

    return watchData.map;
  }

  // Получить статистику отслеживаемых файлов
  getWatchStats() {
    const stats = {};
    this.watchedFiles.forEach((data, path) => {
      stats[path] = {
        sections: data.sections.length,
        lastUpdate: new Date(data.lastUpdate).toLocaleString('ru-RU'),
        checksum: data.checksum,
      };
    });
    return stats;
  }
}

// Экспорт для использования в других модулях
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicNavigationMapper, NavigationMapManager };
}

// Глобальная инициализация для браузера
if (typeof window !== 'undefined') {
  window.HEYS = window.HEYS || {};
  window.HEYS.NavigationMapper = DynamicNavigationMapper;
  window.HEYS.NavigationManager = NavigationMapManager;

  console.log('🗺️ Система динамических навигационных карт HEYS загружена');
}
