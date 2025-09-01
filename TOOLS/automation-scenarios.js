// Примеры того, как я буду использовать автоматизацию в реальной работе

// ═══════════════════════════════════════════════════════════════════════════════
// СЦЕНАРИЙ 1: Редактирование существующего файла
// ═══════════════════════════════════════════════════════════════════════════════

async function editExistingFile() {
  console.log('🛠️ СЦЕНАРИЙ: Редактирование heys_core_v12.js');

  // 1. Обычное редактирование (как сейчас)
  await replace_string_in_file('c:/! HEYS 2/heys_core_v12.js', 'старый код...', 'новый код...');

  // 2. НОВОЕ: Автоматическое добавление якорей
  console.log('🔗 Автоматически добавляю якоря...');
  await run_in_terminal('node TOOLS/real-anchor-demo.js heys_core_v12.js');

  console.log('✅ Файл отредактирован И якоря обновлены!');
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЦЕНАРИЙ 2: Создание нового файла
// ═══════════════════════════════════════════════════════════════════════════════

async function createNewFile() {
  console.log('🆕 СЦЕНАРИЙ: Создание нового модуля');

  const newModuleCode = `
class HEYSNewFeature {
    constructor() {
        this.initialized = false;
    }
    
    async initialize() {
        // новая функциональность
    }
    
    async processData() {
        // обработка данных
    }
}
export default HEYSNewFeature;
    `;

  // 1. Создаем файл
  await create_file('c:/! HEYS 2/heys_new_feature_v1.js', newModuleCode);

  // 2. НОВОЕ: Сразу добавляем якоря
  if (newModuleCode.length > 500) {
    // Если файл достаточно большой
    console.log('🔗 Автоматически добавляю якоря в новый файл...');
    await run_in_terminal('node TOOLS/real-anchor-demo.js heys_new_feature_v1.js');
  }

  console.log('✅ Новый файл создан С якорями!');
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЦЕНАРИЙ 3: Пакетная обработка в конце задачи
// ═══════════════════════════════════════════════════════════════════════════════

async function finishTaskWithAnchors() {
  console.log('🎯 СЦЕНАРИЙ: Завершение задачи с обновлением якорей');

  // В процессе решения задачи я изменил несколько файлов:
  const modifiedFiles = ['heys_core_v12.js', 'heys_reports_v12.js', 'heys_user_v12.js'];

  // В конце задачи автоматически обновляю все якоря:
  console.log('🔄 Обновляю якоря во всех измененных файлах...');

  for (const file of modifiedFiles) {
    console.log(`  🔗 Обрабатываю ${file}...`);
    await run_in_terminal(`node TOOLS/real-anchor-demo.js ${file}`);
  }

  console.log('✅ Все файлы обновлены с актуальными якорями!');
}

// ═══════════════════════════════════════════════════════════════════════════════
// СЦЕНАРИЙ 4: Умная функция-обертка
// ═══════════════════════════════════════════════════════════════════════════════

async function smartEdit(filePath, oldString, newString) {
  console.log(`🧠 УМНОЕ РЕДАКТИРОВАНИЕ: ${filePath}`);

  try {
    // 1. Обычная замена
    await replace_string_in_file(filePath, oldString, newString);

    // 2. Проверяем размер файла
    const content = await read_file(filePath, 1, 1000);
    const lines = content.split('\n');

    // 3. Если файл большой - автоматически добавляем якоря
    if (lines.length > 200) {
      console.log('  📏 Файл большой, добавляю якоря...');
      await run_in_terminal(`cd "c:\\! HEYS 2"; node TOOLS/real-anchor-demo.js ${filePath}`);
      console.log('  ✅ Якоря обновлены автоматически!');
    } else {
      console.log('  ⏩ Файл маленький, якоря не нужны');
    }
  } catch (error) {
    console.error('❌ Ошибка умного редактирования:', error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ПРИМЕР РЕАЛЬНОГО ИСПОЛЬЗОВАНИЯ
// ═══════════════════════════════════════════════════════════════════════════════

async function realWorldExample() {
  console.log('🌍 РЕАЛЬНЫЙ ПРИМЕР: Пользователь просит добавить новую функцию');

  // Пользователь: "Добавь функцию экспорта данных в heys_reports_v12.js"

  // 1. Я добавляю новую функцию
  await smartEdit(
    'c:/! HEYS 2/heys_reports_v12.js',
    '    // Конец класса HEYSReports',
    `    
    // Новая функция экспорта
    async exportData(format = 'json') {
        try {
            const data = await this.getAllReports();
            
            switch(format) {
                case 'json':
                    return JSON.stringify(data, null, 2);
                case 'csv':
                    return this.convertToCSV(data);
                default:
                    throw new Error('Неподдерживаемый формат');
            }
        } catch (error) {
            console.error('Ошибка экспорта:', error);
            throw error;
        }
    }
    
    convertToCSV(data) {
        // конвертация в CSV
        return 'csv data...';
    }
    
    // Конец класса HEYSReports`,
  );

  // 2. Якоря автоматически добавятся к новым методам:
  //    // @ANCHOR:METHOD_EXPORTDATA
  //    // МЕТОД EXPORTDATA
  //    async exportData(format = 'json') {

  console.log('🎉 Готово! Функция добавлена + якоря обновлены автоматически');
}

// Экспорт для использования
module.exports = {
  editExistingFile,
  createNewFile,
  finishTaskWithAnchors,
  smartEdit,
  realWorldExample,
};
