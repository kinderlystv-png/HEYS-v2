// heys_day_pickers.js — DatePicker and Calendar components

;(function(global){
  // heys_day_pickers.js — DatePicker и Calendar компоненты
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  // Lazy getter for dayUtils (loaded asynchronously)
  const getDayUtils = () => HEYS.dayUtils || {};

  function formatStreakDayLabel(count) {
    const n = Math.abs(Number(count)) || 0;
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'день';
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'дня';
    return 'дней';
  }

  // Компактный DatePicker с dropdown
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях (опционально)
  // getActiveDaysForMonth: (year, month) => Map — функция для загрузки данных при смене месяца
  function DatePicker({valueISO, onSelect, onRemove, activeDays, getActiveDaysForMonth}) {
    const hasDayUtils = () => {
      const u = getDayUtils();
      return !!(u.parseISO && u.todayISO && u.fmtDate);
    };
    const [utilsReady, setUtilsReady] = React.useState(hasDayUtils);
    React.useEffect(() => {
      if (utilsReady) return undefined;
      if (hasDayUtils()) {
        setUtilsReady(true);
        return undefined;
      }
      let cancelled = false;
      const timerId = setInterval(() => {
        if (cancelled) return;
        if (hasDayUtils()) {
          cancelled = true;
          clearInterval(timerId);
          setUtilsReady(true);
        }
      }, 16);
      const stopId = setTimeout(() => {
        cancelled = true;
        clearInterval(timerId);
      }, 3000);
      return () => {
        cancelled = true;
        clearInterval(timerId);
        clearTimeout(stopId);
      };
    }, [utilsReady]);

    if (!utilsReady) {
      return React.createElement('div', {
        className: 'date-picker date-picker--v4 date-picker--pending',
        'aria-hidden': 'true'
      },
        React.createElement('div', { className: 'date-picker-row date-picker-row--placeholder' },
          React.createElement('span', { className: 'date-picker-day-nav date-picker-day-nav--placeholder v4-place-holder' }),
          React.createElement('span', { className: 'date-picker-trigger date-picker-trigger--placeholder v4-place-holder' }),
          React.createElement('span', { className: 'date-picker-day-nav date-picker-day-nav--placeholder v4-place-holder' })
        )
      );
    }

    const utils = getDayUtils();
    if (!utils.parseISO || !utils.todayISO || !utils.fmtDate) {
      console.error('[heys_day_pickers] dayUtils not loaded yet');
      return null;
    }
    const { parseISO, todayISO, calendarTodayISO, fmtDate, formatDateHeaderRow, getNextDay, getPrevDay, scheduleNightBoundaryRefresh } = utils;
    
    const [isOpen, setIsOpen] = React.useState(false);
    const [, setNightBoundaryTick] = React.useState(0);
    React.useEffect(() => {
      if (!scheduleNightBoundaryRefresh) return undefined;
      return scheduleNightBoundaryRefresh(() => setNightBoundaryTick((value) => value + 1));
    }, [scheduleNightBoundaryRefresh]);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const [tooltip, setTooltip] = React.useState(null); // { x, y, text }
    const [monthData, setMonthData] = React.useState(null); // Данные для текущего месяца календаря
    const wrapperRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    // Контракт «повторный тап и поворот» → home-widgets «повторный тап · правило
    // продукта»: 350 мс защиты там, где повтор создаёт лишнюю сущность. Местное
    // отличие явно исключает стрелки даты («защиты у стрелок нет — быстрое
    // листание… частыми тапами»), поэтому окно ставится только на выбор клетки
    // календаря — единственное действие в этом компоненте без такого исключения.
    const lastDayPickRef = React.useRef(0);
    
    const y = cur.getFullYear(), m = cur.getMonth();
    
    // Контракт date-remainders, строка «откуда данные»: точки берутся из
    // локальной истории, а месяц догружается из облака ПРИ ОТКРЫТИИ ШТОРКИ —
    // пришедшие дни дорисовываются точками на месте. Локальный расчёт идёт и
    // при закрытой шторке (он дешёвый и синхронный), сетевой запрос — нет:
    // закрытая капсула сетку не показывает, и месяц грузился бы впустую на
    // каждом старте и на каждом переходе стрелкой через границу месяца.
    React.useEffect(() => {
      if (!getActiveDaysForMonth) return;
      let cancelled = false;
      const applyLocal = () => {
        if (cancelled) return;
        try {
          setMonthData(getActiveDaysForMonth(y, m));
        } catch (e) {
          setMonthData(null);
        }
      };
      applyLocal();
      if (!isOpen) return () => { cancelled = true; };
      const dim = new Date(y, m + 1, 0).getDate();
      const datesInMonth = [];
      for (let d = 1; d <= dim; d += 1) {
        datesInMonth.push(fmtDate(new Date(y, m, d)));
      }
      const cloud = global.HEYS && global.HEYS.cloud;
      if (cloud && typeof cloud.fetchDays === 'function' && navigator.onLine) {
        cloud.fetchDays(datesInMonth).finally(() => {
          if (!cancelled) applyLocal();
        });
      }
      return () => { cancelled = true; };
    }, [y, m, isOpen, getActiveDaysForMonth, fmtDate]);
    
    // Преобразуем activeDays в Map (fallback если нет getActiveDaysForMonth)
    const daysDataMap = React.useMemo(() => {
      // Приоритет: данные для текущего месяца → переданные activeDays
      if (monthData instanceof Map) return monthData;
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [monthData, activeDays]);
    
    // Streak / tooltip по-прежнему через ratioZones; заливка ratio в сетке шторки
    // снята (вариант А, канвас 2026-08-11) — качество живёт в Отчётах.
    const rz = HEYS.ratioZones;

    // Вычисляем streak (серию хороших дней) — используем ratioZones.isSuccess()
    const streakInfo = React.useMemo(() => {
      if (daysDataMap.size === 0) return { count: 0, isActive: false };
      
      let count = 0;
      let checkDate = new Date();
      checkDate.setHours(12);
      
      // Проверяем дни назад от сегодня
      for (let i = 0; i < 30; i++) {
        const dateStr = fmtDate(checkDate);
        const dayData = daysDataMap.get(dateStr);
        
        // Хороший день = isSuccess из ratioZones (good или perfect)
        if (dayData && rz && rz.isSuccess(dayData.ratio)) {
          count++;
        } else if (i > 0) { // Первый день (сегодня) может быть без данных
          break;
        }
        
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      return { count, isActive: count > 0 };
    }, [daysDataMap, fmtDate]);
    
    React.useEffect(() => { setCur(parseISO(valueISO || todayISO())); }, [valueISO]);

    // Контракт date-remainders, «safe-area и кнопка назад»: аппаратная кнопка
    // назад / жест на Android закрывают шторку календаря, а не уводят с экрана.
    // Паттерн — heys_widgets_ui_v1.js (карточка «Ещё»): pushState-метка при
    // открытии, popstate закрывает лист; при закрытии из UI сами же уводим
    // историю на шаг назад, чтобы не оставлять «пустую» запись за собой.
    React.useEffect(() => {
      if (!isOpen) return undefined;
      const onPopState = () => { setIsOpen(false); setTooltip(null); };
      window.addEventListener('popstate', onPopState);
      try {
        window.history.pushState({ heysDateSheet: true }, '');
      } catch (_e) { /* история недоступна — остальные пути закрытия работают */ }
      return () => {
        window.removeEventListener('popstate', onPopState);
        try {
          if (window.history.state?.heysDateSheet) window.history.back();
        } catch (_e) { /* ignore */ }
      };
    }, [isOpen]);

    // Контракт date-remainders, «вид шторки календаря»: лист прижат к низу
    // экрана. Прежде это был popover, и CSS-переменная якоря вела его за низом
    // строки даты при прокрутке и ресайзе — нижнему листу якорь не нужен,
    // поэтому синхронизации (resize + scroll capture) больше нет.

    const first = new Date(y, m, 1), start = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));
    
    function same(a, b) {
      return a && b && a.getFullYear() === b.getFullYear() && 
             a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    
    const sel = parseISO(valueISO || todayISO());
    const today = parseISO(todayISO()); // Учитываем ночной порог (до 3:00 = вчера)
    const headerRow = formatDateHeaderRow
      ? formatDateHeaderRow(valueISO || todayISO())
      : { main: valueISO || todayISO(), relative: null, isToday: true };
    
    // Проверяем, показывается ли текущий месяц
    const isCurrentMonth = y === today.getFullYear() && m === today.getMonth();
    
    // Обработчик hover для tooltip
    const handleDayHover = (e, dayData, dateStr) => {
      if (!dayData) {
        setTooltip(null);
        return;
      }
      const rect = e.target.getBoundingClientRect();
      const pct = Math.round(dayData.ratio * 100);
      const status = dayData.ratio > 1.15 ? 'переел' : 
                    dayData.ratio > 1 ? 'чуть больше' :
                    dayData.ratio >= 0.9 ? 'отлично!' :
                    dayData.ratio >= 0.75 ? 'хорошо' : 'мало';
      setTooltip({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        text: `${dayData.kcal} ккал (${pct}%) — ${status}`
      });
    };
    
    const isTodaySelected = headerRow.isToday;
    const currentISO = valueISO || todayISO();
    const todayStr = todayISO();
    const calendarToday = calendarTodayISO ? calendarTodayISO() : todayStr;
    const canGoNext = currentISO < calendarToday;
    const triggerToneClass = headerRow.isNightLabel
      ? ' date-picker-trigger--night'
      : (isTodaySelected ? ' date-picker-trigger--today' : ' date-picker-trigger--not-today');

    const handlePrevDay = (e) => {
      e.stopPropagation();
      onSelect(getPrevDay(currentISO));
    };
    const handleNextDay = (e) => {
      e.stopPropagation();
      if (!canGoNext) return;
      onSelect(getNextDay(currentISO));
    };

    function navChevron(direction) {
      return React.createElement('svg', {
        className: 'date-picker-day-nav-icon',
        viewBox: '0 0 24 24',
        width: 14,
        height: 14,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.75,
        strokeLinecap: 'round',
        'aria-hidden': 'true'
      }, React.createElement('path', {
        d: direction === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'
      }));
    }

    function calendarIconSvg() {
      return React.createElement('svg', {
        className: 'date-picker-icon',
        width: 12,
        height: 12,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true'
      },
        React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 4 }),
        React.createElement('path', { d: 'M8 3v4M16 3v4M3 11h18' })
      );
    }

    // Контракт date-remainders, строка «доступность»: капсула озвучивает полную дату
    // («воскресенье, 16 августа»), а не слово «Сегодня» — слово остаётся видимым,
    // но экранному диктору нужна дата. Ночная капсула сама себя называет одной строкой.
    const fullDateSpeech = headerRow.isNightLabel
      ? headerRow.main
      : sel.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

    const handleInlineToday = (e) => {
      e.stopPropagation();
      if ((valueISO || todayStr) !== todayStr) onSelect(todayStr);
      setIsOpen(false);
    };

    // Контракт «вид чужого дня»: тинт берут капсула И ОБА КРУЖКА. Кружки —
    // соседи капсулы, поэтому состояние поднимается на корень модификатором.
    const isPastDay = !isTodaySelected && !headerRow.isNightLabel;

    return React.createElement('div', {
      className: 'date-picker date-picker--v4' + (isPastDay ? ' date-picker--past' : ''),
      ref: wrapperRef
    },
      React.createElement('div', { className: 'date-picker-row' },
        React.createElement('button', {
          type: 'button',
          className: 'date-picker-day-nav',
          onClick: handlePrevDay,
          title: 'Предыдущий день',
          'aria-label': 'Предыдущий день'
        }, navChevron('left')),
        React.createElement('div', {
          ref: triggerRef,
          className: 'date-picker-trigger' + (isOpen ? ' open' : '') + triggerToneClass
        },
          React.createElement('button', {
            type: 'button',
            className: 'date-picker-trigger-lbl',
            onClick: () => setIsOpen(!isOpen),
            'aria-expanded': isOpen,
            'aria-haspopup': 'dialog',
            'aria-label': fullDateSpeech
          },
            React.createElement('span', { className: 'date-picker-lbl-inner' },
              calendarIconSvg(),
              headerRow.weekendAbbr
                ? React.createElement('span', {
                  className: 'date-picker-main date-picker-main--past'
                },
                  React.createElement('span', { className: 'date-picker-weekend-abbr' }, headerRow.weekendAbbr),
                  `, ${sel.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`
                )
                : React.createElement('span', {
                  className: 'date-picker-main' + (isTodaySelected && !headerRow.isNightLabel ? ' date-picker-main--today' : ' date-picker-main--past')
                }, headerRow.main)
            )
          ),
          !isTodaySelected && React.createElement('button', {
            type: 'button',
            className: 'date-picker-inline-today',
            onClick: handleInlineToday
          }, 'Сегодня')
        ),
        React.createElement('button', {
          type: 'button',
          // Контракт «доступность»: погашенная стрелка помечается aria-disabled и
          // сохраняет подпись «Следующий день» — прежние disabled + «Уже сегодня»
          // выбрасывали её из дерева доступности и подменяли название состоянием.
          // Гашение и защита от нажатия остаются на классе (opacity + pointer-events).
          className: 'date-picker-day-nav' + (canGoNext ? '' : ' date-picker-day-nav--disabled'),
          onClick: handleNextDay,
          'aria-disabled': canGoNext ? undefined : 'true',
          title: 'Следующий день',
          'aria-label': 'Следующий день'
        }, navChevron('right'))
      ),
      // Backdrop и Dropdown через portal в body
      isOpen && ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { 
            className: 'date-picker-backdrop date-picker-backdrop--v4-modal',
            ...(window.HEYS?.ModalDismiss?.reactBackdropDismiss
              ? window.HEYS.ModalDismiss.reactBackdropDismiss(() => { setIsOpen(false); setTooltip(null); })
              : { onClick: () => { setIsOpen(false); setTooltip(null); } })
          }),
          // Tooltip
          tooltip && React.createElement('div', {
            className: 'date-picker-tooltip',
            style: { left: tooltip.x + 'px', top: tooltip.y + 'px' }
          }, tooltip.text),
          React.createElement('div', { 
            className: 'date-picker-dropdown date-picker-sheet',
          },
        React.createElement('div', { className: 'date-picker-sheet__card' },
        // Контракт «вид шторки календаря»: ручка 38×4 тоном чернил 14 %.
        // У popover'а её не было — нижний лист без неё не читается как лист.
        React.createElement('div', { className: 'date-picker-sheet-handle', 'aria-hidden': 'true' }),
        React.createElement('div', { className: 'date-picker-header' },
          React.createElement('button', {
            type: 'button',
            className: 'date-picker-day-nav date-picker-sheet-month-nav',
            onClick: () => setCur(new Date(y, m - 1, 1)),
            'aria-label': 'Предыдущий месяц',
            title: 'Предыдущий месяц'
          }, navChevron('left')),
          React.createElement('span', { className: 'date-picker-title' },
            cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }),
            (() => {
              const CycleUI = HEYS.CycleUI;
              if (!CycleUI?.findLastCycleMarkDate || !CycleUI.formatForecastMonthLine) return null;
              const lsGetFn = HEYS.lsGet || HEYS.utils?.lsGet;
              const lastMark = CycleUI.findLastCycleMarkDate(calendarToday, lsGetFn);
              if (CycleUI.shouldHideCycleForecast?.(lastMark, calendarToday, lsGetFn)) return null;
              const forecastDates = CycleUI.computeCycleForecastDates(lastMark, calendarToday);
              const label = CycleUI.formatForecastMonthLine(forecastDates);
              return label
                ? React.createElement('span', { className: 'date-picker-forecast-line' }, label)
                : null;
            })()
          ),
          React.createElement('button', {
            type: 'button',
            className: 'date-picker-day-nav date-picker-sheet-month-nav',
            onClick: () => setCur(new Date(y, m + 1, 1)),
            'aria-label': 'Следующий месяц',
            title: 'Следующий месяц'
          }, navChevron('right'))
        ),
        // Кнопка "Вернуться к сегодня" если не текущий месяц
        !isCurrentMonth && React.createElement('button', {
          className: 'date-picker-goto-today',
          onClick: () => setCur(new Date())
        }, '↩ Вернуться к сегодня'),
        React.createElement('div', { className: 'date-picker-weekdays' },
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => 
            React.createElement('div', { key: d, className: 'date-picker-weekday' }, d)
          )
        ),
        React.createElement('div', { className: 'date-picker-days' },
          (() => {
            const realCells = cells.filter(Boolean);
            const forecastDates = (() => {
              const CycleUI = HEYS.CycleUI;
              if (!CycleUI?.findLastCycleMarkDate || !CycleUI.computeCycleForecastDates) return [];
              const lsGetFn = HEYS.lsGet || HEYS.utils?.lsGet;
              const lastMark = CycleUI.findLastCycleMarkDate(calendarToday, lsGetFn);
              return CycleUI.computeCycleForecastDates(lastMark, calendarToday);
            })();
            return cells.map((dt, i) => {
            if (dt == null) {
              return React.createElement('div', { key: 'e' + i, className: 'date-picker-day empty', 'aria-hidden': 'true' });
            }
            const dateStr = fmtDate(dt);
            const dayData = daysDataMap.get(dateStr);
            const isSel = same(dt, sel);
            const isToday = same(dt, today);
            const isFuture = dateStr > calendarToday;
            const hasCycle = dayData?.cycleDay != null && dayData.cycleDay >= 1 && dayData.cycleDay <= 7;
            const hasRefeed = dayData?.isRefeedDay === true;
            const hasRealData = dayData && dayData.kcal > 0;
            const periodMeta = HEYS.CycleUI?.buildCycleRibbonMeta?.(daysDataMap, dateStr, realCells) || {};
            const forecastMeta = HEYS.CycleUI?.buildCycleForecastMeta?.(dateStr, forecastDates) || {};
            const ribbonClass = periodMeta.ribbon || forecastMeta.ribbon || '';

            const pickDay = () => {
              const now = Date.now();
              if (now - lastDayPickRef.current < 350) return;
              lastDayPickRef.current = now;
              onSelect(dateStr); setIsOpen(false); setTooltip(null);
            };
            const daySpeech = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
              + (hasRealData ? ', есть записи' : '')
              + (periodMeta.ariaSuffix || forecastMeta.ariaSuffix || '');

            return React.createElement('div', {
              key: dt.toISOString(),
              className: [
                'date-picker-day',
                isSel ? 'selected' : '',
                isToday ? 'today' : '',
                isFuture ? 'future disabled' : '',
                hasRealData ? 'has-data' : '',
                hasCycle ? 'has-cycle' : '',
                hasRefeed ? 'has-refeed' : '',
                ribbonClass
              ].join(' ').trim(),
              role: 'button',
              tabIndex: isFuture ? -1 : 0,
              'aria-label': daySpeech,
              'aria-disabled': isFuture ? 'true' : undefined,
              'aria-current': isToday ? 'date' : undefined,
              onClick: isFuture ? undefined : pickDay,
              onKeyDown: isFuture ? undefined : (e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickDay(); }
              },
              onMouseEnter: (e) => handleDayHover(e, dayData, dateStr),
              onMouseLeave: () => setTooltip(null)
            },
              React.createElement('span', { className: 'day-number' }, dt.getDate()),
              hasRealData && React.createElement('span', { className: 'day-data-dot', 'aria-hidden': 'true' })
            );
          });
          })()
        ),
        // Streak индикатор
        streakInfo.count > 1 && React.createElement('div', {
          className: 'date-picker-streak date-picker-streak--v4'
        }, `Серия · ${streakInfo.count} ${formatStreakDayLabel(streakInfo.count)}`),
        // Легенда: точка = факт записи; цикл/загрузка — форма; сегодня/выбран — навигация
        React.createElement('div', { className: 'date-picker-legend' },
          React.createElement('span', { className: 'legend-item has-data' },
            React.createElement('span', { className: 'legend-swatch legend-swatch--dot', 'aria-hidden': 'true' }),
            'есть записи'
          ),
          React.createElement('span', { className: 'legend-item cycle' },
            React.createElement('span', { className: 'legend-swatch legend-swatch--cycle', 'aria-hidden': 'true' }),
            'цикл'
          ),
          React.createElement('span', { className: 'legend-item refeed' },
            React.createElement('span', { className: 'legend-swatch legend-swatch--refeed', 'aria-hidden': 'true' }),
            'загрузка'
          ),
          // «сегодня» в сетке — это начертание 700 тоном --ac, а не плашка
          // (контракт «вид клетки»), поэтому образец легенды показывает цифру,
          // а не квадрат: иначе легенда обещала бы заливку, которой нет.
          React.createElement('span', { className: 'legend-item today' },
            React.createElement('span', { className: 'legend-swatch legend-swatch--today', 'aria-hidden': 'true' }, '7'),
            'сегодня'
          ),
          React.createElement('span', { className: 'legend-item selected' },
            React.createElement('span', { className: 'legend-swatch legend-swatch--selected', 'aria-hidden': 'true' }),
            'выбран'
          )
        ),
        React.createElement('div', { className: 'date-picker-footer' },
          React.createElement('button', {
            className: 'date-picker-btn today-btn',
            onClick: () => {
              if ((valueISO || todayStr) !== todayStr) onSelect(todayStr);
              setIsOpen(false);
            }
          }, 'Сегодня')
        )
        )
      )
    ), document.body)
    );
  }

  // Полноэкранный Calendar компонент
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях
  function Calendar({valueISO,onSelect,onRemove,activeDays}){
    const utils = getDayUtils();
    // Explicit check instead of silent fallbacks
    if (!utils.parseISO || !utils.todayISO || !utils.fmtDate) {
      console.error('[heys_day_pickers] Calendar: dayUtils not loaded yet');
      return null;
    }
    const { parseISO, todayISO, fmtDate } = utils;
    
    const [cur,setCur]=React.useState(parseISO(valueISO||todayISO()));
    React.useEffect(()=>{ setCur(parseISO(valueISO||todayISO())); },[valueISO]);
    const y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
    const cells=[]; for(let i=0;i<start;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(new Date(y,m,d));
    function same(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    const sel=parseISO(valueISO||todayISO()); const today=parseISO(todayISO()); // Учитываем ночной порог
    
    // Преобразуем activeDays в Map для быстрого поиска
    const daysDataMap = React.useMemo(() => {
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [activeDays]);
    
    // Используем централизованный ratioZones для всей логики цветов
    const rz = HEYS.ratioZones;
    
    // Проверка является ли день "успешным" (good или perfect)
    function isGoodDay(ratio) {
      return rz ? rz.isSuccess(ratio) : (ratio && ratio >= 0.75 && ratio <= 1.1);
    }
    
    // Функция для расчёта цвета фона с градиентом
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      return rz ? rz.getGradientColor(ratio, 0.35) : 'rgba(156, 163, 175, 0.35)';
    }
    
    // Вычисляем streak информацию для каждого дня
    const streakInfo = React.useMemo(() => {
      const info = new Map();
      
      // Проходим по всем дням месяца
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(y, m, d);
        const dateStr = fmtDate(dt);
        const dayData = daysDataMap.get(dateStr);
        const isGood = dayData && isGoodDay(dayData.ratio);
        
        if (!isGood) continue;
        
        // Проверяем предыдущий день
        const prevDt = new Date(y, m, d - 1);
        const prevStr = fmtDate(prevDt);
        const prevData = daysDataMap.get(prevStr);
        const prevGood = prevData && isGoodDay(prevData.ratio);
        
        // Проверяем следующий день
        const nextDt = new Date(y, m, d + 1);
        const nextStr = fmtDate(nextDt);
        const nextData = daysDataMap.get(nextStr);
        const nextGood = nextData && isGoodDay(nextData.ratio);
        
        // Определяем позицию в streak
        let streakClass = '';
        if (prevGood && nextGood) {
          streakClass = 'streak-middle'; // Середина серии
        } else if (prevGood && !nextGood) {
          streakClass = 'streak-end';    // Конец серии
        } else if (!prevGood && nextGood) {
          streakClass = 'streak-start';  // Начало серии
        }
        // Если ни prev ни next не good — одиночный день, без класса
        
        if (streakClass) {
          info.set(dateStr, streakClass);
        }
      }
      
      return info;
    }, [daysDataMap, y, m, dim, fmtDate]);
    
    return React.createElement('div',{className:'calendar card'},
      React.createElement('div',{className:'cal-head'},
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m-1,1))},'‹'),
        React.createElement('div',{className:'cal-title'},cur.toLocaleString('ru-RU',{month:'long',year:'numeric'})),
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m+1,1))},'›'),
        // Кнопка "Сегодня" — быстрый переход
        React.createElement('button',{
          className:'cal-today-btn',
          onClick:()=>onSelect(todayISO()),
          title:'Сегодня'
        },'⌂')
      ),
      React.createElement('div',{className:'cal-grid cal-dow'},['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>React.createElement('div',{key:d},d))),
      React.createElement('div',{className:'cal-grid'}, cells.map((dt,i)=> {
        if (dt == null) return React.createElement('div',{key:'e'+i});
        
        const dateStr = fmtDate(dt);
        const dayData = daysDataMap.get(dateStr);
        const isSel = same(dt, sel);
        const isToday = same(dt, today);
        const streakClass = streakInfo.get(dateStr) || '';
        
        // Стиль с градиентным фоном для заполненных дней
        const bgColor = dayData ? getDayBgColor(dayData.ratio) : null;
        const cellStyle = bgColor && !isSel ? { background: bgColor } : undefined;
        
        return React.createElement('div', {
          key: dt.toISOString(),
          className: ['cal-cell', isSel ? 'sel' : '', isToday ? 'today' : '', dayData ? 'has-data' : '', streakClass].filter(Boolean).join(' '),
          style: cellStyle,
          onClick: () => onSelect(dateStr),
          title: dayData ? `${dayData.kcal} / ${dayData.target} ккал (${Math.round(dayData.ratio * 100)}%)` : undefined
        },
          dt.getDate(),
          // Иконка огня для streak
          streakClass && React.createElement('span', { className: 'streak-fire' }, '🔥')
        );
      })),
      React.createElement('div',{className:'cal-foot'},
        React.createElement('button',{className:'btn',onClick:()=>onSelect(todayISO())},'Сегодня'),
        React.createElement('button',{className:'btn',onClick:onRemove},'Удалить')
      )
    );
  }

  // Экспортируем DatePicker для использования в шапке (legacy)
  HEYS.DatePicker = DatePicker;
  HEYS.Calendar = Calendar;

  function CycleDatePickerSheet({
    React: ReactArg,
    isOpen,
    onClose,
    onConfirm,
    valueISO,
    todayISO,
    cycleDay,
  }) {
    const R = ReactArg || React;
    if (!isOpen || !R) return null;
    const utils = getDayUtils();
    if (!utils.parseISO || !utils.fmtDate) return null;
    const { parseISO, fmtDate } = utils;
    const todayStr = todayISO || utils.todayISO?.() || utils.calendarTodayISO?.();
    const [cur, setCur] = R.useState(parseISO(valueISO || todayStr));
    const [selected, setSelected] = R.useState(valueISO || todayStr);
    const liveRef = R.useRef(null);
    const dayNum = Number(cycleDay) || 1;

    R.useEffect(() => {
      setCur(parseISO(valueISO || todayStr));
      setSelected(valueISO || todayStr);
    }, [valueISO, todayStr]);

    const minDate = HEYS.CycleUI?.addDaysIso?.(todayStr, -27) || todayStr;
    const y = cur.getFullYear();
    const m = cur.getMonth();
    const first = new Date(y, m, 1);
    const start = (first.getDay() + 6) % 7;
    const dim = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < start; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(new Date(y, m, d));

    const recalcText = (() => {
      const ordinal = HEYS.CycleUI?.formatCycleWeekBadge?.(dayNum) || `День ${dayNum}`;
      const human = selected ? HEYS.CycleUI?.formatShortHumanDate?.(selected) : '';
      const range = HEYS.CycleUI?.formatWeekRangeForMark?.(selected, dayNum) || '';
      return `${ordinal} — ${human}. ${range}`;
    })();

    R.useEffect(() => {
      if (liveRef.current) liveRef.current.textContent = recalcText;
    }, [recalcText]);

    const sheet = R.createElement('div', { className: 'cycle-date-picker-backdrop' },
      R.createElement('div', {
        className: 'cycle-date-picker-sheet',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': 'Когда это было',
        onKeyDown: (e) => { if (e.key === 'Escape') onClose?.(); },
      },
        R.createElement('div', { className: 'cycle-date-picker-sheet__head' },
          R.createElement('b', null, 'Когда это было'),
          R.createElement('span', null, cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' }))
        ),
        R.createElement('div', { className: 'cycle-date-picker-sheet__weekdays' },
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) =>
            R.createElement('span', { key: d }, d)
          )
        ),
        R.createElement('div', { className: 'cycle-date-picker-sheet__grid' },
          cells.map((dt, idx) => {
            if (!dt) return R.createElement('span', { key: 'e' + idx, className: 'cycle-date-picker-cell empty' });
            const dateStr = fmtDate(dt);
            const disabled = dateStr < minDate || dateStr > todayStr;
            const isSelected = dateStr === selected;
            const isToday = dateStr === todayStr;
            const speech = dt.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
            return R.createElement('button', {
              key: dateStr,
              type: 'button',
              className: [
                'cycle-date-picker-cell',
                disabled ? 'is-disabled' : '',
                isSelected ? 'is-selected' : '',
                isToday ? 'is-today' : '',
              ].join(' ').trim(),
              'aria-label': speech,
              'aria-selected': isSelected ? 'true' : 'false',
              'aria-disabled': disabled ? 'true' : undefined,
              tabIndex: disabled ? -1 : 0,
              onClick: disabled ? undefined : () => setSelected(dateStr),
            }, dt.getDate());
          })
        ),
        R.createElement('div', {
          className: 'cycle-date-picker-sheet__live',
          'aria-live': 'polite',
          ref: liveRef,
        }, recalcText),
        R.createElement('div', { className: 'cycle-v4-btns cycle-date-picker-sheet__actions' },
          R.createElement('button', {
            type: 'button',
            className: 'cycle-v4-btn cycle-v4-btn--secondary',
            onClick: () => onClose?.(),
          }, 'Отмена'),
          R.createElement('button', {
            type: 'button',
            className: 'cycle-v4-btn cycle-v4-btn--primary',
            onClick: () => onConfirm?.(selected),
          }, 'Подтвердить')
        )
      )
    );

    if (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined') {
      return ReactDOM.createPortal(sheet, document.body);
    }
    return sheet;
  }
  
  // Новый namespace
  HEYS.dayPickers = {
    DatePicker,
    Calendar,
    CycleDatePickerSheet,
  };

})(window);
