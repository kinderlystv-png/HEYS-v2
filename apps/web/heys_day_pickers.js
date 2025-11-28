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
  function DatePicker({valueISO, onSelect, onRemove, activeDays}) {
    const utils = getDayUtils();
    // Minimal fallbacks with error logging
    const parseISO = utils.parseISO || ((s) => { warnMissing('parseISO'); return new Date(); });
    const todayISO = utils.todayISO || (() => { warnMissing('todayISO'); const d=new Date(); return d.toISOString().slice(0,10); });
    const fmtDate = utils.fmtDate || ((d) => { warnMissing('fmtDate'); return d.toISOString().slice(0,10); });
    const formatDateDisplay = utils.formatDateDisplay || (() => { warnMissing('formatDateDisplay'); return { label: 'День', sub: '' }; });
    
    // Преобразуем activeDays в Map
    const daysDataMap = React.useMemo(() => {
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [activeDays]);
    
    // Функция для расчёта цвета фона (асимметричная логика)
    // Недоел = хорошо (зелёный), Переел = плохо (красный)
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      
      if (ratio > 1) {
        // ПЕРЕЕЛ — плохо (красные оттенки)
        const overeat = ratio - 1;
        if (overeat <= 0.05) return 'rgba(234, 179, 8, 0.25)';
        else if (overeat <= 0.15) return 'rgba(249, 115, 22, 0.3)';
        else return 'rgba(239, 68, 68, 0.35)';
      } else {
        // НЕДОЕЛ или в норме — хорошо (зелёные оттенки)
        const undereat = 1 - ratio;
        if (undereat <= 0.1) return 'rgba(34, 197, 94, 0.4)';
        else if (undereat <= 0.25) return 'rgba(34, 197, 94, 0.25)';
        else if (undereat <= 0.4) return 'rgba(234, 179, 8, 0.25)';
        else return 'rgba(249, 115, 22, 0.25)';
      }
    }
    
    // Функция для получения эмодзи статуса
    function getStatusEmoji(ratio) {
      if (!ratio || ratio <= 0) return '';
      if (ratio >= 0.8 && ratio <= 1.1) return '✓'; // в норме
      return ''; // остальные без эмодзи
    }
    
    // Вычисляем streak (серию хороших дней)
    const streakInfo = React.useMemo(() => {
      if (daysDataMap.size === 0) return { count: 0, isActive: false };
      
      const todayStr = todayISO();
      let count = 0;
      let checkDate = new Date();
      checkDate.setHours(12);
      
      // Проверяем дни назад от сегодня
      for (let i = 0; i < 30; i++) {
        const dateStr = fmtDate(checkDate);
        const dayData = daysDataMap.get(dateStr);
        
        // Хороший день = ratio от 0.75 до 1.15
        if (dayData && dayData.ratio >= 0.75 && dayData.ratio <= 1.15) {
          count++;
        } else if (i > 0) { // Первый день (сегодня) может быть без данных
          break;
        }
        
        checkDate.setDate(checkDate.getDate() - 1);
      }
      
      return { count, isActive: count > 0 };
    }, [daysDataMap, todayISO, fmtDate]);
    
    const [isOpen, setIsOpen] = React.useState(false);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const [dropdownPos, setDropdownPos] = React.useState({ top: 0, right: 0 });
    const [tooltip, setTooltip] = React.useState(null); // { x, y, text }
    const wrapperRef = React.useRef(null);
    const triggerRef = React.useRef(null);
    
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
    
    const y = cur.getFullYear(), m = cur.getMonth();
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
    const today = new Date(); today.setHours(12);
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
    const sel=parseISO(valueISO||todayISO()); const today=new Date(); today.setHours(12);
    
    // Преобразуем activeDays в Map для быстрого поиска
    const daysDataMap = React.useMemo(() => {
      if (activeDays instanceof Map) return activeDays;
      return new Map();
    }, [activeDays]);
    
    // Проверка является ли день "успешным" (зелёным)
    function isGoodDay(ratio) {
      return ratio && ratio > 0.6 && ratio <= 1.1;
    }
    
    // Функция для расчёта цвета фона (асимметричная логика)
    // Недоел = хорошо (зелёный), Переел = плохо (красный)
    function getDayBgColor(ratio) {
      if (!ratio || ratio <= 0) return null;
      
      if (ratio > 1) {
        // ПЕРЕЕЛ — плохо (красные оттенки)
        const overeat = ratio - 1; // насколько переел (0.1 = 10%)
        if (overeat <= 0.05) return 'rgba(234, 179, 8, 0.25)';      // +5% — жёлтый (почти норма)
        else if (overeat <= 0.15) return 'rgba(249, 115, 22, 0.3)'; // +15% — оранжевый
        else return 'rgba(239, 68, 68, 0.35)';                      // >15% — красный
      } else {
        // НЕДОЕЛ или в норме — хорошо (зелёные оттенки)
        const undereat = 1 - ratio; // насколько недоел (0.1 = 10%)
        if (undereat <= 0.1) return 'rgba(34, 197, 94, 0.4)';       // до -10% — ярко-зелёный (идеально)
        else if (undereat <= 0.25) return 'rgba(34, 197, 94, 0.25)';// до -25% — зелёный (хорошо)
        else if (undereat <= 0.4) return 'rgba(234, 179, 8, 0.25)'; // до -40% — жёлтый (маловато)
        else return 'rgba(249, 115, 22, 0.25)';                     // >40% — оранжевый (сильно мало)
      }
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
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m+1,1))},'›')
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
