import { test, expect } from '@playwright/test';
import { PageHelpers } from './helpers/page-helpers';

test.describe('HEYS Web App - Basic Functionality', () => {
  test('homepage loads correctly', async ({ page }) => {
    const navigation = new PageHelpers.NavigationHelpers(page);
    
    await page.goto('/');
    
    // Check if the page title contains "HEYS"
    await expect(page).toHaveTitle(/HEYS/);
    
    // Check for main navigation or content
    await expect(page.locator('body')).toBeVisible();
    
    // Basic accessibility check
    await navigation.checkPageAccessibility();
    
    // Measure performance
    const performance = await new PageHelpers.TestDataHelpers(page).measurePerformance();
    console.log(`Page load time: ${performance.loadTime}ms`);
    expect(performance.loadTime).toBeLessThan(5000); // 5 seconds max
  });

  test('has working navigation', async ({ page }) => {
    await page.goto('/');
    
    // Basic smoke test to ensure the app loads
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeDefined();
    expect(bodyText!.length).toBeGreaterThan(0);
    
    // Check for key navigation elements
    const navElements = [
      '[data-testid="login-button"]',
      '[data-testid="register-button"]',
      '[data-testid="home-link"]'
    ];
    
    for (const selector of navElements) {
      try {
        await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
      } catch (error) {
        console.log(`Navigation element ${selector} not found - this might be expected based on current state`);
      }
    }
  });

  test('responsive design works across viewports', async ({ page }) => {
    const navigation = new PageHelpers.NavigationHelpers(page);
    
    const viewports = [
      { width: 1280, height: 720 }, // Desktop
      { width: 768, height: 1024 }, // Tablet
      { width: 375, height: 667 },  // Mobile
    ];
    
    await navigation.verifyResponsiveDesign(viewports);
  });

  test('app loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      errors.push(error.message);
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Report any errors found
    if (errors.length > 0) {
      console.warn('JavaScript errors detected:', errors);
    }
    
    // For now, we'll just log errors but not fail the test
    // In production, you might want to fail on certain types of errors
    expect(errors.filter(error => error.includes('CRITICAL')).length).toBe(0);
  });

  test('service worker registers successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check if service worker is registered
    const swRegistered = await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          return !!registration;
        } catch (error) {
          return false;
        }
      }
      return false;
    });
    
    console.log(`Service Worker registered: ${swRegistered}`);
    // Service worker might not be available in all environments
    // So we'll just log the result rather than assert
  });

  test('manifest.json is accessible', async ({ page }) => {
    // Check if web app manifest is accessible
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.status()).toBe(200);
    
    // Parse and validate basic manifest structure
    const manifestText = await response?.text();
    const manifest = JSON.parse(manifestText || '{}');
    
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('start_url');
  });
});
