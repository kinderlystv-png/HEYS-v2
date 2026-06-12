/**
 * Regression guard for TASK-003 follow-up.
 *
 * Bug: morning check-in saved sleep/mood fields, but later check-in/optional
 * steps could write a partial unscoped `heys_dayv2_<date>` snapshot. In curator
 * and PIN sessions that allowed the cloud/UI path to see a day without
 * sleepStart/sleepQuality/moodMorning, so diary cards stayed empty.
 *
 * Contract: day-mutating check-in steps must merge into the fresh scoped day and
 * persist through the shared scoped save helper; optional refeed must also use a
 * scoped day key. Direct unscoped dayv2 writes are forbidden in these modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

const readFile = (relativePath) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const stepsSource = readFile('apps/web/heys_steps_v1.js');
const refeedSource = readFile('apps/web/heys_refeed_v1.js');

const extractRegisterStepBlock = (source, stepId) => {
  const start = source.indexOf(`registerStep('${stepId}'`);
  expect(start, `missing registerStep('${stepId}')`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('registerStep(', start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
};

describe('TASK-003 follow-up: scoped day save for check-in day fields', () => {
  it('does not write direct unscoped dayv2 snapshots from check-in modules', () => {
    const forbidden = [
      /lsSet\(`heys_dayv2_/,
      /writeStoredValue\(`heys_dayv2_/,
      /localStorage\.setItem\(`heys_dayv2_/,
      /HEYS\.store\.set\(`heys_dayv2_/
    ];

    for (const pattern of forbidden) {
      expect(stepsSource).not.toMatch(pattern);
      expect(refeedSource).not.toMatch(pattern);
    }
  });

  it('core morning check-in day steps merge into fresh day and save through scoped helper', () => {
    for (const stepId of ['weight', 'sleepTime', 'sleepQuality', 'daySleep', 'morning_mood']) {
      const block = extractRegisterStepBlock(stepsSource, stepId);
      const saveBlock = block.slice(block.indexOf('save:'));
      expect(saveBlock, `${stepId} should fresh-read day before patching`).toContain('getFreshDayData(dateKey)');
      expect(saveBlock, `${stepId} should persist through scoped save helper`).toContain('saveDayData(dateKey,');
    }
  });

  it('optional day-mutating steps used by check-in cannot clobber subjective fields', () => {
    for (const stepId of ['deficit', 'household_minutes', 'household', 'measurements', 'cold_exposure', 'supplements']) {
      const block = extractRegisterStepBlock(stepsSource, stepId);
      const saveBlock = block.slice(block.indexOf('save:'));
      expect(saveBlock, `${stepId} should fresh-read day before patching`).toContain('getFreshDayData(dateKey)');
      expect(saveBlock, `${stepId} should persist through scoped save helper`).toContain('saveDayData(dateKey,');
    }
  });

  it('saveDayData notifies day cache even when scoped branch returns early', () => {
    const saveDayStart = stepsSource.indexOf('function saveDayData(dateKey, dayData)');
    expect(saveDayStart).toBeGreaterThanOrEqual(0);
    const saveDayEnd = stepsSource.indexOf('const MORNING_ACTIVATION_COPY_HISTORY_KEY', saveDayStart);
    const saveDayBlock = stepsSource.slice(saveDayStart, saveDayEnd);
    const scopedBranch = saveDayBlock.slice(saveDayBlock.indexOf('if (scopedKey)'), saveDayBlock.indexOf('return;', saveDayBlock.indexOf('if (scopedKey)')) + 'return;'.length);

    expect(saveDayBlock).toContain('notifyDateUpdated(dateKey)');
    expect(scopedBranch).toContain('notifyDayCache();');
  });

  it('refeed step uses scoped day key helpers for read and write', () => {
    const block = refeedSource.slice(refeedSource.indexOf("registerStep('refeedDay'"));
    expect(refeedSource).toContain('const getDayStorageKey = (dateKey)');
    expect(block).toContain('readDayValue(dateKey');
    expect(block).toContain('writeDayValue(dateKey, day)');
  });
});
