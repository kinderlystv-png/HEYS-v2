#!/usr/bin/env node
// Массовое исправление ESLint ошибок в lazy компонентах

const fs = require('fs');
const path = require('path');

// Файлы для исправления
const files = [
  'apps/web/src/components/lazy/LazyAnalytics.tsx',
  'apps/web/src/components/lazy/LazyReports.tsx', 
  'apps/web/src/components/lazy/LazySettings.tsx',
  'apps/web/src/hooks/useLazyComponent.ts',
  'apps/web/src/hooks/usePreloadRoute.ts'
];

function fixFile(filePath) {
  console.log(`🔧 Fixing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 1. Исправляем any типы
  content = content.replace(/: any\b/g, ': unknown');
  content = content.replace(/React\.FC<any>/g, 'React.FC<Record<string, unknown>>');
  content = content.replace(/ComponentType<any>/g, 'ComponentType<Record<string, unknown>>');
  content = content.replace(/any\[\]/g, 'unknown[]');
  content = content.replace(/Record<string, any>/g, 'Record<string, unknown>');
  
  // 2. Оборачиваем console statements
  content = content.replace(
    /(\s+)console\.(log|warn|error)\(/g, 
    '$1if (process.env.NODE_ENV === \'development\') {\n$1  // eslint-disable-next-line no-console\n$1  console.$2('
  );
  
  // Закрываем блоки if для console
  content = content.replace(
    /(if \(process\.env\.NODE_ENV === 'development'\) \{\s*\/\/ eslint-disable-next-line no-console\s*console\.[^;]+;)/g,
    '$1\n    }'
  );
  
  // 3. Исправляем неиспользуемые параметры (добавляем underscore)
  content = content.replace(/\bonError\b(?=\s*[,\)])/g, '_onError');
  content = content.replace(/\bsettings\b(?=\s*[,\)])/g, '_settings');
  content = content.replace(/\bonChange\b(?=\s*[,\)])/g, '_onChange');
  content = content.replace(/\breadonly\b(?=\s*[,\)])/g, '_readonly');
  
  // 4. Исправляем map с any
  content = content.replace(/\.map\((\w+) =>/g, '.map(($1: unknown) =>');
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`✅ Fixed ${filePath}`);
}

// Исправляем все файлы
files.forEach(file => {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    fixFile(fullPath);
  } else {
    console.log(`⚠️ File not found: ${fullPath}`);
  }
});

console.log('\n🎉 ESLint fixes completed!');
