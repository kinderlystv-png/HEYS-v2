import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import {
  assertForeignRowsUnchanged,
  snapshotForeignRowStrings,
} from './lib/handoff-batch-apply.mjs';

const ZONE = 'subscription';
const HANDOFF_KEYS = new Set([
  'вид · баннер сверху',
  'вид · тост на действии',
  'вид · контакт поддержки',
  'Подписка · контакт поддержки · 03',
  'Подписка · контакт поддержки · 04',
  'Подписка · контакт поддержки · 05',
  'Подписка · контакт поддержки · 06',
  'Подписка · тост на действии · рисунок 03',
  'Подписка · контакт поддержки · рисунок 03',
  'Подписка · контакт поддержки · рисунок 04',
  'Подписка · контакт поддержки · рисунок 05',
  'Подписка · контакт поддержки · рисунок 06',
  'Подписка · контакт поддержки · рисунок 07',
  'Подписка · контакт поддержки · рисунок 08',
  'Подписка · контакт поддержки · рисунок 09',
]);

const PATCHES = {
  'вид · баннер сверху': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:484-513 + 735-ui-v4-subscription.css:444-476: .readonly-banner--sticky var(--v4-tint) pad 10/18 min-h 44; title «Доступ только для чтения» + subtitle; pill .readonly-banner-pill var(--v4-act); sand #f6e6dd · blue #fbe6e2 (subscription-readonly-surfaces-v4.test.js)',
  },
  'вид · тост на действии': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:577-616 + 735-ui-v4-subscription.css:478-519: .readonly-toast var(--v4-surface) r22 pad 11/13 inset 1px; lock svg M7 11V7; copy «Запись недоступна — только чтение»; action var(--v4-act-text) (subscription-readonly-surfaces-v4.test.js)',
  },
  'вид · контакт поддержки': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:1342-1395 + 735-ui-v4-subscription.css:521-585: paywall-overlay var(--scrim) blur 2.5px; lock 44px var(--v4-tint); row 52px var(--v4-surface); sand/blue tint+surface (subscription-readonly-surfaces-v4.test.js)',
  },
  'Подписка · контакт поддержки · 03': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:1347: .sub-contact-lock 44px var(--v4-tint) + paywallLockIconMarkup 22px var(--v4-bad-text)',
  },
  'Подписка · контакт поддержки · 04': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:1348: .paywall-title margin-top 14px «Пробный период закончился»',
  },
  'Подписка · контакт поддержки · 05': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:1354: .sub-contact-rows margin-top 18px',
  },
  'Подписка · контакт поддержки · 06': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:1362: .sub-contact-row__text flex 1',
  },
  'Подписка · тост на действии · рисунок 03': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:596: showBlockedToast lock svg path M7 11V7a5 5 0 0 1 10 0v4',
  },
  'Подписка · контакт поддержки · рисунок 03': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:838-852: paywallLockIconMarkup 22×22 viewBox lock rect+path',
  },
  'Подписка · контакт поддержки · рисунок 04': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:850: paywallLockIconMarkup rect 18×11 rx 2',
  },
  'Подписка · контакт поддержки · рисунок 05': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:851: paywallLockIconMarkup path M7 11V7a5 5 0 0 1 10 0v4',
  },
  'Подписка · контакт поддержки · рисунок 06': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:869-883: paywallSendIcon 16×16 viewBox send paths',
  },
  'Подписка · контакт поддержки · рисунок 07': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:881: paywallSendIcon path M22 2L11 13',
  },
  'Подписка · контакт поддержки · рисунок 08': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:882: paywallSendIcon path M22 2l-7 20-4-9-9-4 20-7z',
  },
  'Подписка · контакт поддержки · рисунок 09': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:867: paywallExternalLinkIcon path M7 17L17 7M7 7h10v10',
  },
};

const before = readZone(ZONE);
const foreignBefore = snapshotForeignRowStrings(before.rows, HANDOFF_KEYS);

for (const [key, patch] of Object.entries(PATCHES)) {
  setVerdictKey(ZONE, key, { verdict: patch.v, fact: patch.f, options: {} });
}

const after = readZone(ZONE);
assertForeignRowsUnchanged(foreignBefore, after.rows);

const neqBefore = Object.values(before.rows).filter((row) => row.v === '≠').length;
const neqAfter = Object.values(after.rows).filter((row) => row.v === '≠').length;
console.log('≠ before → after:', neqBefore, '→', neqAfter);
console.log('updated', Object.keys(PATCHES).length, 'rows');
