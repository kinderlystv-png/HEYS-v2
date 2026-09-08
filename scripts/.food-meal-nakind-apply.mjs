#!/usr/bin/env node
/**
 * food-meal pilot: типизация 86 legacy «—» без naKind (08.09.2026).
 * Блочная классификация по факту; не трогаем «≠», «=» и уже типизированные «—».
 */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'food-meal';

const HANDOFF_KEYS = new Set([
  'фича',
  'источник',
  'границы',
  'палитры',
  'цвета не из палитры',
  'адресация',
  'как читать разбор',
  'как читать графику',
  'как читать текст',
  'что закрыто и что нет',
  'зачем ряд куратору',
  'главный файл экрана',
  'главный файл правки приёма',
]);

/** @returns {'handoff'|'demo-only'|'designer-removed'|'foreign-zone'} */
function classifyNaKind(key, fact) {
  if (key.startsWith('снято ·')) return 'designer-removed';
  if (HANDOFF_KEYS.has(key)) return 'handoff';
  if (key === 'карандаш правки') return 'foreign-zone';
  if (key === 'ночное окно') return 'foreign-zone';
  if (key.includes('рисунок')) return 'foreign-zone';
  if (fact.includes('product-card')) return 'foreign-zone';
  if (fact.includes('капсулы даты')) return 'foreign-zone';
  if (fact.includes('вкладкой «Питание»')) return 'foreign-zone';
  if (fact.includes('data-demo="protocol"')) return 'designer-removed';
  if (fact.includes('пояснение кадра дизайнеру')) return 'demo-only';
  if (fact.includes('снимок экрана под')) return 'demo-only';
  if (fact.includes('заглушка снимка градиентом')) return 'demo-only';
  if (fact.includes('адресация:') || fact.includes('адресация области')) return 'demo-only';
  if (fact.includes('размеры самого кадра') || fact.includes('замер высоты кадра')) return 'demo-only';
  if (fact.includes('инвентарь значков самого канваса')) return 'demo-only';
  throw new Error(`Не классифицировано: «${key}» | ${fact.slice(0, 80)}`);
}

const zone = readZone(ZONE);
const pending = Object.entries(zone.rows)
  .filter(([, row]) => row.v === '—' && !row.naKind)
  .map(([key, row]) => ({ key, fact: row.f, naKind: classifyNaKind(key, row.f || '') }));

const byKind = {};
for (const p of pending) {
  byKind[p.naKind] = (byKind[p.naKind] || 0) + 1;
}
console.log('pending', pending.length);
console.log('by naKind', byKind);

const keys = new Set(pending.map((p) => p.key));
const snap = snapshotForeignRowStrings(zone.rows, keys);

let applied = 0;
for (const p of pending) {
  const { skipped, reason } = setVerdictKey(ZONE, p.key, {
    verdict: '—',
    fact: p.fact,
    options: { 'na-kind': p.naKind },
  });
  const tag = skipped ? ` SKIP(${reason})` : '';
  console.log(`${p.key}: naKind=${p.naKind}${tag}`);
  if (!skipped) applied += 1;
}

assertForeignRowsUnchanged(snap, readZone(ZONE).rows);
console.log(`\napplied naKind ${applied}/${pending.length}, foreign guard OK`);
