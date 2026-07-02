import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const STEP_MODAL_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
const MORNING_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_morning_checkin_v1.js'), 'utf8');
const DAY_EFFECTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_effects.js'), 'utf8');
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');
const SUPPLEMENTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_supplements_v1.js'), 'utf8');
const IW_CONSTANTS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_iw_constants.js'), 'utf8');
const YESTERDAY_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const PROFILE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_profile_step_v1.js'), 'utf8');
const DAY_HANDLERS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_day_day_handlers.js'), 'utf8');
const DAY_EFFECTS_SRC_DIRECT = fs.readFileSync(path.resolve(__dirname, '../heys_day_effects.js'), 'utf8');
const STORAGE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_storage_supabase_v1.js'), 'utf8');

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
    expect(STEP_MODAL_SRC).toContain('allowProgressForwardNav = true');
    expect(MORNING_SRC).toContain('freezeVisibleSteps: true');
    expect(MORNING_SRC).toContain('requireStepAck: true');
    expect(MORNING_SRC).toContain('allowSwipe: false');
    expect(MORNING_SRC).toContain('allowProgressForwardNav: false');
    expect(MORNING_SRC).toContain("closeOnComplete: 'after'");
    expect(MORNING_SRC).toContain('mergeFreshStepsWithUnresolvedProgress');
    expect(MORNING_SRC).toContain("status === 'failed_sync'");
  });

  it('prevents progress dots from advancing strict morning flow and refreshes final day data with payload', () => {
    expect(STEP_MODAL_SRC).toContain('if (allowProgressForwardNav) handleNext();');
    expect(STEP_MODAL_SRC).toContain('disabled: !allowProgressForwardNav && i > currentStepIndex');
    expect(MORNING_SRC).toContain('function dispatchMorningCheckinDayRefresh');
    expect(MORNING_SRC).toContain("'morning-checkin-complete-delayed'");
    expect(MORNING_SRC).toContain('data: { ...freshDay, date: dateKey }');
  });

  it('keeps strict final completion single-step and waits for final cloud flush before completion events', () => {
    expect(STEP_MODAL_SRC).toContain('if (requireStepAck) {\n            if (!(await saveStepConfig(currentConfig, stepData))) return;');
    const completeStart = MORNING_SRC.indexOf('function completeMorningCheckin');
    const finishStart = MORNING_SRC.indexOf('const finish = () =>', completeStart);
    const beforeFinish = MORNING_SRC.slice(completeStart, finishStart);
    expect(beforeFinish).not.toContain('dispatchMorningCheckinDayRefresh');
    expect(beforeFinish).not.toContain('heys:checkin-complete');
    expect(DAY_EFFECTS_SRC).toContain("'#sq' + (lsDay.sleepQuality || 0)");
    expect(DAY_EFFECTS_SRC).toContain("'#mm' + (lsDay.moodMorning || 0)");
    expect(DAY_EFFECTS_SRC).toContain("'#wm' + (lsDay.wellbeingMorning || 0)");
  });

  it('treats explicit no-period cycle answer as completed for today', () => {
    expect(MORNING_SRC).toContain("day?.cycleStatus === 'none'");
    expect(MORNING_SRC).toContain('cycleAnsweredAt');
    expect(STEPS_SRC).toContain("cycleStatus: 'none'");
    expect(STEPS_SRC).toContain('} else if (cycleDay == null) {');
    expect(STEPS_SRC).toContain('cycleAnsweredAt');
  });

  it('keeps optional morning steps aligned with visible saves and explicit empty answers', () => {
    expect(MORNING_SRC).toContain('function shouldIncludeRefeedStep');
    expect(MORNING_SRC).toContain('HEYS.Refeed?.shouldShowRefeedStep?.() === true');
    expect(MORNING_SRC).toContain('function getBlockingMorningSteps');
    expect(MORNING_SRC).toContain('checkin_incomplete_steps');
    expect(MORNING_SRC).toContain("case 'supplements': return Array.isArray(day?.supplementsPlanned);");
    expect(STEPS_SRC).toContain("reason: 'empty_measurements'");
    expect(STEPS_SRC).toContain("type: 'none'");
    expect(SUPPLEMENTS_SRC).toContain("Object.prototype.hasOwnProperty.call(dayData, 'supplementsPlanned')");
    expect(SUPPLEMENTS_SRC).toContain('completed: true');
    expect(IW_CONSTANTS_SRC).toContain("if (exposureType === 'none')");
  });

  it('routes yesterdayVerify and registration day writes through scoped helpers', () => {
    expect(YESTERDAY_SRC).toContain('writeDayDataScoped(dateKey');
    expect(YESTERDAY_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(PROFILE_SRC).toContain('writeDayDataScoped(todayKey');
    expect(PROFILE_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(MORNING_SRC).toContain('HEYS.MorningCheckinUtils.writeDayV2Scoped = writeDayV2ScopedAndLegacy');
  });

  it('does not let step saves seed today from a richer live day with another date', () => {
    expect(STEPS_SRC).toContain('function matchesDateKey(dayData, dateKey)');
    expect(STEPS_SRC).toContain('if (matchesDateKey(liveDay, dateKey))');
    expect(STEPS_SRC).toContain('if (matchesDateKey(scopedData, dateKey))');
    expect(STEPS_SRC).toContain('if (matchesDateKey(unscopedData, dateKey))');
    expect(STEPS_SRC).toContain('if (matchesDateKey(rawLocal, dateKey))');
    expect(STEPS_SRC).toContain('[HEYS.steps] saveDayData');
    expect(STEPS_SRC).toContain('if (!safeDayData) return false;');
  });

  it('guards dayv2 writes and sync from key/payload date mismatches', () => {
    expect(MORNING_SRC).toContain('[HEYS.morning] writeDayV2Scoped');
    expect(PROFILE_SRC).toContain('[HEYS.profileSteps] writeDayDataScoped ABORT: date mismatch');
    expect(YESTERDAY_SRC).toContain('[HEYS.yesterdayVerify] writeDayDataScoped ABORT: date mismatch');
    expect(DAY_HANDLERS_SRC).toContain('[HEYS.dayHandlers] persistDaySnapshotImmediately ABORT: date mismatch');
    expect(DAY_EFFECTS_SRC_DIRECT).toContain('function matchesDayV2Date(value, dateStr)');
    expect(STORAGE_SRC).toContain('function shouldBlockDayV2DateMismatch(key, value, source)');
    expect(STORAGE_SRC).toContain("shouldBlockDayV2DateMismatch(k, value, 'saveClientKey')");
    expect(STORAGE_SRC).toContain("shouldBlockDayV2DateMismatch(key, valueToStore, 'delta-light')");
    expect(STORAGE_SRC).toContain("shouldBlockDayV2DateMismatch(localKey, valueToStore, 'yandex-sync')");
    expect(STORAGE_SRC).toContain("shouldBlockDayV2DateMismatch(key, valueToStore, 'bootstrap')");
  });
});
