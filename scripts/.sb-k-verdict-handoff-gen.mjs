#!/usr/bin/env node
/** Generates scripts/.sb-k-verdict-handoff.json from compact K-block specs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEMO_NA = {
  verdict: '—',
  f: 'Подпись демо-рамки канваса (.top/.ttl); продукт не рисует «Случай N» — экран builder с живой шапкой.',
  'na-kind': 'demo-only',
};

const SHELL = {
  '01': { verdict: '=', f: '.sb-builder-screen > .sb-head — flex gap 10px padding 16px 18px 0; 750-strength-builder.css:3198-3208; dispute-k test K* row 01.' },
  '02': { verdict: '=', f: '.sb-head-title — column gap 3px; 750-strength-builder.css:3211-3217.' },
  '05': { verdict: '=', f: '.sb-list — overflow-y auto padding 12px 18px; 750-strength-builder.css:3299-3302.' },
};

const blocks = {
  'Спорное · тап по закрытому во время отдыха': {
    caseKey: 'случай 1 · тап по закрытому во время отдыха',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: '.sb-list padding-top 12px — 750-strength-builder.css:3301.' },
      '07': { verdict: '=', f: 'Карточки .sb-ex без border-bottom между строками — .sb-ex-head border 0.' },
      '08': { verdict: '=', f: '.sb-rest-compact-copy b — color var(--tx), tabular-nums; RestRing collapsed superset_ui.' },
      '09': { verdict: '=', f: '.sb-rest-compact-copy span — 500 11px/1.3 rgba(var(--ink),.56); 750-strength-builder.css:1142-1149.' },
      '10': { verdict: '=', f: '.sb-rest-compact i «развернуть» — 700 11.5px var(--ac); dispute-k test K1.' },
      '11': { verdict: '=', f: '.sb-ex--collapsed margin-top через .sb-list gap 8px.' },
      '12': { verdict: '=', f: '.sb-ex-head — align-items center gap 10px; 750-strength-builder.css:3311-3315.' },
      '13': { verdict: '=', f: '.sb-ex.is-complete .sb-ex-num — bg var(--bg) inset var(--gr-bg) color var(--gr); sand+blue dispute-k.' },
      '14': { verdict: '=', f: '.sb-ex--collapsed .sb-ex-title b — 700 12.5px/1.2 var(--tx); builder_ui collapsedExerciseRow.' },
      '15': { verdict: '=', f: '.sb-ex-state.is-editing «правится» — 700 11px var(--ac); rest owner + openIdx≠index.' },
      '16': { verdict: '=', f: 'Таблица подходов открытого упражнения — .sb-aps margin-top 10px (open card body).' },
      '17': { verdict: '=', f: '.sb-ap.is-done .sb-ap-num — bg var(--gr-bg) color var(--gr).' },
      '18': { verdict: '=', f: 'Последняя строка подхода border-bottom none — .sb-ap:last-child.' },
      '19': { verdict: '=', f: '.sb-rest-note / collapsed ring — таймер не сбрасывается; strength-builder-ui.test.js K1.' },
      'текст': { verdict: '=', f: 'Тап по закрытому → .sb-rest--collapsed, ring скрыт, таймер идёт — strength-builder-dispute-k + ui.test.js.' },
    },
  },
  'Спорное · подход добавлен к закрытому': {
    caseKey: 'случай 2 · подход добавлен к закрытому упражнению',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: '.sb-stats gap 6px margin-top 18px — счётчик дня обновляется live, без двойной пилюли демо.' },
      '07': { verdict: '=', f: 'Демо «23 подхода» зачёркнуто — продукт: один .sb-stat с актуальным «N из M подходов».' },
      '08': { verdict: '=', f: '.sb-stat:nth-child(2) после +Подход — bg var(--gr-bg) color var(--gr); dispute-k K2.' },
      '09': { verdict: '=', f: '.sb-ex.is-current .sb-ex-num — bg var(--acs) color var(--on-acs) при reopened.' },
      '10': { verdict: '=', f: '.sb-ex-head gap 10px align center.' },
      '11': { verdict: '=', f: '.sb-ex-num accent при текущем упражнении после reopen.' },
      '12': { verdict: '=', f: '.sb-ex-title column gap 2px.' },
      '13': { verdict: '=', f: '.sb-ex-title b — 700 12.5px var(--tx).' },
      '14': { verdict: '=', f: '.sb-ex-sub.is-reopened «было N из N · стало N из M» — builder_ui collapsedExerciseRow + ex.reopened после addApproach на закрытом.' },
      '15': { verdict: '=', f: 'Новая строка подхода margin-top 10px — .sb-aps.' },
      '16': { verdict: '=', f: '.sb-ap-num pending — bg rgba(var(--ink),.06) color rgba(var(--ink),.62).' },
      '17': { verdict: '=', f: '.sb-ap-check empty — bg rgba(.06) color rgba(.24) inset border.' },
      '18': { verdict: '=', f: '.sb-finish «Завершить · N не закрыто» margin-top 9px — 750-strength-builder.css:3384-3398.' },
      '19': { verdict: '=', f: 'completedAt:null on +Подход — strength-builder-ui.test.js K2.' },
      'текст': { verdict: '=', f: '«Завершить · 1 не закрыто» + reopen label — dispute-k + ui.test.js.' },
    },
  },
  'Спорное · рабочий стал разминкой': {
    caseKey: 'случай 3 · рабочий подход переключили в разминку',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': SHELL['05'],
      '07': { verdict: '=', f: 'RenumberScreen .sb-renumber-row — grid 44px 1fr 1fr 44px.' },
      '08': { verdict: '=', f: '.sb-renumber-tonnage b — color var(--tx); sand+blue dispute-k K3.' },
      '09': { verdict: '=', f: '.sb-renumber-tonnage b — 700 12.5px tabular-nums var(--tx).' },
      '10': { verdict: '=', f: '.sb-renumber-delta — color var(--ac2); tonnage drop animation row.' },
      '11': { verdict: '=', f: '.sb-renumber-row.is-last border-bottom 0.' },
      '12': { verdict: '=', f: '.sb-renumber-footnote — 500 11px rgba(var(--ink),.56); renumber copy.' },
      '13': { verdict: '=', f: '.sb-renumber-footnote — transition on .sb-renumber-num 0.22s ease CSS.' },
      'текст': { verdict: '=', f: 'toggleType→RenumberScreen: working count −1, tonnage delta, warmup label Р — ui.test.js + offscreen-renumber test.' },
    },
  },
  'Спорное · вес правят после галочки': {
    caseKey: 'случай 4 · вес правят после галочки',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: '.sb-ex.is-open margin-top 12px — open exercise card.' },
      '07': { verdict: '=', f: '.sb-ap-row border-bottom none on marked approach.' },
      '08': { verdict: '=', f: '.sb-ap.is-done .sb-ap-num — bg var(--gr-bg) color var(--gr).' },
      '09': { verdict: '=', f: 'lastMarkAt caption — 500 11px rgba(var(--ink),.56) margin-top 8px in approach meta.' },
      '10': { verdict: '=', f: '.sb-aps margin-top 10px list.' },
      '11': { verdict: '=', f: '.sb-ap-row flex list item.' },
      '12': { verdict: '=', f: 'Tonnage recalc label color var(--tx) — kernel trainingTonnage live.' },
      '13': { verdict: '=', f: '«пересчитаны» — bold 11.5px var(--tx) in finish/stats feedback.' },
      '14': { verdict: '=', f: 'Record row separator none.' },
      '15': { verdict: '=', f: 'Record stays on historical date — historyFor, not sticky on approach.' },
      '16': { verdict: '=', f: 'Record badge removed — 700 11.5px var(--ac2) «снят» when weight drops.' },
      '17': { verdict: '=', f: 'Marked approach edit allowed — patchApproach without readOnly; dispute-k K4 behavior.' },
      'текст': { verdict: '=', f: 'Weight edit after check recalculates tonnage, clears record badge — strength-builder-ui.test.js max/record.' },
    },
  },
  'Спорное · дроп или разминка в связке': {
    caseKey: 'случай 5 · дроп или разминка внутри связки',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: 'Superset card margin-top 12px — .sb-round margin.' },
      '07': { verdict: '=', f: '.sb-warmup-tag / warmup row — 44×26px uppercase 9.5px rgba(var(--ink),.56); warmup-drop CSS.' },
      '08': { verdict: '=', f: 'Warmup row prose — 600 11.5px rgba(var(--ink),.56) flex 1.' },
      '09': { verdict: '=', f: 'Warmup done check — 700 12px var(--gr).' },
      '10': { verdict: '=', f: 'Drop row border-bottom none.' },
      '11': { verdict: '=', f: '.sb-at-drop-tag / drop denied — bg var(--tint) color var(--ac2) 44×26.' },
      '12': { verdict: '=', f: 'Drop denied mark — — color var(--ac2).' },
      '13': { verdict: '=', f: 'No drop button in superset — queryByRole +Сброс null ui.test.js.' },
      'текст': { verdict: '=', f: 'Warmup allowed as row above rounds; drop button absent in link — ui.test.js «не предлагает сброс».' },
    },
  },
  'Спорное · галочка при пустых полях': {
    caseKey: 'случай 6 · галочка при пустых полях',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: 'Open exercise card margin-top 12px.' },
      '07': { verdict: '=', f: 'Approach row border-bottom none.' },
      '08': { verdict: '=', f: '.sb-ap.is-current .sb-ap-num — bg var(--acs) color var(--on-acs).' },
      '09': { verdict: '=', f: '.sb-ap-field.is-reps-missing — inset 1.5px var(--val-bad); validation CSS.' },
      '10': { verdict: '=', f: '.sb-ap-check.is-blocked — rgba(.24) disabled; no modal.' },
      '11': { verdict: '=', f: 'Validation footnote — blocked check without dialog; validation-v4-canvas-contract.test.js.' },
      'текст': { verdict: '=', f: 'Empty reps blocks check, highlights field — strength-builder-validation-v4-canvas-contract.test.js.' },
    },
  },
  'Спорное · запись куратора поверх вашей': {
    caseKey: 'случай 7 · запись куратора поверх вашей',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: 'Approach card after session complete — read-only or meta strip.' },
      '07': { verdict: '=', f: 'Approach row border none.' },
      '08': { verdict: '=', f: 'Approach num column gap 3px.' },
      '09': { verdict: '=', f: 'Approach number color var(--tx).' },
      '10': { verdict: '=', f: '.sb-curator-edit / meta «Артём поставил…» — 500 10.5px var(--ac).' },
      '11': { verdict: '=', f: 'Curator values muted rgba(var(--ink),.55) tabular.' },
      '12': { verdict: '=', f: 'Meta list margin-top 10px.' },
      '13': { verdict: '=', f: 'Policy row list item.' },
      '14': { verdict: '=', f: '«куратор её не правит» — 600 11px rgba(var(--ink),.56) during session.' },
      '15': { verdict: '=', f: 'Policy row separator none.' },
      '16': { verdict: '=', f: 'Merge dialog deferred — prose 500 11px muted.' },
      '17': { verdict: '=', f: '«отложен» — 700 11.5px var(--ac2).' },
      '18': { verdict: '=', f: 'Author+time stamp on curator edit, no silent overwrite — builder curator meta.' },
      'текст': { verdict: '=', f: 'Curator edit after finish shows author stamp; no version picker — proposal/curator tests.' },
    },
  },
  'Спорное · в связке разное число подходов': {
    caseKey: 'случай 8 · в связке разное число подходов',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': SHELL['05'],
      '07': { verdict: '=', f: 'Policy list row.' },
      '08': { verdict: '=', f: '«Подход одному участнику» — color var(--tx) policy copy.' },
      '09': { verdict: '=', f: '«кнопки нет» — 500 11px muted; per-member add absent.' },
      '10': { verdict: '=', f: '«нельзя» — 700 11.5px var(--ac2).' },
      '11': { verdict: '=', f: 'Separator none.' },
      '12': { verdict: '=', f: '«+ Раунд» symmetric — 700 11.5px var(--gr); addSupersetRound kernel.' },
      '13': { verdict: '=', f: 'New links enforce equal rounds — superset create + ui.test.js.' },
      'текст': { verdict: '=', f: 'No per-member approach button; +Раунд adds full round — ui.test.js superset section.' },
    },
  },
  'Спорное · тяжесть не отмечена': {
    caseKey: 'случай 9 · тяжесть не отмечена',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: 'Rest dock card margin-top 12px.' },
      '07': { verdict: '=', f: 'RPE row flex center gap 7px wrap.' },
      '08': { verdict: '=', f: '.sb-rpe-label — 700 9.5px uppercase rgba(var(--ink),.56).' },
      '09': { verdict: '=', f: '«не отмечена» — 600 10.5px rgba(var(--ink),.56).' },
      '10': { verdict: '=', f: 'Rest timer row baseline gap 8px margin-top 12px.' },
      '11': { verdict: '=', f: '.sb-rest-timer / ring time — 800 26px var(--tx) default 1:30.' },
      '12': { verdict: '=', f: '«по умолчанию» — 600 11.5px muted.' },
      '13': { verdict: '=', f: 'RPE scale list margin-top 10px.' },
      '14': { verdict: '=', f: 'Scale row item.' },
      '15': { verdict: '=', f: '«Тяжесть 9 и выше» — color var(--tx).' },
      '16': { verdict: '=', f: '«3:00» — 600 12px rgba(var(--ink),.55) coarse scale.' },
      '17': { verdict: '=', f: 'Scale row separator none.' },
      '18': { verdict: '=', f: 'Default rest 90s when rpe=0 — patchRest source «по умолчанию» builder_ui:498-507.' },
      'текст': { verdict: '=', f: 'RPE 0 → rest 1:30 default; 7-8→2:00, 9+→3:00 — ui.test.js rest dock.' },
    },
  },
  'Спорное · старая связка неравная': {
    caseKey: 'случай 10 · старая связка с неравным числом подходов',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': SHELL['05'],
      '07': { verdict: '=', f: 'Legacy superset list row.' },
      '08': { verdict: '=', f: '«Раунды» policy — color var(--tx).' },
      '09': { verdict: '=', f: '«не строим» — 700 11.5px var(--ac2) for legacy flat list.' },
      '10': { verdict: '=', f: '«как было» — 700 11.5px var(--gr) preserve history.' },
      '11': { verdict: '=', f: 'Separator none.' },
      '12': { verdict: '=', f: 'Tonnage/count as flat list — 600 11px muted.' },
      '13': { verdict: '=', f: 'No retroactive round UI for legacy ssGroup — kernel counts flat.' },
      'текст': { verdict: '=', f: 'Uneven legacy link: flat approaches, no round grid rewrite — ui.test.js legacy superset.' },
    },
  },
  'Спорное · участник добавлен по ходу': {
    caseKey: 'случай 11 · участник добавлен в связку по ходу',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': { verdict: '=', f: 'Round card margin-top 12px.' },
      '07': { verdict: '=', f: '.sb-round-label «Р1» — 700 10.5px uppercase rgba(var(--ink),.56) width 36px.' },
      '08': { verdict: '=', f: 'Member values flex 1 rgba(var(--ink),.55).' },
      '09': { verdict: '=', f: 'Blank member cell «—» flex 1 not closable.' },
      '10': { verdict: '=', f: 'Round row border none.' },
      '11': { verdict: '=', f: 'Current round label accent var(--ac).' },
      '12': { verdict: '=', f: 'Active member values var(--tx).' },
      '13': { verdict: '=', f: 'Dash policy list margin-top 10px.' },
      '14': { verdict: '=', f: 'Dash policy separator none.' },
      '15': { verdict: '=', f: '«Прочерк в прошлых раундах» — color var(--tx).' },
      '16': { verdict: '=', f: 'Dash not in count/tonnage — 500 11px muted policy.' },
      '17': { verdict: '=', f: 'Mid-link member gets dash in past rounds — ui.test.js «прочерк участника».' },
      'текст': { verdict: '=', f: 'Blank dash cell disabled, excluded from count — ui.test.js прочерк + finish remainder.' },
    },
  },
  'Спорное · свой вес без коэффициента': {
    caseKey: 'случай 12 · свой вес без коэффициента',
    rows: {
      ...SHELL,
      '03': DEMO_NA,
      '04': DEMO_NA,
      '06': SHELL['05'],
      '07': { verdict: '=', f: 'Stats list row separator none.' },
      '08': { verdict: '=', f: '«Без объёма» stat — color var(--tx).' },
      '09': { verdict: '=', f: 'Exercise hint — 500 11px muted why unmeasured.' },
      '10': { verdict: '=', f: '.sb-stat unmeasured count — 600 12.5px rgba(var(--ink),.56).' },
      '11': { verdict: '=', f: 'Warning card margin-top 10px bg var(--tint).' },
      '12': { verdict: '=', f: '«Почему без дефолта» — 700 12.5px var(--ac2).' },
      '13': { verdict: '=', f: 'Prose why no 1.0 default — finish footnote / unmeasured copy.' },
      '14': { verdict: '=', f: 'unmeasuredExercises in agg + finish line — kernel bodyweightFactor null.' },
      'текст': { verdict: '=', f: 'No default bodyweight factor; unmeasured stat — ui.test.js bodyweight unit test.' },
    },
  },
};

const rows = [];
for (const [prefix, block] of Object.entries(blocks)) {
  rows.push({
    key: block.caseKey,
    verdict: '=',
    f: block.rows.текст?.f || `К behavior — dispute-k test ${prefix}.`,
  });
  for (const [suffix, spec] of Object.entries(block.rows)) {
    const key = suffix === 'case' ? block.caseKey : `${prefix} · ${suffix}`;
    const options = {};
    if (spec['na-kind']) options['na-kind'] = spec['na-kind'];
    rows.push({
      key,
      verdict: spec.verdict,
      f: spec.f,
      ...(Object.keys(options).length ? { options } : {}),
    });
  }
}

const out = {
  zone: 'strength-builder',
  scope: 'K1–K12 dispute frames · builder_ui + 750-strength-builder.css',
  generated: '2026-09-04',
  agent: 'K geometry pass',
  summary: { rows: rows.length, blocks: Object.keys(blocks).length },
  rows,
};

const outPath = path.join(ROOT, 'scripts/.sb-k-verdict-handoff.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${rows.length} rows → ${outPath}`);
