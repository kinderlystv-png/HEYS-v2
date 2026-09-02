// Лист поправки в кабинете куратора — рендером, а не чтением исходника.
//
// Соседний `curator-panel-view.test.js` читает текст модуля: он ловит, что в
// коде написано, но не то, что из этого получается на экране. Лист собирается
// из полутора десятков условных веток (мёртвая зона, шаг упёрся в предел, пол
// базового обмена, норма не двигается), и перестановка блоков 30 августа
// показала, чего чтению не хватает: строка могла уехать в другой блок, а тест
// остался бы зелёным.
//
// Здесь карточка приходит из самого движка — никаких вручную собранных полей:
// разойтись с ним нельзя, если числа берутся у него.
import fs from 'node:fs';
import path from 'node:path';

import { createRoot } from 'react-dom/client';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { beforeAll, describe, expect, it } from 'vitest';

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');

let HEYS;
beforeAll(() => {
  window.React = React;
  window.HEYS = {};
  // eslint-disable-next-line no-eval
  (0, eval)(read('heys_norm_correction_v1.js'));
  // eslint-disable-next-line no-eval
  (0, eval)(read('heys_curator_panel_v1.js'));
  HEYS = window.HEYS;
});

// Вход движка: окно записанных дней и тренд веса. Числа ровные, чтобы
// расхождение считалось в уме и тест не превратился в пересказ движка.
function days(count, kcal) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      date: new Date(Date.UTC(2026, 7, 10 + i)).toISOString().slice(0, 10),
      kcal,
      isLogged: true
    });
  }
  return out;
}

// 21 день по 2 000 ккал, вес ушёл на deltaKg → факт = 2000 - deltaKg*7700/21.
// При deltaKg = -0,6 факт ≈ 2 220, формула 2 400 → расхождение около -7,5 %.
function card(opts) {
  const o = opts || {};
  const expenditure = o.expenditure == null ? 2400 : o.expenditure;
  const result = HEYS.NormCorrection.compute({
    days: days(o.loggedDays == null ? 21 : o.loggedDays, o.kcal == null ? 2000 : o.kcal),
    trend: {
      windowDays: 21,
      measuredDays: o.weighIns == null ? 9 : o.weighIns,
      deltaKg: o.deltaKg == null ? -0.6 : o.deltaKg
    },
    formulaPerDay: expenditure,
    historyDays: o.historyDays == null ? 60 : o.historyDays,
    currentFactor: o.currentFactor == null ? 1 : o.currentFactor
  });
  return {
    result,
    card: HEYS.NormCorrection.buildCuratorCard({
      result,
      expenditure,
      deficitPct: o.deficitPct == null ? -15 : o.deficitPct,
      basalMetabolism: o.basalMetabolism == null ? 1500 : o.basalMetabolism,
      breakdown: { bmr: 1500, trainings: 300, steps: 400, household: 200 },
      history: o.history || []
    })
  };
}

function render(row, props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(React.createElement(HEYS.CuratorPanel.Sheet, {
      React,
      row,
      name: 'Марина К.',
      range: { from: new Date(Date.UTC(2026, 7, 10)), to: new Date(Date.UTC(2026, 7, 30)) },
      onClose: () => {},
      onDecide: () => {},
      onOpenClient: () => {},
      ...props
    }));
  });
  return host;
}

const text = (host, sel) => Array.from(host.querySelectorAll(sel)).map((n) => n.textContent);

describe('лист поправки · рендер', () => {
  it('лист вообще собирается и несёт имя, окно и действия', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result });
    expect(host.querySelector('.cur-sheet')).toBeTruthy();
    expect(host.querySelector('.cur-row__name').textContent).toBe('Марина К.');
    expect(host.querySelector('.cur-sheet__meta').textContent).toContain('окно 21');
    // «Открыть дневник» есть всегда — даже когда решать нечего.
    expect(text(host, '.cur-sheet__actions button')).toContain('Открыть дневник');
  });

  it('ошибка сохранения остаётся в открытом листе и объявляется alert', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result }, {
      decisionError: 'Решение не сохранено. Повторите.'
    });
    const alert = host.querySelector('.cur-sheet__save-error');
    expect(alert).toBeTruthy();
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toContain('не сохранено');
  });

  it('порядок блоков — контракта поправки, а не произвольный', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result });
    const order = Array.from(host.querySelectorAll(
      '.cur-sheet__facts, .cur-sheet__mismatch, .cur-sheet__where, .cur-sheet__rec'
    )).map((n) => n.className.split(' ')[0]);
    // Два числа → расхождение → где сидит → качество → предложение.
    expect(order[0]).toBe('cur-sheet__facts');
    expect(order.indexOf('cur-sheet__mismatch')).toBeGreaterThan(0);
    expect(order.indexOf('cur-sheet__where'))
      .toBeGreaterThan(order.indexOf('cur-sheet__mismatch'));
    expect(order.indexOf('cur-sheet__rec'))
      .toBeGreaterThan(order.indexOf('cur-sheet__where'));
  });

  it('расхождение стоит числом с процентом и называет диапазон', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result });
    const value = host.querySelector('.cur-sheet__mismatch-value').textContent;
    expect(value).toMatch(/^\d+(,\d)? %$/);
    expect(host.querySelector('.cur-sheet__mismatch-note').textContent)
      .toContain('0,90–1,15');
  });

  it('«где может сидеть расхождение» несёт заголовок, прозу и сноску о клиенте', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result });
    const where = host.querySelector('.cur-sheet__where');
    expect(where.querySelector('.cur-sheet__where-title').textContent)
      .toBe('Где может сидеть расхождение');
    expect(where.querySelector('.cur-sheet__where-body').textContent.length)
      .toBeGreaterThan(40);
    expect(where.querySelector('.cur-sheet__where-note').textContent)
      .toContain('не показывается');
  });

  it('качество данных красится состоянием гейта, а не одним тоном', () => {
    const enough = card();
    const host = render({ clientId: 'c1', card: enough.card, result: enough.result });
    const tones = Array.from(host.querySelectorAll('.cur-sheet__fact-value.is-ok'));
    expect(tones.length).toBeGreaterThan(0);

    // Мало дней — гейт не закрыт, и это видно тоном, а не только словом.
    const few = card({ loggedDays: 8 });
    const host2 = render({ clientId: 'c2', card: few.card, result: few.result });
    expect(host2.querySelectorAll('.cur-sheet__fact-value.is-warn').length)
      .toBeGreaterThan(0);
  });

  it('предложение — главным числом, рядом разница и действующая норма', () => {
    const { result, card: c } = card();
    const host = render({ clientId: 'c1', card: c, result });
    const rec = host.querySelector('.cur-sheet__rec');
    expect(rec.querySelector('.cur-sheet__rec-value').textContent)
      .toBe(HEYS.NormCorrection.formatKcal(c.recommendation.norm));
    expect(rec.querySelector('.cur-sheet__rec-caption').textContent)
      .toContain('с дефицитом');
    // Три строки расчёта под делителем.
    expect(rec.querySelector('.cur-sheet__rec-split')).toBeTruthy();
    expect(text(rec, '.cur-sheet__rec-row .cur-sheet__fact-label'))
      .toContain('Поправка этой недели');
  });

  it('в мёртвой зоне решать нечего: ряд решений пуст, а причина названа', () => {
    // Вес стоит — факт равен съеденному, а формула ровно столько же:
    // расхождение нулевое, то есть внутри двухпроцентной зоны.
    const { result, card: c } = card({ expenditure: 2000, kcal: 2000, deltaKg: 0 });
    expect(result.deadZone).toBe(true);
    const host = render({ clientId: 'c1', card: c, result });
    expect(text(host, '.cur-sheet__actions button')).toEqual(['Открыть дневник']);
    expect(host.querySelector('.cur-sheet__rec').textContent)
      .toContain('считаем совпадением');
  });

  it('когда норма не двигается, лист не обещает изменения', () => {
    const { result, card: c } = card({ expenditure: 2000, kcal: 2000, deltaKg: 0 });
    const host = render({ clientId: 'c1', card: c, result });
    const caption = host.querySelector('.cur-sheet__rec-caption').textContent;
    expect(caption).toContain('норма дня остаётся');
    expect(host.textContent).not.toContain('станет');
  });

  it('лист не падает на карточке без предложения', () => {
    // Данных не хватает — рекомендации нет вовсе, кадр «данных не хватает».
    const { result, card: c } = card({ loggedDays: 5 });
    expect(c.recommendation).toBe(null);
    const host = render({ clientId: 'c1', card: c, result });
    expect(host.querySelector('.cur-sheet')).toBeTruthy();
    expect(host.querySelector('.cur-sheet__rec')).toBe(null);
    expect(text(host, '.cur-sheet__actions button')).toEqual(['Открыть дневник']);
  });

  it('история решений видна в листе, а не только в движке', () => {
    // Без неё лист не отвечает на вопрос «что я решал в прошлый раз», и куратор
    // решает заново каждую неделю.
    const { result, card: c } = card({
      history: [
        { weekLabel: '26 авг', factor: 0.97, what: 'applied', by: 'curator' },
        { weekLabel: '19 авг', factor: 1, what: 'declined', by: 'client' },
        { weekLabel: '12 авг', factor: 1, what: 'postponed', by: 'curator' },
        { weekLabel: '5 авг', factor: 1, what: 'cold_start' }
      ]
    });
    const host = render({ clientId: 'c1', card: c, result });
    const hist = host.querySelector('.cur-sheet__hist');
    expect(hist).toBeTruthy();
    // Ступенька между двумя пунктирами: верхний — единица, нижний — цель.
    expect(hist.querySelectorAll('.cur-sheet__hist-dash').length).toBe(2);
    expect(hist.querySelector('.cur-sheet__hist-dash.is-target')).toBeTruthy();
    expect(hist.querySelector('.cur-sheet__hist-line')).toBeTruthy();
    // Даты недель — слева направо, от старой к свежей.
    expect(text(hist, '.cur-sheet__hist-dates span'))
      .toEqual(['5 авг', '12 авг', '19 авг', '26 авг']);
    // И кто решил: «применил» без хозяина одинаково подходит обоим.
    expect(host.textContent).toContain('куратор применил');
    expect(host.textContent).toContain('клиент отказался');
    // Безличные исходы хозяина не имеют — их никто не выбирал.
    expect(host.textContent).toContain('отложено');
    expect(host.textContent).not.toContain('куратор отложил');
  });

  it('точка недели стоит по шкале, а не «примерно»', () => {
    // 0,97 при цели 0,92 — три десятых с небольшим пути от единицы.
    const { card: c } = card({
      history: [{ weekLabel: '26 авг', factor: 0.97, what: 'applied', by: 'curator' }]
    });
    const share = c.history[0].scaleShare;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
  });

  it('данных мало — лист говорит это заголовком, а не пустыми блоками', () => {
    const { result, card: c } = card({ loggedDays: 5 });
    expect(c.status).toBe('not_enough_data');
    const host = render({ clientId: 'c1', card: c, result });
    const gap = host.querySelector('.cur-sheet__gap');
    expect(gap).toBeTruthy();
    expect(gap.querySelector('.cur-sheet__gap-title').textContent)
      .toBe('Поправку не считаем');
    expect(gap.querySelector('.cur-sheet__gap-body').textContent.length)
      .toBeGreaterThan(20);
    // И блок гейтов меняет имя: он перечисляет нехватку, а не описывает качество.
    expect(host.textContent).toContain('Чего не хватает');
    expect(host.textContent).not.toContain('Качество данных');
  });
});
