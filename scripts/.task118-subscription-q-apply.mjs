import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const ZONE = 'subscription';
const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:82';

const SCRIM_FACT =
  'apps/web/styles/modules/735-ui-v4-subscription.css:3-8: .paywall-overlay background var(--scrim) blur(var(--v4-modal-backdrop-blur, 2.5px)); sand rgba(42,26,12,0.5) · blue rgba(16,24,38,0.45) (subscription-paywall-computed-v4.test.js)';

const UPDATES = [
  {
    key: 'вид · баннер сверху',
    verdict: '≠',
    fact:
      'apps/web/heys_paywall_v1.js:486-489,1103-1104: ReadOnlyBanner --v4-hero padding 12px 14px — не --tint 10/18 min-h 44; title «Пробный период закончился» + куратор — не «Доступ только для чтения»/поддержка; пилюли «Подписка» нет',
    reasonCode: 'canvas-conflict',
    decisionRef: DECISION_REF,
  },
  {
    key: 'вид · тост на действии',
    verdict: '≠',
    fact:
      'apps/web/heys_paywall_v1.js:486,1257: .readonly-toast #1f2937 r12 — не undo-bar --c1 r22; gateWrite «Добавление данных недоступно» — не «Запись недоступна — только чтение»; action «Подписка» не --ac pill',
    reasonCode: 'canvas-conflict',
    decisionRef: DECISION_REF,
  },
  {
    key: 'вид · контакт поддержки',
    verdict: '≠',
    fact:
      'apps/web/heys_subscriptions_v1.js:1307-1345: ContactCuratorScreen legacy inline emoji 56px + gradient CTA — не v4 modal lock-in-circle, contact rows 52px --c1, scrim var(--scrim)',
    reasonCode: 'canvas-conflict',
    decisionRef: DECISION_REF,
  },
  {
    key: 'вид · тарифы',
    verdict: '=',
    fact:
      `apps/web/heys_paywall_v1.js:191-255 + 735-ui-v4-subscription.css:20-185: title/subtitle, три .paywall-plan gap 10, .paywall-cta 48px, divider «или», TrialQueueSection; ${SCRIM_FACT}`,
  },
  {
    key: 'вид · карточка тарифа',
    verdict: '=',
    fact:
      'apps/web/styles/modules/735-ui-v4-subscription.css:77-145: .paywall-plan min-h 56px --v4-surface r18 p12/14 inset 1px; .selected inset 2px --v4-act; badge «ПОПУЛЯРНЫЙ» top -9px; heys_paywall_v1.js:71-92 plan copy+price+/ мес',
  },
  {
    key: 'вид · блок пробного периода',
    verdict: '=',
    fact:
      'apps/web/styles/modules/735-ui-v4-subscription.css:187-249: .paywall-trial --v4-hero (=--c2) r18 p14; --offer --v4-tint; dot 8px; .paywall-btnq 44px; heys_paywall_v1.js:370-462 states copy+CTA; cancel confirm 403-418',
  },
  {
    key: 'вид · проверьте заказ',
    verdict: '=',
    fact:
      `apps/web/heys_subscriptions_v1.js:975-1025 + 735-ui-v4-subscription.css:259-330: title, order card --v4-surface, consent 22px r7, CTA disabled 45%, cancel 44px; ${SCRIM_FACT}`,
  },
  {
    key: 'вид · оплата прошла',
    verdict: '=',
    fact:
      `apps/web/heys_paywall_v1.js:400-410 + heys_subscriptions_v1.js:921-927: success icon 56px --v4-ok-bg, card --v4-surface, CTA «Продолжить»; ${SCRIM_FACT}`,
  },
  {
    key: 'очередь · отмена заявки',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:403-418: in-modal confirm «Отменить заявку на пробный период?» + .btn «Отменить заявку» + .btnq «Оставить»; no system confirm() (subscription-cancel-queue-confirm.test.js)',
  },
  {
    key: 'Подписка · проверьте заказ · 07',
    verdict: '=',
    fact:
      'apps/web/styles/modules/735-ui-v4-subscription.css:282-286: .paywall-order-period font 500 11px/1 color var(--v4-ink-2); margin-top 4px; heys_subscriptions_v1.js:984 «за 30 дней»',
  },
  {
    key: 'Подписка · тарифы · места есть · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:191-211,71-92,454-461: reason=trial_ended → «Пробный период закончился» + subtitle + Self/Pro/Pro Спорт copy + «Оформить Pro · 7 990 ₽» + «или» + trial «Место свободно»/«Начать пробный период» — chain canvas data-v',
  },
  {
    key: 'Подписка · тарифы · мест нет · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:191-211,454: trial_ended title chain + «Мест нет · в очереди N» + «Встать в очередь» — canvas data-v мест нет',
  },
  {
    key: 'Подписка · тарифы · Pro Спорт · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:100-101,244-246: select proPlus → «Написать в поддержку» + footnote «Pro Спорт подключается после согласования — поддержка ответит и оформит.» — canvas Pro Спорт text chain',
  },
  {
    key: 'Подписка · проверьте заказ · текст',
    verdict: '=',
    fact:
      'apps/web/heys_subscriptions_v1.js:975-1025: «Проверьте заказ» › Pro › desc › 7 990 ₽ › за 30 дней › «Принимаю условия» + оферта/политика › «Оплатить …» › «Отмена» — canvas data-v',
  },
];

const ownedKeys = new Set(UPDATES.map((row) => row.key));
const zone = readZone(ZONE);
const foreignBefore = snapshotForeignRowStrings(zone.rows, ownedKeys);

for (const row of UPDATES) {
  const opts = {
    allowDowngrade: row.verdict === '=' && zone.rows[row.key]?.v === '≠',
  };
  const options = {};
  if (row.reasonCode) options['reason-code'] = row.reasonCode;
  if (row.decisionRef) options['decision-ref'] = row.decisionRef;

  const result = setVerdictKey(
    ZONE,
    row.key,
    { verdict: row.verdict, fact: row.fact, options },
    opts,
  );
  if (result.skipped) {
    console.error('skipped', row.key, result);
    process.exit(1);
  }
  console.log(`${row.verdict} ${row.key}`);
}

const after = readZone(ZONE);
assertForeignRowsUnchanged(foreignBefore, after.rows);

const open = Object.values(after.rows).filter((row) => row.v === '?').length;
console.log(`subscription «?» remaining: ${open}`);
if (open !== 0) process.exit(1);
