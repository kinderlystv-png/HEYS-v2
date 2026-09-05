#!/usr/bin/env node
// Gate wrapper: ratchet на недостижимые verdict-backed экраны strength-builder.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const INNER = path.join(HERE, 'ui-v4-check-screen-reachability.mjs');

// 05.09 recount: 6 экранов с «=» в вердиктах, но без production render/маршрута.
const UNREACHABLE_BASELINE = new Set([
  'CuratorEditStatusScreen',
  'CustomExerciseScreen',
  'ExerciseMuscleGroupsScreen',
  'ExerciseSimilarScreen',
  'SupersetBoundariesScreen',
  'TriSetWorkScreen',
]);

function runInnerJson() {
  const result = spawnSync(process.execPath, [INNER, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!result.stdout) {
    console.error(result.stderr || 'ui-v4-check-screen-reachability.mjs failed');
    process.exit(result.status || 1);
  }
  return JSON.parse(result.stdout);
}

function runCli() {
  const report = runInnerJson();
  const unreachable = report.unreachable.map((item) => item.screen);
  const unreachableSet = new Set(unreachable);
  const newOnes = unreachable.filter((name) => !UNREACHABLE_BASELINE.has(name));
  const fixed = [...UNREACHABLE_BASELINE].filter((name) => !unreachableSet.has(name));
  const scope = report.scope;

  console.log(
    `UI v4 screen reachability (${scope.zone}): проверено ${scope.screensChecked} экранов ` +
      `(вердикт «=»), маршрутов ${scope.routesScanned}, navigation ${scope.navigationKeys ?? scope.setViewKeys ?? 0}, ` +
      `symbol-файлов ${scope.symbolFilesScanned ?? scope.productionFilesScanned ?? 0}.`,
  );
  if (scope.unchecked) {
    console.log(`Не проверено (нет объявления): ${scope.unchecked}`);
    for (const item of report.unchecked) {
      console.log(`  ? ${item.screen} — ${item.reason}`);
    }
  }
  console.log(
    `Охват gate: ${scope.screensChecked}/${scope.verdictBackedNames} имён из вердиктов «=»; ` +
      `вне scope: ${scope.dynamicRemainder.length} классов динамики.`,
  );
  console.log(`Остаток вне статики: ${scope.dynamicRemainder.join('; ')}.`);

  if (!newOnes.length) {
    console.log(
      `Недостижимые экраны: ${unreachable.length} (baseline ${UNREACHABLE_BASELINE.size}) — ` +
        'новых нет.',
    );
    if (fixed.length) {
      console.log('Экраны стали достижимы — обновите UNREACHABLE_BASELINE:');
      for (const name of fixed) console.log(`  − ${name}`);
    }
    return;
  }

  console.error(`❌ Новые недостижимые экраны (${newOnes.length}): ${newOnes.join(', ')}`);
  for (const item of report.unreachable.filter((row) => newOnes.includes(row.screen))) {
    console.error(`  ${item.screen} — ${item.declaredAt}, вердиктов «=»: ${item.verdictCount}`);
  }
  process.exitCode = 1;
}

runCli();
