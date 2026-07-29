import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runCausalQa } from '../qa.js';

const seedArg = process.argv.find((arg) => arg.startsWith('--seeds='));
const startArg = process.argv.find((arg) => arg.startsWith('--start='));
const outputArg = process.argv.find((arg) => arg.startsWith('--output='));
const seedCount = seedArg ? Number(seedArg.split('=')[1]) : 10_000;
const seedStart = startArg ? Number(startArg.split('=')[1]) : 0;
const output = resolve(process.cwd(), outputArg?.split('=')[1] ?? '../../test-results/assemble-day-causal-qa-v0.2.json');
const report = runCausalQa(seedCount, new Date().toISOString(), seedStart);
await mkdir(resolve(output,'..'),{recursive:true});
await writeFile(output,`${JSON.stringify(report,null,2)}\n`,'utf8');
const failed = Object.entries(report.simulation.gates).filter(([,gate])=>!gate.passed);
console.log(JSON.stringify({output,seedStart,seedCount,runCount:report.simulation.runCount,simulationHash:report.simulation.simulationHash,coverage:report.simulation.coverage,metrics:report.simulation.metrics,failedGates:failed.map(([id])=>id)},null,2));
if(failed.length||report.simulation.coverage.missingSlots.length||report.simulation.coverage.missingEvents.length||report.simulation.coverage.missingActions.length) process.exitCode=1;
