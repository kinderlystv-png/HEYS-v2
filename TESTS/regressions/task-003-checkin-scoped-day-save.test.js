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
  // Переводы строк нормализуем: на Windows исходники лежат в дереве с
  // CRLF, и поиск по многострочным образцам не находил ничего.
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').replace(/\r\n/g, '\n');

const stepsSource = readFile('apps/web/heys_steps_v1.js');
const refeedSource = readFile('apps/web/heys_refeed_v1.js');

const extractRegisterStepBlock = (source, stepId) => {
  const start = source.indexOf(`registerStep('${stepId}'`);
  expect(start, `missing registerStep('${stepId}')`).toBeGreaterThanOrEqual(0);
  const next = source.indexOf('registerStep(', start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
};

const extractFunctionBody = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) return '';
  const next = source.indexOf('\n  function ', start + 1);
  return next === -1 ? source.slice(start) : source.slice(start, next);
};

/**
 * Путь сохранения шага: либо сам блок делает свежее чтение и scoped-запись,
 * либо он делегирует это помощнику в том же файле.
 *
 * Шаг `weight` 31 августа переехал на `persistMorningWeight`, который внутри
 * зовёт и `getFreshDayData`, и `saveDayData`. Инвариант остался, а сторож
 * смотрел только в тело шага и краснел на вынесенном помощнике — то есть
 * наказывал за нормальный рефакторинг.
 */
const savePathText = (source, saveBlock) => {
  const helpers = new Set();
  for (const [, name] of saveBlock.matchAll(/\b([a-z][A-Za-z0-9_]*)\s*\(/g)) {
    helpers.add(name);
  }
  let text = saveBlock;
  for (const name of helpers) text += extractFunctionBody(source, name);
  return text;
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
      const savePath = savePathText(stepsSource, block.slice(block.indexOf('save:')));
      expect(savePath, `${stepId} should fresh-read day before patching`).toMatch(/getFreshDayData\(\w+\)/);
      expect(savePath, `${stepId} should persist through scoped save helper`).toMatch(/saveDayData\(\w+,/);
    }
  });

  it('optional day-mutating steps used by check-in cannot clobber subjective fields', () => {
    for (const stepId of ['deficit', 'household_minutes', 'household', 'measurements', 'cold_exposure', 'supplements']) {
      const block = extractRegisterStepBlock(stepsSource, stepId);
      const savePath = savePathText(stepsSource, block.slice(block.indexOf('save:')));
      expect(savePath, `${stepId} should fresh-read day before patching`).toMatch(/getFreshDayData\(\w+\)/);
      expect(savePath, `${stepId} should persist through scoped save helper`).toMatch(/saveDayData\(\w+,/);
    }
  });

  it('saveDayData notifies day cache even when scoped branch returns early', () => {
    const saveDayStart = stepsSource.indexOf('function saveDayData(dateKey, dayData)');
    expect(saveDayStart).toBeGreaterThanOrEqual(0);
    const saveDayEnd = stepsSource.indexOf('const MORNING_ACTIVATION_COPY_HISTORY_KEY', saveDayStart);
    const saveDayBlock = stepsSource.slice(saveDayStart, saveDayEnd);
    const scopedBranch = saveDayBlock.slice(saveDayBlock.indexOf('if (scopedKey)'), saveDayBlock.indexOf('return true;', saveDayBlock.indexOf('if (scopedKey)')) + 'return true;'.length);

    expect(saveDayBlock).toContain('notifyDateUpdated(dateKey)');
    expect(scopedBranch).toContain('notifyDayCache();');
  });

  it('refeed step uses scoped day key helpers for read and write', () => {
    const block = refeedSource.slice(refeedSource.indexOf("registerStep('refeedDay'"));
    expect(refeedSource).toContain('const getDayStorageKey = (dateKey)');
    expect(block).toContain('readDayValue(dateKey');
    expect(block).toContain("writeDayValue(dateKey, day, ['isRefeedDay', 'refeedReason'])");
  });
});
