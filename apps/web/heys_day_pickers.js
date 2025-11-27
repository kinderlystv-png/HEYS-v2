// heys_day_pickers.js — DatePicker and Calendar components

;(function(global){
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  
  // Импортируем утилиты из dayUtils
  const getDayUtils = () => HEYS.dayUtils || {};

  // Компактный DatePicker с dropdown
  function DatePicker({valueISO, onSelect, onRemove}) {
    const utils = getDayUtils();
    const { parseISO, todayISO, fmtDate, formatDateDisplay } = utils;
    
    const [isOpen, setIsOpen] = React.useState(false);
    const [cur, setCur] = React.useState(parseISO(valueISO || todayISO()));
    const wrapperRef = React.useRef(null);
    
    React.useEffect(() => { setCur(parseISO(valueISO || todayISO())); }, [valueISO]);
    
    // Закрытие при клике вне
    React.useEffect(() => {
      function handleClickOutside(e) {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
          setIsOpen(false);
        }
      }
      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
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
    const isToday = sel.toDateString() === today.toDateString();
    
    return React.createElement('div', { className: 'date-picker', ref: wrapperRef },
      // Кнопка-триггер
      React.createElement('button', {
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
      // Dropdown с календарём
      isOpen && React.createElement('div', { className: 'date-picker-dropdown' },
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
        React.createElement('div', { className: 'date-picker-weekdays' },
          ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => 
            React.createElement('div', { key: d, className: 'date-picker-weekday' }, d)
          )
        ),
        React.createElement('div', { className: 'date-picker-days' },
          cells.map((dt, i) => dt == null
            ? React.createElement('div', { key: 'e' + i, className: 'date-picker-day empty' })
            : React.createElement('div', {
                key: dt.toISOString(),
                className: [
                  'date-picker-day',
                  same(dt, sel) ? 'selected' : '',
                  same(dt, today) ? 'today' : ''
                ].join(' ').trim(),
                onClick: () => { onSelect(fmtDate(dt)); setIsOpen(false); }
              }, dt.getDate())
          )
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
    );
  }

  // Полноэкранный Calendar компонент
  function Calendar({valueISO,onSelect,onRemove}){
    const utils = getDayUtils();
    const { parseISO, todayISO, fmtDate } = utils;
    
    const [cur,setCur]=React.useState(parseISO(valueISO||todayISO()));
    React.useEffect(()=>{ setCur(parseISO(valueISO||todayISO())); },[valueISO]);
    const y=cur.getFullYear(),m=cur.getMonth(),first=new Date(y,m,1),start=(first.getDay()+6)%7,dim=new Date(y,m+1,0).getDate();
    const cells=[]; for(let i=0;i<start;i++) cells.push(null); for(let d=1;d<=dim;d++) cells.push(new Date(y,m,d));
    function same(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
    const sel=parseISO(valueISO||todayISO()); const today=new Date(); today.setHours(12);
    return React.createElement('div',{className:'calendar card'},
      React.createElement('div',{className:'cal-head'},
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m-1,1))},'‹'),
        React.createElement('div',{className:'cal-title'},cur.toLocaleString('ru-RU',{month:'long',year:'numeric'})),
        React.createElement('button',{className:'cal-nav',onClick:()=>setCur(new Date(y,m+1,1))},'›')
      ),
      React.createElement('div',{className:'cal-grid cal-dow'},['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(d=>React.createElement('div',{key:d},d))),
      React.createElement('div',{className:'cal-grid'}, cells.map((dt,i)=> dt==null?React.createElement('div',{key:'e'+i}):React.createElement('div',{key:dt.toISOString(),className:['cal-cell',same(dt,sel)?'sel':'',same(dt,today)?'today':''].join(' ').trim(),onClick:()=>onSelect(fmtDate(dt))},dt.getDate()))),
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
