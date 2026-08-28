// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const componentsCss = fs.readFileSync(path.join(ROOT, 'apps/web/styles/heys-components.css'), 'utf8');
const bootCss = fs.readFileSync(path.join(ROOT, 'apps/web/styles/heys-boot-mark.css'), 'utf8');
const undoSource = fs.readFileSync(path.join(ROOT, 'apps/web/heys_undo_v1.js'), 'utf8');
const waitSource = fs.readFileSync(path.join(ROOT, 'apps/web/heys_loading_progress_v1.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ROOT, 'apps/web/index.html'), 'utf8');

function cssRule(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`CSS rule not found: ${selector}`);
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unclosed CSS rule: ${selector}`);
}

function installRules(...rules) {
  const style = document.createElement('style');
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
  return style.sheet;
}

function findReactNode(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = React.Children.toArray(node.props?.children);
  for (const child of children) {
    const found = findReactNode(child, predicate);
    if (found) return found;
  }
  return null;
}

describe('UI v4 transient states — deterministic DOM/geometry gates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.HEYS = {};
    window.__HEYS_DEMO_MODE__ = { enabled: true };
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    window.HEYS?.Undo?.commit?.('test-cleanup');
    delete window.__heysLoadingProgress;
    delete window.__heysBootWait;
    delete window.__HEYS_DEMO_MODE__;
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('undo-bar keeps the 12/76 geometry and a flat warm surface', () => {
    const sheet = installRules(
      cssRule(componentsCss, '.heys-undo-bar'),
      cssRule(componentsCss, '.heys-undo-bar__content'),
    );
    const tabs = document.createElement('nav');
    tabs.className = 'tabs';
    tabs.getBoundingClientRect = () => ({ height: 64 });
    document.body.appendChild(tabs);

    window.eval(undoSource);
    window.HEYS.Undo.push({ label: 'Удалён приём', onUndo: () => {} });

    const bar = document.querySelector('.heys-undo-bar');
    const content = bar.querySelector('.heys-undo-bar__content');
    const rule = Array.from(sheet.cssRules).find((item) => item.selectorText === '.heys-undo-bar');
    expect(bar.style.bottom).toBe('76px');
    expect(getComputedStyle(bar).left).toBe('12px');
    expect(getComputedStyle(bar).right).toBe('12px');
    expect(getComputedStyle(bar).borderRadius).toBe('22px');
    expect(getComputedStyle(content).padding).toBe('11px 13px');
    expect(rule.style.getPropertyValue('box-shadow')).toBe('inset 0 0 0 1px var(--v4-line, #e5e7eb)');
  });

  it('app-splash has a fixed 56 px disc and the final fail cross', () => {
    installRules(cssRule(bootCss, '.heys-boot-mark__disc'));
    const disc = document.createElement('span');
    disc.className = 'heys-boot-mark__disc';
    disc.style.setProperty('--heys-splash-disc-size', '56px');
    document.body.appendChild(disc);
    const style = getComputedStyle(disc);
    expect(style.width).toBe('var(--heys-splash-disc-size)');
    expect(style.height).toBe('var(--heys-splash-disc-size)');
    expect(disc.style.getPropertyValue('--heys-splash-disc-size')).toBe('56px');
    expect(style.borderRadius).toBe('999px');

    const svgMarkup = indexSource.match(/<svg class="heys-boot-mark__warn"[^>]*>[\s\S]*?<\/svg>/)?.[0];
    expect(svgMarkup).toBeTruthy();
    document.body.innerHTML = svgMarkup;
    const fail = document.querySelector('.heys-boot-mark__warn');
    expect(fail.getAttribute('stroke-width')).toBe('3.4');
    expect(fail.querySelector('path').getAttribute('d')).toBe('M7 7l10 10M17 7L7 17');
    expect(fail.querySelector('circle')).toBeNull();
  });

  it('pwa offline banner keeps its system layer geometry and fixed contrast pair', () => {
    installRules(cssRule(componentsCss, '.heys-system-banner--offline'));
    const banner = document.createElement('div');
    banner.className = 'heys-system-banner--offline';
    document.body.appendChild(banner);
    const style = getComputedStyle(banner);
    expect(style.top).toBe('0px');
    expect(style.left).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.borderRadius).toBe('0');
    expect(style.backgroundColor).toBe('rgb(28, 23, 18)');
    expect(style.color).toBe('rgb(242, 237, 230)');
    expect(style.boxShadow).toBe('none');
  });

  it('spinners verify stable success/fail frames instead of a rotating phase', () => {
    window.React = React;
    window.eval(waitSource);
    const fail = window.HEYS.WaitMark.render(React, {
      mode: 'embedded',
      state: 'fail',
      title: 'Не удалось загрузить',
    });
    const ok = window.HEYS.WaitMark.render(React, {
      mode: 'embedded',
      state: 'ok',
      title: 'Готово',
    });
    const failSvg = findReactNode(fail, (node) => node.props?.className === 'heys-wait-mark__icon');
    const failPath = findReactNode(failSvg, (node) => node.type === 'path');
    const checkPath = findReactNode(ok, (node) => node.props?.className === 'heys-wait-mark__check');
    expect(failSvg.props.width).toBe(26);
    expect(failSvg.props.strokeWidth).toBe('3.4');
    expect(failPath.props.d).toBe('M7 7l10 10M17 7L7 17');
    expect(checkPath.props.strokeWidth).toBe('3.4');

    const markup = renderToStaticMarkup(ok);
    expect(markup).toContain('heys-wait-mark__check');
    expect(markup).toContain('stroke-width="3.4"');
    expect(cssRule(bootCss, '.heys-boot-mark__spin,'))
      .toContain('animation: heys-boot-spin 1.1s linear infinite');
  });
});
