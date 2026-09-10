/** Stand · water-add — из water-add-v4-canvas-geometry / water-add-v4. */
export default {
  zone: 'water-add',
  cssFiles: [
    'styles/modules/002-ui-v4-palette-roles.css',
    'styles/modules/730-widgets-dashboard.css',
    'styles/modules/400-water-and-hydration.css',
  ],
  html: `
    <div class="widget-water widget-water--v4">
      <span class="widget-water__norm">из 2,0</span>
      <span class="widget-water__label">Вода</span>
      <span class="widget-water__numV">500</span>
      <div class="widget-water__fill"></div>
      <span class="widget-water__drop animate-always"></span>
    </div>
    <button type="button" class="water-fab-vol">250</button>
    <button type="button" class="water-fab-vol water-fab-vol--minus">−</button>
    <div class="water-review compact-card">
      <span class="water-review__ring-fact">1,5</span>
      <span class="water-review__ring-meta">л</span>
      <button type="button" class="water-review__chip--quick">+250</button>
    </div>
    <div class="water-custom-sheet widget-wd-sheet">
      <div class="water-custom-sheet__title">Свой объём</div>
      <div class="water-custom-sheet__stepper">
        <button type="button" class="water-custom-sheet__step water-custom-sheet__step--sub">−</button>
        <span class="water-custom-sheet__value">250</span>
        <span class="water-custom-sheet__unit">мл</span>
        <button type="button" class="water-custom-sheet__step water-custom-sheet__step--add">+</button>
      </div>
      <button type="button" class="water-custom-sheet__preset is-active">250</button>
      <button type="button" class="water-custom-sheet__confirm">Добавить</button>
    </div>
  `,
  watch: {
    'кнопка минус': '.water-fab-vol--minus',
    'Плитка воды': '.widget-water--v4',
    'Норма сверху': '.widget-water__norm',
    'Подпись «Вода»': '.widget-water__label',
    'Число объёма': '.widget-water__numV',
    'Заливка': '.widget-water__fill',
    'Чип FAB': '.water-fab-vol:not(.water-fab-vol--minus)',
    'Карточка «Кольцо»': '.water-review.compact-card',
    'Быстрый чип': '.water-review__chip--quick',
    'Лист своего объёма': '.water-custom-sheet',
    'Заголовок листа': '.water-custom-sheet__title',
    'Значение объёма': '.water-custom-sheet__value',
    'Пресет объёма': '.water-custom-sheet__preset.is-active',
    'Кнопка «Добавить»': '.water-custom-sheet__confirm',
  },
};
