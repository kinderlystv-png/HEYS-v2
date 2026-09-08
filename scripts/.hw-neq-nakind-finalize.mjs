#!/usr/bin/env node
/**
 * home-widgets: построчная типизация 38 «≠» + naKind для legacy «—».
 * Порядок: после --rehash home-widgets.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applyVerdictToRow,
  readZone,
  withZoneWriteLock,
  writeZone,
} from './lib/ui-v4-verdicts.mjs';
import { snapshotForeignRowStrings, assertForeignRowsUnchanged } from './lib/handoff-batch-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZONE = 'home-widgets';
const H = 'docs/ui/UI_V4_FINDINGS_HISTORY.md';
const COPY = 'apps/web/__tests__/widgets-canvas-copy.test.js';
const PREVIEW = `${H}#закрыто-3-сентября-превью-листа-смены-вида-уменьшение-кадра-а-не-своё-правило`;
const UI = 'apps/web/heys_widgets_ui_v1.js';
const VAR = 'apps/web/heys_widgets_variants_v4.js';
const CSS = 'apps/web/styles/modules/730-widgets-dashboard.css';

function stripBoilerplate(fact) {
  return String(fact || '')
    .replace(/\s*Расхождение видно и принято без построчного разбора:[\s\S]*$/, '')
    .trim();
}

/** @type {Map<string, {reasonCode: string, decisionRef: string, fact: string}>} */
const NEQ_FINAL = new Map([
  [
    'Главная · дефолтная раскладка · текст',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${COPY}:171`,
      fact:
        'Подвал расстановки: кадр учит «Долгое нажатие — взять виджет», контракт требует drag без удержания. '
        + `Продукт: «Потяните плитку, чтобы поменять порядок» — ${UI}:12204; исключение widgets-canvas-copy до пересъёмки кадра.`,
    },
  ],
  [
    'Каталог · нет места · 07',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:3571`,
      fact:
        'Счётчик места: строка «вид счётчика места» — 11 px/600, чернила 45 %, tabular-nums. '
        + `Кадр рисует 9.5 px mono 42 %. Продукт .widget-v4-catalog__budget — ${CSS}:3571-3578.`,
    },
  ],
  [
    'Каталог · нет места · 09',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:12337`,
      fact:
        'Строка «каталог» требует плитку в дефолтном виде тем же кодом, что на Главной. '
        + `Продукт — сетка 1fr 1fr gap 8 (${CSS}:12337-12340), кадр — одна колонка 68×64.`,
    },
  ],
  [
    'Каталог · нет места · 13',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${UI}:10395`,
      fact:
        `Имя виджета: в продукте превью рисует плитку целиком с её ключом (CatalogStrip ${UI}:10257, сетка ${UI}:10395), `
        + 'отдельная подпись — для строк ожидания; кадр дублирует имя справа от превью.',
    },
  ],
  [
    'Каталог · нет места · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:144`,
      fact:
        'Кадр «Каталог · нет места» предлагает вид поменьше у заблокированной карточки; '
        + 'в продукте только подсказка и снятие — исключения widgets-canvas-copy :144-145.',
    },
  ],
  [
    'Разбор · Вес · 92',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${UI}:11888`,
      fact:
        `Кадр рисует ввод веса пилюлями в листе; «Записать вес» уводит на вкладку дня (${UI}:11888 recordWeight → openWeightPicker). `
        + 'Функция, не геометрия — решение владельца 31.08 отложить до пакета дизайна.',
    },
  ],
  [
    'Разбор · Вес · 93',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${UI}:11888`,
      fact:
        `То же: пилюля целой части в кадре «Разбор · Вес · 93»; продукт открывает редактор веса на дне (${UI}:11888).`,
    },
  ],
  [
    'Разбор · Вес · 94',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${UI}:11888`,
      fact:
        `То же: запятая между пилюлями в кадре «Разбор · Вес · 94»; продукт — запись через день (${UI}:11888).`,
    },
  ],
  [
    'Разбор · Вес · 95',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${UI}:11888`,
      fact:
        `То же: пилюля десятой в кадре «Разбор · Вес · 95»; продукт — запись через день (${UI}:11888).`,
    },
  ],
  [
    'Разбор · Готовность ко сну · 86',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${VAR}:1788`,
      fact:
        'Четыре фактора вечера (вода, еда до сна, шаги, кофеин); экранное время не заводим — '
        + `самоотчёт, чек-ин укорачивали (решение владельца 30.08, ${VAR}:1788-1795).`,
    },
  ],
  [
    'Разбор · Готовность ко сну · 100',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${VAR}:1907`,
      fact:
        'Кадр называет строку «Средняя готовность»; продукт пишет «Закрыто в среднем N из M» по контракту — '
        + `${VAR}:1907, без балла готовности.`,
    },
  ],
  [
    'Разбор · Готовность ко сну · 101',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${VAR}:1907`,
      fact:
        `Значение — среднее число закрытых пунктов, не балл; подпись «Закрыто в среднем» — ${VAR}:1907.`,
    },
  ],
  [
    'Разбор · Динамика веса · 91',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:15667`,
      fact:
        `Продукт красит тоном и подпись, и значение (.is-bad .widget-bd-sheet__stat-label — ${CSS}:15667); `
        + 'кадр этого листа красит только значение (в «Разбор · Шаги» — обе).',
    },
  ],
  [
    'Разбор · Карта активности · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:140`,
      fact:
        'Лист назван не как плитка («Тепловая карта» vs «Карта активности»); заголовок взят от плитки — '
        + 'исключение widgets-canvas-copy :140.',
    },
  ],
  [
    'Разбор · Качество еды · 87',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${COPY}:148`,
      fact:
        'Третья часть столбика «обработанное» не размечена; столбик из двух частей, сладкое из простых углеводов '
        + '(решение владельца 30.08) — widgets-canvas-copy :148-150.',
    },
  ],
  [
    'Разбор · Качество еды · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:148`,
      fact: 'Копия кадра: третья часть столбика ждёт разметки базы — исключение widgets-canvas-copy :148.',
    },
  ],
  [
    'Разбор · Тренд здоровья · 79',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:157`,
      fact:
        'Кадр повторяет кикером заголовок листа; продукт называет срез «За 30 дней» — '
        + 'исключение widgets-canvas-copy :157 (полное имя в контракте и на плитке).',
    },
  ],
  [
    'Разбор · Тренд здоровья · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:157`,
      fact:
        'Кикер листа не повторяет заголовок — «За 30 дней» vs «Тренд здоровья»; widgets-canvas-copy :157.',
    },
  ],
  [
    'Шторка · Кольца БЖУ · 48',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${CSS}:11371`,
      fact:
        'Кегль превью 17 px в шторке против 21 px продукта: строка «вид · полоса клетчатки и белка» задаёт 21 px/600 для 1×1, '
        + `превью ужато — продукт .widget-v4-mini__value ${CSS}:11371-11378.`,
    },
  ],
  [
    'Шторка · Кольца БЖУ · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:160`,
      fact:
        'Кадр просит отдельную строку «белки, г»; в продукте подпись кольца — widgets-canvas-copy :160.',
    },
  ],
  [
    'Шторка · Тепловая карта · 30',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${CSS}:5308`,
      fact:
        `Клетка месяца не носит роль состояния: строка «тепловая карта» — шкала плотности одним тоном (${CSS}:5308-5310), `
        + 'ролью красится только итоговое число.',
    },
  ],
  [
    'Шторка · Инсулиновая волна · 24',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:11231`,
      fact:
        `Отступ героя: канвас даёт 9 px и 10 px; в продукте .widget-v4-hero-num одно правило margin-top 10 px — ${CSS}:11231-11235.`,
    },
  ],
  [
    'Шторка · Инсулиновая волна · 26',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${UI}:2414`,
      fact:
        'Цвет героя при пересечении: контракт «волна · пересечение» — тёплая метка нахлёста; '
        + `продукт val--overlap (${UI}:2266 класс, ${UI}:2414 v4InsulinWaveState).`,
    },
  ],
  [
    'Шторка · Вес · 18',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:13734`,
      fact:
        `.widget-v4-delta — 600 10px/1, отступ 7 (${CSS}:13734+); тон --gr2 через --good, кадр даёт --gr. `
        + 'Канвас непоследователен: та же дельта в 2×1 нарисована --gr2.',
    },
  ],
  [
    'Шторка · Вес · 24',
    {
      reasonCode: 'logic-invariant',
      decisionRef: `${CSS}:11371`,
      fact:
        `Вид «Только число»: .widget-v4-mini__value 21px/600 (${CSS}:11371-11378); кадр ·24 просит 17px для ужатого превью.`,
    },
  ],
  [
    'Шторка · Вода · текст',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${COPY}:164`,
      fact:
        'Решение «вода в плитке» 31.08: объём в теле, в шапке «Вода»; кадр ещё «Вода · 1,7 / 2,7 л» — '
        + 'widgets-canvas-copy :164 до пересъёмки.',
    },
  ],
  [
    'Шторка · Сон · текст',
    {
      reasonCode: 'owner-decision',
      decisionRef: `${COPY}:165`,
      fact:
        'Контракт «вид · сон «Окно сна»»: «Недосып · 7 дней» / «7,5 ч»; кадр «Недосып за 7 дней» / «норма 7,5» — '
        + 'widgets-canvas-copy :165.',
    },
  ],
  [
    'Шторка · Тренд здоровья · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:157`,
      fact: 'Превью шторки: кикер «Тренд · 14 дней» vs полное имя — widgets-canvas-copy :157.',
    },
  ],
  [
    'Смена вида · лист выбора · 34',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: PREVIEW,
      fact: stripBoilerplate(
        'Кадр-превью уменьшает плитку 2×2 (зазор 3, отступ 7); продукт держит числа плитки — '
          + `.widget-wd__chart-value (${CSS}:13889), renderWeightDynamicsBody compact: true.`,
      ),
    },
  ],
  [
    'Смена вида · лист выбора · рисунок 06',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: PREVIEW,
      fact: stripBoilerplate(
        `Поле рисунка: продукт svg 100%×54 viewBox 0 0 121 54 (${UI}:7264); кадр-превью 115×52.`,
      ),
    },
  ],
  [
    'Смена вида · лист выбора · рисунок 07',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: PREVIEW,
      fact: stripBoilerplate(
        `Линия: продукт path заливка .12 + stroke 2 non-scaling-stroke (${UI}:7369-7383); кадр — ломаная 2.5 без площади.`,
      ),
    },
  ],
  [
    'Смена вида · лист выбора · рисунок 08',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: PREVIEW,
      fact: stripBoilerplate(
        'Точка r 3.5 в превью — деталь уменьшения; WeightDynamicsChartSvg рисует только площадь и линию, круга нет.',
      ),
    },
  ],
  [
    'Сон · Долг за неделю · 03',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${UI}:4663`,
      fact:
        'Кадр «Недосып за 7 дней»; контракт «вид · сон «Окно сна»» — «Недосып · 7 дней» (127 px при 121 px ширины). '
        + `Продукт v4Kicker('Недосып · 7 дней') — ${UI}:4663.`,
    },
  ],
  [
    'Сон · Долг за неделю · 04',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${UI}:4664`,
      fact:
        'Кадр «норма 7,5»; контракт требует мету «7,5 ч» без слова «норма». '
        + `Продукт formatRuUnit(..., 'ч') на .widget-v4-row__meta — ${UI}:4664-4665.`,
    },
  ],
  [
    'Сон · Долг за неделю · текст',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${COPY}:165`,
      fact:
        'Кадр: «14 › Недосып за 7 дней › норма 7,5 › −3,2»; контракт — «Недосып · 7 дней» / «7,5 ч». '
        + 'Продукт следует контракту — widgets-canvas-copy :165.',
    },
  ],
  [
    'Каталог · значки вместо эмодзи · 07',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:3571`,
      fact:
        'Кадр 9.5 px mono 56 %; продукт .widget-v4-catalog__budget 11px/600 --v4-ink-data — '
        + `${UI}:10370, ${CSS}:3571-3578; комментарий ${CSS}:3555-3558 отвергает 9.5 mono.`,
    },
  ],
  [
    'Каталог · значки вместо эмодзи · 13',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:12536`,
      fact:
        'Кадр — пустой прямоугольник 68×64 на --c2 (заглушка стенда). Продукт 1×1 превью __preview--1x1 — '
        + `${CSS}:12536; строка «каталог» требует живую плитку тем же кодом.`,
    },
  ],
  [
    'Каталог · значки вместо эмодзи · 18',
    {
      reasonCode: 'canvas-conflict',
      decisionRef: `${CSS}:4723`,
      fact:
        'Кадр ставит чипы в колонку каталога; продукт — на плитке веса .widget-weight__stats / __stat — '
        + `${CSS}:4723, AnalyticsBlock ${UI}:5072.`,
    },
  ],
]);

/** @returns {'handoff'|'demo-only'|'designer-removed'|'foreign-zone'} */
function classifyNaKind(key, fact) {
  const t = String(fact || '');
  const tl = t.toLowerCase();
  const k = String(key);

  if (/^(экран|границы|источник|адресация|номера видов|рамка канваса|палитры)(:|$)/i.test(k)) {
    return 'handoff';
  }
  if (k === 'демо' || /data-demo|protocol|loop|демо-данн|стенд канваса|не реализовывать|петля/i.test(t)) {
    return 'demo-only';
  }
  if (/дизайнер убрал|не в прод|отверг|снят из продукта|implements.*not/i.test(t)) {
    return 'designer-removed';
  }
  if (t.startsWith('форма считается по данным человека')) return 'demo-only';
  if (t.startsWith('подложка листа побайтово равна строке')) return 'handoff';
  if (t.startsWith('контур чужой зоны')) return 'foreign-zone';
  if (t.startsWith('адресация разметки кадра')) return 'handoff';
  if (t.startsWith('тот же элемент кадра с другим числом')) return 'handoff';
  if (/шапка приложения|зоне «шапка|date-remainders|нижняя навигация|tab-bar|чужая зона|foreign-zone|вне зоны home-widgets/i.test(t)) {
    return 'foreign-zone';
  }
  if (
    /высота кадра канваса|разметка стенда|разметка канваса|к коду не сводится|к коду продукта не сводится|в продукте отсутствуют|рабочая ширина канваса|data-screen-label|указание источника|v4-canvas\.css|правило палитр/i.test(
      t,
    )
  ) {
    return 'handoff';
  }
  if (/сведена кадром|сверена кадром|геометрия у копии|подложка главного экрана/i.test(t)) {
    return 'handoff';
  }
  if (/границы.*отдаёт|строка про владение зонами/i.test(t)) {
    return 'handoff';
  }
  if (/кадр рисует для контекста|для контекста, не для кода/i.test(t)) {
    return 'foreign-zone';
  }
  if (/виджеты-canvas-icons|widgets-canvas-icons|колокол шапки|капсулы даты|значок меню шапки/i.test(t)) {
    return 'foreign-zone';
  }
  if (/главная · дефолтная раскладка · \d{2}$/.test(k) && /подложка|сверена кадром|адресация/i.test(t)) {
    return 'handoff';
  }
  if (/^Главная · дефолтная раскладка · \d{2}$/.test(k) && /подложка главного экрана/i.test(t)) {
    return 'handoff';
  }
  if (k.includes('· текст') && /подложка|сверена|адресация разметки/i.test(t)) {
    return 'handoff';
  }
  throw new Error(`naKind не классифицирован: «${key}» — ${t.slice(0, 80)}`);
}

const zone = readZone(ZONE, { root: ROOT });
const neqKeys = new Set(NEQ_FINAL.keys());
const naPending = Object.entries(zone.rows)
  .filter(([, row]) => row.v === '—' && !row.naKind)
  .map(([key, row]) => ({ key, fact: row.f, naKind: classifyNaKind(key, row.f || '') }));

const scopeKeys = new Set([...neqKeys, ...naPending.map((p) => p.key)]);
const foreignBefore = snapshotForeignRowStrings(zone.rows, scopeKeys);

const batch = withZoneWriteLock(ZONE, () => {
  const fresh = readZone(ZONE, { root: ROOT });
  let neqApplied = 0;
  for (const [key, spec] of NEQ_FINAL) {
    const row = fresh.rows[key];
    if (!row || row.v !== '≠') {
      throw new Error(`missing or not ≠: ${key}`);
    }
    applyVerdictToRow(
      row,
      {
        verdict: '≠',
        fact: spec.fact,
        options: { 'reason-code': spec.reasonCode, 'decision-ref': spec.decisionRef },
      },
      ROOT,
    );
    neqApplied += 1;
    console.log(`≠ ${key} → ${spec.reasonCode} · ${spec.decisionRef.split('#').pop() || spec.decisionRef}`);
  }

  const naCounts = {};
  let naApplied = 0;
  for (const p of naPending) {
    const row = fresh.rows[p.key];
    if (!row || row.v !== '—') throw new Error(`missing or not —: ${p.key}`);
    applyVerdictToRow(
      row,
      { verdict: '—', fact: p.fact, options: { 'na-kind': p.naKind } },
      ROOT,
    );
    naCounts[p.naKind] = (naCounts[p.naKind] || 0) + 1;
    naApplied += 1;
  }

  fresh.sharedDecisionRefs = {
    [`${UI}:11888`]: {
      scope: 'frame',
      note:
        'Лист «Разбор · Вес»: кадр рисует пилюли ввода, «Записать вес» уводит в день (recordWeight → openWeightPicker). '
        + 'Решение владельца 31.08 — отложить ввод в листе до пакета дизайна.',
    },
  };

  writeZone(ZONE, fresh);
  return { neqApplied, naApplied, naCounts };
});

assertForeignRowsUnchanged(foreignBefore, readZone(ZONE, { root: ROOT }).rows, scopeKeys);

const finalZone = readZone(ZONE, { root: ROOT });
const naTotals = {};
for (const row of Object.values(finalZone.rows)) {
  if (row.v === '—' && row.naKind) naTotals[row.naKind] = (naTotals[row.naKind] || 0) + 1;
}

console.log(`\nhome-widgets finalize: ≠ ${batch.neqApplied}, naKind applied ${batch.naApplied}`);
console.log('naKind totals:', naTotals);
