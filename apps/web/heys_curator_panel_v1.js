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
    { state: 'in_corridor', title: 'В коридоре', chip: 'в коридоре' },
    { state: 'collecting', title: 'Копят данные', chip: 'копят' },
    // Последняя группа названа по факту: туда попадают клиенты, по которым
    // решение принято не сегодня, а раньше, — это остаточное состояние
    // цепочки, а не «у всех идеально».
    { state: 'fine', title: 'Решение принято ранее', chip: 'решение принято' }
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
      case 'in_corridor':
        // Расчёт в зоне — не «сошлось само собой», а «разница есть, но она
        // меньше зоны». Куратор видит и разницу, и норму, и что делать нечего.
        // Слова «в коридоре» в строке нет: их только что сказал заголовок
        // группы над ней, и повтор съедает место у чисел.
        return 'разница ' + String(row.driftPct).replace('.', ',')
          + ' %' + (rec ? ' · норма ' + nbsp(rec.norm) : '');
      case 'fine':
        // Развёрнутая группа без этой строки давала имя и пустую точку рядом:
        // строка есть, сказать ей нечего. «Всё ровно» — это результат расчёта
        // (шаг вышел нулевым), и он называется тем же числом нормы.
        return rec ? 'норма ' + nbsp(rec.norm) + ' · расчёт сошёлся' : 'расчёт сошёлся';
      default:
        return '';
    }
  }

  /**
   * «По шести решение принято раньше» — счёт словом, как в кадре.
   *
   * Цифра здесь читается счётчиком уведомлений («по 6 решение»), а строка
   * говорит не о количестве работы, а о её отсутствии. Словами до десяти,
   * дальше цифрой: одиннадцать прописью длиннее, чем полезнее.
   */
  const WORDS = ['ноль', 'одному', 'двум', 'трём', 'четырём', 'пяти', 'шести',
    'семи', 'восьми', 'девяти', 'десяти'];

  function byWord(n) {
    const who = n <= 10 ? WORDS[n] : String(n);
    return 'По ' + who + ' решение принято раньше';
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

    const [allRows, setRows] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [sheet, setSheet] = React.useState(null);
    const [filter, setFilter] = React.useState(null);
    const [fineOpen, setFineOpen] = React.useState(false);
    const [tick, setTick] = React.useState(0);
    // Отрезок запоминается тот самый, по которому сервер отдал окно: лист
    // подписывает его датами, и пересчитать «примерно те же» значило бы
    // подписать одно окно датами другого.
    const [range, setRange] = React.useState(null);
    // Ленивый кусок тянем один раз: без этого неудачная загрузка крутила бы
    // перерисовку по кругу.
    const waitedForEngine = React.useRef(false);

    React.useEffect(() => {
      let cancelled = false;
      const api = HEYS.YandexAPI;
      const build = HEYS.NormCorrection && HEYS.NormCorrection.buildPanelRows;
      if (!api || !api.getClientsWindow) {
        setError('modules');
        return undefined;
      }
      // Движок поправки, рабочие веса и тренд веса едут ленивым куском
      // (postboot-3-ui-lazy), а сама панель живёт в boot-app и рисуется
      // раньше. Раньше это читалось как «панель не загрузилась» — и читалось
      // навсегда, потому что проверка была разовой. Тянем кусок и
      // перерисовываемся; вторая неудача — уже настоящая поломка.
      if (!build) {
        const loader = HEYS.__loadPostboot3Ui;
        if (waitedForEngine.current || typeof loader !== 'function') {
          setError('modules');
          return undefined;
        }
        waitedForEngine.current = true;
        Promise.resolve(loader())
          .catch(() => null)
          .then(() => { if (!cancelled) setTick((t) => t + 1); });
        return () => { cancelled = true; };
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
        // Сервер отдаёт всех клиентов куратора; показываем только тех, кого
        // показывает кабинет. Фильтр применяется ниже, при отрисовке: список
        // может доехать позже ответа сервера.

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
        // Хозяин решения едет вместе с ним: в истории «применил» без него
        // одинаково подходит куратору и клиенту, а это разные вещи.
        weeks: [{ weekLabel, factor: result.nextFactor, what, by: 'curator', at: now }],
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
      // Счёт бывает числом и бывает словом «нет»: слово красится приглушённо,
      // потому что акцент в списке значит «есть на что нажать».
      value != null ? h('span', {
        className: 'cur-row__count' + (typeof value === 'number' && value > 0 ? '' : ' cur-row__count--muted')
      }, value) : null
    );

    if (error === 'modules') {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__stub' }, 'Панель не загрузилась'));
    }
    // Сервер отказал — это надо сказать и дать повторить. Раньше ветки не было
    // вовсе: setError('load') отрабатывал, rows оставались пустыми, и экран
    // навсегда застревал на «Считаем…» — состоянии, которое обещает, что
    // сейчас всё появится.
    if (error === 'load') {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__empty' },
          h('div', { className: 'cur-panel__empty-title' }, 'Данные не пришли'),
          h('div', { className: 'cur-panel__empty-note' },
            'Сервер не ответил на запрос окна или профилей. Панель считает по ним'
            + ' и без них показывать нечего.'),
          h('button', {
            type: 'button',
            className: 'cur-panel__retry',
            onClick: () => { setError(null); setTick((t) => t + 1); }
          }, 'Повторить')
        )
      );
    }
    // Пока едет движок, у панели нет ни строк, ни ошибки — это то же «считаем»,
    // что и во время запроса.
    if (!allRows) {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__stub' }, 'Считаем…'));
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

    // Панель не показывает больше, чем кабинет: dev-фикстуры скрыты фильтром
    // кабинета, и строка по клиенту, которого нет в списке, спорила бы с числом
    // клиентов в шапке над ней. Заодно исчезает «Клиент» вместо имени.
    const known = new Set((clients || []).map((c) => c && c.id).filter(Boolean));
    const rows = allRows.filter((r) => known.has(r.clientId));
    if (!rows.length) {
      return h('div', { className: 'cur-panel' },
        h('div', { className: 'cur-panel__empty' },
          h('div', { className: 'cur-panel__empty-title' }, 'По вашим клиентам данных нет'),
          h('div', { className: 'cur-panel__empty-note' },
            'Сервер ответил, но ни одной строки по клиентам из списка не пришло.')
        )
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

    // Порог именно половина: копят больше половины — карточка поднимается над
    // всем списком, потому что иначе куратор читает её после трёх групп и уже
    // успел удивиться пустым числам. При меньшей доле она остаётся у своей
    // группы: карточка на пол-экрана отодвинула бы вниз тех, по кому нужно
    // решение, а тревожное и спокойное не занимают одинаковое место.
    const gatesOnTop = collecting.length * 2 > rows.length;

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
      agePill(row) ? h('span', {
        className: 'cur-row__age'
          + (['decided_today', 'collecting', 'in_corridor'].includes(row.state) ? ' is-data' : '')
          + (['decided_today', 'collecting'].includes(row.state) ? ' is-strong' : '')
      }, agePill(row)) : null
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

      !filter && gatesOnTop ? gatesCard : null,

      // Группа — одна карточка с разделителями, а не стопка отдельных плиток:
      // так кадр канваса и читает список, и счёт группы относится к карточке,
      // а не к воздуху между плитками.
      filter
        ? h('div', { className: 'cur-group__card' }, (byState.get(filter) || []).map(renderRow))
        : GROUPS.filter((g) => g.state !== 'fine' && (byState.get(g.state) || []).length)
          .map((g) => h(React.Fragment, { key: g.state },
            h('div', { className: 'cur-group__title' }, g.title + ' · ' + byState.get(g.state).length),
            g.state === 'collecting' && !gatesOnTop ? gatesCard : null,
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
          h('span', null, byWord(fine.length)),
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

        // Порядок листа — контракта поправки, а не кабинета: он назван
        // главным по карточке в обоих канвасах («при расхождении верен он»).
        // Сначала два числа, потом сам процент расхождения, потом где он может
        // сидеть, потом на чём считали, и только затем предложение.
        // Данных мало — лист говорит это заголовком, а не показывает пустые
        // блоки. Кадр «Куратор · данных не хватает»: почему не считаем, чего
        // именно не хватает и что с этим делать.
        card.status === 'not_enough_data' ? h('div', { className: 'cur-sheet__gap' },
          h('div', { className: 'cur-sheet__gap-title' }, 'Поправку не считаем'),
          h('div', { className: 'cur-sheet__gap-body' }, card.reason),
          // Что будет дальше — обязательно: без этого «не считаем» читается как
          // поломка, а не как ожидание данных.
          h('div', { className: 'cur-sheet__gap-note' },
            'Норма остаётся прежней. Карточка вернётся, когда окно наберёт данные.')
        ) : null,

        h('div', { className: 'cur-sheet__tier' }, 'Норма против факта'),

        h('div', { className: 'cur-sheet__facts' },
          // Подпись под меткой берётся у движка, а не пишется здесь заново:
          // «BMR + шаги + тренировки» и «съедено минус движение веса» — слова
          // контракта, и второй их экземпляр в разметке разошёлся бы.
          card.formula ? factRow(React, 'Формула говорит', nbsp(card.formula.value),
            card.formula.source) : null,
          // Факт тоном акцента: тон разводит расчёт и измерение — иначе два
          // числа подряд читаются как одна величина, померенная дважды.
          card.fact ? factRow(React, 'Факт говорит', nbsp(card.fact.value),
            card.fact.source, 'fact') : null
        ),

        // Расхождение — отдельной плашкой, а не строкой среди прочих: это то
        // число, ради которого лист открыли. Диапазон назван тут же, иначе
        // «8 %» не говорит, много это или в порядке вещей.
        card.mismatchPct != null ? h('div', { className: 'cur-sheet__mismatch' },
          h('div', { className: 'cur-sheet__mismatch-row' },
            h('span', { className: 'cur-sheet__fact-label' }, 'Расхождение'),
            // С десятой, как дрейф в строке панели: целые проценты округляли
            // 0,5 до 1, и строка спорила с листом об одном числе.
            h('span', { className: 'cur-sheet__mismatch-value' },
              String(Math.abs(card.mismatchPctExact != null
                ? card.mismatchPctExact
                : card.mismatchPct)).replace('.', ',') + ' %')
          ),
          h('div', { className: 'cur-sheet__mismatch-note' },
            card.status === 'out_of_range'
              ? 'Вышло за рабочий диапазон 0,90–1,15 — поправка не идёт:'
                + ' за его пределами вероятнее ошибка данных, чем экзотический обмен.'
              : 'Внутри рабочего диапазона 0,90–1,15: формула ошибается на'
                + ' человеке примерно на столько же. За его пределами поправка'
                + ' не идёт — там вероятнее ошибка данных, чем экзотический обмен.')
        ) : null,

        // Только куратору: строка про то, где сидит расхождение, клиенту не
        // показывается никогда. Заголовок и сноска обязательны контрактом: без
        // них проза читается как вывод о клиенте, а это вывод о том, что чинить.
        card.whereMismatchSits
          ? h('div', { className: 'cur-sheet__where' },
            h('div', { className: 'cur-sheet__where-title' }, 'Где может сидеть расхождение'),
            h('div', { className: 'cur-sheet__where-body' }, card.whereMismatchSits),
            h('div', { className: 'cur-sheet__where-note' },
              'Клиенту эта строка не показывается: она про выбор лечения, а не про клиента.')
          )
          : null,

        card.quality && card.quality.length ? h(React.Fragment, null,
          // Кадр нехватки называет этот блок иначе: там он не описывает
          // качество, а перечисляет, чего именно не хватает.
          h('div', { className: 'cur-sheet__tier' },
            card.status === 'not_enough_data' ? 'Чего не хватает' : 'Качество данных'),
          // Контракт поправки: качество данных словом «хватает» или «мало».
          // Дробь «21 из 10» здесь читалась так же плохо, как «дни 11 из 10» в
          // самой панели: счёт обгоняет собственный знаменатель. Тон при этом
          // контрактный — набрано зелёным, не набрано предупреждением.
          h('div', { className: 'cur-sheet__facts' },
            card.quality.map((q) => factRow(React, q.label,
              q.enough
                ? q.value + ' · хватает'
                : q.value + ' · мало, нужно ' + q.need,
              null, q.enough ? 'ok' : 'warn'))
          )
        ) : null,

        // Предложение — главным числом, а не третьей строкой среди расходов:
        // «в первом слое остаётся вывод и действие». Рядом Δ и действующая
        // норма, чтобы новое число было с чем сравнить.
        rec ? h('div', { className: 'cur-sheet__rec' },
          h('div', { className: 'cur-sheet__rec-head' },
            h('span', { className: 'cur-sheet__rec-value' }, nbsp(rec.norm)),
            rec.deltaKcal
              ? h('span', {
                className: 'cur-sheet__rec-delta' + (rec.deltaKcal > 0 ? ' is-up' : '')
              }, (rec.deltaKcal > 0 ? '+' : '\u2212')
                + Math.abs(rec.deltaKcal) + ' ккал в день')
              : null
          ),
          // Подпись про дефицит обязательна: иначе норма читается как третий
          // расход, а в ней дефицит уже вычтен. «Станет» обещает изменение —
          // при неизменной норме слово лжёт, поэтому его тут нет вовсе.
          h('div', { className: 'cur-sheet__rec-caption' },
            (rec.norm === rec.currentNorm
              ? 'норма дня остаётся'
              : 'норма дня · сейчас ' + nbsp(rec.currentNorm))
            + ' · с дефицитом ' + (rec.deficitPct > 0 ? '+' : '\u2212')
            + Math.abs(rec.deficitPct) + ' %'),

          h('div', { className: 'cur-sheet__rec-split' }),

          h('div', { className: 'cur-sheet__rec-row' },
            h('span', { className: 'cur-sheet__fact-label' }, 'Поправка этой недели'),
            // Два знака всегда: «×1» в колонке рядом с «×0,97» читается как
            // другая величина, а не как «поправки нет».
            h('span', { className: 'cur-sheet__rec-num' },
              '\u00d7' + rec.stepFactor.toFixed(2).replace('.', ','))
          ),
          rec.correctedExpenditure ? h('div', { className: 'cur-sheet__rec-row' },
            h('span', { className: 'cur-sheet__fact-label' }, 'Расход после поправки'),
            h('span', { className: 'cur-sheet__rec-num' }, nbsp(rec.correctedExpenditure))
          ) : null,
          // Цель показывается только когда шаг её не догнал. Совпадая с
          // применяемым, она была дублем — и заставляла искать разницу там,
          // где её нет.
          card.stepCapped ? h('div', { className: 'cur-sheet__rec-row' },
            h('span', { className: 'cur-sheet__fact-label' }, 'Цель поправки'),
            h('span', { className: 'cur-sheet__rec-num is-target' },
              '\u00d7' + String(rec.targetFactorShown).replace('.', ','))
          ) : null,

          card.stepCapped
            ? h('div', { className: 'cur-sheet__rec-note' },
              'Шаг ограничен тремя процентами: до цели дойдём примерно за три'
              + ' недели. Остаток догоним в следующие сверки, если расхождение'
              + ' сохранится.')
            : null,
          // Молчать здесь нельзя: куратор видит расхождение в 1–2 % и не
          // понимает, почему поправка равна единице и решать нечего.
          row.result && row.result.deadZone
            ? h('div', { className: 'cur-sheet__rec-note' },
              'Расхождение до 2 % считаем совпадением: на таком отрезке это шум'
              + ' записей и весов, а не обмен. Норма остаётся прежней, решать'
              + ' нечего.')
            : null,
          h('div', { className: 'cur-sheet__rec-note' },
            'Дефицит поправка не трогает: он остаётся обещанием клиенту.'
            + ' Меняется только расход, от которого он считается.'),
          rec.hitFloor
            ? h('div', { className: 'cur-sheet__rec-note' },
              'Норма упёрлась в базовый обмен — ниже него поправка не опускает'
              + ' ни при каком расчёте.')
            : null
        ) : null,

        // Механизм показан столбцом сразу, а не за раскрывашкой: решение
        // владельца 30 августа. Куратор решает не по итогу, а по тому, откуда
        // итог взялся, и прятать это значило бы прятать сам предмет решения.
        // Лист прокручивается — высота ему не предел. Свернуть в аккордеон
        // можно потом, если станет мешать.
        (card.expenditureParts || card.path) ? h(React.Fragment, null,
          h('div', { className: 'cur-sheet__how-body' },

            card.expenditureParts && card.expenditureParts.length ? h(React.Fragment, null,
              h('div', { className: 'cur-sheet__how-title' }, 'Из чего расход'),
              h('div', { className: 'cur-sheet__bars' },
                card.expenditureParts.map((p) => h('div', { key: p.key, className: 'cur-sheet__bar-row' },
                  h('span', { className: 'cur-sheet__bar-label' }, p.label),
                  h('span', { className: 'cur-sheet__bar' },
                    h('span', {
                      className: 'cur-sheet__bar-fill',
                      style: { width: p.sharePct + '%' }
                    })
                  ),
                  h('span', { className: 'cur-sheet__bar-value' }, nbsp(p.value)),
                  h('span', { className: 'cur-sheet__bar-share' }, p.sharePct + ' %')
                ))
              )
            ) : null,

            card.path ? h(React.Fragment, null,
              h('div', { className: 'cur-sheet__how-title' }, 'Как получился факт'),
              h('div', { className: 'cur-sheet__facts' },
                factRow(React, 'Съедено в среднем', nbsp(card.path.eatenPerDay) + ' ккал'),
                // Знак объясняем словом, а не минусом: «вес ушёл» и «запас
                // отдал энергию» — это одно и то же, но минус перед числом
                // читается как ошибка.
                card.path.deltaKg != null
                  ? factRow(React, 'Вес за окно',
                    // Один знак всегда: «−1 кг» в колонке рядом с «−0,2 кг»
                    // читается как число другой точности.
                    (card.path.deltaKg > 0 ? '+' : '−')
                    + Math.abs(card.path.deltaKg).toFixed(1).replace('.', ',')
                    + ' кг')
                  : null,
                card.path.storedPerDay
                  ? factRow(React,
                    card.path.storedPerDay < 0 ? 'Запас отдал' : 'Запас принял',
                    nbsp(Math.abs(card.path.storedPerDay)) + ' ккал в день')
                  : null,
                card.fact ? factRow(React, 'Факт', nbsp(card.fact.value) + ' ккал') : null
              ),
              h('div', { className: 'cur-sheet__how-note' },
                'Факт — это съеденное минус то, что ушло из запаса: вес двигается'
                + ' только на разнице между съеденным и потраченным.')
            ) : null
          )
        ) : null,

        // История решений: без неё лист не отвечает на вопрос «что я решал в
        // прошлый раз», и куратор решает заново каждую неделю. Точка недели
        // стоит по шкале между 1,00 и целью — долю считает движок, чтобы
        // рисующий не выдумывал её сам.
        (card.history && card.history.length)
          ? h(React.Fragment, null,
            h('div', { className: 'cur-sheet__tier' }, 'История поправки'),
            h('div', { className: 'cur-sheet__hist' },
              historyChart(React, card.history),
              h('div', { className: 'cur-sheet__hist-legend' },
                h('span', null, 'пунктир сверху — 1,00'),
                h('span', { className: 'is-target' },
                  'пунктир снизу — цель ×'
                  + (rec ? String(rec.targetFactorShown).replace('.', ',') : '—'))
              ),
              h('div', { className: 'cur-sheet__hist-dates' },
                card.history.slice().reverse().map((w) => h('span', { key: w.weekLabel },
                  w.weekLabel))
              )
            ),
            h('div', { className: 'cur-sheet__facts' },
              card.history.map((w) => h('div', {
                className: 'cur-sheet__fact', key: w.weekLabel
              },
                h('span', { className: 'cur-sheet__fact-label' }, w.weekLabel),
                h('span', { className: 'cur-sheet__hist-what' },
                  h('span', { className: 'cur-sheet__hist-factor' },
                    '\u00d7' + w.factor.toFixed(2).replace('.', ',')),
                  h('span', { className: 'cur-sheet__hist-who' }, w.whatWord)
                )
              ))
            ),
            h('div', { className: 'cur-sheet__how-note' },
              'Видно и то, что система предложила, и то, что человек с этим сделал.')
          )
          : null,

        // Действия прилипают к низу листа: разбор расчёта сделал лист длинным,
        // и главное действие уехало за прокрутку. Читать механизм и решать —
        // одно движение, а не два.
        h('div', { className: 'cur-sheet__actions' },
          // Ряд решений показывается по действиям карточки, а не по наличию
          // предложения: внутри мёртвой зоны предложение есть (норма дня), а
          // решать нечего — применение не сдвинуло бы её ни на калорию.
          (card.actions || []).length ? h(React.Fragment, null,
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
      )
    );
  }

  /**
   * Ступенька истории поправки между двумя пунктирами.
   *
   * Верхний пунктир — единица, нижний — цель; точка недели стоит по доле пути
   * между ними, и долю считает движок (scaleShare). Своей арифметики здесь нет:
   * масштаб — утверждение о данных, и рисующий его не выбирает.
   */
  function historyChart(React, history) {
    const W = 262;
    const TOP = 16;
    const BOTTOM = 46;
    // История приходит от свежей недели к старой — рисуем слева направо.
    const weeks = history.slice().reverse();
    const x = (i) => (weeks.length > 1 ? 4 + (i * (W - 8)) / (weeks.length - 1) : W / 2);
    const y = (w) => TOP + (Number(w.scaleShare) || 0) * (BOTTOM - TOP);
    const d = weeks.map((w, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(w).toFixed(1)).join(' ');
    const last = weeks[weeks.length - 1];
    const dash = (cy, className) => React.createElement('line', {
      className: 'cur-sheet__hist-dash' + (className ? ' ' + className : ''),
      x1: 4, y1: cy, x2: W - 4, y2: cy
    });
    return React.createElement('svg', {
      className: 'cur-sheet__hist-svg',
      viewBox: '0 0 ' + W + ' 60', width: '100%', height: 60,
      role: 'img',
      'aria-label': 'История поправки за ' + weeks.length + ' нед.'
    },
      dash(TOP),
      dash(BOTTOM, 'is-target'),
      React.createElement('path', { className: 'cur-sheet__hist-line', d, fill: 'none' }),
      React.createElement('circle', {
        className: 'cur-sheet__hist-dot',
        cx: x(weeks.length - 1).toFixed(1), cy: y(last).toFixed(1), r: 4
      })
    );
  }

  /**
   * Строка «ключ · значение» листа.
   *
   * tone — роль числа, а не украшение: 'fact' разводит измерение и расчёт,
   * 'ok' и 'warn' говорят о гейте данных. Без тона число нейтрально.
   */
  function factRow(React, label, value, hint, tone) {
    return React.createElement('div', { className: 'cur-sheet__fact', key: label },
      React.createElement('span', { className: 'cur-sheet__fact-copy' },
        React.createElement('span', { className: 'cur-sheet__fact-label' }, label),
        // Подпись под меткой — там, где иначе пришлось бы догадываться: «норма
        // дня» стоит рядом с двумя числами расхода и читается как третье
        // число расхода, хотя дефицит в ней уже вычтен.
        hint ? React.createElement('span', { className: 'cur-sheet__fact-hint' }, hint) : null
      ),
      React.createElement('span', {
        className: 'cur-sheet__fact-value' + (tone ? ' is-' + tone : '')
      }, value)
    );
  }

  HEYS.CuratorPanel = {
    windowDays,
    windowRange,
    shortRange,
    GROUPS,
    Component: CuratorPanel,
    // Лист наружу — ради рендер-теста: чтение исходника не показывает, что из
    // полутора десятков условных веток получается на экране.
    Sheet: CuratorPanelSheet,
    stateLine,
    agePill,
    initials
  };

  console.info('[HEYS.curatorPanel] ✅ loaded');
})(typeof window !== 'undefined' ? window : globalThis);
