import fs from 'fs';
import path from 'path';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(webDir, '../..');
const sql = fs.readFileSync(path.join(repoDir, 'database/2026-07-27_trial_intake_flow.sql'), 'utf8');
const intakeSource = fs.readFileSync(path.join(webDir, 'heys_trial_intake_v1.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(webDir, 'heys_trial_queue_v1.js'), 'utf8');
const rpcSource = fs.readFileSync(path.join(repoDir, 'yandex-cloud-functions/heys-api-rpc/index.js'), 'utf8');
const maintenanceSource = fs.readFileSync(path.join(repoDir, 'yandex-cloud-functions/heys-maintenance/index.js'), 'utf8');
const landingSource = fs.readFileSync(path.join(repoDir, 'apps/landing/src/components/TrialForm.tsx'), 'utf8');
const consentsSource = fs.readFileSync(path.join(webDir, 'heys_consents_v1.js'), 'utf8');
const allowedRpcSource = rpcSource.slice(
  rpcSource.indexOf('const ALLOWED_FUNCTIONS = ['),
  rpcSource.indexOf('const COOKIE_SESSION_TOKEN_FUNCTIONS'),
);

const completedAnswers = {
  goals: { primary_goal: 'Наладить регулярное питание', success_definition: 'Стабильный режим' },
  experience: { previous_experience: 'self' },
  lifestyle: { schedule: 'Рабочий день', sleep: 'Около восьми часов' },
  collaboration: { daily_tracking: 'yes', feedback_style: 'concise' },
  health: { doctor_restrictions: 'Нет' },
  safety: { acute_symptoms: false },
  meta: { schema_version: '1.0' },
};

function sqlFunction(name, nextName) {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = nextName
    ? sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1)
    : sql.length;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

describe('protected trial intake contract', () => {
  const originalHEYS = window.HEYS;
  const originalReact = window.React;

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.HEYS = originalHEYS;
    window.React = originalReact;
    window.history.replaceState({}, '', '/');
  });

  it('keeps the landing payload minimal and consent-specific', () => {
    const payload = landingSource.slice(
      landingSource.indexOf('body: JSON.stringify({'),
      landingSource.indexOf('marketing_accepted_at:') + 180,
    );

    expect(payload).toContain('name: name.trim()');
    expect(payload).toContain("phone: '7' + phoneDigits");
    expect(payload).toContain('messenger');
    expect(payload).toContain('birth_year');
    expect(payload).toContain('...utmParams');
    expect(payload).toContain('privacy_version');
    expect(payload).not.toContain('user_agreement_version');
    expect(payload).not.toContain('health_data');
    expect(payload).not.toContain('email:');
    expect(payload).not.toContain('how_heard:');
    expect(payload).not.toContain('promo_code:');
  });

  it('binds reads and writes to a live session and encrypts every answer set', () => {
    expect(sql.match(/token_hash = digest\(p_session_token, 'sha256'\)/g)).toHaveLength(2);
    expect(sql.match(/expires_at > NOW\(\)/g)).toHaveLength(2);
    expect(sql.match(/revoked_at IS NULL/g).length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain("document_version = '1.5'");
    expect(sql).toContain('answers_encrypted = public.encrypt_health_data(p_answers)');
    expect(sql).toContain('review_note_encrypted');
    const tableDefinition = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS public.trial_intakes'),
      sql.indexOf('CREATE INDEX IF NOT EXISTS trial_intakes_curator_status_idx'),
    );
    expect(tableDefinition).not.toMatch(/\n\s*answers\s+JSONB/i);
  });

  it('prevents client and curator IDOR at the SQL boundary', () => {
    const clientRead = sqlFunction('get_trial_intake_by_session', 'save_trial_intake_by_session');
    const clientWrite = sqlFunction('save_trial_intake_by_session', 'admin_invite_trial_intake');
    const curatorRead = sqlFunction('admin_get_trial_intake', 'admin_review_trial_intake');
    const curatorReview = sqlFunction('admin_review_trial_intake', 'purge_expired_trial_intakes');

    expect(clientRead.split('RETURNS JSONB')[0]).not.toContain('p_client_id');
    expect(clientWrite.split('RETURNS JSONB')[0]).not.toContain('p_client_id');
    for (const fn of [clientRead, clientWrite]) {
      expect(fn).toContain("token_hash = digest(p_session_token, 'sha256')");
      expect(fn).toContain('expires_at > NOW()');
      expect(fn).toContain('revoked_at IS NULL');
    }
    for (const fn of [curatorRead, curatorReview]) {
      expect(fn).toContain('c.id = p_client_id AND c.curator_id = p_curator_id');
      expect(fn).toContain("'forbidden'");
    }
    expect(rpcSource).toContain('params.p_curator_id = curatorId');
  });

  it('covers encrypted storage, audit, revoke/delete purge and DSAR export', () => {
    const tableDefinition = sql.slice(
      sql.indexOf('CREATE TABLE IF NOT EXISTS public.trial_intakes'),
      sql.indexOf('CREATE INDEX IF NOT EXISTS trial_intakes_curator_status_idx'),
    );
    const clientRead = sqlFunction('get_trial_intake_by_session', 'save_trial_intake_by_session');
    const clientWrite = sqlFunction('save_trial_intake_by_session', 'admin_invite_trial_intake');
    const curatorRead = sqlFunction('admin_get_trial_intake', 'admin_review_trial_intake');
    const exportFn = sqlFunction('export_my_data_by_session');

    expect(tableDefinition).toContain('REFERENCES public.clients(id) ON DELETE CASCADE');
    expect(tableDefinition).toContain('answers_encrypted     BYTEA');
    expect(tableDefinition).toContain('review_note_encrypted BYTEA');
    expect(clientWrite).toContain('public.encrypt_health_data(p_answers)');
    expect(clientRead).toContain('public.decrypt_health_data(v_row.answers_encrypted)');
    expect(curatorRead).toContain("'read_trial_intake'");
    expect(clientWrite).toContain("'write_trial_intake'");
    expect(sql).toContain('DELETE FROM public.trial_intakes WHERE client_id = NEW.client_id');
    expect(exportFn).toContain('public.decrypt_health_data(ti.answers_encrypted)');
    expect(exportFn).toContain("'trial_intake', v_intake");
  });

  it('enforces curator ownership, manual decisions and approved-before-trial', () => {
    expect(sql.match(/c\.curator_id = p_curator_id/g).length).toBeGreaterThanOrEqual(4);
    expect(sql).toContain("p_action NOT IN ('needs_clarification', 'approved', 'rejected')");
    expect(sql).toContain("'rejection_reason_required'");
    expect(sql).toContain("v_intake_status <> 'approved'");
    expect(sql).toContain("retention_delete_at = CASE WHEN p_action = 'rejected' THEN NOW() + INTERVAL '30 days'");
    expect(sql).toContain('purge_expired_trial_intakes');
    expect(maintenanceSource).toContain('SELECT public.purge_expired_trial_intakes()::int AS rows');
    expect(maintenanceSource).toContain('results.trial_intakes_cleanup = await cleanupExpiredTrialIntakes(client)');
    expect(sql).toContain('validate_trial_intake_answers_v1(p_answers, p_complete)');
    expect(sql).toContain("RETURN 'unknown_answer_field'");
    expect(sql).toContain("RETURN 'required_answers_missing'");
    expect(sql).toContain('CHECK (current_step BETWEEN 0 AND 5)');
    expect(sql).not.toContain('automatic_reject');
  });

  it('does not forge user-agreement or health consent during lead conversion', () => {
    const convertFn = sql.slice(
      sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_convert_lead'),
      sql.indexOf('-- New intakes must be approved'),
    );

    expect(convertFn).toContain("'personal_data'");
    expect(convertFn).toContain("'marketing'");
    expect(convertFn).not.toContain("'user_agreement'");
    expect(convertFn).not.toContain("'health_data'");
    expect(convertFn).toContain("COALESCE(v_lead.consent_privacy_version, '1.0')");
  });

  it('uses a universal replay-safe route marker without PII or bearer data', () => {
    window.React = {};
    window.HEYS = {};
    window.history.replaceState({}, '', '/?intake=1');
    // eslint-disable-next-line no-eval
    (0, eval)(queueSource);

    const message = window.HEYS.TrialQueue.buildTrialIntakeInviteMessage({
      pin: '4016',
      intakeUrl: 'https://app.heyslab.ru/?intake=1',
    });
    const link = message.match(/https:\/\/[^\s]+/)?.[0];

    expect(link).toBe('https://app.heyslab.ru/?intake=1');
    expect(link).not.toMatch(/client|phone|token|pin|health/i);
    expect(message).toContain('Не отправляйте сведения о здоровье в мессенджере');
    expect(sql).toContain('expires_at > NOW()');
    expect(sql).toContain('revoked_at IS NULL');
  });

  it('autosaves only to the session RPC and keeps answers out of browser storage', () => {
    expect(intakeSource).toContain("rpc('save_trial_intake_by_session'");
    expect(intakeSource).toContain('setTimeout(async () =>');
    expect(intakeSource).toContain('p_complete: !!complete');
    expect(intakeSource).not.toContain('localStorage');
    expect(intakeSource).not.toContain('sessionStorage');
    expect(intakeSource).not.toContain('ym(');
  });

  it('registers client and curator functions in the RPC boundary', () => {
    for (const fn of [
      'get_trial_intake_by_session',
      'save_trial_intake_by_session',
      'admin_get_trial_intake_summaries',
      'admin_get_trial_intake',
      'admin_review_trial_intake',
    ]) {
      expect(rpcSource).toContain(`'${fn}'`);
    }
    expect(queueSource).toContain('Пригласить к анкете');
    expect(queueSource).toContain('Готово к разбору');
    expect(queueSource).toContain("submitIntakeReview('approved')");
  });

  it('logs PIN-client consent through the session-bound RPC with server-owned IP and UA', async () => {
    const logConsentsBySession = vi.fn().mockResolvedValue({
      data: { log_consents_by_session: { success: true } },
      error: null,
    });
    const logConsents = vi.fn();
    window.React = {};
    window.HEYS = {
      cloud: { isPinAuthClient: () => true },
      YandexAPI: { logConsentsBySession, logConsents },
    };
    // eslint-disable-next-line no-eval
    (0, eval)(consentsSource);

    const result = await window.HEYS.Consents.api.logConsents('forged-client-id', [
      { type: 'health_data', version: '1.5', granted: true, signature_method: 'checkbox' },
    ]);

    expect(result.success).toBe(true);
    expect(logConsentsBySession).toHaveBeenCalledOnce();
    expect(logConsents).not.toHaveBeenCalled();
    expect(rpcSource).toContain("fnName === 'log_consents_by_session'");
    expect(rpcSource).toContain('params.p_ip = clientIp || null');
  });

  it('removes direct client-id consent RPCs and revokes health data atomically by session', async () => {
    for (const unsafeFn of [
      'log_consents',
      'check_required_consents',
      'revoke_consent',
      'get_client_consents',
      'purge_health_data',
    ]) {
      expect(allowedRpcSource).not.toContain(`'${unsafeFn}'`);
    }

    const revokeConsentBySession = vi.fn().mockResolvedValue({
      data: { revoke_consent_by_session: { success: true, deleted_keys: 3 } },
      error: null,
    });
    window.React = {};
    window.HEYS = { YandexAPI: { revokeConsentBySession } };
    // eslint-disable-next-line no-eval
    (0, eval)(consentsSource);

    const result = await window.HEYS.Consents.api.revokeHealthDataAndPurge('forged-client-id');
    expect(result).toEqual({ success: true, deleted_keys: 3 });
    expect(revokeConsentBySession).toHaveBeenCalledWith('health_data');

    const revokeFn = sqlFunction('revoke_consent_by_session', 'admin_convert_lead');
    expect(revokeFn).toContain('v_client_id := public.require_client_id(p_session_token)');
    expect(revokeFn).toContain('AND public.is_health_key(k)');
    expect(revokeFn).toContain("p_consent_type IN ('health_data', 'personal_data')");
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.purge_health_data(UUID) FROM PUBLIC, heys_rpc');
  });

  it('restores the server draft after reload and autosaves edits without browser storage', async () => {
    const rpc = vi.fn(async (fn, params) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 2, answers: completedAnswers },
        } } };
      }
      return { data: { save_trial_intake_by_session: {
        success: true, status: 'in_progress', current_step: params.p_current_step,
      } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    window.scrollTo = vi.fn();
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    await screen.findByText('Шаг 3 из 6');
    expect(screen.getByDisplayValue('Рабочий день')).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue('Рабочий день'), {
      target: { value: 'Работа по сменам' },
    });
    await waitFor(() => {
      expect(rpc.mock.calls.some(([fn, params]) => (
        fn === 'save_trial_intake_by_session'
        && params.p_answers.lifestyle.schedule === 'Работа по сменам'
        && params.p_complete === false
      ))).toBe(true);
    }, { timeout: 1800 });
  });

  it('completes the questionnaire only through the server RPC', async () => {
    const rpc = vi.fn(async (fn, params) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 5, answers: completedAnswers },
        } } };
      }
      return { data: { save_trial_intake_by_session: {
        success: true,
        status: params.p_complete ? 'completed' : 'in_progress',
        current_step: params.p_current_step,
      } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    const submit = await screen.findByRole('button', { name: 'Отправить куратору' });
    await act(async () => fireEvent.click(submit));

    await screen.findByText('Анкета отправлена');
    expect(rpc.mock.calls.some(([fn, params]) => (
      fn === 'save_trial_intake_by_session' && params.p_complete === true
    ))).toBe(true);
  });

  it('summarizes the goal and safety flags before raw curator details', () => {
    window.React = {};
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(queueSource);
    const summary = window.HEYS.TrialQueue.summarizeIntakeAnswers({
      goals: { primary_goal: 'Удерживать режим' },
      safety: { acute_symptoms: true, recent_surgery: false, medical_supervision: true },
    });

    expect(summary.goal).toBe('Удерживать режим');
    expect(summary.safetyFlags).toEqual([
      'Острые симптомы или резкое ухудшение',
      'Состояние под наблюдением врача',
    ]);
    expect(queueSource).toContain("React.createElement('details'");
    expect(queueSource).toContain('Все ответы анкеты');
  });
});
