// Реальная демонстрация автогенерации якорей для нового файла
const fs = require('fs');
const path = require('path');

// Простая версия автогенератора для демонстрации
class SimpleAnchorGenerator {
  constructor() {
    this.patterns = [
      {
        // Классы
        pattern: /^(export\s+)?class\s+(\w+)/gm,
        template: (match, indent) => `${indent}// @ANCHOR:CLASS_{NAME}\n${indent}// КЛАСС {NAME}`,
        getName: match => match[2],
      },
      {
        // Функции (не методы)
        pattern: /^(\s*)(export\s+)?(?:async\s+)?function\s+(\w+)/gm,
        template: (match, indent) =>
          `${indent}// @ANCHOR:FUNCTION_{NAME}\n${indent}// ФУНКЦИЯ {NAME}`,
        getName: match => match[3],
      },
      {
        // Методы в классах (с отступом)
        pattern: /^(\s{4,})(async\s+)?(\w+)\s*\([^)]*\)\s*{/gm,
        template: (match, indent) => `${indent}// @ANCHOR:METHOD_{NAME}\n${indent}// МЕТОД {NAME}`,
        getName: match => match[3],
        condition: match => match[3] !== 'constructor', // Пропускаем конструкторы
      },
      {
        // Важные секции с комментариями
        pattern: /^(\s*)(\/\/\s*[=\-]{3,}.*[=\-]{3,})/gm,
        template: (match, indent) => `${indent}// @ANCHOR:SECTION_{NAME}`,
        getName: match => 'SECTION',
      },
    ];
  }

  addAnchorsToCode(content) {
    const lines = content.split('\n');
    const result = [];
    let insideClass = false;
    let classIndent = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineIndent = line.match(/^\s*/)[0];

      // Отслеживаем, находимся ли мы в классе
      if (/^(\s*)class\s+\w+/.test(line)) {
        insideClass = true;
        classIndent = lineIndent.length;
      } else if (insideClass && line.trim() === '}' && lineIndent.length <= classIndent) {
        insideClass = false;
      }

      let anchorAdded = false;

      // Проверяем каждый паттерн
      for (const pattern of this.patterns) {
        const regex = new RegExp(pattern.pattern.source, 'g');
        const match = regex.exec(line);

        if (match && this.shouldAddAnchor(line, lines, i)) {
          // Проверяем условие, если оно есть
          if (pattern.condition && !pattern.condition(match)) {
            continue;
          }

          const name = pattern.getName(match);
          const normalizedName = name.toUpperCase().replace(/[^A-Z0-9]/g, '_');

          let anchorText = pattern.template(match, lineIndent);
          anchorText = anchorText.replace(/{NAME}/g, normalizedName);

          result.push(anchorText);
          anchorAdded = true;
          break;
        }
      }

      result.push(line);
    }

    return result.join('\n');
  }

  shouldAddAnchor(line, allLines, lineIndex) {
    // Проверяем, нет ли уже якоря выше
    for (let i = Math.max(0, lineIndex - 3); i < lineIndex; i++) {
      if (/@ANCHOR:/i.test(allLines[i])) {
        return false;
      }
    }

    // Не добавляем якоря для простых строк
    if (line.trim().length < 10) {
      return false;
    }

    return true;
  }
}

// Обработка файла
function processFile(filePath) {
  console.log(`\n🔧 ОБРАБОТКА ФАЙЛА: ${path.basename(filePath)}`);
  console.log('═'.repeat(60));

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const generator = new SimpleAnchorGenerator();
    const processedContent = generator.addAnchorsToCode(content);

    // Считаем изменения
    const originalLines = content.split('\n');
    const processedLines = processedContent.split('\n');
    const addedLines = processedLines.length - originalLines.length;

    console.log(`📊 Статистика:`);
    console.log(`   Исходных строк: ${originalLines.length}`);
    console.log(`   Добавлено якорей: ${Math.floor(addedLines / 2)}`);
    console.log(`   Итого строк: ${processedLines.length}`);

    // Показываем примеры добавленных якорей
    console.log(`\n🔗 Примеры добавленных якорей:`);
    let anchorCount = 0;
    for (let i = 0; i < processedLines.length && anchorCount < 5; i++) {
      if (/@ANCHOR:/.test(processedLines[i])) {
        console.log(`   ${processedLines[i].trim()}`);
        if (i + 1 < processedLines.length) {
          console.log(`   ${processedLines[i + 1].trim()}`);
        }
        console.log('');
        anchorCount++;
      }
    }

    // Создаем файл с якорями для сравнения
    const newFileName = filePath.replace('.js', '_with_anchors.js');
    fs.writeFileSync(newFileName, processedContent, 'utf8');

    console.log(`✅ Файл с якорями создан: ${path.basename(newFileName)}`);

    return {
      original: originalLines.length,
      processed: processedLines.length,
      anchorsAdded: Math.floor(addedLines / 2),
      outputFile: newFileName,
    };
  } catch (error) {
    console.error(`❌ Ошибка обработки файла:`, error.message);
    return null;
  }
}

// Основная функция
function main() {
  console.log('🎯 АВТОГЕНЕРАЦИЯ ЯКОРЕЙ - РЕАЛЬНАЯ ДЕМОНСТРАЦИЯ');
  console.log('════════════════════════════════════════════════');

  const targetFile = './heys_gaming_system_v1.js';

  if (!fs.existsSync(targetFile)) {
    console.error(`❌ Файл не найден: ${targetFile}`);
    return;
  }

  const result = processFile(targetFile);

  if (result) {
    console.log('\n🎉 ДЕМОНСТРАЦИЯ ЗАВЕРШЕНА!');
    console.log(`   Добавлено ${result.anchorsAdded} якорных меток`);
    console.log(`   Размер увеличился с ${result.original} до ${result.processed} строк`);
    console.log(`\n💡 Теперь вы можете сравнить файлы:`);
    console.log(`   - Исходный: heys_gaming_system_v1.js`);
    console.log(`   - С якорями: ${path.basename(result.outputFile)}`);
  }
}

main();
