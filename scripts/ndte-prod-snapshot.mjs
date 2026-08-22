#!/usr/bin/env node
/**
 * Снимок NDTE: синтетическая таблица «вход → выход» + опционально прод.
 *
 * Синтетика всегда. Прод — если доступен scripts/db/psql.ps1.
 * Этап 1 плана «Норма дня: три числа → одно»: калибровка I.NDTE
 * на стабильном day-average, не на живом hoursSince.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import vm from 'vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'apps/web');

const sandbox = vm.createContext({ console, Date });
vm.runInContext('globalThis.window = globalThis; globalThis.global = globalThis;', sandbox);
for (const file of ['heys_iw_shim.js', 'heys_iw_constants.js', 'heys_iw_utils.js']) {
  vm.runInContext(fs.readFileSync(path.join(WEB, file), 'utf8'), sandbox, { filename: file });
}
const IW = vm.runInContext('globalThis.HEYS.InsulinWave', sandbox);
const I = IW.__internals;

const CASES = [
  { name: 'кардио 18:00, 90 мин z3+z4, 70 кг', training: { z: [0, 0, 60, 30], type: 'cardio', time: '18:00' }, weight: 70, height: 180, dayDate: '2026-08-02', prevDate: '2026-08-01' },
  { name: 'то же, 80 кг (вес дня)', training: { z: [0, 0, 60, 30], type: 'cardio', time: '18:00' }, weight: 80, height: 180, dayDate: '2026-08-02', prevDate: '2026-08-01' },
  { name: 'силовая 10:00 + кардио 19:00', trainings: [
    { z: [0, 0, 60, 30], type: 'strength', time: '10:00' },
    { z: [0, 0, 60, 30], type: 'cardio', time: '19:00' },
  ], weight: 80, height: 180, dayDate: '2026-08-02', prevDate: '2026-08-01' },
  { name: 'без time → decay 0.8', training: { z: [0, 0, 60, 30], type: 'cardio' }, weight: 80, height: 180, dayDate: '2026-08-02', prevDate: '2026-08-01' },
];

function rowOf(c) {
  const trainings = c.trainings || [c.training];
  const pick = I.pickNdteAnchorTraining(trainings);
  let totalKcal = 0;
  for (const t of trainings) totalKcal += I.utils.calculateTrainingKcal(t, c.weight);
  const heightM = c.height / 100;
  const bmi = Math.round((c.weight / (heightM * heightM)) * 10) / 10;
  const avg = I.calculateNDTEDayAverage({
    trainingKcal: totalKcal,
    bmi,
    trainingType: (pick && pick.type) || trainings[0].type || 'cardio',
    trainingsCount: trainings.length,
    dayDate: c.dayDate,
    prevDate: c.prevDate,
    trainingTime: pick && pick.time,
  });
  const bmr = Math.round(10 * c.weight + 6.25 * c.height - 5 * 40 + 5);
  const ndteKcal = Math.round(bmr * avg.tdeeBoost);
  return {
    name: c.name,
    trainingKcal: Math.round(totalKcal),
    type: (pick && pick.type) || trainings[0].type,
    bmi,
    tdeeBoost: avg.tdeeBoost,
    ndteKcal,
    pctBmr: Math.round(avg.tdeeBoost * 1000) / 10,
    vsTraining: totalKcal > 0 ? Math.round((ndteKcal / totalKcal) * 100) : 0,
  };
}

console.log('=== NDTE snapshot (синтетика, day-average) ===\n');
console.log('Множители I.NDTE (источники в комментариях heys_iw_constants.js):');
console.log('  kcalTiers 900/500/300 → 0.10/0.07/0.04 (Jamurtas 2004, Magkos 2008 PMID 17635103)');
console.log('  bmi obese/over/normal/under → 1.8/1.4/1.0/0.8');
console.log('  type strength/cardio/hobby tdee → 1.2/1.0/0.8 (Jamurtas 2004)');
console.log('  cumulative 1+0.2*(n-1), max 1.5');
console.log('  потолок tdeeBoost 0.20');
console.log('  объём: вес дня, 70 только если веса нет\n');

const rows = CASES.map(rowOf);
for (const r of rows) {
  console.log(`${r.name}`);
  console.log(`  kcal=${r.trainingKcal} type=${r.type} bmi=${r.bmi} boost=${r.tdeeBoost} ndte=${r.ndteKcal} (${r.pctBmr}% BMR) = ${r.vsTraining}% от тренировки`);
  if (r.ndteKcal > r.trainingKcal) {
    console.log('  !! надбавка выше энергозатрат тренировки');
  }
}

const obese = I.calculateNDTEDayAverage({
  trainingKcal: 900, bmi: 32, trainingType: 'strength', trainingsCount: 3,
  pieces: [{ hours: 4, hoursSince: 6 }, { hours: 12, hoursSince: 18 }, { hours: 8, hoursSince: 30 }],
});
console.log(`\nпотолок на кусках 4/12/8ч (base~0.30): ${obese.tdeeBoost} (не 0.20 = min(0.20, base×avgDecay))`);

const ps1 = path.join(ROOT, 'scripts/db/psql.ps1');
if (process.argv.includes('--prod') && fs.existsSync(ps1)) {
  console.log('\n=== прод (psql) ===');
  const r = spawnSync('powershell', ['-NoProfile', '-File', ps1, '-X', '-qAt', '-c',
    `SELECT client_id, k FROM client_kv_store WHERE k LIKE 'heys_dayv2_2026-08-%' LIMIT 5;`], {
    encoding: 'utf8', cwd: ROOT,
  });
  if (r.status !== 0) console.log('psql недоступен:', (r.stderr || r.stdout || '').slice(0, 400));
  else console.log(r.stdout.trim() || '(пусто)');
} else {
  console.log('\nпрод не читали (без --prod или нет psql).');
}
