#!/usr/bin/env node
/** One-off computed-style probe for transfer-follow handoff. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__dirname, '../apps/web');
const PALETTE = fs.readFileSync(path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css'), 'utf8');
const ACTIVITY = fs.readFileSync(path.join(WEB, 'styles/modules/731-ui-v4-activity.css'), 'utf8');

function themeBlock(themeId) {
  const re = new RegExp(`\\[data-theme-id="${themeId}"\\][\\s\\S]*?\\}`, 'm');
  const m = PALETTE.match(re);
  return m ? m[0] : '';
}

function injectCss(dom, themeId) {
  const doc = dom.window.document;
  const style = doc.createElement('style');
  style.textContent = themeBlock(themeId) + '\n' + ACTIVITY;
  doc.head.appendChild(style);
  doc.documentElement.setAttribute('data-theme-id', themeId);
}

function probe(themeId) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="activity-v4-program">
      <div class="sb-move-days">
        <button type="button" class="sb-move-day">
          <span class="sb-move-day-copy"><b>Завтра</b><span>Свободно</span></span>
          <i>перенести</i>
        </button>
        <button type="button" class="sb-move-day is-busy">
          <span class="sb-move-day-copy"><b>Четверг</b><span>Уже стоит День C</span></span>
          <i>занят</i>
        </button>
        <button type="button" class="sb-move-day is-on">
          <span class="sb-move-day-copy"><b>Суббота</b><span>выбрано</span></span>
          <i>✓</i>
        </button>
      </div>
      <span class="sb-plan-badge">план</span>
    </div>
  </body></html>`, { pretendToBeVisual: true });
  injectCss(dom, themeId);
  const win = dom.window;
  const cs = (sel) => {
    const el = win.document.querySelector(sel);
    return win.getComputedStyle(el);
  };
  return {
    themeId,
    freeTitle: cs('.sb-move-day .sb-move-day-copy b').color,
    freeSub: cs('.sb-move-day .sb-move-day-copy span').color,
    cta: cs('.sb-move-day > i').color,
    busyTitle: cs('.sb-move-day.is-busy .sb-move-day-copy b').color,
    busyPill: cs('.sb-move-day.is-busy > i').color,
    pickedSub: cs('.sb-move-day.is-on .sb-move-day-copy span').color,
    badge: cs('.sb-plan-badge').color,
  };
}

const out = { sand: probe('sand'), blue: probe('blue') };
console.log(JSON.stringify(out, null, 2));
