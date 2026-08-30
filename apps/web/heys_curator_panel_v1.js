/**
 * heys_curator_panel_v1.js — пятая вкладка кабинета: кем заняться сегодня.
 *
 * Канон — curator-cabinet.v4.dc.html. Вкладка «Клиенты» рядом остаётся списком
 * людей: имя, телефон, подписка, вход в дневник. Панель показывает не людей, а
 * их состояние, и порядок в ней не алфавитный. Работает куратор всё равно в
 * дневнике: панель говорит «к кому идти», дневник — «что делать».
 *
 * Своего расчёта здесь нет. Числа приходят готовыми из HEYS.NormCorrection —
 * той же compute и того же движка расхода, что у клиента: разойдись они, оба
 * числа выглядели бы правдоподобно, и расхождение всплыло бы жалобой человека.
 */
(function (global) {
  'use strict';

  const HEYS = global.HEYS = global.HEYS || {};

  // Окно и пороги панель не назначает: они принадлежат движку поправки, и
  // своя копия числа 21 разошлась бы с ним молча. Читаем в момент вызова —
  // порядок загрузки модулей в бандле панели не принадлежит.
  const engine = () => HEYS.NormCorrection || {};
  const windowDays = () => engine().WINDOW_WORKING_DAYS;
  const gateWeighIns = () => engine().GATE_WEIGH_INS;

  // Порядок групп — старшинство состояний из контракта. Молчание выше
  // расхождения: молчащий рискует уйти совсем, а расхождение ждёт до
  // понедельника и само не портится.
  const GROUPS = [
    { state: 'awaits', title: 'Ждут решения', chip: 'ждут решения' },
    { state: 'decided_today', title: 'Решено сегодня', chip: 'решено' },
    { state: 'silent', title: 'Молчат', chip: 'молчат' },
    { state: 'mismatch', title: 'Расчёт разошёлся', chip: 'разошёлся' },
    { state: 'collecting', title: 'Копят данные', chip: 'копят' },
    { state: 'fine', title: 'Всё ровно', chip: 'всё ровно' }
  ];

  function fmtDate(d) {
    return d.toISOString().split('T')[0];
  }

  /**
   * Отрезок окна одной функцией — и для запроса, и для подписи в листе.
   *
   * Границы включительные: 21 день окна — это сегодня и двадцать предыдущих.
   * Вычесть двадцать один значило бы спросить у сервера двадцать два дня, и
   * пилюля расхождения (она меряет длину окна расчёта) спорила бы с подписью
   * «окно 21 день» в шапке того же листа.
   */
  function windowRange(now) {
    const to = new Date(now);
    const from = new Date(now);
    from.setDate(from.getDate() - (windowDays() - 1));
    return { from, to };
  }

  const MONTHS_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
    'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  /** «10–30 авг» внутри месяца, «25 июл – 14 авг» на стыке. */
  function shortRange(from, to) {
    if (!from || !to) return '';
    return from.getMonth() === to.getMonth()
      ? from.getDate() + '–' + to.getDate() + ' ' + MONTHS_RU[to.getMonth()]
      : from.getDate() + ' ' + MONTHS_RU[from.getMonth()]
        + ' – ' + to.getDate() + ' ' + MONTHS_RU[to.getMonth()];
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }

  function pluralDays(n) {
    const abs = Math.abs(n) % 100;
    const last = abs % 10;
    if (abs > 10 && abs < 20) return 'дней';
    if (last > 1 && last < 5) return 'дня';
    if (last === 1) return 'день';
    return 'дней';
  }

  const nbsp = (v) => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /**
   * Что стоит под именем клиента. Одно состояние на строку — то, где оно
   * старше; второе дописывается фразой, а не второй пилюлей: две метки
   * заставляют выбирать, куда смотреть.
   */
  function stateLine(row) {
    const c = row.card || {};
    const rec = c.recommendation;
    switch (row.state) {
      case 'awaits':
        return rec
          ? 'поправка ×' + String(rec.stepFactor).replace('.', ',')
            + ' · норма ' + nbsp(rec.currentNorm) + ' → ' + nbsp(rec.norm)
          : 'поправка посчитана';
      case 'decided_today':
        return rec ? 'норма ' + nbsp(rec.norm) + ' · решение принято' : 'решение принято';
      case 'silent':
        return 'не пишет ' + row.silentDays + ' ' + pluralDays(row.silentDays)
          + (row.alsoNote ? ' · ' + row.alsoNote : '');
      case 'mismatch':
        return 'факт ниже формулы на ' + row.mismatchPct + ' % · данных хватает'
          + (row.alsoNote ? ' · ' + row.alsoNote : '');
      case 'collecting': {
        // Знаменатель дней — длина окна, как в контракте («14 дней из 21 ·
        // взвешиваний 4 из 6»). Раньше здесь стоял гейт: «дни 11 из 10» —
        // счёт, который может обогнать собственный знаменатель. Порог остаётся
        // видимым у взвешиваний и в пилюле, а дни показывают наполнение окна.
        const logged = row.result ? row.result.loggedDays : 0;
        const weighIns = row.result ? row.result.weighIns : 0;
        const nb = (a, b) => a + ' из ' + b;
        return 'дни ' + nb(logged, windowDays())
          + ' · взвешивания ' + nb(weighIns, gateWeighIns());
      }
      case 'fine':
        // Развёрнутая группа без этой строки давала имя и пустую точку рядом:
        // строка есть, сказать ей нечего. «Всё ровно» — это результат расчёта
        // (шаг вышел нулевым), и он называется тем же числом нормы.
        return rec ? 'норма ' + nbsp(rec.norm) + ' · расчёт сошёлся' : 'расчёт сошёлся';
      default:
        return '';
    }
  }

  /** Пилюля справа всегда значит длительность состояния и никогда важность. */
  function agePill(row) {
    if (row.state === 'decided_today') return 'вы';
    if (row.state === 'collecting') {
      // Копят данные по двум разным причинам, и слова у них разные. Холодный
      // старт — «ещё рано», и у него есть срок. Непройденный гейт — «мало
      // данных», и у него есть недостача. Раньше пилюля читала missing у
      // обоих, а у холодного старта этого поля нет: клиент оставался вовсе
      // без пилюли и без объяснения, чего ждать.
      const res = row.result || {};
      if (res.status === 'cold_start') {
        return res.daysLeft ? 'ещё ' + res.daysLeft + ' ' + pluralDays(res.daysLeft) : null;
      }
      const miss = res.missing || {};
      const need = miss.weighIns || miss.loggedDays;
      return need ? 'нужно ' + need : null;
    }
    if (row.ageDays == null) return null;
    return row.ageDays + ' дн';
  }

  function CuratorPanel(props) {
    const React = global.React;
    if (!React) return null;
    const h = React.createElement;
    const { clients, onOpenClient } = props || {};

    const [rows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [sheet, setSheet] = React.useState(null);
    const [filter, setFilter] = React.useState(null);
    const [fineOpen, setFineOpen] = React.useState(false);
    const [tick, setTick] = React.useState(0);
    // Отрезок запоминается тот самый, по которому сервер отдал окно: лист
    // подписывает его датами, и пересчитать «примерно те же» значило бы
    // подписать одно окно датами другого.
    const [range, setRange] = React.useState(null);

    React.useEffect(() => {
      let cancelled = false;
      const api = HEYS.YandexAPI;
      const build = HEYS.NormCorrection && HEYS.NormCorrection.buildPanelRows;
      if (!api || !api.getClientsWindow || !build) {
        setError('modules');
        return undefined;
      }
      const now = new Date();
      const { from, to } = windowRange(now);
      setRange({ from, to });
      Promise.all([
        api.getClientsWindow(fmtDate(from), fmtDate(to)),
        api.getClientsNormContext()
      ]).then(([win, ctx]) => {
        if (cancelled) return;
        if (win.error || ctx.error) { setError('load'); return; }
        setRows(build({ windowRows: win.data, contextRows: ctx.data, now }));
      }).catch(() => { if (!cancelled) setError('load'); });
      return () => { cancelled = true; };
    }, [tick]);

    const nameOf = React.useCallback((clientId) => {
      const found = (clients || []).find((c) => c && c.id === clientId);
      return (found && found.name) || 'Клиент';
    }, [clients]);

    /**
     * Решение куратора уходит в данные клиента, а не в его собственные: норма
     * принадлежит клиенту, куратор ею распоряжается. Пишем оба скаляра профиля
     * вместе и решение в историю — она же держит метку просьбы о замере,
     * поэтому запись идёт поверх блоба, а не вместо него.
     */
    const decide = React.useCallback(async (row, action) => {
      const api = HEYS.YandexAPI;
      const NC = HEYS.NormCorrection;
      if (!api || !api.mergeSaveKV || !NC) return;

      const clientId = row.clientId;
      const result = row.result || {};
      const now = Date.now();
      const weekLabel = fmtDate(new Date(now));

      // Пишем серверным merge, а не заменой: профиль и история клиента — не
      // наши объекты, у них есть поля, о которых панель не знает. Заменить
      // блоб целиком значит стереть всё, чего мы не прислали. Поправка живёт
      // в профиле двумя скалярами, отдельного ключа у неё нет и заводить его
      // нельзя — иначе у нормы появится второй источник правды.
      if (action === 'apply_tomorrow') {
        const at = new Date(now);
        at.setDate(at.getDate() + 1);
        await api.mergeSaveKV(clientId, 'heys_profile', {
          normCorrectionFactor: result.nextFactor,
          normCorrectionAppliedAt: fmtDate(at),
          updatedAt: now
        });
      }

      // «Отложить» и «Заморозить» норму не двигают, но ответом считаются: без
      // записи строка не уйдёт из «ждут решения» и вернётся завтра такой же.
      const what = action === 'apply_tomorrow' ? 'applied'
        : action === 'freeze' ? 'frozen' : 'postponed';
      await api.mergeSaveKV(clientId, NC.HISTORY_KEY, {
        weeks: [{ weekLabel, factor: result.nextFactor, what, at: now }],
        updatedAt: now
      });

      setSheet(null);
      setTick((t) => t + 1);
    }, []);

    // Ярус со ссылками под пустым состоянием: пустой экран обязан сказать, где
    // работа есть, а не только что её нет здесь.
    const tier = (title, rows2) => h(React.Fragment, null,
      h('div', { className: 'cur-group__title' }, title),
      h('div', { className: 'cur-group__card' }, rows2)
    );
    const tierLine = (text, value, onClick) => h(onClick ? 'button' : 'div', {
      key: text,
      type: onClick ? 'button' : undefined,
      className: 'cur-row cur-row--line' + (onClick ? '' : ' is-static'),
      onClick
    },
      h('span', { className: 'cur-row__line' }, text),
      value != null ? h('span', { className: 'cur-row__count' }, value) : null
    );

    if (error === 'modules') {
      return h('div', { className: 'cur-panel__stub' }, 'Панель не загрузилась');
    }
    if (!rows) {
      return h('div', { className: 'cur-panel__stub' }, 'Считаем…');
    }
    if (!(clients || []).length) {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__empty' },
          h('div', { className: 'cur-panel__empty-title' }, 'Клиентов пока нет'),
          h('div', { className: 'cur-panel__empty-note' },
            'Панель заполнится сама, когда появится первый: состояние считается'
            + ' из его дневника, ничего настраивать не нужно.')
        ),
        tier('Что здесь будет', [
          tierLine('Кто ждёт решения по норме'),
          tierLine('У кого расчёт расходится с фактом'),
          tierLine('Кто перестал вести дневник')
        ])
      );
    }

    const byState = new Map();
    for (const row of rows) {
      if (!byState.has(row.state)) byState.set(row.state, []);
      byState.get(row.state).push(row);
    }

    const working = rows.filter((r) => r.state !== 'fine');
    if (!working.length) {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__empty cur-panel__empty--ok' },
          h('div', { className: 'cur-panel__empty-title' }, 'Сегодня всё ровно'),
          // Без числа в начале: «Все 2 пишут» читается как опечатка, а счёт
          // и так стоит строкой ниже.
          h('div', { className: 'cur-panel__empty-note' },
            'Все пишут дневник, ни у кого расчёт не расходится, решений от вас'
            + ' никто не ждёт. Это не пустой экран — это результат.')
        ),
        tier('Что можно посмотреть', [
          tierLine('Все клиенты с состоянием', rows.length,
            () => { if (onOpenClient) onOpenClient(); })
        ])
      );
    }

    // Карточка «Поправка считается не для всех» стоит над своей группой, а не
    // над всем экраном: без неё куратор видит клиентов без чисел и не знает,
    // это ошибка или ещё рано, — но и отодвигать ею работу нельзя. Контракт
    // строки так и говорит: карточка, ниже группа со счётом.
    const collecting = byState.get('collecting') || [];
    const gatesCard = collecting.length ? h('div', { className: 'cur-panel__empty' },
      h('div', { className: 'cur-panel__empty-title' }, 'Поправка считается не для всех'),
      h('div', { className: 'cur-panel__empty-note' },
        'У ' + collecting.length + ' из ' + rows.length + ' не набраны гейты: нужно '
        + engine().GATE_LOGGED_DAYS + ' дней с записями и ' + gateWeighIns()
        + ' настоящих взвешиваний внутри окна ' + windowDays() + ' '
        + pluralDays(windowDays()) + '. Оценка на четырёх днях хуже, чем её отсутствие.')
    ) : null;

    // Чипы меняют состав, а не порядок: выбран один — группы не показываются,
    // строки идут сплошняком.
    // Первым стоит «все» — обратный путь из фильтра должен быть виден, а не
    // угадываться повторным тапом по выбранному чипу.
    const chips = [{ state: null, title: 'все', count: rows.length }].concat(
      GROUPS
        .filter((g) => (byState.get(g.state) || []).length && g.state !== 'fine')
        .map((g) => ({ state: g.state, title: g.chip, count: byState.get(g.state).length }))
    );

    const renderRow = (row) => h('button', {
      key: row.clientId,
      type: 'button',
      className: 'cur-row',
      onClick: () => setSheet(row)
    },
      h('span', { className: 'cur-row__avatar' }, initials(nameOf(row.clientId))),
      h('span', { className: 'cur-row__copy' },
        h('span', { className: 'cur-row__name' }, nameOf(row.clientId)),
        h('span', {
          className: 'cur-row__state' + (row.state === 'awaits' ? ' is-act' : '')
        },
          h('span', { className: 'cur-row__dot cur-row__dot--' + row.state, 'aria-hidden': 'true' }),
          stateLine(row)
        )
      ),
      agePill(row) ? h('span', { className: 'cur-row__age' }, agePill(row)) : null
    );

    const fine = byState.get('fine') || [];

    return h('div', { className: 'cur-panel' },
      chips.length > 2 ? h('div', { className: 'cur-panel__chips' },
        chips.map((c) => h('button', {
          key: c.state || 'all',
          type: 'button',
          className: 'cur-chip' + (filter === c.state ? ' is-on' : '')
            + (c.state === 'collecting' ? ' is-muted' : ''),
          onClick: () => setFilter(c.state)
        }, c.title + ' · ' + c.count))
      ) : null,

      // Группа — одна карточка с разделителями, а не стопка отдельных плиток:
      // так кадр канваса и читает список, и счёт группы относится к карточке,
      // а не к воздуху между плитками.
      filter
        ? h('div', { className: 'cur-group__card' }, (byState.get(filter) || []).map(renderRow))
        : GROUPS.filter((g) => g.state !== 'fine' && (byState.get(g.state) || []).length)
          .map((g) => h(React.Fragment, { key: g.state },
            h('div', { className: 'cur-group__title' }, g.title + ' · ' + byState.get(g.state).length),
            g.state === 'collecting' ? gatesCard : null,
            h('div', { className: 'cur-group__card' }, byState.get(g.state).map(renderRow))
          )),

      // Самая частая группа занимает одну строку: тревожное и спокойное не
      // должны занимать одинаковое место.
      !filter && fine.length ? h('div', { className: 'cur-fine' },
        h('button', {
          type: 'button',
          className: 'cur-fine__toggle',
          onClick: () => setFineOpen((v) => !v)
        },
          h('span', null, 'Всё ровно · ' + fine.length),
          h('span', { className: 'cur-fine__more' }, fineOpen ? 'скрыть' : 'показать')
        ),
        fineOpen ? h('div', { className: 'cur-group__card cur-fine__list' }, fine.map(renderRow)) : null
      ) : null,

      sheet ? CuratorPanelSheet({ React, row: sheet, name: nameOf(sheet.clientId), range,
        onClose: () => setSheet(null), onDecide: decide, onOpenClient }) : null
    );
  }

  /**
   * Лист поверх панели: панель под ним остаётся на той же позиции прокрутки —
   * куратор смотрит клиентов подряд, и уход на отдельный экран сбивает место.
   *
   * Лист показывает числа кураторской карточки и ничего не пересчитывает.
   */
  function CuratorPanelSheet({ React, row, name, range, onClose, onDecide, onOpenClient }) {
    const h = React.createElement;
    const card = row.card || {};
    const rec = card.recommendation;

    return h('div', { className: 'cur-sheet-scrim', onClick: onClose },
      h('div', {
        className: 'cur-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        onClick: (e) => e.stopPropagation()
      },
        h('div', { className: 'cur-sheet__head' },
          h('span', { className: 'cur-row__avatar' }, initials(name)),
          h('span', { className: 'cur-sheet__copy' },
            h('span', { className: 'cur-row__name' }, name),
            // Тариф в шапке всегда Pro и не вычисляется: панель — вкладка
            // куратора, а признак Pro и есть наличие куратора. Тернарка,
            // возвращавшая «Pro» в обеих ветках, только делала вид, что
            // считает.
            h('span', { className: 'cur-sheet__meta' },
              'окно ' + windowDays() + ' ' + pluralDays(windowDays())
              + (range ? ' · ' + shortRange(range.from, range.to) : '')
              + ' · Pro')
          )
        ),

        h('div', { className: 'cur-sheet__facts' },
          card.formula ? factRow(React, 'Формула говорит', nbsp(card.formula.value)) : null,
          card.fact ? factRow(React, 'Факт говорит', nbsp(card.fact.value)) : null,
          rec ? factRow(React, 'Норма дня станет', nbsp(rec.norm)) : null
        ),

        // Только куратору: строка про то, где сидит расхождение, клиенту не
        // показывается никогда — она про выбор лечения, а не про него.
        card.whereMismatchSits
          ? h('div', { className: 'cur-sheet__where' }, card.whereMismatchSits)
          : null,

        rec ? h(React.Fragment, null,
          h('button', {
            type: 'button',
            className: 'cur-sheet__cta',
            onClick: () => onDecide(row, 'apply_tomorrow')
          }, 'Применить с завтра'),
          h('div', { className: 'cur-sheet__row' },
            h('button', {
              type: 'button', className: 'cur-sheet__btn',
              onClick: () => onDecide(row, 'postpone')
            }, 'Отложить'),
            h('button', {
              type: 'button', className: 'cur-sheet__btn',
              onClick: () => onDecide(row, 'freeze')
            }, 'Заморозить')
          )
        ) : null,

        h('button', {
          type: 'button',
          className: 'cur-sheet__btn cur-sheet__btn--wide',
          onClick: () => { onClose(); if (onOpenClient) onOpenClient(row.clientId); }
        }, 'Открыть дневник')
      )
    );
  }

  function factRow(React, label, value) {
    return React.createElement('div', { className: 'cur-sheet__fact', key: label },
      React.createElement('span', { className: 'cur-sheet__fact-label' }, label),
      React.createElement('span', { className: 'cur-sheet__fact-value' }, value)
    );
  }

  HEYS.CuratorPanel = {
    windowDays,
    windowRange,
    shortRange,
    GROUPS,
    Component: CuratorPanel,
    stateLine,
    agePill,
    initials
  };

  console.info('[HEYS.curatorPanel] ✅ loaded');
})(typeof window !== 'undefined' ? window : globalThis);
