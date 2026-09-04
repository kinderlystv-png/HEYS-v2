#!/usr/bin/env node
/** Prose-строки reports-insights: пара кадр→правило + sand/blue или «пары нет, роль названа прозой». */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { patchZoneRow, readZone } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via patchZoneRow — assertForeignRowsUnchanged outside scope keys.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html',
);
const TARGETS_FILE = path.join(ROOT, 'scripts/.ri-prose-targets.json');

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

const colorRoleRe =
  /(цвет|чернил|ink|amber|sand-act|act-deep|tone|тон|рол[ьи]|733-ui.*color|734-ui.*color|background|залив|обводк|--v4-(ink|act|sand|amber|good|bad|warn|muted|accent))/i;
const hasMeasurement = /computed :3001/i;
const hasFramePair =
  /733-ui-v4-reports\.css\s+\.[a-z]|734-ui-v4-insights\.css\s+\.[a-z]|740-cascade-card\.css\s+\.[a-z]|100-metrics-and-graphs\.css\s+\.[a-z]/i;
const proseNoteRe = /;\s*пары нет, роль названа прозой/;

/** Явные пары, которые не вытащить из f одной эвристикой. */
const MANUAL = {
  'Инсайты · 54': [{ sel: '.insights-v4-attention--ok .insights-v4-attention__text', prop: 'color' }],
  'Инсайты · 57': [{ sel: '.insights-v4-attention__basis', prop: 'color' }],
  'Инсайты · ярус Питание · 15': [{ sel: '.insights-v4-nutrition__bzhu-seg--prot', prop: 'backgroundColor', suffix: 'prot' }],
  'Инсайты · ярус Питание · 16': [{ sel: '.insights-v4-nutrition__bzhu-seg--fat', prop: 'backgroundColor', suffix: 'fat' }],
  'Инсайты · ярус Питание · 17': [{ sel: '.insights-v4-nutrition__bzhu-seg--carbs', prop: 'backgroundColor', suffix: 'carbs' }],
  'Инсайты · ярус Питание · 18': [{ sel: '.insights-v4-nutrition__bzhu-seg--prot', prop: 'backgroundColor', suffix: 'prot' }],
  'Инсайты · ярус Питание · 19': [{ sel: '.insights-v4-nutrition__bzhu-seg--fat', prop: 'backgroundColor', suffix: 'fat' }],
  'Инсайты · ярус Питание · 20': [{ sel: '.insights-v4-nutrition__bzhu-seg--carbs', prop: 'backgroundColor', suffix: 'carbs' }],
  'Инсайты · ярус Питание · 21': [{ sel: '.insights-v4-nutrition__bzhu-seg--prot', prop: 'backgroundColor', suffix: 'prot' }],
  'Инсайты · ярус Питание · 22': [{ sel: '.insights-v4-nutrition__bzhu-seg--fat', prop: 'backgroundColor', suffix: 'fat' }],
  'Визуал v4 · Отчёты · 54': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Визуал v4 · Отчёты · 55': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Визуал v4 · Отчёты · 57': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Визуал v4 · Отчёты · 58': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Визуал v4 · Отчёты · 60': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Отчёты · нулевая строка матрицы · 23': [{ sel: '.reports-v4-discipline__bar-fill', prop: 'backgroundColor' }],
  'Отчёты · нулевая строка матрицы · 06': [{ sel: '.reports-v4-tier', prop: 'color' }],
  'Неделя к неделе · одна закрытая · 06': [{ sel: '.reports-v4-tier', prop: 'color' }],
  'Мало калорий · подтверждение · 05': [{ sel: '.reports-v4-tier', prop: 'color' }],
  'Неделя к неделе · одна закрытая · 21': [{ sel: '.reports-v4-weeks__date', prop: 'color' }],
  'Визуал v4 · Отчёты · 85': [{ sel: '.reports-v4-weeks__date', prop: 'color' }],
  'Инсайты · новый пользователь · 11': [{ sel: '.insights-v4-stub__progress-fill', prop: 'backgroundColor' }],
  'Инсайты · новый пользователь · 20': [{ sel: '.insights-v4-stub__warning', prop: 'backgroundColor' }],
  'Раскрывашка · Как считается долг · 07': [{ sel: '.insights-v4-sources__card', prop: 'backgroundColor' }],
  'Раскрывашка · Как посчитано · 07': [{ sel: '.insights-v4-sources__card', prop: 'backgroundColor' }],
  'Стоит внимания · панель Ещё · 11': [{ sel: '.insights-v4-attention__sheet-link', prop: 'color' }],
  'Визуал v4 · Отчёты · 31': [{ sel: '.heys-score-tile__delta', prop: 'color' }],
  'Визуал v4 · Отчёты · 36': [{ sel: '.heys-score-tile__entry', prop: 'color' }],
  'Визуал v4 · Отчёты · 38': [{ sel: '.heys-score-tile__entry-chevron', prop: 'color' }],
  'Разбор Score · 06': [{ sel: '.heys-score-screen__kicker', prop: 'color' }],
  'Инсайты · новый пользователь · 26': [{ sel: '.insights-v4-stub__ladder-day.is-passed', prop: 'color' }],
  'Мало калорий · подтверждение · рисунок 03': [
    { sel: '.reports-v4-dynamics-card .sparkline-dot--reports-v4', prop: 'fill', suffix: 'dot' },
  ],
  'Раскрывашка · Как считается долг · 08': [{ sel: '.insights-v4-sources__row', prop: 'borderBottomColor', suffix: 'border' }],
  'Раскрывашка · Как посчитано · 08': [{ sel: '.insights-v4-sources__row', prop: 'borderBottomColor', suffix: 'border' }],
};

/** Ключи без замеряемой пары цвета (геометрия / логика / только проза контракта). */
const PROSE_ONLY = new Set([
  'Инсайты · рисунок 09',
  'Инсайты · метаболизм · 07',
  'Инсайты · новый пользователь · 15',
  'Инсайты · новый пользователь · 08',
  'Инсайты · новый пользователь · 27',
  'Отчёты · мало данных · 07',
  'Визуал v4 · Отчёты · 70',
]);

function cssFileForSelector(sel) {
  const s = sel.split(',')[0].trim();
  if (s.includes('kcal-realdata')) return '100-metrics-and-graphs.css';
  if (s.includes('heys-score-screen') || s.includes('reports-v4') || s.includes('sparkline')) {
    return '733-ui-v4-reports.css';
  }
  if (s.includes('heys-score-tile')) return '740-cascade-card.css';
  if (s.includes('heys-score') && !s.includes('insights')) return '740-cascade-card.css';
  if (s.includes('insights-v4') || s.includes('heys-score-insights') || s.includes('meal-rec')) {
    return '734-ui-v4-insights.css';
  }
  return '733-ui-v4-reports.css';
}

function inferProp(sel, f) {
  const s = sel.toLowerCase();
  const fl = f.toLowerCase();
  if (/bar-fill|progress-fill|bzhu-seg|__dot|noplot|background|залив|фон/.test(s + fl)) return 'backgroundColor';
  if (/border|разделит|рамк|inset/.test(fl) && !/color|чернил|ink|тон/.test(fl)) return null;
  return 'color';
}

function extractClassFromF(f) {
  const paren = f.match(/\(\s*(\.[a-z][a-z0-9_-]*(?:__[a-z0-9_-]+)*(?:--\*|\*)?)/i);
  if (paren) return paren[1].replace(/\*$/, '');
  const dotted = f.match(/(\.[a-z][a-z0-9_-]*(?:__[a-z0-9_-]+)+)/i);
  return dotted ? dotted[1] : null;
}

function resolveSelector(cls) {
  if (!cls) return null;
  if (cls.includes('--*')) return null;
  if (cls.includes('attention__text')) return '.insights-v4-attention--ok .insights-v4-attention__text';
  return cls.startsWith('.') ? cls : `.${cls}`;
}

function buildPairsForKey(key, f) {
  if (PROSE_ONLY.has(key)) return null;
  if (MANUAL[key]) {
    return MANUAL[key].map((p) => ({ ...p, key, css: cssFileForSelector(p.sel) }));
  }
  const cls = extractClassFromF(f);
  const sel = resolveSelector(cls);
  if (!sel) return null;
  const prop = inferProp(sel, f);
  if (!prop) return null;
  return [{ key, sel, prop, css: cssFileForSelector(sel) }];
}

function buildHtml(selectors) {
  const imports = CSS_FILES.map((f) =>
    `@import url("${path.join(MODULES, f).replace(/\\/g, '/')}");`,
  ).join('\n');

  const blocks = new Set();
  for (const { sel } of selectors) {
    for (const part of sel.split(',')) {
      const s = part.trim();
      const classes = [...s.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]);
      if (!classes.length) continue;
      blocks.add(`<div class="${classes.join(' ')}">·</div>`);
    }
  }

  const extra = `
<div class="reports-v4-discipline__bar"><span class="reports-v4-discipline__bar-fill"></span></div>
<div class="reports-v4-tier">tier</div>
<div class="reports-v4-weeks__date">12–18 авг</div>
<div class="insights-v4-attention insights-v4-attention--ok"><p class="insights-v4-attention__text">ok</p><p class="insights-v4-attention__basis">basis</p><a class="insights-v4-attention__sheet-link">link</a></div>
<div class="insights-v4-nutrition__bzhu"><span class="insights-v4-nutrition__bzhu-seg--prot"></span><span class="insights-v4-nutrition__bzhu-seg--fat"></span><span class="insights-v4-nutrition__bzhu-seg--carbs"></span></div>
<div class="insights-v4-stub"><div class="insights-v4-stub__progress"><div class="insights-v4-stub__progress-fill"></div></div><div class="insights-v4-stub__warning">w</div></div>
<div class="insights-v4-sources"><div class="insights-v4-sources__card"><div class="insights-v4-sources__row"><span class="insights-v4-sources__name">n</span></div></div><div class="insights-v4-sources__tier">t</div></div>
<div class="insights-v4-sheet"><p class="insights-v4-sheet__text">t</p></div>
<div class="insights-v4-pheno"><div class="insights-v4-pheno__row"><span class="insights-v4-pheno__name">n</span></div><p class="insights-v4-pheno__note">n</p></div>
<div class="insights-v4-thresh"><div class="insights-v4-thresh__row"><span class="insights-v4-thresh__name">n</span><span class="insights-v4-thresh__common">c</span><span class="insights-v4-thresh__why">w</span></div><p class="insights-v4-thresh__note">n</p><p class="insights-v4-thresh__where">w</p></div>
<div class="insights-v4-fail"><div class="insights-v4-fail__tier">t</div><div class="insights-v4-fail__row"><span class="insights-v4-fail__row-name">n</span><span class="insights-v4-fail__row-state">s</span></div></div>
<div class="meal-rec-done"><h3 class="meal-rec-done__title">t</h3><p class="meal-rec-done__note">n</p><p class="meal-rec-done__hint">h</p></div>
<div class="insights-v4-stub"><p class="insights-v4-stub__title">t</p><div class="insights-v4-stub__fill-row"><span class="insights-v4-stub__fill-state">s</span></div><p class="insights-v4-stub__ladder-text">t</p></div>
<div class="reports-v4-stub"><p class="reports-v4-stub__kicker">k</p></div>
<div class="reports-v4-weight-cycle-footnote">fn</div>
<div class="insights-v4-detail-link"><span class="insights-v4-detail-link__chevron">›</span></div>
<div class="insights-v4-nutrition"><p class="insights-v4-nutrition__legend">leg</p></div>
<div class="heys-score-tile"><span class="heys-score-tile__delta">+5</span><span class="heys-score-tile__entry">e</span><span class="heys-score-tile__entry-chevron">›</span></div>
<div class="heys-score-screen"><div class="heys-score-screen__kicker">k</div></div>
<div class="insights-v4-stub__ladder"><span class="insights-v4-stub__ladder-day is-passed">3</span></div>
<div class="reports-v4-dynamics-card"><svg width="40" height="20"><circle class="sparkline-dot--reports-v4" cx="20" cy="10" r="4"/></svg></div>
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
  if (prop === 'backgroundColor') return 'background';
  if (prop === 'borderBottomColor') return 'border-bottom';
  if (prop === 'fill') return 'fill';
  return 'color';
}

function stripSuffixes(f) {
  return (f || '')
    .replace(/\s*;\s*sand\s+[^;]+blue\s+[^;]+— computed :3001 \d{4}-\d{2}-\d{2}\s*$/, '')
    .replace(/\s*;\s*пары нет, роль названа прозой[^;]*(?:;|$)/, '')
    .trim();
}

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCanvasDv(key, canvas) {
  const re = new RegExp(`<b>${escRe(key)}</b>\\s*<span data-v="([^"]*)"`, 'i');
  const m = canvas.match(re);
  return m ? m[1] : '';
}

function proseExcerpt(dv) {
  const clean = dv.replace(/\s+/g, ' ').trim();
  if (clean.length <= 90) return clean;
  return clean.slice(0, 87) + '…';
}

async function measure(selectors) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ri-prose-'));
  const file = path.join(tmpDir, 'probe.html');
  fs.writeFileSync(file, buildHtml(selectors));
  const browser = await chromium.launch();
  const out = {};
  try {
    const page = await browser.newPage();
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    for (const set of SETS) {
      await page.evaluate(({ theme, palette, themeId }) => {
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-palette', palette);
        document.documentElement.setAttribute('data-theme-id', themeId);
      }, set);
      for (const item of selectors) {
        const id = item.id || `${item.key}${item.suffix ? `|${item.suffix}` : ''}`;
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

const DRY = process.argv.includes('--dry');
const canvas = fs.readFileSync(CANVAS, 'utf8');
const targetsMeta = JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf8'));
const zone = readZone('reports-insights');
const today = new Date().toISOString().slice(0, 10);

const targets = Object.entries(zone.rows).filter(
  ([, e]) =>
    e.v === '=' &&
    e.f &&
    colorRoleRe.test(e.f) &&
    !hasMeasurement.test(e.f) &&
    !hasFramePair.test(e.f) &&
    !proseNoteRe.test(e.f),
);

const kindByKey = new Map(targetsMeta.map((t) => [t.key, t.kind]));

/** key → pair specs */
const pairPlan = new Map();
const prosePlan = [];

for (const [key, row] of targets) {
  const pairs = buildPairsForKey(key, row.f);
  if (pairs?.length) {
    pairPlan.set(key, pairs);
  } else {
    prosePlan.push({ key, kind: kindByKey.get(key) || 'other-prose', row });
  }
}

const allSelectors = [];
for (const pairs of pairPlan.values()) {
  for (const p of pairs) {
    allSelectors.push({ ...p, id: `${p.key}${p.suffix ? `|${p.suffix}` : ''}` });
  }
}

console.log(`Целей: ${targets.length}, пар: ${pairPlan.size}, прозой: ${prosePlan.length}`);

let measured = {};
if (!DRY && allSelectors.length) {
  measured = await measure(allSelectors);
}

let paired = 0;
let proseMarked = 0;
const pairedKeys = [];
const proseKeys = [];
const failed = [];

for (const [key, pairs] of pairPlan) {
  const parts = [];
  let ok = true;
  for (const p of pairs) {
    const id = `${p.key}${p.suffix ? `|${p.suffix}` : ''}`;
    const sand = fmtColor(measured[id]?.sand);
    const blue = fmtColor(measured[id]?.blue);
    if (sand == null || blue == null) {
      ok = false;
      failed.push({ key, sel: p.sel, sand, blue });
      break;
    }
    parts.push(`${p.css} ${p.sel} ${cssPropLabel(p.prop)}; sand ${sand} blue ${blue}`);
  }
  if (!ok) {
    const row = zone.rows[key];
    prosePlan.push({ key, kind: 'pair-failed', row, reason: failed.at(-1) });
    continue;
  }
  if (DRY) {
    console.log(`[pair] ${key}: ${parts.join('; ')}`);
    paired += 1;
    pairedKeys.push(key);
    continue;
  }
  patchZoneRow('reports-insights', key, (row) => {
    row.f = `${stripSuffixes(row.f)}; ${parts.join('; ')} — computed :3001 ${today}`;
  });
  paired += 1;
  pairedKeys.push(key);
}

for (const { key, kind, row, reason } of prosePlan) {
  const dv = getCanvasDv(key, canvas);
  const excerpt = proseExcerpt(dv);
  const kindLabel =
    kind === 'canvas-prose'
      ? 'роли канваса (--tx/--gr/--c1)'
      : kind === 'logic-prose'
        ? 'логика/поведение без кадра'
        : kind === 'pair-failed'
          ? `селектор не найден (${reason?.sel || '?'})`
          : 'описание без селектора в продукте';
  const note = `пары нет, роль названа прозой (${kindLabel}) — контракт: «${excerpt || key}»`;
  if (DRY) {
    console.log(`[prose] ${key}: ${note.slice(0, 100)}…`);
  } else {
    patchZoneRow('reports-insights', key, (live) => {
      live.f = `${stripSuffixes(live.f)}; ${note}`;
    });
  }
  proseMarked += 1;
  proseKeys.push(key);
}

console.log('\n--- итог ---');
console.log('спарено и замерено:', paired);
console.log('осталось прозой:', proseMarked);
if (failed.length) console.log('не замерилось → проза:', failed.length);

fs.writeFileSync(
  path.join(ROOT, 'scripts/.ri-prose-report.json'),
  JSON.stringify({ paired: pairedKeys, prose: proseKeys, failed, date: today }, null, 2),
);
