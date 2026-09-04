import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.

const ITEMS = [
  ['Риск-радар · Уровень и причины · 01', '1) Корень — .widget-relapse-risk.widget-relapse-risk--2x2.widget-v4-stack, heys_widgets_ui_v1.js:8429. 2) Вид list 2×2, heys_widgets_variants_v4.js:114. 3) Не цвет. 4) «22» — .num клетки кадра. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 02', '1) Ключ — .widget-v4-kicker, v4Kicker(\'Риск-радар\') :8430. 2) Текст словом. 3) Не цвет. 4) main/scale тоже «Риск-радар». Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 03', '1) Hero — .widget-v4-hero-num, :8431. 2) baseline/gap 5/margin-top 10 — 730:11054–11058. 3) Не цвет. 4) scale hero 24 px — другой кадр. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 04', '1) Слово — .widget-v4-hero-num__val--risk, :8433 relapseCanvasLevel. 2) 600 26px/1 — .widget-v4-hero-num__val 730:11078; Figtree — 730:10473. 3) --v4-sand-ok-text (= --gr): песок #5c6a45 002:148; синий тот же. 4) v4RiskLevelState :2287. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 05', '1) Список — .widget-v4-kv, :8436. 2) column/gap 6/margin-top auto — 730:11926–11930. 3) Не цвет. 4) main driver block — другой вид. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 06', '1) Строка — .widget-v4-kv__row, :8439. 2) space-between / 600 10px/1 — 730:11933–11938. 3) --v4-ink-data (≈ ink 56 %): песок rgba(0,0,0,.56); синий rgba(16,24,38,.56). 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 07', '1) Значение «нет» — .widget-v4-val--good, :8443 warn false. 2) Тон good. 3) --v4-sand-ok-text: песок #5c6a45 002:148; синий тот же — 730:14334. 4) Срывы без фактора. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · 08', '1) Значение «2 дня» — .widget-v4-val--act, :8443 warn true. 2) Активный фактор недосыпа. 3) --v4-act-text (= --ac): песок #8a4a20 002:233; синий #2e7cc0 002:461. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 01', '1) Корень — .widget-relapse-risk.widget-relapse-risk--2x1.widget-v4-stack, :8364. 2) Вид main 2×1, heys_widgets_variants_v4.js:115. 3) Не цвет. 4) list/scale — другие корни. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 02', '1) Шапка — .widget-v4-row.widget-v4-row--tight, :8365. 2) space-between/baseline — 730:10708 + 14186. 3) Не цвет. 4) list hero — другой блок. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 03', '1) Ключ — v4Kicker(\'Риск-радар\') :8366. 2) Текст словом. 3) Не цвет. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 04', '1) Уровень — .widget-risk-level, :8368 canvasLevel.word. 2) 700 10px/1 — 730:14262–14265. 3) --v4-sand-ok-text при good — 730:14333. 4) Не hero 26 px. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 05', '1) Блок — .widget-risk-main, :8371. 2) baseline/gap 5/margin-top auto — 730:14268–14272. 3) Не цвет. 4) kv list — другой вид. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · 06', '1) Риск — .widget-risk-main__driver, :8372. 2) 600 16px/1 / -.02em — 730:14278–14284. 3) --v4-act-text на driver. 4) Мета — .widget-v4-unit. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 01', '1) Корень — .widget-relapse-risk.widget-relapse-risk--2x2.widget-v4-stack, :8391. 2) Вид scale 2×2 default, heys_widgets_variants_v4.js:118. 3) Не цвет. 4) list/main — другие корни. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 02', '1) Ключ — v4Kicker(\'Риск-радар\') :8392. 2) Текст словом. 3) Не цвет. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 03', '1) Hero — .widget-v4-hero-num.widget-risk-scale-hero, :8393. 2) baseline/gap 5/margin-top 10 — 730:11054–11058; scale hero — 730:10921. 3) Не цвет. 4) list hero 26 px — другой кадр. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 04', '1) Слово — .widget-v4-hero-num__val--risk, :8395. 2) 600 24px/1 — 730:10925–10927. 3) --v4-sand-ok-text (= --gr): песок #5c6a45; синий тот же. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 05', '1) Ряд — .widget-risk-steps, :8398. 2) gap 4 / margin-top 11 — 730:14300–14303. 3) Не цвет. 4) Четыре сегмента :8399. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 06', '1) Сегмент on — .widget-risk-steps__seg--on, :8403. 2) flex 1 / height 6 / radius 999 — 730:14306–14309. 3) --v4-ok-fill при good-on — 730:14317. 4) index canvasLevel.index. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 07', '1) Сегмент off — .widget-risk-steps__seg, :8401. 2) Те же размеры — 730:14306–14309. 3) --v4-line (≈ ink 9 %): песок rgba(0,0,0,.09) — 730:14310. 4) Не on. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · 08', '1) Строка — .widget-risk-rise, :8408. 2) margin-top auto / 600 10px/1.4 — 730:14321–14326. 3) --v4-ink-data (≈ ink 56 %). 4) «поднимут: …» из primaryDrivers. Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Уровень и причины · текст', '1) Слова: «Риск-радар» :8430; levelWord :8434; kv «Срывы»/«Недосып» :8419–8426. 2) «22» — номер клетки кадра. 3) Не цвет. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Главный риск · текст', '1) Слова: «Риск-радар» :8366; canvasLevel :8369; driverLabel :8372. 2) Номер клетки кадра — не копия. 3) Не цвет. 4) Смоук: widgets-risk-radar-v4.test.js.'],
  ['Риск-радар · Шкала · текст', '1) Слова: «Риск-радар» :8392; canvasLevel :8396; riseText :8408. 2) Номер клетки кадра — не копия. 3) Не цвет. 4) Смоук: widgets-risk-radar-v4.test.js.'],
];

let applied = 0;
for (const [key, fact] of ITEMS) {
  const result = setVerdictKey('home-widgets', key, { verdict: '=', fact, options: {} }, {
    skipIf: (row) => row.v !== '?',
  });
  if (result.skipped) {
    console.error(`${key} уже ${result.was.v}, не трогаю`);
    process.exit(1);
  }
  applied += 1;
  console.log(`${key}  ${result.was.v} → =`);
}
console.log(`applied ${applied}`);
