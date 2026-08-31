// Ряд из двух кнопок на входе в развилку: «Так и было · …» и «По ощущениям».
//
// Кадры дают ряду две раскладки, и зеркальные: «Чек-ин · вчерашний день»
// (17/18) — 1 и 1,25, «Чек-ин · пустой день из пачки» (18/19) — 1,35 и 1.
// Больше места получает та кнопка, чья подпись длиннее, а длинную подпись
// («Так и было · ничего не ел» вместо «Так и было · 640 ккал») включает тот же
// признак — isEmptyFoodDay.
//
// Дефект, ради которого написан тест: правила в CSS лежали оба, ветка пачки
// ими пользовалась, а ветка одиночного дня держала классы намертво — и на
// пустом дне длинная подпись ломалась на две строки в узкой кнопке. Владелец
// увидел это на 390 px.
//
// Почему проверка исходника, а не пар «класс кадра → правило CSS». Гейт пар
// такое поймать не может по устройству: он сверяет CSS с кадром, а расходились
// не правила, а ветка в JS — правила были верны и просто не навешивались.
// Сверка «класс → правило» показывала бы зелёное всё время, пока дефект жил.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_yesterday_verify_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/715-yesterday-verify.css'), 'utf8',
);

describe('развилка: ряд кнопок отдаёт место длинной подписи', () => {
  // Обе ветки — пачки и одиночного дня — берут признак пустого дня, и берут
  // его зеркально: пустому дню шире левая, непустому шире правая.
  it('обе ветки навешивают классы по признаку пустого дня', () => {
    const wide = SRC.match(/\?\s*' yv-pack-secondary--confirm-empty'\s*:\s*''/g) || [];
    const narrow = SRC.match(/\?\s*''\s*:\s*' yv-pack-secondary--feelings'/g) || [];
    // По одной паре на ветку: пачка и одиночный день.
    expect(wide).toHaveLength(2);
    expect(narrow).toHaveLength(2);
  });

  it('ни одна ветка не держит раскладку намертво', () => {
    // Прибитый класс без условия — это и был дефект. Проверяется именно ряд
    // «Так и было», а не любой ряд с этим классом: рядом стоит ещё один — с
    // «Очистить N пустых», — где подписи сопоставимой длины и зеркало не
    // нужно, так что прибитые классы там законны.
    expect(SRC).not.toMatch(/className: 'yv-pack-secondary yv-pack-secondary--feelings'/);
    for (const at of [SRC.indexOf('confirmAsWrittenLabel(day)'),
      SRC.indexOf('confirmAsWrittenLabel(single)')]) {
      expect(at).toBeGreaterThan(-1);
      expect(SRC.slice(at - 900, at + 500)).not.toMatch(/className: 'yv-pack-secondary',/);
    }
  });

  it('признак берётся у того же дня, что и подпись кнопки', () => {
    // Ловушка, из-за которой правка выглядела бы сделанной, ничего не меняя:
    // признак, снятый с другого объекта, тихо вернёт «не пустой». Подпись и
    // раскладка обязаны спрашивать один и тот же день.
    expect(SRC).toMatch(/confirmAsWrittenLabel\(single\)/);
    expect(SRC).toMatch(/isEmptyFoodDay\(single\)/);
    expect(SRC).toMatch(/confirmAsWrittenLabel\(day\)/);
    expect(SRC).toMatch(/const emptyDay = isEmptyFoodDay\(day\)/);
  });

  it('длинную подпись включает тот же признак, что и широкую кнопку', () => {
    const at = SRC.indexOf('function confirmAsWrittenLabel');
    const body = SRC.slice(at, at + 260);
    expect(body).toMatch(/isEmptyFoodDay\(dayInfo\)\) return 'Так и было · ничего не ел'/);
  });

  it('CSS держит зеркальные раскладки кадров', () => {
    const grab = (sel) => {
      const at = CSS.indexOf(sel + ' {');
      return CSS.slice(at, CSS.indexOf('}', at)).replace(/\s+/g, ' ');
    };
    expect(grab('.yv-pack-row .yv-pack-secondary--confirm-empty')).toMatch(/flex: 1\.35/);
    expect(grab('.yv-pack-row .yv-pack-secondary--feelings')).toMatch(/flex: 1\.25/);
    // База — единица: без модификатора кнопки делят ряд поровну.
    expect(CSS).toMatch(/\.yv-pack-secondary \{[^}]*flex: 1;/);
  });
});
