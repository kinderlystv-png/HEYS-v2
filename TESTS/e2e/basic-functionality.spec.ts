import { test, expect } from '@playwright/test';

test.describe('HEYS Platform E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Настройка для каждого теста
    await page.goto('/');
  });

  test('should load home page correctly', async ({ page }) => {
    // Проверяем, что главная страница загружается
    await expect(page).toHaveTitle(/HEYS Platform/);
    
    // Проверяем наличие основных элементов
    await expect(page.locator('h1')).toContainText('Добро пожаловать в');
    await expect(page.locator('span').filter({ hasText: 'HEYS' })).toBeVisible();
  });

  test('should navigate to dashboard', async ({ page }) => {
    // Кликаем на ссылку Dashboard в навигации
    await page.click('a[href="/dashboard"]');
    
    // Проверяем, что попали на страницу dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('should display dashboard statistics', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Проверяем наличие статистических карточек
    await expect(page.locator('text=Активные проекты')).toBeVisible();
    await expect(page.locator('text=Выполненные задачи')).toBeVisible();
    await expect(page.locator('text=Участники команды')).toBeVisible();
    await expect(page.locator('text=Время работы')).toBeVisible();
    
    // Проверяем, что отображаются числовые значения
    await expect(page.locator('text=12')).toBeVisible(); // Активные проекты
    await expect(page.locator('text=89')).toBeVisible(); // Выполненные задачи
    await expect(page.locator('text=6')).toBeVisible();  // Участники команды
    await expect(page.locator('text=99.9%')).toBeVisible(); // Время работы
  });

  test('should display project list on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Проверяем наличие секции с проектами
    await expect(page.locator('text=Последние проекты')).toBeVisible();
    await expect(page.locator('text=Обзор активных проектов команды')).toBeVisible();
    
    // Проверяем конкретные проекты
    await expect(page.locator('text=HEYS Platform v2.0')).toBeVisible();
    await expect(page.locator('text=Мобильное приложение')).toBeVisible();
    
    // Проверяем статусы проектов
    await expect(page.locator('text=В процессе')).toBeVisible();
    await expect(page.locator('text=Планирование')).toBeVisible();
  });

  test('should have responsive navigation', async ({ page }) => {
    // Проверяем навигацию на главной странице
    await expect(page.locator('nav')).toBeVisible();
    await expect(page.locator('text=HEYS Platform')).toBeVisible();
    
    // Проверяем ссылки в навигации
    await expect(page.locator('a[href="/dashboard"]')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
  });

  test('should handle navigation between pages', async ({ page }) => {
    // Начинаем с главной страницы
    await expect(page).toHaveURL('/');
    
    // Переходим на dashboard
    await page.click('a[href="/dashboard"]');
    await expect(page).toHaveURL('/dashboard');
    
    // Проверяем, что можем вернуться на главную через логотип
    await page.click('text=HEYS Platform');
    await expect(page).toHaveURL('/');
  });

  test('should have proper page titles and meta information', async ({ page }) => {
    // Главная страница
    await expect(page).toHaveTitle(/HEYS Platform - Добро пожаловать/);
    
    // Dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveTitle(/Dashboard - HEYS Platform/);
  });

  test('should display feature cards on home page', async ({ page }) => {
    // Проверяем карточки с особенностями платформы
    await expect(page.locator('text=Высокая производительность')).toBeVisible();
    await expect(page.locator('text=Надежность')).toBeVisible();
    await expect(page.locator('text=Удобство использования')).toBeVisible();
    
    // Проверяем описания
    await expect(page.locator('text=Оптимизированная архитектура')).toBeVisible();
    await expect(page.locator('text=Комплексная система мониторинга')).toBeVisible();
    await expect(page.locator('text=Интуитивный интерфейс')).toBeVisible();
  });

  test('should handle button interactions', async ({ page }) => {
    // Проверяем кнопку "Перейти к Dashboard"
    const dashboardButton = page.locator('a[href="/dashboard"]').first();
    await expect(dashboardButton).toBeVisible();
    await expect(dashboardButton).toContainText('Перейти к Dashboard');
    
    await dashboardButton.click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should have proper styling and layout', async ({ page }) => {
    // Проверяем, что Tailwind CSS стили применяются
    const mainElement = page.locator('main');
    await expect(mainElement).toBeVisible();
    
    // Проверяем адаптивность (максимальная ширина контейнера)
    const container = page.locator('.max-w-7xl').first();
    await expect(container).toBeVisible();
    
    // Проверяем цветовую схему
    const primaryButton = page.locator('.bg-heys-primary').first();
    if (await primaryButton.count() > 0) {
      await expect(primaryButton).toBeVisible();
    }
  });
});
