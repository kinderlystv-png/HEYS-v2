// Гейт неопределённых ролей палитры v4.
//
// `var(--v4-роль, #литерал)` кажется безопасным, но если роль не определена
// нигде, запасное значение срабатывает всегда — цвет молча перестаёт следовать
// набору, и синие/тёмные палитры остаются непокрытыми. Так на вкладке «Питание»
// жили `--v4-chip` и `--v4-surface-strong`: во всех шести наборах показывался
// один песочный литерал.
//
// Список известных мест заморожен в самом скрипте и может только уменьшаться.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/ui-v4-check-undefined-roles.mjs');

describe('UI v4 — роли палитры объявлены', () => {
  it('новых неопределённых ролей нет, известные не расползлись', () => {
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
      `\n${output}\nСписок: node scripts/ui-v4-check-undefined-roles.mjs --list`,
    ).toBe(false);
  }, 30_000);
});
