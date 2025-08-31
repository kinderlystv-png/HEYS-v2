import { test, expect } from '@playwright/test';

test.describe('User Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('user can register new account', async ({ page }) => {
    // Navigate to registration
    await page.click('[data-testid="register-button"]');
    
    // Fill registration form
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'securePassword123');
    await page.fill('[data-testid="confirm-password-input"]', 'securePassword123');
    await page.fill('[data-testid="username-input"]', 'testuser');
    
    // Submit registration
    await page.click('[data-testid="submit-registration"]');
    
    // Verify successful registration
    await expect(page.locator('[data-testid="welcome-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('user can login with existing account', async ({ page }) => {
    // Navigate to login
    await page.click('[data-testid="login-button"]');
    
    // Fill login form
    await page.fill('[data-testid="email-input"]', 'existing@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    
    // Submit login
    await page.click('[data-testid="submit-login"]');
    
    // Verify successful login
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
    await expect(page.locator('[data-testid="logout-button"]')).toBeVisible();
  });

  test('shows validation errors for invalid input', async ({ page }) => {
    await page.click('[data-testid="register-button"]');
    
    // Try to submit with invalid email
    await page.fill('[data-testid="email-input"]', 'invalid-email');
    await page.fill('[data-testid="password-input"]', '123');
    await page.click('[data-testid="submit-registration"]');
    
    // Verify error messages
    await expect(page.locator('[data-testid="email-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="password-error"]')).toBeVisible();
  });

  test('user can logout', async ({ page }) => {
    // Login first
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    
    // Logout
    await page.click('[data-testid="logout-button"]');
    
    // Verify logout
    await expect(page.locator('[data-testid="login-button"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-profile"]')).not.toBeVisible();
  });

  test('remembers user session on page reload', async ({ page }) => {
    // Login
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    
    // Reload page
    await page.reload();
    
    // Verify session persisted
    await expect(page.locator('[data-testid="user-profile"]')).toBeVisible();
  });
});
