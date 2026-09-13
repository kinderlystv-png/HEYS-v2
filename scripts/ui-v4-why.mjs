#!/usr/bin/env node
/**
 * «Почему тут такой цвет» — один запуск вместо получаса раскопок.
 *
 * Поднимает стенд ровно того же кейса, из которого снята пара в сверке
 * экранов, находит элемент по селектору и печатает:
 *   — какое значение у свойства на самом деле;
 *   — какая строка CSS его поставила (файл:строка, с самой строкой для сверки);
 *   — через какую переменную и где эта переменная объявлена;
 *   — что перекрыто (проигравшие объявления каскада).
 *
 * Зачем отдельный скрипт: узнать победителя каскада грепом нельзя — правил на
 * один элемент бывает пять в трёх файлах, и выигрывает не последнее по номеру
 * строки, а по специфичности и медиазапросу. Браузер это уже посчитал, мы
 * просто спрашиваем его через CDP.
 *
 * Нужен поднятый локальный web (pnpm dev:local).
 *
 * Примеры:
 *   node scripts/ui-v4-why.mjs --case=date-other-day --sel=".date-picker-day-nav"
 *   node scripts/ui-v4-why.mjs --case=date-other-day --sel=".date-picker-trigger" --prop=background-color,border-radius
 *   node scripts/ui-v4-why.mjs --case=home-widgets-catalog --sel=".wd-catalog__row" --index=1 --all
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import {
  UI_V4_VISUAL_CASES,
  buildUiV4VisualSnapshot,
} from '../apps/web/scripts/ui-v4-visual-fixture.mjs';
import { ensureServer, openCase } from '../apps/web/scripts/ui-v4-visual-capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Набор по умолчанию: то, из-за чего расхождения в сверке заводятся чаще всего.
const DEFAULT_PROPS = ['background-color', 'color'];
const ALL_PROPS = [
  'background-color',
  'color',
  'border-radius',
  'border-color',
  'border-width',
  'font-size',
  'font-weight',
  'line-height',
  'width',
  'height',
  'padding',
  'gap',
  'box-shadow',
  'opacity',
];

function arg(name, fallback = '') {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}
const flag = (name) => process.argv.slice(2).includes(`--${name}`);

const caseId = arg('case');
const selector = arg('sel');
const index = Number(arg('index', '0')) || 0;
const props = flag('all')
  ? ALL_PROPS
  : (arg('prop') ? arg('prop').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_PROPS);

if (!caseId || !selector) {
  console.error(
    'Нужны --case=<id кейса> и --sel=<css-селектор>.\n' +
      'Пример: node scripts/ui-v4-why.mjs --case=date-other-day --sel=".date-picker-day-nav"',
  );
  process.exit(2);
}

const item = UI_V4_VISUAL_CASES.find((entry) => entry.id === caseId);
if (!item) {
  const near = UI_V4_VISUAL_CASES.map((entry) => entry.id)
    .filter((id) => id.includes(caseId.split('-')[0]))
    .slice(0, 10);
  console.error(`Кейса «${caseId}» нет. Похожие: ${near.join(', ') || '—'}`);
  process.exit(2);
}

/** URL таблицы стилей → путь на диске, чтобы «файл:строка» можно было открыть. */
function sheetToDisk(header) {
  const url = header.sourceURL || '';
  if (!url) return null;
  let pathname;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  pathname = pathname.split('?')[0].replace(/^\/+/, '');
  const candidates = [
    path.join(ROOT, 'apps', 'web', pathname),
    path.join(ROOT, 'apps', 'web', 'public', pathname),
    path.join(ROOT, pathname),
  ];
  const hit = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  return hit ? path.relative(ROOT, hit).replaceAll('\\', '/') : null;
}

/** Строка в исходнике: у <style> внутри документа своё смещение от начала файла. */
function lineOf(header, range) {
  return (header.startLine || 0) + (range?.startLine ?? 0) + 1;
}

function readLine(diskPath, line) {
  if (!diskPath) return '';
  try {
    const text = fs.readFileSync(path.join(ROOT, diskPath), 'utf8').split(/\r?\n/);
    // tailwind.css и сборки лежат в одну строку на весь файл — показываем начало,
    // иначе вывод тонет в мегабайте минифицированного CSS.
    return trim140((text[line - 1] || '').trim());
  } catch {
    return '';
  }
}

// Цвет кружка ставит `background`, а спрашивают про `background-color`: без этой
// таблицы победителем оказывается чужой сброс, а настоящее правило не находится.
const SHORTHANDS_FOR = {
  'background-color': ['background'],
  'background-image': ['background'],
  'border-color': ['border', 'border-color'],
  'border-width': ['border', 'border-width'],
  'border-radius': ['border-radius'],
  padding: ['padding'],
  gap: ['gap'],
  'font-size': ['font'],
  'font-weight': ['font'],
  'line-height': ['font'],
};

// У некоторых свойств в вычисленном стиле нет общей записи — только по сторонам.
const COMPUTED_ALIAS = {
  'border-radius': 'border-top-left-radius',
  padding: 'padding-top',
  'border-width': 'border-top-width',
  'border-color': 'border-top-color',
};

function computedValue(map, prop) {
  if (map.has(prop)) return map.get(prop);
  const alias = COMPUTED_ALIAS[prop];
  return alias && map.has(alias) ? `${map.get(alias)} (сверху слева)` : '—';
}

// Vite в dev склеивает все @import из main.css в одну таблицу и вставляет её
// скриптом: браузер знает строку в склейке, а править надо модуль. Модули
// попадают в склейку дословно, поэтому карта строится поиском текста модуля.
const MODULE_DIRS = [path.join(ROOT, 'apps', 'web', 'styles')];
let moduleFilesCache = null;
function moduleFiles() {
  if (moduleFilesCache) return moduleFilesCache;
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.css')) out.push(full);
    }
  };
  for (const dir of MODULE_DIRS) if (fs.existsSync(dir)) walk(dir);
  moduleFilesCache = out;
  return out;
}

const NEWLINE = /\r?\n/;
const countLines = (text) => text.split(NEWLINE).length;

const bundleMapCache = new Map();
function bundleMapFor(sheetText) {
  if (bundleMapCache.has(sheetText)) return bundleMapCache.get(sheetText);
  const map = [];
  // Переводы строк с обеих сторон приводим к одному виду: на диске файлы могут
  // лежать с CRLF, а в браузер таблица приходит с LF, и поиск не находил ничего.
  const hay = sheetText.replace(/\r\n/g, '\n');
  // Ищем модуль не целиком, а по началу: внутри склейки Vite переписывает пути в
  // url(), и дословного совпадения всего файла нет. Строки при этом не
  // добавляются и не пропадают, поэтому начала достаточно, а конец даёт начало
  // следующего модуля.
  for (const file of moduleFiles()) {
    const body = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (body.length < 400) continue;
    const bodyLines = body.split('\n');
    // Якорь — строка модуля, которая во всей склейке встречается ровно один раз.
    // По ней и её номеру внутри модуля вычисляется, с какой строки склейки
    // модуль начинается.
    let at = -1;
    let anchorIndex = 0;
    for (let i = 0; i < bodyLines.length; i += 1) {
      const candidate = bodyLines[i];
      if (candidate.length < 40) continue;
      const needle = `\n${candidate}\n`;
      const first = hay.indexOf(needle);
      if (first < 0 || first !== hay.lastIndexOf(needle)) continue;
      at = first + 1;
      anchorIndex = i;
      break;
    }
    if (at < 0) {
      at = hay.indexOf(body.slice(0, 400));
      anchorIndex = 0;
    }
    if (at < 0) continue;
    map.push({
      file: path.relative(ROOT, file).replaceAll('\\', '/'),
      startLine: countLines(hay.slice(0, at)) - anchorIndex,
      lineCount: bodyLines.length,
    });
  }
  map.sort((a, b) => a.startLine - b.startLine);
  map.forEach((entry) => {
    entry.endLine = entry.startLine + entry.lineCount - 1;
  });
  map.sort((a, b) => a.startLine - b.startLine);
  bundleMapCache.set(sheetText, map);
  return map;
}

function place(header, range, sheetText) {
  const line = lineOf(header, range);
  const bundleLines = sheetText ? sheetText.split(NEWLINE) : null;
  const expected = bundleLines ? (bundleLines[line - 1] || '').trim() : '';

  // 1. Таблица отдана файлом как есть — номер строки уже настоящий.
  const disk = sheetToDisk(header);
  if (disk && (!expected || readLine(disk, line) === trim140(expected))) {
    return { label: `${disk}:${line}`, text: readLine(disk, line) };
  }

  // 2. Склейка: ищем, в каком модуле лежит эта строка.
  if (bundleLines) {
    const map = bundleMapFor(sheetText);
    // Диапазоны модулей могут перекрываться (одинаковые куски в разных файлах),
    // поэтому из подходящих берём тот, у которого строка на диске совпала с
    // тем, что реально применил браузер.
    const candidates = map.filter((m) => line >= m.startLine && line <= m.endLine);
    const hit =
      candidates.find((m) => readLine(m.file, line - m.startLine + 1) === trim140(expected)) ||
      candidates[0];
    if (hit) {
      const moduleLine = line - hit.startLine + 1;
      return { label: `${hit.file}:${moduleLine}`, text: readLine(hit.file, moduleLine) };
    }
  }

  if (disk) return { label: `${disk}:${line}`, text: readLine(disk, line) };
  const where = header.isInline ? 'inline <style>' : header.sourceURL || 'неизвестный источник';
  return { label: `${where}:${line}`, text: trim140(expected) };
}

function trim140(raw) {
  return raw.length > 140 ? `${raw.slice(0, 140)}…` : raw;
}

/** Объявления свойства во всех подошедших правилах, от слабого к сильному. */
function declarationsOf(matchedRules, prop) {
  const names = new Set([prop, ...(SHORTHANDS_FOR[prop] || [])]);
  const out = [];
  for (const entry of matchedRules || []) {
    const rule = entry.rule;
    if (!rule?.style) continue;
    const selectorText = rule.selectorList?.text || '';
    const media = (rule.media || []).map((m) => m.text).filter(Boolean).join(' и ');
    // Внутри одного правила побеждает последнее объявление свойства.
    let winner = null;
    for (const property of rule.style.cssProperties || []) {
      if (!names.has(property.name) || !property.range || property.disabled) continue;
      winner = property;
    }
    if (winner) {
      out.push({
        prop: winner.name,
        value: winner.value,
        important: Boolean(winner.important),
        selectorText,
        media,
        styleSheetId: rule.styleSheetId,
        range: winner.range,
      });
    }
  }
  return out;
}

/** Победитель каскада: !important сильнее обычного, среди равных — последний. */
function cascadeWinner(declarations) {
  if (!declarations.length) return null;
  const important = declarations.filter((d) => d.important);
  const pool = important.length ? important : declarations;
  return pool[pool.length - 1];
}

async function main() {
  await ensureServer();
  const browser = await chromium.launch({ headless: true });
  let context = null;
  try {
    const snapshot = buildUiV4VisualSnapshot(item);
    const opened = await openCase(browser, item, snapshot, { measureOnly: true });
    if (!opened?.page) {
      throw new Error(`Стенд не открылся: ${opened?.error || 'причина неизвестна'}`);
    }
    const { page } = opened;
    context = opened.context;

    const cdp = await context.newCDPSession(page);
    const sheets = new Map();
    cdp.on('CSS.styleSheetAdded', (event) => sheets.set(event.header.styleSheetId, event.header));
    await cdp.send('DOM.enable');
    // CSS.enable переприсылает styleSheetAdded по всем уже загруженным таблицам,
    // поэтому слушателя достаточно повесить до него.
    await cdp.send('CSS.enable');

    // Текст таблицы нужен, чтобы отличить «строка из настоящего файла» от
    // «строка из склейки Vite» и перевести вторую в модуль.
    const sheetTexts = new Map();
    async function sheetTextOf(styleSheetId) {
      if (!sheetTexts.has(styleSheetId)) {
        const got = await cdp
          .send('CSS.getStyleSheetText', { styleSheetId })
          .catch(() => ({ text: '' }));
        sheetTexts.set(styleSheetId, got.text || '');
      }
      return sheetTexts.get(styleSheetId);
    }

    const doc = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const found = await cdp.send('DOM.querySelectorAll', {
      nodeId: doc.root.nodeId,
      selector,
    });
    const nodeIds = found.nodeIds || [];
    if (!nodeIds.length) {
      console.error(`На стенде «${caseId}» ничего не нашлось по «${selector}».`);
      process.exitCode = 1;
      return;
    }
    const nodeId = nodeIds[Math.min(index, nodeIds.length - 1)];

    const matched = await cdp.send('CSS.getMatchedStylesForNode', { nodeId });
    const computed = await cdp.send('CSS.getComputedStyleForNode', { nodeId });
    const computedMap = new Map(computed.computedStyle.map((e) => [e.name, e.value]));

    // Где объявлена переменная: сначала на самом элементе, потом вверх по предкам
    // (собственные значения перекрывают унаследованные — как в браузере).
    const levels = [
      { title: 'элемент', rules: matched.matchedCSSRules },
      ...(matched.inherited || []).map((inherited, i) => ({
        title: `предок ${i + 1}`,
        rules: inherited.matchedCSSRules,
      })),
    ];
    async function findVar(name) {
      for (const level of levels) {
        const declarations = declarationsOf(level.rules, name);
        const winner = cascadeWinner(declarations);
        if (winner) return { ...winner, level: level.title };
      }
      return null;
    }

    const header = `${caseId} · ${selector}` +
      (nodeIds.length > 1 ? ` (совпадений ${nodeIds.length}, показан №${index + 1})` : '');
    console.log(header);
    console.log('─'.repeat(Math.min(header.length, 78)));

    for (const prop of props) {
      const declarations = declarationsOf(matched.matchedCSSRules, prop);
      const winner = cascadeWinner(declarations);
      const value = computedValue(computedMap, prop);
      console.log(`\n${prop}: ${value}${hexOf(value)}`);

      if (!winner) {
        console.log('  ставит не CSS-правило (наследование, инлайн-стиль или значение по умолчанию)');
        continue;
      }
      const at = place(
        sheets.get(winner.styleSheetId) || {},
        winner.range,
        await sheetTextOf(winner.styleSheetId),
      );
      console.log(`  ← ${winner.selectorText} { ${winner.prop}: ${winner.value}${winner.important ? ' !important' : ''} }`);
      console.log(`     ${at.label}${winner.media ? `   (внутри ${winner.media})` : ''}`);
      if (at.text) console.log(`     │ ${at.text}`);

      // Цепочка переменных: значение правила → откуда взялась каждая var().
      const seen = new Set();
      let queue = [...winner.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
      while (queue.length) {
        const name = queue.shift();
        if (seen.has(name)) continue;
        seen.add(name);
        const resolved = (computedMap.get(name) || '').trim();
        const where = await findVar(name);
        if (where) {
          const varAt = place(
            sheets.get(where.styleSheetId) || {},
            where.range,
            await sheetTextOf(where.styleSheetId),
          );
          console.log(`  ${name} = ${where.value.trim()}${hexOf(where.value)}`);
          console.log(`     ${varAt.label}   ${where.selectorText}${where.media ? ` (внутри ${where.media})` : ''}`);
          queue.push(...[...where.value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]));
        } else {
          console.log(`  ${name} = ${resolved || 'не объявлена — работает запасное значение из var()'}`);
        }
      }

      const losers = declarations.filter((d) => d !== winner);
      if (losers.length) {
        console.log('  перекрыто:');
        for (const loser of losers) {
          const loserAt = place(
            sheets.get(loser.styleSheetId) || {},
            loser.range,
            await sheetTextOf(loser.styleSheetId),
          );
          console.log(`     ${loserAt.label}   ${loser.selectorText} { ${loser.prop}: ${loser.value} }`);
        }
      }
    }
    console.log('');
  } finally {
    if (context) await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

/** rgb(...) → hex рядом со значением: сверять с пипеткой по кадру удобнее в hex. */
function hexOf(value) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(value).trim());
  if (!match) return '';
  const hex = match
    .slice(1, 4)
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('');
  return `  #${hex}`;
}

main().catch((error) => {
  console.error('[ui-v4-why]', error?.stack || error);
  process.exit(1);
});
