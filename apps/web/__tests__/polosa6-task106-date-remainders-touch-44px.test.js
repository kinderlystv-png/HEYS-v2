/**
 * Polosa 6 · task 106 · date-remainders · видимые тач-цели 44 px.
 * Пакет 42 (6 сентября) закрыл вопрос кодера про 34 против 44: верна 44,
 * подложку подняли 5 сентября, кружки стрелок — 6-го. Строка «тач-цели»
 * перечисляет цели зоны поштучно и добавляет правило «высота задаётся своим
 * min-height, а не набирается из padding и line-height».
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';

import React from 'react';
import { act } from 'react';
import ReactDOM from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { sliceDatePickerProbeCss } from './helpers/date-picker-probe-css.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(WEB_DIR, '..', '..');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/date-remainders.v4.dc.html',
);
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');
const PALETTE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');
const DATE_PICKER_PROBE_CSS = sliceDatePickerProbeCss(BASE_CSS);

/** Строки контракта, закрытые правками 5 и 6 сентября (пакеты 38 и 42). */
export const TOUCH_CONTRACT_LINES = Object.freeze([
  'стрелки',
  'тач-цели',
  'Капсула · ночь на 21 августа · 03',
  'Капсула · ночь на 21 августа · 04',
  'Дата · сегодня, прокручено · 47',
  'Дата · чужой день · 18',
  'Календарь · легенда · 27',
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
  return probe('date-picker-day-nav', 'date-picker date-picker--v4', metric);
}

/** Тот же замер для любой цели зоны: класс элемента + класс обёртки. */
function probe(elClass, wrapClass, metric) {
  const host = document.createElement('button');
  host.className = elClass;
  const wrap = document.createElement('div');
  wrap.className = wrapClass;
  wrap.appendChild(host);
  document.body.appendChild(wrap);
  const value = parsePx(getComputedStyle(host)[metric]);
  wrap.remove();
  return value;
}

describe('polosa6 task106 · date-remainders touch 44px visible', () => {
  let roots = [];
  /** Стили для computed-пробы: один раз на файл, не перепарсиваем 000-base на каждый it. */
  let probeCssStyle = null;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.React = React;
    window.ReactDOM = ReactDOM;
    window.HEYS = window.HEYS || {};
    loadScript('heys_day_utils.js');
    loadScript('heys_day_pickers.js');
    probeCssStyle = injectCss(`${PALETTE_CSS}\n${DATE_PICKER_PROBE_CSS}`);
    // happy-dom: без reflow getComputedStyle иногда читает каскад до применения <style>.
    document.body.offsetHeight;
  });

  afterAll(() => {
    probeCssStyle?.remove();
    probeCssStyle = null;
  });

  afterEach(() => {
    for (const { root, host } of roots) {
      act(() => root.unmount());
      host.remove();
    }
    roots = [];
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-palette');
  });

  it('контракт · строки пакета 42', () => {
    const rows = contractRows();
    expect(rows.get('стрелки')).toMatch(/кружки 44 × 44 в обоих вариантах капсулы/);
    expect(rows.get('стрелки')).toMatch(/расширителя области нет/);
    expect(rows.get('стрелки')).toMatch(/гаснет, но не исчезает/);
    expect(rows.get('тач-цели')).toMatch(/44 × 44 в ОБОИХ вариантах капсулы/);
    expect(rows.get('тач-цели')).toMatch(/подложка капсулы 44/);
    expect(rows.get('тач-цели')).toMatch(/«Вернуться к сегодня» под календарём — 48/);
    expect(rows.get('тач-цели')).toMatch(
      /Высота у целей задана СВОИМ min-height, а не набрана из padding и line-height/,
    );
    expect(TOUCH_CONTRACT_LINES).toHaveLength(7);
  });

  it('CSS · стрелки 44×44 без ::after-расширителя', () => {
    const nav = ruleBlock('.date-picker--v4 .date-picker-day-nav');
    expect(nav).toMatch(/width:\s*44px/);
    expect(nav).toMatch(/height:\s*44px/);
    expect(BASE_CSS).not.toMatch(/\.date-picker--v4 \.date-picker-day-nav::after/);
    expect(BASE_CSS).toMatch(
      /\.date-picker--v4 \.date-picker-day-nav--disabled,[\s\S]{0,120}opacity: 0\.4;/,
    );
    expect(ruleBlock('.date-picker--v4 .date-picker-trigger')).toMatch(/min-height:\s*44px/);
  });

  // Высота целей — СВОИМ min-height, и ни один блок файла не возвращает
  // набранную. Правило-дубль в @media (max-width: 640px) держит именно те
  // 375 px, на которых сверяются кадры: 6 сентября правка верхнего блока не
  // дошла до экрана, потому что нижний остался на 36.
  it('CSS · высота капсул задана min-height во всех блоках файла', () => {
    for (const selector of [
      '.date-picker--v4 .date-picker-trigger--night',
      '.date-picker--v4 .date-picker-trigger--not-today',
    ]) {
      const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const blocks = [
        ...BASE_CSS.matchAll(new RegExp(`${esc}\\s*\\{([^}]*)\\}`, 'g')),
      ].map((m) => m[1]);
      // Блок в @media (max-width: 640px) — тот, что действует на 375 px.
      // Без него правка верхнего блока не доезжает до экрана.
      const withMinHeight = blocks.filter((body) => /min-height:\s*44px/.test(body));
      expect(withMinHeight.length, `${selector}: блоков со своей min-height 44`)
        .toBeGreaterThanOrEqual(2);
      for (const body of blocks) {
        expect(body, `${selector}: фиксированной height быть не должно`)
          .not.toMatch(/(^|[\s;])height:\s*\d/);
      }
    }
  });

  // Кадр «Календарь · легенда» ·27: «высота от 48px, поля 0 15px». Прежние
  // `padding: 15px` без своей высоты набирали 45 px.
  it('CSS · «Вернуться к сегодня» — 48 px своим min-height', () => {
    const btn = ruleBlock('.date-picker-sheet .date-picker-btn.today-btn');
    expect(btn).toMatch(/min-height:\s*48px/);
    expect(btn).toMatch(/padding:\s*0 15px/);
    expect(btn).toMatch(/background:\s*var\(--v4-tint-warm/);
  });

  it('computed sand + blue · стрелки 44 px видимым габаритом', () => {
    const table = { sand: {}, blue: {} };
    for (const id of ['sand', 'blue']) {
      mountPalette(id);
      document.body.offsetHeight;
      table[id].navHeight = probeNav('height');
      table[id].navWidth = probeNav('width');
      table[id].nightMinHeight = probe(
        'date-picker-trigger date-picker-trigger--night',
        'date-picker date-picker--v4',
        'minHeight',
      );
      table[id].pastMinHeight = probe(
        'date-picker-trigger date-picker-trigger--not-today',
        'date-picker date-picker--v4',
        'minHeight',
      );
      table[id].inlineTodayMinHeight = probe(
        'date-picker-inline-today',
        'date-picker date-picker--v4',
        'minHeight',
      );
      table[id].sheetBtnMinHeight = probe(
        'date-picker-btn today-btn',
        'date-picker-sheet',
        'minHeight',
      );
      expect(table[id].navHeight, `${id} height`).toBeGreaterThanOrEqual(44);
      expect(table[id].navWidth, `${id} width`).toBeGreaterThanOrEqual(44);
      expect(table[id].nightMinHeight, `${id} ночная капсула`).toBeGreaterThanOrEqual(44);
      expect(table[id].pastMinHeight, `${id} капсула чужого дня`).toBeGreaterThanOrEqual(44);
      expect(table[id].inlineTodayMinHeight, `${id} пилюля «Сегодня»`).toBeGreaterThanOrEqual(44);
      expect(table[id].sheetBtnMinHeight, `${id} «Вернуться к сегодня»`).toBeGreaterThanOrEqual(48);
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
