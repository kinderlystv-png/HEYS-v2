import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object Model utilities for HEYS E2E tests
 */

export class LoginPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(email: string, password: string) {
    await this.page.click('[data-testid="login-button"]');
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.click('[data-testid="submit-login"]');
    await expect(this.page.locator('[data-testid="dashboard"]')).toBeVisible();
  }

  async register(email: string, password: string, username: string) {
    await this.page.click('[data-testid="register-button"]');
    await this.page.fill('[data-testid="email-input"]', email);
    await this.page.fill('[data-testid="password-input"]', password);
    await this.page.fill('[data-testid="confirm-password-input"]', password);
    await this.page.fill('[data-testid="username-input"]', username);
    await this.page.click('[data-testid="submit-registration"]');
  }

  async logout() {
    await this.page.click('[data-testid="logout-button"]');
    await expect(this.page.locator('[data-testid="login-button"]')).toBeVisible();
  }
}

export class FoodLoggingPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async addFood(name: string, quantity: string = '1', unit: string = 'piece', mealType: string = 'breakfast') {
    await this.page.click('[data-testid="add-food-button"]');
    await this.page.fill('[data-testid="food-name-input"]', name);
    await this.page.fill('[data-testid="quantity-input"]', quantity);
    await this.page.selectOption('[data-testid="unit-select"]', unit);
    await this.page.selectOption('[data-testid="meal-type-select"]', mealType);
    await this.page.click('[data-testid="save-food-entry"]');
  }

  async searchFood(query: string): Promise<void> {
    await this.page.click('[data-testid="add-food-button"]');
    await this.page.fill('[data-testid="food-search-input"]', query);
    await expect(this.page.locator('[data-testid="search-results"]')).toBeVisible();
  }

  async selectFromSearchResults(foodName: string): Promise<void> {
    await this.page.click(`[data-testid="search-result-item"]:has-text("${foodName}")`);
  }

  async editFoodEntry(originalName: string, newQuantity: string): Promise<void> {
    await this.page.locator(`[data-testid="food-entry"]:has-text("${originalName}")`).locator('[data-testid="edit-food-entry"]').click();
    await this.page.fill('[data-testid="quantity-input"]', newQuantity);
    await this.page.click('[data-testid="save-food-entry"]');
  }

  async deleteFoodEntry(foodName: string): Promise<void> {
    await this.page.locator(`[data-testid="food-entry"]:has-text("${foodName}")`).locator('[data-testid="delete-food-entry"]').click();
    await this.page.click('[data-testid="confirm-delete"]');
  }

  async verifyFoodEntryExists(foodName: string): Promise<void> {
    await expect(this.page.locator(`[data-testid="food-entry"]:has-text("${foodName}")`)).toBeVisible();
  }

  async verifyNutritionDisplayed(): Promise<void> {
    await expect(this.page.locator('[data-testid="calories-value"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="protein-value"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="carbs-value"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="fat-value"]')).toBeVisible();
  }
}

export class SearchPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async performSearch(query: string): Promise<void> {
    await this.page.click('[data-testid="search-button"]');
    await this.page.fill('[data-testid="search-input"]', query);
    await this.page.press('[data-testid="search-input"]', 'Enter');
  }

  async applyFilter(filterType: string, value: string): Promise<void> {
    await this.page.selectOption(`[data-testid="${filterType}-filter"]`, value);
  }

  async verifySearchResults(expectedText: string): Promise<void> {
    await expect(this.page.locator('[data-testid="search-results"]')).toBeVisible();
    await expect(this.page.locator('[data-testid="search-result-item"]')).toContainText(expectedText);
  }

  async verifyNoResults(): Promise<void> {
    await expect(this.page.locator('[data-testid="no-results-message"]')).toBeVisible();
  }

  async checkSearchHistory(): Promise<void> {
    await this.page.click('[data-testid="search-history-button"]');
    await expect(this.page.locator('[data-testid="history-item"]')).toBeVisible();
  }
}

export class AchievementsPage {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(): Promise<void> {
    await this.page.click('[data-testid="achievements-button"]');
  }

  async verifyAchievementUnlocked(achievementName: string): Promise<void> {
    await expect(this.page.locator(`[data-testid="unlocked-achievement"]:has-text("${achievementName}")`)).toBeVisible();
  }

  async verifyAchievementLocked(achievementName: string): Promise<void> {
    await expect(this.page.locator(`[data-testid="locked-achievement"]:has-text("${achievementName}")`)).toBeVisible();
  }

  async openAchievementDetails(achievementName: string): Promise<void> {
    await this.page.locator(`[data-testid="achievement-card"]:has-text("${achievementName}")`).click();
    await expect(this.page.locator('[data-testid="achievement-modal"]')).toBeVisible();
  }

  async closeAchievementModal(): Promise<void> {
    await this.page.click('[data-testid="close-modal"]');
    await expect(this.page.locator('[data-testid="achievement-modal"]')).not.toBeVisible();
  }

  async verifyProgressBar(achievementName: string): Promise<void> {
    const progressBar = this.page.locator(`[data-testid="achievement-progress"]:has-text("${achievementName}")`);
    await expect(progressBar).toBeVisible();
    await expect(this.page.locator('[data-testid="progress-percentage"]')).toBeVisible();
  }

  async getUserPoints(): Promise<string> {
    return await this.page.locator('[data-testid="user-points"]').textContent() || '0';
  }

  async verifyPointsIncreased(initialPoints: string): Promise<void> {
    const newPoints = await this.getUserPoints();
    expect(parseInt(newPoints)).toBeGreaterThan(parseInt(initialPoints));
  }
}

export class NavigationHelpers {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ path: `test-results/screenshots/${name}.png` });
  }

  async checkPageAccessibility(): Promise<void> {
    // Basic accessibility checks
    await expect(this.page.locator('h1')).toBeVisible();
    await expect(this.page.locator('[role="main"]')).toBeVisible();
  }

  async verifyResponsiveDesign(viewports: Array<{width: number, height: number}>): Promise<void> {
    for (const viewport of viewports) {
      await this.page.setViewportSize(viewport);
      await this.page.reload();
      await expect(this.page.locator('body')).toBeVisible();
    }
  }
}

export class TestDataHelpers {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async clearAllData(): Promise<void> {
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }

  async seedTestData(): Promise<void> {
    // Add common test data
    const foods = ['Apple', 'Banana', 'Chicken Breast', 'Rice', 'Broccoli'];
    const foodLogging = new FoodLoggingPage(this.page);
    
    for (const food of foods) {
      await foodLogging.addFood(food, '100', 'g');
    }
  }

  async generateUniqueEmail(): Promise<string> {
    const timestamp = Date.now();
    return `test${timestamp}@example.com`;
  }

  async measurePerformance(): Promise<{loadTime: number, fcp?: number}> {
    const startTime = Date.now();
    
    const performanceMetrics = await this.page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(entry => entry.name === 'first-contentful-paint');
      
      return {
        loadTime: navigation.loadEventEnd - navigation.loadEventStart,
        fcp: fcp?.startTime
      };
    });
    
    return {
      loadTime: Date.now() - startTime,
      fcp: performanceMetrics.fcp
    };
  }
}

// Export all helpers as a single namespace
export const PageHelpers = {
  LoginPage,
  FoodLoggingPage,
  SearchPage,
  AchievementsPage,
  NavigationHelpers,
  TestDataHelpers
};
