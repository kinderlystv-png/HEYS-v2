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
    // Два скаляра, а не объект: профиль сливается перекрытием с родительской
    // меткой времени, и вложенный объект может склеиться половинами.
    expect(SRC).toContain('prof.normCorrectionFactor');
    expect(SRC).toContain('prof.normCorrectionAppliedAt');
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

  it('цвета взяты из палитры продукта, а не из ролей канваса', () => {
    // Канвасные --tx, --ac, --acs, --c2 в продукте не объявлены. var(--tx) без
    // запасного значения делает свойство недействительным, и цвет молча
    // наследуется — строка выглядела бы почти правильно и была бы не той.
    // Гейт голых var() смотрит только имена --v4-*, поэтому это не ловилось.
    for (const canvasRole of ['var(--tx)', 'var(--ac)', 'var(--acs)', 'var(--c2)']) {
      expect(SRC, canvasRole).not.toContain(canvasRole);
    }
    expect(SRC).toContain('var(--v4-act, #c67139)');
  });

  it('значение поправки печатается запятой, как остальные числа зоны', () => {
    expect(SRC).toContain("nc.factor.toFixed(2).replace('.', ',')");
  });
});

describe('разбор цели · откуда взялась поправка', () => {
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');

  it('путь «съедено → вес → запас → факт» стоит перед самой поправкой', () => {
    // Человек видел поправку числом и не знал, из чего она взялась.
    for (const label of ['Съедено в среднем', 'Вес за три недели',
      'Запас отдал', 'Расход по факту']) {
      expect(SRC, label).toContain("'" + label + "'");
    }
    expect(SRC.indexOf("'Расход по факту'"))
      .toBeLessThan(SRC.indexOf("'Поправка на факт',"));
  });

  it('тап по норме не применяет поправку и не просит замер', () => {
    // gather применяет рост на self и ставит метку просьбы о замере. Собирать
    // сверку из попапа обычным способом значило бы делать это по факту
    // любопытства.
    const block = SRC.slice(SRC.indexOf('correctionPath:'), SRC.indexOf('correctionHistoryDays:'));
    expect(block).toContain('readOnly: true');
    expect(block).not.toContain('lsSet');

    const ENGINE = fs.readFileSync(
      path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8');
    expect(ENGINE).toContain('const canWrite = !readOnly && typeof lsSet ===');
    expect(ENGINE).toContain('if (canWrite && recomposition && recomposition.indirect)');
  });

  it('числа берутся из движка, а не считаются в разборе', () => {
    const block = SRC.slice(SRC.indexOf('correctionPath:'), SRC.indexOf('correctionHistoryDays:'));
    expect(block).toContain('res.path.eatenPerDay');
    expect(block).toContain('res.factPerDay');
    expect(block).not.toContain('7700');
  });
});

describe('разбор цели · источник поправки', () => {
  const SRC = fs.readFileSync(
    path.resolve(__dirname, '../heys_day_stats_v1.js'), 'utf8');
  const ENGINE = fs.readFileSync(
    path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8');

  it('ссылка живёт у константы в движке, а не в разметке экрана', () => {
    // Пятнадцать экранов с копиями ссылок расходятся при первой правке;
    // ссылка у механики переживает переезд экрана.
    expect(ENGINE).toContain('const EVIDENCE = {');
    expect(ENGINE).toContain("adaptation: '20107198'");
    expect(SRC).toContain('HEYS.NormCorrection?.EVIDENCE?.adaptation');
    // Своего номера у экрана нет.
    const block = SRC.slice(SRC.indexOf("'Поправка на факт',"), SRC.indexOf("'Расход после поправки'"));
    expect(block).not.toMatch(/pubmed[^']*\/\d/);
  });

  it('показывается тем же способом, что источник в разборе долга', () => {
    // Правило одно на продукт: иконка со ссылкой, а не своя форма на каждом
    // экране.
    expect(SRC).toContain("'📚'");
    expect(SRC).toContain("rel: 'noopener'");
  });
});
