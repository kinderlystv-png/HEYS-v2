// Кадры листа кураторских правок и стыка загрузчика против раздела канваса
// «Разбор кадров · элемент за элементом» (пакет 30 августа).
//
// Обе зоны небольшие, и разбор у них наполовину сокращённый: «вторичная
// кнопка», «главная кнопка», «строка списка» — это ссылки на шаблон, а не
// числа. В пары идёт то, у чего числа есть.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, coverage, readRazbor, readRules } from './canvas-razbor-helpers.js';

const PACK = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const DAILY_CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const BOOT_CSS = path.resolve(__dirname, '../styles/heys-boot-mark.css');

const M = '.ca-modal__';

// Кадр «Куратор · повторяющиеся правки»: строка повтора с бейджем «×N».
// Поля строки сюда не идут — по ним у зоны стоит отступление с причиной
// (см. кейс ниже); фон бейджа к кадру приведён и сверяется.
const REPEAT = [
  [9, [`${M}item`, `${M}item--repeat`], ['align']],
  [10, `${M}repeat-badge`, ['height', 'radius', 'background', 'align', 'justify',
    'fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color', 'marginTop']],
  [11, `${M}repeat-kcal`, ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

// Сколько строк разбора берут пары этого гейта. Заморожено: падение значит,
// что строка выпала из сверки, а вердикт на неё продолжает ссылаться.
const COVERAGE_FLOOR = 3;

describe('«Кураторские правки» и «Стык» · разбор кадров канваса', () => {
  const curator = readRazbor(fs.readFileSync(path.join(PACK, 'curator-edits.v4.dc.html'), 'utf8'));
  const splash = readRazbor(fs.readFileSync(path.join(PACK, 'app-splash.v4.dc.html'), 'utf8'));
  const daily = readRules(fs.readFileSync(DAILY_CSS, 'utf8'));
  const boot = readRules(fs.readFileSync(BOOT_CSS, 'utf8'));

  it('кадр «Куратор · повторяющиеся правки» совпадает со строкой повтора', () => {
    expect(compare({
      razbor: curator, rules: daily, frame: 'Куратор · повторяющиеся правки', pairs: REPEAT,
    })).toEqual([]);
  });

  // Строка правки одна на все виды правок: у неё поля 10/13 и выравнивание по
  // верху только в варианте повтора. Кадр рисует строке повтора свои поля
  // 11/13/12 — вердикт «· 09» отказывается заводить два языка строки ради
  // одного кадра.
  //
  // Бейдж «×N», наоборот, приведён к кадру 31 августа (da55525c7): он лежит
  // внутри строки на первой поверхности, и с тем же фоном давал контраст 1,0
  // во всех четырёх наборах — пилюли не было видно вовсе, «×5» читалось
  // болтающимся текстом. Проверка держит обе стороны этого решения.
  it('строка правки одна на все виды, бейдж — на второй поверхности', () => {
    expect(daily.get(`${M}item`).padding).toBe('10px 13px');
    expect(daily.get(`${M}item--repeat`).padding).toBeUndefined();
    expect(daily.get(`${M}item`).background).toBe('var(--v4-card, #f7efe2)');
    expect(daily.get(`${M}repeat-badge`).background).toBe('var(--v4-chip-2, #efe3cf)');
  });

  // Строка «и ещё N продуктов» — единственная цветная ссылка в теле листа.
  it('строка «и ещё N» отбита от списка на 8', () => {
    expect(daily.get(`${M}more-products`)['margin-top']).toBe('8px');
  });

  // Строка «геометрия» зоны: один диаметр круга у загрузчика и у знака ожидания.
  it('круг загрузчика того же диаметра, что знак ожидания', () => {
    expect(boot.localVars.get('--heys-splash-disc-size')).toBe('56px');
    expect(boot.get('.heys-wait-mark__disc').height).toBe('56px');
  });

  // Кадр «Стык · Главная» — третий источник по форме капсулы даты: кружок 34,
  // капсула 36 радиусом 999. Совпадает со строкой «вид капсулы» зоны
  // date-remainders и с кадром «Дата · чужой день»; расходится только кадр
  // «Дата · сегодня» (вопрос дизайнеру в UI_V4_FINDINGS.md).
  it('стык рисует ту же капсулу даты, что контракт «Даты»', () => {
    expect(splash.get('Стык · Главная|8')).toMatch(/ширина 34px, высота 34px/);
    expect(splash.get('Стык · Главная|9')).toMatch(/высота 36px, радиус 999px/);
  });

  it('гейт называет свой охват', () => {
    const { total, covered, missed, perFrame, untouched } = coverage({ razbor: curator });
    const worst = perFrame
      .filter((item) => item.missed.length)
      .sort((a, b) => b.missed.length - a.missed.length)
      .slice(0, 3)
      .map((item) => `${item.frame} — ${item.missed.length}`);
    console.info(
      `[заставка правок] сверено ${covered} из ${total} строк разбора `
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
