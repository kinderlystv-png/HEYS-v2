import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
  'utf8',
);
const dayAddSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_add_product.js'),
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

describe('add product grams v4 canvas structure', () => {
  it('uses v4 grams hero, impact block and header product title', () => {
    expect(addProductSource).toContain('aps-v4-grams-hero');
    expect(addProductSource).toContain('aps-v4-grams-impact');
    expect(addProductSource).toContain('resolveHeaderCenter');
    expect(addProductSource).toContain('mc-header-btn--fav');
    expect(addProductSource).toContain('В прошлый раз было');
    expect(addProductSource).not.toContain('aps-input-mode-toggle');
    expect(addProductSource).not.toContain('aps-v4-meal-photo');
  });

  it('paints grams shell with v4 sand roles', () => {
    expect(cssSource).toContain('.aps-v4-grams-hero');
    // Полоса влияния разделена надвое 31 августа по кадру «Добавление ·
    // порция»: съеденное за день чернилами и вклад порции акцентом. Прежняя
    // одна заливка (__bar-fill) показывала итог и прятала сам вклад.
    expect(cssSource).toContain('.aps-v4-grams-impact__bar-eaten');
    expect(cssSource).toContain('.aps-v4-grams-impact__bar-add');
    expect(cssSource).not.toContain('.aps-v4-grams-impact__bar-fill');
    expect(cssSource).toContain('.aps-v4-grams-duplicate');
  });
});

describe('meal summary v4 canvas structure', () => {
  it('uses StepModal summary instead of legacy ConfirmModal fork', () => {
    expect(dayAddSource).toContain('MealSummaryV4Step');
    expect(dayAddSource).toContain('aps-v4-meal-summary');
    expect(dayAddSource).toContain('aps-v4-meal-summary__photo-grid');
    expect(dayAddSource).toContain('Итого за приём');
    expect(dayAddSource).toContain('Добавить ещё');
    expect(dayAddSource).toContain('Сохранить как набор');
    expect(dayAddSource).toContain('aps-v4-btn-paper');
    expect(dayAddSource).not.toContain('confirm-modal-btn--last-one');
    expect(dayAddSource).not.toContain('confirm-modal-btn--multi-continue');
  });

  it('paints summary shell with v4 classes', () => {
    expect(cssSource).toContain('.aps-v4-meal-summary__hero');
    expect(cssSource).toContain('.aps-v4-meal-summary__photo-grid');
    expect(cssSource).toContain('.aps-v4-meal-summary__done');
  });
});

describe('собранный приём · число дня', () => {
  it('строка под калорийностью называет две величины, а перебор — своим тоном', () => {
    // Строка «число дня в блоке „В приёме"»: «Всего за день N · до нормы
    // остаётся M»; в переборе вторая половина меняется на «перебор M» тоном
    // --val-bad, первая остаётся как есть. Раньше стояла одна величина.
    expect(dayAddSource).toContain('Всего за день ${dayKcal} · ');
    expect(dayAddSource).toContain('до нормы остаётся ${Math.max(0, remainingKcal)}');
    expect(dayAddSource).toContain('перебор ${Math.abs(Math.min(0, remainingKcal))}');
    expect(dayAddSource).toContain('aps-v4-meal-summary__hero-over');
    // Знак остатка больше не зажимается в ноль — иначе перебор показывал «0».
    expect(dayAddSource).not.toContain('remainingKcal: Math.max(0, remainingKcal)');
  });
});
