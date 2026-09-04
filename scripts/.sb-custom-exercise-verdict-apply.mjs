#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { setVerdictKey } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const equals = [
  ['Своё упражнение · 18', '.sb-block обёртка шага 3 — catalog_ui:328-331 (weight_reps) и :336-353 (bodyweight); 750 .sb-block :1879-1884; карточка .grp ≈ .sb-block.'],
  ['Своё упражнение · 19', 'При !needsFactor copy «Для «вес × повторы» третий вопрос не задаётся.» в .sb-block .sb-step-hint — catalog_ui:328-330; роли через CATALOG_V4_BRIDGE.'],
  ['Своё упражнение · 20', 'Bodyweight сноска в .sb-block .sb-step-hint — catalog_ui:337-338; текст канваса «на что похоже — отжимания…»; margin через padding .sb-block.'],
  ['Своё упражнение · 23', 'Нижняя сноска .sb-catalog-note под кнопками — catalog_ui:370-371; copy совпадает с кадром .sm.'],
];

const notEquals = [
  ['Своё упражнение · 08', 'Кадр .cd badge-row; продукт — вертикальные .sb-radio (catalog_ui:288-301). Роли v4 через bridge; носитель ≠ pill — осознанное отклонение radio-list.', 'canvas-conflict'],
  ['Своё упражнение · 09', 'Кадр .cd row padding 9px 0; .sb-radio min-height 56px padding 9px 12px (750:1782-1794). Форма radio-row ≠ badge-row.', 'canvas-conflict'],
  ['Своё упражнение · 10', 'Кадр gap 6px wrap badges; продукт column .sb-radio без wrap — layout catalog_ui, не 750.', 'canvas-conflict'],
  ['Своё упражнение · 11', 'Выбранная .sb-radio.is-on --sb-accbg/--v4-act (750:1796-1799); кадр pill --acs/--on-acs — роли ок, форма ≠ badge.', 'canvas-conflict'],
  ['Своё упражнение · 12', 'Неактивная .sb-radio --sb-mut ≈ ink 62%; кадр badge rgba ink .62 — роль ok, контейнер ≠ pill.', 'canvas-conflict'],
  ['Своё упражнение · 13', 'Строка .cd в кадре; в runtime .sb-radio — см. ·08.', 'canvas-conflict'],
  ['Своё упражнение · 14', 'Кадр table row «Основная» var(--tx); продукт .sb-chip.is-primary --sb-accTx (750:1676-1680) — chip vs row.', 'canvas-conflict'],
  ['Своё упражнение · 15', 'Primary chip --sb-accTx/--v4-act-text; кадр «спина» 700 11.5 var(--ac) — семантика совпадает, носитель chip.', 'canvas-conflict'],
  ['Своё упражнение · 16', 'Кадр .cd divider none; продукт .sb-chips wrap без divider — layout chips.', 'canvas-conflict'],
  ['Своё упражнение · 17', 'Secondary .sb-chip.is-on --sb-mut; кадр «бицепс, плечи» 600 ink 56% — близко по роли, layout chips.', 'canvas-conflict'],
];

const DREF = 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/strength-builder.v4.dc.html:506';

let applied = 0;
for (const [key, fact] of equals) {
  const result = setVerdictKey('strength-builder', key, { verdict: '=', fact, options: {} }, {
    root: ROOT,
    skipIf: (row) => row.v === '=' && row.f === fact,
  });
  if (!result.skipped) applied += 1;
}
for (const [key, fact, reasonCode] of notEquals) {
  const result = setVerdictKey('strength-builder', key, {
    verdict: '≠',
    fact,
    options: { 'reason-code': reasonCode, 'decision-ref': DREF },
  }, {
    root: ROOT,
    skipIf: (row) => row.v === '≠' && row.f === fact,
  });
  if (!result.skipped) applied += 1;
}

console.log(`custom-exercise 08-23: applied ${applied} verdict updates`);
