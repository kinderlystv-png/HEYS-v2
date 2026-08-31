import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '..');

function read(name) {
    return fs.readFileSync(path.join(webRoot, name), 'utf8');
}

describe('HEYS loading surfaces do not use tab skeletons', () => {
    it('does not load the leftover tab-skeleton module on boot', () => {
        const html = read('index.html');
        expect(html).not.toContain('heys_app_skeletons_v1.js');
        expect(fs.existsSync(path.join(webRoot, 'heys_app_skeletons_v1.js'))).toBe(false);
    });

    it('product callers wait silently instead of mounting TabSkeleton or shimmers', () => {
        const shell = read('heys_app_shell_v1.js');
        const tabs = read('heys_app_tabs_v1.js');
        const widgets = read('heys_widgets_ui_v1.js');
        const gate = read('heys_app_gate_flow_v1.js');
        const diary = read('heys_day_diary_section.js');
        const dayRender = read('heys_day_tab_render_v1.js');
        const addProduct = read('heys_add_product_step_v1.js');
        const leaderboard = read('heys_leaderboard_section_v1.js');
        const sparklines = read('heys_day_sparklines_v1.js');
        const insights = read('insights/pi_ui_dashboard.js');
        const mealRec = read('insights/pi_ui_meal_rec_card.js');

        for (const source of [shell, tabs, widgets, gate, diary, dayRender, addProduct, leaderboard, sparklines]) {
            expect(source).not.toContain('AppSkeletons?.TabSkeleton');
            expect(source).not.toContain('DayTabSkeleton');
            expect(source).not.toContain('RationSkeleton');
            expect(source).not.toContain('UserSkeleton');
            expect(source).not.toContain('tabFallbackSkeleton');
            expect(source).not.toContain('deferred-card-skeleton__shimmer');
            expect(source).not.toContain('Готовим дневник');
        }

        expect(addProduct).not.toContain('AddProductResultsSkeleton');
        expect(addProduct).not.toContain('showProductsSkeleton');
        expect(leaderboard).not.toContain('renderLeaderboardSkeleton');
        expect(leaderboard).not.toContain('skeleton-chip');
        expect(sparklines).not.toContain('sparkline-skeleton');
        expect(tabs).not.toContain('skeleton-block');
        // Прежде проверялся только вызов: компонент разрешалось объявить, лишь
        // бы не рисовать. Так он и прожил — объявленным, экспортированным и
        // мёртвым, вместе со своими стилями. Теперь запрещено само имя.
        expect(insights).not.toContain('SkeletonCard');
        expect(insights).not.toContain('insights-skeleton');
        expect(mealRec).not.toContain('meal-rec-card--skeleton');

        expect(shell).toContain('fallback: null');
        expect(shell).toContain('Модуль не загрузился. Обнови экран.');
        expect(gate).not.toContain('HEYS.AppLoader');
        expect(fs.readFileSync(path.join(webRoot, 'heys_app_gates_v1.js'), 'utf8')).not.toContain('app-loader-skeleton');
        expect(widgets).not.toContain('widgets-tab--loading');
        expect(gate).toContain("'data-heys-visible-frame': 'subscription-loading'");
    });

    it('keeps no skeleton in the fingers lazy stub and no dead sparkline skeleton css', () => {
        // Контракт spinners: «скелетонов нет — ни одного, нигде» и «поблочной
        // загрузки нет: блок, который ещё думает, — дефект, а не состояние».
        const fingersStub = read('heys_fingers_boot_stub_v1.js');
        expect(fingersStub).not.toContain('fingers-fs-pill-skeleton');
        expect(fingersStub).not.toContain('Загрузка…');
        const metrics = read('styles/modules/100-metrics-and-graphs.css');
        expect(metrics).not.toMatch(/\.sparkline-skeleton[a-z-]*\s*\{/);
    });
});
