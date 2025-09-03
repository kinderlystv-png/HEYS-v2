#!/usr/bin/env node

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

async function measureBaseline() {
  console.log('🎯 PERFORMANCE OPTIMIZATION SPRINT - Baseline Measurement\n');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    // Эмуляция мобильного устройства
    await page.emulate({
      viewport: { width: 375, height: 667, deviceScaleFactor: 2 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    });
    
    console.log('📱 Measuring performance on mobile viewport...');
    
    // Навигация на страницу
    const navigationStart = Date.now();
    await page.goto('http://localhost:3001', { waitUntil: 'networkidle0' });
    const navigationEnd = Date.now();
    
    // Получение метрик производительности
    const metrics = await page.metrics();
    const navigationTime = navigationEnd - navigationStart;
    
    // Получение Core Web Vitals через Performance API
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const vitals = {};
        
        // First Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              vitals.fcp = entry.startTime;
            }
          });
        }).observe({ entryTypes: ['paint'] });
        
        // Largest Contentful Paint
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            vitals.lcp = lastEntry.startTime;
          }
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        setTimeout(() => resolve(vitals), 2000);
      });
    });
    
    const result = {
      timestamp: new Date().toISOString(),
      url: 'http://localhost:3001',
      viewport: 'mobile',
      metrics: {
        navigationTime,
        memoryUsage: Math.round(metrics.JSHeapUsedSize / 1024 / 1024),
        totalMemory: Math.round(metrics.JSHeapTotalSize / 1024 / 1024),
        fcp: webVitals.fcp || 'N/A',
        lcp: webVitals.lcp || 'N/A'
      }
    };
    
    // Сохранение результатов
    const reportsDir = path.join(process.cwd(), 'performance-reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    const reportPath = path.join(reportsDir, `baseline-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
    
    // Вывод результатов
    console.log('📊 BASELINE PERFORMANCE METRICS:\n');
    console.log(`🏃 Navigation Time: ${navigationTime}ms`);
    console.log(`🧠 Memory Usage: ${result.metrics.memoryUsage}MB / ${result.metrics.totalMemory}MB`);
    console.log(`🎨 First Contentful Paint: ${result.metrics.fcp}ms`);
    console.log(`📸 Largest Contentful Paint: ${result.metrics.lcp}ms`);
    console.log(`\n📁 Report saved to: ${reportPath}`);
    
    // Оценка производительности
    console.log('\n🎯 PERFORMANCE ASSESSMENT:');
    if (navigationTime < 1000) {
      console.log('✅ Navigation: EXCELLENT (< 1s)');
    } else if (navigationTime < 2000) {
      console.log('🟡 Navigation: GOOD (< 2s)');
    } else {
      console.log('🔴 Navigation: NEEDS_IMPROVEMENT (≥ 2s)');
    }
    
    if (result.metrics.fcp !== 'N/A' && result.metrics.fcp < 1800) {
      console.log('✅ FCP: GOOD (< 1.8s)');
    } else if (result.metrics.fcp !== 'N/A' && result.metrics.fcp < 3000) {
      console.log('🟡 FCP: NEEDS_IMPROVEMENT (< 3s)');
    } else {
      console.log('🔴 FCP: POOR (≥ 3s)');
    }
    
    console.log('\n🚀 NEXT SPRINT ACTIONS:');
    console.log('1. ⚡ Implement preload for critical resources');
    console.log('2. 🖼️  Optimize image loading and formats');  
    console.log('3. 🎨 Extract critical CSS');
    console.log('4. 📦 Configure better code splitting');
    
  } catch (error) {
    console.error('❌ Error during performance measurement:', error);
  } finally {
    await browser.close();
  }
}

measureBaseline().catch(console.error);
