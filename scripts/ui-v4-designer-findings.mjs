#!/usr/bin/env node
/**
 * Находки для дизайнера — по одной находке на ответ.
 *
 * Дизайнер попросил именно такой формат после того, как ответил на три штуки:
 * «Формат "одна находка — один ответ" прошу оставить и для остальных». Причина
 * видна по самим ответам: один из трёх снял с нас работу («не релиз-блокер»),
 * второй её создал («это не решение, а ваш дефект»), третий изменил условие
 * задачи (строку контракта он переписал). Сгруппировать такое по классам
 * причины нельзя — ответы внутри одного класса расходятся.
 *
 * Находка здесь — это формулировка расхождения, повторённая в двух и более
 * строках контракта. Одиночные формулировки в файл не идут — их сотни, они не
 * складываются в решение и живут построчно в UI_V4_DIVERGENCE_ROWS.md. Число
 * здесь намеренно не названо: оно меняется каждый час, а комментарий нет.
 *
 * Числа не пишутся руками: файл собирается из вердиктов на момент запуска,
 * поэтому закрытая находка исчезает сама, а не остаётся висеть в списке.
 *
 *   node scripts/ui-v4-designer-findings.mjs           # печать в stdout
 *   node scripts/ui-v4-designer-findings.mjs --write   # запись файла
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDivergenceRows } from './ui-v4-designer-divergence-list.mjs';
import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/ui/UI_V4_FINDINGS_FOR_DESIGNER.md');

/** Минимальный размер находки: одна строка — это не находка, а строка. */
const MIN_ROWS = 2;

/**
 * Ответы, уже полученные от дизайнера. Ключ — формулировка (её начало),
 * потому что номера находок меняются при каждой пересборке, а формулировка нет.
 * Держим их в файле, чтобы список был полным: закрытая находка должна быть
 * видна вместе с решением, иначе через неделю никто не вспомнит, почему по ней
 * не работали.
 */
const ANSWERED = [
  {
    match: /finishPastDay\/deletePastSession/,
    answer:
      'Верен кадр, и это долг по данным. Незакрытая сессия не попадает в тоннаж, '
      + 'значит вчерашний день остаётся неверным навсегда и починить его человеку '
      + 'нечем. Три исхода отвечают на три разные причины; автозавершения нет '
      + 'намеренно — закрыть сессию самому значит выдумать время окончания. '
      + 'НЕ релиз-блокер: новую тренировку начать можно, вчерашняя ждёт.',
    ours: 'Строим по кадру, но после релиза. Строки остаются «≠» с этим решением как основанием.',
  },
  {
    match: /фоновая перерисовка Главной в листе/,
    answer:
      'Находка на мой критерий, а не на кадр. Критерий предполагает, что '
      + 'расхождение — это решение. Здесь решения нет: один и тот же элемент '
      + 'рисуется двумя путями в зависимости от того, открыт ли лист. Это класс '
      + 'моей девятнадцатой проверки («один элемент — два вида»), и она его не '
      + 'поймала, потому что второй вид живёт в продукте, а не в кадрах. '
      + 'Правка — один путь отрисовки, иначе они будут расходиться дальше.',
    ours: 'Принято как наш дефект. Единый путь отрисовки сделан задачей 96.',
  },
  {
    match: /кадр даёт две оценки рядом/,
    answer:
      'Верен кадр, но померили вы по моей лжи. Строка складывала три решения, и '
      + 'среднее противоречило последнему: читающий сверху вниз попадал на снятый '
      + 'ответ. Переписал — решение первым. Снятой была ветка с двумя РАВНЫМИ '
      + 'карточками без выбранной, а не две карточки вообще.',
    ours: 'Ждём поставки пакета с переписанной строкой; до неё вердикт не пересматриваем.',
  },
];

/** «22 строки», а не «22 строк»: файл читает человек, а не парсер. */
function plural(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
const rowsWord = (n) => plural(n, 'строка', 'строки', 'строк');

/**
 * Формулировка в списке расхождений обрезана до 200 знаков — это годится для
 * таблицы и не годится для вопроса человеку: обрыв на многоточии съедает как
 * раз ту часть, где сказано, чем продукт отличается. Полный текст берём из
 * самого вердикта по паре «зона + ключ».
 */
function fullFact(data, zoneId, key) {
  const row = data?.zones?.[zoneId]?.rows?.[key];
  return String(row?.f || '').replace(/\s+/g, ' ').trim();
}

function groupFindings(rows) {
  const byPhrase = new Map();
  for (const row of rows) {
    const phrase = String(row.phrase || '').trim();
    if (!phrase) continue;
    if (!byPhrase.has(phrase)) byPhrase.set(phrase, []);
    byPhrase.get(phrase).push(row);
  }
  const findings = [];
  for (const [phrase, items] of byPhrase) {
    if (items.length < MIN_ROWS) continue;
    const answered = ANSWERED.find((a) => a.match.test(phrase)) || null;
    findings.push({
      phrase,
      rows: items,
      zones: [...new Set(items.map((r) => r.zoneId))].sort(),
      proposal: items[0].proposal || '—',
      answered,
    });
  }
  findings.sort((a, b) => b.rows.length - a.rows.length);
  return { findings, singles: rows.length - findings.reduce((s, f) => s + f.rows.length, 0) };
}

function renderKeys(items) {
  const keys = items.map((r) => `${r.zoneId} · ${r.key}`);
  const shown = keys.slice(0, 5).map((k) => `\`${k}\``).join(' · ');
  return keys.length > 5 ? `${shown} … и ещё ${keys.length - 5}` : shown;
}

export function renderFindings(rows, data, today = new Date().toISOString().slice(0, 10)) {
  const { findings, singles } = groupFindings(rows);
  const answered = findings.filter((f) => f.answered);
  const open = findings.filter((f) => !f.answered);
  const out = [];

  out.push('# UI v4 — находки для дизайнера, по одной');
  out.push('');
  out.push(`Срез: **${today}**. Строк «≠» всего: **${rows.length}**.`);
  out.push('');
  out.push(
    `Находка — формулировка расхождения, повторённая в двух и более строках `
    + `контракта. Таких **${findings.length}**, они покрывают `
    + `**${rowsWord(findings.reduce((s, f) => s + f.rows.length, 0))}**. `
    + `Отвечено **${answered.length}**, открыто **${open.length}**.`,
  );
  out.push('');
  out.push(
    `Остальные **${rowsWord(singles)}** — формулировки, встретившиеся по одному разу. `
    + 'В этот файл они не идут: поодиночке они не складываются в решение. '
    + 'Они лежат построчно в `docs/ui/UI_V4_DIVERGENCE_ROWS.md`, и если по '
    + 'какой-то захочется ответить — отвечайте прямо там.',
  );
  out.push('');
  out.push(
    'Число расходится с прежним: часть находок закрылась между отправкой и '
    + 'этим срезом. Крупнейшая — три полноэкранных исхода предложения: они были '
    + 'не нарисованы иначе, а не написаны вовсе, и теперь построены.',
  );
  out.push('');
  out.push('## Как отвечать');
  out.push('');
  out.push('По каждой находке — один из трёх ответов:');
  out.push('');
  out.push('- **одобрить как правило** — кадр устарел, продукт верен, приводим кадр;');
  out.push('- **мы починим кодом** — кадр верен, правим продукт;');
  out.push('- **спорно** — нужен разбор, и тогда скажите, чем именно он спорен.');
  out.push('');
  out.push(
    'Колонка «наше предложение» — рекомендация до вашего ответа, не решение. '
    + 'Если ответ меняет строку контракта, он приезжает поставкой пакета: '
    + 'переписанную строку мы видим только оттуда, а не из письма.',
  );
  out.push('');

  if (answered.length) {
    out.push(`## Уже отвечено (${answered.length})`);
    out.push('');
    for (const f of answered) {
      out.push(`### ✔ ${rowsWord(f.rows.length)} · ${f.zones.join(', ')}`);
      out.push('');
      out.push(`**Что видим.** ${fullFact(data, f.rows[0].zoneId, f.rows[0].key) || f.phrase}`);
      out.push('');
      out.push(`**Ваш ответ.** ${f.answered.answer}`);
      out.push('');
      out.push(`**Что делаем.** ${f.answered.ours}`);
      out.push('');
    }
  }

  out.push(`## Открыто (${open.length})`);
  out.push('');
  open.forEach((f, i) => {
    const n = String(i + 1).padStart(2, '0');
    out.push(`### Находка ${n} · ${rowsWord(f.rows.length)} · ${f.zones.join(', ')}`);
    out.push('');
    out.push(`**Что видим.** ${fullFact(data, f.rows[0].zoneId, f.rows[0].key) || f.phrase}`);
    out.push('');
    out.push(`**Строки.** ${renderKeys(f.rows)}`);
    out.push('');
    out.push(`**Наше предложение.** ${f.proposal}`);
    out.push('');
    out.push('**Ваш ответ:**');
    out.push('');
  });

  return out.join('\n');
}

function runCli(argv) {
  const data = readAllZones();
  const rows = buildDivergenceRows(data);
  const text = `${renderFindings(rows, data)}\n`;
  if (!argv.includes('--write')) {
    process.stdout.write(text);
    return 0;
  }
  fs.writeFileSync(OUT, text, 'utf8');
  process.stdout.write(`${OUT}\n`);
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('ui-v4-designer-findings.mjs')) {
  process.exitCode = runCli(process.argv.slice(2));
}
