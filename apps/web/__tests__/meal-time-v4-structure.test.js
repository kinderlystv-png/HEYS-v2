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
const mealCreateCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/heys-components.css'),
  'utf8',
);

describe('meal time step v4 structure', () => {
  it('uses canvas title and six type chips', () => {
    expect(mealStepSource).toContain("title: 'Новый приём'");
    expect(mealStepSource).toContain('MEAL_TYPE_CHIPS');
    expect(mealStepSource).toContain('Тип предложен по времени — менять не обязательно.');
    expect(mealStepSource).toContain('Всё равно продолжить');
    expect(mealStepSource).toContain('function typeForChip');
    expect(mealStepSource).not.toContain('Выберите время и тип');
    expect(mealStepSource).not.toContain('Расчётный постпрандиальный период');
  });

  it('does not fall back to clipboard icon when meal step clears it', () => {
    const stepModal = fs.readFileSync(
      path.resolve(__dirname, '../heys_step_modal_v1.js'),
      'utf8',
    );
    expect(stepModal).toContain("hasOwnProperty.call(config, 'icon')");
    expect(stepModal).toContain('[currentConfig.icon, currentConfig.title].filter(Boolean)');
  });

  it('keeps snack slot by time instead of a single snack1 key', () => {
    expect(mealStepSource).toMatch(/if \(hour < 12\) return 'snack1'/);
    expect(mealStepSource).toMatch(/if \(hour < 18\) return 'snack2'/);
    expect(mealStepSource).toContain("return 'snack3'");
  });

  it('paints time hero and chips with v4 roles', () => {
    expect(cssSource).toContain('.meal-time-hero');
    expect(cssSource).toContain('.meal-type-chips');
    expect(cssSource).toContain('var(--v4-sand-hero');
    expect(cssSource).toContain('var(--v4-sand-surface');
    expect(cssSource).toContain('grid-template-columns: 1fr 1fr');
    expect(cssSource).toMatch(/\.meal-type-chip \{[\s\S]*?var\(--v4-sand-surface/);
    expect(cssSource).toMatch(/\.meal-time-step \.meal-type-label \{[\s\S]*?background: none;/);
    expect(cssSource).toContain('.meal-time-hero .mc-wheel-value--current');
    expect(cssSource).toContain('font-size: 54px');
  });

  it('centers meal-create header like the canvas top bar', () => {
    expect(mealCreateCss).toContain('grid-template-columns: 44px 1fr 44px');
    expect(mealCreateCss).toContain('padding: 16px 18px 0');
    expect(mealCreateCss).toContain('width: 16px');
    expect(mealCreateCss).toContain('background: #c67139');
    expect(mealCreateCss).toContain('.mc-header-btn--close::before');
  });

  it('keeps wheels as the large time, always visible', () => {
    expect(mealStepSource).not.toContain('timeOpen');
    expect(mealStepSource).not.toContain('meal-time-hero__value');
    expect(mealStepSource).toContain('compact: true');
    expect(mealStepSource).toContain("display: null");
    expect(mealStepSource).toContain("className: 'meal-time-hero'");
  });

  it('styles night intake hint as sand grp block below time hero', () => {
    expect(mealStepSource).toContain("className: 'meal-night-hint'");
    expect(mealStepSource).toContain('Ночной приём — запишется в ');
    expect(mealStepSource).toMatch(
      /React\.createElement\(NightHint[\s\S]*?\)[\s\S]*?React\.createElement\(MealTypeGrid/,
    );
    expect(cssSource).toContain('.meal-night-hint');
    expect(cssSource).toContain('border-radius: 20px');
    expect(cssSource).toContain('.meal-night-icon');
    expect(cssSource).toMatch(/\.meal-night-hint \{[\s\S]*?var\(--v4-sand-accent-bg/);
    expect(cssSource).toMatch(/\.meal-time-step--v4 \.meal-night-hint[\s\S]*?margin-top: 16px/);
  });
});
