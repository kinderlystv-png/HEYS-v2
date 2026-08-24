// hdr-date-collapse.test.js — native sticky даты: шапка в скроллере,
// полоса прилипает, chrome уезжает с пальцем. Без scroll-collapse JS.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const shellSrc = fs.readFileSync(path.join(WEB_DIR, 'heys_app_shell_v1.js'), 'utf8');
const baseCss = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const criticalCss = fs.readFileSync(path.join(WEB_DIR, 'styles/critical.css'), 'utf8');

describe('hdr date collapse — разметка', () => {
  it('шапка первый ребёнок tab-active-viewport, не сосед', () => {
    expect(shellSrc).not.toContain('app-header-wrapper');
    const viewportIdx = shellSrc.indexOf("className: 'tab-active-viewport'");
    const headerIdx = shellSrc.indexOf('MemoAppHeader, props', viewportIdx);
    expect(viewportIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeGreaterThan(viewportIdx);
  });

  it('chrome, sentinel, sticky-strip вокруг даты', () => {
    expect(shellSrc).toContain("className: 'hdr-chrome'");
    expect(shellSrc).toContain("className: 'hdr-chrome__inner'");
    expect(shellSrc).toContain("className: 'hdr-sticky-sentinel'");
    expect(shellSrc).toContain("className: 'hdr-sticky-strip'");
    expect(shellSrc).toContain('hdr--date-collapse');

    const chromeIdx = shellSrc.indexOf("className: 'hdr-chrome'");
    const sentinelIdx = shellSrc.indexOf("className: 'hdr-sticky-sentinel'");
    const stickyIdx = shellSrc.indexOf("className: 'hdr-sticky-strip'");
    const dateIdx = shellSrc.indexOf("'hdr-date-row'", stickyIdx);
    const bannerInStrip = shellSrc.indexOf('past-day-banner-wrap', stickyIdx);
    expect(sentinelIdx).toBeGreaterThan(chromeIdx);
    expect(stickyIdx).toBeGreaterThan(sentinelIdx);
    expect(bannerInStrip).toBeGreaterThan(stickyIdx);
    expect(dateIdx).toBeGreaterThan(bannerInStrip);
    const opsIdx = shellSrc.indexOf('renderOpsDashboardModal()');
    expect(opsIdx).toBeGreaterThan(-1);
    expect(opsIdx).toBeLessThan(sentinelIdx);
  });

  it('нет scroll-collapse машинерии', () => {
    expect(shellSrc).not.toContain('bindHdrDateCollapse');
    expect(shellSrc).not.toContain('resolveHdrCollapseState');
    expect(shellSrc).not.toContain('hdr--collapsed');
    expect(shellSrc).not.toContain('strip.animate(');
    expect(shellSrc).not.toMatch(/viewport\.addEventListener\(\s*['"]scroll['"]/);
    expect(shellSrc).toContain('bindHdrStickyPin');
    expect(shellSrc).toContain('IntersectionObserver');
  });
});

describe('hdr date collapse — CSS', () => {
  // 2026-08-24, сведение с контрактом date-remainders, строка «вид липкой
  // капсулы»: «остаётся ряд капсулы НА ПОДЛОЖКЕ --bg во всю ширину с полями
  // 16/18/10 px и тенью 0 6px 18px тона тени 10 %; сама капсула геометрию не
  // меняет». Прежние три проверки охраняли противоположное — прозрачную полосу,
  // зазор 8 px сверху и тень на самой капсуле. Это была геометрия старого кадра,
  // а не отдельное решение, поэтому проверки переписаны под подложку.
  // Инвариант, ради которого тест жив, не тронут: полоса остаётся sticky,
  // is-pinned не меняет layout (никакого padding-top).
  it('полоса sticky, contain не убивает', () => {
    expect(baseCss).toMatch(/\.tab-active-viewport > \.hdr-sticky-strip\s*\{[^}]*position:\s*sticky/);
    expect(baseCss).toMatch(/\.tab-active-viewport > \.hdr-sticky-strip\s*\{[^}]*top:\s*env\(safe-area-inset-top/);
    expect(baseCss).not.toMatch(/\.hdr-sticky-strip\.is-pinned\s*\{[^}]*padding-top/);
    expect(baseCss).toMatch(/\.hdr-sticky-strip\s*\{[^}]*padding:\s*16px 18px 10px/);
    expect(baseCss).toMatch(/\.hdr-sticky-strip\s*\{[^}]*background:\s*var\(--v4-bg\)/);
    expect(baseCss).toMatch(/\.hdr-sticky-strip\.is-pinned\s*\{[^}]*box-shadow:\s*0 6px 18px/);
    expect(baseCss).not.toMatch(/\.hdr-sticky-strip\.is-pinned[^{]*\.date-picker-trigger:not\(\.open\)\s*\{[^}]*box-shadow/);
    expect(baseCss).toContain('.hdr-sticky-sentinel');
    expect(baseCss).toMatch(/\.tab-active-viewport > \.hdr:not\(\.hdr--date-collapse\)\s*\{[^}]*position:\s*sticky/);
    expect(baseCss).not.toMatch(/\.hdr\s*\{[^}]*contain:\s*layout/);
    expect(criticalCss).not.toMatch(/\.hdr\s*\{[^}]*contain:\s*layout/);
    expect(baseCss).not.toContain('.hdr--collapsed');
  });

  it('meal-sticky-bar top через --heys-hdr-sticky-top, без transition top', () => {
    expect(baseCss).toMatch(/\.meal-sticky-bar\s*\{[\s\S]*?top:\s*var\(--heys-hdr-sticky-top/);
    expect(shellSrc).toContain('--heys-hdr-sticky-top');
    expect(baseCss).not.toMatch(/\.meal-sticky-bar\s*\{[^}]*transition:[^;}]*top/);
  });
});

describe('hdr date collapse — sentinel IO', () => {
  function loadBindHdrStickyPin(IntersectionObserver, ResizeObserver) {
    const start = shellSrc.indexOf('function syncHdrStickyTopVar');
    const end = shellSrc.indexOf('function AppShell', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const sandbox = { document, IntersectionObserver, ResizeObserver };
    vm.runInNewContext(
      `${shellSrc.slice(start, end)}\nthis.bindHdrStickyPin = bindHdrStickyPin;`,
      sandbox,
    );
    return sandbox.bindHdrStickyPin;
  }

  it('когда сентинел ушёл из root — полоса is-pinned, без scroll-listener', () => {
    const viewport = document.createElement('div');
    viewport.className = 'tab-active-viewport';
    viewport.innerHTML = '<div class="hdr hdr--date-collapse"></div>'
      + '<div class="hdr-sticky-sentinel"></div>'
      + '<div class="hdr-sticky-strip"></div>';
    const sentinel = viewport.querySelector('.hdr-sticky-sentinel');
    const strip = viewport.querySelector('.hdr-sticky-strip');
    let ioCb = null;
    let observed = null;
    let ioRoot = null;
    class FakeIO {
      constructor(cb, opts) {
        ioCb = cb;
        ioRoot = opts && opts.root;
      }
      observe(el) { observed = el; }
      disconnect() { ioCb = null; }
    }
    class FakeRO {
      observe() {}
      disconnect() {}
    }
    const bind = loadBindHdrStickyPin(FakeIO, FakeRO);
    const unbind = bind(viewport);
    expect(ioRoot).toBe(viewport);
    expect(observed).toBe(sentinel);
    ioCb([{ isIntersecting: false, target: sentinel }]);
    expect(strip.classList.contains('is-pinned')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--heys-hdr-sticky-top')).toMatch(/px$/);
    ioCb([{ isIntersecting: true, target: sentinel }]);
    expect(strip.classList.contains('is-pinned')).toBe(false);
    unbind();
    expect(strip.classList.contains('is-pinned')).toBe(false);
  });
});
