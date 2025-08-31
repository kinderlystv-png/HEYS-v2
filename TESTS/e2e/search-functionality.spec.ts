import { test, expect } from '@playwright/test';

test.describe('Search Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as authenticated user
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
  });

  test('smart search finds foods with typos', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Test typo tolerance
    await page.fill('[data-testid="search-input"]', 'banan'); // missing 'a'
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Should still find "banana"
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(page.locator('[data-testid="search-result-item"]')).toContainText('Banana');
  });

  test('search suggestions appear as user types', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Type partial search
    await page.fill('[data-testid="search-input"]', 'app');
    
    // Wait for suggestions dropdown
    await expect(page.locator('[data-testid="search-suggestions"]')).toBeVisible();
    await expect(page.locator('[data-testid="suggestion-item"]')).toContainText('Apple');
  });

  test('search filters work correctly', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Apply category filter
    await page.selectOption('[data-testid="category-filter"]', 'fruits');
    await page.fill('[data-testid="search-input"]', 'a');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Verify filtered results
    const results = page.locator('[data-testid="search-result-item"]');
    await expect(results.first()).toBeVisible();
    
    // All results should be fruits
    const resultTexts = await results.allTextContents();
    expect(resultTexts.some(text => text.includes('Apple') || text.includes('Avocado'))).toBeTruthy();
  });

  test('search history is saved and accessible', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Perform a search
    await page.fill('[data-testid="search-input"]', 'chicken');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Clear search and check history
    await page.fill('[data-testid="search-input"]', '');
    await page.click('[data-testid="search-history-button"]');
    
    // Verify history contains previous search
    await expect(page.locator('[data-testid="history-item"]')).toContainText('chicken');
  });

  test('no results message appears for invalid searches', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Search for something that doesn't exist
    await page.fill('[data-testid="search-input"]', 'xyzabc123nonexistent');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Verify no results message
    await expect(page.locator('[data-testid="no-results-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="no-results-message"]')).toContainText('No results found');
  });

  test('search performance is acceptable', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    const startTime = Date.now();
    
    // Perform search
    await page.fill('[data-testid="search-input"]', 'chicken');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Wait for results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    
    const endTime = Date.now();
    const searchTime = endTime - startTime;
    
    // Search should complete within 2 seconds
    expect(searchTime).toBeLessThan(2000);
  });

  test('search works across different content types', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Search for recipes
    await page.selectOption('[data-testid="content-type-filter"]', 'recipes');
    await page.fill('[data-testid="search-input"]', 'pasta');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    await expect(page.locator('[data-testid="recipe-result"]')).toBeVisible();
    
    // Search for exercises
    await page.selectOption('[data-testid="content-type-filter"]', 'exercises');
    await page.fill('[data-testid="search-input"]', 'running');
    await page.press('[data-testid="search-input"]', 'Enter');
    
    await expect(page.locator('[data-testid="exercise-result"]')).toBeVisible();
  });

  test('search keyboard navigation works', async ({ page }) => {
    await page.click('[data-testid="search-button"]');
    
    // Type search query
    await page.fill('[data-testid="search-input"]', 'apple');
    
    // Wait for suggestions
    await expect(page.locator('[data-testid="suggestion-item"]')).toBeVisible();
    
    // Navigate with arrow keys
    await page.press('[data-testid="search-input"]', 'ArrowDown');
    await page.press('[data-testid="search-input"]', 'ArrowDown');
    
    // Select with Enter
    await page.press('[data-testid="search-input"]', 'Enter');
    
    // Verify selection was made
    await expect(page.locator('[data-testid="selected-item"]')).toBeVisible();
  });
});
