/**
 * Смоук сведения чек-ина с контрактом канваса `checkin-morning.v4.dc.html`.
 *
 * Почему jsdom, а не глаз на локалке. Стыки, которые здесь проверяются, руками
 * не собрать: просроченная строка требует замеров четырнадцатидневной давности,
 * капсула веса — дробного числа с запятой между двумя колёсами, а «чип 36, а
 * нажимается 44» вообще не виден — он либо работает, либо человек мажет мимо.
 *
 * Геометрию считает не строка CSS, а каскад: файл модуля целиком кладётся в
 * документ, и `getComputedStyle` отвечает то же, что ответил бы браузер. Так
 * ловится не только неверное число, но и перебитое правило — ради этого тест и
 * пишется отдельно от текстовой сверки в `morning-checkin-v4-layout-smoke`.
 *
 * Числа — из блока [data-contract] пакета дизайна. Где контракт расходится с
 * кадром, верен контракт, и расхождение названо в комментарии рядом.
 */
import fs from 'fs';
import path from 'path';

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAILY_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/500-pwa-and-offline.css'),
  'utf8'
);
const STEPS_CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/600-steps-and-aps.css'),
  'utf8'
);
const STEPS_SRC = fs.readFileSync(path.resolve(__dirname, '../heys_steps_v1.js'), 'utf8');

const TODAY = '2026-08-16';

function mountCss() {
  const style = document.createElement('style');
  style.textContent = DAILY_CSS;
  document.head.appendChild(style);
  return style;
}

function loadStepsModule() {
  window.React = React;
  window.HEYS = {
    StepModal: {
      WheelPicker: () => null,
      TimePicker: () => null,
      registerStep: () => {},
      utils: {
        lsGet: (key, fallback) => fallback,
        lsSet: vi.fn(),
        getTodayKey: () => TODAY,
      },
    },
  };
  // eslint-disable-next-line no-new-func
  new Function(STEPS_SRC)();
  return window.HEYS.Steps;
}

describe('чек-ин v4: геометрия по контракту канваса', () => {
  let style;

  beforeEach(() => {
    style = mountCss();
  });

  afterEach(() => {
    style.remove();
    document.body.innerHTML = '';
    delete window.HEYS;
    delete window.React;
  });

  it('просроченная строка: метка числом дней справа, 10 px/700, точки нет', () => {
    // Контракт «вид просроченной строки»: фон --tint, обводка 1,5 px тоном
    // --ac2, поля 12/14/13 и метка числом дней СПРАВА 10 px/700. Кадр
    // «Чек-ин · замеры просрочены» рисует её кикером слева над строкой — здесь
    // сознательное отступление от кадра в пользу контракта.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-step-content">
          <div class="mc-rest-step">
            <button class="mc-rest-row mc-rest-row--overdue">
              <div>
                <div class="mc-rest-card-title">Замеры</div>
                <div class="mc-rest-card-hint">Без обхвата виден только вес</div>
              </div>
              <span class="mc-rest-overdue-badge">14 дней</span>
              <span class="mc-rest-chevron mc-rest-chevron--accent">&rsaquo;</span>
            </button>
          </div>
        </div>
      </div>`;

    const row = document.querySelector('.mc-rest-row--overdue');
    const badge = document.querySelector('.mc-rest-overdue-badge');
    const rowStyle = getComputedStyle(row);
    const badgeStyle = getComputedStyle(badge);

    expect(rowStyle.paddingTop).toBe('12px');
    expect(rowStyle.paddingLeft).toBe('14px');
    expect(rowStyle.paddingRight).toBe('14px');
    expect(rowStyle.paddingBottom).toBe('13px');

    expect(badgeStyle.fontSize).toBe('10px');
    expect(badgeStyle.fontWeight).toBe('700');
    // `margin-left: auto` — это и есть «справа»: метка отжимается к шеврону,
    // а не встаёт кикером над заголовком.
    expect(badgeStyle.marginLeft).toBe('auto');
    // Метка идёт после текстового блока и перед шевроном.
    const order = [...row.children].map((el) => el.className);
    expect(order[order.length - 2]).toContain('mc-rest-overdue-badge');
    expect(order[order.length - 1]).toContain('mc-rest-chevron');

    // Ни точки, ни кикера в модуле больше нет.
    expect(DAILY_CSS).not.toContain('.mc-rest-overdue-dot');
    expect(DAILY_CSS).not.toContain('.mc-rest-overdue-kicker');
    expect(STEPS_SRC).not.toContain('mc-rest-overdue-dot');
  });

  it('метка просрочки: только число дней, и только с седьмого дня', () => {
    const Steps = loadStepsModule();
    const badge = Steps.formatMeasurementsOverdueBadge;
    const at = (daysAgo) => badge({ measuredAt: '2026-08-01', daysAgo });

    expect(at(6)).toBeNull(); // порог контракта — 7 дней
    expect(at(7)).toBe('7 дней');
    expect(at(14)).toBe('14 дней');
    expect(at(21)).toBe('21 день');
    expect(at(22)).toBe('22 дня');
    // Замеров не было ни разу — числа дней нет, значит нет и метки; про это
    // говорит подпись самой строки, а строка всё равно считается просроченной.
    expect(badge({ daysAgo: null })).toBeNull();
    expect(Steps.isMeasurementsOverdue({ daysAgo: null })).toBe(true);
  });

  it('капсула веса: 212/22/13-12-16, число 36, соседние 16, запятая 32', () => {
    // Контракт «капсула веса». Запятая живёт в том же правиле, что и двоеточие
    // капсулы времени, поэтому проверяем обе: правка одной не должна утащить
    // за собой другую.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-step-content">
          <div class="mc-weight-step">
            <div class="mc-weight-hero">
              <div class="mc-weight-hero-row"></div>
              <div class="mc-weight-week-delta mc-weight-week-delta--down">−0,8 кг за неделю</div>
            </div>
            <div class="mc-weight-kilo-card">
              <div class="mc-kilo-label">Килограммы</div>
              <div class="mc-weight-pickers">
                <div class="mc-wheel-picker mc-wheel-picker--compact">
                  <div class="mc-wheel-values">
                    <div class="mc-wheel-value mc-wheel-value--prev">72</div>
                    <div class="mc-wheel-value mc-wheel-value--current">73</div>
                    <div class="mc-wheel-value mc-wheel-value--next">74</div>
                  </div>
                </div>
                <div class="mc-weight-comma">,</div>
                <div class="mc-wheel-picker mc-wheel-picker--compact">
                  <div class="mc-wheel-values">
                    <div class="mc-wheel-value mc-wheel-value--prev">3</div>
                    <div class="mc-wheel-value mc-wheel-value--current">4</div>
                    <div class="mc-wheel-value mc-wheel-value--next">5</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="mc-sleep-combined">
            <div class="mc-sleep-block">
              <div class="mc-time-pickers">
                <div class="mc-wheel-picker mc-wheel-picker--compact">
                  <div class="mc-wheel-values">
                    <div class="mc-wheel-value mc-wheel-value--current">23</div>
                  </div>
                </div>
                <div class="mc-time-sep">:</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const card = getComputedStyle(document.querySelector('.mc-weight-kilo-card'));
    expect(card.width).toBe('212px');
    expect(card.borderRadius).toBe('22px');
    expect(card.paddingTop).toBe('13px');
    expect(card.paddingLeft).toBe('12px');
    expect(card.paddingBottom).toBe('16px');
    // Отступ сверху 38 от строки динамики; без неё контракт даёт 36.
    expect(card.marginTop).toBe('38px');

    const current = getComputedStyle(document.querySelector('.mc-weight-kilo-card .mc-wheel-value--current'));
    expect(current.fontSize).toBe('36px');
    expect(current.fontWeight).toBe('700');
    // jsdom пересчитывает em от корневого кегля, поэтому трекинг сверяем по
    // самому правилу: контракт называет −.025em, а не пиксели.
    expect(DAILY_CSS).toMatch(
      /\.mc-modal--daily \.mc-weight-kilo-card \.mc-wheel-value--current \{[\s\S]*?letter-spacing: -0\.025em/
    );

    const prev = getComputedStyle(document.querySelector('.mc-weight-kilo-card .mc-wheel-value--prev'));
    expect(prev.fontSize).toBe('16px');
    expect(prev.fontWeight).toBe('600');

    const comma = getComputedStyle(document.querySelector('.mc-weight-comma'));
    expect(comma.fontSize).toBe('32px');
    expect(comma.fontWeight).toBe('700');

    // Двоеточие капсулы времени осталось при своём размере — общее правило
    // 24 px не перекрашено под вес.
    const sep = getComputedStyle(document.querySelector('.mc-time-sep'));
    expect(sep.fontSize).toBe('28px');
  });

  it('без строки динамики капсула веса отступает на 36', () => {
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-step-content">
          <div class="mc-weight-step">
            <div class="mc-weight-hero"><div class="mc-weight-hero-row"></div></div>
            <div class="mc-weight-kilo-card"></div>
          </div>
        </div>
      </div>`;
    expect(getComputedStyle(document.querySelector('.mc-weight-kilo-card')).marginTop).toBe('36px');
  });

  it('чип добавки: видимые 36, нажимаемые 44; ответы шага — 44', () => {
    // Контракт «минимальная область нажатия»: чипы 36 с прозрачными полями до
    // 44, все остальные нажимаемые элементы не ниже 44. Псевдоэлемент в jsdom
    // не вычисляется, поэтому припуск читается из самого правила.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-supp-flow-chips">
          <button class="mc-supp-flow-chip">D3</button>
        </div>
        <div class="mc-rest-routine-actions">
          <button class="mc-pill mc-pill--mini mc-pill--choice">Сделал</button>
        </div>
      </div>`;

    const chip = getComputedStyle(document.querySelector('.mc-supp-flow-chip'));
    expect(chip.minHeight).toBe('36px');
    // Припуск можно повесить только на позиционированный чип.
    expect(chip.position).toBe('relative');

    const after = DAILY_CSS.match(/\.mc-supp-flow-chip::after \{([\s\S]*?)\}/);
    expect(after).toBeTruthy();
    const inset = (prop) => Number(after[1].match(new RegExp(`${prop}:\\s*(-?\\d+)px`))[1]);
    expect(36 - inset('top') - inset('bottom')).toBe(44);
    expect(after[1]).toContain('position: absolute');

    const pill = getComputedStyle(document.querySelector('.mc-pill--mini'));
    expect(pill.minHeight).toBe('44px');
  });

  it('вид шага: содержимое 16/18/0, у шага веса 14 сверху', () => {
    // Контракт «вид шага». Кадры мастера рисуют разброс 14–34 px — контракт
    // старше кадра, разброс снят.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-step-content" id="weight"><div class="mc-weight-step"></div></div>
        <div class="mc-step-content" id="mood"><div class="mc-mood-step"></div></div>
        <div class="mc-step-content" id="rest"><div class="mc-rest-step"></div></div>
      </div>`;

    const weight = getComputedStyle(document.getElementById('weight'));
    expect(weight.paddingTop).toBe('14px');
    expect(weight.paddingLeft).toBe('18px');
    expect(weight.paddingBottom).toBe('0px');

    for (const id of ['mood', 'rest']) {
      const cs = getComputedStyle(document.getElementById(id));
      expect(cs.paddingTop).toBe('16px');
      expect(cs.paddingRight).toBe('18px');
      expect(cs.paddingBottom).toBe('0px');
    }
  });

  it('полоса прогресса: точки 7×7, текущая 18×7 без увеличения', () => {
    // Контракт «вид полосы прогресса». Стык, который руками не поймать: узел
    // мастера несёт сразу `--in-header` и `--pills`, а модуль 600 грузится
    // после 500 (styles/main.css) — при равной силе он перебивал контракт и
    // давал 6×6 плюс scale(1.3). Поэтому подключаем ОБА файла в том же
    // порядке, что и продукт.
    const late = document.createElement('style');
    late.textContent = STEPS_CSS;
    document.head.appendChild(late);
    try {
      document.body.innerHTML = `
        <div class="mc-modal mc-modal--daily">
          <div class="mc-header-center">
            <div class="mc-progress-dots mc-progress-dots--in-header mc-progress-dots--pills">
              <button class="mc-progress-dot completed"></button>
              <button class="mc-progress-dot active"></button>
              <button class="mc-progress-dot"></button>
            </div>
          </div>
        </div>`;

      const dots = getComputedStyle(document.querySelector('.mc-progress-dots--pills'));
      expect(dots.gap).toBe('5px');

      const idle = getComputedStyle(document.querySelectorAll('.mc-progress-dots--pills .mc-progress-dot')[2]);
      expect(idle.width).toBe('7px');
      expect(idle.height).toBe('7px');

      const active = getComputedStyle(document.querySelector('.mc-progress-dots--pills .active'));
      expect(active.width).toBe('18px');
      expect(active.height).toBe('7px');
      // Контракт увеличения текущей точки не знает: ширина 18 при той же высоте.
      expect(active.transform === 'none' || active.transform === '').toBe(true);

      // Компактного варианта 6×6 больше нет: решением владельца 2 сентября вид
      // полосы прогресса стал общим для всех шаговых модалок, и обе ветки
      // разметки вешают `--pills`. Сторожим это в исходнике — иначе новая
      // ветка без класса вернула бы синюю точку прежней системы молча.
      const modalSrc = fs.readFileSync(path.resolve(__dirname, '../heys_step_modal_v1.js'), 'utf8');
      const containers = modalSrc.match(/mc-progress-dots mc-progress-dots--in-header[^']*/g) || [];
      expect(containers.length).toBeGreaterThanOrEqual(2);
      for (const cls of containers) expect(cls).toContain('mc-progress-dots--pills');
      expect(STEPS_CSS).not.toContain(':not(.mc-progress-dots--pills)');
    } finally {
      late.remove();
    }
  });

  it('карточка шага: радиус 20 и поля 16/17 у всех карточек «Остального»', () => {
    // Контракт «вид карточки шага». Кадры «остальное» и «замеры просрочены»
    // дают добавкам и рутине вторую форму (радиус 16, поля 12–13/14) — здесь
    // сознательное отступление от кадра в пользу одной формы контракта.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-rest-step">
          <div class="mc-rest-cold"></div>
          <div class="mc-rest-card mc-rest-card--routine"></div>
        </div>
      </div>`;

    for (const sel of ['.mc-rest-cold', '.mc-rest-card']) {
      const cs = getComputedStyle(document.querySelector(sel));
      expect(cs.borderRadius).toBe('20px');
      expect(cs.paddingTop).toBe('16px');
      expect(cs.paddingLeft).toBe('17px');
      expect(cs.paddingBottom).toBe('16px');
    }
  });

  it('карточка шага: заголовок 16/700 и пояснение через 5 — по контракту, не по кадрам', () => {
    // Форма карточки закреплена выше, а набор внутри неё держался только
    // комментарием в CSS. Отступление то же самое и по той же причине, но
    // названо оно было в двух местах из трёх: контракт «вид карточки шага»
    // говорит «заголовок 16 px/700 чернилами, под заголовком через 5 пояснение
    // 11,5 px/500 тоном чернил 50 %», а шесть кадров набирают мельче —
    // заголовок 600 13/1, пояснение 500 11/1,4 с отступом 3.
    //
    // Кадры, от которых здесь отступаем поимённо: «Чек-ин · остальное · 33»,
    // «замеры просрочены · 36» и «· 37», «остальное со строкой периода · 18»,
    // «остальное на неделе периода · 23» и «· 24».
    //
    // Правило групповое (`.mc-rest-cold-title, .mc-rest-card-title` и
    // `.mc-rest-cold-hint, .mc-rest-card-hint, .mc-recorded-hint,
    // .mc-recorded-sub`), поэтому проверяются обе карточки: правка ради одной
    // задела бы вторую молча.
    document.body.innerHTML = `
      <div class="mc-modal mc-modal--daily">
        <div class="mc-rest-step">
          <div class="mc-rest-cold">
            <div class="mc-rest-cold-title">Холодный душ</div>
            <div class="mc-rest-cold-hint">Серия не прервётся</div>
          </div>
          <div class="mc-rest-card mc-rest-card--routine">
            <div class="mc-rest-card-title">Рутина</div>
            <div class="mc-rest-card-hint">Без обхвата виден только вес</div>
          </div>
        </div>
      </div>`;

    for (const sel of ['.mc-rest-cold-title', '.mc-rest-card-title']) {
      const cs = getComputedStyle(document.querySelector(sel));
      expect(cs.fontSize, sel).toBe('16px');
      expect(cs.fontWeight, sel).toBe('700');
    }

    for (const sel of ['.mc-rest-cold-hint', '.mc-rest-card-hint']) {
      const cs = getComputedStyle(document.querySelector(sel));
      expect(cs.fontSize, sel).toBe('11.5px');
      expect(cs.fontWeight, sel).toBe('500');
      expect(cs.marginTop, sel).toBe('5px');
    }
  });
});
