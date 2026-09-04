import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/750-strength-builder.css'), 'utf8');
const SUPERSET = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_superset_ui_v1.js'), 'utf8');
const BUILDER = fs.readFileSync(path.join(WEB_DIR, 'strength/heys_strength_builder_ui_v1.js'), 'utf8');
const BASE_CSS = fs.readFileSync(path.join(WEB_DIR, 'styles/modules/000-base-and-gamification.css'), 'utf8');

const CANVAS = Object.freeze({
  bg: '#fffaf1', c1: '#f7efe2', c2: '#efe3cf', tx: '#201e1d',
  ac: '#8a4a20', acs: '#c67139', onAcs: '#2b1608', ac2: '#b4442a',
  gr: '#5c6a45', grBg: '#eaefe0',
  ink06: 'rgba(0, 0, 0, 0.06)', ink42: 'rgba(0, 0, 0, 0.42)',
  ink56: 'rgba(0, 0, 0, 0.56)', ink62: 'rgba(0, 0, 0, 0.62)'
});

const COMPUTED_CSS = CSS
  .replaceAll('var(--sb-card)', CANVAS.c1)
  .replaceAll('var(--sb-bg)', CANVAS.bg)
  .replaceAll('var(--sb-tx)', CANVAS.tx)
  .replaceAll('var(--sb-mut)', CANVAS.ink56)
  .replaceAll('var(--sb-br)', 'rgba(0, 0, 0, .1)')
  .replaceAll('var(--sb-soft)', CANVAS.c2)
  .replaceAll('var(--sb-acc-strong)', CANVAS.acs)
  .replaceAll('var(--sb-accbg)', 'rgba(198, 113, 57, .12)')
  .replaceAll('var(--sb-acc)', CANVAS.ac)
  .replaceAll('var(--sb-okbg)', CANVAS.grBg)
  .replaceAll('var(--sb-okTx)', CANVAS.gr)
  .replaceAll('var(--v4-btn-on-act, #fff5ef)', CANVAS.onAcs)
  .replaceAll('var(--ac2, var(--v4-act, #b4442a))', CANVAS.ac2)
  .replaceAll('var(--bg)', CANVAS.bg)
  .replaceAll('var(--c1)', CANVAS.c1)
  .replaceAll('var(--c2)', CANVAS.c2)
  .replaceAll('var(--tx)', CANVAS.tx)
  .replaceAll('var(--ac)', CANVAS.ac)
  .replaceAll('var(--acs)', CANVAS.acs)
  .replaceAll('var(--gr)', CANVAS.gr)
  .replaceAll('var(--gr-bg)', CANVAS.grBg)
  .replaceAll('var(--ink, 15, 23, 42)', '0, 0, 0')
  .replaceAll('var(--ink)', '0, 0, 0')
  .replaceAll('env(safe-area-inset-bottom, 0px)', '0px');

function lastRule(selector) {
  const re = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*\\{[^}]*\\})`, 'g');
  let match;
  let last = '';
  while ((match = re.exec(CSS)) !== null) last = match[1];
  return last;
}

function exactRule(selector) {
  const re = new RegExp(`(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*\\})`, 'g');
  let match;
  let last = '';
  while ((match = re.exec(CSS)) !== null) last = match[1];
  return last;
}

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

function loadParts() {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('strength/heys_strength_superset_ui_v1.js');
  return globalThis.HEYS.StrengthBuilderParts;
}

const canvasApproaches = () => ([
  { weightKg: '22', reps: 12, done: true },
  { weightKg: '24', reps: 10, done: true },
  { weightKg: '24', reps: 10, done: true }
]);

describe('Е4 · таймер вне экрана · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит четыре поверхности: свёрнутое кольцо, пуш, resume и stale', () => {
    expect(BUILDER).toContain("new Notification('Отдых закончился'");
    expect(BUILDER).toContain('document.hidden');
    expect(SUPERSET).toContain('sb-offscreen-session--resume');
    expect(SUPERSET).toContain('sb-offscreen-session--stale');
    expect(SUPERSET).toContain('RestEndedPocket');
    expect(CSS).toMatch(/\.sb-rest-compact-copy span[\s\S]*0\.56/);
    expect(CSS).toMatch(/\.sb-rest-compact i[\s\S]*11\.5px/);
    expect(CSS).toMatch(/\.sb-rest-ended-icon[\s\S]*width: 36px/);
    expect(lastRule('.sb-offscreen-primary')).toContain('margin-top: 12px');
    expect(exactRule('.sb-offscreen-actions')).toContain('gap: 7px');
    expect(lastRule('.sb-offscreen-actions .is-close')).toContain('var(--gr-bg');
  });

  it('доказывает RestRing collapsed, RestEndedPocket и SummaryCard resume/stale', () => {
    const Parts = loadParts();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(Parts.RestRing, {
        secondsLeft: 48,
        total: 90,
        owner: 'связка A',
        collapsed: true,
        onSkip: vi.fn(),
        onAdd: vi.fn(),
        onCollapse: vi.fn(),
        onExpand: vi.fn()
      }));
      const compact = document.querySelector('.sb-rest-compact-copy b');
      expect(compact?.textContent).toBe('Отдых 0:48 · связка A');
      expect(document.querySelector('.sb-rest-compact i')?.textContent).toBe('развернуть');

      cleanup();
      render(React.createElement(Parts.RestEndedPocket, {
        title: 'Отдых закончился',
        subtitle: 'Жим гантелей сидя · подход 3 из 3',
        nowLabel: 'сейчас'
      }));
      const icon = document.querySelector('.sb-rest-ended-icon');
      expect(icon?.textContent).toBe('HS');
      const iconBg = getComputedStyle(icon).backgroundColor;
      expect(iconBg === 'rgb(198, 113, 57)' || iconBg === CANVAS.acs).toBe(true);

      cleanup();
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 7, 9, 20, 16, 0));
      const startedAt = Date.now() - (52 * 60 + 14) * 1000;
      const lastMarkAt = new Date(2026, 7, 9, 19, 24, 0).getTime();
      render(React.createElement(Parts.SummaryCard, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            startedAt,
            lastMarkAt,
            exercises: [{
              name: 'Жим гантелей',
              approaches: [
                { weightKg: '24', reps: 10, done: true },
                { weightKg: '24', reps: 10, done: true },
                { weightKg: '24', reps: 10, done: false }
              ]
            }]
          }
        },
        dateKey: '2026-08-09',
        onOpen: vi.fn()
      }));
      expect(screen.getByText('Тренировка продолжается · 52:14')).toBeTruthy();
      expect(screen.getByText('последняя отметка в 19:24 · Жим гантелей 2 из 3')).toBeTruthy();
      expect(screen.getByText('Вернуться в тренировку')).toBeTruthy();

      cleanup();
      vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0));
      render(React.createElement(Parts.SummaryCard, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            startedAt: lastMarkAt - 3600000,
            lastMarkAt,
            exercises: [{
              name: 'Жим',
              approaches: [{ weightKg: '60', reps: 8, done: true }]
            }]
          }
        },
        dateKey: '2026-08-09',
        onOpen: vi.fn(),
        onDelete: vi.fn(),
        onCloseAtLastMark: vi.fn()
      }));
      expect(screen.getByText('Вчерашняя не закрыта')).toBeTruthy();
      expect(screen.getByText(/таймер остановлен на последней отметке в 19:24/)).toBeTruthy();
      expect(screen.getByText('удалить')).toBeTruthy();
      expect(screen.getByText('дописать')).toBeTruthy();
      expect(screen.getByText('закрыть')).toBeTruthy();
      vi.useRealTimers();
    } finally {
      style.remove();
    }
  });
});

describe('Е5 · перенумерация · canvas contract', () => {
  afterEach(() => cleanup());

  it('держит RenumberScreen, toggleType→renumber и CSS ярлыков/тоннажа', () => {
    expect(BUILDER).toContain("setView('renumber')");
    expect(BUILDER).toContain('skipRenumber: true');
    expect(SUPERSET).toContain('RenumberScreen');
    expect(SUPERSET).toContain('ярлык подхода переключили тапом');
    expect(CSS).toMatch(/\.sb-renumber-num\.is-work[\s\S]*var\(--gr-bg/);
    expect(CSS).toMatch(/\.sb-renumber-num\.is-warmup[\s\S]*0\.06/);
    expect(CSS).toMatch(/\.sb-renumber-delta[\s\S]*var\(--ac2/);
    expect(CSS).toMatch(/\.sb-renumber-tonnage-values[\s\S]*gap: 7px/);
  });

  it('доказывает было/стало, −264 кг и открытие по тапу на ярлык', () => {
    const SB = loadBuilder();
    const style = document.createElement('style');
    style.textContent = `${BASE_CSS}\n${COMPUTED_CSS}`;
    document.head.appendChild(style);

    try {
      render(React.createElement(SB.BuilderScreen, {
        training: {
          type: 'strength',
          strengthEntryMode: 'workout_builder',
          workoutLog: {
            exercises: [{
              name: 'Жим гантелей сидя',
              approaches: canvasApproaches()
            }]
          }
        },
        dateKey: '2022-08-08',
        profile: { weight: 80 },
        onPatch: vi.fn(),
        onPatchSession: vi.fn(),
        onClose: vi.fn()
      }));

      fireEvent.click(screen.getByLabelText('Рабочий подход номер 1'));
      expect(document.querySelector('.sb-renumber-screen')).toBeTruthy();
      expect(screen.getByText('ярлык подхода переключили тапом')).toBeTruthy();
      expect(screen.getByText('Было · три рабочих')).toBeTruthy();
      expect(screen.getByText('Стало · разминка и два рабочих')).toBeTruthy();
      expect(screen.getAllByText('744 кг').length).toBeGreaterThan(0);
      expect(screen.getByText('480 кг')).toBeTruthy();
      expect(screen.getByText('−264 кг')).toBeTruthy();

      const workBadge = document.querySelector('.sb-renumber-num.is-work');
      const warmupBadge = document.querySelector('.sb-renumber-num.is-warmup');
      expect(workBadge?.textContent).toBe('1');
      expect(warmupBadge?.textContent).toBe('Р');
      const workBg = getComputedStyle(workBadge).backgroundColor;
      expect(workBg === 'rgb(234, 239, 224)' || workBg === CANVAS.grBg).toBe(true);
      const warmupColor = getComputedStyle(warmupBadge).color;
      expect(warmupColor === 'rgba(0, 0, 0, 0.62)' || warmupColor === CANVAS.ink62).toBe(true);

      const delta = document.querySelector('.sb-renumber-delta');
      const deltaColor = getComputedStyle(delta).color;
      expect(deltaColor === 'rgb(180, 68, 42)' || deltaColor === CANVAS.ac2).toBe(true);
    } finally {
      style.remove();
    }
  });
});
