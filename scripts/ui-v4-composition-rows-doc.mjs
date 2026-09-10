#!/usr/bin/env node
/**
 * Список строк «композиция/UX» + «функциональный поток» для поштучного разбора
 * дизайнером (пакет 48). Источник ключей и класса — UI_V4_DIVERGENCE_ROWS.json
 * (срез классификатора ui-v4-group-deviations-for-designer.mjs).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'docs/ui/UI_V4_COMPOSITION_ROWS.md');
const JSON_PATH = path.join(ROOT, 'docs/ui/UI_V4_DIVERGENCE_ROWS.json');
const TARGET_CLASSES = new Set(['composition-ux', 'functional-flow']);

function loadDivergenceRows() {
  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  return {
    rows,
    source: 'docs/ui/UI_V4_DIVERGENCE_ROWS.json (срез после ui-v4-designer-divergence-list.mjs --write)',
  };
}

function factByKey(data) {
  const map = new Map();
  const zones = data.zones || data;
  for (const [zoneId, zone] of Object.entries(zones)) {
    for (const [key, entry] of Object.entries(zone.rows || {})) {
      if (entry?.v === '≠' && entry.f) map.set(`${zoneId}\0${key}`, entry.f.trim());
    }
  }
  return map;
}

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim();
}

function shorten(s, limit = 220) {
  const t = clean(s);
  if (t.length <= limit) return t;
  return `${t.slice(0, limit - 1).trimEnd()}…`;
}

function stripBoilerplate(f) {
  return clean(
    String(f)
      .replace(/\s*Расхождение видно и принято без построчного разбора:[\s\S]*$/i, '')
      .replace(/\s*Строку отнёс к принятым[\s\S]*$/i, '')
      .replace(/\s*Обе строки в пакете живы\s*/gi, '')
      .replace(/\s*Взят состав кадра\s*/gi, '')
      .replace(/\s*Это функция, а не геометрия[^.;]*[.;]?\s*/gi, '')
      .replace(/\s*— записано дизайнеру[^.;]*[.;]?\s*/gi, '')
      .replace(/\s*\(то же:[^)]+\)\s*/gi, ''),
  );
}

/** Разбор поля f на кадр / код / фразу для дизайнера. */
function parseFact(fact, classId, key) {
  const core = stripBoilerplate(fact);
  if (!core) {
    return { frame: '—', code: '—', divergence: 'факт в вердикте пуст' };
  }

  const canvasProduct = core.match(/кадр\s+[^;]{8,200};\s*продукт\s+([^.;]{8,200})/i);
  if (canvasProduct) {
    const framePart = core.match(/кадр\s+([^;]{8,200})/i)?.[1] || '';
    return {
      frame: shorten(humanizeNumbers(`кадр ${framePart}`), 220),
      code: shorten(humanizeNumbers(`продукт ${canvasProduct[1]}`), 220),
      divergence: shorten(
        humanizeNumbers(buildHumanDivergence(core, classId, key)),
        260,
      ),
    };
  }

  const frame = shorten(humanizeNumbers(extractFrame(core, classId, key)), 220);
  const code = shorten(humanizeNumbers(extractCode(core, key)), 220);
  const divergence = shorten(humanizeNumbers(buildHumanDivergence(core, classId, key)), 260);

  return {
    frame: frame || '—',
    code: code || '—',
    divergence: divergence || core,
  };
}

function extractCode(f, key) {
  const pathRe = /(?:apps\/web\/)?[\w./-]+\.(?:js|css)(?::\d+(?:-\d+)?)?[^.;]{0,100}/;
  const pathHit = f.match(pathRe)?.[0];
  if (pathHit) return pathHit;

  const prod = f.match(/(?:продукт|runtime|в продукте)[^.;]{12,200}/i)?.[0];
  if (prod) return prod;

  if (/по кадру,\s*но/i.test(f)) {
    const before = f.split(/\s*но\s+/i)[0];
    return before.replace(/,\s*$/, '');
  }

  if (/стоит первым|порядок ряда/i.test(f)) {
    const actual = f.match(/старшинству групп\s+\(([^)]+)\)/i)?.[1];
    if (actual) return `порядок чипов по группам (${actual})`;
    return f.split(/\s*:\s*/)[0];
  }

  const first = f.split(/\s*;\s+/).find((p) => /(?:heys_|\.css|\.js|styles\/)/.test(p));
  return first || f.split(/\s*;\s+/)[0] || '';
}

function extractFrame(f, classId, key) {
  const give = f.match(/кадр\s+(?:даёт|рисует|просит|требует|ждёт|говорит)\s+[^.;]{8,180}/i)?.[0];
  if (give) return give;

  const protiv = f.match(/(?:против|а не по перечислению)\s+([^.:]{4,140})/i)?.[1];
  if (protiv && !/не по перечислению/i.test(f)) return `кадр ждёт ${protiv}`;

  if (/не по перечислению/i.test(f)) {
    const listed = f.match(/перечислени[юя]\s+этой строки\s+\(([^)]+)\)/i)?.[1];
    if (listed) return `порядок чипов по контракту (${listed})`;
  }

  const contract = f.match(/строка\s+«[^»]+»[^.;]{0,120}/i)?.[0];
  if (contract) return contract;

  if (/по кадру,\s*но/i.test(f)) {
    const after = f.split(/\s*но\s+/i)[1] || '';
    const need = after.match(/[^.:]{8,120}/)?.[0];
    if (need) return `кадр требует ${need}`;
  }

  const matched = f.match(/([^.;]{6,120})\s+совпали;\s*([^.;]+)/i);
  if (matched) return `кадр: ${matched[1]}`;

  if (classId === 'functional-flow' && /кадр/i.test(f)) {
    const head = f.split(/\s*;\s*(?:продукт|runtime|в продукте|apps\/web)/i)[0];
    if (head) return head;
  }

  const parts = f.split(/\s*;\s+/);
  const canvasClause = parts.find((p) => /кадр/i.test(p) && !/(?:heys_|\.css|\.js)/.test(p));
  if (canvasClause) return canvasClause;

  return key ? `строка контракта «${key}»` : '';
}

function buildHumanDivergence(f, classId, key) {
  const matchedThenDelta = f.match(/([^.;]{8,140})\s+совпали;\s*([^.;]+)/i);
  if (matchedThenDelta) {
    const delta = matchedThenDelta[2];
    if (/вместо/i.test(delta)) {
      const vm = delta.match(/([^.;]{4,80})\s+вместо\s+([^.;]{3,80})/i);
      if (vm) {
        return `размеры совпали, но ${humanizeNumbers(vm[1])} вместо ${humanizeNumbers(vm[2])}`;
      }
    }
    return `${humanizeNumbers(delta)} — геометрия совпала, отличается оформление`;
  }

  if (/счёта справа у строк/i.test(f)) {
    return 'в кадре у яруса нет чисел справа, продукт всё ещё показывает счёт у строк';
  }

  if (/кнопок в ряду три/i.test(f)) {
    return 'в ряду три кнопки вместо двух — в кадре нет отдельной «Обновить»';
  }

  if (/не по перечислению/i.test(f)) {
    const listed = f.match(/перечислени[юя]\s+этой строки\s+\(([^)]+)\)/i)?.[1];
    const actual = f.match(/старшинству групп\s+\(([^)]+)\)/i)?.[1];
    if (listed && actual) {
      return `в кадре порядок (${listed}), в продукте по группам (${actual}) — два разных порядка на одном экране`;
    }
    return 'порядок фильтров не совпадает с порядком групп списка';
  }

  const butNot = f.match(/([^.;]{6,100}?),\s*а не\s+([^.:]{2,60})/i);
  if (butNot) {
    const right = butNot[2].replace(/^две\b/i, 'двух').replace(/^два\b/i, 'двух');
    return `${humanizeNumbers(butNot[1])} вместо ${humanizeNumbers(right)}`;
  }

  const vm = f.match(/([^.;]{6,100}?)\s+вместо\s+([^.;]{3,90})/i);
  if (vm) {
    const left = vm[1].replace(/^.*\b(заливка|фон|padding|отступ|радиус|зазор|gap|цвет|кнопк\w*|меню|список|ряд|порядок)\b/i, '$1');
    return `${humanizeNumbers(left.trim())} вместо ${humanizeNumbers(vm[2].trim())}`;
  }

  if (/стрелки 14\s*×\s*14,\s*рисую 17/i.test(f)) {
    return 'стрелки у поля 17 пикс. вместо 14 — общий размер оболочки, не меняли под три кадра зоны';
  }

  if (classId === 'functional-flow') {
    if (/пилюлями цифр/i.test(f) && /редактор/i.test(f)) {
      return 'в кадре вес вводят пилюлями в листе, в продукте «Записать вес» открывает редактор дня';
    }
    if (/крест/i.test(f) && /(?:назад|шеврон|возврат)/i.test(f)) {
      return 'кадр закрывает экран крестом, продукт использует общий «Назад» шага';
    }
    if (/нижн/i.test(f) && /(?:поле|ввод).*открыт/i.test(f)) {
      return 'кадр прячет ручной ввод за нижней кнопкой, в продукте поле всегда над сканером';
    }
    if (/модалка.*закрывается/i.test(f)) {
      return 'кадр держит отдельный экран «не найден», продукт закрывает сканер и показывает подсказку в строке';
    }
  }

  const narrative = f.match(/кадр\s+даёт\s+([^.;]{10,120}).*?продукт\s+([^.;]{10,140})/i);
  if (narrative) {
    return `кадр — ${humanizeNumbers(narrative[1])}, продукт — ${humanizeNumbers(narrative[2])}`;
  }

  const parts = f.split(/\s*;\s+/);
  if (parts.length >= 2) {
    const tail = parts[parts.length - 1];
    if (/вместо|против|а не|нет|не |друг|иной|уводит|открывает|порядок|счёт|меню|список|кнопк/i.test(tail)) {
      return humanizeNumbers(tail);
    }
  }

  if (/порядок/i.test(f)) return humanizeNumbers(f.match(/порядок[^.;]{0,120}/i)?.[0] || f);
  if (/отступ|зазор|gap/i.test(f)) return humanizeNumbers(f.match(/(?:отступ|зазор|gap)[^.;]{0,100}/i)?.[0] || f);

  const firstSentence = f.split(/[.:](?=\s+[А-ЯA-Z«(])/)[0];
  return humanizeNumbers(firstSentence || f);
}

function stripLead(s, re) {
  return clean(String(s).replace(re, ''));
}

function humanizeNumbers(s) {
  return clean(s)
    .replace(/\bvar\(--v4-sand-surface\)/gi, 'песочная поверхность')
    .replace(/\bvar\(--v4-c1\)/gi, 'акцентный фон c1')
    .replace(/\bvar\(--gr-bg\)/gi, 'фон графика')
    .replace(/--v4-c1\b/gi, 'акцент c1')
    .replace(/--gr-bg\b/gi, 'фон графика')
    .replace(/--c1\b/gi, 'акцент c1')
    .replace(/\b(\d+(?:[,.]\d+)?)\s*px\b/gi, '$1 пикс.')
    .replace(/\bgap\s*(\d+)/gi, 'зазор $1')
    .replace(/\br(\d+)/gi, 'радиус $1')
    .replace(/\bvar\(--v4-[\w-]+\)/gi, 'роль набора')
    .replace(/--v4-[\w-]+/g, 'роль набора');
}

function renderMarkdown(rows, meta) {
  const today = new Date().toISOString().slice(0, 10);
  const byClass = {
    'composition-ux': rows.filter((r) => r.classId === 'composition-ux'),
    'functional-flow': rows.filter((r) => r.classId === 'functional-flow'),
  };

  const lines = [
    '# UI v4 — композиция и функциональный поток (пакет 48)',
    '',
    `Срез: **${today}**.`,
    '',
    '## Откуда строки',
    '',
    `- **Источник ключей и класса:** ${meta.jsonSource}`,
    ...(meta.excluded && meta.excluded.length
      ? [
          '',
          '## Снято с разбора и почему',
          '',
          'Это не сокращение списка под ожидаемое число: снятое перечислено ниже,',
          'чтобы было видно, что именно ушло. Правило — из ответа дизайнера',
          '10 сентября: критерий применялся к полю «факт», а факт пересказывает всю',
          'строку контракта, поэтому в класс попадало не относящееся к композиции.',
          '',
          `Снято **${meta.excluded.length}** строк из ${meta.excluded.length + rows.length}.`,
          '',
          '| Строка | Зона | Почему снята |',
          '| --- | --- | --- |',
          ...meta.excluded.map((r) => `| ${r.key} | ${r.zoneId} | ${r.ruleLabel} |`),
          '',
          '## Не композиция: цвет и роль — правка на нашей стороне',
          '',
          'Разбор дизайнера 10 сентября. Кадр просит `--c1`, код даёт грунт `--bg`.',
          'Обе роли существуют, спор в том, какая верна, и верен кадр: карточка на',
          'грунте не отделяется от фона экрана. Разбирать их не нужно — это наша',
          'правка; строки оставлены в файле, чтобы не потерялись.',
          '',
          ...[...CYCLE_COLOR_ROLE].map((k) => `- \`${k}\` — cycle`),
        ]
      : []),
    '- **Классификатор:** `scripts/ui-v4-group-deviations-for-designer.mjs` → поле `classId`',
    '- **Факты «кадр vs код»:** поле `f` вердиктов `docs/ui/verdicts/<зона>.json` (`v === "≠"`)',
    '- **Ожидание дизайнера (5 сентября):** 124 + 22 = **146** строк — [`UI_V4_FINDINGS_HISTORY.md#p48-composition-ux-review-criterion-2026-09-05`](UI_V4_FINDINGS_HISTORY.md#p48-composition-ux-review-criterion-2026-09-05)',
    '',
    '## Счёт (два способа)',
    '',
    `| Способ | composition-ux | functional-flow | Сумма |`,
    `| --- | ---: | ---: | ---: |`,
    `| ${meta.countA.label} | ${meta.countA.composition} | ${meta.countA.flow} | **${meta.countA.sum}** |`,
    `| ${meta.countB.label} | ${meta.countB.composition} | ${meta.countB.flow} | **${meta.countB.sum}** |`,
    '',
    meta.countNote,
    '',
    'Формат строки: **ключ** · зона · что просит кадр · что даёт код · в чём расхождение.',
    '',
    '---',
    '',
    `## композиция и UX — ${byClass['composition-ux'].length}`,
    '',
  ];

  for (const row of byClass['composition-ux']) {
    lines.push(formatRow(row));
    lines.push('');
  }

  lines.push('---', '', `## функциональный поток — ${byClass['functional-flow'].length}`, '');

  for (const row of byClass['functional-flow']) {
    lines.push(formatRow(row));
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function formatRow(row) {
  const p = row.parsed;
  return [
    `### ${row.key}`,
    '',
    `- **Зона:** ${row.zoneId}`,
    `- **Кадр:** ${p.frame}`,
    `- **Код:** ${p.code}`,
    `- **Расхождение:** ${p.divergence}`,
  ].join('\n');
}

function countH3BySection(md) {
  const flowIdx = md.indexOf('## функциональный поток');
  const compSection = flowIdx >= 0 ? md.slice(0, flowIdx) : md;
  const flowSection = flowIdx >= 0 ? md.slice(flowIdx) : '';
  const composition = compSection.split('\n').filter((l) => l.startsWith('### ')).length;
  const flow = flowSection.split('\n').filter((l) => l.startsWith('### ')).length;
  return { composition, flow, sum: composition + flow };
}

// Строки, которые в композицию НЕ идут.
//
// Ответ дизайнера 10 сентября на список из 174: критерий применён к полю
// «факт», а факт часто пересказывает всю строку контракта — поэтому в класс
// попало то, что к композиции не относится. Его указание: пересобрать по тому,
// В ЧЁМ РАСХОЖДЕНИЕ, а строки с признаком отсутствия кода не брать вовсе.
//
// Отдельного поля «в чём расхождение» в данных нет — есть только факт вердикта.
// Поэтому отсеиваем по признакам в самом факте, и только по тем, что дают
// РОВНО его числа: 15 и 8. Третий его класс — «тон и ступени», 34 строки — по
// названным им процентам даёт 13, и подгонять правило под 34 наугад нельзя:
// список пойдёт человеку в руки. По нему задан отдельный вопрос.
// Строки Цикла, которые дизайнер разобрал отдельно 10 сентября: это НЕ тон и
// не композиция, а роль против роли — кадр просит --c1, код даёт грунт --bg.
// Обе роли существуют, спор в том, какая верна, и верен кадр: карточка на
// грунте не отделяется от фона экрана. Из списка их не снимаем — он просил
// перенести, а не убрать: разбирать их ему не нужно, правка на нашей стороне.
// Список его, поимённо, и потому записан списком, а не правилом.
const CYCLE_COLOR_ROLE = new Set([
  'график веса · 01',
  'график калорий · 01',
  'закончились раньше · 01',
  'шаг 5, выбор дня · 01',
  'шаг 5, строка в стопке · 07',
  'шаг 5, строка в стопке · 11',
  'инсайт баланса · 01',
]);

const EXCLUDE = [
  {
    id: 'no-code',
    label: 'функциональности нет в коде',
    why: 'это «?», а не отступление: спорить не с чем, пока нечего сверять',
    test: (f) => /кода нет вовсе|в коде нет|не реализован|механики нет/i.test(f),
  },
  {
    // Правило дизайнера 10 сентября, дословно: «факт называет процент, которого
    // нет среди ступеней 56/45/38/30 (в тёмных 63/50/46/30). Фильтруйте по
    // числу, а не по слову „тон“».
    //
    // Одна оговорка от него же: считать только проценты, относящиеся к
    // ЧЕРНИЛАМ. Он сам снял из класса food-meal «74 против 86» со словами «это
    // не проценты» — ширина в процентах к лестнице отношения не имеет. Без
    // этой оговорки правило ловит 24 строки вместо 19.
    id: 'ink-step',
    label: 'доля чернил вне лестницы ступеней',
    why: 'закрытый класс с 6 сентября: таких ступеней не существует, спорить не о чем',
    test: (f) => {
      const STEPS = new Set([56, 45, 38, 30, 63, 50, 46]);
      for (const m of f.matchAll(/(\d{1,3})\s*%/g)) {
        const near = f.slice(Math.max(0, m.index - 60), m.index + 20);
        if (!/чернил|ink|тон/i.test(near)) continue;
        if (!STEPS.has(Number(m[1]))) return true;
      }
      return false;
    },
  },
  {
    id: 'same-view',
    label: 'факт сам говорит «тот же вид»',
    why: 'это «=»: расхождения нет, вердикт стоит неверный',
    test: (f) => /тот же вид|то же самое/i.test(f),
  },
];

function main() {
  const { rows: allRows, source: jsonSource } = loadDivergenceRows();
  const inClass = allRows.filter((r) => TARGET_CLASSES.has(r.classId));
  const facts = factByKey(readAllZones());

  const excluded = [];
  const filtered = inClass.filter((row) => {
    const f = facts.get(`${row.zoneId}\0${row.key}`) || row.phrase || '';
    const hit = EXCLUDE.find((rule) => rule.test(f));
    if (hit) excluded.push({ ...row, ruleId: hit.id, ruleLabel: hit.label });
    return !hit;
  });
  const byRule = new Map();
  for (const row of excluded) byRule.set(row.ruleId, (byRule.get(row.ruleId) || 0) + 1);
  console.log(`в двух классах ${inClass.length}, снято ${excluded.length}, к разбору ${filtered.length}`);
  for (const rule of EXCLUDE) console.log(`  снято «${rule.label}»: ${byRule.get(rule.id) || 0}`);

  const enriched = filtered.map((row) => {
    const fullF = facts.get(`${row.zoneId}\0${row.key}`) || row.phrase;
    return {
      ...row,
      parsed: parseFact(fullF, row.classId, row.key),
    };
  });

  enriched.sort((a, b) => {
    const z = a.zoneId.localeCompare(b.zoneId, 'ru');
    if (z !== 0) return z;
    return a.key.localeCompare(b.key, 'ru');
  });

  const countA = {
    label: 'Фильтр JSON по classId (свежий срез)',
    composition: enriched.filter((r) => r.classId === 'composition-ux').length,
    flow: enriched.filter((r) => r.classId === 'functional-flow').length,
    sum: enriched.length,
  };

  const countNote = [
    countA.sum === 146
      ? 'Сходится с ожиданием **146**.'
      : `В свежем срезе **${countA.sum}** (composition-ux ${countA.composition}, functional-flow ${countA.flow}), не 146.`,
    'Две строки из письма 5 сентября (`food-meal · Наборы · вкладка поиска · 12/13`) сейчас в вердиктах `=` (touch 44px) — в списке «≠» их нет.',
    countA.sum > 146
      ? `Плюс ${countA.sum - 146} к 146: после типизации legacy-mismatch часть «≠» с reasonCode owner-decision снова попадает в composition/flow, если факт матчит критерий пакета 48 (приоритет классификатора выше owner-decision).`
      : countA.sum < 146
        ? `Минус ${146 - countA.sum} к 146: закрытые «=» и сужение общего хвоста «≠» (901 → ${allRows.length} в divergence JSON).`
        : '',
  ]
    .filter(Boolean)
    .join(' ');

  const mdDraft = renderMarkdown(enriched, {
    jsonSource,
    countA,
    countB: { label: 'Заголовки ### в сгенерированном файле', composition: 0, flow: 0, sum: 0 },
    countNote,
  });
  const countB = {
    label: 'Заголовки ### в сгенерированном файле',
    ...countH3BySection(mdDraft),
  };

  const mdFinal = renderMarkdown(enriched, { jsonSource, countA, countB, countNote, excluded });
  fs.writeFileSync(OUT, mdFinal, 'utf8');

  if (countB.sum !== countA.sum) {
    process.stderr.write(`warn: h3 ${countB.sum} != rows ${countA.sum}\n`);
  }

  process.stdout.write(
    `written ${OUT}\nrows ${countA.sum} h3 ${countB.sum}\ncomposition ${countA.composition}/${countB.composition} flow ${countA.flow}/${countB.flow}\n`,
  );
}

main();
