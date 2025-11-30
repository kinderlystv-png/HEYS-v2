// heys_day_pickers.js — DatePicker and Calendar components

;(function(global){
  // heys_day_pickers.js — DatePicker и Calendar компоненты
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const ReactDOM = global.ReactDOM;
  
  // Импортируем утилиты из dayUtils с минимальными fallback (error-logging)
  const getDayUtils = () => HEYS.dayUtils || {};
  
  // Minimal fallback: log error and return safe default
  const warnMissing = (name) => { 
    console.error('[HEYS] dayUtils.' + name + ' not loaded before dayPickers'); 
  };

  // Компактный DatePicker с dropdown
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях (опционально)
  // getActiveDaysForMonth: (year, month) => Map — функция для загрузки данных при смене месяца
  function DatePicker({valueISO, onSelect, onRemove, activeDays, getActiveDaysForMonth}) {
    const utils = getDayUtils();
    // Minimal fallbacks with error logging
    const parseISO = utils.parseISO || ((s) => { warnMissing('parseISO'); return new Date(); });
    const todayISO = utils.todayISO || (() => { warnMissing('todayISO'); const d=new Date(); return d.toISOString().slice(0,10); });
    const fmtDate = utils.fmtDate || ((d) => { warnMissing('fmtDate'); return d.toISOString().slice(0,10); });
    const formatDateDisplay = utils.formatDateDisplay || (() => { warnMissing('formatDateDisplay'); return { label: 'День', sub: '' }; });
    
    const [isOpen, setIsOpen] = React.useState(false);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const [dropdownPos, setDropdownPos] = React.useState({ top: 0, right: 0 });
    const [tooltip, setTooltip] = React.useState(null); // { x, y, text }
    const [monthData, setMonthData] = React.useState(null); // Данные для текущего месяца календаря
    const wrapperRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    
    const y = cur.getFullYear(), m = cur.getMonth();
    
    // Загружаем данные при смене месяца
    React.useEffect(() => {
      if (getActiveDaysForMonth) {
        try {
          const data = getActiveDaysForMonth(y, m);
          setMonthData(data);
        } catch (e) {
          setMonthData(null);
        }
      }
    }, [y, m, getActiveDaysForMonth]);
    
    // Преобразуем activeDays в Map (fallback если нет getActiveDaysForMonth)
    const daysDataMap = React.useMemo(() => {
      // Приоритет: данные для текущего месяца → переданные activeDays
      if (monthData instanceof Map) return monthData;
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [monthData, activeDays]);
    
    // Функция для расчёта цвета фона — используем централизованный ratioZones
    const rz = HEYS.ratioZones;
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      return rz ? rz.getGradientColor(ratio, 0.35) : 'rgba(156, 163, 175, 0.35)';
    }
    
    // Функция для получения эмодзи статуса — используем ratioZones
    function getStatusEmoji(ratio) {
      return rz ? rz.getEmoji(ratio) : '';
    }
    
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
    
    // Вычисляем позицию при открытии
    React.useEffect(() => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 8,
          right: window.innerWidth - rect.right
        });
      }
    }, [isOpen]);
    
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
    const dateInfo = formatDateDisplay(valueISO || todayISO());
    
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
    
    return React.createElement('div', { className: 'date-picker', ref: wrapperRef },
      // Кнопка-триггер
      React.createElement('button', {
        ref: triggerRef,
        className: 'date-picker-trigger' + (isOpen ? ' open' : ''),
        onClick: () => setIsOpen(!isOpen)
      },
        React.createElement('span', { className: 'date-picker-icon' }, '📅'),
        React.createElement('span', { className: 'date-picker-text' },
          React.createElement('span', { className: 'date-picker-main' }, dateInfo.label),
          React.createElement('span', { className: 'date-picker-sub' }, dateInfo.sub)
        ),
        React.createElement('span', { className: 'date-picker-arrow' }, isOpen ? '▲' : '▼')
      ),
      // Backdrop и Dropdown через portal в body
      isOpen && ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { 
            className: 'date-picker-backdrop',
            onClick: () => { setIsOpen(false); setTooltip(null); }
          }),
          // Tooltip
          tooltip && React.createElement('div', {
            className: 'date-picker-tooltip',
            style: { left: tooltip.x + 'px', top: tooltip.y + 'px' }
          }, tooltip.text),
          React.createElement('div', { 
            className: 'date-picker-dropdown',
            style: { top: dropdownPos.top + 'px', right: dropdownPos.right + 'px' }
          },
        React.createElement('div', { className: 'date-picker-header' },
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m - 1, 1)) 
          }, '‹'),
          React.createElement('span', { className: 'date-picker-title' },
            cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
          ),
          React.createElement('button', { 
            className: 'date-picker-nav', 
            onClick: () => setCur(new Date(y, m + 1, 1)) 
          }, '›')
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
          cells.map((dt, i) => {
            if (dt == null) {
              return React.createElement('div', { key: 'e' + i, className: 'date-picker-day empty' });
            }
            const dateStr = fmtDate(dt);
            const dayData = daysDataMap.get(dateStr);
            const isSel = same(dt, sel);
            const isToday = same(dt, today);
            const bgColor = dayData ? getDayBgColor(dayData.ratio) : null;
            // Не показываем градиентный фон для сегодня и выбранного дня
            const cellStyle = bgColor && !isSel && !isToday ? { background: bgColor } : undefined;
            const statusEmoji = dayData ? getStatusEmoji(dayData.ratio) : '';
            
            return React.createElement('div', {
              key: dt.toISOString(),
              className: [
                'date-picker-day',
                isSel ? 'selected' : '',
                isToday ? 'today' : '',
                dayData ? 'has-data' : ''
              ].join(' ').trim(),
              style: cellStyle,
              onClick: () => { onSelect(dateStr); setIsOpen(false); setTooltip(null); },
              onMouseEnter: (e) => handleDayHover(e, dayData, dateStr),
              onMouseLeave: () => setTooltip(null)
            }, 
              React.createElement('span', { className: 'day-number' }, dt.getDate()),
              statusEmoji && React.createElement('span', { className: 'day-status' }, statusEmoji)
            );
          })
        ),
        // Streak индикатор
        streakInfo.count > 1 && React.createElement('div', { className: 'date-picker-streak' },
          '🔥 ', streakInfo.count, ' дней подряд в норме!'
        ),
        // Легенда цветов
        React.createElement('div', { className: 'date-picker-legend' },
          React.createElement('span', { className: 'legend-item good' }, '● норма'),
          React.createElement('span', { className: 'legend-item warn' }, '● мало'),
          React.createElement('span', { className: 'legend-item bad' }, '● переел')
        ),
        React.createElement('div', { className: 'date-picker-footer' },
          React.createElement('button', {
            className: 'date-picker-btn today-btn',
            onClick: () => { onSelect(todayISO()); setIsOpen(false); }
          }, '📍 Сегодня'),
          React.createElement('button', {
            className: 'date-picker-btn delete-btn',
            onClick: () => { onRemove(); setIsOpen(false); }
          }, '🗑️ Очистить')
        )
      )
    ), document.body)
    );
  }

  // Полноэкранный Calendar компонент
  // activeDays: Map<dateStr, {kcal, target, ratio}> — данные о заполненных днях
  function Calendar({valueISO,onSelect,onRemove,activeDays}){
    const utils = getDayUtils();
    // Minimal fallbacks with error logging
    const parseISO = utils.parseISO || ((s) => { warnMissing('parseISO'); return new Date(); });
    const todayISO = utils.todayISO || (() => { warnMissing('todayISO'); const d=new Date(); return d.toISOString().slice(0,10); });
    const fmtDate = utils.fmtDate || ((d) => { warnMissing('fmtDate'); return d.toISOString().slice(0,10); });
    
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
  
  // Новый namespace
  HEYS.dayPickers = {
    DatePicker,
    Calendar
  };

})(window);
