#!/usr/bin/env node
/**
 * release-preflight.mjs — обязательный прогон перед открытием клиентской
 * ступени (план 22 § 1.10.5).
 *
 * Состав пакета зафиксирован аудитом release-readiness: он проверяет ровно те
 * зоны, где отказ виден клиенту (auth/session, sync, storage-контракты, целость
 * legacy-бандлов, покрытие тренировочных режимов), и намеренно не запускает
 * `pnpm test` — корневой `test` в turbo зависит от `build`, а сборка мутирует
 * generated-артефакты.
 *
 * Скрипт ничего не мутирует: только читает и запускает проверки. Падает на
 * первой ошибке, чтобы «зелёный прогон» нельзя было получить частично.
 *
 * Usage:
 *   pnpm release:preflight
 *   pnpm release:preflight -- --continue-on-error   # прогнать всё и увидеть полный список проблем
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));
const continueOnError = args.has('--continue-on-error');

/**
 * Порядок намеренный: сначала дешёвые статические гейты, потом тесты, потом
 * самые долгие проверки артефактов. Так типовая ошибка находится быстрее.
 */
const CHECKS = [
  {
    name: 'CI workflows валидны',
    command: 'pnpm',
    argv: ['validate:ci'],
  },
  {
    name: 'Нет прямых записей в localStorage мимо store',
    command: 'node',
    argv: ['scripts/lint-direct-localstorage-writes.mjs'],
  },
  {
    name: 'Нет client-записей без scope',
    command: 'node',
    argv: ['scripts/lint-unscoped-client-writes.mjs'],
  },
  {
    name: 'Нет сырых очисток сессии',
    command: 'node',
    argv: ['scripts/lint-raw-session-clear.mjs'],
  },
  {
    name: 'Критические тесты синхронизации',
    command: 'pnpm',
    argv: ['test:web:sync-critical'],
  },
  {
    name: 'Регрессии (auth, session, write-context)',
    command: 'pnpm',
    argv: ['test:regressions'],
  },
  {
    name: 'Legacy-бандлы совпадают с манифестом и index.html',
    command: 'pnpm',
    argv: ['verify:legacy-bundles'],
  },
  {
    name: 'Покрытие карты мобильности',
    command: 'pnpm',
    argv: ['--dir', 'apps/web', 'run', 'check:mobility-map'],
  },
];

function runCheck(check) {
  const started = Date.now();
  const result = spawnSync(check.command, check.argv, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  return {
    ok: result.status === 0,
    status: result.status,
    seconds: ((Date.now() - started) / 1000).toFixed(1),
  };
}

function main() {
  console.log(`\n[release-preflight] Пакет из ${CHECKS.length} проверок. Ничего не мутируем.\n`);

  const results = [];
  for (const [index, check] of CHECKS.entries()) {
    console.log(`\n──────── ${index + 1}/${CHECKS.length} · ${check.name}\n`);
    const outcome = runCheck(check);
    results.push({ name: check.name, ...outcome });

    if (!outcome.ok && !continueOnError) {
      report(results, { stoppedEarly: true });
      process.exit(1);
    }
  }

  const failed = results.filter((r) => !r.ok);
  report(results, { stoppedEarly: false });
  process.exit(failed.length ? 1 : 0);
}

function report(results, { stoppedEarly }) {
  console.log('\n──────── Итог\n');
  for (const r of results) {
    console.log(`${r.ok ? '✅' : '❌'} ${r.name} (${r.seconds}s)`);
  }

  const failed = results.filter((r) => !r.ok);
  const skipped = CHECKS.length - results.length;

  if (failed.length === 0 && skipped === 0) {
    console.log('\n[release-preflight] ✅ Пакет пройден полностью.\n');
    return;
  }

  if (stoppedEarly) {
    console.log(
      `\n[release-preflight] ❌ Остановлено на первой ошибке; не запущено проверок: ${skipped}.` +
        '\n[release-preflight] Полный список проблем: pnpm release:preflight -- --continue-on-error\n',
    );
    return;
  }

  console.log(`\n[release-preflight] ❌ Провалено проверок: ${failed.length}.\n`);
}

main();
