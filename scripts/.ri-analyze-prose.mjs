#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readZone } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANVAS = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html',
);

const colorRoleRe =
  /(цвет|чернил|ink|amber|sand-act|act-deep|tone|тон|рол[ьи]|733-ui.*color|734-ui.*color|background|залив|обводк|--v4-(ink|act|sand|amber|good|bad|warn|muted|accent))/i;
const hasMeasurement = /computed :3001/i;
const hasFramePair =
  /733-ui-v4-reports\.css\s+\.[a-z]|734-ui-v4-insights\.css\s+\.[a-z]|740-cascade-card\.css\s+\.[a-z]|100-metrics-and-graphs\.css\s+\.[a-z]/i;

const zone = readZone('reports-insights');
const canvas = fs.readFileSync(CANVAS, 'utf8');

const targets = Object.entries(zone.rows).filter(
  ([, e]) =>
    e.v === '=' &&
    e.f &&
    colorRoleRe.test(e.f) &&
    !hasMeasurement.test(e.f) &&
    !hasFramePair.test(e.f),
);

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCanvasDv(key) {
  const re = new RegExp(`<b>${escRe(key)}</b>\\s*<span data-v="([^"]*)"`, 'i');
  const m = canvas.match(re);
  return m ? m[1] : null;
}

const classRe = /\.([a-z][a-z0-9_-]+(?:__[a-z0-9_-]+)*)/gi;
const productClassRe = /(?:reports-v4-|insights-v4-|heys-score-insights|meal-rec-|kcal-realdata)/;

const out = [];
for (const [key, row] of targets) {
  const dv = getCanvasDv(key) || '';
  const classes = [...new Set([...(row.f.matchAll(classRe))].map((m) => m[1]))].filter((c) =>
    productClassRe.test(c),
  );
  const kind =
    classes.length >= 1
      ? 'maybe-pair'
      : /--tx|--gr|--c1|--c2|--ovl|--act[^-]|--tx2/.test(dv)
        ? 'canvas-prose'
        : /heys_day_stats|pi_ui|heys_cascade|запрет|прогноз|логик|куратор/.test(row.f)
          ? 'logic-prose'
          : 'other-prose';
  out.push({ key, kind, classes: classes.slice(0, 5), dv: dv.slice(0, 120) });
}

const byKind = {};
for (const x of out) byKind[x.kind] = (byKind[x.kind] || 0) + 1;
console.log('total', out.length, 'byKind', byKind);
fs.writeFileSync(path.join(ROOT, 'scripts/.ri-prose-targets.json'), JSON.stringify(out, null, 2));
