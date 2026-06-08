#!/usr/bin/env node
// school-weights.mjs — пересчёт «доли опоры» школ/течений в METHODOLOGY.md.
//
// Что делает: оценивает, насколько методология ОПИРАЕТСЯ на каждую школу, и
// переписывает блок между маркерами SCHOOL-WEIGHTS:START / :END в части 0.
//
// Метрика (v3) — взвешенная, с защитой от двух перекосов:
//   вклад(школа) = Σ_раздел [ вес_раздела × √(взвеш.упоминания_в_разделе) ]
//
//   • вес_раздела — где встретилось. Ядро (принципы/каталог/протоколы/
//     периодизация) ×1.5; поддержка ×1.0; мета (часть 0) и библиография
//     (часть 10) ×0 — список литературы не должен накручивать опору.
//   • √(...) — НАСЫЩЕНИЕ внутри раздела: пятое повторение имени в одном разделе
//     добавляет почти ноль. Опора = охват по разделам, а не частота повторов в
//     прозе. Лечит раздувание «разговорчивых» школ.
//   • роль упоминания — ПРЕДПИСАНИЕ vs рамка. ×1.4 даётся, когда имя стоит рядом
//     с конкретной дозировкой (числа+единицы, «протокол/доза/подход/повтор»):
//     мы ценим вклад в то, ЧТО и СКОЛЬКО делать, а не только в формулировки.
//     Концептуальные/рамочные упоминания считаются, но без бонуса.
//
// Это прокси «на чём держится тренировка», а не оценка качества школы и не
// истина. Колонка «Акцент» — ручная подпись: что конкретно мы берём у школы.
//
// Запуск:  node tools/school-weights.mjs            (обновить таблицу)
//          node tools/school-weights.mjs --check     (только вывести)
//
// ПРАВИЛО ПРОЕКТА: запускать после каждой правки методологии (см. CLAUDE.md).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOC = join(__dirname, '..', 'METHODOLOGY.md');
const START = '<!-- SCHOOL-WEIGHTS:START';
const END = '<!-- SCHOOL-WEIGHTS:END -->';

// Школы/течения: сигнатурные паттерны + «акцент» (что конкретно берём).
const SCHOOLS = [
  { key: 'Eric Hörst', focus: 'Энергосистемы, max strength, DUP, repeaters 7:3',
    re: [/H[öo]rst/gi, /PhysiVantage/gi, /\bDUP\b/g, /7:3/g] },
  { key: 'Eva López', focus: 'Дозировка силового виса (MAW / margin RM-3, edge)',
    re: [/L[óo]pez/gi, /MaxHangs?\s*MAW/gi, /\bMAW\b/g, /RM-3/gi] },
  { key: 'Anderson (Rock Prodigy)', focus: 'Линейная блочная периодизация (6 фаз)',
    re: [/Anderson/gi, /Rock Prodigy/gi, /Rock Climber'?s Training Manual/gi] },
  { key: 'Bechtel (Logical Progression)', focus: 'Нелинейная периодизация (форма круглый год)',
    re: [/Bechtel/gi, /Logical Progression/gi] },
  { key: 'Dave MacLeod', focus: 'Архитектура выбора: диагностика лимитера, техника/тактика/голова',
    re: [/MacLeod/gi] },
  { key: 'Ned Feehally (Beastmaking)', focus: 'Типология хватов, тренировка замка, fingers-first, морфология',
    re: [/Feehally/gi, /Beastmaking/gi] },
  { key: 'Lattice Training', focus: 'Предикторы по уровням, бенчмарки, дата-дривен тесты',
    re: [/Lattice/gi, /Tom Randall/gi, /Ollie Torr/gi] },
  { key: 'Climbing medicine (Schöffl/Vagy/Cook/Baar/RED-S)', focus: 'Травмы блоков, дети/зоны роста, RED-S, реабилитация, питание ткани (коллаген)',
    re: [/Sch[öo]ffl/gi, /Vagy/gi, /Climbing Doctor/gi, /Rock Rehab/gi, /Hochholzer/gi, /B[äa]rtschi/gi, /Cook/gi, /Purdam/gi, /\bRio\b/g, /RED-S/gi, /эпифиз/gi, /зон[аы] роста/gi, /Mountjoy/gi, /Baar/gi, /\bShaw\b/g, /коллаген/gi, /желатин/gi] },
  { key: 'Биомеханика хвата (Vigouroux/Quaine/Schweizer)', focus: 'Нагрузка на A2/A4, углы хватов, FDP/FDS, force-sharing',
    re: [/Vigouroux/gi, /Quaine/gi, /Schweizer/gi, /Amca/gi, /bowstringing/gi] },
  { key: 'Ёмкость предплечья / Critical Force (Fryer/Giles/Baláš)', focus: 'CF и W′, оксидативная ёмкость, интермиттент>continuous, BFR',
    re: [/Critical Force/gi, /\bCF\b/g, /\bW′/g, /Fryer/gi, /Giles/gi, /Bal[áa]š/gi, /O2HTR/gi, /\bBFR\b/g, /Ferguson/gi] },
  { key: 'Спортивная наука / IRCRA', focus: 'Физиология энергосистем, стандарты тестов',
    re: [/IRCRA/gi, /энергосист/gi, /фосфаген/gi, /гликолиз/gi, /митохондри/gi] },
  { key: 'Программы хватов (Beastmaker/Nelson)', focus: 'Готовые пресеты висов (no-hang, density)',
    re: [/Beastmaker/gi, /Nelson/gi, /no-?hang/gi, /density hang/gi] },
  { key: 'Психология срыва (доказательная + Ilgner)', focus: 'Страх срыва: вмешательства (RCT), метрики CSES/CAS-20, Rock Warrior',
    re: [/Garrido-Palomino/gi, /R[öo]thlin/gi, /Llewellyn/gi, /Ilgner/gi, /Ionel/gi, /Crane/gi, /CSES/g, /CAS-20/gi, /self-compassion/gi] },
  { key: 'Ecological dynamics / CLA (Seifert/Davids)', focus: 'Обучение технике: коадаптация к ограничениям, аффордансы, превью',
    re: [/Seifert/gi, /ecological dynamics/gi, /constraint-led/gi, /\bCLA\b/g, /Chow/gi, /аффорданс/gi, /Davids/gi] },
];

// Вес раздела по номеру части. 0 = в «опору» не идёт.
const PART_WEIGHT = {
  0: 0.0, 1: 1.5, 2: 1.0, 3: 1.0, 4: 1.5, 5: 1.5, 6: 1.5, 7: 1.0, 8: 1.0, 9: 1.0, 10: 0.0,
};

// «Предписание»: рядом доза/протокол (числа+единицы или слова о дозировке).
const PRESCRIPTIVE = /\d+\s*(с|сек|мм|кг|%|×|x|мин|нед|повтор|подход)|протокол|дозир|доза|интервал|подход|повтор/i;
const PRESCRIPTIVE_BONUS = 1.4;

function countLine(line, patterns) {
  let n = 0;
  for (const re of patterns) {
    const m = line.match(re);
    if (m) n += m.length;
  }
  return n;
}

// Largest-remainder округление так, чтобы сумма == 100.
function toPercents(values) {
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((c) => (c / total) * 100);
  const floor = raw.map((x) => Math.floor(x));
  const rem = Math.round(100 - floor.reduce((a, b) => a + b, 0));
  const order = raw.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
  const out = floor.slice();
  for (let k = 0; k < rem; k++) out[order[k % order.length].i] += 1;
  return out;
}

function main() {
  const check = process.argv.includes('--check');
  const full = readFileSync(DOC, 'utf8');
  const lines = full.split('\n');

  // wpart[i][part] = взвешенные упоминания школы i в разделе part (до √).
  const wpart = SCHOOLS.map(() => ({}));
  const raw = SCHOOLS.map(() => 0);

  let part = -1;
  let inAutoBlock = false;

  for (const line of lines) {
    if (line.includes(START)) { inAutoBlock = true; continue; }
    if (line.includes('SCHOOL-WEIGHTS:END')) { inAutoBlock = false; continue; }
    if (inAutoBlock) continue;

    const h = line.match(/^##\s+Часть\s+(\d+)/i);
    if (h) part = Number(h[1]);
    const pw = PART_WEIGHT[part] ?? 0;
    if (pw === 0) continue; // мета/бэклог/библиография в опору и в «Упом.» не идут
    const role = PRESCRIPTIVE.test(line) ? PRESCRIPTIVE_BONUS : 1.0;
    for (let i = 0; i < SCHOOLS.length; i++) {
      const c = countLine(line, SCHOOLS[i].re);
      if (!c) continue;
      raw[i] += c;
      wpart[i][part] = (wpart[i][part] || 0) + c * role;
    }
  }

  // вклад = Σ_раздел вес_раздела × √(взвеш.упоминания_в_разделе)
  const contrib = SCHOOLS.map((_, i) => {
    let s = 0;
    for (const [p, v] of Object.entries(wpart[i])) s += PART_WEIGHT[p] * Math.sqrt(v);
    return s;
  });

  const pcts = toPercents(contrib);
  const rows = SCHOOLS
    .map((s, i) => ({ key: s.key, focus: s.focus, raw: raw[i], c: contrib[i], pct: pcts[i] }))
    .filter((r) => r.c > 0)
    .sort((a, b) => b.pct - a.pct || b.c - a.c);

  const today = new Date().toISOString().slice(0, 10);
  let table = `| Школа / течение | Доля опоры | Акцент в нашей методологии | Упом. |\n`;
  table += `|---|---:|---|---:|\n`;
  for (const r of rows) {
    table += `| ${r.key} | ${r.pct}% | ${r.focus} | ${r.raw} |\n`;
  }
  table += `\n_Авто-расчёт ${today}. Доля опоры — взвешенная: Σ по разделам ` +
    `[вес раздела (ядро ×1.5 / поддержка ×1.0 / источники и сводка ×0) × ` +
    `√(упоминания в разделе)], где упоминание рядом с дозировкой/протоколом ` +
    `весит ×${PRESCRIPTIVE_BONUS}. √ — насыщение: повтор в одном разделе почти не ` +
    `добавляет (опора = охват, не частота). «Упом.» — сырое число, для прозрачности. ` +
    `Метрика — прокси опоры, не оценка качества школы._`;

  if (check) { process.stdout.write(table + '\n'); return; }

  const si = full.indexOf(START);
  const ei = full.indexOf(END);
  if (si === -1 || ei === -1) { console.error('Маркеры SCHOOL-WEIGHTS не найдены'); process.exit(1); }
  const block = `${START} (авто-генерация, руками не править) -->\n${table}\n${END}`;
  writeFileSync(DOC, full.slice(0, si) + block + full.slice(ei + END.length), 'utf8');
  process.stdout.write('Обновлено: взвешенная таблица школ (v3) в METHODOLOGY.md.\n');
  process.stdout.write(table + '\n');
}

main();
