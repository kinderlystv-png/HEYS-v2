import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const KIND = { 'na-kind': 'demo-only' };

const ITEMS = [
  [
    'Динамика · как сейчас · 01',
    '1) Канвас сам: «1 как сейчас, уходит», home-widgets.v4.dc.html:6589; стоп-кадр :6539. 2) Продукт дефолт curve, heys_widgets_variants_v4.js:176, CrashRiskDynamicsVariantTile. 3) Чипы 7/14/30 в renderWeightDynamicsBody нет, :7327. 4) Текст этой плитки уже — demo-only. Не чинил кадр. Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 02',
    '1) Кадр просит space-between + center. 2) Живая шапка curve — .widget-wd__head, :7470; выравнивание baseline, не center. 3) Не сводил под уходящий кадр. 4) Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 03',
    '1) Кадр ключ «Динамика веса». 2) Дефолт рисует windowLabel / «Вес за месяц», :7335 / :7471. 3) «Сброшено за месяц» — weightDynamicsDeltaKicker :7322, только number_only. «Вес по неделям» :7362. 4) Слово «Динамика веса» в теле вида нет. Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 04',
    '1) Кадр «−1,8» 600 12px. 2) Продукт — .widget-wd__delta, :7341; кегль живого 2×1 не 12. 3) Не подгонял. 4) Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 05',
    '1) Кадр — ряд чипов 7/14/30, gap 10, 700 9.5px. 2) Переключатель снят, variants :174; в :7327 чипов нет. 3) Окно растёт само. 4) Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 06',
    '1) Кадр «7» rgba(ink,.56). 2) Чипа «7» в плитке нет. 3) Не цвет продукта. 4) Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
  [
    'Динамика · как сейчас · 07',
    '1) Кадр «14» --ac и 2px --acs. 2) Активного чипа в плитке нет. 3) Лист пятикарточный, number_only sheet:false :183; порог не поднимал. 4) Смоук: widgets-weight-dynamics-now-departed-v4.test.js.',
  ],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '—', fact, options: KIND });
  applied += 1;
  console.log(`${key}  ${result.was.v} → —`);
}
console.log(`applied ${applied}`);
