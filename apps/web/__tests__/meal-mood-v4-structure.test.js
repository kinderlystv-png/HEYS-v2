import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const mealStepSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_meal_step_v1.js'),
  'utf8',
);
const cssSource = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8',
);

describe('meal mood step v4 structure', () => {
  it('uses canvas title, three scales and influence chips', () => {
    expect(mealStepSource).toContain("title: 'Как вы сейчас'");
    expect(mealStepSource).toContain('INFLUENCE_CHIPS');
    expect(mealStepSource).toContain('Что повлияло');
    expect(mealStepSource).toContain('Сохранить приём без оценок');
    expect(mealStepSource).toContain("'Дальше'");
    expect(mealStepSource).toContain('function MoodScaleRow');
    expect(mealStepSource).not.toContain('meal-overall-status');
  });

  it('paints mood scales with v4 roles', () => {
    expect(cssSource).toContain('.meal-mood-scale');
    expect(cssSource).toContain('background: #f7efe2');
    expect(cssSource).toContain('.meal-mood-scale__value--ok');
    expect(cssSource).toContain('.meal-mood-chip.is-on');
  });
});
