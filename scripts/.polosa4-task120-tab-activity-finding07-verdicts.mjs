#!/usr/bin/env node
/** tab-activity finding 07 (7 строк): единый путь .activity-v4-program / .activity-v4-program-line. */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ZONE = 'tab-activity';

const ROWS = {
  'Актив · день собран · 13': {
    verdict: '=',
    fact: '.activity-v4-program { display:flex; flex-direction:column; gap:8px; margin-top:12px } — apps/web/styles/modules/731-ui-v4-activity.css:876-880; polosa4-task114 computed: оба пути renderTrainingsBlock(program)|renderActivityProgramBlock',
  },
  'Актив · день собран · 14': {
    verdict: '=',
    fact: '.activity-v4-program-line { border:none } — 731-ui-v4-activity.css:885-892; строка списка без разделителя, класс activityProgramLineClass() heys_day_trainings_v1.js:3360-3361',
  },
  'Актив · день собран · 15': {
    verdict: '=',
    fact: '.activity-v4-program .program-next-key { display:flex; flex-direction:column; gap:3px } — 731-ui-v4-activity.css:905-910; computed gap 3px в polosa4-task114',
  },
  'Актив · день собран · 16': {
    verdict: '=',
    fact: '.activity-v4-program .program-next-text { font:600 12.5px/1; color:var(--v4-ink) } — 731-ui-v4-activity.css:913-916; sand/blue совпадают между путями в polosa4-task114',
  },
  'Актив · день собран · 17': {
    verdict: '=',
    fact: '.activity-v4-program .program-next-sub { font:500 11px/1.3; color:var(--v4-ink-3) } — 731-ui-v4-activity.css:924-927; dayLabel+« · по программе» heys_day_trainings_v1.js:3476-3477',
  },
  'Актив · план назначен · 13': {
    verdict: '=',
    fact: '.activity-v4-program .sb-plan-footnote { margin-top:12px; font:500 11px/1.55; color:rgba(var(--ink),.56) } — 731-ui-v4-activity.css:1319-1324; PLAN_MOVE_FOOTNOTE heys_strength_superset_ui_v1.js:2670,3070',
  },
  'Актив · правка куратора · 11': {
    verdict: '=',
    fact: '.activity-v4-program .sb-proposal-review-link { margin-top:10px; font:700 11.5px/1; color:var(--v4-act-text) } — 731-ui-v4-activity.css:1360-1370; второй слой «что изменилось ›» heys_strength_proposal_ui_v1.js:345-347',
  },
};

const keys = Object.keys(ROWS);
let set = 0;
let skipped = 0;

for (const key of keys) {
  const { verdict, fact } = ROWS[key];
  const result = setVerdictKey(ZONE, key, { verdict, fact, options: {} }, {
    skipIf: (live) => live.v === verdict && live.f === fact,
  });
  if (result.skipped) skipped += 1;
  else set += 1;
}

const after = readZone(ZONE);
const summary = keys.map((key) => ({
  key,
  v: after.rows[key]?.v,
  h: after.rows[key]?.h,
}));

console.log(JSON.stringify({ zone: ZONE, set, skipped, keys: summary }, null, 2));
