#!/usr/bin/env node
/**
 * lint-react-start-transition.mjs
 *
 * Budget-guard на использование `React.startTransition(...)` в apps/web/.
 *
 * Why: React.startTransition оборачивает state-обновление как low-priority. В
 * курaторской сессии HEYS (где постоянно идёт фоновый sync клиентов, leaderboard,
 * мессенджер, badges) React deprioritizes и **отбрасывает** transition'ы — tap
 * визуально не срабатывает. См. docs/REFACTOR_REACT_MEMO_DAY_TAB.md для деталей и
 * полного refactor-плана.
 *
 * Сегодняшний sweep (2026-05-28) убрал 14 wrap'ов в tap-path'ах. Оставшиеся 13
 * употреблений — в useEffect (background hydration), drag-handlers, или
 * defensive fallback паттернах. Это baseline.
 *
 * Если новый коммит увеличивает счётчик — это **знак что добавлен новый
 * tap-path с тем же anti-pattern**. Скрипт warn'ает (не блокирует) с
 * напоминанием прочитать REFACTOR doc.
 *
 * Usage:
 *   node scripts/lint-react-start-transition.mjs
 *   node scripts/lint-react-start-transition.mjs --strict   # exit 1 on excess
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const BASELINE = 13;
const STRICT = process.argv.includes('--strict');

function countMatches() {
  try {
    const output = execSync(
      "grep -rn 'React\\.startTransition(' apps/web/ --include='*.js' 2>/dev/null | grep -v 'bundle\\|dist/\\|public/\\|/__tests__/\\|\\.test\\.\\|\\.spec\\.' | wc -l",
      { cwd: ROOT, encoding: 'utf8' }
    );
    return parseInt(output.trim(), 10);
  } catch (_) {
    return 0;
  }
}

function listMatches() {
  try {
    const output = execSync(
      "grep -rn 'React\\.startTransition(' apps/web/ --include='*.js' 2>/dev/null | grep -v 'bundle\\|dist/\\|public/\\|/__tests__/\\|\\.test\\.\\|\\.spec\\.'",
      { cwd: ROOT, encoding: 'utf8' }
    );
    return output.split('\n').filter(Boolean);
  } catch (_) {
    return [];
  }
}

const count = countMatches();

if (count > BASELINE) {
  const matches = listMatches();
  process.stderr.write(
    `\n⚠️  React.startTransition counter: ${count} > baseline ${BASELINE} (+${count - BASELINE})\n`
  );
  process.stderr.write(
    `\nЗа последний год паттерн setTimeout(0) → React.startTransition → setX(...) сломал\n` +
    `8 tap-path'ов в курaторской сессии (advice modal, meals expand, stats popups,\n` +
    `supplements toggle, product add/edit). Все они были закрыты drop'ом обёртки.\n\n` +
    `Структурный фикс — docs/REFACTOR_REACT_MEMO_DAY_TAB.md.\n\n` +
    `Текущие места:\n`
  );
  matches.forEach((m) => process.stderr.write(`  ${m}\n`));
  process.stderr.write(`\n`);

  if (STRICT) {
    process.stderr.write('❌ --strict mode → push отменён.\n');
    process.exit(1);
  }
  // Warn-only по умолчанию — push продолжается.
  process.exit(0);
}

if (count < BASELINE) {
  process.stdout.write(
    `✅ React.startTransition counter: ${count} < baseline ${BASELINE}. ` +
    `Если убрал ещё одно использование — обнови baseline в scripts/lint-react-start-transition.mjs.\n`
  );
} else {
  process.stdout.write(`✅ React.startTransition counter: ${count} (baseline).\n`);
}
process.exit(0);
