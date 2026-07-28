import fs from 'node:fs';
import path from 'node:path';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sourcePath = path.resolve(__dirname, '../heys_planning_game_word_builder_v1.js');
const source = fs.readFileSync(sourcePath, 'utf8');
const originalHEYS = window.HEYS;
const originalReact = window.React;

function loadModule() {
  window.HEYS = {};
  window.React = React;
  // eslint-disable-next-line no-eval
  (0, eval)(source);
  return window.HEYS.PlanningGames.modules['word-builder'];
}

function clickOption(container, optionId) {
  const button = container.querySelector(`[data-option-id="${optionId}"]`);
  expect(button).toBeTruthy();
  fireEvent.click(button);
}

describe('Planning Word Builder', () => {
  let module;

  beforeEach(() => {
    module = loadModule();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    window.HEYS = originalHEYS;
    window.React = originalReact;
  });

  it('registers a classic-script module with a valid hand-reviewed content bank', () => {
    expect(module.Component).toBeTypeOf('function');
    expect(module.api.version).toBe(1);

    const report = module.api.validateContent();
    expect(report.valid, report.errors.join('\n')).toBe(true);
    expect(report.wordCount).toBeGreaterThanOrEqual(30);
    expect(report.repeatedTextWordCount).toBeGreaterThanOrEqual(1);
    expect(report.hasYo).toBe(true);
    expect(source).not.toMatch(/\b(?:import|export)\s/);
    expect(source).not.toMatch(/fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
  });

  it('creates six deterministic, unique and correctly stratified rounds', () => {
    const first = module.api.createSession({ seed: 'reading-42' });
    const second = module.api.createSession({ seed: 'reading-42' });
    const other = module.api.createSession({ seed: 'reading-43' });

    expect(first).toEqual(second);
    expect(first).not.toEqual(other);
    expect(first.rounds).toHaveLength(6);
    expect(new Set(first.rounds.map((round) => round.wordId)).size).toBe(6);
    expect(first.rounds.map((round) => round.correctSyllables.length)).toEqual([2, 2, 3, 3, 2, 3]);

    first.rounds.forEach((round, index) => {
      expect(round.answer).toBe(round.correctSyllables.map((option) => option.text).join(''));
      expect(round.options.length).toBeGreaterThanOrEqual(2);
      expect(round.options.length).toBeLessThanOrEqual(4);
      expect(new Set(round.options.map((option) => option.id)).size).toBe(round.options.length);
      expect(round.answer).toMatch(/^[А-ЯЁ]+$/u);

      if (index < 4) {
        expect(round.distractor).toBeNull();
        expect(round.options).toHaveLength(round.correctSyllables.length);
      } else {
        expect(round.distractor).toBeTruthy();
        expect(round.options).toHaveLength(round.correctSyllables.length + 1);
        expect(round.correctSyllables.some((option) => option.id === round.distractor.id)).toBe(
          false,
        );
      }
    });
  });

  it('evaluates ordered syllables, incomplete input and a distractor without confusing option IDs', () => {
    const session = module.api.createSession({ seed: 'evaluation' });
    const normalRound = session.rounds[2];
    const distractorRound = session.rounds[4];

    const correctIds = normalRound.correctSyllables.map((option) => option.id);
    expect(module.api.evaluateSelection(normalRound, correctIds)).toMatchObject({
      isComplete: true,
      isCorrect: true,
      status: 'correct',
      selectedText: normalRound.answer,
    });
    expect(module.api.evaluateSelection(normalRound, correctIds.slice(0, 1))).toMatchObject({
      isComplete: false,
      isCorrect: false,
      status: 'incomplete',
    });

    const wrongIds = [
      distractorRound.distractor.id,
      ...distractorRound.correctSyllables
        .slice(0, distractorRound.correctSyllables.length - 1)
        .map((option) => option.id),
    ];
    expect(module.api.evaluateSelection(distractorRound, wrongIds)).toMatchObject({
      isComplete: true,
      isCorrect: false,
      status: 'incorrect',
    });
    expect(
      module.api.evaluateSelection(normalRound, [
        correctIds[0],
        correctIds[0],
        ...correctIds.slice(2),
      ]),
    ).toMatchObject({
      isComplete: true,
      isCorrect: false,
    });
  });

  it('shows a first-syllable hint after two errors and clears its pending timeout on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const session = module.api.createSession({ seed: 'hint-cleanup' });
    const { container, unmount } = render(
      React.createElement(module.Component, {
        seed: 'hint-cleanup',
        reducedMotion: false,
        onExit: vi.fn(),
      }),
    );

    session.rounds.slice(0, 4).forEach((round) => {
      round.correctSyllables.forEach((option) => clickOption(container, option.id));
      fireEvent.click(screen.getByRole('button', { name: 'Дальше' }));
    });

    const distractorRound = session.rounds[4];
    const makeWrongAttempt = () => {
      clickOption(container, distractorRound.distractor.id);
      distractorRound.correctSyllables
        .slice(0, distractorRound.correctSyllables.length - 1)
        .forEach((option) => clickOption(container, option.id));
    };

    makeWrongAttempt();
    expect(screen.getByText('Попробуй ещё')).toBeTruthy();
    act(() => vi.runOnlyPendingTimers());
    makeWrongAttempt();

    expect(
      screen.getByText(`Подсказка: начни со слога «${distractorRound.correctSyllables[0].text}».`),
    ).toBeTruthy();
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('finishes six words, starts a fresh session and exits through the provided callback', () => {
    const onExit = vi.fn();
    const session = module.api.createSession({ seed: 'complete' });
    const { container } = render(
      React.createElement(module.Component, {
        seed: 'complete',
        reducedMotion: true,
        onExit,
      }),
    );

    session.rounds.forEach((round, index) => {
      round.correctSyllables.forEach((option) => clickOption(container, option.id));
      fireEvent.click(
        screen.getByRole('button', {
          name: index === session.rounds.length - 1 ? 'Посмотреть результат' : 'Дальше',
        }),
      );
    });

    expect(screen.getByRole('heading', { name: 'Шесть слов собрано' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Вернуться к играм' }));
    expect(onExit).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Сыграть ещё' }));
    expect(screen.getByText('Слово 1 из 6')).toBeTruthy();
  });
});
