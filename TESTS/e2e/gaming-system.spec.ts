import { test, expect } from '@playwright/test';

test.describe('Gaming System and Achievements', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Login as authenticated user
    await page.click('[data-testid="login-button"]');
    await page.fill('[data-testid="email-input"]', 'test@example.com');
    await page.fill('[data-testid="password-input"]', 'password123');
    await page.click('[data-testid="submit-login"]');
  });

  test('achievements unlock when milestones are reached', async ({ page }) => {
    // Navigate to achievements
    await page.click('[data-testid="achievements-button"]');
    
    // Check initial achievement state
    await expect(page.locator('[data-testid="locked-achievement"]')).toBeVisible();
    
    // Perform action to unlock achievement (log first food)
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Return to achievements and verify unlock
    await page.click('[data-testid="achievements-button"]');
    await expect(page.locator('[data-testid="unlocked-achievement"]:has-text("First Entry")')).toBeVisible();
    await expect(page.locator('[data-testid="achievement-notification"]')).toBeVisible();
  });

  test('progress bars show current status', async ({ page }) => {
    await page.click('[data-testid="achievements-button"]');
    
    // Check progress bar for "Log 10 Foods" achievement
    const progressBar = page.locator('[data-testid="achievement-progress"]:has-text("Log 10 Foods")');
    await expect(progressBar).toBeVisible();
    
    // Verify progress percentage is displayed
    await expect(page.locator('[data-testid="progress-percentage"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-bar-fill"]')).toBeVisible();
  });

  test('achievement details modal works', async ({ page }) => {
    await page.click('[data-testid="achievements-button"]');
    
    // Click on an achievement
    await page.click('[data-testid="achievement-card"]');
    
    // Verify modal opens
    await expect(page.locator('[data-testid="achievement-modal"]')).toBeVisible();
    await expect(page.locator('[data-testid="achievement-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="achievement-requirements"]')).toBeVisible();
    
    // Close modal
    await page.click('[data-testid="close-modal"]');
    await expect(page.locator('[data-testid="achievement-modal"]')).not.toBeVisible();
  });

  test('points system tracks user score', async ({ page }) => {
    // Check initial points
    const initialPoints = await page.locator('[data-testid="user-points"]').textContent();
    
    // Perform point-earning action
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Verify points increased
    await expect(page.locator('[data-testid="points-notification"]')).toBeVisible();
    
    const newPoints = await page.locator('[data-testid="user-points"]').textContent();
    expect(parseInt(newPoints || '0')).toBeGreaterThan(parseInt(initialPoints || '0'));
  });

  test('leaderboard shows user rankings', async ({ page }) => {
    await page.click('[data-testid="leaderboard-button"]');
    
    // Verify leaderboard loads
    await expect(page.locator('[data-testid="leaderboard"]')).toBeVisible();
    await expect(page.locator('[data-testid="user-rank"]')).toBeVisible();
    await expect(page.locator('[data-testid="top-users"]')).toBeVisible();
    
    // Check user's position
    await expect(page.locator('[data-testid="current-user-highlight"]')).toBeVisible();
  });

  test('daily challenges appear and can be completed', async ({ page }) => {
    await page.click('[data-testid="challenges-button"]');
    
    // Verify daily challenge exists
    await expect(page.locator('[data-testid="daily-challenge"]')).toBeVisible();
    await expect(page.locator('[data-testid="challenge-description"]')).toBeVisible();
    await expect(page.locator('[data-testid="challenge-progress"]')).toBeVisible();
    
    // Complete challenge action (if it's "log 3 foods")
    for (let i = 0; i < 3; i++) {
      await page.click('[data-testid="add-food-button"]');
      await page.fill('[data-testid="food-name-input"]', `Food ${i + 1}`);
      await page.click('[data-testid="save-food-entry"]');
    }
    
    // Return to challenges and verify completion
    await page.click('[data-testid="challenges-button"]');
    await expect(page.locator('[data-testid="challenge-completed"]')).toBeVisible();
    await expect(page.locator('[data-testid="challenge-reward"]')).toBeVisible();
  });

  test('streak counter tracks consecutive days', async ({ page }) => {
    // Check streak display
    await expect(page.locator('[data-testid="streak-counter"]')).toBeVisible();
    
    // Verify streak information
    await page.click('[data-testid="streak-info"]');
    await expect(page.locator('[data-testid="streak-details"]')).toBeVisible();
    await expect(page.locator('[data-testid="streak-history"]')).toBeVisible();
  });

  test('badges are displayed in user profile', async ({ page }) => {
    await page.click('[data-testid="user-profile"]');
    
    // Verify badges section
    await expect(page.locator('[data-testid="user-badges"]')).toBeVisible();
    await expect(page.locator('[data-testid="badge-grid"]')).toBeVisible();
    
    // Check individual badges
    const badges = page.locator('[data-testid="user-badge"]');
    const badgeCount = await badges.count();
    expect(badgeCount).toBeGreaterThanOrEqual(0);
  });

  test('achievement notifications can be dismissed', async ({ page }) => {
    // Trigger an achievement
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-name-input"]', 'Apple');
    await page.click('[data-testid="save-food-entry"]');
    
    // Wait for notification
    await expect(page.locator('[data-testid="achievement-notification"]')).toBeVisible();
    
    // Dismiss notification
    await page.click('[data-testid="dismiss-notification"]');
    await expect(page.locator('[data-testid="achievement-notification"]')).not.toBeVisible();
  });
});
