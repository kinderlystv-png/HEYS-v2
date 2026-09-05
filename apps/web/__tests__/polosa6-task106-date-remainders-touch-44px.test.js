/**
 * Polosa 6 · task 106 · date-remainders · видимые тач-цели 44 px.
 * Пакет 5 сентября: стрелки-кружки 44×44 без ::after; правая на сегодня гаснет.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import React from 'react';
import { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB_DIR, '..', '..');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/date-remainders.v4.dc.html',
);
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const PALETTE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');

/** Строки контракта, закрытые правкой 5 сентября. */
export const TOUCH_CONTRACT_LINES = Object.freeze([
  'стрелки',
  'тач-цели',
  'Капсула · ночь на 21 августа · 04',
  'Дата · сегодня, прокручено · 47',
]);

function loadScript(relPath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relPath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', code)(window, document, window.navigator);
}

function contractRows() {
  const html = fs.readFileSync(CANVAS, 'utf8');
  return new Map(
    [...html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)].map(
      (m) => [m[1], m[2]],
    ),
  );
}

function ruleBlock(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = BASE_CSS.match(new RegExp(`${esc}\\s*\\{[^}]+\\}`, 'm'));
  return match ? match[0] : '';
}

function mountPalette(themeId) {
  document.documentElement.setAttribute('data-theme-id', themeId);
  document.documentElement.setAttribute(
    'data-theme',
    themeId.includes('dark') ? themeId.replace('-dark', '') + '-dark' : themeId,
  );
  document.documentElement.setAttribute('data-palette', themeId.startsWith('blue') ? 'blue' : 'sand');
}

function injectCss(cssText) {
  const style = document.createElement('style');
  style.textContent = cssText;
  document.head.appendChild(style);
  return style;
}

function parsePx(value) {
  const n = parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

function probeNav(metric = 'height') {
  const host = document.createElement('button');
  host.className = 'date-picker-day-nav';
  const wrap = document.createElement('div');
  wrap.className = 'date-picker date-picker--v4';
  wrap.appendChild(host);
  document.body.appendChild(wrap);
  const value = parsePx(getComputedStyle(host)[metric]);
  wrap.remove();
  return value;
}

describe('polosa6 task106 · date-remainders touch 44px visible', () => {
  let roots = [];
  let styles = [];

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.HEYS = window.HEYS || {};
    loadScript('heys_day_utils.js');
    loadScript('heys_day_pickers.js');
  });

  afterEach(() => {
    for (const { root, host } of roots) {
      act(() => root.unmount());
      host.remove();
    }
    roots = [];
    styles.forEach((s) => s.remove());
    styles = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('контракт · строки пакета 5 сентября', () => {
    const rows = contractRows();
    expect(rows.get('стрелки')).toMatch(/кружки 44 px/);
    expect(rows.get('стрелки')).toMatch(/расширителя области нет/);
    expect(rows.get('стрелки')).toMatch(/гаснет, но не исчезает/);
    expect(rows.get('тач-цели')).toMatch(/34 → 44/);
    expect(TOUCH_CONTRACT_LINES).toHaveLength(4);
  });

  it('CSS · стрелки 44×44 без ::after-расширителя', () => {
    const nav = ruleBlock('.date-picker--v4 .date-picker-day-nav');
    expect(nav).toMatch(/width:\s*44px/);
    expect(nav).toMatch(/height:\s*44px/);
    expect(BASE_CSS).not.toMatch(/\.date-picker--v4 \.date-picker-day-nav::after/);
    expect(BASE_CSS).toMatch(
      /\.date-picker--v4 \.date-picker-day-nav--disabled,[\s\S]{0,120}opacity: 0\.4;/,
    );
    expect(BASE_CSS).toMatch(
      /\.date-picker--v4 \.date-picker-trigger--not-today[\s\S]{0,120}height:\s*44px/,
    );
    expect(ruleBlock('.date-picker--v4 .date-picker-trigger')).toMatch(/min-height:\s*44px/);
  });

  it('computed sand + blue · стрелки 44 px видимым габаритом', () => {
    styles.push(injectCss(`${PALETTE_CSS}\n${BASE_CSS}`));
    const table = { sand: {}, blue: {} };
    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      table[id].navHeight = probeNav('height');
      table[id].navWidth = probeNav('width');
      expect(table[id].navHeight, `${id} height`).toBeGreaterThanOrEqual(44);
      expect(table[id].navWidth, `${id} width`).toBeGreaterThanOrEqual(44);
    }
    expect(table.blue.navHeight).toBe(table.sand.navHeight);
    // eslint-disable-next-line no-console -- handoff evidence
    console.info('[polosa6-task106-date-remainders computed]', JSON.stringify(table));
  });

  it('сегодня · правая стрелка в DOM, гаснет, не исчезает', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0));
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => {
      root.render(React.createElement(window.HEYS.DatePicker, {
        valueISO: '2026-08-21',
        onSelect: () => {},
      }));
    });
    roots.push({ root, host });
    const navs = [...host.querySelectorAll('.date-picker-day-nav')];
    expect(navs).toHaveLength(2);
    expect(navs[1].className).toContain('date-picker-day-nav--disabled');
    expect(navs[1].getAttribute('aria-disabled')).toBe('true');
    expect(navs[1].getAttribute('aria-label')).toBe('Следующий день');
    vi.useRealTimers();
  });
});
