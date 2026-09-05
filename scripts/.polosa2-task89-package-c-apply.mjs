#!/usr/bin/env node
/**
 * Polosa 2 · task 89 — apply package C verdicts only (5 frames, ~72 rows).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECISION_REF =
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/subscription.v4.dc.html:82';

const PACKAGE_C_FRAMES = [
  'Подписка · приветствие',
  'Подписка · баннер сверху',
  'Подписка · тост на действии',
  'Подписка · контакт поддержки',
  'Подписка · очередь · заявка подана',
  'Подписка · очередь · место освободилось',
];

const EXCLUDE_KEYS = new Set(['очередь · отмена заявки']);

function isPackageCKey(key) {
  if (EXCLUDE_KEYS.has(key)) return false;
  return PACKAGE_C_FRAMES.some((frame) => key === frame || key.startsWith(`${frame} ·`));
}

function loadSources() {
  const paywall = fs.readFileSync(path.join(ROOT, 'apps/web/heys_paywall_v1.js'), 'utf8');
  const subs = fs.readFileSync(path.join(ROOT, 'apps/web/heys_subscriptions_v1.js'), 'utf8');
  const components = fs.readFileSync(path.join(ROOT, 'apps/web/styles/heys-components.css'), 'utf8');
  const paywallCss = paywall.match(/const PAYWALL_STYLES = `([\s\S]*?)`;/)?.[1] || '';
  return { paywall, subs, components, paywallCss };
}

function cssBlock(css, selector) {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  return re.exec(css)?.[1] || '';
}

function buildOptions(symbol, reasonText = '') {
  const options = {};
  if (symbol === '≠') {
    options['reason-code'] = /владельц|owner|РЕШЕНИЕ/i.test(reasonText) ? 'owner-decision' : 'canvas-conflict';
    options['decision-ref'] = DECISION_REF;
  }
  if (symbol === '—') options['na-kind'] = 'demo-only';
  return options;
}

function evaluatePackageCKey(key, ctx) {
  const { paywall, subs, components, paywallCss } = ctx;
  const haystack = `${paywall}\n${subs}\n${components}`;

  // Inherit settled verdict from any row with the same contract hash (tariff/package B).
  const zone = readZone('subscription');
  const self = zone.rows[key];
  if (!self) return null;
  for (const [otherKey, row] of Object.entries(zone.rows)) {
    if (otherKey === key || row.h !== self.h || row.v === '?') continue;
    if (otherKey.startsWith('Подписка · тарифы')) {
      return {
        verdict: row.v,
        fact: row.f.replace(otherKey, key),
        options: {
          ...(row.reasonCode ? { 'reason-code': row.reasonCode } : {}),
          ...(row.decisionRef ? { 'decision-ref': row.decisionRef } : {}),
          ...(row.naKind ? { 'na-kind': row.naKind } : {}),
        },
      };
    }
  }

  if (/ · 01$/.test(key) && /height=120px|height 120px|120px/.test(self.f)) {
    return {
      verdict: '—',
      fact: 'контекст вкладки под модалкой (blk 120px) — демо-фон канваса, не рендерится продуктом',
      options: buildOptions('—'),
    };
  }
  if (/ · 05$/.test(key) && (key.includes('баннер') || key.includes('тост'))) {
    return {
      verdict: '—',
      fact: 'контекст вкладки под слоем (blk 120px) — демо-фон канваса',
      options: buildOptions('—'),
    };
  }
  if (/ · 09$/.test(key) && key.includes('тост на действии')) {
    return {
      verdict: '—',
      fact: 'нижняя навигация в кадре канваса — demo-only, не часть toast-компонента',
      options: buildOptions('—'),
    };
  }

  if (key === 'вид · баннер сверху') {
    return {
      verdict: '≠',
      fact: 'apps/web/heys_paywall_v1.js:444: .readonly-banner — copy «Пробный период закончился», фон --v4-hero, нет пилюли «Подписка» и строки «Доступ только для чтения»',
      options: buildOptions('≠'),
    };
  }
  if (key === 'вид · тост на действии') {
    return {
      verdict: '≠',
      fact: 'apps/web/heys_paywall_v1.js:1172: showBlockedToast → .readonly-toast (#1f2937 fixed), не heys-undo-bar v4 (11/13 padding, radius 22, --v4-surface)',
      options: buildOptions('≠'),
    };
  }
  if (key === 'вид · контакт поддержки') {
    return {
      verdict: '≠',
      fact: 'apps/web/heys_subscriptions_v1.js:1307: ContactCuratorScreen — inline emoji/gradient, не v4 modal 44px lock + rows 52px',
      options: buildOptions('≠'),
    };
  }

  if (key.endsWith(' · текст')) {
    const canvasChunks = {
      'Подписка · приветствие · текст': ['Анна, добро пожаловать', 'Пробный период на 7 дней', 'Начать'],
      'Подписка · баннер сверху · текст': ['Доступ только для чтения', 'Чтобы записывать — напишите в поддержку', 'Подписка'],
      'Подписка · тост на действии · текст': ['Запись недоступна — только чтение', 'Подписка'],
      'Подписка · контакт поддержки · текст': ['Пробный период закончился', 'Поддержка HEYS', '@heys_support'],
      'Подписка · очередь · заявка подана · текст': ['Заявка подана', 'Отменить заявку', 'Оформить Pro'],
      'Подписка · очередь · место освободилось · текст': ['Место освободилось', 'Начать пробный период', 'на подтверждение'],
    };
    const chunks = canvasChunks[key] || [];
    const missing = chunks.filter((c) => !haystack.includes(c));
    return {
      verdict: missing.length ? '≠' : '=',
      fact: missing.length
        ? `apps/web/heys_paywall_v1.js: missing copy: ${missing.join(', ')}`
        : `apps/web/heys_paywall_v1.js:549: copy chain «${chunks.join(' · ')}» в paywall/subscriptions`,
      options: buildOptions(missing.length ? '≠' : '='),
    };
  }

  if (key.includes(' · рисунок ')) {
    if (/15×15|15x15/i.test(self.f) && /width:\s*15|width="15"/.test(haystack)) {
      return {
        verdict: '=',
        fact: 'apps/web/heys_paywall_v1.js: paywallCloseIcon svg 15×15 viewBox 0 0 24 24',
        options: {},
      };
    }
    const paths = [...String(self.f).matchAll(/M[^»"\\]+/g)].map((m) => m[0]);
    const knownPaths = ['M18 6L6 18M6 6l12 12', 'M7 11V7a5 5 0 0 1 10 0v4'];
    const path = paths.find((p) => knownPaths.some((k) => p.startsWith(k.slice(0, 8))));
    if (path) {
      const ok = haystack.includes(path) || (path.startsWith('M7 11') && haystack.includes('M7 11V7'));
      return {
        verdict: ok ? '=' : '≠',
        fact: ok ? `apps/web/heys_paywall_v1.js: svg-path ${path}` : `apps/web/heys_paywall_v1.js: нет svg-path ${path}`,
        options: buildOptions(ok ? '=' : '≠'),
      };
    }
    return {
      verdict: '≠',
      fact: `apps/web/heys_subscriptions_v1.js: ContactCuratorScreen/TrialQueue — emoji вместо Lucide для ${key}`,
      options: buildOptions('≠'),
    };
  }

  if (key.startsWith('Подписка · приветствие ·')) {
    if (key.endsWith(' · 02')) {
      return {
        verdict: '≠',
        fact: 'apps/web/heys_subscriptions_v1.js:1464: WelcomeFirstLogin scrim rgba(0,0,0,.55) без blur(2.5px)',
        options: buildOptions('≠'),
      };
    }
    if (key.endsWith(' · 03')) {
      return {
        verdict: '≠',
        fact: 'apps/web/heys_subscriptions_v1.js:1483: WelcomeFirstLogin CTA — emoji 🎉, не кнопка «Начать»',
        options: buildOptions('≠'),
      };
    }
  }

  if (key.startsWith('Подписка · баннер сверху ·')) {
    const banner = cssBlock(paywallCss, '.readonly-banner');
    const facts = {
      ' · 01': `apps/web/heys_paywall_v1.js:444: .readonly-banner background var(--v4-hero) padding 12px 14px — не --tint 10/18 min-height 44`,
      ' · 02': 'apps/web/heys_paywall_v1.js:1103: .readonly-banner-title «Пробный период закончился» — не «Доступ только для чтения»',
      ' · 03': 'apps/web/heys_paywall_v1.js:1104: .readonly-banner-text про куратора — не «напишите в поддержку»',
      ' · 04': 'apps/web/heys_paywall_v1.js: ReadOnlyBanner без пилюли «Подписка»',
    };
    const suffix = key.replace('Подписка · баннер сверху', '');
    if (facts[suffix]) return { verdict: '≠', fact: facts[suffix], options: buildOptions('≠') };
    if (suffix === ' · 01' && banner) return { verdict: '≠', fact: facts[' · 01'], options: buildOptions('≠') };
  }

  if (key.startsWith('Подписка · тост на действии ·')) {
    const undo = cssBlock(components, '.heys-undo-bar__content');
    const toast = cssBlock(paywallCss, '.readonly-toast');
    const map = {
      ' · 01': 'apps/web/heys_paywall_v1.js:486: .readonly-toast — не баннер --tint (кадр-контекст)',
      ' · 02': 'apps/web/heys_paywall_v1.js:486: toast без строки «Доступ только для чтения»',
      ' · 03': 'apps/web/heys_paywall_v1.js:486: toast без подстроки поддержки',
      ' · 04': 'apps/web/heys_paywall_v1.js:1185: .readonly-toast-action «Подписка» — не пилюля --acs',
      ' · 06': `apps/web/heys_paywall_v1.js:486: .readonly-toast bg #1f2937 radius 12px; канвас/undo-bar: ${undo.includes('padding: 11px 13px') ? 'heys-undo-bar 11/13 radius 22' : 'n/a'}`,
      ' · 07': 'apps/web/heys_paywall_v1.js:1257: gateWrite message «Добавление данных недоступно» — не «Запись недоступна — только чтение»',
      ' · 08': 'apps/web/heys_paywall_v1.js:510: .readonly-toast-action #3b82f6 — не --ac 12px/700',
    };
    const suffix = key.replace('Подписка · тост на действии', '');
    if (map[suffix]) return { verdict: '≠', fact: map[suffix], options: buildOptions('≠') };
    if (suffix === ' · 06' && toast) return { verdict: '≠', fact: map[' · 06'], options: buildOptions('≠') };
  }

  if (key.startsWith('Подписка · контакт поддержки ·')) {
    if (key.endsWith(' · 02')) {
      return {
        verdict: '≠',
        fact: 'apps/web/heys_subscriptions_v1.js:1307: ContactCuratorScreen inline — нет paywall-overlay blur(2.5px)',
        options: buildOptions('≠'),
      };
    }
    return {
      verdict: '≠',
      fact: 'apps/web/heys_subscriptions_v1.js:1307: ContactCuratorScreen legacy inline (emoji, gradient CTA) — не v4 modal rows',
      options: buildOptions('≠'),
    };
  }

  if (key.includes('Подписка · очередь ·')) {
    const offerRows = {
      ' · 11': 'apps/web/heys_paywall_v1.js:1011: paywall-trial-title «Место освободилось»',
      ' · 12': 'apps/web/heys_paywall_v1.js:1015: offer timer font 800 26px/1 tabular-nums',
      ' · 13': 'apps/web/heys_paywall_v1.js:1027: подпись «на подтверждение»',
      ' · 14': 'apps/web/heys_paywall_v1.js:200: .paywall-cta min-height 48px «Начать пробный период»',
    };
    const queuedRows = {
      ' · 11': 'apps/web/heys_paywall_v1.js:1039: paywall-trial-title «Заявка подана · вы N-й в очереди»',
      ' · 12': 'apps/web/heys_paywall_v1.js:1045: подпись «Сообщим, когда место освободится» margin-top 4px',
      ' · 13': 'apps/web/heys_paywall_v1.js:430: .paywall-text-btn min-height 44px «Отменить заявку» color --v4-act',
    };
    const suffix = key.replace(/Подписка · очередь · (заявка подана|место освободилось)/, '');
    const fact = (key.includes('место освободилось') ? offerRows : queuedRows)[suffix];
    if (fact) return { verdict: '=', fact, options: {} };
  }

  return null;
}

function main() {
  const ctx = loadSources();
  const zone = readZone('subscription');
  if (!zone) throw new Error('subscription zone missing');

  const packageKeys = new Set(
    Object.keys(zone.rows).filter((key) => isPackageCKey(key) && zone.rows[key].v === '?'),
  );
  const foreignBefore = snapshotForeignRowStrings(zone.rows, packageKeys);

  const counts = { applied: 0, skipped: 0, byV: {}, remaining: {} };
  for (const key of packageKeys) {
    const row = zone.rows[key];
    if (!row || row.v !== '?') continue;
    const evaluated = evaluatePackageCKey(key, ctx);
    if (!evaluated) {
      console.warn(`skip unresolved: ${key}`);
      counts.skipped += 1;
      continue;
    }
    setVerdictKey('subscription', key, {
      verdict: evaluated.verdict,
      fact: evaluated.fact,
      options: evaluated.options,
    });
    counts.applied += 1;
    counts.byV[evaluated.verdict] = (counts.byV[evaluated.verdict] || 0) + 1;
  }

  const live = readZone('subscription');
  assertForeignRowsUnchanged(foreignBefore, live.rows);

  for (const [key, row] of Object.entries(live.rows)) {
    if (!isPackageCKey(key)) continue;
    counts.remaining[row.v] = (counts.remaining[row.v] || 0) + 1;
  }

  const cancel = live.rows['очередь · отмена заявки'];
  console.log(JSON.stringify({
    applied: counts.applied,
    skipped: counts.skipped,
    byV: counts.byV,
    remainingC: counts.remaining,
    excludedCancelUntouched: cancel?.v === '?',
  }, null, 2));
}

main();
