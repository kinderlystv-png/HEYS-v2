// filepath: scripts/service-worker-analyzer.js
// Анализатор Service Worker интеграции для Performance Sprint Day 7

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const WEB_APP_PATH = path.join(PROJECT_ROOT, 'apps', 'web');

class ServiceWorkerAnalyzer {
  constructor() {
    this.results = {
      serviceWorker: {
        exists: false,
        size: 0,
        features: [],
        cacheStrategies: []
      },
      registration: {
        exists: false,
        location: null,
        autoRegister: false
      },
      integration: {
        hooks: [],
        components: [],
        utilities: []
      },
      features: {
        imageOptimization: false,
        cacheManagement: false,
        performanceMetrics: false,
        offlineSupport: false,
        preloading: false
      },
      analysis: {
        totalFiles: 0,
        swSize: 0,
        integrationPoints: 0,
        cacheStrategies: 0
      }
    };
  }

  /**
   * Запуск полного анализа Service Worker инфраструктуры
   */
  async analyze() {
    console.log('🔍 Service Worker Analysis: Starting comprehensive analysis...\n');

    try {
      // Анализируем основной Service Worker
      await this.analyzeServiceWorker();
      
      // Анализируем registration логику
      await this.analyzeServiceWorkerRegistration();
      
      // Анализируем интеграционные хуки и компоненты
      await this.analyzeIntegration();
      
      // Финальная оценка
      this.generateReport();
      
    } catch (error) {
      console.error('❌ Service Worker Analysis failed:', error);
      throw error;
    }
  }

  /**
   * Анализ основного Service Worker файла
   */
  async analyzeServiceWorker() {
    const swPath = path.join(WEB_APP_PATH, 'public', 'sw.js');
    
    if (!fs.existsSync(swPath)) {
      console.log('❌ Service Worker: File not found at public/sw.js');
      return;
    }

    const swContent = fs.readFileSync(swPath, 'utf8');
    const swStats = fs.statSync(swPath);

    this.results.serviceWorker.exists = true;
    this.results.serviceWorker.size = swStats.size;

    // Анализируем функции Service Worker
    const features = this.analyzeSWFeatures(swContent);
    this.results.serviceWorker.features = features;

    // Анализируем стратегии кэширования
    const cacheStrategies = this.analyzeCacheStrategies(swContent);
    this.results.serviceWorker.cacheStrategies = cacheStrategies;

    console.log(`✅ Service Worker: Found (${(swStats.size / 1024).toFixed(1)}KB)`);
    console.log(`   📋 Features: ${features.length} detected`);
    console.log(`   🗂️ Cache Strategies: ${cacheStrategies.length} types`);
  }

  /**
   * Анализ Service Worker registration
   */
  async analyzeServiceWorkerRegistration() {
    const registrationPaths = [
      path.join(WEB_APP_PATH, 'src', 'utils', 'service-worker-manager.ts'),
      path.join(WEB_APP_PATH, 'src', 'main.tsx'),
      path.join(WEB_APP_PATH, 'src', 'App.tsx')
    ];

    for (const regPath of registrationPaths) {
      if (!fs.existsSync(regPath)) continue;

      const content = fs.readFileSync(regPath, 'utf8');
      
      if (content.includes('serviceWorker.register') || content.includes('ServiceWorkerManager')) {
        this.results.registration.exists = true;
        this.results.registration.location = path.relative(WEB_APP_PATH, regPath);
        
        if (content.includes('window.addEventListener(\'load\'') || content.includes('auto-register')) {
          this.results.registration.autoRegister = true;
        }
        
        console.log(`✅ SW Registration: Found in ${this.results.registration.location}`);
        break;
      }
    }

    if (!this.results.registration.exists) {
      console.log('❌ SW Registration: Not found');
    }
  }

  /**
   * Анализ интеграции с React компонентами и хуками
   */
  async analyzeIntegration() {
    const integrationPaths = {
      hooks: path.join(WEB_APP_PATH, 'src', 'hooks'),
      components: path.join(WEB_APP_PATH, 'src', 'components'),
      utils: path.join(WEB_APP_PATH, 'src', 'utils')
    };

    // Анализируем хуки
    await this.analyzeHooksIntegration(integrationPaths.hooks);
    
    // Анализируем компоненты
    await this.analyzeComponentsIntegration(integrationPaths.components);
    
    // Анализируем утилиты
    await this.analyzeUtilsIntegration(integrationPaths.utils);
  }

  /**
   * Анализ Service Worker хуков
   */
  async analyzeHooksIntegration(hooksPath) {
    if (!fs.existsSync(hooksPath)) return;

    const files = fs.readdirSync(hooksPath).filter(file => 
      file.endsWith('.ts') || file.endsWith('.tsx')
    );

    for (const file of files) {
      const filePath = path.join(hooksPath, file);
      const content = fs.readFileSync(filePath, 'utf8');

      if (content.includes('useServiceWorker') || content.includes('serviceWorkerManager')) {
        this.results.integration.hooks.push({
          file,
          features: this.extractHookFeatures(content)
        });
      }
    }

    console.log(`✅ SW Hooks: ${this.results.integration.hooks.length} files with integration`);
  }

  /**
   * Анализ компонентов с Service Worker интеграцией
   */
  async analyzeComponentsIntegration(componentsPath) {
    if (!fs.existsSync(componentsPath)) return;

    const findIntegratedComponents = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);
        
        if (stat.isDirectory()) {
          findIntegratedComponents(itemPath);
        } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
          const content = fs.readFileSync(itemPath, 'utf8');
          
          if (content.includes('useServiceWorker') || 
              content.includes('usePerformanceMetrics') ||
              content.includes('serviceWorkerManager')) {
            
            this.results.integration.components.push({
              file: path.relative(componentsPath, itemPath),
              features: this.extractComponentFeatures(content)
            });
          }
        }
      }
    };

    findIntegratedComponents(componentsPath);
    console.log(`✅ SW Components: ${this.results.integration.components.length} components with integration`);
  }

  /**
   * Анализ утилит Service Worker
   */
  async analyzeUtilsIntegration(utilsPath) {
    if (!fs.existsSync(utilsPath)) return;

    const files = fs.readdirSync(utilsPath).filter(file => 
      (file.endsWith('.ts') || file.endsWith('.tsx')) && 
      file.includes('service-worker')
    );

    for (const file of files) {
      const filePath = path.join(utilsPath, file);
      const content = fs.readFileSync(filePath, 'utf8');

      this.results.integration.utilities.push({
        file,
        size: fs.statSync(filePath).size,
        features: this.extractUtilFeatures(content)
      });
    }

    console.log(`✅ SW Utils: ${this.results.integration.utilities.length} utility files`);
  }

  /**
   * Анализ функций Service Worker
   */
  analyzeSWFeatures(content) {
    const features = [];

    const featurePatterns = {
      'Cache Management': /caches\.(open|match|delete|keys)/g,
      'Image Optimization': /handleImageRequest|isImageRequest/g,
      'Performance Metrics': /performance\.now|sendPerformanceMetrics/g,
      'Offline Support': /navigator\.onLine|offline/g,
      'Background Sync': /addEventListener\(['"']sync['"']/g,
      'Push Notifications': /addEventListener\(['"']push['"']/g,
      'Resource Preloading': /preloadResources|preload/g,
      'Error Handling': /catch\s*\(|\.catch\(/g,
      'Message Channel': /MessageChannel|postMessage/g,
      'Dynamic Imports': /importScripts|import\(/g
    };

    for (const [feature, pattern] of Object.entries(featurePatterns)) {
      const matches = content.match(pattern);
      if (matches) {
        features.push({
          name: feature,
          occurrences: matches.length
        });
      }
    }

    return features;
  }

  /**
   * Анализ стратегий кэширования
   */
  analyzeCacheStrategies(content) {
    const strategies = [];

    const strategyPatterns = {
      'Cache First': /cache\.match.*fetch/s,
      'Network First': /fetch.*cache\.match/s,
      'Stale While Revalidate': /stale.*revalidate|cachedResponse.*fetch/s,
      'Cache Only': /cache\.match(?!.*fetch)/g,
      'Network Only': /fetch(?!.*cache)/g
    };

    for (const [strategy, pattern] of Object.entries(strategyPatterns)) {
      if (pattern.test(content)) {
        strategies.push(strategy);
      }
    }

    return strategies;
  }

  /**
   * Извлечение функций из хуков
   */
  extractHookFeatures(content) {
    const features = [];
    
    if (content.includes('register')) features.push('Registration');
    if (content.includes('preload')) features.push('Preloading');
    if (content.includes('clearCache')) features.push('Cache Management');
    if (content.includes('metrics')) features.push('Performance Metrics');
    if (content.includes('online')) features.push('Online Status');
    
    return features;
  }

  /**
   * Извлечение функций из компонентов
   */
  extractComponentFeatures(content) {
    const features = [];
    
    if (content.includes('usePerformanceMetrics')) features.push('Performance Tracking');
    if (content.includes('preload')) features.push('Resource Preloading');
    if (content.includes('cache')) features.push('Cache Integration');
    if (content.includes('offline')) features.push('Offline Support');
    
    return features;
  }

  /**
   * Извлечение функций из утилит
   */
  extractUtilFeatures(content) {
    const features = [];
    
    if (content.includes('class')) features.push('OOP Implementation');
    if (content.includes('async')) features.push('Async Operations');
    if (content.includes('Promise')) features.push('Promise Handling');
    if (content.includes('Error')) features.push('Error Handling');
    if (content.includes('interface')) features.push('TypeScript Types');
    
    return features;
  }

  /**
   * Генерация финального отчета
   */
  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SERVICE WORKER ANALYSIS REPORT');
    console.log('='.repeat(60));

    // Базовые метрики
    console.log('\n🎯 IMPLEMENTATION STATUS:');
    console.log(`   Service Worker File: ${this.results.serviceWorker.exists ? '✅' : '❌'}`);
    console.log(`   Registration Logic: ${this.results.registration.exists ? '✅' : '❌'}`);
    console.log(`   Auto Registration: ${this.results.registration.autoRegister ? '✅' : '❌'}`);

    // Размер и производительность
    if (this.results.serviceWorker.exists) {
      console.log('\n📦 SIZE METRICS:');
      console.log(`   Service Worker: ${(this.results.serviceWorker.size / 1024).toFixed(1)}KB`);
      
      const totalUtilsSize = this.results.integration.utilities.reduce((sum, util) => sum + util.size, 0);
      console.log(`   Utils Integration: ${(totalUtilsSize / 1024).toFixed(1)}KB`);
    }

    // Функциональность
    console.log('\n⚡ FEATURES ANALYSIS:');
    this.results.serviceWorker.features.forEach(feature => {
      console.log(`   ✅ ${feature.name}: ${feature.occurrences} occurrences`);
    });

    // Стратегии кэширования
    console.log('\n🗂️ CACHE STRATEGIES:');
    this.results.serviceWorker.cacheStrategies.forEach(strategy => {
      console.log(`   📋 ${strategy}`);
    });

    // Интеграция
    console.log('\n🔗 INTEGRATION POINTS:');
    console.log(`   React Hooks: ${this.results.integration.hooks.length}`);
    console.log(`   Components: ${this.results.integration.components.length}`);
    console.log(`   Utilities: ${this.results.integration.utilities.length}`);

    // Детали интеграции
    if (this.results.integration.hooks.length > 0) {
      console.log('\n🪝 HOOKS INTEGRATION:');
      this.results.integration.hooks.forEach(hook => {
        console.log(`   📄 ${hook.file}: ${hook.features.join(', ')}`);
      });
    }

    if (this.results.integration.components.length > 0) {
      console.log('\n🧩 COMPONENTS INTEGRATION:');
      this.results.integration.components.forEach(comp => {
        console.log(`   📄 ${comp.file}: ${comp.features.join(', ')}`);
      });
    }

    // Финальная оценка
    console.log('\n' + '='.repeat(60));
    console.log('🏆 FINAL ASSESSMENT');
    console.log('='.repeat(60));

    const score = this.calculateScore();
    console.log(`📊 Service Worker Score: ${score.total}/100`);
    console.log(`   Implementation: ${score.implementation}/30`);
    console.log(`   Features: ${score.features}/35`);
    console.log(`   Integration: ${score.integration}/35`);

    if (score.total >= 85) {
      console.log('🎉 EXCELLENT: Service Worker fully implemented!');
    } else if (score.total >= 70) {
      console.log('✅ GOOD: Service Worker mostly complete');
    } else if (score.total >= 50) {
      console.log('⚠️ PARTIAL: Service Worker needs more work');
    } else {
      console.log('❌ INCOMPLETE: Service Worker missing critical features');
    }

    console.log('\n✅ Service Worker analysis complete!\n');
  }

  /**
   * Расчет итогового score
   */
  calculateScore() {
    let implementation = 0;
    let features = 0;
    let integration = 0;

    // Implementation score (30 points)
    if (this.results.serviceWorker.exists) implementation += 15;
    if (this.results.registration.exists) implementation += 10;
    if (this.results.registration.autoRegister) implementation += 5;

    // Features score (35 points)
    const totalFeatures = this.results.serviceWorker.features.length;
    features = Math.min(35, totalFeatures * 4); // 4 points per feature, max 35

    // Integration score (35 points)
    integration += this.results.integration.hooks.length * 10; // Up to 30 points
    integration += this.results.integration.components.length * 2; // Up to 10 points
    integration += this.results.integration.utilities.length * 5; // Up to 15 points
    integration = Math.min(35, integration);

    return {
      implementation,
      features,
      integration,
      total: implementation + features + integration
    };
  }
}

// Запуск анализа
if (require.main === module) {
  const analyzer = new ServiceWorkerAnalyzer();
  analyzer.analyze().catch(console.error);
}

module.exports = ServiceWorkerAnalyzer;
