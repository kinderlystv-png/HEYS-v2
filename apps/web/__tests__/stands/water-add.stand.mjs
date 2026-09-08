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
  `,
  watch: {
    'Плитка воды': '.widget-water--v4',
    'Норма сверху': '.widget-water__norm',
    'Подпись «Вода»': '.widget-water__label',
    'Число объёма': '.widget-water__numV',
    'Заливка': '.widget-water__fill',
    'Чип FAB': '.water-fab-vol:not(.water-fab-vol--minus)',
    'Карточка «Кольцо»': '.water-review.compact-card',
    'Быстрый чип': '.water-review__chip--quick',
  },
};
