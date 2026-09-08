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
  `,
  watch: {
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
