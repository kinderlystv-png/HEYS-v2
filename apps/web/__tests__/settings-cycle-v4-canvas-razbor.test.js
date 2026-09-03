// Кадры листа настроек и карточки особого периода против раздела канваса
// «Разбор кадров · элемент за элементом» (пакет 30 августа). Две зоны в одном
// файле: у них общий продуктовый слой — лист настроек и карточка дня живут
// рядом, и разборщик у них один.
//
// Спорные числа решает именованная строка своей зоны, а не кадр; такие пары
// стоят в EXCEPTIONS с указанием строки.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const PACK = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const BASE_CSS = path.resolve(__dirname, '../styles/modules/000-base-and-gamification.css');
const DAILY_CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const SHELL = path.resolve(__dirname, '../heys_app_shell_v1.js');

const H = '.hdr-settings-sheet__';
const C = '.cycle-card-v4';

const EXCEPTIONS = new Map([
  // Контракт «области нажатия · чипы»: видимый зазор 6 — кадр рисует 7.
  ['Настройки · чипы быстрых действий · 19|gap', 'контракт «области нажатия · чипы»: видимый зазор 6'],
  // Строка «вид · карточка дня»: «действие „Указать день" 700 12px var(--ac)».
  // Кадр набирает 11,5; «Сбросить неделю» держит тот же кегль, что соседнее
  // действие, — двух размеров у пары текстовых кнопок не заводим.
  ['Цикл · карточка дня, заполнено · 7|fontSize', 'строка «вид · карточка дня»: действие 12 px'],
  ['Цикл · карточка дня, заполнено · 8|fontSize', 'тот же кегль, что у соседнего действия'],
  // Кадр просит у «Сбросить неделю» вес 700 и чернила 40 %; вес делит правило с
  // «Отменить», а тона 40 % у набора нет — ближайший 45 %.
  ['Цикл · карточка дня, заполнено · 8|fontWeight', 'правило общее с «Отменить»'],
  ['Цикл · карточка дня, заполнено · 8|color', 'у набора нет тона 40 %, ближайший 45 %'],
  // Межстрочный однострочных подписей листа настроек в коде 1,2, кадр даёт 1;
  // на одной строке разницы нет, а высоту строки держит min-height 44.
  ['Настройки · список · 15|lineHeight', 'высоту строки держит min-height 44'],
  ['Настройки · список · 18|lineHeight', 'то же у значения справа'],
]);

const SETTINGS_LIST = [
  [3, `${H}head`, ['padding', 'align', 'justify', 'gap']],
  [4, `${H}title`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [5, `${H}close`, ['width', 'height', 'radius', 'background', 'align', 'justify']],
  [9, `.tab-settings-menu.tab-settings-menu--v4-sheet ${H}push-toggle .tab-settings-diary-toggle__hint`,
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
  [13, `${H}group`, ['background', 'radius']],
  [14, `${H}row`, ['padding', 'align', 'justify', 'minHeight']],
  [15, [`${H}row`, `${H}label`], ['fontWeight', 'fontSize', 'color']],
  [17, `${H}meta`, ['align', 'gap']],
  [18, `${H}meta`, ['fontWeight', 'fontSize', 'color']],
  [19, `${H}dots`, ['gap']],
  [20, `${H}dot`, ['width', 'height', 'radius']],
  [26, `${H}build`, ['fontWeight', 'fontSize', 'lineHeight', 'color', 'padding']],
];

const SETTINGS_CHIPS = [
  [16, `${H}fab-card`, ['radius', 'padding']],
  [17, `${H}fab-lead`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [21, `${H}fab-meta`, ['align', 'justify', 'gap', 'marginTop']],
  [22, `${H}fab-count`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [23, `${H}fab-ok`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [24, `${H}fab-notice`, ['align', 'gap', 'background', 'radius', 'padding', 'marginTop']],
  [26, `${H}fab-notice-text`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
];

const SETTINGS_DIAGNOSTICS = [
  [14, `${H}diag-copy`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [17, [`${H}build`, `${H}diag-panel + ${H}build`],
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'padding', 'marginTop']],
];

const SETTINGS_NOTIFY_DETAIL = [
  [7, '.notify-detail__tier',
    ['fontWeight', 'fontSize', 'lineHeight', 'tracking', 'transform', 'color', 'marginTop', 'marginBottom']],
  [19, '.notify-detail__quiet-note',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

const SETTINGS_HOME_INSTALL = [
  [8, '.ios-home-install-modal__footnote',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'padding']],
];

const CYCLE_CARD = [
  [1, [C, `${C}--filled`], ['background', 'radius', 'padding']],
  [2, `${C}__head`, ['align', 'justify', 'gap']],
  [3, [`${C}__title`, `${C}__phase`], ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [4, `${C}__day`, ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [6, `${C}__actions`, ['gap', 'marginTop']],
  [7, `${C}__action`, ['fontWeight', 'lineHeight', 'color']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 24;

describe('«Настройки» и «Цикл» · разбор кадров канваса', () => {
  const settingsRazbor = readRazbor(fs.readFileSync(path.join(PACK, 'settings-system.v4.dc.html'), 'utf8'));
  const cycleRazbor = readRazbor(fs.readFileSync(path.join(PACK, 'cycle.v4.dc.html'), 'utf8'));
  const baseRules = readRules(fs.readFileSync(BASE_CSS, 'utf8'));
  const dailyRules = readRules(fs.readFileSync(DAILY_CSS, 'utf8'));

  it('кадр «Настройки · список» совпадает с листом настроек', () => {
    expect(compare({
      razbor: settingsRazbor, rules: baseRules, frame: 'Настройки · список', pairs: SETTINGS_LIST,
    })).toEqual([]);
  });

  it('кадр «Настройки · чипы быстрых действий» совпадает с карточкой чипов', () => {
    expect(compare({
      razbor: settingsRazbor, rules: baseRules, frame: 'Настройки · чипы быстрых действий', pairs: SETTINGS_CHIPS,
    })).toEqual([]);
  });

  it('кадр «Настройки · диагностика» совпадает с диагностической створкой', () => {
    expect(compare({
      razbor: settingsRazbor, rules: baseRules,
      frame: 'Настройки · диагностика', pairs: SETTINGS_DIAGNOSTICS,
    })).toEqual([]);
  });

  it('кадр «Настройки · настроить подробно» совпадает с листом уведомлений', () => {
    expect(compare({
      razbor: settingsRazbor, rules: baseRules,
      frame: 'Настройки · настроить подробно', pairs: SETTINGS_NOTIFY_DETAIL,
    })).toEqual([]);
  });

  it('кадр «Домашний экран · лист» совпадает со сноской iOS-инструкции', () => {
    expect(compare({
      razbor: settingsRazbor, rules: dailyRules,
      frame: 'Домашний экран · лист', pairs: SETTINGS_HOME_INSTALL,
    })).toEqual([]);
  });

  it('кадр «Цикл · карточка дня, заполнено» совпадает с карточкой периода', () => {
    expect(compare({
      razbor: cycleRazbor, rules: dailyRules, frame: 'Цикл · карточка дня, заполнено', pairs: CYCLE_CARD,
    })).toEqual([]);
  });

  // Строка «вид · карточка дня» (2 сентября): пустая и заполненная на одной
  // поверхности --c1, иначе бейдж «+10 % вода» сливается с --c2.
  it('заполненная карточка периода на той же поверхности, что и пустая', () => {
    expect(dailyRules.get(C).background).toMatch(/^var\(--v4-sand-surface\b/);
    expect(dailyRules.get(`${C}--filled`).background).toMatch(/^var\(--v4-sand-surface\b/);
  });

  // Кадр «Настройки · чипы быстрых действий», элемент 22.
  it('строка под чипами считает пункты, а не кнопки', () => {
    const shell = fs.readFileSync(SHELL, 'utf8');
    expect(shell).toContain("'Ни одного — тоже можно'");
    expect(shell).not.toContain("'Ни одной — тоже можно'");
  });

  it('осознанные отступления не разрослись', () => {
    expect(EXCEPTIONS.size).toBe(7);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: settingsRazbor });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[настройки и цикл] сверено ${covered} из ${total} строк разбора `
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
