import { constants as osConstants, setPriority } from 'node:os';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  EXTENDED_REGRESSION_SEEDS,
  REGRESSION_SEEDS,
  runQaProfile,
  runQaSmokeProfile,
  type QaProfileProgress,
  type QaProfileResumeState,
} from '../qa-profile.js';
import { sourceFingerprint } from '../qa.js';

interface CheckpointEnvelope {
  version: 1;
  sourceFingerprint: string;
  mode: 'smoke' | 'regression' | 'extended';
  resumeState: QaProfileResumeState;
}

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const smoke = process.argv.includes('--smoke');
const extended = process.argv.includes('--extended');
const fresh = process.argv.includes('--fresh');
const normalPriority = process.argv.includes('--normal-priority');
const maxNewArg = process.argv.find((arg) => arg.startsWith('--max-new='));
const maxNew = maxNewArg ? Number(maxNewArg.split('=')[1]) : Infinity;
if (smoke && extended) throw new Error('Use either --smoke or --extended, not both');
if ((!Number.isInteger(maxNew) && maxNew !== Infinity) || maxNew < 1) throw new Error(`Invalid --max-new value: ${maxNewArg}`);

const mode: CheckpointEnvelope['mode'] = smoke ? 'smoke' : extended ? 'extended' : 'regression';
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const checkpointArg = process.argv.find((arg) => arg.startsWith('--checkpoint='));
const defaultOutput = smoke
  ? resolve(REPO_ROOT, '.cache/assemble-day/qa-profile-smoke-latest.json')
  : resolve(REPO_ROOT, `.cache/assemble-day/qa-profile-${mode}-latest.json`);
const output = outputArg ? resolve(process.cwd(), outputArg.split('=')[1]!) : defaultOutput;
const checkpoint = checkpointArg
  ? resolve(process.cwd(), checkpointArg.split('=')[1]!)
  : resolve(REPO_ROOT, `.cache/assemble-day/qa-profile-${mode}.checkpoint.json`);
const fingerprint = sourceFingerprint();

if (!normalPriority) {
  try {
    setPriority(0, osConstants.priority.PRIORITY_BELOW_NORMAL);
    console.log('[qa-profile] low process priority enabled; pass --normal-priority to opt out');
  } catch (error) {
    console.warn(`[qa-profile] could not lower process priority: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (fresh && existsSync(checkpoint)) rmSync(checkpoint);
let resumeState: QaProfileResumeState | undefined;
if (!fresh && existsSync(checkpoint)) {
  try {
    const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as CheckpointEnvelope;
    if (saved.version === 1 && saved.sourceFingerprint === fingerprint && saved.mode === mode) {
      resumeState = saved.resumeState;
      console.log(`[qa-profile] resume ${saved.resumeState.runs.length} campaign(s), ${saved.resumeState.replays.length} replay(s)`);
    } else {
      console.log('[qa-profile] checkpoint ignored: source or mode changed');
    }
  } catch (error) {
    console.warn(`[qa-profile] checkpoint ignored: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const startedAt = Date.now();
const initiallyCompleted = (resumeState?.runs.length ?? 0) + (resumeState?.replays.length ?? 0);
class QaProfilePaused extends Error {}
const onProgress = (progress: QaProfileProgress): void => {
  const envelope: CheckpointEnvelope = { version: 1, sourceFingerprint: fingerprint, mode, resumeState: progress.resumeState };
  mkdirSync(dirname(checkpoint), { recursive: true });
  writeFileSync(checkpoint, `${JSON.stringify(envelope)}\n`, 'utf8');
  const elapsedSec = (Date.now() - startedAt) / 1000;
  const newlyCompleted = Math.max(0, progress.completed - initiallyCompleted);
  const remaining = Math.max(0, progress.total - progress.completed);
  const etaSec = newlyCompleted ? Math.round((elapsedSec / newlyCompleted) * remaining) : null;
  const completedRun = progress.resumeState.runs.at(-1);
  const horizon = progress.stage === 'campaign' && completedRun?.spec.horizonDays ? ` · ${completedRun.spec.horizonDays}d` : '';
  console.log(`[qa-profile] ${progress.stage} ${progress.completed}/${progress.total} ${progress.label}${horizon} · ${elapsedSec.toFixed(1)}s${etaSec === null ? '' : ` · ETA ${etaSec}s`}`);
  if (progress.completed - initiallyCompleted >= maxNew && progress.completed < progress.total) throw new QaProfilePaused();
};

let report;
try {
  report = smoke
    ? runQaSmokeProfile({ ...(resumeState ? { resumeState } : {}), onProgress })
    : runQaProfile({ seeds: extended ? EXTENDED_REGRESSION_SEEDS : REGRESSION_SEEDS, ...(resumeState ? { resumeState } : {}), onProgress });
} catch (error) {
  if (error instanceof QaProfilePaused) {
    console.log(`[qa-profile] paused after ${maxNew} new item(s); resume with the same command without --fresh`);
    // Пауза — штатная для ручного порционного запуска, но это ещё не PASS.
    // Ненулевой код не позволяет CI принять незавершённый профиль за успех.
    process.exit(75);
  }
  throw error;
}
const payload = { createdAt: new Date().toISOString(), sourceFingerprint: fingerprint, seedSet: mode, ...report };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
if (existsSync(checkpoint)) rmSync(checkpoint);
console.log(JSON.stringify({ output, campaigns: report.campaigns, passed: report.passed, violations: report.violations.length, variability: report.variability, unreachable: report.reachability }, null, 2));
if (!report.passed) process.exitCode = 1;
