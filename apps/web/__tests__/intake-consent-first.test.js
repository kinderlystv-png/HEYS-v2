/**
 * Анкета: согласие на шаге 1, данные и черновик только после галочек
 * (questionnaire.v4, строка «порядок: согласие раньше данных»).
 */
import fs from 'fs';
import path from 'path';

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const intakeSource = fs.readFileSync(path.join(webDir, 'heys_trial_intake_v1.js'), 'utf8');

function loadIntake(rpc) {
  window.React = React;
  window.HEYS = { YandexAPI: { rpc } };
  // eslint-disable-next-line no-eval
  (0, eval)(intakeSource);
  return window.HEYS.TrialIntake;
}

describe('анкета: согласие раньше данных', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete window.HEYS;
    delete window.React;
    localStorage.clear();
  });

  it('первый шаг — предупреждение, полей целей нет', async () => {
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 0, answers: window.HEYS.TrialIntake.EMPTY_ANSWERS },
        } } };
      }
      return { data: { save_trial_intake_by_session: { success: true, status: 'in_progress' } } };
    });
    loadIntake(rpc);
    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));

    expect(await screen.findByText('Шаг 1 из 5')).toBeTruthy();
    expect(screen.getByText('Важная информация')).toBeTruthy();
    expect(screen.queryByText('Главная цель')).toBeNull();
    expect(screen.queryByText('Цели и ожидания')).toBeNull();
  });

  it('до галочек RPC save не вызывается', async () => {
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 0, answers: window.HEYS.TrialIntake.EMPTY_ANSWERS },
        } } };
      }
      return { data: { save_trial_intake_by_session: { success: true, status: 'in_progress' } } };
    });
    loadIntake(rpc);
    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    await screen.findByText('Прежде чем начать');

    const ack = document.getElementById('intake-acknowledged_at');
    fireEvent.click(ack);
    await waitFor(() => {
      expect(rpc.mock.calls.some(([name]) => name === 'save_trial_intake_by_session')).toBe(false);
    }, { timeout: 1200 });
  });

  it('после обеих галочек «Продолжить» открывает цели и создаёт черновик', async () => {
    const rpc = vi.fn(async (fn, params) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 0, answers: window.HEYS.TrialIntake.EMPTY_ANSWERS },
        } } };
      }
      return { data: { save_trial_intake_by_session: {
        success: true, status: 'in_progress', current_step: params.p_current_step,
      } } };
    });
    loadIntake(rpc);
    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    await screen.findByText('Мне есть 18');

    fireEvent.click(document.getElementById('intake-acknowledged_at'));
    fireEvent.click(document.getElementById('intake-age_confirmed_at'));
    fireEvent.click(screen.getByRole('button', { name: /Продолжить/ }));

    expect(await screen.findByText('Цели и ожидания')).toBeTruthy();
    expect(screen.getByText('Шаг 2 из 5')).toBeTruthy();
    await waitFor(() => {
      expect(rpc.mock.calls.some(([name]) => name === 'save_trial_intake_by_session')).toBe(true);
    });
    expect(rpc.mock.calls.find(([name]) => name === 'save_trial_intake_by_session')[1].p_current_step).toBe(1);
  });

  it('исходник: warning первый в STEPS и есть гейт черновика', () => {
    const stepsAt = intakeSource.indexOf('const STEPS = [');
    const stepsChunk = intakeSource.slice(stepsAt, stepsAt + 120);
    expect(stepsChunk).toMatch(/id:\s*'warning'/);
    expect(intakeSource).toContain("if (!isConsentComplete(nextAnswers)) return;");
    expect(intakeSource).toContain("STEP_ORDER_FLAG = 'consent-first'");
  });
});
