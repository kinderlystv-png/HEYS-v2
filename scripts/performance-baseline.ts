// filepath: scripts/performance-baseline.ts
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import chalk from 'chalk';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface PerformanceMetrics {
  timestamp: string;
  url: string;
  scores: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals: {
    fcp: number; // First Contentful Paint
    lcp: number; // Largest Contentful Paint
    cls: number; // Cumulative Layout Shift
    fid: number; // First Input Delay
    ttfb: number; // Time to First Byte
    tti: number; // Time to Interactive
  };
  bundleMetrics: {
    totalTransferSize: number;
    totalResourceSize: number;
    numberOfRequests: number;
    numberOfHosts: number;
  };
  recommendations: string[];
}

/**
 * Performance Baseline Measurement для Performance Optimization Sprint
 * Измеряет текущие метрики производительности для установки baseline
 */
export class PerformanceBaselineMeasurement {
  private outputDir = 'performance-baseline';
  
  constructor() {
    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Измерить производительность для заданного URL
   */
  async measurePerformance(url: string): Promise<PerformanceMetrics> {
    console.log(chalk.blue(`🚀 Measuring performance for: ${url}`));
    
    // Запускаем Chrome
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
      // Настройки Lighthouse
      const options = {
        logLevel: 'info' as const,
        output: 'json' as const,
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        port: chrome.port,
      };

      // Запускаем Lighthouse
      const runnerResult = await lighthouse(url, options);
      
      if (!runnerResult) {
        throw new Error('Lighthouse failed to generate report');
      }

      // Извлекаем метрики
      const lhr = runnerResult.lhr;
      const metrics = this.extractMetrics(lhr, url);

      console.log(chalk.green('✅ Performance measurement completed'));
      return metrics;

    } finally {
      await chrome.kill();
    }
  }

  /**
   * Извлечь метрики из отчета Lighthouse
   */
  private extractMetrics(lhr: any, url: string): PerformanceMetrics {
    const scores = {
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
    };

    // Core Web Vitals
    const audits = lhr.audits;
    const coreWebVitals = {
      fcp: audits['first-contentful-paint']?.numericValue || 0,
      lcp: audits['largest-contentful-paint']?.numericValue || 0,
      cls: audits['cumulative-layout-shift']?.numericValue || 0,
      fid: audits['max-potential-fid']?.numericValue || 0, // Approximation
      ttfb: audits['server-response-time']?.numericValue || 0,
      tti: audits['interactive']?.numericValue || 0,
    };

    // Bundle metrics
    const bundleMetrics = {
      totalTransferSize: audits['total-byte-weight']?.numericValue || 0,
      totalResourceSize: audits['unminified-javascript']?.details?.overallSavingsBytes || 0,
      numberOfRequests: audits['network-requests']?.details?.items?.length || 0,
      numberOfHosts: this.countUniqueHosts(audits['network-requests']?.details?.items || []),
    };

    // Генерируем рекомендации
    const recommendations = this.generateRecommendations(scores, coreWebVitals, bundleMetrics);

    return {
      timestamp: new Date().toISOString(),
      url,
      scores,
      coreWebVitals,
      bundleMetrics,
      recommendations,
    };
  }

  /**
   * Подсчитать уникальные хосты
   */
  private countUniqueHosts(networkItems: any[]): number {
    const hosts = new Set();
    networkItems.forEach(item => {
      if (item.url) {
        try {
          const url = new URL(item.url);
          hosts.add(url.hostname);
        } catch (error) {
          // Ignore invalid URLs
        }
      }
    });
    return hosts.size;
  }

  /**
   * Генерировать рекомендации на основе метрик
   */
  private generateRecommendations(
    scores: PerformanceMetrics['scores'],
    vitals: PerformanceMetrics['coreWebVitals'],
    bundle: PerformanceMetrics['bundleMetrics']
  ): string[] {
    const recommendations: string[] = [];

    // Performance Score рекомендации
    if (scores.performance < 90) {
      recommendations.push('🎯 Performance score needs improvement (target: 90+)');
    }

    // Core Web Vitals рекомендации
    if (vitals.fcp > 1800) {
      recommendations.push('⚡ First Contentful Paint > 1.8s - optimize critical rendering path');
    }

    if (vitals.lcp > 2500) {
      recommendations.push('🖼️ Largest Contentful Paint > 2.5s - optimize largest content element');
    }

    if (vitals.cls > 0.1) {
      recommendations.push('📐 Cumulative Layout Shift > 0.1 - stabilize layout elements');
    }

    if (vitals.tti > 3800) {
      recommendations.push('⏱️ Time to Interactive > 3.8s - reduce main thread work');
    }

    // Bundle size рекомендации
    if (bundle.totalTransferSize > 2 * 1024 * 1024) {
      recommendations.push('📦 Total transfer size > 2MB - implement code splitting');
    }

    if (bundle.numberOfRequests > 50) {
      recommendations.push('🌐 Too many network requests (>50) - bundle resources');
    }

    if (bundle.numberOfHosts > 10) {
      recommendations.push('🔗 Too many third-party hosts (>10) - reduce external dependencies');
    }

    return recommendations;
  }

  /**
   * Сохранить baseline метрики
   */
  async saveBaseline(metrics: PerformanceMetrics) {
    const baselinePath = join(this.outputDir, 'baseline.json');
    writeFileSync(baselinePath, JSON.stringify(metrics, null, 2));

    // Создаем человекочитаемый отчет
    const report = this.generateBaselineReport(metrics);
    const reportPath = join(this.outputDir, 'baseline-report.md');
    writeFileSync(reportPath, report);

    console.log(chalk.green(`✅ Baseline saved to ${this.outputDir}/`));
  }

  /**
   * Генерировать отчет baseline
   */
  private generateBaselineReport(metrics: PerformanceMetrics): string {
    return `# Performance Baseline Report

**Date**: ${new Date(metrics.timestamp).toLocaleString()}
**URL**: ${metrics.url}

## 📊 Lighthouse Scores
- **Performance**: ${metrics.scores.performance}/100
- **Accessibility**: ${metrics.scores.accessibility}/100  
- **Best Practices**: ${metrics.scores.bestPractices}/100
- **SEO**: ${metrics.scores.seo}/100

## ⚡ Core Web Vitals
- **First Contentful Paint (FCP)**: ${(metrics.coreWebVitals.fcp / 1000).toFixed(2)}s
- **Largest Contentful Paint (LCP)**: ${(metrics.coreWebVitals.lcp / 1000).toFixed(2)}s
- **Cumulative Layout Shift (CLS)**: ${metrics.coreWebVitals.cls.toFixed(3)}
- **Time to Interactive (TTI)**: ${(metrics.coreWebVitals.tti / 1000).toFixed(2)}s
- **Time to First Byte (TTFB)**: ${metrics.coreWebVitals.ttfb}ms

## 📦 Bundle Metrics
- **Total Transfer Size**: ${(metrics.bundleMetrics.totalTransferSize / 1024 / 1024).toFixed(2)} MB
- **Number of Requests**: ${metrics.bundleMetrics.numberOfRequests}
- **Number of Hosts**: ${metrics.bundleMetrics.numberOfHosts}

## 💡 Recommendations
${metrics.recommendations.map(rec => `- ${rec}`).join('\n')}

## 🎯 Sprint Goals
Based on this baseline, the Performance Optimization Sprint should focus on:

1. **Improve Performance Score**: ${metrics.scores.performance} → 92+
2. **Optimize Core Web Vitals**: 
   - FCP: ${(metrics.coreWebVitals.fcp / 1000).toFixed(2)}s → <1.8s
   - LCP: ${(metrics.coreWebVitals.lcp / 1000).toFixed(2)}s → <2.5s
   - CLS: ${metrics.coreWebVitals.cls.toFixed(3)} → <0.1
3. **Reduce Bundle Size**: Current transfer size → -10% target
`;
  }

  /**
   * Вывести результаты в консоль
   */
  printResults(metrics: PerformanceMetrics) {
    console.log(chalk.blue.bold('\n📊 PERFORMANCE BASELINE RESULTS\n'));

    // Lighthouse Scores
    console.log(chalk.blue('🎯 Lighthouse Scores:'));
    console.log(chalk.cyan(`   Performance: ${metrics.scores.performance}/100`));
    console.log(chalk.cyan(`   Accessibility: ${metrics.scores.accessibility}/100`));
    console.log(chalk.cyan(`   Best Practices: ${metrics.scores.bestPractices}/100`));
    console.log(chalk.cyan(`   SEO: ${metrics.scores.seo}/100`));

    // Core Web Vitals
    console.log(chalk.blue('\n⚡ Core Web Vitals:'));
    console.log(chalk.yellow(`   FCP: ${(metrics.coreWebVitals.fcp / 1000).toFixed(2)}s`));
    console.log(chalk.yellow(`   LCP: ${(metrics.coreWebVitals.lcp / 1000).toFixed(2)}s`));
    console.log(chalk.yellow(`   CLS: ${metrics.coreWebVitals.cls.toFixed(3)}`));
    console.log(chalk.yellow(`   TTI: ${(metrics.coreWebVitals.tti / 1000).toFixed(2)}s`));

    // Bundle Info
    console.log(chalk.blue('\n📦 Bundle Info:'));
    console.log(chalk.gray(`   Transfer Size: ${(metrics.bundleMetrics.totalTransferSize / 1024 / 1024).toFixed(2)} MB`));
    console.log(chalk.gray(`   Requests: ${metrics.bundleMetrics.numberOfRequests}`));
    console.log(chalk.gray(`   Hosts: ${metrics.bundleMetrics.numberOfHosts}`));

    // Recommendations
    console.log(chalk.blue('\n💡 Key Recommendations:'));
    metrics.recommendations.slice(0, 5).forEach(rec => {
      console.log(chalk.yellow(`   ${rec}`));
    });
  }
}

// CLI использование
if (require.main === module) {
  const baseline = new PerformanceBaselineMeasurement();
  
  // URL для тестирования (можно передать как аргумент)
  const testUrl = process.argv[2] || 'http://localhost:3001';
  
  baseline.measurePerformance(testUrl)
    .then(metrics => {
      baseline.printResults(metrics);
      return baseline.saveBaseline(metrics);
    })
    .then(() => {
      console.log(chalk.green('\n✅ Baseline measurement complete!'));
      console.log(chalk.gray('Next: Run bundle analysis with `npm run analyze:bundle`'));
    })
    .catch(error => {
      console.error(chalk.red('❌ Baseline measurement failed:'), error);
      process.exit(1);
    });
}
