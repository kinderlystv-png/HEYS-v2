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
        const start = uiSrc.indexOf('function InsulinWaveDaySvg');
        const chunk = uiSrc.slice(start, start + 2600);
        expect(chunk).toContain("className: 'widget-v4-insulin-wave__fill'");
        // Линия по полу осталась, но рисуется прямо в схеме: компонент
        // InsulinWaveBaseline снят вместе с осью времени и меткой «сейчас»
        // (контракт 22 августа, строки «схема, а не таймлайн» и «базовая линия»).
        expect(chunk).toContain("x1: 0, y1: baseY, x2: 130, y2: baseY");
        expect(cssSrc).toContain('.widget-v4-insulin-wave__fill');
        expect(cssSrc).toContain('.widget-v4-wave__fill');
        expect(cssSrc).toContain('stroke: none');
        expect(cssSrc).toContain('var(--v4-sand-wave-fill');
        expect(cssRoles).toContain('--v4-sand-wave-fill');
    });

    it('оценка дня 2×1 — строка как в g1, число из --v4-act-text', () => {
        expect(uiSrc).toContain('function DayScoreVariantBody');
        expect(uiSrc).toContain('widget-v4-row');
        expect(uiSrc).toContain('widget-v4-unit');
        expect(cssSrc).toContain('.widget--dayScore .widget-day-score--short.widget-v4-row');
        expect(cssSrc).toContain('.widget-v4-row__value');
        expect(cssSrc).toContain('var(--v4-act-text');
    });

    it('расстановка g2: каталог в сетке, минус, Отмена откатывает', () => {
        expect(uiSrc).toContain('function CatalogStrip');
        expect(uiSrc).toContain('widget-v4-catalog');
        // Перетаскивание в расстановке начинается сразу при касании и сдвиге
        // (канвас v4, строка 56) — подсказка про удержание была бы ложной.
        expect(uiSrc).not.toContain('Долгое нажатие — взять виджет');
        expect(uiSrc).toContain('Потяните плитку, чтобы поменять порядок');
        expect(uiSrc).toContain("enterEditMode?.()");
        expect(uiSrc).toContain('WIDGET_EDIT_RESIZE_ENABLED = false');
        expect(uiSrc).toContain('isEditMode && WIDGET_EDIT_RESIZE_ENABLED && React.createElement(React.Fragment');
        expect(cssSrc).toContain('.widgets-tab--editing .widget--editing');
        // Плитка приглушается, дрожания нет (строка 51).
        expect(cssSrc).not.toContain('animation: widget-wiggle');
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

    // Строка контракта «вид · кольца БЖУ»: svg 46 × 46. До 31 августа код
    // рисовал 56 — кольца были на 22 % крупнее кадра и съедали воздух 3×2.
    it('БЖУ 3×2 — кольца 46px, ряд по центру с щелью 6px', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 1400);
        expect(chunk).toContain('width: 46');
        expect(chunk).toContain('height: 46');
        expect(cssSrc).toContain('.widget-v4-macros');
        expect(cssSrc).toContain('justify-content: center');
        expect(cssSrc).toContain('gap: 6px');
    });

    it('БЖУ 3×2 — дуга упирается в норму, отклонение несут остаток и факт', () => {
        const start = uiSrc.indexOf('function v4SageRing');
        const chunk = uiSrc.slice(start, start + 3200);
        expect(chunk).toContain('macroRingArcPct(arcNum, tgt, 0)');
        expect(chunk).not.toContain('widget-v4-macro__ring-over');
        expect(chunk).not.toContain('hasOver && overPct > 0');
        expect(cssSrc).toMatch(/\.widget-v4-macro svg\s*\{[^}]*display:\s*inline;[^}]*vertical-align:\s*baseline;/s);
        expect(cssSrc).toMatch(/\.widget-v4-macro\s*\{[^}]*font-size:\s*16px;[^}]*line-height:\s*normal;/s);
    });

    it('БЖУ 3×2 — подпись над кольцом, факт/норма под, без шапки БЖУ', () => {
        const ringStart = uiSrc.indexOf('function v4SageRing');
        const ringChunk = uiSrc.slice(ringStart, ringStart + 3600);
        expect(ringChunk).toContain('const remaining = tgt - num');
        expect(ringChunk).toContain('widget-v4-macro__num--bad');
        expect(ringChunk).toContain("className: 'widget-v4-macro__num-sign'");
        expect(ringChunk).toContain("}, '−'),");
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

    it('риск-радар 2×2 — «низкий» тёмным шалфеем, без inline color', () => {
        expect(uiSrc).toContain('function RelapseRiskVariantBody');
        expect(uiSrc).toContain('widget-v4-hero-num__val--risk');
        expect(uiSrc).toContain('v4RiskLevelState(level)');
        expect(uiSrc).toContain('v4ValueStateClass');
        expect(uiSrc).not.toContain('widget-v4-ok');
        const listStart = uiSrc.indexOf("if (size === '2x2' || variantId === 'list')");
        const listChunk = uiSrc.slice(listStart, listStart + 900);
        expect(listChunk).not.toContain('style: { color }');
        expect(cssSrc).toContain('.widget-v4-hero-num__val--risk');
        expect(cssSrc).toContain('.widget-v4-val--good');
        expect(cssSrc).toContain('var(--v4-ok-text');
        // канвас: слово уровня 26px/600 тёмным шалфеем, светлый #7a8a5e
        // остаётся только заливкам
        expect(cssSrc).toContain('.widget-relapse-risk .widget-v4-hero-num__val--risk.widget-v4-val--good');
    });

    it('риск-радар — «Главный риск» и «Шкала» по канвасу', () => {
        expect(uiSrc).toContain('function relapseCanvasLevel');
        expect(uiSrc).toMatch(/relapseCanvasLevel[\s\S]*'критичный'[\s\S]*'высокий'[\s\S]*'средний'[\s\S]*'низкий'/);
        // 2×1: уровень подписью справа в шапке, риск назван внизу
        expect(uiSrc).toContain('widget-risk-level');
        expect(uiSrc).toContain('widget-risk-main__driver');
        // 2×2 «Шкала»: четыре отрезка и строка «поднимут: …», а не список слов
        expect(uiSrc).toContain('widget-risk-steps__seg');
        expect(uiSrc).toContain('поднимут: ');
        expect(uiSrc).not.toContain('widget-v4-risk-scale');
        expect(cssSrc).not.toContain('.widget-v4-risk-scale__step');
        expect(cssSrc).toContain('.widget-risk-steps__seg--on');
    });

    it('шторка смены вида — строки на подложке во всех четырёх палитрах', () => {
        // Канвас .opt: своя подложка, радиус 18, паддинг 7; выбранная строка —
        // тёплый акцент с обводкой, и он тёплый во всех палитрах.
        expect(cssSrc).toMatch(/\.widget-wd-sheet__opt \{[\s\S]*?border-radius: 18px;[\s\S]*?padding: 7px;[\s\S]*?background: rgba\(0, 0, 0, 0\.04\)/);
        // Сверять надо тело одного правила, а не «что угодно до ближайшего
        // background: transparent». Ненасытная группа ничем не ограничена
        // справа и перешагивает границы правил: 27.08 её увёл
        // .widget-bd-sheet__wave-week-seg, появившийся на 1200 строк ниже
        // вместе с листами разбора, и тест покраснел при верном CSS.
        const optAt = cssSrc.indexOf('.widget-wd-sheet__opt {');
        const optRule = cssSrc.slice(optAt, cssSrc.indexOf('}', optAt));
        expect(optRule).not.toContain('background: transparent');
        expect(cssSrc).toContain('[data-theme$="dark"] .widget-wd-sheet__opt {');
        expect(cssSrc).toContain('html[data-theme-id="blue"] .widget-wd-sheet__opt {');
        expect(cssSrc).toContain('html[data-theme-id="blue-dark"] .widget-wd-sheet__opt {');
        expect(cssSrc).toContain('inset 0 0 0 1.5px var(--v4-sand-act');
        expect(cssSrc).toContain('color-mix(in srgb, var(--v4-act, #cf8144) 18%, transparent)');
    });

    it('цвет значения по состоянию — сон, вода, вес', () => {
        expect(uiSrc).toContain('function v4SleepValueState');
        expect(uiSrc).toContain('function v4WaterValueState');
        expect(uiSrc).toContain('function v4WeightSparkTrendState');
        expect(uiSrc).toContain('function v4ValueStateClass');
        expect(uiSrc).toMatch(/function v4ValueStateClass[\s\S]{0,200}widget-v4-val--act/);
        const sleepChunk = uiSrc.slice(uiSrc.indexOf('function SleepVariantBody'), uiSrc.indexOf('function SleepVariantBody') + 2200);
        expect(sleepChunk).toContain('v4SleepValueState');
        const waterChunk = uiSrc.slice(uiSrc.indexOf('function WaterVariantBody'), uiSrc.indexOf('function WaterVariantBody') + 3200);
        // 1×1 nrmB: перекраска по уровню, без v4-val--bad на факте
        expect(waterChunk).toContain('widget-water--lines-on-water');
        expect(waterChunk).toContain('WATER_TILE_LINES_CREAM_PCT');
        expect(waterChunk).not.toContain('v4WaterValueState(');
        expect(waterChunk).not.toMatch(/widget-water__numV[\s\S]{0,120}widget-v4-val--bad/);
    });

    it('тренд здоровья, инсулин, heatmap — v4-val--* без widget-v4-ok на героях', () => {
        expect(uiSrc).toContain('function v4HealthTrendState');
        expect(uiSrc).toContain('function v4InsulinWaveState');
        expect(uiSrc).toContain('function v4HeatmapMetaState');
        expect(uiSrc).toContain('V4_MACRO_DEVIATION_PCT = 0.05');
        expect(cssSrc).toMatch(/\.widget-risk-scale-hero \.widget-v4-hero-num__val--risk\s*\{[^}]*letter-spacing:\s*0;/s);
        expect(cssSrc).toMatch(/\.widget-risk-steps__seg--on\.widget-v4-val--good\s*\{[^}]*--v4-sand-ok-text/s);

        expect(uiSrc).toContain('function HealthTrendVariantBody');
        expect(uiSrc).toContain('v4HealthTrendState');
        const healthChunk = uiSrc.slice(uiSrc.indexOf('function HealthTrendVariantBody'), uiSrc.indexOf('function HealthTrendVariantBody') + 4500);
        expect(healthChunk).not.toContain('widget-v4-ok');

        expect(uiSrc).toContain('function InsulinWaveVariantBody');
        // Волна красится по текущему состоянию: наложение — красный, окно
        // покоя длиннее трёх часов — шалфей, остальное — чернила (строка 95).
        // Раньше здесь стояла проверка на близость двух токенов в тексте
        // исходника. Она сломалась, когда расчёт тона переехал наверх вместе с
        // веткой ночной оценки, хотя поведение не менялось — то есть сторожила
        // расположение строк, а не смысл. Проверяем сам расчёт и его
        // единственное исключение.
        expect(uiSrc).toContain('widget-v4-insulin-wave__footer');
        expect(uiSrc).toMatch(/toneClass\s*=\s*isOvernight[\s\S]{0,200}v4InsulinWaveState\(v4\)/);
        // В ночной оценке тон нейтральный: иначе плитка хвалила бы человека за
        // то, что он спал (строка «волна · тон в ночной оценке»).
        expect(uiSrc).toMatch(/isOvernight[\s\S]{0,120}v4ValueStateClass\('neutral'\)/);
        expect(uiSrc).toContain('V4_INSULIN_CALM_MIN = 180');

        expect(cssSrc).toContain('.widget-v4-row__value.widget-v4-val--good');
        expect(cssSrc).toContain('.widget-v4-stack__footer .widget-v4-val--good');
    });

    it('калории 2×1 — без заголовка, «ккал» при числе, полоса и дробь', () => {
        // Канвас «Калории · Строка»: заголовок снят, освободившаяся строка
        // отдана полосе и дроби «съедено / норма».
        expect(uiSrc).toContain('function CaloriesVariantBody');
        expect(uiSrc).toContain('widget-calories__line-value');
        expect(uiSrc).toContain('widget-calories__line-fraction');
        const lineStart = uiSrc.indexOf("if (variantId === 'line' || size === '2x1')");
        const lineChunk = uiSrc.slice(lineStart, lineStart + 2000);
        expect(lineChunk).not.toContain("v4Kicker('Калории')");
        expect(lineChunk).toContain("'осталось'");
        expect(lineChunk).toContain('caloriesHeroBar(');
    });

    it('калории 2×2 — съедено/норма внизу, перебор красит число и полосу', () => {
        // Канвас «Калории · состояние»: слева факт чернилами, справа норма
        // шалфеем; перебор — минус, красное число и красный хвост полосы.
        expect(uiSrc).toContain("cap: 'съедено'");
        expect(uiSrc).toContain("cap: 'норма'");
        expect(uiSrc).not.toContain("leftCap: isClosedDay ? 'итог' : 'сейчас'");
        expect(uiSrc).toContain('function caloriesBarSplit');
        expect(uiSrc).toContain('widget-calories__hero-bar-over');
        expect(uiSrc).toMatch(/hasOver \? 'bad' : 'good'/);
        expect(cssSrc).toContain('.widget-calories__hero-bar-num--good');
        expect(cssSrc).toContain('.widget-calories__hero-bar-num--bad');
        expect(cssSrc).toContain('.widget-calories__hero-bar-over');
        expect(cssSrc).toMatch(/\.widget-calories__hero-bar\s*\{[^}]*background:\s*rgba\(var\(--v4-ink-rgb\), 0\.1\)/s);
        expect(cssSrc).toMatch(/\.widget-calories__hero-bar-num--ink\s*\{[^}]*0\.85/s);
    });

    it('главная — малые плитки используют точную геометрию и тона HW1', () => {
        const stepsStart = uiSrc.indexOf('function v4StepsBars');
        const stepsChunk = uiSrc.slice(stepsStart, stepsStart + 1200);
        expect(stepsChunk).toContain("const plotPx = Number(opts?.plotPx) || 30");
        expect(stepsChunk).toContain("Math.max(2, Math.round((value / max) * plotPx)) + 'px'");
        expect(cssSrc).toMatch(/\.widget-heatmap \.widget-v4-row__meta--count\.widget-v4-val--good\s*\{[^}]*--v4-ok-text/s);
        expect(cssSrc).toMatch(/\.widget-v4-insulin-wave__footer > \.widget-v4-val--good\s*\{[^}]*--v4-sand-ok-text/s);
        expect(cssSrc).toMatch(/\.widget-v4-mini__value\.widget-v4-val--bad\s*\{[^}]*--v4-val-bad/s);
        expect(cssSrc).toMatch(/\.widget-v4-macro__fact--bad\s*\{[^}]*--v4-val-bad/s);
        expect(cssSrc).toMatch(/body:has\(\.widgets-tab\) \.widget-heatmap--2x1\.widget-v4-stack\s*\{[^}]*padding-inline:\s*0;/s);
        expect(cssSrc).toMatch(/body:has\(\.widgets-tab\) \.widgets-grid\s*\{[^}]*font-family:\s*Figtree, sans-serif;/s);
        expect(cssSrc).toMatch(/\.widget-v4-goalbar\s*\{[^}]*background:\s*var\(--v4-track\)/s);
        expect(cssSrc).toMatch(/\.widget--crashRisk\.widget--2x1[^}]*\.widget-wd__delta,[\s\S]*?font-size:\s*21px;[\s\S]*?font-weight:\s*600;/s);
        expect(cssSrc).toMatch(/\.widget--crashRisk\.widget--2x1[^}]*\.widget-wd__delta\.widget-v4-val--good,[\s\S]*?--v4-sand-ok-text/s);
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
        expect(uiSrc).toContain('съедено за день');
        expect(uiSrc).toContain("cap: 'не съедено'");
        expect(uiSrc).not.toContain('итог дня');
        expect(uiSrc).toMatch(/hasOver && !isClosedDay \? ' widget-v4-val--bad'/);
        const waterMini = uiSrc.slice(uiSrc.indexOf('if (d.isMicro || variantId === \'mini\')'), uiSrc.indexOf('if (d.isMicro || variantId === \'mini\')') + 2400);
        expect(waterMini).not.toContain('v4WaterValueState');
        expect(waterMini).not.toContain('widget-v4-val--bad');
    });

    it('главная — layout из localStorage сразу, без sync-скелетона', () => {
        expect(uiSrc).toContain('function bootstrapWidgetsLayout()');
        expect(uiSrc).toContain('useState(() => bootstrapWidgetsLayout())');
        expect(uiSrc).not.toContain('WidgetsSyncSkeleton');
        expect(uiSrc).not.toContain('showDashboardSkeleton');
        expect(uiSrc).not.toContain('isSyncLoading');
        expect(uiSrc).toContain('const applyWidgetsLayout = useCallback');
        // С 23 августа вход в каталог — FAB настройки, пунктирная плитка снята.
        expect(uiSrc).toContain("className: 'widgets-settings-fab'");
        expect(uiSrc).not.toContain("className: 'widget-v4-add");
        expect(uiSrc).not.toContain('widgets-tab__edit-row');
    });

    it('динамика веса 2×1 — v4 виды и долгий тап', () => {
        const variantsSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_variants_v4.js'), 'utf8');
        expect(uiSrc).toContain('CrashRiskDynamicsVariantTile');
        expect(variantsSrc).toContain('displayVariant');
        expect(uiSrc).toContain('weightDynamics:variantSaved');
        expect(uiSrc).not.toMatch(/2×1[\s\S]{0,400}widget-v4-periods/);
        expect(cssSrc).toContain('.widget-wd-sheet');
        expect(cssSrc).toContain('widget-wd--holding');
        expect(uiSrc).toContain('React.createElement(WeightDynamicsSparkSvg,');
        expect(uiSrc).not.toContain('? WeightDynamicsSparkSvg({');
        expect(uiSrc).not.toContain('WeightDynamicsTile2x1');
    });
});
