#!/usr/bin/env node
/** Package 47 · polosa 5 — norm-correction (19), messenger (17+13), tab-activity (16). */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const MESSENGER_CANVAS =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/messenger.v4.dc.html';
const TAB_CANVAS =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tab-activity.v4.dc.html';
const FINDINGS47 =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/ОТВЕТ-22-вопроса.md';

/** @type {Record<string, { verdict: string, fact: string, options?: Record<string, string> }>} */
const NORM_CORRECTION = {
  'вид · блоки примера и порогов': {
    verdict: '—',
    fact: 'служебные блоки канваса, не экраны продукта — так говорит сама строка',
    options: { 'na-kind': 'handoff' },
  },
  'вид · карточка куратора': {
    verdict: '=',
    fact:
      'heys_norm_correction_v1.js buildCuratorCard — .cd/.grp radius 20 padding 16, mismatch hero 20px/800 --v4-hero, recommendation 30px/800, pills 9px mono on --v4-c2',
  },
  рекомпозиция: {
    verdict: '=',
    fact:
      'buildWeeklySyncCard recomposition + source pill «по замеру от …»; heys_norm_correction_v1.js gather/show only when waist trend proves change',
  },
  'вид · карточки сверки': {
    verdict: '=',
    fact:
      'weekly-wrap-correction hero .grp --v4-c1 radius 20; matched on --v4-ok-tint; facts .cd rows 12.5px/600 — heys_norm_correction_v1.js',
  },
  'вид · косвенный довод': {
    verdict: '=',
    fact:
      'кадр «Перестройка · по косвенным» — .grp --v4-c1 (не --gr-bg); indirect evidence copy + enable-measurements CTA — heys_norm_correction_v1.js',
  },
  'вид · строка поправки': {
    verdict: '=',
    fact:
      '.weekly-wrap-correction__row 12.5px/600 --v4-ink, date pill 9px mono --v4-c2 --v4-act-text, progress 6px --v4-acs — 600-norm-correction.css',
  },
  'шкала кеглей': {
    verdict: '=',
    fact:
      'hero 30px/800, secondary 22px/800, row keys 12.5px/600–700, notes 11px/1.55 --v4-ink-3 — norm-correction curator card + weekly sync',
  },
  кнопки: {
    verdict: '=',
    fact:
      '.weekly-wrap-correction__btn / curator actions — pill 48 radius 999 primary --v4-acs --v4-on-acs, secondary --v4-c2; no destructive row',
  },
  'пилюля зрелости и опоры': {
    verdict: '=',
    fact:
      'maturity/support pills 9px mono .06em uppercase padding 4/7 radius 999 --v4-c2; count 11px --v4-ink-3 after word — buildCuratorCard',
  },
  'карточка · шапка кураторского экрана': {
    verdict: '=',
    fact:
      'title 15px/700 --v4-ink, window chip 10.5px/600 --v4-ink-3 mono — curator card header copy in heys_norm_correction_v1.js',
  },
  'карточка · формула против факта': {
    verdict: '=',
    fact:
      '.cur-sheet formula vs fact rows 12.5px/700; formula ink 55%, fact --v4-act-text; hero 30px/800 --v4-ink — buildCuratorCard',
  },
  'карточка · где сидит расхождение': {
    verdict: '=',
    fact:
      'whereMismatchSits .grp title 12.5px/700 prose 12px/1.55 --v4-ink-2 — curator-only, heys_norm_correction_v1.js',
  },
  'карточка · предложение нормы': {
    verdict: '=',
    fact:
      'proposal hero 30px/800 --v4-ink, delta 12px/600 --v4-val-bad, formula footnote --v4-act-text — NormCorrectionCard',
  },
  'карточка · график рекомпозиции': {
    verdict: '=',
    fact:
      'recomposition chart 262×76: weight --v4-ink-30 flat, waist --v4-acs down, stroke 2 — weekly-wrap-correction chart block',
  },
  'карточка · запрос замера': {
    verdict: '—',
    fact: 'кадр кураторского запроса замера — foreign-zone, клиентский flow в зоне «Замер»',
    options: { 'na-kind': 'foreign-zone' },
  },
  'карточка · холодный старт в попапе': {
    verdict: '=',
    fact:
      'cold-start row «пока нет» 11px/600 --v4-ink-4 + pill «копим данные» --v4-ink-2 stays visible — heys_norm_correction_v1.js',
  },
  'карточка · режим чтения на Pro': {
    verdict: '=',
    fact:
      'Pro read-only: hero current norm 30px/800 «без изменений», proposal demoted, CTA «Написать куратору» 48 --v4-c2 — weekly sync',
  },
  'карточка · история поправки': {
    verdict: '=',
    fact:
      '.cd history rows date 12px/600 --v4-ink, multiplier 12.5px/700 --v4-act-text, author 11px/600 --v4-ink-2 + sparkline — history model',
  },
  'числа называют свою природу': {
    verdict: '=',
    fact:
      'footnote 10px/1.3 --v4-ink-3 under each metric («расход по формуле», «расход по факту», «дефицит 12 %») — buildCuratorCard labels',
  },
};

/** @type {Record<string, { verdict: string, fact: string, options?: Record<string, string> }>} */
const TAB_ACTIVITY = {
  'ярус не исчезает пустым': {
    verdict: '=',
    fact:
      'heys_day_activity_v1.js todayRow always renders; empty → «не отмечено» .activity-v4-today__value--muted color var(--v4-ink-4) — 731-ui-v4-activity.css:361-409; activity-numbers-net-and-plan.test.js',
  },
  'оценённые шаги помечены': {
    verdict: '≠',
    fact:
      'блок 4: пилюля/приглушение/заливка на месте; контракт просит 50 % и 16 %, в замороженном наборе ближайшие — --v4-ink-2 (55 %) и --v4-plan (22 %)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${TAB_CANVAS}:570` },
  },
  'вид · ярус История': {
    verdict: '≠',
    fact:
      'блок 11: ярус .cd сведён; разделитель --v4-line 8 % (ступень набора), проза «вид · ярус» ещё называет 7 %; ссылка «28 дней ›» на --v4-ink-data (кадр ·34), проза — 42 %',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${TAB_CANVAS}:582` },
  },
  'вид · календарь зарядки': {
    verdict: '≠',
    fact:
      'Решение 31.08 сведено: «Сегодня» — transparent + inset 1.5px --v4-acs; легенда/чипы — .ma-habit-cal--activity-v4. Остаток: календарь вторым слоем .activity-v4-history__cal; легенда 55 % (--v4-ink-2) вместо 50 % прозы кадра',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${TAB_CANVAS}:589` },
  },
  'вид · карточка силовой': {
    verdict: '=',
    fact:
      'идущая тренировка — канон (решение 31.08); журнал подходов в ярусе «История» — activity-plan-card-frame.test.js + heys_day_activity_v1.js',
  },
  'вид · пустоты рабочих весов': {
    verdict: '=',
    fact:
      'buildWorkingWeightsRow — «данных 9 дней из 14» / «пропуски» 11px/1.3 --v4-ink-3, not scored as bad result — 731-ui-v4-activity.css',
  },
  'вид · hero цели дня': {
    verdict: '=',
    fact:
      '.activity-v4-hero .grp --v4-c2 radius 20 padding 16; label 10.5px/600 --v4-ink-3, number 30px/800, reason 11px/1.4 --v4-ink-3 (45 %) — 731-ui-v4-activity.css:96-123',
  },
  'вид · разбор цели': {
    verdict: '≠',
    fact:
      'блок 1/11: список .cd сведён; разделитель 8 % (--v4-line) вместо 7 % прозы; подписи note на --v4-ink-data по кадру ·19, проза ещё называет 42 %',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${TAB_CANVAS}:596` },
  },
  'вид · шаги': {
    verdict: '=',
    fact:
      '.activity-v4-steps__row first with pill «оценка» +5px; workout progress bar read-only (no thumb) — 731-ui-v4-activity.css + heys_day_activity_v1.js',
  },
  'вид · оценённые шаги': {
    verdict: '≠',
    fact:
      'блок 4/11: пилюля, приглушённые число/цель и сноска на месте; тона пилюли и заливки — ступени набора 55 % и --v4-plan вместо 50 %/16 % кадра',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${TAB_CANVAS}:598` },
  },
  'вид · программа куратора': {
    verdict: '≠',
    fact:
      'карточки плана и правки сведены; проза/кнопки на месте; тона 58/60/10 % кадра заменены ближайшими ступенями набора (--v4-ink-2, --v4-track)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${TAB_CANVAS}:599` },
  },
  'вид · строки яруса «Сегодня»': {
    verdict: '=',
    fact:
      '.activity-v4-today__row name 12.5px/600 --v4-ink, sub 11px/1.3 --v4-ink-3, value mono 12.5px/600–700; «не отмечено» 11px/600 --v4-ink-4 — 731-ui-v4-activity.css:328-409',
  },
  'вид · пустые состояния': {
    verdict: '≠',
    fact:
      'блок 10: «История» .grp title+prose без кнопок; строки «Сегодня» остаются с «не отмечено»; проза на --v4-ink-2 (55 %) вместо 60 % кадра — ступени 60 % в наборе нет',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${TAB_CANVAS}:601` },
  },
  'вид · идущая тренировка': {
    verdict: '=',
    fact:
      'today row composition --v4-act-text + in-session .grp CTA «Продолжить тренировку» 48 --v4-acs, footnote 11px/1.4 --v4-ink-3 — heys_day_activity_v1.js',
  },
  'вид · предупреждение нагрузки': {
    verdict: '=',
    fact:
      '.activity-v4-load-warning .grp --v4-tint title 13px/1.32 --v4-act2-text, reason 11px/1.4 --v4-ink-2, prose 12px/1.5 — 731-ui-v4-activity.css',
  },
  'вид · слои нагрузки': {
    verdict: '=',
    fact:
      '«Как меняется» .cd four rows name 12.5px/600 --v4-ink, window 11px/1.3 --v4-ink-3, bars --v4-ovl/--v4-wat, caption 12px/700 --v4-ink — activity load layers block',
  },
};

const VOICE_RECORDING_FACT =
  'канон — блок над полем .messenger-recording-live (1000-messenger.css:1146-1200); кадр переснят под продукт — ОТВЕТ-22 #13, код без изменений';

/** @type {Record<string, { verdict: string, fact: string, options?: Record<string, string> }>} */
const MESSENGER = {
  'состояние своего сообщения — одна строка': {
    verdict: '=',
    fact:
      'ownStatus line 10.5px/600 --v4-ink-2 only under latest own bubble — heys_messenger_v1.js MessageBubble + 1000-messenger.css:612-617',
  },
  '«Ждём» — вторая строка шапки': {
    verdict: '=',
    fact:
      'DayChecklistRow chips 44px templates on missing — heys_messenger_v1.js:2387+; 1000-messenger.css:308-340',
  },
  'подсказка «время и граммы» — рабочая': {
    verdict: '=',
    fact:
      'FoodHintCard --v4-tint clock 16px --v4-act-text, pills 44px, hide 11.5px/600 --v4-ink-2 — heys_messenger_v1.js:2387-2508',
  },
  'карточка «Внесено в дневник» — системная': {
    verdict: '=',
    fact:
      'AppliedDayCard msg-applied-card --v4-c1 inset border 6% radius 18 — heys_messenger_v1.js:2120-2134',
  },
  'карточка намерения — есть, вкладок нет': {
    verdict: '=',
    fact:
      'IntentCard inside bubble kicker 9.5px --v4-act-text, value 20px/800 — heys_messenger_v1.js; intent tabs removed',
  },
  'первое сообщение': {
    verdict: '=',
    fact:
      'EmptyThread badge 56px --v4-c2, three pills 44px templates — heys_messenger_v1.js EMPTY_THREAD_PROMPTS',
  },
  'поиск — режим, а не оверлей': {
    verdict: '=',
    fact:
      'SearchPanel replaces thread; field 44px; filter chips 44px (.messenger-search__filter min-height 44) — 1000-messenger.css:2995-3027; debounce 300ms',
  },
  'вид · шапка': {
    verdict: '=',
    fact:
      '1000-messenger.css:148-376 padding 14/12/10/18, avatar 38px, header-button 44×44, subtitle dot 7px --v4-ok-text/--v4-bad-text',
  },
  'вид · строка «Ждём»': {
    verdict: '=',
    fact:
      '1000-messenger.css:308-340 row padding 8/18/10, label 9.5px/700 .14em --v4-ink-2, chip min-height 44 padding 0 11 gap 7',
  },
  'вид · тред': {
    verdict: '=',
    fact:
      '1000-messenger.css:409-432 thread padding 6/14/0 gap 8 bg --v4-hero; meta/time --v4-ink-2 (56%) — messenger-thread-padding.test.js',
  },
  'вид · композер': {
    verdict: '=',
    fact:
      '.messenger-composer padding 8/12/14 border-top 6% --v4-bg; attach/voice 44×44; input min-height 44 radius 22 --v4-c1; live recording above field .messenger-recording-live — 1000-messenger.css:1146-1200,1854-2007; канон блок над полем ОТВЕТ-22 #13',
  },
  'вид · меню «Ещё»': {
    verdict: '=',
    fact: '1000-messenger.css:231-272 menu 232px radius 18 items 44px label 13px hint 11px --v4-ink-2',
  },
  'вид · лист действий': {
    verdict: '=',
    fact:
      '1000-messenger.css:2926-2983 action sheet radius 26 scrim --scrim blur 2.5px items 48px',
  },
  'вид · удаление': {
    verdict: '=',
    fact:
      '1000-messenger.css:1243-1345 confirm dialog column actions; messenger-deletion-confirm.test.js',
  },
  'вид · поиск': {
    verdict: '=',
    fact:
      '1000-messenger.css:2949-3070 field 44px radius 22; .messenger-search__filter min-height 44 padding 0 11 (пакет 47, ОТВЕТ-22 #3); results + empty state --v4-ink-2',
  },
  'вид · согласие': {
    verdict: '=',
    fact:
      '1000-messenger.css:1246-1268 consent dialog radius 26 padding 22/18/18 scrim blur 2.5px',
  },
  голосовое: {
    verdict: '=',
    fact: 'tap mic toggle; AudioAttachment + .messenger-recording-live above composer — messenger-audio-contract.test.js',
  },
  'тач-цели': {
    verdict: '=',
    fact:
      'ui-v4-check-touch-target-visible 0 violations on 1000-messenger.css; search filter chips 44px visible (1000-messenger.css:3007-3011); header/chip/pill 44px; dot 7px + avatar 38px — не цели (ОТВЕТ-22 #3)',
  },
};

for (let i = 24; i <= 34; i += 1) {
  const suffix = String(i).padStart(2, '0');
  MESSENGER[`Мессенджер · запись голосового · ${suffix}`] = {
    verdict: '=',
    fact: VOICE_RECORDING_FACT,
  };
}

function applyZone(zoneId, rows) {
  const zone = readZone(zoneId);
  const handoffKeys = new Set(Object.keys(rows));
  const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);
  let applied = 0;
  for (const [key, spec] of Object.entries(rows)) {
    const result = setVerdictKey(zoneId, key, {
      verdict: spec.verdict,
      fact: spec.fact,
      options: spec.options || {},
    });
    if (!result.skipped) applied += 1;
  }
  const live = readZone(zoneId);
  assertForeignRowsUnchanged(foreignBefore, live.rows);
  const counts = { '=': 0, '?': 0, '≠': 0, '—': 0 };
  for (const row of Object.values(live.rows)) counts[row.v] = (counts[row.v] || 0) + 1;
  console.log(`\n${zoneId}: applied ${applied}`, counts);
  return { applied, counts };
}

const nc = applyZone('norm-correction', NORM_CORRECTION);
const ms = applyZone('messenger', MESSENGER);
const ta = applyZone('tab-activity', TAB_ACTIVITY);

console.log('\nFINDINGS47 ref:', FINDINGS47);
console.log('totals', { nc, ms, ta });
