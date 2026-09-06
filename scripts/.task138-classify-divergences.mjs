#!/usr/bin/env node
/**
 * Task 138 + 145 — classify «≠» verdicts, then narrow TON / HEIGHT / KEGL by designer RISK.
 * Regenerates docs/ui/DIVERGENCE_{TON,HEIGHT,KEGL,GENERAL}_FOR_DESIGNER.md
 *
 * Task 145 narrow rules (borderline method):
 * - TON: text ink only — canvas/code must name typography color (--tx, --ink, «состояние: цвет» on copy).
 *   Surface/bg/border/scrim/chart rows demote to general even if broad classifier said TON.
 * - HEIGHT: interactive 42–44px band or contract 44 vs code within ~2px; margins/gaps/cards/charts demote.
 * - KEGL: any font-size < 12px or dispute crosses 12 (e.g. 11 vs 12); 12.5 vs 13 stays in general.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

const OUT = {
  ton: path.join(ROOT, 'docs/ui/DIVERGENCE_TON_FOR_DESIGNER.md'),
  height: path.join(ROOT, 'docs/ui/DIVERGENCE_HEIGHT_FOR_DESIGNER.md'),
  kegl: path.join(ROOT, 'docs/ui/DIVERGENCE_KEGL_FOR_DESIGNER.md'),
  general: path.join(ROOT, 'docs/ui/DIVERGENCE_GENERAL_FOR_DESIGNER.md'),
};

const WAS_IN_LABEL = {
  ton: 'ТОН',
  height: 'ВЫСОТА',
  kegl: 'КЕГЛЬ',
  outside: 'вне трёх',
};

function contractRows(html, contractOnly) {
  let slice = html;
  if (contractOnly) {
    const m = html.match(
      /<div class="ctr" data-contract="[^"]+">([\s\S]*?)<\/div>\s*\n\s*<div class="(?:pl|secH)/,
    );
    if (!m) return [];
    slice = m[1];
  }
  const rows = [];
  for (const m of slice.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    rows.push({ key: m[1], value: m[2] });
  }
  return rows;
}

function loadCanvasMap(canvasFile) {
  const file = path.join(PACK, canvasFile);
  if (!fs.existsSync(file)) return new Map();
  const html = fs.readFileSync(file, 'utf8');
  const map = new Map();
  for (const row of contractRows(html, false)) {
    map.set(row.key, row.value);
  }
  return map;
}

function escCell(s) {
  return String(s ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function extractProductSide(fact) {
  if (!fact) return '';
  // Common pattern: "code …; кадр …" or "продукт … канвас …"
  const parts = fact.split(/;\s*(?=кадр|контракт|строка «|в канвасе|по кадру)/i);
  const head = parts[0]?.trim() || fact.trim();
  // Drop leading file paths if there's a clearer product clause after
  if (parts.length > 1 && head.length > 120) {
    return `${head.slice(0, 100)}… · ${parts.slice(1).join('; ').trim()}`.slice(0, 400);
  }
  return fact.trim().slice(0, 400);
}

const TON_PATTERNS = [
  /\bцвет\b/i,
  /\bтон\b/i,
  /\bфон\b/i,
  /\bзаливк/i,
  /\bbackground\b/i,
  /\bborder-color\b/i,
  /\bbox-shadow\b/i,
  /\bградиент/i,
  /\bgradient/i,
  /\bopacity\b/i,
  /\bпрозрачност/i,
  /\bполутон/i,
  /\bмаск[аи]\b/i,
  /\bcurrentColor\b/,
  /\brgba?\(/i,
  /\bhsla?\(/i,
  /#[0-9a-f]{3,8}\b/i,
  /--v4-(ink|surface|act|scrim|sand|hero|c\d)/i,
  /--c[12]\b/,
  /--scrim\b/,
  /--gr\d\b/,
  /\bvar\(--[a-z0-9-]*(?:ink|surface|scrim|act|color|c\d|gr\d)/i,
  /\bрол[ьи]\s+(чернил|поверхност|акцент|scrim)/i,
  /\bink-\d\b/i,
  /\bне\s+цвет/i,
  /\bцветом\b/i,
  /\bобводк[аи].*?(?:цвет|тон|rgba|#)/i,
  /\bзатемнен/i,
  /\bscrim\b/i,
];

const HEIGHT_PATTERNS = [
  /\bвысот[аыуе]\b/i,
  /\bheight\b/i,
  /\bmin-height\b/i,
  /\bmax-height\b/i,
  /\bpadding-top\b/i,
  /\bpadding-bottom\b/i,
  /\bpadding:\s*\d[^;]*\d/i,
  /\bmargin-top\b/i,
  /\bmargin-bottom\b/i,
  /\bвертикальн/i,
  /\bзазор\b/i,
  /\bgap\b/i,
  /\b44\s*px\b/i,
  /\bзон[аы]\s+нажати/i,
  /\btouch\s*target/i,
  /\bдиаметр\b/i,
  /\bдиск\s+\d+\s*px/i,
  /\bполе\s+рисунка\s+\d+×\d+/i,
  /\b\d+×\d+\s*px\b/i,
  /\bslider-fill\s+height/i,
  /\brow-height\b/i,
  /\bстрок[аи].*высот/i,
  /\bmin-h\b/i,
  /\bпаддинг/i,
  /\bотступ\s+(сверху|снизу|вертик)/i,
];

const KEGL_PATTERNS = [
  /\bкегл/i,
  /\bfont-size\b/i,
  /\bfont:\s*[^;]*\d+(?:\.\d+)?px/i,
  /\bfont:\s*\d{3}\s+\d+(?:\.\d+)?px/i,
  /\bразмер\s+шрифт/i,
  /\bтипографик/i,
  /\bletter-spacing\b/i,
  /\bразрядк/i,
  /\b\/\s*1(?:\.\d+)?\s*(?:;|$)/, // line-height shorthand tied to font block
  /\b\d+(?:\.\d+)?px\/\d/i,
  /\b(?:^|[\s;])(9|10|11(?:\.\d+)?|12(?:\.\d+)?|13(?:\.\d+)?|14(?:\.\d+)?|15(?:\.\d+)?|16(?:\.\d+)?|17(?:\.\d+)?|18(?:\.\d+)?)px\b/,
  /\bfont-weight\b.*\d+px/i,
  /\bначертани/i,
  /\bкегл[ья]\b/i,
];

const OUTSIDE_PATTERNS = [
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
  /\bширин[аыу]\b/i,
  /\bwidth\b/i,
  /\bpadding-left\b/i,
  /\bpadding-right\b/i,
  /\bmargin-left\b/i,
  /\bmargin-right\b/i,
  /\bborder-radius\b/i,
  /\bradius\b/i,
  /\bрадиус\b/i,
  /\bсостав\s+листа\b/i,
  /\bпорядок\b/i,
  /\bиконк/i,
  /\bemoji\b/i,
  /\bэмодзи\b/i,
  /\bblur\s*\(/i,
  /\bструктур/i,
  /\bколесо\b/i,
  /\btimepicker\b/i,
  /\bшаг\b/i,
];

function scorePatterns(text, patterns) {
  let score = 0;
  for (const re of patterns) {
    if (re.test(text)) score += 1;
  }
  return score;
}

function classifyRow(key, canvasValue, fact) {
  const combined = `${key} ${canvasValue} ${fact}`;
  const lower = combined.toLowerCase();

  // Explicit negations in fact that say "not color" → suppress TON
  const notColor = /\bне\s+цвет\b/i.test(fact) || /\b3\)\s*не\s+цвет/i.test(fact);

  let ton = scorePatterns(combined, TON_PATTERNS);
  let height = scorePatterns(combined, HEIGHT_PATTERNS);
  let kegl = scorePatterns(combined, KEGL_PATTERNS);
  let outside = scorePatterns(combined, OUTSIDE_PATTERNS);

  if (notColor) ton = Math.max(0, ton - 3);

  // Key-level boosts
  if (/\bвысот/i.test(key)) height += 3;
  if (/\bкегл|font|типограф|шрифт/i.test(key)) kegl += 3;
  if (/шкала\s+кеглей/i.test(key)) kegl += 10;
  if (/\bцвет|тон|фон|палитр/i.test(key)) ton += 3;

  // Chart/SVG whole-canvas geometry — outside (not pure vertical/color/type)
  if (
    /\bрисунок\s+\d+/i.test(key)
    && (/W=\d+\s+H=\d+|viewBox|ReportsV4/i.test(fact) || /поле\s+рисунка/i.test(canvasValue))
  ) {
    outside += 8;
  }

  // Canvas value property hints
  if (/^\s*height\s*[:=]/i.test(canvasValue) || /\bвысота\s+\d/i.test(canvasValue)) height += 4;
  if (/font-size|font:\s*\d|кегль|\d+px\/\d/i.test(canvasValue)) kegl += 4;
  if (/фон|цвет|тон|rgba|#|var\(--(?:v4-)?(?:ink|surface|c\d|gr)/i.test(canvasValue)) ton += 4;

  // Fact dominance: explicit "кадр X px vs code Y px" for font
  const fontMismatch = fact.match(/font[^;]*?(\d+(?:\.\d+)?)px[^;]*;\s*кадр[^;]*?(\d+(?:\.\d+)?)px/i);
  if (fontMismatch) {
    kegl += 5;
    height -= 1;
  }

  const heightMismatch = fact.match(/height:\s*(\d+(?:\.\d+)?)px[^;]*;\s*кадр[^;]*?height:\s*(\d+(?:\.\d+)?)px/i);
  if (heightMismatch) height += 5;

  // Diameter / square field without color emphasis → height
  if (/\bдиск\s+\d+\s*px\b/i.test(fact) && !/\bцвет|тон|обводк|прозрачност/i.test(fact)) height += 6;
  if (
    /\bполе\s+рисунка\s+\d+×\d+/i.test(fact)
    && !/\bцвет|тон|заливк|stroke|var\(--/i.test(fact)
    && !/W=\d+\s+H=\d+/i.test(fact)
  ) {
    height += 5;
  }

  // Color explicit in fact vs geometry
  if (/\b(?:тоном|цветом|фоном|заливк|обводк).*?(?:≠|не\s+совпада|вместо|а\s+не)/i.test(fact)) ton += 4;

  // Animation / motion → outside
  if (/\b(prefers-reduced-motion|анимац|враща|дыхан)/i.test(fact)) outside += 5;

  // Copy / missing text → outside
  if (/\b(текст|слова|копир|0\s+вхожден)/i.test(key) || /\bнет\s+в\s+продукте\b/i.test(fact)) outside += 4;

  // border-radius alone
  if (/\b(border-radius|radius\s+\d|радиус\s+\d)/i.test(fact) && ton === 0 && kegl === 0 && height === 0) outside += 3;

  // width-only
  if (/\bширин/i.test(fact) && !/\bвысот/i.test(fact) && height < 2) outside += 3;

  const scores = { ton, height, kegl, outside };
  const max = Math.max(ton, height, kegl, outside);

  if (max === 0) return { bucket: 'outside', scores, reason: 'no signal' };

  // If outside wins clearly and visual scores are weak
  if (outside >= max && outside >= 4 && ton < 3 && height < 3 && kegl < 3) {
    return { bucket: 'outside', scores, reason: 'logic/layout/copy' };
  }

  const visualMax = Math.max(ton, height, kegl);
  if (visualMax === 0) return { bucket: 'outside', scores, reason: 'non-visual' };

  // Pick dominant visual bucket; ties: font > height > ton (kegl most user-visible for text)
  if (kegl >= height && kegl >= ton && kegl === visualMax) {
    return { bucket: 'kegl', scores, reason: 'font-dominant' };
  }
  if (height >= ton && height >= kegl && height === visualMax) {
    return { bucket: 'height', scores, reason: 'height-dominant' };
  }
  if (ton === visualMax) {
    return { bucket: 'ton', scores, reason: 'color-dominant' };
  }

  // Tie-break among equals — prefer kegl > height > ton for mixed typography+spacing facts
  if (kegl === height && kegl === visualMax) {
    if (fontMismatch) return { bucket: 'kegl', scores, reason: 'tie-font' };
    return { bucket: 'height', scores, reason: 'tie-height' };
  }
  if (ton === height && ton === visualMax) {
    if (/\bфон|цвет|тон\b/i.test(fact)) return { bucket: 'ton', scores, reason: 'tie-color' };
    return { bucket: 'height', scores, reason: 'tie-geom' };
  }
  if (kegl === ton && kegl === visualMax) {
    if (/\d+(?:\.\d+)?px/.test(fact) && /font/i.test(fact)) return { bucket: 'kegl', scores, reason: 'tie-kegl-font' };
    return { bucket: 'ton', scores, reason: 'tie-ton' };
  }

  return { bucket: 'outside', scores, reason: 'ambiguous' };
}

/** Extract font-size px values from typography clauses (not bare layout px). */
function extractFontSizes(text) {
  const sizes = new Set();
  for (const m of text.matchAll(/(?:font|шрифт)[^;|]{0,120}?(\d+(?:\.\d+)?)\s*px/gi)) {
    sizes.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*px\/[\d.]/g)) {
    sizes.add(parseFloat(m[1]));
  }
  return [...sizes];
}

function extractHeights(text) {
  const heights = new Set();
  for (const m of text.matchAll(/(?:min-)?height:\s*(\d+(?:\.\d+)?)\s*px/gi)) {
    heights.add(parseFloat(m[1]));
  }
  for (const m of text.matchAll(/высот[аыуе]\s+(\d+(?:\.\d+)?)\s*px/gi)) {
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
  /\bkeypad\b/i,
  /\bклавиш/i,
  /\bPIN\b/,
  /\bполе\s+ввода/i,
  /\bпилюл/i,
  /\bmin-height:\s*4[0-6]\s*px/i,
  /\bвысот[аыу].*от\s+44\s*px/i,
  /\b44\s*px\b.*(?:кнопк|клетк|pin|keypad|чип|cta|icon)/i,
  /\bстрока\s+списка\b/i,
  /\bвторичн(?:ая|ую)\s+кнопк/i,
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
];

/** Task 145 — text ink contrast risk only. */
function passesTonRisk(entry) {
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

  // Icon/decorative fill without typography clause
  if (/\bиконк/i.test(key) && /\bзаливк/i.test(canvas) && !/шрифт|подпись|текст|цвет\s+rgba\(var\(--ink\)/i.test(text)) {
    return false;
  }

  return true;
}

/** Task 145 — sub-44px tap target risk only. */
function passesHeightRisk(entry) {
  const { key, canvas, code } = entry;
  const text = `${key} ${canvas} ${code}`;
  const canvasTrim = canvas.trim();

  if (HEIGHT_NON_TARGET.some((re) => re.test(canvasTrim)) && !HEIGHT_INTERACTIVE.some((re) => re.test(text))) {
    return false;
  }
  if (/\b(рисунок|viewBox|поле\s+рисунка|slider-fill)\b/i.test(text)) return false;

  const interactive = HEIGHT_INTERACTIVE.some((re) => re.test(text));
  if (!interactive) return false;

  const heights = [...extractHeights(canvas), ...extractHeights(code)];
  const inBand = heights.some((h) => h >= 42 && h <= 44);
  const contract44 = /\b44\s*px\b/i.test(text);
  const nearMiss =
    heights.length >= 2 &&
    heights.some((h) => h >= 42 && h <= 44) &&
    heights.some((h) => h >= 40 && h <= 46) &&
    Math.max(...heights) - Math.min(...heights) <= 3;

  if (inBand) return true;
  if (contract44 && nearMiss) return true;
  if (contract44 && heights.some((h) => h >= 40 && h <= 46)) return true;

  return false;
}

/** Task 145 — below 12px minimum or crosses 12 boundary. */
function passesKeglRisk(entry) {
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

const NARROW_PASS = {
  ton: passesTonRisk,
  height: passesHeightRisk,
  kegl: passesKeglRisk,
};

function narrowBuckets(broad) {
  const narrowed = { ton: [], height: [], kegl: [] };
  const general = [];

  for (const name of ['ton', 'height', 'kegl']) {
    for (const entry of broad[name]) {
      if (NARROW_PASS[name](entry)) {
        narrowed[name].push(entry);
      } else {
        general.push({ ...entry, wasIn: WAS_IN_LABEL[name] });
      }
    }
  }

  for (const entry of broad.outside) {
    general.push({ ...entry, wasIn: WAS_IN_LABEL.outside });
  }

  return { narrowed, general };
}

const HEADERS = {
  ton: `# Расхождения ТОН — риск контраста текста (для дизайнера)

Узкий список вердиктов «≠», где расхождение затрагивает **цвет текста**: подписи, чернила, роли \`--tx\` / \`--v4-ink\`, цвет типографики в кадре.

**Критерий риска (Task 145):** полутона могут уронить контраст ниже 4.5:1 **на тексте**. Фоны, заливки карточек, обводки, scrim и декоративные пятна — в [общей пачке](DIVERGENCE_GENERAL_FOR_DESIGNER.md).

Всего строк: **{{count}}** (из {{total}} «≠» на {{date}}; было {{before}} до сужения).

| Зона | Ключ | В кадре | В коде |
|------|------|---------|--------|
`,
  height: `# Расхождения ВЫСОТА — риск зоны нажатия <44px (для дизайнера)

Узкий список вердиктов «≠», где расхождение затрагивает **интерактивную высоту** в полосе 42–44px или контракт требует 44px, а код отличается примерно на 2px.

**Критерий риска (Task 145):** 2px могут уронить цель с 44 на 42. Отступы, gap, высота карточек и блоков — в [общей пачке](DIVERGENCE_GENERAL_FOR_DESIGNER.md).

Всего строк: **{{count}}** (из {{total}} «≠» на {{date}}; было {{before}} до сужения).

| Зона | Ключ | В кадре | В коде |
|------|------|---------|--------|
`,
  kegl: `# Расхождения КЕГЛЬ — риск ниже минимума 12px (для дизайнера)

Узкий список вердиктов «≠», где кегль **ниже 12px** или спор пересекает границу 12 (например 11 vs 12).

**Критерий риска (Task 145):** 12.5 vs 13 неважно; 11 vs 12 уже ниже минимума. Косметика ≥12px — в [общей пачке](DIVERGENCE_GENERAL_FOR_DESIGNER.md).

Всего строк: **{{count}}** (из {{total}} «≠» на {{date}}; было {{before}} до сужения).

| Зона | Ключ | В кадре | В коде |
|------|------|---------|--------|
`,
  general: `# Расхождения — общая пачка (для дизайнера)

Все «≠», не попавшие в узкие списки риска по **ТОН / ВЫСОТА / КЕГЛЬ** (Task 145), плюс строки, изначально вне трёх визуальных корзин Task 138.

Колонка **Было в** показывает, откуда строка ушла при сужении (или «вне трёх»).

Всего строк: **{{count}}** (из {{total}} «≠» на {{date}}).

| Зона | Ключ | В кадре | В коде | Было в |
|------|------|---------|--------|--------|
`,
};

function sortRows(rows) {
  return rows.sort((a, b) => {
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    return a.key.localeCompare(b.key, 'ru');
  });
}

function main() {
  const data = readAllZones();
  const canvasCache = new Map();
  const all = [];
  const buckets = { ton: [], height: [], kegl: [], outside: [] };
  const ambiguousDup = [];

  for (const [zoneId, zone] of Object.entries(data.zones)) {
    const canvasFile = zone.canvas;
    if (!canvasCache.has(canvasFile)) {
      canvasCache.set(canvasFile, loadCanvasMap(canvasFile));
    }
    const contract = canvasCache.get(canvasFile);

    for (const [key, row] of Object.entries(zone.rows || {})) {
      if (row.v !== '≠') continue;
      const canvasValue = contract.get(key) ?? '(строка не найдена в канвасе)';
      const fact = row.f || '';
      const { bucket, scores, reason } = classifyRow(key, canvasValue, fact);
      const entry = {
        zone: zoneId,
        key,
        canvas: canvasValue,
        code: extractProductSide(fact),
        scores,
        reason,
      };
      all.push(entry);
      buckets[bucket].push(entry);

      // Truly ambiguous: top two visual scores within 1 and both >= 3
      const { ton, height, kegl } = scores;
      const visual = [
        ['ton', ton],
        ['height', height],
        ['kegl', kegl],
      ].sort((a, b) => b[1] - a[1]);
      if (
        bucket !== 'outside'
        && visual[0][1] >= 3
        && visual[1][1] >= 3
        && visual[0][1] - visual[1][1] <= 1
        && visual[0][0] !== bucket
        && visual[1][0] !== bucket
      ) {
        ambiguousDup.push(entry);
      }
    }
  }

  const total = all.length;
  const date = new Date().toISOString().slice(0, 10);
  const before = {
    ton: buckets.ton.length,
    height: buckets.height.length,
    kegl: buckets.kegl.length,
    outside: buckets.outside.length,
  };

  const { narrowed, general } = narrowBuckets(buckets);

  for (const name of ['ton', 'height', 'kegl']) {
    const rows = sortRows(narrowed[name]);
    const header = HEADERS[name]
      .replace('{{count}}', String(rows.length))
      .replace('{{total}}', String(total))
      .replace('{{date}}', date)
      .replace('{{before}}', String(before[name]));
    const body = rows
      .map(
        (r) =>
          `| ${escCell(r.zone)} | ${escCell(r.key)} | ${escCell(r.canvas)} | ${escCell(r.code)} |`,
      )
      .join('\n');
    fs.writeFileSync(OUT[name], header + body + '\n', 'utf8');
  }

  const generalRows = sortRows(general);
  const generalHeader = HEADERS.general
    .replace('{{count}}', String(generalRows.length))
    .replace('{{total}}', String(total))
    .replace('{{date}}', date);
  const generalBody = generalRows
    .map(
      (r) =>
        `| ${escCell(r.zone)} | ${escCell(r.key)} | ${escCell(r.canvas)} | ${escCell(r.code)} | ${escCell(r.wasIn)} |`,
    )
    .join('\n');
  fs.writeFileSync(OUT.general, generalHeader + generalBody + '\n', 'utf8');

  const after = {
    ton: narrowed.ton.length,
    height: narrowed.height.length,
    kegl: narrowed.kegl.length,
    general: general.length,
  };

  const summary = {
    total,
    before,
    after,
    sum: after.ton + after.height + after.kegl + after.general,
    ambiguousNearTie: ambiguousDup.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  if (summary.sum !== total) {
    console.error('COUNT MISMATCH', summary);
    process.exit(1);
  }
}

main();
