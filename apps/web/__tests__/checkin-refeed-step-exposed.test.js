// Вопрос «Загрузочный день» в шаге «Шаги на сегодня» спрашивается только если
// шаг может узнать, надо ли его показывать: он проверяет
// `typeof HEYS.MorningCheckinUtils?.shouldIncludeRefeedStep === 'function'` и
// при любом другом ответе рисует экран без карточки. Правило внутри модуля
// чек-ина было, наружу не выходило — и карточки с «Да / Нет» не видел никто,
// хотя строка контракта «откуда данные» (checkin-morning.v4) говорит, что
// загрузочный день отмечают каждое утро именно здесь.
//
// Тест держит саму связку: имя, которое читает шаг, и имя, которое отдаёт
// модуль. Проверяется парой — иначе переименование одной стороны снова
// разводит их молча, без единого падения.
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_DIR = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(WEB_DIR, rel), 'utf8');

describe('чек-ин · загрузочный день', () => {
  it('правило показа отдано наружу под тем именем, которое читает шаг', () => {
    const checkin = read('heys_morning_checkin_v1.js');
    const steps = read('heys_steps_v1.js');

    const usedName = steps.match(
      /HEYS\.MorningCheckinUtils\?\.(\w+) === 'function'[\s\S]{0,200}?HEYS\.MorningCheckinUtils\.(\w+)\(/,
    );
    expect(usedName, 'шаг «Шаги на сегодня» больше не спрашивает правило показа').not.toBeNull();
    expect(usedName[1]).toBe(usedName[2]);

    const exported = new RegExp(
      `HEYS\\.MorningCheckinUtils\\.${usedName[1]}\\s*=\\s*${usedName[1]}\\s*;`,
    );
    expect(
      exported.test(checkin),
      `модуль чек-ина не отдаёт наружу ${usedName[1]} — карточка «Загрузочный день» пропадёт с экрана`,
    ).toBe(true);
  });

  it('карточка «Загрузочный день» рисуется по этому правилу, а не по своему условию', () => {
    const steps = read('heys_steps_v1.js');
    const card = steps.match(/data\.showRefeed && [\s\S]{0,400}?'Загрузочный день'/);
    expect(card, 'карточка «Загрузочный день» больше не привязана к showRefeed').not.toBeNull();
  });
});
