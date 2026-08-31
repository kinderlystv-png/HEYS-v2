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

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

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
  // Кадр просит чернила 50 %, у набора три тона — 55 / 45 / 38. Берём
  // ближайший --v4-ink-3 (45 %); запасное значение приведено к самой роли,
  // чтобы код не обещал тон, которого не рисует.
  ['Совет · панель оценки · 20|color', 'у набора нет тона 50 %, ближайший 45 %'],
  ['Советы · не сохранено · 12|color', 'тот же тон 50 % против 45 % набора'],
  // Кадр рисует крестик плашки глифом 12 px, крестик детали — 14 px. Глиф
  // общий (renderAdviceV4Icon 'close'), второго размера не заводим.
  ['Совет · всплывающий · 27|glyph', 'общий глиф крестика 14 px вместо 12'],
  // Кадр даёт нижнее поле 20; в продукте оно не меньше кадрового, но уступает
  // безопасной зоне телефона — иначе на аппаратах с жестовой панелью кнопка
  // упирается в неё. Число кадра сохранено внутри max().
  ['Научное описание · 16|padding', 'нижнее поле уступает env(safe-area-inset-bottom)'],
  // Кадр настроек просит чернила 42 %, у набора три тона — 55 / 45 / 38.
  // Взят ближайший --v4-ink-3 (45 %) во всех трёх местах разом: разные тона у
  // вводной строки, подписи тумблера и сноски развели бы один вес на три.
  ['Настройки советов · 05|color', 'у набора нет тона 42 %, ближайший 45 %'],
  ['Настройки советов · 13|color', 'тот же тон 42 % против 45 % набора'],
  ['Настройки советов · 17|color', 'тот же тон 42 % против 45 % набора'],
  // Дорожка тумблера в кадре — чернила 14 %; у набора три роли линии
  // (8 / 12 / 18), четвёртую под один тон не заводим. Взята --v4-track.
  ['Настройки советов · 09|background', 'у набора нет тона 14 %, ближайший 12 %'],
]);
// Кадр «Советы · шторка» — каркас листа и карточка совета.
const SHEET = [
  [2, '.advice-list-overlay:has(.advice-list-container--v4)', ['background']],
  [4, '.advice-list-handle', ['width', 'height', 'radius', 'background', 'marginBottom']],
  [5, `${V4} .advice-list-header-top`, ['align']],
  [6, `${V4} .advice-list-title`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [8, `${V4} .advice-list-header-link--read-all`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
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
  [10, [`${V4} .advice-list-item-wrapper`, '.advice-v4-rate-panel'], ['marginTop', 'radius', 'background']],
  [12, '.advice-v4-rate-panel', ['width', 'align', 'justify']],
  [13, '.advice-v4-rate-panel__label', ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [17, '.advice-v4-rate-actions', ['gap', 'marginTop']],
  [18, ['.advice-v4-rate-btn', '.advice-v4-rate-btn--helped'],
    ['minHeight', 'radius', 'background', 'color', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight']],
  [19, ['.advice-v4-rate-btn', '.advice-v4-rate-btn--mute'],
    ['minHeight', 'radius', 'background', 'color', 'align', 'justify', 'fontWeight', 'fontSize', 'lineHeight']],
  [20, '.advice-v4-rate-note', ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
];

// Кадр «Советы · не сохранено» — плашка над списком.
const UNSAVED = [
  [9, '.advice-v4-panel--sync', ['align', 'gap', 'background', 'radius', 'padding']],
  [11, '.advice-v4-panel--sync .advice-v4-panel__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [12, '.advice-v4-panel--sync .advice-v4-panel__hint--sync',
    ['marginTop', 'fontWeight', 'fontSize', 'lineHeight']],
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
  [16, '.advice-v4-detail__primary', ['radius', 'background', 'padding', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Советы · пусто» — из всего кадра зоне принадлежит только плашка:
// шапка, скелет карточек и нижнее меню за ней — экраны других зон.
const EMPTY = [
  [19, '.advice-v4-empty-toast', ['background', 'radius', 'padding', 'align', 'gap']],
  [20, '.advice-v4-empty-toast__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Совет · всплывающий» — плашка над нижним меню Главной. Зоне
// принадлежат элементы 21–30; выше и ниже — экран Главной за плашкой.
const TOAST = [
  [21, '.advice-v4-toast-card', ['background', 'radius', 'padding']],
  [22, '.advice-v4-toast-card__row', ['align', 'gap']],
  [23, ['.advice-v4-toast-card__stripe', '.advice-v4-toast-card__stripe--ok'],
    ['width', 'radius', 'background']],
  [25, '.advice-v4-toast-card__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [26, '.advice-v4-toast-card__meta', ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [27, '.advice-v4-toast-card__close', ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [28, '.advice-v4-toast-card__actions', ['gap', 'marginTop']],
  [29, '.advice-v4-toast-card__secondary',
    ['radius', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [30, '.advice-v4-toast-card__primary',
    ['radius', 'padding', 'background', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
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
  [14, '.advice-v4-science__footnote', ['background', 'radius', 'padding', 'marginTop']],
  [15, '.advice-v4-science__footnote', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [17, '.advice-v4-science__primary',
    ['radius', 'background', 'padding', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Кадр «Настройки советов» — единственное место, где советы настраиваются.
// Сведён 31 августа.
const SETTINGS = [
  [2, '.advice-v4-settings__header', ['align', 'gap']],
  [3, '.advice-v4-settings__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, '.advice-v4-settings__intro', ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [6, '.advice-v4-settings__section-label',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [7, '.advice-v4-settings__group', ['background', 'radius', 'padding', 'marginTop']],
  [8, '.advice-v4-settings__row', ['align', 'gap', 'padding']],
  [9, '.advice-v4-settings__toggle', ['width', 'height', 'radius']],
  [10, '.advice-v4-settings__toggle-thumb', ['width', 'height', 'radius', 'background']],
  [12, '.advice-v4-settings__row-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [13, '.advice-v4-settings__row-hint',
    ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
  [15, '.advice-v4-settings__toggle.is-on', ['background']],
  [17, '.advice-v4-settings__footnote',
    ['fontWeight', 'fontSize', 'lineHeight', 'marginTop']],
];

// Кадр «Оговорка» — лист первого совета. Зоне принадлежат элементы 20–30;
// выше — экран дня за листом. Сведён 31 августа.
const DISCLAIMER = [
  [20, '.advice-v4-disclaimer-overlay', ['background']],
  [21, '.advice-v4-disclaimer-card', ['background', 'radius', 'padding']],
  [22, '.advice-v4-disclaimer-card__handle', ['width', 'height', 'radius']],
  [23, '.advice-v4-disclaimer-card__title',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color']],
  [24, '.advice-v4-disclaimer-card__lead',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [25, '.advice-v4-disclaimer-card__note', ['background', 'radius', 'padding', 'marginTop']],
  [26, '.advice-v4-disclaimer-card__text', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [27, '.advice-v4-disclaimer-card__check', ['align', 'gap', 'marginTop']],
  [28, '.advice-v4-disclaimer-card__check input', ['width', 'height']],
  [29, '.advice-v4-disclaimer-card__check', ['fontWeight', 'fontSize', 'lineHeight']],
  [30, '.advice-v4-disclaimer-card__primary',
    ['radius', 'background', 'padding', 'fontWeight', 'fontSize', 'lineHeight']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 83;

describe('«Советы» · разбор кадров канваса', () => {
  const razbor = readRazbor(fs.readFileSync(CANVAS, 'utf8'));
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('кадр «Советы · шторка» совпадает с листом советов', () => {
    expect(compare({ razbor, rules, frame: 'Советы · шторка', pairs: SHEET })).toEqual([]);
  });

  it('кадр «Оговорка» совпадает с листом первого совета', () => {
    expect(compare({ razbor, rules, frame: 'Оговорка', pairs: DISCLAIMER })).toEqual([]);
  });

  it('кадр «Настройки советов» совпадает с экраном настроек', () => {
    expect(compare({ razbor, rules, frame: 'Настройки советов', pairs: SETTINGS })).toEqual([]);
  });

  it('кадр «Научное описание» совпадает с экраном науки', () => {
    expect(compare({ razbor, rules, frame: 'Научное описание', pairs: SCIENCE })).toEqual([]);
  });

  it('кадр «Совет · панель оценки» совпадает с панелью и рядом кнопок', () => {
    expect(compare({ razbor, rules, frame: 'Совет · панель оценки', pairs: RATING })).toEqual([]);
  });

  it('кадр «Советы · не сохранено» совпадает с плашкой синхронизации', () => {
    expect(compare({ razbor, rules, frame: 'Советы · не сохранено', pairs: UNSAVED })).toEqual([]);
  });

  it('кадр «Совет · деталь» совпадает с экраном детали', () => {
    expect(compare({ razbor, rules, frame: 'Совет · деталь', pairs: DETAIL })).toEqual([]);
  });

  it('кадр «Советы · пусто» совпадает с плашкой «советов нет»', () => {
    expect(compare({ razbor, rules, frame: 'Советы · пусто', pairs: EMPTY })).toEqual([]);
  });

  it('кадр «Совет · всплывающий» совпадает с плашкой совета', () => {
    expect(compare({ razbor, rules, frame: 'Совет · всплывающий', pairs: TOAST })).toEqual([]);
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
    expect(EXCEPTIONS.size).toBe(8);
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
