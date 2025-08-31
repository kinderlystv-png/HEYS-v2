import { test, expect } from '@playwright/test';

test.describe('Performance and Analytics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads within acceptable time limits', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('core web vitals are within acceptable ranges', async ({ page }) => {
    // Navigate to page and wait for full load
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Measure Core Web Vitals using Performance API
    const vitals = await page.evaluate(() => {
      return new Promise<{fcp?: number; lcp?: number; cls?: number}>((resolve) => {
        const vitalsData: {fcp?: number; lcp?: number; cls?: number} = {};
        
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          
          entries.forEach((entry: any) => {
            if (entry.name === 'first-contentful-paint') {
              vitalsData.fcp = entry.startTime;
            }
            if (entry.entryType === 'largest-contentful-paint') {
              vitalsData.lcp = entry.startTime;
            }
            if (entry.entryType === 'layout-shift') {
              vitalsData.cls = (vitalsData.cls || 0) + entry.value;
            }
          });
          
          resolve(vitalsData);
        }).observe({ entryTypes: ['paint', 'largest-contentful-paint', 'layout-shift'] });
        
        // Fallback timeout
        setTimeout(() => resolve({}), 5000);
      });
    });
    
    // Verify acceptable thresholds
    if (vitals.fcp) expect(vitals.fcp).toBeLessThan(1800); // FCP < 1.8s
    if (vitals.lcp) expect(vitals.lcp).toBeLessThan(2500); // LCP < 2.5s
    if (vitals.cls) expect(vitals.cls).toBeLessThan(0.1);  // CLS < 0.1
  });

  test('analytics events are properly tracked', async ({ page }) => {
    // Monitor network requests for analytics calls
    const analyticsRequests: string[] = [];
    
    page.on('request', request => {
      const url = request.url();
      if (url.includes('analytics') || url.includes('track') || url.includes('event')) {
        analyticsRequests.push(url);
      }
    });
    
    // Login to authenticate user
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    
    // Perform trackable actions
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Wait a moment for analytics to fire
    await page.waitForTimeout(1000);
    
    // Verify analytics events were sent
    expect(analyticsRequests.length).toBeGreaterThan(0);
  });

  test('user interactions are logged for analysis', async ({ page }) => {
    // Create a custom analytics listener
    await page.addInitScript(() => {
      (window as any).analyticsEvents = [];
      
      // Override console.log to capture analytics events
      const originalLog = console.log;
      console.log = (...args) => {
        if (args[0]?.includes('ANALYTICS:')) {
          (window as any).analyticsEvents.push(args);
        }
        originalLog.apply(console, args);
      };
    });
    
    await page.goto('/');
    
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    
    // Perform various actions
    await page.click('[data-testid="search-button"]');
    await page.fill('[data-testid="search-input"]', 'apple');
    await page.click('[data-testid="add-food-button"]');
    
    // Check that events were logged
    const events = await page.evaluate(() => (window as any).analyticsEvents);
    expect(events.length).toBeGreaterThan(0);
  });

  test('error tracking captures and reports issues', async ({ page }) => {
    let errorCaught = false;
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errorCaught = true;
      }
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      errorCaught = true;
    });
    
    // Trigger an intentional error (if error boundary exists)
    await page.goto('/');
    
    // Try to access a non-existent route or trigger error
    await page.goto('/non-existent-route');
    
    // Verify error handling
    await expect(page.locator('[data-testid="error-boundary"]')).toBeVisible();
  });

  test('network requests are optimized', async ({ page }) => {
    const requests: any[] = [];
    
    page.on('request', request => {
      requests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType()
      });
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Analyze request patterns
    const imageRequests = requests.filter(r => r.resourceType === 'image');
    const scriptRequests = requests.filter(r => r.resourceType === 'script');
    const stylesheetRequests = requests.filter(r => r.resourceType === 'stylesheet');
    
    // Verify reasonable request counts
    expect(imageRequests.length).toBeLessThan(20); // Not too many images
    expect(scriptRequests.length).toBeLessThan(10); // Bundled scripts
    expect(stylesheetRequests.length).toBeLessThan(5); // Minimal CSS files
    
    // Check for proper caching headers (would need response access)
    console.log(`Total requests: ${requests.length}`);
    console.log(`Images: ${imageRequests.length}, Scripts: ${scriptRequests.length}, Styles: ${stylesheetRequests.length}`);
  });

  test('memory usage stays within reasonable bounds', async ({ page }) => {
    await page.goto('/');
    
    // Get initial memory usage
    const initialMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize
      } : null;
    });
    
    // Perform memory-intensive operations
    for (let i = 0; i < 10; i++) {
      await page.click('[data-testid="add-food-button"]');
      await page.fill('[data-testid="food-name-input"]', `Food ${i}`);
      await page.click('[data-testid="save-food-entry"]');
    }
    
    // Check memory after operations
    const finalMemory = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize
      } : null;
    });
    
    if (initialMemory && finalMemory) {
      const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
      
      // Memory increase should be reasonable (less than 10MB for this test)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    }
  });

  test('offline functionality works when available', async ({ page, context }) => {
    await page.goto('/');
    
    // Login first to cache user data
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    
    // Go offline
    await context.setOffline(true);
    
    // Try to navigate - should show offline message or cached content
    await page.reload();
    
    // Verify offline handling
    const hasOfflineMessage = await page.locator('[data-testid="offline-message"]').isVisible();
    const hasCachedContent = await page.locator('[data-testid="dashboard"]').isVisible();
    
    // Either offline message or cached content should be visible
    expect(hasOfflineMessage || hasCachedContent).toBeTruthy();
    
    // Go back online
    await context.setOffline(false);
  });
});
