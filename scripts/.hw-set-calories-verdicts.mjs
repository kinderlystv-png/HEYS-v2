import { applyVerdictToRow } from './ui-v4-set-verdict.mjs';
import { readZone, writeZone } from './lib/ui-v4-verdicts.mjs';

const SMOKE = 'widgets-calories-v4-contract.test.js';
const UI = 'heys_widgets_ui_v1.js';
const CSS = '730-widgets-dashboard.css';
const PAL = '002-ui-v4-palette-roles.css';

const HERO = {
  '01': `1) Плитка .widget--calories — ${CSS}:10499 padding 14px, фон --v4-hero. 2) Кадр stop, data-vid «вид плитки». 3) Не цвет элемента. 4) Смоук: ${SMOKE}.`,
  '02': `1) Ряд .widget-calories__hero-value — ${UI}:4110. 2) baseline, gap 5px — ${CSS}:10567-10569. 3) Не цвет. 4) «642» — formatKcal(remaining).`,
  '03': `1) Число .widget-calories__value--lg — ${UI}:4111. 2) 34px/600/.9/-.035em — ${CSS}:10575-10581. 3) --v4-act-text: песок #8a4a20, синий #1d5e96 (${PAL}:147/467). 4) Смоук: ${SMOKE}.`,
  '04': `1) Подпись .widget-calories__hero-remaining-label — ${UI}:4116. 2) 10px/500, margin-top 7 — ${CSS}:10590-10595. 3) --v4-ink-data (56 %). 4) Текст «осталось».`,
  '05': `1) Низ .widget-calories__hero-bar-wrap — ${UI}:4121. 2) margin-top auto у wrap — ${CSS}:10599-10601. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': `1) Дорожка .widget-calories__hero-bar — caloriesHeroBar ${UI}:3895. 2) relative, 6px, 999, overflow hidden — ${CSS}:10604-10609. 3) Фон rgba(--v4-ink-rgb,.1). 4) Смоук: ${SMOKE}.`,
  '07': `1) Заливка .widget-calories__hero-bar-fill — ${UI}:3897 style width. 2) absolute внутри relative, 6px, 999 — ${CSS}:10623-10627. 3) --v4-act (#c67139 / #2e7cc0). 4) Ширина из caloriesBarSplit, не хардкод кадра.`,
  '08': `1) Подвал caloriesHeroBarFoot — ${UI}:4123. 2) space-between, flex-start, margin-top 8 — ${CSS}:10630-10635. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '09': `1) Колонка .widget-calories__hero-bar-col — ${UI}:3874. 2) column, gap 2 — ${CSS}:10638-10642. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '10': `1) Число съеденного .widget-calories__hero-bar-num--ink — ${UI}:4101. 2) 11px/700 — ${CSS}:10650-10655. 3) rgba(--v4-ink-rgb,.85). 4) «1 289» — formatKcal(eaten).`,
  '11': `1) Подпись .widget-calories__hero-bar-cap — ${UI}:3880. 2) 8.5px/500 — ${CSS}:10671-10675. 3) --v4-ink-data. 4) «съедено».`,
  '12': `1) Правая колонка --end — ${UI}:3887. 2) align flex-end — ${CSS}:10645-10647. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '13': `1) Норма .widget-calories__hero-bar-num--good — ${UI}:4102-4105. 2) 11px/700 — ${CSS}:10650-10655. 3) --v4-sand-ok-text: песок #5c6a45, синий #9fb981 (${PAL}:247/399). 4) «1 931» — formatKcal(target).`,
};

const HERO_HEADLESS = {
  ...HERO,
  '01': `1) Плитка без шапки: .widget:has(.widget-calories--2x2) .widget__header display none — ${CSS}:2151-2152; padding 14 — ${CSS}:10499-10501. 2) Кадр stop «Остаток и рамки». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '10': `1) То же .widget-calories__hero-bar-num--ink, ${UI}:4101. 2) 11px/700. 3) Кадр пишет var(--tx); продукт --ink 85 % (${CSS}:10663-10664) как у «Как сейчас»·10. 4) formatKcal(eaten).`,
};

const OVER = {
  ...HERO,
  '03': `1) Перебор: heroValue «−…» + widget-v4-val--bad — ${UI}:4090-4113. 2) 34px/600/.9 — ${CSS}:10575-10581. 3) --v4-bad-text: песок #a8382b, синий #b03a24 (${PAL}:503). 4) Смоук: ${SMOKE}.`,
  '04': `1) Подпись «перебор» + val--bad — ${UI}:4093-4118. 2) 10px/500, margin-top 7 — ${CSS}:10590-10595. 3) --v4-bad-text. 4) Смоук: ${SMOKE}.`,
  '07': `1) Заливка до нормы + over сегмент — caloriesBarSplit ${UI}:3911-3917 / caloriesHeroBar ${UI}:3894. 2) .widget-calories__hero-bar-over absolute — ${CSS}:10614-10620. 3) --v4-bad-text на хвосте. 4) Демо 94 % — динамический split.`,
  '08': `1) Красный хвост .widget-calories__hero-bar-over — ${UI}:3900-3904. 2) position absolute, right 0 — ${CSS}:10614-10618. 3) --v4-bad-text. 4) Смоук: ${SMOKE}.`,
  '11': `1) Съедено footLeft — ${UI}:4101. 2) 11px/700 --ink. 3) Не bad: факт чернилами. 4) «2 051» — formatKcal(eaten).`,
  '14': `1) Норма при переборе tone bad — ${UI}:4102-4105. 2) 11px/700. 3) --v4-bad-text на числе нормы. 4) Смоук: ${SMOKE}.`,
};

const CLOSED = {
  ...HERO,
  '03': `1) Закрытый день: heroValue = съедено — ${UI}:4088-4090. 2) 34px/600/.9, --v4-act-text — ${CSS}:10575-10581. 3) Песок/синий act-text. 4) «1 786» — formatKcal(eaten).`,
  '04': `1) Подпись «съедено за день» — ${UI}:4091-4093. 2) 10px/500, margin-top 7 — ${CSS}:10590-10595. 3) --v4-ink-data. 4) Смоук: ${SMOKE}.`,
  '07': `1) Полоса fill по eaten/target — caloriesBarSplit ${UI}:4094. 2) relative 6px — ${CSS}:10604-10609. 3) --v4-act fill. 4) Демо 92 % — динамика.`,
  '10': `1) «не съедено» footLeft — ${UI}:4097-4100. 2) 11px/700 --ink. 3) rgba 85 %. 4) «145» — formatKcal(remaining).`,
  '11': `1) Подпись «не съедено» — ${UI}:4100. 2) cap 8.5px — ${CSS}:10671-10675. 3) --v4-ink-data. 4) Смоук: ${SMOKE}.`,
};

const LINE = {
  '01': `1) Корень .widget-calories--v4-line — ${UI}:4062. 2) column 100 % — ${CSS}:14163-14169. 3) Не цвет. 4) Вид line 2×1, heys_widgets_variants_v4.js:81.`,
  '02': `1) Шапка .widget-calories__line-head — ${UI}:4065. 2) baseline, space-between, gap 6, nowrap — ${CSS}:14172-14177. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '03': `1) Левая группа .widget-calories__line-value — ${UI}:4066. 2) baseline, gap 4 — ${CSS}:14180-14189. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число .widget-calories__line-value — ${UI}:4066. 2) 19px/600/-.03em — ${CSS}:14184-14188. 3) --v4-sand-act-text: #8a4a20 / #1d5e96. 4) «642» — formatKcal(remaining).`,
  '05': `1) Подпись .widget-calories__line-meta — ${UI}:4072. 2) 8.5px/500 — ${CSS}:14199-14205. 3) --v4-ink-data. 4) «осталось».`,
  '06': `1) Низ .widget-calories__line-foot — ${UI}:4076. 2) center, gap 7, margin-top auto — ${CSS}:14208-14212. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '07': `1) Полоса в foot .widget-calories__hero-bar — ${UI}:4077. 2) flex 1, height 5px — ${CSS}:14215-14221. 3) track 10 %. 4) Смоук: ${SMOKE}.`,
  '08': `1) Заливка 5px — ${CSS}:14220-14221. 2) width inline из split. 3) --v4-act. 4) Демо 67 % — динамика.`,
  '09': `1) Дробь .widget-calories__line-fraction — ${UI}:4078. 2) 9px/600, flex none — ${CSS}:14224-14230. 3) --v4-ink-data. 4) «1 289 / 1 931».`,
};

const ACTIVITY = {
  '01': LINE['01'].replace('line', 'activity').replace('line 2×1', 'activity 2×1'),
  '02': LINE['02'],
  '03': LINE['03'],
  '04': LINE['04'].replace('642', '852').replace('remaining', 'remainingWithActivity'),
  '05': `1) Прибавка .widget-calories__line-meta--gain — ${UI}:4001. 2) 9px/700 — ${CSS}:14311-14313. 3) --v4-sand-ok-text: #5c6a45 / #9fb981. 4) «+210 актив».`,
  '06': `1) Foot .widget-calories__activity-foot — ${UI}:4010. 2) 8.5px/600, margin-top auto — ${CSS}:14151-14157. 3) --v4-ink-data. 4) «съедено … из …».`,
};

const DINNER = {
  '01': `1) .widget-calories--v4-dinner — ${UI}:4022. 2) column flex 1 — ${CSS}:14235-14241. 3) Не цвет. 4) Вид dinner 2×2.`,
  '02': HERO['02'],
  '03': `1) .widget-calories__value--md — ${UI}:4024. 2) 26px/600/.9/-.035em — ${CSS}:14244-14250. 3) --v4-sand-act-text. 4) formatKcal(remaining).`,
  '04': HERO['05'],
  '05': `1) .widget-calories__dinner-row — ${UI}:4028. 2) space-between, baseline, 10px/600 — ${CSS}:14253-14260. 3) --v4-ink-data + budget --v4-sand-ink. 4) «обычный ужин» / «720».`,
  '06': `1) Бюджет .widget-calories__dinner-budget — ${UI}:4030. 2) В строке dinner-row. 3) --v4-sand-ink (#201e1d / #101826). 4) formatKcal(dinnerBudget).`,
  '07': `1) Полоса в wrap — caloriesHeroBar ${UI}:4032. 2) relative 6px, margin-top 7 — ${CSS}:14268-14269. 3) track 10 %. 4) Смоук: ${SMOKE}.`,
  '08': `1) Заливка dinnerFill width — ${UI}:4019-4021. 2) absolute fill 89 % кадра — динамика. 3) --v4-act. 4) Смоук: ${SMOKE}.`,
  '09': `1) Красный хвост при нехватке — ${UI}:4032 overPct. 2) .widget-calories__hero-bar-over. 3) --v4-bad-text. 4) Смоук: ${SMOKE}.`,
  '10': `1) Заметка .widget-calories__dinner-note — ${UI}:4033. 2) 10px/600, margin-top 7 — ${CSS}:14272-14277. 3) val--bad при нехватке. 4) «не хватит … ккал».`,
};

const EMPTY21 = {
  '01': `1) Плитка 2×1 empty — ${UI}:3978. 2) width/height кадра — сетка 143×64, не отдельное правило. 3) Не цвет. 4) Смоук: ${SMOKE} / home-widgets-empty-day-v4.test.js.`,
  '02': `1) v4Kicker('Калории') — ${UI}:3979. 2) .widget-v4-kicker — ${CSS}:10518. 3) Слово. 4) «Калории».`,
  '03': `1) .widget-calories__empty-row — ${UI}:3980. 2) baseline, gap 5, margin-top auto — ${CSS}:11778-11782. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) .widget-calories__empty-dash — ${UI}:3981. 2) 21px/600 — ${CSS}:11785-11789. 3) --v4-ink-3 (42 %). 4) «—».`,
  '05': `1) .widget-calories__empty-target — ${UI}:3983. 2) 9px/600 — ${CSS}:11792-11797. 3) --v4-ink-data. 4) «из N».`,
};

const EMPTY22 = {
  '01': `1) 2×2 empty hero — ${UI}:3962. 2) padding 14, --v4-hero — ${CSS}:10499-10501. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': HERO['02'],
  '03': `1) .widget-calories__value--lg «—» — ${UI}:3965. 2) 34px/600/.9 — ${CSS}:10575-10581 + empty override ${CSS}:11773-11775. 3) --v4-ink-3. 4) Прочерк факта.`,
  '04': HERO['04'].replace('осталось', 'осталось на пустом дне'),
  '05': `1) wrap margin-top auto — ${UI}:3970. 2) foot space-between — ${UI}:3971-3974. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': HERO['09'],
  '07': `1) Прочерк съеденного .widget-calories__hero-bar-num--ink на empty — ${UI}:3972. 2) 11px/700 --ink-3 — ${CSS}:11773-11775. 3) --v4-ink-3. 4) «—».`,
  '08': HERO['11'],
  '09': HERO['12'],
  '10': HERO['13'],
};

const PROTOCOL_NA = {
  'na-kind': 'demo-only',
};

function rowsFromMap(prefix, map, verdict = '=') {
  return Object.entries(map).map(([n, fact]) => [ `${prefix} · ${n}`, verdict, fact ]);
}

function rowsFromPrefix(prefix, count, verdict, factFn) {
  const out = [];
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    out.push([ `${prefix} · ${n}`, verdict, factFn(n) ]);
  }
  return out;
}

const PROTOCOL_PREFIXES = [
  'Калории без заголовка · Подписи над числами',
  'Калории без заголовка · Максимум цифры',
  'Калории без заголовка · Один факт',
  'Калории без заголовка · Строка',
];

const PROTOCOL_COUNTS = { 'Подписи над числами': 12, 'Максимум цифры': 8, 'Один факт': 5, 'Строка': 8 };

const ROWS = [
  ...rowsFromMap('Калории · Как сейчас', HERO),
  ...rowsFromMap('Калории без заголовка · Остаток и рамки', HERO_HEADLESS),
  ...rowsFromMap('Калории · состояние · В норме', HERO),
  ...rowsFromMap('Калории · состояние · Перебор', OVER),
  ...rowsFromMap('Калории · состояние · Закрытый день', CLOSED),
  ...rowsFromMap('Калории · Строка', LINE),
  ...rowsFromMap('Калории · С активностью', ACTIVITY),
  ...rowsFromMap('Калории · Хватит на ужин', DINNER),
  ...rowsFromMap('Калории · пустой день · 2×1', EMPTY21),
  ...rowsFromMap('Калории · пустой день · 2×2', EMPTY22),
  [
    'Калории · Как сейчас · текст',
    '=',
    `1) Слова кадра: «642», «ккал», «осталось», «1 289», «съедено», «1 931», «норма». 2) Номер «1» — .num клетки. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · Строка · текст',
    '=',
    '1) «642», «ккал», «осталось», «1 289 / 1 931». 2) Номер клетки. 3) Не цвет. 4) Смоук: widgets-canvas-copy.test.js.',
  ],
  [
    'Калории · Хватит на ужин · текст',
    '=',
    `1) «642», «ккал осталось», «обычный ужин», «720», «не хватит 78 ккал». 2) Номер клетки. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · С активностью · текст',
    '=',
    `1) «852», «ккал», «+210 актив», «съедено 1 289 из 2 141». 2) Номер клетки. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · пустой день · 2×1 · текст',
    '=',
    '1) «Калории», «—», «из 1 931». 2) Не цвет. 3) Смоук: home-widgets-empty-day-v4.test.js.',
  ],
  [
    'Калории · пустой день · 2×2 · текст',
    '=',
    `1) «—», «ккал», «осталось», «съедено», «норма». 2) Не цвет. 3) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории без заголовка · Остаток и рамки · текст',
    '=',
    `1) Те же слова, что «Как сейчас · текст»; кадр без шапки виджета. 2) Номер «1а». 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · состояние · В норме · текст',
    '=',
    `1) Как hero: 642, ккал, осталось, 1 289, съедено, 1 931, норма. 2) Не цвет. 3) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · состояние · Перебор · текст',
    '=',
    `1) «−120», «перебор», «2 051», «съедено», «1 931», «норма». 2) Не цвет. 3) Смоук: ${SMOKE}.`,
  ],
  [
    'Калории · состояние · Закрытый день · текст',
    '=',
    `1) «1 786», «съедено за день», «145», «не съедено», «1 931», «норма». 2) Не цвет. 3) Смоук: ${SMOKE}.`,
  ],
];

for (const prefix of PROTOCOL_PREFIXES) {
  const short = prefix.split(' · ').slice(-1)[0];
  const count = PROTOCOL_COUNTS[short];
  for (let i = 1; i <= count; i += 1) {
    const n = String(i).padStart(2, '0');
    ROWS.push([
      `${prefix} · ${n}`,
      '—',
      `кадр data-demo="protocol" — альтернативная раскладка героя без шапки; в продукте дефолт hero 2×2 («Как сейчас» / «Остаток и рамки»), heys_widgets_variants_v4.js:80`,
      PROTOCOL_NA,
    ]);
  }
  if (short !== 'Один факт') {
    ROWS.push([
      `${prefix} · текст`,
      '—',
      'кадр data-demo="protocol" — текст отвергнутой раскладки; в продукте не реализуется',
      PROTOCOL_NA,
    ]);
  }
}

const zone = readZone('home-widgets');
let applied = 0;
for (const row of ROWS) {
  const [key, verdict, fact, options = {}] = row;
  const entry = zone.rows[key];
  if (!entry) {
    console.error('нет строки', key);
    process.exit(1);
  }
  if (entry.v !== '?') {
    console.error(`${key} уже ${entry.v}, стоп`);
    process.exit(1);
  }
  applyVerdictToRow(entry, { verdict, fact, options });
  applied += 1;
  console.log(`${key}  ? → ${verdict}`);
}
writeZone('home-widgets', zone);
console.log(`applied ${applied}`);
