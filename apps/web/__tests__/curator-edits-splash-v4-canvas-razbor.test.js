// Кадры листа кураторских правок и стыка загрузчика против раздела канваса
// «Разбор кадров · элемент за элементом» (пакет 30 августа).
//
// Обе зоны небольшие, и разбор у них наполовину сокращённый: «вторичная
// кнопка», «главная кнопка», «строка списка» — это ссылки на шаблон, а не
// числа. В пары идёт то, у чего числа есть.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const PACK = path.resolve(
  __dirname,
  '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4',
);
const DAILY_CSS = path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css');
const BOOT_CSS = path.resolve(__dirname, '../styles/heys-boot-mark.css');

const M = '.ca-modal__';

// Кадр «Куратор · повторяющиеся правки»: строка повтора с бейджем «×N».
// Поля строки и фон бейджа сюда не идут — по ним у зоны стоят вердикты `≠` с
// причинами (см. кейс ниже).
const REPEAT = [
  [9, [`${M}item`, `${M}item--repeat`], ['align']],
  [10, `${M}repeat-badge`, ['height', 'radius', 'align', 'justify',
    'fontWeight', 'fontSize', 'lineHeight', 'tracking', 'color', 'marginTop']],
  [11, `${M}repeat-kcal`, ['marginTop', 'fontWeight', 'fontSize', 'lineHeight', 'color']],
];

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

  // Два отступления зоны от кадра, оба с записанными причинами в вердиктах
  // «Куратор · повторяющиеся правки · 09» и «· 10»: строка правки одна на все
  // виды (второй вариант завёл бы два языка строки ради одного кадра), а бейдж
  // остаётся на первой поверхности — вторая внутри строки читалась бы как
  // вложенная карточка. Проверка держит именно это решение, чтобы следующий
  // заход не «починил» его обратно по кадру.
  it('строка правки одна на все виды, бейдж — на той же поверхности', () => {
    expect(daily.get(`${M}item`).padding).toBe('10px 13px');
    expect(daily.get(`${M}item--repeat`).padding).toBeUndefined();
    expect(daily.get(`${M}item`).background).toBe('var(--v4-card, #f7efe2)');
    expect(daily.get(`${M}repeat-badge`).background).toBe('var(--v4-card, #f7efe2)');
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
});
