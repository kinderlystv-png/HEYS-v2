// widget-motion.test.js — плавный пересчёт значений виджетов (калории, БЖУ).
// Ключевой инвариант: анимация всегда стартует от ТЕКУЩЕГО отображаемого
// значения, а не от нуля, и переживает смену цели на полпути.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const uiSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_widgets_ui_v1.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/730-widgets-dashboard.css'), 'utf8');

// --- вырезаем motion-модуль из legacy-файла и исполняем изолированно --------
function loadMotion({ reducedMotion = false } = {}) {
    const start = uiSrc.indexOf('const WIDGET_MOTION_MS');
    const endMarker = 'function useWidgetMotionValue(target, options) {';
    const end = uiSrc.indexOf(endMarker);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const code = uiSrc.slice(start, end)
        + 'function useWidgetMotionValue(target, options) { return useWidgetMotionValues([target], options)[0]; }'
        + '\nreturn { useWidgetMotionValues, useWidgetMotionValue, widgetMotionEase };';

    const rafQueue = [];
    const requestAnimationFrame = (fn) => rafQueue.push(fn) && rafQueue.length;
    const cancelAnimationFrame = () => { rafQueue.length = 0; };
    const win = { matchMedia: () => ({ matches: reducedMotion }) };

    // мини-React: хуки в массиве, эффекты по сравнению deps
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
        useEffect(fn, deps) {
            const i = idx++;
            if (!hooks[i]) hooks[i] = {};
            pending.push({ slot: hooks[i], fn, deps });
        }
    };

    const api = new Function('React', 'window', 'requestAnimationFrame', 'cancelAnimationFrame', code)(
        React, win, requestAnimationFrame, cancelAnimationFrame
    );

    let lastOut = null;
    const render = (targets, options) => {
        idx = 0;
        pending = [];
        lastOut = api.useWidgetMotionValues(targets, options);
        pending.forEach(({ slot, fn, deps }) => {
            const same = slot.deps && deps.length === slot.deps.length
                && deps.every((d, i) => Object.is(d, slot.deps[i]));
            if (same) return;
            if (slot.cleanup) slot.cleanup();
            slot.deps = deps;
            slot.cleanup = fn() || null;
        });
        return lastOut;
    };
    // один кадр: отдаём rAF-колбэки, затем перерисовываем как React
    const frame = (ts, targets, options) => {
        const due = rafQueue.splice(0, rafQueue.length);
        due.forEach((fn) => fn(ts));
        return render(targets, options);
    };
    return { render, frame, ease: api.widgetMotionEase, rafQueue };
}

describe('motion значений виджетов', () => {
    it('easeOutCubic — закреплён в 0 и 1, тормозит к концу', () => {
        const { ease } = loadMotion();
        expect(ease(0)).toBe(0);
        expect(ease(1)).toBe(1);
        expect(ease(0.5)).toBeGreaterThan(0.5); // выезжает быстро
        expect(ease(0.9)).toBeGreaterThan(ease(0.8));
    });

    it('первый рендер — сразу целевое значение, без промежуточных кадров', () => {
        const m = loadMotion();
        expect(m.render([1450])).toEqual([1450]);
        expect(m.rafQueue.length).toBe(0);
    });

    it('смена значения едет ОТ прошлого, а не от нуля', () => {
        const m = loadMotion();
        m.render([1000]);
        m.render([2000]); // новая цель — стартует анимация

        const first = m.frame(0, [2000])[0];
        const second = m.frame(120, [2000])[0];
        expect(first).toBeGreaterThanOrEqual(1000); // не сброс в 0
        expect(second).toBeGreaterThan(1000);
        expect(second).toBeLessThan(2000);

        const done = m.frame(1000, [2000])[0];
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
        expect(m.frame(1000, [800])[0]).toBe(800);
    });

    it('смена цели на полпути продолжает с текущего кадра', () => {
        const m = loadMotion();
        m.render([0]);
        m.render([3000]);
        m.frame(0, [3000]);
        const mid = m.frame(100, [3000])[0];
        expect(mid).toBeGreaterThan(0);
        expect(mid).toBeLessThan(3000);

        m.render([500]); // пользователь переключил день на полпути
        const after = m.frame(200, [500])[0];
        expect(after).toBeLessThan(mid + 1); // пошли вниз от достигнутого
        expect(after).toBeGreaterThan(0); // не телепорт в 0 и не рывок к 500
        expect(m.frame(1200, [500])[0]).toBe(500);
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
        expect(m.frame(1000, [160, 40, 320])).toEqual([160, 40, 320]);
    });

    it('prefers-reduced-motion: значение ставится мгновенно, rAF не заводится', () => {
        const m = loadMotion({ reducedMotion: true });
        m.render([1000]);
        expect(m.render([2200])).toEqual([1000]); // кадр рендера ещё старый
        expect(m.rafQueue.length).toBe(0);
        expect(m.render([2200])).toEqual([2200]); // эффект уже поставил цель
    });
});

describe('виджеты подключены к motion', () => {
    it('калории — все размеры считают от анимированного значения', () => {
        const start = uiSrc.indexOf('function CaloriesWidgetContent');
        const chunk = uiSrc.slice(start, uiSrc.indexOf('function WaterWidgetContent'));
        expect(chunk).toContain('const animEaten = useWidgetMotionValue(eaten)');
        expect(chunk).toContain('const animRemaining = Math.max(0, target - animEaten)');
        // micro / 2×2 hero / 2×1 строка / std — везде анимированное значение
        expect(chunk).toContain("className: 'widget-calories widget-calories--micro'");
        expect(chunk).toContain('formatKcal(animEaten)');
        expect(chunk).toContain('const barPct = Math.min(100, Math.round(ratio * 100))');
        expect(chunk).toContain('const ratio = target > 0 ? animEaten / target : 0');
        expect(chunk).toContain('`${animPct}%`');
        expect(chunk).toContain('formatKcal(animRemaining)');
        // мёртвая посессионная анимация кольца убрана
        expect(chunk).not.toContain('_calRingAnimated');
        expect(uiSrc).not.toContain('window._calRingAnimated');
    });

    it('БЖУ — кольца и граммы едут от анимированных значений', () => {
        const start = uiSrc.indexOf('function MacrosWidgetContent');
        const chunk = uiSrc.slice(start, uiSrc.indexOf('function InsulinWidgetContent'));
        expect(chunk).toContain('const [animProtein, animFat, animCarbs] = useWidgetMotionValues(');
        expect(chunk).toContain('Math.round(animProtein / proteinTarget * 100)');
        expect(chunk).toContain('value: animProtein');
        expect(chunk).toContain("v4SageRing({ value: animFat");
        expect(chunk).toContain('Math.round(animProtein + animFat + animCarbs)');
    });

    it('полосы прогресса не дублируют инерцию CSS-переходом', () => {
        const barRule = cssSrc.slice(cssSrc.indexOf('.widget-calories__hero-bar-fill'), cssSrc.indexOf('.widget-calories__hero-bar-labels'));
        expect(barRule).toContain('transition: none');
        expect(barRule).not.toContain('transition: width');
    });
});
