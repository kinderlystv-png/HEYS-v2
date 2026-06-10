#!/usr/bin/env node
// shadow-envelope.mjs — repeatable pre-flip shadow run for sessionBuilder.
//
// Loads the browser-style fingers modules in Node, runs live-like scenarios
// through engineRouter with newEngine+shadowCompare, and checks the rollout
// envelope: builder path, renderability, duration deltas, block-only RFD cap,
// and S4 FTL trimming.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINGERS_DIR = resolve(__dirname, '..', '..');
const check = process.argv.includes('--check');

function installGlobals() {
  globalThis.window = globalThis;
  globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = {
    createElement: () => null,
    Fragment: 'F',
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useMemo: (fn) => fn(),
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
  };
  globalThis.console = Object.assign({}, console, { debug: () => {} });
}

function loadModule(file) {
  // eslint-disable-next-line no-eval
  eval(readFileSync(join(FINGERS_DIR, file), 'utf8'));
}

function loadFingers() {
  [
    'heys_fingers_grips_catalog_v1.js',
    'heys_fingers_programs_catalog_v1.js',
    'heys_fingers_quality_catalog_v1.js',
    'heys_fingers_block_catalog_v1.js',
    'heys_fingers_validators_v1.js',
    'heys_fingers_assessment_v1.js',
    'heys_fingers_age_gating_v1.js',
    'heys_fingers_mix_engine_v1.js',
    'heys_fingers_engine_router_v1.js',
    'heys_fingers_session_builder_v1.js',
  ].forEach(loadModule);
  const Fingers = globalThis.HEYS.Fingers;
  Fingers.flags.newEngine = true;
  Fingers.flags.shadowCompare = true;
  return Fingers;
}

function resetLiveSources(Fingers) {
  delete Fingers.records;
  delete Fingers.getBodyWeight;
  delete Fingers.bodyMetrics;
  delete Fingers.getProfile;
}

function setMvc(Fingers, addedKg, bodyWeightKg = 75) {
  Fingers.records = {
    getMVC: (grip, edge) => (grip === 'halfcrimp' && edge === 20 ? { addedKg } : null),
  };
  Fingers.getBodyWeight = () => ({ kg: bodyWeightKg, source: 'shadow-envelope' });
}

function roles(session) {
  return session ? session.exercises.map((e) => e.__role).join(',') : '';
}

function ids(session) {
  return session ? session.exercises.map((e) => e.atomId).join(',') : '';
}

function shapes(session) {
  const out = {};
  for (const e of (session && session.exercises) || []) {
    out[e.doseShape || '(missing)'] = (out[e.doseShape || '(missing)'] || 0) + 1;
  }
  return Object.keys(out).sort().map((k) => `${k}:${out[k]}`).join(',');
}

function runCase(Fingers, scenario) {
  resetLiveSources(Fingers);
  if (scenario.mvc) setMvc(Fingers, scenario.mvc.addedKg, scenario.mvc.bodyWeightKg);
  if (scenario.profile) Fingers.getProfile = () => scenario.profile;

  const session = Fingers.engineRouter.recommendDay(scenario.opts);
  const diff = Fingers.engineRouter.lastShadowDiff;
  const trace = session && session.__trace;
  const s4 = trace && trace.s4;
  const row = {
    name: scenario.name,
    source: Fingers.engineRouter.lastSource,
    bucket: trace && trace.resolution && trace.resolution.bucket,
    intensity: session && session.intensity,
    durationMin: session && session.durationMin,
    deltaMin: diff && diff.durationMin && diff.durationMin.deltaMin,
    exerciseCount: session && session.exercises && session.exercises.length,
    roles: roles(session),
    ids: ids(session),
    shapes: shapes(session),
    nonRenderable: diff && diff.nonRenderableCount && diff.nonRenderableCount.new,
    uiRisk: !!(diff && diff.nonRenderableCount && diff.nonRenderableCount.uiRendererRisk),
    sessionFtl: s4 && s4.sessionFtl,
    projectedWeek: s4 && s4.projectedWeek,
    s4Enforced: !!(s4 && s4.enforced),
    s4Drops: s4 && s4.drops ? s4.drops.map((d) => `${d.role}:${d.atomId}`).join(',') : '',
  };
  const failures = [];
  if (row.source !== 'new') failures.push(`source=${row.source}`);
  if (row.uiRisk) failures.push('ui-renderer-risk');
  if (row.nonRenderable > 0) failures.push(`non-renderable=${row.nonRenderable}`);
  if (typeof row.deltaMin === 'number' && Math.abs(row.deltaMin) > scenario.maxAbsDeltaMin) {
    failures.push(`delta=${row.deltaMin}`);
  }
  if (scenario.maxDurationMin && row.durationMin > scenario.maxDurationMin) {
    failures.push(`duration=${row.durationMin}`);
  }
  if (scenario.mustNotInclude && row.ids.includes(scenario.mustNotInclude)) {
    failures.push(`contains=${scenario.mustNotInclude}`);
  }
  if (scenario.expectS4Enforced && !row.s4Enforced) failures.push('s4-not-enforced');
  if (scenario.expectDropRole && !row.s4Drops.includes(`${scenario.expectDropRole}:`)) {
    failures.push(`missing-drop=${scenario.expectDropRole}`);
  }
  row.ok = failures.length === 0;
  row.failures = failures;
  return row;
}

function formatTable(rows) {
  const headers = [
    'case', 'src', 'bucket', 'int', 'min', 'delta', 'ftl',
    'risk', 's4', 'drops', 'roles',
  ];
  const body = rows.map((r) => [
    r.name,
    r.source,
    r.bucket,
    r.intensity,
    String(r.durationMin),
    String(r.deltaMin),
    String(r.sessionFtl),
    r.uiRisk ? 'YES' : 'no',
    r.s4Enforced ? 'trim' : 'no',
    r.s4Drops || '-',
    r.roles,
  ]);
  const widths = headers.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join(' | ');
  console.log(line(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  body.forEach((row) => console.log(line(row)));
}

installGlobals();
const Fingers = loadFingers();

const base = { equipmentTypes: ['full'], age: 25, readiness: 'max' };
const referenceMax = Fingers.sessionBuilder.recommendDay({
  equipmentTypes: ['full'], age: 25, level: 'intermediate', readiness: 'max',
});
const s4TrailingAvg = 10000;
const s4WeekToDate = s4TrailingAvg * 1.10 - referenceMax.__trace.s4.sessionFtl + 1;

const scenarios = [
  {
    name: 'no-records',
    opts: base,
    maxAbsDeltaMin: 15,
  },
  {
    name: 'mvc-40-beginner',
    opts: base,
    mvc: { addedKg: 30, bodyWeightKg: 75 },
    maxAbsDeltaMin: 15,
  },
  {
    name: 'mvc-65-intermediate',
    opts: base,
    mvc: { addedKg: 48.75, bodyWeightKg: 75 },
    maxAbsDeltaMin: 15,
  },
  {
    name: 'mvc-90-advanced',
    opts: base,
    mvc: { addedKg: 67.5, bodyWeightKg: 75 },
    maxAbsDeltaMin: 15,
  },
  {
    name: 'explicit-advanced',
    opts: Object.assign({}, base, { profile: { age: 25, level: 'advanced' } }),
    maxAbsDeltaMin: 20,
  },
  {
    name: 'block-max',
    opts: { equipmentTypes: ['block'], age: 25, level: 'intermediate', readiness: 'max' },
    maxAbsDeltaMin: 25,
    maxDurationMin: 55,
    mustNotInclude: 'pow_rfd_pulls',
  },
  {
    name: 'none-max',
    opts: { equipmentTypes: ['none'], age: 25, level: 'intermediate', readiness: 'max' },
    maxAbsDeltaMin: 40,
  },
  {
    name: 's4-overload',
    opts: Object.assign({}, base, {
      level: 'intermediate',
      ftl: { weekToDate: s4WeekToDate, trailingAvg: s4TrailingAvg },
    }),
    maxAbsDeltaMin: 20,
    expectS4Enforced: true,
    expectDropRole: 'strength-endurance',
  },
];

const rows = scenarios.map((scenario) => runCase(Fingers, scenario));
formatTable(rows);

const failed = rows.filter((r) => !r.ok);
if (failed.length) {
  console.log('\nFailures:');
  failed.forEach((r) => console.log(`- ${r.name}: ${r.failures.join(', ')}`));
}
console.log(`\nSummary: ${rows.length - failed.length}/${rows.length} scenarios pass`);

if (check && failed.length) process.exit(1);
