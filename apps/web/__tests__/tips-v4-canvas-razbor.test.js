// Кадры «Советов» против раздела канваса «Разбор кадров · элемент за элементом»
// (пакет 30 августа). Раздел даёт каждому нарисованному элементу собственные
// числа; здесь по ним сверяется продуктовый CSS шторки советов, панели оценки и
// плашки «не сохранено».
//
// Метод: строки разбора читаются из самого канваса, поэтому расхождение
// всплывает при правке любой из сторон. Разборщик общий с кадрами Главной —
// `canvas-razbor-helpers.js`.
//
// Кадры зоны лежат в канвасе дважды, песочной и синей палитрой. Синие копии
// приезжают ключом с «(2)» и в разбор не идут: каноничная палитра снята
// 24 августа, а геометрия у копий одна.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules, siftInkDataDrift } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/tips.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/400-water-and-hydration.css');
const ADVICE = path.resolve(__dirname, '../day/_advice.js');

const V4 = '.advice-list-container--v4';

// Осознанные отступления: строка разбора не сверяется, и здесь сказано почему.
// Список закрытый и может только уменьшаться; всё остальное гейт называет вслух.
const EXCEPTIONS = new Map([
  // Кадр «Оговорка · 07» — чернила 14 %; у набора три ступени линии (8 / 12 /
  // 18), четвёртую под один тон не заводим. Взята --v4-track (12 %).
  ['Оговорка · 07|background', 'у набора нет тона 14 %, ближайший 12 % (--v4-track)'],
  // Кадр даёт нижнее поле 20; в продукте оно не меньше кадрового, но уступает
  // безопасной зоне телефона — иначе на аппаратах с жестовой панелью кнопка
  // упирается в неё. Число кадра сохранено внутри max().
  ['Научное описание · 16|padding', 'нижнее поле уступает env(safe-area-inset-bottom)'],
  // Дорожка тумблера в кадре — чернила 14 %; у набора три роли линии
  // (8 / 12 / 18), четвёртую под один тон не заводим. Взята --v4-track.
  ['Настройки советов · 09|background', 'у набора нет тона 14 %, ближайший 12 %'],
  // Кадр ·09 — дорожка 40×24; видимая цель 44×44, дорожка на ::before.
  ['Настройки советов · 09|width', 'visible touch 44px; дорожка 40px на ::before'],
  ['Настройки советов · 09|height', 'visible touch 44px; дорожка 24px на ::before'],
  ['Настройки советов · 15|background', 'заливка is-on на ::before, не на кнопке'],
]);

function siftTips(drift) {
  return siftInkDataDrift(drift).filter((line) => {
    if (line.includes('.advice-v4-settings__toggle { width }')) return false;
    if (line.includes('.advice-v4-settings__toggle { height }')) return false;
    if (line.includes('.advice-v4-settings__toggle.is-on { background }')) return false;
    if (line.includes('нет правила .advice-v4-settings__toggle.is-on')) return false;
    return true;
  });
}
// Кадр «Советы · шторка» — каркас листа и карточка совета.
const SHEET = [
  [2, '.advice-list-overlay:has(.advice-list-container--v4)', ['background']],
  [4, '.advice-list-handle', ['width', 'height', 'radius', 'background', 'marginBottom']],
  [5, `${V4} .advice-list-header-top`, ['align']],
  [6, `${V4} .advice-list-title`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // «Прочитать все» держит 44 своим min-height: пакет 6 сентября снял
  // прозрачный припуск ::after inset −16px, которым цель набиралась прежде.
  [8, ['.advice-list-header-link--read-all', `${V4} .advice-list-header-link--read-all`],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'minHeight', 'align']],
  [9, `${V4} .advice-group-header`, ['fontWeight', 'fontSize', 'tracking', 'color']],
  [10, [`${V4} .advice-list-item-wrapper`, `${V4} .advice-list-item-v4`],
    ['background', 'radius', 'padding', 'marginTop']],
  [11, `${V4} .advice-list-item-v4`, ['align', 'gap']],
  [12, `${V4} .advice-list-item-v4::before`, ['width', 'minHeight', 'radius', 'background']],
  [14, `${V4} .advice-list-text`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [15, [`${V4} .advice-list-card-actions`, `${V4} .advice-card-footnote-link`],
    ['align', 'gap', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [16, `${V4} .advice-list-item-v4.advice-list-item-success::before`, ['background']],
  [18, ['.advice-list-hints', `${V4} .advice-list-hints`],
    ['align', 'justify', 'gap', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
];

// Кадр «Совет · панель оценки» — свайп влево открыл оценку.
const RATING = [
  // Тот же элемент, что в шторке: кадр называет его числа и здесь, поэтому
  // строка сверяется, а не остаётся вне пар с вердиктом «сведено соседом».
  [8, ['.advice-list-header-link--read-all', `${V4} .advice-list-header-link--read-all`],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'minHeight', 'align']],
  [10, [`${V4} .advice-list-item-wrapper`, '.advice-v4-rate-panel'], ['marginTop', 'radius', 'background']],
  [12, '.advice-v4-rate-panel', ['width', 'align', 'justify']],
  [13, '.advice-v4-rate-panel__label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [17, '.advice-v4-rate-actions', ['gap', 'marginTop']],
  [18, ['.advice-v4-rate-btn', '.advice-v4-rate-btn--helped'],
    ['minHeight', 'radius', 'background', 'color', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight']],
  [19, ['.advice-v4-rate-btn', '.advice-v4-rate-btn--mute'],
    ['minHeight', 'radius', 'background', 'color', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight']],
  [20, '.advice-v4-rate-note', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Советы · не сохранено» — плашка над списком.
const UNSAVED = [
  [9, '.advice-v4-panel--sync', ['align', 'gap', 'background', 'radius', 'padding']],
  [11, '.advice-v4-panel--sync .advice-v4-panel__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, '.advice-v4-panel--sync .advice-v4-panel__hint--sync',
    ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Совет · оценка после свайпа» перенесён в tips 1 сентября. Фон дня,
// шапка и нижнее меню принадлежат своим зонам; здесь сверяется сама панель.
const RATING_AFTER_SWIPE = [
  ['Пропустить', -7, '.advice-v4-panel', ['background', 'radius', 'padding']],
  ['Пропустить', -6, '.advice-v4-panel__head', ['align', 'gap']],
  ['Пропустить', -5, '.advice-v4-panel__title', ['flex', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Пропустить', -4, '.advice-v4-panel__hint', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Пропустить', -3, '.advice-v4-panel__actions', ['gap', 'marginTop']],
  ['Пропустить', -2, ['.advice-v4-panel__btn', '.advice-v4-panel__btn--useful'],
    ['flex', 'minHeight', 'radius', 'background', 'align', 'justify', 'gap', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Пропустить', -1, ['.advice-v4-panel__btn', '.advice-v4-panel__btn--miss'],
    ['flex', 'minHeight', 'radius', 'background', 'align', 'justify', 'gap', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Пропустить', 0, '.advice-v4-panel__skip',
    ['textAlign', 'marginTop', 'minHeight', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Совет · отмена с таймером»: окружающий экран принадлежит другим
// зонам; tips владеет панелью, кольцом обратного отсчёта и кнопкой возврата.
const HIDE_UNDO = [
  ['Вернуть', -7, ['.advice-v4-panel', '.advice-v4-panel--hide'], ['background', 'radius', 'padding']],
  ['Вернуть', -6, '.advice-v4-hide-row', ['align', 'gap']],
  ['Вернуть', -5, '.advice-v4-hide-ring', ['width', 'height', 'align', 'justify']],
  ['Вернуть', -4, '.advice-v4-hide-ring__num', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Вернуть', -3, '.advice-v4-hide-copy', ['flex']],
  ['Вернуть', -2, '.advice-v4-hide-copy__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Вернуть', -1, '.advice-v4-hide-copy__subtitle',
    ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  // «Вернуть» держит 44 своим min-height: пакет 6 сентября снял набранную из
  // полей 11/15 высоту 33,5, поля остались только боковыми.
  ['Вернуть', 0, '.advice-v4-hide-return',
    ['flex', 'minHeight', 'align', 'padding', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Совет · деталь» — экран, а не третий слой над шторкой.
const DETAIL = [
  [2, '.advice-v4-detail__header', ['align', 'justify', 'gap']],
  [3, '.advice-v4-detail__eyebrow', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [4, '.advice-v4-detail__title', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [5, '.advice-v4-detail__close', ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [7, '.advice-v4-detail__hero', ['background', 'radius', 'padding', 'marginTop']],
  [8, '.advice-v4-detail__hero-label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [9, '.advice-v4-detail__hero-text', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [10, '.advice-v4-detail__section-title',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color', 'marginTop', 'marginBottom']],
  [11, '.advice-v4-detail__text', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [12, '.advice-v4-detail__science-box', ['background', 'radius', 'padding', 'marginTop']],
  [13, '.advice-v4-detail__science-box', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [14, '.advice-v4-detail__tech-link', ['align', 'gap', 'marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  // «Понятно» — диалоговый ряд 48 своим min-height (было 43 из полей 15).
  [16, '.advice-v4-detail__primary',
    ['minHeight', 'align', 'justify', 'radius', 'background', 'padding',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Советы · пусто» — из всего кадра зоне принадлежит только плашка:
// шапка, скелет карточек и нижнее меню за ней — экраны других зон.
//
// Номера здесь и ниже взяты якорем, а не числом. Пакет 6 сентября снял из
// шапки полосу уровня и группу значков, и все номера в шести кадрах уехали
// на 15 вверх — гейт покраснел на «строки разбора нет», хотя ни продукт, ни
// кадр в этой части не менялись. Якорь держится за текст самого элемента.
const EMPTY = [
  ['Пока всё по плану', -1, '.advice-v4-empty-toast', ['background', 'radius', 'padding', 'align', 'gap']],
  ['Пока всё по плану', 0, '.advice-v4-empty-toast__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Совет · всплывающий» — плашка над нижним меню Главной. Зоне
// принадлежит сама плашка; выше и ниже — экран Главной за ней.
const TOAST = [
  ['Открыть', -8, '.advice-v4-toast-card', ['background', 'radius', 'padding']],
  ['Открыть', -7, '.advice-v4-toast-card__row', ['align', 'gap']],
  ['Открыть', -6, ['.advice-v4-toast-card__stripe', '.advice-v4-toast-card__stripe--ok'],
    ['width', 'radius', 'background']],
  ['Открыть', -4, '.advice-v4-toast-card__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Открыть', -3, '.advice-v4-toast-card__meta',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ['Открыть', -2, '.advice-v4-toast-card__close',
    ['width', 'height', 'radius', 'background', 'align', 'justify']],
  ['Открыть', -1, '.advice-v4-toast-card__actions', ['gap', 'marginTop']],
  // «Открыть» держит 44 своим min-height: пакет 6 сентября снял набранную из
  // полей высоту 33,5. Пары под второй кнопкой ряда больше нет — кадр рисует
  // одну кнопку, «Позже» в разборе не значится (см. запись в UI_V4_FINDINGS).
  ['Открыть', 0, '.advice-v4-toast-card__primary',
    ['flex', 'minHeight', 'align', 'justify', 'radius', 'background',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Научное описание» — экран под советом: что за этим стоит, список
// исследований, оговорка и кнопка. Сведён 31 августа.
const SCIENCE = [
  [2, '.advice-v4-science__header', ['align', 'gap', 'padding']],
  [3, '.advice-v4-science__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [4, '.advice-v4-science__body', ['padding']],
  [5, '.advice-v4-science__advice-title', ['fontWeight', 'lineHeight', 'color']],
  [6, '.advice-v4-science__section-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [7, '.advice-v4-science__text', ['fontWeight', 'lineHeight', 'color']],
  [9, '.advice-v4-science__sources', ['background', 'radius', 'padding', 'marginTop']],
  [10, '.advice-v4-science__source', ['padding']],
  [11, '.advice-v4-science__source-title', ['fontWeight', 'fontSize', 'color']],
  [12, '.advice-v4-science__source-meta', ['fontWeight', 'fontSize', 'color']],
  [14, '.advice-v4-science__footnote', ['align', 'gap', 'background', 'radius', 'padding', 'marginTop']],
  [15, '.advice-v4-science__footnote-text', ['fontWeight', 'fontSize', 'lineHeight']],
  // «Понятно» — тот же диалоговый ряд 48, что у детали.
  [17, '.advice-v4-science__primary',
    ['minHeight', 'align', 'justify', 'radius', 'background', 'padding',
      'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Настройки советов» — единственное место, где советы настраиваются.
// Сведён 31 августа.
const SETTINGS = [
  [2, '.advice-v4-settings__header', ['align', 'gap']],
  [3, '.advice-v4-settings__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.advice-v4-settings__intro', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [6, '.advice-v4-settings__section-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [7, '.advice-v4-settings__group', ['background', 'radius', 'padding', 'marginTop']],
  [8, '.advice-v4-settings__row', ['align', 'gap', 'padding']],
  [9, '.advice-v4-settings__toggle', ['width', 'height', 'radius']],
  [10, '.advice-v4-settings__toggle-thumb', ['width', 'height', 'radius', 'background']],
  [12, '.advice-v4-settings__row-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [13, '.advice-v4-settings__row-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [15, '.advice-v4-settings__toggle.is-on', ['background']],
  [17, '.advice-v4-settings__footnote',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

// Кадр «Оговорка» — лист первого совета. Зоне принадлежат элементы 20–30;
// выше — экран дня за листом. Сведён 31 августа.
const DISCLAIMER = [
  ['Показать совет', -10, '.advice-v4-disclaimer-overlay', ['background']],
  ['Показать совет', -9, '.advice-v4-disclaimer-card', ['background', 'radius', 'padding']],
  ['Показать совет', -8, '.advice-v4-disclaimer-card__handle', ['width', 'height', 'radius']],
  ['Показать совет', -7, '.advice-v4-disclaimer-card__title',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  ['Показать совет', -6, '.advice-v4-disclaimer-card__lead',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  ['Показать совет', -5, '.advice-v4-disclaimer-card__note',
    ['background', 'radius', 'padding', 'marginTop']],
  ['Показать совет', -4, '.advice-v4-disclaimer-card__text',
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  ['Показать совет', -3, '.advice-v4-disclaimer-card__check', ['align', 'gap', 'marginTop']],
  ['Показать совет', -2, '.advice-v4-disclaimer-card__check input', ['width', 'height']],
  ['Показать совет', -1, '.advice-v4-disclaimer-card__check',
    ['fontWeight', 'fontSize', 'lineHeight']],
  // «Показать совет» — диалоговый ряд 48 своим min-height (было 43 из полей 15).
  ['Показать совет', 0, '.advice-v4-disclaimer-card__primary',
    ['minHeight', 'align', 'justify', 'radius', 'background', 'padding',
      'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 99;

describe('«Советы» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const css = fs.readFileSync(CSS, 'utf8');
  const rules = readRules(css);

  it('кадр «Советы · шторка» совпадает с листом советов', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Советы · шторка', pairs: SHEET }))).toEqual([]);
  });

  it('кадр «Оговорка» совпадает с листом первого совета', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Оговорка', pairs: DISCLAIMER }))).toEqual([]);
  });

  it('кадр «Настройки советов» совпадает с экраном настроек', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Настройки советов', pairs: SETTINGS }))).toEqual([]);
  });

  it('кадр «Научное описание» совпадает с экраном науки', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Научное описание', pairs: SCIENCE }))).toEqual([]);
  });

  it('кадр «Совет · панель оценки» совпадает с панелью и рядом кнопок', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Совет · панель оценки', pairs: RATING }))).toEqual([]);
  });

  it('кадр «Советы · не сохранено» совпадает с плашкой синхронизации', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Советы · не сохранено', pairs: UNSAVED }))).toEqual([]);
  });

  it('кадр «Совет · оценка после свайпа» совпадает с панелью оценки тоста', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Совет · оценка после свайпа', pairs: RATING_AFTER_SWIPE }))).toEqual([]);
  });

  it('кадр «Совет · отмена с таймером» совпадает с панелью возврата', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Совет · отмена с таймером', pairs: HIDE_UNDO }))).toEqual([]);
  });

  it('тёмные панели сохраняют те же семантические роли, а не старые локальные тона', () => {
    const start = css.indexOf('[data-theme$="dark"] .advice-v4-panel {');
    const end = css.indexOf('/* === UI v4: шторка списка', start);
    const darkPanels = css.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(darkPanels).toContain('background: var(--v4-c1');
    // --v4-ink-data снята 7 сентября: продукт переведён на ступень лестницы
    // --v4-ink-2 (та же доля 56 % в песочном, своя в синем и тёмных).
    expect(darkPanels).toContain('color: var(--v4-ink-2');
    expect(darkPanels).toContain('background: var(--v4-ok-bg');
    expect(darkPanels).toContain('background: var(--v4-chip');
  });

  it('кадр «Совет · деталь» совпадает с экраном детали', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Совет · деталь', pairs: DETAIL }))).toEqual([]);
  });

  it('кадр «Советы · пусто» совпадает с плашкой «советов нет»', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Советы · пусто', pairs: EMPTY }))).toEqual([]);
  });

  it('кадр «Совет · всплывающий» совпадает с плашкой совета', () => {
    expect(siftTips(compare({ razbor, rules, frame: 'Совет · всплывающий', pairs: TOAST }))).toEqual([]);
  });

  // Кадр разносит заголовок группы отступами, продукт — полями: у заголовка нет
  // фона, и видно одно и то же. Числа при этом называет сам контракт зоны
  // (строка «вид заголовка группы»: «поля 18 сверху и 4 снизу»), поэтому они
  // проверяются здесь, а не парой разбора.
  it('заголовок группы разнесён числами контракта, а не кадра', () => {
    expect(rules.get(`${V4} .advice-group-header`).padding).toBe('18px 0 4px');
    expect(rules.get(`${V4} .advice-group-header`)['margin-top']).toBe('0');
  });

  // Кадр показывает старую подсказку «← прочитано»: прочтение жестом снято, и
  // строка контракта «жесты» прямо отдаёт текст этой строки коду. Контракт
  // старше кадра — в подсказке стоит жест, который действительно есть.
  it('подсказка называет жест, который есть, а не снятое прочтение', () => {
    const advice = fs.readFileSync(ADVICE, 'utf8');
    expect(advice).toContain("'← оценить'");
    expect(advice).not.toContain("'← прочитано'");
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(6);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[советы] сверено ${covered} из ${total} строк разбора `
      + `(${((covered / total) * 100).toFixed(1)} %), кадров ${perFrame.length}, `
      + `не тронуто целиком ${untouched}, вне пар ${missed}; `
      + `больше всего пропущено: ${worst.join(' · ') || 'нет'}`,
    );
    expect(covered).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    if (covered > COVERAGE_FLOOR) {
      throw new Error(
        `Охват вырос: сверяется ${covered} строк вместо ${COVERAGE_FLOOR}. `
        + 'Поднимите COVERAGE_FLOOR, иначе следующее падение пройдёт незаметно.',
      );
    }
  });
});
