// Панель куратора — пятая вкладка кабинета.
//
// Проверяется исходник: компонент живёт внутри кураторского входа, и поднять
// его целиком дороже, чем закрепить правила, которые вёрстка обязана
// соблюсти. Логика строк уже покрыта отдельно (curator-panel-rows) — здесь
// только поверхность и запись решения.
import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

const SRC = fs.readFileSync(path.resolve(__dirname, '../heys_curator_panel_v1.js'), 'utf8');
const GATE = fs.readFileSync(path.resolve(__dirname, '../heys_app_gate_flow_v1.js'), 'utf8');
const CSS = fs.readFileSync(
  path.resolve(__dirname, '../styles/modules/734-ui-v4-curator-panel.css'),
  'utf8'
);
const MAIN = fs.readFileSync(path.resolve(__dirname, '../styles/main.css'), 'utf8');
const BUNDLE = fs.readFileSync(
  path.resolve(__dirname, '../../../scripts/legacy-bundle-config.mjs'),
  'utf8'
);

const ENGINE = fs.readFileSync(path.resolve(__dirname, '../heys_norm_correction_v1.js'), 'utf8');

const SPLIT_LINES = new RegExp('\r?\n');

let CP;
beforeEach(() => {
  window.HEYS = {};
  // Движок грузится вместе с панелью: окно и пороги принадлежат ему, панель
  // их только читает. Подставить сюда свои 21 и 6 значило бы проверять
  // выдуманные числа вместо настоящих.
  // eslint-disable-next-line no-eval
  (0, eval)(ENGINE);
  // eslint-disable-next-line no-eval
  (0, eval)(SRC);
  CP = window.HEYS.CuratorPanel;
});

describe('панель куратора · место в кабинете', () => {
  it('пятая вкладка, и порядок групп — старшинство контракта', () => {
    expect(GATE).toContain("setCuratorTab('panel')");
    expect(GATE).toContain("curatorTab === 'panel'");
    expect(CP.GROUPS.map((g) => g.state)).toEqual([
      'awaits', 'decided_today', 'silent', 'mismatch', 'collecting', 'fine'
    ]);
  });

  it('вход в дневник не заводит вторую механику переключения', () => {
    // switchClient живёт в списке клиентов и остаётся одной механикой на
    // весь кабинет.
    const start = GATE.indexOf('HEYS.CuratorPanel.Component');
    const body = GATE.slice(start, GATE.indexOf("curatorTab === 'moderation'", start))
      .split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join(' ');
    expect(body).not.toContain('switchClient');
    expect(body).toContain("setCuratorTab('clients')");
  });

  it('движок едет ленивым куском — панель ждёт его, а не объявляет поломку', () => {
    // CuratorPanel лежит в boot-app и рисуется сразу; NormCorrection,
    // WorkingWeights и тренд веса — в postboot-3-ui-lazy. Разовая проверка
    // модулей давала «Панель не загрузилась» навсегда.
    const BUNDLE_OF = (file) => {
      let cur = null;
      for (const line of BUNDLE.split(SPLIT_LINES)) {
        const b = /^\s*'([a-z0-9-]+)':\s*\[/.exec(line);
        if (b) cur = b[1];
        if (line.includes("'" + file + "'")) return cur;
      }
      return null;
    };
    expect(BUNDLE_OF('heys_curator_panel_v1.js')).toBe('boot-app');
    expect(BUNDLE_OF('heys_norm_correction_v1.js')).toBe('postboot-3-ui-lazy');
    // Значит панель обязана дотянуть кусок сама.
    expect(SRC).toContain('HEYS.__loadPostboot3Ui');
    expect(SRC).toContain('waitedForEngine.current');
    // И ровно один раз: иначе неудачная загрузка крутит перерисовку по кругу.
    expect(SRC).toContain('waitedForEngine.current = true');
  });

  it('панель показывает ровно тех клиентов, что и кабинет', () => {
    // Сервер отдаёт всех клиентов куратора, включая dev-фикстуры, а кабинет
    // их скрывает: панель показывала четверых под шапкой «2 клиентов».
    expect(SRC).toContain('const known = new Set((clients || []).map((c) => c && c.id)');
    expect(SRC).toContain('allRows.filter((r) => known.has(r.clientId))');
    // Кабинет отдаёт панели тот же отфильтрованный список, что шапке.
    expect(GATE).toContain('clients: curatorPanelClients');
    // Строк по своим клиентам нет — это отдельное состояние, а не пустая панель.
    expect(SRC).toContain('По вашим клиентам данных нет');
  });

  it('отказ сервера назван и его можно повторить', () => {
    // Ветки для него не было вовсе: setError('load') отрабатывал, строк не
    // появлялось, и экран навсегда застревал на «Считаем…» — состоянии,
    // которое обещает, что сейчас всё появится.
    expect(SRC).toContain("error === 'load'");
    expect(SRC).toContain('Данные не пришли');
    expect(SRC).toContain("'Повторить'");
    expect(SRC).toContain('setError(null); setTick((t) => t + 1)');
    expect(CSS).toContain('.cur-panel__retry');
  });

  it('стили подключены и живут своим модулем', () => {
    expect(MAIN).toContain("734-ui-v4-curator-panel.css");
    expect(BUNDLE).toContain('heys_curator_panel_v1.js');
  });
});

describe('панель куратора · строка клиента', () => {
  const row = (over) => Object.assign({
    clientId: 'c1', state: 'awaits', ageDays: 3, alsoNote: null,
    silentDays: 0, mismatchPct: 8, collecting: false,
    result: { loggedDays: 14, weighIns: 4, missing: {} },
    card: { recommendation: { stepFactor: 0.97, currentNorm: 2112, norm: 2049 } }
  }, over);

  it('ждёт решения — поправка и обе нормы в строке', () => {
    expect(CP.stateLine(row({}))).toBe('поправка ×0,97 · норма 2 112 → 2 049');
  });

  it('молчит — дни склоняются, и второе состояние идёт фразой', () => {
    expect(CP.stateLine(row({ state: 'silent', silentDays: 1, alsoNote: null })))
      .toBe('не пишет 1 день');
    expect(CP.stateLine(row({ state: 'silent', silentDays: 4, alsoNote: 'и расчёт разошёлся' })))
      .toBe('не пишет 4 дня · и расчёт разошёлся');
  });

  it('копят данные — знаменатель дней это длина окна, а не гейт', () => {
    // Гейт в знаменателе давал «дни 11 из 10» — счёт, обогнавший собственный
    // знаменатель. Контракт («14 дней из 21 · взвешиваний 4 из 6») тут прав.
    // Дробь не переносится посреди себя — «3 из» и «6» на разных строках
    // читаются как два разных числа.
    const line = CP.stateLine(row({ state: 'collecting' }));
    expect(line).toBe('дни 14 из 21 · взвешивания 4 из 6');
    expect(CP.stateLine(row({
      state: 'collecting',
      result: { loggedDays: 21, weighIns: 2, missing: { weighIns: 4 } }
    }))).toBe('дни 21 из 21 · взвешивания 2 из 6');
  });

  it('оба числа строки принадлежат движку, а не панели', () => {
    // Своя копия 21 и 6 разошлась бы с движком молча.
    const NC = window.HEYS.NormCorrection;
    expect(CP.windowDays()).toBe(NC.WINDOW_WORKING_DAYS);
    expect(CP.stateLine(row({ state: 'collecting' })))
      .toContain('из ' + NC.GATE_WEIGH_INS);
  });

  it('«всё ровно» говорит числом, а не пустой строкой с точкой', () => {
    // Тысячи разделены неразрывным пробелом — как во всех числах панели.
    expect(CP.stateLine(row({ state: 'fine' }))).toBe('норма 2 049 · расчёт сошёлся');
    expect(CP.stateLine(row({ state: 'fine', card: {} }))).toBe('расчёт сошёлся');
  });

  it('пилюля меряет длительность, а у решённого сегодня стоит «вы»', () => {
    expect(CP.agePill(row({}))).toBe('3 дн');
    expect(CP.agePill(row({ state: 'decided_today' }))).toBe('вы');
  });

  it('у копящих данные пилюля говорит, чего не хватает', () => {
    const r = row({ state: 'collecting', result: { loggedDays: 14, weighIns: 4, missing: { weighIns: 2 } } });
    expect(CP.agePill(r)).toBe('нужно 2');
  });

  it('у холодного старта своя причина и свой срок, а не чужое поле', () => {
    // missing у cold_start не существует: пилюля читала его и оставалась
    // пустой — клиент висел без объяснения, чего ждать.
    expect(CP.agePill(row({
      state: 'collecting',
      result: { status: 'cold_start', loggedDays: 9, weighIns: 3, daysLeft: 5 }
    }))).toBe('ещё 5 дней');
    expect(CP.agePill(row({
      state: 'collecting',
      result: { status: 'cold_start', loggedDays: 13, weighIns: 3, daysLeft: 1 }
    }))).toBe('ещё 1 день');
  });

  it('инициалы берутся из имени и не падают на пустом', () => {
    expect(CP.initials('Анна Кузнецова')).toBe('АК');
    expect(CP.initials('Анна')).toBe('А');
    expect(CP.initials('')).toBe('—');
  });
});

describe('панель куратора · решение и границы', () => {
  it('решение пишется серверным merge, а не заменой блоба', () => {
    // Профиль и история клиента — не наши объекты: заменить целиком значит
    // стереть всё, чего мы не прислали, включая метку просьбы о замере.
    expect(SRC).toContain('api.mergeSaveKV(clientId');
    expect(SRC).not.toContain('api.saveKV(');
  });

  it('поправка пишется в профиль двумя скалярами, своего ключа у неё нет', () => {
    expect(SRC).toContain("mergeSaveKV(clientId, 'heys_profile'");
    expect(SRC).toContain('normCorrectionFactor');
    expect(SRC).toContain('normCorrectionAppliedAt');
    expect(SRC).not.toContain('heys_profile_norm_correction');
  });

  it('все три действия считаются ответом', () => {
    // Иначе строка не уйдёт из «ждут решения» и вернётся завтра такой же.
    for (const what of ['applied', 'frozen', 'postponed']) {
      expect(SRC, what).toContain("'" + what + "'");
    }
  });

  it('панель ничего не пересчитывает — числа приходят из модели', () => {
    expect(SRC).toContain('HEYS.NormCorrection && HEYS.NormCorrection.buildPanelRows');
    // Читать число движка можно, выводить своё — нет. Раньше запрет стоял на
    // само слово deficitPct, и разбор расчёта в листе его нарушал, хотя
    // дефицит там только показывается: rec.deficitPct приходит готовым.
    expect(SRC).not.toContain('baseExpenditure');
    expect(SRC).not.toContain('7700');
    // Ни одной формулы нормы: ни доли дефицита, ни умножения на поправку.
    expect(SRC).not.toMatch(/\/ *100|\* *0\.9|1 \+ [a-z]*[Dd]eficit/);
  });

  it('механизм расчёта стоит столбцом, а не за раскрывашкой', () => {
    // Решение владельца 30 августа: куратор решает не по итогу, а по тому,
    // откуда итог взялся, — прятать это значит прятать предмет решения.
    expect(SRC).toContain("h('div', { className: 'cur-sheet__how-body' }");
    expect(SRC).not.toContain('howOpen');
    for (const title of ['Из чего расход', 'Как получился факт',
      'Как получилась поправка', 'Как получилась норма', 'На чём считали']) {
      expect(SRC, title).toContain("'" + title + "'");
    }
    // Лист прокручивается — высота ему не предел.
    expect(CSS).toMatch(/\.cur-sheet[\s\S]{0,200}overflow-y: auto/);
  });

  it('лист не считает сам — все числа разбора приходят из карточки', () => {
    const body = SRC.slice(SRC.indexOf('cur-sheet__how-body'), SRC.indexOf("'Применить с завтра'"));
    // Ни одной собственной арифметики: только форматирование пришедших чисел.
    expect(body).not.toMatch(/[*/]\s*(?:100|7700|0\.85)/);
    expect(body).toContain('card.expenditureParts');
    expect(body).toContain('card.path');
    expect(body).toContain('rec.correctedExpenditure');
  });

  it('действия прилипают к низу листа', () => {
    // Разбор расчёта сделал лист длинным, и главное действие уезжало за
    // прокрутку: читать механизм и решать — одно движение, а не два.
    expect(SRC).toContain("className: 'cur-sheet__actions'");
    expect(CSS).toMatch(/\.cur-sheet__actions[\s\S]{0,120}position: sticky/);
    // Под липким рядом проезжают числа — просвечивать им нельзя.
    expect(CSS).toMatch(/\.cur-sheet__actions[\s\S]{0,400}background: var\(--v4-bg/);
  });

  it('цель поправки показывается только когда шаг её не догнал', () => {
    // Совпадая с применяемым, строка была дублем и заставляла искать разницу
    // там, где её нет: «цель ×1,008» рядом с «применяем ×1,01».
    const block = SRC.slice(SRC.indexOf('Как получилась поправка'), SRC.indexOf('Как получилась норма'));
    expect(block).toContain("factRow(React, 'Цель поправки'");
    expect(block).toContain('card.stepCapped');
    expect(SRC).toContain("card.stepCapped ? 'Применяем' : 'Поправка'");
    expect(SRC).toContain('rec.targetFactorShown');
  });

  it('качество данных названо словом, а не дробью', () => {
    // «21 из 10» читалось так же плохо, как «дни 11 из 10» в самой панели.
    expect(SRC).toContain("q.value + ' · хватает'");
    expect(SRC).toContain("' · мало, нужно '");
  });

  it('«где сидит расхождение» показывается только в кураторском листе', () => {
    expect(SRC).toContain('card.whereMismatchSits');
    expect(CSS).toContain('.cur-sheet__where');
  });

  it('лист перекрывает панель, а не уводит на другой экран', () => {
    expect(CSS).toMatch(/\.cur-sheet-scrim[\s\S]{0,200}position: fixed/);
    expect(SRC).toContain('cur-sheet-scrim');
  });

  it('«всё ровно» свёрнуто по умолчанию', () => {
    expect(SRC).toContain('const [fineOpen, setFineOpen] = React.useState(false)');
    expect(SRC).toContain("fineOpen ? 'скрыть' : 'показать'");
  });

  it('чипы меняют состав, а не порядок', () => {
    // Выбран один — группы не показываются, строки идут одной карточкой.
    expect(SRC).toContain("h('div', { className: 'cur-group__card' }, (byState.get(filter)");
    expect(SRC).not.toContain('sort(');
  });

  it('первый чип — «все», и он же обратный путь из фильтра', () => {
    // Без него выход из фильтра приходится угадывать повторным тапом по
    // выбранному чипу.
    expect(SRC).toContain("[{ state: null, title: 'все', count: rows.length }]");
    expect(SRC).toContain('onClick: () => setFilter(c.state)');
  });

  it('акцент только там, где нужно решение', () => {
    expect(CSS).toMatch(/\.cur-row__state\.is-act[\s\S]{0,120}--v4-act-text/);
  });
});

describe('панель куратора · окно', () => {
  it('границы включительные — 21 день, а не 22', () => {
    // Вычесть 21 значило бы спросить у сервера 22 дня: пилюля расхождения
    // меряет длину окна расчёта и показывала «22 дн» под подписью «окно 21».
    const now = new Date('2026-08-30T12:00:00');
    const { from, to } = CP.windowRange(now);
    expect(to.toISOString().slice(0, 10)).toBe('2026-08-30');
    expect(from.toISOString().slice(0, 10)).toBe('2026-08-10');
    const span = Math.round((to - from) / 86400000) + 1;
    expect(span).toBe(CP.windowDays());
  });

  it('подпись окна — тот же отрезок и склонение', () => {
    const { from, to } = CP.windowRange(new Date('2026-08-30T12:00:00'));
    expect(CP.shortRange(from, to)).toBe('10–30 авг');
    // Стык месяцев называет оба.
    const a = CP.windowRange(new Date('2026-08-14T12:00:00'));
    expect(CP.shortRange(a.from, a.to)).toBe('25 июл – 14 авг');
  });

  it('запрос и подпись берут отрезок из одной функции', () => {
    // Раньше запрос считал границы сам, а шапка листа печатала «окно 21 дней»
    // из константы — два источника одного отрезка.
    expect(SRC).toContain('const { from, to } = windowRange(now)');
    expect(SRC).toContain('api.getClientsWindow(fmtDate(from), fmtDate(to))');
    expect(SRC).toContain('shortRange(range.from, range.to)');
    expect(SRC).not.toContain("' дней · '");
  });

  it('тариф в шапке не притворяется вычисленным', () => {
    // Панель — вкладка куратора, признак Pro и есть наличие куратора.
    expect(SRC).not.toContain("? 'Pro' : 'Pro'");
  });
});
