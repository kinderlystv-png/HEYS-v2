import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

const SMOKE = 'widgets-insulin-wave-v4-contract.test.js';
const SCHEME = 'widgets-insulin-scheme-v4.test.js';
const OVERNIGHT = 'widgets-insulin-overnight-v4.test.js';
const UI = 'heys_widgets_ui_v1.js';
const V4 = 'heys_widgets_insulin_wave_v4.js';
const CSS = '730-widgets-dashboard.css';
const PAL = '002-ui-v4-palette-roles.css';

const TILE = `1) Плитка .widget-v4-stack — ${UI}:3178-3187. 2) Кадр stop, relative. 3) Не цвет. 4) Смоук: ${SMOKE}.`;
const ROW = `1) Ряд .widget-v4-row--tight — ${UI}:3179 / 3111 / 3128 / 3099. 2) space-between baseline — ${CSS}:10802-10806. 3) Не цвет. 4) Смоук: ${SMOKE}.`;
const KICKER_IW = `1) v4Kicker('Инсулиновая волна') — ${UI}:3179 / 3155 / 3049. 2) .widget-v4-kicker — ${CSS}:10518-10524. 3) Слово ключа. 4) Смоук: ${SMOKE}.`;

const DAY_AS_IS = {
  '01': TILE,
  '02': ROW.replace('3179 / 3111 / 3128 / 3099', '3179'),
  '03': KICKER_IW,
  '04': `1) Счётчик слева footer .widget-v4-insulin-wave__footer > span — ${UI}:3182. 2) 9.5px/700 — ${CSS}:11691-11695. 3) --v4-ink-data 56 % / val--overlap при нахлёсте (${CSS}:11072-11075). 4) mealCountLabel / overlapCountLabel.`,
  '05': `1) Footer space-between baseline — ${UI}:3181-3186. 2) margin-top auto у __footer — ${CSS}:11677-11679. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': `1) overlapCountLabel слева при нахлёсте — ${UI}:3182. 2) 9.5px/700, val--overlap — ${CSS}:11072-11075,11691-11695. 3) --v4-wave-overlap: песок #d99a63, синий #b03a24 (${PAL}:299/588). 4) «N волн наложились».`,
  '07': `1) stateLabel справа .widget-v4-muted — ${UI}:3183-3185. 2) 9.5px/700 — ${CSS}:11691-11695. 3) --v4-ink-data. 4) underWaveLabel / jointCountLabel.`,
};

const CURRENT = {
  '01': TILE,
  '02': ROW.replace('3179 / 3111 / 3128 / 3099', '3111'),
  '03': `1) v4Kicker('Идёт волна') — ${UI}:3112. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '04': `1) Meta .widget-v4-row__meta — ${UI}:3113-3114. 2) 9px/600 — ${CSS}:14536-14542. 3) --v4-ink-data. 4) currentMealMeta / overnightMark.`,
  '05': `1) Ряд .widget-v4-hero-num — ${UI}:3116. 2) baseline gap 5 margin-top 10 — ${CSS}:11011-11017. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': `1) Число .widget-v4-hero-num__val — ${UI}:3117-3119. 2) 26px/600/-.03em — ${CSS}:11035-11041. 3) val--act / overlap / good через v4InsulinWaveState ${UI}:2384-2387. 4) remaining минут.`,
};

const OVERLAPS = {
  '01': TILE,
  '02': ROW.replace('3179 / 3111 / 3128 / 3099', '3128'),
  '03': `1) v4Kicker('Пересечение волн') — ${UI}:3129. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '04': `1) Meta .widget-v4-row__meta — ${UI}:3130-3131. 2) 9px/600. 3) --v4-ink-data. 4) overlapTimeLabel.`,
  '05': CURRENT['05'],
  '06': `1) Число .widget-v4-hero-num__val — ${UI}:3134-3136. 2) 26px/600 (1.625rem) — ${CSS}:11035-11041; кадр пишет 24px — единое правило героя. 3) val--overlap → --v4-wave-overlap. 4) overlapHoursLabel.`,
  '07': `1) Подпись .widget-v4-insulin-wave__overlap-note — ${UI}:3142-3144. 2) 9px/600 margin-top 7 — ${CSS}:11683-11689. 3) --v4-ink-data. 4) «второй приём попал в волну».`,
};

const DAY_BAR = {
  '01': TILE.replace('3178-3187', '3098-3105'),
  '02': ROW.replace('3179 / 3111 / 3128 / 3099', '3099'),
  '03': `1) v4Kicker('Инсулин · под волной') — ${UI}:3100. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '04': `1) Meta elevatedMeta — ${UI}:3101-3102. 2) 9px/600. 3) --v4-ink-data. 4) «6:20 из 16:00».`,
  '05': `1) .widget-v4-insulin-daybar — InsulinWaveDayBar ${UI}:3001-3019. 2) gap 2 height 9 margin-top auto — ${CSS}:11633-11638. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '06': `1) Сегмент .widget-v4-insulin-daybar__seg — ${UI}:3006-3012. 2) flex inline, min-width 2, radius left — ${CSS}:11640-11647. 3) rgba 9 % track. 4) Демо flex — динамика.`,
  '07': `1) Сегмент --up — ${UI}:3009. 2) flex inline. 3) --v4-sand-wave #e6cfa8 (${PAL}:243). 4) elevated segment.`,
  '08': `1) Сегмент базовый — ${UI}:3006. 2) flex inline. 3) rgba 9 %. 4) Демо.`,
  '09': `1) Сегмент --up — ${UI}:3009. 2) flex inline. 3) --v4-sand-wave. 4) Демо.`,
  '10': `1) Сегмент --up — ${UI}:3009. 2) flex inline. 3) --v4-sand-wave. 4) Демо.`,
  '11': `1) Сегмент --up — ${UI}:3009. 2) flex inline. 3) --v4-sand-wave. 4) Демо.`,
  '12': `1) Сегмент --now — ${UI}:3010. 2) flex inline. 3) --v4-sand-ink (${CSS}:11655-11658). 4) now marker.`,
  '13': `1) Последний сегмент radius right — ${CSS}:11649-11651. 2) flex inline. 3) track 9 %. 4) Демо.`,
  '14': `1) Подписи .widget-v4-insulin-daybar__labels — ${UI}:3014-3018. 2) space-between 8.5px/600 margin-top 6 — ${CSS}:11664-11672. 3) --v4-ink-data. 4) start/now/end labels.`,
};

const CALM = {
  '01': TILE.replace('widget-v4-stack', 'widget-v4-mini').replace('3178-3187', '3083-3094'),
  '02': `1) v4Kicker('Покой') — ${UI}:3084. 2) .widget-v4-kicker. 3) Слово. 4) Смоук: ${SMOKE}.`,
  '03': `1) .widget-v4-mini__value--pair layout — ${UI}:3085-3087. 2) baseline gap 2 margin-top auto — ${CSS}:11151-11166. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '04': `1) Число .widget-v4-mini__value — ${UI}:3085-3087. 2) 21px/600/-.02em — ${CSS}:11151-11157. 3) val--good при calm >180 мин (${UI}:2386-2387). 4) calmWindowLabel.`,
  '05': `1) Подпись .widget-v4-unit — ${UI}:3092-3093. 2) line-height 1 — ${CSS}:10546-10552. 3) Не цвет. 4) «без волн» / overnightMark.`,
};

const EMPTY = {
  '01': TILE.replace('3178-3187', '3045-3060'),
  '02': KICKER_IW,
  '03': `1) Герой .widget-v4-hero-num — ${UI}:3050-3054. 2) baseline gap 6 margin-top 9 в кадре; продукт margin-top 10 — ${CSS}:11011-11017. 3) Не цвет. 4) Смоук: ${OVERNIGHT}.`,
  '04': `1) Прочерк .widget-v4-hero-num__val — ${UI}:3051-3053. 2) 26px/600 — ${CSS}:11035-11041. 3) val--neutral. 4) «—».`,
  '05': `1) Подпись .widget-v4-insulin-wave__note — ${UI}:3057-3059. 2) 9.5px/600 margin-top 7 — ${CSS}:11582-11588. 3) --v4-ink-data. 4) restFromWakeLabel.`,
};

const OVERNIGHT_FRAME = {
  '01': TILE.replace('3178-3187', '3151-3162'),
  '02': ROW.replace('3179 / 3111 / 3128 / 3099', '3155'),
  '03': KICKER_IW,
  '04': `1) overnightNote .widget-v4-insulin-wave__note — ${UI}:3157-3158. 2) 9.5px/600 margin-top 7 — ${CSS}:11582-11588. 3) --v4-ink-data. 4) «оценка по вчерашнему дню».`,
  '05': `1) overnightStateLabel __note--next — ${UI}:3159-3161. 2) margin-top 4 — ${CSS}:11590-11592. 3) --v4-ink-data. 4) «покой … от вчерашнего».`,
};

const JOINT = {
  '01': TILE,
  '02': ROW,
  '03': KICKER_IW,
  '04': DAY_AS_IS['04'].replace('mealCountLabel', 'mealCountLabel полный'),
  '05': DAY_AS_IS['05'],
  '06': DAY_AS_IS['06'],
};

const RISUNOK_DAY = {
  '01': `1) InsulinWaveDaySvg viewBox 0 0 130 52 height 52 — ${UI}:2833-2839. 2) Поле 100%×52. 3) Не цвет набора. 4) Смоук: ${SMOKE}.`,
  '02': `1) path figure.d — buildWaveScheme ${V4}. 2) Кривая схемы. 3) Не цвет. 4) Смоук: ${SCHEME}.`,
  '03': `1) .widget-v4-insulin-wave__fill opacity .45 — ${UI}:2850-2855. 2) closed figures. 3) --v4-sand-wave #e6cfa8 (${PAL}:243). 4) Смоук: ${SCHEME}.`,
  '04': `1) fill opacity .8 на active figure — ${UI}:2854. 2) последняя волна. 3) --v4-sand-wave. 4) Смоук: ${SCHEME}.`,
  '05': `1) baseline line y=46 — ${UI}:2858-2862. 2) stroke --v4-line 1.5. 3) rgba 12 %. 4) Смоук: ${SCHEME}.`,
  '06': `1) divider риска — ${UI}:2864-2869. 2) 1px × 3.5px. 3) --v4-line. 4) Смоук: ${SCHEME}.`,
  '07': `1) overlap rect clipPath — ${UI}:2878-2884. 2) width band. 3) --v4-wave-overlap 50 %. 4) Смоук: ${SCHEME}.`,
  '08': `1) brace line — ${UI}:2886-2891. 2) strokeWidth 2.4. 3) --v4-wave-overlap. 4) Смоук: ${SCHEME}.`,
};

const RISUNOK_CURRENT = {
  '01': `1) InsulinWaveCurrentSvg viewBox 0 0 130 48 — ${UI}:2900-2906. 2) height 48. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) activeWavePath fill — ${UI}:2908-2913. 2) opacity .5. 3) --v4-sand-wave. 4) Динамика.`,
  '03': `1) activeWaveOpenPath stroke — ${UI}:2918-2926. 2) 1.2px open contour. 3) --v4-sand-act (${CSS}:11518-11520). 4) Без базовой линии.`,
  '04': `1) Кадр рисует пунктир «сейчас»; в продукте InsulinWaveCurrentSvg его нет — ${UI}:2896-2934 (строка «волна · базовая линия»: ось и метка «сейчас» не рисуются в видах 28–29). 2) — 3) — 4) protocol/demo, не продукт.`,
  '05': `1) dot r 3.2 — ${UI}:2928-2932. 2) marker на кривой. 3) --v4-sand-act. 4) activeNowX.`,
};

const RISUNOK_OVERLAP = {
  '01': `1) InsulinWaveOverlapSvg viewBox 0 0 130 50 — ${UI}:2944-2951. 2) height 50. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) pair[0] path — ${UI}:2961-2966. 2) overlapPair. 3) Не цвет. 4) Динамика.`,
  '03': `1) pair[0] fill opacity .45 — ${UI}:2961-2966. 2) closed. 3) --v4-sand-wave. 4) Динамика.`,
  '04': `1) pair[1] path — ${UI}:2961-2966. 2) вторая волна. 3) --v4-sand-wave. 4) Динамика.`,
  '05': `1) clipPath overlap fill — ${UI}:2969-2975. 2) opacity .55. 3) --v4-wave-overlap. 4) Смоук: ${SMOKE}.`,
  '06': `1) brace line — ${UI}:2990-2996. 2) 2.4px. 3) --v4-wave-overlap. 4) Смоук: ${SMOKE}.`,
};

const RISUNOK_EMPTY = {
  '01': `1) InsulinWaveEmptySvg viewBox 0 34 130 18 — ${UI}:2780-2786. 2) height 18 (отступление: компакт под 2×2). 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  '02': `1) flatline x1=4 x2=126 y=46 — ${UI}:2788-2793. 2) strokeWidth 1.2 round. 3) ink 14 % (${CSS}:11553-11555). 4) Смоук: ${OVERNIGHT}.`,
};

const RISUNOK_OVERNIGHT = {
  '01': RISUNOK_EMPTY['01'],
  '02': `1) overnight figures fill — ${UI}:2816-2820. 2) scheme paths. 3) opacity .18 (${CSS}:11561-11563). 4) Смоук: ${OVERNIGHT}.`,
  '03': `1) overnight figure 2 — ${UI}:2816-2820. 2) та же геометрия. 3) opacity .18. 4) Смоук: ${OVERNIGHT}.`,
  '04': `1) overnight figure 3 — ${UI}:2816-2820. 2) та же геометрия. 3) opacity .18. 4) Смоук: ${OVERNIGHT}.`,
  '05': `1) overnight-stroke openD — ${UI}:2821-2828. 2) 1.2px ink 22 %. 3) без overlap/brace (${CSS}:11573-11578). 4) Смоук: ${OVERNIGHT}.`,
};

const RISUNOK_JOINT = {
  '01': RISUNOK_DAY['01'],
  '02': RISUNOK_DAY['02'],
  '03': RISUNOK_DAY['03'],
  '04': RISUNOK_DAY['03'],
  '05': RISUNOK_DAY['04'],
  '06': RISUNOK_DAY['05'],
  '07': RISUNOK_DAY['06'],
  '08': RISUNOK_DAY['06'],
  '09': `1) joint circle r 2.2 — ${UI}:2872-2876. 2) стык без подписи. 3) ink 35/40 % (${CSS}:11532-11538). 4) Смоук: ${SCHEME}.`,
  '10': RISUNOK_DAY['07'],
  '11': RISUNOK_DAY['08'],
};

function rowsFromMap(prefix, map, verdict = '=') {
  return Object.entries(map).map(([n, fact]) => [`${prefix} · ${n}`, verdict, fact]);
}

function rowsRisunok(prefix, map) {
  return Object.entries(map).map(([n, fact]) => [`${prefix} · рисунок ${n}`, '=', fact]);
}

const ROWS = [
  ...rowsFromMap('Инсулиновая волна · День как есть', DAY_AS_IS),
  ...rowsFromMap('Инсулиновая волна · Текущая волна', CURRENT),
  ...rowsFromMap('Инсулиновая волна · Пересечения', OVERLAPS),
  ...rowsFromMap('Инсулиновая волна · Полоса дня', DAY_BAR),
  ...rowsFromMap('Инсулиновая волна · Спокойное окно', CALM),
  ...rowsFromMap('Волна · пустой день', EMPTY),
  ...rowsFromMap('Волна · ночная оценка', OVERNIGHT_FRAME),
  ...rowsFromMap('Волна · стык и нахлёст', JOINT),
  ...rowsRisunok('Инсулиновая волна · День как есть', RISUNOK_DAY),
  ...rowsRisunok('Инсулиновая волна · Текущая волна', RISUNOK_CURRENT).map((row) => (
    row[0].endsWith('рисунок 04')
      ? [row[0], '—', row[2], { 'na-kind': 'demo-only' }]
      : row
  )),
  ...rowsRisunok('Инсулиновая волна · Пересечения', RISUNOK_OVERLAP),
  ...rowsRisunok('Волна · пустой день', RISUNOK_EMPTY),
  ...rowsRisunok('Волна · ночная оценка', RISUNOK_OVERNIGHT),
  ...rowsRisunok('Волна · стык и нахлёст', RISUNOK_JOINT),
  [
    'Инсулиновая волна · День как есть · текст',
    '=',
    `1) v4TileSpokenLabel / footer слова — ${UI}:1776-1800. 2) «Инсулиновая волна», счётчик, стыки, underWave. 3) Не цвет. 4) Смоук: widgets-canvas-copy.test.js.`,
  ],
  [
    'Инсулиновая волна · Текущая волна · текст',
    '=',
    `1) v4TileSpokenLabel на hero — ${UI}:1776-1800. 2) «Идёт волна», meta, минуты. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Инсулиновая волна · Пересечения · текст',
    '=',
    `1) v4TileSpokenLabel + overlap-note — ${UI}:1776-1800,3142-3144. 2) «Пересечение волн», часы, подпись. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Инсулиновая волна · Полоса дня · текст',
    '=',
    `1) kicker + daybar labels — ${UI}:3014-3018. 2) «Инсулин · под волной», elevated, время. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Инсулиновая волна · Спокойное окно · текст',
    '=',
    `1) v4TileSpokenLabel на mini — ${UI}:1776-1800. 2) «Покой», calmWindowLabel, unit. 3) Не цвет. 4) Смоук: ${SMOKE}.`,
  ],
  [
    'Волна · пустой день · текст',
    '=',
    `1) data-v4-spoken — ${UI}:3042-3047. 2) «Инсулиновая волна, приёмов не было, покой … от подъёма». 3) Не цвет. 4) Смоук: ${OVERNIGHT}.`,
  ],
  [
    'Волна · стык и нахлёст · текст',
    '=',
    `1) footer meal + overlap/joint labels — ${UI}:3182-3185. 2) «5 приёмов», «2 волны наложились», «1 стык». 3) Не цвет. 4) Смоук: ${SCHEME}.`,
  ],
];

let applied = 0;
for (const row of ROWS) {
  const [key, verdict, fact, extraOptions = {}] = row;
  const result = setVerdictKey('home-widgets', key, { verdict, fact, options: extraOptions }, {
    skipIf: (entry) => entry.v !== '?',
  });
  if (result.skipped) {
    console.log(`${key}  skip (${result.was.v})`);
    continue;
  }
  applied += 1;
  console.log(`${key}  ? → ${verdict}`);
}
console.log(`applied ${applied}`);
