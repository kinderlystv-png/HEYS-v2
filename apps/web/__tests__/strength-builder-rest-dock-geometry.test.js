import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');
const BUILDER = fs.readFileSync(path.resolve(__dirname, '../strength/heys_strength_builder_ui_v1.js'), 'utf8');

let browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

async function measureAtMaxScroll(collapsed) {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const rows = Array.from({ length: 12 }, (_, index) => (
    `<div class="sb-ex" data-row="${index}" style="min-height:88px">Exercise ${index + 1}</div>`
  )).join('');
  const rest = collapsed
    ? `<aside class="sb-rest sb-rest--collapsed" data-rest>
         <button class="sb-rest-compact"><span class="sb-rest-compact-copy"><b>Отдых 0:48 · связка A</b><span>идёт от подхода, который его запустил</span></span><i>развернуть</i></button>
       </aside>`
    : `<aside class="sb-rest" data-rest>
         <div class="sb-rest-context"><span><b>Жим гантелей сидя закрыт</b><small>дальше связка A · раунд 1 из 3</small></span><i>✓</i></div>
         <div class="sb-rest-meta"><b>Отдых · связка A</b><span> · тяжесть 8 → 2:00</span></div>
         <div class="sb-rest-ring"><svg width="168" height="168"></svg><div class="sb-rest-value">1:34<small>осталось</small></div></div>
         <div class="sb-rest-next">Следующий раунд · A1 подтягивания</div>
         <div class="sb-rest-actions"><button class="sb-btn sb-rest-add">+10 секунд</button><button class="sb-btn sb-rest-skip">пропустить</button><button class="sb-btn sb-rest-collapse">свернуть</button></div>
       </aside>`;

  await page.setContent(`
    <style>${CSS}</style>
    <main class="sb-root sb-root--rest-docked ${collapsed ? 'sb-root--rest-collapsed' : 'sb-root--rest-expanded'}">
      <header class="sb-head"><button class="sb-icon-btn">✕</button><div class="sb-head-title"><b>Силовая · грудь, спина, плечи</b><div class="sb-head-sub">отдых между подходами</div></div><button class="sb-icon-btn">⋯</button></header>
      <div class="sb-stats ${collapsed ? '' : 'sb-stats--rest'}"><span class="sb-stat">48:06</span><span class="sb-stat sb-stat--progress">11 из 23 подходов</span></div>
      <section class="sb-list" data-list>${rows}</section>
      ${rest}
      <footer class="sb-panel" data-panel><button class="sb-panel-add">+</button><button class="sb-finish">Завершить · 12 не закрыто</button>${collapsed ? '' : '<div class="sb-rest-note">Кольцо стоит над кнопкой «Завершить», а не поверх списка: пока идёт отдых, упражнения видны и правятся. Число подписано, откуда взялось — из тяжести 8, — и правится теми же двумя кнопками, а не настройками.</div>'}</footer>
    </main>
  `);

  const geometry = await page.evaluate(() => {
    const list = document.querySelector('[data-list]');
    const last = document.querySelector('[data-row="11"]');
    const restDock = document.querySelector('[data-rest]');
    const panel = document.querySelector('[data-panel]');
    list.scrollTop = list.scrollHeight;
    const rect = (node) => {
      const value = node.getBoundingClientRect();
      return { top: value.top, bottom: value.bottom, height: value.height };
    };
    return {
      maxScrollReached: Math.abs(list.scrollTop - (list.scrollHeight - list.clientHeight)) < 1,
      list: rect(list),
      last: rect(last),
      rest: rect(restDock),
      panel: rect(panel)
    };
  });
  await page.close();
  return geometry;
}

describe('strength builder rest dock geometry at 375x812', () => {
  it('activates the in-flow dock layout only while rest is present', () => {
    expect(BUILDER).toContain("rest.collapsed ? 'sb-root--rest-collapsed' : 'sb-root--rest-expanded'");
    expect(BUILDER.indexOf("className: 'sb-list'")).toBeLessThan(BUILDER.indexOf('RestRing'));
    expect(BUILDER.indexOf('RestRing')).toBeLessThan(BUILDER.lastIndexOf("className: 'sb-panel'"));
  });

  for (const collapsed of [false, true]) {
    it(`${collapsed ? 'collapsed' : 'expanded'} dock leaves the last exercise reachable and unobscured`, async () => {
      const geometry = await measureAtMaxScroll(collapsed);
      expect(geometry.maxScrollReached).toBe(true);
      expect(geometry.list.height).toBeGreaterThanOrEqual(80);
      expect(geometry.last.bottom).toBeLessThanOrEqual(geometry.list.bottom + 0.5);
      expect(geometry.list.bottom).toBeLessThanOrEqual(geometry.rest.top + 0.5);
      expect(geometry.rest.bottom).toBeLessThanOrEqual(geometry.panel.top + 0.5);
    });
  }
});
