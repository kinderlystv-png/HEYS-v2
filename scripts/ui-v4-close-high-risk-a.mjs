#!/usr/bin/env node
/**
 * Close bucket-(a) high-risk color verdict rows with sand + sand-dark measures.
 *
 *   node scripts/ui-v4-measure-sand-dark-colors.mjs
 *   node scripts/ui-v4-close-high-risk-a.mjs
 *   node scripts/ui-v4-close-high-risk-a.mjs --dry-run
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';
import { readAllZones, readZone, patchZoneRow } from './lib/ui-v4-verdicts.mjs';
import { classifyColorVerdicts } from './ui-v4-classify-color-verdicts.mjs';
import { formatDualFact } from './ui-v4-measure-sand-dark-colors.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEASURE = path.join(ROOT, 'scripts/.tmp-lane5-measurements.json');
const EXCLUDE = new Set(['home-widgets', 'reports-insights', 'settings-system', 'curator-edits']);
const dryRun = process.argv.includes('--dry-run');

function loadMeasurements() {
  return JSON.parse(fs.readFileSync(MEASURE, 'utf8'));
}

function dual(M, probeId) {
  return formatDualFact(probeId, M);
}

function stripOldPalette(f) {
  return (f || '')
    .replace(/;\s*computed песочная[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*computed bg песочная[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*песочная\/синяя[^;]*?(?=;\s*гейт|;\s*Пакет|$)/gi, '')
    .replace(/;\s*подтверждено замером вычисленных значений на песочной и синей палитрах:[^;]*?(?=;\s*гейт|$)/gi, '')
    .replace(/Замер (?:на стенде|вычисленных значений на стенде|chromium), песочный и синий:[^.;]*(?:\.[^.;]*)*/gi, '')
    .replace(/Замер chromium 375 px:[^.;]*(?:\.[^.;]*)*/gi, '')
    .replace(/Замер палитры \d{2}\.\d{2}:[^.;]*(?:\.[^.;]*)*/gi, '')
    .replace(/;\s*sand #[0-9a-f]+ blue #[0-9a-f]+ — computed :3001 \d{4}-\d{2}-\d{2}/gi, '')
    .replace(/\s*роли переворачиваются\s*$/i, '')
    .trim();
}

/** Longest needle first — first match wins. */
const PROBE_RULES = [
  { needles: ['.sb-builder-screen.is-weight-entry.is-exercise-open .sb-aps-head > span:last-child', '.is-weight-entry.is-exercise-open .sb-aps-head > span:last-child'], probe: 'sb-weight-head-hint-color', label: 'тон' },
  { needles: ['.is-time-entry.is-exercise-open .sb-aps-head > span:last-child'], probe: 'sb-time-head-hint-color', label: 'тон' },
  { needles: ['.is-distance-entry.is-exercise-open .sb-aps-head > span:last-child'], probe: 'sb-distance-head-hint-color', label: 'тон' },
  { needles: ['.is-bodyweight-entry.is-exercise-open .sb-aps-head > span:last-child'], probe: 'sb-bodyweight-head-hint-color', label: 'тон' },
  { needles: ['.is-weight-entry .sb-ap.is-done .sb-ap-num', '.is-weight-entry.is-exercise-open .sb-ap.is-done .sb-ap-num'], probe: 'sb-weight-done-ap-num-color', label: 'тон' },
  { needles: ['.sb-period-outcome-val.is-ok'], probe: 'sb-period-outcome-val-ok-color', label: 'тон' },
  { needles: ['.sb-period-outcomes'], probe: 'sb-period-outcomes-bg', label: 'фон' },
  { needles: ['.program-done-growth-val'], probe: 'program-done-growth-val-color', label: 'тон' },
  { needles: ['.sb-history-metrics .sb-finish-metric'], probe: 'sb-history-metric-bg', label: 'фон' },
  { needles: ['.sb-radio.is-on .sb-ex-num'], probes: ['sb-radio-on-num-bg', 'sb-radio-on-num-color'], label: 'цифра' },
  { needles: ['.sb-stepper .sb-btn.is-accent'], probes: ['sb-stepper-accent-bg', 'sb-stepper-accent-color'], label: 'кнопка' },
  { needles: ['.sb-pain--canvas'], probe: 'sb-pain-canvas-bg', label: 'фон' },
  { needles: ['.sb-sheet-back'], probe: 'sb-sheet-back-bg', label: 'скрим' },
  { needles: ['.sb-plan-letter'], probe: 'sb-plan-letter-color', label: 'тон' },
  { needles: ['.sb-curator-edit-mark.is-ok'], probe: 'sb-curator-mark-ok-color', label: 'тон' },
  { needles: ['.sb-curator-edit-card.is-primary'], probe: 'sb-curator-card-bg', label: 'фон' },
  { needles: ['.mc-supp-flow-empty-icon'], probe: 'mc-supp-empty-icon-bg', label: 'фон' },
  { needles: ['.mc-supp-flow-btn--primary'], probe: 'mc-supp-primary-btn-bg', label: 'фон' },
  { needles: ['.mc-rest-consent-primary'], probe: 'mc-rest-consent-primary-bg', label: 'фон' },
  { needles: ['.ma-followup-answer--done'], probes: ['ma-followup-answer-done-bg', 'ma-followup-answer-done-color'], label: 'ответ' },
  { needles: ['.ma-followup-note-title'], probe: 'ma-followup-note-title-color', label: 'тон' },
  { needles: ['.ma-followup-note'], probe: 'ma-followup-note-bg', label: 'фон' },
  { needles: ['.cycle-card-v4__insight-title'], probe: 'cycle-insight-title-color', label: 'тон' },
  { needles: ['.cycle-card-v4__insight', '500-pwa:2183'], probe: 'cycle-insight-bg', label: 'фон' },
  { needles: ['.reports-v4-dynamics-card'], probe: 'reports-dynamics-card-bg', label: 'фон' },
  { needles: ['.cycle-date-picker-sheet'], probe: 'cycle-date-sheet-bg', label: 'фон' },
  { needles: ['.date-picker-day-nav--disabled'], probe: 'date-nav-disabled-bg', label: 'кружок' },
  { needles: ['.date-picker-sheet-month-nav', 'легенда · 06'], probe: 'date-sheet-month-nav-bg', label: 'фон' },
  { needles: ['.game-v4-sheet__hero-ring-path', 'buildCeremonyRingPath'], probe: 'game-hero-ring-stroke', label: 'штрих' },
  { needles: ['.messenger-header-button.is-open'], probe: 'msg-header-open-bg', label: 'фон' },
  { needles: ['.messenger-subtitle__dot.is-offline'], probe: 'msg-offline-dot-bg', label: 'точка' },
  { needles: ['.messenger-confirm-delete'], probes: ['msg-confirm-delete-bg', 'msg-confirm-delete-color'], label: 'удаление' },
  { needles: ['.aps-v4-portions-row--readonly', '.aps-v4-portions-suggest'], probes: ['aps-portions-readonly-bg', 'aps-portions-readonly-color'], label: 'чип' },
  { needles: ['.aps-v4-outcome--warn'], probe: 'aps-outcome-warn-bg', label: 'фон' },
  { needles: ['.aps-barcode-unrecognized__card'], probe: 'barcode-unrecognized-card-bg', label: 'фон' },
  { needles: ['cardShell background var(--v4-hero'], probe: 'reg-card-shell-bg', label: 'фон' },
  { needles: ['.registration-v4-endpoint-disc'], probe: 'reg-endpoint-disc-bg', label: 'фон' },
  { needles: ['.heys-supp-revoke-sheet'], probe: 'reg-revoke-sheet-bg', label: 'фон' },
  { needles: ['WelcomeFirstLogin scrim rgba(0,0,0,.55)'], probe: 'sub-welcome-scrim-bg', label: 'скрим' },
  { needles: ['.paywall-success-icon'], probes: ['paywall-success-icon-bg', 'paywall-success-icon-color'], label: 'иконка' },
  { needles: ['.paywall-success-card'], probe: 'paywall-success-card-bg', label: 'фон' },
  { needles: ['.paywall-order-card background'], probe: 'paywall-order-card-bg', label: 'фон' },
  { needles: ['.activity-v4-steps__fill'], probe: 'activity-steps-fill-bg', label: 'заливка' },
  { needles: ['.advice-v4-toast-card__stripe--ok', '.advice-v4-toast-card__stripe'], probe: 'advice-toast-stripe-ok-bg', label: 'полоса' },
  { needles: ['.yv-v4-slider-fill'], probe: 'yv-slider-fill-bg', label: 'заливка' },
  { needles: ['estimatedBadge', 'mc-estimated-badge', 'расчётный вес'], probes: ['yv-estimated-badge-bg', 'yv-estimated-badge-color'], label: 'плашка' },
  { needles: ['.yv-pack-secondary--feelings'], probe: 'yv-pack-secondary-feelings-bg', label: 'фон' },
  { needles: ['.yv-food-card'], probe: 'yv-food-card-bg', label: 'фон' },
  { needles: ['.yv-food-value'], probe: 'yv-food-value', label: 'тон' },
  { needles: ['.yv-food-row'], probe: 'yv-food-row', label: 'тон' },
  { needles: ['.yv-pack-secondary'], probe: 'yv-pack-secondary-bg', label: 'фон' },
  { needles: ['.mc-pill--choice.is-on', '.mc-pill--choice'], probe: 'mc-pill-on-bg', label: 'фон' },
  { needles: ['.mc-rest-chevron'], probe: 'mc-rest-chevron-color', label: 'тон' },
  { needles: ['.mc-rest-supp-add-icon'], probe: 'mc-rest-supp-add-icon-bg', label: 'фон' },
  { needles: ['.mc-wheel-value--current'], probe: 'mc-wheel-current-color', label: 'тон' },
  { needles: ['.mc-rest-row--overdue'], probe: 'mc-rest-row-overdue-bg', label: 'фон' },
  { needles: ['.mc-rest-type.is-on', '.mc-rest-type'], probe: 'mc-rest-type-on-bg', label: 'фон' },
  { needles: ['.mc-rest-measure-side-pill'], probe: 'mc-rest-measure-pill-on-bg', label: 'фон' },
  { needles: ['.game-v4-sheet__bar-fill.is-complete'], probe: 'game-bar-fill-complete-bg', label: 'фон' },
  { needles: ['.game-v4-sheet__bar-fill'], probe: 'game-bar-fill-bg', label: 'фон' },
  { needles: ['.game-v4-sheet__hero--cream'], probe: 'game-hero-cream-bg', label: 'фон' },
  { needles: ['.readonly-banner--sticky', '.readonly-banner'], probe: 'readonly-banner-sticky-bg', label: 'фон' },
  { needles: ['.readonly-banner-pill'], probe: 'readonly-banner-pill-bg', label: 'фон' },
  { needles: ['.readonly-toast-action'], probe: 'readonly-toast-action-color', label: 'тон' },
  { needles: ['.readonly-toast'], probe: 'readonly-toast-bg', label: 'фон' },
  { needles: ['.sub-screen__status-card'], probe: 'sub-screen-status-card-bg', label: 'фон' },
  { needles: ['.sub-screen__footnote'], probe: 'sub-screen-footnote-bg', label: 'фон' },
  { needles: ['.sub-screen__support-link'], probe: 'sub-screen-support-link-color', label: 'тон' },
  { needles: ['.paywall-overlay'], probe: 'paywall-overlay-bg', label: 'скрим' },
  { needles: ['.paywall-trial-dot'], probe: 'paywall-trial-dot-bg', label: 'точка' },
  { needles: ['.paywall-trial'], probe: 'paywall-trial-bg', label: 'фон' },
  { needles: ['.paywall-btnq'], probe: 'paywall-btnq-bg', label: 'фон' },
  { needles: ['.paywall-divider-line'], probe: 'paywall-divider-line-bg', label: 'линия' },
  { needles: ['.cycle-ribbon--period', '.cycle-ribbon'], probe: 'cycle-ribbon-period-bg', label: 'лента' },
  { needles: ['.heys-update-prompt__backdrop'], probe: 'pwa-prompt-backdrop-bg', label: 'подложка' },
  { needles: ['.heys-update-modal__backdrop'], probe: 'pwa-modal-backdrop-bg', label: 'подложка' },
  { needles: ['.heys-update-modal__card', '.heys-update-prompt__card'], probes: ['pwa-card-bg', 'pwa-card-ink'], label: 'карточка' },
  { needles: ['.heys-auth-error'], probe: 'login-auth-error-color', label: 'ошибка' },
  { needles: ['.cycle-card-v4'], probe: 'cycle-card-bg', label: 'фон' },
  { needles: ['.mc-recorded-check'], probe: 'mc-recorded-check-color', label: 'тон' },
  { needles: ['.mc-backdrop'], probe: 'mc-backdrop-bg', label: 'скрим' },
  { needles: ['.aps-v4-harm-compare__card.is-active', '.aps-v4-harm-compare__card'], probes: ['harm-compare-active-border', 'harm-compare-active-value'], label: 'карточка' },
  { needles: ['.aps-barcode-state'], probe: 'barcode-state-color', label: 'тон' },
  { needles: ['.msg-menu-item'], probe: 'msg-menu-item-color', label: 'тон' },
  { needles: ['.msg-bubble-mine', '.msg-bubble'], probe: 'msg-bubble-mine-bg', label: 'фон' },
  { needles: ['.ma-habit-cal-cell'], probe: 'habit-cal-cell-done-bg', label: 'фон' },
  { needles: ['.ma-habit-cal-mode-btn'], probe: 'habit-cal-mode-active-bg', label: 'фон' },
  { needles: ['.nutrition-v4-zones__bar-fill', '.nutrition-v4-zones'], probe: 'nutrition-zones-bar-fill-bg', label: 'полоса' },
  { needles: ['.advice-v4-disclaimer-card__handle'], probe: 'advice-disclaimer-handle-bg', label: 'ручка' },
  { needles: ['.advice-v4-popup'], probe: 'advice-popup-bg', label: 'фон' },
  { needles: ['.paywall-cta'], probes: ['paywall-cta-bg', 'paywall-cta-color'], label: 'кнопка' },
  { needles: ['.paywall-consent-box'], probe: 'paywall-consent-box', label: 'фон' },
  { needles: ['.paywall-consent-link'], probe: 'paywall-consent-link', label: 'тон' },
  { needles: ['.paywall-consent-text'], probe: 'paywall-consent-text', label: 'тон' },
  { needles: ['.paywall-order-price'], probe: 'paywall-price', label: 'тон' },
  { needles: ['.paywall-order-name'], probe: 'paywall-name', label: 'тон' },
  { needles: ['.sb-chip.is-on', '.sb-chip'], probe: 'sb-chip-on-bg', label: 'фон' },
  { needles: ['.sb-star.is-on', '.sb-star'], probe: 'sb-star-on-color', label: 'тон' },
  { needles: ['.sb-plan-vs-summary'], probe: 'sb-plan-vs-summary-bg', label: 'фон' },
  { needles: ['.sb-plan-vs-cell.is-done'], probe: 'sb-plan-vs-cell-done-bg', label: 'фон' },
  { needles: ['.sb-plan-vs-cell-val'], probe: 'sb-plan-vs-cell-val-color', label: 'тон' },
  { needles: ['.sb-finish-hero'], probe: 'sb-finish-hero-bg', label: 'фон' },
  { needles: ['.sb-ss-member-card'], probe: 'sb-ss-member-card-bg', label: 'фон' },
  { needles: ['.meal-time-cta'], probes: ['meal-time-cta-bg', 'meal-time-cta-color'], label: 'кнопка' },
  { needles: ['.meal-time-wave'], probe: 'meal-time-wave-bg', label: 'фон' },
  { needles: ['.aps-v4-grams-chip.is-active'], probes: ['aps-grams-chip-active-bg', 'aps-grams-chip-active-color'], label: 'чип' },
  { needles: ['.aps-v4-grams-chip'], probe: 'aps-grams-chip-bg', label: 'фон' },
  { needles: ['.aps-v4-grams-unit.is-active'], probe: 'aps-grams-unit-active-color', label: 'тон' },
  { needles: ['.meal-transfer-v4__gram-step'], probe: 'meal-transfer-gram-step-bg', label: 'фон' },
  { needles: ['.mpr-preview-item-toggle'], probe: 'mpr-preview-toggle-bg', label: 'фон' },
  { needles: ['.heys-login-theme__caption'], probe: 'login-theme-caption-color', label: 'тон' },
  { needles: ['.heys-login-theme__dot'], probe: 'login-theme-dot-act-bg', label: 'точка' },
  { needles: ['.cur-cab__title'], probe: 'cur-cab-title-color', label: 'тон' },
  { needles: ['.cur-sheet-scrim'], probe: 'cur-sheet-scrim-bg', label: 'скрим' },
  { needles: ['.cur-sheet__cta'], probe: 'cur-sheet-cta-bg', label: 'фон' },
  { needles: ['.advice-v4-disclaimer-overlay'], probe: 'advice-disclaimer-overlay-bg', label: 'подложка' },
  { needles: ['.date-picker-btn.today-btn', '.today-btn'], probes: ['date-today-btn-bg', 'date-today-btn-color'], label: 'кнопка' },
  { needles: ['.nutrition-v4-chip:not(.is-off)', '.nutrition-v4-chip'], probe: 'chip-on-bg', label: 'фон' },
  { needles: ['.nutrition-v4-supplements__pill.is-course'], probes: ['chip-course-color', 'chip-course-border'], label: 'чип' },
];

function measureSuffix(M, rule) {
  if (rule.probes) {
    return rule.probes.map((p) => dual(M, p)).join('; ');
  }
  return dual(M, rule.probe);
}

function matchRule(f) {
  for (const rule of PROBE_RULES) {
    if (rule.needles.some((n) => f.includes(n))) return rule;
  }
  return null;
}

/** @type {Record<string, Array<{key:string, fact:string}>>} */
const EXPLICIT = {
  'checkin-morning': [
    {
      key: 'Чек-ин · расчётный вес · 08',
      fact: (M, base) =>
        `${stripOldPalette(base)} Плашка ${dual(M, 'yv-estimated-badge-bg')}; текст ${dual(M, 'yv-estimated-badge-color')}.`,
    },
    {
      key: 'Чек-ин · вчера по ощущениям · 20',
      fact: (M, base) => `${stripOldPalette(base)} Заливка ${dual(M, 'yv-slider-fill-bg')}.`,
    },
    {
      key: 'Чек-ин · курс добавок пуст · 06',
      fact: (M, base) => `${stripOldPalette(base)} Иконка ${dual(M, 'mc-supp-empty-icon-bg')}.`,
    },
    {
      key: 'Чек-ин · курс добавок пуст · 10',
      fact: (M, base) => `${stripOldPalette(base)} Кнопка ${dual(M, 'mc-supp-primary-btn-bg')}.`,
    },
    {
      key: 'Чек-ин · согласие не подписано · 18',
      fact: (M, base) => `${stripOldPalette(base)} CTA ${dual(M, 'mc-rest-consent-primary-bg')}.`,
    },
    {
      key: 'Рутина · резервный вопрос после еды · 19',
      fact: (M, base) => `${stripOldPalette(base)} Заметка ${dual(M, 'ma-followup-note-bg')}.`,
    },
    {
      key: 'Рутина · резервный вопрос после еды · 20',
      fact: (M, base) =>
        `${stripOldPalette(base)} Заголовок ${dual(M, 'ma-followup-note-title-color')}.`,
    },
    {
      key: 'Рутина · резервный вопрос после еды · 37',
      fact: (M, base) =>
        `${stripOldPalette(base)} Ответ ${dual(M, 'ma-followup-answer-done-bg')}; текст ${dual(M, 'ma-followup-answer-done-color')}.`,
    },
  ],
  cycle: [
    {
      key: 'контраст ленты',
      fact: (M, base) => `${stripOldPalette(base)} Лента ${dual(M, 'cycle-ribbon-period-bg')}.`,
    },
    {
      key: 'вид · инсайт',
      fact: (M, base) =>
        `${stripOldPalette(base)} Фон ${dual(M, 'cycle-insight-bg')}; заголовок ${dual(M, 'cycle-insight-title-color')}.`,
    },
    {
      key: 'Цикл · график калорий · 01',
      fact: (M, base) => `${stripOldPalette(base)} Карточка ${dual(M, 'reports-dynamics-card-bg')}.`,
    },
    {
      key: 'Цикл · график веса · 01',
      fact: (M, base) => `${stripOldPalette(base)} Карточка ${dual(M, 'reports-dynamics-card-bg')}.`,
    },
    {
      key: 'Цикл · другой день, календарь · 01',
      fact: (M, base) => `${stripOldPalette(base)} Лист ${dual(M, 'cycle-date-sheet-bg')}.`,
    },
  ],
  'curator-cabinet': [
    {
      key: 'вид · лист поверх панели',
      fact: (M, base) =>
        `${stripOldPalette(base)} Скрим ${dual(M, 'cur-sheet-scrim-bg')}; лист CTA ${dual(M, 'cur-sheet-cta-bg')}.`,
    },
    {
      key: 'вид · шапка кабинета',
      fact: (M, base) =>
        `${stripOldPalette(base)} Заголовок ${dual(M, 'cur-cab-title-color')}.`,
    },
  ],
  'nutrition-tab': [
    {
      key: 'цвета зон',
      fact: (M, base) => `${stripOldPalette(base)} Полоса зон ${dual(M, 'nutrition-zones-bar-fill-bg')}.`,
    },
    {
      key: 'шкала полосы',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'nutrition-zones-bar-fill-bg')}.`,
    },
    {
      key: 'цвета',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'nutrition-zones-bar-fill-bg')}.`,
    },
  ],
  'pwa-update': [
    {
      key: 'вид страховки',
      fact: (M, base) => `${stripOldPalette(base)} Подложка ${dual(M, 'pwa-prompt-backdrop-bg')}.`,
    },
    {
      key: 'палитра',
      fact: (M, base) =>
        `${stripOldPalette(base)} Карточка ${dual(M, 'pwa-card-bg')}; чернила ${dual(M, 'pwa-card-ink')}.`,
    },
    {
      key: 'блюр подложки',
      fact: (M, base) => `${stripOldPalette(base)} Модалка ${dual(M, 'pwa-modal-backdrop-bg')}.`,
    },
  ],
  login: [
    {
      key: 'свёрнутое',
      fact: (M, base) =>
        `${stripOldPalette(base)} Точка act ${dual(M, 'login-theme-dot-act-bg')}; подпись ${dual(M, 'login-theme-caption-color')}.`,
    },
    {
      key: 'Вход · выбор свёрнут · 15',
      fact: (M, base) => `${stripOldPalette(base)} Ошибка ${dual(M, 'login-auth-error-color')}.`,
    },
    {
      key: 'Вход · выбор свёрнут · 17',
      fact: (M, base) => `${stripOldPalette(base)} Ошибка ${dual(M, 'login-auth-error-color')}.`,
    },
  ],
  tips: [
    {
      key: 'Оговорка · 05',
      fact: (M, base) =>
        `${stripOldPalette(base)} ${dual(M, 'advice-disclaimer-overlay-bg')}.`,
    },
    {
      key: 'Совет · всплывающий · 08',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'advice-toast-stripe-ok-bg')}.`,
    },
  ],
  'date-remainders': [
    {
      key: 'Календарь · легенда · 27',
      fact: (M, base) =>
        `${stripOldPalette(base)} Фон ${dual(M, 'date-today-btn-bg')}; текст ${dual(M, 'date-today-btn-color')}.`,
    },
    {
      key: 'Дата · сегодня, прокручено · 49',
      fact: (M, base) => `${stripOldPalette(base)} Кружок ${dual(M, 'date-nav-disabled-bg')}.`,
    },
    {
      key: 'Календарь · легенда · 06',
      fact: (M, base) => `${stripOldPalette(base)} Стрелка ${dual(M, 'date-sheet-month-nav-bg')}.`,
    },
    {
      key: 'Капсула · ночь на 21 августа · 03',
      fact: (M, base) => `${stripOldPalette(base)} Нав ${dual(M, 'date-past-nav-bg')}.`,
    },
  ],
  gamification: [
    {
      key: 'вид линии',
      fact: (M, base) => `${stripOldPalette(base)} Штрих ${dual(M, 'game-hero-ring-stroke')}.`,
    },
  ],
  messenger: [
    {
      key: 'Мессенджер · меню Ещё · 04',
      fact: (M, base) => `${stripOldPalette(base)} Кнопка ${dual(M, 'msg-header-open-bg')}.`,
    },
    {
      key: 'Мессенджер · без сети · 03',
      fact: (M, base) => `${stripOldPalette(base)} Точка ${dual(M, 'msg-offline-dot-bg')}.`,
    },
    {
      key: 'Мессенджер · удаление сообщения · 07',
      fact: (M, base) =>
        `${stripOldPalette(base)} Фон ${dual(M, 'msg-confirm-delete-bg')}; текст ${dual(M, 'msg-confirm-delete-color')}.`,
    },
  ],
  'product-card': [
    {
      key: 'вид · шаг «Вредность»',
      fact: (M, base) =>
        `${stripOldPalette(base)} Активная карточка ${dual(M, 'harm-compare-active-border')}; число ${dual(M, 'harm-compare-active-value')}.`,
    },
    {
      key: 'Продукт · порции · 16',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'aps-grams-unit-active-color')}.`,
    },
    {
      key: 'Продукт · вредность и модерация · 10',
      fact: (M, base) =>
        `${stripOldPalette(base)} ${dual(M, 'harm-compare-active-value')}.`,
    },
    {
      key: 'Штрихкод · найден · 15',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'barcode-state-color')}.`,
    },
    {
      key: 'Правка продукта · порции · 12',
      fact: (M, base) =>
        `${stripOldPalette(base)} Чип ${dual(M, 'aps-portions-readonly-bg')}; текст ${dual(M, 'aps-portions-readonly-color')}.`,
    },
    {
      key: 'Продукт · исходы заявки · 10',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'aps-outcome-warn-bg')}.`,
    },
    {
      key: 'Штрихкод · состояния · 06',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'barcode-unrecognized-card-bg')}.`,
    },
  ],
  registration: [
    {
      key: 'вид карточки итогов',
      fact: (M, base) => `${stripOldPalette(base)} cardShell ${dual(M, 'reg-card-shell-bg')}.`,
    },
    {
      key: 'Регистрация · возврат к незавершённой · 02',
      fact: (M, base) => `${stripOldPalette(base)} Диск ${dual(M, 'reg-endpoint-disc-bg')}.`,
    },
    {
      key: 'Профиль · отзыв согласия на добавки · 10',
      fact: (M, base) => `${stripOldPalette(base)} Лист ${dual(M, 'reg-revoke-sheet-bg')}.`,
    },
  ],
  subscription: [
    {
      key: 'Подписка · приветствие · 02',
      fact: (M, base) => `${stripOldPalette(base)} Скрим ${dual(M, 'sub-welcome-scrim-bg')}.`,
    },
    {
      key: 'Подписка · проверьте заказ · 03',
      fact: (M, base) => `${stripOldPalette(base)} Карточка ${dual(M, 'paywall-order-card-bg')}.`,
    },
    {
      key: 'Подписка · оплата прошла · 03',
      fact: (M, base) =>
        `${stripOldPalette(base)} Иконка ${dual(M, 'paywall-success-icon-bg')}; текст ${dual(M, 'paywall-success-icon-color')}.`,
    },
    {
      key: 'Подписка · оплата прошла · 05',
      fact: (M, base) => `${stripOldPalette(base)} Карточка ${dual(M, 'paywall-success-card-bg')}.`,
    },
  ],
  'tab-activity': [
    {
      key: 'Актив · день собран · 25',
      fact: (M, base) =>
        `${stripOldPalette(base)} Заливка ${dual(M, 'activity-steps-fill-bg')}; трек ${dual(M, 'activity-steps-track-bg')}.`,
    },
    {
      key: 'Актив · день отдыха · 18',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'activity-steps-fill-bg')}.`,
    },
  ],
  'strength-builder': [
    {
      key: 'Программа · цикл · 34',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-plan-vs-cell-val-color')}.`,
    },
    {
      key: 'Правка веса в сессии · 08',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-weight-head-hint-color')}.`,
    },
    {
      key: 'Программа пройдена · 19',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'program-done-growth-val-color')}.`,
    },
    {
      key: 'История упражнения · 11',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-history-metric-bg')}.`,
    },
    {
      key: 'Связка · создание · 14',
      fact: (M, base) =>
        `${stripOldPalette(base)} Цифра ${dual(M, 'sb-radio-on-num-bg')}; текст ${dual(M, 'sb-radio-on-num-color')}.`,
    },
    {
      key: 'Связка · создание · 23',
      fact: (M, base) =>
        `${stripOldPalette(base)} Плюс ${dual(M, 'sb-stepper-accent-bg')}; текст ${dual(M, 'sb-stepper-accent-color')}.`,
    },
    {
      key: 'Куратор и зал · 25',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-pain-canvas-bg')}.`,
    },
    {
      key: 'Шторка ⋯ · 13',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-sheet-back-bg')}.`,
    },
    {
      key: 'План в ленте дня · 08',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-plan-letter-color')}.`,
    },
    {
      key: 'Правка · сторона куратора · 06',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-curator-card-bg')}.`,
    },
    {
      key: 'Правка · сторона куратора · 10',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-curator-mark-ok-color')}.`,
    },
    {
      key: 'Ввод · время под нагрузкой · 09',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-time-head-hint-color')}.`,
    },
    {
      key: 'Ввод · метры · 09',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-distance-head-hint-color')}.`,
    },
    {
      key: 'Ввод · свой вес с довесом · 08',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-bodyweight-head-hint-color')}.`,
    },
    {
      key: 'вид · отчёт за период',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-period-outcomes-bg')}.`,
    },
    {
      key: 'Конструктор · тренировка идёт · спокойнее · 33',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-weight-done-ap-num-color')}.`,
    },
    {
      key: 'Программа · отчёт за период · 09',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-period-outcome-val-ok-color')}.`,
    },
  ],
};

function buildFact(M, zoneId, key, row) {
  const base = row.f || '';
  const explicit = (EXPLICIT[zoneId] || []).find((p) => p.key === key);
  if (explicit) return explicit.fact(M, base);

  const rule = matchRule(base);
  if (!rule) return null;

  const cleaned = stripOldPalette(base);
  const suffix = measureSuffix(M, rule);
  return `${cleaned} ${suffix}.`;
}

function applyZone(zoneId, keys, M, stats) {
  const zone = readZone(zoneId);
  const owned = new Set(keys);
  const foreignBefore = snapshotForeignRowStrings(zone.rows, owned);

  for (const key of keys) {
    const row = zone.rows[key];
    if (!row) {
      stats.missing += 1;
      console.warn('missing row', zoneId, key);
      continue;
    }
    const fact = buildFact(M, zoneId, key, row);
    if (!fact) {
      stats.skipped += 1;
      console.warn('no probe', zoneId, key);
      continue;
    }
    if (!dryRun) {
      patchZoneRow(zoneId, key, (live) => {
        live.f = fact;
      });
    }
    stats.closed += 1;
    console.log(dryRun ? 'would' : 'ok', zoneId, key);
  }

  if (!dryRun) {
    assertForeignRowsUnchanged(foreignBefore, readZone(zoneId).rows);
  }
}

function main() {
  const M = loadMeasurements();
  const data = readAllZones();
  const report = classifyColorVerdicts(data, { excludeZones: EXCLUDE });
  const highRisk = report.openA.filter((r) => r.risk === 1);
  const weakOpen = report.weakSand.filter((r) => r.bucket === 'a' && !r.measured);

  const keysByZone = new Map();
  for (const row of [...highRisk, ...weakOpen]) {
    if (!keysByZone.has(row.zoneId)) keysByZone.set(row.zoneId, new Set());
    keysByZone.get(row.zoneId).add(row.key);
  }

  const stats = { closed: 0, skipped: 0, missing: 0, total: highRisk.length, weak: weakOpen.length };

  for (const [zoneId, keys] of keysByZone) {
    applyZone(zoneId, [...keys], M, stats);
  }

  console.log(
    `\n${dryRun ? 'dry-run' : 'applied'}: closed ${stats.closed}, skipped ${stats.skipped}, missing ${stats.missing} ` +
      `(high-risk ${stats.total}, weak ${stats.weak})`,
  );
  if (stats.skipped) process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) main();
