// fingers-session-ui-performance.test.js — SessionUI repeated state-change smoke.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const createStorageMock = () => {
  const store = {};
  return {
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
};

const ev = (f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8'));
};

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  ev('heys_fingers_programs_catalog_v1.js');
  ev('heys_fingers_age_gating_v1.js');
  ev('heys_fingers_assessment_v1.js');
  ev('heys_fingers_session_ui_v1.js');
};

const F = () => globalThis.HEYS.Fingers;

const setProfile = () => {
  globalThis.HEYS.utils.lsSet('heys_profile', {
    age: 30,
    fingerboardProfile: {
      age: 30,
      maxVGrade: 'V5-V6',
      level: 'intermediate',
      equipmentTypes: ['full', 'none'],
      goal: 'strength',
      themeId: 'C'
    }
  });
};

describe('Fingers SessionUI — repeated state changes smoke', () => {
  beforeAll(setupOnce);

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    const storage = createStorageMock();
    globalThis.localStorage = storage;
    globalThis.window.localStorage = storage;
    globalThis.HEYS.currentClientId = 'perf-client';
    globalThis.HEYS.__fingersDiaryVersion = 0;
    globalThis.HEYS.utils = {
      lsGet: (key, dflt) => {
        try {
          const raw = storage.getItem(key);
          return raw ? JSON.parse(raw) : dflt;
        } catch (_) { return dflt; }
      },
      lsSet: (key, val) => { storage.setItem(key, JSON.stringify(val)); },
      lsDel: (key) => { storage.removeItem(key); }
    };
    globalThis.HEYS.Toast = { success: vi.fn(), info: vi.fn(), warn: vi.fn() };
    globalThis.HEYS.ConfirmModal = { show: vi.fn() };
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) }
    });

    setProfile();
    F().records = {
      get: () => ({ maxHangs: {}, updatedAt: 0 }),
      loadAssessmentBattery: () => ({}),
      saveAssessmentBattery: vi.fn((raw) => raw),
      asymmetries: () => []
    };
    F().persistence = {
      load: () => null,
      clear: vi.fn()
    };
    F().voice = {
      getSettings: () => ({ enabled: true, volume: 0.8 }),
      setEnabled: vi.fn(),
      setVolume: vi.fn(),
      say: vi.fn()
    };
    F().EquipmentBar = () => null;
    F().GoalSelector = () => null;
    F().BibliographyModal = ({ onClose }) => React.createElement('div', { role: 'dialog' },
      React.createElement('button', { onClick: onClose }, 'Закрыть источники'));
    F().YearHeatmap = () => React.createElement('div', { 'data-testid': 'year-heatmap' });
    F().cooldownCheck = () => ({ allowedNow: true, hoursSinceLast: null, lastWasMax: false });
  });

  it('keeps tab structure and overlay count stable after repeated tab/settings toggles', () => {
    const { container } = render(React.createElement(F().SessionUI, {
      dateKey: '2026-06-10',
      trainingIndex: 0,
      onClose: vi.fn()
    }));

    const tablist = screen.getByRole('tablist');
    expect(within(tablist).getAllByRole('tab')).toHaveLength(5);

    const tabs = ['Протоколы', 'Своя', 'Прогресс', 'Календарь', 'Сегодня'];
    for (let i = 0; i < 12; i += 1) {
      tabs.forEach((label) => fireEvent.click(screen.getByRole('tab', { name: label })));
    }

    expect(within(screen.getByRole('tablist')).getAllByRole('tab')).toHaveLength(5);
    expect(container.querySelectorAll('.fingers-settings__backdrop')).toHaveLength(0);

    for (let i = 0; i < 8; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Настройки тренировки' }));
      expect(container.querySelectorAll('.fingers-settings__backdrop')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
      expect(container.querySelectorAll('.fingers-settings__backdrop')).toHaveLength(0);
    }

    expect(screen.getByRole('tab', { name: 'Сегодня' }).getAttribute('aria-selected')).toBe('true');
    expect(container.querySelectorAll('.fingers-fs-tab-content')).toHaveLength(1);
  });
});
