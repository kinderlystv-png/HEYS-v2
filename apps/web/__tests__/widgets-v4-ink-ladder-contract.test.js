import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/home-widgets.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/730-widgets-dashboard.css');
const PALETTE = path.resolve(__dirname, '../styles/modules/002-ui-v4-palette-roles.css');

function contractValue(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<b>${escaped}<\\/b><span data-v="([^"]*)"`))?.[1] || '';
}

// `.widgets-longpress-hint__sub` в списке нет намеренно: у подсказки жеста есть
// строка-владелец вида «вид подсказки жеста», и она называет свой тон —
// «чернилами 60 %». Общая лестница не должна проглатывать элемент, у которого
// свой контракт называет другую ступень: 60 % ближе к 62 % (`--v4-ink-prose`),
// чем к 56 %. Тон подсказки сторожит `longpress-hint-product-rule.test.js`.
const SMALL_NEUTRAL_TEXT = `
.widget-v4-kicker
.widget-calories__hero-unit
.widget-calories__hero-remaining-label
.widget-calories__hero-bar-num
.widget-calories__hero-bar-cap
.widget-v4-row__meta
.widget-v4-unit
.widget-v4-muted
.widget-v4-insulin-wave__note
.widget-v4-insulin-daybar__labels
.widget-v4-insulin-wave__overlap-note
.widget-v4-kv__row
.widget-v4-periods__btn
.widget-v4-periods__suffix
.widget-v4-catalog__about
.widget-v4-catalog__hint
.widget-v4-catalog__name
.widget-v4-catalog__item--soon .widget-v4-catalog__name
.widget-v4-catalog__item--waiting .widget-v4-catalog__name
.widget-v4-edit-footer__hint
.widget-v4-empty .widgets-empty__desc
.widget-v4-hint
.widget-v4-mealbars__time
.widget-v4-mealbars__num
.widget-v4-rhythm__scale
.widget-v4-checklist__chip
.widget-v4-checklist__row
.widget-v4-recommended__desc
.widget-wd__remainder
.widget-wd-sheet__subtitle
.widget-wd-sheet__opt-title
.widget-wd-sheet__opt-sub
.widget-risk-rise
.widget-calories__activity-foot
.widget-calories__line-unit
.widget-calories__line-meta
.widget-calories__line-fraction
.widget-calories__dinner-row
.widget-v4-deficit-rows
.widget-v4-factor-cols__label
.widget-v4-sleep-window__labels
.widget-weight__scatter-foot
.widget-heatmap__month-meta
.widget-bd-sheet__kicker
.widget-bd-sheet__chart-label
.widget-bd-sheet__water-axis
.widget-bd-sheet__grid-label
.widget-bd-sheet__sleep-timeline-label
.widget-bd-sheet__sleep-axis
.widget-bd-sheet__wave-week-label
.widget-bd-sheet__hero-track-val
.widget-bd-sheet__hero-track-label
.widget-bd-sheet__stat-label
.widget-bd-sheet__norm
.widget-bd-sheet__factor-share
.widget-bd-sheet__driver
.widget-bd-sheet__contrib-label
.widget-bd-sheet__source-name
.widget-bd-sheet__source-val
.widget-bd-sheet__meal-axis
.widget-bd-sheet__evening-label
.widget-bd-sheet__evening-empty
`.trim().split('\n');

describe('семантическая лестница чернил home-widgets', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const css = fs.readFileSync(CSS, 'utf8');
  const palette = fs.readFileSync(PALETTE, 'utf8');
  const rules = readRules(css);

  it('берёт семь ступеней и пол 56 % из актуального data-v', () => {
    const contract = contractValue(canvas, 'лестница чернил · правило продукта');
    expect(contract).toContain('62 % — проза');
    expect(contract).toContain('56 % — дно тона для ДАННЫХ');
    expect(contract).toContain('45 % — подписи и ярусы');
    expect(contract).toContain('38 % — вторичные подписи и знаменатели');
    expect(contract).toContain('30 % — разметка, которая не данные');
    expect(contract).toContain('12 % — жёлоба дорожек');
    expect(contract).toContain('7–8 % — линии и разделители');
    expect(contract).toContain('Мелкая подпись берёт 56 %');
    expect(contract).toContain('Промежуточных ступеней (42, 50) НЕ ЗАВОДИМ');
  });

  it('строит точные роли от raw ink-rgb каждого набора', () => {
    for (const role of [
      ['prose', '0.62'],
      ['data', '0.56'],
      ['label', '0.45'],
      ['secondary', '0.38'],
      ['mark', '0.3'],
    ]) {
      expect(palette).toContain(`--v4-ink-${role[0]}: rgba(var(--v4-ink-rgb), ${role[1]});`);
    }
    expect(palette.match(/--v4-ink-rgb:/g)).toHaveLength(4);
    expect(palette).toContain('--v4-ink-rgb: 0, 0, 0;');
    expect(palette).toContain('--v4-ink-rgb: 242, 237, 230;');
    expect(palette).toContain('--v4-ink-rgb: 16, 24, 38;');
    expect(palette).toContain('--v4-ink-rgb: 232, 238, 246;');
  });

  it('держит все названные мелкие нейтральные подписи на data 56 %', () => {
    const wrong = SMALL_NEUTRAL_TEXT.flatMap((selector) => {
      const color = rules.get(selector)?.color || '';
      return color.includes('--v4-ink-data') ? [] : [`${selector}: ${color || 'нет color'}`];
    });
    expect(wrong).toEqual([]);
  });

  it('сохраняет смысл ступеней у текста от 12 px и у разметки', () => {
    expect(rules.get('.widget-v4-macro__num')?.fill).toContain('--v4-ink-data');
    expect(rules.get('.widget-v4-macro__fact-sep')?.color).toContain('--v4-ink-secondary');
    expect(rules.get('.widget-v4-macro__fact-tgt')?.color).toContain('--v4-ink-secondary');
    expect(rules.get('.widget-bd-sheet__hero-unit')?.color).toContain('--v4-ink-secondary');
    expect(rules.get('.widget-bd-sheet__insight')?.color).toContain('--v4-ink-prose');
    expect(rules.get('.widget-bd-sheet__hero-track-name')?.color).toContain('--v4-ink-label');
    expect(rules.get('.widget-v4-edit-footer__icon')?.color).toContain('--v4-ink-label');
    expect(rules.get('.widget-v4-edit-footer__icon.is-off')?.color).toContain('--v4-ink-mark');
  });

  it('не оставляет literal light-ink у нейтрального текста home', () => {
    expect(css).not.toMatch(/color:\s*#201e1d\s*;/i);
    expect(css).not.toMatch(/color:\s*rgba\(0,\s*0,\s*0,/i);
  });
});
