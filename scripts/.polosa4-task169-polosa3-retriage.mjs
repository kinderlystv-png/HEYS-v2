#!/usr/bin/env node
/**
 * Polosa 4 · task 169 — re-triage polosa 3 slice with designer filter (task 162 method).
 * EXCLUDE from bulk if ANY: Действие | Контраст 4.5 | Цель 44
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readZone } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = path.join(ROOT, 'docs/ui/polosa4-task151-bulk-owner-decision-candidates.json');
const OUT = path.join(ROOT, 'scripts/.polosa4-task169-polosa3-retriage.json');
const PACK = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);

const TASK152_BLOCKERS = new Set([
  'product-card::Штрихкод · состояния · 18',
  'registration::Регистрация · подписано · текст',
  'nutrition-tab::совет с заменой',
  'app-splash::уменьшенное движение',
  'checkin-morning::Чек-ин · остальное на неделе периода · текст',
  'curator-edits::переход по строке',
  'cycle::Цикл · профиль, выключение · текст',
  'cycle::Цикл · график веса · текст',
  'first-run::иконки',
  'first-run::вид · плашка «обзор пройден»',
  'norm-correction::Pro · куратор решил не менять · 01',
  'service-curator::фича',
  'strength-builder::Куратор и зал · 04',
  'tab-activity::Актив · день собран · текст',
]);

const CYCLE_GRAPH_KEYS = new Set([
  'cycle::Цикл · график веса · текст',
  'cycle::Цикл · график веса · 02',
  'cycle::Цикл · график веса · 01',
  'cycle::Цикл · график веса · 03',
  'cycle::Цикл · тултип задержки · 02',
]);

function loadCanvasMap(canvasFile) {
  const file = path.join(PACK, canvasFile);
  if (!fs.existsSync(file)) return new Map();
  const html = fs.readFileSync(file, 'utf8');
  const map = new Map();
  for (const m of html.matchAll(/<div class="spec"[^>]*><b>([^<]+)<\/b><span data-v="([^"]*)"/g)) {
    map.set(m[1], m[2]);
  }
  return map;
}

const canvasCache = new Map();

function canvasValue(zoneId, key) {
  const zone = readZone(zoneId);
  const canvasFile = zone?.canvas;
  if (!canvasFile) return '';
  if (!canvasCache.has(canvasFile)) canvasCache.set(canvasFile, loadCanvasMap(canvasFile));
  return canvasCache.get(canvasFile).get(key) || '';
}

// Cyrillic-safe: no \\b on кириллице
const ACTION_RES = [
  /кнопк/i,
  /(?:^|[\s,.«"'])тап/i,
  /нажат/i,
  /CTA/i,
  /\bflow\b/i,
  /переход/i,
  /действ/i,
  /удал/i,
  /отмен/i,
  /(?:^|[\s,.«"'])назад/i,
  /confirm/i,
  /выбор/i,
  /перенос/i,
  /открыва/i,
  /закрыва/i,
  /шторк/i,
  /оплат/i,
  /возврат/i,
  /отзыв/i,
  /revoke/i,
  /undo/i,
  /пропуск/i,
  /брошен/i,
  /не сохран/i,
  /оффер/i,
  /пробн/i,
  /подписк/i,
  /журнал/i,
  /сесс/i,
  /подход/i,
  /ввод/i,
  /быстрых действий/i,
  /Повторить/i,
  /Написать куратору/i,
  /Готово/i,
  /крестиком/i,
  /закрытие/i,
  /третий пропуск/i,
  /сигнал куратору/i,
  /три исхода/i,
  /семь входов/i,
  /шторка нужна/i,
  /тост на действии/i,
  /только чтение/i,
  /readonly/i,
  /приветствие · один раз/i,
  /оплата · уход/i,
  /очередь · оффер/i,
  /правка куратора/i,
];

const CONTRAST_RES = [
  /контраст/i,
  /contrast/i,
  /4[,.]5\s*:?\s*1/i,
  /WCAG/i,
  /доступност/i,
  /a11y/i,
];

const TOUCH_RES = [
  /(?:^|[^\d])44\s*px/i,
  /min-height:\s*(?:[0-9]|[12][0-9]|3[0-9]|4[0-3])(?:px|;|\s)/i,
  /(?:^|[^\d])(?:3[0-9]|4[0-3])\s*px/i,
  /touch\s*target/i,
  /цель\s+нажати/i,
  /hit\s*expander/i,
  /::after/i,
  /expander/i,
  /зона\s+нажати/i,
  /(?:^|[^\d])(?:1[0-9]|2[0-9]|3[0-9])\s*×\s*(?:1[0-9]|2[0-9]|3[0-9])/i,
];

const ACTION_KEY_RES = [
  /перенос ·/i,
  /Сессия ·/i,
  /Правка легла/i,
  /Подход ·/i,
  /шторка/i,
  /оплата ·/i,
  /очередь ·/i,
  /тост на действии/i,
  /чипы быстрых действий/i,
  /вторая неудача/i,
  /не удалось/i,
  /не сохранено/i,
  /правка куратора/i,
  /журнал/i,
  /третий пропуск/i,
  /три исхода/i,
  /семь входов/i,
  /приветствие · один раз/i,
  /слова на экране/i,
];

const CONTRAST_KEY_RES = [/доступность/i];

const TOUCH_KEY_RES = [
  /чипы быстрых действий · 28/i,
];

function matchRes(text, patterns) {
  return patterns.filter((re) => re.test(text)).map((re) => re.source);
}

function classifyEntry(entry) {
  const { zoneId, key } = entry;
  const zone = readZone(zoneId);
  const row = zone?.rows?.[key] || {};
  const fact = row.f || entry.currentVerdict?.f || '';
  const canvas = canvasValue(zoneId, key);
  const combined = `${key}\n${canvas}\n${fact}`;

  const triggers = {
    action: [...matchRes(combined, ACTION_RES), ...matchRes(key, ACTION_KEY_RES)],
    contrast: [...matchRes(combined, CONTRAST_RES), ...matchRes(key, CONTRAST_KEY_RES)],
    touch: [...matchRes(combined, TOUCH_RES), ...matchRes(key, TOUCH_KEY_RES)],
  };

  // Dedupe trigger sources
  for (const k of Object.keys(triggers)) {
    triggers[k] = [...new Set(triggers[k])];
  }

  // Geometry-only рисунок rows: action only if key/fact names flow change
  if (/· рисунок /i.test(key)) {
    const flowNamed = /(?:перенос|сесс|подход|шторк|оплат|чип|не сохран|не удал|ошибк|неудач|кнопк|закрыт|Готово|крест)/i.test(combined);
    if (!flowNamed) triggers.action = triggers.action.filter((s) => !/кнопк|переход|действ|шторк|закрыт|Гotovo/i.test(s));
  }

  // Icon path-only rows are not touch-target issues unless size named
  if (/· рисунок /i.test(key) && !/(?:3[0-9]|4[0-3]|44)\s*px|min-height|touch|expander|::after/i.test(combined)) {
    triggers.touch = [];
  }

  const exclude = [];
  if (triggers.action.length) exclude.push('Действие');
  if (triggers.contrast.length) exclude.push('Контраст 4.5');
  if (triggers.touch.length) exclude.push('Цель 44');

  return {
    id: entry.id,
    zoneId,
    key,
    verdict: row.v || entry.currentVerdict?.v || '?',
    fact: fact.slice(0, 200),
    exclude,
    triggers,
    bulkOk: exclude.length === 0,
    skipped: false,
    skipReason: null,
  };
}

const payload = JSON.parse(fs.readFileSync(CANDIDATES, 'utf8'));
const entries = payload.polosa3?.entries || [];

const results = [];
let skippedBlockers = 0;

for (const entry of entries) {
  if (TASK152_BLOCKERS.has(entry.id) || CYCLE_GRAPH_KEYS.has(entry.id)) {
    skippedBlockers += 1;
    results.push({
      id: entry.id,
      zoneId: entry.zoneId,
      key: entry.key,
      skipped: true,
      skipReason: TASK152_BLOCKERS.has(entry.id) ? 'task152-blocker' : 'cycle-graph-fixed',
      bulkOk: false,
      exclude: [TASK152_BLOCKERS.has(entry.id) ? 'task152-blocker' : 'cycle-graph'],
    });
    continue;
  }
  results.push(classifyEntry(entry));
}

const triaged = results.filter((r) => !r.skipped);
const bulkOk = triaged.filter((r) => r.bulkOk);
const excluded = triaged.filter((r) => !r.bulkOk);

const excludeNames = {
  Действие: excluded.filter((r) => r.exclude.includes('Действие')).map((r) => r.key),
  'Контраст 4.5': excluded.filter((r) => r.exclude.includes('Контраст 4.5')).map((r) => r.key),
  'Цель 44': excluded.filter((r) => r.exclude.includes('Цель 44')).map((r) => r.key),
};

const out = {
  task: 169,
  generatedAt: new Date().toISOString(),
  method: 'polosa3 slice (sorted thirds, polosa4-task151-candidate-split-export.mjs)',
  filters: ['Действие', 'Контраст 4.5', 'Цель 44'],
  totals: {
    polosa3: entries.length,
    skippedKnownBlockers: skippedBlockers,
    triaged: triaged.length,
    bulkOk: bulkOk.length,
    exclude: excluded.length,
  },
  excludeByTrigger: {
    Действие: excludeNames['Действие'].length,
    'Контраст 4.5': excludeNames['Контраст 4.5'].length,
    'Цель 44': excludeNames['Цель 44'].length,
  },
  excludeNames,
  bulkOkNames: bulkOk.map((r) => r.key),
  rows: results,
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.totals, null, 2));
console.log('excludeByTrigger', out.excludeByTrigger);
console.log('written', path.relative(ROOT, OUT));
