// Простой тест автогенератора якорей
const testCode = `
class TestClass {
    constructor() {
        this.data = [];
    }
    
    async processData() {
        return this.data.map(item => item.value);
    }
    
    saveResults() {
        console.log('Saving...');
    }
}

function globalFunction() {
    return 'test';
}
`;

// Симуляция автогенератора (упрощенная версия)
function addAnchorsDemo(code) {
  const lines = code.split('\n');
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Добавляем якорь перед классом
    if (/^class\s+(\w+)/.test(line)) {
      const className = line.match(/^class\s+(\w+)/)[1];
      result.push(`// @ANCHOR:CLASS_${className.toUpperCase()}`);
      result.push(`// КЛАСС ${className}`);
    }

    // Добавляем якорь перед методами
    if (/^\s+(async\s+)?(\w+)\s*\(/.test(line)) {
      const methodName = line.match(/^\s+(?:async\s+)?(\w+)\s*\(/)[1];
      if (methodName !== 'constructor') {
        const indent = line.match(/^\s*/)[0];
        result.push(`${indent}// @ANCHOR:METHOD_${methodName.toUpperCase()}`);
        result.push(`${indent}// МЕТОД ${methodName}`);
      }
    }

    // Добавляем якорь перед функциями
    if (/^function\s+(\w+)/.test(line)) {
      const funcName = line.match(/^function\s+(\w+)/)[1];
      result.push(`// @ANCHOR:FUNCTION_${funcName.toUpperCase()}`);
      result.push(`// ФУНКЦИЯ ${funcName}`);
    }

    result.push(line);
  }

  return result.join('\n');
}

console.log('🔧 ДЕМОНСТРАЦИЯ АВТОГЕНЕРАЦИИ ЯКОРЕЙ');
console.log('═══════════════════════════════════════════════════════');
console.log('');
console.log('📝 ИСХОДНЫЙ КОД:');
console.log(testCode);
console.log('');
console.log('🔗 КОД С АВТОМАТИЧЕСКИ ДОБАВЛЕННЫМИ ЯКОРЯМИ:');
console.log(addAnchorsDemo(testCode));
console.log('');
console.log('✅ Якоры добавлены автоматически!');
