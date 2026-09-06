#!/usr/bin/env node
/**
 * Task 183 — close 6 subscription verdict rows reset after package 38/39 rehash.
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:103';

const PATCHES = [
  {
    key: 'вид · баннер сверху',
    verdict: '≠',
    fact:
      'apps/web/heys_paywall_v1.js:503-512 copy/pill OK; apps/web/styles/modules/735-ui-v4-subscription.css:445-455 .readonly-banner --v4-hero pad 12/14 r16 — нет --tint 10/18 min-h 44 и правил .readonly-banner--sticky/.readonly-banner-pill',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'вид · тост на действии',
    verdict: '≠',
    fact:
      'apps/web/heys_paywall_v1.js:583-617 copy/4s OK; 735-ui-v4-subscription.css:487-504 .readonly-toast #1f2937 r12 — не undo-bar (--v4-surface, r22, inset 1px, --v4-act-text action)',
    options: {
      'reason-code': 'canvas-conflict',
      'decision-ref':
        'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:104',
    },
  },
  {
    key: 'вид · контакт поддержки',
    verdict: '=',
    fact:
      'apps/web/heys_subscriptions_v1.js:1347-1378 ContactCuratorScreen + 735-ui-v4-subscription.css:678-768 sub-contact lock/title/copy/row 52px; StepModal .mc-backdrop var(--scrim) blur 2.5px',
    options: {},
  },
  {
    key: 'очередь · отмена заявки',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:420-435: in-modal confirm «Отменить заявку на пробный период?» + .btn/.btnq; no window.confirm (subscription-cancel-queue-confirm.test.js)',
    options: {},
  },
  {
    key: 'Подписка · очередь · заявка подана · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:258+438-455: «Оформить Pro · 7 990 ₽» + «Заявка подана · вы N-й в очереди» + «Сообщим…» + «Отменить заявку» — copy chain canvas',
    options: {},
  },
  {
    key: 'Подписка · очередь · место освободилось · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:258+393-416: «Оформить Pro · 7 990 ₽» + «Место освободилось» + таймер + «на подтверждение» + «Начать пробный период» — copy chain canvas',
    options: {},
  },
];

function main() {
  const ownedKeys = new Set(PATCHES.map((p) => p.key));

  for (const patch of PATCHES) {
    const zone = readZone('subscription');
    const foreignBefore = snapshotForeignRowStrings(zone.rows, ownedKeys);

    const result = setVerdictKey('subscription', patch.key, {
      verdict: patch.verdict,
      fact: patch.fact,
      options: patch.options,
    });
    if (result.skipped) {
      console.error('skipped', patch.key, result);
      process.exit(1);
    }

    const live = readZone('subscription');
    assertForeignRowsUnchanged(foreignBefore, live.rows);
    console.log(`${patch.verdict} ${patch.key}`);
  }

  const final = readZone('subscription');
  const open = PATCHES.filter((p) => final.rows[p.key]?.v === '?').map((p) => p.key);
  console.log(JSON.stringify({ applied: PATCHES.length, open }, null, 2));
  if (open.length) process.exit(1);
}

main();
