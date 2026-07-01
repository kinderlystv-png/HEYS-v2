#!/usr/bin/env node
/**
 * Deprecated push helper.
 *
 * `push:safe` used to run a separate HUSKY=0 push pipeline. That is no longer
 * the supported HEYS flow because it can drift from `.husky/pre-push`.
 */

const args = new Set(process.argv.slice(2).filter((arg) => arg !== '--'));

function writeLine(text = '') {
  process.stdout.write(`${text}\n`);
}

function writeError(text = '') {
  process.stderr.write(`${text}\n`);
}

function printGuidance(write) {
  write('push:safe is deprecated and no longer performs mutating pushes.');
  write('');
  write('Use the safe flow instead:');
  write('  1) pnpm push:preflight');
  write('  2) pnpm push:agent -- --print-command');
  write('  3) pnpm push:agent -- --confirm-push --title="..." --item-title="..." --item-description="..."');
  write('');
  write('HUSKY=0 is not a normal push flow for HEYS.');
}

if (args.has('--dry-run')) {
  printGuidance(writeLine);
  process.exit(0);
}

printGuidance(writeError);
process.exit(2);
