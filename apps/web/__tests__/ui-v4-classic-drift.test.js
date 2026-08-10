import { execFileSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Гейт перекраски. Замена вида var(--роль, #литерал) кажется безопасной, но
// запасное значение срабатывает только у неопределённой роли — а этап 1 задал
// все роли для всех шести палитр. Значит показывается значение роли, и если оно
// отличается от литерала, классика меняется молча. Так в этап 4 и батчи CSS
// приехало 227 сдвигов: белая активная вкладка вместо голубой, синяя метка
// белка вместо красной, белые подложки вместо цветных.
//
// Глазами это не ловится: каждый отдельный сдвиг выглядит как «чуть другой
// оттенок», а заметен только рядом с прежней версией.

const ROOT = path.resolve(__dirname, '../../..');
const SCRIPT = path.join(ROOT, 'scripts/ui-v4-check-classic-drift.mjs');

describe('UI v4 — перекраска не сдвигает классику', () => {
  it('каждая роль показывает тот же цвет, что стоял литералом', () => {
    let output = '';
    let failed = false;
    try {
      output = execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' });
    } catch (error) {
      failed = true;
      output = `${error.stdout || ''}${error.stderr || ''}`;
    }
    expect(failed, `\n${output}\nПочинить: node scripts/ui-v4-check-classic-drift.mjs --fix`).toBe(
      false,
    );
  }, 30_000);
});
