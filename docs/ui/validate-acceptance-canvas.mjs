#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const pack = path.join(root, 'handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4');

function extractSpecs(html, mode) {
  let slice = html;
  if (mode === 'contract') {
    const m = html.match(/<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/);
    if (!m) return { err: 'data-contract block not found' };
    slice = m[1];
  }
  const re = /<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g;
  const rows = [];
  let match;
  while ((match = re.exec(slice)) !== null) rows.push({ key: match[1], value: match[2] });
  return { rows };
}

function demoCounts(html) {
  const counts = {};
  for (const m of html.matchAll(/data-demo="([^"]+)"/g)) {
    counts[m[1]] = (counts[m[1]] || 0) + 1;
  }
  return counts;
}

function phWithoutDemo(html) {
  const bad = [];
  for (const m of html.matchAll(/<div class="ph[^"]*"[^>]*>/g)) {
    const tag = m[0];
    if (!tag.includes('data-demo=')) bad.push(tag.slice(0, 80));
  }
  return bad;
}

const zones = [
  ['home-widgets', 'home-widgets.v4.dc.html', 'contract'],
  ['water-add', 'water-add.v4.dc.html', 'all'],
  ['checkin-morning', 'checkin-morning.v4.dc.html', 'contract'],
];

const report = { ok: true, zones: [], water: {} };

for (const [id, file, mode] of zones) {
  const html = fs.readFileSync(path.join(pack, file), 'utf8');
  const ex = extractSpecs(html, mode);
  const rows = ex.rows || [];
  const dup = rows.filter((r, i, a) => a.findIndex((x) => x.key === r.key) !== i).map((r) => r.key);
  const empty = rows.filter((r) => !r.value.trim()).map((r) => r.key);
  const noDemo = phWithoutDemo(html);
  const z = {
    id,
    file,
    specs: rows.length,
    err: ex.err,
    dup: [...new Set(dup)],
    empty,
    demo: demoCounts(html),
    phMissingDemo: noDemo.length,
  };
  if (ex.err || dup.length || empty.length) report.ok = false;
  report.zones.push(z);
}

const waterHtml = fs.readFileSync(path.join(pack, 'water-add.v4.dc.html'), 'utf8');
const plus250 = [...waterHtml.matchAll(/\+250/g)].map((m) => {
  const start = Math.max(0, m.index - 50);
  return waterHtml.slice(start, m.index + 15).replace(/\s+/g, ' ').trim();
});
report.water = {
  colPop200: (waterHtml.match(/class="plus">\+200/g) || []).length,
  colPop250: (waterHtml.match(/class="plus">\+250/g) || []).length,
  plus250Contexts: plus250,
  podpisi: extractSpecs(waterHtml, 'all').rows?.find((r) => r.key === 'подписи')?.value,
};

const homeHtml = fs.readFileSync(path.join(pack, 'home-widgets.v4.dc.html'), 'utf8');
report.home = {
  vtorogoGap: extractSpecs(homeHtml, 'contract').rows?.find((r) => r.key === 'второго gap нет')?.value?.slice(0, 80),
};

console.log(JSON.stringify(report, null, 2));
