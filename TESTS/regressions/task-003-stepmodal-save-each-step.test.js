/**
 * Regression guard for TASK-003 hardening.
 *
 * Pressing "Next" on a StepModal step must persist that completed step before
 * moving to the next screen. Otherwise a user can complete sleep/mood, then an
 * optional tail step/close/error prevents the final batch save and diary cards
 * stay empty.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const source = fs.readFileSync(
  path.resolve(__dirname, '../../apps/web/heys_step_modal_v1.js'),
  'utf8'
);

describe('TASK-003 hardening: StepModal saves completed steps on Next', () => {
  it('saves current step before goToStep on non-final Next', () => {
    const nextBranch = source.slice(
      source.indexOf('if (currentStepIndex < totalSteps - 1)'),
      source.indexOf('} else {', source.indexOf('if (currentStepIndex < totalSteps - 1)'))
    );

    const saveIndex = nextBranch.indexOf('saveStepConfig(currentConfig, stepData)');
    const goIndex = nextBranch.indexOf('goToStep(currentStepIndex + 1');

    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(goIndex).toBeGreaterThan(saveIndex);
  });

  it('final batch save goes through the same deduped save helper', () => {
    expect(source).toContain('const savedStepSigsRef = useRef({});');
    expect(source).toContain('saveStepConfig(config, stepData)');
    expect(source).toContain('savedStepSigsRef.current[config.id] === sig');
  });

  it('dedupe signature only includes current and previous step dependencies', () => {
    expect(source).toContain('visibleStepConfigs.slice(0, configIndex + 1)');
    expect(source).toContain('dependencyData[id] = allStepData?.[id]');
    expect(source).not.toContain('all: allStepData || {}');
  });

  it('forward swipe and progress dots use handleNext save gate', () => {
    const swipeBranch = source.slice(
      source.indexOf('if (deltaX < 0 && currentStepIndex < totalSteps - 1)'),
      source.indexOf('} else if (deltaX > 0', source.indexOf('if (deltaX < 0 && currentStepIndex < totalSteps - 1)'))
    );
    const dotsBranch = source.slice(
      source.indexOf('if (i > currentStepIndex) handleNext();'),
      source.indexOf("else goToStep(i, 'right');") + "else goToStep(i, 'right');".length
    );

    expect(swipeBranch).toContain('handleNext();');
    expect(swipeBranch).not.toContain('goToStep(currentStepIndex + 1');
    expect(dotsBranch).toContain('if (i > currentStepIndex) handleNext();');
  });
});
