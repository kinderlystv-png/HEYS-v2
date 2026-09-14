#!/usr/bin/env node
/**
 * Срез журнала расхождений для дизайнера — очередной заход.
 *
 * Список открытого меняется каждый заход, и написанный руками срез устаревает
 * раньше, чем его прочитают: 14 сентября сплошная сверка нашла семнадцать
 * записей, уже отвеченных дизайнером, — они ушли бы к нему обратно как
 * «ждём ответа». Поэтому файл собирается из самого журнала, а не набирается.
 *
 * В срез идёт то, что ЖДЁТ ОТВЕТА: у каждой записи остаётся заголовок, строка
 * «чей ход» и ссылка на разбор. Всё остальное — в журнале, и повторять его
 * здесь значит заставить читать одно и то же дважды.
 *
 *   node scripts/ui-v4-designer-request.mjs 6              # печать
 *   node scripts/ui-v4-designer-request.mjs 6 --write      # запись файла
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JOURNAL = path.join(ROOT, 'docs/ui/UI_V4_FINDINGS.md');

// Имя зоны для человека — по началу якоря. Порядок здесь и есть порядок в
// шапке при равном числе записей: от того, где работы больше.
const ZONES = [
  ['strength', 'Силовая'],
  ['checkin', 'Чек-ин утра'],
  ['insights', 'Отчёты и инсайты'],
  ['reports', 'Отчёты и инсайты'],
  ['messenger', 'Мессенджер'],
  ['curator', 'Кабинет куратора'],
  ['calendar', 'Дата и календарь'],
  ['date', 'Дата и календарь'],
  ['today', 'Дата и календарь'],
  ['nutrition', 'Питание'],
  ['food', 'Питание'],
  ['transfer', 'Питание'],
  ['home', 'Главная'],
  ['health', 'Главная'],
  ['login', 'Вход и регистрация'],
  ['registration', 'Вход и регистрация'],
  ['first-run', 'Первый вход'],
  ['subscription', 'Подписка'],
  ['tips', 'Советы'],
  ['water', 'Вода'],
];

function zoneOf(anchor) {
  for (const [prefix, name] of ZONES) if (anchor.startsWith(prefix)) return name;
  return 'Прочее';
}

/** Записи журнала: якорь, статус, заголовок, «чей ход». */
export function readEntries(markdown) {
  const entries = [];
  const parts = markdown.split(/<a id="([a-z0-9-]+)"><\/a>/i);
  // parts: [до первого якоря, якорь1, тело1, якорь2, тело2, …]
  for (let i = 1; i < parts.length; i += 2) {
    const anchor = parts[i];
    const body = parts[i + 1] || '';
    const heading = body.match(/^\s*###\s+(?:`([?!])`\s+)?(.+?)\s*$/m);
    if (!heading) continue;
    const turn = body.match(/\*\*Чей ход\.\*\*\s*([\s\S]*?)(?:\n\n|$)/);
    entries.push({
      anchor,
      status: heading[1] || '!',
      title: heading[2].trim(),
      turn: turn ? turn[1].replace(/\s+/g, ' ').trim() : '',
      zone: zoneOf(anchor),
    });
  }
  return entries;
}

// Записи, где ход у владельца, дизайнеру не адресованы и в срез не идут.
// Без `\b`: в JS граница слова считается по латинице, и после кириллической
// «а» перед двоеточием её нет — условие молча не срабатывало ни разу.
const OWNER_ONLY = /^Владельца[:\s]/i;

function section(entries, title, note) {
  const byZone = new Map();
  for (const entry of entries) {
    if (!byZone.has(entry.zone)) byZone.set(entry.zone, []);
    byZone.get(entry.zone).push(entry);
  }
  const zones = [...byZone.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  const lines = ['---', '', `# ${title}`, '', note, ''];
  for (const [name, list] of zones) {
    lines.push(`## ${name}`);
    lines.push('');
    for (const entry of list) {
      lines.push(`### ${entry.title}`);
      lines.push('');
      if (entry.turn) {
        lines.push(`**Чей ход.** ${entry.turn}`);
        lines.push('');
      }
      lines.push(`Разбор — [\`${entry.anchor}\`](UI_V4_FINDINGS.md#${entry.anchor}).`);
      lines.push('');
    }
  }
  return lines;
}

export function buildRequest(allEntries, { number, date }) {
  const entries = allEntries.filter((entry) => !OWNER_ONLY.test(entry.turn));
  const waiting = entries.filter((entry) => entry.status === '?');
  const decided = entries.filter((entry) => entry.status !== '?');
  const byZone = new Map();
  for (const entry of entries) {
    if (!byZone.has(entry.zone)) byZone.set(entry.zone, []);
    byZone.get(entry.zone).push(entry);
  }
  const zones = [...byZone.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  const width = Math.max(4, ...zones.map(([name]) => name.length));
  const pad = (s) => s + ' '.repeat(width - s.length);

  const lines = [];
  lines.push(`# Заход к дизайнеру № ${number} — открытое на ${date}`);
  lines.push('');
  lines.push('Собрано из журнала [`UI_V4_FINDINGS.md`](UI_V4_FINDINGS.md) — только записи,');
  lines.push('которые ждут ответа. Разобранное и закрытое лежит в');
  lines.push('[`UI_V4_FINDINGS_HISTORY.md`](UI_V4_FINDINGS_HISTORY.md) и сюда не попало.');
  lines.push('');
  lines.push('**Источник правды — сам журнал.** Здесь срез: заголовок, чей ход и ссылка на');
  lines.push('разбор. Пересказывать разбор второй раз значит заставить читать одно и то же.');
  lines.push('');
  lines.push(`**Объём.** Записей — ${entries.length}, зон — ${zones.length}.`);
  lines.push(
    `Ждут вашего ответа — ${waiting.length}; решено без вас, за вами перерисовка — ${decided.length}.`,
  );
  lines.push('');
  lines.push(`| ${pad('Зона')} | Записей |`);
  lines.push(`| ${'-'.repeat(width)} | ------- |`);
  for (const [name, list] of zones)
    lines.push(`| ${pad(name)} | ${String(list.length).padEnd(7)} |`);
  lines.push('');

  if (waiting.length) {
    lines.push(
      ...section(
        waiting,
        'Ждут вашего ответа',
        'Пока ответа нет, эти места стоят: сводить код не по чему, а угадать значит\nразвести код и кадр.',
      ),
    );
  }
  if (decided.length) {
    lines.push(
      ...section(
        decided,
        'Решено без вас — к сведению',
        'Здесь ждать было нельзя: правило платформы или явный дефект. Код уже стоит по\nрешению, за вами — перерисовать кадр, чтобы он не спорил с продуктом.',
      ),
    );
  }
  return lines.join('\n');
}

function runCli(argv) {
  const number = argv.find((a) => /^\d+$/.test(a));
  if (!number) {
    process.stderr.write('Укажите номер захода: node scripts/ui-v4-designer-request.mjs 6\n');
    return 1;
  }
  const date = new Date().toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const text = buildRequest(readEntries(fs.readFileSync(JOURNAL, 'utf8')), { number, date });
  if (!argv.includes('--write')) {
    process.stdout.write(text);
    return 0;
  }
  const out = path.join(ROOT, `docs/ui/UI_V4_DESIGNER_REQUEST_${number}.md`);
  fs.writeFileSync(out, `${text}\n`);
  process.stdout.write(`${out}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('ui-v4-designer-request.mjs')) {
  process.exitCode = runCli(process.argv.slice(2));
}
