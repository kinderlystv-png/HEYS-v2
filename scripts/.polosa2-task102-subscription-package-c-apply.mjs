#!/usr/bin/env node
/**
 * Polosa 2 · task 102 — re-judge 5 Package C keys reverted to «?» (441d168d1).
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:82';

const PATCHES = [
  {
    key: 'Подписка · приветствие · 02',
    verdict: '≠',
    fact:
      'apps/web/heys_subscriptions_v1.js:1460-1469: WelcomeFirstLogin scrim rgba(0,0,0,.55) inline — нет backdrop-filter blur(var(--v4-modal-backdrop-blur, 2.5px))',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'Подписка · баннер сверху · 01',
    verdict: '≠',
    fact:
      'apps/web/heys_paywall_v1.js:486-489: .readonly-banner background var(--v4-hero) padding 12px 14px — не --tint 10/18 min-height 44',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'Подписка · контакт поддержки · 02',
    verdict: '≠',
    fact:
      'apps/web/heys_subscriptions_v1.js:1307-1311: ContactCuratorScreen inline padding — нет paywall-overlay scrim blur(var(--v4-modal-backdrop-blur, 2.5px))',
    options: { 'reason-code': 'canvas-conflict', 'decision-ref': DECISION_REF },
  },
  {
    key: 'Подписка · очередь · заявка подана · 02',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:51-56: .paywall-overlay background var(--v4-modal-backdrop-dim); blur var(--v4-modal-backdrop-blur, 2.5px)',
    options: {},
  },
  {
    key: 'Подписка · очередь · место освободилось · 02',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:51-56: .paywall-overlay background var(--v4-modal-backdrop-dim); blur var(--v4-modal-backdrop-blur, 2.5px)',
    options: {},
  },
  {
    key: 'Подписка · очередь · место освободилось · текст',
    verdict: '=',
    fact:
      'apps/web/heys_paywall_v1.js:1055-1077: copy chain «Место освободилось · Начать пробный период · на подтверждение» в TrialQueueSection',
    options: {},
  },
];

function main() {
  const zone = readZone('subscription');
  const keys = new Set(PATCHES.map((p) => p.key));
  const foreignBefore = snapshotForeignRowStrings(zone.rows, keys);

  for (const patch of PATCHES) {
    setVerdictKey('subscription', patch.key, {
      verdict: patch.verdict,
      fact: patch.fact,
      options: patch.options,
    });
  }

  const live = readZone('subscription');
  assertForeignRowsUnchanged(foreignBefore, live.rows);

  const open = PATCHES.filter((p) => live.rows[p.key]?.v === '?').map((p) => p.key);
  console.log(JSON.stringify({
    applied: PATCHES.length,
    open,
    rows: PATCHES.map((p) => ({ key: p.key, v: live.rows[p.key].v })),
  }, null, 2));
  if (open.length) process.exit(1);
}

main();
