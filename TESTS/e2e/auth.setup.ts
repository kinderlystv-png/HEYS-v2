import { test as setup, expect } from '@playwright/test';

const authFile = '.auth/user.json';

// Global setup for authenticated state
setup('authenticate', async ({ page }) => {
  // Navigate to login page
  await page.goto('/');
  
  // Perform authentication steps
  await page.click('[data-testid="login-button"]');
  await page.fill('[data-testid="email-input"]', 'test@example.com');
  await page.fill('[data-testid="password-input"]', 'password123');
  await page.click('[data-testid="submit-login"]');
  
  // Wait for successful login
  await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  
  // Save authenticated state
  await page.context().storageState({ path: authFile });
});

// Setup test database/environment
setup('prepare test environment', async ({ page }) => {
  // Any additional setup needed for testing environment
  await page.goto('/');
  
  // Clear any existing test data
  // This would depend on your backend API
  await page.evaluate(() => {
    // Clear localStorage if used for local testing
    localStorage.clear();
  });
});

export { authFile };
