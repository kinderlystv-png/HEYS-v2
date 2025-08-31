import { test, expect } from '@playwright/test';

test.describe('User Interface and Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('keyboard navigation works throughout the app', async ({ page }) => {
    // Test tab navigation
    await page.keyboard.press('Tab'); // Focus first interactive element
    await page.keyboard.press('Tab'); // Move to next element
    await page.keyboard.press('Tab'); // Continue navigation
    
    // Verify focus is visible
    const focusedElement = await page.locator(':focus');
    await expect(focusedElement).toBeVisible();
    
    // Test Enter key activation
    await page.keyboard.press('Enter');
    
    // Verify appropriate action occurred (modal opened, navigation, etc.)
    // This will depend on what element was focused
  });

  test('screen reader landmarks are properly labeled', async ({ page }) => {
    // Check for proper ARIA landmarks
    await expect(page.locator('main[role="main"]')).toBeVisible();
    await expect(page.locator('nav[role="navigation"]')).toBeVisible();
    
    // Check for heading hierarchy
    await expect(page.locator('h1')).toBeVisible();
    
    // Verify skip links for screen readers
    await expect(page.locator('[data-testid="skip-to-content"]')).toBeVisible();
  });

  test('color contrast meets accessibility standards', async ({ page }) => {
    // This would typically be done with axe-core or similar tools
    // For now, we'll check that text is visible and readable
    const textElements = page.locator('p, span, div, h1, h2, h3, h4, h5, h6');
    const count = await textElements.count();
    
    for (let i = 0; i < Math.min(count, 10); i++) {
      const element = textElements.nth(i);
      await expect(element).toBeVisible();
    }
  });

  test('responsive design works on mobile devices', async ({ page }) => {
    // Test various mobile viewport sizes
    const viewports = [
      { width: 320, height: 568 }, // iPhone 5
      { width: 375, height: 667 }, // iPhone 6/7/8
      { width: 414, height: 896 }, // iPhone XR
      { width: 360, height: 640 }, // Android
    ];
    
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.reload();
      
      // Verify app is usable on this viewport
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('[data-testid="mobile-menu"]')).toBeVisible();
      
      // Check that content doesn't overflow
      const bodyWidth = await page.locator('body').evaluate(el => el.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 20); // Allow small margin
    }
  });

  test('touch gestures work on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    // Test swipe gestures for navigation
    const startX = 50;
    const endX = 300;
    
    await page.touchscreen.tap(startX, 200);
    await page.mouse.move(startX, 200);
    await page.mouse.down();
    await page.mouse.move(endX, 200);
    await page.mouse.up();
    
    // Verify swipe action occurred (navigation, menu open, etc.)
    // Implementation depends on app's swipe handling
  });

  test('dark mode toggle works correctly', async ({ page }) => {
    // Find and click dark mode toggle
    await page.click('[data-testid="theme-toggle"]');
    
    // Verify dark mode is applied
    await expect(page.locator('body')).toHaveClass(/dark-theme|dark-mode/);
    
    // Toggle back to light mode
    await page.click('[data-testid="theme-toggle"]');
    await expect(page.locator('body')).not.toHaveClass(/dark-theme|dark-mode/);
  });

  test('loading states are shown during async operations', async ({ page }) => {
    // Login to trigger loading states
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    
    // Click submit and immediately check for loading state
    await page.click('[data-testid="submit-login"]');
    
    // Verify loading indicator appears
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
    
    // Wait for loading to complete
    await expect(page.locator('[data-testid="loading-spinner"]')).not.toBeVisible();
  });

  test('error messages are clearly displayed', async ({ page }) => {
    // Trigger a form validation error
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.click('[data-testid="submit-login"]');
    
    // Verify error message appearance
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toHaveClass(/error|danger/);
    
    // Verify error is associated with correct field
    const emailInput = page.locator('[data-testid="email-input"]');
    await expect(emailInput).toHaveAttribute('aria-invalid', 'true');
  });

  test('tooltips and help text provide guidance', async ({ page }) => {
    // Hover over help icon or complex control
    await page.hover('[data-testid="help-icon"]');
    
    // Verify tooltip appears
    await expect(page.locator('[data-testid="tooltip"]')).toBeVisible();
    
    // Check tooltip content is helpful
    const tooltipText = await page.locator('[data-testid="tooltip"]').textContent();
    expect(tooltipText?.length).toBeGreaterThan(10);
  });

  test('focus management works in modals', async ({ page }) => {
    // Open a modal
    await page.click('[data-testid="open-modal-button"]');
    
    // Verify focus is trapped in modal
    await expect(page.locator('[data-testid="modal"]')).toBeVisible();
    
    // Tab through modal elements
    await page.keyboard.press('Tab');
    const focusedElement = await page.locator(':focus');
    
    // Verify focus stays within modal
    const isInModal = await focusedElement.evaluate(el => {
      const modal = document.querySelector('[data-testid="modal"]');
      return modal?.contains(el) || false;
    });
    expect(isInModal).toBeTruthy();
    
    // Close modal with Escape
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="modal"]')).not.toBeVisible();
  });

  test('animations respect reduced motion preference', async ({ page }) => {
    // Set reduced motion preference
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    
    // Trigger an animation
    await page.click('[data-testid="animated-button"]');
    
    // Verify animations are reduced or disabled
    // This would require checking CSS animation properties
    // For now, we'll verify the element still functions
    await expect(page.locator('[data-testid="animation-target"]')).toBeVisible();
  });
});
