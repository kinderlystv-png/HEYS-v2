#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function measureProduction() {
  console.log('🏭 PRODUCTION BUILD PERFORMANCE MEASUREMENT\n');
  
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
    
    console.log('📱 Measuring production build performance...');
    
    // Сначала попробуем локальный production server
    let targetUrl = 'http://localhost:8080';
    let navigationTime, metrics;
    
    try {
      const navigationStart = Date.now();
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 10000 });
      navigationTime = Date.now() - navigationStart;
      metrics = await page.metrics();
      console.log(`✅ Production build (localhost:8080): ${navigationTime}ms`);
    } catch (error) {
      console.log(`⚠️ Production server not available, testing dev server...`);
      targetUrl = 'http://localhost:3001';
      const navigationStart = Date.now();
      await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 15000 });
      navigationTime = Date.now() - navigationStart;
      metrics = await page.metrics();
      console.log(`✅ Dev server (localhost:3001): ${navigationTime}ms`);
    }
    
    // Получение Core Web Vitals
    const webVitals = await page.evaluate(() => {
      return new Promise((resolve) => {
        const vitals = {};
        
        // First Contentful Paint
        const observer1 = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              vitals.fcp = Math.round(entry.startTime);
            }
          });
        });
        observer1.observe({ entryTypes: ['paint'] });
        
        // Largest Contentful Paint
        const observer2 = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            vitals.lcp = Math.round(lastEntry.startTime);
          }
        });
        observer2.observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Layout Shift
        let clsValue = 0;
        const observer3 = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          }
          vitals.cls = Math.round(clsValue * 1000) / 1000;
        });
        observer3.observe({ entryTypes: ['layout-shift'] });
        
        setTimeout(() => resolve(vitals), 3000);
      });
    });
    
    const result = {
      timestamp: new Date().toISOString(),
      url: targetUrl,
      buildType: targetUrl.includes('8080') ? 'production' : 'development',
      metrics: {
        navigationTime,
        memoryUsage: Math.round(metrics.JSHeapUsedSize / 1024 / 1024),
        totalMemory: Math.round(metrics.JSHeapTotalSize / 1024 / 1024),
        fcp: webVitals.fcp || 'N/A',
        lcp: webVitals.lcp || 'N/A',
        cls: webVitals.cls || 'N/A'
      }
    };
    
    // Вывод результатов
    console.log('\n📊 PERFORMANCE METRICS:\n');
    console.log(`🏗️  Build Type: ${result.buildType.toUpperCase()}`);
    console.log(`🏃 Navigation Time: ${navigationTime}ms`);
    console.log(`🧠 Memory Usage: ${result.metrics.memoryUsage}MB / ${result.metrics.totalMemory}MB`);
    console.log(`🎨 First Contentful Paint: ${result.metrics.fcp}ms`);
    console.log(`📸 Largest Contentful Paint: ${result.metrics.lcp}ms`);
    console.log(`📐 Cumulative Layout Shift: ${result.metrics.cls}`);
    
    // Performance scoring
    console.log('\n🎯 PERFORMANCE SCORING:');
    
    // Navigation Time scoring
    if (navigationTime < 1000) {
      console.log('✅ Navigation: EXCELLENT (< 1s)');
    } else if (navigationTime < 2000) {
      console.log('🟡 Navigation: GOOD (< 2s)');
    } else {
      console.log('🔴 Navigation: NEEDS_IMPROVEMENT (≥ 2s)');
    }
    
    // FCP scoring
    if (result.metrics.fcp !== 'N/A') {
      if (result.metrics.fcp < 1800) {
        console.log('✅ FCP: GOOD (< 1.8s)');
      } else if (result.metrics.fcp < 3000) {
        console.log('🟡 FCP: NEEDS_IMPROVEMENT (< 3s)');
      } else {
        console.log('🔴 FCP: POOR (≥ 3s)');
      }
    } else {
      console.log('⚠️ FCP: Could not measure');
    }
    
    // LCP scoring  
    if (result.metrics.lcp !== 'N/A') {
      if (result.metrics.lcp < 2500) {
        console.log('✅ LCP: GOOD (< 2.5s)');
      } else if (result.metrics.lcp < 4000) {
        console.log('🟡 LCP: NEEDS_IMPROVEMENT (< 4s)');
      } else {
        console.log('🔴 LCP: POOR (≥ 4s)');
      }
    } else {
      console.log('⚠️ LCP: Could not measure');
    }
    
    // CLS scoring
    if (result.metrics.cls !== 'N/A') {
      if (result.metrics.cls < 0.1) {
        console.log('✅ CLS: GOOD (< 0.1)');
      } else if (result.metrics.cls < 0.25) {
        console.log('🟡 CLS: NEEDS_IMPROVEMENT (< 0.25)');
      } else {
        console.log('🔴 CLS: POOR (≥ 0.25)');
      }
    } else {
      console.log('⚠️ CLS: Could not measure');
    }
    
    // Estimate Lighthouse Performance Score
    let performanceScore = 100;
    if (navigationTime >= 2000) performanceScore -= 20;
    else if (navigationTime >= 1000) performanceScore -= 10;
    
    if (result.metrics.fcp !== 'N/A' && result.metrics.fcp >= 3000) performanceScore -= 15;
    else if (result.metrics.fcp !== 'N/A' && result.metrics.fcp >= 1800) performanceScore -= 7;
    
    if (result.metrics.lcp !== 'N/A' && result.metrics.lcp >= 4000) performanceScore -= 20;
    else if (result.metrics.lcp !== 'N/A' && result.metrics.lcp >= 2500) performanceScore -= 10;
    
    if (result.metrics.cls !== 'N/A' && result.metrics.cls >= 0.25) performanceScore -= 15;
    else if (result.metrics.cls !== 'N/A' && result.metrics.cls >= 0.1) performanceScore -= 5;
    
    console.log(`\n🏆 ESTIMATED LIGHTHOUSE SCORE: ${Math.max(0, performanceScore)}/100`);
    
    if (performanceScore >= 90) {
      console.log('🟢 EXCELLENT - Meeting Performance Sprint Goals!');
    } else if (performanceScore >= 75) {
      console.log('🟡 GOOD - Close to Sprint Goals');
    } else {
      console.log('🔴 NEEDS_IMPROVEMENT - Continue Optimization');
    }
    
  } catch (error) {
    console.error('❌ Error during performance measurement:', error);
  } finally {
    await browser.close();
  }
}

measureProduction().catch(console.error);
