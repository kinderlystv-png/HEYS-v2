#!/usr/bin/env node
/**
 * Performance Baseline Measurement Script
 * Измеряет текущие показатели производительности
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('⚡ Performance Baseline Measurement Starting...\n');

const results = {
  timestamp: new Date().toISOString(),
  lighthouse: {},
  bundle: {},
  vitals: {},
  network: {},
  recommendations: []
};

/**
 * Проверка наличия Lighthouse
 */
function checkLighthouse() {
  try {
    execSync('lighthouse --version', { stdio: 'ignore' });
    return true;
  } catch {
    console.log('⚠️  Lighthouse not found. Install with: npm install -g lighthouse');
    return false;
  }
}

/**
 * Запуск Lighthouse анализа
 */
async function runLighthouseAnalysis() {
  if (!checkLighthouse()) {
    return null;
  }

  console.log('🔍 Running Lighthouse analysis...');
  
  try {
    // Проверим, работает ли dev server
    const port = process.env.PORT || 3001;
    const url = `http://localhost:${port}`;
    
    console.log(`📊 Testing URL: ${url}`);
    
    const command = `lighthouse ${url} --output=json --output-path=temp/lighthouse-baseline.json --chrome-flags="--headless --no-sandbox" --quiet`;
    
    execSync(command, { stdio: 'inherit' });
    
    // Читаем результаты
    const lighthouseResults = JSON.parse(fs.readFileSync('temp/lighthouse-baseline.json', 'utf8'));
    
    results.lighthouse = {
      performance: Math.round(lighthouseResults.lhr.categories.performance.score * 100),
      accessibility: Math.round(lighthouseResults.lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lighthouseResults.lhr.categories['best-practices'].score * 100),
      seo: Math.round(lighthouseResults.lhr.categories.seo.score * 100),
      fcp: lighthouseResults.lhr.audits['first-contentful-paint'].displayValue,
      lcp: lighthouseResults.lhr.audits['largest-contentful-paint'].displayValue,
      tti: lighthouseResults.lhr.audits['interactive'].displayValue,
      cls: lighthouseResults.lhr.audits['cumulative-layout-shift'].displayValue,
      tbt: lighthouseResults.lhr.audits['total-blocking-time'].displayValue
    };
    
    console.log('✅ Lighthouse analysis completed');
    return results.lighthouse;
    
  } catch (error) {
    console.log('⚠️  Lighthouse analysis failed:', error.message);
    return null;
  }
}

/**
 * Анализ размера bundle файлов
 */
function analyzeBundleSize() {
  console.log('📦 Analyzing bundle sizes...');
  
  const distPaths = [
    'apps/web/dist',
    'packages/core/dist',
    'packages/ui/dist'
  ];
  
  const bundleInfo = {};
  let totalSize = 0;
  
  distPaths.forEach(distPath => {
    if (!fs.existsSync(distPath)) {
      console.log(`⚠️  Dist folder not found: ${distPath}`);
      return;
    }
    
    try {
      // Получаем размер папки
      const command = process.platform === 'win32' 
        ? `powershell "Get-ChildItem '${distPath}' -Recurse | Measure-Object -Property Length -Sum | Select-Object -ExpandProperty Sum"`
        : `du -sb "${distPath}" | cut -f1`;
        
      const sizeBytes = parseInt(execSync(command, { encoding: 'utf8' }).trim());
      const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(2);
      
      bundleInfo[distPath] = {
        sizeBytes,
        sizeMB: parseFloat(sizeMB)
      };
      
      totalSize += parseFloat(sizeMB);
      
      console.log(`  📁 ${distPath}: ${sizeMB}MB`);
      
    } catch (error) {
      console.log(`⚠️  Failed to analyze ${distPath}:`, error.message);
    }
  });
  
  results.bundle = {
    packages: bundleInfo,
    totalSizeMB: parseFloat(totalSize.toFixed(2))
  };
  
  console.log(`📊 Total bundle size: ${totalSize.toFixed(2)}MB\n`);
}

/**
 * Анализ network ресурсов
 */
function analyzeNetworkResources() {
  console.log('🌐 Analyzing network resources...');
  
  const webDistPath = 'apps/web/dist';
  if (!fs.existsSync(webDistPath)) {
    console.log('⚠️  Web dist folder not found\n');
    return;
  }
  
  const resourceTypes = {
    js: 0,
    css: 0,
    images: 0,
    fonts: 0,
    other: 0
  };
  
  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scanDirectory(fullPath);
      } else {
        const ext = path.extname(item).toLowerCase();
        const sizeKB = (stat.size / 1024).toFixed(2);
        
        if (['.js', '.mjs', '.ts'].includes(ext)) {
          resourceTypes.js += parseFloat(sizeKB);
        } else if (['.css', '.scss', '.less'].includes(ext)) {
          resourceTypes.css += parseFloat(sizeKB);
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
          resourceTypes.images += parseFloat(sizeKB);
        } else if (['.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
          resourceTypes.fonts += parseFloat(sizeKB);
        } else {
          resourceTypes.other += parseFloat(sizeKB);
        }
      }
    });
  }
  
  scanDirectory(webDistPath);
  
  results.network = resourceTypes;
  
  console.log('📊 Resource breakdown:');
  Object.entries(resourceTypes).forEach(([type, size]) => {
    console.log(`  ${type.toUpperCase()}: ${size.toFixed(2)}KB`);
  });
  console.log();
}

/**
 * Генерация рекомендаций
 */
function generateRecommendations() {
  console.log('💡 Generating recommendations...\n');
  
  // Bundle size рекомендации
  if (results.bundle.totalSizeMB > 5) {
    results.recommendations.push('Large bundle size detected (>5MB), consider code splitting');
  }
  
  // Lighthouse рекомендации
  if (results.lighthouse) {
    if (results.lighthouse.performance < 90) {
      results.recommendations.push('Performance score below 90, optimization needed');
    }
    
    if (results.lighthouse.fcp && parseFloat(results.lighthouse.fcp) > 1.8) {
      results.recommendations.push('First Contentful Paint > 1.8s, optimize critical resources');
    }
    
    if (results.lighthouse.lcp && parseFloat(results.lighthouse.lcp) > 2.5) {
      results.recommendations.push('Largest Contentful Paint > 2.5s, optimize largest elements');
    }
  }
  
  // Network ресурсы рекомендации
  if (results.network.js > 1000) {
    results.recommendations.push('Large JavaScript bundle (>1MB), implement code splitting');
  }
  
  if (results.network.images > 2000) {
    results.recommendations.push('Large image assets (>2MB), optimize and compress images');
  }
}

/**
 * Главная функция
 */
async function main() {
  // Создаем папку temp если не существует
  if (!fs.existsSync('temp')) {
    fs.mkdirSync('temp');
  }
  
  // Запускаем анализы
  await runLighthouseAnalysis();
  analyzeBundleSize();
  analyzeNetworkResources();
  generateRecommendations();
  
  // Выводим итоги
  console.log('📋 PERFORMANCE BASELINE RESULTS:');
  console.log('═'.repeat(50));
  
  if (results.lighthouse) {
    console.log('🚀 LIGHTHOUSE SCORES:');
    console.log(`  Performance: ${results.lighthouse.performance}/100`);
    console.log(`  Accessibility: ${results.lighthouse.accessibility}/100`);
    console.log(`  Best Practices: ${results.lighthouse.bestPractices}/100`);
    console.log(`  SEO: ${results.lighthouse.seo}/100`);
    console.log();
    
    console.log('⚡ CORE WEB VITALS:');
    console.log(`  FCP: ${results.lighthouse.fcp}`);
    console.log(`  LCP: ${results.lighthouse.lcp}`);
    console.log(`  TTI: ${results.lighthouse.tti}`);
    console.log(`  CLS: ${results.lighthouse.cls}`);
    console.log(`  TBT: ${results.lighthouse.tbt}`);
    console.log();
  }
  
  console.log('📦 BUNDLE ANALYSIS:');
  console.log(`  Total Size: ${results.bundle.totalSizeMB}MB`);
  console.log();
  
  console.log('🌐 NETWORK RESOURCES:');
  console.log(`  JavaScript: ${results.network.js.toFixed(2)}KB`);
  console.log(`  CSS: ${results.network.css.toFixed(2)}KB`);
  console.log(`  Images: ${results.network.images.toFixed(2)}KB`);
  console.log();
  
  if (results.recommendations.length > 0) {
    console.log('🎯 RECOMMENDATIONS:');
    results.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. ${rec}`);
    });
    console.log();
  }
  
  // Сохраняем результаты
  const outputFile = 'docs/performance-baseline.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${outputFile}`);
  
  console.log('\n✅ Performance baseline measurement completed!');
}

// Запуск
main().catch(error => {
  console.error('❌ Error during performance measurement:', error);
  process.exit(1);
});
