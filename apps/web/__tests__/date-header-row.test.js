import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

let formatDateHeaderRow;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-10T12:00:00+03:00'));

  const utilsSrc = read('apps/web/heys_day_utils.js');
  // eslint-disable-next-line no-new-func
  new Function('window', utilsSrc)(global);

  formatDateHeaderRow = global.HEYS.dayUtils.formatDateHeaderRow;
});

describe('formatDateHeaderRow (v4 date line)', () => {
  it('today — «Сегодня, …» без relative', () => {
    const row = formatDateHeaderRow('2026-08-10');
    expect(row.isToday).toBe(true);
    expect(row.main).toMatch(/^Сегодня, 10 августа/);
    expect(row.relative).toBeNull();
  });

  it('today on weekend — «Сегодня, …», не красное сокращение', () => {
    vi.setSystemTime(new Date('2026-08-09T12:00:00+03:00'));
    const row = formatDateHeaderRow('2026-08-09');
    expect(row.isToday).toBe(true);
    expect(row.weekendAbbr).toBeUndefined();
    expect(row.main).toMatch(/^Сегодня, 9 августа/);
    vi.setSystemTime(new Date('2026-08-10T12:00:00+03:00'));
  });

  it('yesterday — «Вчера, …» без дублирующей подписи', () => {
    const row = formatDateHeaderRow('2026-08-09');
    expect(row.main).toMatch(/^Вчера, 9 августа/);
    expect(row.relative).toBeNull();
  });

  it('three days ago — короткий день недели, без «N дней назад»', () => {
    const row = formatDateHeaderRow('2026-08-07');
    expect(row.main).toMatch(/^пт, 7 августа/);
    expect(row.relative).toBeNull();
  });

  it('night window on effective today — «Ночь на …»', () => {
    vi.setSystemTime(new Date('2026-08-21T01:30:00+03:00'));
    const row = formatDateHeaderRow('2026-08-20');
    expect(row.isToday).toBe(true);
    expect(row.isNightLabel).toBe(true);
    expect(row.main).toBe('Ночь на 21 августа');
    expect(row.relative).toBeNull();
    vi.setSystemTime(new Date('2026-08-10T12:00:00+03:00'));
  });
});
