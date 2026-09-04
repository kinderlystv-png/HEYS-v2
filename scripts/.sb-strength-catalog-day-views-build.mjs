import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canvasPath = path.join(
  ROOT,
  'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html'
);
const verdictsPath = path.join(ROOT, 'docs/ui/verdicts/strength-builder.json');
const outPath = path.join(ROOT, 'scripts/.sb-strength-catalog-day-views-handoff.json');

const canvas = fs.readFileSync(canvasPath, 'utf8');
const verdictRows = JSON.parse(fs.readFileSync(verdictsPath, 'utf8')).rows;

const prior = {
  muscles: JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.sb-catalog-exercise-muscles-handoff.json'), 'utf8')),
  custom: JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.sb-catalog-custom-exercise-handoff.json'), 'utf8')),
  copy: JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.sb-strength-copy-text-handoff.json'), 'utf8')),
  day: JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/.sb-day-trainings-verdict-handoff.json'), 'utf8')),
};

const parentKeys = [
  'вид · карточка упражнения',
  'вид · раскрытое упражнение',
  'вид · таблица подходов в карточке',
  'вид · создание упражнения',
  'вид · выбор групп мышц',
  'Своё упражнение · текст',
  '5 · карточка упражнения несёт три вещи',
  'вид · день не состоялся',
  'День не состоялся · 17',
  'пропущенный день — выбор, а не упрёк',
  'вчерашняя ждёт решения, а не закрывается сама',
  'у брошенной сессии три исхода',
  'отчёт называет дыру',
  'пропущен сегодня и пропущен раньше — два разных случая',
  'целевой день с выбранным лимитом не предлагается',
];

const subPatterns = [
  /^Упражнение · карточка · \d+$/,
  /^Упражнение · карточка · текст$/,
  /^Своё упражнение · \d+$/,
  /^Своё упражнение · текст$/,
  /^Упражнение · группы мышц · \d+$/,
  /^Упражнение · группы мышц · текст$/,
  /^День не состоялся · \d+$/,
  /^День не состоялся · текст$/,
  /^Сессия · брошена вчера · \d+$/,
  /^Сессия · брошена вчера · текст$/,
];

function sectionFor(key) {
  if (
    [
      'вид · карточка упражнения',
      'вид · раскрытое упражнение',
      'вид · таблица подходов в карточке',
      'вид · создание упражнения',
      'вид · выбор групп мышц',
      'Своё упражнение · текст',
      '5 · карточка упражнения несёт три вещи',
    ].includes(key) ||
    /^Упражнение · карточка/.test(key) ||
    /^Своё упражнение/.test(key) ||
    /^Упражнение · группы мышц/.test(key)
  ) return 'catalogCard';
  return 'day';
}

const allKeys = new Set(parentKeys);
for (const k of Object.keys(verdictRows)) {
  if (subPatterns.some((p) => p.test(k))) allKeys.add(k);
}
for (const m of canvas.matchAll(/<b>([^<]+)<\/b>/g)) {
  const k = m[1].trim();
  if (subPatterns.some((p) => p.test(k))) allKeys.add(k);
}

const priorByKey = new Map();
for (const src of [prior.muscles, prior.custom, prior.copy, prior.day]) {
  for (const row of src.rows || []) {
    const key = row.key || row.contractLine;
    if (key) priorByKey.set(key, row);
  }
}

/** Handoff recommendations (canvas vs production code), may differ from stale verdict placeholders. */
const recommend = {
  'вид · карточка упражнения': {
    verdict: '=',
    fact:
      'Кадр М1: aggregate data-v strength-builder.v4.dc.html:2277. Продукт ExerciseCardScreen heys_strength_builder_ui_v1.js:387-542 + 750 .sb-ex-card-*; построчно ·01-19 = (strength-builder-exercise-card-v4-canvas-contract.test.js).',
  },
  'вид · раскрытое упражнение': {
    verdict: '=',
    fact:
      'Канвас :2342 (.ex.is-open, ⠿, счётчик 2/4, ✕ 36 data-svc). Продукт ExerciseCard superset_ui:1697-1802 + 750 .sb-builder-screen.is-exercise-open .sb-ex.is-open (:3480-3547); без overlay/scrim. Отличие рамки 1.5px vs 2px — в исключениях calm/geometry, поведение =.',
  },
  'вид · таблица подходов в карточке': {
    verdict: '=',
    fact:
      'Канвас :2344 (A1б .vl/.ok/.off круг 44). Продукт ApproachRow + 750 в раскрытой карточке; strength-builder-approach-table-v4-canvas-contract.test.js + calm A1б.',
  },
  'вид · создание упражнения': {
    verdict: '≠',
    fact:
      'Канвас В3 data-v :2356 («1·Что меряем», пилюли, «Создать без объёма»). Runtime: каталог onCreate → view new → ExerciseCardScreen М1 (builder_ui:1458, :387) — «Чем меряется», одна CTA «Сохранить упражнение», без «Создать без объёма». NewExerciseScreen/CustomExerciseScreen есть, но не подключены (rg по apps/web — только export+тесты).',
  },
  'вид · выбор групп мышц': {
    verdict: '≠',
    fact:
      'Канвас :2278 (пилюли 44, превью объёма). Поведение ExerciseMuscleGroupsScreen catalog_ui:446-493 =; геометрия пилюль ·08-10 ≠ (scripts/.sb-catalog-exercise-muscles-handoff.json). Агрегат ≠ из-за носителя, не копии.',
  },
  'Своё упражнение · текст': {
    verdict: '≠',
    fact:
      'Канвас :4070 — копия В3 («1·Что меряем», «Создать без объёма»). Production create = ExerciseCardScreen М1 (builder_ui:1458): «Чем меряется», «Сохранить упражнение», нет вторичной CTA. Copy-handoff (=) сверял unwired CustomExerciseScreen superset_ui:3134 — не боевой путь.',
  },
  '5 · карточка упражнения несёт три вещи': {
    verdict: '=',
    fact:
      'Канвас :2428 (единица, группы+основная, коэффициент в данных). ExerciseCardScreen save → exerciseMeta.save unit/primaryGroup/secondaryGroups/bodyweightFactor heys_exercise_catalog_v1.js:527-624; коэффициенты BODYWEIGHT_SIMILAR_OPTIONS :702+ как данные.',
  },
  'вид · день не состоялся': {
    verdict: '?',
    fact:
      'Поведение PlanCard missed superset_ui:2412-2483 + day_trainings handlers =. Геометрия ·06-16 = (missed contract test). Composite ·01-05 day shell — —; aggregate ? до закрытия shell/copy.',
  },
  'День не состоялся · 17': {
    verdict: '!',
    fact:
      'Канвас сноска «признак плана ловит только назначено» (:3420) — долг закрыт: isPlanned включает skipped/moved heys_kernel_strength_v1.js:36-38; dayTonnage пропускает план :1276+. В UI dev-сноски нет (намеренно). Рекомендация: снять ? → ! и обновить контракт/канвас.',
  },
  'пропущенный день — выбор, а не упрёк': {
    verdict: '=',
    fact:
      'Канвас :2243. PlanCard перенести/отпустить + MISSED_DAY_REASONS пилюли superset_ui:2461-2483; onSkip/onMove day_trainings:4447-4436; тоннаж не считает isPlanned kernel :36-38.',
  },
  'вчерашняя ждёт решения, а не закрывается сама': {
    verdict: '=',
    fact:
      'Канвас :2291. SummaryCard pastOpen без completedAt superset_ui:2105-2181; нет автозавершения; mergeWorkoutLifecyclePatch day_trainings:724-753; новая сессия не блокируется (offscreen-renumber + builder-ui stale tests).',
  },
  'у брошенной сессии три исхода': {
    verdict: '=',
    fact:
      'Канвас :2292 (завершить/дописать/удалить, без таймаута). SummaryCard stale: onDelete/onOpen/onCloseAtLastMark superset_ui:2174-2177 wired day_trainings:4491-4500.',
  },
  'отчёт называет дыру': {
    verdict: '?',
    fact:
      'Канвас :2321 + «Программа · отчёт за период · текст» :4076 — карточка «Пропущенная не считается сделанной». PlanVsDoneScreen superset_ui:2322-2397 без этой карточки; kernel isPlanned уже исключает skipped из факта. Нужно решение: убрать сноску из канваса как ! или вернуть disclosure в UI.',
  },
  'пропущен сегодня и пропущен раньше — два разных случая': {
    verdict: '?',
    fact:
      'Канвас :2399 + кадры Л5/Л6. day_trainings: onResumeSkipped только !isPastDay; прошлый skipped — missed-card без воскрешения. Кураторская замена «сегодня vs раньше» — proposal_ui, серверный guard в канвасе; отдельного Л6 UI нет.',
  },
  'целевой день с выбранным лимитом не предлагается': {
    verdict: '=',
    fact:
      'Канвас :2319 (пилюля «занят», 40% ink, нет действия). moveOptionsFor busy при real.length>=3 day_trainings:3078-3113; MoveSheet disabled+«занят» superset_ui:2554-2562.',
  },
};

function rowFor(key) {
  const section = sectionFor(key);
  const verdictEntry = verdictRows[key];
  const priorRow = priorByKey.get(key);

  if (recommend[key]) {
    return { key, verdict: recommend[key].verdict, fact: recommend[key].fact, section };
  }

  if (priorRow && (priorRow.verdict || priorRow.f)) {
    return {
      key,
      verdict: priorRow.verdict,
      fact: priorRow.f || priorRow.fact || verdictEntry?.f || 'prior handoff',
      section,
    };
  }

  if (/^Своё упражнение · \d+$/.test(key)) {
    const n = +key.split('·').pop().trim();
    const wiredNote =
      ' Внимание: ·01-07 shell; ·08-23 сверены с unwired NewExerciseScreen (catalog_ui), production create = ExerciseCardScreen М1.';
    if (n >= 8 && n <= 17) {
      return {
        key,
        verdict: '≠',
        fact:
          (priorRow?.f || verdictEntry?.f || 'canvas-conflict badge vs radio/chip') +
          wiredNote,
        section,
      };
    }
    if (n >= 1 && n <= 7) {
      return {
        key,
        verdict: '=',
        fact:
          'Shell В3 совпадает с NewExerciseScreen в тестах, но runtime create идёт в ExerciseCardScreen М1 (builder_ui:1458).' +
          wiredNote,
        section,
      };
    }
  }

  if (/^Сессия · брошена вчера/.test(key)) {
    const behavior =
      key.endsWith('· текст')
        ? 'Копия М8 ≠ inline SummaryCard stale (удалить/дописать/закрыть lowercase).'
        : 'Кадр М8 full-screen ≠ inline .sb-offscreen-session--stale в ленте дня.';
    return {
      key,
      verdict: key.endsWith('· текст') ? '≠' : '≠',
      fact: `${behavior} Поведение трёх исходов = (superset_ui:2161-2177). ${verdictEntry?.f || ''}`.trim(),
      section,
    };
  }

  if (/^День не состоялся · 0[1-5]$/.test(key) || key === 'День не состоялся · текст') {
    return {
      key,
      verdict: '—',
      fact: verdictEntry?.f || 'visual-composite day shell; runtime ·06-16 в PlanCard.',
      section,
    };
  }

  if (/^День не состоялся ·/.test(key)) {
    return {
      key,
      verdict: verdictEntry?.v || '?',
      fact: verdictEntry?.f || 'strength-builder-day-missed-v4-canvas-contract.test.js',
      section,
    };
  }

  if (/^Упражнение · карточка/.test(key) || /^Упражнение · группы мышц/.test(key)) {
    return {
      key,
      verdict: verdictEntry?.v || '=',
      fact:
        verdictEntry?.f ||
        'strength-builder-exercise-card-v4-canvas-contract.test.js / exercise-muscles contract test',
      section,
    };
  }

  return {
    key,
    verdict: verdictEntry?.v || '?',
    fact: verdictEntry?.f || 'нет сверки в этом handoff',
    section,
  };
}

const rows = [...allKeys].sort((a, b) => a.localeCompare(b, 'ru')).map(rowFor);

function countVerdict(v) {
  return rows.filter((r) => r.verdict === v).length;
}

const catalogRows = rows.filter((r) => r.section === 'catalogCard');
const dayRows = rows.filter((r) => r.section === 'day');

const handoff = {
  zone: 'strength-builder',
  scope: 'catalog views + day missed/outcomes (read-only)',
  generated: '2026-09-05',
  notes: {
    productionCreatePath:
      'Catalog onCreate → builder_ui:1458 setView(new) → ExerciseCardScreen М1; канвас В3/NewExerciseScreen/CustomExerciseScreen — не боевой маршрут.',
    priorHandoffs: [
      'scripts/.sb-catalog-exercise-muscles-handoff.json',
      'scripts/.sb-catalog-custom-exercise-handoff.json',
      'scripts/.sb-strength-copy-text-handoff.json',
      'scripts/.sb-day-trainings-verdict-handoff.json',
    ],
    missingKeys: [],
  },
  summary: {
    rows: rows.length,
    equals: countVerdict('='),
    notEquals: countVerdict('≠'),
    question: countVerdict('?'),
    dash: countVerdict('—'),
    resolved: countVerdict('!'),
  },
  sections: {
    catalogCard: {
      keys: parentKeys.slice(0, 7),
      rowCount: catalogRows.length,
      equals: catalogRows.filter((r) => r.verdict === '=').length,
      notEquals: catalogRows.filter((r) => r.verdict === '≠').length,
      question: catalogRows.filter((r) => r.verdict === '?').length,
      dash: catalogRows.filter((r) => r.verdict === '—').length,
      resolved: catalogRows.filter((r) => r.verdict === '!').length,
    },
    day: {
      keys: parentKeys.slice(7),
      rowCount: dayRows.length,
      equals: dayRows.filter((r) => r.verdict === '=').length,
      notEquals: dayRows.filter((r) => r.verdict === '≠').length,
      question: dayRows.filter((r) => r.verdict === '?').length,
      dash: dayRows.filter((r) => r.verdict === '—').length,
      resolved: dayRows.filter((r) => r.verdict === '!').length,
    },
  },
  rows: rows.map(({ key, verdict, fact }) => ({ key, verdict, fact })),
};

handoff.notes.missingKeys = parentKeys.filter((k) => !canvas.includes('<b>' + k + '</b>'));

fs.writeFileSync(outPath, JSON.stringify(handoff, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ out: outPath, summary: handoff.summary, sections: handoff.sections }, null, 2));
