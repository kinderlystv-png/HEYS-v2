import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');

describe('morning check-in stability', () => {
  it('freezes visible step configs before save-driven shouldShow changes can shift indexes', () => {
    expect(STEP_MODAL_SRC).toContain('const computedVisibleStepConfigs = useMemo');
    expect(STEP_MODAL_SRC).toContain('frozenVisibleStepConfigsRef');
    expect(STEP_MODAL_SRC).toContain('const visibleStepConfigs = freezeVisibleSteps');
    expect(STEP_MODAL_SRC).toContain('goToStep(currentStepIndex + 1');
    expect(MORNING_SRC).toContain('freezeVisibleSteps: true');
  });

  it('exposes strict StepModal options used by the morning flow', () => {
    expect(STEP_MODAL_SRC).toContain('freezeVisibleSteps = false');
    expect(STEP_MODAL_SRC).toContain("options.closeOnComplete === 'after'");
    expect(STEP_MODAL_SRC).toContain('onStepSaved');
    expect(MORNING_SRC).toContain('freezeVisibleSteps: true');
    expect(MORNING_SRC).toContain('requireStepAck: true');
    expect(MORNING_SRC).toContain("closeOnComplete: 'after'");
    expect(MORNING_SRC).toContain('mergeFreshStepsWithUnresolvedProgress');
    expect(MORNING_SRC).toContain("status === 'failed_sync'");
  });

  it('treats explicit no-period cycle answer as completed for today', () => {
    expect(MORNING_SRC).toContain("day?.cycleStatus === 'none'");
    expect(MORNING_SRC).toContain('cycleAnsweredAt');
    expect(STEPS_SRC).toContain("cycleStatus: 'none'");
    expect(STEPS_SRC).toContain('cycleAnsweredAt');
  });

  it('routes yesterdayVerify and registration day writes through scoped helpers', () => {
    expect(YESTERDAY_SRC).toContain('writeDayDataScoped(dateKey');
    expect(YESTERDAY_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(PROFILE_SRC).toContain('writeDayDataScoped(todayKey');
    expect(PROFILE_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(MORNING_SRC).toContain('HEYS.MorningCheckinUtils.writeDayV2Scoped = writeDayV2ScopedAndLegacy');
  });
});
