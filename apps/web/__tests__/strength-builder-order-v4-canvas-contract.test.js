import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_catalog_ui_v1.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const RAW_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');

const PALETTE = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
  gr: '#5c6a45', grBg: '#eaefe0',
  ink32: 'rgba(0, 0, 0, 0.32)', ink56: 'rgba(0, 0, 0, 0.56)', ink62: 'rgba(0, 0, 0, 0.62)'
});

function compileCss() {
  return `:root{--v4-ink-rgb:0,0,0;--v4-ink-prose:${PALETTE.ink62};}\n${RAW_CSS
    .replaceAll('var(--sb-card)', PALETTE.c1)
    .replaceAll('var(--sb-bg)', PALETTE.bg)
    .replaceAll('var(--sb-tx)', PALETTE.tx)
    .replaceAll('var(--sb-mut)', PALETTE.ink56)
    .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
    .replaceAll('var(--sb-soft)', PALETTE.c2)
    .replaceAll('var(--sb-acc-strong)', PALETTE.acs)
    .replaceAll('var(--sb-accbg)', PALETTE.grBg)
    .replaceAll('var(--sb-accTx)', PALETTE.ac)
    .replaceAll('var(--sb-acc)', PALETTE.ac)
    .replaceAll('var(--sb-okbg)', PALETTE.grBg)
    .replaceAll('var(--sb-okTx)', PALETTE.gr)
    .replaceAll('var(--v4-btn-on-act, #fff5ef)', PALETTE.onAcs)
    .replaceAll('var(--v4-bg, #fffaf3)', PALETTE.bg)
    .replaceAll('var(--v4-c1, #f7efe2)', PALETTE.c1)
    .replaceAll('var(--v4-hero, #efe3cf)', PALETTE.c2)
    .replaceAll('var(--v4-tint, #f6e6dd)', PALETTE.grBg)
    .replaceAll('var(--v4-ink, #201e1d)', PALETTE.tx)
    .replaceAll('var(--v4-act-text, #8a4a20)', PALETTE.ac)
    .replaceAll('var(--v4-act, #c67139)', PALETTE.acs)
    .replaceAll('var(--v4-ok-bg, #eaefe0)', PALETTE.grBg)
    .replaceAll('var(--v4-ok, #5c6a45)', PALETTE.gr)
    .replaceAll('var(--v4-ink-data, rgba(32, 30, 29, 0.56))', PALETTE.ink56)
    .replaceAll('env(safe-area-inset-bottom, 0px)', '0px')}`;
}

function exactRule(selector) {
  const re = new RegExp(`(^|[\\n\\r])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\}`, 'g');
  let match;
  let last = '';
  while ((match = re.exec(RAW_CSS)) !== null) last = match[0].replace(/^[\n\r]+/, '');
  return last;
}

function lastRule(selector) {
  const re = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*\\})`, 'g');
  let match;
  let last = '';
  while ((match = re.exec(RAW_CSS)) !== null) last = match[1];
  return last;
}

function loadCatalog() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  return globalThis.HEYS.StrengthCatalogUI;
}

function canvasExercises() {
  const work = (weightKg, reps, n) => Array.from({ length: n || 4 }, () => ({
    weightKg: String(weightKg), reps, done: false
  }));
  return [
    { name: 'Жим лёжа', restSec: 90, approaches: work(75, 8) },
    { name: 'Тяга штанги в наклоне', restSec: 90, approaches: work(60, 8) },
    { name: 'Жим гантелей сидя', restSec: 90, approaches: work(24, 12) },
    {
      name: 'Подтягивания', ssGroup: 1, restSec: 90,
      approaches: work(0, 10, 3)
    },
    {
      name: 'Тяга блока', ssGroup: 1, restSec: 90,
      approaches: work(40, 12, 3)
    }
  ];
}

describe('Ж1 · порядок · canvas contract', () => {
  let styleEl;

  beforeEach(() => {
    styleEl = document.createElement('style');
    styleEl.textContent = compileCss();
    document.head.appendChild(styleEl);
  });

  afterEach(() => {
    cleanup();
    styleEl.remove();
  });

  it('keeps canvas copy, handle, toast and footnote strings', () => {
    expect(SOURCE).toContain("'Тот же список · режим порядка'");
    expect(SOURCE).toContain("'стрелки для пальца, ⠿ — мышью'");
    expect(SOURCE).toContain("'Готово'");
    expect(SOURCE).toContain("'⠿'");
    expect(SOURCE).toContain("'переносится сюда'");
    expect(SOURCE).toContain("'Отменить'");
    expect(SOURCE).toContain('Случайная галочка снимается тостом');
    expect(BUILDER).toContain("'Подход засчитан · '");
    expect(BUILDER).toContain("'тост живёт несколько секунд'");
    expect(BUILDER).toContain('setApproachUndo');
    expect(BUILDER).toContain('undoToast: approachUndo');
  });

  it('maps geometry for header, rows, insert bar, toast and controls', () => {
    expect(lastRule('.sb-order-screen .sb-icon-btn--close')).toMatch(/width: 36px/);
    expect(lastRule('.sb-order-screen .sb-icon-btn--close')).toMatch(/border-radius: 999px/);
    expect(exactRule('.sb-order-screen .sb-head-title')).toMatch(/gap: 3px/);
    expect(lastRule('.sb-order-done.obtn')).toMatch(/height: 36px/);
    expect(lastRule('.sb-order-done.obtn')).toMatch(/padding: 0 15px/);
    expect(lastRule('.sb-order-list > .sb-order-ex:first-child')).toMatch(/margin-top: 12px/);
    expect(exactRule('.sb-order-handle')).toMatch(/font: 600 14px\/1 Figtree/);
    expect(exactRule('.sb-order-row .sb-cat-title b')).toMatch(/12\.5px\/1\.2/);
    expect(exactRule('.sb-order-row .sb-cat-title span')).toMatch(/11px\/1\.3/);
    expect(lastRule('.sb-order-arrows')).toMatch(/gap: 3px/);
    expect(lastRule('.sb-order-insert')).toMatch(/height: 2px/);
    expect(lastRule('.sb-order-row.is-drop-target')).toMatch(/inset 0 0 0 2px/);
    expect(lastRule('.sb-order-row.is-group')).toMatch(/border-left: 3px solid/);
    expect(exactRule('.sb-order-toast')).toMatch(/border-radius: 16px/);
    expect(lastRule('.sb-order-toast-undo.obtn')).toMatch(/height: 44px/);
    expect(exactRule('.sqb')).toMatch(/width: 44px/);
    expect(exactRule('.sqb')).toMatch(/border-radius: 12px/);
    expect(exactRule('.obtn')).toMatch(/border-radius: 999px/);
  });

  it('renders order rows with summary, arrows and undo toast', () => {
    const Cat = loadCatalog();
    const applied = vi.fn();
    const cancelled = vi.fn();
    render(React.createElement(Cat.OrderScreen, {
      exercises: canvasExercises(),
      undoToast: {
        label: 'Подход засчитан · 75 кг × 8',
        hint: 'тост живёт несколько секунд',
        onUndo: vi.fn()
      },
      onApply: applied,
      onCancel: cancelled
    }));

    expect(screen.getByText('Тот же список · режим порядка')).toBeTruthy();
    expect(screen.getByText('стрелки для пальца, ⠿ — мышью')).toBeTruthy();
    expect(screen.getByText('Жим лёжа')).toBeTruthy();
    expect(screen.getByText(/4 × 8 · 75 кг/)).toBeTruthy();
    expect(screen.getByText('Связка A')).toBeTruthy();
    expect(screen.getByText(/Подтягивания ⇄ Тяга блока/)).toBeTruthy();
    expect(screen.getByText('Подход засчитан · 75 кг × 8')).toBeTruthy();
    expect(document.querySelector('.sb-order-screen .sqb')).toBeTruthy();
    expect(document.querySelector('.sb-order-handle')).toBeTruthy();

    fireEvent.click(screen.getAllByLabelText('Ниже')[0]);
    fireEvent.click(screen.getByText('Готово'));
    expect(applied).toHaveBeenCalledTimes(1);
    const next = applied.mock.calls[0][0];
    expect(next[0].name).toBe('Тяга штанги в наклоне');
  });
});
