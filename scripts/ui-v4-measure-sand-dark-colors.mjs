#!/usr/bin/env node
/**
 * Sand + sand-dark computed colors @375 px with palette attrs on root.
 * Committed counterpart of lane-5 measure (3dff4b866).
 *
 *   node scripts/ui-v4-measure-sand-dark-colors.mjs
 *   node scripts/ui-v4-measure-sand-dark-colors.mjs --out=scripts/.tmp-lane5-measurements.json
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg
  ? path.resolve(ROOT, outArg.slice('--out='.length))
  : path.join(ROOT, 'scripts/.tmp-lane5-measurements.json');

const SETS = [
  { id: 'sand', themeId: 'sand', theme: 'sand', palette: 'sand' },
  { id: 'sand-dark', themeId: 'sand-dark', theme: 'sand-dark', palette: 'sand' },
];

const BASE = ['001-design-tokens.css', '002-ui-v4-palette-roles.css'];

function cssImport(files) {
  return files
    .map((f) => `@import url("${path.join(MODULES, f).replace(/\\/g, '/')}");`)
    .join('\n');
}

export function fmtColor(rgb) {
  if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return rgb || 'none';
  const m = /^rgba?\(([^)]+)\)/.exec(String(rgb).trim());
  if (!m) return String(rgb).replace(/\s+/g, '');
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length === 4) {
    const a = Math.round(Number(parts[3]) * 100) / 100;
    return `rgba(${parts[0]},${parts[1]},${parts[2]}/${a})`;
  }
  return `rgb(${parts[0]},${parts[1]},${parts[2]})`.replace(/\s+/g, '');
}

export function formatDualFact(probeId, measurements) {
  const sand = measurements[`${probeId}|sand`];
  const dark = measurements[`${probeId}|sand-dark`];
  if (!sand || !dark) throw new Error(`missing measure ${probeId}`);
  return `Замер chromium 375 px: песочный ${sand}, тёмный ${dark}`;
}

/** @type {Array<{id:string, css:string[], html:string, probes:Array<{id:string, sel:string, prop:string}>}>} */
export const FIXTURES = [
  {
    id: 'yv',
    css: [...BASE, '715-yesterday-verify.css'],
    html: `<div class="yv-hero"><div class="yv-hero-title">Title</div><div class="yv-hero-sub">Sub</div></div>
<div class="yv-pack-day"><span class="yv-pack-day-title">Day</span><span class="yv-pack-day-meta">meta</span></div>
<p class="yv-pack-note">note</p>
<div class="yv-pack-row"><button class="yv-pack-secondary">sec</button><button class="yv-pack-secondary yv-pack-secondary--feelings">feel</button></div>
<div class="yv-food-card"><div class="yv-food-row">Еда</div><div class="yv-food-value">+500</div></div>
<div class="yv-v4-slider-fill yv-v4-slider-fill--norm" style="width:50%"></div>
<div class="mc-estimated-badge">расчётный</div>
<button class="yv-text-later">Позже</button>`,
    probes: [
      { id: 'yv-hero-title', sel: '.yv-hero-title', prop: 'color' },
      { id: 'yv-hero-sub', sel: '.yv-hero-sub', prop: 'color' },
      { id: 'yv-pack-day-bg', sel: '.yv-pack-day', prop: 'backgroundColor' },
      { id: 'yv-pack-day-title', sel: '.yv-pack-day-title', prop: 'color' },
      { id: 'yv-pack-day-meta', sel: '.yv-pack-day-meta', prop: 'color' },
      { id: 'yv-pack-note', sel: '.yv-pack-note', prop: 'color' },
      { id: 'yv-pack-secondary-bg', sel: '.yv-pack-secondary', prop: 'backgroundColor' },
      { id: 'yv-pack-secondary-color', sel: '.yv-pack-secondary', prop: 'color' },
      { id: 'yv-pack-secondary-feelings-bg', sel: '.yv-pack-secondary--feelings', prop: 'backgroundColor' },
      { id: 'yv-food-card-bg', sel: '.yv-food-card', prop: 'backgroundColor' },
      { id: 'yv-food-row', sel: '.yv-food-row', prop: 'color' },
      { id: 'yv-food-value', sel: '.yv-food-value', prop: 'color' },
      { id: 'yv-slider-fill-bg', sel: '.yv-v4-slider-fill--norm', prop: 'backgroundImage' },
      { id: 'yv-estimated-badge-bg', sel: '.mc-estimated-badge', prop: 'backgroundColor' },
      { id: 'yv-estimated-badge-color', sel: '.mc-estimated-badge', prop: 'color' },
      { id: 'yv-text-later', sel: '.yv-text-later', prop: 'color' },
    ],
  },
  {
    id: 'nutrition',
    css: [...BASE, '732-ui-v4-nutrition.css'],
    html: `<button class="nutrition-v4-chip">On</button>
<button class="nutrition-v4-chip is-off">Off</button>
<button class="nutrition-v4-supplements__pill is-course">Курс</button>`,
    probes: [
      { id: 'chip-on-bg', sel: '.nutrition-v4-chip:not(.is-off)', prop: 'backgroundColor' },
      { id: 'chip-off-bg', sel: '.nutrition-v4-chip.is-off', prop: 'backgroundColor' },
      { id: 'chip-course-color', sel: '.nutrition-v4-supplements__pill.is-course', prop: 'color' },
      { id: 'chip-course-border', sel: '.nutrition-v4-supplements__pill.is-course', prop: 'borderColor' },
    ],
  },
  {
    id: 'undo',
    css: [...BASE, '../heys-components.css'],
    html: `<div class="heys-undo-bar heys-undo-bar--visible"><div class="heys-undo-bar__content">
<div class="heys-undo-bar__ring"><span class="heys-undo-bar__count">5</span></div>
<span class="heys-undo-bar__label">Удалено</span><button class="heys-undo-bar__btn">Отменить</button></div></div>`,
    probes: [
      { id: 'undo-bar-bg', sel: '.heys-undo-bar', prop: 'backgroundColor' },
      { id: 'undo-count', sel: '.heys-undo-bar__count', prop: 'color' },
      { id: 'undo-btn-bg', sel: '.heys-undo-bar__btn', prop: 'backgroundColor' },
      { id: 'undo-btn-color', sel: '.heys-undo-bar__btn', prop: 'color' },
    ],
  },
  {
    id: 'subscription',
    css: [...BASE, '735-ui-v4-subscription.css'],
    html: `<div class="paywall-order-card"><div class="paywall-order-name">Pro</div><div class="paywall-order-price">7 990 ₽</div></div>
<label class="paywall-consent"><span class="paywall-consent-box is-checked"></span><span class="paywall-consent-text">Принимаю</span><a class="paywall-consent-link" href="#">условия</a></label>
<button class="paywall-cta">Оплатить</button>
<div class="paywall-success-icon">✓</div>
<div class="paywall-success-card"><span class="n">Готово</span></div>
<div class="sub-welcome-scrim"></div>`,
    probes: [
      { id: 'paywall-order-card-bg', sel: '.paywall-order-card', prop: 'backgroundColor' },
      { id: 'paywall-name', sel: '.paywall-order-name', prop: 'color' },
      { id: 'paywall-price', sel: '.paywall-order-price', prop: 'color' },
      { id: 'paywall-success-icon-bg', sel: '.paywall-success-icon', prop: 'backgroundColor' },
      { id: 'paywall-success-icon-color', sel: '.paywall-success-icon', prop: 'color' },
      { id: 'paywall-success-card-bg', sel: '.paywall-success-card', prop: 'backgroundColor' },
      { id: 'sub-welcome-scrim-bg', sel: '.sub-welcome-scrim', prop: 'backgroundColor' },
      { id: 'paywall-consent-box', sel: '.paywall-consent-box.is-checked', prop: 'backgroundColor' },
      { id: 'paywall-consent-text', sel: '.paywall-consent-text', prop: 'color' },
      { id: 'paywall-consent-link', sel: '.paywall-consent-link', prop: 'color' },
      { id: 'paywall-cta-bg', sel: '.paywall-cta', prop: 'backgroundColor' },
      { id: 'paywall-cta-color', sel: '.paywall-cta', prop: 'color' },
    ],
  },
  {
    id: 'reports',
    css: [...BASE, '733-ui-v4-reports.css', '734-ui-v4-insights.css'],
    html: `<div class="reports-v4-days"><span class="reports-v4-days__right">+120</span></div>
<div class="reports-v4-summary-card"><div class="reports-v4-summary-card__value">42</div></div>
<span class="insights-v4-stub__count">3 из 7</span>
<span class="insights-v4-thresh__mine">56</span>`,
    probes: [
      { id: 'reports-days-right', sel: '.reports-v4-days__right', prop: 'color' },
      { id: 'reports-summary-value', sel: '.reports-v4-summary-card__value', prop: 'color' },
      { id: 'insights-stub-count', sel: '.insights-v4-stub__count', prop: 'color' },
      { id: 'insights-thresh-mine', sel: '.insights-v4-thresh__mine', prop: 'color' },
    ],
  },
  {
    id: 'date',
    css: [...BASE, '000-base-and-gamification.css'],
    html: `<div class="date-picker--v4 date-picker--past"><button class="date-picker-day-nav"></button>
<div class="date-picker-trigger-lbl"><div class="date-picker-lbl-inner"><span class="date-picker-main date-picker-main--past">Вчера</span></div></div></div>
<div class="date-picker--v4"><span class="date-picker-inline-today">Сегодня</span></div>
<div class="date-picker--v4"><button class="date-picker-day-nav date-picker-day-nav--disabled" disabled></button></div>
<button class="date-picker-btn today-btn">Вернуться</button>
<div class="date-picker-sheet"><button class="date-picker-day cycle-ribbon--period"></button><button class="date-picker-sheet-month-nav">‹</button></div>`,
    probes: [
      { id: 'date-past-nav-bg', sel: '.date-picker--past .date-picker-day-nav', prop: 'backgroundColor' },
      { id: 'date-past-main', sel: '.date-picker-main--past', prop: 'color' },
      { id: 'date-inline-today', sel: '.date-picker-inline-today', prop: 'color' },
      { id: 'date-nav-disabled-bg', sel: '.date-picker-day-nav--disabled', prop: 'backgroundColor' },
      { id: 'date-sheet-month-nav-bg', sel: '.date-picker-sheet-month-nav', prop: 'backgroundColor' },
      { id: 'date-today-btn-bg', sel: '.date-picker-btn.today-btn', prop: 'backgroundColor' },
      { id: 'date-today-btn-color', sel: '.date-picker-btn.today-btn', prop: 'color' },
      { id: 'cycle-ribbon-period-bg', sel: '.cycle-ribbon--period', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'pwa-mc',
    css: [...BASE, '500-pwa-and-offline.css'],
    html: `<button class="mc-pill--choice is-on">Да</button>
<span class="mc-rest-chevron">›</span>
<span class="mc-rest-supp-add-icon"></span>
<span class="mc-wheel-value--current">12</span>
<div class="mc-rest-row mc-rest-row--overdue"></div>
<button class="mc-rest-type is-on">Тип</button>
<div class="mc-rest-measure-side-pill is-on">32</div>
<div class="cycle-card-v4 cycle-card-v4--filled"><div class="cycle-card-v4__insight">i</div></div>
<span class="mc-recorded-check">✓</span>
<div class="mc-backdrop"></div>`,
    probes: [
      { id: 'mc-pill-on-bg', sel: '.mc-pill--choice.is-on', prop: 'backgroundColor' },
      { id: 'mc-pill-on-color', sel: '.mc-pill--choice.is-on', prop: 'color' },
      { id: 'mc-rest-chevron-color', sel: '.mc-rest-chevron', prop: 'color' },
      { id: 'mc-rest-supp-add-icon-bg', sel: '.mc-rest-supp-add-icon', prop: 'backgroundColor' },
      { id: 'mc-wheel-current-color', sel: '.mc-wheel-value--current', prop: 'color' },
      { id: 'mc-rest-row-overdue-bg', sel: '.mc-rest-row--overdue', prop: 'backgroundColor' },
      { id: 'mc-rest-type-on-bg', sel: '.mc-rest-type.is-on', prop: 'backgroundColor' },
      { id: 'mc-rest-measure-pill-on-bg', sel: '.mc-rest-measure-side-pill.is-on', prop: 'backgroundColor' },
      { id: 'cycle-card-bg', sel: '.cycle-card-v4--filled', prop: 'backgroundColor' },
      { id: 'cycle-card-insight-color', sel: '.cycle-card-v4__insight', prop: 'color' },
      { id: 'mc-recorded-check-color', sel: '.mc-recorded-check', prop: 'color' },
      { id: 'mc-backdrop-bg', sel: '.mc-backdrop', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'gamification',
    css: [...BASE, '000-base-and-gamification.css'],
    html: `<div class="game-v4-sheet__bar game-v4-sheet__bar--thin"><div class="game-v4-sheet__bar-fill" style="width:60%"></div></div>
<div class="game-v4-sheet__bar"><div class="game-v4-sheet__bar-fill is-complete" style="width:100%"></div></div>
<div class="game-v4-sheet__hero game-v4-sheet__hero--cream">hero</div>
<svg class="game-v4-sheet__hero-ring" width="80" height="80" viewBox="0 0 80 80"><path class="game-v4-sheet__hero-ring-path" d="M40,8 A32,32 0 1 1 39,8" style="--ring-len:200"></path></svg>`,
    probes: [
      { id: 'game-bar-fill-bg', sel: '.game-v4-sheet__bar-fill:not(.is-complete)', prop: 'backgroundColor' },
      { id: 'game-bar-fill-complete-bg', sel: '.game-v4-sheet__bar-fill.is-complete', prop: 'backgroundColor' },
      { id: 'game-hero-cream-bg', sel: '.game-v4-sheet__hero--cream', prop: 'backgroundColor' },
      { id: 'game-hero-ring-stroke', sel: '.game-v4-sheet__hero-ring-path', prop: 'stroke' },
    ],
  },
  {
    id: 'subscription-ro',
    css: [...BASE, '735-ui-v4-subscription.css'],
    html: `<div class="readonly-banner readonly-banner--sticky"><div class="readonly-banner-content"><div class="readonly-banner-title">T</div><div class="readonly-banner-text">x</div></div><button class="readonly-banner-pill">Подписка</button></div>
<div class="readonly-toast"><span class="readonly-toast-label">L</span><span class="readonly-toast-action">Подписка</span></div>
<div class="sub-screen__status-card">card</div>
<div class="sub-screen__footnote">note</div>
<div class="sub-screen__support-link">help</div>
<div class="paywall-overlay"></div>
<div class="paywall-trial paywall-trial--offer"><div class="paywall-trial-title">T</div><span class="paywall-trial-dot paywall-trial-dot--ok"></span></div>
<button class="paywall-btnq">q</button>
<div class="paywall-divider"><span class="paywall-divider-line"></span></div>`,
    probes: [
      { id: 'readonly-banner-sticky-bg', sel: '.readonly-banner--sticky', prop: 'backgroundColor' },
      { id: 'readonly-banner-pill-bg', sel: '.readonly-banner-pill', prop: 'backgroundColor' },
      { id: 'readonly-banner-pill-color', sel: '.readonly-banner-pill', prop: 'color' },
      { id: 'readonly-toast-bg', sel: '.readonly-toast', prop: 'backgroundColor' },
      { id: 'readonly-toast-action-color', sel: '.readonly-toast-action', prop: 'color' },
      { id: 'sub-screen-status-card-bg', sel: '.sub-screen__status-card', prop: 'backgroundColor' },
      { id: 'sub-screen-footnote-bg', sel: '.sub-screen__footnote', prop: 'backgroundColor' },
      { id: 'sub-screen-support-link-color', sel: '.sub-screen__support-link', prop: 'color' },
      { id: 'paywall-overlay-bg', sel: '.paywall-overlay', prop: 'backgroundColor' },
      { id: 'paywall-trial-bg', sel: '.paywall-trial', prop: 'backgroundColor' },
      { id: 'paywall-trial-dot-bg', sel: '.paywall-trial-dot--ok', prop: 'backgroundColor' },
      { id: 'paywall-btnq-bg', sel: '.paywall-btnq', prop: 'backgroundColor' },
      { id: 'paywall-divider-line-bg', sel: '.paywall-divider-line', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'strength',
    css: [...BASE, '750-strength-builder.css', '731-ui-v4-activity.css'],
    html: `<button class="sb-chip is-on">chip</button>
<button class="sb-star is-on">★</button>
<div class="sb-plan-vs-summary">sum</div>
<div class="sb-plan-vs-cell is-done">done</div>
<span class="sb-plan-vs-cell-val is-positive">+1</span>
<div class="sb-finish-hero">hero</div>
<div class="sb-ss-member-card">m</div>
<div class="sb-root sb-builder-screen is-exercise-open is-weight-entry"><div class="sb-aps-head"><span>1</span><span>Вес</span><span>+2</span></div><div class="sb-ap is-done"><span class="sb-ap-num">1</span></div></div>
<div class="sb-root sb-builder-screen is-exercise-open is-time-entry"><div class="sb-aps-head"><span>1</span><span>Время</span><span>30с</span></div></div>
<div class="sb-root sb-builder-screen is-exercise-open is-distance-entry"><div class="sb-aps-head"><span>1</span><span>Метры</span><span>100</span></div></div>
<div class="sb-root sb-builder-screen is-exercise-open is-bodyweight-entry"><div class="sb-aps-head"><span>1</span><span>Вес</span><span>80</span></div></div>
<div class="sb-root"><span class="program-done-growth-val">+12%</span></div>
<div class="sb-root sb-history-screen"><div class="sb-history-metrics"><div class="sb-finish-metric is-accent"></div><div class="sb-finish-metric"></div></div></div>
<div class="sb-root sb-superset-create-screen"><button class="sb-radio is-on"><span class="sb-ex-num">3</span></button><div class="sb-stepper"><button class="sb-btn is-accent">+</button></div></div>
<div class="sb-root"><div class="sb-pain--canvas">pain</div></div>
<div class="sb-root"><div class="sb-sheet-back"></div></div>
<div class="sb-root activity-v4-program"><span class="sb-plan-letter">B</span></div>
<div class="sb-root"><div class="sb-curator-edit-card is-primary" style="background:var(--c1);border-radius:20px;padding:2px 16px;margin-top:12px"><span class="sb-curator-edit-mark is-ok" style="font:700 12px/1 Figtree,sans-serif;color:var(--gr)">✓</span></div></div>
<div class="sb-root sb-period-report"><div class="sb-period-outcomes"><div class="sb-period-outcome-row"><span class="sb-period-outcome-val is-ok">4</span></div></div></div>`,
    probes: [
      { id: 'sb-chip-on-bg', sel: '.sb-chip.is-on', prop: 'backgroundColor' },
      { id: 'sb-chip-on-color', sel: '.sb-chip.is-on', prop: 'color' },
      { id: 'sb-star-on-color', sel: '.sb-star.is-on', prop: 'color' },
      { id: 'sb-plan-vs-summary-bg', sel: '.sb-plan-vs-summary', prop: 'backgroundColor' },
      { id: 'sb-plan-vs-cell-done-bg', sel: '.sb-plan-vs-cell.is-done', prop: 'backgroundColor' },
      { id: 'sb-plan-vs-cell-val-color', sel: '.sb-plan-vs-cell-val.is-positive', prop: 'color' },
      { id: 'sb-finish-hero-bg', sel: '.sb-finish-hero', prop: 'backgroundColor' },
      { id: 'sb-ss-member-card-bg', sel: '.sb-ss-member-card', prop: 'backgroundColor' },
      { id: 'sb-weight-head-hint-color', sel: '.sb-builder-screen.is-weight-entry .sb-aps-head > span:last-child', prop: 'color' },
      { id: 'sb-time-head-hint-color', sel: '.sb-builder-screen.is-time-entry .sb-aps-head > span:last-child', prop: 'color' },
      { id: 'sb-distance-head-hint-color', sel: '.sb-builder-screen.is-distance-entry .sb-aps-head > span:last-child', prop: 'color' },
      { id: 'sb-bodyweight-head-hint-color', sel: '.sb-builder-screen.is-bodyweight-entry .sb-aps-head > span:last-child', prop: 'color' },
      { id: 'sb-weight-done-ap-num-color', sel: '.sb-builder-screen.is-weight-entry .sb-ap.is-done .sb-ap-num', prop: 'color' },
      { id: 'program-done-growth-val-color', sel: '.program-done-growth-val', prop: 'color' },
      { id: 'sb-history-metric-bg', sel: '.sb-history-metrics .sb-finish-metric:nth-child(2)', prop: 'backgroundColor' },
      { id: 'sb-radio-on-num-bg', sel: '.sb-radio.is-on .sb-ex-num', prop: 'backgroundColor' },
      { id: 'sb-radio-on-num-color', sel: '.sb-radio.is-on .sb-ex-num', prop: 'color' },
      { id: 'sb-stepper-accent-bg', sel: '.sb-stepper .sb-btn.is-accent', prop: 'backgroundColor' },
      { id: 'sb-stepper-accent-color', sel: '.sb-stepper .sb-btn.is-accent', prop: 'color' },
      { id: 'sb-pain-canvas-bg', sel: '.sb-pain--canvas', prop: 'backgroundColor' },
      { id: 'sb-sheet-back-bg', sel: '.sb-sheet-back', prop: 'backgroundColor' },
      { id: 'sb-plan-letter-color', sel: '.sb-plan-letter', prop: 'color' },
      { id: 'sb-curator-card-bg', sel: '.sb-curator-edit-card.is-primary', prop: 'backgroundColor' },
      { id: 'sb-curator-mark-ok-color', sel: '.sb-curator-edit-mark.is-ok', prop: 'color' },
      { id: 'sb-period-outcomes-bg', sel: '.sb-period-outcomes', prop: 'backgroundColor' },
      { id: 'sb-period-outcome-val-ok-color', sel: '.sb-period-outcome-val.is-ok', prop: 'color' },
    ],
  },
  {
    id: 'food-meal',
    css: [...BASE, '610-aps-meal-flow.css'],
    html: `<div class="meal-time-wave">w</div>
<button class="meal-time-cta">cta</button>
<button class="aps-v4-grams-chip">g</button>
<button class="aps-v4-grams-chip is-active">g</button>
<button class="aps-v4-grams-unit is-active">Граммы</button>
<button class="meal-transfer-v4__gram-step">−</button>
<button class="mpr-preview-item-toggle">+</button>`,
    probes: [
      { id: 'meal-time-wave-bg', sel: '.meal-time-wave', prop: 'backgroundColor' },
      { id: 'meal-time-cta-bg', sel: '.meal-time-cta', prop: 'backgroundColor' },
      { id: 'meal-time-cta-color', sel: '.meal-time-cta', prop: 'color' },
      { id: 'aps-grams-chip-bg', sel: '.aps-v4-grams-chip:not(.is-active)', prop: 'backgroundColor' },
      { id: 'aps-grams-chip-active-bg', sel: '.aps-v4-grams-chip.is-active', prop: 'backgroundColor' },
      { id: 'aps-grams-chip-active-color', sel: '.aps-v4-grams-chip.is-active', prop: 'color' },
      { id: 'aps-grams-unit-active-color', sel: '.aps-v4-grams-unit.is-active', prop: 'color' },
      { id: 'meal-transfer-gram-step-bg', sel: '.meal-transfer-v4__gram-step', prop: 'backgroundColor' },
      { id: 'mpr-preview-toggle-bg', sel: '.mpr-preview-item-toggle', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'login',
    css: [...BASE, '733-ui-v4-login-theme.css'],
    html: `<div class="heys-login-theme__dots"><span class="heys-login-theme__dot is-act"></span><span class="heys-login-theme__dot is-ok"></span><span class="heys-login-theme__dot is-ring"></span></div>
<span class="heys-login-theme__caption">Оформление</span>
<div class="heys-auth-error">err</div>`,
    probes: [
      { id: 'login-theme-dot-act-bg', sel: '.heys-login-theme__dot.is-act', prop: 'backgroundColor' },
      { id: 'login-theme-caption-color', sel: '.heys-login-theme__caption', prop: 'color' },
      { id: 'login-auth-error-color', sel: '.heys-auth-error', prop: 'color' },
    ],
  },
  {
    id: 'curator',
    css: [...BASE, '734-ui-v4-curator-panel.css'],
    html: `<div class="cur-cab__title">Кабинет</div>
<div class="cur-sheet-scrim"></div>
<button class="cur-sheet__cta">Открыть</button>`,
    probes: [
      { id: 'cur-cab-title-color', sel: '.cur-cab__title', prop: 'color' },
      { id: 'cur-sheet-scrim-bg', sel: '.cur-sheet-scrim', prop: 'backgroundColor' },
      { id: 'cur-sheet-cta-bg', sel: '.cur-sheet__cta', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'product-card',
    css: [...BASE, '611-aps-product-card.css'],
    html: `<div class="aps-v4-harm-compare"><div class="aps-v4-harm-compare__card is-active"><span class="aps-v4-harm-compare__value">3</span></div></div>
<div class="aps-barcode-state">scan</div>
<div class="aps-v4-outcome aps-v4-outcome--warn">warn</div>
<div class="aps-barcode-unrecognized"><div class="aps-barcode-unrecognized__card">card</div></div>
<div class="aps-v4-portions-suggest"><span class="aps-v4-portions-row aps-v4-portions-row--readonly"><span class="aps-v4-portions-row__name">½</span></span></div>`,
    probes: [
      { id: 'harm-compare-active-border', sel: '.aps-v4-harm-compare__card.is-active', prop: 'borderColor' },
      { id: 'harm-compare-active-value', sel: '.aps-v4-harm-compare__card.is-active .aps-v4-harm-compare__value', prop: 'color' },
      { id: 'barcode-state-color', sel: '.aps-barcode-state', prop: 'color' },
      { id: 'aps-outcome-warn-bg', sel: '.aps-v4-outcome--warn', prop: 'backgroundColor' },
      { id: 'barcode-unrecognized-card-bg', sel: '.aps-barcode-unrecognized__card', prop: 'backgroundColor' },
      { id: 'aps-portions-readonly-bg', sel: '.aps-v4-portions-row--readonly', prop: 'backgroundColor' },
      { id: 'aps-portions-readonly-color', sel: '.aps-v4-portions-row--readonly', prop: 'color' },
    ],
  },
  {
    id: 'messenger',
    css: [...BASE, '1000-messenger.css'],
    html: `<div class="msg-row msg-row-mine"><div class="msg-bubble msg-bubble-mine"><div class="msg-body">hi</div></div></div>
<div class="msg-menu-item">more</div>
<button class="messenger-header-button is-open">⋯</button>
<div class="messenger-subtitle"><span class="messenger-subtitle__dot is-offline"></span></div>
<button class="messenger-confirm-delete">Удалить</button>`,
    probes: [
      { id: 'msg-bubble-mine-bg', sel: '.msg-bubble-mine', prop: 'backgroundColor' },
      { id: 'msg-menu-item-color', sel: '.msg-menu-item', prop: 'color' },
      { id: 'msg-header-open-bg', sel: '.messenger-header-button.is-open', prop: 'backgroundColor' },
      { id: 'msg-offline-dot-bg', sel: '.messenger-subtitle__dot.is-offline', prop: 'backgroundColor' },
      { id: 'msg-confirm-delete-bg', sel: '.messenger-confirm-delete', prop: 'backgroundColor' },
      { id: 'msg-confirm-delete-color', sel: '.messenger-confirm-delete', prop: 'color' },
    ],
  },
  {
    id: 'tab-activity',
    css: [...BASE, '731-ui-v4-activity.css', '300-modals-and-day.css'],
    html: `<div class="ma-habit-cal--activity-v4"><button class="ma-habit-cal-cell is-done"></button>
<button class="ma-habit-cal-mode-btn is-active">M</button></div>
<div class="activity-v4-steps"><span class="activity-v4-steps__track"><span class="activity-v4-steps__fill" style="width:60%"></span></span></div>`,
    probes: [
      { id: 'habit-cal-cell-done-bg', sel: '.ma-habit-cal-cell.is-done', prop: 'backgroundColor' },
      { id: 'habit-cal-mode-active-bg', sel: '.ma-habit-cal-mode-btn.is-active', prop: 'backgroundColor' },
      { id: 'activity-steps-fill-bg', sel: '.activity-v4-steps__fill', prop: 'backgroundColor' },
      { id: 'activity-steps-track-bg', sel: '.activity-v4-steps__track', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'nutrition-zones',
    css: [...BASE, '732-ui-v4-nutrition.css'],
    html: `<div class="nutrition-v4-zones"><span class="nutrition-v4-zones__bar-fill" style="width:40%"></span></div>`,
    probes: [
      { id: 'nutrition-zones-bar-fill-bg', sel: '.nutrition-v4-zones__bar-fill', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'tips',
    css: [...BASE, '400-water-and-hydration.css'],
    html: `<div class="advice-v4-disclaimer-overlay"></div>
<div class="advice-v4-disclaimer-card__handle"></div>
<div class="advice-v4-popup">popup</div>
<div class="advice-v4-toast-card"><span class="advice-v4-toast-card__stripe advice-v4-toast-card__stripe--ok"></span></div>`,
    probes: [
      { id: 'advice-disclaimer-overlay-bg', sel: '.advice-v4-disclaimer-overlay', prop: 'backgroundColor' },
      { id: 'advice-disclaimer-handle-bg', sel: '.advice-v4-disclaimer-card__handle', prop: 'backgroundColor' },
      { id: 'advice-popup-bg', sel: '.advice-v4-popup', prop: 'backgroundColor' },
      { id: 'advice-toast-stripe-ok-bg', sel: '.advice-v4-toast-card__stripe--ok', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'pwa',
    css: [...BASE, '../heys-components.css'],
    html: `<div class="heys-update-modal__backdrop"></div>
<div class="heys-update-prompt__backdrop"></div>
<div class="heys-update-modal__card">card</div>`,
    probes: [
      { id: 'pwa-modal-backdrop-bg', sel: '.heys-update-modal__backdrop', prop: 'backgroundColor' },
      { id: 'pwa-prompt-backdrop-bg', sel: '.heys-update-prompt__backdrop', prop: 'backgroundColor' },
      { id: 'pwa-card-bg', sel: '.heys-update-modal__card', prop: 'backgroundColor' },
      { id: 'pwa-card-ink', sel: '.heys-update-modal__card', prop: 'color' },
    ],
  },
  {
    id: 'checkin',
    css: [...BASE, '500-pwa-and-offline.css', '300-modals-and-day.css'],
    html: `<span class="mc-supp-flow-empty-icon">+</span>
<button class="mc-supp-flow-btn mc-supp-flow-btn--primary">Добавить</button>
<button class="mc-rest-consent-primary">Подписать</button>
<div class="ma-followup-note"><div class="ma-followup-note-title">Утренняя рутина</div></div>
<button class="ma-followup-answer ma-followup-answer--done">Да</button>`,
    probes: [
      { id: 'mc-supp-empty-icon-bg', sel: '.mc-supp-flow-empty-icon', prop: 'backgroundColor' },
      { id: 'mc-supp-primary-btn-bg', sel: '.mc-supp-flow-btn--primary', prop: 'backgroundColor' },
      { id: 'mc-rest-consent-primary-bg', sel: '.mc-rest-consent-primary', prop: 'backgroundColor' },
      { id: 'ma-followup-note-bg', sel: '.ma-followup-note', prop: 'backgroundColor' },
      { id: 'ma-followup-note-title-color', sel: '.ma-followup-note-title', prop: 'color' },
      { id: 'ma-followup-answer-done-bg', sel: '.ma-followup-answer--done', prop: 'backgroundColor' },
      { id: 'ma-followup-answer-done-color', sel: '.ma-followup-answer--done', prop: 'color' },
    ],
  },
  {
    id: 'cycle',
    css: [...BASE, '500-pwa-and-offline.css', '733-ui-v4-reports.css'],
    html: `<div class="cycle-card-v4 cycle-card-v4--filled"><div class="cycle-card-v4__insight"><div class="cycle-card-v4__insight-title">+12%</div></div></div>
<div class="reports-v4-dynamics-card">chart</div>
<div class="cycle-date-picker-sheet">sheet</div>`,
    probes: [
      { id: 'cycle-insight-bg', sel: '.cycle-card-v4__insight', prop: 'backgroundColor' },
      { id: 'cycle-insight-title-color', sel: '.cycle-card-v4__insight-title', prop: 'color' },
      { id: 'reports-dynamics-card-bg', sel: '.reports-v4-dynamics-card', prop: 'backgroundColor' },
      { id: 'cycle-date-sheet-bg', sel: '.cycle-date-picker-sheet', prop: 'backgroundColor' },
    ],
  },
  {
    id: 'registration',
    css: [...BASE, '733-ui-v4-login-theme.css'],
    html: `<div id="reg-card-shell" style="background:var(--v4-hero,#efe3cf);border-radius:20px;padding:14px 16px">card</div>
<div class="registration-v4-endpoint-disc"></div>
<div class="heys-supp-revoke-sheet">sheet</div>`,
    probes: [
      { id: 'reg-card-shell-bg', sel: '#reg-card-shell', prop: 'backgroundColor' },
      { id: 'reg-endpoint-disc-bg', sel: '.registration-v4-endpoint-disc', prop: 'backgroundColor' },
      { id: 'reg-revoke-sheet-bg', sel: '.heys-supp-revoke-sheet', prop: 'backgroundColor' },
    ],
  },
];

async function measureFixture(fixture) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v4-sand-dark-'));
  const file = path.join(tmpDir, `${fixture.id}.html`);
  fs.writeFileSync(
    file,
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${cssImport(fixture.css)}
body{margin:0;padding:16px;background:var(--v4-bg,#fffaf1);font-family:Figtree,system-ui,sans-serif}
.date-picker-day-nav{width:44px;height:44px;border:0;border-radius:999px}
.date-picker--v4{display:flex;align-items:center;min-height:44px;border-radius:999px;padding:0 11px;background:var(--v4-tint)}
.date-picker--past .date-picker-day-nav{background:var(--v4-tint)}
.date-picker-btn{min-height:48px;border:0;border-radius:999px;padding:0 15px;font:700 13px/1 Figtree,sans-serif}
.paywall-consent-box{width:22px;height:22px;border-radius:6px;display:inline-block}
.paywall-cta{min-height:48px;border:0;border-radius:999px;width:100%;font:700 13px/1 Figtree,sans-serif}
.paywall-order-card{background:var(--v4-surface);border-radius:18px;padding:14px;margin-top:16px}
.reports-v4-summary-card__value{font-size:22px;font-weight:600}
.heys-undo-bar{position:relative}
.yv-pack-day{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:16px;background:var(--v4-c1)}
.yv-food-card{padding:14px 16px;border-radius:20px;margin-top:16px;background:var(--v4-card)}
.yv-food-row{color:rgba(0,0,0,.55)}
.yv-text-later{min-height:44px;border:0;background:transparent;font:700 12px/1 Figtree,sans-serif;color:rgba(0,0,0,.45)}
.yv-pack-secondary{min-height:48px;border:0;border-radius:999px;background:var(--v4-c1);color:var(--v4-ink-2)}
.mc-pill--choice{min-height:44px;border:0;border-radius:999px;padding:0 16px}
.mc-rest-supp-add-icon{display:inline-block;width:26px;height:26px;border-radius:999px}
.mc-rest-row--overdue{min-height:44px;border-radius:16px}
.mc-rest-type,.mc-rest-measure-side-pill{border:0;border-radius:999px;padding:0 12px;min-height:32px}
.mc-wheel-value--current{display:inline-block}
.readonly-banner{display:flex;align-items:center}
.readonly-toast{position:relative}
.sub-screen__status-card,.sub-screen__footnote{border-radius:16px;padding:12px}
.sb-chip,.sb-star{border:0;background:transparent}
.sb-plan-vs-summary,.sb-plan-vs-cell,.sb-finish-hero,.sb-ss-member-card{border-radius:12px;padding:8px}
.meal-time-wave,.meal-time-cta,.aps-v4-grams-chip,.meal-transfer-v4__gram-step,.mpr-preview-item-toggle{min-height:44px;border:0;border-radius:999px}
.heys-login-theme__dot{display:inline-block;width:8px;height:8px;border-radius:999px;margin:0 3px}
.heys-login-theme__dot.is-act{background:var(--v4-act)}
.cur-sheet-scrim{position:fixed;inset:0}
.cur-sheet__cta{min-height:48px;border:0;border-radius:999px;padding:0 16px}
.advice-v4-disclaimer-overlay{position:fixed;inset:0}
.game-v4-sheet__bar{height:8px;background:var(--v4-track);border-radius:999px;overflow:hidden}
.game-v4-sheet__hero--cream{padding:16px;border-radius:20px}
.mc-estimated-badge{margin-top:12px;padding:5px 12px;border-radius:999px;background:var(--v4-hero,#efe3cf);font:700 10.5px/1 Figtree,sans-serif;color:var(--v4-act-text,#8a4a20)}
.yv-v4-slider-fill--norm{position:relative;width:50%;height:26px;border-radius:999px}
.cycle-card-v4{border-radius:16px;padding:12px}
.cycle-card-v4__insight{font-size:12px}
.mc-recorded-check{display:inline-block}
.mc-backdrop{position:fixed;inset:0}
.paywall-overlay{position:fixed;inset:0}
.paywall-trial,.paywall-btnq{border-radius:16px;padding:12px;border:0}
.paywall-divider-line{display:block;height:1px}
.aps-v4-harm-compare__card{border-radius:20px;padding:12px;border:2px solid transparent}
.aps-barcode-state{display:block}
.msg-bubble{border-radius:16px;padding:10px}
.msg-menu-item{display:block;padding:8px}
.ma-habit-cal-cell{width:24px;height:24px;border:0;border-radius:999px}
.ma-habit-cal-mode-btn{min-height:32px;border:0;border-radius:999px;padding:0 12px}
.nutrition-v4-zones{height:8px;border-radius:999px;overflow:hidden;background:var(--v4-track)}
.nutrition-v4-zones__bar-fill{display:block;height:100%}
.advice-v4-disclaimer-card__handle{width:40px;height:4px;border-radius:999px}
.date-picker-sheet .date-picker-day{min-width:44px;min-height:44px;border:0;border-radius:999px}
.heys-update-modal__backdrop,.heys-update-prompt__backdrop{position:fixed;inset:0}
.heys-update-modal__card{padding:20px;border-radius:24px}
.heys-auth-error{padding:8px;border-radius:16px}
.mc-supp-flow-empty-icon{display:inline-flex;width:46px;height:46px;border-radius:999px;align-items:center;justify-content:center}
.mc-supp-flow-btn--primary,.mc-rest-consent-primary{min-height:44px;border:0;border-radius:999px;padding:0 16px}
.ma-followup-note,.ma-followup-answer{min-height:44px;border:0}
.cycle-card-v4{border-radius:16px;padding:12px}
.cycle-date-picker-sheet{border-radius:26px 26px 18px 18px;padding:14px 16px}
.reports-v4-dynamics-card{border-radius:20px;padding:16px}
.registration-v4-endpoint-disc{width:56px;height:56px;border-radius:999px}
.heys-supp-revoke-sheet{border-radius:26px;padding:18px 16px}
.messenger-header-button,.messenger-confirm-delete{min-height:44px;border:0;border-radius:999px;padding:0 12px}
.messenger-subtitle__dot{display:inline-block;width:8px;height:8px;border-radius:999px}
.aps-v4-outcome--warn,.aps-barcode-unrecognized__card{border-radius:18px;padding:15px}
.aps-v4-portions-row--readonly{display:inline-flex;min-height:44px;padding:0 11px;border-radius:999px}
.activity-v4-steps__track{display:block;height:8px;border-radius:999px;overflow:hidden;background:var(--v4-track)}
.activity-v4-steps__fill{display:block;height:100%;width:60%}
.advice-v4-toast-card{display:flex;padding:12px}
.advice-v4-toast-card__stripe{width:4px;border-radius:999px;flex:none;align-self:stretch}
.sub-welcome-scrim{position:fixed;inset:0;background:rgba(0,0,0,.55)}
.paywall-success-icon{width:56px;height:56px;border-radius:999px;display:flex;align-items:center;justify-content:center}
.paywall-success-card{border-radius:18px;padding:14px;margin-top:14px}
.date-picker-sheet-month-nav{width:44px;height:44px;border:0;border-radius:999px}
.sb-root{padding:8px}
.sb-aps-head{display:grid;grid-template-columns:34px 1fr 1fr 52px;gap:8px}
.sb-ap{display:flex;align-items:center}
.sb-ap-num{display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9px}
.sb-radio,.sb-btn{border:0;background:transparent}
.sb-stepper .sb-btn.is-accent{min-width:44px;min-height:44px;border-radius:999px}
.sb-pain--canvas,.sb-period-outcomes{border-radius:20px;padding:12px}
.sb-sheet-back{position:fixed;inset:0}
.sb-plan-letter{display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:11px}
.game-v4-sheet__hero-ring{display:block}
</style></head><body>${fixture.html}</body></html>`,
  );

  const browser = await chromium.launch({ headless: true });
  const out = {};
  try {
    const page = await browser.newPage({ viewport: { width: 375, height: 900 } });
    await page.goto(`file:///${file.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
    for (const set of SETS) {
      await page.evaluate(({ themeId, theme, palette }) => {
        document.documentElement.setAttribute('data-theme-id', themeId);
        document.documentElement.setAttribute('data-theme', theme);
        document.documentElement.setAttribute('data-palette', palette);
      }, set);
      for (const probe of fixture.probes) {
        const val = await page.evaluate(({ sel, prop }) => {
          const el = document.querySelector(sel);
          if (!el) return { missing: sel };
          return getComputedStyle(el)[prop];
        }, probe);
        out[`${probe.id}|${set.id}`] = typeof val === 'object' ? val : fmtColor(val);
      }
    }
  } finally {
    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  return out;
}

export async function measureSandDarkColors() {
  const all = {};
  for (const fixture of FIXTURES) {
    Object.assign(all, await measureFixture(fixture));
  }
  return all;
}

async function main() {
  const all = await measureSandDarkColors();
  fs.writeFileSync(OUT, `${JSON.stringify(all, null, 2)}\n`, 'utf8');
  console.log('wrote', OUT);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
