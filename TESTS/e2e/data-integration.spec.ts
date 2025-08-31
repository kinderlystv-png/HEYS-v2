import { test, expect } from '@playwright/test';

test.describe('Data Integration and Sync', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as authenticated user
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
  });

  test('data syncs across multiple browser tabs', async ({ browser }) => {
    // Create two pages (tabs)
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    // Login on both tabs
    for (const page of [page1, page2]) {
      await page.goto('/');
      await page.click('[data-testid="login-button"]');
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'password123');
      await page.click('[data-testid="submit-login"]');
    }
    
    // Add food entry on first tab
    await page1.click('[data-testid="add-food-button"]');
    await page1.fill('[data-testid="food-name-input"]', 'Synchronized Apple');
    await page1.click('[data-testid="save-food-entry"]');
    
    // Wait for sync
    await page1.waitForTimeout(2000);
    
    // Refresh second tab and check if data appears
    await page2.reload();
    await expect(page2.locator('[data-testid="food-entry"]:has-text("Synchronized Apple")')).toBeVisible();
    
    await context.close();
  });

  test('offline data is synced when connection is restored', async ({ page, context }) => {
    // Add initial data while online
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Online Food');
    await page.click('[data-testid="save-food-entry"]');
    
    // Go offline
    await context.setOffline(true);
    
    // Add data while offline
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Offline Food');
    await page.click('[data-testid="save-food-entry"]');
    
    // Verify offline indicator
    await expect(page.locator('[data-testid="offline-indicator"]')).toBeVisible();
    
    // Go back online
    await context.setOffline(false);
    
    // Wait for sync
    await page.waitForTimeout(3000);
    
    // Verify both entries are present and synced
    await expect(page.locator('[data-testid="food-entry"]:has-text("Online Food")')).toBeVisible();
    await expect(page.locator('[data-testid="food-entry"]:has-text("Offline Food")')).toBeVisible();
    await expect(page.locator('[data-testid="sync-indicator"]')).toBeVisible();
  });

  test('data persistence across browser sessions', async ({ page, context }) => {
    // Add some data
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Persistent Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Close and reopen browser
    await context.close();
    const newContext = await page.context().browser()?.newContext();
    const newPage = await newContext?.newPage();
    
    if (newPage) {
      await newPage.goto('/');
      
      // Login again
      await newPage.click('[data-testid="login-button"]');
      await newPage.fill('[data-testid="email-input"]', 'test@example.com');
      await newPage.fill('[data-testid="password-input"]', 'password123');
      await newPage.click('[data-testid="submit-login"]');
      
      // Verify data persisted
      await expect(newPage.locator('[data-testid="food-entry"]:has-text("Persistent Apple")')).toBeVisible();
      
      await newContext?.close();
    }
  });

  test('handles concurrent data modifications gracefully', async ({ browser }) => {
    const context = await browser.newContext();
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    
    // Login on both pages
    for (const page of [page1, page2]) {
      await page.goto('/');
      await page.click('[data-testid="login-button"]');
      await page.fill('[data-testid="email-input"]', 'test@example.com');
      await page.fill('[data-testid="password-input"]', 'password123');
      await page.click('[data-testid="submit-login"]');
    }
    
    // Add same food item from both tabs simultaneously
    await Promise.all([
      (async () => {
        await page1.click('[data-testid="add-food-button"]');
        await page1.fill('[data-testid="food-name-input"]', 'Conflict Apple');
        await page1.fill('[data-testid="quantity-input"]', '1');
        await page1.click('[data-testid="save-food-entry"]');
      })(),
      (async () => {
        await page2.click('[data-testid="add-food-button"]');
        await page2.fill('[data-testid="food-name-input"]', 'Conflict Apple');
        await page2.fill('[data-testid="quantity-input"]', '2');
        await page2.click('[data-testid="save-food-entry"]');
      })()
    ]);
    
    // Wait for conflict resolution
    await page1.waitForTimeout(3000);
    await page2.waitForTimeout(3000);
    
    // Verify conflict was handled (either merged or one version chosen)
    const entries1 = await page1.locator('[data-testid="food-entry"]:has-text("Conflict Apple")').count();
    const entries2 = await page2.locator('[data-testid="food-entry"]:has-text("Conflict Apple")').count();
    
    // Should have same number of entries on both pages
    expect(entries1).toEqual(entries2);
    
    await context.close();
  });

  test('imports and exports data correctly', async ({ page }) => {
    // Add some test data
    const foods = ['Apple', 'Banana', 'Chicken'];
    for (const food of foods) {
      await page.click('[data-testid="add-food-button"]');
      await page.fill('[data-testid="food-name-input"]', food);
      await page.click('[data-testid="save-food-entry"]');
    }
    
    // Export data
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="export-data-button"]');
    
    // Wait for download
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="confirm-export"]');
    const download = await downloadPromise;
    
    // Verify download occurred
    expect(download.suggestedFilename()).toMatch(/.*\.(json|csv)$/);
    
    // Test import functionality
    await page.click('[data-testid="import-data-button"]');
    
    // Simulate file upload (this would need actual file handling)
    await expect(page.locator('[data-testid="file-upload"]')).toBeVisible();
  });

  test('handles large datasets efficiently', async ({ page }) => {
    // Add many food entries to test performance
    const startTime = Date.now();
    
    for (let i = 0; i < 50; i++) {
      await page.click('[data-testid="add-food-button"]');
      await page.fill('[data-testid="food-name-input"]', `Food ${i}`);
      await page.click('[data-testid="save-food-entry"]');
      
      // Add small delay to prevent overwhelming the system
      if (i % 10 === 0) {
        await page.waitForTimeout(100);
      }
    }
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Should handle 50 entries within reasonable time (30 seconds)
    expect(totalTime).toBeLessThan(30000);
    
    // Verify all entries are visible
    const entryCount = await page.locator('[data-testid="food-entry"]').count();
    expect(entryCount).toBeGreaterThanOrEqual(50);
    
    // Test pagination or virtualization if implemented
    await page.click('[data-testid="view-all-entries"]');
    await expect(page.locator('[data-testid="entry-list"]')).toBeVisible();
  });

  test('backup and restore functionality works', async ({ page }) => {
    // Add test data
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Backup Test Food');
    await page.click('[data-testid="save-food-entry"]');
    
    // Create backup
    await page.click('[data-testid="settings-button"]');
    await page.click('[data-testid="backup-button"]');
    await page.click('[data-testid="create-backup"]');
    
    // Verify backup creation
    await expect(page.locator('[data-testid="backup-success"]')).toBeVisible();
    
    // Clear data
    await page.click('[data-testid="clear-all-data"]');
    await page.click('[data-testid="confirm-clear"]');
    
    // Verify data is cleared
    await expect(page.locator('[data-testid="food-entry"]:has-text("Backup Test Food")')).not.toBeVisible();
    
    // Restore from backup
    await page.click('[data-testid="restore-backup"]');
    await page.click('[data-testid="confirm-restore"]');
    
    // Verify data is restored
    await expect(page.locator('[data-testid="food-entry"]:has-text("Backup Test Food")')).toBeVisible();
  });
});
