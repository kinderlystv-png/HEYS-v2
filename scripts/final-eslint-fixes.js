#!/usr/bin/env node
// Финальные исправления ESLint ошибок

const fs = require('fs');
const path = require('path');

const files = [
  'apps/web/src/components/lazy/LazyReports.tsx',
  'apps/web/src/components/lazy/LazySettings.tsx'
];

function finalFixes(filePath) {
  console.log(`🔧 Final fixes for ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Исправляем неиспользуемые параметры в деструктуризации
  content = content.replace(/\{ ([^}]*?)onError([^}]*?) \}/g, (match, before, after) => {
    const newBefore = before.replace(/,\s*$/, '');
    const newAfter = after.replace(/^\s*,/, '');
    return `{ ${newBefore}${newBefore && newAfter ? ', ' : ''}${newAfter} }`;
  });
  
  // Убираем лишние параметры
  content = content.replace(/onError[,\s]*_onError/g, '_onError');
  content = content.replace(/readonly[,\s]*_readonly/g, '_readonly');
  
  // Исправляем console в блоках if
  content = content.replace(
    /(if \(process\.env\.NODE_ENV === 'development'\) \{\s*)(console\.[^;]+;)/g,
    '$1// eslint-disable-next-line no-console\n      $2\n    }'
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Final fixes applied to ${filePath}`);
}

files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    finalFixes(fullPath);
  }
});

console.log('\n🎉 Final ESLint fixes completed!');
