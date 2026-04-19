#!/usr/bin/env node
// filepath: scripts/bundle-splitting-optimizer.js
/**
 * Bundle Splitting Optimizer
 * Оптимизирует разделение bundle на chunks
 * Performance Sprint Day 2 - Component 4 (Final)
 */

const fs = require('fs');
const path = require('path');

console.log('📦 Bundle Splitting Optimization Starting...\n');

const results = {
  timestamp: new Date().toISOString(),
  currentChunks: {},
  optimizedChunks: {},
  chunkSizeAnalysis: {},
  recommendations: [],
  viteConfigUpdates: [],
};

/**
 * Анализ текущих chunks
 */
function analyzeCurrentChunks() {
  console.log('🔍 Analyzing current chunk configuration...\n');

  const viteConfigPath = 'apps/web/vite.config.ts';

  if (!fs.existsSync(viteConfigPath)) {
    console.log('❌ Vite config not found');
    return {};
  }

  try {
    const content = fs.readFileSync(viteConfigPath, 'utf8');

    // Извлекаем текущую конфигурацию manualChunks
    const manualChunksMatch = content.match(/manualChunks:\s*{([^}]+)}/s);

    if (manualChunksMatch) {
      console.log('📊 Current manual chunks configuration found:');
      const chunksConfig = manualChunksMatch[1];
      const chunks = {};

      // Парсим chunks
      const chunkLines = chunksConfig
        .split(',')
        .map((line) => line.trim())
        .filter((line) => line);
      chunkLines.forEach((line) => {
        const match = line.match(/(\w+):\s*\[([^\]]+)\]/);
        if (match) {
          const [, chunkName, deps] = match;
          const dependencies = deps.split(',').map((s) => s.trim().replace(/['"]/g, ''));
          chunks[chunkName] = dependencies;
          console.log(`  📦 ${chunkName}: [${dependencies.join(', ')}]`);
        }
      });

      results.currentChunks = chunks;
      console.log();
      return chunks;
    } else {
      console.log('⚠️  No manual chunks configuration found\n');
      return {};
    }
  } catch (error) {
    console.log(`❌ Error reading Vite config:`, error.message);
    return {};
  }
}

/**
 * Анализ размеров текущих chunks
 */
function analyzeChunkSizes() {
  console.log('📊 Analyzing current chunk sizes...\n');

  const distPath = 'apps/web/dist';
  if (!fs.existsSync(distPath)) {
    console.log('⚠️  Dist folder not found. Run build first.\n');
    return {};
  }

  const chunkInfo = {};

  // Сканируем JS файлы в dist
  const files = fs.readdirSync(path.join(distPath, 'assets')).filter((f) => f.endsWith('.js'));

  files.forEach((file) => {
    try {
      const filePath = path.join(distPath, 'assets', file);
      const stat = fs.statSync(filePath);
      const sizeKB = (stat.size / 1024).toFixed(2);

      // Определяем тип chunk по имени файла
      let chunkType = 'other';
      if (file.includes('react')) chunkType = 'react';
      else if (file.includes('vendor')) chunkType = 'vendor';
      else if (file.includes('core')) chunkType = 'core';
      else if (file.includes('features')) chunkType = 'features';
      else if (file.includes('heys_')) chunkType = 'legacy';

      chunkInfo[file] = {
        size: parseFloat(sizeKB),
        type: chunkType,
      };

      console.log(`  📦 ${file}: ${sizeKB}KB (${chunkType})`);
    } catch (error) {
      console.log(`⚠️  Error reading ${file}:`, error.message);
    }
  });

  results.chunkSizeAnalysis = chunkInfo;

  const totalSize = Object.values(chunkInfo).reduce((sum, chunk) => sum + chunk.size, 0);
  console.log(`\n📊 Total JS chunks size: ${totalSize.toFixed(2)}KB\n`);

  return chunkInfo;
}

/**
 * Генерация оптимизированной конфигурации chunks
 */
function generateOptimizedChunks() {
  console.log('⚙️  Generating optimized chunk configuration...\n');

  const optimizedConfig = {
    // Vendor libraries (stable, rarely changing)
    vendor: ['react', 'react-dom', 'react/jsx-runtime'],

    // UI libraries and components
    ui: ['@heys/ui', '@heys/shared'],

    // Core business logic
    core: ['@heys/core'],

    // Feature modules (can be lazy loaded)
    analytics: ['@heys/analytics'],

    search: ['@heys/search'],

    gaming: ['@heys/gaming'],

    // Storage and data persistence
    storage: ['@heys/storage'],

    // Utilities and helpers
    utils: ['zod', 'date-fns'],
  };

  results.optimizedChunks = optimizedConfig;

  console.log('🎯 Optimized chunk configuration:');
  Object.entries(optimizedConfig).forEach(([chunkName, deps]) => {
    console.log(`  📦 ${chunkName}: [${deps.join(', ')}]`);
  });
  console.log();

  return optimizedConfig;
}

/**
 * Создание улучшенной Vite конфигурации
 */
function generateViteConfigUpdate(optimizedChunks) {
  console.log('📝 Generating Vite config updates...\n');

  const configUpdate = `
// Enhanced Bundle Splitting Configuration - Performance Sprint Day 2
rollupOptions: {
  output: {
    manualChunks: {
      // Vendor libraries (stable, cached separately)
      vendor: ['react', 'react-dom', 'react/jsx-runtime'],
      
      // UI and shared components
      ui: ['@heys/ui', '@heys/shared'],
      
      // Core business logic
      core: ['@heys/core'],
      
      // Feature modules (lazy loadable)
      analytics: ['@heys/analytics'],
      search: ['@heys/search'],
      gaming: ['@heys/gaming'],
      
      // Storage and data
      storage: ['@heys/storage'],
      
      // Utilities
      utils: ['zod', 'date-fns']
    },
    
    // Optimize chunk file names
    entryFileNames: 'assets/[name]-[hash].js',
    chunkFileNames: (chunkInfo) => {
      const facadeModuleId = chunkInfo.facadeModuleId 
        ? chunkInfo.facadeModuleId.split('/').pop() 
        : 'chunk';
      return \`assets/\${facadeModuleId}-[hash].js\`;
    },
    assetFileNames: 'assets/[name]-[hash].[ext]',
    
    // Размер chunk limits
    maxParallelFileOps: 5,
  },
  
  // Advanced Tree shaking
  treeshake: {
    preset: 'recommended',
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    tryCatchDeoptimization: false,
    unknownGlobalSideEffects: false,
    annotations: true,
    correctVarValueBeforeDeclaration: false,
  },
  
  // External dependencies (don't bundle these)
  external: (id) => {
    // Externalize Node.js modules for better performance
    return ['fs', 'path', 'crypto'].includes(id);
  }
},`;

  results.viteConfigUpdates.push({
    section: 'rollupOptions',
    code: configUpdate,
    description: 'Enhanced bundle splitting with optimized chunks',
  });

  console.log('✅ Vite config update generated\n');
  return configUpdate;
}

/**
 * Анализ потенциального улучшения производительности
 */
function analyzePerformanceImpact(currentChunks, optimizedChunks, chunkSizes) {
  console.log('⚡ Analyzing performance impact...\n');

  const currentChunkCount = Object.keys(currentChunks).length || 1;
  const optimizedChunkCount = Object.keys(optimizedChunks).length;

  const totalSize = Object.values(chunkSizes).reduce((sum, chunk) => sum + chunk.size, 0);
  const averageChunkSize = totalSize / Math.max(currentChunkCount, 1);

  const impact = {
    parallelLoading: optimizedChunkCount > currentChunkCount,
    cachingEfficiency: optimizedChunkCount > 3,
    bundleSplitting: optimizedChunkCount >= 6,
    estimatedImprovement: Math.min(30, optimizedChunkCount * 3), // max 30% improvement
  };

  console.log('📊 Performance Impact Analysis:');
  console.log(`  📦 Chunks: ${currentChunkCount} → ${optimizedChunkCount}`);
  console.log(`  📏 Average chunk size: ${averageChunkSize.toFixed(2)}KB`);
  console.log(`  🚀 Parallel loading: ${impact.parallelLoading ? '✅ Improved' : '⚠️ No change'}`);
  console.log(
    `  💾 Caching efficiency: ${impact.cachingEfficiency ? '✅ Good' : '⚠️ Could improve'}`,
  );
  console.log(`  ⚡ Estimated performance gain: ${impact.estimatedImprovement}%\n`);

  return impact;
}

/**
 * Генерация рекомендаций
 */
function generateRecommendations(performanceImpact, chunkSizes) {
  console.log('💡 Generating optimization recommendations...\n');

  const recommendations = [];

  // Bundle splitting рекомендации
  recommendations.push('Implement optimized manual chunks configuration');
  recommendations.push('Separate vendor libraries for better caching');
  recommendations.push('Create feature-based chunks for lazy loading');

  // Размер chunks
  const largeChunks = Object.entries(chunkSizes).filter(([, info]) => info.size > 100);
  if (largeChunks.length > 0) {
    recommendations.push(`Split ${largeChunks.length} large chunks (>100KB) further`);
  }

  // Caching оптимизации
  recommendations.push('Use long-term caching with content hashes');
  recommendations.push('Implement service worker for chunk caching');

  // Lazy loading
  recommendations.push('Add route-based code splitting');
  recommendations.push('Implement dynamic imports for heavy features');

  // Performance
  if (performanceImpact.estimatedImprovement < 20) {
    recommendations.push('Consider more aggressive chunk splitting for better parallelization');
  }

  results.recommendations = recommendations;
  return recommendations;
}

/**
 * Создание финального отчёта
 */
function createOptimizationReport() {
  const reportPath = 'docs/bundle-splitting-optimization-report.md';

  const reportContent = `# 📦 Bundle Splitting Optimization Report

**Date:** ${new Date().toLocaleDateString()}  
**Performance Sprint:** Day 2 - Bundle Optimization

## 🎯 Optimization Summary

### Current State
- **Chunks configured:** ${Object.keys(results.currentChunks).length}
- **Total JS size:** ${Object.values(results.chunkSizeAnalysis)
    .reduce((sum, chunk) => sum + chunk.size, 0)
    .toFixed(2)}KB
- **Average chunk size:** ${(Object.values(results.chunkSizeAnalysis).reduce((sum, chunk) => sum + chunk.size, 0) / Math.max(Object.keys(results.chunkSizeAnalysis).length, 1)).toFixed(2)}KB

### Optimized Configuration
- **New chunks:** ${Object.keys(results.optimizedChunks).length}
- **Chunk strategy:** Feature-based + vendor separation
- **Expected improvement:** Better caching, parallel loading

## 📊 Chunk Configuration

### Optimized Manual Chunks
\`\`\`typescript
manualChunks: {
${Object.entries(results.optimizedChunks)
  .map(([name, deps]) => `  ${name}: [${deps.map((d) => `'${d}'`).join(', ')}]`)
  .join(',\n')}
}
\`\`\`

## 🎯 Recommendations

${results.recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

## 🚀 Implementation Steps

1. Update \`apps/web/vite.config.ts\` with new manual chunks
2. Test build with \`pnpm --filter @heys/web run build\`
3. Verify chunk sizes and loading performance
4. Implement dynamic imports for feature modules
5. Add service worker caching strategy

---

**Status:** Ready for implementation  
**Next Phase:** Code Splitting & Lazy Loading (Day 3-4)
`;

  fs.writeFileSync(reportPath, reportContent);
  console.log(`📋 Optimization report created: ${reportPath}\n`);
}

/**
 * Главная функция
 */
async function main() {
  console.log('🎯 Performance Sprint Day 2 - Bundle Splitting Optimization\n');

  // 1. Анализ текущих chunks
  const currentChunks = analyzeCurrentChunks();

  // 2. Анализ размеров chunks
  const chunkSizes = analyzeChunkSizes();

  // 3. Генерация оптимизированной конфигурации
  const optimizedChunks = generateOptimizedChunks();

  // 4. Создание Vite config update
  const viteConfigUpdate = generateViteConfigUpdate(optimizedChunks);

  // 5. Анализ воздействия на производительность
  const performanceImpact = analyzePerformanceImpact(currentChunks, optimizedChunks, chunkSizes);

  // 6. Генерация рекомендаций
  const recommendations = generateRecommendations(performanceImpact, chunkSizes);

  // 7. Создание отчёта
  createOptimizationReport();

  // 8. Сохранение результатов
  fs.writeFileSync('docs/bundle-splitting-analysis.json', JSON.stringify(results, null, 2));

  console.log('📋 BUNDLE SPLITTING OPTIMIZATION SUMMARY:');
  console.log('═'.repeat(60));
  console.log(`📦 Current chunks: ${Object.keys(currentChunks).length}`);
  console.log(`🎯 Optimized chunks: ${Object.keys(optimizedChunks).length}`);
  console.log(`📊 Files analyzed: ${Object.keys(chunkSizes).length}`);
  console.log(`💡 Recommendations: ${recommendations.length}`);
  console.log(`⚡ Expected improvement: ${performanceImpact.estimatedImprovement}%`);

  console.log('\n🎯 KEY NEXT STEPS:');
  recommendations.slice(0, 5).forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });

  console.log(`\n📋 Full report: docs/bundle-splitting-optimization-report.md`);
  console.log(`💾 Analysis data: docs/bundle-splitting-analysis.json`);
  console.log('\n✅ Bundle splitting optimization completed!');
}

// Запуск
main().catch((error) => {
  console.error('❌ Error during bundle splitting optimization:', error);
  process.exit(1);
});
