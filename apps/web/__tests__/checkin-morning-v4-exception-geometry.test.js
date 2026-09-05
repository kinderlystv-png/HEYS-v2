/**
 * checkin-morning · класс exception-geometry (9 строк из
 * ui-v4-group-deviations-for-designer.mjs).
 *
 * Контракт старше кадра — верен контракт; кадры stop 375 px рисуют второй
 * вариант. Сверка — computed на песочном и синем наборах, не grep по CSS.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const CSS = [
  'styles/modules/002-ui-v4-palette-roles.css',
  'styles/modules/500-pwa-and-offline.css',
  'styles/modules/715-yesterday-verify.css',
]
  .map((rel) => fs.readFileSync(path.join(WEB, rel), 'utf8'))
  .join('\n');
const STEPS_SRC = fs.readFileSync(path.join(WEB, 'heys_steps_v1.js'), 'utf8');
const PALETTE = fs.readFileSync(
  path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'),
  'utf8',
);

const LIGHT = ['sand', 'blue'];

function role(themeId, name) {
  const block = PALETTE.slice(PALETTE.indexOf(`[data-theme-id="${themeId}"]`));
  const body = block.slice(0, block.indexOf('}'));
  const m = body.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  if (!m) throw new Error(`${themeId}: нет --${name}`);
  return m[1].toLowerCase();
}

function normColor(value) {
  const raw = String(value || '').trim().toLowerCase();
  const rgb = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (!rgb) return raw;
  const hex = (n) => Number(n).toString(16).padStart(2, '0');
  return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
}

function applySet(id) {
  document.documentElement.setAttribute('data-theme-id', id);
  document.documentElement.setAttribute('data-theme', id.startsWith('blue') ? 'blue' : 'sand');
}

function mountCss() {
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
  return el;
}

function computed(sel) {
  return getComputedStyle(document.querySelector(sel));
}

describe('checkin-morning · exception-geometry (9/9)', () => {
  let style;

  beforeEach(() => {
    style = mountCss();
  });

  afterEach(() => {
    style.remove();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-theme-id');
    document.documentElement.removeAttribute('data-theme');
  });

  it('1/9 · вчера по ощущениям · 19 — дорожка 26 px (кадр 24)', () => {
    document.body.innerHTML = '<div class="yv-v4-slider-track-wrap"></div>';
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.yv-v4-slider-track-wrap').height, id).toBe('26px');
    }
  });

  it('2/9 · вчера по ощущениям · 22 — засечки margin-top 8 px (кадр 7)', () => {
    document.body.innerHTML = '<div class="yv-slider-ticks"></div>';
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.yv-slider-ticks').marginTop, id).toBe('8px');
    }
  });

  it('3/9 · сила для пачки · 24 — подвал gap 8 px (кадр 6)', () => {
    document.body.innerHTML = '<div class="yv-canvas-foot"></div>';
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.yv-canvas-foot').gap, id).toBe('8px');
    }
  });

  it('4/9 · цель по шагам · 24 — пилюля «Да» min-height 44 px (кадр 38)', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <button class="mc-pill mc-pill--choice">Да</button>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.mc-pill').minHeight, id).toBe('44px');
    }
  });

  it('5/9 · цель по шагам · 25 — пилюля «Нет» min-height 44 px (кадр 38)', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <button class="mc-pill mc-pill--choice">Нет</button>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.mc-pill').minHeight, id).toBe('44px');
    }
  });

  it('6/9 · замеры просрочены · 32 — фон --v4-tint (кадр --tint #f6e6dd песок)', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <button class="mc-rest-row mc-rest-row--overdue"></button>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      expect(normColor(computed('.mc-rest-row--overdue').backgroundColor), id).toBe(
        role(id, 'v4-tint'),
      );
    }
    expect(role('sand', 'v4-tint')).toBe('#f6e6dd');
    expect(role('blue', 'v4-tint')).toBe('#fbe6e2');
  });

  it('7/9 · замеры просрочены · 35 — метка 10 px (кадр 9,5)', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <span class="mc-rest-overdue-badge">14 дней</span>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.mc-rest-overdue-badge').fontSize, id).toBe('10px');
      expect(computed('.mc-rest-overdue-badge').fontWeight, id).toBe('700');
    }
  });

  it('8/9 · добавление · 08 — отбивка яруса margin 13/0/7 (кадр 14/0/7)', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-supp-flow-tier">Витамины</div>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      const cs = computed('.mc-supp-flow-tier');
      expect(cs.marginTop, id).toBe('13px');
      expect(cs.marginBottom, id).toBe('7px');
    }
  });

  it('9/9 · шаги своё число · 19 — сноска margin-top 26 или 14, не 20 кадра', () => {
    expect(STEPS_SRC).toMatch(
      /marginTop:\s*\(narrative\.infoCard\s*\|\|\s*data\.showRefeed\)\s*\?\s*14\s*:\s*26/,
    );
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-steps-footnote" style="text-align:center;margin-top:26px"></div>
        <div class="mc-steps-footnote mc-steps-footnote--compact" style="text-align:center;margin-top:14px"></div>
      </div>`;
    for (const id of LIGHT) {
      applySet(id);
      expect(computed('.mc-steps-footnote').marginTop, `${id}-wide`).toBe('26px');
      expect(computed('.mc-steps-footnote--compact').marginTop, `${id}-compact`).toBe('14px');
    }
  });
});
