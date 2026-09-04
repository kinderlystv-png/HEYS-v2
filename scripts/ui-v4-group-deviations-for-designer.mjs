#!/usr/bin/env node
// ui-v4-group-deviations-for-designer.mjs — группировка всех «≠» по классу причины для дизайнера.
//
// Источник: docs/ui/verdicts/<зона>.json (v === "≠").
// Сверка totals: node scripts/ui-v4-check-contract-drift.mjs --list
//
// Использование:
//   node scripts/ui-v4-group-deviations-for-designer.mjs           # JSON в stdout
//   node scripts/ui-v4-group-deviations-for-designer.mjs --write-doc

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readAllZones } from './lib/ui-v4-verdicts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOC_PATH = path.join(ROOT, 'docs/ui/UI_V4_DEVIATIONS_FOR_DESIGNER.md');

/** @typedef {{ zoneId: string, key: string, reasonCode?: string, f: string }} DeviationRow */

function normalizeReason(text) {
  return String(text || '')
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Правила в порядке приоритета: первое совпадение задаёт класс.
 * @type {Array<{ id: string, label: string, proposal: string, test: (row: DeviationRow, f: string) => boolean }>}
 */
const CLASSIFIERS = [
  {
    id: 'accessibility-platform',
    label: 'доступность / платформа',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      /prefers-reduced-motion|уменьшенн(?:ое|ый)\s+движен/.test(f)
      || row.reasonCode === 'accessibility'
      || row.reasonCode === 'platform',
  },
  {
    id: 'logic-invariant',
    label: 'логический инвариант продукта',
    proposal: 'одобрить как правило',
    test: (row) => row.reasonCode === 'logic-invariant',
  },
  {
    id: 'owner-decision',
    label: 'продуктовое решение, кадр устарел',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      row.reasonCode === 'owner-decision'
      || /контракт старше|кадр устар|только для нагляд|наглядност|демонстрац|решение владельц|намеренно|продуктов(?:ое|ый)\s+решен|снята делом|не в этот релиз|то же решение контракта/.test(
        f,
      ),
  },
  {
    id: 'no-state-data',
    label: 'данных для состояния нет',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /состояни[ея]\s+нет|нет (?:данных|в коде|состояни)|не реализован|отсутству(?:ет|ют)|в коде нет|удалён|удален|0 совпад|не делит экран|не реализованы как отдельн|полноэкранн(?:ых|ые)\s+исход|outcome screen|в proposal_ui нет|curator signal нет|«в шаблоны».*нет|save-flow снят|мёртв(?:ое|ая|ый)|не выводит(?: вовсе)?|не вызывается|в продукте нет|runtime-состояни[яе].*нет|skeletoncard.*не вызывается|элемента на экране нет|выделенного.*нет, потому что нет/.test(
        f,
      ),
  },
  {
    id: 'gap-375',
    label: 'зазор при 375 не влезает',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /375|не влез|не помещ|переполн|overflow|прокрут.*(?:375|экран)|узк(?:ий|ом)\s+экран|viewport/.test(f),
  },
  {
    id: 'pixel-round',
    label: 'кегль округлён до пикселя',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      /кегл.*округл|округл.*(?:пиксел|кегл)|дробн(?:ый|ые)\s+px|\d+[,.]\d+\s*px.*(?:кадр|контракт)|(?:11[,.]5|10[,.]5|9[,.]5|12[,.]5).*(?:кадр|контракт|кадра)/.test(
        f,
      ),
  },
  {
    id: 'reuse-zone',
    label: 'компонент переиспользован из другой зоны',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      /переиспольз|из другой зон|общ(?:ий|ая|ее)\s+(?:компонент|класс|паттерн|слой)|foreign-zone|чуж(?:ая|ой)\s+зон|wrapper|эталон.*(?:друг|иной)|из зоны|пре-v4|pre-v4|\.mc-wheel|mc-wheel-\*|значения колеса|делят его|для всех крестов зоны|одна на все размеры|прозрачность хвоста одна/.test(
        f,
      ),
  },
  {
    id: 'legacy-v4',
    label: 'legacy-поверхность вне v4',
    proposal: 'мы починим кодом',
    test: (row, f) =>
      /legacy|вне v4|не v4|000-base:|heys-components\.css|до v4|классическ|старый ui|720-predictive|insights-weight__/.test(f),
  },
  {
    id: 'chart-svg',
    label: 'график/SVG: масштаб vs фиксированный кадр',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /svg\s*\d+×\d+|холст\s*\d+×\d+|поле рисунка|sparkline|360×|262×|растяж|эллипс|viewbox|path\s+m\d+|дуг[аи]|крестом m\d|искра m\d|значок\s+\d+×\d+|галочк[аи]\s+\d+|шеврон.*custom|custom svg|хвост дуги/.test(
        f,
      ),
  },
  {
    id: 'theme-preview',
    label: 'превью палитры: миниатюра vs точки swatch',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      /soft-mini|swatch|точк[аи]\s+\d+×\d+|theme.*dot|палитр|набор.*точк/.test(f),
  },
  {
    id: 'exception-geometry',
    label: 'геометрия кода vs кадр (EXCEPTION)',
    proposal: 'мы починим кодом',
    test: (row, f) => /exception\s+[\w-]+-canvas/.test(f),
  },
  {
    id: 'canvas-conflict-feature',
    label: 'canvas-conflict: функционал не закрыт',
    proposal: 'мы починим кодом',
    test: (row, f) =>
      row.reasonCode === 'canvas-conflict'
      && /не рендерится|не закрыт|нет;|нет\.|skip|sheetrows|счётчик|curator signal|цвет.*не|outcome|исход|proposal|отчёт цикла|прочерки/.test(
        f,
      ),
  },
  {
    id: 'canvas-conflict-geometry',
    label: 'canvas-conflict: геометрия/компонент vs кадр',
    proposal: 'спорно — разобрать поштучно',
    test: (row) => row.reasonCode === 'canvas-conflict',
  },
  {
    id: 'missing-element',
    label: 'элемент кадра отсутствует в коде',
    proposal: 'мы починим кодом',
    test: (row, f) =>
      /без (?:ссылки|надстроки|свёрнутого|строки|элемента|кнопки|чипов)|не рендерит|не поставлен|не имеет|отсутствует|не рисуется|круга r \d+.*нет|состоит из одного креста|разделител(?:ей|и).*нет|нет разделител|шеврон.*не рисуется/.test(
        f,
      ),
  },
  {
    id: 'text-copy',
    label: 'текст и копия отличаются от кадра',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /заголовок|слова на экране|текст|фраз|копи|подпис|диалог|сообщен|требует «|рисует «|говорит|называет|кадр\s*[·.]?\d+\s*—\s*«|друг(?:ие|ой)\s+(?:три\s+)?фрагмент|на\s+шаге\s+\d.*кадр|кнопка\s*«|cta\s*«|confirmmodal|mealdatewarning|heys_trial_intake|step_time_left|age_confirm|ответы сохранены|галочку выше|анкета отправлена|анкета не дозаполнена|закрыть.*44×64|мне есть 18/.test(
        f,
      ),
  },
  {
    id: 'functional-flow',
    label: 'функциональный поток отличается от кадра',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /функци|поток|уводит|открывает|переход|тап|навигац|редактор|ввод|native\s+<select>|native\s+select|системн(?:ого|ый)\s+select|custom absolute|камера|aspect|4:3|scanner|штрихкод|barcode|selectfield/.test(
        f,
      ),
  },
  {
    id: 'composition-ux',
    label: 'композиция и UX отличаются от кадра',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /состав|меню|собран|вместо|лист по|сетк|колонк|порядок|space-between|baseline|center|wrap|карточк|список|липк(?:ий|ом)\s+подвал|чипы\s+с\s+переносом|списком\s+строк|перерисовывает\s+блок|кадр\s+и\s+runtime|без\s+\.row|стрелк.*крест|замена креста|одной плашкой|сноска|раскрывашк|абзац/.test(
        f,
      ),
  },
  {
    id: 'color-role',
    label: 'цвет и роль vs литерал кадра',
    proposal: 'одобрить как правило',
    test: (row, f) =>
      /цвет|рол[ьи]|--v4-|var\(--|заливк|тон|фон|tint|ink|rgba|литерал|ступен|currentcolor|transparent/.test(f),
  },
  {
    id: 'geometry-general',
    label: 'геометрия и типографика: код vs кадр',
    proposal: 'спорно — разобрать поштучно',
    test: (row, f) =>
      /\d+(?:[,.]\d+)?\s*px|height:|width:|margin|padding|gap:|font:|line-height|r\d+|min-height|радиус|крив|path\s|рисунок|отступ\s+\d+|кадр\s+(?:даёт|просит|рисует)\s+\d+|строка\s+(?:меты|держит)\s+\d+|зазор\s+\d+|точки прижаты|поле\s+\d+\s*[×x]\s*\d+|размер общий|подгонять.*ради|спор\s+тр[ёе]х\s+источников|главное\s+число|трекинг/.test(
        f,
      ),
  },
];

/**
 * Однострочное объяснение, почему строка остаётся в хвосте (не образует класс ≥2).
 * @param {DeviationRow & { inferredClass?: string }} row
 * @param {string} f
 */
function inferSingletonReason(row, f) {
  if (row.inferredClass) {
    return `единственная строка класса «${row.inferredClass}» — нет второй с той же причиной`;
  }
  if (row.reasonCode === 'logic-invariant') {
    return 'logic-invariant: единственная строка с этим reasonCode';
  }
  if (/prefers-reduced-motion|уменьшенн(?:ое|ый)\s+движен/.test(f)) {
    return 'a11y reduced-motion: единственная строка зоны app-splash с этим контрактом';
  }
  if (/heys_client_access_code_setup/.test(f) && /плашк|сноск/.test(f)) {
    return 'login: единственная строка — перечень правил одной плашкой vs сноска кадра';
  }
  if (/heys_client_access_code_setup/.test(f) && /продолжить|сохранить код/.test(f)) {
    return 'login: единственная строка — подпись CTA «Продолжить» vs «Сохранить код»';
  }
  if (/mealdatewarning|confirmmodal/.test(f)) {
    return 'nutrition-tab: единственная строка — другой диалог выбора даты vs кадр';
  }
  if (/aspect|4:3|камера/.test(f)) {
    return 'product-card: единственная строка — aspect-ratio камеры vs растяжение кадра';
  }
  if (/стрелк.*крест|крест.*стрелк/.test(f)) {
    return 'product-card: единственная строка — «назад» vs крест (блокер чужой сессии)';
  }
  if (/scanner|код не распознан|runtime-состояни/.test(f)) {
    return 'product-card: единственная строка — нет отдельного состояния «код не распознан»';
  }
  if (/дорожка чернил|прогресса чтения/.test(f)) {
    return 'registration: единственная строка — % чернил дорожки чтения vs кадр';
  }
  if (/спор\s+тр[ёе]х\s+источников/.test(f)) {
    return 'reports-insights: единственная строка — три источника кегля главного числа';
  }
  if (/абзац.*раскрывашк|rаскрывашк.*абзац/.test(f)) {
    return 'reports-insights: единственная строка — абзац раскрывашки vs кадр (см. соседнюю строку)';
  }
  if (/advice-service|service-curator|техлог|диагностика|служебн/.test(f)) {
    return 'service-curator: единственная строка — состав служебного листа vs кадр';
  }
  if (/heys_curator_actions_banner/.test(f)) {
    return 'curator-edits: единственная строка — ack при тапе строки баннера';
  }
  const short = String(row.f || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return short ? `${short}${row.f.length > 120 ? '…' : ''}` : 'причина не попала ни в один класс ≥2 строк';
}

/**
 * @param {ReturnType<typeof readAllZones>} data
 */
export function collectMismatchRows(data) {
  /** @type {DeviationRow[]} */
  const rows = [];
  for (const [zoneId, zone] of Object.entries(data.zones || {})) {
    for (const [key, row] of Object.entries(zone.rows || {})) {
      if (row?.v !== '≠') continue;
      rows.push({
        zoneId,
        key,
        reasonCode: row.reasonCode,
        f: row.f || '',
      });
    }
  }
  return rows;
}

/**
 * @param {DeviationRow[]} rows
 */
export function classifyDeviations(rows) {
  /** @type {Map<string, { id: string, label: string, proposal: string, items: DeviationRow[] }>} */
  const classes = new Map();
  /** @type {Array<DeviationRow & { inferredClass?: string }>} */
  const tail = [];

  for (const row of rows) {
    const f = normalizeReason(row.f);
    let matched = null;
    for (const rule of CLASSIFIERS) {
      if (rule.test(row, f)) {
        matched = rule;
        break;
      }
    }
    if (!matched) {
      tail.push(row);
      continue;
    }
    if (!classes.has(matched.label)) {
      classes.set(matched.label, {
        id: matched.id,
        label: matched.label,
        proposal: matched.proposal,
        items: [],
      });
    }
    classes.get(matched.label).items.push(row);
  }

  /** @type {typeof classes extends Map<string, infer V> ? V[] : never} */
  const multi = [];
  for (const bucket of classes.values()) {
    if (bucket.items.length === 1) {
      tail.push({ ...bucket.items[0], inferredClass: bucket.label });
    } else {
      multi.push(bucket);
    }
  }

  multi.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label, 'ru'));
  tail.sort(
    (a, b) => a.zoneId.localeCompare(b.zoneId, 'ru') || a.key.localeCompare(b.key, 'ru'),
  );

  return { classes: multi, tail };
}

/**
 * @param {ReturnType<typeof readAllZones>} data
 */
export function tallyListMismatch(data) {
  const byZone = {};
  let total = 0;
  for (const [zoneId, zone] of Object.entries(data.zones || {})) {
    let count = 0;
    for (const row of Object.values(zone.rows || {})) {
      if (row?.v === '≠') count += 1;
    }
    if (count) byZone[zoneId] = count;
    total += count;
  }
  return { total, byZone };
}

/**
 * @param {ReturnType<typeof classifyDeviations>} grouped
 * @param {{ total: number, byZone: Record<string, number> }} listTally
 */
export function buildSummary(grouped, listTally) {
  const classCounts = Object.fromEntries(
    grouped.classes.map((bucket) => [bucket.label, bucket.items.length]),
  );
  const classTotal = grouped.classes.reduce((sum, bucket) => sum + bucket.items.length, 0);
  const perZone = {};
  for (const bucket of grouped.classes) {
    for (const item of bucket.items) {
      perZone[item.zoneId] = (perZone[item.zoneId] || 0) + 1;
    }
  }
  for (const item of grouped.tail) {
    perZone[item.zoneId] = (perZone[item.zoneId] || 0) + 1;
  }

  return {
    generatedAt: new Date().toISOString().slice(0, 10),
    totalMismatch: listTally.total,
    listMismatchTotal: listTally.total,
    classCount: grouped.classes.length,
    classRowTotal: classTotal,
    tailCount: grouped.tail.length,
    verified: classTotal + grouped.tail.length === listTally.total,
    classes: grouped.classes.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      proposal: bucket.proposal,
      count: bucket.items.length,
      zones: [...new Set(bucket.items.map((item) => item.zoneId))].sort(),
      examples: bucket.items.slice(0, 5).map((item) => `${item.zoneId} · ${item.key}`),
    })),
    perZone,
    listByZone: listTally.byZone,
    tail: grouped.tail.map((item) => {
      const f = normalizeReason(item.f);
      return {
        zoneId: item.zoneId,
        key: item.key,
        inferredClass: item.inferredClass || null,
        singletonReason: inferSingletonReason(item, f),
      };
    }),
    unclassified: grouped.tail
      .filter((item) => !item.inferredClass)
      .map((item) => ({ zoneId: item.zoneId, key: item.key })),
  };
}

function formatZones(zones) {
  if (zones.length <= 4) return zones.join(', ');
  return `${zones.slice(0, 4).join(', ')} +${zones.length - 4}`;
}

/**
 * @param {ReturnType<typeof buildSummary>} summary
 */
export function renderMarkdown(summary) {
  const lines = [
    '# UI v4 — отступления «≠» для дизайнера',
    '',
    `Срез: **${summary.generatedAt}**. Полный снимок всех подтверждённых отступлений (`,
    '`v === "≠"`) по зонам контракта. **Отправка дизайнеру — после закрытия',
    'strength-builder**; до этого список может меняться.',
    '',
    '## Что просим',
    '',
    'По каждому **классу причины** (не по строкам зон) — один из трёх ответов:',
    '',
    '- **одобрить как правило** — кадр устарел, продукт верен;',
    '- **мы починим кодом** — кадр верен, правим продукт;',
    '- **спорно — разобрать поштучно** — нужен разбор отдельных кейсов.',
    '',
    'Колонка «Предложение» — наша рекомендация до вашего ответа.',
    '',
    '## Классы отступлений',
    '',
    '| Класс | Строк | Зоны | Примеры (ключи) | Предложение |',
    '| ----- | ----: | ---- | -------------- | ----------- |',
  ];

  for (const bucket of summary.classes) {
    const examples = bucket.examples
      .map((item) => item.replace(/\|/g, '\\|'))
      .join(' · ');
    lines.push(
      `| ${bucket.label} | ${bucket.count} | ${formatZones(bucket.zones)} | ${examples} | **${bucket.proposal}** |`,
    );
  }

  lines.push(
    '',
    '## Вне классов',
    '',
    `Одиночные строки (${summary.tailCount} шт.) — не образуют класс (правило: класс ≥ 2 строк).`,
    '',
    '| Зона | Ключ | Почему единичная |',
    '| ---- | ---- | ---------------- |',
  );

  for (const item of summary.tail) {
    const suffix = item.inferredClass ? ` _(был бы: ${item.inferredClass})_` : '';
    const reason = (item.singletonReason || '—').replace(/\|/g, '\\|');
    lines.push(
      `| ${item.zoneId} | ${item.key.replace(/\|/g, '\\|')}${suffix} | ${reason} |`,
    );
  }

  lines.push(
    '',
    '## Сверка',
    '',
    `| Источник | Всего «≠» |`,
    `| -------- | --------: |`,
    `| \`node scripts/ui-v4-group-deviations-for-designer.mjs\` | ${summary.totalMismatch} |`,
    `| \`node scripts/ui-v4-check-contract-drift.mjs --list\` (сумма по зонам) | ${summary.listMismatchTotal} |`,
    `| Классов (≥2 строк) | ${summary.classCount} |`,
    `| Строк в классах | ${summary.classRowTotal} |`,
    `| Хвост «вне классов» | ${summary.tailCount} |`,
    `| Сходится | ${summary.verified ? 'да' : '**НЕТ**'} |`,
    '',
    'Пересобрать: `node scripts/ui-v4-group-deviations-for-designer.mjs --write-doc`',
    '',
  );

  return `${lines.join('\n')}\n`;
}

function runCli() {
  const writeDoc = process.argv.includes('--write-doc');
  const data = readAllZones();
  const rows = collectMismatchRows(data);
  const listTally = tallyListMismatch(data);
  const grouped = classifyDeviations(rows);
  const summary = buildSummary(grouped, listTally);

  if (writeDoc) {
    fs.writeFileSync(DOC_PATH, renderMarkdown(summary), 'utf8');
    console.error(`Записано: ${DOC_PATH}`);
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
