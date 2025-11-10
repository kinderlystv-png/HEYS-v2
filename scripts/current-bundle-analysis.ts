// filepath: scripts/current-bundle-analysis.ts
// Анализ текущего состояния bundle - Performance Sprint Day 2

import chalk from 'chalk';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

class CurrentBundleAnalyzer {
  private workspaceRoot: string;
  private webPath: string;

  constructor() {
    this.workspaceRoot = process.cwd();
    this.webPath = join(this.workspaceRoot, 'apps', 'web');
  }

  async analyzeCurrentState(): Promise<void> {
    console.log(chalk.blue('📊 CURRENT BUNDLE STATE ANALYSIS - Day 2 Sprint\n'));

    // Анализируем HTML файл
    this.analyzeHtmlFile();

    // Анализируем статические ресурсы
    this.analyzeStaticAssets();

    // Анализируем зависимости в package.json
    this.analyzeDependencies();

    // Рекомендации для оптимизации
    this.generateOptimizationRecommendations();
  }

  private analyzeHtmlFile(): void {
    const htmlPath = join(this.webPath, 'dist', 'index.html');

    if (!existsSync(htmlPath)) {
      console.log(chalk.red('❌ No dist/index.html found'));
      return;
    }

    try {
      const htmlContent = readFileSync(htmlPath, 'utf-8');
      const htmlSize = statSync(htmlPath).size;

      console.log(chalk.yellow('📄 HTML FILE ANALYSIS:'));
      console.log(`   File size: ${chalk.cyan(this.formatBytes(htmlSize))}`);

      // Анализ script тегов
      const scriptMatches = htmlContent.match(/<script[^>]*>/g) || [];
      const scriptCount = scriptMatches.length;

      // Анализ external scripts
      const externalScripts = scriptMatches.filter((tag) => tag.includes('src='));
      const inlineScripts = scriptCount - externalScripts.length;

      console.log(`   Script tags: ${chalk.cyan(scriptCount)} total`);
      console.log(`   External scripts: ${chalk.cyan(externalScripts.length)}`);
      console.log(`   Inline scripts: ${chalk.cyan(inlineScripts)}`);

      // Анализ CSS
      const styleMatches = htmlContent.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [];
      const linkMatches = htmlContent.match(/<link[^>]*rel="stylesheet"[^>]*>/g) || [];

      console.log(`   Inline CSS blocks: ${chalk.cyan(styleMatches.length)}`);
      console.log(`   External CSS files: ${chalk.cyan(linkMatches.length)}`);

      // Анализ performance hints
      const preloadLinks = htmlContent.match(/<link[^>]*rel="preload"[^>]*>/g) || [];
      const preconnectLinks = htmlContent.match(/<link[^>]*rel="preconnect"[^>]*>/g) || [];

      console.log(`   Preload hints: ${chalk.cyan(preloadLinks.length)}`);
      console.log(`   Preconnect hints: ${chalk.cyan(preconnectLinks.length)}`);

      // Оценка оптимизации HTML
      this.evaluateHtmlOptimization(scriptCount, externalScripts.length, preloadLinks.length);
    } catch (error) {
      console.log(chalk.red(`❌ Error analyzing HTML: ${error}`));
    }
  }

  private analyzeStaticAssets(): void {
    const publicPath = join(this.webPath, 'public');

    if (!existsSync(publicPath)) {
      console.log(chalk.yellow('⚠️ No public folder found'));
      return;
    }

    console.log(chalk.blue('\n📂 STATIC ASSETS ANALYSIS:'));

    try {
      const files = readdirSync(publicPath);
      let totalSize = 0;
      const assetTypes: Record<string, { count: number; size: number }> = {};

      files.forEach((file) => {
        const filePath = join(publicPath, file);
        const stats = statSync(filePath);

        if (stats.isFile()) {
          const ext = file.split('.').pop()?.toLowerCase() || 'unknown';

          if (!assetTypes[ext]) {
            assetTypes[ext] = { count: 0, size: 0 };
          }

          assetTypes[ext].count++;
          assetTypes[ext].size += stats.size;
          totalSize += stats.size;
        }
      });

      console.log(`   Total static assets size: ${chalk.cyan(this.formatBytes(totalSize))}`);
      console.log(`   Number of files: ${chalk.cyan(files.length)}`);

      // Показываем breakdown по типам
      Object.entries(assetTypes)
        .sort(([, a], [, b]) => b.size - a.size)
        .forEach(([ext, data]) => {
          console.log(
            `   ${ext.toUpperCase()}: ${data.count} files, ${this.formatBytes(data.size)}`,
          );
        });
    } catch (error) {
      console.log(chalk.red(`❌ Error analyzing assets: ${error}`));
    }
  }

  private analyzeDependencies(): void {
    const packagePath = join(this.webPath, 'package.json');

    if (!existsSync(packagePath)) {
      console.log(chalk.yellow('⚠️ No package.json found in web app'));
      return;
    }

    console.log(chalk.blue('\n📦 DEPENDENCIES ANALYSIS:'));

    try {
      const packageContent = JSON.parse(readFileSync(packagePath, 'utf-8'));

      const dependencies = Object.keys(packageContent.dependencies || {});
      const devDependencies = Object.keys(packageContent.devDependencies || {});

      console.log(`   Production dependencies: ${chalk.cyan(dependencies.length)}`);
      console.log(`   Development dependencies: ${chalk.cyan(devDependencies.length)}`);

      // Анализируем потенциально тяжелые зависимости
      const heavyDeps = dependencies.filter((dep) =>
        ['react', 'lodash', 'moment', 'antd', 'material-ui'].some((heavy) => dep.includes(heavy)),
      );

      if (heavyDeps.length > 0) {
        console.log(`   Potentially heavy deps: ${chalk.yellow(heavyDeps.join(', '))}`);
      }
    } catch (error) {
      console.log(chalk.red(`❌ Error analyzing dependencies: ${error}`));
    }
  }

  private evaluateHtmlOptimization(
    totalScripts: number,
    externalScripts: number,
    preloadHints: number,
  ): void {
    console.log(chalk.blue('\n🎯 HTML OPTIMIZATION EVALUATION:'));

    // Оценка количества скриптов
    if (totalScripts <= 10) {
      console.log(chalk.green('✅ Script count is optimal'));
    } else if (totalScripts <= 15) {
      console.log(chalk.yellow('🟡 Script count is acceptable'));
    } else {
      console.log(chalk.red('🔴 Too many scripts - consider bundling'));
    }

    // Оценка preload hints
    if (preloadHints >= 2) {
      console.log(chalk.green('✅ Good use of preload hints'));
    } else {
      console.log(chalk.yellow('🟡 Consider adding more preload hints'));
    }

    // Оценка external scripts
    if (externalScripts <= 5) {
      console.log(chalk.green('✅ External script count is good'));
    } else {
      console.log(chalk.yellow('🟡 Many external scripts may affect performance'));
    }
  }

  private generateOptimizationRecommendations(): void {
    console.log(chalk.blue('\n🚀 OPTIMIZATION RECOMMENDATIONS FOR SPRINT:\n'));

    const recommendations = [
      '🌳 Enable aggressive tree shaking in Vite config',
      '📦 Bundle external scripts into main application',
      '⚡ Implement code splitting for heavy components',
      '🗜️ Enable gzip/brotli compression',
      '🔄 Use dynamic imports for non-critical features',
      '📱 Optimize for mobile performance',
      '🎯 Implement lazy loading for images',
      '⚡ Use service worker for caching',
    ];

    recommendations.forEach((rec) => console.log(`   ${rec}`));

    console.log(chalk.blue('\n📈 SPRINT DAY 2 GOALS:'));
    console.log(`   🎯 Target: Reduce bundle size by 10-15%`);
    console.log(`   🌳 Focus: Tree shaking optimization`);
    console.log(`   📦 Focus: Dependencies optimization`);
    console.log(`   ⚡ Focus: Build performance`);
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Запуск анализа
async function runCurrentAnalysis() {
  const analyzer = new CurrentBundleAnalyzer();
  await analyzer.analyzeCurrentState();
}

if (require.main === module) {
  runCurrentAnalysis().catch(console.error);
}

export { CurrentBundleAnalyzer };
