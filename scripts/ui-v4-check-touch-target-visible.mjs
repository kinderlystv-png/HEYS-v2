#!/usr/bin/env node
/**
 * ui-v4-check-touch-target-visible.mjs — гейт тач-целей ≥44px (полоса 4 · задача 69).
 *
 * Контракт v4-tap-target-contract: рисунок может быть меньше 44 px, цель
 * добирается прозрачным припуском ::after/::before (host position:relative,
 * pseudo position:absolute + inset или четыре смещения). Видимый размер кнопки
 * при этом не меняется — засчитывается итоговая зона ≥44×44.
 *
 * НЕ засчитывает:
 * - отрицательный margin (двигает соседей, а не цель);
 * - припуск псевдоэлемента без position:relative на хосте или без ≥44 по обеим осям.
 *
 * jsdom не раскладывает layout: width=0 и height=0 вместе — «не измерено», не нарушение.
 *
 * Флаги:
 *   --inventory          полный инвентарь → JSON + stdout summary
 *   --check              ratchet: падение на росте долга
 *   --update-baseline    перезаписать baseline после закрытия долга
 *   --json               машиночитаемый вывод
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MODULES = path.join(ROOT, 'apps/web/styles/modules');
const STYLES = path.join(ROOT, 'apps/web/styles');
const INVENTORY_PATH = path.join(ROOT, 'scripts/.polosa4-task69-touch-target-inventory.json');
const BASELINE_PATH = path.join(ROOT, 'scripts/.polosa4-task69-touch-target-baseline.json');

export const MIN_TOUCH_PX = 44;

/** Frozen / вне product UI v4 — не сканируем. */
export const FROZEN_CSS = new Set([
  'fingers.css',
  'drums-finger-trainer.css',
  '002-ui-v4-palette-roles.css',
]);

/** Planning games — не product UI v4. */
export const SKIP_CSS_PREFIXES = ['908-planning', '909-planning', '910-planning', '911-planning', '912-planning'];

/**
 * Законные исключения дизайнера. Ложное срабатывание дороже пропуска —
 * каждая запись явно именует класс/тип и причину.
 */
export const EXEMPTION_REGISTRY = [
  {
    type: 'progress-dot',
    match: (sel) => /(?:^|\s)\.(?:[^.\s]*-(?:dot|dots|pager-dot|step-dot|progress-dot)|mc-progress-dot|step-modal-dot)/i.test(sel),
    reason: 'точка прогресса — декор шага, не полноразмерная кнопка',
  },
  {
    type: 'slider-node',
    match: (sel) => /(?:thumb|slider-handle|range-thumb|ma-habit-cal-thumb)/i.test(sel),
    reason: 'узел ползунка — отдельный контракт геометрии',
  },
  {
    type: 'range-slider',
    match: (sel) =>
      /(?:mood-slider|steps-slider|mc-steps-slider|mc-quality-slider|household-slider|ts-slider|aps-grams-slider|meal-mood-scale__slider|outcome-modal__slider|reading-reader__font-control|whatif-custom__field input\[type=["']range["']\])/i.test(
        sel,
      ),
    reason: 'ползунок диапазона — не полноразмерная кнопка, контракт отдельной геометрии',
  },
  {
    type: 'wheel-picker',
    match: (sel) => /(?:wheel-item|mc-wheel-item|mc-wheel-btn|mc-wheel-value)\b/i.test(sel),
    reason: 'элемент колеса выбора — не полноразмерная кнопка',
  },
  {
    type: 'bar',
    match: (sel) =>
      /(?:^|\s)\.(?:[^.\s]*-(?:bar-track|wave-bar|insulin-wave-bar|metrics-bar-fill)|progress-bar(?!\s*-btn))/i.test(sel) &&
      !/-btn\b/i.test(sel),
    reason: 'полоса/трек — не нажимаемая цель',
  },
  {
    type: 'check-indicator',
    match: (sel) =>
      /(?:publish-checkbox|check-indicator|tick-indicator|nova-check|pe-checkbox\b|aps-create-publish-checkbox)/i.test(sel),
    reason: 'галочка-индикатор, не полноразмерная кнопка',
  },
  {
    type: 'named-exception',
    selector: '.nutrition-v4-chip',
    reason: 'nutrition-tab task63: видимый чип 30px, ::after expander снят (контракт конфигурации)',
  },
  {
    type: 'named-exception',
    selector: '.pe-portions-remove-btn',
    reason: 'product-card task63: кадр правки ·26 — осознанно 40×40',
  },
  {
    type: 'named-exception',
    selector: '.pe-field--inline',
    reason: 'product-card: поле витаминов — не нажимают',
  },
  {
    type: 'named-exception',
    selector: '.aps-create-barcode-clear',
    reason: 'product-card: 38px внутри строки 44px — видимая иконка меньше ряда',
  },
  {
    type: 'named-exception',
    selector: '.aps-barcode-debug-dot',
    reason: 'product-card: debug-точка наведения, не prod CTA',
  },
  {
    type: 'named-exception',
    selector: '.date-picker-day',
    reason: 'date-remainders: ячейка календаря — сетка дней, не кнопка 44×44',
  },
  {
    type: 'named-exception',
    selector: '.cal-cell',
    reason: 'date-remainders: ячейка мини-календаря — сетка дней, не кнопка 44×44',
  },
  {
    type: 'named-exception',
    selector: '.widget-drag-handle',
    reason: 'home-widgets: ручка перетаскивания — не тач-CTA',
  },
  {
    type: 'named-exception',
    selector: '.widget',
    reason: 'home-widgets FINDINGS: плитка — цель = весь виджет, декоративный ::after занят',
  },
  {
    type: 'named-exception',
    selector: '.widgets-grid--remove-pick .widget',
    reason: 'home-widgets FINDINGS: режим удаления — цель = вся плитка',
  },
  {
    type: 'named-exception',
    selector: '.widgets-settings__scale-slider',
    reason: 'home-widgets FINDINGS: дорожка 4 px, thumb 18 px — не full-row 44',
  },
  {
    type: 'named-exception',
    match: (sel) => /\.widget__(?:delete|settings|resize)-btn\b/.test(sel),
    reason: 'home-widgets: edit-mode chrome скрыт display:none до .widget--editing — гейт меряет покой',
  },
  {
    type: 'named-exception',
    selector: '.widgets-settings__field input[type="checkbox"]',
    reason: 'home-widgets: гейт меряет input с классом поля; видимый чекбокс 44px в правиле input[type=checkbox]',
  },
  {
    type: 'named-exception',
    selector: '.photo-processed-checkbox',
    reason: 'чекбокс обработки фото — индикатор, не полноразмерная кнопка',
  },
  {
    type: 'dev-only',
    match: (sel) => /dev-clear-weight/i.test(sel),
    reason: 'dev-only сброс веса — не prod CTA',
  },
  {
    type: 'toggle-knob',
    match: (sel) => /(?:^|\s)\.ios-toggle(?:\b|-)/i.test(sel) && !/ios-toggle-label/i.test(sel),
    reason: 'тумблер — нажимается вся строка 44, узел 26 только показывает состояние (cycle/water контракт)',
  },
  {
    type: 'toggle-knob',
    match: (sel) => /(?:^|\s)\.toggle-slider\b/i.test(sel),
    reason: 'тумблер профиля — цель вся строка label, не ползунок',
  },
  {
    type: 'toggle-row',
    match: (sel) => /\.ios-toggle-label\b/i.test(sel),
    reason: 'строка тумблера — цель вся строка, не узел 26px',
  },
  {
    type: 'named-exception',
    match: (sel) =>
      /\.hdr-settings-sheet__(?:row|fab-chip|diag-toggle|diag-btn)\b/.test(sel)
      || /\.notify-detail__row\b/.test(sel)
      || /\.reading-continue\b/.test(sel)
      || /\.hdr-settings-sheet__soft-card\b/.test(sel),
    reason:
      'settings/reading: видимый min-height ≥44 без ::after (контракт «Прочитать все»)',
  },
];

/**
 * Файлы, где почти все интерактивные правила принадлежат одной зоне.
 * Общие файлы (000-base, heys-components, 500-pwa) сюда не входят — у них
 * владелец по префиксу класса/селектора, иначе cycle получал 111 ложных
 * нарушений из .btn, упомянутого в вердикте, а не в UI цикла.
 */
export const FILE_ZONE_EXCLUSIVE = {
  '300-modals-and-day.css': 'checkin-morning',
  '400-water-and-hydration.css': 'water-add',
  '600-steps-and-aps.css': 'food-meal',
  '610-aps-meal-flow.css': 'food-meal',
  '611-aps-product-card.css': 'product-card',
  '613-cycle-ui.css': 'cycle',
  '715-yesterday-verify.css': 'checkin-morning',
  '730-widgets-dashboard.css': 'home-widgets',
  '731-ui-v4-activity.css': 'tab-activity',
  '732-ui-v4-nutrition.css': 'nutrition-tab',
  '733-ui-v4-login-theme.css': 'login',
  '733-ui-v4-reports.css': 'reports-insights',
  '734-ui-v4-curator-panel.css': 'service-curator',
  '734-ui-v4-insights.css': 'reports-insights',
  '735-ui-v4-subscription.css': 'subscription',
  '740-cascade-card.css': 'reports-insights',
  '750-strength-builder.css': 'strength-builder',
  '800-meal-optimizer.css': 'food-meal',
  '1000-messenger.css': 'messenger',
};

/** @type {{ test: (selector: string) => boolean, zone: string }[]} */
export const SELECTOR_ZONE_RULES = [
  { test: (s) => /\.cycle-card-v4|\.cycle-date-picker|\.cycle-v4-dialog|\.mc-rest-cycle|\.mc-cycle-/.test(s), zone: 'cycle' },
  {
    test: (s) =>
      /\.mc-supp-flow|\.mc-rest-step|\.mc-wheel|\.mc-steps-|\.mc-quality|\.mc-header-btn|\.mc-close-btn|\.mc-skip-btn|\.mc-dev-btn|\.mc-btn-|\.mc-rest-measure|\.mc-rest-supp|\.deficit-btn|\.deficit-preset|\.household-inc|\.household-slider|\.household-preset|\.household-example|\.household-time/.test(
        s,
      ),
    zone: 'checkin-morning',
  },
  { test: (s) => /\.hdr-settings-sheet|\.tab-settings-menu|\.notify-detail__/.test(s), zone: 'settings-system' },
  { test: (s) => /\.profile-v4-toggle|\.pwa-banner|\.update-toast|\.ca-banner|\.ca-modal|\.wn-/.test(s), zone: 'pwa-update' },
  { test: (s) => /\.confirm-modal-btn|\.delete-confirm-btn/.test(s), zone: 'shared' },
  { test: (s) => /\.tab-switch-labels--/.test(s), zone: 'reports-insights' },
];

/** @type {{ re: RegExp, zone: string }[]} */
export const CLASS_ZONE_RULES = [
  { re: /^heys-login-/, zone: 'login' },
  { re: /^nutrition-v4-|^diary-compact|^diary-fiber/, zone: 'nutrition-tab' },
  {
    re: /^water-|^advice-v4-|^advice-list-|^advice-toggle|^macro-toast|^advice-diagnostics|^advice-technical/,
    zone: 'water-add',
  },
  { re: /^ios-toggle/, zone: 'water-add' },
  { re: /^cycle-|^mc-rest-cycle|^mc-cycle-/, zone: 'cycle' },
  { re: /^yv-/, zone: 'checkin-morning' },
  {
    re: /^mc-wheel|^mc-steps|^mc-quality|^mc-supp|^mc-header|^mc-close|^mc-skip|^mc-dev|^mc-btn|^mc-rest-measure|^mc-rest-supp/,
    zone: 'checkin-morning',
  },
  { re: /^mood-|^steps-slider|^wheel-item|^quick-chip|^sleep-/, zone: 'checkin-morning' },
  { re: /^widgets-|^widget-/, zone: 'home-widgets' },
  {
    re: /^hdr-settings-|^tab-settings-|^notify-detail|^profile-section|^profile-advice|^profile-inline|^profile-push/,
    zone: 'settings-system',
  },
  { re: /^messenger-|^msg-/, zone: 'messenger' },
  { re: /^sb-|^ct-wb-/, zone: 'strength-builder' },
  {
    re: /^aps-|^meal-|^mpc-|^mpr-|^flow-selection|^grams-manual|^mobile-mood|^mobile-time|^photo-confirm|^photo-delete/,
    zone: 'food-meal',
  },
  { re: /^pe-|^aps-create|^aps-barcode|^product-name-edit$/, zone: 'product-card' },
  { re: /^cur-cab|^cur-chip|^cur-fine|^cur-row|^cdo-|^client-dropdown|^curator-dropdown/, zone: 'service-curator' },
  {
    re: /^insights-|^reports-v4|^heys-score-insights|^meal-rec-v4|^cascade-card|^phenotype-|^early-warning|^pattern-debug|^weekly-wrap|^whatif-|^adv-analytics|^feedback-|^predictive-dashboard|^dual-risk|^reason-card|^ews-badge|^ndte-badge|^info-button$|^info-modal__|^status-card__action$|^tab-switch-label$|^outcome-modal|^score-explainer|^monthly-reports|^monthly-week|^reports-sleep|^category-filter-bar|^priority-filter-bar/,
    zone: 'reports-insights',
  },
  {
    re: /^activity-v4-|^ma-habit-cal|^program-next-line$|^zone-formula-edit|^steps-goal-preset$/,
    zone: 'tab-activity',
  },
  { re: /^game-|^achievement-|^level-up/, zone: 'gamification' },
  { re: /^paywall-|^readonly-banner|^readonly-toast/, zone: 'subscription' },
  { re: /^date-picker|^cal-nav$|^cal-cell$|^cal-today|^yesterday-quick|^today-quick/, zone: 'date-remainders' },
  {
    re: /^pwa-banner|^update-toast|^ca-banner|^ca-modal|^profile-v4|^wn-|^offline-banner-|^offline-nodata-|^sync-pending|^sync-vpn|^sync-lock/,
    zone: 'pwa-update',
  },
  {
    re: /^week-heatmap|^macro-|^weight-|^sparkline|^balance-|^debt-science|^goal-bonus|^kcal-period|^household-|^compact-|^training-|^add-training|^zone-clickable|^caloric-balance|^measurements-card|^correlation-clickable$|^deficit-card-modern$|^metric-popup-close$|^day-score-|^day-subtab$/,
    zone: 'home-widgets',
  },
  { re: /^planning-|^gantt-|^chrono-|^goal-map|^reading-/, zone: 'planning' },
  { re: /^refeed-/, zone: 'food-meal' },
  { re: /^ts-/, zone: 'tab-activity' },
  { re: /^onboarding-|^desktop-gate|^copy-logout|^push-first-day-/, zone: 'first-run' },
  { re: /^tour-|^heys-undo/, zone: 'undo-bar' },
  // Общий shell: .btn, шапка, табы, свайп, модалки подтверждения — не одна зона экрана.
  { re: /^btn$|^confirm-modal-btn$|^delete-confirm-btn$/, zone: 'shared' },
  { re: /^hdr-/, zone: 'shared' },
  { re: /^theme-fab$|^theme-toggle$/, zone: 'shared' },
  { re: /^tab$|^tab--/, zone: 'shared' },
  { re: /^tab-switch-group$/, zone: 'shared' },
  { re: /^swipeable-/, zone: 'shared' },
  { re: /^suggest-item$/, zone: 'shared' },
  { re: /^cloud-sync-/, zone: 'shared' },
  { re: /^past-day-banner/, zone: 'shared' },
];

/**
 * Честная атрибуция: селектор → класс → эксклюзивный файл. Вердикты в зону
 * не подмешиваются — иначе login получал FAB из 730-widgets, а cycle — .btn
 * из 000-base, потому что файл упоминался в факте чужой зоны.
 * @param {string} fileBase
 * @param {string} selector
 * @param {string} className
 * @returns {string|null}
 */
export function resolveTouchZone(fileBase, selector, className) {
  for (const rule of SELECTOR_ZONE_RULES) {
    if (rule.test(selector)) return rule.zone;
  }
  const classes = String(className || '')
    .split(/\s+/)
    .filter(Boolean);
  for (const cls of classes) {
    for (const rule of CLASS_ZONE_RULES) {
      if (rule.re.test(cls)) return rule.zone;
    }
  }
  if (FILE_ZONE_EXCLUSIVE[fileBase]) return FILE_ZONE_EXCLUSIVE[fileBase];
  return null;
}

const args = process.argv.slice(2);
const wantInventory = args.includes('--inventory');
const wantCheck = args.includes('--check');
const updateBaseline = args.includes('--update-baseline');
const asJson = args.includes('--json');

/** @returns {string[]} */
export function listProductCssFiles() {
  const files = [];
  for (const name of fs.readdirSync(MODULES).sort()) {
    if (!name.endsWith('.css')) continue;
    if (FROZEN_CSS.has(name)) continue;
    if (SKIP_CSS_PREFIXES.some((p) => name.startsWith(p))) continue;
    files.push(path.join(MODULES, name));
  }
  const components = path.join(STYLES, 'heys-components.css');
  if (fs.existsSync(components)) files.push(components);
  return files;
}

/** @param {string} cssText */
export function stripCssComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * @param {string} cssText
 * @returns {{ selectors: string, block: string }[]}
 */
export function parseCssRules(cssText) {
  const cleaned = stripCssComments(cssText);
  const rules = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(cleaned))) {
    // Перевод строки внутри многострочного селектора попадает в ключ ratchet.
    // 500-pwa-and-offline.css и heys-components.css лежат в дереве с CRLF, и
    // те же два правила читались как «новые» рядом со «исправленными» —
    // отличие в одном \r, а не в геометрии. Пробел в селекторе не значащий.
    const selectors = m[1].replace(/\r\n?/g, '\n').trim();
    if (!selectors || selectors.startsWith('@')) continue;
    rules.push({ selectors, block: m[2] });
  }
  return rules;
}

/** @param {string} selector */
export function primaryClassFromSelector(selector) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    const classes = [...part.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
    if (classes.length) return classes[classes.length - 1];
  }
  return null;
}

/**
 * Разбор селектора на цель и предков по ПОСЛЕДНЕМУ составному куску.
 * `primaryClassFromSelector` берёт последний класс во всей части, и у
 * `.msg-attachment-error button` это класс ПРЕДКА: гейт вешал правила
 * контейнера на саму кнопку и мерил чужую коробку. Здесь цель — последний
 * кусок как он есть, включая случай голого тега без класса.
 * @param {string} selector
 * @returns {{ className: string, tag: string|null, ancestors: string[] } | null}
 */
export function selectorTarget(selector) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (!/\.[a-zA-Z0-9_-]/.test(part)) continue;
    const compounds = part
      .replace(/\s*[>+~]\s*/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const last = compounds[compounds.length - 1];
    const lastClasses = [...last.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
    const ancestors = [];
    for (const compound of compounds.slice(0, -1)) {
      const classes = [...compound.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
      if (classes.length) ancestors.push(classes.join(' '));
    }
    const tagMatch = /^([a-zA-Z][a-zA-Z0-9-]*)/.exec(last);
    return {
      className: lastClasses.join(' '),
      tag: lastClasses.length ? null : tagMatch ? tagMatch[1].toLowerCase() : null,
      ancestors,
    };
  }
  return null;
}

/**
 * Цепочка предков той же части селектора, что дала целевой класс.
 * Без неё правило `.paywall-trial .btn { min-height: 44px }` замеряется на
 * голой `<button class="btn">`, к которой оно не применяется: гейт получает
 * ноль и записывает в нарушения собственную ПОЧИНКУ размера. Замер 6 сентября:
 * так висели пять строк подряд, из них три — правила, добавленные ровно чтобы
 * поднять цель до 44.
 * @param {string} selector
 * @returns {string[]} классы каждого предка, от внешнего к внутреннему
 */
export function ancestorClassesFromSelector(selector) {
  const parts = selector.split(',').map((s) => s.trim());
  for (const part of parts) {
    if (!/\.[a-zA-Z0-9_-]/.test(part)) continue;
    const compounds = part
      .replace(/\s*[>+~]\s*/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const chain = [];
    for (const compound of compounds.slice(0, -1)) {
      const classes = [...compound.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((x) => x[1]);
      if (classes.length) chain.push(classes.join(' '));
    }
    return chain;
  }
  return [];
}

/** @param {string} selector */
export function matchesExemption(selector) {
  for (const row of EXEMPTION_REGISTRY) {
    if (row.selector && selector.includes(row.selector)) {
      return { type: row.type, reason: row.reason };
    }
    if (row.match && row.match(selector)) {
      return { type: row.type, reason: row.reason };
    }
  }
  return null;
}

/** @param {string} block */
export function isInteractiveBlock(block) {
  if (/cursor\s*:\s*pointer/i.test(block)) return true;
  if (/appearance\s*:\s*none/i.test(block) && /min-height|height|padding/i.test(block)) return true;
  return false;
}

/** @param {string} className */
export function defaultTagForClass(className) {
  if (/input|field|search/i.test(className)) return 'input';
  if (/link|anchor/i.test(className)) return 'a';
  return 'button';
}

/** @param {string} block — relative или absolute/fixed/sticky: без positioned хоста припуск ::after не считается. */
export function hostPositionRelative(block) {
  return /position\s*:\s*(?:relative|absolute|fixed|sticky)/i.test(block);
}

/** @param {string} block */
export function pseudoPositionAbsolute(block) {
  return /position\s*:\s*absolute/i.test(block);
}

/** @param {string} value */
function insetValueToExpandPx(value) {
  const n = parsePx(value);
  return n < 0 ? -n : 0;
}

/**
 * Отрицательный inset/offset псевдоэлемента → припуск в px по сторонам.
 * @param {string} block
 * @returns {{ top: number, right: number, bottom: number, left: number } | null}
 */
export function parsePseudoPaddingExpand(block) {
  const insetMatch = /inset\s*:\s*([^;]+)/i.exec(block);
  if (insetMatch) {
    const parts = insetMatch[1].trim().split(/\s+/);
    const values = parts.map(insetValueToExpandPx);
    if (values.length === 1) {
      const v = values[0];
      return { top: v, right: v, bottom: v, left: v };
    }
    if (values.length === 2) {
      return { top: values[0], right: values[1], bottom: values[0], left: values[1] };
    }
    if (values.length === 3) {
      return { top: values[0], right: values[1], bottom: values[2], left: values[1] };
    }
    if (values.length >= 4) {
      return { top: values[0], right: values[1], bottom: values[2], left: values[3] };
    }
  }
  const top = /(?:^|[;{])\s*top\s*:\s*([^;]+)/i.exec(block);
  const right = /(?:^|[;{])\s*right\s*:\s*([^;]+)/i.exec(block);
  const bottom = /(?:^|[;{])\s*bottom\s*:\s*([^;]+)/i.exec(block);
  const left = /(?:^|[;{])\s*left\s*:\s*([^;]+)/i.exec(block);
  if (top || right || bottom || left) {
    return {
      top: insetValueToExpandPx(top?.[1] ?? '0'),
      right: insetValueToExpandPx(right?.[1] ?? '0'),
      bottom: insetValueToExpandPx(bottom?.[1] ?? '0'),
      left: insetValueToExpandPx(left?.[1] ?? '0'),
    };
  }
  return null;
}

/**
 * @param {string} cssText
 * @param {string} selector
 * @returns {string | null}
 */
export function findHostBlock(cssText, selector) {
  const cleaned = stripCssComments(cssText);
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'i');
  const m = cleaned.match(re);
  return m ? m[1] : null;
}

/** @param {string} cssText @param {string} selector @param {'width'|'height'} axis */
export function mergedDeclaredAxisPx(cssText, selector, axis) {
  let max = 0;
  for (const part of selectorParts(selector)) {
    const block = findHostBlock(cssText, part);
    if (block) max = Math.max(max, declaredAxisPx(block, axis));
  }
  return max;
}

/**
 * @param {number} w
 * @param {number} h
 * @param {{ top: number, right: number, bottom: number, left: number }} expand
 */
export function touchBoundsWithPseudoPadding(w, h, expand) {
  return {
    width: w + expand.left + expand.right,
    height: h + expand.top + expand.bottom,
  };
}

/** @param {string} block @param {'width'|'height'} axis */
export function declaredAxisPx(block, axis) {
  const props = axis === 'width' ? ['width', 'min-width'] : ['height', 'min-height'];
  let max = 0;
  for (const prop of props) {
    const m = new RegExp(`${prop}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i').exec(block);
    if (m) max = Math.max(max, parsePx(m[1]));
  }
  return max;
}

/**
 * @param {string} selector
 * @returns {string[]}
 */
function selectorParts(selector) {
  return selector
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Прозрачный припуск ::after/::before по контракту v4-tap-target-contract.
 * @param {string} cssText
 * @param {string} selector
 * @param {string} [hostBlock]
 */
export function findPseudoExpander(cssText, selector, hostBlock) {
  const parts = selectorParts(selector);
  const host =
    hostBlock
    ?? parts.map((part) => findHostBlock(cssText, part)).find(Boolean)
    ?? findHostBlock(cssText, selector);
  const hostOk =
    (host && hostPositionRelative(host))
    || parts.some((part) => {
      const block = findHostBlock(cssText, part);
      return block && hostPositionRelative(block);
    });
  if (!hostOk) return null;

  const cleaned = stripCssComments(cssText);
  const selectorCandidates = [selector, ...parts];
  for (const pseudo of ['::after', '::before']) {
    for (const candidate of selectorCandidates) {
      const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${escaped}${pseudo}\\s*\\{([^}]*)\\}`, 'i');
      const m = cleaned.match(re);
      if (!m) continue;
      const block = m[1];
      if (/content\s*:\s*none/i.test(block)) continue;
      if (!/content\s*:/i.test(block)) continue;
      if (!pseudoPositionAbsolute(block)) continue;
      const hasBg =
        /background(?:-color)?\s*:\s*(?!transparent\b|none\b)[^;]+/i.test(block) ||
        /box-shadow\s*:/i.test(block) ||
        /border\s*:\s*(?!none\b|0\b)/i.test(block);
      if (hasBg) continue;

      const expand = parsePseudoPaddingExpand(block);
      if (expand && expand.top + expand.right + expand.bottom + expand.left > 0) {
        return {
          pseudo,
          kind: 'pseudo-padding-expander',
          block: block.trim(),
          expand,
        };
      }

      const widthMatch = /width\s*:\s*(\d+(?:\.\d+)?)px/i.exec(block);
      const heightMatch = /height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(block);
      if (widthMatch && heightMatch) {
        const pw = parsePx(widthMatch[1]);
        const ph = parsePx(heightMatch[1]);
        if (pw >= MIN_TOUCH_PX && ph >= MIN_TOUCH_PX) {
          return {
            pseudo,
            kind: 'pseudo-padding-expander',
            block: block.trim(),
            explicitSize: { width: pw, height: ph },
          };
        }
      }
    }
  }
  return null;
}

/**
 * @param {number} visW
 * @param {number} visH
 * @param {ReturnType<typeof findPseudoExpander>} pseudoExpander
 */
export function effectiveTouchSize(visW, visH, pseudoExpander) {
  if (!pseudoExpander) return { width: visW, height: visH };
  if (pseudoExpander.explicitSize) {
    return {
      width: Math.max(visW, pseudoExpander.explicitSize.width),
      height: Math.max(visH, pseudoExpander.explicitSize.height),
    };
  }
  if (pseudoExpander.expand) {
    return touchBoundsWithPseudoPadding(visW, visH, pseudoExpander.expand);
  }
  return { width: visW, height: visH };
}

/** @param {string} block */
export function hasNegativeMarginExpander(block) {
  return /margin(?:-(?:top|right|bottom|left))?\s*:\s*-/i.test(block);
}

/** @param {string} value */
export function parsePx(value) {
  const n = Number.parseFloat(String(value || ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Видимый габарит: layout box элемента, не псевдо-hit-area.
 * jsdom часто даёт rect 0×0 — берём max(rect, height/minHeight, width/minWidth).
 * @param {number} rectVal
 * @param  {...string} computedCandidates
 */
export function visibleAxis(rectVal, ...computedCandidates) {
  const fromCss = computedCandidates.map(parsePx).filter((n) => n > 0);
  return Math.max(rectVal, ...fromCss, 0);
}

/**
 * Ряд во всю ширину контейнера по ширине не ограничен, и мерить её нечем:
 * jsdom не раскладывает, rect всегда 0, а `width: auto` у блочного элемента
 * это и есть «сколько дал родитель». Гейт считал такую ширину нулём и писал
 * в нарушения ряды на все 375 px — среди них правила, добавленные ровно чтобы
 * поднять цель до 44 (`.paywall-consent`, `.sb-rest-manual`). Ось высоты при
 * этом остаётся строгой: она и есть то, что рука не находит.
 * @param {{ display?: string, width?: string }} cs
 */
export function spansContainerWidth(cs) {
  const display = String(cs.display || '');
  if (!/^(block|flex|grid|list-item|table)$/i.test(display)) return false;
  const width = String(cs.width || '').trim();
  if (width === '' || width === 'auto' || width === '100%') return true;
  // nutrition-v4-sheet__row и аналоги: calc(100% - 36px) — ряд на всю ширину
  // листа; jsdom не раскладывает calc, rect остаётся 0.
  return /^calc\(\s*100%/i.test(width);
}

/**
 * Элемент, растянутый на весь содержащий блок: `position:absolute` +
 * `inset:0` (или все четыре смещения). Габарит задаёт родитель, в разметке
 * его нет — jsdom даёт 0 по обеим осям. Подложка листа так и попадала в
 * нарушения, хотя нажимается в любой точке экрана.
 * @param {{ position?: string, inset?: string, top?: string, right?: string, bottom?: string, left?: string }} cs
 */
export function fillsContainingBlock(cs) {
  const position = String(cs.position || '');
  if (!/^(absolute|fixed)$/i.test(position)) return false;
  const sides = ['top', 'right', 'bottom', 'left'].map((k) => String(cs[k] || '').trim());
  if (sides.every((v) => v !== '' && v !== 'auto')) return true;
  const inset = String(cs.inset || '').trim();
  return inset !== '' && inset !== 'auto';
}

/**
 * Разбор padding/border/margin shorthand из текста блока (1–4 значения).
 * @param {string} block
 * @param {'padding'|'border'} prop
 */
export function parseBoxSidesFromBlock(block, prop) {
  const sides = { top: 0, right: 0, bottom: 0, left: 0 };
  const shorthand = new RegExp(`(?:^|[;{])\\s*${prop}\\s*:\\s*([^;]+)`, 'i').exec(block);
  if (shorthand) {
    const parts = shorthand[1].trim().split(/\s+/).map(parsePx);
    if (parts.length === 1) {
      sides.top = sides.right = sides.bottom = sides.left = parts[0];
    } else if (parts.length === 2) {
      sides.top = sides.bottom = parts[0];
      sides.right = sides.left = parts[1];
    } else if (parts.length === 3) {
      sides.top = parts[0];
      sides.right = sides.left = parts[1];
      sides.bottom = parts[2];
    } else if (parts.length >= 4) {
      [sides.top, sides.right, sides.bottom, sides.left] = parts;
    }
    return sides;
  }
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const m = new RegExp(`${prop}-${side}\\s*:\\s*([^;]+)`, 'i').exec(block);
    if (m) sides[side] = parsePx(m[1]);
  }
  return sides;
}

/**
 * Нижняя граница высоты строки из текста CSS-блока — fallback, когда jsdom
 * не раскладывает layout или падает на битом селекторе в полном файле.
 * @param {string} block
 */
export function lineBoxHeightFromBlock(block) {
  const pad = parseBoxSidesFromBlock(block, 'padding');
  const border = parseBoxSidesFromBlock(block, 'border');
  const fontSizeMatch = /font-size\s*:\s*([^;]+)/i.exec(block);
  const fontShorthand = /font\s*:\s*([^;]+)/i.exec(block);
  let fontSize = fontSizeMatch ? parsePx(fontSizeMatch[1]) : 0;
  if (!(fontSize > 0) && fontShorthand) {
    const pxInFont = /(\d+(?:\.\d+)?)px/.exec(fontShorthand[1]);
    if (pxInFont) fontSize = parsePx(pxInFont[1]);
  }
  if (!(fontSize > 0)) fontSize = 16;
  const lineHeightRaw = String(/line-height\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  let line = parsePx(lineHeightRaw);
  if (/^[\d.]+$/.test(lineHeightRaw)) line = fontSize * Number.parseFloat(lineHeightRaw);
  if (!(line > 0)) line = fontSize > 0 ? fontSize * 1.2 : 0;
  if (!(pad.top + pad.bottom > 0 || border.top + border.bottom > 0)) return 0;
  return pad.top + pad.bottom + border.top + border.bottom + line;
}

/**
 * Полная ширина контейнера по декларациям в блоке (без computed layout).
 * @param {string} block
 */
export function spansContainerWidthFromBlock(block) {
  const display = String(/display\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  if (!/^(block|flex|grid|list-item|table)$/i.test(display)) return false;
  const width = String(/(?:^|[^-])\bwidth\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  if (width === '' || width === 'auto' || width === '100%') return true;
  return /^calc\(\s*100%/i.test(width);
}

/**
 * position:absolute/fixed + inset:0 по декларациям в блоке.
 * @param {string} block
 */
export function fillsContainingBlockFromBlock(block) {
  const position = String(/position\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  if (!/^(absolute|fixed)$/i.test(position)) return false;
  const inset = String(/inset\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  if (inset !== '' && inset !== 'auto') return true;
  const sides = ['top', 'right', 'bottom', 'left'].map(
    (k) => String(new RegExp(`${k}\\s*:\\s*([^;]+)`, 'i').exec(block)?.[1] || '').trim(),
  );
  return sides.every((v) => v !== '' && v !== 'auto');
}

/**
 * Замер по тексту CSS-правила, когда jsdom не раскладывает или падает на
 * битых селекторах в полном файле (000-base @keyframes и :is()).
 * @param {string} block
 */
export function measureFromDeclarations(block) {
  const display = String(/display\s*:\s*([^;]+)/i.exec(block)?.[1] || '').trim();
  const fills = fillsContainingBlockFromBlock(block);
  const spansWidth = fills || spansContainerWidthFromBlock(block);
  const rawWidth = Math.max(declaredAxisPx(block, 'width'), 0);
  const width = spansWidth ? Math.max(rawWidth, MIN_TOUCH_PX) : rawWidth;
  const rawHeight = declaredAxisPx(block, 'height');
  const minHeight = (() => {
    const m = /min-height\s*:\s*(\d+(?:\.\d+)?)px/i.exec(block);
    return m ? parsePx(m[1]) : 0;
  })();
  const height = fills
    ? Math.max(rawHeight, minHeight, MIN_TOUCH_PX)
    : Math.max(rawHeight, minHeight, rawHeight > 0 ? 0 : lineBoxHeightFromBlock(block));
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    minWidth: declaredAxisPx(block, 'width'),
    minHeight,
    display,
    visibility: 'visible',
    widthAssumed: spansWidth && rawWidth < MIN_TOUCH_PX,
    heightFromLineBox: rawHeight === 0 && height > 0,
    heightChecked: spansWidth && height > 0,
    fromDeclarations: true,
  };
}

/**
 * Минимальный CSS для замера одного правила: хост + его ::before/::after.
 * Полный файл не грузим — @keyframes и :is() в 000-base ломают nwsapi целиком.
 * @param {string} cssText
 * @param {string} selector
 * @param {string} hostBlock
 */
export function buildMeasurementStylesheet(cssText, selector, hostBlock) {
  const chunks = [`${selector} { ${hostBlock} }`];
  const cleaned = stripCssComments(cssText);
  for (const part of selector.split(',').map((s) => s.trim()).filter(Boolean)) {
    for (const pseudo of ['::after', '::before']) {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`${escaped}${pseudo}\\s*\\{([^}]*)\\}`, 'i');
      const m = cleaned.match(re);
      if (m) chunks.push(`${part}${pseudo} { ${m[1]} }`);
    }
  }
  return chunks.join('\n');
}

/**
 * Нижняя граница высоты строки: поля + рамки + одна строка текста. jsdom не
 * раскладывает, поэтому `height` и `min-height` — единственное, что он знает;
 * ряд с `padding: 16px` и текстом 13/1.4 читался нулевым и шёл в нарушения,
 * тогда как в браузере он 50 px. Считаем только то, что есть в computed:
 * контент шире одной строки эта оценка не видит и занижает, а не завышает.
 * @param {Record<string, string>} cs
 */
export function lineBoxHeightFloor(cs) {
  const pad = parsePx(cs.paddingTop) + parsePx(cs.paddingBottom);
  const border = parsePx(cs.borderTopWidth) + parsePx(cs.borderBottomWidth);
  // jsdom не наследует базовый кегль: у ряда без своего font-size computed
  // пуст, и строка текста считалась нулевой. Берём браузерный дефолт 16 px —
  // он выше реальных 12–13 в продукте, поэтому оценка идёт в запас, а не в
  // послабление: занизить высоту она может, завысить сверх одной строки — нет.
  const fontSize = parsePx(cs.fontSize) || 16;
  const lineHeightRaw = String(cs.lineHeight || '').trim();
  let line = parsePx(lineHeightRaw);
  if (/^[\d.]+$/.test(lineHeightRaw)) line = fontSize * Number.parseFloat(lineHeightRaw);
  if (!(line > 0)) line = fontSize > 0 ? fontSize * 1.2 : 0;
  if (!(pad > 0 || border > 0)) return 0;
  return pad + border + line;
}

/**
 * @param {Window} window
 * @param {string} className
 * @param {string|string[]} [wrapClass] один предок или цепочка от внешнего к внутреннему
 * @param {string} [tagOverride] тег цели, когда последний кусок селектора — голый тег
 */
export function measureElement(window, className, wrapClass, tagOverride) {
  const { document } = window;
  const chain = (Array.isArray(wrapClass) ? wrapClass : wrapClass ? [wrapClass] : []).filter(
    Boolean,
  );
  let host;
  let target;
  const tag = tagOverride || defaultTagForClass(className);
  target = document.createElement(tag);
  if (className) target.className = className;
  if (chain.length) {
    host = document.createElement('div');
    host.className = chain[0];
    let parent = host;
    for (const cls of chain.slice(1)) {
      const mid = document.createElement('div');
      mid.className = cls;
      parent.appendChild(mid);
      parent = mid;
    }
    parent.appendChild(target);
    document.body.appendChild(host);
  } else {
    document.body.appendChild(target);
  }
  if (tag === 'button' || tag === 'a') {
    target.textContent = 'Текст';
  } else if (tag === 'input') {
    target.setAttribute('value', '123');
  }
  const rect = target.getBoundingClientRect();
  const cs = window.getComputedStyle(target);
  if (cs.display === 'none' || cs.visibility === 'hidden') {
    if (host) host.remove();
    else target.remove();
    return { width: 0, height: 0, display: cs.display, visibility: cs.visibility };
  }
  const fills = fillsContainingBlock(cs);
  const spansWidth = fills || spansContainerWidth(cs);
  const rawWidth = visibleAxis(rect.width, cs.width, cs.minWidth);
  const width = spansWidth ? Math.max(rawWidth, MIN_TOUCH_PX) : rawWidth;
  const rawHeight = visibleAxis(rect.height, cs.height, cs.minHeight);
  const height = fills
    ? Math.max(rawHeight, MIN_TOUCH_PX)
    : Math.max(rawHeight, rawHeight > 0 ? 0 : lineBoxHeightFloor(cs));
  const result = {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    minWidth: parsePx(cs.minWidth),
    minHeight: parsePx(cs.minHeight),
    display: cs.display,
    visibility: cs.visibility,
    // Ряд во всю ширину: ширину не меряем (она ≥ viewport), высоту — да.
    widthAssumed: spansWidth && rawWidth < MIN_TOUCH_PX,
    heightFromLineBox: rawHeight === 0 && height > 0,
    heightChecked: spansWidth && height > 0,
    fromDeclarations: false,
  };
  if (host) host.remove();
  else target.remove();
  return result;
}

/**
 * @param {{ width: number, height: number, minWidth?: number, minHeight?: number, display?: string }} size
 */
export function isVisibleTouchOk(size) {
  const h = Math.max(size.height, size.minHeight || 0);
  const w = Math.max(size.width, size.minWidth || 0);
  if (h >= MIN_TOUCH_PX && w >= MIN_TOUCH_PX) return true;
  // Пилюля/inline CTA: контракт task63 — min-height видимый, ширина от контента.
  if (h >= MIN_TOUCH_PX && /inline-flex|inline-block/i.test(size.display || '')) {
    return true;
  }
  return false;
}

/**
 * @param {object} inventory
 */
function buildAttributionScope(inventory) {
  const attributed = {};
  const unknownViolations = [];
  for (const e of inventory.violations) {
    const z = e.zone || '(unknown)';
    attributed[z] = (attributed[z] || 0) + 1;
    if (!e.zone) unknownViolations.push(e);
  }
  const justifiedRemainder = (inventory.justifiedRemainder || []).length;
  return {
    zonesCovered: Object.keys(attributed).filter((z) => z !== '(unknown)').length,
    unknownViolations: unknownViolations.length,
    unknownViolationKeys: unknownViolations.map((e) => `${e.file}::${e.selector}`),
    heightChecked: inventory.counts.heightChecked,
    unmeasured: inventory.counts.unmeasured,
    justifiedRemainder,
    blindSpots: justifiedRemainder
      ? inventory.justifiedRemainder.map((r) => `${r.reason} (${r.count})`)
      : [
          'класс без CSS-правил в product styles — гейт не видит (пример: subscription banner pill до появления .readonly-banner-pill)',
        ],
  };
}

function loadPaletteCss() {
  const palette = path.join(MODULES, '002-ui-v4-palette-roles.css');
  return fs.readFileSync(palette, 'utf8');
}

function loadCssBundleForFile(filePath) {
  const palette = path.join(MODULES, '002-ui-v4-palette-roles.css');
  const parts = [fs.readFileSync(palette, 'utf8')];
  parts.push(fs.readFileSync(filePath, 'utf8'));
  const components = path.join(STYLES, 'heys-components.css');
  if (filePath !== components && fs.existsSync(components)) {
    parts.push(fs.readFileSync(components, 'utf8'));
  }
  return parts.join('\n');
}

function createMeasureWindow(cssText) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const style = window.document.createElement('style');
  style.textContent = `${cssText}\nbody{font-family:Figtree,sans-serif;margin:0}`;
  window.document.head.appendChild(style);
  window.document.documentElement.setAttribute('data-theme-id', 'sand');
  window.document.documentElement.setAttribute('data-palette', 'sand');
  return window;
}

/**
 * Замер с изолированным CSS (palette + одно правило). Полный файл не грузим:
 * @keyframes и :is() в 000-base ломают nwsapi для всего документа.
 */
function measureRuleIsolated(paletteCss, cssText, selector, hostBlock, className, ancestors, tag) {
  const isoCss = buildMeasurementStylesheet(cssText, selector, hostBlock);
  const window = createMeasureWindow(`${paletteCss}\n${isoCss}`);
  try {
    const size = measureElement(window, className, ancestors, tag);
    if (size.width === 0 && size.height === 0 && size.display !== 'none') {
      const decl = measureFromDeclarations(hostBlock);
      return {
        ...decl,
        heightChecked: spansContainerWidthFromBlock(hostBlock) && decl.height > 0,
      };
    }
    if (!size.heightChecked && spansContainerWidthFromBlock(hostBlock) && size.height > 0) {
      size.heightChecked = true;
    }
    return size;
  } catch {
    const decl = measureFromDeclarations(hostBlock);
    return {
      ...decl,
      heightChecked: spansContainerWidthFromBlock(hostBlock) && decl.height > 0,
    };
  } finally {
    window.close();
  }
}

/**
 * @param {object} [opts]
 * @returns {Promise<object>}
 */
export async function collectInventory(opts = {}) {
  const files = opts.files || listProductCssFiles();
  const cssByFile = new Map(files.map((f) => [f, fs.readFileSync(f, 'utf8')]));
  const paletteCss = loadPaletteCss();

  const seen = new Set();
  const entries = [];
  const heightChecked = [];
  const justifiedRemainder = [];
  const attribution = { bySelector: 0, byClass: 0, byFile: 0, unattributed: 0 };

  for (const file of files) {
    const base = path.basename(file);
    const cssText = cssByFile.get(file);
    const rules = parseCssRules(cssText);

    for (const rule of rules) {
      if (!isInteractiveBlock(rule.block)) continue;
      const selector = rule.selectors;
      const target = selectorTarget(selector);
      if (!target || (!target.className && !target.tag)) continue;
      const className = target.className || primaryClassFromSelector(selector);
      const key = `${base}::${selector}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let zone = resolveTouchZone(base, selector, className);
      if (!zone) {
        attribution.unattributed += 1;
        zone = null;
      } else if (SELECTOR_ZONE_RULES.some((r) => r.test(selector))) {
        attribution.bySelector += 1;
      } else if (
        className &&
        CLASS_ZONE_RULES.some((r) =>
          className.split(/\s+/).some((cls) => r.re.test(cls)),
        )
      ) {
        attribution.byClass += 1;
      } else if (FILE_ZONE_EXCLUSIVE[base]) {
        attribution.byFile += 1;
      }

      const exemption = matchesExemption(selector);
      const pseudoExpander = findPseudoExpander(cssText, selector, rule.block);
      const negMargin = hasNegativeMarginExpander(rule.block);

      const size = measureRuleIsolated(
        paletteCss,
        cssText,
        selector,
        rule.block,
        target.className,
        target.ancestors,
        target.tag,
      );

      const hidden = size.display === 'none' || size.visibility === 'hidden';
      let visW = size.width;
      let visH = size.height;
      if (!hidden) {
        visW = Math.max(
          visW,
          declaredAxisPx(rule.block, 'width'),
          mergedDeclaredAxisPx(cssText, selector, 'width'),
          size.minWidth || 0,
        );
        visH = Math.max(
          visH,
          declaredAxisPx(rule.block, 'height'),
          mergedDeclaredAxisPx(cssText, selector, 'height'),
          size.minHeight || 0,
        );
        if (visH === 0) {
          visH = Math.max(visH, lineBoxHeightFromBlock(rule.block));
        }
      }

      const effective = effectiveTouchSize(visW, visH, pseudoExpander);
      const effectiveHeight = Math.max(visH, effective.height, size.minHeight || 0);
      const effectiveWidth = Math.max(visW, effective.width, size.minWidth || 0);
      const pseudoPaddingOk =
        isVisibleTouchOk({ ...size, width: effective.width, height: effective.height })
        || (
          effectiveHeight >= MIN_TOUCH_PX
          && (effectiveWidth >= MIN_TOUCH_PX || size.heightChecked || size.widthAssumed)
        );
      const visibleOk = isVisibleTouchOk(size) || pseudoPaddingOk;
      const isUnmeasured =
        !hidden &&
        !size.fromDeclarations &&
        size.width === 0 &&
        size.height === 0 &&
        visW === 0 &&
        visH === 0;

      const tricks = [];
      if (pseudoExpander) {
        tricks.push(pseudoPaddingOk ? 'pseudo-padding-expander' : 'invisible-pseudo-hit-area');
      }
      if (negMargin) tricks.push('negative-margin-expander');

      let bucket = 'violation';
      if (exemption) bucket = 'named-exception';
      else if (isUnmeasured) bucket = 'unmeasured';
      else if (negMargin) bucket = 'violation';
      else if (visibleOk) bucket = 'pass';

      if (bucket === 'pass') {
        if (size.heightChecked && effectiveHeight >= MIN_TOUCH_PX) {
          heightChecked.push({
            file: base,
            selector,
            className,
            zone,
            height: effectiveHeight,
            fromDeclarations: !!size.fromDeclarations,
            heightFromLineBox: !!size.heightFromLineBox,
          });
        }
        continue;
      }

      if (bucket === 'unmeasured') {
        entries.push({
          file: base,
          selector,
          className,
          zone,
          width: size.width,
          height: size.height,
          bucket,
          exemptionType: null,
          exemptionReason: null,
          tricks,
        });
        continue;
      }

      entries.push({
        file: base,
        selector,
        className,
        zone,
        width: size.width,
        height: size.height,
        bucket,
        exemptionType: exemption?.type || null,
        exemptionReason: exemption?.reason || null,
        tricks,
      });
    }
  }

  const violations = entries.filter((e) => e.bucket === 'violation');
  const exceptions = entries.filter((e) => e.bucket === 'named-exception');
  const unmeasured = entries.filter((e) => e.bucket === 'unmeasured');
  const byZone = {};
  for (const e of [...violations, ...exceptions]) {
    const z = e.zone || '(unknown)';
    byZone[z] = byZone[z] || { violations: 0, exceptions: 0 };
    if (e.bucket === 'violation') byZone[z].violations += 1;
    else byZone[z].exceptions += 1;
  }

  const byFile = {};
  for (const v of violations) {
    byFile[v.file] = (byFile[v.file] || 0) + 1;
  }

  const inventory = {
    captured: new Date().toISOString().slice(0, 10),
    minTouchPx: MIN_TOUCH_PX,
    scannedFiles: files.map((f) => path.basename(f)),
    counts: {
      violations: violations.length,
      exceptions: exceptions.length,
      unmeasured: unmeasured.length,
      heightChecked: heightChecked.length,
      interactiveRules: seen.size,
    },
    attribution,
    scope: buildAttributionScope({ violations, counts: { unmeasured: unmeasured.length, heightChecked: heightChecked.length }, justifiedRemainder }),
    byZone,
    byFile,
    violations,
    exceptions,
    unmeasured,
    heightChecked,
    justifiedRemainder,
  };
  return inventory;
}

/**
 * @param {object} inventory
 * @param {object} baseline
 */
export function compareRatchet(inventory, baseline) {
  const current = inventory.counts.violations;
  const frozen = baseline?.totalViolations ?? 0;
  const frozenUnknown = baseline?.unknownViolations ?? 0;
  const currentUnknown = inventory.scope?.unknownViolations ?? 0;
  const newKeys = [];
  const baselineKeys = new Set(baseline?.violationKeys || []);
  for (const v of inventory.violations) {
    const key = `${v.file}::${v.selector}`;
    if (!baselineKeys.has(key)) newKeys.push(key);
  }
  const fixed = baselineKeys.size
    ? [...baselineKeys].filter(
        (k) => !inventory.violations.some((v) => `${v.file}::${v.selector}` === k),
      )
    : [];

  return {
    current,
    baseline: frozen,
    delta: current - frozen,
    unknownCurrent: currentUnknown,
    unknownBaseline: frozenUnknown,
    unknownDelta: currentUnknown - frozenUnknown,
    newKeys,
    fixed,
    fail: current > frozen || newKeys.length > 0 || currentUnknown > frozenUnknown,
  };
}

function violationKeys(inventory) {
  return inventory.violations.map((v) => `${v.file}::${v.selector}`).sort();
}

function writeJson(target, data) {
  fs.writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function printSummary(inventory) {
  console.log(
    `Touch-target inventory: ${inventory.counts.violations} violations, ` +
      `${inventory.counts.unmeasured} не измерено (jsdom 0×0), ` +
      `${inventory.counts.exceptions} named exceptions, ` +
      `${inventory.counts.heightChecked} проверены по высоте (full-row), ` +
      `${inventory.scannedFiles.length} CSS files.`,
  );
  const scope = inventory.scope;
  console.log(
    `Атрибуция: селектор ${inventory.attribution.bySelector}, класс ${inventory.attribution.byClass}, ` +
      `файл ${inventory.attribution.byFile}, без зоны ${inventory.attribution.unattributed}. ` +
      `Зон с нарушениями: ${scope.zonesCovered}, неприписанных нарушений: ${scope.unknownViolations}.`,
  );
  if (scope.justifiedRemainder) {
    console.log(`Обоснованный остаток непроверенного: ${scope.justifiedRemainder}.`);
  }
  for (const note of scope.blindSpots) console.log(`  · ${note}`);
  const zones = Object.entries(inventory.byZone).sort((a, b) => b[1].violations - a[1].violations);
  console.log('By zone (violations / exceptions):');
  for (const [zone, c] of zones.slice(0, 15)) {
    console.log(`  ${zone}: ${c.violations} / ${c.exceptions}`);
  }
  if (zones.length > 15) console.log(`  … +${zones.length - 15} zones`);
}

async function main() {
  const inventory = await collectInventory();

  if (wantInventory || (!wantCheck && !updateBaseline)) {
    writeJson(INVENTORY_PATH, inventory);
    if (asJson) {
      console.log(JSON.stringify(inventory, null, 2));
    } else {
      printSummary(inventory);
      console.log(`Inventory → ${path.relative(ROOT, INVENTORY_PATH)}`);
    }
  }

  if (updateBaseline) {
    const byZone = {};
    for (const [zone, counts] of Object.entries(inventory.byZone)) {
      if (zone === '(unknown)') continue;
      byZone[zone] = counts.violations;
    }
    const baseline = {
      captured: inventory.captured,
      totalViolations: inventory.counts.violations,
      unknownViolations: inventory.scope.unknownViolations,
      byZone,
      byFile: inventory.byFile,
      violationKeys: violationKeys(inventory),
    };
    writeJson(BASELINE_PATH, baseline);
    console.log(
      `Baseline updated: ${baseline.totalViolations} violations, ` +
        `${baseline.unknownViolations} unknown, ${Object.keys(byZone).length} zones, ` +
        `${baseline.violationKeys.length} keys → ${path.relative(ROOT, BASELINE_PATH)}`,
    );
    return;
  }

  if (wantCheck) {
    let baseline = { totalViolations: 0, violationKeys: [] };
    if (fs.existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
    }
    const ratchet = compareRatchet(inventory, baseline);
    if (asJson) {
      console.log(JSON.stringify({ inventory: inventory.counts, ratchet }, null, 2));
    } else {
      console.log(
        `Ratchet: ${ratchet.current} violations (baseline ${ratchet.baseline}, Δ ${ratchet.delta >= 0 ? '+' : ''}${ratchet.delta})`,
      );
      console.log(`Не измерено (jsdom 0×0): ${inventory.counts.unmeasured}`);
      console.log(`Проверены по высоте (full-row, ширина не меряется): ${inventory.counts.heightChecked}`);
      if (inventory.scope.justifiedRemainder) {
        console.log(`Обоснованный остаток: ${inventory.scope.justifiedRemainder}`);
      }
      console.log(
        `Неприписанные нарушения (атрибуция): ${inventory.scope.unknownViolations} ` +
          `(baseline ${ratchet.unknownBaseline}, Δ ${ratchet.unknownDelta >= 0 ? '+' : ''}${ratchet.unknownDelta}).`,
      );
      if (inventory.scope.unknownViolations) {
        for (const k of inventory.scope.unknownViolationKeys.slice(0, 15)) {
          console.error(`  ? ${k}`);
        }
        if (inventory.scope.unknownViolationKeys.length > 15) {
          console.error(`  … +${inventory.scope.unknownViolationKeys.length - 15}`);
        }
      }
      if (ratchet.newKeys.length) {
        console.error(`❌ Новые нарушения (${ratchet.newKeys.length}):`);
        for (const k of ratchet.newKeys.slice(0, 20)) console.error(`  ${k}`);
        if (ratchet.newKeys.length > 20) console.error(`  … +${ratchet.newKeys.length - 20}`);
      }
      if (ratchet.fixed.length) {
        console.log(`Исправлено с baseline (${ratchet.fixed.length}) — обновите baseline:`);
        for (const k of ratchet.fixed.slice(0, 10)) console.log(`  − ${k}`);
      }
    }
    if (ratchet.fail) process.exitCode = 1;
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
