// strength-builder-calm-canvas-contract.test.js — спокойный активный список А1б.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';

// Кадр называет время старта литералом «начата в 18:40», а экран печатает его
// в поясе машины: на московской это 18:40, на раннере CI в UTC — 15:40, и тест
// падал не на расхождении с кадром, а на часовом поясе. Пояс закреплён так же,
// как в norm-correction-direction-date.
const originalTz = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Moscow';
});

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.resolve(__dirname, '../styles/modules/750-strength-builder.css'), 'utf8');
const BUILDER = fs.readFileSync(path.resolve(__dirname, '../strength/heys_strength_builder_ui_v1.js'), 'utf8');
const SUPERSET = fs.readFileSync(path.resolve(__dirname, '../strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608',
  gr: '#5c6a45', grBg: '#eaefe0',
  ink14: 'rgba(0, 0, 0, .14)', ink28: 'rgba(0, 0, 0, .28)',
  ink30: 'rgba(0, 0, 0, .3)', ink50: 'rgba(0, 0, 0, .5)',
  ink55: 'rgba(0, 0, 0, .55)', ink56: 'rgba(0, 0, 0, .56)',
  ink58: 'rgba(0, 0, 0, .58)', ink62: 'rgba(0, 0, 0, .62)'
});

const COMPUTED_CSS = CSS
  // jsdom does not reliably resolve nested product custom properties. Compile
  // only the canonical sand palette for this computed-style regression; the
  // production stylesheet remains untouched. Base CSS is still loaded first,
  // so global label/input/button leaks remain observable.
  .replaceAll('var(--sb-card)', CANVAS.c1)
  .replaceAll('var(--sb-bg)', CANVAS.bg)
  .replaceAll('var(--sb-tx)', CANVAS.tx)
  .replaceAll('var(--sb-mut)', CANVAS.ink56)
  .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
  .replaceAll('var(--sb-soft)', CANVAS.c2)
  .replaceAll('var(--sb-acc-strong)', CANVAS.acs)
  .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, .12)')
  .replaceAll('var(--sb-accTx)', CANVAS.ac)
  .replaceAll('var(--sb-acc)', CANVAS.ac)
  .replaceAll('var(--sb-okbg)', CANVAS.grBg)
  .replaceAll('var(--sb-okTx)', CANVAS.gr)
  .replaceAll('var(--v4-btn-on-act, #fff5ef)', CANVAS.onAcs)
  .replaceAll('var(--v4-bg, #fffaf3)', CANVAS.bg)
  .replaceAll('var(--v4-c1, #f7efe2)', CANVAS.c1)
  .replaceAll('var(--v4-hero, #efe3cf)', CANVAS.c2)
  .replaceAll('var(--v4-ink, #201e1d)', CANVAS.tx)
  .replaceAll('var(--v4-act-text, #8a4a20)', CANVAS.ac)
  .replaceAll('var(--v4-act, #c67139)', CANVAS.acs)
  .replaceAll('var(--v4-ok-bg, #eaefe0)', CANVAS.grBg)
  .replaceAll('var(--v4-ok-text, #5c6a45)', CANVAS.gr)
  .replaceAll('var(--bg)', CANVAS.bg)
  .replaceAll('var(--c1)', CANVAS.c1)
  .replaceAll('var(--c2)', CANVAS.c2)
  .replaceAll('var(--tx)', CANVAS.tx)
  .replaceAll('var(--ac)', CANVAS.ac)
  .replaceAll('var(--acs)', CANVAS.acs)
  .replaceAll('var(--gr)', CANVAS.gr)
  .replaceAll('var(--gr-bg)', CANVAS.grBg)
  .replaceAll('var(--ink, 0, 0, 0)', '0, 0, 0')
  .replaceAll('var(--ink)', '0, 0, 0')
  .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');

function loadBuilder() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  ev('strength/heys_strength_catalog_ui_v1.js');
  ev('strength/heys_strength_finish_ui_v1.js');
  ev('strength/heys_strength_builder_ui_v1.js');
  return globalThis.HEYS.StrengthBuilder;
}

const work = (weightKg, reps, done) => ({ weightKg: String(weightKg), reps, done: !!done });

function canvasProps() {
  const approach = (weightKg, reps, done) => work(weightKg, reps, done);
  const exercise = (name, approaches, restSec) => ({ name, approaches, restSec });
  const exercises = [
    exercise('Жим лёжа', [
      { weightKg: '20', reps: 12, done: false, type: 'warmup' },
      { weightKg: '30', reps: 10, done: false, type: 'warmup' },
      { weightKg: '40', reps: 8, done: false, type: 'warmup' },
      approach(75, 8, true), approach(75, 10, true), approach(75, 10, true), approach(75, 12, true)
    ], 120),
    exercise('Тяга штанги в наклоне', [
      { weightKg: '20', reps: 12, done: false, type: 'warmup' },
      { weightKg: '30', reps: 10, done: false, type: 'warmup' },
      { weightKg: '40', reps: 8, done: false, type: 'warmup' },
      approach(60, 8, true), approach(60, 10, true), approach(60, 10, true), approach(60, 12, true)
    ], 120),
    { ...exercise('Жим гантелей сидя', [
      approach(22.5, 12, true), approach(24, 10, true), approach(24, 10, false), approach(24, 10, false)
    ], 120), rpe: 7 },
    exercise('Разведение в тренажёре', [
      { weightKg: '10', reps: 15, done: false, type: 'warmup' },
      { weightKg: '15', reps: 12, done: false, type: 'warmup' },
      approach(20, 12, false), approach(20, 12, false), approach(20, 12, false)
    ], 60),
    exercise('Подтягивания', [
      approach(0, 9, false), approach(0, 9, false), approach(0, 8, false)
    ], 120),
    exercise('Тяга блока', [
      approach(55, 10, false), approach(55, 10, false), approach(55, 10, false)
    ], 90),
    exercise('Французский жим', [
      approach(30, 12, false), approach(30, 10, false)
    ], 60)
  ];
  return {
    training: {
      type: 'strength', strengthEntryMode: 'workout_builder',
      workoutLog: {
        title: 'Силовая · грудь, спина, плечи',
        startedAt: new Date('2022-08-08T18:40:00+03:00').getTime(), exercises
      }
    },
    dateKey: '2022-08-08', profile: { weight: 80 },
    historyFor: (name) => name === 'Жим гантелей сидя'
      ? { record: { maxW: 25, maxSet: 250, total: 900 } }
      : name === 'Жим лёжа' ? { record: { maxW: 75, maxSet: 900, total: 3000 } } : null,
    historyDetailFor: (name) => name === 'Жим гантелей сидя'
      ? { usages: [{ approaches: [approach(22.5, 12, true)] }], record: { maxW: 25 } }
      : { usages: [], record: null },
    onPatch: vi.fn(), onPatchSession: vi.fn(), onClose: vi.fn()
  };
}

function lastRule(selector) {
  const pattern = new RegExp('(?:^|\\n)' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]+)\\}', 'g');
  return Array.from(CSS.matchAll(pattern)).at(-1)?.[1] || '';
}

function renderedRowMismatches(rows) {
  const mismatches = [];
  const normalizeCss = (value) => String(value == null ? '' : value).replace(/0\.(\d+)/g, '.$1');
  rows.forEach(([id, selector, text, expectedStyle, expectedFields]) => {
    const node = document.querySelector(selector);
    if (!node) {
      mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
      return;
    }
    if (text != null && node.textContent !== text) {
      mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent });
    }
    Object.entries(expectedFields || {}).forEach(([field, expected]) => {
      if (node[field] !== expected) mismatches.push({ id, selector, field, expected, actual: node[field] });
    });
    const actualStyle = getComputedStyle(node);
    Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
      if (normalizeCss(actualStyle[property]) !== normalizeCss(expected)) {
        mismatches.push({ id, selector, field: `computed.${property}`, expected, actual: actualStyle[property] });
      }
    });
  });
  return mismatches;
}

// Разбор канваса читает весь пакет контракта, и в одиночку набор идёт
// около 4-5 секунд — впритык к лимиту vitest по умолчанию (5 с). В общем
// прогоне он его перешагивал и падал по времени, а не по расхождению.
describe('А1б · rendered Canvas contract', { timeout: 45_000 }, () => {
  it('доказывает все непротиворечивые numbered rows и обе составные строки текста', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2022-08-08T19:27:12+03:00').getTime());
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      const SB = loadBuilder();
      render(React.createElement(SB.BuilderScreen, canvasProps()));
      fireEvent.click(document.querySelectorAll('.sb-ex-head')[2]);

      const rows = [
        ['01', '.sb-builder-screen > .sb-head', null, {
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px'
        }],
        ['02', '.sb-builder-screen > .sb-head > .sb-icon-btn:first-child', '✕', {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexGrow: '0', flexShrink: '0',
          width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS.c1,
          color: CANVAS.ink56, fontSize: '14px', fontWeight: '600', lineHeight: '1'
        }],
        ['03', '.sb-builder-screen > .sb-head > .sb-head-title', null, {
          display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '3px',
          paddingTop: '0px', paddingRight: '10px', paddingBottom: '0px', paddingLeft: '10px'
        }],
        ['04', '.sb-builder-screen > .sb-head .sb-head-title > b', 'Силовая · грудь, спина, плечи', {
          color: CANVAS.tx, fontSize: '15px', fontWeight: '700', lineHeight: '1'
        }],
        ['05', '.sb-builder-screen > .sb-head .sb-head-sub', 'пн, 8 авг · начата в 18:40', {
          color: CANVAS.ink56, fontSize: '10.5px', fontWeight: '600', lineHeight: '1',
          // happy-dom resolves em against the inherited 13px before applying
          // the font shorthand; fontSize below remains the canonical 10.5px.
          letterSpacing: '0.52px', fontVariantNumeric: 'tabular-nums'
        }],
        ['06', '.sb-builder-screen > .sb-head > .sb-icon-btn:last-child', '⋯', {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexGrow: '0', flexShrink: '0',
          width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS.c1,
          color: CANVAS.ink56, fontSize: '13px', fontWeight: '700', lineHeight: '1'
        }],
        ['07', '.sb-builder-screen > .sb-list', null, {
          display: 'flex', flexDirection: 'column', overflowY: 'auto'
        }],
        ['08', '.sb-builder-screen > .sb-stats', null, {
          display: 'flex', gap: '6px', paddingTop: '18px', paddingRight: '18px',
          paddingBottom: '0px', paddingLeft: '18px'
        }],
        ['09', '.sb-builder-screen > .sb-stats > .sb-stat:first-child', '⏱ 47:12', {
          display: 'inline-flex', alignItems: 'center', padding: '4px 7px', borderRadius: '999px',
          backgroundColor: CANVAS.c2, color: CANVAS.ink55, fontSize: '9px', fontWeight: '700',
          lineHeight: '1', fontVariantNumeric: 'tabular-nums'
        }],
        ['10', '.sb-builder-screen > .sb-stats > .sb-stat:nth-child(2)', '10 / 23 ✓', {
          display: 'inline-flex', alignItems: 'center', padding: '4px 7px', borderRadius: '999px',
          backgroundColor: CANVAS.grBg, color: CANVAS.gr, fontSize: '9px', fontWeight: '700',
          lineHeight: '1', fontVariantNumeric: 'tabular-nums'
        }],
        // 11 is deliberately unsupported: the Canvas requires a drag handle,
        // while А2 omits it and product has no reorder owner/persistence flow.
        ['12', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-num', '1', { color: CANVAS.ink62 }],
        ['13', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-title', null, {
          display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '2px'
        }],
        ['14', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-title > b', 'Жим лёжа', {
          color: CANVAS.tx, fontSize: '13px', fontWeight: '700', lineHeight: '1.2'
        }],
        ['15', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-sub', '4 × 8–12 · 75 кг · рекорд', {
          color: CANVAS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.3'
        }],
        ['16', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-signals', null, {
          display: 'flex', alignItems: 'center', gap: '6px'
        }],
        ['17', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-state', '✓', {
          color: CANVAS.gr, fontSize: '14px', fontWeight: '700', lineHeight: '1'
        }],
        ['18', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-chevron', '›', {
          color: CANVAS.ink30, fontSize: '12px', fontWeight: '700', lineHeight: '1'
        }],
        ['19', '.sb-list > .sb-ex.is-open', null, {
          backgroundColor: CANVAS.c1,
          boxShadow: `inset 0 0 0 1.5px ${CANVAS.ink14}`
        }],
        ['20', '.sb-list > .sb-ex.is-open .sb-ex-num', '3', {
          width: '26px', height: '26px', backgroundColor: CANVAS.bg,
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, .1)', color: CANVAS.ink62
        }],
        ['21', '.sb-list > .sb-ex.is-open .sb-ex-title > b', 'Жим гантелей сидя', {
          color: CANVAS.tx, fontSize: '14px', fontWeight: '700', lineHeight: '1.2'
        }],
        ['22', '.sb-list > .sb-ex.is-open .sb-ex-signals', null, {
          display: 'flex', alignItems: 'center', gap: '8px'
        }],
        ['23', '.sb-list > .sb-ex.is-open .sb-ex-count.is-current', '2/4', {
          color: CANVAS.ac, fontSize: '12.5px', fontWeight: '700', lineHeight: '1',
          fontVariantNumeric: 'tabular-nums'
        }],
        ['24', '.sb-list > .sb-ex.is-open .sb-ex-toggle', '✕', {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS.bg,
          color: CANVAS.ink50, fontSize: '13px', fontWeight: '600', lineHeight: '1'
        }],
        ['25', '.sb-list > .sb-ex.is-open .sb-hist', null, {
          display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '9px'
        }],
        ['26', '.sb-list > .sb-ex.is-open .sb-hist > span:first-child', 'Прошлый раз · 22,5 × 12', {
          backgroundColor: CANVAS.bg, color: CANVAS.ink55
        }],
        ['27', '.sb-list > .sb-ex.is-open .sb-hist > span.is-record', 'Рекорд · 25 × 10', {
          backgroundColor: CANVAS.bg, color: CANVAS.ac
        }],
        ['28', '.sb-list > .sb-ex.is-open .sb-aps-head', null, {
          display: 'grid', gridTemplateColumns: '34px 1fr 1fr 52px', alignItems: 'center', gap: '8px',
          marginTop: '10px', paddingTop: '0px', paddingRight: '8px', paddingBottom: '0px', paddingLeft: '8px'
        }],
        ['29', '.sb-list > .sb-ex.is-open .sb-aps-head > span:nth-child(2)', 'Вес, кг', {
          textAlign: 'center', color: CANVAS.ink56, fontSize: '9.5px', fontWeight: '600',
          lineHeight: '1', letterSpacing: '1.045px', textTransform: 'uppercase'
        }],
        ['30', '.sb-list > .sb-ex.is-open .sb-aps-head > span:last-child', '✓', {
          color: CANVAS.ink56, fontSize: '11px', fontWeight: '700', lineHeight: '1'
        }],
        ['31', '.sb-list > .sb-ex.is-open .sb-aps', null, {
          display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px'
        }],
        ['32', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap:first-child', null, {
          display: 'grid', gridTemplateColumns: '34px 1fr 1fr 52px', alignItems: 'center', gap: '8px',
          paddingTop: '7px', paddingRight: '8px', paddingBottom: '7px', paddingLeft: '8px'
        }],
        ['33', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap:first-child .sb-ap-num', '1', {
          width: '26px', height: '26px', color: CANVAS.ink62
        }],
        ['34', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap:first-child .sb-ap-value:nth-child(2)', '22,5', {
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px',
          borderRadius: '999px', backgroundColor: CANVAS.bg,
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, .1)', color: CANVAS.tx,
          fontSize: '15px', fontWeight: '700', lineHeight: '1'
        }],
        ['35', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap.is-current .sb-ap-num', '3', {
          width: '26px', height: '26px', backgroundColor: CANVAS.bg,
          boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, .1)', color: CANVAS.ink62
        }],
        ['36', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap.is-current .sb-ap-field:nth-child(2)', null, {
          height: '44px', borderRadius: '999px', backgroundColor: CANVAS.bg,
          boxShadow: `inset 0 0 0 2px ${CANVAS.acs}`, color: CANVAS.tx,
          fontSize: '16px', fontWeight: '700', lineHeight: '1'
        }, { value: '24' }],
        ['37', '.sb-list > .sb-ex.is-open .sb-aps > .sb-ap.is-current .sb-ap-check', '', {
          width: '44px', height: '44px', borderRadius: '999px',
          boxShadow: `inset 0 0 0 2px ${CANVAS.acs}`
        }],
        ['38', '.sb-list > .sb-ex.is-open .sb-rpe', null, {
          display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px'
        }],
        ['39', '.sb-list > .sb-ex.is-open .sb-rpe-label', 'Тяжесть', {
          flexGrow: '0', flexShrink: '0', color: CANVAS.ink56,
          fontSize: '9.5px', fontWeight: '700', lineHeight: '1', letterSpacing: '1.045px', textTransform: 'uppercase'
        }],
        ['40', '.sb-list > .sb-ex.is-open .sb-rest-line', null, {
          display: 'flex', alignItems: 'center', gap: '8px', marginTop: '9px'
        }],
        ['41', '.sb-list > .sb-ex.is-open .sb-rest-copy', '⏱ Отдых 2:00 — по тяжести 7', {
          display: 'flex', flexGrow: '1', minWidth: '0', alignItems: 'center', gap: '6px', height: '44px',
          paddingTop: '0px', paddingRight: '12px', paddingBottom: '0px', paddingLeft: '12px',
          borderRadius: '12px', backgroundColor: CANVAS.bg, color: CANVAS.ink56,
          fontSize: '11.5px', fontWeight: '500', lineHeight: '1.3'
        }],
        ['42', '.sb-list > .sb-ex.is-open .sb-rest-manual', 'Вручную', {
          display: 'flex', flexGrow: '0', flexShrink: '0', alignItems: 'center', justifyContent: 'center',
          height: '44px', paddingTop: '0px', paddingRight: '14px', paddingBottom: '0px', paddingLeft: '14px',
          borderRadius: '12px', backgroundColor: CANVAS.bg, color: CANVAS.tx,
          fontSize: '11.5px', fontWeight: '700', lineHeight: '1'
        }],
        ['43', '.sb-list > .sb-ex.is-pending .sb-ex-num', '4', { color: CANVAS.ink56 }],
        ['44', '.sb-list > .sb-ex.is-pending .sb-ex-title > b', 'Разведение в тренажёре', {
          color: CANVAS.ink55, fontSize: '13px', fontWeight: '700', lineHeight: '1.2'
        }],
        ['45', '.sb-builder-screen > .sb-panel', null, {
          display: 'flex', alignItems: 'center', gap: '8px',
          borderTop: '1px solid rgba(0, 0, 0, .07)'
        }],
        ['46', '.sb-builder-screen > .sb-panel > .sb-panel-add', 'Добавить упражнение', {
          flexGrow: '0', flexShrink: '0', width: '48px', minHeight: '48px', borderRadius: '14px',
          backgroundColor: CANVAS.c2, color: CANVAS.ac
        }],
        ['47', '.sb-builder-screen > .sb-panel > .sb-finish', 'Завершить тренировку', {
          flexGrow: '1', padding: '0px', backgroundColor: CANVAS.c2, color: CANVAS.ink58,
          fontSize: '13px', fontWeight: '700', lineHeight: '1'
        }],
        ['48', '.sb-builder-screen > .sb-panel > .sb-builder-note', null, {
          color: CANVAS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.55'
        }]
      ];

      expect(rows.map(([id]) => id)).toEqual(
        Array.from({ length: 48 }, (_, index) => String(index + 1).padStart(2, '0')).filter((id) => id !== '11')
      );

      const mismatches = [];
      const normalizeCss = (value) => String(value == null ? '' : value).replace(/0\.(\d+)/g, '.$1');
      rows.forEach(([id, selector, text, expectedStyle, expectedFields]) => {
        const node = document.querySelector(selector);
        if (!node) {
          mismatches.push({ id, selector, field: 'selector', expected: 'present', actual: 'missing' });
          return;
        }
        if (text != null && node.textContent !== text) {
          mismatches.push({ id, selector, field: 'text', expected: text, actual: node.textContent });
        }
        Object.entries(expectedFields || {}).forEach(([field, expected]) => {
          if (node[field] !== expected) mismatches.push({ id, selector, field, expected, actual: node[field] });
        });
        const actualStyle = getComputedStyle(node);
        Object.entries(expectedStyle || {}).forEach(([property, expected]) => {
          if (normalizeCss(actualStyle[property]) !== normalizeCss(expected)) {
            mismatches.push({ id, selector, field: `computed.${property}`, expected, actual: actualStyle[property] });
          }
        });
      });
      const listBottom = getComputedStyle(document.querySelector('.sb-builder-screen > .sb-list')).paddingBottom;
      if (listBottom !== '12px') {
        mismatches.push({
          id: '45', selector: '.sb-builder-screen > .sb-list', field: 'computed.paddingBottom',
          expected: '12px (visual gap before the separate panel)', actual: listBottom
        });
      }

      const value = (selector, field = 'textContent') => document.querySelector(selector)?.[field] || '';
      const composite1 = [
        value('.sb-head-title > b'), value('.sb-head-sub'), value('.sb-stat:first-child'), value('.sb-stat:nth-child(2)'),
        value('.sb-ex.is-complete:nth-child(1) .sb-ex-title > b'), value('.sb-ex.is-complete:nth-child(1) .sb-ex-sub'),
        value('.sb-ex.is-complete:nth-child(2) .sb-ex-title > b'), value('.sb-ex.is-complete:nth-child(2) .sb-ex-sub'),
        value('.sb-ex.is-open .sb-ex-title > b'), value('.sb-ex.is-open .sb-ex-sub'), value('.sb-ex.is-open .sb-ex-count'),
        value('.sb-ex.is-open .sb-hist > span:first-child'), value('.sb-ex.is-open .sb-hist > span.is-record'),
        value('.sb-aps-head > span:nth-child(2)'), value('.sb-aps-head > span:nth-child(3)'),
        value('.sb-aps > .sb-ap:nth-child(1) .sb-ap-field:nth-child(2)'), value('.sb-aps > .sb-ap:nth-child(1) .sb-ap-field:nth-child(3)'),
        value('.sb-aps > .sb-ap:nth-child(2) .sb-ap-field:nth-child(2)'), value('.sb-aps > .sb-ap:nth-child(2) .sb-ap-field:nth-child(3)'),
        value('.sb-aps > .sb-ap.is-current .sb-ap-field:nth-child(2)', 'value'),
        value('.sb-aps > .sb-ap.is-current .sb-ap-field:nth-child(3)', 'value'),
        value('.sb-rpe-label'), value('.sb-rpe-dot:last-child'), value('.sb-rest-copy'), value('.sb-rest-manual'),
        value('.sb-ex.is-pending .sb-ex-title > b'), value('.sb-ex.is-pending .sb-ex-sub'), value('.sb-finish')
      ].join(' › ');
      const expectedComposite1 = 'Силовая · грудь, спина, плечи › пн, 8 авг · начата в 18:40 › ⏱ 47:12 › 10 / 23 ✓ › Жим лёжа › 4 × 8–12 · 75 кг · рекорд › Тяга штанги в наклоне › 4 × 8–12 · 60 кг › Жим гантелей сидя › Плечи · трицепс › 2/4 › Прошлый раз · 22,5 × 12 › Рекорд · 25 × 10 › Вес, кг › Повторы › 22,5 › 12 › 24 › 10 › 24 › 10 › Тяжесть › 10 › ⏱ Отдых 2:00 — по тяжести 7 › Вручную › Разведение в тренажёре › 3 × 12 · 20 кг · не начато › Завершить тренировку';
      if (composite1 !== expectedComposite1) {
        mismatches.push({ id: 'текст 1/2', field: 'composite text', expected: expectedComposite1, actual: composite1 });
      }
      const composite2 = value('.sb-builder-note');
      const expectedComposite2 = 'Тот же состав, шесть правок против шума. Сделанное не громче текущего: у закрытых упражнений и подходов снята зелёная заливка, сигнал остался один — галочка. Акцент указывает одно место: обводка карточки говорит «открыто здесь», рамка полей — «писать сюда»; номера, кольцо галочки и обводка активной строки приглушены, потому что шесть акцентов внутри одного блока не акцентируют ничего. Заливки больше не вложены тройкой: строки внутри карточки живут на её фоне. Шкала тяжести без обводок — это одна необязательная оценка, а не второй блок веса таблицы. Счётчик незакрытых снят с кнопки: он уже стоит бейджем в шапке.';
      if (composite2 !== expectedComposite2) {
        mismatches.push({ id: 'текст 2/2', field: 'composite text', expected: expectedComposite2, actual: composite2 });
      }

      expect(mismatches).toEqual([]);
    } finally {
      cleanup();
      style.remove();
      now.mockRestore();
    }
  });
});

describe('А2 · rendered Canvas contract', { timeout: 45_000 }, () => {
  it('доказывает все 26 numbered rows и составную строку свёрнутого списка', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2022-08-08T19:27:12+03:00').getTime());
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      const SB = loadBuilder();
      const props = canvasProps();
      // A2 shows the first four cards of a scrollable 23-work-set fixture.
      // The tenth completed work set belongs to the off-screen continuation.
      props.training.workoutLog.exercises[2].approaches[1].done = false;
      props.training.workoutLog.exercises[4].approaches[0].done = true;
      render(React.createElement(SB.BuilderScreen, props));
      fireEvent.click(document.querySelector('.sb-ex-head'));

      const rows = [
        ['01', '.sb-builder-screen > .sb-head', null, {
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          paddingTop: '16px', paddingRight: '18px', paddingBottom: '0px', paddingLeft: '18px'
        }],
        ['02', '.sb-builder-screen > .sb-head > .sb-icon-btn:first-child', '✕', {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexGrow: '0', flexShrink: '0',
          width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS.c1,
          color: CANVAS.ink56, fontSize: '13px', fontWeight: '600', lineHeight: '1'
        }],
        ['03', '.sb-builder-screen > .sb-head > .sb-head-title', null, {
          display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '3px',
          paddingTop: '0px', paddingRight: '10px', paddingBottom: '0px', paddingLeft: '10px'
        }],
        ['04', '.sb-builder-screen > .sb-head .sb-head-title > b', 'Силовая · грудь, спина, плечи', {
          color: CANVAS.tx, fontSize: '15px', fontWeight: '700', lineHeight: '1'
        }],
        ['05', '.sb-builder-screen > .sb-head .sb-head-sub', 'пн, 8 авг · начата в 18:40', {
          color: CANVAS.ink56, fontSize: '10.5px', fontWeight: '600', lineHeight: '1',
          letterSpacing: '0.52px', fontVariantNumeric: 'tabular-nums'
        }],
        ['06', '.sb-builder-screen > .sb-head > .sb-session-badge', 'идёт', {
          flexGrow: '0', flexShrink: '0', paddingTop: '4px', paddingRight: '7px',
          paddingBottom: '4px', paddingLeft: '7px', borderRadius: '999px',
          backgroundColor: CANVAS.c2, color: CANVAS.ac, fontSize: '9px', fontWeight: '700',
          lineHeight: '1', letterSpacing: '0.54px', textTransform: 'uppercase'
        }],
        ['07', '.sb-builder-screen > .sb-head > .sb-icon-btn:last-child', '⋯', {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexGrow: '0', flexShrink: '0',
          width: '36px', height: '36px', borderRadius: '999px', backgroundColor: CANVAS.c1,
          color: CANVAS.ink56, fontSize: '13px', fontWeight: '700', lineHeight: '1'
        }],
        ['08', '.sb-builder-screen > .sb-list', null, {
          display: 'flex', flexDirection: 'column', overflowY: 'auto'
        }],
        ['09', '.sb-builder-screen > .sb-stats', null, {
          display: 'flex', gap: '6px', paddingTop: '18px', paddingRight: '18px',
          paddingBottom: '0px', paddingLeft: '18px'
        }],
        ['10', '.sb-builder-screen > .sb-stats > .sb-stat:first-child', '47:12', {
          paddingTop: '4px', paddingRight: '7px', paddingBottom: '4px', paddingLeft: '7px',
          borderRadius: '999px', backgroundColor: CANVAS.c2, color: CANVAS.ink55,
          fontSize: '9px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
        }],
        ['11', '.sb-builder-screen > .sb-stats > .sb-stat:nth-child(2)', '10 из 23 подходов', {
          borderRadius: '999px', backgroundColor: CANVAS.grBg, color: CANVAS.gr,
          fontSize: '9px', fontWeight: '700', lineHeight: '1', fontVariantNumeric: 'tabular-nums'
        }],
        ['12', '.sb-builder-screen > .sb-list', null, { paddingTop: '12px' }],
        ['13', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-num', '1', {
          width: '26px', height: '26px', backgroundColor: CANVAS.bg,
          boxShadow: `inset 0 0 0 1px ${CANVAS.grBg}`, color: CANVAS.gr
        }],
        ['14', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-title', null, {
          display: 'flex', flexGrow: '1', minWidth: '0', flexDirection: 'column', gap: '2px'
        }],
        ['15', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-title > b', 'Жим лёжа', {
          color: CANVAS.tx, fontSize: '13px', fontWeight: '700', lineHeight: '1.2'
        }],
        ['16', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-sub', '4 × 8–12 · 75 кг · рекорд', {
          color: CANVAS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.3'
        }],
        ['17', '.sb-list > .sb-ex.is-complete:first-child .sb-ex-state', '✓', {
          color: CANVAS.gr, fontSize: '12px', fontWeight: '700', lineHeight: '1'
        }],
        ['18', '.sb-builder-screen > .sb-list', null, { gap: '8px' }],
        ['19', '.sb-list > .sb-ex.is-current .sb-ex-num', '3', {
          backgroundColor: CANVAS.acs, color: CANVAS.onAcs
        }],
        ['20', '.sb-list > .sb-ex.is-current .sb-ex-sub', 'сейчас · подход 2 из 4', {
          color: CANVAS.ac, fontSize: '11px', fontWeight: '500', lineHeight: '1.3'
        }],
        ['21', '.sb-list > .sb-ex.is-current .sb-ex-state', 'раскрыть ›', {
          color: CANVAS.ac, fontSize: '11px', fontWeight: '700', lineHeight: '1'
        }],
        ['22', '.sb-list > .sb-ex.is-pending .sb-ex-num', '4', { color: CANVAS.ink56 }],
        ['23', '.sb-list > .sb-ex.is-pending .sb-ex-title > b', 'Разведение в тренажёре', {
          color: CANVAS.ink55, fontSize: '13px', fontWeight: '700', lineHeight: '1.2'
        }],
        ['24', '.sb-builder-screen > .sb-panel > .sb-panel-add', 'Добавить упражнение', {
          marginTop: '4px', minHeight: '48px', borderRadius: '999px', backgroundColor: CANVAS.c2,
          color: CANVAS.ink58, fontSize: '13px', fontWeight: '700', lineHeight: '1'
        }],
        ['25', '.sb-builder-screen > .sb-panel > .sb-finish', 'Завершить · 13 не закрыто', {
          marginTop: '9px', minHeight: '48px', borderRadius: '999px', backgroundColor: CANVAS.c2,
          color: CANVAS.ink58, fontSize: '13px', fontWeight: '700', lineHeight: '1'
        }],
        ['26', '.sb-builder-screen > .sb-panel > .sb-builder-note', null, {
          marginTop: '12px', color: CANVAS.ink56, fontSize: '11px', fontWeight: '500', lineHeight: '1.55'
        }]
      ];

      expect(rows.map(([id]) => id)).toEqual(
        Array.from({ length: 26 }, (_, index) => String(index + 1).padStart(2, '0'))
      );
      const mismatches = renderedRowMismatches(rows);
      const value = (selector) => document.querySelector(selector)?.textContent || '';
      const composite = [
        value('.sb-head-title > b'), value('.sb-head-sub'), value('.sb-session-badge'),
        value('.sb-stat:first-child'), value('.sb-stat:nth-child(2)'),
        value('.sb-ex.is-complete:nth-child(1) .sb-ex-title > b'),
        value('.sb-ex.is-complete:nth-child(1) .sb-ex-sub'),
        value('.sb-ex.is-complete:nth-child(2) .sb-ex-title > b'),
        value('.sb-ex.is-complete:nth-child(2) .sb-ex-sub'),
        value('.sb-ex.is-current .sb-ex-title > b'), value('.sb-ex.is-current .sb-ex-sub'),
        value('.sb-ex.is-current .sb-ex-state'), value('.sb-ex.is-pending .sb-ex-title > b'),
        value('.sb-ex.is-pending .sb-ex-sub'), value('.sb-panel-add'), value('.sb-finish'), value('.sb-builder-note')
      ].join(' › ');
      const expectedComposite = 'Силовая · грудь, спина, плечи › пн, 8 авг · начата в 18:40 › идёт › 47:12 › 10 из 23 подходов › Жим лёжа › 4 × 8–12 · 75 кг · рекорд › Тяга штанги в наклоне › 4 × 8–12 · 60 кг › Жим гантелей сидя › сейчас · подход 2 из 4 › раскрыть › › Разведение в тренажёре › 3 × 12 · 20 кг · не начато › Добавить упражнение › Завершить · 13 не закрыто › Состояние, в котором список живёт между упражнениями: карточку свернули, подход закрыт, следующее ещё не начато. Раскрытие — тап по карточке, и прежняя сворачивается сама: две открытые карточки не бывают. «Завершить» остаётся тихой, пока счёт незакрытых не дошёл до нуля.';
      if (composite !== expectedComposite) {
        mismatches.push({ id: 'текст', field: 'composite text', expected: expectedComposite, actual: composite });
      }
      expect(document.querySelectorAll('.sb-ex-chevron')).toHaveLength(0);
      expect(mismatches).toEqual([]);
    } finally {
      cleanup();
      style.remove();
      now.mockRestore();
    }
  });
});

describe('strength builder: спокойные состояния активного списка', { timeout: 45_000 }, () => {
  it('оставляет спокойный зелёный сигнал галочке, а не карточке и полям', () => {
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex-head'))
      .toContain('padding: 8px 11px');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex.is-open .sb-ex-head'))
      .toContain('min-height: 0');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex.is-open .sb-ex-head'))
      .toContain('padding: 12px 14px 0');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex-body'))
      .toContain('padding: 0 14px 12px');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-rpe'))
      .toContain('padding: 0');
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ap.is-done .sb-ap-field')).not.toContain('--sb-okbg');
    expect(lastRule('.sb-ex.is-complete')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-ex.is-complete')).not.toContain('--sb-okbg');
    const doneCheck = lastRule('.sb-builder-screen.is-exercise-open .sb-ap-check.is-done');
    expect(doneCheck).toContain('background: var(--sb-okbg)');
    expect(doneCheck).toContain('color: var(--sb-okTx)');
    expect(doneCheck).not.toContain('--v4-ok-text');
  });

  it('выделяет открытое упражнение спокойно, а ввод — рамкой полей', () => {
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ex.is-open'))
      .toContain('box-shadow: inset 0 0 0 1.5px rgba(var(--ink), 0.14)');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-ap.is-current .sb-ap-field'))
      .toContain('box-shadow: inset 0 0 0 2px var(--sb-acc-strong)');
    expect(lastRule('.sb-ap.is-current .sb-ap-num')).not.toContain('background: var(--sb-acc)');
  });

  it('держит преждевременное завершение вторичным действием', () => {
    expect(lastRule('.sb-finish')).toContain('background: var(--sb-card)');
    expect(lastRule('.sb-finish')).toContain('border: 1px solid var(--sb-br)');
    expect(lastRule('.sb-finish')).not.toContain('linear-gradient');
  });

  it('держит отдых доком над панелью, а не полноэкранной подложкой', () => {
    const rest = lastRule('.sb-rest');
    expect(rest).toContain('bottom: calc(82px + env(safe-area-inset-bottom, 0px))');
    expect(rest).not.toContain('inset: 0');
    expect(rest).not.toContain('background: var(--sb-bg)');
    expect(lastRule('.sb-root--rest-docked .sb-rest')).toContain('position: relative');
    expect(lastRule('.sb-root--rest-docked .sb-panel')).toContain('position: relative');
    expect(lastRule('.sb-rest-ring')).toContain('width: 168px');
  });

  it('держит пилюли прошлого подхода и рекорда в точных спокойных ролях А1б', () => {
    const history = lastRule('.sb-builder-screen.is-exercise-open .sb-hist span');
    expect(history).toContain('background: var(--sb-bg)');
    expect(history).toContain('color: var(--sb-mut)');
    expect(lastRule('.sb-builder-screen.is-exercise-open .sb-hist span.is-record'))
      .toContain('color: var(--sb-acc)');
  });

  it('повторяет контракт кольца Е3: контекст, число, подпись и три действия', () => {
    expect(BUILDER).toContain("'отдых между подходами'");
    expect(BUILDER).toContain("' из ' + agg.totalApproaches + ' подходов'");
    expect(BUILDER).toContain("'дальше ' + owner.charAt(0).toLowerCase() + owner.slice(1) + ' · раунд '");
    expect(BUILDER).toContain("'Кольцо стоит над кнопкой «Завершить», а не поверх списка:");
    expect(BUILDER).toContain("'из ' + restSourceName");
    expect(BUILDER).toContain("'по правилу «' + (restSourceName || 'отдыха') + '»'");
    expect(SUPERSET).toContain("h('small', null, 'осталось')");
    expect(SUPERSET).toContain("}, '+10 секунд')");
    expect(SUPERSET).toContain("}, 'пропустить')");
    expect(SUPERSET).toContain("}, 'свернуть')");
    expect(lastRule('.sb-rest-ring')).toContain('height: 168px');
    expect(lastRule('.sb-rest-value')).toContain('font-size: 38px');
    expect(lastRule('.sb-rest-value small')).toContain('font-size: 9.5px');
    expect(lastRule('.sb-rest-value small')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-context small')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-next')).toContain('rgba(var(--ink, 15, 23, 42), 0.56)');
    expect(lastRule('.sb-rest-compact-copy span')).toContain('rgba(var(--ink, 15, 23, 42), 0.45)');
    expect(lastRule('.sb-rest-actions')).toContain('gap: 7px');
    expect(lastRule('.sb-rest-actions')).toContain('margin-top: 14px');
    expect(lastRule('.sb-rest-actions .sb-rest-collapse')).toContain('padding: 0 14px');
  });

  it('держит запрет дропа внутри связки у writer, а не только скрытой кнопкой', () => {
    const addDrop = BUILDER.slice(
      BUILDER.indexOf('function addDrop(exIdx)'),
      BUILDER.indexOf('function addExercise(name)'),
    );
    expect(addDrop).toContain('if (groupByIndex[exIdx]) return;');
    expect(addDrop.indexOf('if (groupByIndex[exIdx]) return;'))
      .toBeLessThan(addDrop.indexOf('patchExercises(next)'));
  });
});
