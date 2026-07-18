import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const originalHEYS = window.HEYS;
const originalReact = window.React;
const source = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');

function installYesterdayVerify() {
  // eslint-disable-next-line no-eval
  eval(source);
  return window.HEYS.YesterdayVerify;
}

describe('Yesterday verify fill-later completion', () => {
  beforeEach(() => {
    window.HEYS = {
      StepModal: { registerStep: () => undefined },
      dayUtils: { todayISO: () => '2026-07-18' },
    };
    window.React = {};
  });

  afterEach(() => {
    window.HEYS = originalHEYS;
    window.React = originalReact;
  });

  it('closes the current check-in after fill later but asks again on a later day', () => {
    const YesterdayVerify = installYesterdayVerify();
    const todayDecision = new Date(2026, 6, 18, 11, 0, 0).getTime();
    const afterMidnightDecision = new Date(2026, 6, 19, 1, 0, 0).getTime();
    const oldDecision = new Date(2026, 6, 17, 11, 0, 0).getTime();

    expect(YesterdayVerify.isExplicitlyVerified({
      yesterdayVerifyAction: 'fill_later',
      yesterdayVerifyAt: todayDecision,
    })).toBe(true);
    expect(YesterdayVerify.isExplicitlyVerified({
      yesterdayVerifyAction: 'fill_later',
      yesterdayVerifyAt: afterMidnightDecision,
    })).toBe(true);
    expect(YesterdayVerify.isExplicitlyVerified({
      yesterdayVerifyAction: 'fill_later',
      yesterdayVerifyAt: oldDecision,
    })).toBe(false);
  });

  it('keeps hard verification decisions permanently complete', () => {
    const YesterdayVerify = installYesterdayVerify();

    expect(YesterdayVerify.isExplicitlyVerified({ yesterdayVerifyAction: 'confirm_real_data' })).toBe(true);
    expect(YesterdayVerify.isExplicitlyVerified({ yesterdayVerifyAction: 'clear_day' })).toBe(true);
    expect(YesterdayVerify.isExplicitlyVerified({ yesterdayVerifyAction: 'estimated_fill' })).toBe(true);
  });
});
