import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SOURCE = fs.readFileSync(path.resolve(__dirname, '../heys_meal_optimizer_v1.js'), 'utf8');

describe('MealOptimizer · область действия совета', () => {
  it('каждая рекомендация одного приёма явно помечена scope=meal', () => {
    const start = SOURCE.indexOf('const rec = {');
    const end = SOURCE.indexOf('recommendations.push(rec);', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(SOURCE.slice(start, end)).toContain("scope: 'meal'");
  });
});
