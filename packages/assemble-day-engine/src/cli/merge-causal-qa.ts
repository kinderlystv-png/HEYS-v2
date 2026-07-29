import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { mergeCausalQaReports } from '../qa-merge.js';
import type { QaReport } from '../qa.js';

const inputsArg=process.argv.find((arg)=>arg.startsWith('--inputs=')),outputArg=process.argv.find((arg)=>arg.startsWith('--output='));
if(!inputsArg)throw new Error('--inputs=file1,file2 is required');
const inputs=inputsArg.slice('--inputs='.length).split(',').map((path)=>resolve(process.cwd(),path)),output=resolve(process.cwd(),outputArg?.slice('--output='.length)??'../../docs/assemble-day/reports/causal-qa-v0.2.json');
const reports=await Promise.all(inputs.map(async(path)=>JSON.parse(await readFile(path,'utf8')) as QaReport)),report=mergeCausalQaReports(reports);
await writeFile(output,`${JSON.stringify(report,null,2)}\n`,'utf8');
const failed=Object.entries(report.simulation.gates).filter(([,gate])=>!gate.passed).map(([id])=>id);
console.log(JSON.stringify({output,seedCount:report.simulation.seedCount,runCount:report.simulation.runCount,simulationHash:report.simulation.simulationHash,sourceFingerprint:report.sourceFingerprint,coverage:report.simulation.coverage,metrics:report.simulation.metrics,failedGates:failed},null,2));
if(failed.length||report.simulation.coverage.missingSlots.length||report.simulation.coverage.missingEvents.length||report.simulation.coverage.missingActions.length)process.exitCode=1;
