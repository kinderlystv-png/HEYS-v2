// filepath: scripts/dependencies-audit.ts
// Dependencies Audit для Performance Optimization Sprint День 2

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

interface DependencyInfo {
  name: string;
  version: string;
  size: number;
  type: 'dependency' | 'devDependency';
  bundled: boolean;
}

class DependenciesAuditor {
  private workspaceRoot: string;
  private dependencies: DependencyInfo[] = [];

  constructor() {
    this.workspaceRoot = process.cwd();
  }

  /**
   * Анализирует все зависимости проекта
   */
  async auditDependencies(): Promise<void> {
    console.log(chalk.blue('🔍 DEPENDENCIES AUDIT - Performance Sprint Day 2\n'));

    // Анализируем package.json
    await this.analyzePackageJson();
    
    // Анализируем node_modules размеры
    await this.analyzeNodeModulesSizes();
    
    // Генерируем отчет
    this.generateReport();
  }

  /**
   * Анализ package.json зависимостей
   */
  private async analyzePackageJson(): Promise<void> {
    const packageJsonPath = join(this.workspaceRoot, 'package.json');
    
    if (!existsSync(packageJsonPath)) {
      console.log(chalk.red('❌ package.json not found'));
      return;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    // Обрабатываем dependencies
    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        this.dependencies.push({
          name,
          version: version as string,
          size: 0,
          type: 'dependency',
          bundled: true
        });
      }
    }

    // Обрабатываем devDependencies
    if (packageJson.devDependencies) {
      for (const [name, version] of Object.entries(packageJson.devDependencies)) {
        this.dependencies.push({
          name,
          version: version as string,
          size: 0,
          type: 'devDependency',
          bundled: false
        });
      }
    }

    console.log(chalk.green(`✅ Analyzed ${this.dependencies.length} dependencies`));
  }

  /**
   * Анализ размеров node_modules
   */
  private async analyzeNodeModulesSizes(): Promise<void> {
    console.log(chalk.blue('📦 Analyzing node_modules sizes...'));

    for (const dep of this.dependencies) {
      const depPath = join(this.workspaceRoot, 'node_modules', dep.name);
      
      if (existsSync(depPath)) {
        try {
          // Используем du команду для получения размера (Windows/Unix совместимо)
          const sizeOutput = execSync(`powershell -command "(Get-ChildItem '${depPath}' -Recurse | Measure-Object -Property Length -Sum).Sum"`, 
            { encoding: 'utf-8', stdio: 'pipe' }
          );
          dep.size = parseInt(sizeOutput.trim()) || 0;
        } catch (error) {
          // Fallback для случаев ошибок
          dep.size = 0;
        }
      }
    }

    console.log(chalk.green('✅ Node modules sizes calculated'));
  }

  /**
   * Генерация отчета с рекомендациями
   */
  private generateReport(): void {
    console.log(chalk.blue('\n📊 DEPENDENCIES AUDIT REPORT\n'));

    // Сортируем по размеру (убывание)
    const sortedDeps = this.dependencies
      .filter(dep => dep.size > 0)
      .sort((a, b) => b.size - a.size);

    // Топ-10 самых тяжелых зависимостей
    console.log(chalk.yellow('🔥 TOP 10 HEAVIEST DEPENDENCIES:\n'));
    
    const top10 = sortedDeps.slice(0, 10);
    top10.forEach((dep, index) => {
      const sizeInMB = (dep.size / 1024 / 1024).toFixed(2);
      const typeColor = dep.type === 'dependency' ? chalk.red : chalk.gray;
      const bundledIcon = dep.bundled ? '📦' : '🛠️';
      
      console.log(`${index + 1}. ${bundledIcon} ${chalk.bold(dep.name)} ${typeColor(`(${dep.type})`)} - ${chalk.cyan(sizeInMB + ' MB')}`);
    });

    // Анализ bundled dependencies
    const bundledDeps = sortedDeps.filter(dep => dep.bundled);
    const totalBundledSize = bundledDeps.reduce((sum, dep) => sum + dep.size, 0);
    
    console.log(chalk.blue(`\n📦 BUNDLED DEPENDENCIES ANALYSIS:`));
    console.log(`Total bundled size: ${chalk.cyan((totalBundledSize / 1024 / 1024).toFixed(2) + ' MB')}`);
    console.log(`Number of bundled deps: ${chalk.cyan(bundledDeps.length)}`);

    // Рекомендации по оптимизации
    this.generateOptimizationRecommendations(sortedDeps);
  }

  /**
   * Генерация рекомендаций по оптимизации
   */
  private generateOptimizationRecommendations(sortedDeps: DependencyInfo[]): void {
    console.log(chalk.blue('\n🎯 OPTIMIZATION RECOMMENDATIONS:\n'));

    const heavyBundledDeps = sortedDeps
      .filter(dep => dep.bundled && dep.size > 5 * 1024 * 1024) // > 5MB
      .slice(0, 5);

    if (heavyBundledDeps.length > 0) {
      console.log(chalk.red('🚨 CRITICAL - Heavy bundled dependencies:'));
      heavyBundledDeps.forEach(dep => {
        const sizeInMB = (dep.size / 1024 / 1024).toFixed(2);
        console.log(`   • ${dep.name} (${sizeInMB}MB) - Consider lazy loading or alternatives`);
      });
      console.log();
    }

    // Specific recommendations
    const recommendations = [
      '🌳 Configure tree shaking for unused exports',
      '📦 Use dynamic imports for heavy components',
      '🔄 Replace heavy libraries with lighter alternatives',
      '📱 Split vendor and application bundles',
      '⚡ Enable aggressive minification'
    ];

    console.log(chalk.green('💡 RECOMMENDED ACTIONS:'));
    recommendations.forEach(rec => console.log(`   ${rec}`));

    console.log(chalk.blue('\n🚀 NEXT STEPS FOR SPRINT:'));
    console.log('   1. Configure advanced tree shaking');
    console.log('   2. Implement dynamic imports');
    console.log('   3. Replace heavy dependencies');
    console.log('   4. Measure bundle size reduction');
  }
}

// Запуск аудита
async function runDependenciesAudit() {
  const auditor = new DependenciesAuditor();
  await auditor.auditDependencies();
}

if (require.main === module) {
  runDependenciesAudit().catch(console.error);
}

export { DependenciesAuditor };
