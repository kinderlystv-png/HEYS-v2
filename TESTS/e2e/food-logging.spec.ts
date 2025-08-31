import { test, expect } from '@playwright/test';

test.describe('Food Logging and Nutrition', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as authenticated user
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
    await expect(page.locator('[data-testid="dashboard"]')).toBeVisible();
  });

  test('user can add new food entry', async ({ page }) => {
    // Navigate to food logging
    await page.click('[data-testid="add-food-button"]');
    
    // Fill food entry form
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.fill('[data-testid="quantity-input"]', '1');
    await page.selectOption('[data-testid="unit-select"]', 'piece');
    
    // Set meal time
    await page.selectOption('[data-testid="meal-type-select"]', 'breakfast');
    
    // Submit food entry
    await page.click('[data-testid="save-food-entry"]');
    
    // Verify food entry appears in log
    await expect(page.locator('[data-testid="food-entry"]')).toContainText('Apple');
    await expect(page.locator('[data-testid="calories-display"]')).toBeVisible();
  });

  test('user can search for foods in database', async ({ page }) => {
    await page.click('[data-testid="add-food-button"]');
    
    // Use search functionality
    await page.fill('[data-testid="food-search-input"]', 'bana');
    
    // Wait for search results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-result-item"]')).toContainText('Banana');
    
    // Select from search results
    await page.click('[data-testid="search-result-item"]:has-text("Banana")');
    
    // Verify food is auto-filled
    await expect(page.locator('[data-testid="food-name-input"]')).toHaveValue('Banana');
  });

  test('displays nutritional information correctly', async ({ page }) => {
    // Add a food with known nutrition
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Banana');
    await page.fill('[data-testid="quantity-input"]', '1');
    await page.click('[data-testid="save-food-entry"]');
    
    // Verify nutrition display
    await expect(page.locator('[data-testid="calories-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="protein-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="carbs-value"]')).toBeVisible();
    await expect(page.locator('[data-testid="fat-value"]')).toBeVisible();
  });

  test('user can edit existing food entry', async ({ page }) => {
    // First add a food entry
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.fill('[data-testid="quantity-input"]', '1');
    await page.click('[data-testid="save-food-entry"]');
    
    // Edit the entry
    await page.click('[data-testid="edit-food-entry"]');
    await page.fill('[data-testid="quantity-input"]', '2');
    await page.click('[data-testid="save-food-entry"]');
    
    // Verify changes
    await expect(page.locator('[data-testid="food-quantity"]')).toContainText('2');
  });

  test('user can delete food entry', async ({ page }) => {
    // Add food entry first
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Delete the entry
    await page.click('[data-testid="delete-food-entry"]');
    await page.click('[data-testid="confirm-delete"]');
    
    // Verify deletion
    await expect(page.locator('[data-testid="food-entry"]:has-text("Apple")')).not.toBeVisible();
  });

  test('shows daily nutrition summary', async ({ page }) => {
    // Add multiple food entries
    const foods = ['Apple', 'Banana', 'Chicken Breast'];
    
    for (const food of foods) {
      await page.click('[data-testid="add-food-button"]');
      await page.fill('[data-testid="food-name-input"]', food);
      await page.fill('[data-testid="quantity-input"]', '100');
      await page.selectOption('[data-testid="unit-select"]', 'g');
      await page.click('[data-testid="save-food-entry"]');
    }
    
    // Check daily summary
    await page.click('[data-testid="daily-summary"]');
    await expect(page.locator('[data-testid="total-calories"]')).toBeVisible();
    await expect(page.locator('[data-testid="macro-breakdown"]')).toBeVisible();
  });

  test('validates quantity input', async ({ page }) => {
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    
    // Try invalid quantities
    await page.fill('[data-testid="quantity-input"]', '-1');
    await page.click('[data-testid="save-food-entry"]');
    await expect(page.locator('[data-testid="quantity-error"]')).toBeVisible();
    
    await page.fill('[data-testid="quantity-input"]', 'abc');
    await page.click('[data-testid="save-food-entry"]');
    await expect(page.locator('[data-testid="quantity-error"]')).toBeVisible();
  });
});
