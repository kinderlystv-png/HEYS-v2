#!/usr/bin/env node
/** Task 67 · полоса 2 — Step B verdict updates (package-36 drift rows). */
// Per-key merge via setVerdictKey — assertForeignRowsUnchanged outside scope keys.
import { setVerdictKey } from './lib/ui-v4-verdicts.mjs';

/** @type {Array<[string, string, string, string|undefined, string, object|undefined]>} */
const PATCHES = [
  ['curator-cabinet', 'вход куратора с телефона', '—', 'handoff',
    'РЕШЕНИЕ ВЛАДЕЛЬЦА 5 сентября: широкую раскладку в релизе не делаем. Кадры 330 px — кабинет живёт в мобильной ширине; кураторов единицы. Кадра широкой раскладки нет, рисовать не нужно. Scope канваса, не дефект кода.', undefined],
  ['norm-correction', 'формулировка Self в каноне оффера', '=', undefined,
    'ЗАКРЫТО 5 сентября: редакция принята — «сверяется с фактом — вашими записями и весами». COPY_VOICE §Канон оффера и производные обновлены; контракт описывает факт без AI-обещаний.', undefined],
  ['settings-system', 'Настройки · список · текст', '=', undefined,
    'heys_app_shell_v1.js:5719-5751 — ярусы «Вы», «Приложение», «Сопровождение»: уведомления, профиль и цели, дневник 6/7, оформление, советы куратора, задачи 3 новые, доска, диагностика HEYS 4.0 · сборка 1786 — снимок copy для сверки.', undefined],
  ['strength-builder', 'вид · отчёт цикла', '=', undefined,
    '731-ui-v4-activity.css:1808-1810 .sb-plan-vs-done .sb-plan-vs-cell.is-assigned — background var(--bg), inset 1px rgba(var(--ink),.1); strength-builder-plan-vs-done-v4-canvas-contract.test.js.', undefined],
  ['strength-builder', 'чего нет в этом заходе', '—', 'handoff',
    'ЗАКРЫТО 5 сентября: секции НАЙДЕНЫ и разбор сведён в source/curator.dc.html — 16c; отдельной карточки «Ближайшая» нет по решению дневной ленты.', undefined],
  ['nutrition-tab', 'состав чипа', '≠', undefined,
    'Пакет 36: чип 44 px видимым, ::after none. Продукт 732-ui-v4-nutrition.css:1068 min-height 30px — ждёт strip touch (как food-meal 5f7097c20).',
    { 'reason-code': 'accessibility', 'decision-ref': 'apps/web/styles/modules/732-ui-v4-nutrition.css:1068', __opts: { allowDowngrade: true } }],
  ['nutrition-tab', 'Питание · вопрос о дате · 08', '=', undefined,
    'data-v «высота 16px» — подпись в кадре вопроса о дате; геометрия кадра, UX равного выбора — строка «равный выбор».', undefined],
  ['nutrition-tab', 'Питание · вопрос о дате · текст', '≠', undefined,
    'Контракт пакета 36: «На какой день записать?», два равных ряда, CTA «Записать на 19 августа». Продукт — ConfirmModal «Перейти на сегодня» / «Всё-таки записать».',
    { 'reason-code': 'logic-invariant', 'decision-ref': 'apps/web/heys_day_nutrition_v1.js:86' }],
  ['food-meal', 'высота листа времени', '—', 'demo-only',
    'Замер высоты кадра: лист влезает целиком, запас 287 px при окне 673 — строка контракта пакета 36, не продуктовое правило.', undefined],
  ['food-meal', 'вид · крестик закрытия листа', '=', undefined,
    '.mc-close-btn 44×44 (500-pwa:3302-3304) в шапке листа; иконка 17 px ink 45 % — контракт пакета 36; не --v4-act.', undefined],
];

const POST_REHASH_PATCHES = [
  ['settings-system', 'ярус «Приложение» · пять рядов', '=', undefined,
    'heys_app_shell_v1.js — ярус «Приложение»: оформление, домашняя вкладка, звук, время напоминаний, версия; пять рядов как в контракте пакета 36.', undefined],
  ['strength-builder', 'карточка плана Г3 — кадр устарел', '—', 'handoff',
    'Метка устаревшего кадра Г3 — scope пакета 36, не продуктовый дефект; PlanCard в activity.', undefined],
  ['strength-builder', 'источник для открытого весового упражнения', '=', undefined,
    'Канон Г4 is-exercise-open / weight-entry — heys_strength_builder_ui_v1.js + 750-strength-builder.css; маркер source для кадров открытого упражнения.', undefined],
  ['strength-builder', 'структура канона разнесена по всем кадрам', '—', 'handoff',
    'Строка scope разбора пакета 36 — канон разнесён по кадрам strength-builder.v4.dc.html; не поведение продукта.', undefined],
  ['nutrition-tab', 'равный выбор, а не склонение', '≠', undefined,
    'Решение владельца 5 сентября в контракте; продукт — ConfirmModal со склонением, лист равного выбора не собран.',
    { 'reason-code': 'owner-decision', 'decision-ref': 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/ACCEPTANCE-nutrition-tab.md:257' }],
  ['nutrition-tab', 'след записи в чужой день', '≠', undefined,
    'Контракт пакета 36: undo-bar «Записано в {дата}» 6 с; продукт не реализован в nutrition/day flow.',
    { 'reason-code': 'logic-invariant', 'decision-ref': 'docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/ACCEPTANCE-nutrition-tab.md:258' }],
];

function applyPatches(list, label) {
  let applied = 0;
  let missing = 0;
  for (const [zone, key, verdict, naKind, fact, extra] of list) {
    const patch = { verdict, fact };
    if (naKind) patch.options = { 'na-kind': naKind };
    if (extra) {
      const { __opts, ...typed } = extra;
      patch.options = { ...(patch.options || {}), ...typed };
    }
    try {
      const opts = extra?.__opts || {};
      const result = setVerdictKey(zone, key, patch, opts);
      if (result.skipped) {
        console.log(`skip ${zone} :: ${key} (${result.reason})`);
      } else {
        applied += 1;
        console.log(`${zone} :: ${key}  ${result.was.v} → ${verdict}`);
      }
    } catch (error) {
      if (String(error.message).includes('нет')) {
        missing += 1;
        console.log(`missing ${zone} :: ${key}`);
      } else {
        throw error;
      }
    }
  }
  console.log(`${label}: applied ${applied}, missing ${missing}, total ${list.length}`);
}

const postRehash = process.argv.includes('--post-rehash');
if (postRehash) {
  applyPatches(POST_REHASH_PATCHES, 'post-rehash');
} else {
  applyPatches(PATCHES, 'step B pass 1');
}
