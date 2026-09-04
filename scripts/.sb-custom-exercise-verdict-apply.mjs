#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { applyVerdictToRow } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/ui-v4-set-verdict.mjs')).href
);
const { readZone, writeZone } = await import(
  pathToFileURL(path.join(ROOT, 'scripts/lib/ui-v4-verdicts.mjs')).href
);

const zone = readZone('strength-builder');
const rows = zone.rows;

function set(key, verdict, fact, options = {}) {
  applyVerdictToRow(rows[key], { verdict, fact, options }, ROOT);
}

const equals = [
  ['Своё упражнение · 01', '.sb-root.sb-screen:has(.sb-ex-name) .sb-head — gap 10px, padding 16px 18px 0, без border; 750-strength-builder.css после :has(.sb-ex-name).'],
  ['Своё упражнение · 02', '.sb-root.sb-screen:has(.sb-ex-name) .sb-head-title — flex column gap 3px; 750-strength-builder.css; strength-builder-custom-exercise-v4-canvas-contract.test.js.'],
  ['Своё упражнение · 03', 'Copy «Новое упражнение» — heys_strength_catalog_ui_v1.js:267 b; contract test.'],
  ['Своё упражнение · 04', 'Copy «Три поля, третье — только иногда» — catalog_ui:268 .sb-head-sub; contract test.'],
  ['Своё упражнение · 05', '.sb-list overflow-y auto padding 10px 12px — 750-strength-builder.css:155-163; NewExerciseScreen :271.'],
  ['Своё упражнение · 06', '.sb-ap-field.sb-ex-name — min-height 44px, radius 14px, padding 0 14px, margin-top 12px, font 700 13px/1, bg var(--v4-c1); 750-strength-builder.css .sb-ex-name; sand+blue через --v4-c1/--sb-tx.'],
  ['Своё упражнение · 07', '.sb-step «1 · Что меряем» — catalog_ui:281-283; CSS .sb-step :1717-1730 uppercase 11px --sb-mut.'],
  ['Своё упражнение · 21', '.sb-panel-column .sb-finish margin-top 12px «Создать упражнение» — 750 :has(.sb-ex-name) rule; catalog_ui:346-351.'],
  ['Своё упражнение · 22', '.sb-panel-column .sb-btn margin-top 9px «Создать · без тоннажа» — 750 :has(.sb-ex-name); catalog_ui:353-358 (copy «без объёма» ≈ контракт).'],
];

const questions = [
  ['Своё упражнение · 08', 'Контракт «список .cd», продукт — вертикальные .sb-radio (catalog_ui:285-298); геометрия кадра ≠ списка радио — правка catalog_ui, CSS 750 только .sb-radio/.sb-step.'],
  ['Своё упражнение · 09', 'Кадр .cd row padding 9px 0; .sb-radio min-height 56px padding 9px 12px — 750:1747-1758; сверить с дизайнером: pill-row vs radio-row.'],
  ['Своё упражнение · 10', 'Кадр gap 6px wrap badges; продукт column .sb-radio — layout в catalog_ui, не 750.'],
  ['Своё упражнение · 11', 'Выбранная единица .sb-radio.is-on bg --sb-accbg/--v4-act (750:1761-1764); кадр pill --acs — роли sand=blue через bridge, форма ≠ badge.'],
  ['Своё упражнение · 12', 'Неактивная .sb-radio color --sb-mut ≈ ink 62%; кадр badge rgba ink .62 — роль на sand+blue ок, контейнер ≠ pill.'],
  ['Своё упражнение · 13', 'Строка списка — см. ·08–·10; нет .cd в runtime.'],
  ['Своё упражнение · 14', '«Основная» — .sb-chip.is-primary color --sb-accTx (750:1641-1645); кадр table row «Основная» var(--tx) — chip vs row.'],
  ['Своё упражнение · 15', 'Primary chip label color --sb-accTx/--v4-act-text (750:1644); кадр «спина» 700 11.5 var(--ac) — семантика совпадает, носитель chip.'],
  ['Своё упражнение · 16', 'См. ·13 — divider none в кадре .cd, продукт chips wrap.'],
  ['Своё упражнение · 17', 'Secondary .sb-chip.is-on --sb-mut 11.5px (750:1628); кадр «бицепс, плечи» 600 ink 56% — близко по роли, layout chips.'],
  ['Своё упражнение · 18', 'Кадр .grp card; продукт .sb-step-hint без .grp (750:1740-1745) — карточка третьего шага только при bodyweight.'],
  ['Своё упражнение · 19', 'При weight_reps шаг 3 не рендерится (needsFactor=false); кадр показывает prose «третий вопрос не задаётся» — copy нет в DOM, catalog_ui.'],
  ['Своё упражнение · 20', 'Сноска bodyweight — .sb-step-hint catalog_ui:326-328; кадр .sm margin-top 8px — нет отдельного .sm, catalog_ui.'],
  ['Своё упражнение · 23', 'Нижняя сноска «Без ответа…» в кадре .sm; в продукте нет footnote под кнопками — catalog_ui scope.'],
  ['Своё упражнение · текст', 'Полный текст кадра: copy экрана в catalog_ui совпадает по шагам 1–2 и CTA; табличные строки «Основная/Помогают» и footnote — см. ·08–·23.'],
];

let applied = 0;
for (const [key, fact] of equals) {
  if (rows[key].v !== '=' || rows[key].f !== fact) {
    set(key, '=', fact);
    applied += 1;
  }
}
for (const [key, fact] of questions) {
  if (rows[key].v !== '?' || rows[key].f !== fact) {
    set(key, '?', fact);
    applied += 1;
  }
}

writeZone('strength-builder', zone);
console.log(`custom-exercise block: applied ${applied} verdict updates`);
