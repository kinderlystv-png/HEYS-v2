#!/usr/bin/env node
/** Lane 5: sand + sand-dark computed colors @375 for weak verdict closure. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const OUT = path.join(ROOT, 'scripts/.tmp-lane5-measurements.json');

const SETS = [
  { id: 'sand', themeId: 'sand', theme: 'sand', palette: 'sand' },
  { id: 'sand-dark', themeId: 'sand-dark', theme: 'sand-dark', palette: 'sand' },
];

const BASE = ['001-design-tokens.css', '002-ui-v4-palette-roles.css'];

function cssImport(files) {
  return files
    .map((f) => `@import url("${path.join(MODULES, f).replace(/\\/g, '/')}");`)
    .join('\n');
}

function fmtColor(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return rgb || 'none';
  const m = /^rgba?\(([^)]+)\)/.exec(String(rgb).trim());
  if (!m) return String(rgb).replace(/\s+/g, '');
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length === 4) {
    const a = Math.round(Number(parts[3]) * 100) / 100;
    return `rgba(${parts[0]},${parts[1]},${parts[2]}/${a})`;
  }
  return `rgb(${parts[0]},${parts[1]},${parts[2]})`.replace(/\s+/g, '');
}

/** @type {Array<{id:string, css:string[], html:string, probes:Array<{sel:string,prop:string}>}>} */
const FIXTURES = [
  {
    id: 'yv',
    css: [...BASE, '715-yesterday-verify.css'],
    html: `<div class="yv-hero"><div class="yv-hero-title">Title</div><div class="yv-hero-sub">Sub</div></div>
<div class="yv-pack-day"><span class="yv-pack-day-title">Day</span><span class="yv-pack-day-meta">meta</span></div>
<p class="yv-pack-note">note</p>
<div class="yv-pack-row"><button class="yv-pack-secondary">sec</button><button class="yv-pack-secondary yv-pack-secondary--feelings">feel</button></div>
<div class="yv-food-card"><div class="yv-food-row">Еда</div><div class="yv-food-value">+500</div></div>
<button class="yv-text-later">Позже</button>`,
    probes: [
      { id: 'yv-hero-title', sel: '.yv-hero-title', prop: 'color' },
      { id: 'yv-hero-sub', sel: '.yv-hero-sub', prop: 'color' },
      { id: 'yv-pack-day-bg', sel: '.yv-pack-day', prop: 'backgroundColor' },
      { id: 'yv-pack-day-title', sel: '.yv-pack-day-title', prop: 'color' },
      { id: 'yv-pack-day-meta', sel: '.yv-pack-day-meta', prop: 'color' },
      { id: 'yv-pack-note', sel: '.yv-pack-note', prop: 'color' },
      { id: 'yv-pack-secondary-bg', sel: '.yv-pack-secondary', prop: 'backgroundColor' },
      { id: 'yv-pack-secondary-color', sel: '.yv-pack-secondary', prop: 'color' },
      { id: 'yv-pack-secondary-feelings-bg', sel: '.yv-pack-secondary--feelings', prop: 'backgroundColor' },
      { id: 'yv-food-card-bg', sel: '.yv-food-card', prop: 'backgroundColor' },
      { id: 'yv-food-row', sel: '.yv-food-row', prop: 'color' },
      { id: 'yv-food-value', sel: '.yv-food-value', prop: 'color' },
      { id: 'yv-text-later', sel: '.yv-text-later', prop: 'color' },
    ],
  },
  {
    id: 'nutrition',
    css: [...BASE, '732-ui-v4-nutrition.css'],
    html: `<button class="nutrition-v4-chip">On</button>
<button class="nutrition-v4-chip is-off">Off</button>
<button class="nutrition-v4-supplements__pill is-course">Курс</button>`,
    probes: [
      { id: 'chip-on-bg', sel: '.nutrition-v4-chip:not(.is-off)', prop: 'backgroundColor' },
      { id: 'chip-off-bg', sel: '.nutrition-v4-chip.is-off', prop: 'backgroundColor' },
      { id: 'chip-course-color', sel: '.nutrition-v4-supplements__pill.is-course', prop: 'color' },
      { id: 'chip-course-border', sel: '.nutrition-v4-supplements__pill.is-course', prop: 'borderColor' },
    ],
  },
  {
    id: 'undo',
    css: [...BASE, '../heys-components.css'],
    html: `<div class="heys-undo-bar heys-undo-bar--visible"><div class="heys-undo-bar__content">
<div class="heys-undo-bar__ring"><span class="heys-undo-bar__count">5</span></div>
<span class="heys-undo-bar__label">Удалено</span><button class="heys-undo-bar__btn">Отменить</button></div></div>`,
    probes: [
      { id: 'undo-bar-bg', sel: '.heys-undo-bar', prop: 'backgroundColor' },
      { id: 'undo-count', sel: '.heys-undo-bar__count', prop: 'color' },
      { id: 'undo-btn-bg', sel: '.heys-undo-bar__btn', prop: 'backgroundColor' },
      { id: 'undo-btn-color', sel: '.heys-undo-bar__btn', prop: 'color' },
    ],
  },
  {
    id: 'subscription',
    css: [...BASE, '735-ui-v4-subscription.css'],
    html: `<div class="paywall-order-card"><div class="paywall-order-name">Pro</div><div class="paywall-order-price">7 990 ₽</div></div>
<label class="paywall-consent"><span class="paywall-consent-box is-checked"></span><span class="paywall-consent-text">Принимаю</span><a class="paywall-consent-link" href="#">условия</a></label>
<button class="paywall-cta">Оплатить</button>`,
    probes: [
      { id: 'paywall-name', sel: '.paywall-order-name', prop: 'color' },
      { id: 'paywall-price', sel: '.paywall-order-price', prop: 'color' },
      { id: 'paywall-consent-box', sel: '.paywall-consent-box.is-checked', prop: 'backgroundColor' },
      { id: 'paywall-consent-text', sel: '.paywall-consent-text', prop: 'color' },
      { id: 'paywall-consent-link', sel: '.paywall-consent-link', prop: 'color' },
      { id: 'paywall-cta-bg', sel: '.paywall-cta', prop: 'backgroundColor' },
      { id: 'paywall-cta-color', sel: '.paywall-cta', prop: 'color' },
    ],
  },
  {
    id: 'reports',
    css: [...BASE, '733-ui-v4-reports.css', '734-ui-v4-insights.css'],
    html: `<div class="reports-v4-days"><span class="reports-v4-days__right">+120</span></div>
<span class="insights-v4-stub__count">3 из 7</span>
<span class="insights-v4-thresh__mine">56</span>`,
    probes: [
      { id: 'reports-days-right', sel: '.reports-v4-days__right', prop: 'color' },
      { id: 'insights-stub-count', sel: '.insights-v4-stub__count', prop: 'color' },
      { id: 'insights-thresh-mine', sel: '.insights-v4-thresh__mine', prop: 'color' },
    ],
  },
  {
    id: 'date',
    css: [...BASE, '000-base-and-gamification.css'],
    html: `<div class="date-picker--v4 date-picker--past"><button class="date-picker-day-nav"></button>
<div class="date-picker-trigger-lbl"><div class="date-picker-lbl-inner"><span class="date-picker-main date-picker-main--past">Вчера</span></div></div></div>
<div class="date-picker--v4"><span class="date-picker-inline-today">Сегодня</span></div>
<button class="date-picker-btn today-btn">Вернуться</button>`,
    probes: [
      { id: 'date-past-nav-bg', sel: '.date-picker--past .date-picker-day-nav', prop: 'backgroundColor' },
      { id: 'date-past-main', sel: '.date-picker-main--past', prop: 'color' },
      { id: 'date-inline-today', sel: '.date-picker-inline-today', prop: 'color' },
      { id: 'date-today-btn-bg', sel: '.date-picker-btn.today-btn', prop: 'backgroundColor' },
    ],
  },
];

async function measureFixture(fixture) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lane5-'));
  const file = path.join(tmpDir, `${fixture.id}.html`);
  fs.writeFileSync(
    file,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${cssImport(fixture.css)}
body{margin:0;padding:16px;background:var(--v4-bg,#fffaf1);font-family:Figtree,system-ui,sans-serif}
.date-picker-day-nav{width:44px;height:44px;border:0;border-radius:999px}
.date-picker--v4{display:flex;align-items:center;min-height:44px;border-radius:999px;padding:0 11px;background:var(--v4-tint)}
.date-picker--past .date-picker-day-nav{background:var(--v4-tint)}
.date-picker-btn{min-height:48px;border:0;border-radius:999px;padding:0 15px;font:700 13px/1 Figtree,sans-serif}
.paywall-consent-box{width:22px;height:22px;border-radius:6px;display:inline-block}
.paywall-cta{min-height:48px;border:0;border-radius:999px;width:100%;font:700 13px/1 Figtree,sans-serif}
.paywall-order-card{background:var(--v4-surface);border-radius:18px;padding:14px;margin-top:16px}
.heys-undo-bar{position:relative}
.yv-pack-day{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:16px;background:var(--v4-c1)}
.yv-food-card{padding:14px 16px;border-radius:20px;margin-top:16px;background:var(--v4-card)}
.yv-food-row{color:rgba(0,0,0,.55)}
.yv-text-later{min-height:44px;border:0;background:transparent;font:700 12px/1 Figtree,sans-serif;color:rgba(0,0,0,.45)}
.yv-pack-secondary{min-height:48px;border:0;border-radius:999px;background:var(--v4-c1);color:var(--v4-ink-2)}
</style></head><body>${fixture.html}</body></html>`,
  );

  const browser = await chromium.launch({ headless: true });
  const out = {};
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    for (const set of SETS) {
      await page.evaluate(({ themeId, theme, palette }) => {
        document.documentElement.setAttribute('data-theme-id', themeId);
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-palette', palette);
      }, set);
      for (const probe of fixture.probes) {
        const val = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return { missing: sel };
          return getComputedStyle(el)[prop];
        }, probe);
        out[`${probe.id}|${set.id}`] = typeof val === 'object' ? val : fmtColor(val);
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return out;
}

async function main() {
  const all = {};
  for (const fixture of FIXTURES) {
    console.log(`measuring ${fixture.id}…`);
    Object.assign(all, await measureFixture(fixture));
  }
  fs.writeFileSync(OUT, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
  console.log('wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
