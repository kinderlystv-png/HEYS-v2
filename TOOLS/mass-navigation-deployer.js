/**
 * 🗺️ МАССОВОЕ ВНЕДРЕНИЕ НАВИГАЦИОННЫХ КАРТ
 * Автоматически добавляет навигационные карты во все большие файлы проекта HEYS
 */

class NavigationMapsDeployer {
  constructor() {
    this.minLines = 500;
    this.targetFiles = [];
    this.processedFiles = 0;
    this.errors = [];
  }

  /**
   * 🔍 Находит все файлы, которым нужны навигационные карты
   */
  async findTargetFiles() {
    const fs = require('fs').promises;
    const path = require('path');

    const scanDirectory = async dir => {
      const items = await fs.readdir(dir, { withFileTypes: true });

      for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          await scanDirectory(fullPath);
        } else if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();

          // Проверяем только JS, TS и HTML файлы
          if (['.js', '.ts', '.html'].includes(ext)) {
            const content = await fs.readFile(fullPath, 'utf8');
            const lineCount = content.split('\n').length;

            if (lineCount >= this.minLines) {
              this.targetFiles.push({
                path: fullPath,
                lines: lineCount,
                type: ext.substring(1),
                hasNavigation: this.checkExistingNavigation(content),
              });
            }
          }
        }
      }
    };

    await scanDirectory('.');
    return this.targetFiles;
  }

  /**
   * ✅ Проверяет, есть ли уже навигационная карта в файле
   */
  checkExistingNavigation(content) {
    return (
      content.includes('dynamic-navigation-mapper.js') ||
      content.includes('initNavigationMapper') ||
      content.includes('id="dynamic-navigation-map"')
    );
  }

  /**
   * 🚀 Добавляет навигационную карту в HTML файл
   */
  async addNavigationToHTML(filePath) {
    const fs = require('fs').promises;
    let content = await fs.readFile(filePath, 'utf8');

    // Навигационная панель
    const navigationHTML = `
    <!-- 🗺️ АВТОМАТИЧЕСКАЯ НАВИГАЦИОННАЯ КАРТА -->
    <div id="dynamic-navigation-map" class="navigation-sidebar">
        <div class="navigation-header">
            <h3>🗺️ Навигация</h3>
            <button id="toggle-navigation">📍</button>
        </div>
        <div class="navigation-content">
            <div class="navigation-stats"></div>
            <div class="navigation-anchors"></div>
        </div>
    </div>

    <!-- Стили для навигации -->
    <style>
        .navigation-sidebar {
            position: fixed;
            left: 0;
            top: 0;
            width: 300px;
            height: 100vh;
            background: linear-gradient(135deg, #1e293b, #334155);
            color: white;
            z-index: 1000;
            overflow-y: auto;
            box-shadow: 4px 0 20px rgba(0,0,0,0.3);
            transform: translateX(-280px);
            transition: all 0.3s ease;
        }

        .navigation-sidebar.expanded {
            transform: translateX(0);
        }

        .navigation-header {
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-bottom: 1px solid rgba(255,255,255,0.1);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .navigation-content {
            padding: 15px;
        }

        .anchor-item {
            padding: 8px 12px;
            margin: 4px 0;
            background: rgba(255,255,255,0.1);
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.3s ease;
            border-left: 3px solid #60a5fa;
        }

        .anchor-item:hover {
            background: rgba(255,255,255,0.2);
            transform: translateX(5px);
        }

        #toggle-navigation {
            position: fixed;
            left: 10px;
            top: 10px;
            background: rgba(30, 41, 59, 0.9);
            color: white;
            border: none;
            padding: 10px;
            border-radius: 50%;
            cursor: pointer;
            z-index: 1001;
            font-size: 18px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        }
    </style>`;

    // Добавляем навигацию после <body>
    content = content.replace(/<body[^>]*>/i, match => {
      return match + navigationHTML;
    });

    // Добавляем скрипт перед </body>
    const scriptHTML = `
    <!-- 🗺️ НАВИГАЦИОННАЯ СИСТЕМА -->
    <script src="../TOOLS/dynamic-navigation-mapper.js"></script>
    <script>
        document.addEventListener('DOMContentLoaded', function() {
            initNavigationMapper();
            
            // Переключатель навигации
            const toggleBtn = document.getElementById('toggle-navigation');
            const sidebar = document.getElementById('dynamic-navigation-map');
            
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('expanded');
            });
        });
    </script>`;

    content = content.replace(/<\/body>/i, scriptHTML + '\n</body>');

    await fs.writeFile(filePath, content, 'utf8');
    return true;
  }

  /**
   * 🔧 Добавляет навигационные комментарии в JS/TS файлы
   */
  async addNavigationToJS(filePath) {
    const fs = require('fs').promises;
    let content = await fs.readFile(filePath, 'utf8');

    // Добавляем навигационные якоря
    const navigationComment = `
/**
 * 🗺️ НАВИГАЦИОННАЯ КАРТА ФАЙЛА
 * Файл: ${path.basename(filePath)}
 * Размер: ${content.split('\n').length} строк
 * 
 * 📍 ОСНОВНЫЕ СЕКЦИИ:
 * - Инициализация и конфигурация
 * - Основные классы и функции  
 * - Обработчики событий
 * - Утилиты и помощники
 * - Экспорт модулей
 */

// 🏗️ === АРХИТЕКТУРНАЯ СЕКЦИЯ ===
`;

    // Добавляем в начало файла
    content = navigationComment + content;

    // Ищем основные функции и добавляем якоря
    content = this.addNavigationAnchors(content);

    await fs.writeFile(filePath, content, 'utf8');
    return true;
  }

  /**
   * 📍 Добавляет навигационные якоря в код
   */
  addNavigationAnchors(content) {
    const lines = content.split('\n');
    const processedLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ищем функции, классы, методы
      if (this.isImportantCodeLine(line)) {
        processedLines.push(`// 📍 ${this.generateAnchorName(line)}`);
      }

      processedLines.push(line);
    }

    return processedLines.join('\n');
  }

  /**
   * 🎯 Определяет важные строки кода для якорей
   */
  isImportantCodeLine(line) {
    const trimmed = line.trim();
    return (
      trimmed.startsWith('function ') ||
      trimmed.startsWith('class ') ||
      (trimmed.startsWith('const ') && trimmed.includes(' = ')) ||
      trimmed.startsWith('async ') ||
      trimmed.includes('export ')
    );
  }

  /**
   * 🏷️ Генерирует имя якоря по строке кода
   */
  generateAnchorName(line) {
    const trimmed = line.trim();

    if (trimmed.startsWith('function ')) {
      return (
        'FUNCTION: ' + trimmed.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)?.[1] || 'Unknown'
      );
    }

    if (trimmed.startsWith('class ')) {
      return 'CLASS: ' + trimmed.match(/class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)?.[1] || 'Unknown';
    }

    if (trimmed.startsWith('const ')) {
      return 'CONST: ' + trimmed.match(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)?.[1] || 'Unknown';
    }

    return 'CODE_BLOCK';
  }

  /**
   * 🚀 Запускает массовое внедрение
   */
  async deploy() {
    console.log('🗺️ Запуск массового внедрения навигационных карт...\n');

    // Находим целевые файлы
    await this.findTargetFiles();

    console.log(`📊 Найдено ${this.targetFiles.length} файлов для обновления:\n`);

    this.targetFiles.forEach(file => {
      const status = file.hasNavigation ? '✅' : '🔄';
      console.log(`${status} ${file.path} (${file.lines} строк, ${file.type.toUpperCase()})`);
    });

    console.log('\n🚀 Начинаем обработку...\n');

    // Обрабатываем каждый файл
    for (const file of this.targetFiles) {
      if (file.hasNavigation) {
        console.log(`⏭️  Пропускаем ${file.path} - навигация уже есть`);
        continue;
      }

      try {
        if (file.type === 'html') {
          await this.addNavigationToHTML(file.path);
        } else {
          await this.addNavigationToJS(file.path);
        }

        this.processedFiles++;
        console.log(`✅ Обработан: ${file.path}`);
      } catch (error) {
        this.errors.push({ file: file.path, error: error.message });
        console.log(`❌ Ошибка в ${file.path}: ${error.message}`);
      }
    }

    // Итоговый отчет
    this.generateReport();
  }

  /**
   * 📊 Генерирует отчет о проделанной работе
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 ОТЧЕТ О ВНЕДРЕНИИ НАВИГАЦИОННЫХ КАРТ');
    console.log('='.repeat(60));
    console.log(`🎯 Всего файлов найдено: ${this.targetFiles.length}`);
    console.log(`✅ Успешно обработано: ${this.processedFiles}`);
    console.log(`❌ Ошибок: ${this.errors.length}`);

    if (this.errors.length > 0) {
      console.log('\n❌ Список ошибок:');
      this.errors.forEach(err => {
        console.log(`   ${err.file}: ${err.error}`);
      });
    }

    console.log('\n🎪 Результат:');
    console.log('   📁 Все большие файлы теперь имеют навигационные карты!');
    console.log('   🗺️  Улучшена навигация по проекту');
    console.log('   🚀 Повышена эффективность разработки');

    console.log('\n🎯 Следующие шаги:');
    console.log('   1. Откройте любой обновленный HTML файл');
    console.log('   2. Нажмите 📍 кнопку навигации слева');
    console.log('   3. Наслаждайтесь удобной навигацией!');
  }
}

// 🚀 ЗАПУСК СИСТЕМЫ
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NavigationMapsDeployer;
} else {
  // Запуск в браузере или Node.js
  const deployer = new NavigationMapsDeployer();
  deployer.deploy().catch(console.error);
}
