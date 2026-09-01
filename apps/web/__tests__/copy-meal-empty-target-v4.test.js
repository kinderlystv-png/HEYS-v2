import fs from 'node:fs';
import path from 'node:path';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const SOURCE = fs.readFileSync(path.join(WEB_DIR, 'heys_day_copy_meal_modal_v1.js'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/610-aps-meal-flow.css'), 'utf8');

function loadScript(relativePath) {
  const code = fs.readFileSync(path.join(WEB_DIR, relativePath), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', code)(window, document);
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.ReactDOM = { createRoot };
  window.HEYS = {
    models: {
      normalizeItemGrams: (grams, fallback) => Number(grams) || fallback,
    },
  };
  loadScript('heys_day_copy_meal_modal_v1.js');

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

afterAll(async () => {
  await act(async () => {
    window.HEYS.CopyMealModal.hide();
  });
  document.getElementById('copy-meal-modal-root')?.remove();
  document.getElementById('copy-meal-modal-anim')?.remove();
});

describe('food-meal · копирование без целей', () => {
  it('рендерит точный empty state, единственную выбранную цель и без строки итога', async () => {
    const onCopyToExisting = vi.fn();
    const onCopyToNew = vi.fn();

    await act(async () => {
      window.HEYS.CopyMealModal.show({
        sourceMeal: {
          id: 'source',
          name: 'Перекус',
          items: [{ id: 'coffee', name: 'Домашний кофе', grams: 100, kcal100: 17 }],
        },
        sourceMealIndex: 0,
        sourceDate: '2026-09-01',
        targetDate: '2026-09-01',
        targetMeals: [],
        onCopyToExisting,
        onCopyToNew,
      });
    });

    const emptyState = document.querySelector('.meal-transfer-v4__empty');
    const sheet = document.querySelector('.copy-meal-modal.meal-transfer-v4__sheet');
    expect(sheet?.classList.contains('meal-transfer-v4__sheet--empty-targets')).toBe(true);
    expect(emptyState?.textContent).toBe('На сегодня приёмов ещё нет — создадим новый.');
    expect(emptyState?.hasAttribute('style')).toBe(false);
    expect(CSS).toMatch(/\.meal-transfer-v4__empty\s*{[^}]*color:\s*var\(--v4-ink-data\)/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__empty\s*{[^}]*font-size:\s*11px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__empty\s*{[^}]*line-height:\s*1\.5/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__items\s*{[^}]*flex:\s*1 1 auto[^}]*padding:\s*0 18px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__product-list\s*{[^}]*flex:\s*1 1 auto[^}]*min-height:\s*120px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__product-list\s*{[^}]*margin-top:\s*8px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__range\s*{[^}]*height:\s*14px\s*!important[^}]*min-height:\s*0\s*!important[^}]*padding:\s*0\s*!important[^}]*border:\s*0/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__footer\s*{[^}]*margin-top:\s*auto/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__sheet--empty-targets \.meal-transfer-v4__items\s*{[^}]*flex:\s*0 0 auto[^}]*padding-top:\s*6px/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__sheet--empty-targets \.meal-transfer-v4__product-list\s*{[^}]*flex:\s*0 0 auto[^}]*min-height:\s*0/s);
    expect(CSS).toMatch(/\.meal-transfer-v4__sheet--empty-targets \.meal-transfer-v4__footer\s*{[^}]*margin-top:\s*0/s);

    const targets = [...document.querySelectorAll('input[name="copy-meal-target"]')];
    expect(targets).toHaveLength(1);
    expect(targets[0].checked).toBe(true);
    expect(targets[0].closest('label')?.textContent).toBe('+ Создать новый приём');
    expect(targets[0].closest('label')?.dataset.copyMealTarget).toBe('new-meal');
    expect(targets[0].closest('label')?.classList.contains('meal-transfer-v4__target')).toBe(true);
    expect(targets[0].closest('label')?.classList.contains('is-selected')).toBe(true);
    expect(targets[0].closest('label')?.hasAttribute('style')).toBe(false);
    const copyView = SOURCE.slice(SOURCE.indexOf('function CopyMealView'), SOURCE.indexOf('// === DOM root'));
    expect(copyView).not.toContain("var(--acc, #3b82f6)");

    expect(document.querySelector('.copy-meal-modal')?.textContent).not.toMatch(/→.*ккал/);
    expect(onCopyToExisting).not.toHaveBeenCalled();
  });
});
