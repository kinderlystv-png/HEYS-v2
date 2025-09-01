// Обертка для автоматического добавления якорей при редактировании
class SmartFileEditor {
  constructor() {
    this.anchorGenerator = new SimpleAnchorGenerator();
    this.modifiedFiles = new Set();
  }

  // Умная замена с автоматическими якорями
  async smartReplaceInFile(filePath, oldString, newString, options = {}) {
    try {
      // 1. Выполняем обычную замену
      const result = await this.replaceStringInFile(filePath, oldString, newString);

      // 2. Проверяем, нужно ли добавить якоря
      if (this.shouldAddAnchors(filePath, options)) {
        console.log(`🔗 Автоматическое добавление якорей в ${filePath}...`);
        await this.addAnchorsToModifiedFile(filePath);
        this.modifiedFiles.add(filePath);
      }

      return result;
    } catch (error) {
      console.error('❌ Ошибка умного редактирования:', error);
      throw error;
    }
  }

  // Проверка, нужно ли добавлять якоря
  shouldAddAnchors(filePath, options) {
    // Только для JS/TS файлов
    if (!/\.(js|ts)$/.test(filePath)) return false;

    // Пропускаем временные файлы
    if (filePath.includes('temp') || filePath.includes('test')) return false;

    // Если файл уже обработан в этой сессии
    if (this.modifiedFiles.has(filePath) && !options.force) return false;

    return true;
  }

  // Добавление якорей в измененный файл
  async addAnchorsToModifiedFile(filePath) {
    const fs = require('fs');

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      // Только для файлов больше 100 строк
      if (lines.length < 100) return;

      // Проверяем, есть ли уже якоря
      const existingAnchors = lines.filter((line) => /@ANCHOR:/.test(line)).length;
      const anchorDensity = existingAnchors / lines.length;

      // Если якорей меньше 5% от строк - добавляем
      if (anchorDensity < 0.05) {
        const processedContent = this.anchorGenerator.addAnchorsToCode(content);
        fs.writeFileSync(filePath, processedContent, 'utf8');

        const newAnchors = processedContent
          .split('\n')
          .filter((line) => /@ANCHOR:/.test(line)).length;
        console.log(`✅ Добавлено ${newAnchors - existingAnchors} новых якорей`);
      }
    } catch (error) {
      console.error('❌ Ошибка добавления якорей:', error);
    }
  }

  // Обертка для создания файлов
  async smartCreateFile(filePath, content, options = {}) {
    try {
      // 1. Создаем файл
      const result = await this.createFile(filePath, content);

      // 2. Автоматически добавляем якоря, если файл большой
      if (content.split('\n').length > 100 && this.shouldAddAnchors(filePath, options)) {
        console.log(`🔗 Автоматическое добавление якорей в новый файл ${filePath}...`);
        await this.addAnchorsToModifiedFile(filePath);
      }

      return result;
    } catch (error) {
      console.error('❌ Ошибка умного создания файла:', error);
      throw error;
    }
  }

  // Пакетная обработка в конце сессии
  async processAllModifiedFiles() {
    console.log('🔄 Финальная обработка измененных файлов...');

    for (const filePath of this.modifiedFiles) {
      await this.addAnchorsToModifiedFile(filePath);
    }

    console.log(`✅ Обработано ${this.modifiedFiles.size} файлов`);
    this.modifiedFiles.clear();
  }
}

// Глобальный экземпляр для использования
const smartEditor = new SmartFileEditor();

// Экспорт для интеграции
module.exports = { SmartFileEditor, smartEditor };
