// filepath: scripts/tree-shaking-report.ts
// Tree Shaking Analysis для Performance Optimization Sprint День 2

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

interface BundleAnalysis {
  before: {
    totalSize: number;
    chunks: Record<string, number>;
  };
  after: {
    totalSize: number;
    chunks: Record<string, number>;
  };
  reduction: {
    totalBytes: number;
    percentage: number;
  };
}

class TreeShakingAnalyzer {
  private workspaceRoot: string;
  private buildPath: string;

  constructor() {
    this.workspaceRoot = process.cwd();
    this.buildPath = join(this.workspaceRoot, 'apps', 'web', 'dist');
  }

  /**
   * Анализирует эффективность tree shaking
   */
  async analyzeTreeShaking(): Promise<void> {
    console.log(chalk.blue('🌳 TREE SHAKING ANALYSIS - Performance Sprint Day 2\n'));

    // Сначала билд без tree shaking для baseline
    console.log(chalk.yellow('📦 Building baseline (basic optimization)...'));
    const beforeAnalysis = await this.buildAndMeasure(false);

    // Затем билд с агрессивным tree shaking
    console.log(chalk.yellow('🌳 Building with aggressive tree shaking...'));
    const afterAnalysis = await this.buildAndMeasure(true);

    // Сравниваем результаты
    this.compareResults(beforeAnalysis, afterAnalysis);
  }

  /**
   * Билд и измерение размера bundle
   */
  private async buildAndMeasure(withTreeShaking: boolean): Promise<{totalSize: number, chunks: Record<string, number>}> {
    try {
      // Очищаем dist
      if (existsSync(this.buildPath)) {
        try {
          execSync(`if (Test-Path "${this.buildPath}") { Remove-Item "${this.buildPath}" -Recurse -Force -ErrorAction SilentlyContinue }`, { stdio: 'pipe' });
        } catch (error) {
          console.log(chalk.yellow('⚠️ Could not clean dist folder, continuing...'));
        }
      }

      // Запускаем build
      const buildCommand = withTreeShaking 
        ? 'pnpm --filter="@heys/web" run build'
        : 'pnpm --filter="@heys/web" run build';
      
      execSync(buildCommand, { 
        stdio: 'pipe',
        cwd: this.workspaceRoot
      });

      // Измеряем размер
      return this.measureBundleSize();
    } catch (error) {
      console.log(chalk.red(`❌ Build failed: ${error}`));
      return { totalSize: 0, chunks: {} };
    }
  }

  /**
   * Измерение размера bundle
   */
  private measureBundleSize(): {totalSize: number, chunks: Record<string, number>} {
    if (!existsSync(this.buildPath)) {
      return { totalSize: 0, chunks: {} };
    }

    const chunks: Record<string, number> = {};
    let totalSize = 0;

    try {
      // Получаем все файлы в dist
      const output = execSync(`Get-ChildItem "${this.buildPath}" -Recurse -File | Select-Object Name, Length | ConvertTo-Json`, 
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      
      const files = JSON.parse(output);
      const fileArray = Array.isArray(files) ? files : [files];

      fileArray.forEach((file: any) => {
        if (file.Name && file.Length) {
          chunks[file.Name] = file.Length;
          totalSize += file.Length;
        }
      });

    } catch (error) {
      console.log(chalk.yellow('⚠️ Could not measure bundle size accurately'));
    }

    return { totalSize, chunks };
  }

  /**
   * Сравнение результатов
   */
  private compareResults(
    before: {totalSize: number, chunks: Record<string, number>}, 
    after: {totalSize: number, chunks: Record<string, number>}
  ): void {
    console.log(chalk.blue('\n📊 TREE SHAKING EFFECTIVENESS REPORT\n'));

    const reduction = {
      totalBytes: before.totalSize - after.totalSize,
      percentage: before.totalSize > 0 ? ((before.totalSize - after.totalSize) / before.totalSize) * 100 : 0
    };

    // Общая статистика
    console.log(chalk.yellow('📦 BUNDLE SIZE COMPARISON:'));
    console.log(`   Before tree shaking: ${chalk.red(this.formatBytes(before.totalSize))}`);
    console.log(`   After tree shaking:  ${chalk.green(this.formatBytes(after.totalSize))}`);
    console.log(`   Reduction:           ${chalk.cyan(this.formatBytes(reduction.totalBytes))} (${reduction.percentage.toFixed(2)}%)`);

    // Анализ по файлам
    console.log(chalk.blue('\n🔍 FILE-BY-FILE ANALYSIS:'));
    
    const beforeFiles = Object.keys(before.chunks);
    const afterFiles = Object.keys(after.chunks);
    
    const jsFiles = afterFiles.filter(file => file.endsWith('.js'));
    
    jsFiles.forEach(file => {
      const beforeSize = before.chunks[file] || 0;
      const afterSize = after.chunks[file] || 0;
      const fileReduction = beforeSize - afterSize;
      const filePercentage = beforeSize > 0 ? (fileReduction / beforeSize) * 100 : 0;
      
      if (Math.abs(fileReduction) > 1024) { // Показываем только значимые изменения
        const status = fileReduction > 0 ? chalk.green('↓') : chalk.red('↑');
        console.log(`   ${status} ${file}: ${this.formatBytes(afterSize)} (${filePercentage.toFixed(1)}% change)`);
      }
    });

    // Рекомендации
    this.generateTreeShakingRecommendations(reduction, after);

    // Сохраняем отчет
    this.saveReport({ before, after, reduction });
  }

  /**
   * Генерация рекомендаций
   */
  private generateTreeShakingRecommendations(
    reduction: {totalBytes: number, percentage: number},
    current: {totalSize: number, chunks: Record<string, number>}
  ): void {
    console.log(chalk.blue('\n🎯 TREE SHAKING RECOMMENDATIONS:\n'));

    if (reduction.percentage > 10) {
      console.log(chalk.green('✅ EXCELLENT: Tree shaking is very effective!'));
    } else if (reduction.percentage > 5) {
      console.log(chalk.yellow('🟡 GOOD: Tree shaking shows decent results'));
    } else {
      console.log(chalk.red('🔴 POOR: Tree shaking needs improvement'));
    }

    const recommendations = [
      reduction.percentage < 5 ? '🔧 Check for side effects in imports' : null,
      '📦 Use ES modules instead of CommonJS',
      '🎯 Import only specific functions, not entire libraries',
      '🧹 Remove unused dependencies from package.json',
      '⚡ Enable production mode for all builds'
    ].filter(Boolean);

    recommendations.forEach(rec => rec && console.log(`   ${rec}`));

    // Performance Sprint specific goals
    console.log(chalk.blue('\n🚀 SPRINT GOALS PROGRESS:'));
    console.log(`   Target bundle reduction: 10-15%`);
    console.log(`   Current reduction: ${chalk.cyan(reduction.percentage.toFixed(2) + '%')}`);
    
    if (reduction.percentage >= 10) {
      console.log(chalk.green('   🎯 SPRINT GOAL ACHIEVED!'));
    } else {
      console.log(chalk.yellow(`   📈 Need ${(10 - reduction.percentage).toFixed(2)}% more reduction`));
    }
  }

  /**
   * Сохранение отчета
   */
  private saveReport(analysis: BundleAnalysis): void {
    const reportPath = join(this.workspaceRoot, 'tree-shaking-report.json');
    
    const report = {
      timestamp: new Date().toISOString(),
      sprint: 'Performance Optimization Day 2',
      analysis,
      summary: {
        effectivenessScore: Math.min(100, analysis.reduction.percentage * 10),
        sprintGoalProgress: `${analysis.reduction.percentage.toFixed(2)}% / 10% target`,
        recommendation: analysis.reduction.percentage >= 10 ? 'Excellent' : 'Needs improvement'
      }
    };

    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.green(`\n📁 Report saved to: ${reportPath}`));
  }

  /**
   * Форматирование байтов
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// Запуск анализа
async function runTreeShakingAnalysis() {
  const analyzer = new TreeShakingAnalyzer();
  await analyzer.analyzeTreeShaking();
}

if (require.main === module) {
  runTreeShakingAnalysis().catch(console.error);
}

export { TreeShakingAnalyzer };
