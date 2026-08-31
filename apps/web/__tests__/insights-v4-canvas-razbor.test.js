// Покадровый разбор вкладки «Инсайты» — половина зоны reports-insights.
//
// Файл заведён отдельно от `reports-insights-v4-canvas-geometry.test.js`
// намеренно: над зоной работают две сессии, и общий файл гейта был вторым по
// частоте местом, где правка одной уезжала в коммит другой. Пары «Отчётов» и
// пары «Инсайтов» независимы — общий у них только помощник разбора.
//
// Что здесь НЕ живёт: реестр отступлений зоны и проверки общего канона (ярусы,
// карточки, кнопки). Они смотрят обе вкладки сразу и остаются в общем файле.
//
// Метод тот же, что в «Отчётах»: ключ раздела «Разбор кадров» — «<метка кадра>
// · NN», привязка идёт по data-screen-label, а не по классам канваса.
//
// Прежняя причина не трогать эту половину — «зона инлайновая» — относится к
// КАНВАСУ (3836 инлайновых стилей в .dc.html), а не к продукту: у продукта
// инсайтов 1654 обращения к классам против 79 инлайнов, и привязка работает.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { compare, readRazbor, readRules } from './canvas-razbor-helpers.js';

const canvas = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../../docs/ui/handoff-v4/canvas/Переработка дизайна приложения/design_handoff_heys_v4/reports-insights.v4.dc.html',
  ),
  'utf8',
).replace(/\r\n/g, '\n');

const insightsCss = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/734-ui-v4-insights.css'), 'utf8');

// Отступления инсайтовой половины — поимённо, как в «Отчётах». Строка, попавшая
// сюда, в пары не идёт: пара молча зелёная там, где решение принято осознанно,
// хуже отсутствия пары.
const RAZBOR_EXCEPTIONS = new Map([
  // Счётчик зрелости: строка «вид · шапка зрелости» просит «18 дней данных»
  // 10,5/600 тоном --ac, кадр и строка «счётчик в шапке» дают «18 дней данных
  // из 30» чернилами. Два источника из трёх сходятся на кадре.
  ['Инсайты · 15|*', 'счётчик зрелости: два источника из трёх дают чернила'],
]);

const HEAD_AND_HERO = [
  [13, '.insights-v4-meta__row', ['align', 'gap']],
  [14, '.insights-v4-meta__title', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [15, '.insights-v4-meta__days', ['fontWeight', 'fontSize', 'lineHeight', 'color']],
  [17, '.insights-v4-hero', ['background', 'radius', 'padding', 'marginTop']],
  [19, '.insights-v4-hero__phrase',
    ['fontWeight', 'fontSize', 'lineHeight', 'color', 'marginTop']],
];

describe('Инсайты · разбор кадров канваса', () => {
  const razbor = readRazbor(canvas);
  const rules = readRules(insightsCss);

  it('шапка и герой кадра «Инсайты» совпадают с продуктом', () => {
    expect(compare({
      razbor, rules, frame: 'Инсайты', pairs: HEAD_AND_HERO,
    })).toEqual([]);
  });

  it('отступления инсайтовой половины названы и не разрастаются молча', () => {
    expect(RAZBOR_EXCEPTIONS.size).toBe(1);
  });
});
