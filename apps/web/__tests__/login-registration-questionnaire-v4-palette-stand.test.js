import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { analyzeStand, formatFindingsTable } from './helpers/v4-palette-stand-analyze.mjs';
import { measureZone } from './helpers/v4-palette-stand.mjs';
import {
  releasePlaywrightBrowserForSuite,
  retainPlaywrightBrowserForSuite,
} from './helpers/playwright-browser.mjs';
import loginStand from './stands/login.stand.mjs';
import questionnaireStand from './stands/questionnaire.stand.mjs';
import registrationStand from './stands/registration.stand.mjs';

const ZONE_CASES = [
  {
    stand: loginStand,
    contourKeys: ['поле телефона'],
  },
  {
    stand: registrationStand,
    contourKeys: [],
  },
  {
    stand: questionnaireStand,
    contourKeys: ['поле ответа'],
  },
];

describe('v4 palette stands · login / registration / questionnaire', () => {
  beforeAll(() => {
    retainPlaywrightBrowserForSuite();
  });

  afterAll(async () => {
    await releasePlaywrightBrowserForSuite();
  });

  for (const { stand, contourKeys } of ZONE_CASES) {
    it(`${stand.zone}: стенд отрисовался, watch найден, палитра без дефектов`, async () => {
      const result = await measureZone(stand);
      const watchCount = Object.keys(stand.watch).length;

      expect(result.rendered, `${stand.zone} rendered`).toBe(true);
      expect(result.notFound, `${stand.zone} notFound`).toEqual([]);
      expect(watchCount - result.notFound.length, `${stand.zone} found keys`).toBe(watchCount);

      const findings = analyzeStand({ zone: stand.zone, result, contourKeys });
      if (findings.length) {
        // eslint-disable-next-line no-console
        console.log(`[${stand.zone}] findings:\n${formatFindingsTable(findings).join('\n')}`);
      }
      expect(findings, formatFindingsTable(findings).join('\n')).toEqual([]);
    }, 60_000);
  }
});
