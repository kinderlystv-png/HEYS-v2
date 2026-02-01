#!/usr/bin/env node
/**
 * Аудит расхождений между личной базой продуктов и shared_products
 */

const fs = require('fs');
const path = require('path');

// Загружаем shared_products
const sharedPath = path.join(__dirname, '../heys_shared_products_export.json');
const sharedData = JSON.parse(fs.readFileSync(sharedPath, 'utf-8'));
const sharedProducts = sharedData.products;

// Загружаем личную базу клиента
const clientPath = '/tmp/client_products.json';
const clientProducts = JSON.parse(fs.readFileSync(clientPath, 'utf-8'));

console.log('=== АУДИТ ПРОДУКТОВ ===\n');
console.log('Shared products: ' + sharedProducts.length);
console.log('Client products: ' + clientProducts.length + '\n');

// Создаём индексы по имени (нормализованное)
function normalizeName(name) {
  return (name || '').toLowerCase().trim();
}

const sharedByName = new Map();
sharedProducts.forEach(p => {
  sharedByName.set(normalizeName(p.name), p);
});

const clientByName = new Map();
clientProducts.forEach(p => {
  clientByName.set(normalizeName(p.name), p);
});

// Поля для сравнения (camelCase для client, snake_case для shared)
const fieldMappings = [
  ['simple100', 'simple100'],
  ['complex100', 'complex100'],
  ['protein100', 'protein100'],
  ['badFat100', 'badfat100'],
  ['goodFat100', 'goodfat100'],
  ['trans100', 'trans100'],
  ['fiber100', 'fiber100'],
  ['gi', 'gi'],
  ['harm', 'harm'],
  ['novaGroup', 'nova_group'],
  ['sodium100', 'sodium100'],
];

const vitaminMappings = [
  ['vitaminA', 'vitamin_a'],
  ['vitaminC', 'vitamin_c'],
  ['vitaminD', 'vitamin_d'],
  ['vitaminE', 'vitamin_e'],
  ['vitaminB1', 'vitamin_b1'],
  ['vitaminB2', 'vitamin_b2'],
  ['vitaminB3', 'vitamin_b3'],
  ['vitaminB6', 'vitamin_b6'],
  ['vitaminB9', 'vitamin_b9'],
  ['vitaminB12', 'vitamin_b12'],
  ['calcium', 'calcium'],
  ['iron', 'iron'],
  ['magnesium', 'magnesium'],
  ['phosphorus', 'phosphorus'],
  ['potassium', 'potassium'],
  ['zinc', 'zinc'],
  ['selenium', 'selenium'],
  ['iodine', 'iodine'],
];

// Результаты аудита
const results = {
  onlyInClient: [],
  onlyInShared: [],
  paramDiff: [],
  clientHasVitamins: [],
  sharedHasVitamins: [],
  harmDiff: [],
};

// 1. Продукты только в личной базе
for (const [name, clientP] of clientByName) {
  if (!sharedByName.has(name)) {
    results.onlyInClient.push({
      name: clientP.name,
      id: clientP.id
    });
  }
}

// 2. Продукты только в shared
for (const [name, sharedP] of sharedByName) {
  if (!clientByName.has(name)) {
    results.onlyInShared.push({
      name: sharedP.name,
      id: sharedP.id
    });
  }
}

// 3. Сравниваем параметры общих продуктов
for (const [name, clientP] of clientByName) {
  const sharedP = sharedByName.get(name);
  if (!sharedP) continue;

  const diffs = [];

  // Сравниваем основные поля
  for (const [clientField, sharedField] of fieldMappings) {
    const cv = parseFloat(clientP[clientField]) || 0;
    const sv = parseFloat(sharedP[sharedField]) || 0;

    if (Math.abs(cv - sv) > 0.1) {
      diffs.push({
        field: clientField,
        client: cv,
        shared: sv,
        delta: cv - sv
      });
    }
  }

  if (diffs.length > 0) {
    results.paramDiff.push({
      name: clientP.name,
      diffs
    });
  }

  // Проверяем витамины
  const clientVits = vitaminMappings.filter(([cf, sf]) => (parseFloat(clientP[cf]) || 0) > 0);
  const sharedVits = vitaminMappings.filter(([cf, sf]) => (parseFloat(sharedP[sf]) || 0) > 0);

  if (clientVits.length > 0 && sharedVits.length === 0) {
    results.clientHasVitamins.push({
      name: clientP.name,
      vitamins: clientVits.map(([cf]) => cf + '=' + clientP[cf])
    });
  }

  if (sharedVits.length > 0 && clientVits.length === 0) {
    results.sharedHasVitamins.push({
      name: sharedP.name,
      vitamins: sharedVits.map(([cf, sf]) => sf + '=' + sharedP[sf])
    });
  }

  // Проверяем harm отдельно
  const clientHarm = parseFloat(clientP.harm) || 0;
  const sharedHarm = parseFloat(sharedP.harm) || 0;
  if (Math.abs(clientHarm - sharedHarm) > 0.5) {
    results.harmDiff.push({
      name: clientP.name,
      clientHarm,
      sharedHarm,
      delta: clientHarm - sharedHarm
    });
  }
}

// Выводим результаты
console.log('=== ТОЛЬКО В ЛИЧНОЙ БАЗЕ (' + results.onlyInClient.length + ') ===');
results.onlyInClient.slice(0, 30).forEach(p => {
  console.log('  - ' + p.name);
});
if (results.onlyInClient.length > 30) {
  console.log('  ... и ещё ' + (results.onlyInClient.length - 30));
}

console.log('\n=== ТОЛЬКО В SHARED (' + results.onlyInShared.length + ') ===');
results.onlyInShared.slice(0, 30).forEach(p => {
  console.log('  - ' + p.name);
});
if (results.onlyInShared.length > 30) {
  console.log('  ... и ещё ' + (results.onlyInShared.length - 30));
}

console.log('\n=== ВИТАМИНЫ ЕСТЬ В ЛИЧНОЙ, НЕТ В SHARED (' + results.clientHasVitamins.length + ') ===');
results.clientHasVitamins.forEach(p => {
  console.log('  - ' + p.name + ': ' + p.vitamins.join(', '));
});

console.log('\n=== ВИТАМИНЫ ЕСТЬ В SHARED, НЕТ В ЛИЧНОЙ (' + results.sharedHasVitamins.length + ') ===');
results.sharedHasVitamins.forEach(p => {
  console.log('  - ' + p.name + ': ' + p.vitamins.join(', '));
});

console.log('\n=== РАЗЛИЧИЯ В HARM >0.5 (' + results.harmDiff.length + ') ===');
results.harmDiff.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
results.harmDiff.slice(0, 30).forEach(p => {
  const sign = p.delta > 0 ? '+' : '';
  console.log('  - ' + p.name + ': client=' + p.clientHarm + ', shared=' + p.sharedHarm + ' (' + sign + p.delta.toFixed(1) + ')');
});
if (results.harmDiff.length > 30) {
  console.log('  ... и ещё ' + (results.harmDiff.length - 30));
}

console.log('\n=== ЛЮБЫЕ РАЗЛИЧИЯ В ПАРАМЕТРАХ (' + results.paramDiff.length + ') ===');
results.paramDiff.sort((a, b) => b.diffs.length - a.diffs.length);
results.paramDiff.slice(0, 25).forEach(p => {
  console.log('  - ' + p.name + ' (' + p.diffs.length + ' различий):');
  p.diffs.slice(0, 5).forEach(d => {
    console.log('      ' + d.field + ': ' + d.client + ' vs ' + d.shared);
  });
});

// Сохраняем полный отчёт
const reportPath = path.join(__dirname, '../reports/products-audit-' + new Date().toISOString().split('T')[0] + '.json');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
console.log('\n\nПолный отчёт: ' + reportPath);
