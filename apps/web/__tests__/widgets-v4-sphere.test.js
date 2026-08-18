// widgets-v4-sphere.test.js — волна без обводки, радар и герои из --v4-*
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const cssRoles = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

describe('виджеты g1 в сфере палитры', () => {
    it('инсулиновая волна — заливка без обводки по горбам, линия только пол', () => {
        const start = uiSrc.indexOf('const waveStatus = (status === \'complete\'');
        const chunk = uiSrc.slice(start, start + 950);
        expect(chunk).toContain("className: 'widget-v4-wave__fill'");
        expect(chunk).toContain('L3,46 Z');
        expect(chunk).not.toContain('V52');
        expect(cssSrc).toContain('.widget-v4-wave__fill');
        expect(cssSrc).toContain('stroke: none');
        expect(cssSrc).toContain('var(--v4-sand-wave-fill');
        expect(cssRoles).toContain('--v4-sand-wave-fill');
    });

    it('оценка дня 2×1 — строка как в g1, число из --v4-act-text', () => {
        const start = uiSrc.indexOf("v4Kicker('Оценка дня')");
        const chunk = uiSrc.slice(start, start + 400);
        expect(chunk).toContain('widget-v4-row');
        expect(chunk).toContain("widget-v4-unit");
        expect(cssSrc).toContain('.widget--dayScore .widget-day-score--short.widget-v4-row');
        expect(cssSrc).toContain('.widget-v4-row__value');
        expect(cssSrc).toContain('var(--v4-act-text');
    });

    it('расстановка g2: каталог в сетке, минус, Отмена откатывает', () => {
        expect(uiSrc).toContain('function CatalogStrip');
        expect(uiSrc).toContain('widget-v4-catalog');
        expect(uiSrc).toContain('Потяни виджет');
        expect(uiSrc).toContain("enterEditMode?.()");
        expect(uiSrc).toContain('WIDGET_EDIT_RESIZE_ENABLED = false');
        expect(uiSrc).toContain('isEditMode && WIDGET_EDIT_RESIZE_ENABLED && React.createElement(React.Fragment');
        expect(cssSrc).toContain('.widgets-tab--editing .widget--editing');
        expect(cssSrc).toContain('animation: widget-wiggle');
        expect(cssSrc).toContain('.widgets-tab--editing .widget__delete-btn');
        const coreSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
        expect(coreSrc).toContain('_editSnapshot');
        expect(coreSrc).toContain('opts?.revert');
        expect(coreSrc).toContain('if (!state.isEditMode()) return');
        expect(coreSrc).not.toContain("emit('editmode:longpress'");
    });

    it('песочная тёмная — грунт #141210, плитки #23201b, как g1d', () => {
        const start = cssRoles.indexOf('[data-theme-id="sand-dark"]');
        const block = cssRoles.slice(start, cssRoles.indexOf('[data-theme-id="blue"]'));
        expect(block).toContain('--v4-bg: #141210');
        expect(block).toContain('--v4-surface: #23201b');
        expect(block).toContain('--v4-hero: #2f2820');
        expect(block).toContain('--v4-ok-bg: #242c20');
        expect(block).toContain('--v4-act: #cf8144');
        expect(block).toContain('--v4-act-text: #e2a468');
        expect(block).toContain('--v4-ink: #f2ede6');
    });

    it('БЖУ 3×2 — кольца 56px, ряд по центру с щелью 6px', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 1400);
        expect(chunk).toContain('width: 56');
        expect(chunk).toContain('height: 56');
        expect(cssSrc).toContain('.widget-v4-macros');
        expect(cssSrc).toContain('justify-content: center');
        expect(cssSrc).toContain('gap: 6px');
    });

    it('БЖУ 3×2 — перебор второй дугой (как macro-ring-fill--over)', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 3200);
        expect(chunk).toContain('widget-v4-macro__ring-over');
        expect(chunk).toContain('hasOver && overPct > 0');
        expect(chunk).toContain('--v4-macro-over-offset');
        expect(cssSrc).toContain('.widget-v4-macro__ring-over--warn');
    });

    it('БЖУ 3×2 — подпись над кольцом, факт/норма под, без шапки БЖУ', () => {
        const ringStart = uiSrc.indexOf('function v4SageRing');
        const ringChunk = uiSrc.slice(ringStart, ringStart + 3600);
        expect(ringChunk).toContain('const remaining = tgt - num');
        expect(ringChunk).toContain('widget-v4-macro__num--bad');
        expect(ringChunk).toContain("className: 'widget-v4-macro__num-sign'");
        expect(ringChunk).toContain("}, '-'),");
        expect(ringChunk).toContain('widget-v4-macro__fact');
        expect(ringChunk).toContain('widget-v4-macro__label');
        expect(ringChunk).toContain('macroDeviationBad');

        const macrosStart = uiSrc.indexOf("className: 'widget-macros widget-macros--3x2 widget-v4-stack'");
        const macrosChunk = uiSrc.slice(macrosStart, macrosStart + 500);
        expect(macrosChunk).not.toContain('widget-v4-macros__head');
        expect(macrosChunk).not.toContain('Осталось сегодня');

        expect(cssSrc).toContain('.widget-v4-macro__fact');
        expect(cssSrc).toContain('.widget-v4-macro__fact--bad');
        expect(cssSrc).toContain('.widget-v4-macro__num--bad');
    });

    it('риск-радар 2×2 — «низкий» шалфей, жирнее, без inline color', () => {
        const start = uiSrc.indexOf("v4Kicker('Риск-радар')");
        const chunk = uiSrc.slice(start, start + 900);
        expect(chunk).toContain('widget-v4-hero-num__val--risk');
        expect(chunk).toContain('v4RiskLevelState(level)');
        expect(chunk).toContain('v4ValueStateClass');
        expect(chunk).not.toContain('widget-v4-ok');
        expect(chunk).not.toContain('style: { color }');
        expect(cssSrc).toContain('.widget-v4-hero-num__val--risk');
        expect(cssSrc).toContain('font-weight: 700');
        expect(cssSrc).toContain('.widget-v4-val--good');
        expect(cssSrc).toContain('var(--v4-ok-text');
    });

    it('цвет значения по состоянию — сон, вода, вес', () => {
        expect(uiSrc).toContain('function v4SleepValueState');
        expect(uiSrc).toContain('function v4WaterValueState');
        expect(uiSrc).toContain('function v4WeightSparkTrendState');
        expect(uiSrc).toContain('function v4ValueStateClass');
        expect(uiSrc).toMatch(/function v4ValueStateClass[\s\S]{0,200}widget-v4-val--act/);
        const sleepChunk = uiSrc.slice(uiSrc.indexOf('function SleepWidgetContent'), uiSrc.indexOf('function SleepWidgetContent') + 1200);
        expect(sleepChunk).toContain('v4SleepValueState');
        const waterChunk = uiSrc.slice(uiSrc.indexOf('function WaterWidgetContent'), uiSrc.indexOf('function WaterWidgetContent') + 2000);
        expect(waterChunk).toContain('v4WaterValueState');
        expect(waterChunk).toContain('data.isClosedDay');
    });

    it('тренд здоровья, инсулин, heatmap — v4-val--* без widget-v4-ok на героях', () => {
        expect(uiSrc).toContain('function v4HealthTrendState');
        expect(uiSrc).toContain('function v4InsulinWaveStatusState');
        expect(uiSrc).toContain('function v4HeatmapMetaState');
        expect(uiSrc).toContain('V4_MACRO_DEVIATION_PCT = 0.05');

        const healthStart = uiSrc.indexOf("v4Kicker('Тренд здоровья')");
        const healthChunk = uiSrc.slice(healthStart, healthStart + 600);
        expect(healthChunk).toContain('v4HealthTrendState');
        expect(healthChunk).not.toContain('widget-v4-ok');

        expect(uiSrc).toContain('function v4InsulinWaveStatusState');
        expect(uiSrc).toMatch(/widget-v4-stack__footer[\s\S]{0,200}v4InsulinWaveStatusState/);

        expect(cssSrc).toContain('.widget-v4-row__value.widget-v4-val--good');
        expect(cssSrc).toContain('.widget-v4-stack__footer .widget-v4-val--good');
    });

    it('калории 2×1 — «Осталось» строкой, terracotta hero', () => {
        const start = uiSrc.indexOf('// 2×1 — канвас g1: «Осталось N»');
        const chunk = uiSrc.slice(start, start + 900);
        expect(chunk).toContain("'Осталось '");
        expect(chunk).toContain('widget-v4-val--act');
        expect(chunk).not.toContain('widget-calories__hero-bar');
    });

    it('вода — медиана подъёма 14 дней в widget_data', () => {
        const dataSrc = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
        expect(dataSrc).toContain('_getMedianSleepEndMinutes');
        expect(dataSrc).toContain('medianWakeMinutes');
        expect(dataSrc).toContain('weightMorningEstimated !== true');
    });

    it('закрытый день — итог калорий, вода без порога', () => {
        const dataSrc = fs.readFileSync(path.join(WEB_DIR, 'widgets/widget_data.js'), 'utf8');
        expect(dataSrc).toContain('_isClosedDay');
        expect(dataSrc).toContain('isClosedDay: this._isClosedDay()');
        expect(uiSrc).toContain('итог дня');
        expect(uiSrc).toMatch(/data\.isClosedDay[\s\S]{0,80}neutral/);
    });

    it('главная — layout из localStorage сразу, без sync-скелетона', () => {
        expect(uiSrc).toContain('function bootstrapWidgetsLayout()');
        expect(uiSrc).toContain('useState(() => bootstrapWidgetsLayout())');
        expect(uiSrc).not.toContain('WidgetsSyncSkeleton');
        expect(uiSrc).not.toContain('showDashboardSkeleton');
        expect(uiSrc).not.toContain('isSyncLoading');
        expect(uiSrc).toContain('const applyWidgetsLayout = useCallback');
        expect(uiSrc).toMatch(/!isEditMode && widgets\.length > 0 && React\.createElement\('button', \{\s*\n\s*type: 'button',\s*\n\s*className: 'widget-v4-add'/);
    });

    it('динамика веса 2×1 — v4 виды и долгий тап', () => {
        expect(uiSrc).toContain('WEIGHT_DYNAMICS_VARIANTS');
        expect(uiSrc).toContain('WeightDynamicsTile2x1');
        expect(uiSrc).toContain('displayVariant');
        expect(uiSrc).toContain('weightDynamics:variantSaved');
        expect(uiSrc).not.toMatch(/2×1[\s\S]{0,400}widget-v4-periods/);
        expect(cssSrc).toContain('.widget-wd-sheet');
        expect(cssSrc).toContain('widget-wd--holding');
        expect(uiSrc).toContain('React.createElement(WeightDynamicsSparkSvg,');
        expect(uiSrc).not.toContain('? WeightDynamicsSparkSvg({');
    });
});
