#!/usr/bin/env node
/** Polosa 6 · task 106 — norm-correction «вид кабинета куратора» after package 36 rehash. */
import { readZone, setVerdictKey } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ZONE = 'norm-correction';
const KEY = 'вид кабинета куратора';
const FACT =
  'ЗАКРЫТО 5 сентября: контракт подтверждает чужую зону. Карточка нарисована в клиентском кадре 330 px — числа, слова и порядок строк в buildCuratorCard (heys_norm_correction_v1.js); сетка кабинета, шапка и место карточки в списке клиентов — отдельное решение и отдельный канвас curator-cabinet.v4.dc.html (кадры «Панель · есть работа», «Панель · лист поверх»)';

const handoffKeys = new Set([KEY]);
const zone = readZone(ZONE);
const foreignBefore = snapshotForeignRowStrings(zone.rows, handoffKeys);

const result = setVerdictKey(ZONE, KEY, {
  verdict: '—',
  fact: FACT,
  options: { 'na-kind': 'foreign-zone' },
});

if (result.skipped) {
  console.error('skipped:', result.reason, result.message);
  process.exit(1);
}

const live = readZone(ZONE);
assertForeignRowsUnchanged(foreignBefore, live.rows);

const row = live.rows[KEY];
console.log(`Applied ${KEY}: v=${row.v} h=${row.h} naKind=${row.naKind}`);
