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

// Живые данные показали то, чего синтетика не ловила: у одного клиента в
// дне 6 приёмов, у другого 12 — перечисление промежутков разрасталось до
// 97 символов при кадре на ~30. Проверяем обе формы строки ритма.
describe('строка «Ритм приёмов» переживает живой день', () => {
  const dashboard = fs.readFileSync(
    path.resolve(__dirname, '../insights/pi_ui_dashboard.js'), 'utf8');

  it('до двух промежутков — перечисление, дальше диапазон', () => {
    expect(dashboard).toContain('gaps.length <= 2');
    expect(dashboard).toContain("'Промежутки от '");
    expect(dashboard).toContain("' до '");
  });

  it('полоса времён сворачивается на длинном дне', () => {
    expect(dashboard).toContain('timed.length <= 4');
    expect(dashboard).toContain("'+' + (timed.length - 2)");
  });

  it('заглушка говорит «Сегодня заполнено», когда все поля закрыты', () => {
    expect(dashboard).toContain("'Сегодня заполнено'");
    expect(dashboard).toContain('День закрыт полностью');
  });
});

// Живые данные: в карточку «Стоит внимания» шёл заголовок с эмодзи
// («🍽️ Слишком большой дефицит калорий»), хотя написанная фраза куратора
// лежала в WARNING_HUMAN_MESSAGES и в объект предупреждения не попадала.
describe('голос куратора в предупреждениях', () => {
  it('движок отдаёт написанную фразу в humanMessage', () => {
    const ews = read('insights/pi_early_warning.js');
    const titles = (ews.match(/message: `[^`]*\$\{humanMsg\.title\}[^`]*`/g) || []).length;
    const human = (ews.match(/humanMessage: humanMsg\.message/g) || []).length;
    expect(titles).toBeGreaterThan(20);
    // Каждому заголовку соответствует проброшенная фраза
    expect(human).toBe(titles);
  });

  it('v4 предпочитает фразу, а эмодзи у старых снимков срезает', () => {
    const dashboard = read('insights/pi_ui_dashboard.js');
    expect(dashboard).toContain('w.humanMessage');
    // эмодзи-префикс срезается регуляркой по не-буквенным символам в начале
    expect(dashboard).toMatch(/replace\(\/\^\[\^\\p\{L\}\\p\{N\}\]\+\/u/);
    // Сырое w.message в v4-блоках больше не показывается
    const attention = dashboard.slice(
      dashboard.indexOf('function InsightsV4Attention'),
      dashboard.indexOf('function buildPatternMaturityWord'),
    );
    expect(attention).not.toContain("}, w.message || w.detail)");
  });
});

// Контракт «запреты копии»: эмодзи, телеграфные заголовки, слова
// «слишком/плохо/нельзя», проценты риска и медицинские утверждения —
// в фразах предупреждений не появляются. Проверяем все типы разом,
// чтобы новый текст не проехал мимо правила.
describe('запреты копии в фразах предупреждений', () => {
  const src = read('insights/pi_early_warning.js');
  const start = src.indexOf('const WARNING_HUMAN_MESSAGES');
  const chunk = src.slice(start, start + 95000);

  const phrases = (() => {
    const out = new Map();
    const re = /([A-Z_]{4,}): \{[\s\S]{0,300}?message: '([^']*)'/g;
    let m;
    while ((m = re.exec(chunk))) if (!out.has(m[1])) out.set(m[1], m[2]);
    return out;
  })();

  it('фразы собраны для всех типов', () => {
    expect(phrases.size).toBeGreaterThanOrEqual(24);
  });

  it('ни эмодзи, ни «слишком/плохо/нельзя», ни процентов риска', () => {
    const forbidden = [
      [/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эмодзи'],
      [/слишком/i, '«слишком»'],
      [/\bплохо\b/i, '«плохо»'],
      [/нельзя/i, '«нельзя»'],
      [/риск \d/i, 'процент риска'],
      [/score\s*</i, 'служебный score'],
    ];
    const bad = [];
    for (const [key, phrase] of phrases) {
      for (const [re, label] of forbidden) {
        if (re.test(phrase)) bad.push(`${key}: ${label}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('пять образцов дизайнера стоят дословно', () => {
    expect(phrases.get('SLEEP_DEBT')).toContain('меньше шести часов вторую ночь');
    expect(phrases.get('HYDRATION_DEFICIT')).toContain('в среднем 1,4 из 2,0 л');
    expect(phrases.get('FIBER_DEFICIT')).toContain('овощами в обед');
    expect(phrases.get('CALORIC_DEBT')).toContain('вечерний перебор');
    expect(phrases.get('WEEKEND_PATTERN')).toContain('пропущенном обеде');
  });
});
