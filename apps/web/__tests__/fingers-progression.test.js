// fingers-progression.test.js — B4: чистый движок авто-прогрессии веса.
//
// suggestProgression композирует RPE прошлой сессии (B1) + готовность + боль (B6).
// Safety-first: расти только при readyForMax и без боли; «тяжело» → держать/снизить.
// Reader Fingers.lastGripFeedback (session_ui) и кнопка в конструкторе — live.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { beforeAll, describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FINGERS_DIR = path.resolve(__dirname, '..', 'fingers');

const setupOnce = () => {
  if (!globalThis.window) globalThis.window = globalThis;
  globalThis.window.HEYS = globalThis.HEYS = {};
  globalThis.React = globalThis.window.React = { createElement: () => ({}), Fragment: 'F' };
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_constructor_v1.js'), 'utf8'));
};

describe('B4 suggestProgression', () => {
  beforeAll(setupOnce);
  const S = (inp) => globalThis.HEYS.Fingers.suggestProgression(inp);
  const ready = { readyForMax: true, hasPain: false, currentKg: 10 };

  it('боль → hold (safety, не прогрессируем)', () => {
    const r = S({ rpe: ['easy', 'easy'], readyForMax: true, hasPain: true, currentKg: 10 });
    expect(r.action).toBe('hold');
    expect(r.deltaKg).toBe(0);
  });

  it('готовность не max → hold', () => {
    const r = S({ rpe: ['easy', 'easy'], readyForMax: false, hasPain: false, currentKg: 10 });
    expect(r.action).toBe('hold');
  });

  it('нет RPE → hold (нечего советовать)', () => {
    expect(S(Object.assign({ rpe: [] }, ready)).action).toBe('hold');
  });

  it('все подходы easy + ready → increase +1кг', () => {
    const r = S(Object.assign({ rpe: ['easy', 'easy', 'easy'] }, ready));
    expect(r.action).toBe('increase');
    expect(r.deltaKg).toBe(1);
    expect(r.suggestedKg).toBe(11);
  });

  it('ok без hard → increase +0.5кг', () => {
    const r = S(Object.assign({ rpe: ['ok', 'easy', 'ok'] }, ready));
    expect(r.action).toBe('increase');
    expect(r.deltaKg).toBe(0.5);
    expect(r.suggestedKg).toBe(10.5);
  });

  it('один hard → hold (закрепить)', () => {
    expect(S(Object.assign({ rpe: ['ok', 'hard', 'ok'] }, ready)).action).toBe('hold');
  });

  it('два+ hard → decrease -1кг', () => {
    const r = S(Object.assign({ rpe: ['hard', 'hard', 'ok'] }, ready));
    expect(r.action).toBe('decrease');
    expect(r.deltaKg).toBe(-1);
    expect(r.suggestedKg).toBe(9);
  });

  it('кастомный stepKg учитывается', () => {
    const r = S({ rpe: ['easy', 'easy'], readyForMax: true, hasPain: false, currentKg: 20, stepKg: 2 });
    expect(r.deltaKg).toBe(2);
    expect(r.suggestedKg).toBe(22);
  });
});
