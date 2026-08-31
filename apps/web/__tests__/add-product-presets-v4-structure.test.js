import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const addProductSource = fs.readFileSync(
  path.resolve(__dirname, '../heys_add_product_step_v1.js'),
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

describe('add product presets v4 canvas structure', () => {
  it('uses v4 list layout with edit mode and canvas copy', () => {
    expect(addProductSource).toContain('listEditMode');
    expect(addProductSource).toContain('mpr-header-edit-btn');
    expect(addProductSource).toContain('mpr-my-sets-list');
    expect(addProductSource).toContain('mpr-suggested-card');
    expect(addProductSource).toContain('Сохранить как набор');
    expect(addProductSource).toContain('Собрать новый набор');
    expect(addProductSource).toContain('Правка и удаление — по тапу на строку');
    expect(addProductSource).toContain('`Добавить ${active.length} ${pluralProduct(active.length)} · ${totalKcal} ккал`');
    expect(addProductSource).toContain("'←'");
    expect(addProductSource).not.toContain('Создать новый набор');
  });

  it('paints presets list with v4 sand roles', () => {
    expect(cssSource).toContain('.mpr-my-sets-list');
    expect(cssSource).toContain('.mpr-suggested-card');
    expect(cssSource).toContain('.mpr-assemble-btn');
    expect(cssSource).toContain('.mpr-header-edit-btn');
    expect(cssSource).toContain('background: var(--v4-sand-tint-green, #eaefe0)');
  });
});
