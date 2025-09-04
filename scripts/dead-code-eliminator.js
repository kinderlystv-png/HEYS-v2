#!/usr/bin/env node
// filepath: scripts/dead-code-eliminator.js
/**
 * Dead Code Eliminator
 * Находит и удаляет неиспользуемый код
 * Performance Sprint Day 2 - Component 3
 */

const fs = require('fs');
const path = require('path');

console.log('🗑️  Dead Code Elimination Starting...\n');

const results = {
  timestamp: new Date().toISOString(),
  analysis: {
    unusedExports: [],
    unusedImports: [],
    deadFunctions: [],
    unusedVariables: [],
    emptyFiles: []
  },
  eliminated: [],
  bundleImpact: {},
  recommendations: []
};

/**
 * Поиск неиспользуемых экспортов
 */
function findUnusedExports() {
  console.log('🔍 Scanning for unused exports...\n');
  
  const sourceDirectories = [
    'packages/core/src',
    'packages/ui/src', 
    'packages/shared/src',
    'packages/analytics/src',
    'packages/search/src'
  ];
  
  const allExports = new Map(); // { exportName -> { file, line, type } }
  const allImports = new Set();  // используемые импорты
  
  // Сканируем все экспорты
  sourceDirectories.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    scanForExports(dir, allExports);
  });
  
  // Сканируем все импорты (включая apps/web)
  sourceDirectories.concat(['apps/web/src']).forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    scanForImports(dir, allImports);
  });
  
  // Находим неиспользуемые экспорты
  const unusedExports = [];
  allExports.forEach((exportInfo, exportName) => {
    if (!allImports.has(exportName)) {
      unusedExports.push({
        name: exportName,
        file: exportInfo.file,
        line: exportInfo.line,
        type: exportInfo.type
      });
    }
  });
  
  results.analysis.unusedExports = unusedExports;
  
  console.log(`📊 Export Analysis Results:`);
  console.log(`  📤 Total exports found: ${allExports.size}`);
  console.log(`  📥 Total imports found: ${allImports.size}`);
  console.log(`  🗑️  Unused exports: ${unusedExports.length}\n`);
  
  if (unusedExports.length > 0) {
    console.log('🔴 Unused exports found:');
    unusedExports.slice(0, 10).forEach(exp => {
      console.log(`  - ${exp.name} (${exp.type}) in ${exp.file}:${exp.line}`);
    });
    if (unusedExports.length > 10) {
      console.log(`  ... and ${unusedExports.length - 10} more\n`);
    }
  }
  
  return unusedExports;
}

/**
 * Сканирование экспортов в директории
 */
function scanForExports(dir, allExports) {
  const files = getTypeScriptFiles(dir);
  
  files.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, lineNumber) => {
        const trimmed = line.trim();
        
        // export function/class/const/interface
        const exportMatch = trimmed.match(/^export\s+(function|class|const|interface|type|enum)\s+(\w+)/);
        if (exportMatch) {
          const [, type, name] = exportMatch;
          allExports.set(name, {
            file: filePath,
            line: lineNumber + 1,
            type: type
          });
        }
        
        // export { name }
        const namedExportMatch = trimmed.match(/^export\s*{\s*([^}]+)\s*}/);
        if (namedExportMatch) {
          const exports = namedExportMatch[1]
            .split(',')
            .map(s => s.trim().split(' as ')[0])
            .filter(s => s);
            
          exports.forEach(name => {
            allExports.set(name, {
              file: filePath,
              line: lineNumber + 1,
              type: 'named'
            });
          });
        }
      });
      
    } catch (error) {
      console.log(`⚠️  Error reading ${filePath}:`, error.message);
    }
  });
}

/**
 * Сканирование импортов в директории
 */
function scanForImports(dir, allImports) {
  const files = getTypeScriptFiles(dir);
  
  files.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach(line => {
        const trimmed = line.trim();
        
        // import { name } from 'module'
        const namedImportMatch = trimmed.match(/import\s*{\s*([^}]+)\s*}\s*from/);
        if (namedImportMatch) {
          const imports = namedImportMatch[1]
            .split(',')
            .map(s => s.trim().split(' as ')[0])
            .filter(s => s);
            
          imports.forEach(name => allImports.add(name));
        }
        
        // import name from 'module'
        const defaultImportMatch = trimmed.match(/import\s+(\w+)\s+from/);
        if (defaultImportMatch) {
          allImports.add(defaultImportMatch[1]);
        }
      });
      
    } catch (error) {
      console.log(`⚠️  Error reading ${filePath}:`, error.message);
    }
  });
}

/**
 * Поиск пустых файлов
 */
function findEmptyFiles() {
  console.log('📄 Scanning for empty or minimal files...\n');
  
  const sourceDirectories = [
    'packages/core/src',
    'packages/ui/src',
    'packages/shared/src',
    'packages/analytics/src',
    'packages/search/src'
  ];
  
  const emptyFiles = [];
  
  sourceDirectories.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    const files = getTypeScriptFiles(dir);
    
    files.forEach(filePath => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const meaningful = content
          .replace(/\/\*[\s\S]*?\*\//g, '') // удаляем блок комментарии
          .replace(/\/\/.*$/gm, '')         // удаляем строчные комментарии
          .replace(/\s+/g, ' ')            // схлопываем пробелы
          .trim();
        
        if (meaningful.length < 50) { // менее 50 символов значащего кода
          emptyFiles.push({
            file: filePath,
            size: meaningful.length,
            content: meaningful
          });
        }
        
      } catch (error) {
        console.log(`⚠️  Error reading ${filePath}:`, error.message);
      }
    });
  });
  
  results.analysis.emptyFiles = emptyFiles;
  
  console.log(`📊 Empty Files Analysis:`);
  console.log(`  📄 Empty/minimal files found: ${emptyFiles.length}\n`);
  
  if (emptyFiles.length > 0) {
    console.log('🗑️  Empty/minimal files:');
    emptyFiles.forEach(file => {
      console.log(`  - ${file.file} (${file.size} chars): "${file.content}"`);
    });
    console.log();
  }
  
  return emptyFiles;
}

/**
 * Анализ неиспользуемых типов TypeScript
 */
function findUnusedTypes() {
  console.log('🔍 Scanning for unused TypeScript types...\n');
  
  const sourceDirectories = [
    'packages/core/src',
    'packages/ui/src',
    'packages/shared/src'
  ];
  
  const typeDefinitions = new Map();
  const typeUsages = new Set();
  
  // Сканируем определения типов
  sourceDirectories.forEach(dir => {
    if (!fs.existsSync(dir)) return;
    
    const files = getTypeScriptFiles(dir);
    
    files.forEach(filePath => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, lineNumber) => {
          const trimmed = line.trim();
          
          // interface/type definitions
          const typeMatch = trimmed.match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/);
          if (typeMatch) {
            typeDefinitions.set(typeMatch[1], {
              file: filePath,
              line: lineNumber + 1,
              type: trimmed.includes('interface') ? 'interface' : 'type'
            });
          }
        });
        
        // Ищем использования типов
        const typeUsageMatches = content.match(/:\s*(\w+)/g);
        if (typeUsageMatches) {
          typeUsageMatches.forEach(match => {
            const typeName = match.replace(':', '').trim();
            typeUsages.add(typeName);
          });
        }
        
      } catch (error) {
        console.log(`⚠️  Error reading ${filePath}:`, error.message);
      }
    });
  });
  
  // Находим неиспользуемые типы
  const unusedTypes = [];
  typeDefinitions.forEach((typeInfo, typeName) => {
    if (!typeUsages.has(typeName)) {
      unusedTypes.push({
        name: typeName,
        file: typeInfo.file,
        line: typeInfo.line,
        type: typeInfo.type
      });
    }
  });
  
  console.log(`📊 Type Analysis Results:`);
  console.log(`  🏷️  Types defined: ${typeDefinitions.size}`);
  console.log(`  🔗 Types used: ${typeUsages.size}`);
  console.log(`  🗑️  Unused types: ${unusedTypes.length}\n`);
  
  return unusedTypes;
}

/**
 * Получение TypeScript файлов в директории
 */
function getTypeScriptFiles(dir) {
  const files = [];
  
  function scanDir(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    items.forEach(item => {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        scanDir(fullPath);
      } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx'))) {
        files.push(fullPath);
      }
    });
  }
  
  scanDir(dir);
  return files;
}

/**
 * Генерация рекомендаций по очистке
 */
function generateCleanupRecommendations(unusedExports, emptyFiles, unusedTypes) {
  console.log('💡 Generating cleanup recommendations...\n');
  
  const recommendations = [];
  
  if (unusedExports.length > 0) {
    recommendations.push(`Remove ${unusedExports.length} unused exports`);
    recommendations.push('Review exported API surface for over-exposure');
  }
  
  if (emptyFiles.length > 0) {
    recommendations.push(`Remove or consolidate ${emptyFiles.length} empty/minimal files`);
  }
  
  if (unusedTypes.length > 0) {
    recommendations.push(`Remove ${unusedTypes.length} unused TypeScript types`);
  }
  
  recommendations.push('Enable TypeScript strict mode for better tree shaking');
  recommendations.push('Use ES modules consistently across the codebase');
  recommendations.push('Add "sideEffects": false to package.json files');
  
  results.recommendations = recommendations;
  return recommendations;
}

/**
 * Главная функция
 */
async function main() {
  console.log('🎯 Performance Sprint Day 2 - Dead Code Elimination\n');
  
  // 1. Поиск неиспользуемых экспортов
  const unusedExports = findUnusedExports();
  
  // 2. Поиск пустых файлов
  const emptyFiles = findEmptyFiles();
  
  // 3. Поиск неиспользуемых типов
  const unusedTypes = findUnusedTypes();
  
  // 4. Генерация рекомендаций
  const recommendations = generateCleanupRecommendations(unusedExports, emptyFiles, unusedTypes);
  
  // 5. Сохранение результатов
  fs.writeFileSync('docs/dead-code-analysis.json', JSON.stringify(results, null, 2));
  
  console.log('📋 DEAD CODE ELIMINATION SUMMARY:');
  console.log('═'.repeat(60));
  console.log(`🗑️  Unused exports: ${unusedExports.length}`);
  console.log(`📄 Empty files: ${emptyFiles.length}`);
  console.log(`🏷️  Unused types: ${unusedTypes.length}`);
  console.log(`💡 Recommendations: ${recommendations.length}`);
  
  const potentialSavings = (unusedExports.length * 0.5) + (emptyFiles.length * 0.1);
  console.log(`💾 Potential bundle savings: ~${potentialSavings.toFixed(1)}KB`);
  
  console.log('\n🎯 TOP CLEANUP ACTIONS:');
  recommendations.slice(0, 5).forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
  
  console.log(`\n💾 Results saved to: docs/dead-code-analysis.json`);
  console.log('\n✅ Dead code analysis completed!');
}

// Запуск
main().catch(error => {
  console.error('❌ Error during dead code elimination:', error);
  process.exit(1);
});
