import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const frames = [
  'Подписка · тарифы · места есть',
  'Подписка · тарифы · мест нет',
  'Подписка · тарифы · Pro Спорт',
  'Подписка · проверьте заказ',
  'Подписка · оплата прошла',
];

const verdictMap = {
  '· 01': {
    v: '—',
    f: 'контекст вкладки под модалкой (blk 120px) — демо-фон канваса, не рендерится PaywallModal',
    naKind: 'demo-only',
  },
  '· 02': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:51: .paywall-overlay background var(--v4-modal-backdrop-dim); blur var(--v4-modal-backdrop-blur, 2.5px)',
  },
  '· 03': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:178: .paywall-plans flex-direction column; gap 10px; margin-top 14px',
  },
  '· 04': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:214: .paywall-plan-price font-variant-numeric tabular-nums; formatPlanPrice 490 ₽',
  },
  '· 05': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:196: .paywall-plan.popular-offset margin-top 4px на второй карточке',
  },
  '· 06': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:228: .paywall-cta margin-top 14px; getPaywallCtaLabel «Оформить Pro · 7 990 ₽»',
  },
  '· 07': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:238: .paywall-divider align-items center; gap 12px; margin 14px 0 12px',
  },
  '· 08': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:244: .paywall-divider-line flex 1; height 1px; background rgba(var(--v4-ink-rgb), .08)',
  },
  '· 09': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:249: .paywall-divider-label font 600 11px/1; color rgba(var(--v4-ink-rgb), .45)',
  },
  '· 10': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:254: .paywall-trial background var(--v4-hero); border-radius 18px; padding 14px; text-align center',
  },
  '· 11': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:264: .paywall-trial-title «Пробный период 7 дней — бесплатно» font 700 13px/1.3',
  },
  '· 12': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:269: .paywall-trial-status gap 7px; margin-top 6px; font 600 12px/1; color var(--v4-ok) при местах',
  },
  '· 13': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:283: .paywall-trial-dot 8×8px border-radius 999px; --ok/--danger по состоянию',
  },
  '· 14': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:291: .paywall-btnq min-height 44px; margin-top 12px; background var(--v4-bg); «Начать пробный период»/«Встать в очередь»',
  },
  'Pro Спорт · 06': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:586: getPaywallCtaLabel proPlus → «Написать в поддержку»; margin-top 14px .paywall-cta',
  },
  'Pro Спорт · 07': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:590: .paywall-footnote font 500 11.5px/1.45; margin-top 10px; текст про согласование',
  },
  'проверьте заказ · 03': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:858: .paywall-order-card background var(--v4-surface); border-radius 18px; padding 14px; margin-top 16px',
  },
  'проверьте заказ · 04': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:860: .paywall-order-name font 700 15px/1.2 «Pro»',
  },
  'проверьте заказ · 05': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:864: блок цены text-align right в .paywall-order-card',
  },
  'проверьте заказ · 06': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:865: .paywall-order-price font 800 17px/1 tabular-nums «7 990 ₽»',
  },
  'проверьте заказ · 07': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:866: .paywall-order-period font 500 11px/1; margin-top 4px «за 30 дней»',
  },
  'проверьте заказ · 08': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:870: .paywall-consent align-items flex-start; gap 12px; margin-top 16px; padding 0 2px',
  },
  'проверьте заказ · 09': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:874: .paywall-consent-box.is-checked background var(--v4-act-surface); color var(--v4-on-act-surface)',
  },
  'проверьте заказ · 10': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:877: .paywall-consent-text font 500 12px/1.45 «Принимаю условия»',
  },
  'проверьте заказ · 11': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:882: .paywall-consent-link color var(--v4-act); text-decoration underline',
  },
  'проверьте заказ · 12': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:901: .paywall-cta margin-top 18px; «Оплатить 7 990 ₽»; opacity .45 до согласия',
  },
  'проверьте заказ · 13': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:906: .paywall-cancel min-height 44px; font 600 12px/1; color rgba(var(--v4-ink-rgb), .56)',
  },
  'оплата прошла · 03': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:918: .paywall-success-icon 56×56 border-radius 999px; background var(--v4-ok-bg); color var(--v4-ok)',
  },
  'оплата прошла · 04': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:921: .paywall-title margin-top 14px «Подписка активна»',
  },
  'оплата прошла · 05': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:923: .paywall-success-card background var(--v4-surface); border-radius 18px; padding 14px; margin-top 14px; gap 6px; font 500 12.5px/1.4',
  },
  'оплата прошла · 06': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:925: .paywall-success-card .n tabular-nums «До … · … ₽ в месяц»',
  },
  'оплата прошла · 07': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:927: .paywall-cta margin-top 18px «Продолжить»',
  },
  '· рисунок 01': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:548: paywallCloseIcon svg 15×15 viewBox 0 0 24 24',
  },
  '· рисунок 02': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:557: paywallCloseIcon path M18 6L6 18M6 6l12 12',
  },
  'проверьте заказ · рисунок 01': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:713: paywallCloseIconMarkup svg 15×15 viewBox 0 0 24 24',
  },
  'проверьте заказ · рисунок 02': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:722: paywallCloseIconMarkup path M18 6L6 18M6 6l12 12',
  },
  'проверьте заказ · рисунок 03': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:686: paywallCheckIcon svg 13×13 viewBox 0 0 24 24',
  },
  'проверьте заказ · рисунок 04': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:695: paywallCheckIcon path M20 6L9 17l-5-5',
  },
  'оплата прошла · рисунок 01': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:700: paywallSuccessCheckIcon svg 26×26 viewBox 0 0 24 24',
  },
  'оплата прошла · рисунок 02': {
    v: '=',
    f: 'apps/web/heys_subscriptions_v1.js:709: paywallSuccessCheckIcon path M20 6L9 17l-5-5',
  },
  '· текст': {
    v: '=',
    f: 'apps/web/heys_paywall_v1.js:574-591 / heys_subscriptions_v1.js PaymentScreen: копия кадра сверена с canvas data-v текст',
  },
};

const keys = Object.keys(readZone('subscription').rows).filter((k) =>
  frames.some((f) => k.startsWith(f)),
);

// Пакет B — только кадры тарифов и оплаты. Всё остальное в зоне ведут полосы
// 2 и 4 параллельно, поэтому их строки снимаются до правок и сверяются после:
// промах в фильтре ключей должен падать, а не переписывать чужой вердикт.
const foreignBefore = snapshotForeignRowStrings(zone.rows, new Set(keys));

let updated = 0;
for (const key of keys) {
  let rule = null;

  if (key.includes('· 01') && !key.includes('рисунок')) {
    rule = verdictMap['· 01'];
  } else if (key.includes('· текст')) {
    rule = verdictMap['· текст'];
  } else if (key.includes('· рисунок 01') && key.includes('проверьте заказ')) {
    rule = verdictMap['проверьте заказ · рисунок 01'];
  } else if (key.includes('· рисунок 02') && key.includes('проверьте заказ')) {
    rule = verdictMap['проверьте заказ · рисунок 02'];
  } else if (key.includes('· рисунок 03') && key.includes('проверьте заказ')) {
    rule = verdictMap['проверьте заказ · рисунок 03'];
  } else if (key.includes('· рисунок 04') && key.includes('проверьте заказ')) {
    rule = verdictMap['проверьте заказ · рисунок 04'];
  } else if (key.includes('· рисунок 01') && key.includes('оплата прошла')) {
    rule = verdictMap['оплата прошла · рисунок 01'];
  } else if (key.includes('· рисунок 02') && key.includes('оплата прошла')) {
    rule = verdictMap['оплата прошла · рисунок 02'];
  } else if (key.includes('· рисунок 01')) {
    rule = verdictMap['· рисунок 01'];
  } else if (key.includes('· рисунок 02')) {
    rule = verdictMap['· рисунок 02'];
  } else if (key.includes('мест нет') && key.endsWith('· 12')) {
    rule = {
      v: '=',
      f: 'apps/web/heys_paywall_v1.js:268: .paywall-trial-status--busy color var(--v4-ink-2); «Мест нет · в очереди N»',
    };
  } else if (key.includes('Pro Спорт')) {
    const num = key.match(/· (\d+)$/)?.[1];
    if (num === '07') rule = verdictMap['Pro Спорт · 07'];
    else if (num === '06') rule = verdictMap['Pro Спорт · 06'];
    else if (num) rule = verdictMap[`· ${String(num).padStart(2, '0')}`];
  } else if (key.includes('проверьте заказ')) {
    const num = key.match(/· (\d+)$/)?.[1];
    if (num === '02') rule = verdictMap['· 02'];
    else if (num) rule = verdictMap[`проверьте заказ · ${String(num).padStart(2, '0')}`];
  } else if (key.includes('оплата прошла')) {
    const num = key.match(/· (\d+)$/)?.[1];
    if (num === '02') rule = verdictMap['· 02'];
    else if (num) rule = verdictMap[`оплата прошла · ${String(num).padStart(2, '0')}`];
  } else if (key.includes('места есть') || key.includes('мест нет')) {
    const num = key.match(/· (\d+)$/)?.[1];
    if (num) rule = verdictMap[`· ${String(num).padStart(2, '0')}`];
  }

  if (!rule) {
    console.warn('NO RULE', key);
    continue;
  }

  setVerdictKey('subscription', key, {
    verdict: rule.v,
    fact: rule.f,
    options: rule.naKind ? { 'na-kind': rule.naKind } : {},
  });
  updated += 1;
}

// Здесь стояла целиковая запись зоны из объекта `zone` — она записывала снимок,
// прочитанный ДО цикла. То есть отменял все setVerdictKey этого же прогона и
// заодно возвращал зону к состоянию на момент чтения, стирая всё, что
// параллельная полоса успела написать в subscription между чтением и записью.
// setVerdictKey сохраняет каждую строку сам, под локом зоны; целиковая запись
// здесь не нужна и небезопасна по построению.
console.log('updated', updated, 'of', keys.length);
const after = readZone('subscription');
assertForeignRowsUnchanged(foreignBefore, after.rows);
const q = keys.filter((k) => after.rows[k]?.v === '?').length;
console.log('? remaining', q);
const counts = { '=': 0, '—': 0, '≠': 0, '?': 0 };
for (const k of keys) {
  const v = after.rows[k]?.v;
  counts[v] = (counts[v] || 0) + 1;
}
console.log('verdicts', counts);
