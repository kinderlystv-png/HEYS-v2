#!/usr/bin/env node
/** Замер computed-цветов зоны reports-insights на sand + blue (Playwright). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const PAIRS_FILE = path.join(ROOT, 'scripts/.ri-color-pairs.json');

const SETS = [
  { id: 'sand', theme: 'sand', palette: 'sand', themeId: 'sand' },
  { id: 'blue', theme: 'blue', palette: 'blue', themeId: 'blue' },
];

const CSS_FILES = [
  '001-design-tokens.css',
  '002-ui-v4-palette-roles.css',
  '733-ui-v4-reports.css',
  '734-ui-v4-insights.css',
  '740-cascade-card.css',
  '100-metrics-and-graphs.css',
];

/** Строки контракта «карточка · …» — селектор для замера цвета. */
const CONTRACT = [
  { key: 'карточка · строка «съедено против плана»', sel: '.reports-v4-hero__footer-text', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'карточка · строка «съедено против плана»', sel: '.reports-v4-hero__footer-chevron', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'chevron' },
  { key: 'карточка · плитки «дней в норме» и «средняя оценка»', sel: '.reports-v4-summary-card--norm .reports-v4-summary-card__value', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'norm' },
  { key: 'карточка · плитки «дней в норме» и «средняя оценка»', sel: '.reports-v4-summary-card--score .reports-v4-summary-card__value', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'score' },
  { key: 'карточка · строка трекера матрицы', sel: '.reports-v4-discipline__name', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'карточка · строка трекера матрицы', sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor', css: '733-ui-v4-reports.css', suffix: 'fill' },
  { key: 'карточка · подпись под матрицей', sel: '.reports-v4-discipline__footnote', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'карточка · призыв о замерах', sel: '.reports-v4-measure__fact', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'карточка · призыв о замерах', sel: '.reports-v4-measure__cta', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'cta' },
  { key: 'карточка · рамка отсутствующего графика', sel: '.reports-v4-noplot', prop: 'backgroundColor', css: '733-ui-v4-reports.css' },
  { key: 'карточка · рамка отсутствующего графика', sel: '.reports-v4-noplot__cta', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'cta' },
  { key: 'карточка · строка похвалы', sel: '.insights-v4-attention--ok .insights-v4-attention__text', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · шкала каскада', sel: '.heys-score-insights-v4__threshold.is-maximum', prop: 'backgroundColor', css: '734-ui-v4-insights.css' },
  { key: 'карточка · строка-уход в Отчёты', sel: '.heys-score-insights-v4__reports-link', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · опора и зрелость', sel: '.insights-v4-maturity', prop: 'color', css: '734-ui-v4-insights.css', suffix: 'pill' },
  { key: 'карточка · опора и зрелость', sel: '.insights-v4-attention__basis', prop: 'color', css: '734-ui-v4-insights.css', suffix: 'basis' },
  { key: 'карточка · строка порога в лестнице', sel: '.insights-v4-thresh__mine--own', prop: 'color', css: '734-ui-v4-insights.css', suffix: 'own' },
  { key: 'карточка · строка порога в лестнице', sel: '.insights-v4-thresh__mine', prop: 'color', css: '734-ui-v4-insights.css', suffix: 'future' },
  { key: 'карточка · строка порога с колонками', sel: '.insights-v4-thresh__head .insights-v4-thresh__name', prop: 'color', css: '734-ui-v4-insights.css', suffix: 'head' },
  { key: 'карточка · строка порога с колонками', sel: '.insights-v4-thresh__mine', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · «На сегодня всё»', sel: '.meal-rec-done', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · короткие итоги', sel: '.insights-v4-detail-link__text', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · чипы «Что если»', sel: '.insights-v4-window__chip.is-active', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'карточка · строка «Дни» с прочерками', sel: '.reports-v4-days__left', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'вид · шапка и период', sel: '.reports-v4-meta__title', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'вид · баланс за неделю', sel: '.reports-v4-hero__phrase', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'вид · Итог периода', sel: '.reports-v4-summary-card--norm .reports-v4-summary-card__value', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'вид · матрица Дисциплины', sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor', css: '733-ui-v4-reports.css' },
  { key: 'вид · лента Дней', sel: '.reports-v4-days__dot--good', prop: 'backgroundColor', css: '733-ui-v4-reports.css' },
  { key: 'вид · каскад дня', sel: '.heys-score-insights-v4__reports-link', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'вид · ярус Питание целиком', sel: '.insights-v4-nutrition__rhythm-line', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'вид · ярусы порогов', sel: '.insights-v4-thresh__mine--own', prop: 'color', css: '734-ui-v4-insights.css' },
  { key: 'ярус «Что с этим делать»', sel: '.reports-v4-measure__fact', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'ярус вместо заголовка блока', sel: '.reports-v4-tier', prop: 'color', css: '733-ui-v4-reports.css' },
  { key: 'ярус вместо заголовка блока', sel: '.reports-v4-tier__note', prop: 'color', css: '733-ui-v4-reports.css', suffix: 'note' },
];

function cssFileForSelector(sel) {
  const s = sel.split(',')[0].trim();
  if (s.includes('kcal-realdata')) return '100-metrics-and-graphs.css';
  if (s.includes('heys-score') && !s.includes('insights')) return '740-cascade-card.css';
  if (s.includes('insights-v4') || s.includes('heys-score-insights') || s.includes('meal-rec')) return '734-ui-v4-insights.css';
  return '733-ui-v4-reports.css';
}

function buildHtml(selectors) {
  const imports = CSS_FILES.map((f) =>
    `@import url("${path.join(MODULES, f).replace(/\\/g, '/')}");`).join('\n');

  const blocks = new Set();
  for (const { sel } of selectors) {
    for (const part of sel.split(',')) {
      const s = part.trim();
      const classes = [...s.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
      if (!classes.length) continue;
      const tag = s.startsWith('.insights-v4--detail') ? 'div class="insights-v4 insights-v4--detail"' : 'div';
      const cls = classes.join(' ');
      blocks.add(`<${tag} class="${cls}">·</${tag.split(' ')[0]}>`);
    }
  }

  // Обёртки для контекстных селекторов
  const extra = `
<div class="reports-v4-summary-card reports-v4-summary-card--norm"><span class="reports-v4-summary-card__value">5</span></div>
<div class="reports-v4-summary-card reports-v4-summary-card--score"><span class="reports-v4-summary-card__value">82</span></div>
<div class="reports-v4-score-slot"><span class="heys-score-tile__state">норма</span></div>
<div class="reports-v4-periods-sheet"><span class="reports-v4-periods-sheet__legend-item">x</span></div>
<div class="reports-v4-periods-card"><span class="reports-v4-periods-card__metric-value is-good">−0,3</span></div>
<div class="reports-v4-discipline__bar is-zero"><span class="reports-v4-discipline__bar-fill"></span></div>
<div class="reports-v4-discipline__score is-zero">0</div>
<div class="reports-v4-weeks__score is-empty">—</div>
<div class="reports-v4-weeks__kcal is-empty">—</div>
<div class="reports-v4-weeks__weight is-empty">—</div>
<div class="reports-v4-periods-card__delta is-muted">—</div>
<div class="reports-v4-periods-card__metric-value is-muted">—</div>
<div class="reports-v4-periods-card__metric-value is-plain">82</div>
<div class="insights-v4 insights-v4--detail"><div class="insights-v4-detail__head"><h2 class="insights-v4-detail__title">t</h2></div></div>
<div class="insights-v4-attention insights-v4-attention--ok"><p class="insights-v4-attention__text">ok</p></div>
<div class="insights-v4-thresh__head"><span class="insights-v4-thresh__name">N</span></div>
<div class="insights-v4-thresh__row"><span class="insights-v4-thresh__mine insights-v4-thresh__mine--own">12</span></div>
<div class="insights-v4-window"><span class="insights-v4-window__chip is-active">7</span></div>
<div class="insights-v4-maturity insights-v4-maturity--rule">rule</div>
<div class="heys-score-insights-v4__threshold is-maximum"></div>
<span class="reports-v4-period-pill is-active">7</span>
<span class="reports-v4-ready__state is-on">есть</span>
<div class="kcal-realdata-card"><button class="kcal-realdata-card__button kcal-realdata-card__button--secondary">x</button></div>
<div class="reports-v4-dynamics-card"><span class="reports-v4-dynamics-card__delta">+1</span></div>
`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${imports}</style></head><body>
${extra}
${[...blocks].join('\n')}
</body></html>`;
}

function rgbToHex(rgb) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
  if (!m) return rgb;
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
}

function fmtColor(rgb) {
  if (!rgb || rgb === 'rgba(0, 0, 0, 0)' || rgb === 'transparent') return rgb || 'none';
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

function cssPropLabel(prop) {
  return prop === 'backgroundColor' ? 'background' : 'color';
}

function stripComputedSuffix(f) {
  return f
    .replace(/\s*;\s*sand\s+[^;]+blue\s+[^;]+— computed :3001 \d{4}-\d{2}-\d{2}\s*$/, '')
    .replace(/\s*;\s*sand\s+[^;]+blue\s+[^;]+— computed :3001 \d{4}-\d{2}-\d{2}/, '')
    .trim();
}

async function measure(selectors) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-colors-'));
  const file = path.join(tmpDir, 'probe.html');
  fs.writeFileSync(file, buildHtml(selectors));
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
      for (const item of selectors) {
        const id = item.id || item.key + (item.suffix ? `|${item.suffix}` : '');
        const val = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          return getComputedStyle(el)[prop];
        }, { sel: item.sel, prop: item.prop });
        if (!out[id]) out[id] = {};
        out[id][set.id] = val;
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return out;
}

const framePairs = JSON.parse(fs.readFileSync(PAIRS_FILE, 'utf8')).map((p) => ({
  ...p,
  css: cssFileForSelector(p.selector),
  id: p.key,
}));

// Период-лист уже замерен в .ri-measure-period-colors.mjs — пропускаем дубли
const PERIOD_DONE = new Set([
  'Лист периодов · 08', 'Лист периодов · 09', 'Лист периодов · 10', 'Лист периодов · 11',
  'Лист периодов · 14', 'Лист периодов · 17', 'Лист периодов · 20', 'Лист периодов · 21',
  'Лист периодов · 22', 'Лист периодов · 25', 'Лист периодов · 29', 'Лист периодов · 30',
]);

const ONLY_MISSING = process.argv.includes('--only-missing');

const frameFiltered = framePairs.filter((p) => !PERIOD_DONE.has(p.key)).map((p) => ({
  key: p.key,
  sel: p.selector,
  prop: p.prop,
  css: p.css,
  id: p.key,
}));
const frameKeys = new Set(frameFiltered.map((p) => p.key));
const selectors = [
  ...frameFiltered,
  ...CONTRACT.filter((c) => !frameKeys.has(c.key)).map((c) => ({
    ...c,
    id: c.key + (c.suffix ? `|${c.suffix}` : ''),
  })),
];

const measured = await measure(selectors);
const zone = readZone('reports-insights');
const today = new Date().toISOString().slice(0, 10);

let updated = 0;
let confirmed = 0;
let skipped = 0;
const questioned = [];

/** Группируем по key для записи в одну строку f */
const byKey = new Map();
for (const item of selectors) {
  if (!byKey.has(item.key)) byKey.set(item.key, []);
  byKey.get(item.key).push(item);
}

for (const [key, items] of byKey) {
  const row = zone.rows[key];
  if (!row) {
    console.warn(`  skip (нет строки): ${key}`);
    skipped += 1;
    continue;
  }
  if (row.v !== '=') {
    skipped += 1;
    continue;
  }
  if (/computed\s+:3001/i.test(row.f || '')) {
    if (!ONLY_MISSING) confirmed += 1;
    else skipped += 1;
    continue;
  }

  const parts = [];
  let missing = false;
  for (const item of items) {
    const id = item.id;
    const sand = fmtColor(measured[id]?.sand);
    const blue = fmtColor(measured[id]?.blue);
    if (sand == null || blue == null) {
      missing = true;
      console.warn(`  miss ${key} ${item.sel}: sand=${sand} blue=${blue}`);
      continue;
    }
    const css = item.css || cssFileForSelector(item.sel);
    const prop = cssPropLabel(item.prop);
    parts.push(`${css} ${item.sel} ${prop}; sand ${sand} blue ${blue}`);
  }

  if (!parts.length) {
    questioned.push({ key, reason: 'селектор не найден в probe HTML' });
    row.v = '?';
    row.f = `${stripComputedSuffix(row.f || '')}; замер: элемент не найден в probe — computed :3001 ${today}`;
    continue;
  }

  const base = stripComputedSuffix(row.f || '');
  row.f = `${base}; ${parts.join('; ')} — computed :3001 ${today}`;
  updated += 1;
  confirmed += 1;
}

writeZone('reports-insights', zone);

console.log(`\nОбновлено f: ${updated}`);
console.log(`Подтверждено (= с sand+blue): ${confirmed}`);
console.log(`Пропущено: ${skipped}`);
console.log(`Ушло в ?: ${questioned.length}`);
for (const q of questioned) console.log(`  ? ${q.key}: ${q.reason}`);
