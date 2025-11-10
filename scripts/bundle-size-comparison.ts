// filepath: scripts/bundle-size-comparison.ts
// Simplified Bundle Size Analysis для Performance Sprint

import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

class SimpleBundleAnalyzer {
  private workspaceRoot: string;
  private buildPath: string;

  constructor() {
    this.workspaceRoot = process.cwd();
    this.buildPath = join(this.workspaceRoot, 'apps', 'web', 'dist');
  }

  async analyzeBundleSize(): Promise<void> {
    console.log(chalk.blue('📦 BUNDLE SIZE ANALYSIS - Performance Sprint Day 2\n'));

    // Проверяем текущий build
    if (!existsSync(this.buildPath)) {
      console.log(chalk.yellow('🔨 No existing build found, creating one...'));
      await this.createBuild();
    }

    // Анализируем размер
    const bundleInfo = this.analyzeBuild();
    this.reportResults(bundleInfo);
  }

  private async createBuild(): Promise<void> {
    try {
      console.log(chalk.yellow('⚡ Building web app...'));
      execSync('pnpm --filter="@heys/web" run build', {
        stdio: 'inherit',
        cwd: this.workspaceRoot,
      });
    } catch (error) {
      console.log(chalk.red('❌ Build failed, analyzing existing files...'));
    }
  }

  private analyzeBuild(): any {
    if (!existsSync(this.buildPath)) {
      console.log(chalk.red('❌ No build directory found'));
      return null;
    }

    try {
      // Анализ assets folder
      const assetsPath = join(this.buildPath, 'assets');

      if (existsSync(assetsPath)) {
        const files = execSync(
          `Get-ChildItem "${assetsPath}" -File | ForEach-Object { "$($_.Name),$($_.Length)" }`,
          { encoding: 'utf-8' },
        )
          .split('\n')
          .filter(Boolean);

        const jsFiles: Array<{ name: string; size: number }> = [];
        const cssFiles: Array<{ name: string; size: number }> = [];
        let totalSize = 0;

        files.forEach((line) => {
          const [name, size] = line.trim().split(',');
          const sizeNum = parseInt(size) || 0;
          totalSize += sizeNum;

          if (name?.endsWith('.js')) {
            jsFiles.push({ name, size: sizeNum });
          } else if (name?.endsWith('.css')) {
            cssFiles.push({ name, size: sizeNum });
          }
        });

        return {
          totalSize,
          jsFiles: jsFiles.sort((a, b) => b.size - a.size),
          cssFiles: cssFiles.sort((a, b) => b.size - a.size),
          fileCount: files.length,
        };
      }
    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not analyze build directory'));
    }

    return null;
  }

  private reportResults(bundleInfo: any): void {
    if (!bundleInfo) {
      console.log(chalk.red('❌ No bundle information available'));
      return;
    }

    console.log(chalk.blue('\n📊 CURRENT BUNDLE ANALYSIS\n'));

    // Общая статистика
    console.log(chalk.yellow('📦 BUNDLE OVERVIEW:'));
    console.log(`   Total bundle size: ${chalk.cyan(this.formatBytes(bundleInfo.totalSize))}`);
    console.log(`   Number of files: ${chalk.cyan(bundleInfo.fileCount)}`);
    console.log(`   JavaScript files: ${chalk.cyan(bundleInfo.jsFiles.length)}`);
    console.log(`   CSS files: ${chalk.cyan(bundleInfo.cssFiles.length)}`);

    // JavaScript файлы
    if (bundleInfo.jsFiles.length > 0) {
      console.log(chalk.blue('\n🟨 JAVASCRIPT BUNDLES:'));
      bundleInfo.jsFiles.forEach((file: any, index: number) => {
        const icon = index === 0 ? '🎯' : '📄';
        console.log(`   ${icon} ${file.name}: ${chalk.cyan(this.formatBytes(file.size))}`);
      });
    }

    // CSS файлы
    if (bundleInfo.cssFiles.length > 0) {
      console.log(chalk.blue('\n🎨 CSS BUNDLES:'));
      bundleInfo.cssFiles.forEach((file: any) => {
        console.log(`   🎨 ${file.name}: ${chalk.cyan(this.formatBytes(file.size))}`);
      });
    }

    // Оценка и рекомендации
    this.evaluateBundle(bundleInfo);
  }

  private evaluateBundle(bundleInfo: any): void {
    const totalKB = bundleInfo.totalSize / 1024;

    console.log(chalk.blue('\n🎯 PERFORMANCE EVALUATION:\n'));

    // Оценка размера bundle
    if (totalKB < 50) {
      console.log(chalk.green('✅ EXCELLENT: Bundle size is optimal!'));
    } else if (totalKB < 100) {
      console.log(chalk.yellow('🟡 GOOD: Bundle size is acceptable'));
    } else if (totalKB < 200) {
      console.log(chalk.yellow('🟠 WARNING: Bundle size could be reduced'));
    } else {
      console.log(chalk.red('🔴 CRITICAL: Bundle size needs optimization'));
    }

    console.log(`   Current size: ${chalk.cyan(this.formatBytes(bundleInfo.totalSize))}`);
    console.log(`   Recommended: ${chalk.green('< 100 KB')}`);

    // Анализ крупных файлов
    const largeJsFiles = bundleInfo.jsFiles.filter((f: any) => f.size > 30 * 1024);
    if (largeJsFiles.length > 0) {
      console.log(chalk.yellow('\n⚠️ LARGE FILES DETECTED:'));
      largeJsFiles.forEach((file: any) => {
        console.log(`   📦 ${file.name}: ${this.formatBytes(file.size)} - Consider code splitting`);
      });
    }

    // Рекомендации для спринта
    console.log(chalk.blue('\n🚀 SPRINT OPTIMIZATION OPPORTUNITIES:\n'));

    const recommendations = [
      totalKB > 100 ? '📦 Implement code splitting for large bundles' : null,
      bundleInfo.jsFiles.length > 3 ? '🔄 Merge small chunks to reduce HTTP requests' : null,
      '🌳 Enable aggressive tree shaking',
      '⚡ Use dynamic imports for non-critical code',
      '🗜️ Enable gzip/brotli compression',
      '📱 Implement progressive loading',
    ].filter(Boolean);

    recommendations.forEach((rec) => rec && console.log(`   ${rec}`));

    // Sprint goals progress
    console.log(chalk.blue('\n📈 SPRINT PROGRESS:'));
    console.log(`   Bundle size goal: ${chalk.green('< 50 KB')}`);
    console.log(
      `   Current status: ${totalKB > 50 ? chalk.red('Needs optimization') : chalk.green('Goal achieved!')}`,
    );
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Запуск
async function runBundleAnalysis() {
  const analyzer = new SimpleBundleAnalyzer();
  await analyzer.analyzeBundleSize();
}

if (require.main === module) {
  runBundleAnalysis().catch(console.error);
}

export { SimpleBundleAnalyzer };
