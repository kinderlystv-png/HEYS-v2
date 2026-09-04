import { patchZoneRow, readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const FACT = 'CycleScreen (.sb-root.program-cycle) — proposal_ui CycleScreen+buildProgramCycleSnapshot; mount ProgramNextLine→openPath day_trainings:3189+; CSS 750-strength-builder.css .sb-cycle-*; смоук strength-builder-cycle-v4-canvas-contract.test.js';

const lineFacts = {
  '01': '.sb-cycle-top + back .sb-icon-btn — шапка экрана',
  '02': '.sb-cycle-top-main flex column gap 3px',
  '03': '.sb-cycle-title — program.title · weeks',
  '04': '.sb-cycle-key — assignedBy · startDate',
  '05': '.sb-cycle-badge — неделя N',
  '06': '.sb-cycle-scroll — прокрутка',
  '07': '.sb-cycle-metrics gap 8px margin-top 12px',
  '08': '.sb-cycle-metric c1 radius 14 pad 10/11',
  '09': '.sb-cycle-metric-label uppercase 9.5px',
  '10': '.sb-cycle-metric-value 17/800 done/total',
  '11': '.sb-cycle-metric.is-accent tint inset acs',
  '12': '.sb-cycle-metric-value.is-accent — recordCount',
  '13': '.sb-cycle-tier «Фазы недель»',
  '14': '.sb-cycle-phase.is-active inset acs radius 16',
  '15': '.sb-cycle-phase-head gap 9px',
  '16': '.sb-cycle-phase-num.is-active 26×26 acs',
  '17': '.sb-cycle-phase-copy column gap 2px',
  '18': '.sb-cycle-phase-name 12.5/700',
  '19': '.sb-cycle-phase-detail 11/500 mut',
  '20': '.sb-cycle-phase-pct.is-done gr',
  '21': '.sb-cycle-phase-weeks gap 5 margin-top 9px',
  '22': '.sb-cycle-week-cell.is-done gr-bg ✓',
  '23': '.sb-cycle-week-cell.is-plan bg inset ·',
  '24': '.sb-cycle-phase radius 16 mb 8',
  '25': '.sb-cycle-phase-num plan 26×26',
  '26': '.sb-cycle-phase-pct «план»',
  '27': '.sb-cycle-week-list cd',
  '28': '.sb-cycle-week-row',
  '29': '.sb-cycle-week-label tx',
  '30': '.sb-cycle-week-status.is-done gr',
  '31': '.sb-cycle-week-row.is-last border none',
  '32': '.sb-cycle-week-status.is-today ac',
  '33': '.sb-cycle-footnote sm prose',
};

let n = 0;
for (const [num, fact] of Object.entries(lineFacts)) {
  const key = `Программа · цикл · ${num}`;
  if (!readZone('strength-builder')?.rows?.[key]) continue;
  setVerdictKey('strength-builder', key, {
    verdict: '=',
    fact: `${fact}; ${FACT}`,
    options: {},
  });
  patchZoneRow('strength-builder', key, (row) => {
    delete row.reasonCode;
    delete row.decisionRef;
  });
  n += 1;
}

const viewKey = 'вид · экран цикла';
if (readZone('strength-builder')?.rows?.[viewKey]) {
  setVerdictKey('strength-builder', viewKey, {
    verdict: '=',
    fact: 'Кадр Г1 stop: CycleScreen DOM+CSS сверен strength-builder-cycle-v4-canvas-contract.test.js; вход ProgramNextLine › программа.',
    options: {},
  });
  n += 1;
}

console.log('updated', n, 'verdict rows');
