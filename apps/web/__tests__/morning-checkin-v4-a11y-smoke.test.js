/**
 * Смоук a11y чек-ина: progressbar «Шаг N из 5» (checkin-morning.v4, строка
 * «доступность»). Симуляция по исходнику — не E2E человека.
 */
import fs from 'fs';
import path from 'path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_step_modal_v1.js'),
  'utf8',
);
const STEPS_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_steps_v1.js'),
  'utf8',
);

describe('чек-ин v4: progressbar по контракту', () => {
  it('daily-полоса шагов — role=progressbar с подписью «Шаг N из 5»', () => {
    const at = SRC.indexOf('mc-progress-dots--pills');
    expect(at).toBeGreaterThanOrEqual(0);
    const chunk = SRC.slice(at, at + 900);
    expect(chunk).toMatch(/role:\s*'progressbar'/);
    expect(chunk).toContain('aria-valuemin');
    expect(chunk).toContain('aria-valuemax');
    expect(chunk).toContain('aria-valuenow');
    expect(chunk).toContain('aria-label');
    expect(chunk).toContain('progressActiveIndex + 1');
    expect(chunk).toContain('progressStepConfigs.length');
  });

  it('точки внутри progressbar не дублируют озвучку шага', () => {
    const at = SRC.indexOf("role: 'progressbar'");
    const chunk = SRC.slice(at, at + 1800);
    expect(chunk).toContain("'aria-hidden': 'true'");
    expect(chunk).not.toMatch(/aria-label:\s*`Шаг \$\{i \+ 1\}`/);
  });
});

describe('чек-ин v4 · step 5 cycle row a11y', () => {
  it('progress stays 5 steps — cycle is inline in morningRest, not extra dot', () => {
    expect(SRC).toContain('progressStepConfigs.length');
    expect(STEPS_SRC).not.toMatch(/registerStep\('morningRest'[\s\S]*registerStep\('cycle'/);
    expect(STEPS_SRC).toContain("registerStep('morningRest'");
  });

  it('cycle chip exposes contract aria-label', () => {
    expect(STEPS_SRC).toContain("'aria-label': 'Отметить особые дни'");
  });
});
