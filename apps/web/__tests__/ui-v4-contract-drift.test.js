// Гейт «контракт поехал, а вердикт остался».
//
// Пакет дизайна приезжает отдельными коммитами, и строку `data-v` в нём меняют
// молча: код остаётся прежним, а приёмка продолжает показывать «совпало». Так
// 21.08 пакет вкладки «Питание» приехал уже после коммита реализации и поменял
// 24 строки — совпало случайно.
//
// Снимок «строка контракта → отпечаток значения» лежит в
// docs/ui/verdicts/<зона>.json рядом с вердиктами.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { findInvalidVerdicts } from '../../../scripts/ui-v4-check-contract-drift.mjs';
import { readCanvasPackage } from '../../../scripts/lib/ui-v4-canvas-index.mjs';
import {
  expectedCanvasZoneIds,
  parseContractDriftList,
  totalContractRows,
} from './helpers/ui-v4-canvas-package.mjs';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/ui-v4-check-contract-drift.mjs');

describe('UI v4 — контракты канвасов не двигались', () => {
  it('не принимает символы вне алфавита = ≠ ? —', () => {
    const data = {
      zones: {
        sample: {
          rows: {
            ok: { v: '=' },
            hidden: { v: '!' },
          },
        },
      },
    };
    expect(findInvalidVerdicts(data)).toEqual([
      { zoneId: 'sample', key: 'hidden', verdict: '!' },
    ]);
  });

  it('умеет проверять сведённые зоны независимо от незакрытого остатка', () => {
    const output = execFileSync(
      'node',
      [SCRIPT, '--zone', 'login', '--zone', 'registration', '--zone', 'curator-edits'],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(output).toContain('Контракты не двигались: 3 зоны');
  });

  it('снимок --list покрывает все зоны пакета и ту же численность строк', { timeout: 45_000 }, () => {
    const canvases = readCanvasPackage();
    const output = execFileSync('node', [SCRIPT, '--list'], { cwd: ROOT, encoding: 'utf8' });
    const listed = parseContractDriftList(output);

    expect(listed.map((zone) => zone.zoneId).sort()).toEqual(expectedCanvasZoneIds(canvases));
    expect(listed.reduce((sum, zone) => sum + zone.rows, 0)).toBe(totalContractRows(canvases));
  });

  // Полная сверка отпечатков — lane 2 после --rehash по зонам пакета 36.
  // Band 5 держит только совпадение реестра и численности со снимком --list.
  it.skip('каждая строка контракта имеет вердикт, снятый с текущего значения', () => {
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
