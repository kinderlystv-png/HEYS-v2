// widget-motion.test.js — плавный пересчёт значений виджетов (калории, БЖУ).
// Ключевой инвариант: анимация всегда стартует от ТЕКУЩЕГО отображаемого
// значения, а не от нуля, и переживает смену цели на полпути.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');
const metricsCssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/100-metrics-and-graphs.css'), 'utf8');

const MOTION_OPTS = { motionIdPrefix: 'test' };

// --- вырезаем motion-модуль из legacy-файла и исполняем изолированно --------
function loadMotion({ reducedMotion = false } = {}) {
    const start = uiSrc.indexOf('const WIDGET_MOTION_MS');
    const end = uiSrc.indexOf('function CaloriesWidgetContent');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const code = uiSrc.slice(start, end)
        + '\nreturn { useWidgetMotionValues, useWidgetMotionValue, widgetMotionEase, widgetMotionArmIntroFromZero, widgetMotionDisarmIntro };';

    const rafQueue = [];
    const intervalQueue = [];
    const requestAnimationFrame = (fn) => rafQueue.push(fn) && rafQueue.length;
    const cancelAnimationFrame = () => { rafQueue.length = 0; };
    let intervalId = 0;
    const setInterval = (fn, ms) => {
        intervalQueue.push({ fn, ms });
        intervalId = intervalQueue.length;
        return intervalId;
    };
    const clearInterval = (id) => {
        if (id === intervalId) {
            intervalQueue.length = 0;
            intervalId = 0;
        }
    };
    const win = { matchMedia: () => ({ matches: reducedMotion }) };

    const hooks = [];
    let idx = 0;
    let pending = [];
    const React = {
        useRef(init) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = { current: init };
            return hooks[i];
        },
        useState(init) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = { value: typeof init === 'function' ? init() : init };
            const slot = hooks[i];
            return [slot.value, (v) => { slot.value = v; }];
        },
        useReducer(reducer, init) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = { value: typeof init === 'function' ? init() : init };
            const slot = hooks[i];
            return [slot.value, (v) => {
                slot.value = typeof v === 'function' ? v(slot.value) : v;
            }];
        },
        useEffect(fn, deps) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = {};
            pending.push({ slot: hooks[i], fn, deps });
        },
        useLayoutEffect(fn, deps) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = {};
            pending.push({ slot: hooks[i], fn, deps, layout: true });
        }
    };

    let clock = 0;
    const perf = { now: () => clock };

    const api = new Function(
        'React', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', 'setInterval', 'clearInterval', 'performance', code
    )(
        React, win, requestAnimationFrame, cancelAnimationFrame, setInterval, clearInterval, perf
    );

    const render = (targets, options = MOTION_OPTS) => {
        idx = 0;
        pending = [];
        const out = api.useWidgetMotionValues(targets, options);
        pending.forEach(({ slot, fn, deps }) => {
            const same = slot.deps && deps.length === slot.deps.length
                && deps.every((d, i) => Object.is(d, slot.deps[i]));
            if (same) return;
            if (slot.cleanup) slot.cleanup();
            slot.deps = deps;
            slot.cleanup = fn() || null;
        });
        return out;
    };

    const frame = (ts, targets, options = MOTION_OPTS) => {
        clock = ts;
        const due = rafQueue.splice(0, rafQueue.length);
        due.forEach((fn) => fn(ts));
        if (intervalQueue.length) intervalQueue[0].fn();
        return render(targets, options);
    };

    return { render, frame, ease: api.widgetMotionEase, armIntro: api.widgetMotionArmIntroFromZero, disarmIntro: api.widgetMotionDisarmIntro, rafQueue, intervalQueue };
}

describe('motion значений виджетов', () => {
    it('easeInOutCubic — мягкий разгон и мягкая остановка, без рывка в начале', () => {
        const { ease } = loadMotion();
        expect(ease(0)).toBe(0);
        expect(ease(1)).toBe(1);
        expect(ease(0.5)).toBeCloseTo(0.5, 6);
        expect(ease(0.1)).toBeLessThan(0.1);
        expect(ease(0.9)).toBeGreaterThan(ease(0.8));
        expect(ease(0.95) - ease(0.9)).toBeLessThan(ease(0.5) - ease(0.45));
    });

    it('первый рендер — сразу целевое значение, без промежуточных кадров', () => {
        const m = loadMotion();
        expect(m.render([1450])).toEqual([1450]);
        expect(m.intervalQueue.length).toBe(0);
    });

    it('intro вкладки виджетов — старт от нуля, затем доезжает до цели', () => {
        const m = loadMotion();
        m.armIntro();
        expect(m.render([1450], { motionIdPrefix: 'eaten' })).toEqual([0]);
        expect(m.intervalQueue.length).toBeGreaterThan(0);
        const mid = m.frame(800, [1450], { motionIdPrefix: 'eaten' })[0];
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(1450);
        expect(m.frame(2600, [1450], { motionIdPrefix: 'eaten' })[0]).toBe(1450);
        m.disarmIntro();
    });

    it('intro: нормы и target ккал сразу, граммы/съеденное — от нуля', () => {
        const m = loadMotion();
        m.armIntro();
        const grams = m.render([80], { motionIdPrefix: 'macro:g' });
        const norm = m.render([120], { motionIdPrefix: 'macro:t' });
        const eaten = m.render([1843], { motionIdPrefix: 'cal:eaten' });
        const target = m.render([2000], { motionIdPrefix: 'cal:target' });
        expect(grams[0]).toBe(0);
        expect(norm[0]).toBe(120);
        expect(eaten[0]).toBe(0);
        expect(target[0]).toBe(2000);
        m.disarmIntro();
    });

    it('смена значения едет ОТ прошлого, а не от нуля', () => {
        const m = loadMotion();
        m.render([1000]);
        m.render([2000]);

        const first = m.frame(0, [2000])[0];
        const second = m.frame(120, [2000])[0];
        expect(first).toBeGreaterThanOrEqual(1000);
        expect(second).toBeGreaterThan(1000);
        expect(second).toBeLessThan(2000);

        const done = m.frame(1300, [2000])[0];
        expect(done).toBe(2000);
        expect(m.rafQueue.length).toBe(0);
    });

    it('откат вниз тоже плавный и не проходит через ноль', () => {
        const m = loadMotion();
        m.render([2400]);
        m.render([800]);
        m.frame(0, [800]);
        const mid = m.frame(150, [800])[0];
        expect(mid).toBeLessThan(2400);
        expect(mid).toBeGreaterThan(800);
        expect(m.frame(1300, [800])[0]).toBe(800);
    });

    it('смена цели на полпути продолжает с текущего кадра', () => {
        const m = loadMotion();
        m.render([0]);
        m.render([3000]);
        m.frame(0, [3000]);
        const mid = m.frame(500, [3000])[0];
        expect(mid).toBeGreaterThan(500);
        expect(mid).toBeLessThan(3000);

        m.render([500]);
        m.frame(600, [500]);
        const after = m.frame(760, [500])[0];
        expect(after).toBeLessThan(mid);
        expect(after).toBeGreaterThan(500);
        expect(m.frame(2000, [500])[0]).toBe(500);
    });

    it('вектор БЖУ анимируется одним циклом — один кадр двигает все три', () => {
        const m = loadMotion();
        m.render([100, 60, 200]);
        m.render([160, 40, 320]);
        m.frame(0, [160, 40, 320]);
        const [p, f, c] = m.frame(150, [160, 40, 320]);
        expect(p).toBeGreaterThan(100);
        expect(f).toBeLessThan(60);
        expect(c).toBeGreaterThan(200);
        expect(m.frame(1300, [160, 40, 320])).toEqual([160, 40, 320]);
    });

    it('quantize: в полёте ккал идут по десяткам, в конце — точное значение', () => {
        const m = loadMotion();
        const opts = { motionIdPrefix: 'kcal', quantize: 10 };
        m.render([1000], opts);
        m.render([1843], opts);
        m.frame(0, [1843], opts);
        const inFlight = [200, 400, 600].map((ts) => m.frame(ts, [1843], opts)[0]);
        inFlight.forEach((v) => expect(v % 10).toBe(0));
        expect(inFlight[2]).toBeGreaterThan(inFlight[0]);
        expect(m.frame(1300, [1843], opts)[0]).toBe(1843);
    });

    it('prefers-reduced-motion: пересчёт дня всё равно плавный (функциональная анимация)', () => {
        const m = loadMotion({ reducedMotion: true });
        m.render([1000]);
        m.render([2200]);
        expect(m.rafQueue.length).toBe(0);
        expect(m.intervalQueue.length).toBeGreaterThan(0);
        m.frame(0, [2200]);
        const mid = m.frame(400, [2200])[0];
        expect(mid).toBeGreaterThan(1000);
        expect(mid).toBeLessThan(2200);
        expect(m.frame(1300, [2200])[0]).toBe(2200);
    });
});

describe('виджеты подключены к motion', () => {
    it('калории — eaten и target из store, полоса из animBarPct', () => {
        const start = uiSrc.indexOf('function CaloriesWidgetContent');
        const chunk = uiSrc.slice(start, uiSrc.indexOf('function WaterWidgetContent'));
        expect(chunk).toContain('motionId: `${widget?.id || \'cal\'}:eaten`');
        expect(chunk).toContain('motionId: `${widget?.id || \'cal\'}:target`');
        expect(chunk).toContain('const animRemaining = Math.max(0, animTarget - animEaten)');
        expect(chunk).toContain('formatKcal(animEaten)');
        expect(chunk).toContain('animBarPct');
        expect(chunk).not.toContain('_calRingAnimated');
    });

    it('БЖУ — граммы и нормы из store, кольца от anim value', () => {
        const start = uiSrc.indexOf('function MacrosWidgetContent');
        const chunk = uiSrc.slice(start, uiSrc.indexOf('function InsulinWidgetContent'));
        expect(chunk).toContain('motionIdPrefix: `${widget?.id || \'macro\'}:g`');
        expect(chunk).toContain('motionIdPrefix: `${widget?.id || \'macro\'}:t`');
        expect(chunk).toContain('const arcValue = value');
        expect(chunk).toContain('v4SageRing({ value: animFat, target: animFatTarget');
        expect(chunk).not.toContain('Math.round(ratio * 100)');
    });

    it('кольца БЖУ — CSS transition синхрон с WIDGET_MOTION_MS', () => {
        const ringRule = metricsCssSrc.slice(metricsCssSrc.indexOf('.macro-ring-fill {'), metricsCssSrc.indexOf('.macro-ring-marker'));
        expect(ringRule).toContain('animation: none');
        expect(ringRule).toContain('transition: stroke-dasharray var(--widget-motion-ms');
        expect(ringRule).not.toContain('macroRingFillIn');
    });

    it('полосы — CSS transition на ширину', () => {
        const barRule = cssSrc.slice(cssSrc.indexOf('.widget-calories__hero-bar-fill'), cssSrc.indexOf('.widget-calories__hero-bar-labels'));
        expect(barRule).toContain('transition: width var(--widget-motion-ms');
        expect(uiSrc).toContain("'--widget-motion-ms': `${widgetMotionCssMs}ms`");
    });
});
