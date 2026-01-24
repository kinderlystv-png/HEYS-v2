// heys_data_overview_v1.js — Таблица заполненности данных за 30 дней (для куратора)
// v1.0.0 | 2025-11-30

; (function (global) {
  const HEYS = global.HEYS = global.HEYS || {};
  const React = global.React;
  const { useState, useMemo, useCallback } = React;

  // ---------- Утилиты ----------
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  // Дни недели на русском
  const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  // ---------- Конфигурация полей ----------
  const TRACKED_FIELDS = [
    { key: 'weightMorning', icon: '⚖️', label: 'Вес', check: v => v > 0, format: v => v + ' кг' },
    { key: 'sleepStart', icon: '🛏️', label: 'Лёг', check: v => !!v, format: v => v },
    { key: 'sleepEnd', icon: '⏰', label: 'Встал', check: v => !!v, format: v => v },
    { key: 'sleepQuality', icon: '😴', label: 'Сон', check: v => v >= 1 && v <= 5, format: v => '★'.repeat(v) },
    { key: 'steps', icon: '👟', label: 'Шаги', check: v => v > 0, format: v => (+v).toLocaleString('ru-RU') },
    { key: 'waterMl', icon: '💧', label: 'Вода', check: v => v > 0, format: v => (v / 1000).toFixed(1) + ' л' },
    { key: 'dayScore', icon: '⭐', label: 'Оценка', check: v => v >= 1 && v <= 10, format: v => v + '/10' },
    { key: 'trainings', icon: '🏃', label: 'Тренировка', check: v => Array.isArray(v) && v.length > 0, format: v => v.length + ' шт' },
    { key: 'meals', icon: '🍽️', label: 'Еда', check: v => Array.isArray(v) && v.length > 0, format: v => v.length + ' приёмов' },
    { key: 'dayComment', icon: '💬', label: 'Коммент', check: v => !!v && String(v).trim().length > 0, format: v => String(v).slice(0, 20) + '...' },
  ];

  // ---------- Загрузка данных ----------
  function getOverviewData(clientId, daysCount = 30) {
    const today = new Date();
    const days = [];
    const U = HEYS.utils || {};
    const readStoredValue = (k, d) => {
      try {
        if (HEYS.store?.get) return HEYS.store.get(k, d);
        if (U.lsGet) return U.lsGet(k, d);
        const raw = localStorage.getItem(k);
        return raw ? JSON.parse(raw) : d;
      } catch (e) { return d; }
    };

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = fmtDate(d);

      // Используем lsGet с ключом 'heys_dayv2_' — он сам добавит clientId prefix!
      let dayData = {};
      try {
        dayData = readStoredValue('heys_dayv2_' + dateStr, {}) || {};
      } catch (e) {
        dayData = {};
      }

      // Проверяем каждое поле (dayData может быть null/undefined)
      const fields = {};
      let filledCount = 0;

      TRACKED_FIELDS.forEach(f => {
        const value = dayData ? dayData[f.key] : undefined;
        const isFilled = f.check(value);
        fields[f.key] = { value, filled: isFilled };
        if (isFilled) filledCount++;
      });

      days.push({
        date: dateStr,
        dayOfWeek: WEEKDAYS[d.getDay()],
        dayNum: d.getDate(),
        month: d.getMonth() + 1,
        fields,
        filledCount,
        filledPct: Math.round((filledCount / TRACKED_FIELDS.length) * 100)
      });
    }

    return days;
  }

  // ---------- Компоненты ----------

  // Ячейка таблицы
  // showEmpty = true если день активный (2+ полей) и нужно подсвечивать пропуски
  function DataCell({ field, fieldConfig, showEmpty }) {
    const { filled, value } = field;
    const title = filled ? fieldConfig.format(value) : 'Не заполнено';

    // Если день почти пустой (0-1 поле) — не подсвечиваем красным
    const cellClass = filled
      ? 'cell-filled'
      : (showEmpty ? 'cell-empty' : 'cell-neutral');

    return React.createElement('td', {
      className: cellClass,
      title: title
    }, filled ? '✓' : '—');
  }

  // Строка таблицы
  function DataRow({ day, onRowClick }) {
    const handleClick = useCallback(() => {
      if (onRowClick) onRowClick(day.date);
    }, [day.date, onRowClick]);

    // Форматируем дату: "30.11 Сб"
    const dateLabel = pad2(day.dayNum) + '.' + pad2(day.month) + ' ' + day.dayOfWeek;

    // Показывать красный фон пустых ячеек только если день активный (2+ заполненных поля)
    const showEmpty = day.filledCount >= 2;

    return React.createElement('tr', { onClick: handleClick },
      // Колонка даты (sticky)
      React.createElement('td', null, dateLabel),

      // Колонки полей
      ...TRACKED_FIELDS.map(f =>
        React.createElement(DataCell, {
          key: f.key,
          field: day.fields[f.key],
          fieldConfig: f,
          showEmpty: showEmpty
        })
      )
    );
  }

  // Заголовок таблицы
  function TableHeader() {
    return React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', { className: 'th-date' }, 'Дата'),
        ...TRACKED_FIELDS.map(f =>
          React.createElement('th', {
            key: f.key,
            className: 'th-vertical',
            title: f.label
          },
            React.createElement('span', { className: 'th-text' }, f.label)
          )
        )
      )
    );
  }

  // Пустое состояние
  function EmptyState() {
    return React.createElement('div', { className: 'data-overview-empty' },
      React.createElement('div', { className: 'data-overview-empty-icon' }, '📋'),
      React.createElement('div', { className: 'data-overview-empty-text' },
        'Клиент ещё не начал заполнять данные'
      ),
      React.createElement('div', { className: 'data-overview-empty-hint' },
        'Данные появятся после добавления первой записи'
      )
    );
  }

  // ---------- Главный компонент ----------
  function DataOverviewTab({ clientId, setTab, setSelectedDate }) {
    // Загружаем данные
    const days = useMemo(() => getOverviewData(clientId, 30), [clientId]);

    // Статистика
    const stats = useMemo(() => {
      let totalFilled = 0;
      let totalPossible = days.length * TRACKED_FIELDS.length;
      days.forEach(d => { totalFilled += d.filledCount; });
      return {
        filledPct: totalPossible > 0 ? Math.round((totalFilled / totalPossible) * 100) : 0,
        daysWithData: days.filter(d => d.filledCount > 0).length
      };
    }, [days]);

    // Обработчик клика на строку
    const handleRowClick = useCallback((dateStr) => {
      if (setSelectedDate) {
        // selectedDate должна быть строкой YYYY-MM-DD, не Date!
        setSelectedDate(dateStr);
      }
      if (setTab) {
        setTab('stats');
      }
    }, [setTab, setSelectedDate]);

    // Проверяем есть ли данные вообще
    const hasAnyData = stats.daysWithData > 0;

    if (!hasAnyData) {
      return React.createElement('div', { className: 'data-overview-tab' },
        React.createElement(EmptyState)
      );
    }

    return React.createElement('div', { className: 'data-overview-tab' },
      // Заголовок
      React.createElement('div', { className: 'data-overview-header' },
        React.createElement('div', { className: 'data-overview-title' },
          '📋 Обзор данных за 30 дней'
        ),
        React.createElement('div', { className: 'data-overview-total' },
          'Заполнено: ' + stats.filledPct + '%'
        )
      ),

      // Таблица
      React.createElement('div', { className: 'data-overview-scroll' },
        React.createElement('table', { className: 'data-overview-table' },
          React.createElement(TableHeader),
          React.createElement('tbody', null,
            days.map(day =>
              React.createElement(DataRow, {
                key: day.date,
                day: day,
                onRowClick: handleRowClick
              })
            )
          )
        )
      ),

      // Подсказка
      React.createElement('div', { className: 'data-overview-hint' },
        'Нажмите на строку, чтобы перейти к дню'
      )
    );
  }

  // ---------- Экспорт ----------
  HEYS.DataOverviewTab = DataOverviewTab;

  // Для отладки
  if (typeof window !== 'undefined') {
    window.debugOverviewData = (clientId) => {
      const data = getOverviewData(clientId, 7);
      console.table(data.map(d => ({
        date: d.date,
        filled: d.filledCount + '/' + TRACKED_FIELDS.length,
        pct: d.filledPct + '%'
      })));
      return data;
    };
  }

})(typeof window !== 'undefined' ? window : global);
