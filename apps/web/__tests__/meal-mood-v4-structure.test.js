import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const mealStepSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_meal_step_v1.js'),
  'utf8',
);
// Файл разрезан по зонам 31 августа: оболочка осталась в 600, экраны уехали
// в 610–613. Тест смотрит на поток добавления целиком, поэтому читает всю
// группу — иначе он проверял бы половину правил и молчал о второй.
const cssSource = [
  '600-steps-and-aps.css',
  '610-aps-meal-flow.css',
  '611-aps-product-card.css',
  '612-training-step.css',
  '613-cycle-ui.css',
]
  .map((file) => fs.readFileSync(path.resolve(__dirname, '../styles/modules/' + file), 'utf8'))
  .join('\n');

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
    expect(cssSource).toContain('var(--v4-sand-surface');
    expect(cssSource).toContain('.meal-mood-scale__value--ok');
    expect(cssSource).toContain('.meal-mood-chip.is-on');
  });
});
