#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyVerdictToRow } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs')).href
);
const { readZone, writeZone } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const zone = readZone('strength-builder');
const rows = zone.rows;

const equals = [
  ['Правка · клиент уже начал · 01', '.sb-proposal-started .sb-head — gap 10px, padding 16px 18px 0; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 02', '.sb-builder-screen .sb-icon-btn — 36×36, radius 999px, bg var(--c1), font 600 13px, color rgba(var(--ink),.56); 750:3278-3291.'],
  ['Правка · клиент уже начал · 03', '.sb-proposal-started .sb-head-title — flex 1 column gap 3px, padding-left 10px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 04', 'ProposalStartedScreen dayLabel в .sb-head-title b; heys_strength_builder_ui_v1.js.'],
  ['Правка · клиент уже начал · 05', '.sb-head-sub «по плану {who} · идёт mm:ss» при pendingProposal; builder_ui.'],
  ['Правка · клиент уже начал · 06', '.sb-proposal-started-badge — bg var(--gr-bg), color var(--gr), tabular-nums; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 07', '.sb-proposal-started-scroll — padding 12px 18px 18px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 08', '.sb-proposal-started-banner — margin-top 12px, bg var(--c2), gap 10px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 09', '.sb-proposal-started-banner-icon — 28×28, bg var(--acs), color var(--on-acs); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 10', '.sb-proposal-started-banner-main — column gap 2px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 11', '.sb-proposal-started-banner-main b — 700 12.5px/1.2 var(--ac); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 12', '.sb-proposal-started-banner-main span — 500 11px rgba(var(--ink),.56); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 13', '.sb-proposal-started-block — margin-top 10px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 14', '.sb-proposal-started-card.is-frozen — padding 11px 12px, radius 14px, bg var(--gr-bg); 750.'],
  ['Правка · клиент уже начал · 15', '.sb-proposal-started-card — flex center gap 9px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 16', '.sb-proposal-started-lock — 24×24, radius 8px, bg var(--bg), inset var(--gr-bg); 750.'],
  ['Правка · клиент уже начал · 17', '.sb-proposal-started-card-main b — 700 12.5px/1.2 var(--tx); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 18', '.sb-proposal-started-tag.is-done — 700 9.5px uppercase var(--gr); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 19', '.sb-proposal-started-tag — 700 9.5px uppercase var(--ac); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 24', '.sb-proposal-started-card.is-remove — bg var(--tint), inset 1.5px var(--acs); 750.'],
  ['Правка · клиент уже начал · 25', '.sb-proposal-started-num на is-remove — inset var(--acs), color var(--ac); 750.'],
  ['Правка · клиент уже начал · 28', '.sb-proposal-started-tag.is-remove — uppercase var(--ac2); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 30', '.sb-proposal-started-accept — margin-top 9px, min-height 48px; 750-strength-builder.css.'],
  ['Правка · клиент уже начал · 31', '.sb-proposal-started-footnote — 500 11px rgba(var(--ink),.56); 750-strength-builder.css.'],
  ['Правка · клиент уже начал · текст', 'ProposalStartedScreen + strip onReview → setView(proposal-started); builder_ui.'],
  ['Ввод · время под нагрузкой · 01', '.sb-builder-screen.is-exercise-open .sb-head — шапка открытого упражнения; 750:3466+.'],
  ['Ввод · время под нагрузкой · 02', '.sb-head-title — column gap 3px при openEx; builder_ui + 750.'],
  ['Ввод · время под нагрузкой · 03', 'openEx name + approachCountLabel в .sb-head-title b; builder_ui.'],
  ['Ввод · время под нагрузкой · 04', 'unitEntryLabel(time) → «единица — время» в .sb-head-sub; builder_ui.'],
  ['Ввод · время под нагрузкой · 05', '.sb-list — область прокрутки конструктора; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 06', '.is-time-entry .sb-ex.is-open .sb-aps margin-top 12px; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 07', '.is-time-entry .sb-ap grid-template-columns 44px 1fr 44px; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 11', '.is-time-entry .sb-ap border-bottom через row gap 6px; superset rows + 750 grid.'],
  ['Ввод · время под нагрузкой · 15', '.sb-time-summary margin-top 10px; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 16', '.sb-time-summary-row flex space-between; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 17', '.sb-time-summary-row b color var(--tx); 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · 18', '.sb-time-summary-val — 700 12.5px tabular-nums var(--tx); 750.'],
  ['Ввод · время под нагрузкой · 19', '.sb-time-summary-row:last-child border-bottom 0; 750.'],
  ['Ввод · время под нагрузкой · 20', '.sb-time-summary-copy span — 500 11px rgba(var(--ink),.56); 750.'],
  ['Ввод · время под нагрузкой · 21', '.sb-time-summary-dash — 700 11.5px; 750-strength-builder.css.'],
  ['Ввод · время под нагрузкой · текст', 'is-time-entry + sb-time-summary; strength-builder-proposal-started-v4-canvas-contract.test.js.'],
];

let applied = 0;
for (const [key, fact] of equals) {
  if (!rows[key]) {
    console.warn('skip missing:', key);
    continue;
  }
  if (rows[key].v === '=' && rows[key].f === fact) continue;
  applyVerdictToRow(rows[key], { verdict: '=', fact, options: {} }, ROOT);
  applied += 1;
}

writeZone('strength-builder', zone);
const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
for (const row of Object.values(rows)) counts[row.v] = (counts[row.v] || 0) + 1;
console.log(`B1/B2 applied ${applied}; totals: =${counts['=']} · ?=${counts['?']} · ≠=${counts['≠']} · —=${counts['—']} · всего ${Object.keys(rows).length}`);
