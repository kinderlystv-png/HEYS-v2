// fingers-warmup-penalty.test.js — B9: пропуск разогрева → штраф readiness.
//
// readiness.assess получает today.fingers.warmupSkippedRecently (его ставит
// _buildReadinessInputs из персиста, который пишет _recordWarmupSkip при старте
// сессии без разминки). Проверяем: флаг снижает score ровно на 10 и добавляет
// причину — и в dynamic (4+ дней истории), и в static (1-3 дня) путях.

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
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(FINGERS_DIR, 'heys_fingers_readiness_v1.js'), 'utf8'));
};

const TODAY = { date: '2026-06-05', moodMorning: 7, wellbeingMorning: 7, stressMorning: 3 };
// Варьируем историю (sigma>0 для dynamic-пути; иначе деление на 0).
const HIST5 = [
  { moodMorning: 6, wellbeingMorning: 7, stressMorning: 3 },
  { moodMorning: 8, wellbeingMorning: 6, stressMorning: 4 },
  { moodMorning: 7, wellbeingMorning: 8, stressMorning: 2 },
  { moodMorning: 5, wellbeingMorning: 7, stressMorning: 5 },
  { moodMorning: 8, wellbeingMorning: 8, stressMorning: 3 },
];
const HIST1 = [{ moodMorning: 7, wellbeingMorning: 7 }];

const WARN = 'В прошлый раз пропущен разогрев — выше риск травмы';

describe('B9 warmup-skip → readiness penalty', () => {
  beforeAll(setupOnce);

  const assess = (today, hist) => globalThis.HEYS.Fingers.readiness.assess(today, hist);

  it('dynamic-путь: флаг снижает score на 10 + причина', () => {
    const base = assess(TODAY, HIST5);
    const pen = assess(Object.assign({}, TODAY, { fingers: { warmupSkippedRecently: true } }), HIST5);
    expect(pen.score).toBe(base.score - 10);
    expect(pen.reasons).toContain(WARN);
    expect(base.reasons).not.toContain(WARN);
  });

  it('static-путь (1-3 дня истории): флаг снижает score на 10 + причина', () => {
    const base = assess(TODAY, HIST1);
    const pen = assess(Object.assign({}, TODAY, { fingers: { warmupSkippedRecently: true } }), HIST1);
    expect(pen.score).toBe(base.score - 10);
    expect(pen.reasons).toContain(WARN);
  });

  it('без флага — никакого штрафа/причины (фича выключена по умолчанию)', () => {
    const r = assess(TODAY, HIST5);
    expect(r.reasons).not.toContain(WARN);
  });

  it('hard-override (травма) не перебивается warmup-штрафом', () => {
    const r = assess({ fingers: { injuryFlag: true, warmupSkippedRecently: true } }, HIST5);
    expect(r.bucket).toBe('rest-day');
    expect(r.score).toBe(0);
  });
});
