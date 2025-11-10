#!/usr/bin/env node

// filepath: packages/shared/src/performance/cli/lazy-loading-analyzer.js

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class LazyLoadingAnalyzer {
  constructor() {
    this.startTime = performance.now();
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      lazyImages: 0,
      lazyComponents: 0,
      lazyScripts: 0,
      lazyStyles: 0,
      lazyIframes: 0,
      opportunities: [],
    };
  }

  /**
   * Запуск анализа
   */
  async analyze(directory = './') {
    console.log('🚀 Анализ возможностей для ленивой загрузки...\n');

    const absoluteDir = path.resolve(directory);
    console.log(`📁 Анализируемая директория: ${absoluteDir}\n`);

    await this.scanDirectory(absoluteDir);
    this.generateReport();
  }

  /**
   * Сканирование директории
   */
  async scanDirectory(dir, depth = 0) {
    const maxDepth = 10; // Ограничиваем глубину
    if (depth > maxDepth) return;

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Пропускаем служебные директории
          if (this.shouldSkipDirectory(entry.name)) continue;

          await this.scanDirectory(fullPath, depth + 1);
        } else if (entry.isFile()) {
          this.stats.totalFiles++;

          if (this.shouldAnalyzeFile(entry.name)) {
            await this.analyzeFile(fullPath);
            this.stats.processedFiles++;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Ошибка при сканировании ${dir}: ${error.message}`);
    }
  }

  /**
   * Проверка, нужно ли пропустить директорию
   */
  shouldSkipDirectory(name) {
    const skipDirs = [
      'node_modules',
      '.git',
      '.vscode',
      'dist',
      'build',
      'coverage',
      '.next',
      '.nuxt',
      'out',
      'public/static',
    ];
    return skipDirs.includes(name) || name.startsWith('.');
  }

  /**
   * Проверка, нужно ли анализировать файл
   */
  shouldAnalyzeFile(filename) {
    const extensions = ['.html', '.htm', '.jsx', '.tsx', '.vue', '.svelte', '.php'];
    return extensions.some((ext) => filename.toLowerCase().endsWith(ext));
  }

  /**
   * Анализ файла
   */
  async analyzeFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);

      // Анализируем различные типы ресурсов
      this.analyzeImages(content, relativePath);
      this.analyzeScripts(content, relativePath);
      this.analyzeStyles(content, relativePath);
      this.analyzeIframes(content, relativePath);
      this.analyzeComponents(content, relativePath);
    } catch (error) {
      console.warn(`⚠️  Ошибка при анализе ${filePath}: ${error.message}`);
    }
  }

  /**
   * Анализ изображений
   */
  analyzeImages(content, filePath) {
    // Регулярное выражение для поиска img тегов
    const imgRegex = /<img[^>]*src\s*=\s*["']([^"']*?)["'][^>]*>/gi;
    const lazyImgRegex = /<img[^>]*(?:data-src|loading\s*=\s*["']lazy["'])[^>]*>/gi;

    let match;
    const images = [];
    const lazyImages = [];

    // Находим все изображения
    while ((match = imgRegex.exec(content)) !== null) {
      images.push({
        src: match[1],
        fullMatch: match[0],
        index: match.index,
      });
    }

    // Находим уже lazy изображения
    while ((match = lazyImgRegex.exec(content)) !== null) {
      lazyImages.push(match[0]);
      this.stats.lazyImages++;
    }

    // Анализируем возможности оптимизации
    const nonLazyImages = images.length - lazyImages.length;
    if (nonLazyImages > 0) {
      this.stats.opportunities.push({
        type: 'images',
        file: filePath,
        count: nonLazyImages,
        total: images.length,
        impact: this.calculateImageImpact(images),
        details: images.slice(0, 5).map((img) => img.src), // Первые 5 для примера
      });
    }
  }

  /**
   * Анализ скриптов
   */
  analyzeScripts(content, filePath) {
    const scriptRegex = /<script[^>]*src\s*=\s*["']([^"']*?)["'][^>]*>/gi;
    const lazyScriptRegex = /<script[^>]*(?:data-src|defer|async)[^>]*>/gi;

    let match;
    const scripts = [];
    const lazyScripts = [];

    while ((match = scriptRegex.exec(content)) !== null) {
      scripts.push({
        src: match[1],
        fullMatch: match[0],
      });
    }

    while ((match = lazyScriptRegex.exec(content)) !== null) {
      lazyScripts.push(match[0]);
      this.stats.lazyScripts++;
    }

    const nonLazyScripts = scripts.length - lazyScripts.length;
    if (nonLazyScripts > 0) {
      this.stats.opportunities.push({
        type: 'scripts',
        file: filePath,
        count: nonLazyScripts,
        total: scripts.length,
        impact: this.calculateScriptImpact(scripts),
        details: scripts.slice(0, 3).map((script) => script.src),
      });
    }
  }

  /**
   * Анализ стилей
   */
  analyzeStyles(content, filePath) {
    const linkRegex = /<link[^>]*href\s*=\s*["']([^"']*\.css[^"']*?)["'][^>]*>/gi;
    const lazyStyleRegex = /<link[^>]*(?:data-href|media\s*=\s*["']print["'])[^>]*>/gi;

    let match;
    const styles = [];
    const lazyStyles = [];

    while ((match = linkRegex.exec(content)) !== null) {
      styles.push({
        href: match[1],
        fullMatch: match[0],
      });
    }

    while ((match = lazyStyleRegex.exec(content)) !== null) {
      lazyStyles.push(match[0]);
      this.stats.lazyStyles++;
    }

    const nonLazyStyles = styles.length - lazyStyles.length;
    if (nonLazyStyles > 0) {
      this.stats.opportunities.push({
        type: 'styles',
        file: filePath,
        count: nonLazyStyles,
        total: styles.length,
        impact: 'medium',
        details: styles.slice(0, 3).map((style) => style.href),
      });
    }
  }

  /**
   * Анализ iframe элементов
   */
  analyzeIframes(content, filePath) {
    const iframeRegex = /<iframe[^>]*src\s*=\s*["']([^"']*?)["'][^>]*>/gi;
    const lazyIframeRegex = /<iframe[^>]*(?:data-src|loading\s*=\s*["']lazy["'])[^>]*>/gi;

    let match;
    const iframes = [];
    const lazyIframes = [];

    while ((match = iframeRegex.exec(content)) !== null) {
      iframes.push({
        src: match[1],
        fullMatch: match[0],
      });
    }

    while ((match = lazyIframeRegex.exec(content)) !== null) {
      lazyIframes.push(match[0]);
      this.stats.lazyIframes++;
    }

    const nonLazyIframes = iframes.length - lazyIframes.length;
    if (nonLazyIframes > 0) {
      this.stats.opportunities.push({
        type: 'iframes',
        file: filePath,
        count: nonLazyIframes,
        total: iframes.length,
        impact: 'high',
        details: iframes.slice(0, 3).map((iframe) => iframe.src),
      });
    }
  }

  /**
   * Анализ компонентов
   */
  analyzeComponents(content, filePath) {
    // Поиск компонентов React/Vue/других
    const componentPatterns = [
      /import\s+[^}]*\s+from\s+["']([^"']*?)["']/gi, // ES6 imports
      /const\s+\w+\s*=\s*lazy\s*\(/gi, // React.lazy
      /defineAsyncComponent\s*\(/gi, // Vue async components
      /<script[^>]*type\s*=\s*["']module["'][^>]*>/gi, // ES modules
    ];

    let componentImports = 0;
    let lazyComponents = 0;

    componentPatterns.forEach((pattern) => {
      const matches = content.match(pattern);
      if (matches) {
        componentImports += matches.length;

        // Проверяем на ленивые компоненты
        matches.forEach((match) => {
          if (match.includes('lazy') || match.includes('async') || match.includes('dynamic')) {
            lazyComponents++;
            this.stats.lazyComponents++;
          }
        });
      }
    });

    const nonLazyComponents = componentImports - lazyComponents;
    if (nonLazyComponents > 0) {
      this.stats.opportunities.push({
        type: 'components',
        file: filePath,
        count: nonLazyComponents,
        total: componentImports,
        impact: 'high',
        details: ['Component imports found'],
      });
    }
  }

  /**
   * Расчет влияния оптимизации изображений
   */
  calculateImageImpact(images) {
    const largeImageExtensions = ['.png', '.jpg', '.jpeg', '.gif'];
    const hasLargeImages = images.some((img) =>
      largeImageExtensions.some((ext) => img.src.toLowerCase().includes(ext)),
    );

    if (images.length > 10) return 'high';
    if (images.length > 5 || hasLargeImages) return 'medium';
    return 'low';
  }

  /**
   * Расчет влияния оптимизации скриптов
   */
  calculateScriptImpact(scripts) {
    const heavyScripts = scripts.filter(
      (script) =>
        script.src.includes('bundle') ||
        script.src.includes('vendor') ||
        script.src.includes('chunk'),
    );

    if (heavyScripts.length > 3) return 'high';
    if (scripts.length > 5) return 'medium';
    return 'low';
  }

  /**
   * Генерация отчета
   */
  generateReport() {
    const endTime = performance.now();
    const analysisTime = ((endTime - this.startTime) / 1000).toFixed(2);

    console.log('📊 ОТЧЕТ ПО АНАЛИЗУ ЛЕНИВОЙ ЗАГРУЗКИ');
    console.log('='.repeat(50));
    console.log();

    // Общая статистика
    console.log('📈 Общая статистика:');
    console.log(`   • Всего файлов: ${this.stats.totalFiles}`);
    console.log(`   • Проанализировано: ${this.stats.processedFiles}`);
    console.log(`   • Время анализа: ${analysisTime}с`);
    console.log();

    // Текущее состояние lazy loading
    console.log('✅ Уже используется ленивая загрузка:');
    console.log(`   • Изображения: ${this.stats.lazyImages}`);
    console.log(`   • Скрипты: ${this.stats.lazyScripts}`);
    console.log(`   • Стили: ${this.stats.lazyStyles}`);
    console.log(`   • Компоненты: ${this.stats.lazyComponents}`);
    console.log(`   • Iframe: ${this.stats.lazyIframes}`);
    console.log();

    // Возможности для оптимизации
    if (this.stats.opportunities.length > 0) {
      console.log('🎯 Возможности для оптимизации:');
      console.log();

      const groupedOpportunities = this.groupOpportunities();

      Object.entries(groupedOpportunities).forEach(([type, opportunities]) => {
        const totalCount = opportunities.reduce((sum, opp) => sum + opp.count, 0);
        const impactLevel = this.getOverallImpact(opportunities);

        console.log(`${this.getTypeIcon(type)} ${this.getTypeName(type)}:`);
        console.log(`   • Найдено файлов с возможностями: ${opportunities.length}`);
        console.log(`   • Общее количество элементов: ${totalCount}`);
        console.log(
          `   • Потенциальное влияние: ${this.getImpactEmoji(impactLevel)} ${impactLevel.toUpperCase()}`,
        );

        // Топ файлов для оптимизации
        const topFiles = opportunities.sort((a, b) => b.count - a.count).slice(0, 3);

        if (topFiles.length > 0) {
          console.log('   • Топ файлов для оптимизации:');
          topFiles.forEach((file) => {
            console.log(`     - ${file.file} (${file.count} элементов)`);
          });
        }
        console.log();
      });

      // Общая оценка потенциала
      const totalImpact = this.calculateTotalImpact();
      console.log('💡 Общая оценка потенциала оптимизации:');
      console.log(
        `   ${this.getImpactEmoji(totalImpact.level)} ${totalImpact.level.toUpperCase()} - ${totalImpact.description}`,
      );
      console.log();

      // Рекомендации
      this.generateRecommendations();
    } else {
      console.log('🎉 Отлично! Ленивая загрузка уже хорошо оптимизирована!');
      console.log('   Дополнительных возможностей для оптимизации не найдено.');
    }

    console.log('='.repeat(50));
  }

  /**
   * Группировка возможностей по типам
   */
  groupOpportunities() {
    const grouped = {};

    this.stats.opportunities.forEach((opp) => {
      if (!grouped[opp.type]) {
        grouped[opp.type] = [];
      }
      grouped[opp.type].push(opp);
    });

    return grouped;
  }

  /**
   * Получение общего влияния для типа
   */
  getOverallImpact(opportunities) {
    const impacts = opportunities.map((opp) => opp.impact);

    if (impacts.includes('high')) return 'high';
    if (impacts.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Расчет общего потенциала оптимизации
   */
  calculateTotalImpact() {
    const totalOpportunities = this.stats.opportunities.length;
    const highImpactCount = this.stats.opportunities.filter((opp) => opp.impact === 'high').length;
    const mediumImpactCount = this.stats.opportunities.filter(
      (opp) => opp.impact === 'medium',
    ).length;

    if (totalOpportunities === 0) {
      return { level: 'none', description: 'Все уже оптимизировано' };
    }

    if (highImpactCount > 5 || totalOpportunities > 20) {
      return {
        level: 'high',
        description: `Много возможностей для оптимизации (${totalOpportunities} файлов)`,
      };
    }

    if (highImpactCount > 2 || mediumImpactCount > 5) {
      return {
        level: 'medium',
        description: `Умеренные возможности для оптимизации (${totalOpportunities} файлов)`,
      };
    }

    return {
      level: 'low',
      description: `Небольшие возможности для оптимизации (${totalOpportunities} файлов)`,
    };
  }

  /**
   * Генерация рекомендаций
   */
  generateRecommendations() {
    console.log('💡 Рекомендации по оптимизации:');
    console.log();

    const groupedOpportunities = this.groupOpportunities();

    if (groupedOpportunities.images) {
      console.log('🖼️  Изображения:');
      console.log('   • Добавьте loading="lazy" к img тегам');
      console.log('   • Используйте IntersectionObserver для кастомной реализации');
      console.log('   • Рассмотрите использование современных форматов (WebP, AVIF)');
      console.log();
    }

    if (groupedOpportunities.scripts) {
      console.log('📜 Скрипты:');
      console.log('   • Используйте dynamic imports для компонентов');
      console.log('   • Добавьте defer/async к внешним скриптам');
      console.log('   • Реализуйте code splitting для больших бандлов');
      console.log();
    }

    if (groupedOpportunities.components) {
      console.log('🧩 Компоненты:');
      console.log('   • React: используйте React.lazy() и Suspense');
      console.log('   • Vue: используйте defineAsyncComponent()');
      console.log('   • Реализуйте route-based code splitting');
      console.log();
    }

    if (groupedOpportunities.iframes) {
      console.log('🖼️  Iframe:');
      console.log('   • Добавьте loading="lazy" к iframe элементам');
      console.log('   • Используйте placeholder для встроенного контента');
      console.log('   • Рассмотрите ленивую загрузку карт и виджетов');
      console.log();
    }

    console.log('🔧 Инструменты для реализации:');
    console.log('   • Используйте готовый LazyLoader из этого пакета');
    console.log('   • Настройте bundler для автоматического code splitting');
    console.log('   • Добавьте performance monitoring для отслеживания результатов');
    console.log();
  }

  /**
   * Получение иконки для типа
   */
  getTypeIcon(type) {
    const icons = {
      images: '🖼️ ',
      scripts: '📜',
      styles: '🎨',
      components: '🧩',
      iframes: '🖼️ ',
    };
    return icons[type] || '📄';
  }

  /**
   * Получение читаемого имени типа
   */
  getTypeName(type) {
    const names = {
      images: 'Изображения',
      scripts: 'Скрипты',
      styles: 'Стили',
      components: 'Компоненты',
      iframes: 'Iframe элементы',
    };
    return names[type] || type;
  }

  /**
   * Получение эмодзи для уровня влияния
   */
  getImpactEmoji(impact) {
    const emojis = {
      high: '🔥',
      medium: '⚡',
      low: '💡',
      none: '✅',
    };
    return emojis[impact] || '❓';
  }
}

// CLI interface
if (require.main === module) {
  const analyzer = new LazyLoadingAnalyzer();
  const directory = process.argv[2] || './';

  analyzer.analyze(directory).catch((error) => {
    console.error('❌ Ошибка при анализе:', error.message);
    process.exit(1);
  });
}

module.exports = LazyLoadingAnalyzer;
