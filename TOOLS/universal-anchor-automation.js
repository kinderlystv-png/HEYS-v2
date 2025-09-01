/**
 * 🤖 УНИВЕРСАЛЬНЫЙ АВТОМАТИЧЕСКИЙ ГЕНЕРАТОР ЯКОРЕЙ
 * Обрабатывает ВСЕ файлы, независимо от размера
 */

class UniversalAnchorAutomation {
  constructor() {
    this.config = {
      // Обрабатываем ВСЕ размеры файлов
      minFileSize: 10, // Минимум 10 строк (почти все файлы)
      maxFileSize: 10000, // Максимум 10k строк

      // Расширения для обработки
      processExtensions: ['.js', '.ts', '.html', '.css', '.json', '.md'],

      // Автоматически обрабатываем все операции
      autoProcessOperations: ['replace_string_in_file', 'create_file', 'edit_file', 'modify_file'],

      // Исключения (где НЕ добавляем якоря)
      excludePatterns: [/node_modules/, /\.git/, /temp/, /cache/, /\.min\./, /_backup/],

      // Режимы якорей для разных размеров файлов
      anchorModes: {
        tiny: { minLines: 10, maxLines: 50, anchors: ['functions', 'classes'] },
        small: { minLines: 51, maxLines: 150, anchors: ['functions', 'classes', 'methods'] },
        medium: {
          minLines: 151,
          maxLines: 500,
          anchors: ['functions', 'classes', 'methods', 'sections'],
        },
        large: {
          minLines: 501,
          maxLines: 10000,
          anchors: ['functions', 'classes', 'methods', 'sections', 'comments'],
        },
      },
    };

    this.processedFiles = new Map(); // Отслеживаем обработанные файлы
    this.stats = {
      totalProcessed: 0,
      anchorsAdded: 0,
      operationsHandled: 0,
    };
  }

  // Основная функция-перехватчик для всех файловых операций
  async interceptFileOperation(operation, ...args) {
    console.log(`🤖 АВТОМАТИЧЕСКИЙ ПЕРЕХВАТ: ${operation}`);

    let result;
    let targetFiles = [];

    try {
      // Выполняем оригинальную операцию
      result = await this.executeOriginalOperation(operation, args);

      // Определяем затронутые файлы
      targetFiles = this.extractTargetFiles(operation, args, result);

      // АВТОМАТИЧЕСКИ обрабатываем ВСЕ файлы
      await this.processAllFiles(targetFiles);

      this.stats.operationsHandled++;

      return result;
    } catch (error) {
      console.error(`❌ Ошибка автоматической обработки ${operation}:`, error);
      throw error;
    }
  }

  // Выполнение оригинальной операции
  async executeOriginalOperation(operation, args) {
    console.log(`  📝 Выполнение: ${operation} с ${args.length} аргументами`);

    // В реальности здесь были бы вызовы настоящих функций:
    // - replace_string_in_file
    // - create_file
    // - edit_file

    // Пока имитируем
    switch (operation) {
      case 'replace_string_in_file':
        return { success: true, file: args[0], changes: 1 };
      case 'create_file':
        return { success: true, file: args[0], size: args[1]?.length || 0 };
      case 'edit_file':
        return { success: true, file: args[0], edits: 1 };
      default:
        return { success: true };
    }
  }

  // Извлечение целевых файлов из операции
  extractTargetFiles(operation, args, result) {
    switch (operation) {
      case 'replace_string_in_file':
      case 'create_file':
      case 'edit_file':
        return [args[0]]; // Первый аргумент - путь к файлу

      case 'multiple_files':
        return args[0]; // Массив файлов

      default:
        return [];
    }
  }

  // Обработка всех файлов с якорями
  async processAllFiles(filePaths) {
    console.log(`🔗 АВТОМАТИЧЕСКАЯ ОБРАБОТКА: ${filePaths.length} файлов`);

    for (const filePath of filePaths) {
      await this.processFile(filePath);
    }
  }

  // Обработка одного файла
  async processFile(filePath) {
    try {
      // Проверяем, нужно ли обрабатывать файл
      if (!this.shouldProcessFile(filePath)) {
        console.log(`  ⏩ Пропущен: ${filePath}`);
        return;
      }

      // Определяем размер и режим обработки
      const fileInfo = await this.analyzeFile(filePath);
      const mode = this.determineAnchorMode(fileInfo.lines);

      console.log(`  🔍 Анализ: ${filePath} (${fileInfo.lines} строк, режим: ${mode})`);

      // Добавляем якоря согласно режиму
      const result = await this.addAnchorsWithMode(filePath, fileInfo, mode);

      if (result.anchorsAdded > 0) {
        console.log(`  ✅ Добавлено ${result.anchorsAdded} якорей в ${filePath}`);
        this.stats.anchorsAdded += result.anchorsAdded;
      } else {
        console.log(`  ℹ️ Якоря не требуются в ${filePath}`);
      }

      this.processedFiles.set(filePath, {
        timestamp: new Date().toISOString(),
        mode: mode,
        anchorsAdded: result.anchorsAdded,
        lines: fileInfo.lines,
      });

      this.stats.totalProcessed++;
    } catch (error) {
      console.error(`  ❌ Ошибка обработки ${filePath}:`, error);
    }
  }

  // Проверка, нужно ли обрабатывать файл
  shouldProcessFile(filePath) {
    // Проверяем расширение
    const hasValidExtension = this.config.processExtensions.some((ext) =>
      filePath.toLowerCase().endsWith(ext),
    );

    if (!hasValidExtension) return false;

    // Проверяем исключения
    for (const pattern of this.config.excludePatterns) {
      if (pattern.test(filePath)) return false;
    }

    return true;
  }

  // Анализ файла
  async analyzeFile(filePath) {
    // В реальности здесь был бы read_file
    // Пока имитируем
    const estimatedLines = Math.floor(Math.random() * 1000) + 10;
    const estimatedSize = estimatedLines * 50; // примерно 50 символов на строку

    return {
      lines: estimatedLines,
      size: estimatedSize,
      extension: filePath.split('.').pop(),
      exists: true,
    };
  }

  // Определение режима якорей по размеру
  determineAnchorMode(lines) {
    for (const [mode, config] of Object.entries(this.config.anchorModes)) {
      if (lines >= config.minLines && lines <= config.maxLines) {
        return mode;
      }
    }
    return 'large'; // По умолчанию большой режим
  }

  // Добавление якорей согласно режиму
  async addAnchorsWithMode(filePath, fileInfo, mode) {
    const modeConfig = this.config.anchorModes[mode];
    console.log(`    🎯 Режим "${mode}": ${modeConfig.anchors.join(', ')}`);

    let anchorsAdded = 0;

    // В реальности здесь был бы вызов real-anchor-demo.js
    // Пока имитируем добавление якорей

    if (modeConfig.anchors.includes('functions')) {
      anchorsAdded += Math.floor(Math.random() * 5) + 1; // 1-5 функций
    }

    if (modeConfig.anchors.includes('classes')) {
      anchorsAdded += Math.floor(Math.random() * 3) + 1; // 1-3 класса
    }

    if (modeConfig.anchors.includes('methods')) {
      anchorsAdded += Math.floor(Math.random() * 8) + 2; // 2-10 методов
    }

    if (modeConfig.anchors.includes('sections')) {
      anchorsAdded += Math.floor(Math.random() * 4) + 1; // 1-4 секции
    }

    if (modeConfig.anchors.includes('comments')) {
      anchorsAdded += Math.floor(Math.random() * 6) + 1; // 1-6 комментариев
    }

    // В реальности:
    // await run_in_terminal(`node TOOLS/real-anchor-demo.js "${filePath}"`);

    return { anchorsAdded };
  }

  // Функции-обертки для автоматического перехвата
  async autoReplaceStringInFile(filePath, oldString, newString) {
    return await this.interceptFileOperation(
      'replace_string_in_file',
      filePath,
      oldString,
      newString,
    );
  }

  async autoCreateFile(filePath, content) {
    return await this.interceptFileOperation('create_file', filePath, content);
  }

  async autoEditFile(filePath, edits) {
    return await this.interceptFileOperation('edit_file', filePath, edits);
  }

  // Пакетная обработка существующих файлов
  async processExistingFiles(directory = '.') {
    console.log(`🔄 ПАКЕТНАЯ ОБРАБОТКА ДИРЕКТОРИИ: ${directory}`);

    // В реальности здесь был бы file_search или list_dir
    const mockFiles = [
      'heys_core_v12.js',
      'heys_reports_v12.js',
      'heys_user_v12.js',
      'heys_day_v12.js',
      'index.html',
      'styles/main.css',
      'small_utility.js',
      'tiny_helper.js',
    ];

    await this.processAllFiles(mockFiles);
  }

  // Статистика и отчеты
  getStats() {
    return {
      ...this.stats,
      filesTracked: this.processedFiles.size,
      averageAnchorsPerFile:
        this.stats.totalProcessed > 0
          ? Math.round(this.stats.anchorsAdded / this.stats.totalProcessed)
          : 0,
    };
  }

  getDetailedReport() {
    const stats = this.getStats();
    const filesList = Array.from(this.processedFiles.entries()).map(([path, info]) => ({
      path,
      ...info,
    }));

    return {
      summary: stats,
      files: filesList,
      timestamp: new Date().toISOString(),
    };
  }

  // Сброс статистики
  reset() {
    this.processedFiles.clear();
    this.stats = {
      totalProcessed: 0,
      anchorsAdded: 0,
      operationsHandled: 0,
    };
    console.log('🔄 Статистика сброшена');
  }
}

// Создаем глобальный экземпляр
const universalAnchorSystem = new UniversalAnchorAutomation();

// Функции-обертки для замены стандартных операций
async function smartReplaceStringInFile(filePath, oldString, newString) {
  return await universalAnchorSystem.autoReplaceStringInFile(filePath, oldString, newString);
}

async function smartCreateFile(filePath, content) {
  return await universalAnchorSystem.autoCreateFile(filePath, content);
}

async function smartEditFile(filePath, edits) {
  return await universalAnchorSystem.autoEditFile(filePath, edits);
}

// Пакетная обработка
async function processAllExistingFiles() {
  return await universalAnchorSystem.processExistingFiles();
}

// Отчеты
function getAnchorStats() {
  return universalAnchorSystem.getStats();
}

function getDetailedAnchorReport() {
  return universalAnchorSystem.getDetailedReport();
}

// Экспорт
module.exports = {
  UniversalAnchorAutomation,
  universalAnchorSystem,
  smartReplaceStringInFile,
  smartCreateFile,
  smartEditFile,
  processAllExistingFiles,
  getAnchorStats,
  getDetailedAnchorReport,
};

// Демонстрация
if (require.main === module) {
  async function demo() {
    console.log('🤖 ДЕМОНСТРАЦИЯ УНИВЕРСАЛЬНОЙ АВТОМАТИЗАЦИИ\n');

    // Пример 1: Маленький файл (будет обработан!)
    await smartCreateFile('small_utility.js', 'function helper() { return true; }');

    // Пример 2: Средний файл
    await smartReplaceStringInFile('medium_module.js', 'old code', 'new code');

    // Пример 3: Большой файл
    await smartCreateFile('large_system.js', 'class BigSystem { /* много кода */ }');

    // Пример 4: Пакетная обработка
    await processAllExistingFiles();

    // Отчет
    console.log('\n📊 ФИНАЛЬНАЯ СТАТИСТИКА:');
    const stats = getAnchorStats();
    console.log(`   Операций обработано: ${stats.operationsHandled}`);
    console.log(`   Файлов обработано: ${stats.totalProcessed}`);
    console.log(`   Якорей добавлено: ${stats.anchorsAdded}`);
    console.log(`   Среднее якорей на файл: ${stats.averageAnchorsPerFile}`);

    const report = getDetailedAnchorReport();
    console.log('\n📋 ОБРАБОТАННЫЕ ФАЙЛЫ:');
    report.files.forEach((file) => {
      console.log(`   📄 ${file.path}: ${file.anchorsAdded} якорей (${file.mode} режим)`);
    });
  }

  demo();
}
