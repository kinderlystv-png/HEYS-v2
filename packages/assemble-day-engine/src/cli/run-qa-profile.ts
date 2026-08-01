import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { EXTENDED_REGRESSION_SEEDS, REGRESSION_SEEDS, runQaProfile } from '../qa-profile.js';
import { sourceFingerprint } from '../qa.js';

const extended = process.argv.includes('--extended');
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const output = resolve(process.cwd(), outputArg?.split('=')[1] ?? '../../docs/assemble-day/reports/qa-profile-v1.0.json');
const report = runQaProfile({ seeds: extended ? EXTENDED_REGRESSION_SEEDS : REGRESSION_SEEDS });
const payload = { createdAt: new Date().toISOString(), sourceFingerprint: sourceFingerprint(), seedSet: extended ? 'extended' : 'regression', ...report };
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, campaigns: report.campaigns, passed: report.passed, violations: report.violations.length, variability: report.variability, unreachable: report.reachability }, null, 2));
if (!report.passed) process.exitCode = 1;
