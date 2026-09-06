#!/usr/bin/env node
/**
 * ui-v4-classify-legacy-mismatch.mjs — разбор legacy «≠» по критерию дизайнера.
 *
 * 445 строк стоят «≠» без кода причины: расхождение записано, но не судимо —
 * непонятно, принято оно или это долг. Читать их по одной значит потратить
 * остаток лимита на строки, половина которых заведомо принята.
 *
 * Критерий дизайнера от 6 сентября (он же сортировал по нему свои 219 строк):
 *
 *   исчезает ли ДЕЙСТВИЕ            — не мелочь никогда;
 *   падает ли КОНТРАСТ текста ниже 4,5 — не мелочь;
 *   падает ли ЦЕЛЬ ниже 44          — не мелочь;
 *   всё остальное (тон на полтона, отступ, кегль в пределах минимума) — принято.
 *
 * Два вопроса из трёх считает машина, третий требует чтения — но только там,
 * где в строке вообще упомянуто действие. Этот скрипт делит 445 на вёдра и
 * НИКОГДА не относит к «принято» то, чего не смог разобрать: непонятное идёт
 * в «читать», а не в тишину. Зелёная проверка обязана отличать «сошлось» от
 * «не смотрели», и это ровно тот случай — ошибка в сторону «принято» молча
 * становится правдой для всех, кто откроет снимок следующим.
 *
 * Запуск:
 *   node scripts/ui-v4-classify-legacy-mismatch.mjs            # сводка
 *   node scripts/ui-v4-classify-legacy-mismatch.mjs --rows     # с перечнем
 *   node scripts/ui-v4-classify-legacy-mismatch.mjs --json     # файл со списком
 *   node scripts/ui-v4-classify-legacy-mismatch.mjs --apply    # закрыть ведро «принято»
 *
 * `--apply` типизирует ТОЛЬКО ведро «принято» формой, которую владелец принял
 * 6 сентября: `≠` + `reasonCode: owner-decision` + факт, прямо говорящий, что
 * строку закрыла машина по критерию, а не человек чтением. Вердикт остаётся
 * `≠`, а не становится `=`: расхождение видно и никуда не делось, изменилось
 * только то, что оно теперь СУДИМО — у него есть код причины и адрес решения.
 * Подменить это на `=` значило бы соврать, что код сошёлся с кадром.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { patchZoneRow, readZone } from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VERDICTS = path.join(ROOT, 'docs/ui/verdicts');
const TOUCH_BASELINE = path.join(ROOT, 'scripts/.polosa4-task69-touch-target-baseline.json');

/**
 * Ступени чернил набора. Ниже 30 % ступени нет — дизайнер назвал её полом
 * («8–18 % в цвете ТЕКСТА нечитаемо в принципе»). Расхождение между двумя
 * ступенями лестницы контраст ниже 4,5 не роняет по построению: лестница на то
 * и лестница. Расхождение, где одна сторона НИЖЕ пола, — роняет.
 */
const INK_FLOOR = 0.3;

/**
 * Критерий дизайнера — «исчезает ли ДЕЙСТВИЕ», а не «упомянута ли кнопка».
 * Первая редакция ловила любое упоминание кнопки и отправила в чтение 206
 * строк из 445; выборка показала, что пять из шести — описание геометрии
 * кнопки, а не пропавшее действие. Считается только исчезновение.
 */
const ABSENCE_WORDS = [
  'в коде нет', 'нет вовсе', 'не рисует', 'не рендер', 'отсутству',
  'не реализован', 'не написан', 'не смонтирован', 'не существует',
  'не навешивает', 'не подключ', 'нет ни одного правила', 'не выводит',
  'удалён', 'удален', 'снят', 'снята', 'снято', 'убран', 'исчез',
  'не реализова', 'не заведён', 'не заведен', 'входа нет', 'нет входа',
  'не показывает', 'не открывает', 'не доступ', 'недостижим',
];

/**
 * Слова действия нужны не сами по себе, а рядом с исчезновением: строка вида
 * «кнопки „Позже“ в коде нет» — находка, строка «кнопка radius 16 против 20» —
 * принято. Список держится, чтобы отличить пропавшее ДЕЙСТВИЕ от пропавшего
 * украшения: исчезнувший разделитель мелочь, исчезнувший «Отменить» — нет.
 */
const ACTION_WORDS = [
  'кнопк', 'действи', 'нажат', 'нажим', 'тап', 'ссылк', 'переход',
  'отмен', 'подтверд', 'сохран', 'выбор', 'переключ', 'вход', 'cta',
];

/** Тач-цель: строка про размер области нажатия. */
const TARGET_WORDS = ['тач-цел', 'область нажат', 'области нажат', '44'];

/**
 * Вопрос дизайнера — «падает ли КОНТРАСТ ТЕКСТА ниже 4,5», а не «упомянут ли
 * цвет». Первая редакция брала слова «цвет» и «тон» и собрала 84 строки, из
 * которых 74 не называли доли вовсе: там были плашки, шрифты, содержимое
 * текста. Триггером остаются только чернила — именно они и есть контраст.
 */
const INK_WORDS = ['чернил', '--ink', 'rgba(0,0,0', 'rgba(var(--ink)'];

const args = process.argv.slice(2);
const wantRows = args.includes('--rows');
const wantJson = args.includes('--json');

const has = (text, list) => list.some((w) => text.includes(w));

/** Все доли чернил, названные в тексте: и долей, и именем ступени. */
function inkShares(text) {
  const out = [];
  for (const m of text.matchAll(/rgba\(\s*(?:0\s*,\s*0\s*,\s*0|var\(--ink\))\s*,\s*(\.\d+|0?\.\d+)\s*\)/gi)) {
    out.push(Number(m[1]));
  }
  for (const m of text.matchAll(/чернил[а-я]*\s+(\d{1,3})\s*%/gi)) out.push(Number(m[1]) / 100);
  for (const m of text.matchAll(/--ink-(\d+)/g)) {
    const n = Number(m[1]);
    out.push(n === 2 ? 0.55 : n === 3 ? 0.45 : n === 4 ? 0.38 : n === 30 ? 0.3 : NaN);
  }
  return out.filter((n) => Number.isFinite(n) && n > 0 && n <= 1);
}

/** Числа, похожие на размер цели: «34», «40 × 40», «26 px». */
function targetSizes(text) {
  const out = [];
  for (const m of text.matchAll(/(\d{2,3})\s*(?:×|x|\*)\s*(\d{2,3})/g)) {
    out.push(Number(m[1]), Number(m[2]));
  }
  for (const m of text.matchAll(/(?:высот|ширин|размер|цель|кружок|крестик|кнопк)[а-я]*\s+(?:до\s+)?(\d{2,3})\s*(?:px)?/gi)) {
    out.push(Number(m[1]));
  }
  return out.filter((n) => n >= 8 && n <= 200);
}

function loadTouchZones() {
  if (!fs.existsSync(TOUCH_BASELINE)) return new Set();
  try {
    const base = JSON.parse(fs.readFileSync(TOUCH_BASELINE, 'utf8'));
    const keys = base.violationKeys || [];
    return new Set(keys.map((k) => String(k).split('::')[0]));
  } catch {
    return new Set();
  }
}

const touchFiles = loadTouchZones();

/**
 * @param {string} zone
 * @param {string} key
 * @param {object} row
 * @returns {{ bucket: string, why: string }}
 */
export function classifyLegacyMismatch(zone, key, row) {
  const fact = String(row.f || '');
  const text = `${key} ${fact}`.toLowerCase();

  // 1. Действие. Только исчезновение, и только у того, что человек нажимает.
  //    Одно упоминание кнопки не считается: строка «кнопка radius 16 против
  //    20» описывает украшение, а не пропажу.
  const absent = has(text, ABSENCE_WORDS);
  if (absent && has(text, ACTION_WORDS)) {
    return { bucket: 'действие', why: 'строка говорит, что действия в коде нет' };
  }
  if (absent) {
    return { bucket: 'исчезло, но не действие', why: 'элемента нет, но это не то, что нажимают' };
  }

  // 2. Цель. Любое число ниже 44 в строке про область нажатия — под чтение.
  if (has(text, TARGET_WORDS)) {
    const sizes = targetSizes(text);
    const small = sizes.filter((n) => n < 44);
    if (small.length) {
      return { bucket: 'цель', why: `названы размеры ниже 44: ${[...new Set(small)].join(', ')}` };
    }
    if (touchFiles.size && sizes.length === 0) {
      return { bucket: 'цель', why: 'строка про область нажатия, размеров в тексте нет' };
    }
  }

  // 3. Контраст. Расхождение внутри лестницы контраст не роняет: ступени на то
  //    и заведены. Роняет то, что ниже пола 30 % — там ступени нет вовсе.
  if (has(text, INK_WORDS)) {
    const shares = inkShares(text);
    const belowFloor = shares.filter((n) => n < INK_FLOOR);
    if (belowFloor.length) {
      return {
        bucket: 'контраст',
        why: `тон ниже пола набора 30 %: ${[...new Set(belowFloor)].map((n) => `${Math.round(n * 100)} %`).join(', ')}`,
      };
    }
    if (shares.length === 0) {
      return { bucket: 'контраст', why: 'строка про чернила, доли в тексте не названы' };
    }
    return { bucket: 'принято', why: 'расхождение внутри лестницы чернил — контраст не падает' };
  }

  // 4. Ничего из трёх не сработало. Это НЕ «принято»: это «нечем судить».
  //    Разница принципиальная — принятое решение владельца против пустого
  //    факта, по которому вообще нельзя сказать, о чём строка.
  if (fact.trim().length < 40) {
    return { bucket: 'нечем судить', why: 'факт короче сорока знаков — судить не по чему' };
  }
  return { bucket: 'принято', why: 'ни действия, ни цели, ни цвета — остальное принято' };
}

const APPLY_FACT_SUFFIX =
  ' Расхождение видно и принято без построчного разбора: критерий дизайнера от '
  + '6 сентября 2026 — не мелочь только исчезнувшее действие, контраст текста '
  + 'ниже 4,5 и цель ниже 44. Строку отнёс к принятым скрипт '
  + 'scripts/ui-v4-classify-legacy-mismatch.mjs, человек её не читал — это '
  + 'сказано здесь нарочно, чтобы следующий проход знал цену вердикта.';

// Якорь, а не номер строки: архив дописывается, и номер уехал бы на первой же
// закрытой находке — вердикт указывал бы в чужой текст.
const DECISION_REF =
  'docs/ui/UI_V4_FINDINGS_HISTORY.md#legacy-mismatch-owner-decision-2026-09-06';

function applyAccepted(rows) {
  const accepted = rows.filter((r) => r.bucket === 'принято');
  const byZone = {};
  for (const r of accepted) (byZone[r.zone] ||= []).push(r);
  let written = 0;
  let skipped = 0;
  for (const [zone, list] of Object.entries(byZone)) {
    const before = snapshotForeignRowStrings(readZone(zone).rows, new Set(list.map((r) => r.key)));
    for (const r of list) {
      let ok = false;
      patchZoneRow(zone, r.key, (live) => {
        // Пересчёт под локом: между разбором и записью зону мог переписать кто
        // угодно, и строка могла перестать быть «принято».
        if (live.v !== '≠' || live.reasonCode) return;
        if (classifyLegacyMismatch(zone, r.key, live).bucket !== 'принято') return;
        live.reasonCode = 'owner-decision';
        live.decisionRef = DECISION_REF;
        if (!String(live.f || '').includes('критерий дизайнера от')) {
          live.f = `${live.f}${APPLY_FACT_SUFFIX}`;
        }
        ok = true;
      });
      if (ok) written += 1;
      else skipped += 1;
    }
    assertForeignRowsUnchanged(before, readZone(zone).rows);
  }
  console.log(`
Типизировано owner-decision: ${written}; пропущено ${skipped}.`);
  console.log('Вердикт остался «≠» — расхождение никуда не делось, оно стало судимым.');
}

function main() {
  const rows = [];
  for (const file of fs.readdirSync(VERDICTS).filter((f) => f.endsWith('.json'))) {
    const zone = file.replace('.json', '');
    const data = JSON.parse(fs.readFileSync(path.join(VERDICTS, file), 'utf8'));
    for (const [key, row] of Object.entries(data.rows || {})) {
      if (!row || row.v !== '≠' || row.reasonCode) continue;
      const res = classifyLegacyMismatch(zone, key, row);
      rows.push({ zone, key, bucket: res.bucket, why: res.why, fact: String(row.f || '').slice(0, 200) });
    }
  }

  const buckets = ['действие', 'исчезло, но не действие', 'цель', 'контраст', 'нечем судить', 'принято'];
  const byZone = {};
  const totals = Object.fromEntries(buckets.map((b) => [b, 0]));
  for (const r of rows) {
    totals[r.bucket] += 1;
    (byZone[r.zone] ||= Object.fromEntries(buckets.map((b) => [b, 0])))[r.bucket] += 1;
  }

  const pad = (s, n) => String(s).padStart(n);
  const line = (name, c) =>
    `${name.padEnd(20)} ${pad(c['действие'], 8)} ${pad(c['исчезло, но не действие'], 9)} ${pad(c['цель'], 5)} ${pad(c['контраст'], 9)} ${pad(c['нечем судить'], 13)} ${pad(c['принято'], 8)}`;
  console.log('зона                 действие  исчезло  цель  контраст  нечем судить  принято');
  const order = Object.entries(byZone).sort(
    (a, b) => b[1]['действие'] + b[1]['цель'] + b[1]['контраст'] - (a[1]['действие'] + a[1]['цель'] + a[1]['контраст']),
  );
  for (const [zone, c] of order) console.log(line(zone, c));
  console.log(line('ИТОГО', totals));
  const read =
    totals['действие'] + totals['исчезло, но не действие'] + totals['цель'] + totals['контраст'] + totals['нечем судить'];
  console.log(`\nЧитать глазами: ${read} из ${rows.length}. Закрывается пачкой: ${totals['принято']}.`);
  console.log('«Нечем судить» — не «принято»: строка без внятного факта не закрывается, а переписывается.');

  if (wantRows) {
    for (const b of buckets) {
      const list = rows.filter((r) => r.bucket === b);
      if (!list.length) continue;
      console.log(`\n=== ${b} (${list.length}) ===`);
      for (const r of list) console.log(`  ${r.zone} :: ${r.key} — ${r.why}`);
    }
  }
  if (args.includes('--apply')) applyAccepted(rows);
  if (wantJson) {
    const out = path.join(ROOT, 'scripts/.legacy-mismatch-classified.json');
    fs.writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
    console.log(`\nСписок → ${path.relative(ROOT, out)} (${rows.length})`);
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
  main();
}
