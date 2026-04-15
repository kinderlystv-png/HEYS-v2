import * as fs from 'node:fs';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import { hasHeysPinCredentials, loginWithHeysPin } from './helpers/pin-auth';

test.use({
    viewport: { width: 393, height: 851 },
    isMobile: true,
    hasTouch: true,
});

type ToggleSample = {
    iteration: number;
    fromLabel: string;
    toLabel: string;
    clickToAriaMs: number;
    clickToPaintMs: number;
    longTaskCount: number;
    longTasksTotalMs: number;
    longTaskMaxMs: number;
};

function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return sorted[idx];
}

test.describe('Planning calendar day-window perf', () => {
    test.skip(!hasHeysPinCredentials(), 'Set HEYS_TEST_PHONE and HEYS_TEST_PIN in .env.local');

    test('collect long-task and input-to-paint metrics when toggling 3д / 5д / 8д', async ({ page }) => {
        await page.addInitScript(() => {
            const w = window as Window & {
                __heysPlanningLongTasks?: Array<{ duration: number; startTime: number }>;
            };
            w.__heysPlanningLongTasks = [];
            if (typeof PerformanceObserver === 'undefined') return;
            try {
                const obs = new PerformanceObserver((list) => {
                    for (const e of list.getEntries()) {
                        if (e.entryType === 'longtask') {
                            w.__heysPlanningLongTasks!.push({
                                duration: e.duration,
                                startTime: e.startTime,
                            });
                        }
                    }
                });
                obs.observe({ entryTypes: ['longtask'] });
            } catch {
                /* Long Task API unavailable */
            }
        });

        await loginWithHeysPin(page);

        await page.locator('#tour-tasks-tab').click();
        await expect(page.locator('.planning-calendar-nav__window-toggle')).toBeVisible({ timeout: 45000 });
        await expect(page.locator('.planning-subnav__item[data-screen="calendar"].active')).toBeVisible({
            timeout: 15000,
        });

        const warmIterations = 3;
        const measureIterations = 24;
        const cycle = ['3д', '5д', '8д'] as const;

        const samples = await page.evaluate(
            ({ warm, measure, cycle: cycleArg }) => {
                const w = window as Window & {
                    __heysPlanningLongTasks?: Array<{ duration: number; startTime: number }>;
                };

                function waitNextPaint(): Promise<void> {
                    return new Promise((resolve) => {
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => resolve());
                        });
                    });
                }

                function getToggleButton(label: string): HTMLButtonElement | null {
                    const group = document.querySelector('.planning-calendar-nav__window-toggle');
                    if (!group) return null;
                    const buttons = Array.from(group.querySelectorAll('button'));
                    return (
                        (buttons.find((b) => (b.textContent || '').trim() === label) as HTMLButtonElement | null) ||
                        null
                    );
                }

                function readActiveLabel(): string | null {
                    const group = document.querySelector('.planning-calendar-nav__window-toggle');
                    if (!group) return null;
                    const pressed = group.querySelector('button[aria-pressed="true"]');
                    return pressed ? (pressed.textContent || '').trim() : null;
                }

                async function clickWindowOption(toLabel: string): Promise<void> {
                    const btn = getToggleButton(toLabel);
                    if (!btn) throw new Error('missing_window_toggle:' + toLabel);
                    btn.click();
                    const t0 = performance.now();
                    while (btn.getAttribute('aria-pressed') !== 'true') {
                        await new Promise<void>((r) => {
                            requestAnimationFrame(() => r());
                        });
                        if (performance.now() - t0 > 8000) {
                            throw new Error('timeout_waiting_aria_pressed:' + toLabel);
                        }
                    }
                    await waitNextPaint();
                }

                return (async () => {
                    const buf = w.__heysPlanningLongTasks || [];
                    buf.length = 0;

                    for (let i = 0; i < warm; i++) {
                        const label = cycleArg[i % cycleArg.length];
                        await clickWindowOption(label);
                    }

                    const samples: ToggleSample[] = [];

                    for (let i = 0; i < measure; i++) {
                        const toLabel = cycleArg[i % cycleArg.length];
                        const fromLabel = readActiveLabel() || '?';

                        const btn = getToggleButton(toLabel);
                        if (!btn) throw new Error('missing_window_toggle:' + toLabel);

                        const ltBefore = buf.length;
                        const tClick = performance.now();
                        btn.click();

                        let tAria = tClick;
                        while (btn.getAttribute('aria-pressed') !== 'true') {
                            await new Promise<void>((r) => {
                                requestAnimationFrame(() => r());
                            });
                            tAria = performance.now();
                            if (tAria - tClick > 8000) {
                                throw new Error('timeout_waiting_aria_pressed:' + toLabel);
                            }
                        }

                        await waitNextPaint();
                        const tPaint = performance.now();

                        const slice = buf.slice(ltBefore);
                        const inWindow = slice.filter((e) => e.startTime >= tClick - 1 && e.startTime <= tPaint);
                        const longTasksTotalMs = inWindow.reduce((s, e) => s + e.duration, 0);
                        const longTaskMaxMs = inWindow.length
                            ? inWindow.reduce((m, e) => Math.max(m, e.duration), 0)
                            : 0;

                        samples.push({
                            iteration: i,
                            fromLabel,
                            toLabel,
                            clickToAriaMs: tAria - tClick,
                            clickToPaintMs: tPaint - tClick,
                            longTaskCount: inWindow.length,
                            longTasksTotalMs,
                            longTaskMaxMs,
                        });
                    }

                    return samples;
                })();
            },
            { warm: warmIterations, measure: measureIterations, cycle: [...cycle] },
        );

        const paintMs = samples.map((s) => s.clickToPaintMs).sort((a, b) => a - b);
        const ariaMs = samples.map((s) => s.clickToAriaMs).sort((a, b) => a - b);
        const longTaskMaxAll = samples.map((s) => s.longTaskMaxMs).sort((a, b) => a - b);

        const byEdge = new Map<string, ToggleSample[]>();
        for (const s of samples) {
            const key = `${s.fromLabel}→${s.toLabel}`;
            const arr = byEdge.get(key) || [];
            arr.push(s);
            byEdge.set(key, arr);
        }

        const edgeSummary: Record<
            string,
            { count: number; p50PaintMs: number; p95PaintMs: number; maxLongTaskMs: number; longTaskEvents: number }
        > = {};

        for (const [key, arr] of byEdge) {
            const paints = arr.map((x) => x.clickToPaintMs).sort((a, b) => a - b);
            edgeSummary[key] = {
                count: arr.length,
                p50PaintMs: percentile(paints, 50),
                p95PaintMs: percentile(paints, 95),
                maxLongTaskMs: Math.max(0, ...arr.map((x) => x.longTaskMaxMs)),
                longTaskEvents: arr.reduce((s, x) => s + x.longTaskCount, 0),
            };
        }

        const heap = await page.evaluate(() => {
            const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
                .memory;
            return m
                ? {
                      usedJSHeapSize: m.usedJSHeapSize,
                      totalJSHeapSize: m.totalJSHeapSize,
                  }
                : null;
        });

        const report = {
            meta: {
                viewport: { width: 393, height: 851 },
                warmIterations,
                measureIterations,
                cycle,
                collectedAt: new Date().toISOString(),
            },
            aggregate: {
                clickToPaintMs: {
                    min: Math.min(...paintMs),
                    p50: percentile(paintMs, 50),
                    p95: percentile(paintMs, 95),
                    max: Math.max(...paintMs),
                },
                clickToAriaMs: {
                    min: Math.min(...ariaMs),
                    p50: percentile(ariaMs, 50),
                    p95: percentile(ariaMs, 95),
                    max: Math.max(...ariaMs),
                },
                longTaskMaxMs: {
                    p50: percentile(longTaskMaxAll, 50),
                    p95: percentile(longTaskMaxAll, 95),
                    max: Math.max(...longTaskMaxAll),
                },
                totalLongTaskEvents: samples.reduce((s, x) => s + x.longTaskCount, 0),
            },
            byTransition: edgeSummary,
            samples,
            jsHeapAfter: heap,
        };

        const outDir = path.join(process.cwd(), 'test-results');
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'planning-calendar-window-perf.json');
        fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

        // eslint-disable-next-line no-console
        console.info(`[planning-calendar-window-perf] wrote ${outFile}`);
        // eslint-disable-next-line no-console
        console.info('[planning-calendar-window-perf] aggregate', JSON.stringify(report.aggregate, null, 2));
        // eslint-disable-next-line no-console
        console.info('[planning-calendar-window-perf] byTransition', JSON.stringify(report.byTransition, null, 2));

        expect(samples.length).toBe(measureIterations);

        const veryLong = samples.filter((s) => s.longTaskMaxMs >= 200);
        if (veryLong.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
                `[planning-calendar-window-perf] ${veryLong.length} samples had longtask max >= 200ms (possible main-thread jank)`,
            );
        }
    });
});
