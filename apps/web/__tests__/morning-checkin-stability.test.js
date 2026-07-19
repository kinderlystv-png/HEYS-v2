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
const LOG_TRACE_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_client_log_trace_v1.js'), 'utf8');

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
    expect(MORNING_SRC).toContain("forceVisibleStepIds: steps.includes('yesterdayVerify') ? ['yesterdayVerify'] : []");
    expect(STEP_MODAL_SRC).toContain('const touchStartActive = useRef(false);');
    expect(STEP_MODAL_SRC).toContain('if (!touchStartActive.current) return;');
    expect(STEP_MODAL_SRC).toContain('const transitionInFlightRef = useRef(false);');
    expect(STEP_MODAL_SRC).toContain('actionInFlightRef.current || transitionInFlightRef.current');
    expect(STEP_MODAL_SRC).toContain('await waitForSavingPaint();');
    expect(MORNING_SRC).toContain('mergeFreshStepsWithProgress');
    expect(MORNING_SRC).toContain("status === 'failed_sync'");
    expect(STEP_MODAL_SRC).toContain("'data-heys-step-modal': 'true'");
    expect(STEP_MODAL_SRC).toContain("'data-heys-step-id': currentConfig.id");
    expect(STEP_MODAL_SRC).toContain("'data-heys-saving': savingStep ? 'true' : 'false'");
  });

  it('prevents progress dots from advancing strict morning flow and refreshes final day data with payload', () => {
    expect(STEP_MODAL_SRC).toContain('if (allowProgressForwardNav) handleNext();');
    expect(STEP_MODAL_SRC).toContain('disabled: !allowProgressForwardNav && i > currentStepIndex');
    expect(MORNING_SRC).toContain('function dispatchMorningCheckinDayRefresh');
    expect(MORNING_SRC).toContain("'morning-checkin-complete-delayed'");
    expect(MORNING_SRC).toContain('data: { ...freshDay, date: dateKey }');
  });

  it('keeps strict final completion single-step and marks cloud-pending local completion explicitly', () => {
    expect(STEP_MODAL_SRC).toContain('if (requireStepAck) {\n            if (!(await saveStepConfig(currentConfig, stepData))) return;');
    expect(MORNING_SRC).toContain('markMorningProgressCloudPending');
    expect(MORNING_SRC).toContain("? 'background_sync'");
    expect(MORNING_SRC).toContain("traceMorningCheckin('step_sync_background'");
    expect(MORNING_SRC).toContain("traceMorningCheckin('flow_sync_background'");
    expect(MORNING_SRC).not.toContain('flushed = await HEYS.cloud.flushPendingQueue');
    expect(MORNING_SRC).not.toContain('return HEYS.cloud.flushPendingQueue(10000).then');
    expect(MORNING_SRC).toContain("status: cloudPending ? 'saved_local' : 'synced'");
    expect(MORNING_SRC).toContain('cloudPending,');
    expect(MORNING_SRC).toContain('ensureFinalMorningRequirements(plan)');
    expect(MORNING_SRC).toContain("window.addEventListener('heys:queue-drained'");
    expect(MORNING_SRC).toContain("traceMorningCheckin('flow_cloud_synced'");
    expect(MORNING_SRC).toContain("syncNote: cloudPending ? (opts.syncNote || 'flush_timeout') : null");
    expect(DAY_EFFECTS_SRC).toContain("'#sq' + (lsDay.sleepQuality || 0)");
    expect(DAY_EFFECTS_SRC).toContain("'#mm' + (lsDay.moodMorning || 0)");
    expect(DAY_EFFECTS_SRC).toContain("'#wm' + (lsDay.wellbeingMorning || 0)");
  });

  it('acknowledges a successfully persisted weight without waiting for a read-back render', () => {
    expect(STEPS_SRC).toContain('const saved = saveDayData(dateKey, dayData);');
    expect(STEPS_SRC).toContain("throw new Error('Не удалось сохранить вес. Попробуйте ещё раз.');");
    expect(STEPS_SRC).toContain('affectedKeys: [`heys_dayv2_${dateKey}`],\n        completed: true');
  });

  it('does not call preventDefault from a passive touch slider event', () => {
    expect(STEPS_SRC).toContain("event.type?.indexOf('touch') !== 0");
    expect(STEPS_SRC).toContain("touchAction: 'none'");
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
    expect(MORNING_SRC).toContain('HEYS.Refeed?.shouldShowRefeedStep?.() !== true');
    expect(MORNING_SRC).toContain('effectiveProfile.allowManualRefeed === true');
    expect(MORNING_SRC).toContain('HEYS.caloricDebt?.needsRefeed === true');
    expect(MORNING_SRC).toContain("case 'refeedDay': return typeof day?.isRefeedDay === 'boolean' || !shouldIncludeRefeedStep(profile, dateKey);");
    expect(MORNING_SRC).toContain('function getBlockingMorningSteps');
    expect(MORNING_SRC).toContain("const MORNING_OPTIONAL_TAIL_STEPS = new Set(['refeedDay', 'cycle', 'measurements', 'cold_exposure', 'supplements']);");
    expect(MORNING_SRC).toContain("return status === 'synced'\n      || status === 'saved_local'");
    expect(MORNING_SRC).toContain('isMorningFinalBlockingStep(row.id) && !isMorningStatusTerminal(row)');
    expect(MORNING_SRC).toContain('checkin_incomplete_steps');
    expect(STEP_MODAL_SRC).toContain("raw.startsWith('checkin_incomplete_steps:')");
    expect(STEP_MODAL_SRC).toContain("raw.slice('checkin_incomplete_steps:'.length).trim()");
    expect(STEP_MODAL_SRC).toContain('Осталось заполнить: ${labels}. Вернитесь к указанным шагам и сохраните данные.');
    expect(MORNING_SRC).toContain("case 'supplements': return Array.isArray(day?.supplementsPlanned);");
    expect(STEPS_SRC).toContain("reason: 'empty_measurements'");
    expect(STEPS_SRC).toContain("type: 'none'");
    expect(SUPPLEMENTS_SRC).toContain("Object.prototype.hasOwnProperty.call(dayData, 'supplementsPlanned')");
    expect(SUPPLEMENTS_SRC).toContain('completed: true');
    expect(IW_CONSTANTS_SRC).toContain("if (exposureType === 'none')");
  });

  it('reopens an interrupted morning flow when only optional tail steps remain', () => {
    expect(MORNING_SRC).toContain('const existingProgress = readMorningProgress(todayKey, currentClientId);');
    expect(MORNING_SRC).toContain('const remainingProgressSteps = getRemainingMorningSteps({');
    expect(MORNING_SRC).toContain('Resuming flow with unfinished steps');
  });

  it('keeps the final morning routine step blocking until the user confirms it', () => {
    expect(MORNING_SRC).toContain("case 'morningRoutine':\n        return false;");
    expect(STEPS_SRC).toContain("registerStep('morningRoutine'");
    expect(STEPS_SRC).toContain('completed: true');
    expect(STEPS_SRC).toContain('affectedKeys: data?.selectedCopyId ? [`heys_dayv2_${dateKey}`] : []');
  });

  it('keeps check-in trace useful without warning-only happy path noise', () => {
    expect(MORNING_SRC).toContain("plannedStepIds: Array.isArray(meta.plannedStepIds) ? meta.plannedStepIds : null");
    expect(MORNING_SRC).toContain("remainingStepIds: Array.isArray(meta.remainingStepIds) ? meta.remainingStepIds : null");
    expect(MORNING_SRC).toContain("syncedStepIds: Array.isArray(meta.syncedStepIds) ? meta.syncedStepIds : null");
    expect(MORNING_SRC).toContain("affectedKeys: Array.isArray(meta.affectedKeys) ? meta.affectedKeys : null");
    expect(MORNING_SRC).toContain("HEYS.LogTrace.trace(level, '[CHECKIN.flow]', payload)");
    expect(MORNING_SRC).toContain("const level = isProblem ? 'warn' : 'info';");
    expect(LOG_TRACE_SRC).toContain("console.info('[CHECKIN.trace] status_event'");
    expect(LOG_TRACE_SRC).not.toContain("console.warn('[CHECKIN.trace] status_event'");
  });

  it('emits morning status from the freshly written ledger and avoids no-op progress rewrites', () => {
    expect(MORNING_SRC).toContain('const status = getMorningCheckinStatus(dateKey, clientId, opts.ledger);');
    expect(MORNING_SRC).toContain('let changed = !existing;');
    expect(MORNING_SRC).toContain('const written = changed ? writeMorningProgress(ledger, clientId) : ledger;');
    expect(MORNING_SRC).toContain("const traceEvent = existing ? 'plan_resumed' : 'plan_created';");
    expect(MORNING_SRC).toContain('emitMorningCheckinStatus(dateKey, clientId, traceEvent, { ledger: written });');
    expect(MORNING_SRC).toContain("emitMorningCheckinStatus(dateKey, clientId, 'step_status', { ledger: written });");
    expect(STORAGE_SRC).toContain("'heys_morning_checkin_progress_v1_' // Resumable/exact-once morning flow ledger");
    expect(STORAGE_SRC).toContain('if (_skGrace < 10000 && !_isMorningCheckinLedger) return;');
    expect(STORAGE_SRC).toContain('!_isMorningCheckinProgress && !_isDefaultTabSync');
    expect(STORAGE_SRC).toContain("GRACE_PERIOD_BYPASS_morning_checkin");
  });

  it('routes yesterdayVerify and registration day writes through scoped helpers', () => {
    expect(YESTERDAY_SRC).toContain('writeDayDataScoped(dateKey');
    expect(YESTERDAY_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(PROFILE_SRC).toContain('writeDayDataScoped(todayKey');
    expect(PROFILE_SRC).toContain('HEYS.MorningCheckinUtils?.writeDayV2Scoped');
    expect(MORNING_SRC).toContain('HEYS.MorningCheckinUtils.writeDayV2Scoped = writeDayV2ScopedAndLegacy');
  });

  it('requires an explicit yesterdayVerify action before the morning flow can continue', () => {
    expect(YESTERDAY_SRC).toContain('incompleteAction: null');
    expect(YESTERDAY_SRC).toContain("if (unresolvedDates.length > 0 && !data.incompleteAction)");
    expect(YESTERDAY_SRC).toContain('recommendedAction === act.id');
    expect(YESTERDAY_SRC).not.toContain('incompleteAction: recommendedAction');
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

  it('keeps morning activation follow-up writes newer than pending day flushes', () => {
    expect(STEPS_SRC).toContain('function getLatestDayUpdatedAt(dateKey)');
    expect(STEPS_SRC).toContain('dayData.updatedAt = Math.max(Date.now(), getLatestDayUpdatedAt(dateKey) + 1);');
    expect(MORNING_SRC).toContain('dayData.updatedAt = Math.max(Date.now(), _latestUpdatedAt + 1);');
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
