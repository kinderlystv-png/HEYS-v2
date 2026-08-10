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
let formatDaysAgoRu;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-10T12:00:00+03:00'));

  const utilsSrc = read('apps/web/heys_day_utils.js');
  // eslint-disable-next-line no-new-func
  new Function('window', utilsSrc)(global);

  formatDateHeaderRow = global.HEYS.dayUtils.formatDateHeaderRow;
  formatDaysAgoRu = global.HEYS.dayUtils.formatDaysAgoRu;
});

describe('formatDateHeaderRow (v4 date line)', () => {
  it('today — «Сегодня, …» без relative', () => {
    const row = formatDateHeaderRow('2026-08-10');
    expect(row.isToday).toBe(true);
    expect(row.main).toMatch(/^Сегодня, 10 августа/);
    expect(row.relative).toBeNull();
  });

  it('yesterday — «Вчера, …» и relative вчера', () => {
    const row = formatDateHeaderRow('2026-08-09');
    expect(row.main).toMatch(/^Вчера, 9 августа/);
    expect(row.relative).toBe('вчера');
  });

  it('three days ago — weekday + «три дня назад»', () => {
    const row = formatDateHeaderRow('2026-08-07');
    expect(row.main).toMatch(/^Пятница, 7 августа/);
    expect(formatDaysAgoRu('2026-08-07')).toBe('3 дня назад');
    expect(row.relative).toBe('3 дня назад');
  });
});
