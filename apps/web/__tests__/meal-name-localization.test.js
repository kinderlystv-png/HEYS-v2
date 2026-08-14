import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

let localizeMealName;

beforeAll(() => {
  global.window = global;
  global.HEYS = global.HEYS || {};
  const utilsSrc = read('apps/web/heys_day_utils.js');
  // eslint-disable-next-line no-new-func
  new Function('window', utilsSrc)(global);
  localizeMealName = global.HEYS.dayUtils.localizeMealName;
});

describe('day utils meal name localization', () => {
  it('maps english canonical meal keys to russian labels', () => {
    expect(localizeMealName('breakfast')).toBe('Завтрак');
    expect(localizeMealName('Breakfast')).toBe('Завтрак');
    expect(localizeMealName('lunch')).toBe('Обед');
    expect(localizeMealName('dinner')).toBe('Ужин');
    expect(localizeMealName('snack')).toBe('Перекус');
    expect(localizeMealName('Snack')).toBe('Перекус');
  });

  it('maps coffee-break aliases', () => {
    expect(localizeMealName('coffee-break')).toBe('Кофе-брейк');
    expect(localizeMealName('coffee break')).toBe('Кофе-брейк');
  });

  it('keeps custom names unchanged and respects fallback', () => {
    expect(localizeMealName('Мой поздний ужин')).toBe('Мой поздний ужин');
    expect(localizeMealName('')).toBe('Приём');
    expect(localizeMealName('', 'Еда')).toBe('Еда');
  });
});
