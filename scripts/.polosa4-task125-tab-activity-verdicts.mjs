#!/usr/bin/env node
/** tab-activity task 125: типизация 42 legacy «≠» (finding 07 не трогаем). */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'tab-activity';
const CANVAS =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tab-activity.v4.dc.html';

const FINDING07_KEYS = new Set([
  'Актив · день собран · 13',
  'Актив · день собран · 14',
  'Актив · день собран · 15',
  'Актив · день собран · 16',
  'Актив · день собран · 17',
  'Актив · план назначен · 13',
  'Актив · правка куратора · 11',
]);

/** @type {Record<string, { verdict: string, fact: string, options?: Record<string, string> }>} */
const ROWS = {
  'оценённые шаги помечены': {
    verdict: '≠',
    fact:
      'блок 4: пилюля/приглушение/заливка на месте; контракт просит 50 % и 16 %, в замороженном наборе ближайшие — --v4-ink-2 (55 %) и --v4-plan (22 %)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:570` },
  },
  'вид · ярус История': {
    verdict: '≠',
    fact:
      'блок 11: ярус .cd сведён; разделитель --v4-line 8 % (ступень набора), проза «вид · ярус» ещё называет 7 %; ссылка «28 дней ›» на --v4-ink-data (кадр ·34), проза — 42 %',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:582` },
  },
  'легенда календаря': {
    verdict: '≠',
    fact:
      'блок 5: четыре подписанные пары на месте; «не вели» — --v4-ink-30 по решению 31.08 (строка «вид · календарь»), а не 10 % из этой строки',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'вид · календарь зарядки': {
    verdict: '≠',
    fact:
      'Решение 31.08 сведено: «Сегодня» — transparent + inset 1.5px, «не вели» — --v4-ink-30; сетка/чипы/листание — .ma-habit-cal--activity-v4. Остаток: календарь вторым слоем .activity-v4-history__cal; легенда 55 % (--v4-ink-2) вместо 50 % прозы кадра',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'вид · карточка силовой': {
    verdict: '≠',
    fact:
      'Идущая тренировка — канон (решение 31.08); кадр журнала с чипами зон и списком упражнений не реализован в продуктовой карточке',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'вид · hero цели дня': {
    verdict: '≠',
    fact:
      'блок 11: геометрия hero сведена; проза просит 42 %/50 % у яруса и причины — в наборе ближайшие 45 % (--v4-ink-3) и 55 % (--v4-ink-2), footer кадра ·11 переведён на --v4-ink-data (56 %)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:595` },
  },
  'вид · разбор цели': {
    verdict: '≠',
    fact:
      'блок 1/11: список .cd сведён; разделитель 8 % (--v4-line) вместо 7 % прозы; подписи note на --v4-ink-data по кадру ·19, проза ещё называет 42 %',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:596` },
  },
  'вид · оценённые шаги': {
    verdict: '≠',
    fact:
      'блок 4/11: пилюля, приглушённые число/цель и сноска на месте; тона пилюли и заливки — ступени набора 55 % и --v4-plan вместо 50 %/16 % кадра',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:598` },
  },
  'вид · программа куратора': {
    verdict: '≠',
    fact:
      'карточки плана и правки сведены; проза/кнопки на месте; тона 58/60/10 % кадра заменены ближайшими ступенями набора (--v4-ink-2, --v4-track)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:599` },
  },
  'вид · пустые состояния': {
    verdict: '≠',
    fact:
      'блок 10: заголовок и проза без кнопок, строки «Сегодня» на месте; проза на --v4-ink-2 (55 %) вместо 60 % кадра — ступени 60 % в наборе нет',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:601` },
  },
  'Актив · день собран · 06': {
    verdict: '≠',
    fact:
      '.activity-v4-hero__label — 10,5/600, трекинг .04em; проза «вид · hero» просит 42 %, продукт --v4-ink-3 (45 %) — ближайшая ступень, набор заморожен',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:595` },
  },
  'Актив · день собран · 09': {
    verdict: '≠',
    fact:
      '.activity-v4-hero__unit — 12,5/600 по строке контракта (кадр рисует 13; контракт старше), тон --v4-ink-3 (45 %)',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:631` },
  },
  'Актив · день собран · 11': {
    verdict: '=',
    fact:
      '.activity-v4-hero__footer — 500 11,5/1,4, color:var(--v4-ink-data) (731-ui-v4-activity.css:121-123); кадр ·11: rgba(var(--ink),.56)',
  },
  'Актив · день собран · 34': {
    verdict: '=',
    fact:
      '.activity-v4-history__link — 600 11/1, color:var(--v4-ink-data) (731-ui-v4-activity.css:494-498); кадр ·34: rgba(var(--ink),.56)',
  },
  'Актив · разбор цели · 06': {
    verdict: '≠',
    fact: '.activity-v4-hero__label — тон --v4-ink-3 (45 %) вместо 42 % прозы «вид · hero»; ступени 42 % в наборе нет',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:595` },
  },
  'Актив · разбор цели · 09': {
    verdict: '≠',
    fact: '.activity-v4-hero__unit — 12,5/600, тон --v4-ink-3 (45 %)',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:667` },
  },
  'Актив · разбор цели · 11': {
    verdict: '=',
    fact:
      '.activity-v4-hero__footer — color:var(--v4-ink-data) (731-ui-v4-activity.css:121-123); кадр ·11: rgba(var(--ink),.56)',
  },
  'Актив · разбор цели · 19': {
    verdict: '=',
    fact:
      '.activity-v4-breakdown__note — 500 10/1,3, color:var(--v4-ink-data) (731-ui-v4-activity.css:170-173); кадр ·19: rgba(var(--ink),.56)',
  },
  'Актив · новый человек · 06': {
    verdict: '≠',
    fact: '.activity-v4-hero__label — тон --v4-ink-3 (45 %) вместо 42 % прозы «вид · hero»',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:595` },
  },
  'Актив · новый человек · 09': {
    verdict: '≠',
    fact: '.activity-v4-hero__unit — 12,5/600, тон --v4-ink-3 (45 %)',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:692` },
  },
  'Актив · новый человек · 11': {
    verdict: '=',
    fact:
      '.activity-v4-hero__footer — buildHeroFooterLabel даёт текст причины; color:var(--v4-ink-data) (731-ui-v4-activity.css:121-123)',
  },
  'Актив · шаги оценены · 10': {
    verdict: '≠',
    fact:
      '.activity-v4-steps__pill — 9 px на --v4-surface; тон --v4-ink-2 (55 %) вместо 50 % кадра ·10 — ступени 50 % в наборе нет',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:724` },
  },
  'Актив · план назначен · 09': {
    verdict: '≠',
    fact:
      '.sb-plan-meta — проза и «В расход не идёт…» на месте, тон --v4-ink-2 (55 %); длительности «ориентировочно 50 минут» в данных плана нет — не выдумывается',
    options: { 'reason-code': 'logic-invariant', 'decision-ref': `${CANVAS}:749` },
  },
  'Актив · план назначен · 12': {
    verdict: '≠',
    fact:
      '.sb-plan-skip — flex 1, min-height 48, --v4-hero; тон --v4-ink-2 (55 %) вместо 58 % кадра ·12',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:752` },
  },
  'Актив · правка куратора · 07': {
    verdict: '≠',
    fact:
      '.sb-plan-meta в .sb-proposal-card — проза правки на месте, тон 55 %; строка «Сделанное не тронется» при закрытых подходах — heys_strength_proposal_ui_v1.js',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:767` },
  },
  'Актив · правка куратора · 10': {
    verdict: '≠',
    fact:
      '«Оставить прежнюю» — inset 1px --v4-track (12 %) вместо 10 % чернил кадра ·10: интерактивная обводка, --v4-line — разделитель',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:770` },
  },
  'Календарь зарядки · 02': {
    verdict: '≠',
    fact:
      'отдельного экрана нет: календарь открывается вторым слоем в ярусе «История» (.activity-v4-history__cal)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'Календарь зарядки · 08': {
    verdict: '≠',
    fact:
      'календарь встроен в список .cd (.activity-v4-history__cal), отдельной карточкой .grp не оборачивается',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'Календарь зарядки · 10': {
    verdict: '≠',
    fact:
      'точка «не вели» — --v4-ink-30 по решению 31.08; кадр ·10 ещё называет rgba(var(--ink),.1)',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'Календарь зарядки · 14': {
    verdict: '≠',
    fact:
      'точка «сегодня» neutral — обводка inset 1.5px (731-ui-v4-activity.css:689-691), не заливка 16 % кадра ·14',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'Календарь зарядки · 16': {
    verdict: '≠',
    fact:
      '.ma-habit-cal-legend-item — 500 10,5, gap 6; тон --v4-ink-2 (55 %) вместо 50 % кадра ·16',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:818` },
  },
  'Календарь зарядки · 17': {
    verdict: '≠',
    fact:
      'строка листания — .ma-habit-cal-period--month внутри вложенного календаря, не отдельный список .cd кадра ·17',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:589` },
  },
  'Тренировки · журнал подходов · 11': {
    verdict: '=',
    fact:
      '.activity-v4-today__value--chevron — display:flex; align-items:center; gap:8px (731-ui-v4-activity.css:325-328); кадр ·11: center, зазор 8px',
  },
  'Тренировки · журнал подходов · 18': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку (таймер, счёт, «Продолжить»)',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 19': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 20': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 21': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 22': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 23': {
    verdict: '≠',
    fact:
      'внутренний состав кадра — журнал с чипами зон; продукт показывает идущую тренировку',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Тренировки · журнал подходов · 24': {
    verdict: '≠',
    fact:
      '.sb-card-cta — min-height 48, r999, --v4-hero; текст зависит от состояния. Тон --v4-ink-2 (55 %) вместо 58 % кадра ·24; журнальный CTA кадра — «Открыть конструктор»',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
  'Актив · день собран · текст': {
    verdict: '≠',
    fact:
      'копия сведена; при плане на сегодня — карточка «план назначен» (решение 31.08), а не компактная строка кадра ·16–17',
    options: { 'reason-code': 'owner-decision', 'decision-ref': `${CANVAS}:558` },
  },
  'Тренировки · журнал подходов · текст': {
    verdict: '≠',
    fact:
      'продуктовая копия на месте; кадр описывает завершённый журнал, продукт — идущую сессию (канон 31.08)',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': `${CANVAS}:590` },
  },
};

const keys = Object.keys(ROWS);
// Снимок чужих строк до первой записи: список ключей здесь статический,
// а зона живая — промах переписал бы чужой вердикт молча.
const __owned = new Set(keys);
const __foreignBefore = snapshotForeignRowStrings(readZone(ZONE).rows, __owned);
let set = 0;
let skipped = 0;
let guarded = 0;

for (const key of keys) {
  if (FINDING07_KEYS.has(key)) {
    guarded += 1;
    continue;
  }
  const { verdict, fact, options = {} } = ROWS[key];
  const result = setVerdictKey(ZONE, key, { verdict, fact, options }, {
    skipIf: (live) => live.v === verdict && live.f === fact
      && (verdict !== '≠' || (live.reasonCode === options['reason-code'] && live.decisionRef === options['decision-ref'])),
  });
  if (result.skipped) skipped += 1;
  else set += 1;
}

const after = readZone(ZONE);
assertForeignRowsUnchanged(__foreignBefore, after.rows);
const counts = { '?': 0, '=': 0, '≠': 0, '—': 0 };
for (const row of Object.values(after.rows)) counts[row.v] = (counts[row.v] || 0) + 1;

console.log(JSON.stringify({
  zone: ZONE,
  set,
  skipped,
  guardedFinding07: guarded,
  keys: keys.length,
  counts,
}, null, 2));
