/**
 * Task 145 + 167 — designer RISK filters for divergence «≠» rows.
 * Lane 1 / bulk exclusion share these three (+ kegl <12) designer questions:
 * - action / flow
 * - text contrast 4.5
 * - tap target below 44 px
 */

function scorePatterns(text, patterns) {
  let score = 0;
  for (const re of patterns) {
    if (re.test(text)) score += 1;
  }
  return score;
}

/** Extract font-size px values from typography clauses (not bare layout px). */
export function extractFontSizes(text) {
  const sizes = new Set();
  for (const m of text.matchAll(/(?:font|шрифт)[^;|]{0,120}?(\d+(?:\.\d+)?)\s*px/gi)) {
    sizes.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*px\/[\d.]/g)) {
    sizes.add(parseFloat(m[1]));
  }
  return [...sizes];
}

export function extractHeights(text) {
  const heights = new Set();
  for (const m of text.matchAll(/(?:min-)?height:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    heights.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/(?:^|[\s;«])высот[аыуе]\s+(\d+(?:\.\d+)?)\s*px/gi)) {
    heights.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/(?:^|[\s;«])высота\s+от\s+(\d+(?:\.\d+)?)\s*px/gi)) {
    heights.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/min-height:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    heights.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/\b(\d{2})\s*×\d+\s*px\b/g)) {
    heights.add(parseFloat(m[1]));
  }
  return [...heights];
}

export function extractSquareMins(text) {
  const mins = new Set();
  for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)\s*px\b/gi)) {
    mins.add(Math.min(parseFloat(m[1]), parseFloat(m[2])));
  }
  for (const m of text.matchAll(/\b(\d+(?:\.\d+)?)×(\d+(?:\.\d+)?)\b/g)) {
    mins.add(Math.min(parseFloat(m[1]), parseFloat(m[2])));
  }
  return [...mins];
}

const TON_TEXT_INK = [
  /\bцвет\s+(?:var\(--(?:tx|gr|ac2?|val)|rgba\(var\(--ink\))/i,
  /шрифт\s+\d+\s+(\d+(?:\.\d+)?)\s*px[^;|]*,\s*цвет/i,
  /,\s*цвет\s+rgba\(var\(--ink\)/i,
  /состояние:\s*цвет/i,
  /--v4-ink(?:-\d+)?\b/i,
  /\b--tx\b/i,
  /чернил(?:ами)?\s+\d+\s*%/i,
  /тоном\s+(?:чернил|--tx|--gr\b|--ac2?\b|--val)/i,
  /цветом\s+--(?:tx|gr|ac|val)/i,
  /\bink-\d\b/i,
  /моноцифр[^;|]{0,60}цвет/i,
  /(?:заголовок|подпись|текст|кикер|badge|бейдж|состояние)[^;|]{0,100}чернил/i,
  /(?:заголовок|подпись|кикер)[^;|]{0,80}цвет/i,
  /\d+(?:\.\d+)?\s*px\/[\d.]+[^;|]{0,40}чернил/i,
];

const TON_NON_TEXT = [
  /^\s*(?:фон|заливк|радиус|поля\s|padding|margin|флекс|направление|выравнивание)\b/i,
  /\bфон\s+var\(--/i,
  /\bзаливк[аи]\s+var\(--/i,
  /--v4-(?:surface|sand|c1|c2|hero)\b/i,
  /--c[12]\b/,
  /--gr-bg\b/,
  /\bscrim\b/i,
  /\bобводк/i,
  /\bborder(?:-color)?\b/i,
  /\binset\s+0/i,
  /\bполе\s+рисунка\b/i,
  /\bviewBox\b/i,
  /\bstroke\b/i,
  /\bлиния\s+var\(--/i,
  /\bтень\b/i,
  /\bbox-shadow\b/i,
];

const HEIGHT_INTERACTIVE = [
  /\bкнопк/i,
  /\bbutton\b/i,
  /\bchip\b/i,
  /\bчип/i,
  /\bicon-?btn/i,
  /\bCTA\b/i,
  /\bзакрыть/i,
  /\bтап/i,
  /\btouch\s*target/i,
  /\bзон[аы]\s+нажати/i,
  /\bтач-цел/i,
  /\bkeypad\b/i,
  /\bклавиш/i,
  /\bклетк/i,
  /\bPIN\b/,
  /\bполе\s+ввода/i,
  /\bпилюл/i,
  /\bmin-height:\s*\d/i,
  /\bвысот[аыу].*(?:кнопк|клетк|pin|keypad|чип|cta|icon|тап|цел)/i,
  /\b44\s*px\b.*(?:кнопк|клетк|pin|keypad|чип|cta|icon)/i,
  /\bстрока\s+списка\b/i,
  /\bвторичн(?:ая|ую)\s+кнопк/i,
  /\b«[^»]+»\s*—\s*высот/i,
  /\bкружк/i,
  /\bстрелк/i,
  /\bФАБ\b/i,
  /\bfab\b/i,
];

const HEIGHT_NON_TARGET = [
  /^\s*(?:зазор|отступ\s+сверху|margin-top|padding|поля|направление|выравнивание|распределение)\b/i,
  /\bполе\s+рисунка\b/i,
  /\bviewBox\b/i,
  /\bslider-fill\b/i,
  /\bрисунок\s+\d+/i,
  /\bкарточк[аи].*высот/i,
  /\bблок\b.*высот/i,
  /\bсекци/i,
  /\bmargin-top:\s*\d/i,
  /\bотступ\s+сверху\s+\d/i,
  /\bзазор\s+\d/i,
  /\bgap:\s*\d/i,
  /\bлиния\s+1\s*px/i,
];

const ACTION_PATTERNS = [
  /\bлогик/i,
  /\bповеден/i,
  /\bнавигац/i,
  /\bflow\b/i,
  /\bанимац/i,
  /\bдвижен/i,
  /\bprefers-reduced-motion\b/i,
  /\bтекст[аы]?\s+на\s+экране/i,
  /\bслова\s+на\s+экране/i,
  /\bкопир/i,
  /\bфункционал\b/i,
  /\bне\s+реализован/i,
  /\bнет\s+в\s+продукте/i,
  /\b0\s+вхождени/i,
  /\bсостав\s+листа\b/i,
  /\bпорядок\b/i,
  /\bиконк/i,
  /\bemoji\b/i,
  /\bэмодзи\b/i,
  /\bструктур/i,
  /\bколесо\b/i,
  /\btimepicker\b/i,
  /\bшаг\b/i,
];

const COSMETIC_LAYOUT_PATTERNS = [
  /\bширин[аыу]\b/i,
  /\bwidth\b/i,
  /\bborder-radius\b/i,
  /\bradius\b/i,
  /\bрадиус\b/i,
  /\bmargin-top\b/i,
  /\bmargin-bottom\b/i,
  /\bgap\b/i,
  /\bзазор\b/i,
  /\bотступ\b/i,
  /\bpadding-top\b/i,
  /\bpadding-bottom\b/i,
  /\bпаддинг/i,
  /\bполя\b/i,
];

/** Task 145/167 — text ink contrast risk only (designer Q: контраст 4,5). */
export function passesTonRisk(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;

  if (/\b(рисунок|viewBox|поле\s+рисунка)\b/i.test(text)) return false;
  if (/\bне\s+цвет\b/i.test(code) || /\bне\s+тоном\b/i.test(code)) return false;

  const canvasTrim = canvas.trim();
  const surfaceOnly =
    TON_NON_TEXT.some((re) => re.test(canvasTrim)) &&
    !TON_TEXT_INK.some((re) => re.test(canvasTrim));
  if (surfaceOnly && !TON_TEXT_INK.some((re) => re.test(code))) return false;

  if (!TON_TEXT_INK.some((re) => re.test(text))) return false;

  if (
    /\bиконк/i.test(key) &&
    /\bзаливк/i.test(canvas) &&
    !/шрифт|подпись|текст|цвет\s+rgba\(var\(--ink\)/i.test(text)
  ) {
    return false;
  }

  return true;
}

function interactiveTargetSizes(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;
  const heights = [...extractHeights(canvas), ...extractHeights(code)];
  const squares = [...extractSquareMins(canvas), ...extractSquareMins(code)];
  return [...heights, ...squares].filter((n) => Number.isFinite(n) && n > 0);
}

/** Task 167 — sub-44 px tap target risk (designer Q: цель 44). */
export function passesHeightRisk(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;
  const canvasTrim = canvas.trim();

  if (HEIGHT_NON_TARGET.some((re) => re.test(canvasTrim)) && !HEIGHT_INTERACTIVE.some((re) => re.test(text))) {
    return false;
  }
  if (/\b(рисунок|viewBox|поле\s+рисунка|slider-fill)\b/i.test(text)) return false;

  const interactive = HEIGHT_INTERACTIVE.some((re) => re.test(text));
  if (!interactive) return false;

  const sizes = interactiveTargetSizes(entry);
  if (sizes.some((h) => h < 44)) return true;

  const contract44 = /\b44\s*px\b/i.test(canvas);
  const codeSizes = [...extractHeights(code), ...extractSquareMins(code)].filter((n) => n > 0);
  if (contract44 && codeSizes.some((h) => h < 44)) return true;

  if (/\bтач-цел/i.test(key) || /\bтач-цел/i.test(text)) {
    if (/\b(?:было|→|поднят|ниже\s+44|мимо\s+тач|видим\w*\s+размер)/i.test(text)) return true;
  }

  return false;
}

/** Task 145/167 — below 12px minimum or crosses 12 boundary. */
export function passesKeglRisk(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;

  const canvasSizes = extractFontSizes(`${key} ${canvas}`);
  const codeSizes = extractFontSizes(code);
  const allSizes = extractFontSizes(text);

  if (allSizes.length === 0) return false;

  if (allSizes.some((s) => s < 12)) return true;

  if (canvasSizes.length && codeSizes.length) {
    for (const c of canvasSizes) {
      for (const p of codeSizes) {
        if ((c < 12 && p >= 12) || (c >= 12 && p < 12)) return true;
      }
    }
  }

  return false;
}

/** Task 167 — behavior / flow discrepancies (designer Q: действие). */
export function passesActionRisk(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;

  if (/\bтекст\b/i.test(key) && !/\b(?:цвет|тон|кегл|font|шрифт)/i.test(key)) return true;
  if (/\b(?:не\s+реализован|нет\s+в\s+продукте|0\s+вхожден)/i.test(code)) return true;

  const actionScore = scorePatterns(text, ACTION_PATTERNS);
  const cosmeticScore = scorePatterns(text, COSMETIC_LAYOUT_PATTERNS);

  if (actionScore >= 3) return true;
  if (actionScore >= 2 && cosmeticScore < 2) return true;
  if (actionScore >= 1 && /\b(?:поведен|логик|навигац|flow|копир|функционал|состав|порядок)/i.test(code)) {
    return true;
  }

  return false;
}

/** Combined designer-risk gate for bulk exclusion (task 167). */
export function assessDesignerRisk(entry) {
  if (passesActionRisk(entry)) return 'risk-action';
  if (passesTonRisk(entry)) return 'risk-contrast';
  if (passesHeightRisk(entry)) return 'risk-sub44';
  if (passesKeglRisk(entry)) return 'risk-kegl';
  return null;
}

export const NARROW_PASS = {
  ton: passesTonRisk,
  height: passesHeightRisk,
  kegl: passesKeglRisk,
};
