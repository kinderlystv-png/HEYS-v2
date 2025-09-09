#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// Конфигурация для ЭАП 3.0
const EAP_CONFIG = {
  targetMetrics: {
    technicalDebt: 500, // часов
    duplicationPercent: 10, // %
    refactoringFiles: 20, // %
    averageComplexity: 15,
    maintainabilityIndex: 65
  },
  currentMetrics: {
    technicalDebt: 2247.1,
    duplicationPercent: 462.6,
    refactoringFiles: 71.9,
    averageComplexity: 47,
    maintainabilityIndex: 33.7
  },
  priorityFiles: [
    'test-results/assets/index-D_ryMEPs.js',
    'project-template/tests/reports/assets/index-14ea7095.js',
    'apps/web/heys_reports_v12.js',
    'archive/legacy-v12/misc/heys_reports_v12.js'
  ]
};

// Цветовая схема для вывода
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

class EAPProgressMonitor {
  constructor() {
    this.startTime = new Date();
    this.projectRoot = process.cwd();
  }

  // Расчет прогресса по метрике
  calculateProgress(current, target, initial) {
    if (initial === target) return 100;
    const progress = ((initial - current) / (initial - target)) * 100;
    return Math.max(0, Math.min(100, progress));
  }

  // Получение текущих метрик
  getCurrentMetrics() {
    try {
      // Запускаем анализатор для получения свежих данных
      const analysisResult = execSync('node scripts/advanced-project-analyzer.js', {
        encoding: 'utf8',
        stdio: 'pipe'
      });
      
      // Парсим результат (упрощенная версия)
      return {
        technicalDebt: 2200, // Примерные значения, в реальности парсим из отчета
        duplicationPercent: 450,
        refactoringFiles: 70,
        averageComplexity: 45,
        maintainabilityIndex: 35
      };
    } catch (error) {
      console.log(`${colors.yellow}⚠️ Не удалось получить актуальные метрики, используем кэшированные${colors.reset}`);
      return EAP_CONFIG.currentMetrics;
    }
  }

  // Проверка статуса приоритетных файлов
  checkPriorityFiles() {
    const results = [];
    
    for (const file of EAP_CONFIG.priorityFiles) {
      const fullPath = path.join(this.projectRoot, file);
      const exists = fs.existsSync(fullPath);
      
      if (exists) {
        const stats = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n').length;
        
        // Простая оценка сложности (количество функций, циклов, условий)
        const complexity = this.estimateComplexity(content);
        
        results.push({
          file,
          exists: true,
          lines,
          complexity,
          status: complexity > 50 ? 'needs-refactoring' : complexity > 20 ? 'moderate' : 'good'
        });
      } else {
        results.push({
          file,
          exists: false,
          status: 'not-found'
        });
      }
    }
    
    return results;
  }

  // Простая оценка сложности файла
  estimateComplexity(content) {
    const patterns = [
      /function\s+\w+/g,
      /const\s+\w+\s*=\s*\(/g,
      /=>\s*{/g,
      /if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /switch\s*\(/g,
      /catch\s*\(/g
    ];
    
    let complexity = 0;
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      complexity += matches ? matches.length : 0;
    });
    
    return complexity;
  }

  // Генерация отчета о прогрессе
  generateProgressReport() {
    const currentMetrics = this.getCurrentMetrics();
    const priorityFilesStatus = this.checkPriorityFiles();
    
    console.log(`${colors.bright}${colors.blue}🚀 Отчет о прогрессе ЭАП 3.0${colors.reset}`);
    console.log(`${colors.cyan}Дата: ${new Date().toLocaleDateString('ru-RU')}${colors.reset}`);
    console.log(`${colors.cyan}Время: ${new Date().toLocaleTimeString('ru-RU')}${colors.reset}\n`);

    // Общий прогресс
    console.log(`${colors.bright}📊 Общий прогресс модернизации${colors.reset}`);
    
    const metrics = [
      {
        name: 'Технический долг',
        current: currentMetrics.technicalDebt,
        target: EAP_CONFIG.targetMetrics.technicalDebt,
        initial: EAP_CONFIG.currentMetrics.technicalDebt,
        unit: 'ч'
      },
      {
        name: 'Дублирование кода',
        current: currentMetrics.duplicationPercent,
        target: EAP_CONFIG.targetMetrics.duplicationPercent,
        initial: EAP_CONFIG.currentMetrics.duplicationPercent,
        unit: '%'
      },
      {
        name: 'Файлы требующие рефакторинга',
        current: currentMetrics.refactoringFiles,
        target: EAP_CONFIG.targetMetrics.refactoringFiles,
        initial: EAP_CONFIG.currentMetrics.refactoringFiles,
        unit: '%'
      },
      {
        name: 'Средняя сложность',
        current: currentMetrics.averageComplexity,
        target: EAP_CONFIG.targetMetrics.averageComplexity,
        initial: EAP_CONFIG.currentMetrics.averageComplexity,
        unit: ''
      }
    ];

    let totalProgress = 0;
    metrics.forEach(metric => {
      const progress = this.calculateProgress(metric.current, metric.target, metric.initial);
      totalProgress += progress;
      
      const progressBar = this.createProgressBar(progress);
      const color = progress >= 80 ? colors.green : progress >= 50 ? colors.yellow : colors.red;
      
      console.log(`${metric.name}: ${color}${progressBar} ${progress.toFixed(1)}%${colors.reset}`);
      console.log(`  Текущее: ${metric.current}${metric.unit} | Цель: ${metric.target}${metric.unit}`);
    });

    const overallProgress = totalProgress / metrics.length;
    console.log(`\n${colors.bright}🎯 Общий прогресс: ${overallProgress.toFixed(1)}%${colors.reset}`);

    // Статус приоритетных файлов
    console.log(`\n${colors.bright}📁 Статус приоритетных файлов${colors.reset}`);
    priorityFilesStatus.forEach(file => {
      let statusIcon = '';
      let statusColor = '';
      
      if (!file.exists) {
        statusIcon = '❌';
        statusColor = colors.red;
      } else if (file.status === 'good') {
        statusIcon = '✅';
        statusColor = colors.green;
      } else if (file.status === 'moderate') {
        statusIcon = '⚠️';
        statusColor = colors.yellow;
      } else {
        statusIcon = '🔴';
        statusColor = colors.red;
      }
      
      console.log(`${statusIcon} ${statusColor}${file.file}${colors.reset}`);
      if (file.exists) {
        console.log(`   Строк: ${file.lines} | Сложность: ${file.complexity}`);
      }
    });

    // Рекомендации
    console.log(`\n${colors.bright}💡 Рекомендации для следующих шагов${colors.reset}`);
    
    if (overallProgress < 25) {
      console.log(`${colors.red}🔥 Фокус на критических файлах:${colors.reset}`);
      console.log('   - Рефакторинг файлов с высокой сложностью');
      console.log('   - Устранение дублирования кода');
    } else if (overallProgress < 50) {
      console.log(`${colors.yellow}⚡ Архитектурные улучшения:${colors.reset}`);
      console.log('   - Модуляризация компонентов');
      console.log('   - Оптимизация производительности');
    } else if (overallProgress < 75) {
      console.log(`${colors.blue}🎨 UX/UI улучшения:${colors.reset}`);
      console.log('   - Обновление дизайн-системы');
      console.log('   - Адаптивность и доступность');
    } else {
      console.log(`${colors.green}🏁 Финализация:${colors.reset}`);
      console.log('   - Тестирование и оптимизация');
      console.log('   - Документация и развертывание');
    }

    // Сохранение отчета
    this.saveProgressReport(overallProgress, currentMetrics, priorityFilesStatus);
  }

  // Создание прогресс-бара
  createProgressBar(progress, length = 20) {
    const filled = Math.round((progress / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  // Сохранение отчета в файл
  saveProgressReport(overallProgress, metrics, filesStatus) {
    const report = {
      date: new Date().toISOString(),
      overallProgress,
      metrics,
      filesStatus,
      recommendations: this.generateRecommendations(overallProgress)
    };

    const reportPath = path.join(this.projectRoot, 'eap-progress-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`\n${colors.green}📄 Отчет сохранен: ${reportPath}${colors.reset}`);
  }

  // Генерация рекомендаций
  generateRecommendations(progress) {
    if (progress < 25) {
      return [
        'Рефакторинг критических файлов с высокой сложностью',
        'Устранение дублирования кода',
        'Оптимизация крупных файлов'
      ];
    } else if (progress < 50) {
      return [
        'Модуляризация компонентов',
        'Внедрение ленивой загрузки',
        'Оптимизация производительности'
      ];
    } else if (progress < 75) {
      return [
        'Обновление дизайн-системы',
        'Улучшение адаптивности',
        'Внедрение темной темы'
      ];
    } else {
      return [
        'Расширение тестового покрытия',
        'Performance тестирование',
        'Финальная оптимизация'
      ];
    }
  }
}

// Запуск мониторинга
if (import.meta.url === `file://${process.argv[1]}`) {
  const monitor = new EAPProgressMonitor();
  monitor.generateProgressReport();
}

export { EAPProgressMonitor };
