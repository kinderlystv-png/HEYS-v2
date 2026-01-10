/**
 * 🎭 Пример e2e-теста для HEYS (Playwright)
 * Паттерн: test.describe → test → page actions → expect
 */
import { test, expect } from '@playwright/test';

test.describe('Food Logging Flow', () => {
  // Выполняется перед каждым тестом
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Дождаться загрузки приложения
    await expect(page.locator('[data-testid="app-loaded"]')).toBeVisible();
  });

  test('user can add food entry via search', async ({ page }) => {
    // 1. Открыть модал добавления
    await page.click('[data-testid="add-food-button"]');
    await expect(page.locator('[data-testid="food-modal"]')).toBeVisible();

    // 2. Поиск продукта
    await page.fill('[data-testid="food-search-input"]', 'яблоко');
    
    // 3. Дождаться результатов (НЕ sleep!)
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    
    // 4. Выбрать из результатов
    await page.click('[data-testid="search-result-item"]:first-child');
    
    // 5. Указать граммы
    await page.fill('[data-testid="grams-input"]', '150');
    
    // 6. Сохранить
    await page.click('[data-testid="save-food-entry"]');
    
    // 7. Проверить что добавилось
    await expect(page.locator('[data-testid="meal-item"]')).toContainText('яблоко');
    await expect(page.locator('[data-testid="meal-item"]')).toContainText('150');
  });

  test('displays nutrition totals correctly', async ({ page }) => {
    // Добавить продукт
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-search-input"]', 'банан');
    await page.click('[data-testid="search-result-item"]:first-child');
    await page.fill('[data-testid="grams-input"]', '100');
    await page.click('[data-testid="save-food-entry"]');

    // Проверить отображение нутриентов
    const kcalDisplay = page.locator('[data-testid="day-kcal-total"]');
    await expect(kcalDisplay).toBeVisible();
    
    // Ккал банана ~89, проверяем что не 0
    const kcalText = await kcalDisplay.textContent();
    expect(parseInt(kcalText || '0')).toBeGreaterThan(0);
  });

  test('can delete food entry', async ({ page }) => {
    // Предусловие: есть хотя бы 1 запись
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-search-input"]', 'хлеб');
    await page.click('[data-testid="search-result-item"]:first-child');
    await page.fill('[data-testid="grams-input"]', '50');
    await page.click('[data-testid="save-food-entry"]');
    
    // Удалить
    await page.click('[data-testid="meal-item"] [data-testid="delete-button"]');
    
    // Подтвердить удаление
    await page.click('[data-testid="confirm-delete"]');
    
    // Проверить что удалилось
    await expect(page.locator('[data-testid="meal-item"]')).not.toBeVisible();
  });
});

test.describe('Error Handling', () => {
  test('shows error on network failure', async ({ page }) => {
    // Имитировать офлайн
    await page.route('**/api/**', route => route.abort());
    
    await page.goto('/');
    await page.click('[data-testid="add-food-button"]');
    await page.fill('[data-testid="food-search-input"]', 'test');
    
    // Ожидать сообщение об ошибке
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});
