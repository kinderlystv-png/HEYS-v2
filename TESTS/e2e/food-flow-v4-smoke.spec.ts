import { expect, test } from '@playwright/test';

const E2E_CLIENT_ID = '22222222-2222-2222-2222-222222222222';

const PRODUCT_PASTE = `Название: Smoke APS ${Date.now()}
Ккал: 100
Углеводы: 10
Простые: 5
Сложные: 5
Белок: 5
Жиры: 3
Вредные жиры: 1
Полезные жиры: 2
Транс-жиры: 0
Клетчатка: 0
ГИ: 40
Вред: 3`;

const MODERATION_OUTCOMES: Array<{
    key: string;
    status: string;
    text: string;
    pinAction?: boolean;
}> = [
    { key: 'pending', status: 'pending', text: 'Продукт сохранён, заявка ушла куратору' },
    { key: 'exists', status: 'exists', text: 'Такой продукт уже есть в общей базе — заявка не нужна' },
    { key: 'pending_dup', status: 'pending_dup', text: 'Такая заявка уже на проверке' },
    { key: 'offline', status: 'offline', text: 'Продукт сохранён, но заявка не ушла' },
    { key: 'invalid_session', status: 'error', text: 'Нужно войти заново', pinAction: true },
];

async function bootstrapFoodFlowSession(page: import('@playwright/test').Page) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(
        () => Boolean((window as any).HEYS?.AddProductStep?.show && (window as any).HEYS?.StepModal?.show),
        { timeout: 120000 },
    );
    await page.evaluate((clientId) => {
        const w = window as typeof window & { HEYS?: any };
        try {
            localStorage.setItem('heys_pin_auth_client', clientId);
            localStorage.setItem('heys_client_current', clientId);
            localStorage.setItem('heys_session_token', 'smoke-session-token');
            localStorage.removeItem('heys_registration_in_progress');
        } catch (_) { /* noop */ }
        w.HEYS.currentClientId = clientId;
        w.HEYS.cloud = w.HEYS.cloud || {};
        w.HEYS.cloud.setPinAuthClient?.(clientId);
        w.HEYS.products = w.HEYS.products || {};
        w.HEYS.products.getAll = () => [];
        w.HEYS.products.ensurePersonalProductCommitted = async (product: any) => ({
            ok: true,
            product: { ...product, id: product.id || `smoke-${Date.now()}` },
        });
        w.HEYS.auth = w.HEYS.auth || {};
        w.HEYS.auth.isCuratorSession = () => false;
        w.HEYS.YandexAPI = { ...(w.HEYS.YandexAPI || {}), getCuratorToken: () => null };
        w.HEYS.cloud.getUser = () => null;
        w.HEYS.models = w.HEYS.models || {};
        w.HEYS.models.computeProductFingerprint = async () => 'smoke-fingerprint';
        w.HEYS.cloud.searchSharedProducts = async () => ({ data: [] });
        w.HEYS.cloud.publishToShared = async () => ({ status: 'pending' });
        w.__moderationMock = { key: 'pending', status: 'pending' };
        const rpcImpl = async (name: string) => {
            const cfg = w.__moderationMock || { key: 'pending', status: 'pending' };
            if (name === 'create_pending_product_by_session') {
                if (cfg.key === 'invalid_session') {
                    return { data: null, error: { message: 'invalid_session: Нет активной сессии' } };
                }
                if (cfg.key === 'offline') {
                    throw new Error('network offline');
                }
                return { data: { status: cfg.status }, error: null };
            }
            return { data: null, error: null };
        };
        w.HEYS.YandexAPI.rpc = rpcImpl;
        w.HEYS.cloud.createPendingProduct = async () => {
            const cfg = w.__moderationMock || { key: 'pending', status: 'pending' };
            if (cfg.key === 'invalid_session') {
                throw new Error('invalid_session: Нет активной сессии');
            }
            if (cfg.key === 'offline') {
                throw new Error('network offline');
            }
            return { status: cfg.status };
        };
    }, E2E_CLIENT_ID);
}

async function openAddProductModal(page: import('@playwright/test').Page, extra: Record<string, unknown> = {}) {
    await page.evaluate((opts) => {
        const w = window as typeof window & { HEYS?: any };
        w.HEYS?.AddProductStep?.show?.({
            mealIndex: 0,
            mealId: 'smoke-meal',
            dateKey: new Date().toISOString().slice(0, 10),
            onAdd: () => {},
            onClose: () => {},
            ...opts,
        });
    }, extra);
    await expect(page.locator('.aps-search-step, .aps-v4-flow')).toBeVisible({ timeout: 20000 });
}

async function goToHarmStep(page: import('@playwright/test').Page, paste = PRODUCT_PASTE) {
    await page.click('.aps-new-product-btn');
    await expect(page.locator('.aps-create-step')).toBeVisible({ timeout: 10000 });
    await page.locator('.aps-create-step textarea').fill(paste);
    await expect(page.locator('.aps-create-btn.active')).toBeVisible({ timeout: 10000 });
    await page.click('.aps-create-btn.active');
    await expect(page.locator('.aps-portions-step')).toBeVisible({ timeout: 10000 });
    await page.click('.aps-portions-skip-btn');
    await expect(page.locator('.harm-select-step')).toBeVisible({ timeout: 15000 });
}

test.describe('Food flow v4 smoke (pre-push gate)', () => {
    test.setTimeout(120_000);

    test.beforeEach(async ({ page }) => {
        await bootstrapFoodFlowSession(page);
    });

    test('новый продукт — кнопка и шаг создания', async ({ page }) => {
        await openAddProductModal(page);
        await page.click('.aps-new-product-btn');
        await expect(page.locator('.aps-create-title')).toContainText('Создать новый продукт');
        await expect(page.locator('.aps-create-step textarea')).toBeVisible();
    });

    test('пять исходов модерации — экраны и тексты', async ({ page }) => {
        for (const outcome of MODERATION_OUTCOMES) {
            await openAddProductModal(page);
            await goToHarmStep(page, PRODUCT_PASTE.replace('Smoke APS', `Smoke ${outcome.key}`));

            await page.evaluate((cfg) => {
                const w = window as any;
                w.__moderationMock = cfg;
            }, outcome);

            await page.locator('.harm-select-step button.harm-card', { hasText: '🧪 Расчёт' }).click();
            await expect(page.locator('.aps-v4-outcome, .aps-v4-error-hero')).toBeVisible({ timeout: 20000 });
            await expect(page.getByText(outcome.text, { exact: false })).toBeVisible();

            if (outcome.pinAction) {
                await expect(page.getByRole('button', { name: 'Ввести PIN' })).toBeVisible();
            } else {
                await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
            }

            await page.evaluate(() => (window as any).HEYS?.StepModal?.hide?.({ scrollToDiary: false }));
            await expect(page.locator('.step-modal-root, .mc-modal-root, .aps-search-step, .harm-select-step')).toHaveCount(0, { timeout: 10000 });
        }
    });

    test('выход с черновиком — диалог подтверждения', async ({ page }) => {
        await openAddProductModal(page);
        await page.click('.aps-new-product-btn');
        await page.locator('.aps-create-step textarea').fill('Название: Черновик smoke');
        await page.keyboard.press('Escape');
        await expect(page.locator('.aps-v4-exit-dialog')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('.aps-v4-exit-dialog__title')).toContainText('Выйти и потерять выбор?');
        await page.locator('.aps-v4-exit-dialog__stay').click();
        await expect(page.locator('.aps-create-step')).toBeVisible();
        await page.keyboard.press('Escape');
        await page.locator('.aps-v4-exit-dialog__leave').click();
        await expect(page.locator('.aps-create-step')).toHaveCount(0, { timeout: 10000 });
    });

    test('фото на граммах — кнопка видна при onAddPhoto', async ({ page }) => {
        await page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            w.HEYS?.AddProductStep?.show?.({
                mealIndex: 0,
                mealId: 'smoke-meal',
                dateKey: new Date().toISOString().slice(0, 10),
                onAdd: () => {},
                onAddPhoto: () => { (window as any).__photoSmoke = true; },
                onClose: () => {},
            });
        });
        await expect(page.locator('.aps-search-step, .aps-v4-flow')).toBeVisible({ timeout: 20000 });

        await goToHarmStep(page);
        await page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            w.HEYS.cloud = w.HEYS.cloud || {};
            const original = w.HEYS.cloud.createPendingProduct?.bind(w.HEYS.cloud);
            w.HEYS.cloud.createPendingProduct = async () => ({ status: 'pending' });
            (w as any).__apsSmokeRestore = () => {
                if (original) w.HEYS.cloud.createPendingProduct = original;
            };
        });
        await page.locator('.harm-select-step button.harm-card', { hasText: '🧪 Расчёт' }).click();
        await page.getByRole('button', { name: 'Продолжить' }).click();
        await expect(page.locator('.aps-v4-meal-photo__btn')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('.aps-v4-meal-photo')).toContainText('Добавить фото к приёму');
    });
});
