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

describe('чек-ин v4: доступность сна, настроения и шагов', () => {
  it('капсула времени сна — одна фраза role=group', () => {
    expect(STEPS_SRC).toContain('buildSleepCapsuleAriaLabel');
    expect(STEPS_SRC).toContain("'aria-label': buildSleepCapsuleAriaLabel");
    expect(STEPS_SRC).toContain("role: 'group'");
    expect(STEPS_SRC).toContain('лёг в');
  });

  it('ползунки 1–10 — aria-label «название, N из 10»', () => {
    expect(STEPS_SRC).toContain('buildScaleSliderAriaLabel');
    expect(STEPS_SRC).toContain("buildScaleSliderAriaLabel('Насколько выспались', sleepQuality)");
    expect(STEPS_SRC).toContain('buildScaleSliderAriaLabel(row.title, row.value)');
  });

  it('дорожка шагов и метка «Совет · N» — одна фраза на slider', () => {
    expect(STEPS_SRC).toContain('buildStepsTrackAriaLabel');
    expect(STEPS_SRC).toContain('ariaLabelTrack: stepsTrackAriaLabel');
    const adviceAt = STEPS_SRC.indexOf('mc-steps-advice-mark');
    const chunk = STEPS_SRC.slice(adviceAt, adviceAt + 260);
    expect(chunk).toContain("'aria-hidden': 'true'");
    expect(chunk).toContain('tabIndex: -1');
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

  it('expanded cycle row — radiogroup и radio с именами дней', () => {
    expect(STEPS_SRC).toContain("role: 'radiogroup'");
    expect(STEPS_SRC).toContain("'aria-label': 'Какой день'");
    expect(STEPS_SRC).toContain("role: 'radio'");
    expect(STEPS_SRC).toContain("'aria-label': `День ${day}`");
  });
});

describe('чек-ин v4 · неделя периода в стопке', () => {
  const CSS = fs.readFileSync(
    path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'),
    'utf8',
  );

  it('на днях 1–7 карточка периода сверху, прокрутка и отложенные замеры', () => {
    expect(STEPS_SRC).toContain('cycleWeekTop');
    expect(STEPS_SRC).toContain("cycleWeekTop ? ' mc-rest-step--cycle-week' : ''");
    expect(STEPS_SRC).toContain('cycleWeekTop ? cycleRow : coldCard');
    expect(STEPS_SRC).toContain('measurementsDeferred = cycleWeekTop');
    expect(STEPS_SRC).toContain('mc-rest-row--measurements-deferred');
    expect(STEPS_SRC).toContain('Замеры отложены. Задержка воды искажает обхваты, вернутся после периода');
    expect(STEPS_SRC).toContain('mc-rest-cycle-week-card');
    expect(CSS).toContain('.mc-rest-step--cycle-week');
    expect(CSS).toMatch(/\.mc-rest-step--cycle-week[\s\S]*padding-bottom:\s*74px/);
    expect(CSS).toContain('.mc-rest-card-title--muted');
    expect(CSS).toContain('rgba(0, 0, 0, 0.62)');
    expect(CSS).toContain('rgba(0, 0, 0, 0.5)');
  });
});
