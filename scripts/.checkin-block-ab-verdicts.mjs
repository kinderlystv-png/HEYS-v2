#!/usr/bin/env node
/** Block A + B: fork/YV shell и вес/сон/шаги — f-ready вердикты checkin-morning. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'apps/web');
const Y715 = '715-yesterday-verify.css';
const WPWA = '500-pwa-and-offline.css';
const P = '002-ui-v4-palette-roles.css';
const STEPS = 'heys_steps_v1.js';
const YV_JS = 'heys_yesterday_verify_v1.js';

const YV_CSS = fs.readFileSync(path.join(WEB, 'styles/modules/715-yesterday-verify.css'), 'utf8');
const CSS = fs.readFileSync(path.join(WEB, 'styles/modules/500-pwa-and-offline.css'), 'utf8');

function lineOf(css, needle) {
  const i = css.split('\n').findIndex((l) => l.includes(needle));
  return i >= 0 ? i + 1 : '?';
}

const INK = `sand #201e1d / blue #101826 (${P}:60,177)`;
const INK2 = `sand rgba(0,0,0,0.55) / blue rgba(0,0,0,0.55)`;
const INK_DATA = `sand rgba(0,0,0,0.56) / blue rgba(0,0,0,0.56)`;
const ACT = `sand #8a4a20 / blue #8a4a20`;
const C1 = `sand #f7efe2 / blue #eef3f9 (${P}:148,468)`;
const ACT_BTN = `#c67139 (оба набора)`;

const SHELL = {
  '175bdcc2e73a': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-header--nav')} .mc-modal--daily .mc-header--nav — grid 44px 1fr 44px, padding 16px 18px 0; shell fork/YV`,
  'cdd83dd04883': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-header-btn--back')} .mc-header-btn--back — 44×44px, margin -8px 0; ${YV_JS}:2764`,
  '3c293f360446': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; ${YV_JS}:2764 headerCaption`,
  'eb42d44cc846': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; дата в шапке YV-кадров`,
  'd1ef17223c4e': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; «Перед чек-ином» в пачке`,
  '4e0004f388ef': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; «День N из M» в дне из пачки`,
  '9c77d72f426c': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; «День 2 из 4» пустой день из пачки`,
  '0c362feeb1d0': `${WPWA}:${lineOf(CSS, '.mc-daily-header-caption')} .mc-daily-header-caption — font 600 11px/1, color ${INK_DATA}; «11 — 14 августа» сила для пачки`,
  'c629f84f9712': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-header-spacer')} .mc-header-spacer — width 44px; правая распорка`,
  'c5a169aa68ab': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, column, align center, overflow auto; область прокрутки`,
  '1df511bb5a89': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto, padding 16px 18px 0; scroll shell`,
  '776b80d9ae2d': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto; пачка незакрытых ·05`,
  '74d66991e535': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto; вес ·04`,
  '18e84f6cdf20': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto; вес ·05`,
  'ad17f268d0f6': `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto; сон ·05`,
};

const FOOTER = {
  foot: `${WPWA}:${lineOf(CSS, '.mc-daily-footer')} .mc-daily-footer — flex gap 8px, padding 12px 18px calc(20px + safe-area); фон --v4-sand-surface-soft`,
  primary: `${WPWA}:${lineOf(CSS, '.mc-daily-footer-primary')} .mc-daily-footer-primary — flex 1.3, min-height 48px, radius 999px, font 700 12px/1, background ${ACT_BTN}`,
  secondary: `${WPWA}:${lineOf(CSS, '.mc-daily-footer-secondary')} .mc-daily-footer-secondary — flex 1, min-height 48px, radius 999px, background ${C1}, color ${INK2}`,
};

const YV = {
  6: `${Y715}:696-701 .yv-hero-title — font 700 20px/1.25, color ${INK}`,
  7: `${Y715}:704-709,1078 .yv-hero-sub — font 500 12px/1.5, color rgba(32,30,29,0.55) sand/blue, margin-top 7px`,
  8: `${Y715}:821-825 .yv-force-list — column gap 7px, margin-top 14px`,
  9: `${Y715}:833-846 .yv-force — background ${C1}, radius 14px, min-height 42px, padding 0 13px`,
  10: `${Y715}:853-856 .yv-force-title — font 600 12.5px/1, color ${INK}`,
  11: `${Y715}:862-866 .yv-force-kcal — font 600 11.5px/1, color ${INK_DATA}`,
  12: `${Y715}:848-851 .yv-force--on — background sand #efe3cf / blue #e2ecf6, box-shadow inset 0 0 0 2px ${ACT_BTN}`,
  13: `${Y715}:858-860 .yv-force--on .yv-force-title — font-weight 700`,
  14: `${Y715}:871-874 .yv-force--on .yv-force-kcal — color ${ACT} sand/blue`,
  15: `${Y715}:876-878 .yv-slider-block — margin-top 16px`,
  16: `${Y715}:295-300 .yv-slider-header — align baseline, justify space-between, gap 10px`,
  17: `${Y715}:303-306 .yv-slider-label — font 600 11.5px/1, color ${INK_DATA}`,
  18: `${Y715}:900-902 .yv-slider-value--over — font 700 15px/1, color ${ACT}`,
  21: `${Y715}:994-1005 .yv-v4-slider-thumb — 20×20px, radius 999px, background #fff sand/blue`,
  24: `${Y715}:1061-1067 .yv-canvas-foot — column gap 8px`,
  25: `${Y715}:734-737 .yv-pack-primary — min-height 48px, radius 999px, background ${ACT_BTN}, font 700 12px/1`,
  26: `${Y715}:1069-1075 .yv-text-later — min-height 44px, font 600 12px/1, color rgba(0,0,0,0.45) sand/blue`,
};

const FORK = {
  9: `${Y715}:803-806 .yv-food-label — font 600 12.5px/1 (row), color ${INK2}`,
  10: `${Y715}:814-816 .yv-food-value — font 600 12.5px/1, color sand #a1471c / blue #b03a24`,
  12: `${Y715}:739-742 .yv-pack-row — gap 8px`,
};

const OWN_NUM = {
  6: YV[6], 7: YV[7], 8: YV[8], 9: YV[9], 10: YV[10], 11: YV[11],
  12: YV[15], 13: YV[16], 14: YV[17], 15: YV[18], 18: YV[21],
  21: FOOTER.foot, 22: FOOTER.primary,
};

const WEIGHT_EXTRA = {
  17: `${WPWA}:${lineOf(CSS, '.mc-kilo-label')} .mc-kilo-label — align center, justify center, margin-top 8px; подпись капсулы колёс`,
  18: `${WPWA}:${lineOf(CSS, '.mc-weight-kilo-card .mc-wheel-picker--compact')} .mc-wheel-picker--compact — flex 1, text-align center; капсула веса`,
  19: `${WPWA}:${lineOf(CSS, '.mc-weight-kilo-card .mc-wheel-value--prev')} .mc-wheel-value--prev — font 600 16px/1.45, color rgba(0,0,0,0.24) sand/blue`,
  20: `${WPWA}:${lineOf(CSS, '.mc-weight-kilo-card .mc-wheel-value--current')} .mc-wheel-value--current — font 700 36px/1.2, color ${ACT}, tracking -.025em`,
  21: `${WPWA}:${lineOf(CSS, '.mc-modal--daily .mc-weight-comma')} .mc-weight-comma — font 700 32px/1, color ${ACT}, padding 0 1px`,
  22: FOOTER.foot,
  23: FOOTER.secondary,
  24: FOOTER.primary,
};

const SLEEP_EXTRA = {
  6: `${WPWA}:${lineOf(CSS, '.mc-sleep-norm')} .mc-sleep-norm — font 500 12px/1.5, color ${INK_DATA}, margin-top 8px`,
  13: `${WPWA}:${lineOf(CSS, '.mc-scale-value')} .mc-scale-value — font 700 15px/1, color ${INK}`,
  15: `${WPWA}:${lineOf(CSS, '.mc-mood-step > .mc-scale-card')} .mc-scale-card — background ${C1}, radius 16px, padding 14px 16px, margin-top 12px`,
  16: `${WPWA}:${lineOf(CSS, '.mc-scale-head')} .mc-scale-head — align baseline, justify space-between`,
  24: `${WPWA}:${lineOf(CSS, '.mc-sleep-block')} .mc-sleep-block — flex 1, text-align center; блок времени сна`,
  28: FOOTER.foot,
  29: FOOTER.primary,
};

const MOOD_EXTRA = {
  11: `${WPWA}:${lineOf(CSS, '.mc-mood-step > .mc-scale-card')} .mc-scale-card — background ${C1}, radius 16px, padding 14px 16px`,
  13: `${WPWA}:${lineOf(CSS, '.mc-scale-value')} .mc-scale-value — font 700 15px/1, color ${INK}`,
  14: `${WPWA}:${lineOf(CSS, '.mc-v4-scale.mc-drag-slider')} .mc-v4-scale.mc-drag-slider — margin-top 10px`,
  16: `${WPWA}:${lineOf(CSS, '.mc-mood-step > .mc-recorded-hint')} .mc-recorded-hint — font 500 11px/1.45, color ${INK_DATA}, margin-top 12px`,
  17: FOOTER.foot,
  19: FOOTER.secondary,
  20: FOOTER.primary,
};

const STEPS_EXTRA = {
  10: `${WPWA}:${lineOf(CSS, '.mc-steps-advice-mark')} .mc-steps-advice-mark — font 700 9px/1, tracking .08em, uppercase, color ${INK_DATA}`,
  11: `${WPWA}:${lineOf(CSS, '.mc-steps-slider-labels')} .mc-steps-slider-labels — justify space-between, margin-top 8px, font 600 9.5px/1, color ${INK_DATA}`,
  12: `${WPWA}:${lineOf(CSS, '.mc-steps-slider-container > .mc-recorded-hint')} .mc-recorded-hint под дорожкой — font 500 11px/1.45, color ${INK_DATA}`,
  14: `${WPWA}:${lineOf(CSS, '.mc-steps-info-card')} .mc-steps-info-card — background ${C1}, radius 16px, padding 14px 16px, margin-top 12px`,
  15: `${WPWA}:${lineOf(CSS, '.mc-steps-refeed-title')} .mc-steps-refeed-title — font 600 12.5px/1.2, color ${INK}`,
  16: `${WPWA}:${lineOf(CSS, '.mc-steps-refeed-hint')} .mc-steps-refeed-hint — font 500 11px/1.45, color ${INK_DATA}, margin-top 4px`,
  17: `${WPWA}:${lineOf(CSS, '.mc-steps-refeed-row .mc-rest-yesno')} .mc-rest-yesno в refeed — gap 6px`,
  21: FOOTER.foot,
  22: FOOTER.primary,
  27: FOOTER.foot,
  28: FOOTER.primary,
  20: `${WPWA}:${lineOf(CSS, '.mc-steps-step > .mc-recorded-hint')} .mc-recorded-hint сноска шага — margin-top 14px (своё число без hint под дорожкой); ${STEPS}:steps custom`,
};

const ESTIMATED = {
  4: `${STEPS}:1798 .mc-step-kicker «Вес на утро» — font 600 13px/1, tracking .02em, color rgba(0,0,0,0.6) sand/blue`,
  5: `${STEPS}:1799 inline hero row — align baseline, gap 8px, margin-top 14px`,
  12: `${STEPS}:1828 estimate row — font 600 12px/1, color ${INK_DATA}; «73,9 кг» моноцифры в ряду среднего`,
};

const ESTIMATED_EMPTY = {
  4: ESTIMATED[4],
  5: ESTIMATED[5],
  6: `${STEPS}:1800 inline estimated hero — fontSize 58, fontWeight 600, lineHeight 0.9, color rgba(0,0,0,0.45)`,
  8: `${STEPS}:1803-1808 badge — padding 5px 12px, radius 999px, background sand #efe3cf / blue #e2ecf6, color ${ACT}`,
  9: `${STEPS}:1809-1810 card — width 100%, background ${C1}, radius 20px, padding 15px 17px, margin-top 22px`,
  10: `${STEPS}:1831-1833 profile copy — font 600 11.5px/1.5, color rgba(0,0,0,0.6)`,
};

const FIRST_WEIGHT_EXTRA = {
  14: `${WPWA}:1095-1097 .mc-daily-greeting:not(:has(.mc-daily-streak-banner)) + .mc-weight-hero — margin-top 30px (первое утро без серии)`,
  15: `${WPWA}:1088-1090 .mc-weight-hero:not(:has(.mc-weight-week-delta)) + .mc-weight-kilo-card — margin-top 36px`,
  16: WEIGHT_EXTRA[17],
  17: WEIGHT_EXTRA[18],
  18: WEIGHT_EXTRA[19],
  20: WEIGHT_EXTRA[22],
  21: WEIGHT_EXTRA[23],
  22: WEIGHT_EXTRA[24],
};

const BLOCK_A_PATTERNS = [
  /^Чек-ин · вчерашний день · (09|10)$/,
  /^Чек-ин · вчера по ощущениям · (0[1-9]|1[0-8]|21|24|25)$/,
  /^Чек-ин · пачка незакрытых дней · (0[1-4]|12)$/,
  /^Чек-ин · пачка после очистки · (0[1-4])$/,
  /^Чек-ин · день из пачки · 0[1-5]$/,
  /^Чек-ин · пустой день из пачки · 0[1-5]$/,
  /^Чек-ин · сила для пачки · (0[1-9]|1[0-8]|21|25|26)$/,
];

const BLOCK_C = /остальное|замеры|согласие|цикл|записано|Рутина|курс добавок|холод тип/i;

const BLOCK_B_FRAMES = new Set([
  'Чек-ин · вчера по ощущениям',
  'Чек-ин · по ощущениям своё число',
  'Чек-ин · цель по шагам',
  'Чек-ин · шаги при коротком сне',
  'Чек-ин · шаги при тяжёлом утре',
  'Чек-ин · шаги после тренировки',
  'Чек-ин · шаги на потолке',
  'Чек-ин · шаги без истории',
  'Чек-ин · шаги своё число',
  'Чек-ин · вес',
  'Чек-ин · первый вес',
  'Чек-ин · сон',
  'Чек-ин · как вы сегодня',
  'Чек-ин · расчётный вес',
  'Чек-ин · расчётный вес без истории',
]);

function isBlockA(key) {
  return BLOCK_A_PATTERNS.some((p) => p.test(key));
}

function frameLine(key) {
  const m = /^(.*) · (\d+)$/.exec(key);
  return m ? { frame: m[1], line: Number(m[2]) } : null;
}

function isBlockB(key) {
  if (isBlockA(key) || BLOCK_C.test(key)) return false;
  const fl = frameLine(key);
  if (!fl) return false;
  if (fl.frame === 'Чек-ин · вчера по ощущениям') {
    return ![...Array(18)].map((_, i) => i + 1).concat(21, 24, 25).includes(fl.line);
  }
  if (BLOCK_B_FRAMES.has(fl.frame)) return true;
  if (/^Чек-ин · шаги/.test(fl.frame)) return true;
  return false;
}

function factFor(key, row) {
  if (SHELL[row.h]) return SHELL[row.h];
  const fl = frameLine(key);
  if (!fl) return null;
  const { frame, line } = fl;

  if (isBlockA(key)) {
    if (frame === 'Чек-ин · вчерашний день' && (line === 9 || line === 10)) return FORK[line];
    if (frame === 'Чек-ин · пачка незакрытых дней' && line === 12) return FORK[12];
    if (frame === 'Чек-ин · пачка после очистки' && line === 12) return YV[26];
    if (YV[line]) return YV[line];
    return null;
  }

  if (frame === 'Чек-ин · по ощущениям своё число' && OWN_NUM[line]) return OWN_NUM[line];
  if (frame === 'Чек-ин · вес' && WEIGHT_EXTRA[line]) return WEIGHT_EXTRA[line];
  if (frame === 'Чек-ин · первый вес' && FIRST_WEIGHT_EXTRA[line]) return FIRST_WEIGHT_EXTRA[line];
  if (frame === 'Чек-ин · сон' && SLEEP_EXTRA[line]) return SLEEP_EXTRA[line];
  if (frame === 'Чек-ин · как вы сегодня' && MOOD_EXTRA[line]) return MOOD_EXTRA[line];
  if (frame === 'Чек-ин · расчётный вес' && ESTIMATED[line]) return ESTIMATED[line];
  if (frame === 'Чек-ин · расчётный вес без истории' && ESTIMATED_EMPTY[line]) return ESTIMATED_EMPTY[line];
  if (/^Чек-ин · шаги/.test(frame) || frame === 'Чек-ин · цель по шагам') {
    if (STEPS_EXTRA[line]) return STEPS_EXTRA[line];
  }

  return null;
}

const zone = readZone('checkin-morning', ROOT);
let beforeQ = 0;
let set = 0;
const missing = [];

for (const [key, row] of Object.entries(zone.rows)) {
  if (row.v === '?') beforeQ += 1;
  if (!isBlockA(key) && !isBlockB(key)) continue;

  const f = factFor(key, row);
  if (!f) {
    if (row.v === '?') missing.push(key);
    continue;
  }

  const result = setVerdictKey('checkin-morning', key, { verdict: '=', fact: f, options: {} }, {
    skipIf: (live) => live.v !== '?',
  });
  if (result.skipped) continue;
  set += 1;
}

const afterZone = readZone('checkin-morning', ROOT);
let afterQ = 0;
for (const row of Object.values(afterZone.rows)) {
  if (row.v === '?') afterQ += 1;
}

console.log(JSON.stringify({
  rehash: 'checkin-morning: отпечатки пересняты (run separately)',
  beforeQ,
  set,
  afterQ,
  missing: missing.length,
  missingKeys: missing,
}, null, 2));

if (missing.length) process.exitCode = 1;
