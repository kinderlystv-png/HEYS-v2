// Строка поправки в разборе нормы (кадры «Цель · строка поправки» и
// «Цель · холодный старт»). Проверяется исходник: попап живёт внутри большого
// React-компонента вкладки, и поднимать его целиком ради двух строк дороже, чем
// закрепить сам порядок слоёв и оба состояния.
//
// Порядок здесь — смысл, а не вёрстка: поправка правит расход раз в неделю,
// дефицит остаётся договорённостью, долг правит итог дня. Если строка уедет
// после дефицита, читатель решит, что поправка правит обещание.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../heys_day_stats_v1.js'),
  'utf8'
);

describe('поправка на факт · строка в разборе нормы', () => {
  it('данные попапа несут применённую поправку и счёт холодного старта', () => {
    expect(SRC).toContain('normCorrection: (prof && prof.normCorrection) || null');
    expect(SRC).toContain('correctionHistoryDays');
  });

  it('поправка стоит между базой и дефицитом', () => {
    const base = SRC.indexOf("'База (без TEF)'");
    const correction = SRC.indexOf("'Поправка на факт'");
    const deficit = SRC.indexOf("'Дефицит '");
    expect(base).toBeGreaterThan(-1);
    expect(correction).toBeGreaterThan(base);
    expect(deficit).toBeGreaterThan(correction);
  });

  it('после поправки называется расход, а не сразу цель', () => {
    const correction = SRC.indexOf("'Поправка на факт'");
    const after = SRC.indexOf("'Расход после поправки'");
    const goal = SRC.indexOf("'Базовая цель'");
    expect(after).toBeGreaterThan(correction);
    expect(goal).toBeGreaterThan(after);
  });

  it('холодный старт — видимое состояние со счётом, а не пустая строка', () => {
    expect(SRC).toContain('копим данные');
    expect(SRC).toMatch(/done \+ ' дней из ' \+ coldDays/);
  });

  it('в первом слое нет слова «коэффициент»', () => {
    // Имя для клиента — «поправка на факт». «Коэффициент» остаётся внутренним.
    const popup = SRC.slice(SRC.indexOf('🎯 Как считается цель'), SRC.indexOf('🎯 Как считается цель') + 4000);
    expect(popup).not.toContain('коэффициент');
    expect(popup).not.toContain('Коэффициент');
  });

  it('значение поправки печатается запятой, как остальные числа зоны', () => {
    expect(SRC).toContain("nc.factor.toFixed(2).replace('.', ',')");
  });
});
