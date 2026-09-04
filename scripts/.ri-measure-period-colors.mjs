#!/usr/bin/env node
/** Замер computed-цветов листа периодов на sand + blue (Playwright, живое CSS-дерево). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { patchZoneRow } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via patchZoneRow — assertForeignRowsUnchanged outside scope keys.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');

const SETS = [
  { id: 'sand', theme: 'sand', palette: 'sand', themeId: 'sand' },
  { id: 'blue', theme: 'blue', palette: 'blue', themeId: 'blue' },
];

const SELECTORS = [
  { key: 'Лист периодов · 08', sel: '.reports-v4-periods-sheet__legend-item', prop: 'color' },
  { key: 'Лист периодов · 09', sel: '.reports-v4-periods-sheet__dot.is-complete', prop: 'backgroundColor' },
  { key: 'Лист периодов · 10', sel: '.reports-v4-periods-sheet__dot.is-partial', prop: 'backgroundColor' },
  { key: 'Лист периодов · 11', sel: '.reports-v4-periods-sheet__dot.is-incomplete', prop: 'backgroundColor' },
  { key: 'Лист периодов · 14', sel: '.reports-v4-periods-card__date', prop: 'color' },
  { key: 'Лист периодов · 17', sel: '.reports-v4-periods-card__reliability-text', prop: 'color' },
  { key: 'Лист периодов · 20', sel: '.reports-v4-periods-card__metric-value.is-plain', prop: 'color' },
  { key: 'Лист периодов · 21', sel: '.reports-v4-periods-card__metric-label', prop: 'color' },
  { key: 'Лист периодов · 22', sel: '.reports-v4-periods-card__metric-value.is-good', prop: 'color' },
  { key: 'Лист периодов · 25', sel: '.reports-v4-periods-card__days-label', prop: 'color' },
  { key: 'Лист периодов · 29', sel: '.reports-v4-periods-card__delta.is-muted', prop: 'color' },
  { key: 'Лист периодов · 30', sel: '.reports-v4-periods-card__metric-value.is-muted', prop: 'color' },
];

function buildHtml() {
  const css = ['001-design-tokens.css', '002-ui-v4-palette-roles.css', '733-ui-v4-reports.css']
    .map((f) => `@import url("${path.join(MODULES, f).replace(/\\/g, '/')}");`)
    .join('\n');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${css}</style></head><body>
<div class="reports-v4-periods-sheet">
  <div class="reports-v4-periods-sheet__legend">
    <span class="reports-v4-periods-sheet__legend-item"><span class="reports-v4-periods-sheet__dot is-complete"></span>можно доверять</span>
    <span class="reports-v4-periods-sheet__legend-item"><span class="reports-v4-periods-sheet__dot is-partial"></span>оценка</span>
    <span class="reports-v4-periods-sheet__legend-item"><span class="reports-v4-periods-sheet__dot is-incomplete"></span>мало</span>
  </div>
  <div class="reports-v4-periods-card">
    <div class="reports-v4-periods-card__head">
      <span class="reports-v4-periods-card__date">12–18 авг</span>
      <span class="reports-v4-periods-card__delta is-muted">—</span>
    </div>
    <div class="reports-v4-periods-card__reliability">
      <span class="reports-v4-periods-sheet__dot is-complete"></span>
      <span class="reports-v4-periods-card__reliability-text">учтено 5 из 7 дней</span>
    </div>
    <div class="reports-v4-periods-card__metrics">
      <div class="reports-v4-periods-card__metric"><span class="reports-v4-periods-card__metric-value is-good">−0,3</span><span class="reports-v4-periods-card__metric-label">кг</span></div>
      <div class="reports-v4-periods-card__metric"><span class="reports-v4-periods-card__metric-value is-muted">—</span><span class="reports-v4-periods-card__metric-label">шаги</span></div>
      <div class="reports-v4-periods-card__metric"><span class="reports-v4-periods-card__metric-value is-plain">82</span><span class="reports-v4-periods-card__metric-label">балл</span></div>
    </div>
    <div class="reports-v4-periods-card__days"><span class="reports-v4-periods-card__days-label">Дни недели</span><span class="reports-v4-periods-card__days-chevron">›</span></div>
  </div>
</div></body></html>`;
}

function rgbToHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function fmtColor(rgb) {
  const hex = rgbToHex(rgb);
  const m = /rgba?\(([^)]+)\)/.exec(rgb);
  if (!m) return hex;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length === 4) {
    const a = Math.round(Number(parts[3]) * 100) / 100;
    return `rgba(${parts[0]},${parts[1]},${parts[2]}/${a})`;
  }
  return hex;
}

async function measure() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-period-'));
  const file = path.join(tmpDir, 'probe.html');
  fs.writeFileSync(file, buildHtml());
  const browser = await chromium.launch();
  const out = {};
  try {
    const page = await browser.newPage();
    await page.goto('file:///' + file.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    for (const set of SETS) {
      await page.evaluate(({ theme, palette, themeId }) => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-palette', palette);
        document.documentElement.setAttribute('data-theme-id', themeId);
      }, set);
      for (const { key, sel, prop } of SELECTORS) {
        const val = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return getComputedStyle(el)[prop];
        }, { sel, prop });
        if (!out[key]) out[key] = {};
        out[key][set.id] = val;
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return out;
}

const CSS = '733-ui-v4-reports.css';
const measured = await measure();
let updated = 0;

for (const { key, sel, prop } of SELECTORS) {
  const { changed } = patchZoneRow('reports-insights', key, (row) => {
    if (row.v !== '=') return;
    const sand = fmtColor(measured[key].sand);
    const blue = fmtColor(measured[key].blue);
    const cssProp = prop === 'backgroundColor' ? 'background' : 'color';
    const base = row.f.split('; sand ')[0].split('; sand rgb')[0].split('; sand #')[0];
    const prefix = base.includes('733-ui-v4-reports.css')
      ? base
      : `${CSS} ${sel} ${cssProp}; ${base}`;
    row.f = `${prefix}; sand ${sand} blue ${blue} — computed :3001 ${new Date().toISOString().slice(0, 10)}`;
  });
  if (changed) updated += 1;
}
console.log(`Обновлено ${updated} цветовых f листа периодов (sand+blue computed)`);
for (const { key } of SELECTORS) {
  console.log(`  ${key}: sand=${fmtColor(measured[key].sand)} blue=${fmtColor(measured[key].blue)}`);
}
