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
  ],
  'cycle': [
    {
      key: 'контраст ленты',
      fact: (M, base) => `${stripOldPalette(base)} Лента ${dual(M, 'cycle-ribbon-period-bg')}.`,
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
  ],
  'date-remainders': [
    {
      key: 'Календарь · легенда · 27',
      fact: (M, base) =>
        `${stripOldPalette(base)} Фон ${dual(M, 'date-today-btn-bg')}; текст ${dual(M, 'date-today-btn-color')}.`,
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
  ],
  'pwa-update': [
    {
      key: 'вид страховки',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'readonly-toast-bg')}.`,
    },
  ],
  'strength-builder': [
    {
      key: 'Программа · цикл · 34',
      fact: (M, base) => `${stripOldPalette(base)} ${dual(M, 'sb-plan-vs-cell-val-color')}.`,
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
