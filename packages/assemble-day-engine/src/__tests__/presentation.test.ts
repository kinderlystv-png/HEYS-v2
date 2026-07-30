import { describe, expect, it } from 'vitest';
import { getCharacterPresentation } from '../content/presentation.js';
import { createInitialState } from '../content/scenario.js';

function neutralState() {
  const state = createInitialState('character-presentation');
  state.vitals.energy = 55;
  state.vitals.mood = 55;
  state.vitals.tension = 30;
  state.vitals.hunger = 30;
  state.vitals.physicalFatigue = 30;
  state.accumulators.sleepDebtMin = 0;
  state.accumulators.activeCaffeineMg = 0;
  state.accumulators.recoveryNeed = 30;
  state.family.friction = 30;
  return state;
}

describe('character presentation projection', () => {
  it('maps each independent axis to only its owned visual frame', () => {
    const neutral = neutralState();
    const baseline = getCharacterPresentation(neutral);

    const depleted = structuredClone(neutral);
    depleted.vitals.energy = 20;
    expect(getCharacterPresentation(depleted).frame).toEqual({ ...baseline.frame, pose: 'depleted' });

    const bright = structuredClone(neutral);
    bright.vitals.mood = 80;
    expect(getCharacterPresentation(bright).frame).toEqual({ ...baseline.frame, expression: 'bright' });

    const pressured = structuredClone(neutral);
    pressured.vitals.tension = 85;
    expect(getCharacterPresentation(pressured).frame).toEqual({ ...baseline.frame, load: 'pressured' });
  });

  it('keeps mixed state legible and derives a deterministic recovery frame', () => {
    const state = neutralState();
    state.vitals.energy = 25;
    state.vitals.mood = 80;
    state.vitals.tension = 85;
    const mixed = getCharacterPresentation(state);
    expect(mixed.frame).toMatchObject({ pose: 'depleted', expression: 'bright', load: 'pressured' });
    expect(mixed.indicators.map((item) => item.value)).toEqual(['низкая', 'высокое', 'высокое']);

    const recovering = neutralState();
    recovering.accumulators.recoveryNeed = 80;
    expect(getCharacterPresentation(recovering).frame.pose).toBe('recovering');
    expect(getCharacterPresentation(recovering)).toEqual(getCharacterPresentation(structuredClone(recovering)));
  });

  it('limits explanations, exposes no raw values and leaves state untouched', () => {
    const state = neutralState();
    state.accumulators.sleepDebtMin = 240;
    state.vitals.hunger = 80;
    state.accumulators.recoveryNeed = 80;
    state.accumulators.activeCaffeineMg = 120;
    state.family.friction = 80;
    const before = structuredClone(state);
    const presentation = getCharacterPresentation(state);

    expect(presentation.reasons).toHaveLength(2);
    expect(presentation.reasons.map((item) => item.id)).toEqual(['sleep_debt', 'hunger']);
    expect(JSON.stringify(presentation)).not.toMatch(/240|120|80/);
    expect(state).toEqual(before);
  });
});
