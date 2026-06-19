import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const stepModalSource = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const profileStepSource = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const morningCheckinSource = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const userTabSource = fs.readFileSync(path.resolve(__dirname, '../heys_user_tab_impl_v1.js'), 'utf8');
const legacyUserSource = fs.readFileSync(path.resolve(__dirname, '../heys_user_v12.js'), 'utf8');

describe('first login onboarding guardrails', () => {
  it('waits for async step saves before moving forward', () => {
    expect(stepModalSource).toContain('await result');
    expect(stepModalSource).toContain('await saveStepConfig');
    expect(stepModalSource).toContain('await completionResult');
    expect(stepModalSource).toContain('Сохраняю...');
    expect(profileStepSource).toContain('return syncCurrentClientName(fullName,');
    expect(profileStepSource).toContain('profile_sync_timeout');
    expect(profileStepSource).toContain('return HEYS.cloud.flushPendingQueue(10000)');
    expect(morningCheckinSource).toContain('checkin_sync_timeout');
  });

  it('does not allow first-login check-in skip or close-through', () => {
    expect(profileStepSource).not.toContain('Пока пропустить и ознакомиться с приложением');
    expect(profileStepSource).not.toContain('heys_morning_checkin_done');
    expect(morningCheckinSource).toContain('Завершите первый вход');
    expect(morningCheckinSource).toContain('обязательный чек-ин');
  });
});

describe('first login profile identity', () => {
  it('collects first and last name separately and syncs full name to curator clients', () => {
    expect(profileStepSource).toContain('Имя *');
    expect(profileStepSource).toContain('Фамилия');
    expect(profileStepSource).toContain('const lastName = profile.lastName || pendingNameParts.lastName ||');
    expect(profileStepSource).toContain('profile.lastName = lastName');
    expect(profileStepSource).toContain('profile.displayName = fullName');
    expect(profileStepSource).toContain('p_name: cleanName');
    expect(profileStepSource).toContain("syncCurrentClientName(fullName, 'profile-personal', { syncCloud: true })");
    expect(profileStepSource).toContain("syncCurrentClientName(fullName, 'profile-wizard', { syncCloud: true })");
    expect(profileStepSource).toContain('name: fullName');
    expect(userTabSource).toContain('HEYS.utils.buildFullName');
    expect(legacyUserSource).toContain('HEYS.utils.buildFullName');
  });
});
