// Контракт квиза с ботом HEYS Старт.
//
// Квиз лендинга и бот обязаны давать один и тот же тип срыва по одним и тем же
// ответам (`маркетинг/17` §§ 3.1–3.3): куратор получает сегмент из обоих
// каналов и работает с ним одинаково. Разъехавшиеся коды заметить глазами
// невозможно — они всплывут уже в карточке лида, поэтому таблица переходов
// зафиксирована тестом.

import { describe, expect, it } from 'vitest';

import {
  BARRIER_CHOICES,
  describeAnswers,
  EMPTY_ANSWERS,
  FREQUENCY_CHOICES,
  GOAL_CHOICES,
  resolveSegment,
  SEGMENTS,
  TRIGGER_CHOICES,
  WHEN_CHOICES,
  type SegmentCode,
  type TriggerCode,
  type WhenCode,
} from '../quiz/quizModel';

describe('resolveSegment — таблица типов срыва из `17` § 3.2', () => {
  const cases: Array<[TriggerCode, WhenCode | null, SegmentCode]> = [
    ['stress', null, 'emotional'],
    ['fatigue', null, 'fatigue'],
    ['social', null, 'social'],
    ['all_or_nothing', null, 'all_or_nothing'],
    // «Не понимаю» уточняется временем суток — и только оно даёт «вечерний».
    ['unknown', 'evening', 'evening'],
    ['unknown', 'night', 'evening'],
    ['unknown', 'morning', 'mixed'],
    ['unknown', 'day', 'mixed'],
    ['unknown', 'varies', 'mixed'],
    // Ответ про время не пришёл вовсе — картина не складывается, это смешанный.
    ['unknown', null, 'mixed'],
  ];

  it.each(cases)('%s + %s → %s', (trigger, when, expected) => {
    expect(resolveSegment(trigger, when)).toBe(expected);
  });

  it('время суток не меняет тип, когда причина названа прямо', () => {
    for (const when of WHEN_CHOICES) {
      expect(resolveSegment('stress', when.code)).toBe('emotional');
      expect(resolveSegment('fatigue', when.code)).toBe('fatigue');
    }
  });
});

describe('коды вариантов', () => {
  it('совпадают с кодами бота', () => {
    expect(TRIGGER_CHOICES.map((choice) => choice.code)).toEqual([
      'stress',
      'fatigue',
      'social',
      'all_or_nothing',
      'unknown',
    ]);
    expect(WHEN_CHOICES.map((choice) => choice.code)).toEqual([
      'morning',
      'day',
      'evening',
      'night',
      'varies',
    ]);
  });

  it('у каждого сегмента есть объяснение, шаг и роль куратора', () => {
    for (const segment of Object.values(SEGMENTS)) {
      expect(segment.title.length).toBeGreaterThan(0);
      expect(segment.explanation.length).toBeGreaterThan(0);
      expect(segment.firstStep.length).toBeGreaterThan(0);
      expect(segment.curator.length).toBeGreaterThan(0);
    }
  });

  it('в текстах результатов нет обещаний по весу и срокам', () => {
    // `COPY_VOICE`: гарантии результата и «−N кг» — жёсткий запрет.
    const forbidden = /−\s?\d|\bкг\b|гарант|за \d+ (дн|недел|месяц)/i;
    for (const segment of Object.values(SEGMENTS)) {
      const text = [segment.explanation, segment.firstStep, segment.curator].join(' ');
      expect(text).not.toMatch(forbidden);
    }
  });
});

describe('describeAnswers — что человек видит перед формой', () => {
  it('пустые ответы не дают строки', () => {
    expect(describeAnswers(EMPTY_ANSWERS)).toEqual([]);
  });

  it('первым идёт тип срыва, дальше — только заполненные уточнения', () => {
    const summary = describeAnswers({
      trigger: 'unknown',
      when: 'evening',
      frequency: FREQUENCY_CHOICES[1].code,
      barrier: null,
      goal: GOAL_CHOICES[2].code,
    });

    expect(summary[0]).toBe(SEGMENTS.evening.title);
    expect(summary).toHaveLength(3);
    expect(summary.some((part) => part.startsWith('сложнее всего'))).toBe(false);
  });

  it('перечисляет все три уточнения, когда они выбраны', () => {
    const summary = describeAnswers({
      trigger: 'stress',
      when: null,
      frequency: FREQUENCY_CHOICES[0].code,
      barrier: BARRIER_CHOICES[3].code,
      goal: GOAL_CHOICES[0].code,
    });

    expect(summary).toEqual([
      SEGMENTS.emotional.title,
      'повторяется: почти каждый день',
      'сложнее всего: знаю, что делать, но не удерживаю',
      'цель: снизить вес',
    ]);
  });
});
