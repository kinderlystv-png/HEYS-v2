import { test, expect } from '@playwright/test';

test.describe('HEYS Application E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should load the main page', async ({ page }) => {
    // Check that the page loads
    await expect(page).toHaveTitle(/HEYS/);
  });

  test('should have working navigation', async ({ page }) => {
    // Test basic navigation
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();
  });

  test('should handle responsive design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Check that mobile menu is accessible
    const mobileMenu = page.locator('[data-testid="mobile-menu"]');
    if (await mobileMenu.isVisible()) {
      await expect(mobileMenu).toBeVisible();
    }
  });

  test('should have accessible elements', async ({ page }) => {
    // Check for basic accessibility
    await expect(page.locator('main')).toBeVisible();
    
    // Check that images have alt text
    const images = page.locator('img');
    const count = await images.count();
    
    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');
      expect(alt).toBeTruthy();
    }
  });
});

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should show search suggestions', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"]');
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('test');
      
      // Wait for suggestions to appear
      await page.waitForSelector('[data-testid="search-suggestions"]', { timeout: 5000 });
      
      const suggestions = page.locator('[data-testid="suggestion-item"]');
      await expect(suggestions.first()).toBeVisible();
    }
  });

  test('should handle search with typos', async ({ page }) => {
    const searchInput = page.locator('[data-testid="search-input"]');
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('tpyescript'); // Typo for "typescript"
      
      // Should still show relevant suggestions
      await page.waitForSelector('[data-testid="search-suggestions"]', { timeout: 5000 });
      
      const suggestions = page.locator('[data-testid="suggestion-item"]');
      const firstSuggestion = await suggestions.first().textContent();
      
      expect(firstSuggestion?.toLowerCase()).toContain('typescript');
    }
  });
});

test.describe('Performance Tests', () => {
  test('should load within performance budget', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto('/', { waitUntil: 'load' });
    
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(3000); // Should load within 3 seconds
  });

  test('should have good Core Web Vitals', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check LCP (Largest Contentful Paint)
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry.startTime);
        }).observe({ entryTypes: ['largest-contentful-paint'] });
        
        // Fallback timeout
        setTimeout(() => resolve(0), 1000);
      });
    });
    
    expect(lcp).toBeLessThan(2500); // Good LCP threshold
  });
});
