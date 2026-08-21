// Гейт «контракт поехал, а вердикт остался».
//
// Пакет дизайна приезжает отдельными коммитами, и строку `data-v` в нём меняют
// молча: код остаётся прежним, а приёмка продолжает показывать «совпало». Так
// 21.08 пакет вкладки «Питание» приехал уже после коммита реализации и поменял
// 24 строки — совпало случайно.
//
// Снимок «строка контракта → отпечаток значения» лежит в
// docs/ui/ui-v4-contract-verdicts.json рядом с вердиктами.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/ui-v4-check-contract-drift.mjs');

describe('UI v4 — контракты канвасов не двигались', () => {
  it('каждая строка контракта имеет вердикт, снятый с текущего значения', () => {
    let output = '';
    let failed = false;
    try {
      output = execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      failed = true;
      output = `${error.stdout || ''}${error.stderr || ''}`;
    }
    expect(
      failed,
      `\n${output}\nСводка: node scripts/ui-v4-check-contract-drift.mjs --list`,
    ).toBe(false);
  }, 30_000);
});
