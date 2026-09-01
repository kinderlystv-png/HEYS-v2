#!/usr/bin/env node
// Не даёт неизвестности маскироваться под принятое расхождение.
//
// `≠` означает установленный факт: код делает иначе и причина названа.
// Фразы «не подтверждено», «не проверено», «нужен review» и общий вывод
// «кадр не воспроизводится один-в-один» описывают отсутствие проверки. Для них
// существует отдельный вердикт `?`.

import { pathToFileURL } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const UNKNOWN_MARKERS = [
  { id: 'not-confirmed', re: /не подтвержден(?:а|о|ы)?/ },
  { id: 'not-checked', re: /не провер(?:ен(?:а|о|ы)?|ял(?:ся|ась|ось|ись)?)/ },
  { id: 'review-required', re: /требует\s+(?:визуального\s+)?(?:pixel[- ]?)?review/ },
  {
    id: 'match-not-claimed',
    re: /(?:совпадение|соответствие)\s+не заявля(?:ется|лось|лся|лась|лись)/,
  },
  {
    id: 'generic-frame-non-reproduction',
    re: /(?:кадр|canvas-кадр)[^.]{0,120}не воспроизводится[^.]{0,80}(?:один-в-один|pixel-perfect)/,
  },
  {
    id: 'generic-frame-non-reproduction-reversed',
    re: /не воспроизводится[^.]{0,80}(?:один-в-один|pixel-perfect)/,
  },
];

const VISUAL_MISMATCH = /точн(?:ая|ое|ый|ые)[^.]{0,100}(?:композици|типографи|геометри)[^.]{0,100}не совпада/;
const CONCRETE_VISUAL_EVIDENCE = /(?:\b\d+(?:[.,]\d+)?\s*px\b|[\w./-]+\.(?:css|js|jsx|ts|tsx|mjs|html):\d+|\.[a-z][\w-]*|--[a-z][\w-]*|\bdata-[a-z][\w-]*\b)/i;

function normalizeReason(reason) {
  return String(reason || '')
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[–—−]/g, '-')
    // Пользовательская копия внутри кавычек не описывает уверенность автора verdict.
    .replace(/«[^»]*»|"[^"]*"/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyUnknownMismatchReason(reason) {
  const text = normalizeReason(reason);
  for (const marker of UNKNOWN_MARKERS) {
    if (marker.re.test(text)) return marker.id;
  }
  if (VISUAL_MISMATCH.test(text) && !CONCRETE_VISUAL_EVIDENCE.test(text)) {
    return 'unsubstantiated-visual-mismatch';
  }
  return null;
}

export function findUnknownEvidenceMismatches(data, zoneIds = null) {
  const problems = [];
  for (const [zoneId, zone] of Object.entries(data?.zones || {})) {
    if (zoneIds && !zoneIds.has(zoneId)) continue;
    for (const [key, row] of Object.entries(zone?.rows || {})) {
      if (row?.v !== '≠') continue;
      const kind = classifyUnknownMismatchReason(row?.f);
      if (kind) problems.push({ zoneId, key, kind, reason: row?.f || '' });
    }
  }
  return problems;
}

function runCli() {
  const selected = process.argv.includes('--zone')
    ? new Set([process.argv[process.argv.indexOf('--zone') + 1]])
    : null;
  const problems = findUnknownEvidenceMismatches(readAllZones(), selected);

  if (!problems.length) {
    console.log('Семантика вердиктов чиста: неизвестность не записана как ≠.');
    return;
  }

  const byZone = new Map();
  for (const problem of problems) {
    const list = byZone.get(problem.zoneId) || [];
    list.push(problem);
    byZone.set(problem.zoneId, list);
  }

  console.error(`Неизвестность записана как ≠: ${problems.length} строк.`);
  for (const [zoneId, rows] of byZone) {
    console.error(`\n❌ ${zoneId}: ${rows.length}`);
    for (const row of rows.slice(0, 12)) {
      console.error(`  ${row.kind} · ${row.key} · ${row.reason}`);
    }
    if (rows.length > 12) console.error(`  … ещё ${rows.length - 12}`);
  }
  console.error('\nЕсли факт не подтверждён, ставьте ?. Для ≠ назовите конкретное проверенное отличие.');
  process.exitCode = 1;
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === entry) runCli();
