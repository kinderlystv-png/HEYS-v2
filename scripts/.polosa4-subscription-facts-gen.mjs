#!/usr/bin/env node
/**
 * Polosa 4 · task 82 — subscription zone contract facts (255 rows).
 * Static CSS/JS facts + evaluateDomEvidence (runtime harness lacks HEYS.Subscriptions).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readCanvasPackage } from './lib/ui-v4-canvas-index.mjs';
import { parseContractAssertions } from './lib/ui-v4-assertions.mjs';
import { evaluateDomEvidence } from './lib/ui-v4-dom-evidence.mjs';
import { buildEvidence } from './lib/ui-v4-dom-measure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'scripts', '.polosa4-subscription-facts.json');

const CODE_FILES = [
  'apps/web/heys_paywall_v1.js',
  'apps/web/heys_subscriptions_v1.js',
  'apps/web/heys_subscription_v1.js',
  'apps/web/heys_trial_queue_v1.js',
  'apps/web/heys_user_v12.js',
  'apps/web/styles/modules/000-base-and-gamification.css',
  'apps/web/styles/modules/732-ui-v4-nutrition.css',
  'apps/web/heys_app_shell_v1.js',
];

function parserStatus(parseStatus) {
  if (parseStatus === 'parsed') return 'full';
  if (parseStatus === 'partial') return 'partial';
  return 'unsupported';
}

function flattenAssertions(parsed) {
  return (parsed.assertions || []).map((a) => ({
    property: a.property,
    value: summarizeExpected(a),
    kind: a.kind,
  }));
}

function summarizeExpected(assertion) {
  const exp = assertion.expected;
  if (typeof exp === 'string') return exp;
  if (typeof exp === 'number' || typeof exp === 'boolean') return String(exp);
  if (exp?.css) return exp.css;
  if (exp?.values) {
    return exp.values
      .map((v) => (v.unit === 'auto' ? 'auto' : `${v.value}${v.unit === 'number' ? '' : v.unit || ''}`))
      .join(' ');
  }
  if (exp?.weight != null && exp?.size != null) {
    const lh = exp.lineHeight != null ? `/${exp.lineHeight}` : '';
    return `${exp.weight} ${exp.size}px${lh} ${exp.family ?? ''}`.trim();
  }
  try {
    return JSON.stringify(exp);
  } catch {
    return String(exp);
  }
}

function frameLabelFromIdentity(identity) {
  const m = String(identity).match(/^(.+) · (\d{2})$/);
  return m ? m[1] : null;
}

function frameLabelFromProseKey(key) {
  const m = String(key).match(/^(.+) · (?:рисунок|текст)/);
  return m ? m[1] : null;
}

function loadSources() {
  const files = new Map();
  for (const rel of CODE_FILES) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs)) files.set(rel, fs.readFileSync(abs, 'utf8'));
  }
  const paywall = files.get('apps/web/heys_paywall_v1.js') || '';
  const stylesMatch = paywall.match(/const PAYWALL_STYLES = `([\s\S]*?)`;/);
  const paywallCss = stylesMatch ? stylesMatch[1] : '';
  return { files, paywallCss };
}

function parseCssRules(cssText) {
  const rules = new Map();
  for (const match of cssText.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ');
    const decls = {};
    for (const part of match[2].split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const prop = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (prop) decls[prop] = val;
    }
    if (selector) rules.set(selector, decls);
  }
  return rules;
}

function findLine(content, needle) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes(needle)) return `${lines[i].trim()} (${i + 1})`;
  }
  return null;
}

function findCodeRef(files, patterns, fallback) {
  for (const [file, content] of files.entries()) {
    const line = findLine(content, Array.isArray(patterns) ? patterns[0] : patterns);
    if (line) return `${file}:${line.match(/\((\d+)\)$/)?.[1] || '?'}`;
  }
  return fallback;
}

function cssValue(rules, selector, prop) {
  const decls = rules.get(selector);
  return decls?.[prop] ?? null;
}

function pxNum(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/([\d.]+)\s*px/i);
  return m ? Number(m[1]) : null;
}

function buildStaticRules({ files, paywallCss }) {
  const baseCss = files.get('apps/web/styles/modules/000-base-and-gamification.css') || '';
  const paywallRules = parseCssRules(paywallCss);
  const settingsRules = parseCssRules(baseCss);
  return { paywallRules, settingsRules, files };
}

const FRAME_SOURCES = {
  'Подписка · строка в настройках': {
    codeRef: 'apps/web/styles/modules/000-base-and-gamification.css:10738',
    rules: (s) => s.settingsRules,
    selectors: ['.hdr-settings-sheet__row', '.hdr-settings-sheet__label', '.hdr-settings-sheet__meta'],
  },
  'Подписка · баннер сверху': {
    codeRef: 'apps/web/heys_paywall_v1.js:260',
    rules: (s) => s.paywallRules,
    selectors: ['.readonly-banner', '.readonly-banner-title', '.readonly-banner-text'],
  },
  'Подписка · тарифы · места есть': {
    codeRef: 'apps/web/heys_paywall_v1.js:71',
    rules: (s) => s.paywallRules,
    selectors: ['.paywall-modal', '.paywall-overlay', '.paywall-plan'],
  },
  'Подписка · тарифы · мест нет': {
    codeRef: 'apps/web/heys_paywall_v1.js:71',
    rules: (s) => s.paywallRules,
    selectors: ['.paywall-modal', '.paywall-overlay'],
  },
  'Подписка · тарифы · Pro Спорт': {
    codeRef: 'apps/web/heys_paywall_v1.js:71',
    rules: (s) => s.paywallRules,
    selectors: ['.paywall-modal', '.paywall-plan'],
  },
  'Подписка · контакт поддержки': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:1219',
    inline: {
      'font-size': '56px',
      'border-radius': '12px',
      padding: '14px 24px',
    },
  },
  'Подписка · приветствие': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:1369',
    inline: { 'font-size': '56px', emoji: '🎉' },
  },
  'Подписка · экран · пробный период': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:1042',
    inline: { 'border-radius': '12px', padding: '16px' },
  },
  'Подписка · экран · активна': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:1042',
    inline: { 'border-radius': '12px', padding: '16px' },
  },
  'Подписка · экран · только чтение': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:1042',
    inline: { 'border-radius': '12px' },
  },
  'Подписка · проверьте заказ': {
    codeRef: 'apps/web/heys_subscriptions_v1.js:797',
    inline: { 'font-size': '24px', 'border-radius': '12px' },
  },
  'Подписка · оплата прошла': {
    codeRef: 'apps/web/heys_subscriptions_v1.js',
    inline: { 'border-radius': '12px' },
  },
  'Подписка · очередь · заявка подана': {
    codeRef: 'apps/web/heys_paywall_v1.js:549',
    rules: (s) => s.paywallRules,
    selectors: ['.paywall-modal'],
  },
  'Подписка · очередь · место освободилось': {
    codeRef: 'apps/web/heys_paywall_v1.js:549',
    rules: (s) => s.paywallRules,
    selectors: ['.paywall-modal'],
  },
  'Подписка · тост на действии': {
    codeRef: 'apps/web/heys_paywall_v1.js:302',
    rules: (s) => s.paywallRules,
    selectors: ['.readonly-toast'],
  },
};

function lookupProductValue(assertion, staticCtx, frameLabel) {
  const src = FRAME_SOURCES[frameLabel];
  if (!src) return null;

  if (src.inline) {
    const prop = assertion.property;
    if (prop === 'height' && src.inline['font-size']) return { computedStyle: { height: src.inline['font-size'] } };
    if (prop === 'content' && src.inline.emoji) return { text: src.inline.emoji };
    if (prop === 'border-radius' && src.inline['border-radius']) {
      return { computedStyle: { 'border-radius': src.inline['border-radius'] } };
    }
    if (prop === 'padding' && src.inline.padding) return { computedStyle: { padding: src.inline.padding } };
  }

  const rules = src.rules?.(staticCtx);
  if (!rules) return null;
  for (const sel of src.selectors || []) {
    const decls = rules.get(sel);
    if (!decls) continue;
    const { property, kind } = assertion;
    if (kind === 'color') {
      const key = { color: 'color', background: 'background', fill: 'fill', stroke: 'stroke' }[property];
      if (key && decls[key]) return { declared: decls[key], resolved: decls[key] };
    }
    if (property === 'height' && decls.height) return { computedStyle: { height: decls.height } };
    if (property === 'min-height' && decls['min-height']) return { computedStyle: { 'min-height': decls['min-height'] } };
    if (property === 'width' && decls.width) return { computedStyle: { width: decls.width } };
    if (property === 'padding' && decls.padding) return { computedStyle: { padding: decls.padding } };
    if (property === 'border-radius' && decls['border-radius']) {
      return { computedStyle: { 'border-radius': decls['border-radius'] } };
    }
    if (property === 'gap' && decls.gap) return { computedStyle: { gap: decls.gap } };
    if (property === 'font' || kind === 'typography') {
      if (decls.font) {
        return {
          computedStyle: {
            fontWeight: decls['font-weight'] || decls.font,
            fontSize: decls['font-size'] || decls.font,
            lineHeight: decls['line-height'] || 'normal',
            fontFamily: decls['font-family'] || 'Figtree',
          },
        };
      }
      if (decls['font-size']) {
        return {
          computedStyle: {
            fontWeight: decls['font-weight'] || '600',
            fontSize: decls['font-size'],
            lineHeight: decls['line-height'] || '1.2',
            fontFamily: decls['font-family'] || 'Figtree, system-ui, sans-serif',
          },
        };
      }
    }
    if (property === 'filter' && decls['backdrop-filter']) {
      return { computedStyle: { filter: decls['backdrop-filter'] } };
    }
  }
  return null;
}

function knownGeometryMismatch(parsed, frameLabel, paywallRules) {
  const modalFrames = new Set([
    'Подписка · тарифы · места есть',
    'Подписка · тарифы · мест нет',
    'Подписка · тарифы · Pro Спорт',
    'Подписка · контакт поддержки',
    'Подписка · проверьте заказ',
    'Подписка · оплата прошла',
    'Подписка · приветствие',
    'Подписка · очередь · заявка подана',
    'Подписка · очередь · место освободилось',
  ]);
  if (!modalFrames.has(frameLabel)) return null;

  const modalRadius = pxNum(cssValue(paywallRules, '.paywall-modal', 'border-radius'));
  const modalPadding = cssValue(paywallRules, '.paywall-modal', 'padding');
  const overlayBlur = cssValue(paywallRules, '.paywall-overlay', 'backdrop-filter');

  for (const assertion of parsed.assertions) {
    if (assertion.property === 'border-radius') {
      const vals = assertion.expected?.values || [];
      const exp = vals[0]?.value ?? pxNum(summarizeExpected(assertion));
      if (exp === 26 && modalRadius === 20) {
        return {
          symbol: '≠',
          reason: 'paywall-modal border-radius 20px vs contract 26px',
          productFact: `PAYWALL_STYLES .paywall-modal border-radius ${modalRadius}px; contract 26px`,
        };
      }
    }
    if (assertion.property === 'padding') {
      if (modalPadding === '24px' && /22|18/.test(String(parsed.value))) {
        return {
          symbol: '≠',
          reason: 'paywall-modal padding 24px vs contract 22/18/18',
          productFact: `PAYWALL_STYLES .paywall-modal padding ${modalPadding}`,
        };
      }
    }
    if ((assertion.property === 'filter' || String(parsed.value).includes('размыт')) && overlayBlur?.includes('4px')) {
      return {
        symbol: '≠',
        reason: 'paywall-overlay blur(4px) vs v4 modal scrim 2.5px',
        productFact: `PAYWALL_STYLES .paywall-overlay ${overlayBlur}`,
      };
    }
  }
  return null;
}

function evaluateStaticRow(parsed, staticCtx, frameLabel) {
  const strength = parsed.assertions.length;
  if (!strength) return { status: 'inconclusive', strength, reason: 'нет assertions' };

  const selector = FRAME_SOURCES[frameLabel]?.codeRef || frameLabel;
  const evidence = [];
  for (const assertion of parsed.assertions) {
    const actual = lookupProductValue(assertion, staticCtx, frameLabel);
    if (!actual) {
      evidence.push({
        assertionId: assertion.id,
        status: 'inconclusive',
        property: assertion.property,
        reason: 'static lookup miss',
      });
      continue;
    }
    evidence.push(...buildEvidence({ parsed: { ...parsed, assertions: [assertion] }, selector, element: actual }));
  }

  const result = evaluateDomEvidence({ parsed, evidence });
  const matched = result.evidence.filter((r) => r.status === 'matched').length;
  const mismatched = result.evidence.filter((r) => r.status === 'mismatched');
  if (matched === strength) return { status: 'matched', strength, hits: 1, where: [selector] };
  if (mismatched.length) {
    return {
      status: 'mismatched',
      strength,
      hits: 0,
      best: {
        selector,
        diffs: mismatched.map((r) => ({
          property: r.property,
          expected: r.expected,
          actual: r.actual,
        })),
      },
    };
  }
  return { status: 'inconclusive', strength, reason: 'static inconclusive' };
}

function summarizeMeasured(matchResult) {
  if (matchResult.status === 'matched') {
    return `static ${matchResult.where?.[0] || 'code'} — all ${matchResult.strength} assertions matched`;
  }
  if (matchResult.best?.diffs?.length) {
    return matchResult.best.diffs
      .map((d) => `${d.property}: expected ${JSON.stringify(d.expected)} got ${JSON.stringify(d.actual)}`)
      .join('; ');
  }
  return matchResult.reason || 'inconclusive';
}

function recommendFromMeasure(matchResult, strength) {
  if (!matchResult || strength < 1) {
    return { symbol: '?', reason: 'нет разобранных утверждений' };
  }
  if (strength < 2 && matchResult.status !== 'matched') {
    return { symbol: '?', reason: 'strength<2 — слабое утверждение для автоматического =' };
  }
  if (matchResult.status === 'matched') return { symbol: '=', reason: 'CSS/JS static facts совпали с parsedAssertions' };
  if (matchResult.status === 'mismatched') {
    return { symbol: '≠', reason: summarizeMeasured(matchResult) };
  }
  return { symbol: '?', reason: summarizeMeasured(matchResult) };
}

function proseFact(key, contractText, staticCtx) {
  const { files, paywallRules, settingsRules } = staticCtx;
  const handlers = {
    фича: () => ({
      productFact: 'TRIAL_DAYS=7; статусы none/trial/active/read_only в heys_subscription_v1.js',
      codeRef: 'apps/web/heys_subscription_v1.js:16',
      recommend: { symbol: '=', reason: '7-дневный trial и статусы в коде' },
    }),
    границы: () => ({
      productFact: 'PaywallModal, ContactCuratorScreen, SubscriptionSection, ReadOnlyBanner, PaymentScreen реализованы',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1547',
      recommend: { symbol: '=', reason: 'перечисленные поверхности экспортированы из Subscriptions/Paywall' },
    }),
    источник: () => ({
      productFact: 'nutrition .readonly-banner — 732-ui-v4-nutrition.css:1679; curator-cabinet отдельно',
      codeRef: 'apps/web/styles/modules/732-ui-v4-nutrition.css:1679',
      recommend: { symbol: '=', reason: 'плашка питания в другом канвасе, как в контракте' },
    }),
    код: () => ({
      productFact: 'heys_paywall_v1.js, heys_subscriptions_v1.js, heys_trial_queue_v1.js, heys_subscription_v1.js, SubscriptionStatusCard',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1207',
      recommend: { symbol: '=', reason: 'файлы и paymentsEnabled на месте' },
    }),
    'две фазы': () => ({
      productFact: 'paymentsEnabled default false → ContactCuratorScreen; true → PaywallModal/PaymentScreen',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1733',
      recommend: { symbol: '=', reason: 'ветвление фаз по флагу' },
    }),
    адресация: () => ({
      productFact: '15 product frames data-demo=stop; visual fixture TASK72 (apps/web/scripts/ui-v4-visual-fixture.mjs)',
      codeRef: 'docs/ui/handoff-v4/canvas/.../subscription.v4.dc.html',
      recommend: { symbol: '=', reason: 'кадры канваса и fixture совпадают по label' },
    }),
    палитры: () => ({
      productFact: `paywall-modal background ${cssValue(paywallRules, '.paywall-modal', 'background')}; settings row on v4 roles`,
      codeRef: 'apps/web/heys_paywall_v1.js:72',
      recommend: { symbol: '≠', reason: 'paywall слой legacy var(--bg-primary), не полный v4 palette' },
    }),
    'слой — центральная модалка': () => ({
      productFact: `overlay ${cssValue(paywallRules, '.paywall-overlay', 'backdrop-filter')}; modal radius ${cssValue(paywallRules, '.paywall-modal', 'border-radius')} padding ${cssValue(paywallRules, '.paywall-modal', 'padding')}`,
      codeRef: 'apps/web/heys_paywall_v1.js:51',
      recommend: { symbol: '≠', reason: 'blur(4px)/radius 20/padding 24 ≠ контракт scrim 2.5px / radius 26 / 22-18-18' },
    }),
    'три тарифа': () => ({
      productFact: 'HEYS.config.prices base 490 pro 7990 proPlus 19990; Pro recommended',
      codeRef: 'apps/web/heys_subscriptions_v1.js:103',
      recommend: { symbol: '=', reason: 'цены и три плана в CONFIG.PLANS' },
    }),
    'три сигнала «только чтение»': () => ({
      productFact: 'ReadOnlyBanner + showBlockedToast + nutrition .readonly-banner',
      codeRef: 'apps/web/heys_paywall_v1.js:777',
      recommend: { symbol: '=', reason: 'три механизма в коде' },
    }),
    'контакт поддержки — список': () => ({
      productFact: 'ContactCuratorScreen: один Telegram @heyslab_support_bot, не список кураторов',
      codeRef: 'apps/web/heys_paywall_v1.js:25',
      recommend: { symbol: '=', reason: 'один общий контакт как в решении владельца' },
    }),
    'шаги оплаты — как в коде': () => ({
      productFact: 'PaymentScreen → YandexAPI.createPayment → PaymentSuccessScreen + payment_oferta',
      codeRef: findCodeRef(files, 'PaymentScreen', 'apps/web/heys_subscriptions_v1.js'),
      recommend: { symbol: '=', reason: 'цепочка оплаты реализована' },
    }),
    'очередь на пробный период': () => ({
      productFact: 'TrialQueueSection 4 states; offer_window_minutes в trial_queue',
      codeRef: findCodeRef(files, 'offer_window', 'apps/web/heys_trial_queue_v1.js'),
      recommend: { symbol: '=', reason: 'очередь и 120 мин оффера в модуле' },
    }),
    'слова на экране': () => ({
      productFact: 'Welcome 🎉; «Триал завершён»; «🎉 Начать триал!»; settings «Триал · осталось»',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1395',
      recommend: { symbol: '≠', reason: 'emoji и тон ≠ контракт COPY_VOICE' },
    }),
    иконки: () => ({
      productFact: 'emoji 🔒🎉⏳ в Paywall/TrialQueue; Lucide не подключён в subscription слое',
      codeRef: 'apps/web/heys_paywall_v1.js:784',
      recommend: { symbol: '≠', reason: 'emoji вместо Lucide stroke 2.75' },
    }),
    'вид · подписка в настройках': () => ({
      productFact: `row min-height ${cssValue(settingsRules, '.hdr-settings-sheet__row', 'min-height')}; padding ${cssValue(settingsRules, '.hdr-settings-sheet__row', 'padding')}; label ${cssValue(settingsRules, '.hdr-settings-sheet__row', 'font')}`,
      codeRef: 'apps/web/styles/modules/000-base-and-gamification.css:10738',
      recommend: { symbol: '=', reason: 'settings row CSS v4 близок к контракту (44/12-15/13px)' },
    }),
    'вид · приветствие': () => ({
      productFact: 'WelcomeFirstLogin: emoji 56px, синий gradient CTA, copy «добро пожаловать в HEYS!»',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1369',
      recommend: { symbol: '≠', reason: 'не v4 modal/copy из контракта' },
    }),
    'вид · экран подписки · пробный период': () => ({
      productFact: 'SubscriptionSection legacy inline #f9fafb radius 12 padding 16 — не v4 card --c1 radius 20',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1075',
      recommend: { symbol: '≠', reason: 'экран подписки не сведён с канвасом' },
    }),
    'вид · экран подписки · активна': () => ({
      productFact: 'то же SubscriptionSection inline styles',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1075',
      recommend: { symbol: '≠', reason: 'активный экран — legacy card' },
    }),
    'вид · экран подписки · только чтение': () => ({
      productFact: 'SubscriptionSection read_only → CTA «Продлить подписку», не «Написать/Выбрать тариф» v4',
      codeRef: 'apps/web/heys_subscriptions_v1.js:1135',
      recommend: { symbol: '≠', reason: 'copy/CTA ≠ контракт' },
    }),
    'Pro Спорт': () => ({
      productFact: 'proplus → contact flow, не card payment',
      codeRef: 'apps/web/heys_subscriptions_v1.js:138',
      recommend: { symbol: '=', reason: 'Pro Спорт через поддержку' },
    }),
  };

  if (handlers[key]) return handlers[key]();

  if (/^как читать/.test(key) || key === 'открытых вопросов нет') {
    return {
      productFact: 'Мета-инструкция канваса, не продуктовое правило',
      codeRef: 'subscription.v4.dc.html',
      recommend: { symbol: '—', reason: 'инструкция разбора' },
    };
  }

  if (/ · текст$/.test(key)) {
    return {
      productFact: `Copy row — grep heys_subscriptions_v1.js / heys_paywall_v1.js для «${contractText.slice(0, 40)}…»`,
      codeRef: findCodeRef(files, contractText.slice(0, 12).replace(/[«»"]/g, ''), 'apps/web/heys_subscriptions_v1.js'),
      recommend: { symbol: '?', reason: 'текстовая сверка — полоса 2' },
    };
  }

  if (/ · рисунок /.test(key)) {
    const fl = frameLabelFromProseKey(key);
    return {
      productFact: `SVG/icon row для кадра ${fl}; см. numbered ·NN строки того же кадра`,
      codeRef: FRAME_SOURCES[fl]?.codeRef || 'apps/web/heys_paywall_v1.js',
      recommend: { symbol: '?', reason: 'рисунок — через numbered CSS rows кадра' },
    };
  }

  if (key.startsWith('вид ·')) {
    return {
      productFact: 'Сводное prose-описание; детали в ·02…·NN и «вид ·» соседних блоков',
      codeRef: findCodeRef(files, 'SubscriptionSection', 'apps/web/heys_subscriptions_v1.js'),
      recommend: { symbol: '?', reason: 'агрегат prose — сверять по numbered rows' },
    };
  }

  return {
    productFact: 'Policy/runtime row — gateWrite, paymentsEnabled, trial_queue',
    codeRef: findCodeRef(files, 'gateWrite', 'apps/web/heys_paywall_v1.js'),
    recommend: { symbol: '?', reason: 'policy/runtime — полоса 2' },
  };
}

function main() {
  const canvas = readCanvasPackage().find((c) => c.zoneId === 'subscription');
  if (!canvas) throw new Error('subscription canvas missing');

  const staticCtx = buildStaticRules(loadSources());
  const rows = [];
  const summary = {
    total: canvas.contractRows.length,
    parser: { full: 0, partial: 0, unsupported: 0 },
    recommend: { '=': 0, '≠': 0, '?': 0, '—': 0 },
  };

  for (const row of canvas.contractRows) {
    const parsed = parseContractAssertions(row);
    const pStatus = parserStatus(parsed.parseStatus);
    summary.parser[pStatus] += 1;

    const frameLabel = frameLabelFromIdentity(row.identity) || frameLabelFromProseKey(row.identity);
    let matchResult = null;
    let known = null;
    if (frameLabel && parsed.assertions.length && FRAME_SOURCES[frameLabel]) {
      known = knownGeometryMismatch(parsed, frameLabel, staticCtx.paywallRules);
      if (!known) matchResult = evaluateStaticRow(parsed, staticCtx, frameLabel);
    }

    let productFact;
    let codeRef;
    let recommend;

    if (known) {
      productFact = known.productFact;
      codeRef = FRAME_SOURCES[frameLabel]?.codeRef || frameLabel;
      recommend = { symbol: known.symbol, reason: known.reason };
    } else if (matchResult && parsed.assertions.length && matchResult.status !== 'inconclusive') {
      productFact = summarizeMeasured(matchResult);
      codeRef = FRAME_SOURCES[frameLabel]?.codeRef || frameLabel;
      recommend = recommendFromMeasure(matchResult, parsed.assertions.length);
    } else if (frameLabel && parsed.assertions.length) {
      const bits = flattenAssertions(parsed).map((a) => `${a.property}=${a.value}`).join('; ');
      productFact = `Кадр ${frameLabel}: ${bits}. Продукт — legacy inline/PAYWALL_STYLES, element-level v4 sweep не сделан`;
      codeRef = FRAME_SOURCES[frameLabel]?.codeRef || findCodeRef(staticCtx.files, frameLabel.slice(0, 12), 'apps/web/heys_paywall_v1.js');
      recommend = { symbol: '?', reason: 'element-level CSS; зона не сведена — полоса 2' };
    } else {
      const prose = proseFact(row.identity, row.value, staticCtx);
      productFact = prose.productFact;
      codeRef = prose.codeRef;
      recommend = prose.recommend;
    }

    summary.recommend[recommend.symbol] = (summary.recommend[recommend.symbol] || 0) + 1;

    rows.push({
      contractKey: row.identity,
      contractText: row.value,
      parsedAssertions: flattenAssertions(parsed),
      parserStatus: pStatus,
      productFact,
      codeRef,
      recommend: { symbol: recommend.symbol, reason: recommend.reason },
    });
  }

  const handoff = {
    zone: 'subscription',
    task: 'polosa4-task82',
    generatedAt: new Date().toISOString().slice(0, 10),
    canvas: canvas.file,
    parserVersion: 'typed-assertions-v2',
    note: 'Static CSS/JS facts (paywall PAYWALL_STYLES + settings v4 row + inline Subscriptions). Playwright harness: HEYS.Subscriptions unavailable on :3001 visual route.',
    summary,
    rows,
  };

  fs.writeFileSync(OUT, `${JSON.stringify(handoff, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
  console.log('written', OUT);
}

main();
