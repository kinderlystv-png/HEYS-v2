import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const src = fs.readFileSync(
  path.resolve(__dirname, '../heys_norm_correction_v1.js'),
  'utf8'
);
const WEEKLY_SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_weekly_reports_v2.js'),
  'utf8'
);
const COMPONENTS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/heys-components.css'),
  'utf8'
);
const PALETTE_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css'),
  'utf8'
);

function normalizeColor(color) {
  if (!color) return color;
  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const n = Number.parseInt(full, 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  }
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(color);
  if (rgba) {
    const alpha = rgba[4] === undefined ? 1 : Number(rgba[4]);
    if (alpha === 1) return `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`;
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${alpha})`;
  }
  return color;
}

function applyTheme(palette) {
  document.documentElement.setAttribute('data-palette', palette);
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-theme-id', palette);
}

function mountNormCorrectionStyles() {
  if (document.getElementById('norm-correction-test-styles')) return;
  const style = document.createElement('style');
  style.id = 'norm-correction-test-styles';
  style.textContent = `${PALETTE_CSS}\n${COMPONENTS_CSS}`;
  document.head.appendChild(style);
}

function mountHeader(badgeText) {
  mountNormCorrectionStyles();
  document.body.innerHTML = `
    <section class="norm-correction-screen">
      <header class="norm-correction-screen__header">
        <span class="norm-correction-screen__title">Норма на неделю</span>
        <span class="norm-correction-screen__badge">${badgeText}</span>
      </header>
      <div class="norm-correction-screen__content">
        <div class="weekly-wrap-correction weekly-wrap-correction--curator_kept">
          <div class="weekly-wrap-correction__title is-key">Ваша норма сегодня</div>
          <div class="weekly-wrap-correction__hero">
            <span class="weekly-wrap-correction__hero-value">2&nbsp;112</span>
            <span class="weekly-wrap-correction__hero-caption">без изменений</span>
          </div>
          <div class="weekly-wrap-correction__body">Куратор посмотрел поправку.</div>
          <div class="weekly-wrap-correction__facts">
            <div class="weekly-wrap-correction__fact">
              <span class="weekly-wrap-correction__fact-label">Предложение было</span>
              <span class="weekly-wrap-correction__fact-value is-muted">2&nbsp;049</span>
            </div>
            <div class="weekly-wrap-correction__fact">
              <span class="weekly-wrap-correction__fact-label">Решение</span>
              <span class="weekly-wrap-correction__fact-value is-quiet">оставить 2&nbsp;112</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

let NC;

function loggedDays(n, kcal = 2112) {
  return Array.from({ length: n }, () => ({
    kcal,
    isLogged: true,
    isIncomplete: false
  }));
}

function downResult() {
  return NC.compute({
    days: loggedDays(21),
    formulaPerDay: 2400,
    trend: { deltaKg: -0.267, measuredDays: 21, windowDays: 21 },
    currentFactor: 1,
    historyDays: 60
  });
}

function cardArgs(overrides = {}) {
  const result = downResult();
  const expenditure = 2400;
  const deficitPct = -12;
  const basalMetabolism = 1520;
  const before = NC.applyFactor({
    expenditure,
    factor: result.currentFactor,
    deficitPct,
    basalMetabolism
  });
  const after = NC.applyFactor({
    expenditure,
    factor: result.nextFactor,
    deficitPct,
    basalMetabolism
  });
  return {
    result,
    tariff: 'pro',
    expenditure,
    deficitPct,
    basalMetabolism,
    appliedDecision: null,
    curatorKeptDecision: null,
    ...overrides
  };
}

beforeEach(() => {
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(src);
  NC = window.HEYS.NormCorrection;
});

describe('norm-correction · куратор оставил норму', () => {
  it('isCuratorKeptDecision принимает только postponed/frozen от куратора', () => {
    expect(NC.isCuratorKeptDecision({ what: 'postponed', by: 'curator' })).toBe(true);
    expect(NC.isCuratorKeptDecision({ what: 'frozen', by: 'curator' })).toBe(true);
    expect(NC.isCuratorKeptDecision({ what: 'postponed', by: 'client' })).toBe(false);
    expect(NC.isCuratorKeptDecision({ what: 'applied', by: 'curator' })).toBe(false);
    expect(NC.isCuratorKeptDecision(null)).toBe(false);
  });

  it('findCuratorKeptDecision видит решение только в день ответа куратора', () => {
    const today = new Date('2026-09-05T15:00:00');
    const row = {
      weekLabel: '2026-09-05',
      what: 'postponed',
      by: 'curator',
      at: today.getTime()
    };
    expect(NC.findCuratorKeptDecision({ weeks: [row], now: today })).toEqual(row);
    expect(NC.findCuratorKeptDecision({
      weeks: [row],
      now: new Date('2026-09-06T09:00:00')
    })).toBeNull();
  });

  it('куратор посмотрел и оставил норму → клиент видит кадр curator_kept', () => {
    const now = new Date('2026-09-05T12:00:00');
    const kept = {
      weekLabel: '2026-09-05',
      what: 'postponed',
      by: 'curator',
      at: now.getTime()
    };
    const card = NC.buildWeeklySyncCard(cardArgs({
      curatorKeptDecision: kept
    }));

    expect(card.frame).toBe('curator_kept');
    expect(card.copy.title).toBe('Ваша норма сегодня');
    expect(card.titleAs).toBe('key');
    expect(card.copy.heroCaption).toBe('без изменений');
    expect(card.copy.body).toContain('Куратор посмотрел поправку');
    expect(card.facts).toEqual([
      { label: 'Предложение было', value: '2\u00a0049', tone: 'muted' },
      { label: 'Решение', value: 'оставить 2\u00a0112', tone: 'quiet' },
      {
        label: 'Вернёмся к вопросу',
        value: 'в следующий понедельник',
        tone: 'quiet'
      }
    ]);
    expect(card.actions).toEqual(['ask_curator']);
  });

  it('никто не смотрел → клиент видит pending_curator, не curator_kept', () => {
    const card = NC.buildWeeklySyncCard(cardArgs());
    expect(card.frame).toBe('pending_curator');
    expect(card.frame).not.toBe('curator_kept');
  });

  it('вчерашний отказ куратора не подменяет ожидание — только сегодняшний канал', () => {
    const yesterday = new Date('2026-09-04T18:00:00');
    const weeks = [{
      weekLabel: '2026-09-04',
      what: 'frozen',
      by: 'curator',
      at: yesterday.getTime()
    }];
    const kept = NC.findCuratorKeptDecision({
      weeks,
      now: new Date('2026-09-05T10:00:00')
    });
    expect(kept).toBeNull();

    const card = NC.buildWeeklySyncCard(cardArgs({ curatorKeptDecision: kept }));
    expect(card.frame).toBe('pending_curator');
  });

  it('gather подхватывает последнюю запись куратора без совпадения weekLabel', () => {
    const store = new Map();
    const now = new Date('2026-09-05T14:30:00');
    const lsGet = (key, fallback) => (store.has(key) ? store.get(key) : fallback);
    const lsSet = (key, value) => { store.set(key, value); };

    store.set('heys_profile', {
      hasCurator: true,
      normCorrectionFactor: 1,
      deficitPctTarget: -12,
      weight: 80,
      height: 175,
      age: 30,
      gender: 'female'
    });
    store.set(NC.HISTORY_KEY, {
      weeks: [{
        weekLabel: '2026-09-05',
        what: 'postponed',
        by: 'curator',
        at: now.getTime(),
        factor: 0.97
      }]
    });

    for (let i = 21; i >= 1; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      store.set('heys_dayv2_' + dateStr, {
        meals: [{ items: [{ id: 'p1', grams: 100 }] }],
        dayTot: { kcal: 2112 },
        steps: 8000,
        weightMorning: 80 - i * 0.01
      });
    }

    window.HEYS.TDEE = {
      calculate: () => ({
        baseExpenditure: 2400,
        bmr: 1520,
        deficitPct: -12
      })
    };
    window.HEYS.Widgets = {
      WeightDynamicsV4: {
        trendForWindow: () => ({ deltaKg: -0.267, measuredDays: 21, windowDays: 21 })
      }
    };
    window.HEYS.DisciplineMatrix = { countHistoryDays: () => 60 };

    const gathered = NC.gather({
      lsGet,
      lsSet,
      now,
      weekLabel: '1–7 сент',
      readOnly: true
    });

    expect(gathered?.card?.frame).toBe('curator_kept');
  });
});

describe('norm-correction · шапка Pro-кадров', () => {
  beforeEach(() => {
    mountNormCorrectionStyles();
    mountHeader('решение принято');
  });

  afterEach(() => {
    document.getElementById('norm-correction-test-styles')?.remove();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-palette');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-id');
  });

  it('полноэкранные Pro-кадры идут через NormCorrectionScreen с разными пилюлями', () => {
    expect(WEEKLY_SRC).toContain("const NORM_CORRECTION_FULL_FRAMES = new Set(['lowered', 'pending_curator', 'curator_kept'])");
    expect(WEEKLY_SRC).toContain("badge: 'решает куратор'");
    expect(WEEKLY_SRC).toContain("badge: 'решение принято'");
    expect(WEEKLY_SRC).toContain('NORM_CORRECTION_FULL_FRAMES.has(correction?.card?.frame)');
  });

  it('computed sand + blue · пилюля, ключ и факты curator_kept', () => {
    const sample = {};
    for (const palette of ['sand', 'blue']) {
      applyTheme(palette);

      const rootStyle = getComputedStyle(document.documentElement);
      const badge = getComputedStyle(document.querySelector('.norm-correction-screen__badge'));
      const titleKey = getComputedStyle(document.querySelector('.weekly-wrap-correction__title.is-key'));
      const proposal = getComputedStyle(document.querySelector('.weekly-wrap-correction__fact-value.is-muted'));
      const decision = getComputedStyle(document.querySelector('.weekly-wrap-correction__fact-value.is-quiet'));

      expect(badge.textTransform).toBe('uppercase');
      expect(badge.borderRadius).toBe('999px');
      expect(titleKey.fontSize).toBe('10.5px');
      expect(proposal.fontSize).toBe('12.5px');
      expect(decision.fontSize).toBe('11px');

      sample[palette] = {
        ink2: rootStyle.getPropertyValue('--v4-ink-2').trim(),
        ink3: rootStyle.getPropertyValue('--v4-ink-3').trim(),
        inkData: rootStyle.getPropertyValue('--v4-ink-data').trim(),
        hero: rootStyle.getPropertyValue('--v4-hero').trim(),
        badgeBg: normalizeColor(badge.backgroundColor),
        titleKey: normalizeColor(titleKey.color),
        proposal: normalizeColor(proposal.color),
        decision: normalizeColor(decision.color),
      };

      expect(sample[palette].ink2).toBe('rgba(0, 0, 0, 0.55)');
      expect(sample[palette].ink3).toBe('rgba(0, 0, 0, 0.45)');
    }

    expect(sample.sand.inkData).toBe('rgba(0, 0, 0, 0.56)');
    expect(sample.blue.inkData).toBe('rgba(16, 24, 38, 0.64)');

    expect(sample.sand.ink2).toBe(sample.blue.ink2);
    expect(sample.sand.ink3).toBe(sample.blue.ink3);
    expect(sample.sand.inkData).not.toBe(sample.blue.inkData);
    expect(sample.sand.badgeBg).toBe('rgb(239, 227, 207)');
    expect(sample.blue.badgeBg).toBe('rgb(226, 236, 246)');
    expect(sample.sand.hero).toBe('#efe3cf');
    expect(sample.blue.hero).toBe('#e2ecf6');
    expect(COMPONENTS_CSS).toMatch(/\.norm-correction-screen__badge \{[^}]*--v4-ink-2/);
    expect(COMPONENTS_CSS).toMatch(/\.weekly-wrap-correction__fact-value\.is-muted \{[^}]*--v4-ink-2/);
  });
});
