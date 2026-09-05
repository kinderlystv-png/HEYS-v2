#!/usr/bin/env node
/**
 * Построчный список расхождений для дизайнера: ключ + одна фраза «что
 * разошлось» + класс причины.
 *
 * Зачем отдельно от `ui-v4-group-deviations-for-designer.mjs`: тот отдаёт
 * КЛАССЫ и просит один ответ на класс. Дизайнер 5 сентября попросил вторую
 * половину — поимённые ключи с одной строкой на каждый, чтобы отвечать по
 * классу, но видеть, из чего класс собран.
 *
 * Почему это дёшево: факт по строке уже добыт при сведении и лежит в поле `f`
 * (замер 5 сентября: содержательный факт есть у 100 % строк «≠»). Список
 * собирается из данных, а не перечитыванием кода — поэтому его можно
 * пересобирать после каждого пакета, а не копить вручную.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';
import { classifyDeviations, collectMismatchRows } from './ui-v4-group-deviations-for-designer.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const JSON_OUT = path.join(ROOT, 'docs/ui/UI_V4_DIVERGENCE_ROWS.json');
const MD_OUT = path.join(ROOT, 'docs/ui/UI_V4_DIVERGENCE_ROWS.md');

/** Факт бывает многострочным и длинным — дизайнеру нужна одна фраза. */
function onePhrase(fact, limit = 200) {
  const flat = String(fact || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1).trimEnd()}…`;
}

export function buildDivergenceRows(data) {
  const grouped = classifyDeviations(collectMismatchRows(data));
  const rows = [];
  for (const bucket of grouped.classes) {
    for (const item of bucket.items) {
      rows.push({
        key: item.key,
        phrase: onePhrase(item.f),
        classId: bucket.id,
        classLabel: bucket.label,
        proposal: bucket.proposal,
        zoneId: item.zoneId,
        reasonCode: item.reasonCode || null,
      });
    }
  }
  // Одиночки класса не образуют — но дизайнеру они нужны так же, иначе список
  // молчит о части расхождений, а молчание читается как «их нет».
  for (const item of grouped.tail) {
    rows.push({
      key: item.key,
      phrase: onePhrase(item.f),
      classId: 'singleton',
      classLabel: item.inferredClass ? `вне классов · ${item.inferredClass}` : 'вне классов',
      proposal: 'спорно — разобрать поштучно',
      zoneId: item.zoneId,
      reasonCode: item.reasonCode || null,
    });
  }
  return rows;
}

function renderMarkdown(rows) {
  const byClass = new Map();
  for (const row of rows) {
    if (!byClass.has(row.classLabel)) {
      byClass.set(row.classLabel, { proposal: row.proposal, items: [] });
    }
    byClass.get(row.classLabel).items.push(row);
  }
  const ordered = [...byClass.entries()].sort((a, b) => b[1].items.length - a[1].items.length);

  const out = [
    '# UI v4 — расхождения построчно, для ответа по классам',
    '',
    `Срез: **${new Date().toISOString().slice(0, 10)}**. Строк «≠»: **${rows.length}**.`,
    '',
    'Спутник [`UI_V4_DEVIATIONS_FOR_DESIGNER.md`](UI_V4_DEVIATIONS_FOR_DESIGNER.md):',
    'там нужен один ответ на класс, здесь видно, из чего класс собран. Фраза в',
    'колонке «что разошлось» — факт, добытый при сведении экрана, а не пересказ.',
    '',
    'Файл собирается командой и пересобирается после каждого пакета:',
    '`node scripts/ui-v4-designer-divergence-list.mjs --write`',
    '',
  ];

  for (const [label, bucket] of ordered) {
    out.push(`## ${label} — ${bucket.items.length}`, '', `**Предложение:** ${bucket.proposal}`, '');
    out.push('| Зона | Ключ | Что разошлось |', '| --- | --- | --- |');
    for (const item of bucket.items) {
      const cell = (value) => String(value).replaceAll('|', '\|');
      out.push(`| ${cell(item.zoneId)} | ${cell(item.key)} | ${cell(item.phrase)} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function runCli(argv) {
  const rows = buildDivergenceRows(readAllZones());
  if (!argv.includes('--write')) {
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
    return 0;
  }
  fs.writeFileSync(JSON_OUT, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
  fs.writeFileSync(MD_OUT, `${renderMarkdown(rows)}\n`, 'utf8');
  process.stdout.write(`строк «≠»: ${rows.length}\n${JSON_OUT}\n${MD_OUT}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('ui-v4-designer-divergence-list.mjs')) {
  process.exitCode = runCli(process.argv.slice(2));
}
