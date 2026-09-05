#!/usr/bin/env node
/** Polosa 6 · task 106 · sync package 36 from standalone → water-add.v4.dc.html */
import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(import.meta.dirname, '..');
const CANONICAL = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/water-add.v4.dc.html',
);
const STANDALONE = path.join(path.dirname(CANONICAL), 'standalone/water-add.v4.html');

const TACH_CELI_VALUE =
  'ПРИВЕДЕНО 5 сентября, видимым размером: четыре готовых объёма внутри карточки .bChip (30 → 44), чипы ±200/+500 в плашке ряда .chip (30 → 44), пилюля „+200 мл“ (38 → 44), круглые кнопки .fab и .fabW (38 → 44), кнопки выбора варианта .abBtn (32 → 44). Расширителя нет ни у одного нажимаемого элемента. Карточка: 269 → 282 после подъёма чипов, затем 282 → 237 после снятия ряда переключателя из живого кадра; итог 300 × 237';

const SYNC_KEYS = [
  'переключатель вида',
  'цель касания переключателя',
  'вид чипов',
  'цель касания',
  'вид · карточка «Кольцо»',
  'вид · ряд чипов объёма',
  'Вода · карточка · Кольцо · текст',
];

function loadStandaloneHtml() {
  const raw = fs.readFileSync(STANDALONE, 'utf8');
  const line = raw.split(/\r?\n/).find((l) => l.trim().startsWith('"<!DOCTYPE'));
  if (!line) throw new Error('standalone embedded HTML line not found');
  return JSON.parse(line.trim());
}

function contractMap(html) {
  const dom = new JSDOM(html);
  const map = new Map();
  for (const spec of dom.window.document.querySelectorAll('.spec')) {
    const key = spec.querySelector('b')?.textContent?.trim();
    const val = spec.querySelector('span[data-v]')?.getAttribute('data-v');
    if (key && val) map.set(key, val);
  }
  return map;
}

function replaceDataV(fileText, key, value) {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(<div class="spec"[^>]*><b>${esc}</b><span data-v=")[^"]*(")`, 'u');
  if (!re.test(fileText)) throw new Error(`row not found in canonical: ${key}`);
  return fileText.replace(re, `$1${value.replace(/"/g, '&quot;')}$2`);
}

function main() {
  const standalone = contractMap(loadStandaloneHtml());
  let canon = fs.readFileSync(CANONICAL, 'utf8');

  for (const key of SYNC_KEYS) {
    const value = standalone.get(key);
    if (!value) throw new Error(`missing in standalone: ${key}`);
    canon = replaceDataV(canon, key, value);
    console.log(`synced: ${key}`);
  }

  const tachRow =
    '    <div class="spec"><b>тач-цели</b><span data-v="' +
    TACH_CELI_VALUE.replace(/"/g, '&quot;') +
    '"></span><i>норма 44 pt держится видимым размером: невидимый расширитель проходит замер и проваливается в руке — палец не видит ::after</i></div>\n' +
    '                                                              <div class="ctrH">Разбор кадров · элемент за элементом</div>';

  if (canon.includes('<b>тач-цели</b>')) {
    throw new Error('тач-цели already present');
  }
  canon = canon.replace(
    '                                                              <div class="ctrH">Разбор кадров · элемент за элементом</div>',
    tachRow,
  );

  // Canvas CSS: visible 44px, no chip expander
  canon = canon
    .replace(
      /\.fab\{position:absolute;right:14px;bottom:16px;width:38px;height:38px/,
      '.fab{position:absolute;right:14px;bottom:16px;width:44px;height:44px',
    )
    .replace(
      /\.addPill\{position:absolute;right:58px;bottom:16px;height:38px/,
      '.addPill{position:absolute;right:58px;bottom:16px;height:44px',
    )
    .replace(
      /\.wCardB \.bChip\{height:30px/,
      '.wCardB .bChip{height:44px',
    )
    .replace(/\.abBtn\{font:700 11px\/1 Figtree,sans-serif;height:32px/, '.abBtn{font:700 11px/1 Figtree,sans-serif;height:44px')
    .replace(
      /\.chip\{display:inline-flex;align-items:center;justify-content:center;height:30px;padding:0 12px;border-radius:999px;font:700 11\.5px\/1 Figtree,sans-serif;white-space:nowrap;position:relative\}\n  \.chip::after\{content:'';position:absolute;left:0;right:0;top:-7px;bottom:-7px\}/,
      '.chip{display:inline-flex;align-items:center;justify-content:center;height:44px;padding:0 12px;border-radius:999px;font:700 11.5px/1 Figtree,sans-serif;white-space:nowrap;position:relative}',
    )
    .replace(/\.fabW\{width:38px;height:38px/, '.fabW{width:44px;height:44px');

  // Live stop frame: drop dead view switcher row
  canon = canon.replace(
    /\s*<div class="vSw"><i>Полоса<\/i><i class="on">Кольцо<\/i><\/div>\s*(?=<\/div>\s*<\/div>\s*<div data-cardvar="b">)/,
    '\n',
  );

  fs.writeFileSync(CANONICAL, canon, 'utf8');
  console.log('water-add.v4.dc.html synced');
}

main();
