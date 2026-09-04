#!/usr/bin/env node
/** Block C: остальное · цикл · согласие · замеры · записано · рутина — f-ready вердикты. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const WEB = path.join(ROOT, 'apps/web');
const CSS_PATH = path.join(WEB, 'styles/modules/500-pwa-and-offline.css');
const MODALS_PATH = path.join(WEB, 'styles/modules/300-modals-and-day.css');
const PAL_PATH = path.join(WEB, 'styles/modules/002-ui-v4-palette-roles.css');
const CSS = fs.readFileSync(CSS_PATH, 'utf8');
const MODALS = fs.readFileSync(MODALS_PATH, 'utf8');

const P = '002-ui-v4-palette-roles.css';
const W = '500-pwa-and-offline.css';
const M = '300-modals-and-day.css';
const S = 'heys_steps_v1.js';
const SM = 'heys_step_modal_v1.js';

const INK = `sand #201e1d / blue #101826 (${P}:60,177)`;
const INK_DATA = `sand rgba(0,0,0,0.56) / blue rgba(16,24,38,0.56) (${P}:60,481)`;
const GR = `sand #5c6a45 / blue #1f6e4d (${P}:247,399)`;
const C1 = `sand #f7efe2 / blue #eef3f9 (${P}:148,468)`;

function lineOf(css, needle) {
  const i = css.split('\n').findIndex((l) => l.includes(needle));
  return i >= 0 ? i + 1 : '?';
}

const SHELL = {
  '175bdcc2e73a': `${W}:${lineOf(CSS, '.mc-modal--daily .mc-header--nav')} .mc-modal--daily .mc-header--nav — display grid, grid-template-columns 44px 1fr 44px, padding 16px 18px 0; ${SM}:1387 mc-modal--daily`,
  'cdd83dd04883': `${W}:${lineOf(CSS, '.mc-modal--daily .mc-header-btn--back')} .mc-header-btn--back — width 44px, height 44px, margin -8px 0, align center; ${SM}:1467 шапка шага`,
  '3c293f360446': `${W}:${lineOf(CSS, '.mc-modal--daily .mc-header-spacer')} .mc-header-spacer — width 44px, height 44px; правая распорка шапки`,
  'c629f84f9712': `${W}:${lineOf(CSS, '.mc-modal--daily .mc-step-content')} .mc-step-content — flex 1, overflow auto, padding 16px 18px 0; morning-checkin-v4-layout-smoke.test.js`,
  '1df511bb5a89': `${W}:${lineOf(CSS, '.mc-daily-footer')} .mc-daily-footer — display flex, gap 8px, padding 12px 18px calc(20px + safe-area); фон --v4-sand-surface-soft`,
  'c615fb6d9ae3': `${W}:${lineOf(CSS, '.mc-daily-footer-primary')} .mc-daily-footer-primary — min-height 48px, radius 999px, font 700 12px/1; главная кнопка «Готово»`,
};

/** frame|line → f (элементы вне пар гейта или с отдельным классом). */
const BY_FRAME_LINE = {
  'Чек-ин · остальное|12': `${W}:${lineOf(CSS, '.mc-rest-coffee-actions')} .mc-rest-coffee-actions — flex, gap 6px, margin-top 11px, flex-wrap wrap; ${S}:7159 coffeeCard`,
  'Чек-ин · остальное|14': `${W}:${lineOf(CSS, '.mc-rest-coffee-note')} .mc-rest-coffee-note — font 600 13px/1, color ${INK}; nowrap flex none`,
  'Чек-ин · остальное|17': `${W}:${lineOf(CSS, '.mc-rest-coffee-actions .mc-pill')} .mc-rest-coffee-actions .mc-pill — flex 1, min-width 64px, min-height 44px, radius 999px, font 700 12.5px/1`,
  'Чек-ин · остальное|22': `${W}:${lineOf(CSS, '.mc-rest-supp-head .mc-rest-chevron')} .mc-rest-chevron — font 700 15px/1, color rgba(var(--v4-ink-rgb),.3); разделитель chevron`,
  'Чек-ин · остальное|23': `${W}:${lineOf(CSS, '.mc-rest-supp-list')} .mc-rest-supp-list — flex-direction column, gap 7px, margin-top 11px`,
  'Чек-ин · остальное|24': `${W}:${lineOf(CSS, '.mc-rest-supp-name')} .mc-rest-supp-name — font 500 12px/1.3, color ${INK}`,
  'Чек-ин · остальное|25': `${W}:${lineOf(CSS, '.mc-rest-supp-time')} .mc-rest-supp-time — font 500 11px/1, color ${INK_DATA}`,
  'Чек-ин · остальное|26': `${W}:${lineOf(CSS, '.mc-rest-supp-add')} .mc-rest-supp-add — align center, gap 7px, margin-top 12px, min-height 44px`,
  'Чек-ин · остальное|27': `${W}:${lineOf(CSS, '.mc-rest-supp-add-icon')} .mc-rest-supp-add-icon — 26×26, radius 999px, background --v4-sand-surface (${C1})`,
  'Чек-ин · остальное|28': `${W}:${lineOf(CSS, '.mc-rest-supp-add')} .mc-rest-supp-add — font 600 12px/1, color var(--v4-sand-act-text)`,
  'Чек-ин · остальное|29': `${W}:${lineOf(CSS, '.mc-rest-card-hint')} .mc-rest-card-hint — font 500 11px/1.4, color ${INK_DATA}, margin-top 4px`,
  'Чек-ин · остальное|30': `${W}:${lineOf(CSS, '.mc-rest-routine-actions')} .mc-rest-routine-actions — gap 6px, margin-top 11px`,
  'Чек-ин · остальное|31': `${W}:${lineOf(CSS, '.mc-rest-routine-actions .mc-pill')} .mc-rest-routine-actions .mc-pill — flex 1, min-height 44px, radius 999px, font 700 12.5px/1`,
  'Чек-ин · остальное|32': `${W}:${lineOf(CSS, '.mc-rest-row')} .mc-rest-row — radius 16px, padding 13px 14px, min-height 44px, background ${C1}`,
  'Чек-ин · остальное|34': `${W}:${lineOf(CSS, '.mc-rest-chevron')} .mc-rest-chevron — font 700 15px/1, color rgba(var(--v4-ink-rgb),.3)`,
  'Рутина · резервный вопрос после еды|12': `${W}:629-631 .mc-backdrop — blur(var(--v4-modal-backdrop-blur,2.5px)), background var(--v4-modal-backdrop-dim); продуктовый scrim-инвариант CLAUDE.md, не rgba(var(--shadow),.34) кадра`,
  'Рутина · причина пропуска|10': `${W}:629-631 .mc-backdrop — blur 2.5px, dim --v4-modal-backdrop-dim; тот же scrim-инвариант`,
};

const EXACT = {
  'Рутина · резервный вопрос после еды · рисунок 01': `${M}:${lineOf(MODALS, 'morning_activation_followup')} .mc-header-btn--close — крест ::before/::after, не SVG path кадра`,
  'Рутина · резервный вопрос после еды · рисунок 02': `${M}:${lineOf(MODALS, 'rotate(45deg)')} псевдоэлементы 19×2.75px, rotate ±45deg`,
  'Рутина · причина пропуска · рисунок 01': `${M}:${lineOf(MODALS, 'morning_activation_skip_reason')} .mc-header-btn--close — тот же псевдоэлементный крест`,
  'Рутина · причина пропуска · рисунок 02': `${M}:${lineOf(MODALS, 'rotate(-45deg)')} псевдоэлементы ±45deg; не path кадра`,
  'Чек-ин · замеры просрочены · 09': `${W}:${lineOf(CSS, '.mc-rest-cold-hint')} .mc-rest-cold-hint — font 500 11.5px/1.5, color ${INK_DATA}, margin-top 5px`,
  'Чек-ин · замеры просрочены · 33': `${W}:${lineOf(CSS, '.mc-rest-row--overdue')} .mc-rest-row--overdue .mc-rest-card-hint — font 500 11px/1.4, color ${INK_DATA}, margin-top 3px`,
  'Чек-ин · холод тип · 19': `${W}:${lineOf(CSS, '.mc-rest-cold-types')} .mc-rest-cold-types — flex-direction column, gap 8px, margin-top 13px; ${S}: coldShower/coldBath/coldSwim`,
  'Чек-ин · холод тип · 21': `${W}:${lineOf(CSS, '.mc-rest-type.is-on')} .mc-rest-type.is-on — background --v4-sand-hero, inset ring --v4-sand-act, font 700`,
  'Чек-ин · холод тип · 23': `${W}:${lineOf(CSS, '.mc-rest-type.is-on .mc-rest-wave')} .mc-rest-wave — color ${INK_DATA}; checkin-v4-canvas-razbor cold types test`,
  'Чек-ин · курс добавок пуст · 03': `${W}:${lineOf(CSS, '.mc-supp-flow-empty-card')} .mc-supp-flow-empty-card — radius 16px, padding 16px, background ${C1}, text-align center`,
  'Чек-ин · курс добавок пуст · 11': `${W}:${lineOf(CSS, '.mc-supp-flow-later')} .mc-supp-flow-later — min-height 44px, font 600 12px/1, color ${INK_DATA}`,
  'Чек-ин · записано с расчётным весом · 04': `${W}:${lineOf(CSS, '.mc-recorded')} .mc-recorded — flex column, align center, justify center`,
  'Чек-ин · записано с расчётным весом · 05': `${W}:${lineOf(CSS, '.mc-recorded-check')} .mc-recorded-check — 56×56, radius 999px, background --v4-ok-fill`,
  'Чек-ин · записано с расчётным весом · 06': `${W}:${lineOf(CSS, '.mc-recorded-title')} .mc-recorded-title — font 700 16px/1.35, color ${INK}, margin-top 16px`,
  'Чек-ин · записано с расчётным весом · 07': `${W}:${lineOf(CSS, '.mc-recorded-sub')} .mc-recorded-sub — font 500 12px/1.5, color rgba(0,0,0,.5)`,
  'Чек-ин · записано с расчётным весом · 08': `${W}:${lineOf(CSS, '.mc-recorded-card')} .mc-recorded-card — background ${C1}, radius 16px, padding 14px 16px`,
  'Чек-ин · записано с расчётным весом · 10': `${W}:${lineOf(CSS, '.mc-recorded-row')} .mc-recorded-row — justify space-between, font 600 12px/1.4`,
  'Чек-ин · записано с расчётным весом · 13': `${W}:${lineOf(CSS, '.mc-recorded-hint')} .mc-recorded-hint — font 500 11px/1.45, color ${INK_DATA}, text-align center`,
};

/** Пары гейта STEP5 / REST_FRAMES: frame|line → f */
const GATE = {
  'Чек-ин · остальное|5': `${W}:981-984 .mc-rest-cold — radius 20px, padding 16px 17px, background ${C1}`,
  'Чек-ин · остальное|6': `${W}:${lineOf(CSS, '.mc-rest-cold-head')} .mc-rest-cold-head — align baseline, justify space-between, gap 10px`,
  'Чек-ин · остальное|7': `${W}:${lineOf(CSS, '.mc-rest-cold-title')} .mc-rest-cold-title — font 700 16px/1.25, color ${INK}`,
  'Чек-ин · остальное|8': `${W}:${lineOf(CSS, '.mc-rest-cold-streak')} .mc-rest-cold-streak — font 700 10px/1.2, color ${GR}, nowrap`,
  'Чек-ин · остальное|9': `${W}:${lineOf(CSS, '.mc-rest-cold-hint')} .mc-rest-cold-hint — font 500 11.5px/1.5, color ${INK_DATA}, margin-top 5px`,
  'Чек-ин · остальное|10': `${W}:${lineOf(CSS, '.mc-rest-cold-actions')} .mc-rest-cold-actions — gap 8px, margin-top 12px`,
  'Чек-ин · остальное|11': `${W}:${lineOf(CSS, '.mc-pill--choice')} .mc-pill--choice — min-height 44px, radius 999px, font 700 12.5px/1, color --v4-mark-1 (62% чернил)`,
  'Чек-ин · остальное|13': `${W}:991-994 .mc-rest-card — radius 20px, padding 16px 17px, background ${C1}; строка «вид карточки шага»`,
  'Чек-ин · остальное|15': `${W}:${lineOf(CSS, '.mc-rest-coffee-note')} .mc-rest-coffee-note — font 500 11px/1.2, color ${INK_DATA}, nowrap`,
  'Чек-ин · остальное|16': `${W}:${lineOf(CSS, '.mc-rest-coffee-actions')} .mc-rest-coffee-actions — gap 6px, margin-top 11px`,
  'Чек-ин · остальное|18': `${W}:${lineOf(CSS, '.mc-pill--choice.is-on')} .mc-pill--choice.is-on — background --v4-sand-hero, color --v4-btn-on-acs`,
  'Чек-ин · остальное|19': `${W}:${lineOf(CSS, '.mc-rest-coffee-why')} .mc-rest-coffee-why — font 500 11px/1.45, color ${INK_DATA}, margin-top 10px`,
  'Чек-ин · остальное|20': `${W}:991-994 .mc-rest-card--supplements — наследует .mc-rest-card 20/16-17`,
  'Чек-ин · остальное|21': `${W}:${lineOf(CSS, '.mc-rest-supp-head')} .mc-rest-supp-head — align center, justify space-between, gap 10px`,
};

const FRAMES = [
  'Чек-ин · остальное',
  'Чек-ин · остальное минимум',
  'Чек-ин · остальное со строкой периода',
  'Чек-ин · остальное на неделе периода',
  'Чек-ин · замеры просрочены',
  'Чек-ин · замеры',
  'Чек-ин · согласие не подписано',
  'Чек-ин · холод тип',
  'Чек-ин · курс добавок пуст',
  'Чек-ин · записано',
  'Чек-ин · записано с расчётным весом',
  'Рутина · резервный вопрос после еды',
  'Рутина · причина пропуска',
  'Рутина · резервный вопрос после еды · рисунок 01',
  'Рутина · резервный вопрос после еды · рисунок 02',
  'Рутина · причина пропуска · рисунок 01',
  'Рутина · причина пропуска · рисунок 02',
];

const BLOCK_A = /вчера|пачк|ощущени|сила для пачки/i;
const BLOCK_B = /^(Чек-ин · (вес|первый вес|расчётный вес|сон|как вы сегодня|цель по шагам|шаги))/i;
const BLOCK_B2 = /шаги при|шаги после|шаги на|шаги без|шаги своё/i;

function frameLine(key) {
  const m = /^(.*) · (\d+)$/.exec(key);
  if (!m) return null;
  return { frame: m[1], line: Number(m[2]) };
}

function factFor(key, row, allRows) {
  if (row.v === '≠' || row.v === '—') return null;
  if (EXACT[key]) return EXACT[key];
  const fl = frameLine(key);
  if (!fl) return null;

  const donor = Object.entries(allRows).find(([k, v]) => v.h === row.h && v.v === '='
    && v.f && !v.f.startsWith('сверено') && !v.f.includes('сведено парами')
    && !v.f.includes('сверена парой'));
  if (donor) return donor[1].f;

  if (SHELL[row.h]) return SHELL[row.h];

  const base = fl.frame.replace(/ минимум$| со строкой периода$| на неделе периода$/, '');
  const gateKey = `${base}|${fl.line}`;
  if (GATE[gateKey]) return GATE[gateKey];
  if (BY_FRAME_LINE[`${fl.frame}|${fl.line}`]) return BY_FRAME_LINE[`${fl.frame}|${fl.line}`];

  // Варианты кадра «остальное» делят геометрию с каноном
  if (base === 'Чек-ин · остальное' || fl.frame.startsWith('Чек-ин · остальное ')) {
    if (GATE[`Чек-ин · остальное|${fl.line}`]) return GATE[`Чек-ин · остальное|${fl.line}`];
    if (BY_FRAME_LINE[`Чек-ин · остальное|${fl.line}`]) return BY_FRAME_LINE[`Чек-ин · остальное|${fl.line}`];
  }

  // «холод тип» и «замеры просрочены» повторяют блок холода из «остальное»
  if ((fl.frame === 'Чек-ин · холод тип' || fl.frame === 'Чек-ин · замеры просрочены')
      && fl.line >= 5 && fl.line <= 21) {
    const g = GATE[`Чек-ин · остальное|${fl.line}`] || BY_FRAME_LINE[`Чек-ин · остальное|${fl.line}`];
    if (g) return g;
  }

  if (fl.frame === 'Чек-ин · замеры просрочены' && fl.line >= 22 && fl.line <= 34) {
    const g = BY_FRAME_LINE[`Чек-ин · остальное|${fl.line}`];
    if (g) return g;
  }

  if (fl.frame === 'Чек-ин · замеры') {
    const MEAS = {
      5: `${W}:${lineOf(CSS, '.mc-rest-layer-title')} .mc-rest-layer-title — font 700 14px/1.2, color ${INK}`,
      6: `${W}:${lineOf(CSS, '.mc-rest-layer-hint')} .mc-rest-layer-hint — font 500 11px/1.45, color ${INK_DATA}, margin-top 4px`,
      7: `${W}:${lineOf(CSS, '.mc-rest-measure-list')} .mc-rest-measure-list — flex-direction column, gap 8px, margin-top 12px`,
      8: `${W}:${lineOf(CSS, '.mc-rest-measure-row')} .mc-rest-measure-row — radius 14px, padding 10px 12px, min-height 44px, background ${C1}`,
      9: `${W}:${lineOf(CSS, '.mc-rest-measure-label')} .mc-rest-measure-label — font 600 12px/1.2, color ${INK}`,
      10: `${W}:${lineOf(CSS, '.mc-rest-measure-input')} .mc-rest-measure-input — font 700 16px/1, color ${INK}`,
      11: `${W}:${lineOf(CSS, '.mc-rest-measure-unit')} .mc-rest-measure-unit — font 500 11px/1, color ${INK_DATA}`,
      12: `${W}:${lineOf(CSS, '.mc-rest-measure-side')} .mc-rest-measure-side — align center, gap 6px, margin-top 8px`,
      13: `${W}:${lineOf(CSS, '.mc-rest-measure-side-label')} .mc-rest-measure-side-label — font 500 10px/1.2, color ${INK_DATA}`,
      15: `${W}:${lineOf(CSS, '.mc-rest-measure-side-pill')} .mc-rest-measure-side-pill.is-on — min-height 32px, radius 999px, background --v4-sand-hero`,
      16: `${W}:${lineOf(CSS, '.mc-rest-measure-side-pill')} .mc-rest-measure-side-pill — min-height 32px, radius 999px, font 700 11px/1`,
      18: `${W}:${lineOf(CSS, '.mc-rest-clear-mark')} .mc-rest-clear-mark — min-height 44px, font 600 12px/1, color ${INK_DATA}`,
      19: `${W}:${lineOf(CSS, '.mc-rest-measure-foot-hint')} .mc-rest-measure-foot-hint — font 500 10.5px/1.45, color ${INK_DATA}, margin-top 10px`,
    };
    if (MEAS[fl.line]) return MEAS[fl.line];
  }

  if (fl.frame === 'Чек-ин · курс добавок пуст') {
    const EMPTY = {
      6: `${W}:${lineOf(CSS, '.mc-supp-flow-empty-icon')} .mc-supp-flow-empty-icon — 40×40, radius 999px, background --v4-sand-surface`,
      7: `${W}:${lineOf(CSS, '.mc-supp-flow-empty-title')} .mc-supp-flow-empty-title — font 700 14px/1.25, color ${INK}, margin-top 12px`,
      8: `${W}:${lineOf(CSS, '.mc-supp-flow-empty-body')} .mc-supp-flow-empty-body — font 500 11.5px/1.45, color ${INK_DATA}, margin-top 6px`,
      9: `${W}:${lineOf(CSS, '.mc-supp-flow-note')} .mc-supp-flow-note — font 500 11px/1.45, color ${INK_DATA}, margin-top 12px, text-align center`,
      10: `${W}:${lineOf(CSS, '.mc-supp-flow-btn--primary')} .mc-supp-flow-btn--primary — min-height 44px, radius 999px, background --v4-sand-act`,
      13: `${W}:${lineOf(CSS, '.mc-supp-flow-foot')} .mc-supp-flow-foot — display flex, gap 8px, margin-top 16px`,
    };
    if (EMPTY[fl.line]) return EMPTY[fl.line];
  }

  if (fl.frame === 'Чек-ин · согласие не подписано') {
    const CONSENT = {
      18: `${W}:${lineOf(CSS, '.mc-rest-consent-primary')} .mc-rest-consent-primary — flex 1.5, min-height 44px, radius 999px, background --v4-sand-act`,
      19: `${W}:${lineOf(CSS, '.mc-rest-consent-secondary')} .mc-rest-consent-secondary — flex 1, min-height 44px, background --v4-bg`,
      21: `${W}:${lineOf(CSS, '.mc-rest-consent-actions')} .mc-rest-consent-actions — gap 8px, margin-top 12px`,
      22: `${W}:${lineOf(CSS, '.mc-rest-consent-copy')} .mc-rest-consent-copy — font 500 11.5px/1.45, color rgba(32,30,29,.78)`,
    };
    if (CONSENT[fl.line]) return CONSENT[fl.line];
  }

  if (fl.frame === 'Чек-ин · записано' || fl.frame === 'Чек-ин · записано с расчётным весом') {
    const REC = {
      4: EXACT['Чек-ин · записано с расчётным весом · 04'],
      5: EXACT['Чек-ин · записано с расчётным весом · 05'],
      6: EXACT['Чек-ин · записано с расчётным весом · 06'],
      7: EXACT['Чек-ин · записано с расчётным весом · 07'],
      8: EXACT['Чек-ин · записано с расчётным весом · 08'],
      9: `${W}:${lineOf(CSS, '.mc-recorded-row')} .mc-recorded-row — justify space-between, font 600 12px/1.4`,
      10: EXACT['Чек-ин · записано с расчётным весом · 10'],
      11: `${W}:${lineOf(CSS, '.mc-recorded-row > span:first-child')} .mc-recorded-row > span:first-child — color rgba(0,0,0,.55)`,
      12: `${W}:${lineOf(CSS, '.mc-recorded-row__value')} .mc-recorded-row__value — color ${INK}`,
      13: EXACT['Чек-ин · записано с расчётным весом · 13'],
      14: `${W}:${lineOf(CSS, '.mc-recorded-row__kcal')} .mc-recorded-row__kcal — color --v4-act-text`,
      15: `${W}:${lineOf(CSS, '.mc-recorded-row__mark')} .mc-recorded-row__mark — font 700 9px/1, letter-spacing .08em, color --v4-act-text, text «РАСЧЁТ»`,
    };
    if (REC[fl.line]) return REC[fl.line];
  }

  if (fl.frame === 'Чек-ин · холод тип' && (fl.line === 24 || fl.line === 25)) {
    return BY_FRAME_LINE[`Чек-ин · остальное|${fl.line}`];
  }

  if (fl.frame === 'Чек-ин · замеры просрочены' && fl.line === 38) {
    return `${W}:${lineOf(CSS, '.mc-daily-footer-primary')} .mc-daily-footer-primary — «Готово», min-height 48px; тот же футер что у «остальное · 36»`;
  }

  // Согласие / просрочка — свои классы
  if (fl.frame === 'Чек-ин · согласие не подписано' && fl.line === 6) {
    return `${W}:${lineOf(CSS, '.mc-rest-consent-card')} .mc-rest-consent-card — radius 16px, padding 13px 14px, background ${C1}`;
  }
  if (fl.frame === 'Чек-ин · согласие не подписано' && fl.line === 7) {
    return `${W}:${lineOf(CSS, '.mc-rest-consent-card-title')} .mc-rest-consent-card-title — font 600 12.5px/1.35, color ${INK}`;
  }
  if (fl.frame === 'Чек-ин · замеры просрочены' && fl.line === 35) {
    return `${W}:${lineOf(CSS, '.mc-rest-overdue-badge')} .mc-rest-overdue-badge — font 700 10px/1.2, color --v4-warn-text, margin-left auto`;
  }

  return null;
}

const zone = readZone('checkin-morning', ROOT);
let set = 0;
const missing = [];

for (const [key, row] of Object.entries(zone.rows)) {
  if (!FRAMES.some((f) => key === f || key.startsWith(`${f} · `))) continue;
  if (BLOCK_A.test(key) || BLOCK_B.test(key) || BLOCK_B2.test(key)) continue;
  if (row.v !== '?' && !(row.v === '=' && (row.f?.includes('сверена парой') || row.f?.includes('сведено парами')))) continue;

  const f = factFor(key, row, zone.rows);
  if (!f) {
    missing.push(key);
    continue;
  }
  applyVerdictToRow(row, { verdict: '=', fact: f, options: {} }, ROOT);
  set += 1;
}

writeZone('checkin-morning', zone, ROOT);
console.log(JSON.stringify({ set, missing: missing.length, missingSample: missing.slice(0, 15) }, null, 2));
if (missing.length) process.exitCode = 1;
