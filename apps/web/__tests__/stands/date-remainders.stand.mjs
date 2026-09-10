/** Stand · date-remainders — из date-remainders-v4-cell / polosa6-task106. */
export default {
  zone: 'date-remainders',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/000-base-and-gamification.css',
  ],
  html: `
    <div class="date-picker date-picker--v4">
      <button type="button" class="date-picker-trigger-lbl">7 авг</button>
      <button type="button" class="date-picker-day-nav"></button>
    </div>
    <div class="date-picker-sheet-overlay"></div>
    <div class="date-picker-sheet date-picker--v4">
      <div class="date-picker-sheet__card">
        <div class="date-picker-sheet-handle"></div>
        <button type="button" class="date-picker-sheet-month-nav"></button>
        <div class="date-picker-days">
          <button type="button" class="date-picker-day is-today">7</button>
          <button type="button" class="date-picker-day selected has-data">5</button>
          <button type="button" class="date-picker-day has-data">12</button>
        </div>
        <button type="button" class="date-picker-btn today-btn">Сегодня</button>
      </div>
    </div>
  
    <!-- Триггер без шторки: три тона по состоянию дня. -->
    <div class="date-picker date-picker--v4">
      <div class="date-picker-trigger date-picker-trigger--today">
        <button type="button" class="date-picker-trigger-lbl">
          <span class="date-picker-lbl-inner">Сегодня</span>
        </button>
      </div>
      <div class="date-picker-trigger date-picker-trigger--not-today">
        <button type="button" class="date-picker-trigger-lbl">
          <span class="date-picker-lbl-inner">Вчера</span>
        </button>
      </div>
      <div class="date-picker-trigger date-picker-trigger--night">
        <button type="button" class="date-picker-trigger-lbl">
          <span class="date-picker-lbl-inner">Ночь</span>
        </button>
      </div>
    </div>

    <!-- Легенда шторки: пять образцов. -->
    <div class="date-picker-legend">
      <span class="legend-item has-data"><span class="legend-swatch legend-swatch--dot"></span>есть записи</span>
      <span class="legend-item cycle"><span class="legend-swatch legend-swatch--cycle"></span>цикл</span>
      <span class="legend-item refeed"><span class="legend-swatch legend-swatch--refeed"></span>загрузка</span>
      <span class="legend-item today"><span class="legend-swatch legend-swatch--today">7</span>сегодня</span>
      <span class="legend-item selected"><span class="legend-swatch legend-swatch--selected"></span>выбран</span>
    </div>
`,
  watch: {
    'Триггер · сегодня': '.date-picker-trigger--today',
    'Триггер · не сегодня': '.date-picker-trigger--not-today',
    'Триггер · ночь': '.date-picker-trigger--night',
    'Легенда': '.date-picker-legend',
    'Легенда · есть записи': '.legend-item.has-data',
    'Легенда · образец точки': '.legend-swatch--dot',
    'Легенда · образец цикла': '.legend-swatch--cycle',
    'Легенда · образец загрузки': '.legend-swatch--refeed',
    'Легенда · образец сегодня': '.legend-swatch--today',
    'Легенда · образец выбран': '.legend-swatch--selected',
    'выбор даты': '.date-picker--v4',
    'Триггер даты': '.date-picker-trigger-lbl',
    'Навигация дня': '.date-picker-day-nav',
    'Оверлей шторки': '.date-picker-sheet-overlay',
    'Шторка': '.date-picker-sheet',
    'Карточка шторки': '.date-picker-sheet__card',
    'Ручка шторки': '.date-picker-sheet-handle',
    'Сегодняшняя клетка': '.date-picker-day.is-today',
    'Выбранная клетка': '.date-picker-day.selected',
    'Клетка с данными': '.date-picker-day.has-data:not(.selected)',
    'Кнопка «Сегодня»': '.date-picker-btn.today-btn',
  },
};
