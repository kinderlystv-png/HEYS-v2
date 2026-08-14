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
        const start = uiSrc.indexOf("v4Kicker('Инсулиновая волна')");
        const chunk = uiSrc.slice(start, start + 900);
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
        expect(uiSrc).toContain('Долгое нажатие — взять виджет');
        expect(uiSrc).toContain("enterEditMode?.()");
        expect(cssSrc).toContain('.widgets-tab--editing .widget__delete-btn');
        const coreSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_core_v1.js'), 'utf8');
        expect(coreSrc).toContain('_editSnapshot');
        expect(coreSrc).toContain('opts?.revert');
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

    it('БЖУ 3×2 — кольца 60px, ряд по центру с щелью 20px', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 1400);
        expect(chunk).toContain('width: 60');
        expect(chunk).toContain('height: 60');
        expect(cssSrc).toContain('.widget-v4-macros');
        expect(cssSrc).toContain('justify-content: center');
        expect(cssSrc).toContain('gap: 20px');
    });

    it('БЖУ 3×2 — перебор второй дугой (как macro-ring-fill--over)', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 2200);
        expect(chunk).toContain('widget-v4-macro__ring-over');
        expect(chunk).toContain('hasOver && overPct > 0');
        expect(chunk).toContain('--v4-macro-over-offset');
        expect(cssSrc).toContain('.widget-v4-macro__ring-over--warn');
    });

    it('БЖУ 3×2 — в кольце остаток, в шапке «Осталось сегодня»', () => {
        const ringStart = uiSrc.indexOf('function v4SageRing');
        const ringChunk = uiSrc.slice(ringStart, ringStart + 2400);
        expect(ringChunk).toContain('const remaining = tgt - num');
        expect(ringChunk).toContain('widget-v4-macro__num--over');
        expect(ringChunk).toContain("className: 'widget-v4-macro__num-sign'");
        expect(ringChunk).toContain("}, '-'),");

        const macrosStart = uiSrc.indexOf("className: 'widget-macros widget-macros--3x2 widget-v4-stack'");
        const macrosChunk = uiSrc.slice(macrosStart, macrosStart + 600);
        expect(macrosChunk).toContain('widget-v4-macros__head widget-v4-kicker');
        expect(macrosChunk).toContain('· Осталось сегодня');

        expect(cssSrc).toContain('.widget-v4-macros__head');
        expect(cssSrc).toContain('.widget-v4-macros__hint');
        expect(cssSrc).toContain('.widget-v4-macro__num--over');
        expect(cssSrc).toContain('.widget-v4-macro__num--over .widget-v4-macro__num-sign');
    });

    it('риск-радар 2×2 не красит «низкий» классическим ratio-green', () => {
        const start = uiSrc.indexOf("v4Kicker('Риск-радар')");
        const chunk = uiSrc.slice(start, start + 700);
        expect(chunk).toContain("level === 'low' || !level ? 'widget-v4-ok' : 'widget-v4-warn'");
        expect(chunk).not.toContain('style: { color }');
        expect(cssSrc).toContain('.widget-v4-hero-num__val.widget-v4-ok');
        expect(cssSrc).toContain('var(--v4-ok-text');
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
});
