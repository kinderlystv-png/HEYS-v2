/**
 * Детектор «кофе → сон».
 *
 * Строка контракта «кофе и сон — правило детектора» (reports-insights.v4,
 * решение 15 сентября). Все числа здесь — оттуда, ни одного своего:
 *
 * — ИСТОЧНИК ОДИН: ответ утреннего чек-ина. Кофе, опознанный по названию
 *   продукта в приёмах, детектор не читает: у него нет честного времени
 *   (продукт можно внести вечером за утро), и два источника, не знающие друг о
 *   друге, дали бы разные ответы на один вопрос;
 * — поздний кофе — позже 14:30, ранний — «до 12:00» и «не пил»;
 * — минимум 14 дней с ответом, из них не меньше пяти в каждой группе;
 * — разница, при которой паттерн называется, — 25 минут сна в среднем; меньше
 *   — «связь не выявлена», и это тоже ответ, который показывается.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const SLEEP_SRC = fs.readFileSync(path.join(WEB, 'insights/patterns/sleep.js'), 'utf8');
const CANVAS = fs.readFileSync(
  path.resolve(
    WEB,
    '../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html',
  ),
  'utf8',
);

/** Значение строки контракта по её заголовку. */
function contract(label) {
  const head = `<b>${label}</b><span data-v="`;
  const at = CANVAS.indexOf(head);
  if (at < 0) throw new Error(`нет строки «${label}»`);
  const from = at + head.length;
  return CANVAS.slice(from, CANVAS.indexOf('"', from));
}

function loadDetector(coffeeMinutesOf) {
  window.HEYS = {
    InsightsPI: {},
    Steps: { getLastCoffeeMinutes: coffeeMinutesOf },
    dayUtils: { getTotalSleepHours: (day) => Number(day?.sleepHours) || 0 },
  };
  // eslint-disable-next-line no-eval
  eval(SLEEP_SRC);
  return window.HEYS.InsightsPI.patternModules.analyzeCoffeeSleep;
}

/** Ответ чек-ина в минутах: так же, как его разбирает сам шаг. */
const MIN = { before12: 12 * 60, after17: 17 * 60, none: null };

/** N дней с заданным ответом и длительностью сна. */
function days(spec) {
  const out = [];
  spec.forEach(({ count, coffee, hours }) => {
    for (let i = 0; i < count; i += 1) out.push({ coffee, sleepHours: hours });
  });
  return out;
}

const coffeeOf = (day) => (day && 'coffee' in day ? day.coffee : undefined);

afterEach(() => {
  delete window.HEYS;
});

describe('кофе и сон', () => {
  it('числа детектора взяты из строки контракта, а не назначены кодом', () => {
    // Тест читает решение и падает, если дизайнер его перепишет, — а не
    // охраняет молча прежние числа.
    const row = contract('кофе и сон — правило детектора');
    expect(row).toContain('ИСТОЧНИК ОДИН');
    expect(row).toContain('после 14:30');
    expect(row).toContain('МИНИМУМ ДНЕЙ 14');
    expect(row).toContain('не меньше 5 в каждой группе');
    expect(row).toContain('25 минут');

    expect(SLEEP_SRC).toContain('COFFEE_LATE_AFTER_MIN = 14 * 60 + 30');
    expect(SLEEP_SRC).toContain('COFFEE_MIN_DAYS = 14');
    expect(SLEEP_SRC).toContain('COFFEE_MIN_PER_GROUP = 5');
    expect(SLEEP_SRC).toContain('COFFEE_SLEEP_DIFF_MIN = 25');
  });

  it('разница больше 25 минут — паттерн называется числом', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 7, coffee: MIN.after17, hours: 6.5 },
      { count: 7, coffee: MIN.before12, hours: 7.25 },
    ]));
    expect(result.available).toBe(true);
    expect(result.diffMinutes).toBe(45);
    expect(result.title).toBe('Кофе после 16:00 — сон короче');
    expect(result.insight).toContain('45 минут');
  });

  it('разница меньше 25 минут — «связь не выявлена», и это тоже показывается', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 7, coffee: MIN.after17, hours: 7 },
      { count: 7, coffee: MIN.none, hours: 7.25 },
    ]));
    expect(result.available).toBe(true);
    expect(result.title).toBe('Кофе и сон: связь не выявлена');
    // Пустая находка — ответ, а не молчание: человек отвечал про кофе две
    // недели и вправе узнать, что связи не видно.
    expect(result.insight).toContain('связь не выявлена');
  });

  it('«не пил» идёт в раннюю группу наравне с «до 12:00»', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 6, coffee: MIN.after17, hours: 6 },
      { count: 4, coffee: MIN.none, hours: 7 },
      { count: 4, coffee: MIN.before12, hours: 7 },
    ]));
    expect(result.available).toBe(true);
    expect(result.earlyDays).toBe(8);
    expect(result.lateDays).toBe(6);
  });

  it('своё время между 12:00 и 14:30 не попадает ни в одну группу', () => {
    // Такой день не отвечает на вопрос «поздний или ранний», и тянуть его в
    // любую сторону значило бы придумать ответ за человека.
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 7, coffee: MIN.after17, hours: 6.5 },
      { count: 7, coffee: MIN.before12, hours: 7.25 },
      { count: 9, coffee: 13 * 60 + 30, hours: 5 },
    ]));
    expect(result.daysAnalyzed).toBe(14);
    expect(result.diffMinutes).toBe(45);
  });

  it('меньше пяти дней в группе — гипотеза, сколько бы ни было всего', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 4, coffee: MIN.after17, hours: 6 },
      { count: 20, coffee: MIN.before12, hours: 7.5 },
    ]));
    expect(result.available).toBe(false);
    expect(result.lateDays).toBe(4);
    expect(result.minDaysRequired).toBe(14);
  });

  it('меньше 14 дней всего — тоже гипотеза', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 6, coffee: MIN.after17, hours: 6 },
      { count: 6, coffee: MIN.before12, hours: 7.5 },
    ]));
    expect(result.available).toBe(false);
    expect(result.daysAnalyzed).toBe(12);
  });

  it('день без ответа про кофе в счёт не идёт', () => {
    const analyze = loadDetector(coffeeOf);
    const withGaps = days([
      { count: 7, coffee: MIN.after17, hours: 6.5 },
      { count: 7, coffee: MIN.before12, hours: 7.25 },
    ]).concat(Array.from({ length: 10 }, () => ({ sleepHours: 4 })));
    const result = analyze(withGaps);
    expect(result.daysAnalyzed).toBe(14);
    expect(result.diffMinutes).toBe(45);
  });

  it('день без сна в счёт не идёт: сравнивать нечего', () => {
    const analyze = loadDetector(coffeeOf);
    const result = analyze(days([
      { count: 7, coffee: MIN.after17, hours: 6.5 },
      { count: 7, coffee: MIN.before12, hours: 7.25 },
      { count: 5, coffee: MIN.after17, hours: 0 },
    ]));
    expect(result.daysAnalyzed).toBe(14);
  });

  it('кофе из приёмов детектор не читает — источник только чек-ин', () => {
    // Проверка на отмену: если кто-то заведёт второй источник, он появится
    // здесь именем, и тест это назовёт.
    const body = SLEEP_SRC.slice(
      SLEEP_SRC.indexOf('function analyzeCoffeeSleep'),
      SLEEP_SRC.indexOf('function pluralMinutesWord'),
    );
    expect(body).toContain('HEYS.Steps?.getLastCoffeeMinutes');
    expect(body).not.toContain('pIndex');
    expect(body).not.toContain('meals');
  });
});
