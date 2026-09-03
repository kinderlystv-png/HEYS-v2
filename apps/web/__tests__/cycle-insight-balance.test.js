/**
 * @fileoverview Инсайт баланса цикла · кадры `Цикл · инсайт баланса` и
 * `Цикл · норма дня` (cycle.v4.dc.html).
 *
 * Строки контракта:
 *  · «Норма выше на 5 %» — заголовок несёт число, чтобы цена поправки читалась
 *    цифрой (строка «средняя надбавка»: 2,14 % по циклу ≈ 38 ккал в день, а
 *    прежние проценты съедали пятую часть цели −1,8 кг);
 *  · «Инсайт показывается в дни с ненулевым множителем и не повторяется больше
 *    одного раза в день»;
 *  · «Пометка стоит только в дни 15–28. В сами особые дни калории на базе — там
 *    растёт вода, а не расход».
 *
 * Почему смоук, а не сверка исходника: до 03.09 карточка на днях 15–28 рисовала
 * пустое «Указать день», то есть и пометка «+N %», и инсайт были недостижимы
 * ровно там, где они про эти дни. Поймать это чтением кода нельзя — надо
 * собрать день счёта и посмотреть, что нарисовалось.
 */

import fs from 'node:fs';
import path from 'node:path';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const WEB = path.resolve(__dirname, '..');
const load = (file) => {
  const code = fs.readFileSync(path.join(WEB, file), 'utf8');
  // eslint-disable-next-line no-new-func
  new Function('window', 'document', 'navigator', 'globalThis', code)(
    window, document, window.navigator, window,
  );
};

let store = {};
const lsGet = (key, fallback = null) => (key in store ? store[key] : fallback);
const lsSet = (key, value) => { store[key] = value; };

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.React = React;
  window.HEYS = window.HEYS || {};
  load('heys_cycle_v1.js');
  load('heys_cycle_ui_v1.js');
});

beforeEach(() => {
  store = {};
  // День 1 отмечен 13 августа → 3 сентября это 22-й день счёта.
  store['heys_dayv2_2026-08-13'] = { date: '2026-08-13', cycleDay: 1 };
});

function render(day, dateKey) {
  const countDay = window.HEYS.Cycle.getCycleCountDay(dateKey, lsGet) || day.cycleDay;
  const host = document.createElement('div');
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(window.HEYS.CycleUI.renderCycleMarkingPanel({
      React,
      variant: 'nutrition',
      date: dateKey,
      day,
      setDay: () => {},
      lsGet,
      lsSet,
      eatenKcal: 1704,
      budgetKcal: 1869,
      cycleKcalMultiplier: window.HEYS.Cycle.getKcalMultiplier(countDay),
    }));
  });
  return host;
}

describe('день с надбавкой · кадр «Норма дня · день 22»', () => {
  it('карточка достижима на дне счёта без отметки 1–7', () => {
    const host = render({ date: '2026-09-03' }, '2026-09-03');
    // До 03.09 здесь было «Указать день» и больше ничего.
    expect(host.textContent).not.toContain('Указать день');
    expect(host.textContent).toContain('День 22');
    expect(host.textContent).toContain('Вторая половина');
  });

  it('строка «Нужно съесть» несёт пометку +5 %', () => {
    const host = render({ date: '2026-09-03' }, '2026-09-03');
    const pill = host.querySelector('.cycle-card-v4__norm-pill');
    expect(pill, 'пометки надбавки нет').toBeTruthy();
    expect(pill.textContent).toBe('+5 %');
    expect(host.textContent).toContain('Съедено');
    expect(host.textContent).toContain('Нужно съесть');
  });

  it('заголовок инсайта несёт число, а не слово «Особый период»', () => {
    const host = render({ date: '2026-09-03' }, '2026-09-03');
    const title = host.querySelector('.cycle-card-v4__insight-title');
    expect(title, 'инсайта нет').toBeTruthy();
    expect(title.textContent).toBe('Норма выше на 5 %');
    const text = host.querySelector('.cycle-card-v4__insight-text');
    expect(text.textContent).toContain('Вторая половина');
    expect(text.textContent).toContain('норма, а не срыв');
  });

  it('день 17 даёт +3 % — число берётся из фазы, а не прошито', () => {
    const host = render({ date: '2026-08-29' }, '2026-08-29');
    expect(host.querySelector('.cycle-card-v4__insight-title').textContent)
      .toBe('Норма выше на 3 %');
  });
});

describe('дни без надбавки · инсайта нет', () => {
  it('день 3: карточка есть, инсайта нет — калории на базе', () => {
    const host = render({ date: '2026-08-15', cycleDay: 3 }, '2026-08-15');
    expect(host.textContent).toContain('День 3');
    expect(host.querySelector('.cycle-card-v4__insight')).toBeNull();
    // Пометка надбавки там тоже не появляется: растёт вода, а не расход.
    expect(host.querySelector('.cycle-card-v4__norm-pill')).toBeNull();
  });

  it('день 9: надбавки нет, карточка возвращается к «Указать день»', () => {
    const host = render({ date: '2026-08-21' }, '2026-08-21');
    expect(host.textContent).toContain('Указать день');
    expect(host.querySelector('.cycle-card-v4__insight')).toBeNull();
  });
});

describe('не повторяется больше одного раза в день', () => {
  it('второй заход того же дня инсайт не показывает', () => {
    const first = render({ date: '2026-09-03' }, '2026-09-03');
    expect(first.querySelector('.cycle-card-v4__insight')).toBeTruthy();

    const second = render({ date: '2026-09-03' }, '2026-09-03');
    expect(second.querySelector('.cycle-card-v4__insight')).toBeNull();
    // Всё остальное на месте: скрывается инсайт, а не карточка.
    expect(second.textContent).toContain('День 22');
    expect(second.querySelector('.cycle-card-v4__norm-pill').textContent).toBe('+5 %');
  });

  it('следующий день показывает снова', () => {
    render({ date: '2026-09-03' }, '2026-09-03');
    const next = render({ date: '2026-09-04' }, '2026-09-04');
    expect(next.querySelector('.cycle-card-v4__insight-title').textContent)
      .toBe('Норма выше на 5 %');
  });
});
