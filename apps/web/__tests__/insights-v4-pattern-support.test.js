// Контракт reports-insights.v4, «число опоры»: у счётных выводов форма
// «N из M дней», у корреляционных — «N дней наблюдений», у незрелых —
// «нужно ещё N дней». До 2026-08-29 счётные анализаторы не отдавали
// matched/total, и счётные строки получали корреляционную форму.
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const webDir = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(webDir, rel), 'utf8');

describe('число опоры паттернов', () => {
  describe('форма строки', () => {
    let buildLabel;

    beforeEach(() => {
      window.React = { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, useMemo: (f) => f(), useCallback: (f) => f, useRef: () => ({}), Component: class {} };
      window.HEYS = { dev: { log: () => {}, warn: () => {} } };
      // eslint-disable-next-line no-eval
      (0, eval)(read('insights/pi_ui_dashboard.js'));
      buildLabel = window.HEYS.InsightsPI.uiDashboard._test.buildPatternMaturityLabel;
    });

    afterEach(() => {
      delete window.React;
      delete window.HEYS;
    });

    it('счётный паттерн — «N из M дней»', () => {
      expect(buildLabel({ available: true, matchedDays: 6, totalDays: 8 }, 18))
        .toBe('6 из 8 дней');
      expect(buildLabel({ available: true, matchedDays: 1, totalDays: 1 }, 18))
        .toBe('1 из 1 день');
      expect(buildLabel({ available: true, matchedDays: 0, totalDays: 4 }, 18))
        .toBe('0 из 4 дня');
    });

    it('корреляционный — «N дней наблюдений»', () => {
      expect(buildLabel({ available: true, daysAnalyzed: 18 }, 18))
        .toBe('18 дней наблюдений');
    });

    it('незрелый — «нужно ещё N дней»', () => {
      expect(buildLabel({ available: false, minDaysRequired: 7, daysAnalyzed: 3 }, 3))
        .toBe('нужно ещё 4 дня');
      expect(buildLabel({ available: false, minDaysRequired: 7, daysAnalyzed: 6 }, 6))
        .toBe('нужно ещё 1 день');
    });
  });

  describe('счётные анализаторы отдают matched/total', () => {
    it('поздний ужин считает ДНИ с поздним приёмом, не сами приёмы', () => {
      const src = read('insights/patterns/timing.js');
      expect(src).toContain('matchedDays: lateDates.size');
      expect(src).toContain('totalDays: daysWithMeals');
      // счёт по датам, а не по числу поздних приёмов
      expect(src).toContain('new Set(lateMeals.map((m) => m.date))');
    });

    it('гидратация считает дни с закрытой нормой', () => {
      const src = read('insights/patterns/lifestyle.js');
      expect(src).toContain('matchedDays');
      expect(src).toContain('d.achievement >= 100');
      expect(src).toContain('totalDays: hydrationData.length');
    });
  });
});
