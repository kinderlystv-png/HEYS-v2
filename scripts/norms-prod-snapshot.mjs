#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');
const CLIENTS = {
  anton: { id: 'ccfe6ea3-54d9-4c83-902b-f10e6e8e6d9a', name: 'Антон' },
  alex: { id: '4545ee50-4f5f-4fc0-b862-7ca45fa1bafc', name: 'Александра' },
};
const DATES = ['2026-08-17', '2026-08-18'];

function psql(sql) {
  const ps1 = path.join(ROOT, 'scripts/db/psql.ps1');
  const r = spawnSync('powershell', ['-NoProfile', '-File', ps1, '-X', '-qAt', '-F', '\x01', '-c', sql], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return r.stdout.trim();
}

global.window = global;
global.HEYS = { TEF: { ATWATER: { protein: 3, carbs: 4, fat: 9 } } };
global.HEYS.Steps = {
  STEPS_HISTORY_LOOKBACK_DAYS: 14,
  STEPS_HISTORY_MIN_DAYS: 3,
  medianStepsValue(values) {
    if (!values.length) return 0;
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  },
  collectRecentStepsHistory(readDay, today, lookbackDays = 14) {
    const out = [];
    const anchor = new Date(`${today}T12:00:00`);
    for (let i = 1; i <= lookbackDays; i += 1) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const dd = readDay(key, {}) || {};
      if (dd.steps !== null && dd.steps !== undefined) out.push(Number(dd.steps) || 0);
    }
    return out;
  },
};
new Function('window', fs.readFileSync(path.join(WEB, 'heys_tdee_v1.js'), 'utf8'))(global);
new Function('window', fs.readFileSync(path.join(WEB, 'heys_day_calculations.js'), 'utf8'))(global);

const ids = Object.values(CLIENTS).map((c) => `'${c.id}'`).join(',');
const keySet = new Set(['heys_profile', 'heys_norms']);
for (const date of DATES) keySet.add(`heys_dayv2_${date}`);
for (let i = 1; i <= 14; i += 1) {
  const d = new Date('2026-08-18T12:00:00');
  d.setDate(d.getDate() - i);
  keySet.add(`heys_dayv2_${d.toISOString().slice(0, 10)}`);
}
const allKeys = [...keySet].map((k) => `'${k}'`).join(',');

const raw = psql(
  `SELECT client_id, k, v::text FROM client_kv_store WHERE client_id IN (${ids}) AND k IN (${allKeys}) ORDER BY client_id, k;`,
);
const store = {};
for (const line of raw.split('\n').filter(Boolean)) {
  const parts = line.split('\x01');
  if (parts.length < 3) continue;
  const [cid, k, vtxt] = parts;
  if (!store[cid]) store[cid] = {};
  try { store[cid][k] = JSON.parse(vtxt); } catch { store[cid][k] = null; }
}

function legacyProt(kcal, normPerc) {
  return Math.round((kcal * (Number(normPerc.proteinPct) || 25) / 100) / 3);
}

console.log('=== PROD snapshot + NEW formula (b1af213a), не то что видит клиент до deploy ===\n');

for (const c of Object.values(CLIENTS)) {
  const bag = store[c.id] || {};
  const profile = bag.heys_profile || {};
  const normPerc = bag.heys_norms || {};
  const readDay = (dateKey, fb = {}) => bag[`heys_dayv2_${dateKey}`] || fb;

  console.log(`## ${c.name}`);
  console.log(`weight=${profile.weight} goal=${profile.weightGoal} deficit=${profile.deficitPctTarget}% proteinPct=${normPerc.proteinPct ?? '—'}\n`);

  for (const date of DATES) {
    const day = { ...(bag[`heys_dayv2_${date}`] || {}), date };
    const tdee = global.HEYS.TDEE.calculate(day, profile, {
      anchorDate: date, profile, readDay, hrZones: [], lsGet: (k) => bag[k] ?? null,
    });
    const { normAbs } = global.HEYS.dayCalculations.computeDisplayNorms({
      displayOptimum: tdee.optimum,
      normPerc,
      profile,
      day,
      tdeeResult: tdee,
    });
    const oldProt = legacyProt(tdee.optimum, normPerc);
    console.log(
      `${date}: optimum=${tdee.optimum} steps=${day.steps} stepsKcal=${tdee.stepsKcal} | ` +
      `prot prod~${oldProt}g → new ${normAbs.prot}g | eaten ${day.savedEatenProt ?? '—'}g / ${Math.round(day.savedEatenKcal || 0)} kcal`,
    );
  }
  console.log('');
}
