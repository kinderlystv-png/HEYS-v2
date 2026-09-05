// Lane 3 · Task 50 · панель куратора → CuratorEditStatusScreen
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { fileURLToPath } from 'url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PANEL_SRC = fs.readFileSync(path.join(WEB_DIR, 'heys_curator_panel_v1.js'), 'utf8');

function loadModules(extra) {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = React;
  const ev = (rel) => {
    // eslint-disable-next-line no-eval
    eval(fs.readFileSync(path.join(WEB_DIR, rel), 'utf8'));
  };
  ev('heys_norm_correction_v1.js');
  ev('heys_curator_panel_v1.js');
  ev('_kernel/heys_kernel_strength_v1.js');
  ev('heys_exercise_catalog_v1.js');
  if (extra) extra.forEach(ev);
  return globalThis.HEYS;
}

const work = (w, r, done) => ({ weightKg: String(w), reps: r, done: !!done });

function trainingWithProposal() {
  const now = new Date('2026-09-05T12:00:00').getTime();
  const sent = new Date(now);
  sent.setHours(9, 14, 0, 0);
  const proposal = {
    status: 'accepted',
    proposedAt: sent.getTime(),
    resolvedAt: sent.getTime() + 17 * 60 * 1000,
    rejected: [],
    applied: [{ name: 'Жим', reason: 'approaches_changed' }],
  };
  return {
    type: 'strength',
    strengthEntryMode: 'workout_builder',
    plan: { dayLabel: 'Верх B', programTitle: 'Pro Спорт' },
    planSnapshot: { exercises: [{ name: 'Жим', approaches: [work(70, 8, false)] }] },
    workoutLog: { exercises: [{ name: 'Жим', approaches: [work(70, 8, true)] }] },
    proposal
  };
}

function mountFullscreen() {
  globalThis.HEYS.TrainingKernel = globalThis.HEYS.TrainingKernel || {};
  globalThis.HEYS.TrainingKernel.fullscreen = {
    mount: vi.fn(),
    unmount: vi.fn()
  };
}

describe('панель куратора · вход в статус правок', () => {
  beforeEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('исходник панели зовёт CuratorPanel.openCuratorEditStatus на тап по строке', () => {
    expect(PANEL_SRC).toContain('openPanelClientEditStatus');
    expect(PANEL_SRC).toContain('HEYS.CuratorPanel.openCuratorEditStatus');
    expect(PANEL_SRC).toContain('handlePanelRowClick');
    expect(PANEL_SRC).toMatch(/onClick:\s*\(\)\s*=>\s*\{\s*handlePanelRowClick\(row\)/);
  });

  it('openPanelClientEditStatus → CuratorEditStatusScreen', async () => {
    const HEYS = loadModules(['strength/heys_strength_proposal_ui_v1.js']);
    const closeOverlay = vi.fn();
    mountFullscreen();
    HEYS.TrainingKernel.fullscreen.mount = function ({ render: renderScreen }) {
      render(renderScreen({ close: closeOverlay }));
      return true;
    };

    const training = trainingWithProposal();
    const opened = await HEYS.CuratorPanel.openPanelClientEditStatus({
      clientId: 'client-1',
      clientName: 'Марина К.',
      training
    });

    expect(opened).toBe(true);
    expect(document.querySelector('.sb-curator-edit')).toBeTruthy();
    expect(screen.getByText('Марина К.')).toBeTruthy();
    expect(screen.getByText('Правка отправлена')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Закрыть'));
    expect(closeOverlay).toHaveBeenCalledTimes(1);
  });

  it('тап по строке панели открывает CuratorEditStatusScreen при proposal в дне', async () => {
    const HEYS = loadModules(['strength/heys_strength_proposal_ui_v1.js']);
    const closeOverlay = vi.fn();
    mountFullscreen();
    HEYS.TrainingKernel.fullscreen.mount = function ({ render: renderScreen }) {
      render(renderScreen({ close: closeOverlay }));
      return true;
    };

    const training = trainingWithProposal();
    const today = '2026-09-05';
    HEYS.utils = {
      lsGet: (key) => {
        if (key === 'heys_client-1_dayv2_' + today) {
          return { date: today, trainings: [training] };
        }
        return null;
      }
    };

    HEYS.YandexAPI = {
      getClientsWindow: vi.fn().mockResolvedValue({ data: [], error: null }),
      getClientsNormContext: vi.fn().mockResolvedValue({
        data: [{
          client_id: 'client-1',
          weight: 70,
          height: 170,
          age: 30,
          birth_date: '1996-01-01',
          gender: 'Женский',
          deficit_pct_target: -15
        }],
        error: null
      })
    };

    const { container } = render(React.createElement(HEYS.CuratorPanel.Component, {
      clients: [{ id: 'client-1', name: 'Марина К.' }],
      onOpenClient: vi.fn()
    }));

    await vi.waitFor(() => {
      expect(container.querySelector('.cur-row')).toBeTruthy();
    });

    fireEvent.click(container.querySelector('.cur-row'));
    await vi.waitFor(() => {
      expect(document.querySelector('.sb-curator-edit')).toBeTruthy();
    });
    const edit = document.querySelector('.sb-curator-edit');
    expect(edit.querySelector('.sb-curator-edit-client')?.textContent).toBe('Марина К.');
    expect(edit.textContent).toContain('Правка отправлена');
  });
});
