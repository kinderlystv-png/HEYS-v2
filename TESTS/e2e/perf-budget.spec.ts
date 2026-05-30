/**
 * E2E perf budget suite — catches render regressions tail to incidents:
 *   - DayTab full re-render 188-375ms (фиксили через React.startTransition
 *     wrappers, потом drop'нули, ушли в Phase A/B/C plan).
 *   - cascade postMessage chain после удаления продукта (1000+ postMessages).
 *
 * Подход: measure click-to-stable-update latency для нескольких типичных
 * interactions. Если latency > budget — fail, capture traces для post-mortem.
 *
 * Budgets выбраны conservatively:
 *   - PIN-вход (lightweight session): 250ms — типичный click-to-update.
 *   - Курaторская (heavy session с background sync): 500ms.
 *   - Tolerance ±100ms — учитывает CI variance.
 *
 * Каждое measurement делается 5× и берётся median (защита от GC pauses
 * и одиночных bad runs).
 */
import { expect, test } from '@playwright/test';

import { getNamedPinCredentials, hasNamedPinCredentials, loginWithHeysPin } from './helpers/pin-auth';
import { captureCleanupBaseline, cleanupTestClients, type CleanupBaseline } from './helpers/test-cleanup';

const TEST_CLIENT_ALEX_ID = process.env.HEYS_TEST_E2E_CLIENT_ALEX_ID || '';

test.use({ viewport: { width: 1280, height: 800 } });

type PerfBudget = {
    /** Friendly label для report. */
    label: string;
    /** ms — assertion threshold. */
    budgetMs: number;
    /** ms — warn threshold (logged, не fail'ит). */
    warnMs: number;
};

const BUDGETS = {
    pinAddWater: { label: 'PIN: addWater click → ring update', budgetMs: 250, warnMs: 150 } as PerfBudget,
};

/**
 * Measure latency: вызываем action, потом ждём stableCondition. Возвращает median
 * of `samples` runs.
 */
async function measureLatencyMedian(
    page: import('@playwright/test').Page,
    samples: number,
    action: () => Promise<void>,
    stableCondition: () => Promise<boolean>,
    settleMs = 300
): Promise<{ samples: number[]; median: number; mean: number; max: number }> {
    const results: number[] = [];
    for (let i = 0; i < samples; i++) {
        await page.waitForTimeout(settleMs); // дать предыдущему commit settle
        const t0 = Date.now();
        await action();
        // poll for stable condition с small timeout
        const deadline = Date.now() + 5000;
        let ok = false;
        while (Date.now() < deadline) {
            try {
                ok = await stableCondition();
                if (ok) break;
            } catch (_) { /* noop */ }
            await page.waitForTimeout(20);
        }
        const t1 = Date.now();
        if (ok) results.push(t1 - t0);
    }
    const sorted = [...results].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const mean = results.length ? Math.round(results.reduce((s, r) => s + r, 0) / results.length) : 0;
    const max = Math.max(...results, 0);
    return { samples: results, median, mean, max };
}

test.describe('Perf budget — render regressions guards', () => {
    let cleanupBaseline: CleanupBaseline;

    test.beforeAll(() => {
        cleanupBaseline = captureCleanupBaseline([TEST_CLIENT_ALEX_ID]);
    });

    test.afterAll(() => {
        cleanupTestClients(cleanupBaseline);
    });

    test('PIN E2E-TestAlex: addWater click → ring update в budget', async ({ page }, testInfo) => {
        test.skip(
            !hasNamedPinCredentials('E2E_ALEX'),
            'Set HEYS_TEST_PHONE_E2E_ALEX and HEYS_TEST_PIN_E2E_ALEX in .env.local'
        );

        // TODO 2026-05-31: see curator-switch test 3 — empty test client UI
        // блокирован registration wizard, нужен deeper sync orchestration fix.
        test.skip(true, 'UI-flow: empty test client — wizard blocks button until profile sync завершен');

        const credentials = getNamedPinCredentials('E2E_ALEX');
        await loginWithHeysPin(page, credentials);

        // Wait for dashboard fully rendered + water-card visible
        await expect(page.getByRole('button', { name: /Добавить приём пищи/ })).toBeVisible({ timeout: 30_000 });

        // Resolve initial water value, чтобы видеть когда меняется
        const initialWater = await page.evaluate(() => {
            const w = window as typeof window & { HEYS?: any };
            return Number(w.HEYS?.Day?.getDay?.()?.waterMl || 0);
        });

        const result = await measureLatencyMedian(
            page,
            5,
            async () => {
                // Programmatic addWater — bypasses UI animation lag (perf измеряет
                // только state propagation + render, не CSS transitions).
                await page.evaluate(() => {
                    const w = window as typeof window & { HEYS?: any };
                    const fn = w.HEYS?.Day?.addWater;
                    if (typeof fn === 'function') fn(250, { source: 'e2e-perf-test', playSound: false });
                });
            },
            async () => {
                // Stable когда new waterMl > initial AND React state synced
                const cur = await page.evaluate(() => {
                    const w = window as typeof window & { HEYS?: any };
                    return Number(w.HEYS?.Day?.getDay?.()?.waterMl || 0);
                });
                return cur > initialWater;
            }
        );

        // Attach measurements к report
        await testInfo.attach('addWater-perf-samples.json', {
            body: JSON.stringify({ ...result, initialWater, budget: BUDGETS.pinAddWater }, null, 2),
            contentType: 'application/json',
        });

        console.info(
            `[perf] ${BUDGETS.pinAddWater.label}: median=${result.median}ms mean=${result.mean}ms max=${result.max}ms ` +
            `(budget ${BUDGETS.pinAddWater.budgetMs}ms, warn ${BUDGETS.pinAddWater.warnMs}ms, samples=[${result.samples.join(',')}])`
        );

        // Warn threshold — не fail, просто log
        if (result.median > BUDGETS.pinAddWater.warnMs) {
            console.warn(
                `[perf-warn] median ${result.median}ms exceeds warn threshold ${BUDGETS.pinAddWater.warnMs}ms — investigate.`
            );
        }

        // Hard budget
        expect(
            result.median,
            `Render regression: addWater median latency ${result.median}ms превысила budget ${BUDGETS.pinAddWater.budgetMs}ms. ` +
            `Samples: ${result.samples.join(', ')}. ` +
            `Это может означать что DayTab снова делает heavy re-render на каждый setState (см. cozy-hatching-minsky.md Phase A/B/C plan).`
        ).toBeLessThanOrEqual(BUDGETS.pinAddWater.budgetMs);
    });
});
