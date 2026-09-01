// Лист поправки в кабинете куратора против раздела «Разбор кадров» канваса
// norm-correction.v4.dc.html.
//
// Метод выбран по канвасу: геометрия кадров живёт в собственных классах их
// `<style>` (.cd, .grp, .row, .tier, .big, .p, .sm), а продуктовая — в классах
// `cur-sheet__*`. Значит работает сверка парами «элемент разбора → правило
// продукта»; строки читаются из самого канваса, поэтому расхождение всплывает
// при правке любой из сторон.
//
// Сводится один кадр — «Куратор · поправка предложена». Остальные кураторские
// кадры отличаются составом, а не видом: те же классы, другие состояния, и
// повторять по ним ту же таблицу значило бы сверять одно правило трижды.
//
// Клиентские кадры сверяются второй таблицей: они живут в понедельничной
// шторке (`weekly-wrap-correction__*`) и своём файле стилей. Кадров сверки
// десять, но вид у них один — меняются число, тон и состав строк, — поэтому
// таблиц две: «снизилась» за общий вид карточки и «рекомпозиция» за график,
// которого у остальных нет.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const CANVAS = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/norm-correction.v4.dc.html',
);
const CSS = path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css');
// Карточка сверки живёт в общих компонентах, а не в модуле кабинета.
const CSS_CLIENT = path.resolve(__dirname, '../styles/heys-components.css');

const FRAME = 'Куратор · поправка предложена';
const FRAME_DOWN = 'Сверка · норма снизилась';
const FRAME_REC = 'Сверка · рекомпозиция';
const FRAME_SELF = 'Self · снижение ждёт согласия';

// Элементы кадра → правила листа. Номера — из самого разбора; якоря там, где
// номер уехал бы от вставки одного элемента.
const PAIRS = [
  // Плашка расхождения: .grp на подложке набора.
  [13, '.cur-sheet__mismatch', ['background']],
  [14, '.cur-sheet__mismatch-row', ['align', 'justify', 'gap']],
  [16, '.cur-sheet__mismatch-value', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [17, '.cur-sheet__mismatch-note', ['marginTop']],
  // «Где может сидеть расхождение»: заголовок, проза, сноска.
  [19, '.cur-sheet__where-title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Предложение нормы.
  [26, '.cur-sheet__rec-head', ['align', 'gap']],
  [28, '.cur-sheet__rec-delta', ['fontWeight', 'fontSize', 'lineHeight']],
  [29, '.cur-sheet__rec-caption', ['marginTop']],
  [30, '.cur-sheet__rec-split', ['height']],
  [31, '.cur-sheet__rec-row', ['justify', 'align', 'gap']],
  [32, '.cur-sheet__rec-num', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [34, ['.cur-sheet__rec-num', '.cur-sheet__rec-num.is-target'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Ряд решений: пилюли 48 радиусом 999, вторичные делят ширину пополам.
  [36, '.cur-sheet__row', ['gap']],
];

// Осознанные отступления — поимённо, иначе список молча растёт.
const EXCEPTIONS = [
  // 10 и 12: кадр пишет числу строки 14 px, а строка контракта «карточка ·
  // формула против факта» — 12,5 px/700. При расхождении верен контракт.
  '.cur-sheet__fact-value | кегль 12,5 против 14 в кадре',
  // 23: то же у качества данных — кадр 12,5/600, контракт «карточка · качество
  // данных» 12 px/700. Взят контракт.
  '.cur-sheet__fact-value | у качества данных кегль и насыщенность контракта',
  // 24: «хватает» отдельным словом тоном --gr. В продукте гейт стоит одной
  // строкой «18 · хватает» и красится тоном значения: два узла ради одного
  // факта разъезжались бы по ширине, а сравнивают их по колонке.
  '.cur-sheet__fact-value.is-ok | слово и число одной строкой',
  // 09: подпись под меткой отбита сверху четырьмя пикселями; в продукте это
  // зазор колонки `.cur-sheet__fact-copy` в 2 px — метка и подпись читаются
  // как один блок, а не как две строки.
  '.cur-sheet__fact-hint | отбивка зазором колонки, а не отступом',
  // 35–37: ряд решений прилипает к низу листа и отбит от прокрутки своим
  // правилом — отступ сверху у кнопок кадра к нему не сводится.
  '.cur-sheet__actions | липкий ряд вместо отступов кадра',
  // 30: делитель берёт роль линии (8 %), кадр рисует чернила 9 %. Собственное
  // значение вывело бы его из-под палитры, а разница не читается.
  '.cur-sheet__rec-split | 8 % роли линии против 9 % кадра',
];

// Клиентская карточка: общий вид по кадру «Сверка · норма снизилась».
const PAIRS_DOWN = [
  [8, '.weekly-wrap-correction__hero', ['align', 'gap']],
  [10, '.weekly-wrap-correction__hero-caption', ['fontWeight', 'fontSize', 'lineHeight']],
  [14, ['.weekly-wrap-correction__fact', '.weekly-wrap-correction__fact-value.is-quiet'],
    ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // 12 — сама строка списка, шрифт у неё от .row кадра; проверяем по значению.
  [16, '.weekly-wrap-correction__fact', ['fontWeight', 'fontSize', 'lineHeight']],
];

// Кадр Self: природа числа подписью, тон факта, ярус и предохранители.
const PAIRS_SELF = [
  [10, '.weekly-wrap-correction__fact-copy', ['direction', 'gap']],
  [12, '.weekly-wrap-correction__fact-hint', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  // Кегль и интерлиньяж значение берёт у самой строки — так же, как их видит
  // браузер: цепочка идёт от общего к частному.
  [14, ['.weekly-wrap-correction__fact', '.weekly-wrap-correction__fact-value',
    '.weekly-wrap-correction__fact-value.is-fact'],
  ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [21, ['.weekly-wrap-correction__fact', '.weekly-wrap-correction__fact-value',
    '.weekly-wrap-correction__fact-value.is-quiet'],
  ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// График перестройки: карточка, две линии, легенда плашками.
const PAIRS_REC = [
  [11, '.weekly-wrap-correction__legend', ['gap']],
  [12, ['.weekly-wrap-correction__legend-item', '.weekly-wrap-correction__legend-item.is-weight'],
    ['align', 'gap', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
  [13, '.weekly-wrap-correction__swatch', ['width', 'height', 'radius']],
];

const PAIRS_HISTORY = [
  [6, '.cur-sheet__hist-legend', ['justify', 'align', 'gap', 'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [8, '.cur-sheet__hist-dates', ['justify', 'fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [14, '.cur-sheet__hist-who', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 27;

describe('лист поправки против разбора кадров канваса', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(canvas);
  const rules = readRules(fs.readFileSync(CSS, 'utf8'));

  it('разбор кадра вообще прочитан', () => {
    const mine = [...razbor.keys()].filter((k) => k.startsWith(`${FRAME}|`));
    expect(mine.length).toBeGreaterThan(30);
  });

  it('каждая пара указывает на существующее правило', () => {
    const missing = PAIRS.flatMap(([, sel]) => (Array.isArray(sel) ? sel : [sel]))
      .filter((s) => typeof s === 'string' && s.startsWith('.') && !rules.has(s));
    expect(missing).toEqual([]);
  });

  it('числа листа совпадают с кадром', () => {
    expect(compare({ razbor, rules, frame: FRAME, pairs: PAIRS })).toEqual([]);
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.length).toBe(6);
  });

  it('история использует общую ступень информационных чернил', () => {
    expect(compare({
      razbor, rules, frame: 'Куратор · история поправки', pairs: PAIRS_HISTORY
    })).toEqual([]);
  });
});

describe('карточка сверки против разбора кадров канваса', () => {
  const canvas = fs.readFileSync(CANVAS, 'utf8');
  const razbor = readRazbor(canvas);
  const rules = readRules(fs.readFileSync(CSS_CLIENT, 'utf8'));

  it('общий вид карточки совпадает с кадром «норма снизилась»', () => {
    expect(compare({ razbor, rules, frame: FRAME_DOWN, pairs: PAIRS_DOWN })).toEqual([]);
  });

  it('график перестройки и его легенда совпадают с кадром', () => {
    expect(compare({ razbor, rules, frame: FRAME_REC, pairs: PAIRS_REC })).toEqual([]);
  });

  it('природа числа, тон факта и предохранители совпадают с кадром Self', () => {
    expect(compare({ razbor, rules, frame: FRAME_SELF, pairs: PAIRS_SELF })).toEqual([]);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: razbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[поправка нормы] сверено ${covered} из ${total} строк разбора `
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
