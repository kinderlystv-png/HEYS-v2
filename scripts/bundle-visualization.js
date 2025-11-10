#!/usr/bin/env node
/**
 * Bundle Visualization Script
 * Создаёт визуализацию bundle после сборки
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📊 Bundle Visualization Starting...\n');

const webDistPath = 'apps/web/dist';

// Проверяем наличие сборки
if (!fs.existsSync(webDistPath)) {
  console.log('❌ Build not found. Running build first...');
  try {
    execSync('pnpm --filter @heys/web run build', { stdio: 'inherit' });
  } catch (error) {
    console.error('❌ Build failed:', error.message);
    process.exit(1);
  }
}

console.log('🔍 Analyzing bundle structure...\n');

// Анализ файлов в dist
const files = [];

function scanDirectory(dir, prefix = '') {
  const items = fs.readdirSync(dir);

  items.forEach((item) => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath, path.join(prefix, item));
    } else {
      const sizeKB = (stat.size / 1024).toFixed(2);
      const relativePath = path.join(prefix, item);

      files.push({
        path: relativePath,
        size: parseFloat(sizeKB),
        type: path.extname(item).slice(1) || 'other',
      });
    }
  });
}

scanDirectory(webDistPath);

// Группировка по типам
const byType = files.reduce((acc, file) => {
  if (!acc[file.type]) acc[file.type] = [];
  acc[file.type].push(file);
  return acc;
}, {});

// Сортировка по размеру
Object.keys(byType).forEach((type) => {
  byType[type].sort((a, b) => b.size - a.size);
});

console.log('📋 BUNDLE ANALYSIS RESULTS:');
console.log('═'.repeat(60));

Object.entries(byType).forEach(([type, typeFiles]) => {
  const totalSize = typeFiles.reduce((sum, file) => sum + file.size, 0);
  console.log(`\n📦 ${type.toUpperCase()} FILES (${totalSize.toFixed(2)}KB total):`);

  typeFiles.slice(0, 10).forEach((file) => {
    const indicator = file.size > 100 ? '🔴' : file.size > 50 ? '🟡' : '🟢';
    console.log(`  ${indicator} ${file.path.padEnd(40)} ${file.size.toFixed(2)}KB`);
  });

  if (typeFiles.length > 10) {
    console.log(`  ... и ещё ${typeFiles.length - 10} файлов`);
  }
});

// Топ 10 самых больших файлов
console.log('\n🎯 TOP 10 LARGEST FILES:');
console.log('─'.repeat(60));
const largestFiles = files.sort((a, b) => b.size - a.size).slice(0, 10);

largestFiles.forEach((file, i) => {
  const indicator = file.size > 200 ? '🔴' : file.size > 100 ? '🟡' : '🟢';
  console.log(
    `${(i + 1).toString().padStart(2)}. ${indicator} ${file.path.padEnd(35)} ${file.size.toFixed(2)}KB`,
  );
});

// Общая статистика
const totalSize = files.reduce((sum, file) => sum + file.size, 0);
const jsSize = (byType.js || []).reduce((sum, file) => sum + file.size, 0);
const cssSize = (byType.css || []).reduce((sum, file) => sum + file.size, 0);
const htmlSize = (byType.html || []).reduce((sum, file) => sum + file.size, 0);

console.log('\n📊 SUMMARY:');
console.log('─'.repeat(60));
console.log(`📦 Total bundle size:    ${totalSize.toFixed(2)}KB`);
console.log(
  `🟨 JavaScript:           ${jsSize.toFixed(2)}KB (${((jsSize / totalSize) * 100).toFixed(1)}%)`,
);
console.log(
  `🟦 CSS:                  ${cssSize.toFixed(2)}KB (${((cssSize / totalSize) * 100).toFixed(1)}%)`,
);
console.log(
  `🟩 HTML:                 ${htmlSize.toFixed(2)}KB (${((htmlSize / totalSize) * 100).toFixed(1)}%)`,
);
console.log(`📂 Total files:          ${files.length}`);

// Рекомендации
console.log('\n💡 OPTIMIZATION RECOMMENDATIONS:');
console.log('─'.repeat(60));

const recommendations = [];

if (jsSize > 500) {
  recommendations.push('JavaScript bundle >500KB - implement code splitting');
}

if (cssSize > 100) {
  recommendations.push('CSS bundle >100KB - consider critical CSS extraction');
}

const largeJsFiles = (byType.js || []).filter((f) => f.size > 100);
if (largeJsFiles.length > 0) {
  recommendations.push(`${largeJsFiles.length} large JS files - review for optimization`);
}

if (files.length > 50) {
  recommendations.push('Many small files - consider bundling optimization');
}

if (recommendations.length === 0) {
  console.log('✅ Bundle size looks good! No major issues found.');
} else {
  recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
}

// Сохранение результатов
const results = {
  timestamp: new Date().toISOString(),
  summary: {
    totalSizeKB: totalSize,
    totalFiles: files.length,
    jsSizeKB: jsSize,
    cssSizeKB: cssSize,
    htmlSizeKB: htmlSize,
  },
  files: files,
  byType: byType,
  recommendations: recommendations,
};

fs.writeFileSync('docs/bundle-visualization.json', JSON.stringify(results, null, 2));
console.log('\n💾 Results saved to: docs/bundle-visualization.json');

console.log('\n✅ Bundle visualization completed!');
