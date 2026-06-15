// fingers-settings-assessment.test.js — Settings UI bridge for assessment battery.

import fs from 'fs';
import path from 'path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const ev = (f) => {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, f), 'utf8'));
};

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  ev('heys_fingers_assessment_v1.js');
  ev('heys_fingers_session_ui_v1.js');
};

const F = () => globalThis.HEYS.Fingers;

describe('Fingers SettingsSheet — assessment battery UI', () => {
  beforeAll(setupOnce);

  beforeEach(() => {
    vi.restoreAllMocks();
    F().getProfile = () => ({ age: 30, level: 'intermediate' });
    F().getBodyWeight = () => ({ kg: 70, source: 'profile' });
    F().voice = { getSettings: () => ({ enabled: true, volume: 0.8 }) };
    globalThis.HEYS.Toast = { success: vi.fn(), info: vi.fn() };
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('prefills saved battery values from records store', () => {
    F().records = {
      loadAssessmentBattery: () => ({
        maxHang20mmHalf: { score: 58 },
        techniqueMarkers: { markers: 2 }
      }),
      saveAssessmentBattery: vi.fn()
    };

    render(React.createElement(F().SettingsSheet, { onClose: vi.fn() }));

    expect(screen.getByLabelText('Сила пальцев: результат').value).toBe('58');
    expect(screen.getByLabelText('Техника: отмечено').value).toBe('2');
  });

  it('saves edited test scores through records.saveAssessmentBattery', () => {
    const save = vi.fn((raw) => raw);
    F().records = {
      loadAssessmentBattery: () => ({}),
      saveAssessmentBattery: save
    };

    render(React.createElement(F().SettingsSheet, { onClose: vi.fn() }));

    fireEvent.change(screen.getByLabelText('Сила пальцев: результат'), {
      target: { value: '55' }
    });
    fireEvent.change(screen.getByLabelText('Техника: отмечено'), {
      target: { value: '2' }
    });
    fireEvent.click(screen.getByText(/Сохранить тесты/));

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].maxHang20mmHalf.score).toBe(55);
    expect(save.mock.calls[0][0].techniqueMarkers.markers).toBe(2);
    expect(save.mock.calls[0][1]).toEqual({ source: 'settings' });
    expect(globalThis.HEYS.Toast.success).toHaveBeenCalledWith('Результаты тестов сохранены');
  });
});
