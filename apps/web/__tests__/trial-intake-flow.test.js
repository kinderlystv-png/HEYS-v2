import fs from 'fs';
import path from 'path';

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const repoDir = path.resolve(webDir, '../..');
const sql = fs.readFileSync(path.join(repoDir, 'database/2026-07-27_trial_intake_flow.sql'), 'utf8');
const v2Sql = fs.readFileSync(path.join(repoDir, 'database/2026-07-27_trial_intake_flow_v2.sql'), 'utf8');
const v3Sql = fs.readFileSync(path.join(repoDir, 'scripts/db/migrations/2026-07-29_trial_intake_preclient_v3.sql'), 'utf8');
const correctionsV1Sql = fs.readFileSync(path.join(repoDir, 'scripts/db/migrations/2026-07-30_trial_candidate_answer_corrections_v1.sql'), 'utf8');
const healthMinimizationSql = fs.readFileSync(path.join(repoDir, 'scripts/db/migrations/2026-08-11_health_minimization_intake_v1.sql'), 'utf8');
const purgeIncompleteCandidatesSql = fs.readFileSync(
  path.join(repoDir, 'scripts/db/migrations/2026-08-12_purge_incomplete_trial_candidates_v1.sql'),
  'utf8',
);
const onetimePinSql = fs.readFileSync(
  path.join(repoDir, 'scripts/db/migrations/2026-08-13_trial_candidate_onetime_pin_v1.sql'),
  'utf8',
);
const intakeSource = fs.readFileSync(path.join(webDir, 'heys_trial_intake_v1.js'), 'utf8');
const queueSource = fs.readFileSync(path.join(webDir, 'heys_trial_queue_v1.js'), 'utf8');
const yandexApiSource = fs.readFileSync(path.join(webDir, 'heys_yandex_api_v1.js'), 'utf8');
const rpcSource = fs.readFileSync(path.join(repoDir, 'yandex-cloud-functions/heys-api-rpc/index.js'), 'utf8');
const maintenanceSource = fs.readFileSync(path.join(repoDir, 'yandex-cloud-functions/heys-maintenance/index.js'), 'utf8');
const landingSource = fs.readFileSync(path.join(repoDir, 'apps/landing/src/components/TrialForm.tsx'), 'utf8');
const consentsSource = fs.readFileSync(path.join(webDir, 'heys_consents_v1.js'), 'utf8');
const appOverlaysSource = fs.readFileSync(path.join(webDir, 'heys_app_overlays_v1.js'), 'utf8');
const appGateFlowSource = fs.readFileSync(path.join(webDir, 'heys_app_gate_flow_v1.js'), 'utf8');
const allowedRpcSource = rpcSource.slice(
  rpcSource.indexOf('const ALLOWED_FUNCTIONS = ['),
  rpcSource.indexOf('const COOKIE_SESSION_TOKEN_FUNCTIONS'),
);
const curatorRpcSource = rpcSource.slice(
  rpcSource.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
  rpcSource.indexOf('// === P1-B: Curator audit middleware'),
);
const curatorWebSource = yandexApiSource.slice(
  yandexApiSource.indexOf('const CURATOR_ONLY_FUNCTIONS = ['),
  yandexApiSource.indexOf('/**\n   * RPC вызов'),
);

const completedAnswers = {
  goals: { primary_goal: 'Наладить регулярное питание', success_definition: 'Стабильный режим' },
  experience: { previous_experience: 'self' },
  lifestyle: { schedule: 'Рабочий день', sleep: 'Около восьми часов' },
  collaboration: { daily_tracking: 'yes', feedback_style: 'concise' },
  warning: {
    acknowledged_at: '2026-08-11T10:00:00.000Z',
    text_version: 'pending-owner-text',
  },
  meta: { schema_version: '1.2' },
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

  it('removes a legacy queue item through the current production queue RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { admin_remove_from_queue: { success: true } },
    });
    window.HEYS = {
      YandexAPI: { rpc },
      auth: { isCuratorSession: () => true },
    };
    window.React = React;
    window.eval(queueSource);

    await expect(window.HEYS.TrialQueue.admin.removeFromQueue('client-1', 'stale_test')).resolves.toEqual({
      success: true,
    });
    expect(rpc).toHaveBeenCalledWith('admin_remove_from_queue', {
      p_client_id: 'client-1',
      p_reason: 'stale_test',
    });
    expect(queueSource).toContain("adminAPI.removeFromQueue(clientId, reason || 'rejected_by_curator')");
  });

  it('keeps the landing payload minimal and consent-specific', () => {
    const payload = landingSource.slice(
      landingSource.indexOf('body: JSON.stringify({'),
      landingSource.indexOf('marketing_consent:') + 220,
    );

    expect(payload).toContain('name: name.trim()');
    expect(payload).toContain("phone: '7' + phoneDigits");
    expect(payload).toContain('messenger');
    expect(payload).toContain('birth_year');
    expect(payload).toContain('...utmParams');
    expect(payload).toContain('privacy_version');
    expect(payload).toContain('marketing_consent:');
    expect(payload).not.toContain('accepted_at: new Date');
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
    expect(intakeSource).toContain("'save_trial_intake_by_session'");
    expect(intakeSource).toContain("'save_trial_candidate_intake_by_candidate_session'");
    expect(intakeSource).toContain('setTimeout(async () =>');
    expect(intakeSource).toContain('p_complete: !!complete');
    expect(intakeSource).not.toContain('localStorage');
    expect(intakeSource).not.toContain('sessionStorage');
    expect(intakeSource).not.toContain('ym(');
  });

  it('keeps candidates accountless until an explicit curator approval', () => {
    const prepareStart = v3Sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_prepare_trial_candidate_from_lead');
    const prepareEnd = v3Sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_mark_trial_candidate_invite_sent', prepareStart);
    const prepare = v3Sql.slice(prepareStart, prepareEnd);
    const reviewStart = v3Sql.indexOf('CREATE OR REPLACE FUNCTION public.admin_review_trial_candidate_v3');
    const reviewEnd = v3Sql.indexOf('-- Server-side ownership filter', reviewStart);
    const review = v3Sql.slice(reviewStart, reviewEnd);

    expect(prepare).toContain('INSERT INTO public.trial_candidates');
    expect(prepare).not.toContain('INSERT INTO public.clients');
    expect(prepare).not.toContain('INSERT INTO public.client_sessions');
    expect(prepare).not.toContain('INSERT INTO public.trial_queue');
    expect(review).toContain("IF p_action = 'approved' THEN");
    expect(review).toContain('public.admin_convert_lead');
    expect(review).toContain("status = 'promoted'");
    expect(v3Sql).toContain("status = 'active'");
    expect(intakeSource).toContain("meta: { schema_version: '1.2' }");
    expect(intakeSource).not.toContain('accept_trial_candidate_health_consent_by_candidate_session');
    expect(v3Sql).toContain('admin_get_trial_candidate_summaries');
    expect(v3Sql).toContain("l.status <> 'contacted' OR l.curator_id = p_curator_id");
  });

  it('reloads the browser after candidate login without using the Node global', () => {
    expect(appGateFlowSource).toContain('window.location.reload()');
    expect(appGateFlowSource).not.toContain('global.location.reload()');
  });

  it('renders the route-level intake without competing app overlays', () => {
    expect(appOverlaysSource).toContain("['trial-intake', 'subscription-loading', 'subscription-waiting']");
    expect(appOverlaysSource).toContain('.includes(consentGate?.key)');
    expect(appOverlaysSource).toContain('if (isRouteLevelGate)');
    expect(appOverlaysSource).toContain('return consentGate;');
  });

  it('keeps encrypted trial RPC calls in the same PgBouncer transaction as SET LOCAL', () => {
    expect(rpcSource).toContain('TRANSACTION_SCOPED_ENCRYPTION_FUNCTIONS');
    expect(rpcSource).toContain("'save_trial_intake_by_session'");
    expect(rpcSource).toContain("'admin_get_trial_intake'");
    expect(rpcSource).toContain("SELECT set_config('heys.encryption_key', $1, true)");
    expect(rpcSource).toContain('transactionScopedEncryptionTxStarted');
  });

  it('registers client and curator functions in the RPC boundary', () => {
    for (const fn of [
      'get_trial_intake_by_session',
      'save_trial_intake_by_session',
      'admin_get_trial_intake_summaries',
      'admin_get_trial_intake',
      'admin_review_trial_intake_v2',
      'admin_mark_trial_intake_invite_sent',
      'admin_prepare_trial_candidate_from_lead',
      'admin_reopen_trial_candidate',
      'verify_trial_candidate_pin',
      'get_trial_candidate_intake_by_candidate_session',
      'save_trial_candidate_intake_by_candidate_session',
      'admin_get_trial_candidate_summaries',
      'admin_get_trial_candidate',
      'admin_review_trial_candidate_v3',
      'admin_regenerate_trial_candidate_pin',
    ]) {
      expect(rpcSource).toContain(`'${fn}'`);
      if (fn.startsWith('admin_')) expect(yandexApiSource).toContain(`'${fn}'`);
    }
    expect(queueSource).toContain('Создать приглашение');
    expect(queueSource).toContain("item.subject_type === 'candidate'");
    expect(queueSource).toContain('filterActionableLeads(leads, curatorId, candidateItems)');
    expect(queueSource).toContain('Готово к разбору');
    expect(queueSource).toContain('Зафиксировать решение');
  });

  it('keeps claimed leads actionable only for their assigned curator', () => {
    window.React = {};
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(queueSource);

    const leads = [
      { id: 'new', status: 'new', curator_id: null },
      { id: 'owned', status: 'contacted', curator_id: 'CURATOR-A' },
      { id: 'foreign', status: 'contacted', curator_id: 'curator-b' },
      { id: 'rejected', status: 'rejected', curator_id: 'curator-a' },
    ];
    const intakes = [
      { subject_type: 'candidate', lead_id: 'new' },
      { subject_type: 'client', lead_id: 'owned' },
    ];
    const filterActionableLeads = window.HEYS.TrialQueue.filterActionableLeads;

    expect(filterActionableLeads(leads, 'curator-a').map((lead) => lead.id)).toEqual(['new', 'owned']);
    expect(filterActionableLeads(leads, null).map((lead) => lead.id)).toEqual(['new']);
    expect(filterActionableLeads(leads, 'curator-a', intakes).map((lead) => lead.id)).toEqual(['owned']);
    const badgeStart = queueSource.indexOf('function NewLeadsBadge');
    const badgeEnd = queueSource.indexOf('function filterActionableLeads', badgeStart);
    const badgeSource = queueSource.slice(badgeStart, badgeEnd);
    expect(badgeSource).toContain("adminAPI.getLeads('all')");
    expect(badgeSource).toContain('adminAPI.getIntakeSummaries()');
    expect(badgeSource).toContain("window.addEventListener('heys:clients-updated', handleQueueUpdate)");
    expect(appGateFlowSource).toMatch(
      /HEYS\.TrialQueue\.NewLeadsBadge,[\s\S]{0,160}\{ curatorId: cloudUser\?\.id \}/
    );
  });

  it('adds explicit invite, clarification and waiting-slot states without a second auth path', () => {
    expect(v2Sql).toContain("'invite_prepared', 'invite_sent'");
    expect(v2Sql).toContain("'approved_waiting_slot'");
    expect(v2Sql).toContain('clarification_request_encrypted BYTEA');
    expect(v2Sql).toContain('clarification_sections TEXT[]');
    expect(v2Sql).toContain('admin_mark_trial_intake_invite_sent');
    expect(v2Sql).toContain('admin_review_trial_intake_v2');
    expect(v2Sql).toContain('admin_reopen_trial_candidate');
    expect(v2Sql).toContain("token_hash = digest(p_session_token, 'sha256')");
    expect(v2Sql).not.toContain('candidate_sessions');
    expect(v2Sql).not.toContain('automatic_reject');
    expect(queueSource).toContain('resumePreparedInvite');
    expect(queueSource).toContain("['invite_prepared', 'invited', 'invite_sent'].includes(intake.status)");
    expect(queueSource).toContain('Открыть приглашение');
  });

  it('requires warning acknowledgement for schema 1.2 and keeps legacy 1.1 validation', () => {
    expect(v2Sql).toContain("COALESCE(p_answers #>> '{safety,acute_symptoms}', '') = ''");
    expect(healthMinimizationSql).toContain("v_schema_version NOT IN ('1.0', '1.1', '1.2')");
    expect(healthMinimizationSql).toContain("BTRIM(COALESCE(p_answers #>> '{warning,acknowledged_at}', '')) = ''");
    expect(healthMinimizationSql).toContain("BTRIM(COALESCE(p_answers #>> '{warning,text_version}', '')) = ''");
    expect(healthMinimizationSql).toContain("p_current_step > 4");
    expect(healthMinimizationSql).not.toContain('health_consent_required');
    expect(intakeSource).toContain('WARNING_TEXT_VERSION');
    expect(intakeSource).toContain('тренировочной части');
    expect(intakeSource).toContain('Мне 18 лет или больше');
    expect(intakeSource).not.toContain('ConditionalHealthField');
    expect(intakeSource).not.toContain('function CheckField');
  });

  it('keeps legacy client clarification encrypted without exposing it in the new curator decision UI', () => {
    const reviewStart = v2Sql.indexOf('CREATE FUNCTION public.admin_review_trial_intake_v2');
    const reviewEnd = v2Sql.indexOf('CREATE OR REPLACE FUNCTION public.purge_expired_trial_intakes', reviewStart);
    const reviewFn = v2Sql.slice(reviewStart, reviewEnd);

    expect(reviewFn).toContain('p_client_message TEXT');
    expect(reviewFn).toContain('p_clarification_sections TEXT[]');
    expect(reviewFn).toContain('clarification_request_encrypted');
    expect(reviewFn).toContain('review_note_encrypted');
    expect(intakeSource).toContain('clarification_request');
    expect(intakeSource).toContain('Перейти к нужному разделу');
    expect(queueSource).not.toContain('Вопрос клиенту');
    expect(v2Sql).toContain("WHEN v_status = 'needs_clarification' THEN 'needs_clarification'");
  });

  it('uses a single curator decision CTA and treats capacity as waiting, not rejection', () => {
    expect(queueSource).toContain('Зафиксировать решение');
    expect(queueSource).toContain('Сохранить решение');
    expect(queueSource).toContain('approved_waiting_slot');
    expect(queueSource).not.toContain("submitIntakeReview('approved')");
    const v2ReviewStart = v2Sql.indexOf('CREATE FUNCTION public.admin_review_trial_intake_v2');
    const v2ReviewEnd = v2Sql.indexOf('CREATE OR REPLACE FUNCTION public.purge_expired_trial_intakes', v2ReviewStart);
    const v2Review = v2Sql.slice(v2ReviewStart, v2ReviewEnd);
    expect(v2Review).not.toContain("'no_capacity'");
    expect(v2Review).toContain('decision_checklist_required');
  });

  it('purges abandoned drafts after 30 days and reopens rejected candidates explicitly', () => {
    expect(v2Sql).toContain("'invite_prepared', 'invite_sent', 'invited'");
    expect(v2Sql).toContain("NOW() - INTERVAL '30 days'");
    expect(v2Sql).toContain("'reapply_cooldown'");
    expect(v2Sql).toContain("status = 'invite_prepared'");
    expect(v2Sql).toContain('answers_encrypted = NULL');
    expect(v2Sql).toContain('UPDATE public.client_sessions');
    expect(v2Sql).toContain("source = 'trial_intake_purged'");
    expect(v2Sql).toContain("'intake_status', 'purged'");
    expect(v2Sql).toContain('FOR UPDATE;');
    expect(v2Sql).toContain("'reopen_trial_candidate'");
  });

  it('consumes candidate invite PIN after first successful login', () => {
    expect(onetimePinSql).toContain('ADD COLUMN IF NOT EXISTS pin_consumed_at');
    expect(onetimePinSql).toContain('ADD COLUMN IF NOT EXISTS pin_expires_at');
    expect(onetimePinSql).toContain("'onetime_pin_consumed'");
    expect(onetimePinSql).toContain("'onetime_pin_expired'");
    expect(onetimePinSql).toContain('pin_consumed_at = NOW()');
    expect(onetimePinSql).toContain("pin_expires_at = NOW() + INTERVAL '3 days'");
    expect(onetimePinSql).toContain('pin_consumed_at = NULL, pin_expires_at = NULL');
  });

  it('purges incomplete trial_candidates after 30 days of inactivity', () => {
    expect(purgeIncompleteCandidatesSql).toContain('CREATE OR REPLACE FUNCTION public.purge_expired_trial_candidates');
    expect(purgeIncompleteCandidatesSql).toContain("'invite_prepared', 'invite_sent', 'in_progress', 'needs_clarification'");
    expect(purgeIncompleteCandidatesSql).toContain("NOW() - INTERVAL '30 days'");
    expect(purgeIncompleteCandidatesSql).toContain('updated_at, started_at, invite_sent_at, invite_prepared_at, created_at');
    expect(purgeIncompleteCandidatesSql).toContain('reviewed_at, updated_at, started_at');
    expect(purgeIncompleteCandidatesSql).toContain("status IN ('rejected', 'expired')");
    expect(maintenanceSource).toContain('purge_expired_trial_candidates');
    expect(intakeSource).toContain('Черновик ждёт 30 дней без активности');
    expect(intakeSource).toContain('одноразовому коду');
    expect(intakeSource).toContain('closeConfirmOpen');
    expect(intakeSource).toContain('resumeGateOpen');
  });

  it('fails closed on stale tabs, partial curator data and retired shortcuts', () => {
    expect(v2Sql).toContain('p_expected_updated_at TIMESTAMPTZ');
    expect(v2Sql).toContain("'stale_draft'");
    expect(v2Sql).toContain("'stale_intake'");
    expect(v2Sql).toContain('admin_prepare_trial_candidate_from_lead');
    expect(v2Sql).toContain('REVOKE EXECUTE ON FUNCTION public.admin_convert_lead(UUID, UUID) FROM PUBLIC');
    expect(v2Sql).toContain("source IN ('trial_intake_purged', 'trial_intake_health_revoked')");
    expect(v2Sql).toContain("'trial_intake_health_revoked'");
    expect(intakeSource).toContain('p_expected_updated_at: expectedUpdatedAt || null');
    expect(intakeSource).toContain('Повторить сохранение');
    expect(queueSource).toContain('setIntakesReady(false)');
    expect(queueSource).toContain('Действия временно заблокированы');
    expect(queueSource).toContain('expectedUpdatedAt: intakeDialog.updated_at');
    expect(queueSource).toContain('allowRemove: false');
    expect(rpcSource).toContain("'Cache-Control': 'no-store'");
    expect(curatorRpcSource).toContain("'admin_prepare_trial_candidate_from_lead'");
    expect(curatorWebSource).toContain("'admin_prepare_trial_candidate_from_lead'");
    expect(curatorRpcSource).not.toContain("'admin_convert_lead'");
    expect(curatorWebSource).not.toContain("'admin_convert_lead'");
  });

  it('shows one owner-aware next action and keeps trial activation out of intake review', () => {
    expect(queueSource).toContain('Действие куратора: отправить приглашение');
    expect(queueSource).toContain('Ожидаем завершение анкеты кандидатом');
    expect(queueSource).toContain('Действие куратора: разобрать анкету');
    expect(queueSource).toContain('Ожидаем свободное место');
    expect(queueSource).not.toContain("intakeStatus === 'approved_waiting_slot' && freeSlots <= 0");
    expect(queueSource).not.toContain('Назначить дату старта');
    expect(queueSource).not.toContain('trialActivationDialog');
    expect(queueSource).toContain('Решение завершено · удаление анкеты через 30 дней');
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
    await screen.findByText('Шаг 3 из 5');
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

  it('hides past-experience questions for a first attempt and clears their values', async () => {
    const answers = {
      ...completedAnswers,
      experience: {
        previous_experience: 'self',
        what_worked: 'Планирование',
        what_did_not_work: 'Сложные правила',
      },
    };
    const rpc = vi.fn(async (fn, params) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 1, answers },
        } } };
      }
      return { data: { save_trial_intake_by_session: {
        success: true, status: 'in_progress', current_step: params.p_current_step,
      } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    const experience = await screen.findByRole('combobox', { name: /Был ли опыт изменения питания/ });
    expect(screen.getByDisplayValue('Планирование')).toBeTruthy();
    expect(screen.getByDisplayValue('Сложные правила')).toBeTruthy();

    fireEvent.change(experience, { target: { value: 'none' } });
    expect(screen.queryByText('Что раньше работало хорошо?')).toBeNull();
    expect(screen.queryByText('Что не подошло или оказалось трудно поддерживать?')).toBeNull();
    await waitFor(() => {
      expect(rpc.mock.calls.some(([fn, params]) => (
        fn === 'save_trial_intake_by_session'
        && params.p_answers.experience.previous_experience === 'none'
        && params.p_answers.experience.what_worked === ''
        && params.p_answers.experience.what_did_not_work === ''
      ))).toBe(true);
    }, { timeout: 1800 });
  });

  it('requires warning confirmation on the final step before submit', async () => {
    const answers = {
      ...completedAnswers,
      warning: { acknowledged_at: '', text_version: '' },
    };
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 4, answers },
        } } };
      }
      return { data: { save_trial_intake_by_session: { success: true, status: 'in_progress' } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    // Канвас questionnaire.v4, строка «место»: сводка уехала на отдельный
    // экран, а на шаге 5 от неё осталась строка-вход. Проверка была написана
    // под старое МЕСТО экрана (сводка внутри шага 5) — само поведение
    // «без галочки отправить нельзя» ниже проверяется как раньше, уже на том
    // экране, где сводка теперь живёт.
    expect(await screen.findByText('Проверьте ответы перед отправкой')).toBeTruthy();
    expect(screen.getByText('Поставьте галочку выше')).toBeTruthy();

    fireEvent.click(screen.getByText('Проверьте ответы перед отправкой'));
    expect(screen.getByText('Ваши ответы')).toBeTruthy();
    expect(screen.getByText('Вернитесь к шагу 5 и подтвердите предупреждение')).toBeTruthy();
    const submit = screen.getByRole('button', { name: /Отправить куратору/ });
    expect(submit.disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Назад к шагу 5' }));
    expect(screen.getByText('Шаг 5 из 5')).toBeTruthy();
  });

  it('shows a visible final review with warning confirmation and edit action', async () => {
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 4, answers: completedAnswers },
        } } };
      }
      return { data: { save_trial_intake_by_session: { success: true, status: 'in_progress' } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    // Та же причина правки, что и выше: сводка — отдельный экран (строка
    // «место»), вход в неё — строка на полке шага 5, отметка о подтверждении
    // осталась на полке рядом с ней (кадр «Анкета · шаг 5 · подтверждено»).
    expect(await screen.findByText('Проверьте ответы перед отправкой')).toBeTruthy();
    expect(screen.getByText('Предупреждение подтверждено')).toBeTruthy();

    fireEvent.click(screen.getByText('Проверьте ответы перед отправкой'));
    expect(screen.getByText('Ваши ответы')).toBeTruthy();
    // Содержимое сводки видно именно здесь, а не обрезано полкой шага 5.
    expect(screen.getByText('Главная цель')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Отправить куратору/ }).disabled).toBe(false);

    // «Правки» уводят к первому шагу, стрелка назад — обратно на шаг 5.
    fireEvent.click(screen.getByRole('button', { name: 'Правки' }));
    expect(screen.getByText('Шаг 1 из 5')).toBeTruthy();
  });

  // Стык, который руками не собрать: сводка стала отдельным экраном (канвас
  // questionnaire.v4, строка «место»), и возврат с неё не должен ни терять
  // несохранённый ответ, ни оставлять строку-вход на чужих шагах.
  it('returns from the standalone review without losing an unsaved answer', async () => {
    const answers = {
      ...completedAnswers,
      collaboration: { ...completedAnswers.collaboration, expectations_from_curator: '' },
    };
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 3, answers },
        } } };
      }
      return { data: { save_trial_intake_by_session: { success: true, status: 'in_progress' } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    // Экран возврата («Продолжим с шага 4») стоит поверх шага — снимаем его.
    await screen.findByText('Продолжим с шага 4');
    fireEvent.click(screen.getAllByRole('button', { name: 'Продолжить' })[0]);

    const expectations = screen.getByLabelText(/Чего вы ждёте от куратора/);
    // Шаг 4 — не последний: строки-входа в сводку здесь быть не должно.
    expect(screen.queryByText('Проверьте ответы перед отправкой')).toBeNull();
    fireEvent.change(expectations, { target: { value: 'Разбор ужинов' } });

    fireEvent.click(screen.getByRole('button', { name: /Продолжить/ }));
    await screen.findByText('Шаг 5 из 5');

    fireEvent.click(screen.getByText('Проверьте ответы перед отправкой'));
    expect(screen.getByText('Разбор ужинов')).toBeTruthy();
    expect(screen.getByText('Чего ждёте от куратора')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Назад к шагу 5' }));
    expect(screen.getByText('Шаг 5 из 5')).toBeTruthy();
    expect(screen.getByText('Важная информация')).toBeTruthy();

    // Ответ, набранный до захода в сводку, на месте после возврата на шаг 4.
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByDisplayValue('Разбор ужинов')).toBeTruthy();
  });

  it('uses the real sharing action, one autosave status and the supported unsure option', () => {
    const withoutWarning = intakeSource.replace(
      /const WARNING_TEXT_PARAGRAPHS[\s\S]*?const WARNING_CHECKBOX_LABEL =[\s\S]*?;/,
      '',
    );
    expect(withoutWarning).not.toMatch(/дневник/i);
    expect(intakeSource).toContain('фото, текст или голосовые сообщения');
    expect(intakeSource).toContain('фото или короткие сообщения');
    expect(intakeSource.match(/Сохраняем…/g)).toHaveLength(1);
    expect(intakeSource).not.toContain('first_attempt_challenge');
    expect(intakeSource).toContain("['unsure', 'Пока не уверен']");
    expect(correctionsV1Sql).toContain("'', 'yes', 'mostly', 'no', 'unsure'");
    expect(queueSource).toContain("value === 'unsure' && section === 'collaboration' && key === 'daily_tracking'");
  });

  it('keeps clarification personal and stores curator corrections beside immutable original answers', () => {
    expect(queueSource).toContain("const fn = candidate ? 'admin_review_trial_candidate_v4'");
    expect(queueSource).toContain("const fn = 'admin_add_trial_candidate_answer_correction_v1'");
    expect(queueSource).toContain('Одобрить и создать клиента');
    expect(queueSource).toContain('Отказать в текущем формате');
    expect(queueSource).toContain('Ответ кандидата:');
    expect(queueSource).toContain('Уточнение со слов кандидата');
    expect(queueSource).toContain('Фактор здоровья или безопасности обсуждён отдельно');
    expect(queueSource).toContain('Клиент подтвердил предупреждение перед анкетой; формат сопровождения обсуждается на пробной неделе');
    expect(queueSource).toContain('client_id: clientId');
    expect(correctionsV1Sql).toContain("p_action NOT IN ('approved', 'rejected')");
    expect(correctionsV1Sql).toContain("'original_answers', v_original, 'answer_corrections', v_history");
    expect(correctionsV1Sql).toContain('answers_encrypted = public.encrypt_health_data(v_effective)');
    expect(correctionsV1Sql).toContain('UNIQUE (candidate_id, request_id)');
    for (const source of [curatorRpcSource, curatorWebSource]) {
      expect(source).toContain("'admin_review_trial_candidate_v4'");
      expect(source).toContain("'admin_add_trial_candidate_answer_correction_v1'");
    }
    expect(rpcSource).toContain("'p_new_value': '::jsonb'");
  });

  it('does not advance after a failed save and offers a clear retry', async () => {
    const rpc = vi.fn(async (fn) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: {
            status: 'in_progress', current_step: 0,
            answers: completedAnswers, updated_at: '2026-07-27T10:00:00.000Z',
          },
        } } };
      }
      return { data: { save_trial_intake_by_session: {
        success: false, error: 'request_failed',
      } } };
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    window.scrollTo = vi.fn();
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    await screen.findByText('Шаг 1 из 5');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Продолжить' })));

    expect(screen.getByText('Шаг 1 из 5')).toBeTruthy();
    expect(screen.getByText('Не удалось сохранить изменения. Проверьте интернет и повторите.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Повторить сохранение' })).toBeTruthy();
  });

  it('keeps a prepared invite read-only until the curator marks it sent', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { get_trial_intake_by_session: {
        success: true,
        intake: { status: 'invite_prepared', current_step: 0, answers: {}, updated_at: '2026-07-27T10:00:00.000Z' },
      } },
    });
    window.React = React;
    window.HEYS = { YandexAPI: { rpc } };
    // eslint-disable-next-line no-eval
    (0, eval)(intakeSource);

    render(React.createElement(window.HEYS.TrialIntake.ClientScreen));
    await screen.findByText('Приглашение ещё не отправлено');
    expect(screen.queryByRole('button', { name: 'Продолжить' })).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('completes the questionnaire only through the server RPC', async () => {
    const rpc = vi.fn(async (fn, params) => {
      if (fn === 'get_trial_intake_by_session') {
        return { data: { get_trial_intake_by_session: {
          success: true,
          intake: { status: 'in_progress', current_step: 4, answers: completedAnswers },
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

  it('summarizes the goal without legacy safety factors', () => {
    window.React = {};
    window.HEYS = {};
    // eslint-disable-next-line no-eval
    (0, eval)(queueSource);
    const summary = window.HEYS.TrialQueue.summarizeIntakeAnswers({
      goals: { primary_goal: 'Удерживать режим' },
      warning: {
        acknowledged_at: '2026-08-11T10:00:00.000Z',
        text_version: 'pending-owner-text',
      },
    });

    expect(summary.goal).toBe('Удерживать режим');
    expect(summary.safetyFlags).toEqual([]);
    expect(summary.safetyFactors).toEqual([]);
    expect(window.HEYS.TrialQueue.getIntakeAnswerAttention({
      warning: { acknowledged_at: '2026-08-11T10:00:00.000Z' },
    }, 'warning', 'acknowledged_at')).toBeNull();
    expect(queueSource).toContain("React.createElement('details'");
    expect(queueSource).toContain('Все ответы анкеты');
    expect(queueSource).toContain('Факторов, требующих отдельного уточнения, не отмечено.');
    expect(queueSource).toContain('Показать в ответах');
    expect(queueSource).toContain('trial-intake-answer-${section}-${key}');
    expect(queueSource).not.toContain("section === 'safety' && value === true");
  });
});
