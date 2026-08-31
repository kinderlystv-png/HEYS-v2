// Пустые состояния Отчётов: рамка вместо кривой веса и призыв о замерах.
//
// Оба проверяются чтением исходника, а не отрисовкой: карточка веса живёт
// внутри renderStatsBlock, который тянет за собой весь дневник — vm, профиль,
// спарклайны, localStorage. Тест на разметку в этом месте доказывал бы работу
// стенда, а не правила; здесь проверяются сами правила, взятые из контракта.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const STATS = fs.readFileSync(path.join(WEB, 'heys_day_stats_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.join(WEB, 'styles/modules/733-ui-v4-reports.css'), 'utf8');

const rule = (selector) => {
  const at = CSS.indexOf(selector + ' {');
  expect(at, selector + ' — правила нет').toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

describe('рамка на месте кривой веса', () => {
  it('кривая живёт от трёх настоящих замеров, прогноз не в счёт', () => {
    expect(STATS).toContain("weightSparklineData.filter(function (d) { return !d.isFuture; }).length");
    expect(STATS).toContain('measured >= 3');
    // То же правило, что у строки «Тренд веса» в списке «Уже считается» —
    // два разных порога рядом читались бы как ошибка одного из них.
    expect(STATS).toContain("(periodMeta.measuredWeightDays || 0) >= 3");
  });

  it('карточка не исчезает без замеров — рамка занимает место кривой', () => {
    expect(STATS).toContain('(useReportsV4 || weightSparklineData.length >= 1)');
    expect(STATS).toContain("'кривая появится с трёх замеров'");
  });

  it('вид рамки — из контракта: 52, радиус 14, тона ролями', () => {
    const r = rule('.reports-v4-noplot');
    expect(r).toContain('height: 52px');
    expect(r).toContain('border-radius: 14px');
    expect(r).toContain('font: 500 11px/1.4');
    // Тона — именами ролей. Первый заход брал процент от чернил прямо в
    // правиле: числа сходились с контрактом, но такой цвет не
    // переопределяется набором и в тёмных палитрах остаётся тем же. Гейт
    // line-roles-v4 поймал это на следующем прогоне.
    expect(r).toContain('var(--v4-track');   // заливка — дорожка будущей кривой
    expect(r).toContain('inset 0 0 0 1px var(--v4-line'); // обводка — ровно 8 %
    expect(r).toContain('var(--v4-ink-3');   // подпись; 42 % своей ступени не имеет
    expect(r).not.toMatch(/color-mix/);
  });

  it('вход «Записать вес» — 44 на --c2 тоном --ac, не на акценте', () => {
    const r = rule('.reports-v4-noplot__cta');
    expect(r).toContain('min-height: 44px');
    expect(r).toContain('var(--v4-hero');
    expect(r).toContain('var(--v4-act-text');
    expect(r).not.toContain('var(--v4-act,');
  });

  it('ведёт в тот же шаг взвешивания, что утренний чек-ин', () => {
    expect(STATS).toContain("steps: ['weight']");
    // Прежний путь виджетов — HEYS.Day.openWeightEditor — не существует в
    // продукте: вызов уходит в тихий catch. Повторять его нельзя.
    expect(STATS).not.toContain('openWeightEditor');
  });
});

describe('призыв о замерах', () => {
  it('факт одной строкой, без заголовка-раздела', () => {
    expect(STATS).toContain("'Последний замер '");
    expect(STATS).toContain("'Замеров ещё не было'");
    expect(STATS).not.toContain("'Замеры тела'");
    expect(CSS).not.toContain('.reports-v4-measure__title');
    expect(CSS).not.toContain('.reports-v4-measure__note');
  });

  it('строка факта 12/1,55 чернил 60 %, кнопка во всю ширину', () => {
    const fact = rule('.reports-v4-measure__fact');
    expect(fact).toContain('font: 500 12px/1.55');
    expect(fact).toContain('var(--v4-ink, #0f172a) 60%');
    const cta = rule('.reports-v4-measure__cta');
    expect(cta).toContain('width: 100%');
    expect(cta).toContain('min-height: 44px');
    // Напоминание, а не главное действие вкладки.
    expect(cta).toContain('var(--v4-hero');
    expect(cta).not.toContain('var(--v4-act,');
  });

  it('карточка складывается в колонку, а не в строку', () => {
    const card = rule('.reports-v4-measure');
    expect(card).toContain('flex-direction: column');
    expect(card).not.toContain('justify-content: space-between');
  });
});
